import { describe, expect, it, vi, afterEach } from "vitest";
import Fastify from "fastify";
import type { ProviderConfigRecord } from "@photo-weather/db";
import { mapCredentials, publicMapConfig, registerMapRoutes } from "../map-routes.js";
import { proxyAmap } from "../amap-map-proxy.js";

const stored = vi.hoisted(() => ({ value: null as ProviderConfigRecord | null }));
vi.mock("@photo-weather/db", () => ({ getRuntimeProviderConfig: vi.fn(async () => stored.value) }));
const keys = { AMAP_JS_API_KEY: "public-js-key", AMAP_SECURITY_JS_CODE: "server-only-secret" };
const provider = (enabled = true, realCallEnabled = true) =>
  ({
    enabled,
    configJson: { realCallEnabled },
    secretJson: {
      apiKey: "old-web-service-key",
      jsApiKey: keys.AMAP_JS_API_KEY,
      securityJsCode: keys.AMAP_SECURITY_JS_CODE,
    },
  }) as unknown as ProviderConfigRecord;
afterEach(() => {
  stored.value = null;
});

describe("Amap map configuration", () => {
  it("uses the existing provider record and never substitutes a Web Service key for a JS key", () => {
    expect(mapCredentials(provider(), {})).toEqual(keys);
    expect(mapCredentials({ ...provider(), secretJson: { apiKey: "old-key" } }, {})).toEqual({
      AMAP_JS_API_KEY: "",
      AMAP_SECURITY_JS_CODE: "",
    });
  });
  it("honors disabled provider and real-call switches even when environment credentials exist", () => {
    for (const record of [provider(false), provider(true, false)]) {
      expect(mapCredentials(record, { ...keys, ENABLE_REAL_AMAP: "true" }).AMAP_JS_API_KEY).toBe(
        "",
      );
    }
  });
  it("never enables the local preview provider in production", () => {
    const empty = { AMAP_JS_API_KEY: "", AMAP_SECURITY_JS_CODE: "" };
    expect(
      publicMapConfig(empty, { NODE_ENV: "production", LOCAL_MAP_PREVIEW: "true" }),
    ).toMatchObject({ provider: "amap", amapKey: null, tileUrl: "" });
    expect(
      publicMapConfig(empty, { NODE_ENV: "development", LOCAL_MAP_PREVIEW: "true" }).provider,
    ).toBe("osm");
    expect(
      publicMapConfig(keys, { NODE_ENV: "development", LOCAL_MAP_PREVIEW: "true" }).provider,
    ).toBe("amap");
  });
  it("serves saved admin configuration anonymously without exposing service keys or security codes", async () => {
    stored.value = provider();
    const app = Fastify();
    registerMapRoutes(app, { env: { NODE_ENV: "production" } });
    try {
      const response = await app.inject("/maps/config");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ provider: "amap", amapKey: "public-js-key" });
      expect(response.body).not.toContain("server-only-secret");
      expect(response.body).not.toContain("old-web-service-key");
      expect(response.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });
});

describe("Amap SDK proxy", () => {
  it("injects credentials only at the allowed upstream, overriding supplied values", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{"status":"1"}', { headers: { "content-type": "application/json" } }),
    );
    const response = await proxyAmap(
      new Request(
        "http://local/maps/_AMapService/v3/place/text?key=attacker&jscode=attacker&keywords=mountain",
      ),
      ["v3", "place", "text"],
      keys,
      fetcher,
    );
    expect(response.status).toBe(200);
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.origin).toBe("https://restapi.amap.com");
    expect(url.searchParams.get("jscode")).toBe(keys.AMAP_SECURITY_JS_CODE);
    expect(url.searchParams.get("key")).toBe(keys.AMAP_JS_API_KEY);
    expect(await response.text()).not.toContain(keys.AMAP_SECURITY_JS_CODE);
  });
  it("blocks unconfigured requests, weather paths, traversal and injected JSONP callbacks", async () => {
    const fetcher = vi.fn();
    expect(
      (await proxyAmap(new Request("http://local/"), ["v3", "place", "text"], {}, fetcher)).status,
    ).toBe(503);
    for (const path of [
      ["v3", "weather", "weatherInfo"],
      ["..", "v3", "place", "text"],
      ["https:", "evil.example"],
    ]) {
      expect((await proxyAmap(new Request("http://local/"), path, keys, fetcher)).status).toBe(404);
    }
    expect(
      (
        await proxyAmap(
          new Request("http://local/?callback=alert(1)"),
          ["v3", "place", "text"],
          keys,
          fetcher,
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sanitizes upstream failures without leaking request credentials", async () => {
    const response = await proxyAmap(
      new Request("http://local/"),
      ["v4", "map", "styles"],
      keys,
      vi.fn(async () => {
        throw new Error(`failed jscode=${keys.AMAP_SECURITY_JS_CODE}`);
      }),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(keys.AMAP_SECURITY_JS_CODE);
  });
});
