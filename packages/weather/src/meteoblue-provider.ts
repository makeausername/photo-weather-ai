import type {
  Coordinates,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherAlert,
  WeatherRequestInput,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";
import {
  normalizeDate,
  normalizeIsoTime,
  nullablePercent,
  nullableRounded,
  toNumber,
  toText,
  validateDailyWeather,
  validateHourlyWeather,
  weatherConditionFromCode,
} from "./normalization.js";
import { WeatherProviderError } from "./provider-error.js";

const source = {
  providerCode: "meteoblue",
  displayName: "meteoblue",
  providerLabelZh: "meteoblue 专业增强",
  isMock: false,
  mode: "fixture",
} as const;

export type MeteoblueClientOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly packages: readonly string[];
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly fetcher?: typeof fetch;
};

export type MeteoblueForecastRequest = {
  readonly coordinates: Coordinates;
  readonly elevationMeters?: number;
  readonly timezone?: string;
};

export type MeteoblueConnectionTestResult = {
  readonly success: boolean;
  readonly statusCode: number;
  readonly latencyMs: number;
  readonly baseUrl: string;
  readonly packages: readonly string[];
  readonly sampleLocation: string;
  readonly messageZh: string;
};

type MeteoblueFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
  readonly diagnostics: MeteoblueResponseDiagnostics;
};

const huangshanGuangmingdingWgs84 = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const satisfies Coordinates;

const defaultTestElevationMeters = 1860;
const noUsableMeteoblueFieldsMessage = "meteoblue 返回中未找到可用的 basic-1h/clouds-1h 字段。";
const meteoblueParserMismatchMessage =
  "meteoblue 返回格式与当前解析器不匹配，请检查 packages 配置。";
const meteoblueResponsePreviewLength = 240;

type MeteoblueResponseDiagnostics = {
  readonly providerCode: "meteoblue";
  readonly statusCode?: number;
  readonly contentType?: string;
  readonly topLevelKeys?: readonly string[];
  readonly selectedPackages: readonly string[];
  readonly endpointPath?: string;
  readonly responseSize?: number;
  readonly responsePreview?: string;
};

export function normalizeMeteoblueBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://my.meteoblue.com";
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme;
}

export function normalizeMeteobluePackages(packages: readonly string[]): readonly string[] {
  const normalized = packages
    .map((packageName) => packageName.trim())
    .filter((packageName) => /^[A-Za-z0-9-]+$/.test(packageName));

  return normalized.length > 0 ? [...new Set(normalized)] : ["basic-1h", "clouds-1h"];
}

export function buildMeteoblueForecastUrl(
  options: Pick<MeteoblueClientOptions, "apiKey" | "baseUrl" | "packages">,
  request: MeteoblueForecastRequest,
): string {
  const packages = normalizeMeteobluePackages(options.packages);
  const url = new URL(
    `/packages/${packages.join("_")}`,
    `${normalizeMeteoblueBaseUrl(options.baseUrl)}/`,
  );
  url.searchParams.set("lat", formatCoordinate(request.coordinates.latitude));
  url.searchParams.set("lon", formatCoordinate(request.coordinates.longitude));
  if (typeof request.elevationMeters === "number" && Number.isFinite(request.elevationMeters)) {
    url.searchParams.set("asl", String(Math.round(request.elevationMeters)));
  }
  url.searchParams.set("tz", request.timezone ?? "Asia/Shanghai");
  url.searchParams.set("format", "json");
  url.searchParams.set("apikey", options.apiKey);

  return url.toString();
}

