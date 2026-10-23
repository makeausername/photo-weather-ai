import { describe, expect, it, vi } from "vitest";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";
import { buildApiServer } from "../server.js";

describe("free public edition", () => {
  it("closes registration, billing, and retired provider calls before side effects", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("unexpected external request");
    });
    const app = buildApiServer({
      logger: false,
      authConfig: testAuthConfig,
      paymentFetcher: fetcher,
      env: { NODE_ENV: "test" },
    });
    try {
      for (const url of [
        "/auth/register",
        "/auth/register/send-code",
        "/auth/login/sms/send-code",
        "/billing/orders",
        "/billing/alipay/page-pay",
        "/account/forecast-history",
        "/admin/providers/weather/meteoblue/test-connection",
        "/admin/providers/map/amap/test-connection",
      ]) {
        const reply = await app.inject({ method: "POST", url, payload: {} });
        expect(reply.statusCode, url).toBe(410);
      }
      expect(fetcher).not.toHaveBeenCalled();
      const admin = await app.inject({ method: "GET", url: "/admin/providers" });
      expect([401, 403]).toContain(admin.statusCode);
    } finally {
      await app.close();
    }
  });
});

describe("retained Amap configuration test", () => {
  it("allows the original geo/amap test only after administrator authentication", async () => {
    const { client } = await createFakeDatabaseClient();
    const app = buildApiServer({
      logger: false,
      dbClient: client,
      authConfig: testAuthConfig,
      env: { NODE_ENV: "test" },
    });
    try {
      const url = "/admin/providers/geo/amap/test-connection";
      expect((await app.inject({ method: "POST", url, payload: {} })).statusCode).toBe(401);
      const response = await app.inject({
        method: "POST",
        url,
        headers: adminAuthorizationHeader(),
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ success: true, mode: "mock" });
    } finally {
      await app.close();
    }
  });
});
