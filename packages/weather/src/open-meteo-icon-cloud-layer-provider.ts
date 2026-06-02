import type {
  Coordinates,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  NormalizedWeatherFieldMetadataMap,
} from "@photo-weather/shared";
import {
  metersToKilometers,
  normalizeDate,
  normalizeIsoTime,
  nullablePercent,
  nullableRounded,
  percent,
  requiredRounded,
  toNumber,
  toText,
  validateDailyWeather,
  validateHourlyWeather,
  weatherConditionFromCode,
} from "./normalization.js";
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

export const openMeteoIconCloudLayerProviderName = "openMeteoIconCloudLayerProvider";
export const openMeteoIconCloudLayerDefaultEndpoint = "https://api.open-meteo.com/v1/forecast";
export const openMeteoIconCloudLayerDefaultModel = "icon_global";
export const openMeteoIconCloudLayerMinimumForecastHours = 72;
export const openMeteoIconCloudLayerParserVersion = "open-meteo-icon-cloud-layer-v1";

export const openMeteoIconRequiredCloudLayerFields = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
] as const;

const openMeteoIconStableCompanionFields = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "visibility",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "weather_code",
] as const;

const openMeteoIconOptionalCompanionFields = [
  "precipitation_probability",
  "pressure_msl",
  "surface_pressure",
  "rain",
  "snowfall",
] as const;

const openMeteoIconDailyFields = [
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
  displayName: "Open-Meteo ICON cloud layers",
  providerLabelZh: "云层分层辅助",
  isMock: false,
  mode: "real",
} as const;

type OpenMeteoIconCloudLayerMode = "free" | "customer";

export type OpenMeteoIconCloudLayerClientOptions = {
  readonly endpoint?: string;
  readonly mode?: OpenMeteoIconCloudLayerMode;
  readonly apiKey?: string;
  readonly timezone?: string;
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly modelName?: string;
  readonly fetcher?: typeof fetch;
};

export type OpenMeteoIconCloudLayerRequest = {
  readonly coordinates: Coordinates;
  readonly elevationMeters?: number;
  readonly forecastHours?: number;
  readonly timezone?: string;
  readonly locationName?: string;
};

export type OpenMeteoIconCloudLayerFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
  readonly requestedForecastHours: number;
  readonly returnedHours: number;
  readonly timezone: string;
  readonly elevationBasis: "explicit_elevation" | "default_dem";
  readonly modelName: string;
};

type OpenMeteoIconCloudLayerMetadata = {
  readonly sourceFamily: "open_meteo";
  readonly modelFamily: "icon";
  readonly modelName: string;
  readonly basis: "explicit_cloud_layers";
  readonly requestedForecastHours: number;
  readonly returnedHours: number;
  readonly timezone: string;
  readonly elevationBasis: "explicit_elevation" | "default_dem";
  readonly parserVersion: string;
  readonly fallbackRequestUsed: boolean;
};

export type OpenMeteoIconCloudLayerUrlOptions = Required<
  Pick<
    OpenMeteoIconCloudLayerClientOptions,
    "endpoint" | "mode" | "timezone" | "timeoutMs" | "retryCount" | "modelName"
  >
> &
  Pick<OpenMeteoIconCloudLayerClientOptions, "apiKey"> & {
    readonly includeOptionalHourlyFields?: boolean;
  };

export class OpenMeteoIconCloudLayerClient {
  private readonly fetcher: typeof fetch;
  private readonly options: Required<
    Pick<
      OpenMeteoIconCloudLayerClientOptions,
      "endpoint" | "mode" | "timezone" | "timeoutMs" | "retryCount" | "modelName"
    >
  > &
    Pick<OpenMeteoIconCloudLayerClientOptions, "apiKey">;

