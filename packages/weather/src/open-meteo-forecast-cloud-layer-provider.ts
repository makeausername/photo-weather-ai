import type {
  Coordinates,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  NormalizedWeatherFieldMetadataMap,
} from "@photo-weather/shared";
import { weatherConditionFromCode } from "./normalization.js";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherAlert,
  WeatherRequestInput,
  WeatherSourceSummary,
} from "./types.js";
import { WeatherProviderError } from "./provider-error.js";
import type { WeatherProvider } from "./provider.js";
import {
  normalizeOpenMeteoIconCloudLayers,
  normalizeOpenMeteoIconDailyWeather,
  openMeteoIconCloudLayerMinimumForecastHours,
} from "./open-meteo-icon-cloud-layer-provider.js";

export const openMeteoForecastCloudLayerProviderName =
  "openMeteoForecastCloudLayerProvider";
export const openMeteoForecastCloudLayerDefaultEndpoint =
  "https://api.open-meteo.com/v1/forecast";
export const openMeteoForecastCloudLayerDefaultModel = "best_match";
export const openMeteoForecastCloudLayerParserVersion =
  "open-meteo-forecast-cloud-layer-v1";

const openMeteoForecastHourlyFields = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "precipitation_probability",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "weather_code",
] as const;

const openMeteoForecastDailyFields = [
  "weather_code",
  "temperature_2m_min",
  "temperature_2m_max",
  "precipitation_probability_max",
  "precipitation_sum",
  "rain_sum",
  "snowfall_sum",
  "sunrise",
  "sunset",
] as const;

const source = {
  providerCode: "open_meteo",
  displayName: "Open-Meteo Forecast cloud layers",
  providerLabelZh: "云层分层补全",
  isMock: false,
  mode: "real",
} as const;

type OpenMeteoForecastCloudLayerMode = "free" | "customer";

export type OpenMeteoForecastCloudLayerClientOptions = {
  readonly endpoint?: string;
  readonly mode?: OpenMeteoForecastCloudLayerMode;
  readonly apiKey?: string;
  readonly timezone?: string;
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly fetcher?: typeof fetch;
};

export type OpenMeteoForecastCloudLayerRequest = {
  readonly coordinates: Coordinates;
  readonly elevationMeters?: number;
  readonly forecastHours?: number;
  readonly timezone?: string;
};

export type OpenMeteoForecastCloudLayerFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
  readonly requestedForecastHours: number;
  readonly returnedHours: number;
  readonly timezone: string;
  readonly elevationBasis: "explicit_elevation" | "default_dem";
  readonly modelName: string;
};

type OpenMeteoForecastCloudLayerMetadata = {
  readonly sourceFamily: "open_meteo";
  readonly modelFamily: "best_match";
  readonly modelName: string;
  readonly basis: "explicit_cloud_layers";
  readonly requestedForecastHours: number;
  readonly returnedHours: number;
  readonly timezone: string;
  readonly elevationBasis: "explicit_elevation" | "default_dem";
  readonly parserVersion: string;
};

export type OpenMeteoForecastCloudLayerUrlOptions = Required<
  Pick<
    OpenMeteoForecastCloudLayerClientOptions,
    "endpoint" | "mode" | "timezone" | "timeoutMs" | "retryCount"
  >
> &
  Pick<OpenMeteoForecastCloudLayerClientOptions, "apiKey">;

export class OpenMeteoForecastCloudLayerClient {
  private readonly fetcher: typeof fetch;
  private readonly options: Required<
    Pick<
      OpenMeteoForecastCloudLayerClientOptions,
      "endpoint" | "mode" | "timezone" | "timeoutMs" | "retryCount"
    >
  > &
    Pick<OpenMeteoForecastCloudLayerClientOptions, "apiKey">;

