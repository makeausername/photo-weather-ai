import type { CalibrationStatsRecord, DatabaseClient, JsonValue } from "@photo-weather/db";
import type {
  CalibrationComparison,
  CalibrationComparisonClass,
  CalibrationHint,
  ForecastReplayResultRecord,
  ForecastReplayTarget,
  ObservedOutcomeRecord,
  ObservedResult,
} from "./types.js";
import {
  listCalibrationStats,
  listForecastReplayResults,
  listObservedOutcomes,
  upsertCalibrationStats,
} from "./storage.js";

export const defaultCalibrationMinimumSampleCount = 10;

export const recommendedPredictionLabels = [
  "强推荐专程",
  "推荐专程前往",
  "推荐安排",
  "推荐拍摄",
  "值得等待",
  "推荐重点关注",
  "推荐前往",
] as const;

export const cautiousPredictionLabels = ["谨慎参考", "已在附近可观察", "仅作备选"] as const;

export const nearbyPredictionLabels = ["已在附近可观察", "附近可观察", "可现场观察"] as const;

export const negativePredictionLabels = [
  "不建议专程前往",
  "不建议夜拍",
  "暂无高确定性窗口",
  "不建议专程",
  "不建议前往",
  "不建议",
] as const;

export type ComputeCalibrationStatsInput = {
  readonly locationKey: string;
  readonly locationName?: string | null;
  readonly spotId?: string | null;
  readonly target: ForecastReplayTarget;
  readonly ruleVersion?: string | null;
  readonly client?: DatabaseClient;
};

export type RebuildCalibrationStatsInput = ComputeCalibrationStatsInput & {
  readonly ruleVersion: string;
};

export async function computeCalibrationStats(
  input: ComputeCalibrationStatsInput,
): Promise<CalibrationStatsRecord> {
  const [allResults, outcomes] = await Promise.all([
    listForecastReplayResults({
      client: input.client,
      locationKey: input.locationKey,
      target: input.target,
    }),
    listObservedOutcomes({
      client: input.client,
      locationKey: input.locationKey,
      target: input.target,
    }),
  ]);
  const results = input.ruleVersion
    ? allResults.filter((result) => resultRuleVersion(result) === input.ruleVersion)
    : allResults;
  const comparisons = compareReplayResultsWithOutcomes(results, outcomes);
  const labeled = comparisons.filter(isLabeledComparison);
  const sampleCount = results.length;
  const labeledCount = labeled.length;
  const successCount = labeled.filter(
    (comparison) => comparison.observedResult === "success",
  ).length;
  const partialCount = labeled.filter(
    (comparison) => comparison.observedResult === "partial",
  ).length;
  const failCount = labeled.filter((comparison) => comparison.observedResult === "fail").length;
  const truePositiveCount = countClass(labeled, "true_positive");
  const trueNegativeCount = countClass(labeled, "true_negative");
  const partialHitCount = countClass(labeled, "partial_match");
  const falsePositiveCount = countClass(labeled, "false_positive");
  const falseNegativeCount = countClass(labeled, "false_negative");
  const hitCount = truePositiveCount + trueNegativeCount;
  const whiteoutFalsePositiveCount = comparisons.filter(
    (comparison) =>
      comparison.matchStatus === "false_positive" &&
      comparison.mismatchReasons.includes("白墙风险低估"),
  ).length;
  const recommendedPredictions = labeled.filter(
    (comparison) => comparison.predictedClass === "recommended",
  );
  const recommendedHits = recommendedPredictions.filter(
    (comparison) =>
      comparison.matchStatus === "true_positive" || comparison.matchStatus === "partial_match",
  ).length;
  const windowComparable = results.filter((result) => outcomeForResult(result, outcomes));
  const windowHits = windowComparable.filter((result) => {
    const outcome = outcomeForResult(result, outcomes);
    return outcome ? bestWindowOverlapsOutcome(result, outcome) : false;
  }).length;
  const mismatchReasons = commonMismatchReasons(labeled);
  const falsePositiveRate = ratio(falsePositiveCount, labeledCount);
  const falseNegativeRate = ratio(falseNegativeCount, labeledCount);
  const whiteoutFalsePositiveRate = ratio(whiteoutFalsePositiveCount, labeledCount);
  const recommendationsZh = calibrationRecommendations({
    falsePositiveRate,
    falseNegativeRate,
    whiteoutFalsePositiveRate,
    target: input.target,
  });

  return upsertCalibrationStats(
    {
      spotId: input.spotId ?? null,
      locationKey: input.locationKey,
      locationName: resolveStatsLocationName(input, results, outcomes),
      target: input.target,
      ruleVersion: input.ruleVersion ?? "unknown",
      sampleCount,
      labeledCount,
      successCount,
      partialCount,
      failCount,
      hitCount,
      partialHitCount,
      falsePositiveCount,
      falseNegativeCount,
      truePositiveCount,
      trueNegativeCount,
      hitRate: ratio(hitCount + partialHitCount * 0.5, labeledCount),
      falsePositiveRate,
      falseNegativeRate,
      whiteoutFalsePositiveRate,
      bestWindowHitRate: ratio(windowHits, windowComparable.length),
      recommendedTripHitRate: ratio(recommendedHits, recommendedPredictions.length),
      summaryJson: toJsonValue({
        truePositiveCount,
        trueNegativeCount,
        falsePositiveCount,
        falseNegativeCount,
        partialHitCount,
        hitCount,
        labeledCount,
        unlabeledCount: comparisons.filter((comparison) => comparison.matchStatus === "unlabeled")
          .length,
        unknownCount: comparisons.filter((comparison) => comparison.matchStatus === "unknown")
          .length,
        mismatchReasons,
        recommendationsZh,
        comparisons: comparisons.slice(0, 100),
      }),
    },
    { client: input.client },
  );
}

