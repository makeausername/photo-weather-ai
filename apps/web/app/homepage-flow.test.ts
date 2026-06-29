import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  forecastHorizonLabels,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastQueryInput,
} from "@photo-weather/shared";
import { describe, expect, it, vi } from "vitest";
import {
  HomepageSearchPanel,
  homepageDefaultHorizon,
  homepageDefaultTarget,
  homepageTargetHelperText,
} from "../components/homepage-search-panel";
import { CurrentLocationButton } from "../components/location-search-input";
import HomePage from "./page";
import { ForecastResultClient } from "./forecast/forecast-result-client";
import {
  buildForecastUrl,
  currentLocationErrorMessage,
  currentLocationErrorMessages,
  buildStateAfterChangeLocation,
  buildStateAfterClearSelection,
  buildStateAfterSearchQueryInput,
  buildStateAfterSearchResultSelection,
  PlaceSearchErrorAlert,
  publicPlaceSearchUnavailableMessage,
  requestBrowserCurrentCoordinates,
  sanitizePlaceSearchErrorMessage,
  shouldShowPlaceSearchResults,
  HorizonSelector,
  type PlaceSearchResult,
} from "../components/place-search-card";
import {
  buildHomepageLayerStatus,
  HomepageGuidancePanel,
  HomepageWorkbench,
} from "../components/homepage-workbench";
import {
  buildForecastRequestPayload,
  buildForecastUrlFromSelectedLocation,
  selectedLocationFromBrowserGeolocation,
  selectedLocationFromSearchResult,
} from "../components/selected-location";
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

