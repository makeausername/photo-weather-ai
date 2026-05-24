import type { Coordinates } from "@photo-weather/shared";

export type OpenMeteoMode = "free" | "customer";

export type OpenMeteoClientOptions = {
  readonly endpoint: string;
  readonly mode: OpenMeteoMode;
  readonly apiKey?: string;
  readonly timezone: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly modelPreference?: string;
  readonly fetcher?: typeof fetch;
};

export type OpenMeteoForecastRequest = {
  readonly coordinates: Coordinates;
  readonly hours?: number;
  readonly days?: number;
};

export type OpenMeteoFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
};

export type OpenMeteoConnectionTestResult = {
  readonly success: boolean;
  readonly statusCode: number;
  readonly latencyMs: number;
  readonly mode: OpenMeteoMode;
  readonly endpoint: string;
  readonly messageZh: string;
};

const hourlyFields = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "dew_point_2m",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "precipitation_probability",
  "precipitation",
  "visibility",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "weather_code",
] as const;

const currentFields = [
  "temperature_2m",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "weather_code",
] as const;

const dailyFields = [
  "weather_code",
  "temperature_2m_min",
  "temperature_2m_max",
  "precipitation_probability_max",
  "sunrise",
  "sunset",
] as const;

const huangshanGuangmingdingWgs84 = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const satisfies Coordinates;

export function buildOpenMeteoForecastUrl(
  options: Pick<
    OpenMeteoClientOptions,
    "endpoint" | "mode" | "apiKey" | "timezone" | "modelPreference"
  >,
  request: OpenMeteoForecastRequest,
): string {
  const url = new URL(`${normalizeOpenMeteoEndpoint(options.endpoint)}/forecast`);
  url.searchParams.set("latitude", formatCoordinate(request.coordinates.latitude));
  url.searchParams.set("longitude", formatCoordinate(request.coordinates.longitude));
  url.searchParams.set("timezone", options.timezone);
  url.searchParams.set("hourly", hourlyFields.join(","));
  url.searchParams.set("current", currentFields.join(","));
  url.searchParams.set("daily", dailyFields.join(","));
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("forecast_days", String(clampDays(request.days ?? daysFromHours(request.hours))));

  if (options.modelPreference) {
    url.searchParams.set("models", options.modelPreference);
  }
  if (options.mode === "customer" && options.apiKey) {
    url.searchParams.set("apikey", options.apiKey);
  }

  return url.toString();
}

export class OpenMeteoClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: OpenMeteoClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchForecast(
    request: OpenMeteoForecastRequest,
  ): Promise<OpenMeteoFetchResult<Record<string, unknown>>> {
    return this.fetchJson<Record<string, unknown>>(
      buildOpenMeteoForecastUrl(this.options, request),
    );
  }

  async testConnection(): Promise<OpenMeteoConnectionTestResult> {
    const result = await this.fetchForecast({
      coordinates: huangshanGuangmingdingWgs84,
      hours: 24,
      days: 1,
    });
    const success = result.statusCode >= 200 && result.statusCode < 300;

    return {
      success,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      mode: this.options.mode,
      endpoint: normalizeOpenMeteoEndpoint(this.options.endpoint),
      messageZh: success
        ? "Open-Meteo 连接测试通过。"
        : `Open-Meteo 连接测试未通过，HTTP 状态码：${result.statusCode}。`,
    };
  }

  private async fetchJson<TBody>(url: string): Promise<OpenMeteoFetchResult<TBody>> {
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
        const body = parseJsonBody<TBody>(text);
        const latencyMs = Date.now() - startedAt;

        if (response.status >= 500 && attempt < attempts) {
          lastError = new Error(`Open-Meteo upstream status ${response.status}`);
          continue;
        }

        return {
          statusCode: response.status,
          body,
          latencyMs,
        };
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          throw error;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Open-Meteo request failed.");
  }
}

function normalizeOpenMeteoEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const withoutVersion = withScheme.replace(/\/v1$/i, "");

  return `${withoutVersion}/v1`;
}

function daysFromHours(hours: number | undefined): number {
  if (!hours || !Number.isFinite(hours)) {
    return 1;
  }

  return Math.ceil(Math.max(1, hours) / 24);
}

function clampDays(days: number): number {
  return Math.min(16, Math.max(1, Math.round(days)));
}

function formatCoordinate(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(6).replace(/\.?0+$/, "");
}

function parseJsonBody<TBody>(text: string): TBody {
  try {
    return JSON.parse(text) as TBody;
  } catch {
    return {} as TBody;
  }
}
