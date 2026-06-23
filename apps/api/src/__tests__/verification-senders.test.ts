import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AliyunSmsVerificationSender,
  checkVerificationProviderConfig,
  readString,
} from "../verification-senders.js";
import { createFakeDatabaseClient } from "./fake-db.js";

const aliyunSmsDefaultEndpoint = "https://dysmsapi.aliyuncs.com";
const aliyunSmsReadyMessage =
  "短信服务配置完整；endpoint 留空时将使用默认阿里云短信地址。如需验证 AccessKey、签名和模板，请使用真实测试短信。";

function enableAliyunSmsProvider(
  state: Awaited<ReturnType<typeof createFakeDatabaseClient>>["state"],
  overrides: {
    readonly configJson?: Record<string, unknown>;
    readonly secretJson?: Record<string, unknown>;
  } = {},
) {
  const provider = state.providers.get("sms:aliyun_sms");
  state.providers.set("sms:aliyun_sms", {
    ...provider,
    enabled: true,
    configJson: {
      ...(provider.configJson ?? {}),
      realCallEnabled: true,
      regionId: "",
      endpoint: "",
      signName: "逐光天气",
      templateCode: "SMS_123456",
      timeoutMs: 10000,
      ...overrides.configJson,
    },
    secretJson: {
      accessKeyId: "aliyun-access-key-id",
      accessKeySecret: "aliyun-access-key-secret",
      ...overrides.secretJson,
    },
    maskedSecretJson: {
      accessKeyId: "aliy****y-id",
      accessKeySecret: "aliy****cret",
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verification sender config readers", () => {
  it("returns fallback strings for empty stored values when a non-empty fallback exists", () => {
    expect(readString({ endpoint: "" }, "endpoint", aliyunSmsDefaultEndpoint)).toBe(
      aliyunSmsDefaultEndpoint,
    );
    expect(readString({ regionId: "   " }, "regionId", "cn-hangzhou")).toBe("cn-hangzhou");
    expect(readString({ endpoint: 123 }, "endpoint", aliyunSmsDefaultEndpoint)).toBe(
      aliyunSmsDefaultEndpoint,
    );
  });

  it('still returns "" for required fields whose fallback is empty', () => {
    expect(readString({ signName: "" }, "signName")).toBe("");
    expect(readString({ templateCode: "   " }, "templateCode")).toBe("");
    expect(readString(null, "accessKeySecret")).toBe("");
  });
});

describe("Aliyun SMS verification sender", () => {
  it("treats empty endpoint and regionId as default Aliyun SMS values", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe(aliyunSmsDefaultEndpoint);
      const body = String(init?.body);
      expect(body).toContain("RegionId=cn-hangzhou");
      expect(body).toContain("TemplateCode=SMS_123456");
      return new Response(JSON.stringify({ Code: "OK", RequestId: "req-ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmsProvider(state);

    const result = await new AliyunSmsVerificationSender({ dbClient: client }).send({
      channel: "sms",
      purpose: "change_phone",
      target: "13900139000",
      code: "123456",
    });

    expect(result).toMatchObject({
      success: true,
      channel: "sms",
      providerCode: "aliyun_sms",
      mode: "real",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports config-ready success when endpoint is empty and required SMS fields exist", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmsProvider(state);

    const result = await checkVerificationProviderConfig({ channel: "sms", dbClient: client });

    expect(result).toMatchObject({
      success: true,
      mode: "config_check",
      configReady: true,
      messageZh: aliyunSmsReadyMessage,
    });
    expect(result.missingFields).toBeUndefined();
  });

  it("fails config checks when required Aliyun SMS fields are missing", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmsProvider(state, {
      configJson: {
        signName: "",
        templateCode: "",
      },
      secretJson: {
        accessKeyId: "",
        accessKeySecret: "",
      },
    });

    const result = await checkVerificationProviderConfig({ channel: "sms", dbClient: client });

    expect(result).toMatchObject({
      success: false,
      mode: "config_check",
      configReady: false,
      error: "provider_config_missing",
      missingFields: ["短信签名", "模板 Code", "AccessKey ID", "AccessKey Secret"],
    });
    expect(result.missingFields).not.toContain("Endpoint");
    expect(result.missingFields).not.toContain("Region ID");
  });

  it("returns safe diagnostics when Aliyun returns a non-OK code", async () => {
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let signedBody = "";
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      signedBody = String(init?.body);
      return new Response(
        JSON.stringify({
          Code: "isv.SMS_SIGNATURE_ILLEGAL",
          Message: `Aliyun rejected ${signedBody} AccessKeySecret=aliyun-access-key-secret Authorization=Bearer hidden`,
          RequestId: "req-failed",
          BizId: "biz-failed",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmsProvider(state);

    const result = await new AliyunSmsVerificationSender({ dbClient: client }).send({
      channel: "sms",
      purpose: "register",
      target: "13900139000",
      code: "246810",
    });

    const signature = new URLSearchParams(signedBody).get("Signature") ?? "";
    expect(result).toMatchObject({
      success: false,
      error: "sms_send_failed",
      messageZh: "短信服务暂不可用，请稍后重试。",
      upstreamCode: "isv.SMS_SIGNATURE_ILLEGAL",
      upstreamRequestId: "req-failed",
      upstreamBizId: "biz-failed",
    });
    expect(result.upstreamMessageSanitized).toContain("[redacted]");
    expect(warnMock).toHaveBeenCalledTimes(1);

    const serializedDiagnostics = JSON.stringify({
      result,
      logs: warnMock.mock.calls,
    });
    expect(serializedDiagnostics).not.toContain("aliyun-access-key-secret");
    expect(serializedDiagnostics).not.toContain("246810");
    expect(serializedDiagnostics).not.toContain(signedBody);
    expect(serializedDiagnostics).not.toContain(signature);
    expect(serializedDiagnostics).not.toContain("Authorization=Bearer hidden");
  });

  it("keeps diagnostics safe when Aliyun returns non-JSON failure payloads", async () => {
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async () => {
      return new Response("gateway timeout", {
        status: 504,
        headers: { "Content-Type": "text/plain" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    enableAliyunSmsProvider(state);

    const result = await new AliyunSmsVerificationSender({ dbClient: client }).send({
      channel: "sms",
      purpose: "change_phone",
      target: "13900139000",
      code: "135790",
    });

    expect(result).toMatchObject({
      success: false,
      error: "sms_send_failed",
      messageZh: "短信服务暂不可用，请稍后重试。",
    });
    expect(result.upstreamCode).toBeUndefined();
    expect(JSON.stringify(warnMock.mock.calls)).not.toContain("135790");
  });
});
