import type {
  CloudSeaScoreCalibrationContext,
  ForecastCalculationResult,
  ForecastMultiSourceAgreementContext,
  ForecastQueryInput,
  ForecastScore,
  ForecastTimeWindow,
  ProfessionalHourlyDataPoint,
  TerrainMode,
  TerrainType,
} from "@photo-weather/shared";

export type CloudSeaRegressionFixtureName =
  | "genericHighMountainGoodCloudSeaCase"
  | "genericHighMountainWarmGridCoolCameraCase"
  | "genericHighMountainRawOnlyCase"
  | "genericLowElevationNoCorrectionCase"
  | "genericLowElevationWeakCloudSeaCase"
  | "genericMissingLayerDataCase"
  | "genericCloudBasisMismatchCase"
  | "genericMidHighCloudOnlyCase"
  | "genericPrecipProbabilityOnlyCase"
  | "genericMeaningfulPrecipitationCase"
  | "genericProbabilityOnlyTraceRainCase"
  | "genericLightShowerNearWindowCase"
  | "genericMeaningfulRainNearWindowCase"
  | "genericHeavyRainCase"
  | "genericRainOutsideWindowCase"
  | "genericMissingAmountWithProbabilityCase"
  | "genericAmountWithoutProbabilityCase"
  | "genericHumidityDewPointConflictCase"
  | "genericLowScoreContradictionCase"
  | "genericUnknownTerrainCase";

export type CloudSeaRegressionFixture = {
  readonly name: CloudSeaRegressionFixtureName;
  readonly result: ForecastCalculationResult;
  readonly query: ForecastQueryInput;
};

type GenericTerrainInput = {
  readonly placeName: string;
  readonly elevationMeters: number | null;
  readonly surroundingReliefMeters: number | null;
  readonly nearbyValleyElevationMeters: number | null;
  readonly terrainMode: TerrainMode;
  readonly terrainType: TerrainType;
  readonly terrainScore: number;
  readonly terrainConfidence: "high" | "medium" | "low";
};

type CloudSeaFixtureOverrides = {
  readonly terrain?: Partial<GenericTerrainInput>;
  readonly rows?: readonly ProfessionalHourlyDataPoint[];
  readonly cloudSeaScore?: number;
  readonly formationScore?: number;
  readonly shootableScore?: number;
  readonly whiteoutRiskScore?: number;
  readonly scoreCalibration?: CloudSeaScoreCalibrationContext;
  readonly recommendationLabel?: string;
  readonly bestWindow?: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindow"];
  readonly bestWindows?: readonly ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number][];
  readonly watchableWindows?: readonly ForecastCalculationResult["cloudSeaAnalysis"]["watchableCloudSeaWindows"][number][];
  readonly notRecommendedWindows?: readonly ForecastCalculationResult["cloudSeaAnalysis"]["notRecommendedCloudSeaWindows"][number][];
  readonly dailyRecommendationLabel?: string;
  readonly dailyKeyReason?: string;
  readonly rainOpening?: ForecastCalculationResult["cloudSeaAnalysis"]["rainOpening"];
  readonly riskFlags?: ForecastCalculationResult["riskFlags"];
  readonly weatherMissingFields?: readonly string[];
  readonly weatherMissingDataNotes?: readonly string[];
  readonly missingDataNotes?: readonly string[];
  readonly weatherFusionSummary?: ForecastCalculationResult["weatherFusionSummary"];
};

const timezone = "Asia/Shanghai";
const forecastStart = "2026-05-20T00:00:00+08:00";
const forecastEnd = "2026-05-22T00:00:00+08:00";
const generatedAt = "2026-05-19T22:15:00+08:00";

function cloudSeaScoreCalibration(
  input: {
    readonly formationScore: number;
    readonly shootableScore: number;
    readonly confidenceLevel: CloudSeaScoreCalibrationContext["confidenceLevel"];
    readonly recommendationLabel: string;
  },
  overrides: Partial<CloudSeaScoreCalibrationContext> = {},
): CloudSeaScoreCalibrationContext {
  const rawFormationScore = overrides.rawFormationScore ?? input.formationScore;
  const rawShootabilityScore = overrides.rawShootabilityScore ?? input.shootableScore;
  const calibratedFormationScore =
    overrides.calibratedFormationScore ?? input.formationScore;
  const calibratedShootabilityScore =
    overrides.calibratedShootabilityScore ??
    overrides.finalCloudSeaScore ??
    input.shootableScore;
  const finalCloudSeaScore = overrides.finalCloudSeaScore ?? calibratedShootabilityScore;

  return {
    rawFormationScore,
    rawShootabilityScore,
    calibratedFormationScore,
    calibratedShootabilityScore,
    finalCloudSeaScore,
    scoreBand: overrides.scoreBand ?? scoreBand(finalCloudSeaScore),
    confidenceLevel: overrides.confidenceLevel ?? input.confidenceLevel,
    capApplied: overrides.capApplied ?? false,
    capReasons: overrides.capReasons ?? [],
    positiveFactorsZh: overrides.positiveFactorsZh ?? ["低云、水汽和地形信号支持云海形成。"],
    negativeFactorsZh: overrides.negativeFactorsZh ?? [],
    scoreExplanationZh:
      overrides.scoreExplanationZh ??
      `形成 ${rawFormationScore} -> ${calibratedFormationScore} 分，可拍 ${rawShootabilityScore} -> ${calibratedShootabilityScore} 分，最终 ${finalCloudSeaScore} 分。`,
    recommendationExplanationZh:
      overrides.recommendationExplanationZh ??
      "形成、开口、能见度和风险信号支持当前推荐，但出发前仍需复核临近天气。",
    finalRecommendationLabel: overrides.finalRecommendationLabel ?? input.recommendationLabel,
    shouldBlockStrongRecommendation: overrides.shouldBlockStrongRecommendation ?? false,
    shouldDowngradeToCautious: overrides.shouldDowngradeToCautious ?? false,
    shouldDowngradeToBackup: overrides.shouldDowngradeToBackup ?? false,
  };
}