export async function rebuildCalibrationStats(
  input: RebuildCalibrationStatsInput,
): Promise<CalibrationStatsRecord> {
  return computeCalibrationStats(input);
}

export async function findCalibrationHint(input: {
  readonly locationKey: string;
  readonly target: ForecastReplayTarget;
  readonly minSampleCount?: number;
  readonly client?: DatabaseClient;
}): Promise<CalibrationHint | null> {
  const stats = await listCalibrationStats({
    client: input.client,
    locationKey: input.locationKey,
    target: input.target,
  });
  return buildCalibrationHint(stats[0], input.minSampleCount);
}

export function buildCalibrationHint(
  stats: CalibrationStatsRecord | undefined,
  minSampleCount = defaultCalibrationMinimumSampleCount,
): CalibrationHint | null {
  if (!stats || stats.labeledCount < minSampleCount) {
    return null;
  }

  const confidenceAdjustment = confidenceAdjustmentForStats(stats);
  const cautionNoteZh = cautionNoteForStats(stats);

  return {
    spotId: stats.spotId,
    locationKey: stats.locationKey,
    target: stats.target,
    sampleCount: stats.sampleCount,
    labeledCount: stats.labeledCount,
    hitRate: stats.hitRate,
    falsePositiveRate: stats.falsePositiveRate,
    falseNegativeRate: stats.falseNegativeRate,
    confidenceAdjustment,
    cautionNoteZh,
    displayNoteZh: `历史校准：${cautionNoteZh}`,
  };
}

export function compareReplayResultsWithOutcomes(
  results: readonly ForecastReplayResultRecord[],
  outcomes: readonly ObservedOutcomeRecord[],
): readonly CalibrationComparison[] {
  return results.map((result) => compareReplayResultWithOutcome(result, outcomeForResult(result, outcomes)));
}

