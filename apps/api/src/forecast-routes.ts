import { createHash } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  buildForecastDateRange,
  forecastDateRangeErrorMessage,
  resolveForecastWindowRange,
  resolveRollingHorizonProviderRequest,
  rollingHorizonProviderCoverageVersion,
} from "@photo-weather/calendar";
import { buildCalibrationLocationKey, findCalibrationHint } from "@photo-weather/calibration";
import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaPrecipitationSignalContext,
  buildTerrainTemperatureBasisContext,
  type ForecastCalculationResult,
  type ElevationSource,
  type ForecastQueryInput,
  type TerrainAnalysisSummary,
  type TerrainHorizonDirectionSample,
  forecastHorizonLabels,
  normalizeForecastQueryInput,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import {
  checkForecastAccess,
  getRuntimeProviderConfig,
  resolveUserForecastAccess,
  upgradeRequiredResponse,
  type AuthenticatedPrincipal,
  type DatabaseClient,
  type ForecastAccessStatus,
} from "@photo-weather/db";
import { buildForecastInputFromWeatherBundle, calculateForecast } from "@photo-weather/scoring";
import {
  MockTerrainProvider,
  type ElevationProvider,
  type TerrainElevationService,
  type TerrainProvider,
} from "@photo-weather/terrain";
import {
  createWeatherProvider,
  isWeatherProviderError,
  WeatherDataService,
  type WeatherProvider,
} from "@photo-weather/weather";
import { z, type ZodError } from "zod";
import { authenticateRequest, type AuthConfig } from "./auth-routes.js";
import type { WeatherDataServiceLike } from "./weather-provider.js";
import {
  AstroServiceClient,
  AstroServiceClientError,
  astroServiceInvalidResponseMessage,
  astroServiceTimeoutMessage,
  astroServiceUrlMissingMessage,
  astroServiceUnavailableMessage,
  checkAstroServiceHealth,
  mapAstroServiceResponseToForecastData,
  mapTerrainDemProfileToDirectionSample,
  resolveAstroServiceConfig,
  sanitizeAstroServiceUrlForLog,
  type AstroServiceClientLike,
  type AstroServiceConfig,
  type ForecastAstroServiceData,
} from "./astro-service-client.js";
import { createRuntimeElevationService } from "./elevation-service.js";

export type ForecastRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig?: AuthConfig;
  readonly weatherProvider?: WeatherProvider;
  readonly weatherDataService?: WeatherDataServiceLike;
  readonly terrainProvider?: TerrainProvider;
  readonly elevationProvider?: ElevationProvider;
  readonly elevationService?: TerrainElevationService;
  readonly astroServiceClient?: AstroServiceClientLike;
  readonly env?: NodeJS.ProcessEnv;
};

const defaultForecastCalculateCacheTtlMs = 5 * 60 * 1000;
const defaultForecastCalculateStaleIfErrorTtlMs = 30 * 60 * 1000;
const defaultForecastCalculateCacheMaxEntries = 256;
const defaultForecastCalculateRetryCount = 2;
const defaultForecastCalculateRetryDelayMs = 600;
const forecastTransientHttpStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const missingWgs84CoordinateErrorMessage = "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。";

const forecastCalculateRequestSchema = forecastQueryInputSchema.extend({
  elevationMeters: z.number().finite().nullable().optional(),
  timezone: z.string().trim().min(1).optional(),
  startDateTime: z.string().datetime({ offset: true }).optional(),
});

type ForecastCalculateRequest = z.infer<typeof forecastCalculateRequestSchema>;

type TtlCacheEntry<TValue> = {
  readonly value: TValue;
  readonly expiresAt: number;
  readonly createdAt: number;
};

function readPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  options: { readonly min?: number; readonly max?: number } = {},
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const integer = Math.floor(value);
  if (options.min !== undefined && integer < options.min) {
    return options.min;
  }
  if (options.max !== undefined && integer > options.max) {
    return options.max;
  }
  return integer;
}

function readNonNegativeIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  options: { readonly min?: number; readonly max?: number } = {},
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }

  const integer = Math.floor(value);
  if (options.min !== undefined && integer < options.min) {
    return options.min;
  }
  if (options.max !== undefined && integer > options.max) {
    return options.max;
  }
  return integer;
}

function readCachedValue<TValue>(
  cache: Map<string, TtlCacheEntry<TValue>>,
  key: string,
  now = Date.now(),
): TValue | undefined {
  const cached = cache.get(key);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cached);
  return cached.value;
}

