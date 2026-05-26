import {
  forecastRecommendationLabels,
  type AstroAnalysisResult,
  type AstroSummary,
  type CloudSeaAnalysisResult,
  type ForecastCalculationInput,
  type ForecastDailyWeatherSummary,
  type ForecastCalculationResult,
  type ForecastDailyMetric,
  type ForecastDailySummary,
  type ForecastRecommendationLevel,
  type ForecastWindowHumanCostLevel,
  type ForecastWindowRecommendationLevel,
  type ForecastRiskFlag,
  type ForecastScore,
  type ForecastScoreLevel,
  type ForecastTarget,
  type ForecastTimeWindow,
  type GlowAnalysisResult,
  type NormalizedHourlyWeather,
  type TargetDailyBreakdown,
} from "@photo-weather/shared";
import { defaultTimezone, formatZonedIso, getHourInTimezone } from "@photo-weather/calendar";
import {
  averageHourly,
  averageWeightedScore,
  clampScore,
  formatChineseTimeRange,
  getWeatherWindowAroundTime,
} from "./helpers.js";
import { analyzeCloudSea, cloudSeaRecommendationLevel } from "./cloud-sea-analysis.js";
import { calculateAstroAnalysis } from "./astro-analysis.js";
import { buildClothingGuide } from "./clothing-guide.js";
import { buildGlowForecastScore, calculateGlowAnalysis } from "./glow-analysis.js";
import {
  calculatePhotographyTransparencyScore,
  buildPhotographyPrecipitationRisk,
  precipitationAmountMm,
  precipitationRiskLevel,
  precipitationRiskScore,
  transparencyGradeFromScore,
} from "./weather-decision-metrics.js";

const demoWeatherHonestyNotice =
  "当前结果基于演示天气数据生成，仅用于体验分析流程。正式天气数据源启用后，将显示对应的数据来源与预报时间。";
const defaultAstronomyDataSourceLabel = "本地算法计算";
const astronomyHonestyNotice =
  "天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。";

const cloudLayerMissingNote = "当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。";

type ForecastTimeRange = {
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly startMs: number;
  readonly endMs: number;
};

type ScoredForecastWindow = {
  readonly astro?: AstroSummary;
  readonly startTime: string;
  readonly endTime: string;
  readonly weatherWindow: readonly NormalizedHourlyWeather[];
  readonly score: number;
};

export function calculateForecast(input: ForecastCalculationInput): ForecastCalculationResult {
  const clothingGuide =
    input.clothingGuide ??
    buildClothingGuide({
      currentWeather: input.currentWeather,
      hourlyWeather: input.hourlyWeather,
      elevationMeters: input.terrainAnalysis.terrainProfile.locationElevation,
      target: input.target,
      timezone: input.calendarBasis.timezone,
      forecastStart: input.calendarBasis.forecastStart,
    });
  const cloudSeaAnalysis = analyzeCloudSea(input);
  const glowAnalysis = calculateGlowAnalysis(input);
  const sunriseGlow = buildGlowForecastScore(glowAnalysis, "sunrise");
  const sunsetGlow = buildGlowForecastScore(glowAnalysis, "sunset");
  const cloudSea = calculateCloudSeaScore(input, cloudSeaAnalysis);
  const whiteoutRisk = calculateWhiteoutRiskScore(input, cloudSeaAnalysis);
  const stars = calculateStarsScore(input);
  const milkyWay = calculateMilkyWayScore(input);
  const transparency = calculateTransparencyScore(input);

  const scores = {
    sunriseGlow,
    sunsetGlow,
    cloudSea,
    whiteoutRisk,
    stars,
    milkyWay,
    transparency,
  };
  const astroAnalysis = calculateAstroAnalysis(input, {
    starsScore: stars.score,
    milkyWayScore: milkyWay.score,
    transparencyScore: transparency.score,
  });
  const riskFlags = buildRiskFlags(input, whiteoutRisk);
  const bestWindows = buildBestWindows(input, cloudSeaAnalysis, glowAnalysis, astroAnalysis, riskFlags);
  const overallScore =
    input.target === "cloud_sea"
      ? cloudSeaAnalysis.travelScore
      : input.target === "glow"
        ? glowAnalysis.glowTravelScore
        : input.target === "astro"
          ? astroAnalysis.astroTravelScore
          : calculateGeneralPracticalTripScore(scores, bestWindows);
  const recommendationLevel =
    input.target === "cloud_sea"
      ? cloudSeaRecommendationLevel(cloudSeaAnalysis.travelScore)
      : input.target === "glow"
        ? classifyRecommendationLevel(glowAnalysis.glowTravelScore)
        : input.target === "astro"
          ? classifyRecommendationLevel(astroAnalysis.astroTravelScore)
          : applyRiskCap(classifyRecommendationLevel(overallScore), riskFlags);
  const recommendationLabel =
    input.target === "cloud_sea"
      ? cloudSeaAnalysis.recommendationLabel
      : input.target === "glow"
        ? glowAnalysis.recommendationLabel
        : input.target === "astro"
          ? astroAnalysis.recommendationLabel
          : forecastRecommendationLabels[recommendationLevel];
  const targetDailyBreakdown = buildTargetDailyBreakdown(
    input,
    scores,
    bestWindows,
    cloudSeaAnalysis,
    glowAnalysis,
    astroAnalysis,
  );
  const dailySummaries = buildDailySummaries(input, targetDailyBreakdown, bestWindows);

  return {
    place: input.place,
    horizon: input.horizon,
    target: input.target,
    forecastStart: input.calendarBasis.forecastStart,
    forecastEnd: input.calendarBasis.forecastEnd,
    targetDates: input.calendarBasis.targetDates,
    calendarBasis: input.calendarBasis,
    overallScore,
    recommendationLevel,
    recommendationLabel,
    summary: buildSummary(input, overallScore, recommendationLabel, scores, bestWindows),
    scores,
    cloudSeaAnalysis,
    glowAnalysis,
    astroAnalysis,
    terrainSummary: input.terrainSummary,
    terrainAnalysis: input.terrainAnalysis,
    astroSummaries: input.astroSummaries,
    dailySummaries,
    targetDailyBreakdown,
    bestWindows,
    riskFlags,
    keyReasons: buildKeyReasons(input, scores),
    photographyAdvice: buildPhotographyAdvice(input, scores, riskFlags, bestWindows),
    dataNotice: buildDataNotice(input),
    isMock: input.isMock,
    dataSourceLabel: input.dataSourceLabel,
    generatedAt: input.generatedAt,
    currentWeather: input.currentWeather,
    clothingGuide,
    weatherProviderCode: input.weatherProviderCode,
    weatherProviderLabelZh: input.weatherProviderLabelZh,
    weatherDataMode: input.weatherDataMode,
    weatherNoticeZh: input.weatherNoticeZh,
    weatherMissingFields: input.weatherMissingFields,
    weatherEstimatedFields: input.weatherEstimatedFields,
    weatherSourceSummaries: input.weatherSourceSummaries,
    weatherMissingDataNotes: input.weatherMissingDataNotes,
    weatherFusionSummary: input.weatherFusionSummary,
    weatherProviderRuntimeSnapshot: input.weatherProviderRuntimeSnapshot,
    astroDataSourceLabelZh: input.astroDataSourceLabelZh,
    astroCalculationBasis: input.astroCalculationBasis,
  };
}

export function calculateSunriseGlowScore(input: ForecastCalculationInput): ForecastScore {
  return buildGlowForecastScore(calculateGlowAnalysis(input), "sunrise");
}

export function calculateSunsetGlowScore(input: ForecastCalculationInput): ForecastScore {
  return buildGlowForecastScore(calculateGlowAnalysis(input), "sunset");
}

export function calculateCloudSeaScore(
  input: ForecastCalculationInput,
  analysis: CloudSeaAnalysisResult = analyzeCloudSea(input),
): ForecastScore {
  return makeScore(
    "cloudSea",
    "云海",
    analysis.cloudSeaOpportunityScore,
    analysis.opportunityReasons,
    [
      ...analysis.missingDataNotes.filter((note) => note.includes("低云") || note.includes("露点")),
      ...analysis.whiteoutReasons.filter((reason) => reason.includes("白墙")).slice(0, 1),
    ],
  );
}

export function calculateWhiteoutRiskScore(
  input: ForecastCalculationInput,
  analysis: CloudSeaAnalysisResult = analyzeCloudSea(input),
): ForecastScore {
  return {
    key: "whiteoutRisk",
    label: "白墙风险",
    score: analysis.whiteoutRiskScore,
    level: classifyRiskIntensityAsScoreLevel(analysis.whiteoutRiskScore),
    reasons: analysis.whiteoutReasons,
    risks: analysis.whiteoutRiskScore >= 70 ? analysis.whiteoutReasons.slice(0, 2) : [],
  };
}

export function calculateStarsScore(input: ForecastCalculationInput): ForecastScore {
  const window = nightWindow(input.hourlyWeather);
  const cloudClearScore = 100 - averageHourly(window, (hour) => hour.cloudTotal);
  const cloudLayerClearScore = calculateCloudLayerClearScore(window);
  const humidityScore = 100 - averageHourly(window, (hour) => hour.humidity);
  const visibilityScore = clampScore(averageHourly(window, (hour) => hour.visibility) * 4);
  const moonScore = calculateMoonScoreForWindow(window, input.astroSummaries);
  const score = applyAstroPracticalWeatherCap(
    averageWeightedScore([
      { score: cloudClearScore, weight: 0.28 },
      { score: cloudLayerClearScore, weight: 0.1 },
      { score: humidityScore, weight: 0.2 },
      { score: visibilityScore, weight: 0.22 },
      { score: moonScore, weight: 0.2 },
    ]),
    window,
  );
  const reasons = [
    `夜间总云量折算得分 ${Math.round(cloudClearScore)}，云越少越利于星空。`,
    hasCloudLayerGaps(window)
      ? "当前天气源缺少部分云层分层，星空判断会降低置信度。"
      : `夜间分层云量折算得分 ${Math.round(cloudLayerClearScore)}，低云和中高云都会影响星点可见度。`,
    `月光影响折算得分 ${Math.round(moonScore)}，已考虑月相和夜间月亮高度。`,
  ];
  const risks = [
    ...(cloudClearScore < 45 ? ["夜间云量偏多，星点容易被遮挡。"] : []),
    ...(moonScore < 45 ? ["月光影响偏强，暗弱星空反差会下降。"] : []),
  ];

  return makeScore("stars", "星空", score, reasons, risks);
}

export function calculateMilkyWayScore(input: ForecastCalculationInput): ForecastScore {
  const milkyWayHorizonAngle = input.terrainAnalysis.horizonProfile.milkyWayHorizonAngle;
  const candidate = findBestMilkyWayCandidate(input);
  const hasWindow = Boolean(candidate);
  const window = candidate?.weatherWindow ?? nightWindow(input.hourlyWeather);
  const cloudClearScore = 100 - averageHourly(window, (hour) => hour.cloudTotal);
  const moonScore = calculateMoonScoreForWindow(window, input.astroSummaries);
  const horizonPenalty =
    typeof milkyWayHorizonAngle === "number" ? Math.max(0, milkyWayHorizonAngle - 8) * 3 : 0;
  const score = applyAstroPracticalWeatherCap(
    clampScore((candidate?.score ?? 18) - horizonPenalty),
    window,
  );
  const reasons = [
    hasWindow
      ? `本地算法银河窗口为 ${formatChineseTimeRange(candidate!.startTime, candidate!.endTime)}。`
      : "本地天文算法未给出可用银河窗口。",
    `银河窗口附近云量和月光综合折算得分 ${Math.round(score)}。`,
    horizonReason("银河方向", milkyWayHorizonAngle),
  ];
  const risks = [
    ...(!hasWindow ? ["缺少银河窗口，只能按星空条件保守参考。"] : []),
    ...(cloudClearScore < 45 ? ["银河窗口附近云量偏多，银心细节可能不明显。"] : []),
    ...(moonScore < 45 ? ["月光偏强，银河对比度会降低。"] : []),
    ...(typeof milkyWayHorizonAngle === "number" && milkyWayHorizonAngle > 10
      ? ["银河方向地平线遮挡偏高，低仰角银心或地景衔接可能受山体影响。"]
      : []),
  ];

  return makeScore("milkyWay", "银河", score, reasons, risks);
}