  constructor(options: OpenMeteoForecastCloudLayerClientOptions = {}) {
    this.options = {
      endpoint: options.endpoint ?? openMeteoForecastCloudLayerDefaultEndpoint,
      mode: options.mode ?? "free",
      apiKey: options.apiKey,
      timezone: options.timezone ?? "Asia/Shanghai",
      timeoutMs: options.timeoutMs ?? 10000,
      retryCount: options.retryCount ?? 1,
    };
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchCloudLayers(
    request: OpenMeteoForecastCloudLayerRequest,
  ): Promise<OpenMeteoForecastCloudLayerFetchResult<Record<string, unknown>>> {
    return this.fetchJson(buildOpenMeteoForecastCloudLayerUrl(this.options, request), request);
  }

  private async fetchJson(
    url: string,
    request: OpenMeteoForecastCloudLayerRequest,
  ): Promise<OpenMeteoForecastCloudLayerFetchResult<Record<string, unknown>>> {
    const attempts = Math.max(1, Math.round(this.options.retryCount) + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method: "GET",
          signal: controller.signal,
        });
        const text = await response.text();
        const latencyMs = Date.now() - startedAt;
        const body = parseJsonBody(text, latencyMs);

        if (response.status >= 500 && attempt < attempts) {
          lastError = openMeteoForecastError({
            errorCategory: "provider_error",
            messageZh: "云层分层补全源暂不可用。",
            statusCode: response.status,
            latencyMs,
          });
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw openMeteoForecastError({
            errorCategory:
              response.status === 401 || response.status === 403 ? "invalid_key" : "provider_error",
            messageZh:
              response.status === 401 || response.status === 403
                ? "云层分层补全源配置或权限未通过。"
                : "云层分层补全源暂不可用。",
            statusCode: response.status,
            latencyMs,
          });
        }

        return {
          statusCode: response.status,
          body,
          latencyMs,
          requestedForecastHours: requestedForecastHours(request.forecastHours),
          returnedHours: returnedHoursFromBody(body),
          timezone: request.timezone ?? this.options.timezone,
          elevationBasis:
            typeof request.elevationMeters === "number" && Number.isFinite(request.elevationMeters)
              ? "explicit_elevation"
              : "default_dem",
          modelName: openMeteoForecastCloudLayerDefaultModel,
        };
      } catch (error) {
        lastError = normalizeOpenMeteoForecastError(error, Date.now() - startedAt);
        if (attempt >= attempts) {
          throw lastError;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Open-Meteo Forecast cloud-layer request failed.");
  }
}

export class OpenMeteoForecastCloudLayerProvider implements WeatherProvider {
  readonly source = source;

  private readonly forecastRequests = new Map<
    string,
    Promise<OpenMeteoForecastCloudLayerFetchResult<Record<string, unknown>>>
  >();
  private readonly metadataByKey = new Map<string, OpenMeteoForecastCloudLayerMetadata>();

  constructor(
    private readonly options: { readonly client: OpenMeteoForecastCloudLayerClient },
  ) {}

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    const firstHour = (await this.getHourlyForecast(input))[0];
    if (!firstHour) {
      throw openMeteoForecastError({
        errorCategory: "parse_error",
        messageZh: "云层分层补全源未返回可用小时数据。",
      });
    }

    return {
      provider: source.providerCode,
      observedAt: firstHour.time,
      coordinates: input.coordinates,
      condition: weatherConditionFromCode(firstHour.weatherCode),
      summary: firstHour.weatherTextZh ?? "云层分层补全数据",
      temperatureCelsius: firstHour.temperature,
      feelsLikeCelsius: firstHour.feelsLike ?? firstHour.temperature,
      humidityPercent: firstHour.humidity,
      cloudCoverPercent: firstHour.cloudTotal,
      windSpeedMetersPerSecond: firstHour.windSpeed,
      visibilityKilometers: firstHour.visibility ?? 0,
    };
  }

