export type CoordinateSystem = "wgs84" | "gcj02" | "bd09";

export type Coordinates = {
  readonly latitude: number;
  readonly longitude: number;
  readonly system: CoordinateSystem;
};

export type Place = {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly adminArea?: string;
  readonly locality?: string;
  readonly coordinates: Coordinates;
};

export type ProviderStatus = "mock" | "configured" | "disabled" | "not_implemented";

export type ProviderMetadata = {
  readonly id: string;
  readonly displayName: string;
  readonly status: ProviderStatus;
};

export type TimeWindow = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
};

export type DecisionGrade = "excellent" | "good" | "fair" | "poor";

export type DecisionCard = {
  readonly grade: DecisionGrade;
  readonly score: number;
  readonly title: string;
  readonly summary: string;
  readonly reasons: readonly string[];
  readonly recommendedWindow?: TimeWindow;
};

export type ForecastHorizon = "24h" | "48h" | "72h" | "7d";

export type ForecastTarget = "general" | "cloud_sea" | "glow" | "astro";

export type WeatherDataMode = "mock" | "demo" | "fixture" | "fallback" | "real";

export type ForecastQueryInput = {
  readonly name: string;
  readonly source: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly elevationMeters?: number;
  readonly locationId?: string;
  readonly photoSpotId?: string;
};

export type NormalizedHourlyWeather = {
  readonly time: string;
  readonly temperature: number;
  readonly feelsLike: number | null;
  readonly humidity: number;
  readonly dewPointSpread?: number | null;
  readonly pressure: number | null;
  readonly windSpeed: number;
  readonly windGust: number | null;
  readonly windDirection: number | null;
  readonly precipitationProbability: number;
  readonly precipitation: number | null;
  readonly visibility: number | null;
  readonly dewPoint: number | null;
  readonly cloudTotal: number;
  readonly cloudLow: number | null;
  readonly cloudMid: number | null;
  readonly cloudHigh: number | null;
  readonly weatherCode: string | null;
  readonly weatherTextZh?: string | null;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly dataMode?: WeatherDataMode;
  readonly sourceConfidence: number | null;
  readonly missingFields?: readonly string[];
  readonly estimatedFields?: readonly string[];
  readonly sourceNotes?: readonly string[];
};

export type NormalizedCurrentWeather = {
  readonly providerCode: string;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly observedAt: string;
  readonly temperature: number;
  readonly feelsLike?: number | null;
  readonly humidity: number;
  readonly dewPoint?: number | null;
  readonly dewPointSpread?: number | null;
  readonly windSpeed: number;
  readonly windDirection?: number | null;
  readonly windGust?: number | null;
  readonly pressure?: number | null;
  readonly visibility?: number | null;
  readonly cloudTotal?: number | null;
  readonly cloudLow?: number | null;
  readonly cloudMid?: number | null;
  readonly cloudHigh?: number | null;
  readonly precipitation?: number | null;
  readonly precipitationProbability?: number | null;
  readonly weatherTextZh?: string | null;
  readonly weatherCode?: string | null;
  readonly airQuality?: {
    readonly aqi?: number;
    readonly category?: string;
    readonly pm25?: number;
    readonly pm10?: number;
  } | null;
  readonly missingFields: readonly string[];
  readonly estimatedFields: readonly string[];
};

export type NormalizedDailyWeather = {
  readonly date: string;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly precipitationProbability: number;
  readonly weatherSummary: string;
  readonly cloudSummary?: string;
  readonly sunrise?: string;
  readonly sunset?: string;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly dataMode?: WeatherDataMode;
  readonly missingFields?: readonly string[];
  readonly estimatedFields?: readonly string[];
};

export type ClothingComfortLevel =
  | "comfortable"
  | "cool"
  | "cold"
  | "very_cold"
  | "hot"
  | "humid"
  | "windy"
  | "rainy";

export type ClothingGuide = {
  readonly titleZh: string;
  readonly summaryZh: string;
  readonly layers: readonly string[];
  readonly accessories: readonly string[];
  readonly riskNotes: readonly string[];
  readonly comfortLevel: ClothingComfortLevel;
};

export type ForecastWeatherSourceStatus = "available" | "failed" | "fallback" | "skipped";

