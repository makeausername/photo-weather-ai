import { describe, expect, it } from "vitest";
import { buildCloudSeaTerrainContext } from "./cloud-sea-terrain-context";
import { buildCloudSeaRecommendationGuardForResult } from "@photo-weather/shared";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import { photographyScene } from "./photography-scene";
import { buildCloudSeaForecastViewModel } from "./forecast-result-view-model";
import {
  buildCloudSeaTerrainContextFromResult,
  cloudSeaTerrainAwareText,
} from "./cloud-sea-terrain-context";

const genericHighMountainSpot = {
  elevationMeters: 1680,
  surroundingReliefMeters: 720,
  terrainType: "summit",
  terrainConfidence: "high",
} as const;

const genericLowElevationSpot = {
  elevationMeters: 142,
  surroundingReliefMeters: 80,
  terrainType: "city",
  terrainConfidence: "medium",
} as const;

const genericHillSpot = {
  elevationMeters: 620,
  surroundingReliefMeters: 260,
  terrainType: "slope",
  terrainConfidence: "medium",
} as const;

const genericUnknownTerrainSpot = {
  elevationMeters: null,
  surroundingReliefMeters: null,
  terrainType: "unknown",
  terrainConfidence: "low",
} as const;

describe("buildCloudSeaTerrainContext", () => {
  it("labels viewpoint relief separately from regional maximum minus minimum", () => {
    const base = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result;
    const result = {
      ...base,
      terrainAnalysis: {
        ...base.terrainAnalysis,
        terrainProfile: {
          ...base.terrainAnalysis.terrainProfile,
          elevationMeters: 9,
          locationElevation: 9,
          localReliefMeters: 9.9,
          nearbyValleyElevationMeters: -0.9,
          elevationDiff5km: 471.9,
          minElevation5km: -0.9,
          maxElevation5km: 471,
        },
      },
    };
    const context = buildCloudSeaTerrainContextFromResult(result);
    expect(context.terrainNoteZh).toContain("机位高出周边低地约 10");
    expect(context.terrainNoteZh).not.toContain("周边5公里高差约 10");
    expect(context.isClassicCloudSeaEligible).toBe(false);
    const rangeOnly = buildCloudSeaTerrainContext({ elevationMeters: 800, elevationDiff5km: 1500 });
    expect(rangeOnly.surroundingReliefMeters).toBeUndefined();
    expect(rangeOnly.isClassicCloudSeaEligible).toBe(false);
  });
  it.each([3041, 3433, 3723])(
    "keeps high unknown terrain consistent through both pages and the recommendation guard: %i m",
    (elevationMeters) => {
      const base = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result;
      const result = {
        ...base,
        terrainAnalysis: {
          ...base.terrainAnalysis,
          isMock: false,
          terrainProfile: {
            ...base.terrainAnalysis.terrainProfile,
            elevationMeters,
            locationElevation: elevationMeters,
            terrainType: "unknown" as const,
            localReliefMeters: null,
            elevationDiff5km: null,
            nearbyValleyElevationMeters: null,
          },
        },
      };
      const context = buildCloudSeaTerrainContextFromResult(result);
      expect(photographyScene(result).subject).toBe("云雾");
      expect(context.vocabulary.subjectLabel).toBe("云雾");
      expect(context.isClassicCloudSeaEligible).toBe(false);
      expect(context.terrainClass).toBe("high_mountain");
      expect(context.terrainNoteZh).toContain("机位相对低地高差待确认");
      const view = buildCloudSeaForecastViewModel(result);
      for (const copy of [
        view.recommendationExplanation,
        view.recommendationGuard,
        view.displayData.recommendationCards,
        view.displayData.currentNearTermWeather,
      ]) {
        expect(JSON.stringify(copy)).not.toContain("晨雾");
      }
      expect(cloudSeaTerrainAwareText("清晨云海形成，山顶云海可拍", context)).not.toMatch(
        /云海|晨雾/,
      );
      expect(
        buildCloudSeaRecommendationGuardForResult(result, {
          cloudSeaScore: 95,
          shootabilityScore: 95,
          proposedRecommendationLabel: "强推荐专程",
        }).isSpecialTripRecommended,
      ).toBe(false);
    },
  );
  it("uses elevation, relief, and terrain type for classic mountain eligibility", () => {
    const context = buildCloudSeaTerrainContext(genericHighMountainSpot);

    expect(context.terrainClass).toBe("high_mountain");
    expect(context.isClassicCloudSeaEligible).toBe(true);
    expect(context.shouldDowngradeCloudSeaWording).toBe(false);
    expect(context.windowCategoryLabels).toEqual({
      sunrise: "日出云海",
      sunset: "日落云海",
      daylight: "有光云海",
      noLight: "无光云海",
    });
    expect(context.recommendationCeiling).toBe("classic_cloud_sea");
  });

  it("downgrades low-elevation low-relief locations without using names", () => {
    const context = buildCloudSeaTerrainContext(genericLowElevationSpot);

    expect(context.terrainClass).toBe("low_elevation");
    expect(context.isClassicCloudSeaEligible).toBe(false);
    expect(context.shouldDowngradeCloudSeaWording).toBe(true);
    expect(context.windowCategoryLabels).toEqual({
      sunrise: "日出低云 / 晨雾",
      sunset: "日落层云",
      daylight: "有光云层",
      noLight: "夜间低云 / 雾气",
    });
    expect(context.forbiddenStrongRecommendation).toBe(true);
    expect(context.recommendationCeiling).toBe("recommend_observation");
  });

  it("keeps hill terrain distinct from high mountain and lowland fixtures", () => {
    const context = buildCloudSeaTerrainContext(genericHillSpot);

    expect(context.terrainClass).toBe("hill");
    expect(context.isClassicCloudSeaEligible).toBe(false);
    expect(context.shouldDowngradeCloudSeaWording).toBe(true);
    expect(context.vocabulary.subjectLabel).toBe("云雾");
  });

  it("treats unknown terrain as conservative low-evidence context", () => {
    const context = buildCloudSeaTerrainContext(genericUnknownTerrainSpot);

    expect(context.terrainClass).toBe("low_elevation");
    expect(context.isClassicCloudSeaEligible).toBe(false);
    expect(context.shouldDowngradeCloudSeaWording).toBe(true);
    expect(context.terrainNoteZh).toContain("地形数据不足");
  });
});
