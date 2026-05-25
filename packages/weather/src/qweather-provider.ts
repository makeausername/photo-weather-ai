import type { NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import { qweatherDailyFixture, qweatherHourlyFixture } from "./fixture-data.js";
import {
  kmhToMetersPerSecond,
  normalizeClockTime,
  normalizeDate,
  normalizeIsoTime,
  nullableRounded,
  nullablePercent,
  percent,
  requiredRounded,
  toText,
  validateDailyWeather,
  validateHourlyWeather,
  weatherConditionFromCode,
} from "./normalization.js";
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
  providerLabelZh: "和风天气样例数据",
  isMock: false,
  mode: "fixture",
} as const;

type QWeatherProviderFixtures = {
  readonly hourly?: unknown;
  readonly daily?: unknown;
};

export class QWeatherProvider implements WeatherProvider {
  readonly source = source;

  private readonly hourlyFixture: unknown;
  private readonly dailyFixture: unknown;

  constructor(fixtures: QWeatherProviderFixtures = {}) {
    this.hourlyFixture = fixtures.hourly ?? qweatherHourlyFixture;
    this.dailyFixture = fixtures.daily ?? qweatherDailyFixture;
  }

  async getCurrentWeather(input: WeatherRequestInput): Promise<CurrentWeather> {
    const firstHour = this.normalizeHourlyWeather(this.hourlyFixture)[0];
    if (!firstHour) {
      throw new Error("QWeather fixture did not include hourly weather.");
    }

    return {
      provider: source.providerCode,
      observedAt: firstHour.time,
      coordinates: input.coordinates,
      condition: weatherConditionFromCode(firstHour.weatherCode),
      summary: "和风天气样例数据：用于适配校验。",
      temperatureCelsius: firstHour.temperature,
      feelsLikeCelsius: firstHour.feelsLike ?? firstHour.temperature,
      humidityPercent: firstHour.humidity,
      cloudCoverPercent: firstHour.cloudTotal,
      windSpeedMetersPerSecond: firstHour.windSpeed,
      visibilityKilometers: firstHour.visibility ?? 0,
    };
  }

  async getHourlyForecast(input: WeatherRequestInput): Promise<readonly NormalizedHourlyWeather[]> {
    const hours = Math.min(Math.max(input.hours ?? 24, 1), 168);
    return this.normalizeHourlyWeather(this.hourlyFixture).slice(0, hours);
  }

