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
    for (const link of siteConfig.footer.navigation) {
      expect(html).toContain(link.label);
      expect(html).toContain(`href="${link.href}"`);
    }
    expect(html).toContain(siteConfig.footer.disclaimer);
    expect(html).toContain(siteConfig.footer.copyright);
    expect(html).toContain(siteConfig.legal.icpNumber);
    expect(html).toContain(`href="${siteConfig.legal.icpUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("\u7ba1\u7406\u540e\u53f0");
    expect(html).not.toContain("\u8d26\u6237");
    expect(html.toLowerCase()).not.toContain("/admin");
    expect(html.toLowerCase()).not.toContain("/account");
    expect(html).not.toContain("用户中心");
    expect(html).not.toContain("帮助与联系");
    expect(html).not.toContain("隐私政策");
    expect(html).not.toContain("服务条款");
    expect(html).not.toContain("免责声明");
  });

  it("uses a light design-system footer treatment aligned to the public page container", () => {
    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain("border-t border-[#DDD4C4] bg-[#F7F4EC]");
    expect(html).toContain("max-w-[1560px]");
    expect(html).toContain("border-y border-[#DDD4C4]");
    expect(html).toContain("text-[#66736D]");
    expect(html).toContain("focus-visible:ring-2 focus-visible:ring-[#A9C7B8]");
    expect(html).toContain("flex flex-wrap items-center");
    expect(html).toContain("min-[900px]:justify-end");
    expect(html).not.toContain("bg-[#071614]");
    expect(html).not.toContain("rgb(7_22_20)");
    expect(html).not.toContain("bg-muted/70");
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
