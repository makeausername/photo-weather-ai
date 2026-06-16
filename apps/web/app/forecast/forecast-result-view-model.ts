import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  buildCloudSeaPrecipitationSignalContext,
  buildCloudSeaRecommendationExplanation,
  buildCloudSeaWindowCenteredRiskContext,
  crossesLocalDateBoundary,
  formatArrivalDeadlineZh,
  formatLocalDate,
  formatLocalDateLabel,
  formatLocalDateTimeRange,
  formatLocalTime,
  formatLocalWeekday,
  formatLocalTimeRange,
  forecastTargetLabels,
  localDateKey,
  classifyGlowWindowLifecycle,
  glowLocalDateKey,
  glowDisplayRecommendationForScore,
  glowVividnessLevelForIndex,
  glowVividnessLevelLabelZh,
  isGlowWindowRecommendationEligible,
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
  type FinalPhotographyDecision,
  type GlowAnalysisResult,
  type GlowAerosolAssessment,
  type GlowBackupPlan,
  type GlowBestTarget,
  type GlowDisplayRecommendation,
  type GlowEvidenceItem,
  type GlowProviderAgreement,
  type GlowScoreBreakdown,
  type GlowTerrainObstructionAssessment,
  type GlowVividnessLevel,
  type GlowWindow,
  type GlowWindowLifecycleState,
  type LightPollutionInfo,
  type OverallSkyDarkness,
  type PhotographyPrecipitationRisk,
  type TargetDirectionLightPollution,
  type TerrainHorizonAssessment,
  resolvePublicSkyDarknessDisplay,
  type PublicSkyDarknessDisplay,
} from "@photo-weather/shared";
import { addHoursInTimezone, getForecastTargetDates } from "@photo-weather/calendar";
import { resolveMilkyWayTerrainHorizonAssessment } from "@photo-weather/terrain";
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
  readonly localDateKey: string;
  readonly localDateLabel: string;
  readonly timeRangeLabel: string;
  readonly dateTimeRangeLabel: string;
  readonly fullTimeRangeLabel: string;
  readonly compactTimeRangeLabel: string;
  readonly crossesLocalDateBoundary: boolean;
  readonly timezone: string;
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

export type GlowProfessionalScoringWindow = {
  readonly key: string;
  readonly label: string;
  readonly timeLabel: string;
  readonly occurrenceProbabilityPercent?: number;
  readonly occurrenceDisplay: string;
  readonly vividnessIndex?: number;
  readonly vividnessLevel?: GlowVividnessLevel;
  readonly vividnessDisplay: string;
  readonly practicalSuitabilityScore?: number;
  readonly practicalDisplay: string;
  readonly confidence?: number;
  readonly confidenceDisplay: string;
  readonly providerAgreement?: GlowProviderAgreement;
  readonly providerAgreementDisplay: string;
  readonly calibrationMode?: string;
  readonly breakdown?: GlowScoreBreakdown;
  readonly componentItems: readonly GlowEvidenceViewItem[];
  readonly tone: ForecastResultCardTone;
};

export type GlowOpportunityPhase = "sunrise" | "sunset";

export type GlowDisplayRecommendationLabel =
  | GlowDisplayRecommendation
  | "窗口进行中"
  | "已结束"
  | "暂无明确时间"
  | "暂无后续窗口"
  | "超出本次预报范围";

export type GlowOverallRecommendation = {
  readonly preferredTarget: "朝霞" | "晚霞" | "朝霞晚霞" | "暂不专程";
  readonly headline: string;
  readonly preferredDate: string;
  readonly preferredTime: string;
  readonly preferredWindow: string;
  readonly recommendation: GlowDisplayRecommendationLabel;
  readonly hasActionableWindow: boolean;
  readonly windowState?: GlowWindowLifecycleState;
  readonly windowStartAt?: string;
  readonly windowEndAt?: string;
  readonly evaluatedAt: string;
  readonly timezone: string;
  readonly arrivalAdvice: string;
  readonly conciseReason: string;
  readonly mainRisk: string;
  readonly backupPlan: string;
  readonly tone: ForecastResultCardTone;
};

export type GlowDailyOpportunitySlot = {
  readonly phase: GlowOpportunityPhase;
  readonly label: "朝霞" | "晚霞";
  readonly lifecycle: GlowWindowLifecycleState;
  readonly probabilityPercent?: number;
  readonly probabilityDisplay: string;
  readonly vividnessIndex?: number;
  readonly vividnessLevel?: GlowVividnessLevel;
  readonly vividnessDisplay: string;
  readonly practicalSuitabilityScore?: number;
  readonly practicalDisplay: string;
  readonly confidence?: number;
  readonly calibrationMode?: string;
  readonly providerAgreement?: GlowProviderAgreement;
  readonly bestStartAt?: string;
  readonly bestEndAt?: string;
  readonly timeLabel: string;
  readonly recommendation: GlowDisplayRecommendationLabel;
  readonly isRecommendationEligible: boolean;
  readonly tone: ForecastResultCardTone;
};

