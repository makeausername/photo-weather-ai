import type {
  AstroSummary,
  CloudSeaEvidenceEffect,
  ForecastCalculationInput,
  ForecastScore,
  GlowAerosolAssessment,
  GlowAnalysisResult,
  GlowAssessmentLabels,
  GlowBackupPlan,
  GlowEvidenceItem,
  GlowPostRainOpeningChance,
  GlowRecommendationLabel,
  GlowTerrainObstructionAssessment,
  GlowWindow,
  GlowWindowRainRisk,
  GlowWindowType,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import { addHoursInTimezone } from "@photo-weather/calendar";
import { averageHourly, averageWeightedScore, clampScore } from "./helpers.js";

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
  readonly lowCloudPassScore: number;
  readonly lowCloudRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly precipitationPassScore: number;
  readonly precipitationDisruptionRisk: number;
  readonly terrain: number;
  readonly windHumidity: number;
  readonly conditionScore: number;
  readonly practicalScore: number;
  readonly rainOverlapsWindow: boolean;
  readonly postRainOpeningChance: GlowPostRainOpeningChance;
  readonly glowWindowRainRisk: GlowWindowRainRisk;
};

const oneHourMs = 60 * 60 * 1000;
const missingSunTimesNote = "缺少日出日落时间，无法生成精确霞光窗口。";
const missingTerrainNote = "暂缺地形遮挡细节，正式地形数据接入后将提升判断精度。";

