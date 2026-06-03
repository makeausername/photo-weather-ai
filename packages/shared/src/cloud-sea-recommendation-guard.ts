import {
  buildCloudLayerCompletenessContext,
  type CloudLayerCompletenessContext,
} from "./cloud-layer-completeness.js";
import {
  buildCloudSeaCloudBasisConsistencyContext,
  type CloudSeaCloudBasisConsistencyContext,
} from "./cloud-sea-cloud-basis-consistency.js";
import type { CloudSeaPrecipitationSignalContext } from "./cloud-sea-precipitation-signal.js";
import {
  buildCloudSeaWeatherVariableConsistencyContext,
  type CloudSeaWeatherVariableConsistencyContext,
} from "./cloud-sea-weather-variable-consistency.js";
import type {
  CloudSeaAnalysisResult,
  ForecastCalculationResult,
  ForecastMultiSourceAgreementContext,
  ForecastRiskFlag,
} from "./types.js";

export type CloudSeaGuardRecommendationLevel =
  | "do_not_go_special"
  | "backup_only"
  | "observe_if_nearby"
  | "cautious_reference"
  | "recommended_arrangement"
  | "strong_special_trip";

export type CloudSeaGuardTone = "danger" | "muted" | "accent" | "primary";

export type CloudSeaRecommendationGuardInput = {
  readonly cloudSeaScore?: number | null;
  readonly shootabilityScore?: number | null;
  readonly formationScore?: number | null;
  readonly whiteoutRiskScore?: number | null;
  readonly proposedRecommendationLabel?: string | null;
  readonly terrainContext?: {
    readonly shouldDowngradeCloudSeaWording?: boolean;
    readonly isClassicCloudSeaEligible?: boolean;
    readonly terrainClass?: string;
  } | null;
  readonly cloudLayerCompletenessContext?: CloudLayerCompletenessContext | null;
  readonly multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null;
  readonly bestWindow?: {
    readonly startTime?: string;
    readonly endTime?: string;
    readonly label?: string;
  } | null;
  readonly hasWindow?: boolean;
  readonly risks?: readonly Pick<ForecastRiskFlag, "key" | "label" | "level" | "description">[];
  readonly lowCloudSignalSupported?: boolean | null;
  readonly mainTargetZh?: string;
  readonly bestWindowLabelZh?: string;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
  readonly weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext | null;
  readonly precipitationSignalContext?: CloudSeaPrecipitationSignalContext | null;
};

export type CloudSeaRecommendationGuardOutput = {
  readonly finalRecommendationLevel: CloudSeaGuardRecommendationLevel;
  readonly finalRecommendationLabel: string;
  readonly finalRecommendationTone: CloudSeaGuardTone;
  readonly isSpecialTripRecommended: boolean;
  readonly maxAllowedRecommendationStrength: CloudSeaGuardRecommendationLevel;
  readonly recommendationCeiling: CloudSeaGuardRecommendationLevel;
  readonly reasonZh: string;
  readonly actionVerbZh: string;
  readonly departureAdviceZh: string;
  readonly actionPlanLabels: {
    readonly departure: string;
    readonly bestWindowMetric: string;
    readonly mainWindow: string;
  };
  readonly blockedStrongRecommendationReasons: readonly string[];
  readonly consistencyWarnings: readonly string[];
  readonly shouldShowCaution: boolean;
  readonly normalizedWindowRecommendation: {
    readonly metricLabel: string;
    readonly windowLabel: string;
    readonly badgeLabel: string;
    readonly actionSuggestionZh: string;
  };
  readonly normalizedDailyRecommendation: {
    readonly label: string;
    readonly actionSuggestionZh: string;
  };
};

export type CloudSeaRecommendationGuardResultOverrides = {
  readonly cloudSeaScore?: number | null;
  readonly shootabilityScore?: number | null;
  readonly formationScore?: number | null;
  readonly whiteoutRiskScore?: number | null;
  readonly proposedRecommendationLabel?: string | null;
  readonly hasWindow?: boolean;
  readonly bestWindow?: CloudSeaAnalysisResult["bestCloudSeaWindow"] | null;
};

