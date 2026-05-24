import type { NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherAlert,
  WeatherRequestInput,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";

const source = {
  providerCode: "meteoblue",
  displayName: "meteoblue",
  providerLabelZh: "meteoblue 专业增强",
  isMock: false,
  mode: "fixture",
} as const;

export class MeteoblueProvider implements WeatherProvider {
  readonly source = source;

  async getCurrentWeather(_input: WeatherRequestInput): Promise<CurrentWeather> {
    throw new Error("meteoblue real weather calls are not enabled in Weather Intelligence Core V1.");
  }

  async getHourlyForecast(_input: WeatherRequestInput): Promise<readonly NormalizedHourlyWeather[]> {
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
