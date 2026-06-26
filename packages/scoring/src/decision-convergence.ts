import {
  forecastRecommendationLabels,
  type AstroAnalysisResult,
  type CloudSeaAnalysisResult,
  type ForecastCalculationInput,
  type ForecastDecisionConvergenceResult,
  type ForecastDecisionMode,
  type ForecastRecommendationLevel,
  type ForecastRiskFlag,
  type ForecastScoreSet,
  type ForecastTarget,
  type ForecastTimeWindow,
  type GlowAnalysisResult,
  type TerrainHorizonAssessment,
  type TerrainHorizonDirectionSample,
} from "@photo-weather/shared";
import { terrainHorizonAssessmentHasDeterministicClearance } from "@photo-weather/terrain";
import { clampScore } from "./helpers.js";

export type ForecastDecisionConvergenceInput = {
  readonly input: ForecastCalculationInput;
  readonly target: ForecastTarget;
  readonly baseOverallScore: number;
  readonly baseRecommendationLevel: ForecastRecommendationLevel;
  readonly baseRecommendationLabel: string;
  readonly scores: ForecastScoreSet;
  readonly cloudSeaAnalysis: CloudSeaAnalysisResult;
  readonly glowAnalysis: GlowAnalysisResult;
  readonly astroAnalysis: AstroAnalysisResult;
  readonly riskFlags: readonly ForecastRiskFlag[];
  readonly bestWindows: readonly ForecastTimeWindow[];
};

type TerrainStatus = "clear" | "marginal" | "obstructed" | "unavailable";

type DecisionCap = {
  readonly key: string;
  readonly maxScore: number;
  readonly reasonZh: string;
  readonly mode?: ForecastDecisionMode;
  readonly confidenceFloor?: "low" | "medium";
};

const publicDecisionLabelByMode: Record<ForecastDecisionMode, string> = {
  strong_go: "建议专程前往",
  nearby_watch: "可附近观察",
  wait_for_update: "建议临近复核",
  not_recommended: "暂不建议专程",
  data_insufficient: "数据不足，暂不建议按强机会安排",
};

const capPriority: Record<ForecastDecisionMode, number> = {
  strong_go: 0,
  nearby_watch: 1,
  wait_for_update: 2,
  not_recommended: 3,
  data_insufficient: 4,
};