  constructor(options: OpenMeteoIconCloudLayerClientOptions = {}) {
    this.options = {
      endpoint: options.endpoint ?? openMeteoIconCloudLayerDefaultEndpoint,
      mode: options.mode ?? "free",
      apiKey: options.apiKey,
      timezone: options.timezone ?? "Asia/Shanghai",
      timeoutMs: options.timeoutMs ?? 10000,
      retryCount: options.retryCount ?? 1,
      modelName: options.modelName ?? openMeteoIconCloudLayerDefaultModel,
    };
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchCloudLayers(
    request: OpenMeteoIconCloudLayerRequest,
  ): Promise<OpenMeteoIconCloudLayerFetchResult<Record<string, unknown>>> {
    const fullUrl = buildOpenMeteoIconCloudLayerUrl(this.options, request);
    try {
      return await this.fetchJson(fullUrl, request);
    } catch (error) {
      if (!shouldRetryWithoutOptionalHourlyFields(error)) {
        throw error;
      }

      const fallbackUrl = buildOpenMeteoIconCloudLayerUrl(
        { ...this.options, includeOptionalHourlyFields: false },
        request,
      );
      return this.fetchJson(fallbackUrl, request);
    }
  }

  private async fetchJson(
    url: string,
    request: OpenMeteoIconCloudLayerRequest,
  ): Promise<OpenMeteoIconCloudLayerFetchResult<Record<string, unknown>>> {
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
          lastError = openMeteoIconError({
            errorCategory: "provider_error",
            messageZh: "云层分层源暂不可用。",
            statusCode: response.status,
            latencyMs,
          });
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw openMeteoIconError({
            errorCategory:
              response.status === 401 || response.status === 403 ? "invalid_key" : "provider_error",
            messageZh:
              response.status === 401 || response.status === 403
                ? "云层分层源配置或权限未通过。"
                : "云层分层源暂不可用。",
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
          modelName: this.options.modelName,
        };
      } catch (error) {
        lastError = normalizeOpenMeteoIconError(error, Date.now() - startedAt);
        if (attempt >= attempts) {
          throw lastError;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Open-Meteo ICON request failed.");
  }
}

export async function fetchOpenMeteoIconCloudLayers(
  request: OpenMeteoIconCloudLayerRequest,
  options: OpenMeteoIconCloudLayerClientOptions = {},
): Promise<OpenMeteoIconCloudLayerFetchResult<Record<string, unknown>>> {
  return new OpenMeteoIconCloudLayerClient(options).fetchCloudLayers(request);
}

export type OpenMeteoIconCloudLayerProviderOptions = {
  readonly client: OpenMeteoIconCloudLayerClient;
};

export class OpenMeteoIconCloudLayerProvider implements WeatherProvider {
  readonly source = source;

  private readonly forecastRequests = new Map<
    string,
    Promise<OpenMeteoIconCloudLayerFetchResult<Record<string, unknown>>>
  >();
  private readonly metadataByKey = new Map<string, OpenMeteoIconCloudLayerMetadata>();

  constructor(private readonly options: OpenMeteoIconCloudLayerProviderOptions) {}

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    const hourly = await this.getHourlyForecast(input);
    const firstHour = hourly[0];
    if (!firstHour) {
      throw openMeteoIconError({
        errorCategory: "parse_error",
        messageZh: "云层分层源未返回可用小时数据。",
      });
    }

    return {
      provider: source.providerCode,
      observedAt: firstHour.time,
      coordinates: input.coordinates,
      condition: weatherConditionFromCode(firstHour.weatherCode),
      summary: firstHour.weatherTextZh ?? "云层分层数据",
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
      }).slice(0, responseHours(input.hours));
    } catch (error) {
      throw openMeteoIconError({
        errorCategory: "parse_error",
        messageZh: "云层分层源返回格式异常。",
        cause: error,
      });
    }
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const result = await this.fetchForecast(input);
    try {
      return normalizeOpenMeteoIconDailyWeather(result.body, {
        timezone: input.timezone ?? result.timezone,
      }).slice(0, Math.min(Math.max(input.days ?? 7, 1), 16));
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
    return normalizeOpenMeteoIconCloudLayers(input);
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    return normalizeOpenMeteoIconDailyWeather(input);
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    const hourly = normalizeOpenMeteoIconCloudLayers(input);
    const daily = normalizeOpenMeteoIconDailyWeather(input);

    return {
      current: hourly[0]
        ? {
            provider: source.providerCode,
            observedAt: hourly[0].time,
            coordinates: { latitude: 0, longitude: 0, system: "wgs84" },
            condition: weatherConditionFromCode(hourly[0].weatherCode),
            summary: hourly[0].weatherTextZh ?? "云层分层数据",
            temperatureCelsius: hourly[0].temperature,
            feelsLikeCelsius: hourly[0].feelsLike ?? hourly[0].temperature,
            humidityPercent: hourly[0].humidity,
            cloudCoverPercent: hourly[0].cloudTotal,
            windSpeedMetersPerSecond: hourly[0].windSpeed,
            visibilityKilometers: hourly[0].visibility ?? 0,
          }
        : undefined,
      hourly,
      daily,
      alerts: [],
      providerCode: source.providerCode,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
      generatedAt: hourly[0]?.time ?? new Date().toISOString(),
      noticeZh: "天气数据：云层分层辅助",
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
      providerId: openMeteoIconCloudLayerProviderName,
      sourceFamily: metadata.sourceFamily,
      modelFamily: metadata.modelFamily,
      modelName: metadata.modelName,
      basis: metadata.basis,
      requestedForecastHours: metadata.requestedForecastHours,
      returnedHours: metadata.returnedHours,
      timezone: metadata.timezone,
      elevationBasis: metadata.elevationBasis,
      parserVersion: metadata.parserVersion,
      fallbackRequestUsed: metadata.fallbackRequestUsed,
      availableFields: [...openMeteoIconRequiredCloudLayerFields],
      extractedFields: [...openMeteoIconRequiredCloudLayerFields],
      messageZh: "云层分层源可用。",
    };
  }

  private async fetchForecast(
    input: WeatherRequestInput,
  ): Promise<OpenMeteoIconCloudLayerFetchResult<Record<string, unknown>>> {
    const key = this.cacheKey(input);
    const existing = this.forecastRequests.get(key);
    if (existing) {
      return existing;
    }

    const forecastHours = requestedForecastHours(input.hours);
    const next = this.options.client
      .fetchCloudLayers({
        coordinates: input.coordinates,
        elevationMeters: input.elevationMeters,
        forecastHours,
        timezone: input.timezone,
      })
      .then((result) => {
        this.metadataByKey.set(key, {
          sourceFamily: "open_meteo",
          modelFamily: "icon",
          modelName: result.modelName,
          basis: "explicit_cloud_layers",
          requestedForecastHours: result.requestedForecastHours,
          returnedHours: result.returnedHours,
          timezone: result.timezone,
          elevationBasis: result.elevationBasis,
          parserVersion: openMeteoIconCloudLayerParserVersion,
          fallbackRequestUsed: !hasOptionalHourlyFields(result.body),
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
      timezone: input.timezone,
    });
  }
}

export function buildOpenMeteoIconCloudLayerUrl(
  options: OpenMeteoIconCloudLayerUrlOptions,
  request: OpenMeteoIconCloudLayerRequest,
): string {
  const forecastHours = requestedForecastHours(request.forecastHours);
  const url = new URL(normalizeOpenMeteoForecastEndpoint(options.endpoint));
  url.searchParams.set("latitude", formatCoordinate(request.coordinates.latitude));
  url.searchParams.set("longitude", formatCoordinate(request.coordinates.longitude));
  url.searchParams.set("timezone", request.timezone ?? options.timezone);
  url.searchParams.set(
    "hourly",
    hourlyFields(options.includeOptionalHourlyFields !== false).join(","),
  );
  url.searchParams.set("daily", openMeteoIconDailyFields.join(","));
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("forecast_days", String(daysFromHours(forecastHours)));
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timeformat", "iso8601");
  url.searchParams.set("models", options.modelName);

  if (typeof request.elevationMeters === "number" && Number.isFinite(request.elevationMeters)) {
    url.searchParams.set("elevation", formatNumber(request.elevationMeters));
  }
  if (options.mode === "customer" && options.apiKey) {
    url.searchParams.set("apikey", options.apiKey);
  }

  return url.toString();
}

export function normalizeOpenMeteoIconCloudLayers(
  input: unknown,
  options: {
    readonly timezone?: string;
    readonly elevationMeters?: number;
    readonly forecastHours?: number;
  } = {},
): readonly NormalizedHourlyWeather[] {
  const root = asRecord(input);
  const hourly = asRecord(root.hourly);
  const timeValues = getArray(hourly, "time");
  const offsetSeconds = toNumber(root.utc_offset_seconds) ?? 8 * 60 * 60;
  const providerElevationMeters = toNumber(root.elevation) ?? undefined;

  return validateHourlyWeather(
    timeValues.map((timeValue, index) => {
      const temperature = requiredRounded(
        at(hourly, "temperature_2m", index),
        "hourly.temperature_2m",
      );
      const dewPoint = nullableRounded(at(hourly, "dew_point_2m", index));
      const cloudLow = nullablePercent(at(hourly, "cloud_cover_low", index));
      const cloudMid = nullablePercent(at(hourly, "cloud_cover_mid", index));
      const cloudHigh = nullablePercent(at(hourly, "cloud_cover_high", index));
      const precipitationProbability = nullablePercent(
        at(hourly, "precipitation_probability", index),
      );
      const precipitation = nullableRounded(at(hourly, "precipitation", index));
      const rainAmount = nullableRounded(at(hourly, "rain", index));
      const snowAmount = nullableRounded(at(hourly, "snowfall", index));
      const windSpeed = nullableRounded(at(hourly, "wind_speed_10m", index));
      const visibility = metersToKilometers(at(hourly, "visibility", index));
      const pressureMsl = nullableRounded(at(hourly, "pressure_msl", index));
      const pressureFallback = nullableRounded(at(hourly, "surface_pressure", index));
      const weatherCode = toText(at(hourly, "weather_code", index));
      const missingFields = missingHourlyFields({
        cloudLow,
        cloudMid,
        cloudHigh,
        precipitationProbability,
        windSpeed,
        visibility,
        pressure: pressureMsl ?? pressureFallback,
      });
      const estimatedFields =
        pressureMsl === null && pressureFallback !== null ? ["pressure"] : [];
      const cloudTotal = percent(at(hourly, "cloud_cover", index), "hourly.cloud_cover");

      return {
        time: normalizeIsoTime(timeValue, offsetSeconds),
        temperature,
        feelsLike: nullableRounded(at(hourly, "apparent_temperature", index)),
        humidity: percent(at(hourly, "relative_humidity_2m", index), "hourly.relative_humidity_2m"),
        dewPointSpread: dewPoint === null ? null : roundTo(temperature - dewPoint),
        pressure: pressureMsl ?? pressureFallback,
        windSpeed: windSpeed ?? 0,
        windGust: nullableRounded(at(hourly, "wind_gusts_10m", index)),
        windDirection: nullableRounded(at(hourly, "wind_direction_10m", index), 0),
        precipitationProbability,
        precipitationProbabilityPercent: precipitationProbability,
        precipitation,
        precipitationAmountMm: precipitation,
        rainAmountMm: rainAmount,
        snowAmountMm: snowAmount,
        precipitationType: inferOpenMeteoPrecipitationType({
          weatherCode,
          weatherTextZh: describeOpenMeteoWeatherCode(weatherCode),
          rainAmount,
          snowAmount,
          precipitation,
        }),
        visibility,
        rawVisibilityKm: visibility,
        dewPoint,
        cloudTotal,
        cloudLow,
        cloudMid,
        cloudHigh,
        providerElevationMeters,
        selectedSpotElevationMeters: options.elevationMeters,
        elevationDifferenceMeters:
          typeof providerElevationMeters === "number" &&
          typeof options.elevationMeters === "number" &&
          Number.isFinite(options.elevationMeters)
            ? Math.round(options.elevationMeters - providerElevationMeters)
            : undefined,
        weatherCode,
        weatherTextZh: describeOpenMeteoWeatherCode(weatherCode),
        providerCode: source.providerCode,
        providerLabelZh: source.providerLabelZh,
        dataMode: source.mode,
        sourceConfidence: missingFields.length > 0 ? 0.82 : 0.9,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        estimatedFields: estimatedFields.length > 0 ? estimatedFields : undefined,
        sourceNotes:
          missingFields.some((field) => ["cloudLow", "cloudMid", "cloudHigh"].includes(field))
            ? ["云层分层数据不完整，缺失值保持为空。"]
            : undefined,
        fieldMetadata: cloudLayerFieldMetadata({
          cloudTotal,
          cloudLow,
          cloudMid,
          cloudHigh,
          providerElevationMeters,
          selectedSpotElevationMeters: options.elevationMeters,
        }),
      };
    }),
  ).slice(0, responseHours(options.forecastHours));
}

export function normalizeOpenMeteoIconDailyWeather(
  input: unknown,
  _options: { readonly timezone?: string } = {},
): readonly NormalizedDailyWeather[] {
  const root = asRecord(input);
  const dailyValue = root.daily;
  if (typeof dailyValue !== "object" || dailyValue === null || Array.isArray(dailyValue)) {
    return [];
  }
  const daily = dailyValue as Record<string, unknown>;
  const dates = getArray(daily, "time");
  const offsetSeconds = toNumber(root.utc_offset_seconds) ?? 8 * 60 * 60;
  const providerElevationMeters = toNumber(root.elevation) ?? undefined;

  return validateDailyWeather(
    dates.map((dateValue, index) => {
      const date = normalizeDate(dateValue);
      const weatherCode = toText(at(daily, "weather_code", index));
      const precipitationProbability = nullablePercent(
        at(daily, "precipitation_probability_max", index),
      );
      const precipitation = nullableRounded(at(daily, "precipitation_sum", index));
      const rainAmount = nullableRounded(at(daily, "rain_sum", index));
      const snowAmount = nullableRounded(at(daily, "snowfall_sum", index));

      return {
        date,
        tempMin: requiredRounded(
          at(daily, "temperature_2m_min", index),
          "daily.temperature_2m_min",
        ),
        tempMax: requiredRounded(
          at(daily, "temperature_2m_max", index),
          "daily.temperature_2m_max",
        ),
        precipitationProbability,
        precipitationProbabilityPercent: precipitationProbability,
        precipitation,
        precipitationAmountMm: precipitation,
        rainAmountMm: rainAmount,
        snowAmountMm: snowAmount,
        precipitationType: inferOpenMeteoPrecipitationType({
          weatherCode,
          weatherTextZh: describeOpenMeteoWeatherCode(weatherCode),
          rainAmount,
          snowAmount,
          precipitation,
        }),
        weatherSummary: describeOpenMeteoWeatherCode(weatherCode),
        cloudSummary: "低/中/高云分层参考",
        sunrise: normalizeOptionalDateTime(at(daily, "sunrise", index), offsetSeconds),
        sunset: normalizeOptionalDateTime(at(daily, "sunset", index), offsetSeconds),
        providerCode: source.providerCode,
        providerLabelZh: source.providerLabelZh,
        dataMode: source.mode,
        providerElevationMeters,
        missingFields:
          precipitationProbability === null ? ["precipitationProbability"] : undefined,
      };
    }),
  );
}

function hourlyFields(includeOptionalHourlyFields: boolean): readonly string[] {
  return [
    ...openMeteoIconRequiredCloudLayerFields,
    ...openMeteoIconStableCompanionFields,
    ...(includeOptionalHourlyFields ? openMeteoIconOptionalCompanionFields : []),
  ];
}

function openMeteoIconError(
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
      providerId: openMeteoIconCloudLayerProviderName,
      availableFields: [],
      extractedFields: [],
      missingFields: ["cloudTotal", "cloudLow", "cloudMid", "cloudHigh"],
      diagnosticStatus: "icon_layer_source_failed",
      parserVersion: openMeteoIconCloudLayerParserVersion,
    },
    ...options,
  });
}

