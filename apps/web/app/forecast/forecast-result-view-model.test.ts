import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  forecastTargetLabels,
  type CloudSeaScoreCalibrationContext,
  type ForecastCalculationResult,
  type ForecastMultiSourceAgreementContext,
  type ForecastQueryInput,
  type ForecastScore,
} from "@photo-weather/shared";
import {
  AiExplanationPanel,
  ComprehensiveForecastView,
  AstroResultPage,
  CloudSeaResultPage,
  ForecastDecisionErrorState,
  ForecastDecisionLoadingState,
  ForecastResultClient,
  GlowResultPage,
  SourceDiagnosticsPanel,
  aiExplainFrontendTimeoutMs,
  cacheAiExplanation,
  createAiExplanationCacheKey,
  deepSeekBackendTimeoutMaxMs,
  normalizeAiExplanationContent,
  normalizeAiExplainResponse,
  providerDiagnosticText,
  readCachedAiExplanation,
  resolveForecastPageMode,
  shouldStartAiExplanationRequest,
} from "./forecast-result-client";
import {
  buildAstroForecastViewModel,
  buildCloudSeaForecastViewModel,
  buildForecastResultViewModel,
  buildGlowForecastViewModel,
} from "./forecast-result-view-model";
import {
  buildCloudSeaTerrainContext,
  cloudSeaTerrainRecommendationLabel,
} from "./cloud-sea-terrain-context";
import {
  buildGeneralDailySubjectLinks,
  buildSubjectDetailDeepLink,
  createForecastResultContextId,
  parseSubjectDetailSearchParams,
} from "./subject-detail-links";

vi.mock("next/navigation", () => ({
  usePathname: () => "/forecast",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

function firstOnClickHandler(node: React.ReactNode): (() => void) | null {
  if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(node)) {
    return null;
  }
  if (typeof node.props.onClick === "function") {
    return node.props.onClick;
  }

  for (const child of React.Children.toArray(node.props.children)) {
    const handler = firstOnClickHandler(child);
    if (handler) {
      return handler;
    }
  }

  return null;
}

function score(key: string, label: string, value: number): ForecastScore {
  return {
    key,
    label,
    score: value,
    level: value >= 80 ? "excellent" : value >= 65 ? "good" : value >= 45 ? "fair" : "poor",
    reasons: [`${label}判断依据`],
    risks: [`${label}风险提示`],
  };
}

function cloudSeaScoreCalibrationForTest(
  overrides: Partial<CloudSeaScoreCalibrationContext> = {},
): CloudSeaScoreCalibrationContext {
  const rawFormationScore = overrides.rawFormationScore ?? overrides.calibratedFormationScore ?? 82;
  const rawShootabilityScore =
    overrides.rawShootabilityScore ?? overrides.calibratedShootabilityScore ?? 72;
  const calibratedFormationScore = overrides.calibratedFormationScore ?? rawFormationScore;
  const calibratedShootabilityScore =
    overrides.calibratedShootabilityScore ?? overrides.finalCloudSeaScore ?? rawShootabilityScore;
  const finalCloudSeaScore = overrides.finalCloudSeaScore ?? calibratedShootabilityScore;

  return {
    rawFormationScore,
    rawShootabilityScore,
    calibratedFormationScore,
    calibratedShootabilityScore,
    finalCloudSeaScore,
    scoreBand: overrides.scoreBand ?? "good",
    confidenceLevel: overrides.confidenceLevel ?? "high",
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
    finalRecommendationLabel: overrides.finalRecommendationLabel ?? "推荐安排",
    shouldBlockStrongRecommendation: overrides.shouldBlockStrongRecommendation ?? false,
    shouldDowngradeToCautious: overrides.shouldDowngradeToCautious ?? false,
    shouldDowngradeToBackup: overrides.shouldDowngradeToBackup ?? false,
  };
}

type AstroAssessmentForTest = ForecastCalculationResult["astroAnalysis"]["assessment"];
type DailyAstroForTest = ForecastCalculationResult["astroAnalysis"]["dailyAstro"][number];

function astroAssessmentForTest(
  overrides: Partial<AstroAssessmentForTest> = {},
): AstroAssessmentForTest {
  const { labels: labelOverrides, ...fieldOverrides } = overrides;
  const labels = {
    astronomicalWindow: "有",
    starShootability: "中",
    milkyWayShootability: "中",
    moonlightImpact: "中",
    cloudBlocker: "低",
    dewRisk: "低",
    windowRecommendation: "推荐银河窗口",
    ...labelOverrides,
  } satisfies AstroAssessmentForTest["labels"];

  return {
    astronomicalWindowScore: 74,
    skyConditionScore: 72,
    milkyWayGeometryScore: 70,
    moonlightImpactScore: 38,
    transparencyScore: 72,
    dewRiskScore: 24,
    practicalAstroScore: 68,
    astroWindowAvailable: true,
    astroShootable: true,
    moonImpactLevel: "medium",
    cloudBlockerLevel: "low",
    dewRiskLevel: "low",
    tripodWindRisk: "low",
    astroWeatherBlockers: [],
    moonImpactReasonsZh: ["月光影响中等。"],
    gearAdviceZh: ["三脚架、头灯、备用电池和离线导航保持常备。"],
    warmthAdviceZh: "夜间建议准备防风保暖层。",
    ...fieldOverrides,
    labels,
  };
}

function astroAnalysisFieldsForTest(
  assessment = astroAssessmentForTest(),
): Pick<
  ForecastCalculationResult["astroAnalysis"],
  | "astronomicalWindowScore"
  | "skyConditionScore"
  | "milkyWayGeometryScore"
  | "moonlightImpactScore"
  | "dewRiskScore"
  | "practicalAstroScore"
  | "labels"
  | "cloudBlockerLevel"
  | "dewRiskLevel"
  | "tripodWindRisk"
  | "assessment"
  | "recommendedMilkyWayWindow"
  | "gearAdviceZh"
  | "warmthAdviceZh"
> {
  return {
    astronomicalWindowScore: assessment.astronomicalWindowScore,
    skyConditionScore: assessment.skyConditionScore,
    milkyWayGeometryScore: assessment.milkyWayGeometryScore,
    moonlightImpactScore: assessment.moonlightImpactScore,
    dewRiskScore: assessment.dewRiskScore,
    practicalAstroScore: assessment.practicalAstroScore,
    labels: assessment.labels,
    cloudBlockerLevel: assessment.cloudBlockerLevel,
    dewRiskLevel: assessment.dewRiskLevel,
    tripodWindRisk: assessment.tripodWindRisk,
    assessment,
    recommendedMilkyWayWindow: assessment.recommendedMilkyWayWindow,
    gearAdviceZh: assessment.gearAdviceZh,
    warmthAdviceZh: assessment.warmthAdviceZh,
  };
}

function dailyAstroFieldsForTest(
  assessment = astroAssessmentForTest(),
): Pick<
  DailyAstroForTest,
  | "astronomicalWindowScore"
  | "skyConditionScore"
  | "milkyWayGeometryScore"
  | "moonlightImpactScore"
  | "transparencyScore"
  | "dewRiskScore"
  | "practicalAstroScore"
  | "astroWindowAvailable"
  | "cloudBlockerLevel"
  | "dewRiskLevel"
  | "tripodWindRisk"
  | "labels"
  | "gearAdviceZh"
  | "warmthAdviceZh"
  | "assessment"
> {
  return {
    astronomicalWindowScore: assessment.astronomicalWindowScore,
    skyConditionScore: assessment.skyConditionScore,
    milkyWayGeometryScore: assessment.milkyWayGeometryScore,
    moonlightImpactScore: assessment.moonlightImpactScore,
    transparencyScore: assessment.transparencyScore,
    dewRiskScore: assessment.dewRiskScore,
    practicalAstroScore: assessment.practicalAstroScore,
    astroWindowAvailable: assessment.astroWindowAvailable,
    cloudBlockerLevel: assessment.cloudBlockerLevel,
    dewRiskLevel: assessment.dewRiskLevel,
    tripodWindRisk: assessment.tripodWindRisk,
    labels: assessment.labels,
    gearAdviceZh: assessment.gearAdviceZh,
    warmthAdviceZh: assessment.warmthAdviceZh,
    assessment,
  };
}

const baseResult: ForecastCalculationResult = {
  place: {
    id: "mock-place-huangshan",
    name: "黄山光明顶",
    countryCode: "CN",
    adminArea: "安徽省",
    locality: "黄山市",
    coordinates: {
      latitude: 30.13012,
      longitude: 118.16389,
      system: "wgs84",
    },
  },
  horizon: "48h",
  target: "general",
  forecastStart: "2026-05-20T00:00:00+08:00",
  forecastEnd: "2026-05-22T00:00:00+08:00",
  targetDates: ["2026-05-20", "2026-05-21"],
  calendarBasis: {
    forecastStart: "2026-05-20T00:00:00+08:00",
    forecastEnd: "2026-05-22T00:00:00+08:00",
    forecastStartLabel: "2026年5月20日 00:00",
    forecastEndLabel: "2026年5月22日 00:00",
    forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月22日 00:00",
    targetDates: ["2026-05-20", "2026-05-21"],
    targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四"],
    horizonHours: 48,
    timezone: "Asia/Shanghai",
    timezoneLabel: "中国标准时间",
    calendarDays: [],
    wgs84Coordinates: {
      latitude: 30.13012,
      longitude: 118.16389,
    },
    coordinateSource: "用户选择地点 WGS84 坐标",
  },
  overallScore: 76,
  recommendationLevel: "worth_waiting",
  recommendationLabel: "值得等待",
  summary: "黄山光明顶模拟评分为 76 分。",
  scores: {
    sunriseGlow: score("sunriseGlow", "朝霞", 70),
    sunsetGlow: score("sunsetGlow", "晚霞", 74),
    cloudSea: score("cloudSea", "云海", 82),
    whiteoutRisk: score("whiteoutRisk", "白墙风险", 58),
    stars: score("stars", "星空", 66),
    milkyWay: score("milkyWay", "银河", 68),
    transparency: score("transparency", "通透度", 72),
  },
  cloudSeaAnalysis: {
    overallScore: 72,
    formationScore: 82,
    shootableScore: 72,
    cloudSeaOpportunityScore: 82,
    whiteoutRiskScore: 58,
    lightAlignedScore: 94,
    confidence: 76,
    scoreCalibration: cloudSeaScoreCalibrationForTest(),
    labels: {
      formationOpportunity: "高",
      shootableOpportunity: "高",
      whiteoutRisk: "中",
      bestWindowLabel: "清晨云海窗口 05:00 - 07:00",
      watchableWindowLabel: "傍晚云海观察窗口 17:20 - 18:40",
    },
    terrainSupport: {
      score: 90,
      level: "高",
      terrainMode: "high_mountain",
      selectedSpotElevationMeters: 1860,
      nearbyValleyElevationMeters: 980,
      localReliefMeters: 1484,
      providerElevationMeters: 1840,
      terrainType: "summit",
      exposureType: "exposed",
      confidence: "medium",
      messageZh: "机位高于周边谷地，高差和开阔度支持俯拍云海。",
    },
    rainOpening: {
      rainSupportSignal: true,
      activeRainDuringWindow: false,
      postRainOpeningChance: "medium",
      messageZh: "若雨势提前减弱，可机动观察云层流动和远山层次。",
    },
    travelScore: 72,
    recommendationLabel: "值得等待",
    confidenceLevel: "medium",
    bestCloudSeaWindow: {
      label: "清晨云海窗口 05:00 - 07:00",
      date: "2026-05-20",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
      score: 72,
      formationScore: 82,
      shootableScore: 72,
      whiteoutRiskScore: 58,
      lightAlignedScore: 94,
      target: "cloud_sea",
      phase: "observation",
      noteZh: "清晨云海窗口值得等待，现场重点复核云雾上沿和能见度。",
      riskTag: "白墙风险中",
      rainOpening: {
        rainSupportSignal: true,
        activeRainDuringWindow: false,
        postRainOpeningChance: "medium",
        messageZh: "若雨势提前减弱，可机动观察云层流动和远山层次。",
      },
    },
    bestCloudSeaWindows: [
      {
        label: "清晨云海窗口 05:00 - 07:00",
        date: "2026-05-20",
        startTime: "2026-05-20T05:00:00+08:00",
        endTime: "2026-05-20T07:00:00+08:00",
        score: 72,
        formationScore: 82,
        shootableScore: 72,
        whiteoutRiskScore: 58,
        lightAlignedScore: 94,
        target: "cloud_sea",
        phase: "observation",
        noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
        riskTag: "白墙风险中",
      },
      {
        label: "清晨云海窗口 05:00 - 07:00",
        date: "2026-05-21",
        startTime: "2026-05-21T05:00:00+08:00",
        endTime: "2026-05-21T07:00:00+08:00",
        score: 70,
        formationScore: 78,
        shootableScore: 70,
        whiteoutRiskScore: 55,
        lightAlignedScore: 94,
        target: "cloud_sea",
        phase: "observation",
        noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
        riskTag: "白墙风险中",
      },
    ],
    watchableCloudSeaWindows: [
      {
        label: "傍晚云海观察窗口 17:20 - 18:40",
        date: "2026-05-20",
        startTime: "2026-05-20T17:20:00+08:00",
        endTime: "2026-05-20T18:40:00+08:00",
        score: 52,
        formationScore: 70,
        shootableScore: 52,
        whiteoutRiskScore: 62,
        lightAlignedScore: 78,
        target: "cloud_sea",
        phase: "waiting",
        noteZh: "云海形成信号存在，但低云厚度和能见度限制可拍性，仅作观察。",
        riskTag: "白墙风险中",
      },
    ],
    notRecommendedCloudSeaWindows: [],
    dailyCloudSea: [
      {
        date: "2026-05-20",
        dateLabelZh: "2026年5月20日 星期三",
        formationScore: 82,
        opportunityScore: 82,
        shootableScore: 72,
        whiteoutRiskScore: 58,
        lightAlignedScore: 94,
        confidence: 76,
        labels: {
          formationOpportunity: "高",
          shootableOpportunity: "高",
          whiteoutRisk: "中",
          bestWindowLabel: "清晨云海窗口 05:00 - 07:00",
          watchableWindowLabel: "傍晚云海观察窗口 17:20 - 18:40",
        },
        travelScore: 72,
        bestWindow: {
          label: "清晨云海窗口 05:00 - 07:00",
          date: "2026-05-20",
          startTime: "2026-05-20T05:00:00+08:00",
          endTime: "2026-05-20T07:00:00+08:00",
          score: 72,
          formationScore: 82,
          shootableScore: 72,
          whiteoutRiskScore: 58,
          lightAlignedScore: 94,
          target: "cloud_sea",
          phase: "observation",
          noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
          riskTag: "白墙风险中",
        },
        rainOpening: {
          rainSupportSignal: true,
          activeRainDuringWindow: false,
          postRainOpeningChance: "medium",
          messageZh: "若雨势提前减弱，可机动观察云层流动和远山层次。",
        },
        onSiteCheckpoints: ["复核云雾上沿是否低于机位", "复核远山层次和能见度是否可用"],
        recommendationLabel: "值得等待",
        keyReason: "清晨湿度、低云和地形条件支持等待云海。",
        riskNote: "白墙风险中等，需要现场观察云雾上沿。",
      },
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        formationScore: 78,
        opportunityScore: 78,
        shootableScore: 70,
        whiteoutRiskScore: 55,
        lightAlignedScore: 94,
        confidence: 76,
        labels: {
          formationOpportunity: "高",
          shootableOpportunity: "高",
          whiteoutRisk: "中",
          bestWindowLabel: "清晨云海窗口 05:00 - 07:00",
        },
        travelScore: 70,
        bestWindow: {
          label: "清晨云海窗口 05:00 - 07:00",
          date: "2026-05-21",
          startTime: "2026-05-21T05:00:00+08:00",
          endTime: "2026-05-21T07:00:00+08:00",
          score: 70,
          formationScore: 78,
          shootableScore: 70,
          whiteoutRiskScore: 55,
          lightAlignedScore: 94,
          target: "cloud_sea",
          phase: "observation",
          noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
          riskTag: "白墙风险中",
        },
        rainOpening: {
          rainSupportSignal: false,
          activeRainDuringWindow: false,
          postRainOpeningChance: "low",
          messageZh: "降水对云海形成的支持不明显，仍以低云、湿度和能见度为主。",
        },
        onSiteCheckpoints: ["复核云雾上沿是否低于机位", "复核远山层次和能见度是否可用"],
        recommendationLabel: "值得等待",
        keyReason: "第二天清晨仍有云海观察窗口。",
        riskNote: "白墙风险中等，需要现场复核能见度。",
      },
    ],
    weatherEvidence: [
      {
        label: "湿度",
        value: "92%",
        effect: "positive",
        noteZh: "高湿度有利于山谷低云和雾形成。",
      },
      {
        label: "露点差",
        value: "1.8°C",
        effect: "positive",
        noteZh: "露点差越小，水汽越接近凝结。",
      },
      {
        label: "风速",
        value: "2.4 m/s",
        effect: "positive",
        noteZh: "0.5-4 m/s 更利于稳定云海。",
      },
      {
        label: "风向",
        value: "东南（135°）",
        effect: "neutral",
        noteZh: "正式风向与谷地方向结合后，可判断云雾是否向机位推移或被吹散。",
      },
      {
        label: "能见度",
        value: "14 km",
        effect: "positive",
        noteZh: "8-20km 更利于看见云海边界。",
      },
      {
        label: "降水",
        value: "12% / 0 mm",
        effect: "neutral",
        noteZh: "观测窗口内强降水会降低拍摄和通行价值。",
      },
      {
        label: "低云",
        value: "55%",
        effect: "positive",
        noteZh: "低云适中更接近云海；低云过厚时更接近白墙。",
      },
    ],
    terrainEvidence: [
      {
        label: "机位海拔",
        value: "1860 m",
        effect: "neutral",
        noteZh: "机位越可能高于谷地云雾层，越有机会俯拍云海。",
      },
      {
        label: "周边 1km 最低海拔",
        value: "980 m",
        effect: "neutral",
        noteZh: "用于判断近处谷地是否具备积雾空间。",
      },
      {
        label: "5km 高差",
        value: "1484 m",
        effect: "positive",
        noteZh: "高差明显，具备云海地形基础。",
      },
      {
        label: "云海地形潜力",
        value: "高",
        effect: "positive",
        noteZh: "演示地形数据显示山顶与周边谷地高差明显。",
      },
    ],
    whiteoutReasons: ["白墙风险中等，需要现场观察云雾上沿是否低于机位。"],
    opportunityReasons: ["清晨湿度、低云和地形条件支持等待云海。"],
    travelRecommendations: [
      {
        situation: "已在山上",
        action: "建议早起等待",
        detail: "等待价值较高，重点观察低云是否低于机位。",
      },
      {
        situation: "周边短途",
        action: "可作为备选",
        detail: "适合短途机动，不建议只押一个机位。",
      },
      {
        situation: "远途专程",
        action: "谨慎专程",
        detail: "建议等临近预报确认低云、能见度和降水再决定。",
      },
    ],
    backupPlans: [
      {
        condition: "白墙时",
        action: "转拍雾中树影、山路氛围、延时",
        detail: "降低远景预期，利用近景层次、人物比例和雾气流动完成素材。",
      },
      {
        condition: "无云海但通透",
        action: "转拍层峦、日出、长焦山脊",
        detail: "能见度较好时，远山层次和日出侧光仍有拍摄价值。",
      },
      {
        condition: "低云过厚",
        action: "等待风口或转更高机位",
        detail: "优先观察谷地方向是否出现云雾边界或短暂开口。",
      },
      {
        condition: "风大",
        action: "转拍流云延时",
        detail: "完整云海边界不稳定时，流云、山脊掠影和延时素材更可控。",
      },
    ],
    missingDataNotes: [],
    dataMode: "mock",
  },
  glowAnalysis: {
    sunriseGlowScore: 70,
    sunsetGlowScore: 74,
    lowCloudObstructionRisk: 42,
    colorCarrierScore: 76,
    precipitationDisruptionRisk: 18,
    visibilityColorQualityScore: 80,
    practicalGlowScore: 72,
    confidence: 72,
    labels: {
      sunriseGlowOpportunity: "中",
      sunsetGlowOpportunity: "高",
      lowCloudObstruction: "低",
      colorCarrier: "好",
      bestWindowLabel: "最佳霞光窗口：2026-05-20 晚霞峰值窗口 17:56-19:41",
      watchableWindowLabel: "可观察窗口：暂无",
      notRecommendedWindowLabel: "不建议窗口：暂无",
    },
    glowTravelScore: 72,
    rainOverlapsSunriseWindow: false,
    rainOverlapsSunsetWindow: false,
    postRainOpeningChance: "low",
    glowWindowRainRisk: "low",
    recommendationLabel: "值得等待",
    confidenceLevel: "medium",
    bestGlowWindows: [
      {
        type: "sunset",
        labelZh: "晚霞峰值窗口",
        date: "2026-05-20",
        start: "2026-05-20T17:56:00+08:00",
        end: "2026-05-20T19:41:00+08:00",
        score: 74,
        riskTags: ["风险可控"],
        noteZh: "晚霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
      },
      {
        type: "sunrise",
        labelZh: "朝霞峰值窗口",
        date: "2026-05-20",
        start: "2026-05-20T04:30:00+08:00",
        end: "2026-05-20T06:15:00+08:00",
        score: 70,
        riskTags: ["低云遮挡"],
        noteZh: "朝霞窗口可作为谨慎参考，重点观察中高云是否继续保留色彩载体。",
      },
      {
        type: "sunset",
        labelZh: "晚霞峰值窗口",
        date: "2026-05-21",
        start: "2026-05-21T17:57:00+08:00",
        end: "2026-05-21T19:42:00+08:00",
        score: 72,
        riskTags: ["风险可控"],
        noteZh: "晚霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
      },
    ],
    watchableGlowWindows: [],
    notRecommendedGlowWindows: [],
    dailyGlow: [
      {
        date: "2026-05-20",
        dateLabelZh: "2026年5月20日 星期三",
        sunriseScore: 70,
        sunsetScore: 74,
        bestWindow: {
          type: "sunset",
          labelZh: "晚霞峰值窗口",
          date: "2026-05-20",
          start: "2026-05-20T17:56:00+08:00",
          end: "2026-05-20T19:41:00+08:00",
          score: 74,
          riskTags: ["风险可控"],
          noteZh: "晚霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
        },
        bestTarget: "sunset",
        recommendationLabel: "值得等待",
        keyReason: "晚霞 74 分高于朝霞，优先观察日落前云层移动和西向通透度。",
        riskNote: "风险可控",
      },
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        sunriseScore: 66,
        sunsetScore: 72,
        bestWindow: {
          type: "sunset",
          labelZh: "晚霞峰值窗口",
          date: "2026-05-21",
          start: "2026-05-21T17:57:00+08:00",
          end: "2026-05-21T19:42:00+08:00",
          score: 72,
          riskTags: ["风险可控"],
          noteZh: "晚霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
        },
        bestTarget: "sunset",
        recommendationLabel: "值得等待",
        keyReason: "晚霞 72 分高于朝霞，优先观察日落前云层移动和西向通透度。",
        riskNote: "风险可控",
      },
    ],
    cloudLayerEvidence: [
      {
        label: "总云量",
        value: "58%",
        effect: "positive",
        noteZh: "总云量 20%-75% 通常更容易形成可用霞光层次。",
      },
      {
        label: "低云",
        value: "38%",
        effect: "neutral",
        noteZh: "低云可能遮挡太阳方向，低云过厚会导致无明显霞光或只剩白光。",
      },
      {
        label: "中云",
        value: "45%",
        effect: "positive",
        noteZh: "适量中云可承载霞光色彩。",
      },
      {
        label: "高云",
        value: "52%",
        effect: "positive",
        noteZh: "高云是霞光色彩的重要载体。",
      },
    ],
    visibilityEvidence: [
      {
        label: "能见度",
        value: "18 km",
        effect: "positive",
        noteZh: "能见度较好，有利于远山层次和霞光色彩稳定。",
      },
      {
        label: "湿度",
        value: "72%",
        effect: "neutral",
        noteZh: "湿度本身不直接否定霞光。",
      },
    ],
    aerosolAssessment: {
      availability: "available",
      confidence: "high",
      state: "favorable_scatter",
      stateLabelZh: "散射条件较有利",
      implicationZh: "低角度光线有一定散射载体，若中高云配合，霞光颜色更容易铺开。",
      noteZh: "气溶胶按区域参考处理，只解释透明度和散射倾向，不代表机位实测。",
      scoreImpact: 4,
      aerosolScore: 82,
      aerosolOpticalDepth550: 0.12,
      pm25: 18,
      pm10: 32,
      dust: 8,
      visibilityKm: 18,
      validTime: "2026-05-20T17:00:00+08:00",
      sourceResolution: "1h",
    },
    aerosolEvidence: [
      {
        label: "AOD 550nm",
        value: "0.120",
        effect: "positive",
        noteZh: "中等气溶胶可能增强低角度散射；过高时会压低通透度和色彩纯度。",
      },
      {
        label: "大气结论",
        value: "散射条件较有利",
        effect: "positive",
        noteZh: "低角度光线有一定散射载体，若中高云配合，霞光颜色更容易铺开。",
      },
    ],
    terrainObstructionAssessments: [
      {
        phase: "sunrise",
        date: "2026-05-20",
        solarAzimuthDegrees: 72,
        solarElevationDegrees: 6,
        terrainHorizonAngleDegrees: 4.8,
        solarClearanceDegrees: 1.2,
        obstructionStatus: "clear",
        confidence: "high",
        dataAvailable: true,
        labelZh: "日出方向地形遮挡",
        noteZh: "日出方向低角度光线有较好地形余量，遮挡不是主要风险。",
      },
      {
        phase: "sunset",
        date: "2026-05-20",
        solarAzimuthDegrees: 286,
        solarElevationDegrees: 6,
        terrainHorizonAngleDegrees: 5.5,
        solarClearanceDegrees: 0.5,
        obstructionStatus: "marginal",
        confidence: "high",
        dataAvailable: true,
        labelZh: "日落方向地形遮挡",
        noteZh: "日落方向地平遮挡接近核心低角度光线，需要现场确认机位是否能越过山脊或建筑。",
      },
    ],
    terrainObstructionEvidence: [
      {
        label: "日出地平遮挡",
        value: "4.8°",
        effect: "positive",
        noteZh: "日出方向遮挡角用于判断第一束低角度光线是否容易被山体或建筑挡住。",
      },
      {
        label: "日落地平遮挡",
        value: "5.5°",
        effect: "positive",
        noteZh: "日落方向遮挡角用于判断最后一束暖光和余晖是否容易被山脊挡住。",
      },
    ],
    riskReasons: ["低云遮挡风险中等，需要现场观察太阳方向是否留有透光缝。"],
    opportunityReasons: ["晚霞最佳参考为晚霞峰值窗口，评分 74 分。"],
    travelRecommendations: [
      "朝霞：建议日出前 40-60 分钟到达机位，先完成构图、测光和安全检查。",
      "晚霞：建议日落前 60 分钟观察云层移动，重点看太阳方向是否留有透光缝。",
      "如果低云遮挡太阳方向，优先寻找更高机位或转拍层峦、云缝光和局部暖色。",
    ],
    backupPlans: [
      {
        condition: "无霞但通透",
        action: "转拍远山层次、长焦山脊",
        detail: "利用清晰空气和低角度侧光保留空间层次。",
      },
      {
        condition: "低云遮挡",
        action: "转更高机位或拍雾中局部",
        detail: "寻找能越过低云的视角。",
      },
    ],
    missingDataNotes: ["当前天气数据为演示数据，结果仅用于体验分析流程。"],
    dataMode: "mock",
  },
  astroAnalysis: {
    starsScore: 66,
    milkyWayScore: 68,
    astroConditionScore: 74,
    astroPracticalScore: 68,
    ...astroAnalysisFieldsForTest(
      astroAssessmentForTest({
        astronomicalWindowScore: 74,
        skyConditionScore: 72,
        milkyWayGeometryScore: 70,
        practicalAstroScore: 68,
      }),
    ),
    moonImpactScore: 38,
    transparencyScore: 72,
    astroTravelScore: 70,
    recommendationLabel: "值得等待",
    confidenceLevel: "medium",
    astroWindowAvailable: true,
    astroShootable: true,
    bestAstroWindows: [
      {
        type: "recommended_milky_way",
        labelZh: "推荐银河窗口",
        date: "2026-05-20",
        start: "2026-05-21T01:10:00+08:00",
        end: "2026-05-21T03:30:00+08:00",
        durationMinutes: 140,
        score: 68,
        riskTags: ["月光较低"],
        noteZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心可见候选窗口内。",
        directionZh: "东南至南方",
        galacticCenterAltitude: 24,
      },
      {
        type: "moonless_night",
        labelZh: "无月黑夜",
        date: "2026-05-20",
        start: "2026-05-20T22:35:00+08:00",
        end: "2026-05-21T03:48:00+08:00",
        durationMinutes: 313,
        score: 69,
        riskTags: ["月光较低"],
        noteZh: "该窗口位于天文黑夜内，月亮低于地平线或月光影响较低。",
      },
    ],
    weatherBlockers: [],
    dailyAstro: [
      {
        date: "2026-05-20",
        dateLabelZh: "2026年5月20日 星期三",
        lunarDateText: "四月初四",
        starsScore: 66,
        milkyWayScore: 68,
        astroConditionScore: 74,
        astroPracticalScore: 68,
        ...dailyAstroFieldsForTest(
          astroAssessmentForTest({
            astronomicalWindowScore: 74,
            skyConditionScore: 72,
            milkyWayGeometryScore: 70,
            practicalAstroScore: 68,
          }),
        ),
        astronomicalWindowAvailable: true,
        astroShootable: true,
        weatherBlockers: [],
        moonImpactLevel: "medium",
        astronomicalNightWindow: {
          type: "astronomical_night",
          labelZh: "天文黑夜",
          date: "2026-05-20",
          start: "2026-05-20T20:24:00+08:00",
          end: "2026-05-21T03:48:00+08:00",
          durationMinutes: 444,
          score: 69,
          riskTags: ["月光中等"],
          noteZh: "太阳低于地平线约 18 度后，天空背景更适合星空、星轨和银河拍摄。",
        },
        moonlessNightWindow: {
          type: "moonless_night",
          labelZh: "无月黑夜",
          date: "2026-05-20",
          start: "2026-05-20T22:35:00+08:00",
          end: "2026-05-21T03:48:00+08:00",
          durationMinutes: 313,
          score: 69,
          riskTags: ["月光较低"],
          noteZh: "该窗口位于天文黑夜内，月亮低于地平线或月光影响较低。",
        },
        recommendedMilkyWayWindow: {
          type: "recommended_milky_way",
          labelZh: "推荐银河窗口",
          date: "2026-05-20",
          start: "2026-05-21T01:10:00+08:00",
          end: "2026-05-21T03:30:00+08:00",
          durationMinutes: 140,
          score: 68,
          riskTags: ["月光较低"],
          noteZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心可见候选窗口内。",
          directionZh: "东南至南方",
          galacticCenterAltitude: 24,
        },
        recommendationLabel: "值得等待",
        keyReason: "推荐银河窗口 01:10 - 03:30，方向 东南至南方。",
        riskNote: "风险可控",
      },
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        lunarDateText: "四月初五",
        starsScore: 70,
        milkyWayScore: 72,
        astroConditionScore: 76,
        astroPracticalScore: 72,
        ...dailyAstroFieldsForTest(
          astroAssessmentForTest({
            astronomicalWindowScore: 76,
            skyConditionScore: 74,
            milkyWayGeometryScore: 72,
            practicalAstroScore: 72,
          }),
        ),
        astronomicalWindowAvailable: true,
        astroShootable: true,
        weatherBlockers: [],
        moonImpactLevel: "medium",
        astronomicalNightWindow: {
          type: "astronomical_night",
          labelZh: "天文黑夜",
          date: "2026-05-21",
          start: "2026-05-21T20:25:00+08:00",
          end: "2026-05-22T03:47:00+08:00",
          durationMinutes: 442,
          score: 70,
          riskTags: ["月光中等"],
          noteZh: "太阳低于地平线约 18 度后，天空背景更适合星空、星轨和银河拍摄。",
        },
        moonlessNightWindow: {
          type: "moonless_night",
          labelZh: "无月黑夜",
          date: "2026-05-21",
          start: "2026-05-21T23:20:00+08:00",
          end: "2026-05-22T03:47:00+08:00",
          durationMinutes: 267,
          score: 70,
          riskTags: ["月光较低"],
          noteZh: "该窗口位于天文黑夜内，月亮低于地平线或月光影响较低。",
        },
        recommendedMilkyWayWindow: {
          type: "recommended_milky_way",
          labelZh: "推荐银河窗口",
          date: "2026-05-21",
          start: "2026-05-22T01:05:00+08:00",
          end: "2026-05-22T03:20:00+08:00",
          durationMinutes: 135,
          score: 72,
          riskTags: ["月光较低"],
          noteZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心可见候选窗口内。",
          directionZh: "东南至南方",
          galacticCenterAltitude: 26,
        },
        recommendationLabel: "值得等待",
        keyReason: "推荐银河窗口 01:05 - 03:20，方向 东南至南方。",
        riskNote: "风险可控",
      },
    ],
    moonInfo: {
      moonPhase: 0.18,
      moonPhaseNameZh: "娥眉月",
      moonIllumination: 0.24,
      waxingOrWaning: "waxing",
      lunarDateText: "四月初四",
      moonrise: "2026-05-20T08:40:00+08:00",
      moonset: "2026-05-20T22:35:00+08:00",
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
    },
    moonlessNightWindows: [
      {
        type: "moonless_night",
        labelZh: "无月黑夜",
        date: "2026-05-20",
        start: "2026-05-20T22:35:00+08:00",
        end: "2026-05-21T03:48:00+08:00",
        durationMinutes: 313,
        score: 69,
        riskTags: ["月光较低"],
        noteZh: "该窗口位于天文黑夜内，月亮低于地平线或月光影响较低。",
      },
      {
        type: "moonless_night",
        labelZh: "无月黑夜",
        date: "2026-05-21",
        start: "2026-05-21T23:20:00+08:00",
        end: "2026-05-22T03:47:00+08:00",
        durationMinutes: 267,
        score: 70,
        riskTags: ["月光较低"],
        noteZh: "该窗口位于天文黑夜内，月亮低于地平线或月光影响较低。",
      },
    ],
    astronomicalNightWindows: [
      {
        type: "astronomical_night",
        labelZh: "天文黑夜",
        date: "2026-05-20",
        start: "2026-05-20T20:24:00+08:00",
        end: "2026-05-21T03:48:00+08:00",
        durationMinutes: 444,
        score: 69,
        riskTags: ["月光中等"],
        noteZh: "太阳低于地平线约 18 度后，天空背景更适合星空、星轨和银河拍摄。",
      },
      {
        type: "astronomical_night",
        labelZh: "天文黑夜",
        date: "2026-05-21",
        start: "2026-05-21T20:25:00+08:00",
        end: "2026-05-22T03:47:00+08:00",
        durationMinutes: 442,
        score: 70,
        riskTags: ["月光中等"],
        noteZh: "太阳低于地平线约 18 度后，天空背景更适合星空、星轨和银河拍摄。",
      },
    ],
    milkyWayCandidateWindows: [
      {
        type: "milky_way_candidate",
        labelZh: "银河候选窗口",
        date: "2026-05-20",
        start: "2026-05-21T01:10:00+08:00",
        end: "2026-05-21T03:30:00+08:00",
        durationMinutes: 140,
        score: 68,
        riskTags: ["月光较低"],
        noteZh: "银心方向与高度为简化本地估算。",
        directionZh: "东南至南方",
        galacticCenterAltitude: 24,
      },
      {
        type: "milky_way_candidate",
        labelZh: "银河候选窗口",
        date: "2026-05-21",
        start: "2026-05-22T01:05:00+08:00",
        end: "2026-05-22T03:20:00+08:00",
        durationMinutes: 135,
        score: 72,
        riskTags: ["月光较低"],
        noteZh: "银心方向与高度为简化本地估算。",
        directionZh: "东南至南方",
        galacticCenterAltitude: 26,
      },
    ],
    recommendedMilkyWayWindows: [
      {
        type: "recommended_milky_way",
        labelZh: "推荐银河窗口",
        date: "2026-05-20",
        start: "2026-05-21T01:10:00+08:00",
        end: "2026-05-21T03:30:00+08:00",
        durationMinutes: 140,
        score: 68,
        riskTags: ["月光较低"],
        noteZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心可见候选窗口内。",
        directionZh: "东南至南方",
        galacticCenterAltitude: 24,
      },
      {
        type: "recommended_milky_way",
        labelZh: "推荐银河窗口",
        date: "2026-05-21",
        start: "2026-05-22T01:05:00+08:00",
        end: "2026-05-22T03:20:00+08:00",
        durationMinutes: 135,
        score: 72,
        riskTags: ["月光较低"],
        noteZh: "该窗口同时位于天文黑夜、低月光影响窗口和银心可见候选窗口内。",
        directionZh: "东南至南方",
        galacticCenterAltitude: 26,
      },
    ],
    lightPollution: {
      lightPollutionSource: "unavailable",
      lightPollutionNoteZh: "暂未接入光污染数据，实际观星仍需结合现场环境判断。",
    },
    cloudEvidence: [
      {
        label: "总云量",
        value: "32%",
        effect: "positive",
        noteZh: "总云量直接决定星点和银河主体是否会被遮挡。",
      },
      {
        label: "低云 / 中云 / 高云",
        value: "8% / 16% / 20%",
        effect: "negative",
        noteZh: "低云遮挡地景和近地平线，中高云会影响银河反差和星点密度。",
      },
    ],
    visibilityEvidence: [
      {
        label: "能见度",
        value: "24 公里",
        effect: "positive",
        noteZh: "能见度影响银河暗部、远山层次和夜景空气感。",
      },
      {
        label: "湿度 / 降水",
        value: "58% / 8%",
        effect: "neutral",
        noteZh: "高湿和降水概率会降低透明度，也会增加镜头结露风险。",
      },
    ],
    moonEvidence: [
      {
        label: "2026年5月20日 星期三",
        value: "娥眉月 / 24%",
        effect: "negative",
        noteZh: "月出 08:40，月落 22:35。",
      },
    ],
    terrainEvidence: [
      {
        label: "银河方向地平遮挡",
        value: "7.2°",
        effect: "neutral",
        noteZh: "演示地形数据显示主要方向地平遮挡较低。",
      },
      {
        label: "地形数据",
        value: "演示数据",
        effect: "neutral",
        noteZh: "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
      },
    ],
    lightPollutionEvidence: [
      {
        label: "光污染数据",
        value: "暂未接入",
        effect: "neutral",
        noteZh: "暂未接入光污染数据，实际观星仍需结合现场环境判断。",
      },
    ],
    riskReasons: ["暂未接入光污染数据，实际观星仍需结合现场环境判断。"],
    opportunityReasons: ["共找到 2 个推荐银河窗口。"],
    travelRecommendations: [
      "月落后优先拍摄银河，月亮未落前可转拍月光风景或星轨堆栈。",
      "若银河窗口较短，建议提前完成构图和对焦。",
      "若云量偏高，可优先选择城市夜景、月景或等待云缝。",
      "光污染较强时，优先避开城市方向或选择高海拔暗场机位。",
      "透明度好但银河条件一般时，可转拍星轨或山脊夜景。",
    ],
    backupPlans: [
      {
        condition: "银河受月光影响",
        action: "转拍月景、月光山脊、星轨",
        detail: "月亮未落或照明偏强时，把月光作为环境光。",
      },
      {
        condition: "云量偏高",
        action: "等待云缝或转城市夜景",
        detail: "银河主体被云遮挡时，优先观察云缝移动。",
      },
      {
        condition: "透明度较好但银河低",
        action: "转拍星空环境人像或广角星轨",
        detail: "银心高度不足时，利用高透明度拍摄星点和地景关系。",
      },
      {
        condition: "光污染强",
        action: "调整朝向，避开城市光源方向",
        detail: "优先选择背离城市光源的方向。",
      },
    ],
    missingDataNotes: [
      "银河窗口为简化本地估算，尚未完整建模银河拱桥、地形遮挡和光污染。",
      "暂未接入光污染数据，实际观星仍需结合现场环境判断。",
      "天气数据当前为演示数据，正式出行前需要复核真实预报。",
      "地形数据当前为演示数据，现场地平线遮挡仍需复核。",
    ],
    dataMode: "mock",
  },
  terrainSummary: {
    latitudeWgs84: 30.1328,
    longitudeWgs84: 118.171,
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    elevationMeters: 1860,
    elevationSource: "manual",
    elevationConfidence: "high",
    terrainType: "summit",
    exposureType: "exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 380,
    localReliefMeters: 1484,
    terrainNotesZh: "山顶平台与周边谷地高差明显。",
    locationElevation: 1860,
    minElevation1km: 980,
    minElevation3km: 520,
    minElevation5km: 380,
    maxElevation5km: 1864,
    avgElevation5km: 1125,
    elevationDiff5km: 1484,
    valleyDirectionZh: "东南",
    ridgeDirectionZh: "西北-东南",
    terrainCloudSeaPotential: "high",
    terrainNoteZh: "演示地形数据显示山顶与周边谷地高差明显。",
    sunriseHorizonAngle: 4.8,
    sunsetHorizonAngle: 5.5,
    milkyWayHorizonAngle: 7.2,
    blockedDirectionsZh: ["西北", "东北"],
    obstructionNoteZh: "演示地形数据显示主要方向地平遮挡较低。",
    dataSource: "mock_terrain",
    dataSourceLabelZh: "演示数据",
    isMock: true,
    honestyNoteZh:
      "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
  },
  terrainAnalysis: {
    terrainProfile: {
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      latitudeGcj02: 30.1351,
      longitudeGcj02: 118.1767,
      elevationMeters: 1860,
      elevationSource: "manual",
      elevationConfidence: "high",
      terrainType: "summit",
      exposureType: "exposed",
      viewingDirection: "panoramic",
      nearbyValleyElevationMeters: 380,
      localReliefMeters: 1484,
      terrainNotesZh: "山顶平台与周边谷地高差明显。",
      locationElevation: 1860,
      minElevation1km: 980,
      minElevation3km: 520,
      minElevation5km: 380,
      maxElevation5km: 1864,
      avgElevation5km: 1125,
      elevationDiff5km: 1484,
      valleyDirectionZh: "东南",
      ridgeDirectionZh: "西北-东南",
      terrainCloudSeaPotential: "high",
      terrainNoteZh: "演示地形数据显示山顶与周边谷地高差明显。",
    },
    horizonProfile: {
      sunriseHorizonAngle: 4.8,
      sunsetHorizonAngle: 5.5,
      milkyWayHorizonAngle: 7.2,
      blockedDirectionsZh: ["西北", "东北"],
      obstructionNoteZh: "演示地形数据显示主要方向地平遮挡较低。",
    },
    dataSource: "mock_terrain",
    dataSourceLabelZh: "演示数据",
    isMock: true,
    honestyNoteZh:
      "地形信息当前使用演示地形数据，正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。",
  },
  astroSummaries: [
    {
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
      sunrise: "2026-05-20T05:15:00+08:00",
      sunset: "2026-05-20T18:56:00+08:00",
      solarNoon: "2026-05-20T12:05:00+08:00",
      civilDawn: "2026-05-20T04:50:00+08:00",
      civilDusk: "2026-05-20T19:21:00+08:00",
      nauticalDawn: "2026-05-20T04:20:00+08:00",
      nauticalDusk: "2026-05-20T19:52:00+08:00",
      astronomicalDawn: "2026-05-20T03:48:00+08:00",
      astronomicalDusk: "2026-05-20T20:24:00+08:00",
      astronomicalNightStart: "2026-05-20T20:24:00+08:00",
      astronomicalNightEnd: "2026-05-21T03:48:00+08:00",
      moonPhase: 0.18,
      moonPhaseNameZh: "娥眉月",
      moonIllumination: 0.24,
      waxingOrWaning: "waxing",
      lunarDateText: "四月初四",
      moonrise: "2026-05-20T08:40:00+08:00",
      moonset: "2026-05-20T22:35:00+08:00",
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      moonInfo: {
        moonPhase: 0.18,
        moonPhaseNameZh: "娥眉月",
        moonIllumination: 0.24,
        waxingOrWaning: "waxing",
        lunarDateText: "四月初四",
        moonrise: "2026-05-20T08:40:00+08:00",
        moonset: "2026-05-20T22:35:00+08:00",
        calculationNoteZh:
          "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      },
      milkyWayWindowStart: "2026-05-21T01:10:00+08:00",
      milkyWayWindowEnd: "2026-05-21T03:30:00+08:00",
      milkyWayDirection: "东南至南方",
      milkyWayVisibilityLevel: "fair",
      milkyWayNoteZh: "银河窗口为简化本地估算。",
    },
    {
      date: "2026-05-21",
      timezone: "Asia/Shanghai",
      sunrise: "2026-05-21T05:14:00+08:00",
      sunset: "2026-05-21T18:57:00+08:00",
      solarNoon: "2026-05-21T12:05:00+08:00",
      civilDawn: "2026-05-21T04:49:00+08:00",
      civilDusk: "2026-05-21T19:22:00+08:00",
      nauticalDawn: "2026-05-21T04:19:00+08:00",
      nauticalDusk: "2026-05-21T19:53:00+08:00",
      astronomicalDawn: "2026-05-21T03:47:00+08:00",
      astronomicalDusk: "2026-05-21T20:25:00+08:00",
      astronomicalNightStart: "2026-05-21T20:25:00+08:00",
      astronomicalNightEnd: "2026-05-22T03:47:00+08:00",
      moonPhase: 0.22,
      moonPhaseNameZh: "娥眉月",
      moonIllumination: 0.31,
      waxingOrWaning: "waxing",
      lunarDateText: "四月初五",
      moonrise: "2026-05-21T09:35:00+08:00",
      moonset: "2026-05-21T23:20:00+08:00",
      calculationNoteZh:
        "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      moonInfo: {
        moonPhase: 0.22,
        moonPhaseNameZh: "娥眉月",
        moonIllumination: 0.31,
        waxingOrWaning: "waxing",
        lunarDateText: "四月初五",
        moonrise: "2026-05-21T09:35:00+08:00",
        moonset: "2026-05-21T23:20:00+08:00",
        calculationNoteZh:
          "月相基于本地天文算法计算；农历日期基于本地历法库生成。实际观星仍需结合云量、光污染和地形遮挡。",
      },
      milkyWayWindowStart: "2026-05-22T01:05:00+08:00",
      milkyWayWindowEnd: "2026-05-22T03:20:00+08:00",
      milkyWayDirection: "东南至南方",
      milkyWayVisibilityLevel: "good",
      milkyWayNoteZh: "银河窗口为简化本地估算。",
    },
  ],
  bestWindows: [
    {
      label: "清晨云海窗口 05:00 - 07:00",
      date: "2026-05-20",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
      score: 82,
      target: "cloud_sea",
    },
    {
      label: "清晨云海窗口 05:10 - 07:10",
      date: "2026-05-21",
      startTime: "2026-05-21T05:10:00+08:00",
      endTime: "2026-05-21T07:10:00+08:00",
      score: 78,
      target: "cloud_sea",
    },
    {
      label: "晚霞窗口 17:56 - 19:41",
      date: "2026-05-20",
      startTime: "2026-05-20T17:56:00+08:00",
      endTime: "2026-05-20T19:41:00+08:00",
      score: 74,
      target: "glow",
    },
    {
      label: "朝霞窗口 04:30 - 06:15",
      date: "2026-05-20",
      startTime: "2026-05-20T04:30:00+08:00",
      endTime: "2026-05-20T06:15:00+08:00",
      score: 70,
      target: "glow",
    },
    {
      label: "天文黑夜 20:24 - 03:48",
      date: "2026-05-20",
      startTime: "2026-05-20T20:24:00+08:00",
      endTime: "2026-05-21T03:48:00+08:00",
      score: 69,
      target: "astro",
    },
    {
      label: "银河窗口 01:10 - 03:30",
      date: "2026-05-20",
      startTime: "2026-05-21T01:10:00+08:00",
      endTime: "2026-05-21T03:30:00+08:00",
      score: 68,
      target: "astro",
    },
    {
      label: "银河窗口 01:05 - 03:20",
      date: "2026-05-21",
      startTime: "2026-05-22T01:05:00+08:00",
      endTime: "2026-05-22T03:20:00+08:00",
      score: 72,
      target: "astro",
    },
  ],
  dailySummaries: [
    {
      date: "2026-05-20",
      dateLabelZh: "2026年5月20日 星期三",
      lunarDateText: "四月初四",
      score: 78,
      recommendationLabel: "值得等待",
      target: "general",
      weather: {
        weatherTextZh: "多云间晴",
        tempMin: 10,
        tempMax: 18,
        temperatureCorrectionApplied: false,
        temperatureCorrectionReason: "provider_elevation_close_to_spot",
        selectedSpotElevationMeters: 1860,
        providerElevationMeters: 1840,
        providerElevationKnown: true,
        feelsLikeMin: 7,
        feelsLikeMax: 16,
        precipitationProbability: 18,
        precipitation: 0.2,
        precipitationAmountMm: 0.2,
        precipitationRisk: {
          precipitationProbabilityPercent: 18,
          precipitationAmountMm: 0.2,
          rainRiskLevel: "none",
          rainRiskLabelZh: "无明显",
          affectedWindows: [],
          recommendationZh: "降水不明显，可作为备选窗口。",
        },
        windSpeed: 3.4,
        windGust: 5.6,
        windDirection: 135,
        humidity: 82,
        visibility: 18,
        dewPointSpread: 3,
        cloudTotal: 58,
        cloudLow: 42,
        cloudMid: 35,
        cloudHigh: 28,
      },
      keyWindows: [],
      riskFlags: [],
      shortAdvice: "当天有可优先关注的拍摄窗口。",
    },
    {
      date: "2026-05-21",
      dateLabelZh: "2026年5月21日 星期四",
      lunarDateText: "四月初五",
      score: 76,
      recommendationLabel: "值得等待",
      target: "general",
      weather: {
        weatherTextZh: "小雨转多云",
        tempMin: 11,
        tempMax: 17,
        temperatureCorrectionApplied: true,
        temperatureCorrectionCelsius: 1.8,
        temperatureCorrectionReason: "unknown_provider_elevation_conservative",
        selectedSpotElevationMeters: 1860,
        providerElevationKnown: false,
        feelsLikeMin: 8,
        feelsLikeMax: 15,
        precipitationProbability: 42,
        precipitation: 1.4,
        precipitationAmountMm: 1.4,
        precipitationRisk: {
          precipitationProbabilityPercent: 42,
          precipitationAmountMm: 1.4,
          rainRiskLevel: "medium",
          rainRiskLabelZh: "中",
          affectedWindows: ["清晨窗口"],
          recommendationZh: "小雨转多云，有降水干扰，预计 1.4mm，可能影响清晨窗口。",
        },
        windSpeed: 4.2,
        windGust: 6.8,
        windDirection: 45,
        humidity: 86,
        visibility: 14,
        dewPointSpread: 2.2,
        cloudTotal: 66,
        cloudLow: 48,
        cloudMid: 40,
        cloudHigh: 30,
      },
      keyWindows: [],
      riskFlags: [],
      shortAdvice: "当天有可优先关注的拍摄窗口。",
    },
  ],
  targetDailyBreakdown: [
    {
      date: "2026-05-20",
      cloudSea: {
        label: "清晨云海机会",
        score: 82,
        detail: "清晨湿度、低云、风速、露点差和地形落差共同影响云海形成。",
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: 58,
        detail: "清晨低云约 52%，湿度约 86%，能见度约 14 公里。",
      },
      sunriseGlow: {
        label: "朝霞机会",
        score: 70,
        detail: "朝霞窗口可用。",
      },
      sunsetGlow: {
        label: "晚霞机会",
        score: 74,
        detail: "晚霞窗口可用。",
      },
      stars: {
        label: "星空可拍性",
        score: 66,
        detail: "天文窗口与天气条件共同支持星空拍摄。",
        window: {
          label: "天文黑夜 20:24 - 03:48",
          date: "2026-05-20",
          startTime: "2026-05-20T20:24:00+08:00",
          endTime: "2026-05-21T03:48:00+08:00",
          score: 69,
          target: "astro",
        },
      },
      milkyWay: {
        label: "银河/天文窗口可拍性",
        score: 68,
        detail: "银河窗口已叠加月光、云量、低云、降水和透明度。",
        window: {
          label: "银河窗口 01:10 - 03:30",
          date: "2026-05-20",
          startTime: "2026-05-21T01:10:00+08:00",
          endTime: "2026-05-21T03:30:00+08:00",
          score: 68,
          target: "astro",
        },
      },
      transparency: {
        label: "通透度",
        score: 72,
        detail: "能见度较好。",
      },
      astroSummary: undefined,
      terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
      weatherSummary: "多云间晴，山地局部有雾",
    },
    {
      date: "2026-05-21",
      cloudSea: {
        label: "清晨云海机会",
        score: 78,
        detail: "清晨云海窗口仍可关注。",
      },
      whiteoutRisk: {
        label: "白墙风险",
        score: 52,
        detail: "白墙风险中等。",
      },
      stars: {
        label: "星空可拍性",
        score: 70,
        detail: "夜间窗口可关注。",
        window: {
          label: "天文黑夜 20:25 - 03:47",
          date: "2026-05-21",
          startTime: "2026-05-21T20:25:00+08:00",
          endTime: "2026-05-22T03:47:00+08:00",
          score: 70,
          target: "astro",
        },
      },
      milkyWay: {
        label: "银河/天文窗口可拍性",
        score: 72,
        detail: "第二晚银河窗口可用。",
        window: {
          label: "银河窗口 01:05 - 03:20",
          date: "2026-05-21",
          startTime: "2026-05-22T01:05:00+08:00",
          endTime: "2026-05-22T03:20:00+08:00",
          score: 72,
          target: "astro",
        },
      },
      transparency: {
        label: "通透度",
        score: 70,
        detail: "能见度较好。",
      },
      astroSummary: undefined,
      terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
      weatherSummary: "多云间晴，山地局部有雾",
    },
  ],
  riskFlags: [
    {
      key: "whiteout",
      label: "白墙风险",
      level: "medium",
      description: "局部时段可能出现低云遮挡。",
    },
  ],
  keyReasons: ["清晨低云和湿度组合较好。", "夜间月光影响可控。"],
  photographyAdvice: ["提前到达机位并预留风雨备选。"],
  dataNotice:
    "天气数据：演示数据；地形数据：演示数据；天文数据：本地算法计算。当前结果基于演示天气数据生成，仅用于体验分析流程。正式天气数据源启用后，将显示对应的数据来源与预报时间。天文时间基于地点经纬度本地计算，实际拍摄仍需结合云量、光污染和地形遮挡。",
  isMock: true,
  dataSourceLabel: "演示数据",
  generatedAt: "2026-05-20T00:00:00+08:00",
  currentWeather: {
    providerCode: "mock",
    providerLabelZh: "演示数据",
    dataMode: "mock",
    observedAt: "2026-05-20T00:00:00+08:00",
    temperature: 12,
    feelsLike: 10,
    humidity: 82,
    dewPoint: 9,
    dewPointSpread: 3,
    windSpeed: 3.2,
    windDirection: 135,
    windGust: 5.1,
    pressure: 1005,
    visibility: 18,
    cloudTotal: 58,
    cloudLow: 42,
    cloudMid: 35,
    cloudHigh: 28,
    precipitation: 0,
    precipitationProbability: 18,
    weatherTextZh: "多云间晴",
    weatherCode: "mock-cloudy",
    airQuality: null,
    missingFields: [],
    estimatedFields: [],
  },
  clothingGuide: {
    titleZh: "薄保暖层",
    summaryZh: "参考体感约 10°C，风速约 3.2 m/s，降水概率约 18%。按分层穿法准备。",
    layers: ["软壳或薄羽绒", "抓绒中层"],
    accessories: ["镜头布"],
    riskNotes: ["高湿环境注意防潮、防滑，并准备镜头布处理结露。"],
    comfortLevel: "cool",
  },
  weatherProviderCode: "mock",
  weatherProviderLabelZh: "演示数据",
  weatherDataMode: "mock",
  weatherNoticeZh: "天气数据：演示数据",
  weatherMissingFields: [],
  weatherEstimatedFields: [],
  weatherSourceSummaries: [],
  weatherMissingDataNotes: [],
  astroDataSourceLabelZh: "本地算法计算",
};

