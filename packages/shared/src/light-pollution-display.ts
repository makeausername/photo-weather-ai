import type { EstimatedBortleRange, LightPollutionInfo } from "./types.js";
import {
  defaultNationalSkyDarknessModelConfig,
  resolveNationalSkyDarknessModel,
  type NationalSkyDarknessModelResult,
} from "./national-sky-darkness-model.js";

export const publicSkyDarknessDisplayVersion = "china-national-sky-darkness-public-v1" as const;
export const publicSkyDarknessDisclaimerZh =
  "公开展示为卫星夜光和全国分布校准后的保守暗空估算，不代表现场实测或官方暗空认证。";

export type PublicSkyDarknessDisplay = {
  readonly available: boolean;
  readonly minClass?: number;
  readonly maxClass?: number;
  readonly rangeLabelZh: string;
  readonly skyQualityLabelZh: string;
  readonly confidence: EstimatedBortleRange["confidence"];
  readonly methodVersion: EstimatedBortleRange["methodVersion"];
  readonly publicMethodVersion: typeof publicSkyDarknessDisplayVersion;
  readonly nationalModelVersion: string;
  readonly nationalStatsVersion: string;
  readonly basisZh: string;
  readonly disclaimerZh: string;
  readonly unavailableReason?: string;
  readonly conservative: boolean;
  readonly calibrationEvidenceLevel: "insufficient" | "limited" | "supported";
  readonly rangeWidthClasses: number | null;
  readonly rangeWidthPolicy: "narrow" | "normal" | "wide_uncertain" | "too_wide" | "unavailable";
  readonly tooWideRange: boolean;
  readonly confidenceReasonsZh: readonly string[];
  readonly diagnostics: readonly string[];
  readonly rawRangeLabelZh: string;
  readonly rawSkyQualityLabelZh: string;
  readonly rawConfidence: EstimatedBortleRange["confidence"];
  readonly localToHaloRatio: number | null;
  readonly haloToLocalRatio: number | null;
  readonly positiveRadianceQuantile: number | null;
  readonly localRadianceQuantile: number | null;
  readonly haloRadianceQuantile: number | null;
  readonly ambientRiskQuantile: number | null;
  readonly localToHaloRatioQuantile: number | null;
  readonly haloToLocalRatioQuantile: number | null;
  readonly lowRadianceSaturationRisk: boolean;
  readonly urbanSkyglowSpilloverRisk: boolean;
  readonly darkZoneSaturationRisk: boolean;
  readonly nationalRiskIndex: number | null;
  readonly primaryBaseline: "wa_model" | "viirs_national_fallback";
  readonly skyBrightnessAvailable: boolean;
  readonly skyBrightnessEstimatedBortleMin: number | null;
  readonly skyBrightnessEstimatedBortleMax: number | null;
  readonly skyBrightnessEstimatedBortleLabel: string | null;
  readonly skyBrightnessDatasetYear: number | null;
  readonly skyBrightnessDatasetVersion: string | null;
  readonly skyBrightnessConflictRisk: boolean;
};

export function resolveNationalSkyDarknessDisplay(
  lightPollution: LightPollutionInfo,
): PublicSkyDarknessDisplay {
  const rawEstimate = lightPollution.estimatedBortleRange;
  if (!rawEstimate || !rawEstimate.available) {
    if (lightPollution.skyBrightness?.estimatedBortleRange?.available) {
      const unavailableRawEstimate = unavailableViirsEstimate(
        rawEstimate,
        rawEstimate?.unavailableReason ?? lightPollution.unavailableReason ?? "raw_estimate_unavailable",
      );
      const nationalModel = resolveNationalSkyDarknessModel(lightPollution, unavailableRawEstimate);
      return publicDisplayFromNationalModel(unavailableRawEstimate, nationalModel);
    }
    return unavailablePublicSkyDarknessDisplay(
      rawEstimate,
      rawEstimate?.unavailableReason ??
        lightPollution.unavailableReason ??
        "raw_estimate_unavailable",
    );
  }

  const nationalModel = resolveNationalSkyDarknessModel(lightPollution, rawEstimate);
  return publicDisplayFromNationalModel(rawEstimate, nationalModel);
}

export const resolvePublicSkyDarknessDisplay = resolveNationalSkyDarknessDisplay;
export const resolveConservativeBortleDisplayRange = resolveNationalSkyDarknessDisplay;
export const resolveLightPollutionPublicConfidence = resolveNationalSkyDarknessDisplay;
export const resolvePublicLightPollutionLabel = resolveNationalSkyDarknessDisplay;

