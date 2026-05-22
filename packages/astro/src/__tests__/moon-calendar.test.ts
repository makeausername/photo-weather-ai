import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalAstroProvider,
  buildMoonCalendarMonth,
  getCurrentMoonCalendarMonthKey,
  shiftMoonCalendarMonth,
} from "../index.js";

const huangshanMoonCalendarInput = {
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  year: 2026,
  month: 5,
  timezone: "Asia/Shanghai",
  today: "2026-05-20",
} as const;

const phaseLabels = ["新月", "娥眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"];

describe("monthly moon calendar calculations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates a Monday-first month grid with all days in the month", () => {
    const calendar = buildMoonCalendarMonth(huangshanMoonCalendarInput);

    expect(calendar).toMatchObject({
      year: 2026,
      month: 5,
      titleZh: "2026年5月",
      timezone: "Asia/Shanghai",
      firstDayOfWeek: 4,
    });
    expect(calendar.days).toHaveLength(31);
    expect(calendar.days[0]).toMatchObject({
      date: "2026-05-01",
      dateLabel: "5月1日",
    });
    expect(calendar.days.at(-1)).toMatchObject({
      date: "2026-05-31",
      dateLabel: "5月31日",
    });
  });

  it("identifies today in the requested timezone", () => {
    const calendar = buildMoonCalendarMonth(huangshanMoonCalendarInput);
    const today = calendar.days.filter((day) => day.isToday);

    expect(today).toHaveLength(1);
    expect(today[0]?.date).toBe("2026-05-20");
  });

  it("derives Chinese phase labels, illumination, and major phase summary days", () => {
    const calendar = buildMoonCalendarMonth(huangshanMoonCalendarInput);

    for (const day of calendar.days) {
      expect(phaseLabels).toContain(day.phaseNameZh);
      expect(day.illumination).toBeGreaterThanOrEqual(0);
      expect(day.illumination).toBeLessThanOrEqual(1);
      expect(day.lunarDateText).toEqual(expect.any(String));
      expect(day.lunarDateText).not.toHaveLength(0);
    }

    expect(calendar.summary.newMoon?.date).toMatch(/^2026-05-/);
    expect(calendar.summary.fullMoon?.date).toMatch(/^2026-05-/);
    expect(calendar.summary.firstQuarter?.date).toMatch(/^2026-05-/);
    expect(calendar.summary.lastQuarter?.date).toMatch(/^2026-05-/);
  });

  it("supports month navigation helpers across year boundaries", () => {
    expect(shiftMoonCalendarMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMoonCalendarMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMoonCalendarMonth(2026, 5, 2)).toEqual({ year: 2026, month: 7 });
  });

  it("uses Asia/Shanghai as the default current-month timezone", () => {
    expect(getCurrentMoonCalendarMonthKey(undefined, "2026-05-31T17:00:00Z")).toEqual({
      year: 2026,
      month: 6,
    });
  });

  it("does not perform external API calls for month generation or provider access", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("moon calendar must use local astronomy calculations");
    });
    vi.stubGlobal("fetch", fetchMock);

    buildMoonCalendarMonth(huangshanMoonCalendarInput);
    await new LocalAstroProvider().getMoonCalendarMonth(huangshanMoonCalendarInput);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
