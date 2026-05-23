import { z } from "zod";
import type {
  AstroCalculationBasis,
  AstroSummary,
  AstroWindow,
  AstroWindowBundle,
  ForecastCalendarDayInfo,
  ForecastHorizon,
  MoonAltitudeSample,
  MoonImpactLevel,
} from "@photo-weather/shared";

export const DEFAULT_ASTRO_SERVICE_URL = "http://127.0.0.1:4100";
export const ASTRO_SERVICE_TIMEOUT_ENV = "ASTRO_SERVICE_TIMEOUT_MS";
export const DEFAULT_ASTRO_SERVICE_TIMEOUT_MS_LOCAL = 45_000;
export const DEFAULT_ASTRO_SERVICE_TIMEOUT_MS_PRODUCTION = 30_000;

export const astroServiceUnavailableMessage =
  "天文计算服务暂不可用，无法生成精确的星空银河窗口。请确认本地天文服务已启动。";

export const astroServiceInvalidResponseMessage =
  "天文计算结果格式异常，请检查天文服务版本是否与主程序匹配。";

export const astroServiceUrlMissingMessage = "天文计算服务地址未配置，请检查 ASTRO_SERVICE_URL。";
export const astroServiceTimeoutMessage =
  "天文计算服务响应超时，请稍后重试或提高 ASTRO_SERVICE_TIMEOUT_MS。";

export type AstroServiceConfig = {
  readonly enabled: boolean;
  readonly configuredUrl: string | null;
  readonly resolvedUrl: string;
  readonly logUrl: string;
  readonly timeoutMs: number;
  readonly envLocalLoaded: boolean;
  readonly envSource: string;
};

export type AstroServiceLogger = {
  readonly info?: (details: Record<string, unknown>, message?: string) => void;
  readonly warn?: (details: Record<string, unknown>, message?: string) => void;
  readonly error?: (details: Record<string, unknown>, message?: string) => void;
  readonly debug?: (details: Record<string, unknown>, message?: string) => void;
};

export type AstroServiceErrorDiagnostics = {
  readonly url: string;
  readonly status?: number;
  readonly elapsedMs?: number;
  readonly timeoutMs?: number;
  readonly timedOut?: boolean;
  readonly responseBodyExcerpt?: string;
  readonly upstreamErrorName?: string;
  readonly upstreamErrorMessage?: string;
  readonly parseErrorName?: string;
  readonly parseErrorMessage?: string;
};

export type AstroServiceFailureKind = "unavailable" | "invalid_response" | "timeout";

export class AstroServiceClientError extends Error {
  readonly kind: AstroServiceFailureKind;
  readonly diagnostics: AstroServiceErrorDiagnostics;
  override readonly cause?: unknown;

  constructor(
    kind: AstroServiceFailureKind,
    message: string,
    diagnostics: AstroServiceErrorDiagnostics,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AstroServiceClientError";
    this.kind = kind;
    this.diagnostics = diagnostics;
    this.cause = cause;
  }
}

const optionalIsoStringSchema = z.string().datetime({ offset: true }).nullable().optional();
const moonImpactLevelSchema = z.enum(["low", "medium", "high"]);

const moonAltitudeSampleSchema = z.object({
  time: z.string().datetime({ offset: true }),
  altitude: z.number().finite(),
  azimuth: z.number().finite().optional(),
});

const dailySunSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sunrise: optionalIsoStringSchema,
  sunset: optionalIsoStringSchema,
  solarNoon: optionalIsoStringSchema,
  civilDawn: optionalIsoStringSchema,
  civilDusk: optionalIsoStringSchema,
  nauticalDawn: optionalIsoStringSchema,
  nauticalDusk: optionalIsoStringSchema,
  astronomicalDawn: optionalIsoStringSchema,
  astronomicalDusk: optionalIsoStringSchema,
  sunriseAzimuth: z.number().finite().nullable().optional(),
  sunsetAzimuth: z.number().finite().nullable().optional(),
});

const dailyMoonSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moonPhaseValue: z.number().finite(),
  moonPhaseNameZh: z.string().min(1),
  moonIllumination: z.number().min(0).max(1),
  waxingOrWaning: z.enum(["waxing", "waning", "unknown"]),
  moonrise: optionalIsoStringSchema,
  moonset: optionalIsoStringSchema,
  moonAltitudeByHour: z.array(moonAltitudeSampleSchema),
  moonImpactLevel: moonImpactLevelSchema,
  moonImpactScore: z.number().finite().min(0).max(100),
  moonImpactReasonsZh: z.array(z.string().min(1)),
});

const astronomicalNightWindowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().nonnegative(),
  noteZh: z.string().min(1),
});

const moonlessNightWindowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().nonnegative(),
  reasonZh: z.string().min(1),
});

const candidateWindowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  bestTime: optionalIsoStringSchema,
  minAltitude: z.number().finite(),
  maxAltitude: z.number().finite(),
  directionZh: z.string().min(1),
  confidenceLevel: z.enum(["low", "medium", "high"]),
  noteZh: z.string().min(1),
});

const recommendedWindowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  bestTime: optionalIsoStringSchema,
  durationMinutes: z.number().int().nonnegative(),
  directionZh: z.string().min(1),
  moonImpactLevel: moonImpactLevelSchema,
  galacticCenterMaxAltitude: z.number().finite(),
  reasonZh: z.string().min(1),
  limitationsZh: z.array(z.string().min(1)),
});

const astroServiceResponseSchema = z.object({
  forecastStart: z.string().datetime({ offset: true }),
  forecastEnd: z.string().datetime({ offset: true }),
  targetDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  sun: z.object({
    daily: z.array(dailySunSchema),
  }),
  moon: z.object({
    daily: z.array(dailyMoonSchema),
    altitudeByHour: z.array(moonAltitudeSampleSchema),
  }),
  night: z.object({
    astronomicalNightWindows: z.array(astronomicalNightWindowSchema),
    moonlessNightWindows: z.array(moonlessNightWindowSchema),
  }),
  milkyWay: z.object({
    candidateWindows: z.array(candidateWindowSchema),
    recommendedWindows: z.array(recommendedWindowSchema),
    directionSummaryZh: z.string().min(1),
    calculationNoteZh: z.string().min(1),
  }),
  calculationBasis: z.object({
    ephemerisFileName: z.string().min(1),
    coordinateSystem: z.literal("WGS84"),
    timezone: z.string().min(1),
    elevationMeters: z.number().finite().nullable().optional(),
    generatedAt: z.string().datetime({ offset: true }),
    computeElapsedMs: z.number().finite().nonnegative().optional(),
    samplingResolutionMinutes: z
      .object({
        sunCrossing: z.number().int().positive().optional(),
        solarNoon: z.number().int().positive().optional(),
        moonAltitude: z.number().int().positive().optional(),
        moonlessWindow: z.number().int().positive().optional(),
        moonImpact: z.number().int().positive().optional(),
        galacticCenter: z.number().int().positive().optional(),
      })
      .optional(),
  }),
});

export type AstroServiceCalculationResponse = z.infer<typeof astroServiceResponseSchema>;

export type AstroServiceCalculateInput = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters?: number;
  readonly timezone: string;
  readonly horizon: ForecastHorizon;
  readonly startDateTime: string;
};

export type AstroServiceClientLike = {
  calculate(input: AstroServiceCalculateInput): Promise<AstroServiceCalculationResponse>;
};

export type ForecastAstroServiceData = {
  readonly astroSummaries: readonly AstroSummary[];
  readonly astroWindowBundle: AstroWindowBundle;
  readonly astroCalculationBasis: AstroCalculationBasis;
  readonly astroDataSourceLabelZh: string;
};

export type AstroServiceClientOptions = {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: AstroServiceLogger;
};

export class AstroServiceClient implements AstroServiceClientLike {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly logger?: AstroServiceLogger;

