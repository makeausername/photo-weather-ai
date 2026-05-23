import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import {
  buildQWeatherBaseUrl,
  normalizeQWeatherApiHost,
  type QWeatherUnit,
} from "@photo-weather/weather";
import {
  openMeteoDefaultBaseUrl,
  openMeteoDefaultModel,
  qWeatherDefaultApiHost,
  qWeatherDefaultLanguage,
  qWeatherDefaultTimeoutMs,
  qWeatherDefaultUnit,
  qWeatherDefaultBaseUrl,
  weatherDefaultRetryCount,
  weatherDefaultTimeoutMs,
} from "@photo-weather/shared";

export type WeatherProviderRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
};

export type ResolvedQWeatherRuntimeConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly priority: number;
  readonly apiKeyPresent: boolean;
  readonly apiHostPresent: boolean;
  readonly apiHost: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly language: string;
  readonly unit: QWeatherUnit;
  readonly modeLabelZh: string;
};

export type RuntimeQWeatherConfig = ResolvedQWeatherRuntimeConfig & {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
};

export type ResolvedOpenMeteoRuntimeConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly customerEndpointPresent: boolean;
  readonly baseUrl: string;
  readonly customerEndpoint?: string;
  readonly defaultModel: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly modeLabelZh: string;
};

export type RuntimeOpenMeteoConfig = ResolvedOpenMeteoRuntimeConfig & {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
};

function isJsonObject(value: JsonValue | null | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readRawString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readEnvString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: JsonValue | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readEnvNumber(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(Math.min(max, Math.max(min, value)));
}

function readSecretAndConfig(provider: ProviderConfigRecord | null): {
  readonly secretJson: Record<string, JsonValue>;
  readonly configJson: Record<string, JsonValue>;
} {
  return {
    secretJson: isJsonObject(provider?.secretJson) ? provider.secretJson : {},
    configJson: isJsonObject(provider?.configJson) ? provider.configJson : {},
  };
}

function readConfiguredHost(
  configJson: Record<string, JsonValue>,
  keys: readonly string[],
): { readonly provided: boolean; readonly value?: string } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(configJson, key)) {
      return {
        provided: true,
        value: normalizeQWeatherApiHost(readRawString(configJson[key])),
      };
    }
  }

  return { provided: false };
}

function readWeatherRealCallEnabled(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
  providerCode: "qweather" | "open_meteo",
): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }

  const { configJson } = readSecretAndConfig(provider);
  return (
    readBoolean(configJson.realCallEnabled) ??
    (env.WEATHER_PROVIDER === providerCode && env.WEATHER_PROVIDER_MODE === "real")
  );
}

function readQWeatherApiKey(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson } = readSecretAndConfig(provider);
  return readString(secretJson.apiKey) ?? readEnvString(env.QWEATHER_API_KEY);
}

function readEnvQWeatherApiHost(env: NodeJS.ProcessEnv): string | undefined {
  return (
    normalizeQWeatherApiHost(readEnvString(env.QWEATHER_API_HOST)) ??
    normalizeQWeatherApiHost(readEnvString(env.QWEATHER_BASE_URL)) ??
    normalizeQWeatherApiHost(readEnvString(env.QWEATHER_API_BASE_URL))
  );
}

function normalizeQWeatherLanguage(value: string | undefined): string {
  return value && /^[A-Za-z-]{2,12}$/.test(value) ? value : qWeatherDefaultLanguage;
}

function normalizeQWeatherUnit(value: string | undefined): QWeatherUnit {
  if (value === "imperial" || value === "i") {
    return "imperial";
  }

  return qWeatherDefaultUnit;
}

function readOpenMeteoApiKey(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson } = readSecretAndConfig(provider);
  return readString(secretJson.apiKey) ?? readEnvString(env.OPEN_METEO_API_KEY);
}

function readOpenMeteoCustomerEndpoint(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson, configJson } = readSecretAndConfig(provider);
  return (
    readString(configJson.customerEndpoint) ??
    readString(secretJson.customerEndpoint) ??
    readEnvString(env.OPEN_METEO_CUSTOMER_ENDPOINT)
  );
}