export class MeteoblueClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: MeteoblueClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchForecast(
    request: MeteoblueForecastRequest,
  ): Promise<MeteoblueFetchResult<Record<string, unknown>>> {
    return this.fetchJson<Record<string, unknown>>(
      buildMeteoblueForecastUrl(this.options, request),
    );
  }

  async testConnection(): Promise<MeteoblueConnectionTestResult> {
    const result = await this.fetchForecast({
      coordinates: huangshanGuangmingdingWgs84,
      elevationMeters: defaultTestElevationMeters,
      timezone: "Asia/Shanghai",
    });
    try {
      new MeteoblueRealProvider({
        client: this,
        elevationMeters: defaultTestElevationMeters,
        timezone: "Asia/Shanghai",
      }).normalizeWeatherData(result.body);
    } catch (error) {
      throw normalizeMeteoblueParseError(error, result);
    }

    return {
      success: true,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      baseUrl: normalizeMeteoblueBaseUrl(this.options.baseUrl),
      packages: normalizeMeteobluePackages(this.options.packages),
      sampleLocation: "黄山光明顶",
      messageZh: "meteoblue 连接测试通过。",
    };
  }

  private async fetchJson<TBody>(url: string): Promise<MeteoblueFetchResult<TBody>> {
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
        const diagnostics = buildMeteoblueResponseDiagnostics({
          url,
          statusCode: response.status,
          contentType: response.headers.get("content-type") ?? undefined,
          selectedPackages: normalizeMeteobluePackages(this.options.packages),
          text,
        });
        const body = parseJsonBody<TBody>(text, latencyMs, diagnostics);
        const recordBody = asRecord(body);
        const bodyDiagnostics = {
          ...diagnostics,
          topLevelKeys: Object.keys(recordBody).slice(0, 20),
        };

        if (response.status >= 500 && attempt < attempts) {
          lastError = meteoblueError({
            errorCategory: "provider_error",
            messageZh: `meteoblue 服务返回错误，HTTP 状态码 ${response.status}。`,
            statusCode: response.status,
            latencyMs,
          });
          continue;
        }

        if (
          response.status < 200 ||
          response.status >= 300 ||
          hasMeteoblueErrorPayload(recordBody)
        ) {
          throw meteoblueHttpError(response.status, recordBody, latencyMs);
        }

        return {
          statusCode: response.status,
          body,
          latencyMs,
          diagnostics: bodyDiagnostics,
        };
      } catch (error) {
        lastError = normalizeMeteoblueError(error, Date.now() - startedAt);
        if (attempt >= attempts) {
          throw lastError;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("meteoblue request failed.");
  }
}

function meteoblueError(
  options: Omit<
    ConstructorParameters<typeof WeatherProviderError>[0],
    "providerCode" | "providerLabelZh" | "dataMode"
  >,
): WeatherProviderError {
  return new WeatherProviderError({
    providerCode: "meteoblue",
    providerLabelZh: "meteoblue",
    dataMode: "real",
    ...options,
  });
}

function meteoblueHttpError(
  statusCode: number,
  body: Record<string, unknown>,
  latencyMs: number,
): WeatherProviderError {
  const text = safeMeteoblueErrorText(body);
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /invalid|unauthorized|forbidden|key/i.test(text)
  ) {
    return meteoblueError({
      errorCategory: "invalid_key",
      messageZh: "meteoblue API Key 无效、权限不足或当前数据包未授权。",
      statusCode,
      latencyMs,
    });
  }

  if (statusCode === 404) {
    return meteoblueError({
      errorCategory: "unsupported",
      messageZh: "meteoblue Forecast API 地址或数据包路径不正确。",
      statusCode,
      latencyMs,
    });
  }

  if (statusCode === 429) {
    return meteoblueError({
      errorCategory: "provider_error",
      messageZh: "meteoblue 调用额度或频率受限。",
      statusCode,
      latencyMs,
    });
  }

  if (
    /package|packages|subscription|subscribed|not.*available|access|permission|权限|套餐/i.test(
      text,
    )
  ) {
    return meteoblueError({
      errorCategory: "unsupported",
      messageZh: "meteoblue API Key 无效、权限不足或当前数据包未授权。",
      statusCode,
      latencyMs,
    });
  }

  return meteoblueError({
    errorCategory: "provider_error",
    messageZh: `meteoblue 服务返回错误，HTTP 状态码 ${statusCode}。`,
    statusCode,
    latencyMs,
  });
}