export type ForecastWeatherSourceErrorCategory =
  | "missing_config"
  | "timeout"
  | "network"
  | "invalid_key"
  | "provider_error"
  | "parse_error"
  | "unsupported"
  | "skipped";

export type ForecastWeatherSourceSummary = {
  readonly providerCode: string;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly attempted: boolean;
  readonly success: boolean;
  readonly status: ForecastWeatherSourceStatus;
  readonly availableFields: readonly string[];
  readonly missingFields: readonly string[];
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly generatedAt?: string;
  readonly errorCategory?: ForecastWeatherSourceErrorCategory;
  readonly messageZh: string;
  readonly warningZh?: string;
};

export type TerrainCloudSeaPotential = "low" | "medium" | "high";

export type TerrainDataSource = "mock_terrain" | "open_meteo_elevation";

export type TerrainProfileSummary = {
  readonly locationElevation: number;
  readonly minElevation1km: number;
  readonly minElevation3km: number;
  readonly minElevation5km: number;
  readonly maxElevation5km: number;
  readonly avgElevation5km: number;
  readonly elevationDiff5km: number;
  readonly valleyDirectionZh?: string;
  readonly ridgeDirectionZh?: string;
  readonly terrainCloudSeaPotential: TerrainCloudSeaPotential;
  readonly terrainNoteZh: string;
};

export type HorizonProfileSummary = {
  readonly sunriseHorizonAngle?: number;
  readonly sunsetHorizonAngle?: number;
  readonly milkyWayHorizonAngle?: number;
  readonly blockedDirectionsZh: readonly string[];
  readonly obstructionNoteZh: string;
};

export type TerrainAnalysisSummary = {
  readonly terrainProfile: TerrainProfileSummary;
  readonly horizonProfile: HorizonProfileSummary;
  readonly dataSource: TerrainDataSource;
  readonly dataSourceLabelZh: string;
  readonly isMock: boolean;
  readonly honestyNoteZh: string;
};

export type TerrainSummary = TerrainProfileSummary &
  HorizonProfileSummary & {
    readonly dataSource: TerrainDataSource;
    readonly dataSourceLabelZh: string;
    readonly isMock: boolean;
    readonly honestyNoteZh: string;
  };

export type MoonWaxingOrWaning = "waxing" | "waning" | "unknown";

export type MoonAltitudeSample = {
  readonly time: string;
  readonly altitude: number;
  readonly azimuth?: number;
};

export type MoonInfo = {
  readonly moonPhase: number;
  readonly moonPhaseNameZh: string;
  readonly moonIllumination: number;
  readonly waxingOrWaning: MoonWaxingOrWaning;
  readonly lunarDateText: string;
  readonly solarTerm?: string;
  readonly moonrise?: string;
  readonly moonset?: string;
  readonly moonAltitudeByHour?: Readonly<Record<string, number>>;
  readonly moonAltitudeSamples?: readonly MoonAltitudeSample[];
  readonly calculationNoteZh: string;
};

export type AstroSummary = {
  readonly date: string;
  readonly timezone: string;
  readonly sunrise?: string;
  readonly sunset?: string;
  readonly solarNoon?: string;
  readonly sunriseAzimuth?: number;
  readonly sunsetAzimuth?: number;
  readonly civilDawn?: string;
  readonly civilDusk?: string;
  readonly nauticalDawn?: string;
  readonly nauticalDusk?: string;
  readonly astronomicalDawn?: string;
  readonly astronomicalDusk?: string;
  readonly astronomicalNightStart?: string;
  readonly astronomicalNightEnd?: string;
  readonly moonPhase: number;
  readonly moonPhaseNameZh: string;
  readonly moonIllumination: number;
  readonly waxingOrWaning: MoonWaxingOrWaning;
  readonly lunarDateText: string;
  readonly solarTerm?: string;
  readonly moonrise?: string;
  readonly moonset?: string;
  readonly moonAltitudeByHour?: Readonly<Record<string, number>>;
  readonly moonAltitudeSamples?: readonly MoonAltitudeSample[];
  readonly moonImpactLevel?: MoonImpactLevel;
  readonly moonImpactScore?: number;
  readonly moonImpactReasonsZh?: readonly string[];
  readonly calculationNoteZh: string;
  readonly moonInfo: MoonInfo;
  readonly milkyWayWindowStart?: string;
  readonly milkyWayWindowEnd?: string;
  readonly milkyWayBestTime?: string;
  readonly milkyWayDirection?: string;
  readonly milkyWayGalacticCenterAltitude?: number;
  readonly milkyWayGalacticCenterAzimuth?: number;
  readonly milkyWayCalculationPrecision?: "v1_approximate" | "skyfield";
  readonly milkyWayVisibilityLevel?: "unavailable" | "poor" | "fair" | "good";
  readonly milkyWayNoteZh?: string;
};

