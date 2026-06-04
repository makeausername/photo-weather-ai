import type { CloudLayerCompletenessContext } from "./cloud-layer-completeness.js";
import type { CloudSeaCloudBasisConsistencyContext } from "./cloud-sea-cloud-basis-consistency.js";
import type { CloudSeaPrecipitationSignalContext } from "./cloud-sea-precipitation-signal.js";
import type { CloudSeaRecommendationGuardOutput } from "./cloud-sea-recommendation-guard.js";
import type { CloudSeaWeatherVariableConsistencyContext } from "./cloud-sea-weather-variable-consistency.js";
import type {
  CloudSeaConfidenceLevel,
  CloudSeaScoreBand,
  CloudSeaScoreCalibrationContext,
  CloudSeaWindowRainImpactLevel,
  CloudSeaWindowRiskContext,
  ForecastMultiSourceAgreementContext,
  ProfessionalHourlyCloudLayerBasis,
  TerrainMode,
  TerrainType,
} from "./types.js";

export type CloudSeaScoreCalibrationHourlyRow = {
  readonly time?: string | null;
  readonly cloudTotal?: number | null;
  readonly cloudTotalPercent?: number | null;
  readonly totalCloudPercent?: number | null;
  readonly cloudHigh?: number | null;
  readonly cloudHighPercent?: number | null;
  readonly highCloudPercent?: number | null;
  readonly cloudMid?: number | null;
  readonly cloudMidPercent?: number | null;
  readonly midCloudPercent?: number | null;
  readonly cloudLow?: number | null;
  readonly cloudLowPercent?: number | null;
  readonly lowCloudPercent?: number | null;
  readonly visibilityKm?: number | null;
  readonly visibilityMeters?: number | null;
  readonly relativeHumidityPercent?: number | null;
  readonly humidityPercent?: number | null;
  readonly humidity?: number | null;
  readonly dewPointSpreadC?: number | null;
  readonly dewPointSpread?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly rawTemperatureC?: number | null;
  readonly terrainAdjustedTemperatureC?: number | null;
  readonly displayedTemperatureC?: number | null;
  readonly bodyFeelTemperatureC?: number | null;
  readonly temperatureBasis?: string | null;
  readonly cloudLayerBasis?: ProfessionalHourlyCloudLayerBasis;
};

export type CloudSeaScoreCalibrationInput = {
  readonly formationScore?: number | null;
  readonly shootabilityScore?: number | null;
  readonly rawFormationScore: number;
  readonly rawShootabilityScore: number;
  readonly rawCloudSeaScore?: number | null;
  readonly whiteoutRiskScore: number;
  readonly confidenceScore?: number | null;
  readonly confidenceLevel?: CloudSeaConfidenceLevel | null;
  readonly cloudLayerCoverageContext?: CloudLayerCompletenessContext | null;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
  readonly precipitationSignalContext?: CloudSeaPrecipitationSignalContext | null;
  readonly weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext | null;
  readonly terrainContext?: {
    readonly score?: number | null;
    readonly terrainMode?: TerrainMode | string | null;
    readonly terrainType?: TerrainType | string | null;
    readonly confidence?: CloudSeaConfidenceLevel | string | null;
  } | null;
  readonly multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null;
  readonly bestWindow?: {
    readonly startTime?: string | null;
    readonly endTime?: string | null;
    readonly label?: string | null;
  } | null;
  readonly normalizedHourlyRows?: readonly CloudSeaScoreCalibrationHourlyRow[] | null;
  readonly cloudWindowRows?: readonly CloudSeaScoreCalibrationHourlyRow[] | null;
  readonly recommendationGuardContext?: CloudSeaRecommendationGuardOutput | null;
  readonly windowRiskContext?: CloudSeaWindowRiskContext | null;
};