function resultForTarget(target: ForecastCalculationResult["target"]): ForecastCalculationResult {
  return {
    ...baseResult,
    target,
    astroDataSourceLabelZh: target === "astro" ? "本地天文服务计算" : "本地算法计算",
    astroCalculationBasis:
      target === "astro"
        ? {
            ephemerisFileName: "de421.bsp",
            coordinateSystem: "WGS84",
            timezone: "Asia/Shanghai",
            elevationMeters: 1800,
            generatedAt: "2026-05-20T00:00:01+08:00",
          }
        : undefined,
    dailySummaries: baseResult.dailySummaries.map((summary) => ({ ...summary, target })),
  };
}

type ProfessionalHourlyDataForTest = NonNullable<
  ForecastCalculationResult["professionalHourlyData"]
>;
type ProfessionalHourlyRowForTest = ProfessionalHourlyDataForTest[number];

function professionalHourlyDataForTest(
  overrides: Partial<ProfessionalHourlyRowForTest> = {},
): ProfessionalHourlyDataForTest {
  return Array.from({ length: 15 }, (_, hour) => ({
    time: `2026-05-20T${String(hour).padStart(2, "0")}:00:00+08:00`,
    dateLabel: "5月20日",
    timeLabel: `${String(hour).padStart(2, "0")}:00`,
    weatherCode: hour < 8 ? "partly_cloudy" : "clear",
    weatherText: hour < 8 ? "多云" : "晴",
    cloudSeaSignal: hour >= 4 && hour <= 7 ? "可拍窗口" : "普通",
    cloudSeaSignalLevel: hour >= 4 && hour <= 7 ? "positive" : "neutral",
    cloudTotalPercent: hour >= 4 && hour <= 7 ? 88 : 42,
    cloudHighPercent: hour >= 4 && hour <= 7 ? 28 : 18,
    cloudMidPercent: hour >= 4 && hour <= 7 ? 46 : 24,
    cloudLowPercent: hour >= 4 && hour <= 7 ? 82 : 22,
    cloudLayerBasis: "explicit_layers",
    rawTemperatureC: 15 + hour * 0.4,
    terrainAdjustedTemperatureC: 10 + hour * 0.4,
    displayedTemperatureC: 10 + hour * 0.4,
    temperatureBasis: "terrain_adjusted",
    temperatureAdjustmentC: 5,
    temperatureBasisNoteZh: "已按机位海拔估算温度。",
    dewPointC: 8 + hour * 0.35,
    dewPointSpreadC: hour >= 4 && hour <= 7 ? 1.6 : 5.2,
    relativeHumidityPercent: hour >= 4 && hour <= 7 ? 94 : 68,
    precipitationAmountMm: hour === 3 ? 0.8 : 0,
    precipitationProbabilityPercent: hour === 3 ? 55 : 12,
    visibilityMeters: hour >= 4 && hour <= 7 ? 4500 : 18000,
    windSpeedMs: hour >= 4 && hour <= 7 ? 3.4 : 5.6,
    windDirectionDeg: 135,
    ...overrides,
  }));
}

function isoHourForTest(hourOffset: number): string {
  const day = 20 + Math.floor(hourOffset / 24);
  const hour = hourOffset % 24;
  return `2026-05-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00+08:00`;
}

