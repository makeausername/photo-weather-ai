import type {
  CloudLayerCoverageSummary,
  CloudLayerFieldCoverageSummary,
  Coordinates,
  ForecastTarget,
  NormalizedCurrentWeather,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  NormalizedWeatherFieldMetadataMap,
  TerrainProfileSummary,
  WeatherConfidenceLevel,
  WeatherFusionSummary,
} from "@photo-weather/shared";
import type {
  WeatherConfidenceByField,
  WeatherConfidenceByTarget,
  WeatherConflictFlag,
  WeatherDataBundle,
  WeatherProviderCode,
  WeatherSourceSummary,
} from "./types.js";
import { buildMultiSourceAgreementContext } from "./disagreement.js";
import {
  annotateSourceSummaryWithCloudLayerCoverage,
  resolveCloudLayerHourlyCoverage,
} from "./cloud-layer-coverage-resolver.js";

export type WeatherFusionInput = {
  readonly providerBundles: readonly WeatherDataBundle[];
  readonly target: ForecastTarget;
  readonly location: {
    readonly name?: string;
    readonly coordinates: Coordinates;
  };
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly terrainSummary?: TerrainProfileSummary;
  readonly astroSummary?: unknown;
};

export type WeatherFusionResult = {
  readonly current?: NormalizedCurrentWeather;
  readonly fusedHourly: readonly NormalizedHourlyWeather[];
  readonly fusedDaily: readonly NormalizedDailyWeather[];
  readonly sourceSummaries: readonly WeatherSourceSummary[];
  readonly conflictFlags: readonly WeatherConflictFlag[];
  readonly confidenceByField: WeatherConfidenceByField;
  readonly confidenceByTarget: WeatherConfidenceByTarget;
  readonly recommendedPrimarySource: WeatherProviderCode;
  readonly dataStatusZh: string;
  readonly missingDataNotes: readonly string[];
  readonly fusionNotesZh: readonly string[];
  readonly generatedAt: string;
  readonly summary: WeatherFusionSummary;
};

const numericFields = [
  "cloudTotal",
  "cloudLow",
  "cloudMid",
  "cloudHigh",
  "visibility",
  "humidity",
  "dewPoint",
  "pressure",
  "windSpeed",
  "windGust",
  "precipitation",
  "precipitationProbability",
  "precipitationAmountMm",
  "rainAmountMm",
  "snowAmountMm",
] as const satisfies readonly (keyof NormalizedHourlyWeather)[];

const fieldConfidenceKeys = [
  "cloudTotal",
  "cloudLow",
  "cloudMid",
  "cloudHigh",
  "visibility",
  "humidity",
  "dewPoint",
  "wind",
  "precipitation",
  "pressure",
] as const satisfies readonly (keyof WeatherConfidenceByField)[];