type CloudLayerWindowStats = {
  readonly rowCount: number;
  readonly totalVeryHigh: boolean;
  readonly highVeryHigh: boolean;
  readonly midVeryHigh: boolean;
  readonly lowHigh: boolean;
  readonly lowWeak: boolean;
  readonly thickMultiLayerOvercast: boolean;
  readonly highCloudOnly: boolean;
  readonly midCloudOnly: boolean;
  readonly minVisibilityKm?: number;
  readonly averageVisibilityKm?: number;
};

export function buildCloudSeaScoreCalibrationContext(
  input: CloudSeaScoreCalibrationInput,
): CloudSeaScoreCalibrationContext {
  const rawFormationScore = clampScore(input.rawFormationScore);
  const rawShootabilityScore = clampScore(input.rawShootabilityScore);
  let calibratedFormationScore = clampScore(input.formationScore ?? rawFormationScore);
  let calibratedShootabilityScore = clampScore(input.shootabilityScore ?? rawShootabilityScore);
  const rows = preferredCalibrationRows(input);
  const layerStats = summarizeLayerRows(rows);
  const capReasons: string[] = [];
  const positiveFactorsZh: string[] = [];
  const negativeFactorsZh: string[] = [];
  let finalCap = 100;

  const applyCap = (limit: number, reasonZh: string) => {
    finalCap = Math.min(finalCap, limit);
    capReasons.push(reasonZh);
    negativeFactorsZh.push(reasonZh);
  };

  if (calibratedFormationScore >= 72) {
    positiveFactorsZh.push("低云、水汽和地形信号支持云海形成。");
  }
  if ((input.terrainContext?.score ?? 0) >= 75) {
    positiveFactorsZh.push("地形落差对云海形成较有利。");
  }
  if ((layerStats.averageVisibilityKm ?? 0) >= 8 && input.whiteoutRiskScore < 55) {
    positiveFactorsZh.push("能见度和白墙风险暂未形成强阻断。");
  }
  if (input.precipitationSignalContext?.precipitationSignalType === "none") {
    positiveFactorsZh.push("主窗口附近暂未见明显降水干扰。");
  }

  if (layerStats.highCloudOnly) {
    calibratedFormationScore = Math.min(calibratedFormationScore, 52);
    calibratedShootabilityScore = Math.min(calibratedShootabilityScore, 52);
    applyCap(58, "高云偏厚但低云证据不足，不能按强云海窗口处理。");
  }
  if (layerStats.midCloudOnly) {
    calibratedFormationScore = Math.min(calibratedFormationScore, 56);
    calibratedShootabilityScore = Math.min(calibratedShootabilityScore, 55);
    applyCap(60, "中云偏厚但低云证据不足，主要作为层云纹理参考。");
  }

  const strongOpeningEvidence = hasStrongOpeningEvidence(input, layerStats);
  const openingUncertain =
    !strongOpeningEvidence ||
    input.windowRiskContext?.windowOpeningConfidence !== "high" ||
    input.recommendationGuardContext?.shouldShowCaution === true ||
    input.weatherVariableConsistencyContext?.shouldAvoidStrongWording === true;

  if (input.windowRiskContext?.windowOpeningConfidence === "medium") {
    applyCap(86, "主窗口开口稳定性中等，最终分数上限 86。");
  }
  if (input.windowRiskContext?.windowOpeningConfidence === "low") {
    applyCap(75, "主窗口开口稳定性偏低，最终分数上限 75。");
  }

  if (layerStats.thickMultiLayerOvercast && openingUncertain) {
    applyCap(82, "厚实多层云覆盖下开口稳定性不足，最终分数不按近满分处理。");
  }
  if (layerStats.thickMultiLayerOvercast && precipitationCapsWindow(input, "light")) {
    applyCap(78, "厚云叠加降水扰动，主窗口可拍性下调。");
  }
  if (layerStats.thickMultiLayerOvercast && input.whiteoutRiskScore >= 58) {
    applyCap(72, "厚云叠加中高白墙风险，需复核云顶高度和现场能见度。");
  }
  if (layerStats.thickMultiLayerOvercast && isPoorVisibility(layerStats)) {
    applyCap(70, "厚云叠加低能见度，云海边界和开口不稳定。");
  }

  if (precipitationCapsWindow(input, "light")) {
    applyCap(85, "主窗口有短时降水扰动，降低可拍稳定性。");
  }
  if (precipitationCapsWindow(input, "meaningful")) {
    applyCap(75, "主窗口存在可计量降水，最终推荐需降级。");
  }
  if (precipitationCapsWindow(input, "strong")) {
    applyCap(64, "主窗口存在较强或持续降水，不支持强推荐。");
  }
  if (input.windowRiskContext?.duringWindowRainImpact.impactLevel === "medium") {
    applyCap(72, "主窗口受可计量降水影响，最终分数上限 72。");
  }
  if (input.windowRiskContext?.duringWindowRainImpact.impactLevel === "high") {
    applyCap(64, "主窗口受较强或持续降水影响，最终分数上限 64。");
  }

  if (input.whiteoutRiskScore >= 78) {
    applyCap(68, "低云或雾可能包顶形成白墙，云海可拍性受限。");
  } else if (input.whiteoutRiskScore >= 70) {
    applyCap(72, "白墙风险偏高，需复核低云高度和能见度。");
  } else if (input.whiteoutRiskScore >= 58) {
    applyCap(82, "白墙风险达到中等，不能仅凭形成信号强推。");
  }
  if (input.windowRiskContext?.whiteoutReviewLevel === "medium") {
    applyCap(78, "主窗口白墙风险中等，需复核云顶高度，可拍分数上限 78。");
  }
  if (input.windowRiskContext?.whiteoutReviewLevel === "high") {
    applyCap(70, "主窗口白墙风险偏高，云顶高度和能见度未确认前分数上限 70。");
  }

  if (isPoorVisibility(layerStats)) {
    applyCap(70, "能见度偏低，云海边界和远山层次需要现场复核。");
  } else if ((layerStats.minVisibilityKm ?? 99) < 6) {
    applyCap(78, "能见度一般，可拍窗口稳定性下调。");
  }

  if (input.cloudLayerCoverageContext?.layerCompletenessLevel === "weak") {
    applyCap(75, "低/中/高云分层覆盖偏弱，需复核。");
  }
  if (input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing") {
    applyCap(70, "云层分层缺失，不能给出强云海推荐。");
  }
  if (input.cloudBasisConsistencyContext?.cloudBasisLevel === "mixed_basis") {
    applyCap(78, "总云量与分层云量口径不一致，需复核。");
  }
  if (input.cloudBasisConsistencyContext?.cloudBasisLevel === "total_only") {
    applyCap(72, "仅有总云量，缺少低云分层，不足以强推云海。");
  }
  if (
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "partial_layers" &&
    input.cloudBasisConsistencyContext.shouldLowerCloudSeaConfidence
  ) {
    applyCap(75, "分层云量不完整，低云和白墙判断需复核。");
  }

  if (input.multiSourceAgreementContext?.shouldLowerConfidence) {
    applyCap(80, "多源低云或降水判断存在分歧，推荐强度下调。");
  }
  if (input.weatherVariableConsistencyContext?.consistencyLevel === "conflict") {
    applyCap(72, "关键天气变量存在冲突，最终分数按谨慎上限处理。");
  } else if (input.weatherVariableConsistencyContext?.shouldLowerConfidence) {
    applyCap(78, "关键天气变量置信度不足，最终分数下调。");
  }
  if (input.terrainContext?.confidence === "low" && calibratedFormationScore >= 65) {
    applyCap(80, "地形置信度偏低，形成信号需要现场复核。");
  }

  const majorUncertaintyCount = majorUncertaintyFlags(input, layerStats).length;
  if (majorUncertaintyCount >= 3) {
    applyCap(72, "多个主要不确定因素同时存在，最终分数按谨慎上限处理。");
  }
  if (input.windowRiskContext?.scoreCapReasons.some((reason) => reason.includes("多个中等不确定性"))) {
    applyCap(78, "多个中等不确定性叠加，最终分数上限 78。");
  }

  if (calibratedFormationScore < 55) {
    applyCap(Math.min(62, calibratedFormationScore + 8), "云海形成证据不足，不能由光线或高/中云抬高最终分数。");
  }

  const baseFinalScore = Math.min(
    calibratedShootabilityScore,
    clampScore(input.rawCloudSeaScore ?? calibratedShootabilityScore),
  );
  const finalCloudSeaScore = clampScore(Math.min(baseFinalScore, finalCap));
  calibratedShootabilityScore = Math.min(calibratedShootabilityScore, finalCloudSeaScore);
  const effectiveCapReasons = uniqueText(capReasons);
  const capApplied =
    finalCloudSeaScore < baseFinalScore ||
    effectiveCapReasons.length > 0 ||
    calibratedFormationScore < rawFormationScore ||
    calibratedShootabilityScore < rawShootabilityScore;
  const confidenceLevel = calibratedConfidenceLevel(input, layerStats, effectiveCapReasons);
  const shouldBlockStrongRecommendation =
    finalCloudSeaScore < 86 || confidenceLevel !== "high" || effectiveCapReasons.length > 0;
  const shouldDowngradeToBackup = finalCloudSeaScore < 55;
  const shouldDowngradeToCautious =
    !shouldDowngradeToBackup &&
    (finalCloudSeaScore < 70 || (calibratedFormationScore >= 70 && effectiveCapReasons.length > 0));
  const finalRecommendationLabel = finalRecommendationLabelForScore({
    score: finalCloudSeaScore,
    confidenceLevel,
    shouldBlockStrongRecommendation,
  });

  if (effectiveCapReasons.length === 0 && finalCloudSeaScore >= 86) {
    positiveFactorsZh.push("形成、开口、能见度和风险信号同时支持较高可拍性。");
  }

  return {
    rawFormationScore,
    rawShootabilityScore,
    calibratedFormationScore,
    calibratedShootabilityScore,
    finalCloudSeaScore,
    scoreBand: scoreBand(finalCloudSeaScore),
    confidenceLevel,
    capApplied,
    capReasons: effectiveCapReasons,
    positiveFactorsZh: uniqueText(positiveFactorsZh).slice(0, 5),
    negativeFactorsZh: uniqueText(negativeFactorsZh).slice(0, 6),
    scoreExplanationZh: buildScoreExplanation({
      rawFormationScore,
      rawShootabilityScore,
      calibratedFormationScore,
      calibratedShootabilityScore,
      finalCloudSeaScore,
      capReasons: effectiveCapReasons,
    }),
    recommendationExplanationZh: buildRecommendationExplanation({
      formationScore: calibratedFormationScore,
      finalCloudSeaScore,
      capReasons: effectiveCapReasons,
      shouldBlockStrongRecommendation,
    }),
    finalRecommendationLabel,
    shouldBlockStrongRecommendation,
    shouldDowngradeToCautious,
    shouldDowngradeToBackup,
    windowRiskContext: input.windowRiskContext ?? undefined,
  };
}