function professionalHourlyRangeForTest(hours: number): ProfessionalHourlyDataForTest {
  const templateRows = professionalHourlyDataForTest();
  return Array.from({ length: hours }, (_, hourOffset) => {
    const template = templateRows[hourOffset % templateRows.length]!;
    const day = 20 + Math.floor(hourOffset / 24);
    const hour = hourOffset % 24;
    return {
      ...template,
      time: isoHourForTest(hourOffset),
      dateLabel: `5月${day}日`,
      timeLabel: `${String(hour).padStart(2, "0")}:00`,
    };
  });
}

function resultWithGlowHourlyRange(
  horizon: ForecastCalculationResult["horizon"],
  hours: number,
): ForecastCalculationResult {
  const rows = professionalHourlyRangeForTest(hours);
  const endTime = isoHourForTest(hours);
  const targetDateCount = Math.max(1, Math.ceil(hours / 24));
  const targetDates = Array.from(
    { length: targetDateCount },
    (_, index) => `2026-05-${String(20 + index).padStart(2, "0")}`,
  );
  const targetDateLabels = targetDates.map((date, index) => `2026年5月${20 + index}日`);

  return {
    ...resultForTarget("glow"),
    horizon,
    forecastEnd: endTime,
    targetDates,
    calendarBasis: {
      ...baseResult.calendarBasis,
      forecastEnd: endTime,
      forecastEndLabel: `2026年5月${20 + Math.floor(hours / 24)}日 ${String(hours % 24).padStart(2, "0")}:00`,
      forecastRangeLabel: `2026年5月20日 00:00 至 2026年5月${20 + Math.floor(hours / 24)}日 ${String(hours % 24).padStart(2, "0")}:00`,
      targetDates,
      targetDateLabels,
      horizonHours: hours,
    },
    professionalHourlyData: rows,
    professionalHourlyDataTimeBasis: {
      startTime: "2026-05-20T00:00:00+08:00",
      endTime,
      stepMinutes: 60,
      timezone: "Asia/Shanghai",
      temperatureBasis: "terrain_adjusted",
      temperatureBasisNoteZh: "温度口径：机位海拔修正后",
      cloudLayerBasis: "explicit_layers",
      cloudLayerBasisNoteZh: "云量口径：总云量 + 低/中/高云分层",
      partialData: false,
      expectedRowCount: hours,
      requestedHours: hours,
      anchorStartLocal: "2026-05-20T00:00:00+08:00",
      anchorEndLocal: endTime,
      horizonHours: hours,
    },
  };
}

function resultWithProfessionalHourlyData(
  overrides: Partial<ForecastCalculationResult> = {},
): ForecastCalculationResult {
  const hourly = professionalHourlyDataForTest();
  return {
    ...resultForTarget("cloud_sea"),
    professionalHourlyData: hourly,
    professionalHourlyDataTimeBasis: {
      startTime: "2026-05-20T00:00:00+08:00",
      endTime: "2026-05-20T15:00:00+08:00",
      stepMinutes: 60,
      timezone: "Asia/Shanghai",
      temperatureBasis: "terrain_adjusted",
      temperatureBasisNoteZh: "温度口径：机位海拔修正后",
      cloudLayerBasis: "explicit_layers",
      cloudLayerBasisNoteZh: "云量口径：总云量 + 低/中/高云分层",
      partialData: true,
      missingDataNoteZh: "部分小时数据缺失，结果仅供复核。",
    },
    ...overrides,
  };
}

function genericCloudSeaConsistencyResult(
  rows: ProfessionalHourlyDataForTest,
): ForecastCalculationResult {
  const result = resultWithProfessionalHourlyData({
    professionalHourlyData: rows,
  });
  return {
    ...result,
    place: {
      ...result.place,
      id: "generic-high-mountain-spot",
      name: "genericHighMountainSpot",
      adminArea: "genericAdminArea",
      locality: "genericLocality",
    },
    summary: "genericHighMountainSpot synthetic cloud sea result.",
    recommendationLabel: "值得等待",
    cloudSeaAnalysis: {
      ...result.cloudSeaAnalysis,
      shootableScore: 82,
      recommendationLabel: "推荐重点关注",
    },
  };
}

function weatherFusionSummaryWithAgreement(
  context: ForecastMultiSourceAgreementContext,
): NonNullable<ForecastCalculationResult["weatherFusionSummary"]> {
  return {
    primarySource: "主天气源",
    auxiliarySources: ["辅助云层源"],
    professionalSourceStatus: "专业增强源可用",
    confidenceLevel: "medium",
    confidenceByTarget: {
      cloud_sea: 0.62,
      glow: 0.68,
      astro: 0.64,
      general: 0.7,
    },
    conflictStatusZh: context.disagreementLevel === "none" ? "无明显冲突" : "存在差异，请谨慎参考",
    dataStatusZh: "天气数据：真实数据源",
    multiSourceAgreementContext: context,
  };
}

function agreementContext(
  overrides: Partial<ForecastMultiSourceAgreementContext> = {},
): ForecastMultiSourceAgreementContext {
  return {
    agreementLevel: "low",
    disagreementLevel: "high",
    fieldDisagreements: [
      {
        field: "cloudLow",
        level: "high",
        range: 45,
        min: 18,
        max: 63,
        unit: "pct",
        sourcesAvailable: 2,
        messageZh: "低云多源差值约 45 个百分点，云海形成与白墙风险需结合临近预报复核。",
      },
    ],
    keyWarningsZh: ["低云分歧较大，云海与白墙判断需结合临近预报复核。"],
    userSummaryZh: "多源低云判断分歧较大，云海形成与白墙风险需结合临近预报复核。",
    professionalSummaryZh: "低云多源差值约 45 个百分点，云海形成与白墙风险需结合临近预报复核。",
    shouldLowerConfidence: true,
    shouldShowReviewWarning: true,
    ...overrides,
  };
}

function lowElevationCloudSeaResultForTest(): ForecastCalculationResult {
  const base = resultWithProfessionalHourlyData();
  const lowlandProfile = {
    ...base.terrainAnalysis.terrainProfile,
    elevationMeters: 142,
    elevationSource: "manual" as const,
    elevationConfidence: "medium" as const,
    terrainType: "unknown" as const,
    exposureType: "unknown" as const,
    viewingDirection: "unknown" as const,
    nearbyValleyElevationMeters: null,
    localReliefMeters: null,
    terrainNotesZh: "仅有机位海拔，周边谷地和暴露度仍需补充。",
    locationElevation: 142,
    minElevation1km: null,
    minElevation3km: null,
    minElevation5km: null,
    maxElevation5km: null,
    avgElevation5km: null,
    elevationDiff5km: null,
    valleyDirectionZh: undefined,
    ridgeDirectionZh: undefined,
    terrainCloudSeaPotential: "low" as const,
    terrainNoteZh: "低海拔且缺少有效周边高差，不按高山云海判断。",
  };

  return {
    ...base,
    place: {
      ...base.place,
      id: "mock-place-oujiang-lowland",
      name: "瓯江河畔",
    },
    scores: {
      ...base.scores,
      cloudSea: score("cloudSea", "云海", 82),
      whiteoutRisk: score("whiteoutRisk", "白墙风险", 58),
    },
    terrainSummary: {
      ...base.terrainSummary,
      ...lowlandProfile,
      honestyNoteZh: "仅采用该地点海拔，周边高差未确认，不按高山机位判断。",
    },
    terrainAnalysis: {
      ...base.terrainAnalysis,
      terrainProfile: lowlandProfile,
      honestyNoteZh: "仅采用该地点海拔，周边高差未确认，不按高山机位判断。",
    },
    cloudSeaAnalysis: {
      ...base.cloudSeaAnalysis,
      recommendationLabel: "推荐重点关注",
      terrainSupport: {
        ...base.cloudSeaAnalysis.terrainSupport,
        score: 20,
        level: "低",
        terrainMode: "lowland",
        selectedSpotElevationMeters: 142,
        nearbyValleyElevationMeters: undefined,
        localReliefMeters: undefined,
        terrainType: "unknown",
        exposureType: "unknown",
        confidence: "low",
        messageZh: "低海拔且缺少有效周边高差，不按高山云海判断。",
      },
    },
    riskFlags: [
      {
        key: "whiteout",
        label: "白墙风险",
        level: "medium",
        description: "局部时段可能出现低云遮挡。",
      },
    ],
    keyReasons: ["地形参考：机位海拔约 142 米，周边高差暂未计算。"],
  };
}

function contradictoryLowScoreCloudSeaResultForTest(): ForecastCalculationResult {
  const base = resultWithProfessionalHourlyData();
  const weakWindow = {
    ...base.cloudSeaAnalysis.bestCloudSeaWindow!,
    score: 32,
    formationScore: 36,
    shootableScore: 32,
    whiteoutRiskScore: 42,
    noteZh: "强推荐专程云海窗口。",
    riskTag: "低云信号弱",
  };

  return {
    ...base,
    overallScore: 32,
    recommendationLabel: "强推荐专程",
    scores: {
      ...base.scores,
      cloudSea: score("cloudSea", "云海", 32),
      whiteoutRisk: score("whiteoutRisk", "白墙风险", 42),
    },
    cloudSeaAnalysis: {
      ...base.cloudSeaAnalysis,
      overallScore: 32,
      formationScore: 36,
      shootableScore: 32,
      cloudSeaOpportunityScore: 36,
      whiteoutRiskScore: 42,
      travelScore: 32,
      recommendationLabel: "推荐重点关注",
      bestCloudSeaWindow: weakWindow,
      bestCloudSeaWindows: [weakWindow],
      watchableCloudSeaWindows: [],
      notRecommendedCloudSeaWindows: [
        {
          ...weakWindow,
          phase: "waiting",
          noteZh: "低云信号弱，不建议专程。",
        },
      ],
      dailyCloudSea: base.cloudSeaAnalysis.dailyCloudSea.map((day) => ({
        ...day,
        formationScore: 36,
        opportunityScore: 36,
        shootableScore: 32,
        travelScore: 32,
        whiteoutRiskScore: 42,
        recommendationLabel: "推荐重点关注",
        bestWindow: weakWindow,
        watchableWindow: undefined,
        keyReason: "低云信号弱，不能强推荐专程。",
      })),
    },
    bestWindows: base.bestWindows.map((window) =>
      window.target === "cloud_sea"
        ? {
            ...window,
            score: 32,
            conditionScore: 36,
            practicalScore: 32,
            recommendationLevel: "recommended",
            windowLevel: "best",
            executableForDedicatedTrip: true,
            subjectPriorityLabel: "强推荐专程云海",
            copyReasonZh: "强推荐专程云海窗口。",
          }
        : window,
    ),
  };
}

function resultWithBlockedAstro(
  target: ForecastCalculationResult["target"] = "general",
): ForecastCalculationResult {
  const base = resultForTarget(target);
  const blockers = ["低云偏多，星空银河实际可见性较差。", "降水干扰"];
  const blockedAssessment = astroAssessmentForTest({
    skyConditionScore: 24,
    milkyWayGeometryScore: 62,
    transparencyScore: 36,
    dewRiskScore: 78,
    practicalAstroScore: 24,
    astroWindowAvailable: true,
    astroShootable: false,
    cloudBlockerLevel: "high",
    dewRiskLevel: "high",
    astroWeatherBlockers: blockers,
    gearAdviceZh: ["湿度较高，需准备防露带、镜头布和防水收纳。"],
    warmthAdviceZh: "夜间湿冷，需准备防风保暖层。",
    labels: {
      astronomicalWindow: "有",
      starShootability: "低",
      milkyWayShootability: "低",
      moonlightImpact: "低",
      cloudBlocker: "高",
      dewRisk: "高",
      windowRecommendation: "仅作备选窗口",
    },
  });
  const blockedAstroWindow = {
    ...base.bestWindows.find(
      (window) => window.target === "astro" && window.label.includes("银河"),
    )!,
    score: 64,
    conditionScore: 70,
    practicalScore: 24,
    recommendationLevel: "backup" as const,
    windowLevel: "blocked" as const,
    executableForDedicatedTrip: false,
    suitableIfNearby: false,
    subjectPriorityLabel: "银河天文窗口",
    weatherBlockers: blockers,
    blockerReasons: blockers,
    copyReasonZh: "天文窗口存在，但低云偏多、降水干扰不支持拍摄。",
  };

  return {
    ...base,
    scores: {
      ...base.scores,
      stars: score("stars", "星空", 24),
      milkyWay: score("milkyWay", "银河", 24),
      transparency: score("transparency", "通透度", 36),
    },
    astroAnalysis: {
      ...base.astroAnalysis,
      starsScore: 24,
      milkyWayScore: 24,
      astroConditionScore: 24,
      astroPracticalScore: 24,
      ...astroAnalysisFieldsForTest(blockedAssessment),
      moonImpactScore: 18,
      transparencyScore: 36,
      astroTravelScore: 24,
      recommendationLabel: "不建议专程",
      astroWindowAvailable: true,
      astroShootable: false,
      recommendedMilkyWayWindow: undefined,
      recommendedMilkyWayWindows: [],
      bestAstroWindows: base.astroAnalysis.astronomicalNightWindows,
      weatherBlockers: blockers,
      riskReasons: ["低云偏多，星空银河实际可见性较差。", "降水干扰明显。"],
      travelRecommendations: [
        "有天文窗口，但低云偏多，不建议作为唯一目标。",
        "湿度较高，需准备防露和保暖。",
      ],
      dailyAstro: base.astroAnalysis.dailyAstro.map((day) => ({
        ...day,
        starsScore: 24,
        milkyWayScore: 24,
        astroConditionScore: 24,
        astroPracticalScore: 24,
        ...dailyAstroFieldsForTest(blockedAssessment),
        astroWindowAvailable: true,
        astroShootable: false,
        weatherBlockers: blockers,
        recommendedMilkyWayWindow: undefined,
        moonImpactLevel: "low",
        recommendationLabel: "不建议专程",
        keyReason: "天文窗口存在，但低云偏多、降水干扰不支持拍摄。",
        riskNote: "天气阻断",
      })),
    },
    bestWindows: [
      blockedAstroWindow,
      ...base.bestWindows.filter(
        (window) => !(window.target === "astro" && window.label.includes("银河")),
      ),
    ],
    targetDailyBreakdown: base.targetDailyBreakdown.map((day) => ({
      ...day,
      stars: day.stars
        ? {
            ...day.stars,
            score: 24,
            detail: "有天文窗口，但云量/低云/降水条件不支持拍摄。",
            window: {
              ...blockedAstroWindow,
              label: "天文黑夜 20:24 - 03:48",
            },
          }
        : day.stars,
      milkyWay: day.milkyWay
        ? {
            ...day.milkyWay,
            score: 24,
            detail: "银河有天文窗口，但云量/降水不支持拍摄。",
            window: blockedAstroWindow,
          }
        : day.milkyWay,
    })),
  };
}

function queryForTarget(target: ForecastCalculationResult["target"]): ForecastQueryInput {
  return {
    name: baseResult.place.name,
    source: "local_photo_spot",
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    latitudeWgs84: baseResult.calendarBasis.wgs84Coordinates.latitude,
    longitudeWgs84: baseResult.calendarBasis.wgs84Coordinates.longitude,
    horizon: baseResult.horizon,
    target,
    locationId: "location-huangshan",
    photoSpotId: "spot-guangmingding",
  };
}

function aiExplanationForTest(
  decision = "DeepSeek 成功生成的拍摄结论。",
  source: "deepseek" | "deterministic_fallback" = "deepseek",
) {
  return {
    conclusion: {
      titleZh: "拍摄天气解读",
      summaryZh: "未来 48 小时以确定性天气和题材评分为准。",
      recommendedDayZh: "优先关注第一天清晨。",
      recommendationLevelZh: "值得等待",
      whetherWorthDedicatedTripZh: "专程前需要临近复核。",
      oneSentenceDecisionZh: decision,
    },
    bestPlan: {
      primaryTargetZh: "云海与晨光",
      bestDateZh: "2026 年 5 月 20 日",
      bestWindowZh: "2026 年 5 月 20 日 05:00-07:00",
      recommendedArrivalZh: "建议 04:20 前到位。",
      whyThisWindowZh: "低云、湿度和光线窗口组合更值得观察。",
      backupPlanZh: "若云层不开口，转拍远山层次。",
    },
    weatherTrend: {
      trendSummaryZh: "云量偏多，需要等待短时开口。",
      temperatureSummaryZh: "山顶清晨偏凉。",
      rainSummaryZh: "降水风险较低。",
      windSummaryZh: "风力可控。",
      transparencySummaryZh: "通透度中等，需要现场复核。",
    },
    dayByDay: [
      {
        dateZh: "2026 年 5 月 20 日",
        recommendationZh: "清晨优先观察。",
        scoreZh: "综合 76 分",
        temperatureZh: "10-18°C",
        rainZh: "低风险",
        cloudSeaZh: "云海机会较好",
        glowZh: "朝霞可观察",
        sunsetGlowZh: "晚霞备选",
        astroZh: "星空需复核云量",
        transparencyZh: "中等",
        bestWindowZh: "05:00-07:00",
        actionZh: "提前到位复核低云上沿。",
      },
    ],
    subjectAdvice: {
      cloudSeaZh: "云海机会较好，但要复核白墙风险。",
      sunriseGlowZh: "朝霞可观察。",
      sunsetGlowZh: "晚霞作为备选。",
      astroMilkyWayZh: "星空银河需要复核云量和月光。",
      transparencyZh: "通透度中等。",
    },
    riskAndGear: {
      keyRisks: ["低云过厚会压住视野。"],
      clothingZh: "准备防风外套。",
      gearZh: "三脚架、防潮袋和备用电池。",
      safetyZh: "保留撤离时间。",
    },
    finalAdvice: {
      goNoGoZh: "可观察，专程需复核。",
      ifAlreadyNearbyZh: "若已在附近，可以按窗口短时等待。",
      ifDedicatedTripZh: "不建议只押单一题材专程。",
      nextCheckZh: "复核短临降水、低云、能见度和阵风。",
    },
    metadata: {
      source,
    },
  };
}

function renderAiPanelFromOutcome(outcome: ReturnType<typeof normalizeAiExplainResponse>): string {
  return renderToStaticMarkup(
    React.createElement(AiExplanationPanel, {
      status: outcome.status,
      explanation: outcome.explanation,
      errorMessage: outcome.errorMessage,
      retryable: outcome.retryable,
      onGenerate: vi.fn(),
    }),
  );
}

function countOccurrences(text: string, pattern: string): number {
  return text.split(pattern).length - 1;
}

function sectionBetween(html: string, startMarker: string, endMarker: string): string {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);

  return start >= 0 && end > start ? html.slice(start, end) : "";
}

function expectMarkersInOrder(html: string, markers: readonly string[]): void {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = html.indexOf(marker);
    expect(index, `Expected marker "${marker}" to be rendered`).toBeGreaterThanOrEqual(0);
    expect(
      index,
      `Expected marker "${marker}" to render after the previous marker`,
    ).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
}

function decodedHrefs(html: string): readonly string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) =>
    (match[1] ?? "").replace(/&amp;/g, "&"),
  );
}

