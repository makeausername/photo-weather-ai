import {
  forecastTargetLabels,
  type AstroSummary,
  type ForecastCalculationResult,
  type ForecastDailyMetric,
  type ForecastRiskFlag,
  type ForecastScore,
  type ForecastTarget,
  type ForecastTimeWindow,
} from "@photo-weather/shared";

export type ForecastResultModuleKey =
  | "overall"
  | "recommendation"
  | "bestWindow"
  | "risk"
  | "sunriseGlow"
  | "sunsetGlow"
  | "cloudSea"
  | "whiteoutRisk"
  | "stars"
  | "milkyWay"
  | "transparency"
  | "astronomy"
  | "astronomicalNight"
  | "moon"
  | "twilight"
  | "terrain"
  | "weather";

export type ForecastResultCardTone = "primary" | "accent" | "danger" | "info" | "muted";

export type ForecastResultCard = {
  readonly key: string;
  readonly moduleKey: ForecastResultModuleKey;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly score?: number;
  readonly tone: ForecastResultCardTone;
};

export type ForecastResultWindow = {
  readonly key: string;
  readonly moduleKey: ForecastResultModuleKey;
  readonly label: string;
  readonly date?: string;
  readonly timeRangeLabel: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly score: number;
  readonly target: ForecastTarget;
  readonly badgeLabel: string;
};

export type ForecastResultSectionItem = {
  readonly label: string;
  readonly value?: string;
  readonly detail: string;
};

export type ForecastResultSection = {
  readonly key: string;
  readonly title: string;
  readonly badgeLabel?: string;
  readonly description?: string;
  readonly items: readonly ForecastResultSectionItem[];
};

export type ForecastResultDailyItem = {
  readonly key: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly score: number;
  readonly recommendationLabel: string;
  readonly bestWindowLabel: string;
  readonly riskLabel: string;
  readonly shortAdvice: string;
};

export type ForecastResultWindowGroup = {
  readonly key: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly windows: readonly ForecastResultWindow[];
};

export type ForecastResultViewModel = {
  readonly target: ForecastTarget;
  readonly targetLabel: string;
  readonly pageTitle: string;
  readonly pageSubtitle: string;
  readonly primarySummary: string;
  readonly recommendationLabel: string;
  readonly primaryCards: readonly ForecastResultCard[];
  readonly scoreCards: readonly ForecastScore[];
  readonly bestWindows: readonly ForecastResultWindow[];
  readonly windowGroups: readonly ForecastResultWindowGroup[];
  readonly windowsTitle: string;
  readonly windowsDescription: string;
  readonly dailyOverviewTitle?: string;
  readonly dailyOverviewDescription?: string;
  readonly dailyItems: readonly ForecastResultDailyItem[];
  readonly scoreSectionTitle: string;
  readonly detailSections: readonly ForecastResultSection[];
  readonly riskSections: readonly ForecastResultSection[];
  readonly adviceSections: readonly ForecastResultSection[];
  readonly hiddenModuleKeys: readonly ForecastResultModuleKey[];
  readonly dataNotice: string;
};

type ForecastResultShellCopy = {
  readonly pageTitle: string;
  readonly pageSubtitle: string;
  readonly badgeLabel: string;
};

const targetShellCopies: Record<ForecastTarget, ForecastResultShellCopy> = {
  general: {
    pageTitle: "综合拍摄判断",
    pageSubtitle:
      "覆盖云海、朝霞晚霞、星空银河、通透度、风险和拍摄建议，适合从首页进行完整出行判断。",
    badgeLabel: "综合判断",
  },
  cloud_sea: {
    pageTitle: "云海拍摄判断",
    pageSubtitle: "优先判断云海概率、白墙风险、清晨窗口和是否值得专程前往。",
    badgeLabel: "云海",
  },
  glow: {
    pageTitle: "朝霞晚霞拍摄判断",
    pageSubtitle: "聚焦日出日落、晨昏时间、云层结构、地形遮挡和霞光窗口。",
    badgeLabel: "朝霞晚霞",
  },
  astro: {
    pageTitle: "星空银河拍摄判断",
    pageSubtitle: "聚焦月光影响、天文黑夜、银河窗口、云量能见度和夜间拍摄建议。",
    badgeLabel: "星空银河",
  },
};

const allScoreKeys = [
  "sunriseGlow",
  "sunsetGlow",
  "cloudSea",
  "whiteoutRisk",
  "stars",
  "milkyWay",
  "transparency",
] as const;

export function getForecastResultPageShellCopy(target: ForecastTarget): ForecastResultShellCopy {
  return targetShellCopies[target];
}

export function buildForecastResultViewModel(
  result: ForecastCalculationResult,
  target: ForecastTarget = result.target,
): ForecastResultViewModel {
  if (target === "cloud_sea") {
    return buildCloudSeaViewModel(result);
  }

  if (target === "glow") {
    return buildGlowViewModel(result);
  }

  if (target === "astro") {
    return buildAstroViewModel(result);
  }

  return buildGeneralViewModel(result);
}

function buildGeneralViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.general;
  const bestWindow = firstWindow(result.bestWindows);
  const mainRisk = firstRisk(result.riskFlags);
  const scoreCards = allScoreKeys.map((key) => result.scores[key]);
  const resultWindows = mapResultWindows(result.bestWindows);

  return {
    target: "general",
    targetLabel: forecastTargetLabels.general,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: result.summary,
    recommendationLabel: result.recommendationLabel,
    primaryCards: [
      scoreCard("overall", "overall", "综合出片指数", `${result.overallScore}`, "/ 100", "primary"),
      textCard(
        "recommendation",
        "recommendation",
        "推荐等级",
        result.recommendationLabel,
        "按云海、霞光、星空银河、通透度和风险综合判断。",
        "primary",
      ),
      textCard(
        "bestWindow",
        "bestWindow",
        "最佳拍摄窗口",
        bestWindow?.label ?? "暂无明确高分窗口",
        bestWindow?.timeRangeLabel ?? "等待更多数据",
        "accent",
      ),
      textCard(
        "mainRisk",
        "risk",
        "主要风险",
        mainRisk?.label ?? "未发现高等级风险",
        mainRisk ? `${riskLevelText(mainRisk.level)}风险` : "仍需现场核对真实天气。",
        mainRisk?.level === "high" ? "danger" : "muted",
      ),
    ],
    scoreCards,
    bestWindows: resultWindows,
    ...buildHorizonViewFields(result, resultWindows),
    windowsTitle: result.horizon === "24h" ? "最佳拍摄窗口" : "每日窗口",
    windowsDescription: "综合页面按评分混合展示云海、霞光、银河等高分窗口。",
    scoreSectionTitle: "分项评分",
    detailSections: [
      buildScoreOverviewSection(scoreCards),
      buildAstronomySection(result),
      buildCompactTerrainSection(result),
      listSection("key-reasons", "关键依据", "综合依据", result.keyReasons),
    ],
    riskSections: [buildRiskSection("general-risks", "风险提示", result.riskFlags)],
    adviceSections: [
      listSection("general-advice", "拍摄建议", "综合建议", result.photographyAdvice),
    ],
    hiddenModuleKeys: [],
    dataNotice: buildDataNotice(result),
  };
}

function buildCloudSeaViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.cloud_sea;
  const cloudSeaWindow = firstWindow(
    result.bestWindows.filter((window) => window.target === "cloud_sea"),
  );
  const cloudSeaAdvice = buildCloudSeaAdvice(result);
  const cloudSeaWindows = mapResultWindows(
    result.bestWindows.filter((window) => window.target === "cloud_sea"),
  );

  return {
    target: "cloud_sea",
    targetLabel: forecastTargetLabels.cloud_sea,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: `本页优先看云海概率、白墙风险和清晨窗口。${result.summary}`,
    recommendationLabel: result.recommendationLabel,
    primaryCards: [
      scoreCard(
        "cloud-sea-score",
        "cloudSea",
        "云海概率",
        `${result.scores.cloudSea.score}`,
        "按湿度、低云、风速、露点差和地形落差折算。",
        "primary",
        result.scores.cloudSea.score,
      ),
      scoreCard(
        "whiteout-risk-score",
        "whiteoutRisk",
        "白墙风险",
        `${result.scores.whiteoutRisk.score}`,
        "数值越高，山顶被低云包裹的风险越高。",
        result.scores.whiteoutRisk.score >= 65 ? "danger" : "accent",
        result.scores.whiteoutRisk.score,
      ),
      textCard(
        "cloud-sea-window",
        "bestWindow",
        "最佳云海窗口",
        cloudSeaWindow?.label ?? "暂无明确云海窗口",
        cloudSeaWindow?.timeRangeLabel ?? "优先等待清晨低云和湿度信号。",
        "accent",
      ),
      textCard(
        "cloud-sea-go",
        "recommendation",
        "是否值得前往",
        result.recommendationLabel,
        cloudSeaGoDetail(result),
        "primary",
      ),
    ],
    scoreCards: [result.scores.cloudSea, result.scores.whiteoutRisk, result.scores.transparency],
    bestWindows: cloudSeaWindows,
    ...buildHorizonViewFields(result, cloudSeaWindows),
    windowsTitle: "清晨云海窗口",
    windowsDescription: "按所选预报范围展示每日清晨云海窗口，不把星空或银河窗口作为主推荐。",
    scoreSectionTitle: "云海相关评分",
    detailSections: [
      ...buildCloudSeaDailySections(result),
      buildTerrainReferenceSection(result),
      buildValleyElevationDiffSection(result),
      buildCloudSeaTerrainPotentialSection(result),
      buildWhiteoutTerrainAssistSection(result),
      scoreSection("cloud-sea-reasons", "云海判断依据", "云海判断", result.scores.cloudSea),
      buildCloudSeaWeatherSection(result),
      listSection("cloud-sea-backup", "备选拍摄策略", "云海备选", cloudSeaAdvice.slice(2)),
    ],
    riskSections: [buildRiskSection("cloud-sea-risks", "云海风险提示", result.riskFlags)],
    adviceSections: [listSection("cloud-sea-advice", "云海拍摄建议", "出行建议", cloudSeaAdvice)],
    hiddenModuleKeys: ["stars", "milkyWay", "astronomy", "astronomicalNight", "moon"],
    dataNotice: buildDataNotice(result),
  };
}

function buildGlowViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.glow;
  const astro = firstAstro(result);
  const glowWindows = result.bestWindows.filter((window) => window.target === "glow");
  const bestGlowWindow = firstWindow(glowWindows);
  const glowAdvice = buildGlowAdvice(result);
  const resultWindows = mapResultWindows(glowWindows);

  return {
    target: "glow",
    targetLabel: forecastTargetLabels.glow,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: `本页优先看朝霞、晚霞、晨昏时间和云层遮挡。${result.summary}`,
    recommendationLabel: result.recommendationLabel,
    primaryCards: [
      scoreCard(
        "sunrise-glow-score",
        "sunriseGlow",
        "朝霞机会",
        `${result.scores.sunriseGlow.score}`,
        "重点看日出前后的中高云、低云遮挡和通透度。",
        "accent",
        result.scores.sunriseGlow.score,
      ),
      scoreCard(
        "sunset-glow-score",
        "sunsetGlow",
        "晚霞机会",
        `${result.scores.sunsetGlow.score}`,
        "重点看日落前后的中高云承载和降水风险。",
        "accent",
        result.scores.sunsetGlow.score,
      ),
      textCard(
        "sunrise-time",
        "twilight",
        "日出时间",
        formatOptionalTime(astro?.sunrise),
        "建议日出前 45-60 分钟到位。",
        "info",
      ),
      textCard(
        "sunset-time",
        "twilight",
        "日落时间",
        formatOptionalTime(astro?.sunset),
        "建议日落前 60-90 分钟观察云层。",
        "info",
      ),
      textCard(
        "best-glow-window",
        "bestWindow",
        "最佳霞光窗口",
        bestGlowWindow?.label ?? "暂无明确霞光窗口",
        bestGlowWindow?.timeRangeLabel ?? "继续观察日出日落方向云层。",
        "accent",
      ),
    ],
    scoreCards: [result.scores.sunriseGlow, result.scores.sunsetGlow, result.scores.transparency],
    bestWindows: resultWindows,
    ...buildHorizonViewFields(result, resultWindows),
    windowsTitle: "晨昏窗口",
    windowsDescription: "按所选预报范围展示每日朝霞和晚霞窗口，云海仅作为备选题材参考。",
    scoreSectionTitle: "霞光相关评分",
    detailSections: [
      ...buildGlowDailySections(result),
      scoreSection("sunrise-reasons", "朝霞判断依据", "朝霞", result.scores.sunriseGlow),
      scoreSection("sunset-reasons", "晚霞判断依据", "晚霞", result.scores.sunsetGlow),
      buildSunriseObstructionSection(result),
      buildSunsetObstructionSection(result),
      buildTerrainObstructionTipSection(result),
      buildCloudLayerSection(result),
      buildTwilightSection(result),
    ],
    riskSections: [buildGlowRiskSection(result)],
    adviceSections: [listSection("glow-advice", "拍摄建议", "霞光建议", glowAdvice)],
    hiddenModuleKeys: [
      "stars",
      "milkyWay",
      "cloudSea",
      "whiteoutRisk",
      "astronomicalNight",
      "moon",
    ],
    dataNotice: buildDataNotice(result),
  };
}

function buildAstroViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.astro;
  const astro = firstAstro(result);
  const astroWindows = buildAstroWindows(result);
  const astroAdvice = buildAstroAdvice(result);

  return {
    target: "astro",
    targetLabel: forecastTargetLabels.astro,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: `本页优先看月光影响、天文黑夜、银河窗口、云量和能见度。${result.summary}`,
    recommendationLabel: result.recommendationLabel,
    primaryCards: [
      scoreCard(
        "stars-score",
        "stars",
        "星空指数",
        `${result.scores.stars.score}`,
        "按夜间云量、湿度、能见度和月光影响折算。",
        "primary",
        result.scores.stars.score,
      ),
      scoreCard(
        "milky-way-score",
        "milkyWay",
        "银河指数",
        `${result.scores.milkyWay.score}`,
        "银河窗口为本地 V1 估算，仍需结合云量和光污染。",
        "primary",
        result.scores.milkyWay.score,
      ),
      textCard(
        "moon-impact",
        "moon",
        "月光影响",
        formatPercent(astro?.moonIllumination),
        `${astro?.moonPhaseNameZh ?? "暂无月相"}，${waxingOrWaningText(
          astro?.waxingOrWaning,
        )}，${moonImpactText(astro)}。`,
        moonTone(astro),
      ),
      textCard(
        "astronomical-night",
        "astronomicalNight",
        "天文黑夜窗口",
        formatOptionalWindow(astro?.astronomicalNightStart, astro?.astronomicalNightEnd),
        "太阳低于地平线约 18 度后的深夜窗口。",
        "info",
      ),
      textCard(
        "milky-way-window",
        "bestWindow",
        "银河窗口",
        formatOptionalWindow(astro?.milkyWayWindowStart, astro?.milkyWayWindowEnd),
        astro?.milkyWayDirection ? `方向参考：${astro.milkyWayDirection}` : "暂无明确方向参考。",
        "accent",
      ),
    ],
    scoreCards: [result.scores.stars, result.scores.milkyWay, result.scores.transparency],
    bestWindows: astroWindows,
    ...buildHorizonViewFields(result, astroWindows),
    windowsTitle: "夜间窗口",
    windowsDescription: "按所选预报范围展示天文黑夜和银河窗口，不把云海窗口作为主推荐。",
    scoreSectionTitle: "星空银河相关评分",
    detailSections: [
      buildNightlyAstroConditionSection(result),
      buildMoonSection(result),
      buildAstronomicalNightSection(result),
      buildMilkyWaySection(result),
      buildMilkyWayObstructionSection(result),
      buildHorizonObstructionTipSection(result),
      buildMountainObstructionRiskSection(result),
      buildAstroWeatherRiskSection(result),
    ],
    riskSections: [buildAstroRiskSection(result)],
    adviceSections: [listSection("astro-advice", "拍摄建议", "夜间建议", astroAdvice)],
    hiddenModuleKeys: ["cloudSea", "whiteoutRisk", "sunriseGlow", "sunsetGlow", "twilight"],
    dataNotice: buildDataNotice(result),
  };
}

function buildHorizonViewFields(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
): Pick<
  ForecastResultViewModel,
  "windowGroups" | "dailyOverviewTitle" | "dailyOverviewDescription" | "dailyItems"
> {
  const shouldGroup = result.calendarBasis.horizonHours > 24;
  const dailyItems = shouldGroup ? buildDailyItems(result) : [];

  return {
    windowGroups: shouldGroup ? buildWindowGroups(result, windows) : [],
    dailyOverviewTitle: shouldGroup
      ? result.horizon === "7d"
        ? "未来7天趋势"
        : "逐日判断"
      : undefined,
    dailyOverviewDescription: shouldGroup
      ? "按所选预报范围逐日展示分数、最佳窗口、主要风险和出行建议。"
      : undefined,
    dailyItems,
  };
}

function buildDailyItems(result: ForecastCalculationResult): readonly ForecastResultDailyItem[] {
  return result.dailySummaries.map((summary) => ({
    key: `daily-${summary.date}`,
    date: summary.date,
    dateLabel: summary.dateLabelZh,
    score: summary.score,
    recommendationLabel: summary.recommendationLabel,
    bestWindowLabel:
      summary.keyWindows[0]?.label ??
      (result.target === "cloud_sea"
        ? "暂无清晨云海窗口"
        : result.target === "glow"
          ? "暂无晨昏窗口"
          : result.target === "astro"
            ? "暂无夜间窗口"
            : "暂无明确窗口"),
    riskLabel:
      summary.riskFlags[0] !== undefined
        ? `${summary.riskFlags[0].label}：${riskLevelText(summary.riskFlags[0].level)}风险`
        : "主要风险：暂无高等级风险",
    shortAdvice: summary.shortAdvice,
  }));
}

function buildWindowGroups(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
): readonly ForecastResultWindowGroup[] {
  return result.calendarBasis.targetDates
    .map((date, index) => {
      const groupedWindows = windows.filter((window) => window.date === date);

      return {
        key: `window-group-${date}`,
        date,
        dateLabel: result.calendarBasis.targetDateLabels[index] ?? date,
        windows: groupedWindows,
      };
    })
    .filter((group) => group.windows.length > 0);
}

function buildScoreOverviewSection(scores: readonly ForecastScore[]): ForecastResultSection {
  return {
    key: "score-overview",
    title: "完整模块",
    badgeLabel: "综合概览",
    description: "首页综合判断保留所有主要摄影模块。",
    items: scores.map((score) => ({
      label: score.label,
      value: `${score.score} 分`,
      detail: firstText(score.reasons, "暂无评分依据。"),
    })),
  };
}

