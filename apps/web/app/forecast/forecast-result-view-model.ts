import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  buildCloudSeaPrecipitationSignalContext,
  buildCloudSeaRecommendationExplanation,
  buildCloudSeaWindowCenteredRiskContext,
  formatArrivalDeadlineZh,
  formatShootingWindowZh,
  forecastTargetLabels,
  type CloudLayerCompletenessContext,
  type CloudSeaCloudBasisConsistencyContext,
  type CloudSeaPrecipitationSignalContext,
  type CloudSeaRecommendationExplanation,
  type CloudSeaRecommendationGuardOutput,
  type CloudSeaScoreCalibrationContext,
  type CloudSeaWindowRiskContext,
  type CloudSeaWeatherVariableConsistencyContext,
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
  type GlowAerosolAssessment,
  type GlowBackupPlan,
  type GlowBestTarget,
  type GlowEvidenceItem,
  type GlowTerrainObstructionAssessment,
  type GlowWindow,
  type PhotographyPrecipitationRisk,
} from "@photo-weather/shared";
import { addHoursInTimezone } from "@photo-weather/calendar";
import {
  bestShootableWindowText,
  recommendationLevelText,
  watchableWindowText,
  windowLabelText,
} from "./forecast-copy";
import { cloudSeaTerrainAwareText, type CloudSeaTerrainContext } from "./cloud-sea-terrain-context";
import {
  buildCloudSeaRecommendationGuardForRuleContext,
  buildCloudSeaRuleContext,
  type CloudSeaRuleContext,
} from "./cloud-sea-rule-context";
import {
  buildCloudSeaDisplayTemperatureContext,
  type CloudSeaDisplayTemperatureContext,
} from "./cloud-sea-display-temperature";
import {
  buildCloudSeaDisplayData,
  buildProfessionalHourlyDisplayDataForResult,
  type CloudSeaDisplayData,
  type CloudSeaProfessionalHourlyWindow,
  type ProfessionalHourlyDisplayData,
  type ProfessionalHourlyRowAnnotation,
} from "./cloud-sea-display-data";

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
  readonly decisionReason?: string;
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
  readonly displayLabelZh: string;
  readonly timeRangeLabel: string;
  readonly score: number;
  readonly recommendationLabel: string;
  readonly labelReason: string;
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
  readonly displayData: CloudSeaDisplayData;
  readonly ruleContext: CloudSeaRuleContext;
  readonly terrainContext: CloudSeaTerrainContext;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly windowRiskContext?: CloudSeaWindowRiskContext;
  readonly precipitationSignal: CloudSeaPrecipitationSignalContext;
  readonly recommendationGuard: CloudSeaRecommendationGuardOutput;
  readonly recommendationExplanation: CloudSeaRecommendationExplanation;
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
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
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
  readonly cloudLayerSummaryLabel: string;
  readonly aerosolTransparencyLabel: string;
  readonly terrainObstructionLabel: string;
  readonly precipitationWindRiskLabel: string;
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

export type GlowSunWindowCard = {
  readonly key: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly phase: "sunrise" | "sunset";
  readonly title: string;
  readonly prepWindowLabel: string;
  readonly coreWindowLabel: string;
  readonly twilightWindowLabel: string;
  readonly azimuthLabel: string;
  readonly terrainLabel: string;
  readonly bestWindowLabel: string;
  readonly recommendationLabel: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type GlowAerosolCard = {
  readonly key: string;
  readonly stateLabel: string;
  readonly scoreLabel: string;
  readonly measurementLabel: string;
  readonly sourceLabel: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type GlowTerrainObstructionCard = {
  readonly key: string;
  readonly dateLabel: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly azimuthLabel: string;
  readonly horizonLabel: string;
  readonly clearanceLabel: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type GlowForecastViewModel = {
  readonly coreCards: readonly ForecastResultCard[];
  readonly dailyTrend: readonly GlowDailyTrendItem[];
  readonly glowWindows: readonly GlowWindowItem[];
  readonly professionalHourlyData: ProfessionalHourlyDisplayData;
  readonly sunWindowCards: readonly GlowSunWindowCard[];
  readonly aerosolCard: GlowAerosolCard;
  readonly terrainObstructionCards: readonly GlowTerrainObstructionCard[];
  readonly cloudLayerEvidence: readonly GlowEvidenceViewItem[];
  readonly visibilityEvidence: readonly GlowEvidenceViewItem[];
  readonly aerosolEvidence: readonly GlowEvidenceViewItem[];
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
    result.bestWindows.filter(
      (window) =>
        window.target === "cloud_sea" && forecastWindowStartsAtOrAfterAnchor(result, window),
    ),
    result.calendarBasis.timezone,
  );
  const cloudLayerCompleteness = ruleContext.cloudLayerCompletenessContext;
  const cloudBasisConsistency = ruleContext.cloudBasisConsistencyContext;
  const multiSourceAgreementContext = ruleContext.multiSourceAgreementContext;
  const weatherVariableConsistencyContext = ruleContext.weatherVariableConsistencyContext;
  const displayTemperatureContext = buildCloudSeaDisplayTemperatureContextForResult(
    result,
    terrainContext,
    weatherVariableConsistencyContext.temperatureBasisContext,
  );
  const precipitationSignalContext = ruleContext.precipitationSignalContext;
  const recommendationGuard = ruleContext.recommendationGuardContext;
  const whiteoutLabel = whiteoutRiskLabel(analysis.whiteoutRiskScore);
  const dataNotice = buildCloudSeaDataNotice(result);
  const vocabulary = terrainContext.vocabulary;
  const explanationBestWindow =
    (forecastWindowStartsAtOrAfterAnchor(result, analysis.bestCloudSeaWindow)
      ? analysis.bestCloudSeaWindow
      : analysis.bestCloudSeaWindows.find((window) =>
          forecastWindowStartsAtOrAfterAnchor(result, window),
        ) ??
        analysis.watchableCloudSeaWindows.find((window) =>
          forecastWindowStartsAtOrAfterAnchor(result, window),
        )) ?? null;
  const windowRiskContext = resolveCloudSeaWindowRiskContextForViewModel({
    result,
    bestWindow: explanationBestWindow,
    precipitationSignalContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    displayTemperatureContext,
    terrainContext,
  });
  const recommendationExplanation = buildCloudSeaRecommendationExplanation({
    finalRecommendationLabel: recommendationGuard.finalRecommendationLabel,
    cloudSeaScore: analysis.scoreCalibration.finalCloudSeaScore,
    formationScore: analysis.formationScore,
    shootabilityScore: analysis.scoreCalibration.calibratedShootabilityScore,
    whiteoutRiskScore: analysis.whiteoutRiskScore,
    terrainContext: {
      shouldDowngradeCloudSeaWording: terrainContext.shouldDowngradeCloudSeaWording,
      isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
      terrainClass: terrainContext.terrainClass,
      terrainNoteZh: terrainContext.terrainNoteZh,
    },
    cloudLayerCoverageContext: cloudLayerCompleteness,
    cloudBasisConsistencyContext: cloudBasisConsistency,
    weatherVariableConsistencyContext,
    precipitationSignalContext,
    multiSourceAgreementContext,
    bestWindow: explanationBestWindow,
    recommendationGuardContext: recommendationGuard,
  });
  const hero = buildCloudSeaHeroConclusion(
    result,
    cloudSeaWindows,
    terrainContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    multiSourceAgreementContext,
    recommendationGuard,
    weatherVariableConsistencyContext,
    recommendationExplanation,
    windowRiskContext,
  );
  const shootableCardDetail =
    analysis.scoreCalibration.capApplied || analysis.scoreCalibration.capReasons.length > 0
      ? analysis.scoreCalibration.scoreExplanationZh
      : terrainContext.shouldDowngradeCloudSeaWording
        ? `光线重叠 ${analysis.lightAlignedScore} 分，低云遮挡和降水打断已扣减。`
        : `光线重叠 ${analysis.lightAlignedScore} 分，白墙风险和降水打断已扣减。`;
  const coreCards = [
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
      shootableCardDetail,
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
  ];
  const dailyTrend = buildCloudSeaDailyTrend(
    result,
    cloudSeaWindows,
    terrainContext,
    weatherVariableConsistencyContext,
    cloudBasisConsistency,
    precipitationSignalContext,
  );
  const weatherEvidence = buildCloudSeaWeatherEvidence(
    result,
    terrainContext,
    precipitationSignalContext,
  );
  const cloudSeaWindowItems = buildCloudSeaWindowItems(
    result,
    cloudSeaWindows,
    terrainContext,
    recommendationGuard,
    weatherVariableConsistencyContext,
    cloudBasisConsistency,
    precipitationSignalContext,
    recommendationExplanation,
    windowRiskContext,
  );
  const reasoningItems = buildCloudSeaReasoningItems(
    result,
    terrainContext,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    weatherVariableConsistencyContext,
    recommendationGuard,
    recommendationExplanation,
    windowRiskContext,
  );
  const actionPlan = buildCloudSeaActionPlan(
    result,
    cloudSeaWindows,
    terrainContext,
    recommendationGuard,
    displayTemperatureContext,
    weatherVariableConsistencyContext,
    precipitationSignalContext,
    recommendationExplanation,
    windowRiskContext,
  );
  const riskSummary = buildCloudSeaRiskSummary(
    result,
    terrainContext,
    weatherVariableConsistencyContext,
    precipitationSignalContext,
    windowRiskContext,
  );
  const recommendationCards = buildCloudSeaRecommendationCards({
    result,
    hero,
    recommendationGuard,
    recommendationExplanation,
    coreCards,
    riskSummary,
    terrainContext,
  });
  const scoreCardSummary = cloudSeaScoreCardSummary(
    result.cloudSeaAnalysis.shootableScore,
    hero.recommendationLabel,
    recommendationExplanation,
    terrainContext,
    result.cloudSeaAnalysis.scoreCalibration,
  );
  const dataCaution = buildCloudSeaDataCaution(
    result,
    cloudLayerCompleteness,
    cloudBasisConsistency,
    multiSourceAgreementContext,
    terrainContext,
    recommendationGuard,
    weatherVariableConsistencyContext,
  );
  const displayData = buildCloudSeaDisplayData({
    result,
    ruleContext,
    terrainContext,
    displayTemperatureContext,
    recommendationGuard,
    recommendationExplanation,
    windowRiskContext,
    header: hero,
    scoreCardSummary,
    recommendationCards,
    cloudSeaWindowCards: cloudSeaWindowItems,
    dailyJudgment: dailyTrend,
    judgmentBasis: reasoningItems,
    actionPlan,
    riskReview: riskSummary,
  });

  return {
    displayData,
    ruleContext,
    terrainContext,
    displayTemperatureContext,
    windowRiskContext,
    precipitationSignal: precipitationSignalContext,
    recommendationGuard,
    recommendationExplanation,
    hero,
    coreCards,
    dailyTrend,
    terrainEvidence: buildCloudSeaTerrainEvidence(result, terrainContext),
    weatherEvidence,
    cloudSeaWindows: cloudSeaWindowItems,
    reasoningItems,
    actionPlan,
    travelRecommendations: buildCloudSeaTravelRecommendations(result, terrainContext),
    riskSummary,
    backupPlans: buildCloudSeaBackupPlans(result, terrainContext),
    cloudLayerCompleteness,
    cloudBasisConsistency,
    multiSourceAgreementContext,
    missingDataNotes: analysis.missingDataNotes,
    dataCaution,
    dataNotice,
  };
}

function buildCloudSeaDisplayTemperatureContextForResult(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  temperatureBasisContext: CloudSeaWeatherVariableConsistencyContext["temperatureBasisContext"],
): CloudSeaDisplayTemperatureContext {
  const current = result.currentWeather;
  const dailyWeather = result.dailySummaries[0]?.weather;
  const firstProfessionalHour = firstRollingProfessionalHour(result);
  const cameraElevationMeters = firstFiniteNumber([
    terrainContext.elevationMeters,
    result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
    current?.temperatureAdjustment?.selectedSpotElevationMeters,
    current?.selectedSpotElevationMeters,
    dailyWeather?.selectedSpotElevationMeters,
    result.terrainAnalysis.terrainProfile.locationElevation,
    result.terrainAnalysis.terrainProfile.elevationMeters,
  ]);
  const modelElevationMeters = firstFiniteNumber([
    current?.temperatureAdjustment?.providerElevationMeters,
    current?.providerElevationMeters,
    dailyWeather?.providerElevationMeters,
  ]);
  const rawGridTemperatureC = firstFiniteNumber([
    firstProfessionalHour?.rawTemperatureC,
    temperatureBasisContext.rawGridTemperatureC,
    current?.rawTemperature,
    averageNumbers(dailyWeather?.rawTempMin, dailyWeather?.rawTempMax),
  ]);
  const terrainAdjustedTemperatureC = firstFiniteNumber([
    firstProfessionalHour?.terrainAdjustedTemperatureC,
    temperatureBasisContext.terrainAdjustedTemperatureC,
    current?.elevationAdjustedTemperature,
    averageNumbers(dailyWeather?.elevationAdjustedTempMin, dailyWeather?.elevationAdjustedTempMax),
  ]);

  return buildCloudSeaDisplayTemperatureContext({
    temperatureBasisContext,
    rawGridTemperatureC,
    terrainAdjustedTemperatureC,
    providerTemperatureC: current?.temperature,
    displayedTemperatureC:
      firstProfessionalHour?.displayedTemperatureC ??
      temperatureBasisContext.displayTemperatureC ??
      current?.temperature,
    displayTemperatureRangeC: [dailyWeather?.tempMin, dailyWeather?.tempMax],
    bodyFeelTemperatureC: current?.mountainFeelsLikeC ?? current?.feelsLike,
    bodyFeelRangeC: [
      dailyWeather?.mountainFeelsLikeMin ?? dailyWeather?.feelsLikeMin,
      dailyWeather?.mountainFeelsLikeMax ?? dailyWeather?.feelsLikeMax,
    ],
    cameraElevationMeters,
    modelElevationMeters,
    surroundingReliefMeters:
      terrainContext.surroundingReliefMeters ??
      result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
    terrainType: terrainContext.terrainType,
    terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
    terrainClass: terrainContext.terrainClass,
    isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
    windSpeedMs: current?.windSpeed ?? dailyWeather?.windSpeed,
    windGustMs: current?.windGust ?? dailyWeather?.windGust,
    humidityPercent: current?.humidity ?? dailyWeather?.humidity,
    sourceTemperatureBasis:
      firstProfessionalHour?.temperatureBasis ?? temperatureBasisContext.temperatureBasis,
  });
}

function resolveCloudSeaWindowRiskContextForViewModel(input: {
  readonly result: ForecastCalculationResult;
  readonly bestWindow?: { readonly startTime?: string | null; readonly endTime?: string | null } | null;
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext;
  readonly displayTemperatureContext: CloudSeaDisplayTemperatureContext;
  readonly terrainContext: CloudSeaTerrainContext;
}): CloudSeaWindowRiskContext | undefined {
  const analysis = input.result.cloudSeaAnalysis;
  const existing = analysis.windowRiskContext ?? analysis.scoreCalibration.windowRiskContext;
  if (existing) {
    return existing;
  }

  const rows = input.result.professionalHourlyData ?? [];
  const mainWindow =
    input.bestWindow ??
    analysis.bestCloudSeaWindow ??
    analysis.bestCloudSeaWindows[0] ??
    analysis.watchableCloudSeaWindows[0] ??
    null;
  if (rows.length === 0 && !mainWindow) {
    return undefined;
  }

  return buildCloudSeaWindowCenteredRiskContext({
    normalizedHourlyRows: rows,
    bestWindow: mainWindow,
    mainWindow,
    backupWindows: [...analysis.bestCloudSeaWindows, ...analysis.watchableCloudSeaWindows],
    forecastWindowRange: {
      startTime:
        input.result.professionalHourlyDataTimeBasis?.anchorStartLocal ??
        input.result.forecastStart,
      endTime:
        input.result.professionalHourlyDataTimeBasis?.anchorEndLocal ?? input.result.forecastEnd,
    },
    precipitationSignalContext: input.precipitationSignalContext,
    cloudLayerCoverageContext: input.cloudLayerCompleteness,
    cloudBasisConsistencyContext: input.cloudBasisConsistency,
    displayTemperatureContext: {
      displayTemperatureC: input.displayTemperatureContext.displayTemperatureC,
      bodyFeelTemperatureC: input.displayTemperatureContext.bodyFeelTemperatureC,
      terrainAdjustedTemperatureC: input.displayTemperatureContext.terrainAdjustedTemperatureC,
      rawTemperatureC: input.displayTemperatureContext.rawGridTemperatureC,
      basis: input.displayTemperatureContext.basis,
    },
    terrainContext: {
      elevationMeters: input.terrainContext.elevationMeters,
      surroundingReliefMeters: input.terrainContext.surroundingReliefMeters,
      terrainMode: analysis.terrainSupport.terrainMode,
      terrainType: input.terrainContext.terrainType,
      confidence: analysis.terrainSupport.confidence,
    },
    whiteoutRiskContext: {
      whiteoutRiskScore: analysis.whiteoutRiskScore,
    },
    timezone: input.result.calendarBasis.timezone,
  });
}

function firstRollingProfessionalHour(
  result: ForecastCalculationResult,
): NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number] | undefined {
  const rows = result.professionalHourlyData ?? [];
  const anchorMs = Date.parse(
    result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
  );
  if (!Number.isFinite(anchorMs)) {
    return rows[0];
  }
  return rows
    .map((row) => ({ row, timestamp: Date.parse(row.time) }))
    .filter(
      (
        entry,
      ): entry is {
        readonly row: NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number];
        readonly timestamp: number;
      } => Number.isFinite(entry.timestamp) && entry.timestamp >= anchorMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)[0]?.row;
}

