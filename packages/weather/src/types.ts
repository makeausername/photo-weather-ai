import type {
  Coordinates,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  WeatherDataMode,
  ForecastTarget,
} from "@photo-weather/shared";

export type WeatherProviderCode = "mock" | "qweather" | "open_meteo";

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
  readonly visibilityKilometers: number;
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
  readonly aqi: number;
  readonly category: "excellent" | "good" | "light" | "moderate" | "heavy" | "severe";
  readonly pm25: number;
  readonly pm10: number;
};

export type WeatherDataBundle = {
  readonly current?: CurrentWeather;
  readonly hourly: readonly NormalizedHourlyWeather[];
  readonly daily: readonly NormalizedDailyWeather[];
  readonly alerts: readonly WeatherAlert[];
  readonly airQuality?: AirQuality;
  readonly providerCode: WeatherProviderCode;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly generatedAt: string;
  readonly noticeZh: string;
};

export type ForecastRequestOptions = {
  readonly hours?: number;
  readonly days?: number;
  readonly forecastStart?: string;
  readonly forecastEnd?: string;
  readonly targetDates?: readonly string[];
  readonly target?: ForecastTarget;
  readonly timezone?: string;
};

export type WeatherRequestInput = ForecastRequestOptions & {
  readonly coordinates: Coordinates;
};

export type NormalizedWeatherData = WeatherDataBundle;
