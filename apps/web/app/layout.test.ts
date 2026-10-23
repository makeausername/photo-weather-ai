import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { generateMetadata } from "./layout";
vi.mock("../lib/public-site-config", () => ({ readPublicSiteConfig: async () => ({ name: "联调天气", baseUrl: "https://example.test", language: "zh-CN", timezone: "Asia/Tokyo" }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("RootLayout", () => {
  it("uses saved branding with the approved palette and a single public frame", async () => {
    const html = renderToStaticMarkup(
      await RootLayout({ children: React.createElement("main", null, "content") }),
    );

    expect(html).toContain('<html lang="zh-CN" data-theme="light">');
    expect(html).toContain("<main>content</main>");
    expect(html.match(/<header\b/g)).toHaveLength(1);
    expect(html.match(/<footer\b/g)).toHaveLength(1);
    expect(html).toContain('class="photo-app"');
    expect(html).not.toContain("zhuguang-reading-theme");
    expect(html).toContain("联调天气");
    expect((await generateMetadata()).openGraph).toMatchObject({ siteName: "联调天气", url: "https://example.test" });
  });
});