const recommendationRank: Record<CloudSeaGuardRecommendationLevel, number> = {
  do_not_go_special: 0,
  backup_only: 1,
  cautious_reference: 2,
  observe_if_nearby: 3,
  recommended_arrangement: 4,
  strong_special_trip: 5,
};

const mountainTerrainTypes = new Set(["high_mountain", "ridge", "summit", "mountain_platform"]);

export function buildCloudSeaRecommendationGuard(
  input: CloudSeaRecommendationGuardInput,
): CloudSeaRecommendationGuardOutput {
  const score = normalizedDecisionScore(input);
  const hasWindow = input.hasWindow ?? Boolean(input.bestWindow);
  const proposedLevel = proposedRecommendationLevel(input.proposedRecommendationLabel, score);
  const terrainDowngraded = Boolean(input.terrainContext?.shouldDowngradeCloudSeaWording);
  const layerCompleteness = input.cloudLayerCompletenessContext;
  const agreement = input.multiSourceAgreementContext;
  const cloudBasis = input.cloudBasisConsistencyContext;
  const weatherConsistency = input.weatherVariableConsistencyContext;
  const precipitationSignal =
    input.precipitationSignalContext ?? weatherConsistency?.precipitationSignalContext ?? null;
  const blockedStrongRecommendationReasons: string[] = [];
  const consistencyWarnings: string[] = [];

  let ceiling = scoreCeiling(score, hasWindow);

  if (score < 40) {
    blockedStrongRecommendationReasons.push("分数不足，不建议专程");
  }

  if (!hasWindow && score >= 40) {
    ceiling = minRecommendationLevel(ceiling, "backup_only");
    blockedStrongRecommendationReasons.push("暂无明确可执行窗口");
  }

  if (terrainDowngraded) {
    const terrainCeiling = score < 50 ? "do_not_go_special" : "observe_if_nearby";
    ceiling = minRecommendationLevel(ceiling, terrainCeiling);
    blockedStrongRecommendationReasons.push("低海拔地点不按高山云海判断");
  }

  if (
    layerCompleteness &&
    (layerCompleteness.layerCompletenessLevel === "weak" ||
      layerCompleteness.layerCompletenessLevel === "missing")
  ) {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    blockedStrongRecommendationReasons.push("低云分层不足，需复核");
    consistencyWarnings.push("云层分层不足，需临近复核");
  }

  if (layerCompleteness && !layerCompleteness.hasLowCloudLayer) {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    blockedStrongRecommendationReasons.push("低云分层不足，需复核");
    consistencyWarnings.push("缺少低云分层，避免确认云海或白墙结论");
  }

  if (
    cloudBasis?.cloudBasisLevel === "mixed_basis" ||
    cloudBasis?.cloudBasisLevel === "total_only" ||
    (cloudBasis?.cloudBasisLevel === "partial_layers" && cloudBasis.shouldLowerCloudSeaConfidence)
  ) {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    if (cloudBasis.cloudBasisLevel === "mixed_basis") {
      blockedStrongRecommendationReasons.push("云量口径不一致，需临近复核");
      consistencyWarnings.push(cloudBasis.userSummaryZh);
    } else if (cloudBasis.cloudBasisLevel === "total_only") {
      blockedStrongRecommendationReasons.push("低云分层不足，不能强推云海");
      consistencyWarnings.push(cloudBasis.userSummaryZh);
    } else {
      blockedStrongRecommendationReasons.push("分层云量不完整，需临近复核");
      consistencyWarnings.push(cloudBasis.userSummaryZh);
    }
  } else if (cloudBasis?.shouldAvoidStrictLayerInterpretation) {
    consistencyWarnings.push(cloudBasis.userSummaryZh);
  }

  const lowOrPrecipDisagreement = hasHighLowCloudOrPrecipitationDisagreement(agreement);
  if (lowOrPrecipDisagreement) {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    blockedStrongRecommendationReasons.push("多源低云或降水判断分歧较大");
    consistencyWarnings.push("多源低云分歧较大或降水判断分歧较大，需临近复核");
  } else if (hasOnlyMidHighCloudDisagreement(agreement)) {
    consistencyWarnings.push("中高云分歧主要影响霞光和云层纹理，不单独下调云海判断");
  }

  if (input.lowCloudSignalSupported === false) {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    blockedStrongRecommendationReasons.push("低云信号不足");
  }

  if (weatherConsistency?.consistencyLevel === "conflict") {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    blockedStrongRecommendationReasons.push("关键天气变量存在冲突，需临近复核");
    consistencyWarnings.push(weatherConsistency.userSummaryZh);
  } else if (weatherConsistency?.shouldAvoidStrongWording) {
    consistencyWarnings.push(weatherConsistency.userSummaryZh);
  }

  if (weatherConsistency?.shouldDowngradePrecipitationWording) {
    consistencyWarnings.push(
      precipitationSignal?.userSummaryZh ?? "降水概率和雨量需分开解读，避免按强降水直接处理",
    );
  }

  if (precipitationSignal) {
    if (
      precipitationSignal.shouldDowngradeWindow &&
      precipitationSignal.precipitationSignalType === "sustained_rain"
    ) {
      ceiling = minRecommendationLevel(ceiling, "backup_only");
      blockedStrongRecommendationReasons.push("主窗口受明显降水影响，需优先评估通行和安全");
      consistencyWarnings.push(precipitationSignal.userSummaryZh);
    } else if (
      precipitationSignal.shouldDowngradeWindow &&
      precipitationSignal.precipitationSignalType === "meaningful_rain"
    ) {
      ceiling = minRecommendationLevel(ceiling, "cautious_reference");
      blockedStrongRecommendationReasons.push("主窗口受降水影响，建议转为备选");
      consistencyWarnings.push(precipitationSignal.userSummaryZh);
    } else if (
      precipitationSignal.precipitationSignalType !== "none" &&
      precipitationSignal.precipitationSignalType !== "unknown"
    ) {
      consistencyWarnings.push(precipitationSignal.userSummaryZh);
    }
  }

  if ((input.whiteoutRiskScore ?? 0) >= 70) {
    ceiling = minRecommendationLevel(ceiling, "cautious_reference");
    blockedStrongRecommendationReasons.push("白墙或低云遮挡风险偏高");
  }

  if (hasHighBlockingRisk(input.risks)) {
    ceiling = minRecommendationLevel(ceiling, "recommended_arrangement");
    blockedStrongRecommendationReasons.push("存在高等级阻断风险");
  }

  const finalLevel = minRecommendationLevel(proposedLevel, ceiling);
  const finalRecommendationLabel = labelForLevel(finalLevel, {
    score,
    terrainDowngraded,
  });
  const normalizedWindowRecommendation = normalizedWindowCopy({
    finalLevel,
    finalRecommendationLabel,
    score,
    terrainDowngraded,
    layerCompleteness,
    bestWindowLabelZh: input.bestWindowLabelZh,
  });
  const departureAdviceZh = departureAdviceForLevel(finalLevel, {
    mainTargetZh: input.mainTargetZh,
    windowLabelZh:
      input.bestWindowLabelZh ??
      input.bestWindow?.label ??
      normalizedWindowRecommendation.windowLabel,
  });

  return {
    finalRecommendationLevel: finalLevel,
    finalRecommendationLabel,
    finalRecommendationTone: toneForLevel(finalLevel),
    isSpecialTripRecommended:
      finalLevel === "recommended_arrangement" || finalLevel === "strong_special_trip",
    maxAllowedRecommendationStrength: ceiling,
    recommendationCeiling: ceiling,
    reasonZh: reasonForFinalLevel(
      finalLevel,
      blockedStrongRecommendationReasons,
      terrainDowngraded,
    ),
    actionVerbZh: finalRecommendationLabel,
    departureAdviceZh,
    actionPlanLabels: {
      departure: finalRecommendationLabel,
      bestWindowMetric: normalizedWindowRecommendation.metricLabel,
      mainWindow: normalizedWindowRecommendation.windowLabel,
    },
    blockedStrongRecommendationReasons: uniqueText(blockedStrongRecommendationReasons),
    consistencyWarnings: uniqueText(consistencyWarnings),
    shouldShowCaution:
      finalLevel === "do_not_go_special" ||
      finalLevel === "backup_only" ||
      finalLevel === "cautious_reference" ||
      blockedStrongRecommendationReasons.length > 0 ||
      consistencyWarnings.length > 0,
    normalizedWindowRecommendation,
    normalizedDailyRecommendation: {
      label: finalRecommendationLabel,
      actionSuggestionZh: dailyActionForLevel(finalLevel, terrainDowngraded),
    },
  };
}

