import { buildSeedData, hashPassword, hashRefreshToken } from "@photo-weather/db";
import type { DatabaseClient, JsonValue } from "@photo-weather/db";
import type { AuthConfig } from "../auth-routes.js";
import { signAccessToken } from "../auth-routes.js";

export const testAuthConfig: AuthConfig = {
  jwtSecret: "test-jwt-secret-must-be-at-least-32-chars",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 30,
  adminAuthBypass: false,
};

export type FakeDatabaseState = {
  readonly settings: Map<string, any>;
  readonly providers: Map<string, any>;
  readonly auditLogs: any[];
  readonly users: Map<string, any>;
  readonly profiles: Map<string, any>;
  readonly sessions: Map<string, any>;
  readonly roles: Map<string, any>;
  readonly locations: Map<string, any>;
  readonly photoSpots: Map<string, any>;
  readonly historicalWeatherSamples: Map<string, any>;
  readonly forecastReplayRuns: Map<string, any>;
  readonly forecastReplayResults: Map<string, any>;
  readonly observedOutcomes: Map<string, any>;
  readonly calibrationStats: Map<string, any>;
};

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function createRoleGraph(seedData: ReturnType<typeof buildSeedData>, now: Date) {
  const permissions = new Map<string, any>();
  seedData.permissions.forEach((permission, index) => {
    permissions.set(permission.code, {
      id: `permission-${index}`,
      ...permission,
      createdAt: now,
      updatedAt: now,
    });
  });

  const roles = new Map<string, any>();
  seedData.roles.forEach((role, index) => {
    roles.set(role.code, {
      id: `role-${index}`,
      ...role,
      createdAt: now,
      updatedAt: now,
      permissions: seedData.rolePermissions
        .filter((rolePermission) => rolePermission.roleCode === role.code)
        .map((rolePermission) => ({
          permission: permissions.get(rolePermission.permissionCode),
        })),
    });
  });

  return roles;
}

function userWithRoles(user: any, roles: Map<string, any>, profiles: Map<string, any>) {
  return {
    ...user,
    profile: profiles.get(user.id) ?? null,
    roles: user.roleCodes.map((roleCode: string) => ({
      role: roles.get(roleCode),
    })),
  };
}

function textContains(value: unknown, search: string): boolean {
  return typeof value === "string" && value.toLowerCase().includes(search.toLowerCase());
}

function matchesSearchOr(record: any, orConditions: any[] | undefined): boolean {
  if (!orConditions || orConditions.length === 0) {
    return true;
  }

  return orConditions.some((condition) => {
    const [field, matcher] = Object.entries(condition)[0] ?? [];
    if (!field || typeof matcher !== "object" || matcher === null) {
      return false;
    }

    const contains = (matcher as { contains?: string }).contains;
    return contains ? textContains(record[field], contains) : false;
  });
}

function photoSpotWithLocation(photoSpot: any, locations: Map<string, any>) {
  return {
    ...photoSpot,
    location: locations.get(photoSpot.locationId) ?? null,
  };
}

