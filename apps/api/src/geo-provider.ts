import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import { AmapProvider, MockGeoProvider } from "@photo-weather/geo";
import type { GeoProvider } from "@photo-weather/geo";

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

  return (
    readString(secretJson.baseUrl) ??
    readString(configJson.baseUrl) ??
    readEnvString(env.AMAP_BASE_URL)
  );
}

export async function readRuntimeAmapConfig(
  options: Pick<GeoProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<RuntimeAmapConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("geo", "amap", { client: options.dbClient });

  return {
    providerEnabled: provider?.enabled ?? false,
    realModeEnabled: readOptInFlag(env.ENABLE_REAL_AMAP),
    apiKey: readAmapApiKey(provider, env),
    baseUrl: readAmapBaseUrl(provider, env),
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
  });
}

export async function createRealAmapProvider(
  options: Pick<GeoProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<AmapProvider> {
  const config = await readRuntimeAmapConfig(options);

  return new AmapProvider({
    enabled: config.providerEnabled,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
}
