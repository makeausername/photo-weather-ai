import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAdminSession,
  getStoredAdminTokens,
  storeAdminSession,
  type AdminAuthSession,
} from "./admin/admin-api";
import { optionalAuthApiFetch, requiredAuthApiFetch } from "../components/api-client";

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

function installBrowserWindow() {
  const localStorage = createLocalStorageMock();
  vi.stubGlobal("window", {
    localStorage,
    location: {
      pathname: "/forecast",
      search: "",
      href: "/forecast",
    },
  });
  return { localStorage };
}

function createSession(overrides: Partial<AdminAuthSession> = {}): AdminAuthSession {
  return {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    sessionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    sessionRoleType: "user",
    sessionTtlDays: 7,
    user: {
      id: "user-1",
      email: "user@example.com",
      phone: null,
      displayName: "User",
      status: "active",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      lastLoginAt: null,
    },
    profile: null,
    roles: ["user"],
    roleCodes: ["user"],
    permissions: [],
    isAdmin: false,
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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

describe("shared API client session refresh", () => {
  afterEach(() => {
    clearAdminSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares one refresh across concurrent required API 401 responses", async () => {
    installBrowserWindow();
    storeAdminSession(
      createSession({
        accessToken: "old-access",
        refreshToken: "old-refresh",
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
        requestUrl === "http://localhost:4000/account/access" ||
        requestUrl === "http://localhost:4000/billing/orders"
      ) {
        return readAuthorization(init as RequestInit) === "Bearer new-access"
          ? jsonResponse({ ok: requestUrl })
          : jsonResponse({ error: "token_expired", message: "expired" }, 401);
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    const first = requiredAuthApiFetch("/account/access");
    const second = requiredAuthApiFetch("/billing/orders");
    await flushPromises();
    refreshDeferred.resolve(
      jsonResponse(
        createSession({
          accessToken: "new-access",
          refreshToken: "new-refresh",
        }),
      ),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: "http://localhost:4000/account/access" },
      { ok: "http://localhost:4000/billing/orders" },
    ]);
    expect(refreshCalls).toBe(1);
    expect(getStoredAdminTokens()).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
  });

  it("lets optional public requests continue as guests after a true refresh failure", async () => {
    installBrowserWindow();
    storeAdminSession(
      createSession({
        accessToken: "stale-access",
        refreshToken: "stale-refresh",
      }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const requestUrl = String(url);
      if (requestUrl === "http://localhost:4000/auth/refresh") {
        return jsonResponse({ error: "invalid_refresh_token", message: "invalid" }, 401);
      }
      if (requestUrl === "http://localhost:4000/forecast/calculate") {
        return readAuthorization(init as RequestInit)
          ? jsonResponse({ error: "token_expired", message: "expired" }, 401)
          : jsonResponse({ summary: "guest 24h result" });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    });

    await expect(
      optionalAuthApiFetch("/forecast/calculate", {
        method: "POST",
        body: JSON.stringify({ horizon: "24h", target: "general" }),
      }),
    ).resolves.toEqual({ summary: "guest 24h result" });

    expect(getStoredAdminTokens()).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:4000/forecast/calculate",
      "http://localhost:4000/auth/refresh",
      "http://localhost:4000/forecast/calculate",
    ]);
  });
});
