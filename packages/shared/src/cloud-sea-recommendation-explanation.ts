import type { CloudLayerCompletenessContext } from "./cloud-layer-completeness.js";
import type { CloudSeaCloudBasisConsistencyContext } from "./cloud-sea-cloud-basis-consistency.js";
import type { CloudSeaPrecipitationSignalContext } from "./cloud-sea-precipitation-signal.js";
import type {
  CloudSeaGuardRecommendationLevel,
  CloudSeaRecommendationGuardOutput,
} from "./cloud-sea-recommendation-guard.js";
import type { CloudSeaWeatherVariableConsistencyContext } from "./cloud-sea-weather-variable-consistency.js";
import type { ForecastMultiSourceAgreementContext } from "./types.js";

export type CloudSeaRecommendationExplanationInput = {
  readonly finalRecommendationLabel?: string | null;
  readonly cloudSeaScore?: number | null;
  readonly formationScore?: number | null;
  readonly shootabilityScore?: number | null;
  readonly whiteoutRiskScore?: number | null;
  readonly terrainContext?: CloudSeaRecommendationTerrainContext | null;
  readonly cloudLayerCoverageContext?: CloudLayerCompletenessContext | null;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
  readonly weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext | null;
  readonly precipitationSignalContext?: CloudSeaPrecipitationSignalContext | null;
  readonly multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null;
  readonly bestWindow?: CloudSeaRecommendationWindow | null;
  readonly actionPlan?: {
    readonly departureAdviceZh?: string | null;
    readonly actionSuggestionZh?: string | null;
  } | null;
  readonly recommendationGuardContext?: CloudSeaRecommendationGuardOutput | null;
};

export type CloudSeaRecommendationTerrainContext = {
  readonly shouldDowngradeCloudSeaWording?: boolean;
  readonly isClassicCloudSeaEligible?: boolean;
  readonly terrainClass?: string | null;
  readonly terrainNoteZh?: string | null;
};

export type CloudSeaRecommendationWindow = {
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly label?: string | null;
};

export type CloudSeaRecommendationExplanation = {
  readonly oneLineConclusionZh: string;
  readonly scoreReasonZh: string;
  readonly cautionReasonZh: string;
  readonly whyNotStrongerZh: string;
  readonly whyStillWorthWatchingZh: string;
  readonly confidenceExplanationZh: string;
  readonly reviewPointsZh: readonly string[];
  readonly actionSummaryZh: string;
  readonly userFacingSummaryZh: string;
  readonly professionalSummaryZh: string;
};

const strongRecommendationLevels = new Set<CloudSeaGuardRecommendationLevel>([
  "strong_special_trip",
]);

const arrangementRecommendationLevels = new Set<CloudSeaGuardRecommendationLevel>([
  "recommended_arrangement",
  "strong_special_trip",
]);

