import { getPrismaClient } from "./client.js";
import type { DatabaseClient, JsonValue, UserForecastHistoryRecord } from "./types.js";

export type SaveUserForecastHistoryInput = {
  readonly userId: string;
  readonly locationName: string;
  readonly target: UserForecastHistoryRecord["target"];
  readonly horizon: string;
  readonly timezone?: string | null;
  readonly latitudeGcj02?: number | null;
  readonly longitudeGcj02?: number | null;
  readonly latitudeWgs84?: number | null;
  readonly longitudeWgs84?: number | null;
  readonly elevationMeters?: number | null;
  readonly locationId?: string | null;
  readonly photoSpotId?: string | null;
  readonly queryKey: string;
  readonly queryJson: JsonValue;
  readonly resultSummaryJson?: JsonValue | null;
  readonly overallScore?: number | null;
  readonly recommendationLabel?: string | null;
  readonly bestWindowStart?: Date | null;
  readonly bestWindowEnd?: Date | null;
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireUserForecastHistoryDelegate(client: DatabaseClient) {
  if (!client.userForecastHistory) {
    throw new Error("Database client is missing the userForecastHistory delegate.");
  }

  return client.userForecastHistory;
}

function normalizeHistoryRecord(record: any): UserForecastHistoryRecord {
  return {
    id: record.id,
    userId: record.userId,
    locationName: record.locationName,
    target: record.target,
    horizon: record.horizon,
    timezone: record.timezone ?? null,
    latitudeGcj02: record.latitudeGcj02 ?? null,
    longitudeGcj02: record.longitudeGcj02 ?? null,
    latitudeWgs84: record.latitudeWgs84 ?? null,
    longitudeWgs84: record.longitudeWgs84 ?? null,
    elevationMeters: record.elevationMeters ?? null,
    locationId: record.locationId ?? null,
    photoSpotId: record.photoSpotId ?? null,
    queryKey: record.queryKey,
    queryJson: record.queryJson,
    resultSummaryJson: record.resultSummaryJson ?? null,
    overallScore: record.overallScore ?? null,
    recommendationLabel: record.recommendationLabel ?? null,
    bestWindowStart: record.bestWindowStart ?? null,
    bestWindowEnd: record.bestWindowEnd ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function historyData(input: SaveUserForecastHistoryInput) {
  return {
    userId: input.userId,
    locationName: input.locationName,
    target: input.target,
    horizon: input.horizon,
    timezone: input.timezone ?? null,
    latitudeGcj02: input.latitudeGcj02 ?? null,
    longitudeGcj02: input.longitudeGcj02 ?? null,
    latitudeWgs84: input.latitudeWgs84 ?? null,
    longitudeWgs84: input.longitudeWgs84 ?? null,
    elevationMeters: input.elevationMeters ?? null,
    locationId: input.locationId ?? null,
    photoSpotId: input.photoSpotId ?? null,
    queryKey: input.queryKey,
    queryJson: input.queryJson,
    resultSummaryJson: input.resultSummaryJson ?? null,
    overallScore: input.overallScore ?? null,
    recommendationLabel: input.recommendationLabel ?? null,
    bestWindowStart: input.bestWindowStart ?? null,
    bestWindowEnd: input.bestWindowEnd ?? null,
  };
}

export async function saveUserForecastHistory(
  input: SaveUserForecastHistoryInput,
  options: {
    readonly client?: DatabaseClient;
    readonly now?: Date;
    readonly dedupeWindowMs?: number;
  } = {},
): Promise<UserForecastHistoryRecord> {
  const client = await resolveClient(options.client);
  const delegate = requireUserForecastHistoryDelegate(client);
  const now = options.now ?? new Date();
  const dedupeWindowMs = options.dedupeWindowMs ?? 10 * 60 * 1000;
  const dedupeSince = new Date(now.getTime() - dedupeWindowMs);
  const existing = await delegate.findFirst({
    where: {
      userId: input.userId,
      queryKey: input.queryKey,
      createdAt: {
        gte: dedupeSince,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existing) {
    const updated = await delegate.update({
      where: { id: existing.id },
      data: historyData(input),
    });
    return normalizeHistoryRecord(updated);
  }

  const created = await delegate.create({
    data: historyData(input),
  });
  return normalizeHistoryRecord(created);
}

export async function listUserForecastHistory(
  input: {
    readonly userId: string;
    readonly limit?: number;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly UserForecastHistoryRecord[]> {
  const client = await resolveClient(options.client);
  const records = await requireUserForecastHistoryDelegate(client).findMany({
    where: {
      userId: input.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.limit ?? 20,
  });

  return records.map(normalizeHistoryRecord);
}

export async function deleteUserForecastHistory(
  input: {
    readonly userId: string;
    readonly id: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<boolean> {
  const client = await resolveClient(options.client);
  const delegate = requireUserForecastHistoryDelegate(client);
  if (!delegate.deleteMany) {
    return false;
  }

  const result = await delegate.deleteMany({
    where: {
      id: input.id,
      userId: input.userId,
    },
  });

  return result.count > 0;
}

export async function clearUserForecastHistory(
  input: {
    readonly userId: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<number> {
  const client = await resolveClient(options.client);
  const delegate = requireUserForecastHistoryDelegate(client);
  if (!delegate.deleteMany) {
    return 0;
  }

  const result = await delegate.deleteMany({
    where: {
      userId: input.userId,
    },
  });

  return result.count;
}
