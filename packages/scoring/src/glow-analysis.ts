import type {
  AstroSummary,
  CloudSeaEvidenceEffect,
  ForecastCalculationInput,
  ForecastScore,
  GlowAerosolAssessment,
  GlowAnalysisResult,
  GlowAssessmentLabels,
  GlowBackupPlan,
  GlowCanonicalWindow,
  GlowEvidenceItem,
  GlowModelMetricResult,
  GlowWindowDiagnostic,
  GlowPostRainOpeningChance,
  GlowProviderAgreement,
  GlowProviderModelSource,
  GlowRecommendationLabel,
  GlowRiskDataAvailability,
  GlowScoreBreakdown,
  GlowTerrainObstructionAssessment,
  GlowVividnessLevel,
  GlowWindow,
  GlowWindowRainRisk,
  GlowWindowType,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import { glowSolarAltitudeGeometryConfig } from "@photo-weather/shared";
import { addHoursInTimezone } from "@photo-weather/calendar";
import { averageHourly, averageWeightedScore, clampScore } from "./helpers.js";
import {
  calculateGlowPracticalSuitabilityScore,
  calculateGlowVividnessIndex,
  calibrateGlowOccurrenceProbability,
  glowOccurrenceProbabilityCalibrationMode,
  glowVividnessLevelForScore,
} from "./glow-metrics.js";

type ForecastTimeRange = {
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly startMs: number;
  readonly endMs: number;
};

type GlowPhase = "sunrise" | "sunset";

type GlowCandidate = GlowWindow & {
  readonly phase: GlowPhase;
  readonly weatherWindow: readonly NormalizedHourlyWeather[];
};

type GlowComponentScores = {
  readonly colorCarrierScore: number;
  readonly glowCarrierScore: number;
  readonly lowCloudPassScore: number;
  readonly lowCloudRisk: number;
  readonly lowCloudFogWallRisk: number;
  readonly glowLightPathObstructionRisk: number;
  readonly glowLightPathDataAvailability: GlowRiskDataAvailability;
  readonly glowLightPathConfidence: GlowAnalysisResult["confidenceLevel"];
  readonly cloudSuppressionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly precipitationPassScore: number;
  readonly precipitationDisruptionRisk: number;
  readonly terrain: number;
  readonly windHumidity: number;
  readonly conditionScore: number;
  readonly practicalScore: number;
  readonly occurrenceProbabilityPercent: number;
  readonly vividnessIndex: number;
  readonly vividnessLevel: GlowVividnessLevel;
  readonly practicalSuitabilityScore: number;
  readonly confidence: number;
  readonly providerAgreement: GlowProviderAgreement;
  readonly scoreBreakdown: GlowScoreBreakdown;
  readonly modelResults: readonly GlowModelMetricResult[];
  readonly rainOverlapsWindow: boolean;
  readonly postRainOpeningChance: GlowPostRainOpeningChance;
  readonly glowWindowRainRisk: GlowWindowRainRisk;
};

type GlowLightPathAssessment = {
  readonly risk: number;
  readonly dataAvailability: GlowRiskDataAvailability;
  readonly confidence: GlowAnalysisResult["confidenceLevel"];
};

const oneHourMs = 60 * 60 * 1000;
const missingSunTimesNote = "缺少日出日落时间，无法生成精确霞光窗口。";
const missingTerrainNote = "暂缺地形遮挡细节，正式地形数据接入后将提升判断精度。";

export function calculateGlowAnalysis(input: ForecastCalculationInput): GlowAnalysisResult {
  const candidates = buildGlowCandidates(input).map((candidate) => {
    const components = calculateGlowComponents(input, candidate);
    const score = components.practicalSuitabilityScore;
    return {
      ...candidate,
      score,
      conditionScore: components.conditionScore,
      practicalScore: components.practicalSuitabilityScore,
      occurrenceProbabilityPercent: components.occurrenceProbabilityPercent,
      vividnessIndex: components.vividnessIndex,
      vividnessLevel: components.vividnessLevel,
      practicalSuitabilityScore: components.practicalSuitabilityScore,
      recommendationLabel: glowRecommendationLabel(components.practicalSuitabilityScore),
      confidence: components.confidence,
      calibrationMode: glowOccurrenceProbabilityCalibrationMode,
      providerAgreement: components.providerAgreement,
      scoreBreakdown: components.scoreBreakdown,
      modelResults: components.modelResults,
      colorCarrierScore: components.colorCarrierScore,
      glowCarrierScore: components.glowCarrierScore,
      lowCloudObstructionRisk: components.lowCloudRisk,
      lowCloudFogWallRisk: components.lowCloudFogWallRisk,
      glowLightPathObstructionRisk: components.glowLightPathObstructionRisk,
      glowLightPathDataAvailability: components.glowLightPathDataAvailability,
      glowLightPathConfidence: components.glowLightPathConfidence,
      cloudSuppressionRisk: components.cloudSuppressionRisk,
      precipitationDisruptionRisk: components.precipitationDisruptionRisk,
      visibilityColorQualityScore: components.visibilityColorQualityScore,
      aerosolScore: components.aerosolScore,
      terrainScore: components.terrain,
      rainOverlapsWindow: components.rainOverlapsWindow,
      postRainOpeningChance: components.postRainOpeningChance,
      glowWindowRainRisk: components.glowWindowRainRisk,
      riskTags: buildGlowWindowRiskTags(
        input,
        candidate.weatherWindow,
        candidate.phase,
        components,
      ),
      noteZh: buildGlowWindowNote(candidate.phase, candidate.type, components),
    };
  });
  const bestGlowWindows = candidates
    .filter((window) => window.score >= 55 && isShootableGlowWindow(window))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return Date.parse(left.start) - Date.parse(right.start);
    });
  const watchableGlowWindows = candidates
    .filter((window) => window.score >= 42 && !bestGlowWindows.includes(window))
    .sort((left, right) => right.score - left.score);
  const notRecommendedGlowWindows = candidates
    .filter(
      (window) =>
        window.score < 42 ||
        (window.lowCloudObstructionRisk ?? 0) >= 76 ||
        (window.glowLightPathObstructionRisk ?? 0) >= 76 ||
        (window.cloudSuppressionRisk ?? 0) >= 74 ||
        (window.precipitationDisruptionRisk ?? 0) >= 70,
    )
    .sort((left, right) => {
      if (right.conditionScore !== left.conditionScore) {
        return (right.conditionScore ?? right.score) - (left.conditionScore ?? left.score);
      }
      return Date.parse(left.start) - Date.parse(right.start);
    });
  const sunriseGlowScore = phaseMetric(
    candidates,
    "sunrise",
    (candidate) => candidate.occurrenceProbabilityPercent,
  );
  const sunsetGlowScore = phaseMetric(
    candidates,
    "sunset",
    (candidate) => candidate.occurrenceProbabilityPercent,
  );
  const sunrisePracticalScore = phaseMetric(
    candidates,
    "sunrise",
    (candidate) => candidate.practicalSuitabilityScore ?? candidate.practicalScore ?? candidate.score,
  );
  const sunsetPracticalScore = phaseMetric(
    candidates,
    "sunset",
    (candidate) => candidate.practicalSuitabilityScore ?? candidate.practicalScore ?? candidate.score,
  );
  const lowCloudObstructionRisk = calculateLowCloudObstructionRisk(candidates);
  const lowCloudFogWallRisk = lowCloudObstructionRisk;
  const glowLightPathObstructionRisk = calculateGlowLightPathObstructionRisk(candidates);
  const glowLightPathDataAvailability = aggregateGlowLightPathDataAvailability(candidates);
  const glowLightPathConfidence = aggregateGlowLightPathConfidence(candidates);
  const cloudSuppressionRisk = calculateCloudSuppressionRiskForCandidates(input, candidates);
  const colorCarrierScore = maxCandidateScore(
    candidates,
    (candidate) => candidate.colorCarrierScore,
    () => scoreColorCarrier(candidateWeatherOrAll(input, candidates)),
  );
  const precipitationDisruptionRisk = maxCandidateScore(
    candidates,
    (candidate) => candidate.precipitationDisruptionRisk,
    () => calculatePrecipitationDisruptionRisk(input.hourlyWeather),
  );
  const visibilityColorQualityScore = maxCandidateScore(
    candidates,
    (candidate) => candidate.visibilityColorQualityScore,
    () => scoreVisibilityColorQuality(input.hourlyWeather),
  );
  const rainOverlapsSunriseWindow = candidates.some(
    (candidate) => candidate.phase === "sunrise" && candidate.rainOverlapsWindow,
  );
  const rainOverlapsSunsetWindow = candidates.some(
    (candidate) => candidate.phase === "sunset" && candidate.rainOverlapsWindow,
  );
  const postRainOpeningChance = strongestPostRainOpening(candidates);
  const glowWindowRainRisk = strongestRainRisk(candidates);
  const rawGlowTravelScore = calculateGlowTravelScore(
    sunrisePracticalScore,
    sunsetPracticalScore,
    lowCloudObstructionRisk,
    glowLightPathObstructionRisk,
    glowLightPathDataAvailability,
    cloudSuppressionRisk,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    input,
  );
  const glowTravelScore =
    bestGlowWindows.length > 0
      ? rawGlowTravelScore
      : Math.min(rawGlowTravelScore, watchableGlowWindows.length > 0 ? 54 : 38);
  const missingDataNotes = buildGlowMissingDataNotes(input);
  const confidence = clampScore(
    calculateGlowConfidenceScore(input, missingDataNotes) -
      visibilityQualityConfidencePenalty(visibilityColorQualityScore),
  );
  const occurrenceProbabilityPercent = maxCandidateScore(
    candidates,
    (candidate) => candidate.occurrenceProbabilityPercent,
    () => Math.max(sunriseGlowScore, sunsetGlowScore),
  );
  const vividnessIndex = maxCandidateScore(
    candidates,
    (candidate) => candidate.vividnessIndex,
    () =>
      calculateGlowVividnessIndex({
        colorCarrierScore,
        visibilityColorQualityScore,
        aerosolScore: undefined,
        humidityScore: 68,
        solarGeometryScore: 76,
      }),
  );
  const vividnessLevel = glowVividnessLevelForScore(vividnessIndex);
  const providerAgreement = aggregateGlowProviderAgreement(candidates);
  const scoreBreakdown = aggregateGlowScoreBreakdown({
    candidates,
    colorCarrierScore,
    lowCloudObstructionRisk,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk,
    glowLightPathDataAvailability,
    glowLightPathConfidence,
    cloudSuppressionRisk,
    visibilityColorQualityScore,
    precipitationDisruptionRisk,
    practicalSuitabilityScore: glowTravelScore,
    occurrenceProbabilityPercent,
    vividnessIndex,
    confidence,
    missingDataNotes,
    providerAgreement,
  });
  const canonicalWindows = buildCanonicalGlowWindows(input, candidates, {
    sunriseGlowScore,
    sunsetGlowScore,
    confidence,
  });
  const diagnostics = buildGlowWindowDiagnostics(input, canonicalWindows);
  const labels = buildGlowLabels(
    sunriseGlowScore,
    sunsetGlowScore,
    lowCloudObstructionRisk,
    glowLightPathObstructionRisk,
    cloudSuppressionRisk,
    colorCarrierScore,
    bestGlowWindows[0],
    watchableGlowWindows[0],
    notRecommendedGlowWindows[0],
  );
  const aerosolAssessment = buildGlowAerosolAssessment(input, candidates);
  const terrainObstructionAssessments = buildTerrainObstructionAssessments(input);

  return {
    sunriseGlowScore,
    sunsetGlowScore,
    lowCloudObstructionRisk,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk,
    glowLightPathDataAvailability,
    glowLightPathConfidence,
    cloudSuppressionRisk,
    colorCarrierScore,
    glowCarrierScore: colorCarrierScore,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    practicalGlowScore: glowTravelScore,
    occurrenceProbabilityPercent,
    vividnessIndex,
    vividnessLevel,
    practicalSuitabilityScore: glowTravelScore,
    calibrationMode: glowOccurrenceProbabilityCalibrationMode,
    providerAgreement,
    scoreBreakdown,
    confidence,
    labels,
    glowTravelScore,
    rainOverlapsSunriseWindow,
    rainOverlapsSunsetWindow,
    postRainOpeningChance,
    glowWindowRainRisk,
    recommendationLabel: glowRecommendationLabel(glowTravelScore),
    confidenceLevel: glowConfidenceLevel(confidence, input),
    bestGlowWindow: bestGlowWindows[0] ? toPublicGlowWindow(bestGlowWindows[0]) : undefined,
    bestGlowWindows: bestGlowWindows.map(toPublicGlowWindow),
    watchableGlowWindows: watchableGlowWindows.map(toPublicGlowWindow),
    notRecommendedGlowWindows: notRecommendedGlowWindows.map(toPublicGlowWindow),
    canonicalWindows,
    sunriseGlowWindow: canonicalWindows.find((window) => window.phase === "sunrise"),
    sunsetGlowWindow: canonicalWindows.find((window) => window.phase === "sunset"),
    diagnostics,
    dailyGlow: buildDailyGlow(input, candidates),
    cloudLayerEvidence: buildCloudLayerEvidence(input, candidates),
    visibilityEvidence: buildVisibilityEvidence(input, candidates),
    aerosolAssessment,
    aerosolEvidence: buildAerosolEvidence(aerosolAssessment),
    terrainObstructionAssessments,
    terrainObstructionEvidence: buildTerrainEvidence(input),
    riskReasons: buildGlowRiskReasons(input, candidates, {
      lowCloudFogWallRisk,
      glowLightPathObstructionRisk,
      glowLightPathDataAvailability,
      cloudSuppressionRisk,
    }),
    opportunityReasons: buildGlowOpportunityReasons(input, candidates),
    travelRecommendations: buildGlowTravelRecommendations(sunriseGlowScore, sunsetGlowScore),
    backupPlans: buildGlowBackupPlans(),
    missingDataNotes,
    dataMode: input.weatherDataMode,
  };
}

export function buildGlowForecastScore(
  analysis: GlowAnalysisResult,
  phase: GlowPhase,
): ForecastScore {
  const score = phase === "sunrise" ? analysis.sunriseGlowScore : analysis.sunsetGlowScore;
  const label = phase === "sunrise" ? "朝霞" : "晚霞";
  const phaseKeyword = phase === "sunrise" ? "朝霞" : "晚霞";
  const reasons = [
    ...analysis.opportunityReasons.filter((reason) => reason.includes(phaseKeyword)).slice(0, 2),
    ...analysis.cloudLayerEvidence
      .filter((item) => item.effect === "positive")
      .map((item) => item.noteZh)
      .slice(0, 1),
  ];
  const risks = analysis.riskReasons
    .filter(
      (reason) =>
        reason.includes(phaseKeyword) || (!reason.includes("朝霞") && !reason.includes("晚霞")),
    )
    .slice(0, 3);

  return {
    key: phase === "sunrise" ? "sunriseGlow" : "sunsetGlow",
    label,
    score,
    level: score >= 80 ? "excellent" : score >= 65 ? "good" : score >= 45 ? "fair" : "poor",
    reasons:
      reasons.length > 0
        ? reasons
        : [
            `${label}评分综合了霞光云层载体、光路遮挡、云层压制、低云/雾墙、通透度、降水、风湿稳定性和地形遮挡。`,
          ],
    risks,
  };
}