export type AstroCalculationBasis = {
  readonly ephemerisFileName?: string;
  readonly coordinateSystem: "WGS84";
  readonly timezone: string;
  readonly elevationMeters?: number;
  readonly generatedAt: string;
  readonly computeElapsedMs?: number;
  readonly samplingResolutionMinutes?: {
    readonly sunCrossing?: number;
    readonly solarNoon?: number;
    readonly moonAltitude?: number;
    readonly moonlessWindow?: number;
    readonly moonImpact?: number;
    readonly galacticCenter?: number;
  };
};

export type AstroWindowBundle = {
  readonly astronomicalNightWindows: readonly AstroWindow[];
  readonly moonlessNightWindows: readonly AstroWindow[];
  readonly milkyWayCandidateWindows: readonly AstroWindow[];
  readonly recommendedMilkyWayWindows: readonly AstroWindow[];
};

export type ForecastCalculationInput = {
  readonly place: Place;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly calendarBasis: ForecastCalculationBasis;
  readonly hourlyWeather: readonly NormalizedHourlyWeather[];
  readonly dailyWeather: readonly NormalizedDailyWeather[];
  readonly terrainSummary: TerrainSummary;
  readonly terrainAnalysis: TerrainAnalysisSummary;
  readonly astroSummaries: readonly AstroSummary[];
  readonly generatedAt: string;
  readonly currentWeather?: NormalizedCurrentWeather;
  readonly clothingGuide?: ClothingGuide;
  readonly isMock: boolean;
  readonly dataSourceLabel: string;
  readonly weatherProviderCode: string;
  readonly weatherProviderLabelZh: string;
  readonly weatherDataMode: WeatherDataMode;
  readonly weatherNoticeZh: string;
  readonly weatherMissingFields: readonly string[];
  readonly weatherEstimatedFields: readonly string[];
  readonly weatherSourceSummaries: readonly ForecastWeatherSourceSummary[];
  readonly weatherMissingDataNotes: readonly string[];
  readonly weatherFusionSummary?: WeatherFusionSummary;
  readonly astroDataSourceLabelZh: string;
  readonly astroCalculationBasis?: AstroCalculationBasis;
  readonly astroWindowBundle?: AstroWindowBundle;
};

export type ForecastScoreLevel = "poor" | "fair" | "good" | "excellent";

export type ForecastScore = {
  readonly key: string;
  readonly label: string;
  readonly score: number;
  readonly level: ForecastScoreLevel;
  readonly reasons: readonly string[];
  readonly risks: readonly string[];
};

export type ForecastTimeWindow = {
  readonly label: string;
  readonly date?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly score: number;
  readonly target: ForecastTarget;
};

export type ForecastRiskLevel = "low" | "medium" | "high";

export type ForecastRiskFlag = {
  readonly key: string;
  readonly label: string;
  readonly level: ForecastRiskLevel;
  readonly description: string;
};

export type ForecastRecommendationLevel =
  | "not_recommended"
  | "cautious"
  | "worth_waiting"
  | "recommended";

export type ForecastScoreSet = {
  readonly sunriseGlow: ForecastScore;
  readonly sunsetGlow: ForecastScore;
  readonly cloudSea: ForecastScore;
  readonly whiteoutRisk: ForecastScore;
  readonly stars: ForecastScore;
  readonly milkyWay: ForecastScore;
  readonly transparency: ForecastScore;
};

export type CloudSeaConfidenceLevel = "high" | "medium" | "low";

export type CloudSeaEvidenceEffect = "positive" | "neutral" | "negative" | "risk";