export function calculateTransparencyScore(input: ForecastCalculationInput): ForecastScore {
  const window = input.hourlyWeather;
  const visibility = averageHourly(window, (hour) => hour.rawVisibilityKm ?? hour.visibility);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);
  const precipitationAmount = averageHourly(window, (hour) => precipitationAmountMm(hour));
  const windSpeed = averageHourly(window, (hour) => hour.windSpeed);
  const cloudTotal = averageHourly(window, (hour) => hour.cloudTotal);
  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const dewPointSpread = averageHourly(window, (hour) => hour.dewPointSpread);
  const windScore = windSpeed < 1 ? 72 : windSpeed <= 6 ? 88 : clampScore(108 - windSpeed * 9);
  const score = clampScore(
    averageHourly(window, (hour) => calculatePhotographyTransparencyScore(hour)) ||
      averageWeightedScore([
        { score: clampScore(Math.min(visibility, 40) * 2.4), weight: 0.26 },
        { score: 100 - humidity, weight: 0.18 },
        {
          score:
            100 -
            precipitationRiskScore({
              probability: precipitationProbability,
              amountMm: precipitationAmount,
            }),
          weight: 0.2,
        },
        { score: windScore, weight: 0.1 },
        { score: 100 - cloudTotal * 0.45, weight: 0.12 },
        { score: 100 - lowCloud * 0.55, weight: 0.14 },
      ]),
  );
  const grade = transparencyGradeFromScore(score);
  const reasons = [
    `平均能见度约 ${Math.round(visibility)} 公里，摄影通透度为${transparencyGradeLabel(grade)}。`,
    `平均低云约 ${Math.round(lowCloud)}%，湿度约 ${Math.round(
      humidity,
    )}%，降水风险已按概率与降水量共同判断。`,
  ];
  const risks = [
    ...(visibility < 12 ? ["能见度偏低，远山层次和日出日落通透度会受影响。"] : []),
    ...(lowCloud >= 70 && humidity >= 85
      ? ["低云和湿度偏高，即使原始能见度较高，远山层次也可能被云雾削弱。"]
      : []),
    ...(precipitationRiskScore({
      probability: precipitationProbability,
      amountMm: precipitationAmount,
    }) > 45
      ? ["存在降水干扰，镜头防护和行程弹性需要提前准备。"]
      : []),
    ...(dewPointSpread > 0 && dewPointSpread <= 3
      ? ["露点差较小，雾气和结露会降低画面通透度。"]
      : []),
  ];

  return makeScore("transparency", "通透度", score, reasons, risks);
}

export function calculateOverallScore(
  scores: {
    readonly sunriseGlow: ForecastScore;
    readonly sunsetGlow: ForecastScore;
    readonly cloudSea: ForecastScore;
    readonly whiteoutRisk: ForecastScore;
    readonly stars: ForecastScore;
    readonly milkyWay: ForecastScore;
    readonly transparency: ForecastScore;
  },
  target: ForecastTarget = "general",
): number {
  const inverseWhiteout = 100 - scores.whiteoutRisk.score;

  if (target === "cloud_sea") {
    return averageWeightedScore([
      { score: scores.cloudSea.score, weight: 0.62 },
      { score: inverseWhiteout, weight: 0.28 },
      { score: scores.transparency.score, weight: 0.1 },
    ]);
  }

  if (target === "glow") {
    return averageWeightedScore([
      { score: scores.sunriseGlow.score, weight: 0.28 },
      { score: scores.sunsetGlow.score, weight: 0.28 },
      { score: scores.transparency.score, weight: 0.2 },
      { score: scores.cloudSea.score, weight: 0.12 },
      { score: inverseWhiteout, weight: 0.12 },
    ]);
  }

  if (target === "astro") {
    return averageWeightedScore([
      { score: scores.stars.score, weight: 0.35 },
      { score: scores.milkyWay.score, weight: 0.35 },
      { score: scores.transparency.score, weight: 0.2 },
      { score: inverseWhiteout, weight: 0.1 },
    ]);
  }

  return averageWeightedScore([
    { score: scores.sunriseGlow.score, weight: 0.16 },
    { score: scores.sunsetGlow.score, weight: 0.16 },
    { score: scores.cloudSea.score, weight: 0.18 },
    { score: scores.stars.score, weight: 0.12 },
    { score: scores.milkyWay.score, weight: 0.12 },
    { score: scores.transparency.score, weight: 0.18 },
    { score: inverseWhiteout, weight: 0.08 },
  ]);
}

export function classifyScoreLevel(score: number): ForecastScoreLevel {
  const normalizedScore = clampScore(score);
  if (normalizedScore >= 80) {
    return "excellent";
  }
  if (normalizedScore >= 65) {
    return "good";
  }
  if (normalizedScore >= 45) {
    return "fair";
  }
  return "poor";
}

export function classifyRecommendationLevel(score: number): ForecastRecommendationLevel {
  const normalizedScore = clampScore(score);
  if (normalizedScore >= 78) {
    return "recommended";
  }
  if (normalizedScore >= 62) {
    return "worth_waiting";
  }
  if (normalizedScore >= 45) {
    return "cautious";
  }
  return "not_recommended";
}

function makeScore(
  key: string,
  label: string,
  score: number,
  reasons: readonly string[],
  risks: readonly string[],
): ForecastScore {
  const normalizedScore = clampScore(score);

  return {
    key,
    label,
    score: normalizedScore,
    level: classifyScoreLevel(normalizedScore),
    reasons,
    risks,
  };
}

function horizonReason(label: string, horizonAngle: number | undefined): string {
  if (typeof horizonAngle !== "number" || !Number.isFinite(horizonAngle)) {
    return `${label}暂无可用地平线遮挡角，本次不额外扣减地形遮挡。`;
  }

  return `${label}演示地形遮挡角约 ${horizonAngle.toFixed(1)}°，用于辅助判断低角度光线和构图遮挡。`;
}

function findBestMilkyWayCandidate(
  input: ForecastCalculationInput,
): ScoredForecastWindow | undefined {
  const candidates = buildMilkyWayCandidates(input).map((candidate) => ({
    ...candidate,
    score: calculateMilkyWayWindowScore(candidate.weatherWindow, input.astroSummaries),
  }));

  return pickBestScoredWindow(candidates);
}

function buildMilkyWayCandidates(input: ForecastCalculationInput): readonly ScoredForecastWindow[] {
  const forecastRange = parseForecastRange(input);
  if (!forecastRange) {
    return [];
  }

  return input.astroSummaries.flatMap((astro) => {
    if (!astro.milkyWayWindowStart || !astro.milkyWayWindowEnd) {
      return [];
    }

    const clippedWindow = clipWindowToForecastRange(
      astro.milkyWayWindowStart,
      astro.milkyWayWindowEnd,
      forecastRange,
    );
    if (!clippedWindow) {
      return [];
    }

    const weatherWindow = filterWeatherInForecastRange(
      getWeatherWindowAroundTime(input.hourlyWeather, astro.milkyWayWindowStart, 0, 3),
      forecastRange,
    );
    if (weatherWindow.length === 0) {
      return [];
    }

    return [
      {
        astro,
        ...clippedWindow,
        weatherWindow,
        score: 0,
      },
    ];
  });
}

function calculateMilkyWayWindowScore(
  window: readonly NormalizedHourlyWeather[],
  astroSummaries: readonly AstroSummary[],
): number {
  const cloudClearScore = 100 - averageHourly(window, (hour) => hour.cloudTotal);
  const cloudLayerClearScore = calculateCloudLayerClearScore(window);
  const humidityScore = 100 - averageHourly(window, (hour) => hour.humidity);
  const visibilityScore = clampScore(averageHourly(window, (hour) => hour.visibility) * 4);
  const moonScore = calculateMoonScoreForWindow(window, astroSummaries);

  return applyAstroPracticalWeatherCap(
    averageWeightedScore([
      { score: cloudClearScore, weight: 0.24 },
      { score: cloudLayerClearScore, weight: 0.08 },
      { score: humidityScore, weight: 0.16 },
      { score: visibilityScore, weight: 0.2 },
      { score: moonScore, weight: 0.22 },
      { score: 90, weight: 0.1 },
    ]),
    window,
  );
}

function pickBestScoredWindow(
  windows: readonly ScoredForecastWindow[],
): ScoredForecastWindow | undefined {
  return windows.reduce<ScoredForecastWindow | undefined>((best, window) => {
    if (!best) {
      return window;
    }

    return window.score > best.score ? window : best;
  }, undefined);
}

function parseForecastRange(input: ForecastCalculationInput): ForecastTimeRange | undefined {
  const startMs = Date.parse(input.calendarBasis.forecastStart);
  const endMs = Date.parse(input.calendarBasis.forecastEnd);

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return undefined;
  }

  return {
    forecastStart: input.calendarBasis.forecastStart,
    forecastEnd: input.calendarBasis.forecastEnd,
    startMs,
    endMs,
  };
}

function clipWindowToForecastRange(
  startTime: string,
  endTime: string,
  forecastRange: ForecastTimeRange,
): Pick<ScoredForecastWindow, "startTime" | "endTime"> | undefined {
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs ||
    endMs <= forecastRange.startMs ||
    startMs >= forecastRange.endMs
  ) {
    return undefined;
  }

  const clippedStartTime =
    startMs < forecastRange.startMs ? forecastRange.forecastStart : startTime;
  const clippedEndTime = endMs > forecastRange.endMs ? forecastRange.forecastEnd : endTime;

  if (Date.parse(clippedEndTime) <= Date.parse(clippedStartTime)) {
    return undefined;
  }

  return {
    startTime: clippedStartTime,
    endTime: clippedEndTime,
  };
}

function filterWeatherInForecastRange(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  forecastRange: ForecastTimeRange,
): readonly NormalizedHourlyWeather[] {
  return hourlyWeather.filter((hour) => {
    const hourMs = Date.parse(hour.time);
    return (
      Number.isFinite(hourMs) && hourMs >= forecastRange.startMs && hourMs < forecastRange.endMs
    );
  });
}

type PracticalWindowKind = NonNullable<ForecastTimeWindow["practicalKind"]>;
type PracticalLightPhase = NonNullable<ForecastTimeWindow["lightPhase"]>;
type PracticalArrivalAdvice = NonNullable<ForecastTimeWindow["arrivalAdvice"]>;

function buildBestWindows(
  input: ForecastCalculationInput,
  cloudSeaAnalysis: CloudSeaAnalysisResult,
  glowAnalysis: GlowAnalysisResult,
  astroAnalysis: AstroAnalysisResult,
  riskFlags: readonly ForecastRiskFlag[],
): readonly ForecastTimeWindow[] {
  const windows = [
    ...buildGlowWindows(glowAnalysis),
    ...buildCloudSeaWindows(cloudSeaAnalysis),
    ...buildAstroWindowsFromAnalysis(astroAnalysis),
    ...(input.target === "general" ? buildCloudSeaFormationSignalWindows(input) : []),
  ];

  return windows
    .map((window) => applyPracticalTripScoring(input, window, riskFlags))
    .filter((window) => {
      const conditionScore = window.conditionScore ?? window.score;
      const practicalScore = window.practicalScore ?? window.score;
      const hasAstroWeatherBlockers =
        window.target === "astro" && (window.weatherBlockers?.length ?? 0) > 0;
      if (window.practicalKind === "formation_signal") {
        return conditionScore >= 55 && practicalScore >= 25;
      }
      if (hasAstroWeatherBlockers) {
        return conditionScore >= 25;
      }

      return conditionScore >= 35 && practicalScore >= 35;
    })
    .sort((left, right) => {
      if (input.target === "general") {
        const recommendationDelta =
          windowRecommendationRank(right.recommendationLevel) -
          windowRecommendationRank(left.recommendationLevel);
        if (recommendationDelta !== 0) {
          return recommendationDelta;
        }

        const practicalDelta = (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score);
        if (practicalDelta !== 0) {
          return practicalDelta;
        }

        const conditionDelta = (right.conditionScore ?? right.score) - (left.conditionScore ?? left.score);
        if (conditionDelta !== 0) {
          return conditionDelta;
        }
      } else if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Date.parse(left.startTime) - Date.parse(right.startTime);
    });
}