export function convergeForecastDecision(
  options: ForecastDecisionConvergenceInput,
): ForecastDecisionConvergenceResult {
  const {
    input,
    target,
    baseOverallScore,
    baseRecommendationLevel,
    baseRecommendationLabel,
    scores,
    cloudSeaAnalysis,
    glowAnalysis,
    astroAnalysis,
    riskFlags,
    bestWindows,
  } = options;
  const caps: DecisionCap[] = [];
  const riskReasonsZh: string[] = [];
  const uncertaintyReasonsZh: string[] = [];
  const positiveReasonsZh = buildPositiveReasons(options);
  const targetConfidence = targetDecisionConfidenceScore(input, target);
  const highDisagreement = hasHighModelDisagreement(input, target);
  const lowConfidence = targetConfidence < 0.55;
  const transparencyPenalty = targetTransparencyPenalty(input, target);
  const precipitationWindCap = precipitationWindDecisionCap(riskFlags);
  const windowIsDistant = firstWindowHoursFromGeneration(input, bestWindows) >= 48;

  if (!hasValidCoordinates(input)) {
    addCap(caps, riskReasonsZh, {
      key: "invalid_coordinates",
      maxScore: 35,
      mode: "data_insufficient",
      confidenceFloor: "low",
      reasonZh: "坐标缺失或无效，依赖位置的判断不能按强机会安排。",
    });
  }
  if (input.hourlyWeather.length === 0) {
    addCap(caps, uncertaintyReasonsZh, {
      key: "missing_weather",
      maxScore: 38,
      mode: "data_insufficient",
      confidenceFloor: "low",
      reasonZh: "关键天气时段缺少可用数据，暂不按强推荐处理。",
    });
  }
  if ((target === "glow" || target === "astro") && input.astroSummaries.length === 0) {
    addCap(caps, uncertaintyReasonsZh, {
      key: "missing_astronomy",
      maxScore: 42,
      mode: "data_insufficient",
      confidenceFloor: "low",
      reasonZh: "缺少关键天文窗口，暂不按强机会安排。",
    });
  }

  if (precipitationWindCap) {
    addCap(caps, riskReasonsZh, precipitationWindCap);
  }

  if (transparencyPenalty >= 0.16 && (target === "glow" || target === "astro" || target === "general")) {
    addCap(caps, riskReasonsZh, {
      key: "transparency",
      maxScore: 62,
      mode: "nearby_watch",
      confidenceFloor: "medium",
      reasonZh: "透明度偏弱，霞光或星空细节不宜按强机会安排。",
    });
  } else if (transparencyPenalty >= 0.08 && (target === "glow" || target === "astro")) {
    addCap(caps, riskReasonsZh, {
      key: "transparency",
      maxScore: 72,
      mode: "nearby_watch",
      reasonZh: "透明度存在扣分，适合临近复核后再决定。",
    });
  }

  if (highDisagreement && lowConfidence) {
    addCap(caps, uncertaintyReasonsZh, {
      key: "multi_model",
      maxScore: windowIsDistant ? 58 : 64,
      mode: windowIsDistant ? "wait_for_update" : "nearby_watch",
      confidenceFloor: "low",
      reasonZh: "多模型分歧较大且置信度偏低，暂不按强推荐处理。",
    });
  } else if (highDisagreement) {
    addCap(caps, uncertaintyReasonsZh, {
      key: "multi_model",
      maxScore: 72,
      mode: windowIsDistant ? "wait_for_update" : "nearby_watch",
      confidenceFloor: "medium",
      reasonZh: "多模型分歧较大，需要临近预报复核。",
    });
  } else if (lowConfidence) {
    addCap(caps, uncertaintyReasonsZh, {
      key: "low_confidence",
      maxScore: 64,
      mode: "wait_for_update",
      confidenceFloor: "low",
      reasonZh: "数据置信度偏低，公开建议不应强推荐。",
    });
  }

  applyTargetSpecificCaps({
    target,
    input,
    cloudSeaAnalysis,
    glowAnalysis,
    astroAnalysis,
    caps,
    riskReasonsZh,
    uncertaintyReasonsZh,
  });

  if (target === "general") {
    applyGeneralBalancingCaps({
      scores,
      cloudSeaAnalysis,
      glowAnalysis,
      astroAnalysis,
      caps,
      riskReasonsZh,
    });
  }

  const capScore = caps.reduce((current, cap) => Math.min(current, cap.maxScore), 100);
  const riskPenalty = aggregateSoftPenalty({
    targetConfidence,
    transparencyPenalty,
    highDisagreement,
    riskFlags,
  });
  const finalScore = clampScore(Math.min(baseOverallScore - riskPenalty, capScore));
  const forcedMode = strongestMode(caps);
  const finalRecommendationLevel = finalLevelForDecision({
    finalScore,
    baseRecommendationLevel,
    forcedMode,
  });
  const decisionMode = finalModeForDecision({
    finalScore,
    finalRecommendationLevel,
    forcedMode,
    caps,
    baseRecommendationLevel,
  });
  const decisionConfidence = finalDecisionConfidence({
    targetConfidence,
    caps,
    highDisagreement,
    lowConfidence,
  });
  const finalRecommendationLabel = labelForFinalLevel(finalRecommendationLevel, decisionMode);
  const finalTripDecisionLabel = publicDecisionLabelByMode[decisionMode];
  const capReasonsZh = uniqueStrings(caps.map((cap) => cap.reasonZh));
  const finalRiskReasons = uniqueStrings([
    ...riskReasonsZh,
    ...caps
      .filter((cap) => cap.mode === "not_recommended" || cap.maxScore <= 54)
      .map((cap) => cap.reasonZh),
  ]);
  const finalUncertaintyReasons = uniqueStrings([
    ...uncertaintyReasonsZh,
    ...caps
      .filter((cap) => cap.confidenceFloor === "low" || cap.mode === "wait_for_update")
      .map((cap) => cap.reasonZh),
  ]);
  const publicDecisionTags = buildPublicDecisionTags({
    decisionMode,
    decisionConfidence,
    caps,
    riskReasonsZh: finalRiskReasons,
  });

  return {
    finalScore,
    finalRecommendationLevel,
    finalRecommendationLabel,
    finalTripDecisionLabel,
    finalDecisionSummaryZh: buildFinalDecisionSummary({
      finalTripDecisionLabel,
      decisionMode,
      positiveReasonsZh,
      riskReasonsZh: finalRiskReasons,
      uncertaintyReasonsZh: finalUncertaintyReasons,
      baseRecommendationLabel,
      finalRecommendationLabel,
    }),
    decisionConfidence,
    decisionMode,
    capReasonsZh,
    positiveReasonsZh,
    riskReasonsZh: finalRiskReasons,
    uncertaintyReasonsZh: finalUncertaintyReasons,
    appliedCaps: uniqueStrings(caps.map((cap) => cap.key)),
    publicDecisionTags,
  };
}

