import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import {
  buildQWeatherBaseUrl,
  InMemoryWeatherCache,
  InMemoryWeatherProviderUsageLogger,
  MockWeatherProvider,
  maskQWeatherApiHost,
  normalizeQWeatherApiHost,
  MeteoblueClient,
  MeteoblueRealProvider,
  OpenMeteoIconCloudLayerClient,
  OpenMeteoIconCloudLayerProvider,
  openMeteoIconCloudLayerDefaultModel,
  openMeteoIconCloudLayerParserVersion,
  OpenMeteoForecastCloudLayerClient,
  OpenMeteoForecastCloudLayerProvider,
  openMeteoForecastCloudLayerParserVersion,
  OpenMeteoAirQualityClient,
  OpenMeteoProvider,
  QWeatherClient,
  QWeatherProvider,
  QWeatherRealProvider,
  WeatherIntelligenceService,
  type WeatherRequestInput,
  type QWeatherUnit,
  type WeatherDataBundle,
  type WeatherProvider,
  type WeatherSourceSummary,
} from "@photo-weather/weather";
import {
  openMeteoDefaultBaseUrl,
  openMeteoCustomerEndpoint,
  openMeteoFreeEndpoint,
  openMeteoDefaultModel,
  meteoblueDefaultBaseUrl,
  meteoblueDefaultPackages,
  qWeatherDefaultApiHost,
  qWeatherDefaultLanguage,
  qWeatherDefaultTimeoutMs,
  qWeatherDefaultUnit,
  qWeatherDefaultBaseUrl,
  weatherDefaultRetryCount,
  weatherDefaultTimeoutMs,
  type ForecastProviderRuntimeSnapshot,
} from "@photo-weather/shared";

const meteoblueParserVersion = "meteoblue-data1h-time-v3";
export const openMeteoForecastCloudLayerDefaultModelList =
  "best_match,gfs_seamless,gfs_global";
const openMeteoForecastModelListLimit = 5;

export type WeatherProviderRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
};

export type WeatherDataServiceLike = {
  getWeatherDataBundle(input: WeatherRequestInput): Promise<WeatherDataBundle>;
};

export type ResolvedQWeatherRuntimeConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly priority: number;
  readonly configUpdatedAt?: string;
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
  readonly priority: number;
  readonly configUpdatedAt?: string;
  readonly mode: "free" | "customer";
  readonly apiKeyPresent: boolean;
  readonly customerEndpointPresent: boolean;
  readonly endpoint: string;
  readonly baseUrl: string;
  readonly customerEndpoint?: string;
  readonly defaultModel: string;
  readonly modelPreference?: string;
  readonly modelList: readonly string[];
  readonly iconModel: string;
  readonly timezone: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly modeLabelZh: string;
};

export type RuntimeOpenMeteoConfig = ResolvedOpenMeteoRuntimeConfig & {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
};

export type ResolvedMeteoblueRuntimeConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly priority: number;
  readonly configUpdatedAt?: string;
  readonly apiKeyPresent: boolean;
  readonly baseUrl: string;
  readonly packages: readonly string[];
  readonly packageName?: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly modeLabelZh: string;
};

export type RuntimeMeteoblueConfig = ResolvedMeteoblueRuntimeConfig & {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
};

export class RuntimeWeatherDataService implements WeatherDataServiceLike {
  private readonly cache = new InMemoryWeatherCache();
  private readonly usageLogger = new InMemoryWeatherProviderUsageLogger();
  private cacheNamespace: string | undefined;

  constructor(private readonly options: WeatherProviderRuntimeOptions = {}) {}

  async getWeatherDataBundle(input: WeatherRequestInput): Promise<WeatherDataBundle> {
    const resolution = await resolveRuntimeWeatherProviders(this.options);
    if (this.cacheNamespace && this.cacheNamespace !== resolution.cacheNamespace) {
      this.cache.clear();
    }
    this.cacheNamespace = resolution.cacheNamespace;

    const bundle = await new WeatherIntelligenceService({
      providers: resolution.providers,
      cache: this.cache,
      usageLogger: this.usageLogger,
      cacheNamespace: resolution.cacheNamespace,
    }).getWeatherDataBundle(input);

    return appendRuntimeResolution(bundle, resolution);
  }
}

export function createRuntimeWeatherDataService(
  options: WeatherProviderRuntimeOptions = {},
): RuntimeWeatherDataService {
  return new RuntimeWeatherDataService(options);
}

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

