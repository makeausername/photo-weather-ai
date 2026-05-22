import type {
  CloudSeaAnalysisResult,
  CloudSeaAnalysisWindow,
  CloudSeaConfidenceLevel,
  CloudSeaEvidenceEffect,
  CloudSeaRecommendationLabel,
  CloudSeaTravelRecommendation,
  DailyCloudSea,
  ForecastCalculationInput,
  ForecastRecommendationLevel,
  NormalizedHourlyWeather,
  TerrainCloudSeaPotential,
} from "@photo-weather/shared";
import { defaultTimezone, formatZonedIso } from "@photo-weather/calendar";
import { addHours, averageWeightedScore, clampScore, formatChineseTimeRange } from "./helpers.js";

const lowCloudMissingNote = "当前天气源缺少低云分层数据，云海判断置信度降低。";

type CandidateWindows = {
  readonly date: string;
  readonly sunriseKnown: boolean;
  readonly accumulation?: Pick<CloudSeaAnalysisWindow, "startTime" | "endTime">;
  readonly observation: Pick<CloudSeaAnalysisWindow, "startTime" | "endTime">;
  readonly dissipation?: Pick<CloudSeaAnalysisWindow, "startTime" | "endTime">;
};

type WindowStats = {
  readonly temperature?: number;
  readonly humidity?: number;
  readonly dewPointSpread?: number;
  readonly windSpeed?: number;
  readonly windGust?: number;
  readonly windDirection?: number;
  readonly visibility?: number;
  readonly precipitationProbability?: number;
  readonly precipitation?: number;
  readonly cloudTotal?: number;
  readonly cloudLow?: number;
  readonly pressure?: number;
  readonly hasLowCloud: boolean;
  readonly lowCloudEstimated: boolean;
  readonly missingFields: readonly string[];
  readonly estimatedFields: readonly string[];
};

type WindowEvaluation = {
  readonly opportunityScore: number;
  readonly whiteoutRiskScore: number;
  readonly travelScore: number;
  readonly window: CloudSeaAnalysisWindow;
  readonly stats: WindowStats;
  readonly opportunityReasons: readonly string[];
  readonly whiteoutReasons: readonly string[];
  readonly missingDataNotes: readonly string[];
  readonly confidencePenalty: number;
  readonly stabilityBonus: number;
  readonly terrainBonus: number;
};