function normalizeOpenMeteoIconError(error: unknown, latencyMs: number): WeatherProviderError {
  if (error instanceof WeatherProviderError) {
    return error;
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return openMeteoIconError({
      errorCategory: "timeout",
      messageZh: "云层分层源请求超时。",
      latencyMs,
      cause: error,
    });
  }

  return openMeteoIconError({
    errorCategory: "network",
    messageZh: "云层分层源网络不可用。",
    latencyMs,
    cause: error,
  });
}

function shouldRetryWithoutOptionalHourlyFields(error: unknown): boolean {
  return (
    error instanceof WeatherProviderError &&
    error.statusCode !== undefined &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.errorCategory === "provider_error"
  );
}

function normalizeOpenMeteoForecastEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (/\/v1\/(?:forecast|dwd-icon)$/i.test(withScheme)) {
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
    throw openMeteoIconError({
      errorCategory: "parse_error",
      messageZh: "云层分层源返回格式异常。",
      latencyMs,
    });
  }
}

function returnedHoursFromBody(input: unknown): number {
  try {
    const root = asRecord(input);
    const hourly = asRecord(root.hourly);
    return getArray(hourly, "time").length;
  } catch {
    return 0;
  }
}

function hasOptionalHourlyFields(input: unknown): boolean {
  try {
    const root = asRecord(input);
    const hourly = asRecord(root.hourly);
    return openMeteoIconOptionalCompanionFields.some((field) => Array.isArray(hourly[field]));
  } catch {
    return false;
  }
}

