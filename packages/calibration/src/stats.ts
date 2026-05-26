import type { CalibrationStatsRecord, JsonValue } from "@photo-weather/db";
import type {
  CalibrationComparison,
  CalibrationComparisonClass,
  CalibrationHint,
  ForecastReplayResultRecord,
  ForecastReplayTarget,
  ObservedOutcomeRecord,
} from "./types.js";
import {
  listCalibrationStats,
  listForecastReplayResults,
  listObservedOutcomes,
  upsertCalibrationStats,
} from "./storage.js";
import type { DatabaseClient } from "@photo-weather/db";

export const defaultCalibrationMinimumSampleCount = 10;

export type RebuildCalibrationStatsInput = {
  readonly locationKey: string;
  readonly spotId?: string | null;
  readonly target: ForecastReplayTarget;
  readonly ruleVersion: string;
  readonly client?: DatabaseClient;
};

export async function rebuildCalibrationStats(
  input: RebuildCalibrationStatsInput,
): Promise<CalibrationStatsRecord> {
  const [results, outcomes] = await Promise.all([
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
  const comparisons = compareReplayResultsWithOutcomes(results, outcomes);
  const labeled = comparisons.filter((comparison) => comparison.classification !== "unlabeled");
  const sampleCount = labeled.length;
  const successCount = labeled.filter(
    (comparison) => comparison.observedResult === "success",
  ).length;
  const partialCount = labeled.filter(
    (comparison) => comparison.observedResult === "partial",
  ).length;
  const failCount = labeled.filter((comparison) => comparison.observedResult === "fail").length;
  const truePositiveCount = countClass(labeled, "true_positive");
  const trueNegativeCount = countClass(labeled, "true_negative");
  const partialMatchCount = countClass(labeled, "partial_match");
  const falsePositiveCount = countClass(labeled, "false_positive");
  const falseNegativeCount = countClass(labeled, "false_negative");
  const whiteoutFalsePositiveCount = results.filter((result) => {
    const outcome = outcomeForResult(result, outcomes);
    return (
      outcome !== undefined &&
      (outcome.whiteoutLevel === "medium" || outcome.whiteoutLevel === "high") &&
      (result.whiteoutRiskScore ?? 0) < 50
    );
  }).length;
  const recommendedPredictions = labeled.filter(
    (comparison) =>
      comparison.predictedClass === "dedicated" || comparison.predictedClass === "cautious",
  );
  const recommendedHits = recommendedPredictions.filter(
    (comparison) =>
      comparison.classification === "true_positive" ||
      comparison.classification === "partial_match",
  ).length;
  const windowComparable = results.filter((result) => outcomeForResult(result, outcomes));
  const windowHits = windowComparable.filter((result) => {
    const outcome = outcomeForResult(result, outcomes);
    return outcome ? bestWindowOverlapsOutcome(result, outcome) : false;
  }).length;
  const mismatchReasons = commonMismatchReasons(labeled);
  const recommendationsZh = calibrationRecommendations({
    falsePositiveRate: ratio(falsePositiveCount, sampleCount),
    falseNegativeRate: ratio(falseNegativeCount, sampleCount),
    whiteoutFalsePositiveRate: ratio(whiteoutFalsePositiveCount, sampleCount),
    target: input.target,
  });

  return upsertCalibrationStats(
    {
      spotId: input.spotId ?? null,
      locationKey: input.locationKey,
      target: input.target,
      ruleVersion: input.ruleVersion,
      sampleCount,
      successCount,
      partialCount,
      failCount,
      hitRate: ratio(truePositiveCount + trueNegativeCount + partialMatchCount * 0.5, sampleCount),
      falsePositiveRate: ratio(falsePositiveCount, sampleCount),
      falseNegativeRate: ratio(falseNegativeCount, sampleCount),
      whiteoutFalsePositiveRate: ratio(whiteoutFalsePositiveCount, sampleCount),
      bestWindowHitRate: ratio(windowHits, windowComparable.length),
      recommendedTripHitRate: ratio(recommendedHits, recommendedPredictions.length),
      summaryJson: toJsonValue({
        truePositiveCount,
        trueNegativeCount,
        falsePositiveCount,
        falseNegativeCount,
        partialMatchCount,
        unlabeledCount: comparisons.length - labeled.length,
        mismatchReasons,
        recommendationsZh,
        comparisons: comparisons.slice(0, 100),
      }),
    },
    { client: input.client },
  );
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
  if (!stats || stats.sampleCount < minSampleCount) {
    return null;
  }

  const confidenceAdjustment = confidenceAdjustmentForStats(stats);
  const cautionNoteZh = cautionNoteForStats(stats);
  const hitRatePercent = Math.round(stats.hitRate * 100);

  return {
    spotId: stats.spotId,
    locationKey: stats.locationKey,
    target: stats.target,
    sampleCount: stats.sampleCount,
    hitRate: stats.hitRate,
    falsePositiveRate: stats.falsePositiveRate,
    falseNegativeRate: stats.falseNegativeRate,
    confidenceAdjustment,
    cautionNoteZh,
    displayNoteZh: `历史校准：该机位同类条件命中率约 ${hitRatePercent}%，${cautionNoteZh}`,
  };
}

export function compareReplayResultsWithOutcomes(
  results: readonly ForecastReplayResultRecord[],
  outcomes: readonly ObservedOutcomeRecord[],
): readonly CalibrationComparison[] {
  return results.map((result) => {
    const outcome = outcomeForResult(result, outcomes);
    const predictedClass = predictedRecommendationClass(result);
    if (!outcome || outcome.observedResult === "unknown") {
      return {
        replayResultId: result.id,
        forecastDate: dateString(result.forecastDate),
        target: result.target,
        predictedClass,
        classification: "unlabeled",
      };
    }

    const classification = classifyPrediction(predictedClass, outcome.observedResult);
    return {
      replayResultId: result.id,
      outcomeId: outcome.id,
      forecastDate: dateString(result.forecastDate),
      target: result.target,
      predictedClass,
      observedResult: outcome.observedResult,
      classification,
      mismatchReason: mismatchReason(predictedClass, outcome, classification),
    };
  });
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
  const level = predictedLevel(result.predictedJson);
  if (level === "recommended") {
    return "dedicated";
  }
  if (level === "worth_waiting" || level === "cautious") {
    return "cautious";
  }

  const dedicated = result.dedicatedTripRecommendation ?? "";
  const nearby = result.nearbyObservationRecommendation ?? "";
  const label = result.recommendationLabel ?? "";
  if (dedicated.includes("推荐专程") || label.includes("推荐重点")) {
    return "dedicated";
  }
  if (dedicated.includes("谨慎") || label.includes("值得") || label.includes("谨慎")) {
    return "cautious";
  }
  if (nearby.includes("附近") || nearby.includes("观察") || nearby.includes("可观察")) {
    return "nearby";
  }
  if (result.overallScore >= 78) {
    return "dedicated";
  }
  if (result.overallScore >= 45) {
    return "cautious";
  }
  return "not_recommended";
}

export function classifyPrediction(
  predictedClass: CalibrationComparison["predictedClass"],
  observedResult: "success" | "partial" | "fail",
): CalibrationComparisonClass {
  if (predictedClass === "dedicated" || predictedClass === "cautious") {
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
      return "true_positive";
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
      outcome.locationKey === result.locationKey &&
      outcome.target === result.target &&
      dateString(outcome.outcomeDate) === forecastDate,
  );
}

function predictedLevel(value: JsonValue): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const level = (value as { readonly recommendationLevel?: unknown }).recommendationLevel;
  return typeof level === "string" ? level : undefined;
}

function mismatchReason(
  predictedClass: CalibrationComparison["predictedClass"],
  outcome: ObservedOutcomeRecord,
  classification: CalibrationComparisonClass,
): string | undefined {
  if (classification === "false_positive") {
    if (outcome.whiteoutLevel === "medium" || outcome.whiteoutLevel === "high") {
      return "白墙风险低估";
    }
    if (outcome.rainImpactLevel === "medium" || outcome.rainImpactLevel === "high") {
      return "降水影响低估";
    }
    return predictedClass === "nearby" ? "附近观察信号偏乐观" : "推荐偏乐观";
  }
  if (classification === "false_negative") {
    return "保守规则漏判可拍机会";
  }
  if (classification === "partial_match") {
    return "结果部分命中，窗口或强度仍需校准";
  }
  return undefined;
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
    if (!comparison.mismatchReason) {
      continue;
    }
    counts.set(comparison.mismatchReason, (counts.get(comparison.mismatchReason) ?? 0) + 1);
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
      input.target === "astro" ? "星空受云量影响高估/低估需复核" : "保守规则漏判机会较多",
    );
  }
  if (
    input.target === "glow" &&
    (input.falsePositiveRate >= 0.25 || input.falseNegativeRate >= 0.25)
  ) {
    recommendations.push("朝霞窗口误判较多");
  }
  return recommendations.length > 0 ? recommendations : ["当前样本未显示明显系统性偏差"];
}

function confidenceAdjustmentForStats(stats: CalibrationStatsRecord): number {
  if (stats.falsePositiveRate >= 0.4) {
    return -0.16;
  }
  if (stats.falsePositiveRate >= 0.28) {
    return -0.1;
  }
  if (stats.falseNegativeRate >= 0.35) {
    return -0.04;
  }
  if (stats.hitRate >= 0.75) {
    return 0.04;
  }
  return 0;
}

function cautionNoteForStats(stats: CalibrationStatsRecord): string {
  if (stats.falsePositiveRate >= 0.35) {
    return "历史误报偏高，本次建议谨慎参考。";
  }
  if (stats.falseNegativeRate >= 0.35) {
    return "历史漏报偏多，若已在附近可保留现场观察。";
  }
  if (stats.hitRate >= 0.75) {
    return "历史表现较稳定，可作为辅助信号参考。";
  }
  return "建议结合最新天气和现场观察谨慎参考。";
}

function countClass(
  comparisons: readonly CalibrationComparison[],
  classification: CalibrationComparisonClass,
): number {
  return comparisons.filter((comparison) => comparison.classification === classification).length;
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