export function fuseWeatherSources(input: WeatherFusionInput): WeatherFusionResult {
  const usableBundles = input.providerBundles.filter((bundle) => bundle.hourly.length > 0);
  if (usableBundles.length === 0) {
    return emptyFusionResult();
  }

  const primaryBundle = choosePrimaryBundle(usableBundles);
  const hourlyTimes = [
    ...new Set(usableBundles.flatMap((bundle) => bundle.hourly.map((hour) => hour.time))),
  ].sort();
  const conflictFlags = detectConflicts(usableBundles);
  const multiSourceAgreementContext = buildMultiSourceAgreementContext({
    providerBundles: usableBundles,
    target: input.target,
    targetWindow: {
      startTime: input.forecastStart,
      endTime: input.forecastEnd,
    },
  });
  const baseFusedHourly = hourlyTimes
    .map((time) => fuseHourlyAt(time, usableBundles, primaryBundle, input.target))
    .filter((hour): hour is NormalizedHourlyWeather => hour !== null);
  const cloudLayerCoverage = resolveCloudLayerHourlyCoverage({
    providerBundles: usableBundles,
    baseHourlyRows: baseFusedHourly,
    forecastHours: expectedForecastHours(input, baseFusedHourly.length),
    timezone: timezoneFromWeather(input.forecastStart),
  });
  const fusedHourly = cloudLayerCoverage.hourlyRows;
  const fusedDaily = fuseDailyByDate(usableBundles, primaryBundle);
  const sourceSummaries = annotateSourceSummariesWithCoverage(
    usableBundles.map(sourceSummary),
    cloudLayerCoverage,
  );
  const confidenceByField = applyCloudLayerCoverageConfidence(
    buildConfidenceByField(usableBundles, conflictFlags),
    cloudLayerCoverage.fieldCoverageSummary,
  );
  const confidenceByTarget = applyProviderConfidenceFloor(
    buildConfidenceByTarget(confidenceByField, conflictFlags, input.terrainSummary),
    usableBundles,
    conflictFlags,
  );
  const missingDataNotes = [
    ...new Set([
      ...buildMissingDataNotes(confidenceByField, sourceSummaries),
      ...coverageMissingDataNotes(cloudLayerCoverage),
    ]),
  ];
  const recommendedPrimarySource = primaryBundle.providerCode;
  const confidenceLevel = confidenceLevelFromScore(confidenceByTarget[input.target]);
  const dataStatusZh = buildDataStatus(usableBundles, confidenceLevel);
  const conflictStatusZh = conflictFlags.length === 0 ? "无明显冲突" : "存在差异，请谨慎参考";
  const meteoblueBundle = usableBundles.find(
    (bundle) => bundle.providerCode === "meteoblue" && bundle.dataMode === "real",
  );
  const meteoblueMissingFields = meteoblueBundle ? collectBundleMissingFields(meteoblueBundle) : [];
  const professionalSourceStatus = meteoblueBundle
    ? meteoblueMissingFields.length > 0
      ? "专业增强：meteoblue 通过，部分字段缺失"
      : "专业增强：meteoblue 通过"
    : "专业增强：meteoblue 未启用";
  const fusionNotesZh = buildFusionNotes({
    usableBundles,
    conflictFlags,
    confidenceLevel,
    target: input.target,
    professionalSourceStatus,
  });

  return {
    current: fuseCurrent(primaryBundle, fusedHourly[0]),
    fusedHourly,
    fusedDaily,
    sourceSummaries,
    conflictFlags,
    confidenceByField,
    confidenceByTarget,
    recommendedPrimarySource,
    dataStatusZh,
    missingDataNotes,
    fusionNotesZh,
    generatedAt: primaryBundle.generatedAt,
    summary: {
      primarySource: primaryBundle.providerLabelZh,
      auxiliarySources: usableBundles
        .filter((bundle) => bundle.providerCode !== primaryBundle.providerCode)
        .map((bundle) => bundle.providerLabelZh),
      professionalSourceStatus,
      confidenceLevel,
      confidenceByTarget,
      conflictStatusZh,
      dataStatusZh,
      sourceSummaries,
      missingDataNotes,
      multiSourceAgreementContext,
      cloudLayerCoverage,
    },
  };
}

export function targetPriorityFields(target: ForecastTarget): readonly string[] {
  switch (target) {
    case "cloud_sea":
      return [
        "humidity",
        "dewPointSpread",
        "cloudLow",
        "visibility",
        "windSpeed",
        "windDirection",
        "precipitation",
        "terrain.elevationDiff",
        "terrain.valleyDirection",
      ];
    case "glow":
      return [
        "cloudLow",
        "cloudMid",
        "cloudHigh",
        "cloudTotal",
        "visibility",
        "precipitation",
        "wind",
        "astro.twilight",
        "terrain.horizonObstruction",
      ];
    case "astro":
      return [
        "cloudTotal",
        "cloudLow",
        "cloudMid",
        "cloudHigh",
        "visibility",
        "humidity",
        "precipitation",
        "astro.moonImpact",
        "lightPollution",
        "terrain.horizonObstruction",
      ];
    default:
      return ["cloudTotal", "visibility", "humidity", "wind", "precipitation", "pressure"];
  }
}

function emptyFusionResult(): WeatherFusionResult {
  const confidenceByField = Object.fromEntries(
    fieldConfidenceKeys.map((field) => [field, 0]),
  ) as WeatherConfidenceByField;

  return {
    current: undefined,
    fusedHourly: [],
    fusedDaily: [],
    sourceSummaries: [],
    conflictFlags: [],
    confidenceByField,
    confidenceByTarget: {
      cloud_sea: 0,
      glow: 0,
      astro: 0,
      general: 0,
    },
    recommendedPrimarySource: "mock",
    dataStatusZh: "天气数据：演示数据",
    missingDataNotes: ["没有可用于融合的天气源。"],
    fusionNotesZh: ["未找到可用天气源，当前只能使用演示数据。"],
    generatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    summary: {
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
      dataStatusZh: "天气数据：演示数据",
      sourceSummaries: [],
      multiSourceAgreementContext: buildMultiSourceAgreementContext({
        providerBundles: [],
        target: "general",
      }),
      missingDataNotes: ["没有可用于融合的天气源。"],
    },
  };
}

function expectedForecastHours(input: WeatherFusionInput, fallback: number): number {
  const start = Date.parse(input.forecastStart);
  const end = Date.parse(input.forecastEnd);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.max(1, Math.round((end - start) / (60 * 60 * 1000)));
  }
  return Math.max(1, fallback);
}

function timezoneFromWeather(_forecastStart: string): string {
  return "Asia/Shanghai";
}