function normalizeMeteoblueError(error: unknown, latencyMs: number): WeatherProviderError {
  if (error instanceof WeatherProviderError) {
    return error;
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return meteoblueError({
      errorCategory: "timeout",
      messageZh: "meteoblue Forecast API 请求超时。",
      latencyMs,
      cause: error,
    });
  }

  return meteoblueError({
    errorCategory: "network",
    messageZh: "meteoblue 网络不可用",
    latencyMs,
    cause: error,
  });
}

export class MeteoblueProvider implements WeatherProvider {
  readonly source = source;

  async getCurrentWeather(_input: WeatherRequestInput): Promise<CurrentWeather> {
    throw new Error(
      "meteoblue real weather calls are not enabled in Weather Intelligence Core V1.",
    );
  }

  async getHourlyForecast(
    _input: WeatherRequestInput,
  ): Promise<readonly NormalizedHourlyWeather[]> {
    return [];
  }

  async getDailyForecast(_input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    return [];
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    throw new Error("meteoblue air quality calls are not enabled in Weather Intelligence Core V1.");
  }

  normalizeHourlyWeather(_input: unknown): readonly NormalizedHourlyWeather[] {
    return [];
  }

  normalizeDailyWeather(_input: unknown): readonly NormalizedDailyWeather[] {
    return [];
  }

  normalizeWeatherData(_input: unknown): NormalizedWeatherData {
    return {
      hourly: [],
      daily: [],
      alerts: [],
      providerCode: source.providerCode,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
      generatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      noticeZh: "专业增强：meteoblue 未启用",
      missingFields: [],
      estimatedFields: [],
    };
  }
}

const realSource = {
  providerCode: "meteoblue",
  displayName: "meteoblue",
  providerLabelZh: "meteoblue",
  isMock: false,
  mode: "real",
} as const;

export type MeteoblueRealProviderOptions = {
  readonly client: MeteoblueClient;
  readonly elevationMeters?: number;
  readonly timezone?: string;
};

export class MeteoblueRealProvider implements WeatherProvider {
  readonly source = realSource;

  private readonly forecastRequests = new Map<
    string,
    Promise<MeteoblueFetchResult<Record<string, unknown>>>
  >();

  constructor(private readonly options: MeteoblueRealProviderOptions) {}

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    const firstHour = (await this.getHourlyForecast(input))[0];
    if (!firstHour) {
      throw meteoblueParseError("meteoblue 返回格式异常");
    }