export function analyzeCloudSea(input: ForecastCalculationInput): CloudSeaAnalysisResult {
  const evaluations = input.calendarBasis.targetDates
    .map((date) => evaluateCloudSeaDate(input, date))
    .filter((evaluation): evaluation is WindowEvaluation => evaluation !== undefined);

  const fallbackEvaluation = evaluations[0] ?? buildFallbackEvaluation(input);
  const bestEvaluation =
    [...evaluations].sort((left, right) => {
      if (right.travelScore !== left.travelScore) {
        return right.travelScore - left.travelScore;
      }

      return Date.parse(left.window.startTime) - Date.parse(right.window.startTime);
    })[0] ?? fallbackEvaluation;

  const dailyCloudSea = evaluations.map((evaluation) => buildDailyCloudSea(input, evaluation));
  const bestCloudSeaWindows = evaluations
    .map((evaluation) => evaluation.window)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Date.parse(left.startTime) - Date.parse(right.startTime);
    });
  const missingDataNotes = uniqueStrings(
    evaluations.flatMap((evaluation) => evaluation.missingDataNotes),
  );
  const confidenceLevel = classifyCloudSeaConfidence(input, evaluations, missingDataNotes);

  return {
    overallScore: bestEvaluation.travelScore,
    cloudSeaOpportunityScore: bestEvaluation.opportunityScore,
    whiteoutRiskScore: bestEvaluation.whiteoutRiskScore,
    travelScore: bestEvaluation.travelScore,
    recommendationLabel: cloudSeaRecommendationLabel(bestEvaluation.travelScore),
    confidenceLevel,
    bestCloudSeaWindows,
    dailyCloudSea,
    weatherEvidence: buildWeatherEvidence(bestEvaluation.stats),
    terrainEvidence: buildTerrainEvidence(input),
    whiteoutReasons: bestEvaluation.whiteoutReasons,
    opportunityReasons: bestEvaluation.opportunityReasons,
    travelRecommendations: buildTravelRecommendations(bestEvaluation.travelScore),
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

function evaluateCloudSeaDate(
  input: ForecastCalculationInput,
  date: string,
): WindowEvaluation | undefined {
  const candidate = buildCandidateWindows(input, date);
  if (!candidate) {
    return undefined;
  }

  const observationHours = weatherInWindow(
    input.hourlyWeather,
    candidate.observation.startTime,
    candidate.observation.endTime,
  );
  const fallbackHours = hoursForDate(input.hourlyWeather, date, input.calendarBasis.timezone);
  const weatherWindow = observationHours.length > 0 ? observationHours : fallbackHours;
  if (weatherWindow.length === 0) {
    return undefined;
  }

  const stats = buildWindowStats(input, weatherWindow);
  const accumulationStats = candidate.accumulation
    ? buildWindowStats(
        input,
        weatherInWindow(input.hourlyWeather, candidate.accumulation.startTime, candidate.accumulation.endTime),
      )
    : undefined;
  const dissipationStats = candidate.dissipation
    ? buildWindowStats(
        input,
        weatherInWindow(input.hourlyWeather, candidate.dissipation.startTime, candidate.dissipation.endTime),
      )
    : undefined;
  const terrainScore = terrainOpportunityScore(
    input.terrainAnalysis.terrainProfile.elevationDiff5km,
    input.terrainAnalysis.terrainProfile.terrainCloudSeaPotential,
  );
  const opportunityScore = calculateCloudSeaOpportunityScore(stats, terrainScore);
  const whiteoutRiskScore = calculateWhiteoutRiskScore(stats);
  const terrainBonus = terrainTravelBonus(
    input.terrainAnalysis.terrainProfile.elevationDiff5km,
    input.terrainAnalysis.terrainProfile.terrainCloudSeaPotential,
  );
  const stabilityBonus = windowStabilityBonus(
    stats,
    accumulationStats,
    dissipationStats,
    terrainScore,
  );
  const travelScore = calculateTravelScore(
    opportunityScore,
    whiteoutRiskScore,
    terrainBonus,
    stabilityBonus,
  );
  const missingDataNotes = buildMissingDataNotes(input, stats, candidate.sunriseKnown);
  const riskTag = whiteoutRiskScore >= 70 ? "白墙风险高" : whiteoutRiskScore >= 45 ? "白墙风险中" : "白墙风险低";
  const noteZh =
    travelScore >= 65
      ? "清晨云海信号可等待，现场重点复核云雾上沿和能见度。"
      : "云海信号仍不稳定，建议同时准备通透层峦或雾景备选。";

  return {
    opportunityScore,
    whiteoutRiskScore,
    travelScore,
    window: {
      label: `清晨云海窗口 ${formatChineseTimeRange(
        candidate.observation.startTime,
        candidate.observation.endTime,
      )}`,
      date,
      startTime: candidate.observation.startTime,
      endTime: candidate.observation.endTime,
      score: travelScore,
      target: "cloud_sea",
      phase: "observation",
      noteZh,
      riskTag,
    },
    stats,
    opportunityReasons: buildOpportunityReasons(input, stats, terrainScore, stabilityBonus),
    whiteoutReasons: buildWhiteoutReasons(stats, whiteoutRiskScore),
    missingDataNotes,
    confidencePenalty: confidencePenalty(input, stats, candidate.sunriseKnown),
    stabilityBonus,
    terrainBonus,
  };
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
    { score: humidityDewPointScore, weight: 0.25 },
    { score: lowCloudScore, weight: 0.2 },
    { score: terrainScore, weight: 0.2 },
    { score: windScore, weight: 0.15 },
    { score: visibilityScore, weight: 0.1 },
    { score: precipitationScore, weight: 0.1 },
  ]);
}

function calculateWhiteoutRiskScore(stats: WindowStats): number {
  const lowCloudRisk = lowCloudWhiteoutRiskScore(stats);
  const humidityRisk = humidityWhiteoutRiskScore(stats.humidity);
  const visibilityRisk = visibilityWhiteoutRiskScore(stats.visibility);
  const windRisk = windWhiteoutRiskScore(stats.windSpeed);
  const cloudTotalRisk = cloudTotalWhiteoutRiskScore(stats.cloudTotal);
  const precipitationRisk = precipitationRiskScore(stats);

  return averageWeightedScore([
    { score: lowCloudRisk, weight: 0.26 },
    { score: humidityRisk, weight: 0.22 },
    { score: visibilityRisk, weight: 0.25 },
    { score: windRisk, weight: 0.12 },
    { score: cloudTotalRisk, weight: 0.1 },
    { score: precipitationRisk, weight: 0.05 },
  ]);
}

