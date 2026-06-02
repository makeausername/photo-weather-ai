import { createHash } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import {
  bufferedForecastRequestHours,
  buildForecastDateRange,
  forecastDateRangeErrorMessage,
  resolveForecastWindowRange,
} from "@photo-weather/calendar";
import { buildCalibrationLocationKey, findCalibrationHint } from "@photo-weather/calibration";
import {
  type ForecastCalculationResult,
  type ElevationSource,
  type ForecastQueryInput,
  forecastHorizonLabels,
  normalizeForecastQueryInput,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import {
  buildDeepSeekForecastExplanationRequest,
  createRuleBasedForecastExplanation,
  DeepSeekProviderError,
  isDeepSeekProviderError,
  type DeepSeekInterpretationErrorCategory,
  type ForecastAiExplanation,
} from "@photo-weather/ai";
import type { DatabaseClient } from "@photo-weather/db";
import { buildForecastInputFromWeatherBundle, calculateForecast } from "@photo-weather/scoring";
import {
  MockTerrainProvider,
  type ElevationProvider,
  type TerrainElevationService,
  type TerrainProvider,
} from "@photo-weather/terrain";
import {
  createWeatherProvider,
  WeatherDataService,
  type WeatherProvider,
} from "@photo-weather/weather";
import { z, type ZodError } from "zod";
import {
  createRealDeepSeekProvider,
  readRuntimeDeepSeekConfig,
  type RuntimeDeepSeekConfig,
} from "./ai-provider.js";
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
  resolveAstroServiceConfig,
  sanitizeAstroServiceUrlForLog,
  type AstroServiceClientLike,
  type AstroServiceConfig,
} from "./astro-service-client.js";
import { createRuntimeElevationService } from "./elevation-service.js";

export type ForecastRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly weatherProvider?: WeatherProvider;
  readonly weatherDataService?: WeatherDataServiceLike;
  readonly terrainProvider?: TerrainProvider;
  readonly elevationProvider?: ElevationProvider;
  readonly elevationService?: TerrainElevationService;
  readonly astroServiceClient?: AstroServiceClientLike;
  readonly env?: NodeJS.ProcessEnv;
};

type ForecastCalculationWithAiResult = ForecastCalculationResult & {
  aiExplanation?: ForecastAiExplanation;
  aiExplanationError?: string;
};

type CachedDeepSeekForecastInterpretation = {
  readonly interpretation: ForecastAiExplanation;
  readonly model: string;
  readonly promptSizeChars: number;
  readonly createdAt: number;
};

const deepSeekForecastInterpretationCacheTtlMs = 1000 * 60 * 60;
const deepSeekForecastInterpretationCache = new Map<
  string,
  CachedDeepSeekForecastInterpretation
>();

const missingWgs84CoordinateErrorMessage = "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。";

const forecastCalculateRequestSchema = forecastQueryInputSchema.extend({
  useAiExplanation: z.boolean().optional().default(false),
  elevationMeters: z.number().finite().nullable().optional(),
  timezone: z.string().trim().min(1).optional(),
  startDateTime: z.string().datetime({ offset: true }).optional(),
});

