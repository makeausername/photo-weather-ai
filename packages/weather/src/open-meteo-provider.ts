import type { Coordinates, NormalizedDailyWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import { openMeteoForecastFixture } from "./fixture-data.js";
import {
  kmhToMetersPerSecond,
  metersToKilometers,
  normalizeDate,
  normalizeIsoTime,
  nullablePercent,
  nullableRounded,
  percent,
  requiredRounded,
  toNumber,
  toText,
  validateDailyWeather,
  validateHourlyWeather,
  weatherConditionFromCode,
} from "./normalization.js";
import type {
  AirQuality,
  CurrentWeather,
  ForecastRequestOptions,
  NormalizedWeatherData,
  WeatherAlert,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";

const source = {
  providerCode: "open_meteo",
  displayName: "Open-Meteo",
  isMock: false,
  mode: "fixture",
} as const;

type OpenMeteoProviderFixtures = {
  readonly forecast?: unknown;
};

export class OpenMeteoProvider implements WeatherProvider {
  readonly source = source;

  private readonly forecastFixture: unknown;

  constructor(fixtures: OpenMeteoProviderFixtures = {}) {
    this.forecastFixture = fixtures.forecast ?? openMeteoForecastFixture;
  }

  async getCurrentWeather(coordinates: Coordinates): Promise<CurrentWeather> {
    const firstHour = this.normalizeHourlyWeather(this.forecastFixture)[0];
    if (!firstHour) {
      throw new Error("Open-Meteo fixture did not include hourly weather.");
    }

    return {
      provider: source.providerCode,
      observedAt: firstHour.time,
      coordinates,
      condition: weatherConditionFromCode(firstHour.weatherCode),
      summary: "Open-Meteo 夹具数据：仅用于本地归一化验证。",
      temperatureCelsius: firstHour.temperature,
      feelsLikeCelsius: firstHour.feelsLike ?? firstHour.temperature,
      humidityPercent: firstHour.humidity,
      cloudCoverPercent: firstHour.cloudTotal,
      windSpeedMetersPerSecond: firstHour.windSpeed,
      visibilityKilometers: firstHour.visibility ?? 0,
    };
  }

  async getHourlyForecast(
    _coordinates: Coordinates,
    options: ForecastRequestOptions = {},
  ): Promise<readonly NormalizedHourlyWeather[]> {
    const hours = Math.min(Math.max(options.hours ?? 24, 1), 168);
    return this.normalizeHourlyWeather(this.forecastFixture).slice(0, hours);
  }

  async getDailyForecast(
    _coordinates: Coordinates,
    options: ForecastRequestOptions = {},
  ): Promise<readonly NormalizedDailyWeather[]> {
    const days = Math.min(Math.max(options.days ?? 7, 1), 16);
    return this.normalizeDailyWeather(this.forecastFixture).slice(0, days);
  }

  async getWeatherAlerts(_coordinates: Coordinates): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_coordinates: Coordinates): Promise<AirQuality> {
    return {
      provider: source.providerCode,
      observedAt: "2026-05-19T08:35:00+08:00",
      aqi: 45,
      category: "good",
      pm25: 18,
      pm10: 32,
    };
  }

  normalizeHourlyWeather(input: unknown): readonly NormalizedHourlyWeather[] {
    const root = asRecord(input);
    const hourly = asRecord(root.hourly);
    const timeValues = getArray(hourly, "time");
    const offsetSeconds = toNumber(root.utc_offset_seconds) ?? 8 * 60 * 60;

    return validateHourlyWeather(
      timeValues.map((timeValue, index) => {
        const weatherCode = toText(at(hourly, "weather_code", index));
        const cloudLow = nullablePercent(at(hourly, "cloud_cover_low", index));
        const cloudMid = nullablePercent(at(hourly, "cloud_cover_mid", index));
        const cloudHigh = nullablePercent(at(hourly, "cloud_cover_high", index));
        const sourceNotes =
          cloudLow === null || cloudMid === null || cloudHigh === null
            ? ["Open-Meteo 未返回完整云量分层，缺失的 cloudLow/cloudMid/cloudHigh 字段置为空。"]
            : undefined;

        return {
          time: normalizeIsoTime(timeValue, offsetSeconds),
          temperature: requiredRounded(at(hourly, "temperature_2m", index), "hourly.temperature_2m"),
          feelsLike: nullableRounded(at(hourly, "apparent_temperature", index)),
          humidity: percent(at(hourly, "relative_humidity_2m", index), "hourly.relative_humidity_2m"),
          pressure: nullableRounded(at(hourly, "surface_pressure", index)),
          windSpeed: kmhToMetersPerSecond(at(hourly, "wind_speed_10m", index)) ?? 0,
          windGust: kmhToMetersPerSecond(at(hourly, "wind_gusts_10m", index)),
          windDirection: nullableRounded(at(hourly, "wind_direction_10m", index), 0),
          precipitationProbability: percent(
            at(hourly, "precipitation_probability", index) ?? 0,
            "hourly.precipitation_probability",
          ),
          precipitation: nullableRounded(at(hourly, "precipitation", index)),
          visibility: metersToKilometers(at(hourly, "visibility", index)),
          dewPoint: nullableRounded(at(hourly, "dew_point_2m", index)),
          cloudTotal: percent(at(hourly, "cloud_cover", index), "hourly.cloud_cover"),
          cloudLow,
          cloudMid,
          cloudHigh,
          weatherCode,
          providerCode: source.providerCode,
          sourceConfidence: sourceNotes ? 0.78 : 0.86,
          sourceNotes,
        };
      }),
    );
  }

  normalizeDailyWeather(input: unknown): readonly NormalizedDailyWeather[] {
    const root = asRecord(input);
    const daily = asRecord(root.daily);
    const dates = getArray(daily, "time");
    const offsetSeconds = toNumber(root.utc_offset_seconds) ?? 8 * 60 * 60;

    return validateDailyWeather(
      dates.map((dateValue, index) => {
        const date = normalizeDate(dateValue);
        const weatherCode = toText(at(daily, "weather_code", index));

        return {
          date,
          tempMin: requiredRounded(
            at(daily, "temperature_2m_min", index),
            "daily.temperature_2m_min",
          ),
          tempMax: requiredRounded(
            at(daily, "temperature_2m_max", index),
            "daily.temperature_2m_max",
          ),
          precipitationProbability: percent(
            at(daily, "precipitation_probability_max", index) ?? 0,
            "daily.precipitation_probability_max",
          ),
          weatherSummary: describeOpenMeteoCode(weatherCode),
          sunrise: normalizeOptionalDateTime(at(daily, "sunrise", index), offsetSeconds),
          sunset: normalizeOptionalDateTime(at(daily, "sunset", index), offsetSeconds),
        };
      }),
    );
  }

  normalizeWeatherData(input: unknown): NormalizedWeatherData {
    const record = asRecord(input);

    return {
      current: record.current as CurrentWeather,
      hourly: this.normalizeHourlyWeather(input),
      daily: this.normalizeDailyWeather(input),
      alerts: Array.isArray(record.alerts) ? (record.alerts as readonly WeatherAlert[]) : [],
      airQuality:
        typeof record.airQuality === "object" && record.airQuality !== null
          ? (record.airQuality as AirQuality)
          : {
              provider: source.providerCode,
              observedAt: "2026-05-19T08:35:00+08:00",
              aqi: 45,
              category: "good",
              pm25: 18,
              pm10: 32,
            },
      source,
    };
  }
}

function at(record: Record<string, unknown>, key: string, index: number): unknown {
  return getArray(record, key)[index];
}

function getArray(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Open-Meteo fixture must be an object.");
  }

  return input as Record<string, unknown>;
}

function normalizeOptionalDateTime(value: unknown, offsetSeconds: number): string | undefined {
  return toText(value) ? normalizeIsoTime(value, offsetSeconds) : undefined;
}

function describeOpenMeteoCode(code: string | null): string {
  switch (code) {
    case "0":
      return "晴";
    case "1":
    case "2":
      return "少云";
    case "3":
      return "多云";
    case "45":
    case "48":
      return "雾";
    case "61":
    case "63":
    case "65":
    case "80":
    case "81":
    case "82":
      return "降雨";
    case "71":
    case "73":
    case "75":
    case "85":
    case "86":
      return "降雪";
    default:
      return "天气变化";
  }
}
