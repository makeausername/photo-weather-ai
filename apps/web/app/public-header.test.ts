import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  PublicHeader,
  publicHeaderNavLabels,
  publicHeaderActionLabels,
} from "../components/public-header";
const route = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
(globalThis as typeof globalThis & { React: typeof React }).React = React;
describe("free public navigation", () => {
  it("opens four forecast views without account or payment controls", () => {
    const html = renderToStaticMarkup(React.createElement(PublicHeader));
    expect(publicHeaderNavLabels).toEqual(["朝霞晚霞", "星空", "云海地图", "天气"]);
    expect(publicHeaderActionLabels).toEqual([]);
    for (const href of ["/", "/astro", "/map", "/weather"])
      expect(html).toContain(`href="${href}"`);
    for (const href of ["/login", "/register", "/pricing", "/account"])
      expect(html).not.toContain(`href="${href}"`);
    expect(html).toContain("无需注册 · 完全免费");
  });
  it("marks the current page and preserves old cloud-sea entry", () => {
    route.path = "/cloud-sea";
    const html = renderToStaticMarkup(React.createElement(PublicHeader));
    expect(html).toMatch(/<a(?=[^>]*href="\/map")(?=[^>]*aria-current="page")[^>]*>/);
  });
});
