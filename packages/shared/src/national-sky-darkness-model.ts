import type { EstimatedBortleRange, LightPollutionInfo, SkyBrightnessInfo } from "./types.js";

type QuantileKey = "p01" | "p05" | "p10" | "p25" | "p50" | "p75" | "p90" | "p95" | "p99";

export type NationalSkyDarknessQuantiles = Partial<Record<QuantileKey, number>>;

export type NationalSkyDarknessModelConfig = {
  readonly version: string;
  readonly statisticsVersion: string;
  readonly statisticsSource: "packaged_default" | "runtime_imported";
  readonly positiveRadianceQuantiles: NationalSkyDarknessQuantiles;
  readonly allRadianceQuantiles: NationalSkyDarknessQuantiles;
  readonly localRadianceQuantiles: NationalSkyDarknessQuantiles;
  readonly haloRadianceQuantiles: NationalSkyDarknessQuantiles;
  readonly ambientRiskIndexQuantiles: NationalSkyDarknessQuantiles;
  readonly localToHaloRatioQuantiles: NationalSkyDarknessQuantiles;
  readonly haloToLocalRatioQuantiles: NationalSkyDarknessQuantiles;
  readonly lowRadianceSaturationUpper: number;
  readonly minimumResolvableDarkRadiance: number;
  readonly urbanSkyglowHaloToLocalRatio: number;
  readonly strongDarkMaxLocalQuantile: number;
  readonly strongDarkMaxHaloQuantile: number;
  readonly strongDarkMaxAmbientRiskIndex: number;
  readonly minValidSampleCount: number;
  readonly strongValidSampleCount: number;
  readonly minSampleCoverageRatio: number;
};

export type NationalSkyDarknessModelResult = {
  readonly available: boolean;
  readonly minClass?: number;
  readonly maxClass?: number;
  readonly rangeLabelZh: string;
  readonly skyQualityLabelZh: string;
  readonly confidence: EstimatedBortleRange["confidence"];
  readonly modelVersion: string;
  readonly statisticsVersion: string;
  readonly statisticsSource: NationalSkyDarknessModelConfig["statisticsSource"];
  readonly conservative: boolean;
  readonly calibrationEvidenceLevel: "insufficient" | "limited" | "supported";
  readonly rangeWidthClasses: number | null;
  readonly rangeWidthPolicy: "narrow" | "normal" | "wide_uncertain" | "too_wide" | "unavailable";
  readonly tooWideRange: boolean;
  readonly diagnostics: readonly string[];
  readonly confidenceReasonsZh: readonly string[];
  readonly positiveRadianceQuantile: number | null;
  readonly localRadianceQuantile: number | null;
  readonly haloRadianceQuantile: number | null;
  readonly ambientRiskQuantile: number | null;
  readonly localToHaloRatioQuantile: number | null;
  readonly haloToLocalRatioQuantile: number | null;
  readonly localToHaloRatio: number | null;
  readonly haloToLocalRatio: number | null;
  readonly lowRadianceSaturationRisk: boolean;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly darkZoneSaturationRisk: boolean;
  readonly nationalRiskIndex: number | null;
  readonly primaryBaseline: "wa_model" | "viirs_national_fallback";
  readonly skyBrightnessAvailable: boolean;
  readonly skyBrightnessValueType: SkyBrightnessInfo["valueType"] | null;
  readonly skyBrightnessRawValue: number | null;
  readonly skyBrightnessValueUnit: string | null;
  readonly modeledSkyBrightnessMagArcsec2: number | null;
  readonly skyBrightnessEstimatedBortleMin: number | null;
  readonly skyBrightnessEstimatedBortleMax: number | null;
  readonly skyBrightnessEstimatedBortleLabel: string | null;
  readonly skyBrightnessDatasetYear: number | null;
  readonly skyBrightnessDatasetVersion: string | null;
  readonly skyBrightnessConflictRisk: boolean;
  readonly basisZh: string;
};

export const defaultNationalSkyDarknessModelConfig: NationalSkyDarknessModelConfig = {
  version: "china-national-sky-darkness-v2",
  statisticsVersion: "china-viirs-default-distribution-v1",
  statisticsSource: "packaged_default",
  positiveRadianceQuantiles: {
    p01: 0.0015,
    p05: 0.004,
    p10: 0.012,
    p25: 0.06,
    p50: 0.42,
    p75: 2.4,
    p90: 8.5,
    p95: 18,
    p99: 65,
  },
  allRadianceQuantiles: {
    p01: 0,
    p05: 0,
    p10: 0.001,
    p25: 0.02,
    p50: 0.24,
    p75: 1.8,
    p90: 7.2,
    p95: 16,
    p99: 58,
  },
  localRadianceQuantiles: {
    p01: 0,
    p05: 0.003,
    p10: 0.01,
    p25: 0.05,
    p50: 0.35,
    p75: 2.0,
    p90: 7.8,
    p95: 16,
    p99: 55,
  },
  haloRadianceQuantiles: {
    p01: 0.002,
    p05: 0.01,
    p10: 0.025,
    p25: 0.09,
    p50: 0.55,
    p75: 2.8,
    p90: 9.6,
    p95: 21,
    p99: 72,
  },
  ambientRiskIndexQuantiles: {
    p01: 2,
    p05: 6,
    p10: 12,
    p25: 28,
    p50: 48,
    p75: 68,
    p90: 82,
    p95: 90,
    p99: 98,
  },
  localToHaloRatioQuantiles: {
    p01: 0.02,
    p05: 0.08,
    p10: 0.16,
    p25: 0.42,
    p50: 0.9,
    p75: 1.8,
    p90: 3.8,
    p95: 6.5,
    p99: 14,
  },
  haloToLocalRatioQuantiles: {
    p01: 0.08,
    p05: 0.16,
    p10: 0.28,
    p25: 0.65,
    p50: 1.1,
    p75: 2.4,
    p90: 6,
    p95: 12,
    p99: 35,
  },
  lowRadianceSaturationUpper: 0.001,
  minimumResolvableDarkRadiance: 0.003,
  urbanSkyglowHaloToLocalRatio: 4,
  strongDarkMaxLocalQuantile: 8,
  strongDarkMaxHaloQuantile: 12,
  strongDarkMaxAmbientRiskIndex: 12,
  minValidSampleCount: 48,
  strongValidSampleCount: 72,
  minSampleCoverageRatio: 0.75,
};