function calculateTravelScore(
  opportunityScore: number,
  whiteoutRiskScore: number,
  terrainBonus: number,
  stabilityBonus: number,
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

  return clampScore(opportunityScore - whiteoutPenalty + terrainBonus + stabilityBonus);
}

function buildCandidateWindows(
  input: ForecastCalculationInput,
  date: string,
): CandidateWindows | undefined {
  const forecastStart = input.calendarBasis.forecastStart;
  const forecastEnd = input.calendarBasis.forecastEnd;
  const sunrise = input.astroSummaries.find((summary) => summary.date === date)?.sunrise;
  const sunriseKnown = Boolean(sunrise);
  const observationStart = sunrise ? addHours(sunrise, -1) : `${date}T04:30:00+08:00`;
  const observationEnd = sunrise ? addHours(sunrise, 1) : `${date}T07:30:00+08:00`;
  const observation = clipWindow(observationStart, observationEnd, forecastStart, forecastEnd);

  if (!observation) {
    return undefined;
  }

  return {
    date,
    sunriseKnown,
    accumulation: sunrise
      ? clipWindow(addHours(sunrise, -3), addHours(sunrise, -1), forecastStart, forecastEnd)
      : clipWindow(`${date}T04:30:00+08:00`, `${date}T05:30:00+08:00`, forecastStart, forecastEnd),
    observation,
    dissipation: sunrise
      ? clipWindow(addHours(sunrise, 1), addHours(sunrise, 2), forecastStart, forecastEnd)
      : clipWindow(`${date}T07:00:00+08:00`, `${date}T07:30:00+08:00`, forecastStart, forecastEnd),
  };
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
    humidity: averageOptional(weatherWindow, (hour) => hour.humidity),
    dewPointSpread: averageOptional(weatherWindow, (hour) =>
      typeof hour.dewPoint === "number" ? hour.temperature - hour.dewPoint : undefined,
    ),
    windSpeed: averageOptional(weatherWindow, (hour) => hour.windSpeed),
    windGust: averageOptional(weatherWindow, (hour) => hour.windGust),
    windDirection: averageDirection(weatherWindow),
    visibility: averageOptional(weatherWindow, (hour) => hour.visibility),
    precipitationProbability: averageOptional(weatherWindow, (hour) => hour.precipitationProbability),
    precipitation: averageOptional(weatherWindow, (hour) => hour.precipitation),
    cloudTotal: averageOptional(weatherWindow, (hour) => hour.cloudTotal),
    cloudLow: averageOptional(weatherWindow, (hour) => hour.cloudLow),
    pressure: averageOptional(weatherWindow, (hour) => hour.pressure),
    hasLowCloud,
    lowCloudEstimated,
    missingFields,
    estimatedFields,
  };
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
    return stats.lowCloudEstimated && stats.cloudTotal !== undefined
      ? clampScore(42 + Math.min(stats.cloudTotal, 80) * 0.35)
      : 45;
  }
  if (lowCloud >= 30 && lowCloud <= 75) {
    return 90;
  }
  if (lowCloud > 75 && lowCloud <= 90) {
    return clampScore(92 - (lowCloud - 75) * 2);
  }
  if (lowCloud > 90) {
    return 42;
  }
  return clampScore(24 + lowCloud * 1.6);
}

