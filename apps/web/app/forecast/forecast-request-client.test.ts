import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForecastCalculationResult, ForecastQueryInput } from "@photo-weather/shared";
import { clearAdminSession, storeAdminSession, type AdminAuthSession } from "../admin/admin-api";
import type { ForecastRequestError } from "./forecast-request-client";
import {
  clearForecastRequestClientCachesForTest,
  forecastCalculationTransientFailureMessage,
  isForecastRequestAbortError,
  requestForecastCalculation,
  stableForecastQueryKey,
} from "./forecast-request-client";

const baseQuery: ForecastQueryInput = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "general",
  timezone: "Asia/Shanghai",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
};

function resultForTarget(target: ForecastQueryInput["target"]): ForecastCalculationResult {
  return {
    target,
    generatedAt: "2026-05-20T00:00:00+08:00",
    summary: `${target} result`,
    ...(target === "general"
      ? {
          professionalHourlyData: [{ time: "2026-05-20T01:00:00+08:00" }],
          professionalHourlyDataTimeBasis: {
            startTime: "2026-05-20T01:00:00+08:00",
            endTime: "2026-05-20T02:00:00+08:00",
            stepMinutes: 60,
            timezone: "Asia/Shanghai",
          },
        }
      : {}),
  } as unknown as ForecastCalculationResult;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

type StorageMock = Storage & {
  readonly dumpKeys: () => readonly string[];
};

function createStorageMock(): StorageMock {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
    dumpKeys: () => Array.from(values.keys()),
  };
}

function installBrowserStorage(): {
  readonly localStorage: StorageMock;
  readonly sessionStorage: StorageMock;
} {
  const localStorage = createStorageMock();
  const sessionStorage = createStorageMock();
  vi.stubGlobal("window", {
    localStorage,
    sessionStorage,
    location: {
      pathname: "/forecast",
      search: "",
      href: "",
      assign: vi.fn(),
    },
  });
  return { localStorage, sessionStorage };
}

function adminSession(accessToken = "paid-access-token"): AdminAuthSession {
  return {
    accessToken,
    refreshToken: "refresh-token",
    accessTokenExpiresAt: "2099-01-01T00:00:00.000Z",
    sessionExpiresAt: "2099-01-02T00:00:00.000Z",
    sessionRoleType: "user",
    user: {
      id: "user-paid",
      email: "paid@example.com",
      phone: null,
      displayName: "Paid User",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
    },
    profile: null,
    roles: [],
    roleCodes: [],
    permissions: [],
    isAdmin: false,
  };
}