function buildCloudSeaRecommendationCards({
  result,
  hero,
  recommendationGuard,
  recommendationExplanation,
  coreCards,
  riskSummary,
  terrainContext,
}: {
  readonly result: ForecastCalculationResult;
  readonly hero: CloudSeaHeroConclusionView;
  readonly recommendationGuard: CloudSeaRecommendationGuardOutput;
  readonly recommendationExplanation: CloudSeaRecommendationExplanation;
  readonly coreCards: readonly ForecastResultCard[];
  readonly riskSummary: readonly ForecastResultSectionItem[];
  readonly terrainContext: CloudSeaTerrainContext;
}): readonly ForecastResultCard[] {
  const formation = coreCards.find((card) => card.key.includes("formation")) ?? coreCards[0];
  const shootable = coreCards.find((card) => card.key.includes("shootable")) ?? coreCards[1];
  const whiteout = coreCards.find((card) => card.moduleKey === "whiteoutRisk") ?? coreCards[2];
  const mainRisk = cloudSeaMainRiskFromSummary(riskSummary);
  const vocabulary = terrainContext.vocabulary;
  const scoreCalibration = result.cloudSeaAnalysis.scoreCalibration;
  const formationShootableDetail =
    scoreCalibration.capApplied || scoreCalibration.capReasons.length > 0
      ? scoreCalibration.scoreExplanationZh
      : `形成 ${result.cloudSeaAnalysis.formationScore} 分，可拍 ${
          result.cloudSeaAnalysis.shootableScore
        } 分。${cloudSeaTerrainAwareText(
          firstText(
            result.cloudSeaAnalysis.opportunityReasons,
            terrainContext.shouldDowngradeCloudSeaWording
              ? "低云、晨雾、云层开口、湿度、露点差、风速和地形共同决定观察参考。"
              : "低云、湿度、露点差、风速和地形共同决定云海机会。",
          ),
          terrainContext,
        )}`;

  return [
    textCard(
      "cloud-sea-recommendation",
      "recommendation",
      "推荐等级",
      hero.recommendationLabel,
      firstDisplaySentence(recommendationExplanation.oneLineConclusionZh),
      cloudSeaRecommendationTone(hero.recommendationLabel),
    ),
    textCard(
      "cloud-sea-best-window",
      "bestWindow",
      recommendationGuard.normalizedWindowRecommendation.metricLabel,
      hero.bestWindowLabel,
      firstDisplaySentence(recommendationExplanation.actionSummaryZh),
      "accent",
    ),
    textCard(
      "cloud-sea-arrival",
      "recommendation",
      "建议到达",
      hero.arrivalLabel,
      terrainContext.shouldDowngradeCloudSeaWording
        ? "窗口前到位，先看低云是否贴地、远山层次和通透度。"
        : "窗口前到位，先看云顶高度、低云厚度和远山层次。",
      recommendationGuard.finalRecommendationTone,
    ),
    scoreCard(
      "cloud-sea-formation-shootable",
      "cloudSea",
      vocabulary.formationShootableMetricLabel,
      `${formation?.value ?? result.cloudSeaAnalysis.labels.formationOpportunity} / ${
        shootable?.value ?? result.cloudSeaAnalysis.labels.shootableOpportunity
      }`,
      formationShootableDetail,
      result.cloudSeaAnalysis.shootableScore >= 65 ? "primary" : "accent",
      result.cloudSeaAnalysis.shootableScore,
    ),
    scoreCard(
      "cloud-sea-whiteout-risk",
      "whiteoutRisk",
      vocabulary.obstructionRiskLabel,
      whiteout?.value ?? result.cloudSeaAnalysis.labels.whiteoutRisk,
      cloudSeaTerrainAwareText(
        firstText(result.cloudSeaAnalysis.whiteoutReasons, "低云接近机位时可能遮挡视野。"),
        terrainContext,
      ),
      result.cloudSeaAnalysis.whiteoutRiskScore >= 70
        ? "danger"
        : result.cloudSeaAnalysis.whiteoutRiskScore >= 45
          ? "accent"
          : "info",
      result.cloudSeaAnalysis.whiteoutRiskScore,
    ),
    textCard(
      "cloud-sea-main-risk",
      "risk",
      "主要风险",
      mainRisk.label,
      mainRisk.detail || "出行前复核最新天气、道路和景区开放信息。",
      mainRisk.value?.includes("高")
        ? "danger"
        : mainRisk.value?.includes("中")
          ? "accent"
          : "muted",
    ),
  ];
}

function cloudSeaScoreCardSummary(
  score: number,
  recommendationLabel: string,
  recommendationExplanation: CloudSeaRecommendationExplanation,
  terrainContext: CloudSeaTerrainContext,
  scoreCalibration?: CloudSeaScoreCalibrationContext,
): string {
  const hasCalibrationCap =
    scoreCalibration !== undefined &&
    (scoreCalibration.capApplied || scoreCalibration.capReasons.length > 0);
  if (hasCalibrationCap) {
    return firstDisplaySentence(scoreCalibration.recommendationExplanationZh);
  }
  if (score >= 70 && !recommendationLabel.includes("强推荐")) {
    return terrainContext.shouldDowngradeCloudSeaWording
      ? "低云和晨雾信号较好，但窗口稳定性和现场通透度仍需复核。"
      : "云层条件较好，但窗口稳定性和现场云顶高度仍需复核。";
  }
  return firstDisplaySentence(recommendationExplanation.scoreReasonZh);
}

