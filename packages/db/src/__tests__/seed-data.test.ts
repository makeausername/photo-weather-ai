import { requiredAdminPermissions } from "../auth.js";
import { providerTypes } from "../constants.js";
import { buildSeedData } from "../seed-data.js";
import { describe, expect, it } from "vitest";

describe("database seed data", () => {
  it("is deterministic and includes the default roles and permissions", () => {
    const first = buildSeedData();
    const second = buildSeedData();

    expect(first).toEqual(second);
    expect(first.roles.map((role) => role.code)).toEqual(["super_admin", "admin", "user"]);
    expect(first.permissions.map((permission) => permission.code)).toEqual([
      "admin.manage",
      "settings.manage",
      "providers.manage",
      "users.manage",
      "audit.read",
      "usage.read",
    ]);
    expect(first.rolePermissions).toEqual([
      ...first.permissions.map((permission) => ({
        roleCode: "super_admin",
        permissionCode: permission.code,
      })),
      ...first.permissions.map((permission) => ({
        roleCode: "admin",
        permissionCode: permission.code,
      })),
    ]);
    expect(providerTypes).toContain("cdn");
  });

  it("creates provider placeholders without real secrets", () => {
    const seedData = buildSeedData();

    expect(seedData.providerConfigs.map((provider) => provider.providerCode)).toEqual([
      "deepseek",
      "qweather",
      "open_meteo",
      "meteoblue",
      "amap",
      "wechat_pay",
      "alipay",
      "aliyun_smtp",
      "aliyun_sms",
      "local_storage",
      "aliyun_oss",
      "tencent_cos",
      "s3_compatible",
      "aliyun_cdn",
      "tencent_cdn",
    ]);
    expect(seedData.providerConfigs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerType: "billing",
          providerCode: "wechat_pay",
          displayName: "微信支付",
          enabled: false,
          configJson: expect.objectContaining({
            realCallEnabled: false,
            mode: "native",
            apiBaseUrl: "https://api.mch.weixin.qq.com",
          }),
          secretJson: {
            merchantSerialNo: "",
            merchantPrivateKeyPem: "",
            apiV3Key: "",
            platformCertificatePem: "",
            platformPublicKeyPem: "",
          },
          maskedSecretJson: {
            merchantSerialNo: "",
            merchantPrivateKeyPem: "",
            apiV3Key: "",
            platformCertificatePem: "",
            platformPublicKeyPem: "",
          },
        }),
        expect.objectContaining({
          providerType: "billing",
          providerCode: "alipay",
          displayName: "支付宝",
          enabled: false,
          configJson: expect.objectContaining({
            realCallEnabled: false,
            mode: "page",
            gatewayUrl: "https://openapi.alipay.com/gateway.do",
            signType: "RSA2",
          }),
          secretJson: {
            appPrivateKeyPem: "",
            alipayPublicKeyPem: "",
          },
          maskedSecretJson: {
            appPrivateKeyPem: "",
            alipayPublicKeyPem: "",
          },
        }),
        expect.objectContaining({
          providerType: "email",
          providerCode: "aliyun_smtp",
          displayName: "阿里云企业邮箱 SMTP",
          enabled: false,
          configJson: expect.objectContaining({
            realCallEnabled: false,
            port: 465,
            secure: true,
          }),
          maskedSecretJson: {
            username: "",
            password: "",
          },
        }),
        expect.objectContaining({
          providerType: "sms",
          providerCode: "aliyun_sms",
          displayName: "阿里云短信",
          enabled: false,
          configJson: expect.objectContaining({
            realCallEnabled: false,
            regionId: "cn-hangzhou",
          }),
          maskedSecretJson: {
            accessKeyId: "",
            accessKeySecret: "",
          },
        }),
        expect.objectContaining({
          providerType: "storage",
          providerCode: "local_storage",
          displayName: "本地存储",
          enabled: true,
          configJson: {
            rootPath: "data/uploads",
            publicBaseUrl: "",
            basePrefix: "uploads",
            maxUploadBytes: 10485760,
          },
          secretJson: {},
          maskedSecretJson: {},
        }),
        expect.objectContaining({
          providerType: "storage",
          providerCode: "aliyun_oss",
          displayName: "阿里云 OSS",
          enabled: false,
          configJson: {
            realCallEnabled: false,
            region: "",
            endpoint: "",
            bucket: "",
            basePrefix: "uploads",
            publicBaseUrl: "",
            forcePathStyle: false,
            timeoutMs: 10000,
            maxUploadBytes: 10485760,
          },
          secretJson: {
            accessKeyId: "",
            accessKeySecret: "",
          },
          maskedSecretJson: {
            accessKeyId: "",
            accessKeySecret: "",
          },
        }),
        expect.objectContaining({
          providerType: "storage",
          providerCode: "tencent_cos",
          displayName: "腾讯云 COS",
          enabled: false,
          configJson: {
            realCallEnabled: false,
            region: "",
            bucket: "",
            basePrefix: "uploads",
            publicBaseUrl: "",
            timeoutMs: 10000,
            maxUploadBytes: 10485760,
          },
          secretJson: {
            secretId: "",
            secretKey: "",
          },
          maskedSecretJson: {
            secretId: "",
            secretKey: "",
          },
        }),
        expect.objectContaining({
          providerType: "cdn",
          providerCode: "aliyun_cdn",
          displayName: "阿里云 CDN",
          enabled: false,
          priority: 100,
          configJson: {
            realCallEnabled: false,
            endpoint: "https://cdn.aliyuncs.com",
            domains: [],
            defaultRefreshType: "file",
            timeoutMs: 10000,
            retryCount: 1,
            rateLimitPerMinute: 60,
            dryRun: true,
          },
          secretJson: {
            accessKeyId: "",
            accessKeySecret: "",
          },
          maskedSecretJson: {
            accessKeyId: "",
            accessKeySecret: "",
          },
        }),
        expect.objectContaining({
          providerType: "cdn",
          providerCode: "tencent_cdn",
          displayName: "腾讯云 CDN",
          enabled: false,
          priority: 200,
          configJson: {
            realCallEnabled: false,
            endpoint: "https://cdn.tencentcloudapi.com",
            region: "",
            domains: [],
            defaultPurgeType: "url",
            timeoutMs: 10000,
            retryCount: 1,
            rateLimitPerMinute: 60,
            dryRun: true,
          },
          secretJson: {
            secretId: "",
            secretKey: "",
          },
          maskedSecretJson: {
            secretId: "",
            secretKey: "",
          },
        }),
      ]),
    );
    expect(seedData.providerConfigs.every((provider) => provider.secretJson)).toBe(true);
    expect(seedData.providerConfigs.every((provider) => provider.maskedSecretJson)).toBe(true);
    expect(JSON.stringify(seedData.providerConfigs)).not.toContain("CHANGE_ME");
  });

  it("seeds enabled billing products with integer-cent CNY pricing", () => {
    const seedData = buildSeedData();

    expect(seedData.billingProducts).toEqual([
      expect.objectContaining({
        code: "forecast_credit_20",
        name: "20 次专业预测包",
        amountCents: 990,
        currency: "CNY",
        credits: 20,
        enabled: true,
      }),
      expect.objectContaining({
        code: "forecast_credit_100",
        name: "100 次专业预测包",
        amountCents: 3990,
        currency: "CNY",
        credits: 100,
        enabled: true,
      }),
    ]);
    expect(seedData.billingProducts.every((product) => Number.isInteger(product.amountCents))).toBe(
      true,
    );
  });

  it("does not seed fixed demo locations or inactive location permissions", () => {
    const seedData = buildSeedData();

    expect(seedData.locations).toEqual([]);
    expect(JSON.stringify(seedData)).not.toContain("黄山");
    expect(JSON.stringify(seedData)).not.toContain("老君山");
    expect(JSON.stringify(seedData)).not.toContain("三清山");
    expect(JSON.stringify(seedData)).not.toContain("武功山");
    expect(JSON.stringify(seedData)).not.toContain("locations.manage");
    expect(JSON.stringify(seedData)).not.toContain("黄山光明顶");
    expect(JSON.stringify(seedData)).not.toContain("photo_spots.manage");
    expect(requiredAdminPermissions).not.toContain("locations.manage");
    expect(requiredAdminPermissions).not.toContain("photo_spots.manage");
  });
});