function annotateSourceSummariesWithCoverage(
  summaries: readonly WeatherSourceSummary[],
  coverage: CloudLayerCoverageSummary,
): readonly WeatherSourceSummary[] {
  return summaries.map((summary) =>
    annotateSourceSummaryWithCloudLayerCoverage(
      summary,
      coverage.providerCoverageSummary.find(
        (providerCoverage) =>
          providerCoverage.providerId === summary.providerId ||
          (providerCoverage.providerCode === summary.providerCode &&
            providerCoverage.modelName === summary.modelName) ||
          (providerCoverage.providerCode === summary.providerCode && !summary.modelName),
      ),
    ),
  );
}

function applyCloudLayerCoverageConfidence(
  confidence: WeatherConfidenceByField,
  coverage: CloudLayerFieldCoverageSummary,
): WeatherConfidenceByField {
  const totalHours = Math.max(1, coverage.totalHours);
  return {
    ...confidence,
    cloudTotal: applyCoveragePenalty(confidence.cloudTotal, coverage.totalCloudCoverage / totalHours),
    cloudLow: applyCoveragePenalty(confidence.cloudLow, coverage.cloudLowCoverage / totalHours),
    cloudMid: applyCoveragePenalty(confidence.cloudMid, coverage.cloudMidCoverage / totalHours),
    cloudHigh: applyCoveragePenalty(confidence.cloudHigh, coverage.cloudHighCoverage / totalHours),
  };
}

function applyCoveragePenalty(confidence: number, coverageRatio: number): number {
  if (coverageRatio >= 0.9) {
    return confidence;
  }
  if (coverageRatio < 0.7) {
    return Math.min(confidence, 0.45);
  }
  return Math.min(confidence, 0.65);
}

function coverageMissingDataNotes(coverage: CloudLayerCoverageSummary): readonly string[] {
  const totalHours = Math.max(1, coverage.fieldCoverageSummary.totalHours);
  const layerRatio =
    Math.min(
      coverage.fieldCoverageSummary.cloudLowCoverage,
      coverage.fieldCoverageSummary.cloudMidCoverage,
      coverage.fieldCoverageSummary.cloudHighCoverage,
    ) / totalHours;
  return layerRatio < 0.9 ? [coverage.userFacingCoverageNoteZh] : [];
}

function fuseCurrent(
  primaryBundle: WeatherDataBundle,
  firstFusedHour: NormalizedHourlyWeather | undefined,
): NormalizedCurrentWeather | undefined {
  if (primaryBundle.currentWeather && !firstFusedHour) {
    return primaryBundle.currentWeather;
  }

  if (!primaryBundle.currentWeather && !firstFusedHour) {
    return undefined;
  }

  const primary = primaryBundle.currentWeather;
  const hour = firstFusedHour;

  return {
    providerCode: primaryBundle.providerCode,
    providerLabelZh: primaryBundle.providerLabelZh,
    dataMode: primaryBundle.dataMode,
    observedAt: primary?.observedAt ?? hour?.time ?? primaryBundle.generatedAt,
    temperature: primary?.temperature ?? hour?.temperature ?? 0,
    feelsLike: primary?.feelsLike ?? hour?.feelsLike ?? null,
    humidity: primary?.humidity ?? hour?.humidity ?? 0,
    dewPoint: primary?.dewPoint ?? hour?.dewPoint ?? null,
    dewPointSpread: primary?.dewPointSpread ?? hour?.dewPointSpread ?? null,
    windSpeed: primary?.windSpeed ?? hour?.windSpeed ?? 0,
    windDirection: primary?.windDirection ?? hour?.windDirection ?? null,
    windGust: primary?.windGust ?? hour?.windGust ?? null,
    pressure: primary?.pressure ?? hour?.pressure ?? null,
    visibility: primary?.visibility ?? hour?.visibility ?? null,
    cloudTotal: primary?.cloudTotal ?? hour?.cloudTotal ?? null,
    cloudLow: primary?.cloudLow ?? hour?.cloudLow ?? null,
    cloudMid: primary?.cloudMid ?? hour?.cloudMid ?? null,
    cloudHigh: primary?.cloudHigh ?? hour?.cloudHigh ?? null,
    precipitation: primary?.precipitation ?? hour?.precipitation ?? null,
    precipitationAmountMm:
      primary?.precipitationAmountMm ??
      hour?.precipitationAmountMm ??
      primary?.precipitation ??
      hour?.precipitation ??
      null,
    rainAmountMm: primary?.rainAmountMm ?? hour?.rainAmountMm ?? null,
    snowAmountMm: primary?.snowAmountMm ?? hour?.snowAmountMm ?? null,
    precipitationProbability:
      primary?.precipitationProbability ?? hour?.precipitationProbability ?? null,
    precipitationProbabilityPercent:
      primary?.precipitationProbabilityPercent ??
      hour?.precipitationProbabilityPercent ??
      primary?.precipitationProbability ??
      hour?.precipitationProbability ??
      null,
    precipitationType: primary?.precipitationType ?? hour?.precipitationType,
    rawVisibilityKm:
      primary?.rawVisibilityKm ??
      hour?.rawVisibilityKm ??
      primary?.visibility ??
      hour?.visibility ??
      null,
    photographyTransparencyScore:
      primary?.photographyTransparencyScore ?? hour?.photographyTransparencyScore,
    transparencyGrade: primary?.transparencyGrade ?? hour?.transparencyGrade,
    cloudFogObstructionRisk: primary?.cloudFogObstructionRisk ?? hour?.cloudFogObstructionRisk,
    exposedRidgeWindRisk: primary?.exposedRidgeWindRisk ?? hour?.exposedRidgeWindRisk,
    mountainFeelsLikeC: primary?.mountainFeelsLikeC ?? hour?.mountainFeelsLikeC,
    tripodStabilityRisk: primary?.tripodStabilityRisk ?? hour?.tripodStabilityRisk,
    windChillNoteZh: primary?.windChillNoteZh ?? hour?.windChillNoteZh,
    clothingRiskNoteZh: primary?.clothingRiskNoteZh ?? hour?.clothingRiskNoteZh,
    rawTemperature: primary?.rawTemperature ?? hour?.rawTemperature,
    elevationAdjustedTemperature:
      primary?.elevationAdjustedTemperature ?? hour?.elevationAdjustedTemperature,
    temperatureAdjustment: primary?.temperatureAdjustment ?? hour?.temperatureAdjustment,
    providerElevationMeters: primary?.providerElevationMeters ?? hour?.providerElevationMeters,
    selectedSpotElevationMeters:
      primary?.selectedSpotElevationMeters ?? hour?.selectedSpotElevationMeters,
    elevationDifferenceMeters:
      primary?.elevationDifferenceMeters ?? hour?.elevationDifferenceMeters,
    terrainAdjustmentApplied: primary?.terrainAdjustmentApplied ?? hour?.terrainAdjustmentApplied,
    terrainAdjustmentReason: primary?.terrainAdjustmentReason ?? hour?.terrainAdjustmentReason,
    weatherTextZh: primary?.weatherTextZh ?? hour?.weatherTextZh ?? null,
    weatherCode: primary?.weatherCode ?? hour?.weatherCode ?? null,
    airQuality: primary?.airQuality ?? null,
    missingFields: [
      ...new Set([...(primary?.missingFields ?? []), ...(hour?.missingFields ?? [])]),
    ],
    estimatedFields: [
      ...new Set([...(primary?.estimatedFields ?? []), ...(hour?.estimatedFields ?? [])]),
    ],
  };
}

