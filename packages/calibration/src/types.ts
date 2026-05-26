import type {
  CalibrationLevel,
  CalibrationStatsRecord,
  ForecastReplayResultRecord,
  ForecastReplayRunRecord,
  ForecastReplayStatus,
  ForecastReplayTarget,
  HistoricalWeatherSampleRecord,
  HistoricalWeatherSourceProvider,
  JsonValue,
  ObservedOutcomeRecord,
  ObservedOutcomeSource,
  ObservedResult,
  RainImpactLevel,
  TransparencyLevel,
  WhiteoutLevel,
} from "@photo-weather/db";

export const historicalWeatherSourceProviders = [
  "open_meteo_historical",
  "meteoblue_history",
  "manual",
  "imported",
] as const satisfies readonly HistoricalWeatherSourceProvider[];

export const calibrationTargets = [
  "general",
  "cloud_sea",
  "glow",
  "astro",
] as const satisfies readonly ForecastReplayTarget[];

export const observedResults = [
  "success",
  "partial",
  "fail",
  "unknown",
] as const satisfies readonly ObservedResult[];

export type {
  CalibrationLevel,
  CalibrationStatsRecord,
  ForecastReplayResultRecord,
  ForecastReplayRunRecord,
  ForecastReplayStatus,
  ForecastReplayTarget,
  HistoricalWeatherSampleRecord,
  HistoricalWeatherSourceProvider,
  ObservedOutcomeRecord,
  ObservedOutcomeSource,
  ObservedResult,
  RainImpactLevel,
  TransparencyLevel,
  WhiteoutLevel,
};

export type CalibrationLocation = {
  readonly spotId?: string | null;
  readonly locationKey: string;
  readonly locationName: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters?: number | null;
};

export type HistoricalWeatherSampleInput = CalibrationLocation & {
  readonly sourceProvider: HistoricalWeatherSourceProvider;
  readonly sampleTime: Date;
  readonly timezone: string;
  readonly temperature: number;
  readonly humidity: number;
  readonly dewPoint?: number | null;
  readonly windSpeed: number;
  readonly windGust?: number | null;
  readonly windDirection?: number | null;
  readonly precipitationAmount?: number | null;
  readonly precipitationProbability?: number | null;
  readonly rainAmount?: number | null;
  readonly snowAmount?: number | null;
  readonly cloudTotal?: number | null;
  readonly cloudLow?: number | null;
  readonly cloudMid?: number | null;
  readonly cloudHigh?: number | null;
  readonly visibility?: number | null;
  readonly pressure?: number | null;
  readonly weatherCode?: string | null;
  readonly weatherText?: string | null;
  readonly rawJson?: JsonValue | null;
};

export type HistoricalWeatherFetchInput = CalibrationLocation & {
  readonly startDate: string;
  readonly endDate: string;
  readonly timezone?: string;
};

export type HistoricalWeatherFetchResult = {
  readonly sourceProvider: HistoricalWeatherSourceProvider;
  readonly samples: readonly HistoricalWeatherSampleInput[];
  readonly requestedUrl?: string;
};

export type HistoricalWeatherProvider = {
  fetchHistoricalWeather(input: HistoricalWeatherFetchInput): Promise<HistoricalWeatherFetchResult>;
};

export type ForecastReplayRunInput = CalibrationLocation & {
  readonly dateStart: string;
  readonly dateEnd: string;
  readonly target: ForecastReplayTarget;
  readonly modelVersion: string;
  readonly ruleVersion: string;
  readonly sourceProvider: HistoricalWeatherSourceProvider;
  readonly status?: ForecastReplayStatus;
  readonly errorMessage?: string | null;
};

