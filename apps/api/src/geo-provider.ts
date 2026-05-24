import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import { AmapProvider, MockGeoProvider } from "@photo-weather/geo";
import type { GeoProvider } from "@photo-weather/geo";
import { weatherDefaultRetryCount, weatherDefaultTimeoutMs } from "@photo-weather/shared";

export type GeoProviderRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly geoProvider?: GeoProvider;
  readonly env?: NodeJS.ProcessEnv;
};

type RuntimeAmapConfig = {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
};

function isJsonObject(value: JsonValue | null | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readEnvString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptInFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
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

function normalizeEndpoint(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return undefined;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function readAmapApiKey(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const secretJson = isJsonObject(provider?.secretJson) ? provider.secretJson : {};

  return (
    readString(secretJson.apiKey) ??
    readString(secretJson.webServiceKey) ??
    readString(secretJson.amapWebServiceKey) ??
    readEnvString(env.AMAP_API_KEY) ??
    readEnvString(env.AMAP_WEB_SERVICE_KEY)
  );
}

function readAmapBaseUrl(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const secretJson = isJsonObject(provider?.secretJson) ? provider.secretJson : {};
  const configJson = isJsonObject(provider?.configJson) ? provider.configJson : {};

  return normalizeEndpoint(
    readString(secretJson.baseUrl) ??
      readString(configJson.baseUrl) ??
      readEnvString(env.AMAP_BASE_URL),
  );
}

function readAmapRealModeEnabled(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }

  const configJson = isJsonObject(provider?.configJson) ? provider.configJson : {};
  return readBoolean(configJson.realCallEnabled) ?? readOptInFlag(env.ENABLE_REAL_AMAP);
}

export async function readRuntimeAmapConfig(
  options: Pick<GeoProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<RuntimeAmapConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("geo", "amap", { client: options.dbClient });
  const configJson = isJsonObject(provider?.configJson) ? provider.configJson : {};

  return {
    providerEnabled: provider?.enabled ?? false,
    realModeEnabled: readAmapRealModeEnabled(provider, env),
    apiKey: readAmapApiKey(provider, env),
    baseUrl: readAmapBaseUrl(provider, env),
    timeoutMs: clampInteger(
      readNumber(configJson.timeoutMs) ?? readEnvNumber(env.AMAP_TIMEOUT_MS),
      weatherDefaultTimeoutMs,
      1000,
      30000,
    ),
    retryCount: clampInteger(
      readNumber(configJson.retryCount) ?? readEnvNumber(env.AMAP_RETRY_COUNT),
      weatherDefaultRetryCount,
      0,
      5,
    ),
  };
}

export async function resolveGeoProvider(
  options: GeoProviderRuntimeOptions = {},
): Promise<GeoProvider> {
  if (options.geoProvider) {
    return options.geoProvider;
  }

  const config = await readRuntimeAmapConfig(options);
  if (!config.providerEnabled || !config.realModeEnabled) {
    return new MockGeoProvider();
  }

  return new AmapProvider({
    enabled: true,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
  });
}

export async function createRealAmapProvider(
  options: Pick<GeoProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<AmapProvider> {
  const config = await readRuntimeAmapConfig(options);

  return new AmapProvider({
    enabled: config.providerEnabled && config.realModeEnabled,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
  });
}