function preferredCalibrationRows(
  input: CloudSeaScoreCalibrationInput,
): readonly CloudSeaScoreCalibrationHourlyRow[] {
  if (input.cloudWindowRows && input.cloudWindowRows.length > 0) {
    return input.cloudWindowRows;
  }
  const rows = input.normalizedHourlyRows ?? [];
  const focused = rowsForWindow(rows, input.bestWindow);
  return focused.length > 0 ? focused : rows;
}

function rowsForWindow(
  rows: readonly CloudSeaScoreCalibrationHourlyRow[],
  window: CloudSeaScoreCalibrationInput["bestWindow"],
): readonly CloudSeaScoreCalibrationHourlyRow[] {
  if (!window?.startTime || !window.endTime) {
    return [];
  }
  const start = Date.parse(window.startTime);
  const end = Date.parse(window.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [];
  }
  return rows.filter((row) => {
    const time = Date.parse(row.time ?? "");
    return Number.isFinite(time) && time >= start && time <= end;
  });
}

function summarizeLayerRows(rows: readonly CloudSeaScoreCalibrationHourlyRow[]): CloudLayerWindowStats {
  const total = rows.map(totalCloudPercent).filter(isFiniteNumber);
  const high = rows.map(highCloudPercent).filter(isFiniteNumber);
  const mid = rows.map(midCloudPercent).filter(isFiniteNumber);
  const low = rows.map(lowCloudPercent).filter(isFiniteNumber);
  const visibility = rows.map(visibilityKm).filter(isFiniteNumber);
  const totalVeryHigh = ratioAtLeast(total, 90) >= 0.67;
  const highVeryHigh = ratioAtLeast(high, 80) >= 0.67;
  const midVeryHigh = ratioAtLeast(mid, 80) >= 0.67;
  const lowHigh = ratioAtLeast(low, 65) >= 0.5;
  const lowWeak = low.length > 0 && ratioBelow(low, 35) >= 0.67;

  return {
    rowCount: rows.length,
    totalVeryHigh,
    highVeryHigh,
    midVeryHigh,
    lowHigh,
    lowWeak,
    thickMultiLayerOvercast: totalVeryHigh && (highVeryHigh || midVeryHigh) && lowHigh,
    highCloudOnly: highVeryHigh && lowWeak,
    midCloudOnly: midVeryHigh && lowWeak,
    minVisibilityKm: visibility.length > 0 ? Math.min(...visibility) : undefined,
    averageVisibilityKm: average(visibility),
  };
}

