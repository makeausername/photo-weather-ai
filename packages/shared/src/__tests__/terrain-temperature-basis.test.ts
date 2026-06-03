import { describe, expect, it } from "vitest";
import {
  DEFAULT_MOUNTAIN_LAPSE_RATE_C_PER_KM,
  buildTerrainTemperatureBasisContext,
} from "../terrain-temperature-basis.js";

const genericHighMountainWarmGridCoolCameraCase = {
  rawGridTemperatureC: 29,
  terrainAdjustedTemperatureC: 20,
  displayedTemperatureC: 29,
  elevationMeters: 1600,
  surroundingReliefMeters: 720,
  terrainType: "summit",
  terrainMode: "high_mountain",
  windSpeedMs: 5,
  humidityPercent: 88,
  forecastHour: 5,
} as const;

const genericHighMountainNoAdjustedTemperatureCase = {
  rawGridTemperatureC: 26,
  displayedTemperatureC: 26,
  elevationMeters: 1500,
  surroundingReliefMeters: 640,
  terrainType: "ridge",
  terrainMode: "high_mountain",
} as const;

const genericLowElevationNoMountainCorrectionCase = {
  rawGridTemperatureC: 29,
  displayedTemperatureC: 29,
  elevationMeters: 160,
  surroundingReliefMeters: 80,
  terrainType: "city",
  terrainMode: "urban_or_plain",
} as const;

const genericLargeTemperatureDifferenceCase = {
  ...genericHighMountainWarmGridCoolCameraCase,
  rawGridTemperatureC: 31,
  terrainAdjustedTemperatureC: 22,
} as const;

const genericExactTerrainAdjustedCase = {
  rawGridTemperatureC: 18,
  terrainAdjustedTemperatureC: 18,
  displayedTemperatureC: 18,
  elevationMeters: 860,
  terrainType: "mountain_platform",
} as const;

describe("buildTerrainTemperatureBasisContext", () => {
  it("uses terrain-adjusted temperature for a generic high mountain when it is available", () => {
    const context = buildTerrainTemperatureBasisContext(
      genericHighMountainWarmGridCoolCameraCase,
    );

    expect(context.isHighMountainTemperatureSensitive).toBe(true);
    expect(context.shouldPreferTerrainAdjustedTemperature).toBe(true);
    expect(context.displayTemperatureC).toBe(20);
    expect(context.temperatureBasis).toBe("mixed");
    expect(context.professionalNoteZh).toContain("机位估算温度");
  });

  it("marks a generic high mountain warm-grid cool-camera case as a large difference", () => {
    const context = buildTerrainTemperatureBasisContext(genericLargeTemperatureDifferenceCase);

    expect(context.differenceLevel).toBe("large");
    expect(context.temperatureDifferenceC).toBe(9);
    expect(context.userNoteZh).toContain("差异较大");
    expect(context.clothingAdviceModifierZh).toContain("高山体感可能低于城市");
  });

  it("does not invent an adjusted value when a generic high mountain lacks model elevation", () => {
    const context = buildTerrainTemperatureBasisContext(
      genericHighMountainNoAdjustedTemperatureCase,
    );

    expect(context.temperatureBasis).toBe("raw_grid");
    expect(context.displayTemperatureC).toBe(26);
    expect(context.terrainAdjustedTemperatureC).toBeNull();
    expect(context.confidenceLevel).toBe("low");
    expect(context.userNoteZh).toContain("仅有原始格点温度");
  });

  it("does not force a generic low-elevation place into mountain correction", () => {
    const context = buildTerrainTemperatureBasisContext(
      genericLowElevationNoMountainCorrectionCase,
    );

    expect(context.isHighMountainTemperatureSensitive).toBe(false);
    expect(context.shouldPreferTerrainAdjustedTemperature).toBe(false);
    expect(context.displayTemperatureC).toBe(29);
    expect(context.shouldShowTemperatureBasisNote).toBe(false);
  });

  it("accepts a generic exact terrain-adjusted value without inflating the difference", () => {
    const context = buildTerrainTemperatureBasisContext(genericExactTerrainAdjustedCase);

    expect(context.temperatureBasis).toBe("terrain_adjusted");
    expect(context.differenceLevel).toBe("none");
    expect(context.displayTemperatureC).toBe(18);
    expect(context.confidenceLevel).toBe("high");
  });

  it("uses deterministic lapse-rate fallback only when model and location elevations exist", () => {
    const context = buildTerrainTemperatureBasisContext({
      ...genericHighMountainNoAdjustedTemperatureCase,
      rawGridTemperatureC: 24,
      modelElevationMeters: 700,
      elevationMeters: 1700,
    });

    expect(context.temperatureBasis).toBe("terrain_adjusted_lapse_estimate");
    expect(context.displayTemperatureC).toBe(17.5);
    expect(context.terrainAdjustedTemperatureC).toBe(17.5);
    expect(context.lapseRateCPerKm).toBe(DEFAULT_MOUNTAIN_LAPSE_RATE_C_PER_KM);
    expect(context.professionalNoteZh).toContain("递减率");
  });

  it("does not apply lapse fallback when the model elevation is too close or higher", () => {
    const closeElevation = buildTerrainTemperatureBasisContext({
      ...genericHighMountainNoAdjustedTemperatureCase,
      rawGridTemperatureC: 24,
      modelElevationMeters: 1570,
      elevationMeters: 1700,
    });
    const higherModel = buildTerrainTemperatureBasisContext({
      ...genericHighMountainNoAdjustedTemperatureCase,
      rawGridTemperatureC: 24,
      modelElevationMeters: 1800,
      elevationMeters: 1700,
    });

    expect(closeElevation.temperatureBasis).toBe("raw_grid");
    expect(closeElevation.terrainAdjustedTemperatureC).toBeNull();
    expect(higherModel.temperatureBasis).toBe("raw_grid");
    expect(higherModel.terrainAdjustedTemperatureC).toBeNull();
  });
});