function scoreBand(score: number): CloudSeaScoreCalibrationContext["scoreBand"] {
  if (score >= 86) {
    return "excellent";
  }
  if (score >= 70) {
    return "good";
  }
  if (score >= 55) {
    return "fair";
  }
  if (score >= 40) {
    return "backup";
  }
  return "poor";
}

const genericHighMountainTerrain: GenericTerrainInput = {
  placeName: "genericHighMountainSpot",
  elevationMeters: 1680,
  surroundingReliefMeters: 860,
  nearbyValleyElevationMeters: 820,
  terrainMode: "high_mountain",
  terrainType: "summit",
  terrainScore: 88,
  terrainConfidence: "high",
};

const genericLowElevationTerrain: GenericTerrainInput = {
  placeName: "genericLowElevationSpot",
  elevationMeters: 180,
  surroundingReliefMeters: 80,
  nearbyValleyElevationMeters: null,
  terrainMode: "urban_or_plain",
  terrainType: "city",
  terrainScore: 24,
  terrainConfidence: "low",
};

const genericUnknownTerrain: GenericTerrainInput = {
  placeName: "genericUnknownTerrainSpot",
  elevationMeters: null,
  surroundingReliefMeters: null,
  nearbyValleyElevationMeters: null,
  terrainMode: "unknown",
  terrainType: "unknown",
  terrainScore: 18,
  terrainConfidence: "low",
};

export const cloudSeaRegressionFixtures: Record<
  CloudSeaRegressionFixtureName,
  CloudSeaRegressionFixture
