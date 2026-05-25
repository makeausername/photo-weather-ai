import { isDeepSeekProviderError, type DeepSeekProviderOptions } from "@photo-weather/ai";
import { AmapProvider } from "@photo-weather/geo";
import {
  isWeatherProviderError,
  maskQWeatherApiHost,
  OpenMeteoClient,
  QWeatherClient,
} from "@photo-weather/weather";
import type { DatabaseClient } from "@photo-weather/db";
import type { ForecastWeatherSourceErrorCategory } from "@photo-weather/shared";
import { createRealDeepSeekProvider, readRuntimeDeepSeekConfig } from "./ai-provider.js";
import { readRuntimeAmapConfig } from "./geo-provider.js";
import {
  createMeteoblueClientFromRuntimeConfig,
  readRuntimeMeteoblueConfig,
  readRuntimeOpenMeteoConfig,
  readRuntimeQWeatherConfig,
} from "./weather-provider.js";

export const providerDiagnosticCodes = [
  "meteoblue",
  "open_meteo",
  "qweather",
  "amap",
  "deepseek",
] as const;

export type ProviderDiagnosticCode = (typeof providerDiagnosticCodes)[number];

export type ProviderDiagnosticErrorCategory =
  | ForecastWeatherSourceErrorCategory
  | "admin_unauthorized"
  | "admin_forbidden"
  | "provider_not_enabled"
  | "provider_key_missing"
  | "provider_host_missing"
  | "real_call_disabled";

export type ProviderDiagnosticResult = {
  readonly providerType: "weather" | "geo" | "ai";
  readonly providerCode: ProviderDiagnosticCode;
  readonly providerNameZh: string;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly attempted: boolean;
  readonly success: boolean;
  readonly connectionMode: "mock" | "real";
  readonly mode?: string;
  readonly modeLabelZh?: string;
  readonly host?: string;
  readonly baseUrl?: string;
  readonly endpoint?: string;
  readonly packages?: readonly string[];
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly provider?: string;
  readonly qweatherCode?: string;
  readonly location?: string;
  readonly observedWeatherSummary?: string;
  readonly sampleLocation: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly errorCategory?: ProviderDiagnosticErrorCategory;
  readonly messageZh: string;
};

export type ProviderDiagnosticOptions = {
  readonly providerCode: ProviderDiagnosticCode;
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
};

const sampleLocation = "黄山光明顶";

const providerMetadata: Record<
  ProviderDiagnosticCode,
  {
    readonly providerType: ProviderDiagnosticResult["providerType"];
    readonly providerNameZh: string;
  }
> = {
  amap: {
    providerType: "geo",
    providerNameZh: "高德地图",
  },
  qweather: {
    providerType: "weather",
    providerNameZh: "和风天气",
  },
  open_meteo: {
    providerType: "weather",
    providerNameZh: "Open-Meteo",
  },
  meteoblue: {
    providerType: "weather",
    providerNameZh: "meteoblue",
  },
  deepseek: {
    providerType: "ai",
    providerNameZh: "DeepSeek",
  },
};

export function providerDiagnosticCodeFromRoute(
  providerType: string,
  providerCode: string,
): ProviderDiagnosticCode | null {
  const match = providerDiagnosticCodes.find((code) => code === providerCode);
  if (!match) {
    return null;
  }

  return providerMetadata[match].providerType === providerType ? match : null;
}

export async function runProviderDiagnostic(
  options: ProviderDiagnosticOptions,
): Promise<ProviderDiagnosticResult> {
  switch (options.providerCode) {
    case "amap":
      return testAmapProvider(options);
    case "qweather":
      return testQWeatherProvider(options);
    case "open_meteo":
      return testOpenMeteoProvider(options);
    case "meteoblue":
      return testMeteoblueProvider(options);
    case "deepseek":
      return testDeepSeekProvider(options);
  }

  throw new Error(`Unsupported provider diagnostic code: ${options.providerCode}`);
}

function baseResult(
  providerCode: ProviderDiagnosticCode,
  input: {
    readonly enabled: boolean;
    readonly realCallEnabled: boolean;
    readonly apiKeyPresent: boolean;
    readonly mode?: string;
    readonly modeLabelZh?: string;
    readonly host?: string;
    readonly baseUrl?: string;
    readonly endpoint?: string;
    readonly packages?: readonly string[];
    readonly model?: string;
    readonly provider?: string;
    readonly qweatherCode?: string;
    readonly location?: string;
    readonly observedWeatherSummary?: string;
  },
): Omit<ProviderDiagnosticResult, "attempted" | "success" | "connectionMode" | "messageZh"> {
  const metadata = providerMetadata[providerCode];
  return {
    providerType: metadata.providerType,
    providerCode,
    providerNameZh: metadata.providerNameZh,
    enabled: input.enabled,
    realCallEnabled: input.realCallEnabled,
    apiKeyPresent: input.apiKeyPresent,
    mode: input.mode,
    modeLabelZh: input.modeLabelZh,
    host: input.host,
    baseUrl: input.baseUrl,
    endpoint: input.endpoint,
    packages: input.packages,
    model: input.model,
    provider: input.provider,
    qweatherCode: input.qweatherCode,
    location: input.location,
    observedWeatherSummary: input.observedWeatherSummary,
    sampleLocation,
  };
}