export function glowRecommendationLabel(score: number): GlowRecommendationLabel {
  const normalizedScore = clampScore(score);
  if (normalizedScore >= 80) {
    return "推荐重点关注";
  }
  if (normalizedScore >= 65) {
    return "值得等待";
  }
  if (normalizedScore >= 50) {
    return "谨慎参考";
  }
  return "不建议专程";
}

function buildGlowCandidates(input: ForecastCalculationInput): readonly GlowCandidate[] {
  const forecastRange = parseForecastRange(input);
  if (!forecastRange) {
    return [];
  }

  return input.astroSummaries.flatMap((astro) => [
    ...buildSunriseCandidates(input, astro, forecastRange),
    ...buildSunsetCandidates(input, astro, forecastRange),
  ]);
}

function buildSunriseCandidates(
  input: ForecastCalculationInput,
  astro: AstroSummary,
  forecastRange: ForecastTimeRange,
): readonly GlowCandidate[] {
  if (!astro.sunrise || !astro.sunriseGlowBestStartAt || !astro.sunriseGlowBestEndAt) {
    return [];
  }

  return [
    buildCandidate(input, forecastRange, {
      phase: "sunrise",
      type: "sunrise_glow",
      labelZh: "预测朝霞最佳窗口",
      date: astro.date,
      start: astro.sunriseGlowBestStartAt,
      end: astro.sunriseGlowBestEndAt,
      eventAt: astro.sunrise,
      candidateStartAt: astro.sunriseGlowCandidateStartAt,
      candidateEndAt: astro.sunriseGlowCandidateEndAt,
      candidateStartAltitudeDegrees:
        glowSolarAltitudeGeometryConfig.sunrise.candidate.startAltitudeDegrees,
      candidateEndAltitudeDegrees:
        glowSolarAltitudeGeometryConfig.sunrise.candidate.endAltitudeDegrees,
      bestStartAltitudeDegrees: glowSolarAltitudeGeometryConfig.sunrise.best.startAltitudeDegrees,
      bestEndAltitudeDegrees: glowSolarAltitudeGeometryConfig.sunrise.best.endAltitudeDegrees,
      solarCalculationResolutionMinutes:
        astro.solarCalculationResolutionMinutes ??
        glowSolarAltitudeGeometryConfig.solarCalculationResolutionMinutes,
      weatherResolutionMinutes: estimateWeatherResolutionMinutes(input.hourlyWeather),
      windowDerivationMethod:
        astro.glowWindowDerivationMethod ?? glowSolarAltitudeGeometryConfig.windowDerivationMethod,
    }),
  ].filter((candidate): candidate is GlowCandidate => candidate !== null);
}

function buildSunsetCandidates(
  input: ForecastCalculationInput,
  astro: AstroSummary,
  forecastRange: ForecastTimeRange,
): readonly GlowCandidate[] {
  if (!astro.sunset || !astro.sunsetGlowBestStartAt || !astro.sunsetGlowBestEndAt) {
    return [];
  }

  return [
    buildCandidate(input, forecastRange, {
      phase: "sunset",
      type: "sunset_glow",
      labelZh: "预测晚霞最佳窗口",
      date: astro.date,
      start: astro.sunsetGlowBestStartAt,
      end: astro.sunsetGlowBestEndAt,
      eventAt: astro.sunset,
      candidateStartAt: astro.sunsetGlowCandidateStartAt,
      candidateEndAt: astro.sunsetGlowCandidateEndAt,
      candidateStartAltitudeDegrees:
        glowSolarAltitudeGeometryConfig.sunset.candidate.startAltitudeDegrees,
      candidateEndAltitudeDegrees:
        glowSolarAltitudeGeometryConfig.sunset.candidate.endAltitudeDegrees,
      bestStartAltitudeDegrees: glowSolarAltitudeGeometryConfig.sunset.best.startAltitudeDegrees,
      bestEndAltitudeDegrees: glowSolarAltitudeGeometryConfig.sunset.best.endAltitudeDegrees,
      solarCalculationResolutionMinutes:
        astro.solarCalculationResolutionMinutes ??
        glowSolarAltitudeGeometryConfig.solarCalculationResolutionMinutes,
      weatherResolutionMinutes: estimateWeatherResolutionMinutes(input.hourlyWeather),
      windowDerivationMethod:
        astro.glowWindowDerivationMethod ?? glowSolarAltitudeGeometryConfig.windowDerivationMethod,
    }),
  ].filter((candidate): candidate is GlowCandidate => candidate !== null);
}

function toPublicGlowWindow(candidate: GlowCandidate): GlowWindow {
  const { weatherWindow: _weatherWindow, ...window } = candidate;
  return window;
}

function shiftForecastTime(input: ForecastCalculationInput, time: string, hours: number): string {
  return addHoursInTimezone(time, hours, input.calendarBasis.timezone);
}

function buildCandidate(
  input: ForecastCalculationInput,
  forecastRange: ForecastTimeRange,
  candidate: Omit<GlowCandidate, "score" | "riskTags" | "noteZh" | "weatherWindow">,
): GlowCandidate | null {
  const clipped = clipWindow(candidate.start, candidate.end, forecastRange);
  if (!clipped) {
    return null;
  }
  const weatherWindow = weatherForWindow(input.hourlyWeather, clipped.start, clipped.end);
  if (weatherWindow.length === 0) {
    return null;
  }

  return {
    ...candidate,
    ...clipped,
    weatherWindow,
    score: 0,
    riskTags: [],
    noteZh: "",
  };
}

function calculateGlowComponents(
  input: ForecastCalculationInput,
  candidate: GlowCandidate,
): GlowComponentScores {
  const window = candidate.weatherWindow;
  const phase = candidate.phase;
  const colorCarrierScore = scoreColorCarrier(window);
  const lowCloudFogWallRisk = scoreLowCloudFogWallRisk(window);
  const lowCloudRisk = lowCloudFogWallRisk;
  const precipitationDisruptionRisk = calculatePrecipitationDisruptionRisk(window);
  const precipitationPassScore = 100 - precipitationDisruptionRisk;
  const visibilityColorQualityScore = scoreVisibilityColorQuality(window);
  const aerosolScore = scoreAerosolAtmosphere(window);
  const terrain = scoreTerrainObstruction(input, phase);
  const cloudSuppressionRisk = scoreCloudSuppressionRisk(window, {
    colorCarrierScore,
    visibilityColorQualityScore,
    precipitationDisruptionRisk,
  });
  const lightPathAssessment = assessGlowLightPathObstruction(input, window, phase, {
    lowCloudFogWallRisk,
    cloudSuppressionRisk,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    terrainScore: terrain,
  });
  const windHumidity = scoreWindHumidity(window);
  const missingDataReasons = buildGlowWindowMissingDataReasons(input, window);
  const dataCompletenessScore = scoreGlowWindowDataCompleteness(input, window);
  const modelResults = calculateGlowModelMetricResults(input, candidate, {
    missingDataReasons,
    dataCompletenessScore,
  });
  const providerAgreement = buildGlowProviderAgreement(modelResults);
  const providerAgreementScore = providerAgreementScoreForStatus(providerAgreement);
  const temporalProximityScore = scoreGlowTemporalProximity(candidate);
  const confidence = clampScore(
    calculateGlowConfidenceScore(input, buildGlowMissingDataNotes(input)) -
      providerAgreement.confidenceAdjustment -
      visibilityQualityConfidencePenalty(visibilityColorQualityScore) -
      (lightPathAssessment.dataAvailability === "insufficient" ? 12 : 0),
  );
  const conditionScore = scoreGlowCondition({
    colorCarrierScore,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk: lightPathAssessment.risk,
    cloudSuppressionRisk,
    visibilityColorQualityScore,
    aerosolScore,
    precipitationPassScore,
    terrain,
    windHumidity,
  });
  const rainOverlapsWindow = hasActivePrecipitation(window);
  const postRainOpeningChance = calculatePostRainOpeningChance(input, candidate);
  const glowWindowRainRisk = glowRainRiskLevel(precipitationDisruptionRisk);
  const occurrenceProbabilityPercent = calibrateGlowOccurrenceProbability({
    colorCarrierScore,
    lowCloudObstructionRisk: lowCloudRisk,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk: lightPathAssessment.risk,
    glowLightPathDataAvailability: lightPathAssessment.dataAvailability,
    cloudSuppressionRisk,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    providerAgreementScore,
    dataCompletenessScore,
    temporalProximityScore,
  });
  const vividnessIndex = calculateGlowVividnessIndex({
    colorCarrierScore,
    visibilityColorQualityScore,
    aerosolScore,
    humidityScore: scoreGlowWindowHumidityForVividness(window),
    solarGeometryScore: scoreGlowWindowSolarGeometry(candidate),
  });
  const vividnessLevel = glowVividnessLevelForScore(vividnessIndex);
  const practicalScore = calculateGlowPracticalSuitabilityScore({
    occurrenceProbabilityPercent,
    vividnessIndex,
    lowCloudObstructionRisk: lowCloudRisk,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk: lightPathAssessment.risk,
    glowLightPathDataAvailability: lightPathAssessment.dataAvailability,
    cloudSuppressionRisk,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    aerosolScore,
    terrainScore: terrain,
    windHumidityScore: windHumidity,
    rainOverlapsWindow,
    postRainOpeningChance,
    type: candidate.type,
    confidence,
  });
  const scoreBreakdown: GlowScoreBreakdown = {
    colorCarrierScore,
    glowCarrierScore: colorCarrierScore,
    lowCloudObstructionRisk: lowCloudRisk,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk: lightPathAssessment.risk,
    glowLightPathDataAvailability: lightPathAssessment.dataAvailability,
    glowLightPathConfidence: lightPathAssessment.confidence,
    cloudSuppressionRisk,
    visibilityColorQualityScore,
    aerosolScore,
    precipitationDisruptionRisk,
    terrainScore: terrain,
    windHumidityScore: windHumidity,
    occurrenceProbabilityPercent,
    vividnessIndex,
    practicalSuitabilityScore: practicalScore,
    confidence,
    providerCount: providerAgreement.providerCount,
    modelCount: providerAgreement.modelCount,
    modelSpread: providerAgreement.modelSpread,
    calibrationMode: glowOccurrenceProbabilityCalibrationMode,
    missingDataReasons,
    modelResults,
  };

  return {
    colorCarrierScore,
    glowCarrierScore: colorCarrierScore,
    lowCloudRisk,
    lowCloudPassScore: 100 - lowCloudRisk,
    lowCloudFogWallRisk,
    glowLightPathObstructionRisk: lightPathAssessment.risk,
    glowLightPathDataAvailability: lightPathAssessment.dataAvailability,
    glowLightPathConfidence: lightPathAssessment.confidence,
    cloudSuppressionRisk,
    visibilityColorQualityScore,
    aerosolScore,
    precipitationPassScore,
    precipitationDisruptionRisk,
    terrain,
    windHumidity,
    conditionScore,
    practicalScore,
    occurrenceProbabilityPercent,
    vividnessIndex,
    vividnessLevel,
    practicalSuitabilityScore: practicalScore,
    confidence,
    providerAgreement,
    scoreBreakdown,
    modelResults,
    rainOverlapsWindow,
    postRainOpeningChance,
    glowWindowRainRisk,
  };
}

function buildGlowWindowMissingDataReasons(
  input: ForecastCalculationInput,
  window: readonly NormalizedHourlyWeather[],
): readonly string[] {
  const reasons: string[] = [];
  const cloudLayerFields = ["cloudLow", "cloudMid", "cloudHigh"] as const;
  if (cloudLayerFields.some((field) => input.weatherMissingFields.includes(field))) {
    reasons.push("cloud_layers_missing");
  }
  if (window.length === 0) {
    reasons.push("window_weather_missing");
  }
  if (!window.some((hour) => typeof hour.visibility === "number")) {
    reasons.push("visibility_missing");
  }
  if (
    !window.some(
      (hour) =>
        typeof hour.precipitationProbability === "number" ||
        typeof precipitationAmount(hour) === "number",
    )
  ) {
    reasons.push("precipitation_missing");
  }
  if (
    !window.some(
      (hour) =>
        typeof hour.aerosolOpticalDepth550 === "number" ||
        typeof hour.pm25 === "number" ||
        typeof hour.pm10 === "number" ||
        typeof hour.dust === "number",
    )
  ) {
    reasons.push("aerosol_missing");
  }
  if (glowProviderModelGroups(window).length <= 1) {
    reasons.push("provider_model_agreement_unavailable");
  }
  if (
    !hasDeterministicGlowLightPathData(input, "sunrise") &&
    !hasDeterministicGlowLightPathData(input, "sunset")
  ) {
    reasons.push("glow_light_path_direction_insufficient");
  }
  return [...new Set(reasons)];
}

function scoreGlowWindowDataCompleteness(
  input: ForecastCalculationInput,
  window: readonly NormalizedHourlyWeather[],
): number {
  let score = 100;
  if (window.length === 0) {
    score -= 35;
  }
  if (["cloudLow", "cloudMid", "cloudHigh"].some((field) => input.weatherMissingFields.includes(field))) {
    score -= 28;
  }
  if (!window.some((hour) => typeof hour.visibility === "number")) {
    score -= 12;
  }
  if (
    !window.some(
      (hour) =>
        typeof hour.precipitationProbability === "number" ||
        typeof precipitationAmount(hour) === "number",
    )
  ) {
    score -= 10;
  }
  if (glowProviderModelGroups(window).length <= 1) {
    score -= 8;
  }
  if (
    !hasDeterministicGlowLightPathData(input, "sunrise") &&
    !hasDeterministicGlowLightPathData(input, "sunset")
  ) {
    score -= 12;
  }
  if (input.weatherDataMode !== "real") {
    score -= 12;
  }
  return clampScore(score);
}