function hasStrongOpeningEvidence(
  input: CloudSeaScoreCalibrationInput,
  layerStats: CloudLayerWindowStats,
): boolean {
  return (
    !layerStats.thickMultiLayerOvercast &&
    input.whiteoutRiskScore < 45 &&
    (layerStats.minVisibilityKm ?? 99) >= 8 &&
    !precipitationCapsWindow(input, "light") &&
    input.cloudLayerCoverageContext?.layerCompletenessLevel !== "weak" &&
    input.cloudLayerCoverageContext?.layerCompletenessLevel !== "missing" &&
    input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence !== true &&
    input.multiSourceAgreementContext?.shouldLowerConfidence !== true &&
    input.weatherVariableConsistencyContext?.shouldLowerConfidence !== true
  );
}

function precipitationCapsWindow(
  input: CloudSeaScoreCalibrationInput,
  level: "light" | "meaningful" | "strong",
): boolean {
  const duringImpact = input.windowRiskContext?.duringWindowRainImpact.impactLevel;
  if (duringImpact) {
    if (level === "strong") {
      return duringImpact === "high";
    }
    if (level === "meaningful") {
      return isRainImpactAtLeast(duringImpact, "medium");
    }
    return isRainImpactAtLeast(duringImpact, "trace");
  }
  const signal = input.precipitationSignalContext;
  if (!signal) {
    return false;
  }
  const nearWindow = signal.affectsMainWindow || signal.shouldDowngradeWindow;
  if (level === "strong") {
    return nearWindow && signal.precipitationSignalType === "sustained_rain";
  }
  if (level === "meaningful") {
    return nearWindow && signal.precipitationSignalType === "meaningful_rain";
  }
  return (
    nearWindow &&
    (signal.precipitationSignalType === "light_disturbance" ||
      signal.precipitationSignalType === "short_shower" ||
      signal.precipitationSignalType === "meaningful_rain" ||
      signal.precipitationSignalType === "sustained_rain")
  );
}

