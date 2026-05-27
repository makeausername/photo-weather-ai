import type { DatabaseClient } from "@photo-weather/db";
import {
  OpenMeteoElevationProvider,
  TerrainElevationService,
  type ElevationCacheEntry,
  type ElevationCacheStore,
  type ElevationProvider,
} from "@photo-weather/terrain";

type ElevationServiceOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly provider?: ElevationProvider;
  readonly fetcher?: typeof fetch;
};

const elevationEnabledEnvKey = "ENABLE_OPEN_METEO_ELEVATION";
const elevationEndpointEnvKey = "OPEN_METEO_ELEVATION_URL";
const elevationTimeoutEnvKey = "OPEN_METEO_ELEVATION_TIMEOUT_MS";

export function createRuntimeElevationService(
  options: ElevationServiceOptions = {},
): TerrainElevationService {
  return new TerrainElevationService({
    provider: options.provider ?? createRuntimeElevationProvider(options),
    cacheStore: new DatabaseElevationCacheStore(options.dbClient),
  });
}

function createRuntimeElevationProvider(
  options: ElevationServiceOptions,
): ElevationProvider | undefined {
  const env = options.env ?? process.env;
  const enabled = resolveOpenMeteoElevationEnabled(env);
  if (!enabled) {
    return undefined;
  }

  return new OpenMeteoElevationProvider({
    enabled,
    endpoint: env[elevationEndpointEnvKey],
    timeoutMs: readPositiveInteger(env[elevationTimeoutEnvKey], 4500),
    fetcher: options.fetcher,
  });
}

function resolveOpenMeteoElevationEnabled(env: NodeJS.ProcessEnv): boolean {
  const explicit = env[elevationEnabledEnvKey]?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1" || explicit === "yes") {
    return true;
  }
  if (explicit === "false" || explicit === "0" || explicit === "no") {
    return false;
  }

  if (env.NODE_ENV === "test" || env.VITEST === "true") {
    return false;
  }

  return env.NODE_ENV !== "test";
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

class DatabaseElevationCacheStore implements ElevationCacheStore {
  constructor(private readonly dbClient?: DatabaseClient) {}

  async get(cacheKey: string): Promise<ElevationCacheEntry | null> {
    if (!this.dbClient?.terrainElevationCache) {
      return null;
    }

    const record = await this.dbClient.terrainElevationCache.findUnique({
      where: { cacheKey },
    });
    if (!record) {
      return null;
    }

    return {
      cacheKey: record.cacheKey,
      latitudeWgs84: record.latitudeWgs84,
      longitudeWgs84: record.longitudeWgs84,
      elevationMeters:
        typeof record.elevationMeters === "number" && Number.isFinite(record.elevationMeters)
          ? Math.round(record.elevationMeters)
          : null,
      elevationSource: record.elevationSource,
      elevationConfidence: record.elevationConfidence,
      expiresAt: new Date(record.expiresAt).getTime(),
    };
  }

  async set(entry: ElevationCacheEntry): Promise<void> {
    if (!this.dbClient?.terrainElevationCache) {
      return;
    }

    await this.dbClient.terrainElevationCache.upsert({
      where: { cacheKey: entry.cacheKey },
      create: {
        cacheKey: entry.cacheKey,
        latitudeWgs84: entry.latitudeWgs84,
        longitudeWgs84: entry.longitudeWgs84,
        elevationMeters: entry.elevationMeters,
        elevationSource: entry.elevationSource,
        elevationConfidence: entry.elevationConfidence,
        expiresAt: new Date(entry.expiresAt),
        rawJson: null,
      },
      update: {
        latitudeWgs84: entry.latitudeWgs84,
        longitudeWgs84: entry.longitudeWgs84,
        elevationMeters: entry.elevationMeters,
        elevationSource: entry.elevationSource,
        elevationConfidence: entry.elevationConfidence,
        expiresAt: new Date(entry.expiresAt),
        rawJson: null,
      },
    });
  }
}
