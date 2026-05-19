import type { FastifyInstance, FastifyReply } from "fastify";
import {
  forecastHorizonLabels,
  forecastQueryInputSchema,
  forecastTargetLabels,
} from "@photo-weather/shared";
import { buildMockForecastInput, calculateForecast } from "@photo-weather/scoring";
import type { ZodError } from "zod";

function sendZodError(reply: FastifyReply, error: ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export function registerForecastRoutes(app: FastifyInstance): void {
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

    const calculationInput = buildMockForecastInput(parsedBody.data);
    const result = calculateForecast(calculationInput);

    return reply.send(result);
  });
}