export function compareReplayResultWithOutcome(
  result: ForecastReplayResultRecord,
  outcome?: ObservedOutcomeRecord | null,
): CalibrationComparison {
  const predictedClass = predictedRecommendationClass(result);
  const base = {
    replayResultId: result.id,
    forecastDate: dateString(result.forecastDate),
    target: result.target,
    predictedClass,
  };

  if (!outcome) {
    return {
      ...base,
      matchStatus: "unlabeled",
      matchScore: 0,
      mismatchReasons: [],
      classification: "unlabeled",
    };
  }

  if (outcome.observedResult === "unknown") {
    return {
      ...base,
      outcomeId: outcome.id,
      observedResult: outcome.observedResult,
      matchStatus: "unknown",
      matchScore: 0,
      mismatchReasons: [],
      classification: "unknown",
    };
  }

  const matchStatus = classifyPrediction(predictedClass, outcome.observedResult, result.target);
  const mismatchReasons = mismatchReasonsForPrediction(predictedClass, outcome, matchStatus);

  return {
    ...base,
    outcomeId: outcome.id,
    observedResult: outcome.observedResult,
    matchStatus,
    matchScore: matchScoreForStatus(matchStatus),
    mismatchReasons,
    classification: matchStatus,
    mismatchReason: mismatchReasons[0],
  };
}

export function predictedRecommendationClass(
  result: Pick<
    ForecastReplayResultRecord,
    | "overallScore"
    | "recommendationLabel"
    | "dedicatedTripRecommendation"
    | "nearbyObservationRecommendation"
    | "predictedJson"
  >,
): CalibrationComparison["predictedClass"] {
  const labels = collectPredictionLabels(result);
  if (labels.some((label) => includesAnyLabel(label, recommendedPredictionLabels))) {
    return "recommended";
  }
  if (labels.some((label) => includesAnyLabel(label, nearbyPredictionLabels))) {
    return "nearby";
  }
  if (labels.some((label) => includesAnyLabel(label, cautiousPredictionLabels))) {
    return "cautious";
  }
  if (labels.some((label) => includesAnyLabel(label, negativePredictionLabels))) {
    return "not_recommended";
  }

  const level = predictedLevel(result.predictedJson);
  if (level === "recommended" || level === "worth_waiting") {
    return "recommended";
  }
  if (level === "cautious" || level === "backup") {
    return "cautious";
  }
  if (level === "not_recommended") {
    return "not_recommended";
  }

  const overallScore = result.overallScore ?? 0;
  if (overallScore >= 78) {
    return "recommended";
  }
  if (overallScore >= 45) {
    return "cautious";
  }
  return "not_recommended";
}

export function classifyPrediction(
  predictedClass: CalibrationComparison["predictedClass"],
  observedResult: Exclude<ObservedResult, "unknown">,
  target: ForecastReplayTarget = "general",
): CalibrationComparisonClass {
  if (predictedClass === "recommended" || predictedClass === "cautious") {
    if (observedResult === "success") {
      return "true_positive";
    }
    if (observedResult === "partial") {
      return "partial_match";
    }
    return "false_positive";
  }

  if (predictedClass === "nearby") {
    if (observedResult === "success") {
      return target === "general" ? "partial_match" : "true_positive";
    }
    if (observedResult === "partial") {
      return "partial_match";
    }
    return "false_positive";
  }

  if (observedResult === "success") {
    return "false_negative";
  }
  if (observedResult === "partial") {
    return "partial_match";
  }
  return "true_negative";
}

function outcomeForResult(
  result: ForecastReplayResultRecord,
  outcomes: readonly ObservedOutcomeRecord[],
): ObservedOutcomeRecord | undefined {
  const forecastDate = dateString(result.forecastDate);
  return outcomes.find(
    (outcome) =>
      sameCalibrationLocation(result, outcome) &&
      outcome.target === result.target &&
      dateString(outcome.outcomeDate) === forecastDate,
  );
}

function sameCalibrationLocation(
  result: Pick<ForecastReplayResultRecord, "locationKey" | "spotId">,
  outcome: Pick<ObservedOutcomeRecord, "locationKey" | "spotId">,
): boolean {
  if (result.locationKey && outcome.locationKey) {
    return result.locationKey === outcome.locationKey;
  }
  if (result.spotId && outcome.spotId) {
    return result.spotId === outcome.spotId;
  }
  return false;
}