export function resolveNationalSkyDarknessModel(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
  config: NationalSkyDarknessModelConfig = defaultNationalSkyDarknessModelConfig,
): NationalSkyDarknessModelResult {
  if (!rawEstimate.available) {
    const waOnlyResult = nationalSkyDarknessModelFromWaOnly(lightPollution, rawEstimate, config);
    if (waOnlyResult) {
      return waOnlyResult;
    }
    return unavailableNationalSkyDarknessModel(rawEstimate, config);
  }

  const localRadiance = finiteNumber(lightPollution.localRadiance);
  const haloRadiance = finiteNumber(lightPollution.surroundingHaloRadiance);
  const ambientRiskIndex = finiteNumber(lightPollution.ambientRiskIndex);
  const sampleCoverageRatio =
    lightPollution.sampleCount > 0
      ? lightPollution.validSampleCount / lightPollution.sampleCount
      : null;
  const localToHaloRatio =
    localRadiance !== undefined && haloRadiance !== undefined && haloRadiance > 0
      ? roundRatio(localRadiance / haloRadiance)
      : null;
  const haloToLocalRatio =
    localRadiance !== undefined && haloRadiance !== undefined
      ? localRadiance > 0
        ? roundRatio(haloRadiance / localRadiance)
        : haloRadiance > 0
          ? Number.POSITIVE_INFINITY
          : null
      : null;

  const positiveRadianceQuantile =
    localRadiance !== undefined && localRadiance > 0
      ? quantilePosition(localRadiance, config.positiveRadianceQuantiles)
      : null;
  const localRadianceQuantile =
    localRadiance !== undefined ? quantilePosition(localRadiance, config.localRadianceQuantiles) : null;
  const haloRadianceQuantile =
    haloRadiance !== undefined ? quantilePosition(haloRadiance, config.haloRadianceQuantiles) : null;
  const ambientRiskQuantile =
    ambientRiskIndex !== undefined
      ? quantilePosition(ambientRiskIndex, config.ambientRiskIndexQuantiles)
      : null;
  const localToHaloRatioQuantile =
    localToHaloRatio !== null && Number.isFinite(localToHaloRatio)
      ? quantilePosition(localToHaloRatio, config.localToHaloRatioQuantiles)
      : null;
  const haloToLocalRatioQuantile =
    haloToLocalRatio !== null && Number.isFinite(haloToLocalRatio)
      ? quantilePosition(haloToLocalRatio, config.haloToLocalRatioQuantiles)
      : haloToLocalRatio === Number.POSITIVE_INFINITY
        ? 100
        : null;

  const calibrationEvidenceLevel = resolveCalibrationEvidenceLevel(lightPollution);
  const lowSampleSupport =
    lightPollution.validSampleCount < config.minValidSampleCount ||
    sampleCoverageRatio === null ||
    sampleCoverageRatio < config.minSampleCoverageRatio;
  const strongSampleSupport =
    lightPollution.validSampleCount >= config.strongValidSampleCount &&
    sampleCoverageRatio !== null &&
    sampleCoverageRatio >= config.minSampleCoverageRatio &&
    lightPollution.confidence !== "low" &&
    rawEstimate.confidence !== "low";
  const lowRadianceSaturationRisk =
    localRadiance === undefined ||
    localRadiance <= config.lowRadianceSaturationUpper ||
    localRadianceQuantile === null;
  const urbanSkyglowSpilloverRisk =
    (typeof haloToLocalRatio === "number" &&
      (haloToLocalRatio === Number.POSITIVE_INFINITY ||
        haloToLocalRatio >= config.urbanSkyglowHaloToLocalRatio)) ||
    ((localRadianceQuantile ?? 100) <= 25 && (haloRadianceQuantile ?? 0) >= 50);
  const darkZoneSaturationRisk =
    (localRadianceQuantile ?? 100) <= 5 && (ambientRiskIndex ?? 100) <= 12;
  const directionalCoverageComplete = hasCompleteDirectionalCoverage(lightPollution);
  const targetDirectionResolved =
    typeof lightPollution.targetAzimuthDegrees !== "number" ||
    (typeof lightPollution.targetDirectionRisk === "number" &&
      Number.isFinite(lightPollution.targetDirectionRisk));
  const stableNationalDarkEvidence =
    calibrationEvidenceLevel === "supported" &&
    strongSampleSupport &&
    directionalCoverageComplete &&
    targetDirectionResolved &&
    !lowRadianceSaturationRisk &&
    !urbanSkyglowSpilloverRisk &&
    (localRadianceQuantile ?? 100) <= config.strongDarkMaxLocalQuantile &&
    (haloRadianceQuantile ?? 100) <= config.strongDarkMaxHaloQuantile &&
    (ambientRiskIndex ?? 100) <= config.strongDarkMaxAmbientRiskIndex;
  const lowEndRawRange =
    (rawEstimate.minClass ?? 9) <= 2 &&
    (rawEstimate.maxClass ?? rawEstimate.minClass ?? 9) <= 3;
  const nationalRiskIndex = resolveNationalRiskIndex({
    ambientRiskIndex,
    localRadianceQuantile,
    haloRadianceQuantile,
    ambientRiskQuantile,
    urbanSkyglowSpilloverRisk,
    lowSampleSupport,
  });
  const publicRange = resolvePublicBortleRange({
    rawEstimate,
    nationalRiskIndex,
    stableNationalDarkEvidence,
    lowEndRawRange,
    lowSampleSupport,
    urbanSkyglowSpilloverRisk,
    lowRadianceSaturationRisk,
    calibrationEvidenceLevel,
  });
  const fusion = resolveSkyBrightnessViirsFusion({
    skyBrightness: lightPollution.skyBrightness,
    viirsPublicRange: publicRange,
    viirsRawEstimate: rawEstimate,
    nationalRiskIndex,
    stableNationalDarkEvidence,
    lowSampleSupport,
    urbanSkyglowSpilloverRisk,
    lowRadianceSaturationRisk,
    calibrationEvidenceLevel,
  });
  const rangeWidthClasses = rangeClassWidth(fusion.publicRange);
  const rangeWidthPolicy = classifyRangeWidthPolicy(fusion.publicRange);
  const tooWideRange = rangeWidthPolicy === "too_wide";
  const conservative =
    fusion.publicRange.minClass !== rawEstimate.minClass ||
    fusion.publicRange.maxClass !== rawEstimate.maxClass ||
    calibrationEvidenceLevel !== "supported" ||
    lowSampleSupport ||
    urbanSkyglowSpilloverRisk ||
    lowRadianceSaturationRisk ||
    darkZoneSaturationRisk ||
    fusion.conservative ||
    tooWideRange;
  const diagnostics = resolveDiagnostics({
    calibrationEvidenceLevel,
    lowSampleSupport,
    strongSampleSupport,
    lowRadianceSaturationRisk,
    urbanSkyglowSpilloverRisk,
    darkZoneSaturationRisk,
    directionalCoverageComplete,
    targetDirectionResolved,
    stableNationalDarkEvidence,
    lowEndRawRange,
    skyBrightnessAvailable: fusion.skyBrightnessAvailable,
    skyBrightnessConflictRisk: fusion.skyBrightnessConflictRisk,
    skyBrightnessUnsupported: fusion.skyBrightnessUnsupported,
    rangeWidthPolicy,
  });
  const confidence = resolvePublicConfidence({
    rawEstimate,
    conservative,
    rangeWidthPolicy,
    lowSampleSupport,
    urbanSkyglowSpilloverRisk,
    lowRadianceSaturationRisk,
    skyBrightnessConflictRisk: fusion.skyBrightnessConflictRisk,
    skyBrightnessAvailable: fusion.skyBrightnessAvailable,
  });

  return {
    available: true,
    minClass: fusion.publicRange.minClass,
    maxClass: fusion.publicRange.maxClass,
    rangeLabelZh: formatBortleRange(
      fusion.publicRange.minClass,
      fusion.publicRange.maxClass,
      conservative,
    ),
    skyQualityLabelZh: publicSkyQualityLabel(
      fusion.publicRange.minClass,
      fusion.publicRange.maxClass,
      conservative,
      confidence,
      rangeWidthPolicy,
    ),
    confidence,
    modelVersion: config.version,
    statisticsVersion: config.statisticsVersion,
    statisticsSource: config.statisticsSource,
    conservative,
    calibrationEvidenceLevel,
    rangeWidthClasses,
    rangeWidthPolicy,
    tooWideRange,
    diagnostics,
    confidenceReasonsZh: diagnostics.map(diagnosticReasonZh),
    positiveRadianceQuantile,
    localRadianceQuantile,
    haloRadianceQuantile,
    ambientRiskQuantile,
    localToHaloRatioQuantile,
    haloToLocalRatioQuantile,
    localToHaloRatio,
    haloToLocalRatio,
    lowRadianceSaturationRisk,
    urbanSkyglowSpilloverRisk,
    darkZoneSaturationRisk,
    nationalRiskIndex,
    primaryBaseline: fusion.primaryBaseline,
    skyBrightnessAvailable: fusion.skyBrightnessAvailable,
    skyBrightnessValueType: fusion.skyBrightnessValueType,
    skyBrightnessRawValue: fusion.skyBrightnessRawValue,
    skyBrightnessValueUnit: fusion.skyBrightnessValueUnit,
    modeledSkyBrightnessMagArcsec2: fusion.modeledSkyBrightnessMagArcsec2,
    skyBrightnessEstimatedBortleMin: fusion.skyBrightnessEstimatedBortleMin,
    skyBrightnessEstimatedBortleMax: fusion.skyBrightnessEstimatedBortleMax,
    skyBrightnessEstimatedBortleLabel: fusion.skyBrightnessEstimatedBortleLabel,
    skyBrightnessDatasetYear: fusion.skyBrightnessDatasetYear,
    skyBrightnessDatasetVersion: fusion.skyBrightnessDatasetVersion,
    skyBrightnessConflictRisk: fusion.skyBrightnessConflictRisk,
    basisZh: buildNationalBasisZhV2({
      rawEstimate,
      config,
      calibrationEvidenceLevel,
      nationalRiskIndex,
      localRadianceQuantile,
      haloRadianceQuantile,
      ambientRiskQuantile,
      diagnostics,
      haloToLocalRatio,
      fusion,
    }),
  };
}