function calculateGeneralPracticalTripScore(
  scores: ForecastCalculationResult["scores"],
  windows: readonly ForecastTimeWindow[],
): number {
  const bestShootableWindow =
    windows.find(
      (window) =>
        window.practicalKind !== "formation_signal" &&
        window.recommendationLevel !== "not_recommended" &&
        window.recommendationLevel !== "backup",
    ) ??
    windows.find((window) => window.practicalKind !== "formation_signal") ??
    windows[0];

  if (bestShootableWindow) {
    return clampScore(bestShootableWindow.practicalScore ?? bestShootableWindow.score);
  }

  return calculateOverallScore(scores, "general");
}

function applyPracticalTripScoring(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
  riskFlags: readonly ForecastRiskFlag[],
): ForecastTimeWindow {
  const conditionScore = clampScore(window.conditionScore ?? window.score);
  const practical = evaluatePracticalWindow(input, window, conditionScore, riskFlags);
  const score = input.target === "general" ? practical.practicalScore : window.score;

  return {
    ...window,
    score,
    conditionScore,
    practicalScore: practical.practicalScore,
    humanCostLevel: practical.humanCostLevel,
    recommendationLevel: practical.recommendationLevel,
    practicalKind: practical.practicalKind,
    lightPhase: practical.lightPhase,
    practicalNoteZh: practical.practicalNoteZh,
    precipitationRisk: practical.precipitationRisk,
    subjectPriorityLabel: practical.subjectPriorityLabel,
    backupSubjectLabel: practical.backupSubjectLabel,
    restWarningZh: practical.restWarningZh,
    arrivalAdvice: practical.arrivalAdvice,
  };
}

function evaluatePracticalWindow(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
  conditionScore: number,
  riskFlags: readonly ForecastRiskFlag[],
): {
  readonly practicalScore: number;
  readonly humanCostLevel: ForecastWindowHumanCostLevel;
  readonly recommendationLevel: ForecastWindowRecommendationLevel;
  readonly practicalKind: PracticalWindowKind;
  readonly lightPhase: PracticalLightPhase;
  readonly practicalNoteZh: string;
  readonly precipitationRisk: ForecastTimeWindow["precipitationRisk"];
  readonly subjectPriorityLabel: string;
  readonly backupSubjectLabel: string;
  readonly restWarningZh?: string;
  readonly arrivalAdvice: PracticalArrivalAdvice;
} {
  const practicalKind: PracticalWindowKind = window.label.includes("形成信号")
    ? "formation_signal"
    : "shooting_window";
  const lightPhase = inferLightPhase(input, window, practicalKind);
  const arrivalAdvice = buildArrivalAdvice(input, window, practicalKind, lightPhase);
  const restPenalty = restPenaltyForWindow(
    window,
    practicalKind,
    lightPhase,
    arrivalAdvice,
    input.calendarBasis.timezone,
  );
  const precipitationRisk = precipitationRiskForWindow(input, window);
  const riskPenalty = riskPenaltyForWindow(window, riskFlags, precipitationRisk);
  const weatherBlockerPenalty = weatherBlockerPenaltyForWindow(window);
  const lightScore = lightAvailabilityScore(window, practicalKind, lightPhase);
  const subjectValueScore = subjectPracticalValueScore(window, practicalKind, lightPhase);
  const travelFeasibilityScore = travelFeasibilityForWindow(
    window,
    practicalKind,
    arrivalAdvice,
    riskFlags,
    precipitationRisk,
  );
  const sunriseLinkBonus =
    window.target === "cloud_sea" &&
    practicalKind === "shooting_window" &&
    (lightPhase === "sunrise" || lightPhase === "dawn")
      ? 8
      : 0;
  const rawPracticalScore = clampScore(
    averageWeightedScore([
      { score: conditionScore, weight: 0.52 },
      { score: lightScore, weight: 0.2 },
      { score: subjectValueScore, weight: 0.16 },
      { score: travelFeasibilityScore, weight: 0.12 },
    ]) -
      restPenalty -
      riskPenalty +
      sunriseLinkBonus,
  );
  const practicalScore = clampAstroBlockedPracticalScore(
    window,
    clampScore(rawPracticalScore - weatherBlockerPenalty),
  );
  const humanCostLevel = humanCostLevelForWindow(
    window,
    practicalKind,
    lightPhase,
    arrivalAdvice,
    input.calendarBasis.timezone,
  );
  const recommendationLevel = recommendationLevelForWindow(
    window,
    practicalKind,
    practicalScore,
    humanCostLevel,
  );

  return {
    practicalScore,
    humanCostLevel,
    recommendationLevel,
    practicalKind,
    lightPhase,
    practicalNoteZh: practicalNoteForWindow(
      window,
      practicalKind,
      lightPhase,
      conditionScore,
      practicalScore,
      precipitationRisk,
    ),
    precipitationRisk,
    subjectPriorityLabel: subjectPriorityLabelForWindow(window, practicalKind),
    backupSubjectLabel: backupSubjectLabelForWindow(window),
    restWarningZh: arrivalAdvice.warningZh,
    arrivalAdvice,
  };
}

function buildCloudSeaFormationSignalWindows(
  input: ForecastCalculationInput,
): readonly ForecastTimeWindow[] {
  const forecastRange = parseForecastRange(input);
  if (!forecastRange) {
    return [];
  }

  return input.calendarBasis.targetDates.flatMap((date) => {
    const nightHours = hoursForDate(input.hourlyWeather, date, input.calendarBasis.timezone).filter(
      (hour) => {
        const hourValue = localHourFloat(hour.time, input.calendarBasis.timezone);
        return hourValue >= 0 && hourValue <= 3.5;
      },
    );

    if (nightHours.length === 0) {
      return [];
    }

    const scoredHours = nightHours.map((hour) => ({
      hour,
      score: calculateCloudSeaFormationSignalScore(input, hour),
    }));
    const peakScore = Math.max(...scoredHours.map((item) => item.score), 0);
    if (peakScore < 55) {
      return [];
    }

    const usefulHours = scoredHours.filter((item) => item.score >= Math.max(50, peakScore - 18));
    const firstHour = usefulHours[0]?.hour;
    const lastHour = usefulHours[usefulHours.length - 1]?.hour;
    if (!firstHour || !lastHour) {
      return [];
    }

    const clipped = clipWindowToForecastRange(
      firstHour.time,
      shiftMinutes(lastHour.time, 60, input.calendarBasis.timezone),
      forecastRange,
    );
    if (!clipped) {
      return [];
    }

    const score = clampScore(
      usefulHours.reduce((sum, item) => sum + item.score, 0) / usefulHours.length,
    );

    return [
      {
        label: `云海形成信号 ${formatChineseTimeRange(clipped.startTime, clipped.endTime)}`,
        date,
        startTime: clipped.startTime,
        endTime: clipped.endTime,
        score,
        conditionScore: score,
        target: "cloud_sea" as const,
        practicalKind: "formation_signal" as const,
        lightPhase: "deep_night" as const,
        practicalNoteZh: "夜间云雾条件可作为形成信号，缺少可用光线时不作为最佳拍摄窗口。",
      },
    ];
  });
}

function calculateCloudSeaFormationSignalScore(
  input: ForecastCalculationInput,
  hour: NormalizedHourlyWeather,
): number {
  const lowCloud = hour.cloudLow ?? Math.min(90, hour.cloudTotal * 0.75);
  const precipitationScore =
    100 -
    precipitationRiskScore({
      probability: hour.precipitationProbability,
      amountMm: precipitationAmountMm(hour),
    });
  const visibility = hour.visibility ?? hour.rawVisibilityKm ?? 8;
  const terrainScore = terrainFormationSignalScore(input);

  return averageWeightedScore([
    { score: humidityFormationScore(hour.humidity), weight: 0.24 },
    { score: dewPointSpreadFormationScore(hour.dewPointSpread), weight: 0.2 },
    { score: lowCloudFormationScore(lowCloud), weight: 0.18 },
    { score: windFormationScore(hour.windSpeed), weight: 0.14 },
    { score: visibilityFormationScore(visibility), weight: 0.1 },
    { score: terrainScore, weight: 0.1 },
    { score: precipitationScore, weight: 0.04 },
  ]);
}

function humidityFormationScore(humidity: number): number {
  if (humidity >= 92) {
    return 96;
  }
  if (humidity >= 85) {
    return 88;
  }
  if (humidity >= 78) {
    return 74;
  }
  if (humidity >= 68) {
    return 55;
  }
  return 30;
}

function dewPointSpreadFormationScore(dewPointSpread: number | null | undefined): number {
  if (typeof dewPointSpread !== "number" || !Number.isFinite(dewPointSpread)) {
    return 55;
  }
  if (dewPointSpread <= 1.5) {
    return 94;
  }
  if (dewPointSpread <= 3) {
    return 84;
  }
  if (dewPointSpread <= 5) {
    return 62;
  }
  return 32;
}

function lowCloudFormationScore(lowCloud: number): number {
  if (lowCloud >= 38 && lowCloud <= 72) {
    return 90;
  }
  if (lowCloud > 72 && lowCloud <= 88) {
    return 72;
  }
  if (lowCloud >= 24 && lowCloud < 38) {
    return 66;
  }
  return lowCloud > 88 ? 42 : 35;
}

function windFormationScore(windSpeed: number): number {
  if (windSpeed <= 3) {
    return 92;
  }
  if (windSpeed <= 5.5) {
    return 72;
  }
  if (windSpeed <= 8) {
    return 48;
  }
  return 25;
}

function visibilityFormationScore(visibility: number): number {
  if (visibility >= 8 && visibility <= 28) {
    return 78;
  }
  if (visibility > 28) {
    return 58;
  }
  if (visibility >= 3) {
    return 52;
  }
  return 28;
}

function terrainFormationSignalScore(input: ForecastCalculationInput): number {
  const terrainPotential = input.terrainAnalysis.terrainProfile.terrainCloudSeaPotential;
  const diff = input.terrainAnalysis.terrainProfile.elevationDiff5km;
  const potentialScore =
    terrainPotential === "high" ? 88 : terrainPotential === "medium" ? 70 : 44;
  const diffScore = diff >= 900 ? 88 : diff >= 550 ? 74 : diff >= 300 ? 58 : 38;

  return averageWeightedScore([
    { score: potentialScore, weight: 0.62 },
    { score: diffScore, weight: 0.38 },
  ]);
}

function inferLightPhase(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
): PracticalLightPhase {
  if (window.target === "astro") {
    return "astronomical_night";
  }
  if (practicalKind === "formation_signal") {
    return "deep_night";
  }

  const label = window.label;
  const astro = getWindowAstroSummary(input, window);
  if (label.includes("朝霞")) {
    return "dawn";
  }
  if (label.includes("晚霞") || label.includes("日落")) {
    return "sunset";
  }
  if (
    label.includes("清晨") ||
    label.includes("日出") ||
    (astro?.sunrise && windowOverlapsTime(window, astro.sunrise, 90))
  ) {
    return "sunrise";
  }
  if (astro?.sunset && windowOverlapsTime(window, astro.sunset, 90)) {
    return "sunset";
  }

  const hour = localHourFloat(window.startTime, input.calendarBasis.timezone);
  if (hour >= 4 && hour < 6) {
    return "dawn";
  }
  if (hour >= 6 && hour <= 8) {
    return "sunrise";
  }
  if (hour > 8 && hour < 16) {
    return "daytime";
  }
  if (hour >= 16 && hour <= 20) {
    return "sunset";
  }
  if (hour > 20 && hour <= 22) {
    return "blue_hour";
  }
  return "deep_night";
}