export function buildCloudSeaRecommendationGuardForResult(
  result: ForecastCalculationResult,
  overrides: CloudSeaRecommendationGuardResultOverrides = {},
): CloudSeaRecommendationGuardOutput {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow =
    overrides.bestWindow === null
      ? undefined
      : overrides.bestWindow ??
        analysis.bestCloudSeaWindow ??
        analysis.bestCloudSeaWindows[0] ??
        analysis.watchableCloudSeaWindows[0];
  const cloudLayerCompletenessContext = buildCloudLayerCompletenessContext(
    result.professionalHourlyData,
  );
  const multiSourceAgreementContext =
    result.weatherFusionSummary?.multiSourceAgreementContext ?? null;
  const weatherVariableConsistencyContext = buildCloudSeaWeatherVariableConsistencyContext({
    elevationMeters:
      result.terrainAnalysis.terrainProfile.locationElevation ??
      result.terrainAnalysis.terrainProfile.elevationMeters ??
      result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
    surroundingReliefMeters:
      result.terrainAnalysis.terrainProfile.localReliefMeters ??
      result.terrainAnalysis.terrainProfile.elevationDiff5km ??
      result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
    terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
    terrainType:
      result.terrainAnalysis.terrainProfile.terrainType ??
      result.cloudSeaAnalysis.terrainSupport.terrainType,
    hourlyRows: result.professionalHourlyData,
    focusedWindow: bestWindow
      ? {
          startTime: bestWindow.startTime,
          endTime: bestWindow.endTime,
        }
      : null,
    cloudLayerCompletenessContext,
    multiSourceAgreementContext,
  });
  const cloudBasisConsistencyContext = buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: result.professionalHourlyData,
    cloudLayerCompletenessContext,
    focusedWindow: bestWindow
      ? {
          startTime: bestWindow.startTime,
          endTime: bestWindow.endTime,
        }
      : null,
  });

  return buildCloudSeaRecommendationGuard({
    cloudSeaScore: overrides.cloudSeaScore ?? result.scores.cloudSea.score,
    shootabilityScore: overrides.shootabilityScore ?? analysis.shootableScore,
    formationScore: overrides.formationScore ?? analysis.formationScore,
    whiteoutRiskScore: overrides.whiteoutRiskScore ?? analysis.whiteoutRiskScore,
    proposedRecommendationLabel:
      overrides.proposedRecommendationLabel ?? analysis.recommendationLabel,
    terrainContext: {
      shouldDowngradeCloudSeaWording: shouldDowngradeCloudSeaWordingForResult(result),
      isClassicCloudSeaEligible: isClassicCloudSeaEligibleForResult(result),
      terrainClass: analysis.terrainSupport.terrainMode,
    },
    cloudLayerCompletenessContext,
    multiSourceAgreementContext,
    cloudBasisConsistencyContext,
    weatherVariableConsistencyContext,
    bestWindow,
    hasWindow: overrides.hasWindow ?? Boolean(bestWindow),
    risks: result.riskFlags,
    lowCloudSignalSupported:
      cloudLayerCompletenessContext.hasLowCloudLayer &&
      (overrides.formationScore ?? analysis.formationScore) >= 55,
    mainTargetZh: "清晨云海",
    bestWindowLabelZh: bestWindow?.label,
  });
}