function choosePrimaryBundle(bundles: readonly WeatherDataBundle[]): WeatherDataBundle {
  const realBundles = bundles.filter((bundle) => bundle.dataMode === "real");
  return (
    realBundles.find((bundle) => bundle.providerCode === "qweather") ??
    realBundles.find((bundle) => bundle.providerCode === "meteoblue") ??
    bundles.find((bundle) => bundle.providerCode === "qweather") ??
    bundles[0]!
  );
}

function fuseHourlyAt(
  time: string,
  bundles: readonly WeatherDataBundle[],
  primaryBundle: WeatherDataBundle,
  target: ForecastTarget,
): NormalizedHourlyWeather | null {
  const candidates = bundles
    .map((bundle) => ({
      bundle,
      hour: bundle.hourly.find((point) => point.time === time),
    }))
    .filter(
      (candidate): candidate is { bundle: WeatherDataBundle; hour: NormalizedHourlyWeather } =>
        Boolean(candidate.hour),
    );
  const primaryHour =
    candidates.find((candidate) => candidate.bundle.providerCode === primaryBundle.providerCode)
      ?.hour ?? candidates[0]?.hour;
  if (!primaryHour) {
    return null;
  }

  const next: Record<string, unknown> = { ...primaryHour };
  const missingFields = new Set<string>(primaryHour.missingFields ?? []);
  const estimatedFields = new Set<string>(primaryHour.estimatedFields ?? []);
  const fieldMetadata: NormalizedWeatherFieldMetadataMap = {
    ...(primaryHour.fieldMetadata ?? {}),
  };
  const preferredCloudGroup = selectPreferredCloudLayerGroup(candidates, target);

  for (const field of numericFields) {
    const selected = isCloudLayerGroupField(field) && preferredCloudGroup
      ? selectCloudLayerGroupField(field, preferredCloudGroup)
      : selectFieldValue(field, candidates, primaryHour);
    if (selected.value !== undefined) {
      next[field] = selected.value;
    }
    fieldMetadata[field] = {
      value: selected.value ?? null,
      providerCode: selected.providerCode,
      providerLabelZh: selected.providerLabelZh,
      estimated: selected.estimated,
      missingReason:
        selected.value === null || selected.value === undefined
          ? "provider_field_missing"
          : undefined,
      providerElevationMeters: selected.providerElevationMeters,
      selectedSpotElevationMeters: selected.selectedSpotElevationMeters,
      elevationDifferenceMeters: selected.elevationDifferenceMeters,
    };
    if (selected.estimated) {
      estimatedFields.add(field);
    }
    if (selected.value === null || selected.value === undefined) {
      missingFields.add(field);
    } else {
      missingFields.delete(field);
    }
  }

  if (next.dewPointSpread === undefined || next.dewPointSpread === null) {
    const temperature = asNumber(next.temperature);
    const dewPoint = asNumber(next.dewPoint);
    if (temperature !== null && dewPoint !== null) {
      next.dewPointSpread = Math.round((temperature - dewPoint) * 10) / 10;
      estimatedFields.add("dewPointSpread");
    }
  }

  return {
    ...(next as NormalizedHourlyWeather),
    providerCode: primaryBundle.providerCode,
    providerLabelZh: primaryBundle.providerLabelZh,
    dataMode: primaryBundle.dataMode,
    missingFields: [...missingFields],
    estimatedFields: estimatedFields.size > 0 ? [...estimatedFields] : undefined,
    fieldMetadata,
  };
}