function isPoorVisibility(layerStats: CloudLayerWindowStats): boolean {
  return (layerStats.minVisibilityKm ?? 99) < 3;
}

function majorUncertaintyFlags(
  input: CloudSeaScoreCalibrationInput,
  layerStats: CloudLayerWindowStats,
): readonly string[] {
  const flags: string[] = [];
  if (layerStats.thickMultiLayerOvercast) {
    flags.push("thick_overcast");
  }
  if (input.whiteoutRiskScore >= 70) {
    flags.push("whiteout");
  }
  if (input.windowRiskContext?.windowOpeningConfidence === "low") {
    flags.push("opening");
  }
  if (input.windowRiskContext?.whiteoutReviewLevel === "medium" || input.windowRiskContext?.whiteoutReviewLevel === "high") {
    flags.push("window_whiteout");
  }
  if (isPoorVisibility(layerStats)) {
    flags.push("visibility");
  }
  if (precipitationCapsWindow(input, "meaningful") || precipitationCapsWindow(input, "strong")) {
    flags.push("precipitation");
  }
  if (
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "weak" ||
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing"
  ) {
    flags.push("layer_coverage");
  }
  if (input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence) {
    flags.push("cloud_basis");
  }
  if (input.multiSourceAgreementContext?.shouldLowerConfidence) {
    flags.push("source_agreement");
  }
  if (input.weatherVariableConsistencyContext?.shouldLowerConfidence) {
    flags.push("weather_consistency");
  }
  return flags;
}