function windOpportunityScore(windSpeed: number | undefined): number {
  if (windSpeed === undefined) {
    return 55;
  }
  if (windSpeed < 0.5) {
    return 66;
  }
  if (windSpeed <= 4) {
    return 92;
  }
  if (windSpeed <= 7) {
    return 74;
  }
  if (windSpeed <= 10) {
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
  const probability = stats.precipitationProbability ?? 0;
  const precipitation = stats.precipitation ?? 0;

  if (probability >= 70 || precipitation >= 2) {
    return 20;
  }
  if (probability >= 45 || precipitation >= 0.8) {
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

function terrainOpportunityScore(
  elevationDiff5km: number,
  potential: TerrainCloudSeaPotential,
): number {
  const diffScore =
    elevationDiff5km >= 1000
      ? 95
      : elevationDiff5km >= 600
        ? 82
        : elevationDiff5km >= 300
          ? 58
          : 28;
  const potentialAdjustment = potential === "high" ? 8 : potential === "medium" ? 0 : -14;

  return clampScore(diffScore + potentialAdjustment);
}

function lowCloudWhiteoutRiskScore(stats: WindowStats): number {
  const lowCloud = stats.cloudLow;
  if (lowCloud === undefined) {
    const proxy = stats.cloudTotal === undefined ? 45 : clampScore(stats.cloudTotal * 0.55);
    return stats.lowCloudEstimated ? proxy : clampScore(proxy - 8);
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
  const probability = stats.precipitationProbability ?? 0;
  const precipitation = stats.precipitation ?? 0;

  return clampScore(Math.max(probability, precipitation * 45));
}

function terrainTravelBonus(
  elevationDiff5km: number,
  potential: TerrainCloudSeaPotential,
): number {
  const diffBonus = elevationDiff5km >= 1000 ? 6 : elevationDiff5km >= 600 ? 3 : elevationDiff5km < 300 ? -8 : 0;
  const potentialBonus = potential === "high" ? 4 : potential === "medium" ? 0 : -6;

  return diffBonus + potentialBonus;
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

function buildMissingDataNotes(
  input: ForecastCalculationInput,
  stats: WindowStats,
  sunriseKnown: boolean,
): readonly string[] {
  const notes: string[] = [];

  if (!stats.hasLowCloud || stats.missingFields.includes("cloudLow")) {
    notes.push(lowCloudMissingNote);
  }
  if (stats.dewPointSpread === undefined || stats.missingFields.includes("dewPoint")) {
    notes.push("当前天气源缺少露点数据，湿度与凝结条件判断置信度降低。");
  }
  if (stats.visibility === undefined || stats.missingFields.includes("visibility")) {
    notes.push("当前天气源缺少能见度数据，白墙风险和通透度判断置信度降低。");
  }
  if (!Number.isFinite(input.terrainAnalysis.terrainProfile.elevationDiff5km)) {
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
): number {
  let penalty = 0;

  if (!stats.hasLowCloud || stats.missingFields.includes("cloudLow")) {
    penalty += 25;
  }
  if (stats.dewPointSpread === undefined || stats.missingFields.includes("dewPoint")) {
    penalty += 15;
  }
  if (stats.visibility === undefined || stats.missingFields.includes("visibility")) {
    penalty += 15;
  }
  if (!Number.isFinite(input.terrainAnalysis.terrainProfile.elevationDiff5km)) {
    penalty += 18;
  }
  if (input.weatherDataMode === "mock") {
    penalty += 15;
  } else if (input.weatherDataMode === "fixture") {
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

function buildDailyCloudSea(input: ForecastCalculationInput, evaluation: WindowEvaluation): DailyCloudSea {
  const dateLabelZh =
    input.calendarBasis.calendarDays.find((day) => day.date === evaluation.window.date)?.dateLabel ??
    input.calendarBasis.targetDateLabels[
      input.calendarBasis.targetDates.indexOf(evaluation.window.date ?? "")
    ] ??
    evaluation.window.date ??
    evaluation.window.startTime.slice(0, 10);

  return {
    date: evaluation.window.date ?? evaluation.window.startTime.slice(0, 10),
    dateLabelZh,
    opportunityScore: evaluation.opportunityScore,
    whiteoutRiskScore: evaluation.whiteoutRiskScore,
    travelScore: evaluation.travelScore,
    bestWindow: evaluation.window,
    recommendationLabel: cloudSeaRecommendationLabel(evaluation.travelScore),
    keyReason: evaluation.opportunityReasons[0] ?? "清晨云海信号已按湿度、低云、风速、能见度和地形综合判断。",
    riskNote: evaluation.whiteoutReasons[0] ?? "暂未发现高等级白墙风险，仍需现场复核低云高度。",
  };
}

function buildOpportunityReasons(
  input: ForecastCalculationInput,
  stats: WindowStats,
  terrainScore: number,
  stabilityBonus: number,
): readonly string[] {
  const terrain = input.terrainAnalysis.terrainProfile;
  const reasons = [
    `清晨湿度约 ${formatPercent(stats.humidity)}，露点差约 ${formatDegree(stats.dewPointSpread)}，用于判断水汽是否接近凝结。`,
    stats.hasLowCloud
      ? `低云约 ${formatPercent(stats.cloudLow)}，适中低云更有利于山谷云雾形成。`
      : lowCloudMissingNote,
    `5km 高差约 ${formatMeters(terrain.elevationDiff5km)}，地形云海潜力为${terrainPotentialLabel(
      terrain.terrainCloudSeaPotential,
    )}。`,
    `风速约 ${formatSpeed(stats.windSpeed)}，过弱易包顶，过强会吹散云雾层。`,
    `能见度约 ${formatKm(stats.visibility)}，用于区分可俯拍云海与白墙。`,
  ];

  if (stabilityBonus > 0) {
    reasons.push("夜间积累与日出后消散风险组合较稳定，清晨等待价值上调。");
  }
  if (terrainScore >= 82) {
    reasons.push("机位与周边谷地落差明显，有利于站在云雾层上方观察。");
  }

  return reasons;
}

function buildWhiteoutReasons(
  stats: WindowStats,
  whiteoutRiskScore: number,
): readonly string[] {
  const reasons = [
    stats.hasLowCloud
      ? `低云约 ${formatPercent(stats.cloudLow)}，低云过厚或抬升到机位高度时会增加白墙风险。`
      : "低云分层缺失，当前只能用湿度、能见度和总云量弱判断白墙风险。",
    `湿度约 ${formatPercent(stats.humidity)}，能见度约 ${formatKm(stats.visibility)}。`,
    `风速约 ${formatSpeed(stats.windSpeed)}，近静风更容易让雾包住机位。`,
  ];

  if (whiteoutRiskScore >= 70) {
    reasons.unshift("白墙风险偏高，机位可能被低云或雾包裹，远山层次和云海边界会明显下降。");
  } else if (whiteoutRiskScore >= 45) {
    reasons.unshift("白墙风险中等，需要现场观察云雾上沿是否低于机位。");
  } else {
    reasons.unshift("白墙风险较低，仍需在日出前后复核能见度。");
  }

  return reasons;
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
      effect: (stats.precipitationProbability ?? 0) >= 45 || (stats.precipitation ?? 0) >= 0.8 ? "negative" : "neutral",
      noteZh: "轻微前期降水在高湿条件下可能补充水汽，观测窗口内强降水会降低拍摄和通行价值。",
    },
    {
      label: "低云",
      value: stats.hasLowCloud ? formatPercent(stats.cloudLow) : "分层缺失",
      effect:
        !stats.hasLowCloud || stats.cloudLow === undefined
          ? "risk"
          : stats.cloudLow > 80
            ? "risk"
            : stats.cloudLow >= 30
              ? "positive"
              : "neutral",
      noteZh: stats.hasLowCloud
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

function buildTerrainEvidence(input: ForecastCalculationInput): CloudSeaAnalysisResult["terrainEvidence"] {
  const terrain = input.terrainAnalysis.terrainProfile;
  const potential = terrain.terrainCloudSeaPotential;
  const diffEffect: CloudSeaEvidenceEffect =
    terrain.elevationDiff5km >= 600 ? "positive" : terrain.elevationDiff5km >= 300 ? "neutral" : "negative";

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

function buildTravelRecommendations(travelScore: number): readonly CloudSeaTravelRecommendation[] {
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
  const terrainScore = terrainOpportunityScore(
    input.terrainAnalysis.terrainProfile.elevationDiff5km,
    input.terrainAnalysis.terrainProfile.terrainCloudSeaPotential,
  );
  const opportunityScore = calculateCloudSeaOpportunityScore(stats, terrainScore);
  const whiteoutRiskScore = calculateWhiteoutRiskScore(stats);
  const travelScore = calculateTravelScore(opportunityScore, whiteoutRiskScore, 0, -4);
  const missingDataNotes = buildMissingDataNotes(input, stats, false);

  return {
    opportunityScore,
    whiteoutRiskScore,
    travelScore,
    window: {
      label: `清晨云海窗口 ${formatChineseTimeRange(observation.startTime, observation.endTime)}`,
      date,
      startTime: observation.startTime,
      endTime: observation.endTime,
      score: travelScore,
      target: "cloud_sea",
      phase: "observation",
      noteZh: "缺少完整清晨候选窗口，当前结果仅作低置信度参考。",
      riskTag: whiteoutRiskScore >= 70 ? "白墙风险高" : "置信度较低",
    },
    stats,
    opportunityReasons: buildOpportunityReasons(input, stats, terrainScore, -4),
    whiteoutReasons: buildWhiteoutReasons(stats, whiteoutRiskScore),
    missingDataNotes,
    confidencePenalty: confidencePenalty(input, stats, false),
    stabilityBonus: -4,
    terrainBonus: 0,
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

  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function averageDirection(
  hourlyWeather: readonly NormalizedHourlyWeather[],
): number | undefined {
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

function formatMeters(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)} m` : "暂无数据";
}

function formatWindDirection(value: number | undefined): string {
  if (value === undefined) {
    return "暂无数据";
  }

  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const index = Math.round(value / 45) % directions.length;

  return `${directions[index]}（${Math.round(value)}°）`;
}