export function buildCloudSeaRecommendationExplanation(
  input: CloudSeaRecommendationExplanationInput,
): CloudSeaRecommendationExplanation {
  const score = normalizeScore(input.cloudSeaScore ?? input.shootabilityScore);
  const formationScore = normalizeScore(input.formationScore);
  const shootabilityScore = normalizeScore(input.shootabilityScore ?? input.cloudSeaScore);
  const finalLevel =
    input.recommendationGuardContext?.finalRecommendationLevel ??
    inferRecommendationLevel(input.finalRecommendationLabel, score);
  const finalLabel =
    input.recommendationGuardContext?.finalRecommendationLabel ??
    input.finalRecommendationLabel ??
    labelForLevel(finalLevel);
  const terrainDowngraded = input.terrainContext?.shouldDowngradeCloudSeaWording === true;
  const subjectLabel = terrainDowngraded ? "低云/晨雾" : "云海";
  const obstructionLabel = terrainDowngraded ? "低云遮挡" : "白墙";
  const blockers = buildRecommendationBlockers(input, terrainDowngraded, obstructionLabel);
  const reviewPoints = buildReviewPoints(input, terrainDowngraded, obstructionLabel);
  const primaryBlocker = blockers[0] ?? defaultBlockerForLevel(finalLevel, score, subjectLabel);
  const scoreReasonZh = buildScoreReason({
    score,
    formationScore,
    shootabilityScore,
    subjectLabel,
  });
  const cautionReasonZh = buildCautionReason({
    finalLevel,
    primaryBlocker,
    blockers,
    subjectLabel,
    finalLabel,
  });
  const scoreRecommendationDivider =
    "评分代表云层机会；推荐等级会额外考虑降水、地形、数据完整性、窗口稳定性和出行成本。";
  const whyNotStrongerZh = buildWhyNotStronger({
    finalLevel,
    finalLabel,
    score,
    blockers,
    subjectLabel,
  });
  const whyStillWorthWatchingZh = buildWhyStillWorthWatching({
    score,
    formationScore,
    shootabilityScore,
    finalLevel,
    subjectLabel,
  });
  const confidenceExplanationZh = buildConfidenceExplanation({
    input,
    finalLevel,
    blockers,
    subjectLabel,
  });
  const actionSummaryZh =
    input.actionPlan?.departureAdviceZh?.trim() ||
    buildActionSummary({
      finalLevel,
      subjectLabel,
      finalLabel,
      reviewPoints,
    });
  const oneLineConclusionZh = buildOneLineConclusion({
    score,
    finalLevel,
    finalLabel,
    primaryBlocker,
    subjectLabel,
    actionSummaryZh,
  });
  const userFacingSummaryZh = uniqueText([
    oneLineConclusionZh,
    scoreRecommendationDivider,
    whyNotStrongerZh,
  ]).join(" ");

  return {
    oneLineConclusionZh,
    scoreReasonZh,
    cautionReasonZh,
    whyNotStrongerZh,
    whyStillWorthWatchingZh,
    confidenceExplanationZh,
    reviewPointsZh: reviewPoints,
    actionSummaryZh,
    userFacingSummaryZh,
    professionalSummaryZh: uniqueText([
      scoreReasonZh,
      cautionReasonZh,
      confidenceExplanationZh,
      `复核重点：${reviewPoints.join("、")}。`,
    ]).join(" "),
  };
}

function buildRecommendationBlockers(
  input: CloudSeaRecommendationExplanationInput,
  terrainDowngraded: boolean,
  obstructionLabel: string,
): readonly string[] {
  const guardBlockers = input.recommendationGuardContext?.blockedStrongRecommendationReasons ?? [];
  const blockers: string[] = [];

  if (terrainDowngraded) {
    blockers.push("地形不满足高确定性云海专程条件");
  }
  if (input.precipitationSignalContext?.shouldDowngradeWindow) {
    blockers.push("降水干扰影响主窗口稳定性");
  } else if (
    input.precipitationSignalContext &&
    input.precipitationSignalContext.precipitationSignalType !== "none" &&
    input.precipitationSignalContext.precipitationSignalType !== "unknown"
  ) {
    blockers.push("降水信号仍需临近复核");
  }
  if (
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "weak" ||
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing" ||
    input.cloudLayerCoverageContext?.hasLowCloudLayer === false
  ) {
    blockers.push("低云或分层云量覆盖不足");
  }
  if (input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence) {
    blockers.push("云量口径或分层数据仍需复核");
  }
  if (input.multiSourceAgreementContext?.shouldLowerConfidence) {
    blockers.push("多源低云或降水判断存在分歧");
  }
  if (input.weatherVariableConsistencyContext?.shouldLowerConfidence) {
    blockers.push("温湿度或降水变量存在口径差异");
  }
  if ((input.whiteoutRiskScore ?? 0) >= 70) {
    blockers.push(`${obstructionLabel}风险偏高`);
  }
  if (!input.bestWindow) {
    blockers.push("暂无稳定可执行主窗口");
  }

  return uniqueText([...blockers, ...normalizeGuardBlockers(guardBlockers)]).slice(0, 5);
}