export type CloudSeaWindowPhase = "accumulation" | "observation" | "waiting" | "dissipation";

export type CloudSeaRecommendationLabel = "推荐重点关注" | "值得等待" | "谨慎参考" | "不建议专程";

export type CloudSeaAnalysisWindow = {
  readonly label: string;
  readonly date?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly score: number;
  readonly target: "cloud_sea";
  readonly phase: CloudSeaWindowPhase;
  readonly noteZh: string;
  readonly riskTag: string;
};

export type DailyCloudSea = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly opportunityScore: number;
  readonly whiteoutRiskScore: number;
  readonly travelScore: number;
  readonly bestWindow: CloudSeaAnalysisWindow;
  readonly recommendationLabel: CloudSeaRecommendationLabel;
  readonly keyReason: string;
  readonly riskNote: string;
};

export type CloudSeaWeatherEvidenceItem = {
  readonly label: string;
  readonly value: string;
  readonly effect: CloudSeaEvidenceEffect;
  readonly noteZh: string;
};

export type CloudSeaTerrainEvidenceItem = {
  readonly label: string;
  readonly value: string;
  readonly effect: CloudSeaEvidenceEffect;
  readonly noteZh: string;
};

export type CloudSeaTravelRecommendation = {
  readonly situation: "已在山上" | "周边短途" | "远途专程";
  readonly action: string;
  readonly detail: string;
};

export type CloudSeaBackupPlan = {
  readonly condition: string;
  readonly action: string;
  readonly detail: string;
};

export type CloudSeaAnalysisResult = {
  readonly overallScore: number;
  readonly cloudSeaOpportunityScore: number;
  readonly whiteoutRiskScore: number;
  readonly travelScore: number;
  readonly recommendationLabel: CloudSeaRecommendationLabel;
  readonly confidenceLevel: CloudSeaConfidenceLevel;
  readonly bestCloudSeaWindows: readonly CloudSeaAnalysisWindow[];
  readonly dailyCloudSea: readonly DailyCloudSea[];
  readonly weatherEvidence: readonly CloudSeaWeatherEvidenceItem[];
  readonly terrainEvidence: readonly CloudSeaTerrainEvidenceItem[];
  readonly whiteoutReasons: readonly string[];
  readonly opportunityReasons: readonly string[];
  readonly travelRecommendations: readonly CloudSeaTravelRecommendation[];
  readonly backupPlans: readonly CloudSeaBackupPlan[];
  readonly missingDataNotes: readonly string[];
  readonly dataMode: WeatherDataMode;
};

export type GlowConfidenceLevel = "high" | "medium" | "low";

export type GlowRecommendationLabel = "推荐重点关注" | "值得等待" | "谨慎参考" | "不建议专程";

export type GlowWindowType = "sunrise" | "sunset" | "afterglow" | "warm_light";

export type GlowWindow = {
  readonly type: GlowWindowType;
  readonly labelZh: string;
  readonly date?: string;
  readonly start: string;
  readonly end: string;
  readonly score: number;
  readonly riskTags: readonly string[];
  readonly noteZh: string;
};

export type GlowBestTarget = "sunrise" | "sunset" | "both" | "none";

export type DailyGlow = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly sunriseScore: number;
  readonly sunsetScore: number;
  readonly bestWindow?: GlowWindow;
  readonly bestTarget: GlowBestTarget;
  readonly recommendationLabel: GlowRecommendationLabel;
  readonly keyReason: string;
  readonly riskNote: string;
};

export type GlowEvidenceItem = {
  readonly label: string;
  readonly value: string;
  readonly effect: CloudSeaEvidenceEffect;
  readonly noteZh: string;
};

export type GlowBackupPlan = {
  readonly condition: string;
  readonly action: string;
  readonly detail: string;
};