function normalizedDecisionScore(input: CloudSeaRecommendationGuardInput): number {
  const scores = [input.cloudSeaScore, input.shootabilityScore]
    .map((value) => finiteNumber(value))
    .filter((value): value is number => value !== undefined);
  if (scores.length === 0) {
    return 0;
  }
  return clampScore(Math.min(...scores));
}

function proposedRecommendationLevel(
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
  if (text.includes("推荐重点关注")) {
    return score >= 80 ? "strong_special_trip" : "recommended_arrangement";
  }
  if (text.includes("值得等待") || text.includes("推荐安排") || text.includes("推荐")) {
    return "recommended_arrangement";
  }
  return scoreCeiling(score, true);
}

function scoreCeiling(score: number, hasWindow: boolean): CloudSeaGuardRecommendationLevel {
  if (score < 40) {
    return "do_not_go_special";
  }
  if (score < 50 || !hasWindow) {
    return "backup_only";
  }
  if (score < 55) {
    return "cautious_reference";
  }
  if (score < 70) {
    return "recommended_arrangement";
  }
  return "strong_special_trip";
}

function minRecommendationLevel(
  left: CloudSeaGuardRecommendationLevel,
  right: CloudSeaGuardRecommendationLevel,
): CloudSeaGuardRecommendationLevel {
  return recommendationRank[left] <= recommendationRank[right] ? left : right;
}

