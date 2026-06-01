import { describe, expect, it } from "vitest";
import { buildCloudLayerCompletenessContext } from "../cloud-layer-completeness.js";
import { buildCloudSeaCloudBasisConsistencyContext } from "../cloud-sea-cloud-basis-consistency.js";
import {
  buildCloudSeaRecommendationGuard,
  type CloudSeaRecommendationGuardInput,
} from "../cloud-sea-recommendation-guard.js";
import { buildCloudSeaWeatherVariableConsistencyContext } from "../cloud-sea-weather-variable-consistency.js";
import type { ProfessionalHourlyDataPoint } from "../types.js";

describe("Cloud Sea final regression helper layer", () => {
  it("keeps missing layer data missing and blocks total-cloud fallback recommendations", () => {
    const rows = [
      row({
        cloudTotalPercent: 88,
        cloudHighPercent: null,
        cloudMidPercent: null,
        cloudLowPercent: null,
        cloudLayerBasis: "total_only",
        missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
      }),
    ];
    const completeness = buildCloudLayerCompletenessContext(rows);
    const basis = buildCloudSeaCloudBasisConsistencyContext({
      hourlyRows: rows,
      cloudLayerCompletenessContext: completeness,
    });
    const guard = buildCloudSeaRecommendationGuard(
      guardInput({
        cloudLayerCompletenessContext: completeness,
        cloudBasisConsistencyContext: basis,
        lowCloudSignalSupported: false,
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(completeness.cloudLayerBasis).toBe("total_only");
    expect(completeness.hasLowCloudLayer).toBe(false);
    expect(basis.cloudBasisLevel).toBe("total_only");
    expect(guard.finalRecommendationLevel).toBe("cautious_reference");
    expect(guard.isSpecialTripRecommended).toBe(false);
  });

  it("detects cloud-basis mismatch without normalizing raw professional values", () => {
    const rows = [
      row({
        cloudTotalPercent: 20,
        cloudLowPercent: 70,
        cloudMidPercent: 24,
        cloudHighPercent: 18,
      }),
    ];
    const basis = buildCloudSeaCloudBasisConsistencyContext(rows);
    const guard = buildCloudSeaRecommendationGuard(
      guardInput({
        cloudBasisConsistencyContext: basis,
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(rows[0]?.cloudTotalPercent).toBe(20);
    expect(rows[0]?.cloudLowPercent).toBe(70);
    expect(basis.cloudBasisLevel).toBe("mixed_basis");
    expect(basis.mismatchFields).toEqual(["low"]);
    expect(guard.finalRecommendationLevel).toBe("cautious_reference");
  });

  it("separates probability-only precipitation from meaningful precipitation", () => {
    const probabilityOnly = buildCloudSeaWeatherVariableConsistencyContext({
      hourlyRows: [
        row({
          precipitationProbabilityPercent: 82,
          precipitationAmountMm: 0,
        }),
      ],
    });
    const meaningful = buildCloudSeaWeatherVariableConsistencyContext({
      hourlyRows: [
        row({
          precipitationProbabilityPercent: 76,
          precipitationAmountMm: 1.4,
        }),
      ],
    });

    expect(probabilityOnly.precipitationSignalStatus).toBe("probability_only");
    expect(probabilityOnly.shouldDowngradePrecipitationWording).toBe(true);
    expect(meaningful.precipitationSignalStatus).toBe("meaningful_precipitation");
    expect(meaningful.shouldDowngradePrecipitationWording).toBe(false);
  });

  it("caps humidity/dew-point conflicts and low-score contradictions", () => {
    const weatherConflict = buildCloudSeaWeatherVariableConsistencyContext({
      hourlyRows: [
        row({
          relativeHumidityPercent: 96,
          dewPointSpreadC: 7,
          visibilityMeters: 15000,
        }),
      ],
    });
    const conflictGuard = buildCloudSeaRecommendationGuard(
      guardInput({
        weatherVariableConsistencyContext: weatherConflict,
        proposedRecommendationLabel: "强推荐专程",
      }),
    );
    const lowScoreGuard = buildCloudSeaRecommendationGuard(
      guardInput({
        cloudSeaScore: 32,
        shootabilityScore: 32,
        formationScore: 34,
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(weatherConflict.humidityDewPointStatus).toBe("conflict");
    expect(conflictGuard.finalRecommendationLevel).toBe("cautious_reference");
    expect(lowScoreGuard.finalRecommendationLevel).toBe("do_not_go_special");
    expect(lowScoreGuard.finalRecommendationLabel).toBe("不建议专程");
  });
});

function guardInput(
  overrides: Partial<CloudSeaRecommendationGuardInput> = {},
): CloudSeaRecommendationGuardInput {
  return {
    cloudSeaScore: 84,
    shootabilityScore: 82,
    formationScore: 86,
    whiteoutRiskScore: 24,
    proposedRecommendationLabel: "推荐重点关注",
    terrainContext: {
      shouldDowngradeCloudSeaWording: false,
      isClassicCloudSeaEligible: true,
      terrainClass: "high_mountain",
    },
    cloudLayerCompletenessContext: buildCloudLayerCompletenessContext([row()]),
    bestWindow: {
      label: "清晨云海窗口 05:00 - 07:00",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
    },
    hasWindow: true,
    risks: [],
    lowCloudSignalSupported: true,
    mainTargetZh: "清晨云海",
    bestWindowLabelZh: "清晨云海窗口 05:00 - 07:00",
    ...overrides,
  };
}

function row(overrides: Partial<ProfessionalHourlyDataPoint> = {}): ProfessionalHourlyDataPoint {
  return {
    time: "2026-05-20T05:00:00+08:00",
    dateLabel: "5月20日",
    timeLabel: "05:00",
    weatherCode: "cloudy",
    weatherText: "多云",
    cloudSeaSignal: "可拍窗口",
    cloudSeaSignalLevel: "positive",
    cloudTotalPercent: 86,
    cloudHighPercent: 24,
    cloudMidPercent: 32,
    cloudLowPercent: 68,
    cloudLayerBasis: "explicit_layers",
    rawTemperatureC: 12,
    terrainAdjustedTemperatureC: 9,
    displayedTemperatureC: 9,
    temperatureBasis: "terrain_adjusted",
    temperatureAdjustmentC: -3,
    temperatureBasisNoteZh: "按机位海拔修正温度。",
    dewPointC: 7,
    dewPointSpreadC: 2,
    relativeHumidityPercent: 92,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 12,
    visibilityMeters: 14000,
    windSpeedMs: 2.6,
    windDirectionDeg: 120,
    missingFields: [],
    notesZh: [],
    ...overrides,
  };
}
