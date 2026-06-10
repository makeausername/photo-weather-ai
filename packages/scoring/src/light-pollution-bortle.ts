import type { EstimatedBortleRange, LightPollutionInfo } from "@photo-weather/shared";

export const estimatedBortleMethodVersion = "viirs-ambient-risk-range-v1" as const;
export const estimatedBortleDisclaimerZh =
  "基于卫星夜间灯光与环境光污染指数估算，非现场 SQM 实测，不代表正式波特尔观测认证。";
export const estimatedBortleUnavailableLabelZh = "波特尔估算暂不可用";
export const estimatedBortleUnavailableBasisZh =
  "当前缺少可靠的环境光污染标定，不能推断波特尔等级范围。";

type BortleRiskBand = {
  readonly maxRiskIndex: number;
  readonly minClass: number;
  readonly maxClass: number;
  readonly skyQualityLabelZh: string;
};

// V1 intentionally maps only the calibrated ambient light-pollution risk index.
// It does not use raw radiance thresholds or target-direction risk.
const bortleRiskBands: readonly BortleRiskBand[] = [
  { maxRiskIndex: 14, minClass: 1, maxClass: 2, skyQualityLabelZh: "极佳暗空" },
  { maxRiskIndex: 29, minClass: 2, maxClass: 3, skyQualityLabelZh: "优良暗空" },
  { maxRiskIndex: 44, minClass: 3, maxClass: 4, skyQualityLabelZh: "较暗天空" },
  { maxRiskIndex: 59, minClass: 4, maxClass: 5, skyQualityLabelZh: "城郊过渡" },
  { maxRiskIndex: 72, minClass: 5, maxClass: 6, skyQualityLabelZh: "城郊光害" },
  { maxRiskIndex: 84, minClass: 6, maxClass: 7, skyQualityLabelZh: "明显光害" },
  { maxRiskIndex: 94, minClass: 7, maxClass: 8, skyQualityLabelZh: "城市光害" },
  { maxRiskIndex: 100, minClass: 8, maxClass: 9, skyQualityLabelZh: "强城市光害" },
];

export function estimateBortleRangeFromAmbientRiskIndex(
  ambientRiskIndex: number,
  options: {
    readonly confidence?: EstimatedBortleRange["confidence"];
    readonly basisZh?: string;
  } = {},
): EstimatedBortleRange {
  const clampedRiskIndex = clampAmbientRiskIndex(ambientRiskIndex);
  const band =
    bortleRiskBands.find((candidate) => clampedRiskIndex <= candidate.maxRiskIndex) ??
    bortleRiskBands[bortleRiskBands.length - 1]!;

  return {
    available: true,
    minClass: band.minClass,
    maxClass: band.maxClass,
    rangeLabelZh: `${band.minClass}–${band.maxClass}级`,
    skyQualityLabelZh: band.skyQualityLabelZh,
    confidence: options.confidence ?? "medium",
    methodVersion: estimatedBortleMethodVersion,
    basisZh:
      options.basisZh ??
      `使用环境光污染指数 ${formatAmbientRiskIndex(clampedRiskIndex)}/100 按 V1 区间映射。`,
    disclaimerZh: estimatedBortleDisclaimerZh,
  };
}

export function estimateBortleRangeForLightPollution(
  lightPollution: LightPollutionInfo,
): EstimatedBortleRange {
  const unavailableReason = unavailableReasonForBortleEstimate(lightPollution);
  if (unavailableReason) {
    return unavailableEstimatedBortleRange(unavailableReason);
  }

  const clampedRiskIndex = clampAmbientRiskIndex(lightPollution.ambientRiskIndex!);
  const confidence = completeLightPollutionResultForBortle(lightPollution) ? "medium" : "low";
  const datasetLabel = lightPollutionDatasetLabel(lightPollution);

  return estimateBortleRangeFromAmbientRiskIndex(clampedRiskIndex, {
    confidence,
    basisZh: `使用环境光污染指数 ${formatAmbientRiskIndex(
      clampedRiskIndex,
    )}/100 按 V1 区间映射；来源 ${datasetLabel}。未使用银河方向光害改变位置级估算。`,
  });
}

export function unavailableEstimatedBortleRange(
  unavailableReason = "calibration_unavailable",
): EstimatedBortleRange {
  return {
    available: false,
    rangeLabelZh: estimatedBortleUnavailableLabelZh,
    skyQualityLabelZh: "数据不足",
    confidence: "low",
    methodVersion: estimatedBortleMethodVersion,
    basisZh: estimatedBortleUnavailableBasisZh,
    disclaimerZh: estimatedBortleDisclaimerZh,
    unavailableReason,
  };
}

function unavailableReasonForBortleEstimate(
  lightPollution: LightPollutionInfo,
): string | undefined {
  if (!lightPollution.available || !lightPollution.dataAvailable) {
    return lightPollution.unavailableReason ?? "light_pollution_unavailable";
  }
  if (
    typeof lightPollution.ambientRiskIndex !== "number" ||
    !Number.isFinite(lightPollution.ambientRiskIndex)
  ) {
    return "ambient_risk_index_unavailable";
  }
  if (lightPollution.ambientRiskLevel === "insufficient") {
    return "ambient_risk_calibration_insufficient";
  }
  if (!hasRequiredSourceMetadata(lightPollution)) {
    return "source_metadata_missing";
  }
  return undefined;
}

function hasRequiredSourceMetadata(lightPollution: LightPollutionInfo): boolean {
  return (
    hasText(lightPollution.sourceLabel ?? lightPollution.sourceCode) &&
    typeof lightPollution.datasetYear === "number" &&
    Number.isFinite(lightPollution.datasetYear) &&
    hasText(lightPollution.datasetVersion) &&
    Boolean(lightPollution.calculationBasis)
  );
}

function completeLightPollutionResultForBortle(lightPollution: LightPollutionInfo): boolean {
  return (
    lightPollution.confidence !== "low" &&
    lightPollution.sampleCount > 0 &&
    lightPollution.validSampleCount > 0 &&
    lightPollution.directionalRisk.length >= 8 &&
    lightPollution.directionalRisk.every(
      (direction) =>
        typeof direction.riskIndex === "number" &&
        Number.isFinite(direction.riskIndex) &&
        direction.riskLevel !== "insufficient" &&
        direction.validSampleCount > 0,
    ) &&
    (typeof lightPollution.targetAzimuthDegrees !== "number" ||
      (typeof lightPollution.targetDirectionRisk === "number" &&
        Number.isFinite(lightPollution.targetDirectionRisk)))
  );
}

function lightPollutionDatasetLabel(lightPollution: LightPollutionInfo): string {
  return [
    lightPollution.sourceLabel ?? lightPollution.sourceCode ?? "卫星夜光参考",
    lightPollution.datasetYear ? `${lightPollution.datasetYear}` : undefined,
    lightPollution.datasetVersion ?? undefined,
  ]
    .filter((item): item is string => hasText(item))
    .join(" / ");
}

function clampAmbientRiskIndex(ambientRiskIndex: number): number {
  return Math.min(100, Math.max(0, ambientRiskIndex));
}

function formatAmbientRiskIndex(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