type HourlyCandidate = {
  readonly bundle: WeatherDataBundle;
  readonly hour: NormalizedHourlyWeather;
};

function isCloudLayerGroupField(
  field: (typeof numericFields)[number],
): field is "cloudTotal" | "cloudLow" | "cloudMid" | "cloudHigh" {
  return (
    field === "cloudTotal" ||
    field === "cloudLow" ||
    field === "cloudMid" ||
    field === "cloudHigh"
  );
}

function selectPreferredCloudLayerGroup(
  candidates: readonly HourlyCandidate[],
  _target: ForecastTarget,
): HourlyCandidate | undefined {
  const openMeteoCandidates = candidates.filter(
    (candidate) => candidate.bundle.providerCode === "open_meteo",
  );
  const completeOpenMeteo = openMeteoCandidates.find((candidate) =>
    hasCompleteCloudLayerGroup(candidate.hour),
  );
  if (completeOpenMeteo) {
    return completeOpenMeteo;
  }

  const partialOpenMeteo = openMeteoCandidates.find((candidate) =>
    hasUsableNumber(candidate.hour.cloudTotal),
  );
  if (partialOpenMeteo) {
    return partialOpenMeteo;
  }

  return candidates.find((candidate) => hasCompleteCloudLayerGroup(candidate.hour));
}

function hasCompleteCloudLayerGroup(hour: NormalizedHourlyWeather): boolean {
  return (
    hasUsableNumber(hour.cloudTotal) &&
    hasUsableNumber(hour.cloudLow) &&
    hasUsableNumber(hour.cloudMid) &&
    hasUsableNumber(hour.cloudHigh)
  );
}

function hasUsableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function selectCloudLayerGroupField(
  field: "cloudTotal" | "cloudLow" | "cloudMid" | "cloudHigh",
  candidate: HourlyCandidate,
): {
  readonly value: number | null | undefined;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly estimated: boolean;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
} {
  const value = candidate.hour[field] ?? null;

  return {
    value,
    providerCode: candidate.bundle.providerCode,
    providerLabelZh: candidate.bundle.providerLabelZh,
    estimated: candidate.hour.estimatedFields?.includes(field) ?? false,
    providerElevationMeters: candidate.hour.providerElevationMeters,
    selectedSpotElevationMeters:
      candidate.hour.selectedSpotElevationMeters ??
      candidate.bundle.terrainMetadata?.selectedSpotElevationMeters,
    elevationDifferenceMeters:
      candidate.hour.elevationDifferenceMeters ??
      candidate.bundle.terrainMetadata?.elevationDifferenceMeters,
  };
}

function selectFieldValue(
  field: (typeof numericFields)[number],
  candidates: readonly {
    readonly bundle: WeatherDataBundle;
    readonly hour: NormalizedHourlyWeather;
  }[],
  primaryHour: NormalizedHourlyWeather,
): {
  readonly value: number | null | undefined;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly estimated: boolean;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
} {
  const providerOrder = capabilityOrderForField(field);
  const sorted = [...candidates].sort(
    (left, right) =>
      providerRank(left.bundle.providerCode, providerOrder) -
      providerRank(right.bundle.providerCode, providerOrder),
  );

  const selected = sorted.find(
    (candidate) => candidate.hour[field] !== null && candidate.hour[field] !== undefined,
  );
  if (!selected) {
    return {
      value: primaryHour[field] as number | null | undefined,
      providerCode: primaryHour.providerCode,
      providerLabelZh: primaryHour.providerLabelZh,
      estimated: false,
      providerElevationMeters: primaryHour.providerElevationMeters,
      selectedSpotElevationMeters: primaryHour.selectedSpotElevationMeters,
      elevationDifferenceMeters: primaryHour.elevationDifferenceMeters,
    };
  }

  return {
    value: selected.hour[field] as number | null | undefined,
    providerCode: selected.bundle.providerCode,
    providerLabelZh: selected.bundle.providerLabelZh,
    estimated: selected.hour.estimatedFields?.includes(field) ?? false,
    providerElevationMeters: selected.hour.providerElevationMeters,
    selectedSpotElevationMeters:
      selected.hour.selectedSpotElevationMeters ??
      selected.bundle.terrainMetadata?.selectedSpotElevationMeters,
    elevationDifferenceMeters:
      selected.hour.elevationDifferenceMeters ??
      selected.bundle.terrainMetadata?.elevationDifferenceMeters,
  };
}

