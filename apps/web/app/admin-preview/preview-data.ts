import type { adminApiFetch, SafeProviderConfig, SafeSystemSetting } from "../admin/admin-api";
const timestamp = "2026-10-23T00:00:00.000Z";
const providers: SafeProviderConfig[] = [
  {
    id: "preview-qweather",
    providerType: "weather",
    providerCode: "qweather",
    displayName: "和风天气",
    enabled: false,
    priority: 10,
    configJson: { apiHost: "", language: "zh", unit: "m", realCallEnabled: false },
    maskedSecretJson: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "preview-open-meteo",
    providerType: "weather",
    providerCode: "open_meteo",
    displayName: "Open-Meteo",
    enabled: true,
    priority: 20,
    configJson: {
      mode: "free",
      baseUrl: "https://api.open-meteo.com",
      modelList: ["best_match", "gfs_seamless"],
      realCallEnabled: true,
    },
    maskedSecretJson: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "preview-amap",
    providerType: "geo",
    providerCode: "amap",
    displayName: "高德地图",
    enabled: false,
    priority: 10,
    configJson: { realCallEnabled: false },
    maskedSecretJson: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
const settings: SafeSystemSetting[] = [
  {
    key: "site.name",
    valueJson: "逐光天气",
    valueType: "string",
    group: "site",
    label: "网站名称",
  },
  {
    key: "site.baseUrl",
    valueJson: "http://127.0.0.1:3100",
    valueType: "string",
    group: "site",
    label: "网站地址",
  },
  {
    key: "locale.defaultLanguage",
    valueJson: "zh-CN",
    valueType: "string",
    group: "locale",
    label: "默认语言",
  },
  {
    key: "locale.defaultTimezone",
    valueJson: "Asia/Shanghai",
    valueType: "string",
    group: "locale",
    label: "默认时区",
  },
].map((item) => ({
  ...item,
  id: `preview-${item.key}`,
  description: "仅用于本地界面预览",
  isPublic: true,
  isSecret: false,
  isEditable: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}));
/** No fall-through to fetch: unsupported reads and ALL writes fail closed. */
export const previewAdminRequest: typeof adminApiFetch = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  if ((init.method ?? "GET").toUpperCase() !== "GET")
    throw new Error("本地只读预览不会保存配置或执行任务。请在正式后台登录后操作。");
  const url = new URL(path, "http://preview.invalid");
  let result: unknown;
  switch (url.pathname) {
    case "/admin/providers":
      result = {
        providers: providers.filter(
          (p) =>
            !url.searchParams.has("providerType") ||
            p.providerType === url.searchParams.get("providerType"),
        ),
        realDevCallFlags: { amap: false, qweather: false, openMeteo: true, meteoblue: false },
      };
      break;
    case "/admin/settings":
      result = { settings };
      break;
    case "/admin/audit-logs":
      result = { logs: [] };
      break;
    case "/admin/calibration":
      result = {
        overview: { totalReplayRuns: 0, totalHistoricalSamples: 0, totalObservedOutcomes: 0 },
        targets: ["general", "cloud_sea", "glow", "astro"],
        minimumHintSampleCount: 10,
        stats: [],
        recentResults: [],
        outcomes: [],
      };
      break;
    case "/admin/calibration/replay-results":
      result = { results: [], outcomes: [], comparisons: [] };
      break;
    default:
      throw new Error("此数据不在预览范围内；预览不发起真实请求。");
  }
  return structuredClone(result) as T;
};
