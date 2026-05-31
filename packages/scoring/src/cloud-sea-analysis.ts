import type {
  CloudSeaAnalysisResult,
  CloudSeaAnalysisWindow,
  CloudSeaConfidenceLevel,
  CloudSeaEvidenceEffect,
  CloudSeaRainOpeningSignal,
  CloudSeaRecommendationLabel,
  CloudSeaTerrainSupport,
  CloudSeaTravelRecommendation,
  DailyCloudSea,
  ForecastCalculationInput,
  ForecastRecommendationLevel,
  NormalizedHourlyWeather,
  TerrainCloudSeaPotential,
} from "@photo-weather/shared";
import {
  classifyTerrainMode,
  terrainModeAllowsDefaultCloudSea,
  terrainModeUsesLowlandSemantics,
  terrainModeUsesMountainSemantics,
} from "@photo-weather/shared";
import { defaultTimezone, formatZonedIso } from "@photo-weather/calendar";
import { addHours, averageWeightedScore, clampScore, formatChineseTimeRange } from "./helpers.js";
import { classifyCloudLayerRoles, type CloudLayerRoleContext } from "./cloud-layer-roles.js";
import {
  precipitationAmountMm,
  precipitationRiskScore as weatherPrecipitationRiskScore,
} from "./weather-decision-metrics.js";

const lowCloudMissingNote = "当前天气源缺少低云分层数据，云海判断置信度降低。";

type CandidateWindows = {
  readonly date: string;
  readonly kind: "morning" | "evening" | "daytime";
  readonly label: string;
  readonly sunriseKnown: boolean;
  readonly lightAlignedScore: number;
  readonly accumulation?: Pick<CloudSeaAnalysisWindow, "startTime" | "endTime">;
  readonly observation: Pick<CloudSeaAnalysisWindow, "startTime" | "endTime">;
  readonly dissipation?: Pick<CloudSeaAnalysisWindow, "startTime" | "endTime">;
};

type WindowStats = {
  readonly temperature?: number;
  readonly terrainAdjustedTemperature?: number;
  readonly humidity?: number;
  readonly dewPointSpread?: number;
  readonly windSpeed?: number;
  readonly windGust?: number;
  readonly windDirection?: number;
  readonly visibility?: number;
  readonly precipitationProbability?: number;
  readonly precipitationProbabilityMax?: number;
  readonly precipitation?: number;
  readonly precipitationSum?: number;
  readonly cloudTotal?: number;
  readonly cloudLow?: number;
  readonly cloudMid?: number;
  readonly cloudHigh?: number;
  readonly transparencyScore?: number;
  readonly pressure?: number;
  readonly weatherTexts: readonly string[];
  readonly hasLowCloud: boolean;
  readonly lowCloudEstimated: boolean;
  readonly missingFields: readonly string[];
  readonly estimatedFields: readonly string[];
};

type WindowEvaluation = {
  readonly date: string;
  readonly kind: CandidateWindows["kind"];
  readonly formationScore: number;
  readonly opportunityScore: number;
  readonly shootableScore: number;
  readonly whiteoutRiskScore: number;
  readonly lightAlignedScore: number;
  readonly confidence: number;
  readonly rainOpening: CloudSeaRainOpeningSignal;
  readonly travelScore: number;
  readonly window: CloudSeaAnalysisWindow;
  readonly stats: WindowStats;
  readonly opportunityReasons: readonly string[];
  readonly whiteoutReasons: readonly string[];
  readonly missingDataNotes: readonly string[];
  readonly confidencePenalty: number;
  readonly stabilityBonus: number;
  readonly terrainBonus: number;
  readonly terrainSupport: CloudSeaTerrainSupport;
};

export function analyzeCloudSea(input: ForecastCalculationInput): CloudSeaAnalysisResult {
  const evaluations = input.calendarBasis.targetDates
    .flatMap((date) => evaluateCloudSeaDate(input, date))
    .filter((evaluation): evaluation is WindowEvaluation => evaluation !== undefined);

  const fallbackEvaluation = evaluations[0] ?? buildFallbackEvaluation(input);
  const bestEvaluation =
    [...evaluations].sort((left, right) => {
      if (right.shootableScore !== left.shootableScore) {
        return right.shootableScore - left.shootableScore;
      }

      return Date.parse(left.window.startTime) - Date.parse(right.window.startTime);
    })[0] ?? fallbackEvaluation;

  const dailyCloudSea = input.calendarBasis.targetDates
    .map((date) => buildDailyCloudSeaForDate(input, date, evaluations))
    .filter((day): day is DailyCloudSea => day !== undefined);
  const bestCloudSeaWindows = evaluations
    .filter(isBestCloudSeaEvaluation)
    .map((evaluation) => evaluation.window)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Date.parse(left.startTime) - Date.parse(right.startTime);
    });
  const watchableCloudSeaWindows = evaluations
    .filter(isWatchableCloudSeaEvaluation)
    .map((evaluation) => evaluation.window)
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
  const notRecommendedCloudSeaWindows = evaluations
    .filter(isNotRecommendedCloudSeaEvaluation)
    .map((evaluation) => evaluation.window)
    .sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
  const missingDataNotes = uniqueStrings(
    evaluations.flatMap((evaluation) => evaluation.missingDataNotes),
  );
  const confidenceLevel = classifyCloudSeaConfidence(input, evaluations, missingDataNotes);
  const terrainSupport = buildTerrainSupport(input);
  const confidence = bestEvaluation.confidence;
  const labels = buildAssessmentLabels(
    bestEvaluation,
    bestCloudSeaWindows[0],
    watchableCloudSeaWindows[0],
    notRecommendedCloudSeaWindows[0],
  );

  return {
    overallScore: bestEvaluation.shootableScore,
    formationScore: bestEvaluation.formationScore,
    shootableScore: bestEvaluation.shootableScore,
    cloudSeaOpportunityScore: bestEvaluation.formationScore,
    whiteoutRiskScore: bestEvaluation.whiteoutRiskScore,
    lightAlignedScore: bestEvaluation.lightAlignedScore,
    confidence,
    labels,
    terrainSupport,
    rainOpening: bestEvaluation.rainOpening,
    travelScore: bestEvaluation.shootableScore,
    recommendationLabel: cloudSeaRecommendationLabel(bestEvaluation.shootableScore),
    confidenceLevel,
    bestCloudSeaWindow: bestCloudSeaWindows[0] ?? bestEvaluation.window,
    bestCloudSeaWindows,
    watchableCloudSeaWindows,
    notRecommendedCloudSeaWindows,
    dailyCloudSea,
    weatherEvidence: buildWeatherEvidence(bestEvaluation.stats),
    terrainEvidence: buildTerrainEvidence(input),
    whiteoutReasons: bestEvaluation.whiteoutReasons,
    opportunityReasons: bestEvaluation.opportunityReasons,
    travelRecommendations: buildTravelRecommendations(
      bestEvaluation.shootableScore,
      bestEvaluation,
    ),
    backupPlans: [
      {
        condition: "白墙时",
        action: "转拍雾中树影、山路氛围、延时",
        detail: "降低远景预期，利用近景层次、人物比例和雾气流动完成素材。",
      },
      {
        condition: "无云海但通透",
        action: "转拍层峦、日出、长焦山脊",
        detail: "能见度较好时，远山层次和日出侧光仍有拍摄价值。",
      },
      {
        condition: "低云过厚",
        action: "等待风口或转更高机位",
        detail: "优先观察谷地方向是否出现云雾边界或短暂开口。",
      },
      {
        condition: "风大",
        action: "转拍流云延时",
        detail: "完整云海边界不稳定时，流云、山脊掠影和延时素材更可控。",
      },
    ],
    missingDataNotes,
    dataMode: input.weatherDataMode,
  };
}

