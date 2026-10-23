import { isIP } from "node:net";

export function resolveTrustedProxy(env: NodeJS.ProcessEnv): boolean | string[] {
  const entries = env.API_TRUSTED_PROXIES?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (entries?.length) {
    for (const entry of entries) {
      const [address, prefix, extra] = entry.split("/");
      const version = isIP(address ?? "");
      if (
        !version ||
        extra !== undefined ||
        (prefix !== undefined &&
          (!/^\d+$/.test(prefix) ||
            Number(prefix) < 1 ||
            Number(prefix) > (version === 4 ? 32 : 128)))
      ) {
        throw new Error("API_TRUSTED_PROXIES 必须是明确的 IP 或 CIDR，不能信任所有来源。");
      }
    }
    return entries;
  }
  if (env.API_TRUST_PROXY === "true") {
    if (env.NODE_ENV === "production")
      throw new Error("生产环境必须配置 API_TRUSTED_PROXIES，禁止信任所有代理。");
    return true;
  }
  return false;
}
