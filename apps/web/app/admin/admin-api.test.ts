import { afterEach, describe, expect, it, vi } from "vitest";
import {
  invalidCredentialsMessage,
  loginServiceUnavailableMessage,
} from "../../components/auth-errors";
import {
  adminApiFetch,
  adminSessionExpiredMessage,
  clearAdminSession,
  createProviderConnectionTestRequestInit,
  getStoredAdminTokens,
  prefetchCdnUrls,
  refreshCdnCache,
  loginAdmin,
  storeAdminSession,
} from "./admin-api";
import { requiredAuthApiFetch } from "../../components/api-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function installBrowserWindow(pathname = "/admin/settings", search = "") {
  const localStorage = createLocalStorageMock();
  const location = {
    pathname,
    search,
    href: `${pathname}${search}`,
  };
  vi.stubGlobal("window", {
    localStorage,
    location,
  });

  return { localStorage, location };
}

function createAdminSession(overrides: Partial<Parameters<typeof storeAdminSession>[0]> = {}) {
  return {
    accessToken: "admin-access-token",
    refreshToken: "admin-refresh-token",
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    user: {
      id: "admin-user",
      email: "admin@example.com",
      phone: null,
      displayName: "Admin",
      status: "active",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      lastLoginAt: null,
    },
    profile: null,
    roles: ["admin"],
    roleCodes: ["admin"],
    permissions: ["admin.manage"],
    isAdmin: true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function readAuthorization(init: RequestInit | undefined): string | undefined {
  const headers = init?.headers;
  if (!headers || Array.isArray(headers)) {
    return undefined;
  }
  if (headers instanceof Headers) {
    return headers.get("Authorization") ?? undefined;
  }
  return (headers as Record<string, string | undefined>).Authorization;
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("admin API request helpers", () => {
  it("sends an empty JSON object for provider connection tests", () => {
    const init = createProviderConnectionTestRequestInit();

    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({}));
  });

  it("stores and clears admin session expiration metadata", () => {
    const { localStorage } = installBrowserWindow();
    const sessionExpiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const accessTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    storeAdminSession(createAdminSession({ sessionExpiresAt, accessTokenExpiresAt }));

    expect(getStoredAdminTokens()).toEqual({
      accessToken: "admin-access-token",
      refreshToken: "admin-refresh-token",
    });
    expect(localStorage.getItem("photo_weather_admin_session_expires_at")).toBe(sessionExpiresAt);
    expect(localStorage.getItem("photo_weather_admin_access_token_expires_at")).toBe(
      accessTokenExpiresAt,
    );

    clearAdminSession();
    expect(getStoredAdminTokens()).toBeNull();
    expect(localStorage.getItem("photo_weather_admin_session_expires_at")).toBeNull();
  });

  it("keeps old stored sessions without sessionExpiresAt server-validated", () => {
    installBrowserWindow();
    storeAdminSession(
      createAdminSession({
        accessTokenExpiresAt: undefined,
        sessionExpiresAt: undefined,
      }),
    );

    expect(getStoredAdminTokens()).toEqual({
      accessToken: "admin-access-token",
      refreshToken: "admin-refresh-token",
    });
  });

  it("keeps malformed sessionExpiresAt server-validated when tokens exist", () => {
    installBrowserWindow();
    storeAdminSession(
      createAdminSession({
        sessionExpiresAt: "not-a-date",
      }),
    );

    expect(getStoredAdminTokens()).toEqual({
      accessToken: "admin-access-token",
      refreshToken: "admin-refresh-token",
    });
  });

  it("clears expired stored admin sessions", () => {
    installBrowserWindow();
    storeAdminSession(
      createAdminSession({
        sessionExpiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    );

    expect(getStoredAdminTokens()).toBeNull();
  });

  it("proactively refreshes near-expiring access tokens before admin requests", async () => {
    installBrowserWindow();
    storeAdminSession(
      createAdminSession({
        accessToken: "old-admin-access",
        refreshToken: "old-admin-refresh",
        accessTokenExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      }),
    );
    const refreshedSession = createAdminSession({
      accessToken: "new-admin-access",
      refreshToken: "new-admin-refresh",
      accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(refreshedSession))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(adminApiFetch("/admin/settings")).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:4000/auth/refresh");
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      refreshToken: "old-admin-refresh",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://localhost:4000/admin/settings");
    expect(readAuthorization(fetchMock.mock.calls[1]?.[1] as RequestInit)).toBe(
      "Bearer new-admin-access",
    );
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

  it("clears stored admin tokens and redirects when refresh is expired", async () => {
    const { location } = installBrowserWindow("/admin/providers", "?tab=weather");
    storeAdminSession(createAdminSession());
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "token_expired", message: "expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_refresh_token", message: "invalid" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(adminApiFetch("/admin/settings")).rejects.toThrow(adminSessionExpiredMessage);

    expect(getStoredAdminTokens()).toBeNull();
    expect(location.href).toBe("/admin/login?returnTo=%2Fadmin%2Fproviders%3Ftab%3Dweather");
  });

  it("shares one admin refresh across concurrent 401 responses and retries all callers", async () => {
    installBrowserWindow();
    storeAdminSession(
      createAdminSession({
        accessToken: "old-admin-access",
        refreshToken: "old-admin-refresh",
      }),
    );
    const refreshDeferred = createDeferred<Response>();
    let refreshCalls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl === "http://localhost:4000/auth/refresh") {
        refreshCalls += 1;
        return refreshDeferred.promise;
      }
      if (requestUrl.startsWith("http://localhost:4000/admin/")) {
        return readAuthorization(init as RequestInit) === "Bearer new-admin-access"
          ? jsonResponse({ path: requestUrl })
          : jsonResponse({ error: "token_expired", message: "expired" }, 401);
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    const first = adminApiFetch("/admin/settings");
    const second = adminApiFetch("/admin/users?pageSize=1");
    await flushPromises();
    refreshDeferred.resolve(
      jsonResponse(
        createAdminSession({
          accessToken: "new-admin-access",
          refreshToken: "new-admin-refresh",
        }),
      ),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { path: "http://localhost:4000/admin/settings" },
      { path: "http://localhost:4000/admin/users?pageSize=1" },
    ]);
    expect(refreshCalls).toBe(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh")),
    ).toHaveLength(1);
    expect(getStoredAdminTokens()).toEqual({
      accessToken: "new-admin-access",
      refreshToken: "new-admin-refresh",
    });
  });

  it("shares one refresh between adminApiFetch and the public API client", async () => {
    installBrowserWindow();
    storeAdminSession(
      createAdminSession({
        accessToken: "old-shared-access",
        refreshToken: "old-shared-refresh",
      }),
    );
    const refreshDeferred = createDeferred<Response>();
    let refreshCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl === "http://localhost:4000/auth/refresh") {
        refreshCalls += 1;
        return refreshDeferred.promise;
      }
      if (
        requestUrl === "http://localhost:4000/admin/settings" ||
        requestUrl === "http://localhost:4000/account/access"
      ) {
        return readAuthorization(init as RequestInit) === "Bearer shared-new-access"
          ? jsonResponse({ ok: requestUrl })
          : jsonResponse({ error: "token_expired", message: "expired" }, 401);
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    const adminRequest = adminApiFetch("/admin/settings");
    const accountRequest = requiredAuthApiFetch("/account/access");
    await flushPromises();
    refreshDeferred.resolve(
      jsonResponse(
        createAdminSession({
          accessToken: "shared-new-access",
          refreshToken: "shared-new-refresh",
        }),
      ),
    );

    await expect(Promise.all([adminRequest, accountRequest])).resolves.toEqual([
      { ok: "http://localhost:4000/admin/settings" },
      { ok: "http://localhost:4000/account/access" },
    ]);
    expect(refreshCalls).toBe(1);
  });

  it("does not clear or redirect when a stale refresh fails after newer tokens are stored", async () => {
    const { location } = installBrowserWindow("/admin/settings", "");
    storeAdminSession(
      createAdminSession({
        accessToken: "old-race-access",
        refreshToken: "old-race-refresh",
      }),
    );
    const refreshDeferred = createDeferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl === "http://localhost:4000/auth/refresh") {
        return refreshDeferred.promise;
      }
      if (requestUrl === "http://localhost:4000/admin/settings") {
        return readAuthorization(init as RequestInit) === "Bearer race-new-access"
          ? jsonResponse({ ok: true })
          : jsonResponse({ error: "token_expired", message: "expired" }, 401);
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    const request = adminApiFetch("/admin/settings");
    await flushPromises();
    storeAdminSession(
      createAdminSession({
        accessToken: "race-new-access",
        refreshToken: "race-new-refresh",
      }),
    );
    refreshDeferred.resolve(
      jsonResponse({ error: "invalid_refresh_token", message: "invalid" }, 401),
    );

    await expect(request).resolves.toEqual({ ok: true });
    expect(getStoredAdminTokens()).toEqual({
      accessToken: "race-new-access",
      refreshToken: "race-new-refresh",
    });
    expect(location.href).toBe("/admin/settings");
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
