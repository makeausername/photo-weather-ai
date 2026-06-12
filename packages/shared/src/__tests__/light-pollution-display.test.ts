import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DirectionalLightPollutionRisk, LightPollutionInfo } from "../types";
import {
  resolvePublicSkyDarknessDisplay,
  publicSkyDarknessDisclaimerZh,
} from "../light-pollution-display";
import {
  resolveChinaPublicBortleRange,
  resolveNationalLightPollutionLabel,
  resolveSkyDarknessPhotographyConfidence,
} from "../national-sky-darkness-model";

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
  const ambientRiskIndex = overrides.ambientRiskIndex ?? 6;
  return {
    available: true,
    dataAvailable: true,
    sourceCode: "eog_viirs",
    sourceLabel: "EOG VIIRS",
    datasetYear: 2026,
    datasetVersion: "test",
    localRadiance: 0.0004,
    surroundingHaloRadiance: 0.6,
    ambientRiskIndex,
    ambientRiskLevel: "very_low",
    ambientRiskLevelLabelZh: "极低",
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
      nonSqmBortleNoticeZh: "该结果为卫星夜光参考，不是现场实测，也不代表测量Bortle等级。",
    },
    estimatedBortleRange: {
      available: true,
      minClass: 1,
      maxClass: 2,
      rangeLabelZh: "1–2级",
      skyQualityLabelZh: "极佳暗空",
      confidence: "medium",
      methodVersion: "viirs-ambient-risk-range-v1",
      basisZh: "测试原始估算。",
      disclaimerZh: "原始估算说明。",
    },
    lightPollutionNoteZh: "卫星夜光参考：环境光污染极低。",
    starPenalty: 1,
    milkyWayPenalty: 2,
    scoringMode: "heuristic",
    ...overrides,
  };
}

