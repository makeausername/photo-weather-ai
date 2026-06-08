import type { Coordinates, NormalizedAerosolReference } from "@photo-weather/shared";
import { normalizeIsoTime, nullableRounded, toNumber } from "./normalization.js";
import { WeatherProviderError } from "./provider-error.js";
import type { AirQuality, WeatherRequestInput } from "./types.js";

export const openMeteoAirQualityDefaultEndpoint =
  "https://air-quality-api.open-meteo.com/v1/air-quality";
export const openMeteoAirQualityParserVersion = "open-meteo-air-quality-v1";

const hourlyFields = ["pm10", "pm2_5", "aerosol_optical_depth", "dust"] as const;

export type OpenMeteoAirQualityClientOptions = {
  readonly endpoint?: string;
  readonly timezone?: string;
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly fetcher?: typeof fetch;
};

export type OpenMeteoAirQualityRequest = {
  readonly coordinates: Coordinates;
  readonly forecastHours?: number;
  readonly timezone?: string;
};

export type OpenMeteoAirQualityFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
  readonly requestedForecastHours: number;
  readonly timezone: string;
};

export type OpenMeteoAirQualityUrlOptions = Required<
  Pick<OpenMeteoAirQualityClientOptions, "endpoint" | "timezone" | "timeoutMs" | "retryCount">
>;

export class OpenMeteoAirQualityClient {
  private readonly fetcher: typeof fetch;
  private readonly options: OpenMeteoAirQualityUrlOptions;

