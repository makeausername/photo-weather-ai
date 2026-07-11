import type { NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import {
  formatQWeatherLocation,
  type QWeatherClient,
  type QWeatherUnit,
} from "./qweather-client.js";
import { QWeatherProvider } from "./qweather-provider.js";
import { weatherConditionFromCode } from "./normalization.js";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherAlert,
  WeatherRequestInput,
  WeatherSourceSummary,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";

const source = {
  providerCode: "qweather",
  displayName: "和风天气",
  providerLabelZh: "和风天气",
  isMock: false,
  mode: "real",
} as const;

export type QWeatherRealProviderOptions = {
  readonly client: QWeatherClient;
  readonly unit?: QWeatherUnit;
};

export class QWeatherRealProvider implements WeatherProvider {
  readonly source = source;

  private readonly normalizer = new QWeatherProvider();
  private statusCode: number | undefined;
  private latencyMs = 0;
  private returnedHours = 0;

  constructor(private readonly options: QWeatherRealProviderOptions) {}

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    const location = formatQWeatherLocation(input.coordinates);
    const result = await this.options.client.fetchWeatherNow(location);
    this.recordFetch(result.statusCode, result.latencyMs);
    const now = result.body.now ?? {};
    const weatherCode = typeof now.icon === "string" ? now.icon : null;
    const temperature = Number(now.temp);
    const humidity = Number(now.humidity);
    const cloudTotal = Number(now.cloud);
    const windSpeedKmh = Number(now.windSpeed);
    const visibility = Number(now.vis);

    return {
      provider: source.providerCode,
      observedAt:
        typeof now.obsTime === "string" ? now.obsTime : new Date().toISOString(),
      coordinates: input.coordinates,
      condition: weatherConditionFromCode(weatherCode),
      summary: typeof now.text === "string" ? now.text : "和风天气实时天气",
      temperatureCelsius: Number.isFinite(temperature) ? temperature : 0,
      feelsLikeCelsius: Number.isFinite(Number(now.feelsLike))
        ? Number(now.feelsLike)
        : Number.isFinite(temperature)
          ? temperature
          : 0,
      humidityPercent: Number.isFinite(humidity) ? humidity : 0,
      cloudCoverPercent: Number.isFinite(cloudTotal) ? cloudTotal : 0,
      windSpeedMetersPerSecond: Number.isFinite(windSpeedKmh)
        ? Math.round((windSpeedKmh / 3.6) * 10) / 10
        : 0,
      visibilityKilometers: Number.isFinite(visibility) ? visibility : 0,
    };
  }

  async getHourlyForecast(input: WeatherRequestInput): Promise<readonly NormalizedHourlyWeather[]> {
    const location = formatQWeatherLocation(input.coordinates);
    const hours = Math.min(Math.max(requestedHourlyResponseHours(input), 1), 168);
    const result = await this.options.client.fetchWeatherHourly(location, hours);
    this.recordFetch(result.statusCode, result.latencyMs);
    const normalized = this.normalizer
      .normalizeHourlyWeather(result.body)
      .slice(0, hours)
      .map((hour) => ({
        ...hour,
        providerLabelZh: source.providerLabelZh,
        dataMode: source.mode,
      }));
    this.returnedHours = normalized.length;
    return normalized;
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const location = formatQWeatherLocation(input.coordinates);
    const result = await this.options.client.fetchWeatherDaily(location, input.days ?? 7);
    this.recordFetch(result.statusCode, result.latencyMs);
    return this.normalizer
      .normalizeDailyWeather(result.body)
      .slice(0, Math.min(Math.max(input.days ?? 7, 1), 16))
      .map((day) => ({
        ...day,
        providerLabelZh: source.providerLabelZh,
        dataMode: source.mode,
      }));
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    return {
      provider: source.providerCode,
      observedAt: new Date().toISOString(),
      availability: "unavailable",
      aqi: null,
      category: null,
      pm25: null,
      pm10: null,
    };
  }

  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[] {
    return this.normalizer.normalizeHourlyWeather(input).map((hour) => ({
      ...hour,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
    }));
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    return this.normalizer.normalizeDailyWeather(input).map((day) => ({
      ...day,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
    }));
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    const normalized = this.normalizer.normalizeWeatherData(input);
    return {
      ...normalized,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
      noticeZh: "天气数据：和风天气",
    };
  }

  getSourceSummaryMetadata(): Partial<WeatherSourceSummary> {
    return {
      providerId: "qweather",
      sourceFamily: "qweather",
      statusCode: this.statusCode,
      latencyMs: this.latencyMs,
      returnedHours: this.returnedHours,
    };
  }

  private recordFetch(statusCode: number, latencyMs: number): void {
    this.statusCode = statusCode;
    this.latencyMs = Math.max(this.latencyMs, latencyMs);
  }
}

function requestedHourlyResponseHours(input: WeatherRequestInput): number {
  const requestedHours =
    typeof input.hours === "number" && Number.isFinite(input.hours) && input.hours > 0
      ? Math.round(input.hours)
      : 24;
  const requestedDayHours =
    typeof input.days === "number" && Number.isFinite(input.days) && input.days > 0
      ? Math.round(input.days) * 24
      : 0;
  return Math.max(requestedHours, requestedDayHours);
}
