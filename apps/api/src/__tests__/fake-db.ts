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
  readonly sessions: Map<string, any>;
  readonly roles: Map<string, any>;
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

function userWithRoles(user: any, roles: Map<string, any>) {
  return {
    ...user,
    roles: user.roleCodes.map((roleCode: string) => ({
      role: roles.get(roleCode),
    })),
  };
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
  const sessions = new Map<string, any>();
  const roles = createRoleGraph(seedData, now);

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
    sessions,
    roles,
  };

  const client: DatabaseClient = {
    user: {
      findUnique: async ({ where }: any) => {
        const user =
          where.id !== undefined
            ? state.users.get(where.id)
            : [...state.users.values()].find((record) => record.email === where.email);

        return user ? userWithRoles(user, state.roles) : null;
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
        return userWithRoles(user, state.roles);
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
        return userWithRoles(next, state.roles);
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