function labelForLevel(
  level: CloudSeaGuardRecommendationLevel,
  context: { readonly score: number; readonly terrainDowngraded: boolean },
): string {
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
    if (context.terrainDowngraded) {
      return context.score >= 70 ? "推荐观察" : "顺带观察";
    }
    return "已在附近可观察";
  }
  if (level === "recommended_arrangement") {
    return "推荐安排";
  }
  return "强推荐专程";
}

function toneForLevel(level: CloudSeaGuardRecommendationLevel): CloudSeaGuardTone {
  if (level === "do_not_go_special") {
    return "danger";
  }
  if (level === "backup_only") {
    return "muted";
  }
  if (level === "cautious_reference" || level === "observe_if_nearby") {
    return "accent";
  }
  return "primary";
}

function normalizedWindowCopy(input: {
  readonly finalLevel: CloudSeaGuardRecommendationLevel;
  readonly finalRecommendationLabel: string;
  readonly score: number;
  readonly terrainDowngraded: boolean;
  readonly layerCompleteness?: CloudLayerCompletenessContext | null;
  readonly bestWindowLabelZh?: string;
}): CloudSeaRecommendationGuardOutput["normalizedWindowRecommendation"] {
  const weakLayer =
    input.layerCompleteness?.layerCompletenessLevel === "weak" ||
    input.layerCompleteness?.layerCompletenessLevel === "missing";
  const metricLabel =
    input.score < 40 || input.finalLevel === "do_not_go_special"
      ? "备选观察窗口"
      : input.terrainDowngraded
        ? "低云/晨雾参考窗口"
        : weakLayer
          ? "云层变化参考窗口"
          : "最佳云海窗口";
  const windowLabel =
    input.bestWindowLabelZh &&
    !shouldAvoidBestCloudSeaWindowLabel(input.finalLevel, input.score, input.terrainDowngraded)
      ? input.bestWindowLabelZh
      : safeWindowReferenceLabel(metricLabel, input.bestWindowLabelZh);

  return {
    metricLabel,
    windowLabel,
    badgeLabel: input.finalRecommendationLabel,
    actionSuggestionZh: windowActionForLevel(input.finalLevel, input.terrainDowngraded),
  };
}

