const endpoints = new Map([
  ["v4/map/styles", "https://webapi.amap.com"],
  ["v3/place/text", "https://restapi.amap.com"],
  ["v3/place/around", "https://restapi.amap.com"],
  ["v3/assistant/inputtips", "https://restapi.amap.com"],
  ["v3/geocode/regeo", "https://restapi.amap.com"],
]);

// Restrict the SDK proxy to map/POI services; never expose a general upstream proxy.
export async function proxyAmap(
  request: Request,
  path: string[],
  env = process.env,
  fetcher = fetch,
) {
  const key = env.AMAP_JS_API_KEY?.trim();
  const secret = env.AMAP_SECURITY_JS_CODE?.trim();
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!key || !secret) return Response.json({ error: "地图服务未配置" }, { status: 503, headers });
  const target = path.join("/");
  const origin = endpoints.get(target);
  if (!origin) return Response.json({ error: "不支持的地图接口" }, { status: 404, headers });
  const input = new URL(request.url);
  // JSONP can be executed by the SDK; limit callbacks to identifiers/member expressions.
  const callback = input.searchParams.get("callback");
  if (callback && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(callback)) {
    return Response.json({ error: "无效回调" }, { status: 400, headers });
  }
  const url = new URL(`/${target}`, origin);
  url.search = input.search;
  url.searchParams.set("key", key);
  url.searchParams.set("jscode", secret);
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Upstream unavailable");
    return new Response(await response.arrayBuffer(), {
      headers: {
        ...headers,
        "Content-Type": callback
          ? "application/javascript; charset=utf-8"
          : response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    // Do not return upstream URLs/errors containing credentials.
    return Response.json({ error: "地图服务暂时不可用" }, { status: 502, headers });
  }
}
