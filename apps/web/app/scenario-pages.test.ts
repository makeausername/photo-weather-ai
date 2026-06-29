import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { forecastHorizonLabels, type ForecastCalculationResult } from "@photo-weather/shared";
import { describe, expect, it, vi } from "vitest";
import {
  AstroDecisionPanel,
  CloudSeaDecisionPanel,
  GlowDecisionPanel,
  ScenarioSearchPanel,
  SubjectKnowledgeGuide,
  buildAstroResultCards,
  buildCloudSeaResultCards,
  buildGlowResultCards,
} from "../components/scenario-module-page";
import { HomepageSearchPanel } from "../components/homepage-search-panel";
import { LocationSearchInput } from "../components/location-search-input";
import { buildForecastUrl, type PlaceSearchResult } from "../components/place-search-card";
import {
  buildForecastRequestPayload,
  buildForecastUrlFromSelectedLocation,
  selectedLocationFromBrowserGeolocation,
} from "../components/selected-location";
import { SubjectControlPanel } from "../components/subject-control-panel";
import AstroPage, { metadata as astroMetadata } from "./astro/page";
import CloudSeaPage, { metadata as cloudSeaMetadata } from "./cloud-sea/page";
import GlowPage, { metadata as glowMetadata } from "./glow/page";
import {
  astroScenarioConfig,
  cloudSeaScenarioConfig,
  glowScenarioConfig,
  scenarioPageConfigs,
} from "./scenario-configs";
import { cloudSeaRegressionFixture } from "./forecast/__tests__/fixtures/cloudSeaRegressionFixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cloud-sea",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const selectableForecastHorizons = ["24h", "48h", "72h", "7d"] as const;

const samplePlace: PlaceSearchResult = {
  id: "mock-place-huangshan-guangmingding",
  name: "黄山光明顶",
  address: "安徽省黄山市黄山风景区光明顶",
  province: "安徽省",
  city: "黄山市",
  district: "黄山区",
  source: "local_photo_spot",
  locationType: "viewpoint",
  matchedPhotoSpotId: "spot-guangmingding",
  matchedLocationId: "location-huangshan",
  latitudeGcj02: 30.1351,
  longitudeGcj02: 118.1767,
  latitudeWgs84: 30.1328,
  longitudeWgs84: 118.171,
  elevation: 1860,
  isVerified: false,
};