export function cloudSeaRecommendationLabel(score: number): CloudSeaRecommendationLabel {
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

export function cloudSeaRecommendationLevel(score: number): ForecastRecommendationLevel {
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

function isBestCloudSeaEvaluation(evaluation: WindowEvaluation): boolean {
  const mode = evaluation.terrainSupport.terrainMode;
  if (terrainModeUsesLowlandSemantics(mode)) {
    return false;
  }
  if (mode === "hill") {
    return (
      evaluation.formationScore >= 68 &&
      evaluation.shootableScore >= 64 &&
      evaluation.whiteoutRiskScore < 65 &&
      evaluation.confidence >= 55
    );
  }
  return evaluation.shootableScore >= 58 && evaluation.whiteoutRiskScore < 78;
}

function isWatchableCloudSeaEvaluation(evaluation: WindowEvaluation): boolean {
  const mode = evaluation.terrainSupport.terrainMode;
  if (terrainModeUsesLowlandSemantics(mode)) {
    return (
      evaluation.formationScore >= 42 &&
      evaluation.shootableScore >= 24 &&
      evaluation.whiteoutRiskScore < 82
    );
  }
  if (mode === "hill") {
    return (
      evaluation.formationScore >= 58 &&
      evaluation.shootableScore >= 34 &&
      evaluation.shootableScore < 64
    );
  }
  return (
    evaluation.formationScore >= 55 &&
    evaluation.shootableScore >= 32 &&
    evaluation.shootableScore < 58
  );
}

function isNotRecommendedCloudSeaEvaluation(evaluation: WindowEvaluation): boolean {
  const mode = evaluation.terrainSupport.terrainMode;
  if (terrainModeUsesLowlandSemantics(mode)) {
    return evaluation.formationScore >= 36 && !isWatchableCloudSeaEvaluation(evaluation);
  }
  return (
    evaluation.formationScore >= 50 &&
    (evaluation.shootableScore < 32 ||
      evaluation.whiteoutRiskScore >= 78 ||
      evaluation.rainOpening.activeRainDuringWindow)
  );
}

function evaluateCloudSeaDate(
  input: ForecastCalculationInput,
  date: string,
): readonly WindowEvaluation[] {
  const candidates = buildCandidateWindows(input, date);
  return candidates.flatMap((candidate) => {
    const evaluation = evaluateCloudSeaCandidate(input, candidate);
    return evaluation ? [evaluation] : [];
  });
}

function evaluateCloudSeaCandidate(
  input: ForecastCalculationInput,
  candidate: CandidateWindows,
): WindowEvaluation | undefined {
  const observationHours = weatherInWindow(
    input.hourlyWeather,
    candidate.observation.startTime,
    candidate.observation.endTime,
  );
  const fallbackHours = hoursForDate(
    input.hourlyWeather,
    candidate.date,
    input.calendarBasis.timezone,
  );
  const weatherWindow = observationHours.length > 0 ? observationHours : fallbackHours;
  if (weatherWindow.length === 0) {
    return undefined;
  }

  const stats = buildWindowStats(input, weatherWindow);
  const accumulationStats = candidate.accumulation
    ? buildWindowStats(
        input,
        weatherInWindow(
          input.hourlyWeather,
          candidate.accumulation.startTime,
          candidate.accumulation.endTime,
        ),
      )
    : undefined;
  const dissipationStats = candidate.dissipation
    ? buildWindowStats(
        input,
        weatherInWindow(
          input.hourlyWeather,
          candidate.dissipation.startTime,
          candidate.dissipation.endTime,
        ),
      )
    : undefined;
  const terrainSupport = buildTerrainSupport(input);
  const rawFormationScore = calculateCloudSeaFormationScore(stats, terrainSupport, candidate.kind);
  const whiteoutRiskScore = calculateWhiteoutRiskScore(stats, terrainSupport);
  const rainOpening = buildRainOpeningSignal(stats, accumulationStats, dissipationStats);
  const terrainBonus = terrainTravelBonus(terrainSupport.score);
  const stabilityBonus = windowStabilityBonus(
    stats,
    accumulationStats,
    dissipationStats,
    terrainSupport.score,
  );
  const rawShootableScore = calculateShootableScore(
    rawFormationScore,
    whiteoutRiskScore,
    candidate.lightAlignedScore,
    terrainBonus,
    stabilityBonus,
    rainOpening,
    stats,
  );
  const formationScore = applyTerrainModeFormationCap(rawFormationScore, terrainSupport);
  const shootableScore = applyTerrainModeShootableCap(
    rawShootableScore,
    formationScore,
    terrainSupport,
  );
  const missingDataNotes = buildMissingDataNotes(input, stats, candidate.sunriseKnown);
  const confidencePenaltyValue = confidencePenalty(
    input,
    stats,
    candidate.sunriseKnown,
    terrainSupport,
  );
  const confidence = clampScore(100 - confidencePenaltyValue);
  const riskTag = cloudObstructionRiskTag(whiteoutRiskScore, terrainSupport);
  const noteZh = buildWindowNoteZh(
    formationScore,
    shootableScore,
    whiteoutRiskScore,
    rainOpening,
    terrainSupport,
    stats,
    candidate.lightAlignedScore,
  );

  return {
    date: candidate.date,
    kind: candidate.kind,
    formationScore,
    opportunityScore: formationScore,
    shootableScore,
    whiteoutRiskScore,
    lightAlignedScore: candidate.lightAlignedScore,
    confidence,
    rainOpening,
    travelScore: shootableScore,
    window: {
      label: `${candidateLabelForTerrain(candidate, terrainSupport)} ${formatChineseTimeRange(
        candidate.observation.startTime,
        candidate.observation.endTime,
      )}`,
      date: candidate.date,
      startTime: candidate.observation.startTime,
      endTime: candidate.observation.endTime,
      score: shootableScore,
      formationScore,
      shootableScore,
      whiteoutRiskScore,
      lightAlignedScore: candidate.lightAlignedScore,
      target: "cloud_sea",
      phase:
        shootableScore >= 50 ? "observation" : formationScore >= 55 ? "waiting" : "observation",
      noteZh,
      riskTag,
      rainOpening,
    },
    stats,
    opportunityReasons: buildOpportunityReasons(
      input,
      stats,
      terrainSupport,
      formationScore,
      shootableScore,
      candidate.lightAlignedScore,
      rainOpening,
      stabilityBonus,
    ),
    whiteoutReasons: buildWhiteoutReasons(stats, whiteoutRiskScore, terrainSupport),
    missingDataNotes,
    confidencePenalty: confidencePenaltyValue,
    stabilityBonus,
    terrainBonus,
    terrainSupport,
  };
}

function calculateCloudSeaFormationScore(
  stats: WindowStats,
  terrainSupport: CloudSeaTerrainSupport,
  kind: CandidateWindows["kind"],
): number {
  const timeBonus = kind === "morning" ? 6 : kind === "daytime" ? -7 : 0;
  const rawScore = clampScore(
    calculateCloudSeaOpportunityScore(stats, terrainSupport.score) + timeBonus,
  );
  const layerRoles = cloudLayerRolesForStats(stats, terrainSupport);

  if (!hasExplicitLowCloudEvidence(stats)) {
    return Math.min(rawScore, stats.lowCloudEstimated ? 48 : 44);
  }
  if (layerRoles.cloudSeaLayerSignal === "none") {
    return Math.min(rawScore, 42);
  }
  if (layerRoles.cloudSeaLayerSignal === "weak") {
    return Math.min(rawScore, 52);
  }

  return rawScore;
}

function calculateCloudSeaOpportunityScore(stats: WindowStats, terrainScore: number): number {
  const humidityDewPointScore = averageWeightedScore([
    { score: humidityScore(stats.humidity), weight: 0.52 },
    { score: dewPointSpreadScore(stats.dewPointSpread), weight: 0.48 },
  ]);
  const lowCloudScore = lowCloudOpportunityScore(stats);
  const windScore = windOpportunityScore(stats.windSpeed);
  const visibilityScore = visibilityOpportunityScore(stats.visibility);
  const precipitationScore = precipitationOpportunityScore(stats);

  return averageWeightedScore([
    { score: humidityDewPointScore, weight: 0.27 },
    { score: lowCloudScore, weight: 0.23 },
    { score: terrainScore, weight: 0.2 },
    { score: windScore, weight: 0.15 },
    { score: visibilityScore, weight: 0.07 },
    { score: precipitationScore, weight: 0.08 },
  ]);
}

function calculateWhiteoutRiskScore(
  stats: WindowStats,
  terrainSupport?: CloudSeaTerrainSupport,
): number {
  const lowCloudRisk = lowCloudWhiteoutRiskScore(stats);
  const humidityRisk = humidityWhiteoutRiskScore(stats.humidity);
  const visibilityRisk = visibilityWhiteoutRiskScore(stats.visibility);
  const windRisk = windWhiteoutRiskScore(stats.windSpeed);
  const cloudTotalRisk = hasExplicitLowCloudEvidence(stats)
    ? cloudTotalWhiteoutRiskScore(stats.cloudTotal)
    : 35;
  const precipitationRisk = precipitationRiskScore(stats);
  const dewPointRisk = dewPointSpreadWhiteoutRiskScore(stats.dewPointSpread);
  const textRisk = weatherTextWhiteoutRiskScore(stats);
  const terrainUncertaintyRisk =
    terrainSupport?.confidence === "low" && (stats.cloudLow ?? 0) >= 80 ? 70 : 35;

  const weighted = averageWeightedScore([
    { score: lowCloudRisk, weight: 0.24 },
    { score: humidityRisk, weight: 0.18 },
    { score: visibilityRisk, weight: 0.22 },
    { score: dewPointRisk, weight: 0.12 },
    { score: windRisk, weight: 0.08 },
    { score: cloudTotalRisk, weight: 0.07 },
    { score: precipitationRisk, weight: 0.05 },
    { score: textRisk, weight: 0.03 },
    { score: terrainUncertaintyRisk, weight: 0.01 },
  ]);
  const strongWhiteoutSignals = [
    (stats.cloudLow ?? 0) >= 85 && (stats.visibility ?? 99) <= 8 && (stats.humidity ?? 0) >= 90,
    (stats.cloudLow ?? 0) >= 95 && (stats.dewPointSpread ?? 99) <= 2,
    activeRainOrFog(stats) && (stats.cloudLow ?? 0) >= 75 && (stats.humidity ?? 0) >= 88,
  ];

  const score = strongWhiteoutSignals.some(Boolean) ? Math.max(weighted, 78) : weighted;
  return hasExplicitLowCloudEvidence(stats) ? score : Math.min(score, 54);
}

function calculateShootableScore(
  formationScore: number,
  whiteoutRiskScore: number,
  lightAlignedScore: number,
  terrainBonus: number,
  stabilityBonus: number,
  rainOpening: CloudSeaRainOpeningSignal,
  stats: WindowStats,
): number {
  const whiteoutPenalty =
    whiteoutRiskScore >= 82
      ? 34
      : whiteoutRiskScore >= 70
        ? 26
        : whiteoutRiskScore >= 58
          ? 18
          : whiteoutRiskScore >= 45
            ? 10
            : whiteoutRiskScore >= 32
              ? 4
              : 0;
  const activeRainPenalty = rainOpening.activeRainDuringWindow ? 18 : 0;
  const transparencyPenalty =
    stats.transparencyScore !== undefined && stats.transparencyScore < 35 ? 10 : 0;
  const openingBonus =
    rainOpening.postRainOpeningChance === "high"
      ? 5
      : rainOpening.postRainOpeningChance === "medium"
        ? 2
        : 0;

  return clampScore(
    averageWeightedScore([
      { score: formationScore, weight: 0.5 },
      { score: lightAlignedScore, weight: 0.24 },
      { score: 100 - whiteoutRiskScore, weight: 0.2 },
      {
        score: stats.transparencyScore ?? visibilityOpportunityScore(stats.visibility),
        weight: 0.06,
      },
    ]) -
      whiteoutPenalty -
      activeRainPenalty -
      transparencyPenalty +
      terrainBonus +
      stabilityBonus +
      openingBonus,
  );
}

function applyTerrainModeFormationCap(
  score: number,
  terrainSupport: CloudSeaTerrainSupport,
): number {
  const mode = terrainSupport.terrainMode;
  if (mode === "urban_or_plain" || mode === "lowland") {
    return Math.min(score, terrainSupport.confidence === "low" ? 40 : 48);
  }
  if (mode === "unknown") {
    return Math.min(score, 42);
  }
  if (mode === "hill") {
    return Math.min(score, 76);
  }
  return score;
}

function applyTerrainModeShootableCap(
  score: number,
  formationScore: number,
  terrainSupport: CloudSeaTerrainSupport,
): number {
  const formationCappedScore =
    formationScore < 45
      ? Math.min(score, formationScore + 8)
      : formationScore < 55
        ? Math.min(score, 54)
        : score;
  const mode = terrainSupport.terrainMode;
  if (mode === "urban_or_plain" || mode === "lowland") {
    return Math.min(
      formationCappedScore,
      formationScore,
      terrainSupport.confidence === "low" ? 32 : 42,
    );
  }
  if (mode === "unknown") {
    return Math.min(formationCappedScore, formationScore, 34);
  }
  if (mode === "hill" && formationScore < 68) {
    return Math.min(formationCappedScore, 56);
  }
  return formationCappedScore;
}

function candidateLabelForTerrain(
  candidate: CandidateWindows,
  terrainSupport: CloudSeaTerrainSupport,
): string {
  const mode = terrainSupport.terrainMode;
  if (terrainModeAllowsDefaultCloudSea(mode)) {
    return candidate.label;
  }
  if (mode === "hill") {
    if (candidate.kind === "morning") {
      return "清晨云雾观察";
    }
    if (candidate.kind === "evening") {
      return "傍晚云雾层次";
    }
    return "云雾变化观察";
  }
  if (candidate.kind === "morning") {
    return "晨雾或云层变化";
  }
  if (candidate.kind === "evening") {
    return "云层开口观察";
  }
  return "低云与通透观察";
}

function cloudObstructionRiskTag(
  whiteoutRiskScore: number,
  terrainSupport: CloudSeaTerrainSupport,
): string {
  if (terrainModeUsesMountainSemantics(terrainSupport.terrainMode)) {
    return whiteoutRiskScore >= 70
      ? "白墙风险高"
      : whiteoutRiskScore >= 45
        ? "白墙风险中"
        : "白墙风险低";
  }

  return whiteoutRiskScore >= 70
    ? "低云遮挡高"
    : whiteoutRiskScore >= 45
      ? "低云遮挡中"
      : "低云遮挡低";
}

function buildCandidateWindows(
  input: ForecastCalculationInput,
  date: string,
): readonly CandidateWindows[] {
  const forecastStart = input.calendarBasis.forecastStart;
  const forecastEnd = input.calendarBasis.forecastEnd;
  const astro = input.astroSummaries.find((summary) => summary.date === date);
  const sunrise = astro?.sunrise;
  const sunset = astro?.sunset;
  const civilDawn = astro?.civilDawn;
  const civilDusk = astro?.civilDusk;
  const sunriseKnown = Boolean(sunrise);
  const candidates: CandidateWindows[] = [];
  const morningStart = civilDawn ?? (sunrise ? addHours(sunrise, -1) : `${date}T04:30:00+08:00`);
  const morningEnd = sunrise ? addHours(sunrise, 1.5) : `${date}T07:30:00+08:00`;
  const morningObservation = clipWindow(morningStart, morningEnd, forecastStart, forecastEnd);

  if (morningObservation) {
    candidates.push({
      date,
      kind: "morning",
      label: "清晨云海窗口",
      sunriseKnown,
      lightAlignedScore: sunriseKnown ? 96 : 82,
      accumulation: sunrise
        ? clipWindow(addHours(sunrise, -3), addHours(sunrise, -1), forecastStart, forecastEnd)
        : clipWindow(
            `${date}T02:30:00+08:00`,
            `${date}T04:30:00+08:00`,
            forecastStart,
            forecastEnd,
          ),
      observation: morningObservation,
      dissipation: sunrise
        ? clipWindow(addHours(sunrise, 1.5), addHours(sunrise, 3), forecastStart, forecastEnd)
        : clipWindow(
            `${date}T07:30:00+08:00`,
            `${date}T09:30:00+08:00`,
            forecastStart,
            forecastEnd,
          ),
    });
  }

  if (sunset) {
    const eveningObservation = clipWindow(
      addHours(sunset, -1.25),
      civilDusk ?? addHours(sunset, 1),
      forecastStart,
      forecastEnd,
    );
    if (eveningObservation) {
      candidates.push({
        date,
        kind: "evening",
        label: "傍晚云海观察窗口",
        sunriseKnown,
        lightAlignedScore: 78,
        accumulation: clipWindow(
          addHours(sunset, -3),
          addHours(sunset, -1.25),
          forecastStart,
          forecastEnd,
        ),
        observation: eveningObservation,
        dissipation: clipWindow(
          civilDusk ?? addHours(sunset, 1),
          addHours(sunset, 2),
          forecastStart,
          forecastEnd,
        ),
      });
    }
  }

  const daytimeObservation = clipWindow(
    `${date}T10:00:00+08:00`,
    `${date}T15:00:00+08:00`,
    forecastStart,
    forecastEnd,
  );
  if (daytimeObservation) {
    candidates.push({
      date,
      kind: "daytime",
      label: "日间层次观察窗口",
      sunriseKnown,
      lightAlignedScore: 54,
      observation: daytimeObservation,
    });
  }

  return candidates;
}

function clipWindow(
  startTime: string,
  endTime: string,
  forecastStart: string,
  forecastEnd: string,
): Pick<CloudSeaAnalysisWindow, "startTime" | "endTime"> | undefined {
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  const forecastStartMs = Date.parse(forecastStart);
  const forecastEndMs = Date.parse(forecastEnd);

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    !Number.isFinite(forecastStartMs) ||
    !Number.isFinite(forecastEndMs) ||
    endMs <= startMs ||
    endMs <= forecastStartMs ||
    startMs >= forecastEndMs
  ) {
    return undefined;
  }

  const clippedStartTime = startMs < forecastStartMs ? forecastStart : startTime;
  const clippedEndTime = endMs > forecastEndMs ? forecastEnd : endTime;
  if (Date.parse(clippedEndTime) <= Date.parse(clippedStartTime)) {
    return undefined;
  }

  return {
    startTime: clippedStartTime,
    endTime: clippedEndTime,
  };
}

function buildWindowStats(
  input: ForecastCalculationInput,
  weatherWindow: readonly NormalizedHourlyWeather[],
): WindowStats {
  const missingFields = uniqueStrings([
    ...input.weatherMissingFields,
    ...weatherWindow.flatMap((hour) => hour.missingFields ?? []),
  ]);
  const estimatedFields = uniqueStrings([
    ...input.weatherEstimatedFields,
    ...weatherWindow.flatMap((hour) => hour.estimatedFields ?? []),
  ]);
  const hasLowCloud = weatherWindow.some((hour) => isFiniteNumber(hour.cloudLow));
  const lowCloudEstimated = estimatedFields.includes("cloudLow");

  return {
    temperature: averageOptional(weatherWindow, (hour) => hour.temperature),
    terrainAdjustedTemperature: averageOptional(
      weatherWindow,
      (hour) =>
        hour.temperatureAdjustment?.terrainAdjustedTemperatureC ??
        hour.elevationAdjustedTemperature ??
        hour.temperature,
    ),
    humidity: averageOptional(weatherWindow, (hour) => hour.humidity),
    dewPointSpread: averageOptional(weatherWindow, (hour) =>
      typeof hour.dewPoint === "number"
        ? hour.temperature - hour.dewPoint
        : typeof hour.dewPointSpread === "number"
          ? hour.dewPointSpread
          : undefined,
    ),
    windSpeed: averageOptional(weatherWindow, (hour) => hour.windSpeed),
    windGust: averageOptional(weatherWindow, (hour) => hour.windGust),
    windDirection: averageDirection(weatherWindow),
    visibility: averageOptional(weatherWindow, (hour) => hour.visibility),
    precipitationProbability: averageOptional(
      weatherWindow,
      (hour) => hour.precipitationProbability,
    ),
    precipitationProbabilityMax: maxOptional(
      weatherWindow.map((hour) => hour.precipitationProbability ?? undefined),
    ),
    precipitation: averageOptional(weatherWindow, (hour) => precipitationAmountMm(hour)),
    precipitationSum: sumOptional(
      weatherWindow.map((hour) => precipitationAmountMm(hour) ?? undefined),
    ),
    cloudTotal: averageOptional(weatherWindow, (hour) => hour.cloudTotal),
    cloudLow: averageOptional(weatherWindow, (hour) => hour.cloudLow),
    cloudMid: averageOptional(weatherWindow, (hour) => hour.cloudMid),
    cloudHigh: averageOptional(weatherWindow, (hour) => hour.cloudHigh),
    transparencyScore: averageOptional(weatherWindow, (hour) => hour.photographyTransparencyScore),
    pressure: averageOptional(weatherWindow, (hour) => hour.pressure),
    weatherTexts: uniqueStrings(
      weatherWindow.flatMap((hour) => (hour.weatherTextZh ? [hour.weatherTextZh] : [])),
    ),
    hasLowCloud,
    lowCloudEstimated,
    missingFields,
    estimatedFields,
  };
}

function hasExplicitLowCloudEvidence(stats: WindowStats): boolean {
  return (
    stats.hasLowCloud &&
    !stats.lowCloudEstimated &&
    stats.cloudLow !== undefined &&
    !stats.missingFields.includes("cloudLow")
  );
}

function cloudLayerRolesForStats(
  stats: WindowStats,
  terrainSupport: CloudSeaTerrainSupport,
  lightAlignedScore?: number,
): CloudLayerRoleContext {
  const explicitLowCloud = hasExplicitLowCloudEvidence(stats);
  const lightPhase =
    lightAlignedScore !== undefined && lightAlignedScore >= 82
      ? ("sunrise" as const)
      : lightAlignedScore !== undefined && lightAlignedScore >= 68
        ? ("sunset" as const)
        : undefined;

  return classifyCloudLayerRoles({
    cloudTotalPercent: stats.cloudTotal,
    cloudHighPercent: stats.cloudHigh,
    cloudMidPercent: stats.cloudMid,
    cloudLowPercent: explicitLowCloud ? stats.cloudLow : null,
    cloudLayerBasis: explicitLowCloud
      ? "partial_layers"
      : stats.cloudTotal !== undefined
        ? "total_only"
        : "unknown",
    relativeHumidityPercent: stats.humidity,
    dewPointSpreadC: stats.dewPointSpread,
    visibilityKm: stats.visibility,
    windSpeedMs: stats.windSpeed,
    precipitationAmountMm: stats.precipitationSum ?? stats.precipitation,
    precipitationProbabilityPercent:
      stats.precipitationProbabilityMax ?? stats.precipitationProbability,
    terrainMode: terrainSupport.terrainMode,
    terrainScore: terrainSupport.score,
    lightPhase,
  });
}

function humidityScore(humidity: number | undefined): number {
  if (humidity === undefined) {
    return 48;
  }
  if (humidity >= 95) {
    return 98;
  }
  if (humidity >= 90) {
    return 90;
  }
  if (humidity >= 75) {
    return clampScore(55 + (humidity - 75) * 2);
  }
  return clampScore(30 + humidity * 0.25);
}

function dewPointSpreadScore(spread: number | undefined): number {
  if (spread === undefined) {
    return 55;
  }
  if (spread <= 2) {
    return 96;
  }
  if (spread <= 4) {
    return 84;
  }
  if (spread <= 7) {
    return 62;
  }
  return clampScore(62 - (spread - 7) * 8);
}

function lowCloudOpportunityScore(stats: WindowStats): number {
  const lowCloud = stats.cloudLow;
  if (lowCloud === undefined) {
    return 34;
  }
  if (stats.lowCloudEstimated) {
    return Math.min(48, clampScore(22 + lowCloud * 0.55));
  }
  if (lowCloud >= 50 && lowCloud <= 90) {
    return 92;
  }
  if (lowCloud >= 35 && lowCloud < 50) {
    return clampScore(68 + (lowCloud - 35) * 1.4);
  }
  if (lowCloud > 90 && lowCloud <= 95) {
    return clampScore(78 - (lowCloud - 90) * 1.2);
  }
  if (lowCloud > 95) {
    return 48;
  }
  return clampScore(24 + lowCloud * 1.6);
}

function windOpportunityScore(windSpeed: number | undefined): number {
  if (windSpeed === undefined) {
    return 55;
  }
  if (windSpeed < 0.5) {
    return 58;
  }
  if (windSpeed <= 6) {
    return 92;
  }
  if (windSpeed <= 8) {
    return 74;
  }
  if (windSpeed <= 11) {
    return 42;
  }
  return 18;
}

function visibilityOpportunityScore(visibility: number | undefined): number {
  if (visibility === undefined) {
    return 50;
  }
  if (visibility < 3) {
    return 30;
  }
  if (visibility < 8) {
    return 56;
  }
  if (visibility <= 20) {
    return 86;
  }
  return 72;
}

function precipitationOpportunityScore(stats: WindowStats): number {
  const riskScore = weatherPrecipitationRiskScore({
    probability: stats.precipitationProbabilityMax ?? stats.precipitationProbability,
    amountMm: stats.precipitationSum ?? stats.precipitation,
  });
  const precipitation = stats.precipitationSum ?? stats.precipitation ?? 0;

  if (riskScore >= 70 || precipitation >= 2) {
    return 20;
  }
  if (riskScore >= 45 || precipitation >= 0.8) {
    return 45;
  }
  if ((stats.humidity ?? 0) >= 88 && precipitation > 0 && precipitation < 0.8) {
    return 76;
  }
  if (stats.pressure !== undefined) {
    return 68;
  }
  return 60;
}

function lowCloudWhiteoutRiskScore(stats: WindowStats): number {
  const lowCloud = stats.cloudLow;
  if (lowCloud === undefined) {
    return 28;
  }
  if (stats.lowCloudEstimated) {
    return Math.min(42, clampScore(18 + lowCloud * 0.35));
  }
  if (lowCloud > 90) {
    return 96;
  }
  if (lowCloud > 80) {
    return 86;
  }
  if (lowCloud >= 60) {
    return 64;
  }
  if (lowCloud >= 35) {
    return 38;
  }
  return 22;
}

function humidityWhiteoutRiskScore(humidity: number | undefined): number {
  if (humidity === undefined) {
    return 45;
  }
  if (humidity > 95) {
    return 92;
  }
  if (humidity > 90) {
    return 72;
  }
  if (humidity >= 80) {
    return 48;
  }
  return 24;
}

function dewPointSpreadWhiteoutRiskScore(spread: number | undefined): number {
  if (spread === undefined) {
    return 45;
  }
  if (spread <= 1.5) {
    return 92;
  }
  if (spread <= 3) {
    return 78;
  }
  if (spread <= 5) {
    return 54;
  }
  return 24;
}

function visibilityWhiteoutRiskScore(visibility: number | undefined): number {
  if (visibility === undefined) {
    return 48;
  }
  if (visibility < 3) {
    return 96;
  }
  if (visibility < 8) {
    return 66;
  }
  if (visibility > 10) {
    return 22;
  }
  return 38;
}

function windWhiteoutRiskScore(windSpeed: number | undefined): number {
  if (windSpeed === undefined) {
    return 45;
  }
  if (windSpeed < 0.5) {
    return 72;
  }
  if (windSpeed < 2) {
    return 64;
  }
  if (windSpeed <= 5) {
    return 34;
  }
  return 24;
}

function cloudTotalWhiteoutRiskScore(cloudTotal: number | undefined): number {
  if (cloudTotal === undefined) {
    return 45;
  }
  if (cloudTotal >= 90) {
    return 82;
  }
  if (cloudTotal >= 75) {
    return 62;
  }
  if (cloudTotal >= 55) {
    return 42;
  }
  return 22;
}

function precipitationRiskScore(stats: WindowStats): number {
  return weatherPrecipitationRiskScore({
    probability: stats.precipitationProbabilityMax ?? stats.precipitationProbability,
    amountMm: stats.precipitationSum ?? stats.precipitation,
  });
}

function weatherTextWhiteoutRiskScore(stats: WindowStats): number {
  const text = stats.weatherTexts.join(" ");
  if (/大雨|暴雨|浓雾|雾|雨|雪|霾|mist|fog|rain|snow|overcast|heavy cloud/i.test(text)) {
    return 82;
  }
  if (/阴|多云|cloudy/i.test(text)) {
    return 58;
  }
  return 28;
}

function activeRainOrFog(stats: WindowStats): boolean {
  const text = stats.weatherTexts.join(" ");
  return (
    (stats.precipitationSum ?? stats.precipitation ?? 0) >= 0.3 ||
    (stats.precipitationProbabilityMax ?? stats.precipitationProbability ?? 0) >= 55 ||
    /雨|雪|雾|霾|mist|fog|rain|snow/i.test(text)
  );
}

function terrainTravelBonus(terrainScore: number): number {
  if (terrainScore >= 82) {
    return 6;
  }
  if (terrainScore >= 65) {
    return 3;
  }
  if (terrainScore < 42) {
    return -7;
  }
  return 0;
}

function windowStabilityBonus(
  stats: WindowStats,
  accumulationStats: WindowStats | undefined,
  dissipationStats: WindowStats | undefined,
  terrainScore: number,
): number {
  let bonus = 0;

  if (accumulationStats && accumulationStats.humidity !== undefined) {
    const accumulationScore = calculateCloudSeaOpportunityScore(accumulationStats, terrainScore);
    if (accumulationScore >= 65 && (stats.humidity ?? 0) >= 88) {
      bonus += 5;
    } else if (accumulationScore < 45) {
      bonus -= 4;
    }
  } else {
    bonus -= 2;
  }

  if (dissipationStats) {
    const dissipationRisk = calculateWhiteoutRiskScore(dissipationStats);
    if (dissipationRisk >= 72) {
      bonus -= 5;
    } else if (dissipationRisk <= 45 && (stats.windSpeed ?? 99) <= 5) {
      bonus += 2;
    }
  }

  return bonus;
}

function buildRainOpeningSignal(
  stats: WindowStats,
  accumulationStats: WindowStats | undefined,
  dissipationStats: WindowStats | undefined,
): CloudSeaRainOpeningSignal {
  const preRain = accumulationStats ? rainIntensity(accumulationStats) : 0;
  const activeRain = activeRainOrFog(stats);
  const postRain = dissipationStats ? rainIntensity(dissipationStats) : 0;
  const rainSupportSignal = preRain > 0.15 && preRain < 6 && !activeRain;
  const windFavorable = (stats.windSpeed ?? 99) >= 1 && (stats.windSpeed ?? 99) <= 6;
  const visibilityUsable = (stats.visibility ?? 0) >= 5;
  const lowCloudUseful = (stats.cloudLow ?? 0) >= 45 && (stats.cloudLow ?? 100) <= 90;
  const openingChance =
    rainSupportSignal && windFavorable && visibilityUsable && lowCloudUseful
      ? "high"
      : (rainSupportSignal || (preRain > 0.15 && postRain < preRain)) && !activeRain
        ? "medium"
        : "low";
  const messageZh = activeRain
    ? "观测窗口内有降水或雾信号，云海可拍性会被打断。"
    : openingChance === "high"
      ? "窗口前降水已减弱，清晨可能出现短暂云雾开口。"
      : openingChance === "medium"
        ? "若雨势提前减弱，可机动观察云层流动和远山层次。"
        : "降水对云海形成的支持不明显，仍以低云、湿度和能见度为主。";

  return {
    rainSupportSignal,
    activeRainDuringWindow: activeRain,
    postRainOpeningChance: openingChance,
    messageZh,
  };
}

function rainIntensity(stats: WindowStats): number {
  const probability = stats.precipitationProbabilityMax ?? stats.precipitationProbability ?? 0;
  const amount = stats.precipitationSum ?? stats.precipitation ?? 0;
  return amount + probability / 100;
}

function buildTerrainSupport(input: ForecastCalculationInput): CloudSeaTerrainSupport {
  const terrain = input.terrainAnalysis.terrainProfile;
  const locationElevation = finiteNumber(terrain.locationElevation);
  const nearbyValleyElevation = finiteNumber(terrain.nearbyValleyElevationMeters);
  const providerElevationMeters =
    finiteNumber(input.currentWeather?.providerElevationMeters) ??
    input.hourlyWeather
      .map((hour) => finiteNumber(hour.providerElevationMeters))
      .find(isFiniteNumber) ??
    input.dailyWeather.map((day) => finiteNumber(day.providerElevationMeters)).find(isFiniteNumber);
  const relief =
    finiteNumber(terrain.localReliefMeters) ??
    finiteNumber(terrain.elevationDiff5km) ??
    (locationElevation !== undefined && nearbyValleyElevation !== undefined
      ? locationElevation - nearbyValleyElevation
      : undefined);
  const selectedSpotElevation =
    finiteNumber(terrain.elevationMeters) ?? finiteNumber(terrain.locationElevation);
  const terrainMode = classifyTerrainMode(terrain);
  const reliefScore =
    relief === undefined
      ? 42
      : relief >= 1000
        ? 94
        : relief >= 650
          ? 82
          : relief >= 350
            ? 64
            : relief >= 180
              ? 45
              : 26;
  const terrainTypeScore =
    terrain.terrainType === "summit" ||
    terrain.terrainType === "ridge" ||
    terrain.terrainType === "mountain_platform"
      ? 86
      : terrain.terrainType === "slope"
        ? 58
        : terrain.terrainType === "valley" ||
            terrain.terrainType === "lake" ||
            terrain.terrainType === "city"
          ? 24
          : 44;
  const exposureScore =
    terrain.exposureType === "exposed"
      ? 76
      : terrain.exposureType === "semi_exposed"
        ? 64
        : terrain.exposureType === "sheltered"
          ? 38
          : 48;
  const potentialScore =
    terrain.terrainCloudSeaPotential === "high"
      ? 88
      : terrain.terrainCloudSeaPotential === "medium"
        ? 66
        : 34;
  const rawScore = averageWeightedScore([
    { score: reliefScore, weight: 0.42 },
    { score: terrainTypeScore, weight: 0.24 },
    { score: exposureScore, weight: 0.12 },
    { score: potentialScore, weight: 0.22 },
  ]);
  const score = terrainModeAdjustedSupportScore(rawScore, terrainMode);
  const confidence: CloudSeaTerrainSupport["confidence"] =
    terrainMode === "unknown" ||
    relief === undefined ||
    terrain.terrainType === "unknown" ||
    terrain.elevationConfidence === "low"
      ? "low"
      : input.terrainAnalysis.isMock || terrain.elevationConfidence === "medium"
        ? "medium"
        : "high";
  const level = chanceLabel(score);
  const messageZh = terrainSupportMessageZh(terrainMode, relief, level);

  return {
    score,
    level,
    terrainMode,
    selectedSpotElevationMeters: selectedSpotElevation,
    nearbyValleyElevationMeters: nearbyValleyElevation,
    localReliefMeters: relief,
    providerElevationMeters,
    terrainType: terrain.terrainType,
    exposureType: terrain.exposureType,
    confidence,
    messageZh,
  };
}

function terrainModeAdjustedSupportScore(
  score: number,
  terrainMode: CloudSeaTerrainSupport["terrainMode"],
): number {
  if (terrainMode === "urban_or_plain" || terrainMode === "lowland") {
    return Math.min(score, 20);
  }
  if (terrainMode === "unknown") {
    return Math.min(score, 30);
  }
  if (terrainMode === "hill") {
    return Math.min(score, 58);
  }
  return score;
}

function terrainSupportMessageZh(
  terrainMode: CloudSeaTerrainSupport["terrainMode"],
  relief: number | undefined,
  level: CloudSeaTerrainSupport["level"],
): string {
  if (terrainMode === "urban_or_plain" || terrainMode === "lowland") {
    return "低海拔且缺少有效周边高差，不按高山云海判断；更适合关注晨雾、低云和远景通透。";
  }
  if (terrainMode === "unknown" || relief === undefined) {
    return "地形高差资料不足，云雾观察潜力按低置信度保守处理。";
  }
  if (terrainMode === "hill") {
    return "丘陵地形需要更明确的低云、湿度、地形高差和光线开口，才建议按云海观察。";
  }
  if (level === "高") {
    return "机位高于周边谷地，高差和开阔度支持俯拍云海。";
  }
  if (level === "中") {
    return "具备一定山谷高差，可作为云雾观察基础。";
  }
  return "周边高差或机位类型不利于俯拍完整云海。";
}

function buildMissingDataNotes(
  input: ForecastCalculationInput,
  stats: WindowStats,
  sunriseKnown: boolean,
): readonly string[] {
  const notes: string[] = [];

  if (!hasExplicitLowCloudEvidence(stats) || stats.missingFields.includes("cloudLow")) {
    notes.push(lowCloudMissingNote);
  }
  if (stats.dewPointSpread === undefined || stats.missingFields.includes("dewPoint")) {
    notes.push("当前天气源缺少露点数据，湿度与凝结条件判断置信度降低。");
  }
  if (stats.visibility === undefined || stats.missingFields.includes("visibility")) {
    notes.push("当前天气源缺少能见度数据，白墙风险和通透度判断置信度降低。");
  }
  if (finiteNumber(input.terrainAnalysis.terrainProfile.elevationDiff5km) === undefined) {
    notes.push("当前地形数据缺少 5km 高差，云海地形潜力判断置信度降低。");
  }
  if (!sunriseKnown) {
    notes.push("当前日期缺少日出时间，已使用 04:30-07:30 清晨默认窗口，置信度降低。");
  }
  if (input.weatherDataMode !== "real") {
    notes.push("天气数据：演示数据。");
  }
  if (input.terrainAnalysis.isMock) {
    notes.push("地形数据：演示数据。");
  }

  return uniqueStrings(notes);
}

function confidencePenalty(
  input: ForecastCalculationInput,
  stats: WindowStats,
  sunriseKnown: boolean,
  terrainSupport: CloudSeaTerrainSupport,
): number {
  let penalty = 0;

  if (!hasExplicitLowCloudEvidence(stats) || stats.missingFields.includes("cloudLow")) {
    penalty += 25;
  }
  if (stats.dewPointSpread === undefined || stats.missingFields.includes("dewPoint")) {
    penalty += 15;
  }
  if (stats.visibility === undefined || stats.missingFields.includes("visibility")) {
    penalty += 15;
  }
  if (terrainSupport.confidence === "low") {
    penalty += 18;
  }
  if (input.weatherDataMode === "mock") {
    penalty += 15;
  } else if (input.weatherDataMode === "fixture") {
    penalty += 10;
  }
  if (input.weatherFusionSummary?.multiSourceAgreementContext?.shouldLowerConfidence) {
    penalty += 10;
  }
  if (!sunriseKnown) {
    penalty += 10;
  }
  if (stats.estimatedFields.length > 0) {
    penalty += 5;
  }

  return penalty;
}

function classifyCloudSeaConfidence(
  input: ForecastCalculationInput,
  evaluations: readonly WindowEvaluation[],
  missingDataNotes: readonly string[],
): CloudSeaConfidenceLevel {
  const maxPenalty = Math.max(...evaluations.map((evaluation) => evaluation.confidencePenalty), 0);
  const confidenceScore = clampScore(100 - maxPenalty);
  const nonRealData = input.weatherDataMode !== "real" || input.terrainAnalysis.isMock;

  if (missingDataNotes.length >= 4 || confidenceScore < 50) {
    return "low";
  }
  if (nonRealData || missingDataNotes.length > 0 || confidenceScore < 75) {
    return "medium";
  }
  return "high";
}

function buildDailyCloudSeaForDate(
  input: ForecastCalculationInput,
  date: string,
  evaluations: readonly WindowEvaluation[],
): DailyCloudSea | undefined {
  const dayEvaluations = evaluations.filter((evaluation) => evaluation.date === date);
  const evaluation =
    [...dayEvaluations].sort((left, right) => {
      if (right.shootableScore !== left.shootableScore) {
        return right.shootableScore - left.shootableScore;
      }
      return right.formationScore - left.formationScore;
    })[0] ?? undefined;
  if (!evaluation) {
    return undefined;
  }
  const watchable = dayEvaluations
    .filter((candidate) => candidate.window.startTime !== evaluation.window.startTime)
    .find((candidate) => candidate.formationScore >= 55 && candidate.shootableScore >= 32);
  const notRecommended = dayEvaluations.find(
    (candidate) =>
      candidate.formationScore >= 50 &&
      (candidate.shootableScore < 32 ||
        candidate.whiteoutRiskScore >= 78 ||
        candidate.rainOpening.activeRainDuringWindow),
  );
  const dateLabelZh =
    input.calendarBasis.calendarDays.find((day) => day.date === evaluation.window.date)
      ?.dateLabel ??
    input.calendarBasis.targetDateLabels[
      input.calendarBasis.targetDates.indexOf(evaluation.window.date ?? "")
    ] ??
    evaluation.window.date ??
    evaluation.window.startTime.slice(0, 10);

  return {
    date: evaluation.window.date ?? evaluation.window.startTime.slice(0, 10),
    dateLabelZh,
    formationScore: evaluation.formationScore,
    opportunityScore: evaluation.formationScore,
    shootableScore: evaluation.shootableScore,
    whiteoutRiskScore: evaluation.whiteoutRiskScore,
    lightAlignedScore: evaluation.lightAlignedScore,
    confidence: evaluation.confidence,
    labels: buildAssessmentLabels(
      evaluation,
      evaluation.window,
      watchable?.window,
      notRecommended?.window,
    ),
    travelScore: evaluation.shootableScore,
    bestWindow: evaluation.window,
    watchableWindow: watchable?.window,
    notRecommendedWindow: notRecommended?.window,
    rainOpening: evaluation.rainOpening,
    onSiteCheckpoints: buildOnSiteCheckpoints(evaluation),
    recommendationLabel: cloudSeaRecommendationLabel(evaluation.shootableScore),
    keyReason:
      evaluation.opportunityReasons[0] ??
      "清晨云海信号已按湿度、低云、风速、能见度和地形综合判断。",
    riskNote: evaluation.whiteoutReasons[0] ?? "暂未发现高等级白墙风险，仍需现场复核低云高度。",
  };
}

function buildOnSiteCheckpoints(evaluation: WindowEvaluation): readonly string[] {
  const checkpoints = ["复核云雾上沿是否低于机位", "复核远山层次和能见度是否可用"];

  if (evaluation.whiteoutRiskScore >= 60) {
    checkpoints.push("重点观察低云是否包顶形成白墙");
  }
  if (evaluation.rainOpening.activeRainDuringWindow) {
    checkpoints.push("确认窗口内降水是否已减弱或停止");
  } else if (evaluation.rainOpening.postRainOpeningChance !== "low") {
    checkpoints.push("留意雨后短暂开口和云层流动");
  }
  if (evaluation.lightAlignedScore < 65) {
    checkpoints.push("确认云雾信号是否延续到可用光线时段");
  }

  return uniqueStrings(checkpoints).slice(0, 4);
}

function buildOpportunityReasons(
  input: ForecastCalculationInput,
  stats: WindowStats,
  terrainSupport: CloudSeaTerrainSupport,
  formationScore: number,
  shootableScore: number,
  lightAlignedScore: number,
  rainOpening: CloudSeaRainOpeningSignal,
  stabilityBonus: number,
): readonly string[] {
  const terrain = input.terrainAnalysis.terrainProfile;
  const elevationDiff = finiteNumber(terrain.elevationDiff5km);
  const usesMountain = terrainModeAllowsDefaultCloudSea(terrainSupport.terrainMode);
  const formationLabel = usesMountain ? "云海形成条件" : "低云/晨雾条件";
  const shootableLabel = usesMountain ? "云海可拍条件" : "云雾观察条件";
  const layerRoles = cloudLayerRolesForStats(stats, terrainSupport, lightAlignedScore);
  const layerRoleNote =
    layerRoles.primaryCloudRole === "glow_reference" ||
    layerRoles.primaryCloudRole === "texture" ||
    layerRoles.primaryCloudRole === "needs_review"
      ? layerRoles.noteZh
      : undefined;
  const reasons = [
    layerRoleNote,
    `${formationLabel} ${formationScore} 分：湿度约 ${formatPercent(
      stats.humidity,
    )}，露点差约 ${formatDegree(stats.dewPointSpread)}，用于判断水汽是否接近凝结。`,
    hasExplicitLowCloudEvidence(stats)
      ? `低云约 ${formatPercent(
          stats.cloudLow,
        )}，50%-90% 更支持云雾形成；接近满低云时需同时看遮挡风险。`
      : lowCloudMissingNote,
    `${shootableLabel} ${shootableScore} 分：光线重叠 ${lightAlignedScore} 分，低云遮挡风险已单独扣减。`,
    elevationDiff === undefined
      ? `周边高差暂未计算，地形云海潜力按保守值处理。${terrainSupport.messageZh}`
      : `5km 高差约 ${formatMeters(
          elevationDiff,
        )}，地形云海潜力和机位类型综合支持为${terrainSupport.level}。${terrainSupport.messageZh}`,
    `风速约 ${formatSpeed(stats.windSpeed)}，过弱易包顶，过强会吹散云雾层。`,
    `能见度约 ${formatKm(stats.visibility)}，用于区分可俯拍云海与白墙。`,
    rainOpening.messageZh,
  ].filter((reason): reason is string => Boolean(reason));

  if (stabilityBonus > 0) {
    reasons.push("夜间积累与日出后消散风险组合较稳定，清晨等待价值上调。");
  }
  if (terrainSupport.score >= 82) {
    reasons.push("机位与周边谷地落差明显，有利于站在云雾层上方观察。");
  }

  return reasons;
}

function buildWhiteoutReasons(
  stats: WindowStats,
  whiteoutRiskScore: number,
  terrainSupport: CloudSeaTerrainSupport,
): readonly string[] {
  const usesMountain = terrainModeUsesMountainSemantics(terrainSupport.terrainMode);
  const reasons = [
    hasExplicitLowCloudEvidence(stats)
      ? usesMountain
        ? `低云约 ${formatPercent(stats.cloudLow)}，低云过厚或抬升到机位高度时会增加白墙风险。`
        : `低云约 ${formatPercent(stats.cloudLow)}，低云过厚时会增加遮挡、雾气和通透度下降风险。`
      : usesMountain
        ? "低云分层缺失，当前不使用总云量推断白墙风险，只能给出复核提示。"
        : "低云分层缺失，当前不使用总云量推断低云遮挡，只能给出复核提示。",
    `湿度约 ${formatPercent(stats.humidity)}，露点差约 ${formatDegree(
      stats.dewPointSpread,
    )}，能见度约 ${formatKm(stats.visibility)}。`,
    `风速约 ${formatSpeed(stats.windSpeed)}，近静风更容易让雾包住机位。`,
    terrainSupport.confidence === "low"
      ? usesMountain
        ? "地形高差或机位类型资料不足，低云偏厚时按更保守的白墙风险处理。"
        : "地形高差或机位类型资料不足，低云偏厚时按更保守的遮挡风险处理。"
      : usesMountain
        ? "当前未提供云底高度，不伪造云层相对机位高度，仍需现场复核云雾上沿。"
        : "当前未提供云底高度，不伪造云层相对机位高度，仍需现场复核雾气和能见度。",
  ];

  if (whiteoutRiskScore >= 70) {
    reasons.unshift(
      usesMountain
        ? "白墙风险偏高，机位可能被低云或雾包裹，远山层次和云海边界会明显下降。"
        : "低云或雾气遮挡偏高，远景层次和通透观察会明显下降。",
    );
  } else if (whiteoutRiskScore >= 45) {
    reasons.unshift(
      usesMountain
        ? "白墙风险中等，需要现场观察云雾上沿是否低于机位。"
        : "低云遮挡风险中等，需要现场观察雾气厚度和能见度。",
    );
  } else {
    reasons.unshift(
      usesMountain
        ? "白墙风险较低，仍需在日出前后复核能见度。"
        : "低云遮挡风险较低，仍需在日出前后复核能见度。",
    );
  }

  return reasons;
}

function buildWindowNoteZh(
  formationScore: number,
  shootableScore: number,
  whiteoutRiskScore: number,
  rainOpening: CloudSeaRainOpeningSignal,
  terrainSupport: CloudSeaTerrainSupport,
  stats: WindowStats,
  lightAlignedScore: number,
): string {
  const layerRoles = cloudLayerRolesForStats(stats, terrainSupport, lightAlignedScore);
  if (
    layerRoles.primaryCloudRole === "glow_reference" ||
    layerRoles.primaryCloudRole === "texture" ||
    layerRoles.primaryCloudRole === "needs_review"
  ) {
    return layerRoles.noteZh;
  }
  if (terrainModeUsesLowlandSemantics(terrainSupport.terrainMode)) {
    if (shootableScore >= 38) {
      return "晨雾或低云变化可顺带观察，但地形不支持按高山云海专程判断。";
    }
    if (formationScore >= 42) {
      return "低云与湿度有雾气信号，但缺少高差支撑，优先按云层变化和通透度处理。";
    }
    return "地形与天气信号都不足，不建议按云海逻辑安排。";
  }
  if (terrainSupport.terrainMode === "hill" && shootableScore < 64) {
    return "丘陵地形需要更强低云、湿度和光线开口，当前仅作云雾观察。";
  }
  if (formationScore >= 70 && whiteoutRiskScore >= 70) {
    return `云海形成条件较强，但低云偏厚，白墙风险较高。${rainOpening.messageZh}`;
  }
  if (shootableScore >= 70) {
    return "清晨有云海可拍窗口，建议提前到达并观察云顶开口。";
  }
  if (shootableScore >= 50) {
    return `有云海信号，但未形成高确定性可拍窗口。${rainOpening.messageZh}`;
  }
  if (formationScore >= 55) {
    return "低云与湿度支持云雾形成，但能见度、降水或光线条件限制可拍性，仅作观察。";
  }
  return "云海形成信号偏弱，不建议为单一窗口专程奔赴。";
}

function buildAssessmentLabels(
  evaluation: WindowEvaluation,
  bestWindow: CloudSeaAnalysisWindow | undefined,
  watchableWindow: CloudSeaAnalysisWindow | undefined,
  notRecommendedWindow: CloudSeaAnalysisWindow | undefined,
): CloudSeaAnalysisResult["labels"] {
  const usesMountainSemantics = terrainModeUsesMountainSemantics(
    evaluation.terrainSupport.terrainMode,
  );
  return {
    formationOpportunity: chanceLabel(evaluation.formationScore),
    shootableOpportunity: chanceLabel(evaluation.shootableScore),
    whiteoutRisk: chanceLabel(evaluation.whiteoutRiskScore),
    bestWindowLabel: bestWindow
      ? bestWindow.label
      : usesMountainSemantics
        ? "暂无最佳云海窗口"
        : "暂无明确云雾观察窗口",
    watchableWindowLabel: watchableWindow ? watchableWindow.label : undefined,
    notRecommendedWindowLabel: notRecommendedWindow
      ? `${notRecommendedWindow.label}：${notRecommendedWindow.riskTag}`
      : undefined,
  };
}

function chanceLabel(score: number): "高" | "中" | "低" {
  if (score >= 70) {
    return "高";
  }
  if (score >= 45) {
    return "中";
  }
  return "低";
}

function buildWeatherEvidence(stats: WindowStats): CloudSeaAnalysisResult["weatherEvidence"] {
  return [
    {
      label: "湿度",
      value: formatPercent(stats.humidity),
      effect: (stats.humidity ?? 0) >= 90 ? "positive" : "neutral",
      noteZh: "高湿度有利于山谷低云和雾形成，但需结合能见度判断是否变成白墙。",
    },
    {
      label: "露点差",
      value: formatDegree(stats.dewPointSpread),
      effect:
        stats.dewPointSpread === undefined
          ? "neutral"
          : stats.dewPointSpread <= 4
            ? "positive"
            : "negative",
      noteZh:
        stats.dewPointSpread === undefined
          ? "当前缺少露点数据，凝结条件置信度降低。"
          : "露点差越小，水汽越接近凝结，云雾积累信号越强。",
    },
    {
      label: "风速",
      value: formatSpeed(stats.windSpeed),
      effect:
        stats.windSpeed === undefined
          ? "neutral"
          : stats.windSpeed > 7
            ? "negative"
            : stats.windSpeed < 2
              ? "risk"
              : "positive",
      noteZh: "0.5-4 m/s 更利于稳定云海，近静风会增加白墙风险，强风会吹散云雾。",
    },
    {
      label: "风向",
      value: formatWindDirection(stats.windDirection),
      effect: "neutral",
      noteZh: "正式风向与谷地方向结合后，可判断云雾是否向机位推移或被吹散。",
    },
    {
      label: "能见度",
      value: formatKm(stats.visibility),
      effect:
        stats.visibility === undefined
          ? "neutral"
          : stats.visibility < 3
            ? "risk"
            : stats.visibility <= 20
              ? "positive"
              : "neutral",
      noteZh:
        stats.visibility === undefined
          ? "当前缺少能见度数据，白墙风险判断置信度降低。"
          : "8-20km 更利于看见云海边界；低于 3km 时白墙风险明显增加。",
    },
    {
      label: "降水",
      value: `${formatPercent(stats.precipitationProbability)} / ${formatMillimeters(stats.precipitation)}`,
      effect:
        (stats.precipitationProbability ?? 0) >= 45 || (stats.precipitation ?? 0) >= 0.8
          ? "negative"
          : "neutral",
      noteZh: "轻微前期降水在高湿条件下可能补充水汽，观测窗口内强降水会降低拍摄和通行价值。",
    },
    {
      label: "低云",
      value: hasExplicitLowCloudEvidence(stats) ? formatPercent(stats.cloudLow) : "分层缺失",
      effect:
        !hasExplicitLowCloudEvidence(stats) || stats.cloudLow === undefined
          ? "risk"
          : stats.cloudLow > 80
            ? "risk"
            : stats.cloudLow >= 30
              ? "positive"
              : "neutral",
      noteZh: hasExplicitLowCloudEvidence(stats)
        ? "低云适中更接近云海；低云过厚并包住机位时更接近白墙。"
        : lowCloudMissingNote,
    },
    {
      label: "气压 / 逆温 proxy",
      value: stats.pressure === undefined ? "暂无数据" : `${Math.round(stats.pressure)} hPa`,
      effect: "neutral",
      noteZh: "当前仅在有气压字段时显示，不伪造逆温廓线；后续可接入温度廓线提升判断。",
    },
  ];
}

function buildTerrainEvidence(
  input: ForecastCalculationInput,
): CloudSeaAnalysisResult["terrainEvidence"] {
  const terrain = input.terrainAnalysis.terrainProfile;
  const potential = terrain.terrainCloudSeaPotential;
  const elevationDiff = finiteNumber(terrain.elevationDiff5km);
  const diffEffect: CloudSeaEvidenceEffect =
    elevationDiff === undefined
      ? "negative"
      : elevationDiff >= 600
        ? "positive"
        : elevationDiff >= 300
          ? "neutral"
          : "negative";

  return [
    {
      label: "机位海拔",
      value: formatMeters(terrain.locationElevation),
      effect: "neutral",
      noteZh: "机位越可能高于谷地云雾层，越有机会俯拍云海。",
    },
    {
      label: "周边 1km 最低海拔",
      value: formatMeters(terrain.minElevation1km),
      effect: "neutral",
      noteZh: "用于判断近处谷地是否具备积雾空间。",
    },
    {
      label: "周边 3km 最低海拔",
      value: formatMeters(terrain.minElevation3km),
      effect: "neutral",
      noteZh: "用于判断中近景云雾层与机位的相对高度。",
    },
    {
      label: "周边 5km 最低海拔",
      value: formatMeters(terrain.minElevation5km),
      effect: "neutral",
      noteZh: "用于判断更大范围山谷云雾积累条件。",
    },
    {
      label: "5km 高差",
      value: formatMeters(terrain.elevationDiff5km),
      effect: diffEffect,
      noteZh: "高差超过 600m 开始具备较好的云海地形基础，超过 1000m 信号更强。",
    },
    {
      label: "谷地方向",
      value: terrain.valleyDirectionZh ?? "暂无数据",
      effect: "neutral",
      noteZh: "未来可结合风向判断云雾是否沿谷地向机位推移。",
    },
    {
      label: "云海地形潜力",
      value: terrainPotentialLabel(potential),
      effect: potential === "high" ? "positive" : potential === "medium" ? "neutral" : "negative",
      noteZh: input.terrainAnalysis.honestyNoteZh,
    },
    {
      label: "地形数据来源",
      value: input.terrainAnalysis.dataSourceLabelZh,
      effect: input.terrainAnalysis.isMock ? "neutral" : "positive",
      noteZh: input.terrainAnalysis.honestyNoteZh,
    },
  ];
}

function buildTravelRecommendations(
  travelScore: number,
  evaluation: WindowEvaluation,
): readonly CloudSeaTravelRecommendation[] {
  if (evaluation.formationScore >= 70 && evaluation.whiteoutRiskScore >= 70) {
    return [
      {
        situation: "已在山上",
        action: "仅作观察",
        detail: "云海形成条件较强，但白墙风险高；可等待短暂开口，重点复核云雾上沿和能见度。",
      },
      {
        situation: "周边短途",
        action: "机动观察",
        detail: "若雨势或低云提前减弱，可短时观察云层流动，不建议只押一个清晨窗口。",
      },
      {
        situation: "远途专程",
        action: "不建议只为云海出发",
        detail: "高形成信号与高白墙风险可以共存，远途专程需要等待更明确的开口和能见度信号。",
      },
    ];
  }

  if (travelScore >= 80) {
    return [
      {
        situation: "已在山上",
        action: "建议早起等待",
        detail: "优先守高点，日出前复核云雾上沿、能见度和风速变化。",
      },
      {
        situation: "周边短途",
        action: "推荐重点关注",
        detail: "可把清晨云海作为主计划，同时准备霞光或长焦山脊备选。",
      },
      {
        situation: "远途专程",
        action: "谨慎安排专程",
        detail: "分数具备吸引力，但仍需出发前复核真实天气和道路条件。",
      },
    ];
  }

  if (travelScore >= 65) {
    return [
      {
        situation: "已在山上",
        action: "建议早起等待",
        detail: "等待价值较高，重点观察低云是否低于机位。",
      },
      {
        situation: "周边短途",
        action: "可作为备选",
        detail: "适合短途机动，不建议只押一个机位。",
      },
      {
        situation: "远途专程",
        action: "谨慎专程",
        detail: "建议等临近预报确认低云、能见度和降水再决定。",
      },
    ];
  }

  if (travelScore >= 50) {
    return [
      {
        situation: "已在山上",
        action: "可短时观察",
        detail: "不要只守云海，同步准备雾景、山脊或日出备选。",
      },
      {
        situation: "周边短途",
        action: "可作为备选",
        detail: "仅适合作为机动计划，出发前复核低云和能见度。",
      },
      {
        situation: "远途专程",
        action: "不建议只为云海出发",
        detail: "远途成本与不确定性偏高，应设置其他题材主目标。",
      },
    ];
  }

  return [
    {
      situation: "已在山上",
      action: "不建议长时间死守",
      detail: "可等待短暂开口，但应尽快切换到近景雾气或层峦题材。",
    },
    {
      situation: "周边短途",
      action: "不建议专程",
      detail: "除非还有日出、通透或雾景备选，否则不建议出发。",
    },
    {
      situation: "远途专程",
      action: "不建议只为云海出发",
      detail: "当前云海机会或白墙风险不支持远途专程。",
    },
  ];
}

function buildFallbackEvaluation(input: ForecastCalculationInput): WindowEvaluation {
  const date = input.calendarBasis.targetDates[0] ?? input.calendarBasis.forecastStart.slice(0, 10);
  const terrainSupport = buildTerrainSupport(input);
  const observation = clipWindow(
    `${date}T04:30:00+08:00`,
    `${date}T07:30:00+08:00`,
    input.calendarBasis.forecastStart,
    input.calendarBasis.forecastEnd,
  ) ?? {
    startTime: input.calendarBasis.forecastStart,
    endTime: input.calendarBasis.forecastEnd,
  };
  const stats = buildWindowStats(input, input.hourlyWeather.slice(0, 6));
  const rawFormationScore = calculateCloudSeaFormationScore(stats, terrainSupport, "morning");
  const whiteoutRiskScore = calculateWhiteoutRiskScore(stats, terrainSupport);
  const rainOpening = buildRainOpeningSignal(stats, undefined, undefined);
  const lightAlignedScore = 72;
  const rawShootableScore = calculateShootableScore(
    rawFormationScore,
    whiteoutRiskScore,
    lightAlignedScore,
    0,
    -4,
    rainOpening,
    stats,
  );
  const formationScore = applyTerrainModeFormationCap(rawFormationScore, terrainSupport);
  const shootableScore = applyTerrainModeShootableCap(
    rawShootableScore,
    formationScore,
    terrainSupport,
  );
  const missingDataNotes = buildMissingDataNotes(input, stats, false);
  const confidencePenaltyValue = confidencePenalty(input, stats, false, terrainSupport);
  const confidence = clampScore(100 - confidencePenaltyValue);

  return {
    date,
    kind: "morning",
    formationScore,
    opportunityScore: formationScore,
    shootableScore,
    whiteoutRiskScore,
    lightAlignedScore,
    confidence,
    rainOpening,
    travelScore: shootableScore,
    window: {
      label: `${candidateLabelForTerrain(
        {
          date,
          kind: "morning",
          label: "清晨云海窗口",
          sunriseKnown: false,
          lightAlignedScore,
          observation,
        },
        terrainSupport,
      )} ${formatChineseTimeRange(observation.startTime, observation.endTime)}`,
      date,
      startTime: observation.startTime,
      endTime: observation.endTime,
      score: shootableScore,
      formationScore,
      shootableScore,
      whiteoutRiskScore,
      lightAlignedScore,
      target: "cloud_sea",
      phase: "observation",
      noteZh: buildWindowNoteZh(
        formationScore,
        shootableScore,
        whiteoutRiskScore,
        rainOpening,
        terrainSupport,
        stats,
        lightAlignedScore,
      ),
      riskTag:
        whiteoutRiskScore >= 70
          ? cloudObstructionRiskTag(whiteoutRiskScore, terrainSupport)
          : "置信度较低",
      rainOpening,
    },
    stats,
    opportunityReasons: buildOpportunityReasons(
      input,
      stats,
      terrainSupport,
      formationScore,
      shootableScore,
      lightAlignedScore,
      rainOpening,
      -4,
    ),
    whiteoutReasons: buildWhiteoutReasons(stats, whiteoutRiskScore, terrainSupport),
    missingDataNotes,
    confidencePenalty: confidencePenaltyValue,
    stabilityBonus: -4,
    terrainBonus: 0,
    terrainSupport,
  };
}

function weatherInWindow(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  startTime: string,
  endTime: string,
): readonly NormalizedHourlyWeather[] {
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return [];
  }

  return hourlyWeather.filter((hour) => {
    const hourMs = Date.parse(hour.time);
    return Number.isFinite(hourMs) && hourMs >= startMs && hourMs <= endMs;
  });
}

