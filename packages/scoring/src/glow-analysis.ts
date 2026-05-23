import type {
  AstroSummary,
  CloudSeaEvidenceEffect,
  ForecastCalculationInput,
  ForecastScore,
  GlowAnalysisResult,
  GlowBackupPlan,
  GlowEvidenceItem,
  GlowRecommendationLabel,
  GlowWindow,
  GlowWindowType,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import { averageHourly, averageWeightedScore, clampScore, addHours } from "./helpers.js";

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
  readonly cloudLayerStructure: number;
  readonly lowCloudPassScore: number;
  readonly lowCloudRisk: number;
  readonly visibility: number;
  readonly precipitation: number;
  readonly terrain: number;
  readonly windHumidity: number;
};

const oneHourMs = 60 * 60 * 1000;
const missingSunTimesNote = "缺少日出日落时间，无法生成精确霞光窗口。";
const missingTerrainNote = "暂缺地形遮挡细节，正式地形数据接入后将提升判断精度。";

export function calculateGlowAnalysis(input: ForecastCalculationInput): GlowAnalysisResult {
  const candidates = buildGlowCandidates(input).map((candidate) => {
    const components = calculateGlowComponents(input, candidate.weatherWindow, candidate.phase);
    const score = scoreGlowComponents(components);
    return {
      ...candidate,
      score,
      riskTags: buildGlowWindowRiskTags(input, candidate.weatherWindow, candidate.phase, components),
      noteZh: buildGlowWindowNote(candidate.phase, candidate.type, components),
    };
  });
  const bestGlowWindows = candidates
    .filter((window) => window.score >= 30)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return Date.parse(left.start) - Date.parse(right.start);
    });
  const sunriseGlowScore = phaseScore(candidates, "sunrise");
  const sunsetGlowScore = phaseScore(candidates, "sunset");
  const lowCloudObstructionRisk = calculateLowCloudObstructionRisk(input, candidates);
  const glowTravelScore = calculateGlowTravelScore(
    sunriseGlowScore,
    sunsetGlowScore,
    lowCloudObstructionRisk,
    input,
  );
  const missingDataNotes = buildGlowMissingDataNotes(input);

  return {
    sunriseGlowScore,
    sunsetGlowScore,
    lowCloudObstructionRisk,
    glowTravelScore,
    recommendationLabel: glowRecommendationLabel(glowTravelScore),
    confidenceLevel: buildGlowConfidence(input, missingDataNotes),
    bestGlowWindows,
    dailyGlow: buildDailyGlow(input, candidates),
    cloudLayerEvidence: buildCloudLayerEvidence(input, candidates),
    visibilityEvidence: buildVisibilityEvidence(input, candidates),
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
      type: "sunrise",
      labelZh: "朝霞预备窗口",
      date: astro.date,
      start: astro.civilDawn ?? addHours(astro.sunrise, -0.75),
      end: astro.sunrise,
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunrise",
      type: "sunrise",
      labelZh: "朝霞峰值窗口",
      date: astro.date,
      start: addHours(astro.sunrise, -25 / 60),
      end: addHours(astro.sunrise, 20 / 60),
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunrise",
      type: "sunrise",
      labelZh: "日出后暖光窗口",
      date: astro.date,
      start: astro.sunrise,
      end: addHours(astro.sunrise, 45 / 60),
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
      type: "warm_light",
      labelZh: "日落前暖光窗口",
      date: astro.date,
      start: addHours(astro.sunset, -45 / 60),
      end: astro.sunset,
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunset",
      type: "sunset",
      labelZh: "晚霞峰值窗口",
      date: astro.date,
      start: addHours(astro.sunset, -20 / 60),
      end: addHours(astro.sunset, 25 / 60),
    }),
    buildCandidate(input, forecastRange, {
      phase: "sunset",
      type: "afterglow",
      labelZh: "霞光余晖窗口",
      date: astro.date,
      start: astro.sunset,
      end: astro.civilDusk ?? addHours(astro.sunset, 0.75),
    }),
  ].filter((candidate): candidate is GlowCandidate => candidate !== null);
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
  window: readonly NormalizedHourlyWeather[],
  phase: GlowPhase,
): GlowComponentScores {
  const lowCloudRisk = scoreLowCloudObstructionRisk(input, window, phase);

  return {
    cloudLayerStructure: scoreCloudLayerStructure(window),
    lowCloudRisk,
    lowCloudPassScore: 100 - lowCloudRisk,
    visibility: scoreVisibility(window),
    precipitation: scorePrecipitation(window),
    terrain: scoreTerrainObstruction(input, phase),
    windHumidity: scoreWindHumidity(window),
  };
}