function applyTargetSpecificCaps(options: {
  readonly target: ForecastTarget;
  readonly input: ForecastCalculationInput;
  readonly cloudSeaAnalysis: CloudSeaAnalysisResult;
  readonly glowAnalysis: GlowAnalysisResult;
  readonly astroAnalysis: AstroAnalysisResult;
  readonly caps: DecisionCap[];
  readonly riskReasonsZh: string[];
  readonly uncertaintyReasonsZh: string[];
}): void {
  const {
    target,
    input,
    cloudSeaAnalysis,
    glowAnalysis,
    astroAnalysis,
    caps,
    riskReasonsZh,
    uncertaintyReasonsZh,
  } = options;

  if (target === "cloud_sea") {
    if (
      cloudSeaAnalysis.whiteoutRiskScore >= 76 ||
      cloudSeaAnalysis.scoreCalibration.shouldBlockStrongRecommendation
    ) {
      addCap(caps, riskReasonsZh, {
        key: "cloud_sea_whiteout",
        maxScore: cloudSeaAnalysis.whiteoutRiskScore >= 82 ? 46 : 54,
        mode: cloudSeaAnalysis.whiteoutRiskScore >= 82 ? "not_recommended" : "nearby_watch",
        reasonZh: "白墙或安全风险偏高，云海形成信号不能直接转成专程推荐。",
      });
    }
    if (cloudSeaAnalysis.confidenceLevel === "low") {
      addCap(caps, uncertaintyReasonsZh, {
        key: "cloud_sea_confidence",
        maxScore: 64,
        mode: "wait_for_update",
        confidenceFloor: "low",
        reasonZh: "云海关键字段置信度偏低，需要临近复核。",
      });
    }
    return;
  }

  if (target === "glow") {
    applyGlowCaps({ input, glowAnalysis, caps, riskReasonsZh, uncertaintyReasonsZh });
    return;
  }

  if (target === "astro") {
    applyAstroCaps({ input, astroAnalysis, caps, riskReasonsZh, uncertaintyReasonsZh });
  }
}

