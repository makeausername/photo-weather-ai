import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicShell } from "../components/public-shell";
import { ResultViewTabs } from "./forecast/result-experience-controls";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({
    replace: () => undefined,
  }),
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

describe("responsive safeguards", () => {
  it("mounts deferred result content only when its tab is active", () => {
    const items = [
      {
        value: "overview",
        label: "概览",
        content: React.createElement("div", { "data-overview-content": "true" }),
      },
      {
        value: "hourly",
        label: "逐小时",
        deferUntilActive: true,
        content: React.createElement("div", { "data-hourly-content": "true" }),
      },
    ];
    const overviewHtml = renderToStaticMarkup(
      React.createElement(ResultViewTabs, { label: "结果视图", items }),
    );
    const hourlyHtml = renderToStaticMarkup(
      React.createElement(ResultViewTabs, { label: "结果视图", items, defaultValue: "hourly" }),
    );

    expect(overviewHtml).toContain('data-overview-content="true"');
    expect(overviewHtml).not.toContain('data-hourly-content="true"');
    expect(hourlyHtml).toContain('data-hourly-content="true"');
  });

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
    const resultControlsSource = readAppSource("./forecast/result-experience-controls.tsx");
    const hourlyTimelineSource = readAppSource("./forecast/hourly-weather-timeline.tsx");
    const adminShellSource = readAppSource("./admin/components/admin-shell.tsx");
    const adminSettingsSource = readAppSource("./admin/components/admin-settings-client.tsx");
    const pricingSource = readAppSource("./pricing/pricing-client.tsx");
    const adminProductsSource = readAppSource("./admin/components/admin-products-client.tsx");
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
    expect(adminProductsSource).toContain(
      'className="grid min-w-0 max-w-full gap-5" data-admin-products="pricing-management"',
    );
    expect(adminProductsSource).toContain('"grid min-w-0 max-w-full gap-5 xl:items-start"');
    expect(adminProductsSource).toContain('Card className="min-w-0 max-w-full p-4 sm:p-5"');
    expect(resultControlsSource).toContain("@radix-ui/react-tabs");
    expect(resultControlsSource).toContain("@radix-ui/react-accordion");
    expect(resultControlsSource).toContain("forceMount");
    expect(resultControlsSource).toContain("readonly deferUntilActive?: boolean");
    expect(resultControlsSource).toContain(
      "item.deferUntilActive && activeValue !== item.value ? null : item.content",
    );
    expect(resultControlsSource).toContain("data-[state=inactive]:hidden");
    expect(resultControlsSource).not.toContain('from "recharts"');
    expect(hourlyTimelineSource).toContain('from "recharts"');
    expect(hourlyTimelineSource).toContain('data-hourly-weather-timeline="true"');
    expect(forecastSource).toContain('import("./hourly-weather-timeline")');
    expect(forecastSource.match(/deferUntilActive: true/g)).toHaveLength(2);
    expect(forecastSource).toContain('value: "supporting-signals"');
    expect(adminShellSource).toContain("@radix-ui/react-dialog");
    expect(adminShellSource).toContain('data-admin-mobile-navigation="sheet"');
    expect(adminShellSource).not.toContain("overflow-x-auto pb-2");
    expect(adminSettingsSource).toContain("@radix-ui/react-accordion");
    expect(adminSettingsSource).toContain('data-admin-settings-groups="accordion"');
    expect(adminSettingsSource).toContain('设置：展开或收起`');
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
