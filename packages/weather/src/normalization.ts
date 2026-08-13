import {
  normalizedDailyWeatherSchema,
  normalizedHourlyWeatherSchema,
  type NormalizedDailyWeather,
  type NormalizedHourlyWeather,
} from "@photo-weather/shared";
import type { WeatherCondition } from "./types.js";

export function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function requiredNumber(value: unknown, fieldName: string): number {
  const parsed = toNumber(value);
  if (parsed === null) {
    throw new Error(`Missing numeric weather field: ${fieldName}`);
  }

  return parsed;
}

export function nullableRounded(value: unknown, digits = 1): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : roundTo(parsed, digits);
}

export function requiredRounded(value: unknown, fieldName: string, digits = 1): number {
  return roundTo(requiredNumber(value, fieldName), digits);
}

export function percent(value: unknown, fieldName: string): number {
  const parsed = requiredNumber(value, fieldName);
  const normalized = normalizePercentBoundary(parsed);
  if (normalized === null) {
    throw new Error(`Weather percent field out of range: ${fieldName}`);
  }
  return normalized;
}

export function nullablePercent(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : normalizePercentBoundary(parsed);
}

export function kmhToMetersPerSecond(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : roundTo(parsed / 3.6, 1);
}

export function metersToKilometers(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : roundTo(parsed / 1000, 1);
}

export function normalizeIsoTime(value: unknown, offsetSeconds = 8 * 60 * 60): string {
  const text = toText(value);
  if (!text) {
    throw new Error("Missing weather time field.");
  }

  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)
    ? `${text}:00`
    : text.replace(
        /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/,
        "$1:00$2",
      );
  if (/Z$|[+-]\d{2}:\d{2}$/.test(withSeconds)) {
    return withSeconds;
  }

  return `${withSeconds}${formatOffset(offsetSeconds)}`;
}

export function normalizeDate(value: unknown): string {
  const text = toText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error("Missing weather date field.");
  }

  return text;
}

export function normalizeClockTime(date: string, value: unknown): string | undefined {
  const text = toText(value);
  if (!text) {
    return undefined;
  }

  return normalizeIsoTime(`${date}T${text}`);
}

export function validateHourlyWeather(
  points: readonly NormalizedHourlyWeather[],
): readonly NormalizedHourlyWeather[] {
  return points.map((point) => normalizedHourlyWeatherSchema.parse(point));
}

export function validateDailyWeather(
  points: readonly NormalizedDailyWeather[],
): readonly NormalizedDailyWeather[] {
  return points.map((point) => normalizedDailyWeatherSchema.parse(point));
}

export function weatherConditionFromCode(code: string | null): WeatherCondition {
  if (!code) {
    return "partly_cloudy";
  }

  const numericCode = Number(code);
  if (Number.isFinite(numericCode)) {
    if (numericCode === 45 || numericCode === 48 || /^5\d{2}/.test(code)) {
      return "fog";
    }
    if (
      (numericCode >= 51 && numericCode <= 67) ||
      (numericCode >= 80 && numericCode <= 82) ||
      /^3\d{2}/.test(code)
    ) {
      return "rain";
    }
    if ((numericCode >= 71 && numericCode <= 77) || numericCode >= 85 || /^4\d{2}/.test(code)) {
      return "snow";
    }
  }

  if (/^(100|0)$/.test(code)) {
    return "clear";
  }
  if (/^(101|102|2|3)$/.test(code)) {
    return "partly_cloudy";
  }

  return "cloudy";
}

export function averageNullable(values: readonly (number | null)[]): number | null {
  const usableValues = values.filter((value): value is number => value !== null);
  if (usableValues.length === 0) {
    return null;
  }

  return roundTo(
    usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length,
    1,
  );
}

function normalizePercentBoundary(value: number): number | null {
  if (value < -0.05 || value > 100.05) {
    return null;
  }
  return Math.min(100, Math.max(0, roundTo(value, 1)));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds >= 0 ? "+" : "-";
  const absoluteSeconds = Math.abs(offsetSeconds);
  const hours = Math.floor(absoluteSeconds / 3600);
  const minutes = Math.floor((absoluteSeconds % 3600) / 60);

  return `${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}
