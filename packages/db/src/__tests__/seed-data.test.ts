import { requiredAdminPermissions } from "../auth.js";
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
      "locations.manage",
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
  });

  it("creates provider placeholders without real secrets", () => {
    const seedData = buildSeedData();

    expect(seedData.providerConfigs.map((provider) => provider.providerCode)).toEqual([
      "deepseek",
      "qweather",
      "open_meteo",
      "meteoblue",
      "amap",
      "aliyun_smtp",
      "aliyun_sms",
      "local_storage",
      "aliyun_oss",
      "tencent_cos",
      "s3_compatible",
    ]);
    expect(seedData.providerConfigs).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(seedData.providerConfigs.every((provider) => provider.secretJson)).toBe(true);
    expect(seedData.providerConfigs.every((provider) => provider.maskedSecretJson)).toBe(true);
    expect(JSON.stringify(seedData.providerConfigs)).not.toContain("CHANGE_ME");
  });

  it("includes unverified Chinese location examples without active photo spot samples", () => {
    const seedData = buildSeedData();

    expect(seedData.locations.map((location) => location.name)).toEqual([
      "黄山",
      "老君山",
      "三清山",
      "武功山",
    ]);
    expect(seedData.locations.every((location) => location.isVerified === false)).toBe(true);
    expect(JSON.stringify(seedData)).not.toContain("黄山光明顶");
    expect(JSON.stringify(seedData)).not.toContain("photo_spots.manage");
    expect(requiredAdminPermissions).not.toContain("photo_spots.manage");
  });
});
