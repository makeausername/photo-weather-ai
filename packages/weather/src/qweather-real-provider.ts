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

  constructor(private readonly options: QWeatherRealProviderOptions) {}

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    const location = formatQWeatherLocation(input.coordinates);
    const result = await this.options.client.fetchWeatherNow(location);
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
    const result = await this.options.client.fetchWeatherHourly(location, input.hours ?? 24);
    return this.normalizer
      .normalizeHourlyWeather(result.body)
      .slice(0, Math.min(Math.max(input.hours ?? 24, 1), 168))
      .map((hour) => ({
        ...hour,
        providerLabelZh: source.providerLabelZh,
        dataMode: source.mode,
      }));
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const location = formatQWeatherLocation(input.coordinates);
    const result = await this.options.client.fetchWeatherDaily(location, input.days ?? 7);
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
      aqi: 0,
      category: "good",
      pm25: 0,
      pm10: 0,
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
}
