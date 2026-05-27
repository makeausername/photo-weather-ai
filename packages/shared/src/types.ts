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

export type PrecipitationType = "rain" | "snow" | "mixed" | "none" | "unknown";

export type ExposedRidgeWindRisk = "low" | "medium" | "high";

export type TripodStabilityRisk = "low" | "medium" | "high";

export type ElevationSource =
  | "manual"
  | "provider_metadata"
  | "dem"
  | "amap"
  | "open_meteo"
  | "open_meteo_elevation"
  | "unknown";

export type ElevationConfidence = "high" | "medium" | "low";

export type TerrainType =
  | "summit"
  | "ridge"
  | "mountain_platform"
  | "slope"
  | "valley"
  | "lake"
  | "city"
  | "unknown";

export type ExposureType = "exposed" | "semi_exposed" | "sheltered" | "unknown";

export type TerrainViewingDirection = "east" | "west" | "south" | "north" | "panoramic" | "unknown";

export type SpotTerrainProfile = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly latitudeGcj02?: number;
  readonly longitudeGcj02?: number;
  readonly elevationMeters: number | null;
  readonly elevationSource: ElevationSource;
  readonly elevationConfidence: ElevationConfidence;
  readonly terrainType: TerrainType;
  readonly exposureType: ExposureType;
  readonly viewingDirection: TerrainViewingDirection;
  readonly nearbyValleyElevationMeters?: number | null;
  readonly localReliefMeters?: number | null;
  readonly terrainNotesZh?: string;
};

export type WeatherProviderTerrainMetadata = {
  readonly providerCode: string;
  readonly providerElevationMeters?: number;
  readonly providerElevationSource?: ElevationSource;
  readonly providerElevationKnown: boolean;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
  readonly terrainAdjustmentApplied: boolean;
  readonly terrainAdjustmentReason: string;
  readonly dayCorrectionRatio?: number;
  readonly nightCorrectionRatio?: number;
};

export type TransparencyGrade = "excellent" | "good" | "fair" | "poor";

export type CloudFogObstructionRisk = "low" | "medium" | "high";

export type NormalizedWeatherFieldMetadata = {
  readonly value?: string | number | boolean | null;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly estimated: boolean;
  readonly missingReason?: string;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
};

export type NormalizedWeatherFieldMetadataMap = Partial<
  Record<string, NormalizedWeatherFieldMetadata>
>;

export type ElevationTemperatureCorrectionReason =
  | "provider_elevation_close_to_spot"
  | "provider_elevation_delta_beyond_threshold"
  | "provider_terrain_aware_no_extra_correction"
  | "unknown_provider_elevation_conservative"
  | "spot_elevation_too_low_for_unknown_correction"
  | "provider_elevation_higher_than_spot"
  | "existing_correction_preserved";

export type ElevationTemperatureAdjustment = {
  readonly rawTemperature: number;
  readonly rawTemperatureC?: number;
  readonly elevationAdjustedTemperature: number;
  readonly terrainAdjustedTemperatureC?: number;
  readonly correctionApplied: boolean;
  readonly correctionMeters: number;
  readonly correctionCelsius: number;
  readonly lapseRateCelsiusPer100m: number;
  readonly selectedSpotElevationMeters: number;
  readonly providerElevationMeters?: number;
  readonly providerElevationKnown: boolean;
  readonly correctionReason: ElevationTemperatureCorrectionReason;
  readonly dayCorrectionRatio?: number;
  readonly nightCorrectionRatio?: number;
  readonly maxCoolingCelsius?: number;
};

export type PhotographyRainRiskLevel = "none" | "low" | "medium" | "high" | "severe";

export type PhotographyPrecipitationRisk = {
  readonly precipitationProbabilityPercent: number | null;
  readonly precipitationAmountMm: number | null;
  readonly rainRiskLevel: PhotographyRainRiskLevel;
  readonly rainRiskLabelZh: string;
  readonly affectedWindows: readonly string[];
  readonly recommendationZh: string;
};

export type ForecastQueryInput = {
  readonly name: string;
  readonly source: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly elevationMeters?: number | null;
  readonly elevationSource?: ElevationSource;
  readonly elevationConfidence?: ElevationConfidence;
  readonly locationId?: string;
  readonly photoSpotId?: string;
};