export function resolveChinaPublicBortleRange(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
  config: NationalSkyDarknessModelConfig = defaultNationalSkyDarknessModelConfig,
): Pick<NationalSkyDarknessModelResult, "available" | "minClass" | "maxClass" | "rangeLabelZh"> {
  const result = resolveNationalSkyDarknessModel(lightPollution, rawEstimate, config);
  return {
    available: result.available,
    minClass: result.minClass,
    maxClass: result.maxClass,
    rangeLabelZh: result.rangeLabelZh,
  };
}

export function resolveNationalLightPollutionLabel(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
): string {
  return resolveNationalSkyDarknessModel(lightPollution, rawEstimate).skyQualityLabelZh;
}

export function resolveSkyDarknessPhotographyConfidence(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
): EstimatedBortleRange["confidence"] {
  return resolveNationalSkyDarknessModel(lightPollution, rawEstimate).confidence;
}

function unavailableNationalSkyDarknessModel(
  rawEstimate: EstimatedBortleRange,
  config: NationalSkyDarknessModelConfig,
): NationalSkyDarknessModelResult {
  return {
    available: false,
    rangeLabelZh: rawEstimate.rangeLabelZh,
    skyQualityLabelZh: rawEstimate.skyQualityLabelZh,
    confidence: "low",
    modelVersion: config.version,
    statisticsVersion: config.statisticsVersion,
    statisticsSource: config.statisticsSource,
    conservative: true,
    calibrationEvidenceLevel: "insufficient",
    rangeWidthClasses: null,
    rangeWidthPolicy: "unavailable",
    tooWideRange: false,
    diagnostics: ["raw_estimate_unavailable"],
    confidenceReasonsZh: ["原始波特尔估算不可用"],
    positiveRadianceQuantile: null,
    localRadianceQuantile: null,
    haloRadianceQuantile: null,
    ambientRiskQuantile: null,
    localToHaloRatioQuantile: null,
    haloToLocalRatioQuantile: null,
    localToHaloRatio: null,
    haloToLocalRatio: null,
    lowRadianceSaturationRisk: true,
    urbanSkyglowSpilloverRisk: false,
    darkZoneSaturationRisk: false,
    nationalRiskIndex: null,
    primaryBaseline: "viirs_national_fallback",
    skyBrightnessAvailable: false,
    skyBrightnessValueType: null,
    skyBrightnessRawValue: null,
    skyBrightnessValueUnit: null,
    modeledSkyBrightnessMagArcsec2: null,
    skyBrightnessEstimatedBortleMin: null,
    skyBrightnessEstimatedBortleMax: null,
    skyBrightnessEstimatedBortleLabel: null,
    skyBrightnessDatasetYear: null,
    skyBrightnessDatasetVersion: null,
    skyBrightnessConflictRisk: false,
    basisZh: rawEstimate.basisZh,
  };
}

