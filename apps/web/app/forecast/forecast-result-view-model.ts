import {
  forecastTargetLabels,
  type AstroSummary,
  type ForecastCalculationResult,
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
  readonly windowsTitle: string;
  readonly windowsDescription: string;
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
    bestWindows: mapResultWindows(result.bestWindows),
    windowsTitle: "最佳拍摄窗口",
    windowsDescription: "综合页面按评分混合展示云海、霞光、银河等高分窗口。",
    scoreSectionTitle: "分项评分",
    detailSections: [
      buildScoreOverviewSection(scoreCards),
      buildAstronomySection(result),
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
    bestWindows: mapResultWindows(
      result.bestWindows.filter((window) => window.target === "cloud_sea"),
    ),
    windowsTitle: "云海窗口",
    windowsDescription: "只展示云海相关窗口，不把星空或银河窗口作为主推荐。",
    scoreSectionTitle: "云海相关评分",
    detailSections: [
      scoreSection("cloud-sea-reasons", "云海判断依据", "云海判断", result.scores.cloudSea),
      scoreSection(
        "whiteout-risk-analysis",
        "白墙风险分析",
        "白墙风险",
        result.scores.whiteoutRisk,
      ),
      buildTerrainReferenceSection(result),
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
    bestWindows: mapResultWindows(glowWindows),
    windowsTitle: "日出日落窗口",
    windowsDescription: "只展示朝霞和晚霞窗口，云海仅作为备选题材参考。",
    scoreSectionTitle: "霞光相关评分",
    detailSections: [
      scoreSection("sunrise-reasons", "朝霞判断依据", "朝霞", result.scores.sunriseGlow),
      scoreSection("sunset-reasons", "晚霞判断依据", "晚霞", result.scores.sunsetGlow),
      buildCloudLayerSection(result),
      buildTerrainBlockingSection(result),
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
        `${astro?.moonPhaseNameZh ?? "暂无月相"}，月光越强越不利于银河细节。`,
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
    windowsTitle: "天文黑夜与银河窗口",
    windowsDescription: "优先展示天文黑夜和银河窗口，不把云海窗口作为主推荐。",
    scoreSectionTitle: "星空银河相关评分",
    detailSections: [
      buildMoonSection(result),
      buildMoonRiseSetSection(result),
      buildAstronomicalNightSection(result),
      buildMilkyWaySection(result),
      buildAstroWeatherRiskSection(result),
    ],
    riskSections: [buildAstroRiskSection(result)],
    adviceSections: [listSection("astro-advice", "拍摄建议", "夜间建议", astroAdvice)],
    hiddenModuleKeys: ["cloudSea", "whiteoutRisk", "sunriseGlow", "sunsetGlow", "twilight"],
    dataNotice: buildDataNotice(result),
  };
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
  const astro = firstAstro(result);

  return {
    key: "astronomy-data",
    title: "天文数据",
    badgeLabel: "本地算法计算",
    items: [
      {
        label: "日出 / 日落",
        value: `${formatOptionalTime(astro?.sunrise)} / ${formatOptionalTime(astro?.sunset)}`,
        detail: `太阳中天：${formatOptionalTime(astro?.solarNoon)}`,
      },
      {
        label: "月相与月亮照明",
        value: `${astro?.moonPhaseNameZh ?? "暂无数据"} / ${formatPercent(astro?.moonIllumination)}`,
        detail: `月出 / 月落：${formatOptionalTime(astro?.moonrise)} / ${formatOptionalTime(
          astro?.moonset,
        )}`,
      },
      {
        label: "天文黑夜",
        value: formatOptionalWindow(astro?.astronomicalNightStart, astro?.astronomicalNightEnd),
        detail: "用于评估深夜星空和银河拍摄基础。",
      },
      {
        label: "银河",
        value: formatOptionalWindow(astro?.milkyWayWindowStart, astro?.milkyWayWindowEnd),
        detail: astro?.milkyWayNoteZh ?? "银河窗口为本地算法初步估算。",
      },
    ],
  };
}

function buildTerrainReferenceSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "terrain-reference",
    title: "地形与海拔参考",
    badgeLabel: "地形与湿度依据",
    items: [
      {
        label: "地形落差",
        value: "本地模拟地形",
        detail: result.scores.cloudSea.reasons[1] ?? "已使用本地模拟地形估算山谷落差。",
      },
      {
        label: "坐标基准",
        value: result.calendarBasis.coordinateSource,
        detail: `WGS84：${formatCoordinate(result.calendarBasis.wgs84Coordinates.latitude)}, ${formatCoordinate(
          result.calendarBasis.wgs84Coordinates.longitude,
        )}`,
      },
    ],
  };
}

function buildCloudSeaWeatherSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "cloud-sea-weather",
    title: "湿度 / 露点 / 风速影响",
    badgeLabel: "水汽与风",
    items: [
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
  return {
    key: "cloud-layer",
    title: "云层结构",
    badgeLabel: "云层与遮挡依据",
    items: [
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

function buildTerrainBlockingSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "terrain-blocking",
    title: "地形遮挡",
    badgeLabel: "日出日落窗口",
    items: [
      {
        label: "日出方向",
        detail:
          result.scores.sunriseGlow.risks.find((risk) => risk.includes("地平遮挡")) ??
          "日出方向地形遮挡会压缩低角度暖光时间，需要提前确认机位朝向。",
      },
      {
        label: "日落方向",
        detail:
          result.scores.sunsetGlow.risks.find((risk) => risk.includes("地平遮挡")) ??
          "日落方向若被山脊遮挡，应优先选择更开阔的侧逆光机位。",
      },
    ],
  };
}

function buildTwilightSection(result: ForecastCalculationResult): ForecastResultSection {
  const astro = firstAstro(result);

  return {
    key: "twilight-times",
    title: "晨昏时间",
    badgeLabel: "本地算法计算",
    items: [
      {
        label: "日出前",
        value: `民用晨光 ${formatOptionalTime(astro?.civilDawn)}`,
        detail: `航海晨光 ${formatOptionalTime(astro?.nauticalDawn)} / 天文晨光 ${formatOptionalTime(
          astro?.astronomicalDawn,
        )}`,
      },
      {
        label: "日落后",
        value: `民用昏影 ${formatOptionalTime(astro?.civilDusk)}`,
        detail: `航海昏影 ${formatOptionalTime(astro?.nauticalDusk)} / 天文昏影 ${formatOptionalTime(
          astro?.astronomicalDusk,
        )}`,
      },
    ],
  };
}

function buildMoonSection(result: ForecastCalculationResult): ForecastResultSection {
  const astro = firstAstro(result);

  return {
    key: "moon-phase",
    title: "月相与月亮照明",
    badgeLabel: "月光影响",
    items: [
      {
        label: "月相",
        value: astro?.moonPhaseNameZh ?? "暂无数据",
        detail: `月相值：${formatNumber(astro?.moonPhase)}`,
      },
      {
        label: "照明比例",
        value: formatPercent(astro?.moonIllumination),
        detail: "月亮照明越强，银河和暗弱星空的反差越容易下降。",
      },
    ],
  };
}

function buildMoonRiseSetSection(result: ForecastCalculationResult): ForecastResultSection {
  const astro = firstAstro(result);

  return {
    key: "moon-rise-set",
    title: "月出月落",
    badgeLabel: "夜间月光",
    items: [
      {
        label: "月出",
        value: formatOptionalTime(astro?.moonrise),
        detail: "如果月亮在银河窗口内升起，需要降低银河预期或调整拍摄方向。",
      },
      {
        label: "月落",
        value: formatOptionalTime(astro?.moonset),
        detail: "月落后的深夜窗口通常更适合银河细节和暗弱星空。",
      },
    ],
  };
}

function buildAstronomicalNightSection(result: ForecastCalculationResult): ForecastResultSection {
  const astro = firstAstro(result);

  return {
    key: "astronomical-night",
    title: "天文黑夜",
    badgeLabel: "星空银河判断",
    items: [
      {
        label: "黑夜窗口",
        value: formatOptionalWindow(astro?.astronomicalNightStart, astro?.astronomicalNightEnd),
        detail: "此窗口是星空、星轨和银河拍摄的基础时间段。",
      },
      {
        label: "夜间评分",
        value: `${result.scores.stars.score} 分`,
        detail: firstText(result.scores.stars.reasons, "夜间云量和月光会影响星空可见度。"),
      },
    ],
  };
}

function buildMilkyWaySection(result: ForecastCalculationResult): ForecastResultSection {
  const astro = firstAstro(result);

  return {
    key: "milky-way",
    title: "银河方向 / 银河窗口",
    badgeLabel: "银河窗口",
    items: [
      {
        label: "银河窗口",
        value: formatOptionalWindow(astro?.milkyWayWindowStart, astro?.milkyWayWindowEnd),
        detail: astro?.milkyWayNoteZh ?? "银河窗口为本地天文算法初步估算。",
      },
      {
        label: "方向参考",
        value: astro?.milkyWayDirection ?? "暂无数据",
        detail: "实际构图仍需结合机位视野、山体遮挡和光污染。",
      },
    ],
  };
}

function buildAstroWeatherRiskSection(result: ForecastCalculationResult): ForecastResultSection {
  return {
    key: "astro-weather-risk",
    title: "云量与能见度风险",
    badgeLabel: "夜间风险",
    items: [
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
  const astro = firstAstro(result);
  const moonIllumination =
    typeof astro?.moonIllumination === "number" ? astro.moonIllumination : undefined;
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

function buildAstroWindows(result: ForecastCalculationResult): readonly ForecastResultWindow[] {
  const astro = firstAstro(result);
  const windows: ForecastResultWindow[] = [];

  if (astro?.astronomicalNightStart && astro.astronomicalNightEnd) {
    windows.push({
      key: `astronomical-night-${astro.astronomicalNightStart}`,
      moduleKey: "astronomicalNight",
      label: "天文黑夜",
      timeRangeLabel: formatWindow(astro.astronomicalNightStart, astro.astronomicalNightEnd),
      startTime: astro.astronomicalNightStart,
      endTime: astro.astronomicalNightEnd,
      score: result.scores.stars.score,
      target: "astro",
      badgeLabel: "星空",
    });
  }

  return [
    ...windows,
    ...mapResultWindows(result.bestWindows.filter((window) => window.target === "astro")),
  ];
}

function mapResultWindows(windows: readonly ForecastTimeWindow[]): readonly ForecastResultWindow[] {
  return windows.map((window) => ({
    key: `${window.target}-${window.startTime}-${window.label}`,
    moduleKey: inferWindowModuleKey(window),
    label: window.label,
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
  if (window.label.startsWith("银河")) {
    return "milkyWay";
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

function firstText(items: readonly string[], fallback: string): string {
  return items[0] ?? fallback;
}

function buildDataNotice(result: ForecastCalculationResult): string {
  const weatherNotice = result.isMock
    ? "天气数据：本地模拟数据"
    : `天气数据：${result.dataSourceLabel}`;
  return `${weatherNotice}；地形数据：本地模拟数据；天文数据：本地算法计算。当前结果不代表真实预报。`;
}

function formatOptionalTime(value: string | undefined): string {
  return value ? formatTime(value) : "暂无数据";
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

function formatNumber(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "暂无数据";
  }

  return value.toFixed(3);
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}