function buildArrivalAdvice(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
): PracticalArrivalAdvice {
  const setupBufferMinutes = setupBufferMinutesForWindow(input, window, practicalKind, lightPhase);
  const recommendedArrivalTime = shiftMinutes(
    window.startTime,
    -setupBufferMinutes,
    input.calendarBasis.timezone,
  );
  const warningZh = arrivalWarning(input, window, practicalKind, recommendedArrivalTime);

  return {
    recommendedArrivalTime,
    recommendedArrivalLabel: arrivalLabelForWindow(
      window,
      practicalKind,
      lightPhase,
      recommendedArrivalTime,
      setupBufferMinutes,
      input.calendarBasis.timezone,
    ),
    setupBufferMinutes,
    reasonZh: arrivalReasonForWindow(window, practicalKind, lightPhase),
    warningZh,
  };
}

function setupBufferMinutesForWindow(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
): number {
  if (practicalKind === "formation_signal") {
    return 0;
  }
  if (window.target === "astro") {
    return isMountainLandscapeSpot(input) ? 90 : 75;
  }
  if (window.target === "cloud_sea" && (lightPhase === "sunrise" || lightPhase === "dawn")) {
    return isMountainLandscapeSpot(input) ? 90 : 75;
  }
  if (window.target === "glow" && (lightPhase === "dawn" || lightPhase === "sunrise")) {
    return isMountainLandscapeSpot(input) ? 75 : 60;
  }
  if (window.target === "glow" && lightPhase === "sunset") {
    return 60;
  }
  if (lightPhase === "sunset") {
    return 60;
  }
  return 45;
}

function arrivalLabelForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
  recommendedArrivalTime: string,
  setupBufferMinutes: number,
  timezone: string,
): string {
  if (practicalKind === "formation_signal") {
    return "若已在山上可观察";
  }
  if (window.target === "astro") {
    return window.label.includes("银河")
      ? `银河窗口前 ${setupBufferMinutes} 分钟完成准备`
      : `天文黑夜前 ${setupBufferMinutes} 分钟完成准备`;
  }
  if (lightPhase === "sunset") {
    return `日落前 ${setupBufferMinutes} 分钟到达`;
  }
  return `${formatClock(recommendedArrivalTime, timezone)} 前到达`;
}

function arrivalReasonForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
): string {
  if (practicalKind === "formation_signal") {
    return "这是云海形成信号，不是有光拍摄窗口；若已在山上，可提前观察云雾上沿和风向变化。";
  }
  if (window.target === "cloud_sea") {
    return "预留上山、找机位和观察云雾变化时间，优先把云海与清晨光线叠加。";
  }
  if (window.target === "glow" && lightPhase === "sunset") {
    return "日落前观察西向云层开口，提前完成机位、前景和包围曝光准备。";
  }
  if (window.target === "glow") {
    return "日出前完成构图、测光和安全检查，等待云缝与色温变化。";
  }
  if (window.target === "astro") {
    return "星空窗口适合夜间拍摄，但需要提前休息、保暖并确认安全通行。";
  }
  return "预留取景、机位确认和天气复核时间。";
}

function arrivalWarning(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  recommendedArrivalTime: string,
): string | undefined {
  if (window.target === "astro") {
    return "夜间拍摄需要提前休息或就近住宿，并准备保暖、头灯和安全撤离方案。";
  }
  if (practicalKind === "formation_signal") {
    return "不建议为无光云海单独熬夜；若从山下出发，需评估交通和体力成本。";
  }

  const arrivalHour = localHourFloat(recommendedArrivalTime, input.calendarBasis.timezone);
  if (arrivalHour < 3) {
    return "时间成本较高，仅建议住在景区附近或已在山上时考虑。";
  }
  if (arrivalHour < 4) {
    return "时间偏早，建议前一晚到达附近或住山上。";
  }
  return undefined;
}

function restPenaltyForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
  arrivalAdvice: PracticalArrivalAdvice,
  timezone: string,
): number {
  if (window.target === "astro") {
    return 0;
  }
  if (practicalKind === "formation_signal") {
    return 34;
  }

  const startHour = localHourFloat(window.startTime, timezone);
  const arrivalHour = localHourFloat(arrivalAdvice.recommendedArrivalTime, timezone);
  if (startHour >= 0 && startHour < 3.5 && lightPhase !== "sunrise" && lightPhase !== "dawn") {
    return 32;
  }
  if (startHour >= 23) {
    return 22;
  }
  if (arrivalHour < 3) {
    return 16;
  }
  if (arrivalHour < 4) {
    return 9;
  }
  return 0;
}

function precipitationRiskForWindow(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
): ForecastTimeWindow["precipitationRisk"] {
  const hours = weatherHoursForWindow(input.hourlyWeather, window.startTime, window.endTime);
  if (hours.length === 0) {
    return undefined;
  }

  return buildPhotographyPrecipitationRisk({
    probability: maxOptional(hours.map((hour) => hour.precipitationProbability ?? undefined)) ?? null,
    amountMm: sumOptional(hours.map((hour) => precipitationAmountMm(hour) ?? undefined)) ?? null,
    affectedWindows: [subjectPriorityLabelForWindow(window, window.practicalKind ?? "shooting_window")],
    weatherTextZh: firstWeatherText(hours),
  });
}

function weatherHoursForWindow(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  startTime: string,
  endTime: string,
): readonly NormalizedHourlyWeather[] {
  const startMs = Date.parse(startTime);
  const endMs = Date.parse(endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  return hourlyWeather.filter((hour) => {
    const timestamp = Date.parse(hour.time);
    return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs;
  });
}

function riskPenaltyForWindow(
  window: ForecastTimeWindow,
  riskFlags: readonly ForecastRiskFlag[],
  precipitationRisk: ForecastTimeWindow["precipitationRisk"],
): number {
  const penalty = riskFlags.reduce((sum, risk) => {
    const base = risk.level === "high" ? 16 : risk.level === "medium" ? 7 : 0;
    if (window.target === "cloud_sea" && risk.key === "whiteout") {
      return sum + base;
    }
    if (risk.key === "wind" || risk.key === "visibility") {
      return sum + base;
    }
    return sum;
  }, 0);
  const rainPenalty =
    precipitationRisk?.rainRiskLevel === "severe"
      ? 28
      : precipitationRisk?.rainRiskLevel === "high"
        ? 20
        : precipitationRisk?.rainRiskLevel === "medium"
          ? 10
          : precipitationRisk?.rainRiskLevel === "low"
            ? 3
            : 0;

  return Math.min(34, penalty + rainPenalty);
}

function weatherBlockerPenaltyForWindow(window: ForecastTimeWindow): number {
  if (window.target !== "astro" || !window.weatherBlockers || window.weatherBlockers.length === 0) {
    return 0;
  }

  const blockerText = window.weatherBlockers.join(" ");
  const severeCloudBlocker =
    /总云量|低云|降水|通透度|能见度|雾|雨|厚云|云层遮挡/.test(blockerText);
  return Math.min(42, window.weatherBlockers.length * 8 + (severeCloudBlocker ? 14 : 0));
}

function clampAstroBlockedPracticalScore(
  window: ForecastTimeWindow,
  score: number,
): number {
  if (window.target !== "astro" || !window.weatherBlockers || window.weatherBlockers.length === 0) {
    return score;
  }

  return Math.min(score, window.weatherBlockers.length >= 2 ? 32 : 42);
}

function humanCostLevelForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
  arrivalAdvice: PracticalArrivalAdvice,
  timezone: string,
): ForecastWindowHumanCostLevel {
  if (practicalKind === "formation_signal") {
    return "high";
  }
  if (window.target === "astro") {
    return "high";
  }

  const arrivalHour = localHourFloat(arrivalAdvice.recommendedArrivalTime, timezone);
  if (arrivalHour < 3 || lightPhase === "deep_night") {
    return "high";
  }
  if (arrivalHour < 4.5 || lightPhase === "dawn") {
    return "medium";
  }
  return "low";
}

function recommendationLevelForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  practicalScore: number,
  humanCostLevel: ForecastWindowHumanCostLevel,
): ForecastWindowRecommendationLevel {
  if (window.target === "astro" && (window.weatherBlockers?.length ?? 0) > 0) {
    return practicalScore >= 38 ? "backup" : "not_recommended";
  }
  if (practicalKind === "formation_signal") {
    return practicalScore >= 42 ? "backup" : "not_recommended";
  }
  if (practicalScore >= 75 && humanCostLevel !== "high") {
    return "recommended";
  }
  if (practicalScore >= 68 && window.target === "astro" && (window.weatherBlockers?.length ?? 0) === 0) {
    return "recommended";
  }
  if (practicalScore >= 58) {
    return "cautious";
  }
  if (practicalScore >= 40) {
    return "backup";
  }
  return "not_recommended";
}

function windowRecommendationRank(
  level: ForecastTimeWindow["recommendationLevel"],
): number {
  if (level === "recommended") {
    return 4;
  }
  if (level === "cautious") {
    return 3;
  }
  if (level === "backup") {
    return 2;
  }
  if (level === "not_recommended") {
    return 1;
  }
  return 0;
}

function lightAvailabilityScore(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
): number {
  if (window.target === "astro") {
    return 90;
  }
  if (practicalKind === "formation_signal") {
    return 18;
  }
  if (window.target === "glow") {
    return lightPhase === "sunset" || lightPhase === "dawn" || lightPhase === "sunrise" ? 96 : 40;
  }
  if (window.target === "cloud_sea") {
    if (lightPhase === "sunrise" || lightPhase === "dawn") {
      return 96;
    }
    if (lightPhase === "sunset") {
      return 82;
    }
    if (lightPhase === "daytime") {
      return 64;
    }
    return 22;
  }
  return lightPhase === "daytime" ? 75 : 55;
}

function subjectPracticalValueScore(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
): number {
  if (window.target === "astro") {
    return window.label.includes("银河") ? 90 : 84;
  }
  if (window.target === "glow") {
    return 92;
  }
  if (window.target === "cloud_sea") {
    if (practicalKind === "formation_signal") {
      return 52;
    }
    if (lightPhase === "sunrise" || lightPhase === "dawn") {
      return 92;
    }
    if (lightPhase === "sunset") {
      return 80;
    }
    return 68;
  }
  return 70;
}

function travelFeasibilityForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  arrivalAdvice: PracticalArrivalAdvice,
  riskFlags: readonly ForecastRiskFlag[],
  precipitationRisk: ForecastTimeWindow["precipitationRisk"],
): number {
  if (practicalKind === "formation_signal") {
    return 42;
  }

  const arrivalHour = localHourFloat(arrivalAdvice.recommendedArrivalTime, defaultTimezone);
  const highRisk =
    riskFlags.some((risk) => risk.level === "high" && risk.key !== "precipitation") ||
    precipitationRisk?.rainRiskLevel === "high" ||
    precipitationRisk?.rainRiskLevel === "severe";
  if (highRisk) {
    return 52;
  }
  if (window.target !== "astro" && arrivalHour < 3) {
    return 48;
  }
  if (window.target !== "astro" && arrivalHour < 4) {
    return 62;
  }
  if (window.target === "astro") {
    return 72;
  }
  return 86;
}

function practicalNoteForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
  lightPhase: PracticalLightPhase,
  conditionScore: number,
  practicalScore: number,
  precipitationRisk: ForecastTimeWindow["precipitationRisk"],
): string {
  if (practicalKind === "formation_signal") {
    return "云海形成信号，不建议为无光云海单独熬夜；若已在山上，可提前观察云雾形成。";
  }
  if (window.target === "astro" && (window.weatherBlockers?.length ?? 0) > 0) {
    const reason = window.weatherBlockers?.[0] ?? "云量、低云或降水条件不支持拍摄";
    return `有天文窗口，但${reason}，暂不建议作为唯一目标。`;
  }
  if (
    precipitationRisk?.rainRiskLevel === "severe" ||
    precipitationRisk?.rainRiskLevel === "high"
  ) {
    return `${precipitationRisk.rainRiskLabelZh}降水风险与该窗口重叠，拍摄可能被打断，优先改为备选或等待短临确认。`;
  }
  if (precipitationRisk?.rainRiskLevel === "medium") {
    return "该窗口有中等降水干扰，适合谨慎等待，不宜作为唯一拍摄目标。";
  }
  if (conditionScore - practicalScore >= 22) {
    return "气象条件较好，但时间成本较高，需要结合住宿、交通和体力评估。";
  }
  if (window.target === "cloud_sea" && (lightPhase === "sunrise" || lightPhase === "dawn")) {
    return "适合守清晨云海，云雾变化与可用光线重叠。";
  }
  if (window.target === "glow") {
    return "霞光窗口本身依赖可用光线，建议提前完成构图并观察云层开口。";
  }
  if (window.target === "astro") {
    return "星空窗口适合夜间拍摄，但需提前休息、保暖并确认安全通行。";
  }
  return "窗口具备拍摄价值，仍需出发前复核最新天气和现场条件。";
}

function subjectPriorityLabelForWindow(
  window: ForecastTimeWindow,
  practicalKind: PracticalWindowKind,
): string {
  if (window.target === "cloud_sea") {
    return practicalKind === "formation_signal" ? "云海形成观察" : "清晨云海";
  }
  if (window.target === "glow") {
    return window.label.includes("晚霞") ? "晚霞" : "朝霞";
  }
  if (window.target === "astro") {
    return window.label.includes("银河") ? "银河" : "星空";
  }
  return "综合拍摄";
}

function backupSubjectLabelForWindow(window: ForecastTimeWindow): string {
  if (window.target === "cloud_sea") {
    return "朝霞、通透层峦或雾景";
  }
  if (window.target === "glow") {
    return "云海、局部光线或云层纹理";
  }
  if (window.target === "astro") {
    return "蓝调夜景、月光地景或次日清晨窗口";
  }
  return "现场光线、云层纹理和安全机位";
}

function getWindowAstroSummary(
  input: ForecastCalculationInput,
  window: ForecastTimeWindow,
): AstroSummary | undefined {
  const date = window.date ?? localDateForTime(window.startTime, input.calendarBasis.timezone);
  return input.astroSummaries.find((summary) => summary.date === date);
}

function windowOverlapsTime(
  window: ForecastTimeWindow,
  time: string,
  toleranceMinutes: number,
): boolean {
  const timestamp = Date.parse(time);
  const start = Date.parse(window.startTime);
  const end = Date.parse(window.endTime);
  if (!Number.isFinite(timestamp) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }

  const toleranceMs = toleranceMinutes * 60 * 1000;
  return end >= timestamp - toleranceMs && start <= timestamp + toleranceMs;
}

function isMountainLandscapeSpot(input: ForecastCalculationInput): boolean {
  const profile = input.terrainAnalysis.terrainProfile;
  return (
    profile.locationElevation >= 900 ||
    profile.elevationDiff5km >= 500 ||
    profile.terrainCloudSeaPotential === "high"
  );
}

function shiftMinutes(time: string, minutes: number, timezone: string): string {
  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp)) {
    return time;
  }

  return formatZonedIso(new Date(timestamp + minutes * 60 * 1000), timezone);
}

function localHourFloat(time: string, timezone: string): number {
  if (!Number.isFinite(Date.parse(time))) {
    return 0;
  }

  const zoned = formatZonedIso(time, timezone);
  const hour = Number(zoned.slice(11, 13));
  const minute = Number(zoned.slice(14, 16));
  return hour + minute / 60;
}

function formatClock(time: string, timezone: string): string {
  if (!Number.isFinite(Date.parse(time))) {
    return time;
  }

  return formatZonedIso(time, timezone).slice(11, 16);
}

function buildGlowWindows(glowAnalysis: GlowAnalysisResult): readonly ForecastTimeWindow[] {
  return glowAnalysis.bestGlowWindows.map((window) => ({
    label: `${window.labelZh} ${formatChineseTimeRange(window.start, window.end)}`,
    date: window.date,
    startTime: window.start,
    endTime: window.end,
    score: window.score,
    target: "glow",
  }));
}

function buildAstroWindowsFromAnalysis(
  astroAnalysis: AstroAnalysisResult,
): readonly ForecastTimeWindow[] {
  const astronomicalNightWindows = astroAnalysis.astronomicalNightWindows.map((window) => ({
    label: `天文黑夜 ${formatChineseTimeRange(window.start, window.end)}`,
    date: window.date,
    startTime: window.start,
    endTime: window.end,
    score: window.score,
    target: "astro" as const,
    weatherBlockers: astroAnalysis.dailyAstro.find((day) => day.date === window.date)
      ?.weatherBlockers,
  }));
  const recommendedMilkyWayWindows = astroAnalysis.recommendedMilkyWayWindows.map((window) => ({
    label: `推荐银河窗口 ${formatChineseTimeRange(window.start, window.end)}`,
    date: window.date,
    startTime: window.start,
    endTime: window.end,
    score: window.score,
    target: "astro" as const,
    weatherBlockers: astroAnalysis.dailyAstro.find((day) => day.date === window.date)
      ?.weatherBlockers,
  }));

  return [...astronomicalNightWindows, ...recommendedMilkyWayWindows];
}

function buildCloudSeaWindows(
  cloudSeaAnalysis: CloudSeaAnalysisResult,
): readonly ForecastTimeWindow[] {
  return cloudSeaAnalysis.bestCloudSeaWindows.map((window) => ({
    label: window.label,
    date: window.date,
    startTime: window.startTime,
    endTime: window.endTime,
    score: window.score,
    target: "cloud_sea",
  }));
}

function buildTargetDailyBreakdown(
  input: ForecastCalculationInput,
  scores: ForecastCalculationResult["scores"],
  windows: readonly ForecastTimeWindow[],
  cloudSeaAnalysis: CloudSeaAnalysisResult,
  glowAnalysis: GlowAnalysisResult,
  astroAnalysis: AstroAnalysisResult,
): readonly TargetDailyBreakdown[] {
  return input.calendarBasis.targetDates.map((date) => {
    const dayWindows = windowsForCalendarDate(windows, date, input.calendarBasis.timezone);
    const dailyWeather = input.dailyWeather.find((day) => day.date === date);
    const astroSummary = input.astroSummaries.find((summary) => summary.date === date);
    const sunriseWindow =
      firstWindowByLabel(dayWindows, "朝霞") ?? firstWindowByLabel(dayWindows, "日出后");
    const sunsetWindow =
      firstWindowByLabel(dayWindows, "晚霞") ??
      firstWindowByLabel(dayWindows, "日落前") ??
      firstWindowByLabel(dayWindows, "霞光余晖");
    const cloudSeaWindow = firstWindowByLabel(dayWindows, "清晨云海窗口");
    const astronomicalNightWindow = firstWindowByLabel(dayWindows, "天文黑夜");
    const milkyWayWindow =
      firstWindowByLabel(dayWindows, "推荐银河窗口") ?? firstWindowByLabel(dayWindows, "银河窗口");
    const dailyCloudSea = cloudSeaAnalysis.dailyCloudSea.find((day) => day.date === date);
    const dailyGlow = glowAnalysis.dailyGlow.find((day) => day.date === date);
    const dailyAstro = astroAnalysis.dailyAstro.find((day) => day.date === date);
    const dailyAstroStarsMetric: ForecastDailyMetric | undefined = dailyAstro
      ? {
          label: "星空可拍性",
          score: dailyAstro.astroPracticalScore,
          detail:
            dailyAstro.weatherBlockers.length > 0
              ? "天文窗口存在，但云量/降水/低云不支持拍摄。"
              : "天文窗口与天气条件共同支持星空拍摄。",
          window: astronomicalNightWindow,
        }
      : undefined;
    const dailyAstroMilkyWayMetric: ForecastDailyMetric | undefined = dailyAstro
      ? {
          label: dailyAstro.astronomicalWindowAvailable ? "银河/天文窗口可拍性" : "银河可拍性",
          score: dailyAstro.astroPracticalScore,
          detail:
            dailyAstro.weatherBlockers.length > 0
              ? "星空银河仅作为备选，不建议为此熬夜。"
              : "银河窗口已叠加月光、云量、低云、降水和透明度。",
          window: milkyWayWindow,
        }
      : undefined;

    return {
      date,
      sunriseGlow: dailyGlow
        ? {
            label: "朝霞机会",
            score: dailyGlow.sunriseScore,
            detail: dailyGlow.keyReason,
            window: sunriseWindow,
          }
        : metricFromWindow(
            sunriseWindow,
            "朝霞机会",
            "日出前后中高云、降水和地形遮挡共同影响朝霞表现。",
            scores.sunriseGlow.score,
          ),
      sunsetGlow: dailyGlow
        ? {
            label: "晚霞机会",
            score: dailyGlow.sunsetScore,
            detail: dailyGlow.keyReason,
            window: sunsetWindow,
          }
        : metricFromWindow(
            sunsetWindow,
            "晚霞机会",
            "日落前后中高云承载、低云遮挡和降水风险共同影响晚霞表现。",
            scores.sunsetGlow.score,
          ),
      cloudSea: dailyCloudSea
        ? {
            label: "清晨云海机会",
            score: dailyCloudSea.opportunityScore,
            detail: dailyCloudSea.keyReason,
            window: cloudSeaWindow,
          }
        : metricFromWindow(
            cloudSeaWindow,
            "清晨云海机会",
            "清晨湿度、低云、风速、露点差和地形落差共同影响云海形成。",
            scores.cloudSea.score,
          ),
      whiteoutRisk: dailyCloudSea
        ? {
            label: "白墙风险",
            score: dailyCloudSea.whiteoutRiskScore,
            detail: dailyCloudSea.riskNote,
            window: cloudSeaWindow,
          }
        : buildWhiteoutMetricForDate(input, date),
      stars: dailyAstroStarsMetric ?? metricFromWindow(
        astronomicalNightWindow,
        "每晚观星条件",
        "天文黑夜内云量、湿度、能见度和月光共同影响星空可见度。",
        scores.stars.score,
      ),
      milkyWay: dailyAstroMilkyWayMetric ?? metricFromWindow(
        milkyWayWindow,
        "银河窗口",
        "银河窗口仍需结合云量、月光、光污染和地形遮挡。",
        scores.milkyWay.score,
      ),
      transparency: buildTransparencyMetricForDate(input, date, scores.transparency.score),
      astroSummary,
      terrainSummary: input.terrainAnalysis.terrainProfile.terrainNoteZh,
      weatherSummary: dailyWeather?.weatherSummary,
    };
  });
}

function buildDailySummaries(
  input: ForecastCalculationInput,
  breakdowns: readonly TargetDailyBreakdown[],
  windows: readonly ForecastTimeWindow[],
): readonly ForecastDailySummary[] {
  return breakdowns.map((breakdown) => {
    const keyWindows = pickDailyWindows(
      input.target,
      windowsForCalendarDate(windows, breakdown.date, input.calendarBasis.timezone),
    );
    const score = pickDailyScore(input.target, breakdown, keyWindows, input);
    const riskFlags = buildDailyRiskFlags(input, breakdown);
    const calendarDay = input.calendarBasis.calendarDays.find((day) => day.date === breakdown.date);

    return {
      date: breakdown.date,
      dateLabelZh: calendarDay?.dateLabel ?? breakdown.date,
      lunarDateText: calendarDay?.lunarDateText,
      score,
      recommendationLabel: forecastRecommendationLabels[classifyRecommendationLevel(score)],
      target: input.target,
      weather: buildDailyWeatherSummary(input, breakdown.date),
      keyWindows,
      riskFlags,
      shortAdvice: buildDailyShortAdvice(input.target, score, riskFlags, keyWindows),
    };
  });
}

