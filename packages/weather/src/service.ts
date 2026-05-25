import { defaultTimezone, formatZonedIso, getNowInTimezone } from "@photo-weather/calendar";
import type { NormalizedCurrentWeather, NormalizedHourlyWeather } from "@photo-weather/shared";
import type { WeatherProvider } from "./provider.js";
import type {
  CurrentWeather,
  WeatherDataBundle,
  WeatherRequestInput,
  WeatherSourceSummary,
} from "./types.js";
import { createWeatherProvider, type WeatherProviderFactoryOptions } from "./factory.js";
import { fuseWeatherSources } from "./fusion.js";
import { MockWeatherProvider } from "./mock-provider.js";
import { buildWeatherCacheKey, InMemoryWeatherCache, weatherCacheTtlMs } from "./weather-cache.js";
import { InMemoryWeatherProviderUsageLogger, type WeatherProviderUsageLogger } from "./usage.js";
import { isWeatherProviderError } from "./provider-error.js";

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
    const generated =
      input.forecastStart ??
      current.observedAt ??
      formatZonedIso(
        getNowInTimezone(input.timezone ?? defaultTimezone),
        input.timezone ?? defaultTimezone,
      );
    const missingFields = collectWeatherFields(hourly, daily, "missingFields");

    return {
      current,
      currentWeather: normalizeCurrentWeather({
        current,
        firstHour: hourly[0],
        providerCode: this.provider.source.providerCode,
        providerLabelZh: this.provider.source.providerLabelZh,
        dataMode: this.provider.source.mode,
        airQuality,
      }),
      hourly,
      daily,
      alerts,
      airQuality,
      providerCode: this.provider.source.providerCode,
      providerLabelZh: this.provider.source.providerLabelZh,
      dataMode: this.provider.source.mode,
      generatedAt: generated,
      forecastStart: input.forecastStart,
      forecastEnd: input.forecastEnd,
      noticeZh: `天气数据：${this.provider.source.providerLabelZh}`,
      missingFields,
      estimatedFields: collectWeatherFields(hourly, daily, "estimatedFields"),
      sourceSummaries: [
        successfulSourceSummary({
          providerCode: this.provider.source.providerCode,
          providerLabelZh: this.provider.source.providerLabelZh,
          dataMode: this.provider.source.mode,
          generatedAt: generated,
          availableFields: collectAvailableFields(hourly),
          missingFields,
        }),
      ],
    };
  }
}

export type WeatherIntelligenceServiceOptions = {
  readonly providers: readonly WeatherProvider[];
  readonly cache?: InMemoryWeatherCache;
  readonly usageLogger?: WeatherProviderUsageLogger;
  readonly cacheNamespace?: string;
};

export class WeatherIntelligenceService {
  private readonly cache: InMemoryWeatherCache;
  private readonly usageLogger: WeatherProviderUsageLogger;

  constructor(private readonly options: WeatherIntelligenceServiceOptions) {
    this.cache = options.cache ?? new InMemoryWeatherCache();
    this.usageLogger = options.usageLogger ?? new InMemoryWeatherProviderUsageLogger();
  }

  async getWeatherDataBundle(input: WeatherRequestInput): Promise<WeatherDataBundle> {
    const settled = await Promise.allSettled(
      this.options.providers.map((provider) => this.getProviderBundle(provider, input)),
    );
    const usableBundles = settled.flatMap((result) =>
      result.status === "fulfilled" && result.value.hourly.length > 0 ? [result.value] : [],
    );
    const failedSourceSummaries = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [failedSourceSummary(this.options.providers[index]!, result.reason)]
        : [],
    );

    if (usableBundles.length === 0) {
      return this.buildFallbackBundle(input, failedSourceSummaries);
    }

    const fusion = fuseWeatherSources({
      providerBundles: usableBundles,
      target: input.target ?? "general",
      location: {
        coordinates: input.coordinates,
      },
      forecastStart: input.forecastStart ?? usableBundles[0]!.generatedAt,
      forecastEnd:
        input.forecastEnd ?? usableBundles[0]!.forecastEnd ?? usableBundles[0]!.generatedAt,
    });
    const primary =
      usableBundles.find((bundle) => bundle.providerCode === fusion.recommendedPrimarySource) ??
      usableBundles[0]!;