function cloudSeaMainRiskFromSummary(
  riskSummary: readonly ForecastResultSectionItem[],
): ForecastResultSectionItem {
  return (
    riskSummary.find(
      (item) =>
        ![
          "云海形成机会",
          "云海可拍机会",
          "低云/晨雾信号",
          "云层可观察机会",
          "雨后开口",
          "降水概率",
          "预计雨量",
        ].includes(item.label),
    ) ??
    riskSummary[0] ?? {
      label: "主要风险",
      detail: "出行前复核最新天气、道路和景区开放信息。",
    }
  );
}

function cloudSeaRecommendationTone(label: string): ForecastResultCardTone {
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("谨慎") || label.includes("备选") || label.includes("观察")) {
    return "accent";
  }
  return "primary";
}

function firstDisplaySentence(value: string): string {
  return value.split(/[。！？]/)[0]?.trim() || value;
}

function firstFiniteNumber(values: readonly (number | null | undefined)[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function averageNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
): number | undefined {
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right)
  ) {
    return Math.round(((left + right) / 2) * 10) / 10;
  }
  return undefined;
}

function buildCloudSeaViewModel(result: ForecastCalculationResult): ForecastResultViewModel {
  const shellCopy = targetShellCopies.cloud_sea;
  const cloudSea = buildCloudSeaForecastViewModel(result);
  const cloudSeaAdvice = buildCloudSeaAdvice(result);
  const cloudSeaWindows = mapResultWindows(
    result.bestWindows.filter((window) => window.target === "cloud_sea"),
    result.calendarBasis.timezone,
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
  const professionalHourlyData = buildProfessionalHourlyDisplayDataForResult({
    result,
    focusWindows: buildGlowProfessionalFocusWindows(analysis),
    riskWindows: analysis.notRecommendedGlowWindows.map(glowWindowToProfessionalWindow),
    rowAnnotations: buildGlowProfessionalHourlyAnnotations(result),
  });
  const aerosolCard = buildGlowAerosolCard(analysis.aerosolAssessment);
  const terrainObstructionCards = buildGlowTerrainObstructionCards(result, analysis);
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
      textCard(
        "glow-aerosol-transparency",
        "transparency",
        "气溶胶与通透度",
        aerosolCard.stateLabel,
        aerosolCard.detail,
        aerosolCard.tone,
      ),
      textCard(
        "glow-terrain-obstruction",
        "terrain",
        "地形遮挡",
        terrainObstructionCards.length > 0
          ? terrainObstructionCards.map((card) => `${card.title}：${card.statusLabel}`).join("；")
          : "方向性地形剖面暂缺",
        terrainObstructionCards.length > 0
          ? terrainObstructionCards.map((card) => card.detail).join("；")
          : "不使用单点海拔推断日出/日落方向遮挡。",
        terrainObstructionCards.some((card) => card.tone === "danger") ? "danger" : "info",
      ),
    ],
    dailyTrend: buildGlowDailyTrend(result, analysis),
    glowWindows: buildGlowWindowItems(result, analysis),
    professionalHourlyData,
    sunWindowCards: buildGlowSunWindowCards(result, analysis),
    aerosolCard,
    terrainObstructionCards,
    cloudLayerEvidence: mapGlowEvidence(analysis.cloudLayerEvidence),
    visibilityEvidence: mapGlowEvidence(analysis.visibilityEvidence),
    aerosolEvidence: mapGlowEvidence(analysis.aerosolEvidence),
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
      cloudLayerSummaryLabel: buildGlowDailyCloudLayerSummary(day, analysis),
      aerosolTransparencyLabel: buildGlowDailyAerosolLabel(day, analysis),
      terrainObstructionLabel: buildGlowDailyTerrainLabel(day, analysis),
      precipitationWindRiskLabel: buildGlowDailyWeatherRiskLabel(day, analysis),
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

function buildGlowProfessionalFocusWindows(
  analysis: GlowAnalysisResult,
): readonly CloudSeaProfessionalHourlyWindow[] {
  return [
    ...analysis.bestGlowWindows.slice(0, 2).map(glowWindowToProfessionalWindow),
    ...analysis.watchableGlowWindows.slice(0, 1).map(glowWindowToProfessionalWindow),
  ];
}

function glowWindowToProfessionalWindow(window: GlowWindow): CloudSeaProfessionalHourlyWindow {
  return {
    startTime: window.start,
    endTime: window.end,
    label: window.labelZh,
  };
}

function buildGlowProfessionalHourlyAnnotations(
  result: ForecastCalculationResult,
): readonly ProfessionalHourlyRowAnnotation[] {
  const rows = result.professionalHourlyData ?? [];
  if (rows.length === 0) {
    return [];
  }

  const intervals = buildGlowSunPhaseAnnotationIntervals(result);
  return rows
    .map((row): ProfessionalHourlyRowAnnotation | null => {
      const interval = intervals.find((item) =>
        isProfessionalHourOverlappingWindow(row.time, item.start, item.end),
      );
      if (!interval) {
        return null;
      }
      return {
        rowTime: row.time,
        label: interval.label,
        detail: interval.detail,
        tone: interval.tone,
      };
    })
    .filter((annotation): annotation is ProfessionalHourlyRowAnnotation => annotation !== null);
}

function buildGlowSunPhaseAnnotationIntervals(result: ForecastCalculationResult) {
  return result.astroSummaries.flatMap((astro) => {
    const intervals: Array<{
      readonly start: string;
      readonly end: string;
      readonly label: string;
      readonly detail: string;
      readonly tone: "default" | "success" | "warning" | "danger" | "info";
    }> = [];
    if (astro.sunrise) {
      intervals.push({
        start: astro.sunrise,
        end: addHoursInTimezone(astro.sunrise, 0.75, astro.timezone),
        label: "朝霞核心窗口",
        detail: "日出后低角度光线与中高云对齐的核心观察段。",
        tone: "success",
      });
      intervals.push({
        start: astro.civilDawn ?? addHoursInTimezone(astro.sunrise, -0.75, astro.timezone),
        end: astro.sunrise,
        label: "朝霞准备窗口",
        detail: "朝霞前的构图、测光和云层移动观察时段。",
        tone: "info",
      });
    }
    if (astro.sunset) {
      intervals.push({
        start: addHoursInTimezone(astro.sunset, -0.75, astro.timezone),
        end: astro.sunset,
        label: "晚霞准备窗口",
        detail: "晚霞前观察太阳方向低云遮挡和透光缝。",
        tone: "info",
      });
      intervals.push({
        start: astro.sunset,
        end: astro.civilDusk ?? addHoursInTimezone(astro.sunset, 0.75, astro.timezone),
        label: "晚霞核心窗口",
        detail: "日落后余晖与高云颜色发展的核心观察段。",
        tone: "success",
      });
    }
    return intervals;
  });
}

function buildGlowSunWindowCards(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): readonly GlowSunWindowCard[] {
  return result.astroSummaries.flatMap((astro) => {
    const cards: GlowSunWindowCard[] = [];
    if (astro.sunrise) {
      cards.push(buildGlowSunWindowCard(result, analysis, astro, "sunrise"));
    }
    if (astro.sunset) {
      cards.push(buildGlowSunWindowCard(result, analysis, astro, "sunset"));
    }
    return cards;
  });
}

function buildGlowSunWindowCard(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
  astro: AstroSummary,
  phase: "sunrise" | "sunset",
): GlowSunWindowCard {
  const targetTime = phase === "sunrise" ? astro.sunrise : astro.sunset;
  const dateLabel = result.calendarBasis.targetDateLabels[
    result.calendarBasis.targetDates.indexOf(astro.date)
  ] ?? astro.date;
  const bestWindow = glowWindowForDateAndPhase(analysis, astro.date, phase);
  const terrain = analysis.terrainObstructionAssessments.find(
    (item) => item.date === astro.date && item.phase === phase,
  );
  const prepStart =
    phase === "sunrise"
      ? astro.civilDawn ?? addHoursInTimezone(targetTime ?? astro.date, -0.75, astro.timezone)
      : addHoursInTimezone(targetTime ?? astro.date, -0.75, astro.timezone);
  const prepEnd = targetTime ?? prepStart;
  const coreStart = targetTime ?? prepEnd;
  const coreEnd =
    phase === "sunrise"
      ? addHoursInTimezone(coreStart, 0.75, astro.timezone)
      : astro.civilDusk ?? addHoursInTimezone(coreStart, 0.75, astro.timezone);
  const twilightStart =
    phase === "sunrise" ? astro.nauticalDawn ?? prepStart : astro.civilDusk ?? coreEnd;
  const twilightEnd =
    phase === "sunrise" ? astro.civilDawn ?? prepEnd : astro.nauticalDusk ?? coreEnd;

  return {
    key: `${astro.date}-${phase}`,
    date: astro.date,
    dateLabel,
    phase,
    title: phase === "sunrise" ? "日出霞光窗口" : "日落霞光窗口",
    prepWindowLabel: formatWindow(prepStart, prepEnd),
    coreWindowLabel: bestWindow
      ? formatWindow(bestWindow.start, bestWindow.end)
      : formatWindow(coreStart, coreEnd),
    twilightWindowLabel: formatWindow(twilightStart, twilightEnd),
    azimuthLabel: formatAzimuthLabel(
      phase === "sunrise" ? astro.sunriseAzimuth : astro.sunsetAzimuth,
    ),
    terrainLabel: terrain ? terrainStatusLabel(terrain) : "地形剖面暂缺",
    bestWindowLabel: bestWindow
      ? `${bestWindow.labelZh}，${bestWindow.score} 分`
      : "暂无可执行霞光窗口",
    recommendationLabel: bestWindow
      ? glowWindowRecommendationLabel(bestWindow)
      : "谨慎参考",
    detail: terrain?.noteZh ?? "缺少方向性地形剖面，不用单点海拔推断遮挡。",
    tone: bestWindow
      ? bestWindow.score >= 65
        ? "primary"
        : "accent"
      : terrain?.obstructionStatus === "blocked"
        ? "danger"
        : "muted",
  };
}

function buildGlowAerosolCard(assessment: GlowAerosolAssessment): GlowAerosolCard {
  return {
    key: "glow-aerosol",
    stateLabel: assessment.stateLabelZh,
    scoreLabel:
      assessment.aerosolScore === undefined ? "暂缺分项" : `${Math.round(assessment.aerosolScore)} 分`,
    measurementLabel: [
      `AOD ${formatOptionalNumber(assessment.aerosolOpticalDepth550, 3)}`,
      `PM2.5 ${formatOptionalNumber(assessment.pm25, 0)}`,
      `PM10 ${formatOptionalNumber(assessment.pm10, 0)}`,
      `沙尘 ${formatOptionalNumber(assessment.dust, 0)}`,
    ].join(" · "),
    sourceLabel: assessment.sourceResolution
      ? `区域参考 ${assessment.sourceResolution}`
      : "区域参考",
    detail: `${assessment.implicationZh}${assessment.noteZh}`,
    tone:
      assessment.state === "hazy" || assessment.state === "dusty"
        ? "danger"
        : assessment.state === "favorable_scatter"
          ? "accent"
          : assessment.availability === "unavailable"
            ? "muted"
            : "info",
  };
}

function buildGlowTerrainObstructionCards(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): readonly GlowTerrainObstructionCard[] {
  return analysis.terrainObstructionAssessments.map((assessment) => {
    const dateLabel = assessment.date
      ? result.calendarBasis.targetDateLabels[
          result.calendarBasis.targetDates.indexOf(assessment.date)
        ] ?? assessment.date
      : "未定日期";
    return {
      key: `${assessment.date ?? "unknown"}-${assessment.phase}`,
      dateLabel,
      title: assessment.labelZh,
      statusLabel: terrainStatusLabel(assessment),
      azimuthLabel: formatAzimuthLabel(assessment.solarAzimuthDegrees),
      horizonLabel: formatDegreeLabel(assessment.terrainHorizonAngleDegrees),
      clearanceLabel: formatDegreeLabel(assessment.solarClearanceDegrees),
      detail: assessment.noteZh,
      tone: terrainTone(assessment),
    };
  });
}

function buildGlowDailyCloudLayerSummary(
  day: GlowAnalysisResult["dailyGlow"][number],
  analysis: GlowAnalysisResult,
): string {
  const carrierScore = day.colorCarrierScore ?? analysis.colorCarrierScore;
  const lowCloudRisk = day.lowCloudObstructionRisk ?? analysis.lowCloudObstructionRisk;
  return `色彩载体 ${Math.round(carrierScore)} 分，低云遮挡 ${Math.round(lowCloudRisk)} 分`;
}

function buildGlowDailyAerosolLabel(
  day: GlowAnalysisResult["dailyGlow"][number],
  analysis: GlowAnalysisResult,
): string {
  const score = day.aerosolScore ?? analysis.aerosolAssessment.aerosolScore;
  if (score === undefined) {
    return "气溶胶参考暂缺";
  }
  return `气溶胶/透明度 ${Math.round(score)} 分，${analysis.aerosolAssessment.stateLabelZh}`;
}

function buildGlowDailyTerrainLabel(
  day: GlowAnalysisResult["dailyGlow"][number],
  analysis: GlowAnalysisResult,
): string {
  const assessments = analysis.terrainObstructionAssessments.filter(
    (item) => item.date === day.date,
  );
  if (assessments.length === 0) {
    return "方向性地形剖面暂缺";
  }
  return assessments.map(terrainStatusLabel).join(" / ");
}

function buildGlowDailyWeatherRiskLabel(
  day: GlowAnalysisResult["dailyGlow"][number],
  analysis: GlowAnalysisResult,
): string {
  const rain = dailyGlowRainOverlapLabel(day);
  const risk = glowRiskLabel(day.precipitationDisruptionRisk ?? analysis.precipitationDisruptionRisk);
  return `${rain}，降水干扰 ${risk}`;
}

function terrainStatusLabel(assessment: GlowTerrainObstructionAssessment): string {
  switch (assessment.obstructionStatus) {
    case "clear":
      return "低角度光线余量较好";
    case "marginal":
      return "遮挡临界";
    case "blocked":
      return "遮挡偏强";
    case "unavailable":
    default:
      return "剖面暂缺";
  }
}

function terrainTone(assessment: GlowTerrainObstructionAssessment): ForecastResultCardTone {
  if (assessment.obstructionStatus === "blocked") {
    return "danger";
  }
  if (assessment.obstructionStatus === "marginal") {
    return "info";
  }
  if (assessment.obstructionStatus === "clear") {
    return "accent";
  }
  return "muted";
}

function glowWindowRecommendationLabel(window: GlowWindow): string {
  if (window.score >= 70) {
    return "推荐重点关注";
  }
  if (window.score >= 55) {
    return "值得观察";
  }
  if (window.score >= 42) {
    return "谨慎参考";
  }
  return "不建议专程";
}

function isProfessionalHourOverlappingWindow(time: string, start: string, end: string): boolean {
  const timeMs = Date.parse(time);
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const hourEndMs = timeMs + 60 * 60 * 1000;
  return (
    Number.isFinite(timeMs) &&
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    hourEndMs > startMs &&
    timeMs < endMs
  );
}

function formatOptionalNumber(value: number | null | undefined, digits: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "暂缺";
}

function formatAzimuthLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}°`
    : "方位暂缺";
}

function formatDegreeLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}°`
    : "暂缺";
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

