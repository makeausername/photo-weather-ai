import type { EstimatedBortleRange, LightPollutionInfo } from "./types.js";

export const publicSkyDarknessDisplayVersion = "viirs-public-conservative-display-v1" as const;
export const publicSkyDarknessDisclaimerZh =
  "公开展示为卫星夜光保守估算，不代表现场实测或正式波特尔观测认证。";

export type PublicSkyDarknessDisplay = {
  readonly available: boolean;
  readonly minClass?: number;
  readonly maxClass?: number;
  readonly rangeLabelZh: string;
  readonly skyQualityLabelZh: string;
  readonly confidence: EstimatedBortleRange["confidence"];
  readonly methodVersion: EstimatedBortleRange["methodVersion"];
  readonly publicMethodVersion: typeof publicSkyDarknessDisplayVersion;
  readonly basisZh: string;
  readonly disclaimerZh: string;
  readonly unavailableReason?: string;
  readonly conservative: boolean;
  readonly calibrationEvidenceLevel: "insufficient" | "limited" | "supported";
  readonly confidenceReasonsZh: readonly string[];
  readonly rawRangeLabelZh: string;
  readonly rawSkyQualityLabelZh: string;
  readonly rawConfidence: EstimatedBortleRange["confidence"];
  readonly localToHaloRatio: number | null;
  readonly haloToLocalRatio: number | null;
};

type PublicDisplaySignals = {
  readonly sampleCoverageRatio: number | null;
  readonly directionalCoverageComplete: boolean;
  readonly targetDirectionResolved: boolean;
  readonly haloMismatch: boolean;
  readonly nearZeroLocalWithHalo: boolean;
  readonly ambientRiskSaturated: boolean;
  readonly lowConfidence: boolean;
  readonly lowSampleSupport: boolean;
  readonly calibrationEvidenceLevel: PublicSkyDarknessDisplay["calibrationEvidenceLevel"];
  readonly localToHaloRatio: number | null;
  readonly haloToLocalRatio: number | null;
};

export function resolvePublicSkyDarknessDisplay(
  lightPollution: LightPollutionInfo,
): PublicSkyDarknessDisplay {
  const rawEstimate = lightPollution.estimatedBortleRange;
  if (!rawEstimate || !rawEstimate.available) {
    return unavailablePublicSkyDarknessDisplay(
      rawEstimate,
      rawEstimate?.unavailableReason ?? lightPollution.unavailableReason ?? "raw_estimate_unavailable",
    );
  }

  const rawMin = clampBortleClass(rawEstimate.minClass ?? rawEstimate.maxClass ?? 9);
  const rawMax = clampBortleClass(rawEstimate.maxClass ?? rawMin);
  const signals = resolvePublicDisplaySignals(lightPollution, rawEstimate);
  const reasons = conservativeDisplayReasons(lightPollution, rawEstimate, signals);
  const shouldDowngradeDarkestRange =
    rawMin <= 1 &&
    (signals.calibrationEvidenceLevel !== "supported" ||
      signals.lowConfidence ||
      signals.lowSampleSupport ||
      !signals.directionalCoverageComplete ||
      signals.haloMismatch ||
      signals.nearZeroLocalWithHalo ||
      signals.ambientRiskSaturated);
  const shouldWidenRange =
    !shouldDowngradeDarkestRange &&
    (signals.lowConfidence ||
      signals.lowSampleSupport ||
      signals.haloMismatch ||
      signals.nearZeroLocalWithHalo ||
      signals.ambientRiskSaturated);

  const publicMin = shouldDowngradeDarkestRange ? 2 : rawMin;
  const publicMax = shouldDowngradeDarkestRange
    ? signals.haloMismatch || signals.nearZeroLocalWithHalo || signals.lowConfidence
      ? 4
      : 3
    : shouldWidenRange
      ? clampBortleClass(rawMax + 1)
      : rawMax;
  const normalizedMax = Math.max(publicMin, publicMax);
  const conservative =
    publicMin !== rawMin ||
    normalizedMax !== rawMax ||
    reasons.length > 0 ||
    rawEstimate.skyQualityLabelZh === "极佳暗空";

  return {
    available: true,
    minClass: publicMin,
    maxClass: normalizedMax,
    rangeLabelZh: `${publicMin}–${normalizedMax}级${conservative ? "（保守参考）" : ""}`,
    skyQualityLabelZh: publicSkyQualityLabel(publicMin, normalizedMax, conservative),
    confidence: conservative ? "low" : rawEstimate.confidence,
    methodVersion: rawEstimate.methodVersion,
    publicMethodVersion: publicSkyDarknessDisplayVersion,
    basisZh: publicSkyDarknessBasisZh(rawEstimate, reasons, signals),
    disclaimerZh: publicSkyDarknessDisclaimerZh,
    conservative,
    calibrationEvidenceLevel: signals.calibrationEvidenceLevel,
    confidenceReasonsZh: reasons,
    rawRangeLabelZh: rawEstimate.rangeLabelZh,
    rawSkyQualityLabelZh: rawEstimate.skyQualityLabelZh,
    rawConfidence: rawEstimate.confidence,
    localToHaloRatio: signals.localToHaloRatio,
    haloToLocalRatio: signals.haloToLocalRatio,
  };
}

