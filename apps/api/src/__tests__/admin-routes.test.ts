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
      message: "当前为本地模拟测试，未调用真实外部服务。",
    });
  });

  it("lists seeded Chinese locations and validates unsafe coordinates", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const listResponse = await app.inject({
      method: "GET",
      url: "/admin/locations",
      headers: adminAuthorizationHeader(),
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().locations.map((location: any) => location.name)).toContain("黄山");

    const invalidResponse = await app.inject({
      method: "POST",
      url: "/admin/locations",
      headers: adminAuthorizationHeader(),
      payload: {
        name: "测试地点",
        slug: "test-location",
        province: "浙江省",
        city: "杭州市",
        district: null,
        address: null,
        latitudeGcj02: 120,
        longitudeGcj02: 120.1,
        latitudeWgs84: 30.2,
        longitudeWgs84: 120.1,
        elevation: null,
        locationType: "city",
        source: "manual",
        isVerified: false,
      },
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toMatchObject({
      error: "validation_error",
    });
  });

  it("creates a location and a photo spot with authenticated audit logs", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const locationResponse = await app.inject({
      method: "POST",
      url: "/admin/locations",
      headers: adminAuthorizationHeader(),
      payload: {
        name: "测试山地",
        slug: "test-mountain",
        province: "四川省",
        city: "阿坝州",
        district: "小金县",
        address: "测试地址",
        latitudeGcj02: 31.002,
        longitudeGcj02: 102.002,
        latitudeWgs84: 31,
        longitudeWgs84: 102,
        elevation: 3200,
        locationType: "mountain",
        source: "manual",
        isVerified: false,
      },
    });

    expect(locationResponse.statusCode).toBe(201);
    const location = locationResponse.json().location;
    expect(location).toMatchObject({
      name: "测试山地",
      source: "manual",
      isVerified: false,
    });

    const photoSpotResponse = await app.inject({
      method: "POST",
      url: "/admin/photo-spots",
      headers: adminAuthorizationHeader(),
      payload: {
        locationId: location.id,
        name: "测试机位",
        slug: "test-spot",
        description: "测试说明",
        latitudeGcj02: 31.002,
        longitudeGcj02: 102.002,
        latitudeWgs84: 31,
        longitudeWgs84: 102,
        elevation: 3210,
        viewDirection: "east",
        bestForSunrise: true,
        bestForSunset: false,
        bestForCloudSea: true,
        bestForStars: false,
        bestForMilkyWay: false,
        bestForSnow: true,
        accessNote: "测试到达说明",
        trafficNote: "测试交通说明",
        safetyNote: "测试安全说明",
        riskNote: "测试风险提示",
        isHot: false,
        isVerified: false,
      },
    });

    expect(photoSpotResponse.statusCode).toBe(201);
    expect(photoSpotResponse.json().photoSpot).toMatchObject({
      name: "测试机位",
      viewDirection: "east",
      bestForSunrise: true,
    });
    expect(state.auditLogs.map((log) => log.action)).toEqual([
      "photo_spot.create",
      "location.create",
    ]);
  });

  it("rejects photo spot creation for an unknown location", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/photo-spots",
      headers: adminAuthorizationHeader(),
      payload: {
        locationId: "missing-location",
        name: "无效机位",
        slug: "invalid-spot",
        latitudeGcj02: 30,
        longitudeGcj02: 120,
        latitudeWgs84: 29.998,
        longitudeWgs84: 119.995,
        viewDirection: "east",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_location",
      message: "请选择有效的所属地点。",
    });
  });

  it("returns deterministic local geo search results without external services", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/geo/search?q=%E9%BB%84%E5%B1%B1",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({
      name: "黄山",
      source: "mock",
      coordinatesGcj02: {
        system: "gcj02",
      },
      coordinatesWgs84: {
        system: "wgs84",
      },
    });
  });
});