function skippedDiagnostic(
  providerCode: ProviderDiagnosticCode,
  input: Parameters<typeof baseResult>[1] & {
    readonly errorCategory: ProviderDiagnosticErrorCategory;
    readonly messageZh: string;
    readonly success?: boolean;
    readonly connectionMode?: "mock" | "real";
  },
): ProviderDiagnosticResult {
  return {
    ...baseResult(providerCode, input),
    attempted: false,
    success: input.success ?? false,
    connectionMode: input.connectionMode ?? "mock",
    errorCategory: input.errorCategory,
    messageZh: input.messageZh,
  };
}

function successfulDiagnostic(
  providerCode: ProviderDiagnosticCode,
  input: Parameters<typeof baseResult>[1] & {
    readonly messageZh: string;
    readonly statusCode?: number;
    readonly latencyMs?: number;
  },
): ProviderDiagnosticResult {
  return {
    ...baseResult(providerCode, input),
    attempted: true,
    success: true,
    connectionMode: "real",
    statusCode: input.statusCode,
    latencyMs: input.latencyMs,
    messageZh: input.messageZh,
  };
}

function failedDiagnostic(
  providerCode: ProviderDiagnosticCode,
  input: Parameters<typeof baseResult>[1] & {
    readonly messageZh: string;
    readonly errorCategory: ProviderDiagnosticErrorCategory;
    readonly statusCode?: number;
    readonly latencyMs?: number;
  },
): ProviderDiagnosticResult {
  return {
    ...baseResult(providerCode, input),
    attempted: true,
    success: false,
    connectionMode: "real",
    statusCode: input.statusCode,
    latencyMs: input.latencyMs,
    errorCategory: input.errorCategory,
    messageZh: input.messageZh,
  };
}

function preflightDiagnostic(
  providerCode: ProviderDiagnosticCode,
  input: Parameters<typeof baseResult>[1],
): ProviderDiagnosticResult | null {
  const providerName = providerMetadata[providerCode].providerNameZh;
  if (!input.realCallEnabled) {
    return skippedDiagnostic(providerCode, {
      ...input,
      errorCategory: "real_call_disabled",
      success: true,
      messageZh: realCallDisabledMessage(providerCode),
    });
  }

  if (!input.enabled) {
    return skippedDiagnostic(providerCode, {
      ...input,
      connectionMode: "real",
      errorCategory: "provider_not_enabled",
      messageZh: `${providerName} 服务商未启用，请先在后台服务商配置中启用。`,
    });
  }

  return null;
}

function realCallDisabledMessage(providerCode: ProviderDiagnosticCode): string {
  switch (providerCode) {
    case "amap":
      return "当前为模拟测试，未请求高德地图服务。";
    case "qweather":
      return "当前为模拟测试，未请求和风天气服务。";
    case "open_meteo":
      return "当前为模拟测试，未请求真实天气服务。";
    case "meteoblue":
      return "当前为模拟测试，未请求 meteoblue 服务。";
    case "deepseek":
      return "当前为模拟测试，未请求 DeepSeek 服务。";
  }
}

async function testAmapProvider(
  options: ProviderDiagnosticOptions,
): Promise<ProviderDiagnosticResult> {
  const config = await readRuntimeAmapConfig({ dbClient: options.dbClient, env: options.env });
  const common = {
    enabled: config.providerEnabled,
    realCallEnabled: config.realModeEnabled,
    apiKeyPresent: Boolean(config.apiKey),
    baseUrl: config.baseUrl ?? "https://restapi.amap.com",
  };
  const preflight = preflightDiagnostic("amap", common);
  if (preflight) {
    return preflight;
  }
  if (!config.apiKey) {
    return skippedDiagnostic("amap", {
      ...common,
      connectionMode: "real",
      errorCategory: "provider_key_missing",
      messageZh: "请先填写高德 Web 服务 Key。",
    });
  }

  const startedAt = Date.now();
  try {
    const provider = new AmapProvider({
      enabled: true,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
      retryCount: config.retryCount,
      fetcher: options.fetcher,
    });
    const results = await provider.searchPlace(sampleLocation, {
      countryCode: "CN",
      locale: "zh-CN",
      limit: 1,
    });
    const latencyMs = Date.now() - startedAt;
    return successfulDiagnostic("amap", {
      ...common,
      latencyMs,
      messageZh: results[0]
        ? `高德地图连接测试通过，耗时 ${latencyMs}ms。`
        : `高德地图连接成功，但未返回测试地点，耗时 ${latencyMs}ms。`,
    });
  } catch (error) {
    return failedDiagnostic("amap", {
      ...common,
      ...classifyProviderDiagnosticError(error, "高德地图连接测试失败。", config.apiKey),
    });
  }
}

