import type { FastifyInstance } from "fastify";
import { getSystemSetting, type DatabaseClient } from "@photo-weather/db";
import { defaultPublicSiteConfig, validatePublicSiteSetting, type PublicSiteConfig } from "@photo-weather/shared";

export async function readPublicSiteConfig(client?: DatabaseClient): Promise<PublicSiteConfig> {
  const result = { ...defaultPublicSiteConfig };
  if (!client) return result;
  for (const [key, field] of Object.entries({ "site.name": "name", "site.baseUrl": "baseUrl", "locale.defaultLanguage": "language", "locale.defaultTimezone": "timezone" }) as [string, keyof PublicSiteConfig][]) {
    const setting = await getSystemSetting(key, { client });
    if (!setting || setting.isSecret) continue;
    try {
      validatePublicSiteSetting(key, setting.valueJson);
      result[field] = (setting.valueJson as string).trim();
    } catch { /* Invalid legacy values do not break the public page. */ }
  }
  return result;
}

export function registerPublicSiteRoutes(app: FastifyInstance, client?: DatabaseClient) {
  app.get("/site/config", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return readPublicSiteConfig(client);
  });
}
