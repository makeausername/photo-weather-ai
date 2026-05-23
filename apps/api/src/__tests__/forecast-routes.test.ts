import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import { createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

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
      message: "当前地点缺少有效 WGS84 坐标，无法计算日出日落、月相和银河窗口。",
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
      milkyWayNoteZh:
        "银河窗口为本地天文算法初步估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。",
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
      body.bestWindows.filter((window: { label: string }) => window.label.startsWith("银河窗口"))
        .length,
    ).toBeGreaterThan(1);
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