function calibratedConfidenceLevel(
  input: CloudSeaScoreCalibrationInput,
  layerStats: CloudLayerWindowStats,
  capReasons: readonly string[],
): CloudSeaConfidenceLevel {
  const base = input.confidenceLevel ?? confidenceFromScore(input.confidenceScore);
  if (
    capReasons.length >= 3 ||
    layerStats.highCloudOnly ||
    layerStats.midCloudOnly ||
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing" ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "mixed_basis" ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "total_only" ||
    input.windowRiskContext?.windowOpeningConfidence === "low" ||
    input.windowRiskContext?.whiteoutReviewLevel === "high" ||
    input.multiSourceAgreementContext?.shouldLowerConfidence ||
    input.weatherVariableConsistencyContext?.consistencyLevel === "conflict"
  ) {
    return "low";
  }
  if (capReasons.length > 0 || base === "medium") {
    return "medium";
  }
  return base;
}

function isRainImpactAtLeast(
  actual: CloudSeaWindowRainImpactLevel,
  expected: CloudSeaWindowRainImpactLevel,
): boolean {
  return rainImpactRank(actual) >= rainImpactRank(expected);
}

function rainImpactRank(level: CloudSeaWindowRainImpactLevel): number {
  if (level === "high") {
    return 5;
  }
  if (level === "medium") {
    return 4;
  }
  if (level === "low") {
    return 3;
  }
  if (level === "trace") {
    return 2;
  }
  if (level === "unknown") {
    return 1;
  }
  return 0;
}

function confidenceFromScore(score: number | null | undefined): CloudSeaConfidenceLevel {
  const value = clampScore(score ?? 65);
  if (value >= 75) {
    return "high";
  }
  if (value >= 50) {
    return "medium";
  }
  return "low";
}

function finalRecommendationLabelForScore(input: {
  readonly score: number;
  readonly confidenceLevel: CloudSeaConfidenceLevel;
  readonly shouldBlockStrongRecommendation: boolean;
}): string {
  if (input.score >= 86 && input.confidenceLevel === "high" && !input.shouldBlockStrongRecommendation) {
    return "强推荐专程";
  }
  if (input.score >= 70) {
    return input.shouldBlockStrongRecommendation ? "谨慎参考" : "推荐安排";
  }
  if (input.score >= 55) {
    return "谨慎参考";
  }
  if (input.score >= 40) {
    return "仅作备选";
  }
  return "不建议专程";
}

