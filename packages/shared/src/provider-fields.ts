export type ProviderFieldTarget = "configJson" | "secretJson";

export type ProviderFieldControl = "text" | "select" | "number" | "boolean";

export type ProviderFieldOption = {
  readonly value: string;
  readonly label: string;
};

export type ProviderFieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly target: ProviderFieldTarget;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly password?: boolean;
  readonly control?: ProviderFieldControl;
  readonly options?: readonly ProviderFieldOption[];
  readonly advanced?: boolean;
  readonly defaultValue?: string | number | boolean;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
};

export type ProviderFieldPreset = {
  readonly providerCode: string;
  readonly helpText?: string;
  readonly fields: readonly ProviderFieldDefinition[];
};

export const deepSeekDefaultModel = "deepseek-chat";

export const deepSeekModelOptions = [
  {
    value: "deepseek-chat",
    label: "deepseek-chat: 通用分析，推荐",
  },
  {
    value: "deepseek-reasoner",
    label: "deepseek-reasoner: 深度推理，成本和延迟更高",
  },
] as const satisfies readonly ProviderFieldOption[];

const deepSeekModelValues = new Set<string>(deepSeekModelOptions.map((option) => option.value));

export function normalizeDeepSeekModel(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && deepSeekModelValues.has(trimmed) ? trimmed : deepSeekDefaultModel;
}

const keepExistingSecretPlaceholder = "留空则保持现有密钥不变";

export const providerFieldPresets = [
  {
    providerCode: "deepseek",
    helpText:
      "用于生成摄影天气智能解读。普通配置只需要填写 API Key、选择模型、启用服务商和真实调用。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "启用后，手动生成智能解读和测试连接会请求 DeepSeek 服务。",
      },
      {
        key: "defaultModel",
        label: "模型选择",
        target: "configJson",
        control: "select",
        options: deepSeekModelOptions,
        defaultValue: deepSeekDefaultModel,
      },
      {
        key: "apiKey",
        label: "DeepSeek API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "baseUrl",
        label: "Base URL",
        target: "configJson",
        placeholder: "https://api.deepseek.com",
        defaultValue: "https://api.deepseek.com",
        advanced: true,
      },
      {
        key: "temperature",
        label: "Temperature",
        target: "configJson",
        control: "number",
        defaultValue: 0.2,
        min: 0,
        max: 2,
        step: 0.1,
        advanced: true,
      },
      {
        key: "maxTokens",
        label: "Max Tokens",
        target: "configJson",
        control: "number",
        defaultValue: 1200,
        min: 128,
        max: 8192,
        step: 1,
        advanced: true,
      },
      {
        key: "jsonOutputEnabled",
        label: "JSON Output enabled",
        target: "configJson",
        control: "boolean",
        defaultValue: true,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "qweather",
    helpText: "用于后续天气数据获取，当前不会在本地测试中触发真实调用。",
    fields: [
      {
        key: "apiKey",
        label: "和风天气 API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "apiHost",
        label: "API Host",
        target: "configJson",
        placeholder: "https://devapi.qweather.com",
      },
    ],
  },
  {
    providerCode: "open_meteo",
    helpText: "用于后续云层细分和多模型交叉验证，当前不会在本地测试中触发真实调用。",
    fields: [
      {
        key: "apiKey",
        label: "Open-Meteo API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "customerEndpoint",
        label: "Customer Endpoint",
        target: "configJson",
        placeholder: "https://customer-api.open-meteo.com",
      },
    ],
  },
  {
    providerCode: "amap",
    helpText:
      "高德 Web 服务 Key 用于地点搜索、地理编码和逆地理编码。启用真实调用后，前台地点搜索会请求高德地图服务。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "启用后，前台地点搜索和测试连接会请求高德地图服务。",
      },
      {
        key: "apiKey",
        label: "高德 Web 服务 Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "baseUrl",
        label: "高德 Web 服务 Base URL",
        target: "configJson",
        placeholder: "https://restapi.amap.com",
        defaultValue: "https://restapi.amap.com",
        advanced: true,
      },
    ],
  },
  {
    providerCode: "aliyun_oss",
    helpText: "用于后续阿里云 OSS 存储接入，当前不会在本地测试中触发真实上传。",
    fields: [
      {
        key: "accessKeyId",
        label: "Access Key ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "accessKeySecret",
        label: "Access Key Secret",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      { key: "bucket", label: "Bucket", target: "configJson" },
      { key: "region", label: "Region", target: "configJson" },
      { key: "endpoint", label: "Endpoint", target: "configJson" },
    ],
  },
  {
    providerCode: "tencent_cos",
    helpText: "用于后续腾讯云 COS 存储接入，当前不会在本地测试中触发真实上传。",
    fields: [
      {
        key: "secretId",
        label: "Secret ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "secretKey",
        label: "Secret Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      { key: "bucket", label: "Bucket", target: "configJson" },
      { key: "region", label: "Region", target: "configJson" },
    ],
  },
  {
    providerCode: "s3_compatible",
    helpText: "用于后续 S3 兼容存储接入，当前不会在本地测试中触发真实上传。",
    fields: [
      {
        key: "accessKeyId",
        label: "Access Key ID",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "secretAccessKey",
        label: "Secret Access Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      { key: "bucket", label: "Bucket", target: "configJson" },
      { key: "region", label: "Region", target: "configJson" },
      { key: "endpoint", label: "Endpoint", target: "configJson" },
    ],
  },
  {
    providerCode: "local_storage",
    helpText: "用于本地文件保存路径配置，当前不会调用外部存储服务。",
    fields: [
      {
        key: "basePath",
        label: "本地保存路径",
        target: "configJson",
        placeholder: "data/uploads",
      },
      {
        key: "publicBaseUrl",
        label: "公开访问地址",
        target: "configJson",
        placeholder: "https://example.com/uploads",
      },
    ],
  },
] as const satisfies readonly ProviderFieldPreset[];

export function getProviderFieldPreset(providerCode: string): ProviderFieldPreset | undefined {
  return providerFieldPresets.find((preset) => preset.providerCode === providerCode);
}