export const resolveConservativeBortleDisplayRange = resolvePublicSkyDarknessDisplay;
export const resolveLightPollutionPublicConfidence = resolvePublicSkyDarknessDisplay;
export const resolvePublicLightPollutionLabel = resolvePublicSkyDarknessDisplay;

function unavailablePublicSkyDarknessDisplay(
  rawEstimate: EstimatedBortleRange | undefined,
  unavailableReason: string,
): PublicSkyDarknessDisplay {
  return {
    available: false,
    rangeLabelZh: rawEstimate?.rangeLabelZh ?? "波特尔公开估算暂不可用",
    skyQualityLabelZh: "数据不足",
    confidence: "low",
    methodVersion: rawEstimate?.methodVersion ?? "viirs-ambient-risk-range-v1",
    publicMethodVersion: publicSkyDarknessDisplayVersion,
    basisZh:
      rawEstimate?.basisZh ??
      "当前缺少可公开展示的卫星夜光保守估算输入，不能推断公开波特尔范围。",
    disclaimerZh: publicSkyDarknessDisclaimerZh,
    unavailableReason,
    conservative: true,
    calibrationEvidenceLevel: "insufficient",
    confidenceReasonsZh: ["原始波特尔估算不可用"],
    rawRangeLabelZh: rawEstimate?.rangeLabelZh ?? "不可用",
    rawSkyQualityLabelZh: rawEstimate?.skyQualityLabelZh ?? "数据不足",
    rawConfidence: rawEstimate?.confidence ?? "low",
    localToHaloRatio: null,
    haloToLocalRatio: null,
  };
}

