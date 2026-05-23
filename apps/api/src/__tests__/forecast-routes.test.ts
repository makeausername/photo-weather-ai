import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import { createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";
import {
  AstroServiceClientError,
  astroServiceInvalidResponseMessage,
  astroServiceTimeoutMessage,
  astroServiceUrlMissingMessage,
  astroServiceUnavailableMessage,
  type AstroServiceCalculationResponse,
  type AstroServiceClientLike,
  type AstroServiceCalculateInput,
} from "../astro-service-client.js";

const validPayload = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "cloud_sea",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
} as const;

function addOneDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate(),
  ).padStart(2, "0")}`;
}

function buildAstroServiceResponse(
  input: AstroServiceCalculateInput,
): AstroServiceCalculationResponse {
  const date = input.startDateTime.slice(0, 10);
  const nextDate = addOneDay(date);

  return {
    forecastStart: input.startDateTime,
    forecastEnd: `${nextDate}T00:00:00+08:00`,
    targetDates: [date],
    sun: {
      daily: [
        {
          date,
          sunrise: `${date}T05:08:00+08:00`,
          sunset: `${date}T18:58:00+08:00`,
          solarNoon: `${date}T12:03:00+08:00`,
          civilDawn: `${date}T04:42:00+08:00`,
          civilDusk: `${date}T19:24:00+08:00`,
          nauticalDawn: `${date}T04:10:00+08:00`,
          nauticalDusk: `${date}T19:57:00+08:00`,
          astronomicalDawn: `${date}T03:36:00+08:00`,
          astronomicalDusk: `${date}T20:31:00+08:00`,
          sunriseAzimuth: 67.2,
          sunsetAzimuth: 292.8,
        },
      ],
    },
    moon: {
      daily: [
        {
          date,
          moonPhaseValue: 0.26,
          moonPhaseNameZh: "盈凸月",
          moonIllumination: 0.36,
          waxingOrWaning: "waxing",
          moonrise: `${date}T10:42:00+08:00`,
          moonset: `${nextDate}T00:28:00+08:00`,
          moonAltitudeByHour: [
            { time: `${date}T20:00:00+08:00`, altitude: 32, azimuth: 250 },
            { time: `${nextDate}T01:00:00+08:00`, altitude: -7, azimuth: 296 },
          ],
          moonImpactLevel: "medium",
          moonImpactScore: 44,
          moonImpactReasonsZh: ["月亮照明处于 20%-50% 区间，月亮高度会决定干扰强度。"],
        },
      ],
      altitudeByHour: [
        { time: `${date}T20:00:00+08:00`, altitude: 32, azimuth: 250 },
        { time: `${nextDate}T01:00:00+08:00`, altitude: -7, azimuth: 296 },
      ],
    },
    night: {
      astronomicalNightWindows: [
        {
          date,
          start: `${date}T20:31:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          durationMinutes: 424,
          noteZh: "太阳高度低于 -18°。",
        },
      ],
      moonlessNightWindows: [
        {
          date,
          start: `${nextDate}T00:28:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          durationMinutes: 187,
          reasonZh: "月落后进入低月光影响窗口。",
        },
      ],
    },
    milkyWay: {
      candidateWindows: [
        {
          date,
          start: `${date}T22:20:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          bestTime: `${nextDate}T02:10:00+08:00`,
          minAltitude: 8,
          maxAltitude: 31,
          directionZh: "东南方",
          confidenceLevel: "high",
          noteZh: "银心高度超过 5° 的可见候选窗口。",
        },
      ],
      recommendedWindows: [
        {
          date,
          start: `${nextDate}T00:28:00+08:00`,
          end: `${nextDate}T03:35:00+08:00`,
          bestTime: `${nextDate}T02:10:00+08:00`,
          durationMinutes: 187,
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
      timezone: input.timezone,
      elevationMeters: input.elevationMeters,
      generatedAt: `${date}T00:00:01+08:00`,
      computeElapsedMs: 1200,
      samplingResolutionMinutes: {
        sunCrossing: 10,
        solarNoon: 10,
        moonAltitude: 60,
        moonlessWindow: 5,
        moonImpact: 15,
        galacticCenter: 10,
      },
    },
  };
}

