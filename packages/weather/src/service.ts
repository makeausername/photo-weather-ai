import { defaultTimezone, formatZonedIso, getNowInTimezone } from "@photo-weather/calendar";
import type {
  CloudLayerProviderCoverageSummary,
  NormalizedCurrentWeather,
  NormalizedHourlyWeather,
  RollingProviderCoverageDiagnostics,
  WeatherFusionSummary,
  WeatherProviderTerrainMetadata,
} from "@photo-weather/shared";
import type { WeatherProvider } from "./provider.js";
import type {
  CurrentWeather,
  WeatherDataBundle,
  WeatherRequestInput,
  WeatherSourceSummary,
} from "./types.js";
import { createWeatherProvider, type WeatherProviderFactoryOptions } from "./factory.js";
import { fuseWeatherSources } from "./fusion.js";
import { buildWeatherCacheKey, InMemoryWeatherCache, weatherCacheTtlMs } from "./weather-cache.js";
import { InMemoryWeatherProviderUsageLogger, type WeatherProviderUsageLogger } from "./usage.js";
import { isWeatherProviderError } from "./provider-error.js";
import { validateWeatherBundleSanity } from "./sanity-validation.js";

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
    const hourlyWithAirQuality = attachAirQualityToHourly(hourly, airQuality);
    const missingFields = collectWeatherFields(hourlyWithAirQuality, daily, "missingFields");
    const sourceSummaryMetadata = getProviderSourceSummaryMetadata(this.provider, input);
    const terrainMetadata = buildProviderTerrainMetadata({
      providerCode: this.provider.source.providerCode,
      hourly: hourlyWithAirQuality,
      daily,
      selectedSpotElevationMeters: input.elevationMeters,
    });
    const terrainSummaryMetadata = terrainSummaryFields(terrainMetadata);

    return {
      current,
      currentWeather: normalizeCurrentWeather({
        current,
        firstHour: hourlyWithAirQuality[0],
        providerCode: this.provider.source.providerCode,
        providerLabelZh: this.provider.source.providerLabelZh,
        dataMode: this.provider.source.mode,
        airQuality,
      }),
      hourly: hourlyWithAirQuality,
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
      estimatedFields: collectWeatherFields(hourlyWithAirQuality, daily, "estimatedFields"),
      terrainMetadata,
      sourceSummaries: [
        {
          ...successfulSourceSummary({
            providerCode: this.provider.source.providerCode,
            providerLabelZh: this.provider.source.providerLabelZh,
            dataMode: this.provider.source.mode,
            generatedAt: generated,
            availableFields: collectAvailableFields(hourlyWithAirQuality),
            missingFields,
            returnedHours: hourlyWithAirQuality.length,
          }),
          ...sourceSummaryMetadata,
          availableFields:
            sourceSummaryMetadata?.availableFields ??
            sourceSummaryMetadata?.extractedFields ??
            collectAvailableFields(hourlyWithAirQuality),
          missingFields: sourceSummaryMetadata?.missingFields ?? missingFields,
          messageZh:
            sourceSummaryMetadata?.messageZh ??
            successfulSourceMessageZh(
              this.provider.source.providerCode,
              this.provider.source.providerLabelZh,
              sourceSummaryMetadata?.missingFields ?? missingFields,
            ),
          ...terrainSummaryMetadata,
        },
      ],
      rollingProviderCoverage: buildRollingProviderCoverageDiagnostics(input),
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
      return this.buildUnavailableBundle(input, failedSourceSummaries);
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
      requestedForecastHours: requestedForecastHoursForMerge(input),
    });
    const primary =
      usableBundles.find((bundle) => bundle.providerCode === fusion.recommendedPrimarySource) ??
      usableBundles[0]!;
    const fusionSummary = appendFailedCloudLayerProviderCoverage(
      fusion.summary,
      failedSourceSummaries,
    );

    return {
      current: primary.current,
      currentWeather: fusion.current ?? primary.currentWeather,
      hourly: fusion.fusedHourly,
      daily: fusion.fusedDaily,
      alerts: usableBundles.flatMap((bundle) => bundle.alerts),
      airQuality: usableBundles.find((bundle) => bundle.airQuality)?.airQuality,
      providerCode: primary.providerCode,
      providerLabelZh: primary.providerLabelZh,
      terrainMetadata: primary.terrainMetadata,
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
        ...fusionSummary,
        sourceSummaries: [...fusion.sourceSummaries, ...failedSourceSummaries],
        missingDataNotes: [
          ...fusion.missingDataNotes,
          ...failedSourceSummaries.flatMap((summary) =>
            summary.warningZh ? [summary.warningZh] : [],
          ),
        ],
      },
      rollingProviderCoverage: buildRollingProviderCoverageDiagnostics(input),
    };
  }

  private buildUnavailableBundle(
    input: WeatherRequestInput,
    failedSourceSummaries: readonly WeatherSourceSummary[],
  ): WeatherDataBundle {
    const generated = generatedAt(input);
    const unavailableSummary: WeatherSourceSummary = {
      providerCode: "unavailable",
      providerLabelZh: "真实天气数据不足",
      dataMode: "unavailable",
      enabled: false,
      realCallEnabled: false,
      attempted: failedSourceSummaries.length > 0,
      success: false,
      status: failedSourceSummaries.length > 0 ? "failed" : "skipped",
      availableFields: [],
      missingFields: ["realWeather", "temperature", "humidity", "windSpeed", "cloudTotal"],
      generatedAt: generated,
      cacheHit: false,
      messageZh: "真实天气数据不足，未生成天气结论。",
      warningZh: "没有可核验的真实天气数据，系统不会使用演示数据代替。",
    };
    const warningNotes = failedSourceSummaries.flatMap((summary) =>
      summary.warningZh ? [summary.warningZh] : [],
    );

    return {
      current: undefined,
      currentWeather: undefined,
      hourly: [],
      daily: [],
      alerts: [],
      providerCode: "unavailable",
      providerLabelZh: "真实天气数据不足",
      dataMode: "unavailable",
      generatedAt: generated,
      forecastStart: input.forecastStart,
      forecastEnd: input.forecastEnd,
      noticeZh: "天气数据：证据不足，未生成天气结论",
      missingFields: ["realWeather", "temperature", "humidity", "windSpeed", "cloudTotal"],
      estimatedFields: [],
      sourceSummaries: [...failedSourceSummaries, unavailableSummary],
      missingDataNotes: [
        ...warningNotes,
        "没有可核验的真实天气数据，系统未使用演示数据生成结论。",
      ],
      fusionSummary: {
        primarySource: "无可用真实天气源",
        auxiliarySources: [],
        professionalSourceStatus: "专业增强：meteoblue 未启用",
        confidenceLevel: "low",
        confidenceByTarget: {
          cloud_sea: 0,
          glow: 0,
          astro: 0,
          general: 0,
        },
        conflictStatusZh: "证据不足，无法判断数据源一致性",
        dataStatusZh: "真实天气数据不足",
        sourceSummaries: [...failedSourceSummaries, unavailableSummary],
        missingDataNotes: [...warningNotes, "没有可核验的真实天气数据。"],
      },
      rollingProviderCoverage: buildRollingProviderCoverageDiagnostics(input),
    };
  }

  private async getProviderBundle(
    provider: WeatherProvider,
    input: WeatherRequestInput,
  ): Promise<WeatherDataBundle> {
    const key = buildWeatherCacheKey({
      provider: `${provider.source.providerCode}:${provider.source.displayName}`,
      coordinates: input.coordinates,
      horizon: input.horizon ?? horizonFromHours(input.hours),
      forecastStart: input.forecastStart ?? generatedAt(input),
      forecastWindowAnchorStart: input.forecastWindowAnchorStart,
      forecastWindowAnchorEnd: input.forecastWindowAnchorEnd,
      expectedRowCount: input.expectedRowCount,
      providerCoverageVersion: input.providerCoverageVersion,
      requestHours: input.hours,
      requestDays: input.days,
      providerRequestStartLocal: input.providerRequestStartLocal,
      providerRequestEndLocal: input.providerRequestEndLocal,
      providerCoverageRule: input.providerCoverageRule,
      timezone: input.timezone,
      target: input.target,
      purpose: "fusion",
      runtimeSignature: this.options.cacheNamespace,
    });
    const cached = this.cache.get<WeatherDataBundle>(key);
    if (cached) {
      await recordUsageSafely(this.usageLogger, {
        providerCode: provider.source.providerCode,
        providerId: provider.source.displayName,
        endpoint: "weather.bundle",
        endpointCategory: "forecast_bundle",
        success: true,
        latencyMs: 0,
        cacheHit: true,
        createdAt: new Date().toISOString(),
      });
      return markBundleCacheHit(cached);
    }

    const startedAt = Date.now();
    try {
      const bundle = validateWeatherBundleSanity(
        await new WeatherDataService(provider).getWeatherDataBundle(input),
      );
      const latencyMs = Date.now() - startedAt;
      const annotatedBundle = annotateProviderBundle(bundle, latencyMs, false);
      this.cache.set(key, annotatedBundle, weatherCacheTtlMs.fusion);
      const source = sourceSummaryFromBundle(annotatedBundle);
      await recordUsageSafely(this.usageLogger, {
        providerCode: provider.source.providerCode,
        providerId: source.providerId ?? provider.source.displayName,
        modelName: source.modelName,
        endpoint: "weather.bundle",
        endpointCategory: "forecast_bundle",
        success: true,
        latencyMs,
        cacheHit: false,
        statusCode: source.statusCode,
        returnedHours: annotatedBundle.hourly.length,
        createdAt: new Date().toISOString(),
      });
      return annotatedBundle;
    } catch (error) {
      const classified = classifyProviderError(provider, error);
      await recordUsageSafely(this.usageLogger, {
        providerCode: provider.source.providerCode,
        providerId: provider.source.displayName,
        endpoint: "weather.bundle",
        endpointCategory: "forecast_bundle",
        success: false,
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
        statusCode: classified.statusCode,
        errorCategory: classified.errorCategory,
        createdAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}

async function recordUsageSafely(
  logger: WeatherProviderUsageLogger,
  entry: Parameters<WeatherProviderUsageLogger["recordUsage"]>[0],
): Promise<void> {
  try {
    await logger.recordUsage(entry);
  } catch {
    // Logging failures are intentionally isolated from forecast execution.
  }
}

function buildRollingProviderCoverageDiagnostics(
  input: WeatherRequestInput,
): RollingProviderCoverageDiagnostics | undefined {
  if (
    !input.providerCoverageVersion ||
    !input.forecastWindowAnchorStart ||
    !input.forecastWindowAnchorEnd ||
    !input.providerRequestStartLocal ||
    !input.providerRequestEndLocal ||
    !input.providerCoverageRule ||
    !input.hours ||
    !input.days ||
    !input.expectedRowCount
  ) {
    return undefined;
  }

  return {
    version: input.providerCoverageVersion,
    minRequestHours: input.expectedRowCount,
    recommendedRequestHours: Math.round(input.hours),
    requiredForecastDays: Math.round(input.days),
    requestStartLocal: input.providerRequestStartLocal,
    requestEndLocal: input.providerRequestEndLocal,
    coverageRule: input.providerCoverageRule,
  };
}

function requestedForecastHoursForMerge(input: WeatherRequestInput): number | undefined {
  const hourCount =
    typeof input.hours === "number" && Number.isFinite(input.hours) && input.hours > 0
      ? Math.round(input.hours)
      : undefined;
  const dayHourCount =
    typeof input.days === "number" && Number.isFinite(input.days) && input.days > 0
      ? Math.round(input.days) * 24
      : undefined;
  const values = [hourCount, dayHourCount].filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.max(...values) : undefined;
}

function appendFailedCloudLayerProviderCoverage(
  summary: WeatherFusionSummary,
  failedSourceSummaries: readonly WeatherSourceSummary[],
): WeatherFusionSummary {
  if (!summary.cloudLayerCoverage || failedSourceSummaries.length === 0) {
    return summary;
  }

  const existingKeys = new Set(
    summary.cloudLayerCoverage.providerCoverageSummary.map(providerCoverageKey),
  );
  const failedCoverage = failedSourceSummaries
    .map(failedSourceSummaryToProviderCoverage)
    .filter((coverage) => {
      const key = providerCoverageKey(coverage);
      if (existingKeys.has(key)) {
        return false;
      }
      existingKeys.add(key);
      return true;
    });

  if (failedCoverage.length === 0) {
    return summary;
  }

  return {
    ...summary,
    cloudLayerCoverage: {
      ...summary.cloudLayerCoverage,
      providerCoverageSummary: [
        ...summary.cloudLayerCoverage.providerCoverageSummary,
        ...failedCoverage,
      ],
    },
  };
}

function failedSourceSummaryToProviderCoverage(
  summary: WeatherSourceSummary,
): CloudLayerProviderCoverageSummary {
  return {
    providerId: summary.providerId ?? providerCoverageFallbackId(summary),
    providerCode: summary.providerCode,
    modelName: summary.modelName,
    returnedHours: summary.returnedHours ?? 0,
    cloudTotalHours: summary.cloudTotalHours ?? 0,
    cloudLowHours: summary.cloudLowHours ?? 0,
    cloudMidHours: summary.cloudMidHours ?? 0,
    cloudHighHours: summary.cloudHighHours ?? 0,
    dewPointHours: summary.dewPointHours ?? 0,
    visibilityHours: summary.visibilityHours ?? 0,
    precipitationProbabilityHours: summary.precipitationProbabilityHours ?? 0,
    error: summary.warningZh ?? summary.messageZh,
  };
}

function providerCoverageKey(
  coverage: Pick<CloudLayerProviderCoverageSummary, "providerId" | "providerCode" | "modelName">,
): string {
  return coverage.providerId || providerCoverageFallbackId(coverage);
}

function providerCoverageFallbackId(input: {
  readonly providerCode: string;
  readonly modelName?: string;
}): string {
  return input.modelName ? `${input.providerCode}:${input.modelName}` : input.providerCode;
}

export function createWeatherDataService(
  options: WeatherProviderFactoryOptions = {},
): WeatherDataService {
  return new WeatherDataService(createWeatherProvider(options));
}

type SourceSummaryMetadataProvider = WeatherProvider & {
  readonly getSourceSummaryMetadata?: (
    input: WeatherRequestInput,
  ) => Partial<WeatherSourceSummary> | undefined;
};

function getProviderSourceSummaryMetadata(
  provider: WeatherProvider,
  input: WeatherRequestInput,
): Partial<WeatherSourceSummary> | undefined {
  return (provider as SourceSummaryMetadataProvider).getSourceSummaryMetadata?.(input);
}

function buildProviderTerrainMetadata(input: {
  readonly providerCode: WeatherDataBundle["providerCode"];
  readonly hourly: readonly NormalizedHourlyWeather[];
  readonly daily: WeatherDataBundle["daily"];
  readonly selectedSpotElevationMeters?: number;
}): WeatherProviderTerrainMetadata {
  const providerElevationMeters =
    firstFinite(input.hourly.map((hour) => hour.providerElevationMeters)) ??
    firstFinite(input.daily.map((day) => day.providerElevationMeters));
  const providerElevationKnown = providerElevationMeters !== undefined;
  const selectedSpotElevationMeters = firstFinite([input.selectedSpotElevationMeters]);
  const elevationDifferenceMeters =
    providerElevationKnown && selectedSpotElevationMeters !== undefined
      ? Math.round(selectedSpotElevationMeters - providerElevationMeters)
      : undefined;

  return {
    providerCode: input.providerCode,
    providerElevationMeters,
    providerElevationSource: providerElevationKnown ? "provider_metadata" : undefined,
    providerElevationKnown,
    selectedSpotElevationMeters,
    elevationDifferenceMeters,
    terrainAdjustmentApplied: false,
    terrainAdjustmentReason: providerElevationKnown
      ? "provider_elevation_metadata_captured"
      : "provider_elevation_unknown",
  };
}

function terrainSummaryFields(
  metadata: WeatherProviderTerrainMetadata,
): Omit<WeatherProviderTerrainMetadata, "providerCode"> {
  const {
    providerElevationMeters,
    providerElevationSource,
    providerElevationKnown,
    selectedSpotElevationMeters,
    elevationDifferenceMeters,
    terrainAdjustmentApplied,
    terrainAdjustmentReason,
    dayCorrectionRatio,
    nightCorrectionRatio,
  } = metadata;

  return {
    providerElevationMeters,
    providerElevationSource,
    providerElevationKnown,
    selectedSpotElevationMeters,
    elevationDifferenceMeters,
    terrainAdjustmentApplied,
    terrainAdjustmentReason,
    dayCorrectionRatio,
    nightCorrectionRatio,
  };
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
  const airQuality = normalizeCurrentAirQuality(input.airQuality, input.firstHour);
  const dewPointSpread =
    input.firstHour?.dewPointSpread ??
    (dewPoint === null
      ? null
        : Math.round((input.current.temperatureCelsius - dewPoint) * 10) / 10);
  const visibility = missingFields.has("visibility")
    ? null
    : (input.firstHour?.visibility ?? input.current.visibilityKilometers);

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
    rawTemperature: input.firstHour?.rawTemperature,
    elevationAdjustedTemperature: input.firstHour?.elevationAdjustedTemperature,
    temperatureAdjustment: input.firstHour?.temperatureAdjustment,
    feelsLike: input.current.feelsLikeCelsius,
    humidity: input.current.humidityPercent,
    dewPoint,
    dewPointSpread,
    windSpeed: input.current.windSpeedMetersPerSecond,
    windDirection: input.firstHour?.windDirection ?? null,
    windGust: input.firstHour?.windGust ?? null,
    pressure: input.firstHour?.pressure ?? null,
    visibility,
    cloudTotal: input.current.cloudCoverPercent,
    cloudLow: input.firstHour?.cloudLow ?? null,
    cloudMid: input.firstHour?.cloudMid ?? null,
    cloudHigh: input.firstHour?.cloudHigh ?? null,
    aerosolOpticalDepth550: input.firstHour?.aerosolOpticalDepth550 ?? null,
    pm25: input.firstHour?.pm25 ?? airQuality?.pm25 ?? null,
    pm10: input.firstHour?.pm10 ?? airQuality?.pm10 ?? null,
    dust: input.firstHour?.dust ?? null,
    aerosolObservedAt: input.firstHour?.aerosolObservedAt,
    aerosolValidTime: input.firstHour?.aerosolValidTime,
    aerosolSourceResolution: input.firstHour?.aerosolSourceResolution,
    aerosolSourceResolutionHours: input.firstHour?.aerosolSourceResolutionHours,
    aerosolAvailability: input.firstHour?.aerosolAvailability,
    aerosolConfidence: input.firstHour?.aerosolConfidence,
    aerosolSourceNoteZh: input.firstHour?.aerosolSourceNoteZh,
    precipitation: input.firstHour?.precipitation ?? null,
    precipitationAmountMm:
      input.firstHour?.precipitationAmountMm ?? input.firstHour?.precipitation ?? null,
    rainAmountMm: input.firstHour?.rainAmountMm ?? null,
    snowAmountMm: input.firstHour?.snowAmountMm ?? null,
    precipitationProbability: input.firstHour?.precipitationProbability ?? null,
    precipitationProbabilityPercent: input.firstHour?.precipitationProbability ?? null,
    precipitationType: input.firstHour?.precipitationType,
    rawVisibilityKm: visibility,
    photographyTransparencyScore: input.firstHour?.photographyTransparencyScore,
    transparencyGrade: input.firstHour?.transparencyGrade,
    cloudFogObstructionRisk: input.firstHour?.cloudFogObstructionRisk,
    exposedRidgeWindRisk: input.firstHour?.exposedRidgeWindRisk,
    mountainFeelsLikeC: input.firstHour?.mountainFeelsLikeC,
    tripodStabilityRisk: input.firstHour?.tripodStabilityRisk,
    windChillNoteZh: input.firstHour?.windChillNoteZh,
    clothingRiskNoteZh: input.firstHour?.clothingRiskNoteZh,
    providerElevationMeters: input.firstHour?.providerElevationMeters,
    selectedSpotElevationMeters: input.firstHour?.selectedSpotElevationMeters,
    elevationDifferenceMeters: input.firstHour?.elevationDifferenceMeters,
    terrainAdjustmentApplied: input.firstHour?.terrainAdjustmentApplied,
    terrainAdjustmentReason: input.firstHour?.terrainAdjustmentReason,
    weatherTextZh: input.current.summary,
    weatherCode: input.firstHour?.weatherCode ?? null,
    airQuality,
    missingFields: [...missingFields],
    estimatedFields: [...estimatedFields],
    fieldMetadata: input.firstHour?.fieldMetadata,
  };
}

export function attachAirQualityToHourly(
  hourly: readonly NormalizedHourlyWeather[],
  airQuality: WeatherDataBundle["airQuality"] | undefined,
): readonly NormalizedHourlyWeather[] {
  const references = airQuality?.hourly ?? [];
  if (references.length === 0) {
    return hourly;
  }

  return hourly.map((hour) => {
    const reference = selectAerosolReferenceForHour(hour.time, references);
    if (!reference) {
      return hour;
    }

    return {
      ...hour,
      aerosolOpticalDepth550: reference.aerosolOpticalDepth550,
      pm25: reference.pm25,
      pm10: reference.pm10,
      dust: reference.dust,
      aerosolObservedAt: reference.aerosolObservedAt,
      aerosolValidTime: reference.aerosolValidTime,
      aerosolSourceResolution: reference.aerosolSourceResolution,
      aerosolSourceResolutionHours: reference.aerosolSourceResolutionHours,
      aerosolAvailability: reference.aerosolAvailability,
      aerosolConfidence: reference.aerosolConfidence,
      aerosolSourceNoteZh: reference.aerosolSourceNoteZh,
    };
  });
}

function selectAerosolReferenceForHour(
  hourTime: string,
  references: NonNullable<NonNullable<WeatherDataBundle["airQuality"]>["hourly"]>,
) {
  const exact = references.find(
    (reference) => (reference.aerosolValidTime ?? reference.aerosolObservedAt) === hourTime,
  );
  if (exact) {
    return exact.aerosolAvailability === "unavailable" ? undefined : exact;
  }

  const hourMs = Date.parse(hourTime);
  if (!Number.isFinite(hourMs)) {
    return undefined;
  }

  const candidates = references
    .filter((reference) => reference.aerosolAvailability !== "unavailable")
    .map((reference) => {
      const validTime = reference.aerosolValidTime ?? reference.aerosolObservedAt;
      const validMs = validTime ? Date.parse(validTime) : Number.NaN;
      const resolutionMs = (reference.aerosolSourceResolutionHours ?? 1) * 60 * 60 * 1000;
      const maxDistanceMs = Math.max(60 * 60 * 1000, resolutionMs / 2 + 30 * 60 * 1000);

      return {
        reference,
        distanceMs: Math.abs(validMs - hourMs),
        maxDistanceMs,
      };
    })
    .filter((candidate) => Number.isFinite(candidate.distanceMs))
    .sort((left, right) => left.distanceMs - right.distanceMs);

  const nearest = candidates[0];
  return nearest && nearest.distanceMs <= nearest.maxDistanceMs ? nearest.reference : undefined;
}

function normalizeCurrentAirQuality(
  airQuality: WeatherDataBundle["airQuality"] | undefined,
  firstHour: NormalizedHourlyWeather | undefined,
): NormalizedCurrentWeather["airQuality"] {
  const reference =
    firstHour?.aerosolAvailability && firstHour.aerosolAvailability !== "unavailable"
      ? firstHour
      : undefined;
  const hasEnvelopeSignal =
    airQuality?.aqi !== null && airQuality?.aqi !== undefined
      ? true
      : airQuality?.pm25 !== null && airQuality?.pm25 !== undefined
        ? true
        : airQuality?.pm10 !== null && airQuality?.pm10 !== undefined;
  const hasReferenceSignal =
    reference?.aerosolOpticalDepth550 !== null && reference?.aerosolOpticalDepth550 !== undefined
      ? true
      : reference?.pm25 !== null && reference?.pm25 !== undefined
        ? true
        : reference?.pm10 !== null && reference?.pm10 !== undefined
          ? true
          : reference?.dust !== null && reference?.dust !== undefined;
  if (!hasEnvelopeSignal && !hasReferenceSignal) {
    return null;
  }

  return {
    aqi: airQuality?.aqi ?? undefined,
    category: airQuality?.category ?? undefined,
    pm25: reference?.pm25 ?? airQuality?.pm25 ?? undefined,
    pm10: reference?.pm10 ?? airQuality?.pm10 ?? undefined,
    aerosolOpticalDepth550: reference?.aerosolOpticalDepth550 ?? null,
    dust: reference?.dust ?? null,
    aerosolValidTime: reference?.aerosolValidTime,
    aerosolSourceResolution: reference?.aerosolSourceResolution,
    aerosolAvailability: reference?.aerosolAvailability,
    aerosolConfidence: reference?.aerosolConfidence,
  };
}

function failedSourceSummary(provider: WeatherProvider, errorInput: unknown): WeatherSourceSummary {
  const error = classifyProviderError(provider, errorInput);
  const sourceSummaryMetadata = isWeatherProviderError(errorInput)
    ? errorInput.sourceSummaryMetadata
    : undefined;
  return {
    providerId: sourceSummaryMetadata?.providerId,
    providerCode: provider.source.providerCode,
    providerLabelZh: provider.source.providerLabelZh,
    dataMode: provider.source.mode,
    enabled: true,
    realCallEnabled: provider.source.mode === "real",
    attempted: true,
    success: false,
    status: "failed",
    availableFields:
      sourceSummaryMetadata?.availableFields ?? sourceSummaryMetadata?.extractedFields ?? [],
    extractedFields: sourceSummaryMetadata?.extractedFields,
    missingFields: sourceSummaryMetadata?.missingFields ?? ["weather"],
    partial: false,
    topLevelKeys: sourceSummaryMetadata?.topLevelKeys,
    packages: sourceSummaryMetadata?.packages,
    sourceFamily: sourceSummaryMetadata?.sourceFamily,
    modelFamily: sourceSummaryMetadata?.modelFamily,
    modelName: sourceSummaryMetadata?.modelName,
    basis: sourceSummaryMetadata?.basis,
    requestedForecastHours: sourceSummaryMetadata?.requestedForecastHours,
    returnedHours: sourceSummaryMetadata?.returnedHours,
    timezone: sourceSummaryMetadata?.timezone,
    elevationBasis: sourceSummaryMetadata?.elevationBasis,
    parserVersion: sourceSummaryMetadata?.parserVersion,
    diagnosticStatus: sourceSummaryMetadata?.diagnosticStatus,
    fallbackRequestUsed: sourceSummaryMetadata?.fallbackRequestUsed,
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
        partial: bundle.providerCode === "meteoblue" && missingFields.length > 0,
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
  readonly returnedHours?: number;
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
    extractedFields: input.availableFields,
    missingFields: input.missingFields,
    partial: input.providerCode === "meteoblue" && input.missingFields.length > 0,
    latencyMs: input.latencyMs,
    returnedHours: input.returnedHours,
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
  const terrainMetadata =
    bundle.terrainMetadata ??
    buildProviderTerrainMetadata({
      providerCode: bundle.providerCode,
      hourly: bundle.hourly,
      daily: bundle.daily,
    });

  return {
    ...successfulSourceSummary({
      providerCode: bundle.providerCode,
      providerLabelZh: bundle.providerLabelZh,
      dataMode: bundle.dataMode,
      generatedAt: bundle.generatedAt,
      availableFields: collectAvailableFields(bundle.hourly),
      missingFields: bundle.missingFields ?? [],
      returnedHours: bundle.hourly.length,
    }),
    ...existing,
    ...terrainSummaryFields(terrainMetadata),
    success: existing?.success ?? true,
    attempted: existing?.attempted ?? true,
    enabled: existing?.enabled ?? true,
    realCallEnabled: existing?.realCallEnabled ?? bundle.dataMode === "real",
    partial:
      existing?.partial ??
      (bundle.providerCode === "meteoblue" && (bundle.missingFields?.length ?? 0) > 0),
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
    "precipitationAmountMm",
    "rainAmountMm",
    "snowAmountMm",
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

function firstFinite(values: readonly (number | undefined | null)[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
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
