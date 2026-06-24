export type AdminSettingValueType =
  | "boolean"
  | "number"
  | "prompt"
  | "secret"
  | "select"
  | "string"
  | "url";

export type AdminSettingScope = "public" | "server";

export type AdminSettingCategory =
  | "billing"
  | "deployment"
  | "geo"
  | "prompts"
  | "scoring"
  | "storage"
  | "weather";

export type AdminSettingDefinition = {
  readonly key: string;
  readonly label: string;
  readonly category: AdminSettingCategory;
  readonly valueType: AdminSettingValueType;
  readonly scope: AdminSettingScope;
  readonly envVar?: string;
  readonly defaultValue?: string | number | boolean;
  readonly options?: readonly string[];
  readonly encryptedAtRest: boolean;
};

export const adminSettingDefinitions = [
  {
    key: "geo.amap.apiKey",
    label: "Amap API key",
    category: "geo",
    valueType: "secret",
    scope: "server",
    envVar: "AMAP_API_KEY",
    encryptedAtRest: true,
  },
  {
    key: "weather.qweather.apiKey",
    label: "QWeather API key",
    category: "weather",
    valueType: "secret",
    scope: "server",
    envVar: "QWEATHER_API_KEY",
    encryptedAtRest: true,
  },
  {
    key: "weather.openMeteo.apiKey",
    label: "Open-Meteo API key",
    category: "weather",
    valueType: "secret",
    scope: "server",
    envVar: "OPEN_METEO_API_KEY",
    encryptedAtRest: true,
  },
  {
    key: "storage.provider",
    label: "Storage provider",
    category: "storage",
    valueType: "select",
    scope: "server",
    envVar: "STORAGE_PROVIDER",
    defaultValue: "local",
    options: ["local", "aliyun_oss", "tencent_cos", "s3"],
    encryptedAtRest: false,
  },
  {
    key: "storage.aliyun.accessKeyId",
    label: "Aliyun OSS access key ID",
    category: "storage",
    valueType: "secret",
    scope: "server",
    envVar: "ALIYUN_OSS_ACCESS_KEY_ID",
    encryptedAtRest: true,
  },
  {
    key: "storage.aliyun.accessKeySecret",
    label: "Aliyun OSS access key secret",
    category: "storage",
    valueType: "secret",
    scope: "server",
    envVar: "ALIYUN_OSS_ACCESS_KEY_SECRET",
    encryptedAtRest: true,
  },
  {
    key: "storage.tencent.secretId",
    label: "Tencent COS secret ID",
    category: "storage",
    valueType: "secret",
    scope: "server",
    envVar: "TENCENT_COS_SECRET_ID",
    encryptedAtRest: true,
  },
  {
    key: "storage.tencent.secretKey",
    label: "Tencent COS secret key",
    category: "storage",
    valueType: "secret",
    scope: "server",
    envVar: "TENCENT_COS_SECRET_KEY",
    encryptedAtRest: true,
  },
  {
    key: "storage.s3.accessKeyId",
    label: "S3 access key ID",
    category: "storage",
    valueType: "secret",
    scope: "server",
    envVar: "S3_ACCESS_KEY_ID",
    encryptedAtRest: true,
  },
  {
    key: "storage.s3.secretAccessKey",
    label: "S3 secret access key",
    category: "storage",
    valueType: "secret",
    scope: "server",
    envVar: "S3_SECRET_ACCESS_KEY",
    encryptedAtRest: true,
  },
  {
    key: "scoring.weights.cloudCover",
    label: "Cloud-cover scoring weight",
    category: "scoring",
    valueType: "number",
    scope: "server",
    defaultValue: 0.22,
    encryptedAtRest: false,
  },
  {
    key: "scoring.weights.visibility",
    label: "Visibility scoring weight",
    category: "scoring",
    valueType: "number",
    scope: "server",
    defaultValue: 0.2,
    encryptedAtRest: false,
  },
  {
    key: "prompts.forecastAnalysis",
    label: "Forecast analysis prompt",
    category: "prompts",
    valueType: "prompt",
    scope: "server",
    encryptedAtRest: false,
  },
  {
    key: "billing.enabled",
    label: "Billing enabled",
    category: "billing",
    valueType: "boolean",
    scope: "server",
    defaultValue: false,
    encryptedAtRest: false,
  },
  {
    key: "deployment.publicBaseUrl",
    label: "Public base URL",
    category: "deployment",
    valueType: "url",
    scope: "public",
    encryptedAtRest: false,
  },
] as const satisfies readonly AdminSettingDefinition[];