function nationalSkyDarknessModelFromWaOnly(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
  config: NationalSkyDarknessModelConfig,
): NationalSkyDarknessModelResult | null {
  const skyBrightness = lightPollution.skyBrightness;
  const skyRange = normalizedSkyBrightnessRange(skyBrightness);
  if (!skyRange) {
    return null;
  }
  const publicRange = applyPublicRangeWidthPolicy({
    range: skyRange,
    anchorRange: skyRange,
    maxWidthClasses: 2,
  });
  const rangeWidthClasses = rangeClassWidth(publicRange);
  const rangeWidthPolicy = classifyRangeWidthPolicy(publicRange);
  const diagnostics = resolveDiagnostics({
    calibrationEvidenceLevel: "insufficient",
    lowSampleSupport: true,
    strongSampleSupport: false,
    lowRadianceSaturationRisk: false,
    urbanSkyglowSpilloverRisk: false,
    darkZoneSaturationRisk: false,
    directionalCoverageComplete: false,
    targetDirectionResolved: false,
    stableNationalDarkEvidence: false,
    lowEndRawRange: false,
    skyBrightnessAvailable: true,
    skyBrightnessConflictRisk: false,
    skyBrightnessUnsupported: skyBrightness?.diagnostics?.healthStatus === "unsupported_value_type",
    rangeWidthPolicy,
    extraDiagnostics: ["viirs_estimate_unavailable"],
  });

  return {
    available: true,
    minClass: publicRange.minClass,
    maxClass: publicRange.maxClass,
    rangeLabelZh: formatBortleRange(publicRange.minClass, publicRange.maxClass, true),
    skyQualityLabelZh: publicSkyQualityLabel(
      publicRange.minClass,
      publicRange.maxClass,
      true,
      "low",
      rangeWidthPolicy,
    ),
    confidence: "low",
    modelVersion: config.version,
    statisticsVersion: config.statisticsVersion,
    statisticsSource: config.statisticsSource,
    conservative: true,
    calibrationEvidenceLevel: "insufficient",
    rangeWidthClasses,
    rangeWidthPolicy,
    tooWideRange: rangeWidthPolicy === "too_wide",
    diagnostics,
    confidenceReasonsZh: diagnostics.map(diagnosticReasonZh),
    positiveRadianceQuantile: null,
    localRadianceQuantile: null,
    haloRadianceQuantile: null,
    ambientRiskQuantile: null,
    localToHaloRatioQuantile: null,
    haloToLocalRatioQuantile: null,
    localToHaloRatio: null,
    haloToLocalRatio: null,
    lowRadianceSaturationRisk: false,
    urbanSkyglowSpilloverRisk: false,
    darkZoneSaturationRisk: false,
    nationalRiskIndex: null,
    primaryBaseline: "wa_model",
    skyBrightnessAvailable: true,
    skyBrightnessValueType: skyBrightness?.valueType ?? null,
    skyBrightnessRawValue: finiteOrNull(skyBrightness?.rawValue),
    skyBrightnessValueUnit: skyBrightness?.valueUnit ?? null,
    modeledSkyBrightnessMagArcsec2: finiteOrNull(skyBrightness?.modeledSqm),
    skyBrightnessEstimatedBortleMin: publicRange.minClass,
    skyBrightnessEstimatedBortleMax: publicRange.maxClass,
    skyBrightnessEstimatedBortleLabel: skyBrightness?.estimatedBortleRange?.rangeLabelZh ?? null,
    skyBrightnessDatasetYear: skyBrightness?.datasetYear ?? null,
    skyBrightnessDatasetVersion: skyBrightness?.datasetVersion ?? null,
    skyBrightnessConflictRisk: false,
    basisZh: [
      `National sky-darkness model ${config.version}.`,
      `Public baseline: WA/model only (${skyBrightness?.estimatedBortleRange?.rangeLabelZh ?? "available"}).`,
      "Raw VIIRS estimate is unavailable; confidence is lowered and local/halo correction is not inferred.",
      "Modeled values are raster-derived estimates, not field measurements or validated classifications.",
      rawEstimate.basisZh,
    ].join(" "),
  };
}

export type SkyBrightnessViirsFusionResult = {
  readonly publicRange: { readonly minClass: number; readonly maxClass: number };
  readonly primaryBaseline: "wa_model" | "viirs_national_fallback";
  readonly conservative: boolean;
  readonly skyBrightnessAvailable: boolean;
  readonly skyBrightnessUnsupported: boolean;
  readonly skyBrightnessConflictRisk: boolean;
  readonly skyBrightnessValueType: SkyBrightnessInfo["valueType"] | null;
  readonly skyBrightnessRawValue: number | null;
  readonly skyBrightnessValueUnit: string | null;
  readonly modeledSkyBrightnessMagArcsec2: number | null;
  readonly skyBrightnessEstimatedBortleMin: number | null;
  readonly skyBrightnessEstimatedBortleMax: number | null;
  readonly skyBrightnessEstimatedBortleLabel: string | null;
  readonly skyBrightnessDatasetYear: number | null;
  readonly skyBrightnessDatasetVersion: string | null;
};