function collectPredictionLabels(
  result: Pick<
    ForecastReplayResultRecord,
    | "recommendationLabel"
    | "dedicatedTripRecommendation"
    | "nearbyObservationRecommendation"
    | "predictedJson"
  >,
): readonly string[] {
  return uniqueStrings([
    result.recommendationLabel,
    result.dedicatedTripRecommendation,
    result.nearbyObservationRecommendation,
    ...collectPredictionLabelsFromJson(result.predictedJson),
  ]);
}

function collectPredictionLabelsFromJson(value: JsonValue): readonly string[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectPredictionLabelsFromJson);
  }

  const record = value as Record<string, JsonValue>;
  const labels: string[] = [];
  for (const key of [
    "recommendationLabel",
    "dedicatedTripRecommendation",
    "nearbyObservationRecommendation",
    "recommendationLevelLabel",
  ]) {
    const candidate = record[key];
    if (typeof candidate === "string") {
      labels.push(candidate);
    }
  }

  for (const key of ["dailySummary", "bestWindow"]) {
    const nested = record[key];
    if (nested) {
      labels.push(...collectPredictionLabelsFromJson(nested));
    }
  }

  return labels;
}

function includesAnyLabel(value: string, labels: readonly string[]): boolean {
  return labels.some((label) => value.includes(label));
}

function predictedLevel(value: JsonValue): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const level = (value as { readonly recommendationLevel?: unknown }).recommendationLevel;
  return typeof level === "string" ? level : undefined;
}

function mismatchReasonsForPrediction(
  predictedClass: CalibrationComparison["predictedClass"],
  outcome: ObservedOutcomeRecord,
  matchStatus: CalibrationComparisonClass,
): readonly string[] {
  if (matchStatus === "false_positive") {
    const reasons: string[] = [];
    if (outcome.whiteoutLevel === "medium" || outcome.whiteoutLevel === "high") {
      reasons.push("白墙风险低估");
    }
    if (outcome.rainImpactLevel === "medium" || outcome.rainImpactLevel === "high") {
      reasons.push("降水影响低估");
    }
    if (
      outcome.target === "cloud_sea" &&
      (outcome.cloudSeaLevel === "none" || outcome.cloudSeaLevel === "weak")
    ) {
      reasons.push("云海强度高估");
    }
    if (
      outcome.target === "glow" &&
      (outcome.sunriseGlowLevel === "none" || outcome.sunriseGlowLevel === "weak") &&
      (outcome.sunsetGlowLevel === "none" || outcome.sunsetGlowLevel === "weak")
    ) {
      reasons.push("霞光强度高估");
    }
    if (
      outcome.target === "astro" &&
      (outcome.astroVisibilityLevel === "none" || outcome.astroVisibilityLevel === "weak") &&
      (outcome.milkyWayVisibilityLevel === "none" || outcome.milkyWayVisibilityLevel === "weak")
    ) {
      reasons.push("星空可见度高估");
    }
    if (reasons.length > 0) {
      return reasons;
    }
    return [predictedClass === "nearby" ? "附近观察信号偏乐观" : "推荐偏乐观"];
  }
  if (matchStatus === "false_negative") {
    return ["保守规则漏判可拍机会"];
  }
  if (matchStatus === "partial_match") {
    return ["结果部分命中，窗口或强度仍需校准"];
  }
  return [];
}

function matchScoreForStatus(status: CalibrationComparisonClass): number {
  if (status === "true_positive" || status === "true_negative") {
    return 1;
  }
  if (status === "partial_match") {
    return 0.5;
  }
  return 0;
}

function bestWindowOverlapsOutcome(
  result: ForecastReplayResultRecord,
  outcome: ObservedOutcomeRecord,
): boolean {
  if (
    !result.bestWindowStart ||
    !result.bestWindowEnd ||
    !outcome.observationWindowStart ||
    !outcome.observationWindowEnd ||
    outcome.observedResult === "fail" ||
    outcome.observedResult === "unknown"
  ) {
    return false;
  }
  return (
    result.bestWindowStart.getTime() < outcome.observationWindowEnd.getTime() &&
    outcome.observationWindowStart.getTime() < result.bestWindowEnd.getTime()
  );
}

