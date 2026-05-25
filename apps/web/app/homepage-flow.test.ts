import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ForecastCalculationResult, ForecastQueryInput } from "@photo-weather/shared";
import { describe, expect, it, vi } from "vitest";
import {
  HomepageSearchPanel,
  homepageDefaultHorizon,
  homepageDefaultTarget,
  homepageTargetHelperText,
} from "../components/homepage-search-panel";
import HomePage from "./page";
import { ForecastResultClient } from "./forecast/forecast-result-client";
import {
  buildForecastUrl,
  PlaceSearchErrorAlert,
  publicPlaceSearchUnavailableMessage,
  sanitizePlaceSearchErrorMessage,
  type PlaceSearchResult,
} from "../components/place-search-card";
import {
  buildHomepageLayerStatus,
  HomepageDecisionSummary,
  homepagePopularSpots,
  HomepagePopularSpotsSection,
  HomepageWeatherLayer,
  homepagePopularSpotToSelectedLocation,
  HomepageWorkbench,
} from "../components/homepage-workbench";
import { selectedLocationFromSearchResult } from "../components/selected-location";
import { SourceDiagnosticsPanel } from "./forecast/forecast-result-client";
import {
  astroScenarioConfig,
  cloudSeaScenarioConfig,
  glowScenarioConfig,
} from "./scenario-configs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/forecast",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

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

const laojunshanPlace: PlaceSearchResult = {
  id: "mock-place-laojunshan-jinding",
  name: "老君山金顶",
  address: "河南省洛阳市栾川县老君山景区金顶",
  province: "河南省",
  city: "洛阳市",
  district: "栾川县",
  source: "local_photo_spot",
  locationType: "viewpoint",
  matchedPhotoSpotId: "spot-laojunshan-jinding",
  matchedLocationId: "location-laojunshan",
  latitudeGcj02: 33.7867,
  longitudeGcj02: 111.6462,
  latitudeWgs84: 33.7852,
  longitudeWgs84: 111.6402,
  elevation: 2217,
  isVerified: false,
};

const generalForecastQuery: ForecastQueryInput = {
  name: samplePlace.name,
  source: samplePlace.source,
  latitudeGcj02: samplePlace.latitudeGcj02,
  longitudeGcj02: samplePlace.longitudeGcj02,
  latitudeWgs84: samplePlace.latitudeWgs84,
  longitudeWgs84: samplePlace.longitudeWgs84,
  horizon: homepageDefaultHorizon,
  target: homepageDefaultTarget,
  locationId: samplePlace.matchedLocationId,
  photoSpotId: samplePlace.matchedPhotoSpotId,
};

function hasExactButton(html: string, label: string): boolean {
  return new RegExp(`<button[^>]*>\\s*${label}\\s*</button>`).test(html);
}

