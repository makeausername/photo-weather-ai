import { describe, expect, it } from "vitest";
import { buildCloudSeaPrecipitationSignalContext } from "../cloud-sea-precipitation-signal.js";
import type { ProfessionalHourlyDataPoint } from "../types.js";

const focusedWindow = {
  startTime: "2026-05-20T05:00:00+08:00",
  endTime: "2026-05-20T07:00:00+08:00",
  label: "generic main window",
};

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
    temperatureBasisNoteZh: "generic terrain-adjusted temperature.",
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

function signal(rows: readonly ProfessionalHourlyDataPoint[]) {
  return buildCloudSeaPrecipitationSignalContext({
    hourlyRows: rows,
    focusedWindow,
    bestWindow: focusedWindow,
  });
}

describe("buildCloudSeaPrecipitationSignalContext", () => {
  it("keeps genericProbabilityOnlyTraceRainCase as probability-only when amount is 0mm", () => {
    const genericProbabilityOnlyTraceRainCase = signal([
      professionalRow({
        precipitationProbabilityPercent: 80,
        precipitationAmountMm: 0,
      }),
    ]);

    expect(genericProbabilityOnlyTraceRainCase.probabilityClass).toBe("very_high");
    expect(genericProbabilityOnlyTraceRainCase.amountClass).toBe("none");
    expect(genericProbabilityOnlyTraceRainCase.precipitationSignalType).toBe("probability_only");
    expect(genericProbabilityOnlyTraceRainCase.shouldAvoidStrongRainWording).toBe(true);
    expect(genericProbabilityOnlyTraceRainCase.shouldDowngradeWindow).toBe(false);
    expect(genericProbabilityOnlyTraceRainCase.riskLabelZh).toBe("局地扰动");
  });

  it("keeps genericProbabilityOnlyTraceRainCase as local disturbance when amount is trace", () => {
    const genericProbabilityOnlyTraceRainCase = signal([
      professionalRow({
        precipitationProbabilityPercent: 80,
        precipitationAmountMm: 0.1,
      }),
    ]);

    expect(genericProbabilityOnlyTraceRainCase.amountClass).toBe("trace");
    expect(genericProbabilityOnlyTraceRainCase.precipitationSignalType).toBe("light_disturbance");
    expect(genericProbabilityOnlyTraceRainCase.precipitationSignalLevel).toBe("disturbance");
    expect(genericProbabilityOnlyTraceRainCase.riskLabelZh).toBe("局地扰动");
    expect(genericProbabilityOnlyTraceRainCase.userSummaryZh).toContain("雨量很小");
  });

  it("classifies genericLightShowerNearWindowCase as short shower without strong-rain wording", () => {
    const genericLightShowerNearWindowCase = signal([
      professionalRow({
        precipitationProbabilityPercent: 70,
        precipitationAmountMm: 0.8,
      }),
    ]);

    expect(genericLightShowerNearWindowCase.amountClass).toBe("light");
    expect(genericLightShowerNearWindowCase.precipitationSignalType).toBe("short_shower");
    expect(genericLightShowerNearWindowCase.precipitationImpactLevel).toBe("medium");
    expect(genericLightShowerNearWindowCase.shouldAvoidStrongRainWording).toBe(true);
    expect(genericLightShowerNearWindowCase.riskLabelZh).toBe("短时小雨");
  });

  it("downgrades genericMeaningfulRainNearWindowCase when moderate rain overlaps", () => {
    const genericMeaningfulRainNearWindowCase = signal([
      professionalRow({
        precipitationProbabilityPercent: 70,
        precipitationAmountMm: 1.5,
      }),
    ]);

    expect(genericMeaningfulRainNearWindowCase.amountClass).toBe("moderate");
    expect(genericMeaningfulRainNearWindowCase.precipitationSignalType).toBe("meaningful_rain");
    expect(genericMeaningfulRainNearWindowCase.shouldDowngradeWindow).toBe(true);
    expect(genericMeaningfulRainNearWindowCase.riskLabelZh).toBe("降水干扰");
  });

  it("treats genericHeavyRainCase as strong when heavy rain overlaps", () => {
    const genericHeavyRainCase = signal([
      professionalRow({
        precipitationProbabilityPercent: 85,
        precipitationAmountMm: 3,
      }),
    ]);

    expect(genericHeavyRainCase.amountClass).toBe("heavy");
    expect(genericHeavyRainCase.precipitationSignalType).toBe("sustained_rain");
    expect(genericHeavyRainCase.precipitationSignalLevel).toBe("strong");
    expect(genericHeavyRainCase.precipitationImpactLevel).toBe("high");
    expect(genericHeavyRainCase.shouldDowngradeWindow).toBe(true);
  });

  it("keeps genericRainOutsideWindowCase as background risk without downgrading the window", () => {
    const genericRainOutsideWindowCase = signal([
      professionalRow({
        time: "2026-05-20T14:00:00+08:00",
        timeLabel: "14:00",
        precipitationProbabilityPercent: 85,
        precipitationAmountMm: 3,
      }),
    ]);

    expect(genericRainOutsideWindowCase.precipitationSignalType).toBe("sustained_rain");
    expect(genericRainOutsideWindowCase.affectsMainWindow).toBe(false);
    expect(genericRainOutsideWindowCase.affectsArrivalWindow).toBe(false);
    expect(genericRainOutsideWindowCase.precipitationImpactLevel).toBe("low");
    expect(genericRainOutsideWindowCase.shouldDowngradeWindow).toBe(false);
  });

  it("keeps genericMissingAmountWithProbabilityCase cautious without inventing amount", () => {
    const genericMissingAmountWithProbabilityCase = signal([
      professionalRow({
        precipitationProbabilityPercent: 78,
        precipitationAmountMm: null,
      }),
    ]);

    expect(genericMissingAmountWithProbabilityCase.amountClass).toBe("unknown");
    expect(genericMissingAmountWithProbabilityCase.precipitationSignalType).toBe(
      "probability_only",
    );
    expect(genericMissingAmountWithProbabilityCase.userSummaryZh).toContain("雨量数据不足");
    expect(genericMissingAmountWithProbabilityCase.shouldAvoidStrongRainWording).toBe(true);
  });

  it("uses amount as primary for genericAmountWithoutProbabilityCase", () => {
    const genericAmountWithoutProbabilityCase = signal([
      professionalRow({
        precipitationProbabilityPercent: null,
        precipitationAmountMm: 1.2,
      }),
    ]);

    expect(genericAmountWithoutProbabilityCase.probabilityClass).toBe("unknown");
    expect(genericAmountWithoutProbabilityCase.amountClass).toBe("moderate");
    expect(genericAmountWithoutProbabilityCase.precipitationSignalType).toBe("meaningful_rain");
    expect(genericAmountWithoutProbabilityCase.shouldDowngradeWindow).toBe(true);
  });
});
