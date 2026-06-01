import { describe, expect, it } from "vitest";
import type {
  ForecastCalculationResult,
  ForecastMultiSourceAgreementContext,
  ForecastScore,
  ProfessionalHourlyDataPoint,
  TerrainMode,
  TerrainType,
} from "@photo-weather/shared";
import { buildCloudSeaRuleContext } from "./cloud-sea-rule-context";

type GenericCloudSeaFixture = {
  readonly name: string;
  readonly elevationMeters: number | null;
  readonly reliefMeters: number | null;
  readonly valleyElevationMeters: number | null;
  readonly terrainType: TerrainType;
  readonly terrainMode: TerrainMode;
  readonly terrainScore: number;
};

const genericHighMountainSpot: GenericCloudSeaFixture = {
  name: "genericHighMountainSpot",
  elevationMeters: 1680,
  reliefMeters: 720,
  valleyElevationMeters: 960,
  terrainType: "summit",
  terrainMode: "high_mountain",
  terrainScore: 88,
};

const genericLowElevationSpot: GenericCloudSeaFixture = {
  name: "genericLowElevationSpot",
  elevationMeters: 142,
  reliefMeters: 80,
  valleyElevationMeters: 62,
  terrainType: "city",
  terrainMode: "urban_or_plain",
  terrainScore: 28,
};

const completeLayerRows: readonly ProfessionalHourlyDataPoint[] = [
  professionalHourlyRow({
    time: "2026-05-20T05:00:00+08:00",
    cloudSeaSignal: "可拍窗口",
    cloudSeaSignalLevel: "positive",
  }),
  professionalHourlyRow({
    time: "2026-05-20T06:00:00+08:00",
    cloudSeaSignal: "形成信号",
    cloudSeaSignalLevel: "watch",
    cloudLowPercent: 64,
  }),
];