export function resolveSkyBrightnessViirsFusion(input: {
  readonly skyBrightness?: SkyBrightnessInfo | null;
  readonly viirsPublicRange: { readonly minClass: number; readonly maxClass: number };
  readonly viirsRawEstimate: EstimatedBortleRange;
  readonly nationalRiskIndex: number | null;
  readonly stableNationalDarkEvidence: boolean;
  readonly lowSampleSupport: boolean;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly lowRadianceSaturationRisk: boolean;
  readonly calibrationEvidenceLevel: NationalSkyDarknessModelResult["calibrationEvidenceLevel"];
}): SkyBrightnessViirsFusionResult {
  const skyBrightness = input.skyBrightness;
  const skyRange = normalizedSkyBrightnessRange(skyBrightness);
  const unsupported = skyBrightness?.diagnostics?.healthStatus === "unsupported_value_type";
  const base = {
    skyBrightnessAvailable: Boolean(skyBrightness?.available && skyBrightness.dataAvailable),
    skyBrightnessUnsupported: unsupported,
    skyBrightnessValueType: skyBrightness?.valueType ?? null,
    skyBrightnessRawValue: finiteOrNull(skyBrightness?.rawValue),
    skyBrightnessValueUnit: skyBrightness?.valueUnit ?? null,
    modeledSkyBrightnessMagArcsec2: finiteOrNull(skyBrightness?.modeledSqm),
    skyBrightnessEstimatedBortleMin: skyRange?.minClass ?? null,
    skyBrightnessEstimatedBortleMax: skyRange?.maxClass ?? null,
    skyBrightnessEstimatedBortleLabel: skyBrightness?.estimatedBortleRange?.rangeLabelZh ?? null,
    skyBrightnessDatasetYear: skyBrightness?.datasetYear ?? null,
    skyBrightnessDatasetVersion: skyBrightness?.datasetVersion ?? null,
  };

  if (!skyRange) {
    const fallbackRange = applyPublicRangeWidthPolicy({
      range: input.viirsPublicRange,
      maxWidthClasses:
        input.lowSampleSupport ||
        input.urbanSkyglowSpilloverRisk ||
        input.lowRadianceSaturationRisk ||
        input.calibrationEvidenceLevel !== "supported"
          ? 3
          : 2,
    });
    return {
      publicRange: fallbackRange,
      primaryBaseline: "viirs_national_fallback",
      conservative:
        unsupported ||
        fallbackRange.minClass !== input.viirsPublicRange.minClass ||
        fallbackRange.maxClass !== input.viirsPublicRange.maxClass,
      skyBrightnessConflictRisk: false,
      ...base,
    };
  }

  const viirsRange = input.viirsPublicRange;
  const conflictDistance = rangeDistance(viirsRange, skyRange);
  const conflictRisk = conflictDistance > 1;
  const waSupportsVeryDark = skyRange.maxClass <= 2;
  const strongDarkEvidence =
    waSupportsVeryDark &&
    input.stableNationalDarkEvidence &&
    !input.lowSampleSupport &&
    !input.urbanSkyglowSpilloverRisk &&
    !input.lowRadianceSaturationRisk &&
    input.calibrationEvidenceLevel === "supported";

  let publicRange = {
    minClass: Math.max(skyRange.minClass, Math.min(viirsRange.minClass, skyRange.minClass + 1)),
    maxClass: Math.max(skyRange.maxClass, viirsRange.maxClass),
  };

  if (waSupportsVeryDark) {
    publicRange = strongDarkEvidence ? { minClass: 1, maxClass: 2 } : { minClass: 2, maxClass: 3 };
  }

  if (input.urbanSkyglowSpilloverRisk || input.lowRadianceSaturationRisk || conflictRisk) {
    publicRange = {
      minClass: Math.max(2, publicRange.minClass),
      maxClass: clampBortleClass(Math.max(publicRange.maxClass, publicRange.minClass + 1)),
    };
  }

  if (input.nationalRiskIndex !== null) {
    const riskRange = rangeFromNationalRiskIndex(input.nationalRiskIndex);
    publicRange = {
      minClass: Math.max(publicRange.minClass, Math.min(riskRange.minClass, publicRange.minClass + 1)),
      maxClass: Math.max(publicRange.maxClass, riskRange.maxClass),
    };
  }

  const normalizedPublicRange = applyPublicRangeWidthPolicy({
    range: publicRange,
    anchorRange: skyRange,
    maxWidthClasses:
      conflictRisk ||
      input.lowSampleSupport ||
      input.urbanSkyglowSpilloverRisk ||
      input.lowRadianceSaturationRisk
        ? 3
        : 2,
  });
  const conservative =
    normalizedPublicRange.minClass !== skyRange.minClass ||
    normalizedPublicRange.maxClass !== skyRange.maxClass ||
    conflictRisk ||
    input.lowSampleSupport ||
    input.urbanSkyglowSpilloverRisk ||
    input.lowRadianceSaturationRisk;

  return {
    publicRange: normalizedPublicRange,
    primaryBaseline: "wa_model",
    conservative,
    skyBrightnessConflictRisk: conflictRisk,
    ...base,
  };
}

