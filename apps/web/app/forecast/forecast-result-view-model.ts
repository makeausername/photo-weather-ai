import {
  buildCloudLayerCompletenessContext,
  formatArrivalDeadlineZh,
  formatShootingWindowZh,
  forecastTargetLabels,
  type CloudLayerCompletenessContext,
  type CloudSeaRecommendationGuardOutput,
  type AstroAnalysisResult,
  type AstroEvidenceItem,
  type AstroSummary,
  type AstroWindow,
  type CloudSeaEvidenceEffect,
  type DailyAstro,
  type ForecastCalculationResult,
  type ForecastDailyMetric,
  type ForecastMultiSourceAgreementContext,
  type ForecastRiskFlag,
  type ForecastScore,
  type ForecastTarget,
  type ForecastTimeWindow,
  type ForecastWindowHumanCostLevel,
  type ForecastWindowRecommendationLevel,
  type GlowAnalysisResult,
  type GlowBackupPlan,
  type GlowBestTarget,
  type GlowEvidenceItem,
  type GlowWindow,
  type PhotographyPrecipitationRisk,
} from "@photo-weather/shared";
import {
  bestShootableWindowText,
  recommendationLevelText,
  watchableWindowText,
  windowLabelText,
} from "./forecast-copy";
import {
  cloudSeaTerrainAwareText,
  type CloudSeaTerrainContext,
} from "./cloud-sea-terrain-context";
import {
  buildCloudSeaRecommendationGuardForRuleContext,
  buildCloudSeaRuleContext,
  type CloudSeaRuleContext,
} from "./cloud-sea-rule-context";

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
  readonly fullTimeRangeLabel: string;
  readonly compactTimeRangeLabel: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly score: number;
  readonly target: ForecastTarget;
  readonly badgeLabel: string;
  readonly conditionScore?: number;
  readonly practicalScore?: number;
  readonly humanCostLevel?: ForecastWindowHumanCostLevel;
  readonly recommendationLevel?: ForecastWindowRecommendationLevel;
  readonly recommendationLevelLabel: string;
  readonly windowLevel?: ForecastTimeWindow["windowLevel"];
  readonly windowLevelLabel: string;
  readonly executableForDedicatedTrip?: boolean;
  readonly suitableIfNearby?: boolean;
  readonly blockerReasons?: readonly string[];
  readonly copyReasonZh?: string;
  readonly arrivalFullLabel?: string;
  readonly practicalKind?: ForecastTimeWindow["practicalKind"];
  readonly lightPhase?: ForecastTimeWindow["lightPhase"];
  readonly practicalNoteZh?: string;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly weatherBlockers?: readonly string[];
  readonly subjectPriorityLabel?: string;
  readonly backupSubjectLabel?: string;
  readonly restWarningZh?: string;
  readonly arrivalAdvice?: ForecastTimeWindow["arrivalAdvice"];
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
  readonly dedicatedTripLabel?: string;
  readonly nearbyObservationLabel?: string;
  readonly bestWindowLabel: string;
  readonly bestShootableWindowLabel?: string;
  readonly watchableWindowLabel?: string;
  readonly mainPrecipitationPeriodLabel?: string;
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
  readonly cloudSea?: CloudSeaForecastViewModel;
  readonly glow?: GlowForecastViewModel;
  readonly astro?: AstroForecastViewModel;
};

export type CloudSeaDailyTrendItem = {
  readonly key: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly cloudSeaScore: number;
  readonly cloudSeaLevel: string;
  readonly formationScore: number;
  readonly formationLevel: string;
  readonly shootableScore: number;
  readonly shootableLevel: string;
  readonly whiteoutRiskLabel: string;
  readonly whiteoutRiskScore: number;
  readonly bestMorningWindow: string;
  readonly watchableWindow?: string;
  readonly rainOpeningLabel: string;
  readonly onSiteCheckpoints: readonly string[];
  readonly keyReason: string;
  readonly recommendedAction: CloudSeaActionLabel;
  readonly actionSuggestion: string;
  readonly layerCompletenessNote?: string;
};

export type CloudSeaHeroConclusionView = {
  readonly title: string;
  readonly forecastRangeLabel: string;
  readonly recommendationLabel: string;
  readonly bestWindowLabel: string;
  readonly arrivalLabel: string;
  readonly conclusion: string;
  readonly confidenceLabel: string;
};

export type CloudSeaReasoningItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type CloudSeaTerrainEvidenceItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
};

export type CloudSeaWeatherEvidenceItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly effect: string;
  readonly confidenceNote?: string;
  readonly tone: ForecastResultCardTone;
};

export type CloudSeaWindowItem = {
  readonly key: string;
  readonly label: string;
  readonly date?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly timeRangeLabel: string;
  readonly score: number;
  readonly recommendationLabel: string;
  readonly note: string;
  readonly riskTag: string;
  readonly cloudSeaChance: string;
  readonly whiteoutRisk: string;
  readonly rainInterference: string;
  readonly windVisibilityNote: string;
  readonly actionSuggestion: string;
  readonly layerCompletenessNote?: string;
  readonly tone: ForecastResultCardTone;
  readonly lightPhase?: ForecastResultWindow["lightPhase"];
  readonly windowLevel?: ForecastResultWindow["windowLevel"];
};

export type CloudSeaActionLabel =
  | "强推荐专程"
  | "推荐安排"
  | "推荐重点关注"
  | "值得等待"
  | "推荐观察"
  | "可观察"
  | "可顺带观察"
  | "顺带观察"
  | "已在附近可观察"
  | "谨慎参考"
  | "不建议专程"
  | "仅作备选";

