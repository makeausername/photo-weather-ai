import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForecastCalculationResult, ForecastQueryInput } from "@photo-weather/shared";
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

describe("forecast request client", () => {
  afterEach(() => {
    clearForecastRequestClientCachesForTest();
    vi.restoreAllMocks();
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
    const recovered = resultForTarget("glow");
    const failingFetcher = vi.fn().mockResolvedValue(jsonResponse({ error: "temporary" }, 503));

    await expect(
      requestForecastCalculation(
        { ...baseQuery, target: "glow" },
        {
          fetcher: vi.fn().mockResolvedValue(jsonResponse(recovered)) as unknown as typeof fetch,
          retryDelayMs: [0, 0],
          successCacheTtlMs: -1,
          staleCacheTtlMs: 60_000,
          useSessionStorage: false,
        },
      ),
    ).resolves.toEqual(recovered);

    await expect(
      requestForecastCalculation(
        { ...baseQuery, target: "glow" },
        {
          fetcher: failingFetcher as unknown as typeof fetch,
          retryDelayMs: [0, 0],
          successCacheTtlMs: -1,
          staleCacheTtlMs: 60_000,
          useSessionStorage: false,
        },
      ),
    ).resolves.toEqual(recovered);
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
});