    return {
      provider: realSource.providerCode,
      observedAt: firstHour.time,
      coordinates: input.coordinates,
      condition: weatherConditionFromCode(firstHour.weatherCode),
      summary: "meteoblue 专业预报",
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
    const hours = Math.min(Math.max(input.hours ?? 24, 1), 168);
    try {
      return this.normalizeHourlyWeather(result.body).slice(0, hours);
    } catch (error) {
      throw normalizeMeteoblueParseError(error, result);
    }
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const result = await this.fetchForecast(input);
    const days = Math.min(Math.max(input.days ?? 7, 1), 16);
    try {
      return this.normalizeDailyWeather(result.body).slice(0, days);
    } catch (error) {
      throw normalizeMeteoblueParseError(error, result);
    }
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    return {
      provider: realSource.providerCode,
      observedAt: new Date().toISOString(),
      aqi: 0,
      category: "good",
      pm25: 0,
      pm10: 0,
    };
  }

  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[] {
    try {
      const root = asRecord(input);
      const data1h = findMeteoblueHourlyRecord(root);
      const timeValues = arrayField(
        data1h,
        "time",
        "timestamp",
        "valid_time",
        "validtime",
        "time_iso8601",
      );
      if (timeValues.length === 0) {
        throw meteoblueParseError(noUsableMeteoblueFieldsMessage);
      }
      if (!hasUsableMeteoblueHourlyFields(data1h)) {
        throw meteoblueParseError(noUsableMeteoblueFieldsMessage);
      }

      return validateHourlyWeather(
        timeValues.map((timeValue, index) => {
          const missingFields = new Set<string>();
          const temperatureValue = nullableRounded(
            pickAt(
              data1h,
              index,
              "temperature",
              "temperature_2m",
              "temperature_instant",
              "temp",
              "airtemperature",
            ),
          );
          if (temperatureValue === null) {
            missingFields.add("temperature");
          }
          const temperature = temperatureValue ?? 0;
          const dewPoint = nullableRounded(
            pickAt(
              data1h,
              index,
              "dewpointtemperature",
              "dewpoint_temperature",
              "dewpoint",
              "dew_point_2m",
            ),
          );
          const cloudLow = nullablePercent(
            pickAt(data1h, index, "lowclouds", "low_clouds", "low_cloud_cover", "cloud_cover_low"),
          );
          const cloudMid = nullablePercent(
            pickAt(
              data1h,
              index,
              "midclouds",
              "mediumclouds",
              "mid_clouds",
              "medium_clouds",
              "mid_cloud_cover",
              "cloud_cover_mid",
            ),
          );
          const cloudHigh = nullablePercent(
            pickAt(
              data1h,
              index,
              "highclouds",
              "high_clouds",
              "high_cloud_cover",
              "cloud_cover_high",
            ),
          );
          const cloudTotal = nullablePercent(
            pickAt(
              data1h,
              index,
              "cloudcover",
              "cloud_cover",
              "totalcloudcover",
              "total_cloud_cover",
              "cloudtotal",
            ),
          );
          const humidityValue = nullablePercent(
            pickAt(
              data1h,
              index,
              "relativehumidity",
              "relative_humidity",
              "relative_humidity_2m",
              "humidity",
            ),
          );
          if (humidityValue === null) {
            missingFields.add("humidity");
          }
          const humidity = humidityValue ?? 0;
          const pressure = nullableRounded(
            pickAt(
              data1h,
              index,
              "sealevelpressure",
              "sea_level_pressure",
              "mslpressure",
              "pressure",
              "pressure_msl",
              "surfacepressure",
            ),
          );
          const windSpeedValue = normalizeNullableWindSpeed(
            pickAt(data1h, index, "windspeed", "wind_speed", "wind_speed_10m"),
          );
          if (windSpeedValue === null) {
            missingFields.add("windSpeed");
          }
          const windSpeed = windSpeedValue ?? 0;
          const windGust = normalizeNullableWindSpeed(
            pickAt(data1h, index, "windgust", "wind_gust", "wind_gusts_10m"),
          );
          const windDirection = nullableRounded(
            pickAt(data1h, index, "winddirection", "wind_direction", "wind_direction_10m"),
            0,
          );
          const precipitationProbability = nullablePercent(
            pickAt(
              data1h,
              index,
              "precipitation_probability",
              "precipitation_probability_1h",
              "precipitationprobability",
              "precipitation_prob",
            ),
          );
          const precipitation = nullableRounded(
            pickAt(data1h, index, "precipitation", "precipitation_amount", "precipitation_1h"),
          );
          const visibility = normalizeVisibilityKm(
            pickAt(data1h, index, "visibility", "visibility_distance"),
          );

          for (const [field, value] of [
            ["cloudLow", cloudLow],
            ["cloudMid", cloudMid],
            ["cloudHigh", cloudHigh],
            ["cloudTotal", cloudTotal],
            ["dewPoint", dewPoint],
            ["pressure", pressure],
            ["windGust", windGust],
            ["windDirection", windDirection],
            ["precipitationProbability", precipitationProbability],
            ["precipitation", precipitation],
            ["visibility", visibility],
          ] as const) {
            if (value === null) {
              missingFields.add(field);
            }
          }

          return {
            time: normalizeIsoTime(timeValue),
            temperature,
            feelsLike: nullableRounded(
              pickAt(data1h, index, "felttemperature", "apparent_temperature", "feels_like"),
            ),
            humidity,
            dewPointSpread: dewPoint === null ? null : roundTo(temperature - dewPoint),
            pressure,
            windSpeed,
            windGust,
            windDirection,
            precipitationProbability: precipitationProbability ?? 0,
            precipitation,
            visibility,
            dewPoint,
            cloudTotal: cloudTotal ?? 0,
            cloudLow,
            cloudMid,
            cloudHigh,
            weatherCode: toText(
              pickAt(
                data1h,
                index,
                "pictocode",
                "pictocode_detailed",
                "weather_code",
                "weathercode",
              ),
            ),
            weatherTextZh: "meteoblue 专业预报",
            providerCode: realSource.providerCode,
            providerLabelZh: realSource.providerLabelZh,
            dataMode: realSource.mode,
            sourceConfidence: missingFields.size > 0 ? 0.78 : 0.9,
            missingFields: missingFields.size > 0 ? [...missingFields] : undefined,
          };
        }),
      );
    } catch (error) {
      throw normalizeMeteoblueParseError(error);
    }
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    try {
      const root = asRecord(input);
      const dataDay = findMeteoblueDailyRecord(root);
      const dates = arrayField(dataDay, "time", "date");
      if (dates.length > 0) {
        return validateDailyWeather(
          dates.map((dateValue, index) => {
            const tempMin = nullableRounded(
              pickAt(
                dataDay,
                index,
                "temperature_min",
                "temperature_minimum",
                "temperature_2m_min",
                "tempmin",
              ),
            );
            const tempMax = nullableRounded(
              pickAt(
                dataDay,
                index,
                "temperature_max",
                "temperature_maximum",
                "temperature_2m_max",
                "tempmax",
              ),
            );
            const missingFields = [
              tempMin === null ? "tempMin" : null,
              tempMax === null ? "tempMax" : null,
            ].filter((field): field is string => field !== null);

            return {
              date: normalizeDate(String(dateValue).slice(0, 10)),
              tempMin: tempMin ?? 0,
              tempMax: tempMax ?? tempMin ?? 0,
              precipitationProbability:
                nullablePercent(
                  pickAt(
                    dataDay,
                    index,
                    "precipitation_probability",
                    "precipitation_probability_max",
                    "precipitationprobability",
                  ),
                ) ?? 0,
              weatherSummary: "meteoblue 专业预报",
              cloudSummary: "包含 meteoblue 可用云量字段",
              providerCode: realSource.providerCode,
              providerLabelZh: realSource.providerLabelZh,
              dataMode: realSource.mode,
              missingFields: missingFields.length > 0 ? missingFields : undefined,
            };
          }),
        );
      }

      return buildDailyFromHourly(this.normalizeHourlyWeather(input));
    } catch (error) {
      throw normalizeMeteoblueParseError(error);
    }
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    try {
      const hourly = this.normalizeHourlyWeather(input);
      const daily = this.normalizeDailyWeather(input);
      return {
        hourly,
        daily,
        alerts: [],
        providerCode: realSource.providerCode,
        providerLabelZh: realSource.providerLabelZh,
        dataMode: realSource.mode,
        generatedAt: hourly[0]?.time ?? new Date().toISOString(),
        noticeZh: "专业增强：meteoblue",
        missingFields: [...new Set(hourly.flatMap((hour) => hour.missingFields ?? []))],
        estimatedFields: [],
      };
    } catch (error) {
      throw normalizeMeteoblueParseError(error);
    }
  }