function buildScoreExplanation(input: {
  readonly rawFormationScore: number;
  readonly rawShootabilityScore: number;
  readonly calibratedFormationScore: number;
  readonly calibratedShootabilityScore: number;
  readonly finalCloudSeaScore: number;
  readonly capReasons: readonly string[];
}): string {
  const capText =
    input.capReasons.length > 0 ? `限制因素：${input.capReasons.slice(0, 3).join("、")}。` : "未触发主要封顶规则。";
  return `形成 ${input.rawFormationScore} -> ${input.calibratedFormationScore} 分，可拍 ${input.rawShootabilityScore} -> ${input.calibratedShootabilityScore} 分，最终 ${input.finalCloudSeaScore} 分。${capText}`;
}

function buildRecommendationExplanation(input: {
  readonly formationScore: number;
  readonly finalCloudSeaScore: number;
  readonly capReasons: readonly string[];
  readonly shouldBlockStrongRecommendation: boolean;
}): string {
  if (input.formationScore >= 70 && input.shouldBlockStrongRecommendation) {
    const reason =
      input.capReasons[0] ?? "可拍窗口和开口稳定性不足";
    return `云海形成条件较好，但${reason.replace(/。$/, "")}，因此谨慎参考。`;
  }
  if (input.finalCloudSeaScore >= 86) {
    return "形成、开口、能见度和风险信号同时支持，可作为强推荐窗口，但出发前仍需复核短临天气。";
  }
  if (input.finalCloudSeaScore >= 70) {
    return "云海机会有安排价值，但仍需复核低云高度、能见度、降水和开口稳定性。";
  }
  if (input.finalCloudSeaScore >= 55) {
    return "存在一定云海或低云信号，但可拍性不足以强推，适合作为谨慎参考。";
  }
  if (input.finalCloudSeaScore >= 40) {
    return "证据不足或限制较多，仅适合作为备选观察。";
  }
  return "云海形成或可拍证据不足，不建议专程。";
}

function scoreBand(score: number): CloudSeaScoreBand {
  if (score >= 86) {
    return "excellent";
  }
  if (score >= 70) {
    return "good";
  }
  if (score >= 55) {
    return "fair";
  }
  if (score >= 40) {
    return "backup";
  }
  return "poor";
}

function totalCloudPercent(row: CloudSeaScoreCalibrationHourlyRow): number | undefined {
  return finiteNumber(row.cloudTotalPercent ?? row.totalCloudPercent ?? row.cloudTotal);
}

function highCloudPercent(row: CloudSeaScoreCalibrationHourlyRow): number | undefined {
  return finiteNumber(row.cloudHighPercent ?? row.highCloudPercent ?? row.cloudHigh);
}

function midCloudPercent(row: CloudSeaScoreCalibrationHourlyRow): number | undefined {
  return finiteNumber(row.cloudMidPercent ?? row.midCloudPercent ?? row.cloudMid);
}

function lowCloudPercent(row: CloudSeaScoreCalibrationHourlyRow): number | undefined {
  return finiteNumber(row.cloudLowPercent ?? row.lowCloudPercent ?? row.cloudLow);
}

function visibilityKm(row: CloudSeaScoreCalibrationHourlyRow): number | undefined {
  return finiteNumber(row.visibilityKm) ?? metersToKilometers(row.visibilityMeters);
}

function metersToKilometers(value: number | null | undefined): number | undefined {
  const meters = finiteNumber(value);
  return meters === undefined ? undefined : meters / 1000;
}

function ratioAtLeast(values: readonly number[], threshold: number): number {
  return values.length === 0 ? 0 : values.filter((value) => value >= threshold).length / values.length;
}

function ratioBelow(values: readonly number[], threshold: number): number {
  return values.length === 0 ? 0 : values.filter((value) => value < threshold).length / values.length;
}

function average(values: readonly number[]): number | undefined {
  return values.length === 0
    ? undefined
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function uniqueText(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
