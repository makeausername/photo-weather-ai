import {
  forecastRecommendationLabels,
  type AstroAnalysisResult,
  type AstroSummary,
  type CloudSeaAnalysisResult,
  type ForecastCalculationInput,
  type ForecastCalculationResult,
  type ForecastDailyMetric,
  type ForecastDailySummary,
  type ForecastRecommendationLevel,
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
import { buildGlowForecastScore, calculateGlowAnalysis } from "./glow-analysis.js";

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
  const overallScore =
    input.target === "cloud_sea"
      ? cloudSeaAnalysis.travelScore
      : input.target === "glow"
        ? glowAnalysis.glowTravelScore
        : input.target === "astro"
          ? astroAnalysis.astroTravelScore
          : calculateOverallScore(scores, input.target);
  const riskFlags = buildRiskFlags(input, whiteoutRisk);
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
  const bestWindows = buildBestWindows(cloudSeaAnalysis, glowAnalysis, astroAnalysis);
  const targetDailyBreakdown = buildTargetDailyBreakdown(
    input,
    scores,
    bestWindows,
    cloudSeaAnalysis,
    glowAnalysis,
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
    summary: buildSummary(input, overallScore, recommendationLabel, scores),
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
    photographyAdvice: buildPhotographyAdvice(input, scores, riskFlags),
    dataNotice: buildDataNotice(input),
    isMock: input.isMock,
    dataSourceLabel: input.dataSourceLabel,
    generatedAt: input.generatedAt,
    weatherProviderCode: input.weatherProviderCode,
    weatherProviderLabelZh: input.weatherProviderLabelZh,
    weatherDataMode: input.weatherDataMode,
    weatherNoticeZh: input.weatherNoticeZh,
    weatherMissingFields: input.weatherMissingFields,
    weatherEstimatedFields: input.weatherEstimatedFields,
    weatherFusionSummary: input.weatherFusionSummary,
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
  const score = averageWeightedScore([
    { score: cloudClearScore, weight: 0.28 },
    { score: cloudLayerClearScore, weight: 0.1 },
    { score: humidityScore, weight: 0.2 },
    { score: visibilityScore, weight: 0.22 },
    { score: moonScore, weight: 0.2 },
  ]);
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
  const score = clampScore((candidate?.score ?? 18) - horizonPenalty);
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
  const visibility = averageHourly(window, (hour) => hour.visibility);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);
  const windSpeed = averageHourly(window, (hour) => hour.windSpeed);
  const cloudTotal = averageHourly(window, (hour) => hour.cloudTotal);
  const windScore = windSpeed < 1 ? 72 : windSpeed <= 6 ? 88 : clampScore(108 - windSpeed * 9);
  const score = averageWeightedScore([
    { score: clampScore(visibility * 4), weight: 0.34 },
    { score: 100 - humidity, weight: 0.22 },
    { score: 100 - precipitationProbability, weight: 0.2 },
    { score: windScore, weight: 0.1 },
    { score: 100 - cloudTotal * 0.55, weight: 0.14 },
  ]);
  const reasons = [
    `平均能见度约 ${Math.round(visibility)} 公里。`,
    `平均湿度约 ${Math.round(humidity)}%，降水概率约 ${Math.round(precipitationProbability)}%。`,
  ];
  const risks = [
    ...(visibility < 12 ? ["能见度偏低，远山层次和日出日落通透度会受影响。"] : []),
    ...(precipitationProbability > 45 ? ["降水概率偏高，镜头防护和行程弹性需要提前准备。"] : []),
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

  return averageWeightedScore([
    { score: cloudClearScore, weight: 0.24 },
    { score: cloudLayerClearScore, weight: 0.08 },
    { score: humidityScore, weight: 0.16 },
    { score: visibilityScore, weight: 0.2 },
    { score: moonScore, weight: 0.22 },
    { score: 90, weight: 0.1 },
  ]);
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

function buildBestWindows(
  cloudSeaAnalysis: CloudSeaAnalysisResult,
  glowAnalysis: GlowAnalysisResult,
  astroAnalysis: AstroAnalysisResult,
): readonly ForecastTimeWindow[] {
  const windows = [
    ...buildGlowWindows(glowAnalysis),
    ...buildCloudSeaWindows(cloudSeaAnalysis),
    ...buildAstroWindowsFromAnalysis(astroAnalysis),
  ];

  return windows
    .filter((window) => window.score >= 35)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Date.parse(left.startTime) - Date.parse(right.startTime);
    });
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
  }));
  const recommendedMilkyWayWindows = astroAnalysis.recommendedMilkyWayWindows.map((window) => ({
    label: `推荐银河窗口 ${formatChineseTimeRange(window.start, window.end)}`,
    date: window.date,
    startTime: window.start,
    endTime: window.end,
    score: window.score,
    target: "astro" as const,
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
      stars: metricFromWindow(
        astronomicalNightWindow,
        "每晚观星条件",
        "天文黑夜内云量、湿度、能见度和月光共同影响星空可见度。",
        scores.stars.score,
      ),
      milkyWay: metricFromWindow(
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
      keyWindows,
      riskFlags,
      shortAdvice: buildDailyShortAdvice(input.target, score, riskFlags, keyWindows),
    };
  });
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
  const score = averageWeightedScore([
    { score: lowCloud, weight: 0.34 },
    { score: humidity, weight: 0.26 },
    { score: clampScore(100 - visibility * 8), weight: 0.28 },
    { score: precipitationProbability, weight: 0.12 },
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
  const score = clampScore(
    averageWeightedScore([
      { score: clampScore(visibility * 4), weight: 0.44 },
      { score: 100 - humidity, weight: 0.28 },
      { score: 100 - precipitationProbability, weight: 0.28 },
    ]) || fallbackScore,
  );

  return {
    label: "通透度",
    score,
    detail: `当日平均能见度约 ${Math.round(visibility)} 公里，湿度约 ${Math.round(
      humidity,
    )}%，降水概率约 ${Math.round(precipitationProbability)}%。`,
  };
}

function buildDailyRiskFlags(
  input: ForecastCalculationInput,
  breakdown: TargetDailyBreakdown,
): readonly ForecastRiskFlag[] {
  const flags: ForecastRiskFlag[] = [];
  const dailyWeather = input.dailyWeather.find((day) => day.date === breakdown.date);
  const whiteoutRisk = breakdown.whiteoutRisk?.score ?? 0;

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

  if ((dailyWeather?.precipitationProbability ?? 0) >= 55) {
    flags.push({
      key: "precipitation",
      label: "降水干扰",
      level: (dailyWeather?.precipitationProbability ?? 0) >= 75 ? "high" : "medium",
      description: "该日模拟降水概率偏高，可能影响器材防护、通行和画面通透度。",
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
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Date.parse(left.startTime) - Date.parse(right.startTime);
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

  return score >= 65 ? "当天有可优先关注的拍摄窗口。" : "当天更适合作为备选或机动观察。";
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
  const maxPrecipitation = Math.max(
    ...input.hourlyWeather.map((hour) => hour.precipitationProbability),
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

  if (maxPrecipitation >= 55) {
    flags.push({
      key: "precipitation",
      label: "降水干扰",
      level: maxPrecipitation >= 75 ? "high" : "medium",
      description: "部分时段降水概率偏高，会影响器材防护、通行和画面通透度。",
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
): readonly string[] {
  const advice: string[] = [];

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
  if (riskFlags.some((flag) => flag.level === "high")) {
    advice.push("存在高等级风险提示，出行前应再次核对真实天气、道路和景区开放信息。");
  }
  advice.push(
    "当前结果基于演示天气数据生成，仅用于体验分析流程；正式天气数据源启用后可用于出行前复核。",
  );

  return advice;
}

function buildSummary(
  input: ForecastCalculationInput,
  overallScore: number,
  recommendationLabel: string,
  scores: ForecastCalculationResult["scores"],
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