async function testQWeatherProvider(
  options: ProviderDiagnosticOptions,
): Promise<ProviderDiagnosticResult> {
  const config = await readRuntimeQWeatherConfig({ dbClient: options.dbClient, env: options.env });
  const common = {
    enabled: config.enabled,
    realCallEnabled: config.realCallEnabled,
    apiKeyPresent: config.apiKeyPresent,
    host: maskQWeatherApiHost(config.apiHost),
    baseUrl: config.baseUrl,
    modeLabelZh: config.modeLabelZh,
  };
  const preflight = preflightDiagnostic("qweather", common);
  if (preflight) {
    return preflight;
  }
  if (!config.apiKeyPresent || !config.apiKey) {
    return skippedDiagnostic("qweather", {
      ...common,
      connectionMode: "real",
      errorCategory: "provider_key_missing",
      messageZh: "请先填写和风天气 API Key。",
    });
  }
  if (!config.apiHostPresent || !config.apiHost) {
    return skippedDiagnostic("qweather", {
      ...common,
      connectionMode: "real",
      errorCategory: "provider_host_missing",
      messageZh: "请先填写和风天气 API Host。",
    });
  }

  try {
    const result = await new QWeatherClient({
      apiKey: config.apiKey,
      apiHost: config.apiHost,
      timeoutMs: config.timeoutMs,
      retryCount: config.retryCount,
      language: config.language,
      unit: config.unit,
      fetcher: options.fetcher,
    }).testConnection();
    if (result.success) {
      return successfulDiagnostic("qweather", {
        ...common,
        provider: "qweather",
        qweatherCode: result.qweatherCode,
        location: result.location,
        observedWeatherSummary: result.observedWeatherSummary,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        messageZh: `和风天气连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`,
      });
    }

    return failedDiagnostic("qweather", {
      ...common,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      errorCategory:
        result.statusCode === 401 || result.statusCode === 403 ? "invalid_key" : "provider_error",
      messageZh: result.messageZh,
    });
  } catch (error) {
    return failedDiagnostic("qweather", {
      ...common,
      ...classifyProviderDiagnosticError(error, "和风天气连接测试失败。", config.apiKey),
    });
  }
}

async function testOpenMeteoProvider(
  options: ProviderDiagnosticOptions,
): Promise<ProviderDiagnosticResult> {
  const config = await readRuntimeOpenMeteoConfig({
    dbClient: options.dbClient,
    env: options.env,
  });
  const common = {
    enabled: config.enabled,
    realCallEnabled: config.realCallEnabled,
    apiKeyPresent: config.apiKeyPresent,
    mode: config.mode,
    modeLabelZh: config.modeLabelZh,
    endpoint: config.endpoint,
    baseUrl: config.baseUrl,
  };
  const preflight = preflightDiagnostic("open_meteo", common);
  if (preflight) {
    return preflight;
  }
  if (config.mode === "customer" && !config.apiKey) {
    return skippedDiagnostic("open_meteo", {
      ...common,
      connectionMode: "real",
      errorCategory: "provider_key_missing",
      messageZh: "商业客户模式请先填写 Open-Meteo API Key。",
    });
  }

  try {
    const result = await new OpenMeteoClient({
      endpoint: config.endpoint,
      mode: config.mode,
      apiKey: config.apiKey,
      timezone: config.timezone,
      timeoutMs: config.timeoutMs,
      retryCount: config.retryCount,
      modelPreference: config.modelPreference,
      fetcher: options.fetcher,
    }).testConnection();
    if (result.success) {
      return successfulDiagnostic("open_meteo", {
        ...common,
        endpoint: result.endpoint,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        messageZh: `Open-Meteo 连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`,
      });
    }

    return failedDiagnostic("open_meteo", {
      ...common,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      errorCategory: "provider_error",
      messageZh: result.messageZh,
    });
  } catch (error) {
    return failedDiagnostic("open_meteo", {
      ...common,
      ...classifyProviderDiagnosticError(error, "Open-Meteo 连接测试失败。", config.apiKey),
    });
  }
}

