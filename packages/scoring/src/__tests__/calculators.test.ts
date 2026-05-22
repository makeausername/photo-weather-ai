import { describe, expect, it } from "vitest";
import type {
  ForecastCalculationInput,
  ForecastQueryInput,
  ForecastScore,
  NormalizedHourlyWeather,
  TerrainAnalysisSummary,
} from "@photo-weather/shared";
import type { WeatherDataBundle } from "@photo-weather/weather";
import {
  buildForecastInputFromWeatherBundle,
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

const lowTerrainAnalysis: TerrainAnalysisSummary = {
  terrainProfile: {
    locationElevation: 420,
    minElevation1km: 360,
    minElevation3km: 330,
    minElevation5km: 310,
    maxElevation5km: 520,
    avgElevation5km: 410,
    elevationDiff5km: 210,
    terrainCloudSeaPotential: "low",
    terrainNoteZh: "演示地形数据显示周边高差较小，云海地形基础偏弱。",
  },
  horizonProfile: {
    sunriseHorizonAngle: 2,
    sunsetHorizonAngle: 2,
    milkyWayHorizonAngle: 2,
    blockedDirectionsZh: [],
    obstructionNoteZh: "演示地形数据显示地平遮挡较低。",
  },
  dataSource: "mock_terrain",
  dataSourceLabelZh: "演示数据",
  isMock: true,
  honestyNoteZh:
    "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
};

function expectForecastScore(score: ForecastScore, label: string): void {
  expect(score.label).toBe(label);
  expect(score.score).toBeGreaterThanOrEqual(0);
  expect(score.score).toBeLessThanOrEqual(100);
  expect(["poor", "fair", "good", "excellent"]).toContain(score.level);
  expect(score.reasons.length).toBeGreaterThan(0);
}

function withHourlyWeather(
  input: ForecastCalculationInput,
  mapper: (hour: NormalizedHourlyWeather) => NormalizedHourlyWeather,
): ForecastCalculationInput {
  return {
    ...input,
    hourlyWeather: input.hourlyWeather.map(mapper),
  };
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

  it("uses terrain potential and elevation difference for cloud sea scoring", () => {
    const highTerrainInput = buildMockForecastInput(
      {
        ...baseQuery,
        target: "cloud_sea",
      },
      { now: fixedNow },
    );
    const lowTerrainInput = buildMockForecastInput(
      {
        ...baseQuery,
        name: "平原测试点",
        target: "cloud_sea",
      },
      {
        now: fixedNow,
        terrainAnalysis: lowTerrainAnalysis,
      },
    );

    expect(calculateCloudSeaScore(highTerrainInput).score).toBeGreaterThan(
      calculateCloudSeaScore(lowTerrainInput).score,
    );
    expect(calculateCloudSeaScore(highTerrainInput).reasons.join("")).toContain("地形云海潜力");
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

    expect(cloudSeaResult.overallScore).toBe(cloudSeaResult.cloudSeaAnalysis.travelScore);
    expect(calculateOverallScore(cloudSeaResult.scores, "cloud_sea")).toBeGreaterThanOrEqual(0);
    expect(cloudSeaResult.summary).toContain("白墙风险");
    expect(astroResult.scores.milkyWay.score).toBeGreaterThan(
      astroResult.scores.whiteoutRisk.score,
    );
    expect(["不建议前往", "谨慎参考", "值得等待", "推荐前往"]).toContain(
      astroResult.recommendationLabel,
    );
    expect(astroResult.summary).toContain("演示评分");
  });

  it("builds forecast input from a normalized weather bundle", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const bundle: WeatherDataBundle = {
      hourly: baseInput.hourlyWeather,
      daily: baseInput.dailyWeather,
      alerts: [],
      providerCode: "open_meteo",
      providerLabelZh: "Open-Meteo 样例数据",
      dataMode: "fixture",
      generatedAt: fixedNow,
      noticeZh: "天气数据：Open-Meteo 样例数据",
    };
    const input = buildForecastInputFromWeatherBundle({ ...baseQuery, target: "glow" }, bundle, {
      now: fixedNow,
      terrainAnalysis: baseInput.terrainAnalysis,
    });

    const result = calculateForecast(input);

    expect(result.weatherDataMode).toBe("fixture");
    expect(result.weatherNoticeZh).toBe("天气数据：Open-Meteo 样例数据");
    expect(result.dataSourceLabel).toBe("Open-Meteo 样例数据");
    expect(result.summary).toContain("演示评分");
  });

  it("uses humidity, low cloud, wind, dew point, and visibility for cloud sea scoring", () => {
    const baseInput = buildMockForecastInput(
      { ...baseQuery, target: "cloud_sea" },
      { now: fixedNow },
    );
    const favorable = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      humidity: 88,
      cloudLow: 48,
      windSpeed: 1.8,
      visibility: 18,
      dewPoint: hour.temperature - 1.8,
    }));
    const unfavorable = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      humidity: 42,
      cloudLow: 8,
      windSpeed: 8.5,
      visibility: 5,
      dewPoint: hour.temperature - 11,
    }));

    expect(calculateCloudSeaScore(favorable).score).toBeGreaterThan(
      calculateCloudSeaScore(unfavorable).score,
    );
  });

  it("uses cloud layer fields when available for glow scoring", () => {
    const baseInput = buildMockForecastInput({ ...baseQuery, target: "glow" }, { now: fixedNow });
    const layered = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: 18,
      cloudMid: 45,
      cloudHigh: 52,
      precipitationProbability: 8,
      visibility: 28,
      missingFields: [],
    }));
    const missingLayers = withHourlyWeather(baseInput, (hour) => ({
      ...hour,
      cloudTotal: 58,
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      precipitationProbability: 8,
      visibility: 28,
      missingFields: ["cloudLow", "cloudMid", "cloudHigh"],
    }));

    expect(calculateSunriseGlowScore(layered).score).toBeGreaterThan(
      calculateSunriseGlowScore(missingLayers).score,
    );
  });

  it("uses cloud, moon, humidity, and visibility for astro scoring", () => {
    const baseInput = buildMockForecastInput(
      { ...baseQuery, name: "武功山金顶", target: "astro" },
      { now: fixedNow },
    );
    const clearDark = {
      ...withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 10,
        cloudLow: 4,
        cloudMid: 6,
        cloudHigh: 8,
        humidity: 42,
        visibility: 34,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.08,
      })),
    };
    const humidMoonlit = {
      ...withHourlyWeather(baseInput, (hour) => ({
        ...hour,
        cloudTotal: 82,
        cloudLow: 55,
        cloudMid: 70,
        cloudHigh: 76,
        humidity: 88,
        visibility: 6,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.86,
      })),
    };

    expect(calculateStarsScore(clearDark).score).toBeGreaterThan(
      calculateStarsScore(humidMoonlit).score,
    );
    expect(calculateMilkyWayScore(clearDark).score).toBeGreaterThan(
      calculateMilkyWayScore(humidMoonlit).score,
    );
  });
});
