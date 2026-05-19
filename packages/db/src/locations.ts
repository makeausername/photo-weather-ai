import { getPrismaClient } from "./client.js";
import type {
  DatabaseClient,
  LocationRecord,
  LocationSource,
  LocationType,
  PhotoSpotRecord,
  ViewDirection,
} from "./types.js";

export type LocationInput = {
  readonly name: string;
  readonly slug: string;
  readonly province: string;
  readonly city: string;
  readonly district?: string | null;
  readonly address?: string | null;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation?: number | null;
  readonly locationType: LocationType;
  readonly source: LocationSource;
  readonly isVerified: boolean;
};

export type LocationPatch = Partial<LocationInput>;

export type PhotoSpotInput = {
  readonly locationId: string;
  readonly name: string;
  readonly slug: string;
  readonly description?: string | null;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation?: number | null;
  readonly viewDirection: ViewDirection;
  readonly bestForSunrise: boolean;
  readonly bestForSunset: boolean;
  readonly bestForCloudSea: boolean;
  readonly bestForStars: boolean;
  readonly bestForMilkyWay: boolean;
  readonly bestForSnow: boolean;
  readonly accessNote?: string | null;
  readonly trafficNote?: string | null;
  readonly safetyNote?: string | null;
  readonly riskNote?: string | null;
  readonly isHot: boolean;
  readonly isVerified: boolean;
};

export type PhotoSpotPatch = Partial<PhotoSpotInput>;

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireLocationDelegate(client: DatabaseClient) {
  if (!client.location) {
    throw new Error("Database client is missing the location delegate.");
  }

  return client.location;
}

function requirePhotoSpotDelegate(client: DatabaseClient) {
  if (!client.photoSpot) {
    throw new Error("Database client is missing the photoSpot delegate.");
  }

  return client.photoSpot;
}

function compactData<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function normalizeLocation(record: any): LocationRecord {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    province: record.province,
    city: record.city,
    district: record.district ?? null,
    address: record.address ?? null,
    latitudeGcj02: record.latitudeGcj02,
    longitudeGcj02: record.longitudeGcj02,
    latitudeWgs84: record.latitudeWgs84,
    longitudeWgs84: record.longitudeWgs84,
    elevation: record.elevation ?? null,
    locationType: record.locationType,
    source: record.source,
    isVerified: record.isVerified,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizePhotoSpot(record: any): PhotoSpotRecord {
  return {
    id: record.id,
    locationId: record.locationId,
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    latitudeGcj02: record.latitudeGcj02,
    longitudeGcj02: record.longitudeGcj02,
    latitudeWgs84: record.latitudeWgs84,
    longitudeWgs84: record.longitudeWgs84,
    elevation: record.elevation ?? null,
    viewDirection: record.viewDirection,
    bestForSunrise: record.bestForSunrise,
    bestForSunset: record.bestForSunset,
    bestForCloudSea: record.bestForCloudSea,
    bestForStars: record.bestForStars,
    bestForMilkyWay: record.bestForMilkyWay,
    bestForSnow: record.bestForSnow,
    accessNote: record.accessNote ?? null,
    trafficNote: record.trafficNote ?? null,
    safetyNote: record.safetyNote ?? null,
    riskNote: record.riskNote ?? null,
    isHot: record.isHot,
    isVerified: record.isVerified,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.location ? { location: normalizeLocation(record.location) } : {}),
  };
}

export async function listLocations(
  options: { readonly search?: string; readonly client?: DatabaseClient } = {},
): Promise<LocationRecord[]> {
  const client = await resolveClient(options.client);
  const search = options.search?.trim();
  const records = await requireLocationDelegate(client).findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { province: { contains: search, mode: "insensitive" } },
            { city: { contains: search, mode: "insensitive" } },
            { district: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ province: "asc" }, { city: "asc" }, { name: "asc" }],
  });

  return records.map((record) => normalizeLocation(record));
}

export async function getLocation(
  id: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<LocationRecord | null> {
  const client = await resolveClient(options.client);
  const record = await requireLocationDelegate(client).findUnique({ where: { id } });

  return record ? normalizeLocation(record) : null;
}

export async function createLocation(
  input: LocationInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<LocationRecord> {
  const client = await resolveClient(options.client);
  const record = await requireLocationDelegate(client).create({ data: input });

  return normalizeLocation(record);
}

export async function updateLocation(
  id: string,
  input: LocationPatch,
  options: { readonly client?: DatabaseClient } = {},
): Promise<LocationRecord> {
  const client = await resolveClient(options.client);
  const record = await requireLocationDelegate(client).update({
    where: { id },
    data: compactData(input),
  });

  return normalizeLocation(record);
}

export async function deleteLocation(
  id: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<LocationRecord> {
  const client = await resolveClient(options.client);
  const record = await requireLocationDelegate(client).delete({ where: { id } });

  return normalizeLocation(record);
}

export async function listPhotoSpots(
  options: {
    readonly locationId?: string;
    readonly search?: string;
    readonly client?: DatabaseClient;
  } = {},
): Promise<PhotoSpotRecord[]> {
  const client = await resolveClient(options.client);
  const search = options.search?.trim();
  const where = {
    ...(options.locationId ? { locationId: options.locationId } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const records = await requirePhotoSpotDelegate(client).findMany({
    where,
    include: { location: true },
    orderBy: [{ isHot: "desc" }, { name: "asc" }],
  });

  return records.map((record) => normalizePhotoSpot(record));
}

export async function getPhotoSpot(
  id: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PhotoSpotRecord | null> {
  const client = await resolveClient(options.client);
  const record = await requirePhotoSpotDelegate(client).findUnique({
    where: { id },
    include: { location: true },
  });

  return record ? normalizePhotoSpot(record) : null;
}

export async function createPhotoSpot(
  input: PhotoSpotInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PhotoSpotRecord> {
  const client = await resolveClient(options.client);
  const record = await requirePhotoSpotDelegate(client).create({
    data: input,
    include: { location: true },
  });

  return normalizePhotoSpot(record);
}

export async function updatePhotoSpot(
  id: string,
  input: PhotoSpotPatch,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PhotoSpotRecord> {
  const client = await resolveClient(options.client);
  const record = await requirePhotoSpotDelegate(client).update({
    where: { id },
    data: compactData(input),
    include: { location: true },
  });

  return normalizePhotoSpot(record);
}

export async function deletePhotoSpot(
  id: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PhotoSpotRecord> {
  const client = await resolveClient(options.client);
  const record = await requirePhotoSpotDelegate(client).delete({
    where: { id },
    include: { location: true },
  });

  return normalizePhotoSpot(record);
}
