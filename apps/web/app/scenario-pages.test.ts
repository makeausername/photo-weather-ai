import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScenarioSearchPanel } from "../components/scenario-module-page";
import { buildForecastUrl, type PlaceSearchResult } from "../components/place-search-card";
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

describe("scenario module pages", () => {
  it("keeps cloud-sea, glow, and astro pages importable with metadata", () => {
    expect(CloudSeaPage()).toBeTruthy();
    expect(GlowPage()).toBeTruthy();
    expect(AstroPage()).toBeTruthy();
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
    expect(html).toContain("云海机会");
    expect(html).toContain("白墙风险");
    expect(html).toContain("最佳清晨窗口");
    expect(html).toContain("地形高差");
    expect(html).toContain("风速与稳定性");
    expect(html).toContain("湿度、露点差、低云和地形高差共同影响云海形成。");
    expect(html).toContain("正式数据源启用后将显示对应来源与更新时间");
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
    expect(serialized).toContain("湿度、露点差、低云和地形高差共同影响云海形成。");
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

  it("does not call external APIs while loading static scenario modules", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("scenario pages should not call network during static load");
    });
    vi.stubGlobal("fetch", fetchMock);

    CloudSeaPage();
    GlowPage();
    AstroPage();
    for (const config of scenarioPageConfigs) {
      buildForecastUrl(samplePlace, config.defaultHorizon, config.target);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
