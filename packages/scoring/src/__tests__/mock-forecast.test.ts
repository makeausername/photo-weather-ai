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

describe("mock forecast input builder", () => {
  it("builds deterministic normalized calculation input", () => {
    const first = buildMockForecastInput(query);
    const second = buildMockForecastInput(query);

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
  });

  it("generates 7 day mock weather and local astro windows", () => {
    expect(generateMockHourlyWeather("7d")).toHaveLength(168);
    expect(generateMockDailyWeather("7d")).toHaveLength(7);
    expect(generateLocalAstroSummaries("7d")[0]).toMatchObject({
      milkyWayVisibilityLevel: expect.any(String),
    });
  });

  it("varies terrain profiles for supported mainland photography places", () => {
    const huangshan = buildMockForecastInput(query);
    const wugongshan = buildMockForecastInput({
      ...query,
      name: "武功山金顶",
      target: "astro",
    });

    expect(generateMockTerrainSummary(huangshan.place).locationElevation).toBe(1860);
    expect(generateMockTerrainSummary(wugongshan.place).locationElevation).toBe(1918);
    expect(wugongshan.hourlyWeather[2]?.cloudTotal).toBeLessThan(
      huangshan.hourlyWeather[2]?.cloudTotal ?? 100,
    );
  });

  it("can be consumed by the forecast scoring engine", () => {
    const result = calculateForecast(buildMockForecastInput(query));

    expect(result.isMock).toBe(true);
    expect(result.dataNotice).toBe(
      "当前天气数据和地形数据为本地模拟数据，天文数据由本地算法按 WGS84 坐标计算；整体结果仍不代表真实预报。",
    );
    expect(result.dataSourceLabel).toBe("模拟天气数据");
    expect(result.scores.cloudSea.label).toBe("云海");
    expect(result.astroSummaries).toHaveLength(2);
    expect(result.bestWindows.length).toBeGreaterThan(0);
  });

  it("does not call external network while building and scoring mock forecasts", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("network should not be called");
    }) as typeof fetch;

    try {
      const result = calculateForecast(buildMockForecastInput(query));

      expect(result.isMock).toBe(true);
      expect(result.astroSummaries.length).toBeGreaterThan(0);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