function resolvePublicDisplaySignals(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
): PublicDisplaySignals {
  const sampleCoverageRatio =
    lightPollution.sampleCount > 0
      ? lightPollution.validSampleCount / lightPollution.sampleCount
      : null;
  const directionalCoverageComplete =
    lightPollution.directionalRisk.length >= 8 &&
    lightPollution.directionalRisk.every(
      (direction) =>
        typeof direction.riskIndex === "number" &&
        Number.isFinite(direction.riskIndex) &&
        direction.riskLevel !== "insufficient" &&
        direction.validSampleCount > 0,
    );
  const targetDirectionResolved =
    typeof lightPollution.targetAzimuthDegrees !== "number" ||
    (typeof lightPollution.targetDirectionRisk === "number" &&
      Number.isFinite(lightPollution.targetDirectionRisk));
  const localRadiance = finiteNumber(lightPollution.localRadiance);
  const haloRadiance = finiteNumber(lightPollution.surroundingHaloRadiance);
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
  const ambientRiskIndex = finiteNumber(lightPollution.ambientRiskIndex);

  return {
    sampleCoverageRatio,
    directionalCoverageComplete,
    targetDirectionResolved,
    haloMismatch:
      typeof haloToLocalRatio === "number" &&
      (haloToLocalRatio === Number.POSITIVE_INFINITY || haloToLocalRatio >= 8),
    nearZeroLocalWithHalo:
      localRadiance !== undefined &&
      localRadiance <= 0.001 &&
      haloRadiance !== undefined &&
      haloRadiance > 0.05,
    ambientRiskSaturated:
      rawEstimate.minClass !== undefined &&
      rawEstimate.minClass <= 1 &&
      ambientRiskIndex !== undefined &&
      ambientRiskIndex <= 3,
    lowConfidence: lightPollution.confidence === "low" || rawEstimate.confidence === "low",
    lowSampleSupport:
      lightPollution.validSampleCount < 48 ||
      sampleCoverageRatio === null ||
      sampleCoverageRatio < 0.75 ||
      !targetDirectionResolved,
    calibrationEvidenceLevel: resolveCalibrationEvidenceLevel(lightPollution),
    localToHaloRatio,
    haloToLocalRatio,
  };
}

function conservativeDisplayReasons(
  lightPollution: LightPollutionInfo,
  rawEstimate: EstimatedBortleRange,
  signals: PublicDisplaySignals,
): readonly string[] {
  const reasons: string[] = [];
  if (signals.calibrationEvidenceLevel !== "supported" && (rawEstimate.minClass ?? 9) <= 1) {
    reasons.push("缺少足够独立校准证据支撑公开展示 1–2 级");
  }
  if (signals.lowConfidence) {
    reasons.push("卫星夜光查询置信度不足");
  }
  if (signals.lowSampleSupport) {
    reasons.push("有效采样或目标方向信息不足");
  }
  if (!signals.directionalCoverageComplete) {
    reasons.push("方向扇区覆盖不完整");
  }
  if (signals.haloMismatch) {
    reasons.push("周边光穹相对本地辐亮度偏强");
  }
  if (signals.nearZeroLocalWithHalo) {
    reasons.push("本地低辐亮度与周边光穹存在不匹配");
  }
  if (signals.ambientRiskSaturated) {
    reasons.push("环境风险指数处于低端饱和区");
  }
  if (lightPollution.ambientRiskLevel === "insufficient") {
    reasons.push("环境光污染风险标定不足");
  }
  return [...new Set(reasons)];
}

function resolveCalibrationEvidenceLevel(
  lightPollution: LightPollutionInfo,
): PublicSkyDarknessDisplay["calibrationEvidenceLevel"] {
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

function publicSkyDarknessBasisZh(
  rawEstimate: EstimatedBortleRange,
  reasons: readonly string[],
  signals: PublicDisplaySignals,
): string {
  const supportText =
    signals.calibrationEvidenceLevel === "supported"
      ? "校准证据充足"
      : signals.calibrationEvidenceLevel === "limited"
        ? "校准证据有限"
        : "校准证据不足";
  const ratioText =
    signals.haloToLocalRatio === null
      ? "local/halo 比值不可用"
      : signals.haloToLocalRatio === Number.POSITIVE_INFINITY
        ? "halo/local 比值为无限大"
        : `halo/local=${signals.haloToLocalRatio}`;
  const reasonText =
    reasons.length > 0 ? `保守原因：${reasons.join("；")}。` : "未触发额外保守放宽。";

  return `公开展示基于原始 VIIRS 波特尔估算 ${rawEstimate.rangeLabelZh}，叠加采样、置信度、周边光穹与校准证据检查；${supportText}，${ratioText}。${reasonText}`;
}

function publicSkyQualityLabel(minClass: number, maxClass: number, conservative: boolean): string {
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

function clampBortleClass(value: number): number {
  return Math.min(9, Math.max(1, Math.round(value)));
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