const amapNonSeededPlace: PlaceSearchResult = {
  id: "amap:non-seeded-test",
  name: "非种子坐标测试点",
  address: "浙江省杭州市西湖区",
  province: "浙江省",
  city: "杭州市",
  district: "西湖区",
  source: "amap",
  locationType: "scenic_area",
  latitudeGcj02: 30.2495,
  longitudeGcj02: 120.1124,
  latitudeWgs84: 30.2528,
  longitudeWgs84: 120.1078,
  elevation: null,
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

const homepageLayerResult = {
  overallScore: 82,
  recommendationLabel: "值得出发",
  weatherDataMode: "real",
  generatedAt: "2026-05-25T04:00:00+08:00",
  currentWeather: {
    cloudTotal: 72,
    cloudLow: 18,
    cloudMid: 42,
    cloudHigh: 64,
    windSpeed: 4.6,
    windDirection: 260,
    humidity: 68,
    visibility: 18.5,
  },
  astroSummaries: [{ moonPhaseNameZh: "盈凸月" }],
  bestWindows: [
    {
      startTime: "2026-05-25T05:10:00+08:00",
      endTime: "2026-05-25T06:20:00+08:00",
      label: "日出/朝霞窗口",
      score: 82,
    },
    {
      startTime: "2026-05-25T17:40:00+08:00",
      endTime: "2026-05-25T18:50:00+08:00",
      label: "晚霞窗口",
      score: 74,
    },
    {
      startTime: "2026-05-25T22:10:00+08:00",
      endTime: "2026-05-25T23:40:00+08:00",
      label: "星空/银河窗口",
      score: 68,
    },
    {
      startTime: "2026-05-26T06:00:00+08:00",
      endTime: "2026-05-26T07:10:00+08:00",
      label: "云海窗口",
      score: 63,
    },
  ],
  riskFlags: [{ label: "山顶强风" }],
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
  ],
} as unknown as ForecastCalculationResult;

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
    expect(url.searchParams.get("horizon")).toBe("24h");
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

  it("keeps Amap selected locations WGS84-first and leaves elevation for server enrichment", () => {
    const selectedLocation = selectedLocationFromSearchResult(amapNonSeededPlace);
    const url = new URL(
      buildForecastUrl(amapNonSeededPlace, homepageDefaultHorizon, homepageDefaultTarget),
      "http://localhost:3000",
    );

    expect(selectedLocation).toMatchObject({
      source: "amap",
      latitudeWgs84: 30.2528,
      longitudeWgs84: 120.1078,
      elevationMeters: null,
      elevationSource: "unknown",
      elevationConfidence: "low",
    });
    expect(url.searchParams.get("latWgs84")).toBe("30.2528");
    expect(url.searchParams.get("lngWgs84")).toBe("120.1078");
    expect(url.searchParams.get("elevationMeters")).toBeNull();
    expect(url.searchParams.get("elevationSource")).toBe("unknown");
    expect(url.searchParams.get("elevationConfidence")).toBe("low");
  });

  it("keeps manual text-search locations working without a spot id", () => {
    const manualPlace: PlaceSearchResult = {
      ...amapNonSeededPlace,
      id: "local-location:manual-non-seeded",
      source: "local_location",
      matchedPhotoSpotId: undefined,
      matchedLocationId: "location-manual-non-seeded",
    };
    const selectedLocation = selectedLocationFromSearchResult(manualPlace);
    const url = new URL(
      buildForecastUrl(manualPlace, homepageDefaultHorizon, homepageDefaultTarget),
      "http://localhost:3000",
    );

    expect(selectedLocation).toMatchObject({
      source: "manual",
      latitudeWgs84: 30.2528,
      longitudeWgs84: 120.1078,
      locationId: "location-manual-non-seeded",
    });
    expect(selectedLocation.photoSpotId).toBeUndefined();
    expect(url.searchParams.get("source")).toBe("manual");
    expect(url.searchParams.get("photoSpotId")).toBeNull();
    expect(url.searchParams.get("locationId")).toBe("location-manual-non-seeded");
  });

  it("renders homepage-specific guidance cards before a location is selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomepageGuidancePanel, {
        location: null,
        state: { status: "idle", result: null },
        horizon: homepageDefaultHorizon,
      }),
    );

    expect(html).toContain('data-homepage-guidance-panel="true"');
    expect(html).toContain('data-homepage-card-grid="true"');
    expect(html).toContain("综合出行判断会看什么");
    expect(html).toContain("综合判断");
    expect(html).toContain(forecastHorizonLabels[homepageDefaultHorizon]);
    expect(html).toContain("地点与窗口");
    expect(html).toContain("云层与光线");
    expect(html).toContain("风与湿度");
    expect(html).toContain("能见度与通透");
    expect(html).toContain("月相与夜景");
    expect(html).toContain("降水与风险");
    expect(html).toContain("把城市、景区或地点坐标与所选预报范围绑定");
    expect(html).toContain("01");
    expect(html).toContain("06");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).not.toContain("min-[900px]:grid-rows-[auto_minmax(0,1fr)]");
    expect(html).not.toContain("min-[900px]:auto-rows-fr");
    expect(html).not.toContain("min-[900px]:h-full");
    expect(html).not.toContain("云海判断需要关注什么");
    expect(html).not.toContain("朝霞晚霞判断需要看什么");
    expect(html).not.toContain("星空银河判断需要看什么");
    expect(html).not.toContain('data-homepage-layer-visual="true"');
    expect(html).not.toContain('data-homepage-empty-state="true"');
    expect(html).not.toContain('data-homepage-window-cards="true"');
  });

  it("keeps the same guidance grid while a selected location is loading", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageGuidancePanel, {
        location,
        state: { status: "loading", result: null },
        horizon: homepageDefaultHorizon,
      }),
    );

    expect(html).toContain("老君山金顶");
    expect(html).toContain("正在计算该地点的综合出行判断");
    expect(html).toContain("加载中");
    expect(html).toContain('data-homepage-card-grid="true"');
    expect(html).toContain("地点与窗口");
    expect(html).toContain("降水与风险");
    expect(html).not.toContain("min-[900px]:grid-rows-[auto_minmax(0,1fr)]");
    expect(html).not.toContain("min-[900px]:auto-rows-fr");
    expect(html).not.toContain('data-homepage-layer-visual="true"');
    expect(html).not.toContain("黄山光明顶");
  });

  it("renders compact result cards from the forecast result", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageGuidancePanel, {
        location,
        state: { status: "ready", result: homepageLayerResult },
        horizon: homepageDefaultHorizon,
      }),
    );

    expect(html).toContain("老君山金顶 综合出行判断");
    expect(html).toContain("已根据当前预报生成综合指数、推荐等级、最佳窗口、主要风险、云层风况和当前建议。");
    expect(html).toContain("综合指数");
    expect(html).toContain("82 / 100");
    expect(html).toContain("推荐等级");
    expect(html).toContain("值得出发");
    expect(html).toContain("最佳窗口");
    expect(html).toContain("05:10 - 06:20");
    expect(html).toContain("日出/朝霞窗口");
    expect(html).toContain("主要风险");
    expect(html).toContain("山顶强风");
    expect(html).toContain("云层与风");
    expect(html).toContain("云层 72% / 风 4.6 m/s 260°");
    expect(html).toContain("低云 18%，湿度 68%，能见度 18.5 公里。");
    expect(html).toContain("当前建议");
    expect(html).toContain("根据窗口和风险安排到达时间与备选题材。");
    expect(html).toContain("min-[900px]:grid-rows-[auto_minmax(0,1fr)]");
    expect(html).toContain("min-[900px]:auto-rows-fr");
    expect(html).toContain("min-[900px]:h-full");
    expect(html).not.toContain("和风天气");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("本地天文服务");
    expect(html).not.toContain('data-homepage-layer-visual="true"');
  });

  it("keeps selected location visible when homepage card data is unavailable", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageGuidancePanel, {
        location,
        state: { status: "fallback", result: null },
        horizon: homepageDefaultHorizon,
      }),
    );

    expect(html).toContain("老君山金顶");
    expect(html).toContain("该地点拍摄条件暂不可用，请稍后重试");
    expect(html).toContain("暂不可用");
    expect(html).toContain("地点与窗口");
    expect(html).not.toContain("默认演示图层");
    expect(html).not.toContain('data-homepage-layer-visual="true"');
  });

  it("keeps provider names out of the homepage guidance area", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageGuidancePanel, {
        location,
        state: { status: "ready", result: homepageLayerResult },
        horizon: homepageDefaultHorizon,
      }),
    );

    expect(html).not.toContain("和风天气");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("本地天文服务");
  });

  it("renders the homepage guidance cards on the full page before selection", () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));

    expect(html).toContain("综合出行判断会看什么");
    expect(html).toContain("地点与窗口");
    expect(html).toContain("云层与光线");
    expect(html).toContain("降水与风险");
    expect(html).not.toContain('data-homepage-layer-visual="true"');
    expect(html).not.toContain('data-homepage-location-marker="true"');
    expect(html).not.toContain('data-homepage-window-cards="true"');
  });

  it("formats cloud, wind, and visibility values for homepage result cards", () => {
    const location = selectedLocationFromSearchResult(laojunshanPlace);
    const html = renderToStaticMarkup(
      React.createElement(HomepageGuidancePanel, {
        location,
        state: { status: "ready", result: homepageLayerResult },
        horizon: homepageDefaultHorizon,
      }),
    );

    expect(html).toContain("云层 72% / 风 4.6 m/s 260°");
    expect(html).toContain("低云 18%，湿度 68%，能见度 18.5 公里。");
    expect(html).toContain("4.6 m/s 260°");
    expect(html).toContain("湿度");
    expect(html).toContain("68%");
    expect(html).toContain("能见度");
    expect(html).toContain("18.5 公里");
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
    expect(html).toContain("基础天气可用");
    expect(html).toContain("云层辅助暂不可用：响应超时");
    expect(html).toContain("专业增强暂不可用：配置或权限未通过");
    expect(html).toContain("本地天文服务计算");
    expect(html).not.toContain("和风天气");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
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
    expect(html).toContain("请先选择地点");
    expect(html).toContain(homepageTargetHelperText);
    expect(html).not.toContain("分析目标");
    expect(html).not.toContain("查看拍摄天气分析");
    expect(hasExactButton(html, "综合判断")).toBe(false);
    expect(hasExactButton(html, "云海")).toBe(false);
    expect(hasExactButton(html, "朝霞晚霞")).toBe(false);
    expect(hasExactButton(html, "星空银河")).toBe(false);
  });

  it("renders extended horizon options as disabled when the access gate locks them", () => {
    const html = renderToStaticMarkup(
      React.createElement(HorizonSelector, {
        value: "24h",
        onChange: () => undefined,
        disabledOptions: new Set<ForecastHorizon>(["48h", "72h", "7d"]),
      }),
    );

    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain(forecastHorizonLabels["24h"]);
    expect(html).toContain(forecastHorizonLabels["48h"]);
    expect(html).toContain(forecastHorizonLabels["72h"]);
    expect(html).toContain(forecastHorizonLabels["7d"]);
  });

  it("does not render popular spot sections on the homepage", () => {
    const panelHtml = renderToStaticMarkup(React.createElement(HomepageSearchPanel));
    const pageHtml = renderToStaticMarkup(React.createElement(HomePage));

    expect(panelHtml).not.toContain("常用机位");
    expect(panelHtml).not.toContain("黄山光明顶");
    expect(panelHtml).not.toContain("老君山金顶");
    expect(panelHtml).not.toContain("三清山女神峰");
    expect(panelHtml).not.toContain("武功山金顶");
    expect(pageHtml).not.toContain("精选机位");
    expect(pageHtml).not.toContain("黄山光明顶");
    expect(pageHtml).not.toContain("老君山金顶");
    expect(pageHtml).not.toContain("三清山女神峰");
    expect(pageHtml).not.toContain("武功山金顶");
  });

  it("renders the current-location control as an embedded input icon button", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageSearchPanel));
    const wrapperIndex = html.indexOf('data-current-location-input-wrapper="true"');
    const inputIndex = html.indexOf('aria-label="目的地"', wrapperIndex);
    const buttonIndex = html.indexOf('data-current-location-button="true"', wrapperIndex);

    expect(wrapperIndex).toBeGreaterThanOrEqual(0);
    expect(inputIndex).toBeGreaterThan(wrapperIndex);
    expect(buttonIndex).toBeGreaterThan(inputIndex);
    expect(html).toContain('aria-label="使用当前位置"');
    expect(html).toContain('title="使用当前位置"');
    expect(html).toContain("relative min-w-0 w-full");
    expect(html).toContain("pr-12");
    expect(html).toContain("absolute right-1.5 top-1/2");
    expect(html).toContain("h-8 w-8");
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(hasExactButton(html, "定位")).toBe(false);
    expect(hasExactButton(html, "定位中")).toBe(false);
    expect(html).toContain("浏览器定位仅用于本次天气判断，不会公开显示。");
  });

  it("keeps manual search submit available with the embedded locator layout", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageSearchPanel));

    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>搜索地点<\/button>/);
    expect(html).toContain('aria-label="目的地"');
    expect(html).toContain('data-current-location-button="true"');
  });

  it("keeps the embedded current-location control compact on mobile", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageSearchPanel));

    expect(html).toContain("relative min-w-0 w-full");
    expect(html).toContain("absolute right-1.5 top-1/2");
    expect(html).toContain("h-8 w-8");
    expect(html).not.toContain("flex min-w-0 gap-2");
    expect(html).not.toMatch(/w-\[(?:[1-9]\d{2,})px\]|min-w-\[(?:[1-9]\d{2,})px\]/);
  });

  it("maps unavailable and denied browser geolocation to friendly Chinese messages", async () => {
    await expect(requestBrowserCurrentCoordinates(undefined)).rejects.toThrow(
      currentLocationErrorMessages.unavailable,
    );

    const deniedNavigator = {
      geolocation: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code: 1 } as GeolocationPositionError);
        }),
      },
    };
    const timeoutNavigator = {
      geolocation: {
        getCurrentPosition: vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
          error?.({ code: 3 } as GeolocationPositionError);
        }),
      },
    };

    await expect(requestBrowserCurrentCoordinates(deniedNavigator)).rejects.toThrow(
      currentLocationErrorMessages.denied,
    );
    await expect(requestBrowserCurrentCoordinates(timeoutNavigator)).rejects.toThrow(
      currentLocationErrorMessages.timeout,
    );
    expect(currentLocationErrorMessage({ code: 3 } as GeolocationPositionError)).toBe(
      currentLocationErrorMessages.timeout,
    );
    expect(currentLocationErrorMessage({ code: 2 } as GeolocationPositionError)).toBe(
      currentLocationErrorMessages.generic,
    );
  });

  it("reads browser geolocation success coordinates as WGS84", async () => {
    const successNavigator = {
      geolocation: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: {
              latitude: 31.2304,
              longitude: 121.4737,
              accuracy: 18,
            },
          } as GeolocationPosition);
        }),
      },
    };

    await expect(requestBrowserCurrentCoordinates(successNavigator)).resolves.toEqual({
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      accuracyMeters: 18,
    });
    expect(successNavigator.geolocation.getCurrentPosition).toHaveBeenCalled();
  });

  it("renders shared current-location loading and disabled states", () => {
    const html = renderToStaticMarkup(
      React.createElement(CurrentLocationButton, {
        loading: true,
        disabled: true,
        onClick: vi.fn(),
      }),
    );

    expect(html).toContain('aria-label="使用当前位置"');
    expect(html).toContain('title="使用当前位置"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-current-location-spinner="true"');
    expect(html).toContain("bg-secondary text-primary");
    expect(html).toContain("disabled");
    expect(hasExactButton(html, "定位")).toBe(false);
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

    expect(emptyHtml).toContain("请先选择地点");
    expect(emptyHtml).toContain("disabled");
    expect(selectedHtml).toContain("生成拍摄判断");
    expect(selectedHtml).toContain('value="黄山光明顶"');
    expect(selectedHtml).toContain('data-selected-location-card="true"');
    expect(selectedHtml).toContain('data-forecast-range-section="true"');
    expect(selectedHtml).toContain("所在地");
    expect(selectedHtml).toContain("海拔");
    expect(selectedHtml).toContain("坐标信息");
    expect(selectedHtml).toContain("更换地点");
    expect(selectedHtml).toContain("清除选择");
    expect(selectedHtml).toContain("未来48小时");
    expect(selectedHtml).not.toContain("请先选择地点");
    expect(selectedHtml).not.toContain("常用机位");
    expect(selectedHtml).not.toContain('data-place-search-results="true"');
    expect(selectedHtml).not.toContain("高德地图");
    expect(selectedHtml).not.toContain("Open-Meteo");
    expect(selectedHtml).not.toContain("meteoblue");
  });

  it("sets current location as a selected location and enables forecast generation", () => {
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
    const HomepageSearchPanelComponent = HomepageSearchPanel as React.ComponentType<
      NonNullable<Parameters<typeof HomepageSearchPanel>[0]>
    >;
    const html = renderToStaticMarkup(
      React.createElement(HomepageSearchPanelComponent, { selectedLocation: currentLocation }),
    );

    expect(currentLocation).toMatchObject({
      source: "browser_geolocation",
      originalSource: "browser_geolocation",
      displayName: "黄浦区",
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      coordinateSource: "浏览器定位 WGS84 坐标",
      elevationMeters: null,
      elevationSource: "unknown",
      elevationConfidence: "low",
    });
    expect(html).toContain("当前定位");
    expect(html).toContain("黄浦区");
    expect(html).toContain("上海市 / 上海市 / 黄浦区");
    expect(html).toContain("海拔将在生成判断时补全");
    expect(html).toContain("生成拍摄判断");
    expect(html).not.toContain("请先选择地点");
  });

  it("sends current-location forecasts with WGS84 coordinates and without a spot id", () => {
    const currentLocation = selectedLocationFromBrowserGeolocation({
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
    });
    const payload = buildForecastRequestPayload(
      currentLocation,
      homepageDefaultHorizon,
      homepageDefaultTarget,
    );
    const url = new URL(
      buildForecastUrlFromSelectedLocation(
        currentLocation,
        homepageDefaultHorizon,
        homepageDefaultTarget,
      ),
      "http://localhost:3000",
    );

    expect(payload).toMatchObject({
      name: "当前位置",
      source: "browser_geolocation",
      coordinateSource: "browser_geolocation",
      latitudeWgs84: 31.2304,
      longitudeWgs84: 121.4737,
      latitudeGcj02: 31.2304,
      longitudeGcj02: 121.4737,
      elevationMeters: null,
      elevationSource: "unknown",
      elevationConfidence: "low",
      horizon: "24h",
      target: "general",
    });
    expect(payload.photoSpotId).toBeUndefined();
    expect(payload.locationId).toBeUndefined();
    expect(url.searchParams.get("coordinateSource")).toBe("browser_geolocation");
  });

  it("collapses search results after selecting a search result", () => {
    const selectionState = buildStateAfterSearchResultSelection(samplePlace);

    expect(selectionState).toMatchObject({
      query: "黄山光明顶",
      isActivelySearching: false,
      isCollapsedAfterSelection: true,
    });
    expect(
      shouldShowPlaceSearchResults({
        query: selectionState.query,
        status: "ready",
        resultsCount: 2,
        isActivelySearching: selectionState.isActivelySearching,
        isCollapsedAfterSelection: selectionState.isCollapsedAfterSelection,
      }),
    ).toBe(false);
  });

  it("reopens search results when the user types a different query", () => {
    const selectedLocation = selectedLocationFromSearchResult(samplePlace);
    const inputState = buildStateAfterSearchQueryInput("老君山", selectedLocation);

    expect(inputState).toMatchObject({
      isActivelySearching: true,
      isCollapsedAfterSelection: false,
      shouldClearSelection: true,
    });
    expect(
      shouldShowPlaceSearchResults({
        query: "老君山",
        status: "ready",
        resultsCount: 1,
        isActivelySearching: inputState.isActivelySearching,
        isCollapsedAfterSelection: inputState.isCollapsedAfterSelection,
      }),
    ).toBe(true);
  });

  it("keeps search results collapsed while the query still matches the selected location", () => {
    const selectedLocation = selectedLocationFromSearchResult(samplePlace);
    const inputState = buildStateAfterSearchQueryInput("黄山光明顶", selectedLocation);

    expect(inputState.shouldClearSelection).toBe(false);
    expect(inputState.isActivelySearching).toBe(false);
    expect(
      shouldShowPlaceSearchResults({
        query: "黄山光明顶",
        status: "ready",
        resultsCount: 1,
        isActivelySearching: inputState.isActivelySearching,
        isCollapsedAfterSelection: inputState.isCollapsedAfterSelection,
      }),
    ).toBe(false);
  });

  it("supports changing or clearing the selected location from the compact selected card", () => {
    const selectedLocation = selectedLocationFromSearchResult(samplePlace);
    const changeState = buildStateAfterChangeLocation("", selectedLocation);
    const clearState = buildStateAfterClearSelection();

    expect(changeState).toMatchObject({
      query: "黄山光明顶",
      isActivelySearching: true,
      isCollapsedAfterSelection: false,
    });
    expect(
      shouldShowPlaceSearchResults({
        query: changeState.query,
        status: "ready",
        resultsCount: 1,
        isActivelySearching: changeState.isActivelySearching,
        isCollapsedAfterSelection: changeState.isCollapsedAfterSelection,
      }),
    ).toBe(true);
    expect(clearState).toMatchObject({
      query: "",
      isActivelySearching: false,
      isCollapsedAfterSelection: false,
    });
    expect(
      shouldShowPlaceSearchResults({
        query: clearState.query,
        status: "ready",
        resultsCount: 1,
        isActivelySearching: clearState.isActivelySearching,
        isCollapsedAfterSelection: clearState.isCollapsedAfterSelection,
      }),
    ).toBe(false);
  });

  it("keeps the homepage workspace responsive without fixed wide columns", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageWorkbench));

    expect(html).toContain("minmax(0,1fr)");
    expect(html).toContain('data-homepage-workbench-layout="scenario-two-column"');
    expect(html).toContain("min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)]");
    expect(html).toContain("min-[900px]:items-stretch");
    expect(html).toContain(
      "min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)]",
    );
    expect(html).toContain('data-homepage-guidance-panel="true"');
    expect(html).toContain("min-w-0");
    expect(html).toContain("overflow-hidden");
    expect(html).not.toContain(
      "min-[1200px]:grid-cols-[clamp(360px,24vw,420px)_minmax(0,1fr)_clamp(360px,24vw,420px)]",
    );
    expect(html).not.toContain("min-[1200px]:items-start");
    expect(html).not.toContain("min-[1200px]:contents");
    expect(html).not.toContain("xl:grid-cols-4");
    expect(html).not.toMatch(/w-\[(?:[1-9]\d{3,})px\]|min-w-\[(?:[1-9]\d{3,})px\]/);
  });

  it("keeps public homepage copy product-friendly", () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));

    expect(html).toContain(
      "输入拍摄地点后，生成出行判断、最佳窗口、优先题材和主要风险。",
    );
    expect(html).toContain("综合出行判断会看什么");
    expect(html).toContain("地点与窗口");
    expect(html).not.toContain("云海判断需要关注什么");
    expect(html).not.toContain("朝霞晚霞判断需要看什么");
    expect(html).not.toContain("星空银河判断需要看什么");
    expect(html).not.toContain("精选机位");
    expect(html).not.toContain("出发前重点");
    expect(html).not.toContain("常见题材判断");
    expect(html).not.toContain("黄山光明顶");
    expect(html).not.toContain("老君山金顶");
    expect(html).not.toContain("实时决策工作台");
    expect(html).not.toContain("多源数据");
    expect(html).not.toContain("数据源未完全配置");
    expect(html).not.toContain("和风天气");
    expect(html).not.toContain("Open-Meteo");
    expect(html).not.toContain("meteoblue");
    expect(html).not.toContain("本地天文服务");
    expect(html).not.toContain("工作流");
    expect(html).not.toContain("四步完成一次出发判断");
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

  it("does not expose provider keys or secret names from the homepage search UI", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageSearchPanel));

    expect(html).not.toMatch(/api[_-]?key|secret|AMAP_|key=/i);
    expect(html).not.toContain("高德 Web 服务 Key");
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