  constructor(options: AstroServiceClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_ASTRO_SERVICE_URL);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? resolveAstroServiceTimeoutMs(options.env);
    this.logger = options.logger;
  }

  async calculate(input: AstroServiceCalculateInput): Promise<AstroServiceCalculationResponse> {
    const requestUrl = `${this.baseUrl}/astro/calculate`;
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      logInfo(
        this.logger,
        {
          url: sanitizeAstroServiceUrlForLog(requestUrl),
          timeoutMs: this.timeoutMs,
          payload: summarizeAstroServicePayload(input),
        },
        `Calling astro-service calculate endpoint: ${sanitizeAstroServiceUrlForLog(requestUrl)}`,
      );

      const response = await this.fetchImpl(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const elapsedMs = Date.now() - startedAt;
      const responseText = await response.text();
      const responseBodyExcerpt = safeResponseExcerpt(responseText);

      logInfo(
        this.logger,
        {
          url: sanitizeAstroServiceUrlForLog(requestUrl),
          status: response.status,
          elapsedMs,
          timeoutMs: this.timeoutMs,
          timedOut: false,
        },
        "Astro-service response received",
      );

      if (!response.ok) {
        throw new AstroServiceClientError("unavailable", astroServiceUnavailableMessage, {
          url: sanitizeAstroServiceUrlForLog(requestUrl),
          status: response.status,
          elapsedMs,
          timeoutMs: this.timeoutMs,
          timedOut: false,
          responseBodyExcerpt,
          upstreamErrorName: "AstroServiceHttpError",
          upstreamErrorMessage: `Astro service responded with HTTP ${response.status}`,
        });
      }

      let responseJson: unknown;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch (parseError) {
        const normalizedError = normalizeError(parseError);
        logError(
          this.logger,
          {
            url: sanitizeAstroServiceUrlForLog(requestUrl),
            status: response.status,
            elapsedMs,
            timeoutMs: this.timeoutMs,
            timedOut: false,
            parseErrorName: normalizedError.name,
            parseErrorMessage: normalizedError.message,
            responseBodyExcerpt,
          },
          "Astro-service JSON parse failed",
        );
        throw new AstroServiceClientError(
          "invalid_response",
          astroServiceInvalidResponseMessage,
          {
            url: sanitizeAstroServiceUrlForLog(requestUrl),
            status: response.status,
            elapsedMs,
            timeoutMs: this.timeoutMs,
            timedOut: false,
            responseBodyExcerpt,
            parseErrorName: normalizedError.name,
            parseErrorMessage: normalizedError.message,
          },
          parseError,
        );
      }

      const parsed = astroServiceResponseSchema.safeParse(responseJson);
      if (!parsed.success) {
        logError(
          this.logger,
          {
            url: sanitizeAstroServiceUrlForLog(requestUrl),
            status: response.status,
            elapsedMs,
            timeoutMs: this.timeoutMs,
            timedOut: false,
            validationIssues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
            responseBodyExcerpt,
          },
          "Astro-service response validation failed",
        );
        throw new AstroServiceClientError(
          "invalid_response",
          astroServiceInvalidResponseMessage,
          {
            url: sanitizeAstroServiceUrlForLog(requestUrl),
            status: response.status,
            elapsedMs,
            timeoutMs: this.timeoutMs,
            timedOut: false,
            responseBodyExcerpt,
            upstreamErrorName: parsed.error.name,
            upstreamErrorMessage: parsed.error.message,
          },
          parsed.error,
        );
      }

      logInfo(
        this.logger,
        {
          url: sanitizeAstroServiceUrlForLog(requestUrl),
          status: response.status,
          elapsedMs,
          timeoutMs: this.timeoutMs,
          timedOut: false,
          containsSun: Boolean(parsed.data.sun),
          containsMoon: Boolean(parsed.data.moon),
          containsNight: Boolean(parsed.data.night),
          containsMilkyWay: Boolean(parsed.data.milkyWay),
          containsCalculationBasis: Boolean(parsed.data.calculationBasis),
        },
        "Astro-service response parsed",
      );

      return parsed.data;
    } catch (error) {
      if (error instanceof AstroServiceClientError) {
        throw error;
      }
      const normalizedError = normalizeError(error);
      const elapsedMs = Date.now() - startedAt;
      const requestTimedOut = timedOut || normalizedError.name === "AbortError";
      logError(
        this.logger,
        {
          url: sanitizeAstroServiceUrlForLog(requestUrl),
          elapsedMs,
          timeoutMs: this.timeoutMs,
          timedOut: requestTimedOut,
          errorName: normalizedError.name,
          errorMessage: normalizedError.message,
          stack: normalizedError.stack,
        },
        "Astro-service request failed",
      );
      throw new AstroServiceClientError(
        requestTimedOut ? "timeout" : "unavailable",
        requestTimedOut ? astroServiceTimeoutMessage : astroServiceUnavailableMessage,
        {
          url: sanitizeAstroServiceUrlForLog(requestUrl),
          elapsedMs,
          timeoutMs: this.timeoutMs,
          timedOut: requestTimedOut,
          upstreamErrorName: normalizedError.name,
          upstreamErrorMessage: normalizedError.message,
        },
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function mapAstroServiceResponseToForecastData(
  response: AstroServiceCalculationResponse,
  calendarDays: readonly ForecastCalendarDayInfo[],
): ForecastAstroServiceData {
  const moonAltitudeSamples: readonly MoonAltitudeSample[] = response.moon.altitudeByHour;
  const astroSummaries = response.targetDates.map((date) => {
    const sun = response.sun.daily.find((item) => item.date === date);
    const moon = response.moon.daily.find((item) => item.date === date);
    const night = response.night.astronomicalNightWindows.find((item) => item.date === date);
    const candidate = response.milkyWay.candidateWindows.find((item) => item.date === date);
    const calendarDay = calendarDays.find((item) => item.date === date);

    if (!sun || !moon) {
      throw new AstroServiceClientError("invalid_response", astroServiceInvalidResponseMessage, {
        url: "astro-service-response",
        upstreamErrorName: "AstroServiceMappingError",
        upstreamErrorMessage: `Missing sun or moon daily entry for ${date}`,
      });
    }

    const moonAltitudeByHour = moonAltitudeRecord(moon.moonAltitudeByHour);
    const moonCalculationNoteZh = "月相、月出月落和逐小时月亮高度由本地天文服务计算。";

    return {
      date,
      timezone: response.calculationBasis.timezone,
      sunrise: sun.sunrise ?? undefined,
      sunset: sun.sunset ?? undefined,
      solarNoon: sun.solarNoon ?? undefined,
      sunriseAzimuth: sun.sunriseAzimuth ?? undefined,
      sunsetAzimuth: sun.sunsetAzimuth ?? undefined,
      civilDawn: sun.civilDawn ?? undefined,
      civilDusk: sun.civilDusk ?? undefined,
      nauticalDawn: sun.nauticalDawn ?? undefined,
      nauticalDusk: sun.nauticalDusk ?? undefined,
      astronomicalDawn: sun.astronomicalDawn ?? undefined,
      astronomicalDusk: sun.astronomicalDusk ?? undefined,
      astronomicalNightStart: night?.start,
      astronomicalNightEnd: night?.end,
      moonPhase: moon.moonPhaseValue,
      moonPhaseNameZh: moon.moonPhaseNameZh,
      moonIllumination: moon.moonIllumination,
      waxingOrWaning: moon.waxingOrWaning,
      lunarDateText: calendarDay?.lunarDateText ?? "",
      solarTerm: calendarDay?.solarTerm,
      moonrise: moon.moonrise ?? undefined,
      moonset: moon.moonset ?? undefined,
      moonAltitudeByHour,
      moonAltitudeSamples,
      moonImpactLevel: moon.moonImpactLevel,
      moonImpactScore: moon.moonImpactScore,
      moonImpactReasonsZh: moon.moonImpactReasonsZh,
      calculationNoteZh: moonCalculationNoteZh,
      moonInfo: {
        moonPhase: moon.moonPhaseValue,
        moonPhaseNameZh: moon.moonPhaseNameZh,
        moonIllumination: moon.moonIllumination,
        waxingOrWaning: moon.waxingOrWaning,
        lunarDateText: calendarDay?.lunarDateText ?? "",
        solarTerm: calendarDay?.solarTerm,
        moonrise: moon.moonrise ?? undefined,
        moonset: moon.moonset ?? undefined,
        moonAltitudeByHour,
        moonAltitudeSamples,
        calculationNoteZh: moonCalculationNoteZh,
      },
      milkyWayWindowStart: candidate?.start,
      milkyWayWindowEnd: candidate?.end,
      milkyWayBestTime: candidate?.bestTime ?? undefined,
      milkyWayDirection: candidate?.directionZh,
      milkyWayGalacticCenterAltitude: candidate?.maxAltitude,
      milkyWayCalculationPrecision: "skyfield",
      milkyWayVisibilityLevel: candidate
        ? visibilityLevelFromConfidence(candidate.confidenceLevel)
        : "unavailable",
      milkyWayNoteZh: response.milkyWay.calculationNoteZh,
    } satisfies AstroSummary;
  });

  return {
    astroSummaries,
    astroWindowBundle: {
      astronomicalNightWindows: response.night.astronomicalNightWindows.map((window) => ({
        type: "astronomical_night",
        labelZh: "天文黑夜",
        date: window.date,
        start: window.start,
        end: window.end,
        durationMinutes: window.durationMinutes,
        score: 72,
        riskTags: [],
        noteZh: window.noteZh,
      })),
      moonlessNightWindows: response.night.moonlessNightWindows.map((window) => ({
        type: "moonless_night",
        labelZh: "无月黑夜",
        date: window.date,
        start: window.start,
        end: window.end,
        durationMinutes: window.durationMinutes,
        score: 78,
        riskTags: ["月光较低"],
        noteZh: window.reasonZh,
      })),
      milkyWayCandidateWindows: response.milkyWay.candidateWindows.map(mapCandidateWindow),
      recommendedMilkyWayWindows: response.milkyWay.recommendedWindows.map(mapRecommendedWindow),
    },
    astroCalculationBasis: {
      ephemerisFileName: response.calculationBasis.ephemerisFileName,
      coordinateSystem: response.calculationBasis.coordinateSystem,
      timezone: response.calculationBasis.timezone,
      elevationMeters: response.calculationBasis.elevationMeters ?? undefined,
      generatedAt: response.calculationBasis.generatedAt,
      computeElapsedMs: response.calculationBasis.computeElapsedMs,
      samplingResolutionMinutes: response.calculationBasis.samplingResolutionMinutes,
    },
    astroDataSourceLabelZh: "本地天文服务计算",
  };
}

function mapCandidateWindow(
  window: AstroServiceCalculationResponse["milkyWay"]["candidateWindows"][number],
): AstroWindow {
  return {
    type: "milky_way_candidate",
    labelZh: "银河候选窗口",
    date: window.date,
    start: window.start,
    end: window.end,
    durationMinutes: durationMinutes(window.start, window.end),
    score: candidateScore(window.confidenceLevel, window.maxAltitude),
    riskTags: [],
    noteZh: window.noteZh,
    directionZh: window.directionZh,
    galacticCenterAltitude: window.maxAltitude,
  };
}

function mapRecommendedWindow(
  window: AstroServiceCalculationResponse["milkyWay"]["recommendedWindows"][number],
): AstroWindow {
  return {
    type: "recommended_milky_way",
    labelZh: "推荐银河窗口",
    date: window.date,
    start: window.start,
    end: window.end,
    durationMinutes: window.durationMinutes,
    score: recommendedScore(window.moonImpactLevel, window.galacticCenterMaxAltitude),
    riskTags: [moonImpactRiskTag(window.moonImpactLevel)],
    noteZh: `${window.reasonZh}${window.limitationsZh.length > 0 ? ` ${window.limitationsZh.join(" ")}` : ""}`,
    directionZh: window.directionZh,
    galacticCenterAltitude: window.galacticCenterMaxAltitude,
  };
}

function moonAltitudeRecord(
  samples: readonly z.infer<typeof moonAltitudeSampleSchema>[],
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    samples.map((sample) => [sample.time.slice(11, 13), sample.altitude]),
  ) as Readonly<Record<string, number>>;
}

function visibilityLevelFromConfidence(
  confidence: "low" | "medium" | "high",
): "unavailable" | "poor" | "fair" | "good" {
  if (confidence === "high") {
    return "good";
  }
  if (confidence === "medium") {
    return "fair";
  }
  return "poor";
}

function candidateScore(confidence: "low" | "medium" | "high", altitude: number): number {
  const base = confidence === "high" ? 78 : confidence === "medium" ? 66 : 52;
  return clampScore(base + Math.max(0, altitude - 15) * 0.6);
}

function recommendedScore(moonImpact: MoonImpactLevel, altitude: number): number {
  const moonScore = moonImpact === "low" ? 12 : moonImpact === "medium" ? -4 : -18;
  return clampScore(68 + Math.max(0, altitude - 15) * 0.8 + moonScore);
}

function moonImpactRiskTag(level: MoonImpactLevel): string {
  if (level === "low") {
    return "月光较低";
  }
  if (level === "medium") {
    return "月光中等";
  }
  return "月光偏强";
}

function durationMinutes(start: string, end: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return Math.round((endMs - startMs) / 60_000);
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function resolveAstroServiceConfig(
  env: NodeJS.ProcessEnv = process.env,
): AstroServiceConfig {
  const configuredUrl = env.ASTRO_SERVICE_URL?.trim() || null;
  const resolvedUrl = configuredUrl ? normalizeBaseUrl(configuredUrl) : "";
  const timeoutMs = resolveAstroServiceTimeoutMs(env);

  return {
    enabled: isAstroServiceEnabled(env.ENABLE_ASTRO_SERVICE),
    configuredUrl,
    resolvedUrl,
    logUrl: sanitizeAstroServiceUrlForLog(resolvedUrl),
    timeoutMs,
    envLocalLoaded: env.PHOTO_WEATHER_ENV_LOCAL_LOADED === "true",
    envSource: env.PHOTO_WEATHER_ENV_LOCAL_LOADED === "true" ? ".env.local" : "process.env",
  };
}

export function resolveAstroServiceTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const fallback = defaultAstroServiceTimeoutMs(env);
  const rawValue = env[ASTRO_SERVICE_TIMEOUT_ENV]?.trim();
  if (!rawValue) {
    return fallback;
  }

  if (!/^\d+$/.test(rawValue)) {
    return fallback;
  }

  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function defaultAstroServiceTimeoutMs(env: NodeJS.ProcessEnv): number {
  return env.NODE_ENV === "production"
    ? DEFAULT_ASTRO_SERVICE_TIMEOUT_MS_PRODUCTION
    : DEFAULT_ASTRO_SERVICE_TIMEOUT_MS_LOCAL;
}

export function isAstroServiceEnabled(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "enabled"
  );
}

export type AstroServiceDebugStatus = {
  readonly enabled: boolean;
  readonly url: string;
  readonly timeoutMs: number;
  readonly healthOk: boolean;
  readonly healthStatus: number | null;
  readonly timezoneAvailable?: boolean;
  readonly defaultTimezone?: string;
  readonly ephemerisAvailable?: boolean;
  readonly ephemerisFileName?: string;
  readonly lastError?: string;
  readonly envSource?: string;
};

export async function checkAstroServiceHealth(options: {
  readonly config: AstroServiceConfig;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}): Promise<AstroServiceDebugStatus> {
  const { config, fetchImpl = fetch, timeoutMs = 3_000 } = options;
  if (!config.enabled) {
    return {
      enabled: false,
      url: config.logUrl,
      timeoutMs: config.timeoutMs,
      healthOk: false,
      healthStatus: null,
      envSource: config.envSource,
    };
  }

  if (!config.resolvedUrl) {
    return {
      enabled: config.enabled,
      url: config.logUrl,
      timeoutMs: config.timeoutMs,
      healthOk: false,
      healthStatus: null,
      lastError: astroServiceUrlMissingMessage,
      envSource: config.envSource,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.resolvedUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const bodyText = await response.text();
    let healthOk = response.ok;
    let timezoneAvailable: boolean | undefined;
    let defaultTimezone: string | undefined;
    let ephemerisAvailable: boolean | undefined;
    let ephemerisFileName: string | undefined;
    try {
      const body = JSON.parse(bodyText) as {
        ok?: unknown;
        timezoneAvailable?: unknown;
        defaultTimezone?: unknown;
        ephemerisAvailable?: unknown;
        ephemerisFileName?: unknown;
      };
      if (typeof body.ok === "boolean") {
        healthOk = response.ok && body.ok;
      }
      if (typeof body.timezoneAvailable === "boolean") {
        timezoneAvailable = body.timezoneAvailable;
      }
      if (typeof body.defaultTimezone === "string") {
        defaultTimezone = body.defaultTimezone;
      }
      if (typeof body.ephemerisAvailable === "boolean") {
        ephemerisAvailable = body.ephemerisAvailable;
      }
      if (typeof body.ephemerisFileName === "string") {
        ephemerisFileName = body.ephemerisFileName;
      }
    } catch {
      // Non-JSON health output is still represented by status and excerpt below.
    }

    return {
      enabled: config.enabled,
      url: config.logUrl,
      timeoutMs: config.timeoutMs,
      healthOk,
      healthStatus: response.status,
      timezoneAvailable,
      defaultTimezone,
      ephemerisAvailable,
      ephemerisFileName,
      lastError: healthOk ? undefined : safeResponseExcerpt(bodyText),
      envSource: config.envSource,
    };
  } catch (error) {
    const normalizedError = normalizeError(error);
    return {
      enabled: config.enabled,
      url: config.logUrl,
      timeoutMs: config.timeoutMs,
      healthOk: false,
      healthStatus: null,
      lastError: `${normalizedError.name}: ${sanitizeLogText(normalizedError.message)}`,
      envSource: config.envSource,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function sanitizeAstroServiceUrlForLog(value: string | null | undefined): string {
  if (!value) {
    return "not configured";
  }

  try {
    const url = new URL(value);
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "<invalid-url>";
  }
}

function summarizeAstroServicePayload(input: AstroServiceCalculateInput): Record<string, unknown> {
  return {
    latitudePresent: Number.isFinite(input.latitudeWgs84),
    longitudePresent: Number.isFinite(input.longitudeWgs84),
    elevationPresent: Number.isFinite(input.elevationMeters),
    horizon: input.horizon,
    timezone: input.timezone,
    startDateTimePresent: Boolean(input.startDateTime),
  };
}

function safeResponseExcerpt(value: string, maxLength = 800): string {
  return sanitizeLogText(value).slice(0, maxLength);
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(
      /("(?:secretJson|maskedSecretJson|apiKey|api_key|token|authorization)"\s*:\s*)"[^"]*"/gi,
      '$1"[redacted]"',
    )
    .replace(/((?:apiKey|api_key|token|authorization|secret)=)[^&\s]+/gi, "$1[redacted]")
    .trim();
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function logInfo(
  logger: AstroServiceLogger | undefined,
  details: Record<string, unknown>,
  message: string,
): void {
  logger?.info?.(details, message);
}

function logError(
  logger: AstroServiceLogger | undefined,
  details: Record<string, unknown>,
  message: string,
): void {
  logger?.error?.(details, message);
}
