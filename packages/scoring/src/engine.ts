import {
  forecastRecommendationLabels,
  type AstroSummary,
  type ForecastCalculationInput,
  type ForecastCalculationResult,
  type ForecastRecommendationLevel,
  type ForecastRiskFlag,
  type ForecastScore,
  type ForecastScoreLevel,
  type ForecastTarget,
  type ForecastTimeWindow,
  type NormalizedHourlyWeather,
} from "@photo-weather/shared";
import {
  addHours,
  averageHourly,
  averageWeightedScore,
  clampScore,
  formatChineseTimeRange,
  getWeatherWindowAroundTime,
  pickHighestScoredHour,
} from "./helpers.js";

const mockDataNotice =
  "当前为本地模拟天气数据，计算结果仅用于验证流程，不代表真实预报。";

export function calculateForecast(input: ForecastCalculationInput): ForecastCalculationResult {
  const sunriseGlow = calculateSunriseGlowScore(input);
  const sunsetGlow = calculateSunsetGlowScore(input);
  const cloudSea = calculateCloudSeaScore(input);
  const whiteoutRisk = calculateWhiteoutRiskScore(input);
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
  const overallScore = calculateOverallScore(scores, input.target);
  const riskFlags = buildRiskFlags(input, whiteoutRisk);
  const recommendationLevel = applyRiskCap(classifyRecommendationLevel(overallScore), riskFlags);
  const recommendationLabel = forecastRecommendationLabels[recommendationLevel];

  return {
    place: input.place,
    horizon: input.horizon,
    target: input.target,
    overallScore,
    recommendationLevel,
    recommendationLabel,
    summary: buildSummary(input, overallScore, recommendationLabel, scores),
    scores,
    bestWindows: buildBestWindows(input, scores),
    riskFlags,
    keyReasons: buildKeyReasons(scores),
    photographyAdvice: buildPhotographyAdvice(input, scores, riskFlags),
    dataNotice: buildDataNotice(input),
    isMock: input.isMock,
    dataSourceLabel: input.dataSourceLabel,
    generatedAt: input.generatedAt,
  };
}

export function calculateSunriseGlowScore(input: ForecastCalculationInput): ForecastScore {
  const astro = firstAstro(input.astroSummaries);
  const window = usableWeatherWindow(
    getWeatherWindowAroundTime(input.hourlyWeather, astro?.sunrise, 1, 2),
    input.hourlyWeather.slice(0, 6),
  );
  const score = calculateGlowWindowScore(
    window,
    input.terrainSummary.sunriseHorizonAngle,
    "sunrise",
  );
  const risks = glowRisks(window, input.terrainSummary.sunriseHorizonAngle, "朝霞");
  const reasons = glowReasons(window, "朝霞");

  return makeScore("sunriseGlow", "朝霞", score, reasons, risks);
}

export function calculateSunsetGlowScore(input: ForecastCalculationInput): ForecastScore {
  const astro = firstAstro(input.astroSummaries);
  const window = usableWeatherWindow(
    getWeatherWindowAroundTime(input.hourlyWeather, astro?.sunset, 2, 1),
    input.hourlyWeather.slice(-6),
  );
  const score = calculateGlowWindowScore(window, input.terrainSummary.sunsetHorizonAngle, "sunset");
  const risks = glowRisks(window, input.terrainSummary.sunsetHorizonAngle, "晚霞");
  const reasons = glowReasons(window, "晚霞");

  return makeScore("sunsetGlow", "晚霞", score, reasons, risks);
}

export function calculateCloudSeaScore(input: ForecastCalculationInput): ForecastScore {
  const window = morningWindow(input.hourlyWeather);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const windSpeed = averageHourly(window, (hour) => hour.windSpeed);
  const dewPointSpread = averageHourly(window, (hour) =>
    typeof hour.dewPoint === "number" ? hour.temperature - hour.dewPoint : undefined,
  );
  const terrainScore = clampScore((input.terrainSummary.elevationDiff5km / 1500) * 100);
  const lowCloudScore =
    lowCloud >= 30 && lowCloud <= 68
      ? 92
      : lowCloud > 68
        ? clampScore(112 - lowCloud)
        : clampScore(lowCloud * 2.2);

  const score = averageWeightedScore([
    { score: humidity, weight: 0.24 },
    { score: clampScore(105 - windSpeed * 14), weight: 0.2 },
    { score: terrainScore, weight: 0.24 },
    { score: lowCloudScore, weight: 0.18 },
    { score: clampScore(100 - dewPointSpread * 18), weight: 0.14 },
  ]);
  const reasons = [
    `清晨平均湿度约 ${Math.round(humidity)}%，有利于山谷水汽聚集。`,
    `5公里范围海拔落差约 ${Math.round(input.terrainSummary.elevationDiff5km)} 米，具备云海地形基础。`,
    `清晨低云量约 ${Math.round(lowCloud)}%，可作为云海形成的本地模拟信号。`,
  ];
  const risks = [
    ...(lowCloud > 82 && humidity > 88 ? ["低云和湿度同时偏高，山顶可能被云雾包裹。"] : []),
    ...(windSpeed > 7 ? ["清晨风速偏大，云雾层可能被快速吹散。"] : []),
  ];

  return makeScore("cloudSea", "云海", score, reasons, risks);
}

