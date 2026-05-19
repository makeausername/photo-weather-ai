import { buildSeedData } from "@photo-weather/db";
import type { DatabaseClient, JsonValue } from "@photo-weather/db";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";

type FakeDatabaseState = {
  readonly settings: Map<string, any>;
  readonly providers: Map<string, any>;
  readonly auditLogs: any[];
};

function cloneJson(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function createFakeDatabaseClient(): {
  readonly client: DatabaseClient;
  readonly state: FakeDatabaseState;
} {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const seedData = buildSeedData();
  const settings = new Map<string, any>();
  const providers = new Map<string, any>();
  const auditLogs: any[] = [];

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

  const state = {
    settings,
    providers,
    auditLogs,
  };

  const client: DatabaseClient = {
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
        throw new Error("Provider upsert is not used by admin route tests.");
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

  return { client, state };
}

describe("admin config routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("lists seeded system settings", async () => {
    const { client } = createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/settings",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.settings.map((setting: any) => setting.key)).toContain("site.name");
    expect(body.settings.map((setting: any) => setting.key)).toContain("ai.defaultProvider");
    expect(body.groups.ai).toBeTruthy();
  });

  it("updates an editable setting and writes an audit log", async () => {
    const { client } = createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/settings/site.name",
      payload: {
        valueJson: "Photo Weather Console",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().setting).toMatchObject({
      key: "site.name",
      valueJson: "Photo Weather Console",
    });

    const auditResponse = await app.inject({
      method: "GET",
      url: "/admin/audit-logs",
    });

    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json().logs).toHaveLength(1);
    expect(auditResponse.json().logs[0]).toMatchObject({
      action: "system_setting.update",
      targetType: "system_setting",
      targetId: "site.name",
    });
  });

  it("rejects updates to non-editable settings", async () => {
    const { client } = createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/settings/deployment.mode",
      payload: {
        valueJson: "docker",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "setting_not_editable",
    });
  });

  it("lists seeded provider placeholders", async () => {
    const { client } = createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/providers",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.providers.map((provider: any) => provider.providerCode)).toEqual(
      expect.arrayContaining(["deepseek", "qweather", "open_meteo", "amap"]),
    );
    expect(body.groups.storage).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("secretJson");
  });

  it("updates provider config and never exposes raw secrets", async () => {
    const { client } = createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/providers/ai/deepseek",
      payload: {
        enabled: true,
        configJson: {
          defaultModel: "deepseek-reasoner",
        },
        secretJson: {
          apiKey: "sk-real-secret",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const bodyText = response.body;
    const body = response.json();
    expect(body.provider).toMatchObject({
      providerType: "ai",
      providerCode: "deepseek",
      enabled: true,
      configJson: {
        baseUrl: "https://api.deepseek.com",
        defaultModel: "deepseek-reasoner",
      },
      maskedSecretJson: {
        apiKey: "sk-r****cret",
      },
    });
    expect(bodyText).not.toContain("secretJson");
    expect(bodyText).not.toContain("sk-real-secret");

    const auditResponse = await app.inject({
      method: "GET",
      url: "/admin/audit-logs",
    });
    expect(auditResponse.json().logs[0]).toMatchObject({
      action: "provider_config.update",
      targetId: "ai:deepseek",
    });
    expect(JSON.stringify(auditResponse.json())).not.toContain("sk-real-secret");
  });

  it("returns a deterministic mock provider connection test", async () => {
    const { client } = createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      mode: "mock",
      providerType: "weather",
      providerCode: "qweather",
      message: "Provider connection test is mocked in local development.",
    });
  });
});