export type CloudSeaTravelRecommendation = {
  readonly situation: "已在山上" | "周边短途" | "远途专程";
  readonly action: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type CloudSeaBackupPlan = {
  readonly condition: string;
  readonly action: string;
  readonly detail: string;
};

export type CloudSeaActionPlanItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type CloudSeaForecastViewModel = {
  readonly ruleContext: CloudSeaRuleContext;
  readonly terrainContext: CloudSeaTerrainContext;
  readonly recommendationGuard: CloudSeaRecommendationGuardOutput;
  readonly hero: CloudSeaHeroConclusionView;
  readonly coreCards: readonly ForecastResultCard[];
  readonly dailyTrend: readonly CloudSeaDailyTrendItem[];
  readonly terrainEvidence: {
    readonly dataSource: string;
    readonly items: readonly CloudSeaTerrainEvidenceItem[];
  };
  readonly weatherEvidence: readonly CloudSeaWeatherEvidenceItem[];
  readonly cloudSeaWindows: readonly CloudSeaWindowItem[];
  readonly reasoningItems: readonly CloudSeaReasoningItem[];
  readonly actionPlan: readonly CloudSeaActionPlanItem[];
  readonly travelRecommendations: readonly CloudSeaTravelRecommendation[];
  readonly riskSummary: readonly ForecastResultSectionItem[];
  readonly backupPlans: readonly CloudSeaBackupPlan[];
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly multiSourceAgreementContext: ForecastMultiSourceAgreementContext | null;
  readonly missingDataNotes: readonly string[];
  readonly dataCaution: string | null;
  readonly dataNotice: string;
};

export type GlowDailyTrendItem = {
  readonly key: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly sunriseScore: number;
  readonly sunsetScore: number;
  readonly sunriseWindowLabel: string;
  readonly sunsetWindowLabel: string;
  readonly cloudLayerLabel: string;
  readonly rainOverlapLabel: string;
  readonly postRainOpeningLabel: string;
  readonly lowCloudRiskLabel: string;
  readonly colorCarrierLabel: string;
  readonly bestWindowLabel: string;
  readonly bestTargetLabel: string;
  readonly recommendationLabel: GlowAnalysisResult["recommendationLabel"];
  readonly keyReason: string;
  readonly riskNote: string;
};

export type GlowWindowItem = {
  readonly key: string;
  readonly type: GlowWindow["type"];
  readonly label: string;
  readonly timeRangeLabel: string;
  readonly categoryLabel: string;
  readonly score: number;
  readonly riskTags: readonly string[];
  readonly note: string;
  readonly tone: ForecastResultCardTone;
};

export type GlowEvidenceViewItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type GlowForecastViewModel = {
  readonly coreCards: readonly ForecastResultCard[];
  readonly dailyTrend: readonly GlowDailyTrendItem[];
  readonly glowWindows: readonly GlowWindowItem[];
  readonly cloudLayerEvidence: readonly GlowEvidenceViewItem[];
  readonly visibilityEvidence: readonly GlowEvidenceViewItem[];
  readonly terrainObstructionEvidence: readonly GlowEvidenceViewItem[];
  readonly travelRecommendations: readonly string[];
  readonly riskReasons: readonly string[];
  readonly backupPlans: readonly GlowBackupPlan[];
  readonly missingDataNotes: readonly string[];
  readonly dataNotice: string;
};

export type AstroDailyTrendItem = {
  readonly key: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly lunarDateText?: string;
  readonly starsScore: number;
  readonly milkyWayScore: number;
  readonly astroConditionScore: number;
  readonly astroPracticalScore: number;
  readonly skyConditionScore: number;
  readonly milkyWayGeometryScore: number;
  readonly transparencyScore: number;
  readonly dewRiskScore: number;
  readonly astronomicalWindowAvailable: boolean;
  readonly astroShootable: boolean;
  readonly weatherBlockers: readonly string[];
  readonly moonImpactLabel: string;
  readonly starShootabilityLabel: string;
  readonly milkyWayShootabilityLabel: string;
  readonly cloudBlockerLabel: string;
  readonly dewRiskLabel: string;
  readonly windowRecommendationLabel: string;
  readonly astronomicalNightLabel: string;
  readonly moonlessNightLabel: string;
  readonly galacticCenterWindowLabel: string;
  readonly recommendedMilkyWayLabel: string;
  readonly cloudConditionLabel: string;
  readonly precipitationRiskLabel: string;
  readonly nightShootingAdviceLabel: string;
  readonly blockerReasonLabel: string;
  readonly recommendationLabel: AstroAnalysisResult["recommendationLabel"];
  readonly keyReason: string;
  readonly riskNote: string;
};

export type AstroWindowViewItem = {
  readonly key: string;
  readonly type: AstroWindow["type"];
  readonly label: string;
  readonly dateLabel: string;
  readonly timeRangeLabel: string;
  readonly score: number;
  readonly riskTags: readonly string[];
  readonly note: string;
  readonly direction?: string;
  readonly altitude?: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroEvidenceViewItem = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroForecastViewModel = {
  readonly coreCards: readonly ForecastResultCard[];
  readonly dailyTrend: readonly AstroDailyTrendItem[];
  readonly astronomicalNightWindows: readonly AstroWindowViewItem[];
  readonly moonlessNightWindows: readonly AstroWindowViewItem[];
  readonly milkyWayCandidateWindows: readonly AstroWindowViewItem[];
  readonly recommendedMilkyWayWindows: readonly AstroWindowViewItem[];
  readonly cloudEvidence: readonly AstroEvidenceViewItem[];
  readonly visibilityEvidence: readonly AstroEvidenceViewItem[];
  readonly moonEvidence: readonly AstroEvidenceViewItem[];
  readonly terrainEvidence: readonly AstroEvidenceViewItem[];
  readonly lightPollutionEvidence: readonly AstroEvidenceViewItem[];
  readonly travelRecommendations: readonly string[];
  readonly riskReasons: readonly string[];
  readonly backupPlans: readonly GlowBackupPlan[];
  readonly missingDataNotes: readonly string[];
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
    pageSubtitle: "区分云海形成、云海可拍、白墙风险、清晨窗口和是否值得专程前往。",
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
  const mainRisk = firstRisk(result.riskFlags);
  const scoreCards = allScoreKeys.map((key) => result.scores[key]);
  const resultWindows = buildGeneralResultWindows(result);
  const bestWindow = resultWindows.find(isExecutableResultWindow);
  const calibrationCard = result.calibrationHint
    ? textCard(
        "historical-calibration",
        "recommendation",
        "历史校准",
        calibrationHintValue(result.calibrationHint.confidenceAdjustment),
        result.calibrationHint.displayNoteZh,
        result.calibrationHint.confidenceAdjustment === "slight_down" ||
          result.calibrationHint.confidenceAdjustment === "moderate_down"
          ? "accent"
          : "info",
      )
    : null;

  return {
    target: "general",
    targetLabel: forecastTargetLabels.general,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: result.summary,
    recommendationLabel: result.recommendationLabel,
    primaryCards: [
      textCard(
        "recommendation",
        "recommendation",
        "推荐等级",
        result.recommendationLabel,
        "按云海、霞光、星空银河、通透度和风险综合判断。",
        "primary",
      ),
      ...(calibrationCard ? [calibrationCard] : []),
      textCard(
        "bestWindow",
        "bestWindow",
        "最佳拍摄窗口",
        bestWindow?.label ?? "暂无高确定性拍摄窗口",
        bestWindow?.fullTimeRangeLabel ?? "等待更多数据",
        "accent",
      ),
      textCard(
        "arrivalAdvice",
        "recommendation",
        "到达建议",
        bestWindow?.arrivalFullLabel ?? (bestWindow ? "窗口前到达" : "等待更新"),
        bestWindow?.arrivalAdvice
          ? `${bestWindow.arrivalAdvice.reasonZh}${
              bestWindow.arrivalAdvice.warningZh ? ` ${bestWindow.arrivalAdvice.warningZh}` : ""
            }`
          : bestWindow
            ? `${bestWindow.fullTimeRangeLabel}，预留取景和机位确认时间。`
            : "暂无高确定性拍摄窗口，若已在附近可观察云雾变化。",
        "accent",
      ),
      textCard(
        "cloud-sea-v2",
        "cloudSea",
        "云海 / 白墙",
        `形成${result.cloudSeaAnalysis.labels.formationOpportunity} / 可拍${result.cloudSeaAnalysis.labels.shootableOpportunity} / 白墙${result.cloudSeaAnalysis.labels.whiteoutRisk}`,
        `形成 ${result.cloudSeaAnalysis.formationScore} 分，可拍 ${result.cloudSeaAnalysis.shootableScore} 分，白墙风险 ${result.cloudSeaAnalysis.whiteoutRiskScore} 分。`,
        result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "info",
      ),
      textCard(
        "glow-v2",
        "sunsetGlow",
        "朝霞 / 晚霞机会",
        `朝霞${result.glowAnalysis.labels.sunriseGlowOpportunity} / 晚霞${result.glowAnalysis.labels.sunsetGlowOpportunity}`,
        `朝霞 ${result.glowAnalysis.sunriseGlowScore} 分，晚霞 ${result.glowAnalysis.sunsetGlowScore} 分；色彩云条件${result.glowAnalysis.labels.colorCarrier}（${result.glowAnalysis.colorCarrierScore} 分），低云遮挡风险${result.glowAnalysis.labels.lowCloudObstruction}（${result.glowAnalysis.lowCloudObstructionRisk} 分）。${glowRainOverlapText(result.glowAnalysis)}`,
        result.glowAnalysis.lowCloudObstructionRisk >= 70 ? "danger" : "accent",
      ),
      textCard(
        "glow-observable-window",
        "sunsetGlow",
        "霞光窗口",
        generalGlowWindowValue(result),
        generalGlowWindowDetail(result),
        result.glowAnalysis.bestGlowWindow ? "accent" : "muted",
      ),
      textCard(
        "mainRisk",
        "risk",
        "主要风险",
        mainRisk?.label ?? "未发现高等级风险",
        mainRisk ? `${riskLevelText(mainRisk.level)}风险` : "仍需出行前核对最新天气。",
        mainRisk?.level === "high" ? "danger" : "muted",
      ),
      textCard(
        "prioritySubject",
        bestGeneralSubjectModuleKey(result),
        "优先题材",
        bestGeneralSubjectLabel(result),
        "按云海、霞光、星空银河和通透度综合排序。",
        "info",
      ),
    ],
    scoreCards,
    bestWindows: resultWindows,
    ...buildHorizonViewFields(result, resultWindows),
    windowsTitle: result.horizon === "24h" ? "最佳拍摄窗口" : "每日窗口",
    windowsDescription: "综合页面按实用性排序，同时保留气象条件较好但时间成本偏高的信号。",
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

export function buildCloudSeaForecastViewModel(
  result: ForecastCalculationResult,
): CloudSeaForecastViewModel {
  const analysis = result.cloudSeaAnalysis;
  const ruleContext = buildCloudSeaRuleContext(result);
  const terrainContext = ruleContext.terrainContext;
  const cloudSeaWindows = mapResultWindows(
    result.bestWindows.filter((window) => window.target === "cloud_sea"),
  );
  const cloudLayerCompleteness = ruleContext.cloudLayerCompletenessContext;
  const multiSourceAgreementContext = ruleContext.multiSourceAgreementContext;
  const recommendationGuard = ruleContext.recommendationGuardContext;
  const whiteoutLabel = whiteoutRiskLabel(analysis.whiteoutRiskScore);
  const dataNotice = buildCloudSeaDataNotice(result);
  const vocabulary = terrainContext.vocabulary;

  return {
    ruleContext,
    terrainContext,
    recommendationGuard,
    hero: buildCloudSeaHeroConclusion(
      result,
      cloudSeaWindows,
      terrainContext,
      cloudLayerCompleteness,
      multiSourceAgreementContext,
      recommendationGuard,
    ),
    coreCards: [
      scoreCard(
        "cloud-sea-formation",
        "cloudSea",
        vocabulary.formationCardLabel,
        `${analysis.labels.formationOpportunity}（${analysis.formationScore} 分）`,
        cloudSeaTerrainAwareText(
          firstText(analysis.opportunityReasons, "按湿度、低云、风速、露点差和地形落差判断。"),
          terrainContext,
        ),
        "primary",
        analysis.formationScore,
      ),
      scoreCard(
        "cloud-sea-shootable",
        "cloudSea",
        vocabulary.shootableCardLabel,
        `${analysis.labels.shootableOpportunity}（${analysis.shootableScore} 分）`,
        terrainContext.shouldDowngradeCloudSeaWording
          ? `光线重叠 ${analysis.lightAlignedScore} 分，低云遮挡和降水打断已扣减。`
          : `光线重叠 ${analysis.lightAlignedScore} 分，白墙风险和降水打断已扣减。`,
        analysis.shootableScore >= 70
          ? "primary"
          : analysis.shootableScore >= 45
            ? "accent"
            : "muted",
        analysis.shootableScore,
      ),
      scoreCard(
        "cloud-sea-whiteout",
        "whiteoutRisk",
        vocabulary.obstructionRiskLabel,
        `${whiteoutLabel}（${analysis.whiteoutRiskScore} 分）`,
        cloudSeaTerrainAwareText(
          firstText(analysis.whiteoutReasons, "低云或雾包住机位时，云海会转为白墙。"),
          terrainContext,
        ),
        whiteoutLabel === "高" ? "danger" : whiteoutLabel === "中" ? "accent" : "info",
        analysis.whiteoutRiskScore,
      ),
      textCard(
        "cloud-sea-rain-opening",
        "recommendation",
        "雨后开口机会",
        postRainOpeningLabel(analysis.rainOpening.postRainOpeningChance),
        analysis.rainOpening.messageZh,
        analysis.rainOpening.activeRainDuringWindow
          ? "danger"
          : analysis.rainOpening.postRainOpeningChance === "high"
            ? "primary"
            : analysis.rainOpening.postRainOpeningChance === "medium"
              ? "accent"
              : "muted",
      ),
    ],
    dailyTrend: buildCloudSeaDailyTrend(result, cloudSeaWindows, terrainContext),
    terrainEvidence: buildCloudSeaTerrainEvidence(result, terrainContext),
    weatherEvidence: buildCloudSeaWeatherEvidence(result, terrainContext),
    cloudSeaWindows: buildCloudSeaWindowItems(
      result,
      cloudSeaWindows,
      terrainContext,
      recommendationGuard,
    ),
    reasoningItems: buildCloudSeaReasoningItems(result, terrainContext, cloudLayerCompleteness),
    actionPlan: buildCloudSeaActionPlan(result, cloudSeaWindows, terrainContext, recommendationGuard),
    travelRecommendations: buildCloudSeaTravelRecommendations(result, terrainContext),
    riskSummary: buildCloudSeaRiskSummary(result, terrainContext),
    backupPlans: buildCloudSeaBackupPlans(result, terrainContext),
    cloudLayerCompleteness,
    multiSourceAgreementContext,
    missingDataNotes: analysis.missingDataNotes,
    dataCaution: buildCloudSeaDataCaution(
      result,
      cloudLayerCompleteness,
      multiSourceAgreementContext,
      recommendationGuard,
    ),
    dataNotice,
  };
}

function buildCloudSeaViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.cloud_sea;
  const cloudSea = buildCloudSeaForecastViewModel(result);
  const cloudSeaAdvice = buildCloudSeaAdvice(result);
  const cloudSeaWindows = mapResultWindows(
    result.bestWindows.filter((window) => window.target === "cloud_sea"),
  );

  return {
    target: "cloud_sea",
    targetLabel: forecastTargetLabels.cloud_sea,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: cloudSea.terrainContext.shouldDowngradeCloudSeaWording
      ? `本页按低海拔低云、晨雾、云层变化和通透度参考处理。${result.summary}`
      : `本页优先区分云海形成、云海可拍和白墙风险。${result.summary}`,
    recommendationLabel: cloudSea.hero.recommendationLabel,
    primaryCards: cloudSea.coreCards,
    scoreCards: [result.scores.cloudSea, result.scores.whiteoutRisk, result.scores.transparency],
    bestWindows: cloudSeaWindows,
    ...buildHorizonViewFields(result, cloudSeaWindows),
    windowsTitle: cloudSea.terrainContext.shouldDowngradeCloudSeaWording
      ? "清晨低云/晨雾窗口"
      : "清晨云海窗口",
    windowsDescription: cloudSea.terrainContext.shouldDowngradeCloudSeaWording
      ? "按所选预报范围展示低云、晨雾和云层变化参考，不按高山云海窗口主推。"
      : "按所选预报范围展示每日清晨云海窗口，不把星空或银河窗口作为主推荐。",
    scoreSectionTitle: cloudSea.terrainContext.shouldDowngradeCloudSeaWording
      ? "低云/晨雾相关评分"
      : "云海相关评分",
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
    dataNotice: cloudSea.dataNotice,
    cloudSea,
  };
}

export function buildGlowForecastViewModel(
  result: ForecastCalculationResult,
): GlowForecastViewModel {
  const analysis = result.glowAnalysis;
  const bestWindow = analysis.bestGlowWindows[0];
  const lowCloudRiskLabel = glowRiskLabel(analysis.lowCloudObstructionRisk);
  const recommendedAction = firstText(
    analysis.travelRecommendations,
    "建议结合朝霞、晚霞和现场云层变化灵活安排。",
  );

  return {
    coreCards: [
      scoreCard(
        "glow-sunrise-opportunity",
        "sunriseGlow",
        "朝霞机会",
        `${analysis.sunriseGlowScore} 分`,
        firstText(
          result.scores.sunriseGlow.reasons,
          "按日出前后中高云、低云遮挡、通透度和地形遮挡折算。",
        ),
        "accent",
        analysis.sunriseGlowScore,
      ),
      scoreCard(
        "glow-sunset-opportunity",
        "sunsetGlow",
        "晚霞机会",
        `${analysis.sunsetGlowScore} 分`,
        firstText(
          result.scores.sunsetGlow.reasons,
          "按日落前后中高云承载、低云遮挡、降水和通透度折算。",
        ),
        "accent",
        analysis.sunsetGlowScore,
      ),
      textCard(
        "glow-best-window",
        "bestWindow",
        "最佳霞光窗口",
        bestWindow
          ? `${windowDateLabel(result, bestWindow.date)} ${bestWindow.labelZh}`
          : "暂无精确霞光窗口",
        bestWindow
          ? `${formatWindow(bestWindow.start, bestWindow.end)}，${bestWindow.noteZh}`
          : "缺少日出日落时间时，不生成精确霞光窗口。",
        "primary",
      ),
      textCard(
        "glow-main-action",
        "risk",
        "低云遮挡风险",
        `${lowCloudRiskLabel}（${analysis.lowCloudObstructionRisk} 分）`,
        recommendedAction,
        analysis.lowCloudObstructionRisk >= 70 ? "danger" : "info",
      ),
    ],
    dailyTrend: buildGlowDailyTrend(result, analysis),
    glowWindows: buildGlowWindowItems(result, analysis),
    cloudLayerEvidence: mapGlowEvidence(analysis.cloudLayerEvidence),
    visibilityEvidence: mapGlowEvidence(analysis.visibilityEvidence),
    terrainObstructionEvidence: mapGlowEvidence(analysis.terrainObstructionEvidence),
    travelRecommendations: analysis.travelRecommendations,
    riskReasons: analysis.riskReasons,
    backupPlans: analysis.backupPlans,
    missingDataNotes: analysis.missingDataNotes,
    dataNotice: buildGlowDataNotice(result),
  };
}

function buildGlowViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.glow;
  const glow = buildGlowForecastViewModel(result);
  const glowWindows = buildGlowForecastWindows(result);
  const glowAdvice = buildGlowAdvice(result);
  const resultWindows = mapResultWindows(glowWindows);

  return {
    target: "glow",
    targetLabel: forecastTargetLabels.glow,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: `本页优先看朝霞、晚霞、晨昏时间和云层遮挡。${result.summary}`,
    recommendationLabel: result.glowAnalysis.recommendationLabel,
    primaryCards: glow.coreCards,
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
    dataNotice: glow.dataNotice,
    glow,
  };
}

function buildAstroViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.astro;
  const astroForecast = buildAstroForecastViewModel(result);
  const astroWindows = buildAstroWindows(result);

  return {
    target: "astro",
    targetLabel: forecastTargetLabels.astro,
    pageTitle: shellCopy.pageTitle,
    pageSubtitle: shellCopy.pageSubtitle,
    primarySummary: `本页优先看月光影响、天文黑夜、无月黑夜、推荐银河窗口、云量和能见度。${result.summary}`,
    recommendationLabel: result.astroAnalysis.recommendationLabel,
    primaryCards: astroForecast.coreCards,
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
    adviceSections: [
      listSection("astro-advice", "拍摄建议", "夜间建议", astroForecast.travelRecommendations),
    ],
    hiddenModuleKeys: ["cloudSea", "whiteoutRisk", "sunriseGlow", "sunsetGlow", "twilight"],
    dataNotice: astroForecast.dataNotice,
    astro: astroForecast,
  };
}

export function buildAstroForecastViewModel(
  result: ForecastCalculationResult,
): AstroForecastViewModel {
  const analysis = result.astroAnalysis;
  const firstDaily = analysis.dailyAstro[0];
  const firstMoon = analysis.moonInfo ?? result.astroSummaries[0]?.moonInfo;
  const bestRecommendedWindow = analysis.recommendedMilkyWayWindows[0];
  const bestCandidateWindow = analysis.milkyWayCandidateWindows[0];
  const bestMoonlessWindow = analysis.moonlessNightWindows[0];
  const blockerSummary = astroBlockerSummary(analysis.weatherBlockers);
  const moonImpactTone =
    firstDaily?.moonImpactLevel === "high"
      ? "danger"
      : firstDaily?.moonImpactLevel === "medium"
        ? "accent"
        : "primary";
  const windowForDisplay = analysis.astroShootable
    ? bestRecommendedWindow
    : bestCandidateWindow ?? bestMoonlessWindow;
  const windowValue = windowForDisplay ? formatAstroWindowValue(windowForDisplay) : "暂无明确窗口";
  const windowDetail = analysis.astroShootable
    ? bestRecommendedWindow
      ? `推荐银河窗口，方向 ${bestRecommendedWindow.directionZh ?? "需现场复核"}；建议提前到达完成构图和对焦。`
      : "星空条件可用，但暂无银心、月光和天气同时满足的银河窗口。"
    : analysis.astroWindowAvailable
      ? `有天文窗口，但${blockerSummary}不支持银河拍摄，不建议专程熬夜。`
      : "暂无可用天文黑夜或银河几何窗口，夜间只作备选观察。";

  return {
    coreCards: [
      scoreCard(
        "astro-window-score",
        "astronomicalNight",
        "天文窗口",
        analysis.labels.astronomicalWindow,
        `天文窗口分 ${analysis.astronomicalWindowScore}；只代表天文黑夜、月光和银河几何的理论可用性。`,
        analysis.astroWindowAvailable ? "info" : "muted",
        analysis.astronomicalWindowScore,
      ),
      scoreCard(
        "astro-stars-score",
        "stars",
        "星空指数",
        `${analysis.practicalAstroScore}`,
        `星空可拍性${analysis.labels.starShootability}；已叠加云量、低云、降水、通透度、月光和露水风险。`,
        analysis.astroShootable ? "primary" : "danger",
        analysis.practicalAstroScore,
      ),
      scoreCard(
        "astro-milky-way-score",
        "milkyWay",
        "银河指数",
        `${analysis.milkyWayGeometryScore}`,
        `银河可拍性${analysis.labels.milkyWayShootability}；按银心高度、方向、窗口时长、月光和天气阻断综合判断。`,
        analysis.astroShootable ? "primary" : "danger",
        analysis.milkyWayGeometryScore,
      ),
      scoreCard(
        "astro-moon-impact",
        "moon",
        "月光影响",
        analysis.labels.moonlightImpact,
        `${firstMoon?.moonPhaseNameZh ?? "暂无月相"}，照明 ${formatPercent(
          firstMoon?.moonIllumination,
        )}，影响分 ${analysis.moonlightImpactScore}。`,
        moonImpactTone,
        analysis.moonlightImpactScore,
      ),
      scoreCard(
        "astro-cloud-blocker",
        "weather",
        "云量阻挡",
        analysis.labels.cloudBlocker,
        analysis.weatherBlockers.length > 0
          ? `${blockerSummary}，星空银河实际可见性需降级。`
          : "总云量和低云暂未构成主要阻断，仍需临近复核云层开口。",
        analysis.cloudBlockerLevel === "high"
          ? "danger"
          : analysis.cloudBlockerLevel === "medium"
            ? "accent"
            : "primary",
        analysis.skyConditionScore,
      ),
      scoreCard(
        "astro-dew-risk",
        "weather",
        "露水风险",
        analysis.labels.dewRisk,
        `${analysis.warmthAdviceZh} ${analysis.gearAdviceZh[0] ?? "建议准备防露、保暖和备用电池。"}`,
        analysis.dewRiskLevel === "high"
          ? "danger"
          : analysis.dewRiskLevel === "medium"
            ? "accent"
            : "info",
        Math.max(0, 100 - analysis.dewRiskScore),
      ),
      textCard(
        "astro-best-window",
        "bestWindow",
        "银河窗口判断",
        windowValue,
        windowDetail,
        analysis.astroShootable ? "accent" : "muted",
      ),
    ],
    dailyTrend: analysis.dailyAstro.map((day) =>
      mapDailyAstro(day, analysis.milkyWayCandidateWindows),
    ),
    astronomicalNightWindows: mapAstroWindows(result, analysis.astronomicalNightWindows),
    moonlessNightWindows: mapAstroWindows(result, analysis.moonlessNightWindows),
    milkyWayCandidateWindows: mapAstroWindows(result, analysis.milkyWayCandidateWindows),
    recommendedMilkyWayWindows: mapAstroWindows(result, analysis.recommendedMilkyWayWindows),
    cloudEvidence: mapAstroEvidence(analysis.cloudEvidence),
    visibilityEvidence: mapAstroEvidence(analysis.visibilityEvidence),
    moonEvidence: mapAstroEvidence(analysis.moonEvidence),
    terrainEvidence: mapAstroEvidence(analysis.terrainEvidence),
    lightPollutionEvidence: mapAstroEvidence(analysis.lightPollutionEvidence),
    travelRecommendations: analysis.travelRecommendations,
    riskReasons: analysis.riskReasons,
    backupPlans: analysis.backupPlans,
    missingDataNotes: analysis.missingDataNotes,
    dataNotice: buildAstroDataNotice(result),
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
    bestWindowLabel: summary.bestShootableWindow
      ? windowLabelText(summary.bestShootableWindow)
      : result.target === "cloud_sea"
        ? "暂无清晨云海窗口"
        : result.target === "glow"
          ? "暂无晨昏窗口"
          : result.target === "astro"
            ? "暂无夜间窗口"
            : "暂无高确定性拍摄窗口",
    bestShootableWindowLabel: summary.bestShootableWindow
      ? bestShootableWindowText(summary, result.calendarBasis.timezone)
      : "暂无高确定性拍摄窗口",
    watchableWindowLabel: summary.watchableWindows?.[0]
      ? watchableWindowText(summary, result.calendarBasis.timezone)
      : undefined,
    mainPrecipitationPeriodLabel: summary.weather?.mainPrecipitationPeriodLabelZh,
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
    badgeLabel: result.astroDataSourceLabelZh,
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
      )}。${astro.milkyWayNoteZh ?? "银河窗口为本地天文计算。"}`,
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
      title: "每日云海形成 / 可拍机会",
      badgeLabel: "形成与可拍分开看",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: `${formatScoreValue(day.cloudSeaFormation?.score)} / ${formatScoreValue(
          day.cloudSeaShootable?.score,
        )}`,
        detail: `${formatDailyMetricWindow(day.cloudSeaFormation)} ${formatDailyMetricWindow(
          day.cloudSeaShootable,
        )} ${day.weatherSummary ?? "天气摘要当前使用演示数据。"}`.trim(),
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
      badgeLabel: "演示数据",
      items: result.targetDailyBreakdown.map((day) => ({
        label: dateLabelForResult(result, day.date),
        value: day.weatherSummary ?? "暂无逐日天气摘要",
        detail:
          day.whiteoutRisk?.detail ??
          "当前逐日摘要基于演示天气数据生成，正式数据源启用后将显示对应预报时间。",
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
      badgeLabel: result.astroDataSourceLabelZh,
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
  const hasRelief = isMeaningfulNumber(terrain.elevationDiff5km);

  return {
    key: "terrain-reference",
    title: "地形与海拔参考",
    badgeLabel: result.terrainAnalysis.dataSourceLabelZh,
    items: [
      {
        label: "机位海拔",
        value: formatElevationValue(terrain.locationElevation),
        detail:
          terrain.locationElevation === null
            ? "海拔资料暂未确认，体感仅作参考。"
            : terrain.terrainNoteZh,
      },
      {
        label: "周边海拔范围",
        value:
          isMeaningfulNumber(terrain.minElevation5km) && isMeaningfulNumber(terrain.maxElevation5km)
            ? `${formatMeters(terrain.minElevation5km)} - ${formatMeters(terrain.maxElevation5km)}`
            : "周边高差暂未计算",
        detail: hasRelief
          ? `5公里范围平均海拔约 ${formatMeters(terrain.avgElevation5km)}，用于云海与遮挡判断。`
          : "暂未接入周边 DEM 剖面，云海和遮挡判断会按低置信度处理。",
      },
      {
        label: "山谷方向",
        value: terrain.valleyDirectionZh ?? "暂无方向",
        detail: `山脊参考：${terrain.ridgeDirectionZh ?? "暂无方向"}。当前使用演示地形数据。`,
      },
    ],
  };
}

function buildValleyElevationDiffSection(result: ForecastCalculationResult): ForecastResultSection {
  const terrain = result.terrainAnalysis.terrainProfile;
  const reliefValue = isMeaningfulNumber(terrain.elevationDiff5km)
    ? formatMeters(terrain.elevationDiff5km)
    : "周边高差暂未计算";

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
        value: reliefValue,
        detail: isMeaningfulNumber(terrain.elevationDiff5km)
          ? "高差越明显，清晨低云与山顶视角形成云海边界的地形基础通常越好。"
          : "周边高差暂未计算，不能按 0 米处理。",
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
    badgeLabel: "演示数据",
    items: [
      {
        label: "潜力等级",
        value: terrainPotentialLabel(terrain.terrainCloudSeaPotential),
        detail: "按机位海拔、周边高差和山谷结构折算；缺少周边高差时按低置信度处理。",
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
        value: formatElevationValue(terrain.locationElevation),
        detail: isMeaningfulNumber(terrain.elevationDiff5km)
          ? `周边5公里高差约 ${formatMeters(terrain.elevationDiff5km)}。`
          : "周边高差暂未计算。",
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
        detail: "露点差越小，山谷水汽越容易接近凝结；当前评分已纳入演示天气数据中的露点差。",
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
    badgeLabel: result.astroDataSourceLabelZh,
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
    badgeLabel: result.astroDataSourceLabelZh,
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
        astro.milkyWayNoteZh ?? "银河窗口为本地天文计算。"
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
        detail: "银河窗口仍需结合云量、月光、光污染和真实机位视野，当前地形信息作为辅助参考。",
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
              detail: "仍需在出行前核对最新天气、道路和景区开放信息。",
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

function buildGlowDailyTrend(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): readonly GlowDailyTrendItem[] {
  return analysis.dailyGlow.map((day) => {
    const sunriseWindow = glowWindowForDateAndPhase(analysis, day.date, "sunrise");
    const sunsetWindow = glowWindowForDateAndPhase(analysis, day.date, "sunset");
    const bestWindow = day.bestWindow ?? sunriseWindow ?? sunsetWindow;

    return {
      key: day.date,
      date: day.date,
      dateLabel: day.dateLabelZh,
      sunriseScore: day.sunriseScore,
      sunsetScore: day.sunsetScore,
      sunriseWindowLabel: sunriseWindow
        ? formatGlowWindowBrief(sunriseWindow)
        : "暂无明确日出暖光窗口",
      sunsetWindowLabel: sunsetWindow
        ? formatGlowWindowBrief(sunsetWindow)
        : "暂无明确日落暖光或余晖窗口",
      cloudLayerLabel: `色彩云 ${day.labels?.colorCarrier ?? glowColorCarrierLabel(day.colorCarrierScore ?? analysis.colorCarrierScore)}（${day.colorCarrierScore ?? analysis.colorCarrierScore} 分）`,
      rainOverlapLabel: dailyGlowRainOverlapLabel(day),
      postRainOpeningLabel: glowPostRainOpeningLabel(
        day.postRainOpeningChance ?? analysis.postRainOpeningChance,
      ),
      lowCloudRiskLabel: `${day.labels?.lowCloudObstruction ?? glowRiskLabel(day.lowCloudObstructionRisk ?? analysis.lowCloudObstructionRisk)}（${day.lowCloudObstructionRisk ?? analysis.lowCloudObstructionRisk} 分）`,
      colorCarrierLabel: `${day.labels?.colorCarrier ?? glowColorCarrierLabel(day.colorCarrierScore ?? analysis.colorCarrierScore)}（${day.colorCarrierScore ?? analysis.colorCarrierScore} 分）`,
      bestWindowLabel: bestWindow
        ? `${bestWindow.labelZh} ${formatWindow(bestWindow.start, bestWindow.end)}`
        : "暂无精确霞光窗口",
      bestTargetLabel: glowBestTargetLabel(day.bestTarget),
      recommendationLabel: day.recommendationLabel,
      keyReason: day.keyReason,
      riskNote: day.riskNote,
    };
  });
}

function buildGlowWindowItems(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): readonly GlowWindowItem[] {
  return [
    ...analysis.bestGlowWindows.map((window, index) => ({
      window,
      categoryLabel: glowWindowCategoryLabel(window, index === 0 ? "best" : "best-list"),
    })),
    ...analysis.watchableGlowWindows.map((window) => ({
      window,
      categoryLabel: "可观察",
    })),
    ...analysis.notRecommendedGlowWindows.map((window) => ({
      window,
      categoryLabel: "不建议",
    })),
  ]
    .sort((left, right) => Date.parse(left.window.start) - Date.parse(right.window.start))
    .map(({ window, categoryLabel }) => ({
      key: `${window.type}-${window.start}-${window.labelZh}`,
      type: window.type,
      label: `${windowDateLabel(result, window.date)} ${window.labelZh}`,
      timeRangeLabel: formatWindow(window.start, window.end),
      categoryLabel,
      score: window.score,
      riskTags: window.riskTags,
      note: glowWindowNote(window),
      tone:
        categoryLabel === "不建议"
          ? "danger"
          : categoryLabel === "推荐拍摄"
            ? "primary"
            : categoryLabel === "可观察"
              ? "accent"
              : "muted",
    }));
}

function mapGlowEvidence(items: readonly GlowEvidenceItem[]): readonly GlowEvidenceViewItem[] {
  return items.map((item) => ({
    key: keyFromLabel(`${item.label}-${item.value}`),
    label: item.label,
    value: item.value,
    detail: item.noteZh,
    tone: evidenceTone(item.effect),
  }));
}

function buildGlowDataNotice(result: ForecastCalculationResult): string {
  const weatherText = `天气数据：${weatherStatusLabelForViewModel(result)}`;
  const terrainText = result.terrainAnalysis.isMock
    ? "地形数据：演示数据"
    : `地形数据：${result.terrainAnalysis.dataSourceLabelZh}`;
  const fieldNotes = hasMissingCloudLayers(result)
    ? ["当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。"]
    : [];
  const notes = [...result.glowAnalysis.missingDataNotes, ...fieldNotes].filter(
    (note) => !note.includes("当前天气数据为演示数据"),
  );
  const uniqueNotes = [...new Set(notes)];
  const modeNotice =
    result.weatherDataMode === "real"
      ? "当前天气数据来自已启用的正式数据源，评分仍按标准化天气字段计算。"
      : "当前为体验模式，结果会使用演示天气数据生成；正式天气数据源启用后将显示对应来源与更新时间。";

  return [
    `${weatherText}；${terrainText}；天文数据：${result.astroDataSourceLabelZh}。`,
    modeNotice,
    ...uniqueNotes,
  ].join("");
}

function glowBestTargetLabel(target: GlowBestTarget): string {
  if (target === "sunrise") {
    return "优先朝霞";
  }
  if (target === "sunset") {
    return "优先晚霞";
  }
  if (target === "both") {
    return "朝霞晚霞都可关注";
  }
  return "不建议只押霞光";
}

function glowRiskLabel(score: number): "低" | "中" | "高" {
  if (score >= 70) {
    return "高";
  }
  if (score >= 45) {
    return "中";
  }
  return "低";
}

function glowColorCarrierLabel(score: number): GlowAnalysisResult["labels"]["colorCarrier"] {
  if (score >= 75) {
    return "好";
  }
  if (score >= 55) {
    return "一般";
  }
  return "差";
}

function glowPostRainOpeningLabel(
  chance: GlowAnalysisResult["postRainOpeningChance"] | undefined,
): string {
  if (chance === "high") {
    return "雨后开口机会高";
  }
  if (chance === "medium") {
    return "雨后短暂开口可关注";
  }
  if (chance === "low") {
    return "雨后开口机会低";
  }
  return "雨后开口待复核";
}

function glowRainOverlapText(analysis: GlowAnalysisResult): string {
  if (analysis.rainOverlapsSunriseWindow && analysis.rainOverlapsSunsetWindow) {
    return "降水同时影响日出和日落窗口。";
  }
  if (analysis.rainOverlapsSunriseWindow) {
    return "降水主要影响清晨窗口，朝霞不确定性较高。";
  }
  if (analysis.rainOverlapsSunsetWindow) {
    return "降水主要影响日落窗口，晚霞需要现场复核云层开口。";
  }
  return `降水对日出/日落窗口影响较小，${glowPostRainOpeningLabel(
    analysis.postRainOpeningChance,
  )}。`;
}

function generalGlowWindowValue(result: ForecastCalculationResult): string {
  const best = result.glowAnalysis.bestGlowWindow ?? result.glowAnalysis.bestGlowWindows[0];
  const watchable = result.glowAnalysis.watchableGlowWindows[0];
  const window = best ?? watchable;

  if (!window) {
    return "暂无主要可观察窗口";
  }

  return `${windowDateLabel(result, window.date)} ${window.labelZh}`;
}

function generalGlowWindowDetail(result: ForecastCalculationResult): string {
  const best = result.glowAnalysis.bestGlowWindow ?? result.glowAnalysis.bestGlowWindows[0];
  const watchable = result.glowAnalysis.watchableGlowWindows[0];
  const highConfidence =
    result.glowAnalysis.bestGlowWindows.find(
      (window) => (window.practicalScore ?? window.score) >= 75,
    ) ?? result.glowAnalysis.bestGlowWindow;
  const mainWindow = best ?? watchable;
  const mainWindowText = mainWindow
    ? `主要可观察窗口：${formatWindow(mainWindow.start, mainWindow.end)}，${glowWindowNote(
        mainWindow,
      )}`
    : "主要可观察窗口：暂无。";
  const highConfidenceText = highConfidence
    ? `高确定性拍摄窗口：${windowDateLabel(result, highConfidence.date)} ${formatWindow(
        highConfidence.start,
        highConfidence.end,
      )}。`
    : "高确定性拍摄窗口：暂无。";

  return `${mainWindowText}${highConfidenceText}${glowRainOverlapText(result.glowAnalysis)}`;
}

function buildGeneralResultWindows(
  result: ForecastCalculationResult,
): readonly ForecastResultWindow[] {
  const nonGlowWindows = result.bestWindows.filter((window) => window.target !== "glow");
  const glowWindows = buildGlowForecastWindows(result, false);
  return mapResultWindows([...nonGlowWindows, ...glowWindows], result.calendarBasis.timezone);
}

function buildGlowForecastWindows(
  result: ForecastCalculationResult,
  includeAnalysisBestWhenMissing = true,
): readonly ForecastTimeWindow[] {
  const existingGlowWindows = result.bestWindows.filter((window) => window.target === "glow");
  const shouldAddAnalysisBest =
    (includeAnalysisBestWhenMissing && existingGlowWindows.length === 0) ||
    existingGlowWindows.some(isExecutableForecastWindow);
  const converted = [
    ...existingGlowWindows,
    ...(shouldAddAnalysisBest
      ? result.glowAnalysis.bestGlowWindows.map((window, index) =>
          glowWindowToForecastWindow(window, index === 0 ? "best" : "recommended"),
        )
      : []),
    ...result.glowAnalysis.watchableGlowWindows.map((window) =>
      glowWindowToForecastWindow(window, "watchable"),
    ),
    ...result.glowAnalysis.notRecommendedGlowWindows.map((window) =>
      glowWindowToForecastWindow(window, "not-recommended"),
    ),
  ];

  return dedupeForecastWindows(converted);
}

function dedupeForecastWindows(
  windows: readonly ForecastTimeWindow[],
): readonly ForecastTimeWindow[] {
  const seen = new Set<string>();
  const unique: ForecastTimeWindow[] = [];

  for (const window of windows) {
    const key = `${window.target}-${window.startTime}-${window.endTime}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(window);
  }

  return unique;
}

