import type { Coordinates, ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import type { WeatherProviderCode } from "./types.js";

export type WeatherCachePurpose = "current" | "hourly" | "daily" | "alerts" | "fusion";

export type WeatherCacheKeyInput = {
  readonly provider: WeatherProviderCode | "fusion";
  readonly coordinates: Coordinates;
  readonly horizon: ForecastHorizon;
  readonly forecastStart: string;
  readonly target?: ForecastTarget;
  readonly purpose: WeatherCachePurpose;
  readonly runtimeSignature?: string;
};

export type WeatherCacheEntry<TValue> = {
  readonly value: TValue;
  readonly expiresAt: number;
  readonly createdAt: number;
};

export const weatherCacheTtlMs = {
  current: 15 * 60 * 1000,
  hourly: 45 * 60 * 1000,
  daily: 4 * 60 * 60 * 1000,
  alerts: 15 * 60 * 1000,
  fusion: 30 * 60 * 1000,
} as const satisfies Record<WeatherCachePurpose, number>;

export function buildWeatherCacheKey(input: WeatherCacheKeyInput): string {
  const coordinateKey = `${roundCoordinate(input.coordinates.latitude)},${roundCoordinate(
    input.coordinates.longitude,
  )}`;
  const startBucket = bucketForecastStart(input.forecastStart);

  return [
    input.provider,
    input.purpose,
    input.runtimeSignature ?? "runtime:any",
    coordinateKey,
    input.horizon,
    startBucket,
    input.target ?? "any",
  ].join("|");
}

export class InMemoryWeatherCache {
  private readonly entries = new Map<string, WeatherCacheEntry<unknown>>();

  get<TValue>(key: string, now = Date.now()): TValue | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as TValue;
  }

  set<TValue>(key: string, value: TValue, ttlMs: number, now = Date.now()): void {
    this.entries.set(key, {
      value,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

function roundCoordinate(value: number): string {
  return value.toFixed(3);
}

function bucketForecastStart(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value.slice(0, 13);
  }

  date.setMinutes(0, 0, 0);
  return date.toISOString();
}