describe("forecast request client", () => {
  afterEach(() => {
    clearAdminSession();
    clearForecastRequestClientCachesForTest();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("retries a transient forecast calculate failure and returns the recovered result", async () => {
    const recovered = resultForTarget("general");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "temporary" }, 503))
      .mockResolvedValueOnce(jsonResponse(recovered));

    await expect(
      requestForecastCalculation(baseQuery, {
        fetcher: fetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        useSessionStorage: false,
      }),
    ).resolves.toEqual(recovered);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("dedupes identical queries even when object identity changes", async () => {
    const recovered = resultForTarget("cloud_sea");
    let resolveFetch!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const queryA = { ...baseQuery, target: "cloud_sea" as const };
    const queryB = { ...queryA };

    expect(stableForecastQueryKey(queryA)).toBe(stableForecastQueryKey(queryB));
    const first = requestForecastCalculation(queryA, {
      fetcher: fetcher as unknown as typeof fetch,
      retryDelayMs: [0, 0],
      useSessionStorage: false,
    });
    const second = requestForecastCalculation(queryB, {
      fetcher: fetcher as unknown as typeof fetch,
      retryDelayMs: [0, 0],
      useSessionStorage: false,
    });
    resolveFetch(jsonResponse(recovered));

    await expect(Promise.all([first, second])).resolves.toEqual([recovered, recovered]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry deterministic validation errors", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: "invalid_wgs84_coordinates",
          message: "当前地点缺少有效 WGS84 坐标。",
        },
        400,
      ),
    );

    await expect(
      requestForecastCalculation(baseQuery, {
        fetcher: fetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        useSessionStorage: false,
      }),
    ).rejects.toMatchObject({
      status: 400,
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats stale aborts as aborts instead of transient terminal errors", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();

    let thrown: unknown;
    try {
      await requestForecastCalculation(baseQuery, {
        fetcher: fetcher as unknown as typeof fetch,
        signal: controller.signal,
        retryDelayMs: [0, 0],
        useSessionStorage: false,
      });
    } catch (error) {
      thrown = error;
    }

    expect(isForecastRequestAbortError(thrown)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a clean public error after retry exhaustion", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: "astro_service_timeout",
          message: "AbortError: stack at C:\\server\\internal.ts provider cache key",
        },
        503,
      ),
    );

    await expect(
      requestForecastCalculation(baseQuery, {
        fetcher: fetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        useSessionStorage: false,
      }),
    ).rejects.toMatchObject({
      message: forecastCalculationTransientFailureMessage,
      publicMessage: forecastCalculationTransientFailureMessage,
      transient: true,
    } satisfies Partial<ForecastRequestError>);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("serves the last successful same-key result when later transient retries fail", async () => {
    const query = { ...baseQuery, horizon: "24h", target: "general" } as const;
    const recovered = resultForTarget("general");
    const failingFetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ error: "temporary" }, 503)));

    await expect(
      requestForecastCalculation(query, {
        fetcher: vi.fn().mockResolvedValue(jsonResponse(recovered)) as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        successCacheTtlMs: -1,
        staleCacheTtlMs: 60_000,
        useSessionStorage: false,
      }),
    ).resolves.toEqual(recovered);

    await expect(
      requestForecastCalculation(query, {
        fetcher: failingFetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        successCacheTtlMs: -1,
        staleCacheTtlMs: 60_000,
        useSessionStorage: false,
      }),
    ).resolves.toMatchObject({
      ...recovered,
      weatherDataFreshness: "stale",
      weatherEvidenceStatus: "stale",
      weatherEvidenceReasonZh: expect.stringContaining("旧缓存"),
    });
    expect(failingFetcher).toHaveBeenCalledTimes(3);
  });

  it.each(["general", "cloud_sea", "glow", "astro"] as const)(
    "uses the shared request path for %s",
    async (target) => {
      const recovered = resultForTarget(target);
      const fetcher = vi.fn().mockResolvedValue(jsonResponse(recovered));

      await expect(
        requestForecastCalculation(
          { ...baseQuery, target },
          {
            fetcher: fetcher as unknown as typeof fetch,
            retryDelayMs: [0, 0],
            useSessionStorage: false,
          },
        ),
      ).resolves.toEqual(recovered);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("allows guest 24h forecast requests without Authorization", async () => {
    installBrowserStorage();
    const recovered = resultForTarget("general");
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(recovered));

    await expect(
      requestForecastCalculation(
        { ...baseQuery, horizon: "24h", target: "general" },
        {
          fetcher: fetcher as unknown as typeof fetch,
          retryDelayMs: [0, 0],
          useSessionStorage: false,
        },
      ),
    ).resolves.toEqual(recovered);

    const init = fetcher.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init?.headers).not.toHaveProperty("Authorization");
  });

  it("sends Authorization for logged-in forecast calculations", async () => {
    installBrowserStorage();
    storeAdminSession(adminSession("forecast-access-token"));
    const recovered = resultForTarget("general");
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(recovered));

    await expect(
      requestForecastCalculation(
        { ...baseQuery, horizon: "7d", target: "general" },
        {
          fetcher: fetcher as unknown as typeof fetch,
          retryDelayMs: [0, 0],
          useSessionStorage: false,
        },
      ),
    ).resolves.toEqual(recovered);

    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4000/forecast/calculate",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer forecast-access-token",
        }),
      }),
    );
  });

  it("keeps guest forecast cache separate from logged-in full-access cache", async () => {
    const { sessionStorage } = installBrowserStorage();
    storeAdminSession(adminSession("full-access-token"));
    const loggedInResult = {
      ...resultForTarget("general"),
      summary: "logged-in full result",
    } as ForecastCalculationResult;
    const guestResult = {
      ...resultForTarget("general"),
      summary: "guest basic result",
    } as ForecastCalculationResult;
    const loggedInFetcher = vi.fn().mockResolvedValue(jsonResponse(loggedInResult));
    const guestFetcher = vi.fn().mockResolvedValue(jsonResponse(guestResult));
    const query = { ...baseQuery, horizon: "24h", target: "general" } as const;

    await expect(
      requestForecastCalculation(query, {
        fetcher: loggedInFetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        successCacheTtlMs: 60_000,
        staleCacheTtlMs: 60_000,
      }),
    ).resolves.toEqual(loggedInResult);

    clearAdminSession();

    await expect(
      requestForecastCalculation(query, {
        fetcher: guestFetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        successCacheTtlMs: 60_000,
        staleCacheTtlMs: 60_000,
      }),
    ).resolves.toEqual(guestResult);

    expect(loggedInFetcher).toHaveBeenCalledTimes(1);
    expect(guestFetcher).toHaveBeenCalledTimes(1);
    expect(sessionStorage.dumpKeys().join(" ")).not.toContain("full-access-token");
  });

  it("ignores the previous cache schema after an hourly result rollout", async () => {
    const { sessionStorage } = installBrowserStorage();
    const query = { ...baseQuery, horizon: "24h", target: "general" } as const;
    const previousResult = {
      ...resultForTarget("general"),
      summary: "previous cached result",
    };
    const currentResult = {
      ...resultForTarget("general"),
      summary: "current result",
    };
    const seedFetcher = vi.fn().mockResolvedValue(jsonResponse(previousResult));

    await requestForecastCalculation(query, {
      fetcher: seedFetcher as unknown as typeof fetch,
      retryDelayMs: [0, 0],
      successCacheTtlMs: 60_000,
      staleCacheTtlMs: 60_000,
    });

    const currentKey = sessionStorage
      .dumpKeys()
      .find((key) => key.startsWith("photo_weather_forecast_calculation:v2:"));
    expect(currentKey).toBeDefined();
    const currentRecord = sessionStorage.getItem(currentKey!);
    expect(currentRecord).not.toBeNull();
    sessionStorage.removeItem(currentKey!);
    sessionStorage.setItem(
      currentKey!.replace(":v2:", ":v1:"),
      currentRecord!.replace('"version":2', '"version":1'),
    );
    clearForecastRequestClientCachesForTest();

    const fetcher = vi.fn().mockResolvedValue(jsonResponse(currentResult));
    await expect(
      requestForecastCalculation(query, {
        fetcher: fetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        successCacheTtlMs: 60_000,
        staleCacheTtlMs: 60_000,
      }),
    ).resolves.toEqual(currentResult);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retain general forecast results that cannot render hourly data", async () => {
    installBrowserStorage();
    const query = { ...baseQuery, horizon: "24h", target: "general" } as const;
    const incompleteResult = {
      ...resultForTarget("general"),
      professionalHourlyData: undefined,
      professionalHourlyDataTimeBasis: undefined,
    } as ForecastCalculationResult;

    await requestForecastCalculation(query, {
      fetcher: vi.fn().mockResolvedValue(jsonResponse(incompleteResult)) as unknown as typeof fetch,
      retryDelayMs: [0, 0],
      successCacheTtlMs: 60_000,
      staleCacheTtlMs: 60_000,
    });
    clearForecastRequestClientCachesForTest();

    const currentResult = resultForTarget("general");
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(currentResult));
    await expect(
      requestForecastCalculation(query, {
        fetcher: fetcher as unknown as typeof fetch,
        retryDelayMs: [0, 0],
        successCacheTtlMs: 60_000,
        staleCacheTtlMs: 60_000,
      }),
    ).resolves.toEqual(currentResult);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