function readEnvBoolean(value: string | undefined): boolean | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return undefined;
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

  return "metric";
}

function normalizeQWeatherAdminUnit(value: string | undefined): string {
  if (value === "imperial" || value === "i") {
    return "i";
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

function readMeteoblueApiKey(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson } = readSecretAndConfig(provider);
  return readString(secretJson.apiKey) ?? readEnvString(env.METEOBLUE_API_KEY);
}

function normalizeOpenMeteoMode(value: string | undefined): "free" | "customer" {
  return value === "customer" ? "customer" : "free";
}

function normalizeEndpoint(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
  return /^https?:\/\//i.test(withoutTrailingSlash)
    ? withoutTrailingSlash
    : `https://${withoutTrailingSlash}`;
}

function normalizeMeteobluePackageList(value: JsonValue | string | undefined): readonly string[] {
  const rawPackages = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const packages = rawPackages
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => /^[A-Za-z0-9-]+$/.test(item));

  if (packages.length > 0) {
    return [...new Set(packages)];
  }

  return meteoblueDefaultPackages.split(",");
}

function serializeMeteobluePackageList(value: JsonValue | string | undefined): string {
  return normalizeMeteobluePackageList(value).join(",");
}

export function normalizeOpenMeteoForecastModelList(
  value: JsonValue | string | undefined,
): readonly string[] {
  const rawModels = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const models: string[] = [];

  for (const item of rawModels) {
    const model = typeof item === "string" ? item.trim() : "";
    if (!/^[A-Za-z0-9_-]+$/.test(model) || models.includes(model)) {
      continue;
    }
    models.push(model);
    if (models.length >= openMeteoForecastModelListLimit) {
      break;
    }
  }

  return models;
}

function defaultOpenMeteoForecastModelList(): readonly string[] {
  return normalizeOpenMeteoForecastModelList(openMeteoForecastCloudLayerDefaultModelList);
}

function resolveOpenMeteoForecastModelList(input: {
  readonly configuredModelList?: JsonValue | string;
  readonly envModelList?: string;
  readonly modelPreference?: string;
}): readonly string[] {
  const explicitSource = input.configuredModelList ?? input.envModelList;
  if (explicitSource !== undefined) {
    const explicitModels = normalizeOpenMeteoForecastModelList(explicitSource);
    return explicitModels.length > 0 ? explicitModels : defaultOpenMeteoForecastModelList();
  }

  const preferredModels = normalizeOpenMeteoForecastModelList(input.modelPreference);
  if (preferredModels.length > 0) {
    return normalizeOpenMeteoForecastModelList([
      ...preferredModels,
      "gfs_seamless",
      "gfs_global",
    ]);
  }

  return defaultOpenMeteoForecastModelList();
}

function serializeOpenMeteoForecastModelList(value: JsonValue | string | undefined): string {
  const models = normalizeOpenMeteoForecastModelList(value);
  return (models.length > 0 ? models : defaultOpenMeteoForecastModelList()).join(",");
}