export type GlowDailyOpportunity = {
  readonly key: string;
  readonly localDateKey: string;
  readonly date: string;
  readonly localDateLabel: string;
  readonly dateLabel: string;
  readonly weekdayLabel: string;
  readonly timezone: string;
  readonly sunrise: GlowDailyOpportunitySlot;
  readonly sunset: GlowDailyOpportunitySlot;
  readonly preferredTarget: "朝霞" | "晚霞" | "朝霞晚霞" | "暂不专程";
  readonly dailyRecommendation: GlowDisplayRecommendationLabel;
  readonly preferredWindowState?: GlowWindowLifecycleState;
  readonly conciseReason: string;
  readonly isPartiallyCovered: boolean;
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
  readonly evaluatedAt: string;
  readonly timezone: string;
  readonly preferredTarget: GlowOverallRecommendation["preferredTarget"];
  readonly preferredWindow: string;
  readonly conciseReason: string;
  readonly overallRecommendation: GlowOverallRecommendation;
  readonly dailyOpportunities: readonly GlowDailyOpportunity[];
  readonly professionalEvidence: readonly GlowEvidenceViewItem[];
  readonly professionalScoringWindows: readonly GlowProfessionalScoringWindow[];
  readonly coreCards: readonly ForecastResultCard[];
  readonly dailyTrend: readonly GlowDailyTrendItem[];
  readonly glowWindows: readonly GlowWindowItem[];
  readonly professionalHourlyData: ProfessionalHourlyDisplayData;
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
  readonly terrainHorizonLabel: string;
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

export type AstroNightHorizonCoverageState = "covered" | "partial" | "outside_horizon";

export type AstroNightRecommendationLevel =
  | "recommended"
  | "watch"
  | "backup"
  | "not_recommended"
  | "insufficient";

export type AstroLightPollutionDisplayModel = {
  readonly available: boolean;
  readonly dataAvailable: boolean;
  readonly ambientRiskIndex: number | null;
  readonly ambientRiskDisplayValue: string;
  readonly ambientRiskLevelLabelZh: string;
  readonly localRadiance: number | null;
  readonly surroundingHaloRadiance: number | null;
  readonly bestWindowTargetAzimuth: number | null;
  readonly bestWindowDirectionRisk: number | null;
  readonly bestWindowDirectionRiskLabelZh: string | null;
  readonly confidenceLabelZh: string;
  readonly sourceLabelZh: string;
  readonly datasetLabel: string;
  readonly estimatedBortleAvailable: boolean;
  readonly estimatedBortleRangeLabel: string;
  readonly estimatedBortleSkyQualityLabel: string;
  readonly estimatedBortleConfidenceLabel: string;
  readonly estimatedBortleBasis: string;
  readonly estimatedBortleDisclaimer: string;
  readonly estimatedBortleMethodVersion: string;
  readonly primaryConclusionZh: string;
  readonly recommendationZh: string;
  readonly statusBadgeLabelZh: string;
  readonly statusTone: ForecastResultCardTone;
  readonly showDailyDirection: boolean;
  readonly compactLabel: string;
  readonly detail: string;
  readonly ambientLabel: string;
  readonly targetDirectionLabel: string;
  readonly judgmentSummaryZh: string;
  readonly professionalDataItems: readonly ForecastResultSectionItem[];
  readonly professionalDataGroups: readonly AstroProfessionalDataGroup[];
  readonly directionalSectorItems: readonly ForecastResultSectionItem[];
  readonly noticeZh: string;
  readonly overallSkyDarkness: OverallSkyDarkness;
  readonly targetDirectionLightPollution: TargetDirectionLightPollution;
  readonly finalPhotographyDecision: FinalPhotographyDecision | null;
  readonly overallSkyDarknessRangeLabel: string;
  readonly overallSkyDarknessQualityLabel: string;
  readonly targetDirectionLightPollutionLabel: string;
  readonly targetDirectionLightPollutionWarning: string;
  readonly finalPhotographyImplicationZh: string;
  readonly publicDecisionLabel: string;
  readonly publicDirectionDecisionLabel: string;
};

export type AstroProfessionalDataGroup = {
  readonly key: string;
  readonly title: string;
  readonly badgeLabel?: string;
  readonly description?: string;
  readonly items: readonly ForecastResultSectionItem[];
  readonly collapsedByDefault?: boolean;
  readonly developerDiagnostics?: boolean;
};

export type AstroTerrainHorizonDisplayModel = {
  readonly available: boolean;
  readonly obstructionLevel: TerrainHorizonAssessment["obstructionLevel"];
  readonly statusLabelZh: string;
  readonly statusBadgeLabelZh: string;
  readonly statusTone: ForecastResultCardTone;
  readonly primaryConclusionZh: string;
  readonly detail: string;
  readonly recommendationZh: string;
  readonly compactLabel: string;
  readonly targetAzimuthDisplay: string;
  readonly targetAltitudeDisplay: string;
  readonly horizonAltitudeDisplay: string;
  readonly clearanceDisplay: string;
  readonly confidenceLabelZh: string;
  readonly dataSourceLabelZh: string;
  readonly unavailableReasonLabelZh: string;
  readonly professionalDataItems: readonly ForecastResultSectionItem[];
  readonly diagnosticsNoteZh: string;
  readonly publicDecisionLabel: string;
};

export type AstroNightDisplayModel = {
  readonly nightKey: string;
  readonly localEveningDate: string;
  readonly localEveningDateLabel: string;
  readonly weekdayLabel: string;
  readonly timezone: string;
  readonly horizonCoverageState: AstroNightHorizonCoverageState;
  readonly horizonCoverageLabel: string;
  readonly isPartiallyCovered: boolean;
  readonly astronomicalNight: {
    readonly startAt?: string;
    readonly endAt?: string;
    readonly durationMinutes: number;
    readonly lifecycle: "available" | "partial" | "unavailable";
    readonly label: string;
    readonly windowLabel: string;
  };
  readonly moon: {
    readonly phaseName: string;
    readonly illuminationPercent: number | null;
    readonly illuminationDisplay: string;
    readonly riseAt?: string;
    readonly setAt?: string;
    readonly altitudeDuringBestWindow: number | null;
    readonly altitudeDuringBestWindowDisplay: string;
    readonly moonlightInterferenceLevel: string;
    readonly overlapMinutes: number | null;
    readonly overlapDisplay: string;
  };
  readonly milkyWay: {
    readonly available: boolean;
    readonly coreVisibilityStartAt?: string;
    readonly coreVisibilityEndAt?: string;
    readonly bestStartAt?: string;
    readonly bestEndAt?: string;
    readonly maximumAltitudeDegrees: number | null;
    readonly maximumAltitudeDisplay: string;
    readonly azimuthSummary: string;
    readonly geometricWindowLabel: string;
    readonly weatherUsableWindowLabel: string;
    readonly bestWindowLabel: string;
  };
  readonly lightPollution: AstroLightPollutionDisplayModel;
  readonly terrainHorizon: AstroTerrainHorizonDisplayModel;
  readonly weather: {
    readonly validHourCount: number;
    readonly totalHourCount: number;
    readonly coverageDisplay: string;
    readonly cloudSummary: string;
    readonly lowCloudRisk: string;
    readonly visibilitySummary: string;
    readonly humidityRisk: string;
    readonly precipitationRisk: string;
    readonly windRisk: string;
  };
  readonly starPhotographyProbabilityPercent: number | null;
  readonly milkyWayPhotographyProbabilityPercent: number | null;
  readonly starPhotographyProbabilityDisplay: string;
  readonly milkyWayPhotographyProbabilityDisplay: string;
  readonly starPhotographyIndex: number | null;
  readonly milkyWayPhotographyIndex: number | null;
  readonly starPhotographyIndexDisplay: string;
  readonly milkyWayPhotographyIndexDisplay: string;
  readonly recommendationLevel: AstroNightRecommendationLevel;
  readonly recommendationLabel: string;
  readonly conciseReason: string;
  readonly confidence: string;
  readonly unavailableReason?: string;
  readonly bestShootingWindowLabel: string;
  readonly directionSummaryLabel: string;
  readonly moonImpactSummaryLabel: string;
  readonly cloudWeatherBlockerLabel: string;
  readonly lightPollutionSummaryLabel: string;
  readonly terrainSummaryLabel: string;
  readonly actionNote: string;
  readonly factorChips: readonly AstroNightFactorChip[];
  readonly calibrationMode: "heuristic";
};

export type AstroNightFactorChip = {
  readonly key: string;
  readonly label: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroJudgmentFactorCard = {
  readonly key: string;
  readonly label: string;
  readonly status: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroDecisionFactItem = {
  readonly key: string;
  readonly semanticKey: string;
  readonly label: string;
  readonly value: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroPublicFactorChip = {
  readonly key: string;
  readonly semanticKey: string;
  readonly label: string;
  readonly value: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroTopSidePanelItem = {
  readonly key: string;
  readonly semanticKey: string;
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroPublicDisplayModel = {
  readonly decisionFacts: readonly AstroDecisionFactItem[];
  readonly factorChips: readonly AstroPublicFactorChip[];
  readonly sidePanelItems: readonly AstroTopSidePanelItem[];
  readonly actionPlan: readonly AstroActionPlanItem[];
  readonly judgmentFactors: readonly AstroJudgmentFactorCard[];
};

export type AstroActionSummaryItem = {
  readonly key: "worth" | "best-window" | "light-pollution" | "main-blocker" | "backup" | "arrival";
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroActionPlanItem = {
  readonly key: "timing" | "window" | "direction" | "avoid-direction" | "blocker" | "note";
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroHourlySummaryItem = {
  readonly key:
    | "best-hours"
    | "worst-hours"
    | "cloud-minimum"
    | "visibility-wind"
    | "precipitation";
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
};

export type AstroDecisionSummary = {
  readonly recommendationLabel: string;
  readonly recommendationTone: ForecastResultCardTone;
  readonly bestNightLabel: string;
  readonly bestWindowLabel: string;
  readonly backupLabel: string;
  readonly backupDetail: string;
  readonly arrivalLabel: string;
  readonly actionSuggestionLabel: string;
  readonly directionLabel: string;
  readonly mainRiskLabel: string;
  readonly mainRiskDetail: string;
  readonly secondaryRiskLabel: string;
  readonly confidenceLabel: string;
  readonly oneSentenceAdvice: string;
  readonly lightPollutionLabel: string;
  readonly terrainLabel: string;
};

export type AstroForecastViewModel = {
  readonly coreCards: readonly ForecastResultCard[];
  readonly dailyTrend: readonly AstroDailyTrendItem[];
  readonly nightlyCards: readonly AstroNightDisplayModel[];
  readonly bestNight?: AstroNightDisplayModel;
  readonly backupNight?: AstroNightDisplayModel;
  readonly decisionSummary: AstroDecisionSummary;
  readonly actionSummary: readonly AstroActionSummaryItem[];
  readonly actionPlan: readonly AstroActionPlanItem[];
  readonly judgmentFactors: readonly AstroJudgmentFactorCard[];
  readonly publicDisplay: AstroPublicDisplayModel;
  readonly professionalDataGroups: readonly AstroProfessionalDataGroup[];
  readonly professionalHourlyData: ProfessionalHourlyDisplayData;
  readonly hourlySummary: readonly AstroHourlySummaryItem[];
  readonly astronomicalNightWindows: readonly AstroWindowViewItem[];
  readonly moonlessNightWindows: readonly AstroWindowViewItem[];
  readonly milkyWayCandidateWindows: readonly AstroWindowViewItem[];
  readonly recommendedMilkyWayWindows: readonly AstroWindowViewItem[];
  readonly cloudEvidence: readonly AstroEvidenceViewItem[];
  readonly visibilityEvidence: readonly AstroEvidenceViewItem[];
  readonly moonEvidence: readonly AstroEvidenceViewItem[];
  readonly terrainEvidence: readonly AstroEvidenceViewItem[];
  readonly lightPollutionEvidence: readonly AstroEvidenceViewItem[];
  readonly lightPollution: AstroLightPollutionDisplayModel;
  readonly terrainHorizon: AstroTerrainHorizonDisplayModel;
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
  readonly bestWindow?: {
    readonly startTime?: string | null;
    readonly endTime?: string | null;
  } | null;
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
  const lowCloudRiskLabel = glowRiskLabel(analysis.lowCloudObstructionRisk);
  const professionalHourlyData = buildProfessionalHourlyDisplayDataForResult({
    result,
    focusWindows: buildGlowProfessionalFocusWindows(analysis),
    riskWindows: analysis.notRecommendedGlowWindows.map(glowWindowToProfessionalWindow),
    rowAnnotations: buildGlowProfessionalHourlyAnnotations(result),
  });
  const aerosolCard = buildGlowAerosolCard(analysis.aerosolAssessment);
  const terrainObstructionCards = buildGlowTerrainObstructionCards(result, analysis);
  const terrainObstructionSummary = buildGlowTerrainObstructionSummary(terrainObstructionCards);
  const overallRecommendation = buildGlowOverallRecommendation(result, analysis);
  const dailyOpportunities = buildGlowDailyOpportunities(result, analysis);
  const professionalScoringWindows = buildGlowProfessionalScoringWindows(result, analysis);
  const professionalEvidence = buildGlowProfessionalEvidence(
    result,
    analysis,
    aerosolCard,
    terrainObstructionCards,
  );
  const recommendedAction = firstText(
    analysis.travelRecommendations,
    "建议结合朝霞、晚霞和现场云层变化灵活安排。",
  );

  return {
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
    preferredTarget: overallRecommendation.preferredTarget,
    preferredWindow: overallRecommendation.preferredWindow,
    conciseReason: overallRecommendation.conciseReason,
    overallRecommendation,
    dailyOpportunities,
    professionalEvidence,
    professionalScoringWindows,
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
        overallRecommendation.hasActionableWindow
          ? overallRecommendation.preferredTarget
          : "暂无后续霞光窗口",
        overallRecommendation.hasActionableWindow
          ? `${overallRecommendation.preferredWindow}，${overallRecommendation.conciseReason}`
          : overallRecommendation.conciseReason,
        overallRecommendation.tone,
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
        terrainObstructionSummary.value,
        terrainObstructionSummary.detail,
        terrainObstructionCards.some((card) => card.tone === "danger") ? "danger" : "info",
      ),
    ],
    dailyTrend: buildGlowDailyTrend(result, analysis),
    glowWindows: buildGlowWindowItems(result, analysis),
    professionalHourlyData,
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

function buildGlowOverallRecommendation(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): GlowOverallRecommendation {
  const selectedWindow = selectOverallGlowWindowState(result, analysis);
  const recommendation = selectedWindow
    ? glowRecommendationForLifecycle(selectedWindow.state, selectedWindow.score)
    : "暂无后续窗口";
  const preferredTarget = selectedWindow
    ? glowPreferredTargetLabel(selectedWindow.phase, recommendation)
    : "暂不专程";
  const backupPlan = analysis.backupPlans[0]
    ? `${analysis.backupPlans[0].condition}：${analysis.backupPlans[0].action}`
    : "若霞光不足，转拍远山层次、云缝光或通透地景。";
  const mainRisk = firstText(
    analysis.riskReasons,
    firstText(
      result.riskFlags.map((risk) => risk.description),
      "主要风险较低，仍需临近复核。",
    ),
  );

  return {
    preferredTarget,
    headline: selectedWindow ? `优先${preferredTarget}` : "暂无后续霞光窗口",
    preferredDate: selectedWindow?.date
      ? windowDateLabel(result, selectedWindow.date)
      : "暂无后续窗口",
    preferredTime: selectedWindow
      ? formatGlowLifecycleWindowForParentDate(result, selectedWindow, "暂无明确最佳时间")
      : "暂无后续窗口",
    preferredWindow: selectedWindow
      ? formatGlowLifecycleWindowForPublic(result, selectedWindow, "暂无明确最佳时间")
      : "所选预报范围内暂无后续霞光窗口",
    recommendation,
    hasActionableWindow: Boolean(selectedWindow),
    windowState: selectedWindow?.state,
    windowStartAt: selectedWindow?.startAt,
    windowEndAt: selectedWindow?.endAt,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
    arrivalAdvice: selectedWindow
      ? glowArrivalHint(result, selectedWindow.phase, selectedWindow)
      : "暂无可用到达建议",
    conciseReason: compactGlowDisplayText(
      selectedWindow
        ? firstText(
            [selectedWindow.window?.noteZh, ...analysis.opportunityReasons].filter(
              (item): item is string => Boolean(item),
            ),
            result.summary,
          )
        : "所选预报范围内暂无后续霞光窗口。",
    ),
    mainRisk: compactGlowDisplayText(mainRisk),
    backupPlan: compactGlowDisplayText(backupPlan),
    tone: selectedWindow ? selectedWindow.tone : "muted",
  };
}

function buildGlowDailyOpportunities(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): readonly GlowDailyOpportunity[] {
  const dailyByDate = new Map(analysis.dailyGlow.map((day) => [day.date, day]));
  return getGlowCoveredLocalDates(result).map((date) => {
    const day = dailyByDate.get(date);
    const sunriseState = buildGlowPhaseWindowStateForDate(result, analysis, day, date, "sunrise");
    const sunsetState = buildGlowPhaseWindowStateForDate(result, analysis, day, date, "sunset");
    const preferredState = selectDailyPreferredGlowWindowState([sunriseState, sunsetState]);
    const dailyRecommendation = preferredState
      ? preferredState.recommendation
      : dailyRecommendationForGlowSlots(sunriseState, sunsetState);

    return {
      key: date,
      localDateKey: date,
      date,
      localDateLabel: formatLocalDate(date, result.calendarBasis.timezone),
      dateLabel: formatLocalDate(date, result.calendarBasis.timezone),
      weekdayLabel: formatLocalWeekday(date, result.calendarBasis.timezone),
      timezone: result.calendarBasis.timezone,
      sunrise: glowDailyOpportunitySlot(result, sunriseState),
      sunset: glowDailyOpportunitySlot(result, sunsetState),
      preferredTarget: preferredState
        ? glowPreferredTargetLabel(preferredState.phase, dailyRecommendation)
        : "暂不专程",
      dailyRecommendation,
      preferredWindowState: preferredState?.state,
      conciseReason: dailyGlowLifecycleReason(day, sunriseState, sunsetState, preferredState),
      isPartiallyCovered: isGlowCoveredDatePartiallyCovered(result, date),
    };
  });
}

export function getGlowCoveredLocalDates(result: ForecastCalculationResult): readonly string[] {
  const timezone = result.calendarBasis.timezone;
  try {
    return getForecastTargetDates(
      result.calendarBasis.forecastStart,
      result.calendarBasis.forecastEnd,
      timezone,
    );
  } catch {
    const fallbackDates = result.calendarBasis.targetDates.length
      ? result.calendarBasis.targetDates
      : result.targetDates;
    return [...new Set(fallbackDates)].sort();
  }
}

function glowDailyOpportunitySlot(
  result: ForecastCalculationResult,
  state: GlowLifecycleWindowView,
): GlowDailyOpportunitySlot {
  const canShowProbability = state.state === "upcoming" || state.state === "active";
  return {
    phase: state.phase,
    label: glowPhaseLabel(state.phase),
    lifecycle: state.state,
    probabilityPercent: canShowProbability ? state.probabilityPercent : undefined,
    probabilityDisplay: state.probabilityDisplay,
    vividnessIndex: state.vividnessIndex,
    vividnessLevel: state.vividnessLevel,
    vividnessDisplay: state.vividnessDisplay,
    practicalSuitabilityScore: state.practicalSuitabilityScore,
    practicalDisplay: state.practicalDisplay,
    confidence: state.confidence,
    calibrationMode: state.calibrationMode,
    providerAgreement: state.providerAgreement,
    bestStartAt: state.startAt,
    bestEndAt: state.endAt,
    timeLabel: formatGlowLifecycleWindowForParentDate(
      result,
      state,
      state.state === "outside_horizon" ? "超出本次预报范围" : "暂无明确时间",
    ),
    recommendation: state.recommendation,
    isRecommendationEligible: state.isRecommendationEligible,
    tone: state.tone,
  };
}

function dailyRecommendationForGlowSlots(
  sunrise: GlowLifecycleWindowView,
  sunset: GlowLifecycleWindowView,
): GlowDisplayRecommendationLabel {
  if (sunrise.state === "active" || sunset.state === "active") {
    return "窗口进行中";
  }
  if (sunrise.state === "upcoming" || sunset.state === "upcoming") {
    const best = selectDailyPreferredGlowWindowState([sunrise, sunset]);
    return best?.recommendation ?? "不建议专程前往";
  }
  if (sunrise.state === "ended" || sunset.state === "ended") {
    return "已结束";
  }
  if (sunrise.state === "outside_horizon" || sunset.state === "outside_horizon") {
    return "超出本次预报范围";
  }
  return "暂无明确时间";
}

function isGlowCoveredDatePartiallyCovered(
  result: ForecastCalculationResult,
  date: string,
): boolean {
  const timezone = result.calendarBasis.timezone;
  const startAt = result.calendarBasis.forecastStart;
  const endAt = result.calendarBasis.forecastEnd;
  const startDate = glowLocalDateKey(startAt, timezone);
  const endTimestamp = Date.parse(endAt);
  const exclusiveEndDate = Number.isFinite(endTimestamp)
    ? glowLocalDateKey(new Date(endTimestamp - 1), timezone)
    : glowLocalDateKey(endAt, timezone);
  const startIsPartial = startDate === date && formatLocalTime(startAt, timezone) !== "00:00";
  const endClock = formatLocalTime(endAt, timezone);
  const endIsPartial = exclusiveEndDate === date && endClock !== "00:00";

  return startIsPartial || endIsPartial;
}

function buildGlowProfessionalEvidence(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
  aerosolCard: GlowAerosolCard,
  terrainObstructionCards: readonly GlowTerrainObstructionCard[],
): readonly GlowEvidenceViewItem[] {
  const terrainObstructionSummary = buildGlowTerrainObstructionSummary(terrainObstructionCards);
  const summaryItems: readonly GlowEvidenceViewItem[] = [
    {
      key: "glow-evidence-occurrence",
      label: "是否容易出现",
      value: `${Math.round(analysis.occurrenceProbabilityPercent)}%`,
      detail: "按中高云承载、低云遮挡、降水干扰、通透度、数据完整度和可用来源一致性校准。",
      tone: analysis.occurrenceProbabilityPercent >= 65 ? "accent" : "info",
    },
    {
      key: "glow-evidence-vividness",
      label: "出现后是否鲜艳",
      value: glowVividnessDisplay(analysis.vividnessIndex, analysis.vividnessLevel),
      detail:
        analysis.vividnessIndex >= 65
          ? "如果发生霞光，色彩强度预计较好。"
          : "即使出现霞光，色彩可能偏弱或局部。",
      tone: analysis.vividnessIndex >= 65 ? "accent" : "info",
    },
    {
      key: "glow-evidence-main-blocker",
      label: "主要阻碍",
      value: glowPrimaryBlockerLabel(analysis, terrainObstructionSummary),
      detail: glowRainOverlapText(analysis),
      tone:
        analysis.lowCloudObstructionRisk >= 70 || analysis.precipitationDisruptionRisk >= 70
          ? "danger"
          : "info",
    },
    {
      key: "glow-evidence-confidence",
      label: "数据可信度",
      value: `${Math.round(analysis.confidence)} 分`,
      detail: glowProviderAgreementDisplay(analysis.providerAgreement),
      tone: analysis.confidence >= 75 ? "accent" : "muted",
    },
  ];
  const detailedItems: readonly GlowEvidenceViewItem[] = [
    ...mapGlowEvidence(analysis.cloudLayerEvidence),
    ...mapGlowEvidence(analysis.visibilityEvidence),
    {
      key: aerosolCard.key,
      label: "气溶胶/透明度",
      value: aerosolCard.stateLabel,
      detail: aerosolCard.detail,
      tone: aerosolCard.tone,
    },
    ...result.riskFlags.slice(0, 2).map((risk) => ({
      key: `glow-risk-${risk.key}`,
      label: risk.label,
      value: riskLevelText(risk.level),
      detail: risk.description,
      tone: risk.level === "high" ? "danger" : ("info" as ForecastResultCardTone),
    })),
  ];

  return uniqueGlowEvidenceItems([...summaryItems, ...detailedItems]);
}

function buildGlowProfessionalScoringWindows(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): readonly GlowProfessionalScoringWindow[] {
  return analysis.canonicalWindows
    .filter(
      (window) =>
        window.occurrenceProbabilityPercent !== undefined ||
        window.vividnessIndex !== undefined ||
        window.practicalSuitabilityScore !== undefined,
    )
    .slice(0, 10)
    .map((window) => {
      const occurrenceProbabilityPercent = finiteNumber(window.occurrenceProbabilityPercent);
      const vividnessIndex = finiteNumber(window.vividnessIndex);
      const vividnessLevel =
        window.vividnessLevel ??
        (vividnessIndex !== undefined ? glowVividnessLevelForIndex(vividnessIndex) : undefined);
      const practicalSuitabilityScore = finiteNumber(window.practicalSuitabilityScore);
      const confidence = finiteNumber(window.confidence);
      return {
        key: `${window.phase}-${window.date}`,
        label: `${windowDateLabel(result, window.date)} ${glowPhaseLabel(window.phase)}`,
        timeLabel:
          window.bestStartAt && window.bestEndAt
            ? formatLocalTimeRange(
                window.bestStartAt,
                window.bestEndAt,
                result.calendarBasis.timezone,
              )
            : "暂缺",
        occurrenceProbabilityPercent,
        occurrenceDisplay:
          occurrenceProbabilityPercent !== undefined
            ? `${Math.round(occurrenceProbabilityPercent)}%`
            : "暂缺",
        vividnessIndex,
        vividnessLevel,
        vividnessDisplay: glowVividnessDisplay(vividnessIndex, vividnessLevel),
        practicalSuitabilityScore,
        practicalDisplay:
          practicalSuitabilityScore !== undefined
            ? `${Math.round(practicalSuitabilityScore)} 分`
            : "暂缺",
        confidence,
        confidenceDisplay: confidence !== undefined ? `${Math.round(confidence)} 分` : "暂缺",
        providerAgreement: window.providerAgreement,
        providerAgreementDisplay: glowProviderAgreementDisplay(window.providerAgreement),
        calibrationMode: window.calibrationMode,
        breakdown: window.scoreBreakdown,
        componentItems: glowProfessionalScoringComponentItems(window.scoreBreakdown),
        tone: scoreTone(practicalSuitabilityScore ?? occurrenceProbabilityPercent ?? 0),
      };
    });
}

function glowProfessionalScoringComponentItems(
  breakdown: GlowScoreBreakdown | undefined,
): readonly GlowEvidenceViewItem[] {
  if (!breakdown) {
    return [];
  }
  return [
    {
      key: "color-carrier",
      label: "色彩载体",
      value: `${Math.round(breakdown.colorCarrierScore)} 分`,
      detail: "中高云和总云量是否能承载霞光色彩。",
      tone: scoreTone(breakdown.colorCarrierScore),
    },
    {
      key: "low-cloud",
      label: "低云遮挡",
      value: glowRiskLabel(breakdown.lowCloudObstructionRisk),
      detail: "低云越高，越可能压住太阳方向。",
      tone: breakdown.lowCloudObstructionRisk >= 70 ? "danger" : "info",
    },
    {
      key: "precipitation",
      label: "降水干扰",
      value: glowRiskLabel(breakdown.precipitationDisruptionRisk),
      detail: "窗口内降水会降低稳定观测和出片价值。",
      tone: breakdown.precipitationDisruptionRisk >= 70 ? "danger" : "info",
    },
    {
      key: "visibility",
      label: "通透度",
      value: `${Math.round(breakdown.visibilityColorQualityScore)} 分`,
      detail: "能见度、湿度和透明度对色彩纯度与远景层次的影响。",
      tone: scoreTone(breakdown.visibilityColorQualityScore),
    },
    {
      key: "practical",
      label: "前往建议",
      value: `${Math.round(breakdown.practicalSuitabilityScore)} 分`,
      detail: "综合出现概率、鲜艳度、低云、降水、地形、风湿和可信度。",
      tone: scoreTone(breakdown.practicalSuitabilityScore),
    },
  ];
}

function glowProviderAgreementDisplay(agreement: GlowProviderAgreement | undefined): string {
  if (!agreement || agreement.status === "unavailable" || agreement.providerCount <= 1) {
    return "单一来源，暂不判断一致性";
  }
  if (agreement.status === "high") {
    return "可用来源判断接近";
  }
  if (agreement.status === "medium") {
    return "可用来源存在中等差异";
  }
  return "可用来源差异较大";
}

function glowPrimaryBlockerLabel(
  analysis: GlowAnalysisResult,
  terrainObstructionSummary: { readonly value: string },
): string {
  if (analysis.precipitationDisruptionRisk >= 70) {
    return "降水干扰";
  }
  if (analysis.lowCloudObstructionRisk >= 70) {
    return "低云遮挡";
  }
  if (analysis.visibilityColorQualityScore < 50) {
    return "通透度偏弱";
  }
  if (
    terrainObstructionSummary.value.includes("阻") ||
    terrainObstructionSummary.value.includes("遮")
  ) {
    return "地形遮挡";
  }
  return "暂无单一强阻碍";
}

function scoreTone(score: number): ForecastResultCardTone {
  if (score >= 75) {
    return "accent";
  }
  if (score >= 50) {
    return "info";
  }
  return "muted";
}

function uniqueGlowEvidenceItems(
  items: readonly GlowEvidenceViewItem[],
): readonly GlowEvidenceViewItem[] {
  const seen = new Set<string>();
  const unique: GlowEvidenceViewItem[] = [];
  for (const item of items) {
    const key = `${item.label}-${item.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

type GlowLifecycleWindowView = {
  readonly phase: GlowOpportunityPhase;
  readonly window?: GlowWindow;
  readonly date?: string;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly state: GlowWindowLifecycleState;
  readonly score: number;
  readonly probabilityPercent: number;
  readonly probabilityDisplay: string;
  readonly vividnessIndex?: number;
  readonly vividnessLevel?: GlowVividnessLevel;
  readonly vividnessDisplay: string;
  readonly practicalSuitabilityScore?: number;
  readonly practicalDisplay: string;
  readonly confidence?: number;
  readonly calibrationMode?: string;
  readonly providerAgreement?: GlowProviderAgreement;
  readonly recommendation: GlowDisplayRecommendationLabel;
  readonly isRecommendationEligible: boolean;
  readonly evaluatedAt: string;
  readonly timezone: string;
  readonly tone: ForecastResultCardTone;
  readonly source: "scored" | "sun_event" | "none";
};

function glowEvaluatedAt(result: ForecastCalculationResult): string {
  return result.generatedAt || result.calendarBasis.forecastStart;
}

function allGlowWindows(analysis: GlowAnalysisResult): readonly GlowWindow[] {
  const windows = [
    analysis.bestGlowWindow,
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
  ].filter((window): window is GlowWindow => Boolean(window));
  const seen = new Set<string>();
  const unique: GlowWindow[] = [];

  for (const window of windows) {
    const key = `${window.type}-${window.start}-${window.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(window);
  }

  return unique;
}

function selectOverallGlowWindowState(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
): GlowLifecycleWindowView | undefined {
  const states = allGlowWindows(analysis).map((window) =>
    buildGlowLifecycleWindowView(
      result,
      isMorningGlowWindow(window) ? "sunrise" : "sunset",
      window,
      window.practicalScore ?? window.score,
    ),
  );
  return selectActionableGlowWindowState(result, states);
}

function buildGlowPhaseWindowStateForDate(
  result: ForecastCalculationResult,
  analysis: GlowAnalysisResult,
  day: GlowAnalysisResult["dailyGlow"][number] | undefined,
  date: string,
  phase: GlowOpportunityPhase,
): GlowLifecycleWindowView {
  const window =
    glowWindowForDateAndPhase(analysis, date, phase) ??
    (day ? dailyGlowWindowForPhase(day, phase) : undefined);
  const score = dailyGlowPhaseScore(day, window, analysis, phase);
  if (window) {
    return buildGlowLifecycleWindowView(result, phase, window, score);
  }

  const derivedState = buildDerivedGlowWindowState(result, phase, date, score);
  if (derivedState?.state === "ended" || derivedState?.state === "outside_horizon") {
    return derivedState;
  }

  return buildUnavailableGlowWindowState(result, phase, score);
}

function dailyGlowPhaseScore(
  day: GlowAnalysisResult["dailyGlow"][number] | undefined,
  window: GlowWindow | undefined,
  analysis: GlowAnalysisResult,
  phase: GlowOpportunityPhase,
): number {
  if (day) {
    return phase === "sunrise" ? day.sunriseScore : day.sunsetScore;
  }
  if (typeof window?.score === "number" && Number.isFinite(window.score)) {
    return window.score;
  }
  return phase === "sunrise" ? analysis.sunriseGlowScore : analysis.sunsetGlowScore;
}

function dailyGlowWindowForPhase(
  day: GlowAnalysisResult["dailyGlow"][number],
  phase: GlowOpportunityPhase,
): GlowWindow | undefined {
  return [day.bestWindow, day.watchableWindow, day.notRecommendedWindow]
    .filter((window): window is GlowWindow => Boolean(window))
    .find((window) =>
      phase === "sunrise" ? isMorningGlowWindow(window) : !isMorningGlowWindow(window),
    );
}

function selectActionableGlowWindowState(
  result: ForecastCalculationResult,
  states: readonly GlowLifecycleWindowView[],
): GlowLifecycleWindowView | undefined {
  const actionables = states.filter((state) => state.isRecommendationEligible);
  if (actionables.length === 0) {
    return undefined;
  }

  const timezone = result.calendarBasis.timezone;
  const currentDate = glowLocalDateKey(glowEvaluatedAt(result), timezone);
  const currentDateStates = currentDate
    ? actionables.filter((state) => state.date === currentDate)
    : [];
  if (currentDateStates.length > 0) {
    return [...currentDateStates].sort(compareGlowActionableWindowStates)[0];
  }

  const futureDates = [
    ...new Set(
      actionables
        .map((state) => state.date)
        .filter((date): date is string => Boolean(date))
        .filter((date) => !currentDate || date > currentDate),
    ),
  ].sort();
  const nextDate = futureDates[0];
  const nextDateStates = nextDate ? actionables.filter((state) => state.date === nextDate) : [];
  const pool = nextDateStates.length > 0 ? nextDateStates : actionables;

  return [...pool].sort(compareGlowActionableWindowStates)[0];
}

function selectDailyPreferredGlowWindowState(
  states: readonly GlowLifecycleWindowView[],
): GlowLifecycleWindowView | undefined {
  const actionables = states.filter((state) => state.isRecommendationEligible);
  return [...actionables].sort(compareGlowActionableWindowStates)[0];
}

function buildGlowLifecycleWindowView(
  result: ForecastCalculationResult,
  phase: GlowOpportunityPhase,
  window: GlowWindow,
  score: number,
): GlowLifecycleWindowView {
  const lifecycle = classifyGlowWindowLifecycle({
    startAt: window.start,
    endAt: window.end,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
    rangeStartAt: result.calendarBasis.forecastStart,
    rangeEndAt: result.calendarBasis.forecastEnd,
  });
  const date =
    window.date ?? glowLocalDateKey(window.start, result.calendarBasis.timezone) ?? undefined;
  return buildGlowLifecycleWindowViewFromParts({
    result,
    phase,
    window,
    date,
    startAt: window.start,
    endAt: window.end,
    score,
    state: lifecycle.state,
    source: "scored",
  });
}

function buildDerivedGlowWindowState(
  result: ForecastCalculationResult,
  phase: GlowOpportunityPhase,
  date: string,
  score: number,
): GlowLifecycleWindowView | undefined {
  const window = derivedGlowSunWindowForDate(result, phase, date);
  if (!window) {
    return undefined;
  }
  const lifecycle = classifyGlowWindowLifecycle({
    startAt: window.startAt,
    endAt: window.endAt,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
    rangeStartAt: result.calendarBasis.forecastStart,
    rangeEndAt: result.calendarBasis.forecastEnd,
  });
  return buildGlowLifecycleWindowViewFromParts({
    result,
    phase,
    date,
    startAt: window.startAt,
    endAt: window.endAt,
    score,
    state: lifecycle.state,
    source: "sun_event",
  });
}

function buildUnavailableGlowWindowState(
  result: ForecastCalculationResult,
  phase: GlowOpportunityPhase,
  score: number,
): GlowLifecycleWindowView {
  return buildGlowLifecycleWindowViewFromParts({
    result,
    phase,
    score,
    state: "unavailable",
    source: "none",
  });
}

function buildGlowLifecycleWindowViewFromParts(input: {
  readonly result: ForecastCalculationResult;
  readonly phase: GlowOpportunityPhase;
  readonly window?: GlowWindow;
  readonly date?: string;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly score: number;
  readonly state: GlowWindowLifecycleState;
  readonly source: GlowLifecycleWindowView["source"];
}): GlowLifecycleWindowView {
  const occurrenceProbabilityPercent =
    finiteNumber(input.window?.occurrenceProbabilityPercent) ?? clampPercent(input.score);
  const practicalSuitabilityScore =
    finiteNumber(input.window?.practicalSuitabilityScore ?? input.window?.practicalScore) ??
    clampPercent(input.score);
  const vividnessIndex = finiteNumber(input.window?.vividnessIndex);
  const vividnessLevel =
    input.window?.vividnessLevel ??
    (vividnessIndex !== undefined
      ? glowVividnessLevelForIndexOrUndefined(vividnessIndex)
      : undefined);
  const confidence = finiteNumber(input.window?.confidence);
  const recommendation = glowRecommendationForLifecycle(input.state, practicalSuitabilityScore);
  const isRecommendationEligible = isGlowWindowRecommendationEligible(input.state);

  return {
    phase: input.phase,
    window: input.window,
    date: input.date,
    startAt: input.startAt,
    endAt: input.endAt,
    state: input.state,
    score: practicalSuitabilityScore,
    probabilityPercent: occurrenceProbabilityPercent,
    probabilityDisplay: glowProbabilityDisplayForLifecycle(
      input.state,
      occurrenceProbabilityPercent,
    ),
    vividnessIndex,
    vividnessLevel,
    vividnessDisplay: glowVividnessDisplay(vividnessIndex, vividnessLevel),
    practicalSuitabilityScore,
    practicalDisplay: `${Math.round(practicalSuitabilityScore)} 分`,
    confidence,
    calibrationMode: input.window?.calibrationMode,
    providerAgreement: input.window?.providerAgreement,
    recommendation,
    isRecommendationEligible,
    evaluatedAt: glowEvaluatedAt(input.result),
    timezone: input.result.calendarBasis.timezone,
    tone: glowLifecycleTone(input.state, recommendation),
    source: input.source,
  };
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function glowVividnessLevelForIndexOrUndefined(index: number): GlowVividnessLevel | undefined {
  return Number.isFinite(index) ? glowVividnessLevelForIndex(index) : undefined;
}

function glowVividnessDisplay(
  index: number | undefined,
  level: GlowVividnessLevel | undefined,
): string {
  if (index === undefined || level === undefined) {
    return "暂缺";
  }
  return `${glowVividnessLevelLabelZh(level)}（${Math.round(index)}）`;
}

function derivedGlowSunWindowForDate(
  result: ForecastCalculationResult,
  phase: GlowOpportunityPhase,
  date: string,
): { readonly startAt: string; readonly endAt: string } | undefined {
  const astro = result.astroSummaries.find((summary) => summary.date === date);
  if (!astro) {
    return undefined;
  }
  if (phase === "sunrise" && astro.sunriseGlowBestStartAt && astro.sunriseGlowBestEndAt) {
    return {
      startAt: astro.sunriseGlowBestStartAt,
      endAt: astro.sunriseGlowBestEndAt,
    };
  }
  if (phase === "sunset" && astro.sunsetGlowBestStartAt && astro.sunsetGlowBestEndAt) {
    return {
      startAt: astro.sunsetGlowBestStartAt,
      endAt: astro.sunsetGlowBestEndAt,
    };
  }
  return undefined;
}

function compareGlowActionableWindowStates(
  left: GlowLifecycleWindowView,
  right: GlowLifecycleWindowView,
): number {
  return (
    glowLifecycleActionRank(left.state) - glowLifecycleActionRank(right.state) ||
    right.score - left.score ||
    Date.parse(left.startAt ?? "") - Date.parse(right.startAt ?? "")
  );
}

function glowLifecycleActionRank(state: GlowWindowLifecycleState): number {
  if (state === "active") {
    return 0;
  }
  if (state === "upcoming") {
    return 1;
  }
  if (state === "ended") {
    return 2;
  }
  return 3;
}

function glowRecommendationForLifecycle(
  state: GlowWindowLifecycleState,
  score: number,
): GlowDisplayRecommendationLabel {
  if (state === "active") {
    return "窗口进行中";
  }
  if (state === "ended") {
    return "已结束";
  }
  if (state === "outside_horizon") {
    return "超出本次预报范围";
  }
  if (state === "unavailable") {
    return "暂无明确时间";
  }
  return glowDisplayRecommendationForScore(score);
}

function glowProbabilityDisplayForLifecycle(
  state: GlowWindowLifecycleState,
  probabilityPercent: number,
): string {
  if (state === "ended") {
    return "已结束";
  }
  if (state === "outside_horizon") {
    return "超出本次预报范围";
  }
  if (state === "unavailable") {
    return "暂无明确时间";
  }
  return `${probabilityPercent}%`;
}

function glowLifecycleTone(
  state: GlowWindowLifecycleState,
  recommendation: GlowDisplayRecommendationLabel,
): ForecastResultCardTone {
  if (state === "ended" || state === "unavailable" || state === "outside_horizon") {
    return "muted";
  }
  if (state === "active") {
    return "primary";
  }
  return glowDisplayTone(recommendation);
}

function formatGlowLifecycleWindowForPublic(
  result: ForecastCalculationResult,
  window: GlowLifecycleWindowView,
  fallback: string,
): string {
  if (!window.startAt || !window.endAt) {
    return fallback;
  }
  return formatLocalDateTimeRange(window.startAt, window.endAt, result.calendarBasis.timezone);
}

function formatGlowLifecycleWindowForParentDate(
  result: ForecastCalculationResult,
  window: GlowLifecycleWindowView,
  fallback: string,
): string {
  if (!window.startAt || !window.endAt) {
    return fallback;
  }
  return formatLocalTimeRange(window.startAt, window.endAt, result.calendarBasis.timezone);
}

function glowArrivalHint(
  result: ForecastCalculationResult,
  phase: GlowOpportunityPhase,
  window: GlowLifecycleWindowView,
): string {
  if (window.state === "active") {
    return "窗口进行中，建议尽快到位";
  }
  if (window.state === "ended") {
    return `本次${glowPhaseLabel(phase)}窗口已结束`;
  }
  if (window.state === "unavailable" || !window.startAt) {
    return "暂无可用到达建议";
  }
  const arrivalTime = addHoursInTimezone(window.startAt, -0.75, result.calendarBasis.timezone);
  return `建议 ${formatTime(arrivalTime, result.calendarBasis.timezone)} 前到达`;
}

function dailyGlowLifecycleReason(
  day: GlowAnalysisResult["dailyGlow"][number] | undefined,
  sunrise: GlowLifecycleWindowView,
  sunset: GlowLifecycleWindowView,
  preferred: GlowLifecycleWindowView | undefined,
): string {
  const endedSide =
    sunrise.state === "ended" ? "朝霞" : sunset.state === "ended" ? "晚霞" : undefined;
  if (endedSide && !preferred) {
    return compactGlowDisplayText(`${endedSide}窗口已结束，本日期暂无后续可执行霞光窗口。`);
  }
  if (!preferred) {
    if (sunrise.state === "outside_horizon" || sunset.state === "outside_horizon") {
      return "该日期有窗口落在本次预报范围之外，不使用范围外概率。";
    }
    return "该日期暂无可靠朝霞或晚霞窗口，需等待更完整的天文和天气数据。";
  }
  const preferredLabel = glowPhaseLabel(preferred.phase);
  if (endedSide) {
    return compactGlowDisplayText(`${endedSide}窗口已结束，当前仅评估${preferredLabel}。`);
  }
  if (preferred.state === "outside_horizon") {
    return "该窗口超出本次预报范围，不展示范围外概率。";
  }
  if (preferred.state === "active") {
    return compactGlowDisplayText(`${preferredLabel}窗口进行中，建议尽快到位并现场复核云层。`);
  }
  if (preferred.state === "unavailable") {
    return `暂无明确${preferredLabel}时间，不能据此安排专程。`;
  }
  return compactGlowDisplayText(
    preferred.window?.noteZh ?? day?.keyReason ?? "以日出和日落窗口对比为主，现场复核云层变化。",
  );
}

function glowPhaseLabel(phase: GlowOpportunityPhase): "朝霞" | "晚霞" {
  return phase === "sunrise" ? "朝霞" : "晚霞";
}

function glowPreferredTargetLabel(
  target: GlowBestTarget | GlowOpportunityPhase,
  recommendation: GlowDisplayRecommendationLabel,
): GlowOverallRecommendation["preferredTarget"] {
  if (
    recommendation === "不建议专程前往" ||
    recommendation === "暂无明确时间" ||
    recommendation === "暂无后续窗口" ||
    recommendation === "超出本次预报范围" ||
    target === "none"
  ) {
    return "暂不专程";
  }
  if (target === "both") {
    return "朝霞晚霞";
  }
  return target === "sunrise" ? "朝霞" : "晚霞";
}

function glowDisplayTone(recommendation: GlowDisplayRecommendationLabel): ForecastResultCardTone {
  if (recommendation === "推荐前往") {
    return "primary";
  }
  if (recommendation === "可以关注") {
    return "accent";
  }
  if (recommendation === "仅作备选") {
    return "info";
  }
  return "danger";
}

function compactGlowDisplayText(text: string): string {
  const trimmed = text.trim();
  const firstSentence = trimmed
    .split(/[。；;]/)
    .find((part) => part.trim().length > 0)
    ?.trim();
  const value = firstSentence ? `${firstSentence}。` : trimmed;
  return value.length > 82 ? `${value.slice(0, 80)}...` : value;
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
  const publicStartDate = publicAstroForecastStartDateKey(result);
  const publicDailyAstro = analysis.dailyAstro.filter((day) => day.date >= publicStartDate);
  const publicRecommendedMilkyWayWindows = filterPublicAstroWindows(
    result,
    analysis.recommendedMilkyWayWindows,
  );
  const publicMilkyWayCandidateWindows = filterPublicAstroWindows(
    result,
    analysis.milkyWayCandidateWindows,
  );
  const publicMoonlessNightWindows = filterPublicAstroWindows(
    result,
    analysis.moonlessNightWindows,
  );
  const publicAstronomicalNightWindows = filterPublicAstroWindows(
    result,
    analysis.astronomicalNightWindows,
  );
  const nightlyCards = buildAstroNightDisplayModels(result);
  const bestNight = selectBestAstroNight(nightlyCards);
  const backupNight = selectBackupAstroNight(nightlyCards, bestNight);
  const professionalHourlyData = buildProfessionalHourlyDisplayDataForResult({
    result,
    focusWindows: astroProfessionalFocusWindows(nightlyCards),
    riskWindows: astroProfessionalRiskWindows(nightlyCards),
    rowAnnotations: astroProfessionalRowAnnotations(nightlyCards),
  });
  const firstDaily = publicDailyAstro[0];
  const firstMoon = analysis.moonInfo ?? result.astroSummaries[0]?.moonInfo;
  const bestRecommendedWindow = publicRecommendedMilkyWayWindows[0];
  const bestCandidateWindow = publicMilkyWayCandidateWindows[0];
  const bestMoonlessWindow = publicMoonlessNightWindows[0];
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
  const windowValue = windowForDisplay
    ? formatAstroWindowValue(windowForDisplay, result.calendarBasis.timezone)
    : "暂无明确窗口";
  const windowDetail = analysis.astroShootable
    ? bestRecommendedWindow
      ? `推荐银河窗口，方向 ${bestRecommendedWindow.directionZh ?? "需现场复核"}；建议提前到达完成构图和对焦。`
      : "星空条件可用，但暂无银心、月光和天气同时满足的银河窗口。"
    : analysis.astroWindowAvailable
      ? `有天文窗口，但${blockerSummary}不支持银河拍摄，不建议专程熬夜。`
      : "暂无可用天文黑夜或银河几何窗口，夜间只作备选观察。";

  const selectedTerrainAssessment = selectedMilkyWayTerrainAssessment(
    result,
    windowForDisplay,
    bestNight,
  );
  const terrainHorizon = astroTerrainHorizonDisplay(selectedTerrainAssessment);
  const lightPollution = astroLightPollutionDisplay(analysis.lightPollution, {
    overallSkyDarkness: analysis.overallSkyDarkness,
    targetDirectionLightPollution: analysis.targetDirectionLightPollution,
    finalPhotographyDecision: analysis.finalPhotographyDecision,
  });
  const actionSummary = buildAstroActionSummary(result, bestNight, backupNight);
  const decisionSummary = buildAstroDecisionSummary({
    result,
    bestNight,
    actionSummary,
    lightPollution,
    terrainHorizon,
  });
  const actionPlan = buildAstroActionPlan({
    result,
    bestNight,
    actionSummary,
    decisionSummary,
    lightPollution,
  });
  const judgmentFactors = buildAstroJudgmentFactors(result, nightlyCards, bestNight, terrainHorizon);
  const publicDisplay = buildAstroPublicDisplay({
    decisionSummary,
    actionSummary,
    actionPlan,
    judgmentFactors,
    lightPollution,
    terrainHorizon,
  });
  const hourlySummary = buildAstroHourlySummary(
    professionalHourlyData,
    result.calendarBasis.timezone,
  );
  const professionalDataGroups = buildAstroPageProfessionalDataGroups({
    result,
    nights: nightlyCards,
    bestNight,
    lightPollution,
    terrainHorizon,
    professionalHourlyData,
    decisionSummary,
  });

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
      textCard(
        "astro-terrain-horizon",
        "terrain",
        "地形遮挡",
        terrainHorizon.statusLabelZh,
        `${terrainHorizon.detail} ${terrainHorizon.recommendationZh}`,
        terrainHorizon.statusTone,
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
    dailyTrend: publicDailyAstro.map((day) =>
      mapDailyAstro(day, publicMilkyWayCandidateWindows, result.calendarBasis.timezone),
    ),
    nightlyCards,
    bestNight,
    backupNight,
    decisionSummary,
    actionSummary,
    actionPlan: publicDisplay.actionPlan,
    judgmentFactors: publicDisplay.judgmentFactors,
    publicDisplay,
    professionalDataGroups,
    professionalHourlyData,
    hourlySummary,
    astronomicalNightWindows: mapAstroWindows(result, publicAstronomicalNightWindows),
    moonlessNightWindows: mapAstroWindows(result, publicMoonlessNightWindows),
    milkyWayCandidateWindows: mapAstroWindows(result, publicMilkyWayCandidateWindows),
    recommendedMilkyWayWindows: mapAstroWindows(result, publicRecommendedMilkyWayWindows),
    cloudEvidence: mapAstroEvidence(analysis.cloudEvidence),
    visibilityEvidence: mapAstroEvidence(analysis.visibilityEvidence),
    moonEvidence: mapAstroEvidence(analysis.moonEvidence),
    terrainEvidence: mapAstroEvidence(analysis.terrainEvidence),
    lightPollutionEvidence: mapAstroEvidence(analysis.lightPollutionEvidence),
    lightPollution,
    terrainHorizon,
    travelRecommendations: analysis.travelRecommendations,
    riskReasons: analysis.riskReasons,
    backupPlans: analysis.backupPlans,
    missingDataNotes: analysis.missingDataNotes,
    dataNotice: buildAstroDataNotice(result),
  };
}

const astroObservingNightStartHour = 18;
const astroObservingNightDurationHours = 18;

type AstroWindowRange = Pick<AstroWindow, "start" | "end">;

function buildAstroNightDisplayModels(
  result: ForecastCalculationResult,
): readonly AstroNightDisplayModel[] {
  const timezone = result.calendarBasis.timezone;
  const nightDates = observingNightDatesForResult(result);

  return nightDates.map((date) => {
    const day = result.astroAnalysis.dailyAstro.find((item) => item.date === date);
    const astro = result.astroSummaries.find((item) => item.date === date);
    const nominalNight = nominalObservingNightWindow(date, timezone);
    const candidateWindow = result.astroAnalysis.milkyWayCandidateWindows.find(
      (window) => window.date === date,
    );
    const geometricMilkyWayWindow = intersectAstroWindowRanges(
      candidateWindow,
      day?.astronomicalNightWindow,
      timezone,
    );
    const bestWindow =
      day?.recommendedMilkyWayWindow ?? day?.moonlessNightWindow ?? day?.astronomicalNightWindow;
    const weatherRows = bestWindow
      ? professionalRowsBetween(
          result.professionalHourlyData ?? [],
          bestWindow.start,
          bestWindow.end,
        )
      : [];
    const expectedWeatherHours = bestWindow
      ? Math.max(1, Math.ceil(durationMinutesBetween(bestWindow.start, bestWindow.end) / 60))
      : 0;
    const weatherSummary = summarizeAstroNightWeather(
      weatherRows,
      expectedWeatherHours,
      day?.weatherBlockers ?? [],
    );
    const moonAltitude =
      bestWindow && astro ? moonAltitudeForWindow(astro, bestWindow, timezone) : null;
    const moonOverlap = bestWindow && astro ? moonOverlapMinutesForWindow(astro, bestWindow) : null;
    const moonInterference = moonlightInterferenceDisplay(day, moonOverlap, moonAltitude);
    const horizonCoverageState = astroNightCoverageState(
      result,
      day?.astronomicalNightWindow ?? nominalNight,
    );
    const isPartiallyCovered = horizonCoverageState === "partial";
    const starProbability = starPhotographyProbabilityForNight(
      day,
      weatherSummary,
      isPartiallyCovered,
    );
    const milkyWayProbability = milkyWayPhotographyProbabilityForNight(
      day,
      weatherSummary,
      isPartiallyCovered,
    );
    const recommendation = astroNightRecommendation({
      day,
      astro,
      starProbability,
      milkyWayProbability,
      weatherSummary,
      horizonCoverageState,
    });
    const unavailableReason = astroNightUnavailableReason(day, astro, weatherSummary);
    const lightPollutionDisplay = astroLightPollutionDisplay(
      day?.lightPollution ?? result.astroAnalysis.lightPollution,
      {
        overallSkyDarkness: day?.overallSkyDarkness ?? result.astroAnalysis.overallSkyDarkness,
        targetDirectionLightPollution:
          day?.targetDirectionLightPollution ?? result.astroAnalysis.targetDirectionLightPollution,
        finalPhotographyDecision:
          day?.finalPhotographyDecision ?? result.astroAnalysis.finalPhotographyDecision,
      },
    );
    const terrainHorizonDisplay = astroTerrainHorizonDisplay(
      terrainAssessmentForAstroWindow(result, candidateWindow ?? bestWindow, date),
    );
    const bestShootingWindowLabel = bestWindow
      ? formatAstroWindowTimeValue(bestWindow, timezone)
      : "暂无可靠最佳拍摄窗口";
    const directionSummaryLabel = geometricMilkyWayWindow
      ? `${candidateWindow?.directionZh ?? astro?.milkyWayDirection ?? "方向待复核"} · 高度 ${formatAngle(
          candidateWindow?.galacticCenterAltitude ??
            astro?.milkyWayGalacticCenterAltitude ??
            undefined,
        )}`
      : "银河方向待确认";
    const cloudWeatherBlockerLabel =
      day?.weatherBlockers[0] ??
      (weatherSummary.validHourCount === 0
        ? weatherSummary.coverageDisplay
        : weatherSummary.cloudSummary);
    const lightPollutionSummaryLabel = lightPollutionDisplay.available
      ? `整体${lightPollutionDisplay.overallSkyDarknessRangeLabel}；银河方向${lightPollutionDisplay.targetDirectionLightPollutionLabel}`
      : lightPollutionDisplay.compactLabel;
    const terrainSummaryLabel = `${terrainHorizonDisplay.statusLabelZh} · ${terrainHorizonDisplay.compactLabel}`;
    const factorChips = buildAstroNightFactorChips({
      day,
      recommendationLevel: recommendation.level,
      moonInterference,
      geometricMilkyWayWindow,
      bestWindow: day?.recommendedMilkyWayWindow,
      lightPollution: lightPollutionDisplay,
      terrainHorizon: terrainHorizonDisplay,
    });

    return {
      nightKey: `astro-night-${date}`,
      localEveningDate: date,
      localEveningDateLabel: formatLocalDateLabel(addHoursInTimezone(date, 18, timezone), timezone),
      weekdayLabel: formatLocalWeekday(addHoursInTimezone(date, 18, timezone), timezone),
      timezone,
      horizonCoverageState,
      horizonCoverageLabel: horizonCoverageLabel(horizonCoverageState),
      isPartiallyCovered,
      astronomicalNight: {
        startAt: day?.astronomicalNightWindow?.start,
        endAt: day?.astronomicalNightWindow?.end,
        durationMinutes: day?.astronomicalNightWindow?.durationMinutes ?? 0,
        lifecycle: day?.astronomicalNightWindow
          ? isPartiallyCovered
            ? "partial"
            : "available"
          : "unavailable",
        label: day?.astronomicalNightWindow
          ? isPartiallyCovered
            ? "部分天文黑夜"
            : "有天文黑夜"
          : "当晚无完整天文黑夜",
        windowLabel: day?.astronomicalNightWindow
          ? formatAstroWindowTimeValue(day.astronomicalNightWindow, timezone)
          : "当晚无完整天文黑夜",
      },
      moon: {
        phaseName: astro?.moonPhaseNameZh ?? "暂无月相",
        illuminationPercent:
          typeof astro?.moonIllumination === "number"
            ? Math.round(astro.moonIllumination * 100)
            : null,
        illuminationDisplay:
          typeof astro?.moonIllumination === "number"
            ? formatPercent(astro.moonIllumination)
            : "暂无数据",
        riseAt: astro?.moonrise,
        setAt: astro?.moonset,
        altitudeDuringBestWindow: moonAltitude,
        altitudeDuringBestWindowDisplay:
          typeof moonAltitude === "number" ? `${Math.round(moonAltitude)}°` : "暂无数据",
        moonlightInterferenceLevel: moonInterference,
        overlapMinutes: moonOverlap,
        overlapDisplay:
          typeof moonOverlap === "number" ? `${Math.round(moonOverlap)} 分钟` : "暂无可靠数据",
      },
      milkyWay: {
        available: Boolean(geometricMilkyWayWindow),
        coreVisibilityStartAt: geometricMilkyWayWindow?.start,
        coreVisibilityEndAt: geometricMilkyWayWindow?.end,
        bestStartAt: day?.recommendedMilkyWayWindow?.start,
        bestEndAt: day?.recommendedMilkyWayWindow?.end,
        maximumAltitudeDegrees:
          candidateWindow?.galacticCenterAltitude ?? astro?.milkyWayGalacticCenterAltitude ?? null,
        maximumAltitudeDisplay: formatAngle(
          candidateWindow?.galacticCenterAltitude ??
            astro?.milkyWayGalacticCenterAltitude ??
            undefined,
        ),
        azimuthSummary:
          candidateWindow?.directionZh ?? astro?.milkyWayDirection ?? "地平线遮挡需现场确认",
        geometricWindowLabel: geometricMilkyWayWindow
          ? formatAstroWindowTimeValue(geometricMilkyWayWindow, timezone)
          : "银河窗口暂无可靠数据",
        weatherUsableWindowLabel: day?.recommendedMilkyWayWindow
          ? formatAstroWindowTimeValue(day.recommendedMilkyWayWindow, timezone)
          : weatherSummary.validHourCount > 0 && geometricMilkyWayWindow
            ? "几何窗口存在，天气未达到推荐阈值"
            : "暂无天气可用银河窗口",
        bestWindowLabel: day?.recommendedMilkyWayWindow
          ? formatAstroWindowTimeValue(day.recommendedMilkyWayWindow, timezone)
          : "暂无推荐银河窗口",
      },
      lightPollution: lightPollutionDisplay,
      terrainHorizon: terrainHorizonDisplay,
      weather: weatherSummary,
      starPhotographyProbabilityPercent: starProbability,
      milkyWayPhotographyProbabilityPercent: milkyWayProbability,
      starPhotographyProbabilityDisplay: probabilityDisplay(starProbability),
      milkyWayPhotographyProbabilityDisplay: probabilityDisplay(milkyWayProbability),
      starPhotographyIndex: day?.practicalAstroScore ?? null,
      milkyWayPhotographyIndex: day?.milkyWayScore ?? null,
      starPhotographyIndexDisplay: indexDisplay(day?.practicalAstroScore),
      milkyWayPhotographyIndexDisplay: indexDisplay(day?.milkyWayScore),
      recommendationLevel: recommendation.level,
      recommendationLabel: recommendation.label,
      conciseReason: recommendation.reason,
      confidence: astroNightConfidence(result, weatherSummary, horizonCoverageState),
      unavailableReason,
      bestShootingWindowLabel,
      directionSummaryLabel,
      moonImpactSummaryLabel: `${moonInterference} · ${astro?.moonPhaseNameZh ?? "暂无月相"} ${typeof astro?.moonIllumination === "number" ? formatPercent(astro.moonIllumination) : "暂无照明"}`,
      cloudWeatherBlockerLabel,
      lightPollutionSummaryLabel,
      terrainSummaryLabel,
      actionNote: astroNightActionNote({
        recommendationLevel: recommendation.level,
        bestShootingWindowLabel,
        conciseReason: recommendation.reason,
        horizonCoverageState,
        unavailableReason,
      }),
      factorChips,
      calibrationMode: "heuristic",
    };
  });
}

function selectedMilkyWayTerrainAssessment(
  result: ForecastCalculationResult,
  selectedWindow?: AstroWindow,
  bestNight?: AstroNightDisplayModel,
): TerrainHorizonAssessment | undefined {
  return terrainAssessmentForAstroWindow(
    result,
    selectedWindow,
    selectedWindow?.date ?? bestNight?.localEveningDate,
  );
}

function buildAstroNightFactorChips({
  day,
  recommendationLevel,
  moonInterference,
  geometricMilkyWayWindow,
  bestWindow,
  lightPollution,
  terrainHorizon,
}: {
  readonly day: DailyAstro | undefined;
  readonly recommendationLevel: AstroNightRecommendationLevel;
  readonly moonInterference: string;
  readonly geometricMilkyWayWindow: AstroWindowRange | null | undefined;
  readonly bestWindow: AstroWindow | undefined;
  readonly lightPollution: AstroLightPollutionDisplayModel;
  readonly terrainHorizon: AstroTerrainHorizonDisplayModel;
}): readonly AstroNightFactorChip[] {
  const blockers = day?.weatherBlockers ?? [];
  const blockerText = blockers.join(" ");
  const chips: AstroNightFactorChip[] = [];

  if (recommendationLevel === "not_recommended") {
    chips.push({ key: "decision", label: "不建议前往", tone: "danger" });
  }

  chips.push(
    /总云|云量|云层|厚云|低云/.test(blockerText)
      ? { key: "cloud", label: "云量高", tone: "danger" }
      : { key: "cloud", label: "云量可控", tone: "primary" },
  );

  if (/降水|雨|雪/.test(blockerText)) {
    chips.push({ key: "precipitation", label: "降水风险", tone: "accent" });
  }

  chips.push(
    moonInterference === "高" || moonInterference === "很高"
      ? { key: "moon", label: "月光高", tone: "accent" }
      : moonInterference === "中"
        ? { key: "moon", label: "月光中", tone: "info" }
        : { key: "moon", label: "月光低", tone: "primary" },
  );

  chips.push(
    bestWindow
      ? { key: "window", label: "银河窗口可用", tone: "primary" }
      : geometricMilkyWayWindow
        ? { key: "window", label: "银河备选窗口", tone: "info" }
        : { key: "window", label: "银河窗口不足", tone: "muted" },
  );

  if (terrainHorizon.obstructionLevel === "clear") {
    chips.push({ key: "terrain", label: "地形无遮挡", tone: "primary" });
  } else if (
    terrainHorizon.obstructionLevel === "obstructed" ||
    terrainHorizon.obstructionLevel === "marginal"
  ) {
    chips.push({ key: "terrain", label: terrainHorizon.publicDecisionLabel, tone: "accent" });
  } else {
    chips.push({ key: "terrain", label: terrainHorizon.publicDecisionLabel, tone: "muted" });
  }

  chips.push(astroDirectionLightPollutionChip(lightPollution));

  const unique = new Map<string, AstroNightFactorChip>();
  for (const chip of chips) {
    if (!unique.has(chip.key)) {
      unique.set(chip.key, chip);
    }
  }

  return [...unique.values()].slice(0, 5);
}

function astroDirectionLightPollutionChip(
  lightPollution: AstroLightPollutionDisplayModel,
): AstroNightFactorChip {
  const target = lightPollution.targetDirectionLightPollution;
  if (!lightPollution.available || target.status !== "resolved") {
    return { key: "direction-light", label: "光害需复核", tone: "muted" };
  }
  if ((target.riskIndex ?? 0) >= 60) {
    return { key: "direction-light", label: "方向光害较强", tone: "accent" };
  }
  if ((target.riskIndex ?? 0) >= 40) {
    return { key: "direction-light", label: "光害中等", tone: "info" };
  }
  return { key: "direction-light", label: "光害低", tone: "primary" };
}

function terrainAssessmentForAstroWindow(
  result: ForecastCalculationResult,
  window: AstroWindow | undefined,
  date: string | undefined,
): TerrainHorizonAssessment | undefined {
  const astro = date
    ? result.astroSummaries.find((summary) => summary.date === date)
    : result.astroSummaries[0];
  const day = date ? result.astroAnalysis.dailyAstro.find((item) => item.date === date) : undefined;

  if (window?.terrainHorizonAssessment) {
    return window.terrainHorizonAssessment;
  }

  if (hasAstroTerrainTargetGeometry(window, astro)) {
    return resolveMilkyWayTerrainHorizonAssessment({
      terrainAnalysis: result.terrainAnalysis,
      astro,
      window,
    });
  }

  return day?.terrainHorizonAssessment ?? result.astroAnalysis.terrainHorizonAssessment;
}

function hasAstroTerrainTargetGeometry(
  window: AstroWindow | undefined,
  astro: AstroSummary | undefined,
): boolean {
  return (
    isMeaningfulNumber(window?.galacticCenterAzimuth ?? astro?.milkyWayGalacticCenterAzimuth) &&
    isMeaningfulNumber(window?.galacticCenterAltitude ?? astro?.milkyWayGalacticCenterAltitude)
  );
}

function observingNightDatesForResult(result: ForecastCalculationResult): readonly string[] {
  const timezone = result.calendarBasis.timezone;
  const publicStartDate = publicAstroForecastStartDateKey(result);
  const candidateDates = new Set<string>([
    ...safeForecastTargetDates(publicStartDate, result.calendarBasis.forecastEnd, timezone),
    ...result.astroAnalysis.dailyAstro
      .map((day) => day.date)
      .filter((date) => date >= publicStartDate),
  ]);

  return [...candidateDates]
    .sort()
    .filter((date) => date >= publicStartDate)
    .filter((date) =>
      windowsIntersect(nominalObservingNightWindow(date, timezone), {
        start: result.calendarBasis.forecastStart,
        end: result.calendarBasis.forecastEnd,
      }),
    );
}

function publicAstroForecastStartDateKey(result: ForecastCalculationResult): string {
  return (
    localDateKey(result.calendarBasis.forecastStart, result.calendarBasis.timezone) ??
    result.calendarBasis.forecastStart.slice(0, 10)
  );
}

function filterPublicAstroWindows<
  TWindow extends Pick<AstroWindow, "start"> & { readonly date?: string },
>(result: ForecastCalculationResult, windows: readonly TWindow[]): readonly TWindow[] {
  const publicStartDate = publicAstroForecastStartDateKey(result);
  const timezone = result.calendarBasis.timezone;
  return windows.filter((window) => {
    const windowDate =
      window.date ?? localDateKey(window.start, timezone) ?? window.start.slice(0, 10);
    return windowDate >= publicStartDate;
  });
}

type AstroLightPollutionCanonicalInput = {
  readonly overallSkyDarkness?: OverallSkyDarkness;
  readonly targetDirectionLightPollution?: TargetDirectionLightPollution;
  readonly finalPhotographyDecision?: FinalPhotographyDecision;
};

function astroLightPollutionDisplay(
  lightPollution: LightPollutionInfo,
  canonical: AstroLightPollutionCanonicalInput = {},
): AstroLightPollutionDisplayModel {
  const sourceLabelZh = lightPollution.sourceLabel ?? lightPollution.sourceCode ?? "卫星夜光参考";
  const datasetLabel = [
    sourceLabelZh,
    lightPollution.datasetYear ? `${lightPollution.datasetYear}` : undefined,
    lightPollution.datasetVersion ?? undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
  const confidenceLabelZh = lightPollutionConfidenceLabel(lightPollution.confidence);
  const publicSkyDarkness = resolvePublicSkyDarknessDisplay(lightPollution);
  const overallSkyDarkness =
    canonical.overallSkyDarkness ?? fallbackOverallSkyDarkness(lightPollution, publicSkyDarkness);
  const targetDirectionLightPollution =
    canonical.targetDirectionLightPollution ??
    fallbackTargetDirectionLightPollution(lightPollution);
  const estimatedBortle = estimatedBortleDisplayFields(publicSkyDarkness);
  const rawEstimatedBortle = rawEstimatedBortleDisplayFields(lightPollution);
  const noticeZh = publicSkyDarkness.disclaimerZh;

  if (!lightPollution.available) {
    const detail = "当前判断未把光污染当作低风险处理，拍摄前需现场确认城市光穹和地平线亮度。";
    const publicDecisionLabel = "需要保守判断";
    const professionalDataGroups = buildAstroLightPollutionProfessionalDataGroups(
      lightPollution,
      datasetLabel || "数据暂缺",
      sourceLabelZh,
      confidenceLabelZh,
      noticeZh,
      publicSkyDarkness,
      rawEstimatedBortle,
      overallSkyDarkness,
      targetDirectionLightPollution,
      canonical.finalPhotographyDecision ?? null,
    );
    return {
      available: false,
      dataAvailable: false,
      ambientRiskIndex: null,
      ambientRiskDisplayValue: "数据不足",
      ambientRiskLevelLabelZh: "数据不足",
      localRadiance: lightPollution.localRadiance ?? null,
      surroundingHaloRadiance: lightPollution.surroundingHaloRadiance ?? null,
      bestWindowTargetAzimuth: lightPollution.targetAzimuthDegrees ?? null,
      bestWindowDirectionRisk: null,
      bestWindowDirectionRiskLabelZh: null,
      confidenceLabelZh,
      sourceLabelZh,
      datasetLabel: datasetLabel || "数据暂缺",
      ...estimatedBortle,
      primaryConclusionZh: "数据不足",
      recommendationZh: detail,
      statusBadgeLabelZh: "数据暂缺",
      statusTone: "muted",
      showDailyDirection: typeof lightPollution.targetAzimuthDegrees === "number",
      compactLabel: "光污染数据暂不可用",
      detail,
      ambientLabel: "数据不足",
      targetDirectionLabel: "数据不足",
      judgmentSummaryZh: `光污染数据暂不可用；${estimatedBortle.estimatedBortleRangeLabel}：${estimatedBortle.estimatedBortleBasis}当前判断未把它当作低风险处理，现场仍需确认城市光穹和地平线亮度。`,
      professionalDataItems: flattenAstroProfessionalDataGroups(professionalDataGroups),
      professionalDataGroups,
      directionalSectorItems: buildAstroLightPollutionDirectionalItems(lightPollution),
      noticeZh,
      overallSkyDarkness,
      targetDirectionLightPollution,
      finalPhotographyDecision: canonical.finalPhotographyDecision ?? null,
      overallSkyDarknessRangeLabel: overallSkyDarkness.rangeLabelZh,
      overallSkyDarknessQualityLabel: overallSkyDarkness.skyQualityLabelZh,
      targetDirectionLightPollutionLabel: targetDirectionLightPollution.riskLevelLabelZh,
      targetDirectionLightPollutionWarning: targetDirectionLightPollution.warningZh,
      finalPhotographyImplicationZh:
        canonical.finalPhotographyDecision?.summaryZh ??
        "光污染数据暂缺，不能把现场条件视为低风险。",
      publicDecisionLabel,
      publicDirectionDecisionLabel: "方向光害需确认",
    };
  }
  const ambientLabel = lightPollution.ambientRiskLevelLabelZh;
  const targetLabel = lightPollution.targetDirectionLevelLabelZh ?? null;
  const publicAmbientLabel =
    publicLightPollutionRiskLabel(ambientLabel, publicSkyDarkness.conservative) ?? "数据可用";
  const publicTargetLabel = publicLightPollutionRiskLabel(
    targetLabel,
    publicSkyDarkness.conservative,
  );
  const publicTargetDirectionLabel =
    publicTargetLabel ?? targetDirectionLightPollution.riskLevelLabelZh;
  const ambientRiskIndex = lightPollution.ambientRiskIndex ?? null;
  const directionRisk = lightPollution.targetDirectionRisk ?? null;
  const riskForRecommendation = Math.max(
    ambientRiskIndex ?? representativeLightPollutionRiskIndex(lightPollution.ambientRiskLevel),
    directionRisk ?? representativeLightPollutionRiskIndex(lightPollution.targetDirectionLevel),
  );
  const recommendationZh = lightPollutionActionAdvice({
    ambientRiskIndex:
      ambientRiskIndex ?? representativeLightPollutionRiskIndex(lightPollution.ambientRiskLevel),
    directionRiskIndex:
      directionRisk ?? representativeLightPollutionRiskIndex(lightPollution.targetDirectionLevel),
    targetLabel: publicTargetLabel,
    publicSkyDarkness,
  });
  const statusTone: ForecastResultCardTone =
    riskForRecommendation >= 80
      ? "danger"
      : riskForRecommendation >= 60
        ? "accent"
        : riskForRecommendation >= 40
          ? "info"
          : "primary";
  const directionText = publicTargetLabel ? `银河方向光害${publicTargetLabel}` : "银河方向角不足";
  const primaryConclusionZh = publicSkyDarkness.available
    ? publicSkyDarkness.skyQualityLabelZh
    : publicAmbientLabel || "数据可用";
  const impactSummaryZh = lightPollutionImpactSummary(
    ambientRiskIndex ?? representativeLightPollutionRiskIndex(lightPollution.ambientRiskLevel),
    directionRisk ?? representativeLightPollutionRiskIndex(lightPollution.targetDirectionLevel),
    publicTargetLabel,
    publicSkyDarkness.conservative,
  );
  const publicDecisionLabel = publicLightPollutionDecisionLabel({
    available: lightPollution.available && lightPollution.dataAvailable,
    ambientRiskIndex:
      ambientRiskIndex ?? representativeLightPollutionRiskIndex(lightPollution.ambientRiskLevel),
    directionRiskIndex:
      directionRisk ?? representativeLightPollutionRiskIndex(lightPollution.targetDirectionLevel),
  });
  const publicDirectionDecisionLabel = publicLightPollutionDirectionDecisionLabel(
    targetDirectionLightPollution,
  );
  const professionalDataGroups = buildAstroLightPollutionProfessionalDataGroups(
    lightPollution,
    datasetLabel,
    sourceLabelZh,
    confidenceLabelZh,
    noticeZh,
    publicSkyDarkness,
    rawEstimatedBortle,
    overallSkyDarkness,
    targetDirectionLightPollution,
    canonical.finalPhotographyDecision ?? null,
  );

  return {
    available: true,
    dataAvailable: lightPollution.dataAvailable,
    ambientRiskIndex,
    ambientRiskDisplayValue:
      typeof ambientRiskIndex === "number" ? `${ambientRiskIndex}` : ambientLabel || "数据可用",
    ambientRiskLevelLabelZh: publicAmbientLabel,
    localRadiance: lightPollution.localRadiance ?? null,
    surroundingHaloRadiance: lightPollution.surroundingHaloRadiance ?? null,
    bestWindowTargetAzimuth: lightPollution.targetAzimuthDegrees ?? null,
    bestWindowDirectionRisk: directionRisk,
    bestWindowDirectionRiskLabelZh: publicTargetLabel,
    confidenceLabelZh,
    sourceLabelZh,
    datasetLabel,
    ...estimatedBortle,
    primaryConclusionZh,
    recommendationZh,
    statusBadgeLabelZh: lightPollution.dataAvailable
      ? publicSkyDarkness.conservative
        ? "保守"
        : confidenceLabelZh
      : "数据不足",
    statusTone,
    showDailyDirection: typeof lightPollution.targetAzimuthDegrees === "number",
    compactLabel: publicSkyDarkness.available
      ? `整体光污染：${overallSkyDarkness.rangeLabelZh}`
      : publicTargetLabel
        ? `银河方向光害：${publicTargetLabel}`
        : `环境光污染：${publicAmbientLabel}`,
    detail: impactSummaryZh,
    ambientLabel: publicAmbientLabel,
    targetDirectionLabel: publicTargetLabel ?? "数据不足",
    judgmentSummaryZh: lightPollutionJudgmentExplanation({
      ambientLabel: publicAmbientLabel,
      targetLabel: publicTargetLabel,
      directionText,
      ambientRiskIndex:
        ambientRiskIndex ?? representativeLightPollutionRiskIndex(lightPollution.ambientRiskLevel),
      directionRiskIndex:
        directionRisk ?? representativeLightPollutionRiskIndex(lightPollution.targetDirectionLevel),
      estimatedBortle,
      publicSkyDarkness,
      confidenceLabelZh,
    }),
    professionalDataItems: flattenAstroProfessionalDataGroups(professionalDataGroups),
    professionalDataGroups,
    directionalSectorItems: buildAstroLightPollutionDirectionalItems(lightPollution),
    noticeZh,
    overallSkyDarkness,
    targetDirectionLightPollution,
    finalPhotographyDecision: canonical.finalPhotographyDecision ?? null,
    overallSkyDarknessRangeLabel: overallSkyDarkness.rangeLabelZh,
    overallSkyDarknessQualityLabel: overallSkyDarkness.skyQualityLabelZh,
    targetDirectionLightPollutionLabel: publicTargetDirectionLabel,
    targetDirectionLightPollutionWarning: targetDirectionLightPollution.warningZh,
    finalPhotographyImplicationZh:
      canonical.finalPhotographyDecision?.summaryZh ?? recommendationZh,
    publicDecisionLabel,
    publicDirectionDecisionLabel,
  };
}

function fallbackOverallSkyDarkness(
  lightPollution: LightPollutionInfo,
  display: PublicSkyDarknessDisplay,
): OverallSkyDarkness {
  return {
    available: display.available,
    minClass: display.minClass,
    maxClass: display.maxClass,
    rangeLabelZh: display.rangeLabelZh,
    skyQualityLabelZh: display.skyQualityLabelZh,
    confidence: display.confidence,
    basisZh: display.basisZh,
    conservative: display.conservative,
    calibrationEvidenceLevel: display.calibrationEvidenceLevel,
    rangeWidthClasses: display.rangeWidthClasses,
    rangeWidthPolicy: display.rangeWidthPolicy,
    diagnostics: display.diagnostics,
    rawEstimatedBortleRangeLabel: display.rawRangeLabelZh,
    primaryBaseline: display.primaryBaseline,
    skyBrightnessAvailable: display.skyBrightnessAvailable,
    skyBrightnessEstimatedBortleLabel: display.skyBrightnessEstimatedBortleLabel,
    localRadiance: lightPollution.localRadiance ?? null,
    surroundingHaloRadiance: lightPollution.surroundingHaloRadiance ?? null,
    ambientRiskIndex: lightPollution.ambientRiskIndex ?? null,
    nationalRiskIndex: display.nationalRiskIndex,
    localToHaloRatio: display.localToHaloRatio,
    haloToLocalRatio: display.haloToLocalRatio,
    localRadianceQuantile: display.localRadianceQuantile,
    haloRadianceQuantile: display.haloRadianceQuantile,
    ambientRiskQuantile: display.ambientRiskQuantile,
    noteZh: "整体暗空不使用银河目标方向降低位置级光污染等级。",
  };
}

function fallbackTargetDirectionLightPollution(
  lightPollution: LightPollutionInfo,
): TargetDirectionLightPollution {
  const avoidDirectionLabelsZh = lightPollution.directionalRisk
    .filter((direction) => representativeLightPollutionRiskIndex(direction.riskLevel) >= 60)
    .map((direction) => direction.directionLabelZh);
  const cleanerDirectionLabelsZh = lightPollution.directionalRisk
    .filter((direction) => representativeLightPollutionRiskIndex(direction.riskLevel) < 40)
    .map((direction) => direction.directionLabelZh);
  const targetRisk =
    typeof lightPollution.targetDirectionRisk === "number" &&
    Number.isFinite(lightPollution.targetDirectionRisk)
      ? lightPollution.targetDirectionRisk
      : null;

  if (!lightPollution.available || !lightPollution.dataAvailable) {
    return {
      available: false,
      status: "unavailable",
      azimuthDegrees: lightPollution.targetAzimuthDegrees ?? null,
      directionLabelZh: "未知",
      radiance: null,
      riskIndex: null,
      riskLevel: "insufficient",
      riskLevelLabelZh: "未知",
      warningZh: "光污染数据暂缺，不能把银河方向视为干净。",
      basisZh: "缺少可用 VIIRS 方向风险数据。",
      avoidDirectionLabelsZh,
      cleanerDirectionLabelsZh,
    };
  }

  if (targetRisk === null) {
    return {
      available: true,
      status: "unknown",
      azimuthDegrees: lightPollution.targetAzimuthDegrees ?? null,
      directionLabelZh: "未知",
      radiance: null,
      riskIndex: null,
      riskLevel: "insufficient",
      riskLevelLabelZh: "未知",
      warningZh: "缺少目标方位角或方向样本，银河方向不能显示为干净。",
      basisZh: "目标方向风险需要银河窗口方位角和可用方向扇区样本。",
      avoidDirectionLabelsZh,
      cleanerDirectionLabelsZh,
    };
  }

  const level = lightPollution.targetDirectionLevel ?? "insufficient";
  const label = lightPollution.targetDirectionLevelLabelZh ?? "未知";
  return {
    available: true,
    status: "resolved",
    azimuthDegrees: lightPollution.targetAzimuthDegrees ?? null,
    directionLabelZh: "银河方向",
    radiance: null,
    riskIndex: targetRisk,
    riskLevel: level,
    riskLevelLabelZh: label,
    warningZh:
      targetRisk < 40
        ? `银河方向较干净${
            avoidDirectionLabelsZh.length > 0
              ? `；建议避开 ${avoidDirectionLabelsZh.join(" / ")} 等高光害方向`
              : ""
          }。`
        : targetRisk >= 60
          ? "银河方向光害偏高，会降低银河细节和背景反差。"
          : "银河方向光害中等，银河反差依赖透明度和构图避光。",
    basisZh: "由目标方位角和方向扇区风险解析。",
    avoidDirectionLabelsZh,
    cleanerDirectionLabelsZh,
  };
}

function publicLightPollutionDecisionLabel({
  available,
  ambientRiskIndex,
  directionRiskIndex,
}: {
  readonly available: boolean;
  readonly ambientRiskIndex: number;
  readonly directionRiskIndex: number;
}): string {
  if (!available) {
    return "需要保守判断";
  }
  if (directionRiskIndex >= 60 && ambientRiskIndex < 60) {
    return "方向光害较强";
  }
  const riskIndex = Math.max(ambientRiskIndex, directionRiskIndex);
  if (riskIndex >= 60) {
    return "光害偏高";
  }
  if (riskIndex >= 40) {
    return "光害中等";
  }
  return "光害低";
}

function publicLightPollutionDirectionDecisionLabel(target: TargetDirectionLightPollution): string {
  if (target.status !== "resolved" || target.riskIndex === null) {
    return "方向光害需确认";
  }
  if (target.riskIndex >= 60) {
    return "方向光害较强";
  }
  if (target.riskIndex >= 40) {
    return "方向光害中等";
  }
  return "方向光害较低";
}

function representativeLightPollutionRiskIndex(
  level: LightPollutionInfo["ambientRiskLevel"] | LightPollutionInfo["targetDirectionLevel"],
): number {
  switch (level) {
    case "very_low":
      return 8;
    case "low":
      return 24;
    case "medium":
      return 50;
    case "high":
      return 68;
    case "very_high":
      return 88;
    case "insufficient":
    case null:
    case undefined:
      return 0;
  }
}

function publicLightPollutionRiskLabel(
  label: string | null | undefined,
  conservative: boolean,
): string | null {
  if (!label) {
    return null;
  }
  if (!conservative) {
    return label;
  }
  if (label === "极低") {
    return "较低";
  }
  return label;
}

function lightPollutionActionAdvice(input: {
  readonly ambientRiskIndex: number;
  readonly directionRiskIndex: number;
  readonly targetLabel: string | null;
  readonly publicSkyDarkness: PublicSkyDarknessDisplay;
}): string {
  if (input.directionRiskIndex >= 60 && input.ambientRiskIndex < 60) {
    return "银河方向光害偏高；建议避开城市方向构图或转向更暗一侧取景。";
  }
  if (input.ambientRiskIndex >= 60 && input.directionRiskIndex < 40) {
    return "整体环境受周边光害影响，但银河方向较干净；如天气、月光和地形允许，仍可拍摄，建议避开高光害方向。";
  }
  if (Math.max(input.ambientRiskIndex, input.directionRiskIndex) >= 80) {
    return input.targetLabel
      ? "可以观星但银河细节较弱；建议更换暗场机位，或避开城市方向构图。"
      : "可以观星但银河细节较弱；建议更换暗场机位并现场确认城市光穹方向。";
  }
  if (Math.max(input.ambientRiskIndex, input.directionRiskIndex) >= 60) {
    return "天空较清时仍可观星，但银河细节会被光害压弱；优先换到更暗方向或机位。";
  }
  if (input.ambientRiskIndex >= 40 && input.directionRiskIndex < 40) {
    return "整体光污染中等，但目标银河方向较干净；构图时继续避开高光害方向。";
  }
  if (Math.max(input.ambientRiskIndex, input.directionRiskIndex) >= 40) {
    return "银河可拍性仍要看云量和月光；构图上优先背离城市光源。";
  }
  if (input.publicSkyDarkness.conservative) {
    return "卫星夜光显示环境较暗，但当前按保守范围展示；建议结合现场光害、云量、月光和透明度确认。";
  }
  return "光污染较低，具备银河拍摄基础，但仍需看云量、月光和透明度。";
}

function lightPollutionImpactSummary(
  ambientRiskIndex: number,
  directionRiskIndex: number,
  targetLabel: string | null,
  conservativeDisplay = false,
): string {
  if (directionRiskIndex >= 60 && ambientRiskIndex < 60) {
    return "银河方向光害偏高：即使整体环境较暗，朝该方向拍摄仍会受影响。";
  }
  if (ambientRiskIndex >= 60 && directionRiskIndex < 40) {
    return "整体环境受周边光害影响，但银河方向较干净，仍需配合天气、月光和地形判断。";
  }
  const riskIndex = Math.max(ambientRiskIndex, directionRiskIndex);
  if (riskIndex >= 80) {
    return "光污染很高：天空背景明显发亮，银河细节容易被压掉。";
  }
  if (riskIndex >= 60) {
    return targetLabel
      ? "银河方向光害偏高：即使头顶较暗，朝城市方向拍摄仍会受影响。"
      : "光污染高：天空背景发亮，银河细节容易被压弱。";
  }
  if (riskIndex >= 40) {
    return "光污染中等：银河反差会受影响，建议避开城市光源方向。";
  }
  if (conservativeDisplay) {
    return "卫星夜光显示环境较暗，但公开结果按保守范围展示，仍需现场确认光害。";
  }
  return "光污染低：银河背景更暗，星空对比度更好。";
}

function lightPollutionJudgmentExplanation(input: {
  readonly ambientLabel: string;
  readonly targetLabel: string | null;
  readonly directionText: string;
  readonly ambientRiskIndex: number;
  readonly directionRiskIndex: number;
  readonly estimatedBortle: Pick<
    AstroLightPollutionDisplayModel,
    "estimatedBortleAvailable" | "estimatedBortleRangeLabel" | "estimatedBortleSkyQualityLabel"
  >;
  readonly publicSkyDarkness: PublicSkyDarknessDisplay;
  readonly confidenceLabelZh: string;
}): string {
  const bortleText = input.estimatedBortle.estimatedBortleAvailable
    ? `公开保守估算：${input.estimatedBortle.estimatedBortleRangeLabel} · ${input.estimatedBortle.estimatedBortleSkyQualityLabel}。`
    : "";
  const conservativeText =
    input.publicSkyDarkness.available && input.publicSkyDarkness.conservative
      ? "已按保守公开范围展示。"
      : "";
  const directionExplanation =
    input.targetLabel && input.directionRiskIndex >= 60
      ? "银河方向光害高：即使头顶较暗，朝城市方向拍摄仍会受影响。"
      : input.targetLabel && input.ambientRiskIndex >= 60 && input.directionRiskIndex < 40
        ? "整体环境受周边光害影响，但银河方向较干净，构图时应避开高光害方向。"
        : input.targetLabel
          ? `银河方向：${input.targetLabel}，构图朝向仍建议现场复核。`
          : "银河方向角不足，目标方向光害需现场确认。";

  return `${lightPollutionImpactSummary(
    input.ambientRiskIndex,
    input.directionRiskIndex,
    input.targetLabel,
    input.publicSkyDarkness.conservative,
  )}${directionExplanation}${bortleText}${conservativeText}${input.directionText}；环境光污染${input.ambientLabel}，置信度${input.confidenceLabelZh}。`;
}

function estimatedBortleDisplayFields(
  display: PublicSkyDarknessDisplay,
): Pick<
  AstroLightPollutionDisplayModel,
  | "estimatedBortleAvailable"
  | "estimatedBortleRangeLabel"
  | "estimatedBortleSkyQualityLabel"
  | "estimatedBortleConfidenceLabel"
  | "estimatedBortleBasis"
  | "estimatedBortleDisclaimer"
  | "estimatedBortleMethodVersion"
> {
  return {
    estimatedBortleAvailable: display.available,
    estimatedBortleRangeLabel: display.rangeLabelZh,
    estimatedBortleSkyQualityLabel: display.skyQualityLabelZh,
    estimatedBortleConfidenceLabel: display.confidence === "medium" ? "中" : "低",
    estimatedBortleBasis: display.basisZh,
    estimatedBortleDisclaimer: display.disclaimerZh,
    estimatedBortleMethodVersion: display.publicMethodVersion,
  };
}

function rawEstimatedBortleDisplayFields(
  lightPollution: LightPollutionInfo,
): Pick<
  AstroLightPollutionDisplayModel,
  | "estimatedBortleAvailable"
  | "estimatedBortleRangeLabel"
  | "estimatedBortleSkyQualityLabel"
  | "estimatedBortleConfidenceLabel"
  | "estimatedBortleBasis"
  | "estimatedBortleDisclaimer"
  | "estimatedBortleMethodVersion"
> {
  const estimate = lightPollution.estimatedBortleRange;
  if (!estimate) {
    return {
      estimatedBortleAvailable: false,
      estimatedBortleRangeLabel: "VIIRS原始估算暂不可用",
      estimatedBortleSkyQualityLabel: "数据不足",
      estimatedBortleConfidenceLabel: "低",
      estimatedBortleBasis: "当前缺少可靠的环境光污染标定，不能推断原始波特尔范围。",
      estimatedBortleDisclaimer: "原始诊断为卫星夜光估算，不代表现场实测或正式波特尔观测认证。",
      estimatedBortleMethodVersion: "viirs-ambient-risk-range-v1",
    };
  }

  return {
    estimatedBortleAvailable: estimate.available,
    estimatedBortleRangeLabel: estimate.rangeLabelZh,
    estimatedBortleSkyQualityLabel: estimate.skyQualityLabelZh,
    estimatedBortleConfidenceLabel: estimate.confidence === "medium" ? "中" : "低",
    estimatedBortleBasis: estimate.basisZh,
    estimatedBortleDisclaimer: "原始诊断为卫星夜光估算，不代表现场实测或正式波特尔观测认证。",
    estimatedBortleMethodVersion: estimate.methodVersion,
  };
}

function buildAstroLightPollutionProfessionalDataGroups(
  lightPollution: LightPollutionInfo,
  datasetLabel: string,
  sourceLabelZh: string,
  confidenceLabelZh: string,
  noticeZh: string,
  publicSkyDarkness: PublicSkyDarknessDisplay,
  rawEstimatedBortle: Pick<
    AstroLightPollutionDisplayModel,
    | "estimatedBortleAvailable"
    | "estimatedBortleRangeLabel"
    | "estimatedBortleSkyQualityLabel"
    | "estimatedBortleConfidenceLabel"
    | "estimatedBortleBasis"
    | "estimatedBortleDisclaimer"
    | "estimatedBortleMethodVersion"
  >,
  overallSkyDarkness: OverallSkyDarkness,
  targetDirectionLightPollution: TargetDirectionLightPollution,
  finalPhotographyDecision: FinalPhotographyDecision | null,
): readonly AstroProfessionalDataGroup[] {
  const publicEstimatedBortle = estimatedBortleDisplayFields(publicSkyDarkness);
  const uncertaintyReasons =
    publicSkyDarkness.confidenceReasonsZh.length > 0
      ? publicSkyDarkness.confidenceReasonsZh.join("；")
      : "当前未触发额外不确定性说明。";
  const publicSummaryItems: ForecastResultSectionItem[] = [
    {
      label: "是否推荐",
      value: finalPhotographyDecision?.recommendationLabel ?? "需结合天气/月光",
      detail:
        finalPhotographyDecision?.summaryZh ??
        "这里只给出光污染公开结论；最终是否前往仍需结合银河窗口、月光、天气和地形。",
    },
    {
      label: "整体光污染",
      value: overallSkyDarkness.rangeLabelZh,
      detail: `${overallSkyDarkness.skyQualityLabelZh}；${overallSkyDarkness.noteZh}`,
    },
    {
      label: "银河方向光害",
      value: targetDirectionLightPollution.riskLevelLabelZh,
      detail: targetDirectionLightPollution.warningZh,
    },
    {
      label: "公开保守估算",
      value: publicEstimatedBortle.estimatedBortleRangeLabel,
      detail: publicEstimatedBortle.estimatedBortleBasis,
    },
    {
      label: "置信度",
      value: publicEstimatedBortle.estimatedBortleConfidenceLabel,
      detail: `原始估算置信度 ${rawEstimatedBortle.estimatedBortleConfidenceLabel}。`,
    },
    {
      label: "不确定性原因",
      value: publicSkyDarkness.tooWideRange ? "需现场确认" : uncertaintyReasons,
      detail:
        publicSkyDarkness.rangeWidthClasses && publicSkyDarkness.rangeWidthClasses > 3
          ? "公开范围超过 3 个等级，必须结合现场光穹、云量和月光确认。"
          : "用于解释公开范围为何保守、上调或放宽。",
    },
    {
      label: "范围策略",
      value: rangeWidthPolicyLabelZh(publicSkyDarkness.rangeWidthPolicy),
      detail: `范围宽度 ${formatNullableNumberForView(publicSkyDarkness.rangeWidthClasses, " 个等级")}；WA范围 ${
        publicSkyDarkness.skyBrightnessEstimatedBortleLabel ?? "暂无"
      }；VIIRS原始 ${publicSkyDarkness.rawRangeLabelZh}。`,
    },
  ];

  if (publicSkyDarkness.modelDerivedDarkSkyReference) {
    publicSummaryItems.push({
      label: "暗夜参考",
      value: publicSkyDarkness.modelDerivedDarkSkyReference.labelZh,
      detail: publicSkyDarkness.modelDerivedDarkSkyReference.publicDisplayable
        ? publicSkyDarkness.modelDerivedDarkSkyReference.noteZh
        : `${publicSkyDarkness.modelDerivedDarkSkyReference.noteZh} 当前置信度较低，仅在专业数据中展示。`,
    });
  }

  return [
    {
      key: "public-conclusion",
      title: "公开结论",
      badgeLabel: publicSkyDarkness.confidence === "medium" ? "中置信" : "低置信",
      description: "面向拍摄决策的最终公开结论，分开显示整体暗空和银河方向光害。",
      items: publicSummaryItems,
    },
    {
      key: "wa-baseline",
      title: "WA天空亮度基准",
      badgeLabel: publicSkyDarkness.skyBrightnessAvailable ? "WA可用" : "WA暂缺",
      description: "WA/模型天空亮度作为暗空基线；模型SQM只作为模型估算显示。",
      items: buildSkyBrightnessPrimaryProfessionalDataItems(lightPollution, publicSkyDarkness),
    },
    {
      key: "viirs-current-light",
      title: "VIIRS当前灯光证据",
      badgeLabel: lightPollution.available ? "VIIRS可用" : "VIIRS暂缺",
      description: "VIIRS用于当前本地灯光、周边光穹、环境风险和全国分位修正。",
      items: [
        {
          label: "VIIRS原始估算",
          value: rawEstimatedBortle.estimatedBortleRangeLabel,
          detail: `${rawEstimatedBortle.estimatedBortleSkyQualityLabel}；原始诊断保留，不直接作为公开精确等级。`,
        },
        {
          label: "本地辐亮度",
          value: formatNullableNumberForView(lightPollution.localRadiance, " nW/cm²/sr"),
          detail: "当前位置附近夜光辐亮度参考值。",
        },
        {
          label: "周边光穹",
          value: formatNullableNumberForView(lightPollution.surroundingHaloRadiance, " nW/cm²/sr"),
          detail: "周边方向加权后的人工光影响参考。",
        },
        {
          label: "环境风险指数",
          value:
            typeof lightPollution.ambientRiskIndex === "number"
              ? `${lightPollution.ambientRiskIndex} / ${lightPollution.ambientRiskLevelLabelZh}`
              : "数据不足",
          detail: "位置级环境光污染风险，也是原始 VIIRS 波特尔估算输入。",
        },
        {
          label: "全国分位",
          value: `本地 ${formatNullableNumberForView(publicSkyDarkness.localRadianceQuantile, "%")} / 光穹 ${formatNullableNumberForView(publicSkyDarkness.haloRadianceQuantile, "%")}`,
          detail: `环境 ${formatNullableNumberForView(publicSkyDarkness.ambientRiskQuantile, "%")}；综合风险 ${formatNullableNumberForView(publicSkyDarkness.nationalRiskIndex, "%")}。`,
        },
        {
          label: "融合调整",
          value: fusionActionLabel(publicSkyDarkness),
          detail: uncertaintyReasons,
        },
        {
          label: "有效采样",
          value: `${lightPollution.validSampleCount}/${lightPollution.sampleCount}`,
          detail: "有效栅格样本数 / 总采样数。",
        },
        {
          label: "来源",
          value: sourceLabelZh,
          detail: "专业数据保留数据集来源；普通公开卡片不展示 provider 细节。",
        },
        {
          label: "数据年份",
          value:
            typeof lightPollution.datasetYear === "number"
              ? `${lightPollution.datasetYear}`
              : "暂无",
          detail: "由光污染数据元信息动态提供。",
        },
        {
          label: "数据版本",
          value: lightPollution.datasetVersion ?? "暂无",
          detail: "由光污染数据元信息动态提供。",
        },
      ],
    },
    {
      key: "direction-light",
      title: "方向光害",
      badgeLabel: targetDirectionLightPollution.status === "resolved" ? "方向已解析" : "方向未知",
      description: "八方向光害、银河目标方向和建议避开的高光害方向均来自方向扇区数据。",
      items: [
        {
          label: "八方向风险",
          value: formatDirectionalRiskSummary(lightPollution),
          detail: "按八方向 VIIRS 扇区风险展示，不使用地点、坐标或类别硬编码。",
        },
        {
          label: "目标方位角",
          value: formatNullableNumberForView(lightPollution.targetAzimuthDegrees, "°"),
          detail: "本次代表银河窗口的银心方位角。",
        },
        {
          label: "目标方向风险",
          value:
            typeof lightPollution.targetDirectionRisk === "number"
              ? `${lightPollution.targetDirectionRisk} / ${
                  lightPollution.targetDirectionLevelLabelZh ?? "数据不足"
                }`
              : "未推断",
          detail: targetDirectionLightPollution.basisZh,
        },
        {
          label: "需避开方向",
          value:
            targetDirectionLightPollution.avoidDirectionLabelsZh.length > 0
              ? targetDirectionLightPollution.avoidDirectionLabelsZh.join(" / ")
              : "暂无明显高光害方向",
          detail: "由 VIIRS 方向扇区风险生成，不使用地点或分类硬编码。",
        },
        {
          label: "较干净方向",
          value:
            targetDirectionLightPollution.cleanerDirectionLabelsZh.length > 0
              ? targetDirectionLightPollution.cleanerDirectionLabelsZh.join(" / ")
              : "暂无明确低风险方向",
          detail: targetDirectionLightPollution.warningZh,
        },
        {
          label: "local/halo",
          value: `local/halo ${formatNullableRatioForView(publicSkyDarkness.localToHaloRatio)} / halo/local ${formatNullableRatioForView(publicSkyDarkness.haloToLocalRatio)}`,
          detail: `local/halo 分位 ${formatNullableNumberForView(publicSkyDarkness.localToHaloRatioQuantile, "%")}；halo/local 分位 ${formatNullableNumberForView(publicSkyDarkness.haloToLocalRatioQuantile, "%")}。`,
        },
      ],
    },
    {
      key: "developer-diagnostics",
      title: "开发诊断",
      badgeLabel: "默认折叠",
      description: "原始诊断代码、计算口径和校验信息，用于排查模型版本。",
      collapsedByDefault: true,
      developerDiagnostics: true,
      items: [
        {
          label: "内部诊断代码",
          value:
            publicSkyDarkness.diagnostics.length > 0
              ? publicSkyDarkness.diagnostics.join(", ")
              : "none",
          detail: `低辐亮度饱和 ${formatBooleanForView(publicSkyDarkness.lowRadianceSaturationRisk)}；城市光穹外溢 ${formatBooleanForView(publicSkyDarkness.urbanSkyglowSpilloverRisk)}；暗区饱和带 ${formatBooleanForView(publicSkyDarkness.darkZoneSaturationRisk)}。`,
        },
        {
          label: "波特尔方法",
          value: publicEstimatedBortle.estimatedBortleMethodVersion,
          detail: `原始方法 ${rawEstimatedBortle.estimatedBortleMethodVersion}；公开展示方法 ${publicEstimatedBortle.estimatedBortleMethodVersion}。`,
        },
        {
          label: "计算口径",
          value: lightPollution.calculationBasis?.scoringMode ?? lightPollution.scoringMode,
          detail: lightPollution.calculationBasis
            ? `${lightPollution.calculationBasis.samplingConfigVersion}；${lightPollution.calculationBasis.directionSectorsDegrees}° 扇区`
            : "暂无计算口径",
        },
        {
          label: "校验码",
          value: lightPollution.checksumShort ?? "暂无",
          detail: "数据集校验短值，用于排查版本。",
        },
        {
          label: "说明",
          value: "卫星夜光参考",
          detail: noticeZh,
        },
        {
          label: "波特尔说明",
          value: publicEstimatedBortle.estimatedBortleDisclaimer,
          detail: "估算限制。",
        },
        ...buildSkyBrightnessDeveloperDiagnosticItems(lightPollution),
      ],
    },
  ];
}

function flattenAstroProfessionalDataGroups(
  groups: readonly AstroProfessionalDataGroup[],
): readonly ForecastResultSectionItem[] {
  return groups.flatMap((group) => group.items);
}

function fusionActionLabel(publicSkyDarkness: PublicSkyDarknessDisplay): string {
  if (publicSkyDarkness.skyBrightnessViirsBrighteningRisk) {
    return "VIIRS偏亮，上调范围";
  }
  if (publicSkyDarkness.skyBrightnessConflictRisk) {
    return "WA/VIIRS差异，放宽范围";
  }
  if (publicSkyDarkness.rangeWidthPolicy === "too_wide") {
    return "范围过宽，需现场确认";
  }
  if (publicSkyDarkness.rangeWidthPolicy === "wide_uncertain") {
    return "不确定性放宽";
  }
  if (publicSkyDarkness.primaryBaseline === "wa_model") {
    return "WA基线为主";
  }
  return "VIIRS保守回退";
}

function rangeWidthPolicyLabelZh(policy: PublicSkyDarknessDisplay["rangeWidthPolicy"]): string {
  switch (policy) {
    case "narrow":
      return "窄范围";
    case "normal":
      return "常规范围";
    case "wide_uncertain":
      return "不确定性放宽";
    case "too_wide":
      return "过宽，需现场确认";
    case "unavailable":
      return "不可用";
  }
}

function buildSkyBrightnessPrimaryProfessionalDataItems(
  lightPollution: LightPollutionInfo,
  publicSkyDarkness: PublicSkyDarknessDisplay,
): readonly ForecastResultSectionItem[] {
  const skyBrightness = lightPollution.skyBrightness;
  if (!skyBrightness) {
    return [
      {
        label: "WA/模型基线",
        value: "不可用",
        detail: "未返回 WA/模型天空亮度栅格；公开范围使用全国 VIIRS 保守回退。",
      },
    ];
  }

  return [
    {
      label: "WA/模型基线",
      value: publicSkyDarkness.primaryBaseline === "wa_model" ? "作为公开暗空基线" : "仅作诊断",
      detail:
        publicSkyDarkness.primaryBaseline === "wa_model"
          ? "WA/模型天空亮度作为公开暗空基线；VIIRS修正当前本地、光穹和方向风险。"
          : "WA/模型天空亮度不可用或不可换算；公开范围使用全国 VIIRS 保守回退。",
    },
    {
      label: "WA原始亮度",
      value: formatNullableNumberForView(
        skyBrightness.artificialBrightness ?? skyBrightness.rawValue,
        skyBrightness.valueUnit ? ` ${skyBrightness.valueUnit}` : "",
      ),
      detail: `数值类型 ${skyBrightness.valueType}；数据集 ${skyBrightness.datasetName ?? "暂无"}。`,
    },
    {
      label: "模型总天空亮度",
      value: [
        `人工 ${formatNullableNumberForView(skyBrightness.artificialBrightness, " mcd/m^2")}`,
        `自然 ${formatNullableNumberForView(skyBrightness.naturalSkyBrightnessMcdM2, " mcd/m^2")}`,
        `总量 ${formatNullableNumberForView(skyBrightness.modeledTotalSkyBrightnessMcdM2, " mcd/m^2")}`,
      ].join("；"),
      detail: "人工亮度、自然背景和模型总天空亮度分开保存后再换算。",
    },
    {
      label: "模型SQM（非实测）",
      value:
        typeof skyBrightness.modeledSqm === "number"
          ? `${skyBrightness.modeledSqm.toFixed(2)} mag/arcsec^2`
          : "未换算",
      detail: "基于 WA/模型天空亮度栅格估算，不是现场SQM实测。",
    },
    {
      label: "WA估算波特尔范围",
      value: skyBrightness.estimatedBortleRange?.rangeLabelZh ?? "未换算",
      detail:
        skyBrightness.estimatedBortleRange?.basisZh ??
        "当前数值类型不支持可靠波特尔换算，仅保留原始诊断。",
    },
    {
      label: "换算说明",
      value: skyBrightness.confidence === "high" ? "模型信心较高" : "模型信心需复核",
      detail: "换算说明已整理为公开可读口径；原始换算备注保留在开发诊断中。",
    },
    {
      label: "WA数据集",
      value:
        [
          skyBrightness.datasetName ?? undefined,
          skyBrightness.datasetYear ? `${skyBrightness.datasetYear}` : undefined,
          skyBrightness.datasetVersion ?? undefined,
        ]
          .filter(Boolean)
          .join(" / ") || "暂无",
      detail: `校验 ${skyBrightness.checksumShort ?? "暂无"}；健康状态 ${skyBrightness.diagnostics?.healthStatus ?? "unknown"}。`,
    },
  ];
}

function buildSkyBrightnessDeveloperDiagnosticItems(
  lightPollution: LightPollutionInfo,
): readonly ForecastResultSectionItem[] {
  const skyBrightness = lightPollution.skyBrightness;
  if (!skyBrightness) {
    return [];
  }

  const notes = [
    ...(skyBrightness.diagnostics?.conversionNotes ?? []),
    ...(skyBrightness.diagnostics?.uncertaintyNotes ?? []),
  ].join(" ");
  return [
    {
      label: "WA原始值",
      value: formatNullableNumberForView(
        skyBrightness.rawValue,
        skyBrightness.valueUnit ? ` ${skyBrightness.valueUnit}` : "",
      ),
      detail: `valueType=${skyBrightness.valueType}; dataset=${skyBrightness.datasetName ?? "n/a"}.`,
    },
    {
      label: "WA换算组件",
      value: [
        `artificial=${formatNullableNumberForView(skyBrightness.artificialBrightness, " mcd/m^2")}`,
        `natural=${formatNullableNumberForView(skyBrightness.naturalSkyBrightnessMcdM2, " mcd/m^2")}`,
        `total=${formatNullableNumberForView(skyBrightness.modeledTotalSkyBrightnessMcdM2, " mcd/m^2")}`,
      ].join("; "),
      detail:
        "Artificial brightness, natural baseline, and modeled total sky brightness are kept separate before deriving modeled SQM.",
    },
    {
      label: "WA原始备注",
      value: skyBrightness.confidence,
      detail: notes || "No extra conversion notes.",
    },
  ];
}

function buildAstroLightPollutionDirectionalItems(
  lightPollution: LightPollutionInfo,
): readonly ForecastResultSectionItem[] {
  return lightPollution.directionalRisk.map((direction) => ({
    label: direction.directionLabelZh,
    value:
      typeof direction.riskIndex === "number"
        ? `${direction.riskIndex} / ${direction.riskLevelLabelZh}`
        : "数据不足",
    detail: `方位 ${formatNullableNumberForView(direction.azimuthDegrees, "°")}；有效采样 ${direction.validSampleCount}/${direction.sampleCount}。`,
  }));
}

function formatDirectionalRiskSummary(lightPollution: LightPollutionInfo): string {
  if (lightPollution.directionalRisk.length === 0) {
    return "暂无方向扇区";
  }
  return lightPollution.directionalRisk
    .map((direction) =>
      typeof direction.riskIndex === "number"
        ? `${direction.directionLabelZh}${direction.riskIndex}/${direction.riskLevelLabelZh}`
        : `${direction.directionLabelZh}数据不足`,
    )
    .join("；");
}

function astroTerrainHorizonDisplay(
  assessment: TerrainHorizonAssessment | undefined,
): AstroTerrainHorizonDisplayModel {
  if (!assessment) {
    return {
      available: false,
      obstructionLevel: "unknown",
      statusLabelZh: "地形数据不足",
      statusBadgeLabelZh: "地形数据不足",
      statusTone: "muted",
      primaryConclusionZh: "地形遮挡暂无法精确判断",
      detail: missingTerrainHorizonDetail(),
      recommendationZh: "建议现场确认银河方向地平线遮挡。",
      compactLabel: "地形遮挡：地形数据不足",
      targetAzimuthDisplay: "暂无",
      targetAltitudeDisplay: "暂无",
      horizonAltitudeDisplay: "暂无精确角度",
      clearanceDisplay: "暂无精确角度",
      confidenceLabelZh: "低",
      dataSourceLabelZh: "暂无方向剖面",
      unavailableReasonLabelZh: "缺少目标方向地形剖面",
      professionalDataItems: terrainHorizonProfessionalItems(undefined),
      diagnosticsNoteZh: missingTerrainHorizonDetail(),
      publicDecisionLabel: "地形可能影响，需要现场确认",
    };
  }

  const statusLabelZh = terrainHorizonStatusLabel(assessment.obstructionLevel);
  const statusTone = terrainHorizonTone(assessment);
  const available = astroTerrainHorizonAssessmentIsPubliclyResolved(assessment);
  const detail = terrainHorizonDisplayDetail(assessment);
  const recommendationZh = terrainHorizonRecommendation(assessment);
  const publicDecisionLabel = terrainHorizonPublicDecisionLabel(assessment.obstructionLevel);
  if (!available) {
    return {
      available: false,
      obstructionLevel: "unknown",
      statusLabelZh: "地形数据不足",
      statusBadgeLabelZh: "地形数据不足",
      statusTone: "muted",
      primaryConclusionZh: "地形遮挡暂无法精确判断",
      detail: terrainHorizonInsufficientPublicDetail(assessment),
      recommendationZh: "建议现场确认银河方向地平线遮挡；当前不按无遮挡处理。",
      compactLabel: "地形遮挡：地形数据不足",
      targetAzimuthDisplay: "暂无",
      targetAltitudeDisplay: "暂无",
      horizonAltitudeDisplay: "暂无精确角度",
      clearanceDisplay: "暂无精确角度",
      confidenceLabelZh: terrainHorizonConfidenceLabel(assessment.confidence),
      dataSourceLabelZh: assessment.dataSourceLabelZh ?? terrainHorizonDataSourceLabel(assessment),
      unavailableReasonLabelZh: terrainHorizonUnavailableReasonLabel(assessment.unavailableReason),
      professionalDataItems: terrainHorizonProfessionalItems(assessment),
      diagnosticsNoteZh: assessment.professionalDiagnostics.notesZh.join(" "),
      publicDecisionLabel: "地形可能影响，需要现场确认",
    };
  }

  return {
    available,
    obstructionLevel: assessment.obstructionLevel,
    statusLabelZh,
    statusBadgeLabelZh: statusLabelZh,
    statusTone,
    primaryConclusionZh:
      assessment.obstructionLevel === "unknown"
        ? "地形遮挡暂无法精确判断"
        : `地形遮挡${statusLabelZh}`,
    detail,
    recommendationZh,
    compactLabel: `地形遮挡：${statusLabelZh}`,
    targetAzimuthDisplay: formatNullableNumberForView(assessment.targetAzimuthDegrees, "°"),
    targetAltitudeDisplay: formatNullableNumberForView(assessment.targetAltitudeDegrees, "°"),
    horizonAltitudeDisplay:
      typeof assessment.horizonAltitudeDegrees === "number"
        ? formatNullableNumberForView(assessment.horizonAltitudeDegrees, "°")
        : "暂无精确角度",
    clearanceDisplay:
      typeof assessment.obstructionClearanceDegrees === "number"
        ? formatNullableNumberForView(assessment.obstructionClearanceDegrees, "°")
        : "暂无精确角度",
    confidenceLabelZh: terrainHorizonConfidenceLabel(assessment.confidence),
    dataSourceLabelZh: assessment.dataSourceLabelZh ?? terrainHorizonDataSourceLabel(assessment),
    unavailableReasonLabelZh: terrainHorizonUnavailableReasonLabel(assessment.unavailableReason),
    professionalDataItems: terrainHorizonProfessionalItems(assessment),
    diagnosticsNoteZh: assessment.professionalDiagnostics.notesZh.join(" "),
    publicDecisionLabel,
  };
}

function astroTerrainHorizonAssessmentIsPubliclyResolved(
  assessment: TerrainHorizonAssessment,
): boolean {
  return (
    assessment.professionalDiagnostics.usedDirectionalProfile &&
    (assessment.confidence === "medium" || assessment.confidence === "high") &&
    typeof assessment.horizonAltitudeDegrees === "number" &&
    typeof assessment.obstructionClearanceDegrees === "number" &&
    assessment.obstructionLevel !== "unknown"
  );
}

function terrainHorizonProfessionalItems(
  assessment: TerrainHorizonAssessment | undefined,
): readonly ForecastResultSectionItem[] {
  if (!assessment) {
    return [
      {
        label: "地形遮挡状态",
        value: "数据不足",
        detail: missingTerrainHorizonDetail(),
      },
    ];
  }

  const diagnostics = assessment.professionalDiagnostics;
  const directionSample = assessment.directionSample;
  const demCoverage = diagnostics.terrainDemCoverage ?? directionSample?.terrainDemCoverage ?? null;
  const items: ForecastResultSectionItem[] = [
    {
      label: "地形遮挡状态",
      value: terrainHorizonStatusLabel(assessment.obstructionLevel),
      detail: terrainHorizonDisplayDetail(assessment),
    },
    {
      label: "目标方位角",
      value: formatNullableNumberForView(assessment.targetAzimuthDegrees, "°"),
      detail: "银河窗口代表方向；缺失时不推断目标方向遮挡。",
    },
    {
      label: "目标高度角",
      value: formatNullableNumberForView(assessment.targetAltitudeDegrees, "°"),
      detail: "银河中心或代表目标高度角。",
    },
    {
      label: "地形地平线",
      value:
        typeof assessment.horizonAltitudeDegrees === "number"
          ? formatNullableNumberForView(assessment.horizonAltitudeDegrees, "°")
          : "暂无精确角度",
      detail: "仅在有目标方向剖面样本时显示。",
    },
    {
      label: "clearance",
      value:
        typeof assessment.obstructionClearanceDegrees === "number"
          ? formatNullableNumberForView(assessment.obstructionClearanceDegrees, "°")
          : "暂无精确角度",
      detail: "目标高度角减地形地平线高度角。",
    },
    {
      label: "数据来源",
      value: assessment.dataSourceLabelZh ?? terrainHorizonDataSourceLabel(assessment),
      detail: assessment.dataSource,
    },
    {
      label: "观测点海拔",
      value: formatNullableNumberForView(
        directionSample?.observerElevationMeters ?? assessment.observerElevationMeters,
        " m",
      ),
      detail:
        directionSample?.observerElevationMeters !== undefined
          ? "来自 DEM 剖面或输入的机位海拔。"
          : "机位海拔暂未确认。",
    },
    {
      label: "置信度",
      value: terrainHorizonConfidenceLabel(assessment.confidence),
      detail: diagnostics.usedDirectionalProfile ? "来自方向剖面样本。" : "仅为定性 fallback。",
    },
    {
      label: "样本距离",
      value: diagnostics.sampleDistanceRangeMeters
        ? `${Math.round(diagnostics.sampleDistanceRangeMeters[0])}-${Math.round(
            diagnostics.sampleDistanceRangeMeters[1],
          )} m`
        : "暂无",
      detail: `有效样本 ${diagnostics.validSampleCount}/${diagnostics.sampleCount}`,
    },
    {
      label: "DEM 数据集",
      value: terrainHorizonDatasetLabel(assessment),
      detail: terrainHorizonDatasetDetail(assessment),
    },
    ...(demCoverage
      ? [
          {
            label: "DEM 覆盖状态",
            value: terrainDemCoverageStatusLabel(demCoverage.status),
            detail: terrainDemCoverageDetail(demCoverage),
          },
        ]
      : []),
    {
      label: "最大采样距离",
      value: formatNullableNumberForView(
        diagnostics.maxSampleDistanceMeters ?? directionSample?.maxSampleDistanceMeters,
        " m",
      ),
      detail: "沿目标方位从机位向外采样的最远距离；不代表近景树线或建筑遮挡已确认。",
    },
    {
      label: "不可用原因",
      value: terrainHorizonUnavailableReasonLabel(assessment.unavailableReason),
      detail:
        assessment.obstructionLevel === "unknown"
          ? missingTerrainHorizonDetail()
          : "已有方向剖面可用。",
    },
    {
      label: "计算规则",
      value: "clearance rule v1",
      detail: diagnostics.calculationRuleZh,
    },
  ];
  return items;
}

function terrainHorizonStatusLabel(level: TerrainHorizonAssessment["obstructionLevel"]): string {
  switch (level) {
    case "clear":
      return "无遮挡";
    case "marginal":
      return "临界";
    case "obstructed":
      return "可能遮挡";
    case "unknown":
      return "数据不足";
  }
}

function terrainHorizonPublicDecisionLabel(
  level: TerrainHorizonAssessment["obstructionLevel"],
): string {
  switch (level) {
    case "clear":
      return "地形无遮挡";
    case "marginal":
      return "地形轻微遮挡";
    case "obstructed":
    case "unknown":
      return "地形可能影响，需要现场确认";
  }
}

function terrainHorizonTone(assessment: TerrainHorizonAssessment): ForecastResultCardTone {
  if (assessment.obstructionLevel === "clear") {
    return "primary";
  }
  if (assessment.obstructionLevel === "marginal") {
    return "accent";
  }
  if (assessment.obstructionLevel === "obstructed") {
    return "danger";
  }
  return "muted";
}

function terrainHorizonDisplayDetail(assessment: TerrainHorizonAssessment): string {
  if (assessment.obstructionLevel === "unknown") {
    return assessment.qualitativeFallback?.summaryZh
      ? `${missingTerrainHorizonDetail()}${assessment.qualitativeFallback.summaryZh}`
      : missingTerrainHorizonDetail();
  }
  if (assessment.obstructionLevel === "clear") {
    return "地形遮挡较低，银河方向视野较开阔。";
  }
  if (assessment.obstructionLevel === "marginal") {
    return "银河方向接近山脊或地平线遮挡临界，构图前需要现场确认。";
  }
  return "银河方向可能被山体或地平线遮挡，低仰角银心不宜直接作为确定可拍条件。";
}

function terrainHorizonInsufficientPublicDetail(assessment: TerrainHorizonAssessment): string {
  if (
    assessment.professionalDiagnostics.usedDirectionalProfile &&
    assessment.confidence !== "medium" &&
    assessment.confidence !== "high"
  ) {
    return "地形剖面有返回，但置信度不足，公开判断不标记为无遮挡；建议现场确认银河方向山脊线和近景遮挡。";
  }
  return terrainHorizonDisplayDetail(assessment);
}

function terrainHorizonRecommendation(assessment: TerrainHorizonAssessment): string {
  if (assessment.obstructionLevel === "clear") {
    return "可继续按天气、月光和光污染判断；仍建议到场复核前景和安全通行。";
  }
  if (assessment.obstructionLevel === "marginal") {
    return "提前到场确认山脊线，准备更高机位或更开阔方向的替代构图。";
  }
  if (assessment.obstructionLevel === "obstructed") {
    return "建议更换机位、避开低仰角银河，或把星轨、月光地景作为备选。";
  }
  return "当前不能确认是否被山体挡住，建议现场确认银河方向地平线遮挡。";
}

function terrainHorizonConfidenceLabel(confidence: TerrainHorizonAssessment["confidence"]): string {
  if (confidence === "high") {
    return "高";
  }
  if (confidence === "medium") {
    return "中";
  }
  if (confidence === "low") {
    return "低";
  }
  return "未知";
}

function terrainHorizonUnavailableReasonLabel(
  reason: TerrainHorizonAssessment["unavailableReason"],
): string {
  switch (reason) {
    case "missing_target_geometry":
      return "缺少目标方位角或高度角";
    case "missing_observer_elevation":
      return "缺少机位海拔";
    case "insufficient_directional_sample":
      return "目标方向样本不足";
    case "invalid_directional_sample":
      return "地形剖面样本无效";
    case "invalid_coordinate":
      return "坐标无效";
    case "terrain_dem_missing":
      return "本地 DEM 数据缺失";
    case "terrain_dem_metadata_missing":
      return "本地 DEM 元数据缺失";
    case "terrain_dem_unreadable":
      return "本地 DEM 无法读取";
    case "terrain_dem_out_of_bounds":
      return "坐标超出 DEM 范围";
    case "terrain_dem_no_data":
      return "DEM 像元无有效海拔";
    case "missing_directional_profile":
      return "缺少目标方向地形剖面";
    case "unknown":
    case undefined:
      return "无";
  }
}

function terrainDemCoverageStatusLabel(
  status: NonNullable<
    TerrainHorizonAssessment["professionalDiagnostics"]["terrainDemCoverage"]
  >["status"],
): string {
  switch (status) {
    case "available":
      return "瓦片已在本地";
    case "missing":
      return "DEM coverage missing";
    case "invalid":
      return "瓦片无效";
    case "pending":
      return "待处理";
  }
}

function terrainDemCoverageDetail(
  coverage: NonNullable<TerrainHorizonAssessment["professionalDiagnostics"]["terrainDemCoverage"]>,
): string {
  const tileId = coverage.requiredTileId
    ? `所需瓦片 ${coverage.requiredTileId}`
    : "所需瓦片暂无法解析";
  const active = coverage.coveredByActiveDataset ? "已被当前激活 DEM 覆盖" : "当前激活 DEM 未覆盖";
  const local = coverage.tileFileExists ? "本地瓦片文件存在" : "本地瓦片文件缺失";
  return `${tileId}；${active}；${local}。${coverage.noteZh}`;
}

function terrainHorizonDataSourceLabel(assessment: TerrainHorizonAssessment): string {
  if (assessment.dataSource === "dem" || assessment.dataSource === "dem_raster") {
    return "本地 DEM 地形剖面";
  }
  if (assessment.dataSource === "qualitative_fallback") {
    return "定性地形参考";
  }
  if (assessment.dataSource === "mock_terrain_profile") {
    return "演示地形剖面";
  }
  if (assessment.dataSource === "manual_profile") {
    return "人工地形剖面";
  }
  return assessment.dataSource;
}

function terrainHorizonDatasetLabel(assessment: TerrainHorizonAssessment): string {
  const diagnostics = assessment.professionalDiagnostics;
  const sample = assessment.directionSample;
  const name = diagnostics.datasetName ?? sample?.datasetName;
  const source = diagnostics.sourceName ?? sample?.sourceName;
  const year = diagnostics.datasetYear ?? sample?.datasetYear;
  const version = diagnostics.datasetVersion ?? sample?.datasetVersion;
  const parts = [name ?? source, year, version].filter(
    (value): value is string | number => value !== null && value !== undefined && value !== "",
  );
  return parts.length > 0 ? parts.join(" / ") : "暂未提供";
}

function terrainHorizonDatasetDetail(assessment: TerrainHorizonAssessment): string {
  const diagnostics = assessment.professionalDiagnostics;
  const sample = assessment.directionSample;
  const source = diagnostics.sourceName ?? sample?.sourceName;
  const checksum = diagnostics.checksumShort ?? sample?.checksumShort;
  return [
    source ? `来源 ${source}` : "来源暂未提供",
    checksum ? `checksum ${checksum}` : "checksum 暂未提供",
  ].join("；");
}

function missingTerrainHorizonDetail(): string {
  return "地形数据不足：当前缺少目标方向的地形剖面数据，系统未把地形当作无遮挡处理，建议现场确认地平线遮挡。";
}

function lightPollutionConfidenceLabel(confidence: LightPollutionInfo["confidence"]): string {
  if (confidence === "high") {
    return "高";
  }
  if (confidence === "medium") {
    return "中";
  }
  return "低";
}

function formatNullableNumberForView(value: number | null | undefined, suffix = ""): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Number(value.toFixed(2))}${suffix}`
    : "暂无";
}

function formatNullableRatioForView(value: number | null | undefined): string {
  if (value === Number.POSITIVE_INFINITY) {
    return "∞";
  }
  return formatNullableNumberForView(value);
}

function formatBooleanForView(value: boolean): string {
  return value ? "是" : "否";
}

function safeForecastTargetDates(start: string, end: string, timezone: string): readonly string[] {
  try {
    return getForecastTargetDates(start, end, timezone);
  } catch {
    return [start.slice(0, 10), end.slice(0, 10)].filter(Boolean);
  }
}

function nominalObservingNightWindow(date: string, timezone: string): AstroWindowRange {
  const start = addHoursInTimezone(date, astroObservingNightStartHour, timezone);
  return {
    start,
    end: addHoursInTimezone(start, astroObservingNightDurationHours, timezone),
  };
}

function astroNightCoverageState(
  result: ForecastCalculationResult,
  window: AstroWindowRange,
): AstroNightHorizonCoverageState {
  const forecast = {
    start: result.calendarBasis.forecastStart,
    end: result.calendarBasis.forecastEnd,
  };
  if (!windowsIntersect(window, forecast)) {
    return "outside_horizon";
  }

  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  const rangeStartMs = Date.parse(forecast.start);
  const rangeEndMs = Date.parse(forecast.end);

  if (
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    Number.isFinite(rangeStartMs) &&
    Number.isFinite(rangeEndMs) &&
    (startMs < rangeStartMs || endMs > rangeEndMs)
  ) {
    return "partial";
  }

  return "covered";
}

function horizonCoverageLabel(state: AstroNightHorizonCoverageState): string {
  if (state === "covered") {
    return "本次预报完整覆盖";
  }
  if (state === "partial") {
    return "本次预报部分覆盖";
  }
  return "超出本次预报范围";
}

function windowsIntersect(left: AstroWindowRange, right: AstroWindowRange): boolean {
  const leftStart = Date.parse(left.start);
  const leftEnd = Date.parse(left.end);
  const rightStart = Date.parse(right.start);
  const rightEnd = Date.parse(right.end);

  return (
    Number.isFinite(leftStart) &&
    Number.isFinite(leftEnd) &&
    Number.isFinite(rightStart) &&
    Number.isFinite(rightEnd) &&
    leftStart < rightEnd &&
    leftEnd > rightStart
  );
}

function intersectAstroWindowRanges(
  left: AstroWindowRange | undefined,
  right: AstroWindowRange | undefined,
  timezone: string,
): AstroWindowRange | undefined {
  if (!left || !right || !windowsIntersect(left, right)) {
    return undefined;
  }

  const startMs = Math.max(Date.parse(left.start), Date.parse(right.start));
  const endMs = Math.min(Date.parse(left.end), Date.parse(right.end));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return undefined;
  }

  return {
    start: addHoursInTimezone(new Date(startMs), 0, timezone),
    end: addHoursInTimezone(new Date(endMs), 0, timezone),
  };
}

function professionalRowsBetween(
  rows: NonNullable<ForecastCalculationResult["professionalHourlyData"]>,
  start: string,
  end: string,
): NonNullable<ForecastCalculationResult["professionalHourlyData"]> {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  return rows.filter((row) => {
    const rowMs = Date.parse(row.time);
    return Number.isFinite(rowMs) && rowMs >= startMs && rowMs < endMs;
  });
}

function durationMinutesBetween(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return Math.round((endMs - startMs) / 60_000);
}

function summarizeAstroNightWeather(
  rows: NonNullable<ForecastCalculationResult["professionalHourlyData"]>,
  expectedHours: number,
  weatherBlockers: readonly string[] = [],
): AstroNightDisplayModel["weather"] {
  const totalCloud = averageNullable(rows.map((row) => row.cloudTotalPercent));
  const lowCloud = averageNullable(rows.map((row) => row.cloudLowPercent));
  const visibility = averageNullable(rows.map((row) => row.visibilityMeters));
  const humidity = averageNullable(rows.map((row) => row.relativeHumidityPercent));
  const precipitationProbability = maxNullable(
    rows.map((row) => row.precipitationProbabilityPercent),
  );
  const precipitationAmount = sumNullable(rows.map((row) => row.precipitationAmountMm));
  const windSpeed = averageNullable(rows.map((row) => row.windSpeedMs));

  const cloudBlocker = weatherBlockers.find((reason) => /云|低云|cloud/i.test(reason));
  const precipitationBlocker = weatherBlockers.find((reason) => /降水|雨|雪|precip/i.test(reason));

  return {
    validHourCount: rows.length,
    totalHourCount: expectedHours,
    coverageDisplay:
      expectedHours > 0 ? `${rows.length} / ${expectedHours} 小时` : "暂无窗口内小时数据",
    cloudSummary: cloudBlocker
      ? "云量阻挡"
      : totalCloud === null
        ? "云量暂无数据"
        : `总云量约 ${Math.round(totalCloud)}%，低云 ${formatNullablePercent(lowCloud)}`,
    lowCloudRisk: cloudBlocker ?? riskTextFromPercent(lowCloud, 30, 50, "低云"),
    visibilitySummary:
      visibility === null ? "能见度暂无数据" : `能见度约 ${Math.round(visibility / 1000)} 公里`,
    humidityRisk: riskTextFromPercent(humidity, 80, 90, "湿度"),
    precipitationRisk:
      precipitationBlocker ??
      (precipitationProbability === null && precipitationAmount === null
        ? "降水暂无数据"
        : `降水概率 ${formatNullablePercent(precipitationProbability)}，降水量 ${
            precipitationAmount === null ? "暂无数据" : `${round1ForDisplay(precipitationAmount)}mm`
          }`),
    windRisk: windSpeed === null ? "风速暂无数据" : `平均风速约 ${round1ForDisplay(windSpeed)} m/s`,
  };
}

function averageNullable(values: readonly (number | null | undefined)[]): number | null {
  const usable = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return usable.length > 0 ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function maxNullable(values: readonly (number | null | undefined)[]): number | null {
  const usable = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return usable.length > 0 ? Math.max(...usable) : null;
}

function sumNullable(values: readonly (number | null | undefined)[]): number | null {
  const usable = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return usable.length > 0 ? usable.reduce((sum, value) => sum + value, 0) : null;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "暂无数据" : `${Math.round(value)}%`;
}

function riskTextFromPercent(
  value: number | null,
  mediumThreshold: number,
  highThreshold: number,
  label: string,
): string {
  if (value === null) {
    return `${label}暂无数据`;
  }
  if (value >= highThreshold) {
    return `${label}高`;
  }
  if (value >= mediumThreshold) {
    return `${label}中`;
  }
  return `${label}低`;
}

function round1ForDisplay(value: number): number {
  return Math.round(value * 10) / 10;
}

function starPhotographyProbabilityForNight(
  day: DailyAstro | undefined,
  weather: AstroNightDisplayModel["weather"],
  partial: boolean,
): number | null {
  if (!day || !day.astronomicalNightWindow || weather.validHourCount === 0) {
    return null;
  }

  const weatherCoverageRatio =
    weather.totalHourCount > 0 ? Math.min(1, weather.validHourCount / weather.totalHourCount) : 0;
  const score = clampDisplayPercent(
    day.practicalAstroScore * 0.62 +
      day.skyConditionScore * 0.2 +
      (100 - day.moonlightImpactScore) * 0.12 +
      weatherCoverageRatio * 6 -
      (partial ? 8 : 0),
  );
  return score;
}

function milkyWayPhotographyProbabilityForNight(
  day: DailyAstro | undefined,
  weather: AstroNightDisplayModel["weather"],
  partial: boolean,
): number | null {
  if (!day || !day.astronomicalNightWindow || weather.validHourCount === 0) {
    return null;
  }

  if (!day.recommendedMilkyWayWindow && !day.moonlessNightWindow) {
    return Math.min(38, clampDisplayPercent(day.milkyWayGeometryScore * 0.45));
  }

  const weatherCoverageRatio =
    weather.totalHourCount > 0 ? Math.min(1, weather.validHourCount / weather.totalHourCount) : 0;
  return clampDisplayPercent(
    day.milkyWayGeometryScore * 0.5 +
      day.skyConditionScore * 0.22 +
      (100 - day.moonlightImpactScore) * 0.2 +
      weatherCoverageRatio * 8 -
      (partial ? 10 : 0),
  );
}

function clampDisplayPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function probabilityDisplay(value: number | null): string {
  return value === null ? "暂无可靠概率" : `${value}%`;
}

function indexDisplay(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}` : "暂无指数";
}

function moonlightInterferenceDisplay(
  day: DailyAstro | undefined,
  overlapMinutes: number | null,
  altitudeDuringBestWindow: number | null,
): string {
  if (!day) {
    return "数据不足";
  }
  if (
    overlapMinutes === 0 ||
    (typeof altitudeDuringBestWindow === "number" && altitudeDuringBestWindow <= 0)
  ) {
    return "无";
  }
  if (day.moonlightImpactScore >= 82) {
    return "很高";
  }
  if (day.moonlightImpactScore >= 65) {
    return "高";
  }
  if (day.moonlightImpactScore >= 40) {
    return "中";
  }
  return "低";
}

function moonAltitudeForWindow(
  astro: AstroSummary,
  window: AstroWindowRange,
  timezone: string,
): number | null {
  const startMs = Date.parse(window.start);
  const endMs = Date.parse(window.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const sampleValues =
    astro.moonAltitudeSamples
      ?.filter((sample) => {
        const sampleMs = Date.parse(sample.time);
        return Number.isFinite(sampleMs) && sampleMs >= startMs && sampleMs <= endMs;
      })
      .map((sample) => sample.altitude)
      .filter((value) => Number.isFinite(value)) ?? [];

  if (sampleValues.length > 0) {
    return round1ForDisplay(Math.max(...sampleValues));
  }

  const recordValues = [window.start, midpointIso(window.start, window.end, timezone), window.end]
    .map((time) => moonAltitudeByHourValue(astro, time, timezone))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return recordValues.length > 0 ? round1ForDisplay(Math.max(...recordValues)) : null;
}

function moonAltitudeByHourValue(
  astro: AstroSummary,
  time: string,
  timezone: string,
): number | undefined {
  const hourText = formatLocalTime(time, timezone, { invalidText: "" }).slice(0, 2);
  return astro.moonAltitudeByHour?.[hourText];
}

function midpointIso(start: string, end: string, timezone: string): string {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return start;
  }
  return addHoursInTimezone(new Date((startMs + endMs) / 2), 0, timezone);
}

function moonOverlapMinutesForWindow(astro: AstroSummary, window: AstroWindowRange): number | null {
  const windowStart = Date.parse(window.start);
  const windowEnd = Date.parse(window.end);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    return null;
  }

  const moonrise = parseOptionalMs(astro.moonrise);
  const moonset = parseOptionalMs(astro.moonset);
  if (moonrise === null && moonset === null) {
    return null;
  }

  const moonStart = moonrise ?? windowStart;
  const moonEnd = moonset ?? windowEnd;
  const overlapStart = Math.max(windowStart, moonStart);
  const overlapEnd = Math.min(windowEnd, moonEnd);
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 60_000));
}

function parseOptionalMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function astroNightRecommendation(input: {
  readonly day: DailyAstro | undefined;
  readonly astro: AstroSummary | undefined;
  readonly starProbability: number | null;
  readonly milkyWayProbability: number | null;
  readonly weatherSummary: AstroNightDisplayModel["weather"];
  readonly horizonCoverageState: AstroNightHorizonCoverageState;
}): {
  readonly level: AstroNightRecommendationLevel;
  readonly label: string;
  readonly reason: string;
} {
  const { day, astro, starProbability, milkyWayProbability, weatherSummary, horizonCoverageState } =
    input;
  if (!day || !astro) {
    return {
      level: "insufficient",
      label: "暂无可靠判断",
      reason: "本次天文或天气数据未覆盖这个观测夜，无法给出可靠推荐。",
    };
  }
  if (!day.astronomicalNightWindow) {
    return {
      level: "not_recommended",
      label: "不建议前往",
      reason: "当晚无完整天文黑夜，星空和银河拍摄基础不足。",
    };
  }
  const blocked = day.weatherBlockers.length > 0;
  if (blocked) {
    return {
      level: "not_recommended",
      label: "不建议前往",
      reason:
        day.keyReason ??
        day.weatherBlockers[0] ??
        "有夜间窗口，但云量、月光或天气覆盖不足以支持专程前往。",
    };
  }
  if (weatherSummary.validHourCount === 0 || starProbability === null) {
    return {
      level: "insufficient",
      label: "暂无可靠判断",
      reason: "有天文几何数据，但窗口内天气小时数据不足，不能生成可拍概率。",
    };
  }

  const partial = horizonCoverageState === "partial";
  const milky = milkyWayProbability ?? 0;
  const lightPollutionContext = astroNightLightPollutionContext(day.lightPollution);

  if (
    lightPollutionContext?.severity === "high" &&
    day.moonImpactLevel !== "high" &&
    starProbability >= 55
  ) {
    return {
      level: partial ? "backup" : "watch",
      label: partial ? "仅作备选" : "可以观星",
      reason: lightPollutionContext.reason,
    };
  }

  if (
    !partial &&
    !blocked &&
    day.recommendedMilkyWayWindow &&
    starProbability >= 70 &&
    milky >= 58 &&
    day.moonImpactLevel !== "high"
  ) {
    const baseReason = day.keyReason || "云量、月光和银河窗口组合较好，适合作为夜间主计划。";
    return {
      level: "recommended",
      label: "推荐拍摄",
      reason: appendAstroNightLightPollutionReason(baseReason, lightPollutionContext?.appendix),
    };
  }
  if (!blocked && starProbability >= 55 && (milky >= 45 || day.moonlessNightWindow)) {
    const baseReason = partial
      ? "本次预报只覆盖部分夜间窗口，适合临近复核后再决定。"
      : day.keyReason || "星空可拍性尚可，银河窗口仍需临近复核云量和月光。";
    return {
      level: partial ? "backup" : "watch",
      label: partial ? "仅作备选" : "可以关注",
      reason: appendAstroNightLightPollutionReason(baseReason, lightPollutionContext?.appendix),
    };
  }
  if (starProbability >= 40 || day.astroWindowAvailable) {
    const baseReason =
      day.weatherBlockers[0] ??
      day.keyReason ??
      "有夜间窗口，但云量、月光或天气覆盖不足以支持专程前往。";
    return {
      level: "backup",
      label: "仅作备选",
      reason: appendAstroNightLightPollutionReason(
        baseReason,
        lightPollutionContext?.severity === "low" ? undefined : lightPollutionContext?.appendix,
      ),
    };
  }

  return {
    level: "not_recommended",
    label: "不建议前往",
    reason: day.weatherBlockers[0] ?? "星空银河窗口和天气条件组合不足，不建议作为夜拍目标。",
  };
}

function astroNightLightPollutionContext(lightPollution: LightPollutionInfo | undefined):
  | {
      readonly severity: "low" | "medium" | "high";
      readonly reason: string;
      readonly appendix: string;
    }
  | undefined {
  if (!lightPollution?.available) {
    return undefined;
  }

  const riskIndex = Math.max(
    lightPollution.ambientRiskIndex ??
      representativeLightPollutionRiskIndex(lightPollution.ambientRiskLevel),
    lightPollution.targetDirectionRisk ??
      representativeLightPollutionRiskIndex(lightPollution.targetDirectionLevel),
  );

  if (riskIndex >= 60) {
    return {
      severity: "high",
      reason: "天空条件可用，但光污染偏高，可以观星但银河细节较弱；建议调整构图方向或更换机位。",
      appendix: "光污染偏高，可以观星但银河细节较弱。",
    };
  }
  if (riskIndex >= 40) {
    return {
      severity: "medium",
      reason: "光污染中等，银河细节依赖透明度和避开城市方向的构图。",
      appendix: "光污染中等，建议避开城市光源方向构图。",
    };
  }
  return {
    severity: "low",
    reason: "光污染较低，云量和月光允许时适合银河拍摄。",
    appendix: "光污染较低，有利于银河背景和星空对比。",
  };
}

function appendAstroNightLightPollutionReason(
  baseReason: string,
  lightPollutionAppendix: string | undefined,
): string {
  if (!lightPollutionAppendix) {
    return baseReason;
  }
  return `${baseReason}${/[。！？]$/.test(baseReason) ? "" : "。"}${lightPollutionAppendix}`;
}

function astroNightUnavailableReason(
  day: DailyAstro | undefined,
  astro: AstroSummary | undefined,
  weather: AstroNightDisplayModel["weather"],
): string | undefined {
  if (!astro) {
    return "缺少这个观测夜的月相、天文黑夜或银河几何数据。";
  }
  if (!day) {
    return "缺少这个观测夜的确定性评分结果。";
  }
  if (!day.astronomicalNightWindow) {
    return "当晚无完整天文黑夜。";
  }
  if (weather.validHourCount === 0) {
    return "缺少窗口内天气小时数据。";
  }
  return undefined;
}

function astroNightActionNote(input: {
  readonly recommendationLevel: AstroNightRecommendationLevel;
  readonly bestShootingWindowLabel: string;
  readonly conciseReason: string;
  readonly horizonCoverageState: AstroNightHorizonCoverageState;
  readonly unavailableReason?: string;
}): string {
  if (input.unavailableReason) {
    return `不按专程计划；${input.unavailableReason}`;
  }
  if (input.horizonCoverageState === "partial") {
    return "预报只覆盖部分夜间窗口，先列为备选，等临近预报补齐后再决定。";
  }
  switch (input.recommendationLevel) {
    case "recommended":
      return `可作为主计划；围绕 ${input.bestShootingWindowLabel} 安排到达、构图和对焦。`;
    case "watch":
      return `可以关注；保留机动性，出发前复核云图、月光和现场光害。`;
    case "backup":
      return "仅作备选；若已在附近可观察云缝，专程出发需等待临近复核。";
    case "not_recommended":
      return `不建议前往；${input.conciseReason}`;
    case "insufficient":
      return "数据不足；不要按银河专程计划，只保留现场观察。";
  }
}

function astroNightConfidence(
  result: ForecastCalculationResult,
  weather: AstroNightDisplayModel["weather"],
  coverage: AstroNightHorizonCoverageState,
): string {
  const base = astroConfidenceLabel(result.astroAnalysis.confidenceLevel);
  if (coverage === "partial") {
    return `${base}，部分覆盖`;
  }
  if (weather.totalHourCount > 0 && weather.validHourCount / weather.totalHourCount < 0.6) {
    return `${base}，天气覆盖不足`;
  }
  return base;
}

function astroConfidenceLabel(level: AstroAnalysisResult["confidenceLevel"]): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function selectBestAstroNight(
  nights: readonly AstroNightDisplayModel[],
): AstroNightDisplayModel | undefined {
  return [...nights].sort(
    (left, right) =>
      astroRecommendationRank(right.recommendationLevel) -
        astroRecommendationRank(left.recommendationLevel) ||
      astroNightDataRank(right) - astroNightDataRank(left) ||
      (right.milkyWayPhotographyProbabilityPercent ?? -1) -
        (left.milkyWayPhotographyProbabilityPercent ?? -1) ||
      (right.starPhotographyProbabilityPercent ?? -1) -
        (left.starPhotographyProbabilityPercent ?? -1),
  )[0];
}

function selectBackupAstroNight(
  nights: readonly AstroNightDisplayModel[],
  bestNight: AstroNightDisplayModel | undefined,
): AstroNightDisplayModel | undefined {
  return nights
    .filter((night) => night.nightKey !== bestNight?.nightKey)
    .sort(
      (left, right) =>
        astroRecommendationRank(right.recommendationLevel) -
          astroRecommendationRank(left.recommendationLevel) ||
        astroNightDataRank(right) - astroNightDataRank(left) ||
        (right.starPhotographyProbabilityPercent ?? -1) -
          (left.starPhotographyProbabilityPercent ?? -1),
    )[0];
}

function buildAstroActionSummary(
  result: ForecastCalculationResult,
  bestNight: AstroNightDisplayModel | undefined,
  backupNight: AstroNightDisplayModel | undefined,
): readonly AstroActionSummaryItem[] {
  const analysis = result.astroAnalysis;
  const timezone = result.calendarBasis.timezone;
  const worthTone = bestNight ? astroActionTone(bestNight.recommendationLevel) : "muted";
  const fallbackRecommendedWindow = filterPublicAstroWindows(
    result,
    analysis.recommendedMilkyWayWindow ? [analysis.recommendedMilkyWayWindow] : [],
  )[0];
  const bestWindowValue =
    bestNight?.bestShootingWindowLabel ??
    (fallbackRecommendedWindow
      ? formatAstroWindowValue(fallbackRecommendedWindow, timezone)
      : "暂无可靠最佳拍摄窗口");
  const mainBlocker = astroActionMainBlocker(analysis);
  const lightPollution = astroActionLightPollution(analysis);
  const backupValue = backupNight
    ? `${backupNight.localEveningDateLabel}：${backupNight.recommendationLabel}`
    : analysis.astroShootable
      ? "月光地景 / 星轨 / 山脊夜景"
      : "云缝观察 / 月光地景 / 城市夜景";
  const arrival = astroActionArrival(bestNight, timezone);

  return [
    {
      key: "worth",
      label: "是否值得去",
      value: bestNight?.recommendationLabel ?? analysis.recommendationLabel,
      detail:
        bestNight?.conciseReason ??
        "本次预报范围内暂未形成可比较的观测夜，以确定性评分和数据完整性为准。",
      tone: worthTone,
    },
    {
      key: "best-window",
      label: "最佳拍摄窗口",
      value: bestWindowValue,
      detail:
        bestNight?.milkyWay.azimuthSummary && bestNight.milkyWay.available
          ? `银河方向：${bestNight.milkyWay.azimuthSummary}，高度 ${bestNight.milkyWay.maximumAltitudeDisplay}。`
          : "暂无可执行银河窗口时，不按专程夜拍安排。",
      tone: bestNight?.milkyWay.available ? worthTone : "muted",
    },
    {
      key: "light-pollution",
      label: "光污染判断",
      value: lightPollution.value,
      detail: lightPollution.detail,
      tone: lightPollution.tone,
    },
    {
      key: "main-blocker",
      label: "主要阻碍",
      value: mainBlocker.value,
      detail: mainBlocker.detail,
      tone: mainBlocker.tone,
    },
    {
      key: "backup",
      label: "备选建议",
      value: backupValue,
      detail:
        backupNight?.conciseReason ??
        (analysis.astroShootable
          ? "银河窗口前后保留星轨、月光地景和近景夜景，避免目标过单一。"
          : "天气或月光不配合时，把夜拍降为备选，等待短临云图和现场通透度确认。"),
      tone: backupNight ? astroActionTone(backupNight.recommendationLevel) : "info",
    },
    {
      key: "arrival",
      label: "到达建议",
      value: arrival.value,
      detail: arrival.detail,
      tone: arrival.tone,
    },
  ];
}

function buildAstroDecisionSummary({
  result,
  bestNight,
  actionSummary,
  lightPollution,
  terrainHorizon,
}: {
  readonly result: ForecastCalculationResult;
  readonly bestNight: AstroNightDisplayModel | undefined;
  readonly actionSummary: readonly AstroActionSummaryItem[];
  readonly lightPollution: AstroLightPollutionDisplayModel;
  readonly terrainHorizon: AstroTerrainHorizonDisplayModel;
}): AstroDecisionSummary {
  const worth = astroActionItem(actionSummary, "worth");
  const bestWindow = astroActionItem(actionSummary, "best-window");
  const arrival = astroActionItem(actionSummary, "arrival");
  const blocker = astroActionItem(actionSummary, "main-blocker");
  const backup = astroActionItem(actionSummary, "backup");
  const confidence =
    bestNight?.confidence ?? astroConfidenceLabel(result.astroAnalysis.confidenceLevel);
  const oneSentenceAdvice =
    bestNight?.actionNote ??
    (result.astroAnalysis.astroShootable
      ? "可作为夜拍候选，但仍需在出发前复核短临云图和现场光害。"
      : "当前不按银河专程计划，等待天气、月光或窗口条件改善。");
  const actionSuggestionLabel =
    arrival?.value && !arrival.value.startsWith("暂无")
      ? arrival.value
      : result.astroAnalysis.astroShootable
        ? "保留夜拍机动，出发前复核云图"
        : "暂不专程，等待临近复核";

  return {
    recommendationLabel: worth?.value ?? result.astroAnalysis.recommendationLabel,
    recommendationTone: worth?.tone ?? "muted",
    bestNightLabel: bestNight?.localEveningDateLabel ?? "暂无明确最佳夜",
    bestWindowLabel: bestWindow?.value ?? "暂无可靠最佳拍摄窗口",
    backupLabel: backup?.value ?? "暂无明确备选窗口",
    backupDetail: backup?.detail ?? "若主窗口不可执行，保留月光地景、云缝观察或更换机位作为备选。",
    arrivalLabel: arrival?.value ?? "暂无专程到达建议",
    actionSuggestionLabel,
    directionLabel: bestNight?.directionSummaryLabel ?? "银河方向待确认",
    mainRiskLabel: blocker?.value ?? "主要风险待复核",
    mainRiskDetail: blocker?.detail ?? "仍需在出行前复核天气、月光、光污染和现场安全。",
    secondaryRiskLabel: `${lightPollution.publicDirectionDecisionLabel} / ${terrainHorizon.publicDecisionLabel}`,
    confidenceLabel: confidence,
    oneSentenceAdvice,
    lightPollutionLabel: `${lightPollution.publicDecisionLabel} / ${lightPollution.publicDirectionDecisionLabel}`,
    terrainLabel: terrainHorizon.publicDecisionLabel,
  };
}

function buildAstroActionPlan({
  result,
  bestNight,
  actionSummary,
  decisionSummary,
  lightPollution,
}: {
  readonly result: ForecastCalculationResult;
  readonly bestNight: AstroNightDisplayModel | undefined;
  readonly actionSummary: readonly AstroActionSummaryItem[];
  readonly decisionSummary: AstroDecisionSummary;
  readonly lightPollution: AstroLightPollutionDisplayModel;
}): readonly AstroActionPlanItem[] {
  const arrival = astroActionItem(actionSummary, "arrival");
  const blocker = astroActionItem(actionSummary, "main-blocker");
  const bestWindow = astroActionItem(actionSummary, "best-window");
  const avoidDirections = lightPollution.targetDirectionLightPollution.avoidDirectionLabelsZh;
  const hasAvoidDirection =
    lightPollution.available &&
    lightPollution.targetDirectionLightPollution.status === "resolved" &&
    avoidDirections.length > 0;
  const timingLabel =
    arrival?.value && !arrival.value.startsWith("暂无")
      ? arrival.value
      : result.astroAnalysis.astroShootable
        ? "按窗口前 60-90 分钟到位"
        : "暂不安排专程出发";

  return [
    {
      key: "timing",
      label: "出发 / 到达",
      value: timingLabel,
      detail: arrival?.detail ?? "用于安排交通、步行、构图、对焦和安全撤离。",
      tone: arrival?.tone ?? decisionSummary.recommendationTone,
    },
    {
      key: "window",
      label: "最佳窗口",
      value: bestWindow?.value ?? decisionSummary.bestWindowLabel,
      detail: bestWindow?.detail ?? "优先围绕可执行银河窗口安排拍摄顺序。",
      tone: bestWindow?.tone ?? decisionSummary.recommendationTone,
    },
    {
      key: "direction",
      label: "拍摄方向",
      value: decisionSummary.directionLabel,
      detail: bestNight?.milkyWay.maximumAltitudeDisplay
        ? `银心最高约 ${bestNight.milkyWay.maximumAltitudeDisplay}，现场仍需结合前景复核。`
        : "银河方向需结合现场前景和地平线复核。",
      tone: bestNight?.milkyWay.available ? "info" : "muted",
    },
    ...(hasAvoidDirection
      ? [
          {
            key: "avoid-direction" as const,
            label: "避开方向",
            value: avoidDirections.join("、"),
            detail: lightPollution.targetDirectionLightPollution.warningZh,
            tone: lightPollution.statusTone,
          },
        ]
      : []),
    {
      key: "blocker",
      label: "主要阻碍",
      value: blocker?.value ?? decisionSummary.mainRiskLabel,
      detail: blocker?.detail ?? decisionSummary.mainRiskDetail,
      tone: blocker?.tone ?? "muted",
    },
    {
      key: "note",
      label: "行动备注",
      value: decisionSummary.actionSuggestionLabel,
      detail: decisionSummary.oneSentenceAdvice,
      tone: decisionSummary.recommendationTone,
    },
  ];
}

type AstroPublicFactCandidate<T> = T & {
  readonly semanticKey: string;
};

function buildAstroPublicDisplay({
  decisionSummary,
  actionSummary,
  actionPlan,
  judgmentFactors,
  lightPollution,
  terrainHorizon,
}: {
  readonly decisionSummary: AstroDecisionSummary;
  readonly actionSummary: readonly AstroActionSummaryItem[];
  readonly actionPlan: readonly AstroActionPlanItem[];
  readonly judgmentFactors: readonly AstroJudgmentFactorCard[];
  readonly lightPollution: AstroLightPollutionDisplayModel;
  readonly terrainHorizon: AstroTerrainHorizonDisplayModel;
}): AstroPublicDisplayModel {
  const worth = astroActionItem(actionSummary, "worth");
  const bestWindow = astroActionItem(actionSummary, "best-window");
  const backup = astroActionItem(actionSummary, "backup");
  const claimedPublicFacts = new Set<string>();

  const decisionFacts = claimAstroPublicFacts<AstroDecisionFactItem>(
    [
      {
        key: "worth",
        semanticKey: "decision-worth",
        label: "是否值得去",
        value: decisionSummary.recommendationLabel,
        tone: decisionSummary.recommendationTone,
      },
      {
        key: "best-night",
        semanticKey: "best-observing-night",
        label: "最佳观测夜",
        value: decisionSummary.bestNightLabel,
        tone: decisionSummary.recommendationTone,
      },
      {
        key: "best-window",
        semanticKey: "best-shooting-window",
        label: "最佳拍摄窗口",
        value: decisionSummary.bestWindowLabel,
        tone: bestWindow?.tone ?? decisionSummary.recommendationTone,
      },
      {
        key: "backup",
        semanticKey: "backup-option",
        label: "备选窗口 / 目标",
        value: decisionSummary.backupLabel,
        tone: backup?.tone ?? "info",
      },
      {
        key: "action",
        semanticKey: "next-action",
        label: "行动建议",
        value: decisionSummary.actionSuggestionLabel,
        tone: worth?.tone ?? decisionSummary.recommendationTone,
      },
    ],
    claimedPublicFacts,
  );

  const factorChips = claimAstroPublicFacts<AstroPublicFactorChip>(
    [
      {
        key: "light-pollution",
        semanticKey: "light-pollution-public",
        label: "光污染",
        value: lightPollution.publicDirectionDecisionLabel,
        tone: lightPollution.statusTone,
      },
      {
        key: "terrain-horizon",
        semanticKey: "terrain-horizon-public",
        label: "地形",
        value: terrainHorizon.available
          ? terrainHorizon.publicDecisionLabel
          : terrainHorizon.statusLabelZh,
        tone: terrainHorizon.statusTone,
      },
    ],
    claimedPublicFacts,
  );

  const sidePanelItems = claimAstroPublicFacts<AstroTopSidePanelItem>(
    [
      {
        key: "next-best",
        semanticKey: "next-best-option",
        label: "下一备选",
        value: decisionSummary.backupLabel,
        detail: decisionSummary.backupDetail,
        tone: backup?.tone ?? "info",
      },
      {
        key: "confidence",
        semanticKey: "decision-confidence",
        label: "置信度",
        value: decisionSummary.confidenceLabel,
        detail: "由天文窗口、逐小时天气、光污染和地形数据完整性共同决定。",
        tone: decisionSummary.recommendationTone,
      },
      {
        key: "key-blocker",
        semanticKey: "key-blocker",
        label: "关键阻碍",
        value: decisionSummary.mainRiskLabel,
        detail: decisionSummary.mainRiskDetail,
        tone: astroActionItem(actionSummary, "main-blocker")?.tone ?? "muted",
      },
    ],
    claimedPublicFacts,
  );

  return {
    decisionFacts,
    factorChips,
    sidePanelItems,
    actionPlan: actionPlan.filter(isMeaningfulAstroActionPlanItem),
    judgmentFactors: normalizeAstroJudgmentFactors(judgmentFactors, claimedPublicFacts),
  };
}

function claimAstroPublicFacts<T extends { readonly value: string }>(
  candidates: readonly AstroPublicFactCandidate<T>[],
  claimedPublicFacts: Set<string>,
): readonly T[] {
  const owned: T[] = [];

  for (const candidate of candidates) {
    if (claimedPublicFacts.has(candidate.semanticKey)) {
      continue;
    }
    if (isPlaceholderAstroPublicValue(candidate.value)) {
      continue;
    }

    claimedPublicFacts.add(candidate.semanticKey);
    owned.push(candidate);
  }

  return owned;
}

function normalizeAstroJudgmentFactors(
  factors: readonly AstroJudgmentFactorCard[],
  claimedPublicFacts: ReadonlySet<string>,
): readonly AstroJudgmentFactorCard[] {
  const hiddenSemanticKeys = new Set([
    "light-pollution-public",
    "terrain-horizon-public",
    ...claimedPublicFacts,
  ]);
  const factorSemanticKey: Record<string, string> = {
    "light-pollution": "light-pollution-public",
    "terrain-horizon": "terrain-horizon-public",
  };
  const seenReasonKeys = new Set<string>();
  const normalized: AstroJudgmentFactorCard[] = [];

  for (const factor of factors) {
    const semanticKey = factorSemanticKey[factor.key] ?? `reason-${factor.key}`;
    if (hiddenSemanticKeys.has(semanticKey)) {
      continue;
    }
    if (isPlaceholderAstroPublicValue(factor.status) && isPlaceholderAstroPublicValue(factor.detail)) {
      continue;
    }

    const reasonKey = `${factor.label}|${factor.status}|${factor.detail}`;
    if (seenReasonKeys.has(reasonKey)) {
      continue;
    }

    seenReasonKeys.add(reasonKey);
    normalized.push(factor);
  }

  return normalized;
}

function isMeaningfulAstroActionPlanItem(item: AstroActionPlanItem): boolean {
  if (isPlaceholderAstroPublicValue(item.value)) {
    return false;
  }
  if (item.key === "window" && /暂无可靠|暂无明确|暂无推荐/.test(item.value)) {
    return false;
  }
  if (item.key === "direction" && /待确认|暂无/.test(item.value)) {
    return false;
  }
  if (item.key === "avoid-direction" && /待确认|暂无|未知/.test(item.value)) {
    return false;
  }
  return true;
}

function isPlaceholderAstroPublicValue(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").trim();
  return (
    normalized.length === 0 ||
    normalized === "none" ||
    normalized === "未知" ||
    normalized === "待确认" ||
    /^暂无/.test(normalized)
  );
}

function buildAstroHourlySummary(
  data: ProfessionalHourlyDisplayData,
  timezone: string,
): readonly AstroHourlySummaryItem[] {
  const rows = data.rows;
  if (rows.length === 0) {
    return [
      {
        key: "best-hours",
        label: "最佳小时",
        value: "暂无逐小时数据",
        detail: "展开专业数据后也不会展示空表，需等待天气源补齐小时预报。",
        tone: "muted",
      },
    ];
  }

  const focusRows = rowsForHourlyWindows(rows, data.focusWindows);
  const riskRows = rowsForHourlyWindows(rows, data.riskWindows);
  const bestRows = (focusRows.length > 0 ? focusRows : rows)
    .slice()
    .sort((left, right) => astroHourlyDisplayRankValue(right) - astroHourlyDisplayRankValue(left))
    .slice(0, 2);
  const worstRows = (riskRows.length > 0 ? riskRows : rows.filter(astroHourlyRowHasDisplayRisk))
    .slice()
    .sort(
      (left, right) =>
        astroHourlyDisplayRiskRankValue(right) - astroHourlyDisplayRiskRankValue(left),
    )
    .slice(0, 2);
  const cloudMinimum = minimumFinite(rows.map((row) => row.cloudTotalPercent));
  const visibilityMinimum = minimumFinite(rows.map((row) => row.visibilityMeters));
  const windMaximum = maximumFinite(rows.map((row) => row.windSpeedMs));
  const maxPrecipitationAmount = maximumFinite(rows.map((row) => row.precipitationAmountMm));
  const maxPrecipitationProbability = maximumFinite(
    rows.map((row) => row.precipitationProbabilityPercent),
  );

  return [
    {
      key: "best-hours",
      label: "最佳小时",
      value: formatHourlySummaryTimes(bestRows, timezone),
      detail: data.focusWindows[0]?.label ?? "按银河/天文焦点窗口和云量、降水、能见度做展示摘要。",
      tone: bestRows.length > 0 ? "primary" : "muted",
    },
    {
      key: "worst-hours",
      label: "风险小时",
      value: worstRows.length > 0 ? formatHourlySummaryTimes(worstRows, timezone) : "暂无突出风险",
      detail: "优先提示降水、低能见度、强风或风险窗口内的小时。",
      tone: worstRows.length > 0 ? "accent" : "info",
    },
    {
      key: "cloud-minimum",
      label: "云量低点",
      value: isMeaningfulNumber(cloudMinimum) ? `${Math.round(cloudMinimum)}%` : "暂无数据",
      detail: "取本次可展示逐小时总云量最低值，仅作快速浏览。",
      tone: isMeaningfulNumber(cloudMinimum) && cloudMinimum <= 45 ? "primary" : "info",
    },
    {
      key: "visibility-wind",
      label: "能见度 / 风",
      value: `${formatVisibilityKm(visibilityMinimum)} / ${formatWindMs(windMaximum)}`,
      detail: "能见度取最低值，风速取最高值，用于判断通透和器材稳定性。",
      tone:
        (isMeaningfulNumber(visibilityMinimum) && visibilityMinimum <= 5000) ||
        (isMeaningfulNumber(windMaximum) && windMaximum >= 9)
          ? "accent"
          : "info",
    },
    {
      key: "precipitation",
      label: "降水风险",
      value: formatPrecipitationSummary(maxPrecipitationAmount, maxPrecipitationProbability),
      detail: "取逐小时最高雨量和最高降水概率，不替代确定性推荐。",
      tone:
        (isMeaningfulNumber(maxPrecipitationAmount) && maxPrecipitationAmount > 0) ||
        (isMeaningfulNumber(maxPrecipitationProbability) && maxPrecipitationProbability >= 40)
          ? "accent"
          : "primary",
    },
  ];
}

function rowsForHourlyWindows(
  rows: readonly ProfessionalHourlyDisplayData["rows"][number][],
  windows: readonly CloudSeaProfessionalHourlyWindow[],
): readonly ProfessionalHourlyDisplayData["rows"][number][] {
  if (windows.length === 0) {
    return [];
  }

  return rows.filter((row) =>
    windows.some((window) => {
      const rowTime = Date.parse(row.time);
      const start = Date.parse(window.startTime);
      const end = Date.parse(window.endTime);
      return (
        Number.isFinite(rowTime) &&
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        rowTime >= start &&
        rowTime <= end
      );
    }),
  );
}

function astroHourlyDisplayRankValue(row: ProfessionalHourlyDisplayData["rows"][number]): number {
  const cloudScore = isMeaningfulNumber(row.cloudTotalPercent) ? 100 - row.cloudTotalPercent : 40;
  const lowCloudScore = isMeaningfulNumber(row.cloudLowPercent) ? 100 - row.cloudLowPercent : 40;
  const visibilityScore = isMeaningfulNumber(row.visibilityMeters)
    ? Math.min(100, row.visibilityMeters / 200)
    : 40;
  const precipitationPenalty =
    (isMeaningfulNumber(row.precipitationAmountMm) ? row.precipitationAmountMm * 20 : 0) +
    (isMeaningfulNumber(row.precipitationProbabilityPercent)
      ? row.precipitationProbabilityPercent / 2
      : 0);
  const windPenalty = isMeaningfulNumber(row.windSpeedMs)
    ? Math.max(0, row.windSpeedMs - 5) * 5
    : 0;

  return cloudScore + lowCloudScore + visibilityScore - precipitationPenalty - windPenalty;
}

function astroHourlyDisplayRiskRankValue(
  row: ProfessionalHourlyDisplayData["rows"][number],
): number {
  const cloudRisk = isMeaningfulNumber(row.cloudTotalPercent) ? row.cloudTotalPercent : 0;
  const lowCloudRisk = isMeaningfulNumber(row.cloudLowPercent) ? row.cloudLowPercent : 0;
  const precipitationRisk =
    (isMeaningfulNumber(row.precipitationAmountMm) ? row.precipitationAmountMm * 30 : 0) +
    (isMeaningfulNumber(row.precipitationProbabilityPercent)
      ? row.precipitationProbabilityPercent
      : 0);
  const visibilityRisk = isMeaningfulNumber(row.visibilityMeters)
    ? Math.max(0, 8000 - row.visibilityMeters) / 100
    : 0;
  const windRisk = isMeaningfulNumber(row.windSpeedMs) ? row.windSpeedMs * 6 : 0;

  return cloudRisk + lowCloudRisk + precipitationRisk + visibilityRisk + windRisk;
}

function astroHourlyRowHasDisplayRisk(row: ProfessionalHourlyDisplayData["rows"][number]): boolean {
  return (
    (isMeaningfulNumber(row.precipitationAmountMm) && row.precipitationAmountMm > 0) ||
    (isMeaningfulNumber(row.precipitationProbabilityPercent) &&
      row.precipitationProbabilityPercent >= 40) ||
    (isMeaningfulNumber(row.visibilityMeters) && row.visibilityMeters <= 5000) ||
    (isMeaningfulNumber(row.windSpeedMs) && row.windSpeedMs >= 8) ||
    (isMeaningfulNumber(row.cloudTotalPercent) && row.cloudTotalPercent >= 80)
  );
}

function formatHourlySummaryTimes(
  rows: readonly ProfessionalHourlyDisplayData["rows"][number][],
  timezone: string,
): string {
  if (rows.length === 0) {
    return "暂无明确小时";
  }

  return rows
    .map((row) => row.timeLabel || formatTime(row.time, timezone))
    .filter(Boolean)
    .join("、");
}

function minimumFinite(values: readonly (number | null | undefined)[]): number | null {
  const finite = values.filter(isMeaningfulNumber);
  return finite.length > 0 ? Math.min(...finite) : null;
}

function maximumFinite(values: readonly (number | null | undefined)[]): number | null {
  const finite = values.filter(isMeaningfulNumber);
  return finite.length > 0 ? Math.max(...finite) : null;
}

function formatVisibilityKm(value: number | null): string {
  return isMeaningfulNumber(value) ? `${formatDecimal(value / 1000)} km` : "暂无数据";
}

function formatWindMs(value: number | null): string {
  return isMeaningfulNumber(value) ? `${formatDecimal(value)} m/s` : "暂无数据";
}

function formatPrecipitationSummary(amount: number | null, probability: number | null): string {
  const amountLabel = isMeaningfulNumber(amount) ? `${formatDecimal(amount)} mm` : "暂无雨量";
  const probabilityLabel = isMeaningfulNumber(probability)
    ? `${Math.round(probability)}%`
    : "暂无概率";
  return `${amountLabel} / ${probabilityLabel}`;
}

function formatDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function astroActionItem(
  items: readonly AstroActionSummaryItem[],
  key: AstroActionSummaryItem["key"],
): AstroActionSummaryItem | undefined {
  return items.find((item) => item.key === key);
}

function buildAstroPageProfessionalDataGroups({
  result,
  nights,
  bestNight,
  lightPollution,
  terrainHorizon,
  professionalHourlyData,
  decisionSummary,
}: {
  readonly result: ForecastCalculationResult;
  readonly nights: readonly AstroNightDisplayModel[];
  readonly bestNight: AstroNightDisplayModel | undefined;
  readonly lightPollution: AstroLightPollutionDisplayModel;
  readonly terrainHorizon: AstroTerrainHorizonDisplayModel;
  readonly professionalHourlyData: ProfessionalHourlyDisplayData;
  readonly decisionSummary: AstroDecisionSummary;
}): readonly AstroProfessionalDataGroup[] {
  const night = bestNight ?? nights[0];
  const lightPollutionPublicItems = lightPollution.professionalDataGroups
    .filter((group) => !group.developerDiagnostics)
    .flatMap((group) => group.items.slice(0, group.key === "viirs-current-light" ? 4 : 3));
  const lightPollutionDiagnostics = lightPollution.professionalDataGroups
    .filter((group) => group.developerDiagnostics)
    .flatMap((group) => group.items);
  const directionalLightPollutionItems =
    lightPollution.directionalSectorItems.length > 0
      ? lightPollution.directionalSectorItems.slice(0, 3)
      : [
          {
            label: "银河方向",
            value: lightPollution.publicDirectionDecisionLabel,
            detail: lightPollution.targetDirectionLightPollutionWarning,
          },
        ];

  return [
    {
      key: "decision-summary",
      title: "决策摘要",
      badgeLabel: decisionSummary.recommendationLabel,
      description: "面向出行决策的公开结论，先给是否前往、窗口、风险和置信度。",
      items: [
        {
          label: "是否前往",
          value: decisionSummary.recommendationLabel,
          detail: decisionSummary.oneSentenceAdvice,
        },
        {
          label: "最佳观测夜",
          value: decisionSummary.bestNightLabel,
          detail: `窗口：${decisionSummary.bestWindowLabel}`,
        },
        {
          label: "到达建议",
          value: decisionSummary.arrivalLabel,
          detail: "用于安排停车、步行、构图、对焦和安全撤离。",
        },
        {
          label: "主要风险",
          value: decisionSummary.mainRiskLabel,
          detail: decisionSummary.mainRiskDetail,
        },
        {
          label: "置信度",
          value: decisionSummary.confidenceLabel,
          detail: "由天文数据、天气小时覆盖、光污染和地形可用性共同决定。",
        },
      ],
    },
    {
      key: "astronomy-window",
      title: "天文窗口",
      badgeLabel: result.astroDataSourceLabelZh,
      description: "展示本次最佳夜的天文黑夜、银河窗口和月相依据。",
      items: [
        {
          label: "天文数据",
          value: result.astroDataSourceLabelZh,
          detail: result.calendarBasis.forecastRangeLabel,
        },
        {
          label: "天文黑夜",
          value: night?.astronomicalNight.windowLabel ?? "暂无观测夜",
          detail: night?.astronomicalNight.label ?? "本次预报范围内未形成可比较观测夜。",
        },
        {
          label: "银河窗口",
          value: night?.milkyWay.bestWindowLabel ?? "暂无推荐银河窗口",
          detail: night?.directionSummaryLabel ?? "银河方向待确认。",
        },
        {
          label: "月光影响",
          value: night?.moonImpactSummaryLabel ?? "暂无月相数据",
          detail: night?.moon.overlapDisplay
            ? `窗口重叠：${night.moon.overlapDisplay}`
            : "月光重叠暂无可靠数据。",
        },
      ],
    },
    {
      key: "weather-blockers",
      title: "天气阻碍",
      badgeLabel: night?.cloudWeatherBlockerLabel ?? "天气待复核",
      description: "只保留对星空银河执行有影响的云量、降水、能见度、湿度和风。",
      items: [
        {
          label: "主要阻碍",
          value: decisionSummary.mainRiskLabel,
          detail: decisionSummary.mainRiskDetail,
        },
        {
          label: "云量",
          value: night?.weather.cloudSummary ?? "暂无逐夜云量摘要",
          detail: night?.weather.lowCloudRisk ?? "低云风险需结合小时数据复核。",
        },
        {
          label: "降水",
          value: night?.weather.precipitationRisk ?? "暂无逐夜降水摘要",
          detail: "降水和湿度会优先降低银河推荐等级。",
        },
        {
          label: "能见度 / 风",
          value: [
            night?.weather.visibilitySummary ?? "能见度待复核",
            night?.weather.windRisk ?? "风力待复核",
          ].join(" / "),
          detail: "影响通透度、器材稳定性和安全撤离。",
        },
        {
          label: "天气小时覆盖",
          value: night?.weather.coverageDisplay ?? `${professionalHourlyData.rows.length} 小时`,
          detail: `专业小时数据总量 ${professionalHourlyData.rows.length}；焦点窗口 ${professionalHourlyData.focusWindows.length} 个。`,
        },
      ],
    },
    {
      key: "light-pollution-evidence",
      title: "光污染证据",
      badgeLabel: lightPollution.publicDecisionLabel,
      description: "合并 WA/模型天空亮度、VIIRS 当前灯光和方向光害，作为出行判断的次级证据。",
      items: [...lightPollutionPublicItems.slice(0, 4), ...directionalLightPollutionItems].slice(
        0,
        7,
      ),
    },
    {
      key: "terrain-horizon-evidence",
      title: "地形证据",
      badgeLabel: terrainHorizon.publicDecisionLabel,
      description: "地形遮挡参与判断；方位角、地平线高度和 DEM 细节只在专业数据中展示。",
      items: terrainHorizon.professionalDataItems.slice(0, 6),
    },
    {
      key: "developer-diagnostics",
      title: "开发诊断",
      badgeLabel: "默认折叠",
      description: "原始诊断字段、内部说明和低层数据口径，仅用于排查模型版本。",
      collapsedByDefault: true,
      developerDiagnostics: true,
      items: [
        {
          label: "数据说明",
          value: "公开页提示",
          detail: buildAstroDataNotice(result),
        },
        {
          label: "缺失数据",
          value:
            result.astroAnalysis.missingDataNotes.length > 0
              ? `${result.astroAnalysis.missingDataNotes.length} 条`
              : "none",
          detail: result.astroAnalysis.missingDataNotes[0] ?? "当前没有额外缺失数据提示。",
        },
        {
          label: "逐小时窗口",
          value: `${professionalHourlyData.focusWindows.length} focus / ${professionalHourlyData.riskWindows.length} risk`,
          detail: `总行数 ${professionalHourlyData.rows.length}；默认仅在专业数据展开后显示。`,
        },
        ...lightPollutionDiagnostics,
      ],
    },
  ];
}

function astroActionTone(level: AstroNightRecommendationLevel): ForecastResultCardTone {
  switch (level) {
    case "recommended":
      return "primary";
    case "watch":
      return "info";
    case "backup":
      return "accent";
    case "not_recommended":
      return "danger";
    case "insufficient":
      return "muted";
  }
}

function astroActionLightPollution(analysis: AstroAnalysisResult): {
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
} {
  const target =
    analysis.targetDirectionLightPollution ??
    fallbackTargetDirectionLightPollution(analysis.lightPollution);
  if (!analysis.lightPollution.available) {
    return {
      value: "数据暂缺",
      detail: "光污染数据不足时，不把现场视为低风险；需要现场确认城市光穹和地平线亮度。",
      tone: "muted",
    };
  }

  const targetRisk = target.riskIndex ?? null;
  const targetClean = target.status === "resolved" && targetRisk !== null && targetRisk < 40;
  const targetHigh = target.status === "resolved" && targetRisk !== null && targetRisk >= 60;
  const ambientRisk =
    analysis.lightPollution.ambientRiskIndex ??
    representativeLightPollutionRiskIndex(analysis.lightPollution.ambientRiskLevel);
  const directionRisk =
    targetRisk ??
    representativeLightPollutionRiskIndex(analysis.lightPollution.targetDirectionLevel);
  const publicDecisionLabel = publicLightPollutionDecisionLabel({
    available: analysis.lightPollution.available && analysis.lightPollution.dataAvailable,
    ambientRiskIndex: ambientRisk,
    directionRiskIndex: directionRisk,
  });
  const directionDecisionLabel = publicLightPollutionDirectionDecisionLabel(target);
  const overallAffected = ambientRisk >= 40;

  if (overallAffected && targetClean) {
    return {
      value: "整体受影响",
      detail:
        "整体环境：尚暗但受周边光害影响；银河方向：较低，目标方向较干净。优先选目标方向开阔、避开高光害方向的机位。",
      tone: "info",
    };
  }
  if (targetHigh) {
    return {
      value: "方向光害较强",
      detail: `整体环境：${publicDecisionLabel}；银河方向：${directionDecisionLabel}。建议避开高光害方向或更换机位。`,
      tone: "accent",
    };
  }
  return {
    value: publicDecisionLabel,
    detail: `整体环境：${publicDecisionLabel}；银河方向：${directionDecisionLabel}。${target.warningZh}`,
    tone:
      Math.max(ambientRisk, directionRisk) >= 60
        ? "accent"
        : target.status === "unknown"
          ? "muted"
          : "primary",
  };
}

function astroActionMainBlocker(analysis: AstroAnalysisResult): {
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
} {
  if (analysis.weatherBlockers.length > 0) {
    return {
      value: astroBlockerSummary(analysis.weatherBlockers),
      detail: "天气阻挡优先级高于光污染；云量、低云或降水不通过时，不把银河标为推荐。",
      tone: "danger",
    };
  }
  if (!analysis.astroWindowAvailable) {
    return {
      value: "缺少天文黑夜或银河窗口",
      detail: "没有可靠夜间窗口时，不把低光污染当作可拍条件。",
      tone: "muted",
    };
  }
  if (analysis.moonlightImpactScore >= 65) {
    return {
      value: "月光影响偏强",
      detail: "月亮在窗口内照明较强时，银河对比度会被压低。",
      tone: "accent",
    };
  }
  if (
    analysis.lightPollution.available &&
    ((analysis.lightPollution.ambientRiskIndex ?? 0) >= 60 ||
      (analysis.lightPollution.targetDirectionRisk ?? 0) >= 60)
  ) {
    return {
      value: "光污染影响",
      detail:
        analysis.lightPollution.targetDirectionRisk !== undefined &&
        analysis.lightPollution.targetDirectionRisk !== null &&
        analysis.lightPollution.targetDirectionRisk >= 60
          ? "银河方向光害偏高，建议避开城市方向构图或换更暗机位。"
          : "环境光污染偏高，即使天气较好，银河细节也可能偏弱。",
      tone: "accent",
    };
  }
  return {
    value: "暂无主要阻碍",
    detail: "云量、月光和光污染暂未构成主阻碍，仍需临近复核天气和现场安全。",
    tone: "primary",
  };
}

function astroActionArrival(
  bestNight: AstroNightDisplayModel | undefined,
  timezone: string,
): {
  readonly value: string;
  readonly detail: string;
  readonly tone: ForecastResultCardTone;
} {
  if (
    bestNight &&
    (bestNight.recommendationLevel === "recommended" ||
      bestNight.recommendationLevel === "watch") &&
    bestNight.milkyWay.bestStartAt
  ) {
    const arrivalTime = addHoursInTimezone(bestNight.milkyWay.bestStartAt, -1.25, timezone);
    return {
      value: `${formatTime(arrivalTime, timezone)} 前到达`,
      detail: "预留 75 分钟完成停车、步行、构图、对焦和安全撤离规划。",
      tone: astroActionTone(bestNight.recommendationLevel),
    };
  }
  return {
    value: "暂无专程到达建议",
    detail: "当前仅适合备选或临近复核，不按银河专程窗口安排到达时间。",
    tone: "muted",
  };
}

function astroNightDataRank(night: AstroNightDisplayModel): number {
  return night.starPhotographyIndex !== null ||
    night.astronomicalNight.startAt ||
    night.milkyWay.available
    ? 1
    : 0;
}

function astroRecommendationRank(level: AstroNightRecommendationLevel): number {
  switch (level) {
    case "recommended":
      return 5;
    case "watch":
      return 4;
    case "backup":
      return 3;
    case "not_recommended":
      return 2;
    case "insufficient":
      return 1;
  }
}

function astroProfessionalFocusWindows(
  nights: readonly AstroNightDisplayModel[],
): readonly CloudSeaProfessionalHourlyWindow[] {
  return nights
    .filter((night) => night.milkyWay.bestStartAt && night.milkyWay.bestEndAt)
    .map((night) => ({
      startTime: night.milkyWay.bestStartAt!,
      endTime: night.milkyWay.bestEndAt!,
      label: `${night.localEveningDateLabel} 最佳银河窗口`,
    }));
}

function astroProfessionalRiskWindows(
  nights: readonly AstroNightDisplayModel[],
): readonly CloudSeaProfessionalHourlyWindow[] {
  return nights
    .filter(
      (night) =>
        night.recommendationLevel === "not_recommended" &&
        night.astronomicalNight.startAt &&
        night.astronomicalNight.endAt,
    )
    .map((night) => ({
      startTime: night.astronomicalNight.startAt!,
      endTime: night.astronomicalNight.endAt!,
      label: `${night.localEveningDateLabel} 风险夜间窗口`,
    }));
}

function astroProfessionalRowAnnotations(
  nights: readonly AstroNightDisplayModel[],
): readonly ProfessionalHourlyRowAnnotation[] {
  return nights
    .filter((night) => night.milkyWay.bestStartAt)
    .map((night) => ({
      rowTime: night.milkyWay.bestStartAt!,
      label: "最佳星空窗口",
      detail: night.conciseReason,
      tone: night.recommendationLevel === "recommended" ? "success" : "info",
    }));
}

function buildAstroJudgmentFactors(
  result: ForecastCalculationResult,
  nights: readonly AstroNightDisplayModel[],
  bestNight: AstroNightDisplayModel | undefined,
  terrainHorizon: AstroTerrainHorizonDisplayModel,
): readonly AstroJudgmentFactorCard[] {
  const night = bestNight ?? nights[0];
  const lightPollution =
    night?.lightPollution ?? astroLightPollutionDisplay(result.astroAnalysis.lightPollution);
  if (!night) {
    return [];
  }

  return [
    {
      key: "astronomical-night",
      label: "银河窗口",
      status: night.milkyWay.available ? "有窗口" : night.astronomicalNight.label,
      detail: `${night.astronomicalNight.windowLabel}；${night.milkyWay.bestWindowLabel}`,
      tone: night.astronomicalNight.lifecycle === "available" ? "primary" : "accent",
    },
    {
      key: "moonlight",
      label: "月光影响",
      status: night.moon.moonlightInterferenceLevel,
      detail: `${night.moon.phaseName}，照明 ${night.moon.illuminationDisplay}，重叠 ${night.moon.overlapDisplay}`,
      tone:
        night.moon.moonlightInterferenceLevel === "高" ||
        night.moon.moonlightInterferenceLevel === "很高"
          ? "danger"
          : night.moon.moonlightInterferenceLevel === "中"
            ? "accent"
            : "primary",
    },
    {
      key: "milky-way-geometry",
      label: "银心高度/方向",
      status: night.milkyWay.available ? night.milkyWay.maximumAltitudeDisplay : "暂无窗口",
      detail: `${night.milkyWay.geometricWindowLabel}；${night.milkyWay.azimuthSummary}`,
      tone: night.milkyWay.available ? "info" : "muted",
    },
    {
      key: "terrain-horizon",
      label: "地形遮挡",
      status: terrainHorizon.statusLabelZh,
      detail: `${terrainHorizon.detail} ${terrainHorizon.recommendationZh}`,
      tone: terrainHorizon.statusTone,
    },
    {
      key: "cloud",
      label: "天气阻挡",
      status: night.weather.cloudSummary,
      detail: night.weather.lowCloudRisk,
      tone: /高/.test(night.weather.lowCloudRisk) ? "danger" : "info",
    },
    {
      key: "visibility-humidity",
      label: "通透度",
      status: night.weather.visibilitySummary,
      detail: night.weather.humidityRisk,
      tone: /高/.test(night.weather.humidityRisk) ? "accent" : "info",
    },
    {
      key: "precipitation-wind",
      label: "降水与风",
      status: night.weather.precipitationRisk,
      detail: night.weather.windRisk,
      tone: /[1-9]\d%|mm/.test(night.weather.precipitationRisk) ? "accent" : "muted",
    },
    {
      key: "light-pollution",
      label: "光污染影响",
      status: lightPollution.publicDecisionLabel,
      detail: lightPollution.available
        ? `${lightPollution.publicDirectionDecisionLabel}；${lightPollution.finalPhotographyImplicationZh}`
        : lightPollution.recommendationZh,
      tone: lightPollution.statusTone,
    },
  ];
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
    dateLabel: dateLabelForResult(result, summary.date),
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
    .map((date) => {
      const groupedWindows = windows.filter((window) => window.date === date);

      return {
        key: `window-group-${date}`,
        date,
        dateLabel: dateLabelForResult(result, date),
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
        label: dateLabelForResult(result, day.date),
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
  const terrainHorizon = astroTerrainHorizonDisplay(selectedMilkyWayTerrainAssessment(result));

  return {
    key: "milky-way-obstruction",
    title: "银河方向遮挡",
    badgeLabel: "银河地平线",
    items: [
      {
        label: "银河方向 clearance",
        value: terrainHorizon.clearanceDisplay,
        detail:
          result.scores.milkyWay.risks.find((risk) => risk.includes("地平线遮挡")) ??
          "clearance 用于辅助判断低仰角银心和地景衔接是否容易被山体挡住；缺少方向剖面时不显示精确角度。",
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
  const terrainHorizon = astroTerrainHorizonDisplay(selectedMilkyWayTerrainAssessment(result));

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
        value: terrainHorizon.statusLabelZh,
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
      dateLabel: dateLabelForResult(result, day.date),
      sunriseScore: day.sunriseScore,
      sunsetScore: day.sunsetScore,
      sunriseWindowLabel: sunriseWindow
        ? formatGlowWindowBrief(sunriseWindow, result.calendarBasis.timezone)
        : "暂无明确日出暖光窗口",
      sunsetWindowLabel: sunsetWindow
        ? formatGlowWindowBrief(sunsetWindow, result.calendarBasis.timezone)
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
        ? `${bestWindow.labelZh} ${formatLocalTimeRange(
            bestWindow.start,
            bestWindow.end,
            result.calendarBasis.timezone,
          )}`
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
      timeRangeLabel: formatLocalTimeRange(window.start, window.end, result.calendarBasis.timezone),
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
        label: glowProfessionalAnnotationLifecycleLabel(result, interval),
        detail: glowProfessionalAnnotationLifecycleDetail(result, interval),
        tone: glowProfessionalAnnotationLifecycleTone(result, interval),
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
    if (astro.sunriseGlowBestStartAt && astro.sunriseGlowBestEndAt) {
      intervals.push({
        start: astro.sunriseGlowBestStartAt,
        end: astro.sunriseGlowBestEndAt,
        label: "朝霞最佳",
        detail: "由太阳高度角跨越区间推导的朝霞核心观察段。",
        tone: "success",
      });
      if (
        astro.sunriseGlowCandidateStartAt &&
        Date.parse(astro.sunriseGlowCandidateStartAt) < Date.parse(astro.sunriseGlowBestStartAt)
      ) {
        intervals.push({
          start: astro.sunriseGlowCandidateStartAt,
          end: astro.sunriseGlowBestStartAt,
          label: "朝霞候选前段",
          detail: "由太阳高度角候选区间推导的提前到位和观察准备段。",
          tone: "info",
        });
      }
      if (
        astro.sunriseGlowCandidateEndAt &&
        Date.parse(astro.sunriseGlowCandidateEndAt) > Date.parse(astro.sunriseGlowBestEndAt)
      ) {
        intervals.push({
          start: astro.sunriseGlowBestEndAt,
          end: astro.sunriseGlowCandidateEndAt,
          label: "朝霞候选后段",
          detail: "最佳窗口后的低太阳高度角候选观察段。",
          tone: "info",
        });
      }
    }
    if (astro.sunsetGlowBestStartAt && astro.sunsetGlowBestEndAt) {
      if (
        astro.sunsetGlowCandidateStartAt &&
        Date.parse(astro.sunsetGlowCandidateStartAt) < Date.parse(astro.sunsetGlowBestStartAt)
      ) {
        intervals.push({
          start: astro.sunsetGlowCandidateStartAt,
          end: astro.sunsetGlowBestStartAt,
          label: "晚霞候选前段",
          detail: "由太阳高度角候选区间推导的提前到位和观察准备段。",
          tone: "info",
        });
      }
      intervals.push({
        start: astro.sunsetGlowBestStartAt,
        end: astro.sunsetGlowBestEndAt,
        label: "晚霞最佳",
        detail: "由太阳高度角跨越区间推导的晚霞核心观察段。",
        tone: "success",
      });
      if (
        astro.sunsetGlowCandidateEndAt &&
        Date.parse(astro.sunsetGlowCandidateEndAt) > Date.parse(astro.sunsetGlowBestEndAt)
      ) {
        intervals.push({
          start: astro.sunsetGlowBestEndAt,
          end: astro.sunsetGlowCandidateEndAt,
          label: "晚霞候选后段",
          detail: "最佳窗口后的低太阳高度角候选观察段。",
          tone: "info",
        });
      }
    }
    return intervals;
  });
}

function glowProfessionalAnnotationLifecycleLabel(
  result: ForecastCalculationResult,
  interval: { readonly start: string; readonly end: string; readonly label: string },
): string {
  const state = classifyGlowWindowLifecycle({
    startAt: interval.start,
    endAt: interval.end,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
  }).state;

  if (state === "ended") {
    return `${interval.label}（已结束）`;
  }
  if (state === "active") {
    return `${interval.label}（窗口进行中）`;
  }
  return interval.label;
}

function glowProfessionalAnnotationLifecycleDetail(
  result: ForecastCalculationResult,
  interval: { readonly start: string; readonly end: string; readonly detail: string },
): string {
  const state = classifyGlowWindowLifecycle({
    startAt: interval.start,
    endAt: interval.end,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
  }).state;

  if (state === "ended") {
    return `本次窗口已结束。${interval.detail}`;
  }
  if (state === "active") {
    return `窗口进行中，建议尽快到位并现场复核云层。${interval.detail}`;
  }
  return interval.detail;
}

function glowProfessionalAnnotationLifecycleTone(
  result: ForecastCalculationResult,
  interval: {
    readonly start: string;
    readonly end: string;
    readonly tone: "default" | "success" | "warning" | "danger" | "info";
  },
): "default" | "success" | "warning" | "danger" | "info" {
  const state = classifyGlowWindowLifecycle({
    startAt: interval.start,
    endAt: interval.end,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
  }).state;

  if (state === "ended") {
    return "info";
  }
  if (state === "active") {
    return "success";
  }
  return interval.tone;
}

function buildGlowAerosolCard(assessment: GlowAerosolAssessment): GlowAerosolCard {
  return {
    key: "glow-aerosol",
    stateLabel: assessment.stateLabelZh,
    scoreLabel:
      assessment.aerosolScore === undefined
        ? "暂缺分项"
        : `${Math.round(assessment.aerosolScore)} 分`,
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
    const dateLabel = assessment.date ? dateLabelForResult(result, assessment.date) : "未定日期";
    return {
      key: `${assessment.date ?? "unknown"}-${assessment.phase}`,
      dateLabel,
      title: assessment.labelZh,
      statusLabel: terrainStatusLabel(assessment),
      azimuthLabel: formatAzimuthLabel(assessment.solarAzimuthDegrees),
      horizonLabel: formatDegreeLabel(assessment.terrainHorizonAngleDegrees),
      clearanceLabel: formatDegreeLabel(assessment.solarClearanceDegrees),
      detail: compactTerrainObstructionDisplayText(assessment.noteZh),
      tone: terrainTone(assessment),
    };
  });
}

function buildGlowTerrainObstructionSummary(cards: readonly GlowTerrainObstructionCard[]): {
  readonly value: string;
  readonly detail: string;
} {
  if (cards.length === 0) {
    return {
      value: "方向性地形剖面暂缺",
      detail: "地形遮挡数据不足，需现场确认太阳方向。",
    };
  }

  const phases = uniqueDisplayTexts(cards.map((card) => glowTerrainPhaseLabel(card.title)));
  const statuses = uniqueDisplayTexts(cards.map((card) => card.statusLabel));
  const riskyCards = cards.filter((card) => card.tone === "danger" || card.tone === "info");
  const detailSource = riskyCards.length > 0 ? riskyCards : cards;

  return {
    value: `${phases.slice(0, 2).join("、")}：${statuses.slice(0, 2).join(" / ")}`,
    detail: compactTerrainObstructionDisplayText(
      detailSource.map((card) => card.detail).join("；"),
    ),
  };
}

function glowTerrainPhaseLabel(title: string): string {
  if (title.includes("朝霞") || title.includes("日出")) {
    return "朝霞";
  }
  if (title.includes("晚霞") || title.includes("日落")) {
    return "晚霞";
  }
  return title;
}

function compactTerrainObstructionDisplayText(text: string): string {
  const fragments = uniqueDisplayTexts(text.split(/[。；;]+/));
  const value = fragments.length > 0 ? `${fragments.slice(0, 2).join("；")}。` : text.trim();
  return value.length > 96 ? `${value.slice(0, 94)}...` : value;
}

function uniqueDisplayTexts(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const value = item.trim().replace(/\s+/g, " ");
    if (value.length === 0) {
      continue;
    }
    const key = value.replace(/[。；;，,、\s]/g, "");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(value);
  }
  return unique;
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
  return uniqueDisplayTexts(assessments.map(terrainStatusLabel)).join(" / ");
}

function buildGlowDailyWeatherRiskLabel(
  day: GlowAnalysisResult["dailyGlow"][number],
  analysis: GlowAnalysisResult,
): string {
  const rain = dailyGlowRainOverlapLabel(day);
  const risk = glowRiskLabel(
    day.precipitationDisruptionRisk ?? analysis.precipitationDisruptionRisk,
  );
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
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "暂缺";
}

function formatAzimuthLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°` : "方位暂缺";
}

function formatDegreeLabel(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂缺";
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
    ? `主要可观察窗口：${formatWindow(
        mainWindow.start,
        mainWindow.end,
        result.calendarBasis.timezone,
      )}，${glowWindowNote(mainWindow)}`
    : "主要可观察窗口：暂无。";
  const highConfidenceText = highConfidence
    ? `高确定性拍摄窗口：${formatWindow(
        highConfidence.start,
        highConfidence.end,
        result.calendarBasis.timezone,
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

  return dedupeForecastWindows(converted).filter((window) =>
    isForecastGlowWindowLifecycleEligible(result, window),
  );
}

function isForecastGlowWindowLifecycleEligible(
  result: ForecastCalculationResult,
  window: ForecastTimeWindow,
): boolean {
  if (window.target !== "glow") {
    return true;
  }

  return classifyGlowWindowLifecycle({
    startAt: window.startTime,
    endAt: window.endTime,
    evaluatedAt: glowEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
  }).isRecommendationEligible;
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

function isMorningGlowWindow(
  window: Pick<GlowWindow, "type" | "start" | "labelZh" | "phase">,
): boolean {
  if (window.phase === "sunrise") {
    return true;
  }
  if (window.phase === "sunset") {
    return false;
  }
  if (
    window.type === "sunrise_glow" ||
    window.type === "pre_dawn_glow" ||
    window.type === "sunrise_core" ||
    window.type === "morning_warm_light" ||
    window.type === "sunrise"
  ) {
    return true;
  }
  if (
    window.type === "sunset_glow" ||
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

function formatGlowWindowBrief(window: GlowWindow, timezone = "Asia/Shanghai"): string {
  return `${window.labelZh} ${formatLocalTimeRange(window.start, window.end, timezone)}`;
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
    conclusion:
      windowRiskContext?.windowCenteredSummaryZh ?? recommendationExplanation.oneLineConclusionZh,
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
    const cloudSeaScore =
      scoreCalibration?.finalCloudSeaScore ?? day.shootableScore ?? day.travelScore;
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
      dateLabel:
        result.calendarBasis.horizonHours <= 24
          ? "未来24小时"
          : dateLabelForResult(result, day.date),
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
        ? window.timeRangeLabel
        : formatLocalTimeRange(
            day.bestWindow.startTime,
            day.bestWindow.endTime,
            result.calendarBasis.timezone,
          ),
      watchableWindow: day.watchableWindow
        ? formatLocalTimeRange(
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
      timeRangeLabel: window.timeRangeLabel,
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
  const limitingFactor = windowRiskContext?.limitingFactorZh ?? scoreCalibration?.capReasons[0];

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
    timeRangeLabel: formatLocalTimeRange(
      window.startTime,
      window.endTime,
      result.calendarBasis.timezone,
    ),
    score: resolvedCloudSeaScore,
    recommendationLabel: windowGuard.finalRecommendationLabel,
    labelReason: limitingFactor ?? windowExplanation.cautionReasonZh,
    note: guardedWindowNote,
    riskTag: cloudSeaTerrainAwareText(
      cloudSeaWindowRiskTag(result, resolvedCloudSeaScore, windowPrecipitationSignal),
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
        windowRiskContext?.precipitationWindowSummaryZh ?? precipitationSignalContext.userSummaryZh,
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
      value:
        windowRiskContext?.windowRainImpact.riskLabelZh ?? precipitationSignalContext.riskLabelZh,
      detail:
        windowRiskContext?.precipitationWindowSummaryZh ?? precipitationSignalContext.userSummaryZh,
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
  timezone: string,
): AstroDailyTrendItem {
  const galacticCenterWindow =
    milkyWayCandidateWindows.find((window) => window.date === day.date) ??
    day.recommendedMilkyWayWindow;
  const blockers = astroBlockerSummary(day.weatherBlockers);
  const precipitationBlocker = day.weatherBlockers.find((blocker) => /降水|雨|雪/.test(blocker));

  return {
    key: `astro-daily-${day.date}`,
    date: day.date,
    dateLabel: formatLocalDateLabel(day.date, timezone),
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
      ? formatAstroWindowTimeValue(day.astronomicalNightWindow, timezone)
      : "暂无完整窗口",
    moonlessNightLabel: day.moonlessNightWindow
      ? formatAstroWindowTimeValue(day.moonlessNightWindow, timezone)
      : "暂无明确窗口",
    galacticCenterWindowLabel: galacticCenterWindow
      ? `${formatAstroWindowTimeValue(galacticCenterWindow, timezone)}${
          galacticCenterWindow.directionZh ? `，${galacticCenterWindow.directionZh}` : ""
        }`
      : "暂无明确银心窗口",
    recommendedMilkyWayLabel: day.recommendedMilkyWayWindow
      ? day.astroShootable
        ? `推荐银河窗口：${formatAstroWindowTimeValue(day.recommendedMilkyWayWindow, timezone)}`
        : `仅作备选：${formatAstroWindowTimeValue(day.recommendedMilkyWayWindow, timezone)}；${blockers}不支持专程拍摄`
      : day.astroWindowAvailable
        ? `仅作备选窗口：${blockers}不支持专程拍摄`
        : "暂无推荐窗口",
    terrainHorizonLabel: astroTerrainHorizonDisplay(day.terrainHorizonAssessment).compactLabel,
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
    timeRangeLabel: formatAstroWindowTimeValue(window, result.calendarBasis.timezone),
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

function formatAstroWindowValue(
  window: Pick<AstroWindow, "start" | "end">,
  timezone = "Asia/Shanghai",
): string {
  return formatLocalDateTimeRange(window.start, window.end, timezone);
}

function formatAstroWindowTimeValue(
  window: Pick<AstroWindow, "start" | "end">,
  timezone = "Asia/Shanghai",
): string {
  return formatLocalTimeRange(window.start, window.end, timezone);
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
    localDateKey: window.date ?? window.startTime.slice(0, 10),
    localDateLabel: formatLocalDateLabel(window.date ?? window.startTime, timezone),
    timeRangeLabel: formatLocalTimeRange(window.startTime, window.endTime, timezone),
    dateTimeRangeLabel: formatLocalDateTimeRange(window.startTime, window.endTime, timezone),
    fullTimeRangeLabel: formatLocalDateTimeRange(window.startTime, window.endTime, timezone),
    compactTimeRangeLabel: formatLocalTimeRange(window.startTime, window.endTime, timezone, {
      style: "compact",
    }),
    crossesLocalDateBoundary: crossesLocalDateBoundary(window.startTime, window.endTime, timezone),
    timezone,
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
      isForecastGlowWindowLifecycleEligible(result, candidate) &&
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
  const lightPollutionNotice = result.astroAnalysis.lightPollution.available
    ? `光污染数据：卫星夜光参考（${result.astroAnalysis.lightPollution.sourceLabel ?? "本地栅格"}${
        result.astroAnalysis.lightPollution.datasetYear
          ? `，${result.astroAnalysis.lightPollution.datasetYear}`
          : ""
      }），公开波特尔为卫星夜光保守展示估算，不代表现场实测或正式波特尔观测认证。`
    : `光污染数据：${result.astroAnalysis.lightPollution.lightPollutionNoteZh}`;

  return `天文数据：${result.astroDataSourceLabelZh}；天气数据：${weatherStatusLabelForViewModel(
    result,
  )}；地形数据：${result.terrainAnalysis.dataSourceLabelZh}；${lightPollutionNotice}${
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
  const label = formatLocalDateLabel(date, result.calendarBasis.timezone);

  return label === "时间待确认" ? result.calendarBasis.targetDateLabels[index] ?? date : label;
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
  return formatLocalDateTimeRange(startTime, endTime, timezone);
}

function formatTime(value: string, timezone = "Asia/Shanghai"): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
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
