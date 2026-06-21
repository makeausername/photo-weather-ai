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
      messageZh: "登录状态已失效，请重新登录后台后再测试。",
      message: "登录状态已失效，请重新登录后台后再测试。",
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
      expect.arrayContaining(["deepseek", "qweather", "open_meteo", "meteoblue", "amap"]),
    );
    expect(body.groups.storage).toBeTruthy();
    expect(body.realDevCallFlags).toEqual({
      amap: false,
      deepseek: false,
      qweather: false,
      openMeteo: false,
      meteoblue: false,
    });
    expect(JSON.stringify(body)).not.toContain("secretJson");
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
      url: "/admin/providers/ai/deepseek",
      headers: adminAuthorizationHeader(),
      payload: {
        enabled: true,
        configJson: {
          analysisMode: "professional",
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
      messageZh: "DeepSeek 配置已保存。",
    });
    expect(body.provider).toMatchObject({
      providerType: "ai",
      providerCode: "deepseek",
      enabled: true,
      configJson: {
        baseUrl: "https://api.deepseek.com",
        realCallEnabled: true,
        analysisMode: "professional",
        model: "deepseek-v4-pro",
        responseFormat: "json_object",
        temperature: 0.2,
        maxTokens: 1200,
        promptMaxChars: 6000,
        thinkingEnabled: false,
        reasoningEffort: "none",
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

  it("checks verification providers without sending email or SMS when real calls are disabled", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("verification provider config check must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await createFakeDatabaseClient();
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
      success: true,
      mode: "config_check",
      connectionMode: "mock",
      modeLabelZh: "配置检查",
      providerCode: "aliyun_smtp",
      providerNameZh: "阿里云企业邮箱 SMTP",
      configReady: false,
      message: "当前为模拟测试，未发送真实邮件/短信。",
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
      message: "邮件服务真实调用已开启，请补充：SMTP Host、发件邮箱、SMTP 密码 / 授权码。本次未发送真实邮件。",
    });
    expect(smsResponse.statusCode).toBe(200);
    expect(smsResponse.json()).toMatchObject({
      success: false,
      mode: "config_check",
      error: "provider_config_missing",
      providerCode: "aliyun_sms",
      missingFields: ["短信签名", "模板 Code", "AccessKey Secret"],
      message: "短信服务真实调用已开启，请补充：短信签名、模板 Code、AccessKey Secret。本次未发送真实短信。",
    });
    expect(emailResponse.body).not.toContain("smtp-secret-user");
    expect(smsResponse.body).not.toContain("sms-secret-id");
    expect(fetchMock).not.toHaveBeenCalled();
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
      mode: "professional",
      connectionMode: "mock",
      model: "deepseek-v4-pro",
      message: "当前为模拟测试，未请求 DeepSeek 服务。",
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
      qweather: false,
      openMeteo: false,
      meteoblue: false,
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

    expect(amapResponse.statusCode).toBe(200);
    expect(amapResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "amap",
      providerNameZh: "高德地图",
      message: "请先填写高德 Web 服务 Key。",
    });
    expect(deepSeekResponse.statusCode).toBe(200);
    expect(deepSeekResponse.json()).toMatchObject({
      success: false,
      error: "provider_key_missing",
      providerCode: "deepseek",
      providerNameZh: "DeepSeek",
      message: "请先填写 DeepSeek API Key。",
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

  it("tests a real DeepSeek connection through mocked fetch outside NODE_ENV=test", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer deepseek-real-secret",
      });
      expect(String(init?.body)).not.toContain("deepseek-real-secret");
      const requestBody = JSON.parse(String(init?.body));
      expect(requestBody).toMatchObject({
        model: "deepseek-v4-pro",
        response_format: {
          type: "json_object",
        },
      });
      expect(requestBody).not.toHaveProperty("reasoning_effort");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: "DeepSeek 连接测试通过。",
                }),
              },
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
    const deepSeekProvider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...deepSeekProvider,
      enabled: true,
      configJson: {
        ...(deepSeekProvider.configJson ?? {}),
        realCallEnabled: true,
        analysisMode: "professional",
        maxTokens: 1200,
        promptMaxChars: 6000,
        thinkingEnabled: false,
        reasoningEffort: "none",
      },
      secretJson: {
        apiKey: "deepseek-real-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
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
      url: "/admin/providers/ai/deepseek/test-connection",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      mode: "professional",
      connectionMode: "real",
      modeLabelZh: "专业模式",
      model: "deepseek-v4-pro",
      latencyMs: expect.any(Number),
      message: "DeepSeek 连接测试通过。",
    });
    expect(response.body).not.toContain("deepseek-real-secret");
    expect(response.body).not.toContain("secretJson");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports DeepSeek upstream 401 as provider auth failure, not admin auth failure", async () => {
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
    const deepSeekProvider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...deepSeekProvider,
      enabled: true,
      configJson: {
        ...(deepSeekProvider.configJson ?? {}),
        realCallEnabled: true,
        analysisMode: "fast",
      },
      secretJson: {
        apiKey: "deepseek-real-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
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
      url: "/admin/providers/ai/deepseek/test-connection",
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
      message: "DeepSeek API Key 无效或权限不足。",
    });
    expect(response.body).not.toContain("登录状态已失效");
    expect(response.body).not.toContain("deepseek-real-secret");
  });

  it("forces real provider connection tests back to mock mode under NODE_ENV=test", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in automated tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const amapProvider = state.providers.get("geo:amap");
    const deepSeekProvider = state.providers.get("ai:deepseek");
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
    state.providers.set("ai:deepseek", {
      ...deepSeekProvider,
      enabled: true,
      configJson: {
        ...(deepSeekProvider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {
        apiKey: "deepseek-test-secret",
      },
      maskedSecretJson: {
        apiKey: "deep****cret",
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
    const deepSeekResponse = await app.inject({
      method: "POST",
      url: "/admin/providers/ai/deepseek/test-connection",
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
    expect(deepSeekResponse.statusCode).toBe(200);
    expect(deepSeekResponse.json()).toMatchObject({
      success: true,
      mode: "professional",
      connectionMode: "mock",
      model: "deepseek-v4-pro",
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
        url: method === "GET" || method === "POST" ? "/admin/photo-spots" : "/admin/photo-spots/legacy",
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
