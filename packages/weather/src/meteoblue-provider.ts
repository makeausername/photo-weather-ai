import type {
  Coordinates,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import type {
  AirQuality,
  CurrentWeather,
  NormalizedWeatherData,
  WeatherAlert,
  WeatherRequestInput,
} from "./types.js";
import type { WeatherProvider } from "./provider.js";

const source = {
  providerCode: "meteoblue",
  displayName: "meteoblue",
  providerLabelZh: "meteoblue 专业增强",
  isMock: false,
  mode: "fixture",
} as const;

export type MeteoblueClientOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly packages: readonly string[];
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly fetcher?: typeof fetch;
};

export type MeteoblueForecastRequest = {
  readonly coordinates: Coordinates;
  readonly elevationMeters?: number;
  readonly timezone?: string;
};

export type MeteoblueConnectionTestResult = {
  readonly success: boolean;
  readonly statusCode: number;
  readonly latencyMs: number;
  readonly baseUrl: string;
  readonly packages: readonly string[];
  readonly sampleLocation: string;
  readonly messageZh: string;
};

type MeteoblueFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
};

const huangshanGuangmingdingWgs84 = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const satisfies Coordinates;

const defaultTestElevationMeters = 1860;

export function normalizeMeteoblueBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://my.meteoblue.com";
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme;
}

export function normalizeMeteobluePackages(packages: readonly string[]): readonly string[] {
  const normalized = packages
    .map((packageName) => packageName.trim())
    .filter((packageName) => /^[A-Za-z0-9-]+$/.test(packageName));

  return normalized.length > 0 ? [...new Set(normalized)] : ["basic-1h", "clouds-1h"];
}

export function buildMeteoblueForecastUrl(
  options: Pick<MeteoblueClientOptions, "apiKey" | "baseUrl" | "packages">,
  request: MeteoblueForecastRequest,
): string {
  const packages = normalizeMeteobluePackages(options.packages);
  const url = new URL(
    `/packages/${packages.join("_")}`,
    `${normalizeMeteoblueBaseUrl(options.baseUrl)}/`,
  );
  url.searchParams.set("lat", formatCoordinate(request.coordinates.latitude));
  url.searchParams.set("lon", formatCoordinate(request.coordinates.longitude));
  if (typeof request.elevationMeters === "number" && Number.isFinite(request.elevationMeters)) {
    url.searchParams.set("asl", String(Math.round(request.elevationMeters)));
  }
  url.searchParams.set("tz", request.timezone ?? "Asia/Shanghai");
  url.searchParams.set("format", "json");
  url.searchParams.set("apikey", options.apiKey);

  return url.toString();
}

export class MeteoblueClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: MeteoblueClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchForecast(
    request: MeteoblueForecastRequest,
  ): Promise<MeteoblueFetchResult<Record<string, unknown>>> {
    return this.fetchJson<Record<string, unknown>>(
      buildMeteoblueForecastUrl(this.options, request),
    );
  }

  async testConnection(): Promise<MeteoblueConnectionTestResult> {
    const result = await this.fetchForecast({
      coordinates: huangshanGuangmingdingWgs84,
      elevationMeters: defaultTestElevationMeters,
      timezone: "Asia/Shanghai",
    });
    const success =
      result.statusCode >= 200 && result.statusCode < 300 && !hasMeteoblueErrorPayload(result.body);

    return {
      success,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      baseUrl: normalizeMeteoblueBaseUrl(this.options.baseUrl),
      packages: normalizeMeteobluePackages(this.options.packages),
      sampleLocation: "黄山光明顶",
      messageZh: success
        ? "meteoblue 连接测试通过。"
        : `meteoblue 连接测试未通过，HTTP 状态码：${result.statusCode}。`,
    };
  }

  private async fetchJson<TBody>(url: string): Promise<MeteoblueFetchResult<TBody>> {
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
          lastError = new Error(`meteoblue upstream status ${response.status}`);
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

    throw lastError instanceof Error ? lastError : new Error("meteoblue request failed.");
  }
}

export class MeteoblueProvider implements WeatherProvider {
  readonly source = source;

  async getCurrentWeather(_input: WeatherRequestInput): Promise<CurrentWeather> {
    throw new Error(
      "meteoblue real weather calls are not enabled in Weather Intelligence Core V1.",
    );
  }

  async getHourlyForecast(
    _input: WeatherRequestInput,
  ): Promise<readonly NormalizedHourlyWeather[]> {
    return [];
  }

  async getDailyForecast(_input: WeatherRequestInput): Promise<readonly NormalizedDailyWeather[]> {
    return [];
  }

  async getWeatherAlerts(_input: WeatherRequestInput): Promise<readonly WeatherAlert[]> {
    return [];
  }

  async getAirQuality(_input: WeatherRequestInput): Promise<AirQuality> {
    throw new Error("meteoblue air quality calls are not enabled in Weather Intelligence Core V1.");
  }

  normalizeHourlyWeather(_input: unknown): readonly NormalizedHourlyWeather[] {
    return [];
  }

  normalizeDailyWeather(_input: unknown): readonly NormalizedDailyWeather[] {
    return [];
  }

  normalizeWeatherData(_input: unknown): NormalizedWeatherData {
    return {
      hourly: [],
      daily: [],
      alerts: [],
      providerCode: source.providerCode,
      providerLabelZh: source.providerLabelZh,
      dataMode: source.mode,
      generatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      noticeZh: "专业增强：meteoblue 未启用",
      missingFields: [],
      estimatedFields: [],
    };
  }
}

function hasMeteoblueErrorPayload(body: Record<string, unknown>): boolean {
  const message = body.message;
  return (
    typeof body.error === "string" ||
    typeof body.error_message === "string" ||
    (typeof message === "string" && /error|invalid|unauthorized/i.test(message))
  );
}

function parseJsonBody<TBody>(text: string): TBody {
  try {
    return JSON.parse(text) as TBody;
  } catch {
    return {} as TBody;
  }
}

function formatCoordinate(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(6).replace(/\.?0+$/, "");
}