type ForecastCalculationOptions = {
  readonly timezone?: string;
  readonly startDateTime?: string;
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

function terrainAnalysisSourceFields(elevationSource: ElevationSource): Pick<
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

    const { useAiExplanation: _useAiExplanation, timezone, startDateTime, ...query } =
      parsedBody.data;
    const result = await calculateForecastResultOrReply(
      query,
      { timezone, startDateTime },
      weatherDataService,
      terrainProvider,
      elevationService,
      astroServiceClient,
      astroServiceConfig,
      options.dbClient,
      reply,
      request.log,
    );
    if (!result) {
      return reply;
    }

    return reply.send(withDeterministicAiExplanation(result));
  });

  app.post("/forecast/ai-explain", async (request, reply) => {
    const parsedBody = forecastQueryInputSchema.safeParse(
      normalizeForecastQueryInput(request.body),
    );
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }
    const { timezone, ...query } = parsedBody.data;

    const result = await calculateForecastResultOrReply(
      query,
      { timezone },
      weatherDataService,
      terrainProvider,
      elevationService,
      astroServiceClient,
      astroServiceConfig,
      options.dbClient,
      reply,
      request.log,
    );
    if (!result) {
      return reply;
    }
    const runtimeDeepSeek = await readRuntimeDeepSeekConfigOrDisabled({
      dbClient: options.dbClient,
      env,
    });
    const promptSizeChars = runtimeDeepSeek ? estimateDeepSeekPromptSize(result, runtimeDeepSeek) : 0;
    const unavailableCategory = classifyRuntimeDeepSeekUnavailable(runtimeDeepSeek);

    if (!runtimeDeepSeek || unavailableCategory) {
      request.log.info({
        route: "/forecast/ai-explain",
        model: runtimeDeepSeek?.model ?? "deepseek-v4-pro",
        timeoutMs: runtimeDeepSeek?.timeoutMs ?? 90000,
        promptSizeChars,
        latencyMs: 0,
        parseSuccess: false,
        errorCategory: unavailableCategory ?? "disabled",
      });
      return reply.send(
        buildAiExplainFailureResponse({
          result,
          runtimeDeepSeek,
          errorCategory: unavailableCategory ?? "disabled",
          latencyMs: 0,
          promptSizeChars,
          attempts: 0,
        }),
      );
    }

    const cacheKey = createForecastInterpretationCacheKey(result);
    const cachedInterpretation = readCachedDeepSeekForecastInterpretation(cacheKey);
    if (cachedInterpretation) {
      request.log.info({
        route: "/forecast/ai-explain",
        model: cachedInterpretation.model,
        timeoutMs: runtimeDeepSeek.timeoutMs,
        promptSizeChars: cachedInterpretation.promptSizeChars,
        latencyMs: 0,
        attempts: 0,
        parseSuccess: true,
        errorCategory: null,
        cacheHit: true,
      });

      return reply.send(
        buildAiExplainSuccessResponse({
          interpretation: cachedInterpretation.interpretation,
          runtimeDeepSeek,
          latencyMs: 0,
          promptSizeChars: cachedInterpretation.promptSizeChars,
          attempts: 0,
          cacheHit: true,
        }),
      );
    }

    const startedAt = Date.now();

    try {
      const deepSeekProvider = await createRealDeepSeekProvider({
        dbClient: options.dbClient,
        env,
        fetcher: globalThis.fetch,
      });
      const retryResult = await withDeepSeekExplanationDeadline(
        generateDeepSeekExplanationWithRetry({
          provider: deepSeekProvider,
          forecastResult: result,
        }),
        {
          timeoutMs: runtimeDeepSeek.timeoutMs,
          promptSizeChars,
        },
      );
      writeCachedDeepSeekForecastInterpretation(cacheKey, {
        interpretation: retryResult.explanation,
        model: runtimeDeepSeek.model,
        promptSizeChars,
        createdAt: Date.now(),
      });
      request.log.info({
        route: "/forecast/ai-explain",
        model: runtimeDeepSeek.model,
        timeoutMs: runtimeDeepSeek.timeoutMs,
        promptSizeChars,
        latencyMs: Date.now() - startedAt,
        attempts: retryResult.attempts,
        parseSuccess: true,
        errorCategory: null,
      });

      return reply.send(
        buildAiExplainSuccessResponse({
          interpretation: retryResult.explanation,
          runtimeDeepSeek,
          latencyMs: Date.now() - startedAt,
          promptSizeChars,
          attempts: retryResult.attempts,
          cacheHit: false,
        }),
      );
    } catch (error) {
      const normalized = normalizeDeepSeekExplanationError(error);
      const latencyMs = normalized.latencyMs ?? Date.now() - startedAt;
      const failurePromptSizeChars = normalized.promptSizeChars ?? promptSizeChars;
      request.log.warn({
        route: "/forecast/ai-explain",
        model: runtimeDeepSeek.model,
        timeoutMs: runtimeDeepSeek.timeoutMs,
        promptSizeChars: failurePromptSizeChars,
        latencyMs,
        parseSuccess: false,
        errorCategory: normalized.errorCategory,
      });
      return reply.send(
        buildAiExplainFailureResponse({
          result,
          runtimeDeepSeek,
          errorCategory: normalized.errorCategory,
          latencyMs,
          promptSizeChars: failurePromptSizeChars,
          attempts: normalized.attempts,
        }),
      );
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
      const forecastRequestHours = bufferedForecastRequestHours("24h");
      const bundle = await weatherDataService.getWeatherDataBundle({
        coordinates: {
          latitude: 30.1328,
          longitude: 118.1718,
          system: "wgs84",
        },
        horizon: "24h",
        hours: forecastRequestHours,
        days: Math.max(forecastRange.targetDates.length, Math.ceil(forecastRequestHours / 24)),
        forecastStart: forecastRange.forecastStart,
        forecastEnd: forecastRange.forecastEnd,
        forecastWindowAnchorStart: forecastWindowAnchor.anchorStartLocal,
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

async function calculateForecastResultOrReply(
  query: ForecastQueryInput,
  requestOptions: ForecastCalculationOptions,
  weatherDataService: WeatherDataServiceLike,
  terrainProvider: TerrainProvider,
  elevationService: TerrainElevationService,
  astroServiceClient: AstroServiceClientLike,
  astroServiceConfig: AstroServiceConfig,
  dbClient: DatabaseClient | undefined,
  reply: FastifyReply,
  logger: FastifyBaseLogger,
): Promise<ForecastCalculationResult | null> {
  try {
    const result = await calculateForecastResult(
      query,
      requestOptions,
      weatherDataService,
      terrainProvider,
      elevationService,
      astroServiceClient,
      astroServiceConfig,
    );
    logCloudSeaCoverageDiagnostics(logger, result);
    return attachCalibrationHint(result, query, dbClient);
  } catch (error) {
    logForecastCalculationFailure({
      logger,
      route: "/forecast/calculate",
      queryLike: query,
      astroServiceConfig,
      error,
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

    throw error;
  }
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
): Promise<ForecastCalculationResult> {
  if (query.target === "astro" && astroServiceConfig.enabled && !astroServiceConfig.configuredUrl) {
    throw new Error(astroServiceUrlMissingMessage);
  }

  const forecastRange = buildForecastDateRange(query.horizon, {
    timezone: requestOptions.timezone,
  });
  const forecastWindowAnchor = resolveForecastWindowRange({
    generatedAt: forecastRange.forecastStart,
    timezone: forecastRange.timezone,
    horizon: query.horizon,
    requestedForecastHours: forecastRange.horizonHours,
  });
  const forecastRequestHours = bufferedForecastRequestHours(query.horizon);
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
      hours: forecastRequestHours,
      days: Math.max(forecastRange.targetDates.length, Math.ceil(forecastRequestHours / 24)),
      forecastStart: forecastRange.forecastStart,
      forecastEnd: forecastRange.forecastEnd,
      forecastWindowAnchorStart: forecastWindowAnchor.anchorStartLocal,
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

  if (query.target !== "astro") {
    return calculateForecast(calculationInput);
  }

  if (!astroServiceConfig.enabled) {
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

  return calculateForecast({
    ...calculationInput,
    astroSummaries: astroServiceData.astroSummaries,
    astroWindowBundle: astroServiceData.astroWindowBundle,
    astroCalculationBasis: astroServiceData.astroCalculationBasis,
    astroDataSourceLabelZh: astroServiceData.astroDataSourceLabelZh,
  });
}

async function readRuntimeDeepSeekConfigOrDisabled(options: {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<RuntimeDeepSeekConfig | null> {
  try {
    return await readRuntimeDeepSeekConfig(options);
  } catch {
    return null;
  }
}

function classifyRuntimeDeepSeekUnavailable(
  runtimeDeepSeek: RuntimeDeepSeekConfig | null,
): DeepSeekInterpretationErrorCategory | null {
  if (!runtimeDeepSeek?.enabled || !runtimeDeepSeek.realCallEnabled) {
    return "disabled";
  }
  if (!runtimeDeepSeek.apiKeyPresent) {
    return "missing_api_key";
  }
  return null;
}

function estimateDeepSeekPromptSize(
  result: ForecastCalculationResult,
  runtimeDeepSeek: RuntimeDeepSeekConfig,
): number {
  try {
    const request = buildDeepSeekForecastExplanationRequest(
      { forecastResult: result },
      {
        baseUrl: runtimeDeepSeek.baseUrl,
        defaultModel: runtimeDeepSeek.model,
        temperature: runtimeDeepSeek.temperature,
        maxTokens: runtimeDeepSeek.maxTokens,
        responseFormat: runtimeDeepSeek.responseFormat,
        thinkingEnabled: runtimeDeepSeek.thinkingEnabled,
        reasoningEffort: runtimeDeepSeek.reasoningEffort,
        jsonOutputEnabled: runtimeDeepSeek.jsonOutputEnabled,
      },
    );
    return request.promptSizeChars;
  } catch {
    return -1;
  }
}

function withDeterministicAiExplanation(
  result: ForecastCalculationResult,
): ForecastCalculationWithAiResult {
  return {
    ...result,
    aiExplanation: buildDeterministicFallbackInterpretation(result),
  };
}

function buildAiExplainSuccessResponse(options: {
  readonly interpretation: ForecastAiExplanation;
  readonly runtimeDeepSeek: RuntimeDeepSeekConfig;
  readonly latencyMs: number;
  readonly promptSizeChars: number;
  readonly attempts: number;
  readonly cacheHit: boolean;
}) {
  return {
    success: true,
    source: "deepseek" as const,
    model: options.runtimeDeepSeek.model,
    interpretation: options.interpretation,
    latencyMs: options.latencyMs,
    promptSizeChars: options.promptSizeChars,
    parseSuccess: true,
    retryable: false,
    cacheHit: options.cacheHit,
    fallback: false,
    explanation: options.interpretation,
    diagnostics: {
      model: options.runtimeDeepSeek.model,
      timeoutMs: options.runtimeDeepSeek.timeoutMs,
      promptSizeChars: options.promptSizeChars,
      latencyMs: options.latencyMs,
      attempts: options.attempts,
      parseSuccess: true,
      cacheHit: options.cacheHit,
    },
  };
}

function buildAiExplainFailureResponse(options: {
  readonly result: ForecastCalculationResult;
  readonly runtimeDeepSeek: RuntimeDeepSeekConfig | null;
  readonly errorCategory: DeepSeekInterpretationErrorCategory;
  readonly latencyMs: number;
  readonly promptSizeChars: number;
  readonly attempts?: number;
}) {
  const fallback = buildDeterministicFallbackInterpretation(options.result);
  const messageZh = deepSeekInterpretationMessageZh(options.errorCategory, true);
  const retryable = isRetryableDeepSeekErrorCategory(options.errorCategory);
  const model = options.runtimeDeepSeek?.model ?? "deepseek-v4-pro";
  const timeoutMs = options.runtimeDeepSeek?.timeoutMs ?? 90000;

  return {
    success: false,
    source: "fallback" as const,
    fallback: true,
    fallbackInterpretation: fallback,
    explanation: fallback,
    interpretation: fallback,
    errorCategory: options.errorCategory,
    messageZh,
    retryable,
    latencyMs: options.latencyMs,
    model,
    promptSizeChars: options.promptSizeChars,
    parseSuccess: false,
    error: legacyAiExplanationErrorCode(options.errorCategory),
    message: messageZh,
    diagnostics: {
      model,
      timeoutMs,
      promptSizeChars: options.promptSizeChars,
      latencyMs: options.latencyMs,
      attempts: options.attempts ?? 0,
      parseSuccess: false,
      fallback: true,
      errorCategory: options.errorCategory,
    },
  };
}

function buildDeterministicFallbackInterpretation(
  result: ForecastCalculationResult,
): ForecastAiExplanation {
  try {
    return createRuleBasedForecastExplanation(result);
  } catch {
    return createEmergencyForecastExplanation(result);
  }
}

function createEmergencyForecastExplanation(result: ForecastCalculationResult): ForecastAiExplanation {
  const bestWindow = result.bestWindows[0];
  const bestDay = result.dailySummaries[0];
  const primarySubject = bestSubjectLabel(result, 0);
  const backupSubject = bestSubjectLabel(result, 1);
  const mainRisk = result.riskFlags[0];
  const riskWindow = mainRisk?.timeWindowLabelZh ?? "出行前后";
  const weather = bestDay?.weather;

  const dayByDay =
    result.dailySummaries.length > 0
      ? result.dailySummaries.slice(0, 5).map((day) => ({
          dateZh: day.dateLabelZh,
          recommendationZh: day.dedicatedTripRecommendation ?? day.recommendationLabel,
          scoreZh: `综合 ${day.score} 分`,
          temperatureZh: day.weather
            ? `${Math.round(day.weather.tempMin ?? 0)}-${Math.round(day.weather.tempMax ?? 0)}°C`
            : "温度待复核",
          rainZh: day.weather?.mainPrecipitationPeriodLabelZh ?? "降水待复核",
          cloudSeaZh: result.scores.cloudSea.label,
          glowZh: result.scores.sunriseGlow.label,
          sunsetGlowZh: result.scores.sunsetGlow.label,
          astroZh: result.scores.milkyWay.label,
          transparencyZh: result.scores.transparency.label,
          bestWindowZh: day.bestShootableWindow
            ? `${day.bestShootableWindow.label} ${day.bestShootableWindow.startTime} 至 ${day.bestShootableWindow.endTime}`
            : "暂无高确定性拍摄窗口",
          actionZh: day.shortAdvice,
        }))
      : [
          {
            dateZh: "当前结果",
            recommendationZh: result.recommendationLabel,
            scoreZh: `综合 ${result.overallScore} 分`,
            temperatureZh: "温度待复核",
            rainZh: "降水待复核",
            cloudSeaZh: result.scores.cloudSea.label,
            glowZh: result.scores.sunriseGlow.label,
            sunsetGlowZh: result.scores.sunsetGlow.label,
            astroZh: result.scores.milkyWay.label,
            transparencyZh: result.scores.transparency.label,
            bestWindowZh: bestWindow
              ? `${bestWindow.label} ${bestWindow.startTime} 至 ${bestWindow.endTime}`
              : "暂无高确定性拍摄窗口",
            actionZh: result.photographyAdvice[0] ?? result.summary,
          },
        ];

  return {
    conclusion: {
      titleZh: `${result.place.name}拍摄天气简版解读`,
      summaryZh: result.summary,
      recommendedDayZh: bestDay
        ? `${bestDay.dateLabelZh}最值得关注，${bestDay.shortAdvice}`
        : "暂未取得逐日摘要，请先参考综合评分与窗口列表。",
      recommendationLevelZh: result.recommendationLabel,
      whetherWorthDedicatedTripZh:
        bestDay?.dedicatedTripRecommendation ?? result.recommendationLabel,
      oneSentenceDecisionZh: `${result.recommendationLabel}，优先关注${bestWindow?.label ?? primarySubject}。`,
    },
    bestPlan: {
      primaryTargetZh: primarySubject,
      bestDateZh: bestDay?.dateLabelZh ?? bestWindow?.date ?? "日期待复核",
      bestWindowZh: bestWindow
        ? `${bestWindow.startTime} 至 ${bestWindow.endTime}`
        : "暂无明确高确定性窗口",
      recommendedArrivalZh: bestWindow?.arrivalAdvice?.recommendedArrivalLabel ?? "按主窗口提前到位",
      whyThisWindowZh: bestWindow?.copyReasonZh ?? result.keyReasons[0] ?? result.summary,
      backupPlanZh: `备用题材：${backupSubject}；若主窗口不成立，转向近景、云层纹理或等待下一轮短临预报。`,
    },
    weatherTrend: {
      trendSummaryZh: result.summary,
      temperatureSummaryZh: weather
        ? `温度约 ${Math.round(weather.tempMin ?? 0)}-${Math.round(weather.tempMax ?? 0)}°C。`
        : "温度需结合天气卡片复核。",
      rainSummaryZh: weather?.mainPrecipitationPeriodLabelZh ?? "降水需结合天气卡片复核。",
      windSummaryZh:
        typeof weather?.windSpeed === "number"
          ? `平均风速约 ${Math.round(weather.windSpeed)} m/s，阵风和山脊风需复核。`
          : "风力需结合天气卡片复核。",
      transparencySummaryZh: result.scores.transparency
        ? `${result.scores.transparency.label} ${Math.round(result.scores.transparency.score)} 分。`
        : "通透度需结合确定性评分复核。",
    },
    dayByDay,
    subjectAdvice: {
      cloudSeaZh: `${result.scores.cloudSea.label} ${Math.round(result.scores.cloudSea.score)} 分，白墙风险 ${Math.round(result.scores.whiteoutRisk.score)} 分。`,
      sunriseGlowZh: `${result.scores.sunriseGlow.label} ${Math.round(result.scores.sunriseGlow.score)} 分，需复核日出前后低云遮挡。`,
      sunsetGlowZh: `${result.scores.sunsetGlow.label} ${Math.round(result.scores.sunsetGlow.score)} 分，需复核西向云层开口。`,
      astroMilkyWayZh: `${result.scores.milkyWay.label} ${Math.round(result.scores.milkyWay.score)} 分，云量、月光和通透度仍需复核。`,
      transparencyZh: `${result.scores.transparency.label} ${Math.round(result.scores.transparency.score)} 分，远山层次和长焦细节按现场能见度确认。`,
    },
    riskAndGear: {
      keyRisks: mainRisk
        ? [`${mainRisk.label}（${riskWindow}）：${mainRisk.description}`]
        : ["暂无高等级风险，但仍需出行前复核短临天气、道路和景区安全。"],
      clothingZh: result.clothingGuide.summaryZh,
      gearZh:
        result.clothingGuide.accessories.slice(0, 3).join("、") ||
        "建议携带三脚架、防潮袋、头灯、备用电池和防风外套。",
      safetyZh: "保留撤离时间，遇到强风、雷雨、低能见度或道路风险时不要硬等窗口。",
    },
    finalAdvice: {
      goNoGoZh: result.recommendationLabel,
      ifAlreadyNearbyZh: bestDay?.nearbyObservationAdviceZh ?? "已在附近可短时观察云层开口。",
      ifDedicatedTripZh:
        bestDay?.dedicatedTripAdviceZh ?? "专程出发前需等待短临降水、低云和阵风复核。",
      nextCheckZh: "下一次重点复核短临降水、低云高度、能见度、阵风和主窗口前后云层开口。",
    },
    metadata: {
      source: "deterministic_fallback",
      noteZh: "基于确定性计算结果生成的简版解读。",
    },
  };
}

function bestSubjectLabel(result: ForecastCalculationResult, index: number): string {
  const rankedScores = [
    result.scores.cloudSea,
    result.scores.sunriseGlow,
    result.scores.sunsetGlow,
    result.scores.milkyWay,
    result.scores.stars,
    result.scores.transparency,
  ].sort((left, right) => right.score - left.score);

  return rankedScores[index]?.label ?? rankedScores[0]?.label ?? "综合题材";
}

function createForecastInterpretationCacheKey(result: ForecastCalculationResult): string {
  const resultWithIds = result as ForecastCalculationResult & {
    readonly resultId?: unknown;
    readonly reportId?: unknown;
  };
  if (typeof resultWithIds.reportId === "string" && resultWithIds.reportId.trim()) {
    return `report:${resultWithIds.reportId.trim()}`;
  }
  if (typeof resultWithIds.resultId === "string" && resultWithIds.resultId.trim()) {
    return `result:${resultWithIds.resultId.trim()}`;
  }

  const stableSummary = {
    location: {
      id: result.place.id,
      name: result.place.name,
      latitude: roundCoordinateForCache(result.place.coordinates.latitude),
      longitude: roundCoordinateForCache(result.place.coordinates.longitude),
    },
    horizon: result.horizon,
    target: result.target,
    forecastWindowAnchorStart:
      result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
    forecastGeneratedAtBucket: bucketForecastGeneratedAt(result.generatedAt),
    summary: result.summary,
    overallScore: result.overallScore,
    recommendationLabel: result.recommendationLabel,
    keyReasons: result.keyReasons.slice(0, 4),
  };

  return `hash:${createHash("sha256")
    .update(JSON.stringify(stableSummary))
    .digest("hex")
    .slice(0, 32)}`;
}

function roundCoordinateForCache(value: number): number {
  return Math.round(value * 100000) / 100000;
}

function bucketForecastGeneratedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value.slice(0, 13);
  }
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

function readCachedDeepSeekForecastInterpretation(
  cacheKey: string,
): CachedDeepSeekForecastInterpretation | null {
  const cached = deepSeekForecastInterpretationCache.get(cacheKey);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.createdAt > deepSeekForecastInterpretationCacheTtlMs) {
    deepSeekForecastInterpretationCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function writeCachedDeepSeekForecastInterpretation(
  cacheKey: string,
  cached: CachedDeepSeekForecastInterpretation,
): void {
  deepSeekForecastInterpretationCache.set(cacheKey, cached);
}

function deepSeekInterpretationMessageZh(
  category: DeepSeekInterpretationErrorCategory,
  fallbackAvailable: boolean,
): string {
  const suffix = fallbackAvailable
    ? "已显示基于确定性计算结果生成的简版解读。"
    : "确定性判断结果仍可正常参考，可稍后重试。";
  switch (category) {
    case "disabled":
      return `DeepSeek 智能解读未启用，${suffix}`;
    case "missing_api_key":
      return `DeepSeek API Key 未配置，${suffix}`;
    case "timeout":
      return `DeepSeek 请求超时，${suffix}`;
    case "network_error":
      return `DeepSeek 网络请求失败，${suffix}`;
    case "upstream_401":
      return `DeepSeek API Key 无效或权限不足，${suffix}`;
    case "upstream_429":
      return `DeepSeek 上游限流，${suffix}`;
    case "upstream_5xx":
      return `DeepSeek 上游服务暂时不可用，${suffix}`;
    case "parse_error":
      return `DeepSeek 返回内容无法解析，${suffix}`;
    case "empty_response":
      return `DeepSeek 返回内容为空，${suffix}`;
    case "prompt_too_large":
      return `DeepSeek 解读上下文过大，${suffix}`;
    case "unknown":
      return `DeepSeek 解读暂时不可用，${suffix}`;
  }
}

function isRetryableDeepSeekErrorCategory(category: DeepSeekInterpretationErrorCategory): boolean {
  return (
    category === "timeout" ||
    category === "network_error" ||
    category === "upstream_429" ||
    category === "upstream_5xx" ||
    category === "parse_error" ||
    category === "empty_response" ||
    category === "unknown"
  );
}

function legacyAiExplanationErrorCode(
  category: DeepSeekInterpretationErrorCategory,
): "ai_explanation_timeout" | "ai_explanation_unavailable" {
  return category === "timeout" ? "ai_explanation_timeout" : "ai_explanation_unavailable";
}

async function generateDeepSeekExplanationWithRetry(options: {
  readonly provider: Awaited<ReturnType<typeof createRealDeepSeekProvider>>;
  readonly forecastResult: ForecastCalculationResult;
}): Promise<{ readonly explanation: ForecastAiExplanation; readonly attempts: number }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return {
        explanation: await options.provider.generateForecastExplanation({
          forecastResult: options.forecastResult,
        }),
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isRetryableDeepSeekInterpretationError(error)) {
        throw error;
      }
      await delay(700);
    }
  }

  throw lastError;
}

async function withDeepSeekExplanationDeadline<T>(
  promise: Promise<T>,
  options: {
    readonly timeoutMs: number;
    readonly promptSizeChars: number;
  },
): Promise<T> {
  const boundedTimeoutMs = Math.min(options.timeoutMs + 5000, 125000);
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new DeepSeekProviderError({
              errorCategory: "timeout",
              messageZh: "DeepSeek 服务请求超时。",
              promptSizeChars: options.promptSizeChars,
            }),
          );
        }, boundedTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function isRetryableDeepSeekInterpretationError(error: unknown): boolean {
  if (isDeepSeekProviderError(error)) {
    return (
      error.errorCategory === "network_error" ||
      error.errorCategory === "upstream_429" ||
      error.errorCategory === "upstream_5xx"
    );
  }

  return isAbortOrTimeoutError(readErrorCause(error)) || isAbortOrTimeoutError(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeDeepSeekExplanationError(error: unknown): {
  readonly statusCode: 503 | 504;
  readonly error: "ai_explanation_timeout" | "ai_explanation_unavailable";
  readonly message: string;
  readonly errorCategory: DeepSeekInterpretationErrorCategory;
  readonly messageZh: string;
  readonly retryable: boolean;
  readonly latencyMs?: number;
  readonly promptSizeChars?: number;
  readonly attempts?: number;
} {
  const providerError = isDeepSeekProviderError(error) ? error : undefined;
  if (
    (isDeepSeekProviderError(error) && error.errorCategory === "timeout") ||
    (isDeepSeekProviderError(error) && isAbortOrTimeoutError(error.cause)) ||
    isAbortOrTimeoutError(readErrorCause(error)) ||
    isAbortOrTimeoutError(error)
  ) {
    return {
      statusCode: 504,
      error: "ai_explanation_timeout",
      errorCategory: "timeout",
      messageZh: "DeepSeek 解读暂时超时，已保留确定性分析结果，可稍后重试。",
      retryable: true,
      latencyMs: providerError?.latencyMs,
      promptSizeChars: providerError?.promptSizeChars,
      message: "DeepSeek 解读暂时超时，已保留确定性分析结果，可稍后重试。",
    };
  }

  const errorCategory = providerError?.errorCategory ?? "unknown";
  const retryable = isRetryableDeepSeekErrorCategory(errorCategory);
  const messageZh =
    errorCategory === "upstream_401"
      ? "DeepSeek API Key 无效或权限不足，确定性分析结果已保留。"
      : "DeepSeek 解读暂时不可用，已保留确定性分析结果，可稍后重试。";

  return {
    statusCode: 503,
    error: "ai_explanation_unavailable",
    errorCategory,
    messageZh,
    retryable,
    latencyMs: providerError?.latencyMs,
    promptSizeChars: providerError?.promptSizeChars,
    message: "DeepSeek 解读暂时不可用，已保留确定性分析结果。",
  };
}

function readErrorCause(error: unknown): unknown {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return (error as { readonly cause?: unknown }).cause;
}

function isAbortOrTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { readonly name?: unknown; readonly message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";

  return name === "AbortError" || message.includes("timed out") || message.includes("timeout");
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

function logCloudSeaCoverageDiagnostics(
  logger: FastifyBaseLogger,
  result: ForecastCalculationResult,
): void {
  if (result.target !== "cloud_sea") {
    return;
  }
  const basis = result.professionalHourlyDataTimeBasis;
  const coverage = basis?.fieldCoverageSummary;
  if (!basis || !coverage) {
    logger.info(
      {
        route: "/forecast/calculate",
        target: result.target,
        requestedForecastHours: result.calendarBasis.horizonHours,
        professionalHourlyRows: result.professionalHourlyData?.length ?? 0,
        cloudLayerCoverage: "unavailable",
      },
      "Cloud Sea cloud-layer coverage diagnostics",
    );
    return;
  }

  logger.info(
    {
      route: "/forecast/calculate",
      target: result.target,
      requestedForecastHours: result.calendarBasis.horizonHours,
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
    },
    "Cloud Sea cloud-layer coverage diagnostics",
  );
}

function logForecastCalculationFailure(options: {
  readonly logger: FastifyBaseLogger;
  readonly route: string;
  readonly queryLike: unknown;
  readonly astroServiceConfig: AstroServiceConfig;
  readonly error: unknown;
}): void {
  const { logger, route, queryLike, astroServiceConfig, error } = options;
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
      errorName: diagnostics?.upstreamErrorName ?? normalizedError.name,
      errorMessage: diagnostics?.upstreamErrorMessage ?? normalizedError.message,
      wrappedErrorName: normalizedError.name,
      wrappedErrorMessage: normalizedError.message,
      stack: normalizedError.stack,
      upstreamAstroServiceStatus: diagnostics?.status,
      upstreamAstroServiceResponseBodyExcerpt: diagnostics?.responseBodyExcerpt,
      elapsedMs: diagnostics?.elapsedMs,
      upstreamAstroServiceTimeoutMs: diagnostics?.timeoutMs,
      upstreamAstroServiceTimedOut: diagnostics?.timedOut,
    },
    "Forecast calculation failed",
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
