import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AstroServiceClient,
  AstroServiceClientError,
  astroServiceTimeoutMessage,
  astroServiceInvalidResponseMessage,
  astroServiceUrlMissingMessage,
  astroServiceUnavailableMessage,
  checkAstroServiceHealth,
  isAstroServiceEnabled,
  resolveAstroServiceConfig,
  resolveAstroServiceTimeoutMs,
  mapAstroServiceResponseToForecastData,
  type AstroServiceCalculationResponse,
} from "../astro-service-client.js";

const serviceResponse: AstroServiceCalculationResponse = {
  forecastStart: "2026-05-22T00:00:00+08:00",
  forecastEnd: "2026-05-24T00:00:00+08:00",
  targetDates: ["2026-05-22", "2026-05-23"],
  sun: {
    daily: [
      {
        date: "2026-05-22",
        sunrise: "2026-05-22T05:08:00+08:00",
        sunset: "2026-05-22T18:58:00+08:00",
        solarNoon: "2026-05-22T12:03:00+08:00",
        civilDawn: "2026-05-22T04:42:00+08:00",
        civilDusk: "2026-05-22T19:24:00+08:00",
        nauticalDawn: "2026-05-22T04:10:00+08:00",
        nauticalDusk: "2026-05-22T19:57:00+08:00",
        astronomicalDawn: "2026-05-22T03:36:00+08:00",
        astronomicalDusk: "2026-05-22T20:31:00+08:00",
        sunriseAzimuth: 67.2,
        sunsetAzimuth: 292.8,
        sunriseGlowCandidateStart: "2026-05-22T04:38:00+08:00",
        sunriseGlowCandidateEnd: "2026-05-22T05:18:00+08:00",
        sunriseGlowBestStart: "2026-05-22T04:50:00+08:00",
        sunriseGlowBestEnd: "2026-05-22T05:14:00+08:00",
        sunsetGlowCandidateStart: "2026-05-22T18:48:00+08:00",
        sunsetGlowCandidateEnd: "2026-05-22T19:28:00+08:00",
        sunsetGlowBestStart: "2026-05-22T18:52:00+08:00",
        sunsetGlowBestEnd: "2026-05-22T19:16:00+08:00",
      },
      {
        date: "2026-05-23",
        sunrise: "2026-05-23T05:08:00+08:00",
        sunset: "2026-05-23T18:59:00+08:00",
        solarNoon: "2026-05-23T12:03:00+08:00",
        civilDawn: "2026-05-23T04:42:00+08:00",
        civilDusk: "2026-05-23T19:25:00+08:00",
        nauticalDawn: "2026-05-23T04:10:00+08:00",
        nauticalDusk: "2026-05-23T19:58:00+08:00",
        astronomicalDawn: "2026-05-23T03:35:00+08:00",
        astronomicalDusk: "2026-05-23T20:32:00+08:00",
        sunriseAzimuth: 67.1,
        sunsetAzimuth: 292.9,
      },
    ],
  },
  moon: {
    daily: [
      {
        date: "2026-05-22",
        moonPhaseValue: 0.26,
        moonPhaseNameZh: "盈凸月",
        moonIllumination: 0.36,
        waxingOrWaning: "waxing",
        moonrise: "2026-05-22T10:42:00+08:00",
        moonset: "2026-05-23T00:28:00+08:00",
        moonAltitudeByHour: [
          { time: "2026-05-22T20:00:00+08:00", altitude: 32, azimuth: 250 },
          { time: "2026-05-23T01:00:00+08:00", altitude: -7, azimuth: 296 },
        ],
        moonImpactLevel: "medium",
        moonImpactScore: 44,
        moonImpactReasonsZh: ["月亮照明处于 20%-50% 区间，月亮高度会决定干扰强度。"],
      },
      {
        date: "2026-05-23",
        moonPhaseValue: 0.3,
        moonPhaseNameZh: "盈凸月",
        moonIllumination: 0.45,
        waxingOrWaning: "waxing",
        moonrise: "2026-05-23T11:40:00+08:00",
        moonset: "2026-05-24T00:58:00+08:00",
        moonAltitudeByHour: [
          { time: "2026-05-23T20:00:00+08:00", altitude: 36, azimuth: 246 },
          { time: "2026-05-24T01:00:00+08:00", altitude: -1, azimuth: 294 },
        ],
        moonImpactLevel: "medium",
        moonImpactScore: 44,
        moonImpactReasonsZh: ["月亮照明处于 20%-50% 区间，月亮高度会决定干扰强度。"],
      },
    ],
    altitudeByHour: [
      { time: "2026-05-22T20:00:00+08:00", altitude: 32, azimuth: 250 },
      { time: "2026-05-23T01:00:00+08:00", altitude: -7, azimuth: 296 },
      { time: "2026-05-23T20:00:00+08:00", altitude: 36, azimuth: 246 },
      { time: "2026-05-24T01:00:00+08:00", altitude: -1, azimuth: 294 },
    ],
  },
  night: {
    astronomicalNightWindows: [
      {
        date: "2026-05-22",
        start: "2026-05-22T20:31:00+08:00",
        end: "2026-05-23T03:35:00+08:00",
        durationMinutes: 424,
        noteZh: "太阳高度低于 -18°。",
      },
      {
        date: "2026-05-23",
        start: "2026-05-23T20:32:00+08:00",
        end: "2026-05-24T03:35:00+08:00",
        durationMinutes: 423,
        noteZh: "太阳高度低于 -18°。",
      },
    ],
    moonlessNightWindows: [
      {
        date: "2026-05-22",
        start: "2026-05-23T00:28:00+08:00",
        end: "2026-05-23T03:35:00+08:00",
        durationMinutes: 187,
        reasonZh: "月落后进入低月光影响窗口。",
      },
    ],
  },
  milkyWay: {
    candidateWindows: [
      {
        date: "2026-05-22",
        start: "2026-05-22T22:20:00+08:00",
        end: "2026-05-23T03:35:00+08:00",
        bestTime: "2026-05-23T02:10:00+08:00",
        minAltitude: 8,
        maxAltitude: 31,
        bestAzimuth: 142.5,
        directionZh: "东南方",
        confidenceLevel: "high",
        noteZh: "银心高度超过 5° 的可见候选窗口。",
      },
    ],
    recommendedWindows: [
      {
        date: "2026-05-22",
        start: "2026-05-23T00:28:00+08:00",
        end: "2026-05-23T03:35:00+08:00",
        bestTime: "2026-05-23T02:10:00+08:00",
        durationMinutes: 187,
        bestAzimuth: 146,
        directionZh: "东南方",
        moonImpactLevel: "low",
        galacticCenterMaxAltitude: 31,
        reasonZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心有效高度候选窗口内。",
        limitationsZh: ["天气数据仍为演示数据。"],
      },
    ],
    directionSummaryZh: "优先面向东南方观察银心位置。",
    calculationNoteZh: "银心位置由本地天文服务计算。",
  },
  calculationBasis: {
    ephemerisFileName: "de421.bsp",
    coordinateSystem: "WGS84",
    timezone: "Asia/Shanghai",
    elevationMeters: 1800,
    generatedAt: "2026-05-22T00:00:01+08:00",
    computeElapsedMs: 1234.5,
    samplingResolutionMinutes: {
      sunCrossing: 10,
      solarNoon: 10,
      moonAltitude: 60,
      moonlessWindow: 5,
      moonImpact: 15,
      galacticCenter: 10,
      solarAltitudeGlow: 1,
    },
  },
  lightPollution: {
    available: true,
    dataAvailable: true,
    sourceCode: "eog-viirs-annual",
    sourceLabel: "EOG VIIRS annual nighttime lights",
    datasetYear: 2024,
    datasetVersion: "v1",
    checksumShort: "abc123def456",
    localRadiance: 0.42,
    localRadiancePercentile: 28,
    surroundingHaloRadiance: 1.2,
    ambientRiskIndex: 35,
    ambientRiskLevel: "low",
    ambientRiskLevelLabelZh: "低",
    directionalRisk: [
      {
        direction: "southeast",
        directionLabelZh: "东南",
        azimuthDegrees: 135,
        radiance: 2.1,
        riskIndex: 48,
        riskLevel: "medium",
        riskLevelLabelZh: "中",
        sampleCount: 12,
        validSampleCount: 12,
      },
    ],
    targetAzimuthDegrees: 146,
    targetDirectionRisk: 48,
    targetDirectionLevel: "medium",
    targetDirectionLevelLabelZh: "中",
    confidence: "high",
    sampleCount: 113,
    validSampleCount: 106,
    calculationBasis: {
      samplingConfigVersion: "satellite-night-light-v1",
      coordinateSystem: "WGS84",
      distancesKm: [5, 15, 30, 60],
      distanceWeights: { local: 0.45, "5km": 0.22, "15km": 0.16, "30km": 0.11, "60km": 0.06 },
      localNeighborhoodKm: [0, 0.5, 1.5],
      directionSectorsDegrees: 45,
      quantileBasis: "log_radiance_dataset_quantiles",
      scoringMode: "heuristic",
      nonSqmBortleNoticeZh: "该结果为卫星夜光参考，不是现场SQM实测，也不代表测量Bortle等级。",
    },
    lightPollutionNoteZh: "卫星夜光参考：环境光污染低，银河方向光害中。",
  },
};

