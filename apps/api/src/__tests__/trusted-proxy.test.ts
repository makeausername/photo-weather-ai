import { describe, expect, it } from "vitest";
import { resolveTrustedProxy } from "../trusted-proxy.js";
import { buildApiServer } from "../server.js";
import { MockGeoProvider } from "@photo-weather/geo";
import { testAuthConfig } from "./fake-db.js";

describe("trusted proxy boundary", () => {
  it("defaults to direct client addresses and rejects unrestricted production trust", () => {
    expect(resolveTrustedProxy({})).toBe(false);
    expect(() =>
      resolveTrustedProxy({ NODE_ENV: "production", API_TRUST_PROXY: "true" }),
    ).toThrow();
    expect(() => resolveTrustedProxy({ API_TRUSTED_PROXIES: "0.0.0.0/0" })).toThrow();
    expect(() => resolveTrustedProxy({ API_TRUSTED_PROXIES: "bad/32" })).toThrow();
  });
  it("ignores forged forwarded addresses outside Caddy and separates verified visitors", async () => {
    const app = buildApiServer({
      authConfig: testAuthConfig,
      logger: false,
      geoProvider: new MockGeoProvider(),
      env: {
        ...process.env,
        API_TRUSTED_PROXIES: "172.30.80.2/32",
        API_RATE_LIMIT_MAX: "1",
        API_RATE_LIMIT_ENABLED: "true",
        ENABLE_ASTRO_SERVICE: "false",
      },
    });
    const url = "/search/reverse-geocode?lat=31.2304&lng=121.4737";
    try {
      const first = await app.inject({
        url,
        remoteAddress: "198.51.100.1",
        headers: { "x-forwarded-for": "203.0.113.1" },
      });
      const forged = await app.inject({
        url,
        remoteAddress: "198.51.100.1",
        headers: { "x-forwarded-for": "203.0.113.2" },
      });
      expect(first.statusCode).toBe(200);
      expect(forged.statusCode).toBe(429);
      const a = await app.inject({
        url,
        remoteAddress: "172.30.80.2",
        headers: { "x-forwarded-for": "203.0.113.3" },
      });
      const b = await app.inject({
        url,
        remoteAddress: "172.30.80.2",
        headers: { "x-forwarded-for": "203.0.113.4" },
      });
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      expect(a.headers["cache-control"]).toBe("no-store");
      const login = await app.inject({ method: "POST", url: "/auth/login", payload: {} });
      expect(login.headers["cache-control"]).toBe("no-store");
    } finally {
      await app.close();
    }
  });
});