function capabilityOrderForField(field: string): readonly WeatherProviderCode[] {
  if (
    field === "cloudLow" ||
    field === "cloudMid" ||
    field === "cloudHigh" ||
    field === "dewPoint" ||
    field === "visibility" ||
    field === "pressure"
  ) {
    return ["meteoblue", "open_meteo", "qweather", "mock"];
  }

  if (field === "precipitationProbability") {
    return ["open_meteo", "qweather", "meteoblue", "mock"];
  }

  if (field === "precipitation" || field === "precipitationAmountMm") {
    return ["meteoblue", "open_meteo", "qweather", "mock"];
  }

  if (field === "cloudTotal") {
    return ["meteoblue", "qweather", "open_meteo", "mock"];
  }

  return ["qweather", "meteoblue", "open_meteo", "mock"];
}

function providerRank(
  providerCode: WeatherProviderCode,
  order: readonly WeatherProviderCode[],
): number {
  const index = order.indexOf(providerCode);
  return index === -1 ? order.length : index;
}

function detectConflicts(bundles: readonly WeatherDataBundle[]): readonly WeatherConflictFlag[] {
  const flags: WeatherConflictFlag[] = [];
  const times = [...new Set(bundles.flatMap((bundle) => bundle.hourly.map((hour) => hour.time)))];
  const thresholds: Partial<Record<(typeof numericFields)[number], number>> = {
    cloudTotal: 30,
    cloudLow: 30,
    cloudMid: 30,
    cloudHigh: 30,
    visibility: 8,
    humidity: 20,
    dewPoint: 5,
    pressure: 6,
    windSpeed: 5,
    windGust: 7,
    precipitationProbability: 35,
    precipitation: 8,
    precipitationAmountMm: 8,
  };

  for (const time of times) {
    for (const field of numericFields) {
      const threshold = thresholds[field];
      if (!threshold) {
        continue;
      }

      const values = bundles
        .map((bundle) => ({
          providerCode: bundle.providerCode,
          value: asNumber(bundle.hourly.find((hour) => hour.time === time)?.[field]),
        }))
        .filter(
          (entry): entry is { providerCode: WeatherProviderCode; value: number } =>
            entry.value !== null,
        );
      if (values.length < 2) {
        continue;
      }

      const min = Math.min(...values.map((entry) => entry.value));
      const max = Math.max(...values.map((entry) => entry.value));
      if (max - min >= threshold) {
        flags.push({
          field,
          time,
          providers: values.map((entry) => entry.providerCode),
          severity: max - min >= threshold * 1.5 ? "high" : "medium",
          noteZh: `${field} 在多个天气源之间差异较大，当前判断需要谨慎参考。`,
        });
      }
    }
  }

  return flags;
}

function fuseDailyByDate(
  bundles: readonly WeatherDataBundle[],
  primaryBundle: WeatherDataBundle,
): readonly NormalizedDailyWeather[] {
  const dates = [
    ...new Set(bundles.flatMap((bundle) => bundle.daily.map((day) => day.date))),
  ].sort();
  return dates
    .map(
      (date) =>
        primaryBundle.daily.find((day) => day.date === date) ??
        bundles.flatMap((bundle) => bundle.daily).find((day) => day.date === date),
    )
    .filter((day): day is NormalizedDailyWeather => Boolean(day));
}