function buildAstronomySection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "astronomy-data",
    title: "天文数据",
    badgeLabel: "本地算法计算",
    items: result.astroSummaries.map((astro) => ({
      label: dateLabelForResult(result, astro.date),
      value: `${formatOptionalTime(astro.sunrise)} / ${formatOptionalTime(astro.sunset)}`,
      detail: `月相 ${astro.moonPhaseNameZh}，月亮照明 ${formatPercent(
        astro.moonIllumination,
      )}；天文黑夜 ${formatOptionalWindow(
        astro.astronomicalNightStart,
        astro.astronomicalNightEnd,
      )}；银河 ${formatOptionalWindow(
        astro.milkyWayWindowStart,
        astro.milkyWayWindowEnd,
      )}。${astro.milkyWayNoteZh ?? "银河窗口为本地算法初步估算。"}`,
    })),
  };
}

function buildCloudSeaDailySections(
  result: ForecastCalculationResult,
): readonly ForecastResultSection[] {
  if (result.calendarBasis.horizonHours <= 24) {
    return [];
  }

  return [
    {
      key: "daily-cloud-sea-opportunity",
      title: "每日清晨云海机会",
      badgeLabel: "清晨云海窗口",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: formatScoreValue(day.cloudSea?.score),
        detail:
          `${formatDailyMetricWindow(day.cloudSea)} ${day.weatherSummary ?? "天气摘要仍为本地模拟。"}`.trim(),
      })),
    },
    {
      key: "daily-whiteout-risk",
      title: "白墙风险",
      badgeLabel: "逐日风险",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: formatScoreValue(day.whiteoutRisk?.score),
        detail: day.whiteoutRisk?.detail ?? "该日暂无清晨白墙风险窗口。",
      })),
    },
    {
      key: "daily-cloud-sea-weather",
      title: "风速/湿度/低云摘要",
      badgeLabel: "本地模拟天气",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: day.weatherSummary ?? "暂无逐日天气摘要",
        detail:
          day.whiteoutRisk?.detail ??
          "当前逐日摘要来自本地模拟天气，真实天气 provider 接入前只用于流程验证。",
      })),
    },
    {
      key: "daily-cloud-sea-worth",
      title: "是否值得等 / 是否值得专程",
      badgeLabel: "逐日判断",
      items: result.dailySummaries.map((day) => ({
        label: day.dateLabelZh,
        value: day.recommendationLabel,
        detail: day.shortAdvice,
      })),
    },
  ];
}

function buildGlowDailySections(
  result: ForecastCalculationResult,
): readonly ForecastResultSection[] {
  if (result.calendarBasis.horizonHours <= 24) {
    return [];
  }

  return [
    {
      key: "daily-sunrise-glow",
      title: "每日朝霞机会",
      badgeLabel: "朝霞窗口",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: formatScoreValue(day.sunriseGlow?.score),
        detail: formatDailyMetricWindow(day.sunriseGlow),
      })),
    },
    {
      key: "daily-sunset-glow",
      title: "每日晚霞机会",
      badgeLabel: "晚霞窗口",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: formatScoreValue(day.sunsetGlow?.score),
        detail: formatDailyMetricWindow(day.sunsetGlow),
      })),
    },
    {
      key: "daily-sun-times",
      title: "日出日落时间",
      badgeLabel: "本地算法计算",
      items: result.astroSummaries.map((astro) => ({
        label: dateLabelForResult(result, astro.date),
        value: `${formatOptionalTime(astro.sunrise)} / ${formatOptionalTime(astro.sunset)}`,
        detail: `晨光 ${formatOptionalTime(astro.civilDawn)}，昏影 ${formatOptionalTime(
          astro.civilDusk,
        )}。`,
      })),
    },
  ];
}

function buildNightlyAstroConditionSection(
  result: ForecastCalculationResult,
): ForecastResultSection {
  return {
    key: "nightly-astro-condition",
    title: "每晚观星条件",
    badgeLabel: "夜间窗口",
    items: result.targetDailyBreakdown.map((day) => ({
      label: dateLabelForResult(result, day.date),
      value: formatScoreValue(Math.max(day.stars?.score ?? 0, day.milkyWay?.score ?? 0)),
      detail: [
        formatDailyMetricWindow(day.stars),
        formatDailyMetricWindow(day.milkyWay),
        day.astroSummary
          ? `月相 ${day.astroSummary.moonPhaseNameZh}，月亮照明 ${formatPercent(
              day.astroSummary.moonIllumination,
            )}。`
          : "暂无月相数据。",
      ].join(" "),
    })),
  };
}

function buildTerrainReferenceSection(result: ForecastCalculationResult): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;

  return {
    key: "terrain-reference",
    title: "地形与海拔参考",
    badgeLabel: result.terrainAnalysis.dataSourceLabelZh,
    items: [
      {
        label: "机位海拔",
        value: formatMeters(terrain.locationElevation),
        detail: terrain.terrainNoteZh,
      },
      {
        label: "周边海拔范围",
        value: `${formatMeters(terrain.minElevation5km)} - ${formatMeters(terrain.maxElevation5km)}`,
        detail: `5公里范围平均海拔约 ${formatMeters(terrain.avgElevation5km)}，用于本地模拟云海与遮挡判断。`,
      },
      {
        label: "山谷方向",
        value: terrain.valleyDirectionZh ?? "暂无方向",
        detail: `山脊参考：${terrain.ridgeDirectionZh ?? "暂无方向"}。该方向仅来自本地模拟地形。`,
      },
    ],
  };
}

function buildValleyElevationDiffSection(result: ForecastCalculationResult): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;

  return {
    key: "valley-elevation-diff",
    title: "山谷高差",
    badgeLabel: "周边5公里",
    items: [
      {
        label: "1公里低点",
        value: formatMeters(terrain.minElevation1km),
        detail: "用于估算机位附近短距离谷地落差。",
      },
      {
        label: "3公里低点",
        value: formatMeters(terrain.minElevation3km),
        detail: "用于估算中距离山谷云雾聚集空间。",
      },
      {
        label: "5公里高差",
        value: formatMeters(terrain.elevationDiff5km),
        detail: "高差越明显，清晨低云与山顶视角形成云海边界的地形基础通常越好。",
      },
    ],
  };
}

