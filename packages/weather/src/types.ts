import type {
  Coordinates,
  ForecastWeatherSourceSummary,
  NormalizedAerosolReference,
  NormalizedCurrentWeather,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  WeatherDataMode,
  ForecastHorizon,
  ForecastProviderRuntimeSnapshot,
  ForecastTarget,
  RollingProviderCoverageDiagnostics,
  WeatherFusionSummary,
  WeatherProviderTerrainMetadata,
} from "@photo-weather/shared";

export type WeatherProviderCode = "mock" | "qweather" | "open_meteo" | "meteoblue" | "unavailable";

export type WeatherProviderMode = WeatherDataMode;

export type WeatherDataSource = {
  readonly providerCode: WeatherProviderCode;
  readonly displayName: string;
  readonly providerLabelZh: string;
  readonly isMock: boolean;
  readonly mode: WeatherProviderMode;
};

export type WeatherCondition = "clear" | "partly_cloudy" | "cloudy" | "rain" | "snow" | "fog";

export type CurrentWeather = {
  readonly provider: string;
  readonly observedAt: string;
  readonly coordinates: Coordinates;
  readonly condition: WeatherCondition;
  readonly summary: string;
  readonly temperatureCelsius: number;
  readonly feelsLikeCelsius: number;
  readonly humidityPercent: number;
  readonly cloudCoverPercent: number;
  readonly windSpeedMetersPerSecond: number;
  readonly visibilityKilometers: number | null;
};

export type HourlyForecastPoint = {
  readonly startsAt: string;
  readonly condition: WeatherCondition;
  readonly temperatureCelsius: number;
  readonly precipitationProbabilityPercent: number;
  readonly cloudCoverPercent: number;
  readonly windSpeedMetersPerSecond: number;
  readonly visibilityKilometers: number;
};

export type HourlyForecast = {
  readonly provider: string;
  readonly generatedAt: string;
  readonly coordinates: Coordinates;
  readonly hours: readonly HourlyForecastPoint[];
};

export type DailyForecastPoint = {
  readonly date: string;
  readonly condition: WeatherCondition;
  readonly minTemperatureCelsius: number;
  readonly maxTemperatureCelsius: number;
  readonly sunriseAt: string;
  readonly sunsetAt: string;
};

export type DailyForecast = {
  readonly provider: string;
  readonly generatedAt: string;
  readonly coordinates: Coordinates;
  readonly days: readonly DailyForecastPoint[];
};

export type WeatherAlert = {
  readonly id: string;
  readonly level: "blue" | "yellow" | "orange" | "red";
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly endsAt?: string;
};

export type AirQuality = {
  readonly provider: string;
  readonly observedAt: string;
  readonly availability?: "available" | "partial" | "unavailable";
  readonly aqi?: number | null;
  readonly category?: "excellent" | "good" | "light" | "moderate" | "heavy" | "severe" | null;
  readonly pm25?: number | null;
  readonly pm10?: number | null;
  readonly hourly?: readonly NormalizedAerosolReference[];
};

export type WeatherDataBundle = {
  readonly current?: CurrentWeather;
  readonly currentWeather?: NormalizedCurrentWeather;
  readonly hourly: readonly NormalizedHourlyWeather[];
  readonly daily: readonly NormalizedDailyWeather[];
  readonly alerts: readonly WeatherAlert[];
  readonly airQuality?: AirQuality;
  readonly providerCode: WeatherProviderCode;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly generatedAt: string;
  readonly forecastStart?: string;
  readonly forecastEnd?: string;
  readonly noticeZh: string;
  readonly missingFields?: readonly string[];
  readonly estimatedFields?: readonly string[];
  readonly sourceSummaries?: readonly WeatherSourceSummary[];
  readonly conflictFlags?: readonly WeatherConflictFlag[];
  readonly missingDataNotes?: readonly string[];
  readonly confidenceByField?: WeatherConfidenceByField;
  readonly confidenceByTarget?: WeatherConfidenceByTarget;
  readonly fusionSummary?: WeatherFusionSummary;
  readonly providerRuntimeSnapshot?: readonly ForecastProviderRuntimeSnapshot[];
  readonly terrainMetadata?: WeatherProviderTerrainMetadata;
  readonly rollingProviderCoverage?: RollingProviderCoverageDiagnostics;
};

export type ForecastRequestOptions = {
  readonly hours?: number;
  readonly days?: number;
  readonly elevationMeters?: number;
  readonly horizon?: ForecastHorizon;
  readonly forecastStart?: string;
  readonly forecastEnd?: string;
  readonly forecastWindowAnchorStart?: string;
  readonly forecastWindowAnchorEnd?: string;
  readonly expectedRowCount?: number;
  readonly providerCoverageVersion?: string;
  readonly providerRequestStartLocal?: string;
  readonly providerRequestEndLocal?: string;
  readonly providerCoverageRule?: string;
  readonly targetDates?: readonly string[];
  readonly target?: ForecastTarget;
  readonly timezone?: string;
};

export type WeatherRequestInput = ForecastRequestOptions & {
  readonly coordinates: Coordinates;
};

export type NormalizedWeatherData = WeatherDataBundle;

export type WeatherSourceSummary = ForecastWeatherSourceSummary & {
  readonly providerCode: WeatherProviderCode;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
};

export type WeatherConflictSeverity = "low" | "medium" | "high";

export type WeatherConflictFlag = {
  readonly field: string;
  readonly time: string;
  readonly providers: readonly WeatherProviderCode[];
  readonly severity: WeatherConflictSeverity;
  readonly noteZh: string;
};

export type WeatherConfidenceByField = {
  readonly cloudTotal: number;
  readonly cloudLow: number;
  readonly cloudMid: number;
  readonly cloudHigh: number;
  readonly visibility: number;
  readonly humidity: number;
  readonly dewPoint: number;
  readonly wind: number;
  readonly precipitation: number;
  readonly pressure: number;
};

export type WeatherConfidenceByTarget = {
  readonly cloud_sea: number;
  readonly glow: number;
  readonly astro: number;
  readonly general: number;
};