function sourceSummary(bundle: WeatherDataBundle): WeatherSourceSummary {
  const existing = bundle.sourceSummaries?.find(
    (summary) => summary.providerCode === bundle.providerCode,
  );
  const missingFields = collectBundleMissingFields(bundle);
  const availableFields = [
    ...new Set(
      numericFields.filter((field) => bundle.hourly.some((hour) => asNumber(hour[field]) !== null)),
    ),
  ];

  const base: WeatherSourceSummary = {
    providerCode: bundle.providerCode,
    providerLabelZh: bundle.providerLabelZh,
    dataMode: bundle.dataMode,
    enabled: true,
    realCallEnabled: bundle.dataMode === "real",
    attempted: true,
    success: true,
    partial: bundle.providerCode === "meteoblue" && missingFields.length > 0,
    status: "available",
    availableFields,
    extractedFields: availableFields,
    missingFields,
    generatedAt: bundle.generatedAt,
    providerElevationMeters: bundle.terrainMetadata?.providerElevationMeters,
    providerElevationSource: bundle.terrainMetadata?.providerElevationSource,
    providerElevationKnown: bundle.terrainMetadata?.providerElevationKnown,
    selectedSpotElevationMeters: bundle.terrainMetadata?.selectedSpotElevationMeters,
    elevationDifferenceMeters: bundle.terrainMetadata?.elevationDifferenceMeters,
    terrainAdjustmentApplied: bundle.terrainMetadata?.terrainAdjustmentApplied,
    terrainAdjustmentReason: bundle.terrainMetadata?.terrainAdjustmentReason,
    dayCorrectionRatio: bundle.terrainMetadata?.dayCorrectionRatio,
    nightCorrectionRatio: bundle.terrainMetadata?.nightCorrectionRatio,
    messageZh:
      bundle.providerCode === "meteoblue" && missingFields.length > 0
        ? "meteoblue 通过，部分字段缺失。"
        : `${bundle.providerLabelZh} 通过。`,
  };

  return {
    ...base,
    ...existing,
    status: existing?.status ?? base.status,
    availableFields: existing?.availableFields ?? base.availableFields,
    extractedFields: existing?.extractedFields ?? existing?.availableFields ?? base.extractedFields,
    missingFields: existing?.missingFields ?? base.missingFields,
    messageZh: existing?.messageZh ?? base.messageZh,
    success: existing?.success ?? base.success,
    partial: existing?.partial ?? base.partial,
    attempted: existing?.attempted ?? base.attempted,
    enabled: existing?.enabled ?? base.enabled,
    realCallEnabled: existing?.realCallEnabled ?? base.realCallEnabled,
  };
}

function collectBundleMissingFields(bundle: WeatherDataBundle): readonly string[] {
  return [
    ...new Set([
      ...(bundle.missingFields ?? []),
      ...bundle.hourly.flatMap((hour) => hour.missingFields ?? []),
      ...bundle.daily.flatMap((day) => day.missingFields ?? []),
    ]),
  ];
}

function buildConfidenceByField(
  bundles: readonly WeatherDataBundle[],
  conflicts: readonly WeatherConflictFlag[],
): WeatherConfidenceByField {
  const result = Object.fromEntries(
    fieldConfidenceKeys.map((field) => {
      const sourceCount = countSourcesForConfidenceField(bundles, field);
      const agreementBonus = sourceCount >= 2 ? 0.15 : 0;
      const sourcePenalty = sourceCount === 0 ? 0.5 : sourceCount === 1 ? 0.15 : 0;
      const conflictPenalty = conflicts.some((flag) => fieldMatchesConfidenceKey(flag.field, field))
        ? 0.25
        : 0;
      return [field, clampConfidence(0.72 + agreementBonus - sourcePenalty - conflictPenalty)];
    }),
  ) as WeatherConfidenceByField;

  return result;
}

function countSourcesForConfidenceField(
  bundles: readonly WeatherDataBundle[],
  field: keyof WeatherConfidenceByField,
): number {
  if (field === "precipitation") {
    return bundles.filter((bundle) =>
      bundle.hourly.some(
        (hour) =>
          asNumber(hour.precipitationProbability) !== null ||
          asNumber(hour.precipitation) !== null ||
          asNumber(hour.precipitationAmountMm) !== null,
      ),
    ).length;
  }
  const sourceField = field === "wind" ? "windSpeed" : field;
  return bundles.filter((bundle) =>
    bundle.hourly.some(
      (hour) => asNumber(hour[sourceField as keyof NormalizedHourlyWeather]) !== null,
    ),
  ).length;
}

function fieldMatchesConfidenceKey(field: string, key: keyof WeatherConfidenceByField): boolean {
  if (key === "wind") {
    return field === "windSpeed" || field === "windGust" || field === "windDirection";
  }
  if (key === "precipitation") {
    return (
      field === "precipitation" ||
      field === "precipitationProbability" ||
      field === "precipitationAmountMm" ||
      field === "rainAmountMm" ||
      field === "snowAmountMm"
    );
  }
  return field === key;
}