function calculateGlowModelMetricResults(
  input: ForecastCalculationInput,
  candidate: GlowCandidate,
  options: {
    readonly missingDataReasons: readonly string[];
    readonly dataCompletenessScore: number;
  },
): readonly GlowModelMetricResult[] {
  return glowProviderModelGroups(candidate.weatherWindow).map((group) => {
    const colorCarrierScore = scoreColorCarrier(group.rows);
    const lowCloudFogWallRisk = scoreLowCloudFogWallRisk(group.rows);
    const lowCloudRisk = lowCloudFogWallRisk;
    const precipitationDisruptionRisk = calculatePrecipitationDisruptionRisk(group.rows);
    const visibilityColorQualityScore = scoreVisibilityColorQuality(group.rows);
    const aerosolScore = scoreAerosolAtmosphere(group.rows);
    const terrainScore = scoreTerrainObstruction(input, candidate.phase);
    const windHumidityScore = scoreWindHumidity(group.rows);
    const cloudSuppressionRisk = scoreCloudSuppressionRisk(group.rows, {
      colorCarrierScore,
      visibilityColorQualityScore,
      precipitationDisruptionRisk,
    });
    const lightPathAssessment = assessGlowLightPathObstruction(input, group.rows, candidate.phase, {
      lowCloudFogWallRisk,
      cloudSuppressionRisk,
      precipitationDisruptionRisk,
      visibilityColorQualityScore,
      terrainScore,
    });
    const occurrenceProbabilityPercent = calibrateGlowOccurrenceProbability({
      colorCarrierScore,
      lowCloudObstructionRisk: lowCloudRisk,
      lowCloudFogWallRisk,
      glowLightPathObstructionRisk: lightPathAssessment.risk,
      glowLightPathDataAvailability: lightPathAssessment.dataAvailability,
      cloudSuppressionRisk,
      precipitationDisruptionRisk,
      visibilityColorQualityScore,
      providerAgreementScore: 60,
      dataCompletenessScore: options.dataCompletenessScore,
      temporalProximityScore: scoreGlowTemporalProximity(candidate),
    });
    const vividnessIndex = calculateGlowVividnessIndex({
      colorCarrierScore,
      visibilityColorQualityScore,
      aerosolScore,
      humidityScore: scoreGlowWindowHumidityForVividness(group.rows),
      solarGeometryScore: scoreGlowWindowSolarGeometry(candidate),
    });
    const practicalSuitabilityScore = calculateGlowPracticalSuitabilityScore({
      occurrenceProbabilityPercent,
      vividnessIndex,
      lowCloudObstructionRisk: lowCloudRisk,
      lowCloudFogWallRisk,
      glowLightPathObstructionRisk: lightPathAssessment.risk,
      glowLightPathDataAvailability: lightPathAssessment.dataAvailability,
      cloudSuppressionRisk,
      precipitationDisruptionRisk,
      visibilityColorQualityScore,
      aerosolScore,
      terrainScore,
      windHumidityScore,
      rainOverlapsWindow: hasActivePrecipitation(group.rows),
      postRainOpeningChance: calculatePostRainOpeningChance(input, {
        ...candidate,
        weatherWindow: group.rows,
      }),
      type: candidate.type,
      confidence: clampScore(
        calculateGlowConfidenceScore(input, options.missingDataReasons) -
          6 -
          visibilityQualityConfidencePenalty(visibilityColorQualityScore) -
          (lightPathAssessment.dataAvailability === "insufficient" ? 12 : 0),
      ),
    });

    return {
      providerCode: group.source.providerCode,
      providerLabelZh: group.source.providerLabelZh,
      modelName: group.source.modelName,
      sourceId: group.source.sourceId,
      occurrenceProbabilityPercent,
      vividnessIndex,
      vividnessLevel: glowVividnessLevelForScore(vividnessIndex),
      practicalSuitabilityScore,
      confidence: clampScore(
        calculateGlowConfidenceScore(input, options.missingDataReasons) -
          6 -
          visibilityQualityConfidencePenalty(visibilityColorQualityScore) -
          (lightPathAssessment.dataAvailability === "insufficient" ? 12 : 0),
      ),
    };
  });
}

type GlowProviderModelGroup = {
  readonly key: string;
  readonly source: GlowProviderModelSource;
  readonly rows: readonly NormalizedHourlyWeather[];
};

function glowProviderModelGroups(
  window: readonly NormalizedHourlyWeather[],
): readonly GlowProviderModelGroup[] {
  const groups = new Map<string, { source: GlowProviderModelSource; rows: NormalizedHourlyWeather[] }>();
  for (const hour of window) {
    const source = glowProviderModelSourceForHour(hour);
    const key = `${source.providerCode}::${source.sourceId ?? source.modelName ?? "default"}`;
    const existing = groups.get(key);
    if (existing) {
      existing.rows.push(hour);
      continue;
    }
    groups.set(key, {
      source,
      rows: [hour],
    });
  }

  return [...groups.entries()].map(([key, group]) => ({
    key,
    source: {
      ...group.source,
      coverageHours: new Set(group.rows.map((row) => row.time)).size,
    },
    rows: group.rows,
  }));
}

function glowProviderModelSourceForHour(hour: NormalizedHourlyWeather): GlowProviderModelSource {
  const fieldMetadata = hour.fieldMetadata ?? {};
  const metadata =
    fieldMetadata.cloudHigh ??
    fieldMetadata.cloudMid ??
    fieldMetadata.cloudLow ??
    fieldMetadata.cloudTotal ??
    fieldMetadata.visibility ??
    fieldMetadata.precipitationProbability ??
    fieldMetadata.precipitationAmountMm;
  const providerCode = metadata?.providerCode ?? hour.providerCode ?? "unknown";
  const modelName = metadata?.modelName;
  const sourceId = metadata?.sourceId ?? (modelName ? `${providerCode}:${modelName}` : providerCode);

  return {
    providerCode,
    providerLabelZh: metadata?.providerLabelZh ?? hour.providerLabelZh,
    modelName,
    sourceId,
    coverageHours: 1,
  };
}

function buildGlowProviderAgreement(
  modelResults: readonly GlowModelMetricResult[],
): GlowProviderAgreement {
  const providerCount = new Set(modelResults.map((result) => result.providerCode)).size;
  const modelCount = new Set(
    modelResults.map((result) => `${result.providerCode}:${result.sourceId ?? result.modelName ?? "default"}`),
  ).size;
  const sources = modelResults.map((result) => ({
    providerCode: result.providerCode,
    providerLabelZh: result.providerLabelZh,
    modelName: result.modelName,
    sourceId: result.sourceId,
    coverageHours: 1,
  }));

  if (modelResults.length <= 1 || modelCount <= 1) {
    return {
      status: "unavailable",
      providerCount,
      modelCount,
      modelSpread: null,
      confidenceAdjustment: 6,
      summaryZh: "单一来源，暂不判断模型一致性",
      sources,
    };
  }

  const occurrenceSpread = spread(modelResults.map((result) => result.occurrenceProbabilityPercent));
  const vividnessSpread = spread(modelResults.map((result) => result.vividnessIndex));
  const practicalSpread = spread(modelResults.map((result) => result.practicalSuitabilityScore));
  const modelSpread = Math.max(occurrenceSpread, vividnessSpread, practicalSpread);
  const status = modelSpread <= 10 ? "high" : modelSpread <= 22 ? "medium" : "low";

  return {
    status,
    providerCount,
    modelCount,
    modelSpread,
    confidenceAdjustment: status === "high" ? 0 : status === "medium" ? 6 : 14,
    summaryZh:
      status === "high"
        ? "可用来源判断接近"
        : status === "medium"
          ? "可用来源存在中等差异"
          : "可用来源差异较大，需保守看待",
    sources,
  };
}

function providerAgreementScoreForStatus(agreement: GlowProviderAgreement): number {
  switch (agreement.status) {
    case "high":
      return 90;
    case "medium":
      return 72;
    case "low":
      return 45;
    case "single_source":
    case "unavailable":
    default:
      return 60;
  }
}

function scoreGlowTemporalProximity(candidate: GlowCandidate): number {
  if (candidate.type === "sunrise_glow" || candidate.type === "sunset_glow") {
    return 100;
  }
  if (candidate.type === "sunrise_core" || candidate.type === "sunset_core") {
    return 92;
  }
  if (candidate.type === "pre_dawn_glow" || candidate.type === "afterglow") {
    return 78;
  }
  return 68;
}

function scoreGlowWindowSolarGeometry(candidate: GlowCandidate): number {
  const hasBestAltitude =
    typeof candidate.bestStartAltitudeDegrees === "number" &&
    typeof candidate.bestEndAltitudeDegrees === "number";
  if (!hasBestAltitude) {
    return 76;
  }
  const expected =
    candidate.phase === "sunrise"
      ? glowSolarAltitudeGeometryConfig.sunrise.best
      : glowSolarAltitudeGeometryConfig.sunset.best;
  const startDelta = Math.abs(candidate.bestStartAltitudeDegrees - expected.startAltitudeDegrees);
  const endDelta = Math.abs(candidate.bestEndAltitudeDegrees - expected.endAltitudeDegrees);
  return clampScore(96 - (startDelta + endDelta) * 4);
}

function scoreGlowWindowHumidityForVividness(window: readonly NormalizedHourlyWeather[]): number {
  const humidity = averageDefined(window, (hour) => hour.humidity);
  const visibility = averageDefined(window, (hour) => hour.visibility);
  const dewPointSpread = averageDefined(window, (hour) => hour.dewPointSpread ?? null);
  if (humidity === undefined) {
    return 68;
  }
  if (humidity >= 96 && (visibility ?? 99) < 8) {
    return 34;
  }
  if (humidity >= 92 || (dewPointSpread !== undefined && dewPointSpread <= 2)) {
    return 50;
  }
  if (humidity <= 72) {
    return 78;
  }
  return 68;
}

function aggregateGlowProviderAgreement(
  candidates: readonly GlowCandidate[],
): GlowProviderAgreement {
  const best = bestMetricCandidate(candidates);
  if (best?.providerAgreement) {
    return best.providerAgreement;
  }
  return {
    status: "unavailable",
    providerCount: 0,
    modelCount: 0,
    modelSpread: null,
    confidenceAdjustment: 10,
    summaryZh: "缺少可用于一致性判断的窗口",
    sources: [],
  };
}

function aggregateGlowScoreBreakdown(input: {
  readonly candidates: readonly GlowCandidate[];
  readonly colorCarrierScore: number;
  readonly lowCloudObstructionRisk: number;
  readonly lowCloudFogWallRisk: number;
  readonly glowLightPathObstructionRisk: number;
  readonly glowLightPathDataAvailability: GlowRiskDataAvailability;
  readonly glowLightPathConfidence: GlowAnalysisResult["confidenceLevel"];
  readonly cloudSuppressionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly precipitationDisruptionRisk: number;
  readonly practicalSuitabilityScore: number;
  readonly occurrenceProbabilityPercent: number;
  readonly vividnessIndex: number;
  readonly confidence: number;
  readonly missingDataNotes: readonly string[];
  readonly providerAgreement: GlowProviderAgreement;
}): GlowScoreBreakdown {
  const best = bestMetricCandidate(input.candidates);
  if (best?.scoreBreakdown) {
    return best.scoreBreakdown;
  }
  return {
    colorCarrierScore: input.colorCarrierScore,
    glowCarrierScore: input.colorCarrierScore,
    lowCloudObstructionRisk: input.lowCloudObstructionRisk,
    lowCloudFogWallRisk: input.lowCloudFogWallRisk,
    glowLightPathObstructionRisk: input.glowLightPathObstructionRisk,
    glowLightPathDataAvailability: input.glowLightPathDataAvailability,
    glowLightPathConfidence: input.glowLightPathConfidence,
    cloudSuppressionRisk: input.cloudSuppressionRisk,
    visibilityColorQualityScore: input.visibilityColorQualityScore,
    precipitationDisruptionRisk: input.precipitationDisruptionRisk,
    terrainScore: 0,
    windHumidityScore: 0,
    occurrenceProbabilityPercent: input.occurrenceProbabilityPercent,
    vividnessIndex: input.vividnessIndex,
    practicalSuitabilityScore: input.practicalSuitabilityScore,
    confidence: input.confidence,
    providerCount: input.providerAgreement.providerCount,
    modelCount: input.providerAgreement.modelCount,
    modelSpread: input.providerAgreement.modelSpread,
    calibrationMode: glowOccurrenceProbabilityCalibrationMode,
    missingDataReasons: input.missingDataNotes,
    modelResults: [],
  };
}

function bestMetricCandidate(candidates: readonly GlowCandidate[]): GlowCandidate | undefined {
  return [...candidates].sort(
    (left, right) =>
      (right.practicalSuitabilityScore ?? right.practicalScore ?? right.score) -
      (left.practicalSuitabilityScore ?? left.practicalScore ?? left.score),
  )[0];
}

function spread(values: readonly number[]): number {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length <= 1) {
    return 0;
  }
  return Math.round(Math.max(...finite) - Math.min(...finite));
}

function scoreGlowCondition(components: {
  readonly colorCarrierScore: number;
  readonly lowCloudFogWallRisk: number;
  readonly glowLightPathObstructionRisk: number;
  readonly cloudSuppressionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly precipitationPassScore: number;
  readonly terrain: number;
  readonly windHumidity: number;
}): number {
  const weightedScores = [
    { score: components.colorCarrierScore, weight: 0.32 },
    { score: 100 - components.glowLightPathObstructionRisk, weight: 0.2 },
    { score: 100 - components.cloudSuppressionRisk, weight: 0.18 },
    { score: 100 - components.lowCloudFogWallRisk, weight: 0.08 },
    { score: components.visibilityColorQualityScore, weight: 0.1 },
    { score: components.precipitationPassScore, weight: 0.06 },
    { score: components.terrain, weight: 0.04 },
    { score: components.windHumidity, weight: 0.02 },
  ];
  if (typeof components.aerosolScore === "number") {
    weightedScores.push({ score: components.aerosolScore, weight: 0.08 });
  }

  return averageWeightedScore(weightedScores);
}

function scoreColorCarrier(window: readonly NormalizedHourlyWeather[]): number {
  const cloudHigh = averageDefined(window, (hour) => hour.cloudHigh);
  const cloudMid = averageDefined(window, (hour) => hour.cloudMid);
  const cloudLow = averageDefined(window, (hour) => hour.cloudLow);
  const cloudTotal = averageHourly(window, (hour) => hour.cloudTotal);

  if (cloudHigh === undefined || cloudMid === undefined) {
    return clampScore(scoreTotalCloud(cloudTotal) - 16);
  }

  if (cloudHigh <= 10 && cloudMid <= 10) {
    return clampScore(scoreTotalCloud(cloudTotal) - 34);
  }

  const highScore = layerCarrierScore(cloudHigh, 20, 70);
  const midScore = layerCarrierScore(cloudMid, 20, 70);
  const carrierScore = highScore * 0.55 + midScore * 0.45;
  const totalCloudScore = scoreTotalCloud(cloudTotal);
  const highDominantOvercast = cloudTotal > 90 && cloudHigh > 65 && (cloudLow ?? 0) < 45;
  const overcastPenalty = cloudTotal > 90 && !highDominantOvercast ? 20 : cloudTotal > 95 ? 8 : 0;

  return clampScore(carrierScore * 0.72 + totalCloudScore * 0.28 - overcastPenalty);
}

function layerCarrierScore(value: number, favorableMin: number, favorableMax: number): number {
  if (value >= favorableMin && value <= favorableMax) {
    const center = (favorableMin + favorableMax) / 2;
    return clampScore(92 - Math.abs(value - center) * 0.18);
  }
  if (value < favorableMin) {
    return clampScore(28 + value * 2.2);
  }
  return clampScore(78 - (value - favorableMax) * 0.9);
}

