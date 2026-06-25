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

    expect(html).toContain("min-h-screen overflow-x-hidden");
    expect(html).toContain("w-full min-w-0 px-[clamp(16px,4vw,72px)]");
    expect(html).toContain("flex w-full min-w-0 items-center");
    expect(html).toContain("mx-auto flex w-full max-w-[1560px] min-w-0");
    expect(html).not.toContain("px-[clamp(24px,4vw,72px)]");
  });

  it("keeps dense calendar, table, and dashboard wrappers locally constrained", () => {
    const uiSource = readAppSource("../components/ui.tsx");
    const moonSource = readAppSource("../components/moon-phase-calendar.tsx");
    const dashboardSource = readAppSource("./forecast/result-dashboard-components.tsx");
    const forecastSource = readAppSource("./forecast/forecast-result-client.tsx");
    const combinedSource = [uiSource, moonSource, dashboardSource, forecastSource].join("\n");

    expect(uiSource).toContain("w-full max-w-full min-w-0 overflow-x-auto");
    expect(moonSource).toContain('data-moon-calendar-scroll="true"');
    expect(moonSource).toContain('className="min-w-[480px]"');
    expect(dashboardSource).toContain("grid min-w-0 max-w-full items-stretch");
    expect(forecastSource).toContain('data-cloud-sea-professional-table-scroll="true"');
    expect(forecastSource).toContain("max-w-full overflow-x-auto min-w-0");
    expect(combinedSource).not.toContain("w-screen");
    expect(combinedSource).not.toContain("w-[100vw]");
    expect(combinedSource).not.toContain("min-w-[100vw]");
  });
});

function readAppSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}
