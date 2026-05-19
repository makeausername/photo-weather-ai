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
    expect(first.rolePermissions).toEqual(
      first.permissions.map((permission) => ({
        roleCode: "super_admin",
        permissionCode: permission.code,
      })),
    );
  });

  it("creates provider placeholders without real secrets", () => {
    const seedData = buildSeedData();

    expect(seedData.providerConfigs.map((provider) => provider.providerCode)).toEqual([
      "deepseek",
      "qweather",
      "open_meteo",
      "amap",
      "local_storage",
      "aliyun_oss",
      "tencent_cos",
      "s3_compatible",
    ]);
    expect(seedData.providerConfigs.every((provider) => provider.secretJson)).toBe(true);
    expect(seedData.providerConfigs.every((provider) => provider.maskedSecretJson)).toBe(true);
    expect(JSON.stringify(seedData.providerConfigs)).not.toContain("CHANGE_ME");
  });
});