function applyGlowCaps(options: {
  readonly input: ForecastCalculationInput;
  readonly glowAnalysis: GlowAnalysisResult;
  readonly caps: DecisionCap[];
  readonly riskReasonsZh: string[];
  readonly uncertaintyReasonsZh: string[];
}): void {
  const { input, glowAnalysis, caps, riskReasonsZh, uncertaintyReasonsZh } = options;
  const sunriseStatus = glowTerrainStatus(input, "sunrise");
  const sunsetStatus = glowTerrainStatus(input, "sunset");
  const terrainUnavailable = sunriseStatus === "unavailable" && sunsetStatus === "unavailable";
  const bothBlocked =
    isTerrainBlocking(sunriseStatus) &&
    isTerrainBlocking(sunsetStatus) &&
    (sunriseStatus === "obstructed" || sunsetStatus === "obstructed");
  const marginalWithRisk =
    (sunriseStatus === "marginal" || sunsetStatus === "marginal") &&
    Math.max(
      glowAnalysis.lowCloudObstructionRisk,
      glowAnalysis.cloudSuppressionRisk,
      glowAnalysis.precipitationDisruptionRisk,
    ) >= 55;

  if (terrainUnavailable || glowAnalysis.glowLightPathDataAvailability === "insufficient") {
    addCap(caps, uncertaintyReasonsZh, {
      key: "terrain_unavailable",
      maxScore: 58,
      mode: "data_insufficient",
      confidenceFloor: "low",
      reasonZh: "霞光方向缺少可用地形光路判断，不能当作无遮挡处理。",
    });
  }

  if (bothBlocked || glowAnalysis.glowLightPathObstructionRisk >= 76) {
    addCap(caps, riskReasonsZh, {
      key: "glow_light_path",
      maxScore: bothBlocked ? 48 : 62,
      mode: bothBlocked ? "not_recommended" : "nearby_watch",
      reasonZh: glowPhaseTerrainReason(sunriseStatus, sunsetStatus),
    });
  } else if (marginalWithRisk) {
    addCap(caps, riskReasonsZh, {
      key: "glow_light_path_marginal",
      maxScore: 64,
      mode: "nearby_watch",
      reasonZh: "霞光光路接近临界且存在其他风险，适合附近观察或临近复核。",
    });
  }

  if (glowAnalysis.lowCloudObstructionRisk >= 76) {
    addCap(caps, riskReasonsZh, {
      key: "glow_low_cloud",
      maxScore: 54,
      mode: "not_recommended",
      reasonZh: "低云或雾墙遮挡风险偏高，霞光窗口不宜按专程强机会安排。",
    });
  }
  if (glowAnalysis.cloudSuppressionRisk >= 76) {
    addCap(caps, riskReasonsZh, {
      key: "glow_cloud_suppression",
      maxScore: 58,
      mode: "nearby_watch",
      reasonZh: "云层压制风险偏高，即使有云载体也需要保守处理。",
    });
  }
  if (glowAnalysis.precipitationDisruptionRisk >= 75) {
    addCap(caps, riskReasonsZh, {
      key: "precipitation_wind",
      maxScore: 50,
      mode: "not_recommended",
      reasonZh: "关键霞光窗口存在明显降水干扰，拍摄稳定性不足。",
    });
  }
}

function applyAstroCaps(options: {
  readonly input: ForecastCalculationInput;
  readonly astroAnalysis: AstroAnalysisResult;
  readonly caps: DecisionCap[];
  readonly riskReasonsZh: string[];
  readonly uncertaintyReasonsZh: string[];
}): void {
  const { astroAnalysis, caps, riskReasonsZh, uncertaintyReasonsZh } = options;
  const terrainStatus = astroTerrainStatus(astroAnalysis.terrainHorizonAssessment);
  const targetLightPollutionRisk = astroAnalysis.targetDirectionLightPollution?.riskIndex ?? null;
  const ambientLightPollutionRisk = astroAnalysis.lightPollution.ambientRiskIndex ?? null;
  const severeLightPollution =
    (typeof targetLightPollutionRisk === "number" && targetLightPollutionRisk >= 80) ||
    (typeof ambientLightPollutionRisk === "number" && ambientLightPollutionRisk >= 85) ||
    astroAnalysis.targetDirectionLightPollution?.riskLevel === "very_high" ||
    astroAnalysis.lightPollution.ambientRiskLevel === "very_high";

  if (terrainStatus === "unavailable") {
    addCap(caps, uncertaintyReasonsZh, {
      key: "terrain_unavailable",
      maxScore: 58,
      mode: "data_insufficient",
      confidenceFloor: "low",
      reasonZh: "银河方向缺少可用地形视野判断，不能当作无遮挡处理。",
    });
  } else if (terrainStatus === "obstructed") {
    addCap(caps, riskReasonsZh, {
      key: "astro_terrain",
      maxScore: 48,
      mode: "not_recommended",
      reasonZh: "银河方向存在地形遮挡，即使天气较好也不宜按专程推荐。",
    });
  } else if (terrainStatus === "marginal") {
    addCap(caps, riskReasonsZh, {
      key: "astro_terrain_marginal",
      maxScore: 64,
      mode: "nearby_watch",
      reasonZh: "银河方向接近地形遮挡临界，构图前需要现场复核。",
    });
  }

  if (severeLightPollution) {
    addCap(caps, riskReasonsZh, {
      key: "astro_light_pollution",
      maxScore: 58,
      mode: "nearby_watch",
      reasonZh: "光污染风险偏高，银河细节不宜按强机会安排。",
    });
  }
  if (!astroAnalysis.astroShootable || astroAnalysis.cloudBlockerLevel === "high") {
    addCap(caps, riskReasonsZh, {
      key: "astro_weather",
      maxScore: 48,
      mode: "not_recommended",
      reasonZh: "夜间云量、低云或降水阻断星空银河拍摄。",
    });
  }
  if (astroAnalysis.moonlightImpactScore >= 75) {
    addCap(caps, riskReasonsZh, {
      key: "astro_moon",
      maxScore: 62,
      mode: "nearby_watch",
      reasonZh: "月光影响偏强，暗弱银河细节需要保守评估。",
    });
  }
}

