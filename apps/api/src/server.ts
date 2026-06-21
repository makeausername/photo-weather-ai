import { Readable } from "node:stream";
import { createConnection } from "node:net";
import Fastify from "fastify";
import { MockAIProvider } from "@photo-weather/ai";
import { getPrismaClient, type DatabaseClient } from "@photo-weather/db";
import { MockGeoProvider } from "@photo-weather/geo";
import type { GeoProvider } from "@photo-weather/geo";
import type {
  ElevationProvider,
  TerrainElevationService,
  TerrainProvider,
} from "@photo-weather/terrain";
import { createWeatherProvider, type WeatherProvider } from "@photo-weather/weather";
import { registerAdminRoutes } from "./admin-routes.js";
import { registerAccountRoutes } from "./account-routes.js";
import {
  checkAstroServiceHealth,
  resolveAstroServiceConfig,
  type AstroServiceClientLike,
} from "./astro-service-client.js";
import type { AuthConfig } from "./auth-routes.js";
import { loadAuthConfig, registerAuthRoutes } from "./auth-routes.js";
import { registerForecastRoutes } from "./forecast-routes.js";
import { resolveGeoProvider, resolveReverseGeocodeProvider } from "./geo-provider.js";
import { registerSearchRoutes } from "./search-routes.js";
import { createRuntimeWeatherDataService } from "./weather-provider.js";

export type ApiServerOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig?: AuthConfig;
  readonly geoProvider?: GeoProvider;
  readonly weatherProvider?: WeatherProvider;
  readonly terrainProvider?: TerrainProvider;
  readonly elevationProvider?: ElevationProvider;
  readonly elevationService?: TerrainElevationService;
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
const defaultBodyLimitBytes = 1024 * 1024;
const defaultRequestTimeoutMs = 60 * 1000;
const defaultConnectionTimeoutMs = 10 * 1000;
const defaultKeepAliveTimeoutMs = 65 * 1000;
const defaultRateLimitWindowMs = 60 * 1000;
const defaultRateLimitMaxRequests = 60;
const defaultRateLimitMaxBuckets = 10_000;

type PublicRateLimitBucket = {
  count: number;
  resetAt: number;
};

type PublicRateLimitDecision =
  | {
      readonly limited: false;
    }
  | {
      readonly limited: true;
      readonly retryAfterSeconds: number;
    };

const publicRateLimitedRoutes = new Set([
  "POST /auth/login",
  "POST /auth/register",
  "POST /auth/register/send-code",
  "POST /auth/register/confirm",
  "POST /account/change-password",
  "POST /account/email/send-code",
  "POST /account/email/confirm",
  "POST /account/phone/send-code",
  "POST /account/phone/confirm",
  "POST /account/delete",
  "POST /account/forecast-history",
  "POST /forecast/calculate",
  "POST /forecast/ai-explain",
  "GET /search/places",
  "GET /search/reverse-geocode",
]);

function readBooleanEnv(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function readPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  keys: string | readonly string[],
  fallback: number,
  options: { readonly min?: number; readonly max?: number } = {},
): number {
  const keyList = typeof keys === "string" ? [keys] : keys;
  const raw = keyList.map((key) => env[key]).find((value) => value !== undefined);
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  const integer = Math.floor(value);
  if (options.min !== undefined && integer < options.min) {
    return options.min;
  }
  if (options.max !== undefined && integer > options.max) {
    return options.max;
  }
  return integer;
}

function requestPath(url: string): string {
  return url.split("?")[0] || "/";
}

function prunePublicRateLimitBuckets(
  buckets: Map<string, PublicRateLimitBucket>,
  now: number,
  maxBuckets: number,
): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }

  while (buckets.size > maxBuckets) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    buckets.delete(oldestKey);
  }
}

