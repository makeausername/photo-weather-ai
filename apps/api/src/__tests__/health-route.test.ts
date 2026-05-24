import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { DatabaseClient } from "@photo-weather/db";
import { buildApiServer } from "../server.js";
import { testAuthConfig } from "./fake-db.js";

describe("api health route", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("returns safe skipped checks when optional dependencies are not configured", async () => {
    app = buildApiServer({
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        DATABASE_URL: "",
        REDIS_URL: "",
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      service: "photo-weather-api",
      checks: {
        database: { status: "skipped" },
        redis: { status: "skipped" },
        astroService: { status: "disabled" },
      },
    });
    expect(body.uptime).toEqual(expect.any(Number));
    expect(response.body).not.toContain("DATABASE_URL");
    expect(response.body).not.toContain("JWT_SECRET");
  });

  it("checks database connectivity without leaking DATABASE_URL secrets", async () => {
    const queryMock = vi.fn(async () => 1);
    const dbClient = {
      $queryRawUnsafe: queryMock,
    } as unknown as DatabaseClient;

    app = buildApiServer({
      dbClient,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://user:password@postgres:5432/photo_weather_ai",
        REDIS_URL: "",
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(queryMock).toHaveBeenCalledWith("SELECT 1");
    expect(response.json()).toMatchObject({
      status: "ok",
      checks: {
        database: { status: "ok" },
      },
    });
    expect(response.body).not.toContain("password");
    expect(response.body).not.toContain("postgresql://");
  });
});