async function testMeteoblueProvider(
  options: ProviderDiagnosticOptions,
): Promise<ProviderDiagnosticResult> {
  const config = await readRuntimeMeteoblueConfig({
    dbClient: options.dbClient,
    env: options.env,
  });
  const common = {
    enabled: config.enabled,
    realCallEnabled: config.realCallEnabled,
    apiKeyPresent: config.apiKeyPresent,
    baseUrl: config.baseUrl,
    packages: config.packages,
    modeLabelZh: config.modeLabelZh,
  };
  const preflight = preflightDiagnostic("meteoblue", common);
  if (preflight) {
    return preflight;
  }
  if (!config.apiKeyPresent || !config.apiKey) {
    return skippedDiagnostic("meteoblue", {
      ...common,
      connectionMode: "real",
      errorCategory: "provider_key_missing",
      messageZh: "请先填写 meteoblue API Key。",
    });
  }

  try {
    const result = await createMeteoblueClientFromRuntimeConfig(
      config,
      options.fetcher,
    ).testConnection();
    return successfulDiagnostic("meteoblue", {
      ...common,
      baseUrl: result.baseUrl,
      packages: result.packages,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      messageZh: `meteoblue 连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`,
    });
  } catch (error) {
    return failedDiagnostic("meteoblue", {
      ...common,
      ...classifyProviderDiagnosticError(error, "meteoblue 连接测试失败。", config.apiKey),
    });
  }
}

async function testDeepSeekProvider(
  options: ProviderDiagnosticOptions,
): Promise<ProviderDiagnosticResult> {
  const config = await readRuntimeDeepSeekConfig({
    dbClient: options.dbClient,
    env: options.env,
  });
  const common = {
    enabled: config.enabled,
    realCallEnabled: config.realCallEnabled,
    apiKeyPresent: config.apiKeyPresent,
    baseUrl: config.baseUrl,
    mode: config.analysisMode,
    modeLabelZh: config.modeLabelZh,
    model: config.model,
    timeoutMs: config.timeoutMs,
  };
  const preflight = preflightDiagnostic("deepseek", common);
  if (preflight) {
    return preflight;
  }
  if (!config.apiKeyPresent || !config.apiKey) {
    return skippedDiagnostic("deepseek", {
      ...common,
      connectionMode: "real",
      errorCategory: "provider_key_missing",
      messageZh: "请先填写 DeepSeek API Key。",
    });
  }

  try {
    const startedAt = Date.now();
    const provider = await createRealDeepSeekProvider({
      dbClient: options.dbClient,
      env: options.env,
      fetcher: options.fetcher as DeepSeekProviderOptions["fetcher"],
    });
    const result = await provider.testConnection();
    return successfulDiagnostic("deepseek", {
      ...common,
      latencyMs: Date.now() - startedAt,
      messageZh: result.message || `DeepSeek 连接测试通过，当前使用${config.modeLabelZh}。`,
    });
  } catch (error) {
    return failedDiagnostic("deepseek", {
      ...common,
      ...classifyProviderDiagnosticError(error, "DeepSeek 连接测试失败。", config.apiKey),
    });
  }
}

function classifyProviderDiagnosticError(
  error: unknown,
  fallbackMessageZh: string,
  secret?: string,
): {
  readonly errorCategory: ProviderDiagnosticErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
} {
  if (isWeatherProviderError(error)) {
    return {
      errorCategory: error.errorCategory,
      messageZh: sanitizeDiagnosticMessage(error.messageZh, secret),
      statusCode: error.statusCode,
      latencyMs: error.latencyMs,
    };
  }

  if (isDeepSeekProviderError(error)) {
    return {
      errorCategory: error.errorCategory,
      messageZh: sanitizeDiagnosticMessage(error.messageZh, secret),
      statusCode: error.statusCode,
      latencyMs: error.latencyMs,
    };
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return {
      errorCategory: "timeout",
      messageZh: fallbackMessageZh.replace("失败", "请求超时"),
    };
  }

  const message = error instanceof Error ? error.message : "";
  return {
    errorCategory: "provider_error",
    messageZh: sanitizeDiagnosticMessage(message || fallbackMessageZh, secret),
  };
}

function sanitizeDiagnosticMessage(message: string, secret?: string): string {
  let sanitized = message;
  if (secret) {
    sanitized = sanitized.split(secret).join("[redacted]");
  }

  return sanitized
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /((?:apiKey|api_key|apikey|token|authorization|secret)(?:["'\s:=]+))([^&\s,}"]+)/gi,
      "$1[redacted]",
    )
    .replace(/((?:apikey|key|token)=)[^&\s]+/gi, "$1[redacted]");
}
