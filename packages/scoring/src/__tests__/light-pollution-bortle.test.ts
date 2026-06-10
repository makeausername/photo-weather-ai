import { describe, expect, it } from "vitest";
import type { DirectionalLightPollutionRisk, LightPollutionInfo } from "@photo-weather/shared";
import {
  estimateBortleRangeForLightPollution,
  estimateBortleRangeFromAmbientRiskIndex,
  estimatedBortleDisclaimerZh,
  estimatedBortleMethodVersion,
} from "../light-pollution-bortle.js";

const directionalRiskFixture: readonly DirectionalLightPollutionRisk[] = [
  directionRisk("north", "北", 0, 4),
  directionRisk("northeast", "东北", 45, 8),
  directionRisk("east", "东", 90, 12),
  directionRisk("southeast", "东南", 135, 18),
  directionRisk("south", "南", 180, 22),
  directionRisk("southwest", "西南", 225, 26),
  directionRisk("west", "西", 270, 30),
  directionRisk("northwest", "西北", 315, 34),
];

function directionRisk(
  direction: DirectionalLightPollutionRisk["direction"],
  label: string,
  azimuthDegrees: number,
  riskIndex: number,
): DirectionalLightPollutionRisk {
  return {
    direction,
    directionLabelZh: label,
    azimuthDegrees,
    riskIndex,
    riskLevel: riskIndex < 20 ? "very_low" : "low",
    riskLevelLabelZh: riskIndex < 20 ? "极低" : "低",
    sampleCount: 12,
    validSampleCount: 12,
  };
}

function lightPollutionFixture(overrides: Partial<LightPollutionInfo> = {}): LightPollutionInfo {
  return {
    available: true,
    dataAvailable: true,
    sourceCode: "eog_viirs",
    sourceLabel: "EOG VIIRS",
    datasetYear: 2026,
    datasetVersion: "test",
    localRadiance: 0.12,
    surroundingHaloRadiance: 0.3,
    ambientRiskIndex: 20,
    ambientRiskLevel: "low",
    ambientRiskLevelLabelZh: "低",
    directionalRisk: directionalRiskFixture,
    targetAzimuthDegrees: 135,
    targetDirectionRisk: 18,
    targetDirectionLevel: "very_low",
    targetDirectionLevelLabelZh: "极低",
    confidence: "high",
    sampleCount: 96,
    validSampleCount: 96,
    calculationBasis: {
      samplingConfigVersion: "satellite-night-light-v1",
      coordinateSystem: "WGS84",
      distancesKm: [5, 15, 30, 60],
      distanceWeights: { local: 0.45, "5km": 0.22, "15km": 0.16, "30km": 0.11, "60km": 0.06 },
      localNeighborhoodKm: [0, 0.5, 1.5],
      directionSectorsDegrees: 45,
      quantileBasis: "adaptive_positive_log_radiance_quantiles",
      scoringMode: "heuristic",
      nonSqmBortleNoticeZh: "该结果为卫星夜光参考，不是现场SQM实测，也不代表测量Bortle等级。",
    },
    lightPollutionNoteZh: "卫星夜光参考：环境光污染低。",
    starPenalty: 4,
    milkyWayPenalty: 7,
    scoringMode: "heuristic",
    ...overrides,
  };
}

describe("estimated Bortle range", () => {
  it.each([
    [-1, "1–2级", 1, 2],
    [0, "1–2级", 1, 2],
    [14, "1–2级", 1, 2],
    [15, "2–3级", 2, 3],
    [29, "2–3级", 2, 3],
    [30, "3–4级", 3, 4],
    [44, "3–4级", 3, 4],
    [45, "4–5级", 4, 5],
    [59, "4–5级", 4, 5],
    [60, "5–6级", 5, 6],
    [72, "5–6级", 5, 6],
    [73, "6–7级", 6, 7],
    [84, "6–7级", 6, 7],
    [85, "7–8级", 7, 8],
    [94, "7–8级", 7, 8],
    [95, "8–9级", 8, 9],
    [100, "8–9级", 8, 9],
    [120, "8–9级", 8, 9],
  ] as const)(
    "maps ambient risk %s to %s without leaving the Bortle 1-9 range",
    (ambientRiskIndex, rangeLabelZh, minClass, maxClass) => {
      const range = estimateBortleRangeFromAmbientRiskIndex(ambientRiskIndex);

      expect(range).toMatchObject({
        available: true,
        rangeLabelZh,
        minClass,
        maxClass,
        methodVersion: estimatedBortleMethodVersion,
        disclaimerZh: estimatedBortleDisclaimerZh,
      });
      expect(range.minClass).toBeGreaterThanOrEqual(1);
      expect(range.maxClass).toBeLessThanOrEqual(9);
    },
  );

  it.each([
    ["undefined ambient risk", { ambientRiskIndex: undefined }],
    ["null ambient risk", { ambientRiskIndex: null }],
    ["NaN ambient risk", { ambientRiskIndex: Number.NaN }],
    ["Infinity ambient risk", { ambientRiskIndex: Number.POSITIVE_INFINITY }],
    ["data unavailable", { dataAvailable: false }],
    [
      "insufficient ambient risk level",
      { ambientRiskLevel: "insufficient", ambientRiskLevelLabelZh: "数据不足" },
    ],
  ] as const)("returns an honest unavailable estimate for %s", (_, overrides) => {
    const range = estimateBortleRangeForLightPollution(lightPollutionFixture(overrides));

    expect(range).toMatchObject({
      available: false,
      rangeLabelZh: "波特尔估算暂不可用",
      skyQualityLabelZh: "数据不足",
      confidence: "low",
      basisZh: "当前缺少可靠的环境光污染标定，不能推断波特尔等级范围。",
    });
    expect(range.rangeLabelZh).not.toBe("1–2级");
  });

  it("caps complete calibrated results at medium confidence", () => {
    const range = estimateBortleRangeForLightPollution(
      lightPollutionFixture({ confidence: "high" }),
    );

    expect(range.available).toBe(true);
    expect(range.confidence).toBe("medium");
  });

  it("uses low confidence when directional information is incomplete", () => {
    const range = estimateBortleRangeForLightPollution(
      lightPollutionFixture({
        directionalRisk: directionalRiskFixture.slice(0, 2),
        targetDirectionRisk: null,
      }),
    );

    expect(range.available).toBe(true);
    expect(range.confidence).toBe("low");
    expect(range.rangeLabelZh).toBe("2–3级");
  });
});
