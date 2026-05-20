export type ProviderFieldTarget = "configJson" | "secretJson";

export type ProviderFieldDefinition = {
  readonly key: string;
  readonly label: string;
  readonly target: ProviderFieldTarget;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly password?: boolean;
};

export type ProviderFieldPreset = {
  readonly providerCode: string;
  readonly helpText?: string;
  readonly fields: readonly ProviderFieldDefinition[];
};

const keepExistingSecretPlaceholder = "留空则保持现有密钥不变";

export const providerFieldPresets = [
  {
    providerCode: "deepseek",
    helpText: "用于生成摄影天气智能解读；仅在 ENABLE_REAL_DEEPSEEK=true 时允许本地真实开发调用。",
    fields: [
      {
        key: "apiKey",
        label: "DeepSeek API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "baseUrl",
        label: "DeepSeek Base URL",
        target: "configJson",
        placeholder: "https://api.deepseek.com",
      },
      {
        key: "defaultModel",
        label: "默认模型",
        target: "configJson",
        placeholder: "deepseek-chat",
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
      "用于地点搜索、地理编码和逆地理编码；仅在 ENABLE_REAL_AMAP=true 时允许本地真实开发调用。",
    fields: [
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
