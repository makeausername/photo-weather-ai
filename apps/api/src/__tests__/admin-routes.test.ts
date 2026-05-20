import { afterEach, describe, expect, it, vi } from "vitest";
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
    vi.unstubAllGlobals();
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
    expect(body.realDevCallFlags).toEqual({
      amap: false,
      deepseek: false,
    });
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
          realCallEnabled: true,
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
        realCallEnabled: true,
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

  it("preserves blank secret updates and clears secrets only when explicit", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const saveResponse = await app.inject({
      method: "PATCH",
      url: "/admin/providers/geo/amap",
      headers: adminAuthorizationHeader(),
      payload: {
        secretJson: {
          apiKey: "amap-real-secret",
        },
      },
    });
    expect(saveResponse.statusCode).toBe(200);

    const blankResponse = await app.inject({
      method: "PATCH",
      url: "/admin/providers/geo/amap",
      headers: adminAuthorizationHeader(),
      payload: {
        secretJson: {
          apiKey: "",
        },
      },
    });

    expect(blankResponse.statusCode).toBe(200);
    expect(state.providers.get("geo:amap").secretJson).toMatchObject({
      apiKey: "amap-real-secret",
    });
    expect(blankResponse.body).not.toContain("amap-real-secret");
    expect(blankResponse.body).not.toContain("secretJson");

    const clearResponse = await app.inject({
      method: "PATCH",
      url: "/admin/providers/geo/amap",
      headers: adminAuthorizationHeader(),
      payload: {
        clearSecretKeys: ["apiKey"],
      },
    });

    expect(clearResponse.statusCode).toBe(200);
    expect(state.providers.get("geo:amap").secretJson).toEqual({});
    expect(clearResponse.json().provider.maskedSecretJson).toEqual({});
    expect(clearResponse.body).not.toContain("amap-real-secret");
  });

  it("returns a deterministic mock provider connection test for empty body and {}", async () => {
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
      message: "当前为本地模拟测试，未触发真实外部连接。",
    });

    const emptyJsonBodyResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: {
        ...adminAuthorizationHeader(),
        "content-type": "application/json",
        "content-length": "0",
      },
    });

    expect(emptyJsonBodyResponse.statusCode).toBe(200);
    expect(emptyJsonBodyResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
      message: "当前为本地模拟测试，未触发真实外部连接。",
    });

    const emptyObjectResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
      payload: {},
    });

    expect(emptyObjectResponse.statusCode).toBe(200);
    expect(emptyObjectResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
      message: "当前为本地模拟测试，未触发真实外部连接。",
    });
  });

  it("keeps Amap connection tests in mock mode by default and hides secrets", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    state.providers.set("geo:amap", {
      ...amapProvider,
      secretJson: {
        apiKey: "amap-test-secret",
      },
      maskedSecretJson: {
        apiKey: "amap****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/geo/amap/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "mock",
      message: "当前为本地模拟测试，未请求高德地图服务。",
    });
    expect(response.body).not.toContain("amap-test-secret");
    expect(response.body).not.toContain("secretJson");
  });

  it("keeps DeepSeek connection tests in mock mode by default and hides secrets", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const deepSeekProvider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...deepSeekProvider,
      secretJson: {
        apiKey: "deepseek-test-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/deepseek/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "mock",
      message: "当前为本地模拟测试，未请求 DeepSeek 服务。",
    });
    expect(response.body).not.toContain("deepseek-test-secret");
    expect(response.body).not.toContain("secretJson");
  });

  it("uses admin real-call settings before env fallback when listing providers", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    const deepSeekProvider = state.providers.get("ai:deepseek");
    state.providers.set("geo:amap", {
      ...amapProvider,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: true,
      },
    });
    state.providers.set("ai:deepseek", {
      ...deepSeekProvider,
      configJson: {
        ...(deepSeekProvider.configJson ?? {}),
        realCallEnabled: false,
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_REAL_AMAP: "false",
        ENABLE_REAL_DEEPSEEK: "true",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/providers",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().realDevCallFlags).toEqual({
      amap: true,
      deepseek: false,
    });
  });

  it("returns Chinese no-key errors for real Amap and DeepSeek connection tests", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    const deepSeekProvider = state.providers.get("ai:deepseek");
    state.providers.set("geo:amap", {
      ...amapProvider,
      enabled: true,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    state.providers.set("ai:deepseek", {
      ...deepSeekProvider,
      enabled: true,
      configJson: {
        ...(deepSeekProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const amapResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/geo/amap/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const deepSeekResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/deepseek/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(amapResponse.statusCode).toBe(400);
    expect(amapResponse.json()).toMatchObject({
      error: "provider_key_missing",
      message: "请先填写高德 Web 服务 Key。",
    });
    expect(deepSeekResponse.statusCode).toBe(400);
    expect(deepSeekResponse.json()).toMatchObject({
      error: "provider_key_missing",
      message: "请先填写 DeepSeek API Key。",
    });
  });

  it("forces real provider connection tests back to mock mode under NODE_ENV=test", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in automated tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    state.providers.set("geo:amap", {
      ...amapProvider,
      enabled: true,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "amap-test-secret",
      },
      maskedSecretJson: {
        apiKey: "amap****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/geo/amap/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "mock",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
      name: "黄山光明顶",
      source: "mock",
      coordinatesGcj02: {
        system: "gcj02",
      },
      coordinatesWgs84: {
        system: "wgs84",
      },
    });
  });

  it("validates the public place search query", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "validation_error",
    });
  });

  it("maps local locations and photo spots before provider results in public search", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results[0]).toMatchObject({
      name: "黄山",
      source: "local_location",
      matchedLocationId: "location-0",
      latitudeGcj02: 30.1351,
      longitudeWgs84: 118.171,
    });
    expect(body.results[1]).toMatchObject({
      name: "黄山光明顶",
      source: "local_photo_spot",
      matchedPhotoSpotId: "photo-spot-0",
      matchedLocationId: "location-0",
      locationType: "viewpoint",
    });
  });

  it("keeps public search mock-safe when Amap is enabled but real flag is false", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in search tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    state.providers.set("geo:amap", {
      ...amapProvider,
      enabled: true,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: false,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({
      name: "黄山",
      source: "local_location",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("mixes real Amap results after local public search results when explicitly enabled", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    state.providers.set("geo:amap", {
      ...amapProvider,
      enabled: true,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "amap-real-secret",
      },
      maskedSecretJson: {
        apiKey: "amap****cret",
      },
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "1",
            info: "OK",
            infocode: "10000",
            count: "1",
            pois: [
              {
                id: "B0AMAPTEST",
                name: "黄山迎客松",
                pname: "安徽省",
                cityname: "黄山市",
                adname: "黄山区",
                address: "黄山风景区",
                location: "118.1812,30.1304",
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.results[0]).toMatchObject({
      name: "黄山",
      source: "local_location",
    });
    expect(body.results.some((result: any) => result.source === "amap")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("amap-real-secret");
  });

  it("returns a clear public search error when real Amap is enabled without a key", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    state.providers.set("geo:amap", {
      ...amapProvider,
      enabled: true,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "place_search_unavailable",
      message: "高德地图服务未配置 API Key，请先在后台服务商配置中填写高德 Web 服务 Key。",
    });
    expect(response.body).not.toContain("secretJson");
  });
});
