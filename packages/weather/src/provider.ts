import type { Coordinates, NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  ForecastRequestOptions,
  NormalizedWeatherData,
  WeatherDataSource,
  WeatherAlert,
} from "./types.js";

export interface WeatherProvider {
  readonly source: WeatherDataSource;

  getCurrentWeather(coordinates: Coordinates): Promise<CurrentWeather>;
  getHourlyForecast(
    coordinates: Coordinates,
    options?: ForecastRequestOptions,
  ): Promise<readonly NormalizedHourlyWeather[]>;
  getDailyForecast(
    coordinates: Coordinates,
    options?: ForecastRequestOptions,
  ): Promise<readonly NormalizedDailyWeather[]>;
  getWeatherAlerts(coordinates: Coordinates): Promise<readonly WeatherAlert[]>;
  getAirQuality(coordinates: Coordinates): Promise<AirQuality>;
  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[];
  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[];
  normalizeWeatherData(input: unknown): NormalizedWeatherData;
}
