import { describe, expect, it } from "vitest";
import type { ForecastQueryInput, ForecastScore } from "@photo-weather/shared";
import {
  buildMockForecastInput,
  calculateCloudSeaScore,
  calculateForecast,
  calculateMilkyWayScore,
  calculateOverallScore,
  calculateStarsScore,
  calculateSunriseGlowScore,
  calculateSunsetGlowScore,
  calculateTransparencyScore,
  calculateWhiteoutRiskScore,
  classifyRecommendationLevel,
  classifyScoreLevel,
} from "../index.js";

const baseQuery: ForecastQueryInput = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "general",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
};
const fixedNow = "2026-05-20T00:00:00+08:00";

function expectForecastScore(score: ForecastScore, label: string): void {
  expect(score.label).toBe(label);
  expect(score.score).toBeGreaterThanOrEqual(0);
  expect(score.score).toBeLessThanOrEqual(100);
  expect(["poor", "fair", "good", "excellent"]).toContain(score.level);
  expect(score.reasons.length).toBeGreaterThan(0);
}

describe("forecast score calculators", () => {
  it("calculates each major photography score with Chinese labels", () => {
    const input = buildMockForecastInput(baseQuery, { now: fixedNow });

    expectForecastScore(calculateSunriseGlowScore(input), "朝霞");
    expectForecastScore(calculateSunsetGlowScore(input), "晚霞");
    expectForecastScore(calculateCloudSeaScore(input), "云海");
    expectForecastScore(calculateWhiteoutRiskScore(input), "白墙风险");
    expectForecastScore(calculateStarsScore(input), "星空");
    expectForecastScore(calculateMilkyWayScore(input), "银河");
    expectForecastScore(calculateTransparencyScore(input), "通透度");
  });

  it("keeps whiteout risk separate from cloud sea opportunity", () => {
    const humidInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "三清山女神峰",
        target: "cloud_sea",
      },
      { now: fixedNow },
    );
    const clearInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "武功山金顶",
        target: "astro",
      },
      { now: fixedNow },
    );

    expect(calculateWhiteoutRiskScore(humidInput).score).toBeGreaterThan(
      calculateWhiteoutRiskScore(clearInput).score,
    );
    expect(calculateCloudSeaScore(humidInput).score).toBeGreaterThan(40);
  });

  it("classifies score and recommendation levels", () => {
    expect(classifyScoreLevel(82)).toBe("excellent");
    expect(classifyScoreLevel(66)).toBe("good");
    expect(classifyScoreLevel(52)).toBe("fair");
    expect(classifyScoreLevel(30)).toBe("poor");

    expect(classifyRecommendationLevel(82)).toBe("recommended");
    expect(classifyRecommendationLevel(68)).toBe("worth_waiting");
    expect(classifyRecommendationLevel(50)).toBe("cautious");
    expect(classifyRecommendationLevel(35)).toBe("not_recommended");
  });

  it("calculates target-aware overall scores and full results", () => {
    const cloudSeaInput = buildMockForecastInput(
      {
        ...baseQuery,
        target: "cloud_sea",
      },
      { now: fixedNow },
    );
    const astroInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "武功山金顶",
        target: "astro",
      },
      { now: fixedNow },
    );
    const cloudSeaResult = calculateForecast(cloudSeaInput);
    const astroResult = calculateForecast(astroInput);

    expect(calculateOverallScore(cloudSeaResult.scores, "cloud_sea")).toBe(
      cloudSeaResult.overallScore,
    );
    expect(astroResult.scores.milkyWay.score).toBeGreaterThan(
      astroResult.scores.whiteoutRisk.score,
    );
    expect(["不建议前往", "谨慎参考", "值得等待", "推荐前往"]).toContain(
      astroResult.recommendationLabel,
    );
    expect(astroResult.summary).toContain("模拟评分");
  });
});