function forecastWindowStartsAtOrAfterAnchor(
  result: ForecastCalculationResult,
  window: { readonly startTime?: string } | undefined,
): boolean {
  if (!window?.startTime) {
    return false;
  }
  const anchorMs = Date.parse(
    result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
  );
  const startMs = Date.parse(window.startTime);
  if (!Number.isFinite(anchorMs)) {
    return Number.isFinite(startMs);
  }
  return Number.isFinite(startMs) && startMs >= anchorMs;
}

function buildCloudSeaHeroConclusion(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
  cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext,
  multiSourceAgreementContext: ForecastMultiSourceAgreementContext | null,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  recommendationExplanation: CloudSeaRecommendationExplanation,
  windowRiskContext?: CloudSeaWindowRiskContext,
): CloudSeaHeroConclusionView {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow = forecastWindowStartsAtOrAfterAnchor(result, analysis.bestCloudSeaWindow)
    ? analysis.bestCloudSeaWindow
    : undefined;
  const mappedWindow = bestWindow
    ? windows.find(
        (window) =>
          window.startTime === bestWindow.startTime && window.endTime === bestWindow.endTime,
      )
    : windows[0];
  const bestWindowLabel = bestWindow
    ? `${recommendationGuard.normalizedWindowRecommendation.windowLabel}：${
        mappedWindow?.fullTimeRangeLabel ??
        formatWindow(bestWindow.startTime, bestWindow.endTime, result.calendarBasis.timezone)
      }`
    : mappedWindow?.fullTimeRangeLabel ??
      (terrainContext.shouldDowngradeCloudSeaWording
        ? "暂无明确低云/晨雾窗口"
        : "暂无明确云海窗口");

  return {
    title: `${result.place.name} ${terrainContext.vocabulary.heroTitleSuffix}`,
    forecastRangeLabel: result.calendarBasis.forecastRangeLabel,
    recommendationLabel: recommendationGuard.finalRecommendationLabel,
    bestWindowLabel,
    arrivalLabel: cloudSeaArrivalLabel(result, bestWindow, mappedWindow),
    conclusion: windowRiskContext?.windowCenteredSummaryZh ?? recommendationExplanation.oneLineConclusionZh,
    confidenceLabel: cloudSeaConfidenceLabel(
      result.cloudSeaAnalysis.confidenceLevel,
      cloudLayerCompleteness,
      cloudBasisConsistency,
      multiSourceAgreementContext,
      recommendationGuard,
      weatherVariableConsistencyContext,
    ),
  };
}

