import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicShell } from "../components/public-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: () => undefined,
  }),
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("responsive safeguards", () => {
  it("keeps the shared public shell mobile-safe without widening the page", () => {
    const html = renderToStaticMarkup(
      React.createElement(PublicShell, null, React.createElement("main", null, "响应式内容")),
    );

    expect(html).toContain("min-h-screen bg-background");
    expect(html).not.toContain("overflow-x-hidden bg-background");
    expect(html).toContain("mx-auto w-full max-w-[1600px] min-w-0 px-[clamp(16px,4vw,64px)]");
    expect(html).toContain("mx-auto flex min-h-[72px] w-full max-w-[1600px] min-w-0 items-center");
    expect(html).toContain("mx-auto flex w-full max-w-[1600px] min-w-0");
    expect(html).not.toContain("px-[clamp(24px,4vw,72px)]");
  });

  it("keeps dense calendar, table, and dashboard wrappers locally constrained", () => {
    const uiSource = readAppSource("../components/ui.tsx");
    const moonSource = readAppSource("../components/moon-phase-calendar.tsx");
    const dashboardSource = readAppSource("./forecast/result-dashboard-components.tsx");
    const forecastSource = readAppSource("./forecast/forecast-result-client.tsx");
    const pricingSource = readAppSource("./pricing/pricing-client.tsx");
    const authSource = readAppSource("../components/public-auth.tsx");
    const packageSource = readAppSource("../../../package.json");
    const mobileAuditSource = readAppSource("../../../scripts/audit-mobile-layout.mjs");
    const combinedSource = [uiSource, moonSource, dashboardSource, forecastSource].join("\n");
    const cardCalendarSource = [moonSource, dashboardSource, pricingSource].join("\n");

    expect(uiSource).toContain("export function ResponsiveDataScroller");
    expect(uiSource).toContain("w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain");
    expect(uiSource).toContain("[-webkit-overflow-scrolling:touch]");
    expect(uiSource).toContain('data-responsive-data-scroller="true"');
    expect(uiSource).toContain('data-responsive-table="true"');
    expect(uiSource).toContain("border-separate border-spacing-0");
    expect(uiSource).not.toContain("border-collapse");
    expect(moonSource).toContain("mt-5 w-full max-w-full min-w-0");
    expect(moonSource).not.toContain("data-moon-calendar-scroll");
    expect(moonSource).not.toContain("data-moon-calendar-inner");
    expect(moonSource).not.toContain("min-w-[480px]");
    expect(moonSource).not.toContain("overflow-x-auto");
    expect(dashboardSource).toContain("grid min-w-0 max-w-full items-stretch");
    expect(authSource).toContain("mx-auto grid w-full min-w-0 justify-items-center");
    expect(authSource).toContain("max-w-lg");
    expect(authSource).toContain("max-w-xl");
    expect(authSource).not.toContain("grid w-full max-w-full min-w-0 justify-items-center");
    expect(authSource).toContain("[overflow-wrap:anywhere]");
    expect(forecastSource).toContain('data-cloud-sea-professional-table-scroll="true"');
    expect(forecastSource).toContain('data-professional-hourly-table-layout="mobile-scroll-safe"');
    expect(forecastSource).toContain("border-separate border-spacing-0");
    expect(forecastSource).toContain("min-[760px]:sticky min-[760px]:left-0");
    expect(forecastSource).not.toContain("bg-inherit");
    expect(forecastSource).not.toContain("sticky left-0");
    expect(forecastSource).toContain("<ResponsiveDataScroller");
    expect(combinedSource).not.toContain("w-screen");
    expect(combinedSource).not.toContain("w-[100vw]");
    expect(combinedSource).not.toContain("min-w-[100vw]");
    expect(combinedSource).not.toContain("min-w-[480px]");
    expect(cardCalendarSource).not.toMatch(/min-w-\[(?:[3-9]\d{2,}|[1-9]\d{3,})px\]/);
    expect(packageSource).toContain('"mobile:audit": "node scripts/audit-mobile-layout.mjs"');
    expect(mobileAuditSource).toContain("Mobile layout audit:");
    expect(mobileAuditSource).toContain("raw table without explicit horizontal scroller");
    expect(mobileAuditSource).toContain("process.exit(0)");
  });
});

function readAppSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
