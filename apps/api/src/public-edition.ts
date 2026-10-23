/** Retired routes stay closed even when old billing/provider settings exist. */
export function isRetiredPublicRoute(path: string): boolean {
  return (
    /^\/(billing|account)(\/|$)/.test(path) ||
    /^\/auth\/(register|login\/sms|forgot-password|reset-password)(\/|$)/.test(path) ||
    /^\/captcha(\/|$)/.test(path)
  );
}

export function isRetiredProviderRoute(path: string): boolean {
  const match = /^\/admin\/providers\/([^/]+)\/([^/]+)\/test-connection$/.exec(path);
  return Boolean(
    match &&
      !(
        (match[1] === "weather" && ["qweather", "open_meteo"].includes(match[2]!)) ||
        (match[1] === "geo" && match[2] === "amap")
      ),
  );
}