export function resolveQWeatherRuntimeConfig(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedQWeatherRuntimeConfig {
  const { configJson } = readSecretAndConfig(provider);
  const configuredHost = readConfiguredHost(configJson, ["apiHost", "baseUrl", "apiBaseUrl"]);
  const apiHost =
    configuredHost.provided
      ? configuredHost.value ?? ""
      : readEnvQWeatherApiHost(env) ?? qWeatherDefaultApiHost;
  const baseUrl = apiHost ? buildQWeatherBaseUrl(apiHost) : qWeatherDefaultBaseUrl;
  const realCallEnabled = readWeatherRealCallEnabled(provider, env, "qweather");

  return {
    enabled: provider?.enabled ?? false,
    realCallEnabled,
    priority: provider?.priority ?? 0,
    apiKeyPresent: Boolean(readQWeatherApiKey(provider, env)),
    apiHostPresent: Boolean(apiHost),
    apiHost,
    baseUrl,
    timeoutMs: clampInteger(
      readNumber(configJson.timeoutMs) ??
        readNumber(configJson.requestTimeoutMs) ??
        readEnvNumber(env.QWEATHER_TIMEOUT_MS),
      qWeatherDefaultTimeoutMs,
      1000,
      30000,
    ),
    retryCount: clampInteger(
      readNumber(configJson.retryCount) ?? readEnvNumber(env.QWEATHER_RETRY_COUNT),
      weatherDefaultRetryCount,
      0,
      5,
    ),
    language: normalizeQWeatherLanguage(
      readString(configJson.language) ?? readEnvString(env.QWEATHER_LANGUAGE),
    ),
    unit: normalizeQWeatherUnit(readString(configJson.unit) ?? readEnvString(env.QWEATHER_UNIT)),
    modeLabelZh: realCallEnabled ? "真实服务" : "演示模式",
  };
}

export function resolveOpenMeteoRuntimeConfig(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOpenMeteoRuntimeConfig {
  const { configJson } = readSecretAndConfig(provider);
  const customerEndpoint = readOpenMeteoCustomerEndpoint(provider, env);
  const realCallEnabled = readWeatherRealCallEnabled(provider, env, "open_meteo");

  return {
    enabled: provider?.enabled ?? false,
    realCallEnabled,
    apiKeyPresent: Boolean(readOpenMeteoApiKey(provider, env)),
    customerEndpointPresent: Boolean(customerEndpoint),
    baseUrl:
      readString(configJson.baseUrl) ??
      readEnvString(env.OPEN_METEO_BASE_URL) ??
      openMeteoDefaultBaseUrl,
    customerEndpoint,
    defaultModel:
      readString(configJson.defaultModel) ??
      readEnvString(env.OPEN_METEO_DEFAULT_MODEL) ??
      openMeteoDefaultModel,
    timeoutMs: clampInteger(
      readNumber(configJson.timeoutMs) ?? readEnvNumber(env.OPEN_METEO_TIMEOUT_MS),
      weatherDefaultTimeoutMs,
      1000,
      30000,
    ),
    retryCount: clampInteger(
      readNumber(configJson.retryCount) ?? readEnvNumber(env.OPEN_METEO_RETRY_COUNT),
      weatherDefaultRetryCount,
      0,
      5,
    ),
    modeLabelZh: realCallEnabled ? "真实服务" : "模拟测试",
  };
}

export function normalizeQWeatherAdminConfigJson(
  configJson: JsonValue | undefined,
): Record<string, JsonValue> {
  const current = isJsonObject(configJson) ? { ...configJson } : {};
  const hasApiHost = Object.prototype.hasOwnProperty.call(current, "apiHost");
  const apiHost = hasApiHost
    ? normalizeQWeatherApiHost(readRawString(current.apiHost)) ?? ""
    : normalizeQWeatherApiHost(readRawString(current.baseUrl)) ??
      normalizeQWeatherApiHost(readRawString(current.apiBaseUrl)) ??
      qWeatherDefaultApiHost;

  const normalized: Record<string, JsonValue> = {
    ...current,
    realCallEnabled: readBoolean(current.realCallEnabled) ?? false,
    apiHost,
    timeoutMs: clampInteger(readNumber(current.timeoutMs), qWeatherDefaultTimeoutMs, 1000, 30000),
    retryCount: clampInteger(readNumber(current.retryCount), weatherDefaultRetryCount, 0, 5),
    language: normalizeQWeatherLanguage(readString(current.language)),
    unit: normalizeQWeatherUnit(readString(current.unit)),
  };

  if (Object.prototype.hasOwnProperty.call(normalized, "apiKey")) {
    normalized.apiKey = null;
  }

  return normalized;
}

export function normalizeOpenMeteoAdminConfigJson(
  configJson: JsonValue | undefined,
): Record<string, JsonValue> {
  const current = isJsonObject(configJson) ? { ...configJson } : {};
  const customerEndpoint = readString(current.customerEndpoint);
  const normalized: Record<string, JsonValue> = {
    ...current,
    realCallEnabled: readBoolean(current.realCallEnabled) ?? false,
    baseUrl: readString(current.baseUrl) ?? openMeteoDefaultBaseUrl,
    defaultModel: readString(current.defaultModel) ?? openMeteoDefaultModel,
    timeoutMs: clampInteger(readNumber(current.timeoutMs), weatherDefaultTimeoutMs, 1000, 30000),
    retryCount: clampInteger(readNumber(current.retryCount), weatherDefaultRetryCount, 0, 5),
  };

  if (customerEndpoint) {
    normalized.customerEndpoint = customerEndpoint;
  } else {
    delete normalized.customerEndpoint;
  }

  return normalized;
}

export async function readRuntimeQWeatherConfig(
  options: WeatherProviderRuntimeOptions = {},
): Promise<RuntimeQWeatherConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("weather", "qweather", {
    client: options.dbClient,
  });
  const resolved = resolveQWeatherRuntimeConfig(provider, env);

  return {
    ...resolved,
    providerEnabled: resolved.enabled,
    realModeEnabled: resolved.realCallEnabled,
    apiKey: readQWeatherApiKey(provider, env),
  };
}

export async function readRuntimeOpenMeteoConfig(
  options: WeatherProviderRuntimeOptions = {},
): Promise<RuntimeOpenMeteoConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("weather", "open_meteo", {
    client: options.dbClient,
  });
  const resolved = resolveOpenMeteoRuntimeConfig(provider, env);

  return {
    ...resolved,
    providerEnabled: resolved.enabled,
    realModeEnabled: resolved.realCallEnabled,
    apiKey: readOpenMeteoApiKey(provider, env),
  };
}