function resolvePublicBortleRange(input: {
  readonly rawEstimate: EstimatedBortleRange;
  readonly nationalRiskIndex: number | null;
  readonly stableNationalDarkEvidence: boolean;
  readonly lowEndRawRange: boolean;
  readonly lowSampleSupport: boolean;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly lowRadianceSaturationRisk: boolean;
  readonly calibrationEvidenceLevel: NationalSkyDarknessModelResult["calibrationEvidenceLevel"];
}): { readonly minClass: number; readonly maxClass: number } {
  const rawMin = clampBortleClass(input.rawEstimate.minClass ?? input.rawEstimate.maxClass ?? 9);
  const rawMax = clampBortleClass(input.rawEstimate.maxClass ?? rawMin);
  if (rawMin <= 1) {
    return input.stableNationalDarkEvidence
      ? { minClass: 1, maxClass: 2 }
      : { minClass: 2, maxClass: 4 };
  }
  if (
    rawMin <= 2 &&
    rawMax <= 3 &&
    (input.calibrationEvidenceLevel !== "supported" ||
      input.lowSampleSupport ||
      input.urbanSkyglowSpilloverRisk ||
      input.lowRadianceSaturationRisk)
  ) {
    return { minClass: 2, maxClass: 4 };
  }
  const riskRange =
    input.nationalRiskIndex === null
      ? { minClass: rawMin, maxClass: clampBortleClass(rawMax + 1) }
      : rangeFromNationalRiskIndex(input.nationalRiskIndex);
  const minClass = Math.max(rawMin, Math.min(riskRange.minClass, rawMin + 1));
  const maxClass = Math.max(rawMax, riskRange.maxClass);
  return {
    minClass,
    maxClass: Math.max(minClass, clampBortleClass(maxClass)),
  };
}