> = {
  genericHighMountainGoodCloudSeaCase: makeFixture("genericHighMountainGoodCloudSeaCase", {
    cloudSeaScore: 86,
    formationScore: 88,
    shootableScore: 84,
    whiteoutRiskScore: 22,
    recommendationLabel: "推荐重点关注",
    rows: completeCloudSeaRows(),
  }),
  genericHighMountainWarmGridCoolCameraCase: makeFixture(
    "genericHighMountainWarmGridCoolCameraCase",
    {
      terrain: {
        elevationMeters: 1860,
        surroundingReliefMeters: 1400,
        nearbyValleyElevationMeters: 620,
        terrainMode: "high_mountain",
        terrainType: "summit",
        terrainScore: 92,
        terrainConfidence: "high",
      },
      cloudSeaScore: 88,
      formationScore: 90,
      shootableScore: 84,
      whiteoutRiskScore: 24,
      recommendationLabel: "推荐重点关注",
      rows: completeCloudSeaRows({
        rawTemperatureC: 30,
        terrainAdjustedTemperatureC: 18,
        displayedTemperatureC: 30,
        temperatureBasis: "terrain_adjusted",
        temperatureAdjustmentC: -12,
        temperatureBasisNoteZh: "原始格点与机位估算温度差异较大，用户显示以机位估算温度为准。",
        relativeHumidityPercent: 92,
        windSpeedMs: 4.8,
      }),
    },
  ),
  genericHighMountainRawOnlyCase: makeFixture("genericHighMountainRawOnlyCase", {
    terrain: {
      elevationMeters: 1600,
      surroundingReliefMeters: 820,
      nearbyValleyElevationMeters: 700,
      terrainMode: "high_mountain",
      terrainType: "ridge",
      terrainScore: 84,
      terrainConfidence: "medium",
    },
    cloudSeaScore: 78,
    formationScore: 80,
    shootableScore: 70,
    whiteoutRiskScore: 34,
    rows: completeCloudSeaRows({
      rawTemperatureC: 29,
      terrainAdjustedTemperatureC: null,
      displayedTemperatureC: 29,
      temperatureBasis: "raw_grid",
      temperatureAdjustmentC: null,
      temperatureBasisNoteZh: "原始格点温度，未确认机位海拔修正。",
    }),
  }),
  genericLowElevationNoCorrectionCase: makeFixture("genericLowElevationNoCorrectionCase", {
    terrain: {
      ...genericLowElevationTerrain,
      elevationMeters: 100,
      surroundingReliefMeters: 40,
      terrainConfidence: "high",
    },
    cloudSeaScore: 52,
    formationScore: 42,
    shootableScore: 46,
    whiteoutRiskScore: 18,
    recommendationLabel: "谨慎参考",
    rows: completeCloudSeaRows({
      rawTemperatureC: 29,
      terrainAdjustedTemperatureC: null,
      displayedTemperatureC: 29,
      temperatureBasis: "raw_grid",
      temperatureAdjustmentC: null,
      temperatureBasisNoteZh: "低海拔格点温度，未触发高山修正。",
      cloudTotalPercent: 42,
      cloudLowPercent: 16,
      relativeHumidityPercent: 72,
      dewPointSpreadC: 7,
      visibilityMeters: 20000,
      cloudSeaSignal: "普通",
      cloudSeaSignalLevel: "neutral",
    }),
    bestWindows: [cloudSeaWindow({ score: 48, shootableScore: 46, formationScore: 42 })],
  }),
  genericLowElevationWeakCloudSeaCase: makeFixture("genericLowElevationWeakCloudSeaCase", {
    terrain: genericLowElevationTerrain,
    cloudSeaScore: 72,
    formationScore: 42,
    shootableScore: 48,
    whiteoutRiskScore: 38,
    recommendationLabel: "推荐重点关注",
    rows: completeCloudSeaRows({
      cloudTotalPercent: 46,
      cloudLowPercent: 18,
      relativeHumidityPercent: 78,
      dewPointSpreadC: 6,
      visibilityMeters: 18000,
      cloudSeaSignal: "普通",
      cloudSeaSignalLevel: "neutral",
    }),
    bestWindows: [cloudSeaWindow({ score: 52, shootableScore: 48, formationScore: 42 })],
    dailyRecommendationLabel: "推荐重点关注",
  }),
  genericMissingLayerDataCase: makeFixture("genericMissingLayerDataCase", {
    rows: totalOnlyRows(),
    cloudSeaScore: 78,
    formationScore: 76,
    shootableScore: 74,
    recommendationLabel: "推荐重点关注",
    weatherMissingFields: ["cloudHigh", "cloudMid", "cloudLow"],
    weatherMissingDataNotes: ["generic fixture missing cloud layer fields"],
    missingDataNotes: ["低云分层缺失，云海判断需要临近复核。"],
  }),
  genericCloudBasisMismatchCase: makeFixture("genericCloudBasisMismatchCase", {
    rows: completeCloudSeaRows({
      cloudTotalPercent: 20,
      cloudLowPercent: 70,
      cloudMidPercent: 24,
      cloudHighPercent: 18,
      cloudSeaSignal: "可拍窗口",
      cloudSeaSignalLevel: "positive",
    }),
    cloudSeaScore: 82,
    formationScore: 84,
    shootableScore: 80,
    recommendationLabel: "推荐重点关注",
  }),
  genericMidHighCloudOnlyCase: makeFixture("genericMidHighCloudOnlyCase", {
    rows: completeCloudSeaRows({
      cloudTotalPercent: 92,
      cloudHighPercent: 86,
      cloudMidPercent: 74,
      cloudLowPercent: 12,
      relativeHumidityPercent: 62,
      dewPointSpreadC: 7,
      visibilityMeters: 22000,
      cloudSeaSignal: "霞光参考",
      cloudSeaSignalLevel: "neutral",
    }),
    cloudSeaScore: 70,
    formationScore: 50,
    shootableScore: 54,
    whiteoutRiskScore: 20,
    recommendationLabel: "推荐重点关注",
    bestWindows: [cloudSeaWindow({ score: 54, shootableScore: 54, formationScore: 50 })],
  }),
  genericPrecipProbabilityOnlyCase: makeFixture("genericPrecipProbabilityOnlyCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: 82,
      precipitationAmountMm: 0,
    }),
    cloudSeaScore: 84,
    formationScore: 86,
    shootableScore: 82,
    whiteoutRiskScore: 24,
    recommendationLabel: "推荐重点关注",
  }),
  genericMeaningfulPrecipitationCase: makeFixture("genericMeaningfulPrecipitationCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: 76,
      precipitationAmountMm: 0.5,
    }),
    cloudSeaScore: 72,
    formationScore: 78,
    shootableScore: 66,
    whiteoutRiskScore: 36,
    recommendationLabel: "推荐安排",
    rainOpening: {
      rainSupportSignal: false,
      activeRainDuringWindow: true,
      postRainOpeningChance: "low",
      messageZh: "主窗口附近存在可计量降水，需按真实雨量准备防水并考虑降级。",
    },
    riskFlags: [
      {
        key: "precipitation",
        label: "降水风险",
        level: "medium",
        description: "关键窗口附近有可计量降水，出发前需要复核短临雷达和道路湿滑风险。",
      },
    ],
  }),
  genericProbabilityOnlyTraceRainCase: makeFixture("genericProbabilityOnlyTraceRainCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: 82,
      precipitationAmountMm: 0.05,
    }),
    cloudSeaScore: 84,
    formationScore: 86,
    shootableScore: 82,
    whiteoutRiskScore: 24,
    recommendationLabel: "推荐重点关注",
  }),
  genericLightShowerNearWindowCase: makeFixture("genericLightShowerNearWindowCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: 70,
      precipitationAmountMm: 0.25,
    }),
    cloudSeaScore: 78,
    formationScore: 80,
    shootableScore: 74,
    whiteoutRiskScore: 30,
    recommendationLabel: "推荐安排",
  }),
  genericMeaningfulRainNearWindowCase: makeFixture("genericMeaningfulRainNearWindowCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: 72,
      precipitationAmountMm: 0.5,
    }),
    cloudSeaScore: 72,
    formationScore: 78,
    shootableScore: 66,
    whiteoutRiskScore: 36,
    recommendationLabel: "推荐安排",
    rainOpening: {
      rainSupportSignal: false,
      activeRainDuringWindow: true,
      postRainOpeningChance: "low",
      messageZh: "主窗口附近存在可计量降水，需按真实雨量准备防水并考虑降级。",
    },
  }),
  genericHeavyRainCase: makeFixture("genericHeavyRainCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: 86,
      precipitationAmountMm: 3,
    }),
    cloudSeaScore: 70,
    formationScore: 78,
    shootableScore: 62,
    whiteoutRiskScore: 42,
    recommendationLabel: "推荐安排",
    rainOpening: {
      rainSupportSignal: false,
      activeRainDuringWindow: true,
      postRainOpeningChance: "low",
      messageZh: "主窗口附近存在强降水风险，需优先复核通行安全。",
    },
  }),
  genericRainOutsideWindowCase: makeFixture("genericRainOutsideWindowCase", {
    rows: [
      professionalHourlyRow({
        time: "2026-05-20T14:00:00+08:00",
        timeLabel: "14:00",
        precipitationProbabilityPercent: 86,
        precipitationAmountMm: 3,
      }),
    ],
    cloudSeaScore: 84,
    formationScore: 86,
    shootableScore: 82,
    whiteoutRiskScore: 24,
    recommendationLabel: "推荐重点关注",
  }),
  genericMissingAmountWithProbabilityCase: makeFixture(
    "genericMissingAmountWithProbabilityCase",
    {
      rows: completeCloudSeaRows({
        precipitationProbabilityPercent: 78,
        precipitationAmountMm: null,
      }),
      cloudSeaScore: 78,
      formationScore: 80,
      shootableScore: 74,
      whiteoutRiskScore: 30,
      recommendationLabel: "推荐安排",
    },
  ),
  genericAmountWithoutProbabilityCase: makeFixture("genericAmountWithoutProbabilityCase", {
    rows: completeCloudSeaRows({
      precipitationProbabilityPercent: null,
      precipitationAmountMm: 1.2,
    }),
    cloudSeaScore: 72,
    formationScore: 78,
    shootableScore: 66,
    whiteoutRiskScore: 36,
    recommendationLabel: "推荐安排",
  }),
  genericHumidityDewPointConflictCase: makeFixture("genericHumidityDewPointConflictCase", {
    rows: completeCloudSeaRows({
      relativeHumidityPercent: 96,
      dewPointSpreadC: 7,
      visibilityMeters: 15000,
    }),
    cloudSeaScore: 80,
    formationScore: 82,
    shootableScore: 78,
    whiteoutRiskScore: 62,
    recommendationLabel: "推荐重点关注",
  }),
  genericLowScoreContradictionCase: makeFixture("genericLowScoreContradictionCase", {
    rows: completeCloudSeaRows({
      cloudTotalPercent: 42,
      cloudLowPercent: 18,
      relativeHumidityPercent: 66,
      dewPointSpreadC: 8,
      visibilityMeters: 22000,
      cloudSeaSignal: "普通",
      cloudSeaSignalLevel: "neutral",
    }),
    cloudSeaScore: 32,
    formationScore: 34,
    shootableScore: 32,
    whiteoutRiskScore: 42,
    recommendationLabel: "强推荐专程",
    bestWindows: [cloudSeaWindow({ score: 32, shootableScore: 32, formationScore: 34 })],
    dailyRecommendationLabel: "强推荐专程",
    dailyKeyReason: "低分矛盾 fixture 故意给出强文案，最终页面必须由 guard 降级。",
  }),
  genericUnknownTerrainCase: makeFixture("genericUnknownTerrainCase", {
    terrain: genericUnknownTerrain,
    rows: completeCloudSeaRows(),
    cloudSeaScore: 76,
    formationScore: 78,
    shootableScore: 74,
    whiteoutRiskScore: 34,
    recommendationLabel: "推荐重点关注",
    missingDataNotes: ["地形数据不足，云海判断需要复核现场高差。"],
  }),
};