function hasExactButton(html: string, label: string): boolean {
  return new RegExp(`<button[^>]*>\\s*${label}\\s*</button>`).test(html);
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

const cloudSeaQuickSpotLabels = ["黄山光明顶", "老君山金顶", "三清山女神峰", "武功山金顶"] as const;

function extractPlaceSearchCardHtml(html: string): string {
  const cardStart = html.indexOf('data-place-search-card="true"');
  expect(cardStart).toBeGreaterThanOrEqual(0);

  const guideStart = html.indexOf('data-cloud-sea-pre-result="knowledge-guide"', cardStart);
  return html.slice(cardStart, guideStart === -1 ? undefined : guideStart);
}

function glowInlineForecastResult(): ForecastCalculationResult {
  const base = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result;
  const bestWindow: ForecastCalculationResult["glowAnalysis"]["bestGlowWindows"][number] = {
    type: "sunset_glow",
    phase: "sunset",
    labelZh: "晚霞主窗口",
    date: "2026-05-20",
    start: "2026-05-20T18:36:00+08:00",
    end: "2026-05-20T19:18:00+08:00",
    eventAt: "2026-05-20T18:57:00+08:00",
    score: 82,
    colorCarrierScore: 78,
    glowCarrierScore: 80,
    lowCloudObstructionRisk: 24,
    glowLightPathObstructionRisk: 38,
    cloudSuppressionRisk: 32,
    precipitationDisruptionRisk: 18,
    visibilityColorQualityScore: 76,
    recommendationLabel: "推荐重点关注",
    confidence: 82,
    riskTags: ["低云遮挡较低", "降水打断较低"],
    noteZh: "日落前后中高云层次较好，西向云缝支持霞光显色。",
  };

  return {
    ...base,
    target: "glow",
    finalTripDecisionLabel: "推荐附近蹲守",
    finalRecommendationLabel: "推荐重点关注",
    glowAnalysis: {
      ...base.glowAnalysis,
      sunriseGlowScore: 68,
      sunsetGlowScore: 82,
      lowCloudObstructionRisk: 24,
      lowCloudFogWallRisk: 22,
      glowLightPathObstructionRisk: 38,
      glowLightPathDataAvailability: "available",
      glowLightPathConfidence: "high",
      cloudSuppressionRisk: 32,
      colorCarrierScore: 78,
      glowCarrierScore: 80,
      precipitationDisruptionRisk: 18,
      visibilityColorQualityScore: 76,
      practicalGlowScore: 80,
      occurrenceProbabilityPercent: 72,
      vividnessIndex: 78,
      vividnessLevel: "strong",
      practicalSuitabilityScore: 76,
      confidence: 82,
      recommendationLabel: "推荐重点关注",
      confidenceLevel: "high",
      labels: {
        sunriseGlowOpportunity: "中",
        sunsetGlowOpportunity: "高",
        lowCloudObstruction: "低",
        lowCloudFogWallRisk: "低",
        glowLightPathObstructionRisk: "中",
        cloudSuppressionRisk: "低",
        colorCarrier: "好",
        bestWindowLabel: "晚霞主窗口",
      },
      bestGlowWindow: bestWindow,
      bestGlowWindows: [bestWindow],
      watchableGlowWindows: [],
      notRecommendedGlowWindows: [],
      dailyGlow: [
        {
          date: "2026-05-20",
          dateLabelZh: "5月20日",
          sunriseScore: 68,
          sunsetScore: 82,
          colorCarrierScore: 78,
          lowCloudObstructionRisk: 24,
          glowLightPathObstructionRisk: 38,
          cloudSuppressionRisk: 32,
          glowCarrierScore: 80,
          precipitationDisruptionRisk: 18,
          visibilityColorQualityScore: 76,
          labels: {
            sunriseGlowOpportunity: "中",
            sunsetGlowOpportunity: "高",
            lowCloudObstruction: "低",
            lowCloudFogWallRisk: "低",
            glowLightPathObstructionRisk: "中",
            cloudSuppressionRisk: "低",
            colorCarrier: "好",
            bestWindowLabel: "晚霞主窗口",
          },
          bestWindow,
          bestTarget: "sunset",
          recommendationLabel: "推荐重点关注",
          keyReason: "晚霞窗口中高云色彩载体较好，低云遮挡和降水打断都较低。",
          riskNote: "仍需临近复核西向低云和现场风况。",
        },
      ],
      cloudLayerEvidence: [
        {
          label: "中高云色彩载体",
          value: "较好",
          effect: "positive",
          noteZh: "中高云覆盖适中，具备承载晚霞色彩的云层纹理。",
        },
      ],
      aerosolAssessment: {
        availability: "available",
        confidence: "high",
        state: "favorable_scatter",
        stateLabelZh: "轻微散射",
        implicationZh: "通透度足够，轻微气溶胶有利于暖色层次，但仍需现场复核能见度。",
        noteZh: "空气透明度支持远山层次。",
        scoreImpact: 4,
        aerosolScore: 74,
        visibilityKm: 18,
      },
      terrainObstructionAssessments: [
        {
          phase: "sunset",
          date: "2026-05-20",
          obstructionStatus: "marginal",
          confidence: "medium",
          dataAvailable: true,
          labelZh: "西向地形略有遮挡",
          noteZh: "日落方向地形余量偏窄，建议提前到位确认光路。",
        },
      ],
      riskReasons: ["西向地形光路略有遮挡，需要提前到位复核。"],
      opportunityReasons: ["晚霞中高云色彩载体较好，低云遮挡较低。"],
      travelRecommendations: ["适合在附近机位蹲守，日落前提前复核西向云缝和通透度。"],
      backupPlans: [
        {
          condition: "低云遮挡增强",
          action: "转为附近观察",
          detail: "保留近景暖光和云缝题材，避免远距离专程。",
        },
      ],
      missingDataNotes: [],
    },
  };
}

function astroInlineForecastResult(): ForecastCalculationResult {
  const base = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result;
  const milkyWayWindow: ForecastCalculationResult["astroAnalysis"]["recommendedMilkyWayWindows"][number] =
    {
      type: "recommended_milky_way",
      labelZh: "银河核心窗口",
      date: "2026-05-21",
      start: "2026-05-21T01:20:00+08:00",
      end: "2026-05-21T03:05:00+08:00",
      durationMinutes: 105,
      score: 84,
      riskTags: ["无月黑夜", "南向光害低"],
      noteZh: "天文黑夜内月亮已落，银河核心高度较理想。",
      directionZh: "东南偏南",
      galacticCenterAltitude: 28,
      galacticCenterAzimuth: 165,
    };
  const moonlessWindow: ForecastCalculationResult["astroAnalysis"]["moonlessNightWindows"][number] =
    {
      type: "moonless_night",
      labelZh: "无月黑夜",
      date: "2026-05-21",
      start: "2026-05-21T00:40:00+08:00",
      end: "2026-05-21T04:10:00+08:00",
      durationMinutes: 210,
      score: 78,
      riskTags: ["月落后"],
      noteZh: "月落后黑夜长度充足，适合等待银河升高。",
    };
  const astronomicalWindow: ForecastCalculationResult["astroAnalysis"]["astronomicalNightWindows"][number] =
    {
      type: "astronomical_night",
      labelZh: "天文黑夜",
      date: "2026-05-21",
      start: "2026-05-21T21:15:00+08:00",
      end: "2026-05-22T04:23:00+08:00",
      durationMinutes: 428,
      score: 82,
      riskTags: ["黑夜长度充足"],
      noteZh: "天文黑夜持续时间较长，天空背景具备星空拍摄基础。",
    };
  const overallSkyDarkness: NonNullable<
    ForecastCalculationResult["astroAnalysis"]["overallSkyDarkness"]
  > = {
    available: true,
    minClass: 2,
    maxClass: 3,
    rangeLabelZh: "2-3级",
    skyQualityLabelZh: "深空条件较好",
    confidence: "medium",
    basisZh: "周边夜光与暗空经验综合参考。",
    conservative: true,
    calibrationEvidenceLevel: "limited",
    rangeWidthClasses: 1,
    rangeWidthPolicy: "normal",
    diagnostics: [],
    rawEstimatedBortleRangeLabel: "2-3级",
    primaryBaseline: "wa_model",
    skyBrightnessAvailable: false,
    skyBrightnessEstimatedBortleLabel: null,
    localRadiance: 1.2,
    surroundingHaloRadiance: 3.4,
    ambientRiskIndex: 32,
    nationalRiskIndex: 35,
    localToHaloRatio: 0.35,
    haloToLocalRatio: 2.8,
    localRadianceQuantile: 0.2,
    haloRadianceQuantile: 0.3,
    ambientRiskQuantile: 0.25,
    noteZh: "整体暗空较好，适合银河拍摄。",
  };
  const targetDirectionLightPollution: NonNullable<
    ForecastCalculationResult["astroAnalysis"]["targetDirectionLightPollution"]
  > = {
    available: true,
    status: "resolved",
    azimuthDegrees: 165,
    directionLabelZh: "南偏东",
    radiance: 0.8,
    riskIndex: 22,
    riskLevel: "low",
    riskLevelLabelZh: "低",
    warningZh: "银河方向光害较低，但仍需避开近处城镇灯光。",
    basisZh: "按目标方向扇区估算。",
    avoidDirectionLabelsZh: ["西北"],
    cleanerDirectionLabelsZh: ["南", "东南"],
  };
  const finalPhotographyDecision: NonNullable<
    ForecastCalculationResult["astroAnalysis"]["finalPhotographyDecision"]
  > = {
    available: true,
    shootable: true,
    score: 81,
    recommendationLabel: "推荐重点关注",
    overallSkyDarknessRangeLabelZh: "2-3级",
    targetDirectionLightPollutionLabelZh: "低",
    summaryZh: "整体暗空、银河方向、天气、月光和地形综合后支持拍摄。",
    reasonsZh: ["银河方向光害较低，天文黑夜和无月时段覆盖核心窗口。"],
    componentScores: {
      overallSkyDarkness: 82,
      targetDirectionLightPollution: 78,
      cloudCover: 76,
      cloudLayers: 80,
      visibility: 74,
      precipitation: 90,
      wind: 86,
      moonIllumination: 92,
      astronomicalNight: 82,
      milkyWayWindow: 84,
      terrainObstruction: 88,
    },
  };

  return {
    ...base,
    target: "astro",
    finalTripDecisionLabel: "推荐专程前往",
    astroAnalysis: {
      ...base.astroAnalysis,
      starsScore: 82,
      milkyWayScore: 84,
      astroConditionScore: 80,
      astroPracticalScore: 81,
      astronomicalWindowScore: 82,
      skyConditionScore: 76,
      milkyWayGeometryScore: 84,
      moonlightImpactScore: 18,
      moonImpactScore: 18,
      transparencyScore: 74,
      dewRiskScore: 42,
      practicalAstroScore: 81,
      astroTravelScore: 81,
      astroWindowAvailable: true,
      astroShootable: true,
      cloudBlockerLevel: "low",
      dewRiskLevel: "medium",
      tripodWindRisk: "low",
      labels: {
        astronomicalWindow: "有",
        starShootability: "高",
        milkyWayShootability: "高",
        moonlightImpact: "低",
        cloudBlocker: "低",
        dewRisk: "中",
        windowRecommendation: "推荐银河窗口",
      },
      recommendationLabel: "推荐重点关注",
      confidenceLevel: "high",
      recommendedMilkyWayWindow: milkyWayWindow,
      bestAstroWindows: [milkyWayWindow, moonlessWindow],
      recommendedMilkyWayWindows: [milkyWayWindow],
      moonlessNightWindows: [moonlessWindow],
      astronomicalNightWindows: [astronomicalWindow],
      moonInfo: {
        moonPhase: 0.1,
        moonPhaseNameZh: "残月",
        moonIllumination: 0.08,
        waxingOrWaning: "waning",
        lunarDateText: "农历廿七",
        moonrise: "2026-05-20T15:40:00+08:00",
        moonset: "2026-05-21T00:36:00+08:00",
        calculationNoteZh: "月落后进入无月黑夜。",
      },
      lightPollution: {
        ...base.astroAnalysis.lightPollution,
        available: true,
        dataAvailable: true,
        unavailableReason: undefined,
        ambientRiskLevel: "medium",
        ambientRiskLevelLabelZh: "中",
        targetDirectionLevel: "low",
        targetDirectionLevelLabelZh: "低",
        targetDirectionRisk: 22,
        targetAzimuthDegrees: 165,
        lightPollutionNoteZh: "周边光害整体中等，南向银河方向相对干净。",
        starPenalty: 8,
        milkyWayPenalty: 10,
        sampleCount: 64,
        validSampleCount: 60,
      },
      overallSkyDarkness,
      targetDirectionLightPollution,
      finalPhotographyDecision,
      cloudEvidence: [
        {
          label: "云量",
          value: "较低",
          effect: "positive",
          noteZh: "银河窗口内总云量较低，低云遮挡风险有限。",
        },
      ],
      visibilityEvidence: [
        {
          label: "通透度",
          value: "较好",
          effect: "positive",
          noteZh: "能见度和透明度支持银河细节，但仍需复核山顶薄雾。",
        },
      ],
      moonEvidence: [
        {
          label: "月光",
          value: "低",
          effect: "positive",
          noteZh: "月落后进入无月黑夜，银河对比度受月光影响较小。",
        },
      ],
      terrainEvidence: [
        {
          label: "地平线",
          value: "较清晰",
          effect: "positive",
          noteZh: "目标方向地平线遮挡较低，银河核心升起后可见性较好。",
        },
      ],
      lightPollutionEvidence: [
        {
          label: "光污染",
          value: "中",
          effect: "neutral",
          noteZh: "整体光污染中等，银河方向相对更干净。",
        },
      ],
      weatherBlockers: [],
      riskReasons: ["露水风险中等，镜头需要防雾。"],
      opportunityReasons: ["无月黑夜覆盖银河核心窗口。"],
      travelRecommendations: ["适合专程，01:20 前后提前到位复核云量和南向光害。"],
      backupPlans: [
        {
          condition: "薄云增多",
          action: "附近蹲守",
          detail: "保留星轨或月色山景题材。",
        },
      ],
      missingDataNotes: [],
      dataMode: "real",
    },
  };
}

function subjectDeepLinkParams(
  target: "cloud_sea" | "glow" | "astro",
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    source: "general",
    target,
    subject: target === "cloud_sea" ? "cloud_sea" : target === "glow" ? "sunset_glow" : "milky_way",
    date: "2026-05-20",
    windowStart:
      target === "cloud_sea"
        ? "2026-05-20T05:00:00+08:00"
        : target === "glow"
          ? "2026-05-20T17:56:00+08:00"
          : "2026-05-21T01:10:00+08:00",
    windowEnd:
      target === "cloud_sea"
        ? "2026-05-20T07:00:00+08:00"
        : target === "glow"
          ? "2026-05-20T19:41:00+08:00"
          : "2026-05-21T03:30:00+08:00",
    locationName: samplePlace.name,
    lat: String(samplePlace.latitudeWgs84),
    lng: String(samplePlace.longitudeWgs84),
    latGcj02: String(samplePlace.latitudeGcj02),
    lngGcj02: String(samplePlace.longitudeGcj02),
    elevation: String(samplePlace.elevation),
    timezone: "Asia/Shanghai",
    horizon: target === "astro" ? "7d" : "48h",
    locationSource: "local_photo_spot",
    returnUrl: "/forecast?target=general",
    ...overrides,
  };
}

