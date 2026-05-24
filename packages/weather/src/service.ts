import { defaultTimezone, formatZonedIso, getNowInTimezone } from "@photo-weather/calendar";
import type { WeatherProvider } from "./provider.js";
import type { WeatherDataBundle, WeatherRequestInput } from "./types.js";
import { createWeatherProvider, type WeatherProviderFactoryOptions } from "./factory.js";
import { fuseWeatherSources } from "./fusion.js";
import {
  buildWeatherCacheKey,
  InMemoryWeatherCache,
  weatherCacheTtlMs,
} from "./weather-cache.js";
import {
  InMemoryWeatherProviderUsageLogger,
  type WeatherProviderUsageLogger,
} from "./usage.js";

export class WeatherDataService {
  constructor(private readonly provider: WeatherProvider = createWeatherProvider()) {}

  async getWeatherDataBundle(input: WeatherRequestInput): Promise<WeatherDataBundle> {
    const [current, hourly, daily, alerts, airQuality] = await Promise.all([
      this.provider.getCurrentWeather(input),
      this.provider.getHourlyForecast(input),
      this.provider.getDailyForecast(input),
      this.provider.getWeatherAlerts(input),
      this.provider.getAirQuality(input),
    ]);

    return {
      current,
      hourly,
      daily,
      alerts,
      airQuality,
      providerCode: this.provider.source.providerCode,
      providerLabelZh: this.provider.source.providerLabelZh,
      dataMode: this.provider.source.mode,
      generatedAt:
        input.forecastStart ??
        current.observedAt ??
        formatZonedIso(
          getNowInTimezone(input.timezone ?? defaultTimezone),
          input.timezone ?? defaultTimezone,
        ),
      forecastStart: input.forecastStart,
      forecastEnd: input.forecastEnd,
      noticeZh: `天气数据：${this.provider.source.providerLabelZh}`,
      missingFields: collectWeatherFields(hourly, daily, "missingFields"),
      estimatedFields: collectWeatherFields(hourly, daily, "estimatedFields"),
    };
  }
}

export type WeatherIntelligenceServiceOptions = {
  readonly providers: readonly WeatherProvider[];
  readonly cache?: InMemoryWeatherCache;
  readonly usageLogger?: WeatherProviderUsageLogger;
};

export class WeatherIntelligenceService {
  private readonly cache: InMemoryWeatherCache;
  private readonly usageLogger: WeatherProviderUsageLogger;

  constructor(private readonly options: WeatherIntelligenceServiceOptions) {
    this.cache = options.cache ?? new InMemoryWeatherCache();
    this.usageLogger = options.usageLogger ?? new InMemoryWeatherProviderUsageLogger();
  }

