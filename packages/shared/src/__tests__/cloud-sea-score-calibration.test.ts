import { describe, expect, it } from "vitest";
import { buildCloudLayerCompletenessContext } from "../cloud-layer-completeness.js";
import { buildCloudSeaPrecipitationSignalContext } from "../cloud-sea-precipitation-signal.js";
import {
  buildCloudSeaScoreCalibrationContext,
  type CloudSeaScoreCalibrationHourlyRow,
  type CloudSeaScoreCalibrationInput,
} from "../cloud-sea-score-calibration.js";
import type { ForecastMultiSourceAgreementContext } from "../types.js";

const focusedWindow = {
  startTime: "2026-06-05T05:00:00+08:00",
  endTime: "2026-06-05T07:00:00+08:00",
  label: "generic cloud sea window",
};

function row(
  overrides: Partial<CloudSeaScoreCalibrationHourlyRow> = {},
): CloudSeaScoreCalibrationHourlyRow {
  return {
    time: focusedWindow.startTime,
    cloudTotalPercent: 86,
    cloudHighPercent: 28,
    cloudMidPercent: 35,
    cloudLowPercent: 68,
    visibilityMeters: 12000,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 10,
    cloudLayerBasis: "explicit_layers",
    ...overrides,
  };
}

function precipitationSignal(rows: readonly CloudSeaScoreCalibrationHourlyRow[]) {
  return buildCloudSeaPrecipitationSignalContext({
    hourlyRows: rows,
    focusedWindow,
    bestWindow: focusedWindow,
  });
}

function calibration(
  rows: readonly CloudSeaScoreCalibrationHourlyRow[],
  overrides: Partial<CloudSeaScoreCalibrationInput> = {},
) {
  return buildCloudSeaScoreCalibrationContext({
    rawFormationScore: 92,
    rawShootabilityScore: 91,
    formationScore: 92,
    shootabilityScore: 91,
    rawCloudSeaScore: 91,
    whiteoutRiskScore: 42,
    confidenceScore: 82,
    confidenceLevel: "high",
    cloudWindowRows: rows,
    normalizedHourlyRows: rows,
    bestWindow: focusedWindow,
    cloudLayerCoverageContext: buildCloudLayerCompletenessContext(rows),
    precipitationSignalContext: precipitationSignal(rows),
    terrainContext: {
      score: 86,
      terrainMode: "high_mountain",
      terrainType: "summit",
      confidence: "high",
    },
    ...overrides,
  });
}

function sourceDisagreement(): ForecastMultiSourceAgreementContext {
  return {
    agreementLevel: "low",
    disagreementLevel: "medium",
    fieldDisagreements: [],
    keyWarningsZh: ["多源低云或降水判断存在分歧。"],
    userSummaryZh: "多源判断存在分歧。",
    professionalSummaryZh: "Generic multi-source disagreement.",
    shouldLowerConfidence: true,
    shouldShowReviewWarning: true,
  };
}

describe("buildCloudSeaScoreCalibrationContext", () => {
  it("caps high-cloud-only windows instead of treating high cloud as cloud sea support", () => {
    const result = calibration([
      row({ cloudTotalPercent: 94, cloudHighPercent: 92, cloudMidPercent: 18, cloudLowPercent: 12 }),
      row({ cloudTotalPercent: 91, cloudHighPercent: 88, cloudMidPercent: 16, cloudLowPercent: 15 }),
    ]);

    expect(result.calibratedFormationScore).toBeLessThanOrEqual(52);
    expect(result.finalCloudSeaScore).toBeLessThanOrEqual(58);
    expect(result.capApplied).toBe(true);
    expect(result.capReasons.join(" ")).toContain("高云");
    expect(result.shouldBlockStrongRecommendation).toBe(true);
  });

  it("caps mid-cloud-only windows as texture/reference instead of boosting formation", () => {
    const result = calibration([
      row({ cloudTotalPercent: 90, cloudHighPercent: 24, cloudMidPercent: 88, cloudLowPercent: 18 }),
      row({ cloudTotalPercent: 93, cloudHighPercent: 20, cloudMidPercent: 90, cloudLowPercent: 14 }),
    ]);

    expect(result.calibratedFormationScore).toBeLessThanOrEqual(56);
    expect(result.finalCloudSeaScore).toBeLessThanOrEqual(60);
    expect(result.capReasons.join(" ")).toContain("中云");
  });

  it("caps thick multilayer overcast with precipitation, whiteout, and poor visibility", () => {
    const rows = [
      row({
        cloudTotalPercent: 98,
        cloudHighPercent: 90,
        cloudMidPercent: 86,
        cloudLowPercent: 82,
        visibilityMeters: 2400,
        precipitationAmountMm: 1.4,
        precipitationProbabilityPercent: 72,
      }),
      row({
        cloudTotalPercent: 96,
        cloudHighPercent: 88,
        cloudMidPercent: 84,
        cloudLowPercent: 78,
        visibilityMeters: 2600,
        precipitationAmountMm: 1.1,
        precipitationProbabilityPercent: 68,
      }),
    ];
    const result = calibration(rows, { whiteoutRiskScore: 66 });

    expect(result.finalCloudSeaScore).toBeLessThanOrEqual(70);
    expect(result.shouldDowngradeToCautious || result.shouldDowngradeToBackup).toBe(true);
    expect(result.capReasons.join(" ")).toContain("厚实多层云");
    expect(result.capReasons.join(" ")).toContain("降水");
    expect(result.capReasons.join(" ")).toContain("能见度");
  });

  it("lowers confidence when layer data is missing and sources disagree", () => {
    const rows = [
      row({
        cloudTotalPercent: 92,
        cloudHighPercent: null,
        cloudMidPercent: null,
        cloudLowPercent: null,
        cloudLayerBasis: "total_only",
      }),
    ];
    const result = calibration(rows, {
      multiSourceAgreementContext: sourceDisagreement(),
    });

    expect(result.finalCloudSeaScore).toBeLessThanOrEqual(70);
    expect(result.confidenceLevel).toBe("low");
    expect(result.capReasons.join(" ")).toContain("云层分层缺失");
    expect(result.capReasons.join(" ")).toContain("多源");
  });

  it("is field-driven and stable across arbitrary dates for the same weather inputs", () => {
    const first = calibration([
      row({ time: "2026-06-05T05:00:00+08:00" }),
      row({ time: "2026-06-05T06:00:00+08:00" }),
    ]);
    const second = calibration(
      [
        row({ time: "2031-01-15T05:00:00+08:00" }),
        row({ time: "2031-01-15T06:00:00+08:00" }),
      ],
      {
        bestWindow: {
          startTime: "2031-01-15T05:00:00+08:00",
          endTime: "2031-01-15T07:00:00+08:00",
          label: "generic shifted window",
        },
      },
    );

    expect(second.finalCloudSeaScore).toBe(first.finalCloudSeaScore);
    expect(second.capReasons).toEqual(first.capReasons);
    expect(second.recommendationExplanationZh).toBe(first.recommendationExplanationZh);
  });
});
