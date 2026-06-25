import * as React from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoonPhaseCalendar } from "../components/moon-phase-calendar";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const calendarProps = {
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  timezone: "Asia/Shanghai",
  initialYear: 2026,
  initialMonth: 5,
  today: "2026-05-20",
} as const;

describe("MoonPhaseCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the required monthly moon calendar labels and controls", () => {
    const html = renderToStaticMarkup(React.createElement(MoonPhaseCalendar, calendarProps));

    expect(html).toContain("月相日历");
    expect(html).toContain("本月");
    expect(html).toContain("上个月");
    expect(html).toContain("下个月");
    expect(html).toContain("回到本月");
    expect(html).toContain("本月新月");
    expect(html).toContain("本月满月");
    expect(html).toContain("上弦月");
    expect(html).toContain("下弦月");
    expect(html).toContain("新月");
    expect(html).toContain("满月");
    expect(html).toContain("今天");
    expect(html).toContain("农历");
    expect(html).toContain("grid-cols-7");
    expect(html).toContain('data-moon-calendar-day="2026-05-01"');
    expect(html).toContain('data-moon-calendar-day="2026-05-31"');
  });

  it("renders locally without external API access", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("moon calendar rendering must not call external APIs");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderToStaticMarkup(React.createElement(MoonPhaseCalendar, calendarProps));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the mobile calendar width-fluid without truncating phase labels", () => {
    const html = renderToStaticMarkup(React.createElement(MoonPhaseCalendar, calendarProps));
    const source = readFileSync(
      fileURLToPath(new URL("../components/moon-phase-calendar.tsx", import.meta.url)),
      "utf8",
    );

    expect(html).toContain("mt-5 w-full max-w-full min-w-0");
    expect(html).not.toContain("overflow-x-auto");
    expect(html).not.toContain("min-w-[480px]");
    expect(html).not.toContain('data-moon-calendar-scroll="true"');
    expect(html).not.toContain('data-moon-calendar-inner="true"');
    const renderedDays = html.match(/data-moon-calendar-day=/g) ?? [];

    expect(html).toContain(">一</span>");
    expect(html).toContain(">日</span>");
    expect(renderedDays).toHaveLength(31);
    expect(html).toContain('title="娥眉月"');
    expect(html).toContain(">娥眉</p>");
    expect(html).not.toContain(">娥眉月</p>");
    expect(source).toContain("compactMoonPhaseNames");
    expect(source).toContain("h-5 w-5 min-[390px]:h-6 min-[390px]:w-6");
    expect(source).toContain("text-[10px] font-semibold");
    expect(source).not.toContain("whitespace-nowrap");
    expect(source).not.toContain("truncate");
  });
});
