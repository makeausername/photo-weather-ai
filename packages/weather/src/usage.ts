import type { WeatherProviderCode } from "./types.js";

export type WeatherProviderUsageLog = {
  readonly providerCode: WeatherProviderCode;
  readonly providerId?: string;
  readonly modelName?: string;
  readonly endpoint: string;
  readonly endpointCategory?: string;
  readonly success: boolean;
  readonly latencyMs: number;
  readonly cacheHit: boolean;
  readonly statusCode?: number;
  readonly returnedHours?: number;
  readonly errorCategory?: string;
  readonly estimatedCost?: number;
  readonly createdAt: string;
};

export interface WeatherProviderUsageLogger {
  recordUsage(entry: WeatherProviderUsageLog): Promise<void> | void;
}

export type StructuredWeatherUsageLogSink = {
  readonly info: (fields: Record<string, unknown>, message: string) => void;
  readonly warn?: (fields: Record<string, unknown>, message: string) => void;
};

export class StructuredWeatherProviderUsageLogger implements WeatherProviderUsageLogger {
  constructor(private readonly sink: StructuredWeatherUsageLogSink) {}

  recordUsage(entry: WeatherProviderUsageLog): void {
    try {
      const method = entry.success ? this.sink.info : (this.sink.warn ?? this.sink.info);
      method.call(this.sink, { ...entry }, "Weather provider usage");
    } catch {
      // Observability is best-effort and must never affect a forecast.
    }
  }
}

export class InMemoryWeatherProviderUsageLogger implements WeatherProviderUsageLogger {
  readonly entries: WeatherProviderUsageLog[] = [];

  recordUsage(entry: WeatherProviderUsageLog): void {
    this.entries.push(entry);
  }
}