export type NormalizedHourlyWeather = {
  readonly time: string;
  readonly temperature: number;
  readonly rawTemperature?: number;
  readonly elevationAdjustedTemperature?: number;
  readonly temperatureAdjustment?: ElevationTemperatureAdjustment;
  readonly feelsLike: number | null;
  readonly humidity: number;
  readonly dewPointSpread?: number | null;
  readonly pressure: number | null;
  readonly windSpeed: number;
  readonly windGust: number | null;
  readonly windDirection: number | null;
  readonly precipitationProbability: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly precipitation: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationType?: PrecipitationType;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly visibility: number | null;
  readonly rawVisibilityKm?: number | null;
  readonly photographyTransparencyScore?: number;
  readonly transparencyGrade?: TransparencyGrade;
  readonly cloudFogObstructionRisk?: CloudFogObstructionRisk;
  readonly dewPoint: number | null;
  readonly cloudTotal: number;
  readonly cloudLow: number | null;
  readonly cloudMid: number | null;
  readonly cloudHigh: number | null;
  readonly exposedRidgeWindRisk?: ExposedRidgeWindRisk;
  readonly mountainFeelsLikeC?: number | null;
  readonly tripodStabilityRisk?: TripodStabilityRisk;
  readonly windChillNoteZh?: string;
  readonly clothingRiskNoteZh?: string;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
  readonly terrainAdjustmentApplied?: boolean;
  readonly terrainAdjustmentReason?: string;
  readonly weatherCode: string | null;
  readonly weatherTextZh?: string | null;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly dataMode?: WeatherDataMode;
  readonly sourceConfidence: number | null;
  readonly missingFields?: readonly string[];
  readonly estimatedFields?: readonly string[];
  readonly sourceNotes?: readonly string[];
  readonly fieldMetadata?: NormalizedWeatherFieldMetadataMap;
};

export type NormalizedCurrentWeather = {
  readonly providerCode: string;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly observedAt: string;
  readonly temperature: number;
  readonly rawTemperature?: number;
  readonly elevationAdjustedTemperature?: number;
  readonly temperatureAdjustment?: ElevationTemperatureAdjustment;
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
  readonly precipitationAmountMm?: number | null;
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationProbability?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly precipitationType?: PrecipitationType;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly rawVisibilityKm?: number | null;
  readonly photographyTransparencyScore?: number;
  readonly transparencyGrade?: TransparencyGrade;
  readonly cloudFogObstructionRisk?: CloudFogObstructionRisk;
  readonly exposedRidgeWindRisk?: ExposedRidgeWindRisk;
  readonly mountainFeelsLikeC?: number | null;
  readonly tripodStabilityRisk?: TripodStabilityRisk;
  readonly windChillNoteZh?: string;
  readonly clothingRiskNoteZh?: string;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
  readonly terrainAdjustmentApplied?: boolean;
  readonly terrainAdjustmentReason?: string;
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
  readonly fieldMetadata?: NormalizedWeatherFieldMetadataMap;
};

