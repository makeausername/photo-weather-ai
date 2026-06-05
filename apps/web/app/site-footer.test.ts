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
    expect(siteConfig.legal.icpNumber).toBe("沪ICP备2025140939号-3");

    const html = renderToStaticMarkup(React.createElement(SiteFooter));

    expect(html).toContain("逐光天气");
    expect(html).toContain("把天气预报翻译成风光摄影出行窗口");
    expect(html).toContain("云层 · 光线 · 地形 · 风险 · 窗口期");
    expect(html).toContain("综合判断");
    expect(html).toContain("云海");
    expect(html).toContain("朝霞晚霞");
    expect(html).toContain("星空银河");
    expect(html).toContain("机位库");
    expect(html).toContain("定价");
    expect(html).toContain(
      "结果仅供摄影出行参考，山地、夜间、恶劣天气请以官方预警和现场安全为准。",
    );
    expect(html).toContain("隐私政策");
    expect(html).toContain("服务条款");
    expect(html).toContain("免责声明");
    expect(html).toContain("帮助与联系");
    expect(html).toContain("© 2026 逐光天气");
    expect(html).toContain(siteConfig.legal.icpNumber);
    expect(html).toContain(`href="${siteConfig.legal.icpUrl}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("管理后台");
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
