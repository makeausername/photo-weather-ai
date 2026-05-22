import * as React from "react";
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
  });

  it("renders locally without external API access", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("moon calendar rendering must not call external APIs");
    });
    vi.stubGlobal("fetch", fetchMock);

    renderToStaticMarkup(React.createElement(MoonPhaseCalendar, calendarProps));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
