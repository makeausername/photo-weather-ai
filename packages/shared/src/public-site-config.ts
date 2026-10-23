export const defaultPublicSiteConfig = {
  name: "逐光天气",
  baseUrl: "https://zhuguangweather.com",
  language: "zh-CN",
  timezone: "Asia/Shanghai",
};
export type PublicSiteConfig = typeof defaultPublicSiteConfig;

export function validatePublicSiteSetting(key: string, value: unknown): void {
  if (!["site.name", "site.baseUrl", "locale.defaultLanguage", "locale.defaultTimezone"].includes(key)) return;
  if (typeof value !== "string" || !value.trim()) throw new Error("设置不能为空。");
  if (key === "site.name" && value.trim().length > 40) throw new Error("网站名称不能超过 40 个字。");
  if (key === "site.baseUrl") {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("请填写不含账号、参数或片段的 HTTP / HTTPS 网站地址。");
  }
  if (key === "locale.defaultLanguage" && value !== "zh-CN") throw new Error("当前界面仅支持简体中文（zh-CN）。");
  if (key === "locale.defaultTimezone") {
    try { new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format(); }
    catch { throw new Error("请输入有效时区，例如 Asia/Shanghai。"); }
  }
}