function safeWindowReferenceLabel(metricLabel: string, sourceLabel: string | undefined): string {
  if (!sourceLabel) {
    return metricLabel;
  }
  const timeMatch = sourceLabel.match(/(\d{1,2}:\d{2}\s*(?:-|–|至)\s*\d{1,2}:\d{2})/);
  return timeMatch?.[1] ? `${metricLabel} ${timeMatch[1]}` : metricLabel;
}

function shouldAvoidBestCloudSeaWindowLabel(
  level: CloudSeaGuardRecommendationLevel,
  score: number,
  terrainDowngraded: boolean,
): boolean {
  return (
    score < 55 ||
    terrainDowngraded ||
    level === "do_not_go_special" ||
    level === "backup_only" ||
    level === "cautious_reference"
  );
}

function departureAdviceForLevel(
  level: CloudSeaGuardRecommendationLevel,
  context: { readonly mainTargetZh?: string; readonly windowLabelZh?: string },
): string {
  if (level === "do_not_go_special") {
    return "当前云海证据不足，建议作为备选观察或等待下一次预报更新。";
  }
  if (level === "backup_only") {
    return "若已在附近可顺带观察，不建议专程前往。";
  }
  if (level === "cautious_reference" || level === "observe_if_nearby") {
    return "若已在附近可短时观察，专程前往前需等待更确定的低云和能见度信号。";
  }
  if (level === "recommended_arrangement") {
    return "可按主窗口安排，但出发前仍需复核临近预报和现场条件。";
  }
  return `可围绕${context.mainTargetZh ?? "清晨云海"}和${
    context.windowLabelZh ?? "主窗口"
  }计划专程，出发前仍需复核临近预报和现场条件。`;
}

function dailyActionForLevel(
  level: CloudSeaGuardRecommendationLevel,
  terrainDowngraded: boolean,
): string {
  if (level === "do_not_go_special") {
    return "当前证据不足，不建议专程，等待下一次预报更新。";
  }
  if (level === "backup_only") {
    return "仅作顺路备选观察，不建议为单一窗口专程前往。";
  }
  if (level === "cautious_reference") {
    return "谨慎参考，出发前复核低云分层、能见度和降水。";
  }
  if (level === "observe_if_nearby") {
    return terrainDowngraded
      ? "可顺带观察低云、晨雾和通透度，不按高山云海专程安排。"
      : "已在附近可短时观察，专程前往仍需更强证据。";
  }
  if (level === "recommended_arrangement") {
    return "可按主窗口安排，但出发前仍需复核临近预报和现场条件。";
  }
  return "强推荐专程仅在地形、低云分层、窗口和风险都通过时使用。";
}

function windowActionForLevel(
  level: CloudSeaGuardRecommendationLevel,
  terrainDowngraded: boolean,
): string {
  if (level === "do_not_go_special") {
    return "不建议专程等待该窗口，可作为备选观察或等待下一次预报更新。";
  }
  if (level === "backup_only") {
    return "仅作备选窗口，若已在附近可短时观察。";
  }
  if (level === "cautious_reference") {
    return "谨慎参考，重点复核低云分层、能见度和降水。";
  }
  if (level === "observe_if_nearby") {
    return terrainDowngraded
      ? "可顺带观察低云、晨雾、云层开口和通透度。"
      : "已在附近可观察，不建议只凭该窗口远途专程。";
  }
  if (level === "recommended_arrangement") {
    return "可按主窗口安排，但出发前仍需复核临近预报和现场条件。";
  }
  return "可作为专程主窗口，但出发前仍需复核低云高度、能见度和降水。";
}

