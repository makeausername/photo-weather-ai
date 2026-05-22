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

export const deepSeekAnalysisModes = ["fast", "professional"] as const;

export type DeepSeekAnalysisMode = (typeof deepSeekAnalysisModes)[number];

export type DeepSeekReasoningEffort = "none" | "low" | "medium" | "high";

export type DeepSeekModeRuntimeDefaults = {
  readonly analysisMode: DeepSeekAnalysisMode;
  readonly model: string;
  readonly responseFormat: "json_object";
  readonly temperature: number;
  readonly maxTokens: number;
  readonly thinkingEnabled: boolean;
  readonly reasoningEffort: DeepSeekReasoningEffort;
  readonly modeLabelZh: string;
};

export const deepSeekDefaultModel = "deepseek-v4-flash";

export const deepSeekProfessionalModel = "deepseek-v4-pro";

export const deepSeekResponseFormat = "json_object";

export const deepSeekModelOptions = [
  {
    value: "deepseek-v4-flash",
    label: "deepseek-v4-flash：快速模式，推荐",
  },
  {
    value: "deepseek-v4-pro",
    label: "deepseek-v4-pro：专业模式，适合复杂分析",
  },
] as const satisfies readonly ProviderFieldOption[];

export const deepSeekAnalysisModeOptions = [
  {
    value: "fast",
    label: "快速模式（deepseek-v4-flash，推荐）",
  },
  {
    value: "professional",
    label: "专业模式（deepseek-v4-pro，适合复杂分析）",
  },
] as const satisfies readonly ProviderFieldOption[];

export const deepSeekReasoningEffortOptions = [
  {
    value: "none",
    label: "关闭",
  },
  {
    value: "low",
    label: "低",
  },
  {
    value: "medium",
    label: "中",
  },
  {
    value: "high",
    label: "高",
  },
] as const satisfies readonly ProviderFieldOption[];

const deepSeekModeRuntimeDefaults = {
  fast: {
    analysisMode: "fast",
    model: deepSeekDefaultModel,
    responseFormat: deepSeekResponseFormat,
    temperature: 0.2,
    maxTokens: 4000,
    thinkingEnabled: false,
    reasoningEffort: "none",
    modeLabelZh: "快速模式",
  },
  professional: {
    analysisMode: "professional",
    model: deepSeekProfessionalModel,
    responseFormat: deepSeekResponseFormat,
    temperature: 0.2,
    maxTokens: 6000,
    thinkingEnabled: true,
    reasoningEffort: "medium",
    modeLabelZh: "专业模式",
  },
} as const satisfies Record<DeepSeekAnalysisMode, DeepSeekModeRuntimeDefaults>;

const deepSeekModelValues = new Set<string>([
  deepSeekDefaultModel,
  deepSeekProfessionalModel,
  "deepseek-chat",
  "deepseek-reasoner",
]);

export function normalizeDeepSeekModel(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed || !deepSeekModelValues.has(trimmed)) {
    return deepSeekDefaultModel;
  }

  if (trimmed === "deepseek-chat") {
    return deepSeekDefaultModel;
  }

  if (trimmed === "deepseek-reasoner") {
    return deepSeekProfessionalModel;
  }

  return trimmed;
}

export function inferDeepSeekAnalysisModeFromModel(
  value: string | undefined,
): DeepSeekAnalysisMode {
  const normalized = normalizeDeepSeekModel(value);
  return normalized === deepSeekProfessionalModel ? "professional" : "fast";
}

export function normalizeDeepSeekAnalysisMode(
  value: string | undefined,
  model?: string | undefined,
): DeepSeekAnalysisMode {
  const trimmed = value?.trim();
  if (trimmed === "fast" || trimmed === "professional") {
    return trimmed;
  }

  return inferDeepSeekAnalysisModeFromModel(model);
}

export function getDeepSeekModeRuntimeDefaults(
  mode: DeepSeekAnalysisMode,
): DeepSeekModeRuntimeDefaults {
  return deepSeekModeRuntimeDefaults[mode];
}

const keepExistingSecretPlaceholder = "留空则保持现有密钥不变";

export const providerFieldPresets = [
  {
    providerCode: "deepseek",
    helpText:
      "DeepSeek 仅用于解释系统已计算出的评分、风险和拍摄建议，不负责重新计算天气、天文和地形数据。",
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
        key: "analysisMode",
        label: "分析模式",
        target: "configJson",
        control: "select",
        options: deepSeekAnalysisModeOptions,
        defaultValue: "fast",
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
        label: "接口地址（Base URL）",
        target: "configJson",
        placeholder: "https://api.deepseek.com",
        defaultValue: "https://api.deepseek.com",
        advanced: true,
      },
      {
        key: "temperature",
        label: "温度（Temperature）",
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
        label: "最大输出 Token",
        target: "configJson",
        control: "number",
        defaultValue: 4000,
        min: 128,
        max: 8192,
        step: 1,
        advanced: true,
      },
      {
        key: "reasoningEffort",
        label: "推理强度",
        target: "configJson",
        control: "select",
        options: deepSeekReasoningEffortOptions,
        defaultValue: "none",
        advanced: true,
      },
      {
        key: "thinkingEnabled",
        label: "思考模式",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "qweather",
    helpText:
      "中国大陆主天气源；部分云层分层字段可能不可用。当前本地自动化仅使用和风天气样例数据，不触发真实调用。",
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
    helpText: "云层分层与能见度辅助源；当前本地仅使用 Open-Meteo 样例数据，不触发真实调用。",
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