export function calculateWhiteoutRiskScore(input: ForecastCalculationInput): ForecastScore {
  const window = morningWindow(input.hourlyWeather);
  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const humidity = averageHourly(window, (hour) => hour.humidity);
  const visibility = averageHourly(window, (hour) => hour.visibility);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);
  const riskScore = averageWeightedScore([
    { score: lowCloud, weight: 0.34 },
    { score: humidity, weight: 0.26 },
    { score: clampScore(100 - visibility * 8), weight: 0.28 },
    { score: precipitationProbability, weight: 0.12 },
  ]);
  const reasons = [
    `低云量约 ${Math.round(lowCloud)}%，湿度约 ${Math.round(humidity)}%。`,
    `模拟能见度约 ${Math.round(visibility)} 公里，用于估算白墙概率。`,
  ];
  const risks = [
    ...(riskScore >= 70 ? ["白墙风险偏高，山顶视野可能被低云遮挡。"] : []),
    ...(precipitationProbability > 45 ? ["降水概率偏高，云雾与雨雾叠加会降低拍摄效率。"] : []),
  ];

  return {
    key: "whiteoutRisk",
    label: "白墙风险",
    score: riskScore,
    level: classifyRiskIntensityAsScoreLevel(riskScore),
    reasons,
    risks,
  };
}

export function calculateStarsScore(input: ForecastCalculationInput): ForecastScore {
  const window = nightWindow(input.hourlyWeather);
  const astro = firstAstro(input.astroSummaries);
  const cloudClearScore = 100 - averageHourly(window, (hour) => hour.cloudTotal);
  const humidityScore = 100 - averageHourly(window, (hour) => hour.humidity);
  const visibilityScore = clampScore(averageHourly(window, (hour) => hour.visibility) * 4);
  const moonScore = calculateMoonScore(astro);
  const score = averageWeightedScore([
    { score: cloudClearScore, weight: 0.38 },
    { score: humidityScore, weight: 0.2 },
    { score: visibilityScore, weight: 0.22 },
    { score: moonScore, weight: 0.2 },
  ]);
  const reasons = [
    `夜间总云量折算得分 ${Math.round(cloudClearScore)}，云越少越利于星空。`,
    `月光影响折算得分 ${Math.round(moonScore)}，已考虑月相和夜间月亮高度。`,
  ];
  const risks = [
    ...(cloudClearScore < 45 ? ["夜间云量偏多，星点容易被遮挡。"] : []),
    ...(moonScore < 45 ? ["月光影响偏强，暗弱星空反差会下降。"] : []),
  ];

  return makeScore("stars", "星空", score, reasons, risks);
}