  private async fetchForecast(
    input: WeatherRequestInput,
  ): Promise<MeteoblueFetchResult<Record<string, unknown>>> {
    const key = JSON.stringify({
      latitude: input.coordinates.latitude,
      longitude: input.coordinates.longitude,
      elevationMeters: input.elevationMeters ?? this.options.elevationMeters,
      timezone: input.timezone ?? this.options.timezone,
    });
    const existing = this.forecastRequests.get(key);
    if (existing) {
      return existing;
    }

    const next = this.options.client.fetchForecast({
      coordinates: input.coordinates,
      elevationMeters: input.elevationMeters ?? this.options.elevationMeters,
      timezone: input.timezone ?? this.options.timezone,
    });
    this.forecastRequests.set(key, next);
    return next;
  }
}

function hasMeteoblueErrorPayload(body: Record<string, unknown>): boolean {
  const message = body.message;
  return (
    typeof body.error === "string" ||
    typeof body.error_message === "string" ||
    (typeof message === "string" && /error|invalid|unauthorized/i.test(message))
  );
}

function safeMeteoblueErrorText(body: Record<string, unknown>): string {
  return [body.error, body.error_message, body.message, body.reason]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function parseJsonBody<TBody>(
  text: string,
  latencyMs: number,
  diagnostics: MeteoblueResponseDiagnostics,
): TBody {
  try {
    return JSON.parse(text) as TBody;
  } catch {
    const error = meteoblueError({
      errorCategory: "parse_error",
      messageZh: "meteoblue 返回格式与当前解析器不匹配，请检查 packages 配置。",
      statusCode: diagnostics.statusCode,
      latencyMs,
    });
    logMeteoblueParseFailure(error, diagnostics);
    throw error;
  }
}

function buildMeteoblueResponseDiagnostics(input: {
  readonly url: string;
  readonly statusCode: number;
  readonly contentType?: string;
  readonly selectedPackages: readonly string[];
  readonly text: string;
}): MeteoblueResponseDiagnostics {
  return {
    providerCode: "meteoblue",
    statusCode: input.statusCode,
    contentType: input.contentType,
    selectedPackages: input.selectedPackages,
    endpointPath: safeEndpointPath(input.url),
    responseSize: input.text.length,
    responsePreview: safeResponsePreview(input.text),
  };
}

function safeEndpointPath(url: string): string | undefined {
  try {
    return new URL(url).pathname;
  } catch {
    return undefined;
  }
}

function safeResponsePreview(text: string): string | undefined {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  return normalized
    .slice(0, meteoblueResponsePreviewLength)
    .replace(
      /((?:apiKey|api_key|apikey|token|authorization|secret)["'\s:=]+)([^"',}\s&]+)/gi,
      "$1[redacted]",
    )
    .replace(/((?:apikey|key|token)=)([^&\s]+)/gi, "$1[redacted]");
}

function formatCoordinate(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(6).replace(/\.?0+$/, "");
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function firstRecord(...values: readonly unknown[]): Record<string, unknown> {
  return values.map(asRecord).find((record) => Object.keys(record).length > 0) ?? {};
}

function findMeteoblueHourlyRecord(root: Record<string, unknown>): Record<string, unknown> {
  return mergeMeteoblueRecords([
    firstRecord(root.data_1h, root.data1h, root.hourly),
    ...collectNestedMeteoblueRecords(root, "hourly"),
  ]);
}

function findMeteoblueDailyRecord(root: Record<string, unknown>): Record<string, unknown> {
  return mergeMeteoblueRecords([
    firstRecord(root.data_day, root.dataDay, root.daily),
    ...collectNestedMeteoblueRecords(root, "daily"),
  ]);
}

function collectNestedMeteoblueRecords(
  input: unknown,
  resolution: "hourly" | "daily",
  depth = 0,
): readonly Record<string, unknown>[] {
  if (depth > 3) {
    return [];
  }

  const record = asRecord(input);
  const records: Record<string, unknown>[] = [];
  if (isMeteoblueResolutionRecord(record, resolution)) {
    records.push(record);
  }

  for (const [key, value] of Object.entries(record)) {
    if (!shouldScanMeteoblueContainer(key, value, resolution)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        records.push(...collectNestedMeteoblueRecords(item, resolution, depth + 1));
      }
    } else {
      records.push(...collectNestedMeteoblueRecords(value, resolution, depth + 1));
    }
  }

  return records;
}

function shouldScanMeteoblueContainer(
  key: string,
  value: unknown,
  resolution: "hourly" | "daily",
): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const normalizedKey = key.toLowerCase().replace(/_/g, "-");
  if (key === "packages" || normalizedKey === "data") {
    return true;
  }

  if (resolution === "hourly") {
    return (
      normalizedKey.includes("1h") ||
      normalizedKey.includes("hour") ||
      normalizedKey === "basic" ||
      normalizedKey === "clouds" ||
      normalizedKey === "forecast"
    );
  }

  return (
    normalizedKey.includes("day") ||
    normalizedKey.includes("daily") ||
    normalizedKey === "basic" ||
    normalizedKey === "clouds" ||
    normalizedKey === "forecast"
  );
}

function isMeteoblueResolutionRecord(
  record: Record<string, unknown>,
  resolution: "hourly" | "daily",
): boolean {
  const timeValues = arrayField(
    record,
    "time",
    "timestamp",
    "valid_time",
    "validtime",
    "time_iso8601",
  );
  if (timeValues.length === 0) {
    return false;
  }

  if (resolution === "daily") {
    return (
      hasNumericArray(
        record,
        "temperature_min",
        "temperature_minimum",
        "temperature_2m_min",
        "tempmin",
      ) ||
      hasNumericArray(
        record,
        "temperature_max",
        "temperature_maximum",
        "temperature_2m_max",
        "tempmax",
      )
    );
  }

  return hasUsableMeteoblueHourlyFields(record);
}

function mergeMeteoblueRecords(
  records: readonly Record<string, unknown>[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (
        merged[key] === undefined ||
        (Array.isArray(merged[key]) && (merged[key] as readonly unknown[]).length === 0)
      ) {
        merged[key] = value;
      }
    }
  }

  return merged;
}

function hasUsableMeteoblueHourlyFields(record: Record<string, unknown>): boolean {
  return (
    hasNumericArray(
      record,
      "temperature",
      "temperature_2m",
      "temperature_instant",
      "temp",
      "airtemperature",
    ) ||
    hasNumericArray(
      record,
      "relativehumidity",
      "relative_humidity",
      "relative_humidity_2m",
      "humidity",
    ) ||
    hasNumericArray(
      record,
      "dewpointtemperature",
      "dewpoint_temperature",
      "dewpoint",
      "dew_point_2m",
    ) ||
    hasNumericArray(
      record,
      "cloudcover",
      "cloud_cover",
      "totalcloudcover",
      "total_cloud_cover",
      "cloudtotal",
    ) ||
    hasNumericArray(record, "lowclouds", "low_clouds", "low_cloud_cover", "cloud_cover_low") ||
    hasNumericArray(
      record,
      "midclouds",
      "mediumclouds",
      "mid_clouds",
      "medium_clouds",
      "mid_cloud_cover",
      "cloud_cover_mid",
    ) ||
    hasNumericArray(record, "highclouds", "high_clouds", "high_cloud_cover", "cloud_cover_high") ||
    hasNumericArray(record, "visibility", "visibility_distance") ||
    hasNumericArray(record, "windspeed", "wind_speed", "wind_speed_10m")
  );
}

function hasNumericArray(record: Record<string, unknown>, ...keys: readonly string[]): boolean {
  return keys.some((key) => arrayField(record, key).some((value) => toNumber(value) !== null));
}

function arrayField(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): readonly unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function pickAt(
  record: Record<string, unknown>,
  index: number,
  ...keys: readonly string[]
): unknown {
  for (const key of keys) {
    const values = arrayField(record, key);
    if (values.length > index) {
      return values[index];
    }
  }

  return undefined;
}

function normalizeNullableWindSpeed(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }

  const metersPerSecond = parsed > 35 ? parsed / 3.6 : parsed;
  return roundTo(Math.max(0, metersPerSecond));
}

