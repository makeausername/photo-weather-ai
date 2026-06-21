import { describe, expect, it } from "vitest";
import {
  getDeepSeekModeRuntimeDefaults,
  deepSeekModelOptions,
  getProviderFieldPreset,
  normalizeDeepSeekAnalysisMode,
  normalizeDeepSeekModel,
  providerFieldPresets,
} from "../provider-fields.js";

describe("provider field presets", () => {
  it("defines visual fields for common provider secrets", () => {
    expect(providerFieldPresets.map((preset) => preset.providerCode)).toEqual(
      expect.arrayContaining([
        "deepseek",
        "qweather",
        "open_meteo",
        "meteoblue",
        "amap",
        "aliyun_smtp",
        "aliyun_sms",
        "aliyun_oss",
        "tencent_cos",
        "s3_compatible",
        "local_storage",
        "wechat_pay",
        "alipay",
      ]),
    );

    expect(getProviderFieldPreset("amap")?.fields).toContainEqual(
      expect.objectContaining({
        key: "apiKey",
        label: "高德 Web 服务 Key",
        target: "secretJson",
        password: true,
      }),
    );
  });

  it("separates editable config fields from masked secret fields", () => {
    expect(getProviderFieldPreset("deepseek")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "apiKey", target: "secretJson" }),
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "analysisMode",
          target: "configJson",
          control: "select",
        }),
        expect.objectContaining({
          key: "model",
          target: "configJson",
          control: "select",
        }),
        expect.objectContaining({ key: "baseUrl", target: "configJson", advanced: true }),
        expect.objectContaining({
          key: "timeoutMs",
          target: "configJson",
          defaultValue: 120000,
          advanced: true,
        }),
        expect.objectContaining({
          key: "promptMaxChars",
          target: "configJson",
          defaultValue: 6000,
          advanced: true,
        }),
      ]),
    );

    const qweatherFields = getProviderFieldPreset("qweather")?.fields;
    expect(qweatherFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "apiKey",
          label: "和风天气 API Key",
          target: "secretJson",
        }),
        expect.objectContaining({ key: "apiHost", target: "configJson" }),
        expect.objectContaining({ key: "timeoutMs", target: "configJson", advanced: true }),
        expect.objectContaining({ key: "language", target: "configJson", advanced: true }),
        expect.objectContaining({ key: "unit", target: "configJson", advanced: true }),
      ]),
    );
    expect(qweatherFields?.find((field) => field.key === "apiHost")?.advanced).toBeUndefined();

    expect(getProviderFieldPreset("open_meteo")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "apiKey",
          label: "Open-Meteo API Key（可选）",
          target: "secretJson",
        }),
        expect.objectContaining({ key: "customerEndpoint", target: "configJson" }),
        expect.objectContaining({ key: "defaultModel", target: "configJson", advanced: true }),
      ]),
    );

    expect(getProviderFieldPreset("meteoblue")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "apiKey",
          label: "meteoblue API Key",
          target: "secretJson",
        }),
        expect.objectContaining({
          key: "packages",
          target: "configJson",
          defaultValue: "basic-1h,clouds-1h",
        }),
      ]),
    );
    expect(getProviderFieldPreset("meteoblue")?.helpText).toBe(
      "meteoblue 可作为专业增强天气源，用于 Forecast API 真实测试和后续多源融合。",
    );
    expect(getProviderFieldPreset("amap")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "timeoutMs", target: "configJson", advanced: true }),
        expect.objectContaining({ key: "retryCount", target: "configJson", advanced: true }),
      ]),
    );
  });

  it("defines editable account verification provider fields without exposing secrets", () => {
    expect(getProviderFieldPreset("aliyun_smtp")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({ key: "host", label: "SMTP Host", target: "configJson" }),
        expect.objectContaining({
          key: "port",
          label: "SMTP 端口",
          target: "configJson",
          control: "number",
          defaultValue: 465,
          min: 1,
          max: 65535,
        }),
        expect.objectContaining({
          key: "secure",
          label: "启用 SSL/TLS",
          target: "configJson",
          control: "boolean",
          defaultValue: true,
        }),
        expect.objectContaining({ key: "fromAddress", label: "发件邮箱", target: "configJson" }),
        expect.objectContaining({
          key: "username",
          label: "SMTP 用户名",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "password",
          label: "SMTP 密码 / 授权码",
          target: "secretJson",
          password: true,
        }),
      ]),
    );

    expect(getProviderFieldPreset("aliyun_sms")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "realCallEnabled", target: "configJson" }),
        expect.objectContaining({
          key: "regionId",
          label: "Region ID",
          target: "configJson",
          defaultValue: "cn-hangzhou",
        }),
        expect.objectContaining({
          key: "endpoint",
          label: "Endpoint",
          target: "configJson",
          advanced: true,
        }),
        expect.objectContaining({ key: "signName", label: "短信签名", target: "configJson" }),
        expect.objectContaining({ key: "templateCode", label: "模板 Code", target: "configJson" }),
        expect.objectContaining({
          key: "accessKeyId",
          label: "AccessKey ID",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "accessKeySecret",
          label: "AccessKey Secret",
          target: "secretJson",
          password: true,
        }),
      ]),
    );
  });

  it("defines complete object storage provider fields without exposing secrets", () => {
    expect(getProviderFieldPreset("local_storage")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "rootPath", target: "configJson" }),
        expect.objectContaining({ key: "publicBaseUrl", target: "configJson" }),
        expect.objectContaining({ key: "basePrefix", target: "configJson" }),
        expect.objectContaining({
          key: "maxUploadBytes",
          target: "configJson",
          control: "number",
          defaultValue: 10485760,
        }),
      ]),
    );

    expect(getProviderFieldPreset("aliyun_oss")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "realCallEnabled",
          label: "启用真实调用",
          target: "configJson",
          control: "boolean",
        }),
        expect.objectContaining({ key: "region", label: "Region", target: "configJson" }),
        expect.objectContaining({ key: "endpoint", label: "Endpoint", target: "configJson" }),
        expect.objectContaining({ key: "bucket", label: "Bucket", target: "configJson" }),
        expect.objectContaining({ key: "basePrefix", label: "存储前缀", target: "configJson" }),
        expect.objectContaining({
          key: "publicBaseUrl",
          label: "公开访问地址",
          target: "configJson",
        }),
        expect.objectContaining({
          key: "forcePathStyle",
          label: "Path-style 访问",
          target: "configJson",
          advanced: true,
        }),
        expect.objectContaining({
          key: "timeoutMs",
          label: "请求超时（毫秒）",
          target: "configJson",
          defaultValue: 10000,
          advanced: true,
        }),
        expect.objectContaining({
          key: "maxUploadBytes",
          label: "最大上传字节数",
          target: "configJson",
          defaultValue: 10485760,
          advanced: true,
        }),
        expect.objectContaining({
          key: "accessKeyId",
          label: "AccessKey ID",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "accessKeySecret",
          label: "AccessKey Secret",
          target: "secretJson",
          password: true,
        }),
      ]),
    );

    expect(getProviderFieldPreset("tencent_cos")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "realCallEnabled",
          label: "启用真实调用",
          target: "configJson",
          control: "boolean",
        }),
        expect.objectContaining({ key: "region", label: "Region", target: "configJson" }),
        expect.objectContaining({ key: "bucket", label: "Bucket", target: "configJson" }),
        expect.objectContaining({ key: "basePrefix", label: "存储前缀", target: "configJson" }),
        expect.objectContaining({
          key: "publicBaseUrl",
          label: "公开访问地址",
          target: "configJson",
        }),
        expect.objectContaining({
          key: "timeoutMs",
          label: "请求超时（毫秒）",
          target: "configJson",
          defaultValue: 10000,
          advanced: true,
        }),
        expect.objectContaining({
          key: "maxUploadBytes",
          label: "最大上传字节数",
          target: "configJson",
          defaultValue: 10485760,
          advanced: true,
        }),
        expect.objectContaining({
          key: "secretId",
          label: "Secret ID",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "secretKey",
          label: "Secret Key",
          target: "secretJson",
          password: true,
        }),
      ]),
    );
  });

  it("defines payment provider fields without exposing raw secrets", () => {
    expect(getProviderFieldPreset("wechat_pay")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "realCallEnabled",
          label: "启用真实调用",
          target: "configJson",
          control: "boolean",
          defaultValue: false,
        }),
        expect.objectContaining({
          key: "mode",
          label: "支付模式",
          target: "configJson",
          control: "select",
          defaultValue: "native",
        }),
        expect.objectContaining({ key: "appId", target: "configJson" }),
        expect.objectContaining({ key: "mchId", target: "configJson" }),
        expect.objectContaining({ key: "notifyUrl", target: "configJson" }),
        expect.objectContaining({
          key: "merchantPrivateKeyPem",
          label: "商户私钥 PEM",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "apiV3Key",
          label: "API v3 密钥",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "platformPublicKeyPem",
          label: "平台公钥 PEM",
          target: "secretJson",
          password: true,
        }),
      ]),
    );

    expect(getProviderFieldPreset("alipay")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "mode",
          label: "支付模式",
          target: "configJson",
          control: "select",
          defaultValue: "page",
        }),
        expect.objectContaining({ key: "appId", target: "configJson" }),
        expect.objectContaining({ key: "notifyUrl", target: "configJson" }),
        expect.objectContaining({
          key: "appPrivateKeyPem",
          label: "应用私钥 PEM",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "alipayPublicKeyPem",
          label: "支付宝公钥 PEM",
          target: "secretJson",
          password: true,
        }),
        expect.objectContaining({
          key: "gatewayUrl",
          label: "支付宝网关",
          target: "configJson",
          advanced: true,
        }),
      ]),
    );
  });

  it("keeps DeepSeek model dropdown values centralized", () => {
    expect(deepSeekModelOptions.map((option) => option.value)).toEqual(["deepseek-v4-pro"]);
    expect(normalizeDeepSeekModel("deepseek-reasoner")).toBe("deepseek-v4-pro");
    expect(normalizeDeepSeekModel("deepseek-chat")).toBe("deepseek-v4-pro");
    expect(normalizeDeepSeekModel("custom-model")).toBe("deepseek-v4-pro");
  });

  it("maps DeepSeek modes and legacy models to v4 pro runtime defaults", () => {
    expect(getDeepSeekModeRuntimeDefaults("professional")).toMatchObject({
      model: "deepseek-v4-pro",
      maxTokens: 1200,
      thinkingEnabled: false,
      reasoningEffort: "none",
    });
    expect(normalizeDeepSeekAnalysisMode(undefined, "deepseek-chat")).toBe("professional");
    expect(normalizeDeepSeekAnalysisMode(undefined, "deepseek-reasoner")).toBe("professional");
    expect(normalizeDeepSeekAnalysisMode("fast", "legacy-fast-model")).toBe("professional");
  });
});