function buildDailyWeatherSummary(
  input: ForecastCalculationInput,
  date: string,
): ForecastDailyWeatherSummary | undefined {
  const dayWeather = input.dailyWeather.find((day) => day.date === date);
  const dayHours = hoursForDate(input.hourlyWeather, date, input.calendarBasis.timezone);

  if (!dayWeather && dayHours.length === 0) {
    return undefined;
  }

  return {
    weatherTextZh: dayWeather?.weatherSummary ?? firstWeatherText(dayHours),
    tempMin: dayWeather?.tempMin ?? minOptional(dayHours.map((hour) => hour.temperature)),
    tempMax: dayWeather?.tempMax ?? maxOptional(dayHours.map((hour) => hour.temperature)),
    rawTempMin: dayWeather?.rawTempMin ?? minOptional(dayHours.map((hour) => hour.rawTemperature)),
    rawTempMax: dayWeather?.rawTempMax ?? maxOptional(dayHours.map((hour) => hour.rawTemperature)),
    elevationAdjustedTempMin:
      dayWeather?.elevationAdjustedTempMin ??
      minOptional(dayHours.map((hour) => hour.elevationAdjustedTemperature)),
    elevationAdjustedTempMax:
      dayWeather?.elevationAdjustedTempMax ??
      maxOptional(dayHours.map((hour) => hour.elevationAdjustedTemperature)),
    temperatureCorrectionApplied:
      dayWeather?.temperatureAdjustment?.correctionApplied ??
      dayHours.some((hour) => hour.temperatureAdjustment?.correctionApplied),
    temperatureCorrectionCelsius:
      dayWeather?.temperatureAdjustment?.correctionCelsius ??
      averageOptional(dayHours.map((hour) => hour.temperatureAdjustment?.correctionCelsius)),
    temperatureCorrectionReason:
      dayWeather?.temperatureAdjustment?.correctionReason ??
      dayHours.find((hour) => hour.temperatureAdjustment)?.temperatureAdjustment?.correctionReason,
    selectedSpotElevationMeters:
      dayWeather?.temperatureAdjustment?.selectedSpotElevationMeters ??
      dayHours.find((hour) => hour.temperatureAdjustment)?.temperatureAdjustment
        ?.selectedSpotElevationMeters,
    providerElevationMeters:
      dayWeather?.temperatureAdjustment?.providerElevationMeters ??
      dayWeather?.providerElevationMeters ??
      dayHours.find((hour) => hour.temperatureAdjustment?.providerElevationMeters)
        ?.temperatureAdjustment?.providerElevationMeters,
    providerElevationKnown:
      dayWeather?.temperatureAdjustment?.providerElevationKnown ??
      dayHours.find((hour) => hour.temperatureAdjustment)?.temperatureAdjustment
        ?.providerElevationKnown,
    feelsLikeMin: minOptional(dayHours.map((hour) => hour.feelsLike ?? undefined)),
    feelsLikeMax: maxOptional(dayHours.map((hour) => hour.feelsLike ?? undefined)),
    precipitationProbability:
      dayWeather?.precipitationProbability ??
      maxOptional(dayHours.map((hour) => hour.precipitationProbability ?? undefined)) ??
      null,
    precipitation:
      dayWeather?.precipitation ??
      dayWeather?.precipitationAmountMm ??
      sumOptional(dayHours.map((hour) => precipitationAmountMm(hour) ?? undefined)),
    precipitationAmountMm:
      dayWeather?.precipitationAmountMm ??
      dayWeather?.precipitation ??
      sumOptional(dayHours.map((hour) => precipitationAmountMm(hour) ?? undefined)),
    rainAmountMm:
      dayWeather?.rainAmountMm ??
      sumOptional(dayHours.map((hour) => hour.rainAmountMm ?? undefined)),
    snowAmountMm:
      dayWeather?.snowAmountMm ??
      sumOptional(dayHours.map((hour) => hour.snowAmountMm ?? undefined)),
    precipitationType: dayWeather?.precipitationType ?? aggregateDailyPrecipitationType(dayHours),
    precipitationRisk:
      dayWeather?.precipitationRisk ??
      buildPhotographyPrecipitationRisk({
        probability:
          dayWeather?.precipitationProbability ??
          maxOptional(dayHours.map((hour) => hour.precipitationProbability ?? undefined)) ??
          null,
        amountMm:
          dayWeather?.precipitationAmountMm ??
          dayWeather?.precipitation ??
          sumOptional(dayHours.map((hour) => precipitationAmountMm(hour) ?? undefined)) ??
          null,
        affectedWindows: affectedPrecipitationWindows(dayHours),
        weatherTextZh: dayWeather?.weatherSummary ?? firstWeatherText(dayHours),
      }),
    windSpeed: averageOptional(dayHours.map((hour) => hour.windSpeed)),
    windGust: maxOptional(dayHours.map((hour) => hour.windGust ?? undefined)),
    windDirection: averageWindDirection(dayHours.map((hour) => hour.windDirection ?? undefined)),
    humidity: averageOptional(dayHours.map((hour) => hour.humidity)),
    visibility: averageOptional(dayHours.map((hour) => hour.visibility ?? undefined)),
    rawVisibilityKm:
      dayWeather?.rawVisibilityKm ??
      averageOptional(dayHours.map((hour) => hour.rawVisibilityKm ?? hour.visibility ?? undefined)),
    photographyTransparencyScore:
      dayWeather?.photographyTransparencyScore ??
      averageOptional(dayHours.map((hour) => hour.photographyTransparencyScore)),
    transparencyGrade:
      dayWeather?.transparencyGrade ??
      transparencyGradeFromScore(
        averageOptional(dayHours.map((hour) => hour.photographyTransparencyScore)) ??
          calculatePhotographyTransparencyScore(dayHours[0]),
      ),
    cloudFogObstructionRisk: dayWeather?.cloudFogObstructionRisk ?? aggregateCloudFogRisk(dayHours),
    exposedRidgeWindRisk: dayWeather?.exposedRidgeWindRisk ?? aggregateRidgeWindRisk(dayHours),
    dewPointSpread: averageOptional(dayHours.map((hour) => hour.dewPointSpread ?? undefined)),
    cloudTotal: averageOptional(dayHours.map((hour) => hour.cloudTotal)),
    cloudLow: averageOptional(dayHours.map((hour) => hour.cloudLow ?? undefined)),
    cloudMid: averageOptional(dayHours.map((hour) => hour.cloudMid ?? undefined)),
    cloudHigh: averageOptional(dayHours.map((hour) => hour.cloudHigh ?? undefined)),
  };
}

function aggregateDailyPrecipitationType(
  hours: readonly NormalizedHourlyWeather[],
): ForecastDailyWeatherSummary["precipitationType"] {
  const types = new Set(hours.map((hour) => hour.precipitationType ?? "unknown"));
  if (types.has("mixed") || (types.has("rain") && types.has("snow"))) {
    return "mixed";
  }
  if (types.has("snow")) {
    return "snow";
  }
  if (types.has("rain")) {
    return "rain";
  }
  if (types.has("unknown")) {
    return "unknown";
  }
  return "none";
}

function aggregateCloudFogRisk(
  hours: readonly NormalizedHourlyWeather[],
): ForecastDailyWeatherSummary["cloudFogObstructionRisk"] {
  if (hours.some((hour) => hour.cloudFogObstructionRisk === "high")) {
    return "high";
  }
  if (hours.some((hour) => hour.cloudFogObstructionRisk === "medium")) {
    return "medium";
  }
  if (hours.length > 0) {
    return "low";
  }
  return undefined;
}

function aggregateRidgeWindRisk(
  hours: readonly NormalizedHourlyWeather[],
): ForecastDailyWeatherSummary["exposedRidgeWindRisk"] {
  if (hours.some((hour) => hour.exposedRidgeWindRisk === "high")) {
    return "high";
  }
  if (hours.some((hour) => hour.exposedRidgeWindRisk === "medium")) {
    return "medium";
  }
  if (hours.length > 0) {
    return "low";
  }
  return undefined;
}

function affectedPrecipitationWindows(
  hours: readonly NormalizedHourlyWeather[],
): readonly string[] {
  const affected = new Set<string>();
  for (const hour of hours) {
    const level = precipitationRiskLevel({
      probability: hour.precipitationProbability,
      amountMm: precipitationAmountMm(hour),
    });
    if (level === "none") {
      continue;
    }
    const localHour = getShanghaiHour(hour.time);
    if (localHour >= 4 && localHour <= 9) {
      affected.add("清晨窗口");
    } else if (localHour >= 16 && localHour <= 20) {
      affected.add("傍晚窗口");
    } else if (localHour >= 21 || localHour <= 3) {
      affected.add("夜间窗口");
    } else {
      affected.add("日间窗口");
    }
  }
  return [...affected];
}

function metricFromWindow(
  window: ForecastTimeWindow | undefined,
  label: string,
  detail: string,
  fallbackScore: number,
): ForecastDailyMetric | undefined {
  if (!window) {
    return undefined;
  }

  return {
    label,
    score: window.score || fallbackScore,
    detail,
    window,
  };
}

function buildWhiteoutMetricForDate(
  input: ForecastCalculationInput,
  date: string,
): ForecastDailyMetric | undefined {
  const window = morningHoursForDate(input.hourlyWeather, date, input.calendarBasis.timezone);
  if (window.length === 0) {
    return undefined;
  }

  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const visibility = averageHourly(window, (hour) => hour.visibility);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);
  const precipitationAmount = averageHourly(window, (hour) => precipitationAmountMm(hour));
  const score = averageWeightedScore([
    { score: lowCloud, weight: 0.34 },
    { score: humidity, weight: 0.26 },
    { score: clampScore(100 - visibility * 8), weight: 0.28 },
    {
      score: precipitationRiskScore({
        probability: precipitationProbability,
        amountMm: precipitationAmount,
      }),
      weight: 0.12,
    },
  ]);

  return {
    label: "白墙风险",
    score,
    detail: `清晨低云约 ${Math.round(lowCloud)}%，湿度约 ${Math.round(
      humidity,
    )}%，能见度约 ${Math.round(visibility)} 公里。数值越高，山顶被低云包裹的风险越高。`,
  };
}

function buildTransparencyMetricForDate(
  input: ForecastCalculationInput,
  date: string,
  fallbackScore: number,
): ForecastDailyMetric | undefined {
  const dayHours = hoursForDate(input.hourlyWeather, date, input.calendarBasis.timezone);
  if (dayHours.length === 0) {
    return undefined;
  }

  const visibility = averageHourly(dayHours, (hour) => hour.visibility);
  const humidity = averageHourly(dayHours, (hour) => hour.humidity);
  const precipitationProbability = averageHourly(dayHours, (hour) => hour.precipitationProbability);
  const precipitationAmount = averageHourly(dayHours, (hour) => precipitationAmountMm(hour));
  const score = clampScore(
    averageHourly(dayHours, (hour) => calculatePhotographyTransparencyScore(hour)) ||
      averageWeightedScore([
        { score: clampScore(Math.min(visibility, 40) * 2.4), weight: 0.36 },
        { score: 100 - humidity, weight: 0.22 },
        {
          score:
            100 -
            precipitationRiskScore({
              probability: precipitationProbability,
              amountMm: precipitationAmount,
            }),
          weight: 0.26,
        },
        { score: 100 - averageHourly(dayHours, (hour) => hour.cloudLow) * 0.55, weight: 0.16 },
      ]) ||
      fallbackScore,
  );

  return {
    label: "通透度",
    score,
    detail: `当日平均能见度约 ${Math.round(visibility)} 公里，湿度约 ${Math.round(
      humidity,
    )}%，降水风险已结合概率和预计降水量判断。`,
  };
}

