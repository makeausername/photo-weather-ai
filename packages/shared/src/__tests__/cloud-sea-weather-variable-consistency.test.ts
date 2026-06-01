import { describe, expect, it } from "vitest";
import { buildCloudLayerCompletenessContext } from "../cloud-layer-completeness.js";
import {
  buildCloudSeaWeatherVariableConsistencyContext,
  type CloudSeaWeatherVariableConsistencyInput,
} from "../cloud-sea-weather-variable-consistency.js";
import type { ProfessionalHourlyDataPoint } from "../types.js";

const genericHighMountainSpot = {
  elevationMeters: 1680,
  surroundingReliefMeters: 720,
  terrainMode: "high_mountain",
  terrainType: "summit",
} as const;

const genericLowElevationSpot = {
  elevationMeters: 160,
  surroundingReliefMeters: 80,
  terrainMode: "urban_or_plain",
  terrainType: "city",
} as const;

function guard(input: CloudSeaWeatherVariableConsistencyInput) {
  return buildCloudSeaWeatherVariableConsistencyContext(input);
}

function professionalRow(
  overrides: Partial<ProfessionalHourlyDataPoint> = {},
): ProfessionalHourlyDataPoint {
  return {
    time: "2026-05-20T05:00:00+08:00",
    dateLabel: "5月20日",
    timeLabel: "05:00",
    weatherCode: null,
    weatherText: null,
    cloudSeaSignal: "可拍窗口",
    cloudSeaSignalLevel: "positive",
    cloudTotalPercent: 82,
    cloudHighPercent: 24,
    cloudMidPercent: 34,
    cloudLowPercent: 68,
    cloudLayerBasis: "explicit_layers",
    rawTemperatureC: 12,
    terrainAdjustedTemperatureC: 10,
    displayedTemperatureC: 10,
    temperatureBasis: "terrain_adjusted",
    temperatureAdjustmentC: -2,
    temperatureBasisNoteZh: "机位海拔修正温度。",
    dewPointC: 8,
    dewPointSpreadC: 2,
    relativeHumidityPercent: 92,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 12,
    visibilityMeters: 12000,
    windSpeedMs: 2.2,
    windDirectionDeg: 120,
    missingFields: [],
    notesZh: [],
    ...overrides,
  };
}

describe("buildCloudSeaWeatherVariableConsistencyContext", () => {
  it("flags generic high mountain raw-grid temperature when terrain-adjusted temperature differs greatly", () => {
    const context = guard({
      ...genericHighMountainSpot,
      hourlyRows: [
        professionalRow({
          rawTemperatureC: 29,
          terrainAdjustedTemperatureC: 20,
          displayedTemperatureC: 29,
          temperatureBasis: "raw_grid",
        }),
      ],
    });

    expect(context.temperatureBasisStatus).toBe("mixed");
    expect(context.consistencyLevel).toBe("conflict");
    expect(context.shouldPreferTerrainAdjustedTemperature).toBe(true);
    expect(context.warnings.map((warning) => warning.key)).toContain("terrain_temperature_delta");
    expect(context.warningsZh.join(" ")).toContain("机位估算温度");
  });

  it("treats generic humidity and dew point spread mismatch as a conflict", () => {
    const genericHumidityConflictCase = guard({
      ...genericLowElevationSpot,
      hourlyRows: [
        professionalRow({
          relativeHumidityPercent: 100,
          dewPointSpreadC: 7,
        }),
      ],
    });

    expect(genericHumidityConflictCase.humidityDewPointStatus).toBe("conflict");
    expect(genericHumidityConflictCase.consistencyLevel).toBe("conflict");
    expect(genericHumidityConflictCase.shouldAvoidStrongWording).toBe(true);
    expect(genericHumidityConflictCase.warningsZh.join(" ")).toContain("湿度与露点差");
  });

  it("separates generic high precipitation probability from near-zero amount", () => {
    const genericPrecipProbabilityOnlyCase = guard({
      ...genericHighMountainSpot,
      hourlyRows: [
        professionalRow({
          precipitationProbabilityPercent: 78,
          precipitationAmountMm: 0,
        }),
      ],
    });

    expect(genericPrecipProbabilityOnlyCase.precipitationSignalStatus).toBe("probability_only");
    expect(genericPrecipProbabilityOnlyCase.consistencyLevel).toBe("watch");
    expect(genericPrecipProbabilityOnlyCase.shouldDowngradePrecipitationWording).toBe(true);
    expect(genericPrecipProbabilityOnlyCase.warningsZh.join(" ")).toContain("不宜直接按强降水处理");
  });

  it("classifies generic measurable precipitation amount as meaningful precipitation", () => {
    const genericMeaningfulPrecipitationCase = guard({
      ...genericHighMountainSpot,
      hourlyRows: [
        professionalRow({
          precipitationProbabilityPercent: 72,
          precipitationAmountMm: 1.4,
        }),
      ],
    });

    expect(genericMeaningfulPrecipitationCase.precipitationSignalStatus).toBe(
      "meaningful_precipitation",
    );
    expect(genericMeaningfulPrecipitationCase.shouldDowngradePrecipitationWording).toBe(false);
  });

  it("does not make good visibility and high humidity a strong whiteout conflict by itself", () => {
    const context = guard({
      ...genericHighMountainSpot,
      hourlyRows: [
        professionalRow({
          relativeHumidityPercent: 98,
          dewPointSpreadC: 1.2,
          visibilityMeters: 16000,
          cloudLowPercent: null,
          missingFields: ["cloudLow"],
        }),
      ],
    });

    expect(context.visibilityStatus).toBe("good");
    expect(context.consistencyLevel).not.toBe("conflict");
    expect(context.warningsZh.join(" ")).toContain("不宜仅凭湿度放大白墙风险");
  });

  it("adds a professional note for generic mixed cloud basis", () => {
    const genericMixedCloudBasisCase = guard({
      ...genericHighMountainSpot,
      hourlyRows: [
        professionalRow({
          cloudTotalPercent: 35,
          cloudHighPercent: 70,
          cloudMidPercent: 24,
          cloudLowPercent: 18,
          cloudLayerBasis: "explicit_layers",
        }),
      ],
      cloudLayerCompletenessContext: buildCloudLayerCompletenessContext([
        {
          cloudTotalPercent: 35,
          cloudHighPercent: 70,
          cloudMidPercent: 24,
          cloudLowPercent: 18,
          cloudLayerBasis: "explicit_layers",
        },
      ]),
    });

    expect(genericMixedCloudBasisCase.cloudBasisStatus).toBe("mixed_basis");
    expect(genericMixedCloudBasisCase.warningsZh.join(" ")).toContain("总云量与分层云量");
  });

  it("keeps generic missing cloud layer values as missing instead of treating them as zero", () => {
    const context = guard({
      ...genericHighMountainSpot,
      hourlyRows: [
        professionalRow({
          cloudTotalPercent: 88,
          cloudHighPercent: null,
          cloudMidPercent: null,
          cloudLowPercent: null,
          cloudLayerBasis: "total_only",
          missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
        }),
      ],
      cloudLayerCompletenessContext: buildCloudLayerCompletenessContext([
        {
          cloudTotalPercent: 88,
          cloudHighPercent: null,
          cloudMidPercent: null,
          cloudLowPercent: null,
          cloudLayerBasis: "total_only",
          missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
        },
      ]),
    });

    expect(context.cloudBasisStatus).toBe("total_only");
    expect(context.warningsZh.join(" ")).toContain("不使用总云量回填");
    expect(context.professionalSummaryZh).not.toContain("低云 0");
  });
});