function at(record: Record<string, unknown>, key: string, index: number): unknown {
  return getArray(record, key)[index];
}

function getArray(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Open-Meteo ICON response must be an object.");
  }

  return input as Record<string, unknown>;
}

function missingHourlyFields(fields: {
  readonly cloudLow: number | null;
  readonly cloudMid: number | null;
  readonly cloudHigh: number | null;
  readonly precipitationProbability: number | null;
  readonly windSpeed: number | null;
  readonly visibility: number | null;
  readonly pressure: number | null;
}): string[] {
  return [
    fields.cloudLow === null ? "cloudLow" : null,
    fields.cloudMid === null ? "cloudMid" : null,
    fields.cloudHigh === null ? "cloudHigh" : null,
    fields.precipitationProbability === null ? "precipitationProbability" : null,
    fields.windSpeed === null ? "windSpeed" : null,
    fields.visibility === null ? "visibility" : null,
    fields.pressure === null ? "pressure" : null,
  ].filter((field): field is string => field !== null);
}

function cloudLayerFieldMetadata(input: {
  readonly cloudTotal: number | null;
  readonly cloudLow: number | null;
  readonly cloudMid: number | null;
  readonly cloudHigh: number | null;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
}): NormalizedWeatherFieldMetadataMap {
  const elevationDifferenceMeters =
    typeof input.providerElevationMeters === "number" &&
    typeof input.selectedSpotElevationMeters === "number"
      ? Math.round(input.selectedSpotElevationMeters - input.providerElevationMeters)
      : undefined;

  return {
    cloudTotal: fieldMetadata(input.cloudTotal, "total_cloud", input, elevationDifferenceMeters),
    cloudLow: fieldMetadata(input.cloudLow, "explicit_layer", input, elevationDifferenceMeters),
    cloudMid: fieldMetadata(input.cloudMid, "explicit_layer", input, elevationDifferenceMeters),
    cloudHigh: fieldMetadata(input.cloudHigh, "explicit_layer", input, elevationDifferenceMeters),
  };
}

