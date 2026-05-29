import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScenarioSearchPanel } from "../components/scenario-module-page";
import { HomepageSearchPanel } from "../components/homepage-search-panel";
import { LocationSearchInput } from "../components/location-search-input";
import { buildForecastUrl, type PlaceSearchResult } from "../components/place-search-card";
import {
  buildForecastRequestPayload,
  buildForecastUrlFromSelectedLocation,
  selectedLocationFromBrowserGeolocation,
} from "../components/selected-location";
import AstroPage, { metadata as astroMetadata } from "./astro/page";
import CloudSeaPage, { metadata as cloudSeaMetadata } from "./cloud-sea/page";
import GlowPage, { metadata as glowMetadata } from "./glow/page";
import {
  astroScenarioConfig,
  cloudSeaScenarioConfig,
  glowScenarioConfig,
  scenarioPageConfigs,
} from "./scenario-configs";

vi.mock("next/navigation", () => ({
  usePathname: () => "/cloud-sea",
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

function hasExactButton(html: string, label: string): boolean {
  return new RegExp(`<button[^>]*>\\s*${label}\\s*</button>`).test(html);
}

function subjectDeepLinkParams(
  target: "cloud_sea" | "glow" | "astro",
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    source: "general",
    target,
    subject:
      target === "cloud_sea" ? "cloud_sea" : target === "glow" ? "sunset_glow" : "milky_way",
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

  it("renders the cloud-sea entry page without the popular spot placeholder", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));

    expect(html).not.toContain("热门云海机位");
    expect(html).not.toContain("机位参考");
    expect(html).toContain("云海判断需要看什么");
    expect(html).toContain("云海形成机会");
    expect(html).toContain("云海可拍机会");
    expect(html).toContain("白墙风险");
    expect(html).toContain("最佳清晨窗口");
    expect(html).toContain("地形高差");
    expect(html).toContain("风速与稳定性");
    expect(html).toContain("湿度、露点差、低云、弱到中等风和地形高差共同影响云海形成。");
    expect(html).toContain("可拍机会需要形成信号与清晨光线、能见度、通行和低白墙风险重叠。");
    expect(html).toContain("正式数据源启用后将显示对应来源与更新时间");
  });

  it("reuses the shared current-location input on homepage and cloud sea", () => {
    const homepageHtml = renderToStaticMarkup(React.createElement(HomepageSearchPanel));
    const cloudSeaHtml = renderToStaticMarkup(React.createElement(CloudSeaPage));
    const sharedInputHtml = renderToStaticMarkup(
      React.createElement(LocationSearchInput, {
        value: "",
        placeholder: "输入地点",
        onInputChange: vi.fn(),
        onSearch: vi.fn(),
        onUseCurrentLocation: vi.fn(),
      }),
    );

    for (const html of [homepageHtml, cloudSeaHtml, sharedInputHtml]) {
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

  it("keeps cloud sea manual search and seeded spot chips available", () => {
    const html = renderToStaticMarkup(React.createElement(CloudSeaPage));

    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>搜索地点<\/button>/);
    expect(html).toContain('aria-label="目的地"');
    expect(html).toContain("常用机位");
    expect(html).toContain("黄山光明顶");
    expect(html).toContain("老君山金顶");
    expect(html).toContain("查看云海拍摄判断");
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

  it("keeps locator button styling out of cloud sea page-specific files", () => {
    const scenarioSource = readFileSync(
      fileURLToPath(new URL("../components/scenario-module-page.tsx", import.meta.url)),
      "utf8",
    );
    const cloudSeaPageSource = readFileSync(
      fileURLToPath(new URL("./cloud-sea/page.tsx", import.meta.url)),
      "utf8",
    );

    expect(scenarioSource).not.toContain("data-current-location-button");
    expect(scenarioSource).not.toContain("absolute right-1.5 top-1/2");
    expect(cloudSeaPageSource).not.toContain("data-current-location-button");
    expect(cloudSeaPageSource).not.toContain("absolute right-1.5 top-1/2");
  });

  it("cloud sea page reads General deep-link query params and preselects context", () => {
    const html = renderToStaticMarkup(
      React.createElement(CloudSeaPage, {
        searchParams: subjectDeepLinkParams("cloud_sea"),
      }),
    );

    expect(html).toContain("来源：综合判断");
    expect(html).toContain("地点：黄山光明顶");
    expect(html).toContain("日期：2026-05-20");
    expect(html).toContain("窗口：");
    expect(html).toContain("05:00");
    expect(html).toContain("返回综合判断");
    expect(html).toContain('href="/forecast?target=general"');
    expect(html).not.toContain("地点搜索与机位选择");
  });

  it("renders the glow entry page without the popular spot placeholder", () => {
    const html = renderToStaticMarkup(React.createElement(GlowPage));

    expect(html).not.toContain("热门朝霞晚霞机位");
    expect(html).not.toContain("热门朝霞机位");
    expect(html).not.toContain("热门晚霞机位");
    expect(html).toContain("地点搜索与机位选择");
    expect(html).toContain("常用机位");
    expect(html).toContain("预报范围选择");
    expect(html).toContain("固定分析目标");
    expect(html).toContain("查看朝霞晚霞判断");
    expect(html).toContain("朝霞晚霞判断需要看什么");
    expect(html).toContain("日出日落时间");
    expect(html).toContain("中高云条件");
    expect(html).toContain("低云遮挡风险");
    expect(html).toContain("能见度与通透度");
    expect(html).toContain("地形遮挡");
    expect(html).toContain("风与降水");
    expect(html).toContain("当前为体验模式，结果会使用演示天气数据生成");
  });

  it("glow page reads General deep-link query params and preselects context", () => {
    const html = renderToStaticMarkup(
      React.createElement(GlowPage, {
        searchParams: subjectDeepLinkParams("glow"),
      }),
    );

    expect(html).toContain("来源：综合判断");
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

    expect(searchPanelHtml).toContain("地点搜索与机位选择");
    expect(searchPanelHtml).toContain("预报范围选择");
    expect(searchPanelHtml).toContain("查看云海拍摄判断");
    expect(serialized).not.toContain("热门云海机位");
    expect(serialized).toContain("云海判断需要看什么");
    expect(serialized).toContain("湿度、露点差、低云、弱到中等风和地形高差共同影响云海形成。");
    expect(serialized).toContain(
      "可拍机会需要形成信号与清晨光线、能见度、通行和低白墙风险重叠。",
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
    expect(serialized).toContain("天气与地形结果使用演示数据生成");
    expect(serialized).not.toMatch(/coming soon|placeholder|todo|mock|fixture/i);
    expect(serialized).not.toContain("模块准备中");
    expect(serialized).not.toContain("本地模拟");
    expect(serialized).not.toMatch(/\bAI\b/);
  });

  it("renders the astro entry page without the popular spot placeholder grid", () => {
    const html = renderToStaticMarkup(React.createElement(AstroPage));

    expect(html).not.toContain("热门星空银河机位");
    expect(html).not.toContain("热门星空机位");
    expect(html).not.toContain("热门银河机位");
    expect(html).toContain("地点搜索与机位选择");
    expect(html).toContain("常用机位");
    expect(html).toContain("预报范围选择");
    expect(html).toContain("固定分析目标");
    expect(html).toContain("查看星空银河判断");
    expect(html).toContain("星空银河判断需要看什么");
    expect(html).toContain("天文黑夜");
    expect(html).toContain("月相与月光");
    expect(html).toContain("无月黑夜");
    expect(html).toContain("银河窗口");
    expect(html).toContain("云量与能见度");
    expect(html).toContain("光污染与地形");
    expect(html).toContain("天文时间基于本地天文计算");
  });

  it("astro page reads General deep-link query params and preselects context", () => {
    const html = renderToStaticMarkup(
      React.createElement(AstroPage, {
        searchParams: subjectDeepLinkParams("astro"),
      }),
    );

    expect(html).toContain("来源：综合判断");
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
