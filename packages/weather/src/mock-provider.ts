import {
  normalizedDailyWeatherSchema,
  normalizedHourlyWeatherSchema,
  type ForecastTarget,
  type NormalizedDailyWeather,
  type NormalizedHourlyWeather,
} from "@photo-weather/shared";
import {
  addHoursInTimezone,
  defaultTimezone,
  formatZonedIso,
  getForecastTargetDates,
  getHourInTimezone,
  getNowInTimezone,
} from "@photo-weather/calendar";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherAlert,
  WeatherRequestInput,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";

const PROVIDER_ID = "mock-weather";
const DATA_SOURCE = {
  providerCode: "mock",
  displayName: "演示天气数据",
  providerLabelZh: "演示数据",
  isMock: true,
  mode: "mock",
} as const;

export class MockWeatherProvider implements WeatherProvider {
  readonly source = DATA_SOURCE;

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    return {
      provider: PROVIDER_ID,
      observedAt: formatZonedIso(getNowInTimezone(defaultTimezone), defaultTimezone),
      coordinates: input.coordinates,
      condition: "partly_cloudy",
      summary: "演示天气数据：碎云与较高能见度，用于体验分析流程。",
      temperatureCelsius: 18.4,
      feelsLikeCelsius: 18.1,
      humidityPercent: 58,
      cloudCoverPercent: 42,
      windSpeedMetersPerSecond: 3.2,
      visibilityKilometers: 28,
    };
  }

  async getHourlyForecast(input: WeatherRequestInput): Promise<readonly NormalizedHourlyWeather[]> {
    const timezone = input.timezone ?? defaultTimezone;
    const forecastStart =
      input.forecastStart ?? formatZonedIso(getNowInTimezone(timezone), timezone);
    const hours = resolveForecastHours(input);

    return this.normalizeHourlyWeather(
      Array.from({ length: hours }, (_, index) =>
        buildMockHour(index, forecastStart, timezone, input.target ?? "general"),
      ),
    );
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const days = Math.min(Math.max(input.days ?? 3, 1), 10);
    const timezone = input.timezone ?? defaultTimezone;
    const dates = resolveTargetDates(days, input, timezone);

    return this.normalizeDailyWeather(
      Array.from({ length: days }, (_, index) => ({
        date: dates[index] ?? dates[dates.length - 1]!,
        tempMin: 12 + index,
        tempMax: 22 + index,
        precipitationProbability: index === 1 ? 24 : 12,
        weatherSummary: index === 1 ? "多云，局地有弱降水" : "多云间晴",
        providerCode: DATA_SOURCE.providerCode,
      })),
    );
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    return {
      provider: PROVIDER_ID,
      observedAt: formatZonedIso(getNowInTimezone(defaultTimezone), defaultTimezone),
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
    "hourly" in input &&
    "daily" in input &&
    "alerts" in input &&
    "providerCode" in input &&
    "providerLabelZh" in input &&
    "dataMode" in input &&
    "generatedAt" in input &&
    "noticeZh" in input
  );
}

function buildMockHour(
  index: number,
  forecastStart: string,
  timezone: string,
  target: ForecastTarget,
): NormalizedHourlyWeather {
  const localHour = getHourInTimezone(addHoursInTimezone(forecastStart, index, timezone), timezone);
  const isMorning = localHour >= 4 && localHour <= 8;
  const isSunset = localHour >= 16 && localHour <= 19;
  const isNight = localHour >= 20 || localHour <= 5;
  const cloudSeaBoost = target === "cloud_sea" && isMorning ? 16 : 0;
  const glowBoost = target === "glow" && (isMorning || isSunset) ? 14 : 0;
  const astroClear = target === "astro" && isNight ? 18 : 0;
  const humidity = clampPercent(
    58 + (isMorning ? 12 : 0) + (isNight ? 8 : 0) + cloudSeaBoost * 0.7 - astroClear * 0.5,
  );
  const cloudLow = clampPercent(
    28 + (index % 7) + (isMorning ? 14 : 0) + cloudSeaBoost - astroClear * 0.6,
  );
  const cloudMid = clampPercent(
    32 + (index % 5) + (isMorning || isSunset ? 12 : 0) + glowBoost - astroClear,
  );
  const cloudHigh = clampPercent(
    26 + (index % 6) + (isMorning || isSunset ? 10 : 0) + glowBoost * 0.8 - astroClear,
  );
  const cloudTotal = Math.min(100, Math.round(Math.max(cloudLow, cloudMid, cloudHigh) + 12));
  const precipitationProbability = clampPercent(
    5 + (cloudTotal > 72 ? 10 : 0) + (target === "general" && index > 18 ? 6 : 0),
  );
  const temperature = round1(17 + Math.sin(((localHour - 6) / 24) * Math.PI * 2) * 4);
  const windSpeed = round1(Math.max(0.8, 2.8 + (localHour >= 13 && localHour <= 17 ? 1.1 : 0)));
  const visibility = round1(
    Math.max(4, 30 - Math.max(0, humidity - 62) * 0.18 - precipitationProbability * 0.08),
  );
  const dewPoint = round1(temperature - Math.max(1.4, (100 - humidity) / 8 + windSpeed * 0.35));

  return {
    time: addHoursInTimezone(forecastStart, index, timezone),
    temperature,
    feelsLike: round1(temperature - windSpeed * 0.2),
    humidity: 58 + (index % 8),
    pressure: 1008,
    windSpeed,
    windGust: round1(windSpeed + 2.1),
    windDirection: (120 + index * 18) % 360,
    precipitationProbability,
    precipitation: precipitationProbability > 55 ? 1.2 : 0,
    visibility,
    dewPoint,
    cloudTotal,
    cloudLow,
    cloudMid,
    cloudHigh,
    weatherCode: index % 3 === 0 ? "mock-partly-cloudy" : "mock-clear",
    providerCode: DATA_SOURCE.providerCode,
    sourceConfidence: 0.78,
    sourceNotes: ["演示天气数据用于体验分析流程。"],
  };
}

function resolveTargetDates(
  days: number,
  options: WeatherRequestInput,
  timezone: string,
): readonly string[] {
  if (options.targetDates && options.targetDates.length > 0) {
    return options.targetDates.slice(0, days);
  }

  const forecastStart =
    options.forecastStart ?? formatZonedIso(getNowInTimezone(timezone), timezone);
  const forecastEnd = addHoursInTimezone(forecastStart, days * 24, timezone);
  const targetDates = getForecastTargetDates(forecastStart, forecastEnd, timezone);

  return targetDates.slice(0, days);
}

function resolveForecastHours(options: WeatherRequestInput): number {
  if (options.forecastStart && options.forecastEnd) {
    const startMs = Date.parse(options.forecastStart);
    const endMs = Date.parse(options.forecastEnd);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      return Math.min(Math.max(Math.ceil((endMs - startMs) / (60 * 60 * 1000)), 1), 168);
    }
  }

  return Math.min(Math.max(options.hours ?? 6, 1), 168);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