function buildConfidenceByTarget(
  field: WeatherConfidenceByField,
  conflicts: readonly WeatherConflictFlag[],
  terrainSummary: TerrainProfileSummary | undefined,
): WeatherConfidenceByTarget {
  const terrainBonus = terrainSummary ? 0.05 : 0;
  const conflictPenalty = conflicts.length > 0 ? Math.min(0.2, conflicts.length * 0.03) : 0;
  return {
    cloud_sea: clampConfidence(
      average([field.humidity, field.dewPoint, field.cloudLow, field.visibility, field.wind]) +
        terrainBonus -
        conflictPenalty,
    ),
    glow: clampConfidence(
      average([
        field.cloudLow,
        field.cloudMid,
        field.cloudHigh,
        field.cloudTotal,
        field.visibility,
      ]) - conflictPenalty,
    ),
    astro: clampConfidence(
      average([
        field.cloudTotal,
        field.cloudLow,
        field.cloudMid,
        field.cloudHigh,
        field.visibility,
      ]) - conflictPenalty,
    ),
    general: clampConfidence(
      average([
        field.cloudTotal,
        field.visibility,
        field.humidity,
        field.wind,
        field.precipitation,
      ]) - conflictPenalty,
    ),
  };
}

function applyProviderConfidenceFloor(
  confidenceByTarget: WeatherConfidenceByTarget,
  bundles: readonly WeatherDataBundle[],
  conflicts: readonly WeatherConflictFlag[],
): WeatherConfidenceByTarget {
  const hasQWeather = bundles.some(
    (bundle) => bundle.providerCode === "qweather" && bundle.dataMode === "real",
  );
  const hasOpenMeteo = bundles.some(
    (bundle) => bundle.providerCode === "open_meteo" && bundle.dataMode === "real",
  );
  const hasMajorConflict = conflicts.some((flag) => flag.severity === "high");
  if (!hasQWeather || !hasOpenMeteo || hasMajorConflict) {
    return confidenceByTarget;
  }

  return {
    cloud_sea: Math.max(confidenceByTarget.cloud_sea, 0.55),
    glow: Math.max(confidenceByTarget.glow, 0.55),
    astro: Math.max(confidenceByTarget.astro, 0.55),
    general: Math.max(confidenceByTarget.general, 0.55),
  };
}

function buildMissingDataNotes(
  confidenceByField: WeatherConfidenceByField,
  sourceSummaries: readonly WeatherSourceSummary[],
): readonly string[] {
  const notes: string[] = [];
  if (
    confidenceByField.cloudLow < 0.6 ||
    confidenceByField.cloudMid < 0.6 ||
    confidenceByField.cloudHigh < 0.6
  ) {
    notes.push("云层分层数据不足，云海、霞光和星空判断置信度会降低。");
  }
  if (confidenceByField.visibility < 0.6) {
    notes.push("能见度数据不足，通透度和远景拍摄建议需要谨慎参考。");
  }
  if (sourceSummaries.every((summary) => summary.dataMode !== "real")) {
    notes.push("当前未使用真实天气源，结果不能作为正式出行依据。");
  }
  return notes;
}

function buildFusionNotes(input: {
  readonly usableBundles: readonly WeatherDataBundle[];
  readonly conflictFlags: readonly WeatherConflictFlag[];
  readonly confidenceLevel: WeatherConfidenceLevel;
  readonly target: ForecastTarget;
  readonly professionalSourceStatus: string;
}): readonly string[] {
  const notes = [
    `当前目标 ${input.target} 使用 ${targetPriorityFields(input.target).join("、")} 作为重点字段。`,
    input.professionalSourceStatus,
  ];
  if (input.usableBundles.length >= 2) {
    notes.push("多个天气源可用时按字段能力选择主值，不盲目平均。");
  }
  if (input.conflictFlags.length > 0) {
    notes.push("检测到天气源差异，已降低相关字段和目标置信度。");
  }
  notes.push(
    `融合置信度：${
      input.confidenceLevel === "high" ? "高" : input.confidenceLevel === "medium" ? "中" : "低"
    }。`,
  );
  return notes;
}

function buildDataStatus(
  bundles: readonly WeatherDataBundle[],
  confidenceLevel: WeatherConfidenceLevel,
): string {
  if (bundles.every((bundle) => bundle.dataMode !== "real")) {
    return "天气数据：演示数据";
  }

  const weatherSource =
    bundles.find((bundle) => bundle.providerCode === "qweather" && bundle.dataMode === "real")
      ?.providerLabelZh ??
    bundles.find((bundle) => bundle.dataMode === "real")?.providerLabelZh ??
    "正式数据源";
  const cloudAuxiliary = bundles.some(
    (bundle) => bundle.providerCode === "open_meteo" && bundle.dataMode === "real",
  )
    ? "；云层分层辅助可用"
    : "";
  const confidenceLabel =
    confidenceLevel === "high" ? "高" : confidenceLevel === "medium" ? "中" : "低";
  return `天气数据：${weatherSource}${cloudAuxiliary}；数据置信度：${confidenceLabel}`;
}

function confidenceLevelFromScore(value: number): WeatherConfidenceLevel {
  if (value >= 0.78) {
    return "high";
  }
  if (value >= 0.55) {
    return "medium";
  }
  return "low";
}

function clampConfidence(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
