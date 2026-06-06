import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { siteConfig } from "../site-config";
import { PublicShell } from "../components/public-shell";
import { SiteFooter } from "../components/site-footer";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("SiteFooter", () => {
  it("renders the project footer copy and ICP filing link", () => {
    expect(siteConfig.legal.icpNumber).toBe("\u6caaICP\u59072025140939\u53f7-3");
    expect(siteConfig.legal.icpUrl).toBe("https://beian.miit.gov.cn");

    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain(siteConfig.brand.name);
    expect(html).toContain(siteConfig.brand.tagline);
    expect(html).toContain(siteConfig.footer.description);
    expect(html).toContain(siteConfig.footer.primaryNavigationTitle);
    expect(html).toContain(siteConfig.footer.legalNavigationTitle);
    for (const link of siteConfig.footer.mainNavigation) {
      expect(html).toContain(link.label);
      expect(html).toContain(`href="${link.href}"`);
    }
    expect(html).toContain(siteConfig.footer.disclaimer);
    for (const link of siteConfig.footer.legalNavigation) {
      expect(html).toContain(link.label);
      expect(html).toContain(`href="${link.href}"`);
    }
    expect(html).toContain(siteConfig.footer.copyright);
    expect(html).toContain(siteConfig.legal.icpNumber);
    expect(html).toContain(`href="${siteConfig.legal.icpUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("\u7ba1\u7406\u540e\u53f0");
    expect(html).not.toContain("\u8d26\u6237");
    expect(html.toLowerCase()).not.toContain("/admin");
    expect(html.toLowerCase()).not.toContain("/account");
  });

  it("uses a light design-system footer treatment aligned to the public page container", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain("border-t border-border bg-card");
    expect(html).toContain("max-w-[1560px]");
    expect(html).toContain("bg-muted/70");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("focus-visible:ring-2 focus-visible:ring-ring");
    expect(html).toContain("justify-center");
    expect(html).not.toContain("bg-[#071614]");
    expect(html).not.toContain("rgb(7_22_20)");
  });

  it("is mounted by the public shell in server-rendered markup", () => {
    const html = renderToStaticMarkup(
      React.createElement(PublicShell, null, React.createElement("section", null, "首页内容")),
    );

    expect(html).toContain("<footer");
    expect(html).toContain("首页内容");
    expect(html).toContain(siteConfig.legal.icpNumber);
    expect(html).toContain(`href="${siteConfig.legal.icpUrl}"`);
  });
});