function scoreTotalCloud(cloudTotal: number): number {
  if (cloudTotal < 10) {
    return clampScore(34 + cloudTotal * 2);
  }
  if (cloudTotal >= 20 && cloudTotal <= 75) {
    return 86;
  }
  if (cloudTotal > 90) {
    return 42;
  }
  return clampScore(70 - Math.abs(cloudTotal - 45) * 0.35);
}

function scoreLowCloudFogWallRisk(window: readonly NormalizedHourlyWeather[]): number {
  const lowCloud = averageDefined(window, (hour) => hour.cloudLow);
  const cloudTotal = averageHourly(window, (hour) => hour.cloudTotal);
  const humidity = averageDefined(window, (hour) => hour.humidity) ?? 0;
  const visibility = averageDefined(window, (hour) => hour.visibility);
  const fogOrMist = window.some((hour) => /(雾|霾|mist|fog|haze)/i.test(hour.weatherTextZh ?? ""));
  const baseRisk =
    lowCloud === undefined
      ? 46
      : lowCloud >= 90
        ? 88 + (lowCloud - 90) * 0.6
        : lowCloud >= 75
          ? 76 + (lowCloud - 75) * 0.5
          : lowCloud >= 50
            ? 56 + (lowCloud - 50) * 0.95
            : lowCloud >= 20
              ? 28 + (lowCloud - 20) * 0.45
              : lowCloud < 40
                ? 18 + lowCloud * 0.45
                : 38 + (lowCloud - 40) * 1.5;
  const totalCloudRisk = cloudTotal > 90 && (lowCloud ?? 0) > 55 ? 10 : 0;
  const fogRisk = (visibility ?? 99) < 5 && humidity >= 92 ? 12 : fogOrMist ? 10 : 0;

  return clampScore(baseRisk + totalCloudRisk + fogRisk);
}

function scoreCloudSuppressionRisk(
  window: readonly NormalizedHourlyWeather[],
  scores: {
    readonly colorCarrierScore: number;
    readonly visibilityColorQualityScore: number;
    readonly precipitationDisruptionRisk: number;
  },
): number {
  const lowCloud = averageDefined(window, (hour) => hour.cloudLow);
  const midCloud = averageDefined(window, (hour) => hour.cloudMid);
  const highCloud = averageDefined(window, (hour) => hour.cloudHigh);
  const totalCloud = averageDefined(window, (hour) => hour.cloudTotal);
  const humidity = averageDefined(window, (hour) => hour.humidity);
  const layerValues = [lowCloud, midCloud, highCloud].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const layerAverage =
    layerValues.length > 0
      ? layerValues.reduce((sum, value) => sum + value, 0) / layerValues.length
      : undefined;
  const denseLowRisk =
    lowCloud === undefined
      ? 18
      : lowCloud >= 92
        ? 36
        : lowCloud >= 76
          ? 26
          : lowCloud >= 62
            ? 14
            : 0;
  const denseMidRisk =
    midCloud === undefined
      ? 14
      : midCloud >= 92
        ? 32
        : midCloud >= 78
          ? 22
          : midCloud >= 68
            ? 12
            : 0;
  const denseTotalRisk =
    totalCloud === undefined
      ? 16
      : totalCloud >= 96
        ? 34
        : totalCloud >= 90
          ? 26
          : totalCloud >= 82
            ? 14
            : 0;
  const uniformLayerRisk =
    layerValues.length >= 3 &&
    (layerAverage ?? 0) >= 74 &&
    Math.max(...layerValues) - Math.min(...layerValues) <= 18
      ? 14
      : 0;
  const precipitationRisk =
    scores.precipitationDisruptionRisk >= 70
      ? 22
      : scores.precipitationDisruptionRisk >= 45
        ? 10
        : 0;
  const transparencyRisk =
    scores.visibilityColorQualityScore < 42
      ? 18
      : scores.visibilityColorQualityScore < 56
        ? 8
        : 0;
  const carrierOverpromiseRisk = scores.colorCarrierScore >= 68 && denseTotalRisk >= 26 ? 10 : 0;
  const humidityRisk =
    humidity !== undefined && humidity >= 94 && scores.visibilityColorQualityScore < 60 ? 8 : 0;

  return clampScore(
    denseLowRisk +
      denseMidRisk +
      denseTotalRisk +
      uniformLayerRisk +
      precipitationRisk +
      transparencyRisk +
      carrierOverpromiseRisk +
      humidityRisk,
  );
}

function assessGlowLightPathObstruction(
  input: ForecastCalculationInput,
  window: readonly NormalizedHourlyWeather[],
  phase: GlowPhase,
  scores: {
    readonly lowCloudFogWallRisk: number;
    readonly cloudSuppressionRisk: number;
    readonly precipitationDisruptionRisk: number;
    readonly visibilityColorQualityScore: number;
    readonly terrainScore: number;
  },
): GlowLightPathAssessment {
  const hasDirectionalData = hasDeterministicGlowLightPathData(input, phase);
  const terrainRisk = 100 - scores.terrainScore;
  const denseCloudChannelRisk = Math.max(
    scores.cloudSuppressionRisk * 0.72,
    scores.lowCloudFogWallRisk * 0.52,
  );
  const precipitationRisk =
    scores.precipitationDisruptionRisk >= 70
      ? 18
      : scores.precipitationDisruptionRisk >= 45
        ? 8
        : 0;
  const transparencyRisk =
    scores.visibilityColorQualityScore < 42
      ? 10
      : scores.visibilityColorQualityScore < 55
        ? 5
        : 0;
  const cloudLayerMissingPenalty = hasCloudLayerGaps(window) ? 8 : 0;
  const unknownDirectionPenalty = hasDirectionalData ? 0 : 12;
  const risk = clampScore(
    denseCloudChannelRisk +
      Math.max(0, terrainRisk - 28) * 0.75 +
      precipitationRisk +
      transparencyRisk +
      cloudLayerMissingPenalty +
      unknownDirectionPenalty,
  );

  return {
    risk,
    dataAvailability: hasDirectionalData ? "available" : "insufficient",
    confidence: hasDirectionalData
      ? input.terrainAnalysis.terrainProfile.elevationConfidence === "high"
        ? "high"
        : "medium"
      : "low",
  };
}

function scoreVisibilityColorQuality(window: readonly NormalizedHourlyWeather[]): number {
  const visibility = averageDefined(window, (hour) => hour.visibility);
  const transparency = averageDefined(window, (hour) => hour.photographyTransparencyScore);
  const humidity = averageDefined(window, (hour) => hour.humidity) ?? 0;
  const dewPointSpread = averageDefined(window, (hour) => hour.dewPointSpread ?? null);
  if (visibility === undefined) {
    return typeof transparency === "number" ? clampScore(transparency - 6) : 58;
  }
  const visibilityScore =
    visibility > 15
      ? clampScore(88 + Math.min(10, (visibility - 15) * 0.8))
      : visibility >= 8
        ? clampScore(68 + (visibility - 8) * 2.5)
        : visibility >= 3
          ? clampScore(34 + (visibility - 3) * 5)
          : clampScore(12 + visibility * 7);
  const transparencyScore = typeof transparency === "number" ? transparency : visibilityScore;
  const humidityPenalty =
    humidity >= 96 && visibility < 8
      ? 14
      : humidity >= 92 && visibility < 10
        ? 8
        : dewPointSpread !== undefined && dewPointSpread <= 2 && visibility < 8
          ? 8
          : 0;

  return clampScore(visibilityScore * 0.62 + transparencyScore * 0.38 - humidityPenalty);
}

function visibilityQualityConfidencePenalty(visibilityColorQualityScore: number): number {
  if (visibilityColorQualityScore < 42) {
    return 12;
  }
  if (visibilityColorQualityScore < 55) {
    return 6;
  }
  return 0;
}

function scoreAerosolAtmosphere(window: readonly NormalizedHourlyWeather[]): number | undefined {
  const aerosolOpticalDepth = averageDefined(window, (hour) => hour.aerosolOpticalDepth550);
  const pm25 = averageDefined(window, (hour) => hour.pm25);
  const pm10 = averageDefined(window, (hour) => hour.pm10);
  const dust = averageDefined(window, (hour) => hour.dust);
  const visibility = averageDefined(window, (hour) => hour.visibility);
  const humidity = averageDefined(window, (hour) => hour.humidity) ?? 0;
  const hasAerosolData =
    aerosolOpticalDepth !== undefined ||
    pm25 !== undefined ||
    pm10 !== undefined ||
    dust !== undefined;
  if (!hasAerosolData) {
    return undefined;
  }

  const aodScore =
    aerosolOpticalDepth === undefined
      ? 68
      : aerosolOpticalDepth < 0.03
        ? 66
        : aerosolOpticalDepth <= 0.18
          ? 84
          : aerosolOpticalDepth <= 0.32
            ? 74
            : aerosolOpticalDepth <= 0.55
              ? 54
              : 30;
  const pm25Penalty =
    pm25 === undefined ? 0 : pm25 >= 75 ? 34 : pm25 >= 45 ? 22 : pm25 >= 25 ? 8 : 0;
  const pm10Penalty =
    pm10 === undefined ? 0 : pm10 >= 150 ? 28 : pm10 >= 90 ? 16 : pm10 >= 55 ? 7 : 0;
  const dustPenalty =
    dust === undefined ? 0 : dust >= 120 ? 32 : dust >= 70 ? 20 : dust >= 35 ? 8 : 0;
  const hazePenalty =
    visibility !== undefined && visibility < 6 && humidity < 92
      ? 12
      : visibility !== undefined && visibility < 3
        ? 18
        : 0;
  const missingAodPenalty = aerosolOpticalDepth === undefined ? 4 : 0;

  return clampScore(
    aodScore - pm25Penalty - pm10Penalty - dustPenalty - hazePenalty - missingAodPenalty,
  );
}

function calculatePrecipitationDisruptionRisk(window: readonly NormalizedHourlyWeather[]): number {
  const precipitationProbability =
    averageDefined(window, (hour) => hour.precipitationProbability) ?? 0;
  const precipitation = averageDefined(window, (hour) => precipitationAmount(hour)) ?? 0;
  const activeRainText = window.some((hour) =>
    /(雨|雪|阵雨|rain|snow|shower)/i.test(hour.weatherTextZh ?? ""),
  );
  const riskLevel = strongestPrecipitationRisk(window);
  const amountRisk =
    precipitation >= 5
      ? 82
      : precipitation >= 2
        ? 68
        : precipitation >= 0.5
          ? 48
          : precipitation > 0.1
            ? 28
            : 0;
  const probabilityRisk =
    precipitationProbability >= 75
      ? 70
      : precipitationProbability >= 55
        ? 52
        : precipitationProbability >= 35
          ? 28
          : 0;
  const textRisk = activeRainText ? 18 : 0;
  const providerRisk =
    riskLevel === "high" ? 75 : riskLevel === "medium" ? 55 : riskLevel === "low" ? 30 : 0;

  return clampScore(Math.max(amountRisk, probabilityRisk, providerRisk) + textRisk);
}

function hasActivePrecipitation(window: readonly NormalizedHourlyWeather[]): boolean {
  return window.some((hour) => {
    const amount = precipitationAmount(hour) ?? 0;
    const probability =
      typeof hour.precipitationProbability === "number" ? hour.precipitationProbability : 0;
    const text = hour.weatherTextZh ?? "";
    return amount >= 0.2 || probability >= 60 || /(雨|雪|阵雨|rain|snow|shower)/i.test(text);
  });
}

