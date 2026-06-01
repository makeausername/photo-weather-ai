import type {
  ForecastWeatherSourceSummary,
  ForecastWeatherSourceErrorCategory,
  WeatherDataMode,
} from "@photo-weather/shared";
import type { WeatherProviderCode } from "./types.js";

export type WeatherProviderErrorOptions = {
  readonly providerCode: WeatherProviderCode;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly errorCategory: ForecastWeatherSourceErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly sourceSummaryMetadata?: Partial<
    Pick<
      ForecastWeatherSourceSummary,
      | "availableFields"
      | "extractedFields"
      | "missingFields"
      | "topLevelKeys"
      | "packages"
      | "statusCode"
      | "latencyMs"
      | "sourceFamily"
      | "modelFamily"
      | "modelName"
      | "basis"
      | "requestedForecastHours"
      | "returnedHours"
      | "timezone"
      | "elevationBasis"
      | "parserVersion"
      | "diagnosticStatus"
      | "fallbackRequestUsed"
    >
  >;
  readonly cause?: unknown;
};

export class WeatherProviderError extends Error {
  readonly providerCode: WeatherProviderCode;
  readonly providerLabelZh: string;
  readonly dataMode: WeatherDataMode;
  readonly errorCategory: ForecastWeatherSourceErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly sourceSummaryMetadata?: WeatherProviderErrorOptions["sourceSummaryMetadata"];
  override readonly cause?: unknown;

  constructor(options: WeatherProviderErrorOptions) {
    super(options.messageZh);
    this.name = "WeatherProviderError";
    this.providerCode = options.providerCode;
    this.providerLabelZh = options.providerLabelZh;
    this.dataMode = options.dataMode;
    this.errorCategory = options.errorCategory;
    this.messageZh = options.messageZh;
    this.statusCode = options.statusCode;
    this.latencyMs = options.latencyMs;
    this.sourceSummaryMetadata = options.sourceSummaryMetadata;
    this.cause = options.cause;
  }
}

export function isWeatherProviderError(error: unknown): error is WeatherProviderError {
  return error instanceof WeatherProviderError;
}