describe("forecast query validation route", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.unstubAllGlobals();
  });

  it("normalizes a public forecast query without calling providers", async () => {
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/validate-query",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      query: validPayload,
      labels: {
        horizon: "未来48小时",
        target: "云海",
      },
    });
  });

  it("rejects invalid coordinate ranges", async () => {
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/validate-query",
      payload: {
        ...validPayload,
        longitudeWgs84: 181,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_wgs84_coordinates",
      message: "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。",
    });
  });

  it("calculates a deterministic mock forecast result without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: validPayload,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      place: {
        name: "黄山光明顶",
        countryCode: "CN",
      },
      horizon: "48h",
      target: "cloud_sea",
      recommendationLabel: expect.stringMatching(
        /不建议前往|推荐重点关注|不建议专程|谨慎参考|值得等待|推荐前往/,
      ),
      isMock: true,
      dataNotice:
        "天气数据：演示数据；地形数据：演示数据；天文数据：本地算法计算。当前结果基于演示天气数据生成，仅用于体验分析流程。正式天气数据源启用后，将显示对应的数据来源与预报时间。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。",
      dataSourceLabel: "演示数据",
      weatherDataMode: "mock",
      weatherNoticeZh: "天气数据：演示数据",
    });
    expect(body.terrainAnalysis).toMatchObject({
      dataSource: "mock_terrain",
      dataSourceLabelZh: "演示数据",
      terrainProfile: {
        locationElevation: 1860,
        terrainCloudSeaPotential: "high",
      },
      horizonProfile: {
        blockedDirectionsZh: expect.any(Array),
      },
    });
    expect(body.overallScore).toEqual(expect.any(Number));
    expect(body.cloudSeaAnalysis).toMatchObject({
      cloudSeaOpportunityScore: expect.any(Number),
      whiteoutRiskScore: expect.any(Number),
      travelScore: expect.any(Number),
      recommendationLabel: expect.stringMatching(/推荐重点关注|不建议专程|谨慎参考|值得等待/),
    });
    expect(body.forecastStart).toBe(body.calendarBasis.forecastStart);
    expect(body.forecastEnd).toBe(body.calendarBasis.forecastEnd);
    expect(body.targetDates).toEqual(body.calendarBasis.targetDates);
    expect(body.scores).toMatchObject({
      sunriseGlow: {
        label: "朝霞",
        score: expect.any(Number),
      },
      sunsetGlow: {
        label: "晚霞",
        score: expect.any(Number),
      },
      cloudSea: {
        label: "云海",
        score: expect.any(Number),
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: expect.any(Number),
      },
      stars: {
        label: "星空",
        score: expect.any(Number),
      },
      milkyWay: {
        label: "银河",
        score: expect.any(Number),
      },
      transparency: {
        label: "通透度",
        score: expect.any(Number),
      },
    });
    expect(body.astroSummaries[0]).toMatchObject({
      timezone: "Asia/Shanghai",
      sunrise: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/),
      sunset: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/),
      moonPhaseNameZh: expect.stringMatching(/新月|娥眉月|上弦月|盈凸月|满月|亏凸月|下弦月|残月/),
      waxingOrWaning: expect.stringMatching(/waxing|waning|unknown/),
      lunarDateText: expect.any(String),
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。",
      moonInfo: {
        lunarDateText: expect.any(String),
      },
      milkyWayNoteZh: "银河窗口为简化本地估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。",
    });
    expect(Date.parse(body.astroSummaries[0].sunrise)).toBeLessThan(
      Date.parse(body.astroSummaries[0].sunset),
    );
    expect(body.astroSummaries[0].moonIllumination).toBeGreaterThanOrEqual(0);
    expect(body.astroSummaries[0].moonIllumination).toBeLessThanOrEqual(1);
    expect(Object.keys(body.astroSummaries[0].moonAltitudeByHour)).toHaveLength(24);
    expect(body.bestWindows.length).toBeGreaterThan(0);
    expect(body.dailySummaries.length).toBeGreaterThanOrEqual(2);
    expect(body.targetDailyBreakdown.length).toBeGreaterThanOrEqual(2);
    expect(body.calendarBasis).toMatchObject({
      timezone: "Asia/Shanghai",
      timezoneLabel: "Asia/Shanghai（中国标准时间）",
      horizonHours: 48,
      coordinateSource: "本地机位 WGS84 坐标",
      wgs84Coordinates: {
        latitude: 30.13012,
        longitude: 118.16389,
      },
    });
    expect(body.calendarBasis.targetDates.length).toBeGreaterThanOrEqual(2);
    expect(body.calendarBasis.calendarDays[0]).toMatchObject({
      lunarDateText: expect.any(String),
    });
    expect(body.keyReasons.length).toBeGreaterThan(0);
    expect(body.photographyAdvice.length).toBeGreaterThan(0);
  });

  it("returns multi-day windows for a 7 day astro calculation without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        horizon: "7d",
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.targetDates.length).toBeGreaterThanOrEqual(7);
    expect(body.dailySummaries.length).toBeGreaterThanOrEqual(7);
    expect(
      body.bestWindows.filter((window: { label: string }) => window.label.startsWith("天文黑夜"))
        .length,
    ).toBeGreaterThan(1);
    expect(
      body.bestWindows.filter((window: { label: string }) =>
        window.label.startsWith("推荐银河窗口"),
      ).length,
    ).toBeGreaterThan(1);
    expect(body.astroDataSourceLabelZh).toBe("简化本地估算");
    expect(body.dataNotice).toContain("天文数据：简化本地估算");
  });

  it("uses astro-service output for target astro when enabled", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(calculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitudeWgs84: validPayload.latitudeWgs84,
        longitudeWgs84: validPayload.longitudeWgs84,
        elevationMeters: 1860,
        timezone: "Asia/Shanghai",
        horizon: "48h",
        startDateTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      }),
    );
    expect(body.astroDataSourceLabelZh).toBe("本地天文服务计算");
    expect(body.dataNotice).toContain("天文数据：本地天文服务计算");
    expect(body.astroCalculationBasis).toMatchObject({
      ephemerisFileName: "de421.bsp",
      coordinateSystem: "WGS84",
      timezone: "Asia/Shanghai",
    });
    expect(body.astroSummaries[0]).toMatchObject({
      moonIllumination: 0.36,
      moonset: expect.stringMatching(/T00:28:00\+08:00$/),
      milkyWayCalculationPrecision: "skyfield",
    });
    expect(body.astroAnalysis.recommendedMilkyWayWindows[0]).toMatchObject({
      labelZh: "推荐银河窗口",
      directionZh: "东南方",
    });
  });

  it("normalizes supported astro target aliases before calling astro-service", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "enabled",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    for (const target of ["星空银河", "milky_way", "stars"]) {
      const response = await app.inject({
        method: "POST",
        url: "/forecast/calculate",
        payload: {
          ...validPayload,
          horizon: "24h",
          target,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        target: "astro",
        astroDataSourceLabelZh: "本地天文服务计算",
      });
    }

    expect(calculateMock).toHaveBeenCalledTimes(3);
  });

  it("treats target general with an astro scenario as an astro calculation", async () => {
    const calculateMock = vi.fn((input: AstroServiceCalculateInput) =>
      Promise.resolve(buildAstroServiceResponse(input)),
    );
    const astroServiceClient: AstroServiceClientLike = {
      calculate: calculateMock,
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "1",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "general",
        scenario: "astro",
        timezone: "Asia/Shanghai",
        elevationMeters: 1800,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(calculateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        elevationMeters: 1800,
        timezone: "Asia/Shanghai",
      }),
    );
    expect(response.json()).toMatchObject({
      target: "astro",
      astroDataSourceLabelZh: "本地天文服务计算",
    });
  });

  it("returns a stable Chinese error when enabled astro-service is unavailable", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() =>
        Promise.reject(
          new AstroServiceClientError("unavailable", astroServiceUnavailableMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            upstreamErrorName: "TypeError",
            upstreamErrorMessage: "fetch failed",
          }),
        ),
      ),
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "astro_service_unavailable",
      message: astroServiceUnavailableMessage,
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("TypeError");
  });

  it("returns a sanitized Chinese timeout error without leaking AbortError details", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() =>
        Promise.reject(
          new AstroServiceClientError("timeout", astroServiceTimeoutMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            elapsedMs: 8011,
            timeoutMs: 8000,
            timedOut: true,
            upstreamErrorName: "AbortError",
            upstreamErrorMessage: "This operation was aborted",
          }),
        ),
      ),
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
        ASTRO_SERVICE_TIMEOUT_MS: "8000",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "astro_service_timeout",
      message: astroServiceTimeoutMessage,
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("AbortError");
    expect(response.body).not.toContain("This operation was aborted");
  });

  it("returns a sanitized Chinese error when astro-service response shape is invalid", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() =>
        Promise.reject(
          new AstroServiceClientError("invalid_response", astroServiceInvalidResponseMessage, {
            url: "http://127.0.0.1:4100/astro/calculate",
            status: 200,
            responseBodyExcerpt: '{"forecastStart":"bad"}',
            upstreamErrorName: "ZodError",
            upstreamErrorMessage: "Required field missing",
          }),
        ),
      ),
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://127.0.0.1:4100",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: "astro_service_invalid_response",
      message: astroServiceInvalidResponseMessage,
    });
    expect(response.body).not.toContain("stack");
    expect(response.body).not.toContain("ZodError");
    expect(response.body).not.toContain("forecastStart");
  });

  it("returns a Chinese configuration error when enabled astro-service URL is missing", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() => {
        throw new Error("astro-service should not be called without ASTRO_SERVICE_URL");
      }),
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "astro_service_url_missing",
      message: astroServiceUrlMissingMessage,
    });
    expect(astroServiceClient.calculate).not.toHaveBeenCalled();
    expect(response.body).not.toContain("stack");
  });

  it("returns a coordinate-specific Chinese error without stack traces", async () => {
    app = buildApiServer({
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "true",
      },
      logger: false,
    });
    const payloadWithoutLatitude: Record<string, unknown> = { ...validPayload };
    delete payloadWithoutLatitude.latitudeWgs84;

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...payloadWithoutLatitude,
        target: "astro",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_wgs84_coordinates",
      message: "当前地点缺少有效 WGS84 坐标，无法计算星空银河窗口。",
    });
    expect(response.body).not.toContain("stack");
  });

  it("exposes sanitized local astro-service debug status", async () => {
    app = buildApiServer({
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "false",
        ASTRO_SERVICE_URL: "http://user:secret@localhost:4100?token=hidden",
        ASTRO_SERVICE_TIMEOUT_MS: "bad",
        JWT_SECRET: "dev-secret-that-should-not-appear-in-debug-output",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/debug/astro-service",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      enabled: false,
      url: "http://127.0.0.1:4100",
      timeoutMs: 45000,
      healthOk: false,
      healthStatus: null,
    });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("token=hidden");
    expect(response.body).not.toContain("JWT_SECRET");
  });

  it("relays safe astro-service health details in the local debug endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
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
    );
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
        ENABLE_ASTRO_SERVICE: "true",
        ASTRO_SERVICE_URL: "http://user:secret@localhost:4100?token=hidden",
        ASTRO_SERVICE_TIMEOUT_MS: "bad",
        PHOTO_WEATHER_ENV_LOCAL_LOADED: "true",
        DATABASE_URL: "postgresql://user:password@localhost:15432/photo_weather_ai",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "GET",
      url: "/debug/astro-service",
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(response.json()).toMatchObject({
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
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("password");
    expect(response.body).not.toContain("token=hidden");
    expect(response.body).not.toContain("DATABASE_URL");
  });

  it("keeps target astro on an explicitly labeled simplified fallback when service is disabled", async () => {
    const astroServiceClient: AstroServiceClientLike = {
      calculate: vi.fn(() => {
        throw new Error("astro-service should not be called while disabled");
      }),
    };
    app = buildApiServer({
      authConfig: testAuthConfig,
      astroServiceClient,
      env: {
        ...process.env,
        ENABLE_ASTRO_SERVICE: "false",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "astro",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(astroServiceClient.calculate).not.toHaveBeenCalled();
    expect(body.astroDataSourceLabelZh).toBe("简化本地估算");
    expect(body.dataNotice).toContain("天文数据：简化本地估算");
  });

  it("calculates a deterministic glow forecast result without real network calls", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in glow forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        horizon: "7d",
        target: "glow",
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.target).toBe("glow");
    expect(body.glowAnalysis).toMatchObject({
      sunriseGlowScore: expect.any(Number),
      sunsetGlowScore: expect.any(Number),
      lowCloudObstructionRisk: expect.any(Number),
      glowTravelScore: expect.any(Number),
      recommendationLabel: expect.stringMatching(/推荐重点关注|值得等待|谨慎参考|不建议专程/),
      dataMode: "mock",
    });
    expect(body.glowAnalysis.bestGlowWindows.length).toBeGreaterThan(1);
    expect(body.glowAnalysis.dailyGlow.length).toBeGreaterThanOrEqual(7);
    expect(body.dataNotice).toContain("天气数据：演示数据");
    expect(body.dataNotice).toContain("地形数据：演示数据");
    expect(body.dataNotice).toContain("天文数据：本地算法计算");
  });

  it("can return a rule-based explanation from calculate without DeepSeek", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        useAiExplanation: true,
      },
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.aiExplanation).toMatchObject({
      summary: expect.any(String),
      recommendation: expect.any(String),
      confidenceNote: expect.stringContaining("演示天气和地形数据"),
    });
  });

  it("returns a Chinese error when DeepSeek real call is enabled without a key", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("real network calls are disabled in forecast tests");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client, state } = await createFakeDatabaseClient();
    const provider = state.providers.get("ai:deepseek");
    state.providers.set("ai:deepseek", {
      ...provider,
      enabled: true,
      configJson: {
        ...(provider.configJson ?? {}),
        realCallEnabled: true,
      },
      secretJson: {},
      maskedSecretJson: {},
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...process.env,
        NODE_ENV: "development",
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "provider_key_missing",
      message: "请先填写 DeepSeek API Key。",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.body).not.toContain("secretJson");
  });

  it("rejects unsupported horizon and target for calculation", async () => {
    app = buildApiServer({ authConfig: testAuthConfig, logger: false });

    const horizonResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        horizon: "96h",
      },
    });
    const targetResponse = await app.inject({
      method: "POST",
      url: "/forecast/calculate",
      payload: {
        ...validPayload,
        target: "rainbow",
      },
    });

    expect(horizonResponse.statusCode).toBe(400);
    expect(horizonResponse.json()).toMatchObject({
      error: "validation_error",
      issues: expect.arrayContaining([expect.objectContaining({ path: "horizon" })]),
    });
    expect(targetResponse.statusCode).toBe(400);
    expect(targetResponse.json()).toMatchObject({
      error: "validation_error",
      issues: expect.arrayContaining([expect.objectContaining({ path: "target" })]),
    });
  });
});