function applyGeneralBalancingCaps(options: {
  readonly scores: ForecastScoreSet;
  readonly cloudSeaAnalysis: CloudSeaAnalysisResult;
  readonly glowAnalysis: GlowAnalysisResult;
  readonly astroAnalysis: AstroAnalysisResult;
  readonly caps: DecisionCap[];
  readonly riskReasonsZh: string[];
}): void {
  const { scores, cloudSeaAnalysis, glowAnalysis, astroAnalysis, caps, riskReasonsZh } = options;
  const targetOpportunities = [
    cloudSeaAnalysis.travelScore,
    glowAnalysis.glowTravelScore,
    astroAnalysis.astroTravelScore,
    scores.transparency.score,
  ];
  const strongestOpportunity = Math.max(...targetOpportunities, 0);
  const severeTargetRisks = [
    cloudSeaAnalysis.whiteoutRiskScore >= 76,
    glowAnalysis.glowLightPathObstructionRisk >= 76 ||
      glowAnalysis.lowCloudObstructionRisk >= 76 ||
      glowAnalysis.cloudSuppressionRisk >= 76,
    !astroAnalysis.astroShootable || astroAnalysis.cloudBlockerLevel === "high",
  ].filter(Boolean).length;

  if (strongestOpportunity < 50) {
    addCap(caps, riskReasonsZh, {
      key: "low_opportunity",
      maxScore: 44,
      mode: "not_recommended",
      reasonZh: "主要题材都缺少可执行窗口，暂不建议专程。",
    });
  } else if (strongestOpportunity >= 70 && severeTargetRisks > 0) {
    addCap(caps, riskReasonsZh, {
      key: "mixed_target_risk",
      maxScore: 64,
      mode: "nearby_watch",
      reasonZh: "部分题材有机会，但另有关键题材风险较高，综合建议需要平衡。",
    });
  }
}

function precipitationWindDecisionCap(riskFlags: readonly ForecastRiskFlag[]): DecisionCap | null {
  const highPrecipitation = riskFlags.some(
    (flag) => flag.key === "precipitation" && flag.level === "high",
  );
  const highWind = riskFlags.some((flag) => flag.key === "wind" && flag.level === "high");

  if (!highPrecipitation && !highWind) {
    return null;
  }

  return {
    key: "precipitation_wind",
    maxScore: highPrecipitation && highWind ? 46 : 54,
    mode: highPrecipitation && highWind ? "not_recommended" : "nearby_watch",
    reasonZh: highPrecipitation
      ? "关键窗口存在较高降水风险，器材防护和通行稳定性不足。"
      : "关键窗口风力偏强，三脚架稳定性和人员站位需要保守处理。",
  };
}

function buildPositiveReasons(options: ForecastDecisionConvergenceInput): readonly string[] {
  const { target, scores, cloudSeaAnalysis, glowAnalysis, astroAnalysis, bestWindows } = options;
  const reasons: string[] = [];
  const bestExecutable = bestWindows.find(
    (window) => window.executableForDedicatedTrip || window.windowLevel === "best",
  );

  if (target === "cloud_sea" || target === "general") {
    if (cloudSeaAnalysis.travelScore >= 65 && cloudSeaAnalysis.whiteoutRiskScore < 70) {
      reasons.push("云海形成与可拍窗口具备一定机会。");
    }
  }
  if (target === "glow" || target === "general") {
    if (glowAnalysis.glowTravelScore >= 65 || glowAnalysis.bestGlowWindows.length > 0) {
      reasons.push("朝霞或晚霞存在可观察窗口。");
    }
  }
  if (target === "astro" || target === "general") {
    if (astroAnalysis.astroShootable || astroAnalysis.recommendedMilkyWayWindows.length > 0) {
      reasons.push("夜间星空或银河窗口具备可拍条件。");
    }
  }
  if (scores.transparency.score >= 68) {
    reasons.push("整体透明度对远景层次有一定支持。");
  }
  if (bestExecutable?.label) {
    reasons.push(`当前最可执行窗口是${bestExecutable.label}。`);
  }

  return uniqueStrings(reasons).slice(0, 4);
}