export const allCloudSeaRegressionFixtures = Object.values(cloudSeaRegressionFixtures);

export function cloudSeaRegressionFixture(
  name: CloudSeaRegressionFixtureName,
): CloudSeaRegressionFixture {
  return cloudSeaRegressionFixtures[name];
}

function makeFixture(
  name: CloudSeaRegressionFixtureName,
  overrides: CloudSeaFixtureOverrides,
): CloudSeaRegressionFixture {
  const terrain = { ...genericHighMountainTerrain, ...overrides.terrain };
  const rows = overrides.rows ?? completeCloudSeaRows();
  const cloudSeaScore = overrides.cloudSeaScore ?? 82;
  const formationScore = overrides.formationScore ?? 84;
  const shootableScore = overrides.shootableScore ?? 80;
  const whiteoutRiskScore = overrides.whiteoutRiskScore ?? 28;
  const recommendationLabel = overrides.recommendationLabel ?? "推荐重点关注";
  const confidenceLevel = terrain.terrainConfidence === "high" ? "high" : "medium";
  const scoreCalibration =
    overrides.scoreCalibration ??
    cloudSeaScoreCalibration({
      formationScore,
      shootableScore,
      confidenceLevel,
      recommendationLabel,
    });
  const rainOpening =
    overrides.rainOpening ??
    ({
      rainSupportSignal: false,
      activeRainDuringWindow: false,
      postRainOpeningChance: "low",
      messageZh: "降水影响低，重点复核低云高度、湿度和能见度。",
    } as const);
  const bestWindow =
    overrides.bestWindow ??
    cloudSeaWindow({
      score: shootableScore,
      formationScore,
      shootableScore,
      whiteoutRiskScore,
      scoreCalibration,
      rainOpening,
    });
  const bestWindows = overrides.bestWindows ?? [bestWindow];
  const watchableWindows = overrides.watchableWindows ?? [
    cloudSeaWindow({
      label: "傍晚云层观察窗口 17:20 - 18:40",
      date: "2026-05-20",
      startTime: "2026-05-20T17:20:00+08:00",
      endTime: "2026-05-20T18:40:00+08:00",
      score: Math.max(42, Math.min(62, shootableScore - 12)),
      formationScore: Math.max(45, formationScore - 10),
      shootableScore: Math.max(40, shootableScore - 14),
      whiteoutRiskScore: Math.min(68, whiteoutRiskScore + 10),
      scoreCalibration: cloudSeaScoreCalibration({
        formationScore: Math.max(45, formationScore - 10),
        shootableScore: Math.max(40, shootableScore - 14),
        confidenceLevel,
        recommendationLabel,
      }),
      phase: "waiting",
      noteZh: "傍晚窗口仅作观察备选，现场复核云层开口和通透度。",
      riskTag: "备选观察",
      rainOpening,
    }),
  ];
  const notRecommendedWindows = overrides.notRecommendedWindows ?? [];

  const result = {
    place: {
      id: `fixture-${name}`,
      name: terrain.placeName,
      countryCode: "CN",
      adminArea: "genericAdminArea",
      locality: "genericLocality",
      coordinates: {
        latitude: 30.12,
        longitude: 118.16,
        system: "wgs84",
      },
    },
    horizon: "48h",
    target: "cloud_sea",
    forecastStart,
    forecastEnd,
    targetDates: ["2026-05-20", "2026-05-21"],
    calendarBasis: {
      forecastStart,
      forecastEnd,
      forecastStartLabel: "2026年5月20日 00:00",
      forecastEndLabel: "2026年5月22日 00:00",
      forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月22日 00:00",
      targetDates: ["2026-05-20", "2026-05-21"],
      targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四"],
      horizonHours: 48,
      timezone,
      timezoneLabel: "中国标准时间",
      calendarDays: [],
      wgs84Coordinates: {
        latitude: 30.12,
        longitude: 118.16,
      },
      coordinateSource: "synthetic fixture",
    },
    overallScore: shootableScore,
    recommendationLevel:
      cloudSeaScore >= 70 ? "recommended" : cloudSeaScore >= 45 ? "cautious" : "not_recommended",
    recommendationLabel,
    summary: `${terrain.placeName} synthetic Cloud Sea regression result.`,
    scores: {
      sunriseGlow: score("sunriseGlow", "朝霞", 58),
      sunsetGlow: score("sunsetGlow", "晚霞", 62),
      cloudSea: score("cloudSea", "云海", cloudSeaScore),
      whiteoutRisk: score("whiteoutRisk", "白墙风险", whiteoutRiskScore),
      stars: score("stars", "星空", 40),
      milkyWay: score("milkyWay", "银河", 38),
      transparency: score("transparency", "通透度", visibilityScoreFromRows(rows)),
    },
    cloudSeaAnalysis: {
      overallScore: cloudSeaScore,
      formationScore,
      shootableScore,
      cloudSeaOpportunityScore: formationScore,
      whiteoutRiskScore,
      lightAlignedScore: 82,
      confidence: 78,
      scoreCalibration,
      labels: {
        formationOpportunity: chanceLabel(formationScore),
        shootableOpportunity: chanceLabel(shootableScore),
        whiteoutRisk: chanceLabel(whiteoutRiskScore),
        bestWindowLabel: bestWindow.label,
        watchableWindowLabel: watchableWindows[0]?.label,
      },
      terrainSupport: {
        score: terrain.terrainScore,
        level: chanceLabel(terrain.terrainScore),
        terrainMode: terrain.terrainMode,
        selectedSpotElevationMeters: terrain.elevationMeters ?? undefined,
        nearbyValleyElevationMeters: terrain.nearbyValleyElevationMeters ?? undefined,
        localReliefMeters: terrain.surroundingReliefMeters ?? undefined,
        terrainType: terrain.terrainType,
        exposureType: terrain.terrainType === "city" ? "unknown" : "exposed",
        confidence: terrain.terrainConfidence,
        messageZh:
          terrain.elevationMeters === null
            ? "地形数据不足，需要复核机位海拔和周边高差。"
            : "synthetic terrain fixture",
      },
      rainOpening,
      travelScore: shootableScore,
      recommendationLabel,
      confidenceLevel,
      bestCloudSeaWindow: bestWindow,
      bestCloudSeaWindows: bestWindows,
      watchableCloudSeaWindows: watchableWindows,
      notRecommendedCloudSeaWindows: notRecommendedWindows,
      dailyCloudSea: [
        {
          date: "2026-05-20",
          dateLabelZh: "2026年5月20日 星期三",
          formationScore,
          opportunityScore: formationScore,
          shootableScore,
          whiteoutRiskScore,
          lightAlignedScore: 82,
          confidence: 78,
          scoreCalibration,
          labels: {
            formationOpportunity: chanceLabel(formationScore),
            shootableOpportunity: chanceLabel(shootableScore),
            whiteoutRisk: chanceLabel(whiteoutRiskScore),
            bestWindowLabel: bestWindow.label,
            watchableWindowLabel: watchableWindows[0]?.label,
          },
          travelScore: shootableScore,
          bestWindow,
          watchableWindow: watchableWindows[0],
          rainOpening,
          onSiteCheckpoints: [
            "复核低云高度是否低于机位",
            "复核远山层次和能见度是否可用",
            "复核短临降水量而不是只看概率",
          ],
          recommendationLabel: overrides.dailyRecommendationLabel ?? recommendationLabel,
          keyReason:
            overrides.dailyKeyReason ??
            "低云、湿度、露点差、能见度和地形条件共同构成 synthetic 判断。",
          riskNote: "出发前仍需复核短临预报和现场云层变化。",
        },
      ],
      weatherEvidence: weatherEvidenceFromRows(rows),
      terrainEvidence: terrainEvidence(terrain),
      whiteoutReasons: ["低云接近机位时可能遮挡视野，需结合能见度和现场云顶高度复核。"],
      opportunityReasons: ["低云、湿度、露点差、风速和地形共同决定云海机会。"],
      travelRecommendations: [
        {
          situation: "已在山上",
          action: "可按窗口观察",
          detail: "重点复核低云是否低于机位、远山层次是否打开。",
        },
        {
          situation: "周边短途",
          action: "谨慎作为备选",
          detail: "只在短临预报继续支持时再移动。",
        },
        {
          situation: "远途专程",
          action: "需要结合最终推荐",
          detail: "专程出发必须同时满足分数、地形、云层和风险。",
        },
      ],
      backupPlans: [
        {
          condition: "云海证据不足",
          action: "转向霞光或云层纹理",
          detail: "如果低云信号不足，优先拍摄层云、远山和局部光线。",
        },
      ],
      missingDataNotes: overrides.missingDataNotes ?? [],
      dataMode: "fixture",
    },
    glowAnalysis: minimalGlowAnalysis(),
    astroAnalysis: minimalAstroAnalysis(),
    terrainSummary: {
      elevationMeters: terrain.elevationMeters,
      terrainCloudSeaPotential: terrain.terrainScore >= 70 ? "high" : "low",
    },
    terrainAnalysis: {
      dataSourceLabelZh: "synthetic terrain fixture",
      honestyNoteZh: "地形数据来自 synthetic fixture，仅用于回归测试。",
      isMock: false,
      terrainProfile: {
        elevationMeters: terrain.elevationMeters,
        locationElevation: terrain.elevationMeters,
        nearbyValleyElevationMeters: terrain.nearbyValleyElevationMeters,
        localReliefMeters: terrain.surroundingReliefMeters,
        elevationDiff5km: terrain.surroundingReliefMeters,
        terrainType: terrain.terrainType,
        elevationConfidence: terrain.terrainConfidence,
        terrainCloudSeaPotential: terrain.terrainScore >= 70 ? "high" : "low",
      },
    },
    astroSummaries: [],
    dailySummaries: dailySummaries(rows),
    targetDailyBreakdown: [],
    bestWindows: bestWindows.map((window) => timeWindowFromCloudSeaWindow(window)),
    riskFlags: overrides.riskFlags ?? [],
    keyReasons: ["synthetic Cloud Sea regression fixture"],
    photographyAdvice: ["出发前复核短临预报和现场云层变化。"],
    dataNotice: "synthetic fixture",
    isMock: false,
    dataSourceLabel: "synthetic fixture",
    generatedAt,
    currentWeather: currentWeatherFromRow(rows[0]),
    clothingGuide: {
      titleZh: "防潮防滑",
      summaryZh: "清晨湿冷，按防潮、防滑和轻量保暖准备。",
      layers: ["轻量保暖层", "防风外层"],
      accessories: ["镜头布", "防水袋", "稳定三脚架"],
      riskNotes: ["湿滑路面和低云遮挡需要现场复核。"],
      comfortLevel: "cool",
      clothingAdviceZh: "准备防潮、防滑和轻量保暖层。",
      gearAdviceZh: "镜头布、防水袋、稳定三脚架。",
      riskNoteZh: "湿滑路面和低云遮挡需要现场复核。",
    },
    weatherProviderCode: "synthetic",
    weatherProviderLabelZh: "synthetic fixture",
    weatherDataMode: "fixture",
    weatherNoticeZh: "synthetic fixture",
    weatherMissingFields: overrides.weatherMissingFields ?? [],
    weatherEstimatedFields: [],
    weatherSourceSummaries: [],
    weatherMissingDataNotes: overrides.weatherMissingDataNotes ?? [],
    weatherFusionSummary: overrides.weatherFusionSummary,
    professionalHourlyData: rows,
    professionalHourlyDataTimeBasis: {
      startTime: rows[0]?.time ?? forecastStart,
      endTime: rows.at(-1)?.time ?? "2026-05-20T07:00:00+08:00",
      stepMinutes: 60,
      timezone,
      temperatureBasis: rows[0]?.temperatureBasis ?? "unknown",
      temperatureBasisNoteZh: rows[0]?.temperatureBasisNoteZh ?? "温度口径待复核",
      cloudLayerBasis: rows.some((row) => row.cloudLayerBasis === "total_only")
        ? "total_only"
        : "explicit_layers",
      cloudLayerBasisNoteZh: "总云量 + 高/中/低云分层",
      partialData: rows.some((row) => (row.missingFields?.length ?? 0) > 0),
      missingDataNoteZh: rows.some((row) => (row.missingFields?.length ?? 0) > 0)
        ? "部分小时字段缺失，缺失值以 “—” 显示。"
        : undefined,
    },
    astroDataSourceLabelZh: "本地天文服务计算",
  } as unknown as ForecastCalculationResult;

  return {
    name,
    result,
    query: {
      name: terrain.placeName,
      source: "cloud_sea_regression_fixture",
      latitudeGcj02: 30.12,
      longitudeGcj02: 118.16,
      latitudeWgs84: 30.12,
      longitudeWgs84: 118.16,
      coordinateSource: "synthetic fixture",
      horizon: "48h",
      target: "cloud_sea",
      timezone,
      elevationMeters: terrain.elevationMeters,
      elevationConfidence: terrain.terrainConfidence,
      locationId: `fixture-${name}`,
    },
  };
}

