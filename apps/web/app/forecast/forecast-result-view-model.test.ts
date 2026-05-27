import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  forecastTargetLabels,
  type ForecastCalculationResult,
  type ForecastQueryInput,
  type ForecastScore,
} from "@photo-weather/shared";
import {
  ComprehensiveForecastView,
  AstroResultPage,
  CloudSeaResultPage,
  GlowResultPage,
  SourceDiagnosticsPanel,
  providerDiagnosticText,
} from "./forecast-result-client";
import {
  buildAstroForecastViewModel,
  buildCloudSeaForecastViewModel,
  buildForecastResultViewModel,
  buildGlowForecastViewModel,
} from "./forecast-result-view-model";

vi.mock("next/navigation", () => ({
  usePathname: () => "/forecast",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

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

function countOccurrences(text: string, pattern: string): number {
  return text.split(pattern).length - 1;
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

    expect(html).toContain("出行判断");
    expect(html).toContain("综合出片指数");
    expect(html.match(/综合出片指数/g)?.length).toBe(1);
    expect(html).toContain("当前与近时段天气");
    expect(html).toContain("逐日拍摄判断");
    expect(html).not.toContain("题材拆解");
    expect(html).toContain("风险提醒");
    expect(html).toContain("重点时段：2026年5月20日 05:00–07:00");
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
      terrainNoteZh: "机位海拔暂未确认，山地体感和云海判断仅作参考。",
    };
    const result: ForecastCalculationResult = {
      ...baseResult,
      keyReasons: [
        "地形参考：机位海拔暂未确认，山地体感和云海判断仅作参考，周边高差暂未计算。",
      ],
      terrainSummary: {
        ...baseResult.terrainSummary,
        ...unknownTerrain,
        dataSource: "unknown",
        dataSourceLabelZh: "海拔暂未确认",
        isMock: true,
        honestyNoteZh: "机位海拔暂未确认，山地体感和云海判断仅作参考。",
      },
      terrainAnalysis: {
        ...baseResult.terrainAnalysis,
        terrainProfile: unknownTerrain,
        dataSource: "unknown",
        dataSourceLabelZh: "海拔暂未确认",
        isMock: true,
        honestyNoteZh: "机位海拔暂未确认，山地体感和云海判断仅作参考。",
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

    expect(html).toContain("机位海拔暂未确认，山地体感和云海判断仅作参考");
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
    expect(html).toContain("当前与近时段天气（2026年5月20日 00:00–06:00）");
    expect(html).toContain("当前实况：2026年5月20日 00:00");
    expect(html).toContain("近时段参考：2026年5月20日 00:00–06:00");
    expect(html).toContain("查看云海详情");
    expect(html).toContain("查看霞光详情");
    expect(html).toContain("查看星空详情");
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
    expect(dailySection).toContain("山顶估算温度：10–18°C");
    expect(dailySection).toContain("降水：低｜风：3.4m/s｜通透：较好");
    expect(dailySection).toContain("优先关注：");
    expect(dailySection).toContain("清晨云海 2026年5月20日 05:00–07:00");
    expect(dailySection).toContain("备选观察：");
    expect(dailySection).toContain("晚霞 2026年5月20日 17:56–19:41");
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
    expect(html).toContain("山顶估算温度：10-18°C");
    expect(html).toContain("预报已接近机位海拔，未额外修正");
    expect(html).toContain("体感 7-16°C");
    expect(html).toContain("降水风险");
    expect(html).toContain("3.2 m/s 东南风");
    expect(html).toContain("18 公里");
    expect(html).not.toMatch(/(?:^|\s)(?:w|min-w)-\[(?:[1-9]\d{3,})px\]/);
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
    const windowSection = html.slice(html.indexOf('data-testid="opportunity-windows"'));
    const dailySection = html.slice(
      html.indexOf('data-testid="daily-forecast-decision"'),
      html.indexOf('data-testid="opportunity-windows"'),
    );

    expect(html).not.toContain('data-testid="subject-breakdown"');
    expect(dailySection).not.toContain("星空可拍性");
    expect(dailySection).not.toContain("银河可拍性");
    expect(dailySection).not.toContain("天文窗口存在，但低云偏多、降水干扰不支持拍摄");
    expect(dailySection).not.toContain("银河天文窗口 2026年5月");
    expect(windowSection).toContain("不建议：银河天文窗口");
    expect(windowSection).toContain("低云偏多、降水干扰，不建议专程夜拍");
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
                precipitationAmountMm: 6.8,
                rainAmountMm: 6.8,
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
    expect(dailySection).toContain("降水：高");
    expect(dailySection).toContain("降水干扰明显，优先等待雨后短暂开口。");
    expect(dailySection).not.toContain("降水主要影响日出窗口，朝霞不确定性较高");
    expect(dailySection).not.toContain("雨后若短暂开口，可转拍云雾层次和远山");
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

    expect(html).toContain("建议到达：2026年5月20日 03:30 前");
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

    expect(html).toContain("清晨云海");
    expect(html).toContain("2026年5月20日 04:08–06:08");
    expect(html).toContain("云雾变化");
    expect(html).toContain("2026年5月20日 01:00–03:00");
    expect(html).toContain("形成信号");
    expect(html).toContain("无光形成信号");
    expect(html.indexOf("2026年5月20日 04:08–06:08")).toBeLessThan(
      html.indexOf("2026年5月20日 01:00–03:00"),
    );
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

    expect(viewModel.bestWindows[0]?.moduleKey).toBe("sunsetGlow");
    expect(viewModel.bestWindows[0]?.label).toBe("日落暖光");
    expect(html).toContain("日落暖光");
    expect(html).toContain("2026年5月20日 19:01–19:28");
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
                precipitationAmountMm: 18.8,
                rainAmountMm: 18.8,
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
    expect(dailySection).toContain("降水：高");
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
        hitRate: 0.72,
        falsePositiveRate: 0.28,
        falseNegativeRate: 0.08,
        confidenceAdjustment: -0.1,
        cautionNoteZh: "历史误报偏高，本次建议谨慎参考。",
        displayNoteZh: "历史校准：该机位同类条件命中率约 72%，历史误报偏高，本次建议谨慎参考。",
      },
    };

    const viewModel = buildForecastResultViewModel(result, "general");
    const calibrationCard = viewModel.primaryCards.find(
      (card) => card.key === "historical-calibration",
    );

    expect(calibrationCard?.value).toContain("72%");
    expect(calibrationCard?.detail).toContain("历史校准");
    expect(calibrationCard?.tone).toBe("accent");
  });

  it("keeps deterministic analysis visible when the optional DeepSeek interpretation times out", () => {
    const result = resultForTarget("general");
    const viewModel = buildForecastResultViewModel(result, "general");
    const html = renderToStaticMarkup(
      React.createElement(ComprehensiveForecastView, {
        query: queryForTarget("general"),
        result,
        viewModel,
        aiStatus: "error",
        aiExplanation: null,
        aiErrorMessage: "智能解读暂时超时，确定性判断结果仍可正常参考，可稍后重试。",
        aiRetryable: true,
        onGenerateAiExplanation: vi.fn(),
      }),
    );

    expect(html).toContain("智能解读暂时超时，确定性判断结果仍可正常参考，可稍后重试。");
    expect(html).toContain("重试 DeepSeek 解读");
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

    expect(html).toContain("正在生成解读");
    expect(html).toContain("disabled");
    expect(html).toContain("综合出片指数");
  });

  it("renders structured intelligent interpretation sections and deterministic fallback label", () => {
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
            source: "deterministic_fallback",
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
    expect(html).toContain("确定性简版");
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
      weatherDataMode: "real",
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
    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "云海形成机会",
      "云海可拍机会",
      "白墙风险",
      "最佳云海窗口",
      "推荐动作",
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

  it("builds a specialized cloud sea view model with separated whiteout, terrain, weather, and travel modules", () => {
    const viewModel = buildCloudSeaForecastViewModel(resultForTarget("cloud_sea"));

    expect(viewModel.coreCards.map((card) => card.label)).toEqual([
      "云海形成机会",
      "云海可拍机会",
      "白墙风险",
      "最佳云海窗口",
      "推荐动作",
    ]);
    expect(viewModel.coreCards.find((card) => card.label === "白墙风险")?.value).toBe("中");
    expect(viewModel.cloudSeaVsWhiteout.cloudSeaDefinition).toContain("云海形成");
    expect(viewModel.cloudSeaVsWhiteout.cloudSeaDefinition).toContain("可拍云海");
    expect(viewModel.cloudSeaVsWhiteout.whiteoutDefinition).toContain("低云或雾层");
    expect(viewModel.cloudSeaVsWhiteout.whiteoutDefinition).toContain("看不见远山层次");
    expect(viewModel.terrainEvidence.items.map((item) => item.label)).toEqual(
      expect.arrayContaining(["机位海拔", "周边 1km 最低海拔", "5km 高差", "云海地形潜力"]),
    );
    expect(viewModel.weatherEvidence.map((item) => item.label)).toEqual(
      expect.arrayContaining(["湿度", "露点差", "风速", "风向", "能见度", "降水", "低云"]),
    );
    expect(viewModel.travelRecommendations.map((item) => item.situation)).toEqual([
      "已在山上",
      "周边短途",
      "远途专程",
    ]);
    expect(viewModel.backupPlans.map((plan) => plan.condition)).toEqual(
      expect.arrayContaining(["白墙时", "无云海但通透", "低云过厚", "风大"]),
    );
  });

  it("renders the cloud sea result without the entry-page popular spots placeholder", () => {
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
      expect(html).toContain("云海形成机会");
      expect(html).toContain("云海可拍机会");
      expect(html).toContain("白墙风险");
      expect(html).toContain("最佳云海窗口");
      expect(html).toContain("推荐动作");
      expect(html).toContain("逐日云海趋势");
      expect(html).toContain("云海 vs 白墙判断");
      expect(html).toContain("地形依据");
      expect(html).toContain("气象依据");
      expect(html).toContain("出行建议");
      expect(html).toContain("备选拍摄方案");
      expect(html).toContain("天气数据：演示天气数据");
      expect(html).toContain("地形数据：演示数据");
      expect(html).toContain("正式数据源启用后将显示对应来源与更新时间");
      expect(html).toContain("CloudSeaResultPage");
      expect(html).toContain("CloudSeaCoreDecision");
      expect(html).toContain("CloudSeaDailyTrend");
      expect(html).toContain("CloudSeaWhiteoutSection");
      expect(html).toContain("CloudSeaTerrainEvidence");
      expect(html).toContain("CloudSeaWeatherEvidence");
      expect(html).toContain("CloudSeaStackedLayout");
      expect(html).toContain("CloudSeaActionGrid");
      expect(html).not.toContain("CloudSeaAdviceRail");
      expect(html).not.toContain("cloud-sea-advice-rail");
      expect(html).not.toContain("CloudSeaFullWidthDetails");
      expect(html).not.toContain("cloud-sea-full-width-details");
      expect(html).not.toContain("<aside");
      expect(html).not.toMatch(/cloud-sea-(placeholder|spacer|empty)/i);
      expect(html).not.toMatch(/\bmin-h-/);
      expect(html).not.toContain("row-span");
      expect(html).not.toContain("min-[1024px]:col-span-4");
      expect(html.indexOf("逐日云海趋势")).toBeLessThan(html.indexOf("云海 vs 白墙判断"));
      expect(html.indexOf("云海 vs 白墙判断")).toBeLessThan(html.indexOf("云海时间窗口"));
      expect(html.indexOf("云海时间窗口")).toBeLessThan(html.indexOf("地形依据"));
      expect(html.indexOf("地形依据")).toBeLessThan(html.indexOf("气象依据"));
      expect(html.indexOf("气象依据")).toBeLessThan(html.indexOf("CloudSeaActionGrid"));

      const actionGridIndex = html.indexOf("CloudSeaActionGrid");
      const travelAdviceIndex = html.indexOf("出行建议", actionGridIndex);
      const riskSummaryIndex = html.indexOf("风险提示", actionGridIndex);
      const backupPlanIndex = html.indexOf("备选拍摄方案", actionGridIndex);
      const dataStatusIndex = html.indexOf("数据状态", actionGridIndex);

      expect(travelAdviceIndex).toBeGreaterThan(actionGridIndex);
      expect(travelAdviceIndex).toBeLessThan(riskSummaryIndex);
      expect(riskSummaryIndex).toBeLessThan(backupPlanIndex);
      expect(backupPlanIndex).toBeLessThan(dataStatusIndex);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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
      expect(viewModel.coreCards.length).toBe(5);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = fetchBackup;
    }
  });

  it("prioritizes sunrise, sunset, and twilight on the glow view", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("glow"), "glow");

    expect(viewModel.glow).toBeDefined();
    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
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
    const viewModel = buildGlowForecastViewModel(resultForTarget("glow"));

    expect(viewModel.coreCards.map((card) => card.label)).toEqual([
      "朝霞机会",
      "晚霞机会",
      "最佳霞光窗口",
      "低云遮挡风险",
    ]);
    expect(viewModel.dailyTrend.map((item) => item.date)).toEqual(["2026-05-20", "2026-05-21"]);
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
    const result = resultForTarget("glow");
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
      expect(html).toContain("光线窗口");
      expect(html).toContain("云层结构");
      expect(html).toContain("低云遮挡风险");
      expect(html).toContain("色彩云条件");
      expect(html).toContain("能见度与通透度");
      expect(html).toContain("地形遮挡参考");
      expect(html).toContain("拍摄建议");
      expect(html).toContain("风险提示");
      expect(html).toContain("备选拍摄方案");
      expect(html).toContain("数据状态 / 数据缺失说明");
      expect(html).toContain("天气数据：演示天气数据");
      expect(html).toContain("地形数据：演示数据");
      expect(html).toContain("天文数据：本地算法计算");
      expect(html).toContain("GlowResultPage");
      expect(html).toContain("GlowCoreDecision");
      expect(html).toContain("GlowDailyTrend");
      expect(html).toContain("GlowCloudLayerSection");
      expect(html).toContain("GlowVisibilitySection");
      expect(html).not.toContain("<aside");
      expect(html).not.toContain("SideRail");
      expect(html).not.toContain("min-[1024px]:col-span-4");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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
      "2026年5月20日 22:35 – 5月21日 03:48",
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