function scoreGlowComponents(components: GlowComponentScores): number {
  return averageWeightedScore([
    { score: components.cloudLayerStructure, weight: 0.35 },
    { score: components.lowCloudPassScore, weight: 0.2 },
    { score: components.visibility, weight: 0.15 },
    { score: components.precipitation, weight: 0.1 },
    { score: components.terrain, weight: 0.1 },
    { score: components.windHumidity, weight: 0.1 },
  ]);
}

function scoreCloudLayerStructure(window: readonly NormalizedHourlyWeather[]): number {
  const cloudHigh = averageDefined(window, (hour) => hour.cloudHigh);
  const cloudMid = averageDefined(window, (hour) => hour.cloudMid);
  const cloudLow = averageDefined(window, (hour) => hour.cloudLow);
  const cloudTotal = averageHourly(window, (hour) => hour.cloudTotal);

  if (cloudHigh === undefined || cloudMid === undefined) {
    return clampScore(scoreTotalCloud(cloudTotal) - 12);
  }

  if (cloudHigh < 5 && cloudMid < 5) {
    return clampScore(scoreTotalCloud(cloudTotal) - 28);
  }

  const highScore = layerCarrierScore(cloudHigh, 15, 70);
  const midScore = layerCarrierScore(cloudMid, 15, 60);
  const carrierScore = highScore * 0.55 + midScore * 0.45;
  const totalCloudScore = scoreTotalCloud(cloudTotal);
  const highDominantOvercast = cloudTotal > 90 && cloudHigh > 65 && (cloudLow ?? 0) < 45;
  const overcastPenalty = cloudTotal > 90 && !highDominantOvercast ? 14 : 0;

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
  const baseRisk =
    lowCloud === undefined
      ? 46
      : lowCloud > 75
        ? 84 + (lowCloud - 75) * 0.35
        : lowCloud >= 50
          ? 56 + (lowCloud - 50) * 0.95
          : lowCloud < 40
            ? 18 + lowCloud * 0.45
            : 38 + (lowCloud - 40) * 1.5;
  const horizonAngle = horizonAngleForPhase(input, phase);
  const horizonRisk =
    typeof horizonAngle === "number" ? Math.max(0, horizonAngle - 7) * 2.2 : 5;
  const directionRisk = hasBlockedDirection(input, phase) ? 16 : 0;
  const totalCloudRisk = cloudTotal > 90 && (lowCloud ?? 0) > 55 ? 10 : 0;

  return clampScore(baseRisk + horizonRisk + directionRisk + totalCloudRisk);
}

function scoreVisibility(window: readonly NormalizedHourlyWeather[]): number {
  const visibility = averageDefined(window, (hour) => hour.visibility);
  if (visibility === undefined) {
    return 58;
  }
  if (visibility > 15) {
    return clampScore(88 + Math.min(10, (visibility - 15) * 0.8));
  }
  if (visibility >= 8) {
    return clampScore(68 + (visibility - 8) * 2.5);
  }
  if (visibility >= 3) {
    return clampScore(34 + (visibility - 3) * 5);
  }
  return clampScore(12 + visibility * 7);
}

function scorePrecipitation(window: readonly NormalizedHourlyWeather[]): number {
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);
  const precipitation = averageDefined(window, (hour) => hour.precipitation) ?? 0;
  const activePrecipitationPenalty =
    precipitation > 3 ? 44 : precipitation > 1 ? 28 : precipitation > 0.2 ? 12 : 0;

  return clampScore(100 - precipitationProbability * 0.86 - activePrecipitationPenalty);
}