describe("public sky darkness display", () => {
  it("keeps raw 1-2 Bortle diagnostics but publicly widens uncertain low-radiance displays", () => {
    const lightPollution = lightPollutionFixture();
    const display = resolvePublicSkyDarknessDisplay(lightPollution);

    expect(lightPollution.estimatedBortleRange?.rangeLabelZh).toBe("1–2级");
    expect(display.rawRangeLabelZh).toBe("1–2级");
    expect(display.rangeLabelZh).toBe("2–4级（保守参考）");
    expect(display.skyQualityLabelZh).not.toMatch(/极低|极佳|顶级|完美/);
    expect(display.confidenceReasonsZh.join(" ")).toContain("校准证据");
  });

  it("does not display SQM or national-standard levels in public wording", () => {
    const display = resolvePublicSkyDarknessDisplay(lightPollutionFixture());
    const publicText = JSON.stringify(display);

    expect(publicText).not.toMatch(/SQM|国标|国家标准|国标等级|实测波特尔/i);
    expect(publicSkyDarknessDisclaimerZh).not.toMatch(/SQM|国标|国家标准/i);
  });

  it("widens low-confidence raw 2-3 estimates without changing the raw estimate", () => {
    const lightPollution = lightPollutionFixture({
      confidence: "low",
      validSampleCount: 20,
      estimatedBortleRange: {
        available: true,
        minClass: 2,
        maxClass: 3,
        rangeLabelZh: "2–3级",
        skyQualityLabelZh: "优良暗空",
        confidence: "low",
        methodVersion: "viirs-ambient-risk-range-v1",
        basisZh: "测试原始估算。",
        disclaimerZh: "原始估算说明。",
      },
    });
    const display = resolvePublicSkyDarknessDisplay(lightPollution);

    expect(lightPollution.estimatedBortleRange?.rangeLabelZh).toBe("2–3级");
    expect(display.rangeLabelZh).toBe("2–4级（保守参考）");
  });

  it("widens high-confidence low-end raw estimates when calibration evidence is only limited", () => {
    const lightPollution = lightPollutionFixture({
      ambientRiskIndex: 18,
      localRadiance: 0.04,
      surroundingHaloRadiance: 0.14,
      confidence: "high",
      sampleCount: 96,
      validSampleCount: 96,
      estimatedBortleRange: {
        available: true,
        minClass: 2,
        maxClass: 3,
        rangeLabelZh: "2–3级",
        skyQualityLabelZh: "优良暗空",
        confidence: "medium",
        methodVersion: "viirs-ambient-risk-range-v1",
        basisZh: "测试原始估算。",
        disclaimerZh: "原始估算说明。",
      },
    });
    const display = resolvePublicSkyDarknessDisplay(lightPollution);

    expect(display.rangeLabelZh).toBe("2–4级（保守参考）");
    expect(display.skyQualityLabelZh).toBe("尚暗，需现场确认");
    expect(display.confidenceReasonsZh.join(" ")).toContain("低端波特尔范围");
  });

  it("does not publish a national 1-2 range for low local radiance with high surrounding halo", () => {
    const lightPollution = lightPollutionFixture({
      localRadiance: 0.0002,
      surroundingHaloRadiance: 1.8,
      ambientRiskIndex: 5,
      estimatedBortleRange: {
        available: true,
        minClass: 1,
        maxClass: 2,
        rangeLabelZh: "1–2级",
        skyQualityLabelZh: "极佳暗空",
        confidence: "medium",
        methodVersion: "viirs-ambient-risk-range-v1",
        basisZh: "测试原始估算。",
        disclaimerZh: "原始估算说明。",
      },
    });

    const display = resolvePublicSkyDarknessDisplay(lightPollution);

    expect(display.rangeLabelZh).toBe("2–4级（保守参考）");
    expect(display.minClass).toBeGreaterThanOrEqual(2);
    expect(display.urbanSkyglowSpilloverRisk).toBe(true);
    expect(display.diagnostics).toEqual(
      expect.arrayContaining(["urban_skyglow_spillover_risk", "low_end_public_range_widened"]),
    );
  });

  it("allows a national 1-2 range only with supported stable dark evidence", () => {
    const lightPollution = lightPollutionFixture({
      localRadiance: 0.004,
      surroundingHaloRadiance: 0.0045,
      ambientRiskIndex: 4,
      calculationBasis: {
        ...lightPollutionFixture().calculationBasis!,
        samplingConfigVersion: "satellite-night-light-field-validated-v1",
      },
      estimatedBortleRange: {
        available: true,
        minClass: 1,
        maxClass: 2,
        rangeLabelZh: "1–2级",
        skyQualityLabelZh: "极佳暗空",
        confidence: "medium",
        methodVersion: "viirs-ambient-risk-range-v1",
        basisZh: "测试原始估算。",
        disclaimerZh: "原始估算说明。",
      },
    });

    const display = resolvePublicSkyDarknessDisplay(lightPollution);
    const publicRange = resolveChinaPublicBortleRange(
      lightPollution,
      lightPollution.estimatedBortleRange!,
    );

    expect(display.rangeLabelZh).toBe("1–2级");
    expect(display.conservative).toBe(false);
    expect(publicRange).toMatchObject({ minClass: 1, maxClass: 2 });
    expect(resolveNationalLightPollutionLabel(lightPollution, lightPollution.estimatedBortleRange!))
      .toBe(display.skyQualityLabelZh);
    expect(
      resolveSkyDarknessPhotographyConfidence(lightPollution, lightPollution.estimatedBortleRange!),
    ).toBe("medium");
  });

  it("uses national quantile signals and widens uncertain low-end public output", () => {
    const lightPollution = lightPollutionFixture({
      localRadiance: 0.02,
      surroundingHaloRadiance: 0.4,
      ambientRiskIndex: 18,
      estimatedBortleRange: {
        available: true,
        minClass: 2,
        maxClass: 3,
        rangeLabelZh: "2–3级",
        skyQualityLabelZh: "优良暗空",
        confidence: "medium",
        methodVersion: "viirs-ambient-risk-range-v1",
        basisZh: "测试原始估算。",
        disclaimerZh: "原始估算说明。",
      },
    });

    const display = resolvePublicSkyDarknessDisplay(lightPollution);

    expect(display.rangeLabelZh).toBe("2–4级（保守参考）");
    expect(display.localRadianceQuantile).toEqual(expect.any(Number));
    expect(display.haloRadianceQuantile).toEqual(expect.any(Number));
    expect(display.nationalModelVersion).toBe("china-national-sky-darkness-v1");
  });

  it("contains no location, coordinate, or category-specific production rule", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../light-pollution-display.ts", import.meta.url)),
      "utf8",
    );
    const nationalModelSource = readFileSync(
      fileURLToPath(new URL("../national-sky-darkness-model.ts", import.meta.url)),
      "utf8",
    );
    const productionSource = `${source}\n${nationalModelSource}`;

    expect(productionSource).not.toMatch(/黄山|光明顶|三清山|老君山|武功山|Tianwentong|天文通/);
    expect(productionSource).not.toMatch(/latitude|longitude|locationName|scenic|景区|城市|农村|乡村|山地/);
    expect(productionSource).not.toMatch(/category|country|region|province/i);
  });
});