export function calculateMilkyWayScore(input: ForecastCalculationInput): ForecastScore {
  const astro = firstAstro(input.astroSummaries);
  const hasWindow = Boolean(astro?.milkyWayWindowStart && astro.milkyWayWindowEnd);
  const window = usableWeatherWindow(
    getWeatherWindowAroundTime(input.hourlyWeather, astro?.milkyWayWindowStart, 0, 3),
    nightWindow(input.hourlyWeather),
  );
  const cloudClearScore = 100 - averageHourly(window, (hour) => hour.cloudTotal);
  const humidityScore = 100 - averageHourly(window, (hour) => hour.humidity);
  const visibilityScore = clampScore(averageHourly(window, (hour) => hour.visibility) * 4);
  const moonScore = calculateMoonScore(astro);
  const score = hasWindow
    ? averageWeightedScore([
        { score: cloudClearScore, weight: 0.32 },
        { score: humidityScore, weight: 0.16 },
        { score: visibilityScore, weight: 0.2 },
        { score: moonScore, weight: 0.22 },
        { score: 90, weight: 0.1 },
      ])
    : 18;
  const reasons = [
    hasWindow
      ? `模拟银河窗口为 ${formatChineseTimeRange(astro!.milkyWayWindowStart!, astro!.milkyWayWindowEnd!)}。`
      : "当前模拟天文数据没有给出银河窗口。",
    `银河窗口附近云量和月光综合折算得分 ${Math.round(score)}。`,
  ];
  const risks = [
    ...(!hasWindow ? ["缺少银河窗口，只能按星空条件保守参考。"] : []),
    ...(cloudClearScore < 45 ? ["银河窗口附近云量偏多，银心细节可能不明显。"] : []),
    ...(moonScore < 45 ? ["月光偏强，银河对比度会降低。"] : []),
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
      { score: scores.cloudSea.score, weight: 0.45 },
      { score: scores.transparency.score, weight: 0.2 },
      { score: scores.sunriseGlow.score, weight: 0.08 },
      { score: scores.sunsetGlow.score, weight: 0.07 },
      { score: inverseWhiteout, weight: 0.2 },
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

function calculateGlowWindowScore(
  window: readonly NormalizedHourlyWeather[],
  horizonAngle: number | undefined,
  kind: "sunrise" | "sunset",
): number {
  const midHighCloud = averageHourly(window, (hour) =>
    hour.cloudMid !== null && hour.cloudHigh !== null
      ? (hour.cloudMid + hour.cloudHigh) / 2
      : undefined,
  );
  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);
  const visibility = averageHourly(window, (hour) => hour.visibility);
  const horizonPenalty = typeof horizonAngle === "number" ? Math.max(0, horizonAngle - 7) * 4 : 0;
  const midHighCloudScore =
    midHighCloud >= 25 && midHighCloud <= 70
      ? 92
      : midHighCloud < 25
        ? clampScore(35 + midHighCloud * 1.5)
        : clampScore(118 - midHighCloud);
  const lowCloudPenalty = lowCloud > 72 ? 28 : lowCloud > 58 ? 14 : 0;
  const sunsetBonus = kind === "sunset" && midHighCloud >= 35 ? 3 : 0;

  return clampScore(
    averageWeightedScore([
      { score: midHighCloudScore, weight: 0.36 },
      { score: 100 - precipitationProbability, weight: 0.24 },
      { score: clampScore(visibility * 4), weight: 0.24 },
      { score: 100 - lowCloud * 0.7, weight: 0.16 },
    ]) -
      lowCloudPenalty -
      horizonPenalty +
      sunsetBonus,
  );
}

function glowReasons(window: readonly NormalizedHourlyWeather[], label: string): readonly string[] {
  const midHighCloud = averageHourly(window, (hour) =>
    hour.cloudMid !== null && hour.cloudHigh !== null
      ? (hour.cloudMid + hour.cloudHigh) / 2
      : undefined,
  );
  const visibility = averageHourly(window, (hour) => hour.visibility);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);

  return [
    `${label}窗口中高云量约 ${Math.round(midHighCloud)}%，用于判断霞光承载条件。`,
    `窗口能见度约 ${Math.round(visibility)} 公里，降水概率约 ${Math.round(precipitationProbability)}%。`,
  ];
}

function glowRisks(
  window: readonly NormalizedHourlyWeather[],
  horizonAngle: number | undefined,
  label: string,
): readonly string[] {
  const risks: string[] = [];
  const lowCloud = averageHourly(window, (hour) => hour.cloudLow);
  const precipitationProbability = averageHourly(window, (hour) => hour.precipitationProbability);

  if (lowCloud > 68) {
    risks.push(`${label}窗口低云偏多，可能遮挡太阳附近光线。`);
  }
  if (precipitationProbability > 45) {
    risks.push(`${label}窗口降水概率偏高，霞光稳定性较差。`);
  }
  if (typeof horizonAngle === "number" && horizonAngle > 9) {
    risks.push(`${label}方向地平遮挡角偏高，低角度光线可能被地形遮挡。`);
  }

  return risks;
}