function buildDailyRiskFlags(
  input: ForecastCalculationInput,
  breakdown: TargetDailyBreakdown,
): readonly ForecastRiskFlag[] {
  const flags: ForecastRiskFlag[] = [];
  const dailyWeather = input.dailyWeather.find((day) => day.date === breakdown.date);
  const dayHours = hoursForDate(input.hourlyWeather, breakdown.date, input.calendarBasis.timezone);
  const whiteoutRisk = breakdown.whiteoutRisk?.score ?? 0;
  const precipitationDecision =
    dailyWeather?.precipitationRisk ??
    buildPhotographyPrecipitationRisk({
      probability:
        dailyWeather?.precipitationProbability ??
        maxOptional(dayHours.map((hour) => hour.precipitationProbability ?? undefined)) ??
        null,
      amountMm:
        precipitationAmountMm(dailyWeather) ??
        sumOptional(dayHours.map((hour) => precipitationAmountMm(hour) ?? undefined)) ??
        null,
      affectedWindows: affectedPrecipitationWindows(dayHours),
      weatherTextZh: dailyWeather?.weatherSummary ?? firstWeatherText(dayHours),
    });
  const precipitationRisk = precipitationDecision.rainRiskLevel;

  if (whiteoutRisk >= 70) {
    flags.push({
      key: "whiteout",
      label: "白墙风险",
      level: "high",
      description: "该日清晨低云、湿度和能见度组合显示白墙风险偏高。",
    });
  } else if (whiteoutRisk >= 50) {
    flags.push({
      key: "whiteout",
      label: "白墙风险",
      level: "medium",
      description: "该日清晨可能出现局部低云遮挡，需要现场复核云底高度。",
    });
  }

  if (
    precipitationRisk === "medium" ||
    precipitationRisk === "high" ||
    precipitationRisk === "severe"
  ) {
    flags.push({
      key: "precipitation",
      label: "降水干扰",
      level: precipitationRisk === "high" || precipitationRisk === "severe" ? "high" : "medium",
      description: precipitationDecision.recommendationZh,
    });
  }

  return flags;
}

function pickDailyScore(
  target: ForecastTarget,
  breakdown: TargetDailyBreakdown,
  keyWindows: readonly ForecastTimeWindow[],
  input: ForecastCalculationInput,
): number {
  if (target === "cloud_sea") {
    if (typeof breakdown.cloudSea?.score === "number") {
      return breakdown.cloudSea.score;
    }

    return input.terrainSummary.terrainCloudSeaPotential === "high"
      ? clampScore(breakdown.transparency?.score ?? 55)
      : 45;
  }

  if (target === "glow") {
    return maxDefined([
      breakdown.sunriseGlow?.score,
      breakdown.sunsetGlow?.score,
      breakdown.transparency?.score,
    ]);
  }

  if (target === "astro") {
    return maxDefined([
      breakdown.stars?.score,
      breakdown.milkyWay?.score,
      breakdown.transparency?.score,
    ]);
  }

  if (keyWindows.length > 0) {
    return clampScore(
      keyWindows.slice(0, 3).reduce((sum, window) => sum + window.score, 0) /
        Math.min(3, keyWindows.length),
    );
  }

  return maxDefined([
    breakdown.cloudSea?.score,
    breakdown.sunriseGlow?.score,
    breakdown.sunsetGlow?.score,
    breakdown.stars?.score,
    breakdown.milkyWay?.score,
    breakdown.transparency?.score,
  ]);
}

function pickDailyWindows(
  target: ForecastTarget,
  windows: readonly ForecastTimeWindow[],
): readonly ForecastTimeWindow[] {
  const filtered =
    target === "general"
      ? windows
      : target === "cloud_sea"
        ? windows.filter((window) => window.target === "cloud_sea")
        : target === "glow"
          ? windows.filter((window) => window.target === "glow")
          : windows.filter((window) => window.target === "astro");

  return [...filtered]
    .sort((left, right) => {
      const rightScore = right.practicalScore ?? right.score;
      const leftScore = left.practicalScore ?? left.score;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return Date.parse(left.startTime) - Date.parse(right.startTime);
    })
    .filter((window, _index, sorted) => {
      if (target !== "general") {
        return true;
      }

      const hasShootableWindow = sorted.some(
        (candidate) => candidate.practicalKind !== "formation_signal",
      );
      return !hasShootableWindow || window.practicalKind !== "formation_signal";
    })
    .slice(0, target === "general" ? 3 : 2);
}

function buildDailyShortAdvice(
  target: ForecastTarget,
  score: number,
  riskFlags: readonly ForecastRiskFlag[],
  keyWindows: readonly ForecastTimeWindow[],
): string {
  if (riskFlags.some((risk) => risk.level === "high")) {
    return "主要风险偏高，建议把该日作为备选并等待真实天气复核。";
  }

  if (keyWindows.length === 0) {
    return "暂未形成明确高分窗口，建议继续观察后续数据。";
  }

  if (target === "cloud_sea") {
    return score >= 65 ? "清晨云海窗口值得等待。" : "可短时等待，但不建议只押云海。";
  }

  if (target === "glow") {
    return score >= 65 ? "朝霞或晚霞具备等待价值。" : "霞光信号偏保守，关注局部光线。";
  }

  if (target === "astro") {
    return score >= 65 ? "夜间窗口可纳入计划。" : "星空银河条件偏保守，建议准备夜景备选。";
  }

  const bestWindow = keyWindows[0];
  if (bestWindow?.practicalKind === "formation_signal") {
    return "夜间云海只算形成信号，不建议单独熬夜等待无光云海。";
  }
  if (bestWindow?.arrivalAdvice?.warningZh) {
    return `${bestWindow.subjectPriorityLabel ?? "最佳窗口"}可关注，${bestWindow.arrivalAdvice.warningZh}`;
  }
  if (bestWindow?.arrivalAdvice) {
    return `${bestWindow.subjectPriorityLabel ?? "最佳窗口"}可优先安排，${bestWindow.arrivalAdvice.recommendedArrivalLabel}。`;
  }

  return score >= 65 ? "当天有可优先关注的拍摄窗口。" : "当天更适合作为备选或机动观察。";
}

function transparencyGradeLabel(
  grade: ReturnType<typeof transparencyGradeFromScore>,
): "优秀" | "较好" | "一般" | "较差" {
  if (grade === "excellent") {
    return "优秀";
  }
  if (grade === "good") {
    return "较好";
  }
  if (grade === "fair") {
    return "一般";
  }
  return "较差";
}

function firstWindowByLabel(
  windows: readonly ForecastTimeWindow[],
  prefix: string,
): ForecastTimeWindow | undefined {
  return windows.find((window) => window.label.startsWith(prefix));
}

function windowsForCalendarDate(
  windows: readonly ForecastTimeWindow[],
  date: string,
  timezone: string,
): readonly ForecastTimeWindow[] {
  return windows.filter(
    (window) => (window.date ?? localDateForTime(window.startTime, timezone)) === date,
  );
}

function morningHoursForDate(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  date: string,
  timezone: string,
): readonly NormalizedHourlyWeather[] {
  return hoursForDate(hourlyWeather, date, timezone).filter((hour) => {
    const localHour = getHourInTimezone(hour.time, timezone);
    return localHour >= 3 && localHour <= 10;
  });
}

function hoursForDate(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  date: string,
  timezone: string,
): readonly NormalizedHourlyWeather[] {
  return hourlyWeather.filter((hour) => localDateForTime(hour.time, timezone) === date);
}

function localDateForTime(time: string, timezone: string): string {
  if (!Number.isFinite(Date.parse(time))) {
    return "";
  }

  return formatZonedIso(time, timezone).slice(0, 10);
}

function firstWeatherText(hours: readonly NormalizedHourlyWeather[]): string | undefined {
  return hours.find((hour) => hour.weatherTextZh)?.weatherTextZh ?? undefined;
}

function averageOptional(values: readonly (number | undefined)[]): number | undefined {
  const usableValues = finiteValues(values);
  if (usableValues.length === 0) {
    return undefined;
  }

  return usableValues.reduce((sum, value) => sum + value, 0) / usableValues.length;
}

function minOptional(values: readonly (number | undefined)[]): number | undefined {
  const usableValues = finiteValues(values);
  return usableValues.length > 0 ? Math.min(...usableValues) : undefined;
}

function maxOptional(values: readonly (number | undefined)[]): number | undefined {
  const usableValues = finiteValues(values);
  return usableValues.length > 0 ? Math.max(...usableValues) : undefined;
}

function sumOptional(values: readonly (number | undefined)[]): number | undefined {
  const usableValues = finiteValues(values);
  if (usableValues.length === 0) {
    return undefined;
  }

  return usableValues.reduce((sum, value) => sum + value, 0);
}

function averageWindDirection(values: readonly (number | undefined)[]): number | undefined {
  const usableValues = finiteValues(values);
  if (usableValues.length === 0) {
    return undefined;
  }

  const radians = usableValues.map((value) => (value * Math.PI) / 180);
  const x = radians.reduce((sum, value) => sum + Math.cos(value), 0) / radians.length;
  const y = radians.reduce((sum, value) => sum + Math.sin(value), 0) / radians.length;
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;

  return (degrees + 360) % 360;
}

