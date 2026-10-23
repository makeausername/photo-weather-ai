import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSeedData } from "../packages/db/src/seed-data.js";
import { getPrismaClient, disconnectPrismaClient } from "../packages/db/src/client.js";
import { createOrUpdateAdmin } from "../packages/db/src/create-admin.js";
import type { DatabaseClient, JsonObject } from "../packages/db/src/types.js";
import { assertFreeLocalDatabaseUrl, localDirectory } from "./free-local-db.mjs";

async function main() {
  assertFreeLocalDatabaseUrl(process.env.DATABASE_URL ?? "");
  const db = await getPrismaClient();
  const seed = buildSeedData();
  const allowedSettings = ["site.name", "site.baseUrl", "locale.defaultLanguage", "locale.defaultTimezone"];
  for (const setting of seed.systemSettings.filter((s) => allowedSettings.includes(s.key))) {
    if (typeof setting.valueJson !== "string") throw new Error(`网站设置 ${setting.key} 必须是文本。`);
    await db.systemSetting.upsert({ where: { key: setting.key }, create: { ...setting, valueJson: setting.key === "site.baseUrl" ? "http://127.0.0.1:3100" : setting.valueJson }, update: {} });
  }
  for (const provider of seed.providerConfigs.filter((p) => (p.providerType === "weather" && ["qweather", "open_meteo"].includes(p.providerCode)) || (p.providerType === "geo" && p.providerCode === "amap"))) {
    const openMeteo = provider.providerCode === "open_meteo";
    await db.providerConfig.upsert({
      where: { providerType_providerCode: { providerType: provider.providerType, providerCode: provider.providerCode } },
      create: { ...provider, enabled: openMeteo, secretJson: {}, maskedSecretJson: {}, configJson: { ...(provider.configJson as JsonObject), realCallEnabled: true, ...(openMeteo ? { mode: "free", modelList: "best_match,gfs_seamless", modelListLimit: 2 } : {}) } },
      update: {},
    });
  }
  const credentialsPath = path.join(localDirectory, "admin-login.json");
  if (!existsSync(credentialsPath)) {
    writeFileSync(credentialsPath, JSON.stringify({ url: "http://127.0.0.1:3100/admin/login", email: "admin@local.test", password: `Local!7aA-${randomBytes(18).toString("base64url")}` }, null, 2), { flag: "wx", mode: 0o600 });
  }
  const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")) as { email: string; password: string };
  const existing = await db.user.findUnique({ where: { email: credentials.email } });
  if (!existing) {
    await createOrUpdateAdmin({ email: credentials.email, password: credentials.password, displayName: "本地管理员", client: db as unknown as DatabaseClient });
  }
  console.log("免费版基础配置已初始化：4 项网站设置、3 个服务商、1 个管理员；不创建套餐、订单或示例地点。已有配置与密码不覆盖。");
}
main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; }).finally(disconnectPrismaClient);
