import { describe, expect, it } from "vitest";
import { buildCloudLayerCompletenessContext } from "../cloud-layer-completeness.js";
import { buildCloudSeaCloudBasisConsistencyContext } from "../cloud-sea-cloud-basis-consistency.js";
import { buildCloudSeaPrecipitationSignalContext } from "../cloud-sea-precipitation-signal.js";
import {
  buildCloudSeaRecommendationExplanation,
  type CloudSeaRecommendationExplanationInput,
} from "../cloud-sea-recommendation-explanation.js";
import type { ForecastMultiSourceAgreementContext, ProfessionalHourlyDataPoint } from "../types.js";

const completeLayerContext = buildCloudLayerCompletenessContext([
  {
    cloudTotalPercent: 88,
    cloudHighPercent: 18,
    cloudMidPercent: 35,
    cloudLowPercent: 72,
    cloudLayerBasis: "explicit_layers",
  },
]);

const missingLayerContext = buildCloudLayerCompletenessContext([
  {
    cloudTotalPercent: 88,
    cloudLayerBasis: "total_only",
  },
]);

const completeBasisContext = buildCloudSeaCloudBasisConsistencyContext({
  hourlyRows: [
    {
      cloudTotalPercent: 88,
      cloudHighPercent: 18,
      cloudMidPercent: 35,
      cloudLowPercent: 72,
      cloudLayerBasis: "explicit_layers",
    },
  ],
  cloudLayerCompletenessContext: completeLayerContext,
});

const missingBasisContext = buildCloudSeaCloudBasisConsistencyContext({
  hourlyRows: [
    {
      cloudTotalPercent: 88,
      cloudLayerBasis: "total_only",
    },
  ],
  cloudLayerCompletenessContext: missingLayerContext,
});

const drySignal = buildCloudSeaPrecipitationSignalContext({
  precipitationAmountMm: 0,
  precipitationProbabilityPercent: 5,
});

