import { describe, expect, it } from "vitest";
import { buildCloudLayerCompletenessContext } from "../cloud-layer-completeness.js";
import {
  buildCloudSeaRecommendationGuard,
  type CloudSeaRecommendationGuardInput,
} from "../cloud-sea-recommendation-guard.js";
import type { ForecastMultiSourceAgreementContext } from "../types.js";

const completeLayers = buildCloudLayerCompletenessContext([
  {
    cloudTotalPercent: 88,
    cloudHighPercent: 20,
    cloudMidPercent: 34,
    cloudLowPercent: 72,
    cloudLayerBasis: "explicit_layers",
  },
  {
    cloudTotalPercent: 82,
    cloudHighPercent: 16,
    cloudMidPercent: 30,
    cloudLowPercent: 68,
    cloudLayerBasis: "explicit_layers",
  },
]);

const totalOnlyLayers = buildCloudLayerCompletenessContext([
  {
    cloudTotalPercent: 88,
    cloudLayerBasis: "total_only",
  },
]);

function guard(overrides: Partial<CloudSeaRecommendationGuardInput> = {}) {
  return buildCloudSeaRecommendationGuard({
    cloudSeaScore: 82,
    shootabilityScore: 82,
    formationScore: 86,
    whiteoutRiskScore: 34,
    proposedRecommendationLabel: "推荐重点关注",
    terrainContext: {
      shouldDowngradeCloudSeaWording: false,
      isClassicCloudSeaEligible: true,
      terrainClass: "high_mountain",
    },
    cloudLayerCompletenessContext: completeLayers,
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
  });
}

function agreement(
  field: string,
  messageZh: string,
): ForecastMultiSourceAgreementContext {
  return {
    agreementLevel: "low",
    disagreementLevel: "high",
    fieldDisagreements: [
      {
        field,
        level: "high",
        range: 44,
        min: 12,
        max: 56,
        unit: "pct",
        sourcesAvailable: 2,
        messageZh,
      },
    ],
    keyWarningsZh: [messageZh],
    userSummaryZh: messageZh,
    professionalSummaryZh: messageZh,
    shouldLowerConfidence: true,
    shouldShowReviewWarning: true,
  };
}

describe("buildCloudSeaRecommendationGuard", () => {
  it("caps a 32 score result to not recommended and blocks strong copy", () => {
    const result = guard({
      cloudSeaScore: 32,
      shootabilityScore: 32,
      formationScore: 36,
      proposedRecommendationLabel: "强推荐专程",
    });

    expect(result.finalRecommendationLevel).toBe("do_not_go_special");
    expect(result.finalRecommendationLabel).toBe("不建议专程");
    expect(result.isSpecialTripRecommended).toBe(false);
    expect(result.blockedStrongRecommendationReasons).toContain("分数不足，不建议专程");
    expect(result.departureAdviceZh).toContain("当前云海证据不足");
  });

  it("caps low elevation downgraded locations to observation instead of special trip", () => {
    const result = guard({
      terrainContext: {
        shouldDowngradeCloudSeaWording: true,
        isClassicCloudSeaEligible: false,
        terrainClass: "low_elevation",
      },
      proposedRecommendationLabel: "强推荐专程",
    });

    expect(result.finalRecommendationLevel).toBe("observe_if_nearby");
    expect(result.finalRecommendationLabel).toBe("推荐观察");
    expect(result.isSpecialTripRecommended).toBe(false);
    expect(result.maxAllowedRecommendationStrength).toBe("observe_if_nearby");
    expect(result.blockedStrongRecommendationReasons).toContain(
      "低海拔地点不按高山云海判断",
    );
  });

  it("blocks strong recommendations when low cloud layers are missing", () => {
    const result = guard({
      cloudLayerCompletenessContext: totalOnlyLayers,
      proposedRecommendationLabel: "强推荐专程",
      lowCloudSignalSupported: false,
    });

    expect(result.finalRecommendationLevel).toBe("cautious_reference");
    expect(result.finalRecommendationLabel).toBe("谨慎参考");
    expect(result.blockedStrongRecommendationReasons).toContain("低云分层不足，需复核");
    expect(result.consistencyWarnings.join(" ")).toContain("缺少低云分层");
  });

  it("blocks strong recommendations when low cloud disagreement is high", () => {
    const result = guard({
      multiSourceAgreementContext: agreement(
        "cloudLow",
        "多源低云判断分歧较大，需临近复核。",
      ),
      proposedRecommendationLabel: "强推荐专程",
    });

    expect(result.finalRecommendationLevel).toBe("cautious_reference");
    expect(result.finalRecommendationLabel).toBe("谨慎参考");
    expect(result.blockedStrongRecommendationReasons).toContain(
      "多源低云或降水判断分歧较大",
    );
  });

  it("allows strong recommendation for high mountain high score with complete low cloud evidence", () => {
    const result = guard({
      cloudSeaScore: 84,
      shootabilityScore: 82,
      formationScore: 88,
      whiteoutRiskScore: 22,
      proposedRecommendationLabel: "强推荐专程",
    });

    expect(result.finalRecommendationLevel).toBe("strong_special_trip");
    expect(result.finalRecommendationLabel).toBe("强推荐专程");
    expect(result.isSpecialTripRecommended).toBe(true);
  });

  it("does not cap cloud sea solely for mid or high cloud disagreement when low cloud supports it", () => {
    const result = guard({
      multiSourceAgreementContext: agreement(
        "cloudHigh",
        "多源高云判断分歧较大，主要影响霞光纹理。",
      ),
      proposedRecommendationLabel: "强推荐专程",
    });

    expect(result.finalRecommendationLevel).toBe("strong_special_trip");
    expect(result.consistencyWarnings.join(" ")).toContain("霞光和云层纹理");
  });

  it("does not allow mid or high cloud alone to justify a cloud sea special trip", () => {
    const result = guard({
      multiSourceAgreementContext: agreement(
        "cloudMid",
        "多源中云判断分歧较大，主要影响云层纹理。",
      ),
      lowCloudSignalSupported: false,
      proposedRecommendationLabel: "强推荐专程",
    });

    expect(result.finalRecommendationLevel).toBe("cautious_reference");
    expect(result.finalRecommendationLabel).toBe("谨慎参考");
    expect(result.blockedStrongRecommendationReasons).toContain("低云信号不足");
  });
});
