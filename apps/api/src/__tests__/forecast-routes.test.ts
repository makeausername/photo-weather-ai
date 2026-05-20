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
      recommendationLabel: expect.stringMatching(/不建议前往|谨慎参考|值得等待|推荐前往/),
      isMock: true,
      dataNotice:
        "当前天气数据和地形数据为本地模拟数据，天文数据由本地算法按 WGS84 坐标计算；整体结果仍不代表真实预报。",
      dataSourceLabel: "模拟天气数据",
    });
    expect(body.overallScore).toEqual(expect.any(Number));
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
      confidenceNote: expect.stringContaining("模拟"),
    });
  });

  it("returns a rule-based AI explanation when DeepSeek is not fully configured", async () => {
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
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/forecast/ai-explain",
      payload: validPayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      explanation: {
        summary: expect.any(String),
        recommendation: expect.any(String),
        confidenceNote: expect.stringContaining("模拟"),
      },
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
