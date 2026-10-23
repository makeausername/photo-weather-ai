import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";
let app: FastifyInstance;
afterEach(async () => { await app?.close(); });
describe("saved public configuration", () => {
  it("publishes only four safe values and reflects authenticated saves without restart", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });
    for (const [key, value] of [["site.name", "联调天气"], ["site.baseUrl", "https://weather.example.test"], ["locale.defaultTimezone", "Asia/Tokyo"]]) {
      expect((await app.inject({ method: "PATCH", url: `/admin/settings/${key}`, headers: adminAuthorizationHeader(), payload: { valueJson: value } })).statusCode).toBe(200);
    }
    const response = await app.inject({ method: "GET", url: "/site/config" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ name: "联调天气", baseUrl: "https://weather.example.test", language: "zh-CN", timezone: "Asia/Tokyo" });
  });
  it("rejects invalid timezones, unsupported translations and unsafe website URLs before saving", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });
    for (const [key, value] of [["locale.defaultTimezone", "not-a-zone"], ["locale.defaultLanguage", "en-US"], ["site.baseUrl", "javascript:alert(1)"], ["site.name", ""]]) {
      expect((await app.inject({ method: "PATCH", url: `/admin/settings/${key}`, headers: adminAuthorizationHeader(), payload: { valueJson: value } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "GET", url: "/site/config" })).json().timezone).toBe("Asia/Shanghai");
  });
});