function buildCloudSeaTerrainPotentialSection(
  result: ForecastCalculationResult,
): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;

  return {
    key: "cloud-sea-terrain-potential",
    title: "云海地形潜力",
    badgeLabel: "本地模拟地形",
    items: [
      {
        label: "潜力等级",
        value: terrainPotentialLabel(terrain.terrainCloudSeaPotential),
        detail: "按机位海拔、周边5公里高差和本地模拟山谷结构折算。",
      },
      {
        label: "评分影响",
        value: `${result.scores.cloudSea.score} 分`,
        detail:
          result.scores.cloudSea.reasons.find((reason) => reason.includes("地形潜力")) ??
          terrain.terrainNoteZh,
      },
      {
        label: "数据边界",
        value: result.terrainAnalysis.dataSourceLabelZh,
        detail: result.terrainAnalysis.honestyNoteZh,
      },
    ],
  };
}

function buildWhiteoutTerrainAssistSection(
  result: ForecastCalculationResult,
): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;

  return {
    key: "whiteout-terrain-assist",
    title: "白墙风险辅助判断",
    badgeLabel: "地形辅助",
    items: [
      {
        label: "白墙风险值",
        value: `${result.scores.whiteoutRisk.score} 分`,
        detail: firstText(
          result.scores.whiteoutRisk.reasons,
          "低云、湿度和能见度用于估算白墙风险。",
        ),
      },
      {
        label: "地形提示",
        value: terrain.valleyDirectionZh ?? "暂无方向",
        detail: "地形只辅助判断云雾可能堆积的方向，不代表真实 DEM 或现场能见度。",
      },
      {
        label: "现场复核",
        detail: terrain.terrainNoteZh,
      },
    ],
  };
}

function buildCompactTerrainSection(result: ForecastCalculationResult): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "compact-terrain",
    title: "地形摘要",
    badgeLabel: result.terrainAnalysis.dataSourceLabelZh,
    items: [
      {
        label: "机位海拔",
        value: formatMeters(terrain.locationElevation),
        detail: `周边5公里高差约 ${formatMeters(terrain.elevationDiff5km)}。`,
      },
      {
        label: "云海地形潜力",
        value: terrainPotentialLabel(terrain.terrainCloudSeaPotential),
        detail: terrain.terrainNoteZh,
      },
      {
        label: "遮挡方向",
        value:
          horizon.blockedDirectionsZh.length > 0
            ? horizon.blockedDirectionsZh.join("、")
            : "暂无明显方向",
        detail: horizon.obstructionNoteZh,
      },
    ],
  };
}

function buildCloudSeaWeatherSection(result: ForecastCalculationResult): ForecastResultSection {
  const cloudLayerNote = buildCloudLayerMissingItem(result);

  return {
    key: "cloud-sea-weather",
    title: "湿度 / 露点 / 风速影响",
    badgeLabel: "水汽与风",
    items: [
      ...(cloudLayerNote ? [cloudLayerNote] : []),
      {
        label: "湿度与低云",
        detail: firstText(result.scores.cloudSea.reasons, "清晨湿度和低云量用于判断云海形成概率。"),
      },
      {
        label: "露点差",
        detail: "露点差越小，山谷水汽越容易接近凝结；当前评分已纳入本地模拟露点差。",
      },
      {
        label: "风速变化",
        detail:
          result.scores.cloudSea.risks.find((risk) => risk.includes("风速")) ??
          "风速偏大时云雾层更容易被吹散，也会增加山顶架设和等待的不确定性。",
      },
    ],
  };
}

function buildCloudLayerSection(result: ForecastCalculationResult): ForecastResultSection {
  const cloudLayerNote = buildCloudLayerMissingItem(result);

  return {
    key: "cloud-layer",
    title: "云层结构",
    badgeLabel: "云层与遮挡依据",
    items: [
      ...(cloudLayerNote ? [cloudLayerNote] : []),
      {
        label: "朝霞云层",
        detail: firstText(result.scores.sunriseGlow.reasons, "朝霞窗口需要合适的中高云承载光色。"),
      },
      {
        label: "晚霞云层",
        detail: firstText(result.scores.sunsetGlow.reasons, "晚霞窗口需要日落方向云层不过厚。"),
      },
      {
        label: "低云影响",
        detail:
          firstText(result.scores.sunriseGlow.risks, "") ||
          firstText(result.scores.sunsetGlow.risks, "") ||
          "低云如果遮挡太阳方向，霞光强度会明显下降。",
      },
    ],
  };
}

function buildSunriseObstructionSection(result: ForecastCalculationResult): ForecastResultSection {
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "sunrise-obstruction",
    title: "日出方向遮挡",
    badgeLabel: "地平线参考",
    items: [
      {
        label: "遮挡角",
        value: formatAngle(horizon.sunriseHorizonAngle),
        detail:
          result.scores.sunriseGlow.risks.find((risk) => risk.includes("地平遮挡")) ??
          "日出方向地形遮挡会压缩低角度暖光时间，需要提前确认机位朝向。",
      },
      {
        label: "遮挡方向",
        value: formatBlockedDirections(horizon.blockedDirectionsZh),
        detail: horizon.obstructionNoteZh,
      },
    ],
  };
}

function buildSunsetObstructionSection(result: ForecastCalculationResult): ForecastResultSection {
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "sunset-obstruction",
    title: "日落方向遮挡",
    badgeLabel: "地平线参考",
    items: [
      {
        label: "遮挡角",
        value: formatAngle(horizon.sunsetHorizonAngle),
        detail:
          result.scores.sunsetGlow.risks.find((risk) => risk.includes("地平遮挡")) ??
          "日落方向若被山脊遮挡，应优先选择更开阔的侧逆光机位。",
      },
      {
        label: "遮挡方向",
        value: formatBlockedDirections(horizon.blockedDirectionsZh),
        detail: horizon.obstructionNoteZh,
      },
    ],
  };
}

function buildTerrainObstructionTipSection(
  result: ForecastCalculationResult,
): ForecastResultSection {
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "terrain-obstruction-tip",
    title: "地形遮挡提示",
    badgeLabel: result.terrainAnalysis.dataSourceLabelZh,
    items: [
      {
        label: "低角度光线",
        detail: "日出日落接近地平线时，局部山脊会影响第一束或最后一束光线出现时间。",
      },
      {
        label: "数据边界",
        value: "模拟地形",
        detail: `${horizon.obstructionNoteZh} ${result.terrainAnalysis.honestyNoteZh}`,
      },
    ],
  };
}

function buildTwilightSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "twilight-times",
    title: "晨昏时间",
    badgeLabel: "本地算法计算",
    items: result.astroSummaries.map((astro) => ({
      label: dateLabelForResult(result, astro.date),
      value: `日出 ${formatOptionalTime(astro.sunrise)} / 日落 ${formatOptionalTime(astro.sunset)}`,
      detail: `晨光 ${formatOptionalTime(astro.civilDawn)} / ${formatOptionalTime(
        astro.nauticalDawn,
      )} / ${formatOptionalTime(astro.astronomicalDawn)}；昏影 ${formatOptionalTime(
        astro.civilDusk,
      )} / ${formatOptionalTime(astro.nauticalDusk)} / ${formatOptionalTime(
        astro.astronomicalDusk,
      )}。`,
    })),
  };
}

function buildMoonSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "moon-phase",
    title: "月相 / 月亮照明",
    badgeLabel: "本地算法计算",
    items: result.astroSummaries.map((astro) => ({
      label: dateLabelForResult(result, astro.date),
      value: `${astro.moonPhaseNameZh} / ${formatPercent(astro.moonIllumination)}`,
      detail: `农历${astro.lunarDateText}${
        astro.solarTerm ? `，节气 ${astro.solarTerm}` : ""
      }；月出 / 月落 ${formatOptionalTime(astro.moonrise)} / ${formatOptionalTime(
        astro.moonset,
      )}；${moonImpactText(astro)}。${moonCalculationNote(astro)}`,
    })),
  };
}

function buildAstronomicalNightSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "astronomical-night",
    title: "天文黑夜",
    badgeLabel: "星空银河判断",
    items: result.astroSummaries.map((astro) => ({
      label: dateLabelForResult(result, astro.date),
      value: formatOptionalWindow(astro.astronomicalNightStart, astro.astronomicalNightEnd),
      detail: "此窗口是星空、星轨和银河拍摄的基础时间段，已按所选预报范围裁剪。",
    })),
  };
}

function buildMilkyWaySection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "milky-way",
    title: "银河窗口",
    badgeLabel: "银河窗口",
    items: result.astroSummaries.map((astro) => ({
      label: dateLabelForResult(result, astro.date),
      value: formatOptionalWindow(astro.milkyWayWindowStart, astro.milkyWayWindowEnd),
      detail: `${astro.milkyWayDirection ? `方向参考：${astro.milkyWayDirection}。` : ""}${
        astro.milkyWayNoteZh ?? "银河窗口为本地天文算法初步估算。"
      }`,
    })),
  };
}

function buildMilkyWayObstructionSection(result: ForecastCalculationResult): ForecastResultSection {
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "milky-way-obstruction",
    title: "银河方向遮挡",
    badgeLabel: "银河地平线",
    items: [
      {
        label: "银河遮挡角",
        value: formatAngle(horizon.milkyWayHorizonAngle),
        detail:
          result.scores.milkyWay.risks.find((risk) => risk.includes("地平线遮挡")) ??
          "银河方向遮挡角用于辅助判断低仰角银心和地景衔接是否容易被山体挡住。",
      },
      {
        label: "遮挡方向",
        value: formatBlockedDirections(horizon.blockedDirectionsZh),
        detail: horizon.obstructionNoteZh,
      },
    ],
  };
}

function buildHorizonObstructionTipSection(
  result: ForecastCalculationResult,
): ForecastResultSection {
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "horizon-obstruction-tip",
    title: "地平线遮挡提示",
    badgeLabel: result.terrainAnalysis.dataSourceLabelZh,
    items: [
      {
        label: "地平线条件",
        value: formatBlockedDirections(horizon.blockedDirectionsZh),
        detail: horizon.obstructionNoteZh,
      },
      {
        label: "银河窗口限制",
        detail: "银河窗口 V1 仍需结合云量、月光、光污染和真实机位视野，当前地形只作本地模拟辅助。",
      },
    ],
  };
}

function buildMountainObstructionRiskSection(
  result: ForecastCalculationResult,
): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;
  const horizon = result.terrainAnalysis.horizonProfile;

  return {
    key: "mountain-obstruction-risk",
    title: "山体遮挡风险",
    badgeLabel: "夜间构图",
    items: [
      {
        label: "山脊参考",
        value: terrain.ridgeDirectionZh ?? "暂无方向",
        detail: terrain.terrainNoteZh,
      },
      {
        label: "遮挡风险",
        value: formatAngle(horizon.milkyWayHorizonAngle),
        detail:
          result.scores.milkyWay.risks.find((risk) => risk.includes("山体")) ??
          "若银河主体贴近山脊，建议现场用星图和机位实测复核。",
      },
    ],
  };
}

function buildAstroWeatherRiskSection(result: ForecastCalculationResult): ForecastResultSection {
  const cloudLayerNote = buildCloudLayerMissingItem(result);

  return {
    key: "astro-weather-risk",
    title: "云量与能见度风险",
    badgeLabel: "夜间风险",
    items: [
      ...(cloudLayerNote ? [cloudLayerNote] : []),
      {
        label: "星空风险",
        detail:
          firstText(result.scores.stars.risks, "") ||
          firstText(result.scores.stars.reasons, "夜间云量会直接影响星点可见度。"),
      },
      {
        label: "银河风险",
        detail:
          firstText(result.scores.milkyWay.risks, "") ||
          firstText(result.scores.milkyWay.reasons, "银河窗口仍需结合云量和月光判断。"),
      },
      {
        label: "通透度",
        value: `${result.scores.transparency.score} 分`,
        detail: firstText(result.scores.transparency.reasons, "能见度会影响星空和夜景层次。"),
      },
    ],
  };
}

function buildGlowRiskSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "glow-risks",
    title: "霞光风险提示",
    badgeLabel: "云层与遮挡",
    items: [
      ...riskItemsFromScore(result.scores.sunriseGlow, "朝霞风险"),
      ...riskItemsFromScore(result.scores.sunsetGlow, "晚霞风险"),
      ...result.riskFlags
        .filter((risk) => ["precipitation", "visibility", "wind"].includes(risk.key))
        .map(riskItem),
    ],
  };
}

function buildAstroRiskSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "astro-risks",
    title: "星空银河风险提示",
    badgeLabel: "月光 / 云量 / 能见度",
    items: [
      ...riskItemsFromScore(result.scores.stars, "星空风险"),
      ...riskItemsFromScore(result.scores.milkyWay, "银河风险"),
      ...result.riskFlags
        .filter((risk) => ["precipitation", "visibility", "wind"].includes(risk.key))
        .map(riskItem),
    ],
  };
}

function buildRiskSection(
  key: string,
  title: string,
  risks: readonly ForecastRiskFlag[],
): ForecastResultSection {
  return {
    key,
    title,
    badgeLabel: "风险提示",
    items:
      risks.length > 0
        ? risks.map(riskItem)
        : [
            {
              label: "风险状态",
              value: "未发现高等级风险",
              detail: "仍需在出行前核对真实天气、道路和景区开放信息。",
            },
          ],
  };
}

function scoreSection(
  key: string,
  title: string,
  badgeLabel: string,
  score: ForecastScore,
): ForecastResultSection {
  return {
    key,
    title,
    badgeLabel,
    items: [
      ...score.reasons.map((reason, index) => ({
        label: index === 0 ? "主要依据" : "补充依据",
        detail: reason,
      })),
      ...riskItemsFromScore(score, "风险"),
    ],
  };
}

function listSection(
  key: string,
  title: string,
  badgeLabel: string,
  items: readonly string[],
): ForecastResultSection {
  return {
    key,
    title,
    badgeLabel,
    items:
      items.length > 0
        ? items.map((item, index) => ({
            label: index === 0 ? "重点" : "补充",
            detail: item,
          }))
        : [
            {
              label: "暂无",
              detail: "当前模拟结果尚未给出明确条目。",
            },
          ],
  };
}

function buildCloudSeaAdvice(result: ForecastCalculationResult): readonly string[] {
  const cloudSeaScore = result.scores.cloudSea.score;
  const whiteoutRisk = result.scores.whiteoutRisk.score;
  const worthWaiting = cloudSeaScore >= 65 && whiteoutRisk < 72;

  return [
    worthWaiting
      ? "如果已经在山上，清晨云海窗口值得等待；优先守高点，观察云雾上沿和风向变化。"
      : "如果已经在山上，可短时等待清晨窗口，但不要只押云海，建议同步准备山脊、林线和局部光影题材。",
    cloudSeaScore >= 72 && whiteoutRisk < 65
      ? "如果是专程远途，当前云海信号具备出行参考价值，但仍需等真实天气数据接入后再做最终决定。"
      : "如果是专程远途，不建议只为云海出发；白墙或低云不稳定时，远途成本和不确定性偏高。",
    "低云过高或过厚时，转拍山脊剪影、雾中林线、局部霞光或延时素材，避免继续等待完整云海边界。",
    "风速增大时，云雾层容易被吹散或快速包顶，三脚架稳定性和山顶体感风险也会升高。",
  ];
}

function buildGlowAdvice(result: ForecastCalculationResult): readonly string[] {
  const bestGlowScore = Math.max(result.scores.sunriseGlow.score, result.scores.sunsetGlow.score);

  return [
    "拍朝霞建议日出前 45-60 分钟到位，先完成机位、前景和曝光包围设置。",
    "拍晚霞建议日落前 60-90 分钟观察云层移动，重点看太阳方向是否留有透光缝。",
    "高云和中云适合承载颜色；低云过厚会遮挡太阳方向，低云过少则霞光面积可能偏小。",
    "如果低云遮住太阳方向，优先换到侧逆光或高点机位，也可以转拍云缝光、山体层次、局部暖色和长焦压缩题材。",
    bestGlowScore >= 65
      ? "当前霞光窗口有等待价值，但仍要把降水和能见度作为现场复核重点。"
      : "当前霞光信号偏保守，建议降低大面积火烧云预期，把局部光线和云层纹理作为备选。",
  ];
}

function buildAstroAdvice(result: ForecastCalculationResult): readonly string[] {
  const moonIllumination = maxMoonIllumination(result.astroSummaries);
  const moonIsBright = moonIllumination !== undefined && moonIllumination >= 0.55;
  const milkyWayScore = result.scores.milkyWay.score;
  const starsScore = result.scores.stars.score;

  return [
    milkyWayScore >= 68 && !moonIsBright
      ? "当前可把银河作为专程拍摄目标，但仍需结合云量、光污染和机位遮挡做现场复核。"
      : "当前不建议只为银河专程远途出发；银河窗口、云量或月光存在明显不确定性。",
    starsScore >= 60
      ? "星空、星轨和夜景题材仍可纳入计划，优先选择开阔前景和避开月亮方向的构图。"
      : "星空和星轨条件偏保守，建议把夜景、蓝调时刻或月光风景作为备选。",
    moonIsBright
      ? "月光偏强时会压低银河对比度，可改拍月光照亮的山体、云海夜景或城市灯光层次。"
      : "月光影响相对可控时，优先利用天文黑夜和银河窗口完成深空或广角银河素材。",
    "如果银河条件差，建议转拍月光风景、城市夜景、星轨堆栈测试或晨昏过渡光线，不要只守银心。",
  ];
}

function maxMoonIllumination(astroSummaries: readonly AstroSummary[]): number | undefined {
  const values = astroSummaries
    .map((summary) => summary.moonIllumination)
    .filter((value) => typeof value === "number" && Number.isFinite(value));

  return values.length > 0 ? Math.max(...values) : undefined;
}

function buildAstroWindows(result: ForecastCalculationResult): readonly ForecastResultWindow[] {
  return mapResultWindows(result.bestWindows.filter((window) => window.target === "astro"));
}

function mapResultWindows(windows: readonly ForecastTimeWindow[]): readonly ForecastResultWindow[] {
  return windows.map((window) => ({
    key: `${window.target}-${window.startTime}-${window.label}`,
    moduleKey: inferWindowModuleKey(window),
    label: window.label,
    date: window.date,
    timeRangeLabel: formatWindow(window.startTime, window.endTime),
    startTime: window.startTime,
    endTime: window.endTime,
    score: window.score,
    target: window.target,
    badgeLabel: forecastTargetLabels[window.target],
  }));
}

