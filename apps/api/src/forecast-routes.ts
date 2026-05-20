import type { FastifyInstance, FastifyReply } from "fastify";
import {
  type ForecastCalculationResult,
  type ForecastQueryInput,
  forecastHorizonLabels,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import { createRuleBasedForecastExplanation, type ForecastAiExplanation } from "@photo-weather/ai";
import type { DatabaseClient } from "@photo-weather/db";
import {
  buildForecastInputFromNormalizedWeather,
  calculateForecast,
  getHorizonHours,
} from "@photo-weather/scoring";
import { createWeatherProvider, type WeatherProvider } from "@photo-weather/weather";
import { z, type ZodError } from "zod";
import { createRealDeepSeekProvider } from "./ai-provider.js";

export type ForecastRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly weatherProvider?: WeatherProvider;
  readonly env?: NodeJS.ProcessEnv;
};

type ForecastCalculationWithAiResult = ForecastCalculationResult & {
  aiExplanation?: ForecastAiExplanation;
  aiExplanationError?: string;
};

const forecastCalculateRequestSchema = forecastQueryInputSchema.extend({
  useAiExplanation: z.boolean().optional().default(false),
});

function sendZodError(reply: FastifyReply, error: ZodError): FastifyReply {
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
    const result = await calculateForecastResult(query, weatherProvider);

    if (!useAiExplanation) {
      return reply.send(result);
    }

    const response: ForecastCalculationWithAiResult = {
      ...result,
      aiExplanation: createRuleBasedForecastExplanation(result),
    };

    if (env.ENABLE_REAL_DEEPSEEK?.trim().toLowerCase() === "true") {
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

    const result = await calculateForecastResult(parsedBody.data, weatherProvider);
    if (env.ENABLE_REAL_DEEPSEEK?.trim().toLowerCase() !== "true") {
      return reply.status(503).send({
        error: "ai_explanation_unavailable",
        message: "DeepSeek 真实开发调用未启用，请设置 ENABLE_REAL_DEEPSEEK=true 后再测试。",
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

async function calculateForecastResult(
  query: ForecastQueryInput,
  weatherProvider: WeatherProvider,
): Promise<ForecastCalculationResult> {
  const coordinates = {
    latitude: query.latitudeWgs84,
    longitude: query.longitudeWgs84,
    system: "wgs84" as const,
  };
  const [hourlyWeather, dailyWeather] = await Promise.all([
    weatherProvider.getHourlyForecast(coordinates, {
      hours: getHorizonHours(query.horizon),
    }),
    weatherProvider.getDailyForecast(coordinates, {
      days: getHorizonDays(query.horizon),
    }),
  ]);
  const calculationInput = buildForecastInputFromNormalizedWeather(query, {
    hourlyWeather,
    dailyWeather,
    isMock: weatherProvider.source.isMock,
    dataSourceLabel: weatherProvider.source.displayName,
  });

  return calculateForecast(calculationInput);
}

function getHorizonDays(horizon: "24h" | "48h" | "72h" | "7d"): number {
  return horizon === "7d" ? 7 : Math.ceil(getHorizonHours(horizon) / 24);
}