function normalizeGuardBlockers(blockers: readonly string[]): readonly string[] {
  return blockers.map((blocker) => {
    if (/降水|雨|precip/i.test(blocker)) {
      return "降水干扰影响主窗口稳定性";
    }
    if (/低云|分层|云量|cloud/i.test(blocker)) {
      return "低云或分层云量覆盖不足";
    }
    if (/多源|分歧|disagreement/i.test(blocker)) {
      return "多源低云或降水判断存在分歧";
    }
    if (/地形|低海拔|terrain/i.test(blocker)) {
      return "地形不满足高确定性云海专程条件";
    }
    if (/白墙|遮挡|whiteout/i.test(blocker)) {
      return "白墙或低云遮挡风险偏高";
    }
    if (/分数|score/i.test(blocker)) {
      return "核心评分不足";
    }
    if (/窗口|window/i.test(blocker)) {
      return "暂无稳定可执行主窗口";
    }
    if (/变量|温|湿|dew|temperature/i.test(blocker)) {
      return "温湿度或降水变量存在口径差异";
    }
    return blocker.trim();
  });
}

function buildReviewPoints(
  input: CloudSeaRecommendationExplanationInput,
  terrainDowngraded: boolean,
  obstructionLabel: string,
): readonly string[] {
  const points: string[] = [];

  if (
    input.precipitationSignalContext?.shouldDowngradeWindow ||
    (input.precipitationSignalContext &&
      input.precipitationSignalContext.precipitationSignalType !== "none")
  ) {
    points.push("短临降水和通行状态");
  }
  points.push(terrainDowngraded ? "低云是否贴地" : "云顶高度是否低于机位");
  if (
    input.cloudLayerCoverageContext?.shouldReduceCloudSeaConfidence ||
    input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence
  ) {
    points.push("低/中/高云分层覆盖");
  }
  if (input.multiSourceAgreementContext?.shouldShowReviewWarning) {
    points.push("多源低云和降水分歧");
  }
  if (input.weatherVariableConsistencyContext?.shouldLowerConfidence) {
    points.push("温湿度和露点差口径");
  }
  if ((input.whiteoutRiskScore ?? 0) >= 55) {
    points.push(`${obstructionLabel}与能见度`);
  }
  if (input.terrainContext?.terrainNoteZh || terrainDowngraded) {
    points.push("现场地形和视野遮挡");
  }

  return uniqueText(points).slice(0, 5);
}

function buildScoreReason(input: {
  readonly score: number;
  readonly formationScore: number;
  readonly shootabilityScore: number;
  readonly subjectLabel: string;
}): string {
  if (input.score >= 70) {
    return `${input.subjectLabel}评分较高，主要来自云层形成和可拍窗口信号；形成 ${input.formationScore} 分，可拍 ${input.shootabilityScore} 分。`;
  }
  if (input.score >= 45) {
    return `${input.subjectLabel}有一定信号，但形成 ${input.formationScore} 分、可拍 ${input.shootabilityScore} 分仍未达到高确定性窗口。`;
  }
  return `${input.subjectLabel}核心证据不足，形成 ${input.formationScore} 分、可拍 ${input.shootabilityScore} 分都不适合作为专程依据。`;
}