function glowTerrainStatus(
  input: ForecastCalculationInput,
  phase: "sunrise" | "sunset",
): TerrainStatus {
  const sample = strongestTerrainSample(
    (input.terrainAnalysis.horizonProfile.directionSamples ?? []).filter(
      (item) => item.target === phase || item.sourcePhase === phase,
    ),
  );

  if (sample) {
    return terrainStatusFromSample(sample);
  }

  const fallbackAngle =
    phase === "sunrise"
      ? input.terrainAnalysis.horizonProfile.sunriseHorizonAngle
      : input.terrainAnalysis.horizonProfile.sunsetHorizonAngle;
  if (typeof fallbackAngle === "number" && Number.isFinite(fallbackAngle)) {
    if (fallbackAngle > 10) {
      return "obstructed";
    }
    if (fallbackAngle > 6) {
      return "marginal";
    }
    return "clear";
  }

  return "unavailable";
}

function astroTerrainStatus(assessment: TerrainHorizonAssessment | undefined): TerrainStatus {
  if (!terrainHorizonAssessmentHasDeterministicClearance(assessment)) {
    return "unavailable";
  }
  if (assessment.obstructionLevel === "obstructed") {
    return "obstructed";
  }
  if (assessment.obstructionLevel === "marginal") {
    return "marginal";
  }
  return "clear";
}

function strongestTerrainSample(
  samples: readonly TerrainHorizonDirectionSample[],
): TerrainHorizonDirectionSample | undefined {
  return [...samples]
    .filter(
      (sample) =>
        sample.unavailableReason === undefined &&
        (sample.confidence === "high" || sample.confidence === "medium") &&
        sample.obstructionLevel !== undefined,
    )
    .sort((left, right) => terrainStatusRank(right) - terrainStatusRank(left))[0];
}

function terrainStatusFromSample(sample: TerrainHorizonDirectionSample): TerrainStatus {
  if (sample.obstructionLevel === "obstructed") {
    return "obstructed";
  }
  if (sample.obstructionLevel === "marginal") {
    return "marginal";
  }
  if (sample.obstructionLevel === "clear") {
    return "clear";
  }
  return "unavailable";
}

function terrainStatusRank(sample: TerrainHorizonDirectionSample): number {
  if (sample.obstructionLevel === "obstructed") {
    return 3;
  }
  if (sample.obstructionLevel === "marginal") {
    return 2;
  }
  if (sample.obstructionLevel === "clear") {
    return 1;
  }
  return 0;
}

function isTerrainBlocking(status: TerrainStatus): boolean {
  return status === "obstructed" || status === "marginal";
}

function glowPhaseTerrainReason(sunriseStatus: TerrainStatus, sunsetStatus: TerrainStatus): string {
  if (sunriseStatus === "obstructed" && sunsetStatus === "clear") {
    return "日出光路遮挡风险较高，日落方向相对更适合。";
  }
  if (sunsetStatus === "obstructed" && sunriseStatus === "clear") {
    return "日落光路遮挡风险较高，日出方向相对更适合。";
  }
  if (sunriseStatus === "marginal" || sunsetStatus === "marginal") {
    return "霞光方向地形接近遮挡临界，不建议按强机会专程。";
  }
  return "霞光低角度光路遮挡风险较高，不建议按强机会专程。";
}

function targetDecisionConfidenceScore(
  input: ForecastCalculationInput,
  target: ForecastTarget,
): number {
  const fromFusion = input.weatherFusionSummary?.confidenceByTarget?.[target];
  if (typeof fromFusion === "number" && Number.isFinite(fromFusion)) {
    return fromFusion;
  }

  const level = input.weatherFusionSummary?.confidenceLevel;
  if (level === "high") {
    return 0.82;
  }
  if (level === "medium") {
    return 0.64;
  }
  if (level === "low") {
    return 0.42;
  }
  return input.weatherDataMode === "real" ? 0.62 : 0.48;
}

