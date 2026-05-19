import { describe, expect, it } from "vitest";
import {
  averageWeightedScore,
  clampScore,
  formatChineseTimeRange,
  getHorizonHours,
  getWeatherWindowAroundTime,
} from "../index.js";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";

const sampleHour: NormalizedHourlyWeather = {
  time: "2026-05-20T05:00:00+08:00",
  temperature: 14,
  humidity: 82,
  windSpeed: 2.1,
  precipitationProbability: 10,
  visibility: 24,
  dewPoint: 11,
  cloudTotal: 55,
  cloudLow: 42,
  cloudMid: 48,
  cloudHigh: 36,
  providerCode: "mock-weather-v1",
};

describe("forecast scoring helpers", () => {
  it("clamps scores to the 0-100 range", () => {
    expect(clampScore(-10)).toBe(0);
    expect(clampScore(51.4)).toBe(51);
    expect(clampScore(120)).toBe(100);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it("calculates weighted averages with normalized scores", () => {
    expect(
      averageWeightedScore([
        { score: 80, weight: 2 },
        { score: 40, weight: 1 },
      ]),
    ).toBe(67);
    expect(averageWeightedScore([{ score: 80, weight: 0 }])).toBe(0);
  });

  it("maps supported forecast horizons to hours", () => {
    expect(getHorizonHours("24h")).toBe(24);
    expect(getHorizonHours("48h")).toBe(48);
    expect(getHorizonHours("72h")).toBe(72);
    expect(getHorizonHours("7d")).toBe(168);
  });

  it("selects weather points around a target time", () => {
    const hours = [
      { ...sampleHour, time: "2026-05-20T04:00:00+08:00" },
      { ...sampleHour, time: "2026-05-20T05:00:00+08:00" },
      { ...sampleHour, time: "2026-05-20T06:00:00+08:00" },
      { ...sampleHour, time: "2026-05-20T09:00:00+08:00" },
    ];

    expect(getWeatherWindowAroundTime(hours, "2026-05-20T05:00:00+08:00", 1, 1)).toHaveLength(3);
    expect(getWeatherWindowAroundTime(hours, undefined)).toHaveLength(0);
  });

  it("formats time ranges in Chinese", () => {
    expect(formatChineseTimeRange("2026-05-20T05:18:00+08:00", "2026-05-20T06:18:00+08:00")).toBe(
      "5月20日 05:18-06:18",
    );
  });
});
