import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { MockGeoProvider } from "@photo-weather/geo";
import { buildApiServer } from "../server.js";
import { testAuthConfig } from "./fake-db.js";

describe("public API rate limit guard", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("rate limits public expensive endpoints without limiting health checks", async () => {
    app = buildApiServer({
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        DATABASE_URL: "",
        REDIS_URL: "",
        ENABLE_ASTRO_SERVICE: "false",
        API_RATE_LIMIT_ENABLED: "true",
        API_RATE_LIMIT_WINDOW_MS: "60000",
        API_RATE_LIMIT_MAX: "1",
      },
      logger: false,
      geoProvider: new MockGeoProvider(),
    });

    const firstSearch = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });
    const secondSearch = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });
    const firstHealth = await app.inject({
      method: "GET",
      url: "/health",
    });
    const secondHealth = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(firstSearch.statusCode).toBe(200);
    expect(secondSearch.statusCode).toBe(429);
    expect(secondSearch.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
    expect(secondSearch.headers["retry-after"]).toBeDefined();
    expect(firstHealth.statusCode).toBe(200);
    expect(secondHealth.statusCode).toBe(200);
  });
});
