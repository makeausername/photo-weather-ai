import {
  normalizedDailyWeatherSchema,
  normalizedHourlyWeatherSchema,
  type Coordinates,
  type NormalizedDailyWeather,
  type NormalizedHourlyWeather,
} from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  ForecastRequestOptions,
  NormalizedWeatherData,
  WeatherAlert,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";

const BASE_TIME = "2026-01-01T06:00:00.000Z";
const PROVIDER_ID = "mock-weather";
const DATA_SOURCE = {
  providerCode: "mock",
  displayName: "模拟天气数据",
  isMock: true,
  mode: "mock",
} as const;

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
  readonly source = DATA_SOURCE;

  async getCurrentWeather(coordinates: Coordinates): Promise<CurrentWeather> {
    return {
      provider: PROVIDER_ID,
      observedAt: BASE_TIME,
      coordinates,
      condition: "partly_cloudy",
      summary: "本地模拟天气：碎云与较高能见度，用于验证流程。",
      temperatureCelsius: 18.4,
      feelsLikeCelsius: 18.1,
      humidityPercent: 58,
      cloudCoverPercent: 42,
      windSpeedMetersPerSecond: 3.2,
      visibilityKilometers: 28,
    };
  }

  async getHourlyForecast(
    _coordinates: Coordinates,
    options: ForecastRequestOptions = {},
  ): Promise<readonly NormalizedHourlyWeather[]> {
    const hours = Math.min(Math.max(options.hours ?? 6, 1), 168);

    return this.normalizeHourlyWeather(Array.from({ length: hours }, (_, index) => buildMockHour(index)));
  }

  async getDailyForecast(
    _coordinates: Coordinates,
    options: ForecastRequestOptions = {},
  ): Promise<readonly NormalizedDailyWeather[]> {
    const days = Math.min(Math.max(options.days ?? 3, 1), 10);

    return this.normalizeDailyWeather(
      Array.from({ length: days }, (_, index) => ({
        date: addDays(index),
        tempMin: 12 + index,
        tempMax: 22 + index,
        precipitationProbability: index === 1 ? 24 : 12,
        weatherSummary: index === 1 ? "多云，局地有弱降水" : "多云间晴",
        sunrise: `${addDays(index)}T06:42:00.000Z`,
        sunset: `${addDays(index)}T17:28:00.000Z`,
      })),
    );
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

  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[] {
    if (!Array.isArray(input)) {
      throw new Error("MockWeatherProvider hourly input must be an array.");
    }

    return input.map((point) => normalizedHourlyWeatherSchema.parse(point));
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    if (!Array.isArray(input)) {
      throw new Error("MockWeatherProvider daily input must be an array.");
    }

    return input.map((point) => normalizedDailyWeatherSchema.parse(point));
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
    "airQuality" in input &&
    "source" in input
  );
}

function buildMockHour(index: number): NormalizedHourlyWeather {
  const cloudLow = 28 + (index % 7);
  const cloudMid = 32 + (index % 5);
  const cloudHigh = 26 + (index % 6);
  const cloudTotal = Math.min(100, Math.round(Math.max(cloudLow, cloudMid, cloudHigh) + 12));
  const precipitationProbability = index > 3 ? 12 : 4;
  const temperature = round1(17 + index * 0.4);
  const windSpeed = round1(2.8 + index * 0.1);

  return {
    time: addHours(index),
    temperature,
    feelsLike: round1(temperature - windSpeed * 0.2),
    humidity: 58 + (index % 8),
    pressure: 1008,
    windSpeed,
    windGust: round1(windSpeed + 2.1),
    windDirection: (120 + index * 18) % 360,
    precipitationProbability,
    precipitation: precipitationProbability > 55 ? 1.2 : 0,
    visibility: 26,
    dewPoint: round1(temperature - 5.2),
    cloudTotal,
    cloudLow,
    cloudMid,
    cloudHigh,
    weatherCode: index % 3 === 0 ? "mock-partly-cloudy" : "mock-clear",
    providerCode: PROVIDER_ID,
    sourceConfidence: 0.78,
    sourceNotes: ["本地模拟天气数据用于流程验证。"],
  };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
