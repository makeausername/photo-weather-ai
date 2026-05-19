import type { FastifyInstance, FastifyReply } from "fastify";
import {
  forecastHorizonLabels,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import {
  buildForecastInputFromNormalizedWeather,
  calculateForecast,
  getHorizonHours,
} from "@photo-weather/scoring";
import { createWeatherProvider, type WeatherProvider } from "@photo-weather/weather";
import type { ZodError } from "zod";

export type ForecastRoutesOptions = {
  readonly weatherProvider?: WeatherProvider;
};

function sendZodError(reply: FastifyReply, error: ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export function registerForecastRoutes(app: FastifyInstance, options: ForecastRoutesOptions = {}): void {
  const weatherProvider = options.weatherProvider ?? createWeatherProvider();

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
    const parsedBody = forecastQueryInputSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const coordinates = {
      latitude: parsedBody.data.latitudeWgs84,
      longitude: parsedBody.data.longitudeWgs84,
      system: "wgs84" as const,
    };
    const [hourlyWeather, dailyWeather] = await Promise.all([
      weatherProvider.getHourlyForecast(coordinates, {
        hours: getHorizonHours(parsedBody.data.horizon),
      }),
      weatherProvider.getDailyForecast(coordinates, {
        days: getHorizonDays(parsedBody.data.horizon),
      }),
    ]);
    const calculationInput = buildForecastInputFromNormalizedWeather(parsedBody.data, {
      hourlyWeather,
      dailyWeather,
      isMock: weatherProvider.source.isMock,
      dataSourceLabel: weatherProvider.source.displayName,
    });
    const result = calculateForecast(calculationInput);

    return reply.send(result);
  });
}

function getHorizonDays(horizon: "24h" | "48h" | "72h" | "7d"): number {
  return horizon === "7d" ? 7 : Math.ceil(getHorizonHours(horizon) / 24);
}