function targetTransparencyPenalty(input: ForecastCalculationInput, target: ForecastTarget): number {
  const penalties = input.weatherFusionSummary?.transparencyPenaltyByTarget;
  if (!penalties) {
    return 0;
  }
  if (target === "general") {
    return Math.max(
      penalties.general ?? 0,
      penalties.glow ?? 0,
      penalties.astro ?? 0,
      penalties.cloud_sea ?? 0,
    );
  }
  return penalties[target] ?? 0;
}

function hasHighModelDisagreement(input: ForecastCalculationInput, target: ForecastTarget): boolean {
  const agreement = input.weatherFusionSummary?.multiSourceAgreementContext;
  const consensus = input.weatherFusionSummary?.multiModelConsensusDiagnostics;
  const penalty = consensus?.multiModelConfidencePenaltyByTarget[target] ?? 0;
  return Boolean(
    agreement?.disagreementLevel === "high" ||
      (agreement?.shouldLowerConfidence && agreement.disagreementLevel !== "low") ||
      (consensus && consensus.multiModelHighSpreadHours > 0 && penalty >= 0.1),
  );
}

function aggregateSoftPenalty(input: {
  readonly targetConfidence: number;
  readonly transparencyPenalty: number;
  readonly highDisagreement: boolean;
  readonly riskFlags: readonly ForecastRiskFlag[];
}): number {
  let penalty = 0;
  if (input.targetConfidence < 0.55) {
    penalty += 6;
  } else if (input.targetConfidence < 0.68) {
    penalty += 3;
  }
  if (input.transparencyPenalty >= 0.08) {
    penalty += Math.min(10, Math.round(input.transparencyPenalty * 35));
  }
  if (input.highDisagreement) {
    penalty += 5;
  }
  penalty += input.riskFlags.filter((flag) => flag.level === "high").length * 4;
  return penalty;
}

function finalLevelForDecision(input: {
  readonly finalScore: number;
  readonly baseRecommendationLevel: ForecastRecommendationLevel;
  readonly forcedMode: ForecastDecisionMode | undefined;
}): ForecastRecommendationLevel {
  if (input.forcedMode === "data_insufficient" || input.forcedMode === "not_recommended") {
    return "not_recommended";
  }
  const level = classifyRecommendationLevel(input.finalScore);
  if (input.forcedMode === "nearby_watch" && level === "recommended") {
    return "worth_waiting";
  }
  if (input.forcedMode === "wait_for_update" && level === "recommended") {
    return input.baseRecommendationLevel === "recommended" ? "worth_waiting" : level;
  }
  return level;
}

function finalModeForDecision(input: {
  readonly finalScore: number;
  readonly finalRecommendationLevel: ForecastRecommendationLevel;
  readonly forcedMode: ForecastDecisionMode | undefined;
  readonly caps: readonly DecisionCap[];
  readonly baseRecommendationLevel: ForecastRecommendationLevel;
}): ForecastDecisionMode {
  if (input.forcedMode) {
    return input.forcedMode;
  }
  if (input.finalRecommendationLevel === "not_recommended" || input.finalScore < 45) {
    return "not_recommended";
  }
  if (input.finalRecommendationLevel === "cautious" || input.caps.length > 0) {
    return "nearby_watch";
  }
  if (input.finalRecommendationLevel === "worth_waiting") {
    return input.baseRecommendationLevel === "recommended" ? "nearby_watch" : "wait_for_update";
  }
  return "strong_go";
}

function finalDecisionConfidence(input: {
  readonly targetConfidence: number;
  readonly caps: readonly DecisionCap[];
  readonly highDisagreement: boolean;
  readonly lowConfidence: boolean;
}): ForecastDecisionConvergenceResult["decisionConfidence"] {
  if (
    input.lowConfidence ||
    input.highDisagreement ||
    input.caps.some((cap) => cap.confidenceFloor === "low" || cap.mode === "data_insufficient")
  ) {
    return "low";
  }
  if (input.targetConfidence < 0.72 || input.caps.some((cap) => cap.confidenceFloor === "medium")) {
    return "medium";
  }
  return "high";
}

function strongestMode(caps: readonly DecisionCap[]): ForecastDecisionMode | undefined {
  return caps
    .map((cap) => cap.mode)
    .filter((mode): mode is ForecastDecisionMode => mode !== undefined)
    .sort((left, right) => capPriority[right] - capPriority[left])[0];
}

