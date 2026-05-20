import type { FastifyInstance, FastifyReply } from "fastify";
import { buildForecastDateRange, forecastDateRangeErrorMessage } from "@photo-weather/calendar";
import {
  type ForecastCalculationResult,
  type ForecastQueryInput,
  forecastHorizonLabels,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import { createRuleBasedForecastExplanation, type ForecastAiExplanation } from "@photo-weather/ai";
import type { DatabaseClient } from "@photo-weather/db";
import { buildForecastInputFromNormalizedWeather, calculateForecast } from "@photo-weather/scoring";
import { MockTerrainProvider, type TerrainProvider } from "@photo-weather/terrain";
import { createWeatherProvider, type WeatherProvider } from "@photo-weather/weather";
import { z, type ZodError } from "zod";
import {
  createRealDeepSeekProvider,
  readRuntimeDeepSeekConfig,
  type RuntimeDeepSeekConfig,
} from "./ai-provider.js";

export type ForecastRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly weatherProvider?: WeatherProvider;
  readonly terrainProvider?: TerrainProvider;
  readonly env?: NodeJS.ProcessEnv;
};

type ForecastCalculationWithAiResult = ForecastCalculationResult & {
  aiExplanation?: ForecastAiExplanation;
  aiExplanationError?: string;
};

const missingWgs84CoordinateErrorMessage =
  "当前地点缺少有效 WGS84 坐标，无法计算日出日落、月相和银河窗口。";

const forecastCalculateRequestSchema = forecastQueryInputSchema.extend({
  useAiExplanation: z.boolean().optional().default(false),
});

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
  const terrainProvider = options.terrainProvider ?? new MockTerrainProvider();
  const env = options.env ?? process.env;

  app.post("/forecast/validate-query", async (request, reply) => {
    const parsedBody = forecastQueryInputSchema.safeParse(request.body);
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
    const parsedBody = forecastCalculateRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const { useAiExplanation, ...query } = parsedBody.data;
    const result = await calculateForecastResultOrReply(
      query,
      weatherProvider,
      terrainProvider,
      reply,
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
      runtimeDeepSeek?.providerEnabled &&
      runtimeDeepSeek.realModeEnabled &&
      runtimeDeepSeek.apiKey
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
    const parsedBody = forecastQueryInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const result = await calculateForecastResultOrReply(
      parsedBody.data,
      weatherProvider,
      terrainProvider,
      reply,
    );
    if (!result) {
      return reply;
    }
    const runtimeDeepSeek = await readRuntimeDeepSeekConfigOrDisabled({
      dbClient: options.dbClient,
      env,
    });

    if (
      !runtimeDeepSeek?.providerEnabled ||
      !runtimeDeepSeek.realModeEnabled ||
      !runtimeDeepSeek.apiKey
    ) {
      return reply.send({
        explanation: createRuleBasedForecastExplanation(result),
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
}

async function calculateForecastResultOrReply(
  query: ForecastQueryInput,
  weatherProvider: WeatherProvider,
  terrainProvider: TerrainProvider,
  reply: FastifyReply,
): Promise<ForecastCalculationResult | null> {
  try {
    return await calculateForecastResult(query, weatherProvider, terrainProvider);
  } catch (error) {
    const message = (error as Error).message;
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
  weatherProvider: WeatherProvider,
  terrainProvider: TerrainProvider,
): Promise<ForecastCalculationResult> {
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
  const [hourlyWeather, dailyWeather, terrainProfile, horizonProfile] = await Promise.all([
    weatherProvider.getHourlyForecast(coordinates, {
      hours: forecastRange.horizonHours,
      forecastStart: forecastRange.forecastStart,
      targetDates: forecastRange.targetDates,
      timezone: forecastRange.timezone,
    }),
    weatherProvider.getDailyForecast(coordinates, {
      days: forecastRange.targetDates.length,
      forecastStart: forecastRange.forecastStart,
      targetDates: forecastRange.targetDates,
      timezone: forecastRange.timezone,
    }),
    terrainProvider.buildTerrainProfile(terrainInput),
    terrainProvider.buildHorizonProfile(terrainInput),
  ]);
  const terrainAnalysis = {
    terrainProfile,
    horizonProfile,
    dataSource: "mock_terrain" as const,
    dataSourceLabelZh: "本地模拟地形数据",
    isMock: true,
    honestyNoteZh: "地形数据：本地模拟地形数据，真实 DEM / 海拔数据将在后续接入。",
  };
  const calculationInput = buildForecastInputFromNormalizedWeather(
    query,
    {
      hourlyWeather,
      dailyWeather,
      isMock: weatherProvider.source.isMock,
      dataSourceLabel: weatherProvider.source.displayName,
    },
    {
      forecastRange,
      terrainAnalysis,
    },
  );

  return calculateForecast(calculationInput);
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