describe("forecast result target-aware view model", () => {
  it("uses Simplified Chinese target labels", () => {
    expect(forecastTargetLabels).toMatchObject({
      general: "综合判断",
      cloud_sea: "云海",
      glow: "朝霞晚霞",
      astro: "星空银河",
    });
  });

  it("builds a cloud sea daily deep link with resultId, date, and window", () => {
    const query = queryForTarget("general");
    const result = resultForTarget("general");
    const link = buildGeneralDailySubjectLinks({
      query,
      result,
      date: "2026-05-20",
    }).find((item) => item.target === "cloud_sea");
    const url = new URL(link?.href ?? "", "http://localhost:3000");

    expect(url.pathname).toBe("/cloud-sea");
    expect(url.searchParams.get("resultId")).toBe(createForecastResultContextId(query, result));
    expect(url.searchParams.get("target")).toBe("cloud_sea");
    expect(url.searchParams.get("subject")).toBe("cloud_sea");
    expect(url.searchParams.get("date")).toBe("2026-05-20");
    expect(url.searchParams.get("windowStart")).toBe("2026-05-20T05:00:00+08:00");
    expect(url.searchParams.get("windowEnd")).toBe("2026-05-20T07:00:00+08:00");
    expect(url.searchParams.get("source")).toBe("general");
    expect(url.searchParams.get("returnUrl")).toContain("/forecast?");
  });

  it("builds a glow daily deep link with subject, date, and window", () => {
    const link = buildGeneralDailySubjectLinks({
      query: queryForTarget("general"),
      result: resultForTarget("general"),
      date: "2026-05-20",
    }).find((item) => item.target === "glow");
    const url = new URL(link?.href ?? "", "http://localhost:3000");

    expect(url.pathname).toBe("/glow");
    expect(url.searchParams.get("target")).toBe("glow");
    expect(url.searchParams.get("subject")).toBe("sunset_glow");
    expect(url.searchParams.get("date")).toBe("2026-05-20");
    expect(url.searchParams.get("windowStart")).toBe("2026-05-20T17:56:00+08:00");
    expect(url.searchParams.get("windowEnd")).toBe("2026-05-20T19:41:00+08:00");
  });

  it("builds an astro daily deep link with Milky Way subject, date, and window", () => {
    const link = buildGeneralDailySubjectLinks({
      query: queryForTarget("general"),
      result: resultForTarget("general"),
      date: "2026-05-20",
    }).find((item) => item.target === "astro");
    const url = new URL(link?.href ?? "", "http://localhost:3000");

    expect(url.pathname).toBe("/astro");
    expect(url.searchParams.get("target")).toBe("astro");
    expect(url.searchParams.get("subject")).toBe("milky_way");
    expect(url.searchParams.get("date")).toBe("2026-05-20");
    expect(url.searchParams.get("windowStart")).toBe("2026-05-21T01:10:00+08:00");
    expect(url.searchParams.get("windowEnd")).toBe("2026-05-21T03:30:00+08:00");
  });

  it("includes location fallback params when resultId is missing", () => {
    const query: ForecastQueryInput = {
      ...queryForTarget("general"),
      name: "武功山金顶",
      source: "manual",
      latitudeGcj02: 27.4721,
      longitudeGcj02: 114.1532,
      latitudeWgs84: 27.4695,
      longitudeWgs84: 114.1488,
      elevationMeters: 1918,
      elevationSource: "manual",
      elevationConfidence: "medium",
      locationId: undefined,
      photoSpotId: undefined,
    };
    const url = new URL(
      buildSubjectDetailDeepLink({
        query,
        target: "astro",
        subject: "milky_way",
        date: "2026-05-20",
        windowStart: "2026-05-20T21:00:00+08:00",
        windowEnd: "2026-05-21T03:30:00+08:00",
        returnUrl: "/forecast?target=general",
      }),
      "http://localhost:3000",
    );

    expect(url.searchParams.get("resultId")).toBeNull();
    expect(url.searchParams.get("locationName")).toBe("武功山金顶");
    expect(url.searchParams.get("lat")).toBe(String(query.latitudeWgs84));
    expect(url.searchParams.get("lng")).toBe(String(query.longitudeWgs84));
    expect(url.searchParams.get("latGcj02")).toBe(String(query.latitudeGcj02));
    expect(url.searchParams.get("lngGcj02")).toBe(String(query.longitudeGcj02));
    expect(url.searchParams.get("elevation")).toBe("1918");
    expect(url.searchParams.get("horizon")).toBe(query.horizon);
    expect(url.searchParams.get("returnUrl")).toBe("/forecast?target=general");
  });

  it("parses location fallback context and does not place secrets in the URL", () => {
    const query: ForecastQueryInput = {
      ...queryForTarget("general"),
      name: "非种子搜索机位",
      source: "manual",
      latitudeGcj02: 31.3,
      longitudeGcj02: 119.4,
      latitudeWgs84: 31.295,
      longitudeWgs84: 119.395,
      elevationMeters: 632,
      elevationSource: "open_meteo_elevation",
      elevationConfidence: "medium",
      locationId: undefined,
      photoSpotId: undefined,
    };
    const href = buildSubjectDetailDeepLink({
      query,
      target: "cloud_sea",
      subject: "cloud_sea",
      date: "2026-05-20",
      windowStart: "2026-05-20T05:00:00+08:00",
      windowEnd: "2026-05-20T07:00:00+08:00",
    });
    const url = new URL(href, "http://localhost:3000");
    const parsed = parseSubjectDetailSearchParams("cloud_sea", {
      target: url.searchParams.get("target") ?? undefined,
      subject: url.searchParams.get("subject") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
      windowStart: url.searchParams.get("windowStart") ?? undefined,
      windowEnd: url.searchParams.get("windowEnd") ?? undefined,
      source: url.searchParams.get("source") ?? undefined,
      locationName: url.searchParams.get("locationName") ?? undefined,
      lat: url.searchParams.get("lat") ?? undefined,
      lng: url.searchParams.get("lng") ?? undefined,
      elevation: url.searchParams.get("elevation") ?? undefined,
      horizon: url.searchParams.get("horizon") ?? undefined,
      locationSource: url.searchParams.get("locationSource") ?? undefined,
      elevationSource: url.searchParams.get("elevationSource") ?? undefined,
      elevationConfidence: url.searchParams.get("elevationConfidence") ?? undefined,
    });

    expect(parsed.kind).toBe("ready");
    if (parsed.kind === "ready") {
      expect(parsed.fallbackQuery).toMatchObject({
        name: "非种子搜索机位",
        latitudeWgs84: 31.295,
        longitudeWgs84: 119.395,
        elevationMeters: 632,
        target: "cloud_sea",
      });
    }
    expect(href).not.toMatch(/api[_-]?key|secret|token|password/i);
  });

  it("keeps the general view as a complete dashboard", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("general"), "general");

    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "推荐等级",
      "最佳拍摄窗口",
      "到达建议",
      "云海 / 白墙",
      "朝霞 / 晚霞机会",
      "霞光窗口",
      "主要风险",
      "优先题材",
    ]);
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "sunriseGlow",
      "sunsetGlow",
      "cloudSea",
      "whiteoutRisk",
      "stars",
      "milkyWay",
      "transparency",
    ]);
    expect(viewModel.detailSections.map((section) => section.title)).toContain("天文数据");
    expect(viewModel.detailSections.map((section) => section.title)).toContain("地形摘要");
    expect(viewModel.detailSections.map((section) => section.title)).toContain("关键依据");
    expect(viewModel.riskSections.map((section) => section.title)).toContain("风险提示");
    expect(viewModel.adviceSections.map((section) => section.title)).toContain("拍摄建议");
    expect(viewModel.hiddenModuleKeys).toHaveLength(0);
  });

  it("renders the general result page as a user-facing decision report without provider diagnostics", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain('data-forecast-decision-page-shell="true"');
    expect(html).toContain('data-testid="decision-result-template"');
    expect(html).toContain('data-forecast-result-header="true"');
    expect(html).toContain('data-forecast-result-summary-card="true"');
    expect(html).toContain('data-forecast-score-card="true"');
    expect(html).toContain('data-testid="decision-score-card"');
    expect(html).toContain('data-forecast-metric-grid="true"');
    expect(html).toContain('data-forecast-current-weather-cards="true"');
    expect(html).toContain('data-forecast-daily-decision-list="true"');
    expect(html).toContain('data-result-judgment-basis-grid="true"');
    expect(html).toContain('data-result-action-plan-grid="true"');
    expect(html).toContain("出行判断");
    expect(html).toContain("综合出片指数");
    expect(html.match(/综合出片指数/g)?.length).toBe(1);
    expect(html).toContain("当前与近时段天气");
    expect(html).toContain("逐日拍摄判断");
    expect(html).not.toContain("题材拆解");
    expect(html).toContain("风险提醒");
    expect(html).toContain("重点时段：2026年5月20日 周三 05:00-07:00");
    expect(html).toContain("影响时段：");
    expect(html).toContain("建议：");
    expect(html).toContain("到场观察云顶高度，避免只守单一机位。");
    expect(html).toContain("出行建议");
    expect(html).not.toContain("数据来源");
    expect(html).not.toContain("计算与数据");
    expect(html).not.toContain("WGS84");
    expect(html).not.toContain("GCJ-02");
    expect(html).not.toContain("和风天气");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("本地算法");
    expect(html).not.toContain("地形数据：演示数据");
    expect(html).not.toContain("当前天气或地形仍包含演示数据");
  });

  it("does not render unknown terrain elevation or local relief as zero", () => {
    const baseResult = resultForTarget("general");
    const unknownTerrain = {
      ...baseResult.terrainAnalysis.terrainProfile,
      elevationMeters: null,
      elevationSource: "unknown" as const,
      elevationConfidence: "low" as const,
      locationElevation: null,
      minElevation1km: null,
      minElevation3km: null,
      minElevation5km: null,
      maxElevation5km: null,
      avgElevation5km: null,
      elevationDiff5km: null,
      nearbyValleyElevationMeters: null,
      localReliefMeters: null,
      terrainCloudSeaPotential: "low" as const,
      terrainNoteZh: "海拔资料暂未确认，体感仅作参考。",
    };
    const result: ForecastCalculationResult = {
      ...baseResult,
      keyReasons: ["地形参考：机位海拔暂未确认，体感仅作参考，周边高差暂未计算。"],
      terrainSummary: {
        ...baseResult.terrainSummary,
        ...unknownTerrain,
        dataSource: "unknown",
        dataSourceLabelZh: "海拔暂未确认",
        isMock: true,
        honestyNoteZh: "海拔资料暂未确认，体感仅作参考。",
      },
      terrainAnalysis: {
        ...baseResult.terrainAnalysis,
        terrainProfile: unknownTerrain,
        dataSource: "unknown",
        dataSourceLabelZh: "海拔暂未确认",
        isMock: true,
        honestyNoteZh: "海拔资料暂未确认，体感仅作参考。",
      },
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("海拔资料暂未确认，体感仅作参考");
    expect(html).toContain("周边高差暂未计算");
    expect(html).not.toContain("机位海拔约 0 米");
    expect(html).not.toContain("5公里高差约 0 米");
    expect(html).not.toContain(">0 米<");
  });

  it("renders simplified general daily cards with one primary and one backup window", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain('data-testid="daily-forecast-decision"');
    expect(html).toContain('data-testid="daily-cards-adaptive-grid"');
    expect(html).toContain('data-result-dashboard-shell="true"');
    expect(html).toContain('data-result-target="general"');
    expect(html).toContain('data-result-header-summary-card="true"');
    expect(html).toContain('data-result-score-card="true"');
    expect(html).toContain('data-result-metric-grid="true"');
    expect(countOccurrences(html, 'data-result-metric-card="true"')).toBe(7);
    expect(html).toContain('data-result-current-weather-section="true"');
    expect(html).toContain('data-result-daily-section="true"');
    expect(html).toContain('data-result-action-plan-grid="true"');
    expect(countOccurrences(html, 'data-testid="daily-card"')).toBe(result.dailySummaries.length);
    expect(countOccurrences(html, 'data-testid="daily-primary-window"')).toBe(
      result.dailySummaries.length,
    );
    expect(countOccurrences(html, 'data-testid="daily-backup-window"')).toBeLessThanOrEqual(
      result.dailySummaries.length,
    );
    expect(html).toContain('data-testid="top-decision-cards"');
    expect(html).toContain('data-testid="near-term-weather"');
    expect(html).not.toContain('data-testid="subject-breakdown"');
    expect(html).toContain('data-testid="action-plan"');
    expect(html).toContain("xl:grid-cols-7");
    expect(html).toContain("repeat(auto-fit,minmax(220px,1fr))");
    expect(html).toContain("repeat(auto-fit,minmax(250px,1fr))");
    expect(html).toContain("repeat(auto-fit,minmax(300px,1fr))");
    expect(html).toContain("当前与近时段天气（2026年5月20日 周三 00:00-06:00）");
    expect(html).toContain("当前实况：2026年5月20日 00:00");
    expect(html).toContain("近时段参考：2026年5月20日 周三 00:00-06:00");
    expect(html).toContain("查看云海详情");
    expect(html).toContain("查看霞光详情");
    expect(html).toContain("查看星空详情");
    expect(html).toContain('href="/cloud-sea?');
    expect(html).toContain('href="/glow?');
    expect(html).toContain('href="/astro?');
    expect(html).toContain("source=general");
    expect(html).not.toContain('href="/cloud-sea"');
    expect(html).not.toContain('href="/glow"');
    expect(html).not.toContain('href="/astro"');
    const topDecisionCards = html.slice(
      html.indexOf('data-testid="top-decision-cards"'),
      html.indexOf('data-testid="near-term-weather"'),
    );
    expect(topDecisionCards).not.toContain("综合出片指数");
    expect(topDecisionCards.indexOf("到达建议")).toBeLessThan(
      topDecisionCards.indexOf("云海 / 白墙"),
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );
    expect(dailySection).toContain("推荐安排");
    expect(dailySection).not.toContain("推荐专程前往");
    expect(dailySection).toContain("多云间晴");
    expect(dailySection).toContain("机位估算温度：10–18°C");
    expect(dailySection).toContain("降水概率：18%｜风：3.4m/s｜通透：较好");
    expect(dailySection).toContain("优先关注：");
    expect(dailySection).toContain("清晨云海 2026年5月20日 周三 05:00-07:00");
    expect(dailySection).toContain("备选观察：");
    expect(dailySection).toContain("晚霞 2026年5月20日 周三 17:56-19:41");
    expect(dailySection).toContain("主要风险：");
    expect(dailySection).toContain("白墙风险");
    expect(dailySection).toContain("行动：");
    expect(dailySection).toContain("清晨云海可优先安排，到场先复核云顶高度和白墙风险。");
    expect(dailySection).toContain("降水时段分散，优先等待雨后短暂开口。");
    expect(dailySection).not.toContain("云海形成 82分");
    expect(dailySection).not.toContain("云海可拍 82分");
    expect(dailySection).not.toContain("白墙风险 58分");
    expect(dailySection).not.toContain("朝霞 70分");
    expect(dailySection).not.toContain("晚霞 74分");
    expect(dailySection).not.toContain("天文窗口 有");
    expect(dailySection).not.toContain("星空可拍性");
    expect(dailySection).not.toContain("银河可拍性");
    expect(dailySection).not.toContain("是否建议夜拍");
    expect(dailySection).not.toContain("专程判断：");
    expect(dailySection).not.toContain("附近观察：");
    expect(dailySection).not.toContain("专业判断");
    expect(dailySection).not.toContain("星空银河：");
    expect(dailySection).not.toContain("低云遮挡：");
    expect(dailySection).not.toContain("雨后开口：");
    expect(dailySection).not.toContain("现场复核：");
    expect(dailySection).not.toContain("建议：当天有可优先关注的拍摄窗口。");
    expect(countOccurrences(dailySection, "现场重点复核云层开口和通透度")).toBeLessThanOrEqual(1);
    expect(countOccurrences(dailySection, "条件和风险匹配度较好")).toBe(0);
    expect(countOccurrences(dailySection, "可按最佳窗口组织出发")).toBe(0);
    expect(html).toContain("机位估算温度：10-18°C");
    expect(html).toContain("预报已接近机位海拔，未额外修正");
    expect(html).toContain("体感 7-16°C");
    expect(html).toContain("降水风险");
    expect(html).toContain("3.2 m/s 东南风");
    expect(html).toContain("18 公里");
    expect(html).not.toMatch(/(?:^|\s)(?:w|min-w)-\[(?:[1-9]\d{3,})px\]/);
  });

  it("uses concise rain-window action copy on general daily cards", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      dailySummaries: base.dailySummaries.map((summary, index) =>
        index === 0
          ? {
              ...summary,
              rainOverlapsPriorityWindow: true,
              rainNearPriorityWindow: false,
              rainOverlapWindowLabelZh: "日落窗口附近",
              rainImpactOnRecommendation: "medium",
              rainActionZh: "日落窗口附近有弱降水信号，晚霞判断需谨慎。",
            }
          : summary,
      ),
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(dailySection).toContain("主要风险：");
    expect(dailySection).toContain("降水干扰");
    expect(dailySection).toContain("行动：");
    expect(dailySection).toContain("日落窗口附近有弱降水信号，晚霞判断需谨慎。");
    expect(dailySection).not.toContain("云海形成 82分");
    expect(dailySection).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
  });

  it("uses lowland wording for low-elevation general forecasts", () => {
    const base = resultForTarget("general");
    const cloudMistWindow: ForecastCalculationResult["bestWindows"][number] = {
      ...base.bestWindows[0]!,
      label: "晨雾或云层变化 05:00 - 07:00",
      score: 38,
      conditionScore: 44,
      practicalScore: 38,
      windowLevel: "watchable",
      recommendationLevel: "cautious",
      executableForDedicatedTrip: false,
      suitableIfNearby: true,
      subjectPriorityLabel: "晨雾或云层变化",
      blockerReasons: ["低云遮挡需现场复核"],
      practicalNoteZh: "晨雾或低云变化可顺带观察，但地形不支持按高山云海专程判断。",
      target: "cloud_sea",
    };
    const cloudMistAnalysisWindow: ForecastCalculationResult["cloudSeaAnalysis"]["watchableCloudSeaWindows"][number] =
      {
        label: "晨雾或云层变化 05:00 - 07:00",
        date: "2026-05-20",
        startTime: cloudMistWindow.startTime,
        endTime: cloudMistWindow.endTime,
        score: 38,
        formationScore: 44,
        shootableScore: 38,
        whiteoutRiskScore: 62,
        lightAlignedScore: 72,
        target: "cloud_sea",
        phase: "observation",
        noteZh: "晨雾或低云变化可顺带观察，但地形不支持按高山云海专程判断。",
        riskTag: "低云遮挡中",
        rainOpening: base.cloudSeaAnalysis.rainOpening,
      };
    const cloudMistWatchableWindow: NonNullable<
      ForecastCalculationResult["dailySummaries"][number]["watchableWindows"]
    >[number] = {
      subject: "晨雾或云层变化",
      target: "cloud_sea",
      startTime: cloudMistWindow.startTime,
      endTime: cloudMistWindow.endTime,
      windowLevel: "watchable",
      recommendationLevel: "cautious",
      reasonZh: "晨雾或低云变化可顺带观察，但地形不支持按高山云海专程判断。",
      suitableForDedicatedTrip: false,
      suitableIfNearby: true,
    };
    const lowlandProfile = {
      ...base.terrainAnalysis.terrainProfile,
      elevationMeters: 142,
      elevationSource: "manual" as const,
      elevationConfidence: "medium" as const,
      terrainType: "unknown" as const,
      exposureType: "unknown" as const,
      viewingDirection: "unknown" as const,
      nearbyValleyElevationMeters: null,
      localReliefMeters: null,
      terrainNotesZh: "仅有机位海拔，周边谷地和暴露度仍需补充。",
      locationElevation: 142,
      minElevation1km: null,
      minElevation3km: null,
      minElevation5km: null,
      maxElevation5km: null,
      avgElevation5km: null,
      elevationDiff5km: null,
      valleyDirectionZh: undefined,
      ridgeDirectionZh: undefined,
      terrainCloudSeaPotential: "low" as const,
      terrainNoteZh: "低海拔且缺少有效周边高差，不按高山云海判断。",
    };
    const result: ForecastCalculationResult = {
      ...base,
      scores: {
        ...base.scores,
        cloudSea: score("cloudSea", "晨雾/低云", 42),
        whiteoutRisk: score("whiteoutRisk", "低云遮挡", 62),
      },
      currentWeather: {
        ...base.currentWeather!,
        temperature: 24,
        feelsLike: 25,
        mountainFeelsLikeC: 25,
        selectedSpotElevationMeters: 142,
        providerElevationMeters: 142,
        elevationDifferenceMeters: 0,
        terrainAdjustmentApplied: false,
        terrainAdjustmentReason: "provider_elevation_close_to_spot",
        windChillNoteZh: "体感仍需结合现场风口和遮挡条件复核。",
        clothingRiskNoteZh: "穿衣按清晨体感准备，保留轻量防风层。",
      },
      terrainSummary: {
        ...base.terrainSummary,
        ...lowlandProfile,
        honestyNoteZh: "仅采用该地点海拔，周边高差未确认，不按高山机位判断。",
      },
      terrainAnalysis: {
        ...base.terrainAnalysis,
        terrainProfile: lowlandProfile,
        honestyNoteZh: "仅采用该地点海拔，周边高差未确认，不按高山机位判断。",
      },
      cloudSeaAnalysis: {
        ...base.cloudSeaAnalysis,
        overallScore: 38,
        formationScore: 44,
        shootableScore: 38,
        cloudSeaOpportunityScore: 44,
        whiteoutRiskScore: 62,
        labels: {
          formationOpportunity: "低",
          shootableOpportunity: "低",
          whiteoutRisk: "中",
          bestWindowLabel: "暂无明确云雾观察窗口",
          watchableWindowLabel: "晨雾或云层变化 05:00 - 07:00",
        },
        terrainSupport: {
          score: 20,
          level: "低",
          terrainMode: "lowland",
          selectedSpotElevationMeters: 142,
          terrainType: "unknown",
          exposureType: "unknown",
          confidence: "low",
          messageZh: "低海拔且缺少有效周边高差，不按高山云海判断。",
        },
        bestCloudSeaWindow: undefined,
        bestCloudSeaWindows: [],
        watchableCloudSeaWindows: [cloudMistAnalysisWindow],
        notRecommendedCloudSeaWindows: [],
        dailyCloudSea: base.cloudSeaAnalysis.dailyCloudSea.map((day) => ({
          ...day,
          formationScore: 44,
          opportunityScore: 44,
          shootableScore: 38,
          whiteoutRiskScore: 62,
          labels: {
            formationOpportunity: "低",
            shootableOpportunity: "低",
            whiteoutRisk: "中",
            bestWindowLabel: "暂无明确云雾观察窗口",
            watchableWindowLabel: "晨雾或云层变化 05:00 - 07:00",
          },
          bestWindow: cloudMistAnalysisWindow,
          watchableWindow: cloudMistAnalysisWindow,
          keyReason: "低云/晨雾条件存在，但缺少高差支撑，按云层变化和通透度处理。",
          riskNote: "低云遮挡风险中等，需要现场观察雾气厚度和能见度。",
        })),
        whiteoutReasons: ["低云遮挡风险中等，需要现场观察雾气厚度和能见度。"],
        opportunityReasons: ["低云/晨雾条件 44 分：低海拔地形不按高山云海判断。"],
      },
      bestWindows: [
        cloudMistWindow,
        ...base.bestWindows.filter((window) => window.target !== "cloud_sea"),
      ],
      dailySummaries: base.dailySummaries.map((summary) => ({
        ...summary,
        weather: summary.weather
          ? {
              ...summary.weather,
              weatherTextZh: summary.weather.weatherTextZh === "多云间晴" ? "多云转多云" : "阴转阴",
              tempMin: 16,
              tempMax: 30,
              temperatureCorrectionApplied: false,
              temperatureCorrectionReason: "provider_elevation_close_to_spot",
              selectedSpotElevationMeters: 142,
              providerElevationMeters: 142,
              providerElevationKnown: true,
              feelsLikeMin: 17,
              feelsLikeMax: 31,
              mountainFeelsLikeMin: undefined,
              mountainFeelsLikeMax: undefined,
            }
          : summary.weather,
        bestShootableWindow: summary.date === "2026-05-20" ? cloudMistWindow : undefined,
        watchableWindows: [cloudMistWatchableWindow],
        riskFlags: [
          {
            key: "low_cloud",
            label: "低云遮挡",
            level: "medium",
            description: "低云或雾气可能影响通透度。",
          },
        ],
      })),
      targetDailyBreakdown: base.targetDailyBreakdown.map((day) => ({
        ...day,
        cloudSea: {
          label: "晨雾/低云观察",
          score: 38,
          detail: "云雾信号低，云层开口低，低云遮挡中。",
          window: cloudMistWindow,
        },
        whiteoutRisk: {
          label: "低云遮挡",
          score: 62,
          detail: "低云、雾气和能见度组合需要出行前复核。",
          window: cloudMistWindow,
        },
      })),
      riskFlags: [
        {
          key: "low_cloud",
          label: "低云遮挡",
          level: "medium",
          description: "低云或雾气可能影响通透度。",
        },
      ],
      keyReasons: ["地形参考：机位海拔约 142 米，周边高差暂未计算。"],
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const topDecisionCards = html.slice(
      html.indexOf('data-testid="top-decision-cards"'),
      html.indexOf('data-testid="near-term-weather"'),
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(topDecisionCards).toContain("晨雾 / 低云");
    expect(topDecisionCards).not.toContain("云海 / 白墙");
    expect(topDecisionCards).not.toContain("山顶");
    expect(topDecisionCards).not.toContain("白墙");
    expect(dailySection).toContain("多云");
    expect(dailySection).toContain("机位估算温度：16–30°C");
    expect(dailySection).toContain("晨雾或云层变化 2026年5月20日 周三 05:00-07:00");
    expect(dailySection).toContain("低云遮挡");
    expect(dailySection).toContain("关注晨雾、云层开口或日落光线，不建议按高山云海逻辑判断。");
    expect(dailySection).not.toContain("山顶估算温度");
    expect(dailySection).not.toContain("清晨云海");
    expect(dailySection).not.toContain("山脊风风险");
    expect(dailySection).not.toContain("白墙风险");
    expect(html).toContain("机位估算温度：24°C / 体感温度 25°C");
    expect(html).toContain("预报接近该地点海拔，未额外修正");
    expect(html).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
  });

  it("renders exactly five compact subject summaries on the general opportunity section", () => {
    const query = queryForTarget("general");
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query,
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const summarySection = sectionBetween(
      html,
      'data-testid="opportunity-windows"',
      'data-testid="risk-section"',
    );
    const hrefs = decodedHrefs(summarySection);
    const urls = hrefs.map((href) => new URL(href, "http://localhost:3000"));

    expect(countOccurrences(summarySection, 'data-testid="general-subject-summary-card"')).toBe(5);
    expect(
      countOccurrences(summarySection, 'data-testid="general-subject-recommendation-badge"'),
    ).toBe(5);
    expect(
      countOccurrences(summarySection, 'data-testid="general-subject-risk-badge"'),
    ).toBeLessThanOrEqual(5);
    expect(
      countOccurrences(summarySection, 'data-testid="general-subject-recommended-window"'),
    ).toBe(5);
    expect(
      countOccurrences(summarySection, 'data-testid="general-subject-backup-window"'),
    ).toBeLessThanOrEqual(5);
    expect(summarySection).toContain('data-subject="cloudSea"');
    expect(summarySection).toContain('data-subject="sunriseGlow"');
    expect(summarySection).toContain('data-subject="sunsetGlow"');
    expect(summarySection).toContain('data-subject="stars"');
    expect(summarySection).toContain('data-subject="milkyWay"');
    expect(summarySection).toContain(">云海<");
    expect(summarySection).toContain(">朝霞<");
    expect(summarySection).toContain(">晚霞<");
    expect(summarySection).toContain(">星空<");
    expect(summarySection).toContain(">银河<");
    expect(countOccurrences(summarySection, "机会指数")).toBe(5);
    expect(summarySection).toContain("72%");
    expect(summarySection).toContain("70%");
    expect(summarySection).toContain("74%");
    expect(summarySection).toContain("66%");
    expect(summarySection).toContain("68%");
    expect(summarySection).toContain("推荐窗口：</span>2026年5月20日 周三 05:00-07:00");
    expect(summarySection).toContain("推荐窗口：</span>2026年5月20日 周三 04:30-06:15");
    expect(summarySection).toContain("推荐窗口：</span>2026年5月20日 周三 17:56-19:41");
    expect(summarySection).toContain(
      "推荐窗口：</span>2026年5月20日 周三 20:24 - 5月21日 周四 03:48",
    );
    expect(summarySection).toContain("查看云海详情");
    expect(countOccurrences(summarySection, "查看霞光详情")).toBe(2);
    expect(countOccurrences(summarySection, "查看星空详情")).toBe(2);
    expect(summarySection).not.toContain("日落暖光");
    expect(summarySection).not.toContain("日落后余晖");
    expect(summarySection).not.toContain("雨后云雾");
    expect(summarySection).not.toContain("月光地景");
    expect(summarySection).not.toContain("云层纹理");
    expect(summarySection).not.toContain("远山层次");
    expect(summarySection).not.toContain("实用 ");
    expect(summarySection).not.toContain("气象 ");
    expect(summarySection).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
    expect(summarySection).not.toMatch(/api[_-]?key|secret|token|sk-/i);
    expect(urls.map((url) => url.pathname)).toEqual([
      "/cloud-sea",
      "/glow",
      "/glow",
      "/astro",
      "/astro",
    ]);
    expect(urls.map((url) => url.searchParams.get("subject"))).toEqual([
      "cloud_sea",
      "sunrise_glow",
      "sunset_glow",
      "astro",
      "milky_way",
    ]);
    for (const url of urls) {
      expect(url.searchParams.get("resultId")).toBe(createForecastResultContextId(query, result));
      expect(url.searchParams.get("source")).toBe("general");
      expect(url.searchParams.get("returnUrl")).toContain("/forecast?");
      expect(url.searchParams.get("locationName")).toBe("黄山光明顶");
      expect(url.searchParams.get("latWgs84")).toBe("30.13012");
      expect(url.searchParams.get("lngWgs84")).toBe("118.16389");
    }
    expect(urls[0]!.searchParams.get("date")).toBe("2026-05-20");
    expect(urls[0]!.searchParams.get("windowStart")).toBe("2026-05-20T05:00:00+08:00");
    expect(urls[0]!.searchParams.get("windowEnd")).toBe("2026-05-20T07:00:00+08:00");
    expect(urls[4]!.searchParams.get("windowStart")).toBe("2026-05-22T01:05:00+08:00");
    expect(urls[4]!.searchParams.get("windowEnd")).toBe("2026-05-22T03:20:00+08:00");
  });

  it("shows blocked astro reasons on the general result page without recommending Milky Way", () => {
    const result = resultWithBlockedAstro("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const windowSection = sectionBetween(
      html,
      'data-testid="opportunity-windows"',
      'data-testid="risk-section"',
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(html).not.toContain('data-testid="subject-breakdown"');
    expect(dailySection).not.toContain("星空可拍性");
    expect(dailySection).not.toContain("银河可拍性");
    expect(dailySection).not.toContain("天文窗口存在，但低云偏多、降水干扰不支持拍摄");
    expect(dailySection).not.toContain("银河天文窗口 2026年5月");
    expect(windowSection).toContain('data-subject="stars"');
    expect(windowSection).toContain('data-subject="milkyWay"');
    expect(windowSection).toContain("推荐窗口：</span>暂无高确定性窗口");
    expect(windowSection).toContain("低云偏多、降水干扰");
    expect(windowSection).toContain("云量或月光影响较大，不建议专程夜拍。");
    expect(windowSection).toContain("天文窗口存在但天气不支持，仅作参考。");
    expect(windowSection).not.toContain("银河天文窗口");
    expect(windowSection).not.toContain("天文窗口存在，但低云偏多、降水干扰不支持拍摄");
    expect(html).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
  });

  it("shows separate deterministic sunrise and sunset glow facts on the general result page", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("朝霞机会 70 分");
    expect(html).toContain("晚霞机会 74 分");
    expect(html).toContain("色彩云条件好");
    expect(html).toContain("低云遮挡风险低");
    expect(html).toContain("主要可观察窗口");
    expect(html).toContain("高确定性拍摄窗口");
  });

  it("omits the old subject breakdown grid from the general dashboard", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).not.toContain('data-testid="subject-breakdown"');
    expect(html).not.toContain("题材拆解");
    expect(html).toContain('data-testid="opportunity-windows"');
  });

  it("keeps rain-heavy daily cards compact", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      dailySummaries: base.dailySummaries.map((summary, index) =>
        index === 0
          ? {
              ...summary,
              weather: {
                ...summary.weather!,
                weatherTextZh: "小雨转阴",
                precipitationProbability: 72,
                precipitationAmountMm: 6.8,
                rainAmountMm: 6.8,
                precipitationType: "rain" as const,
                precipitationRisk: {
                  precipitationProbabilityPercent: 72,
                  precipitationAmountMm: 6.8,
                  rainRiskLevel: "high",
                  rainRiskLabelZh: "高",
                  affectedWindows: ["夜间", "上午"],
                  recommendationZh: "降水干扰明显，清晨窗口需要等待雨后短暂开口。",
                },
                mainPrecipitationPeriodLabelZh: "主要降水：夜间、上午",
              },
            }
          : summary,
      ),
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(dailySection).toContain("小雨转阴");
    expect(dailySection).toContain("降雨概率：72%");
    expect(dailySection).toContain("降水干扰明显，优先等待雨后短暂开口。");
    expect(dailySection).not.toContain("降水主要影响日出窗口，朝霞不确定性较高");
    expect(dailySection).not.toContain("雨后若短暂开口，可转拍云雾层次和远山");
  });

  it("labels general daily precipitation probability by rain, snow, unknown, and missing probability state", () => {
    const base = resultForTarget("general");
    const template = base.dailySummaries[0]!;
    const result: ForecastCalculationResult = {
      ...base,
      dailySummaries: [
        {
          ...template,
          date: "2026-05-20",
          dateLabelZh: "2026年5月20日 星期三",
          weather: {
            ...template.weather!,
            weatherTextZh: "小雨",
            precipitationProbability: 20,
            precipitation: 0.6,
            precipitationAmountMm: 0.6,
            rainAmountMm: 0.6,
            snowAmountMm: 0,
            precipitationType: "rain" as const,
            windSpeed: 2.8,
            photographyTransparencyScore: 52,
          },
        },
        {
          ...template,
          date: "2026-05-21",
          dateLabelZh: "2026年5月21日 星期四",
          weather: {
            ...template.weather!,
            weatherTextZh: "阴天",
            tempMin: -5,
            tempMax: -1,
            precipitationProbability: 35,
            precipitation: 1.2,
            precipitationAmountMm: 1.2,
            rainAmountMm: 0,
            snowAmountMm: 0,
            precipitationType: "unknown" as const,
            windSpeed: 3.1,
            photographyTransparencyScore: 42,
          },
        },
        {
          ...template,
          date: "2026-05-22",
          dateLabelZh: "2026年5月22日 星期五",
          weather: {
            ...template.weather!,
            weatherTextZh: "阴天",
            precipitationProbability: 20,
            precipitation: 0.4,
            precipitationAmountMm: 0.4,
            precipitationType: "unknown" as const,
            windSpeed: 2.4,
            photographyTransparencyScore: 55,
          },
        },
        {
          ...template,
          date: "2026-05-23",
          dateLabelZh: "2026年5月23日 星期六",
          weather: {
            ...template.weather!,
            weatherTextZh: "阵雨",
            precipitationProbability: null,
            precipitation: 0.8,
            precipitationAmountMm: 0.8,
            rainAmountMm: 0.8,
            snowAmountMm: 0,
            precipitationType: "rain" as const,
            precipitationRisk: {
              precipitationProbabilityPercent: null,
              precipitationAmountMm: 0.8,
              rainRiskLevel: "low",
              rainRiskLabelZh: "低",
              affectedWindows: ["下午"],
              recommendationZh: "有少量降水信号，出发前复核短临预报。",
            },
            windSpeed: 2,
            photographyTransparencyScore: 51,
          },
        },
        {
          ...template,
          date: "2026-05-24",
          dateLabelZh: "2026年5月24日 星期日",
          weather: {
            ...template.weather!,
            weatherTextZh: "多云",
            precipitationProbability: null,
            precipitation: 0,
            precipitationAmountMm: 0,
            rainAmountMm: 0,
            snowAmountMm: 0,
            precipitationType: "none" as const,
            precipitationRisk: {
              precipitationProbabilityPercent: null,
              precipitationAmountMm: 0,
              rainRiskLevel: "none",
              rainRiskLabelZh: "无明显",
              affectedWindows: [],
              recommendationZh: "降水不明显。",
            },
            windSpeed: 1.7,
            photographyTransparencyScore: 56,
          },
        },
      ],
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(dailySection).toContain("降雨概率：20%｜风：2.8m/s｜通透：一般");
    expect(dailySection).toContain("降雪概率：35%｜风：3.1m/s｜通透：较差");
    expect(dailySection).toContain("降水概率：20%｜风：2.4m/s｜通透：一般");
    expect(dailySection).toContain("降水风险：低，预计 0.8mm｜风：2m/s｜通透：一般");
    expect(dailySection).toContain("降水不明显｜风：1.7m/s｜通透：一般");
    expect(dailySection).not.toContain("降水概率：0%");
    expect(dailySection).not.toContain("降雨概率：0%");
    expect(dailySection).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
  });

  it("avoids impossible zero-probability precipitation copy when amount is present", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      currentWeather: {
        ...base.currentWeather!,
        precipitationProbability: 0,
        precipitation: 9.9,
        precipitationAmountMm: 9.9,
        rainAmountMm: 9.9,
        precipitationRisk: {
          precipitationProbabilityPercent: 0,
          precipitationAmountMm: 9.9,
          rainRiskLevel: "medium",
          rainRiskLabelZh: "中",
          affectedWindows: ["清晨窗口"],
          recommendationZh: "小雨转小雨，拍摄窗口可能被打断。",
        },
      },
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("中，预计 9.9 mm");
    expect(html).toContain("小雨转小雨，拍摄窗口可能被打断");
    expect(html).not.toContain("降水概率 0%");
    expect(html).not.toContain("概率 0%，预计 9.9 mm");
  });

  it("shows professional arrival advice on general result cards and daily cards", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      bestWindows: base.bestWindows.map((window, index) =>
        index === 0
          ? {
              ...window,
              score: 74,
              conditionScore: 82,
              practicalScore: 74,
              recommendationLevel: "recommended" as const,
              windowLevel: "best" as const,
              executableForDedicatedTrip: true,
              suitableIfNearby: true,
              practicalKind: "shooting_window" as const,
              lightPhase: "sunrise" as const,
              practicalNoteZh: "适合守清晨云海，云雾变化与可用光线重叠。",
              subjectPriorityLabel: "清晨云海",
              backupSubjectLabel: "朝霞、通透层峦或雾景",
              restWarningZh: "时间偏早，建议前一晚到达附近或住山上。",
              arrivalAdvice: {
                recommendedArrivalTime: "2026-05-20T03:30:00+08:00",
                recommendedArrivalLabel: "03:30 前到达",
                setupBufferMinutes: 90,
                reasonZh: "预留上山、找机位和观察云雾变化时间。",
                warningZh: "时间偏早，建议前一晚到达附近或住山上。",
              },
            }
          : window,
      ),
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("建议到达：2026年5月20日 周三 03:30 前");
    expect(html).toContain("预留上山、找机位和观察云雾变化时间");
    expect(html).toContain("时间偏早，建议前一晚到达附近或住山上");
    expect(html).not.toContain("建议到达：03:30 前到达");
    expect(html).toContain("备选方案");
  });

  it("labels no-light cloud sea as a formation signal instead of the top shootable window", () => {
    const base = resultForTarget("general");
    const shootableWindow = {
      ...base.bestWindows[0]!,
      label: "清晨云海窗口 04:08 - 06:08",
      startTime: "2026-05-20T04:08:00+08:00",
      endTime: "2026-05-20T06:08:00+08:00",
      score: 72,
      conditionScore: 68,
      practicalScore: 72,
      recommendationLevel: "recommended" as const,
      windowLevel: "best" as const,
      executableForDedicatedTrip: true,
      suitableIfNearby: true,
      practicalKind: "shooting_window" as const,
      lightPhase: "sunrise" as const,
      practicalNoteZh: "适合守清晨云海，云雾变化与可用光线重叠。",
      subjectPriorityLabel: "清晨云海",
      backupSubjectLabel: "朝霞、通透层峦或雾景",
      arrivalAdvice: {
        recommendedArrivalTime: "2026-05-20T02:38:00+08:00",
        recommendedArrivalLabel: "02:38 前到达",
        setupBufferMinutes: 90,
        reasonZh: "预留上山、找机位和观察云雾变化时间。",
        warningZh: "时间成本较高，仅建议住在景区附近或已在山上时考虑。",
      },
    };
    const formationSignal = {
      ...base.bestWindows[0]!,
      label: "云雾变化信号 01:00 - 03:00",
      startTime: "2026-05-20T01:00:00+08:00",
      endTime: "2026-05-20T03:00:00+08:00",
      score: 31,
      conditionScore: 92,
      practicalScore: 31,
      practicalKind: "formation_signal" as const,
      lightPhase: "deep_night" as const,
      practicalNoteZh: "低云和雾气变化信号，不建议为无光窗口单独熬夜。",
      subjectPriorityLabel: "云雾变化",
      backupSubjectLabel: "朝霞、通透层峦或雾景",
      arrivalAdvice: {
        recommendedArrivalTime: "2026-05-20T01:00:00+08:00",
        recommendedArrivalLabel: "若已在山上可观察",
        setupBufferMinutes: 0,
        reasonZh: "这是低云和雾气变化信号，不是有光拍摄窗口。",
        warningZh: "不建议为无光窗口单独熬夜；若从山下出发，需评估交通和体力成本。",
      },
    };
    const result: ForecastCalculationResult = {
      ...base,
      bestWindows: [shootableWindow, formationSignal, ...base.bestWindows.slice(1)],
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const summarySection = sectionBetween(
      html,
      'data-testid="opportunity-windows"',
      'data-testid="risk-section"',
    );

    expect(summarySection).toContain('data-subject="cloudSea"');
    expect(summarySection).toContain(">云海<");
    expect(summarySection).toContain("推荐窗口：</span>2026年5月20日 周三 04:08-06:08");
    expect(summarySection).toContain("备选窗口：</span>2026年5月21日 周四 05:10-07:10");
    expect(summarySection).not.toContain("云雾变化");
    expect(summarySection).not.toContain("2026年5月20日 01:00–03:00");
    expect(summarySection).not.toContain("形成信号");
    expect(summarySection).not.toContain("无光形成信号");
  });

  it("renders an evening glow window as sunset copy even if the raw label says sunrise glow", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      bestWindows: [
        {
          ...base.bestWindows[0]!,
          label: "朝霞窗口 19:01 - 19:28",
          date: "2026-05-20",
          startTime: "2026-05-20T19:01:00+08:00",
          endTime: "2026-05-20T19:28:00+08:00",
          score: 76,
          conditionScore: 80,
          practicalScore: 76,
          target: "glow",
          practicalKind: "shooting_window",
          lightPhase: "sunset",
          recommendationLevel: "recommended",
          windowLevel: "best",
          executableForDedicatedTrip: true,
          suitableIfNearby: true,
          subjectPriorityLabel: "日落暖光",
          copyReasonZh: "日落暖光窗口可执行，需提前观察西向云层开口和通透度。",
        },
      ],
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const summarySection = sectionBetween(
      html,
      'data-testid="opportunity-windows"',
      'data-testid="risk-section"',
    );

    expect(viewModel.bestWindows[0]?.moduleKey).toBe("sunsetGlow");
    expect(viewModel.bestWindows[0]?.label).toBe("日落暖光");
    expect(summarySection).toContain('data-subject="sunsetGlow"');
    expect(summarySection).toContain(">晚霞<");
    expect(summarySection).toContain("推荐窗口：</span>2026年5月20日 周三 19:01-19:28");
    expect(summarySection).not.toContain("日落暖光");
    expect(html).not.toContain("朝霞窗口 19:01");
  });

  it("does not promote a watchable-only signal into the primary best shooting window", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      overallScore: 48,
      recommendationLabel: "谨慎参考",
      bestWindows: [
        {
          ...base.bestWindows[0]!,
          label: "云雾变化信号 01:00 - 03:00",
          date: "2026-05-20",
          startTime: "2026-05-20T01:00:00+08:00",
          endTime: "2026-05-20T03:00:00+08:00",
          score: 38,
          conditionScore: 82,
          practicalScore: 38,
          practicalKind: "formation_signal",
          lightPhase: "deep_night",
          recommendationLevel: "backup",
          windowLevel: "watchable",
          executableForDedicatedTrip: false,
          suitableIfNearby: true,
          subjectPriorityLabel: "云雾变化",
          copyReasonZh: "夜间云海只算形成信号，适合已在山上观察，不作为最佳可拍窗口。",
        },
      ],
      dailySummaries: base.dailySummaries.map((summary, index) =>
        index === 0
          ? {
              ...summary,
              bestShootableWindow: undefined,
              keyWindows: [],
              watchableWindows: [
                {
                  subject: "云雾变化",
                  target: "cloud_sea",
                  startTime: "2026-05-20T01:00:00+08:00",
                  endTime: "2026-05-20T03:00:00+08:00",
                  windowLevel: "watchable",
                  recommendationLevel: "backup",
                  reasonZh: "夜间云海只算形成信号，适合已在山上观察。",
                  suitableForDedicatedTrip: false,
                  suitableIfNearby: true,
                },
              ],
            }
          : summary,
      ),
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const bestWindowCard = viewModel.primaryCards.find((card) => card.key === "bestWindow");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(bestWindowCard?.value).toBe("暂无高确定性拍摄窗口");
    expect(html).toContain("可观察");
    expect(html).toContain("暂无高确定性拍摄窗口");
  });

  it("does not render contradictory zero precipitation probability with large rain amount", () => {
    const result: ForecastCalculationResult = {
      ...resultForTarget("general"),
      currentWeather: {
        ...baseResult.currentWeather!,
        precipitationProbability: 0,
        precipitation: 32.2,
        precipitationAmountMm: 32.2,
        rainAmountMm: 32.2,
        precipitationType: "rain",
        weatherTextZh: "阵雨",
      },
      dailySummaries: baseResult.dailySummaries.map((summary, index) =>
        index === 0
          ? {
              ...summary,
              weather: {
                ...summary.weather!,
                weatherTextZh: "阵雨",
                precipitationProbability: null,
                precipitation: 32.2,
                precipitationAmountMm: 32.2,
                rainAmountMm: 32.2,
                precipitationType: "rain" as const,
              },
            }
          : summary,
      ),
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("预计 32.2 mm");
    expect(html).toContain("降水风险");
    expect(html).not.toContain("降水概率 0%");
    expect(html).not.toContain("0%｜预计 32.2 mm");
  });

  it("deduplicates general result copy and fixes evening glow labels", () => {
    const base = resultForTarget("general");
    const result: ForecastCalculationResult = {
      ...base,
      bestWindows: [
        {
          ...base.bestWindows[2]!,
          label: "朝霞峰值窗口 19:01 - 19:28",
          startTime: "2026-05-20T19:01:00+08:00",
          endTime: "2026-05-20T19:28:00+08:00",
          subjectPriorityLabel: "朝霞",
          lightPhase: "blue_hour",
          target: "glow",
          recommendationLevel: "recommended",
          windowLevel: "best",
          practicalScore: 76,
          conditionScore: 80,
          executableForDedicatedTrip: true,
        },
        ...base.bestWindows,
      ],
      dailySummaries: base.dailySummaries.map((summary, index) =>
        index === 0
          ? {
              ...summary,
              bestShootableWindow: {
                ...base.bestWindows[2]!,
                label: "朝霞峰值窗口 19:01 - 19:28",
                startTime: "2026-05-20T19:01:00+08:00",
                endTime: "2026-05-20T19:28:00+08:00",
                subjectPriorityLabel: "朝霞",
                lightPhase: "blue_hour",
                target: "glow",
              },
              weather: {
                ...summary.weather!,
                precipitationProbability: 78,
                precipitationAmountMm: 18.8,
                rainAmountMm: 18.8,
                precipitationType: "rain" as const,
                precipitationRisk: {
                  precipitationProbabilityPercent: 78,
                  precipitationAmountMm: 18.8,
                  rainRiskLevel: "high",
                  rainRiskLabelZh: "高",
                  affectedWindows: ["夜间", "上午"],
                  recommendationZh: "降水干扰明显，清晨窗口需要等待雨后短暂开口。",
                },
                mainPrecipitationPeriodLabelZh: "主要降水：夜间、上午",
              },
            }
          : summary,
      ),
    };
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(html).toContain("降水风险");
    expect(dailySection).toContain("降雨概率：78%");
    expect(dailySection).toContain("日落后余晖");
    expect(dailySection).toContain("降水干扰明显，优先等待雨后短暂开口。");
    expect(html).not.toContain("降水风险：降水风险");
    expect(html).not.toContain("主要降水：主要降水");
    expect(html).not.toContain("建议：建议");
    expect(html).not.toContain("夜间、上午");
    expect(html).not.toContain("朝霞 2026年5月20日 19:01");
  });

  it("shows a conservative historical calibration hint on the general result when enough samples exist", () => {
    const result: ForecastCalculationResult = {
      ...resultForTarget("general"),
      calibrationHint: {
        spotId: "spot-test",
        locationKey: "spot:spot-test",
        target: "general",
        sampleCount: 18,
        labeledCount: 18,
        hitRate: 0.72,
        falsePositiveRate: 0.28,
        falseNegativeRate: 0.08,
        confidenceAdjustment: "slight_down",
        cautionNoteZh: "该机位历史回放存在偏乐观情况，本次建议谨慎参考。",
        displayNoteZh: "历史校准：该机位历史回放存在偏乐观情况，本次建议谨慎参考。",
      },
    };

    const viewModel = buildForecastResultViewModel(result, "general");
    const calibrationCard = viewModel.primaryCards.find(
      (card) => card.key === "historical-calibration",
    );

    expect(calibrationCard?.value).toBe("谨慎参考");
    expect(calibrationCard?.detail).toContain("历史校准");
    expect(calibrationCard?.tone).toBe("accent");
  });

  it("keeps deterministic forecast content visible when optional intelligent interpretation fails", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "error",
        aiExplanation: null,
        aiErrorMessage: "智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。",
        aiRetryable: true,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。");
    expect(html).toContain("重试智能解读");
    expect(html).toContain("综合出片指数");
    expect(html).toContain("逐日拍摄判断");
    expect(html).toContain("出行建议");
    expect(html).not.toContain("分析失败");
  });

  it("disables the intelligent interpretation trigger while a request is loading", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "loading",
        aiExplanation: null,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("正在生成智能解读...");
    expect(html).toContain("disabled");
    expect(html).toContain("综合出片指数");
  });

  it("does not render deterministic fallback from the forecast result before AI is clicked", () => {
    const fallback = aiExplanationForTest(
      "基于确定性计算结果生成的简版解读在页面加载后立即可见。",
      "deterministic_fallback",
    );
    const result = {
      ...resultForTarget("general"),
      aiExplanation: fallback,
    } as ForecastCalculationResult & { aiExplanation: ReturnType<typeof aiExplanationForTest> };
    const viewModel = buildForecastResultViewModel(result, "general");
    const onGenerateAiExplanation = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "idle",
        aiExplanation: fallback,
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation,
      }),
    );

    expect(html).toContain("智能解读");
    expect(html).toContain("可手动生成更自然的摄影建议，当前判断结果不依赖 AI。");
    expect(html).toContain("生成智能解读");
    expect(html).not.toContain("确定性简版");
    expect(html).not.toContain("基于确定性计算结果生成的简版解读");
    expect(html).not.toContain("基于确定性计算结果生成的简版解读在页面加载后立即可见。");
    expect(html).not.toContain("一句话结论");
    expect(html).not.toContain("最建议关注");
    expect(onGenerateAiExplanation).not.toHaveBeenCalled();
    expect(html).not.toContain("智能解读暂时不可用");
  });

  it("calls the manual intelligent interpretation handler only from the generate button", () => {
    const onGenerate = vi.fn();
    const element = AiExplanationPanel({
      status: "idle",
      explanation: null,
      errorMessage: "",
      retryable: false,
      onGenerate,
    });
    const onClick = firstOnClickHandler(element);

    expect(onGenerate).not.toHaveBeenCalled();
    expect(onClick).not.toBeNull();

    onClick?.();

    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("clears loading and renders a success=true interpretation response", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const explanation = aiExplanationForTest("DeepSeek 成功返回后应立即展示这条结论。");
    const outcome = normalizeAiExplainResponse({
      success: true,
      interpretation: explanation,
      retryable: false,
      model: "deepseek-v4-pro",
      promptSizeChars: 11712,
      latencyMs: 69883,
      diagnostics: {
        parseSuccess: true,
        timeoutMs: 120000,
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: outcome.status,
        aiExplanation: outcome.explanation,
        aiErrorMessage: outcome.errorMessage,
        aiRetryable: outcome.retryable,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(outcome.status).toBe("ready");
    expect(outcome.errorMessage).toBe("");
    expect(outcome.cacheable).toBe(true);
    expect(html).toContain("DeepSeek 成功返回后应立即展示这条结论。");
    expect(html).not.toContain("正在生成解读");
    expect(html).toContain("已生成智能解读");
    expect(html).toContain("disabled");
  });

  it("renders ok=true strict_json explanation content with simple frontend fields", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const outcome = normalizeAiExplainResponse({
      ok: true,
      explanation: {
        conclusion: "清晨窗口可作为主计划，专程出发前仍需复核短临低云。",
        summaryText: "严格 JSON 摘要也应直接展示。",
        reasons: ["低云、湿度和地形信号集中在清晨。"],
        suggestions: ["按主窗口提前到位，失败时转拍远山层次。"],
        risks: ["短临降水和白墙仍需现场复核。"],
      },
      meta: {
        providerCode: "deepseek",
        model: "deepseek-v4-pro",
        parseSuccess: true,
        parseStrategy: "strict_json",
        fallbackUsed: false,
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: outcome.status,
        aiExplanation: outcome.explanation,
        aiErrorMessage: outcome.errorMessage,
        aiRetryable: outcome.retryable,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(outcome.status).toBe("ready");
    expect(outcome.errorMessage).toBe("");
    expect(outcome.model).toBe("deepseek-v4-pro");
    expect(outcome.explanation?.conclusion.oneSentenceDecisionZh).toContain("清晨窗口");
    expect(html).toContain("清晨窗口可作为主计划");
    expect(html).toContain("低云、湿度和地形信号集中在清晨");
    expect(html).not.toContain("智能解读暂时不可用");
  });

  it("renders ok=true summaryText-only responses without unavailable state", () => {
    const outcome = normalizeAiExplainResponse({
      ok: true,
      summaryText: "只有 summaryText 时也必须展示智能解读内容。",
      meta: {
        providerCode: "deepseek",
        model: "deepseek-v4-pro",
        parseSuccess: true,
        parseStrategy: "strict_json",
        fallbackUsed: false,
      },
    });

    expect(outcome.status).toBe("ready");
    expect(outcome.errorMessage).toBe("");
    expect(outcome.explanation?.conclusion.summaryZh).toContain("只有 summaryText");
    expect(outcome.explanation?.metadata?.source).toBe("deepseek");
  });

  it("normalizes displayable AI explanation fields without requiring the legacy full shape", () => {
    const content = normalizeAiExplanationContent({
      success: true,
      explanation: {
        title: "AI 判断",
        conclusion: "结构化结论应被识别。",
        summaryText: "结构化摘要应被识别。",
        reasons: ["结构化原因"],
        suggestions: ["结构化建议"],
        risks: ["结构化风险"],
      },
      result: {
        explanation: {
          text: "result.explanation 也应被识别。",
        },
      },
      model: "deepseek-v4-pro",
      parseSuccess: true,
    });

    expect(content).toMatchObject({
      hasContent: true,
      title: "AI 判断",
      conclusion: "结构化结论应被识别。",
      summaryText: "结构化摘要应被识别。",
      reasons: ["结构化原因"],
      suggestions: ["结构化建议"],
      risks: ["结构化风险"],
    });
    expect(content.sections.map((section) => section.text)).toContain(
      "result.explanation 也应被识别。",
    );
  });

  it("renders success=true explanation.summaryText responses without unavailable state", () => {
    const outcome = normalizeAiExplainResponse({
      success: true,
      explanation: {
        summaryText: "explanation.summaryText 应直接展示。",
      },
      parseSuccess: true,
      model: "deepseek-v4-pro",
    });
    const html = renderAiPanelFromOutcome(outcome);

    expect(outcome.status).toBe("ready");
    expect(html).toContain("explanation.summaryText 应直接展示。");
    expect(html).not.toContain("智能解读暂时不可用");
  });

  it("renders success=true content and text fallback responses", () => {
    const contentOutcome = normalizeAiExplainResponse({
      success: true,
      content: "content 字段应作为智能解读展示。",
      parseSuccess: true,
    });
    const textOutcome = normalizeAiExplainResponse({
      ok: true,
      text: "text 字段应作为智能解读展示。",
      parseSuccess: true,
    });

    expect(renderAiPanelFromOutcome(contentOutcome)).toContain("content 字段应作为智能解读展示。");
    expect(renderAiPanelFromOutcome(textOutcome)).toContain("text 字段应作为智能解读展示。");
    expect(contentOutcome.status).toBe("ready");
    expect(textOutcome.status).toBe("ready");
  });

  it("renders success=true result.explanation responses without unavailable state", () => {
    const outcome = normalizeAiExplainResponse({
      success: true,
      result: {
        explanation: {
          conclusion: "result.explanation 结论应直接展示。",
          reasons: ["result.explanation 原因应展示。"],
          suggestions: ["result.explanation 建议应展示。"],
          risks: ["result.explanation 风险应展示。"],
        },
      },
      parseSuccess: true,
      model: "deepseek-v4-pro",
    });
    const html = renderAiPanelFromOutcome(outcome);

    expect(outcome.status).toBe("ready");
    expect(html).toContain("result.explanation 结论应直接展示。");
    expect(html).toContain("判断依据");
    expect(html).toContain("result.explanation 原因应展示。");
    expect(html).toContain("行动建议");
    expect(html).toContain("result.explanation 建议应展示。");
    expect(html).toContain("风险与复核");
    expect(html).toContain("result.explanation 风险应展示。");
    expect(html).not.toContain("智能解读暂时不可用");
  });

  it("keeps the frontend timeout longer than the configurable DeepSeek backend timeout", () => {
    expect(deepSeekBackendTimeoutMaxMs).toBe(120000);
    expect(aiExplainFrontendTimeoutMs).toBeGreaterThanOrEqual(120000);
    expect(aiExplainFrontendTimeoutMs).toBeGreaterThanOrEqual(deepSeekBackendTimeoutMaxMs);
  });

  it("renders a compact error when DeepSeek fails and does not show deterministic fallback sections", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const fallback = aiExplanationForTest(
      "确定性简版解读在 DeepSeek 超时后仍然可见。",
      "deterministic_fallback",
    );
    const outcome = normalizeAiExplainResponse({
      success: false,
      fallback: true,
      explanation: fallback,
      errorCategory: "timeout",
      retryable: true,
      diagnostics: {
        parseSuccess: false,
        errorCategory: "timeout",
        timeoutMs: 120000,
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: outcome.status,
        aiExplanation: outcome.explanation,
        aiErrorMessage: outcome.errorMessage,
        aiRetryable: outcome.retryable,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(outcome.status).toBe("error");
    expect(outcome.explanation).toBeNull();
    expect(outcome.retryable).toBe(true);
    expect(outcome.cacheable).toBe(false);
    expect(html).toContain("智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。");
    expect(html).toContain("重试智能解读");
    expect(html).not.toContain("确定性简版解读在 DeepSeek 超时后仍然可见。");
    expect(html).not.toContain("确定性简版");
    expect(html).not.toContain("基于确定性计算结果生成的简版解读");
    expect(html).not.toContain("一句话结论");
    expect(html).not.toContain("最建议关注");
    expect(html).not.toContain("天气大势");
    expect(html).not.toContain("逐日建议");
    expect(html).not.toContain("题材判断");
    expect(html).not.toContain("风险与装备");
    expect(html).not.toContain("最终建议");
    expect(html).toContain("综合出片指数");
  });

  it("ignores fallback when a success response has invalid interpretation data", () => {
    const fallback = aiExplanationForTest(
      "DeepSeek 返回无效结构时继续显示确定性简版解读。",
      "deterministic_fallback",
    );
    const outcome = normalizeAiExplainResponse(
      {
        success: true,
        source: "deepseek",
        interpretation: {},
        model: "deepseek-v4-pro",
        parseSuccess: true,
      },
      fallback,
    );

    expect(outcome.status).toBe("error");
    expect(outcome.success).toBe(false);
    expect(outcome.cacheable).toBe(false);
    expect(outcome.errorCategory).toBe("frontend_contract_error");
    expect(outcome.backendErrorCategory).toBe("none");
    expect(outcome.explanation).toBeNull();
    expect(outcome.errorMessage).toBe(
      "智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。",
    );
  });

  it("honors backend retryable false for DeepSeek provider HTTP failures", () => {
    const outcome = normalizeAiExplainResponse({
      success: false,
      errorCategory: "provider_http_error",
      retryable: false,
      messageZh: "DeepSeek API Key invalid.",
      diagnostics: {
        parseSuccess: false,
        errorCategory: "provider_http_error",
      },
    });

    expect(outcome.status).toBe("error");
    expect(outcome.retryable).toBe(false);
    expect(outcome.errorCategory).toBe("provider_http_error");
    expect(outcome.errorMessage).not.toContain("API Key");
  });

  it("shows retry without hiding deterministic forecast content when no fallback is available", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const outcome = normalizeAiExplainResponse({
      success: false,
      errorCategory: "network_error",
      retryable: true,
      diagnostics: {
        parseSuccess: false,
        errorCategory: "network_error",
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: outcome.status,
        aiExplanation: outcome.explanation,
        aiErrorMessage: outcome.errorMessage,
        aiRetryable: outcome.retryable,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(outcome.status).toBe("error");
    expect(outcome.retryable).toBe(true);
    expect(html).toContain("重试智能解读");
    expect(html).toContain("智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。");
    expect(html).toContain("综合出片指数");
  });

  it("maps success=true sections responses into a renderable interpretation", () => {
    const outcome = normalizeAiExplainResponse({
      success: true,
      sections: {
        conclusion: {
          titleZh: "一句话结论",
          contentZh: "sections 字段也应被映射为可展示解读。",
        },
        weather: {
          titleZh: "天气趋势",
          contentZh: "云量偏多，等待短时开口。",
        },
      },
      diagnostics: {
        parseSuccess: true,
      },
    });

    expect(outcome.status).toBe("ready");
    expect(outcome.explanation?.conclusion.oneSentenceDecisionZh).toContain(
      "sections 字段也应被映射为可展示解读。",
    );
  });

  it("renders successful plain-text fallback without unavailable state", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const outcome = normalizeAiExplainResponse({
      ok: true,
      success: true,
      interpretation:
        "\u7ed3\u8bba\uff1a\u6e05\u6668\u7a97\u53e3\u53ef\u4f5c\u4e3a\u4e3b\u8ba1\u5212\uff0c\u4f46\u4e0d\u8981\u53ea\u4e3a\u5355\u4e00\u4fe1\u53f7\u4e13\u7a0b\u3002",
      parseSuccess: false,
      parseStrategy: "plain_text_fallback",
      diagnostics: {
        parseSuccess: false,
        parseStrategy: "plain_text_fallback",
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: outcome.status,
        aiExplanation: outcome.explanation,
        aiErrorMessage: outcome.errorMessage,
        aiRetryable: outcome.retryable,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(outcome.status).toBe("ready");
    expect(outcome.success).toBe(true);
    expect(outcome.parseSuccess).toBe(false);
    expect(outcome.errorMessage).toBe("");
    expect(outcome.explanation?.conclusion.summaryZh).toContain("\u6e05\u6668\u7a97\u53e3");
    expect(html).toContain("\u6e05\u6668\u7a97\u53e3");
    expect(html).not.toContain("鏅鸿兘瑙ｈ鏆傛椂涓嶅彲鐢?");
  });

  it("caches successful interpretation by stable forecast result key", () => {
    const query = queryForTarget("general");
    const result = resultForTarget("general");
    const cacheKey = createAiExplanationCacheKey({ query, result });
    const explanation = aiExplanationForTest("缓存命中的解读不需要重复请求 DeepSeek。");

    cacheAiExplanation(cacheKey, explanation);

    expect(readCachedAiExplanation(cacheKey)?.conclusion.oneSentenceDecisionZh).toBe(
      "缓存命中的解读不需要重复请求 DeepSeek。",
    );
  });

  it("prevents duplicate DeepSeek clicks while a request is running", () => {
    expect(shouldStartAiExplanationRequest("loading", false)).toBe(false);
    expect(shouldStartAiExplanationRequest("idle", true)).toBe(false);
    expect(shouldStartAiExplanationRequest("idle", false)).toBe(true);
  });

  it("renders structured intelligent interpretation sections after a successful AI response", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "ready",
        aiExplanation: {
          conclusion: {
            titleZh: "黄山光明顶摄影天气决策",
            summaryZh: "未来48小时云量偏多，清晨窗口更值得关注。",
            recommendedDayZh: "最建议关注 2026年5月20日清晨。",
            recommendationLevelZh: "值得等待",
            whetherWorthDedicatedTripZh: "谨慎参考",
            oneSentenceDecisionZh: "可观察，但不建议只押单一题材专程出发。",
          },
          bestPlan: {
            primaryTargetZh: "清晨云海",
            bestDateZh: "2026年5月20日",
            bestWindowZh: "2026年5月20日 05:00–07:00",
            recommendedArrivalZh: "建议到达：2026年5月20日 04:20 前",
            whyThisWindowZh: "清晨低云和湿度组合较好。",
            backupPlanZh: "2026年5月20日 17:56–19:41 晚霞备选。",
          },
          weatherTrend: {
            trendSummaryZh: "整体云量偏多，等待云层开口。",
            temperatureSummaryZh: "山顶估算温度约 10-18°C。",
            rainSummaryZh: "降水风险低。",
            windSummaryZh: "风力可控。",
            transparencySummaryZh: "通透度一般，远山层次需复核。",
          },
          dayByDay: [
            {
              dateZh: "2026年5月20日 星期三",
              recommendationZh: "清晨可观察。",
              scoreZh: "综合 78 分",
              temperatureZh: "10-18°C",
              rainZh: "降水风险低",
              cloudSeaZh: "云海机会 82 分",
              glowZh: "朝霞可关注",
              sunsetGlowZh: "晚霞备选",
              astroZh: "天气需复核",
              transparencyZh: "通透度 72 分",
              bestWindowZh: "2026年5月20日 05:00–07:00",
              actionZh: "提前到位观察低云上沿。",
            },
          ],
          subjectAdvice: {
            cloudSeaZh: "云海机会较好，白墙风险需复核。",
            sunriseGlowZh: "日出和朝霞有机会。",
            sunsetGlowZh: "日落后余晖仅作备选。",
            astroMilkyWayZh: "有天文窗口不代表能拍银河，需复核云量。",
            transparencyZh: "通透度一般。",
          },
          riskAndGear: {
            keyRisks: ["演示数据需要复核"],
            clothingZh: "清晨偏凉，带防风外套。",
            gearZh: "三脚架、防潮袋、备用电池。",
            safetyZh: "保留撤离时间。",
          },
          finalAdvice: {
            goNoGoZh: "谨慎参考。",
            ifAlreadyNearbyZh: "已在附近可观察。",
            ifDedicatedTripZh: "不建议只为单一窗口专程。",
            nextCheckZh: "复核短临降水、低云和阵风。",
          },
          metadata: {
            source: "deepseek",
          },
        },
        aiErrorMessage: "",
        aiRetryable: false,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("一句话结论");
    expect(html).toContain("最建议关注");
    expect(html).toContain("天气大势");
    expect(html).toContain("逐日建议");
    expect(html).toContain("题材判断");
    expect(html).toContain("风险与装备");
    expect(html).toContain("最终建议");
    expect(html).not.toContain("确定性简版");
    expect(html).toContain("2026年5月20日 05:00–07:00");
  });

  it("shows meteoblue source diagnostics with exact category and safe message", () => {
    const result = {
      ...resultForTarget("general"),
      weatherSourceSummaries: [
        {
          providerCode: "meteoblue",
          providerLabelZh: "meteoblue",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: false,
          status: "failed",
          availableFields: [],
          missingFields: ["weather"],
          statusCode: 401,
          errorCategory: "invalid_key",
          messageZh: "meteoblue API Key 无效、权限不足或当前数据包未授权。",
        },
      ],
    } satisfies ForecastCalculationResult;

    expect(providerDiagnosticText(result, "meteoblue", "meteoblue")).toBe(
      "失败（invalid_key）：meteoblue API Key 无效、权限不足或当前数据包未授权。",
    );
  });

  it("shows meteoblue as passed when fusion source summary succeeds", () => {
    const result = {
      ...resultForTarget("general"),
      weatherSourceSummaries: [
        {
          providerCode: "meteoblue",
          providerLabelZh: "meteoblue",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: true,
          status: "available",
          availableFields: ["cloudTotal", "cloudLow", "cloudMid", "cloudHigh"],
          missingFields: [],
          statusCode: 200,
          latencyMs: 143,
          messageZh: "meteoblue 通过。",
        },
      ],
    } satisfies ForecastCalculationResult;

    expect(providerDiagnosticText(result, "meteoblue", "meteoblue")).toBe("meteoblue 通过");
  });

  it("shows meteoblue partial success without hiding the missing-field reason", () => {
    const result = {
      ...resultForTarget("general"),
      weatherSourceSummaries: [
        {
          providerCode: "meteoblue",
          providerLabelZh: "meteoblue",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: true,
          status: "available",
          availableFields: ["cloudTotal", "cloudLow"],
          missingFields: ["cloudMid", "cloudHigh"],
          statusCode: 200,
          latencyMs: 143,
          messageZh: "meteoblue 通过，部分字段缺失。",
        },
      ],
    } satisfies ForecastCalculationResult;

    expect(providerDiagnosticText(result, "meteoblue", "meteoblue")).toBe(
      "meteoblue 通过，部分字段缺失",
    );
  });

  it("renders meteoblue partial success as usable data with medium confidence", () => {
    const result = {
      ...resultForTarget("general"),
      weatherDataMode: "real" as const,
      weatherFusionSummary: {
        primarySource: "和风天气",
        auxiliarySources: ["Open-Meteo", "meteoblue"],
        professionalSourceStatus: "专业增强：meteoblue 通过，部分字段缺失",
        confidenceLevel: "medium",
        confidenceByTarget: {
          general: 0.61,
        },
        conflictStatusZh: "无明显冲突",
        dataStatusZh: "天气数据：和风天气；云层辅助：Open-Meteo；数据置信度：中",
        sourceSummaries: [],
        missingDataNotes: [],
      },
      weatherSourceSummaries: [
        {
          providerCode: "qweather",
          providerLabelZh: "和风天气",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: true,
          status: "available",
          availableFields: ["temperature", "humidity"],
          missingFields: [],
          messageZh: "和风天气 通过。",
        },
        {
          providerCode: "open_meteo",
          providerLabelZh: "Open-Meteo",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: true,
          status: "available",
          availableFields: ["cloudTotal", "cloudLow"],
          missingFields: [],
          messageZh: "Open-Meteo 通过。",
        },
        {
          providerCode: "meteoblue",
          providerLabelZh: "meteoblue",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: true,
          partial: true,
          status: "available",
          availableFields: ["cloudTotal", "cloudLow"],
          missingFields: ["dewPoint", "visibility"],
          statusCode: 200,
          messageZh: "meteoblue 通过，部分字段缺失。",
        },
      ],
    } satisfies ForecastCalculationResult;

    const html = renderToStaticMarkup(React.createElement(SourceDiagnosticsPanel, { result }));

    expect(html).toContain("专业增强");
    expect(html).toContain("专业增强可用，部分辅助字段缺失");
    expect(html).toContain("部分字段缺失不代表服务不可用");
    expect(html).toContain("置信度：中");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("和风天气");
    expect(html).not.toContain("数据置信度：低");
  });

  it("prioritizes cloud sea and whiteout risk without making astro primary", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("cloud_sea"), "cloud_sea");

    expect(viewModel.target).toBe("cloud_sea");
    expect(viewModel.cloudSea).toBeDefined();
    expect(viewModel.primaryCards.map((card) => card.label).slice(0, 4)).toEqual([
      "云海形成机会",
      "云海可拍机会",
      "白墙风险",
      "雨后开口机会",
    ]);
    expect(viewModel.primaryCards.map((card) => card.moduleKey)).not.toContain("stars");
    expect(viewModel.primaryCards.map((card) => card.moduleKey)).not.toContain("milkyWay");
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "cloudSea",
      "whiteoutRisk",
      "transparency",
    ]);
    expect(viewModel.bestWindows.length).toBeGreaterThan(1);
    expect(viewModel.bestWindows.every((window) => window.target === "cloud_sea")).toBe(true);
    expect(viewModel.windowGroups.length).toBeGreaterThan(1);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining(["地形与海拔参考", "山谷高差", "云海地形潜力", "白墙风险辅助判断"]),
    );
    expect(viewModel.hiddenModuleKeys).toEqual(
      expect.arrayContaining(["stars", "milkyWay", "astronomy"]),
    );
  });

  it("builds a specialized cloud sea view model with hero, metrics, window data, reasoning, and actions", () => {
    const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));

    expect(viewModel.coreCards.map((card) => card.label)).toEqual([
      "云海形成机会",
      "云海可拍机会",
      "白墙风险",
      "雨后开口机会",
    ]);
    expect(viewModel.coreCards.find((card) => card.label === "白墙风险")?.value).toBe(
      "中（58 分）",
    );
    expect(viewModel.hero.title).toBe("黄山光明顶 云海判断");
    expect(viewModel.hero.bestWindowLabel).toContain("05:00");
    expect(viewModel.hero.arrivalLabel).toContain("03:30");
    expect(viewModel.cloudSeaWindows.length).toBeGreaterThan(0);
    expect(viewModel.cloudSeaWindows[0]).toMatchObject({
      label: "云层变化参考窗口 05:00 - 07:00",
      startTime: "2026-05-20T05:00:00+08:00",
      endTime: "2026-05-20T07:00:00+08:00",
      cloudSeaChance: expect.any(String),
      whiteoutRisk: expect.any(String),
      rainInterference: expect.any(String),
      actionSuggestion: expect.any(String),
    });
    expect(viewModel.reasoningItems.map((item) => item.label)).toEqual([
      "评分与推荐",
      "湿度与露点差",
      "低云与能见度",
      "云量口径一致性",
      "风速与云雾稳定性",
      "降水与雨后开口",
      "数据一致性",
      "地形与高差",
      "白墙风险",
    ]);
    expect(viewModel.actionPlan.map((item) => item.label)).toEqual([
      "是否建议出发",
      "建议到达时间",
      "主守窗口",
      "备选方案",
      "装备提醒",
      "现场复核点",
    ]);
  });

  it("classifies Cloud Sea terrain semantics from elevation and surrounding relief", () => {
    const lowland = buildCloudSeaTerrainContext({
      elevationMeters: 142,
      surroundingReliefMeters: null,
      terrainType: "unknown",
      terrainConfidence: "low",
    });
    const highMountain = buildCloudSeaTerrainContext({
      elevationMeters: 1800,
      surroundingReliefMeters: 900,
      terrainType: "summit",
      terrainConfidence: "high",
    });

    expect(lowland.terrainClass).toBe("low_elevation");
    expect(lowland.isClassicCloudSeaEligible).toBe(false);
    expect(lowland.shouldDowngradeCloudSeaWording).toBe(true);
    expect(lowland.terrainNoteZh).toContain("当前按低海拔低云/晨雾参考处理");
    expect(lowland.vocabulary.windowCategories.sunrise.title).toBe("日出低云 / 晨雾");
    expect(lowland.windowCategoryLabels).toEqual({
      sunrise: "日出低云 / 晨雾",
      sunset: "日落层云",
      daylight: "有光云层",
      noLight: "夜间低云 / 雾气",
    });
    expect(lowland.windowSectionNoteZh).toBe(
      "当前地形更适合顺带观察，本区块按低云、晨雾、层云和通透参考处理。",
    );
    expect(lowland.forbiddenStrongRecommendation).toBe(true);
    expect(lowland.recommendationCeiling).toBe("recommend_observation");
    expect(lowland.preferredVocabulary).toEqual([
      "低云",
      "晨雾",
      "层云",
      "云层变化",
      "通透",
      "霞光参考",
      "远山层次",
    ]);
    expect(
      cloudSeaTerrainRecommendationLabel("强推荐专程", lowland, {
        score: 68,
        hasWindow: true,
      }),
    ).toBe("已在附近可观察");

    expect(highMountain.terrainClass).toBe("high_mountain");
    expect(highMountain.isClassicCloudSeaEligible).toBe(true);
    expect(highMountain.shouldDowngradeCloudSeaWording).toBe(false);
    expect(highMountain.vocabulary.windowCategories.sunrise.title).toBe("日出云海");
    expect(highMountain.windowCategoryLabels).toEqual({
      sunrise: "日出云海",
      sunset: "日落云海",
      daylight: "有光云海",
      noLight: "无光云海",
    });
    expect(highMountain.windowSectionNoteZh).toBeUndefined();
    expect(highMountain.forbiddenStrongRecommendation).toBe(false);
    expect(highMountain.recommendationCeiling).toBe("classic_cloud_sea");
    expect(highMountain.preferredVocabulary).toContain("云海形成");
  });

  it("downgrades low-elevation Cloud Sea result wording while keeping professional hourly data visible", () => {
    const result = lowElevationCloudSeaResultForTest();
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const windowSection = sectionBetween(
      html,
      "CloudSeaWindowCards",
      "CloudSeaProfessionalHourlyData",
    );

    expect(viewModel.terrainContext.shouldDowngradeCloudSeaWording).toBe(true);
    expect(viewModel.hero.title).toBe("瓯江河畔 低云/晨雾参考");
    expect(viewModel.hero.recommendationLabel).toBe("已在附近可观察");
    expect(viewModel.coreCards.map((card) => card.label)).toEqual([
      "低云/晨雾信号",
      "云层可观察机会",
      "低云遮挡风险",
      "雨后开口机会",
    ]);
    expect(viewModel.actionPlan.map((item) => item.label)).toContain("观察窗口");
    expect(viewModel.dailyTrend.map((item) => item.recommendedAction)).toContain("已在附近可观察");

    expect(html).toContain("低云/晨雾参考");
    expect(html).toContain("地形参考：机位海拔约 142 米，周边高差暂未计算");
    expect(windowSection).toContain("低云观察与备选");
    expect(windowSection).toContain(
      "当前地形更适合顺带观察，本区块按低云、晨雾、层云和通透参考处理。",
    );
    expect(html).toContain("晨雾");
    expect(html).toContain("低云");
    expect(html).toContain("云层变化");
    expect(html).toContain("通透");
    expect(windowSection).toContain("日出低云 / 晨雾");
    expect(windowSection).toContain("日落层云");
    expect(windowSection).toContain("有光云层");
    expect(windowSection).toContain("夜间低云 / 雾气");
    expect(windowSection).toContain("已在附近可观察");
    expect(windowSection).toContain("顺带观察");
    expect(windowSection).toContain("观察近地雾气");
    expect(windowSection).toContain("复核低云是否贴地");
    expect(windowSection).toContain("霞光参考");
    expect(windowSection).not.toContain("日出云海");
    expect(windowSection).not.toContain("日落云海");
    expect(windowSection).not.toContain("有光云海");
    expect(windowSection).not.toContain("无光云海");
    expect(windowSection).not.toContain("优先守拍");
    expect(html).toContain("低云遮挡风险");
    expect(html).toContain("观察近地雾气");
    expect(html).toContain("远山层次和通透度");
    expect(html).not.toContain("推荐专程云海");
    expect(html).not.toContain("强推荐专程云海");
    expect(html).not.toContain("推荐安排");
    expect(html).not.toContain("高山云海窗口");
    expect(html).not.toContain("山顶云海");
    expect(html).not.toContain("云海主守");
    expect(html).not.toContain("主守云海");

    expect(html).toContain("专业小时数据");
    expect(html).toContain("低云信号");
    expect(html).toContain("总云量 %");
    expect(html).toContain("高云量 %");
    expect(html).toContain("中云量 %");
    expect(html).toContain("低云量 %");
    expect(html).toContain('data-professional-hourly-expanded="true"');
    expect(html).not.toContain("坐标信息");
    expect(html).not.toContain("WGS84");
    expect(html).not.toContain("GCJ-02");
    expect(html).not.toContain("经度");
    expect(html).not.toContain("纬度");
    expect(html).not.toContain("latitude");
    expect(html).not.toContain("longitude");
  });

  it("keeps a 32 score Cloud Sea result from rendering strong recommendation copy", () => {
    const result = contradictoryLowScoreCloudSeaResultForTest();
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const actionPlan = sectionBetween(html, "CloudSeaActionPlan", "CloudSeaRiskSummary");
    const windowSection = sectionBetween(
      html,
      "CloudSeaWindowCards",
      "CloudSeaProfessionalHourlyData",
    );

    expect(viewModel.recommendationGuard.finalRecommendationLabel).toBe("不建议专程");
    expect(viewModel.hero.recommendationLabel).toBe("不建议专程");
    expect(viewModel.hero.bestWindowLabel).toContain("备选观察窗口");
    expect(viewModel.actionPlan.find((item) => item.key === "departure")).toMatchObject({
      label: "是否建议出发",
      value: "不建议专程",
    });
    expect(viewModel.dailyTrend.every((item) => item.recommendedAction === "不建议专程")).toBe(
      true,
    );
    expect(
      viewModel.cloudSeaWindows.every((item) => item.recommendationLabel === "不建议专程"),
    ).toBe(true);
    expect(actionPlan).toContain("是否建议出发");
    expect(actionPlan).toContain("不建议专程");
    expect(actionPlan).toContain("当前云海证据不足");
    expect(windowSection).toContain("不建议专程");
    expect(viewModel.cloudSeaWindows.map((item) => item.label).join(" ")).toContain("备选观察窗口");
    expect(html).not.toContain("强推荐专程");
    expect(html).not.toContain("推荐专程云海");
    expect(html).not.toContain("云海主守");
  });

  it("keeps Cloud Sea action plan, daily cards, and window cards under the low-elevation cap", () => {
    const result = lowElevationCloudSeaResultForTest();
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const actionPlan = sectionBetween(html, "CloudSeaActionPlan", "CloudSeaRiskSummary");
    const dailySection = sectionBetween(html, "CloudSeaDailyTrend", "CloudSeaReasoning");

    expect(viewModel.recommendationGuard.maxAllowedRecommendationStrength).toBe(
      "observe_if_nearby",
    );
    expect(viewModel.hero.recommendationLabel).toBe("已在附近可观察");
    expect(viewModel.actionPlan.find((item) => item.key === "departure")?.value).toBe(
      "已在附近可观察",
    );
    expect(actionPlan).toContain("已在附近可观察");
    expect(dailySection).toContain("已在附近可观察");
    expect(html).toContain("低云/晨雾参考窗口");
    expect(html).not.toContain("强推荐专程");
    expect(html).not.toContain("推荐专程云海");
    expect(html).not.toContain("云海主守");
  });

  it("resolves the Cloud Sea forecast page into explicit search, loading, result, and error modes", () => {
    const query = queryForTarget("cloud_sea");

    expect(resolveForecastPageMode({ query: null, status: "idle", hasResult: false })).toBe(
      "search",
    );
    expect(resolveForecastPageMode({ query, status: "loading", hasResult: false })).toBe("loading");
    expect(resolveForecastPageMode({ query, status: "ready", hasResult: true })).toBe("result");
    expect(resolveForecastPageMode({ query, status: "error", hasResult: false })).toBe("error");
  });

  it("renders General Forecast loading with the shared DecisionLoadingTemplate", () => {
    const query = queryForTarget("general");
    const html = renderToStaticMarkup(React.createElement(ForecastResultClient, { query }));

    expect(html).toContain('data-testid="decision-loading-template"');
    expect(html).toContain('data-testid="decision-context-card"');
    expect(html).toContain('data-testid="decision-loading-card"');
    expect(html).toContain('data-testid="decision-info-card"');
    expect(html).toContain('data-forecast-decision-page-shell="true"');
    expect(html).toContain('data-forecast-loading-state="true"');
    expect(html).toContain('data-result-page-state="loading"');
    expect(html).toContain('data-result-target="general"');
    expect(html).toContain("地点 / 查询");
    expect(html).toContain("黄山光明顶");
    expect(html).toContain("预报范围");
    expect(html).toContain("分析目标");
    expect(html).toContain("综合判断");
    expect(html).toContain("正在生成拍摄天气分析");
    expect(html).toContain("分析基础");
  });

  it("renders Cloud Sea loading with the same shared DecisionLoadingTemplate and context card", () => {
    const query = queryForTarget("cloud_sea");
    const html = renderToStaticMarkup(React.createElement(ForecastResultClient, { query }));

    expect(html).toContain('data-cloud-sea-page-mode="loading"');
    expect(html).toContain('data-testid="decision-loading-template"');
    expect(html).toContain('data-testid="decision-context-card"');
    expect(html).toContain('data-testid="decision-loading-card"');
    expect(html).toContain('data-testid="decision-info-card"');
    expect(html).toContain('data-forecast-decision-page-shell="true"');
    expect(html).toContain('data-forecast-loading-state="true"');
    expect(html).toContain('data-result-page-state="loading"');
    expect(html).toContain('data-result-target="cloud_sea"');
    expect(html).toContain('data-cloud-sea-loading="shared-template"');
    expect(html).not.toContain('data-cloud-sea-loading="full-width"');
    expect(html).not.toContain('data-cloud-sea-loading-card="true"');
    expect(html).not.toContain("<aside");
    expect(html).toContain("首页");
    expect(html).toContain("云海拍摄判断");
    expect(html).toContain("正在生成云海拍摄判断");
    expect(html).toContain("云海判断基础");
    expect(html).toContain("地点 / 查询");
    expect(html).toContain("黄山光明顶");
    expect(html).toContain("预报范围");
    expect(html).toContain("分析目标");
    expect(html).toContain("云海");
    expect(html).not.toContain("坐标信息");
    expect(html).not.toContain("WGS84");
    expect(html).not.toContain("GCJ-02");
    expect(html).not.toContain("经度");
    expect(html).not.toContain("纬度");
    expect(html).not.toContain("latitude");
    expect(html).not.toContain("longitude");
    expect(html).not.toContain("30.13012");
    expect(html).not.toContain("118.16389");
  });

  it("keeps the generic decision loading state on the shared Cloud Sea template without coordinate output", () => {
    const html = renderToStaticMarkup(
      React.createElement(ForecastDecisionLoadingState, {
        target: "cloud_sea",
        context: queryForTarget("cloud_sea"),
      }),
    );

    expect(html).toContain('data-cloud-sea-page-mode="loading"');
    expect(html).toContain('data-testid="decision-loading-template"');
    expect(html).toContain('data-testid="decision-context-card"');
    expect(html).toContain('data-testid="decision-loading-card"');
    expect(html).toContain('data-testid="decision-info-card"');
    expect(html).toContain('data-forecast-decision-page-shell="true"');
    expect(html).toContain('data-forecast-loading-state="true"');
    expect(html).toContain('data-result-page-state="loading"');
    expect(html).toContain('data-result-target="cloud_sea"');
    expect(html).toContain('data-cloud-sea-loading="shared-template"');
    expect(html).not.toContain('data-cloud-sea-loading="full-width"');
    expect(html).not.toContain('data-cloud-sea-loading-card="true"');
    expect(html).not.toContain("重新选择地点");
    expect(html).not.toContain("<aside");
    expect(html).toContain("黄山光明顶");
    expect(html).toContain("地点 / 查询");
    expect(html).toContain("预报范围");
    expect(html).toContain("分析目标");
    expect(html).not.toContain("坐标信息");
    expect(html).not.toContain("WGS84");
    expect(html).not.toContain("latitude");
    expect(html).not.toContain("longitude");
  });

  it("renders Cloud Sea error with the shared decision error template", () => {
    const html = renderToStaticMarkup(
      React.createElement(ForecastDecisionErrorState, {
        target: "cloud_sea",
        query: queryForTarget("cloud_sea"),
        message: "网络暂时不可用。",
      }),
    );

    expect(html).toContain('data-cloud-sea-page-mode="error"');
    expect(html).toContain('data-testid="decision-error-template"');
    expect(html).toContain('data-testid="decision-context-card"');
    expect(html).toContain('data-testid="decision-error-card"');
    expect(html).toContain('data-testid="decision-info-card"');
    expect(html).toContain('data-forecast-decision-page-shell="true"');
    expect(html).toContain('data-forecast-error-state="true"');
    expect(html).toContain('data-result-page-state="error"');
    expect(html).toContain('data-result-target="cloud_sea"');
    expect(html).toContain('data-cloud-sea-error="shared-template"');
    expect(html).not.toContain('data-cloud-sea-error="full-width"');
    expect(html).not.toContain('data-cloud-sea-error-card="true"');
    expect(html).toContain("云海判断生成失败");
    expect(html).toContain("网络暂时不可用。");
    expect(html).toContain("重新选择地点");
    expect(html).toContain("重新判断");
    expect(html).not.toContain("<aside");
    expect(html).toContain("地点 / 查询");
    expect(html).toContain("黄山光明顶");
    expect(html).toContain("预报范围");
    expect(html).toContain("分析目标");
    expect(html).not.toContain("坐标信息");
    expect(html).not.toContain("WGS84");
    expect(html).not.toContain("GCJ-02");
    expect(html).not.toContain("经度");
    expect(html).not.toContain("纬度");
    expect(html).not.toContain("30.13012");
    expect(html).not.toContain("118.16389");
  });

  it("renders the cloud sea result through the shared DecisionResultTemplate without entry-page search/sidebar", () => {
    const result = resultForTarget("cloud_sea");
    const viewModel = buildCloudSeaForecastViewModel(result);
    const fetchMock = vi.fn(() => {
      throw new Error("cloud sea result render should not call external APIs");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const html = renderToStaticMarkup(
        React.createElement(CloudSeaResultPage, {
          query: queryForTarget("cloud_sea"),
          result,
          viewModel,
        }),
      );

      expect(html).not.toContain("热门云海机位");
      expect(html).not.toContain("老君山金顶");
      expect(html).not.toContain("三清山女神峰");
      expect(html).not.toContain("武功山金顶");
      expect(html).not.toContain("有没有云海机会");
      expect(html).not.toContain("能不能拍");
      expect(html).not.toContain("会不会白墙");
      expect(html).not.toContain("几点到、几点守");
      expect(html).not.toContain("白墙时怎么转拍");
      expect(html).not.toContain("是否值得专程去");
      expect(html).toContain("白墙风险");
      expect(html).toContain("黄山光明顶 云海判断");
      expect(html).toContain("建议到达");
      expect(html).toContain("云海窗口与备选");
      expect(html).toContain("按光线和时段归纳主窗口与备选窗口，快速判断哪一类云海更值得守拍。");
      expect(html).toContain("云海窗口");
      expect(html).toContain("日出云海");
      expect(html).toContain("日落云海");
      expect(html).toContain("有光云海");
      expect(html).toContain("无光云海");
      expect(countOccurrences(html, 'data-testid="cloud-sea-window-category-card"')).toBe(4);
      expect(countOccurrences(html, "机会指数")).toBe(4);
      expect(countOccurrences(html, "主窗口：</dt>")).toBe(4);
      expect(countOccurrences(html, "备选窗口：</dt>")).toBe(4);
      expect(countOccurrences(html, "主要限制：</dt>")).toBe(4);
      expect(countOccurrences(html, "行动：</span>")).toBe(4);
      expect(html).toContain("05:00");
      expect(html).toContain("17:20");
      expect(html).not.toContain("云海时间轴");
      expect(html).not.toContain("聚焦云海信号、白墙风险、雨后开口和到场动作。");
      expect(html).toContain("每日云海判断");
      expect(html).toContain("判断依据");
      expect(html).toContain("行动方案");
      expect(html).toContain("风险与复核");
      expect(html).toContain("建议到达时间");
      expect(html).toContain("主守窗口");
      expect(html).toContain("备选方案");
      expect(html).toContain("装备提醒");
      expect(html).toContain("现场复核点");
      expect(html).not.toContain('data-cloud-sea-section="CloudSeaSearchPanel"');
      expect(html).not.toContain('data-place-search-card-mode="result-compact"');
      expect(html).not.toContain('data-selected-location-summary="result-compact"');
      expect(html).not.toContain("地点与预报范围");
      expect(html).not.toContain("当前地点");
      expect(html).not.toContain("更换地点");
      expect(html).not.toContain("预报范围");
      expect(html).toContain("重新选择地点");
      expect(html).toContain("重新判断");
      expect(html.indexOf("重新判断")).toBeGreaterThan(html.indexOf("CloudSeaHeroConclusion"));
      expect(html).not.toContain("坐标信息");
      expect(html).not.toContain("WGS84");
      expect(html).not.toContain("GCJ-02");
      expect(html).not.toContain("GCJ02");
      expect(html).not.toContain("经度");
      expect(html).not.toContain("纬度");
      expect(html).not.toContain("latitude");
      expect(html).not.toContain("longitude");
      expect(html).not.toContain("30.13012");
      expect(html).not.toContain("118.16389");
      expect(html).not.toContain("30.1328");
      expect(html).not.toContain("118.171");
      expect(html).not.toMatch(/\b\d{1,2}\.\d{3,}[NS]?,\s*\d{2,3}\.\d{3,}[EW]?\b/i);
      expect(html).not.toContain('data-selected-location-card="true"');
      expect(html).not.toContain("<aside");
      expect(html).not.toContain("PlaceSearchCard");
      expect(html).not.toContain("已选地点");
      expect(html).not.toContain("所在地");
      expect(html).not.toContain("判断范围");
      expect(html).not.toContain("查看朝霞晚霞");
      expect(html).not.toContain("查看星空银河");
      expect(html).not.toContain("相关题材");
      expect(html).not.toContain("页面预设");
      expect(html).not.toContain("体验模式");
      expect(html).not.toContain("体验参考");
      expect(html).not.toContain("数据提醒");
      expect(html).not.toContain("固定分析目标");
      expect(html).not.toContain("云海 vs 白墙判断");
      expect(html).not.toContain("地形依据");
      expect(html).not.toContain("气象依据");
      expect(html).not.toContain("天气数据：演示天气数据");
      expect(html).not.toContain("地形数据：演示数据");
      expect(html).not.toContain("正式数据源启用后将显示对应来源与更新时间");
      expect(html).not.toContain("meteoblue");
      expect(html).not.toContain("Open-Meteo");
      expect(html).not.toContain("和风天气");
      expect(html).toContain("CloudSeaResultPage");
      expect(html).toContain('data-testid="decision-result-template"');
      expect(html).toContain('data-testid="decision-score-card"');
      expect(html).toContain('data-forecast-decision-page-shell="true"');
      expect(html).toContain('data-result-dashboard-shell="true"');
      expect(html).toContain('data-result-target="cloud_sea"');
      expect(html).toContain('data-forecast-result-header="true"');
      expect(html).toContain('data-result-header-row="true"');
      expect(html).toContain('data-forecast-result-summary-card="true"');
      expect(html).toContain('data-result-header-summary-card="true"');
      expect(html).toContain('data-forecast-score-card="true"');
      expect(html).toContain('data-result-score-card="true"');
      expect(html).toContain("CloudSeaTopResultHeader");
      expect(html).toContain("CloudSeaHeroConclusion");
      expect(html).toContain("CloudSeaScoreCard");
      expect(countOccurrences(html, "CloudSeaHeroConclusion")).toBe(1);
      expect(countOccurrences(html, 'data-cloud-sea-section="CloudSeaScoreCard"')).toBe(1);
      expect(html).toContain("CloudSeaCoreMetrics");
      expect(html).toContain('data-forecast-metric-grid="true"');
      expect(html).toContain('data-result-metric-grid="true"');
      expect(html).toContain('data-forecast-metric-card="true"');
      expect(countOccurrences(html, 'data-result-metric-card="true"')).toBe(6);
      expect(html).toContain("云海可拍指数");
      expect(html).toContain("/ 100");
      expect(html).toContain("地形参考：机位海拔约 1860 米");
      expect(html).toContain("推荐等级");
      expect(html).toContain("云层变化参考窗口");
      expect(html).toContain("云海形成 / 可拍机会");
      expect(html).toContain("主要风险");
      expect(countOccurrences(html, 'data-cloud-sea-metric-card="true"')).toBe(6);
      expect(html).not.toContain("min-[900px]:grid-cols-[clamp(260px,22vw,320px)_minmax(0,1fr)]");
      expect(html).toContain("min-[880px]:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]");
      expect(html).toContain('data-forecast-decision-layout="stacked"');
      expect(html).not.toContain("CloudSeaStackedLayout");
      expect(html).not.toContain(
        "min-[1200px]:grid-cols-[clamp(320px,23vw,380px)_minmax(0,1fr)_clamp(300px,22vw,360px)]",
      );
      expect(html).toContain("CloudSeaNearTermWeather");
      expect(html).toContain('data-forecast-current-weather-cards="true"');
      expect(html).toContain('data-result-current-weather-section="true"');
      expect(html).toContain("当前与近时段天气（2026年5月20日 周三 00:00-05:00）");
      expect(html).toContain("气温与体感");
      expect(html).toContain("云层与能见度");
      expect(html).toContain("风与降水");
      expect(html).toContain("湿度与露点");
      expect(html).toContain("穿衣与装备");
      expect(html).toContain("CloudSeaWindowCards");
      expect(html).toContain("CloudSeaDailyTrend");
      expect(html).toContain('data-forecast-daily-decision-list="true"');
      expect(html).toContain('data-result-daily-section="true"');
      expect(html).toContain("CloudSeaReasoning");
      expect(html).toContain('data-result-judgment-basis-grid="true"');
      expect(html).toContain('data-result-action-plan-grid="true"');
      expect(html).not.toContain("CloudSeaStackedLayout");
      expect(html).toContain('data-cloud-sea-section="CloudSeaAiInterpretation"');
      expect(html).toContain("智能解读");
      expect(html).toContain("可手动生成更自然的摄影建议，当前判断结果不依赖 AI。");
      expect(html).toContain("生成智能解读");
      expect(html).not.toContain("确定性简版");
      expect(html).not.toContain("基于确定性计算结果生成的简版解读");
      expect(html).not.toContain("CloudSeaActionSummary");
      expect(html).not.toContain("CloudSeaNavigation");
      expect(html).not.toContain("CloudSeaAdviceRail");
      expect(html).not.toContain("cloud-sea-advice-rail");
      expect(html).not.toContain("CloudSeaFullWidthDetails");
      expect(html).not.toContain("cloud-sea-full-width-details");
      expect(html).not.toMatch(/cloud-sea-(placeholder|spacer|empty)/i);
      expect(html).not.toContain("CloudSeaTimeline");
      expect(html).not.toMatch(/\bmin-h-/);
      expect(html).not.toContain("row-span");
      expect(html).not.toContain("min-[1024px]:col-span-4");
      expect(html.indexOf("CloudSeaHeroConclusion")).toBeLessThan(
        html.indexOf("CloudSeaCoreMetrics"),
      );
      expect(html.indexOf("CloudSeaCoreMetrics")).toBeLessThan(
        html.indexOf("CloudSeaNearTermWeather"),
      );
      expect(html.indexOf("CloudSeaNearTermWeather")).toBeLessThan(
        html.indexOf("CloudSeaWindowCards"),
      );
      const professionalHourlyIndex = html.indexOf("CloudSeaProfessionalHourlyData");
      if (professionalHourlyIndex >= 0) {
        expect(html.indexOf("CloudSeaWindowCards")).toBeLessThan(professionalHourlyIndex);
        expect(professionalHourlyIndex).toBeLessThan(html.indexOf("CloudSeaDailyTrend"));
      } else {
        expect(html.indexOf("CloudSeaWindowCards")).toBeLessThan(
          html.indexOf("CloudSeaDailyTrend"),
        );
      }
      expect(html.indexOf("CloudSeaDailyTrend")).toBeLessThan(html.indexOf("判断依据"));
      expect(html.indexOf("判断依据")).toBeLessThan(html.indexOf("行动方案"));
      expect(html.indexOf("行动方案")).toBeLessThan(html.indexOf("风险与复核"));
      expect(html.indexOf("风险与复核")).toBeLessThan(html.indexOf("智能解读"));
      expectMarkersInOrder(html, [
        "CloudSeaHeroConclusion",
        "CloudSeaCoreMetrics",
        "CloudSeaNearTermWeather",
        "CloudSeaWindowCards",
        "CloudSeaDailyTrend",
        "判断依据",
        "行动方案",
        "风险与复核",
        "CloudSeaAiInterpretation",
        "智能解读",
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("places Cloud Sea intelligent interpretation after deterministic result sections", () => {
    const base = resultWithProfessionalHourlyData();
    const context = agreementContext();
    const result: ForecastCalculationResult = {
      ...base,
      weatherDataMode: "real",
      weatherFusionSummary: weatherFusionSummaryWithAgreement(context),
      cloudSeaAnalysis: {
        ...base.cloudSeaAnalysis,
        confidenceLevel: "high",
      },
    };
    const viewModel = buildCloudSeaForecastViewModel(result);
    const fetchMock = vi.fn(() => {
      throw new Error("cloud sea AI interpretation should not auto-run on result render");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const html = renderToStaticMarkup(
        React.createElement(CloudSeaResultPage, {
          query: queryForTarget("cloud_sea"),
          result,
          viewModel,
          returnUrl: "/forecast?target=general",
        }),
      );
      const aiIndex = html.indexOf("智能解读");
      const dataCaution = viewModel.dataCaution ?? "";
      const afterAiSection = html.slice(aiIndex);
      const professionalHourlySection = sectionBetween(
        html,
        "CloudSeaProfessionalHourlyData",
        "CloudSeaDailyTrend",
      );

      expect(aiIndex).toBeGreaterThanOrEqual(0);
      expect(html).toContain("生成智能解读");
      expect(html).toContain("专业小时数据");
      expect(professionalHourlySection).toContain("专业小时数据");
      expect(html).toContain("总云量 %");
      expect(html).toContain("高云量 %");
      expect(html).toContain("中云量 %");
      expect(html).toContain("低云量 %");
      expect(html).toContain("多源一致性");
      expect(dataCaution).toContain("低云分歧较大");
      expectMarkersInOrder(html, [
        "CloudSeaTopResultHeader",
        "CloudSeaCoreMetrics",
        "CloudSeaNearTermWeather",
        "CloudSeaWindowCards",
        "CloudSeaProfessionalHourlyData",
        "CloudSeaDailyTrend",
        "每日云海判断",
        "判断依据",
        "行动方案",
        "风险与复核",
        "返回综合判断",
        "CloudSeaAiInterpretation",
        "智能解读",
      ]);
      expect(html.indexOf("CloudSeaMultiSourceAgreement")).toBeLessThan(aiIndex);
      expect(html.indexOf("多源一致性")).toBeLessThan(aiIndex);
      expect(html.indexOf(dataCaution)).toBeLessThan(aiIndex);
      expect(afterAiSection).not.toContain("专业小时数据");
      expect(afterAiSection).not.toContain("每日云海判断");
      expect(afterAiSection).not.toContain("判断依据");
      expect(afterAiSection).not.toContain("行动方案");
      expect(afterAiSection).not.toContain("风险与复核");
      expect(afterAiSection).not.toContain("多源一致性");
      expect(afterAiSection).not.toContain("返回综合判断");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders complete weak cloud sea window cards when window data is missing", () => {
    const base = resultForTarget("cloud_sea");
    const result: ForecastCalculationResult = {
      ...base,
      bestWindows: base.bestWindows.filter((window) => window.target !== "cloud_sea"),
      cloudSeaAnalysis: {
        ...base.cloudSeaAnalysis,
        bestCloudSeaWindows: [],
        watchableCloudSeaWindows: [],
        notRecommendedCloudSeaWindows: [],
      },
    };
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const section = sectionBetween(html, "CloudSeaWindowCards", "CloudSeaDailyTrend");

    expect(viewModel.cloudSeaWindows).toHaveLength(0);
    expect(section).toContain("云海窗口与备选");
    expect(countOccurrences(section, 'data-testid="cloud-sea-window-category-card"')).toBe(4);
    expect(section).toContain("日出云海");
    expect(section).toContain("日落云海");
    expect(section).toContain("有光云海");
    expect(section).toContain("无光云海");
    expect(countOccurrences(section, "机会指数")).toBe(4);
    expect(countOccurrences(section, "暂无明确评分")).toBe(4);
    expect(countOccurrences(section, "主窗口：</dt>")).toBe(4);
    expect(countOccurrences(section, "备选窗口：</dt>")).toBe(4);
    expect(countOccurrences(section, "主要限制：</dt>")).toBe(4);
    expect(countOccurrences(section, "行动：</span>")).toBe(4);
    expect(countOccurrences(section, "暂无明确窗口")).toBeGreaterThanOrEqual(4);
    expect(countOccurrences(section, "等待下一次预报更新")).toBe(4);
    expect(section).toContain("当前窗口数据未给出日出前后可用云海窗口。");
    expect(section).toContain("当前窗口数据未给出夜间或低光云海形成窗口。");
    expect(html).not.toContain("云海时间轴");
    expect(html).not.toContain("CloudSeaTimeline");
  });

  it("renders professional hourly data after the cloud sea window cards as a visible focused table", () => {
    const result = resultWithProfessionalHourlyData();
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );

    expect(html).toContain("CloudSeaHeroConclusion");
    expect(html).toContain("CloudSeaCoreMetrics");
    expect(html).toContain("CloudSeaWindowCards");
    expect(html).toContain("CloudSeaProfessionalHourlyData");
    expect(html).toContain('data-testid="professional-hourly-data"');
    expect(html).toContain("专业小时数据");
    expect(html).toContain("专业参考");
    expect(html).toContain('data-professional-hourly-expanded="true"');
    expect(html).not.toContain('data-cloud-sea-hourly-preview="true"');
    expect(html).not.toContain("mt-4 grid gap-3 hidden");
    expect(html).toContain(
      "低云、湿度、露点、降水、能见度和风速用于复核云海形成与白墙；中高云主要作为霞光和云层纹理参考。",
    );
    expect(html).toContain("有效时间");
    expect(html).toContain("2026年5月20日");
    expect(html).toContain("时间步长");
    expect(html).toContain("逐小时");
    expect(html).toContain("时区");
    expect(html).toContain("Asia/Shanghai");
    expect(html).toContain("温度口径");
    expect(html).toContain("机位海拔修正后");
    expect(html).toContain("云量口径");
    expect(html).toContain("总云量 + 低/中/高云分层");
    expect(html).toContain("缺失说明");
    expect(html).toContain("当前数据源返回的未来小时数不足，已展示可用未来时段。");
    expect(html).toContain("全部小时");
    expect(html).toContain("只看云海窗口");
    expect(html).toContain("只看清晨窗口");
    expect(html).toContain("只看有风险时段");
    expect(html).not.toContain("查看全部小时");
    expect(html.match(/全部小时/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("展开专业数据");
    expect(html).toContain("当前筛选：只看云海窗口");
    expect(html).toContain("筛选 9 / 15 小时；覆盖 15 / 48 小时");
    expect(html).toContain("总云量 %");
    expect(html).toContain("高云量 %");
    expect(html).toContain("中云量 %");
    expect(html).toContain("低云量 %");
    expect(html).toContain("原始格点气温 °C");
    expect(html).toContain("机位估算气温 °C");
    expect(html).toContain("露点 °C");
    expect(html).toContain("露点差 °C");
    expect(html).toContain("湿度 %");
    expect(html).toContain("降水 mm / 降水概率 %");
    expect(html).toContain("能见度 km");
    expect(html).toContain("风速 m/s");
    expect(html).toContain("风向");
    expect(html).toContain("云海信号");
    expect(html).toContain("可拍窗口");
    expect(html).toContain('data-professional-hourly-row="2026-05-20T05:00:00+08:00"');
    expect(html).not.toContain('data-professional-hourly-row="2026-05-20T13:00:00+08:00"');
    expect(html).toContain("max-w-full overflow-x-auto");
    expect(html).toContain("min-w-[1280px]");
    expect(html).toContain("sticky left-0");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("和风天气");

    expect(html.indexOf("CloudSeaWindowCards")).toBeLessThan(
      html.indexOf("CloudSeaProfessionalHourlyData"),
    );
    expect(html.indexOf("CloudSeaProfessionalHourlyData")).toBeLessThan(
      html.indexOf("CloudSeaDailyTrend"),
    );
    expect(html.indexOf("专业小时数据")).toBeLessThan(html.indexOf("每日云海判断"));
  });

  it("shows generic cloud-basis mismatch notes and downgrades cloud sea confidence", () => {
    const hourly = professionalHourlyDataForTest().map((row, index) =>
      index >= 4 && index <= 7
        ? {
            ...row,
            cloudSeaSignal: "可拍窗口" as const,
            cloudSeaSignalLevel: "positive" as const,
            cloudTotalPercent: 20,
            cloudHighPercent: 18,
            cloudMidPercent: 24,
            cloudLowPercent: 70,
            cloudLayerBasis: "explicit_layers" as const,
          }
        : row,
    );
    const result = resultWithProfessionalHourlyData({
      professionalHourlyData: hourly,
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const professionalSection = sectionBetween(
      html,
      "CloudSeaProfessionalHourlyData",
      "CloudSeaDailyTrend",
    );

    expect(viewModel.cloudBasisConsistency).toMatchObject({
      cloudBasisLevel: "mixed_basis",
      shouldLowerCloudSeaConfidence: true,
      mismatchHoursCount: 4,
    });
    expect(viewModel.hero.confidenceLabel).toBe("低（云量口径需复核）");
    expect(viewModel.recommendationGuard.finalRecommendationLabel).toBe("谨慎参考");
    expect(viewModel.reasoningItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "云量口径一致性",
          value: "口径差异",
        }),
      ]),
    );
    expect(html).toContain("总云量与分层云量存在口径差异");
    expect(html).toContain("分层云量仅作趋势复核");
    expect(html).toContain("当前置信度：低（云量口径需复核）");
    expect(professionalSection).toContain("总云量 %");
    expect(professionalSection).toContain("高云量 %");
    expect(professionalSection).toContain("中云量 %");
    expect(professionalSection).toContain("低云量 %");
    expect(professionalSection).toContain("口径需复核");
    expect(professionalSection).toMatch(/data-professional-hourly-cell="signal"[\s\S]*?需复核/);
    expect(professionalSection).not.toContain("可拍窗口</span>");
  });

  it("renders a compact data consistency note and caps strong copy for generic variable conflicts", () => {
    const result = genericCloudSeaConsistencyResult(
      professionalHourlyDataForTest({
        relativeHumidityPercent: 100,
        dewPointSpreadC: 7,
      }),
    );
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const reasoningSection = sectionBetween(html, "CloudSeaReasoning", "CloudSeaActionPlan");

    expect(viewModel.ruleContext.weatherVariableConsistencyContext.consistencyLevel).toBe(
      "conflict",
    );
    expect(viewModel.recommendationGuard.finalRecommendationLabel).toBe("谨慎参考");
    expect(viewModel.hero.confidenceLabel).toContain("变量需复核");
    expect(reasoningSection).toContain("数据一致性");
    expect(reasoningSection).toContain("湿度与露点差需结合临近预报复核");
    expect(reasoningSection).toContain("不宜仅凭湿度判断云海或白墙");
    expect(html).toContain("变量复核");
    expect(html).toContain("水汽指标存在口径差异");
    expect(html).not.toContain("强推荐专程云海");
    expect(html).not.toMatch(/latitude|longitude|WGS84|GCJ-02|经度|纬度/i);
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("和风天气");
  });

  it("renders high precipitation probability with near-zero amount as local disturbance instead of strong rain", () => {
    const result = genericCloudSeaConsistencyResult(
      professionalHourlyDataForTest({
        precipitationProbabilityPercent: 78,
        precipitationAmountMm: 0,
      }),
    );
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const actionPlan = sectionBetween(html, "CloudSeaActionPlan", "CloudSeaRiskSummary");

    expect(viewModel.ruleContext.weatherVariableConsistencyContext.precipitationSignalStatus).toBe(
      "probability_only",
    );
    expect(viewModel.recommendationGuard.finalRecommendationLabel).toBe("强推荐专程");
    expect(html).toContain("降水概率 78%");
    expect(html).toContain("预计雨量 0 mm");
    expect(html).toContain("更像局地短时扰动");
    expect(html).toContain("不宜直接按强降水处理");
    expect(actionPlan).toContain("准备防潮和轻量防雨");
    expect(html).not.toContain("强降水干扰");
    expect(html).toContain("专业小时数据");
    expect(html).toContain("总云量 %");
    expect(html).toContain("高云量 %");
    expect(html).toContain("中云量 %");
    expect(html).toContain("低云量 %");
  });

  it("shows generic high-mountain temperature basis advice while preserving raw professional data", () => {
    const result = genericCloudSeaConsistencyResult(
      professionalHourlyDataForTest({
        rawTemperatureC: 29,
        terrainAdjustedTemperatureC: 20,
        displayedTemperatureC: 29,
        temperatureBasis: "raw_grid",
        temperatureBasisNoteZh: "原始格点温度。",
      }),
    );
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );

    expect(viewModel.ruleContext.weatherVariableConsistencyContext.temperatureBasisStatus).toBe(
      "mixed",
    );
    expect(html).toContain("机位估算温度");
    expect(html).toContain("高山机位与周边格点温度差异较大");
    expect(html).toContain("高山体感可能低于城市/低海拔预报");
    expect(html).toContain("专业小时数据");
    expect(html).toContain("原始格点气温 °C");
    expect(html).toContain("机位估算气温 °C");
    expect(html).toContain("露点差 °C");
    expect(html).not.toMatch(/latitude|longitude|WGS84|GCJ-02|经度|纬度/i);
  });

  it("renders compact multi-source low-cloud disagreement without provider names or coordinates", () => {
    const base = resultWithProfessionalHourlyData();
    const context = agreementContext();
    const result = {
      ...base,
      weatherDataMode: "real" as const,
      weatherFusionSummary: weatherFusionSummaryWithAgreement(context),
      cloudSeaAnalysis: {
        ...base.cloudSeaAnalysis,
        confidenceLevel: "high" as const,
      },
    };
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const agreementSection = sectionBetween(
      html,
      "CloudSeaMultiSourceAgreement",
      "CloudSeaDailyTrend",
    );

    expect(viewModel.multiSourceAgreementContext).toMatchObject({
      disagreementLevel: "high",
      shouldLowerConfidence: true,
    });
    expect(viewModel.hero.confidenceLabel).toBe("中（多源分歧需复核）");
    expect(viewModel.dataCaution).toContain("低云分歧较大");
    expect(html).toContain("CloudSeaProfessionalHourlyData");
    expect(html).toContain("CloudSeaMultiSourceAgreement");
    expect(html).toContain("多源一致性");
    expect(html).toContain("存在明显分歧");
    expect(html).toContain("已降低置信度");
    expect(agreementSection).toContain("低云分歧较大");
    expect(agreementSection).toContain("低云多源差值约 45 个百分点");
    expect(agreementSection).toContain("降水分歧");
    expect(html).not.toContain("QWeather");
    expect(html).not.toContain("qweather");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("和风天气");
    expect(html).not.toMatch(/latitude|longitude|WGS84|经度|纬度/i);
    expect(html.indexOf("CloudSeaProfessionalHourlyData")).toBeLessThan(
      html.indexOf("CloudSeaMultiSourceAgreement"),
    );
    expect(html.indexOf("CloudSeaMultiSourceAgreement")).toBeLessThan(
      html.indexOf("CloudSeaDailyTrend"),
    );
  });

  it("renders mid/high multi-source disagreement as glow or texture related without lowering cloud sea confidence", () => {
    const base = resultWithProfessionalHourlyData();
    const context = agreementContext({
      fieldDisagreements: [
        {
          field: "cloudMid",
          level: "high",
          range: 56,
          min: 18,
          max: 74,
          unit: "pct",
          sourcesAvailable: 2,
          messageZh: "中云多源差值约 56 个百分点，更多影响霞光和云层纹理判断。",
        },
        {
          field: "cloudHigh",
          level: "high",
          range: 62,
          min: 20,
          max: 82,
          unit: "pct",
          sourcesAvailable: 2,
          messageZh: "高云多源差值约 62 个百分点，更多影响霞光和云层纹理判断。",
        },
      ],
      keyWarningsZh: ["中高云分歧较大，更多影响霞光和云层纹理判断。"],
      userSummaryZh: "中高云判断存在分歧，更多影响霞光和云层纹理，对云海结论影响有限。",
      professionalSummaryZh: "中高云多源分歧较大，主要影响霞光和云层纹理，不作为云海强降级依据。",
      shouldLowerConfidence: false,
      shouldShowReviewWarning: true,
    });
    const result = {
      ...base,
      weatherDataMode: "real" as const,
      weatherFusionSummary: weatherFusionSummaryWithAgreement(context),
      cloudSeaAnalysis: {
        ...base.cloudSeaAnalysis,
        confidenceLevel: "high" as const,
      },
    };
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const agreementSection = sectionBetween(
      html,
      "CloudSeaMultiSourceAgreement",
      "CloudSeaDailyTrend",
    );

    expect(viewModel.hero.confidenceLabel).toBe("高");
    expect(agreementSection).toContain("中高云分歧较大");
    expect(agreementSection).toContain("偏霞光参考");
    expect(agreementSection).toContain("更多影响霞光和云层纹理");
    expect(agreementSection).not.toContain("已降低置信度");
    expect(html).toContain("CloudSeaProfessionalHourlyData");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("QWeather");
  });

  it("renders mid/high cloud only rows as glow or texture reference, not cloud sea", () => {
    const hourly = professionalHourlyDataForTest().map((row, index) => ({
      ...row,
      cloudSeaSignal: index >= 4 && index <= 7 ? ("霞光参考" as const) : ("云层纹理" as const),
      cloudSeaSignalLevel: index >= 4 && index <= 7 ? ("watch" as const) : ("neutral" as const),
      cloudTotalPercent: 92,
      cloudHighPercent: 86,
      cloudMidPercent: 74,
      cloudLowPercent: 12,
      dewPointSpreadC: 7,
      relativeHumidityPercent: 62,
      visibilityMeters: 22000,
      windSpeedMs: 4,
    }));
    const result = resultWithProfessionalHourlyData({
      professionalHourlyData: hourly,
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const professionalSection = sectionBetween(
      html,
      "CloudSeaProfessionalHourlyData",
      "CloudSeaDailyTrend",
    );

    expect(viewModel.reasoningItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "中高云角色",
          value: "霞光/纹理参考",
        }),
      ]),
    );
    expect(viewModel.dailyTrend.some((item) => item.layerCompletenessNote?.includes("霞光"))).toBe(
      true,
    );
    expect(html).toContain("中高云角色");
    expect(html).toContain("低云信号不足，不直接作为云海依据");
    expect(professionalSection).toContain("霞光参考");
    expect(professionalSection).toContain("云层纹理");
    expect(professionalSection).not.toContain("可拍窗口</span>");
    expect(professionalSection).not.toContain("形成信号</span>");
    expect(professionalSection).not.toContain("白墙风险</span>");
  });

  it("keeps the General Forecast return path without unrelated cloud sea subject links", () => {
    const result = resultForTarget("cloud_sea");
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
        returnUrl: "/forecast?target=general",
      }),
    );

    expect(html).toContain('href="/forecast?target=general"');
    expect(html).toContain("返回综合判断");
    expect(html).not.toContain("查看朝霞晚霞");
    expect(html).not.toContain("查看星空银河");
    expect(html).not.toContain("相关题材");
  });

  it("renders missing professional hourly values as dashes without converting them to zero", () => {
    const hourly = professionalHourlyDataForTest({
      weatherText: "meteoblue 专业预报",
      weatherCode: null,
      cloudHighPercent: null,
      cloudMidPercent: null,
      cloudLowPercent: null,
      cloudLayerBasis: "total_only",
      dewPointC: null,
      dewPointSpreadC: null,
      precipitationAmountMm: 0,
      precipitationProbabilityPercent: null,
      visibilityMeters: null,
      windSpeedMs: null,
      windDirectionDeg: null,
    });
    const result = resultWithProfessionalHourlyData({
      professionalHourlyData: hourly,
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );

    expect(html).not.toContain("meteoblue");
    expect(html).toMatch(/data-professional-hourly-cell="weather">[\s\S]*?<span>—<\/span>/);
    expect(html).toMatch(/data-professional-hourly-cell="cloud-total"[^>]*>88%<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="cloud-low">—<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="cloud-mid">—<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="cloud-high">—<\/td>/);
    expect(html).not.toMatch(/data-professional-hourly-cell="cloud-low"[^>]*>(88|42)%<\/td>/);
    expect(html).not.toMatch(/data-professional-hourly-cell="cloud-mid"[^>]*>(88|42)%<\/td>/);
    expect(html).not.toMatch(/data-professional-hourly-cell="cloud-high"[^>]*>(88|42)%<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="dew-point">—<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="dew-point-spread">—<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="visibility">—<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="wind-speed">—<\/td>/);
    expect(html).toMatch(/data-professional-hourly-cell="wind-direction">—<\/td>/);
    expect(html).toContain("0 mm / —");
    expect(html).toContain("当前仅有总云量，缺少低/中/高云分层");
    expect(html).toContain("不使用总云量回填");
  });

  it("shows the compact cloud-layer coverage note in the professional table", () => {
    const result = resultWithProfessionalHourlyData({
      professionalHourlyDataTimeBasis: {
        startTime: "2026-05-20T00:00:00+08:00",
        endTime: "2026-05-20T15:00:00+08:00",
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        temperatureBasis: "terrain_adjusted",
        temperatureBasisNoteZh: "温度口径：机位海拔修正后",
        cloudLayerBasis: "explicit_layers",
        cloudLayerBasisNoteZh: "分层云量覆盖较完整",
        partialData: false,
        fieldCoverageSummary: {
          totalHours: 15,
          totalCloudCoverage: 15,
          cloudLowCoverage: 15,
          cloudMidCoverage: 15,
          cloudHighCoverage: 15,
          temperatureCoverage: 15,
          terrainAdjustedTemperatureCoverage: 15,
          dewPointCoverage: 15,
          dewPointSpreadCoverage: 15,
          humidityCoverage: 15,
          precipitationAmountCoverage: 15,
          precipitationProbabilityCoverage: 15,
          visibilityCoverage: 15,
          windSpeedCoverage: 15,
          windDirectionCoverage: 15,
          weatherCodeCoverage: 15,
        },
        providerCoverageSummary: [],
        selectedPrimaryCloudLayerSource: "open_meteo_icon",
        fallbackSourcesUsed: [],
        missingFieldSummary: [],
        userFacingCoverageNoteZh:
          "分层云量覆盖较完整，覆盖率：低云 15/15，中云 15/15，高云 15/15。",
        professionalCoverageNoteZh:
          "分层云量覆盖较完整，覆盖率：低云 15/15，中云 15/15，高云 15/15；可用于复核云海、白墙和开口风险。",
      },
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );

    expect(html).toContain("cloud-layer-coverage-note");
    expect(html).toContain("低云 15/15");
    expect(html).not.toContain("open_meteo_icon");
  });

  it("shows raw grid temperature basis and review signal when layer data is insufficient", () => {
    const hourly = professionalHourlyDataForTest({
      cloudSeaSignal: "需复核",
      cloudSeaSignalLevel: "review",
      cloudTotalPercent: 96,
      cloudHighPercent: null,
      cloudMidPercent: null,
      cloudLowPercent: null,
      cloudLayerBasis: "total_only",
      rawTemperatureC: 27,
      terrainAdjustedTemperatureC: null,
      displayedTemperatureC: 27,
      temperatureBasis: "raw_grid",
      temperatureAdjustmentC: null,
      temperatureBasisNoteZh: "原始格点温度，未做机位海拔修正。",
      relativeHumidityPercent: 100,
      dewPointC: 26,
      dewPointSpreadC: 1,
    });
    const result = resultWithProfessionalHourlyData({
      professionalHourlyData: hourly,
      professionalHourlyDataTimeBasis: {
        startTime: "2026-05-20T00:00:00+08:00",
        endTime: "2026-05-20T15:00:00+08:00",
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        temperatureBasis: "raw_grid",
        temperatureBasisNoteZh: "温度口径：原始格点，未做机位修正",
        cloudLayerBasis: "total_only",
        cloudLayerBasisNoteZh: "云量口径：仅总云量，缺少低/中/高云分层",
        partialData: false,
      },
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );

    expect(html).toContain("温度口径");
    expect(html).toContain("原始格点");
    expect(html).toContain("云量口径");
    expect(html).toContain("仅总云量，缺少低/中/高云分层");
    expect(html).toContain("原始格点气温 °C");
    expect(html).toContain("需复核");
    expect(html).not.toContain("白墙风险</span>");
  });

  it("downgrades cloud sea UI confidence when professional cloud layers are total-only", () => {
    const hourly = professionalHourlyDataForTest({
      cloudSeaSignal: "可拍窗口",
      cloudSeaSignalLevel: "positive",
      cloudTotalPercent: 96,
      cloudHighPercent: null,
      cloudMidPercent: null,
      cloudLowPercent: null,
      cloudLayerBasis: "total_only",
      missingFields: ["cloudHigh", "cloudMid", "cloudLow"],
    });
    const result = resultWithProfessionalHourlyData({
      professionalHourlyData: hourly,
      professionalHourlyDataTimeBasis: {
        startTime: "2026-05-20T00:00:00+08:00",
        endTime: "2026-05-20T15:00:00+08:00",
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        temperatureBasis: "terrain_adjusted",
        temperatureBasisNoteZh: "温度口径：机位海拔修正后",
        cloudLayerBasis: "total_only",
        cloudLayerBasisNoteZh: "云量口径：仅总云量，缺少低/中/高云分层",
        partialData: false,
      },
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );
    const professionalSection = sectionBetween(
      html,
      "CloudSeaProfessionalHourlyData",
      "CloudSeaDailyTrend",
    );

    expect(viewModel.cloudLayerCompleteness).toMatchObject({
      cloudLayerBasis: "total_only",
      layerCompletenessLevel: "missing",
      shouldPreferNeedsReviewSignal: true,
    });
    expect(viewModel.hero.confidenceLabel).toBe("低（云量口径需复核）");
    expect(viewModel.reasoningItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "云量口径一致性",
          value: "仅总云量",
        }),
      ]),
    );
    expect(viewModel.dailyTrend.some((item) => item.layerCompletenessNote)).toBe(true);
    expect(viewModel.cloudSeaWindows.some((item) => item.layerCompletenessNote)).toBe(true);
    expect(html).toContain("云量口径一致性");
    expect(html).toContain("低云分层缺失，不能强推云海");
    expect(html).toContain("当日仅总云量，低云分层缺失，不能强推云海");
    expect(professionalSection).toMatch(/data-professional-hourly-cell="signal"[\s\S]*?需复核/);
    expect(professionalSection).not.toContain("可拍窗口</span>");
    expect(html).not.toContain("查看全部小时查看全部小时");
  });

  it("does not render the professional hourly table without a valid time basis", () => {
    const result = resultWithProfessionalHourlyData({
      professionalHourlyDataTimeBasis: undefined,
    });
    const viewModel = buildCloudSeaForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result,
        viewModel,
      }),
    );

    expect(html).not.toContain("CloudSeaProfessionalHourlyData");
    expect(html).not.toContain('data-testid="professional-hourly-data"');
    expect(html).toContain("CloudSeaHeroConclusion");
    expect(html).toContain("CloudSeaCoreMetrics");
    expect(html).toContain("CloudSeaWindowCards");
  });

  it("does not prioritize astro or Milky Way modules in the specialized cloud sea model", () => {
    const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));
    const primaryModuleKeys = viewModel.coreCards.map((card) => card.moduleKey);
    const windowLabels = viewModel.cloudSeaWindows.map((window) => window.label).join(" ");

    expect(primaryModuleKeys).not.toContain("stars");
    expect(primaryModuleKeys).not.toContain("milkyWay");
    expect(windowLabels).not.toContain("银河");
    expect(viewModel.weatherEvidence.map((item) => item.label)).not.toContain("月相");
  });

  it("does not use Cloud Sea windows before the professional forecast anchor in cards or action plan", () => {
    const result = {
      ...resultForTarget("cloud_sea"),
      forecastStart: "2026-05-20T09:00:00+08:00",
      generatedAt: "2026-05-20T08:28:00+08:00",
      professionalHourlyDataTimeBasis: {
        startTime: "2026-05-20T09:00:00+08:00",
        endTime: "2026-05-21T08:00:00+08:00",
        stepMinutes: 60,
        timezone: "Asia/Shanghai",
        generatedAtLocal: "2026-05-20T08:28:00+08:00",
        anchorStartLocal: "2026-05-20T09:00:00+08:00",
        anchorEndLocal: "2026-05-21T08:00:00+08:00",
        requestedHours: 24,
        displayLabel: "未来24小时",
        isFutureOnly: true,
        anchorRule: "future_hour_ceil_to_next_hour",
        temperatureBasis: "terrain_adjusted",
        temperatureBasisNoteZh: "test",
        cloudLayerBasis: "explicit_layers",
        cloudLayerBasisNoteZh: "test",
        partialData: false,
      },
    } satisfies ForecastCalculationResult;
    const viewModel = buildCloudSeaForecastViewModel(result);
    const actionText = viewModel.actionPlan.map((item) => `${item.value} ${item.detail}`).join(" ");

    expect(actionText).not.toContain("2026年5月20日 03:30");
    expect(actionText).not.toContain("2026年5月20日 05:00");
    expect(actionText).not.toContain("2026年5月20日 07:00");
  });

  it("shows multiple daily cloud sea entries for a 7d cloud sea result", () => {
    const sevenDayResult: ForecastCalculationResult = {
      ...resultForTarget("cloud_sea"),
      horizon: "7d",
      forecastEnd: "2026-05-27T00:00:00+08:00",
      targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
      calendarBasis: {
        ...baseResult.calendarBasis,
        forecastEnd: "2026-05-27T00:00:00+08:00",
        forecastEndLabel: "2026年5月27日 00:00",
        forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月27日 00:00",
        targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
        targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四", "2026年5月22日 星期五"],
        horizonHours: 168,
      },
      dailySummaries: [
        ...baseResult.dailySummaries.map((summary) => ({
          ...summary,
          target: "cloud_sea" as const,
        })),
        {
          date: "2026-05-22",
          dateLabelZh: "2026年5月22日 星期五",
          lunarDateText: "四月初六",
          score: 74,
          recommendationLabel: "值得等待",
          target: "cloud_sea",
          keyWindows: [],
          riskFlags: [],
          shortAdvice: "清晨云海仍可等待。",
        },
      ],
      targetDailyBreakdown: [
        ...baseResult.targetDailyBreakdown,
        {
          date: "2026-05-22",
          cloudSea: {
            label: "清晨云海机会",
            score: 74,
            detail: "第三天清晨湿度和地形仍支持等待。",
          },
          whiteoutRisk: {
            label: "白墙风险",
            score: 50,
            detail: "白墙风险中等。",
          },
          transparency: {
            label: "通透度",
            score: 68,
            detail: "能见度可用。",
          },
          terrainSummary: "演示地形数据显示山顶与周边谷地高差明显。",
          weatherSummary: "清晨低云可关注",
        },
      ],
      cloudSeaAnalysis: {
        ...baseResult.cloudSeaAnalysis,
        bestCloudSeaWindows: [
          ...baseResult.cloudSeaAnalysis.bestCloudSeaWindows,
          {
            label: "清晨云海窗口 05:00 - 07:00",
            date: "2026-05-22",
            startTime: "2026-05-22T05:00:00+08:00",
            endTime: "2026-05-22T07:00:00+08:00",
            score: 68,
            target: "cloud_sea",
            phase: "observation",
            noteZh: "第三天清晨仍可观察云海。",
            riskTag: "白墙风险中",
          },
        ],
        dailyCloudSea: [
          ...baseResult.cloudSeaAnalysis.dailyCloudSea,
          {
            date: "2026-05-22",
            dateLabelZh: "2026年5月22日 星期五",
            opportunityScore: 74,
            whiteoutRiskScore: 50,
            travelScore: 68,
            bestWindow: {
              label: "清晨云海窗口 05:00 - 07:00",
              date: "2026-05-22",
              startTime: "2026-05-22T05:00:00+08:00",
              endTime: "2026-05-22T07:00:00+08:00",
              score: 68,
              target: "cloud_sea",
              phase: "observation",
              noteZh: "第三天清晨仍可观察云海。",
              riskTag: "白墙风险中",
            },
            recommendationLabel: "值得等待",
            keyReason: "第三天清晨湿度和地形仍支持等待。",
            riskNote: "白墙风险中等。",
          },
        ],
      },
    };

    const viewModel = buildCloudSeaForecastViewModel(sevenDayResult);

    expect(viewModel.dailyTrend).toHaveLength(3);
    expect(viewModel.dailyTrend.map((item) => item.date)).toContain("2026-05-22");
  });

  it("shows a cloud sea confidence warning when low cloud data is missing", () => {
    const viewModel = buildCloudSeaForecastViewModel({
      ...resultForTarget("cloud_sea"),
      weatherDataMode: "fixture",
      weatherProviderCode: "qweather",
      weatherProviderLabelZh: "和风天气样例数据",
      dataSourceLabel: "和风天气样例数据",
      weatherNoticeZh: "天气数据：和风天气样例数据",
      weatherMissingFields: ["cloudLow"],
    });

    expect(viewModel.dataNotice).toContain("当前天气源缺少低云分层数据，云海判断置信度会降低。");
    expect(viewModel.dataCaution).toBe("云层分层不足，需临近复核");
    expect(
      viewModel.weatherEvidence.some(
        (item) =>
          item.label === "低云" &&
          item.confidenceNote === "当前天气源缺少低云分层数据，云海判断置信度会降低。",
      ),
    ).toBe(true);
  });

  it("does not call external APIs while shaping the cloud sea view model", () => {
    const fetchBackup = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      throw new Error("external call blocked");
    }) as typeof fetch;

    try {
      const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));
      expect(viewModel.coreCards.length).toBe(4);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = fetchBackup;
    }
  });

  it("prioritizes sunrise, sunset, and twilight on the glow view", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("glow"), "glow");

    expect(viewModel.glow).toBeDefined();
    expect(viewModel.primaryCards.map((card) => card.label).slice(0, 4)).toEqual([
      "朝霞机会",
      "晚霞机会",
      "最佳霞光窗口",
      "低云遮挡风险",
    ]);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "朝霞判断依据",
        "晚霞判断依据",
        "日出方向遮挡",
        "日落方向遮挡",
        "地形遮挡提示",
        "晨昏时间",
      ]),
    );
    expect(viewModel.bestWindows.every((window) => window.target === "glow")).toBe(true);
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "sunriseGlow",
      "sunsetGlow",
      "transparency",
    ]);
  });

  it("builds a specialized glow view model with separate sunrise, sunset, cloud, visibility, terrain, and backup modules", () => {
    const viewModel = buildGlowForecastViewModel(resultWithGlowHourlyRange("24h", 24));

    expect(viewModel.coreCards.map((card) => card.label)).toEqual([
      "朝霞机会",
      "晚霞机会",
      "最佳霞光窗口",
      "低云遮挡风险",
      "气溶胶与通透度",
      "地形遮挡",
    ]);
    expect(viewModel.dailyTrend.map((item) => item.date)).toEqual(["2026-05-20", "2026-05-21"]);
    expect(viewModel.dailyTrend[0]?.cloudLayerSummaryLabel).toContain("色彩载体");
    expect(viewModel.dailyTrend[0]?.aerosolTransparencyLabel).toContain("气溶胶");
    expect(viewModel.professionalHourlyData.rows.length).toBeGreaterThan(0);
    expect(viewModel.professionalHourlyData.rowAnnotations?.length).toBeGreaterThan(0);
    expect(viewModel.sunWindowCards.length).toBeGreaterThan(0);
    expect(viewModel.aerosolCard.stateLabel).toBe("散射条件较有利");
    expect(viewModel.terrainObstructionCards.length).toBeGreaterThan(0);
    expect(viewModel.aerosolEvidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["AOD 550nm", "大气结论"]),
    );
    expect(viewModel.cloudLayerEvidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["总云量", "低云", "中云", "高云"]),
    );
    expect(viewModel.visibilityEvidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["能见度", "湿度"]),
    );
    expect(viewModel.terrainObstructionEvidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["日出地平遮挡", "日落地平遮挡"]),
    );
    expect(viewModel.travelRecommendations.join("")).toContain("日出前 40-60 分钟到达机位");
    expect(viewModel.backupPlans.map((plan) => plan.condition)).toEqual(
      expect.arrayContaining(["无霞但通透", "低云遮挡"]),
    );
  });

  it("renders the glow result without the entry-page popular spots placeholder", () => {
    const result = resultWithGlowHourlyRange("24h", 24);
    const viewModel = buildGlowForecastViewModel(result);
    const fetchMock = vi.fn(() => {
      throw new Error("glow result render should not call external APIs");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const html = renderToStaticMarkup(
        React.createElement(GlowResultPage, {
          query: queryForTarget("glow"),
          result,
          viewModel,
        }),
      );

      expect(html).not.toContain("热门朝霞晚霞机位");
      expect(html).not.toContain("热门朝霞机位");
      expect(html).not.toContain("热门晚霞机位");
      expect(html).toContain("朝霞机会");
      expect(html).toContain("晚霞机会");
      expect(html).toContain("霞光拍摄窗口");
      expect(html).toContain("专业小时数据");
      expect(html).toContain("专业参考");
      expect(html).toContain("出发建议");
      expect(html).toContain("判断依据、风险与行动");
      expect(html).toContain("低云遮挡风险");
      expect(html).toContain("色彩载体");
      expect(html).toContain("天气数据：演示天气数据");
      expect(html).toContain("地形数据：演示数据");
      expect(html).toContain("天文数据：本地算法计算");
      expect(html).toContain('data-glow-section="GlowAiInterpretation"');
      expect(html).toContain('data-ai-interpretation-target="glow"');
      expect(html).toContain("生成智能解读");
      expect(html).toContain("GlowResultPage");
      expect(html).toContain("GlowCoreDecision");
      expect(html).toContain("GlowDailyTrend");
      expect(html).toContain("GlowDecisionGrid");
      expectMarkersInOrder(html, ["GlowFinalDecisionSection", "GlowAiInterpretation"]);
      expect(html).toContain("ProfessionalHourlyCloudSection");
      expect(html).toContain('data-professional-hourly-shared="true"');
      expect(html).toContain('data-professional-hourly-target="glow"');
      expect(html).toContain('data-cloud-sea-professional-table-scroll="true"');
      expect(html).not.toContain("逐小时云层与霞光条件");
      expect(html).not.toContain("共享小时模型");
      expect(html).not.toContain('data-professional-hourly-card-layout="true"');
      expect(html).not.toContain('data-glow-hourly-cloud-card="');
      expect(html).not.toContain("光线窗口");
      expect(html).not.toContain("云层结构");
      expect(html).not.toContain("能见度与通透度");
      expect(html).not.toContain("地形遮挡参考");
      expect(html).not.toContain("数据状态 / 数据缺失说明");
      expect(html).not.toContain("GlowProfessionalHourlyCloudCard");
      expect(html).not.toContain("<aside");
      expect(html).not.toContain("SideRail");
      expect(html).not.toContain("min-[1024px]:col-span-4");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses the exact shared intelligent interpretation component for cloud-sea and glow", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./forecast-result-client.tsx", import.meta.url)),
      "utf8",
    );
    const sharedComponentSource = source.slice(
      source.indexOf("export function ForecastAiInterpretationSection"),
      source.indexOf("export function ForecastResultClient"),
    );
    const hookSource = source.slice(
      source.indexOf("function useForecastAiInterpretation"),
      source.indexOf("export function ForecastAiInterpretationSection"),
    );
    const cloudSeaPageSource = source.slice(
      source.indexOf("export function CloudSeaResultPage"),
      source.indexOf("export function GlowResultPage"),
    );
    const glowPageSource = source.slice(
      source.indexOf("export function GlowResultPage"),
      source.indexOf("export function AstroResultPage"),
    );
    const sharedSectionCall = "<ForecastAiInterpretationSection query={query} result={result} />";

    expect(sharedComponentSource).toContain("AiExplanationPanel");
    expect(hookSource).toContain("/forecast/ai-explain");
    expect(hookSource).toContain("normalizeAiExplainResponse");
    expect(cloudSeaPageSource).toContain(sharedSectionCall);
    expect(glowPageSource).toContain(sharedSectionCall);
    expect(cloudSeaPageSource).toContain('data-cloud-sea-section="CloudSeaAiInterpretation"');
    expect(glowPageSource).toContain('data-glow-section="GlowAiInterpretation"');
    expect(glowPageSource).not.toContain("GlowAiInterpretationSection");
    expect(glowPageSource).not.toContain("useGlowAiInterpretation");
    expect(glowPageSource).not.toContain("/forecast/glow-ai");
  });

  it("uses the same shared professional hourly section for cloud-sea and glow", () => {
    const cloudSeaResult = resultWithProfessionalHourlyData();
    const cloudSeaViewModel = buildCloudSeaForecastViewModel(cloudSeaResult);
    const cloudSeaHtml = renderToStaticMarkup(
      React.createElement(CloudSeaResultPage, {
        query: queryForTarget("cloud_sea"),
        result: cloudSeaResult,
        viewModel: cloudSeaViewModel,
      }),
    );
    const glowResult = resultWithGlowHourlyRange("24h", 24);
    const glowViewModel = buildGlowForecastViewModel(glowResult);
    const glowHtml = renderToStaticMarkup(
      React.createElement(GlowResultPage, {
        query: { ...queryForTarget("glow"), horizon: "24h" },
        result: glowResult,
        viewModel: glowViewModel,
      }),
    );

    expect(cloudSeaHtml).toContain('data-professional-hourly-shared="true"');
    expect(cloudSeaHtml).toContain('data-professional-hourly-target="cloud_sea"');
    expect(cloudSeaHtml).toContain('data-cloud-sea-professional-table-scroll="true"');
    expect(glowHtml).toContain('data-professional-hourly-shared="true"');
    expect(glowHtml).toContain('data-professional-hourly-target="glow"');
    expect(glowHtml).toContain('data-cloud-sea-professional-table-scroll="true"');
    expect(glowHtml).not.toContain('data-professional-hourly-card-layout="true"');
    expect(glowHtml).not.toContain("GlowProfessionalHourlyCloudCard");
  });

  it("renders the full 24h glow hourly range in the shared professional table", () => {
    const result = resultWithGlowHourlyRange("24h", 24);
    const viewModel = buildGlowForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(GlowResultPage, {
        query: { ...queryForTarget("glow"), horizon: "24h" },
        result,
        viewModel,
      }),
    );

    expect(viewModel.professionalHourlyData.rows).toHaveLength(24);
    expect(countOccurrences(html, 'data-professional-hourly-row="')).toBe(24);
    expect(html).toContain('data-professional-hourly-row="2026-05-20T00:00:00+08:00"');
    expect(html).toContain('data-professional-hourly-row="2026-05-20T23:00:00+08:00"');
    expect(html).toContain("总云量 %");
    expect(html).toContain("高云量 %");
    expect(html).toContain("中云量 %");
    expect(html).toContain("低云量 %");
    expect(html).toContain("88%");
    expect(html).toContain("82%");
    expect(html).toContain("46%");
    expect(html).toContain("28%");
  });

  it.each([
    ["48h", 48, ["2026-05-20T00:00:00+08:00", "2026-05-21T23:00:00+08:00"]],
    ["72h", 72, ["2026-05-20T00:00:00+08:00", "2026-05-22T23:00:00+08:00"]],
    ["7d", 168, ["2026-05-20T00:00:00+08:00", "2026-05-26T23:00:00+08:00"]],
  ] as const)(
    "renders the full %s glow hourly range in the shared professional table",
    (horizon, hours, rowTimes) => {
      const result = resultWithGlowHourlyRange(horizon, hours);
      const viewModel = buildGlowForecastViewModel(result);
      const html = renderToStaticMarkup(
        React.createElement(GlowResultPage, {
          query: { ...queryForTarget("glow"), horizon },
          result,
          viewModel,
        }),
      );

      expect(viewModel.professionalHourlyData.rows).toHaveLength(hours);
      expect(countOccurrences(html, 'data-professional-hourly-row="')).toBe(hours);
      for (const rowTime of rowTimes) {
        expect(html).toContain(`data-professional-hourly-row="${rowTime}"`);
      }
      expect(html).not.toContain("data-professional-hourly-date-group");
    },
  );

  it("highlights sunrise and sunset glow windows without a duplicate hourly section", () => {
    const result = resultWithGlowHourlyRange("24h", 24);
    const viewModel = buildGlowForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(GlowResultPage, {
        query: { ...queryForTarget("glow"), horizon: "24h" },
        result,
        viewModel,
      }),
    );

    expect(html).toContain("朝霞准备窗口");
    expect(html).toContain("朝霞核心窗口");
    expect(html).toContain("晚霞准备窗口");
    expect(html).toContain("晚霞核心窗口");
    expect(html).toContain("普通时段");
    expect(countOccurrences(html, 'data-professional-hourly-shared="true"')).toBe(1);
    expect(countOccurrences(html, 'data-cloud-sea-professional-table-scroll="true"')).toBe(1);
    expect(html).not.toContain("非核心霞光窗口");
    expect(html).not.toContain('data-professional-hourly-card-layout="true"');
    expect(html).not.toContain("GlowProfessionalHourlyCloudCards");
  });

  it("keeps unavailable glow aerosol and obstruction data compact without fake values", () => {
    const base = resultWithGlowHourlyRange("24h", 24);
    const result: ForecastCalculationResult = {
      ...base,
      glowAnalysis: {
        ...base.glowAnalysis,
        aerosolAssessment: {
          ...base.glowAnalysis.aerosolAssessment,
          availability: "unavailable",
          confidence: "low",
          state: "unavailable",
          stateLabelZh: "暂无可靠数据",
          implicationZh: "当前气溶胶资料暂缺。",
          noteZh: "不使用缺失值推断通透度。",
          aerosolScore: undefined,
          aerosolOpticalDepth550: undefined,
          pm25: undefined,
          pm10: undefined,
          dust: undefined,
          visibilityKm: undefined,
          validTime: undefined,
          sourceResolution: undefined,
        },
        aerosolEvidence: [],
        terrainObstructionAssessments: [],
        terrainObstructionEvidence: [],
      },
    };
    const viewModel = buildGlowForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(GlowResultPage, {
        query: { ...queryForTarget("glow"), horizon: "24h" },
        result,
        viewModel,
      }),
    );

    expect(html).toContain("暂无可靠数据");
    expect(html).toContain("暂缺分项");
    expect(html).toContain("AOD 暂缺");
    expect(html).toContain("方向性地形剖面暂缺");
    expect(html).not.toContain("AOD 0.000");
    expect(html).not.toContain("PM2.5 0");
    expect(html).not.toContain("min-h-");
  });

  it("labels glow window list as recommended, watchable, backup, and not recommended", () => {
    const base = resultForTarget("glow");
    const result: ForecastCalculationResult = {
      ...base,
      glowAnalysis: {
        ...base.glowAnalysis,
        bestGlowWindows: [
          ...base.glowAnalysis.bestGlowWindows,
          {
            type: "morning_warm_light",
            labelZh: "朝霞备选窗口",
            date: "2026-05-21",
            start: "2026-05-21T04:40:00+08:00",
            end: "2026-05-21T05:20:00+08:00",
            score: 48,
            riskTags: ["色彩云偏弱"],
            noteZh: "中高云不足，朝霞仅作备选。",
          },
        ],
        watchableGlowWindows: [
          {
            type: "afterglow",
            labelZh: "日落后余晖",
            date: "2026-05-20",
            start: "2026-05-20T19:02:00+08:00",
            end: "2026-05-20T19:28:00+08:00",
            score: 62,
            lowCloudObstructionRisk: 62,
            riskTags: ["低云偏多"],
            noteZh: "低云偏多，需现场复核。",
          },
        ],
        notRecommendedGlowWindows: [
          {
            type: "sunrise",
            labelZh: "朝霞",
            date: "2026-05-20",
            start: "2026-05-20T04:30:00+08:00",
            end: "2026-05-20T05:30:00+08:00",
            score: 28,
            rainOverlapsWindow: true,
            lowCloudObstructionRisk: 82,
            precipitationDisruptionRisk: 78,
            riskTags: ["低云遮挡", "降水打断"],
            noteZh: "低云遮挡和降水风险较高。",
          },
        ],
      },
    };
    const viewModel = buildGlowForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(GlowResultPage, {
        query: queryForTarget("glow"),
        result,
        viewModel,
      }),
    );

    expect(html).toContain("推荐拍摄");
    expect(html).toContain("可观察");
    expect(html).toContain("仅作备选");
    expect(html).toContain("不建议");
    expect(html).toContain("日落后余晖");
    expect(html).toContain("低云遮挡和降水风险较高");
  });

  it("shows multiple daily glow entries for a 7d glow result", () => {
    const sevenDayResult: ForecastCalculationResult = {
      ...resultForTarget("glow"),
      horizon: "7d",
      forecastEnd: "2026-05-27T00:00:00+08:00",
      targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
      calendarBasis: {
        ...baseResult.calendarBasis,
        forecastEnd: "2026-05-27T00:00:00+08:00",
        forecastEndLabel: "2026年5月27日 00:00",
        forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月27日 00:00",
        targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
        targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四", "2026年5月22日 星期五"],
        horizonHours: 168,
      },
      glowAnalysis: {
        ...baseResult.glowAnalysis,
        dailyGlow: [
          ...baseResult.glowAnalysis.dailyGlow,
          {
            date: "2026-05-22",
            dateLabelZh: "2026年5月22日 星期五",
            sunriseScore: 68,
            sunsetScore: 77,
            bestWindow: {
              type: "sunset",
              labelZh: "晚霞峰值窗口",
              date: "2026-05-22",
              start: "2026-05-22T17:58:00+08:00",
              end: "2026-05-22T19:43:00+08:00",
              score: 77,
              riskTags: ["风险可控"],
              noteZh: "晚霞窗口中高云和通透度较可用，适合提前到位观察色彩发展。",
            },
            bestTarget: "sunset",
            recommendationLabel: "值得等待",
            keyReason: "第三天晚霞信号仍可等待。",
            riskNote: "风险可控",
          },
        ],
      },
    };

    const viewModel = buildGlowForecastViewModel(sevenDayResult);

    expect(viewModel.dailyTrend).toHaveLength(3);
    expect(viewModel.dailyTrend.map((item) => item.date)).toContain("2026-05-22");
  });

  it("prioritizes moon, astronomical night, Milky Way, and star modules on the astro view", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("astro"), "astro");

    expect(viewModel.astro).toBeDefined();
    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "天文窗口",
      "星空指数",
      "银河指数",
      "月光影响",
      "云量阻挡",
      "露水风险",
      "银河窗口判断",
    ]);
    expect(viewModel.detailSections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "每晚观星条件",
        "月相 / 月亮照明",
        "天文黑夜",
        "银河窗口",
        "银河方向遮挡",
        "地平线遮挡提示",
        "山体遮挡风险",
      ]),
    );
    expect(viewModel.astro?.dailyTrend).toHaveLength(2);
    expect(viewModel.astro?.recommendedMilkyWayWindows).toHaveLength(2);
    expect(viewModel.astro?.moonlessNightWindows[0]?.timeRangeLabel).toBe(
      "2026年5月20日 周三 22:35 - 5月21日 周四 03:48",
    );
    const moonSection = viewModel.detailSections.find((section) => section.key === "moon-phase");
    expect(moonSection?.items).toHaveLength(2);
    expect(JSON.stringify(moonSection)).toContain("农历日期");
    expect(JSON.stringify(moonSection)).toContain("四月初五");
    expect(JSON.stringify(moonSection)).toContain(
      "月相基于本地天文算法计算；农历日期基于本地历法库生成",
    );
    expect(viewModel.scoreCards.map((card) => card.key)).toEqual([
      "stars",
      "milkyWay",
      "transparency",
    ]);
    expect(viewModel.bestWindows[0]?.moduleKey).toBe("astronomicalNight");
    expect(viewModel.bestWindows.map((window) => window.moduleKey)).toContain("milkyWay");
    expect(viewModel.bestWindows.map((window) => window.moduleKey)).not.toContain("cloudSea");
    expect(JSON.stringify(viewModel.astro)).not.toMatch(
      /QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i,
    );
    expect(viewModel.windowGroups.length).toBeGreaterThan(1);
  });

  it("builds and renders a dedicated astro result page without popular spots or side rails", () => {
    const result = resultForTarget("astro");
    const viewModel = buildAstroForecastViewModel(result);
    const fetchMock = vi.fn(() => {
      throw new Error("astro result render should not call external APIs");
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const html = renderToStaticMarkup(
        React.createElement(AstroResultPage, {
          query: queryForTarget("astro"),
          result,
          viewModel,
        }),
      );

      expect(html).not.toContain("热门星空银河机位");
      expect(html).not.toContain("热门星空机位");
      expect(html).not.toContain("热门银河机位");
      expect(html).toContain("星空银河判断");
      expect(html).toContain("星空指数");
      expect(html).toContain("银河指数");
      expect(html).toContain("月光影响");
      expect(html).toContain("天文黑夜与无月黑夜");
      expect(html).toContain("推荐银河窗口");
      expect(html).toContain("月相与月光");
      expect(html).toContain("月出月落");
      expect(html).toContain("云量与通透");
      expect(html).toContain("光污染与地形遮挡");
      expect(html).toContain("拍摄建议");
      expect(html).toContain("备选拍摄方案");
      expect(html).toContain("数据状态 / 数据缺失说明");
      expect(html).toContain("AstroResultPage");
      expect(html).toContain("AstroCoreDecision");
      expect(html).toContain("AstroDailyTrend");
      expect(html).toContain("AstroResultLayout");
      expect(html).not.toContain("<aside");
      expect(html).not.toContain("SideRail");
      expect(html).not.toContain("min-[1024px]:col-span-4");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("renders dedicated astro cloud, moon, dew, and blocked Milky Way states", () => {
    const result = resultWithBlockedAstro("astro");
    const viewModel = buildAstroForecastViewModel(result);
    const html = renderToStaticMarkup(
      React.createElement(AstroResultPage, {
        query: queryForTarget("astro"),
        result,
        viewModel,
      }),
    );

    expect(html).toContain("核心判断");
    expect(html).toContain("每晚观星条件");
    expect(html).toContain("月相与月光");
    expect(html).toContain("云量与通透");
    expect(html).toContain("拍摄建议");
    expect(html).toContain("云量阻挡");
    expect(html).toContain("月光影响");
    expect(html).toContain("露水风险");
    expect(html).toContain("天文窗口存在，但低云偏多、降水干扰不支持拍摄");
    expect(html).toContain("银河窗口判断");
    expect(html).not.toMatch(/QWeather|Open-Meteo|meteoblue|Amap|和风|高德/i);
  });

  it("shows multiple nightly astro entries for a 7d astro result", () => {
    const sevenDayResult: ForecastCalculationResult = {
      ...resultForTarget("astro"),
      horizon: "7d",
      forecastEnd: "2026-05-27T00:00:00+08:00",
      targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
      calendarBasis: {
        ...baseResult.calendarBasis,
        forecastEnd: "2026-05-27T00:00:00+08:00",
        forecastEndLabel: "2026年5月27日 00:00",
        forecastRangeLabel: "2026年5月20日 00:00 至 2026年5月27日 00:00",
        targetDates: ["2026-05-20", "2026-05-21", "2026-05-22"],
        targetDateLabels: ["2026年5月20日 星期三", "2026年5月21日 星期四", "2026年5月22日 星期五"],
        horizonHours: 168,
      },
      astroAnalysis: {
        ...baseResult.astroAnalysis,
        dailyAstro: [
          ...baseResult.astroAnalysis.dailyAstro,
          {
            date: "2026-05-22",
            dateLabelZh: "2026年5月22日 星期五",
            lunarDateText: "四月初六",
            starsScore: 64,
            milkyWayScore: 66,
            astroConditionScore: 72,
            astroPracticalScore: 66,
            ...dailyAstroFieldsForTest(
              astroAssessmentForTest({
                astronomicalWindowScore: 72,
                skyConditionScore: 68,
                milkyWayGeometryScore: 66,
                practicalAstroScore: 66,
              }),
            ),
            astronomicalWindowAvailable: true,
            astroShootable: true,
            weatherBlockers: [],
            moonImpactLevel: "medium",
            recommendationLabel: "值得等待",
            keyReason: "第三晚仍有可等待的夜间窗口。",
            riskNote: "月光中等",
          },
        ],
      },
    };

    const viewModel = buildAstroForecastViewModel(sevenDayResult);

    expect(viewModel.dailyTrend).toHaveLength(3);
    expect(viewModel.dailyTrend.map((item) => item.date)).toContain("2026-05-22");
  });

  it("keeps data-source honesty in the shaped notice", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("astro"), "astro");

    expect(viewModel.dataNotice).toContain("天气数据：演示天气数据");
    expect(viewModel.dataNotice).toContain("地形信息当前使用演示地形数据");
    expect(viewModel.dataNotice).toContain("正式海拔与 DEM 数据接入后");
    expect(viewModel.dataNotice).toContain("天文数据：本地天文服务计算");
    expect(viewModel.dataNotice).toContain("当前结果基于演示天气数据生成");
  });

  it("uses provider-neutral weather status when a real weather bundle is used", () => {
    const viewModel = buildForecastResultViewModel(
      {
        ...resultForTarget("glow"),
        weatherDataMode: "real",
        weatherProviderCode: "qweather",
        weatherProviderLabelZh: "和风天气",
        dataSourceLabel: "和风天气",
        weatherNoticeZh: "天气数据：和风天气",
      },
      "glow",
    );

    expect(viewModel.dataNotice).toContain("天气数据：已启用真实天气数据");
    expect(viewModel.dataNotice).not.toContain("和风天气");
    expect(viewModel.dataNotice).not.toContain("演示天气数据生成");
  });

  it("shows a compact note when cloud layer fields are missing", () => {
    const viewModel = buildForecastResultViewModel(
      {
        ...resultForTarget("glow"),
        weatherDataMode: "fixture",
        weatherProviderCode: "qweather",
        weatherProviderLabelZh: "和风天气样例数据",
        dataSourceLabel: "和风天气样例数据",
        weatherNoticeZh: "天气数据：和风天气样例数据",
        weatherMissingFields: ["cloudLow", "cloudMid", "cloudHigh"],
      },
      "glow",
    );

    expect(viewModel.dataNotice).toContain("天气数据：样例天气数据");
    expect(viewModel.dataNotice).not.toContain("和风天气样例数据");
    expect(viewModel.dataNotice).toContain(
      "当前天气源缺少低云/中云/高云分层数据，相关判断将降低置信度。",
    );
    expect(
      viewModel.detailSections.some((section) =>
        section.items.some((item) => item.detail.includes("低云/中云/高云分层数据")),
      ),
    ).toBe(true);
  });
});
