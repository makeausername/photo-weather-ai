import { Readable } from "node:stream";
import { createConnection } from "node:net";
import Fastify from "fastify";
import { MockAIProvider } from "@photo-weather/ai";
import { getPrismaClient, type DatabaseClient } from "@photo-weather/db";
import { MockGeoProvider } from "@photo-weather/geo";
import type { GeoProvider } from "@photo-weather/geo";
import type { TerrainProvider } from "@photo-weather/terrain";
import { createWeatherProvider, type WeatherProvider } from "@photo-weather/weather";
import { registerAdminRoutes } from "./admin-routes.js";
import {
  checkAstroServiceHealth,
  resolveAstroServiceConfig,
  type AstroServiceClientLike,
} from "./astro-service-client.js";
import type { AuthConfig } from "./auth-routes.js";
import { loadAuthConfig, registerAuthRoutes } from "./auth-routes.js";
import { registerForecastRoutes } from "./forecast-routes.js";
import { resolveGeoProvider } from "./geo-provider.js";
import { registerSearchRoutes } from "./search-routes.js";
import { createRuntimeWeatherDataService } from "./weather-provider.js";

export type ApiServerOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig?: AuthConfig;
  readonly geoProvider?: GeoProvider;
  readonly weatherProvider?: WeatherProvider;
  readonly terrainProvider?: TerrainProvider;
  readonly astroServiceClient?: AstroServiceClientLike;
  readonly env?: NodeJS.ProcessEnv;
  readonly logger?: boolean;
};

function isProviderConnectionTestPath(url: string): boolean {
  return /^\/admin\/providers\/[a-z]+\/[a-z][a-z0-9_]*\/test-connection(?:[?#].*)?$/.test(url);
}

type HealthCheckStatus = "ok" | "disabled" | "skipped" | "error";

type HealthCheckResult = {
  readonly status: HealthCheckStatus;
  readonly latencyMs?: number;
  readonly message?: string;
};

const databaseUrlEnvKey = ["DATABASE", "URL"].join("_");
const redisUrlEnvKey = ["REDIS", "URL"].join("_");

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function safeHealthErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name) {
    return `${fallback}: ${error.name}`;
  }

  return fallback;
}

async function checkDatabaseHealth(
  dbClient: DatabaseClient | undefined,
  env: NodeJS.ProcessEnv,
): Promise<HealthCheckResult> {
  if (!env[databaseUrlEnvKey]) {
    return {
      status: "skipped",
      message: "Database connection string is not configured.",
    };
  }

  const startedAt = Date.now();
  try {
    const client = dbClient ?? ((await getPrismaClient()) as unknown as DatabaseClient);
    const queryClient = client as DatabaseClient & {
      readonly $queryRawUnsafe?: (query: string) => Promise<unknown>;
    };

    if (typeof queryClient.$queryRawUnsafe !== "function") {
      return {
        status: "skipped",
        message: "Database client does not expose a safe health query.",
      };
    }

    await queryClient.$queryRawUnsafe("SELECT 1");
    return {
      status: "ok",
      latencyMs: elapsedSince(startedAt),
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: elapsedSince(startedAt),
      message: safeHealthErrorMessage(error, "Database connectivity check failed"),
    };
  }
}

function readRedisEndpoint(redisUrl: string | undefined): { host: string; port: number } | null {
  if (!redisUrl) {
    return null;
  }

  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
    };
  } catch {
    return null;
  }
}

async function checkTcpEndpoint(
  host: string,
  port: number,
  timeoutMs = 1500,
): Promise<HealthCheckResult> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (result: HealthCheckResult) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      finish({
        status: "ok",
        latencyMs: elapsedSince(startedAt),
      });
    });
    socket.once("timeout", () => {
      finish({
        status: "error",
        latencyMs: elapsedSince(startedAt),
        message: "Redis connectivity check timed out.",
      });
    });
    socket.once("error", (error) => {
      finish({
        status: "error",
        latencyMs: elapsedSince(startedAt),
        message: safeHealthErrorMessage(error, "Redis connectivity check failed"),
      });
    });
  });
}

async function checkRedisHealth(env: NodeJS.ProcessEnv): Promise<HealthCheckResult> {
  const endpoint = readRedisEndpoint(env[redisUrlEnvKey]);
  if (!endpoint) {
    return {
      status: "skipped",
      message: "Redis connection string is not configured.",
    };
  }

  return checkTcpEndpoint(endpoint.host, endpoint.port);
}

