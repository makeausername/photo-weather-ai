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

export const qWeatherDefaultApiHost = "";

export const qWeatherDefaultBaseUrl = qWeatherDefaultApiHost;

export const qWeatherApiHostPlaceholder = "xxxxx.qweatherapi.com";

export const qWeatherDefaultTimeoutMs = 10000;

export const qWeatherDefaultLanguage = "zh";

export const qWeatherDefaultUnit = "metric";

export const qWeatherUnitOptions = [
  {
    value: "metric",
    label: "公制（metric）",
  },
  {
    value: "imperial",
    label: "英制（imperial）",
  },
] as const satisfies readonly ProviderFieldOption[];

export const openMeteoDefaultBaseUrl = "https://api.open-meteo.com/v1";

export const openMeteoFreeEndpoint = "https://api.open-meteo.com";

export const openMeteoCustomerEndpoint = "https://customer-api.open-meteo.com";

export const openMeteoDefaultModel = "forecast";

export const openMeteoModeOptions = [
  {
    value: "free",
    label: "免费开发模式",
  },
  {
    value: "customer",
    label: "商业客户模式",
  },
] as const satisfies readonly ProviderFieldOption[];

export const meteoblueDefaultBaseUrl = "https://my.meteoblue.com";

export const meteoblueDefaultPackages = "basic-1h,clouds-1h";

export const weatherDefaultTimeoutMs = 8000;

export const weatherDefaultRetryCount = 1;

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
    helpText: "中国大陆主天气源，用于实时天气、逐小时预报、天气预警、空气质量和基础天气数据。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不请求和风天气服务。",
      },
      {
        key: "apiKey",
        label: "和风天气 API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "保存后仅显示脱敏结果，不会在前端暴露。",
      },
      {
        key: "apiHost",
        label: "API Host",
        target: "configJson",
        placeholder: qWeatherApiHostPlaceholder,
        defaultValue: qWeatherDefaultApiHost,
        helpText:
          "在和风天气控制台的开发者信息中复制，例如 xxxxx.qweatherapi.com，不需要填写 https://。",
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: qWeatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
      {
        key: "language",
        label: "语言",
        target: "configJson",
        placeholder: qWeatherDefaultLanguage,
        defaultValue: qWeatherDefaultLanguage,
        advanced: true,
      },
      {
        key: "unit",
        label: "单位",
        target: "configJson",
        control: "select",
        options: qWeatherUnitOptions,
        defaultValue: qWeatherDefaultUnit,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "open_meteo",
    helpText:
      "用于云层分层、能见度、露点、气压、风和多模型交叉验证。免费开发模式适合评估，商业客户模式用于后续生产接入。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不请求真实天气服务。",
      },
      {
        key: "mode",
        label: "调用模式",
        target: "configJson",
        control: "select",
        options: openMeteoModeOptions,
        defaultValue: "free",
        helpText: "免费开发模式无需 Key；商业客户模式请填写 API Key 和 Customer Endpoint。",
      },
      {
        key: "apiKey",
        label: "Open-Meteo API Key（可选）",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
        helpText: "如使用商业版 Open-Meteo，可填写 API Key；普通体验模式可保持为空。",
      },
      {
        key: "customerEndpoint",
        label: "Customer Endpoint",
        target: "configJson",
        placeholder: openMeteoCustomerEndpoint,
        defaultValue: openMeteoCustomerEndpoint,
        helpText: "商业客户模式使用；免费开发模式可保持默认值，系统不会把 Key 暴露到前端。",
      },
      {
        key: "modelPreference",
        label: "模型偏好",
        target: "configJson",
        placeholder: "best_match",
        advanced: true,
      },
      {
        key: "timezone",
        label: "时区",
        target: "configJson",
        placeholder: "Asia/Shanghai",
        defaultValue: "Asia/Shanghai",
        advanced: true,
      },
      {
        key: "defaultModel",
        label: "默认模型",
        target: "configJson",
        placeholder: openMeteoDefaultModel,
        defaultValue: openMeteoDefaultModel,
        advanced: true,
      },
      {
        key: "baseUrl",
        label: "Base URL（接口地址）",
        target: "configJson",
        placeholder: openMeteoDefaultBaseUrl,
        defaultValue: openMeteoDefaultBaseUrl,
        advanced: true,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
      },
    ],
  },
  {
    providerCode: "meteoblue",
    helpText:
      "meteoblue Free Weather API 可用于 Forecast API 测试。建议先启用 basic-1h 和 clouds-1h，用于云层与基础天气增强。",
    fields: [
      {
        key: "realCallEnabled",
        label: "启用真实调用",
        target: "configJson",
        control: "boolean",
        defaultValue: false,
        helpText: "关闭时测试连接只返回模拟测试结果，不请求 meteoblue 服务。",
      },
      {
        key: "apiKey",
        label: "meteoblue API Key",
        target: "secretJson",
        placeholder: keepExistingSecretPlaceholder,
        password: true,
      },
      {
        key: "packages",
        label: "数据包 / Packages",
        target: "configJson",
        placeholder: meteoblueDefaultPackages,
        defaultValue: meteoblueDefaultPackages,
        helpText:
          "多个数据包用英文逗号分隔，例如 basic-1h,clouds-1h。Free Weather API 可用于 Forecast API 测试。",
      },
      {
        key: "baseUrl",
        label: "Base URL",
        target: "configJson",
        placeholder: meteoblueDefaultBaseUrl,
        defaultValue: meteoblueDefaultBaseUrl,
      },
      {
        key: "timeoutMs",
        label: "请求超时（毫秒）",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultTimeoutMs,
        min: 1000,
        max: 30000,
        step: 100,
        advanced: true,
      },
      {
        key: "retryCount",
        label: "重试次数",
        target: "configJson",
        control: "number",
        defaultValue: weatherDefaultRetryCount,
        min: 0,
        max: 5,
        step: 1,
        advanced: true,
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
