import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { siteConfig } from "../site-config";
import { PublicShell } from "../components/public-shell";
import { SiteFooter } from "../components/site-footer";
import AdminLayout from "./admin/layout";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: () => undefined,
  }),
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const removedFooterNavigationLabels = [
  "综合判断",
  "云海",
  "朝霞晚霞",
  "星空银河",
  "定价",
] as const;

const removedFooterCopy = [
  siteConfig.brand.tagline,
  "为云海、朝霞晚霞、星空银河和风光出行提供天气窗口判断参考。",
  "结果仅供摄影出行参考，山地、夜间、恶劣天气请以官方预警和现场安全为准。",
] as const;

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("SiteFooter", () => {
  it("renders only the copyright and safe ICP filing link", () => {
    expect(siteConfig.legal.icpNumber).toBe("\u6caaICP\u59072025140939\u53f7-3");
    expect(siteConfig.legal.icpUrl).toBe("https://beian.miit.gov.cn");

    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain(siteConfig.footer.copyright);
    expect(html).toContain(siteConfig.legal.icpNumber);
    expect(html).toContain(`href="${siteConfig.legal.icpUrl}"`);
    expect(countOccurrences(html, "href=")).toBe(1);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("focus-visible:ring-ring");
  });

  it("removes the old brand introduction, product navigation, and disclaimer content", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).not.toContain("/brand-mark.svg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain(siteConfig.brand.tagline);
    for (const label of removedFooterNavigationLabels) {
      expect(html).not.toContain(label);
    }
    for (const text of removedFooterCopy) {
      expect(html).not.toContain(text);
    }
    expect(html).not.toContain("页脚产品导航");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("grid-cols");
    expect(html).not.toContain("\u7ba1\u7406\u540e\u53f0");
    expect(html).not.toContain("\u8d26\u6237");
    expect(html.toLowerCase()).not.toContain("/admin");
    expect(html.toLowerCase()).not.toContain("/account");
  });

  it("uses a compact centered design-system layout that can wrap on mobile", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain("border-t border-border bg-background text-muted-foreground");
    expect(html).toContain("max-w-[1560px]");
    expect(html).toContain("flex-wrap");
    expect(html).toContain("items-center justify-center");
    expect(html).toContain("gap-x-3 gap-y-1.5");
    expect(html).toContain("py-4");
    expect(html).toContain("text-center");
    expect(html).toContain("max-w-full");
    expect(html).toContain("min-[420px]:inline");
    expect(html).not.toContain("justify-between");
    expect(html).not.toContain("justify-end");
    expect(html).not.toContain("border-y");
    expect(html).not.toContain("min-h-");
    expect(html).not.toContain("grid ");
    expect(html).not.toContain("bg-[#071614]");
    expect(html).not.toContain("rgb(7_22_20)");
    expect(html).not.toContain("shadow");
  });

  it("is mounted once by the shared public shell in server-rendered markup", () => {
    const html = renderToStaticMarkup(
      React.createElement(PublicShell, null, React.createElement("section", null, "首页内容")),
    );

    expect(html).toContain("<footer");
    expect(countOccurrences(html, "<footer")).toBe(1);
    expect(countOccurrences(html, 'id="site-footer"')).toBe(1);
    expect(html).toContain("首页内容");
    expect(html).toContain(siteConfig.legal.icpNumber);
    expect(html).toContain(`href="${siteConfig.legal.icpUrl}"`);
  });

  it("does not add the public footer to the separate admin layout", () => {
    const html = renderToStaticMarkup(
      React.createElement(AdminLayout, null, React.createElement("section", null, "后台内容")),
    );

    expect(html).not.toContain("<footer");
    expect(html).not.toContain("site-footer");
    expect(html).not.toContain(siteConfig.legal.icpNumber);
    expect(html).not.toContain(`href="${siteConfig.legal.icpUrl}"`);
  });
});