function scoreTerrainObstruction(input: ForecastCalculationInput, phase: GlowPhase): number {
  const horizonAngle = horizonAngleForPhase(input, phase);
  const directionPenalty = hasBlockedDirection(input, phase) ? 24 : 0;

  if (typeof horizonAngle !== "number" || !Number.isFinite(horizonAngle)) {
    return clampScore(66 - directionPenalty);
  }
  if (horizonAngle <= 5) {
    return clampScore(92 - directionPenalty);
  }
  if (horizonAngle <= 10) {
    return clampScore(78 - (horizonAngle - 5) * 3 - directionPenalty);
  }
  return clampScore(56 - (horizonAngle - 10) * 4 - directionPenalty);
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
  return clampScore(best * 0.75 + second * 0.25);
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

function calculateGlowTravelScore(
  sunriseGlowScore: number,
  sunsetGlowScore: number,
  lowCloudObstructionRisk: number,
  input: ForecastCalculationInput,
): number {
  const bestGlow = Math.max(sunriseGlowScore, sunsetGlowScore);
  const secondGlow = Math.min(sunriseGlowScore, sunsetGlowScore);
  const visibilityScore = scoreVisibility(input.hourlyWeather);

  return clampScore(
    bestGlow * 0.58 + secondGlow * 0.17 + visibilityScore * 0.15 + (100 - lowCloudObstructionRisk) * 0.1,
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
    const bestWindow = [...dayWindows].sort((left, right) => right.score - left.score)[0];
    const bestTarget = pickBestDailyGlowTarget(sunriseScore, sunsetScore);
    const riskNote = bestWindow?.riskTags.length
      ? bestWindow.riskTags.join("、")
      : "主要风险可控，仍需现场复核云层移动。";

    return {
      date,
      dateLabelZh: input.calendarBasis.targetDateLabels[index] ?? date,
      sunriseScore,
      sunsetScore,
      bestWindow,
      bestTarget,
      recommendationLabel: glowRecommendationLabel(Math.max(sunriseScore, sunsetScore)),
      keyReason: dailyKeyReason(bestTarget, sunriseScore, sunsetScore, bestWindow),
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
  if (bestTarget === "both") {
    return `朝霞 ${sunriseScore} 分、晚霞 ${sunsetScore} 分，两个窗口都值得纳入计划。`;
  }
  if (bestTarget === "sunrise") {
    return `朝霞 ${sunriseScore} 分高于晚霞，优先关注日出前后中高云和东方低云遮挡。`;
  }
  if (bestTarget === "sunset") {
    return `晚霞 ${sunsetScore} 分高于朝霞，优先观察日落前云层移动和西向通透度。`;
  }
  return bestWindow
    ? `${bestWindow.labelZh}仅作谨慎参考，建议同步准备其他题材。`
    : "暂未形成明确霞光窗口，不建议只为霞光专程。";
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
      effect: cloudMid !== undefined && cloudMid >= 15 && cloudMid <= 60 ? "positive" : "neutral",
      noteZh: "适量中云可承载霞光色彩，过少时朝晚霞面积通常偏小。",
    },
    {
      label: "高云",
      value: formatPercentValue(cloudHigh),
      effect: cloudHigh !== undefined && cloudHigh >= 15 && cloudHigh <= 70 ? "positive" : "neutral",
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
      effect: effectFromScore(scoreVisibility(weather)),
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
      effect: scorePrecipitation(weather) < 55 ? "risk" : "neutral",
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
    (cloudMid !== undefined && cloudMid >= 15 && cloudMid <= 60) ||
    (cloudHigh !== undefined && cloudHigh >= 15 && cloudHigh <= 70)
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

function buildGlowConfidence(
  input: ForecastCalculationInput,
  missingDataNotes: readonly string[],
): GlowAnalysisResult["confidenceLevel"] {
  let confidenceScore = 100;
  if (missingDataNotes.some((note) => note.includes("分层数据"))) {
    confidenceScore -= 25;
  }
  if (missingDataNotes.some((note) => note.includes("能见度"))) {
    confidenceScore -= 15;
  }
  if (missingDataNotes.some((note) => note.includes("日出日落"))) {
    confidenceScore -= 25;
  }
  if (missingDataNotes.some((note) => note.includes("地形遮挡"))) {
    confidenceScore -= 12;
  }
  if (input.weatherDataMode !== "real") {
    confidenceScore -= 15;
  }

  if (confidenceScore >= 80 && input.weatherDataMode === "real") {
    return "high";
  }
  if (confidenceScore >= 55) {
    return "medium";
  }
  return "low";
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
  if (components.cloudLayerStructure < 50) {
    tags.push("中高云不足");
  }
  if (components.visibility < 55) {
    tags.push("通透度弱");
  }
  if (components.precipitation < 58) {
    tags.push("降水干扰");
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
  if (components.cloudLayerStructure >= 70 && components.visibility >= 65) {
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
  return directions.some((direction) =>
    phase === "sunrise" ? direction.includes("东") : direction.includes("西"),
  );
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

function formatAngle(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂缺数据";
}