function buildCloudSeaDailyTrend(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  cloudBasisConsistencyContext: CloudSeaCloudBasisConsistencyContext,
  precipitationSignalContext: CloudSeaPrecipitationSignalContext,
): readonly CloudSeaDailyTrendItem[] {
  const sourceDays =
    result.calendarBasis.horizonHours <= 24
      ? result.cloudSeaAnalysis.dailyCloudSea.slice(0, 1)
      : result.cloudSeaAnalysis.dailyCloudSea;

  if (sourceDays.length === 0) {
    const firstWindow = windows[0];
    const scoreCalibration = result.cloudSeaAnalysis.scoreCalibration;
    const cloudSeaScore = scoreCalibration.finalCloudSeaScore;
    const whiteoutScore = result.cloudSeaAnalysis.whiteoutRiskScore;
    const layerContext = buildCloudLayerCompletenessContext(result.professionalHourlyData);
    const cloudBasisContext = cloudBasisConsistencyContext;
    const dailyGuard = buildCloudSeaRecommendationGuardForRuleContext(result, terrainContext, {
      cloudLayerCompleteness: layerContext,
      cloudBasisConsistencyContext: cloudBasisContext,
      multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext,
      cloudSeaScore,
      shootabilityScore: scoreCalibration.calibratedShootabilityScore,
      formationScore: result.cloudSeaAnalysis.formationScore,
      proposedRecommendationLabel: result.cloudSeaAnalysis.recommendationLabel,
      bestWindow: result.cloudSeaAnalysis.bestCloudSeaWindow,
      hasWindow: Boolean(firstWindow ?? result.cloudSeaAnalysis.bestCloudSeaWindow),
      bestWindowLabelZh: firstWindow?.label ?? result.cloudSeaAnalysis.bestCloudSeaWindow?.label,
      weatherVariableConsistencyContext,
      precipitationSignalContext,
    });
    const layerRoleNote = cloudLayerDailyRoleNote(
      result,
      result.targetDates[0] ?? result.forecastStart.slice(0, 10),
      terrainContext,
    );
    const dailyExplanation = buildCloudSeaRecommendationExplanation({
      finalRecommendationLabel: dailyGuard.finalRecommendationLabel,
      cloudSeaScore,
      formationScore: result.cloudSeaAnalysis.formationScore,
      shootabilityScore: scoreCalibration.calibratedShootabilityScore,
      whiteoutRiskScore: whiteoutScore,
      terrainContext: {
        shouldDowngradeCloudSeaWording: terrainContext.shouldDowngradeCloudSeaWording,
        isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
        terrainClass: terrainContext.terrainClass,
        terrainNoteZh: terrainContext.terrainNoteZh,
      },
      cloudLayerCoverageContext: layerContext,
      cloudBasisConsistencyContext: cloudBasisContext,
      weatherVariableConsistencyContext,
      precipitationSignalContext,
      multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext ?? null,
      bestWindow: result.cloudSeaAnalysis.bestCloudSeaWindow ?? firstWindow ?? null,
      recommendationGuardContext: dailyGuard,
    });

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
        bestMorningWindow: firstWindow?.fullTimeRangeLabel ?? "暂无明确清晨窗口",
        watchableWindow: result.cloudSeaAnalysis.labels.watchableWindowLabel,
        rainOpeningLabel: precipitationSignalContext.riskLabelZh,
        onSiteCheckpoints: cloudSeaVerificationPoints(result, terrainContext),
        decisionReason: scoreCalibration.capApplied
          ? scoreCalibration.recommendationExplanationZh
          : dailyExplanation.userFacingSummaryZh,
        keyReason:
          scoreCalibration.capReasons[0] ??
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
          precipitationAwareDailyActionSuggestion(
            dailyGuard.normalizedDailyRecommendation.actionSuggestionZh,
            precipitationSignalContext,
          ) ??
          scoreCalibration.capReasons[0] ??
          cloudBasisDailyNote(cloudBasisContext) ??
          layerRoleNote ??
          dailyGuard.normalizedDailyRecommendation.actionSuggestionZh,
        layerCompletenessNote:
          scoreCalibration.capReasons[0] ??
          cloudBasisDailyNote(cloudBasisContext) ??
          layerRoleNote ??
          cloudLayerDailyNote(layerContext),
      },
    ];
  }

  return sourceDays.map((day) => {
    const scoreCalibration = day.scoreCalibration;
    const cloudSeaScore = scoreCalibration?.finalCloudSeaScore ?? day.shootableScore ?? day.travelScore;
    const shootabilityScore =
      scoreCalibration?.calibratedShootabilityScore ?? day.shootableScore ?? day.travelScore;
    const formationScore =
      scoreCalibration?.calibratedFormationScore ?? day.formationScore ?? day.opportunityScore;
    const hasCalibrationCap =
      scoreCalibration !== undefined &&
      (scoreCalibration.capApplied || scoreCalibration.capReasons.length > 0);
    const whiteoutScore = day.whiteoutRiskScore;
    const window = windows.find((candidate) => candidate.date === day.date);
    const layerContext = cloudLayerCompletenessContextForDate(result, day.date);
    const cloudBasisContext = cloudBasisConsistencyContextForDate(result, day.date);
    const dailyPrecipitationSignal = cloudSeaPrecipitationSignalContextForWindow(
      result,
      day.bestWindow,
    );
    const dailyGuard = buildCloudSeaRecommendationGuardForRuleContext(result, terrainContext, {
      cloudLayerCompleteness: layerContext,
      cloudBasisConsistencyContext: cloudBasisContext,
      multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext,
      cloudSeaScore,
      shootabilityScore,
      formationScore,
      whiteoutRiskScore: day.whiteoutRiskScore,
      proposedRecommendationLabel: day.recommendationLabel,
      bestWindow: day.bestWindow,
      hasWindow: Boolean(window ?? day.bestWindow),
      bestWindowLabelZh: window?.label ?? day.bestWindow.label,
      weatherVariableConsistencyContext,
      precipitationSignalContext: dailyPrecipitationSignal,
    });
    const layerRoleNote = cloudLayerDailyRoleNote(result, day.date, terrainContext);
    const dailyExplanation = buildCloudSeaRecommendationExplanation({
      finalRecommendationLabel: dailyGuard.finalRecommendationLabel,
      cloudSeaScore,
      formationScore,
      shootabilityScore,
      whiteoutRiskScore: day.whiteoutRiskScore,
      terrainContext: {
        shouldDowngradeCloudSeaWording: terrainContext.shouldDowngradeCloudSeaWording,
        isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
        terrainClass: terrainContext.terrainClass,
        terrainNoteZh: terrainContext.terrainNoteZh,
      },
      cloudLayerCoverageContext: layerContext,
      cloudBasisConsistencyContext: cloudBasisContext,
      weatherVariableConsistencyContext,
      precipitationSignalContext: dailyPrecipitationSignal,
      multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext ?? null,
      bestWindow: window ?? day.bestWindow ?? null,
      recommendationGuardContext: dailyGuard,
    });

    return {
      key: `cloud-sea-day-${day.date}`,
      date: day.date,
      dateLabel: result.calendarBasis.horizonHours <= 24 ? "未来24小时" : day.dateLabelZh,
      cloudSeaScore,
      cloudSeaLevel: scoreLevelText(scoreLevelFromScore(cloudSeaScore)),
      formationScore,
      formationLevel:
        day.labels?.formationOpportunity ??
        scoreLevelText(scoreLevelFromScore(day.opportunityScore)),
      shootableScore: shootabilityScore,
      shootableLevel:
        day.labels?.shootableOpportunity ?? scoreLevelText(scoreLevelFromScore(day.travelScore)),
      whiteoutRiskLabel: whiteoutRiskLabel(whiteoutScore),
      whiteoutRiskScore: whiteoutScore,
      bestMorningWindow: window
        ? window.fullTimeRangeLabel
        : formatWindow(
            day.bestWindow.startTime,
            day.bestWindow.endTime,
            result.calendarBasis.timezone,
          ),
      watchableWindow: day.watchableWindow
        ? formatWindow(
            day.watchableWindow.startTime,
            day.watchableWindow.endTime,
            result.calendarBasis.timezone,
          )
        : undefined,
      rainOpeningLabel: dailyPrecipitationSignal.riskLabelZh,
      onSiteCheckpoints: (day.onSiteCheckpoints ?? []).map((item) =>
        cloudSeaTerrainAwareText(item, terrainContext),
      ),
      decisionReason: hasCalibrationCap
        ? scoreCalibration.recommendationExplanationZh
        : dailyExplanation.userFacingSummaryZh,
      keyReason: [
        scoreCalibration?.capReasons[0],
        layerRoleNote ?? cloudSeaTerrainAwareText(day.keyReason, terrainContext),
        cloudSeaDailyPrecipitationNote(dailyPrecipitationSignal),
      ]
        .filter(Boolean)
        .join(" "),
      recommendedAction: dailyGuard.normalizedDailyRecommendation.label as CloudSeaActionLabel,
      actionSuggestion:
        precipitationAwareDailyActionSuggestion(
          dailyGuard.normalizedDailyRecommendation.actionSuggestionZh,
          dailyPrecipitationSignal,
        ) ??
        scoreCalibration?.capReasons[0] ??
        cloudBasisDailyNote(cloudBasisContext) ??
        layerRoleNote ??
        dailyGuard.normalizedDailyRecommendation.actionSuggestionZh,
      layerCompletenessNote:
        scoreCalibration?.capReasons[0] ??
        cloudBasisDailyNote(cloudBasisContext) ??
        layerRoleNote ??
        cloudLayerDailyNote(layerContext),
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
  precipitationSignalContext: CloudSeaPrecipitationSignalContext,
): readonly CloudSeaWeatherEvidenceItem[] {
  return result.cloudSeaAnalysis.weatherEvidence.map((item) => ({
    key: keyFromLabel(item.label),
    label: item.label,
    value:
      item.label === "降水"
        ? cloudSeaPrecipitationValue(precipitationSignalContext)
        : item.label === "低云" && hasMissingLowCloudLayer(result)
          ? "分层缺失"
          : item.value,
    trend:
      item.label === "降水" ? precipitationSignalContext.riskLabelZh : effectLabel(item.effect),
    effect:
      item.label === "降水"
        ? precipitationSignalContext.userSummaryZh
        : cloudSeaTerrainAwareText(item.noteZh, terrainContext),
    confidenceNote:
      item.label === "低云" && hasMissingLowCloudLayer(result)
        ? terrainContext.shouldDowngradeCloudSeaWording
          ? "当前天气源缺少低云分层数据，低云/晨雾参考置信度会降低。"
          : "当前天气源缺少低云分层数据，云海判断置信度会降低。"
        : item.noteZh.includes("缺少")
          ? cloudSeaTerrainAwareText(item.noteZh, terrainContext)
          : undefined,
    tone:
      item.label === "降水"
        ? precipitationSignalTone(precipitationSignalContext)
        : evidenceTone(item.effect),
  }));
}

function buildCloudSeaWindowItems(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  cloudBasisConsistencyContext: CloudSeaCloudBasisConsistencyContext,
  precipitationSignalContext: CloudSeaPrecipitationSignalContext,
  recommendationExplanation: CloudSeaRecommendationExplanation,
  windowRiskContext?: CloudSeaWindowRiskContext,
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
        weatherVariableConsistencyContext,
        precipitationSignalContext,
        window.windowRiskContext ?? windowRiskContext,
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
        weatherVariableConsistencyContext,
        precipitationSignalContext,
        window.windowRiskContext ?? windowRiskContext,
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
        weatherVariableConsistencyContext,
        precipitationSignalContext,
        window.windowRiskContext ?? windowRiskContext,
      ),
    ),
  ];

  if (items.length > 0) {
    return [...items].sort((left, right) => left.startTime.localeCompare(right.startTime));
  }

  return windows.map((window) => {
    const hasWindowProfessionalRows =
      professionalHourlyRowsForWindow(result, window.startTime, window.endTime).length > 0;
    const cloudBasisContext = hasWindowProfessionalRows
      ? cloudBasisConsistencyContextForWindow(result, window.startTime, window.endTime)
      : cloudBasisConsistencyContext;
    const windowPrecipitationSignal = cloudSeaPrecipitationSignalContextForWindow(result, {
      startTime: window.startTime,
      endTime: window.endTime,
      label: window.label,
    });

    return {
      key: `cloud-sea-result-window-${window.startTime}`,
      label: vocabulary.genericWindowLabel,
      date: window.date,
      startTime: window.startTime,
      endTime: window.endTime,
      displayLabelZh: window.fullTimeRangeLabel,
      timeRangeLabel: window.fullTimeRangeLabel,
      score: window.score,
      recommendationLabel: recommendationGuard.finalRecommendationLabel,
      labelReason: recommendationExplanation.cautionReasonZh,
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
      riskTag: cloudSeaTerrainAwareText(
        cloudSeaWindowRiskTag(result, window.score, windowPrecipitationSignal),
        terrainContext,
      ),
      cloudSeaChance: scoreLevelText(scoreLevelFromScore(window.score)),
      whiteoutRisk: result.cloudSeaAnalysis.labels.whiteoutRisk,
      rainInterference:
        windowRiskContext?.precipitationWindowSummaryZh ?? windowPrecipitationSignal.riskLabelZh,
      windVisibilityNote: cloudSeaWindVisibilityNote(result),
      actionSuggestion: cloudSeaTimelineActionSuggestion(
        window.score,
        result.cloudSeaAnalysis.whiteoutRiskScore,
        window.windowLevel,
        terrainContext,
        recommendationGuard,
        windowPrecipitationSignal,
      ),
      layerCompletenessNote:
        cloudBasisWindowNote(cloudBasisContext) ??
        cloudLayerWindowRoleNote(result, window.startTime, window.endTime, terrainContext) ??
        cloudLayerWindowNote(
          cloudLayerCompletenessContextForWindow(result, window.startTime, window.endTime),
        ),
      tone: result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "accent",
      lightPhase: window.lightPhase,
      windowLevel: window.windowLevel,
    };
  });
}

