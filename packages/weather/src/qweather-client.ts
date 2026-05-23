import type { Coordinates } from "@photo-weather/shared";

export type QWeatherUnit = "metric" | "imperial";

export type QWeatherClientOptions = {
  readonly apiKey: string;
  readonly apiHost: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly language: string;
  readonly unit: QWeatherUnit;
  readonly fetcher?: typeof fetch;
};

export type QWeatherRequestOptions = Pick<
  QWeatherClientOptions,
  "apiKey" | "apiHost" | "language" | "unit"
>;

export type QWeatherWeatherNowPayload = {
  readonly code?: string;
  readonly updateTime?: string;
  readonly now?: {
    readonly obsTime?: string;
    readonly temp?: string;
    readonly feelsLike?: string;
    readonly icon?: string;
    readonly text?: string;
    readonly wind360?: string;
    readonly windDir?: string;
    readonly windScale?: string;
    readonly windSpeed?: string;
    readonly humidity?: string;
    readonly precip?: string;
    readonly pressure?: string;
    readonly vis?: string;
    readonly cloud?: string;
    readonly dew?: string;
  };
};

export type QWeatherConnectionTestResult = {
  readonly success: boolean;
  readonly statusCode: number;
  readonly qweatherCode?: string;
  readonly location: string;
  readonly observedWeatherSummary?: string;
  readonly latencyMs: number;
  readonly messageZh: string;
};

type QWeatherFetchResult<TBody> = {
  readonly statusCode: number;
  readonly body: TBody;
  readonly latencyMs: number;
};

const defaultTestLocation = "118.1718,30.1328";

export function normalizeQWeatherApiHost(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const input = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(input);
    if (hasScheme && url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }

    return url.host.replace(/\/+$/, "").toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

export function buildQWeatherBaseUrl(apiHost: string): string {
  const normalizedHost = normalizeQWeatherApiHost(apiHost);
  if (!normalizedHost) {
    throw new Error("QWeather API Host is required.");
  }

  return `https://${normalizedHost}`;
}

export function maskQWeatherApiHost(apiHost: string | null | undefined): string {
  const normalizedHost = normalizeQWeatherApiHost(apiHost);
  if (!normalizedHost) {
    return "";
  }

  const [firstLabel, ...rest] = normalizedHost.split(".");
  if (!firstLabel || rest.length === 0) {
    return normalizedHost.length <= 8
      ? "****"
      : `${normalizedHost.slice(0, 4)}****${normalizedHost.slice(-4)}`;
  }

  const maskedLabel =
    firstLabel.length <= 4
      ? `${firstLabel.slice(0, 1)}***`
      : `${firstLabel.slice(0, 4)}***`;
  return `${maskedLabel}.${rest.join(".")}`;
}

export function qWeatherUnitToRequestParam(unit: QWeatherUnit): "m" | "i" {
  return unit === "imperial" ? "i" : "m";
}

export function formatQWeatherLocation(coordinates: Coordinates): string {
  return `${formatCoordinate(coordinates.longitude)},${formatCoordinate(coordinates.latitude)}`;
}

export function buildQWeatherRequestUrl(
  options: QWeatherRequestOptions,
  path: string,
  params: Record<string, string | number | boolean | undefined>,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${buildQWeatherBaseUrl(options.apiHost)}${normalizedPath}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("key", options.apiKey);
  url.searchParams.set("lang", options.language);
  url.searchParams.set("unit", qWeatherUnitToRequestParam(options.unit));

  return url.toString();
}

export class QWeatherClient {
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: QWeatherClientOptions) {
    this.fetcher = options.fetcher ?? fetch;
  }

  async fetchWeatherNow(location: string): Promise<QWeatherFetchResult<QWeatherWeatherNowPayload>> {
    return this.fetchJson<QWeatherWeatherNowPayload>("/v7/weather/now", { location });
  }

  async testConnection(location = defaultTestLocation): Promise<QWeatherConnectionTestResult> {
    const result = await this.fetchWeatherNow(location);
    const qweatherCode = typeof result.body.code === "string" ? result.body.code : undefined;
    const observedWeatherSummary = summarizeWeatherNow(result.body);
    const success = result.statusCode >= 200 && result.statusCode < 300 && qweatherCode === "200";

    return {
      success,
      statusCode: result.statusCode,
      qweatherCode,
      location,
      observedWeatherSummary,
      latencyMs: result.latencyMs,
      messageZh: success
        ? "和风天气连接测试通过。"
        : `和风天气连接测试未通过，返回码：${qweatherCode ?? result.statusCode}。`,
    };
  }

  private async fetchJson<TBody>(
    path: string,
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<QWeatherFetchResult<TBody>> {
    const url = buildQWeatherRequestUrl(this.options, path, params);
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
          lastError = new Error(`QWeather upstream status ${response.status}`);
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

    throw lastError instanceof Error ? lastError : new Error("QWeather request failed.");
  }
}

function parseJsonBody<TBody>(text: string): TBody {
  try {
    return JSON.parse(text) as TBody;
  } catch {
    return {} as TBody;
  }
}

function summarizeWeatherNow(payload: QWeatherWeatherNowPayload): string | undefined {
  const now = payload.now;
  if (!now) {
    return undefined;
  }

  const parts = [
    typeof now.text === "string" && now.text.trim() ? now.text.trim() : undefined,
    typeof now.temp === "string" && now.temp.trim() ? `${now.temp.trim()}°C` : undefined,
    typeof now.humidity === "string" && now.humidity.trim()
      ? `湿度 ${now.humidity.trim()}%`
      : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join("，") : undefined;
}

function formatCoordinate(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(6).replace(/\.?0+$/, "");
}