function glowWindowToForecastWindow(
  window: GlowWindow,
  priority: "best" | "recommended" | "watchable" | "not-recommended",
): ForecastTimeWindow {
  const windowLevel =
    priority === "not-recommended"
      ? "blocked"
      : priority === "watchable"
        ? "watchable"
        : window.score >= 70
          ? priority === "best"
            ? "best"
            : "shootable"
          : "watchable";
  const recommendationLevel: ForecastWindowRecommendationLevel =
    windowLevel === "blocked"
      ? "not_recommended"
      : windowLevel === "watchable"
        ? window.score >= 58
          ? "cautious"
          : "backup"
        : window.score >= 70
          ? "recommended"
          : "cautious";

  return {
    label: window.labelZh,
    date: window.date,
    startTime: window.start,
    endTime: window.end,
    score: window.practicalScore ?? window.score,
    target: "glow",
    conditionScore: window.conditionScore ?? window.score,
    practicalScore: window.practicalScore ?? window.score,
    recommendationLevel,
    windowLevel,
    executableForDedicatedTrip: windowLevel === "best" || windowLevel === "shootable",
    suitableIfNearby: windowLevel !== "blocked",
    blockerReasons: window.riskTags,
    copyReasonZh: glowWindowNote(window),
    lightPhase: glowWindowLightPhase(window),
    practicalNoteZh: glowWindowNote(window),
    subjectPriorityLabel: window.labelZh,
  };
}