function completeCloudSeaRows(
  overrides: Partial<ProfessionalHourlyDataPoint> = {},
): readonly ProfessionalHourlyDataPoint[] {
  return [5, 6, 7].map((hour) =>
    professionalHourlyRow({
      time: `2026-05-20T${String(hour).padStart(2, "0")}:00:00+08:00`,
      timeLabel: `${String(hour).padStart(2, "0")}:00`,
      ...overrides,
    }),
  );
}

function totalOnlyRows(): readonly ProfessionalHourlyDataPoint[] {
  return completeCloudSeaRows({
    cloudTotalPercent: 88,
    cloudHighPercent: null,
    cloudMidPercent: null,
    cloudLowPercent: null,
    cloudLayerBasis: "total_only",
    cloudSeaSignal: "需复核",
    cloudSeaSignalLevel: "review",
    missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
  });
}

function professionalHourlyRow(
  overrides: Partial<ProfessionalHourlyDataPoint> = {},
): ProfessionalHourlyDataPoint {
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

function cloudSeaWindow(
  overrides: Partial<
    ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number]
  > = {},
): ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number] {
  return {
    label: "清晨云海窗口 05:00 - 07:00",
    date: "2026-05-20",
    startTime: "2026-05-20T05:00:00+08:00",
    endTime: "2026-05-20T07:00:00+08:00",
    score: 80,
    formationScore: 84,
    shootableScore: 80,
    whiteoutRiskScore: 28,
    lightAlignedScore: 82,
    target: "cloud_sea",
    phase: "observation",
    noteZh: "清晨低云、湿度和通透度支持观察，仍需现场复核云顶高度。",
    riskTag: "风险可控",
    rainOpening: {
      rainSupportSignal: false,
      activeRainDuringWindow: false,
      postRainOpeningChance: "low",
      messageZh: "降水影响低。",
    },
    ...overrides,
  };
}

