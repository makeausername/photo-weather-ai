import type { NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherDataSource,
  WeatherAlert,
  WeatherRequestInput,
} from "./types.js";

export interface WeatherProvider {
  readonly source: WeatherDataSource;

  getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather>;
  getHourlyForecast(input: WeatherRequestInput): Promise<readonly NormalizedHourlyWeather[]>;
  getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]>;
  getWeatherAlerts(input: WeatherRequestInput): Promise<readonly WeatherAlert[]>;
  getAirQuality(input: WeatherRequestInput): Promise<AirQuality>;
  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[];
  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[];
  normalizeWeatherData(input: unknown): NormalizedWeatherData;
}
