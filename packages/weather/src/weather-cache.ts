import type { Coordinates, ForecastHorizon, ForecastTarget } from "@photo-weather/shared";

export type WeatherCachePurpose = "current" | "hourly" | "daily" | "alerts" | "fusion";

export type WeatherCacheKeyInput = {
  readonly provider: string;
  readonly coordinates: Coordinates;
  readonly horizon: ForecastHorizon;
  readonly forecastStart: string;
  readonly forecastWindowAnchorStart?: string;
  readonly forecastWindowAnchorEnd?: string;
  readonly expectedRowCount?: number;
  readonly providerCoverageVersion?: string;
  readonly requestHours?: number;
  readonly requestDays?: number;
  readonly providerRequestStartLocal?: string;
  readonly providerRequestEndLocal?: string;
  readonly providerCoverageRule?: string;
  readonly timezone?: string;
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

const defaultWeatherCacheMaxEntries = 500;

export function buildWeatherCacheKey(input: WeatherCacheKeyInput): string {
  const coordinateKey = `${roundCoordinate(input.coordinates.latitude)},${roundCoordinate(
    input.coordinates.longitude,
  )}`;
  const startBucket = bucketForecastStart(input.forecastStart);
  const anchorBucket = bucketForecastStart(input.forecastWindowAnchorStart ?? input.forecastStart);

  return [
    input.provider,
    input.purpose,
    input.runtimeSignature ?? "runtime:any",
    coordinateKey,
    input.horizon,
    input.timezone ?? "timezone:any",
    `generated:${startBucket}`,
    `anchor:${anchorBucket}`,
    `anchorEnd:${bucketForecastStart(input.forecastWindowAnchorEnd ?? input.forecastStart)}`,
    `expected:${input.expectedRowCount ?? "any"}`,
    `coverage:${input.providerCoverageVersion ?? "legacy"}`,
    `requestHours:${input.requestHours ?? "any"}`,
    `requestDays:${input.requestDays ?? "any"}`,
    `requestStart:${input.providerRequestStartLocal ?? "any"}`,
    `requestEnd:${input.providerRequestEndLocal ?? "any"}`,
    `coverageRule:${input.providerCoverageRule ?? "any"}`,
    input.target ?? "any",
  ].join("|");
}

export type InMemoryWeatherCacheOptions = {
  readonly maxEntries?: number;
};

export class InMemoryWeatherCache {
  private readonly entries = new Map<string, WeatherCacheEntry<unknown>>();
  private readonly maxEntries: number;

  constructor(options: InMemoryWeatherCacheOptions = {}) {
    this.maxEntries = normalizeMaxEntries(options.maxEntries);
  }

  get<TValue>(key: string, now = Date.now()): TValue | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value as TValue;
  }

  set<TValue>(key: string, value: TValue, ttlMs: number, now = Date.now()): void {
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      createdAt: now,
      expiresAt: now + ttlMs,
    });
    this.prune(now);
  }

  deleteExpired(now = Date.now()): number {
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  prune(now = Date.now()): number {
    let deleted = this.deleteExpired(now);
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.entries.delete(oldestKey);
      deleted += 1;
    }
    return deleted;
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

function normalizeMaxEntries(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) {
    return defaultWeatherCacheMaxEntries;
  }

  return Math.floor(value);
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
