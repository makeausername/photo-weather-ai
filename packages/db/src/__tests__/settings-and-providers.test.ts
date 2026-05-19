import {
  getProviderConfig,
  getSystemSetting,
  listProviderConfigs,
  listSystemSettings,
  setSystemSetting,
  updateProviderConfig,
} from "../index.js";
import type { DatabaseClient } from "../types.js";
import { describe, expect, it } from "vitest";

function createFakeClient(): DatabaseClient {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const settings = new Map<string, any>();
  const providers = new Map<string, any>();

  providers.set("ai:deepseek", {
    id: "provider-deepseek",
    providerType: "ai",
    providerCode: "deepseek",
    displayName: "DeepSeek",
    enabled: false,
    priority: 100,
    configJson: { defaultModel: "deepseek-chat" },
    secretJson: { apiKey: "sk-1234567890" },
    maskedSecretJson: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    systemSetting: {
      findUnique: async ({ where }: any) => settings.get(where.key) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...settings.values()]
          .filter((setting) => where?.group === undefined || setting.group === where.group)
          .filter((setting) => where?.isPublic === undefined || setting.isPublic === where.isPublic)
          .sort((left, right) => left.key.localeCompare(right.key)),
      upsert: async ({ where, create, update }: any) => {
        const existing = settings.get(where.key);

        if (existing) {
          const next = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          settings.set(where.key, next);
          return next;
        }

        const next = {
          id: `setting-${create.key}`,
          ...create,
          createdAt: now,
          updatedAt: now,
        };
        settings.set(where.key, next);
        return next;
      },
    },
    providerConfig: {
      findUnique: async ({ where }: any) => {
        const key = `${where.providerType_providerCode.providerType}:${where.providerType_providerCode.providerCode}`;
        return providers.get(key) ?? null;
      },
      findMany: async ({ where }: any = {}) =>
        [...providers.values()]
          .filter(
            (provider) =>
              where?.providerType === undefined || provider.providerType === where.providerType,
          )
          .filter((provider) => where?.enabled === undefined || provider.enabled === where.enabled)
          .sort((left, right) => left.priority - right.priority),
      update: async ({ where, data }: any) => {
        const key = `${where.providerType_providerCode.providerType}:${where.providerType_providerCode.providerCode}`;
        const existing = providers.get(key);

        if (!existing) {
          throw new Error(`Missing provider ${key}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        providers.set(key, next);
        return next;
      },
      upsert: async () => {
        throw new Error("Provider upsert is not needed in these tests.");
      },
    },
    adminAuditLog: {
      create: async ({ data }: any) => ({ id: "audit-log", ...data, createdAt: now }),
      findMany: async () => [],
    },
    apiUsageLog: {
      create: async ({ data }: any) => ({ id: "api-usage-log", ...data, createdAt: now }),
    },
  };
}

describe("system setting helpers", () => {
  it("validates setting keys and value types", async () => {
    const client = createFakeClient();

    await expect(
      setSystemSetting({
        key: "invalid",
        valueJson: "Photo Weather AI",
        valueType: "string",
        client,
      }),
    ).rejects.toThrow("Invalid system setting key");

    await expect(
      setSystemSetting({
        key: "billing.enabled",
        valueJson: "false",
        valueType: "boolean",
        client,
      }),
    ).rejects.toThrow("boolean");

    await expect(
      setSystemSetting({
        key: "site.baseUrl",
        valueJson: "not-a-url",
        valueType: "url",
        client,
      }),
    ).rejects.toThrow("valid URL");
  });

  it("creates, lists, and masks secret settings", async () => {
    const client = createFakeClient();

    await setSystemSetting({
      key: "site.name",
      valueJson: "Photo Weather AI",
      valueType: "string",
      group: "site",
      label: "Site name",
      isPublic: true,
      client,
    });
    const secret = await setSystemSetting({
      key: "ai.deepseek.apiKey",
      valueJson: "sk-1234567890",
      valueType: "secret",
      group: "ai",
      label: "DeepSeek API key",
      client,
    });

    expect(secret.valueJson).toBe("sk-1****7890");
    await expect(getSystemSetting("site.name", { client })).resolves.toMatchObject({
      key: "site.name",
      valueJson: "Photo Weather AI",
    });
    await expect(listSystemSettings({ publicOnly: true, client })).resolves.toHaveLength(1);
  });
});

describe("provider config helpers", () => {
  it("returns safe provider configs without raw secret JSON", async () => {
    const client = createFakeClient();
    const providerConfig = await getProviderConfig("ai", "deepseek", { client });

    expect(providerConfig).toMatchObject({
      providerType: "ai",
      providerCode: "deepseek",
      maskedSecretJson: { apiKey: "sk-1****7890" },
    });
    expect("secretJson" in (providerConfig as unknown as Record<string, unknown>)).toBe(false);
  });

  it("masks secrets on provider updates and preserves safe list output", async () => {
    const client = createFakeClient();
    const updated = await updateProviderConfig({
      providerType: "ai",
      providerCode: "deepseek",
      enabled: true,
      configJson: { retry: { maxAttempts: 2 } },
      secretJson: { apiKey: "new-secret-value" },
      client,
    });

    expect(updated).toMatchObject({
      enabled: true,
      configJson: {
        defaultModel: "deepseek-chat",
        retry: { maxAttempts: 2 },
      },
      maskedSecretJson: { apiKey: "new-****alue" },
    });
    expect("secretJson" in (updated as unknown as Record<string, unknown>)).toBe(false);

    await expect(
      listProviderConfigs({ providerType: "ai", enabledOnly: true, client }),
    ).resolves.toHaveLength(1);
  });

  it("preserves existing provider secrets on blank input and supports explicit clear", async () => {
    const client = createFakeClient();
    await updateProviderConfig({
      providerType: "ai",
      providerCode: "deepseek",
      secretJson: {
        apiKey: "new-secret-value",
        baseUrl: "https://api.deepseek.com",
      },
      client,
    });

    const blankUpdate = await updateProviderConfig({
      providerType: "ai",
      providerCode: "deepseek",
      secretJson: {
        apiKey: "",
      },
      client,
    });

    expect(blankUpdate.maskedSecretJson).toMatchObject({
      apiKey: "new-****alue",
      baseUrl: "http****.com",
    });

    const cleared = await updateProviderConfig({
      providerType: "ai",
      providerCode: "deepseek",
      clearSecretKeys: ["apiKey"],
      client,
    });

    expect(cleared.maskedSecretJson).toEqual({
      baseUrl: "http****.com",
    });
    expect("secretJson" in (cleared as unknown as Record<string, unknown>)).toBe(false);
  });
});