function normalizeVisibilityKm(value: unknown): number | null {
  const parsed = toNumber(value);
  if (parsed === null) {
    return null;
  }

  return roundTo(parsed > 1000 ? parsed / 1000 : parsed);
}

function buildDailyFromHourly(
  hourly: readonly NormalizedHourlyWeather[],
): readonly NormalizedDailyWeather[] {
  const byDate = new Map<string, NormalizedHourlyWeather[]>();
  for (const hour of hourly) {
    const date = hour.time.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), hour]);
  }

  return [...byDate.entries()].map(([date, hours]) => ({
    date,
    tempMin: Math.min(...hours.map((hour) => hour.temperature)),
    tempMax: Math.max(...hours.map((hour) => hour.temperature)),
    precipitationProbability: Math.max(...hours.map((hour) => hour.precipitationProbability), 0),
    weatherSummary: "meteoblue 专业预报",
    cloudSummary: "由小时级云量聚合",
    providerCode: realSource.providerCode,
    providerLabelZh: realSource.providerLabelZh,
    dataMode: realSource.mode,
  }));
}

function roundTo(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeMeteoblueParseError(
  error: unknown,
  result?: Pick<MeteoblueFetchResult<unknown>, "statusCode" | "latencyMs" | "diagnostics">,
): WeatherProviderError {
  let normalized: WeatherProviderError;
  if (error instanceof WeatherProviderError) {
    if (result && (error.statusCode === undefined || error.latencyMs === undefined)) {
      normalized = meteoblueError({
        errorCategory: error.errorCategory,
        messageZh: error.messageZh,
        statusCode: error.statusCode ?? result.statusCode,
        latencyMs: error.latencyMs ?? result.latencyMs,
        cause: error,
      });
    } else {
      normalized = error;
    }
  } else {
    normalized = meteoblueParseError(meteoblueParserMismatchMessage, error, result);
  }

  if (normalized.errorCategory === "parse_error") {
    logMeteoblueParseFailure(normalized, result?.diagnostics);
  }

  return normalized;
}

function meteoblueParseError(
  messageZh: string,
  cause?: unknown,
  result?: Pick<MeteoblueFetchResult<unknown>, "statusCode" | "latencyMs">,
): WeatherProviderError {
  return new WeatherProviderError({
    providerCode: "meteoblue",
    providerLabelZh: "meteoblue",
    dataMode: "real",
    errorCategory: "parse_error",
    messageZh: messageZh.endsWith("。") ? messageZh : `${messageZh}。`,
    statusCode: result?.statusCode,
    latencyMs: result?.latencyMs,
    cause,
  });
}

function logMeteoblueParseFailure(
  error: WeatherProviderError,
  diagnostics?: MeteoblueResponseDiagnostics,
): void {
  if (typeof window !== "undefined" || process.env.NODE_ENV === "test") {
    return;
  }

  console.warn("[weather] meteoblue parse failed", {
    providerCode: "meteoblue",
    statusCode: error.statusCode ?? diagnostics?.statusCode,
    contentType: diagnostics?.contentType,
    topLevelKeys: diagnostics?.topLevelKeys ?? [],
    selectedPackages: diagnostics?.selectedPackages ?? [],
    endpointPath: diagnostics?.endpointPath,
    responseSize: diagnostics?.responseSize,
    responsePreview: diagnostics?.responsePreview,
    messageZh: error.messageZh,
  });
}
