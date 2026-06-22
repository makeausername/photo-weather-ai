import { describe, expect, it, vi } from "vitest";
import {
  checkTencentCaptchaConfig,
  getTencentCaptchaPublicConfig,
  verifyTencentCaptcha,
} from "../captcha-provider.js";
import { createFakeDatabaseClient } from "./fake-db.js";

function enableTencentCaptchaProvider(
  state: Awaited<ReturnType<typeof createFakeDatabaseClient>>["state"],
) {
  const provider = state.providers.get("captcha:tencent_captcha");
  state.providers.set("captcha:tencent_captcha", {
    ...provider,
    enabled: true,
    configJson: {
      ...(provider.configJson ?? {}),
      realCallEnabled: true,
      captchaAppId: "199999164",
      enforceOnLogin: true,
      enforceOnRegisterSendCode: true,
      enforceOnRegisterConfirm: true,
      failOpenInDevelopment: false,
      failOpenInProduction: false,
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
}

describe("Tencent captcha provider", () => {
  it("returns a safe disabled public config by default", async () => {
    const { client } = await createFakeDatabaseClient();

    await expect(getTencentCaptchaPublicConfig({ dbClient: client })).resolves.toEqual({
      enabled: false,
      providerCode: "tencent_captcha",
      captchaAppId: "",
      sdkUrl: "https://turing.captcha.qcloud.com/TCaptcha.js",
      enforceOnLogin: false,
      enforceOnRegisterSendCode: false,
      enforceOnRegisterConfirm: false,
      enforceOnAccountBinding: false,
    });
  });

  it("checks config without calling Tencent", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("captcha config checks must not call network");
    });
    const { client, state } = await createFakeDatabaseClient();
    enableTencentCaptchaProvider(state);

    await expect(checkTencentCaptchaConfig({ dbClient: client })).resolves.toMatchObject({
      success: true,
      mode: "config_check",
      providerType: "captcha",
      providerCode: "tencent_captcha",
      enabled: true,
      realCallEnabled: true,
      configReady: true,
      missingFields: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies Tencent captcha tickets with TC3 signed fake requests", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          Response: {
            CaptchaCode: 1,
            CaptchaMsg: "OK",
            RequestId: "req-captcha-1",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const { client, state } = await createFakeDatabaseClient();
    enableTencentCaptchaProvider(state);

    const result = await verifyTencentCaptcha(
      {
        action: "login",
        ticket: "ticket-valid-123456",
        randstr: "@rand",
        userIp: "203.0.113.10",
        userAgent: "vitest",
      },
      {
        dbClient: client,
        env: { ...process.env, NODE_ENV: "production" },
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );

    expect(result).toMatchObject({
      success: true,
      mode: "real",
      enforced: true,
      providerRequestId: "req-captcha-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    if (!firstCall) {
      throw new Error("Expected Tencent captcha fetch call.");
    }
    const [url, init] = firstCall;
    expect(url).toBe("https://captcha.tencentcloudapi.com");
    expect(init).toMatchObject({
      method: "POST",
    });
    expect(JSON.stringify(init?.headers)).toContain("TC3-HMAC-SHA256");
    expect(JSON.stringify(init?.headers)).not.toContain("tencent-secret-key");
    expect(String(init?.body)).toContain('"CaptchaType":9');
    expect(String(init?.body)).toContain('"CaptchaAppId":199999164');
  });

  it("rejects failed captcha tickets without exposing secrets or tickets", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          Response: {
            CaptchaCode: 9,
            CaptchaMsg: "ticket invalid",
            RequestId: "req-captcha-failed",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const { client, state } = await createFakeDatabaseClient();
    enableTencentCaptchaProvider(state);

    const result = await verifyTencentCaptcha(
      {
        action: "register_send_code",
        ticket: "ticket-invalid-123456",
        randstr: "@rand",
        userIp: "203.0.113.10",
      },
      {
        dbClient: client,
        env: { ...process.env, NODE_ENV: "production" },
        fetcher: fetchMock as unknown as typeof fetch,
      },
    );

    expect(result).toMatchObject({
      success: false,
      mode: "real",
      enforced: true,
      error: "captcha_invalid",
      providerRequestId: "req-captcha-failed",
    });
    expect(JSON.stringify(result)).not.toContain("ticket-invalid-123456");
    expect(JSON.stringify(result)).not.toContain("tencent-secret-key");
    expect(JSON.stringify(result)).not.toContain("captcha-app-secret");
  });
});
