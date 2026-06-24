import { describe, expect, it } from "vitest";
import { getProviderFieldPreset, providerFieldPresets } from "../provider-fields.js";

describe("provider field presets", () => {
  it("defines visual fields for common provider secrets", () => {
    expect(providerFieldPresets.map((preset) => preset.providerCode)).toEqual(
      expect.arrayContaining([
        "qweather",
        "open_meteo",
        "meteoblue",
        "amap",
        "aliyun_smtp",
        "aliyun_sms",
        "tencent_captcha",
        "aliyun_oss",
        "tencent_cos",
        "aliyun_cdn",
        "tencent_cdn",
        "s3_compatible",
        "local_storage",
        "wechat_pay",
        "alipay",
      ]),
    );
    expect(providerFieldPresets.map((preset) => preset.providerCode)).not.toEqual(
      expect.arrayContaining(["openai", "deepseek"]),
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
    expect(getProviderFieldPreset("openai")).toBeUndefined();
    expect(getProviderFieldPreset("deepseek")).toBeUndefined();

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
        expect.objectContaining({
          key: "host",
          label: "SMTP Host",
          target: "configJson",
          placeholder: "smtp.qiye.aliyun.com",
          helpText: "阿里云企业邮箱通常填写 smtp.qiye.aliyun.com。",
        }),
        expect.objectContaining({
          key: "port",
          label: "SMTP 端口",
          target: "configJson",
          control: "number",
          defaultValue: 465,
          min: 1,
          max: 65535,
          helpText: "SSL/TLS 通常使用 465；如果邮箱服务支持 STARTTLS，可使用 587。",
        }),
        expect.objectContaining({
          key: "secure",
          label: "启用 SSL/TLS",
          target: "configJson",
          control: "boolean",
          defaultValue: true,
        }),
        expect.objectContaining({
          key: "fromAddress",
          label: "发件邮箱",
          target: "configJson",
          helpText: "通常应与 SMTP 用户名保持一致。",
        }),
        expect.objectContaining({
          key: "username",
          label: "SMTP 用户名",
          target: "secretJson",
          placeholder: "例如 support@domain.com；留空则保持现有密钥不变",
          helpText: "通常填写完整邮箱地址，例如 support@domain.com。",
          password: true,
        }),
        expect.objectContaining({
          key: "password",
          label: "SMTP 密码 / 授权码",
          target: "secretJson",
          helpText: "填写邮箱密码或客户端授权码，不是阿里云 AccessKey。",
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
          placeholder: "留空则使用默认值：https://dysmsapi.aliyuncs.com",
          helpText: "正常管理员无需填写；留空时系统会使用默认阿里云短信地址。",
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

  it("defines Tencent captcha fields without exposing server secrets as config", () => {
    expect(getProviderFieldPreset("tencent_captcha")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "realCallEnabled",
          label: "启用真实调用",
          target: "configJson",
          control: "boolean",
          defaultValue: false,
        }),
        expect.objectContaining({
          key: "captchaAppId",
          label: "CaptchaAppId",
          target: "configJson",
        }),
        expect.objectContaining({
          key: "captchaType",
          label: "CaptchaType",
          target: "configJson",
          control: "number",
          defaultValue: 9,
        }),
        expect.objectContaining({
          key: "sdkUrl",
          label: "前端 SDK 地址",
          target: "configJson",
          defaultValue: "https://turing.captcha.qcloud.com/TCaptcha.js",
        }),
        expect.objectContaining({
          key: "endpoint",
          label: "Endpoint",
          target: "configJson",
          defaultValue: "https://captcha.tencentcloudapi.com",
        }),
        expect.objectContaining({
          key: "enforceOnRegisterSendCode",
          target: "configJson",
          control: "boolean",
          defaultValue: true,
        }),
        expect.objectContaining({
          key: "failOpenInProduction",
          target: "configJson",
          control: "boolean",
          defaultValue: false,
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
        expect.objectContaining({
          key: "appSecretKey",
          label: "AppSecretKey",
          target: "secretJson",
          password: true,
        }),
      ]),
    );
    expect(
      getProviderFieldPreset("tencent_captcha")?.fields.filter(
        (field) => field.target === "configJson",
      ),
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ key: "secretId" }),
        expect.objectContaining({ key: "secretKey" }),
        expect.objectContaining({ key: "appSecretKey" }),
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

  it("defines complete CDN provider fields without exposing secrets", () => {
    expect(getProviderFieldPreset("aliyun_cdn")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "realCallEnabled",
          label: "启用真实调用",
          target: "configJson",
          control: "boolean",
        }),
        expect.objectContaining({ key: "domains", label: "CDN 加速域名", target: "configJson" }),
        expect.objectContaining({
          key: "endpoint",
          label: "Endpoint",
          target: "configJson",
          defaultValue: "https://cdn.aliyuncs.com",
        }),
        expect.objectContaining({
          key: "defaultRefreshType",
          target: "configJson",
          control: "select",
          defaultValue: "file",
        }),
        expect.objectContaining({
          key: "timeoutMs",
          target: "configJson",
          defaultValue: 10000,
          advanced: true,
        }),
        expect.objectContaining({
          key: "retryCount",
          target: "configJson",
          defaultValue: 1,
          advanced: true,
        }),
        expect.objectContaining({
          key: "rateLimitPerMinute",
          target: "configJson",
          defaultValue: 60,
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

    expect(getProviderFieldPreset("tencent_cdn")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "realCallEnabled",
          label: "启用真实调用",
          target: "configJson",
          control: "boolean",
        }),
        expect.objectContaining({ key: "domains", label: "CDN 加速域名", target: "configJson" }),
        expect.objectContaining({
          key: "endpoint",
          label: "Endpoint",
          target: "configJson",
          defaultValue: "https://cdn.tencentcloudapi.com",
        }),
        expect.objectContaining({ key: "region", label: "Region", target: "configJson" }),
        expect.objectContaining({
          key: "defaultPurgeType",
          target: "configJson",
          control: "select",
          defaultValue: "url",
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

});