export function resolveQWeatherRuntimeConfig(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedQWeatherRuntimeConfig {
  const { configJson } = readSecretAndConfig(provider);
  const configuredHost = readConfiguredHost(configJson, ["apiHost", "baseUrl", "apiBaseUrl"]);
  const apiHost = configuredHost.provided
    ? configuredHost.value ?? ""
    : readEnvQWeatherApiHost(env) ?? qWeatherDefaultApiHost;
  const baseUrl = apiHost ? buildQWeatherBaseUrl(apiHost) : qWeatherDefaultBaseUrl;
  const realCallEnabled = readWeatherRealCallEnabled(provider, env, "qweather");

  return {
    enabled: provider?.enabled ?? false,
    realCallEnabled,
    priority: provider?.priority ?? 0,
    configUpdatedAt: provider?.updatedAt.toISOString(),
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
  const mode = normalizeOpenMeteoMode(
    readString(configJson.mode) ?? readEnvString(env.OPEN_METEO_MODE),
  );
  const configuredCustomerEndpoint = readOpenMeteoCustomerEndpoint(provider, env);
  const customerEndpoint = normalizeEndpoint(configuredCustomerEndpoint, openMeteoCustomerEndpoint);
  const realCallEnabled = readWeatherRealCallEnabled(provider, env, "open_meteo");
  const endpoint = mode === "customer" ? customerEndpoint : openMeteoFreeEndpoint;
  const modelPreference =
    readString(configJson.modelPreference) ?? readEnvString(env.OPEN_METEO_MODEL_PREFERENCE);
  const modelList = resolveOpenMeteoForecastModelList({
    configuredModelList: Object.prototype.hasOwnProperty.call(configJson, "modelList")
      ? configJson.modelList
      : undefined,
    envModelList: readEnvString(env.OPEN_METEO_MODEL_LIST),
    modelPreference,
  });

  return {
    enabled: provider?.enabled ?? readEnvBoolean(env.OPEN_METEO_ENABLED) ?? false,
    realCallEnabled,
    priority: provider?.priority ?? 0,
    configUpdatedAt: provider?.updatedAt.toISOString(),
    mode,
    apiKeyPresent: Boolean(readOpenMeteoApiKey(provider, env)),
    customerEndpointPresent: Boolean(configuredCustomerEndpoint),
    endpoint,
    baseUrl:
      readString(configJson.baseUrl) ??
      readEnvString(env.OPEN_METEO_BASE_URL) ??
      openMeteoDefaultBaseUrl,
    customerEndpoint,
    defaultModel:
      readString(configJson.defaultModel) ??
      readEnvString(env.OPEN_METEO_DEFAULT_MODEL) ??
      openMeteoDefaultModel,
    modelPreference,
    modelList,
    iconModel:
      readString(configJson.iconModel) ??
      readEnvString(env.OPEN_METEO_ICON_MODEL) ??
      openMeteoIconCloudLayerDefaultModel,
    timezone:
      readString(configJson.timezone) ?? readEnvString(env.OPEN_METEO_TIMEZONE) ?? "Asia/Shanghai",
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
    modeLabelZh: realCallEnabled
      ? mode === "customer"
        ? "商业客户模式"
        : "免费开发模式"
      : "模拟测试",
  };
}

export function resolveMeteoblueRuntimeConfig(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedMeteoblueRuntimeConfig {
  const { configJson } = readSecretAndConfig(provider);
  const packageSource =
    configJson.packages ??
    configJson.packageName ??
    readEnvString(env.METEOBLUE_PACKAGES) ??
    readEnvString(env.METEOBLUE_PACKAGE_NAME);
  const packages = normalizeMeteobluePackageList(packageSource);
  const realCallEnabled =
    env.NODE_ENV === "test"
      ? false
      : readBoolean(configJson.realCallEnabled) ??
        (env.WEATHER_PROVIDER === "meteoblue" && env.WEATHER_PROVIDER_MODE === "real");

  return {
    enabled: provider?.enabled ?? false,
    realCallEnabled,
    priority: provider?.priority ?? 0,
    configUpdatedAt: provider?.updatedAt.toISOString(),
    apiKeyPresent: Boolean(readMeteoblueApiKey(provider, env)),
    baseUrl: normalizeEndpoint(
      readString(configJson.baseUrl) ?? readEnvString(env.METEOBLUE_BASE_URL),
      meteoblueDefaultBaseUrl,
    ),
    packages,
    packageName: packages.join(","),
    timeoutMs: clampInteger(
      readNumber(configJson.timeoutMs) ?? readEnvNumber(env.METEOBLUE_TIMEOUT_MS),
      weatherDefaultTimeoutMs,
      1000,
      30000,
    ),
    retryCount: clampInteger(
      readNumber(configJson.retryCount) ?? readEnvNumber(env.METEOBLUE_RETRY_COUNT),
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
    unit: normalizeQWeatherAdminUnit(readString(current.unit)),
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
  const mode = normalizeOpenMeteoMode(readString(current.mode));
  const normalized: Record<string, JsonValue> = {
    ...current,
    realCallEnabled: readBoolean(current.realCallEnabled) ?? false,
    mode,
    baseUrl: readString(current.baseUrl) ?? openMeteoDefaultBaseUrl,
    defaultModel: readString(current.defaultModel) ?? openMeteoDefaultModel,
    modelList: serializeOpenMeteoForecastModelList(current.modelList),
    iconModel: readString(current.iconModel) ?? openMeteoIconCloudLayerDefaultModel,
    timezone: readString(current.timezone) ?? "Asia/Shanghai",
    timeoutMs: clampInteger(readNumber(current.timeoutMs), weatherDefaultTimeoutMs, 1000, 30000),
    retryCount: clampInteger(readNumber(current.retryCount), weatherDefaultRetryCount, 0, 5),
  };

  if (customerEndpoint) {
    normalized.customerEndpoint = normalizeEndpoint(customerEndpoint, openMeteoCustomerEndpoint);
  } else {
    normalized.customerEndpoint = openMeteoCustomerEndpoint;
  }

  return normalized;
}

export function normalizeMeteoblueAdminConfigJson(
  configJson: JsonValue | undefined,
): Record<string, JsonValue> {
  const current = isJsonObject(configJson) ? { ...configJson } : {};
  const packages = serializeMeteobluePackageList(current.packages ?? current.packageName);
  return {
    ...current,
    realCallEnabled: readBoolean(current.realCallEnabled) ?? false,
    baseUrl: normalizeEndpoint(readString(current.baseUrl), meteoblueDefaultBaseUrl),
    packages,
    packageName: packages,
    timeoutMs: clampInteger(readNumber(current.timeoutMs), weatherDefaultTimeoutMs, 1000, 30000),
    retryCount: clampInteger(readNumber(current.retryCount), weatherDefaultRetryCount, 0, 5),
  };
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

export async function readRuntimeMeteoblueConfig(
  options: WeatherProviderRuntimeOptions = {},
): Promise<RuntimeMeteoblueConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("weather", "meteoblue", {
    client: options.dbClient,
  });
  const resolved = resolveMeteoblueRuntimeConfig(provider, env);

  return {
    ...resolved,
    providerEnabled: resolved.enabled,
    realModeEnabled: resolved.realCallEnabled,
    apiKey: readMeteoblueApiKey(provider, env),
  };
}

export function createMeteoblueClientFromRuntimeConfig(
  config: RuntimeMeteoblueConfig,
  fetcher?: typeof fetch,
): MeteoblueClient {
  if (!config.apiKey) {
    throw new Error("Cannot create meteoblue client without API key.");
  }

  return new MeteoblueClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    packages: config.packages,
    timeoutMs: config.timeoutMs,
    retryCount: config.retryCount,
    fetcher,
  });
}

export function createMeteoblueRealProviderFromRuntimeConfig(
  config: RuntimeMeteoblueConfig,
  fetcher?: typeof fetch,
): MeteoblueRealProvider {
  return new MeteoblueRealProvider({
    client: createMeteoblueClientFromRuntimeConfig(config, fetcher),
    timezone: "Asia/Shanghai",
  });
}

type RuntimeWeatherProviderResolution = {
  readonly providers: readonly WeatherProvider[];
  readonly sourceSummaries: readonly WeatherSourceSummary[];
  readonly runtimeSnapshot: readonly ForecastProviderRuntimeSnapshot[];
  readonly cacheNamespace: string;
};

async function resolveRuntimeWeatherProviders(
  options: WeatherProviderRuntimeOptions,
): Promise<RuntimeWeatherProviderResolution> {
  const [qweather, openMeteo, meteoblue] = await Promise.all([
    readRuntimeQWeatherConfig(options),
    readRuntimeOpenMeteoConfig(options),
    readRuntimeMeteoblueConfig(options),
  ]);
  const providers: WeatherProvider[] = [];
  const sourceSummaries: WeatherSourceSummary[] = [];

  if (qweather.enabled) {
    if (qweather.realCallEnabled && qweather.apiKey && qweather.apiHost) {
      providers.push(
        new QWeatherRealProvider({
          client: new QWeatherClient({
            apiKey: qweather.apiKey,
            apiHost: qweather.apiHost,
            timeoutMs: qweather.timeoutMs,
            retryCount: qweather.retryCount,
            language: qweather.language,
            unit: qweather.unit,
          }),
          unit: qweather.unit,
        }),
      );
    } else if (!qweather.realCallEnabled) {
      providers.push(new QWeatherProvider());
    } else {
      sourceSummaries.push(
        skippedSourceSummary({
          providerCode: "qweather",
          providerLabelZh: "和风天气",
          realCallEnabled: qweather.realCallEnabled,
          messageZh: "和风天气缺少 API Key 或 API Host，未发起真实请求。",
          errorCategory: "missing_config",
        }),
      );
    }
  }

  if (openMeteo.enabled) {
    const customerModeMissingKey =
      openMeteo.realCallEnabled && openMeteo.mode === "customer" && !openMeteo.apiKey;
    if (openMeteo.realCallEnabled && !customerModeMissingKey) {
      providers.push(
        new OpenMeteoIconCloudLayerProvider({
          client: new OpenMeteoIconCloudLayerClient({
            endpoint: openMeteo.mode === "customer" ? openMeteo.endpoint : openMeteo.baseUrl,
            mode: openMeteo.mode,
            apiKey: openMeteo.apiKey,
            timezone: openMeteo.timezone,
            timeoutMs: openMeteo.timeoutMs,
            retryCount: openMeteo.retryCount,
            modelName: openMeteo.modelPreference ?? openMeteo.iconModel,
          }),
          airQualityClient: new OpenMeteoAirQualityClient({
            timezone: openMeteo.timezone,
            timeoutMs: openMeteo.timeoutMs,
            retryCount: openMeteo.retryCount,
          }),
        }),
      );
      for (const modelName of openMeteo.modelList) {
        providers.push(
          new OpenMeteoForecastCloudLayerProvider({
            client: new OpenMeteoForecastCloudLayerClient({
              endpoint: openMeteo.mode === "customer" ? openMeteo.endpoint : openMeteo.baseUrl,
              mode: openMeteo.mode,
              apiKey: openMeteo.apiKey,
              timezone: openMeteo.timezone,
              timeoutMs: openMeteo.timeoutMs,
              retryCount: openMeteo.retryCount,
              modelName,
            }),
            airQualityClient: new OpenMeteoAirQualityClient({
              timezone: openMeteo.timezone,
              timeoutMs: openMeteo.timeoutMs,
              retryCount: openMeteo.retryCount,
            }),
          }),
        );
      }
    } else if (!openMeteo.realCallEnabled) {
      providers.push(new OpenMeteoProvider());
    } else {
      sourceSummaries.push(
        skippedSourceSummary({
          providerCode: "open_meteo",
          providerLabelZh: "Open-Meteo",
          realCallEnabled: openMeteo.realCallEnabled,
          messageZh: "Open-Meteo 客户模式缺少 API Key，未发起真实请求。",
          errorCategory: "missing_config",
        }),
      );
    }
  }

  if (meteoblue.enabled) {
    if (meteoblue.realCallEnabled && meteoblue.apiKey) {
      providers.push(createMeteoblueRealProviderFromRuntimeConfig(meteoblue));
    } else {
      sourceSummaries.push(
        skippedSourceSummary({
          providerCode: "meteoblue",
          providerLabelZh: "meteoblue",
          realCallEnabled: meteoblue.realCallEnabled,
          messageZh: meteoblue.realCallEnabled
            ? "meteoblue 缺少 API Key，未发起真实请求。"
            : "meteoblue 真实调用未启用，未参与融合。",
          errorCategory: meteoblue.realCallEnabled ? "missing_config" : "skipped",
        }),
      );
    }
  }

  const runtimeSnapshot = buildRuntimeSnapshot(qweather, openMeteo, meteoblue);
  return {
    providers: providers.length > 0 ? providers : [new MockWeatherProvider()],
    sourceSummaries,
    runtimeSnapshot,
    cacheNamespace: buildRuntimeCacheNamespace(runtimeSnapshot),
  };
}

function buildRuntimeSnapshot(
  qweather: RuntimeQWeatherConfig,
  openMeteo: RuntimeOpenMeteoConfig,
  meteoblue: RuntimeMeteoblueConfig,
): readonly ForecastProviderRuntimeSnapshot[] {
  return [
    {
      providerCode: "qweather",
      enabled: qweather.enabled,
      realCallEnabled: qweather.realCallEnabled,
      apiKeyPresent: qweather.apiKeyPresent,
      host: maskQWeatherApiHost(qweather.apiHost),
      baseUrl: qweather.baseUrl,
      configUpdatedAt: qweather.configUpdatedAt,
    },
    {
      providerCode: "open_meteo",
      enabled: openMeteo.enabled,
      realCallEnabled: openMeteo.realCallEnabled,
      apiKeyPresent: openMeteo.apiKeyPresent,
      endpoint: openMeteo.endpoint,
      baseUrl: openMeteo.baseUrl,
      parserVersion: openMeteoIconCloudLayerParserVersion,
      modelFamily: "icon",
      modelName: openMeteo.modelPreference ?? openMeteo.iconModel,
      modelList: openMeteo.modelList,
      configUpdatedAt: openMeteo.configUpdatedAt,
    },
    ...openMeteo.modelList.map((modelName) => ({
      providerCode: "open_meteo",
      enabled: openMeteo.enabled,
      realCallEnabled: openMeteo.realCallEnabled,
      apiKeyPresent: openMeteo.apiKeyPresent,
      endpoint: openMeteo.endpoint,
      baseUrl: openMeteo.baseUrl,
      parserVersion: openMeteoForecastCloudLayerParserVersion,
      modelFamily: "open_meteo",
      modelName,
      configUpdatedAt: openMeteo.configUpdatedAt,
    })),
    {
      providerCode: "meteoblue",
      enabled: meteoblue.enabled,
      realCallEnabled: meteoblue.realCallEnabled,
      apiKeyPresent: meteoblue.apiKeyPresent,
      baseUrl: meteoblue.baseUrl,
      packages: meteoblue.packages,
      parserVersion: meteoblueParserVersion,
      configUpdatedAt: meteoblue.configUpdatedAt,
    },
  ];
}

function buildRuntimeCacheNamespace(snapshot: readonly ForecastProviderRuntimeSnapshot[]): string {
  return JSON.stringify(
    snapshot.map((provider) => ({
      providerCode: provider.providerCode,
      enabled: provider.enabled,
      realCallEnabled: provider.realCallEnabled,
      apiKeyPresent: provider.apiKeyPresent,
      host: provider.host,
      baseUrl: provider.baseUrl,
      endpoint: provider.endpoint,
      packages: provider.packages,
      parserVersion: provider.parserVersion,
      modelFamily: provider.modelFamily,
      modelName: provider.modelName,
      modelList: provider.modelList,
      configUpdatedAt: provider.configUpdatedAt,
    })),
  );
}

function skippedSourceSummary(input: {
  readonly providerCode: "qweather" | "open_meteo" | "meteoblue";
  readonly providerLabelZh: string;
  readonly realCallEnabled: boolean;
  readonly messageZh: string;
  readonly errorCategory: "missing_config" | "skipped";
}): WeatherSourceSummary {
  return {
    providerCode: input.providerCode,
    providerLabelZh: input.providerLabelZh,
    dataMode: input.realCallEnabled ? "real" : "mock",
    enabled: true,
    realCallEnabled: input.realCallEnabled,
    attempted: false,
    success: false,
    status: "skipped",
    availableFields: [],
    missingFields: ["weather"],
    errorCategory: input.errorCategory,
    messageZh: input.messageZh,
    warningZh: input.messageZh,
    cacheHit: false,
    generatedAt: new Date().toISOString(),
  };
}

function appendRuntimeResolution(
  bundle: WeatherDataBundle,
  resolution: RuntimeWeatherProviderResolution,
): WeatherDataBundle {
  const withSummaries = appendRuntimeSourceSummaries(bundle, resolution.sourceSummaries);
  return {
    ...withSummaries,
    providerRuntimeSnapshot: resolution.runtimeSnapshot,
  };
}

function appendRuntimeSourceSummaries(
  bundle: WeatherDataBundle,
  extraSummaries: readonly WeatherSourceSummary[],
): WeatherDataBundle {
  if (extraSummaries.length === 0) {
    return bundle;
  }

  const sourceSummaries = mergeSourceSummaries([
    ...(bundle.sourceSummaries ?? []),
    ...extraSummaries,
  ]);
  const extraNotes = extraSummaries
    .map((summary) => summary.warningZh ?? summary.messageZh)
    .filter((message) => message.length > 0);
  const missingDataNotes = [...new Set([...(bundle.missingDataNotes ?? []), ...extraNotes])];

  return {
    ...bundle,
    sourceSummaries,
    missingDataNotes,
    fusionSummary: bundle.fusionSummary
      ? {
          ...bundle.fusionSummary,
          sourceSummaries,
          missingDataNotes,
        }
      : bundle.fusionSummary,
  };
}

function mergeSourceSummaries(
  summaries: readonly WeatherSourceSummary[],
): readonly WeatherSourceSummary[] {
  const byCode = new Map<string, WeatherSourceSummary>();
  for (const summary of summaries) {
    const key = sourceSummaryMergeKey(summary);
    const existing = byCode.get(key);
    if (!existing || (summary.attempted && !existing.attempted)) {
      byCode.set(key, summary);
    }
  }

  return [...byCode.values()];
}

function sourceSummaryMergeKey(summary: WeatherSourceSummary): string {
  return summary.providerId ?? `${summary.providerCode}:${summary.modelName ?? "default"}`;
}