function timeWindowFromCloudSeaWindow(
  window: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number],
): ForecastTimeWindow {
  return {
    label: window.label,
    date: window.date,
    startTime: window.startTime,
    endTime: window.endTime,
    score: window.shootableScore ?? window.score,
    target: "cloud_sea",
    conditionScore: window.formationScore ?? window.score,
    practicalScore: window.shootableScore ?? window.score,
    recommendationLevel: (window.shootableScore ?? window.score) >= 70 ? "recommended" : "backup",
    windowLevel: (window.shootableScore ?? window.score) >= 70 ? "best" : "watchable",
    executableForDedicatedTrip: (window.shootableScore ?? window.score) >= 70,
    suitableIfNearby: true,
    copyReasonZh: window.noteZh,
    practicalKind: "shooting_window",
    lightPhase: "sunrise",
    subjectPriorityLabel: "清晨云海",
    backupSubjectLabel: "霞光或云层纹理",
    arrivalAdvice: {
      recommendedArrivalTime: "2026-05-20T03:30:00+08:00",
      recommendedArrivalLabel: "03:30 前到达",
      setupBufferMinutes: 90,
      reasonZh: "预留上山、找机位和复核云雾变化时间。",
    },
  };
}

function score(key: string, label: string, value: number): ForecastScore {
  return {
    key,
    label,
    score: value,
    level: value >= 80 ? "excellent" : value >= 65 ? "good" : value >= 45 ? "fair" : "poor",
    reasons: [`${label} synthetic evidence`],
    risks: [],
  };
}