  async getWeatherDataBundle(input: WeatherRequestInput): Promise<WeatherDataBundle> {
    const bundles = await Promise.all(
      this.options.providers.map((provider) => this.getProviderBundle(provider, input)),
    );
    const usableBundles = bundles.filter((bundle) => bundle.hourly.length > 0);

    if (usableBundles.length === 0) {
      return {
        hourly: [],
        daily: [],
        alerts: [],
        providerCode: "mock",
        providerLabelZh: "演示数据",
        dataMode: "demo",
        generatedAt: generatedAt(input),
        forecastStart: input.forecastStart,
        forecastEnd: input.forecastEnd,
        noticeZh: "天气数据：演示数据",
        missingFields: ["weather"],
        estimatedFields: [],
      };
    }

    const fusion = fuseWeatherSources({
      providerBundles: usableBundles,
      target: input.target ?? "general",
      location: {
        coordinates: input.coordinates,
      },
      forecastStart: input.forecastStart ?? usableBundles[0]!.generatedAt,
      forecastEnd: input.forecastEnd ?? usableBundles[0]!.forecastEnd ?? usableBundles[0]!.generatedAt,
    });
    const primary =
      usableBundles.find((bundle) => bundle.providerCode === fusion.recommendedPrimarySource) ??
      usableBundles[0]!;

    return {
      current: primary.current,
      hourly: fusion.fusedHourly,
      daily: fusion.fusedDaily,
      alerts: usableBundles.flatMap((bundle) => bundle.alerts),
      airQuality: usableBundles.find((bundle) => bundle.airQuality)?.airQuality,
      providerCode: primary.providerCode,
      providerLabelZh: primary.providerLabelZh,
      dataMode: usableBundles.some((bundle) => bundle.dataMode === "real") ? "real" : primary.dataMode,
      generatedAt: generatedAt(input, primary.generatedAt),
      forecastStart: input.forecastStart,
      forecastEnd: input.forecastEnd,
      noticeZh: fusion.dataStatusZh,
      missingFields: [
        ...new Set(fusion.sourceSummaries.flatMap((summary) => summary.missingFields)),
      ],
      estimatedFields: [
        ...new Set(usableBundles.flatMap((bundle) => bundle.estimatedFields ?? [])),
      ],
      sourceSummaries: fusion.sourceSummaries,
      conflictFlags: fusion.conflictFlags,
      confidenceByTarget: fusion.confidenceByTarget,
      fusionSummary: fusion.summary,
    };
  }

  private async getProviderBundle(
    provider: WeatherProvider,
    input: WeatherRequestInput,
  ): Promise<WeatherDataBundle> {
    const key = buildWeatherCacheKey({
      provider: provider.source.providerCode,
      coordinates: input.coordinates,
      horizon: input.horizon ?? horizonFromHours(input.hours),
      forecastStart: input.forecastStart ?? generatedAt(input),
      target: input.target,
      purpose: "fusion",
    });
    const cached = this.cache.get<WeatherDataBundle>(key);
    if (cached) {
      await this.usageLogger.recordUsage({
        providerCode: provider.source.providerCode,
        endpoint: "weather.bundle",
        success: true,
        latencyMs: 0,
        cacheHit: true,
        createdAt: new Date().toISOString(),
      });
      return cached;
    }

    const startedAt = Date.now();
    try {
      const bundle = await new WeatherDataService(provider).getWeatherDataBundle(input);
      this.cache.set(key, bundle, weatherCacheTtlMs.fusion);
      await this.usageLogger.recordUsage({
        providerCode: provider.source.providerCode,
        endpoint: "weather.bundle",
        success: true,
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
        createdAt: new Date().toISOString(),
      });
      return bundle;
    } catch (error) {
      await this.usageLogger.recordUsage({
        providerCode: provider.source.providerCode,
        endpoint: "weather.bundle",
        success: false,
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
        createdAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}

export function createWeatherDataService(
  options: WeatherProviderFactoryOptions = {},
): WeatherDataService {
  return new WeatherDataService(createWeatherProvider(options));
}

function collectWeatherFields(
  hourly: readonly { readonly missingFields?: readonly string[]; readonly estimatedFields?: readonly string[] }[],
  daily: readonly { readonly missingFields?: readonly string[]; readonly estimatedFields?: readonly string[] }[],
  key: "missingFields" | "estimatedFields",
): readonly string[] {
  return [...new Set([...hourly, ...daily].flatMap((point) => point[key] ?? []))];
}

function generatedAt(input: WeatherRequestInput, fallback?: string): string {
  return (
    input.forecastStart ??
    fallback ??
    formatZonedIso(
      getNowInTimezone(input.timezone ?? defaultTimezone),
      input.timezone ?? defaultTimezone,
    )
  );
}

function horizonFromHours(hours: number | undefined): "24h" | "48h" | "72h" | "7d" {
  if (!hours || hours <= 24) {
    return "24h";
  }
  if (hours <= 48) {
    return "48h";
  }
  if (hours <= 72) {
    return "72h";
  }
  return "7d";
}
