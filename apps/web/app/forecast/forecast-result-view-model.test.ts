import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  forecastTargetLabels,
  type ForecastCalculationResult,
  type ForecastQueryInput,
  type ForecastScore,
} from "@photo-weather/shared";
import { AstroResultPage, CloudSeaResultPage, GlowResultPage } from "./forecast-result-client";
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
    cloudSeaOpportunityScore: 82,
    whiteoutRiskScore: 58,
    travelScore: 72,
    recommendationLabel: "值得等待",
    confidenceLevel: "medium",
    bestCloudSeaWindows: [
      {
        label: "清晨云海窗口 05:00 - 07:00",
        date: "2026-05-20",
        startTime: "2026-05-20T05:00:00+08:00",
        endTime: "2026-05-20T07:00:00+08:00",
        score: 72,
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
        target: "cloud_sea",
        phase: "observation",
        noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
        riskTag: "白墙风险中",
      },
    ],
    dailyCloudSea: [
      {
        date: "2026-05-20",
        dateLabelZh: "2026年5月20日 星期三",
        opportunityScore: 82,
        whiteoutRiskScore: 58,
        travelScore: 72,
        bestWindow: {
          label: "清晨云海窗口 05:00 - 07:00",
          date: "2026-05-20",
          startTime: "2026-05-20T05:00:00+08:00",
          endTime: "2026-05-20T07:00:00+08:00",
          score: 72,
          target: "cloud_sea",
          phase: "observation",
          noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
          riskTag: "白墙风险中",
        },
        recommendationLabel: "值得等待",
        keyReason: "清晨湿度、低云和地形条件支持等待云海。",
        riskNote: "白墙风险中等，需要现场观察云雾上沿。",
      },
      {
        date: "2026-05-21",
        dateLabelZh: "2026年5月21日 星期四",
        opportunityScore: 78,
        whiteoutRiskScore: 55,
        travelScore: 70,
        bestWindow: {
          label: "清晨云海窗口 05:00 - 07:00",
          date: "2026-05-21",
          startTime: "2026-05-21T05:00:00+08:00",
          endTime: "2026-05-21T07:00:00+08:00",
          score: 70,
          target: "cloud_sea",
          phase: "observation",
          noteZh: "清晨云海信号可等待，现场重点复核云雾上沿和能见度。",
          riskTag: "白墙风险中",
        },
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
    glowTravelScore: 72,
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
    moonImpactScore: 38,
    transparencyScore: 72,
    astroTravelScore: 70,
    recommendationLabel: "值得等待",
    confidenceLevel: "medium",
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
    dailyAstro: [
      {
        date: "2026-05-20",
        dateLabelZh: "2026年5月20日 星期三",
        lunarDateText: "四月初四",
        starsScore: 66,
        milkyWayScore: 68,
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
        label: "每晚观星条件",
        score: 66,
        detail: "天文黑夜内云量和月光可控。",
      },
      milkyWay: {
        label: "银河窗口",
        score: 68,
        detail: "银河窗口为本地天文计算。",
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
        label: "每晚观星条件",
        score: 70,
        detail: "夜间窗口可关注。",
      },
      milkyWay: {
        label: "银河窗口",
        score: 72,
        detail: "第二晚银河窗口可用。",
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
  weatherProviderCode: "mock",
  weatherProviderLabelZh: "演示数据",
  weatherDataMode: "mock",
  weatherNoticeZh: "天气数据：演示数据",
  weatherMissingFields: [],
  weatherEstimatedFields: [],
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
      "综合出片指数",
      "推荐等级",
      "最佳拍摄窗口",
      "主要风险",
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

  it("prioritizes cloud sea and whiteout risk without making astro primary", () => {
    const viewModel = buildForecastResultViewModel(resultForTarget("cloud_sea"), "cloud_sea");

    expect(viewModel.target).toBe("cloud_sea");
    expect(viewModel.cloudSea).toBeDefined();
    expect(viewModel.primaryCards.map((card) => card.label)).toEqual([
      "云海机会",
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
      "云海机会",
      "白墙风险",
      "最佳云海窗口",
      "推荐动作",
    ]);
    expect(viewModel.coreCards.find((card) => card.label === "白墙风险")?.value).toBe("中");
    expect(viewModel.cloudSeaVsWhiteout.cloudSeaDefinition).toContain("机位高于云雾层");
    expect(viewModel.cloudSeaVsWhiteout.whiteoutDefinition).toContain("能见度下降");
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
      expect(html).toContain("云海机会");
      expect(html).toContain("白墙风险");
      expect(html).toContain("最佳云海窗口");
      expect(html).toContain("推荐动作");
      expect(html).toContain("逐日云海趋势");
      expect(html).toContain("云海 vs 白墙判断");
      expect(html).toContain("地形依据");
      expect(html).toContain("气象依据");
      expect(html).toContain("出行建议");
      expect(html).toContain("备选拍摄方案");
      expect(html).toContain("天气数据：演示数据");
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
      expect(viewModel.coreCards.length).toBe(4);
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
      "主要遮挡风险 / 推荐动作",
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
      "主要遮挡风险 / 推荐动作",
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
      expect(html).toContain("日出日落与晨昏窗口");
      expect(html).toContain("云层结构判断");
      expect(html).toContain("低云遮挡风险");
      expect(html).toContain("能见度与通透度");
      expect(html).toContain("地形遮挡参考");
      expect(html).toContain("拍摄建议");
      expect(html).toContain("风险提示");
      expect(html).toContain("备选拍摄方案");
      expect(html).toContain("数据状态 / 数据缺失说明");
      expect(html).toContain("天气数据：演示数据");
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
      "星空指数",
      "银河指数",
      "月光影响",
      "推荐银河窗口 / 无月黑夜",
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
    expect(viewModel.astro?.moonlessNightWindows[0]?.timeRangeLabel).toBe("22:35 - 03:48");
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
      expect(html).toContain("月相与月光影响");
      expect(html).toContain("月出月落");
      expect(html).toContain("云量与能见度");
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

    expect(viewModel.dataNotice).toContain("天气数据：演示数据");
    expect(viewModel.dataNotice).toContain("地形信息当前使用演示地形数据");
    expect(viewModel.dataNotice).toContain("正式海拔与 DEM 数据接入后");
    expect(viewModel.dataNotice).toContain("天文数据：本地天文服务计算");
    expect(viewModel.dataNotice).toContain("当前结果基于演示天气数据生成");
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

    expect(viewModel.dataNotice).toContain("天气数据：和风天气样例数据");
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