async function checkAstroHealth(env: NodeJS.ProcessEnv): Promise<HealthCheckResult> {
  const config = resolveAstroServiceConfig(env);
  if (!config.enabled) {
    return {
      status: "disabled",
      message: "Astro service is disabled.",
    };
  }

  const startedAt = Date.now();
  const result = await checkAstroServiceHealth({ config });
  return {
    status: result.healthOk ? "ok" : "error",
    latencyMs: elapsedSince(startedAt),
    message: result.healthOk ? undefined : result.lastError ?? "Astro service health check failed.",
  };
}

function summarizeServiceStatus(checks: readonly HealthCheckResult[]): "ok" | "degraded" {
  const activeChecks = checks.filter(
    (check) => check.status !== "disabled" && check.status !== "skipped",
  );

  return activeChecks.every((check) => check.status === "ok") ? "ok" : "degraded";
}

export function buildApiServer(options: ApiServerOptions = {}) {
  const app = Fastify({
    logger: options.logger ?? true,
  });

  const env = options.env ?? process.env;
  const startedAt = Date.now();
  const astroServiceConfig = resolveAstroServiceConfig(env);
  app.log.info(
    {
      astroServiceEnabled: astroServiceConfig.enabled,
      astroServiceUrl: astroServiceConfig.logUrl,
      astroServiceTimeoutMs: astroServiceConfig.timeoutMs,
      envLocalLoaded: astroServiceConfig.envLocalLoaded,
    },
    "Astro service configuration",
  );
  app.log.info(`Astro service enabled: ${astroServiceConfig.enabled}`);
  app.log.info(`Astro service URL: ${astroServiceConfig.logUrl}`);
  app.log.info(`Astro service timeout ms: ${astroServiceConfig.timeoutMs}`);
  app.log.info(`Environment loaded from .env.local: ${astroServiceConfig.envLocalLoaded}`);

  const weatherProvider = options.weatherProvider ?? createWeatherProvider();
  const weatherDataService =
    options.weatherProvider || !options.dbClient
      ? undefined
      : createRuntimeWeatherDataService({ dbClient: options.dbClient, env });
  const geoProvider = options.geoProvider ?? new MockGeoProvider();
  const aiProvider = new MockAIProvider();
  const authConfig = options.authConfig ?? loadAuthConfig();
  const resolveRuntimeGeoProvider = () =>
    resolveGeoProvider({
      dbClient: options.dbClient,
      geoProvider: options.geoProvider,
      env,
    });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,PATCH,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  });

  app.addHook("preParsing", (request, _reply, payload, done) => {
    const contentType = request.headers["content-type"];
    const contentLength = request.headers["content-length"];

    if (
      request.method === "POST" &&
      isProviderConnectionTestPath(request.url) &&
      typeof contentType === "string" &&
      contentType.includes("application/json") &&
      (contentLength === undefined || contentLength === "0")
    ) {
      delete request.headers["content-length"];
      done(null, Readable.from(["{}"]));
      return;
    }

    done(null, payload);
  });

  app.options("/*", async (_request, reply) => reply.status(204).send());

  app.get("/health", async () => {
    const [database, redis, astroService] = await Promise.all([
      checkDatabaseHealth(options.dbClient, env),
      checkRedisHealth(env),
      checkAstroHealth(env),
    ]);
    const status = summarizeServiceStatus([database, redis, astroService]);

    return {
      status,
      service: "photo-weather-api",
      uptime: Math.round((Date.now() - startedAt) / 1000),
      checks: {
        database,
        redis,
        astroService,
      },
    };
  });

  app.get("/foundation/mock-decision", async () => {
    const place = await geoProvider.geocode("Huangshan");
    const currentWeather = await weatherProvider.getCurrentWeather({
      coordinates: place.coordinates,
    });
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

  registerAuthRoutes(app, { dbClient: options.dbClient, authConfig });
  registerForecastRoutes(app, {
    dbClient: options.dbClient,
    weatherProvider,
    weatherDataService,
    terrainProvider: options.terrainProvider,
    astroServiceClient: options.astroServiceClient,
    env,
  });
  registerSearchRoutes(app, {
    dbClient: options.dbClient,
    resolveGeoProvider: resolveRuntimeGeoProvider,
  });
  registerAdminRoutes(app, {
    dbClient: options.dbClient,
    authConfig,
    geoProvider,
    resolveGeoProvider: resolveRuntimeGeoProvider,
    env,
  });

  return app;
}
