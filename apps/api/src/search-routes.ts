import type { FastifyInstance, FastifyReply } from "fastify";
import {
  listLocations,
  listPhotoSpots,
  type DatabaseClient,
  type LocationRecord,
  type PhotoSpotRecord,
} from "@photo-weather/db";
import { validateCoordinates } from "@photo-weather/geo";
import type { GeoPlaceResult, GeoProvider } from "@photo-weather/geo";
import { z } from "zod";

type PublicPlaceSearchSource = "local_location" | "local_photo_spot" | "amap" | "mock";

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

export type SearchRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly resolveGeoProvider: () => Promise<GeoProvider>;
};

const searchPlacesQuerySchema = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词。").max(80, "搜索关键词不能超过 80 个字符。"),
});

function sendZodError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
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

function photoSpotToSearchResult(photoSpot: PhotoSpotRecord): PublicPlaceSearchResult {
  assertCoordinatePair(photoSpot);

  return {
    id: `local-photo-spot:${photoSpot.id}`,
    name: photoSpot.name,
    address: photoSpot.location?.address ?? photoSpot.description,
    province: photoSpot.location?.province ?? null,
    city: photoSpot.location?.city ?? null,
    district: photoSpot.location?.district ?? null,
    source: "local_photo_spot",
    locationType: "viewpoint",
    matchedPhotoSpotId: photoSpot.id,
    matchedLocationId: photoSpot.locationId,
    latitudeGcj02: photoSpot.latitudeGcj02,
    longitudeGcj02: photoSpot.longitudeGcj02,
    latitudeWgs84: photoSpot.latitudeWgs84,
    longitudeWgs84: photoSpot.longitudeWgs84,
    elevation: photoSpot.elevation,
    isVerified: photoSpot.isVerified,
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

function identityKey(result: PublicPlaceSearchResult): string {
  return [
    result.name,
    result.latitudeWgs84.toFixed(4),
    result.longitudeWgs84.toFixed(4),
  ].join(":");
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
  app.get("/search/places", async (request, reply) => {
    const parsedQuery = searchPlacesQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const query = parsedQuery.data.q;
    try {
      const [locations, photoSpots] = await Promise.all([
        listLocations({ search: query, client: options.dbClient }),
        listPhotoSpots({ search: query, client: options.dbClient }),
      ]);
      const geoProvider = await options.resolveGeoProvider();
      const providerResults = await geoProvider.searchPlace(query, {
        countryCode: "CN",
        locale: "zh-CN",
        limit: 8,
      });
      const results = mergeResults([
        ...locations.map((location) => locationToSearchResult(location)),
        ...photoSpots.map((photoSpot) => photoSpotToSearchResult(photoSpot)),
        ...providerResults.map((place) => providerToSearchResult(place)),
      ]);

      return {
        query,
        results,
      };
    } catch (error) {
      return reply.status(503).send({
        error: "place_search_unavailable",
        message: (error as Error).message || "地点搜索暂时不可用。",
      });
    }
  });
}