function chanceLabel(value: number): "高" | "中" | "低" {
  if (value >= 70) {
    return "高";
  }
  if (value >= 45) {
    return "中";
  }
  return "低";
}

function visibilityScoreFromRows(rows: readonly ProfessionalHourlyDataPoint[]): number {
  const visibilityKm = Math.max(
    ...rows.map((row) => (row.visibilityMeters ?? 0) / 1000).filter(Number.isFinite),
  );
  if (visibilityKm >= 15) {
    return 78;
  }
  if (visibilityKm >= 8) {
    return 66;
  }
  return 42;
}

function weatherEvidenceFromRows(
  rows: readonly ProfessionalHourlyDataPoint[],
): ForecastCalculationResult["cloudSeaAnalysis"]["weatherEvidence"] {
  const first = rows[0] ?? professionalHourlyRow();
  return [
    {
      label: "湿度",
      value: percentText(first.relativeHumidityPercent),
      effect: "positive",
      noteZh: "湿度接近饱和有利于低云或雾气形成，但需要与露点差共同判断。",
    },
    {
      label: "露点差",
      value: first.dewPointSpreadC === null ? "未知" : `${first.dewPointSpreadC}°C`,
      effect: "positive",
      noteZh: "露点差越小，水汽越接近凝结。",
    },
    {
      label: "风速",
      value: first.windSpeedMs === null ? "未知" : `${first.windSpeedMs} m/s`,
      effect: "neutral",
      noteZh: "风速需要与云层移动方向共同复核。",
    },
    {
      label: "能见度",
      value:
        first.visibilityMeters === null
          ? "未知"
          : `${Math.round(first.visibilityMeters / 1000)} km`,
      effect: "positive",
      noteZh: "中等能见度更利于看到云海边界，过低时需要警惕白墙。",
    },
    {
      label: "降水",
      value: `${first.precipitationProbabilityPercent ?? "未知"}% / ${
        first.precipitationAmountMm ?? "未知"
      } mm`,
      effect: (first.precipitationAmountMm ?? 0) >= 1 ? "risk" : "neutral",
      noteZh: "主窗口有可计量降水时，需要按真实雨量准备防水并考虑降级。",
    },
    {
      label: "低云",
      value: percentText(first.cloudLowPercent),
      effect: (first.cloudLowPercent ?? 0) >= 55 ? "positive" : "neutral",
      noteZh: "低云是云海判断的直接证据，中高云只能作为霞光或纹理参考。",
    },
  ];
}

function terrainEvidence(
  terrain: GenericTerrainInput,
): ForecastCalculationResult["cloudSeaAnalysis"]["terrainEvidence"] {
  return [
    {
      label: "机位海拔",
      value: terrain.elevationMeters === null ? "未知" : `${terrain.elevationMeters} m`,
      effect:
        terrain.elevationMeters !== null && terrain.elevationMeters >= 1200
          ? "positive"
          : "neutral",
      noteZh: "机位海拔用于判断是否可能高于谷地云雾层。",
    },
    {
      label: "周边高差",
      value:
        terrain.surroundingReliefMeters === null ? "未知" : `${terrain.surroundingReliefMeters} m`,
      effect:
        terrain.surroundingReliefMeters !== null && terrain.surroundingReliefMeters >= 500
          ? "positive"
          : "neutral",
      noteZh: "周边高差用于判断是否具备云海地形基础。",
    },
  ];
}

function dailySummaries(
  rows: readonly ProfessionalHourlyDataPoint[],
): ForecastCalculationResult["dailySummaries"] {
  const first = rows[0] ?? professionalHourlyRow();
  return [
    {
      date: "2026-05-20",
      dateLabelZh: "2026年5月20日 星期三",
      lunarDateText: "四月初五",
      score: 72,
      recommendationLabel: "谨慎参考",
      target: "cloud_sea",
      weather: {
        weatherTextZh: first.weatherText ?? "多云",
        temperatureMax: 16,
        temperatureMin: 8,
        humidity: first.relativeHumidityPercent,
        dewPointSpread: first.dewPointSpreadC,
        windSpeed: first.windSpeedMs,
        windDirection: first.windDirectionDeg,
        windGust: null,
        precipitationProbability: first.precipitationProbabilityPercent,
        precipitationAmountMm: first.precipitationAmountMm,
        rainAmountMm: first.precipitationAmountMm,
        precipitation: first.precipitationAmountMm,
        visibility: first.visibilityMeters === null ? null : first.visibilityMeters / 1000,
        rawVisibilityKm: first.visibilityMeters === null ? null : first.visibilityMeters / 1000,
        cloudTotal: first.cloudTotalPercent,
        cloudLow: first.cloudLowPercent,
        cloudMid: first.cloudMidPercent,
        cloudHigh: first.cloudHighPercent,
        transparencyGrade: "good",
      },
      keyWindows: [],
      riskFlags: [],
      shortAdvice: "复核低云、通透度和降水。",
    },
  ] as unknown as ForecastCalculationResult["dailySummaries"];
}