function glowWindowLightPhase(window: GlowWindow): ForecastTimeWindow["lightPhase"] {
  if (isMorningGlowWindow(window)) {
    return window.type === "pre_dawn_glow" ? "dawn" : "sunrise";
  }
  if (window.type === "blue_hour_transition" || window.type === "afterglow") {
    return "blue_hour";
  }
  return "sunset";
}

function glowWindowCategoryLabel(
  window: GlowWindow,
  source: "best" | "best-list" | "watchable" | "not-recommended",
): "推荐拍摄" | "可观察" | "仅作备选" | "不建议" {
  if (source === "not-recommended") {
    return "不建议";
  }
  if (source === "watchable") {
    return "可观察";
  }
  if ((window.practicalScore ?? window.score) >= 70) {
    return "推荐拍摄";
  }
  if ((window.practicalScore ?? window.score) >= 55) {
    return "可观察";
  }
  return "仅作备选";
}

function glowWindowNote(window: GlowWindow): string {
  const rainText = window.rainOverlapsWindow
    ? "降水与窗口重叠，需现场复核。"
    : window.glowWindowRainRisk === "high"
      ? "降水打断风险偏高。"
      : "";
  const postRainText =
    window.postRainOpeningChance && window.postRainOpeningChance !== "low"
      ? glowPostRainOpeningLabel(window.postRainOpeningChance)
      : "";
  return [window.noteZh, rainText, postRainText].filter(Boolean).join("");
}

function isMorningGlowWindow(window: Pick<GlowWindow, "type" | "start" | "labelZh">): boolean {
  if (
    window.type === "pre_dawn_glow" ||
    window.type === "sunrise_core" ||
    window.type === "morning_warm_light" ||
    window.type === "sunrise"
  ) {
    return true;
  }
  if (
    window.type === "sunset_warm_light" ||
    window.type === "sunset_core" ||
    window.type === "afterglow" ||
    window.type === "sunset" ||
    window.type === "blue_hour_transition"
  ) {
    return false;
  }
  const hourMatch = /T(\d{2})/.exec(window.start);
  const hour = hourMatch ? Number(hourMatch[1]) : Number.NaN;
  return Number.isFinite(hour) ? hour < 12 : window.labelZh.includes("朝霞");
}

function glowWindowForDateAndPhase(
  analysis: GlowAnalysisResult,
  date: string,
  phase: "sunrise" | "sunset",
): GlowWindow | undefined {
  const windows = [
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
  ].filter((window) => window.date === date);
  return windows.find((window) =>
    phase === "sunrise" ? isMorningGlowWindow(window) : !isMorningGlowWindow(window),
  );
}

function formatGlowWindowBrief(window: GlowWindow): string {
  return `${window.labelZh} ${formatWindow(window.start, window.end)}`;
}

function dailyGlowRainOverlapLabel(day: GlowAnalysisResult["dailyGlow"][number]): string {
  if (day.rainOverlapsSunriseWindow && day.rainOverlapsSunsetWindow) {
    return "降水影响日出与日落窗口";
  }
  if (day.rainOverlapsSunriseWindow) {
    return "降水主要影响清晨窗口";
  }
  if (day.rainOverlapsSunsetWindow) {
    return "降水主要影响日落窗口";
  }
  return "降水与晨昏窗口重叠较少";
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
              detail: "当前分析结果尚未给出明确条目。",
            },
          ],
  };
}

function buildCloudSeaHeroConclusion(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
  multiSourceAgreementContext: ForecastMultiSourceAgreementContext | null,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
): CloudSeaHeroConclusionView {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow = analysis.bestCloudSeaWindow;
  const mappedWindow = bestWindow
    ? windows.find(
        (window) =>
          window.startTime === bestWindow.startTime && window.endTime === bestWindow.endTime,
      )
    : windows[0];
  const bestWindowLabel = bestWindow
    ? recommendationGuard.normalizedWindowRecommendation.windowLabel
    : mappedWindow?.timeRangeLabel ??
      (terrainContext.shouldDowngradeCloudSeaWording
        ? "暂无明确低云/晨雾窗口"
        : "暂无明确云海窗口");

  return {
    title: `${result.place.name} ${terrainContext.vocabulary.heroTitleSuffix}`,
    forecastRangeLabel: result.calendarBasis.forecastRangeLabel,
    recommendationLabel: recommendationGuard.finalRecommendationLabel,
    bestWindowLabel,
    arrivalLabel: cloudSeaArrivalLabel(result, bestWindow, mappedWindow),
    conclusion: cloudSeaConclusion(result, terrainContext, recommendationGuard),
    confidenceLabel: cloudSeaConfidenceLabel(
      result.cloudSeaAnalysis.confidenceLevel,
      cloudLayerCompleteness,
      multiSourceAgreementContext,
    ),
  };
}

