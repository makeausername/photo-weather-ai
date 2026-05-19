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
      "photo_spots.manage",
      "audit.read",
      "usage.read",
    ]);
    expect(first.rolePermissions).toEqual([
      ...first.permissions.map((permission) => ({
        roleCode: "super_admin",
        permissionCode: permission.code,
      })),
      ...["admin.manage", "locations.manage", "photo_spots.manage", "audit.read"].map(
        (permissionCode) => ({
          roleCode: "admin",
          permissionCode,
        }),
      ),
    ]);
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

  it("includes unverified Chinese location and photo spot examples", () => {
    const seedData = buildSeedData();

    expect(seedData.locations.map((location) => location.name)).toEqual([
      "黄山",
      "老君山",
      "三清山",
      "武功山",
    ]);
    expect(seedData.photoSpots.map((photoSpot) => photoSpot.name)).toEqual([
      "黄山光明顶",
      "老君山金顶",
      "三清山女神峰",
      "武功山金顶",
    ]);
    expect(seedData.locations.every((location) => location.isVerified === false)).toBe(true);
    expect(seedData.photoSpots.every((photoSpot) => photoSpot.isVerified === false)).toBe(true);
    expect(JSON.stringify(seedData.photoSpots)).toContain("上线前必须人工核验");
  });
});