describe("homepage forecast flow", () => {
  it("uses general analysis as the homepage forecast target", () => {
    const url = new URL(
      buildForecastUrl(samplePlace, homepageDefaultHorizon, homepageDefaultTarget),
      "http://localhost:3000",
    );

    expect(url.pathname).toBe("/forecast");
    expect(url.searchParams.get("target")).toBe("general");
    expect(url.searchParams.get("horizon")).toBe("48h");
    expect(url.searchParams.get("latWgs84")).toBe(String(samplePlace.latitudeWgs84));
    expect(url.searchParams.get("lngWgs84")).toBe(String(samplePlace.longitudeWgs84));
    expect(url.searchParams.get("latitudeWgs84")).toBe(String(samplePlace.latitudeWgs84));
    expect(url.searchParams.get("longitudeWgs84")).toBe(String(samplePlace.longitudeWgs84));
    expect(url.searchParams.get("source")).toBe("local_photo_spot");
    expect(url.searchParams.get("elevationMeters")).toBe(String(samplePlace.elevation));
  });

  it("keeps selected location coordinates in the forecast URL", () => {
    const url = new URL(
      buildForecastUrl(laojunshanPlace, homepageDefaultHorizon, homepageDefaultTarget),
      "http://localhost:3000",
    );

    expect(url.searchParams.get("name")).toBe("老君山金顶");
    expect(url.searchParams.get("latWgs84")).toBe("33.7852");
    expect(url.searchParams.get("lngWgs84")).toBe("111.6402");
    expect(url.searchParams.get("latGcj02")).toBe("33.7867");
    expect(url.searchParams.get("lngGcj02")).toBe("111.6462");
    expect(url.searchParams.get("photoSpotId")).toBe("spot-laojunshan-jinding");
  });

  it("shows a professional empty weather layer before a location is selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomepageWeatherLayer, {
        location: null,
        state: { status: "idle", result: null },
      }),
    );

    expect(html).toContain("拍摄天气图层");
    expect(html).toContain("等待选择拍摄地点");
    expect(html).toContain("请先搜索或选择常用机位。");
    expect(html).toContain("云层趋势");
    expect(html).toContain("日出窗口");
    expect(html).toContain("云隙机会");
    expect(html).toContain("风速变化");
    expect(html).not.toContain("默认演示图层");
    expect(html).not.toContain("示例云层");
  });

  it("updates the center layer title after selecting a location", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageWeatherLayer, {
        location,
        state: { status: "loading", result: null },
      }),
    );

    expect(html).toContain("老君山金顶 拍摄天气图层");
    expect(html).toContain("正在加载该地点天气图层...");
    expect(html).not.toContain("默认演示图层");
    expect(html).not.toContain("黄山光明顶 拍摄天气图层");
  });

  it("keeps selected location visible when weather layer data is unavailable", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageWeatherLayer, {
        location,
        state: { status: "fallback", result: null },
      }),
    );

    expect(html).toContain("老君山金顶");
    expect(html).toContain("该地点天气图层暂不可用，请稍后重试或查看结果页数据来源。");
    expect(html).not.toContain("默认演示图层");
  });

  it("shows a professional empty decision summary before a location is selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomepageDecisionSummary, {
        location: null,
        state: { status: "idle", result: null },
      }),
    );

    expect(html).toContain("拍摄判断摘要");
    expect(html).toContain("等待选择拍摄地点");
    expect(html).toContain("地点");
    expect(html).toContain("尚未选择");
    expect(html).toContain("综合指数");
    expect(html).toContain("--");
    expect(html).toContain("选择地点后生成判断");
    expect(html).toContain("最佳窗口");
    expect(html).toContain("待计算");
    expect(html).toContain("主要风险");
    expect(html).toContain("选择地点后，将生成综合指数、最佳窗口、主要风险和拍摄建议。");
    expect(html).not.toContain("演示状态");
    expect(html).not.toContain("演示分析");
  });

  it("updates the right summary after selecting a spot", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const result = {
      overallScore: 82,
      recommendationLabel: "值得出发",
      weatherDataMode: "real",
      generatedAt: "2026-05-25T04:00:00+08:00",
      bestWindows: [
        {
          startTime: "2026-05-25T05:10:00+08:00",
          endTime: "2026-05-25T06:20:00+08:00",
          label: "朝霞窗口",
          score: 82,
        },
      ],
      riskFlags: [{ label: "山顶强风" }],
      weatherSourceSummaries: [],
    } as unknown as ForecastCalculationResult;
    const html = renderToStaticMarkup(
      React.createElement(HomepageDecisionSummary, {
        location,
        state: { status: "ready", result },
      }),
    );

    expect(html).toContain("老君山金顶 拍摄判断");
    expect(html).toContain("82");
    expect(html).toContain("值得出发");
    expect(html).toContain("山顶强风");
    expect(html).not.toContain("尚未选择");
    expect(html).not.toContain("演示状态");
  });

  it("derives partial layer status from provider source summaries", () => {
    const status = buildHomepageLayerStatus({
      weatherDataMode: "real",
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
          availableFields: ["temperature"],
          missingFields: [],
          messageZh: "和风天气通过。",
        },
        {
          providerCode: "open_meteo",
          providerLabelZh: "Open-Meteo",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: false,
          status: "failed",
          availableFields: [],
          missingFields: ["weather"],
          errorCategory: "timeout",
          messageZh: "Open-Meteo 请求超时",
        },
      ],
    } as unknown as ForecastCalculationResult);

    expect(status).toBe("partial");
  });

  it("renders specific provider diagnostics on result pages", () => {
    const result = {
      weatherDataMode: "real",
      calendarBasis: {
        coordinateSource: "高德地图 WGS84 坐标",
      },
      astroDataSourceLabelZh: "本地天文服务计算",
      weatherFusionSummary: {
        primarySource: "和风天气",
        auxiliarySources: [],
        professionalSourceStatus: "专业增强：meteoblue 失败",
        confidenceLevel: "medium",
        conflictStatusZh: "无明显冲突",
        dataStatusZh: "天气数据：和风天气；数据置信度：中",
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
          availableFields: ["temperature"],
          missingFields: [],
          messageZh: "和风天气通过。",
        },
        {
          providerCode: "open_meteo",
          providerLabelZh: "Open-Meteo",
          dataMode: "real",
          enabled: true,
          realCallEnabled: true,
          attempted: true,
          success: false,
          status: "failed",
          availableFields: [],
          missingFields: ["weather"],
          errorCategory: "timeout",
          messageZh: "Open-Meteo 请求超时",
        },
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
          errorCategory: "invalid_key",
          messageZh: "meteoblue Key 无效或权限不足",
        },
      ],
    } as unknown as ForecastCalculationResult;
    const html = renderToStaticMarkup(React.createElement(SourceDiagnosticsPanel, { result }));

    expect(html).toContain("数据来源");
    expect(html).toContain("天气主源");
    expect(html).toContain("和风天气 通过");
    expect(html).toContain("失败（timeout）：Open-Meteo 请求超时");
    expect(html).toContain("失败（invalid_key）：meteoblue Key 无效或权限不足");
    expect(html).toContain("本地天文服务计算");
    expect(html).not.toContain("已接入数据源");
    expect(html).not.toContain("secret");
  });

  it("keeps the forecast horizon selector but hides the visible target selector", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageSearchPanel));

    expect(html).toContain("预报范围");
    expect(html).toContain("未来24小时");
    expect(html).toContain("未来48小时");
    expect(html).toContain("未来72小时");
    expect(html).toContain("未来7天");
    expect(html).toContain("请先选择一个地点");
    expect(html).toContain(homepageTargetHelperText);
    expect(html).not.toContain("分析目标");
    expect(html).not.toContain("查看拍摄天气分析");
    expect(hasExactButton(html, "综合判断")).toBe(false);
    expect(hasExactButton(html, "云海")).toBe(false);
    expect(hasExactButton(html, "朝霞晚霞")).toBe(false);
    expect(hasExactButton(html, "星空银河")).toBe(false);
  });

  it("keeps the forecast CTA guided until a location is selected", () => {
    const HomepageSearchPanelComponent = HomepageSearchPanel as React.ComponentType<
      NonNullable<Parameters<typeof HomepageSearchPanel>[0]>
    >;
    const emptyHtml = renderToStaticMarkup(
      React.createElement(HomepageSearchPanelComponent, { selectedLocation: null }),
    );
    const selectedHtml = renderToStaticMarkup(
      React.createElement(HomepageSearchPanelComponent, {
        selectedLocation: selectedLocationFromSearchResult(samplePlace),
      }),
    );

    expect(emptyHtml).toContain("请先选择一个地点");
    expect(emptyHtml).toContain("disabled");
    expect(selectedHtml).toContain("生成拍摄判断");
    expect(selectedHtml).not.toContain("请先选择一个地点");
  });

  it("renders operational popular spot cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomepagePopularSpotsSection, { onSelectSpot: vi.fn() }),
    );
    const laojunshan = homepagePopularSpots.find((spot) => spot.name === "老君山金顶");

    expect(laojunshan).toBeDefined();
    expect(html).toContain("精选机位");
    expect(html).toContain("快速选择常用风光摄影机位，进入对应题材判断。");
    expect(html).toContain("老君山金顶");
    expect(html).toContain("云海");
    expect(html).toContain("选择机位");
    expect(html).toContain("<button");
    expect(homepagePopularSpotToSelectedLocation(laojunshan!).displayName).toBe("老君山金顶");
    expect(homepagePopularSpotToSelectedLocation(laojunshan!).photoSpotId).toBe(
      "spot-laojunshan-jinding",
    );
  });

  it("keeps the homepage workspace responsive without fixed wide columns", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageWorkbench));

    expect(html).toContain("minmax(0,1fr)");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("xl:grid-cols-4");
    expect(html).not.toMatch(/w-\[(?:[1-9]\d{3,})px\]|min-w-\[(?:[1-9]\d{3,})px\]/);
  });

  it("keeps public homepage copy product-friendly", () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));

    expect(html).toContain("面向风光摄影的拍摄天气决策工具");
    expect(html).toContain("实时决策工作台");
    expect(html).toContain("精选机位");
    expect(html).toContain("出发前看这几项");
    expect(html).not.toContain("体验模式");
    expect(html).not.toContain("默认演示图层");
    expect(html).not.toContain("演示分析");
    expect(html).not.toContain("演示状态");
    expect(html).not.toContain("示例云层");
    expect(html).not.toContain("示例日出窗口");
    expect(html).not.toContain("示例云缝");
    expect(html).not.toContain("示例风速");
    expect(html).not.toContain("当前模式");
    expect(html).not.toContain("热门机位");
    expect(html).not.toContain("四步完成一次出发判断");
    expect(html).not.toMatch(
      /\bmock\b|\bfixture\b|\bdemo\b|本地模拟|不含真实预报|开发环境|调试|占位/i,
    );
  });

  it("does not render raw Prisma details in the public place search error alert", () => {
    const rawDatabaseError =
      "Invalid `requireLocationDelegate(client).findMany()` invocation in C:\\Users\\konne\\Desktop\\photo-weather-ai\\packages\\db\\src\\locations.ts:141:58\nCan't reach database server at `127.0.0.1:15432`";
    const html = renderToStaticMarkup(
      React.createElement(PlaceSearchErrorAlert, { message: rawDatabaseError }),
    );

    expect(sanitizePlaceSearchErrorMessage(rawDatabaseError)).toBe(
      publicPlaceSearchUnavailableMessage,
    );
    expect(html).toContain(publicPlaceSearchUnavailableMessage);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain("Prisma");
    expect(html).not.toContain("requireLocationDelegate");
    expect(html).not.toContain("findMany");
    expect(html).not.toContain("127.0.0.1:15432");
    expect(html).not.toContain("C:\\Users");
    expect(html).not.toContain("locations.ts");
  });

  it("keeps dedicated scenario pages on their fixed forecast targets", () => {
    expect(cloudSeaScenarioConfig.target).toBe("cloud_sea");
    expect(glowScenarioConfig.target).toBe("glow");
    expect(astroScenarioConfig.target).toBe("astro");
  });

  it("displays the general target label on forecast results", () => {
    const html = renderToStaticMarkup(
      React.createElement(ForecastResultClient, { query: generalForecastQuery }),
    );

    expect(html).toContain("分析目标");
    expect(html).toContain("综合判断");
  });
});