export function calculateGlowAnalysis(input: ForecastCalculationInput): GlowAnalysisResult {
  const candidates = buildGlowCandidates(input).map((candidate) => {
    const components = calculateGlowComponents(input, candidate);
    const score = components.practicalScore;
    return {
      ...candidate,
      score,
      conditionScore: components.conditionScore,
      practicalScore: components.practicalScore,
      colorCarrierScore: components.colorCarrierScore,
      lowCloudObstructionRisk: components.lowCloudRisk,
      precipitationDisruptionRisk: components.precipitationDisruptionRisk,
      visibilityColorQualityScore: components.visibilityColorQualityScore,
      aerosolScore: components.aerosolScore,
      terrainScore: components.terrain,
      rainOverlapsWindow: components.rainOverlapsWindow,
      postRainOpeningChance: components.postRainOpeningChance,
      glowWindowRainRisk: components.glowWindowRainRisk,
      riskTags: buildGlowWindowRiskTags(input, candidate.weatherWindow, candidate.phase, components),
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
        (window.precipitationDisruptionRisk ?? 0) >= 70,
    )
    .sort((left, right) => {
      if (right.conditionScore !== left.conditionScore) {
        return (right.conditionScore ?? right.score) - (left.conditionScore ?? left.score);
      }
      return Date.parse(left.start) - Date.parse(right.start);
    });
  const sunriseGlowScore = phaseScore(candidates, "sunrise");
  const sunsetGlowScore = phaseScore(candidates, "sunset");
  const lowCloudObstructionRisk = calculateLowCloudObstructionRisk(input, candidates);
  const colorCarrierScore = maxCandidateScore(candidates, (candidate) => candidate.colorCarrierScore, () =>
    scoreColorCarrier(candidateWeatherOrAll(input, candidates)),
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
    sunriseGlowScore,
    sunsetGlowScore,
    lowCloudObstructionRisk,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    input,
  );
  const glowTravelScore =
    bestGlowWindows.length > 0
      ? rawGlowTravelScore
      : Math.min(rawGlowTravelScore, watchableGlowWindows.length > 0 ? 54 : 38);
  const missingDataNotes = buildGlowMissingDataNotes(input);
  const confidence = calculateGlowConfidenceScore(input, missingDataNotes);
  const labels = buildGlowLabels(
    sunriseGlowScore,
    sunsetGlowScore,
    lowCloudObstructionRisk,
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
    colorCarrierScore,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    practicalGlowScore: glowTravelScore,
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
    dailyGlow: buildDailyGlow(input, candidates),
    cloudLayerEvidence: buildCloudLayerEvidence(input, candidates),
    visibilityEvidence: buildVisibilityEvidence(input, candidates),
    aerosolAssessment,
    aerosolEvidence: buildAerosolEvidence(aerosolAssessment),
    terrainObstructionAssessments,
    terrainObstructionEvidence: buildTerrainEvidence(input),
    riskReasons: buildGlowRiskReasons(input, candidates, lowCloudObstructionRisk),
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
    .filter((reason) => reason.includes(phaseKeyword) || !reason.includes("朝霞") && !reason.includes("晚霞"))
    .slice(0, 3);

  return {
    key: phase === "sunrise" ? "sunriseGlow" : "sunsetGlow",
    label,
    score,
    level: score >= 80 ? "excellent" : score >= 65 ? "good" : score >= 45 ? "fair" : "poor",
    reasons:
      reasons.length > 0
        ? reasons
        : [`${label}评分综合了中高云、低云遮挡、通透度、降水、风湿稳定性和地形遮挡。`],
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
  if (!astro.sunrise) {
    return [];
  }

  return [
    buildCandidate(input, forecastRange, {
      phase: "sunrise",
      type: "pre_dawn_glow",
      labelZh: "朝霞预备窗口",
      date: astro.date,
      start: astro.civilDawn ?? shiftAstroTime(astro, astro.sunrise, -0.75),
      end: astro.sunrise,
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunrise",
      type: "sunrise_core",
      labelZh: "朝霞核心窗口",
      date: astro.date,
      start: shiftAstroTime(astro, astro.sunrise, -25 / 60),
      end: shiftAstroTime(astro, astro.sunrise, 25 / 60),
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunrise",
      type: "morning_warm_light",
      labelZh: "日出暖光窗口",
      date: astro.date,
      start: astro.sunrise,
      end: shiftAstroTime(astro, astro.sunrise, 75 / 60),
    }),
  ].filter((candidate): candidate is GlowCandidate => candidate !== null);
}

function buildSunsetCandidates(
  input: ForecastCalculationInput,
  astro: AstroSummary,
  forecastRange: ForecastTimeRange,
): readonly GlowCandidate[] {
  if (!astro.sunset) {
    return [];
  }

  return [
    buildCandidate(input, forecastRange, {
      phase: "sunset",
      type: "sunset_warm_light",
      labelZh: "日落前暖光窗口",
      date: astro.date,
      start: shiftAstroTime(astro, astro.sunset, -75 / 60),
      end: astro.sunset,
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunset",
      type: "sunset_core",
      labelZh: "晚霞核心窗口",
      date: astro.date,
      start: shiftAstroTime(astro, astro.sunset, -25 / 60),
      end: shiftAstroTime(astro, astro.sunset, 25 / 60),
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunset",
      type: "afterglow",
      labelZh: "霞光余晖窗口",
      date: astro.date,
      start: astro.sunset,
      end: astro.civilDusk ?? shiftAstroTime(astro, astro.sunset, 0.75),
    }),
    ...(astro.civilDusk
      ? [
          buildCandidate(input, forecastRange, {
            phase: "sunset",
            type: "blue_hour_transition",
            labelZh: "蓝调转场窗口",
            date: astro.date,
            start: astro.civilDusk,
            end: astro.nauticalDusk ?? shiftAstroTime(astro, astro.civilDusk, 0.5),
          }),
        ]
      : []),
  ].filter((candidate): candidate is GlowCandidate => candidate !== null);
}

function shiftAstroTime(astro: AstroSummary, time: string, hours: number): string {
  return addHoursInTimezone(time, hours, astro.timezone);
}

function shiftForecastTime(input: ForecastCalculationInput, time: string, hours: number): string {
  return addHoursInTimezone(time, hours, input.calendarBasis.timezone);
}

function toPublicGlowWindow(candidate: GlowCandidate): GlowWindow {
  const { phase: _phase, weatherWindow: _weatherWindow, ...window } = candidate;
  return window;
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
  const lowCloudRisk = scoreLowCloudObstructionRisk(input, window, phase);
  const precipitationDisruptionRisk = calculatePrecipitationDisruptionRisk(window);
  const precipitationPassScore = 100 - precipitationDisruptionRisk;
  const visibilityColorQualityScore = scoreVisibilityColorQuality(window);
  const aerosolScore = scoreAerosolAtmosphere(window);
  const terrain = scoreTerrainObstruction(input, phase);
  const windHumidity = scoreWindHumidity(window);
  const conditionScore = scoreGlowCondition({
    colorCarrierScore,
    lowCloudRisk,
    visibilityColorQualityScore,
    aerosolScore,
    precipitationPassScore,
    terrain,
    windHumidity,
  });
  const rainOverlapsWindow = hasActivePrecipitation(window);
  const postRainOpeningChance = calculatePostRainOpeningChance(input, candidate);
  const glowWindowRainRisk = glowRainRiskLevel(precipitationDisruptionRisk);
  const practicalScore = scorePracticalGlowWindow({
    conditionScore,
    colorCarrierScore,
    lowCloudRisk,
    precipitationDisruptionRisk,
    visibilityColorQualityScore,
    aerosolScore,
    terrain,
    windHumidity,
    rainOverlapsWindow,
    postRainOpeningChance,
    type: candidate.type,
  });

  return {
    colorCarrierScore,
    lowCloudRisk,
    lowCloudPassScore: 100 - lowCloudRisk,
    visibilityColorQualityScore,
    aerosolScore,
    precipitationPassScore,
    precipitationDisruptionRisk,
    terrain,
    windHumidity,
    conditionScore,
    practicalScore,
    rainOverlapsWindow,
    postRainOpeningChance,
    glowWindowRainRisk,
  };
}

function scoreGlowCondition(components: {
  readonly colorCarrierScore: number;
  readonly lowCloudRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly precipitationPassScore: number;
  readonly terrain: number;
  readonly windHumidity: number;
}): number {
  const weightedScores = [
    { score: components.colorCarrierScore, weight: 0.38 },
    { score: 100 - components.lowCloudRisk, weight: 0.2 },
    { score: components.visibilityColorQualityScore, weight: 0.17 },
    { score: components.precipitationPassScore, weight: 0.12 },
    { score: components.terrain, weight: 0.1 },
    { score: components.windHumidity, weight: 0.03 },
  ];
  if (typeof components.aerosolScore === "number") {
    weightedScores.push({ score: components.aerosolScore, weight: 0.08 });
  }

  return averageWeightedScore(weightedScores);
}

function scorePracticalGlowWindow(input: {
  readonly conditionScore: number;
  readonly colorCarrierScore: number;
  readonly lowCloudRisk: number;
  readonly precipitationDisruptionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly aerosolScore?: number;
  readonly terrain: number;
  readonly windHumidity: number;
  readonly rainOverlapsWindow: boolean;
  readonly postRainOpeningChance: GlowPostRainOpeningChance;
  readonly type: GlowWindowType;
}): number {
  const lowCloudPenalty =
    input.lowCloudRisk >= 90 ? 34 : input.lowCloudRisk >= 78 ? 24 : input.lowCloudRisk >= 65 ? 12 : 0;
  const rainPenalty =
    input.precipitationDisruptionRisk >= 85
      ? 30
      : input.precipitationDisruptionRisk >= 70
        ? 24
        : input.precipitationDisruptionRisk >= 50
          ? 14
          : 0;
  const activeRainPenalty = input.rainOverlapsWindow ? 16 : 0;
  const visibilityPenalty =
    input.visibilityColorQualityScore < 35 ? 20 : input.visibilityColorQualityScore < 52 ? 11 : 0;
  const aerosolPenalty =
    input.aerosolScore === undefined
      ? 0
      : input.aerosolScore < 35
        ? 18
        : input.aerosolScore < 50
          ? 10
          : 0;
  const aerosolBonus = input.aerosolScore !== undefined && input.aerosolScore >= 80 ? 3 : 0;
  const carrierPenalty = input.colorCarrierScore < 35 ? 22 : input.colorCarrierScore < 55 ? 12 : 0;
  const terrainPenalty = input.terrain < 45 ? 14 : input.terrain < 58 ? 7 : 0;
  const rainOpeningBonus =
    input.postRainOpeningChance === "high" ? 7 : input.postRainOpeningChance === "medium" ? 4 : 0;
  const blueHourPenalty = input.type === "blue_hour_transition" ? 12 : 0;
  const warmLightBonus =
    input.type === "morning_warm_light" || input.type === "sunset_warm_light" ? 2 : 0;

  return clampScore(
    input.conditionScore +
      rainOpeningBonus +
      aerosolBonus +
      warmLightBonus -
      lowCloudPenalty -
      rainPenalty -
      visibilityPenalty -
      aerosolPenalty -
      carrierPenalty -
      terrainPenalty -
      blueHourPenalty -
      activeRainPenalty,
  );
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

function scoreLowCloudObstructionRisk(
  input: ForecastCalculationInput,
  window: readonly NormalizedHourlyWeather[],
  phase: GlowPhase,
): number {
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
  const horizonAngle = horizonAngleForPhase(input, phase);
  const horizonRisk =
    typeof horizonAngle === "number" ? Math.max(0, horizonAngle - 7) * 2.2 : 5;
  const directionRisk = hasBlockedDirection(input, phase) ? 16 : 0;
  const totalCloudRisk = cloudTotal > 90 && (lowCloud ?? 0) > 55 ? 10 : 0;
  const fogRisk = (visibility ?? 99) < 5 && humidity >= 92 ? 12 : fogOrMist ? 10 : 0;

  return clampScore(baseRisk + horizonRisk + directionRisk + totalCloudRisk + fogRisk);
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

  return clampScore(aodScore - pm25Penalty - pm10Penalty - dustPenalty - hazePenalty - missingAodPenalty);
}

function calculatePrecipitationDisruptionRisk(window: readonly NormalizedHourlyWeather[]): number {
  const precipitationProbability = averageDefined(window, (hour) => hour.precipitationProbability) ?? 0;
  const precipitation = averageDefined(window, (hour) => precipitationAmount(hour)) ?? 0;
  const activeRainText = window.some((hour) => /(雨|雪|阵雨|rain|snow|shower)/i.test(hour.weatherTextZh ?? ""));
  const riskLevel = strongestPrecipitationRisk(window);
  const amountRisk =
    precipitation >= 5 ? 82 : precipitation >= 2 ? 68 : precipitation >= 0.5 ? 48 : precipitation > 0.1 ? 28 : 0;
  const probabilityRisk = precipitationProbability >= 75 ? 70 : precipitationProbability >= 55 ? 52 : precipitationProbability >= 35 ? 28 : 0;
  const textRisk = activeRainText ? 18 : 0;
  const providerRisk = riskLevel === "high" ? 75 : riskLevel === "medium" ? 55 : riskLevel === "low" ? 30 : 0;

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

function strongestPrecipitationRisk(window: readonly NormalizedHourlyWeather[]): "low" | "medium" | "high" | undefined {
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
  const directionPenalty = hasBlockedDirection(input, phase) ? 24 : 0;
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

function phaseScore(candidates: readonly GlowCandidate[], phase: GlowPhase): number {
  const phaseCandidates = candidates.filter((candidate) => candidate.phase === phase);
  if (phaseCandidates.length === 0) {
    return 0;
  }
  const sorted = [...phaseCandidates].sort((left, right) => right.score - left.score);
  const best = sorted[0]?.score ?? 0;
  const second = sorted[1]?.score ?? best;
  const coreRainPenalty = phaseCandidates.some(
    (candidate) =>
      (candidate.type === "sunrise_core" || candidate.type === "sunset_core") &&
      candidate.rainOverlapsWindow &&
      (candidate.precipitationDisruptionRisk ?? 0) >= 45,
  )
    ? 12
    : 0;
  return clampScore(best * 0.75 + second * 0.25 - coreRainPenalty);
}

function calculateLowCloudObstructionRisk(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): number {
  if (candidates.length === 0) {
    return 0;
  }

  const maxRisk = Math.max(
    ...candidates.map((candidate) =>
      scoreLowCloudObstructionRisk(input, candidate.weatherWindow, candidate.phase),
    ),
  );
  return clampScore(maxRisk);
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
  const precipitationRisk = window.precipitationDisruptionRisk ?? 100;
  const visibilityScore = window.visibilityColorQualityScore ?? 0;
  const aerosolScore = window.aerosolScore ?? 65;
  const terrainScore = window.terrainScore ?? 50;

  return (
    window.score >= 60 &&
    colorCarrierScore >= 55 &&
    lowCloudRisk < 76 &&
    precipitationRisk < 58 &&
    visibilityScore >= 52 &&
    aerosolScore >= 38 &&
    terrainScore >= 45 &&
    !window.rainOverlapsWindow
  );
}

function strongestPostRainOpening(
  candidates: readonly GlowCandidate[],
): GlowPostRainOpeningChance {
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

function calculateGlowTravelScore(
  sunriseGlowScore: number,
  sunsetGlowScore: number,
  lowCloudObstructionRisk: number,
  precipitationDisruptionRisk: number,
  visibilityColorQualityScore: number,
  input: ForecastCalculationInput,
): number {
  const bestGlow = Math.max(sunriseGlowScore, sunsetGlowScore);
  const secondGlow = Math.min(sunriseGlowScore, sunsetGlowScore);
  const visibilityScore = Math.max(visibilityColorQualityScore, scoreVisibilityColorQuality(input.hourlyWeather));
  const rainPenalty =
    precipitationDisruptionRisk >= 78 ? 16 : precipitationDisruptionRisk >= 58 ? 8 : 0;
  const lowCloudPenalty = lowCloudObstructionRisk >= 82 ? 12 : lowCloudObstructionRisk >= 70 ? 6 : 0;

  return clampScore(
    bestGlow * 0.58 +
      secondGlow * 0.14 +
      visibilityScore * 0.14 +
      (100 - lowCloudObstructionRisk) * 0.08 +
      (100 - precipitationDisruptionRisk) * 0.06 -
      rainPenalty -
      lowCloudPenalty,
  );
}

function buildDailyGlow(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly GlowAnalysisResult["dailyGlow"][number][] {
  return input.calendarBasis.targetDates.map((date, index) => {
    const dayWindows = candidates.filter((candidate) => candidate.date === date);
    const sunriseScore = phaseScore(dayWindows, "sunrise");
    const sunsetScore = phaseScore(dayWindows, "sunset");
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
    const colorCarrierScore = maxCandidateScore(dayWindows, (window) => window.colorCarrierScore, () => 0);
    const lowCloudObstructionRisk = maxCandidateScore(
      dayWindows,
      (window) => window.lowCloudObstructionRisk,
      () => 0,
    );
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
    const bestTarget = pickBestDailyGlowTarget(sunriseScore, sunsetScore);
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
      colorCarrierScore,
      lowCloudObstructionRisk,
      precipitationDisruptionRisk,
      visibilityColorQualityScore,
      aerosolScore,
      labels: buildGlowLabels(
        sunriseScore,
        sunsetScore,
        lowCloudObstructionRisk,
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
    return `朝霞 ${sunriseScore} 分高于晚霞，优先关注日出前后中高云和东方低云遮挡。`;
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
      noteZh: "低云可能遮挡太阳方向，低云过厚会导致无明显霞光或只剩白光。",
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
      effect: cloudHigh !== undefined && cloudHigh >= 20 && cloudHigh <= 70 ? "positive" : "neutral",
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
      effect: humidity !== undefined && humidity > 92 && (visibility ?? 99) < 8 ? "risk" : "neutral",
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
    (hour) =>
      hour.aerosolAvailability !== undefined && hour.aerosolAvailability !== "unavailable",
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

function buildAerosolEvidence(
  assessment: GlowAerosolAssessment,
): readonly GlowEvidenceItem[] {
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
      value: horizon.blockedDirectionsZh.length > 0 ? horizon.blockedDirectionsZh.join("、") : "暂无明显方向",
      effect: horizon.blockedDirectionsZh.length > 0 ? "neutral" : "positive",
      noteZh: horizon.obstructionNoteZh || missingTerrainNote,
    },
  ];
}

function buildGlowRiskReasons(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
  lowCloudObstructionRisk: number,
): readonly string[] {
  const reasons: string[] = [];
  const bestSunrise = bestPhaseWindow(candidates, "sunrise");
  const bestSunset = bestPhaseWindow(candidates, "sunset");

  if (lowCloudObstructionRisk >= 75) {
    reasons.push("低云遮挡风险高，太阳方向可能被低云压住，导致无明显霞光或只剩白光。");
  } else if (lowCloudObstructionRisk >= 50) {
    reasons.push("低云遮挡风险中等，需要现场观察太阳方向是否留有透光缝。");
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

  return reasons.length > 0 ? reasons : ["未发现高等级霞光风险，仍需出行前复核最新天气和现场视野。"];
}

function buildGlowOpportunityReasons(
  input: ForecastCalculationInput,
  candidates: readonly GlowCandidate[],
): readonly string[] {
  const reasons: string[] = [];
  const sunrise = bestPhaseWindow(candidates, "sunrise");
  const sunset = bestPhaseWindow(candidates, "sunset");
  const cloudMid = averageDefined(candidateWeatherOrAll(input, candidates), (hour) => hour.cloudMid);
  const cloudHigh = averageDefined(candidateWeatherOrAll(input, candidates), (hour) => hour.cloudHigh);

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
    "晚霞：建议日落前 60 分钟观察云层移动，重点看太阳方向是否留有透光缝。",
    "如果低云遮挡太阳方向，优先寻找更高机位或转拍层峦、云缝光和局部暖色。",
    "如果高云较好但低云不足，适合长焦山脊、远山层次和城市远景。",
    best >= 65 ? "当前霞光信号具备等待价值，但正式天气数据启用前不建议单点押注。" : "当前霞光信号偏保守，更适合把霞光作为顺带观察目标。",
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
      condition: "低云遮挡",
      action: "转更高机位或拍雾中局部",
      detail: "寻找能越过低云的视角；无法越过时转向局部山体、林线和云雾氛围。",
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
  if (terrainMissing) {
    notes.push(missingTerrainNote);
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
  if (terrainMissing) {
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
  colorCarrierScore: number,
  bestWindow: GlowWindow | undefined,
  watchableWindow: GlowWindow | undefined,
  notRecommendedWindow: GlowWindow | undefined,
): GlowAssessmentLabels {
  return {
    sunriseGlowOpportunity: chanceLabel(sunriseGlowScore),
    sunsetGlowOpportunity: chanceLabel(sunsetGlowScore),
    lowCloudObstruction: riskLabel(lowCloudObstructionRisk),
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
  if (components.lowCloudRisk >= 70) {
    tags.push("低云遮挡");
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
  if (components.postRainOpeningChance === "medium" || components.postRainOpeningChance === "high") {
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
  if (components.lowCloudRisk >= 70) {
    return `${target}窗口低云遮挡风险偏高，应优先复核太阳方向是否被低云压住。`;
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
  if (components.colorCarrierScore >= 70 && components.visibilityColorQualityScore >= 65) {
    return `${target}窗口中高云和通透度较可用，适合提前到位观察色彩发展。`;
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

function horizonAngleForPhase(input: ForecastCalculationInput, phase: GlowPhase): number | undefined {
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
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}%`
    : "暂缺数据";
}

function formatDecimalValue(value: number | null | undefined, digits: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "暂缺数据";
}

function formatConcentrationValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} µg/m³`
    : "暂缺数据";
}

function formatAngle(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂缺数据";
}
