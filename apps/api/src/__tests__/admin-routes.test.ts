import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

describe("admin config routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("rejects unauthenticated admin API requests", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/settings",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "missing_token",
    });
  });

  it("lists seeded system settings for an authorized admin", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.settings.map((setting: any) => setting.key)).toContain("site.name");
    expect(body.settings.map((setting: any) => setting.key)).toContain("ai.defaultProvider");
    expect(body.groups.ai).toBeTruthy();
  });

  it("updates an editable setting and writes an authenticated audit log", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/settings/site.name",
      headers: adminAuthorizationHeader(),
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
      headers: adminAuthorizationHeader(),
    });

    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json().logs).toHaveLength(1);
    expect(auditResponse.json().logs[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "system_setting.update",
      targetType: "system_setting",
      targetId: "site.name",
    });
  });

  it("rejects updates to non-editable settings", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/settings/deployment.mode",
      headers: adminAuthorizationHeader(),
      payload: {
        valueJson: "docker",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "setting_not_editable",
    });
  });

  it("lists seeded provider placeholders for an authorized admin", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/providers",
      headers: adminAuthorizationHeader(),
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
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/providers/ai/deepseek",
      headers: adminAuthorizationHeader(),
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
      headers: adminAuthorizationHeader(),
    });
    expect(auditResponse.json().logs[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "provider_config.update",
      targetId: "ai:deepseek",
    });
    expect(JSON.stringify(auditResponse.json())).not.toContain("sk-real-secret");
  });

  it("returns a deterministic mock provider connection test", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
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