function buildCloudSeaDailyTrend(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaDailyTrendItem[] {
  const sourceDays =
    result.calendarBasis.horizonHours <= 24
      ? result.cloudSeaAnalysis.dailyCloudSea.slice(0, 1)
      : result.cloudSeaAnalysis.dailyCloudSea;

  if (sourceDays.length === 0) {
    const firstWindow = windows[0];
    const cloudSeaScore = result.cloudSeaAnalysis.shootableScore;
    const whiteoutScore = result.cloudSeaAnalysis.whiteoutRiskScore;
    const layerContext = buildCloudLayerCompletenessContext(result.professionalHourlyData);
    const dailyGuard = buildCloudSeaRecommendationGuardForRuleContext(result, terrainContext, {
      cloudLayerCompleteness: layerContext,
      multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext,
      cloudSeaScore,
      shootabilityScore: result.cloudSeaAnalysis.shootableScore,
      formationScore: result.cloudSeaAnalysis.formationScore,
      proposedRecommendationLabel: result.cloudSeaAnalysis.recommendationLabel,
      bestWindow: result.cloudSeaAnalysis.bestCloudSeaWindow,
      hasWindow: Boolean(firstWindow ?? result.cloudSeaAnalysis.bestCloudSeaWindow),
      bestWindowLabelZh: firstWindow?.label ?? result.cloudSeaAnalysis.bestCloudSeaWindow?.label,
    });
    const layerRoleNote = cloudLayerDailyRoleNote(
      result,
      result.targetDates[0] ?? result.forecastStart.slice(0, 10),
      terrainContext,
    );

    return [
      {
        key: "cloud-sea-next-window",
        date: result.targetDates[0] ?? result.forecastStart,
        dateLabel: result.calendarBasis.horizonHours <= 24 ? "未来24小时" : "下一次窗口",
        cloudSeaScore,
        cloudSeaLevel: scoreLevelText(scoreLevelFromScore(cloudSeaScore)),
        formationScore: result.cloudSeaAnalysis.formationScore,
        formationLevel: result.cloudSeaAnalysis.labels.formationOpportunity,
        shootableScore: result.cloudSeaAnalysis.shootableScore,
        shootableLevel: result.cloudSeaAnalysis.labels.shootableOpportunity,
        whiteoutRiskLabel: whiteoutRiskLabel(whiteoutScore),
        whiteoutRiskScore: whiteoutScore,
        bestMorningWindow: firstWindow?.timeRangeLabel ?? "暂无明确清晨窗口",
        watchableWindow: result.cloudSeaAnalysis.labels.watchableWindowLabel,
        rainOpeningLabel: cloudSeaRainOpeningSummary(result.cloudSeaAnalysis.rainOpening),
        onSiteCheckpoints: cloudSeaVerificationPoints(result, terrainContext),
        keyReason:
          layerRoleNote ??
          cloudSeaTerrainAwareText(
            firstText(
              result.cloudSeaAnalysis.opportunityReasons,
              terrainContext.shouldDowngradeCloudSeaWording
                ? "当前低云/晨雾参考仍需等待更多天气信号。"
                : "当前云海窗口仍需等待更多天气信号。",
            ),
            terrainContext,
          ),
        recommendedAction: dailyGuard.normalizedDailyRecommendation.label as CloudSeaActionLabel,
        actionSuggestion:
          layerRoleNote ??
          dailyGuard.normalizedDailyRecommendation.actionSuggestionZh,
        layerCompletenessNote: layerRoleNote ?? cloudLayerDailyNote(layerContext),
      },
    ];
  }

  return sourceDays.map((day) => {
    const cloudSeaScore = day.shootableScore ?? day.travelScore;
    const whiteoutScore = day.whiteoutRiskScore;
    const window = windows.find((candidate) => candidate.date === day.date);
    const layerContext = cloudLayerCompletenessContextForDate(result, day.date);
    const dailyGuard = buildCloudSeaRecommendationGuardForRuleContext(result, terrainContext, {
      cloudLayerCompleteness: layerContext,
      multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext,
      cloudSeaScore,
      shootabilityScore: day.shootableScore ?? day.travelScore,
      formationScore: day.formationScore ?? day.opportunityScore,
      whiteoutRiskScore: day.whiteoutRiskScore,
      proposedRecommendationLabel: day.recommendationLabel,
      bestWindow: day.bestWindow,
      hasWindow: Boolean(window ?? day.bestWindow),
      bestWindowLabelZh: window?.label ?? day.bestWindow.label,
    });
    const layerRoleNote = cloudLayerDailyRoleNote(result, day.date, terrainContext);

    return {
      key: `cloud-sea-day-${day.date}`,
      date: day.date,
      dateLabel: result.calendarBasis.horizonHours <= 24 ? "未来24小时" : day.dateLabelZh,
      cloudSeaScore,
      cloudSeaLevel: scoreLevelText(scoreLevelFromScore(cloudSeaScore)),
      formationScore: day.formationScore ?? day.opportunityScore,
      formationLevel:
        day.labels?.formationOpportunity ??
        scoreLevelText(scoreLevelFromScore(day.opportunityScore)),
      shootableScore: day.shootableScore ?? day.travelScore,
      shootableLevel:
        day.labels?.shootableOpportunity ?? scoreLevelText(scoreLevelFromScore(day.travelScore)),
      whiteoutRiskLabel: whiteoutRiskLabel(whiteoutScore),
      whiteoutRiskScore: whiteoutScore,
      bestMorningWindow: window
        ? formatWindow(window.startTime, window.endTime)
        : formatWindow(day.bestWindow.startTime, day.bestWindow.endTime),
      watchableWindow: day.watchableWindow
        ? formatWindow(day.watchableWindow.startTime, day.watchableWindow.endTime)
        : undefined,
      rainOpeningLabel: cloudSeaRainOpeningSummary(
        day.rainOpening ?? result.cloudSeaAnalysis.rainOpening,
      ),
      onSiteCheckpoints: (day.onSiteCheckpoints ?? []).map((item) =>
        cloudSeaTerrainAwareText(item, terrainContext),
      ),
      keyReason: layerRoleNote ?? cloudSeaTerrainAwareText(day.keyReason, terrainContext),
      recommendedAction: dailyGuard.normalizedDailyRecommendation.label as CloudSeaActionLabel,
      actionSuggestion:
        layerRoleNote ??
        dailyGuard.normalizedDailyRecommendation.actionSuggestionZh,
      layerCompletenessNote: layerRoleNote ?? cloudLayerDailyNote(layerContext),
    };
  });
}

function buildCloudSeaTerrainEvidence(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): CloudSeaForecastViewModel["terrainEvidence"] {
  return {
    dataSource: result.terrainAnalysis.dataSourceLabelZh,
    items: result.cloudSeaAnalysis.terrainEvidence.map((item) => ({
      key: keyFromLabel(item.label),
      label: item.label,
      value: item.value,
      detail: cloudSeaTerrainAwareText(item.noteZh, terrainContext),
    })),
  };
}

function buildCloudSeaWeatherEvidence(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaWeatherEvidenceItem[] {
  return result.cloudSeaAnalysis.weatherEvidence.map((item) => ({
    key: keyFromLabel(item.label),
    label: item.label,
    value: item.label === "低云" && hasMissingLowCloudLayer(result) ? "分层缺失" : item.value,
    trend: effectLabel(item.effect),
    effect: cloudSeaTerrainAwareText(item.noteZh, terrainContext),
    confidenceNote:
      item.label === "低云" && hasMissingLowCloudLayer(result)
        ? terrainContext.shouldDowngradeCloudSeaWording
          ? "当前天气源缺少低云分层数据，低云/晨雾参考置信度会降低。"
          : "当前天气源缺少低云分层数据，云海判断置信度会降低。"
        : item.noteZh.includes("缺少")
          ? cloudSeaTerrainAwareText(item.noteZh, terrainContext)
          : undefined,
    tone: evidenceTone(item.effect),
  }));
}

function buildCloudSeaWindowItems(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
): readonly CloudSeaWindowItem[] {
  const analysis = result.cloudSeaAnalysis;
  const vocabulary = terrainContext.vocabulary;
  const items = [
    ...analysis.bestCloudSeaWindows.map((window) =>
      cloudSeaWindowItem(
        "best",
        recommendationGuard.normalizedWindowRecommendation.windowLabel,
        window,
        "primary" as const,
        terrainContext,
        result,
      ),
    ),
    ...analysis.watchableCloudSeaWindows.map((window) =>
      cloudSeaWindowItem(
        "watch",
        vocabulary.watchTimelineWindowLabel,
        window,
        "accent" as const,
        terrainContext,
        result,
      ),
    ),
    ...analysis.notRecommendedCloudSeaWindows.map((window) =>
      cloudSeaWindowItem(
        "avoid",
        vocabulary.avoidTimelineWindowLabel,
        window,
        "danger" as const,
        terrainContext,
        result,
      ),
    ),
  ];

  if (items.length > 0) {
    return [...items].sort((left, right) =>
      left.timeRangeLabel.localeCompare(right.timeRangeLabel),
    );
  }

  return windows.map((window) => ({
    key: `cloud-sea-result-window-${window.startTime}`,
    label: vocabulary.genericWindowLabel,
    date: window.date,
    startTime: window.startTime,
    endTime: window.endTime,
    timeRangeLabel: window.timeRangeLabel,
    score: window.score,
    recommendationLabel: recommendationGuard.finalRecommendationLabel,
    note:
      recommendationGuard.finalRecommendationLevel === "strong_special_trip" ||
      recommendationGuard.finalRecommendationLevel === "recommended_arrangement"
        ? cloudSeaTerrainAwareText(
            window.copyReasonZh ??
              (terrainContext.shouldDowngradeCloudSeaWording
                ? "当前窗口仍需结合临近预报复核近地雾气、低云和通透度。"
                : "当前窗口仍需结合临近预报复核低云高度和能见度。"),
            terrainContext,
          )
        : `${recommendationGuard.reasonZh}。${recommendationGuard.normalizedWindowRecommendation.actionSuggestionZh}`,
    riskTag: cloudSeaTerrainAwareText(cloudSeaWindowRiskTag(result, window.score), terrainContext),
    cloudSeaChance: scoreLevelText(scoreLevelFromScore(window.score)),
    whiteoutRisk: result.cloudSeaAnalysis.labels.whiteoutRisk,
    rainInterference: cloudSeaRainOpeningSummary(result.cloudSeaAnalysis.rainOpening),
    windVisibilityNote: cloudSeaWindVisibilityNote(result),
    actionSuggestion: cloudSeaTimelineActionSuggestion(
      window.score,
      result.cloudSeaAnalysis.whiteoutRiskScore,
      window.windowLevel,
      terrainContext,
      recommendationGuard,
    ),
    layerCompletenessNote:
      cloudLayerWindowRoleNote(result, window.startTime, window.endTime, terrainContext) ??
      cloudLayerWindowNote(
        cloudLayerCompletenessContextForWindow(result, window.startTime, window.endTime),
      ),
    tone: result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "accent",
    lightPhase: window.lightPhase,
    windowLevel: window.windowLevel,
  }));
}

function cloudSeaWindowItem(
  prefix: string,
  label: string,
  window: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number],
  tone: ForecastResultCardTone,
  terrainContext: CloudSeaTerrainContext,
  result: ForecastCalculationResult,
): CloudSeaWindowItem {
  const layerContext = cloudLayerCompletenessContextForWindow(
    result,
    window.startTime,
    window.endTime,
  );

  const windowGuard = buildCloudSeaRecommendationGuardForRuleContext(result, terrainContext, {
    cloudLayerCompleteness: layerContext,
    multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext,
    cloudSeaScore: window.shootableScore ?? window.score,
    shootabilityScore: window.shootableScore ?? window.score,
    formationScore: window.formationScore ?? window.score,
    whiteoutRiskScore: window.whiteoutRiskScore ?? result.cloudSeaAnalysis.whiteoutRiskScore,
    proposedRecommendationLabel:
      prefix === "best"
        ? result.cloudSeaAnalysis.recommendationLabel
        : prefix === "watch"
          ? "谨慎参考"
          : "不建议专程",
    bestWindow: window,
    hasWindow: true,
    bestWindowLabelZh: label,
  });
  const guardedWindowNote =
    windowGuard.finalRecommendationLevel === "strong_special_trip" ||
    windowGuard.finalRecommendationLevel === "recommended_arrangement"
      ? cloudSeaTerrainAwareText(window.noteZh, terrainContext)
      : `${windowGuard.reasonZh}。${windowGuard.normalizedWindowRecommendation.actionSuggestionZh}`;

  return {
    key: `${prefix}-${window.startTime}`,
    label:
      prefix === "best" ? windowGuard.normalizedWindowRecommendation.windowLabel : label,
    date: window.date,
    startTime: window.startTime,
    endTime: window.endTime,
    timeRangeLabel: formatWindow(window.startTime, window.endTime),
    score: window.shootableScore ?? window.score,
    recommendationLabel: windowGuard.finalRecommendationLabel,
    note: guardedWindowNote,
    riskTag: cloudSeaTerrainAwareText(window.riskTag, terrainContext),
    cloudSeaChance: scoreLevelText(scoreLevelFromScore(window.formationScore ?? window.score)),
    whiteoutRisk: whiteoutRiskLabel(window.whiteoutRiskScore ?? 0),
    rainInterference: cloudSeaRainOpeningSummary(window.rainOpening),
    windVisibilityNote: terrainContext.shouldDowngradeCloudSeaWording
      ? "风速、能见度、近地雾气和低云厚度需在到场前复核。"
      : "风速、能见度和低云厚度需在到场前复核。",
    actionSuggestion: cloudSeaTimelineActionSuggestion(
      window.shootableScore ?? window.score,
      window.whiteoutRiskScore ?? 0,
      window.phase === "observation"
        ? "shootable"
        : window.phase === "waiting"
          ? "watchable"
          : undefined,
      terrainContext,
      windowGuard,
    ),
    layerCompletenessNote:
      cloudLayerWindowRoleNote(result, window.startTime, window.endTime, terrainContext) ??
      cloudLayerWindowNote(layerContext),
    tone,
  };
}

function buildCloudSeaReasoningItems(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
): readonly CloudSeaReasoningItem[] {
  const analysis = result.cloudSeaAnalysis;
  const humidity = cloudSeaWeatherEvidence(result, "湿度");
  const dewPoint = cloudSeaWeatherEvidence(result, "露点差");
  const lowCloud = cloudSeaWeatherEvidence(result, "低云");
  const visibility = cloudSeaWeatherEvidence(result, "能见度");
  const wind = cloudSeaWeatherEvidence(result, "风速");
  const precipitation = cloudSeaWeatherEvidence(result, "降水");
  const relief = result.terrainAnalysis.terrainProfile.localReliefMeters;
  const cloudLayerRoleItem = buildCloudLayerRoleReasoningItem(result, terrainContext);

  return [
    {
      key: "humidity-dew-point",
      label: "湿度与露点差",
      value: joinKnownValues([humidity?.value, dewPoint?.value]),
      detail: cloudSeaTerrainAwareText(
        joinKnownDetails(
          [humidity?.noteZh, dewPoint?.noteZh],
          "水汽和露点差数据不足，需临近预报复核。",
        ),
        terrainContext,
      ),
      tone: analysis.formationScore >= 65 ? "primary" : "accent",
    },
    {
      key: "low-cloud-visibility",
      label: "低云与能见度",
      value: joinKnownValues([lowCloud?.value, visibility?.value]),
      detail: cloudSeaTerrainAwareText(
        joinKnownDetails(
          [lowCloud?.noteZh, visibility?.noteZh],
          "低云分层或能见度数据不足，需现场复核远山层次。",
        ),
        terrainContext,
      ),
      tone: analysis.whiteoutRiskScore >= 70 ? "danger" : "info",
    },
    {
      key: "cloud-layer-completeness",
      label: "云量分层完整性",
      value: cloudLayerCompletenessValue(cloudLayerCompleteness),
      detail: cloudLayerCompleteness.userNoteZh,
      tone: cloudLayerCompletenessTone(cloudLayerCompleteness),
    },
    ...(cloudLayerRoleItem ? [cloudLayerRoleItem] : []),
    {
      key: "wind-stability",
      label: "风速与云雾稳定性",
      value: wind?.value ?? cloudSeaWindValue(result),
      detail: cloudSeaTerrainAwareText(
        wind?.noteZh ??
          result.riskFlags.find((risk) => risk.key === "wind")?.description ??
          "风速资料不足，需观察云雾是否快速上涌或被吹散。",
        terrainContext,
      ),
      tone: result.riskFlags.some((risk) => risk.key === "wind") ? "accent" : "info",
    },
    {
      key: "rain-opening",
      label: "降水与雨后开口",
      value: precipitation
        ? `${precipitation.value} / ${postRainOpeningLabel(analysis.rainOpening.postRainOpeningChance)}`
        : postRainOpeningLabel(analysis.rainOpening.postRainOpeningChance),
      detail: cloudSeaTerrainAwareText(analysis.rainOpening.messageZh, terrainContext),
      tone: analysis.rainOpening.activeRainDuringWindow ? "danger" : "accent",
    },
    {
      key: "terrain-relief",
      label: "地形与高差",
      value:
        relief !== null && relief !== undefined
          ? `${Math.round(relief)} 米`
          : analysis.terrainSupport.level,
      detail: terrainContext.terrainNoteZh,
      tone: analysis.terrainSupport.level === "高" ? "primary" : "muted",
    },
    {
      key: "whiteout",
      label: terrainContext.vocabulary.obstructionRiskLabel,
      value: `${whiteoutRiskLabel(analysis.whiteoutRiskScore)}（${analysis.whiteoutRiskScore} 分）`,
      detail: cloudSeaTerrainAwareText(
        firstText(analysis.whiteoutReasons, "低云接近机位时可能遮挡视野。"),
        terrainContext,
      ),
      tone:
        analysis.whiteoutRiskScore >= 70
          ? "danger"
          : analysis.whiteoutRiskScore >= 45
            ? "accent"
            : "info",
    },
  ];
}

function buildCloudLayerRoleReasoningItem(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): CloudSeaReasoningItem | null {
  const rows = result.professionalHourlyData ?? [];
  const redirectedRows = rows.filter(
    (row) =>
      (row.cloudSeaSignal === "霞光参考" || row.cloudSeaSignal === "云层纹理") &&
      (!isMeaningfulNumber(row.cloudLowPercent) || row.cloudLowPercent < 35),
  );

  if (redirectedRows.length === 0) {
    return null;
  }

  const hasGlowReference = redirectedRows.some((row) => row.cloudSeaSignal === "霞光参考");
  return {
    key: "cloud-layer-role-separation",
    label: "中高云角色",
    value: hasGlowReference ? "霞光/纹理参考" : "云层纹理参考",
    detail: terrainContext.shouldDowngradeCloudSeaWording
      ? "中高云更适合观察霞光或云层纹理，低云信号不足时不按云海判断。"
      : "中高云较多时更偏向霞光或云层纹理参考；低云信号不足，不直接作为云海依据。",
    tone: "info",
  };
}

function buildCloudSeaActionPlan(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
): readonly CloudSeaActionPlanItem[] {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow = analysis.bestCloudSeaWindow;
  const mappedWindow = bestWindow
    ? windows.find(
        (window) =>
          window.startTime === bestWindow.startTime && window.endTime === bestWindow.endTime,
      )
    : windows[0];
  const backupPlan = analysis.backupPlans[0];
  const checkpoints = cloudSeaVerificationPoints(result, terrainContext);

  return [
    {
      key: "departure",
      label: "是否建议出发",
      value: recommendationGuard.actionPlanLabels.departure,
      detail: recommendationGuard.departureAdviceZh,
      tone: recommendationGuard.finalRecommendationTone,
    },
    {
      key: "arrival",
      label: "建议到达时间",
      value: cloudSeaArrivalLabel(result, bestWindow, mappedWindow),
      detail: bestWindow
        ? terrainContext.shouldDowngradeCloudSeaWording
          ? "到达后先观察近地雾气、低云是否贴地、远山层次和通透度。"
          : "到达后先观察云顶高度、低云厚度和远山层次。"
        : terrainContext.shouldDowngradeCloudSeaWording
          ? "暂无明确低云/晨雾窗口，先等待临近预报确认低云、雾气和能见度。"
          : "暂无明确云海窗口，先等待临近预报确认低云和能见度。",
      tone: "accent",
    },
    {
      key: "main-window",
      label: terrainContext.shouldDowngradeCloudSeaWording ? "观察窗口" : "主守窗口",
      value: recommendationGuard.actionPlanLabels.mainWindow,
      detail: recommendationGuard.normalizedWindowRecommendation.actionSuggestionZh,
      tone: recommendationGuard.finalRecommendationTone,
    },
    {
      key: "backup",
      label: "备选方案",
      value: cloudSeaTerrainAwareText(
        backupPlan?.action ??
          (terrainContext.shouldDowngradeCloudSeaWording
            ? "转向霞光或云层纹理"
            : "转拍近景和云雾流动"),
        terrainContext,
      ),
      detail: cloudSeaTerrainAwareText(
        backupPlan?.detail ??
          (terrainContext.shouldDowngradeCloudSeaWording
            ? "若低云贴地或通透不足，转向霞光、云层纹理、远山层次和近景氛围。"
            : "若白墙压顶，转拍近景、云雾流动、树影和山体层次。"),
        terrainContext,
      ),
      tone: "muted",
    },
    {
      key: "gear",
      label: "装备提醒",
      value: "防潮 / 防滑 / 镜头布",
      detail: cloudSeaGearAdvice(result, terrainContext),
      tone: "info",
    },
    {
      key: "verification",
      label: "现场复核点",
      value: `${checkpoints.length} 项`,
      detail: checkpoints.join("、"),
      tone: "primary",
    },
  ];
}

function buildCloudSeaTravelRecommendations(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaTravelRecommendation[] {
  return result.cloudSeaAnalysis.travelRecommendations.map((item) => ({
    situation: item.situation,
    action: cloudSeaTerrainAwareText(item.action, terrainContext),
    detail: cloudSeaTerrainAwareText(item.detail, terrainContext),
    tone:
      item.action.includes("不建议") || item.action.includes("不要")
        ? "danger"
        : item.action.includes("谨慎") || item.action.includes("备选")
          ? "accent"
          : "primary",
  }));
}

function buildCloudSeaRiskSummary(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): readonly ForecastResultSectionItem[] {
  const vocabulary = terrainContext.vocabulary;
  return [
    {
      label: vocabulary.formationCardLabel,
      value: result.cloudSeaAnalysis.labels.formationOpportunity,
      detail: `${result.cloudSeaAnalysis.formationScore} 分。${cloudSeaTerrainAwareText(
        firstText(
          result.cloudSeaAnalysis.opportunityReasons,
          "低云、湿度、露点差、风速和地形共同决定形成信号。",
        ),
        terrainContext,
      )}`,
    },
    {
      label: vocabulary.shootableCardLabel,
      value: result.cloudSeaAnalysis.labels.shootableOpportunity,
      detail: terrainContext.shouldDowngradeCloudSeaWording
        ? `${result.cloudSeaAnalysis.shootableScore} 分。已扣减低云遮挡、降水干扰和低光线不可观察时段。`
        : `${result.cloudSeaAnalysis.shootableScore} 分。已扣减白墙风险、降水干扰和低光线不可拍时段。`,
    },
    {
      label: vocabulary.obstructionRiskLabel,
      value: whiteoutRiskLabel(result.cloudSeaAnalysis.whiteoutRiskScore),
      detail: cloudSeaTerrainAwareText(
        firstText(
          result.cloudSeaAnalysis.whiteoutReasons,
          "低云或雾包住机位时，云海会转为白墙和低能见度。",
        ),
        terrainContext,
      ),
    },
    {
      label: "雨后开口",
      value: postRainOpeningLabel(result.cloudSeaAnalysis.rainOpening.postRainOpeningChance),
      detail: result.cloudSeaAnalysis.rainOpening.messageZh,
    },
    ...result.riskFlags.map((risk) =>
      riskItem({
        ...risk,
        label: cloudSeaTerrainAwareText(risk.label, terrainContext),
        description: cloudSeaTerrainAwareText(risk.description, terrainContext),
      }),
    ),
  ];
}

function buildCloudSeaBackupPlans(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaBackupPlan[] {
  return result.cloudSeaAnalysis.backupPlans.map((plan) => ({
    condition: cloudSeaTerrainAwareText(plan.condition, terrainContext),
    action: cloudSeaTerrainAwareText(plan.action, terrainContext),
    detail: cloudSeaTerrainAwareText(plan.detail, terrainContext),
  }));
}

function cloudSeaArrivalLabel(
  result: ForecastCalculationResult,
  bestWindow: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindow"],
  mappedWindow: ForecastResultWindow | undefined,
): string {
  if (mappedWindow?.arrivalFullLabel) {
    return mappedWindow.arrivalFullLabel;
  }
  if (!bestWindow?.startTime) {
    return "需临近预报复核";
  }
  return formatArrivalDeadlineZh(
    shiftIsoLikeTime(bestWindow.startTime, -90),
    result.calendarBasis.timezone,
  );
}

function cloudSeaConclusion(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
): string {
  const analysis = result.cloudSeaAnalysis;
  const whiteout = whiteoutRiskLabel(analysis.whiteoutRiskScore);

  if (
    recommendationGuard.finalRecommendationLevel === "do_not_go_special" ||
    recommendationGuard.finalRecommendationLevel === "backup_only"
  ) {
    return recommendationGuard.departureAdviceZh;
  }
  if (
    recommendationGuard.finalRecommendationLevel === "cautious_reference" ||
    recommendationGuard.finalRecommendationLevel === "observe_if_nearby"
  ) {
    return `${recommendationGuard.reasonZh}，${recommendationGuard.departureAdviceZh}`;
  }
  if (recommendationGuard.finalRecommendationLevel === "strong_special_trip") {
    return recommendationGuard.departureAdviceZh;
  }

  if (terrainContext.shouldDowngradeCloudSeaWording) {
    if (!analysis.bestCloudSeaWindow || analysis.formationScore < 45) {
      return "低海拔地点不按高山云海判断，当前更适合作为晨雾、低云、云层变化和通透观察参考。";
    }
    if (analysis.rainOpening.activeRainDuringWindow) {
      return `清晨有低云/晨雾信号，但主窗口受降水干扰，低云遮挡风险${whiteout}，需临近预报复核。`;
    }
    if (analysis.whiteoutRiskScore >= 70) {
      return "低云/晨雾信号存在，但低云遮挡风险偏高，需现场复核雾气厚度、低云是否贴地和远山层次。";
    }
    if (analysis.shootableScore >= 70) {
      return "低海拔地点不按高山云海判断，当前更适合作为晨雾、低云、云层变化和通透观察参考。";
    }
    return `清晨有低云/晨雾信号，但低云遮挡风险${whiteout}，需现场复核通透度和低云厚度。`;
  }

  if (!analysis.bestCloudSeaWindow || analysis.formationScore < 45) {
    return "云海信号不足，建议作为备选观察，不建议只为云海专程出发。";
  }
  if (analysis.rainOpening.activeRainDuringWindow) {
    return `清晨有云海形成信号，但主窗口受降水干扰，白墙风险${whiteout}，需临近预报复核。`;
  }
  if (analysis.whiteoutRiskScore >= 70) {
    return "云海形成信号存在，但白墙风险偏高，需现场复核低云高度和远山层次。";
  }
  if (analysis.shootableScore >= 70) {
    return "清晨云海窗口具备拍摄价值，到场后重点复核云顶高度和低云厚度。";
  }
  return `清晨有云海形成信号，但白墙风险${whiteout}，需现场复核低云厚度。`;
}

function cloudSeaRainOpeningSummary(
  rainOpening: ForecastCalculationResult["cloudSeaAnalysis"]["rainOpening"] | undefined,
): string {
  if (!rainOpening) {
    return "需临近预报复核";
  }
  const opening = postRainOpeningLabel(rainOpening.postRainOpeningChance);
  if (rainOpening.activeRainDuringWindow) {
    return `降水干扰 / 开口${opening}`;
  }
  return rainOpening.rainSupportSignal ? `雨后开口${opening}` : `开口${opening}`;
}

function cloudSeaTimelineActionSuggestion(
  score: number,
  whiteoutRiskScore: number,
  windowLevel: ForecastResultWindow["windowLevel"],
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard?: CloudSeaRecommendationGuardOutput,
): string {
  if (recommendationGuard) {
    return recommendationGuard.normalizedWindowRecommendation.actionSuggestionZh;
  }
  if (terrainContext.shouldDowngradeCloudSeaWording) {
    if (whiteoutRiskScore >= 70 || windowLevel === "blocked") {
      return "若低云贴地或雾气过厚，转向霞光、云层纹理、近景氛围和通透参考。";
    }
    if (score >= 70 || windowLevel === "best" || windowLevel === "shootable") {
      return "推荐观察此窗口，提前复核近地雾气、低云边界和远山层次。";
    }
    if (score >= 50 || windowLevel === "watchable") {
      return "可观察云层变化，不建议只为低云或晨雾专程等待。";
    }
    return "仅作备选，等待临近预报确认。";
  }
  if (whiteoutRiskScore >= 70 || windowLevel === "blocked") {
    return "若白墙压顶，转拍近景、云雾流动和山体层次。";
  }
  if (score >= 70 || windowLevel === "best" || windowLevel === "shootable") {
    return "优先守此窗口，提前完成机位和构图。";
  }
  if (score >= 50 || windowLevel === "watchable") {
    return "可观察云雾变化，不建议只守单一远景机位。";
  }
  return "仅作备选，等待临近预报确认。";
}

function cloudSeaWindVisibilityNote(result: ForecastCalculationResult): string {
  const wind = cloudSeaWeatherEvidence(result, "风速");
  const visibility = cloudSeaWeatherEvidence(result, "能见度");
  return joinKnownValues([wind?.value, visibility?.value]);
}

function cloudSeaWeatherEvidence(
  result: ForecastCalculationResult,
  label: string,
): ForecastCalculationResult["cloudSeaAnalysis"]["weatherEvidence"][number] | undefined {
  return result.cloudSeaAnalysis.weatherEvidence.find((item) => item.label === label);
}

function cloudLayerCompletenessContextForDate(
  result: ForecastCalculationResult,
  date: string,
): CloudLayerCompletenessContext {
  const rows = (result.professionalHourlyData ?? []).filter((row) =>
    row.time.startsWith(`${date}T`),
  );
  return rows.length > 0
    ? buildCloudLayerCompletenessContext(rows)
    : buildCloudLayerCompletenessContext(result.professionalHourlyData);
}

function cloudLayerDailyRoleNote(
  result: ForecastCalculationResult,
  date: string,
  terrainContext: CloudSeaTerrainContext,
): string | undefined {
  const redirectedRows = (result.professionalHourlyData ?? []).filter(
    (row) =>
      row.time.startsWith(`${date}T`) &&
      (row.cloudSeaSignal === "霞光参考" || row.cloudSeaSignal === "云层纹理") &&
      (!isMeaningfulNumber(row.cloudLowPercent) || row.cloudLowPercent < 35),
  );

  if (redirectedRows.length === 0) {
    return undefined;
  }

  return terrainContext.shouldDowngradeCloudSeaWording
    ? "中高云更适合观察霞光或云层纹理，不按云海判断。"
    : "云海信号偏弱，中高云对霞光更有参考价值。";
}

function cloudLayerCompletenessContextForWindow(
  result: ForecastCalculationResult,
  startTime: string,
  endTime: string,
): CloudLayerCompletenessContext {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const rows = (result.professionalHourlyData ?? []).filter((row) => {
    const time = Date.parse(row.time);
    return (
      Number.isFinite(time) &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      time >= start &&
      time <= end
    );
  });

  return rows.length > 0
    ? buildCloudLayerCompletenessContext(rows)
    : buildCloudLayerCompletenessContext(result.professionalHourlyData);
}

function cloudLayerWindowRoleNote(
  result: ForecastCalculationResult,
  startTime: string,
  endTime: string,
  terrainContext: CloudSeaTerrainContext,
): string | undefined {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  const redirectedRows = (result.professionalHourlyData ?? []).filter((row) => {
    const time = Date.parse(row.time);
    return (
      Number.isFinite(time) &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      time >= start &&
      time <= end &&
      (row.cloudSeaSignal === "霞光参考" || row.cloudSeaSignal === "云层纹理") &&
      (!isMeaningfulNumber(row.cloudLowPercent) || row.cloudLowPercent < 35)
    );
  });

  if (redirectedRows.length === 0) {
    return undefined;
  }

  return terrainContext.shouldDowngradeCloudSeaWording
    ? "中高云更适合观察霞光或云层纹理，不按云海判断。"
    : "云海信号不足，中高云可作为霞光参考。";
}

function cloudLayerDailyNote(context: CloudLayerCompletenessContext): string | undefined {
  if (context.layerCompletenessLevel === "complete") {
    return undefined;
  }
  if (context.cloudLayerBasis === "total_only") {
    return "当日仅有总云量，缺少低/中/高云分层，云海与白墙判断需复核。";
  }
  if (context.layerCompletenessLevel === "weak" || context.layerCompletenessLevel === "missing") {
    return "当日较多时段缺少低/中/高云分层，云海与白墙判断需复核。";
  }
  return "当日部分时段缺少低/中/高云分层，云海与白墙判断需复核。";
}

function cloudLayerWindowNote(context: CloudLayerCompletenessContext): string | undefined {
  if (context.layerCompletenessLevel === "complete") {
    return undefined;
  }
  if (context.lowLayerMissingHoursCount > 0) {
    return "低云分层缺失，窗口置信度降低";
  }
  return "云层分层不足，需临近复核";
}

function cloudLayerCompletenessValue(context: CloudLayerCompletenessContext): string {
  if (context.layerCompletenessLevel === "complete") {
    return "分层完整";
  }
  if (context.cloudLayerBasis === "total_only") {
    return "仅总云量";
  }
  if (context.layerCompletenessLevel === "weak" || context.layerCompletenessLevel === "missing") {
    return "分层不足";
  }
  return "部分缺失";
}

function cloudLayerCompletenessTone(
  context: CloudLayerCompletenessContext,
): ForecastResultCardTone {
  if (context.layerCompletenessLevel === "complete") {
    return "info";
  }
  if (context.layerCompletenessLevel === "missing") {
    return "danger";
  }
  return "accent";
}

function joinKnownValues(values: readonly (string | undefined)[]): string {
  const known = values.filter((value): value is string => Boolean(value));
  return known.length > 0 ? known.join(" / ") : "需临近预报复核";
}

function joinKnownDetails(values: readonly (string | undefined)[], fallback: string): string {
  const known = values.filter((value): value is string => Boolean(value));
  return known.length > 0 ? known.join(" ") : fallback;
}

function buildCloudSeaDataCaution(
  result: ForecastCalculationResult,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
  multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null,
  recommendationGuard?: CloudSeaRecommendationGuardOutput,
): string | null {
  const guardWarning =
    recommendationGuard?.consistencyWarnings[0] ??
    recommendationGuard?.blockedStrongRecommendationReasons[0];
  if (guardWarning) {
    return guardWarning;
  }
  if (multiSourceAgreementContext?.shouldShowReviewWarning) {
    return (
      multiSourceAgreementContext.keyWarningsZh[0] ?? "多源判断存在分歧，出行前需结合临近预报复核。"
    );
  }
  if (
    result.cloudSeaAnalysis.missingDataNotes.length > 0 ||
    cloudLayerCompleteness.shouldReduceCloudSeaConfidence ||
    hasMissingLowCloudLayer(result) ||
    result.cloudSeaAnalysis.terrainSupport.confidence !== "high"
  ) {
    return "部分地形或云层数据仍需结合临近预报复核。";
  }
  return null;
}

function cloudSeaVerificationPoints(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): readonly string[] {
  const fallback = terrainContext.shouldDowngradeCloudSeaWording
    ? ["复核近地雾气", "观察低云是否贴地", "观察远山层次和通透度", "有中高云时转向霞光或云层纹理"]
    : ["云层是否低于机位", "远山层次是否打开", "风向是否推动云雾上涌"];

  return (result.cloudSeaAnalysis.dailyCloudSea[0]?.onSiteCheckpoints ?? fallback).map((item) =>
    cloudSeaTerrainAwareText(item, terrainContext),
  );
}

function cloudSeaGearAdvice(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): string {
  const humidity = cloudSeaWeatherEvidence(result, "湿度")?.value;
  const rain = result.cloudSeaAnalysis.rainOpening.activeRainDuringWindow
    ? "主窗口有降水干扰，注意防水收纳。"
    : "清晨湿度高，注意镜头结露。";
  if (terrainContext.shouldDowngradeCloudSeaWording) {
    return `防潮、防滑，准备镜头布和轻量防风层。${
      humidity ? `湿度参考 ${humidity}，` : ""
    }复核低云、雾气和通透度后再决定是否等待。`;
  }
  return `防潮、防滑，准备镜头布和备用保暖层。${humidity ? `湿度参考 ${humidity}，` : ""}${rain}`;
}

function cloudSeaConfidenceLabel(
  level: ForecastCalculationResult["cloudSeaAnalysis"]["confidenceLevel"],
  cloudLayerCompleteness?: CloudLayerCompletenessContext,
  multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null,
): string {
  if (
    cloudLayerCompleteness &&
    (cloudLayerCompleteness.layerCompletenessLevel === "weak" ||
      cloudLayerCompleteness.layerCompletenessLevel === "missing")
  ) {
    return "低（分层云量不足）";
  }
  if (cloudLayerCompleteness?.shouldPreferNeedsReviewSignal) {
    return `${level === "high" ? "中" : level === "medium" ? "中" : "低"}（低云需复核）`;
  }
  if (multiSourceAgreementContext?.shouldLowerConfidence) {
    return level === "high" ? "中（多源分歧需复核）" : "低（多源分歧需复核）";
  }
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function shiftIsoLikeTime(value: string, minutes: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Date(timestamp + minutes * 60 * 1000).toISOString();
}

function whiteoutRiskLabel(score: number): "低" | "中" | "高" {
  if (score >= 70) {
    return "高";
  }
  if (score >= 45) {
    return "中";
  }
  return "低";
}

function postRainOpeningLabel(
  value: ForecastCalculationResult["cloudSeaAnalysis"]["rainOpening"]["postRainOpeningChance"],
): string {
  if (value === "high") {
    return "高";
  }
  if (value === "medium") {
    return "中";
  }
  return "低";
}

function scoreLevelText(level: ForecastScore["level"]): string {
  if (level === "excellent") {
    return "优秀";
  }
  if (level === "good") {
    return "较好";
  }
  if (level === "fair") {
    return "一般";
  }
  return "较差";
}

function scoreLevelFromScore(score: number): ForecastScore["level"] {
  if (score >= 80) {
    return "excellent";
  }
  if (score >= 65) {
    return "good";
  }
  if (score >= 45) {
    return "fair";
  }
  return "poor";
}

function cloudSeaWindowRiskTag(result: ForecastCalculationResult, score: number): string {
  if (whiteoutRiskLabel(result.scores.whiteoutRisk.score) === "高") {
    return "白墙风险高";
  }
  if (hasMissingLowCloudLayer(result)) {
    return "低云数据待补";
  }
  if (score >= 75) {
    return "重点窗口";
  }
  if (score >= 65) {
    return "可等待";
  }
  return "谨慎窗口";
}

function cloudSeaWindValue(result: ForecastCalculationResult): string {
  const windRisk = result.riskFlags.find(
    (risk) => risk.key === "wind" || risk.label.includes("风"),
  );
  return windRisk ? `${riskLevelText(windRisk.level)}风险` : "已纳入评分";
}

function hasMissingLowCloudLayer(result: ForecastCalculationResult): boolean {
  return (
    result.weatherMissingFields.includes("cloudLow") ||
    result.cloudSeaAnalysis.missingDataNotes.some((note) => note.includes("低云分层"))
  );
}

function buildCloudSeaDataNotice(result: ForecastCalculationResult): string {
  const notice = buildDataNotice(result);
  const notes = [
    ...result.cloudSeaAnalysis.missingDataNotes,
    ...(hasMissingLowCloudLayer(result)
      ? ["当前天气源缺少低云分层数据，云海判断置信度会降低。"]
      : []),
  ].filter((note) => !notice.includes(note));

  return notes.length > 0 ? `${notice}${notes.join("")}` : notice;
}

function windowDateLabel(result: ForecastCalculationResult, date: string | undefined): string {
  return date ? dateLabelForResult(result, date) : "未来窗口";
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
      ? "如果是专程远途，当前云海信号具备参考价值；正式天气数据源启用后再做最终决定。"
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

function mapDailyAstro(
  day: DailyAstro,
  milkyWayCandidateWindows: readonly AstroWindow[],
): AstroDailyTrendItem {
  const galacticCenterWindow =
    milkyWayCandidateWindows.find((window) => window.date === day.date) ??
    day.recommendedMilkyWayWindow;
  const blockers = astroBlockerSummary(day.weatherBlockers);
  const precipitationBlocker = day.weatherBlockers.find((blocker) => /降水|雨|雪/.test(blocker));

  return {
    key: `astro-daily-${day.date}`,
    date: day.date,
    dateLabel: day.dateLabelZh,
    lunarDateText: day.lunarDateText,
    starsScore: day.starsScore,
    milkyWayScore: day.milkyWayScore,
    astroConditionScore: day.astroConditionScore,
    astroPracticalScore: day.astroPracticalScore,
    skyConditionScore: day.skyConditionScore,
    milkyWayGeometryScore: day.milkyWayGeometryScore,
    transparencyScore: day.transparencyScore,
    dewRiskScore: day.dewRiskScore,
    astronomicalWindowAvailable: day.astronomicalWindowAvailable,
    astroShootable: day.astroShootable,
    weatherBlockers: day.weatherBlockers,
    moonImpactLabel: moonImpactLevelLabel(day.moonImpactLevel),
    starShootabilityLabel: day.labels.starShootability,
    milkyWayShootabilityLabel: day.labels.milkyWayShootability,
    cloudBlockerLabel: day.labels.cloudBlocker,
    dewRiskLabel: day.labels.dewRisk,
    windowRecommendationLabel: day.labels.windowRecommendation,
    astronomicalNightLabel: day.astronomicalNightWindow
      ? formatAstroWindowValue(day.astronomicalNightWindow)
      : "暂无完整窗口",
    moonlessNightLabel: day.moonlessNightWindow
      ? formatAstroWindowValue(day.moonlessNightWindow)
      : "暂无明确窗口",
    galacticCenterWindowLabel: galacticCenterWindow
      ? `${formatAstroWindowValue(galacticCenterWindow)}${
          galacticCenterWindow.directionZh ? `，${galacticCenterWindow.directionZh}` : ""
        }`
      : "暂无明确银心窗口",
    recommendedMilkyWayLabel: day.recommendedMilkyWayWindow
      ? day.astroShootable
        ? `推荐银河窗口：${formatAstroWindowValue(day.recommendedMilkyWayWindow)}`
        : `仅作备选：${formatAstroWindowValue(day.recommendedMilkyWayWindow)}；${blockers}不支持专程拍摄`
      : day.astroWindowAvailable
        ? `仅作备选窗口：${blockers}不支持专程拍摄`
        : "暂无推荐窗口",
    cloudConditionLabel:
      day.weatherBlockers.length > 0
        ? `${day.labels.cloudBlocker}：${blockers}`
        : day.labels.cloudBlocker,
    precipitationRiskLabel: precipitationBlocker ?? "降水未构成主要阻断",
    nightShootingAdviceLabel: day.astroShootable
      ? "建议夜拍"
      : day.astroWindowAvailable
        ? "仅作备选"
        : "不建议夜拍",
    blockerReasonLabel:
      day.weatherBlockers.length > 0
        ? `主要阻碍：${blockers}`
        : day.astroShootable
          ? "云量较低、月光影响小，可重点关注银河窗口。"
          : "暂无可执行银河窗口。",
    recommendationLabel: day.recommendationLabel,
    keyReason: day.keyReason,
    riskNote: day.riskNote,
  };
}

function astroBlockerSummary(blockers: readonly string[]): string {
  if (blockers.length === 0) {
    return "云量、低云、降水和通透度暂未构成主要阻断";
  }

  const text = blockers.join(" ");
  const labels = [
    /低云/.test(text) ? "低云偏多" : "",
    /总云|云量|云层|厚云/.test(text) ? "云量偏高" : "",
    /降水|雨|雪/.test(text) ? "降水干扰" : "",
    /通透|能见度|霾|雾/.test(text) ? "通透度不足" : "",
    /露|结露|湿度/.test(text) ? "露水风险" : "",
  ].filter(Boolean);

  return [
    ...new Set(
      labels.length > 0 ? labels : blockers.map((blocker) => blocker.replace(/[。.]$/, "")),
    ),
  ]
    .slice(0, 3)
    .join("、");
}

function mapAstroWindows(
  result: ForecastCalculationResult,
  windows: readonly AstroWindow[],
): readonly AstroWindowViewItem[] {
  return windows.map((window) => ({
    key: `${window.type}-${window.start}`,
    type: window.type,
    label: window.labelZh,
    dateLabel: window.date ? dateLabelForResult(result, window.date) : "未来窗口",
    timeRangeLabel: formatAstroWindowValue(window),
    score: window.score,
    riskTags: window.riskTags,
    note: window.noteZh,
    direction: window.directionZh,
    altitude: formatAngle(window.galacticCenterAltitude),
    tone: windowTone(window),
  }));
}

function mapAstroEvidence(items: readonly AstroEvidenceItem[]): readonly AstroEvidenceViewItem[] {
  return items.map((item) => ({
    key: keyFromLabel(item.label),
    label: item.label,
    value: item.value,
    detail: item.noteZh,
    tone: evidenceEffectTone(item.effect),
  }));
}

function moonImpactLevelLabel(level: DailyAstro["moonImpactLevel"] | undefined): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  if (level === "low") {
    return "低";
  }
  return "暂无";
}

function formatAstroWindowValue(window: Pick<AstroWindow, "start" | "end">): string {
  return formatShootingWindowZh({ startTime: window.start, endTime: window.end });
}

function windowTone(window: AstroWindow): ForecastResultCardTone {
  if (window.score >= 75) {
    return "primary";
  }
  if (window.score >= 55) {
    return "accent";
  }
  return "muted";
}

function evidenceEffectTone(effect: AstroEvidenceItem["effect"]): ForecastResultCardTone {
  if (effect === "positive") {
    return "primary";
  }
  if (effect === "risk") {
    return "danger";
  }
  if (effect === "negative") {
    return "accent";
  }
  return "muted";
}

function buildAstroWindows(result: ForecastCalculationResult): readonly ForecastResultWindow[] {
  return mapResultWindows(result.bestWindows.filter((window) => window.target === "astro"));
}

function mapResultWindows(
  windows: readonly ForecastTimeWindow[],
  timezone = "Asia/Shanghai",
): readonly ForecastResultWindow[] {
  return windows.map((window) => ({
    key: `${window.target}-${window.startTime}-${window.label}`,
    moduleKey: inferWindowModuleKey(window),
    label: displayWindowLabel(window),
    date: window.date,
    timeRangeLabel: formatShootingWindowZh(window, timezone, { style: "compact" }),
    fullTimeRangeLabel: formatShootingWindowZh(window, timezone),
    compactTimeRangeLabel: formatShootingWindowZh(window, timezone, { style: "compact" }),
    startTime: window.startTime,
    endTime: window.endTime,
    score: window.score,
    target: window.target,
    badgeLabel: forecastTargetLabels[window.target],
    conditionScore: window.conditionScore,
    practicalScore: window.practicalScore,
    humanCostLevel: window.humanCostLevel,
    recommendationLevel: window.recommendationLevel,
    recommendationLevelLabel: windowRecommendationLevelLabel(window.recommendationLevel),
    windowLevel: window.windowLevel,
    windowLevelLabel: windowLevelLabel(window.windowLevel),
    executableForDedicatedTrip: window.executableForDedicatedTrip,
    suitableIfNearby: window.suitableIfNearby,
    blockerReasons: window.blockerReasons,
    copyReasonZh: window.copyReasonZh,
    arrivalFullLabel: window.arrivalAdvice
      ? formatArrivalDeadlineZh(window.arrivalAdvice.recommendedArrivalTime, timezone)
      : undefined,
    practicalKind: window.practicalKind,
    lightPhase: window.lightPhase,
    practicalNoteZh: window.practicalNoteZh,
    precipitationRisk: window.precipitationRisk,
    weatherBlockers: window.weatherBlockers,
    subjectPriorityLabel: window.subjectPriorityLabel,
    backupSubjectLabel: window.backupSubjectLabel,
    restWarningZh: window.restWarningZh,
    arrivalAdvice: window.arrivalAdvice,
  }));
}

function displayWindowLabel(window: ForecastTimeWindow): string {
  const label = windowLabelText(window);
  if (
    window.target === "astro" &&
    label.includes("银河") &&
    (window.weatherBlockers?.length ?? 0) === 0
  ) {
    return "银河可拍窗口";
  }
  return label;
}

function windowRecommendationLevelLabel(
  level: ForecastWindowRecommendationLevel | undefined,
): string {
  return recommendationLevelText(level);
}

function windowLevelLabel(level: ForecastTimeWindow["windowLevel"]): string {
  if (level === "best") {
    return "推荐拍摄";
  }
  if (level === "shootable") {
    return "推荐拍摄";
  }
  if (level === "watchable") {
    return "可观察";
  }
  if (level === "blocked") {
    return "不建议";
  }
  return "仅作备选";
}

function isExecutableResultWindow(window: ForecastResultWindow): boolean {
  const hasHierarchy =
    window.windowLevel !== undefined || window.executableForDedicatedTrip !== undefined;
  if (window.executableForDedicatedTrip !== undefined) {
    return window.executableForDedicatedTrip;
  }
  if (!hasHierarchy) {
    return (
      window.practicalKind !== "formation_signal" &&
      window.recommendationLevel === "recommended" &&
      (window.practicalScore ?? window.score) >= 72
    );
  }
  return (
    window.practicalKind !== "formation_signal" &&
    (window.windowLevel === "best" || window.windowLevel === "shootable") &&
    window.recommendationLevel === "recommended" &&
    (window.practicalScore ?? window.score) >= 72
  );
}

function inferWindowModuleKey(window: ForecastTimeWindow): ForecastResultModuleKey {
  const subject = window.subjectPriorityLabel ?? window.label;
  if (
    window.target === "glow" &&
    (window.lightPhase === "dawn" || window.lightPhase === "sunrise" || subject.includes("朝霞"))
  ) {
    return "sunriseGlow";
  }
  if (
    window.target === "glow" &&
    (window.lightPhase === "sunset" ||
      window.lightPhase === "blue_hour" ||
      subject.includes("晚霞") ||
      subject.includes("日落"))
  ) {
    return "sunsetGlow";
  }
  if (window.target === "cloud_sea" || subject.startsWith("云海")) {
    return "cloudSea";
  }
  if (window.target === "astro" && subject.includes("银河")) {
    return "milkyWay";
  }
  if (window.target === "astro") {
    return "astronomicalNight";
  }
  return "bestWindow";
}

function firstRisk(risks: readonly ForecastRiskFlag[]): ForecastRiskFlag | undefined {
  return risks[0];
}

function bestGeneralSubjectLabel(result: ForecastCalculationResult): string {
  const best = bestGeneralSubject(result);
  return best ? `${best.label}（实用 ${best.priorityScore} 分）` : "综合判断";
}

function bestGeneralSubjectModuleKey(result: ForecastCalculationResult): ForecastResultModuleKey {
  return bestGeneralSubject(result)?.moduleKey ?? "recommendation";
}

function bestGeneralSubject(result: ForecastCalculationResult):
  | {
      readonly label: string;
      readonly moduleKey: ForecastResultModuleKey;
      readonly score: ForecastScore;
      readonly priorityScore: number;
    }
  | undefined {
  const candidates: readonly {
    readonly label: string;
    readonly moduleKey: ForecastResultModuleKey;
    readonly score: ForecastScore;
    readonly priorityScore: number;
  }[] = [
    {
      label: "云海",
      moduleKey: "cloudSea",
      score: result.scores.cloudSea,
      priorityScore: practicalSubjectScore(result, "cloud_sea", "云海"),
    },
    {
      label: "朝霞",
      moduleKey: "sunriseGlow",
      score: result.scores.sunriseGlow,
      priorityScore: practicalSubjectScore(result, "glow", "朝霞"),
    },
    {
      label: "晚霞",
      moduleKey: "sunsetGlow",
      score: result.scores.sunsetGlow,
      priorityScore: practicalSubjectScore(result, "glow", "晚霞"),
    },
    {
      label: "星空",
      moduleKey: "stars",
      score: result.scores.stars,
      priorityScore: practicalSubjectScore(result, "astro", "天文黑夜"),
    },
    {
      label: "银河",
      moduleKey: "milkyWay",
      score: result.scores.milkyWay,
      priorityScore: practicalSubjectScore(result, "astro", "银河"),
    },
    {
      label: "通透度",
      moduleKey: "transparency",
      score: result.scores.transparency,
      priorityScore: result.scores.transparency.score,
    },
  ];

  return [...candidates].sort((left, right) => right.priorityScore - left.priorityScore)[0];
}

function practicalSubjectScore(
  result: ForecastCalculationResult,
  target: ForecastTarget,
  labelHint: string,
): number {
  const window = result.bestWindows.find(
    (candidate) =>
      candidate.target === target &&
      isExecutableForecastWindow(candidate) &&
      forecastWindowMatchesSubject(candidate, labelHint),
  );
  if (window) {
    return window.practicalScore ?? window.score;
  }

  if (target === "astro" && !result.astroAnalysis.astroShootable) {
    return Math.min(result.astroAnalysis.astroPracticalScore, 34);
  }

  if (target === "cloud_sea") {
    return result.scores.cloudSea.score;
  }
  if (target === "glow" && labelHint === "朝霞") {
    return result.scores.sunriseGlow.score;
  }
  if (target === "glow") {
    return result.scores.sunsetGlow.score;
  }
  if (target === "astro" && labelHint === "银河") {
    return result.scores.milkyWay.score;
  }
  if (target === "astro") {
    return result.scores.stars.score;
  }

  return 0;
}

function isExecutableForecastWindow(window: ForecastTimeWindow): boolean {
  const hasHierarchy =
    window.windowLevel !== undefined || window.executableForDedicatedTrip !== undefined;
  if (!hasHierarchy) {
    return (
      window.practicalKind !== "formation_signal" &&
      window.recommendationLevel !== "backup" &&
      window.recommendationLevel !== "not_recommended"
    );
  }
  return (
    window.executableForDedicatedTrip === true ||
    (window.practicalKind !== "formation_signal" &&
      (window.windowLevel === "best" || window.windowLevel === "shootable") &&
      window.recommendationLevel !== "backup" &&
      window.recommendationLevel !== "not_recommended")
  );
}

function forecastWindowMatchesSubject(window: ForecastTimeWindow, labelHint: string): boolean {
  const subject = `${window.subjectPriorityLabel ?? ""} ${window.label}`;
  if (window.target === "glow" && labelHint === "朝霞") {
    return (
      window.lightPhase === "dawn" ||
      window.lightPhase === "sunrise" ||
      subject.includes("朝霞") ||
      subject.includes("日出")
    );
  }
  if (window.target === "glow" && labelHint === "晚霞") {
    return (
      window.lightPhase === "sunset" ||
      window.lightPhase === "blue_hour" ||
      subject.includes("晚霞") ||
      subject.includes("日落") ||
      subject.includes("蓝调")
    );
  }
  if (window.target === "astro" && labelHint === "银河") {
    return subject.includes("银河");
  }
  if (window.target === "astro") {
    return subject.includes("星空") || subject.includes("天文黑夜");
  }
  return subject.includes(labelHint);
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

function calibrationHintValue(
  confidenceAdjustment: NonNullable<
    ForecastCalculationResult["calibrationHint"]
  >["confidenceAdjustment"],
): string {
  if (confidenceAdjustment === "moderate_down") {
    return "建议降置信度";
  }
  if (confidenceAdjustment === "slight_down") {
    return "谨慎参考";
  }
  if (confidenceAdjustment === "slight_up") {
    return "历史较稳定";
  }
  return "辅助参考";
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
          detail: `${score.label}暂未给出明显风险，仍需结合最新天气和现场条件复核。`,
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

function moonCalculationNote(astro: AstroSummary | undefined): string {
  return (
    astro?.calculationNoteZh ??
    "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。"
  );
}

function firstText(items: readonly string[], fallback: string): string {
  return items[0] ?? fallback;
}

function keyFromLabel(label: string): string {
  return label
    .replace(/\s+/g, "-")
    .replace(/[^\p{Script=Han}a-zA-Z0-9-]/gu, "")
    .toLowerCase();
}

function effectLabel(effect: CloudSeaEvidenceEffect): string {
  if (effect === "positive") {
    return "支持云海";
  }
  if (effect === "negative") {
    return "削弱机会";
  }
  if (effect === "risk") {
    return "风险信号";
  }
  return "中性参考";
}

function evidenceTone(effect: CloudSeaEvidenceEffect): ForecastResultCardTone {
  if (effect === "positive") {
    return "primary";
  }
  if (effect === "negative" || effect === "risk") {
    return "accent";
  }
  return "muted";
}

function buildDataNotice(result: ForecastCalculationResult): string {
  const nonRealNotice =
    result.weatherDataMode === "real"
      ? "当前天气数据来自已启用的真实天气源，出行前仍需复核最新预警、道路和景区开放信息。"
      : "当前结果基于演示天气数据生成，仅用于体验分析流程。正式天气数据源启用后，将显示对应的数据来源与预报时间。";
  const astronomyNotice =
    result.astroDataSourceLabelZh === "本地天文服务计算"
      ? "天文时间由本地天文服务计算，实际拍摄仍需结合云量、光污染和地形遮挡。"
      : "天文时间为简化本地估算，实际拍摄仍需结合云量、光污染和地形遮挡。";
  const cloudLayerNote = hasMissingCloudLayers(result)
    ? "；当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。"
    : "";

  return `天气数据：${weatherStatusLabelForViewModel(result)}；${result.terrainAnalysis.honestyNoteZh}；天文数据：${result.astroDataSourceLabelZh}。${nonRealNotice}${astronomyNotice}${cloudLayerNote}`;
}

function buildAstroDataNotice(result: ForecastCalculationResult): string {
  const cloudLayerNote = hasMissingCloudLayers(result)
    ? "；当前天气源缺少低云/中云/高云分层数据，星空银河判断置信度会降低。"
    : "";

  const weatherNotice =
    result.weatherDataMode === "real"
      ? "当前天气数据来自已启用的正式数据源，星空银河判断仍需结合现场环境复核。"
      : "当前结果基于演示天气数据生成，用于体验分析流程，正式出行前需要复核真实预报和现场环境。";

  return `天文数据：${result.astroDataSourceLabelZh}；天气数据：${weatherStatusLabelForViewModel(
    result,
  )}；地形数据：${result.terrainAnalysis.dataSourceLabelZh}；光污染数据：暂未接入。${
    result.terrainAnalysis.honestyNoteZh
  }${weatherNotice}${cloudLayerNote}`;
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

function weatherStatusLabelForViewModel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "已启用真实天气数据";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例天气数据";
  }
  if (result.weatherDataMode === "fallback") {
    return "已回退演示天气数据";
  }
  return "演示天气数据";
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
  return formatShootingWindowZh({ startTime, endTime });
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

function formatElevationValue(value: number | null | undefined): string {
  return isMeaningfulNumber(value) ? `约 ${Math.round(value)} 米` : "暂未确认";
}

function formatMeters(value: number | null | undefined): string {
  return isMeaningfulNumber(value) ? `${Math.round(value)} 米` : "暂无数据";
}

function isMeaningfulNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