function hoursForDate(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  date: string,
  timezone: string,
): readonly NormalizedHourlyWeather[] {
  return hourlyWeather.filter((hour) => {
    if (!Number.isFinite(Date.parse(hour.time))) {
      return false;
    }

    return formatZonedIso(hour.time, timezone || defaultTimezone).slice(0, 10) === date;
  });
}

function averageOptional(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  selector: (hour: NormalizedHourlyWeather) => number | null | undefined,
): number | undefined {
  const values = hourlyWeather
    .map((hour) => selector(hour))
    .filter((value): value is number => isFiniteNumber(value));

  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

function maxOptional(values: readonly (number | undefined)[]): number | undefined {
  const finiteValues = values.filter((value): value is number => isFiniteNumber(value));
  return finiteValues.length > 0 ? Math.max(...finiteValues) : undefined;
}

function sumOptional(values: readonly (number | undefined)[]): number | undefined {
  const finiteValues = values.filter((value): value is number => isFiniteNumber(value));
  return finiteValues.length > 0 ? finiteValues.reduce((sum, value) => sum + value, 0) : undefined;
}

function averageDirection(hourlyWeather: readonly NormalizedHourlyWeather[]): number | undefined {
  const values = hourlyWeather
    .map((hour) => hour.windDirection)
    .filter((value): value is number => isFiniteNumber(value));

  if (values.length === 0) {
    return undefined;
  }

  const radians = values.map((degree) => (degree * Math.PI) / 180);
  const sin = radians.reduce((sum, value) => sum + Math.sin(value), 0) / values.length;
  const cos = radians.reduce((sum, value) => sum + Math.cos(value), 0) / values.length;
  const degree = (Math.atan2(sin, cos) * 180) / Math.PI;

  return (degree + 360) % 360;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function terrainPotentialLabel(potential: TerrainCloudSeaPotential): string {
  if (potential === "high") {
    return "高";
  }
  if (potential === "medium") {
    return "中";
  }
  return "低";
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "暂无数据" : `${Math.round(value)}%`;
}

function formatDegree(value: number | undefined): string {
  return value === undefined ? "暂无数据" : `${Number(value.toFixed(1))}°C`;
}

function formatSpeed(value: number | undefined): string {
  return value === undefined ? "暂无数据" : `${Number(value.toFixed(1))} m/s`;
}

function formatKm(value: number | undefined): string {
  return value === undefined ? "暂无数据" : `${Number(value.toFixed(1))} km`;
}

function formatMillimeters(value: number | undefined): string {
  return value === undefined ? "暂无数据" : `${Number(value.toFixed(1))} mm`;
}

function formatMeters(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} m`
    : "暂无数据";
}

function formatWindDirection(value: number | undefined): string {
  if (value === undefined) {
    return "暂无数据";
  }

  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const index = Math.round(value / 45) % directions.length;

  return `${directions[index]}（${Math.round(value)}°）`;
}