describe("buildCloudSeaRuleContext", () => {
  it("allows a strong high-mountain recommendation only with field-supported evidence", () => {
    const context = buildCloudSeaRuleContext(
      cloudSeaResultForFixture(genericHighMountainSpot, {
        rows: completeLayerRows,
        cloudSeaScore: 84,
        shootabilityScore: 82,
        formationScore: 88,
        whiteoutRiskScore: 24,
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(context.terrainContext.isClassicCloudSeaEligible).toBe(true);
    expect(context.terrainContext.shouldDowngradeCloudSeaWording).toBe(false);
    expect(context.cloudLayerCompletenessContext.layerCompletenessLevel).toBe("complete");
    expect(context.cloudLayerRoleContext.dominantRole).toBe("cloud_sea");
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe(
      "strong_special_trip",
    );
    expect(context.recommendationGuardContext.isSpecialTripRecommended).toBe(true);
  });

  it("caps low-elevation recommendations even when the raw score is high", () => {
    const context = buildCloudSeaRuleContext(
      cloudSeaResultForFixture(genericLowElevationSpot, {
        rows: completeLayerRows,
        cloudSeaScore: 88,
        shootabilityScore: 86,
        formationScore: 90,
        whiteoutRiskScore: 18,
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(context.terrainContext.shouldDowngradeCloudSeaWording).toBe(true);
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe(
      "observe_if_nearby",
    );
    expect(context.recommendationGuardContext.finalRecommendationLabel).toBe("推荐观察");
    expect(context.recommendationGuardContext.isSpecialTripRecommended).toBe(false);
    expect(context.recommendationGuardContext.blockedStrongRecommendationReasons).toContain(
      "低海拔地点不按高山云海判断",
    );
  });

  it("keeps missing low-cloud layers as review evidence instead of filling from total cloud", () => {
    const context = buildCloudSeaRuleContext(
      cloudSeaResultForFixture(genericHighMountainSpot, {
        rows: [
          professionalHourlyRow({
            cloudTotalPercent: 92,
            cloudHighPercent: null,
            cloudMidPercent: null,
            cloudLowPercent: null,
            cloudLayerBasis: "total_only",
            cloudSeaSignal: "需复核",
            cloudSeaSignalLevel: "review",
            missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
          }),
        ],
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(context.cloudLayerCompletenessContext.cloudLayerBasis).toBe("total_only");
    expect(context.cloudLayerCompletenessContext.hasLowCloudLayer).toBe(false);
    expect(context.cloudLayerRoleContext.dominantRole).toBe("needs_review");
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );
    expect(context.recommendationGuardContext.consistencyWarnings.join(" ")).toContain(
      "缺少低云分层",
    );
  });

  it("flags weather-variable contradictions from field relationships", () => {
    const context = buildCloudSeaRuleContext(
      cloudSeaResultForFixture(genericHighMountainSpot, {
        rows: [
          professionalHourlyRow({
            relativeHumidityPercent: 98,
            dewPointSpreadC: 8,
            precipitationProbabilityPercent: 84,
            precipitationAmountMm: 0,
            rawTemperatureC: 18,
            terrainAdjustedTemperatureC: 8,
            cloudTotalPercent: 35,
            cloudHighPercent: 70,
          }),
        ],
      }),
    );

    expect(context.weatherVariableConsistencyContext.consistencyLevel).toBe("conflict");
    expect(context.weatherVariableConsistencyContext.hasContradictions).toBe(true);
    expect(context.weatherVariableConsistencyContext.warnings.map((warning) => warning.key)).toEqual(
      expect.arrayContaining([
        "humidity_dew_point_spread",
        "precip_probability_trace_amount",
        "terrain_temperature_delta",
        "cloud_layer_total_mismatch",
      ]),
    );
    expect(context.precipitationSignalContext.highProbabilityTraceAmount).toBe(true);
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );
  });

  it("separates mid/high-cloud glow texture from low-cloud cloud-sea evidence", () => {
    const context = buildCloudSeaRuleContext(
      cloudSeaResultForFixture(genericHighMountainSpot, {
        rows: [
          professionalHourlyRow({
            cloudTotalPercent: 78,
            cloudHighPercent: 74,
            cloudMidPercent: 68,
            cloudLowPercent: 18,
            cloudSeaSignal: "霞光参考",
            cloudSeaSignalLevel: "neutral",
          }),
          professionalHourlyRow({
            cloudTotalPercent: 72,
            cloudHighPercent: 66,
            cloudMidPercent: 64,
            cloudLowPercent: null,
            cloudSeaSignal: "云层纹理",
            cloudSeaSignalLevel: "neutral",
            missingFields: ["cloudLow"],
          }),
        ],
        proposedRecommendationLabel: "强推荐专程",
        formationScore: 50,
      }),
    );

    expect(context.cloudLayerRoleContext.redirectedMidHighHoursCount).toBe(2);
    expect(context.cloudLayerRoleContext.dominantRole).toBe("glow_reference");
    expect(context.cloudLayerRoleContext.noteZh).toContain("中高云");
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );
  });

  it("low-cloud multi-source disagreement caps confidence without naming a location", () => {
    const context = buildCloudSeaRuleContext(
      cloudSeaResultForFixture(genericHighMountainSpot, {
        multiSourceAgreementContext: lowCloudDisagreement(),
        proposedRecommendationLabel: "强推荐专程",
      }),
    );

    expect(context.multiSourceAgreementContext?.disagreementLevel).toBe("high");
    expect(context.recommendationGuardContext.finalRecommendationLevel).toBe(
      "cautious_reference",
    );
    expect(context.recommendationGuardContext.blockedStrongRecommendationReasons).toContain(
      "多源低云或降水判断分歧较大",
    );
  });
});

function cloudSeaResultForFixture(
  fixture: GenericCloudSeaFixture,
  overrides: {
    readonly rows?: readonly ProfessionalHourlyDataPoint[];
    readonly cloudSeaScore?: number;
    readonly shootabilityScore?: number;
    readonly formationScore?: number;
    readonly whiteoutRiskScore?: number;
    readonly proposedRecommendationLabel?: string;
    readonly multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null;
  } = {},
): ForecastCalculationResult {
  const rows = overrides.rows ?? completeLayerRows;
  const cloudSeaScore = overrides.cloudSeaScore ?? 82;
  const shootabilityScore = overrides.shootabilityScore ?? 80;
  const formationScore = overrides.formationScore ?? 86;
  const whiteoutRiskScore = overrides.whiteoutRiskScore ?? 28;
  const proposedRecommendationLabel = overrides.proposedRecommendationLabel ?? "推荐重点关注";
  const window = {
    label: "清晨云海窗口 05:00 - 07:00",
    startTime: "2026-05-20T05:00:00+08:00",
    endTime: "2026-05-20T07:00:00+08:00",
  };

  return {
    place: {
      name: fixture.name,
    },
    scores: {
      cloudSea: score("cloudSea", "云海", cloudSeaScore),
      whiteoutRisk: score("whiteoutRisk", "白墙风险", whiteoutRiskScore),
    },
    cloudSeaAnalysis: {
      formationScore,
      shootableScore: shootabilityScore,
      whiteoutRiskScore,
      recommendationLabel: proposedRecommendationLabel,
      bestCloudSeaWindow: window,
      bestCloudSeaWindows: [window],
      watchableCloudSeaWindows: [],
      terrainSupport: {
        score: fixture.terrainScore,
        level: fixture.terrainScore >= 75 ? "高" : fixture.terrainScore >= 45 ? "中" : "低",
        terrainMode: fixture.terrainMode,
        selectedSpotElevationMeters: fixture.elevationMeters ?? undefined,
        nearbyValleyElevationMeters: fixture.valleyElevationMeters ?? undefined,
        localReliefMeters: fixture.reliefMeters ?? undefined,
        terrainType: fixture.terrainType,
        exposureType: "exposed",
        confidence: fixture.terrainMode === "unknown" ? "low" : "high",
        messageZh: "synthetic terrain fixture",
      },
    },
    terrainAnalysis: {
      terrainProfile: {
        elevationMeters: fixture.elevationMeters,
        locationElevation: fixture.elevationMeters,
        nearbyValleyElevationMeters: fixture.valleyElevationMeters,
        localReliefMeters: fixture.reliefMeters,
        elevationDiff5km: fixture.reliefMeters,
        terrainType: fixture.terrainType,
        elevationConfidence: fixture.terrainMode === "unknown" ? "low" : "high",
      },
    },
    professionalHourlyData: rows,
    weatherFusionSummary:
      overrides.multiSourceAgreementContext === undefined
        ? undefined
        : {
            multiSourceAgreementContext: overrides.multiSourceAgreementContext,
          },
    riskFlags: [],
  } as unknown as ForecastCalculationResult;
}

function professionalHourlyRow(
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
    cloudTotalPercent: 86,
    cloudHighPercent: 24,
    cloudMidPercent: 32,
    cloudLowPercent: 68,
    cloudLayerBasis: "explicit_layers",
    rawTemperatureC: 12,
    terrainAdjustedTemperatureC: 10,
    displayedTemperatureC: 10,
    temperatureBasis: "terrain_adjusted",
    temperatureAdjustmentC: -2,
    temperatureBasisNoteZh: "地形修正温度。",
    dewPointC: 8,
    dewPointSpreadC: 2,
    relativeHumidityPercent: 92,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 12,
    visibilityMeters: 14000,
    windSpeedMs: 2.4,
    windDirectionDeg: 120,
    missingFields: [],
    notesZh: [],
    ...overrides,
  };
}

function score(key: string, label: string, value: number): ForecastScore {
  return {
    key,
    label,
    score: value,
    level: value >= 80 ? "excellent" : value >= 65 ? "good" : value >= 45 ? "fair" : "poor",
    reasons: [],
    risks: [],
  };
}

function lowCloudDisagreement(): ForecastMultiSourceAgreementContext {
  const messageZh = "多源低云判断分歧较大，需临近复核。";

  return {
    agreementLevel: "low",
    disagreementLevel: "high",
    fieldDisagreements: [
      {
        field: "cloudLow",
        level: "high",
        range: 48,
        min: 18,
        max: 66,
        unit: "%",
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