function reasonForFinalLevel(
  level: CloudSeaGuardRecommendationLevel,
  blockedReasons: readonly string[],
  terrainDowngraded: boolean,
): string {
  if (blockedReasons.length > 0) {
    return uniqueText(blockedReasons).slice(0, 2).join("；");
  }
  if (level === "strong_special_trip") {
    return "地形、低云分层、主窗口和风险条件支持专程计划。";
  }
  if (level === "recommended_arrangement") {
    return "主窗口具备安排价值，仍需出发前复核临近预报。";
  }
  if (terrainDowngraded) {
    return "低海拔地点按低云、晨雾和通透观察处理。";
  }
  return "当前建议按保守等级执行。";
}

function hasHighLowCloudOrPrecipitationDisagreement(
  context: ForecastMultiSourceAgreementContext | null | undefined,
): boolean {
  if (!context || context.disagreementLevel !== "high") {
    return false;
  }
  return context.fieldDisagreements.some((item) => {
    if (item.level !== "high") {
      return false;
    }
    const text = `${item.field} ${item.messageZh}`.toLowerCase();
    return (
      text.includes("cloudlow") ||
      text.includes("lowcloud") ||
      text.includes("低云") ||
      text.includes("precip") ||
      text.includes("rain") ||
      text.includes("降水")
    );
  });
}

function hasOnlyMidHighCloudDisagreement(
  context: ForecastMultiSourceAgreementContext | null | undefined,
): boolean {
  if (!context || context.fieldDisagreements.length === 0) {
    return false;
  }
  if (hasHighLowCloudOrPrecipitationDisagreement(context)) {
    return false;
  }
  return context.fieldDisagreements.some((item) => {
    const text = `${item.field} ${item.messageZh}`.toLowerCase();
    return (
      text.includes("cloudmid") ||
      text.includes("cloudhigh") ||
      text.includes("中云") ||
      text.includes("高云")
    );
  });
}

function hasHighBlockingRisk(
  risks: readonly Pick<ForecastRiskFlag, "key" | "label" | "level" | "description">[] | undefined,
): boolean {
  return Boolean(
    risks?.some((risk) => {
      if (risk.level !== "high") {
        return false;
      }
      const text = `${risk.key} ${risk.label} ${risk.description}`;
      return /降水|雨|雷|白墙|低云|强风|大风|wind|rain|precip|whiteout/i.test(text);
    }),
  );
}

function shouldDowngradeCloudSeaWordingForResult(result: ForecastCalculationResult): boolean {
  return !isClassicCloudSeaEligibleForResult(result) && isLowElevationLikeResult(result);
}

function isClassicCloudSeaEligibleForResult(result: ForecastCalculationResult): boolean {
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;
  const elevation =
    finiteNumber(profile.locationElevation) ??
    finiteNumber(profile.elevationMeters) ??
    finiteNumber(support.selectedSpotElevationMeters);
  const relief =
    finiteNumber(profile.localReliefMeters) ??
    finiteNumber(profile.elevationDiff5km) ??
    finiteNumber(support.localReliefMeters);
  const terrainType = String(profile.terrainType ?? support.terrainType ?? "");

  return (
    (elevation !== undefined && elevation >= 800) ||
    (relief !== undefined && relief >= 500) ||
    mountainTerrainTypes.has(terrainType)
  );
}

function isLowElevationLikeResult(result: ForecastCalculationResult): boolean {
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;
  const elevation =
    finiteNumber(profile.locationElevation) ??
    finiteNumber(profile.elevationMeters) ??
    finiteNumber(support.selectedSpotElevationMeters);
  const relief =
    finiteNumber(profile.localReliefMeters) ??
    finiteNumber(profile.elevationDiff5km) ??
    finiteNumber(support.localReliefMeters);
  return (
    support.terrainMode === "lowland" ||
    support.terrainMode === "urban_or_plain" ||
    support.terrainMode === "unknown" ||
    (elevation !== undefined && elevation < 500 && (relief === undefined || relief < 300))
  );
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueText(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