function resolveNationalRiskIndex(input: {
  readonly ambientRiskIndex: number | undefined;
  readonly localRadianceQuantile: number | null;
  readonly haloRadianceQuantile: number | null;
  readonly ambientRiskQuantile: number | null;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly lowSampleSupport: boolean;
}): number | null {
  const candidates = [
    input.ambientRiskIndex,
    input.localRadianceQuantile,
    input.haloRadianceQuantile,
    input.ambientRiskQuantile,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (candidates.length === 0) {
    return null;
  }
  const base = Math.max(...candidates);
  const penalty =
    (input.urbanSkyglowSpilloverRisk ? 12 : 0) + (input.lowSampleSupport ? 8 : 0);
  return clampPercent(base + penalty);
}

function rangeFromNationalRiskIndex(index: number): { readonly minClass: number; readonly maxClass: number } {
  if (index <= 12) {
    return { minClass: 1, maxClass: 2 };
  }
  if (index <= 24) {
    return { minClass: 2, maxClass: 3 };
  }
  if (index <= 38) {
    return { minClass: 3, maxClass: 4 };
  }
  if (index <= 52) {
    return { minClass: 4, maxClass: 5 };
  }
  if (index <= 66) {
    return { minClass: 5, maxClass: 6 };
  }
  if (index <= 80) {
    return { minClass: 6, maxClass: 7 };
  }
  if (index <= 92) {
    return { minClass: 7, maxClass: 8 };
  }
  return { minClass: 8, maxClass: 9 };
}

function resolveDiagnostics(input: {
  readonly calibrationEvidenceLevel: NationalSkyDarknessModelResult["calibrationEvidenceLevel"];
  readonly lowSampleSupport: boolean;
  readonly strongSampleSupport: boolean;
  readonly lowRadianceSaturationRisk: boolean;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly darkZoneSaturationRisk: boolean;
  readonly directionalCoverageComplete: boolean;
  readonly targetDirectionResolved: boolean;
  readonly stableNationalDarkEvidence: boolean;
  readonly lowEndRawRange: boolean;
  readonly skyBrightnessAvailable: boolean;
  readonly skyBrightnessConflictRisk: boolean;
  readonly skyBrightnessUnsupported: boolean;
  readonly rangeWidthPolicy: NationalSkyDarknessModelResult["rangeWidthPolicy"];
  readonly extraDiagnostics?: readonly string[];
}): readonly string[] {
  const diagnostics = [
    ...(input.extraDiagnostics ?? []),
    input.skyBrightnessAvailable ? "wa_model_baseline_available" : "wa_model_baseline_unavailable",
    input.skyBrightnessUnsupported ? "wa_value_type_unsupported" : "",
    input.skyBrightnessConflictRisk ? "wa_viirs_conflict_range_widened" : "",
    input.rangeWidthPolicy === "wide_uncertain" ? "public_range_wide_uncertain" : "",
    input.rangeWidthPolicy === "too_wide" ? "public_range_too_wide" : "",
    input.calibrationEvidenceLevel === "supported" ? "" : "calibration_evidence_not_supported",
    input.lowSampleSupport ? "low_sample_support" : "",
    input.strongSampleSupport ? "" : "strong_sample_support_missing",
    input.lowRadianceSaturationRisk ? "low_radiance_saturation_risk" : "",
    input.urbanSkyglowSpilloverRisk ? "urban_skyglow_spillover_risk" : "",
    input.darkZoneSaturationRisk ? "dark_zone_saturation_band" : "",
    input.directionalCoverageComplete ? "" : "directional_coverage_incomplete",
    input.targetDirectionResolved ? "" : "target_direction_unresolved",
    input.lowEndRawRange && !input.stableNationalDarkEvidence ? "low_end_public_range_widened" : "",
  ].filter(Boolean);
  return [...new Set(diagnostics)];
}

function diagnosticReasonZh(diagnostic: string): string {
  switch (diagnostic) {
    case "wa_model_baseline_available":
      return "WA/模型天空亮度已作为公开暗空基线输入";
    case "wa_model_baseline_unavailable":
      return "WA/模型天空亮度不可用，公开结果回退到全国 VIIRS 保守模型";
    case "wa_value_type_unsupported":
      return "WA/模型天空亮度数值类型不支持，仅保留原始诊断";
    case "wa_viirs_conflict_range_widened":
      return "WA/模型天空亮度与 VIIRS 信号存在差异，公开范围已放宽";
    case "viirs_estimate_unavailable":
      return "\u0056\u0049\u0049\u0052\u0053 \u539f\u59cb\u4f30\u7b97\u4e0d\u53ef\u7528\uff0c\u4ec5\u4ee5 WA/\u6a21\u578b\u57fa\u7ebf\u4f5c\u4f4e\u7f6e\u4fe1\u5ea6\u53c2\u8003";
    case "public_range_wide_uncertain":
      return "\u516c\u5f00\u6ce2\u7279\u5c14\u8303\u56f4\u56e0\u4e0d\u786e\u5b9a\u6027\u653e\u5bbd";
    case "public_range_too_wide":
      return "\u516c\u5f00\u6ce2\u7279\u5c14\u8303\u56f4\u8fc7\u5bbd\uff0c\u9700\u8981\u73b0\u573a\u786e\u8ba4";
    case "calibration_evidence_not_supported":
      return "当前校准证据不足以支撑更窄的公开暗空等级";
    case "low_sample_support":
      return "有效采样或采样覆盖不足";
    case "strong_sample_support_missing":
      return "尚未达到强暗空展示所需的采样置信度";
    case "low_radiance_saturation_risk":
      return "低辐亮度处于卫星夜光低端饱和风险带";
    case "urban_skyglow_spillover_risk":
      return "周边光穹可能拖累本地暗空";
    case "dark_zone_saturation_band":
      return "暗区信号处于低端饱和带，需避免假精度";
    case "directional_coverage_incomplete":
      return "方向光污染覆盖不完整";
    case "target_direction_unresolved":
      return "目标拍摄方向光害未解析";
    case "low_end_public_range_widened":
      return "低端波特尔范围已按全国模型放宽";
    default:
      return diagnostic;
  }
}

function resolveCalibrationEvidenceLevel(
  lightPollution: LightPollutionInfo,
): NationalSkyDarknessModelResult["calibrationEvidenceLevel"] {
  const basisVersion = lightPollution.calculationBasis?.samplingConfigVersion.toLowerCase() ?? "";
  if (
    basisVersion.includes("calibrated") ||
    basisVersion.includes("calibration-supported") ||
    basisVersion.includes("field-validated")
  ) {
    return "supported";
  }
  if (lightPollution.calculationBasis && lightPollution.validSampleCount >= 48) {
    return "limited";
  }
  return "insufficient";
}

function hasCompleteDirectionalCoverage(lightPollution: LightPollutionInfo): boolean {
  return (
    lightPollution.directionalRisk.length >= 8 &&
    lightPollution.directionalRisk.every(
      (direction) =>
        typeof direction.riskIndex === "number" &&
        Number.isFinite(direction.riskIndex) &&
        direction.riskLevel !== "insufficient" &&
        direction.validSampleCount > 0,
    )
  );
}

function buildNationalBasisZhV2(input: {
  readonly rawEstimate: EstimatedBortleRange;
  readonly config: NationalSkyDarknessModelConfig;
  readonly calibrationEvidenceLevel: NationalSkyDarknessModelResult["calibrationEvidenceLevel"];
  readonly nationalRiskIndex: number | null;
  readonly localRadianceQuantile: number | null;
  readonly haloRadianceQuantile: number | null;
  readonly ambientRiskQuantile: number | null;
  readonly diagnostics: readonly string[];
  readonly haloToLocalRatio: number | null;
  readonly fusion: SkyBrightnessViirsFusionResult;
}): string {
  const quantileText = [
    `local q=${formatNullablePercent(input.localRadianceQuantile)}`,
    `halo q=${formatNullablePercent(input.haloRadianceQuantile)}`,
    `ambient q=${formatNullablePercent(input.ambientRiskQuantile)}`,
  ].join("; ");
  const ratioText =
    input.haloToLocalRatio === null
      ? "halo/local=n/a"
      : input.haloToLocalRatio === Number.POSITIVE_INFINITY
        ? "halo/local=infinity"
        : `halo/local=${input.haloToLocalRatio}`;
  const fusionText =
    input.fusion.primaryBaseline === "wa_model"
      ? `WA/model baseline=${input.fusion.skyBrightnessEstimatedBortleLabel ?? "available"}`
      : "WA/model baseline unavailable; using national VIIRS fallback";
  const diagnosticText =
    input.diagnostics.length > 0 ? input.diagnostics.join(", ") : "none";
  return [
    `National sky-darkness model ${input.config.version}.`,
    `Public baseline: ${fusionText}.`,
    `Raw VIIRS estimate: ${input.rawEstimate.rangeLabelZh}.`,
    `Calibration evidence: ${input.calibrationEvidenceLevel}.`,
    `Quantiles: ${quantileText}.`,
    `Ratios: ${ratioText}.`,
    `nationalRisk=${formatNullablePercent(input.nationalRiskIndex)}.`,
    `Diagnostics: ${diagnosticText}.`,
    "Modeled values are raster-derived estimates, not field measurements or validated classifications.",
  ].join(" ");
}



function publicSkyQualityLabel(
  minClass: number,
  maxClass: number,
  conservative: boolean,
  confidence: EstimatedBortleRange["confidence"],
  rangeWidthPolicy: NationalSkyDarknessModelResult["rangeWidthPolicy"],
): string {
  const width = rangeClassWidth({ minClass, maxClass });
  if (rangeWidthPolicy === "too_wide") {
    return "\u9700\u73b0\u573a\u786e\u8ba4";
  }
  if (width >= 3 && (conservative || confidence === "low")) {
    if (maxClass <= 4) {
      return "\u5c1a\u6697\uff0c\u9700\u73b0\u573a\u786e\u8ba4";
    }
    if (minClass >= 5) {
      return "\u504f\u5f3a\uff0c\u9700\u73b0\u573a\u786e\u8ba4";
    }
    return "\u4fdd\u5b88\u53c2\u8003\uff0c\u9700\u73b0\u573a\u786e\u8ba4";
  }
  if (maxClass <= 2) {
    return conservative
      ? "\u6781\u6697\uff0c\u4ecd\u9700\u73b0\u573a\u786e\u8ba4"
      : "\u6781\u6697";
  }
  if (maxClass <= 3) {
    return conservative
      ? "\u8f83\u4f4e\uff0c\u4fdd\u5b88\u53c2\u8003"
      : "\u8f83\u4f4e\u5149\u6c61\u67d3";
  }
  if (maxClass <= 4) {
    return "\u5c1a\u6697\uff0c\u9700\u73b0\u573a\u786e\u8ba4";
  }
  if (maxClass <= 5) {
    return "\u4e2d\u7b49\u5149\u6c61\u67d3";
  }
  if (maxClass <= 6 && minClass <= 4) {
    return "\u4e2d\u7b49\uff0c\u53d7\u5468\u8fb9\u5149\u5bb3\u5f71\u54cd";
  }
  if (minClass >= 7) {
    return "\u5f88\u5f3a\u5149\u6c61\u67d3";
  }
  return "\u5149\u6c61\u67d3\u504f\u5f3a";
}

function formatBortleRange(minClass: number, maxClass: number, conservative: boolean): string {
  return `${minClass}\u2013${maxClass}\u7ea7${conservative ? "\uff08\u4fdd\u5b88\u53c2\u8003\uff09" : ""}`;
}

function resolvePublicConfidence(input: {
  readonly rawEstimate: EstimatedBortleRange;
  readonly conservative: boolean;
  readonly rangeWidthPolicy: NationalSkyDarknessModelResult["rangeWidthPolicy"];
  readonly lowSampleSupport: boolean;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly lowRadianceSaturationRisk: boolean;
  readonly skyBrightnessConflictRisk: boolean;
  readonly skyBrightnessAvailable: boolean;
}): EstimatedBortleRange["confidence"] {
  if (
    input.rangeWidthPolicy === "too_wide" ||
    input.lowSampleSupport ||
    input.urbanSkyglowSpilloverRisk ||
    input.lowRadianceSaturationRisk ||
    input.skyBrightnessConflictRisk
  ) {
    return "low";
  }
  if (input.skyBrightnessAvailable && !input.conservative) {
    return input.rawEstimate.confidence;
  }
  return input.conservative ? "low" : input.rawEstimate.confidence;
}

function quantilePosition(value: number, quantiles: NationalSkyDarknessQuantiles): number | null {
  const points = Object.entries(quantiles)
    .map(([key, pointValue]) => ({
      percentile: Number(key.slice(1)),
      value: pointValue,
    }))
    .filter(
      (point): point is { readonly percentile: number; readonly value: number } =>
        Number.isFinite(point.percentile) &&
        typeof point.value === "number" &&
        Number.isFinite(point.value),
    )
    .sort((left, right) => left.percentile - right.percentile);
  if (points.length === 0) {
    return null;
  }
  if (value <= points[0]!.value) {
    return points[0]!.percentile;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index]!;
    const right = points[index + 1]!;
    if (value <= right.value) {
      const span = right.value - left.value;
      const ratio = span <= 0 ? 0 : (value - left.value) / span;
      return roundRatio(left.percentile + ratio * (right.percentile - left.percentile));
    }
  }
  return points[points.length - 1]!.percentile;
}

