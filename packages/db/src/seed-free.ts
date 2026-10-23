import type { PrismaClient, Prisma } from "@prisma/client";
import { validatePublicSiteSetting } from "@photo-weather/shared";
import { buildSeedData } from "./seed-data.js";
import { createOrUpdateAdmin, readCreateAdminEnv, verifyAdminBootstrap } from "./create-admin.js";
import type { DatabaseClient } from "./types.js";

/** Production and repeat upgrades share this initializer; existing values are never reset. */
export async function initializeFreeDatabase(client: PrismaClient, env = process.env) {
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("请配置有效的 ADMIN_EMAIL。");
  const baseUrl = env.PUBLIC_SITE_URL ?? env.SITE_URL ?? "";
  validatePublicSiteSetting("site.baseUrl", baseUrl);
  if (env.NODE_ENV === "production" && new URL(baseUrl).protocol !== "https:") {
    throw new Error("生产网站地址必须使用 HTTPS。");
  }
  const values: Record<string, string> = {
    "site.name": env.SITE_NAME ?? "逐光天气",
    "site.baseUrl": baseUrl,
    "locale.defaultLanguage": "zh-CN",
    "locale.defaultTimezone": env.SITE_TIMEZONE ?? "Asia/Shanghai",
  };
  for (const [key, value] of Object.entries(values)) validatePublicSiteSetting(key, value);

  return client.$transaction(
    async (db) => {
      if ((await db.billingProduct.count()) || (await db.paymentOrder.count())) {
        throw new Error("免费版初始化拒绝商业版数据库。请使用新库，不会删除或迁移旧记录。");
      }
      const existing = await db.user.findUnique({ where: { email } });
      const authClient = db as unknown as DatabaseClient;
      if (existing) {
        // Do not promote, reactivate, rename, or reset an existing account on update.
        await verifyAdminBootstrap({ email, client: authClient });
      } else {
        await createOrUpdateAdmin({ ...readCreateAdminEnv(env), client: authClient });
      }
      const seed = buildSeedData();
      for (const setting of seed.systemSettings.filter((item) => item.key in values)) {
        await db.systemSetting.upsert({
          where: { key: setting.key },
          create: { ...setting, valueJson: values[setting.key]! },
          update: {},
        });
      }
      for (const provider of seed.providerConfigs.filter(
        (item) =>
          (item.providerType === "weather" &&
            ["qweather", "open_meteo"].includes(item.providerCode)) ||
          (item.providerType === "geo" && item.providerCode === "amap"),
      )) {
        const openMeteo = provider.providerCode === "open_meteo";
        await db.providerConfig.upsert({
          where: {
            providerType_providerCode: {
              providerType: provider.providerType,
              providerCode: provider.providerCode,
            },
          },
          create: {
            ...provider,
            enabled: openMeteo,
            configJson: {
              ...(provider.configJson as Prisma.InputJsonObject),
              realCallEnabled: true,
              ...(openMeteo
                ? {
                    mode: "free",
                    baseUrl: "https://api.open-meteo.com",
                    customerEndpoint: "",
                    modelList: "best_match,gfs_seamless",
                    modelListLimit: 2,
                  }
                : {}),
            },
            secretJson: {},
            maskedSecretJson: {},
          },
          update: {},
        });
      }
      return { adminCreated: !existing, settings: 4, providers: 3 };
    },
    { timeout: 30000 },
  );
}