function cloudSeaWindowItem(
  prefix: string,
  label: string,
  window: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number],
  tone: ForecastResultCardTone,
  terrainContext: CloudSeaTerrainContext,
  result: ForecastCalculationResult,
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  precipitationSignalContext: CloudSeaPrecipitationSignalContext,
  windowRiskContext?: CloudSeaWindowRiskContext,
): CloudSeaWindowItem {
  const layerContext = cloudLayerCompletenessContextForWindow(
    result,
    window.startTime,
    window.endTime,
  );
  const cloudBasisContext = cloudBasisConsistencyContextForWindow(
    result,
    window.startTime,
    window.endTime,
  );
  const windowPrecipitationSignal = selectWindowPrecipitationSignal(
    cloudSeaPrecipitationSignalContextForWindow(result, window),
    precipitationSignalContext,
  );
  const scoreCalibration = window.scoreCalibration;
  const resolvedCloudSeaScore =
    scoreCalibration?.finalCloudSeaScore ?? window.shootableScore ?? window.score;
  const resolvedFormationScore =
    scoreCalibration?.calibratedFormationScore ?? window.formationScore ?? window.score;
  const resolvedShootabilityScore =
    scoreCalibration?.calibratedShootabilityScore ?? window.shootableScore ?? window.score;
  const limitingFactor =
    windowRiskContext?.limitingFactorZh ??
    scoreCalibration?.capReasons[0];

  const windowGuard = buildCloudSeaRecommendationGuardForRuleContext(result, terrainContext, {
    cloudLayerCompleteness: layerContext,
    cloudBasisConsistencyContext: cloudBasisContext,
    multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext,
    cloudSeaScore: resolvedCloudSeaScore,
    shootabilityScore: resolvedShootabilityScore,
    formationScore: resolvedFormationScore,
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
    weatherVariableConsistencyContext,
    precipitationSignalContext: windowPrecipitationSignal,
  });
  const windowExplanation = buildCloudSeaRecommendationExplanation({
    finalRecommendationLabel: windowGuard.finalRecommendationLabel,
    cloudSeaScore: resolvedCloudSeaScore,
    formationScore: resolvedFormationScore,
    shootabilityScore: resolvedShootabilityScore,
    whiteoutRiskScore: window.whiteoutRiskScore ?? result.cloudSeaAnalysis.whiteoutRiskScore,
    terrainContext: {
      shouldDowngradeCloudSeaWording: terrainContext.shouldDowngradeCloudSeaWording,
      isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
      terrainClass: terrainContext.terrainClass,
      terrainNoteZh: terrainContext.terrainNoteZh,
    },
    cloudLayerCoverageContext: layerContext,
    cloudBasisConsistencyContext: cloudBasisContext,
    weatherVariableConsistencyContext,
    precipitationSignalContext: windowPrecipitationSignal,
    multiSourceAgreementContext: result.weatherFusionSummary?.multiSourceAgreementContext ?? null,
    bestWindow: window,
    recommendationGuardContext: windowGuard,
  });
  const guardedWindowNote =
    scoreCalibration?.capApplied || scoreCalibration?.capReasons.length
      ? scoreCalibration.recommendationExplanationZh
      : windowGuard.finalRecommendationLevel === "strong_special_trip" ||
    windowGuard.finalRecommendationLevel === "recommended_arrangement"
      ? cloudSeaTerrainAwareText(window.noteZh, terrainContext)
      : `${windowGuard.reasonZh}。${windowGuard.normalizedWindowRecommendation.actionSuggestionZh}`;
  const displayLabelZh = formatWindow(
    window.startTime,
    window.endTime,
    result.calendarBasis.timezone,
  );

  return {
    key: `${prefix}-${window.startTime}`,
    label: prefix === "best" ? windowGuard.normalizedWindowRecommendation.windowLabel : label,
    date: window.date,
    startTime: window.startTime,
    endTime: window.endTime,
    displayLabelZh,
    timeRangeLabel: displayLabelZh,
    score: resolvedCloudSeaScore,
    recommendationLabel: windowGuard.finalRecommendationLabel,
    labelReason: limitingFactor ?? windowExplanation.cautionReasonZh,
    note: guardedWindowNote,
    riskTag: cloudSeaTerrainAwareText(
      cloudSeaWindowRiskTag(
        result,
        resolvedCloudSeaScore,
        windowPrecipitationSignal,
      ),
      terrainContext,
    ),
    cloudSeaChance: `形成 ${scoreLevelText(
      scoreLevelFromScore(resolvedFormationScore),
    )} / 可拍 ${scoreLevelText(scoreLevelFromScore(resolvedCloudSeaScore))}`,
    whiteoutRisk: whiteoutRiskLabel(window.whiteoutRiskScore ?? 0),
    rainInterference:
      windowRiskContext?.precipitationWindowSummaryZh ?? windowPrecipitationSignal.riskLabelZh,
    windVisibilityNote: terrainContext.shouldDowngradeCloudSeaWording
      ? "风速、能见度、近地雾气和低云厚度需在到场前复核。"
      : "风速、能见度和低云厚度需在到场前复核。",
    actionSuggestion: cloudSeaTimelineActionSuggestion(
      resolvedCloudSeaScore,
      window.whiteoutRiskScore ?? 0,
      window.phase === "observation"
        ? "shootable"
        : window.phase === "waiting"
          ? "watchable"
          : undefined,
      terrainContext,
      windowGuard,
      windowPrecipitationSignal,
    ),
    layerCompletenessNote:
      limitingFactor ??
      cloudBasisWindowNote(cloudBasisContext) ??
      cloudLayerWindowRoleNote(result, window.startTime, window.endTime, terrainContext) ??
      cloudLayerWindowNote(layerContext),
    tone,
  };
}