function professionalRow(
  overrides: Partial<ProfessionalHourlyDataPoint> = {},
): ProfessionalHourlyDataPoint {
  return {
    time: "2026-06-03T05:00:00+08:00",
    dateLabel: "6月3日",
    timeLabel: "05:00",
    weatherCode: null,
    weatherText: null,
    cloudSeaSignal: "可拍窗口",
    cloudSeaSignalLevel: "positive",
    cloudTotalPercent: 88,
    cloudHighPercent: 18,
    cloudMidPercent: 35,
    cloudLowPercent: 72,
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

const meaningfulRainSignal = buildCloudSeaPrecipitationSignalContext({
  precipitationAmountMm: 4.2,
  precipitationProbabilityPercent: 82,
  focusedWindow: {
    startTime: "2026-06-03T05:00:00+08:00",
    endTime: "2026-06-03T07:00:00+08:00",
  },
  hourlyRows: [
    professionalRow({
      time: "2026-06-03T05:00:00+08:00",
      timeLabel: "05:00",
      precipitationAmountMm: 2.4,
      precipitationProbabilityPercent: 84,
    }),
    professionalRow({
      time: "2026-06-03T06:00:00+08:00",
      timeLabel: "06:00",
      precipitationAmountMm: 1.8,
      precipitationProbabilityPercent: 78,
    }),
  ],
});

const genericDisagreementContext: ForecastMultiSourceAgreementContext = {
  agreementLevel: "medium",
  disagreementLevel: "high",
  fieldDisagreements: [
    {
      field: "cloudLow",
      level: "high",
      range: null,
      sourcesAvailable: 2,
      messageZh: "低云判断分歧较大。",
    },
  ],
  keyWarningsZh: ["低云判断分歧较大，出发前需复核。"],
  userSummaryZh: "多源低云判断存在分歧。",
  professionalSummaryZh: "多源低云判断存在分歧。",
  shouldLowerConfidence: true,
  shouldShowReviewWarning: true,
};

function explain(
  overrides: Partial<CloudSeaRecommendationExplanationInput>,
): ReturnType<typeof buildCloudSeaRecommendationExplanation> {
  return buildCloudSeaRecommendationExplanation({
    finalRecommendationLabel: "推荐安排",
    cloudSeaScore: 76,
    formationScore: 80,
    shootabilityScore: 76,
    whiteoutRiskScore: 38,
    terrainContext: {
      shouldDowngradeCloudSeaWording: false,
      isClassicCloudSeaEligible: true,
      terrainClass: "high_mountain",
    },
    cloudLayerCoverageContext: completeLayerContext,
    cloudBasisConsistencyContext: completeBasisContext,
    precipitationSignalContext: drySignal,
    bestWindow: {
      startTime: "2026-06-03T05:00:00+08:00",
      endTime: "2026-06-03T07:00:00+08:00",
      label: "清晨主窗口",
    },
    ...overrides,
  });
}

describe("buildCloudSeaRecommendationExplanation", () => {
  it("genericHighScoreCautiousCase explains high score but cautious recommendation", () => {
    const genericHighScoreCautiousCase = explain({
      finalRecommendationLabel: "谨慎参考",
      cloudSeaScore: 80,
      formationScore: 86,
      shootabilityScore: 80,
      whiteoutRiskScore: 42,
      multiSourceAgreementContext: genericDisagreementContext,
    });

    expect(genericHighScoreCautiousCase.oneLineConclusionZh).toContain("云层条件较好");
    expect(genericHighScoreCautiousCase.whyNotStrongerZh).toContain("评分较高");
    expect(genericHighScoreCautiousCase.whyNotStrongerZh).toContain("未直接强推");
    expect(genericHighScoreCautiousCase.userFacingSummaryZh).toContain("评分代表云层机会");
  });

  it("genericMediumScoreBackupCase explains backup-only recommendation", () => {
    const genericMediumScoreBackupCase = explain({
      finalRecommendationLabel: "仅作备选",
      cloudSeaScore: 52,
      formationScore: 58,
      shootabilityScore: 52,
    });

    expect(genericMediumScoreBackupCase.oneLineConclusionZh).toContain("有一定信号");
    expect(genericMediumScoreBackupCase.oneLineConclusionZh).toContain("备选观察");
    expect(genericMediumScoreBackupCase.actionSummaryZh).toContain("不建议单独");
  });

  it("genericLowScoreNoSpecialTripCase explains why not to go", () => {
    const genericLowScoreNoSpecialTripCase = explain({
      finalRecommendationLabel: "不建议专程",
      cloudSeaScore: 32,
      formationScore: 34,
      shootabilityScore: 32,
      bestWindow: null,
    });

    expect(genericLowScoreNoSpecialTripCase.oneLineConclusionZh).toContain("核心证据不足");
    expect(genericLowScoreNoSpecialTripCase.oneLineConclusionZh).toContain("等待下一次预报更新");
    expect(genericLowScoreNoSpecialTripCase.actionSummaryZh).toContain("转向通透、层云、霞光");
  });

  it("genericHighScoreBlockedByPrecipCase explains precipitation disturbance", () => {
    const genericHighScoreBlockedByPrecipCase = explain({
      finalRecommendationLabel: "谨慎参考",
      cloudSeaScore: 82,
      formationScore: 88,
      shootabilityScore: 82,
      precipitationSignalContext: meaningfulRainSignal,
    });

    expect(genericHighScoreBlockedByPrecipCase.whyNotStrongerZh).toContain("降水干扰");
    expect(genericHighScoreBlockedByPrecipCase.reviewPointsZh).toContain("短临降水和通行状态");
  });

  it("genericHighScoreBlockedByMissingLayerCase explains confidence reduction", () => {
    const genericHighScoreBlockedByMissingLayerCase = explain({
      finalRecommendationLabel: "谨慎参考",
      cloudSeaScore: 78,
      formationScore: 84,
      shootabilityScore: 78,
      cloudLayerCoverageContext: missingLayerContext,
      cloudBasisConsistencyContext: missingBasisContext,
    });

    expect(genericHighScoreBlockedByMissingLayerCase.confidenceExplanationZh).toContain(
      "总云量当作云海证据",
    );
    expect(genericHighScoreBlockedByMissingLayerCase.reviewPointsZh).toContain(
      "低/中/高云分层覆盖",
    );
  });

  it("genericHighScoreBlockedByDisagreementCase explains multi-source disagreement", () => {
    const genericHighScoreBlockedByDisagreementCase = explain({
      finalRecommendationLabel: "谨慎参考",
      cloudSeaScore: 81,
      formationScore: 87,
      shootabilityScore: 81,
      multiSourceAgreementContext: genericDisagreementContext,
    });

    expect(genericHighScoreBlockedByDisagreementCase.whyNotStrongerZh).toContain("多源低云");
    expect(genericHighScoreBlockedByDisagreementCase.reviewPointsZh).toContain(
      "多源低云和降水分歧",
    );
  });

  it("genericStrongRecommendationCase explains executable reason", () => {
    const genericStrongRecommendationCase = explain({
      finalRecommendationLabel: "强推荐专程",
      cloudSeaScore: 88,
      formationScore: 90,
      shootabilityScore: 88,
    });

    expect(genericStrongRecommendationCase.oneLineConclusionZh).toContain("强推荐专程");
    expect(genericStrongRecommendationCase.whyNotStrongerZh).toContain("未被关键 guard 阻断");
    expect(genericStrongRecommendationCase.confidenceExplanationZh).toContain("置信度较高");
  });
});