function labelForFinalLevel(
  level: ForecastRecommendationLevel,
  mode: ForecastDecisionMode,
): string {
  if (mode === "data_insufficient") {
    return "数据不足";
  }
  if (mode === "nearby_watch") {
    return "谨慎参考";
  }
  if (mode === "wait_for_update") {
    return "临近复核";
  }
  if (mode === "not_recommended") {
    return "不建议专程";
  }
  return forecastRecommendationLabels[level];
}

function buildFinalDecisionSummary(input: {
  readonly finalTripDecisionLabel: string;
  readonly decisionMode: ForecastDecisionMode;
  readonly positiveReasonsZh: readonly string[];
  readonly riskReasonsZh: readonly string[];
  readonly uncertaintyReasonsZh: readonly string[];
  readonly baseRecommendationLabel: string;
  readonly finalRecommendationLabel: string;
}): string {
  const mainReason =
    input.riskReasonsZh[0] ??
    input.uncertaintyReasonsZh[0] ??
    input.positiveReasonsZh[0] ??
    `${input.baseRecommendationLabel}已按风险重新校准为${input.finalRecommendationLabel}。`;
  const modeAdvice =
    input.decisionMode === "strong_go"
      ? "仍需出发前复核短临天气。"
      : input.decisionMode === "nearby_watch"
        ? "适合附近观察，不建议仅凭分数长距离专程。"
        : input.decisionMode === "wait_for_update"
          ? "建议等待临近预报和现场云层变化后再定。"
          : input.decisionMode === "data_insufficient"
            ? "缺失项不按晴空或无遮挡处理。"
            : "当前不适合作为专程主目标。";

  return `${input.finalTripDecisionLabel}：${mainReason}${modeAdvice}`;
}

function buildPublicDecisionTags(input: {
  readonly decisionMode: ForecastDecisionMode;
  readonly decisionConfidence: ForecastDecisionConvergenceResult["decisionConfidence"];
  readonly caps: readonly DecisionCap[];
  readonly riskReasonsZh: readonly string[];
}): readonly string[] {
  const tags = [
    publicDecisionLabelByMode[input.decisionMode],
    input.decisionConfidence === "high"
      ? "高置信"
      : input.decisionConfidence === "medium"
        ? "中等置信"
        : "低置信",
    ...input.caps.map((cap) => publicTagForCap(cap.key)),
    ...input.riskReasonsZh.slice(0, 1),
  ];
  return uniqueStrings(tags).slice(0, 5);
}

function publicTagForCap(key: string): string {
  switch (key) {
    case "terrain_unavailable":
      return "地形方向不确定";
    case "glow_light_path":
    case "glow_light_path_marginal":
      return "光路遮挡风险";
    case "astro_terrain":
    case "astro_terrain_marginal":
      return "地形方向不利";
    case "transparency":
      return "透明度偏弱";
    case "multi_model":
      return "多模型分歧";
    case "precipitation_wind":
      return "降水或大风风险";
    case "cloud_sea_whiteout":
      return "白墙风险";
    case "astro_light_pollution":
      return "光污染风险";
    default:
      return "";
  }
}

function addCap(caps: DecisionCap[], reasons: string[], cap: DecisionCap): void {
  caps.push(cap);
  reasons.push(cap.reasonZh);
}

function classifyRecommendationLevel(score: number): ForecastRecommendationLevel {
  const normalizedScore = clampScore(score);
  if (normalizedScore >= 80) {
    return "recommended";
  }
  if (normalizedScore >= 65) {
    return "worth_waiting";
  }
  if (normalizedScore >= 50) {
    return "cautious";
  }
  return "not_recommended";
}

function firstWindowHoursFromGeneration(
  input: ForecastCalculationInput,
  bestWindows: readonly ForecastTimeWindow[],
): number {
  const generatedAtMs = Date.parse(input.generatedAt || input.calendarBasis.forecastStart);
  const startMs = Date.parse(bestWindows[0]?.startTime ?? input.calendarBasis.forecastEnd);
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(startMs)) {
    return 0;
  }
  return Math.max(0, (startMs - generatedAtMs) / (60 * 60 * 1000));
}

function hasValidCoordinates(input: ForecastCalculationInput): boolean {
  const { latitude, longitude } = input.place.coordinates;
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