function finiteValues(values: readonly (number | undefined)[]): readonly number[] {
  return values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function maxDefined(values: readonly (number | undefined)[]): number {
  const usableValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  return usableValues.length > 0 ? Math.max(...usableValues.map(clampScore)) : 0;
}

function buildRiskFlags(
  input: ForecastCalculationInput,
  whiteoutRisk: ForecastScore,
): readonly ForecastRiskFlag[] {
  const flags: ForecastRiskFlag[] = [];
  const maxPrecipitationRisk = Math.max(
    ...input.hourlyWeather.map((hour) =>
      precipitationRiskScore({
        probability: hour.precipitationProbability,
        amountMm: precipitationAmountMm(hour),
      }),
    ),
    0,
  );
  const maxWind = Math.max(
    ...input.hourlyWeather.map((hour) => hour.windGust ?? hour.windSpeed),
    0,
  );
  const minVisibility = Math.min(...input.hourlyWeather.map((hour) => hour.visibility ?? 99), 99);

  if (whiteoutRisk.score >= 70) {
    flags.push({
      key: "whiteout",
      label: "白墙风险",
      level: "high",
      description: "低云、湿度和能见度组合显示山顶被云雾包裹的概率偏高。",
    });
  } else if (whiteoutRisk.score >= 50) {
    flags.push({
      key: "whiteout",
      label: "白墙风险",
      level: "medium",
      description: "局部时段可能出现低云遮挡，需要现场观察云底变化。",
    });
  }

  if (maxPrecipitationRisk >= 55) {
    flags.push({
      key: "precipitation",
      label: "降水干扰",
      level: maxPrecipitationRisk >= 75 ? "high" : "medium",
      description: "部分时段存在降水概率或降水量信号，会影响器材防护、通行和画面通透度。",
    });
  }

  if (maxWind >= 11) {
    flags.push({
      key: "wind",
      label: "阵风偏强",
      level: maxWind >= 15 ? "high" : "medium",
      description: "山顶阵风偏强，三脚架稳定性和人员安全需要保守评估。",
    });
  }

  if (minVisibility <= 6) {
    flags.push({
      key: "visibility",
      label: "能见度偏低",
      level: minVisibility <= 3 ? "high" : "medium",
      description: "最低能见度偏低，远景层次、云海边界和霞光细节可能受影响。",
    });
  }

  return flags;
}

function buildKeyReasons(
  input: ForecastCalculationInput,
  scores: ForecastCalculationResult["scores"],
): readonly string[] {
  return [
    `地形参考：机位海拔约 ${Math.round(input.terrainAnalysis.terrainProfile.locationElevation)} 米，5公里高差约 ${Math.round(input.terrainAnalysis.terrainProfile.elevationDiff5km)} 米。`,
    ...scores.cloudSea.reasons.slice(0, 1),
    ...scores.sunriseGlow.reasons.slice(0, 1),
    ...scores.transparency.reasons.slice(0, 1),
    ...scores.stars.reasons.slice(0, 1),
  ].slice(0, 5);
}

function buildPhotographyAdvice(
  input: ForecastCalculationInput,
  scores: ForecastCalculationResult["scores"],
  riskFlags: readonly ForecastRiskFlag[],
  bestWindows: readonly ForecastTimeWindow[],
): readonly string[] {
  const advice: string[] = [];
  const bestWindow = bestWindows.find((window) => window.practicalKind !== "formation_signal");

  if (input.target === "cloud_sea" || input.target === "general") {
    advice.push(
      scores.cloudSea.score >= 65
        ? "建议优先守清晨云海窗口，提前到达高点观察云雾上沿和风向变化。"
        : "云海信号不算稳定，建议把朝霞、山脊层次或延时素材作为备选目标。",
    );
  }
  if (input.target === "glow" || input.target === "general") {
    advice.push(
      Math.max(scores.sunriseGlow.score, scores.sunsetGlow.score) >= 65
        ? "霞光窗口具备等待价值，建议提前完成机位和前景构图。"
        : "霞光条件一般，建议降低对大面积烧云的预期，关注局部光线和云缝。",
    );
  }
  if (input.target === "astro" || input.target === "general") {
    advice.push(
      Math.max(scores.stars.score, scores.milkyWay.score) >= 65
        ? "夜间条件可纳入计划，注意避开月光方向并准备保暖和头灯。"
        : "星空银河条件偏保守，建议把夜景作为备选，不单独为银河窗口长途奔袭。",
    );
  }
  if (input.target === "general" && bestWindow?.arrivalAdvice) {
    advice.push(
      `${bestWindow.subjectPriorityLabel ?? "最佳窗口"}：${bestWindow.arrivalAdvice.recommendedArrivalLabel}，${bestWindow.arrivalAdvice.reasonZh}`,
    );
    if (bestWindow.arrivalAdvice.warningZh) {
      advice.push(bestWindow.arrivalAdvice.warningZh);
    }
    if (bestWindow.target === "cloud_sea" && scores.cloudSea.score >= 70) {
      advice.push(
        scores.sunriseGlow.score >= 50
          ? "优先守云海，朝霞作为加分项；不要把无光云海当作单独熬夜目标。"
          : "优先守云海，若霞光不足则转向通透层峦、雾景和局部光线。",
      );
    }
    if (bestWindow.target === "glow" && bestWindow.lightPhase === "sunset") {
      advice.push("日落前 60 分钟到达，优先观察西向云层开口和低云遮挡。");
    }
    if (bestWindow.target === "astro") {
      advice.push("星空窗口适合夜间拍摄，但需要提前休息、就近住宿和保暖准备。");
    }
  }
  if (riskFlags.some((flag) => flag.level === "high")) {
    advice.push("存在高等级风险提示，准备防水、防滑、保暖和备选机位，并复核道路和景区开放信息。");
  }
  advice.push(
    input.weatherDataMode === "real"
      ? "当前评分已使用真实天气源参与计算，出行前仍建议核对最新预警、道路和景区开放信息。"
      : "当前结果基于演示天气数据生成，仅用于体验分析流程；正式天气数据源启用后可用于出行前复核。",
  );

  return advice;
}

function buildSummary(
  input: ForecastCalculationInput,
  overallScore: number,
  recommendationLabel: string,
  scores: ForecastCalculationResult["scores"],
  bestWindows: readonly ForecastTimeWindow[],
): string {
  const targetPhrase =
    input.target === "cloud_sea"
      ? "云海"
      : input.target === "glow"
        ? "朝霞晚霞"
        : input.target === "astro"
          ? "星空银河"
          : "综合拍摄";
  const scoreLabel = input.weatherDataMode === "real" ? "评分" : "演示评分";

  if (input.target === "cloud_sea") {
    return `${input.place.name}${targetPhrase}${scoreLabel}为 ${overallScore} 分，建议等级为“${recommendationLabel}”。云海机会 ${scores.cloudSea.score} 分，白墙风险 ${scores.whiteoutRisk.score} 分，清晨窗口需重点复核低云、能见度和风速。`;
  }

  if (input.target === "general") {
    const bestWindow = bestWindows.find((window) => window.practicalKind !== "formation_signal");
    const bestWindowText = bestWindow
      ? `最佳窗口优先按可执行性排序：${bestWindow.label}。`
      : "暂未形成明确可执行拍摄窗口。";
    return `${input.place.name}${targetPhrase}${scoreLabel}为 ${overallScore} 分，建议等级为“${recommendationLabel}”。${bestWindowText}云海 ${scores.cloudSea.score} 分，霞光最高 ${Math.max(scores.sunriseGlow.score, scores.sunsetGlow.score)} 分，通透度 ${scores.transparency.score} 分。`;
  }

  return `${input.place.name}${targetPhrase}${scoreLabel}为 ${overallScore} 分，建议等级为“${recommendationLabel}”。云海 ${scores.cloudSea.score} 分，霞光最高 ${Math.max(scores.sunriseGlow.score, scores.sunsetGlow.score)} 分，通透度 ${scores.transparency.score} 分。`;
}

function applyRiskCap(
  level: ForecastRecommendationLevel,
  riskFlags: readonly ForecastRiskFlag[],
): ForecastRecommendationLevel {
  const hasHighRisk = riskFlags.some((flag) => flag.level === "high");
  if (!hasHighRisk) {
    return level;
  }

  return level === "recommended" ? "worth_waiting" : level;
}

function classifyRiskIntensityAsScoreLevel(score: number): ForecastScoreLevel {
  const normalizedScore = clampScore(score);
  if (normalizedScore >= 75) {
    return "poor";
  }
  if (normalizedScore >= 50) {
    return "fair";
  }
  if (normalizedScore >= 25) {
    return "good";
  }
  return "excellent";
}

function nightWindow(
  hourlyWeather: readonly NormalizedHourlyWeather[],
): readonly NormalizedHourlyWeather[] {
  const window = hourlyWeather.filter((hour) => {
    const localHour = getShanghaiHour(hour.time);
    return localHour >= 20 || localHour <= 5;
  });

  return window.length > 0 ? window : hourlyWeather.slice(0, 8);
}

function firstAstro(astroSummaries: readonly AstroSummary[]): AstroSummary | undefined {
  return astroSummaries[0];
}

function calculateMoonScoreForWindow(
  window: readonly NormalizedHourlyWeather[],
  astroSummaries: readonly AstroSummary[],
): number {
  const hourlyScores = window
    .map((hour) => calculateMoonScoreForHour(hour, astroSummaries))
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));

  if (hourlyScores.length === 0) {
    return calculateMoonScore(firstAstro(astroSummaries));
  }

  return clampScore(hourlyScores.reduce((sum, score) => sum + score, 0) / hourlyScores.length);
}

function calculateMoonScoreForHour(
  hour: NormalizedHourlyWeather,
  astroSummaries: readonly AstroSummary[],
): number | undefined {
  if (!Number.isFinite(Date.parse(hour.time))) {
    return undefined;
  }

  const localTime = formatZonedIso(hour.time, defaultTimezone);
  const localDate = localTime.slice(0, 10);
  const localHour = localTime.slice(11, 13);
  const astro = astroSummaries.find((summary) => summary.date === localDate);
  if (!astro) {
    return undefined;
  }

  return calculateMoonScore(astro, astro.moonAltitudeByHour?.[localHour]);
}

function calculateMoonScore(astro: AstroSummary | undefined, moonAltitude?: number): number {
  if (!astro) {
    return 65;
  }

  if (moonAltitude !== undefined && moonAltitude <= 0) {
    return 100;
  }

  const averageMoonAltitude =
    moonAltitude === undefined ? averagePositiveMoonAltitude(astro) : Math.max(0, moonAltitude);

  const illuminationPercent =
    astro.moonIllumination <= 1 ? astro.moonIllumination * 100 : astro.moonIllumination;

  return clampScore(100 - illuminationPercent * 0.72 - Math.max(0, averageMoonAltitude - 15) * 0.8);
}

function calculateCloudLayerClearScore(window: readonly NormalizedHourlyWeather[]): number {
  if (
    !hasAnyWeatherField(window, (hour) =>
      hour.cloudLow !== null && hour.cloudMid !== null && hour.cloudHigh !== null
        ? (hour.cloudLow + hour.cloudMid + hour.cloudHigh) / 3
        : undefined,
    )
  ) {
    return clampScore(100 - averageHourly(window, (hour) => hour.cloudTotal) * 0.7 - 8);
  }

  const layeredCloud = averageHourly(window, (hour) =>
    hour.cloudLow !== null && hour.cloudMid !== null && hour.cloudHigh !== null
      ? (hour.cloudLow + hour.cloudMid + hour.cloudHigh) / 3
      : undefined,
  );

  return clampScore(100 - layeredCloud);
}

function applyAstroPracticalWeatherCap(
  score: number,
  window: readonly NormalizedHourlyWeather[],
): number {
  if (window.length === 0) {
    return Math.min(clampScore(score), 45);
  }

  const cloudTotal = averageHourly(window, (hour) => hour.cloudTotal);
  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const visibility = averageHourly(window, (hour) => hour.rawVisibilityKm ?? hour.visibility);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const precipitationProbability = Math.max(
    ...window.map((hour) => hour.precipitationProbability ?? 0),
    0,
  );
  const precipitationAmount = window.reduce(
    (sum, hour) => sum + (precipitationAmountMm(hour) ?? 0),
    0,
  );
  const precipitationRisk = precipitationRiskLevel({
    probability: precipitationProbability,
    amountMm: precipitationAmount,
  });
  const textBlocked = window.some((hour) =>
    /雨|雪|雾|霾|阴|overcast|rain|snow|fog|mist|heavy cloud/i.test(hour.weatherTextZh ?? ""),
  );
  let cap = 100;

  if (cloudTotal >= 70) {
    cap = Math.min(cap, cloudTotal >= 90 ? 20 : 32);
  }
  if (lowCloud >= 50) {
    cap = Math.min(cap, lowCloud >= 75 ? 22 : 34);
  }
  if (precipitationAmount >= 0.3) {
    cap = Math.min(cap, precipitationAmount >= 2 ? 24 : 34);
  }
  if (precipitationRisk === "medium" || precipitationRisk === "high" || precipitationRisk === "severe") {
    cap = Math.min(cap, precipitationRisk === "medium" ? 38 : 24);
  }
  if (visibility > 0 && visibility < 10) {
    cap = Math.min(cap, visibility < 5 ? 24 : 36);
  }
  if (humidity >= 92 && lowCloud >= 45) {
    cap = Math.min(cap, 34);
  }
  if (textBlocked) {
    cap = Math.min(cap, 32);
  }

  return Math.min(clampScore(score), cap);
}

function hasAnyWeatherField(
  window: readonly NormalizedHourlyWeather[],
  selector: (hour: NormalizedHourlyWeather) => number | null | undefined,
): boolean {
  return window.some((hour) => {
    const value = selector(hour);
    return typeof value === "number" && Number.isFinite(value);
  });
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

function averagePositiveMoonAltitude(astro: AstroSummary): number {
  const moonAltitudeValues = astro.moonAltitudeByHour
    ? Object.values(astro.moonAltitudeByHour).filter((value) => value > 0)
    : [];

  return moonAltitudeValues.length > 0
    ? moonAltitudeValues.reduce((sum, value) => sum + value, 0) / moonAltitudeValues.length
    : 0;
}

function buildDataNotice(input: ForecastCalculationInput): string {
  const astronomyLabel = input.astroDataSourceLabelZh || defaultAstronomyDataSourceLabel;
  if (input.weatherDataMode === "mock") {
    return `天气数据：演示数据；地形数据：演示数据；天文数据：${astronomyLabel}。${demoWeatherHonestyNotice}${astronomyHonestyNotice}`;
  }

  const weatherHonesty = input.weatherDataMode === "real" ? "" : demoWeatherHonestyNotice;
  const cloudLayerNote = hasMissingCloudLayerFields(input.weatherMissingFields)
    ? `；${cloudLayerMissingNote}`
    : "";

  return `${input.weatherNoticeZh}；地形数据：${input.terrainAnalysis.dataSourceLabelZh}；天文数据：${astronomyLabel}。${weatherHonesty}${astronomyHonestyNotice}${cloudLayerNote}`;
}

function getShanghaiHour(time: string): number {
  if (!Number.isFinite(Date.parse(time))) {
    return 0;
  }

  return getHourInTimezone(time, defaultTimezone);
}

function hasMissingCloudLayerFields(fields: readonly string[]): boolean {
  return ["cloudLow", "cloudMid", "cloudHigh"].some((field) => fields.includes(field));
}
