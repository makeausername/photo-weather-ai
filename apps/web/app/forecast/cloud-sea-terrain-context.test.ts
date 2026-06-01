import { describe, expect, it } from "vitest";
import { buildCloudSeaTerrainContext } from "./cloud-sea-terrain-context";

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
    expect(context.shouldDowngradeCloudSeaWording).toBe(false);
  });

  it("treats unknown terrain as conservative low-evidence context", () => {
    const context = buildCloudSeaTerrainContext(genericUnknownTerrainSpot);

    expect(context.terrainClass).toBe("low_elevation");
    expect(context.isClassicCloudSeaEligible).toBe(false);
    expect(context.shouldDowngradeCloudSeaWording).toBe(true);
    expect(context.terrainNoteZh).toContain("地形数据不足");
  });
});