  async getHourlyForecast(input: WeatherRequestInput): Promise<readonly NormalizedHourlyWeather[]> {
    const result = await this.fetchForecast(input);
    try {
      return normalizeOpenMeteoIconCloudLayers(result.body, {
        timezone: input.timezone ?? result.timezone,
        elevationMeters: input.elevationMeters,
        forecastHours: input.hours,
      })
        .slice(0, responseHours(input.hours))
        .map(markOpenMeteoForecastHour);
    } catch (error) {
      throw openMeteoForecastError({
        errorCategory: "parse_error",
        messageZh: "云层分层补全源返回格式异常。",
        cause: error,
      });
    }
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const result = await this.fetchForecast(input);
    try {
      return normalizeOpenMeteoIconDailyWeather(result.body, {
        timezone: input.timezone ?? result.timezone,
      }).map((day) => ({
        ...day,
        providerLabelZh: source.providerLabelZh,
        dataMode: source.mode,
      }));
    } catch {
      return [];
    }
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    return {
      provider: source.providerCode,
      observedAt: new Date().toISOString(),
      aqi: 0,
      category: "good",
      pm25: 0,
      pm10: 0,
    };
  }

  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[] {
    return normalizeOpenMeteoIconCloudLayers(input).map(markOpenMeteoForecastHour);
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    return normalizeOpenMeteoIconDailyWeather(input).map((day) => ({
      ...day,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
    }));
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    const hourly = this.normalizeHourlyWeather(input);
    const daily = this.normalizeDailyWeather(input);

    return {
      hourly,
      daily,
      alerts: [],
      providerCode: source.providerCode,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
      generatedAt: hourly[0]?.time ?? new Date().toISOString(),
      noticeZh: "天气数据：云层分层补全",
      missingFields: [...new Set(hourly.flatMap((hour) => hour.missingFields ?? []))],
      estimatedFields: [...new Set(hourly.flatMap((hour) => hour.estimatedFields ?? []))],
    };
  }

  getSourceSummaryMetadata(input: WeatherRequestInput): Partial<WeatherSourceSummary> | undefined {
    const metadata = this.metadataByKey.get(this.cacheKey(input));
    if (!metadata) {
      return undefined;
    }

    return {
      providerId: openMeteoForecastCloudLayerProviderName,
      sourceFamily: metadata.sourceFamily,
      modelFamily: metadata.modelFamily,
      modelName: metadata.modelName,
      basis: metadata.basis,
      requestedForecastHours: metadata.requestedForecastHours,
      returnedHours: metadata.returnedHours,
      timezone: metadata.timezone,
      elevationBasis: metadata.elevationBasis,
      parserVersion: metadata.parserVersion,
      availableFields: [...openMeteoForecastHourlyFields],
      extractedFields: [...openMeteoForecastHourlyFields],
      messageZh: "云层分层补全源可用。",
    };
  }

  private async fetchForecast(
    input: WeatherRequestInput,
  ): Promise<OpenMeteoForecastCloudLayerFetchResult<Record<string, unknown>>> {
    const key = this.cacheKey(input);
    const existing = this.forecastRequests.get(key);
    if (existing) {
      return existing;
    }

    const next = this.options.client
      .fetchCloudLayers({
        coordinates: input.coordinates,
        elevationMeters: input.elevationMeters,
        forecastHours: requestedForecastHours(input.hours),
        timezone: input.timezone,
      })
      .then((result) => {
        this.metadataByKey.set(key, {
          sourceFamily: "open_meteo",
          modelFamily: "best_match",
          modelName: result.modelName,
          basis: "explicit_cloud_layers",
          requestedForecastHours: result.requestedForecastHours,
          returnedHours: result.returnedHours,
          timezone: result.timezone,
          elevationBasis: result.elevationBasis,
          parserVersion: openMeteoForecastCloudLayerParserVersion,
        });
        return result;
      });
    this.forecastRequests.set(key, next);
    return next;
  }

  private cacheKey(input: WeatherRequestInput): string {
    return JSON.stringify({
      latitude: input.coordinates.latitude,
      longitude: input.coordinates.longitude,
      elevationMeters: input.elevationMeters,
      hours: requestedForecastHours(input.hours),
      horizon: input.horizon,
      forecastWindowAnchorStart: input.forecastWindowAnchorStart,
      timezone: input.timezone,
    });
  }
}

export function buildOpenMeteoForecastCloudLayerUrl(
  options: OpenMeteoForecastCloudLayerUrlOptions,
  request: OpenMeteoForecastCloudLayerRequest,
): string {
  const forecastHours = requestedForecastHours(request.forecastHours);
  const url = new URL(normalizeOpenMeteoForecastEndpoint(options.endpoint));
  url.searchParams.set("latitude", formatCoordinate(request.coordinates.latitude));
  url.searchParams.set("longitude", formatCoordinate(request.coordinates.longitude));
  url.searchParams.set("timezone", request.timezone ?? options.timezone);
  url.searchParams.set("hourly", openMeteoForecastHourlyFields.join(","));
  url.searchParams.set("daily", openMeteoForecastDailyFields.join(","));
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("forecast_days", String(daysFromHours(forecastHours)));
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timeformat", "iso8601");

  if (typeof request.elevationMeters === "number" && Number.isFinite(request.elevationMeters)) {
    url.searchParams.set("elevation", formatNumber(request.elevationMeters));
  }
  if (options.mode === "customer" && options.apiKey) {
    url.searchParams.set("apikey", options.apiKey);
  }

  return url.toString();
}