function currentWeatherFromRow(
  row: ProfessionalHourlyDataPoint | undefined,
): ForecastCalculationResult["currentWeather"] {
  const source = row ?? professionalHourlyRow();
  return {
    providerCode: "synthetic",
    providerLabelZh: "synthetic fixture",
    dataMode: "fixture",
    observedAt: source.time,
    temperature: source.displayedTemperatureC ?? 10,
    rawTemperature: source.rawTemperatureC ?? undefined,
    elevationAdjustedTemperature: source.terrainAdjustedTemperatureC ?? undefined,
    feelsLike: source.displayedTemperatureC,
    humidity: source.relativeHumidityPercent ?? 80,
    dewPoint: source.dewPointC,
    dewPointSpread: source.dewPointSpreadC,
    windSpeed: source.windSpeedMs ?? 2,
    windDirection: source.windDirectionDeg,
    windGust: null,
    pressure: null,
    visibility: source.visibilityMeters === null ? null : source.visibilityMeters / 1000,
    rawVisibilityKm: source.visibilityMeters === null ? null : source.visibilityMeters / 1000,
    cloudTotal: source.cloudTotalPercent,
    cloudLow: source.cloudLowPercent,
    cloudMid: source.cloudMidPercent,
    cloudHigh: source.cloudHighPercent,
    precipitation: source.precipitationAmountMm,
    precipitationAmountMm: source.precipitationAmountMm,
    rainAmountMm: source.precipitationAmountMm,
    precipitationProbability: source.precipitationProbabilityPercent,
    weatherCode: source.weatherCode,
    weatherTextZh: source.weatherText,
    sourceConfidence: 0.8,
    missingFields: source.missingFields ?? [],
    estimatedFields: [],
  } as ForecastCalculationResult["currentWeather"];
}

function minimalGlowAnalysis(): ForecastCalculationResult["glowAnalysis"] {
  return {
    sunriseGlowScore: 40,
    sunsetGlowScore: 42,
    lowCloudObstructionRisk: 40,
    colorCarrierScore: 45,
    precipitationDisruptionRisk: 20,
    visibilityColorQualityScore: 60,
    practicalGlowScore: 42,
    confidence: 50,
    labels: {
      sunriseGlowOpportunity: "低",
      sunsetGlowOpportunity: "低",
      lowCloudObstruction: "中",
      colorCarrier: "一般",
      bestWindowLabel: "暂无明确霞光窗口",
    },
    glowTravelScore: 42,
    rainOverlapsSunriseWindow: false,
    rainOverlapsSunsetWindow: false,
    postRainOpeningChance: "low",
    glowWindowRainRisk: "low",
    recommendationLabel: "谨慎参考",
    confidenceLevel: "medium",
    bestGlowWindows: [],
    watchableGlowWindows: [],
    notRecommendedGlowWindows: [],
    dailyGlow: [],
    cloudLayerEvidence: [],
    visibilityEvidence: [],
    terrainObstructionEvidence: [],
    riskReasons: [],
    opportunityReasons: [],
    travelRecommendations: [],
    backupPlans: [],
    missingDataNotes: [],
    dataMode: "fixture",
  } as unknown as ForecastCalculationResult["glowAnalysis"];
}

function minimalAstroAnalysis(): ForecastCalculationResult["astroAnalysis"] {
  return {
    starsScore: 35,
    milkyWayScore: 32,
    astroConditionScore: 35,
    astroPracticalScore: 32,
    astronomicalWindowScore: 40,
    skyConditionScore: 35,
    milkyWayGeometryScore: 30,
    moonlightImpactScore: 50,
    transparencyScore: 60,
    dewRiskScore: 50,
    astroWindowAvailable: false,
    astroShootable: false,
    cloudBlockerLevel: "medium",
    dewRiskLevel: "medium",
    tripodWindRisk: "low",
    labels: {
      astronomicalWindow: "低",
      starShootability: "低",
      milkyWayShootability: "低",
      moonlightImpact: "中",
      cloudBlocker: "中",
      dewRisk: "中",
      windowRecommendation: "仅作备选窗口",
    },
    recommendationLabel: "谨慎参考",
    confidenceLevel: "medium",
    dailyAstro: [],
    recommendedMilkyWayWindows: [],
    candidateMilkyWayWindows: [],
    moonlessNightWindows: [],
    astronomicalNightWindows: [],
    cloudEvidence: [],
    visibilityEvidence: [],
    lightPollutionEvidence: [],
    terrainEvidence: [],
    riskReasons: [],
    travelRecommendations: [],
    backupPlans: [],
    gearAdviceZh: [],
    warmthAdviceZh: "",
    missingDataNotes: [],
    dataMode: "fixture",
  } as unknown as ForecastCalculationResult["astroAnalysis"];
}

function percentText(value: number | null | undefined): string {
  return value === null || value === undefined ? "未知" : `${value}%`;
}

export function lowCloudDisagreementContext(): ForecastMultiSourceAgreementContext {
  const messageZh = "多源低云判断分歧较大，云海形成与白墙风险需要结合临近预报复核。";

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