function clampBortleClass(value: number): number {
  return Math.min(9, Math.max(1, Math.round(value)));
}

function normalizedSkyBrightnessRange(
  skyBrightness: SkyBrightnessInfo | null | undefined,
): { readonly minClass: number; readonly maxClass: number } | null {
  if (!skyBrightness?.available || !skyBrightness.dataAvailable) {
    return null;
  }
  const estimate = skyBrightness.estimatedBortleRange;
  if (!estimate?.available) {
    return null;
  }
  if (
    typeof estimate.minClass !== "number" ||
    typeof estimate.maxClass !== "number" ||
    !Number.isFinite(estimate.minClass) ||
    !Number.isFinite(estimate.maxClass)
  ) {
    return null;
  }
  return normalizeRange(estimate.minClass, estimate.maxClass);
}

function normalizeRange(
  minClass: number,
  maxClass: number,
): { readonly minClass: number; readonly maxClass: number } {
  const min = clampBortleClass(Math.min(minClass, maxClass));
  const max = clampBortleClass(Math.max(minClass, maxClass));
  return { minClass: min, maxClass: Math.max(min, max) };
}

function applyPublicRangeWidthPolicy(input: {
  readonly range: { readonly minClass: number; readonly maxClass: number };
  readonly anchorRange?: { readonly minClass: number; readonly maxClass: number } | null;
  readonly maxWidthClasses: 2 | 3;
}): { readonly minClass: number; readonly maxClass: number } {
  const normalized = normalizeRange(input.range.minClass, input.range.maxClass);
  if (rangeClassWidth(normalized) <= input.maxWidthClasses) {
    return normalized;
  }

  if (input.anchorRange) {
    const anchor = normalizeRange(input.anchorRange.minClass, input.anchorRange.maxClass);
    const minClass = Math.max(
      normalized.minClass,
      Math.min(anchor.minClass, normalized.maxClass),
    );
    return normalizeRange(minClass, Math.min(normalized.maxClass, minClass + input.maxWidthClasses - 1));
  }

  return normalizeRange(
    normalized.minClass,
    Math.min(normalized.maxClass, normalized.minClass + input.maxWidthClasses - 1),
  );
}

function rangeClassWidth(range: { readonly minClass?: number; readonly maxClass?: number }): number {
  if (typeof range.minClass !== "number" || typeof range.maxClass !== "number") {
    return 0;
  }
  return Math.max(1, clampBortleClass(range.maxClass) - clampBortleClass(range.minClass) + 1);
}

function classifyRangeWidthPolicy(
  range: { readonly minClass?: number; readonly maxClass?: number },
): NationalSkyDarknessModelResult["rangeWidthPolicy"] {
  const width = rangeClassWidth(range);
  if (width === 0) {
    return "unavailable";
  }
  if (width === 1) {
    return "narrow";
  }
  if (width === 2) {
    return "normal";
  }
  if (width === 3) {
    return "wide_uncertain";
  }
  return "too_wide";
}

function rangeDistance(
  left: { readonly minClass: number; readonly maxClass: number },
  right: { readonly minClass: number; readonly maxClass: number },
): number {
  if (left.maxClass < right.minClass) {
    return right.minClass - left.maxClass;
  }
  if (right.maxClass < left.minClass) {
    return left.minClass - right.maxClass;
  }
  return 0;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, roundRatio(value)));
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  return Math.round(value * 100) / 100;
}

function formatNullablePercent(value: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? `${roundRatio(value)}` : "n/a";
}