function dateKey(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

function historicalSampleKey(input: {
  readonly locationKey: string;
  readonly sourceProvider: string;
  readonly sampleTime: Date | string;
}): string {
  return `${input.locationKey}:${input.sourceProvider}:${new Date(input.sampleTime).toISOString()}`;
}

function replayResultKey(input: {
  readonly replayRunId: string;
  readonly forecastDate: Date | string;
  readonly target: string;
}): string {
  return `${input.replayRunId}:${dateKey(input.forecastDate)}:${input.target}`;
}

function observedOutcomeKey(input: {
  readonly locationKey: string;
  readonly target: string;
  readonly outcomeDate: Date | string;
}): string {
  return `${input.locationKey}:${input.target}:${dateKey(input.outcomeDate)}`;
}

function calibrationStatsKey(input: {
  readonly locationKey: string;
  readonly target: string;
  readonly ruleVersion: string;
}): string {
  return `${input.locationKey}:${input.target}:${input.ruleVersion}`;
}

function inDateRange(
  value: Date,
  range: { readonly gte?: Date; readonly lte?: Date; readonly lt?: Date },
) {
  return (
    (range.gte === undefined || value.getTime() >= new Date(range.gte).getTime()) &&
    (range.lte === undefined || value.getTime() <= new Date(range.lte).getTime()) &&
    (range.lt === undefined || value.getTime() < new Date(range.lt).getTime())
  );
}

export async function createFakeDatabaseClient(): Promise<{
  readonly client: DatabaseClient;
  readonly state: FakeDatabaseState;
}> {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const seedData = buildSeedData();
  const settings = new Map<string, any>();
  const providers = new Map<string, any>();
  const auditLogs: any[] = [];
  const users = new Map<string, any>();
  const profiles = new Map<string, any>();
  const sessions = new Map<string, any>();
  const roles = createRoleGraph(seedData, now);
  const locations = new Map<string, any>();
  const photoSpots = new Map<string, any>();
  const historicalWeatherSamples = new Map<string, any>();
  const forecastReplayRuns = new Map<string, any>();
  const forecastReplayResults = new Map<string, any>();
  const observedOutcomes = new Map<string, any>();
  const calibrationStats = new Map<string, any>();

  seedData.systemSettings.forEach((setting, index) => {
    settings.set(setting.key, {
      id: `setting-${index}`,
      ...setting,
      valueJson: cloneJson(setting.valueJson),
      isEditable: setting.key === "deployment.mode" ? false : setting.isEditable,
      createdAt: now,
      updatedAt: now,
    });
  });

  seedData.providerConfigs.forEach((provider, index) => {
    providers.set(`${provider.providerType}:${provider.providerCode}`, {
      id: `provider-${index}`,
      ...provider,
      configJson: cloneJson(provider.configJson),
      secretJson: cloneJson(provider.secretJson),
      maskedSecretJson: cloneJson(provider.maskedSecretJson),
      createdAt: now,
      updatedAt: now,
    });
  });

  seedData.locations.forEach((location, index) => {
    locations.set(`location-${index}`, {
      id: `location-${index}`,
      ...location,
      createdAt: now,
      updatedAt: now,
    });
  });

  seedData.photoSpots.forEach((photoSpot, index) => {
    const location = [...locations.values()].find(
      (candidate) => candidate.slug === photoSpot.locationSlug,
    );
    if (!location) {
      throw new Error(`Missing fake location for ${photoSpot.locationSlug}`);
    }

    const { locationSlug: _locationSlug, ...photoSpotData } = photoSpot;
    photoSpots.set(`photo-spot-${index}`, {
      id: `photo-spot-${index}`,
      locationId: location.id,
      ...photoSpotData,
      createdAt: now,
      updatedAt: now,
    });
  });

  users.set("admin-user", {
    id: "admin-user",
    email: "admin@example.com",
    phone: null,
    passwordHash: await hashPassword("CorrectHorseBattery99"),
    displayName: "Test Admin",
    status: "active",
    roleCodes: ["super_admin"],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  users.set("plain-user", {
    id: "plain-user",
    email: "user@example.com",
    phone: null,
    passwordHash: await hashPassword("CorrectHorseBattery99"),
    displayName: "Plain User",
    status: "active",
    roleCodes: ["user"],
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  const state = {
    settings,
    providers,
    auditLogs,
    users,
    profiles,
    sessions,
    roles,
    locations,
    photoSpots,
    historicalWeatherSamples,
    forecastReplayRuns,
    forecastReplayResults,
    observedOutcomes,
    calibrationStats,
  };

  const client: DatabaseClient = {
    user: {
      findUnique: async ({ where }: any) => {
        const user =
          where.id !== undefined
            ? state.users.get(where.id)
            : [...state.users.values()].find((record) => record.email === where.email);

        return user ? userWithRoles(user, state.roles, state.profiles) : null;
      },
      create: async ({ data }: any) => {
        const user = {
          id: `user-${state.users.size}`,
          phone: null,
          displayName: null,
          status: "active",
          roleCodes: [],
          createdAt: now,
          updatedAt: now,
          lastLoginAt: null,
          ...data,
        };
        state.users.set(user.id, user);
        return userWithRoles(user, state.roles, state.profiles);
      },
      update: async ({ where, data }: any) => {
        const existing = state.users.get(where.id);
        if (!existing) {
          throw new Error(`Missing user ${where.id}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        state.users.set(where.id, next);
        return userWithRoles(next, state.roles, state.profiles);
      },
    },
    userProfile: {
      create: async ({ data }: any) => {
        const profile = {
          id: `profile-${state.profiles.size}`,
          avatarUrl: null,
          preferredUnits: "metric",
          preferredLanguage: "zh-CN",
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.profiles.set(profile.userId, profile);
        return profile;
      },
    },
    userSession: {
      create: async ({ data }: any) => {
        const session = {
          id: `session-${state.sessions.size}`,
          revokedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.sessions.set(session.refreshTokenHash, session);
        return session;
      },
      findUnique: async ({ where }: any) => state.sessions.get(where.refreshTokenHash) ?? null,
      update: async ({ where, data }: any) => {
        const existing = [...state.sessions.values()].find((session) => session.id === where.id);
        if (!existing) {
          throw new Error(`Missing session ${where.id}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        state.sessions.set(next.refreshTokenHash, next);
        return next;
      },
    },
    role: {
      findUnique: async ({ where }: any) => state.roles.get(where.code) ?? null,
      upsert: async () => {
        throw new Error("Role upsert is not used by API tests.");
      },
    },
    userRole: {
      upsert: async ({ create }: any) => {
        const user = state.users.get(create.userId);
        const role = [...state.roles.values()].find((candidate) => candidate.id === create.roleId);
        if (user && role && !user.roleCodes.includes(role.code)) {
          user.roleCodes.push(role.code);
        }
        return { id: "user-role" };
      },
    },
    systemSetting: {
      findUnique: async ({ where }: any) => state.settings.get(where.key) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...state.settings.values()]
          .filter((setting) => where?.group === undefined || setting.group === where.group)
          .filter((setting) => where?.isPublic === undefined || setting.isPublic === where.isPublic)
          .sort(
            (left, right) =>
              left.group.localeCompare(right.group) || left.key.localeCompare(right.key),
          ),
      upsert: async ({ where, create, update }: any) => {
        const existing = state.settings.get(where.key);
        if (existing) {
          const next = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          state.settings.set(where.key, next);
          return next;
        }

        const next = {
          id: `setting-${state.settings.size}`,
          ...create,
          createdAt: now,
          updatedAt: now,
        };
        state.settings.set(where.key, next);
        return next;
      },
    },
    providerConfig: {
      findUnique: async ({ where }: any) => {
        const key = `${where.providerType_providerCode.providerType}:${where.providerType_providerCode.providerCode}`;
        return state.providers.get(key) ?? null;
      },
      findMany: async ({ where }: any = {}) =>
        [...state.providers.values()]
          .filter(
            (provider) =>
              where?.providerType === undefined || provider.providerType === where.providerType,
          )
          .filter((provider) => where?.enabled === undefined || provider.enabled === where.enabled)
          .sort(
            (left, right) =>
              left.providerType.localeCompare(right.providerType) ||
              left.priority - right.priority ||
              left.providerCode.localeCompare(right.providerCode),
          ),
      update: async ({ where, data }: any) => {
        const key = `${where.providerType_providerCode.providerType}:${where.providerType_providerCode.providerCode}`;
        const existing = state.providers.get(key);
        if (!existing) {
          throw new Error(`Missing provider ${key}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        state.providers.set(key, next);
        return next;
      },
      upsert: async () => {
        throw new Error("Provider upsert is not used by API tests.");
      },
    },
    adminAuditLog: {
      create: async ({ data }: any) => {
        const log = {
          id: `audit-${state.auditLogs.length}`,
          ...data,
          createdAt: new Date(now.getTime() + state.auditLogs.length),
        };
        state.auditLogs.unshift(log);
        return log;
      },
      findMany: async ({ take }: any = {}) => state.auditLogs.slice(0, take ?? 50),
    },
    location: {
      findUnique: async ({ where }: any) => {
        if (where.id !== undefined) {
          return state.locations.get(where.id) ?? null;
        }

        if (where.slug !== undefined) {
          return (
            [...state.locations.values()].find((location) => location.slug === where.slug) ?? null
          );
        }

        return null;
      },
      findMany: async ({ where }: any = {}) =>
        [...state.locations.values()]
          .filter((location) => matchesSearchOr(location, where?.OR))
          .sort(
            (left, right) =>
              left.province.localeCompare(right.province, "zh-CN") ||
              left.city.localeCompare(right.city, "zh-CN") ||
              left.name.localeCompare(right.name, "zh-CN"),
          ),
      create: async ({ data }: any) => {
        const location = {
          id: `location-${state.locations.size}`,
          district: null,
          address: null,
          elevation: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.locations.set(location.id, location);
        return location;
      },
      update: async ({ where, data }: any) => {
        const existing = state.locations.get(where.id);
        if (!existing) {
          throw new Error(`Missing location ${where.id}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        state.locations.set(where.id, next);
        return next;
      },
      delete: async ({ where }: any) => {
        const existing = state.locations.get(where.id);
        if (!existing) {
          throw new Error(`Missing location ${where.id}`);
        }

        state.locations.delete(where.id);
        for (const [id, photoSpot] of state.photoSpots.entries()) {
          if (photoSpot.locationId === where.id) {
            state.photoSpots.delete(id);
          }
        }
        return existing;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing =
          [...state.locations.values()].find((location) => location.slug === where.slug) ?? null;
        if (existing) {
          const next = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          state.locations.set(existing.id, next);
          return next;
        }

        const location = {
          id: `location-${state.locations.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        state.locations.set(location.id, location);
        return location;
      },
    },
    photoSpot: {
      findUnique: async ({ where, include }: any) => {
        const photoSpot = state.photoSpots.get(where.id) ?? null;
        return photoSpot && include?.location
          ? photoSpotWithLocation(photoSpot, state.locations)
          : photoSpot;
      },
      findMany: async ({ where, include }: any = {}) =>
        [...state.photoSpots.values()]
          .filter(
            (photoSpot) =>
              where?.locationId === undefined || photoSpot.locationId === where.locationId,
          )
          .filter((photoSpot) => matchesSearchOr(photoSpot, where?.OR))
          .sort(
            (left, right) =>
              Number(right.isHot) - Number(left.isHot) ||
              left.name.localeCompare(right.name, "zh-CN"),
          )
          .map((photoSpot) =>
            include?.location ? photoSpotWithLocation(photoSpot, state.locations) : photoSpot,
          ),
      create: async ({ data, include }: any) => {
        const photoSpot = {
          id: `photo-spot-${state.photoSpots.size}`,
          description: null,
          elevation: null,
          accessNote: null,
          trafficNote: null,
          safetyNote: null,
          riskNote: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.photoSpots.set(photoSpot.id, photoSpot);
        return include?.location ? photoSpotWithLocation(photoSpot, state.locations) : photoSpot;
      },
      update: async ({ where, data, include }: any) => {
        const existing = state.photoSpots.get(where.id);
        if (!existing) {
          throw new Error(`Missing photo spot ${where.id}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        state.photoSpots.set(where.id, next);
        return include?.location ? photoSpotWithLocation(next, state.locations) : next;
      },
      delete: async ({ where, include }: any) => {
        const existing = state.photoSpots.get(where.id);
        if (!existing) {
          throw new Error(`Missing photo spot ${where.id}`);
        }

        state.photoSpots.delete(where.id);
        return include?.location ? photoSpotWithLocation(existing, state.locations) : existing;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing =
          [...state.photoSpots.values()].find(
            (photoSpot) =>
              photoSpot.locationId === where.locationId_slug.locationId &&
              photoSpot.slug === where.locationId_slug.slug,
          ) ?? null;
        if (existing) {
          const next = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          state.photoSpots.set(existing.id, next);
          return next;
        }

        const photoSpot = {
          id: `photo-spot-${state.photoSpots.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        state.photoSpots.set(photoSpot.id, photoSpot);
        return photoSpot;
      },
    },
    historicalWeatherSample: {
      findUnique: async ({ where }: any) => {
        const key = historicalSampleKey(where.locationKey_sourceProvider_sampleTime);
        return state.historicalWeatherSamples.get(key) ?? null;
      },
      findMany: async ({ where }: any = {}) =>
        [...state.historicalWeatherSamples.values()]
          .filter(
            (sample) =>
              where?.locationKey === undefined || sample.locationKey === where.locationKey,
          )
          .filter(
            (sample) =>
              where?.sourceProvider === undefined || sample.sourceProvider === where.sourceProvider,
          )
          .filter((sample) =>
            where?.sampleTime === undefined
              ? true
              : inDateRange(sample.sampleTime, where.sampleTime),
          )
          .sort((left, right) => left.sampleTime.getTime() - right.sampleTime.getTime()),
      create: async ({ data }: any) => {
        const sample = {
          id: `historical-weather-${state.historicalWeatherSamples.size}`,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.historicalWeatherSamples.set(historicalSampleKey(sample), sample);
        return sample;
      },
      update: async ({ where, data }: any) => {
        const key = historicalSampleKey(where.locationKey_sourceProvider_sampleTime);
        const existing = state.historicalWeatherSamples.get(key);
        if (!existing) {
          throw new Error(`Missing historical weather sample ${key}`);
        }
        const next = { ...existing, ...data, updatedAt: now };
        state.historicalWeatherSamples.set(key, next);
        return next;
      },
      upsert: async ({ where, create, update }: any) => {
        const key = historicalSampleKey(where.locationKey_sourceProvider_sampleTime);
        const existing = state.historicalWeatherSamples.get(key);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: now };
          state.historicalWeatherSamples.set(key, next);
          return next;
        }
        const sample = {
          id: `historical-weather-${state.historicalWeatherSamples.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        state.historicalWeatherSamples.set(key, sample);
        return sample;
      },
      count: async ({ where }: any = {}) =>
        (
          await client.historicalWeatherSample!.findMany({
            where,
          })
        ).length,
    },
    forecastReplayRun: {
      findUnique: async ({ where }: any) => state.forecastReplayRuns.get(where.id) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...state.forecastReplayRuns.values()]
          .filter(
            (run) => where?.locationKey === undefined || run.locationKey === where.locationKey,
          )
          .filter((run) => where?.target === undefined || run.target === where.target)
          .filter((run) => where?.status === undefined || run.status === where.status)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
      create: async ({ data }: any) => {
        const run = {
          id: `forecast-replay-run-${state.forecastReplayRuns.size}`,
          errorMessage: null,
          completedAt: null,
          createdAt: now,
          ...data,
        };
        state.forecastReplayRuns.set(run.id, run);
        return run;
      },
      update: async ({ where, data }: any) => {
        const existing = state.forecastReplayRuns.get(where.id);
        if (!existing) {
          throw new Error(`Missing forecast replay run ${where.id}`);
        }
        const next = { ...existing, ...data };
        state.forecastReplayRuns.set(where.id, next);
        return next;
      },
    },
    forecastReplayResult: {
      findUnique: async ({ where }: any) => {
        const key = replayResultKey(where.replayRunId_forecastDate_target);
        return state.forecastReplayResults.get(key) ?? null;
      },
      findMany: async ({ where, take }: any = {}) =>
        [...state.forecastReplayResults.values()]
          .filter(
            (result) =>
              where?.locationKey === undefined || result.locationKey === where.locationKey,
          )
          .filter((result) => where?.target === undefined || result.target === where.target)
          .filter(
            (result) =>
              where?.replayRunId === undefined || result.replayRunId === where.replayRunId,
          )
          .sort(
            (left, right) =>
              right.forecastDate.getTime() - left.forecastDate.getTime() ||
              right.createdAt.getTime() - left.createdAt.getTime(),
          )
          .slice(0, take ?? Number.POSITIVE_INFINITY),
      create: async ({ data }: any) => {
        const result = {
          id: `forecast-replay-result-${state.forecastReplayResults.size}`,
          createdAt: now,
          ...data,
        };
        state.forecastReplayResults.set(replayResultKey(result), result);
        return result;
      },
      createMany: async ({ data }: any) => {
        for (const item of data) {
          await client.forecastReplayResult!.create({ data: item });
        }
        return { count: data.length };
      },
      deleteMany: async ({ where }: any) => {
        const records = await client.forecastReplayResult!.findMany({ where });
        for (const record of records) {
          state.forecastReplayResults.delete(replayResultKey(record));
        }
        return { count: records.length };
      },
      count: async ({ where }: any = {}) =>
        (
          await client.forecastReplayResult!.findMany({
            where,
          })
        ).length,
    },
    observedOutcome: {
      findUnique: async ({ where }: any) => {
        const key = observedOutcomeKey(where.locationKey_target_outcomeDate);
        return state.observedOutcomes.get(key) ?? null;
      },
      findMany: async ({ where }: any = {}) =>
        [...state.observedOutcomes.values()]
          .filter(
            (outcome) =>
              where?.locationKey === undefined || outcome.locationKey === where.locationKey,
          )
          .filter((outcome) => where?.target === undefined || outcome.target === where.target)
          .filter((outcome) =>
            where?.outcomeDate === undefined
              ? true
              : inDateRange(outcome.outcomeDate, where.outcomeDate),
          )
          .sort((left, right) => right.outcomeDate.getTime() - left.outcomeDate.getTime()),
      create: async ({ data }: any) => {
        const outcome = {
          id: `observed-outcome-${state.observedOutcomes.size}`,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.observedOutcomes.set(observedOutcomeKey(outcome), outcome);
        return outcome;
      },
      update: async ({ where, data }: any) => {
        const key = observedOutcomeKey(where.locationKey_target_outcomeDate);
        const existing = state.observedOutcomes.get(key);
        if (!existing) {
          throw new Error(`Missing observed outcome ${key}`);
        }
        const next = { ...existing, ...data, updatedAt: now };
        state.observedOutcomes.set(key, next);
        return next;
      },
      upsert: async ({ where, create, update }: any) => {
        const key = observedOutcomeKey(where.locationKey_target_outcomeDate);
        const existing = state.observedOutcomes.get(key);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: now };
          state.observedOutcomes.set(key, next);
          return next;
        }
        const outcome = {
          id: `observed-outcome-${state.observedOutcomes.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        state.observedOutcomes.set(key, outcome);
        return outcome;
      },
    },
    calibrationStats: {
      findUnique: async ({ where }: any) => {
        const key = calibrationStatsKey(where.locationKey_target_ruleVersion);
        return state.calibrationStats.get(key) ?? null;
      },
      findMany: async ({ where }: any = {}) =>
        [...state.calibrationStats.values()]
          .filter(
            (stat) => where?.locationKey === undefined || stat.locationKey === where.locationKey,
          )
          .filter((stat) => where?.target === undefined || stat.target === where.target)
          .filter(
            (stat) => where?.ruleVersion === undefined || stat.ruleVersion === where.ruleVersion,
          )
          .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()),
      upsert: async ({ where, create, update }: any) => {
        const key = calibrationStatsKey(where.locationKey_target_ruleVersion);
        const existing = state.calibrationStats.get(key);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: now };
          state.calibrationStats.set(key, next);
          return next;
        }
        const stat = {
          id: `calibration-stats-${state.calibrationStats.size}`,
          updatedAt: now,
          ...create,
        };
        state.calibrationStats.set(key, stat);
        return stat;
      },
    },
    spotTag: {
      upsert: async ({ create, update, where }: any) => ({
        id: `spot-tag-${where.code}`,
        ...create,
        ...update,
        createdAt: now,
        updatedAt: now,
      }),
    },
    apiUsageLog: {
      create: async ({ data }: any) => ({
        id: "usage-log",
        ...data,
        createdAt: now,
      }),
    },
  };

  state.sessions.set(hashRefreshToken("existing-refresh-token-for-tests"), {
    id: "existing-session",
    userId: "admin-user",
    refreshTokenHash: hashRefreshToken("existing-refresh-token-for-tests"),
    expiresAt: new Date("2030-02-01T00:00:00.000Z"),
    revokedAt: null,
    ipAddress: null,
    userAgent: null,
    createdAt: now,
    updatedAt: now,
  });

  return { client, state };
}

export function adminAuthorizationHeader(userId = "admin-user"): {
  readonly Authorization: string;
} {
  return {
    Authorization: `Bearer ${signAccessToken(userId, testAuthConfig)}`,
  };
}
