import type { EstimatedBortleRange, LightPollutionInfo } from "./types.js";

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
  readonly basisZh: string;
};

export const defaultNationalSkyDarknessModelConfig: NationalSkyDarknessModelConfig = {
  version: "china-national-sky-darkness-v1",
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
  const conservative =
    publicRange.minClass !== rawEstimate.minClass ||
    publicRange.maxClass !== rawEstimate.maxClass ||
    calibrationEvidenceLevel !== "supported" ||
    lowSampleSupport ||
    urbanSkyglowSpilloverRisk ||
    lowRadianceSaturationRisk ||
    darkZoneSaturationRisk;
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
  });

  return {
    available: true,
    minClass: publicRange.minClass,
    maxClass: publicRange.maxClass,
    rangeLabelZh: formatBortleRange(publicRange.minClass, publicRange.maxClass, conservative),
    skyQualityLabelZh: publicSkyQualityLabel(publicRange.minClass, publicRange.maxClass, conservative),
    confidence: conservative ? "low" : rawEstimate.confidence,
    modelVersion: config.version,
    statisticsVersion: config.statisticsVersion,
    statisticsSource: config.statisticsSource,
    conservative,
    calibrationEvidenceLevel,
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
    basisZh: buildNationalBasisZh({
      rawEstimate,
      config,
      calibrationEvidenceLevel,
      nationalRiskIndex,
      localRadianceQuantile,
      haloRadianceQuantile,
      ambientRiskQuantile,
      diagnostics,
      haloToLocalRatio,
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
    basisZh: rawEstimate.basisZh,
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
}): readonly string[] {
  const diagnostics = [
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

function buildNationalBasisZh(input: {
  readonly rawEstimate: EstimatedBortleRange;
  readonly config: NationalSkyDarknessModelConfig;
  readonly calibrationEvidenceLevel: NationalSkyDarknessModelResult["calibrationEvidenceLevel"];
  readonly nationalRiskIndex: number | null;
  readonly localRadianceQuantile: number | null;
  readonly haloRadianceQuantile: number | null;
  readonly ambientRiskQuantile: number | null;
  readonly diagnostics: readonly string[];
  readonly haloToLocalRatio: number | null;
}): string {
  const evidence =
    input.calibrationEvidenceLevel === "supported"
      ? "校准证据充足"
      : input.calibrationEvidenceLevel === "limited"
        ? "校准证据有限"
        : "校准证据不足";
  const quantileText = [
    `local q=${formatNullablePercent(input.localRadianceQuantile)}`,
    `halo q=${formatNullablePercent(input.haloRadianceQuantile)}`,
    `ambient q=${formatNullablePercent(input.ambientRiskQuantile)}`,
  ].join("，");
  const ratioText =
    input.haloToLocalRatio === null
      ? "halo/local 不可用"
      : input.haloToLocalRatio === Number.POSITIVE_INFINITY
        ? "halo/local 为无限大"
        : `halo/local=${input.haloToLocalRatio}`;
  const diagnosticText =
    input.diagnostics.length > 0
      ? `诊断：${input.diagnostics.join(", ")}`
      : "诊断：未触发额外放宽";
  return `全国暗空模型 ${input.config.version} 基于原始 VIIRS 估算 ${input.rawEstimate.rangeLabelZh}，叠加全国辐亮度/光穹分布、采样置信度与比例风险；${evidence}，${quantileText}，${ratioText}，nationalRisk=${formatNullablePercent(
    input.nationalRiskIndex,
  )}。${diagnosticText}。`;
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

function publicSkyQualityLabel(minClass: number, maxClass: number, conservative: boolean): string {
  if (maxClass <= 2) {
    return conservative ? "深暗，仍需现场确认" : "深暗天空";
  }
  if (maxClass <= 3) {
    return conservative ? "较低，保守参考" : "较低光污染";
  }
  if (maxClass <= 4) {
    return "尚暗，需现场确认";
  }
  if (maxClass <= 5) {
    return "中等光污染";
  }
  if (minClass >= 7) {
    return "强光污染";
  }
  return "光污染偏强";
}

function formatBortleRange(minClass: number, maxClass: number, conservative: boolean): string {
  return `${minClass}–${maxClass}级${conservative ? "（保守参考）" : ""}`;
}

function clampBortleClass(value: number): number {
  return Math.min(9, Math.max(1, Math.round(value)));
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, roundRatio(value)));
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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
