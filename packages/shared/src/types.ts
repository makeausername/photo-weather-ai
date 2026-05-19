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

export type ForecastQueryInput = {
  readonly name: string;
  readonly source: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly locationId?: string;
  readonly photoSpotId?: string;
};

export type NormalizedHourlyWeather = {
  readonly time: string;
  readonly temperature: number;
  readonly feelsLike?: number;
  readonly humidity: number;
  readonly pressure?: number;
  readonly windSpeed: number;
  readonly windGust?: number;
  readonly windDirection?: number;
  readonly precipitationProbability: number;
  readonly precipitation?: number;
  readonly visibility?: number;
  readonly dewPoint?: number;
  readonly cloudTotal: number;
  readonly cloudLow: number;
  readonly cloudMid: number;
  readonly cloudHigh: number;
  readonly weatherCode?: string;
  readonly providerCode: string;
  readonly sourceConfidence?: number;
};

export type NormalizedDailyWeather = {
  readonly date: string;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly precipitationProbability: number;
  readonly weatherSummary: string;
  readonly sunrise?: string;
  readonly sunset?: string;
};

export type TerrainCloudSeaPotential = "low" | "medium" | "high";

export type TerrainSummary = {
  readonly locationElevation: number;
  readonly minElevation1km: number;
  readonly minElevation3km: number;
  readonly minElevation5km: number;
  readonly maxElevation5km: number;
  readonly elevationDiff5km: number;
  readonly valleyDirection?: string;
  readonly sunriseHorizonAngle?: number;
  readonly sunsetHorizonAngle?: number;
  readonly terrainCloudSeaPotential: TerrainCloudSeaPotential;
};

export type AstroSummary = {
  readonly date: string;
  readonly sunrise: string;
  readonly sunset: string;
  readonly civilDawn: string;
  readonly civilDusk: string;
  readonly nauticalDawn: string;
  readonly nauticalDusk: string;
  readonly astronomicalDawn: string;
  readonly astronomicalDusk: string;
  readonly moonPhase: string;
  readonly moonIllumination: number;
  readonly moonrise?: string;
  readonly moonset?: string;
  readonly moonAltitudeByHour?: Readonly<Record<string, number>>;
  readonly milkyWayWindowStart?: string;
  readonly milkyWayWindowEnd?: string;
  readonly milkyWayDirection?: string;
};

export type ForecastCalculationInput = {
  readonly place: Place;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly hourlyWeather: readonly NormalizedHourlyWeather[];
  readonly dailyWeather: readonly NormalizedDailyWeather[];
  readonly terrainSummary: TerrainSummary;
  readonly astroSummaries: readonly AstroSummary[];
  readonly generatedAt: string;
  readonly isMock: boolean;
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

export type ForecastCalculationResult = {
  readonly place: Place;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly overallScore: number;
  readonly recommendationLevel: ForecastRecommendationLevel;
  readonly recommendationLabel: string;
  readonly summary: string;
  readonly scores: ForecastScoreSet;
  readonly bestWindows: readonly ForecastTimeWindow[];
  readonly riskFlags: readonly ForecastRiskFlag[];
  readonly keyReasons: readonly string[];
  readonly photographyAdvice: readonly string[];
  readonly dataNotice: string;
  readonly isMock: boolean;
  readonly generatedAt: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  readonly [key: string]: JsonValue;
};
