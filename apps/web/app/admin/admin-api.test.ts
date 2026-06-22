import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidCredentialsMessage,
  loginServiceUnavailableMessage,
} from "../../components/auth-errors";
import {
  adminApiFetch,
  adminSessionExpiredMessage,
  createProviderConnectionTestRequestInit,
  prefetchCdnUrls,
  refreshCdnCache,
  loginAdmin,
} from "./admin-api";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("admin API request helpers", () => {
  it("sends an empty JSON object for provider connection tests", () => {
    const init = createProviderConnectionTestRequestInit();

    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({}));
  });

  it("shows invalid credentials without exposing response internals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: "invalid_credentials", message: invalidCredentialsMessage }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(loginAdmin("admin@example.com", "wrong-password")).rejects.toThrow(
      invalidCredentialsMessage,
    );
  });

  it("shows provider test admin 401 as an expired backend login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "admin_unauthorized",
          message: adminSessionExpiredMessage,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      adminApiFetch("/admin/providers/weather/meteoblue/test-connection", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    ).rejects.toThrow(adminSessionExpiredMessage);
  });

  it("calls CDN operation endpoints with typed payloads", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            providerCode: "aliyun_cdn",
            providerNameZh: "阿里云 CDN",
            mode: "mock",
            acceptedCount: 1,
            rejectedCount: 0,
            messageZh: "ok",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await refreshCdnCache({
      providerCode: "aliyun_cdn",
      urls: ["https://cdn.example.com/app.js"],
      refreshType: "file",
    });
    await prefetchCdnUrls({
      providerCode: "aliyun_cdn",
      urls: ["https://cdn.example.com/app.js"],
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/admin/cdn/refresh");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:4000/admin/cdn/prefetch");
  });

  it("sanitizes raw database failures during admin login", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        "Invalid `prisma.user.findUnique()` invocation: Authentication failed against database server at `postgres`.\n    at login (auth-routes.ts:1:1)",
        { status: 503 },
      ),
    );

    await expect(loginAdmin("admin@example.com", "CorrectHorseBattery99")).rejects.toThrow(
      loginServiceUnavailableMessage,
    );
  });
});
