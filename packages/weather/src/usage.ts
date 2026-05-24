import type { WeatherProviderCode } from "./types.js";

export type WeatherProviderUsageLog = {
  readonly providerCode: WeatherProviderCode;
  readonly endpoint: string;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly cacheHit: boolean;
  readonly estimatedCost?: number;
  readonly createdAt: string;
};

export interface WeatherProviderUsageLogger {
  recordUsage(entry: WeatherProviderUsageLog): Promise<void> | void;
}

export class InMemoryWeatherProviderUsageLogger implements WeatherProviderUsageLogger {
  readonly entries: WeatherProviderUsageLog[] = [];

  recordUsage(entry: WeatherProviderUsageLog): void {
    this.entries.push(entry);
  }
}