describe("scenario module pages", () => {
  it("keeps cloud-sea, glow, and astro pages importable with metadata", () => {
    expect(CloudSeaPage({})).toBeTruthy();
    expect(GlowPage({})).toBeTruthy();
    expect(AstroPage({})).toBeTruthy();
    expect(cloudSeaMetadata.title).toBe("云海判断 - 逐光天气");
    expect(glowMetadata.title).toBe("朝霞晚霞 - 逐光天气");
    expect(astroMetadata.title).toBe("星空银河 - 逐光天气");
  });

  it("uses the correct target presets and default horizons", () => {
    expect(cloudSeaScenarioConfig).toMatchObject({
      title: "云海判断",
      target: "cloud_sea",
      defaultHorizon: "48h",
      ctaLabel: "查看云海拍摄判断",
    });
    expect(glowScenarioConfig).toMatchObject({
      title: "朝霞晚霞",
      target: "glow",
      defaultHorizon: "72h",
      ctaLabel: "查看朝霞晚霞判断",
    });
    expect(astroScenarioConfig).toMatchObject({
      title: "星空银河",
      target: "astro",
      defaultHorizon: "7d",
      ctaLabel: "查看星空银河判断",
    });
  });

  it("renders the cloud-sea entry page as a search-first decision entry", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const oldPlaceholderLabels = [
      "有没有云海机会",
      "能不能拍",
      "会不会白墙",
      "几点到、几点守",
      "白墙时怎么转拍",
      "是否值得专程去",
    ];

    expect(html).not.toContain("热门云海机位");
    expect(html).not.toContain("机位参考");
    expect(html).not.toContain("页面预设");
    expect(html).not.toContain("体验模式");
    expect(html).not.toContain("数据提醒");
    expect(html).not.toContain("固定分析目标");
    expect(html).not.toContain("云海判断重点");
    expect(html).not.toContain("白墙风险说明");
    expect(html).not.toContain("判断指标");
    expect(html).toContain('data-cloud-sea-page-mode="search"');
    expect(html).toContain('data-cloud-sea-section="CloudSeaSearchPanel"');
    expect(html).toContain("地点搜索与范围选择");
    expect(html).toContain('data-cloud-sea-pre-result="knowledge-guide"');
    expect(html).not.toContain('data-cloud-sea-decision-panel="true"');
    expect(html).toContain("云海判断需要关注什么");
    expect(html).toContain(
      "选择地点后，系统会结合水汽、低云、地形、风速、光线窗口和降水时段判断云海形成、可拍机会与白墙风险。",
    );
    expect(countOccurrences(html, 'data-cloud-sea-knowledge-card="true"')).toBe(6);
    expect(html).toContain("水汽是否足够");
    expect(html).toContain("低云是否在合适高度");
    expect(html).toContain("机位是否高于云层");
    expect(html).toContain("风速是否合适");
    expect(html).toContain("是否有光线窗口");
    expect(html).toContain("是否存在雨后开口");
    expect(html).toContain("核心指标");
    expect(html).toContain("白墙判断");
    expect(html).toContain("出片窗口");
    for (const label of oldPlaceholderLabels) {
      expect(html).not.toContain(label);
    }
    expect(html).not.toContain("云海拍摄决策");
    expect(html).not.toMatch(/api[_-]?key|secret|AMAP_|key=/i);
  });

  it("keeps the cloud sea knowledge cards responsive without mobile overflow classes", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const guideStart = html.indexOf('data-cloud-sea-pre-result="knowledge-guide"');
    const guideHtml = html.slice(guideStart);

    expect(guideStart).toBeGreaterThanOrEqual(0);
    expect(html).toContain("min-[900px]:items-stretch");
    expect(guideHtml).toContain("grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3");
    expect(guideHtml).toContain("grid min-w-0 content-start gap-3");
    expect(guideHtml).not.toMatch(/min-w-\[[^\]]+\]/);
    expect(guideHtml).not.toContain("overflow-x");
  });

  it("reuses the shared current-location input on homepage, cloud sea, glow, and astro", () => {
    const homepageHtml = renderToStaticMarkup(React.createElement(HomepageSearchPanel));
    const cloudSeaHtml = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const glowHtml = renderToStaticMarkup(React.createElement(GlowPage));
    const astroHtml = renderToStaticMarkup(React.createElement(AstroPage));
    const sharedInputHtml = renderToStaticMarkup(
      React.createElement(LocationSearchInput, {
        value: "",
        placeholder: "输入地点",
        onInputChange: vi.fn(),
        onSearch: vi.fn(),
        onUseCurrentLocation: vi.fn(),
      }),
    );

    for (const html of [homepageHtml, cloudSeaHtml, glowHtml, astroHtml, sharedInputHtml]) {
      expect(html).toContain('data-location-search-input="true"');
      expect(html).toContain('data-current-location-input-wrapper="true"');
      expect(html).toContain('data-current-location-button="true"');
      expect(html).toContain('aria-label="使用当前位置"');
      expect(html).toContain('title="使用当前位置"');
      expect(html).toContain("relative min-w-0 w-full");
      expect(html).toContain("pr-12");
      expect(html).toContain("absolute right-1.5 top-1/2");
      expect(html).toContain("h-8 w-8");
      expect(html).toContain('viewBox="0 0 24 24"');
    }
  });

  it("renders the cloud sea locator icon inside the input without a visible text button", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const wrapperIndex = html.indexOf('data-current-location-input-wrapper="true"');
    const inputIndex = html.indexOf('aria-label="目的地"', wrapperIndex);
    const buttonIndex = html.indexOf('data-current-location-button="true"', wrapperIndex);

    expect(wrapperIndex).toBeGreaterThanOrEqual(0);
    expect(inputIndex).toBeGreaterThan(wrapperIndex);
    expect(buttonIndex).toBeGreaterThan(inputIndex);
    expect(html).toContain("浏览器定位仅用于本次云海判断，不会公开显示。");
    expect(hasExactButton(html, "定位")).toBe(false);
    expect(hasExactButton(html, "定位中")).toBe(false);
    expect(html).not.toMatch(/api[_-]?key|secret|AMAP_|key=/i);
  });

  it("renders the glow locator icon inside the input without development copy", () => {
    const html = renderToStaticMarkup(React.createElement(GlowPage));
    const wrapperIndex = html.indexOf('data-current-location-input-wrapper="true"');
    const inputIndex = html.indexOf('aria-label="目的地"', wrapperIndex);
    const buttonIndex = html.indexOf('data-current-location-button="true"', wrapperIndex);

    expect(wrapperIndex).toBeGreaterThanOrEqual(0);
    expect(inputIndex).toBeGreaterThan(wrapperIndex);
    expect(buttonIndex).toBeGreaterThan(inputIndex);
    expect(html).toContain("浏览器定位仅用于本次朝霞晚霞判断，不会公开显示。");
    expect(html).toContain("pr-12");
    expect(html).toContain("absolute right-1.5 top-1/2");
    expect(html).toContain("h-8 w-8");
    expect(hasExactButton(html, "定位")).toBe(false);
    expect(hasExactButton(html, "定位中")).toBe(false);
    expect(html).not.toContain("数据说明");
    expect(html).not.toContain("当前为体验模式");
    expect(html).not.toMatch(
      /\bmock\b|\bdemo\b|演示数据|测试数据|开发模式|开发环境|provider|debug/i,
    );
    expect(html).not.toMatch(/api[_-]?key|secret|AMAP_|key=/i);
  });

  it("renders the astro locator icon inside the input without development copy", () => {
    const html = renderToStaticMarkup(React.createElement(AstroPage));
    const wrapperIndex = html.indexOf('data-current-location-input-wrapper="true"');
    const inputIndex = html.indexOf('aria-label="目的地"', wrapperIndex);
    const buttonIndex = html.indexOf('data-current-location-button="true"', wrapperIndex);

    expect(wrapperIndex).toBeGreaterThanOrEqual(0);
    expect(inputIndex).toBeGreaterThan(wrapperIndex);
    expect(buttonIndex).toBeGreaterThan(inputIndex);
    expect(html).toContain("浏览器定位仅用于本次星空银河判断，不会公开显示。");
    expect(html).toContain("pr-12");
    expect(html).toContain("absolute right-1.5 top-1/2");
    expect(html).toContain("h-8 w-8");
    expect(hasExactButton(html, "定位")).toBe(false);
    expect(hasExactButton(html, "定位中")).toBe(false);
    expect(html).not.toContain("数据说明");
    expect(html).not.toContain("数据提醒");
    expect(html).not.toContain("当前为体验模式");
    expect(html).not.toContain("演示数据");
    expect(html).not.toContain("本地天文计算");
    expect(html).not.toMatch(/\bmock\b|\bdemo\b|测试数据|开发模式|开发环境|provider|debug/i);
    expect(html).not.toMatch(/api[_-]?key|secret|AMAP_|key=/i);
  });

  it("removes cloud sea quick spots while keeping search controls available", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const searchCardHtml = extractPlaceSearchCardHtml(html);

    expect(html).toContain('data-subject-control-panel="true"');
    expect(html).toContain('data-subject-control-panel-target="cloud_sea"');
    expect(searchCardHtml).toMatch(/<button[^>]*type="submit"[^>]*>搜索地点<\/button>/);
    expect(searchCardHtml).toContain('aria-label="目的地"');
    expect(searchCardHtml).toContain('data-current-location-button="true"');
    expect(searchCardHtml).toContain("浏览器定位仅用于本次云海判断，不会公开显示。");
    expect(searchCardHtml).toContain("预报范围选择");
    expect(searchCardHtml).toContain("未来24小时");
    expect(searchCardHtml).toContain("未来48小时");
    expect(searchCardHtml).toContain("未来72小时");
    expect(searchCardHtml).toContain("未来7天");
    expect(searchCardHtml).toContain("分析题材");
    expect(searchCardHtml).toContain("云海");
    expect(searchCardHtml).toContain("查看云海拍摄判断");
    expect(searchCardHtml).not.toContain('data-quick-location-section="true"');
    expect(searchCardHtml).not.toContain("常用机位");
    expect(searchCardHtml).not.toContain("border-t border-border pt-4");
    for (const label of cloudSeaQuickSpotLabels) {
      expect(searchCardHtml).not.toContain(label);
      expect(hasExactButton(searchCardHtml, label)).toBe(false);
    }
  });

  it("uses the shared subject control panel for cloud sea, glow, and astro", () => {
    const cloudSeaHtml = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const glowHtml = renderToStaticMarkup(React.createElement(GlowPage));
    const astroHtml = renderToStaticMarkup(React.createElement(AstroPage));
    const sharedGlowPanelHtml = renderToStaticMarkup(
      React.createElement(SubjectControlPanel, {
        config: {
          target: glowScenarioConfig.target,
          defaultHorizon: glowScenarioConfig.defaultHorizon,
          ctaLabel: glowScenarioConfig.ctaLabel,
          currentLocationPrivacyHint: "浏览器定位仅用于本次朝霞晚霞判断，不会公开显示。",
        },
      }),
    );
    const sharedAstroPanelHtml = renderToStaticMarkup(
      React.createElement(SubjectControlPanel, {
        config: {
          target: astroScenarioConfig.target,
          defaultHorizon: astroScenarioConfig.defaultHorizon,
          ctaLabel: astroScenarioConfig.ctaLabel,
          currentLocationPrivacyHint: "浏览器定位仅用于本次星空银河判断，不会公开显示。",
        },
      }),
    );
    const subjectControlSource = readFileSync(
      fileURLToPath(new URL("../components/subject-control-panel.tsx", import.meta.url)),
      "utf8",
    );
    const scenarioSource = readFileSync(
      fileURLToPath(new URL("../components/scenario-module-page.tsx", import.meta.url)),
      "utf8",
    );
    const glowPageSource = readFileSync(
      fileURLToPath(new URL("./glow/page.tsx", import.meta.url)),
      "utf8",
    );
    const astroPageSource = readFileSync(
      fileURLToPath(new URL("./astro/page.tsx", import.meta.url)),
      "utf8",
    );

    for (const html of [
      cloudSeaHtml,
      glowHtml,
      astroHtml,
      sharedGlowPanelHtml,
      sharedAstroPanelHtml,
    ]) {
      expect(html).toContain('data-subject-control-panel="true"');
      expect(html).toContain("地点搜索与范围选择");
      expect(html).toContain('data-location-search-input="true"');
      expect(html).toContain('data-current-location-button="true"');
      expect(html).toContain("预报范围选择");
      expect(html).toContain("分析题材");
      expect(html).not.toContain('data-quick-location-section="true"');
      expect(html).not.toContain("常用机位");
    }
    expect(cloudSeaHtml).toContain('data-subject-control-panel-target="cloud_sea"');
    expect(glowHtml).toContain('data-subject-control-panel-target="glow"');
    expect(astroHtml).toContain('data-subject-control-panel-target="astro"');
    expect(subjectControlSource).toContain("PlaceSearchCard");
    expect(subjectControlSource).toContain("showQuickLocations={false}");
    expect(subjectControlSource).toContain("enableCurrentLocation");
    expect(subjectControlSource).toContain("badgeLabel={null}");
    expect(scenarioSource).toContain("SubjectControlPanel");
    expect(glowPageSource).toContain("ScenarioModulePage");
    expect(glowPageSource).not.toContain("SubjectControlPanel");
    expect(glowPageSource).not.toContain("PlaceSearchCard");
    expect(astroPageSource).toContain("ScenarioModulePage");
    expect(astroPageSource).not.toContain("SubjectControlPanel");
    expect(astroPageSource).not.toContain("PlaceSearchCard");
  });

  it("renders the subject guide horizon badge from the selected horizon", () => {
    for (const config of [cloudSeaScenarioConfig, glowScenarioConfig, astroScenarioConfig]) {
      for (const selectedHorizon of selectableForecastHorizons) {
        const html = renderToStaticMarkup(
          React.createElement(SubjectKnowledgeGuide, {
            config,
            selectedHorizon,
          }),
        );

        expect(html).toContain(`data-subject-knowledge-guide="${config.target}"`);
        expect(html).toContain(forecastHorizonLabels[selectedHorizon]);
        if (selectedHorizon !== config.defaultHorizon) {
          expect(html).not.toContain(forecastHorizonLabels[config.defaultHorizon]);
        }
      }
    }
  });

  it("syncs the subject guide horizon through shared onForecastOptionsChange state", () => {
    const scenarioSource = readFileSync(
      fileURLToPath(new URL("../components/scenario-module-page.tsx", import.meta.url)),
      "utf8",
    );
    const cloudSeaPageSource = readFileSync(
      fileURLToPath(new URL("./cloud-sea/page.tsx", import.meta.url)),
      "utf8",
    );
    const glowPageSource = readFileSync(
      fileURLToPath(new URL("./glow/page.tsx", import.meta.url)),
      "utf8",
    );
    const astroPageSource = readFileSync(
      fileURLToPath(new URL("./astro/page.tsx", import.meta.url)),
      "utf8",
    );

    expect(scenarioSource).toContain("useState<ForecastHorizon>(config.defaultHorizon)");
    expect(scenarioSource).toContain("const handleForecastOptionsChange = useCallback");
    expect(scenarioSource).toContain("setSelectedHorizon(options.horizon)");
    expect(scenarioSource).toContain("onForecastOptionsChange={handleForecastOptionsChange}");
    expect(scenarioSource).toContain("selectedHorizon={selectedHorizon}");
    expect(scenarioSource).toContain("forecastHorizonLabels[selectedHorizon]");
    expect(scenarioSource).not.toContain("forecastHorizonLabels[config.defaultHorizon]");

    for (const source of [cloudSeaPageSource, glowPageSource, astroPageSource]) {
      expect(source).toContain("ScenarioModulePage");
      expect(source).not.toContain("SubjectControlPanel");
      expect(source).not.toContain("PlaceSearchCard");
      expect(source).not.toContain("onForecastOptionsChange");
      expect(source).not.toContain("selectedHorizon");
      expect(source).not.toContain("useState");
    }
  });

  it("wires cloud sea, glow, and astro selected locations into inline forecast calculation", () => {
    const scenarioSource = readFileSync(
      fileURLToPath(new URL("../components/scenario-module-page.tsx", import.meta.url)),
      "utf8",
    );
    const glowPageSource = readFileSync(
      fileURLToPath(new URL("./glow/page.tsx", import.meta.url)),
      "utf8",
    );
    const cloudSeaPageSource = readFileSync(
      fileURLToPath(new URL("./cloud-sea/page.tsx", import.meta.url)),
      "utf8",
    );
    const astroPageSource = readFileSync(
      fileURLToPath(new URL("./astro/page.tsx", import.meta.url)),
      "utf8",
    );

    expect(scenarioSource).toContain(
      "const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null)",
    );
    expect(scenarioSource).toContain('const isGlow = config.target === "glow"');
    expect(scenarioSource).toContain('const isAstro = config.target === "astro"');
    expect(scenarioSource).toContain("const isInlineDecisionTarget = isCloudSea || isGlow || isAstro");
    expect(scenarioSource).toContain(
      "selectedLocation={isInlineDecisionTarget ? selectedLocation : undefined}",
    );
    expect(scenarioSource).toContain(
      "onSelectedLocationChange={isInlineDecisionTarget ? setSelectedLocation : undefined}",
    );
    expect(scenarioSource).toContain('const inlineForecastTarget = isAstro ? "astro" : config.target');
    expect(scenarioSource).toContain(
      "buildForecastRequestPayload(location, selectedHorizon, inlineForecastTarget)",
    );
    expect(scenarioSource).toContain("requestForecastCalculation(");
    expect(scenarioSource).toContain("normalizeForecastClientErrorMessage(error)");
    expect(scenarioSource).toContain('data-cloud-sea-decision-panel="true"');
    expect(scenarioSource).toContain('data-glow-decision-panel="true"');
    expect(scenarioSource).toContain('data-astro-decision-panel="true"');
    expect(scenarioSource).not.toContain(
      'buildForecastRequestPayload(location, selectedHorizon, "general")',
    );
    expect(scenarioSource).not.toContain(
      'buildForecastRequestPayload(location, selectedHorizon, "cloud_sea")',
    );
    expect(scenarioSource).not.toContain(
      'buildForecastRequestPayload(location, selectedHorizon, "glow")',
    );

    for (const source of [cloudSeaPageSource, glowPageSource, astroPageSource]) {
      expect(source).toContain("ScenarioModulePage");
      expect(source).not.toContain("requestForecastCalculation");
      expect(source).not.toContain("buildForecastRequestPayload");
      expect(source).not.toContain("selectedLocation");
    }
  });

  it("renders generated cloud sea decision cards without homepage or provider copy", () => {
    const { result } = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
    const location = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      reverseGeocode: {
        available: true,
        name: "黄山光明顶",
        address: "黄山风景区光明顶",
      },
    });
    const expectedTitles = [
      "云海综合指数",
      "云海可拍机会",
      "白墙风险",
      "最佳云海窗口",
      "地形与机位优势",
      "现场行动建议",
    ];
    const cards = buildCloudSeaResultCards(result);
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaDecisionPanel, {
        location,
        horizon: "48h",
        state: {
          status: "ready",
          result,
        },
      }),
    );

    expect(cards.map((card) => card.title)).toEqual(expectedTitles);
    expect(html).toContain('data-cloud-sea-generated-result="true"');
    expect(countOccurrences(html, "data-cloud-sea-decision-card=")).toBe(6);
    for (const title of expectedTitles) {
      expect(html).toContain(title);
    }
    expect(html).toContain("形成信号看水汽和低云是否足够");
    expect(html).toContain("风速打散");
    expect(html).toContain("雨后开口");
    expect(html).not.toContain("推荐等级");
    expect(html).not.toContain("云层与风");
    expect(html).not.toContain("当前建议");
    expect(html).not.toMatch(
      /\bAI\b|GFS|Open-Meteo|meteoblue|provider|debug|DEM|Copernicus|GLO-30|VRT|synthetic|fixture|weatherProvider|dataSource|cloudSeaAnalysis|scoreCalibration/i,
    );
  });

  it("renders cloud sea-specific loading and fallback panels after location selection", () => {
    const location = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      reverseGeocode: {
        available: true,
        name: "黄山光明顶",
      },
    });
    const loadingHtml = renderToStaticMarkup(
      React.createElement(CloudSeaDecisionPanel, {
        location,
        horizon: "48h",
        state: {
          status: "loading",
          result: null,
        },
      }),
    );
    const fallbackHtml = renderToStaticMarkup(
      React.createElement(CloudSeaDecisionPanel, {
        location,
        horizon: "48h",
        state: {
          status: "error",
          result: null,
          errorMessage: "本次云海数据暂时不可用，请稍后重试。",
        },
      }),
    );

    expect(loadingHtml).toContain('data-cloud-sea-decision-status="loading"');
    expect(loadingHtml).toContain("正在生成云海判断");
    expect(loadingHtml).toContain("水汽 / 低云 / 地形");
    expect(loadingHtml).toContain("白墙风险同步复核");
    expect(loadingHtml).not.toContain('data-cloud-sea-pre-result="knowledge-guide"');
    expect(fallbackHtml).toContain('data-cloud-sea-decision-status="error"');
    expect(fallbackHtml).toContain("云海判断暂不可用");
    expect(fallbackHtml).toContain("现场复核重点");
    expect(fallbackHtml).not.toContain("综合出行判断");
  });

  it("renders generated glow decision cards without homepage, cloud sea, or provider copy", () => {
    const result = glowInlineForecastResult();
    const location = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      reverseGeocode: {
        available: true,
        name: "黄山光明顶",
        address: "黄山风景区光明顶",
      },
    });
    const expectedTitles = [
      "朝霞机会",
      "晚霞机会",
      "最佳霞光窗口",
      "色彩载体",
      "遮挡与光路",
      "通透与现场建议",
    ];
    const cards = buildGlowResultCards(result);
    const html = renderToStaticMarkup(
      React.createElement(GlowDecisionPanel, {
        location,
        horizon: "72h",
        state: {
          status: "ready",
          result,
        },
      }),
    );

    expect(cards.map((card) => card.title)).toEqual(expectedTitles);
    expect(html).toContain('data-glow-generated-result="true"');
    expect(countOccurrences(html, "data-glow-decision-card=")).toBe(6);
    for (const title of expectedTitles) {
      expect(html).toContain(title);
    }
    expect(html).toContain("日落前后中高云层次较好");
    expect(html).toContain("中高云色彩载体");
    expect(html).toContain("西向地形略有遮挡");
    expect(html).toContain("气溶胶");
    expect(html).not.toContain("综合指数");
    expect(html).not.toContain("推荐等级");
    expect(html).not.toContain("云层与风");
    expect(html).not.toContain("当前建议");
    expect(html).not.toContain("云海综合指数");
    expect(html).not.toContain("白墙风险");
    expect(html).not.toMatch(
      /\bAI\b|GFS|Open-Meteo|meteoblue|provider|debug|DEM|Copernicus|GLO-30|VRT|synthetic|fixture|weatherProvider|dataSource|glowLightPathObstructionRisk|aerosolOpticalDepth550|providerAgreement/i,
    );
  });

  it("renders glow-specific loading and fallback panels after location selection", () => {
    const location = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      reverseGeocode: {
        available: true,
        name: "黄山光明顶",
      },
    });
    const loadingHtml = renderToStaticMarkup(
      React.createElement(GlowDecisionPanel, {
        location,
        horizon: "72h",
        state: {
          status: "loading",
          result: null,
        },
      }),
    );
    const fallbackHtml = renderToStaticMarkup(
      React.createElement(GlowDecisionPanel, {
        location,
        horizon: "72h",
        state: {
          status: "error",
          result: null,
          errorMessage: "本次霞光数据暂时不可用，请稍后重试。",
        },
      }),
    );

    expect(loadingHtml).toContain('data-glow-decision-status="loading"');
    expect(loadingHtml).toContain("正在生成朝霞晚霞判断");
    expect(loadingHtml).toContain("日出 / 日落 / 云层");
    expect(loadingHtml).toContain("遮挡与通透同步复核");
    expect(loadingHtml).not.toContain('data-subject-knowledge-guide="glow"');
    expect(fallbackHtml).toContain('data-glow-decision-status="error"');
    expect(fallbackHtml).toContain("朝霞晚霞判断暂不可用");
    expect(fallbackHtml).toContain("现场复核重点");
    expect(fallbackHtml).not.toContain("综合出行判断");
  });

  it("renders generated astro decision cards without homepage, cloud sea, glow, or provider copy", () => {
    const result = astroInlineForecastResult();
    const location = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      reverseGeocode: {
        available: true,
        name: "黄山光明顶",
        address: "黄山风景区光明顶",
      },
    });
    const expectedTitles = [
      "星空指数",
      "银河机会",
      "最佳银河窗口",
      "月光影响",
      "云量与通透",
      "光污染与地形",
    ];
    const cards = buildAstroResultCards(result);
    const html = renderToStaticMarkup(
      React.createElement(AstroDecisionPanel, {
        location,
        horizon: "7d",
        state: {
          status: "ready",
          result,
        },
      }),
    );

    expect(cards.map((card) => card.title)).toEqual(expectedTitles);
    expect(html).toContain('data-astro-generated-result="true"');
    expect(countOccurrences(html, "data-astro-decision-card=")).toBe(6);
    expect(html).toContain("min-[900px]:grid-rows-[auto_minmax(0,1fr)]");
    expect(html).toContain("min-[900px]:auto-rows-fr");
    expect(html).toContain("min-[900px]:h-full");
    for (const title of expectedTitles) {
      expect(html).toContain(title);
    }
    expect(html).toContain("天文黑夜");
    expect(html).toContain("无月黑夜");
    expect(html).toContain("银河核心高度较理想");
    expect(html).toContain("东南偏南");
    expect(html).toContain("月落后进入无月黑夜");
    expect(html).toContain("云量较低");
    expect(html).toContain("银河方向光害较低");
    expect(html).toContain("目标方向地平线遮挡较低");
    expect(html).not.toContain("综合指数");
    expect(html).not.toContain("推荐等级");
    expect(html).not.toContain("云层与风");
    expect(html).not.toContain("当前建议");
    expect(html).not.toContain("云海综合指数");
    expect(html).not.toContain("白墙风险");
    expect(html).not.toContain("朝霞机会");
    expect(html).not.toContain("晚霞机会");
    expect(html).not.toMatch(
      /\bAI\b|GFS|Open-Meteo|meteoblue|provider|debug|DEM|Copernicus|GLO-30|VRT|synthetic|fixture|weatherProvider|dataSource|milkyWayGeometryScore|targetDirectionLightPollution|terrainHorizonAssessment|providerCode|datasetYear/i,
    );
  });

  it("renders astro-specific loading and fallback panels after location selection", () => {
    const location = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      reverseGeocode: {
        available: true,
        name: "黄山光明顶",
      },
    });
    const loadingHtml = renderToStaticMarkup(
      React.createElement(AstroDecisionPanel, {
        location,
        horizon: "7d",
        state: {
          status: "loading",
          result: null,
        },
      }),
    );
    const fallbackHtml = renderToStaticMarkup(
      React.createElement(AstroDecisionPanel, {
        location,
        horizon: "7d",
        state: {
          status: "error",
          result: null,
          errorMessage: "本次星空银河数据暂时不可用，请稍后重试。",
        },
      }),
    );

    expect(loadingHtml).toContain('data-astro-decision-status="loading"');
    expect(loadingHtml).toContain("正在生成星空银河判断");
    expect(loadingHtml).toContain("天文黑夜 / 月光 / 银河");
    expect(loadingHtml).toContain("银河窗口会单独评估");
    expect(loadingHtml).toContain("光污染与天气同步复核");
    expect(loadingHtml).not.toContain('data-subject-knowledge-guide="astro"');
    expect(fallbackHtml).toContain('data-astro-decision-status="error"');
    expect(fallbackHtml).toContain("星空银河判断暂不可用");
    expect(fallbackHtml).toContain("现场复核重点");
    expect(fallbackHtml).not.toContain("综合出行判断");
  });

  it("renders the cloud sea pre-result location search panel without result dashboard chrome", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));

    expect(html).toContain("地点搜索与范围选择");
    expect(html).toContain("预报范围选择");
    expect(html).toContain('aria-label="目的地"');
    expect(html).toContain('data-current-location-button="true"');
    expect(html).toContain("查看云海拍摄判断");
    expect(html).not.toContain("CloudSeaResultPage");
    expect(html).not.toContain("CloudSeaTopResultHeader");
    expect(html).not.toContain("CloudSeaScoreCard");
    expect(html).not.toContain("专业小时数据");
  });

  it("shows browser current location as a compact cloud sea selection that enables the CTA", () => {
    const currentLocation = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      reverseGeocode: {
        available: true,
        name: "黄浦区",
        address: "上海市黄浦区",
        province: "上海市",
        city: "上海市",
        district: "黄浦区",
        latitudeGcj02: 31.2285,
        longitudeGcj02: 121.4782,
      },
    });
    const html = renderToStaticMarkup(
      React.createElement(ScenarioSearchPanel, {
        config: cloudSeaScenarioConfig,
        selectedLocation: currentLocation,
      }),
    );

    expect(html).toContain("当前定位");
    expect(html).toContain("黄浦区");
    expect(html).toContain("上海市 / 上海市 / 黄浦区");
    expect(html).toContain("判断范围");
    expect(html).toContain("未来48小时");
    expect(html).toContain("海拔将在生成判断时补全");
    expect(html).toContain("坐标信息");
    expect(html).toContain("查看云海拍摄判断");
    expect(html).not.toContain('disabled="">查看云海拍摄判断</button>');
  });

  it("builds cloud sea current-location requests with WGS84 coordinates and no spot id", () => {
    const currentLocation = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
    });
    const payload = buildForecastRequestPayload(currentLocation, "48h", "cloud_sea", {
      timezone: "Asia/Shanghai",
    });
    const url = new URL(
      buildForecastUrlFromSelectedLocation(currentLocation, "48h", "cloud_sea", {
        timezone: "Asia/Shanghai",
      }),
      "http://localhost:3000",
    );

    expect(payload).toMatchObject({
      name: "当前位置",
      source: "browser_geolocation",
      coordinateSource: "browser_geolocation",
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      horizon: "48h",
      target: "cloud_sea",
      timezone: "Asia/Shanghai",
    });
    expect(payload.photoSpotId).toBeUndefined();
    expect(url.searchParams.get("target")).toBe("cloud_sea");
    expect(url.searchParams.get("coordinateSource")).toBe("browser_geolocation");
    expect(url.searchParams.get("latWgs84")).toBe("31.2304");
    expect(url.searchParams.get("lngWgs84")).toBe("121.4737");
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("photoSpotId")).toBeNull();
  });

  it("keeps locator button styling and geolocation logic out of scenario page files", () => {
    const scenarioSource = readFileSync(
      fileURLToPath(new URL("../components/scenario-module-page.tsx", import.meta.url)),
      "utf8",
    );
    const cloudSeaPageSource = readFileSync(
      fileURLToPath(new URL("./cloud-sea/page.tsx", import.meta.url)),
      "utf8",
    );
    const glowPageSource = readFileSync(
      fileURLToPath(new URL("./glow/page.tsx", import.meta.url)),
      "utf8",
    );
    const astroPageSource = readFileSync(
      fileURLToPath(new URL("./astro/page.tsx", import.meta.url)),
      "utf8",
    );

    for (const source of [scenarioSource, cloudSeaPageSource, glowPageSource, astroPageSource]) {
      expect(source).not.toContain("data-current-location-button");
      expect(source).not.toContain("absolute right-1.5 top-1/2");
      expect(source).not.toContain("navigator.geolocation");
      expect(source).not.toContain("reverse-geocode");
      expect(source).not.toContain("requestBrowserCurrentCoordinates");
      expect(source).not.toContain("selectedLocationFromBrowserGeolocation");
    }
    expect(glowPageSource).toContain("ScenarioModulePage");
    expect(glowPageSource).not.toContain("SubjectControlPanel");
    expect(glowPageSource).not.toContain("PlaceSearchCard");
    expect(astroPageSource).toContain("ScenarioModulePage");
    expect(astroPageSource).not.toContain("SubjectControlPanel");
    expect(astroPageSource).not.toContain("PlaceSearchCard");
  });

  it("cloud sea page reads General deep-link query params and preselects context", () => {
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaPage, {
        searchParams: subjectDeepLinkParams("cloud_sea"),
      }),
    );

    expect(html).toContain("来自综合判断");
    expect(html).toContain("地点：黄山光明顶");
    expect(html).toContain("日期：2026-05-20");
    expect(html).toContain("窗口：");
    expect(html).toContain("05:00");
    expect(html).toContain("返回综合判断");
    expect(html).toContain('href="/forecast?target=general"');
    expect(html).toContain('data-cloud-sea-page-mode="loading"');
    expect(html).toContain('data-testid="decision-loading-template"');
    expect(html).toContain('data-testid="decision-context-card"');
    expect(html).toContain('data-cloud-sea-loading="shared-template"');
    expect(html).not.toContain('data-cloud-sea-loading="full-width"');
    expect(html).toContain("地点 / 查询");
    expect(html).toContain("预报范围");
    expect(html).toContain("分析目标");
    expect(html).toContain("云海拍摄判断");
    expect(html).not.toContain("地点搜索与范围选择");
    expect(html).not.toContain("坐标信息");
    expect(html).not.toContain("WGS84");
    expect(html).not.toContain("GCJ-02");
    expect(html).not.toContain("经度");
    expect(html).not.toContain("纬度");
    expect(html).not.toContain("30.1328");
    expect(html).not.toContain("118.171");
  });

  it("renders the glow entry page without the popular spot placeholder", () => {
    const html = renderToStaticMarkup(React.createElement(GlowPage));

    expect(html).not.toContain("热门朝霞晚霞机位");
    expect(html).not.toContain("热门朝霞机位");
    expect(html).not.toContain("热门晚霞机位");
    expect(html).toContain("地点搜索与范围选择");
    expect(html).toContain('data-subject-control-panel="true"');
    expect(html).toContain('data-subject-control-panel-target="glow"');
    expect(html).toContain('data-subject-knowledge-guide="glow"');
    expect(html).not.toContain('data-glow-decision-panel="true"');
    expect(html).not.toContain('data-quick-location-section="true"');
    expect(html).not.toContain("常用机位");
    for (const label of cloudSeaQuickSpotLabels) {
      expect(html).not.toContain(label);
      expect(hasExactButton(html, label)).toBe(false);
    }
    expect(html).toContain("预报范围选择");
    expect(html).toContain("未来24小时");
    expect(html).toContain("未来48小时");
    expect(html).toContain("未来72小时");
    expect(html).toContain("未来7天");
    expect(html).toContain("分析题材");
    expect(html).toContain("查看朝霞晚霞判断");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>查看朝霞晚霞判断<\/button>/);
    expect(html).toContain("朝霞晚霞判断需要看什么");
    expect(html).toContain("日出日落时间");
    expect(html).toContain("中高云条件");
    expect(html).toContain("低云遮挡风险");
    expect(html).toContain("能见度与通透度");
    expect(html).toContain("地形遮挡");
    expect(html).toContain("风与降水");
    expect(html).toContain('data-current-location-button="true"');
    expect(html).toContain("浏览器定位仅用于本次朝霞晚霞判断，不会公开显示。");
    expect(html).not.toContain("数据说明");
    expect(html).not.toContain("当前为体验模式");
    expect(html).not.toContain("演示天气数据");
    expect(html).not.toContain("体验模式");
    expect(html).not.toMatch(/\bmock\b|\bdemo\b|测试数据|开发模式|开发环境|provider|debug/i);
  });

  it("keeps the glow entry layout responsive without fixed wide columns", () => {
    const html = renderToStaticMarkup(React.createElement(GlowPage));

    expect(html).toContain("min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)]");
    expect(html).toContain("min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)]");
    expect(html).toContain("relative min-w-0 w-full");
    expect(html).toContain("pr-12");
    expect(html).toContain('data-subject-control-panel="true"');
    expect(html).toContain("sm:grid-cols-2 xl:grid-cols-3");
  });

  it("keeps the astro entry layout responsive without fixed wide columns", () => {
    const html = renderToStaticMarkup(React.createElement(AstroPage));
    const subjectSectionStart = html.indexOf('data-subject-scenario-target="astro"');
    const footerStart = html.indexOf("<footer", subjectSectionStart);
    const subjectSectionHtml = html.slice(
      subjectSectionStart,
      footerStart === -1 ? undefined : footerStart,
    );

    expect(html).toContain("min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)]");
    expect(html).toContain("min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)]");
    expect(html).toContain("relative min-w-0 w-full");
    expect(html).toContain("pr-12");
    expect(html).toContain('data-subject-control-panel="true"');
    expect(html).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(html).not.toContain(
      "min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)_clamp",
    );
    expect(subjectSectionHtml).not.toMatch(/w-\[(?:[1-9]\d{3,})px\]|min-w-\[(?:[1-9]\d{3,})px\]/);
  });

  it("builds glow current-location requests with WGS84 coordinates and no spot id", () => {
    const currentLocation = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
    });
    const payload = buildForecastRequestPayload(currentLocation, "72h", "glow", {
      timezone: "Asia/Shanghai",
    });
    const url = new URL(
      buildForecastUrlFromSelectedLocation(currentLocation, "72h", "glow", {
        timezone: "Asia/Shanghai",
      }),
      "http://localhost:3000",
    );

    expect(payload).toMatchObject({
      name: "当前位置",
      source: "browser_geolocation",
      coordinateSource: "browser_geolocation",
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      horizon: "72h",
      target: "glow",
      timezone: "Asia/Shanghai",
    });
    expect(payload.photoSpotId).toBeUndefined();
    expect(url.searchParams.get("target")).toBe("glow");
    expect(url.searchParams.get("coordinateSource")).toBe("browser_geolocation");
    expect(url.searchParams.get("latWgs84")).toBe("31.2304");
    expect(url.searchParams.get("lngWgs84")).toBe("121.4737");
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("photoSpotId")).toBeNull();
  });

  it("builds astro current-location requests with WGS84 coordinates and no spot id", () => {
    const currentLocation = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
    });
    const payload = buildForecastRequestPayload(currentLocation, "7d", "astro", {
      timezone: "Asia/Shanghai",
    });
    const url = new URL(
      buildForecastUrlFromSelectedLocation(currentLocation, "7d", "astro", {
        timezone: "Asia/Shanghai",
      }),
      "http://localhost:3000",
    );

    expect(payload).toMatchObject({
      name: "当前位置",
      source: "browser_geolocation",
      coordinateSource: "browser_geolocation",
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      horizon: "7d",
      target: "astro",
      timezone: "Asia/Shanghai",
    });
    expect(payload.photoSpotId).toBeUndefined();
    expect(url.searchParams.get("target")).toBe("astro");
    expect(url.searchParams.get("coordinateSource")).toBe("browser_geolocation");
    expect(url.searchParams.get("latWgs84")).toBe("31.2304");
    expect(url.searchParams.get("lngWgs84")).toBe("121.4737");
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("photoSpotId")).toBeNull();
  });

  it("glow page reads General deep-link query params and preselects context", () => {
    const html = renderToStaticMarkup(
      React.createElement(GlowPage, {
        searchParams: subjectDeepLinkParams("glow"),
      }),
    );

    expect(html).toContain("来自综合判断");
    expect(html).toContain("地点：黄山光明顶");
    expect(html).toContain("日期：2026-05-20");
    expect(html).toContain("17:56");
    expect(html).toContain("返回综合判断");
    expect(html).not.toContain("朝霞晚霞判断需要看什么");
  });

  it("builds complete forecast query URLs for each scenario CTA", () => {
    for (const config of scenarioPageConfigs) {
      const url = new URL(
        buildForecastUrl(samplePlace, config.defaultHorizon, config.target),
        "http://localhost:3000",
      );

      expect(url.pathname).toBe("/forecast");
      expect(url.searchParams.get("target")).toBe(config.target);
      expect(url.searchParams.get("horizon")).toBe(config.defaultHorizon);
      expect(url.searchParams.get("name")).toBe(samplePlace.name);
      expect(url.searchParams.get("source")).toBe(samplePlace.source);
      expect(url.searchParams.get("lat")).toBe(String(samplePlace.latitudeGcj02));
      expect(url.searchParams.get("lng")).toBe(String(samplePlace.longitudeGcj02));
      expect(url.searchParams.get("latWgs84")).toBe(String(samplePlace.latitudeWgs84));
      expect(url.searchParams.get("lngWgs84")).toBe(String(samplePlace.longitudeWgs84));
      expect(url.searchParams.get("locationId")).toBe(samplePlace.matchedLocationId);
      expect(url.searchParams.get("photoSpotId")).toBe(samplePlace.matchedPhotoSpotId);
    }
  });

  it("replaces placeholder copy with Simplified Chinese scenario content", () => {
    const serialized = JSON.stringify(scenarioPageConfigs);
    const searchPanelHtml = renderToStaticMarkup(
      React.createElement(ScenarioSearchPanel, { config: cloudSeaScenarioConfig }),
    );

    expect(searchPanelHtml).toContain("地点搜索与范围选择");
    expect(searchPanelHtml).toContain("预报范围选择");
    expect(searchPanelHtml).toContain("查看云海拍摄判断");
    expect(searchPanelHtml).toContain("分析题材");
    expect(serialized).not.toContain("热门云海机位");
    expect(serialized).toContain("云海判断需要关注什么");
    expect(serialized).not.toContain("云海判断重点");
    expect(serialized).not.toContain("白墙风险说明");
    expect(serialized).toContain(
      "选择地点后，系统会结合水汽、低云、地形、风速、光线窗口和降水时段判断云海形成、可拍机会与白墙风险。",
    );
    expect(serialized).toContain(
      "湿度、露点差和降水前后决定云雾能不能形成。湿度高、露点差小，更容易出现低云或雾气。",
    );
    expect(serialized).toContain(
      "云在脚下是云海，云在身上是白墙，云在头上多半只是阴天。低云高度与机位海拔的关系很关键。",
    );
    expect(serialized).not.toContain("热门朝霞晚霞机位");
    expect(serialized).not.toContain("热门朝霞机位");
    expect(serialized).not.toContain("热门晚霞机位");
    expect(serialized).not.toContain("热门星空银河机位");
    expect(serialized).not.toContain("热门星空机位");
    expect(serialized).not.toContain("热门银河机位");
    expect(serialized).toContain("星空银河判断需要看什么");
    expect(serialized).toContain("天文黑夜");
    expect(serialized).toContain("无月黑夜");
    expect(serialized).toContain("光污染与地形");
    expect(serialized).toContain("部分地形或云层数据仍需结合临近预报复核。");
    expect(serialized).not.toMatch(/coming soon|placeholder|todo|mock|fixture/i);
    expect(serialized).not.toContain("模块准备中");
    expect(serialized).not.toContain("本地模拟");
    expect(serialized).not.toContain("体验模式");
    expect(serialized).not.toContain("演示数据");
    expect(serialized).not.toContain("本地天文计算");
    expect(serialized).not.toContain("本地算法");
    expect(serialized).not.toMatch(/\bAI\b/);
  });

  it("renders the astro entry page with the shared public search and judgment layout", () => {
    const html = renderToStaticMarkup(React.createElement(AstroPage));

    expect(html).not.toContain("热门星空银河机位");
    expect(html).not.toContain("热门星空机位");
    expect(html).not.toContain("热门银河机位");
    expect(html).toContain("地点搜索与范围选择");
    expect(html).toContain('data-subject-control-panel="true"');
    expect(html).toContain('data-subject-control-panel-target="astro"');
    expect(html).toContain('data-subject-knowledge-guide="astro"');
    expect(html).not.toContain('data-astro-decision-panel="true"');
    expect(countOccurrences(html, 'data-subject-knowledge-card="astro"')).toBe(6);
    expect(html).not.toContain('data-quick-location-section="true"');
    expect(html).not.toContain("常用机位");
    expect(html).not.toContain("专题设置");
    expect(html).not.toContain("题材预设");
    for (const label of cloudSeaQuickSpotLabels) {
      expect(html).not.toContain(label);
      expect(hasExactButton(html, label)).toBe(false);
    }
    expect(html).toContain("预报范围选择");
    expect(html).toContain("未来24小时");
    expect(html).toContain("未来48小时");
    expect(html).toContain("未来72小时");
    expect(html).toContain("未来7天");
    expect(html).toContain("分析题材");
    expect(html).toContain("查看星空银河判断");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>查看星空银河判断<\/button>/);
    expect(html).toContain("星空银河判断需要看什么");
    expect(html).toContain("天文黑夜");
    expect(html).toContain("月相与月光");
    expect(html).toContain("无月黑夜");
    expect(html).toContain("银河窗口");
    expect(html).toContain("云量与能见度");
    expect(html).toContain("光污染与地形");
    expect(html).toContain('data-current-location-button="true"');
    expect(html).toContain("浏览器定位仅用于本次星空银河判断，不会公开显示。");
    expect(html).not.toContain("数据提醒");
    expect(html).not.toContain("当前为体验模式");
    expect(html).not.toContain("体验模式");
    expect(html).not.toContain("演示数据");
    expect(html).not.toContain("本地天文计算");
    expect(html).not.toContain("本地算法");
    expect(html).not.toMatch(/\bmock\b|\bdemo\b|测试数据|开发模式|开发环境|provider|debug/i);
  });

  it("astro page reads General deep-link query params and preselects context", () => {
    const html = renderToStaticMarkup(
      React.createElement(AstroPage, {
        searchParams: subjectDeepLinkParams("astro"),
      }),
    );

    expect(html).toContain("来自综合判断");
    expect(html).toContain("地点：黄山光明顶");
    expect(html).toContain("日期：2026-05-20");
    expect(html).toContain("01:10");
    expect(html).toContain("返回综合判断");
    expect(html).not.toContain("星空银河判断需要看什么");
  });

  it("shows a friendly fallback for incomplete subject deep-link params", () => {
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaPage, {
        searchParams: {
          source: "general",
          target: "cloud_sea",
          date: "2026-05-20",
        },
      }),
    );

    expect(html).toContain("未找到完整的综合判断上下文，请重新选择地点。");
    expect(html).toContain("无法自动打开专项判断");
    expect(html).toContain("重新选择地点");
  });

  it("does not call external APIs while loading static scenario modules", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("scenario pages should not call network during static load");
    });
    vi.stubGlobal("fetch", fetchMock);

    CloudSeaPage({});
    GlowPage({});
    AstroPage({});
    for (const config of scenarioPageConfigs) {
      buildForecastUrl(samplePlace, config.defaultHorizon, config.target);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
