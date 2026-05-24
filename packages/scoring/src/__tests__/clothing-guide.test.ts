import { describe, expect, it } from "vitest";
import { buildClothingGuide } from "../index.js";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";

describe("buildClothingGuide", () => {
  it("recommends warm layers for mountain astro nights", () => {
    const guide = buildClothingGuide({
      hourlyWeather: [
        hour({
          time: "2026-05-20T22:00:00+08:00",
          temperature: 6,
          feelsLike: 3,
          windSpeed: 4.8,
        }),
      ],
      elevationMeters: 1800,
      target: "astro",
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T20:00:00+08:00",
    });

    expect(guide.comfortLevel).toBe("very_cold");
    expect(guide.layers.join("、")).toContain("羽绒服");
    expect(guide.accessories).toEqual(expect.arrayContaining(["帽子", "手套"]));
    expect(guide.riskNotes.join("")).toContain("夜间长时间等待");
  });

  it("adds waterproof and anti-slip advice for rainy cloud sea trips", () => {
    const guide = buildClothingGuide({
      hourlyWeather: [
        hour({
          precipitationProbability: 68,
          humidity: 93,
          windSpeed: 3,
        }),
      ],
      elevationMeters: 1600,
      target: "cloud_sea",
      timezone: "Asia/Shanghai",
      forecastStart: "2026-05-20T05:00:00+08:00",
    });

    expect(guide.comfortLevel).toBe("rainy");
    expect(guide.accessories).toEqual(expect.arrayContaining(["防水外套", "防滑鞋", "镜头布"]));
    expect(guide.riskNotes.join("")).toContain("防潮");
  });
});

function hour(overrides: Partial<NormalizedHourlyWeather> = {}): NormalizedHourlyWeather {
  return {
    time: "2026-05-20T06:00:00+08:00",
    temperature: 12,
    feelsLike: 10,
    humidity: 82,
    dewPointSpread: 3,
    pressure: 1004,
    windSpeed: 3,
    windGust: 5,
    windDirection: 120,
    precipitationProbability: 12,
    precipitation: 0,
    visibility: 18,
    dewPoint: 9,
    cloudTotal: 55,
    cloudLow: 35,
    cloudMid: 42,
    cloudHigh: 28,
    weatherCode: "3",
    providerCode: "mock",
    sourceConfidence: 0.8,
    ...overrides,
  };
}
