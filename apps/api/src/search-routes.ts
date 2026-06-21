import type { FastifyInstance, FastifyReply } from "fastify";
import {
  listLocations,
  type DatabaseClient,
  type LocationRecord,
} from "@photo-weather/db";
import { validateCoordinates } from "@photo-weather/geo";
import type { GeoPlaceResult, GeoProvider } from "@photo-weather/geo";
import { z } from "zod";

type PublicPlaceSearchSource = "local_location" | "amap" | "mock";

export const publicPlaceSearchUnavailableMessage =
  "地点搜索暂时不可用，请检查数据库连接或稍后重试。";

export type PublicPlaceSearchResult = {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly province: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly source: PublicPlaceSearchSource;
  readonly locationType: string;
  readonly matchedPhotoSpotId?: string;
  readonly matchedLocationId?: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly isVerified: boolean;
};

export type PublicReverseGeocodeResult = {
  readonly available: boolean;
  readonly name?: string;
  readonly address?: string | null;
  readonly province?: string | null;
  readonly city?: string | null;
  readonly district?: string | null;
  readonly latitudeGcj02?: number;
  readonly longitudeGcj02?: number;
  readonly latitudeWgs84?: number;
  readonly longitudeWgs84?: number;
};

export type SearchRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly resolveGeoProvider: () => Promise<GeoProvider>;
  readonly resolveReverseGeocodeProvider?: () => Promise<GeoProvider | null>;
  readonly env?: NodeJS.ProcessEnv;
};

const searchPlacesQuerySchema = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词。").max(80, "搜索关键词不能超过 80 个字符。"),
});

const reverseGeocodeQuerySchema = z.object({
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
});

const defaultPublicSearchCacheTtlMs = 5 * 60 * 1000;
const defaultPublicSearchCacheMaxEntries = 256;

type TtlCacheEntry<TValue> = {
  readonly value: TValue;
  readonly expiresAt: number;
  readonly createdAt: number;
};

function readPositiveIntegerEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  options: { readonly min?: number; readonly max?: number } = {},
): number {
  const raw = env[key];
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

function readCachedValue<TValue>(
  cache: Map<string, TtlCacheEntry<TValue>>,
  key: string,
  now = Date.now(),
): TValue | undefined {
  const cached = cache.get(key);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cached);
  return cached.value;
}

function writeCachedValue<TValue>(
  cache: Map<string, TtlCacheEntry<TValue>>,
  key: string,
  value: TValue,
  ttlMs: number,
  maxEntries: number,
  now = Date.now(),
): void {
  cache.delete(key);
  cache.set(key, {
    value,
    createdAt: now,
    expiresAt: now + ttlMs,
  });
  pruneCache(cache, maxEntries, now);
}

function pruneCache<TValue>(
  cache: Map<string, TtlCacheEntry<TValue>>,
  maxEntries: number,
  now = Date.now(),
): void {
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) {
      cache.delete(key);
    }
  }

  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

function roundedCoordinateCachePart(value: number): string {
  return value.toFixed(5);
}

function searchPlacesCacheKey(query: string): string {
  return `places:${query}`;
}

function reverseGeocodeCacheKey(input: { readonly lat: number; readonly lng: number }): string {
  return `reverse:${roundedCoordinateCachePart(input.lat)},${roundedCoordinateCachePart(input.lng)}`;
}

function sendZodError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function isUnsafePublicErrorMessage(message: string): boolean {
  return [
    /prisma/i,
    /database/i,
    /findMany\(/i,
    /require[A-Z]\w*Delegate/i,
    /Can't reach database server/i,
    /127\.0\.0\.1:15432/i,
    /P1001/i,
    /:\d+:\d+/,
    /[A-Z]:\\/,
    /\.ts:\d+/,
    /\bat\s+/,
  ].some((pattern) => pattern.test(message));
}

function publicSearchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : "";
  const errorName = error instanceof Error ? error.name : "";
  if (!message || isUnsafePublicErrorMessage(`${errorName}\n${message}`)) {
    return publicPlaceSearchUnavailableMessage;
  }

  return message;
}

function assertCoordinatePair(input: {
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
}): void {
  const gcj02Validation = validateCoordinates(
    {
      latitude: input.latitudeGcj02,
      longitude: input.longitudeGcj02,
      system: "gcj02",
    },
    { expectedSystem: "gcj02" },
  );
  const wgs84Validation = validateCoordinates(
    {
      latitude: input.latitudeWgs84,
      longitude: input.longitudeWgs84,
      system: "wgs84",
    },
    { expectedSystem: "wgs84" },
  );

  if (!gcj02Validation.ok || !wgs84Validation.ok) {
    throw new Error("地点坐标不合法。");
  }
}

function locationToSearchResult(location: LocationRecord): PublicPlaceSearchResult {
  assertCoordinatePair(location);

  return {
    id: `local-location:${location.id}`,
    name: location.name,
    address: location.address,
    province: location.province,
    city: location.city,
    district: location.district,
    source: "local_location",
    locationType: location.locationType,
    matchedLocationId: location.id,
    latitudeGcj02: location.latitudeGcj02,
    longitudeGcj02: location.longitudeGcj02,
    latitudeWgs84: location.latitudeWgs84,
    longitudeWgs84: location.longitudeWgs84,
    elevation: location.elevation,
    isVerified: location.isVerified,
  };
}