function buildCautionReason(input: {
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly primaryBlocker: string;
  readonly blockers: readonly string[];
  readonly subjectLabel: string;
  readonly finalLabel: string;
}): string {
  if (input.finalLevel === "do_not_go_special") {
    return `${input.subjectLabel}证据不足，${input.primaryBlocker}，不建议专程。`;
  }
  if (input.finalLevel === "backup_only") {
    return `${input.subjectLabel}可作为备选观察，但${input.primaryBlocker}，不建议只为该窗口专程。`;
  }
  if (input.finalLevel === "cautious_reference" || input.finalLevel === "observe_if_nearby") {
    return `${input.subjectLabel}机会存在，但${input.primaryBlocker}，因此为${input.finalLabel}。`;
  }
  if (input.blockers.length > 0) {
    return `主窗口可安排，但${input.primaryBlocker}，需要出发前复核。`;
  }
  return `地形、云层、窗口和风险条件支持${input.finalLabel}。`;
}

function buildWhyNotStronger(input: {
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly finalLabel: string;
  readonly score: number;
  readonly blockers: readonly string[];
  readonly subjectLabel: string;
}): string {
  if (strongRecommendationLevels.has(input.finalLevel)) {
    return "当前未被关键 guard 阻断，但仍需按短临预报和现场条件复核。";
  }
  const reason = input.blockers[0] ?? "窗口稳定性和出行成本仍需复核";
  if (input.score >= 70) {
    return `${input.subjectLabel}评分较高，但未直接强推，是因为${reason}。`;
  }
  if (input.score >= 45) {
    return `${input.subjectLabel}评分处在中等区间，推荐等级按${input.finalLabel}处理，是因为${reason}。`;
  }
  return `${input.subjectLabel}评分偏低，不提升推荐等级，是因为核心云层证据不足。`;
}

function buildWhyStillWorthWatching(input: {
  readonly score: number;
  readonly formationScore: number;
  readonly shootabilityScore: number;
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly subjectLabel: string;
}): string {
  if (input.finalLevel === "do_not_go_special") {
    return `当前不建议专程，但后续若低云、湿度和能见度同步改善，${input.subjectLabel}仍可重新评估。`;
  }
  if (input.score >= 70 || input.formationScore >= 70) {
    return `${input.subjectLabel}云层机会仍值得关注，尤其是形成信号较强时，可等待短临数据确认窗口。`;
  }
  if (input.score >= 45 || input.shootabilityScore >= 45) {
    return `${input.subjectLabel}有备选价值，适合已在附近或行程已定时顺带观察。`;
  }
  return "后续预报若出现低云、湿度和通透度同步改善，再考虑重新观察。";
}

function buildConfidenceExplanation(input: {
  readonly input: CloudSeaRecommendationExplanationInput;
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly blockers: readonly string[];
  readonly subjectLabel: string;
}): string {
  if (
    input.input.cloudLayerCoverageContext?.layerCompletenessLevel === "weak" ||
    input.input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing"
  ) {
    return "置信度降低：低/中/高云分层不足，不能把总云量当作云海证据。";
  }
  if (input.input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence) {
    return "云量口径不一致，需临近复核：云量口径、分层覆盖或低云数据不完整，需要临近复核。";
  }
  if (input.input.multiSourceAgreementContext?.shouldLowerConfidence) {
    return "置信度降低：多源低云或降水判断存在分歧。";
  }
  if (input.input.weatherVariableConsistencyContext?.shouldLowerConfidence) {
    return "关键天气变量存在冲突，需临近复核：温湿度、露点差或降水变量需要统一口径后再判断。";
  }
  if (arrangementRecommendationLevels.has(input.finalLevel) && input.blockers.length === 0) {
    return `置信度较高：${input.subjectLabel}形成、可拍窗口和主要风险没有出现明显冲突。`;
  }
  return "置信度中等：当前结论可以参考，但出发前仍需短临预报和现场观察确认。";
}

