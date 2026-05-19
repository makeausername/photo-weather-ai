import Fastify from "fastify";
import { MockAIProvider } from "@photo-weather/ai";
import type { DatabaseClient } from "@photo-weather/db";
import { MockGeoProvider } from "@photo-weather/geo";
import { MockWeatherProvider } from "@photo-weather/weather";
import { registerAdminRoutes } from "./admin-routes.js";

export type ApiServerOptions = {
  readonly dbClient?: DatabaseClient;
  readonly logger?: boolean;
};

export function buildApiServer(options: ApiServerOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  const weatherProvider = new MockWeatherProvider();
  const geoProvider = new MockGeoProvider();
  const aiProvider = new MockAIProvider();

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,PATCH,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  });

  app.options("/*", async (_request, reply) => reply.status(204).send());

  app.get("/health", async () => ({
    ok: true,
    service: "photo-weather-api",
  }));

  app.get("/foundation/mock-decision", async () => {
    const place = await geoProvider.geocode("Huangshan");
    const currentWeather = await weatherProvider.getCurrentWeather(place.coordinates);
    const decision = await aiProvider.generateDecisionCard({
      place,
      forecastSummary: currentWeather.summary,
      score: 82,
    });

    return {
      place,
      currentWeather,
      decision,
    };
  });

  registerAdminRoutes(app, { dbClient: options.dbClient });

  return app;
}