function buildCloudSeaReasoningItems(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
  cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext,
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
  recommendationExplanation: CloudSeaRecommendationExplanation,
  windowRiskContext?: CloudSeaWindowRiskContext,
): readonly CloudSeaReasoningItem[] {
  const analysis = result.cloudSeaAnalysis;
  const humidity = cloudSeaWeatherEvidence(result, "湿度");
  const dewPoint = cloudSeaWeatherEvidence(result, "露点差");
  const lowCloud = cloudSeaWeatherEvidence(result, "低云");
  const visibility = cloudSeaWeatherEvidence(result, "能见度");
  const wind = cloudSeaWeatherEvidence(result, "风速");
  const precipitation = cloudSeaWeatherEvidence(result, "降水");
  const precipitationSignalContext = weatherVariableConsistencyContext.precipitationSignalContext;
  const relief = result.terrainAnalysis.terrainProfile.localReliefMeters;
  const cloudLayerRoleItem = buildCloudLayerRoleReasoningItem(result, terrainContext);
  const consistencyItem = buildCloudSeaVariableConsistencyReasoningItem(
    weatherVariableConsistencyContext,
  );

  return [
    {
      key: "score-recommendation-separation",
      label: "评分与推荐",
      value: recommendationGuard.finalRecommendationLabel,
      detail: [
        recommendationExplanation.oneLineConclusionZh,
        recommendationExplanation.confidenceExplanationZh,
      ].join(" "),
      tone: recommendationGuard.finalRecommendationTone,
    },
    {
      key: "humidity-dew-point",
      label: "湿度与露点差",
      value: joinKnownValues([humidity?.value, dewPoint?.value]),
      detail: cloudSeaTerrainAwareText(
        weatherVariableConsistencyContext.humidityDewPointStatus === "conflict"
          ? "水汽指标存在口径差异，湿度与露点差需结合临近预报复核，不宜仅凭湿度判断云海或白墙。"
          : joinKnownDetails(
              [humidity?.noteZh, dewPoint?.noteZh],
              "水汽和露点差数据不足，需临近预报复核。",
            ),
        terrainContext,
      ),
      tone:
        weatherVariableConsistencyContext.humidityDewPointStatus === "conflict"
          ? "accent"
          : analysis.formationScore >= 65
            ? "primary"
            : "accent",
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
      key: "cloud-basis-consistency",
      label: "云量口径一致性",
      value: cloudBasisConsistencyValue(cloudBasisConsistency, cloudLayerCompleteness),
      detail:
        cloudBasisConsistency.cloudBasisLevel === "consistent"
          ? cloudBasisConsistency.userSummaryZh
          : `${cloudBasisConsistency.userSummaryZh} ${cloudLayerCompleteness.userNoteZh}`,
      tone: cloudBasisConsistencyTone(cloudBasisConsistency, cloudLayerCompleteness),
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
        ? `${cloudSeaPrecipitationValue(precipitationSignalContext)} / ${precipitationSignalContext.riskLabelZh}`
        : precipitationSignalContext.riskLabelZh,
      detail: cloudSeaTerrainAwareText(
        windowRiskContext?.precipitationWindowSummaryZh ??
          precipitationSignalContext.userSummaryZh,
        terrainContext,
      ),
      tone: precipitationSignalTone(precipitationSignalContext),
    },
    ...(consistencyItem ? [consistencyItem] : []),
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
      value: windowRiskContext
        ? `${windowRiskContext.whiteoutReviewLabelZh}（${analysis.whiteoutRiskScore} 分）`
        : `${whiteoutRiskLabel(analysis.whiteoutRiskScore)}（${analysis.whiteoutRiskScore} 分）`,
      detail: cloudSeaTerrainAwareText(
        windowRiskContext?.whiteoutWindowSummaryZh ??
          whiteoutConsistencyDetail(
            analysis.whiteoutRiskScore,
            weatherVariableConsistencyContext,
            firstText(analysis.whiteoutReasons, "低云接近机位时可能遮挡视野。"),
          ),
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

function buildCloudSeaVariableConsistencyReasoningItem(
  context: CloudSeaWeatherVariableConsistencyContext,
): CloudSeaReasoningItem | null {
  if (context.warningsZh.length === 0 || context.consistencyLevel === "good") {
    return null;
  }

  return {
    key: "weather-variable-consistency",
    label: "数据一致性",
    value: weatherVariableConsistencyValue(context),
    detail: context.warningsZh.join(" "),
    tone: context.consistencyLevel === "conflict" ? "accent" : "info",
  };
}

function weatherVariableConsistencyValue(
  context: CloudSeaWeatherVariableConsistencyContext,
): string {
  if (context.consistencyLevel === "conflict") {
    return "需复核";
  }
  if (context.consistencyLevel === "watch") {
    return "注意口径";
  }
  if (context.consistencyLevel === "unknown") {
    return "数据不足";
  }
  return "一致";
}

function whiteoutConsistencyDetail(
  whiteoutRiskScore: number,
  context: CloudSeaWeatherVariableConsistencyContext,
  fallback: string,
): string {
  if (
    whiteoutRiskScore >= 60 &&
    (context.visibilityStatus === "good" || context.visibilityStatus === "moderate")
  ) {
    return "能见度未明显转差时，白墙风险不只按湿度判断，需低云、能见度和现场遮挡共同确认。";
  }
  if (context.humidityDewPointStatus === "conflict") {
    return "湿度与露点差存在口径差异，白墙风险需结合低云和能见度复核。";
  }
  return fallback;
}

function buildCloudSeaActionPlan(
  result: ForecastCalculationResult,
  windows: readonly ForecastResultWindow[],
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard: CloudSeaRecommendationGuardOutput,
  displayTemperatureContext: CloudSeaDisplayTemperatureContext,
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  precipitationSignalContext: CloudSeaPrecipitationSignalContext,
  recommendationExplanation: CloudSeaRecommendationExplanation,
  windowRiskContext?: CloudSeaWindowRiskContext,
): readonly CloudSeaActionPlanItem[] {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow = forecastWindowStartsAtOrAfterAnchor(result, analysis.bestCloudSeaWindow)
    ? analysis.bestCloudSeaWindow
    : undefined;
  const mappedWindow = bestWindow
    ? windows.find(
        (window) =>
          window.startTime === bestWindow.startTime && window.endTime === bestWindow.endTime,
      )
    : windows[0];
  const backupPlan = analysis.backupPlans[0];
  const timezone = result.calendarBasis.timezone;
  const mainWindowDisplayLabel = bestWindow
    ? mappedWindow?.fullTimeRangeLabel ??
      formatWindow(bestWindow.startTime, bestWindow.endTime, timezone)
    : null;
  const backupWindow = [
    ...analysis.bestCloudSeaWindows,
    ...analysis.watchableCloudSeaWindows,
    ...analysis.notRecommendedCloudSeaWindows,
  ].find(
    (window) =>
      forecastWindowStartsAtOrAfterAnchor(result, window) &&
      (!bestWindow ||
        window.startTime !== bestWindow.startTime ||
        window.endTime !== bestWindow.endTime),
  );
  const backupWindowDisplayLabel = backupWindow
    ? formatWindow(backupWindow.startTime, backupWindow.endTime, timezone)
    : null;
  const backupAction = cloudSeaTerrainAwareText(
    backupPlan?.action ??
      (terrainContext.shouldDowngradeCloudSeaWording ? "转向霞光或云层纹理" : "转拍近景和云雾流动"),
    terrainContext,
  );
  const backupDetail = cloudSeaTerrainAwareText(
    backupPlan?.detail ??
      (terrainContext.shouldDowngradeCloudSeaWording
        ? "若低云贴地或通透不足，转向霞光、云层纹理、远山层次和近景氛围。"
        : "若白墙压顶，转拍近景、云雾流动、树影和山体层次。"),
    terrainContext,
  );
  const checkpoints = cloudSeaVerificationPoints(
    result,
    terrainContext,
    weatherVariableConsistencyContext,
    precipitationSignalContext,
  );
  const reviewPoints = [
    ...new Set([...recommendationExplanation.reviewPointsZh, ...checkpoints]),
  ].slice(0, 6);
  const calibration = analysis.scoreCalibration;
  const departureDetail =
    calibration.shouldDowngradeToCautious && calibration.calibratedFormationScore >= 70
      ? `${calibration.recommendationExplanationZh} 可准备，但出发前必须复核云顶高度、降水和开口。复核：${reviewPoints
          .slice(0, 3)
          .join("、")}。`
      : `${recommendationExplanation.actionSummaryZh}${
          windowRiskContext
            ? ` ${windowRiskContext.actionAdviceZh}`
            : precipitationSignalContext.precipitationSignalType !== "none"
              ? ` ${precipitationSignalContext.actionAdviceZh}`
              : ""
        } 复核：${reviewPoints.slice(0, 3).join("、")}。`;

  return [
    {
      key: "departure",
      label: "是否建议出发",
      value: recommendationGuard.actionPlanLabels.departure,
      detail: departureDetail,
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
      value: mainWindowDisplayLabel ?? "需临近预报复核",
      detail:
        windowRiskContext?.actionAdviceZh ??
        (precipitationSignalContext.shouldDowngradeWindow
          ? precipitationSignalContext.actionAdviceZh
          : `${recommendationExplanation.actionSummaryZh}${precipitationSignalContext.precipitationSignalType !== "none" ? ` ${precipitationSignalContext.actionAdviceZh}` : ""}`),
      tone: recommendationGuard.finalRecommendationTone,
    },
    {
      key: "backup",
      label: "备选方案",
      value: backupWindowDisplayLabel ?? backupAction,
      detail: backupWindowDisplayLabel ? `${backupAction}。${backupDetail}` : backupDetail,
      tone: "muted",
    },
    {
      key: "gear",
      label: "装备提醒",
      value: displayTemperatureContext.equipmentAdviceZh,
      detail: cloudSeaGearAdvice(
        result,
        terrainContext,
        displayTemperatureContext,
        weatherVariableConsistencyContext,
        precipitationSignalContext,
        windowRiskContext,
      ),
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
  weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext,
  precipitationSignalContext: CloudSeaPrecipitationSignalContext,
  windowRiskContext?: CloudSeaWindowRiskContext,
): readonly ForecastResultSectionItem[] {
  const vocabulary = terrainContext.vocabulary;
  const scoreCalibration = result.cloudSeaAnalysis.scoreCalibration;
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
      detail:
        scoreCalibration.capApplied || scoreCalibration.capReasons.length > 0
          ? scoreCalibration.scoreExplanationZh
          : terrainContext.shouldDowngradeCloudSeaWording
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
      label: "窗口降水影响",
      value: windowRiskContext?.windowRainImpact.riskLabelZh ?? precipitationSignalContext.riskLabelZh,
      detail:
        windowRiskContext?.precipitationWindowSummaryZh ??
        precipitationSignalContext.userSummaryZh,
    },
    {
      label: "降水概率",
      value: formatNullableProbability(precipitationSignalContext.maxProbabilityPercent),
      detail: precipitationSignalContext.hasProbabilityData
        ? `概率${precipitationProbabilityClassLabel(
            precipitationSignalContext.probabilityClass,
          )}，需与预计雨量分开判断。`
        : "降水概率缺测，不用 0% 代替，需临近预报复核。",
    },
    {
      label: "预计雨量",
      value: formatNullableAmount(precipitationSignalContext.maxAmountMm),
      detail: precipitationSignalContext.hasAmountData
        ? `雨量${precipitationAmountClassLabel(
            precipitationSignalContext.amountClass,
          )}，按主窗口及前 2 小时综合判断。`
        : "雨量数据不足，不从降水概率反推雨量。",
    },
    {
      label: "影响时段",
      value: precipitationSignalContext.mainTimeRangeZh,
      detail:
        windowRiskContext?.precipitationWindowSummaryZh ??
        (precipitationSignalContext.affectsMainWindow
          ? "降水信号与主窗口重叠，需按窗口稳定性复核。"
          : precipitationSignalContext.affectsArrivalWindow
            ? "降水主要影响到达或提前准备时段，需关注通行和器材防护。"
            : "降水主要不在主窗口内，作为背景风险复核，不直接否定窗口。"),
    },
    {
      label: "拍摄窗口影响",
      value:
        windowRiskContext?.duringWindowRainImpact.shouldCapScore ||
        precipitationSignalContext.shouldDowngradeWindow
          ? "需降级"
          : "不直接否定",
      detail: windowRiskContext?.actionAdviceZh ?? precipitationSignalContext.actionAdviceZh,
    },
    ...(weatherVariableConsistencyContext.warningsZh.length > 0
      ? [
          {
            label: "变量复核",
            value: weatherVariableConsistencyValue(weatherVariableConsistencyContext),
            detail: weatherVariableConsistencyContext.warningsZh.join(" "),
          },
        ]
      : []),
    ...(windowRiskContext
      ? [
          {
            label: "开口置信度",
            value: windowRiskContext.windowOpeningConfidenceLabelZh,
            detail: windowRiskContext.openingConfidenceReasonZh,
          },
          {
            label: "白墙复核",
            value: windowRiskContext.whiteoutReviewLabelZh,
            detail: windowRiskContext.whiteoutWindowSummaryZh,
          },
        ]
      : []),
    {
      label: "器材/通行影响",
      value: precipitationSignalContext.affectsRoadSafety ? "通行需评估" : "器材防护",
      detail: precipitationSignalContext.equipmentAdviceZh,
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

function _cloudSeaConclusion(
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

function _cloudSeaRainOpeningSummary(
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

function cloudSeaPrecipitationSignalContextForWindow(
  result: ForecastCalculationResult,
  window: Pick<
    ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number],
    "startTime" | "endTime" | "label"
  >,
): CloudSeaPrecipitationSignalContext {
  return buildCloudSeaPrecipitationSignalContext({
    hourlyRows: result.professionalHourlyData,
    timezone: result.calendarBasis.timezone,
    focusedWindow: {
      startTime: window.startTime,
      endTime: window.endTime,
      label: window.label,
    },
    bestWindow: {
      startTime: window.startTime,
      endTime: window.endTime,
      label: window.label,
    },
    terrainContext: {
      elevationMeters:
        result.terrainAnalysis.terrainProfile.locationElevation ??
        result.terrainAnalysis.terrainProfile.elevationMeters ??
        result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
      surroundingReliefMeters:
        result.terrainAnalysis.terrainProfile.localReliefMeters ??
        result.terrainAnalysis.terrainProfile.elevationDiff5km ??
        result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      terrainType:
        result.terrainAnalysis.terrainProfile.terrainType ??
        result.cloudSeaAnalysis.terrainSupport.terrainType,
    },
    cloudLayerCompletenessContext: buildCloudLayerCompletenessContext(
      result.professionalHourlyData,
    ),
  });
}

function selectWindowPrecipitationSignal(
  windowSignal: CloudSeaPrecipitationSignalContext,
  fallback: CloudSeaPrecipitationSignalContext,
): CloudSeaPrecipitationSignalContext {
  return windowSignal.amountBasis === "none" ? fallback : windowSignal;
}

function cloudSeaPrecipitationValue(context: CloudSeaPrecipitationSignalContext): string {
  return `降水概率 ${formatNullableProbability(
    context.maxProbabilityPercent,
  )} / 预计雨量 ${formatNullableAmount(context.maxAmountMm)}`;
}

function cloudSeaDailyPrecipitationNote(
  context: CloudSeaPrecipitationSignalContext,
): string | undefined {
  if (context.precipitationSignalType === "none") {
    return undefined;
  }
  if (context.shouldDowngradeWindow) {
    return context.userSummaryZh;
  }
  if (!context.affectsMainWindow && context.precipitationSignalType !== "unknown") {
    return "降水主要不在推荐窗口内，作为背景风险临近复核。";
  }
  return context.userSummaryZh;
}

function precipitationAwareDailyActionSuggestion(
  baseAction: string,
  context: CloudSeaPrecipitationSignalContext,
): string | undefined {
  if (context.precipitationSignalType === "none") {
    return undefined;
  }
  if (context.shouldDowngradeWindow) {
    return context.actionAdviceZh;
  }
  if (
    context.precipitationSignalType === "probability_only" ||
    context.precipitationSignalType === "light_disturbance" ||
    context.precipitationSignalType === "short_shower"
  ) {
    return `${baseAction} ${context.actionAdviceZh}`;
  }
  return undefined;
}

function precipitationSignalTone(
  context: CloudSeaPrecipitationSignalContext,
): ForecastResultCardTone {
  if (context.precipitationSignalType === "sustained_rain") {
    return "danger";
  }
  if (
    context.precipitationSignalType === "meaningful_rain" ||
    context.precipitationImpactLevel === "medium"
  ) {
    return "accent";
  }
  if (
    context.precipitationSignalType === "probability_only" ||
    context.precipitationSignalType === "light_disturbance" ||
    context.precipitationSignalType === "short_shower"
  ) {
    return "info";
  }
  return context.precipitationSignalType === "unknown" ? "muted" : "info";
}

function formatNullableProbability(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "缺测";
}

function formatNullableAmount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "缺测";
  }
  return `${Math.round(value * 10) / 10} mm`;
}

function precipitationProbabilityClassLabel(value: string): string {
  if (value === "very_high") {
    return "很高";
  }
  if (value === "high") {
    return "偏高";
  }
  if (value === "medium") {
    return "中等";
  }
  if (value === "low") {
    return "偏低";
  }
  if (value === "none") {
    return "很低";
  }
  return "待复核";
}

function precipitationAmountClassLabel(value: string): string {
  if (value === "heavy") {
    return "明显";
  }
  if (value === "moderate") {
    return "可计量";
  }
  if (value === "light") {
    return "偏小";
  }
  if (value === "trace") {
    return "很小";
  }
  if (value === "none") {
    return "不明显";
  }
  return "待复核";
}

function cloudSeaTimelineActionSuggestion(
  score: number,
  whiteoutRiskScore: number,
  windowLevel: ForecastResultWindow["windowLevel"],
  terrainContext: CloudSeaTerrainContext,
  recommendationGuard?: CloudSeaRecommendationGuardOutput,
  precipitationSignalContext?: CloudSeaPrecipitationSignalContext,
): string {
  if (precipitationSignalContext?.shouldDowngradeWindow) {
    return precipitationSignalContext.actionAdviceZh;
  }
  if (recommendationGuard) {
    const base = recommendationGuard.normalizedWindowRecommendation.actionSuggestionZh;
    return precipitationSignalContext &&
      precipitationSignalContext.precipitationSignalType !== "none" &&
      precipitationSignalContext.precipitationSignalType !== "unknown"
      ? `${base} ${precipitationSignalContext.actionAdviceZh}`
      : base;
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

function cloudBasisConsistencyContextForDate(
  result: ForecastCalculationResult,
  date: string,
): CloudSeaCloudBasisConsistencyContext {
  const rows = (result.professionalHourlyData ?? []).filter((row) =>
    row.time.startsWith(`${date}T`),
  );
  const cloudLayerCompletenessContext =
    rows.length > 0
      ? buildCloudLayerCompletenessContext(rows)
      : buildCloudLayerCompletenessContext(result.professionalHourlyData);

  return buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: rows.length > 0 ? rows : result.professionalHourlyData,
    cloudLayerCompletenessContext,
  });
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

function cloudBasisConsistencyContextForWindow(
  result: ForecastCalculationResult,
  startTime: string,
  endTime: string,
): CloudSeaCloudBasisConsistencyContext {
  const rows = professionalHourlyRowsForWindow(result, startTime, endTime);
  const fallbackRows = result.professionalHourlyData ?? [];
  const hourlyRows = rows.length > 0 ? rows : fallbackRows;
  return buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows,
    cloudLayerCompletenessContext: buildCloudLayerCompletenessContext(hourlyRows),
    focusedWindow: {
      startTime,
      endTime,
    },
  });
}

function professionalHourlyRowsForWindow(
  result: ForecastCalculationResult,
  startTime: string,
  endTime: string,
): NonNullable<ForecastCalculationResult["professionalHourlyData"]> {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  return (result.professionalHourlyData ?? []).filter((row) => {
    const time = Date.parse(row.time);
    return (
      Number.isFinite(time) &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      time >= start &&
      time <= end
    );
  });
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

function cloudBasisDailyNote(context: CloudSeaCloudBasisConsistencyContext): string | undefined {
  if (context.cloudBasisLevel === "mixed_basis") {
    return "当日部分时段云量口径不一致，云海与白墙判断需复核。";
  }
  if (context.cloudBasisLevel === "total_only") {
    return "当日仅总云量，低云分层缺失，不能强推云海。";
  }
  if (context.cloudBasisLevel === "partial_layers" && context.shouldLowerCloudSeaConfidence) {
    return "当日部分时段分层云量不完整，低云判断需临近复核。";
  }
  if (context.cloudBasisLevel === "minor_mismatch") {
    return "当日少数时段云量口径需轻度复核。";
  }
  return undefined;
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

function cloudBasisWindowNote(context: CloudSeaCloudBasisConsistencyContext): string | undefined {
  if (context.cloudBasisLevel === "mixed_basis") {
    return "云量口径需复核，窗口仅作备选。";
  }
  if (context.cloudBasisLevel === "total_only") {
    return "仅总云量，低云分层缺失，需复核后再判断。";
  }
  if (context.cloudBasisLevel === "partial_layers" && context.shouldLowerCloudSeaConfidence) {
    return "分层云量不完整，低云判断需临近复核。";
  }
  if (context.cloudBasisLevel === "minor_mismatch") {
    return "总云与分层云略有差异，不作为高确定性窗口。";
  }
  return undefined;
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

function cloudBasisConsistencyValue(
  context: CloudSeaCloudBasisConsistencyContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
): string {
  if (context.cloudBasisLevel === "consistent") {
    return "口径一致";
  }
  if (context.cloudBasisLevel === "minor_mismatch") {
    return "轻度复核";
  }
  if (context.cloudBasisLevel === "mixed_basis") {
    return "口径差异";
  }
  if (context.cloudBasisLevel === "total_only") {
    return "仅总云量";
  }
  if (context.cloudBasisLevel === "partial_layers") {
    return cloudLayerCompletenessValue(cloudLayerCompleteness);
  }
  return "数据不足";
}

function cloudBasisConsistencyTone(
  context: CloudSeaCloudBasisConsistencyContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
): ForecastResultCardTone {
  if (context.cloudBasisLevel === "consistent") {
    return "info";
  }
  if (
    context.cloudBasisLevel === "mixed_basis" ||
    context.cloudBasisLevel === "total_only" ||
    cloudLayerCompleteness.layerCompletenessLevel === "missing"
  ) {
    return "accent";
  }
  return "info";
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
  cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext,
  multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null,
  terrainContext?: CloudSeaTerrainContext,
  recommendationGuard?: CloudSeaRecommendationGuardOutput,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
): string | null {
  if (weatherVariableConsistencyContext?.consistencyLevel === "conflict") {
    return weatherVariableConsistencyContext.userSummaryZh;
  }
  const guardWarning =
    recommendationGuard?.consistencyWarnings[0] ??
    recommendationGuard?.blockedStrongRecommendationReasons[0];
  if (guardWarning) {
    return terrainContext ? cloudSeaTerrainAwareText(guardWarning, terrainContext) : guardWarning;
  }
  if (cloudBasisConsistency.shouldLowerCloudSeaConfidence) {
    return cloudBasisConsistency.userSummaryZh;
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
  if (weatherVariableConsistencyContext?.temperatureBasisContext.shouldShowTemperatureBasisNote) {
    return weatherVariableConsistencyContext.temperatureBasisContext.userNoteZh;
  }
  return null;
}

function cloudSeaVerificationPoints(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  precipitationSignalContext?: CloudSeaPrecipitationSignalContext,
): readonly string[] {
  const fallback = terrainContext.shouldDowngradeCloudSeaWording
    ? ["复核近地雾气", "观察低云是否贴地", "观察远山层次和通透度", "有中高云时转向霞光或云层纹理"]
    : ["云顶高度是否低于机位", "远山层次是否打开", "风向是否推动云雾上涌"];

  const consistencyChecks = weatherVariableConsistencyActionChecks(
    weatherVariableConsistencyContext,
    precipitationSignalContext,
  );
  return [
    ...(result.cloudSeaAnalysis.dailyCloudSea[0]?.onSiteCheckpoints ?? fallback).map((item) =>
      cloudSeaTerrainAwareText(item, terrainContext),
    ),
    ...consistencyChecks,
  ].slice(0, 6);
}

function cloudSeaGearAdvice(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  displayTemperatureContext: CloudSeaDisplayTemperatureContext,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  precipitationSignalContext?: CloudSeaPrecipitationSignalContext,
  windowRiskContext?: CloudSeaWindowRiskContext,
): string {
  const humidity = cloudSeaWeatherEvidence(result, "湿度")?.value;
  const windowRainEquipmentAdvice = cloudSeaWindowRainEquipmentAdvice(windowRiskContext);
  const rain = windowRainEquipmentAdvice
    ? windowRainEquipmentAdvice
    : precipitationSignalContext?.precipitationSignalType === "none" ||
        precipitationSignalContext === undefined
      ? "清晨湿度高，注意镜头结露。"
      : precipitationSignalContext.equipmentAdviceZh;
  const temperature =
    displayTemperatureContext.warningZh ||
    displayTemperatureContext.isHighMountainTemperatureSensitive
      ? displayTemperatureContext.clothingAdviceZh
      : "";
  const vapor =
    weatherVariableConsistencyContext?.humidityDewPointStatus === "conflict"
      ? "水汽指标需现场复核，不宜仅凭湿度判断云海。"
      : "";
  const prioritizedAdvice = [rain, temperature, vapor]
    .filter(Boolean)
    .map(withoutEndingPunctuation)
    .join("；");
  const baseAdvice = terrainContext.shouldDowngradeCloudSeaWording
    ? `防潮、防滑，准备镜头布和轻量防风层。${
        humidity ? `湿度参考 ${humidity}，` : ""
      }复核低云、雾气和通透度后再决定是否等待。`
    : `防潮、防滑，准备镜头布和备用保暖层。${humidity ? `湿度参考 ${humidity}，` : ""}`;
  if (prioritizedAdvice) {
    return `${prioritizedAdvice}。${baseAdvice}`;
  }
  if (terrainContext.shouldDowngradeCloudSeaWording) {
    return `防潮、防滑，准备镜头布和轻量防风层。${
      humidity ? `湿度参考 ${humidity}，` : ""
    }复核低云、雾气和通透度后再决定是否等待。`;
  }
  return `防潮、防滑，准备镜头布和备用保暖层。${humidity ? `湿度参考 ${humidity}，` : ""}${rain}`;
}

function cloudSeaWindowRainEquipmentAdvice(
  windowRiskContext: CloudSeaWindowRiskContext | undefined,
): string | undefined {
  if (!windowRiskContext) {
    return undefined;
  }
  const impact = [
    windowRiskContext.duringWindowRainImpact,
    windowRiskContext.preWindowRainImpact,
    windowRiskContext.postWindowRainImpact,
    windowRiskContext.outsideWindowRainImpact,
    windowRiskContext.windowRainImpact,
  ].find((item) => item.impactLevel !== "none" && item.impactLevel !== "unknown");
  return impact?.equipmentAdviceZh ?? windowRiskContext.equipmentAdviceZh;
}

function withoutEndingPunctuation(value: string): string {
  return value.replace(/[。.!！]+$/u, "");
}

function weatherVariableConsistencyActionChecks(
  context: CloudSeaWeatherVariableConsistencyContext | undefined,
  precipitationSignalContext?: CloudSeaPrecipitationSignalContext,
): readonly string[] {
  if (!context && !precipitationSignalContext?.affectsEquipment) {
    return [];
  }

  return [
    context?.humidityDewPointStatus === "conflict" ? "复核湿度与露点差是否同口径" : undefined,
    context?.shouldDowngradePrecipitationWording || precipitationSignalContext?.affectsEquipment
      ? precipitationSignalContext?.precipitationSignalType === "meaningful_rain" ||
        precipitationSignalContext?.precipitationSignalType === "sustained_rain"
        ? "复核短临雨量、雷达和道路湿滑"
        : "复核短临降水量而非只看概率"
      : undefined,
    context && context.cloudBasisStatus !== "consistent" && context.cloudBasisStatus !== "unknown"
      ? "复核低/中/高云分层"
      : undefined,
    context && hasTemperatureBasisWarning(context)
      ? context.temperatureBasisContext.actionAdviceModifierZh || "按机位修正温度准备保暖"
      : undefined,
  ].filter((item): item is string => Boolean(item));
}

function hasTemperatureBasisWarning(
  context: CloudSeaWeatherVariableConsistencyContext | undefined,
): boolean {
  return (
    context?.shouldLowerComfortEquipmentConfidence === true ||
    context?.temperatureBasisContext.shouldShowTemperatureBasisNote === true ||
    context?.temperatureBasisStatus === "mixed" ||
    context?.temperatureBasisStatus === "raw_grid" ||
    context?.temperatureBasisStatus === "provider_point" ||
    context?.temperatureBasisStatus === "unknown"
  );
}

function cloudSeaConfidenceLabel(
  level: ForecastCalculationResult["cloudSeaAnalysis"]["confidenceLevel"],
  cloudLayerCompleteness?: CloudLayerCompletenessContext,
  cloudBasisConsistency?: CloudSeaCloudBasisConsistencyContext,
  multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null,
  recommendationGuard?: CloudSeaRecommendationGuardOutput,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
): string {
  if (cloudBasisConsistency?.shouldLowerCloudSeaConfidence) {
    return "低（云量口径需复核）";
  }
  if (cloudBasisConsistency?.cloudBasisLevel === "minor_mismatch") {
    return level === "high" ? "中（云量口径需复核）" : "低（云量口径需复核）";
  }
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
  if (weatherVariableConsistencyContext?.shouldLowerConfidence) {
    return level === "high" ? "中（变量需复核）" : "低（变量需复核）";
  }
  if (
    recommendationGuard?.blockedStrongRecommendationReasons.includes(
      "关键天气变量存在冲突，需临近复核",
    )
  ) {
    return level === "high" ? "中（变量需复核）" : "低（变量需复核）";
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

function cloudSeaWindowRiskTag(
  result: ForecastCalculationResult,
  score: number,
  precipitationSignalContext?: CloudSeaPrecipitationSignalContext,
): string {
  if (precipitationSignalContext?.shouldDowngradeWindow) {
    return precipitationSignalContext.riskLabelZh;
  }
  if (
    precipitationSignalContext &&
    precipitationSignalContext.precipitationSignalType !== "none" &&
    precipitationSignalContext.precipitationSignalType !== "unknown" &&
    precipitationSignalContext.shouldAvoidStrongRainWording
  ) {
    return precipitationSignalContext.riskLabelZh;
  }
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

function formatWindow(startTime: string, endTime: string, timezone = "Asia/Shanghai"): string {
  return formatShootingWindowZh({ startTime, endTime }, timezone);
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
