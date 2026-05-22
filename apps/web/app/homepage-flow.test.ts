import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ForecastQueryInput } from "@photo-weather/shared";
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
  type PlaceSearchResult,
} from "../components/place-search-card";
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
  });

  it("keeps the forecast horizon selector but hides the visible target selector", () => {
    const html = renderToStaticMarkup(React.createElement(HomepageSearchPanel));

    expect(html).toContain("预报范围选择");
    expect(html).toContain("未来24小时");
    expect(html).toContain("未来48小时");
    expect(html).toContain("未来72小时");
    expect(html).toContain("未来7天");
    expect(html).toContain("查看拍摄天气分析");
    expect(html).toContain(homepageTargetHelperText);
    expect(html).not.toContain("分析目标");
    expect(hasExactButton(html, "综合判断")).toBe(false);
    expect(hasExactButton(html, "云海")).toBe(false);
    expect(hasExactButton(html, "朝霞晚霞")).toBe(false);
    expect(hasExactButton(html, "星空银河")).toBe(false);
  });

  it("keeps public homepage copy product-friendly", () => {
    const html = renderToStaticMarkup(React.createElement(HomePage));

    expect(html).toContain("体验模式");
    expect(html).toContain("当前为演示分析结果");
    expect(html).not.toMatch(/\bmock\b|\bfixture\b|本地模拟|不含真实预报|开发环境|调试|占位/i);
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