function fieldMetadata(
  value: number | null,
  basis: "explicit_layer" | "total_cloud",
  input: { readonly providerElevationMeters?: number; readonly selectedSpotElevationMeters?: number },
  elevationDifferenceMeters?: number,
) {
  return {
    value,
    providerCode: source.providerCode,
    sourceId: openMeteoIconCloudLayerProviderName,
    providerLabelZh: source.providerLabelZh,
    modelName: openMeteoIconCloudLayerDefaultModel,
    basis: value === null ? ("missing" as const) : basis,
    estimated: false,
    missingReason: value === null ? "provider_field_missing" : undefined,
    providerElevationMeters: input.providerElevationMeters,
    selectedSpotElevationMeters: input.selectedSpotElevationMeters,
    elevationDifferenceMeters,
  };
}

function normalizeOptionalDateTime(value: unknown, offsetSeconds: number): string | undefined {
  return toText(value) ? normalizeIsoTime(value, offsetSeconds) : undefined;
}

function describeOpenMeteoWeatherCode(code: string | null): string {
  switch (code) {
    case "0":
      return "晴";
    case "1":
    case "2":
      return "少云";
    case "3":
      return "多云";
    case "45":
    case "48":
      return "雾";
    case "61":
    case "63":
    case "65":
    case "80":
    case "81":
    case "82":
      return "降雨";
    case "71":
    case "73":
    case "75":
    case "85":
    case "86":
      return "降雪";
    default:
      return "天气变化";
  }
}

function inferOpenMeteoPrecipitationType(input: {
  readonly weatherCode: string | null;
  readonly weatherTextZh: string | null;
  readonly rainAmount: number | null;
  readonly snowAmount: number | null;
  readonly precipitation: number | null;
}): "rain" | "snow" | "mixed" | "none" | "unknown" {
  const rain = input.rainAmount ?? 0;
  const snow = input.snowAmount ?? 0;
  if (rain > 0 && snow > 0) {
    return "mixed";
  }
  if (snow > 0 || input.weatherTextZh?.includes("雪")) {
    return rain > 0 ? "mixed" : "snow";
  }
  if (rain > 0 || input.weatherTextZh?.includes("雨")) {
    return "rain";
  }
  if ((input.precipitation ?? 0) > 0) {
    return "rain";
  }
  if (input.precipitation === 0 || rain === 0 || snow === 0) {
    return "none";
  }
  return "unknown";
}

function roundTo(value: number): number {
  return Math.round(value * 10) / 10;
}