function buildActionSummary(input: {
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly subjectLabel: string;
  readonly finalLabel: string;
  readonly reviewPoints: readonly string[];
}): string {
  const reviewText = input.reviewPoints.length > 0 ? input.reviewPoints.slice(0, 3).join("、") : "短临预报";
  if (input.finalLevel === "do_not_go_special") {
    return `当前${input.subjectLabel}证据不足，建议等待更新或转向通透、层云、霞光等备选题材。`;
  }
  if (input.finalLevel === "backup_only") {
    return `若已在附近或行程已定可顺带观察，不建议单独为${input.subjectLabel}专程。`;
  }
  if (input.finalLevel === "cautious_reference" || input.finalLevel === "observe_if_nearby") {
    return `可按主窗口做准备，但出发前必须复核${reviewText}。`;
  }
  if (input.finalLevel === "recommended_arrangement") {
    return `主窗口可执行，但出发前仍需复核${reviewText}。`;
  }
  return `可作为${input.subjectLabel}专程主窗口，但出发前仍需复核${reviewText}。`;
}

function buildOneLineConclusion(input: {
  readonly score: number;
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly finalLabel: string;
  readonly primaryBlocker: string;
  readonly subjectLabel: string;
  readonly actionSummaryZh: string;
}): string {
  if (input.finalLevel === "do_not_go_special" || input.score < 40) {
    return `${input.subjectLabel}核心证据不足，建议等待下一次预报更新，或转向通透、层云、霞光等备选题材。`;
  }
  if (input.finalLevel === "backup_only") {
    return `${input.subjectLabel}有一定信号，但${input.primaryBlocker}，适合作为备选观察，不建议只为${input.subjectLabel}专程。`;
  }
  if (
    input.score >= 70 &&
    !strongRecommendationLevels.has(input.finalLevel)
  ) {
    return `${input.subjectLabel}云层条件较好，主窗口值得关注；但${input.primaryBlocker}，因此建议${input.finalLabel}，不直接强推专程。`;
  }
  if (input.finalLevel === "cautious_reference" || input.finalLevel === "observe_if_nearby") {
    return `${input.subjectLabel}机会存在，但${input.primaryBlocker}，建议${input.finalLabel}并等待临近复核。`;
  }
  return `${input.subjectLabel}条件支持${input.finalLabel}；${input.actionSummaryZh}`;
}

function defaultBlockerForLevel(
  level: CloudSeaGuardRecommendationLevel,
  score: number,
  subjectLabel: string,
): string {
  if (score < 40 || level === "do_not_go_special") {
    return `${subjectLabel}核心证据不足`;
  }
  if (level === "backup_only") {
    return "低云高度、开口时间或降水扰动不够稳定";
  }
  if (level === "cautious_reference" || level === "observe_if_nearby") {
    return "窗口稳定性仍需临近预报确认";
  }
  return "仍需出发前复核现场条件";
}

function inferRecommendationLevel(
  label: string | null | undefined,
  score: number,
): CloudSeaGuardRecommendationLevel {
  const text = label ?? "";
  if (text.includes("不建议")) {
    return "do_not_go_special";
  }
  if (text.includes("备选")) {
    return "backup_only";
  }
  if (text.includes("谨慎")) {
    return "cautious_reference";
  }
  if (text.includes("观察") || text.includes("顺带")) {
    return "observe_if_nearby";
  }
  if (text.includes("强推荐")) {
    return "strong_special_trip";
  }
  if (text.includes("推荐")) {
    return "recommended_arrangement";
  }
  if (score < 40) {
    return "do_not_go_special";
  }
  if (score < 50) {
    return "backup_only";
  }
  if (score < 70) {
    return "recommended_arrangement";
  }
  return "strong_special_trip";
}

function labelForLevel(level: CloudSeaGuardRecommendationLevel): string {
  if (level === "do_not_go_special") {
    return "不建议专程";
  }
  if (level === "backup_only") {
    return "仅作备选";
  }
  if (level === "cautious_reference") {
    return "谨慎参考";
  }
  if (level === "observe_if_nearby") {
    return "已在附近可观察";
  }
  if (level === "recommended_arrangement") {
    return "推荐安排";
  }
  return "强推荐专程";
}

function normalizeScore(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : 0;
}

function uniqueText(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
