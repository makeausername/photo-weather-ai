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
import type { WeatherProvider } from "./provider.js";

const BASE_TIME = "2026-01-01T06:00:00.000Z";
const PROVIDER_ID = "mock-weather";

function addHours(hours: number): string {
  const date = new Date(BASE_TIME);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function addDays(days: number): string {
  const date = new Date(BASE_TIME);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class MockWeatherProvider implements WeatherProvider {
  async getCurrentWeather(coordinates: Coordinates): Promise<CurrentWeather> {
    return {
      provider: PROVIDER_ID,
      observedAt: BASE_TIME,
      coordinates,
      condition: "partly_cloudy",
      summary: "Mock golden-hour conditions with broken clouds and high visibility.",
      temperatureCelsius: 18.4,
      feelsLikeCelsius: 18.1,
      humidityPercent: 58,
      cloudCoverPercent: 42,
      windSpeedMetersPerSecond: 3.2,
      visibilityKilometers: 28,
    };
  }

  async getHourlyForecast(
    coordinates: Coordinates,
    options: ForecastRequestOptions = {},
  ): Promise<HourlyForecast> {
    const hours = Math.min(Math.max(options.hours ?? 6, 1), 48);

    return {
      provider: PROVIDER_ID,
      generatedAt: BASE_TIME,
      coordinates,
      hours: Array.from({ length: hours }, (_, index) => ({
        startsAt: addHours(index),
        condition: index % 3 === 0 ? "partly_cloudy" : "clear",
        temperatureCelsius: 17 + index * 0.4,
        precipitationProbabilityPercent: index > 3 ? 12 : 4,
        cloudCoverPercent: 35 + index,
        windSpeedMetersPerSecond: 2.8 + index * 0.1,
        visibilityKilometers: 26,
      })),
    };
  }

  async getDailyForecast(
    coordinates: Coordinates,
    options: ForecastRequestOptions = {},
  ): Promise<DailyForecast> {
    const days = Math.min(Math.max(options.days ?? 3, 1), 10);

    return {
      provider: PROVIDER_ID,
      generatedAt: BASE_TIME,
      coordinates,
      days: Array.from({ length: days }, (_, index) => ({
        date: addDays(index),
        condition: index === 1 ? "cloudy" : "partly_cloudy",
        minTemperatureCelsius: 12 + index,
        maxTemperatureCelsius: 22 + index,
        sunriseAt: `${addDays(index)}T06:42:00.000Z`,
        sunsetAt: `${addDays(index)}T17:28:00.000Z`,
      })),
    };
  }

  async getWeatherAlerts(_coordinates: Coordinates): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_coordinates: Coordinates): Promise<AirQuality> {
    return {
      provider: PROVIDER_ID,
      observedAt: BASE_TIME,
      aqi: 42,
      category: "good",
      pm25: 18,
      pm10: 32,
    };
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    if (isNormalizedWeatherData(input)) {
      return input;
    }

    throw new Error("MockWeatherProvider can only normalize already-normalized sample data.");
  }
}

function isNormalizedWeatherData(input: unknown): input is NormalizedWeatherData {
  return (
    typeof input === "object" &&
    input !== null &&
    "current" in input &&
    "hourly" in input &&
    "daily" in input &&
    "alerts" in input &&
    "airQuality" in input
  );
}