const calculateInput = {
  latitudeWgs84: 30.1321,
  longitudeWgs84: 118.1691,
  elevationMeters: 1800,
  timezone: "Asia/Shanghai",
  horizon: "24h",
  startDateTime: "2026-05-22T00:00:00+08:00",
} as const;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("AstroServiceClient", () => {
  it("resolves ENABLE_ASTRO_SERVICE and ASTRO_SERVICE_URL from env", () => {
    const config = resolveAstroServiceConfig({
      ENABLE_ASTRO_SERVICE: "true",
      ASTRO_SERVICE_URL: "http://localhost:4100/",
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      enabled: true,
      configuredUrl: "http://localhost:4100/",
      resolvedUrl: "http://127.0.0.1:4100",
      logUrl: "http://127.0.0.1:4100",
      timeoutMs: 45000,
      envLocalLoaded: false,
      envSource: "process.env",
    });
  });

  it("resolves ASTRO_SERVICE_TIMEOUT_MS with environment defaults and invalid fallback", () => {
    expect(
      resolveAstroServiceTimeoutMs({
        NODE_ENV: "development",
        ASTRO_SERVICE_TIMEOUT_MS: "12000",
      } as NodeJS.ProcessEnv),
    ).toBe(12000);
    expect(
      resolveAstroServiceTimeoutMs({
        NODE_ENV: "development",
        ASTRO_SERVICE_TIMEOUT_MS: "bad",
      } as NodeJS.ProcessEnv),
    ).toBe(45000);
    expect(
      resolveAstroServiceTimeoutMs({
        NODE_ENV: "production",
        ASTRO_SERVICE_TIMEOUT_MS: "0",
      } as NodeJS.ProcessEnv),
    ).toBe(30000);
  });

  it("accepts local truthy ENABLE_ASTRO_SERVICE values", () => {
    for (const value of ["true", "TRUE", "1", "yes", "enabled"]) {
      expect(isAstroServiceEnabled(value)).toBe(true);
    }

    expect(isAstroServiceEnabled("false")).toBe(false);
    expect(isAstroServiceEnabled(undefined)).toBe(false);
  });

  it("marks an enabled service without ASTRO_SERVICE_URL as not configured", async () => {
    const config = resolveAstroServiceConfig({
      ENABLE_ASTRO_SERVICE: "yes",
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      enabled: true,
      configuredUrl: null,
      resolvedUrl: "",
      logUrl: "not configured",
    });

    await expect(checkAstroServiceHealth({ config })).resolves.toMatchObject({
      enabled: true,
      url: "not configured",
      timeoutMs: 45000,
      healthOk: false,
      healthStatus: null,
      lastError: astroServiceUrlMissingMessage,
    });
  });

  it("checks astro-service health with safe upstream fields and env source", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            service: "astro-service",
            timezoneAvailable: true,
            defaultTimezone: "Asia/Shanghai",
            ephemerisAvailable: true,
            ephemerisFileName: "de421.bsp",
          }),
        ),
      ),
    );
    const config = resolveAstroServiceConfig({
      ENABLE_ASTRO_SERVICE: "true",
      ASTRO_SERVICE_URL: "http://localhost:4100",
      PHOTO_WEATHER_ENV_LOCAL_LOADED: "true",
    } as NodeJS.ProcessEnv);

    const status = await checkAstroServiceHealth({ config, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(status).toMatchObject({
      enabled: true,
      url: "http://127.0.0.1:4100",
      timeoutMs: 45000,
      healthOk: true,
      healthStatus: 200,
      timezoneAvailable: true,
      defaultTimezone: "Asia/Shanghai",
      ephemerisAvailable: true,
      ephemerisFileName: "de421.bsp",
      envSource: ".env.local",
    });
  });

  it("parses service response and maps it to forecast astro data", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify(serviceResponse))),
    );
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const client = new AstroServiceClient({
      baseUrl: "http://localhost:4100/",
      fetchImpl,
      logger,
    });

    const parsed = await client.calculate({
      latitudeWgs84: 30.1321,
      longitudeWgs84: 118.1691,
      elevationMeters: 1800,
      timezone: "Asia/Shanghai",
      horizon: "48h",
      startDateTime: "2026-05-22T00:00:00+08:00",
    });
    const mapped = mapAstroServiceResponseToForecastData(parsed, [
      {
        date: "2026-05-22",
        dateLabel: "2026年5月22日 星期五",
        lunarDateText: "四月初六",
      },
    ]);

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/astro/calculate",
      expect.objectContaining({ method: "POST" }),
    );
    const firstCall = fetchImpl.mock.calls[0] as
      | [RequestInfo | URL, RequestInit | undefined]
      | undefined;
    const requestBody = JSON.parse(String(firstCall?.[1]?.body));
    expect(requestBody).toMatchObject({
      latitudeWgs84: 30.1321,
      longitudeWgs84: 118.1691,
      elevationMeters: 1800,
      timezone: "Asia/Shanghai",
      horizon: "48h",
      startDateTime: "2026-05-22T00:00:00+08:00",
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://127.0.0.1:4100/astro/calculate",
        timeoutMs: 45000,
        payload: expect.objectContaining({
          latitudePresent: true,
          longitudePresent: true,
          horizon: "48h",
          timezone: "Asia/Shanghai",
          startDateTimePresent: true,
        }),
      }),
      "Calling astro-service calculate endpoint: http://127.0.0.1:4100/astro/calculate",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        elapsedMs: expect.any(Number),
        timeoutMs: 45000,
        timedOut: false,
      }),
      "Astro-service response received",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 200,
        containsSun: true,
        containsMoon: true,
        containsNight: true,
        containsMilkyWay: true,
        containsCalculationBasis: true,
        timeoutMs: 45000,
      }),
      "Astro-service response parsed",
    );
    expect(mapped.astroDataSourceLabelZh).toBe("本地天文服务计算");
    expect(mapped.astroCalculationBasis).toMatchObject({
      ephemerisFileName: "de421.bsp",
      coordinateSystem: "WGS84",
      timezone: "Asia/Shanghai",
      elevationMeters: 1800,
      computeElapsedMs: 1234.5,
      samplingResolutionMinutes: expect.objectContaining({
        galacticCenter: 10,
        moonAltitude: 60,
        solarAltitudeGlow: 1,
      }),
    });
    expect(mapped.astroSummaries[0]).toMatchObject({
      date: "2026-05-22",
      moonset: "2026-05-23T00:28:00+08:00",
      moonIllumination: 0.36,
      milkyWayCalculationPrecision: "skyfield",
      milkyWayGalacticCenterAzimuth: 142.5,
      elevationMeters: 1800,
      elevationAvailable: true,
      solarCalculationResolutionMinutes: 1,
      glowWindowDerivationMethod: "solar_altitude_weather_v1",
      sunriseGlowCandidateStartAt: "2026-05-22T04:38:00+08:00",
      sunriseGlowCandidateEndAt: "2026-05-22T05:18:00+08:00",
      sunriseGlowBestStartAt: "2026-05-22T04:50:00+08:00",
      sunriseGlowBestEndAt: "2026-05-22T05:14:00+08:00",
      sunsetGlowCandidateStartAt: "2026-05-22T18:48:00+08:00",
      sunsetGlowCandidateEndAt: "2026-05-22T19:28:00+08:00",
      sunsetGlowBestStartAt: "2026-05-22T18:52:00+08:00",
      sunsetGlowBestEndAt: "2026-05-22T19:16:00+08:00",
    });
    expect(mapped.astroSummaries[0]?.sunriseAltitudeCrossings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          altitudeDegrees: -6,
          direction: "rising",
          at: "2026-05-22T04:38:00+08:00",
        }),
        expect.objectContaining({
          altitudeDegrees: -4,
          direction: "rising",
          at: "2026-05-22T04:50:00+08:00",
        }),
      ]),
    );
    expect(mapped.astroWindowBundle.milkyWayCandidateWindows[0]).toMatchObject({
      galacticCenterAzimuth: 142.5,
    });
    expect(mapped.lightPollution).toMatchObject({
      available: true,
      dataAvailable: true,
      ambientRiskIndex: 35,
      ambientRiskLevelLabelZh: "低",
      targetDirectionRisk: 48,
      targetDirectionLevelLabelZh: "中",
      starPenalty: 7,
      milkyWayPenalty: 14,
      scoringMode: "heuristic",
    });
    expect(mapped.astroSummaries[0]?.sunsetAltitudeCrossings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          altitudeDegrees: 2,
          direction: "setting",
          at: "2026-05-22T18:48:00+08:00",
        }),
        expect.objectContaining({
          altitudeDegrees: -4,
          direction: "setting",
          at: "2026-05-22T19:16:00+08:00",
        }),
      ]),
    );
    expect(mapped.astroWindowBundle.recommendedMilkyWayWindows[0]).toMatchObject({
      labelZh: "推荐银河窗口",
      start: "2026-05-23T00:28:00+08:00",
      directionZh: "东南方",
    });
  });

  it("does not abort a successful response before the configured timeout", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            const error = new Error("This operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
          setTimeout(() => resolve(new Response(JSON.stringify(serviceResponse))), 20);
        }),
    );
    const client = new AstroServiceClient({
      fetchImpl,
      env: { ASTRO_SERVICE_TIMEOUT_MS: "100" } as NodeJS.ProcessEnv,
    });

    const resultPromise = client.calculate(calculateInput);
    await vi.advanceTimersByTimeAsync(20);

    await expect(resultPromise).resolves.toMatchObject({
      calculationBasis: expect.objectContaining({ computeElapsedMs: 1234.5 }),
    });
    expect(aborted).toBe(false);
  });

  it("returns a sanitized Chinese timeout error when ASTRO_SERVICE_TIMEOUT_MS is exceeded", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("This operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const client = new AstroServiceClient({
      fetchImpl,
      logger,
      env: { ASTRO_SERVICE_TIMEOUT_MS: "25" } as NodeJS.ProcessEnv,
    });

    const resultPromise = client.calculate(calculateInput);
    const rejectionExpectation = expect(resultPromise).rejects.toMatchObject({
      kind: "timeout",
      message: astroServiceTimeoutMessage,
      diagnostics: expect.objectContaining({
        timeoutMs: 25,
        timedOut: true,
        upstreamErrorName: "AbortError",
        upstreamErrorMessage: "This operation was aborted",
      }),
    });
    await vi.advanceTimersByTimeAsync(25);

    await rejectionExpectation;
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 25,
        timedOut: true,
        errorName: "AbortError",
      }),
      "Astro-service request failed",
    );
  });

  it("returns the stable Chinese error when the service is unavailable", async () => {
    expect.assertions(4);
    const fetchImpl = vi.fn(async () => new Response('{"detail":"down"}', { status: 503 }));
    const client = new AstroServiceClient({ fetchImpl });

    await client
      .calculate({
        latitudeWgs84: 30.1321,
        longitudeWgs84: 118.1691,
        timezone: "Asia/Shanghai",
        horizon: "24h",
        startDateTime: "2026-05-22T00:00:00+08:00",
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(AstroServiceClientError);
        expect((error as AstroServiceClientError).message).toBe(astroServiceUnavailableMessage);
        expect((error as AstroServiceClientError).kind).toBe("unavailable");
        expect((error as AstroServiceClientError).diagnostics).toMatchObject({
          status: 503,
          responseBodyExcerpt: '{"detail":"down"}',
        });
      });
  });

  it("handles unreachable service with sanitized Chinese error diagnostics", async () => {
    expect.assertions(3);
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new AstroServiceClient({ fetchImpl });

    await client
      .calculate({
        latitudeWgs84: 30.1321,
        longitudeWgs84: 118.1691,
        timezone: "Asia/Shanghai",
        horizon: "24h",
        startDateTime: "2026-05-22T00:00:00+08:00",
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(AstroServiceClientError);
        expect((error as AstroServiceClientError).message).toBe(astroServiceUnavailableMessage);
        expect((error as AstroServiceClientError).diagnostics).toMatchObject({
          upstreamErrorName: "TypeError",
          upstreamErrorMessage: "fetch failed",
        });
      });
  });

  it("handles invalid response shape with sanitized Chinese error diagnostics", async () => {
    expect.assertions(4);
    const fetchImpl = vi.fn(async () => new Response('{"forecastStart":"bad"}'));
    const client = new AstroServiceClient({ fetchImpl });

    await client
      .calculate({
        latitudeWgs84: 30.1321,
        longitudeWgs84: 118.1691,
        timezone: "Asia/Shanghai",
        horizon: "24h",
        startDateTime: "2026-05-22T00:00:00+08:00",
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(AstroServiceClientError);
        expect((error as AstroServiceClientError).message).toBe(astroServiceInvalidResponseMessage);
        expect((error as AstroServiceClientError).kind).toBe("invalid_response");
        expect((error as AstroServiceClientError).diagnostics).toMatchObject({
          status: 200,
          responseBodyExcerpt: '{"forecastStart":"bad"}',
        });
      });
  });
});