function providerToSearchResult(place: GeoPlaceResult): PublicPlaceSearchResult {
  return {
    id: `${place.source}:${place.providerPlaceId ?? place.id}`,
    name: place.name,
    address: place.address ?? null,
    province: place.province ?? null,
    city: place.city ?? null,
    district: place.district ?? null,
    source: place.source === "mock" ? "mock" : "amap",
    locationType: place.locationType ?? "scenic_area",
    latitudeGcj02: place.latitudeGcj02,
    longitudeGcj02: place.longitudeGcj02,
    latitudeWgs84: place.latitudeWgs84,
    longitudeWgs84: place.longitudeWgs84,
    elevation: place.elevation ?? null,
    isVerified: place.isVerified ?? false,
  };
}

function providerToReverseGeocodeResult(
  place: GeoPlaceResult,
  address: string | undefined,
): PublicReverseGeocodeResult {
  return {
    available: true,
    name: place.name,
    address: address ?? place.address ?? null,
    province: place.province ?? null,
    city: place.city ?? null,
    district: place.district ?? null,
    latitudeGcj02: place.latitudeGcj02,
    longitudeGcj02: place.longitudeGcj02,
    latitudeWgs84: place.latitudeWgs84,
    longitudeWgs84: place.longitudeWgs84,
  };
}

function identityKey(result: PublicPlaceSearchResult): string {
  return [result.name, result.latitudeWgs84.toFixed(4), result.longitudeWgs84.toFixed(4)].join(":");
}

function mergeResults(
  results: readonly PublicPlaceSearchResult[],
): readonly PublicPlaceSearchResult[] {
  const seen = new Set<string>();
  const merged: PublicPlaceSearchResult[] = [];

  results.forEach((result) => {
    const key = identityKey(result);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(result);
  });

  return merged.slice(0, 12);
}

export function registerSearchRoutes(app: FastifyInstance, options: SearchRoutesOptions): void {
  const env = options.env ?? process.env;
  const cacheTtlMs = readPositiveIntegerEnv(
    env,
    "PUBLIC_SEARCH_CACHE_TTL_MS",
    defaultPublicSearchCacheTtlMs,
    { min: 1000, max: 60 * 60 * 1000 },
  );
  const cacheMaxEntries = readPositiveIntegerEnv(
    env,
    "PUBLIC_SEARCH_CACHE_MAX_ENTRIES",
    defaultPublicSearchCacheMaxEntries,
    { min: 1, max: 100_000 },
  );
  const placesCache = new Map<
    string,
    TtlCacheEntry<{ readonly query: string; readonly results: readonly PublicPlaceSearchResult[] }>
  >();
  const reverseGeocodeCache = new Map<string, TtlCacheEntry<PublicReverseGeocodeResult>>();

  app.get("/search/reverse-geocode", async (request, reply) => {
    const parsedQuery = reverseGeocodeQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const cacheKey = reverseGeocodeCacheKey(parsedQuery.data);
    const cached = readCachedValue(reverseGeocodeCache, cacheKey);
    if (cached) {
      return cached;
    }

    const provider = options.resolveReverseGeocodeProvider
      ? await options.resolveReverseGeocodeProvider()
      : null;
    if (!provider) {
      return {
        available: false,
      } satisfies PublicReverseGeocodeResult;
    }

    try {
      const result = await provider.reverseGeocode(
        {
          latitude: parsedQuery.data.lat,
          longitude: parsedQuery.data.lng,
          system: "wgs84",
        },
        { locale: "zh-CN" },
      );

      const response = providerToReverseGeocodeResult(result.place, result.formattedAddress);
      writeCachedValue(reverseGeocodeCache, cacheKey, response, cacheTtlMs, cacheMaxEntries);
      return response;
    } catch (error) {
      request.log.warn({ err: error }, "Public reverse geocode unavailable");
      return {
        available: false,
      } satisfies PublicReverseGeocodeResult;
    }
  });

  app.get("/search/places", async (request, reply) => {
    const parsedQuery = searchPlacesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const query = parsedQuery.data.q;
    const cacheKey = searchPlacesCacheKey(query);
    const cached = readCachedValue(placesCache, cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const locations = await listLocations({ search: query, client: options.dbClient });
      const geoProvider = await options.resolveGeoProvider();
      const providerResults = await geoProvider.searchPlace(query, {
        countryCode: "CN",
        locale: "zh-CN",
        limit: 8,
      });
      const results = mergeResults([
        ...locations.map((location) => locationToSearchResult(location)),
        ...providerResults.map((place) => providerToSearchResult(place)),
      ]);

      const response = {
        query,
        results,
      };
      writeCachedValue(placesCache, cacheKey, response, cacheTtlMs, cacheMaxEntries);
      return response;
    } catch (error) {
      request.log.error({ err: error, query }, "Public place search failed");
      return reply.status(503).send({
        error: "place_search_unavailable",
        message: publicSearchErrorMessage(error),
      });
    }
  });
}