  constructor(options: OpenMeteoAirQualityClientOptions = {}) {
    this.options = {
      endpoint: options.endpoint ?? openMeteoAirQualityDefaultEndpoint,
      timezone: options.timezone ?? "Asia/Shanghai",
      timeoutMs: options.timeoutMs ?? 10000,
      retryCount: options.retryCount ?? 1,
    };
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchAirQuality(
    request: OpenMeteoAirQualityRequest,
  ): Promise<OpenMeteoAirQualityFetchResult<Record<string, unknown>>> {
    return this.fetchJson(buildOpenMeteoAirQualityUrl(this.options, request), request);
  }

  private async fetchJson(
    url: string,
    request: OpenMeteoAirQualityRequest,
  ): Promise<OpenMeteoAirQualityFetchResult<Record<string, unknown>>> {
    const attempts = Math.max(1, Math.round(this.options.retryCount) + 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          method: "GET",
          signal: controller.signal,
        });
        const text = await response.text();
        const latencyMs = Date.now() - startedAt;
        const body = parseJsonBody(text, latencyMs);

        if (response.status >= 500 && attempt < attempts) {
          lastError = openMeteoAirQualityError({
            errorCategory: "provider_error",
            messageZh: "区域大气参考数据暂不可用。",
            statusCode: response.status,
            latencyMs,
          });
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw openMeteoAirQualityError({
            errorCategory: "provider_error",
            messageZh: "区域大气参考数据暂不可用。",
            statusCode: response.status,
            latencyMs,
          });
        }

        return {
          statusCode: response.status,
          body,
          latencyMs,
          requestedForecastHours: requestedForecastHours(request.forecastHours),
          timezone: request.timezone ?? this.options.timezone,
        };
      } catch (error) {
        lastError = normalizeOpenMeteoAirQualityError(error, Date.now() - startedAt);
        if (attempt >= attempts) {
          throw lastError;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Open-Meteo air-quality request failed.");
  }
}

export function buildOpenMeteoAirQualityUrl(
  options: OpenMeteoAirQualityUrlOptions,
  request: OpenMeteoAirQualityRequest,
): string {
  const forecastHours = requestedForecastHours(request.forecastHours);
  const url = new URL(normalizeOpenMeteoAirQualityEndpoint(options.endpoint));
  url.searchParams.set("latitude", formatCoordinate(request.coordinates.latitude));
  url.searchParams.set("longitude", formatCoordinate(request.coordinates.longitude));
  url.searchParams.set("timezone", request.timezone ?? options.timezone);
  url.searchParams.set("hourly", hourlyFields.join(","));
  url.searchParams.set("forecast_hours", String(forecastHours));
  url.searchParams.set("forecast_days", String(daysFromHours(forecastHours)));
  url.searchParams.set("timeformat", "iso8601");

  return url.toString();
}

export async function getOpenMeteoAirQuality(
  input: WeatherRequestInput,
  options: {
    readonly client?: OpenMeteoAirQualityClient;
    readonly providerCode: string;
  },
): Promise<AirQuality> {
  if (!options.client) {
    return emptyAirQualityEnvelope(options.providerCode, input.forecastStart);
  }

  try {
    const result = await options.client.fetchAirQuality({
      coordinates: input.coordinates,
      forecastHours: input.hours,
      timezone: input.timezone,
    });
    return normalizeOpenMeteoAirQuality(result.body, {
      providerCode: options.providerCode,
      fallbackObservedAt: input.forecastStart,
      forecastHours: result.requestedForecastHours,
    });
  } catch {
    return emptyAirQualityEnvelope(options.providerCode, input.forecastStart);
  }
}

export function normalizeOpenMeteoAirQuality(
  input: unknown,
  options: {
    readonly providerCode: string;
    readonly fallbackObservedAt?: string;
    readonly forecastHours?: number;
  },
): AirQuality {
  const root = asRecord(input);
  const hourly = asRecord(root.hourly);
  const timeValues = getArray(hourly, "time");
  const offsetSeconds = toNumber(root.utc_offset_seconds) ?? 8 * 60 * 60;
  const sourceResolutionHours = resolveSourceResolutionHours(timeValues, offsetSeconds);
  const sourceResolution = sourceResolutionHours
    ? `${formatNumber(sourceResolutionHours, 1)}h`
    : "hourly";
  const rows = timeValues
    .slice(0, requestedForecastHours(options.forecastHours))
    .map((timeValue, index): NormalizedAerosolReference => {
      const pm25 = nullableRounded(at(hourly, "pm2_5", index));
      const pm10 = nullableRounded(at(hourly, "pm10", index));
      const aerosolOpticalDepth550 = nullableRounded(
        at(hourly, "aerosol_optical_depth", index),
        3,
      );
      const dust = nullableRounded(at(hourly, "dust", index));
      const availableCount = [pm25, pm10, aerosolOpticalDepth550, dust].filter(
        (value) => value !== null,
      ).length;

      return {
        aerosolOpticalDepth550,
        pm25,
        pm10,
        dust,
        aerosolObservedAt: normalizeIsoTime(timeValue, offsetSeconds),
        aerosolValidTime: normalizeIsoTime(timeValue, offsetSeconds),
        aerosolSourceResolution: sourceResolution,
        aerosolSourceResolutionHours: sourceResolutionHours,
        aerosolAvailability:
          availableCount >= 3 ? "available" : availableCount > 0 ? "partial" : "unavailable",
        aerosolConfidence: availableCount >= 3 ? "high" : availableCount > 0 ? "medium" : "low",
        aerosolSourceNoteZh: "区域大气参考，不代表机位实测。",
      };
    });
  const firstReal = rows.find((row) => row.aerosolAvailability !== "unavailable");
  const pm25 = firstReal?.pm25 ?? null;
  const pm10 = firstReal?.pm10 ?? null;

  return {
    provider: options.providerCode,
    observedAt:
      firstReal?.aerosolObservedAt ?? options.fallbackObservedAt ?? new Date(0).toISOString(),
    aqi: estimateAqiFromParticulate(pm25, pm10),
    category: categoryFromParticulate(pm25, pm10),
    pm25,
    pm10,
    hourly: rows,
  };
}

function emptyAirQualityEnvelope(providerCode: string, fallbackObservedAt?: string): AirQuality {
  return {
    provider: providerCode,
    observedAt: fallbackObservedAt ?? new Date(0).toISOString(),
    category: "good",
    hourly: [],
  };
}

function normalizeOpenMeteoAirQualityEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (/\/v1\/air-quality$/i.test(withScheme)) {
    return withScheme;
  }
  if (/\/air-quality$/i.test(withScheme)) {
    return withScheme;
  }
  const withoutVersion = withScheme.replace(/\/v1$/i, "");