export type NormalizedDailyWeather = {
  readonly date: string;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly rawTempMin?: number;
  readonly rawTempMax?: number;
  readonly elevationAdjustedTempMin?: number;
  readonly elevationAdjustedTempMax?: number;
  readonly temperatureAdjustment?: Omit<
    ElevationTemperatureAdjustment,
    | "rawTemperature"
    | "rawTemperatureC"
    | "elevationAdjustedTemperature"
    | "terrainAdjustedTemperatureC"
  >;
  readonly precipitationProbability: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly precipitation?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationType?: PrecipitationType;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly windSpeed?: number | null;
  readonly windGust?: number | null;
  readonly windDirection?: number | null;
  readonly humidity?: number | null;
  readonly visibility?: number | null;
  readonly rawVisibilityKm?: number | null;
  readonly photographyTransparencyScore?: number;
  readonly transparencyGrade?: TransparencyGrade;
  readonly cloudFogObstructionRisk?: CloudFogObstructionRisk;
  readonly cloudTotal?: number | null;
  readonly cloudLow?: number | null;
  readonly cloudMid?: number | null;
  readonly cloudHigh?: number | null;
  readonly exposedRidgeWindRisk?: ExposedRidgeWindRisk;
  readonly mountainFeelsLikeC?: number | null;
  readonly tripodStabilityRisk?: TripodStabilityRisk;
  readonly windChillNoteZh?: string;
  readonly clothingRiskNoteZh?: string;
  readonly providerElevationMeters?: number;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
  readonly terrainAdjustmentApplied?: boolean;
  readonly terrainAdjustmentReason?: string;
  readonly weatherSummary: string;
  readonly cloudSummary?: string;
  readonly sunrise?: string;
  readonly sunset?: string;
  readonly providerCode: string;
  readonly providerLabelZh?: string;
  readonly dataMode?: WeatherDataMode;
  readonly missingFields?: readonly string[];
  readonly estimatedFields?: readonly string[];
  readonly fieldMetadata?: NormalizedWeatherFieldMetadataMap;
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
  readonly partial?: boolean;
  readonly status: ForecastWeatherSourceStatus;
  readonly availableFields: readonly string[];
  readonly missingFields: readonly string[];
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly cacheHit?: boolean;
  readonly generatedAt?: string;
  readonly errorCategory?: ForecastWeatherSourceErrorCategory;
  readonly messageZh: string;
  readonly warningZh?: string;
  readonly extractedFields?: readonly string[];
  readonly topLevelKeys?: readonly string[];
  readonly packages?: readonly string[];
  readonly providerElevationMeters?: number;
  readonly providerElevationSource?: ElevationSource;
  readonly providerElevationKnown?: boolean;
  readonly selectedSpotElevationMeters?: number;
  readonly elevationDifferenceMeters?: number;
  readonly terrainAdjustmentApplied?: boolean;
  readonly terrainAdjustmentReason?: string;
  readonly dayCorrectionRatio?: number;
  readonly nightCorrectionRatio?: number;
};

export type ForecastProviderRuntimeSnapshot = {
  readonly providerCode: string;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly host?: string;
  readonly baseUrl?: string;
  readonly endpoint?: string;
  readonly packages?: readonly string[];
  readonly parserVersion?: string;
  readonly configUpdatedAt?: string;
};

export type TerrainCloudSeaPotential = "low" | "medium" | "high";

export type TerrainDataSource = "mock_terrain" | "open_meteo_elevation" | "manual" | "unknown";

