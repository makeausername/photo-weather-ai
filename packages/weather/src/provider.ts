import type { Coordinates } from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  DailyForecast,
  ForecastRequestOptions,
  HourlyForecast,
  NormalizedWeatherData,
  WeatherAlert,
} from "./types.js";

export interface WeatherProvider {
  getCurrentWeather(coordinates: Coordinates): Promise<CurrentWeather>;
  getHourlyForecast(
    coordinates: Coordinates,
    options?: ForecastRequestOptions,
  ): Promise<HourlyForecast>;
  getDailyForecast(
    coordinates: Coordinates,
    options?: ForecastRequestOptions,
  ): Promise<DailyForecast>;
  getWeatherAlerts(coordinates: Coordinates): Promise<readonly WeatherAlert[]>;
  getAirQuality(coordinates: Coordinates): Promise<AirQuality>;
  normalizeWeatherData(input: unknown): NormalizedWeatherData;
}