function inferWindowModuleKey(window: ForecastTimeWindow): ForecastResultModuleKey {
  if (window.label.startsWith("朝霞")) {
    return "sunriseGlow";
  }
  if (window.label.startsWith("晚霞")) {
    return "sunsetGlow";
  }
  if (window.label.startsWith("云海")) {
    return "cloudSea";
  }
  if (window.label.startsWith("清晨云海")) {
    return "cloudSea";
  }
  if (window.label.startsWith("银河")) {
    return "milkyWay";
  }
  if (window.label.startsWith("天文黑夜")) {
    return "astronomicalNight";
  }
  return "bestWindow";
}

function firstWindow(
  windows: readonly ForecastTimeWindow[] | readonly ForecastResultWindow[],
): ForecastResultWindow | undefined {
  const first = windows[0];
  if (!first) {
    return undefined;
  }

  if ("timeRangeLabel" in first) {
    return first;
  }

  return mapResultWindows([first])[0];
}

function firstRisk(risks: readonly ForecastRiskFlag[]): ForecastRiskFlag | undefined {
  return risks[0];
}

function firstAstro(result: ForecastCalculationResult): AstroSummary | undefined {
  return result.astroSummaries[0];
}

function scoreCard(
  key: string,
  moduleKey: ForecastResultModuleKey,
  label: string,
  value: string,
  detail: string,
  tone: ForecastResultCardTone,
  score?: number,
): ForecastResultCard {
  return {
    key,
    moduleKey,
    label,
    value,
    detail,
    score,
    tone,
  };
}

function textCard(
  key: string,
  moduleKey: ForecastResultModuleKey,
  label: string,
  value: string,
  detail: string,
  tone: ForecastResultCardTone,
): ForecastResultCard {
  return {
    key,
    moduleKey,
    label,
    value,
    detail,
    tone,
  };
}

function riskItem(risk: ForecastRiskFlag): ForecastResultSectionItem {
  return {
    label: risk.label,
    value: `${riskLevelText(risk.level)}风险`,
    detail: risk.description,
  };
}

function riskItemsFromScore(
  score: ForecastScore,
  fallbackLabel: string,
): readonly ForecastResultSectionItem[] {
  return score.risks.length > 0
    ? score.risks.map((risk) => ({
        label: fallbackLabel,
        detail: risk,
      }))
    : [
        {
          label: fallbackLabel,
          detail: `${score.label}暂未给出明显风险，仍需结合真实天气和现场条件复核。`,
        },
      ];
}

function riskLevelText(level: ForecastRiskFlag["level"]): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function cloudSeaGoDetail(result: ForecastCalculationResult): string {
  if (result.scores.cloudSea.score >= 72 && result.scores.whiteoutRisk.score < 65) {
    return "云海信号优先，但仍需真实天气接入后复核。";
  }
  if (result.scores.whiteoutRisk.score >= 70) {
    return "白墙风险偏高，专程远途需要谨慎。";
  }
  return "适合短时等待，远途出行需保留备选题材。";
}

function moonTone(astro: AstroSummary | undefined): ForecastResultCardTone {
  if (!astro || astro.moonIllumination < 0.35) {
    return "primary";
  }
  if (astro.moonIllumination < 0.65) {
    return "accent";
  }
  return "danger";
}

function moonImpactText(astro: AstroSummary | undefined): string {
  if (!astro) {
    return "暂无月光影响数据";
  }
  if (astro.moonIllumination < 0.35) {
    return "月光影响较轻";
  }
  if (astro.moonIllumination < 0.65) {
    return "月光影响中等";
  }
  return "月光影响偏强";
}

function waxingOrWaningText(value: AstroSummary["waxingOrWaning"] | undefined): string {
  if (value === "waxing") {
    return "盈月阶段";
  }
  if (value === "waning") {
    return "亏月阶段";
  }
  return "接近朔望，盈亏方向不明显";
}

function moonCalculationNote(astro: AstroSummary | undefined): string {
  return (
    astro?.calculationNoteZh ??
    "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。"
  );
}

function firstText(items: readonly string[], fallback: string): string {
  return items[0] ?? fallback;
}

function buildDataNotice(result: ForecastCalculationResult): string {
  const nonRealNotice = result.weatherDataMode === "real" ? "" : "当前结果不代表真实预报。";
  const cloudLayerNote = hasMissingCloudLayers(result)
    ? "；当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。"
    : "";

  return `${result.weatherNoticeZh}；${result.terrainAnalysis.honestyNoteZh}；天文数据：本地算法计算。${nonRealNotice}${cloudLayerNote}`;
}

function buildCloudLayerMissingItem(
  result: ForecastCalculationResult,
): ForecastResultSectionItem | null {
  if (!hasMissingCloudLayers(result)) {
    return null;
  }

  return {
    label: "云层分层",
    value: "数据缺失",
    detail: "当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。",
  };
}

function hasMissingCloudLayers(result: ForecastCalculationResult): boolean {
  return ["cloudLow", "cloudMid", "cloudHigh"].some((field) =>
    result.weatherMissingFields.includes(field),
  );
}

function formatOptionalTime(value: string | undefined): string {
  return value ? formatTime(value) : "暂无数据";
}

function dateLabelForResult(result: ForecastCalculationResult, date: string): string {
  const index = result.calendarBasis.targetDates.indexOf(date);

  return result.calendarBasis.targetDateLabels[index] ?? date;
}

function formatScoreValue(score: number | undefined): string {
  return typeof score === "number" && Number.isFinite(score) ? `${score} 分` : "暂无评分";
}

function formatDailyMetricWindow(metric: ForecastDailyMetric | undefined): string {
  if (!metric) {
    return "暂无明确窗口。";
  }

  return metric.window
    ? `${metric.window.label}，评分 ${metric.score} 分。${metric.detail}`
    : `${metric.label} ${metric.score} 分。${metric.detail}`;
}

function formatOptionalWindow(startTime: string | undefined, endTime: string | undefined): string {
  return startTime && endTime ? formatWindow(startTime, endTime) : "暂无数据";
}

function formatWindow(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "暂无数据";
  }

  return `${Math.round(value * 100)}%`;
}

function formatMeters(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)} 米` : "暂无数据";
}

function formatAngle(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂无数据";
}

function formatBlockedDirections(directions: readonly string[]): string {
  return directions.length > 0 ? directions.join("、") : "暂无明显方向";
}

function terrainPotentialLabel(
  potential: ForecastCalculationResult["terrainAnalysis"]["terrainProfile"]["terrainCloudSeaPotential"],
): string {
  if (potential === "high") {
    return "高";
  }
  if (potential === "medium") {
    return "中";
  }
  return "低";
}
