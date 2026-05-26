import { describe, expect, it } from "vitest";
import type {
  ForecastCalculationInput,
  ForecastQueryInput,
  NormalizedHourlyWeather,
  TerrainAnalysisSummary,
} from "@photo-weather/shared";
import {
  analyzeCloudSea,
  buildMockForecastInput,
  calculateForecast,
  cloudSeaRecommendationLabel,
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

const lowTerrainAnalysis: TerrainAnalysisSummary = {
  terrainProfile: {
    latitudeWgs84: 30,
    longitudeWgs84: 118,
    elevationMeters: 420,
    elevationSource: "manual",
    elevationConfidence: "medium",
    terrainType: "slope",
    exposureType: "semi_exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 310,
    localReliefMeters: 210,
    terrainNotesZh: "低山测试地形。",
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
  honestyNoteZh: "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将提升判断。",
};

function baseInput(): ForecastCalculationInput {
  return buildMockForecastInput(query, { now: fixedNow });
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

function withCloudSeaWeather(
  input: ForecastCalculationInput,
  patch: Partial<NormalizedHourlyWeather>,
): ForecastCalculationInput {
  return withHourlyWeather(input, (hour) => ({
    ...hour,
    temperature: 10,
    humidity: 92,
    dewPoint: 8.8,
    windSpeed: 2.4,
    windGust: 4,
    visibility: 14,
    precipitationProbability: 12,
    precipitation: 0,
    cloudTotal: 66,
    cloudLow: 52,
    cloudMid: 32,
    cloudHigh: 38,
    missingFields: [],
    estimatedFields: [],
    ...patch,
  }));
}

describe("professional cloud sea analysis V1", () => {
  it("raises cloud sea opportunity when humidity is high and dew point spread is small", () => {
    const favorable = analyzeCloudSea(
      withCloudSeaWeather(baseInput(), {
        humidity: 96,
        dewPoint: 9.4,
      }),
    );
    const dry = analyzeCloudSea(
      withCloudSeaWeather(baseInput(), {
        humidity: 62,
        dewPoint: 1,
      }),
    );

    expect(favorable.cloudSeaOpportunityScore).toBeGreaterThan(dry.cloudSeaOpportunityScore);
    expect(favorable.opportunityReasons.join("")).toContain("露点差");
  });

  it("increases whiteout risk under high low-cloud, high humidity, poor visibility, and near-calm wind", () => {
    const highWhiteout = analyzeCloudSea(
      withCloudSeaWeather(baseInput(), {
        humidity: 98,
        dewPoint: 9.8,
        cloudLow: 96,
        cloudTotal: 98,
        visibility: 1.4,
        windSpeed: 0.3,
      }),
    );
    const controlled = analyzeCloudSea(
      withCloudSeaWeather(baseInput(), {
        humidity: 88,
        dewPoint: 7,
        cloudLow: 48,
        cloudTotal: 58,
        visibility: 15,
        windSpeed: 2.8,
      }),
    );

    expect(highWhiteout.whiteoutRiskScore).toBeGreaterThan(controlled.whiteoutRiskScore);
    expect(highWhiteout.whiteoutReasons.join("")).toContain("白墙");
  });

  it("reduces travel score when whiteout risk is high", () => {
    const highWhiteout = analyzeCloudSea(
      withCloudSeaWeather(baseInput(), {
        humidity: 98,
        dewPoint: 9.8,
        cloudLow: 96,
        cloudTotal: 98,
        visibility: 1.2,
        windSpeed: 0.2,
      }),
    );
    const balanced = analyzeCloudSea(
      withCloudSeaWeather(baseInput(), {
        humidity: 94,
        dewPoint: 8.8,
        cloudLow: 52,
        cloudTotal: 62,
        visibility: 16,
        windSpeed: 2.6,
      }),
    );

    expect(highWhiteout.whiteoutRiskScore).toBeGreaterThan(balanced.whiteoutRiskScore);
    expect(highWhiteout.travelScore).toBeLessThan(balanced.travelScore);
  });

  it("raises opportunity score when surrounding terrain has strong elevation difference", () => {
    const strongTerrain = analyzeCloudSea(withCloudSeaWeather(baseInput(), {}));
    const weakTerrain = analyzeCloudSea(
      withCloudSeaWeather(
        {
          ...baseInput(),
          terrainSummary: {
            ...baseInput().terrainSummary,
            ...lowTerrainAnalysis.terrainProfile,
            ...lowTerrainAnalysis.horizonProfile,
            dataSource: lowTerrainAnalysis.dataSource,
            dataSourceLabelZh: lowTerrainAnalysis.dataSourceLabelZh,
            isMock: lowTerrainAnalysis.isMock,
            honestyNoteZh: lowTerrainAnalysis.honestyNoteZh,
          },
          terrainAnalysis: lowTerrainAnalysis,
        },
        {},
      ),
    );

    expect(strongTerrain.cloudSeaOpportunityScore).toBeGreaterThan(
      weakTerrain.cloudSeaOpportunityScore,
    );
  });

  it("creates missing data notes and lowers confidence when low cloud data is missing", () => {
    const result = analyzeCloudSea({
      ...withCloudSeaWeather(baseInput(), {
        cloudLow: null,
        cloudTotal: 64,
        missingFields: ["cloudLow"],
      }),
      weatherMissingFields: ["cloudLow"],
    });

    expect(result.missingDataNotes).toContain("当前天气源缺少低云分层数据，云海判断置信度降低。");
    expect(result.confidenceLevel).not.toBe("high");
  });

  it("creates multiple daily cloud sea entries for a 7 day horizon", () => {
    const input = withCloudSeaWeather(
      buildMockForecastInput({ ...query, horizon: "7d" }, { now: fixedNow }),
      {},
    );
    const result = analyzeCloudSea(input);

    expect(result.dailyCloudSea.length).toBeGreaterThanOrEqual(7);
    expect(result.bestCloudSeaWindows.length).toBeGreaterThanOrEqual(7);
  });

  it("does not let astro or Milky Way fields influence cloud sea travel score", () => {
    const input = withCloudSeaWeather(baseInput(), {});
    const alteredAstro = {
      ...input,
      astroSummaries: input.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 1,
        milkyWayVisibilityLevel: "poor" as const,
        milkyWayWindowStart: "2026-05-21T23:00:00+08:00",
        milkyWayWindowEnd: "2026-05-21T23:30:00+08:00",
      })),
    };

    expect(calculateForecast(input).cloudSeaAnalysis.travelScore).toBe(
      calculateForecast(alteredAstro).cloudSeaAnalysis.travelScore,
    );
  });

  it("maps travel scores to cloud sea recommendation labels", () => {
    expect(cloudSeaRecommendationLabel(90)).toBe("推荐重点关注");
    expect(cloudSeaRecommendationLabel(72)).toBe("值得等待");
    expect(cloudSeaRecommendationLabel(55)).toBe("谨慎参考");
    expect(cloudSeaRecommendationLabel(32)).toBe("不建议专程");
  });

  it("does not call external APIs while calculating cloud sea analysis", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error("external call blocked");
    }) as typeof fetch;

    try {
      const result = calculateForecast(withCloudSeaWeather(baseInput(), {}));

      expect(result.cloudSeaAnalysis.cloudSeaOpportunityScore).toBeGreaterThan(0);
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
