import { createHash } from "node:crypto";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
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
  type ForecastAiExplanationParseStrategy,
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

type DisplayableAiExplanation = ForecastAiExplanation & {
  readonly summaryText: string;
  readonly reasons: readonly string[];
  readonly suggestions: readonly string[];
  readonly risks: readonly string[];
};

const deepSeekForecastInterpretationCacheTtlMs = 1000 * 60 * 60;
const deepSeekForecastInterpretationCache = new Map<string, CachedDeepSeekForecastInterpretation>();

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

    const {
      useAiExplanation: _useAiExplanation,
      timezone,
      startDateTime,
      ...query
    } = parsedBody.data;
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
    const promptSizeChars = runtimeDeepSeek
      ? estimateDeepSeekPromptSize(result, runtimeDeepSeek)
      : 0;
    const unavailableCategory = classifyRuntimeDeepSeekUnavailable(runtimeDeepSeek);

    if (!runtimeDeepSeek || unavailableCategory) {
      request.log.info({
        route: "/forecast/ai-explain",
        targetCode: result.target,
        providerCode: "deepseek",
        model: runtimeDeepSeek?.model ?? "deepseek-v4-pro",
        timeoutMs: runtimeDeepSeek?.timeoutMs ?? 120000,
        promptSizeChars,
        outputMode: runtimeDeepSeek ? deepSeekOutputMode(runtimeDeepSeek) : "unavailable",
        latencyMs: 0,
        success: false,
        parseSuccess: false,
        parseStrategy: "failed",
        errorCategory: unavailableCategory ?? "provider_disabled",
        responseSizeChars: 0,
        rawResponseSizeChars: 0,
      });
      return reply.send(
        buildAiExplainFailureResponse({
          result,
          runtimeDeepSeek,
          errorCategory: unavailableCategory ?? "provider_disabled",
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
        targetCode: result.target,
        providerCode: "deepseek",
        model: cachedInterpretation.model,
        timeoutMs: runtimeDeepSeek.timeoutMs,
        promptSizeChars: cachedInterpretation.promptSizeChars,
        outputMode: deepSeekOutputMode(runtimeDeepSeek),
        latencyMs: 0,
        attempts: 0,
        success: true,
        parseSuccess: aiExplanationParseSuccess(cachedInterpretation.interpretation),
        parseStrategy: aiExplanationParseStrategy(cachedInterpretation.interpretation),
        fallbackUsed: aiExplanationFallbackUsed(cachedInterpretation.interpretation),
        errorCategory: null,
        responseSizeChars: safeResponseSizeChars(cachedInterpretation.interpretation),
        rawResponseSizeChars: aiExplanationRawResponseSizeChars(
          cachedInterpretation.interpretation,
        ),
        cacheHit: true,
      });

      return reply.send(
        buildAiExplainSuccessResponse({
          interpretation: cachedInterpretation.interpretation,
          runtimeDeepSeek,
          targetCode: result.target,
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
        targetCode: result.target,
        providerCode: "deepseek",
        model: runtimeDeepSeek.model,
        timeoutMs: runtimeDeepSeek.timeoutMs,
        promptSizeChars,
        outputMode: deepSeekOutputMode(runtimeDeepSeek),
        latencyMs: Date.now() - startedAt,
        attempts: retryResult.attempts,
        success: true,
        parseSuccess: aiExplanationParseSuccess(retryResult.explanation),
        parseStrategy: aiExplanationParseStrategy(retryResult.explanation),
        fallbackUsed: aiExplanationFallbackUsed(retryResult.explanation),
        errorCategory: null,
        responseSizeChars: safeResponseSizeChars(retryResult.explanation),
        rawResponseSizeChars: aiExplanationRawResponseSizeChars(retryResult.explanation),
      });

      return reply.send(
        buildAiExplainSuccessResponse({
          interpretation: retryResult.explanation,
          runtimeDeepSeek,
          targetCode: result.target,
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
        targetCode: result.target,
        providerCode: "deepseek",
        model: runtimeDeepSeek.model,
        timeoutMs: runtimeDeepSeek.timeoutMs,
        promptSizeChars: failurePromptSizeChars,
        outputMode: deepSeekOutputMode(runtimeDeepSeek),
        latencyMs,
        success: false,
        parseSuccess: false,
        parseStrategy: normalized.parseStrategy,
        errorCategory: normalized.errorCategory,
        responseSizeChars: normalized.responseSizeChars,
        rawResponseSizeChars: normalized.responseSizeChars ?? 0,
      });
      return reply.send(
        buildAiExplainFailureResponse({
          result,
          runtimeDeepSeek,
          errorCategory: normalized.errorCategory,
          retryable: normalized.retryable,
          latencyMs,
          promptSizeChars: failurePromptSizeChars,
          attempts: normalized.attempts,
          rawResponseSizeChars: normalized.responseSizeChars ?? 0,
          parseStrategy: normalized.parseStrategy,
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
    return "provider_disabled";
  }
  if (!runtimeDeepSeek.apiKeyPresent) {
    return "config_missing";
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
        promptMaxChars: runtimeDeepSeek.promptMaxChars,
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
  readonly targetCode: ForecastCalculationResult["target"];
  readonly latencyMs: number;
  readonly promptSizeChars: number;
  readonly attempts: number;
  readonly cacheHit: boolean;
}) {
  const responseSizeChars = safeResponseSizeChars(options.interpretation);
  const parseStrategy = aiExplanationParseStrategy(options.interpretation);
  const parseSuccess = aiExplanationParseSuccess(options.interpretation);
  const fallbackUsed = aiExplanationFallbackUsed(options.interpretation);
  const rawResponseSizeChars = aiExplanationRawResponseSizeChars(options.interpretation);
  const explanation = withAiExplanationDisplayFields(options.interpretation);
  const meta = {
    targetCode: options.targetCode,
    providerCode: "deepseek" as const,
    model: options.runtimeDeepSeek.model,
    timeoutMs: options.runtimeDeepSeek.timeoutMs,
    promptSizeChars: options.promptSizeChars,
    latencyMs: options.latencyMs,
    attempts: options.attempts,
    parseSuccess,
    parseStrategy,
    fallbackUsed,
    rawResponseSizeChars,
    cacheHit: options.cacheHit,
  };
  return {
    ok: true,
    success: true,
    source: "deepseek" as const,
    targetCode: options.targetCode,
    model: options.runtimeDeepSeek.model,
    explanation,
    interpretation: explanation,
    summaryText: explanation.summaryText,
    meta,
    latencyMs: options.latencyMs,
    promptSizeChars: options.promptSizeChars,
    outputMode: deepSeekOutputMode(options.runtimeDeepSeek),
    responseSizeChars,
    rawResponseSizeChars,
    parseSuccess,
    parseStrategy,
    fallbackUsed,
    retryable: false,
    cacheHit: options.cacheHit,
    fallback: false,
    diagnostics: {
      targetCode: options.targetCode,
      providerCode: "deepseek",
      model: options.runtimeDeepSeek.model,
      timeoutMs: options.runtimeDeepSeek.timeoutMs,
      promptSizeChars: options.promptSizeChars,
      outputMode: deepSeekOutputMode(options.runtimeDeepSeek),
      latencyMs: options.latencyMs,
      attempts: options.attempts,
      parseSuccess,
      parseStrategy,
      responseSizeChars,
      rawResponseSizeChars,
      fallbackUsed,
      cacheHit: options.cacheHit,
    },
  };
}

function buildAiExplainFailureResponse(options: {
  readonly result: ForecastCalculationResult;
  readonly runtimeDeepSeek: RuntimeDeepSeekConfig | null;
  readonly errorCategory: DeepSeekInterpretationErrorCategory;
  readonly retryable?: boolean;
  readonly latencyMs: number;
  readonly promptSizeChars: number;
  readonly attempts?: number;
  readonly rawResponseSizeChars?: number;
  readonly parseStrategy?: ForecastAiExplanationParseStrategy;
}) {
  const fallback = buildDeterministicFallbackInterpretation(options.result);
  const messageZh = deepSeekInterpretationMessageZh(options.errorCategory, true);
  const retryable = options.retryable ?? isRetryableDeepSeekErrorCategory(options.errorCategory);
  const model = options.runtimeDeepSeek?.model ?? "deepseek-v4-pro";
  const timeoutMs = options.runtimeDeepSeek?.timeoutMs ?? 120000;
  const outputMode = options.runtimeDeepSeek
    ? deepSeekOutputMode(options.runtimeDeepSeek)
    : "unavailable";
  const responseSizeChars = safeResponseSizeChars(fallback);
  const rawResponseSizeChars = options.rawResponseSizeChars ?? 0;
  const parseStrategy = options.parseStrategy ?? "failed";

  return {
    ok: false,
    success: false,
    source: "fallback" as const,
    targetCode: options.result.target,
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
    outputMode,
    responseSizeChars,
    rawResponseSizeChars,
    parseSuccess: false,
    parseStrategy,
    meta: {
      targetCode: options.result.target,
      providerCode: "deepseek" as const,
      model,
      timeoutMs,
      promptSizeChars: options.promptSizeChars,
      latencyMs: options.latencyMs,
      attempts: options.attempts ?? 0,
      parseSuccess: false,
      parseStrategy,
      fallbackUsed: true,
      rawResponseSizeChars,
      errorCategory: options.errorCategory,
    },
    error: legacyAiExplanationErrorCode(options.errorCategory),
    message: messageZh,
    diagnostics: {
      targetCode: options.result.target,
      providerCode: "deepseek",
      model,
      timeoutMs,
      promptSizeChars: options.promptSizeChars,
      outputMode,
      latencyMs: options.latencyMs,
      attempts: options.attempts ?? 0,
      parseSuccess: false,
      parseStrategy,
      responseSizeChars,
      rawResponseSizeChars,
      fallback: true,
      errorCategory: options.errorCategory,
    },
  };
}

function deepSeekOutputMode(
  runtimeDeepSeek: RuntimeDeepSeekConfig,
): "json_object" | "text_with_json_fallback" {
  return runtimeDeepSeek.jsonOutputEnabled ? "json_object" : "text_with_json_fallback";
}

function safeResponseSizeChars(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function aiExplanationParseStrategy(
  interpretation: ForecastAiExplanation,
): ForecastAiExplanationParseStrategy {
  return interpretation.metadata?.parseStrategy ?? "strict_json";
}

function aiExplanationFallbackUsed(interpretation: ForecastAiExplanation): boolean {
  return (
    interpretation.metadata?.fallbackUsed === true ||
    aiExplanationParseStrategy(interpretation) === "plain_text_fallback"
  );
}

function aiExplanationParseSuccess(interpretation: ForecastAiExplanation): boolean {
  return aiExplanationParseStrategy(interpretation) !== "plain_text_fallback";
}

function aiExplanationRawResponseSizeChars(interpretation: ForecastAiExplanation): number {
  return interpretation.metadata?.rawResponseSizeChars ?? safeResponseSizeChars(interpretation);
}

function withAiExplanationDisplayFields(
  interpretation: ForecastAiExplanation,
): DisplayableAiExplanation {
  const summaryText =
    firstDisplayableAiText([
      interpretation.conclusion.oneSentenceDecisionZh,
      interpretation.conclusion.summaryZh,
      interpretation.bestPlan.whyThisWindowZh,
      interpretation.finalAdvice.goNoGoZh,
    ]) ?? "已生成基于当前确定性结果的智能解读。";
  return {
    ...interpretation,
    summaryText,
    reasons: nonEmptyAiTextArray([
      interpretation.bestPlan.whyThisWindowZh,
      interpretation.weatherTrend.trendSummaryZh,
    ]),
    suggestions: nonEmptyAiTextArray([
      interpretation.finalAdvice.goNoGoZh,
      interpretation.bestPlan.backupPlanZh,
      interpretation.finalAdvice.nextCheckZh,
    ]),
    risks: nonEmptyAiTextArray(interpretation.riskAndGear.keyRisks),
  };
}

function firstDisplayableAiText(values: readonly (string | null | undefined)[]): string | undefined {
  return values.map(cleanAiDisplayText).find((value): value is string => Boolean(value));
}

function nonEmptyAiTextArray(values: readonly (string | null | undefined)[]): readonly string[] {
  return values.map(cleanAiDisplayText).filter((value): value is string => Boolean(value));
}

function cleanAiDisplayText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function createEmergencyForecastExplanation(
  result: ForecastCalculationResult,
): ForecastAiExplanation {
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
      recommendedArrivalZh:
        bestWindow?.arrivalAdvice?.recommendedArrivalLabel ?? "按主窗口提前到位",
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
    timezone: result.professionalHourlyDataTimeBasis?.timezone ?? result.calendarBasis.timezone,
    forecastWindowAnchorStart:
      result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
    forecastWindowAnchorEnd:
      result.professionalHourlyDataTimeBasis?.anchorEndLocal ?? result.forecastEnd,
    expectedRowCount:
      result.professionalHourlyDataTimeBasis?.expectedRowCount ??
      result.professionalHourlyDataTimeBasis?.requestedHours ??
      result.calendarBasis.horizonHours,
    forecastGeneratedAtBucket: bucketForecastGeneratedAt(result.generatedAt),
    weatherProviderCode: result.weatherProviderCode,
    weatherDataMode: result.weatherDataMode,
    weatherSourceVersion: result.weatherFusionSummary?.professionalSourceStatus,
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
    case "provider_disabled":
      return `DeepSeek 智能解读未启用，${suffix}`;
    case "config_missing":
      return `DeepSeek API Key 未配置，${suffix}`;
    case "timeout":
      return `DeepSeek 请求超时，${suffix}`;
    case "network_error":
      return `DeepSeek 网络请求失败，${suffix}`;
    case "provider_http_error":
      return `DeepSeek API Key 无效或权限不足，${suffix}`;
    case "provider_invalid_response":
      return `DeepSeek 返回格式异常，${suffix}`;
    case "provider_parse_error":
      return `DeepSeek 返回内容无法解析，${suffix}`;
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
    category === "provider_invalid_response" ||
    category === "provider_parse_error" ||
    category === "unknown"
  );
}

function isRetryableDeepSeekHttpStatus(statusCode: number | undefined): boolean {
  return statusCode === 429 || (typeof statusCode === "number" && statusCode >= 500);
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
      (error.errorCategory === "provider_http_error" &&
        isRetryableDeepSeekHttpStatus(error.statusCode))
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
  readonly responseSizeChars?: number;
  readonly parseStrategy: ForecastAiExplanationParseStrategy;
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
      responseSizeChars: providerError?.responseSizeChars,
      parseStrategy: providerError?.parseStrategy ?? "failed",
      message: "DeepSeek 解读暂时超时，已保留确定性分析结果，可稍后重试。",
    };
  }

  const errorCategory = providerError?.errorCategory ?? "unknown";
  const retryable =
    errorCategory === "provider_http_error"
      ? isRetryableDeepSeekHttpStatus(providerError?.statusCode)
      : isRetryableDeepSeekErrorCategory(errorCategory);
  const messageZh =
    errorCategory === "provider_http_error" && providerError?.statusCode === 401
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
    responseSizeChars: providerError?.responseSizeChars,
    parseStrategy: providerError?.parseStrategy ?? "failed",
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