function writeCachedValue<TValue>(
  cache: Map<string, TtlCacheEntry<TValue>>,
  key: string,
  value: TValue,
  ttlMs: number,
  maxEntries: number,
  now = Date.now(),
): void {
  cache.delete(key);
  cache.set(key, {
    value,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
  pruneCache(cache, maxEntries, now);
}

function pruneCache<TValue>(
  cache: Map<string, TtlCacheEntry<TValue>>,
  maxEntries: number,
  now = Date.now(),
): void {
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function roundOptionalCacheNumber(value: number | null | undefined, digits: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createForecastCalculateCacheKey(
  input: ForecastCalculateRequest,
  options: {
    readonly runtimeCacheSalt?: string;
    readonly rawTarget?: string | null;
    readonly access?: Pick<ForecastAccessStatus, "tier" | "activeProductCode" | "hasFullAccess">;
  } = {},
): string {
  const stableInput = {
    runtimeCacheSalt: options.runtimeCacheSalt ?? null,
    accessTier: options.access?.tier ?? "guest",
    accessProductCode: options.access?.activeProductCode ?? null,
    accessHasFullAccess: options.access?.hasFullAccess ?? false,
    rawTarget: options.rawTarget ?? input.target,
    name: input.name,
    source: input.source,
    coordinateSource: input.coordinateSource ?? null,
    horizon: input.horizon,
    target: input.target,
    timezone: input.timezone ?? null,
    startDateTime: input.startDateTime ?? null,
    latitudeGcj02: roundCoordinateForCache(input.latitudeGcj02),
    longitudeGcj02: roundCoordinateForCache(input.longitudeGcj02),
    latitudeWgs84: roundCoordinateForCache(input.latitudeWgs84),
    longitudeWgs84: roundCoordinateForCache(input.longitudeWgs84),
    elevationMeters: roundOptionalCacheNumber(input.elevationMeters, 2),
    elevationSource: input.elevationSource ?? null,
    elevationConfidence: input.elevationConfidence ?? null,
    locationId: input.locationId ?? null,
    photoSpotId: input.photoSpotId ?? null,
  };

  return `forecast-calculate:${createHash("sha256")
    .update(JSON.stringify(stableInput))
    .digest("hex")
    .slice(0, 32)}`;
}

async function createForecastCalculateRuntimeCacheSalt(options: {
  readonly dbClient?: DatabaseClient;
  readonly env: NodeJS.ProcessEnv;
}): Promise<string> {
  if (options.dbClient) {
    const providers = await Promise.all(
      (["qweather", "open_meteo", "meteoblue"] as const).map(async (providerCode) => {
        const provider = await getRuntimeProviderConfig("weather", providerCode, {
          client: options.dbClient,
        });
        return {
          providerCode,
          enabled: provider?.enabled ?? false,
          priority: provider?.priority ?? 0,
          updatedAt: provider?.updatedAt.toISOString() ?? null,
        };
      }),
    );
    return JSON.stringify({
      providers,
      openMeteoModelList: options.env.OPEN_METEO_MODEL_LIST ?? null,
      openMeteoModelPreference: options.env.OPEN_METEO_MODEL_PREFERENCE ?? null,
    });
  }

  return JSON.stringify({
    weatherProvider: options.env.WEATHER_PROVIDER ?? null,
    weatherProviderMode: options.env.WEATHER_PROVIDER_MODE ?? null,
    qweatherHost: options.env.QWEATHER_API_HOST ?? options.env.QWEATHER_BASE_URL ?? null,
    openMeteoEnabled: options.env.OPEN_METEO_ENABLED ?? null,
    openMeteoMode: options.env.OPEN_METEO_MODE ?? null,
    openMeteoBaseUrl: options.env.OPEN_METEO_BASE_URL ?? null,
    openMeteoCustomerEndpoint: options.env.OPEN_METEO_CUSTOMER_ENDPOINT ?? null,
    openMeteoModelList: options.env.OPEN_METEO_MODEL_LIST ?? null,
    openMeteoModelPreference: options.env.OPEN_METEO_MODEL_PREFERENCE ?? null,
    meteoblueBaseUrl: options.env.METEOBLUE_BASE_URL ?? null,
    meteobluePackages: options.env.METEOBLUE_PACKAGES ?? options.env.METEOBLUE_PACKAGE_NAME ?? null,
  });
}

function readRawForecastTarget(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const target = value.target;
  return typeof target === "string" && target.trim().length > 0 ? target.trim() : null;
}

async function resolveOptionalForecastPrincipal(input: {
  readonly request: FastifyRequest;
  readonly client?: DatabaseClient;
  readonly authConfig?: AuthConfig;
}): Promise<AuthenticatedPrincipal | null> {
  if (!input.authConfig) {
    return null;
  }
  if (!input.authConfig.adminAuthBypass && !input.request.headers.authorization) {
    return null;
  }
  try {
    return (await authenticateRequest(input.request, input.client, input.authConfig)).principal;
  } catch (error) {
    const authError = error as { readonly statusCode?: number };
    if (authError.statusCode === 401 || authError.statusCode === 403) {
      return null;
    }
    throw error;
  }
}

async function resolveForecastAccessForRequest(input: {
  readonly request: FastifyRequest;
  readonly client?: DatabaseClient;
  readonly authConfig?: AuthConfig;
  readonly env: NodeJS.ProcessEnv;
  readonly body: ForecastCalculateRequest;
  readonly reply: FastifyReply;
}): Promise<ForecastAccessStatus | null> {
  const serverNow = new Date();
  const forecastRange = buildForecastDateRange(input.body.horizon, {
    timezone: input.body.timezone,
    now: input.body.startDateTime ?? serverNow,
  });
  const principal = await resolveOptionalForecastPrincipal({
    request: input.request,
    client: input.client,
    authConfig: input.authConfig,
  });
  const access = await resolveUserForecastAccess({
    principal,
    client: input.client,
    env: input.env,
    now: serverNow,
  });
  const decision = checkForecastAccess({
    access,
    target: input.body.target,
    forecastStart: new Date(forecastRange.forecastStart),
    forecastEnd: new Date(forecastRange.forecastEnd),
    now: serverNow,
  });
  if (!decision.allowed) {
    input.reply.status(decision.statusCode ?? 402).send(upgradeRequiredResponse(access));
    return null;
  }
  return access;
}

type ForecastCalculationOptions = {
  readonly timezone?: string;
  readonly startDateTime?: string;
};

type ForecastCalculateCacheState = {
  readonly fresh: Map<string, TtlCacheEntry<ForecastCalculationResult>>;
  readonly stale: Map<string, TtlCacheEntry<ForecastCalculationResult>>;
  readonly inFlight: Map<string, Promise<ForecastCalculationResult>>;
  readonly freshTtlMs: number;
  readonly staleIfErrorTtlMs: number;
  readonly maxEntries: number;
};

type ForecastCalculationServices = {
  readonly weatherDataService: WeatherDataServiceLike;
  readonly terrainProvider: TerrainProvider;
  readonly elevationService: TerrainElevationService;
  readonly astroServiceClient: AstroServiceClientLike;
  readonly astroServiceConfig: AstroServiceConfig;
  readonly dbClient?: DatabaseClient;
};

type ForecastResilienceOptions = {
  readonly retryCount: number;
  readonly retryDelayMs: number;
};

type ForecastTransientClassification = {
  readonly transient: boolean;
  readonly category: string;
  readonly statusCode?: number;
};

function sendZodError(reply: FastifyReply, error: ZodError): FastifyReply {
  if (
    error.issues.some(
      (issue) => issue.path[0] === "latitudeWgs84" || issue.path[0] === "longitudeWgs84",
    )
  ) {
    return reply.status(400).send({
      error: "invalid_wgs84_coordinates",
      message: missingWgs84CoordinateErrorMessage,
    });
  }

  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function terrainAnalysisSourceFields(
  elevationSource: ElevationSource,
): Pick<
  ForecastCalculationResult["terrainAnalysis"],
  "dataSource" | "dataSourceLabelZh" | "isMock" | "honestyNoteZh"
> {
  if (elevationSource === "open_meteo_elevation" || elevationSource === "open_meteo") {
    return {
      dataSource: "open_meteo_elevation",
      dataSourceLabelZh: "海拔已估算",
      isMock: false,
      honestyNoteZh: "机位海拔已通过公开海拔服务估算，周边高差与地平线遮挡仍需后续 DEM 数据补充。",
    };
  }

  if (elevationSource === "manual" || elevationSource === "provider_metadata") {
    return {
      dataSource: "mock_terrain",
      dataSourceLabelZh: "基础地形资料",
      isMock: true,
      honestyNoteZh: "机位海拔来自已维护资料；周边高差与地平线遮挡仍以演示地形或基础资料作参考。",
    };
  }

  return {
    dataSource: "unknown",
    dataSourceLabelZh: "海拔暂未确认",
    isMock: true,
    honestyNoteZh: "海拔资料暂未确认，体感仅作参考。",
  };
}

export function registerForecastRoutes(
  app: FastifyInstance,
  options: ForecastRoutesOptions = {},
): void {
  const weatherProvider = options.weatherProvider ?? createWeatherProvider();
  const weatherDataService = options.weatherDataService ?? new WeatherDataService(weatherProvider);
  const terrainProvider = options.terrainProvider ?? new MockTerrainProvider();
  const env = options.env ?? process.env;
  const elevationService =
    options.elevationService ??
    createRuntimeElevationService({
      dbClient: options.dbClient,
      env,
      provider: options.elevationProvider,
    });
  const astroServiceConfig = resolveAstroServiceConfig(env);
  const astroServiceClient =
    options.astroServiceClient ??
    new AstroServiceClient({
      baseUrl: astroServiceConfig.resolvedUrl,
      timeoutMs: astroServiceConfig.timeoutMs,
      logger: app.log,
    });
  const forecastCalculateCacheTtlMs = readPositiveIntegerEnv(
    env,
    "FORECAST_CALCULATE_CACHE_TTL_MS",
    defaultForecastCalculateCacheTtlMs,
    { min: 1000, max: 60 * 60 * 1000 },
  );
  const forecastCalculateStaleIfErrorTtlMs = readPositiveIntegerEnv(
    env,
    "FORECAST_CALCULATE_STALE_IF_ERROR_TTL_MS",
    defaultForecastCalculateStaleIfErrorTtlMs,
    { min: 1000, max: 6 * 60 * 60 * 1000 },
  );
  const forecastCalculateCacheMaxEntries = readPositiveIntegerEnv(
    env,
    "FORECAST_CALCULATE_CACHE_MAX_ENTRIES",
    defaultForecastCalculateCacheMaxEntries,
    { min: 1, max: 100_000 },
  );
  const forecastCalculateRetryCount = readNonNegativeIntegerEnv(
    env,
    "FORECAST_CALCULATE_RETRY_COUNT",
    defaultForecastCalculateRetryCount,
    { min: 0, max: 5 },
  );
  const forecastCalculateRetryDelayMs = readNonNegativeIntegerEnv(
    env,
    "FORECAST_CALCULATE_RETRY_BASE_DELAY_MS",
    env.NODE_ENV === "test" ? 0 : defaultForecastCalculateRetryDelayMs,
    { min: 0, max: 10_000 },
  );
  const forecastCalculateCacheState: ForecastCalculateCacheState = {
    fresh: new Map<string, TtlCacheEntry<ForecastCalculationResult>>(),
    stale: new Map<string, TtlCacheEntry<ForecastCalculationResult>>(),
    inFlight: new Map<string, Promise<ForecastCalculationResult>>(),
    freshTtlMs: forecastCalculateCacheTtlMs,
    staleIfErrorTtlMs: forecastCalculateStaleIfErrorTtlMs,
    maxEntries: forecastCalculateCacheMaxEntries,
  };
  const forecastCalculationServices: ForecastCalculationServices = {
    weatherDataService,
    terrainProvider,
    elevationService,
    astroServiceClient,
    astroServiceConfig,
    dbClient: options.dbClient,
  };
  const forecastResilienceOptions: ForecastResilienceOptions = {
    retryCount: forecastCalculateRetryCount,
    retryDelayMs: forecastCalculateRetryDelayMs,
  };

  app.post("/forecast/validate-query", async (request, reply) => {
    const parsedBody = forecastQueryInputSchema.safeParse(
      normalizeForecastQueryInput(request.body),
    );
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    return {
      query: parsedBody.data,
      labels: {
        horizon: forecastHorizonLabels[parsedBody.data.horizon],
        target: forecastTargetLabels[parsedBody.data.target],
      },
    };
  });

  app.post("/forecast/calculate", async (request, reply) => {
    const normalizedBody = normalizeForecastQueryInput(request.body);
    logForecastCalculationStart({
      logger: request.log,
      rawQueryLike: request.body,
      normalizedQueryLike: normalizedBody,
      astroServiceConfig,
    });

    const parsedBody = forecastCalculateRequestSchema.safeParse(normalizedBody);
    if (!parsedBody.success) {
      logForecastCalculationFailure({
        logger: request.log,
        route: "/forecast/calculate",
        queryLike: normalizedBody,
        astroServiceConfig,
        error: parsedBody.error,
      });
      return sendZodError(reply, parsedBody.error);
    }

    const { timezone, startDateTime, ...query } = parsedBody.data;
    let access: ForecastAccessStatus | null;
    try {
      access = await resolveForecastAccessForRequest({
        request,
        reply,
        client: options.dbClient,
        authConfig: options.authConfig,
        env,
        body: parsedBody.data,
      });
    } catch (error) {
      return sendForecastCalculationError({
        logger: request.log,
        route: "/forecast/calculate",
        queryLike: query,
        astroServiceConfig,
        error,
        reply,
      });
    }
    if (!access) {
      return reply;
    }
    const runtimeCacheSalt = await createForecastCalculateRuntimeCacheSalt({
      dbClient: options.dbClient,
      env,
    });
    const cacheKey = createForecastCalculateCacheKey(parsedBody.data, {
      runtimeCacheSalt,
      rawTarget: readRawForecastTarget(request.body),
      access,
    });

    try {
      const calculation = await calculateForecastWithRouteResilience({
        cacheKey,
        query,
        requestOptions: { timezone, startDateTime },
        cacheState: forecastCalculateCacheState,
        services: forecastCalculationServices,
        resilience: forecastResilienceOptions,
        logger: request.log,
        route: "/forecast/calculate",
      });
      if (calculation.servedStale) {
        reply.header("X-Forecast-Stale", "1");
      }
      return reply.send(calculation.result);
    } catch (error) {
      return sendForecastCalculationError({
        logger: request.log,
        route: "/forecast/calculate",
        queryLike: query,
        astroServiceConfig,
        error,
        reply,
      });
    }
  });

  if (isLocalDevelopment(env)) {
    app.get("/debug/astro-service", async () =>
      checkAstroServiceHealth({
        config: astroServiceConfig,
      }),
    );

    app.get("/debug/weather-fusion", async () => {
      const forecastRange = buildForecastDateRange("24h");
      const forecastWindowAnchor = resolveForecastWindowRange({
        generatedAt: forecastRange.forecastStart,
        timezone: forecastRange.timezone,
        horizon: "24h",
        requestedForecastHours: forecastRange.horizonHours,
      });
      const providerCoveragePlan = resolveRollingHorizonProviderRequest({
        generatedAt: forecastRange.forecastStart,
        timezone: forecastRange.timezone,
        horizon: "24h",
        providerType: "mixed",
        providerCapabilities: {
          supportsForecastHours: true,
          supportsForecastDays: true,
          startsAtLocalMidnight: true,
        },
      });
      const bundle = await weatherDataService.getWeatherDataBundle({
        coordinates: {
          latitude: 30.1328,
          longitude: 118.1718,
          system: "wgs84",
        },
        horizon: "24h",
        hours: providerCoveragePlan.recommendedRequestHours,
        days: providerCoveragePlan.requiredForecastDays,
        forecastStart: forecastRange.forecastStart,
        forecastEnd: forecastRange.forecastEnd,
        forecastWindowAnchorStart: forecastWindowAnchor.anchorStartLocal,
        forecastWindowAnchorEnd: providerCoveragePlan.anchorEndLocal,
        expectedRowCount: providerCoveragePlan.expectedRowCount,
        providerCoverageVersion: rollingHorizonProviderCoverageVersion,
        providerRequestStartLocal: providerCoveragePlan.requestStartLocal,
        providerRequestEndLocal: providerCoveragePlan.requestEndLocal,
        providerCoverageRule: providerCoveragePlan.coverageRule,
        targetDates: forecastRange.targetDates,
        target: "cloud_sea",
        timezone: forecastRange.timezone,
      });

      return {
        location: "黄山光明顶",
        providerCode: bundle.providerCode,
        providerLabelZh: bundle.providerLabelZh,
        dataMode: bundle.dataMode,
        noticeZh: bundle.noticeZh,
        sourceSummaries: bundle.sourceSummaries ?? [],
        confidenceByTarget: bundle.confidenceByTarget ?? null,
        conflictFlags: bundle.conflictFlags ?? [],
        fusionSummary: bundle.fusionSummary ?? null,
        missingFields: bundle.missingFields ?? [],
        estimatedFields: bundle.estimatedFields ?? [],
      };
    });
  }
}

async function calculateForecastWithRouteResilience(options: {
  readonly cacheKey: string;
  readonly query: ForecastQueryInput;
  readonly requestOptions: ForecastCalculationOptions;
  readonly cacheState: ForecastCalculateCacheState;
  readonly services: ForecastCalculationServices;
  readonly resilience: ForecastResilienceOptions;
  readonly logger: FastifyBaseLogger;
  readonly route: string;
}): Promise<{
  readonly result: ForecastCalculationResult;
  readonly servedStale: boolean;
}> {
  const { cacheKey, query, requestOptions, cacheState, services, resilience, logger, route } =
    options;
  const cached = readCachedValue(cacheState.fresh, cacheKey);
  if (cached) {
    logForecastCalculationCacheEvent({
      logger,
      route,
      queryLike: query,
      event: "cache_hit",
    });
    return { result: cached, servedStale: false };
  }

  let calculationPromise = cacheState.inFlight.get(cacheKey);
  if (calculationPromise) {
    logForecastCalculationCacheEvent({
      logger,
      route,
      queryLike: query,
      event: "in_flight_hit",
    });
  } else {
    calculationPromise = calculateForecastResultWithRetry({
      query,
      requestOptions,
      services,
      resilience,
      logger,
      route,
    }).then((result) => {
      writeForecastCalculateSuccessCache(cacheState, cacheKey, result);
      return result;
    });
    cacheState.inFlight.set(cacheKey, calculationPromise);
  }

  try {
    return {
      result: await calculationPromise,
      servedStale: false,
    };
  } catch (error) {
    const classification = classifyForecastCalculationError(error);
    if (classification.transient) {
      const stale = readCachedValue(cacheState.stale, cacheKey);
      if (stale) {
        logForecastCalculationStaleServed({
          logger,
          route,
          queryLike: query,
          category: classification.category,
        });
        return { result: stale, servedStale: true };
      }
    }
    throw error;
  } finally {
    if (cacheState.inFlight.get(cacheKey) === calculationPromise) {
      cacheState.inFlight.delete(cacheKey);
    }
  }
}

async function calculateForecastResultWithRetry(options: {
  readonly query: ForecastQueryInput;
  readonly requestOptions: ForecastCalculationOptions;
  readonly services: ForecastCalculationServices;
  readonly resilience: ForecastResilienceOptions;
  readonly logger: FastifyBaseLogger;
  readonly route: string;
}): Promise<ForecastCalculationResult> {
  const { query, requestOptions, services, resilience, logger, route } = options;
  const maxAttempts = Math.max(1, resilience.retryCount + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logForecastCalculationAttempt({
        logger,
        route,
        queryLike: query,
        attempt,
        maxAttempts,
      });
      return await calculateForecastResultWithCalibration(
        query,
        requestOptions,
        services.weatherDataService,
        services.terrainProvider,
        services.elevationService,
        services.astroServiceClient,
        services.astroServiceConfig,
        services.dbClient,
        logger,
      );
    } catch (error) {
      const classification = classifyForecastCalculationError(error);
      if (!classification.transient || attempt >= maxAttempts) {
        throw error;
      }
      logForecastCalculationRetry({
        logger,
        route,
        queryLike: query,
        attempt,
        nextAttempt: attempt + 1,
        category: classification.category,
        statusCode: classification.statusCode,
      });
      await delayForecastRetry(retryDelayMsForAttempt(resilience.retryDelayMs, attempt));
    }
  }

  throw new Error("unreachable forecast retry state");
}

function writeForecastCalculateSuccessCache(
  cacheState: ForecastCalculateCacheState,
  cacheKey: string,
  response: ForecastCalculationResult,
): void {
  writeCachedValue(
    cacheState.fresh,
    cacheKey,
    response,
    cacheState.freshTtlMs,
    cacheState.maxEntries,
  );
  writeCachedValue(
    cacheState.stale,
    cacheKey,
    response,
    cacheState.staleIfErrorTtlMs,
    cacheState.maxEntries,
  );
}

function retryDelayMsForAttempt(baseDelayMs: number, attempt: number): number {
  if (baseDelayMs <= 0) {
    return 0;
  }
  const withoutJitter = Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), 2400);
  return Math.round(withoutJitter + Math.random() * withoutJitter * 0.2);
}

function delayForecastRetry(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function classifyForecastCalculationError(error: unknown): ForecastTransientClassification {
  if (isDeterministicForecastValidationError(error)) {
    return { transient: false, category: "validation" };
  }

  if (error instanceof AstroServiceClientError) {
    if (
      error.kind === "timeout" ||
      error.kind === "unavailable" ||
      error.kind === "invalid_response"
    ) {
      return {
        transient: true,
        category: `astro_service_${error.kind}`,
        statusCode: error.diagnostics.status,
      };
    }
    return { transient: false, category: `astro_service_${error.kind}` };
  }

  if (isWeatherProviderError(error)) {
    const transient =
      error.errorCategory === "timeout" ||
      error.errorCategory === "network" ||
      isTransientForecastHttpStatus(error.statusCode);
    return {
      transient,
      category: `weather_${error.errorCategory}`,
      statusCode: error.statusCode,
    };
  }

  if (isRecord(error)) {
    const status = readNumericStatus(error);
    if (isTransientForecastHttpStatus(status)) {
      return { transient: true, category: "upstream_http_status", statusCode: status };
    }
  }

  if (error instanceof TypeError) {
    return { transient: true, category: "network_error" };
  }

  const normalized = normalizeError(error);
  if (
    /timeout|timed out|fetch failed|network|ECONNRESET|ECONNREFUSED|EAI_AGAIN/i.test(
      normalized.message,
    )
  ) {
    return { transient: true, category: "network_or_timeout" };
  }

  return { transient: false, category: "unknown" };
}

function isDeterministicForecastValidationError(error: unknown): boolean {
  if (error instanceof z.ZodError) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === forecastDateRangeErrorMessage ||
    message === missingWgs84CoordinateErrorMessage ||
    message === astroServiceUrlMissingMessage
  );
}

function readNumericStatus(record: Record<string, unknown>): number | undefined {
  const candidates = [record.status, record.statusCode, record.code];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function isTransientForecastHttpStatus(status: number | undefined): boolean {
  return typeof status === "number" && forecastTransientHttpStatuses.has(status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function calculateForecastResultWithCalibration(
  query: ForecastQueryInput,
  requestOptions: ForecastCalculationOptions,
  weatherDataService: WeatherDataServiceLike,
  terrainProvider: TerrainProvider,
  elevationService: TerrainElevationService,
  astroServiceClient: AstroServiceClientLike,
  astroServiceConfig: AstroServiceConfig,
  dbClient: DatabaseClient | undefined,
  logger: FastifyBaseLogger,
): Promise<ForecastCalculationResult> {
  const result = await calculateForecastResult(
    query,
    requestOptions,
    weatherDataService,
    terrainProvider,
    elevationService,
    astroServiceClient,
    astroServiceConfig,
    logger,
  );
  logWeatherRuntimeFusionDiagnostics(logger, result);
  logCloudSeaCoverageDiagnostics(logger, result);
  logGlowScoringDiagnostics(logger, result);
  return attachCalibrationHint(result, query, dbClient);
}

function sendForecastCalculationError(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly astroServiceConfig: AstroServiceConfig;
  readonly error: unknown;
  readonly reply: FastifyReply;
}): null {
  const { logger, route, queryLike, astroServiceConfig, error, reply } = options;
  const classification = classifyForecastCalculationError(error);
  logForecastCalculationFailure({
    logger,
    route,
    queryLike,
    astroServiceConfig,
    error,
    category: classification.category,
    transient: classification.transient,
  });
  const message = (error as Error).message;
  if (message === astroServiceUnavailableMessage) {
    reply.status(503).send({
      error: "astro_service_unavailable",
      message: astroServiceUnavailableMessage,
    });
    return null;
  }
  if (message === astroServiceTimeoutMessage) {
    reply.status(503).send({
      error: "astro_service_timeout",
      message: astroServiceTimeoutMessage,
    });
    return null;
  }
  if (message === astroServiceInvalidResponseMessage) {
    reply.status(502).send({
      error: "astro_service_invalid_response",
      message: astroServiceInvalidResponseMessage,
    });
    return null;
  }
  if (message === astroServiceUrlMissingMessage) {
    reply.status(503).send({
      error: "astro_service_url_missing",
      message: astroServiceUrlMissingMessage,
    });
    return null;
  }
  if (message === forecastDateRangeErrorMessage) {
    reply.status(400).send({
      error: "invalid_forecast_range",
      message: forecastDateRangeErrorMessage,
    });
    return null;
  }
  if (message === missingWgs84CoordinateErrorMessage) {
    reply.status(400).send({
      error: "invalid_wgs84_coordinates",
      message: missingWgs84CoordinateErrorMessage,
    });
    return null;
  }
  if (classification.transient) {
    reply.status(503).send({
      error: "forecast_calculation_transient_failure",
      message: "拍摄天气分析暂时不可用，请稍后重试。",
    });
    return null;
  }

  reply.status(500).send({
    error: "forecast_calculation_failed",
    message: "拍摄天气分析暂时不可用，请稍后重试。",
  });
  return null;
}

async function attachCalibrationHint(
  result: ForecastCalculationResult,
  query: ForecastQueryInput,
  dbClient: DatabaseClient | undefined,
): Promise<ForecastCalculationResult> {
  const locationKey = buildCalibrationLocationKey({
    spotId: query.photoSpotId,
    locationId: query.locationId,
    latitudeWgs84: query.latitudeWgs84,
    longitudeWgs84: query.longitudeWgs84,
  });
  if (locationKey === "unknown") {
    return result;
  }

  try {
    const hint = await findCalibrationHint({
      client: dbClient,
      locationKey,
      target: query.target,
    });
    return hint ? { ...result, calibrationHint: hint } : result;
  } catch {
    return result;
  }
}

async function calculateForecastResult(
  query: ForecastQueryInput,
  requestOptions: ForecastCalculationOptions,
  weatherDataService: WeatherDataServiceLike,
  terrainProvider: TerrainProvider,
  elevationService: TerrainElevationService,
  astroServiceClient: AstroServiceClientLike,
  astroServiceConfig: AstroServiceConfig,
  logger: FastifyBaseLogger,
): Promise<ForecastCalculationResult> {
  const shouldUseAstroService =
    astroServiceConfig.enabled &&
    (query.target === "astro" || query.target === "glow" || query.target === "general");

  if (shouldUseAstroService && !astroServiceConfig.configuredUrl) {
    throw new Error(astroServiceUrlMissingMessage);
  }

  const forecastRange = buildForecastDateRange(query.horizon, {
    timezone: requestOptions.timezone,
    now: requestOptions.startDateTime,
  });
  const forecastWindowAnchor = resolveForecastWindowRange({
    generatedAt: forecastRange.forecastStart,
    timezone: forecastRange.timezone,
    horizon: query.horizon,
    requestedForecastHours: forecastRange.horizonHours,
  });
  const providerCoveragePlan = resolveRollingHorizonProviderRequest({
    generatedAt: forecastRange.forecastStart,
    timezone: forecastRange.timezone,
    horizon: query.horizon,
    providerType: "mixed",
    providerCapabilities: {
      supportsForecastHours: true,
      supportsForecastDays: true,
      startsAtLocalMidnight: true,
    },
  });
  const coordinates = {
    latitude: query.latitudeWgs84,
    longitude: query.longitudeWgs84,
    system: "wgs84" as const,
  };
  const terrainInput = {
    locationName: query.name,
    coordinate: {
      ...coordinates,
      name: query.name,
    },
    latitudeGcj02: query.latitudeGcj02,
    longitudeGcj02: query.longitudeGcj02,
    elevationMeters: query.elevationMeters ?? null,
    elevationSource: query.elevationSource,
    elevationConfidence: query.elevationConfidence,
  };
  const elevation = await elevationService.getElevationForLocation(terrainInput);
  const enrichedTerrainInput = {
    ...terrainInput,
    elevationMeters: elevation.elevationMeters,
    elevationSource: elevation.elevationSource,
    elevationConfidence: elevation.elevationConfidence,
    terrainProfile: elevation.terrainProfile,
  };
  const [weatherDataBundle, terrainProfile, horizonProfile] = await Promise.all([
    weatherDataService.getWeatherDataBundle({
      coordinates,
      elevationMeters: elevation.elevationMeters ?? undefined,
      horizon: query.horizon,
      hours: providerCoveragePlan.recommendedRequestHours,
      days: providerCoveragePlan.requiredForecastDays,
      forecastStart: forecastRange.forecastStart,
      forecastEnd: forecastRange.forecastEnd,
      forecastWindowAnchorStart: forecastWindowAnchor.anchorStartLocal,
      forecastWindowAnchorEnd: providerCoveragePlan.anchorEndLocal,
      expectedRowCount: providerCoveragePlan.expectedRowCount,
      providerCoverageVersion: rollingHorizonProviderCoverageVersion,
      providerRequestStartLocal: providerCoveragePlan.requestStartLocal,
      providerRequestEndLocal: providerCoveragePlan.requestEndLocal,
      providerCoverageRule: providerCoveragePlan.coverageRule,
      targetDates: forecastRange.targetDates,
      target: query.target,
      timezone: forecastRange.timezone,
    }),
    terrainProvider.buildTerrainProfile(enrichedTerrainInput),
    terrainProvider.buildHorizonProfile(enrichedTerrainInput),
  ]);
  const terrainAnalysis = {
    terrainProfile,
    horizonProfile,
    ...terrainAnalysisSourceFields(terrainProfile.elevationSource),
  };
  const calculationInput = buildForecastInputFromWeatherBundle(query, weatherDataBundle, {
    forecastRange,
    terrainAnalysis,
  });

  if (!shouldUseAstroService) {
    return calculateForecast(calculationInput);
  }

  const serviceResponse = await astroServiceClient.calculate({
    latitudeWgs84: query.latitudeWgs84,
    longitudeWgs84: query.longitudeWgs84,
    elevationMeters: terrainProfile.elevationMeters ?? undefined,
    timezone: requestOptions.timezone ?? "Asia/Shanghai",
    horizon: query.horizon,
    startDateTime: requestOptions.startDateTime ?? forecastRange.forecastStart,
  });
  const astroServiceData = mapAstroServiceResponseToForecastData(
    serviceResponse,
    calculationInput.calendarBasis.calendarDays,
  );
  const enrichedTerrainAnalysis = await enrichTerrainAnalysisWithTerrainDem({
    query,
    terrainAnalysis,
    astroServiceData,
    astroServiceClient,
    logger,
  });

  return calculateForecast({
    ...calculationInput,
    terrainAnalysis: enrichedTerrainAnalysis,
    astroSummaries: astroServiceData.astroSummaries,
    astroWindowBundle: astroServiceData.astroWindowBundle,
    astroCalculationBasis: astroServiceData.astroCalculationBasis,
    astroDataSourceLabelZh: astroServiceData.astroDataSourceLabelZh,
    lightPollution: astroServiceData.lightPollution,
  });
}

type TerrainDemTargetGeometry = {
  readonly targetAzimuthDegrees: number;
  readonly targetAltitudeDegrees: number | null;
  readonly sourceWindowKey: string;
};

async function enrichTerrainAnalysisWithTerrainDem(options: {
  readonly query: ForecastQueryInput;
  readonly terrainAnalysis: TerrainAnalysisSummary;
  readonly astroServiceData: ForecastAstroServiceData;
  readonly astroServiceClient: AstroServiceClientLike;
  readonly logger: FastifyBaseLogger;
}): Promise<TerrainAnalysisSummary> {
  const queryTerrainDemProfile = options.astroServiceClient.queryTerrainDemProfile?.bind(
    options.astroServiceClient,
  );
  if (!queryTerrainDemProfile) {
    return options.terrainAnalysis;
  }

  const targets = collectMilkyWayTerrainDemTargets(options.astroServiceData);
  if (targets.length === 0) {
    return options.terrainAnalysis;
  }

  const observerElevationMeters = firstFiniteNumber([
    options.terrainAnalysis.terrainProfile.locationElevation,
    options.terrainAnalysis.terrainProfile.elevationMeters,
    options.query.elevationMeters,
  ]);
  const demSamples: TerrainHorizonDirectionSample[] = [];

  for (const target of targets) {
    try {
      const profile = await queryTerrainDemProfile({
        latitudeWgs84: options.query.latitudeWgs84,
        longitudeWgs84: options.query.longitudeWgs84,
        observerElevationMeters,
        target: "milky_way",
        targetAzimuthDegrees: target.targetAzimuthDegrees,
        targetAltitudeDegrees: target.targetAltitudeDegrees,
        maxDistanceMeters: 30_000,
        sampleIntervalMeters: 250,
      });
      const sample = mapTerrainDemProfileToDirectionSample(profile);
      if (sample) {
        demSamples.push(sample);
      }
      options.logger.info(
        {
          route: "/forecast/calculate",
          target: options.query.target,
          terrainDemAvailable: profile.available,
          terrainDemUnavailableReason: profile.unavailableReason ?? null,
          terrainDemConfidence: profile.confidence,
          terrainDemDatasetYear: profile.datasetYear ?? null,
          terrainDemDatasetVersion: profile.datasetVersion ?? null,
          terrainDemSampleCount: profile.sampleCount,
          terrainDemValidSampleCount: profile.validSampleCount,
          terrainDemRequiredTileId: profile.demCoverage?.requiredTileId ?? null,
          terrainDemTileStatus: profile.demCoverage?.status ?? null,
          targetAzimuthDegrees: target.targetAzimuthDegrees,
          targetAltitudeDegrees: target.targetAltitudeDegrees,
          sourceWindowKey: target.sourceWindowKey,
        },
        "Terrain DEM profile query completed for forecast terrain enrichment",
      );
    } catch (error) {
      const normalized = normalizeError(error);
      options.logger.warn(
        {
          route: "/forecast/calculate",
          target: options.query.target,
          targetAzimuthDegrees: target.targetAzimuthDegrees,
          sourceWindowKey: target.sourceWindowKey,
          errorName: normalized.name,
          errorMessage: normalized.message,
        },
        "Terrain DEM profile query failed; keeping existing terrain analysis",
      );
    }
  }

  if (demSamples.length === 0) {
    return options.terrainAnalysis;
  }

  const hasResolvedDemProfile = demSamples.some(
    (sample) =>
      typeof sample.horizonAltitudeDegrees === "number" &&
      sample.unavailableReason === undefined &&
      (sample.confidence === "medium" || sample.confidence === "high"),
  );

  return {
    ...options.terrainAnalysis,
    horizonProfile: {
      ...options.terrainAnalysis.horizonProfile,
      directionSamples: mergeTerrainDemDirectionSamples(
        options.terrainAnalysis.horizonProfile.directionSamples,
        demSamples,
      ),
      obstructionNoteZh: hasResolvedDemProfile
        ? "本地 DEM 已提供银河方向地形剖面；云海高差、近景遮挡、树线和建筑遮挡仍需现场复核。"
        : "地形数据不足；当前 DEM 未覆盖目标坐标或样本不可用，系统未按无遮挡处理。",
    },
    dataSource: "dem",
    dataSourceLabelZh: hasResolvedDemProfile ? "本地 DEM 地形剖面" : "本地 DEM 覆盖诊断",
    isMock: false,
    honestyNoteZh: hasResolvedDemProfile
      ? "银河方向地形遮挡使用本地 DEM；云海高差、近景遮挡、树线和建筑遮挡仍需现场复核。"
      : "地形数据不足；缺少可用 DEM 剖面时不按无遮挡处理。",
  };
}

function collectMilkyWayTerrainDemTargets(
  astroServiceData: ForecastAstroServiceData,
): readonly TerrainDemTargetGeometry[] {
  const windows = [
    ...astroServiceData.astroWindowBundle.recommendedMilkyWayWindows,
    ...astroServiceData.astroWindowBundle.milkyWayCandidateWindows,
  ];
  const seen = new Set<string>();
  const targets: TerrainDemTargetGeometry[] = [];

  for (const window of windows) {
    if (
      typeof window.galacticCenterAzimuth !== "number" ||
      !Number.isFinite(window.galacticCenterAzimuth)
    ) {
      continue;
    }
    const targetAzimuthDegrees = window.galacticCenterAzimuth;
    const targetAltitudeDegrees =
      typeof window.galacticCenterAltitude === "number" &&
      Number.isFinite(window.galacticCenterAltitude)
        ? window.galacticCenterAltitude
        : null;
    const key = `${Math.round(targetAzimuthDegrees * 10) / 10}:${targetAltitudeDegrees === null ? "unknown" : Math.round(targetAltitudeDegrees * 10) / 10}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    targets.push({
      targetAzimuthDegrees,
      targetAltitudeDegrees,
      sourceWindowKey: `${window.type}:${window.date ?? "unknown"}:${window.start}`,
    });
    if (targets.length >= 3) {
      break;
    }
  }

  return targets;
}

function mergeTerrainDemDirectionSamples(
  existing: readonly TerrainHorizonDirectionSample[] | undefined,
  demSamples: readonly TerrainHorizonDirectionSample[],
): readonly TerrainHorizonDirectionSample[] {
  const demTargets = new Set(demSamples.map((sample) => sample.target ?? "custom"));
  const existingWithoutSameTarget = (existing ?? []).filter(
    (sample) => !demTargets.has(sample.target ?? "custom"),
  );
  return [...demSamples, ...existingWithoutSameTarget];
}

function firstFiniteNumber(values: readonly (number | null | undefined)[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function roundCoordinateForCache(value: number): number {
  return Math.round(value * 100000) / 100000;
}

function isLocalDevelopment(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== "production";
}

function logForecastCalculationStart(options: {
  readonly logger: FastifyBaseLogger;
  readonly rawQueryLike: unknown;
  readonly normalizedQueryLike: unknown;
  readonly astroServiceConfig: AstroServiceConfig;
}): void {
  const { logger, rawQueryLike, normalizedQueryLike, astroServiceConfig } = options;
  const rawQuery = extractForecastQueryLogFields(rawQueryLike);
  const normalizedQuery = extractForecastQueryLogFields(normalizedQueryLike);

  logger.info(
    {
      route: "/forecast/calculate",
      forecastTargetRaw: rawQuery.target,
      forecastTargetNormalized: normalizedQuery.target,
      horizon: normalizedQuery.horizon ?? rawQuery.horizon,
      hasLatitudeWgs84: normalizedQuery.coordinatesPresent.latitudeWgs84,
      hasLongitudeWgs84: normalizedQuery.coordinatesPresent.longitudeWgs84,
      astroServiceEnabled: astroServiceConfig.enabled,
      astroServiceUrl: astroServiceConfig.enabled ? astroServiceConfig.logUrl : "not configured",
      astroServiceTimeoutMs: astroServiceConfig.timeoutMs,
      locationName: normalizedQuery.locationName ?? rawQuery.locationName,
    },
    "Forecast calculation started",
  );
}

function logWeatherRuntimeFusionDiagnostics(
  logger: FastifyBaseLogger,
  result: ForecastCalculationResult,
): void {
  const sourceSummaries = result.weatherSourceSummaries ?? [];
  const openMeteoModelSummaries = sourceSummaries.filter(
    (summary) => summary.providerCode === "open_meteo" && summary.modelName,
  );
  const failedOpenMeteoModels = openMeteoModelSummaries.filter((summary) => !summary.success);
  const runtimeOpenMeteoModels = (result.weatherProviderRuntimeSnapshot ?? [])
    .filter(
      (snapshot) =>
        snapshot.providerCode === "open_meteo" &&
        snapshot.modelFamily === "open_meteo" &&
        typeof snapshot.modelName === "string",
    )
    .map((snapshot) => snapshot.modelName as string);
  const openMeteoModelList = [
    ...new Set([
      ...runtimeOpenMeteoModels,
      ...openMeteoModelSummaries.flatMap((summary) =>
        summary.modelName ? [summary.modelName] : [],
      ),
    ]),
  ];
  const aerosolDiagnostics = result.weatherFusionSummary?.aerosolDiagnostics;
  const multiModelConsensusDiagnostics =
    result.weatherFusionSummary?.multiModelConsensusDiagnostics;

  logger.info(
    {
      route: "/forecast/calculate",
      target: result.target,
      sourceSummaryCount: sourceSummaries.length,
      openMeteoModelList,
      openMeteoModelCount: openMeteoModelList.length,
      failedOpenMeteoModelCount: failedOpenMeteoModels.length,
      failedOpenMeteoModels: failedOpenMeteoModels.map((summary) => summary.modelName),
      conflictFlagsCount: result.weatherFusionSummary?.conflictFlagsCount ?? null,
      aerosolConflictFlagsCount: result.weatherFusionSummary?.aerosolConflictFlagsCount ?? null,
      confidenceByTarget: result.weatherFusionSummary?.confidenceByTarget ?? null,
      transparencyPenaltyByTarget: result.weatherFusionSummary?.transparencyPenaltyByTarget ?? null,
      multiModelConsensusHours: multiModelConsensusDiagnostics?.multiModelConsensusHours ?? null,
      multiModelConsensusFields: multiModelConsensusDiagnostics?.multiModelConsensusFields ?? null,
      multiModelHighSpreadHours: multiModelConsensusDiagnostics?.multiModelHighSpreadHours ?? null,
      multiModelCloudSpreadMax: multiModelConsensusDiagnostics?.multiModelCloudSpreadMax ?? null,
      multiModelLowCloudSpreadMax:
        multiModelConsensusDiagnostics?.multiModelLowCloudSpreadMax ?? null,
      multiModelVisibilitySpreadMax:
        multiModelConsensusDiagnostics?.multiModelVisibilitySpreadMax ?? null,
      multiModelConfidencePenaltyByTarget:
        multiModelConsensusDiagnostics?.multiModelConfidencePenaltyByTarget ?? null,
      aerosolHoursAvailable: aerosolDiagnostics?.aerosolHoursAvailable ?? null,
      aerosolSuppressedHours: aerosolDiagnostics?.aerosolSuppressedHours ?? null,
      aerosolPoorHours: aerosolDiagnostics?.aerosolPoorHours ?? null,
      maxAerosolOpticalDepth550: aerosolDiagnostics?.maxAerosolOpticalDepth550 ?? null,
      maxPm25: aerosolDiagnostics?.maxPm25 ?? null,
      maxPm10: aerosolDiagnostics?.maxPm10 ?? null,
      maxDust: aerosolDiagnostics?.maxDust ?? null,
      cacheHitCount: sourceSummaries.filter((summary) => summary.cacheHit === true).length,
      cacheHits: sourceSummaries
        .filter((summary) => summary.cacheHit === true)
        .map((summary) => ({
          providerCode: summary.providerCode,
          modelName: summary.modelName,
        })),
    },
    "Weather runtime fusion diagnostics",
  );
}

function logCloudSeaCoverageDiagnostics(
  logger: FastifyBaseLogger,
  result: ForecastCalculationResult,
): void {
  if (result.target !== "cloud_sea") {
    return;
  }
  const basis = result.professionalHourlyDataTimeBasis;
  const coverage = basis?.fieldCoverageSummary;
  const temperatureDiagnostics = cloudSeaTemperatureDiagnostics(result);
  if (!basis || !coverage) {
    logger.info(
      {
        route: "/forecast/calculate",
        target: result.target,
        requestedForecastHours: result.calendarBasis.horizonHours,
        minRequestHours: basis?.minRequestHours,
        recommendedRequestHours: basis?.recommendedRequestHours,
        requiredForecastDays: basis?.requiredForecastDays,
        professionalHourlyRows: result.professionalHourlyData?.length ?? 0,
        cloudLayerCoverage: "unavailable",
        temperatureDiagnostics,
      },
      "Cloud Sea cloud-layer coverage diagnostics",
    );
    logCloudSeaDisplayAlignmentDiagnostics(logger, result, temperatureDiagnostics);
    return;
  }

  logger.info(
    {
      route: "/forecast/calculate",
      target: result.target,
      requestedForecastHours: result.calendarBasis.horizonHours,
      minRequestHours: basis.minRequestHours,
      recommendedRequestHours: basis.recommendedRequestHours,
      requiredForecastDays: basis.requiredForecastDays,
      requestStartLocal: basis.requestStartLocal,
      requestEndLocal: basis.requestEndLocal,
      providerCoverageVersion: basis.providerCoverageVersion,
      coverageRule: basis.coverageRule,
      professionalHourlyRows: result.professionalHourlyData?.length ?? 0,
      selectedPrimaryCloudLayerSource: basis.selectedPrimaryCloudLayerSource,
      fallbackSourcesUsed: basis.fallbackSourcesUsed ?? [],
      returnedHoursByProvider: (basis.providerCoverageSummary ?? []).map((provider) => ({
        providerId: provider.providerId,
        providerCode: provider.providerCode,
        modelName: provider.modelName,
        returnedHours: provider.returnedHours,
        cloudTotalHours: provider.cloudTotalHours,
        cloudLowHours: provider.cloudLowHours,
        cloudMidHours: provider.cloudMidHours,
        cloudHighHours: provider.cloudHighHours,
        dewPointHours: provider.dewPointHours,
        visibilityHours: provider.visibilityHours,
        precipitationProbabilityHours: provider.precipitationProbabilityHours,
        error: provider.error,
      })),
      fieldCoverage: coverage,
      missingFieldSummary: basis.missingFieldSummary ?? [],
      temperatureDiagnostics,
    },
    "Cloud Sea cloud-layer coverage diagnostics",
  );
  logCloudSeaDisplayAlignmentDiagnostics(logger, result, temperatureDiagnostics);
}

function logGlowScoringDiagnostics(
  logger: FastifyBaseLogger,
  result: ForecastCalculationResult,
): void {
  if (result.target !== "glow") {
    return;
  }
  const analysis = result.glowAnalysis;
  logger.info(
    {
      route: "/forecast/calculate",
      target: result.target,
      occurrenceProbabilityPercent: analysis.occurrenceProbabilityPercent,
      vividnessIndex: analysis.vividnessIndex,
      vividnessLevel: analysis.vividnessLevel,
      practicalSuitabilityScore: analysis.practicalSuitabilityScore,
      confidence: analysis.confidence,
      calibrationMode: analysis.calibrationMode,
      providerAgreement: {
        status: analysis.providerAgreement.status,
        providerCount: analysis.providerAgreement.providerCount,
        modelCount: analysis.providerAgreement.modelCount,
        modelSpread: analysis.providerAgreement.modelSpread,
        confidenceAdjustment: analysis.providerAgreement.confidenceAdjustment,
      },
      canonicalWindows: analysis.diagnostics.map((window) => ({
        phase: window.phase,
        date: window.date,
        bestStartAt: window.bestStartAt,
        bestEndAt: window.bestEndAt,
        occurrenceProbabilityPercent: window.occurrenceProbabilityPercent,
        vividnessIndex: window.vividnessIndex,
        vividnessLevel: window.vividnessLevel,
        practicalSuitabilityScore: window.practicalSuitabilityScore,
        confidence: window.confidence,
        calibrationMode: window.calibrationMode,
        providerAgreement: window.providerAgreement
          ? {
              status: window.providerAgreement.status,
              providerCount: window.providerAgreement.providerCount,
              modelCount: window.providerAgreement.modelCount,
              modelSpread: window.providerAgreement.modelSpread,
            }
          : undefined,
        components: window.scoreBreakdown
          ? {
              colorCarrierScore: window.scoreBreakdown.colorCarrierScore,
              glowCarrierScore: window.scoreBreakdown.glowCarrierScore,
              lowCloudObstructionRisk: window.scoreBreakdown.lowCloudObstructionRisk,
              lowCloudFogWallRisk: window.scoreBreakdown.lowCloudFogWallRisk,
              glowLightPathObstructionRisk: window.scoreBreakdown.glowLightPathObstructionRisk,
              glowLightPathDataAvailability: window.scoreBreakdown.glowLightPathDataAvailability,
              glowLightPathConfidence: window.scoreBreakdown.glowLightPathConfidence,
              cloudSuppressionRisk: window.scoreBreakdown.cloudSuppressionRisk,
              visibilityColorQualityScore: window.scoreBreakdown.visibilityColorQualityScore,
              precipitationDisruptionRisk: window.scoreBreakdown.precipitationDisruptionRisk,
              terrainScore: window.scoreBreakdown.terrainScore,
              windHumidityScore: window.scoreBreakdown.windHumidityScore,
              missingDataReasons: window.scoreBreakdown.missingDataReasons,
              modelResults: window.scoreBreakdown.modelResults.map((model) => ({
                providerCode: model.providerCode,
                modelName: model.modelName,
                sourceId: model.sourceId,
                occurrenceProbabilityPercent: model.occurrenceProbabilityPercent,
                vividnessIndex: model.vividnessIndex,
                practicalSuitabilityScore: model.practicalSuitabilityScore,
                confidence: model.confidence,
              })),
            }
          : undefined,
        unavailableReason: window.unavailableReason,
      })),
      missingDataNotes: analysis.missingDataNotes,
    },
    "Glow scoring diagnostics",
  );
}

function logCloudSeaDisplayAlignmentDiagnostics(
  logger: FastifyBaseLogger,
  result: ForecastCalculationResult,
  temperatureDiagnostics = cloudSeaTemperatureDiagnostics(result),
): void {
  if (result.target !== "cloud_sea") {
    return;
  }
  const rows = result.professionalHourlyData ?? [];
  const basis = result.professionalHourlyDataTimeBasis;
  const anchorStart = firstValidDiagnosticTime(
    basis?.anchorStartLocal,
    basis?.startTime,
    result.forecastStart,
    result.generatedAt,
  );
  const anchorEnd = basis?.anchorEndLocal ?? basis?.endTime ?? result.forecastEnd;
  const expectedRowCount = normalizedDiagnosticRowCount(
    basis?.expectedRowCount ?? basis?.requestedHours ?? result.calendarBasis.horizonHours,
  );
  const normalizedRows = professionalRowsAtOrAfter(rows, anchorStart).slice(0, expectedRowCount);
  const nearTermRows = normalizedRows.slice(0, 6);
  const nearTermEnd =
    nearTermRows.at(-1)?.time ?? nearTermDiagnosticWindowEnd(anchorStart, anchorEnd);
  const cloudLayerCoverage = buildCloudLayerCompletenessContext(normalizedRows);
  const sourceAlignmentStatus =
    normalizedRows.length === 0
      ? "missing_hourly_rows"
      : normalizedRows.length < expectedRowCount ||
          cloudLayerCoverage.layerCompletenessLevel !== "complete"
        ? "partial"
        : "aligned";
  const bestWindow =
    result.cloudSeaAnalysis.bestCloudSeaWindow ??
    result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
    result.cloudSeaAnalysis.watchableCloudSeaWindows[0] ??
    null;
  const precipitationSignal = buildCloudSeaPrecipitationSignalContext({
    hourlyRows: normalizedRows,
    timezone: result.calendarBasis.timezone,
    focusedWindow: bestWindow
      ? {
          startTime: bestWindow.startTime,
          endTime: bestWindow.endTime,
        }
      : null,
    bestWindow,
    terrainContext: {
      elevationMeters:
        result.terrainAnalysis.terrainProfile.locationElevation ??
        result.terrainAnalysis.terrainProfile.elevationMeters ??
        result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
      surroundingReliefMeters:
        result.terrainAnalysis.terrainProfile.localReliefMeters ??
        result.terrainAnalysis.terrainProfile.elevationDiff5km ??
        result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      terrainType:
        result.terrainAnalysis.terrainProfile.terrainType ??
        result.cloudSeaAnalysis.terrainSupport.terrainType,
    },
    cloudLayerCompletenessContext: cloudLayerCoverage,
  });

  logger.info(
    {
      route: "/forecast/calculate",
      target: result.target,
      displayDataBuilt: true,
      horizon: result.horizon,
      timezone: basis?.timezone ?? result.calendarBasis.timezone,
      anchorStart,
      anchorEnd,
      expectedRowCount,
      minRequestHours: basis?.minRequestHours,
      recommendedRequestHours: basis?.recommendedRequestHours,
      requiredForecastDays: basis?.requiredForecastDays,
      actualRowCount: normalizedRows.length,
      firstRowTime: normalizedRows[0]?.time ?? null,
      lastRowTime: normalizedRows.at(-1)?.time ?? null,
      isRollingFutureRange: basis?.rule === "rolling_future_hours" || basis?.isFutureOnly === true,
      coverageComplete: normalizedRows.length >= expectedRowCount,
      sourceAlignmentStatus,
      normalizedHourlyRows: normalizedRows.length,
      nearTermRange: {
        anchorStart,
        anchorEnd: nearTermEnd,
        rowCount: nearTermRows.length,
      },
      temperatureBasis: temperatureDiagnostics.temperatureBasis,
      precipitationSignalType: precipitationSignal.precipitationSignalType,
      cloudLayerCoverageCounts: {
        totalHours: cloudLayerCoverage.totalHoursCount,
        completeLayerHours: cloudLayerCoverage.completeLayerHoursCount,
        missingLayerHours: cloudLayerCoverage.missingLayerHoursCount,
        lowLayerMissingHours: cloudLayerCoverage.lowLayerMissingHoursCount,
      },
      avoidedLegacyFieldPaths: [
        "currentWeather.precipitationAmountMm",
        "currentWeather.cloudLow/cloudMid/cloudHigh",
        "rawGridTemperatureC as main display temperature",
      ],
      missingDisplayInputs:
        normalizedRows.length === 0
          ? ["professionalHourlyData"]
          : cloudLayerCoverage.missingLayerFields.slice(0, 4),
    },
    "Cloud Sea display data alignment diagnostics",
  );
}

function cloudSeaTemperatureDiagnostics(result: ForecastCalculationResult): {
  readonly temperatureBasis: string;
  readonly rawGridTemperaturePresent: boolean;
  readonly terrainAdjustedTemperaturePresent: boolean;
  readonly displayTemperatureC: number | null;
  readonly cameraElevationMeters: number | null;
  readonly modelElevationMeters: number | null;
  readonly temperatureDifferenceLevel: string;
} {
  const current = result.currentWeather;
  const dailyWeather = result.dailySummaries[0]?.weather;
  const firstProfessionalHour = result.professionalHourlyData?.[0];
  const cameraElevationMeters = firstDiagnosticNumber([
    result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
    current?.temperatureAdjustment?.selectedSpotElevationMeters,
    current?.selectedSpotElevationMeters,
    dailyWeather?.selectedSpotElevationMeters,
    result.terrainAnalysis.terrainProfile.locationElevation,
    result.terrainAnalysis.terrainProfile.elevationMeters,
  ]);
  const modelElevationMeters = firstDiagnosticNumber([
    current?.temperatureAdjustment?.providerElevationMeters,
    current?.providerElevationMeters,
    dailyWeather?.providerElevationMeters,
  ]);
  const rawGridTemperatureC = firstDiagnosticNumber([
    firstProfessionalHour?.rawTemperatureC,
    current?.rawTemperature,
    averageDiagnosticNumbers(dailyWeather?.rawTempMin, dailyWeather?.rawTempMax),
  ]);
  const terrainAdjustedTemperatureC = firstDiagnosticNumber([
    firstProfessionalHour?.terrainAdjustedTemperatureC,
    current?.elevationAdjustedTemperature,
    averageDiagnosticNumbers(
      dailyWeather?.elevationAdjustedTempMin,
      dailyWeather?.elevationAdjustedTempMax,
    ),
  ]);
  const context = buildTerrainTemperatureBasisContext({
    rawGridTemperatureC,
    terrainAdjustedTemperatureC,
    displayedTemperatureC: firstProfessionalHour?.displayedTemperatureC ?? current?.temperature,
    providerTemperatureC: current?.temperature,
    elevationMeters: cameraElevationMeters,
    modelElevationMeters,
    surroundingReliefMeters:
      result.cloudSeaAnalysis.terrainSupport.localReliefMeters ??
      result.terrainAnalysis.terrainProfile.localReliefMeters ??
      result.terrainAnalysis.terrainProfile.elevationDiff5km,
    terrainType:
      result.cloudSeaAnalysis.terrainSupport.terrainType ??
      result.terrainAnalysis.terrainProfile.terrainType,
    terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
    isClassicCloudSeaEligible:
      result.cloudSeaAnalysis.terrainSupport.terrainMode === "high_mountain" ||
      result.terrainAnalysis.terrainProfile.terrainCloudSeaPotential === "high",
    windSpeedMs: current?.windSpeed ?? dailyWeather?.windSpeed,
    windGustMs: current?.windGust ?? dailyWeather?.windGust,
    humidityPercent: current?.humidity ?? dailyWeather?.humidity,
  });

  return {
    temperatureBasis: context.temperatureBasis,
    rawGridTemperaturePresent: context.rawGridTemperatureC !== null,
    terrainAdjustedTemperaturePresent: context.terrainAdjustedTemperatureC !== null,
    displayTemperatureC: context.displayTemperatureC,
    cameraElevationMeters: cameraElevationMeters ?? null,
    modelElevationMeters: modelElevationMeters ?? null,
    temperatureDifferenceLevel: context.differenceLevel,
  };
}

function firstDiagnosticNumber(values: readonly (number | null | undefined)[]): number | undefined {
  return values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
}

function averageDiagnosticNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
): number | undefined {
  if (
    typeof left === "number" &&
    Number.isFinite(left) &&
    typeof right === "number" &&
    Number.isFinite(right)
  ) {
    return Math.round(((left + right) / 2) * 10) / 10;
  }
  return undefined;
}

function firstValidDiagnosticTime(...values: readonly (string | undefined)[]): string {
  return values.find((value) => value !== undefined && Number.isFinite(Date.parse(value))) ?? "";
}

function nearTermDiagnosticWindowEnd(startTime: string, forecastEnd: string): string {
  const startTimestamp = Date.parse(startTime);
  const forecastEndTimestamp = Date.parse(forecastEnd);
  if (!Number.isFinite(startTimestamp)) {
    return forecastEnd;
  }
  const sixHoursLater = new Date(startTimestamp + 6 * 60 * 60 * 1000).toISOString();
  const sixHoursLaterTimestamp = Date.parse(sixHoursLater);
  if (
    Number.isFinite(forecastEndTimestamp) &&
    Number.isFinite(sixHoursLaterTimestamp) &&
    forecastEndTimestamp > startTimestamp
  ) {
    return new Date(Math.min(forecastEndTimestamp, sixHoursLaterTimestamp)).toISOString();
  }
  return sixHoursLater;
}

function normalizedDiagnosticRowCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 24;
}

function professionalRowsAtOrAfter(
  rows: NonNullable<ForecastCalculationResult["professionalHourlyData"]>,
  anchorStart: string,
): NonNullable<ForecastCalculationResult["professionalHourlyData"]> {
  const anchorMs = Date.parse(anchorStart);
  if (!Number.isFinite(anchorMs)) {
    return rows;
  }
  return rows
    .map((row) => ({ row, timestamp: Date.parse(row.time) }))
    .filter(
      (
        entry,
      ): entry is {
        readonly row: NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number];
        readonly timestamp: number;
      } => Number.isFinite(entry.timestamp) && entry.timestamp >= anchorMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .map((entry) => entry.row);
}

function logForecastCalculationFailure(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly astroServiceConfig: AstroServiceConfig;
  readonly error: unknown;
  readonly category?: string;
  readonly transient?: boolean;
}): void {
  const { logger, route, queryLike, astroServiceConfig, error, category, transient } = options;
  const normalizedError = normalizeError(error);
  const astroError = error instanceof AstroServiceClientError ? error : null;
  const query = extractForecastQueryLogFields(queryLike);
  const diagnostics = astroError?.diagnostics;

  logger.error(
    {
      route,
      target: query.target,
      horizon: query.horizon,
      astroServiceEnabled: astroServiceConfig.enabled,
      astroServiceUrl: astroServiceConfig.logUrl,
      astroServiceConfiguredUrl: sanitizeAstroServiceUrlForLog(astroServiceConfig.configuredUrl),
      astroServiceTimeoutMs: astroServiceConfig.timeoutMs,
      coordinatesPresent: query.coordinatesPresent,
      locationName: query.locationName,
      failureCategory: category,
      transient,
      errorName: diagnostics?.upstreamErrorName ?? normalizedError.name,
      errorMessage: diagnostics?.upstreamErrorMessage ?? normalizedError.message,
      wrappedErrorName: normalizedError.name,
      wrappedErrorMessage: normalizedError.message,
      upstreamAstroServiceStatus: diagnostics?.status,
      elapsedMs: diagnostics?.elapsedMs,
      upstreamAstroServiceTimeoutMs: diagnostics?.timeoutMs,
      upstreamAstroServiceTimedOut: diagnostics?.timedOut,
    },
    "Forecast calculation failed",
  );
}

function logForecastCalculationAttempt(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly attempt: number;
  readonly maxAttempts: number;
}): void {
  const query = extractForecastQueryLogFields(options.queryLike);
  options.logger.info(
    {
      route: options.route,
      target: query.target,
      horizon: query.horizon,
      attempt: options.attempt,
      maxAttempts: options.maxAttempts,
    },
    "Forecast calculation attempt started",
  );
}

function logForecastCalculationRetry(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly attempt: number;
  readonly nextAttempt: number;
  readonly category: string;
  readonly statusCode?: number;
}): void {
  const query = extractForecastQueryLogFields(options.queryLike);
  options.logger.warn(
    {
      route: options.route,
      target: query.target,
      horizon: query.horizon,
      attempt: options.attempt,
      nextAttempt: options.nextAttempt,
      retryReason: options.category,
      statusCode: options.statusCode,
    },
    "Forecast calculation transient failure; retrying",
  );
}

function logForecastCalculationStaleServed(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly category: string;
}): void {
  const query = extractForecastQueryLogFields(options.queryLike);
  options.logger.warn(
    {
      route: options.route,
      target: query.target,
      horizon: query.horizon,
      staleIfErrorServed: true,
      failureCategory: options.category,
    },
    "Forecast calculation served stale result after transient failure",
  );
}

function logForecastCalculationCacheEvent(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly event: "cache_hit" | "in_flight_hit";
}): void {
  const query = extractForecastQueryLogFields(options.queryLike);
  options.logger.info(
    {
      route: options.route,
      target: query.target,
      horizon: query.horizon,
      cacheHit: options.event === "cache_hit",
      inFlightHit: options.event === "in_flight_hit",
    },
    "Forecast calculation cache event",
  );
}

function extractForecastQueryLogFields(queryLike: unknown): {
  readonly target: string | null;
  readonly horizon: string | null;
  readonly locationName: string | null;
  readonly coordinatesPresent: {
    readonly latitudeWgs84: boolean;
    readonly longitudeWgs84: boolean;
  };
} {
  if (!queryLike || typeof queryLike !== "object") {
    return {
      target: null,
      horizon: null,
      locationName: null,
      coordinatesPresent: {
        latitudeWgs84: false,
        longitudeWgs84: false,
      },
    };
  }

  const record = queryLike as Record<string, unknown>;
  return {
    target: typeof record.target === "string" ? record.target : null,
    horizon: typeof record.horizon === "string" ? record.horizon : null,
    locationName: typeof record.name === "string" ? record.name : null,
    coordinatesPresent: {
      latitudeWgs84: Number.isFinite(record.latitudeWgs84),
      longitudeWgs84: Number.isFinite(record.longitudeWgs84),
    },
  };
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}
