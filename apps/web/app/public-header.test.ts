import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PublicHeader,
  publicHeaderActionLabels,
  publicHeaderNavLabels,
} from "../components/public-header";

const pathnameState = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

type PublicHeaderTestProps = {
  readonly initialMenuOpen?: boolean;
};

const PublicHeaderForTest = PublicHeader as React.ComponentType<PublicHeaderTestProps>;

const expectedNavLinks = [
  { href: "/", label: "首页" },
  { href: "/cloud-sea", label: "云海" },
  { href: "/glow", label: "朝霞晚霞" },
  { href: "/astro", label: "星空银河" },
  { href: "/pricing", label: "定价" },
] as const;

afterEach(() => {
  pathnameState.value = "/";
});

describe("public header", () => {
  it("keeps the real public nav entries and removes the duplicate start-analysis action", () => {
    expect(publicHeaderNavLabels).toEqual(expectedNavLinks.map((link) => link.label));
    expect(publicHeaderActionLabels).toEqual(["账户"]);
    expect(publicHeaderActionLabels).not.toContain("开始分析");
  });

  it("renders desktop header controls without a duplicate start-analysis CTA", () => {
    const html = renderHeader();
    const accountLink = findRenderedLink(html, "/login", publicHeaderActionLabels[0]);

    expect(html).not.toContain("开始分析");
    expect(html).not.toContain('href="/#analysis"');
    expect(html).toContain("账户");
    expect(accountLink).toContain('href="/login"');
    expect(accountLink).not.toContain("w-full max-w-full min-w-0");
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('aria-pressed="');

    for (const link of expectedNavLinks) {
      expect(findRenderedLink(html, link.href, link.label)).toBeTruthy();
    }
  });

  it("renders the mobile menu without a duplicate start-analysis action", () => {
    const html = renderHeader({ initialMenuOpen: true });
    const mobileMenu = findMobileMenu(html);
    const mobileAccountLink = findRenderedLink(mobileMenu, "/login", publicHeaderActionLabels[0]);

    expect(html).toContain('id="public-mobile-menu"');
    expect(mobileMenu).toContain("w-full max-w-full min-w-0");
    expect(mobileMenu).toContain("grid w-full max-w-full min-w-0 gap-2 border-t");
    expect(mobileMenu).not.toContain("absolute right-0");
    expect(mobileMenu).not.toContain("z-50");
    expect(mobileAccountLink).toContain("w-full max-w-full min-w-0 justify-center");
    expect(html).not.toContain("开始分析");
    expect(html).not.toContain('href="/#analysis"');
    expect(html).toContain("账户");
    expect(html).not.toContain('role="group"');
    expect(html).not.toContain('aria-pressed="');

    for (const link of expectedNavLinks) {
      expect(findRenderedLink(html, link.href, link.label)).toBeTruthy();
    }
  });

  it("preserves active state for the homepage and nested public routes", () => {
    pathnameState.value = "/";
    const homeLink = findRenderedLink(renderHeader(), "/", "首页");

    expect(homeLink).toContain("bg-secondary");
    expect(homeLink).toContain("text-secondary-foreground");

    pathnameState.value = "/cloud-sea/report";
    const cloudSeaLink = findRenderedLink(renderHeader(), "/cloud-sea", "云海");

    expect(cloudSeaLink).toContain("bg-secondary");
    expect(cloudSeaLink).toContain("text-secondary-foreground");
  });
});

function renderHeader(props?: PublicHeaderTestProps) {
  return renderToStaticMarkup(React.createElement(PublicHeaderForTest, props));
}

function findRenderedLink(html: string, href: string, label: string): string {
  const match = html.match(
    new RegExp(`<a\\b(?=[^>]*href="${escapeRegExp(href)}")[^>]*>${escapeRegExp(label)}</a>`),
  );

  return match?.[0] ?? "";
}

function findMobileMenu(html: string): string {
  const start = html.indexOf('id="public-mobile-menu"');

  if (start === -1) {
    return "";
  }

  const end = html.indexOf("</header>", start);

  return html.slice(start, end === -1 ? html.length : end);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
