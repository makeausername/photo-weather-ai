import { defaultTimezone } from "@photo-weather/calendar";
import type { JsonValue } from "@photo-weather/db";
import type {
  HistoricalWeatherFetchInput,
  HistoricalWeatherFetchResult,
  HistoricalWeatherProvider,
  HistoricalWeatherSampleInput,
} from "./types.js";

export type OpenMeteoHistoricalWeatherProviderOptions = {
  readonly endpoint?: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
};

const openMeteoHistoricalProviderCode = "open_meteo_historical" as const;
const defaultOpenMeteoHistoricalEndpoint = "https://archive-api.open-meteo.com/v1/archive";

const historicalHourlyFields = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "rain",
  "snowfall",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "pressure_msl",
  "weather_code",
] as const;

export class OpenMeteoHistoricalWeatherProvider implements HistoricalWeatherProvider {
  private readonly endpoint: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: OpenMeteoHistoricalWeatherProviderOptions = {}) {
    this.endpoint = options.endpoint ?? defaultOpenMeteoHistoricalEndpoint;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async fetchHistoricalWeather(
    input: HistoricalWeatherFetchInput,
  ): Promise<HistoricalWeatherFetchResult> {
    const requestedUrl = buildOpenMeteoHistoricalWeatherUrl(this.endpoint, input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(requestedUrl, {
        method: "GET",
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Open-Meteo historical request failed with HTTP ${response.status}.`);
      }

      const body = parseJsonBody(text);
      return {
        sourceProvider: openMeteoHistoricalProviderCode,
        requestedUrl,
        samples: normalizeOpenMeteoHistoricalWeather(body, input),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildOpenMeteoHistoricalWeatherUrl(
  endpoint: string,
  input: HistoricalWeatherFetchInput,
): string {
  const url = new URL(normalizeArchiveEndpoint(endpoint));
  url.searchParams.set("latitude", formatCoordinate(input.latitudeWgs84));
  url.searchParams.set("longitude", formatCoordinate(input.longitudeWgs84));
  url.searchParams.set("start_date", input.startDate);
  url.searchParams.set("end_date", input.endDate);
  url.searchParams.set("timezone", input.timezone ?? defaultTimezone);
  url.searchParams.set("hourly", historicalHourlyFields.join(","));
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("precipitation_unit", "mm");

  return url.toString();
}

export function normalizeOpenMeteoHistoricalWeather(
  body: unknown,
  input: HistoricalWeatherFetchInput,
): readonly HistoricalWeatherSampleInput[] {
  const root = asRecord(body);
  const hourly = asRecord(root.hourly);
  const times = arrayAt(hourly, "time");
  const timezone = text(root.timezone) ?? input.timezone ?? defaultTimezone;
  const offsetSeconds = numberAt(root, "utc_offset_seconds") ?? 8 * 60 * 60;
  const providerElevation = numberAt(root, "elevation") ?? input.elevationMeters ?? null;
  const samples: HistoricalWeatherSampleInput[] = [];

  for (let index = 0; index < times.length; index += 1) {
    const sampleTime = normalizeOpenMeteoTime(times[index], offsetSeconds);
    const temperature = numberAt(hourly, "temperature_2m", index);
    const humidity = numberAt(hourly, "relative_humidity_2m", index);
    if (!sampleTime || temperature === undefined || humidity === undefined) {
      continue;
    }

    const precipitation = numberAt(hourly, "precipitation", index) ?? 0;
    const weatherCode = text(at(hourly, "weather_code", index));
    samples.push({
      spotId: input.spotId ?? null,
      locationKey: input.locationKey,
      locationName: input.locationName,
      latitudeWgs84: input.latitudeWgs84,
      longitudeWgs84: input.longitudeWgs84,
      elevationMeters: providerElevation,
      sourceProvider: openMeteoHistoricalProviderCode,
      sampleTime,
      timezone,
      temperature: round1(temperature),
      humidity: clampPercent(humidity),
      dewPoint: nullableRound(numberAt(hourly, "dew_point_2m", index)),
      windSpeed: nullableRound(numberAt(hourly, "wind_speed_10m", index)) ?? 0,
      windGust: nullableRound(numberAt(hourly, "wind_gusts_10m", index)),
      windDirection: nullableRound(numberAt(hourly, "wind_direction_10m", index), 0),
      precipitationAmount: nullableRound(precipitation) ?? 0,
      precipitationProbability: nullablePercent(
        numberAt(hourly, "precipitation_probability", index),
      ),
      rainAmount: nullableRound(numberAt(hourly, "rain", index)),
      snowAmount: nullableRound(numberAt(hourly, "snowfall", index)),
      cloudTotal: nullablePercent(numberAt(hourly, "cloud_cover", index)),
      cloudLow: nullablePercent(numberAt(hourly, "cloud_cover_low", index)),
      cloudMid: nullablePercent(numberAt(hourly, "cloud_cover_mid", index)),
      cloudHigh: nullablePercent(numberAt(hourly, "cloud_cover_high", index)),
      visibility: metersToKilometers(numberAt(hourly, "visibility", index)),
      pressure: nullableRound(numberAt(hourly, "pressure_msl", index)),
      weatherCode,
      weatherText: describeOpenMeteoWeatherCode(weatherCode),
      rawJson: compactJson({
        time: times[index],
        temperature_2m: temperature,
        relative_humidity_2m: humidity,
        dew_point_2m: at(hourly, "dew_point_2m", index),
        precipitation_probability: at(hourly, "precipitation_probability", index),
        precipitation,
        rain: at(hourly, "rain", index),
        snowfall: at(hourly, "snowfall", index),
        cloud_cover: at(hourly, "cloud_cover", index),
        cloud_cover_low: at(hourly, "cloud_cover_low", index),
        cloud_cover_mid: at(hourly, "cloud_cover_mid", index),
        cloud_cover_high: at(hourly, "cloud_cover_high", index),
        visibility: at(hourly, "visibility", index),
        wind_speed_10m: at(hourly, "wind_speed_10m", index),
        wind_gusts_10m: at(hourly, "wind_gusts_10m", index),
        wind_direction_10m: at(hourly, "wind_direction_10m", index),
        pressure_msl: at(hourly, "pressure_msl", index),
        weather_code: weatherCode,
      }),
    });
  }

  return samples;
}

function normalizeArchiveEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, "");
}

function parseJsonBody(textValue: string): unknown {
  try {
    return JSON.parse(textValue) as unknown;
  } catch {
    throw new Error("Open-Meteo historical response was not valid JSON.");
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayAt(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function at(record: Record<string, unknown>, key: string, index: number): unknown {
  const values = arrayAt(record, key);
  return values[index];
}

function numberAt(
  record: Record<string, unknown>,
  key: string,
  index?: number,
): number | undefined {
  const value = index === undefined ? record[key] : at(record, key, index);
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeOpenMeteoTime(value: unknown, offsetSeconds: number): Date | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const withSeconds = raw.length === 16 ? `${raw}:00` : raw;
  const parsed = new Date(`${withSeconds}${formatOffset(offsetSeconds)}`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? "-" : "+";
  const absoluteMinutes = Math.abs(Math.round(offsetSeconds / 60));
  const hours = Math.floor(absoluteMinutes / 60);
  const minutes = absoluteMinutes % 60;
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function nullablePercent(value: number | undefined): number | null {
  return value === undefined ? null : clampPercent(value);
}

function nullableRound(value: number | undefined, digits = 1): number | null {
  return value === undefined ? null : round(value, digits);
}

function metersToKilometers(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return round1(value / 1000);
}

function round1(value: number): number {
  return round(value, 1);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compactJson(value: Record<string, unknown>): JsonValue {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as JsonValue;
}

function describeOpenMeteoWeatherCode(code: string | undefined): string | null {
  if (!code) {
    return null;
  }
  const numeric = Number(code);
  if (!Number.isFinite(numeric)) {
    return code;
  }
  if (numeric === 0) {
    return "晴";
  }
  if (numeric <= 3) {
    return "多云";
  }
  if (numeric === 45 || numeric === 48) {
    return "雾";
  }
  if (numeric >= 51 && numeric <= 67) {
    return "雨";
  }
  if (numeric >= 71 && numeric <= 77) {
    return "雪";
  }
  if (numeric >= 80 && numeric <= 82) {
    return "阵雨";
  }
  if (numeric >= 95) {
    return "雷暴";
  }
  return `天气代码 ${code}`;
}