export type ForecastReplayResultInput = {
  readonly replayRunId: string;
  readonly spotId?: string | null;
  readonly locationKey: string;
  readonly target: ForecastReplayTarget;
  readonly forecastDate: string;
  readonly overallScore: number;
  readonly recommendationLabel: string;
  readonly dedicatedTripRecommendation?: string | null;
  readonly nearbyObservationRecommendation?: string | null;
  readonly bestWindowStart?: string | null;
  readonly bestWindowEnd?: string | null;
  readonly bestSubject?: string | null;
  readonly cloudSeaFormationScore?: number | null;
  readonly cloudSeaShootableScore?: number | null;
  readonly whiteoutRiskScore?: number | null;
  readonly sunriseGlowScore?: number | null;
  readonly sunsetGlowScore?: number | null;
  readonly astroPracticalScore?: number | null;
  readonly milkyWayPracticalScore?: number | null;
  readonly precipitationRiskLevel?: string | null;
  readonly transparencyGrade?: string | null;
  readonly confidenceLabel: string;
  readonly predictedJson: JsonValue;
};

export type ObservedOutcomeInput = CalibrationLocation & {
  readonly target: ForecastReplayTarget;
  readonly outcomeDate: string;
  readonly observationWindowStart?: string | null;
  readonly observationWindowEnd?: string | null;
  readonly observedResult: ObservedResult;
  readonly cloudSeaLevel?: CalibrationLevel | null;
  readonly whiteoutLevel?: WhiteoutLevel | null;
  readonly sunriseGlowLevel?: CalibrationLevel | null;
  readonly sunsetGlowLevel?: CalibrationLevel | null;
  readonly astroVisibilityLevel?: CalibrationLevel | null;
  readonly transparencyLevel?: TransparencyLevel | null;
  readonly rainImpactLevel?: RainImpactLevel | null;
  readonly notes?: string | null;
  readonly photoEvidenceUrl?: string | null;
  readonly source?: ObservedOutcomeSource;
  readonly createdBy?: string | null;
};

export type CalibrationComparisonClass =
  | "true_positive"
  | "true_negative"
  | "false_positive"
  | "false_negative"
  | "partial_match"
  | "unlabeled";

export type CalibrationComparison = {
  readonly replayResultId: string;
  readonly outcomeId?: string;
  readonly forecastDate: string;
  readonly target: ForecastReplayTarget;
  readonly predictedClass: "dedicated" | "cautious" | "nearby" | "not_recommended";
  readonly observedResult?: ObservedResult;
  readonly classification: CalibrationComparisonClass;
  readonly mismatchReason?: string;
};

export type CalibrationStatsInput = {
  readonly spotId?: string | null;
  readonly locationKey: string;
  readonly target: ForecastReplayTarget;
  readonly ruleVersion: string;
  readonly sampleCount: number;
  readonly successCount: number;
  readonly partialCount: number;
  readonly failCount: number;
  readonly hitRate: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly whiteoutFalsePositiveRate?: number | null;
  readonly bestWindowHitRate?: number | null;
  readonly recommendedTripHitRate?: number | null;
  readonly summaryJson: JsonValue;
};

export type CalibrationHint = {
  readonly spotId?: string | null;
  readonly locationKey: string;
  readonly target: ForecastReplayTarget;
  readonly sampleCount: number;
  readonly hitRate: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly confidenceAdjustment: number;
  readonly cautionNoteZh: string;
  readonly displayNoteZh: string;
};

export type HistoricalReplayInput = CalibrationLocation & {
  readonly startDate: string;
  readonly endDate: string;
  readonly target: ForecastReplayTarget;
  readonly sourceProvider?: HistoricalWeatherSourceProvider;
  readonly modelVersion?: string;
  readonly ruleVersion?: string;
  readonly timezone?: string;
};

export type HistoricalReplayOutput = {
  readonly run: ForecastReplayRunRecord;
  readonly resultCount: number;
  readonly results: readonly ForecastReplayResultRecord[];
};

export type StoredHistoricalWeatherResult = {
  readonly insertedCount: number;
  readonly skippedDuplicateCount: number;
  readonly samples: readonly HistoricalWeatherSampleRecord[];
};