export type TerrainProfileSummary = SpotTerrainProfile & {
  readonly locationElevation: number | null;
  readonly minElevation1km: number | null;
  readonly minElevation3km: number | null;
  readonly minElevation5km: number | null;
  readonly maxElevation5km: number | null;
  readonly avgElevation5km: number | null;
  readonly elevationDiff5km: number | null;
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
  readonly weatherProviderRuntimeSnapshot?: readonly ForecastProviderRuntimeSnapshot[];
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

export type ForecastWindowHumanCostLevel = "low" | "medium" | "high";

export type ForecastWindowRecommendationLevel =
  | "recommended"
  | "cautious"
  | "backup"
  | "not_recommended";

export type ForecastWindowLevel = "watchable" | "shootable" | "best" | "blocked";

export type ForecastTimeWindow = {
  readonly label: string;
  readonly date?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly score: number;
  readonly target: ForecastTarget;
  readonly conditionScore?: number;
  readonly practicalScore?: number;
  readonly humanCostLevel?: ForecastWindowHumanCostLevel;
  readonly recommendationLevel?: ForecastWindowRecommendationLevel;
  readonly windowLevel?: ForecastWindowLevel;
  readonly executableForDedicatedTrip?: boolean;
  readonly suitableIfNearby?: boolean;
  readonly blockerReasons?: readonly string[];
  readonly copyReasonZh?: string;
  readonly practicalKind?: "shooting_window" | "formation_signal";
  readonly lightPhase?:
    | "deep_night"
    | "astronomical_night"
    | "dawn"
    | "sunrise"
    | "daytime"
    | "sunset"
    | "blue_hour";
  readonly practicalNoteZh?: string;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly weatherBlockers?: readonly string[];
  readonly subjectPriorityLabel?: string;
  readonly backupSubjectLabel?: string;
  readonly restWarningZh?: string;
  readonly arrivalAdvice?: {
    readonly recommendedArrivalTime: string;
    readonly recommendedArrivalLabel: string;
    readonly setupBufferMinutes: number;
    readonly reasonZh: string;
    readonly warningZh?: string;
  };
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

export type CloudSeaChanceLabel = "高" | "中" | "低";

export type CloudSeaPostRainOpeningChance = "low" | "medium" | "high";

export type CloudSeaTerrainSupport = {
  readonly score: number;
  readonly level: CloudSeaChanceLabel;
  readonly selectedSpotElevationMeters?: number;
  readonly nearbyValleyElevationMeters?: number;
  readonly localReliefMeters?: number;
  readonly providerElevationMeters?: number;
  readonly terrainType: TerrainType;
  readonly exposureType: ExposureType;
  readonly confidence: CloudSeaConfidenceLevel;
  readonly messageZh: string;
};

export type CloudSeaRainOpeningSignal = {
  readonly rainSupportSignal: boolean;
  readonly activeRainDuringWindow: boolean;
  readonly postRainOpeningChance: CloudSeaPostRainOpeningChance;
  readonly messageZh: string;
};

export type CloudSeaAssessmentLabels = {
  readonly formationOpportunity: CloudSeaChanceLabel;
  readonly shootableOpportunity: CloudSeaChanceLabel;
  readonly whiteoutRisk: CloudSeaChanceLabel;
  readonly bestWindowLabel: string;
  readonly watchableWindowLabel?: string;
  readonly notRecommendedWindowLabel?: string;
};

export type CloudSeaAssessment = {
  readonly formationScore: number;
  readonly shootableScore: number;
  readonly whiteoutRiskScore: number;
  readonly lightAlignedScore: number;
  readonly confidence: number;
  readonly labels: CloudSeaAssessmentLabels;
};

export type CloudSeaAnalysisWindow = {
  readonly label: string;
  readonly date?: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly score: number;
  readonly formationScore?: number;
  readonly shootableScore?: number;
  readonly whiteoutRiskScore?: number;
  readonly lightAlignedScore?: number;
  readonly target: "cloud_sea";
  readonly phase: CloudSeaWindowPhase;
  readonly noteZh: string;
  readonly riskTag: string;
  readonly rainOpening?: CloudSeaRainOpeningSignal;
};

export type DailyCloudSea = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly formationScore?: number;
  readonly opportunityScore: number;
  readonly shootableScore?: number;
  readonly whiteoutRiskScore: number;
  readonly lightAlignedScore?: number;
  readonly confidence?: number;
  readonly labels?: CloudSeaAssessmentLabels;
  readonly travelScore: number;
  readonly bestWindow: CloudSeaAnalysisWindow;
  readonly watchableWindow?: CloudSeaAnalysisWindow;
  readonly notRecommendedWindow?: CloudSeaAnalysisWindow;
  readonly rainOpening?: CloudSeaRainOpeningSignal;
  readonly onSiteCheckpoints?: readonly string[];
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

export type CloudSeaAnalysisResult = CloudSeaAssessment & {
  readonly overallScore: number;
  readonly cloudSeaOpportunityScore: number;
  readonly terrainSupport: CloudSeaTerrainSupport;
  readonly rainOpening: CloudSeaRainOpeningSignal;
  readonly travelScore: number;
  readonly recommendationLabel: CloudSeaRecommendationLabel;
  readonly confidenceLevel: CloudSeaConfidenceLevel;
  readonly bestCloudSeaWindow?: CloudSeaAnalysisWindow;
  readonly bestCloudSeaWindows: readonly CloudSeaAnalysisWindow[];
  readonly watchableCloudSeaWindows: readonly CloudSeaAnalysisWindow[];
  readonly notRecommendedCloudSeaWindows: readonly CloudSeaAnalysisWindow[];
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

export type GlowChanceLabel = "高" | "中" | "低";

export type GlowColorCarrierLabel = "好" | "一般" | "差";

export type GlowPostRainOpeningChance = "low" | "medium" | "high";

export type GlowWindowRainRisk = "low" | "medium" | "high";

export type GlowWindowType =
  | "pre_dawn_glow"
  | "sunrise_core"
  | "morning_warm_light"
  | "sunset_warm_light"
  | "sunset_core"
  | "afterglow"
  | "blue_hour_transition"
  | "sunrise"
  | "sunset"
  | "warm_light";

export type GlowAssessmentLabels = {
  readonly sunriseGlowOpportunity: GlowChanceLabel;
  readonly sunsetGlowOpportunity: GlowChanceLabel;
  readonly lowCloudObstruction: GlowChanceLabel;
  readonly colorCarrier: GlowColorCarrierLabel;
  readonly bestWindowLabel: string;
  readonly watchableWindowLabel?: string;
  readonly notRecommendedWindowLabel?: string;
};

export type GlowAssessment = {
  readonly sunriseGlowScore: number;
  readonly sunsetGlowScore: number;
  readonly lowCloudObstructionRisk: number;
  readonly colorCarrierScore: number;
  readonly precipitationDisruptionRisk: number;
  readonly visibilityColorQualityScore: number;
  readonly practicalGlowScore: number;
  readonly confidence: number;
  readonly labels: GlowAssessmentLabels;
};

export type GlowWindow = {
  readonly type: GlowWindowType;
  readonly labelZh: string;
  readonly date?: string;
  readonly start: string;
  readonly end: string;
  readonly score: number;
  readonly conditionScore?: number;
  readonly practicalScore?: number;
  readonly colorCarrierScore?: number;
  readonly lowCloudObstructionRisk?: number;
  readonly precipitationDisruptionRisk?: number;
  readonly visibilityColorQualityScore?: number;
  readonly terrainScore?: number;
  readonly rainOverlapsWindow?: boolean;
  readonly postRainOpeningChance?: GlowPostRainOpeningChance;
  readonly glowWindowRainRisk?: GlowWindowRainRisk;
  readonly riskTags: readonly string[];
  readonly noteZh: string;
};

export type GlowBestTarget = "sunrise" | "sunset" | "both" | "none";

export type DailyGlow = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly sunriseScore: number;
  readonly sunsetScore: number;
  readonly practicalScore?: number;
  readonly colorCarrierScore?: number;
  readonly lowCloudObstructionRisk?: number;
  readonly precipitationDisruptionRisk?: number;
  readonly visibilityColorQualityScore?: number;
  readonly labels?: GlowAssessmentLabels;
  readonly bestWindow?: GlowWindow;
  readonly watchableWindow?: GlowWindow;
  readonly notRecommendedWindow?: GlowWindow;
  readonly rainOverlapsSunriseWindow?: boolean;
  readonly rainOverlapsSunsetWindow?: boolean;
  readonly postRainOpeningChance?: GlowPostRainOpeningChance;
  readonly glowWindowRainRisk?: GlowWindowRainRisk;
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

export type GlowAnalysisResult = GlowAssessment & {
  readonly glowTravelScore: number;
  readonly rainOverlapsSunriseWindow: boolean;
  readonly rainOverlapsSunsetWindow: boolean;
  readonly postRainOpeningChance: GlowPostRainOpeningChance;
  readonly glowWindowRainRisk: GlowWindowRainRisk;
  readonly recommendationLabel: GlowRecommendationLabel;
  readonly confidenceLevel: GlowConfidenceLevel;
  readonly bestGlowWindow?: GlowWindow;
  readonly bestGlowWindows: readonly GlowWindow[];
  readonly watchableGlowWindows: readonly GlowWindow[];
  readonly notRecommendedGlowWindows: readonly GlowWindow[];
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

export type AstroRiskLevel = "low" | "medium" | "high";

export type AstroShootabilityLabel = "高" | "中" | "低";

export type AstroWindowPresenceLabel = "有" | "无";

export type AstroWindowRecommendationLabel = "推荐银河窗口" | "仅作备选窗口" | "不建议窗口";

export type AstroPhotographyLabels = {
  readonly astronomicalWindow: AstroWindowPresenceLabel;
  readonly starShootability: AstroShootabilityLabel;
  readonly milkyWayShootability: AstroShootabilityLabel;
  readonly moonlightImpact: AstroShootabilityLabel;
  readonly cloudBlocker: AstroShootabilityLabel;
  readonly dewRisk: AstroShootabilityLabel;
  readonly windowRecommendation: AstroWindowRecommendationLabel;
};

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
  readonly astroConditionScore: number;
  readonly astroPracticalScore: number;
  readonly astronomicalWindowScore: number;
  readonly skyConditionScore: number;
  readonly milkyWayGeometryScore: number;
  readonly moonlightImpactScore: number;
  readonly transparencyScore: number;
  readonly dewRiskScore: number;
  readonly practicalAstroScore: number;
  readonly astronomicalWindowAvailable: boolean;
  readonly astroWindowAvailable: boolean;
  readonly astroShootable: boolean;
  readonly weatherBlockers: readonly string[];
  readonly moonImpactLevel: MoonImpactLevel;
  readonly cloudBlockerLevel: AstroRiskLevel;
  readonly dewRiskLevel: AstroRiskLevel;
  readonly tripodWindRisk: AstroRiskLevel;
  readonly labels: AstroPhotographyLabels;
  readonly gearAdviceZh: readonly string[];
  readonly warmthAdviceZh: string;
  readonly astronomicalNightWindow?: AstroWindow;
  readonly moonlessNightWindow?: AstroWindow;
  readonly recommendedMilkyWayWindow?: AstroWindow;
  readonly assessment: AstroPhotographyAssessment;
  readonly recommendationLabel: AstroRecommendationLabel;
  readonly keyReason: string;
  readonly riskNote: string;
};

export type AstroPhotographyAssessment = {
  readonly astronomicalWindowScore: number;
  readonly skyConditionScore: number;
  readonly milkyWayGeometryScore: number;
  readonly moonlightImpactScore: number;
  readonly transparencyScore: number;
  readonly dewRiskScore: number;
  readonly practicalAstroScore: number;
  readonly astroWindowAvailable: boolean;
  readonly astroShootable: boolean;
  readonly labels: AstroPhotographyLabels;
  readonly moonImpactLevel: MoonImpactLevel;
  readonly cloudBlockerLevel: AstroRiskLevel;
  readonly dewRiskLevel: AstroRiskLevel;
  readonly tripodWindRisk: AstroRiskLevel;
  readonly astroWeatherBlockers: readonly string[];
  readonly recommendedMilkyWayWindow?: AstroWindow;
  readonly moonImpactReasonsZh: readonly string[];
  readonly gearAdviceZh: readonly string[];
  readonly warmthAdviceZh: string;
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
  readonly astroConditionScore: number;
  readonly astroPracticalScore: number;
  readonly astronomicalWindowScore: number;
  readonly skyConditionScore: number;
  readonly milkyWayGeometryScore: number;
  readonly moonlightImpactScore: number;
  readonly moonImpactScore: number;
  readonly transparencyScore: number;
  readonly dewRiskScore: number;
  readonly practicalAstroScore: number;
  readonly astroTravelScore: number;
  readonly recommendationLabel: AstroRecommendationLabel;
  readonly confidenceLevel: AstroConfidenceLevel;
  readonly astroWindowAvailable: boolean;
  readonly astroShootable: boolean;
  readonly labels: AstroPhotographyLabels;
  readonly cloudBlockerLevel: AstroRiskLevel;
  readonly dewRiskLevel: AstroRiskLevel;
  readonly tripodWindRisk: AstroRiskLevel;
  readonly assessment: AstroPhotographyAssessment;
  readonly recommendedMilkyWayWindow?: AstroWindow;
  readonly gearAdviceZh: readonly string[];
  readonly warmthAdviceZh: string;
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
  readonly weatherBlockers: readonly string[];
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

export type ForecastTripDecisionLabel =
  | "推荐专程前往"
  | "谨慎前往"
  | "谨慎参考"
  | "不建议专程前往"
  | "已在附近可观察"
  | "可等云雾变化"
  | "仅作备选"
  | "等待转机";

export type ForecastRainTimingConfidence = "high" | "medium" | "low" | "unknown";

export type ForecastWatchableWindow = {
  readonly subject: string;
  readonly target: ForecastTarget;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly windowLevel?: ForecastWindowLevel;
  readonly recommendationLevel: ForecastWindowRecommendationLevel;
  readonly reasonZh: string;
  readonly suitableForDedicatedTrip: boolean;
  readonly suitableIfNearby: boolean;
};

export type ForecastPrecipitationPeriodSummary = {
  readonly mainPrecipitationPeriodLabelZh: string;
  readonly affectedWindows: readonly string[];
  readonly maxRainRiskWindow?: string;
  readonly rainTimingConfidence: ForecastRainTimingConfidence;
};

export type ForecastDailyWeatherSummary = {
  readonly weatherTextZh?: string;
  readonly tempMin?: number;
  readonly tempMax?: number;
  readonly rawTempMin?: number;
  readonly rawTempMax?: number;
  readonly elevationAdjustedTempMin?: number;
  readonly elevationAdjustedTempMax?: number;
  readonly temperatureCorrectionApplied?: boolean;
  readonly temperatureCorrectionCelsius?: number;
  readonly temperatureCorrectionReason?: ElevationTemperatureCorrectionReason;
  readonly selectedSpotElevationMeters?: number;
  readonly providerElevationMeters?: number;
  readonly providerElevationKnown?: boolean;
  readonly elevationDifferenceMeters?: number;
  readonly feelsLikeMin?: number;
  readonly feelsLikeMax?: number;
  readonly mountainFeelsLikeMin?: number;
  readonly mountainFeelsLikeMax?: number;
  readonly precipitationProbability?: number | null;
  readonly precipitation?: number;
  readonly precipitationAmountMm?: number;
  readonly rainAmountMm?: number;
  readonly snowAmountMm?: number;
  readonly precipitationType?: PrecipitationType;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly mainPrecipitationPeriodLabelZh?: string;
  readonly affectedPrecipitationWindows?: readonly string[];
  readonly maxRainRiskWindow?: string;
  readonly rainTimingConfidence?: ForecastRainTimingConfidence;
  readonly windSpeed?: number;
  readonly windGust?: number;
  readonly windDirection?: number;
  readonly humidity?: number;
  readonly visibility?: number;
  readonly rawVisibilityKm?: number;
  readonly photographyTransparencyScore?: number;
  readonly transparencyGrade?: TransparencyGrade;
  readonly cloudFogObstructionRisk?: CloudFogObstructionRisk;
  readonly exposedRidgeWindRisk?: ExposedRidgeWindRisk;
  readonly tripodStabilityRisk?: TripodStabilityRisk;
  readonly windChillNoteZh?: string;
  readonly clothingRiskNoteZh?: string;
  readonly dewPointSpread?: number;
  readonly cloudTotal?: number;
  readonly cloudLow?: number;
  readonly cloudMid?: number;
  readonly cloudHigh?: number;
};

export type ForecastDailySummary = {
  readonly date: string;
  readonly dateLabelZh: string;
  readonly lunarDateText?: string;
  readonly score: number;
  readonly recommendationLabel: string;
  readonly target: ForecastTarget;
  readonly weather?: ForecastDailyWeatherSummary;
  readonly keyWindows: readonly ForecastTimeWindow[];
  readonly bestShootableWindow?: ForecastTimeWindow;
  readonly watchableWindows?: readonly ForecastWatchableWindow[];
  readonly weatherOpportunityScore?: number;
  readonly riskPenalty?: number;
  readonly practicalTripScore?: number;
  readonly nearbyObservationScore?: number;
  readonly dedicatedTripRecommendation?: ForecastTripDecisionLabel;
  readonly nearbyObservationRecommendation?: ForecastTripDecisionLabel;
  readonly dedicatedTripAdviceZh?: string;
  readonly nearbyObservationAdviceZh?: string;
  readonly riskFlags: readonly ForecastRiskFlag[];
  readonly shortAdvice: string;
};

export type TargetDailyBreakdown = {
  readonly date: string;
  readonly sunriseGlow?: ForecastDailyMetric;
  readonly sunsetGlow?: ForecastDailyMetric;
  readonly cloudSea?: ForecastDailyMetric;
  readonly cloudSeaFormation?: ForecastDailyMetric;
  readonly cloudSeaShootable?: ForecastDailyMetric;
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
  readonly weatherProviderRuntimeSnapshot?: readonly ForecastProviderRuntimeSnapshot[];
  readonly astroDataSourceLabelZh: string;
  readonly astroCalculationBasis?: AstroCalculationBasis;
  readonly calibrationHint?: ForecastCalibrationHint;
};

export type ForecastCalibrationHint = {
  readonly spotId?: string | null;
  readonly locationKey: string;
  readonly target: ForecastTarget;
  readonly sampleCount: number;
  readonly hitRate: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly confidenceAdjustment: number;
  readonly cautionNoteZh: string;
  readonly displayNoteZh: string;
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