    return {
      current: primary.current,
      currentWeather: fusion.current ?? primary.currentWeather,
      hourly: fusion.fusedHourly,
      daily: fusion.fusedDaily,
      alerts: usableBundles.flatMap((bundle) => bundle.alerts),
      airQuality: usableBundles.find((bundle) => bundle.airQuality)?.airQuality,
      providerCode: primary.providerCode,
      providerLabelZh: primary.providerLabelZh,
      dataMode: usableBundles.some((bundle) => bundle.dataMode === "real")
        ? "real"
        : primary.dataMode,
      generatedAt: generatedAt(input, fusion.generatedAt),
      forecastStart: input.forecastStart,
      forecastEnd: input.forecastEnd,
      noticeZh: fusion.dataStatusZh,
      missingFields: [
        ...new Set(fusion.sourceSummaries.flatMap((summary) => summary.missingFields)),
      ],
      estimatedFields: [
        ...new Set(usableBundles.flatMap((bundle) => bundle.estimatedFields ?? [])),
      ],
      sourceSummaries: [...fusion.sourceSummaries, ...failedSourceSummaries],
      conflictFlags: fusion.conflictFlags,
      missingDataNotes: [
        ...fusion.missingDataNotes,
        ...failedSourceSummaries.flatMap((summary) =>
          summary.warningZh ? [summary.warningZh] : [],
        ),
      ],
      confidenceByField: fusion.confidenceByField,
      confidenceByTarget: fusion.confidenceByTarget,
      fusionSummary: {
        ...fusion.summary,
        sourceSummaries: [...fusion.sourceSummaries, ...failedSourceSummaries],
        missingDataNotes: [
          ...fusion.missingDataNotes,
          ...failedSourceSummaries.flatMap((summary) =>
            summary.warningZh ? [summary.warningZh] : [],
          ),
        ],
      },
    };
  }

  private async buildFallbackBundle(
    input: WeatherRequestInput,
    failedSourceSummaries: readonly WeatherSourceSummary[],
  ): Promise<WeatherDataBundle> {
    const fallbackProvider = new MockWeatherProvider();
    const fallback = await new WeatherDataService(fallbackProvider).getWeatherDataBundle(input);
    const fallbackMode = failedSourceSummaries.length > 0 ? "fallback" : "demo";
    const dataStatusZh =
      failedSourceSummaries.length > 0
        ? "天气数据：真实数据暂不可用，已回退到演示数据"
        : "天气数据：演示数据";
    const generated = generatedAt(input, fallback.generatedAt);
    const fallbackSummary: WeatherSourceSummary = {
      providerCode: "mock",
      providerLabelZh: "演示数据",
      dataMode: fallbackMode,
      enabled: true,
      realCallEnabled: false,
      attempted: true,
      success: true,
      status: "fallback",
      availableFields: ["temperature", "humidity", "wind", "cloudTotal"],
      missingFields: ["realWeather"],
      generatedAt: generated,
      cacheHit: false,
      messageZh:
        failedSourceSummaries.length > 0
          ? "真实天气暂不可用，当前显示演示图层。"
          : "演示天气数据可用。",
      warningZh:
        failedSourceSummaries.length > 0
          ? "真实天气源暂时不可用，当前结果已回退到演示数据。"
          : undefined,
    };
    const warningNotes = failedSourceSummaries.flatMap((summary) =>
      summary.warningZh ? [summary.warningZh] : [],
    );

    return {
      ...fallback,
      currentWeather: fallback.currentWeather
        ? {
            ...fallback.currentWeather,
            providerCode: "mock",
            providerLabelZh: "演示数据",
            dataMode: fallbackMode,
          }
        : undefined,
      hourly: fallback.hourly.map((hour) => ({
        ...hour,
        providerCode: "mock",
        providerLabelZh: "演示数据",
        dataMode: fallbackMode,
      })),
      daily: fallback.daily.map((day) => ({
        ...day,
        providerCode: "mock",
        providerLabelZh: "演示数据",
        dataMode: fallbackMode,
      })),
      providerCode: "mock",
      providerLabelZh: "演示数据",
      dataMode: fallbackMode,
      generatedAt: generated,
      forecastStart: input.forecastStart,
      forecastEnd: input.forecastEnd,
      noticeZh: dataStatusZh,
      missingFields: [...new Set([...(fallback.missingFields ?? []), "realWeather"])],
      estimatedFields: fallback.estimatedFields ?? [],
      sourceSummaries: [...failedSourceSummaries, fallbackSummary],
      missingDataNotes: [
        ...warningNotes,
        failedSourceSummaries.length > 0
          ? "真实天气源暂时不可用，当前结果已回退到演示数据。"
          : "当前未启用真实天气源，结果使用演示数据。",
      ],
      fusionSummary: {
        primarySource: "演示数据",
        auxiliarySources: [],
        professionalSourceStatus: "专业增强：meteoblue 未启用",
        confidenceLevel: "low",
        confidenceByTarget: {
          cloud_sea: 0,
          glow: 0,
          astro: 0,
          general: 0,
        },
        conflictStatusZh: "无明显冲突",
        dataStatusZh,
        sourceSummaries: [...failedSourceSummaries, fallbackSummary],
        missingDataNotes: warningNotes,
      },
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
      runtimeSignature: this.options.cacheNamespace,
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
      return markBundleCacheHit(cached);
    }

    const startedAt = Date.now();
    try {
      const bundle = await new WeatherDataService(provider).getWeatherDataBundle(input);
      const latencyMs = Date.now() - startedAt;
      const annotatedBundle = annotateProviderBundle(bundle, latencyMs, false);
      this.cache.set(key, annotatedBundle, weatherCacheTtlMs.fusion);
      await this.usageLogger.recordUsage({
        providerCode: provider.source.providerCode,
        endpoint: "weather.bundle",
        success: true,
        latencyMs,
        cacheHit: false,
        createdAt: new Date().toISOString(),
      });
      return annotatedBundle;
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

function normalizeCurrentWeather(input: {
  readonly current: CurrentWeather;
  readonly firstHour?: NormalizedHourlyWeather;
  readonly providerCode: WeatherDataBundle["providerCode"];
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataBundle["dataMode"];
  readonly airQuality?: WeatherDataBundle["airQuality"];
}): NormalizedCurrentWeather {
  const missingFields = new Set(input.firstHour?.missingFields ?? []);
  const estimatedFields = new Set(input.firstHour?.estimatedFields ?? []);
  const dewPoint = input.firstHour?.dewPoint ?? null;
  const dewPointSpread =
    input.firstHour?.dewPointSpread ??
    (dewPoint === null
      ? null
      : Math.round((input.current.temperatureCelsius - dewPoint) * 10) / 10);

  if (input.firstHour?.pressure === null || input.firstHour?.pressure === undefined) {
    missingFields.add("pressure");
  }
  if (input.firstHour?.windDirection === null || input.firstHour?.windDirection === undefined) {
    missingFields.add("windDirection");
  }

  return {
    providerCode: input.providerCode,
    providerLabelZh: input.providerLabelZh,
    dataMode: input.dataMode,
    observedAt: input.current.observedAt,
    temperature: input.current.temperatureCelsius,
    feelsLike: input.current.feelsLikeCelsius,
    humidity: input.current.humidityPercent,
    dewPoint,
    dewPointSpread,
    windSpeed: input.current.windSpeedMetersPerSecond,
    windDirection: input.firstHour?.windDirection ?? null,
    windGust: input.firstHour?.windGust ?? null,
    pressure: input.firstHour?.pressure ?? null,
    visibility: input.current.visibilityKilometers,
    cloudTotal: input.current.cloudCoverPercent,
    cloudLow: input.firstHour?.cloudLow ?? null,
    cloudMid: input.firstHour?.cloudMid ?? null,
    cloudHigh: input.firstHour?.cloudHigh ?? null,
    precipitation: input.firstHour?.precipitation ?? null,
    precipitationProbability: input.firstHour?.precipitationProbability ?? null,
    weatherTextZh: input.current.summary,
    weatherCode: input.firstHour?.weatherCode ?? null,
    airQuality: input.airQuality
      ? {
          aqi: input.airQuality.aqi,
          category: input.airQuality.category,
          pm25: input.airQuality.pm25,
          pm10: input.airQuality.pm10,
        }
      : null,
    missingFields: [...missingFields],
    estimatedFields: [...estimatedFields],
  };
}

function failedSourceSummary(provider: WeatherProvider, errorInput: unknown): WeatherSourceSummary {
  const error = classifyProviderError(provider, errorInput);
  return {
    providerCode: provider.source.providerCode,
    providerLabelZh: provider.source.providerLabelZh,
    dataMode: provider.source.mode,
    enabled: true,
    realCallEnabled: provider.source.mode === "real",
    attempted: true,
    success: false,
    status: "failed",
    availableFields: [],
    missingFields: ["weather"],
    statusCode: error.statusCode,
    latencyMs: error.latencyMs,
    cacheHit: false,
    errorCategory: error.errorCategory,
    messageZh: error.messageZh,
    warningZh: error.messageZh,
    generatedAt: new Date().toISOString(),
  };
}

function classifyProviderError(
  provider: WeatherProvider,
  error: unknown,
): Pick<WeatherSourceSummary, "errorCategory" | "messageZh" | "statusCode" | "latencyMs"> {
  if (isWeatherProviderError(error)) {
    return {
      errorCategory: error.errorCategory,
      messageZh: error.messageZh,
      statusCode: error.statusCode,
      latencyMs: error.latencyMs,
    };
  }

  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError") {
    return {
      errorCategory: "timeout",
      messageZh: `${provider.source.providerLabelZh} 请求超时`,
    };
  }

  return {
    errorCategory: "provider_error",
    messageZh: `${provider.source.providerLabelZh} 暂时不可用，结果已降低置信度。`,
  };
}

function annotateProviderBundle(
  bundle: WeatherDataBundle,
  latencyMs: number,
  cacheHit: boolean,
): WeatherDataBundle {
  const missingFields = collectWeatherFields(bundle.hourly, bundle.daily, "missingFields");
  return {
    ...bundle,
    sourceSummaries: [
      {
        ...sourceSummaryFromBundle(bundle),
        latencyMs,
        cacheHit,
        missingFields,
        messageZh: successfulSourceMessageZh(
          bundle.providerCode,
          bundle.providerLabelZh,
          missingFields,
        ),
      },
    ],
  };
}

function markBundleCacheHit(bundle: WeatherDataBundle): WeatherDataBundle {
  const summaries = bundle.sourceSummaries?.length
    ? bundle.sourceSummaries
    : [sourceSummaryFromBundle(bundle)];

  return {
    ...bundle,
    sourceSummaries: summaries.map((summary) =>
      summary.providerCode === bundle.providerCode
        ? {
            ...summary,
            cacheHit: true,
          }
        : summary,
    ),
  };
}

function successfulSourceSummary(input: {
  readonly providerCode: WeatherSourceSummary["providerCode"];
  readonly providerLabelZh: string;
  readonly dataMode: WeatherSourceSummary["dataMode"];
  readonly generatedAt: string;
  readonly availableFields: readonly string[];
  readonly missingFields: readonly string[];
  readonly latencyMs?: number;
}): WeatherSourceSummary {
  return {
    providerCode: input.providerCode,
    providerLabelZh: input.providerLabelZh,
    dataMode: input.dataMode,
    enabled: true,
    realCallEnabled: input.dataMode === "real",
    attempted: true,
    success: true,
    status: "available",
    availableFields: input.availableFields,
    missingFields: input.missingFields,
    latencyMs: input.latencyMs,
    cacheHit: false,
    generatedAt: input.generatedAt,
    messageZh: successfulSourceMessageZh(
      input.providerCode,
      input.providerLabelZh,
      input.missingFields,
    ),
  };
}

function sourceSummaryFromBundle(bundle: WeatherDataBundle): WeatherSourceSummary {
  const existing = bundle.sourceSummaries?.find(
    (summary) => summary.providerCode === bundle.providerCode,
  );

  return {
    ...successfulSourceSummary({
      providerCode: bundle.providerCode,
      providerLabelZh: bundle.providerLabelZh,
      dataMode: bundle.dataMode,
      generatedAt: bundle.generatedAt,
      availableFields: collectAvailableFields(bundle.hourly),
      missingFields: bundle.missingFields ?? [],
    }),
    ...existing,
    success: existing?.success ?? true,
    attempted: existing?.attempted ?? true,
    enabled: existing?.enabled ?? true,
    realCallEnabled: existing?.realCallEnabled ?? bundle.dataMode === "real",
    messageZh:
      existing?.messageZh ??
      successfulSourceMessageZh(
        bundle.providerCode,
        bundle.providerLabelZh,
        bundle.missingFields ?? [],
      ),
  };
}

function successfulSourceMessageZh(
  providerCode: WeatherSourceSummary["providerCode"],
  providerLabelZh: string,
  missingFields: readonly string[],
): string {
  if (providerCode === "meteoblue" && missingFields.length > 0) {
    return "meteoblue 通过，部分字段缺失。";
  }

  return `${providerLabelZh} 通过。`;
}

function collectAvailableFields(hourly: readonly NormalizedHourlyWeather[]): readonly string[] {
  const fields = [
    "temperature",
    "humidity",
    "windSpeed",
    "windDirection",
    "cloudTotal",
    "cloudLow",
    "cloudMid",
    "cloudHigh",
    "visibility",
    "dewPoint",
    "pressure",
    "precipitation",
  ] as const;

  return fields.filter((field) =>
    hourly.some((hour) => {
      const value = hour[field];
      return typeof value === "number" && Number.isFinite(value);
    }),
  );
}

function collectWeatherFields(
  hourly: readonly {
    readonly missingFields?: readonly string[];
    readonly estimatedFields?: readonly string[];
  }[],
  daily: readonly {
    readonly missingFields?: readonly string[];
    readonly estimatedFields?: readonly string[];
  }[],
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