export type GlowAnalysisResult = {
  readonly sunriseGlowScore: number;
  readonly sunsetGlowScore: number;
  readonly lowCloudObstructionRisk: number;
  readonly glowTravelScore: number;
  readonly recommendationLabel: GlowRecommendationLabel;
  readonly confidenceLevel: GlowConfidenceLevel;
  readonly bestGlowWindows: readonly GlowWindow[];
  readonly dailyGlow: readonly DailyGlow[];
  readonly cloudLayerEvidence: readonly GlowEvidenceItem[];
  readonly visibilityEvidence: readonly GlowEvidenceItem[];
  readonly terrainObstructionEvidence: readonly GlowEvidenceItem[];
  readonly riskReasons: readonly string[];
  readonly opportunityReasons: readonly string[];
  readonly travelRecommendations: readonly string[];
  readonly backupPlans: readonly GlowBackupPlan[];
  readonly missingDataNotes: readonly string[];
  readonly dataMode: WeatherDataMode;
};

export type AstroConfidenceLevel = "high" | "medium" | "low";

export type AstroRecommendationLabel = "推荐重点关注" | "值得等待" | "谨慎参考" | "不建议专程";

export type MoonImpactLevel = "low" | "medium" | "high";

export type AstroWindowType =
  | "astronomical_night"
  | "moonless_night"
  | "milky_way_candidate"
  | "recommended_milky_way"
  | "star";

export type AstroWindow = {
  readonly type: AstroWindowType;
  readonly labelZh: string;
  readonly date?: string;
  readonly start: string;
  readonly end: string;
  readonly durationMinutes: number;
  readonly score: number;
  readonly riskTags: readonly string[];
  readonly noteZh: string;
  readonly directionZh?: string;
  readonly galacticCenterAltitude?: number;
};

export type MoonlessNightWindow = {
  readonly start: string;
  readonly end: string;
  readonly durationMinutes: number;
  readonly noteZh: string;
};

export type DailyAstro = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly lunarDateText?: string;
  readonly starsScore: number;
  readonly milkyWayScore: number;
  readonly moonImpactLevel: MoonImpactLevel;
  readonly astronomicalNightWindow?: AstroWindow;
  readonly moonlessNightWindow?: AstroWindow;
  readonly recommendedMilkyWayWindow?: AstroWindow;
  readonly recommendationLabel: AstroRecommendationLabel;
  readonly keyReason: string;
  readonly riskNote: string;
};

export type AstroEvidenceItem = {
  readonly label: string;
  readonly value: string;
  readonly effect: "positive" | "neutral" | "negative" | "risk";
  readonly noteZh: string;
};

export type LightPollutionInfo = {
  readonly bortleLevel?: number;
  readonly lightPollutionLevel?: string;
  readonly lightPollutionSource: "unavailable" | "demo" | "provider";
  readonly lightPollutionNoteZh: string;
};

export type AstroAnalysisResult = {
  readonly starsScore: number;
  readonly milkyWayScore: number;
  readonly moonImpactScore: number;
  readonly transparencyScore: number;
  readonly astroTravelScore: number;
  readonly recommendationLabel: AstroRecommendationLabel;
  readonly confidenceLevel: AstroConfidenceLevel;
  readonly bestAstroWindows: readonly AstroWindow[];
  readonly dailyAstro: readonly DailyAstro[];
  readonly moonInfo?: MoonInfo;
  readonly moonlessNightWindows: readonly AstroWindow[];
  readonly astronomicalNightWindows: readonly AstroWindow[];
  readonly milkyWayCandidateWindows: readonly AstroWindow[];
  readonly recommendedMilkyWayWindows: readonly AstroWindow[];
  readonly lightPollution: LightPollutionInfo;
  readonly cloudEvidence: readonly AstroEvidenceItem[];
  readonly visibilityEvidence: readonly AstroEvidenceItem[];
  readonly moonEvidence: readonly AstroEvidenceItem[];
  readonly terrainEvidence: readonly AstroEvidenceItem[];
  readonly lightPollutionEvidence: readonly AstroEvidenceItem[];
  readonly riskReasons: readonly string[];
  readonly opportunityReasons: readonly string[];
  readonly travelRecommendations: readonly string[];
  readonly backupPlans: readonly GlowBackupPlan[];
  readonly missingDataNotes: readonly string[];
  readonly dataMode: WeatherDataMode;
};

export type ForecastDailyMetric = {
  readonly label: string;
  readonly score: number;
  readonly detail: string;
  readonly window?: ForecastTimeWindow;
};

