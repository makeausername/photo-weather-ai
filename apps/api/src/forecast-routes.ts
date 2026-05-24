import type { FastifyBaseLogger, FastifyInstance, FastifyReply } from "fastify";
import { buildForecastDateRange, forecastDateRangeErrorMessage } from "@photo-weather/calendar";
import {
  type ForecastCalculationResult,
  type ForecastQueryInput,
  forecastHorizonLabels,
  normalizeForecastQueryInput,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import { createRuleBasedForecastExplanation, type ForecastAiExplanation } from "@photo-weather/ai";
import type { DatabaseClient } from "@photo-weather/db";
import { buildForecastInputFromWeatherBundle, calculateForecast } from "@photo-weather/scoring";
import { MockTerrainProvider, type TerrainProvider } from "@photo-weather/terrain";
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

export type ForecastRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly weatherProvider?: WeatherProvider;
  readonly weatherDataService?: WeatherDataServiceLike;
  readonly terrainProvider?: TerrainProvider;
  readonly astroServiceClient?: AstroServiceClientLike;
  readonly env?: NodeJS.ProcessEnv;
};

type ForecastCalculationWithAiResult = ForecastCalculationResult & {
  aiExplanation?: ForecastAiExplanation;
  aiExplanationError?: string;
};

const missingWgs84CoordinateErrorMessage = "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。";

const forecastCalculateRequestSchema = forecastQueryInputSchema.extend({
  useAiExplanation: z.boolean().optional().default(false),
  elevationMeters: z.number().finite().optional(),
  timezone: z.string().trim().min(1).optional(),
  startDateTime: z.string().datetime({ offset: true }).optional(),
});

type ForecastCalculationOptions = {
  readonly elevationMeters?: number;
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

export function registerForecastRoutes(
  app: FastifyInstance,
  options: ForecastRoutesOptions = {},
): void {
  const weatherProvider = options.weatherProvider ?? createWeatherProvider();
  const weatherDataService = options.weatherDataService ?? new WeatherDataService(weatherProvider);
  const terrainProvider = options.terrainProvider ?? new MockTerrainProvider();
  const env = options.env ?? process.env;
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

    const { useAiExplanation, elevationMeters, timezone, startDateTime, ...query } =
      parsedBody.data;
    const result = await calculateForecastResultOrReply(
      query,
      { elevationMeters, timezone, startDateTime },
      weatherDataService,
      terrainProvider,
      astroServiceClient,
      astroServiceConfig,
      reply,
      request.log,
    );
    if (!result) {
      return reply;
    }

    if (!useAiExplanation) {
      return reply.send(result);
    }

    const response: ForecastCalculationWithAiResult = {
      ...result,
      aiExplanation: createRuleBasedForecastExplanation(result),
    };

    const runtimeDeepSeek = await readRuntimeDeepSeekConfigOrDisabled({
      dbClient: options.dbClient,
      env,
    });
    if (
      runtimeDeepSeek?.enabled &&
      runtimeDeepSeek.realCallEnabled &&
      runtimeDeepSeek.apiKeyPresent
    ) {
      try {
        const deepSeekProvider = await createRealDeepSeekProvider({
          dbClient: options.dbClient,
          env,
        });
        response.aiExplanation = await deepSeekProvider.generateForecastExplanation({
          forecastResult: result,
        });
      } catch (error) {
        response.aiExplanationError = (error as Error).message;
      }
    }

    return reply.send(response);
  });

  app.post("/forecast/ai-explain", async (request, reply) => {
    const parsedBody = forecastQueryInputSchema.safeParse(
      normalizeForecastQueryInput(request.body),
    );
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const result = await calculateForecastResultOrReply(
      parsedBody.data,
      {},
      weatherDataService,
      terrainProvider,
      astroServiceClient,
      astroServiceConfig,
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

    if (
      !runtimeDeepSeek?.enabled ||
      !runtimeDeepSeek.realCallEnabled ||
      !runtimeDeepSeek.apiKeyPresent
    ) {
      if (runtimeDeepSeek?.realCallEnabled && !runtimeDeepSeek.apiKeyPresent) {
        return reply.status(400).send({
          error: "provider_key_missing",
          message: "请先填写 DeepSeek API Key。",
        });
      }

      return reply.status(409).send({
        error: "ai_explanation_not_enabled",
        message: "DeepSeek 智能解读未启用，请先在后台启用 DeepSeek 服务商和真实调用。",
      });
    }

    try {
      const deepSeekProvider = await createRealDeepSeekProvider({
        dbClient: options.dbClient,
        env,
      });
      const explanation = await deepSeekProvider.generateForecastExplanation({
        forecastResult: result,
      });

      return reply.send({
        explanation,
      });
    } catch (error) {
      return reply.status(503).send({
        error: "ai_explanation_unavailable",
        message: (error as Error).message || "智能解读暂时不可用。",
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
      const bundle = await weatherDataService.getWeatherDataBundle({
        coordinates: {
          latitude: 30.1328,
          longitude: 118.1718,
          system: "wgs84",
        },
        horizon: "24h",
        hours: forecastRange.horizonHours,
        days: forecastRange.targetDates.length,
        forecastStart: forecastRange.forecastStart,
        forecastEnd: forecastRange.forecastEnd,
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
  astroServiceClient: AstroServiceClientLike,
  astroServiceConfig: AstroServiceConfig,
  reply: FastifyReply,
  logger: FastifyBaseLogger,
): Promise<ForecastCalculationResult | null> {
  try {
    return await calculateForecastResult(
      query,
      requestOptions,
      weatherDataService,
      terrainProvider,
      astroServiceClient,
      astroServiceConfig,
    );
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

async function calculateForecastResult(
  query: ForecastQueryInput,
  requestOptions: ForecastCalculationOptions,
  weatherDataService: WeatherDataServiceLike,
  terrainProvider: TerrainProvider,
  astroServiceClient: AstroServiceClientLike,
  astroServiceConfig: AstroServiceConfig,
): Promise<ForecastCalculationResult> {
  if (query.target === "astro" && astroServiceConfig.enabled && !astroServiceConfig.configuredUrl) {
    throw new Error(astroServiceUrlMissingMessage);
  }

  const forecastRange = buildForecastDateRange(query.horizon);
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
  };
  const [weatherDataBundle, terrainProfile, horizonProfile] = await Promise.all([
    weatherDataService.getWeatherDataBundle({
      coordinates,
      elevationMeters: requestOptions.elevationMeters ?? query.elevationMeters,
      hours: forecastRange.horizonHours,
      days: forecastRange.targetDates.length,
      forecastStart: forecastRange.forecastStart,
      forecastEnd: forecastRange.forecastEnd,
      targetDates: forecastRange.targetDates,
      target: query.target,
      timezone: forecastRange.timezone,
    }),
    terrainProvider.buildTerrainProfile(terrainInput),
    terrainProvider.buildHorizonProfile(terrainInput),
  ]);
  const terrainAnalysis = {
    terrainProfile,
    horizonProfile,
    dataSource: "mock_terrain" as const,
    dataSourceLabelZh: "演示数据",
    isMock: true,
    honestyNoteZh:
      "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
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
    elevationMeters: requestOptions.elevationMeters ?? terrainProfile.locationElevation,
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
