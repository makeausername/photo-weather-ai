import { describe, expect, it } from "vitest";
import type { ForecastQueryInput } from "@photo-weather/shared";
import {
  buildMockForecastInput,
  calculateForecast,
  generateLocalAstroSummaries,
  generateMockDailyWeather,
  generateMockHourlyWeather,
  generateMockTerrainSummary,
} from "../index.js";

const query: ForecastQueryInput = {
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
};
const fixedNow = "2026-05-20T00:00:00+08:00";

describe("mock forecast input builder", () => {
  it("builds deterministic normalized calculation input", () => {
    const first = buildMockForecastInput(query, { now: fixedNow });
    const second = buildMockForecastInput(query, { now: fixedNow });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      place: {
        name: "黄山光明顶",
        countryCode: "CN",
      },
      horizon: "48h",
      target: "cloud_sea",
      isMock: true,
    });
    expect(first.hourlyWeather).toHaveLength(48);
    expect(first.dailyWeather).toHaveLength(2);
    expect(first.astroSummaries).toHaveLength(2);
    expect(first.calendarBasis).toMatchObject({
      forecastStart: "2026-05-20T00:00:00+08:00",
      forecastEnd: "2026-05-22T00:00:00+08:00",
      targetDates: ["2026-05-20", "2026-05-21"],
      timezone: "Asia/Shanghai",
    });
    expect(first.astroSummaries[0]).toMatchObject({
      timezone: "Asia/Shanghai",
      moonPhaseNameZh: expect.any(String),
      milkyWayVisibilityLevel: expect.any(String),
    });
    expect(first.astroSummaries[0]?.moonIllumination).toBeGreaterThanOrEqual(0);
    expect(first.astroSummaries[0]?.moonIllumination).toBeLessThanOrEqual(1);
    expect(Date.parse(first.astroSummaries[0]!.sunrise!)).toBeLessThan(
      Date.parse(first.astroSummaries[0]!.sunset!),
    );
    expect(first.astroSummaries[0]?.milkyWayNoteZh).toBe(
      "银河窗口为本地天文算法初步估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。",
    );
    expect(first.terrainAnalysis).toMatchObject({
      dataSource: "mock_terrain",
      dataSourceLabelZh: "本地模拟地形数据",
      terrainProfile: {
        locationElevation: 1860,
        terrainCloudSeaPotential: "high",
      },
    });
    expect(first.dailyWeather[0]?.sunrise).toBe(first.astroSummaries[0]?.sunrise);
    expect(first.dailyWeather[0]?.sunset).toBe(first.astroSummaries[0]?.sunset);
  });

  it("generates 7 day mock weather and local astro windows", () => {
    expect(generateMockHourlyWeather("7d", { now: fixedNow })).toHaveLength(168);
    const dailyWithoutCoordinates = generateMockDailyWeather("7d", { now: fixedNow });

    expect(dailyWithoutCoordinates).toHaveLength(7);
    expect(dailyWithoutCoordinates[0]?.sunrise).toBeUndefined();
    expect(dailyWithoutCoordinates[0]?.sunset).toBeUndefined();
    expect(
      generateLocalAstroSummaries("7d", {
        now: fixedNow,
        latitudeWgs84: query.latitudeWgs84,
        longitudeWgs84: query.longitudeWgs84,
      })[0],
    ).toMatchObject({
      milkyWayVisibilityLevel: expect.any(String),
    });
  });

  it("varies terrain profiles for supported mainland photography places", () => {
    const huangshan = buildMockForecastInput(query, { now: fixedNow });
    const wugongshan = buildMockForecastInput(
      {
        ...query,
        name: "武功山金顶",
        target: "astro",
      },
      { now: fixedNow },
    );

    expect(generateMockTerrainSummary(huangshan.place).locationElevation).toBe(1860);
    expect(generateMockTerrainSummary(wugongshan.place).locationElevation).toBe(1918);
    expect(wugongshan.hourlyWeather[2]?.cloudTotal).toBeLessThan(
      huangshan.hourlyWeather[2]?.cloudTotal ?? 100,
    );
  });

  it("can be consumed by the forecast scoring engine", () => {
    const result = calculateForecast(buildMockForecastInput(query, { now: fixedNow }));

    expect(result.isMock).toBe(true);
    expect(result.dataNotice).toBe(
      "天气数据：本地模拟数据；地形数据：本地模拟地形数据，真实 DEM / 海拔数据将在后续接入；天文数据：本地算法按 WGS84 坐标计算。当前结果不代表真实预报。",
    );
    expect(result.dataSourceLabel).toBe("模拟天气数据");
    expect(result.terrainAnalysis.dataSource).toBe("mock_terrain");
    expect(result.scores.cloudSea.label).toBe("云海");
    expect(result.astroSummaries).toHaveLength(2);
    expect(result.bestWindows.length).toBeGreaterThan(0);
  });

  it("does not output January 1 windows unless tests inject January 1", () => {
    const result = calculateForecast(buildMockForecastInput(query, { now: fixedNow }));
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("2026-01-01");
    expect(serialized).not.toContain("1月1日");
    expect(serialized).not.toContain("January 1");
  });

  it("uses Calendar Core target dates for scored windows", () => {
    const result = calculateForecast(buildMockForecastInput(query, { now: fixedNow }));
    const forecastStart = Date.parse(result.calendarBasis.forecastStart);
    const forecastEnd = Date.parse(result.calendarBasis.forecastEnd);

    expect(result.calendarBasis.targetDates).toEqual(["2026-05-20", "2026-05-21"]);
    expect(result.bestWindows.length).toBeGreaterThan(0);
    for (const window of result.bestWindows) {
      const windowStart = Date.parse(window.startTime);
      const windowEnd = Date.parse(window.endTime);

      expect(windowStart).toBeGreaterThanOrEqual(forecastStart);
      expect(windowEnd).toBeLessThanOrEqual(forecastEnd);
      expect(windowEnd).toBeGreaterThan(windowStart);
      expect(
        result.calendarBasis.targetDates.some(
          (date) => window.startTime.startsWith(date) || window.endTime.startsWith(date),
        ),
      ).toBe(true);
    }
  });

  it("does not surface past sunrise windows when the forecast starts after sunrise", () => {
    const result = calculateForecast(
      buildMockForecastInput(
        {
          ...query,
          horizon: "24h",
          target: "glow",
        },
        { now: "2026-05-20T12:00:00+08:00" },
      ),
    );
    const forecastStart = Date.parse(result.calendarBasis.forecastStart);
    const forecastEnd = Date.parse(result.calendarBasis.forecastEnd);
    const sunriseWindow = result.bestWindows.find((window) => window.label.startsWith("朝霞"));

    expect(result.calendarBasis.targetDates).toEqual(["2026-05-20", "2026-05-21"]);
    expect(sunriseWindow?.startTime.startsWith("2026-05-21")).toBe(true);
    for (const window of result.bestWindows) {
      expect(Date.parse(window.startTime)).toBeGreaterThanOrEqual(forecastStart);
      expect(Date.parse(window.endTime)).toBeLessThanOrEqual(forecastEnd);
    }
  });

  it("does not call external network while building and scoring mock forecasts", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network should not be called");
    }) as typeof fetch;

    try {
      const result = calculateForecast(buildMockForecastInput(query, { now: fixedNow }));

      expect(result.isMock).toBe(true);
      expect(result.astroSummaries.length).toBeGreaterThan(0);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