function markOpenMeteoForecastHour(hour: NormalizedHourlyWeather): NormalizedHourlyWeather {
  return {
    ...hour,
    providerLabelZh: source.providerLabelZh,
    dataMode: source.mode,
    fieldMetadata: markFieldMetadata(hour.fieldMetadata),
  };
}

function markFieldMetadata(
  metadata: NormalizedWeatherFieldMetadataMap | undefined,
): NormalizedWeatherFieldMetadataMap | undefined {
  if (!metadata) {
    return metadata;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([field, value]) => [
      field,
      value
        ? {
            ...value,
            providerLabelZh: source.providerLabelZh,
            sourceId: openMeteoForecastCloudLayerProviderName,
            modelName: openMeteoForecastCloudLayerDefaultModel,
          }
        : value,
    ]),
  );
}

function openMeteoForecastError(
  options: Omit<
    ConstructorParameters<typeof WeatherProviderError>[0],
    "providerCode" | "providerLabelZh" | "dataMode"
  >,
): WeatherProviderError {
  return new WeatherProviderError({
    providerCode: source.providerCode,
    providerLabelZh: source.providerLabelZh,
    dataMode: source.mode,
    sourceSummaryMetadata: {
      providerId: openMeteoForecastCloudLayerProviderName,
      availableFields: [],
      extractedFields: [],
      missingFields: ["cloudTotal", "cloudLow", "cloudMid", "cloudHigh"],
      diagnosticStatus: "forecast_layer_source_failed",
      parserVersion: openMeteoForecastCloudLayerParserVersion,
    },
    ...options,
  });
}

function normalizeOpenMeteoForecastError(error: unknown, latencyMs: number): WeatherProviderError {
  if (error instanceof WeatherProviderError) {
    return error;
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return openMeteoForecastError({
      errorCategory: "timeout",
      messageZh: "云层分层补全源请求超时。",
      latencyMs,
      cause: error,
    });
  }

  return openMeteoForecastError({
    errorCategory: "network",
    messageZh: "云层分层补全源网络不可用。",
    latencyMs,
    cause: error,
  });
}

function normalizeOpenMeteoForecastEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (/\/v1\/forecast$/i.test(withScheme)) {
    return withScheme;
  }
  if (/\/forecast$/i.test(withScheme)) {
    return withScheme;
  }
  const withoutVersion = withScheme.replace(/\/v1$/i, "");

  return `${withoutVersion}/v1/forecast`;
}

function requestedForecastHours(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return openMeteoIconCloudLayerMinimumForecastHours;
  }

  return Math.min(240, Math.max(openMeteoIconCloudLayerMinimumForecastHours, Math.round(value)));
}

function responseHours(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return openMeteoIconCloudLayerMinimumForecastHours;
  }

  return Math.min(240, Math.max(1, Math.round(value)));
}

function daysFromHours(hours: number): number {
  return Math.min(16, Math.max(1, Math.ceil(hours / 24)));
}

function formatCoordinate(value: number): string {
  return formatNumber(value, 6);
}

function formatNumber(value: number, digits = 1): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function parseJsonBody(text: string, latencyMs: number): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw openMeteoForecastError({
      errorCategory: "parse_error",
      messageZh: "云层分层补全源返回格式异常。",
      latencyMs,
    });
  }
}

function returnedHoursFromBody(input: unknown): number {
  try {
    const root = asRecord(input);
    const hourly = asRecord(root.hourly);
    const time = hourly.time;
    return Array.isArray(time) ? time.length : 0;
  } catch {
    return 0;
  }
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Open-Meteo Forecast response must be an object.");
  }

  return input as Record<string, unknown>;
}