function buildBestWindows(
  input: ForecastCalculationInput,
  scores: ForecastCalculationResult["scores"],
): readonly ForecastTimeWindow[] {
  const astro = firstAstro(input.astroSummaries);
  const windows: ForecastTimeWindow[] = [];

  if (astro) {
    windows.push({
      label: `朝霞 ${formatChineseTimeRange(addHours(astro.sunrise, -0.75), addHours(astro.sunrise, 1))}`,
      startTime: addHours(astro.sunrise, -0.75),
      endTime: addHours(astro.sunrise, 1),
      score: scores.sunriseGlow.score,
      target: "glow",
    });
    windows.push({
      label: `晚霞 ${formatChineseTimeRange(addHours(astro.sunset, -1), addHours(astro.sunset, 0.75))}`,
      startTime: addHours(astro.sunset, -1),
      endTime: addHours(astro.sunset, 0.75),
      score: scores.sunsetGlow.score,
      target: "glow",
    });

    if (astro.milkyWayWindowStart && astro.milkyWayWindowEnd) {
      windows.push({
        label: `银河 ${formatChineseTimeRange(astro.milkyWayWindowStart, astro.milkyWayWindowEnd)}`,
        startTime: astro.milkyWayWindowStart,
        endTime: astro.milkyWayWindowEnd,
        score: scores.milkyWay.score,
        target: "astro",
      });
    }
  }

  const cloudSeaHour = pickHighestScoredHour(morningWindow(input.hourlyWeather), (hour) =>
    cloudSeaHourScore(hour, input.terrainSummary.elevationDiff5km),
  );
  if (cloudSeaHour) {
    const startTime = cloudSeaHour.time;
    const endTime = addHours(startTime, 2);
    windows.push({
      label: `云海 ${formatChineseTimeRange(startTime, endTime)}`,
      startTime,
      endTime,
      score: scores.cloudSea.score,
      target: "cloud_sea",
    });
  }

  return windows
    .filter((window) => window.score >= 35)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);
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

function buildKeyReasons(scores: ForecastCalculationResult["scores"]): readonly string[] {
  return [
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
  advice.push("当前结果只用于本地计算流程验证，真实出行需要等待后续接入的生产天气数据。");

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

  return `${input.place.name}${targetPhrase}模拟评分为 ${overallScore} 分，建议等级为“${recommendationLabel}”。云海 ${scores.cloudSea.score} 分，霞光最高 ${Math.max(scores.sunriseGlow.score, scores.sunsetGlow.score)} 分，通透度 ${scores.transparency.score} 分。`;
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

function usableWeatherWindow(
  preferred: readonly NormalizedHourlyWeather[],
  fallback: readonly NormalizedHourlyWeather[],
): readonly NormalizedHourlyWeather[] {
  return preferred.length > 0 ? preferred : fallback;
}

function morningWindow(
  hourlyWeather: readonly NormalizedHourlyWeather[],
): readonly NormalizedHourlyWeather[] {
  const window = hourlyWeather.filter((hour) => {
    const localHour = getShanghaiHour(hour.time);
    return localHour >= 3 && localHour <= 10;
  });

  return window.length > 0 ? window : hourlyWeather.slice(0, 12);
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

function calculateMoonScore(astro: AstroSummary | undefined): number {
  if (!astro) {
    return 65;
  }

  const moonAltitudeValues = astro.moonAltitudeByHour
    ? Object.values(astro.moonAltitudeByHour).filter((value) => value > 0)
    : [];
  const averageMoonAltitude =
    moonAltitudeValues.length > 0
      ? moonAltitudeValues.reduce((sum, value) => sum + value, 0) / moonAltitudeValues.length
      : 0;

  return clampScore(
    100 - astro.moonIllumination * 0.72 - Math.max(0, averageMoonAltitude - 15) * 0.8,
  );
}

function cloudSeaHourScore(hour: NormalizedHourlyWeather, elevationDiff5km: number): number {
  const dewPointSpread = typeof hour.dewPoint === "number" ? hour.temperature - hour.dewPoint : 8;
  const cloudLow = hour.cloudLow ?? 0;

  return averageWeightedScore([
    { score: hour.humidity, weight: 0.28 },
    { score: clampScore(110 - hour.windSpeed * 14), weight: 0.2 },
    {
      score: cloudLow >= 30 && cloudLow <= 72 ? 88 : clampScore(110 - cloudLow),
      weight: 0.24,
    },
    { score: clampScore((elevationDiff5km / 1500) * 100), weight: 0.16 },
    { score: clampScore(100 - dewPointSpread * 18), weight: 0.12 },
  ]);
}

function buildDataNotice(input: ForecastCalculationInput): string {
  if (input.isMock) {
    return mockDataNotice;
  }

  return `数据来源：${input.dataSourceLabel}`;
}

function getShanghaiHour(time: string): number {
  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return new Date(timestamp + 8 * 60 * 60 * 1000).getUTCHours();
}
