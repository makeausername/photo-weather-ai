import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteFooter } from "../components/site-footer";
import { PublicFrame } from "../components/public-frame";
const route = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));
(globalThis as typeof globalThis & { React: typeof React }).React = React;
describe("free edition footer", () => {
  it("attributes the two providers without commercial links", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));
    expect(html).toContain('href="https://open-meteo.com/"');
    expect(html).toContain('href="https://www.qweather.com/"');
    expect(html).toContain("GeoNames");
    for (const href of ["/help", "/privacy", "/disclaimer"])
      expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain('href="/pricing"');
  });
  it("keeps one footer on public pages and leaves admin outside the public frame", () => {
    route.path = "/";
    expect(
      renderToStaticMarkup(React.createElement(PublicFrame, null, "内容")).split("<footer"),
    ).toHaveLength(2);
    route.path = "/admin";
    expect(renderToStaticMarkup(React.createElement(PublicFrame, null, "后台"))).not.toContain(
      "<footer",
    );
  });
});