function createPublicRateGuard(env: NodeJS.ProcessEnv): {
  readonly check: (input: {
    readonly method: string;
    readonly url: string;
    readonly clientId: string;
  }) => PublicRateLimitDecision;
} {
  const enabled = readBooleanEnv(env, "API_RATE_LIMIT_ENABLED", true);
  const windowMs = readPositiveIntegerEnv(
    env,
    ["API_RATE_LIMIT_WINDOW_MS", "PUBLIC_RATE_LIMIT_WINDOW_MS"],
    defaultRateLimitWindowMs,
    { min: 1000, max: 60 * 60 * 1000 },
  );
  const maxRequests = readPositiveIntegerEnv(
    env,
    ["API_RATE_LIMIT_MAX", "PUBLIC_RATE_LIMIT_MAX"],
    defaultRateLimitMaxRequests,
    { min: 1, max: 10_000 },
  );
  const maxBuckets = readPositiveIntegerEnv(
    env,
    ["API_RATE_LIMIT_MAX_BUCKETS", "PUBLIC_RATE_LIMIT_MAX_BUCKETS"],
    defaultRateLimitMaxBuckets,
    { min: 100, max: 1_000_000 },
  );
  const buckets = new Map<string, PublicRateLimitBucket>();

  return {
    check(input) {
      if (!enabled) {
        return { limited: false };
      }

      const routeKey = `${input.method.toUpperCase()} ${requestPath(input.url)}`;
      if (!publicRateLimitedRoutes.has(routeKey)) {
        return { limited: false };
      }

      const now = Date.now();
      prunePublicRateLimitBuckets(buckets, now, maxBuckets);
      const bucketKey = `${input.clientId}|${routeKey}`;
      const existing = buckets.get(bucketKey);
      if (!existing || existing.resetAt <= now) {
        buckets.set(bucketKey, {
          count: 1,
          resetAt: now + windowMs,
        });
        return { limited: false };
      }

      existing.count += 1;
      if (existing.count <= maxRequests) {
        return { limited: false };
      }

      return {
        limited: true,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    },
  };
}

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
  const env = options.env ?? process.env;
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: readPositiveIntegerEnv(env, "API_BODY_LIMIT_BYTES", defaultBodyLimitBytes, {
      min: 16 * 1024,
      max: 10 * 1024 * 1024,
    }),
    requestTimeout: readPositiveIntegerEnv(env, "API_REQUEST_TIMEOUT_MS", defaultRequestTimeoutMs, {
      min: 1000,
      max: 5 * 60 * 1000,
    }),
    connectionTimeout: readPositiveIntegerEnv(
      env,
      "API_CONNECTION_TIMEOUT_MS",
      defaultConnectionTimeoutMs,
      {
        min: 1000,
        max: 60 * 1000,
      },
    ),
    keepAliveTimeout: readPositiveIntegerEnv(
      env,
      "API_KEEP_ALIVE_TIMEOUT_MS",
      defaultKeepAliveTimeoutMs,
      {
        min: 1000,
        max: 5 * 60 * 1000,
      },
    ),
    trustProxy: readBooleanEnv(env, "API_TRUST_PROXY", true),
  });

  const startedAt = Date.now();
  const publicRateGuard = createPublicRateGuard(env);
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
  const resolveRuntimeReverseGeocodeProvider = () =>
    resolveReverseGeocodeProvider({
      dbClient: options.dbClient,
      geoProvider: options.geoProvider,
      env,
    });

  app.addHook("onRequest", async (_request, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,PATCH,POST,DELETE,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS" || requestPath(request.url) === "/health") {
      return;
    }

    const decision = publicRateGuard.check({
      method: request.method,
      url: request.url,
      clientId: request.ip,
    });
    if (!decision.limited) {
      return;
    }

    return reply.status(429).header("Retry-After", String(decision.retryAfterSeconds)).send({
      error: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
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

  registerAuthRoutes(app, { dbClient: options.dbClient, authConfig, env });
  registerAccountRoutes(app, { dbClient: options.dbClient, authConfig, env });
  registerForecastRoutes(app, {
    dbClient: options.dbClient,
    weatherProvider,
    weatherDataService,
    terrainProvider: options.terrainProvider,
    elevationProvider: options.elevationProvider,
    elevationService: options.elevationService,
    astroServiceClient: options.astroServiceClient,
    env,
  });
  registerSearchRoutes(app, {
    dbClient: options.dbClient,
    resolveGeoProvider: resolveRuntimeGeoProvider,
    resolveReverseGeocodeProvider: resolveRuntimeReverseGeocodeProvider,
    env,
  });
  registerAdminRoutes(app, {
    dbClient: options.dbClient,
    authConfig,
    geoProvider,
    resolveGeoProvider: resolveRuntimeGeoProvider,
    terrainProvider: options.terrainProvider,
    env,
  });

  return app;
}
