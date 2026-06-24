import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import type { SmtpTransportFactory } from "../verification-senders.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

function enableAliyunSmtpProvider(
  state: Awaited<ReturnType<typeof createFakeDatabaseClient>>["state"],
  overrides: {
    readonly enabled?: boolean;
    readonly configJson?: Record<string, unknown>;
    readonly secretJson?: Record<string, unknown>;
  } = {},
) {
  const provider = state.providers.get("email:aliyun_smtp");
  state.providers.set("email:aliyun_smtp", {
    ...provider,
    enabled: overrides.enabled ?? true,
    configJson: {
      ...(provider.configJson ?? {}),
      realCallEnabled: true,
      host: "smtp.qiye.aliyun.com",
      port: 465,
      secure: true,
      fromName: "逐光天气",
      fromAddress: "support@example.com",
      timeoutMs: 10000,
      ...overrides.configJson,
    },
    secretJson: {
      username: "support@example.com",
      password: "smtp-auth-secret",
      ...overrides.secretJson,
    },
    maskedSecretJson: {
      username: "supp****.com",
      password: "smtp****cret",
    },
  });
}

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

  it("returns a session-expired diagnostic for unauthenticated provider tests", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/meteoblue/test-connection",
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      attempted: false,
      error: "admin_unauthorized",
      errorCategory: "admin_unauthorized",
      messageZh: "后台登录已过期，请重新登录。",
      message: "后台登录已过期，请重新登录。",
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
      actorLabel: "Test Admin",
      action: "system_setting.update",
      actionLabel: "更新系统设置",
      targetType: "system_setting",
      targetId: "site.name",
      targetLabel: "站点名称",
      targetSummary: "系统设置",
      technicalActorUserId: "admin-user",
      technicalTargetId: "site.name",
    });
    expect(auditResponse.json().logs[0]).not.toHaveProperty("beforeJson");
    expect(auditResponse.json().logs[0]).not.toHaveProperty("afterJson");
  });

  it("returns human-readable audit display fields without sensitive audit JSON", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });
    state.auditLogs.push(
      {
        id: "audit-known-actor",
        actorUserId: "admin-user",
        action: "auth.login.success",
        targetType: "auth",
        targetId: "cmqlyyel1000qsqe4rq15qz2k",
        beforeJson: {
          passwordHash: "hashed-password",
        },
        afterJson: {
          targetMasked: "ad***@example.com",
          refreshTokenHash: "refresh-token-hash",
        },
        ipAddress: null,
        userAgent: null,
        createdAt: new Date("2026-06-21T00:00:00.000Z"),
      },
      {
        id: "audit-system",
        actorUserId: null,
        action: "cdn.refresh",
        targetType: "cdn_provider",
        targetId: "cdn:aliyun_cdn",
        beforeJson: null,
        afterJson: {
          providerType: "cdn",
          providerCode: "aliyun_cdn",
          displayName: "阿里云 CDN",
          secretJson: {
            accessKeySecret: "aliyun-secret",
          },
        },
        ipAddress: null,
        userAgent: null,
        createdAt: new Date("2026-06-21T00:01:00.000Z"),
      },
      {
        id: "audit-missing-actor",
        actorUserId: "deleted-user",
        action: "foo.bar.baz",
        targetType: "user",
        targetId: "cmqlyyel1000qsqe4rq15qz2k",
        beforeJson: null,
        afterJson: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date("2026-06-21T00:02:00.000Z"),
      },
    );

    const response = await app.inject({
      method: "GET",
      url: "/admin/audit-logs",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "audit-known-actor",
          actorLabel: "Test Admin",
          actionLabel: "登录成功",
          targetLabel: "账户登录",
          targetSummary: "ad***@example.com",
          technicalActorUserId: "admin-user",
          technicalTargetId: "cmqlyyel1000qsqe4rq15qz2k",
        }),
        expect.objectContaining({
          id: "audit-system",
          actorLabel: "系统",
          actionLabel: "CDN 缓存刷新",
          targetLabel: "阿里云 CDN",
          targetSummary: "CDN 加速配置",
          technicalActorUserId: null,
          technicalTargetId: "cdn:aliyun_cdn",
        }),
        expect.objectContaining({
          id: "audit-missing-actor",
          actorLabel: "未知用户",
          actionLabel: "系统操作",
          targetLabel: "用户",
          targetSummary: "用户账户",
        }),
      ]),
    );
    for (const log of body.logs) {
      expect(log).not.toHaveProperty("beforeJson");
      expect(log).not.toHaveProperty("afterJson");
    }
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("refreshTokenHash");
    expect(response.body).not.toContain("aliyun-secret");
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
      expect.arrayContaining(["openai", "qweather", "open_meteo", "meteoblue", "amap"]),
    );
    expect(body.groups.storage).toBeTruthy();
    expect(body.realDevCallFlags).toEqual({
      amap: false,
      openai: false,
      qweather: false,
      openMeteo: false,
      meteoblue: false,
    });
    expect(JSON.stringify(body)).not.toContain("secretJson");
  });

  it("lists CDN providers separately from other provider modules", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/providers?providerType=cdn",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.providers.map((provider: any) => provider.providerCode)).toEqual([
      "aliyun_cdn",
      "tencent_cdn",
    ]);
    expect(body.providers.every((provider: any) => provider.providerType === "cdn")).toBe(true);
    expect(response.body).not.toContain("secretJson");
  });

  it("checks Tencent captcha provider configuration without a live captcha request", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("captcha admin config checks must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("captcha:tencent_captcha");
    state.providers.set("captcha:tencent_captcha", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
        captchaAppId: "199999164",
      },
      secretJson: {
        secretId: "tencent-secret-id",
        secretKey: "tencent-secret-key",
        appSecretKey: "captcha-app-secret",
      },
      maskedSecretJson: {
        secretId: "tenc****t-id",
        secretKey: "tenc****-key",
        appSecretKey: "capt****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/captcha/tencent_captcha/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "config_check",
      connectionMode: "mock",
      providerType: "captcha",
      providerCode: "tencent_captcha",
      providerNameZh: "腾讯云验证码",
      enabled: true,
      realCallEnabled: true,
      configReady: true,
      missingFields: [],
    });
    expect(response.body).not.toContain("secretJson");
    expect(response.body).not.toContain("tencent-secret-key");
    expect(response.body).not.toContain("captcha-app-secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes safe local provider debug status without QWeather secrets", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const qWeatherProvider = state.providers.get("weather:qweather");
    state.providers.set("weather:qweather", {
      ...qWeatherProvider,
      enabled: true,
      configJson: {
        ...(qWeatherProvider.configJson ?? {}),
        realCallEnabled: true,
        apiHost: "xxxxx.qweatherapi.com",
        timeoutMs: 10000,
        retryCount: 1,
      },
      secretJson: {
        apiKey: "qweather-debug-secret",
      },
      maskedSecretJson: {
        apiKey: "qwea****cret",
      },
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
      url: "/debug/providers",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      qweather: {
        enabled: true,
        realCallEnabled: true,
        apiKeyPresent: true,
        apiHostPresent: true,
        apiHost: "xxxx***.qweatherapi.com",
        timeoutMs: 10000,
        retryCount: 1,
      },
    });
    expect(response.body).not.toContain("qweather-debug-secret");
    expect(response.body).not.toContain("secretJson");
  });

  it("updates QWeather config and returns only masked weather secrets", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/providers/weather/qweather",
      headers: adminAuthorizationHeader(),
      payload: {
        enabled: true,
        configJson: {
          realCallEnabled: true,
          apiHost: "https://xxxxx.qweatherapi.com/",
          apiKey: "wrong-place-secret",
        },
        secretJson: {
          apiKey: "qweather-real-secret",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      success: true,
      messageZh: "和风天气 配置已保存。",
    });
    expect(body.provider).toMatchObject({
      providerType: "weather",
      providerCode: "qweather",
      enabled: true,
      configJson: {
        realCallEnabled: true,
        apiHost: "xxxxx.qweatherapi.com",
        timeoutMs: 10000,
        retryCount: 1,
        language: "zh",
        unit: "m",
        apiKey: null,
      },
      maskedSecretJson: {
        apiKey: "qwea****cret",
      },
    });
    expect(response.body).not.toContain("secretJson");
    expect(response.body).not.toContain("qweather-real-secret");
    expect(response.body).not.toContain("wrong-place-secret");

    const auditResponse = await app.inject({
      method: "GET",
      url: "/admin/audit-logs",
      headers: adminAuthorizationHeader(),
    });
    expect(JSON.stringify(auditResponse.json())).not.toContain("qweather-real-secret");
    expect(JSON.stringify(auditResponse.json())).not.toContain("wrong-place-secret");
  });

  it("updates provider config and never exposes raw secrets", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/providers/ai/openai",
      headers: adminAuthorizationHeader(),
      payload: {
        enabled: true,
        configJson: {
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
    expect(body).toMatchObject({
      success: true,
      messageZh: "GPT / OpenAI 配置已保存。",
    });
    expect(body.provider).toMatchObject({
      providerType: "ai",
      providerCode: "openai",
      enabled: true,
      configJson: {
        baseUrl: "https://api.openai.com",
        realCallEnabled: true,
        model: "gpt-5.4-mini",
        customModel: "",
        defaultModel: "gpt-5.4-mini",
        temperature: 0.2,
        maxTokens: 1200,
        promptMaxChars: 12000,
        timeoutMs: 120000,
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
      targetId: "ai:openai",
    });
    expect(JSON.stringify(auditResponse.json())).not.toContain("sk-real-secret");
  });

  it("saves CDN config with masked server-only secrets", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/providers/cdn/aliyun_cdn",
      headers: adminAuthorizationHeader(),
      payload: {
        enabled: true,
        configJson: {
          realCallEnabled: true,
          endpoint: "https://cdn.aliyuncs.com",
          domains: "cdn.example.com",
          dryRun: true,
        },
        secretJson: {
          accessKeyId: "aliyun-access-id",
          accessKeySecret: "aliyun-access-secret",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      messageZh: "阿里云 CDN 配置已保存。",
      provider: {
        providerType: "cdn",
        providerCode: "aliyun_cdn",
        enabled: true,
        maskedSecretJson: {
          accessKeyId: "aliy****s-id",
          accessKeySecret: "aliy****cret",
        },
      },
    });
    expect(response.body).not.toContain("secretJson");
    expect(response.body).not.toContain("aliyun-access-secret");
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

  it("returns a deterministic mock weather provider connection test for empty body and {}", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("weather provider tests must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "mock",
      connectionMode: "mock",
      modeZh: "模拟测试",
      providerType: "weather",
      providerCode: "qweather",
      sampleLocation: "黄山光明顶",
      message: "当前为模拟测试，未请求和风天气服务。",
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
      message: "当前为模拟测试，未请求和风天气服务。",
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
      message: "当前为模拟测试，未请求和风天气服务。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns Chinese weather real-call guard results without network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("weather real-call guard must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const qWeatherProvider = state.providers.get("weather:qweather");
    const openMeteoProvider = state.providers.get("weather:open_meteo");
    state.providers.set("weather:qweather", {
      ...qWeatherProvider,
      enabled: true,
      configJson: {
        ...(qWeatherProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    state.providers.set("weather:open_meteo", {
      ...openMeteoProvider,
      enabled: true,
      configJson: {
        ...(openMeteoProvider.configJson ?? {}),
        realCallEnabled: false,
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

    const qWeatherResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const openMeteoResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/open_meteo/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(qWeatherResponse.statusCode).toBe(200);
    expect(qWeatherResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "qweather",
      providerNameZh: "和风天气",
      message: "请先填写和风天气 API Key。",
    });
    expect(openMeteoResponse.statusCode).toBe(200);
    expect(openMeteoResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
      connectionMode: "mock",
      message: "当前为模拟测试，未请求真实天气服务。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a Chinese error when QWeather real call is enabled without API Host", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("QWeather host guard must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const qWeatherProvider = state.providers.get("weather:qweather");
    state.providers.set("weather:qweather", {
      ...qWeatherProvider,
      enabled: true,
      configJson: {
        ...(qWeatherProvider.configJson ?? {}),
        realCallEnabled: true,
        apiHost: "",
      },
      secretJson: {
        apiKey: "qweather-test-secret",
      },
      maskedSecretJson: {
        apiKey: "qwea****cret",
      },
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
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      error: "provider_host_missing",
      providerCode: "qweather",
      message: "请先填写和风天气 API Host。",
    });
    expect(response.body).not.toContain("qweather-test-secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks verification providers without sending email or SMS from config checks", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("verification provider config check must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmtpProvider(state, {
      configJson: {
        realCallEnabled: false,
      },
    });
    const emailTransportFactory = vi.fn(() => {
      throw new Error("email config checks must not create SMTP transports");
    }) as unknown as SmtpTransportFactory;
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      emailTransportFactory,
    });

    const emailResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const smsResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/sms/aliyun_sms/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(emailResponse.statusCode).toBe(200);
    expect(emailResponse.json()).toMatchObject({
      success: true,
      mode: "config_check",
      connectionMode: "mock",
      modeLabelZh: "配置检查",
      providerCode: "aliyun_smtp",
      providerNameZh: "阿里云企业邮箱 SMTP",
      configReady: true,
      message:
        "邮件服务配置完整；本次未发送真实邮件。如需验证 SMTP 登录和发信能力，请使用“发送测试邮件”。",
    });
    expect(smsResponse.statusCode).toBe(200);
    expect(smsResponse.json()).toMatchObject({
      success: true,
      mode: "config_check",
      connectionMode: "mock",
      modeLabelZh: "配置检查",
      providerCode: "aliyun_sms",
      providerNameZh: "阿里云短信",
      configReady: false,
      message: "当前为模拟测试，未发送真实邮件/短信。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(emailTransportFactory).not.toHaveBeenCalled();
  });

  it("accepts complete Aliyun SMS config when endpoint and regionId are empty defaults", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("verification provider config check must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const smsProvider = state.providers.get("sms:aliyun_sms");
    state.providers.set("sms:aliyun_sms", {
      ...smsProvider,
      enabled: true,
      configJson: {
        ...(smsProvider.configJson ?? {}),
        realCallEnabled: true,
        endpoint: "",
        regionId: "",
        signName: "逐光天气",
        templateCode: "SMS_123456",
      },
      secretJson: {
        accessKeyId: "sms-secret-id",
        accessKeySecret: "sms-secret-secret",
      },
      maskedSecretJson: {
        accessKeyId: "sms****id",
        accessKeySecret: "sms****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/sms/aliyun_sms/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "config_check",
      connectionMode: "mock",
      modeLabelZh: "配置检查",
      providerCode: "aliyun_sms",
      providerNameZh: "阿里云短信",
      configReady: true,
      message:
        "短信服务配置完整；endpoint 留空时将使用默认阿里云短信地址。如需验证 AccessKey、签名和模板，请使用真实测试短信。",
    });
    expect(response.json().missingFields).toBeUndefined();
    expect(response.body).not.toContain("sms-secret-secret");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks billing providers without creating payment orders or exposing secrets", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("billing provider config checks must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const wechatProvider = state.providers.get("billing:wechat_pay");
    const alipayProvider = state.providers.get("billing:alipay");
    state.providers.set("billing:wechat_pay", {
      ...wechatProvider,
      enabled: true,
      configJson: {
        ...(wechatProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        merchantPrivateKeyPem: "not-a-private-key",
        apiV3Key: "short",
      },
      maskedSecretJson: {
        merchantPrivateKeyPem: "[set]",
        apiV3Key: "sh****rt",
      },
    });
    state.providers.set("billing:alipay", {
      ...alipayProvider,
      enabled: true,
      configJson: {
        ...(alipayProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        appPrivateKeyPem: "not-a-private-key",
        alipayPublicKeyPem: "not-a-public-key",
      },
      maskedSecretJson: {
        appPrivateKeyPem: "[set]",
        alipayPublicKeyPem: "[set]",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const wechatResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/billing/wechat_pay/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const alipayResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/billing/alipay/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(wechatResponse.statusCode).toBe(200);
    expect(wechatResponse.json()).toMatchObject({
      success: false,
      mode: "config_check",
      connectionMode: "mock",
      providerType: "billing",
      providerCode: "wechat_pay",
      configReady: false,
    });
    expect(wechatResponse.json().missingFields).toEqual(
      expect.arrayContaining(["appId", "mchId", "notifyUrl"]),
    );
    expect(wechatResponse.json().invalidFields).toEqual(
      expect.arrayContaining(["merchantPrivateKeyPem", "apiV3Key"]),
    );
    expect(alipayResponse.statusCode).toBe(200);
    expect(alipayResponse.json()).toMatchObject({
      success: false,
      mode: "config_check",
      connectionMode: "mock",
      providerType: "billing",
      providerCode: "alipay",
      configReady: false,
    });
    expect(alipayResponse.json().invalidFields).toEqual(
      expect.arrayContaining(["appPrivateKeyPem", "alipayPublicKeyPem"]),
    );
    expect(wechatResponse.body).not.toContain("not-a-private-key");
    expect(alipayResponse.body).not.toContain("not-a-public-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks CDN providers in config-check mode without external calls or secret leaks", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("CDN provider tests must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const aliyunProvider = state.providers.get("cdn:aliyun_cdn");
    state.providers.set("cdn:aliyun_cdn", {
      ...aliyunProvider,
      enabled: true,
      configJson: {
        ...(aliyunProvider.configJson ?? {}),
        domains: ["cdn.example.com"],
        realCallEnabled: true,
        dryRun: true,
      },
      secretJson: {
        accessKeyId: "aliyun-test-id",
        accessKeySecret: "aliyun-test-secret",
      },
      maskedSecretJson: {
        accessKeyId: "aliy****t-id",
        accessKeySecret: "aliy****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/cdn/aliyun_cdn/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "config_check",
      connectionMode: "mock",
      providerType: "cdn",
      providerCode: "aliyun_cdn",
      providerNameZh: "阿里云 CDN",
      message: "阿里云 CDN Dry Run 已开启，配置检查通过，未请求真实 CDN 服务。",
    });
    expect(response.body).not.toContain("aliyun-test-secret");
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns missing-field errors for verification providers without sending messages", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("verification provider config check must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const emailProvider = state.providers.get("email:aliyun_smtp");
    const smsProvider = state.providers.get("sms:aliyun_sms");
    state.providers.set("email:aliyun_smtp", {
      ...emailProvider,
      enabled: true,
      configJson: {
        ...(emailProvider.configJson ?? {}),
        realCallEnabled: true,
        host: "",
        fromAddress: "",
      },
      secretJson: {
        username: "smtp-secret-user",
      },
      maskedSecretJson: {
        username: "smtp****user",
      },
    });
    state.providers.set("sms:aliyun_sms", {
      ...smsProvider,
      enabled: true,
      configJson: {
        ...(smsProvider.configJson ?? {}),
        realCallEnabled: true,
        signName: "",
        templateCode: "",
      },
      secretJson: {
        accessKeyId: "sms-secret-id",
      },
      maskedSecretJson: {
        accessKeyId: "sms****id",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const emailResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const smsResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/sms/aliyun_sms/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(emailResponse.statusCode).toBe(200);
    expect(emailResponse.json()).toMatchObject({
      success: false,
      mode: "config_check",
      error: "provider_config_missing",
      providerCode: "aliyun_smtp",
      missingFields: ["SMTP Host", "发件邮箱", "SMTP 密码 / 授权码"],
      message:
        "邮件服务真实调用已开启，请补充：SMTP Host、发件邮箱、SMTP 密码 / 授权码。本次未发送真实邮件。",
    });
    expect(smsResponse.statusCode).toBe(200);
    expect(smsResponse.json()).toMatchObject({
      success: false,
      mode: "config_check",
      error: "provider_config_missing",
      providerCode: "aliyun_sms",
      missingFields: ["短信签名", "模板 Code", "AccessKey Secret"],
      message:
        "短信服务真实调用已开启，请补充：短信签名、模板 Code、AccessKey Secret。本次未发送真实短信。",
    });
    expect(emailResponse.body).not.toContain("smtp-secret-user");
    expect(smsResponse.body).not.toContain("sms-secret-id");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires admin provider permission and validates recipient email for SMTP send-test", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmtpProvider(state);
    const sendMail = vi.fn(async () => undefined);
    const emailTransportFactory: SmtpTransportFactory = vi.fn(() => ({ sendMail }));
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      emailTransportFactory,
    });

    const unauthenticatedResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/send-test",
      payload: { to: "test@example.com" },
    });
    const normalUserResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/send-test",
      headers: adminAuthorizationHeader("plain-user"),
      payload: { to: "test@example.com" },
    });
    const invalidEmailResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/send-test",
      headers: adminAuthorizationHeader(),
      payload: { to: "not-an-email" },
    });

    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(normalUserResponse.statusCode).toBe(403);
    expect(invalidEmailResponse.statusCode).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
    expect(emailTransportFactory).not.toHaveBeenCalled();
  });

  it("sends a real admin SMTP test email through the configured provider and returns safe success", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmtpProvider(state);
    const sendMail = vi.fn(async (message: unknown) => {
      expect(message).toMatchObject({
        from: '"逐光天气" <support@example.com>',
        to: "receiver@example.com",
        subject: "逐光天气邮件测试",
        text: "这是一封逐光天气 SMTP 测试邮件。如果你收到，说明邮箱发信配置可用。",
      });
    });
    const emailTransportFactory: SmtpTransportFactory = vi.fn(() => ({ sendMail }));
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      emailTransportFactory,
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/send-test",
      headers: adminAuthorizationHeader(),
      payload: { to: "receiver@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      providerCode: "aliyun_smtp",
      mode: "real",
      toMasked: "re***r@example.com",
      messageZh: "测试邮件已发送，请检查收件箱或垃圾箱。",
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(emailTransportFactory).toHaveBeenCalledTimes(1);
    expect(response.body).not.toContain("smtp-auth-secret");
    expect(response.body).not.toContain("secretJson");
    expect(state.auditLogs.at(-1)).toMatchObject({
      actorUserId: "admin-user",
      action: "provider.email.test_send",
      targetType: "provider_config",
      targetId: "email:aliyun_smtp",
      afterJson: {
        toMasked: "re***r@example.com",
        success: true,
        errorCode: null,
        responseCode: null,
      },
    });
  });

  it.each([
    {
      name: "EAUTH 526",
      error: Object.assign(new Error("Invalid login for support@example.com smtp-auth-secret"), {
        code: "EAUTH",
        responseCode: 526,
        command: "AUTH PLAIN smtp-auth-secret",
        response: "526 Authentication failed for support@example.com password=smtp-auth-secret",
      }),
      expectedMessage: "SMTP 认证失败，请检查邮箱密码或客户端授权码。",
      expected: {
        errorCode: "EAUTH",
        responseCode: 526,
      },
    },
    {
      name: "connection timeout",
      error: Object.assign(new Error("connect ETIMEDOUT smtp.qiye.aliyun.com:465"), {
        code: "ETIMEDOUT",
        command: "CONN",
      }),
      expectedMessage: "SMTP 连接失败，请检查 Host、端口、SSL/TLS 和服务器网络。",
      expected: {
        errorCode: "ETIMEDOUT",
      },
    },
    {
      name: "sender mismatch",
      error: Object.assign(new Error("sender rejected: support@example.com"), {
        code: "EENVELOPE",
        responseCode: 553,
        command: "MAIL FROM",
        response: "553 sender rejected support@example.com auth=smtp-auth-secret",
      }),
      expectedMessage: "发件邮箱可能与 SMTP 登录账号不匹配。",
      expected: {
        errorCode: "EENVELOPE",
        responseCode: 553,
      },
    },
  ])("returns safe admin SMTP diagnostics for $name failures", async (testCase) => {
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmtpProvider(state);
    const sendMail = vi.fn(async () => {
      throw testCase.error;
    });
    const emailTransportFactory: SmtpTransportFactory = vi.fn(() => ({ sendMail }));
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      emailTransportFactory,
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/email/aliyun_smtp/send-test",
      headers: adminAuthorizationHeader(),
      payload: { to: "receiver@example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      providerCode: "aliyun_smtp",
      mode: "real",
      toMasked: "re***r@example.com",
      messageZh: testCase.expectedMessage,
      ...testCase.expected,
    });
    const serialized = JSON.stringify({
      response: response.json(),
      logs: warnMock.mock.calls,
      audit: state.auditLogs.at(-1),
    });
    expect(serialized).not.toContain("smtp-auth-secret");
    expect(serialized).not.toContain("support@example.com");
    expect(serialized).not.toContain("receiver@example.com");
    expect(serialized).not.toContain("secretJson");
    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(state.auditLogs.at(-1)).toMatchObject({
      action: "provider.email.test_send",
      targetId: "email:aliyun_smtp",
      afterJson: {
        toMasked: "re***r@example.com",
        success: false,
        errorCode: testCase.expected.errorCode,
        responseCode: testCase.expected.responseCode ?? null,
      },
    });
  });

  it("tests a real QWeather connection through mocked fetch outside NODE_ENV=test", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://xxxxx.qweatherapi.com");
      expect(url.pathname).toBe("/v7/weather/now");
      expect(url.searchParams.get("location")).toBe("118.1718,30.1328");
      expect(url.searchParams.get("key")).toBeNull();
      expect(url.searchParams.get("lang")).toBe("zh");
      expect(url.searchParams.get("unit")).toBe("m");
      expect((init?.headers as Record<string, string>)?.["X-QW-Api-Key"]).toBe(
        "qweather-real-secret",
      );

      return new Response(
        JSON.stringify({
          code: "200",
          updateTime: "2026-05-23T12:00+08:00",
          now: {
            obsTime: "2026-05-23T11:58+08:00",
            temp: "18",
            text: "多云",
            humidity: "72",
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const qWeatherProvider = state.providers.get("weather:qweather");
    state.providers.set("weather:qweather", {
      ...qWeatherProvider,
      enabled: true,
      configJson: {
        ...(qWeatherProvider.configJson ?? {}),
        realCallEnabled: true,
        apiHost: "https://xxxxx.qweatherapi.com/",
        timeoutMs: 10000,
        retryCount: 1,
        language: "zh",
        unit: "m",
      },
      secretJson: {
        apiKey: "qweather-real-secret",
      },
      maskedSecretJson: {
        apiKey: "qwea****cret",
      },
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
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "real",
      connectionMode: "real",
      provider: "qweather",
      providerType: "weather",
      providerCode: "qweather",
      statusCode: 200,
      qweatherCode: "200",
      location: "118.1718,30.1328",
      observedWeatherSummary: "多云，18°C，湿度 72%",
      messageZh: expect.stringMatching(/^和风天气连接测试通过，耗时 \d+ms。$/),
    });
    expect(response.body).not.toContain("qweather-real-secret");
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tests Open-Meteo free mode through mocked fetch without requiring an API key", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://api.open-meteo.com");
      expect(url.pathname).toBe("/v1/forecast");
      expect(url.searchParams.get("apikey")).toBeNull();
      expect(url.searchParams.get("hourly")).toContain("cloud_cover_low");
      expect(url.searchParams.get("hourly")).toContain("dew_point_2m");
      expect(url.searchParams.get("hourly")).toContain("visibility");

      return new Response(JSON.stringify({ hourly: { time: [] }, daily: { time: [] } }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const openMeteoProvider = state.providers.get("weather:open_meteo");
    state.providers.set("weather:open_meteo", {
      ...openMeteoProvider,
      enabled: true,
      configJson: {
        ...(openMeteoProvider.configJson ?? {}),
        realCallEnabled: true,
        mode: "free",
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
      method: "POST",
      url: "/admin/providers/weather/open_meteo/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "free",
      connectionMode: "real",
      modeZh: "免费开发模式",
      modeLabelZh: "免费开发模式",
      providerCode: "open_meteo",
      statusCode: 200,
      message: expect.stringMatching(/^Open-Meteo 连接测试通过，耗时 \d+ms。$/),
    });
    expect(response.body).toContain('"apiKeyPresent":false');
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
      message: "当前为模拟测试，未请求高德地图服务。",
    });
    expect(response.body).not.toContain("amap-test-secret");
    expect(response.body).not.toContain("secretJson");
  });

  it("tests a real Amap connection through mocked fetch outside NODE_ENV=test", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://restapi.amap.com");
      expect(url.pathname).toBe("/v3/place/text");
      expect(url.searchParams.get("keywords")).toBe("黄山光明顶");
      expect(url.searchParams.get("key")).toBe("amap-real-secret");
      expect(init?.method).toBe("GET");

      return new Response(
        JSON.stringify({
          status: "1",
          info: "OK",
          infocode: "10000",
          pois: [
            {
              id: "B0AMAPTEST",
              name: "黄山光明顶",
              pname: "安徽省",
              cityname: "黄山市",
              adname: "黄山区",
              address: "黄山风景区",
              location: "118.1718,30.1328",
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
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
        baseUrl: "https://restapi.amap.com",
        timeoutMs: 8000,
        retryCount: 1,
      },
      secretJson: {
        apiKey: "amap-real-secret",
      },
      maskedSecretJson: {
        apiKey: "amap****cret",
      },
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
      method: "POST",
      url: "/admin/providers/geo/amap/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "real",
      connectionMode: "real",
      providerCode: "amap",
      providerNameZh: "高德地图",
      messageZh: expect.stringMatching(/^高德地图连接测试通过，耗时 \d+ms。$/),
    });
    expect(response.body).not.toContain("amap-real-secret");
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps GPT / OpenAI connection tests in mock mode by default and hides secrets", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const openAiProvider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...openAiProvider,
      secretJson: {
        apiKey: "openai-test-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/openai/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "responses_api",
      connectionMode: "mock",
      model: "gpt-5.4-mini",
      message: "当前为模拟测试，未请求 GPT / OpenAI 服务。",
    });
    expect(response.body).not.toContain("openai-test-secret");
    expect(response.body).not.toContain("secretJson");
  });

  it("uses admin real-call settings before env fallback when listing providers", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    const openAiProvider = state.providers.get("ai:openai");
    state.providers.set("geo:amap", {
      ...amapProvider,
      configJson: {
        ...(amapProvider.configJson ?? {}),
        realCallEnabled: true,
      },
    });
    state.providers.set("ai:openai", {
      ...openAiProvider,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
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
        ENABLE_REAL_OPENAI: "true",
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
      openai: false,
      qweather: false,
      openMeteo: false,
      meteoblue: false,
    });
  });

  it("returns Chinese no-key errors for real Amap and GPT / OpenAI connection tests", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    const openAiProvider = state.providers.get("ai:openai");
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
    state.providers.set("ai:openai", {
      ...openAiProvider,
      enabled: true,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
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
    const openAiResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/openai/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(amapResponse.statusCode).toBe(200);
    expect(amapResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "amap",
      providerNameZh: "高德地图",
      message: "请先填写高德 Web 服务 Key。",
    });
    expect(openAiResponse.statusCode).toBe(200);
    expect(openAiResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "openai",
      providerNameZh: "GPT / OpenAI",
      message: "请先填写 GPT / OpenAI API Key。",
    });
  });

  it("guards Open-Meteo customer mode and meteoblue missing keys", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const openMeteoProvider = state.providers.get("weather:open_meteo");
    const meteoblueProvider = state.providers.get("weather:meteoblue");
    state.providers.set("weather:open_meteo", {
      ...openMeteoProvider,
      enabled: true,
      configJson: {
        ...(openMeteoProvider.configJson ?? {}),
        realCallEnabled: true,
        mode: "customer",
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
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

    const openMeteoResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/open_meteo/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const meteoblueResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/meteoblue/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(openMeteoResponse.statusCode).toBe(200);
    expect(openMeteoResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "open_meteo",
      modeLabelZh: "商业客户模式",
      message: "商业客户模式请先填写 Open-Meteo API Key。",
    });
    expect(meteoblueResponse.statusCode).toBe(200);
    expect(meteoblueResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "meteoblue",
      message: "请先填写 meteoblue API Key。",
    });
  });

  it("returns meteoblue mock status without real calls when disabled", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in automated tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/meteoblue/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "mock",
      connectionMode: "mock",
      modeZh: "模拟测试",
      providerCode: "meteoblue",
      message: "当前为模拟测试，未请求 meteoblue 服务。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("tests a real meteoblue Forecast API connection through mocked fetch", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://my.meteoblue.com");
      expect(url.pathname).toBe("/packages/basic-1h_clouds-1h");
      expect(url.searchParams.get("lat")).toBe("30.1328");
      expect(url.searchParams.get("lon")).toBe("118.1718");
      expect(url.searchParams.get("apikey")).toBe("meteoblue-real-secret");
      expect(init?.headers).toBeUndefined();

      return new Response(
        JSON.stringify({
          metadata: { name: "basic-1h" },
          data_1h: {
            time: ["2026-05-20T00:00:00+08:00"],
            temperature: [12],
            relativehumidity: [82],
            windspeed: [3.2],
            cloudcover: [58],
            lowclouds: [26],
            midclouds: [40],
            highclouds: [52],
            visibility: [24],
            precipitation: [0],
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const meteoblueProvider = state.providers.get("weather:meteoblue");
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
        baseUrl: "https://my.meteoblue.com",
        packages: "basic-1h,clouds-1h",
      },
      secretJson: {
        apiKey: "meteoblue-real-secret",
      },
      maskedSecretJson: {
        apiKey: "mete****cret",
      },
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
      method: "POST",
      url: "/admin/providers/weather/meteoblue/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "real",
      connectionMode: "real",
      modeZh: "真实服务",
      modeLabelZh: "真实服务",
      providerCode: "meteoblue",
      statusCode: 200,
      packages: ["basic-1h", "clouds-1h"],
      sampleLocation: "黄山光明顶",
      message: expect.stringMatching(/^meteoblue 连接测试通过，耗时 \d+ms。$/),
    });
    expect(response.body).not.toContain("meteoblue-real-secret");
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports meteoblue upstream 401 without returning an admin 401", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const meteoblueProvider = state.providers.get("weather:meteoblue");
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
        baseUrl: "https://my.meteoblue.com",
        packages: "basic-1h,clouds-1h",
      },
      secretJson: {
        apiKey: "meteoblue-real-secret",
      },
      maskedSecretJson: {
        apiKey: "mete****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/meteoblue/test-connection",
      headers: adminAuthorizationHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      attempted: true,
      statusCode: 401,
      error: "invalid_key",
      errorCategory: "invalid_key",
      message: "meteoblue API Key 无效、权限不足或当前数据包未授权。",
    });
    expect(response.body).not.toContain("登录状态已失效");
    expect(response.body).not.toContain("meteoblue-real-secret");
  });

  it("tests a real GPT / OpenAI connection through mocked fetch outside NODE_ENV=test", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer openai-real-secret",
      });
      expect(String(init?.body)).not.toContain("openai-real-secret");
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).toMatchObject({
        model: "gpt-5.4-mini",
        input: expect.any(String),
        instructions: expect.any(String),
        max_output_tokens: 120,
        store: false,
        stream: false,
      });
      expect(requestBody).not.toHaveProperty("response_format");
      expect(requestBody).not.toHaveProperty("reasoning_effort");

      return new Response(
        JSON.stringify({
          output_text: "GPT / OpenAI 连接测试通过。",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const openAiProvider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...openAiProvider,
      enabled: true,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
        realCallEnabled: true,
        maxTokens: 1200,
        promptMaxChars: 12000,
      },
      secretJson: {
        apiKey: "openai-real-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
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
      method: "POST",
      url: "/admin/providers/ai/openai/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "responses_api",
      connectionMode: "real",
      modeLabelZh: "GPT / OpenAI",
      model: "gpt-5.4-mini",
      latencyMs: expect.any(Number),
      message: "GPT / OpenAI 连接测试通过。",
    });
    expect(response.body).not.toContain("openai-real-secret");
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tests a real GPT / OpenAI explanation through mocked fetch with safe diagnostics", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer openai-real-secret",
      });
      expect(String(init?.body)).not.toContain("openai-real-secret");
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).toMatchObject({
        model: "gpt-5.4-mini",
      });
      expect(requestBody).not.toHaveProperty("response_format");

      return new Response(
        JSON.stringify({
          output_text:
            "是否值得去：后台真实解读测试成功，清晨窗口可以作为主计划，但不要只为单一信号专程出发。\n主要窗口：按确定性预报给出的清晨窗口提前到位，现场复核低云上沿、能见度和阵风。\n主要风险：短临降水、白墙、阵风和道路安全仍需复核，AI 不重新计算天气、天文、地形或评分。\n备选策略：如果低云不开口，改拍近景、远山层次或等下一段稳定窗口。\n复核重点：出发前再次确认雷达、低云高度、降水概率和现场可达性。",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const openAiProvider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...openAiProvider,
      enabled: true,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
        realCallEnabled: true,
        maxTokens: 1200,
        promptMaxChars: 12000,
      },
      secretJson: {
        apiKey: "openai-real-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
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
      method: "POST",
      url: "/admin/providers/ai/openai/test-explanation",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      providerCode: "openai",
      model: "gpt-5.4-mini",
      outputMode: "text_with_json_fallback",
      promptSizeChars: expect.any(Number),
      latencyMs: expect.any(Number),
      attempts: 1,
      parseSuccess: false,
      displaySuccess: true,
      hasDisplayableAiContent: true,
      parseStrategy: "plain_text_fallback",
      compatibilityFallbackUsed: false,
      emptyContentFallbackUsed: false,
      contentType: "output_text",
      contentLength: expect.any(Number),
      message: expect.stringContaining("GPT / OpenAI 真实解读测试通过"),
    });
    expect(response.body).not.toContain("openai-real-secret");
    expect(response.body).not.toContain("Authorization");
    expect(response.body).not.toContain("messages");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports GPT / OpenAI explanation test upstream failure with safe diagnostics", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              code: "unsupported_parameter",
              message: "Unsupported parameter: response_format",
            },
          }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              "x-request-id": "ds-admin-1",
            },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const openAiProvider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...openAiProvider,
      enabled: true,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
        realCallEnabled: true,
        maxTokens: 1200,
        promptMaxChars: 12000,
      },
      secretJson: {
        apiKey: "openai-real-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
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
      method: "POST",
      url: "/admin/providers/ai/openai/test-explanation",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      providerCode: "openai",
      model: "gpt-5.4-mini",
      outputMode: "text_with_json_fallback",
      attempts: 1,
      parseSuccess: false,
      displaySuccess: false,
      hasDisplayableAiContent: false,
      compatibilityFallbackUsed: false,
      disabledResponseFormat: false,
      emptyContentFallbackUsed: false,
      upstreamStatusCode: 400,
      upstreamErrorCode: "unsupported_parameter",
      upstreamErrorType: "invalid_request_error",
      upstreamMessageSanitized: "Unsupported parameter: response_format",
      parseStrategy: "failed",
    });
    expect(response.body).not.toContain("openai-real-secret");
    expect(response.body).not.toContain("Authorization");
    expect(response.body).not.toContain("messages");
  });

  it("reports GPT / OpenAI upstream 401 as provider auth failure, not admin auth failure", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const openAiProvider = state.providers.get("ai:openai");
    state.providers.set("ai:openai", {
      ...openAiProvider,
      enabled: true,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "openai-real-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/openai/test-connection",
      headers: adminAuthorizationHeader(),
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: false,
      attempted: true,
      statusCode: 401,
      error: "invalid_key",
      errorCategory: "invalid_key",
      message: "GPT / OpenAI API Key 或中转鉴权令牌无效。",
    });
    expect(response.body).not.toContain("登录状态已失效");
    expect(response.body).not.toContain("openai-real-secret");
  });

  it("forces real provider connection tests back to mock mode under NODE_ENV=test", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in automated tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    const openAiProvider = state.providers.get("ai:openai");
    const qWeatherProvider = state.providers.get("weather:qweather");
    const openMeteoProvider = state.providers.get("weather:open_meteo");
    const meteoblueProvider = state.providers.get("weather:meteoblue");
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
    state.providers.set("ai:openai", {
      ...openAiProvider,
      enabled: true,
      configJson: {
        ...(openAiProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "openai-test-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    state.providers.set("weather:qweather", {
      ...qWeatherProvider,
      enabled: true,
      configJson: {
        ...(qWeatherProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "qweather-test-secret",
      },
      maskedSecretJson: {
        apiKey: "qwea****cret",
      },
    });
    state.providers.set("weather:open_meteo", {
      ...openMeteoProvider,
      enabled: true,
      configJson: {
        ...(openMeteoProvider.configJson ?? {}),
        realCallEnabled: true,
        customerEndpoint: "https://customer.open-meteo.example",
      },
      secretJson: {
        apiKey: "open-meteo-test-secret",
      },
      maskedSecretJson: {
        apiKey: "open****cret",
      },
    });
    state.providers.set("weather:meteoblue", {
      ...meteoblueProvider,
      enabled: true,
      configJson: {
        ...(meteoblueProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "meteoblue-test-secret",
      },
      maskedSecretJson: {
        apiKey: "mete****cret",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const amapResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/geo/amap/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const openAiResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/openai/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const qWeatherResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/qweather/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const openMeteoResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/open_meteo/test-connection",
      headers: adminAuthorizationHeader(),
    });
    const meteoblueResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/weather/meteoblue/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(amapResponse.statusCode).toBe(200);
    expect(amapResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
    });
    expect(openAiResponse.statusCode).toBe(200);
    expect(openAiResponse.json()).toMatchObject({
      success: true,
      mode: "responses_api",
      connectionMode: "mock",
      model: "gpt-5.4-mini",
    });
    expect(qWeatherResponse.statusCode).toBe(200);
    expect(qWeatherResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
      connectionMode: "mock",
    });
    expect(openMeteoResponse.statusCode).toBe(200);
    expect(openMeteoResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
      connectionMode: "mock",
    });
    expect(meteoblueResponse.statusCode).toBe(200);
    expect(meteoblueResponse.json()).toMatchObject({
      success: true,
      mode: "mock",
      connectionMode: "mock",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("protects CDN refresh and validates unsafe URLs", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const aliyunProvider = state.providers.get("cdn:aliyun_cdn");
    state.providers.set("cdn:aliyun_cdn", {
      ...aliyunProvider,
      enabled: true,
      configJson: {
        ...(aliyunProvider.configJson ?? {}),
        domains: ["cdn.example.com"],
        realCallEnabled: false,
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const forbiddenResponse = await app.inject({
      method: "POST",
      url: "/admin/cdn/refresh",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        providerCode: "aliyun_cdn",
        urls: ["https://cdn.example.com/app.js"],
      },
    });
    expect(forbiddenResponse.statusCode).toBe(403);

    for (const url of [
      "http://localhost/app.js",
      "http://127.0.0.1/app.js",
      "http://192.168.1.10/app.js",
      "file:///tmp/app.js",
      "data:text/plain,hello",
      "javascript:alert(1)",
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/admin/cdn/refresh",
        headers: adminAuthorizationHeader(),
        payload: {
          providerCode: "aliyun_cdn",
          urls: [url],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: "invalid_cdn_url",
      });
      expect(response.body).not.toContain("at ");
    }

    const otherDomainResponse = await app.inject({
      method: "POST",
      url: "/admin/cdn/refresh",
      headers: adminAuthorizationHeader(),
      payload: {
        providerCode: "aliyun_cdn",
        urls: ["https://other.example.com/app.js"],
      },
    });

    expect(otherDomainResponse.statusCode).toBe(400);
    expect(otherDomainResponse.json()).toMatchObject({
      error: "cdn_domain_not_allowed",
      message: "CDN 操作 URL 必须属于已配置的加速域名。",
    });
  });

  it("accepts safe CDN refresh and prefetch in mock mode and records audit logs", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("CDN mock operations must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const tencentProvider = state.providers.get("cdn:tencent_cdn");
    state.providers.set("cdn:tencent_cdn", {
      ...tencentProvider,
      enabled: true,
      configJson: {
        ...(tencentProvider.configJson ?? {}),
        domains: "cdn.example.com",
        realCallEnabled: false,
      },
      secretJson: {
        secretId: "tencent-secret-id",
        secretKey: "tencent-secret-key",
      },
      maskedSecretJson: {
        secretId: "tenc****t-id",
        secretKey: "tenc****-key",
      },
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/admin/cdn/refresh",
      headers: adminAuthorizationHeader(),
      payload: {
        providerCode: "tencent_cdn",
        urls: ["https://cdn.example.com/app.js", "https://cdn.example.com/app.js"],
        directories: ["https://cdn.example.com/assets/"],
        refreshType: "url",
      },
    });
    const prefetchResponse = await app.inject({
      method: "POST",
      url: "/admin/cdn/prefetch",
      headers: adminAuthorizationHeader(),
      payload: {
        providerCode: "tencent_cdn",
        urls: ["https://cdn.example.com/app.js"],
      },
    });

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.json()).toMatchObject({
      success: true,
      providerCode: "tencent_cdn",
      providerNameZh: "腾讯云 CDN",
      mode: "mock",
      acceptedCount: 2,
      rejectedCount: 0,
    });
    expect(prefetchResponse.statusCode).toBe(200);
    expect(prefetchResponse.json()).toMatchObject({
      success: true,
      providerCode: "tencent_cdn",
      mode: "mock",
      acceptedCount: 1,
    });
    expect(refreshResponse.body).not.toContain("tencent-secret-key");
    expect(prefetchResponse.body).not.toContain("tencent-secret-key");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.auditLogs.map((log) => log.action)).toEqual(
      expect.arrayContaining(["cdn.refresh", "cdn.prefetch"]),
    );
    expect(JSON.stringify(state.auditLogs)).not.toContain("tencent-secret-key");
  });

  it("returns 410 for the retired fixed location admin API", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url: method === "GET" || method === "POST" ? "/admin/locations" : "/admin/locations/legacy",
        headers: adminAuthorizationHeader(),
        payload: method === "POST" || method === "PATCH" ? { name: "旧地点" } : undefined,
      });

      expect(response.statusCode).toBe(410);
      expect(response.json()).toMatchObject({
        error: "fixed_location_library_retired",
        message: "固定地点库管理已停用，历史校准请直接输入地点名称与 WGS84 坐标。",
      });
    }
    expect(state.auditLogs.map((log) => log.action)).not.toContain("location.create");
  });

  it("does not expose admin photo spot CRUD routes", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    for (const method of ["GET", "POST", "PATCH", "DELETE"] as const) {
      const response = await app.inject({
        method,
        url:
          method === "GET" || method === "POST"
            ? "/admin/photo-spots"
            : "/admin/photo-spots/legacy",
        headers: adminAuthorizationHeader(),
        payload: method === "POST" || method === "PATCH" ? { name: "旧版拍摄点" } : undefined,
      });

      expect(response.statusCode).toBe(404);
    }
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

  it("uses provider results instead of fixed local locations in public search", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results[0]).toMatchObject({
      name: "黄山光明顶",
      source: "mock",
    });
    expect(body.results).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ source: "local_location" })]),
    );
    expect(body.results).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ matchedLocationId: expect.any(String) })]),
    );
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
      name: "黄山光明顶",
      source: "mock",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses real Amap results when explicitly enabled", async () => {
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
      name: "黄山迎客松",
      source: "amap",
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