function precipitationAmount(hour: NormalizedHourlyWeather): number | undefined {
  const values = [
    hour.precipitationAmountMm,
    hour.precipitation,
    hour.rainAmountMm,
    hour.snowAmountMm,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : undefined;
}

function strongestPrecipitationRisk(
  window: readonly NormalizedHourlyWeather[],
): "low" | "medium" | "high" | undefined {
  const levels = window.map((hour) => hour.precipitationRisk?.rainRiskLevel);
  if (levels.includes("high") || levels.includes("severe")) {
    return "high";
  }
  if (levels.includes("medium")) {
    return "medium";
  }
  if (levels.includes("low")) {
    return "low";
  }
  return undefined;
}

function glowRainRiskLevel(risk: number): GlowWindowRainRisk {
  if (risk >= 70) {
    return "high";
  }
  if (risk >= 40) {
    return "medium";
  }
  return "low";
}

function calculatePostRainOpeningChance(
  input: ForecastCalculationInput,
  candidate: GlowCandidate,
): GlowPostRainOpeningChance {
  const windowRainRisk = calculatePrecipitationDisruptionRisk(candidate.weatherWindow);
  if (hasActivePrecipitation(candidate.weatherWindow) || windowRainRisk >= 55) {
    return "low";
  }

  const lookbackStart = shiftForecastTime(input, candidate.start, -3);
  const recentRainWindow = weatherForWindow(input.hourlyWeather, lookbackStart, candidate.start);
  const recentRainRisk = calculatePrecipitationDisruptionRisk(recentRainWindow);
  const recentlyRained = hasActivePrecipitation(recentRainWindow) || recentRainRisk >= 45;

  if (!recentlyRained) {
    return "low";
  }

  const colorCarrierScore = scoreColorCarrier(candidate.weatherWindow);
  const visibilityColorQualityScore = scoreVisibilityColorQuality(candidate.weatherWindow);
  if (recentRainRisk >= 65 && colorCarrierScore >= 60 && visibilityColorQualityScore >= 55) {
    return "high";
  }
  if (colorCarrierScore >= 50 && visibilityColorQualityScore >= 45) {
    return "medium";
  }
  return "low";
}

function scoreTerrainObstruction(input: ForecastCalculationInput, phase: GlowPhase): number {
  const horizonAngle = horizonAngleForPhase(input, phase);
  const hasDeterministicLightPath = hasDeterministicGlowLightPathData(input, phase);
  const directionPenalty = hasDeterministicLightPath && hasBlockedDirection(input, phase) ? 24 : 0;
  const terrainConfidencePenalty =
    input.terrainAnalysis.terrainProfile.elevationConfidence === "low" ? 4 : 0;
  const viewingDirection = input.terrainAnalysis.terrainProfile.viewingDirection;
  const viewingPenalty =
    phase === "sunrise" && viewingDirection === "west"
      ? 6
      : phase === "sunset" && viewingDirection === "east"
        ? 6
        : 0;
  const penalty = directionPenalty + terrainConfidencePenalty + viewingPenalty;

  if (typeof horizonAngle !== "number" || !Number.isFinite(horizonAngle)) {
    return clampScore(66 - penalty);
  }
  if (horizonAngle <= 5) {
    return clampScore(92 - penalty);
  }
  if (horizonAngle <= 10) {
    return clampScore(78 - (horizonAngle - 5) * 3 - penalty);
  }
  return clampScore(56 - (horizonAngle - 10) * 4 - penalty);
}

function scoreWindHumidity(window: readonly NormalizedHourlyWeather[]): number {
  const windSpeed = averageHourly(window, (hour) => hour.windSpeed);
  const windGust = averageDefined(window, (hour) => hour.windGust);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const visibility = averageDefined(window, (hour) => hour.visibility);
  const windScore =
    windSpeed < 0.7
      ? 58
      : windSpeed <= 6
        ? 86
        : windSpeed <= 10
          ? clampScore(86 - (windSpeed - 6) * 7)
          : clampScore(52 - (windSpeed - 10) * 5);
  const gustPenalty = typeof windGust === "number" && windGust > 13 ? 12 : 0;
  const humidityPenalty = humidity > 92 && (visibility ?? 99) < 8 ? 18 : humidity > 96 ? 10 : 0;

  return clampScore(windScore - gustPenalty - humidityPenalty);
}

function phaseMetric(
  candidates: readonly GlowCandidate[],
  phase: GlowPhase,
  selector: (candidate: GlowCandidate) => number | undefined,
  options: { readonly applyCoreRainPenalty?: boolean } = {},
): number {
  const phaseCandidates = candidates.filter((candidate) => candidate.phase === phase);
  if (phaseCandidates.length === 0) {
    return 0;
  }
  const sorted = [...phaseCandidates].sort(
    (left, right) => (selector(right) ?? right.score) - (selector(left) ?? left.score),
  );
  const first = sorted[0];
  if (!first) {
    return 0;
  }
  const secondCandidate = sorted[1] ?? first;
  const best = selector(first) ?? first.score;
  const second = selector(secondCandidate) ?? secondCandidate.score;
  const coreRainPenalty =
    options.applyCoreRainPenalty === false
      ? 0
      : phaseCandidates.some(
            (candidate) =>
              (candidate.type === "sunrise_glow" || candidate.type === "sunset_glow") &&
              candidate.rainOverlapsWindow &&
              (candidate.precipitationDisruptionRisk ?? 0) >= 45,
          )
        ? 12
        : 0;
  return clampScore(best * 0.75 + second * 0.25 - coreRainPenalty);
}

function phaseOptionalMetric(
  candidates: readonly GlowCandidate[],
  phase: GlowPhase,
  selector: (candidate: GlowCandidate) => number | undefined,
  options: { readonly applyCoreRainPenalty?: boolean } = {},
): number | undefined {
  const phaseCandidates = candidates.filter((candidate) => candidate.phase === phase);
  if (phaseCandidates.length === 0) {
    return undefined;
  }
  return phaseMetric(phaseCandidates, phase, selector, options);
}

function calculateLowCloudObstructionRisk(candidates: readonly GlowCandidate[]): number {
  if (candidates.length === 0) {
    return 0;
  }

  const maxRisk = Math.max(
    ...candidates.map((candidate) =>
      scoreLowCloudFogWallRisk(candidate.weatherWindow),
    ),
  );
  return clampScore(maxRisk);
}

function calculateGlowLightPathObstructionRisk(candidates: readonly GlowCandidate[]): number {
  return maxCandidateScore(
    candidates,
    (candidate) => candidate.glowLightPathObstructionRisk,
    () => 0,
  );
}

function calculateCloudSuppressionRiskForCandidates(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): number {
  return maxCandidateScore(
    candidates,
    (candidate) => candidate.cloudSuppressionRisk,
    () =>
      scoreCloudSuppressionRisk(input.hourlyWeather, {
        colorCarrierScore: scoreColorCarrier(input.hourlyWeather),
        visibilityColorQualityScore: scoreVisibilityColorQuality(input.hourlyWeather),
        precipitationDisruptionRisk: calculatePrecipitationDisruptionRisk(input.hourlyWeather),
      }),
  );
}

function aggregateGlowLightPathDataAvailability(
  candidates: readonly GlowCandidate[],
): GlowRiskDataAvailability {
  return candidates.some((candidate) => candidate.glowLightPathDataAvailability === "available")
    ? "available"
    : "insufficient";
}

function aggregateGlowLightPathConfidence(
  candidates: readonly GlowCandidate[],
): GlowAnalysisResult["confidenceLevel"] {
  if (candidates.some((candidate) => candidate.glowLightPathConfidence === "high")) {
    return "high";
  }
  if (candidates.some((candidate) => candidate.glowLightPathConfidence === "medium")) {
    return "medium";
  }
  return "low";
}

function maxCandidateScore(
  candidates: readonly GlowCandidate[],
  selector: (candidate: GlowCandidate) => number | undefined,
  fallback: () => number,
): number {
  const scores = candidates
    .map((candidate) => selector(candidate))
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return clampScore(scores.length > 0 ? Math.max(...scores) : fallback());
}

function isShootableGlowWindow(window: GlowCandidate): boolean {
  const colorCarrierScore = window.colorCarrierScore ?? 0;
  const lowCloudRisk = window.lowCloudObstructionRisk ?? 100;
  const lightPathRisk = window.glowLightPathObstructionRisk ?? 100;
  const cloudSuppressionRisk = window.cloudSuppressionRisk ?? 100;
  const precipitationRisk = window.precipitationDisruptionRisk ?? 100;
  const visibilityScore = window.visibilityColorQualityScore ?? 0;
  const aerosolScore = window.aerosolScore ?? 65;
  const terrainScore = window.terrainScore ?? 50;
  const lightPathAvailable = window.glowLightPathDataAvailability === "available";

  return (
    window.score >= 60 &&
    colorCarrierScore >= 55 &&
    lowCloudRisk < 76 &&
    lightPathRisk < 70 &&
    cloudSuppressionRisk < 68 &&
    precipitationRisk < 58 &&
    visibilityScore >= 52 &&
    aerosolScore >= 38 &&
    terrainScore >= 45 &&
    lightPathAvailable &&
    !window.rainOverlapsWindow
  );
}

function strongestPostRainOpening(candidates: readonly GlowCandidate[]): GlowPostRainOpeningChance {
  if (candidates.some((candidate) => candidate.postRainOpeningChance === "high")) {
    return "high";
  }
  if (candidates.some((candidate) => candidate.postRainOpeningChance === "medium")) {
    return "medium";
  }
  return "low";
}

function strongestRainRisk(candidates: readonly GlowCandidate[]): GlowWindowRainRisk {
  if (candidates.some((candidate) => candidate.glowWindowRainRisk === "high")) {
    return "high";
  }
  if (candidates.some((candidate) => candidate.glowWindowRainRisk === "medium")) {
    return "medium";
  }
  return "low";
}

function buildCanonicalGlowWindows(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
  scores: {
    readonly sunriseGlowScore: number;
    readonly sunsetGlowScore: number;
    readonly confidence: number;
  },
): readonly GlowCanonicalWindow[] {
  return input.astroSummaries.flatMap((astro) => [
    buildCanonicalGlowWindow(input, candidates, astro, "sunrise", {
      probabilityScore: scores.sunriseGlowScore,
      confidence: scores.confidence,
    }),
    buildCanonicalGlowWindow(input, candidates, astro, "sunset", {
      probabilityScore: scores.sunsetGlowScore,
      confidence: scores.confidence,
    }),
  ]);
}

function buildCanonicalGlowWindow(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
  astro: AstroSummary,
  phase: GlowPhase,
  scores: {
    readonly probabilityScore: number;
    readonly confidence: number;
  },
): GlowCanonicalWindow {
  const candidate = candidates.find((item) => item.date === astro.date && item.phase === phase);
  const eventAt = phase === "sunrise" ? astro.sunrise : astro.sunset;
  const candidateStartAt =
    candidate?.candidateStartAt ??
    (phase === "sunrise" ? astro.sunriseGlowCandidateStartAt : astro.sunsetGlowCandidateStartAt);
  const candidateEndAt =
    candidate?.candidateEndAt ??
    (phase === "sunrise" ? astro.sunriseGlowCandidateEndAt : astro.sunsetGlowCandidateEndAt);
  const bestStartAt =
    candidate?.start ??
    (phase === "sunrise" ? astro.sunriseGlowBestStartAt : astro.sunsetGlowBestStartAt);
  const bestEndAt =
    candidate?.end ??
    (phase === "sunrise" ? astro.sunriseGlowBestEndAt : astro.sunsetGlowBestEndAt);
  const hasGeometry = Boolean(candidateStartAt && candidateEndAt && bestStartAt && bestEndAt);

  return {
    phase,
    date: astro.date,
    timezone: astro.timezone,
    eventAt,
    candidateStartAt,
    candidateEndAt,
    bestStartAt: candidate ? bestStartAt : undefined,
    bestEndAt: candidate ? bestEndAt : undefined,
    probabilityScore: candidate ? scores.probabilityScore : undefined,
    occurrenceProbabilityPercent: candidate?.occurrenceProbabilityPercent,
    vividnessIndex: candidate?.vividnessIndex,
    vividnessLevel: candidate?.vividnessLevel,
    practicalSuitabilityScore: candidate?.practicalSuitabilityScore ?? candidate?.practicalScore,
    recommendationLabel:
      candidate?.recommendationLabel ??
      (candidate?.practicalSuitabilityScore !== undefined
        ? glowRecommendationLabel(candidate.practicalSuitabilityScore)
        : undefined),
    calibrationMode: candidate ? glowOccurrenceProbabilityCalibrationMode : undefined,
    providerAgreement: candidate?.providerAgreement,
    scoreBreakdown: candidate?.scoreBreakdown,
    modelResults: candidate?.modelResults,
    confidence: candidate ? (candidate.confidence ?? scores.confidence) : undefined,
    windowDerivationMethod:
      candidate?.windowDerivationMethod ??
      astro.glowWindowDerivationMethod ??
      glowSolarAltitudeGeometryConfig.windowDerivationMethod,
    weatherResolutionMinutes:
      candidate?.weatherResolutionMinutes ?? estimateWeatherResolutionMinutes(input.hourlyWeather),
    solarCalculationResolutionMinutes:
      candidate?.solarCalculationResolutionMinutes ??
      astro.solarCalculationResolutionMinutes ??
      glowSolarAltitudeGeometryConfig.solarCalculationResolutionMinutes,
    elevationMeters: astro.elevationMeters ?? null,
    elevationAvailable: astro.elevationAvailable ?? typeof astro.elevationMeters === "number",
    unavailableReason: candidate
      ? undefined
      : !eventAt
        ? "missing_astronomical_event"
        : !hasGeometry
          ? "missing_solar_altitude_crossing"
          : "missing_weather_in_solar_geometry_window",
  };
}

function buildGlowWindowDiagnostics(
  input: ForecastCalculationInput,
  canonicalWindows: readonly GlowCanonicalWindow[],
): readonly GlowWindowDiagnostic[] {
  return canonicalWindows.map((window) => {
    const astro = input.astroSummaries.find((summary) => summary.date === window.date);
    return {
      ...window,
      target: "glow",
      latitudeValid: isValidCoordinate(input.place.coordinates.latitude, -90, 90),
      longitudeValid: isValidCoordinate(input.place.coordinates.longitude, -180, 180),
      sunriseAt: astro?.sunrise,
      sunsetAt: astro?.sunset,
      solarAltitudeCrossings:
        window.phase === "sunrise"
          ? astro?.sunriseAltitudeCrossings
          : astro?.sunsetAltitudeCrossings,
    };
  });
}

function calculateGlowTravelScore(
  sunriseGlowScore: number,
  sunsetGlowScore: number,
  lowCloudObstructionRisk: number,
  glowLightPathObstructionRisk: number,
  glowLightPathDataAvailability: GlowRiskDataAvailability,
  cloudSuppressionRisk: number,
  precipitationDisruptionRisk: number,
  visibilityColorQualityScore: number,
  input: ForecastCalculationInput,
): number {
  const bestGlow = Math.max(sunriseGlowScore, sunsetGlowScore);
  const secondGlow = Math.min(sunriseGlowScore, sunsetGlowScore);
  const visibilityScore = Math.max(
    visibilityColorQualityScore,
    scoreVisibilityColorQuality(input.hourlyWeather),
  );
  const rainPenalty =
    precipitationDisruptionRisk >= 78 ? 16 : precipitationDisruptionRisk >= 58 ? 8 : 0;
  const lowCloudPenalty =
    lowCloudObstructionRisk >= 82 ? 12 : lowCloudObstructionRisk >= 70 ? 6 : 0;
  const lightPathPenalty =
    glowLightPathObstructionRisk >= 82 ? 18 : glowLightPathObstructionRisk >= 68 ? 9 : 0;
  const suppressionPenalty =
    cloudSuppressionRisk >= 80 ? 16 : cloudSuppressionRisk >= 65 ? 8 : 0;
  const lightPathUncertaintyPenalty =
    glowLightPathDataAvailability === "insufficient" ? 8 : 0;

  const score = clampScore(
    bestGlow * 0.58 +
      secondGlow * 0.14 +
      visibilityScore * 0.14 +
      (100 - glowLightPathObstructionRisk) * 0.08 +
      (100 - cloudSuppressionRisk) * 0.04 +
      (100 - lowCloudObstructionRisk) * 0.04 +
      (100 - precipitationDisruptionRisk) * 0.06 -
      rainPenalty -
      lowCloudPenalty -
      lightPathPenalty -
      suppressionPenalty -
      lightPathUncertaintyPenalty,
  );
  return glowLightPathDataAvailability === "insufficient" ? Math.min(score, 64) : score;
}

function buildDailyGlow(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly GlowAnalysisResult["dailyGlow"][number][] {
  return input.calendarBasis.targetDates.map((date, index) => {
    const dayWindows = candidates.filter((candidate) => candidate.date === date);
    const sunriseScore = phaseMetric(
      dayWindows,
      "sunrise",
      (window) => window.occurrenceProbabilityPercent,
    );
    const sunsetScore = phaseMetric(
      dayWindows,
      "sunset",
      (window) => window.occurrenceProbabilityPercent,
    );
    const sunrisePracticalScore = phaseMetric(
      dayWindows,
      "sunrise",
      (window) => window.practicalSuitabilityScore ?? window.practicalScore ?? window.score,
    );
    const sunsetPracticalScore = phaseMetric(
      dayWindows,
      "sunset",
      (window) => window.practicalSuitabilityScore ?? window.practicalScore ?? window.score,
    );
    const bestWindow = [...dayWindows]
      .filter(isShootableGlowWindow)
      .sort((left, right) => right.score - left.score)[0];
    const watchableWindow = [...dayWindows]
      .filter((window) => !isShootableGlowWindow(window) && window.score >= 42)
      .sort((left, right) => right.score - left.score)[0];
    const notRecommendedWindow = [...dayWindows]
      .filter(
        (window) =>
          window.score < 42 ||
          (window.lowCloudObstructionRisk ?? 0) >= 76 ||
          (window.glowLightPathObstructionRisk ?? 0) >= 76 ||
          (window.cloudSuppressionRisk ?? 0) >= 74 ||
          (window.precipitationDisruptionRisk ?? 0) >= 70,
      )
      .sort(
        (left, right) =>
          (right.conditionScore ?? right.score) - (left.conditionScore ?? left.score),
      )[0];
    const rawPracticalScore =
      bestWindow?.practicalScore ??
      watchableWindow?.practicalScore ??
      Math.max(sunriseScore, sunsetScore);
    const practicalScore = bestWindow
      ? rawPracticalScore
      : Math.min(rawPracticalScore, watchableWindow ? 54 : 38);
    const colorCarrierScore = maxCandidateScore(
      dayWindows,
      (window) => window.colorCarrierScore,
      () => 0,
    );
    const lowCloudObstructionRisk = maxCandidateScore(
      dayWindows,
      (window) => window.lowCloudObstructionRisk,
      () => 0,
    );
    const lowCloudFogWallRisk = lowCloudObstructionRisk;
    const glowLightPathObstructionRisk = maxCandidateScore(
      dayWindows,
      (window) => window.glowLightPathObstructionRisk,
      () => 0,
    );
    const cloudSuppressionRisk = maxCandidateScore(
      dayWindows,
      (window) => window.cloudSuppressionRisk,
      () => 0,
    );
    const glowLightPathDataAvailability = aggregateGlowLightPathDataAvailability(dayWindows);
    const glowLightPathConfidence = aggregateGlowLightPathConfidence(dayWindows);
    const precipitationDisruptionRisk = maxCandidateScore(
      dayWindows,
      (window) => window.precipitationDisruptionRisk,
      () => 0,
    );
    const visibilityColorQualityScore = maxCandidateScore(
      dayWindows,
      (window) => window.visibilityColorQualityScore,
      () => 0,
    );
    const aerosolScores = dayWindows
      .map((window) => window.aerosolScore)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    const fallbackAerosolScore = scoreAerosolAtmosphere(candidateWeatherOrAll(input, dayWindows));
    const aerosolScore =
      aerosolScores.length > 0 ? clampScore(Math.max(...aerosolScores)) : fallbackAerosolScore;
    const occurrenceProbabilityPercent = maxCandidateScore(
      dayWindows,
      (window) => window.occurrenceProbabilityPercent,
      () => Math.max(sunriseScore, sunsetScore),
    );
    const vividnessIndex = maxCandidateScore(
      dayWindows,
      (window) => window.vividnessIndex,
      () => 0,
    );
    const vividnessLevel = glowVividnessLevelForScore(vividnessIndex);
    const bestMetric = bestMetricCandidate(dayWindows);
    const bestTarget = pickBestDailyGlowTarget(sunrisePracticalScore, sunsetPracticalScore);
    const sunriseVividnessIndex = phaseOptionalMetric(
      dayWindows,
      "sunrise",
      (window) => window.vividnessIndex,
      { applyCoreRainPenalty: false },
    );
    const sunsetVividnessIndex = phaseOptionalMetric(
      dayWindows,
      "sunset",
      (window) => window.vividnessIndex,
      { applyCoreRainPenalty: false },
    );
    const sunriseBestWindow = bestPhaseWindow(dayWindows, "sunrise");
    const sunsetBestWindow = bestPhaseWindow(dayWindows, "sunset");
    const riskNote = bestWindow?.riskTags.length
      ? bestWindow.riskTags.join("、")
      : watchableWindow?.riskTags.length
        ? watchableWindow.riskTags.join("、")
        : "暂无高确定性霞光窗口，需等待短临云层和降水复核。";
    const publicBestWindow = bestWindow ? toPublicGlowWindow(bestWindow) : undefined;
    const publicWatchableWindow = watchableWindow ? toPublicGlowWindow(watchableWindow) : undefined;
    const publicNotRecommendedWindow = notRecommendedWindow
      ? toPublicGlowWindow(notRecommendedWindow)
      : undefined;

    return {
      date,
      dateLabelZh: input.calendarBasis.targetDateLabels[index] ?? date,
      sunriseScore,
      sunsetScore,
      practicalScore,
      occurrenceProbabilityPercent,
      vividnessIndex,
      vividnessLevel,
      practicalSuitabilityScore: practicalScore,
      providerAgreement: bestMetric?.providerAgreement,
      scoreBreakdown: bestMetric?.scoreBreakdown,
      sunriseOccurrenceProbabilityPercent: sunriseScore,
      sunsetOccurrenceProbabilityPercent: sunsetScore,
      sunriseVividnessIndex,
      sunsetVividnessIndex,
      sunriseVividnessLevel:
        sunriseVividnessIndex !== undefined
          ? glowVividnessLevelForScore(sunriseVividnessIndex)
          : undefined,
      sunsetVividnessLevel:
        sunsetVividnessIndex !== undefined
          ? glowVividnessLevelForScore(sunsetVividnessIndex)
          : undefined,
      sunrisePracticalSuitabilityScore: sunrisePracticalScore,
      sunsetPracticalSuitabilityScore: sunsetPracticalScore,
      sunriseProviderAgreement: sunriseBestWindow?.providerAgreement,
      sunsetProviderAgreement: sunsetBestWindow?.providerAgreement,
      sunriseScoreBreakdown: sunriseBestWindow?.scoreBreakdown,
      sunsetScoreBreakdown: sunsetBestWindow?.scoreBreakdown,
      colorCarrierScore,
      lowCloudObstructionRisk,
      lowCloudFogWallRisk,
      glowLightPathObstructionRisk,
      glowLightPathDataAvailability,
      glowLightPathConfidence,
      cloudSuppressionRisk,
      glowCarrierScore: colorCarrierScore,
      precipitationDisruptionRisk,
      visibilityColorQualityScore,
      aerosolScore,
      labels: buildGlowLabels(
        sunriseScore,
        sunsetScore,
        lowCloudObstructionRisk,
        glowLightPathObstructionRisk,
        cloudSuppressionRisk,
        colorCarrierScore,
        publicBestWindow,
        publicWatchableWindow,
        publicNotRecommendedWindow,
      ),
      bestWindow: publicBestWindow,
      watchableWindow: publicWatchableWindow,
      notRecommendedWindow: publicNotRecommendedWindow,
      rainOverlapsSunriseWindow: dayWindows.some(
        (window) => window.phase === "sunrise" && window.rainOverlapsWindow,
      ),
      rainOverlapsSunsetWindow: dayWindows.some(
        (window) => window.phase === "sunset" && window.rainOverlapsWindow,
      ),
      postRainOpeningChance: strongestPostRainOpening(dayWindows),
      glowWindowRainRisk: strongestRainRisk(dayWindows),
      bestTarget,
      recommendationLabel: glowRecommendationLabel(practicalScore),
      keyReason: dailyKeyReason(bestTarget, sunriseScore, sunsetScore, publicBestWindow),
      riskNote,
    };
  });
}

function pickBestDailyGlowTarget(
  sunriseScore: number,
  sunsetScore: number,
): GlowAnalysisResult["dailyGlow"][number]["bestTarget"] {
  if (sunriseScore < 50 && sunsetScore < 50) {
    return "none";
  }
  if (sunriseScore >= 65 && sunsetScore >= 65 && Math.abs(sunriseScore - sunsetScore) <= 8) {
    return "both";
  }
  return sunriseScore >= sunsetScore ? "sunrise" : "sunset";
}

function dailyKeyReason(
  bestTarget: GlowAnalysisResult["dailyGlow"][number]["bestTarget"],
  sunriseScore: number,
  sunsetScore: number,
  bestWindow: GlowWindow | undefined,
): string {
  if (!bestWindow) {
    return "暂无高确定性霞光窗口，不建议只为霞光专程出发。";
  }
  if (bestTarget === "both") {
    return `朝霞 ${sunriseScore} 分、晚霞 ${sunsetScore} 分，两个窗口都值得纳入计划。`;
  }
  if (bestTarget === "sunrise") {
    return `朝霞 ${sunriseScore} 分高于晚霞，优先关注日出前后中高云、东方光路和云层压制风险。`;
  }
  if (bestTarget === "sunset") {
    return `晚霞 ${sunsetScore} 分高于朝霞，优先观察日落前云层移动和西向通透度。`;
  }
  return `${bestWindow.labelZh}仅作谨慎参考，建议同步准备其他题材。`;
}

function buildCloudLayerEvidence(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly GlowEvidenceItem[] {
  const weather = candidateWeatherOrAll(input, candidates);
  const cloudTotal = averageDefined(weather, (hour) => hour.cloudTotal);
  const cloudLow = averageDefined(weather, (hour) => hour.cloudLow);
  const cloudMid = averageDefined(weather, (hour) => hour.cloudMid);
  const cloudHigh = averageDefined(weather, (hour) => hour.cloudHigh);

  return [
    {
      label: "总云量",
      value: formatPercentValue(cloudTotal),
      effect: effectFromScore(scoreTotalCloud(cloudTotal ?? 0)),
      noteZh: "总云量 20%-75% 通常更容易形成可用霞光层次；过少缺少色彩载体，过厚会降低反差。",
    },
    {
      label: "低云",
      value: formatPercentValue(cloudLow),
      effect: cloudLow !== undefined && cloudLow > 70 ? "risk" : "neutral",
      noteZh: "低云偏厚会增加近地雾墙和低云墙风险；太阳方向光路是否打开需依赖独立方向性数据或现场复核。",
    },
    {
      label: "中云",
      value: formatPercentValue(cloudMid),
      effect: cloudMid !== undefined && cloudMid >= 20 && cloudMid <= 70 ? "positive" : "neutral",
      noteZh: "适量中云可承载霞光色彩，过少时朝晚霞面积通常偏小。",
    },
    {
      label: "高云",
      value: formatPercentValue(cloudHigh),
      effect:
        cloudHigh !== undefined && cloudHigh >= 20 && cloudHigh <= 70 ? "positive" : "neutral",
      noteZh: "高云是霞光色彩的重要载体，高云极厚时仍可有颜色，但画面对比度会下降。",
    },
  ];
}

function buildVisibilityEvidence(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly GlowEvidenceItem[] {
  const weather = candidateWeatherOrAll(input, candidates);
  const visibility = averageDefined(weather, (hour) => hour.visibility);
  const humidity = averageDefined(weather, (hour) => hour.humidity);
  const precipitationProbability = averageDefined(weather, (hour) => hour.precipitationProbability);
  const windSpeed = averageDefined(weather, (hour) => hour.windSpeed);

  return [
    {
      label: "能见度",
      value: visibility === undefined ? "暂缺数据" : `${Math.round(visibility)} km`,
      effect: effectFromScore(scoreVisibilityColorQuality(weather)),
      noteZh:
        visibility !== undefined && visibility > 15
          ? "能见度较好，有利于远山层次和霞光色彩稳定。"
          : "能见度不足会削弱远山层次、色彩纯度和日出日落通透度。",
    },
    {
      label: "湿度",
      value: formatPercentValue(humidity),
      effect:
        humidity !== undefined && humidity > 92 && (visibility ?? 99) < 8 ? "risk" : "neutral",
      noteZh: "湿度本身不直接否定霞光，但高湿叠加低能见度会削弱颜色和反差。",
    },
    {
      label: "降水",
      value: formatPercentValue(precipitationProbability),
      effect: calculatePrecipitationDisruptionRisk(weather) >= 45 ? "risk" : "neutral",
      noteZh: "窗口内高降水概率或实际降水会明显压低霞光稳定性和拍摄价值。",
    },
    {
      label: "风速",
      value: windSpeed === undefined ? "暂缺数据" : `${windSpeed.toFixed(1)} m/s`,
      effect: effectFromScore(scoreWindHumidity(weather)),
      noteZh: "适度风速有利于云层移动；强风会破坏云层结构并增加拍摄难度，近零风可能保留雾霾。",
    },
  ];
}

function buildGlowAerosolAssessment(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): GlowAerosolAssessment {
  const weather = candidateWeatherOrAll(input, candidates);
  const aerosolOpticalDepth550 = averageDefined(weather, (hour) => hour.aerosolOpticalDepth550);
  const pm25 = averageDefined(weather, (hour) => hour.pm25);
  const pm10 = averageDefined(weather, (hour) => hour.pm10);
  const dust = averageDefined(weather, (hour) => hour.dust);
  const visibilityKm = averageDefined(weather, (hour) => hour.visibility);
  const aerosolScore = scoreAerosolAtmosphere(weather);
  const referenceHour = weather.find(
    (hour) => hour.aerosolAvailability !== undefined && hour.aerosolAvailability !== "unavailable",
  );
  const availableFieldCount = [aerosolOpticalDepth550, pm25, pm10, dust].filter(
    (value) => value !== undefined,
  ).length;

  if (aerosolScore === undefined || availableFieldCount === 0) {
    return {
      availability: "unavailable",
      confidence: "low",
      state: "unavailable",
      stateLabelZh: "暂缺区域大气参考",
      implicationZh: "不把气溶胶当作加分或扣分项，霞光判断主要看云层、降水和通透度。",
      noteZh: "未收到 AOD、PM 或沙尘参考值；不会用 0 或晴朗假设替代。",
      scoreImpact: 0,
      visibilityKm,
    };
  }

  const state = aerosolStateFromInputs({
    aerosolScore,
    aerosolOpticalDepth550,
    pm25,
    pm10,
    dust,
  });

  return {
    availability: availableFieldCount >= 3 ? "available" : "partial",
    confidence: availableFieldCount >= 3 ? "high" : "medium",
    state,
    stateLabelZh: aerosolStateLabelZh(state),
    implicationZh: aerosolImplicationZh(state),
    noteZh: "气溶胶按区域参考处理，只解释透明度和散射倾向，不代表机位实测。",
    scoreImpact: aerosolScore >= 80 ? 4 : aerosolScore >= 60 ? 0 : aerosolScore >= 45 ? -6 : -14,
    aerosolScore,
    aerosolOpticalDepth550,
    pm25,
    pm10,
    dust,
    visibilityKm,
    validTime: referenceHour?.aerosolValidTime,
    sourceResolution: referenceHour?.aerosolSourceResolution,
  };
}

function buildAerosolEvidence(assessment: GlowAerosolAssessment): readonly GlowEvidenceItem[] {
  return [
    {
      label: "AOD 550nm",
      value: formatDecimalValue(assessment.aerosolOpticalDepth550, 3),
      effect: aerosolEvidenceEffect(assessment),
      noteZh: "中等气溶胶可能增强低角度散射；过高时会压低通透度和色彩纯度。",
    },
    {
      label: "PM2.5",
      value: formatConcentrationValue(assessment.pm25),
      effect:
        assessment.pm25 !== undefined && assessment.pm25 !== null && assessment.pm25 >= 45
          ? "risk"
          : "neutral",
      noteZh: "颗粒物偏高时，远山层次和霞光饱和度会被削弱。",
    },
    {
      label: "PM10 / 沙尘",
      value: `${formatConcentrationValue(assessment.pm10)} / ${formatConcentrationValue(
        assessment.dust,
      )}`,
      effect:
        (assessment.pm10 !== undefined && assessment.pm10 !== null && assessment.pm10 >= 90) ||
        (assessment.dust !== undefined && assessment.dust !== null && assessment.dust >= 70)
          ? "risk"
          : "neutral",
      noteZh: "粗颗粒或沙尘信号偏高时，霞光容易变灰、变脏或远景发白。",
    },
    {
      label: "大气结论",
      value: assessment.stateLabelZh,
      effect: aerosolEvidenceEffect(assessment),
      noteZh: assessment.implicationZh,
    },
  ];
}

function buildTerrainObstructionAssessments(
  input: ForecastCalculationInput,
): readonly GlowTerrainObstructionAssessment[] {
  return input.astroSummaries.flatMap((astro) => {
    const assessments: GlowTerrainObstructionAssessment[] = [];
    if (astro.sunrise) {
      assessments.push(buildTerrainObstructionAssessment(input, astro, "sunrise"));
    }
    if (astro.sunset) {
      assessments.push(buildTerrainObstructionAssessment(input, astro, "sunset"));
    }
    return assessments;
  });
}

function buildTerrainObstructionAssessment(
  input: ForecastCalculationInput,
  astro: AstroSummary,
  phase: GlowPhase,
): GlowTerrainObstructionAssessment {
  const horizonAngle = horizonAngleForPhase(input, phase);
  const solarAzimuthDegrees =
    phase === "sunrise" ? astro.sunriseAzimuth ?? null : astro.sunsetAzimuth ?? null;
  const hasProfile = hasDirectionalTerrainProfile(input);
  const dataAvailable =
    hasProfile &&
    typeof horizonAngle === "number" &&
    Number.isFinite(horizonAngle) &&
    typeof solarAzimuthDegrees === "number" &&
    Number.isFinite(solarAzimuthDegrees);
  const solarElevationDegrees = dataAvailable ? 6 : null;
  const solarClearanceDegrees =
    dataAvailable && solarElevationDegrees !== null
      ? Math.round((solarElevationDegrees - horizonAngle) * 10) / 10
      : null;
  const blocked = hasBlockedDirection(input, phase);
  const obstructionStatus = !dataAvailable
    ? "unavailable"
    : blocked || (solarClearanceDegrees ?? 0) < -4
      ? "blocked"
      : (solarClearanceDegrees ?? 0) < 1
        ? "marginal"
        : "clear";

  return {
    phase,
    date: astro.date,
    solarAzimuthDegrees,
    solarElevationDegrees,
    terrainHorizonAngleDegrees: dataAvailable ? horizonAngle : null,
    solarClearanceDegrees,
    obstructionStatus,
    confidence: dataAvailable
      ? input.terrainAnalysis.terrainProfile.elevationConfidence === "high"
        ? "high"
        : "medium"
      : "low",
    dataAvailable,
    labelZh: phase === "sunrise" ? "日出方向地形遮挡" : "日落方向地形遮挡",
    noteZh: terrainObstructionNoteZh(obstructionStatus, phase),
  };
}

function aerosolEvidenceEffect(assessment: GlowAerosolAssessment): CloudSeaEvidenceEffect {
  if (assessment.availability === "unavailable" || assessment.aerosolScore === undefined) {
    return "neutral";
  }
  if (assessment.aerosolScore >= 72) {
    return "positive";
  }
  if (assessment.aerosolScore < 50) {
    return "risk";
  }
  return "neutral";
}

function aerosolStateFromInputs(input: {
  readonly aerosolScore: number;
  readonly aerosolOpticalDepth550?: number;
  readonly pm25?: number;
  readonly pm10?: number;
  readonly dust?: number;
}): GlowAerosolAssessment["state"] {
  if ((input.dust ?? 0) >= 70 || (input.pm10 ?? 0) >= 120) {
    return "dusty";
  }
  if (input.aerosolScore < 45 || (input.pm25 ?? 0) >= 55) {
    return "hazy";
  }
  if (input.aerosolScore < 62) {
    return "muted";
  }
  if (
    input.aerosolOpticalDepth550 !== undefined &&
    input.aerosolOpticalDepth550 >= 0.04 &&
    input.aerosolOpticalDepth550 <= 0.22 &&
    input.aerosolScore >= 72
  ) {
    return "favorable_scatter";
  }
  return "clean";
}

function aerosolStateLabelZh(state: GlowAerosolAssessment["state"]): string {
  switch (state) {
    case "favorable_scatter":
      return "散射条件较有利";
    case "muted":
      return "透明度略受压制";
    case "hazy":
      return "霾/颗粒物偏高";
    case "dusty":
      return "粗颗粒或沙尘偏高";
    case "unavailable":
      return "暂缺区域大气参考";
    case "clean":
    default:
      return "空气较干净";
  }
}

function aerosolImplicationZh(state: GlowAerosolAssessment["state"]): string {
  switch (state) {
    case "favorable_scatter":
      return "低角度光线有一定散射载体，若中高云配合，霞光颜色更容易铺开。";
    case "muted":
      return "散射载体存在但通透度一般，适合保守看待色彩强度。";
    case "hazy":
      return "细颗粒物会削弱远景层次和色彩纯度，霞光容易偏灰。";
    case "dusty":
      return "粗颗粒或沙尘会明显压低画面洁净度，不建议把霞光作为唯一目标。";
    case "unavailable":
      return "缺少大气参考，不用气溶胶调整霞光判断。";
    case "clean":
    default:
      return "通透度压力较小，但若气溶胶过低，霞光面积仍主要取决于云层载体。";
  }
}

function terrainObstructionNoteZh(
  status: GlowTerrainObstructionAssessment["obstructionStatus"],
  phase: GlowPhase,
): string {
  const target = phase === "sunrise" ? "日出" : "日落";
  switch (status) {
    case "clear":
      return `${target}方向低角度光线有较好地形余量，遮挡不是主要风险。`;
    case "marginal":
      return `${target}方向地平遮挡接近核心低角度光线，需要现场确认机位是否能越过山脊或建筑。`;
    case "blocked":
      return `${target}方向地形遮挡偏强，直射光和近地平霞光可能被压缩。`;
    case "unavailable":
    default:
      return "缺少可用的方向性地形剖面，不用单点海拔推断遮挡。";
  }
}

function buildTerrainEvidence(input: ForecastCalculationInput): readonly GlowEvidenceItem[] {
  const horizon = input.terrainAnalysis.horizonProfile;
  return [
    {
      label: "日出地平遮挡",
      value: formatAngle(horizon.sunriseHorizonAngle),
      effect: terrainEffect(horizon.sunriseHorizonAngle, "sunrise", input),
      noteZh: hasBlockedDirection(input, "sunrise")
        ? "东方或东南方向存在遮挡参考，朝霞低角度光线可能被压缩。"
        : "日出方向遮挡角用于判断第一束低角度光线是否容易被山体或建筑挡住。",
    },
    {
      label: "日落地平遮挡",
      value: formatAngle(horizon.sunsetHorizonAngle),
      effect: terrainEffect(horizon.sunsetHorizonAngle, "sunset", input),
      noteZh: hasBlockedDirection(input, "sunset")
        ? "西方或西南方向存在遮挡参考，晚霞和余晖窗口需要保守看待。"
        : "日落方向遮挡角用于判断最后一束暖光和余晖是否容易被山脊挡住。",
    },
    {
      label: "遮挡方向",
      value:
        horizon.blockedDirectionsZh.length > 0
          ? horizon.blockedDirectionsZh.join("、")
          : "暂无明显方向",
      effect: horizon.blockedDirectionsZh.length > 0 ? "neutral" : "positive",
      noteZh: horizon.obstructionNoteZh || missingTerrainNote,
    },
  ];
}

function buildGlowRiskReasons(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
  risks: {
    readonly lowCloudFogWallRisk: number;
    readonly glowLightPathObstructionRisk: number;
    readonly glowLightPathDataAvailability: GlowRiskDataAvailability;
    readonly cloudSuppressionRisk: number;
  },
): readonly string[] {
  const reasons: string[] = [];
  const bestSunrise = bestPhaseWindow(candidates, "sunrise");
  const bestSunset = bestPhaseWindow(candidates, "sunset");

  if (risks.lowCloudFogWallRisk >= 75) {
    reasons.push("低云/雾墙风险高，近地低云、雾或低云墙可能压住机位视野。");
  } else if (risks.lowCloudFogWallRisk >= 50) {
    reasons.push("低云/雾墙风险中等，只能说明近地雾墙需要复核，不等同于太阳方向光路已打开。");
  }
  if (risks.glowLightPathDataAvailability === "insufficient") {
    reasons.push("太阳方向光路缺少足够的方向性数据，需现场复核地平线云缝。");
  } else if (risks.glowLightPathObstructionRisk >= 70) {
    reasons.push("霞光光路遮挡风险偏高，低角度太阳光可能难以穿过地平线方向光路。");
  } else if (risks.glowLightPathObstructionRisk >= 45) {
    reasons.push("霞光光路遮挡风险中等，建议到场后重点复核太阳方向云缝和地平线。");
  }
  if (risks.cloudSuppressionRisk >= 70) {
    reasons.push("云层压制风险高，云量或云层厚度可能压住色彩，不宜只凭云层载体专程押强霞。");
  } else if (risks.cloudSuppressionRisk >= 50) {
    reasons.push("云层载体存在，但云层压制风险也存在，适合附近蹲守并保留备选题材。");
  }
  if (bestSunrise?.riskTags.length) {
    reasons.push(`朝霞风险：${bestSunrise.riskTags.join("、")}。`);
  }
  if (bestSunset?.riskTags.length) {
    reasons.push(`晚霞风险：${bestSunset.riskTags.join("、")}。`);
  }
  if (candidates.some((candidate) => candidate.rainOverlapsWindow)) {
    reasons.push("有降水与朝霞或晚霞窗口重叠，实际出片价值会被明显压低。");
  }
  const openingChance = strongestPostRainOpening(candidates);
  if (openingChance === "high" || openingChance === "medium") {
    reasons.push("降水结束后存在短暂开口信号，但仍需要短临雷达和现场云缝复核。");
  }
  if (!input.astroSummaries.some((astro) => astro.sunrise || astro.sunset)) {
    reasons.push(missingSunTimesNote);
  }

  return reasons.length > 0
    ? reasons
    : ["未发现高等级霞光风险，仍需出行前复核最新天气和现场视野。"];
}

function buildGlowOpportunityReasons(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly string[] {
  const reasons: string[] = [];
  const sunrise = bestPhaseWindow(candidates, "sunrise");
  const sunset = bestPhaseWindow(candidates, "sunset");
  const cloudMid = averageDefined(
    candidateWeatherOrAll(input, candidates),
    (hour) => hour.cloudMid,
  );
  const cloudHigh = averageDefined(
    candidateWeatherOrAll(input, candidates),
    (hour) => hour.cloudHigh,
  );

  if (sunrise) {
    reasons.push(`朝霞最佳参考为${sunrise.labelZh}，评分 ${sunrise.score} 分。`);
  }
  if (sunset) {
    reasons.push(`晚霞最佳参考为${sunset.labelZh}，评分 ${sunset.score} 分。`);
  }
  if (
    (cloudMid !== undefined && cloudMid >= 20 && cloudMid <= 70) ||
    (cloudHigh !== undefined && cloudHigh >= 20 && cloudHigh <= 70)
  ) {
    reasons.push("中高云处在较可用区间，具备承载霞光色彩的基础。");
  }

  return reasons.length > 0 ? reasons : ["中高云或通透度信号偏弱，霞光机会需要谨慎参考。"];
}

function buildGlowTravelRecommendations(
  sunriseGlowScore: number,
  sunsetGlowScore: number,
): readonly string[] {
  const best = Math.max(sunriseGlowScore, sunsetGlowScore);
  return [
    "朝霞：建议日出前 40-60 分钟到达机位，先完成构图、测光和安全检查。",
    "晚霞：建议日落前 60 分钟观察云层移动；方向性光路数据不足时，需现场复核地平线云缝。",
    "如果低云/雾墙风险偏高，优先寻找更高机位或转拍层峦、雾气层次和局部暖色。",
    "如果云层载体较好但压制风险存在，适合附近蹲守并同步准备长焦山脊、远山层次和城市远景。",
    best >= 65
      ? "当前霞光信号具备等待价值，但正式天气数据启用前不建议单点押注。"
      : "当前霞光信号偏保守，更适合把霞光作为顺带观察目标。",
  ];
}

function buildGlowBackupPlans(): readonly GlowBackupPlan[] {
  return [
    {
      condition: "无霞但通透",
      action: "转拍远山层次、长焦山脊",
      detail: "利用清晰空气和低角度侧光保留空间层次，不强求大面积色彩。",
    },
    {
      condition: "低云/雾墙",
      action: "转更高机位或拍雾中局部",
      detail: "低云或雾墙只说明近地视野风险；光路不明时需现场复核地平线云缝。",
    },
    {
      condition: "高云不足",
      action: "转拍日出剪影、云隙光",
      detail: "缺少色彩载体时，把轮廓、剪影和局部光束作为主画面。",
    },
    {
      condition: "降水临近",
      action: "转拍雨雾氛围或等待云后光",
      detail: "优先保护器材和通行安全，关注降水间隙后的短暂透光。",
    },
  ];
}

function buildGlowMissingDataNotes(input: ForecastCalculationInput): readonly string[] {
  const notes: string[] = [];
  const cloudLayersMissing = ["cloudLow", "cloudMid", "cloudHigh"].some((field) =>
    input.weatherMissingFields.includes(field),
  );
  const visibilityMissing =
    input.weatherMissingFields.includes("visibility") ||
    !input.hourlyWeather.some((hour) => typeof hour.visibility === "number");
  const hasSunTimes = input.astroSummaries.some((astro) => astro.sunrise || astro.sunset);
  const hasGlowGeometry = input.astroSummaries.some(
    (astro) =>
      (astro.sunriseGlowBestStartAt && astro.sunriseGlowBestEndAt) ||
      (astro.sunsetGlowBestStartAt && astro.sunsetGlowBestEndAt),
  );
  const hasWeatherRows = input.hourlyWeather.length > 0;
  const horizon = input.terrainAnalysis.horizonProfile;
  const terrainMissing =
    typeof horizon.sunriseHorizonAngle !== "number" ||
    typeof horizon.sunsetHorizonAngle !== "number";

  if (cloudLayersMissing) {
    notes.push("当前天气源缺少低云/中云/高云分层数据，霞光判断置信度会降低。");
  }
  if (visibilityMissing) {
    notes.push("当前天气源缺少能见度数据，通透度判断置信度会降低。");
  }
  if (!hasSunTimes) {
    notes.push(missingSunTimesNote);
  }
  if (hasSunTimes && !hasGlowGeometry) {
    notes.push("已保留精确日出/日落时刻，但缺少太阳高度角穿越结果，暂不生成预测朝霞/晚霞窗口。");
  }
  if (!hasWeatherRows) {
    notes.push("已保留可用天文事件，但缺少窗口内天气资料，暂不生成霞光概率或最佳窗口。");
  }
  if (terrainMissing) {
    notes.push(missingTerrainNote);
  }
  if (
    !hasDeterministicGlowLightPathData(input, "sunrise") &&
    !hasDeterministicGlowLightPathData(input, "sunset")
  ) {
    notes.push("太阳方向光路缺少足够的方向性数据，需现场复核地平线云缝。");
  }
  if (input.weatherDataMode !== "real") {
    notes.push("当前天气数据为演示数据，结果仅用于体验分析流程。");
  }

  return notes;
}

function calculateGlowConfidenceScore(
  input: ForecastCalculationInput,
  _missingDataNotes: readonly string[],
): number {
  let confidenceScore = 100;
  const cloudLayersMissing = ["cloudLow", "cloudMid", "cloudHigh"].some((field) =>
    input.weatherMissingFields.includes(field),
  );
  const visibilityMissing =
    input.weatherMissingFields.includes("visibility") ||
    !input.hourlyWeather.some((hour) => typeof hour.visibility === "number");
  const hasSunTimes = input.astroSummaries.some((astro) => astro.sunrise || astro.sunset);
  const hasGlowGeometry = input.astroSummaries.some(
    (astro) =>
      (astro.sunriseGlowBestStartAt && astro.sunriseGlowBestEndAt) ||
      (astro.sunsetGlowBestStartAt && astro.sunsetGlowBestEndAt),
  );
  const horizon = input.terrainAnalysis.horizonProfile;
  const terrainMissing =
    typeof horizon.sunriseHorizonAngle !== "number" ||
    typeof horizon.sunsetHorizonAngle !== "number";

  if (cloudLayersMissing) {
    confidenceScore -= 25;
  }
  if (visibilityMissing) {
    confidenceScore -= 15;
  }
  if (!hasSunTimes) {
    confidenceScore -= 25;
  }
  if (hasSunTimes && !hasGlowGeometry) {
    confidenceScore -= 22;
  }
  if (input.hourlyWeather.length === 0) {
    confidenceScore -= 25;
  }
  if (terrainMissing) {
    confidenceScore -= 12;
  }
  if (
    !hasDeterministicGlowLightPathData(input, "sunrise") &&
    !hasDeterministicGlowLightPathData(input, "sunset")
  ) {
    confidenceScore -= 12;
  }
  if (input.terrainAnalysis.terrainProfile.elevationConfidence === "low") {
    confidenceScore -= 8;
  }
  if (input.weatherDataMode !== "real") {
    confidenceScore -= 15;
  }

  return clampScore(confidenceScore);
}

function glowConfidenceLevel(
  confidenceScore: number,
  input: ForecastCalculationInput,
): GlowAnalysisResult["confidenceLevel"] {
  if (confidenceScore >= 80 && input.weatherDataMode === "real") {
    return "high";
  }
  if (confidenceScore >= 55) {
    return "medium";
  }
  return "low";
}

function buildGlowLabels(
  sunriseGlowScore: number,
  sunsetGlowScore: number,
  lowCloudObstructionRisk: number,
  glowLightPathObstructionRisk: number,
  cloudSuppressionRisk: number,
  colorCarrierScore: number,
  bestWindow: GlowWindow | undefined,
  watchableWindow: GlowWindow | undefined,
  notRecommendedWindow: GlowWindow | undefined,
): GlowAssessmentLabels {
  return {
    sunriseGlowOpportunity: chanceLabel(sunriseGlowScore),
    sunsetGlowOpportunity: chanceLabel(sunsetGlowScore),
    lowCloudObstruction: riskLabel(lowCloudObstructionRisk),
    lowCloudFogWallRisk: riskLabel(lowCloudObstructionRisk),
    glowLightPathObstructionRisk: riskLabel(glowLightPathObstructionRisk),
    cloudSuppressionRisk: riskLabel(cloudSuppressionRisk),
    colorCarrier: colorCarrierLabel(colorCarrierScore),
    bestWindowLabel: bestWindow
      ? `最佳霞光窗口：${formatGlowWindowLabel(bestWindow)}`
      : "暂无高确定性霞光窗口",
    watchableWindowLabel: watchableWindow
      ? `可观察窗口：${formatGlowWindowLabel(watchableWindow)}`
      : "可观察窗口：暂无",
    notRecommendedWindowLabel: notRecommendedWindow
      ? `不建议窗口：${formatGlowWindowLabel(notRecommendedWindow)}`
      : "不建议窗口：暂无",
  };
}

function chanceLabel(score: number): GlowAssessmentLabels["sunriseGlowOpportunity"] {
  if (score >= 70) {
    return "高";
  }
  if (score >= 50) {
    return "中";
  }
  return "低";
}

function riskLabel(score: number): GlowAssessmentLabels["lowCloudObstruction"] {
  if (score >= 70) {
    return "高";
  }
  if (score >= 45) {
    return "中";
  }
  return "低";
}

function colorCarrierLabel(score: number): GlowAssessmentLabels["colorCarrier"] {
  if (score >= 70) {
    return "好";
  }
  if (score >= 45) {
    return "一般";
  }
  return "差";
}

function formatGlowWindowLabel(window: GlowWindow): string {
  return `${window.date ?? window.start.slice(0, 10)} ${window.labelZh} ${window.start.slice(11, 16)}-${window.end.slice(11, 16)}`;
}

function buildGlowWindowRiskTags(
  input: ForecastCalculationInput,
  window: readonly NormalizedHourlyWeather[],
  phase: GlowPhase,
  components: GlowComponentScores,
): readonly string[] {
  const tags: string[] = [];
  if (components.lowCloudFogWallRisk >= 70) {
    tags.push("低云/雾墙");
  }
  if (components.glowLightPathDataAvailability === "insufficient") {
    tags.push("光路需现场复核");
  } else if (components.glowLightPathObstructionRisk >= 70) {
    tags.push("光路遮挡");
  }
  if (components.cloudSuppressionRisk >= 70) {
    tags.push("云层压制");
  }
  if (components.colorCarrierScore < 55) {
    tags.push("中高云不足");
  }
  if (components.visibilityColorQualityScore < 55) {
    tags.push("通透度弱");
  }
  if (components.aerosolScore !== undefined && components.aerosolScore < 50) {
    tags.push("气溶胶偏浊");
  }
  if (components.precipitationDisruptionRisk >= 45) {
    tags.push("降水干扰");
  }
  if (
    components.postRainOpeningChance === "medium" ||
    components.postRainOpeningChance === "high"
  ) {
    tags.push("雨后短暂开口");
  }
  if (components.terrain < 62 || hasBlockedDirection(input, phase)) {
    tags.push("地形遮挡");
  }
  if (hasCloudLayerGaps(window)) {
    tags.push("分层数据不足");
  }
  return tags.length > 0 ? tags : ["风险可控"];
}

function buildGlowWindowNote(
  phase: GlowPhase,
  type: GlowWindowType,
  components: GlowComponentScores,
): string {
  const target = phase === "sunrise" ? "朝霞" : "晚霞";
  if (components.glowLightPathDataAvailability === "insufficient") {
    return `${target}窗口太阳方向光路缺少足够的方向性数据，需现场复核地平线云缝。`;
  }
  if (components.glowLightPathObstructionRisk >= 70) {
    return `${target}窗口霞光光路遮挡风险偏高，不建议只凭云层载体专程押强霞。`;
  }
  if (components.cloudSuppressionRisk >= 70) {
    return `${target}窗口云层载体较好但云层压制风险偏高，适合附近蹲守，不宜只凭分数专程押强霞。`;
  }
  if (components.lowCloudFogWallRisk >= 70) {
    return `${target}窗口低云/雾墙风险偏高，应优先复核近地雾墙和机位视野。`;
  }
  if (components.precipitationDisruptionRisk >= 70) {
    return `${target}窗口降水正在干扰或高度重叠，不建议把它作为主拍窗口。`;
  }
  if (components.postRainOpeningChance === "high") {
    return `${target}窗口前有降水结束信号，若现场出现云缝，可能形成短暂雨后霞光开口。`;
  }
  if (components.colorCarrierScore < 55) {
    return `${target}窗口存在，但色彩云条件一般，建议按普通日出日落或可观察窗口处理。`;
  }
  if (components.visibilityColorQualityScore < 52) {
    return `${target}窗口通透度偏弱，色彩和远景层次不稳定，仅作备选观察。`;
  }
  if (
    components.colorCarrierScore >= 70 &&
    components.visibilityColorQualityScore >= 65 &&
    components.cloudSuppressionRisk < 50 &&
    components.glowLightPathObstructionRisk < 50
  ) {
    return `${target}窗口中高云、通透度和光路风险较可用，适合提前到位观察色彩发展。`;
  }
  if (type === "afterglow") {
    return "余晖阶段更依赖西向高云和通透度，适合继续等待 20-30 分钟。";
  }
  return `${target}窗口可作为谨慎参考，重点观察中高云是否继续保留色彩载体。`;
}

function parseForecastRange(input: ForecastCalculationInput): ForecastTimeRange | null {
  const startMs = Date.parse(input.calendarBasis.forecastStart);
  const endMs = Date.parse(input.calendarBasis.forecastEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }
  return {
    forecastStart: input.calendarBasis.forecastStart,
    forecastEnd: input.calendarBasis.forecastEnd,
    startMs,
    endMs,
  };
}

function clipWindow(
  start: string,
  end: string,
  forecastRange: ForecastTimeRange,
): Pick<GlowWindow, "start" | "end"> | null {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    endMs <= forecastRange.startMs ||
    startMs >= forecastRange.endMs
  ) {
    return null;
  }
  const clippedStart = startMs < forecastRange.startMs ? forecastRange.forecastStart : start;
  const clippedEnd = endMs > forecastRange.endMs ? forecastRange.forecastEnd : end;
  return Date.parse(clippedEnd) > Date.parse(clippedStart)
    ? { start: clippedStart, end: clippedEnd }
    : null;
}

function weatherForWindow(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  start: string,
  end: string,
): readonly NormalizedHourlyWeather[] {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return [];
  }
  return hourlyWeather.filter((hour) => {
    const hourStart = Date.parse(hour.time);
    if (!Number.isFinite(hourStart)) {
      return false;
    }
    const hourEnd = hourStart + oneHourMs;
    return hourStart < endMs && hourEnd > startMs;
  });
}

function estimateWeatherResolutionMinutes(
  hourlyWeather: readonly NormalizedHourlyWeather[],
): number {
  const timestamps = hourlyWeather
    .map((hour) => Date.parse(hour.time))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => left - right);
  const diffs = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - timestamps[index]!)
    .filter((diff) => diff > 0);

  if (diffs.length === 0) {
    return glowSolarAltitudeGeometryConfig.weatherResolutionMinutes;
  }

  const sortedDiffs = [...diffs].sort((left, right) => left - right);
  const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)];
  return medianDiff
    ? Math.max(1, Math.round(medianDiff / 60_000))
    : glowSolarAltitudeGeometryConfig.weatherResolutionMinutes;
}

function isValidCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function averageDefined(
  window: readonly NormalizedHourlyWeather[],
  selector: (hour: NormalizedHourlyWeather) => number | null | undefined,
): number | undefined {
  const values = window
    .map((hour) => selector(hour))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

function candidateWeatherOrAll(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly NormalizedHourlyWeather[] {
  const weather = candidates.flatMap((candidate) => [...candidate.weatherWindow]);
  return weather.length > 0 ? weather : input.hourlyWeather;
}

function horizonAngleForPhase(
  input: ForecastCalculationInput,
  phase: GlowPhase,
): number | undefined {
  return phase === "sunrise"
    ? input.terrainAnalysis.horizonProfile.sunriseHorizonAngle
    : input.terrainAnalysis.horizonProfile.sunsetHorizonAngle;
}

function hasBlockedDirection(input: ForecastCalculationInput, phase: GlowPhase): boolean {
  const directions = input.terrainAnalysis.horizonProfile.blockedDirectionsZh;
  return directions.some((direction) => {
    const normalized = direction.toLowerCase();
    return phase === "sunrise"
      ? normalized.includes("东") ||
          normalized.includes("east") ||
          normalized.includes("southeast") ||
          normalized === "e" ||
          normalized === "se"
      : normalized.includes("西") ||
          normalized.includes("west") ||
          normalized.includes("southwest") ||
          normalized === "w" ||
          normalized === "sw";
  });
}

function bestPhaseWindow(
  candidates: readonly GlowCandidate[],
  phase: GlowPhase,
): GlowCandidate | undefined {
  return [...candidates]
    .filter((candidate) => candidate.phase === phase)
    .sort((left, right) => right.score - left.score)[0];
}

function hasCloudLayerGaps(window: readonly NormalizedHourlyWeather[]): boolean {
  return window.some(
    (hour) =>
      hour.cloudLow === null ||
      hour.cloudMid === null ||
      hour.cloudHigh === null ||
      hour.missingFields?.some((field) => ["cloudLow", "cloudMid", "cloudHigh"].includes(field)),
  );
}

function hasDirectionalTerrainProfile(input: ForecastCalculationInput): boolean {
  if (input.terrainAnalysis.dataSource === "unknown") {
    return false;
  }

  const profile = input.terrainAnalysis.terrainProfile;
  const horizon = input.terrainAnalysis.horizonProfile;
  return (
    typeof profile.localReliefMeters === "number" ||
    typeof profile.elevationDiff5km === "number" ||
    typeof profile.minElevation1km === "number" ||
    typeof profile.minElevation3km === "number" ||
    typeof profile.maxElevation5km === "number" ||
    horizon.blockedDirectionsZh.length > 0
  );
}

function hasDeterministicGlowLightPathData(
  input: ForecastCalculationInput,
  phase: GlowPhase,
): boolean {
  const horizonAngle = horizonAngleForPhase(input, phase);
  const hasTerrainDirection =
    hasDirectionalTerrainProfile(input) &&
    typeof horizonAngle === "number" &&
    Number.isFinite(horizonAngle);
  const hasSolarDirection = input.astroSummaries.some((astro) => {
    const azimuth = phase === "sunrise" ? astro.sunriseAzimuth : astro.sunsetAzimuth;
    return typeof azimuth === "number" && Number.isFinite(azimuth);
  });

  return hasTerrainDirection && hasSolarDirection;
}

function terrainEffect(
  angle: number | undefined,
  phase: GlowPhase,
  input: ForecastCalculationInput,
): CloudSeaEvidenceEffect {
  if (hasBlockedDirection(input, phase)) {
    return "risk";
  }
  if (typeof angle !== "number") {
    return "neutral";
  }
  if (angle > 10) {
    return "risk";
  }
  if (angle > 6) {
    return "neutral";
  }
  return "positive";
}

function effectFromScore(score: number): CloudSeaEvidenceEffect {
  if (score >= 70) {
    return "positive";
  }
  if (score < 50) {
    return "risk";
  }
  return "neutral";
}

function formatPercentValue(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "暂缺数据";
}

function formatDecimalValue(value: number | null | undefined, digits: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "暂缺数据";
}

function formatConcentrationValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} µg/m³`
    : "暂缺数据";
}

function formatAngle(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂缺数据";
}