function commonMismatchReasons(comparisons: readonly CalibrationComparison[]): readonly string[] {
  const counts = new Map<string, number>();
  for (const comparison of comparisons) {
    for (const reason of comparison.mismatchReasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([reason, count]) => `${reason}（${count} 次）`)
    .slice(0, 5);
}

function calibrationRecommendations(input: {
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly whiteoutFalsePositiveRate: number;
  readonly target: ForecastReplayTarget;
}): readonly string[] {
  const recommendations: string[] = [];
  if (input.falsePositiveRate >= 0.35) {
    recommendations.push(input.target === "cloud_sea" ? "云海模型偏乐观" : "推荐规则偏乐观");
  }
  if (input.whiteoutFalsePositiveRate >= 0.2) {
    recommendations.push("白墙风险低估");
  }
  if (input.falseNegativeRate >= 0.3) {
    recommendations.push(
      input.target === "astro" ? "低分星空机会仍需现场复核" : "保守规则漏判机会较多",
    );
  }
  if (
    input.target === "glow" &&
    (input.falsePositiveRate >= 0.25 || input.falseNegativeRate >= 0.25)
  ) {
    recommendations.push("霞光窗口误判较多");
  }
  return recommendations.length > 0 ? recommendations : ["当前样本未显示明显系统性偏差"];
}

function confidenceAdjustmentForStats(
  stats: CalibrationStatsRecord,
): CalibrationHint["confidenceAdjustment"] {
  if (stats.falsePositiveRate >= 0.4) {
    return "moderate_down";
  }
  if (stats.falsePositiveRate >= 0.28) {
    return "slight_down";
  }
  if (stats.falseNegativeRate >= 0.35) {
    return "slight_up";
  }
  if (stats.hitRate >= 0.75) {
    return "slight_up";
  }
  return "none";
}

function cautionNoteForStats(stats: CalibrationStatsRecord): string {
  if (stats.falsePositiveRate >= 0.35) {
    return "该机位历史回放存在偏乐观情况，本次建议谨慎参考。";
  }
  if (stats.falseNegativeRate >= 0.35) {
    return "历史回放显示该机位偶有低分出片情况，若已在附近可保留机动观察。";
  }
  if (stats.hitRate >= 0.75) {
    return "该机位同类条件历史命中较稳定，仍建议出发前复核临近预报。";
  }
  return "该机位同类条件样本已累计，仍以本次实时判断和临近预报为主。";
}

function resultRuleVersion(result: ForecastReplayResultRecord): string | null {
  const predicted = result.predictedJson;
  if (!predicted || typeof predicted !== "object" || Array.isArray(predicted)) {
    return null;
  }
  const value = (predicted as { readonly ruleVersion?: unknown }).ruleVersion;
  return typeof value === "string" ? value : null;
}

function isLabeledComparison(comparison: CalibrationComparison): boolean {
  return (
    comparison.matchStatus !== "unlabeled" &&
    comparison.matchStatus !== "unknown" &&
    comparison.observedResult !== undefined &&
    comparison.observedResult !== "unknown"
  );
}

function countClass(
  comparisons: readonly CalibrationComparison[],
  classification: CalibrationComparisonClass,
): number {
  return comparisons.filter((comparison) => comparison.matchStatus === classification).length;
}

function resolveStatsLocationName(
  input: Pick<ComputeCalibrationStatsInput, "locationName" | "locationKey">,
  results: readonly ForecastReplayResultRecord[],
  outcomes: readonly ObservedOutcomeRecord[],
): string {
  return (
    input.locationName?.trim() ||
    results.find((result) => result.locationName.trim())?.locationName ||
    outcomes.find((outcome) => outcome.locationName.trim())?.locationName ||
    input.locationKey
  );
}

function uniqueStrings(values: readonly (string | null | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? round3(numerator / denominator) : 0;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function dateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