export type ForecastDailySummary = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly lunarDateText?: string;
  readonly score: number;
  readonly recommendationLabel: string;
  readonly target: ForecastTarget;
  readonly keyWindows: readonly ForecastTimeWindow[];
  readonly riskFlags: readonly ForecastRiskFlag[];
  readonly shortAdvice: string;
};

export type TargetDailyBreakdown = {
  readonly date: string;
  readonly sunriseGlow?: ForecastDailyMetric;
  readonly sunsetGlow?: ForecastDailyMetric;
  readonly cloudSea?: ForecastDailyMetric;
  readonly whiteoutRisk?: ForecastDailyMetric;
  readonly stars?: ForecastDailyMetric;
  readonly milkyWay?: ForecastDailyMetric;
  readonly transparency?: ForecastDailyMetric;
  readonly astroSummary?: AstroSummary;
  readonly terrainSummary?: string;
  readonly weatherSummary?: string;
};

export type ForecastCalculationResult = {
  readonly place: Place;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly targetDates: readonly string[];
  readonly calendarBasis: ForecastCalculationBasis;
  readonly overallScore: number;
  readonly recommendationLevel: ForecastRecommendationLevel;
  readonly recommendationLabel: string;
  readonly summary: string;
  readonly scores: ForecastScoreSet;
  readonly cloudSeaAnalysis: CloudSeaAnalysisResult;
  readonly glowAnalysis: GlowAnalysisResult;
  readonly astroAnalysis: AstroAnalysisResult;
  readonly terrainSummary: TerrainSummary;
  readonly terrainAnalysis: TerrainAnalysisSummary;
  readonly astroSummaries: readonly AstroSummary[];
  readonly dailySummaries: readonly ForecastDailySummary[];
  readonly targetDailyBreakdown: readonly TargetDailyBreakdown[];
  readonly bestWindows: readonly ForecastTimeWindow[];
  readonly riskFlags: readonly ForecastRiskFlag[];
  readonly keyReasons: readonly string[];
  readonly photographyAdvice: readonly string[];
  readonly dataNotice: string;
  readonly isMock: boolean;
  readonly dataSourceLabel: string;
  readonly generatedAt: string;
  readonly currentWeather?: NormalizedCurrentWeather;
  readonly clothingGuide: ClothingGuide;
  readonly weatherProviderCode: string;
  readonly weatherProviderLabelZh: string;
  readonly weatherDataMode: WeatherDataMode;
  readonly weatherNoticeZh: string;
  readonly weatherMissingFields: readonly string[];
  readonly weatherEstimatedFields: readonly string[];
  readonly weatherSourceSummaries: readonly ForecastWeatherSourceSummary[];
  readonly weatherMissingDataNotes: readonly string[];
  readonly weatherFusionSummary?: WeatherFusionSummary;
  readonly astroDataSourceLabelZh: string;
  readonly astroCalculationBasis?: AstroCalculationBasis;
};

export type WeatherConfidenceLevel = "high" | "medium" | "low";

export type WeatherFusionSummary = {
  readonly primarySource: string;
  readonly auxiliarySources: readonly string[];
  readonly professionalSourceStatus: string;
  readonly confidenceLevel: WeatherConfidenceLevel;
  readonly confidenceByTarget?: Partial<Record<ForecastTarget, number>>;
  readonly conflictStatusZh: string;
  readonly dataStatusZh: string;
  readonly sourceSummaries?: readonly ForecastWeatherSourceSummary[];
  readonly missingDataNotes?: readonly string[];
};

export type ForecastCalendarDayInfo = {
  readonly date: string;
  readonly dateLabel: string;
  readonly lunarDateText: string;
  readonly solarTerm?: string;
  readonly ganzhiYear?: string;
  readonly zodiac?: string;
};

export type ForecastCalculationBasis = {
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly forecastStartLabel: string;
  readonly forecastEndLabel: string;
  readonly forecastRangeLabel: string;
  readonly targetDates: readonly string[];
  readonly targetDateLabels: readonly string[];
  readonly horizonHours: number;
  readonly timezone: string;
  readonly timezoneLabel: string;
  readonly calendarDays: readonly ForecastCalendarDayInfo[];
  readonly wgs84Coordinates: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly coordinateSource: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  readonly [key: string]: JsonValue;
};