  async getDailyForecast(input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    const days = Math.min(Math.max(input.days ?? 7, 1), 16);
    return this.normalizeDailyWeather(this.dailyFixture).slice(0, days);
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    return {
      provider: source.providerCode,
      observedAt: "2026-05-19T08:35:00+08:00",
      aqi: 38,
      category: "good",
      pm25: 16,
      pm10: 28,
    };
  }

  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[] {
    const hourly = getRecordArray(input, "hourly");
    const cloudLayerMissingFields = ["cloudLow", "cloudMid", "cloudHigh"];
    const notes = [
      "和风天气小时预报未提供低云、中云、高云分层，cloudLow/cloudMid/cloudHigh 置为空。",
    ];

    return validateHourlyWeather(
      hourly.map((record) => {
        const weatherCode = toText(record.icon);
        const weatherTextZh = toText(record.text);
        const windSpeed = kmhToMetersPerSecond(record.windSpeed);
        const precipitationProbability = nullablePercent(record.pop);
        const precipitation = nullableRounded(record.precip);
        const cloudTotal = nullablePercent(record.cloud);
        const missingFields = [...cloudLayerMissingFields];
        const estimatedFields: string[] = [];

        if (windSpeed === null) {
          missingFields.push("windSpeed");
          estimatedFields.push("windSpeed");
        }
        if (precipitationProbability === null) {
          missingFields.push("precipitationProbability");
        }
        if (cloudTotal === null) {
          missingFields.push("cloudTotal");
          estimatedFields.push("cloudTotal");
        }

        return {
          time: normalizeIsoTime(record.fxTime),
          temperature: requiredRounded(record.temp, "hourly.temp"),
          feelsLike: nullableRounded(record.feelsLike ?? record.feelLike),
          humidity: percent(record.humidity, "hourly.humidity"),
          dewPointSpread:
            nullableRounded(record.dew) === null
              ? null
              : roundTo(requiredRounded(record.temp, "hourly.temp") - nullableRounded(record.dew)!),
          pressure: nullableRounded(record.pressure),
          windSpeed: windSpeed ?? 0,
          windGust: kmhToMetersPerSecond(record.windGust),
          windDirection: nullableRounded(record.wind360, 0),
          precipitationProbability,
          precipitationProbabilityPercent: precipitationProbability,
          precipitation,
          precipitationAmountMm: precipitation,
          rainAmountMm:
            inferQWeatherPrecipitationType(weatherCode, weatherTextZh, precipitation) === "rain"
              ? precipitation
              : null,
          snowAmountMm:
            inferQWeatherPrecipitationType(weatherCode, weatherTextZh, precipitation) === "snow"
              ? precipitation
              : null,
          precipitationType: inferQWeatherPrecipitationType(
            weatherCode,
            weatherTextZh,
            precipitation,
          ),
          visibility: nullableRounded(record.vis),
          dewPoint: nullableRounded(record.dew),
          cloudTotal: cloudTotal ?? 0,
          cloudLow: null,
          cloudMid: null,
          cloudHigh: null,
          weatherCode,
          weatherTextZh,
          providerCode: source.providerCode,
          providerLabelZh: source.providerLabelZh,
          dataMode: source.mode,
          sourceConfidence: 0.72,
          missingFields,
          estimatedFields: estimatedFields.length > 0 ? estimatedFields : undefined,
          sourceNotes: notes,
        };
      }),
    );
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    const daily = getRecordArray(input, "daily");

    return validateDailyWeather(
      daily.map((record) => {
        const date = normalizeDate(record.fxDate);
        const textDay = toText(record.textDay) ?? "未知天气";
        const textNight = toText(record.textNight);
        const precipitationProbability = nullablePercent(record.pop);
        const precipitation = nullableRounded(record.precip);
        const weatherSummary = textNight ? `${textDay}转${textNight}` : textDay;

        return {
          date,
          tempMin: requiredRounded(record.tempMin, "daily.tempMin"),
          tempMax: requiredRounded(record.tempMax, "daily.tempMax"),
          precipitationProbability,
          precipitationProbabilityPercent: precipitationProbability,
          precipitation,
          precipitationAmountMm: precipitation,
          rainAmountMm:
            inferQWeatherPrecipitationType(null, weatherSummary, precipitation) === "rain"
              ? precipitation
              : null,
          snowAmountMm:
            inferQWeatherPrecipitationType(null, weatherSummary, precipitation) === "snow"
              ? precipitation
              : null,
          precipitationType: inferQWeatherPrecipitationType(null, weatherSummary, precipitation),
          weatherSummary,
          cloudSummary: "和风天气未提供云层分层",
          sunrise: normalizeClockTime(date, record.sunrise),
          sunset: normalizeClockTime(date, record.sunset),
          providerCode: source.providerCode,
          providerLabelZh: source.providerLabelZh,
          dataMode: source.mode,
          missingFields:
            precipitationProbability === null ? ["precipitationProbability"] : undefined,
        };
      }),
    );
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    const record = asRecord(input);

    return {
      current: record.current as CurrentWeather,
      hourly: this.normalizeHourlyWeather(record.hourly ?? input),
      daily: this.normalizeDailyWeather(record.daily ?? input),
      alerts: Array.isArray(record.alerts) ? (record.alerts as readonly WeatherAlert[]) : [],
      airQuality:
        typeof record.airQuality === "object" && record.airQuality !== null
          ? (record.airQuality as AirQuality)
          : {
              provider: source.providerCode,
              observedAt: "2026-05-19T08:35:00+08:00",
              aqi: 38,
              category: "good",
              pm25: 16,
              pm10: 28,
            },
      providerCode: source.providerCode,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
      generatedAt: normalizeIsoTime(record.updateTime ?? "2026-05-19T08:35+08:00"),
      noticeZh: "天气数据：和风天气样例数据",
      missingFields: ["cloudLow", "cloudMid", "cloudHigh"],
    };
  }
}

function getRecordArray(input: unknown, key: string): readonly Record<string, unknown>[] {
  const record = asRecord(input);
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`QWeather fixture missing ${key} array.`);
  }

  return value.map(asRecord);
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("QWeather fixture must be an object.");
  }

  return input as Record<string, unknown>;
}

function roundTo(value: number): number {
  return Math.round(value * 10) / 10;
}

function inferQWeatherPrecipitationType(
  weatherCode: string | null,
  weatherTextZh: string | null,
  precipitation: number | null,
): "rain" | "snow" | "mixed" | "none" | "unknown" {
  const text = weatherTextZh ?? "";
  if (text.includes("雨夹雪")) {
    return "mixed";
  }
  if (text.includes("雪")) {
    return "snow";
  }
  if (text.includes("雨") || /^3\d{2}$/.test(weatherCode ?? "")) {
    return "rain";
  }
  if ((precipitation ?? 0) > 0) {
    return "rain";
  }
  if (precipitation === 0) {
    return "none";
  }
  return "unknown";
}