  return `${withoutVersion}/v1/air-quality`;
}

function requestedForecastHours(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 72;
  }

  return Math.min(240, Math.max(1, Math.round(value)));
}

function daysFromHours(hours: number): number {
  return Math.min(10, Math.max(1, Math.ceil(hours / 24)));
}

function formatCoordinate(value: number): string {
  return formatNumber(value, 6);
}

function formatNumber(value: number, digits = 1): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function parseJsonBody(text: string, latencyMs: number): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw openMeteoAirQualityError({
      errorCategory: "parse_error",
      messageZh: "区域大气参考数据格式异常。",
      latencyMs,
    });
  }
}

function normalizeOpenMeteoAirQualityError(error: unknown, latencyMs: number): WeatherProviderError {
  if (error instanceof WeatherProviderError) {
    return error;
  }

  const name = error instanceof Error ? error.name : "";
  return openMeteoAirQualityError({
    errorCategory: name === "AbortError" ? "timeout" : "network",
    messageZh: name === "AbortError" ? "区域大气参考数据请求超时。" : "区域大气参考网络不可用。",
    latencyMs,
    cause: error,
  });
}

function openMeteoAirQualityError(
  options: Omit<
    ConstructorParameters<typeof WeatherProviderError>[0],
    "providerCode" | "providerLabelZh" | "dataMode"
  >,
): WeatherProviderError {
  return new WeatherProviderError({
    providerCode: "open_meteo",
    providerLabelZh: "Open-Meteo",
    dataMode: "real",
    ...options,
  });
}

function resolveSourceResolutionHours(
  timeValues: readonly unknown[],
  offsetSeconds: number,
): number | undefined {
  if (timeValues.length < 2) {
    return undefined;
  }

  const first = Date.parse(normalizeIsoTime(timeValues[0], offsetSeconds));
  const second = Date.parse(normalizeIsoTime(timeValues[1], offsetSeconds));
  if (!Number.isFinite(first) || !Number.isFinite(second) || second <= first) {
    return undefined;
  }

  return Math.round(((second - first) / (60 * 60 * 1000)) * 10) / 10;
}

function estimateAqiFromParticulate(pm25: number | null, pm10: number | null): number | null {
  if (pm25 === null && pm10 === null) {
    return null;
  }

  const pm25Score = pm25 === null ? 0 : Math.min(500, Math.round(pm25 * 2.2));
  const pm10Score = pm10 === null ? 0 : Math.min(500, Math.round(pm10 * 1.1));
  return Math.max(pm25Score, pm10Score);
}

function categoryFromParticulate(
  pm25: number | null,
  pm10: number | null,
): AirQuality["category"] {
  const aqi = estimateAqiFromParticulate(pm25, pm10);
  if (aqi === null) {
    return "good";
  }
  if (aqi <= 35) {
    return "excellent";
  }
  if (aqi <= 75) {
    return "good";
  }
  if (aqi <= 115) {
    return "light";
  }
  if (aqi <= 150) {
    return "moderate";
  }
  if (aqi <= 250) {
    return "heavy";
  }
  return "severe";
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Open-Meteo air-quality response must be an object.");
  }

  return input as Record<string, unknown>;
}

function getArray(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`Open-Meteo air-quality hourly.${key} must be an array.`);
  }

  return value;
}

function at(record: Record<string, unknown>, key: string, index: number): unknown {
  const value = record[key];
  return Array.isArray(value) ? value[index] : null;
}