function publicDisplayFromNationalModel(
  rawEstimate: EstimatedBortleRange,
  nationalModel: NationalSkyDarknessModelResult,
): PublicSkyDarknessDisplay {
  return {
    available: nationalModel.available,
    minClass: nationalModel.minClass,
    maxClass: nationalModel.maxClass,
    rangeLabelZh: nationalModel.rangeLabelZh,
    skyQualityLabelZh: nationalModel.skyQualityLabelZh,
    confidence: nationalModel.confidence,
    methodVersion: rawEstimate.methodVersion,
    publicMethodVersion: publicSkyDarknessDisplayVersion,
    nationalModelVersion: nationalModel.modelVersion,
    nationalStatsVersion: nationalModel.statisticsVersion,
    basisZh: nationalModel.basisZh,
    disclaimerZh: publicSkyDarknessDisclaimerZh,
    conservative: nationalModel.conservative,
    calibrationEvidenceLevel: nationalModel.calibrationEvidenceLevel,
    rangeWidthClasses: nationalModel.rangeWidthClasses,
    rangeWidthPolicy: nationalModel.rangeWidthPolicy,
    tooWideRange: nationalModel.tooWideRange,
    confidenceReasonsZh: nationalModel.confidenceReasonsZh,
    diagnostics: nationalModel.diagnostics,
    rawRangeLabelZh: rawEstimate.rangeLabelZh,
    rawSkyQualityLabelZh: rawEstimate.skyQualityLabelZh,
    rawConfidence: rawEstimate.confidence,
    localToHaloRatio: nationalModel.localToHaloRatio,
    haloToLocalRatio: nationalModel.haloToLocalRatio,
    positiveRadianceQuantile: nationalModel.positiveRadianceQuantile,
    localRadianceQuantile: nationalModel.localRadianceQuantile,
    haloRadianceQuantile: nationalModel.haloRadianceQuantile,
    ambientRiskQuantile: nationalModel.ambientRiskQuantile,
    localToHaloRatioQuantile: nationalModel.localToHaloRatioQuantile,
    haloToLocalRatioQuantile: nationalModel.haloToLocalRatioQuantile,
    lowRadianceSaturationRisk: nationalModel.lowRadianceSaturationRisk,
    urbanSkyglowSpilloverRisk: nationalModel.urbanSkyglowSpilloverRisk,
    darkZoneSaturationRisk: nationalModel.darkZoneSaturationRisk,
    nationalRiskIndex: nationalModel.nationalRiskIndex,
    primaryBaseline: nationalModel.primaryBaseline,
    skyBrightnessAvailable: nationalModel.skyBrightnessAvailable,
    skyBrightnessEstimatedBortleMin: nationalModel.skyBrightnessEstimatedBortleMin,
    skyBrightnessEstimatedBortleMax: nationalModel.skyBrightnessEstimatedBortleMax,
    skyBrightnessEstimatedBortleLabel: nationalModel.skyBrightnessEstimatedBortleLabel,
    skyBrightnessDatasetYear: nationalModel.skyBrightnessDatasetYear,
    skyBrightnessDatasetVersion: nationalModel.skyBrightnessDatasetVersion,
    skyBrightnessConflictRisk: nationalModel.skyBrightnessConflictRisk,
  };
}

function unavailableViirsEstimate(
  rawEstimate: EstimatedBortleRange | undefined,
  unavailableReason: string,
): EstimatedBortleRange {
  return {
    available: false,
    rangeLabelZh: rawEstimate?.rangeLabelZh ?? "VIIRS unavailable",
    skyQualityLabelZh: rawEstimate?.skyQualityLabelZh ?? "VIIRS unavailable",
    confidence: "low",
    methodVersion: rawEstimate?.methodVersion ?? "viirs-ambient-risk-range-v1",
    basisZh:
      rawEstimate?.basisZh ??
      "Raw VIIRS Bortle estimate is unavailable; WA/model sky brightness may still provide a conservative modeled baseline.",
    disclaimerZh: rawEstimate?.disclaimerZh ?? publicSkyDarknessDisclaimerZh,
    unavailableReason,
  };
}

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
    nationalModelVersion: defaultNationalSkyDarknessModelConfig.version,
    nationalStatsVersion: defaultNationalSkyDarknessModelConfig.statisticsVersion,
    basisZh:
      rawEstimate?.basisZh ?? "当前缺少可公开展示的卫星夜光和全国分布校准输入，不能推断公开波特尔范围。",
    disclaimerZh: publicSkyDarknessDisclaimerZh,
    unavailableReason,
    conservative: true,
    calibrationEvidenceLevel: "insufficient",
    rangeWidthClasses: null,
    rangeWidthPolicy: "unavailable",
    tooWideRange: false,
    confidenceReasonsZh: ["原始波特尔估算不可用"],
    diagnostics: ["raw_estimate_unavailable"],
    rawRangeLabelZh: rawEstimate?.rangeLabelZh ?? "不可用",
    rawSkyQualityLabelZh: rawEstimate?.skyQualityLabelZh ?? "数据不足",
    rawConfidence: rawEstimate?.confidence ?? "low",
    localToHaloRatio: null,
    haloToLocalRatio: null,
    positiveRadianceQuantile: null,
    localRadianceQuantile: null,
    haloRadianceQuantile: null,
    ambientRiskQuantile: null,
    localToHaloRatioQuantile: null,
    haloToLocalRatioQuantile: null,
    lowRadianceSaturationRisk: true,
    urbanSkyglowSpilloverRisk: false,
    darkZoneSaturationRisk: false,
    nationalRiskIndex: null,
    primaryBaseline: "viirs_national_fallback",
    skyBrightnessAvailable: false,
    skyBrightnessEstimatedBortleMin: null,
    skyBrightnessEstimatedBortleMax: null,
    skyBrightnessEstimatedBortleLabel: null,
    skyBrightnessDatasetYear: null,
    skyBrightnessDatasetVersion: null,
    skyBrightnessConflictRisk: false,
  };
}
