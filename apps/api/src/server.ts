import Fastify from "fastify";
import { MockAIProvider } from "@photo-weather/ai";
import { MockGeoProvider } from "@photo-weather/geo";
import { MockWeatherProvider } from "@photo-weather/weather";

export function buildApiServer() {
  const app = Fastify({
    logger: true,
  });

  const weatherProvider = new MockWeatherProvider();
  const geoProvider = new MockGeoProvider();
  const aiProvider = new MockAIProvider();

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

  return app;
}
