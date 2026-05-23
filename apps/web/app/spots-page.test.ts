import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SpotsPage from "./spots/page";
import SpotDetailPage, { generateStaticParams } from "./spots/[slug]/page";
import {
  buildSpotForecastUrl,
  filterSpotLibraryItems,
  spotLibraryItems,
} from "./spots/spot-library-data";

vi.mock("next/navigation", () => ({
  usePathname: () => "/spots",
  notFound: () => {
    throw new Error("not found");
  },
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("spot library pages", () => {
  it("builds /spots with real clickable spot cards", () => {
    const html = renderToStaticMarkup(React.createElement(SpotsPage));

    expect(html).toContain("机位库");
    expect(html).toContain("黄山光明顶");
    expect(html).toContain("老君山金顶");
    expect(html).toContain("三清山女神峰");
    expect(html).toContain("武功山金顶");
    expect(html).toContain("查看详情");
    expect(html).toContain("/spots/huangshan-guangmingding");
    expect(html).toContain("综合判断");
    expect(html).toContain("云海");
    expect(html).toContain("朝霞晚霞");
    expect(html).toContain("星空银河");
  });

  it("builds complete quick forecast URLs with WGS84 coordinates, target, horizon, and elevation", () => {
    const spot = spotLibraryItems.find((item) => item.slug === "huangshan-guangmingding");
    expect(spot).toBeDefined();

    const generalUrl = new URL(buildSpotForecastUrl(spot!, "general"), "http://localhost:3000");
    expect(generalUrl.pathname).toBe("/forecast");
    expect(generalUrl.searchParams.get("name")).toBe("黄山光明顶");
    expect(generalUrl.searchParams.get("source")).toBe("local_photo_spot");
    expect(generalUrl.searchParams.get("latWgs84")).toBe(String(spot!.latitudeWgs84));
    expect(generalUrl.searchParams.get("lngWgs84")).toBe(String(spot!.longitudeWgs84));
    expect(generalUrl.searchParams.get("target")).toBe("general");
    expect(generalUrl.searchParams.get("horizon")).toBe("48h");
    expect(generalUrl.searchParams.get("elevationMeters")).toBe("1860");
    expect(generalUrl.searchParams.get("photoSpotId")).toBe(spot!.id);

    const glowUrl = new URL(buildSpotForecastUrl(spot!, "glow"), "http://localhost:3000");
    expect(glowUrl.searchParams.get("target")).toBe("glow");
    expect(glowUrl.searchParams.get("horizon")).toBe("72h");

    const astroUrl = new URL(buildSpotForecastUrl(spot!, "astro"), "http://localhost:3000");
    expect(astroUrl.searchParams.get("target")).toBe("astro");
    expect(astroUrl.searchParams.get("horizon")).toBe("7d");
  });

  it("builds spot detail pages with WGS84 coordinates and quick analysis actions", () => {
    const staticParams = generateStaticParams();
    expect(staticParams).toContainEqual({ slug: "huangshan-guangmingding" });

    const html = renderToStaticMarkup(
      React.createElement(SpotDetailPage, { params: { slug: "huangshan-guangmingding" } }),
    );

    expect(html).toContain("黄山光明顶");
    expect(html).toContain("WGS84 坐标");
    expect(html).toContain("30.13280");
    expect(html).toContain("118.17100");
    expect(html).toContain("综合判断");
    expect(html).toContain("云海判断");
    expect(html).toContain("朝霞晚霞判断");
    expect(html).toContain("星空银河判断");
  });

  it("keeps public spot pages free of placeholder copy and external calls", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("spot pages should not call network during static render");
    });
    vi.stubGlobal("fetch", fetchMock);

    const listHtml = renderToStaticMarkup(React.createElement(SpotsPage));
    const detailHtml = renderToStaticMarkup(
      React.createElement(SpotDetailPage, { params: { slug: "wugongshan-jinding" } }),
    );
    const combined = `${listHtml}\n${detailHtml}`;
    const userFacingText = combined
      .replace(/\s(?:class|href|style|src|alt|id|role|type|value|aria-[a-z-]+)="[^"]*"/g, " ")
      .replace(/<[^>]+>/g, " ");

    expect(userFacingText).not.toContain("热门机位");
    expect(userFacingText).not.toContain("占位");
    expect(userFacingText).not.toContain("本地模拟");
    expect(userFacingText).not.toContain("调试");
    expect(userFacingText).not.toMatch(/mock|fixture|placeholder/i);
    expect(userFacingText).not.toMatch(/\bAI\b/);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("supports an empty filtered result set", () => {
    expect(
      filterSpotLibraryItems(spotLibraryItems, {
        keyword: "不存在的机位名称",
        target: "cloud_sea",
      }),
    ).toHaveLength(0);
  });
});
