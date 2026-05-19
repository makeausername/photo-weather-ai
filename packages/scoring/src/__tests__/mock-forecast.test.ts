import { describe, expect, it } from "vitest";
import type { ForecastQueryInput } from "@photo-weather/shared";
import {
  buildMockForecastInput,
  calculateForecast,
  generateMockAstroSummaries,
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
  });

  it("generates 7 day mock weather and astro windows", () => {
    expect(generateMockHourlyWeather("7d")).toHaveLength(168);
    expect(generateMockDailyWeather("7d")).toHaveLength(7);
    expect(generateMockAstroSummaries("7d")[0]).toMatchObject({
      milkyWayDirection: "东南至南方",
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
      "当前为本地模拟天气数据，计算结果仅用于验证流程，不代表真实预报。",
    );
    expect(result.dataSourceLabel).toBe("模拟天气数据");
    expect(result.scores.cloudSea.label).toBe("云海");
    expect(result.bestWindows.length).toBeGreaterThan(0);
  });
});
