import { describe, expect, it, vi } from "vitest";
import {
  buildForecastDateRange,
  defaultTimezone,
  formatChineseDate,
  formatChineseDateTime,
  formatChineseDateTimeRange,
  formatChineseTime,
  getChineseCalendarInfo,
  getForecastTargetDates,
  getNowInTimezone,
  getSolarTermInfo,
} from "../index.js";

const midnightNow = "2026-05-20T00:00:00+08:00";

describe("Calendar Core", () => {
  it("uses Asia/Shanghai as the default runtime timezone", () => {
    const now = getNowInTimezone();

    expect(now.timeZone).toBe(defaultTimezone);
  });

  it("builds 24h/48h/72h/7d forecast ranges from an injected now", () => {
    const range24 = buildForecastDateRange("24h", { now: midnightNow });
    const range48 = buildForecastDateRange("48h", { now: midnightNow });
    const range72 = buildForecastDateRange("72h", { now: midnightNow });
    const range7d = buildForecastDateRange("7d", { now: midnightNow });

    expect(range24).toMatchObject({
      forecastStart: "2026-05-20T00:00:00+08:00",
      forecastEnd: "2026-05-21T00:00:00+08:00",
      targetDates: ["2026-05-20"],
      horizonHours: 24,
      timezone: defaultTimezone,
    });
    expect(range48.targetDates).toEqual(["2026-05-20", "2026-05-21"]);
    expect(range72.targetDates).toEqual(["2026-05-20", "2026-05-21", "2026-05-22"]);
    expect(range7d.horizonHours).toBe(168);
    expect(range7d.targetDates).toHaveLength(7);
  });

  it("returns Asia/Shanghai calendar dates when a range crosses midnight", () => {
    const range = buildForecastDateRange("24h", {
      now: "2026-05-20T23:30:00+08:00",
    });

    expect(range.targetDates).toEqual(["2026-05-20", "2026-05-21"]);
    expect(
      getForecastTargetDates(
        "2026-05-20T23:30:00+08:00",
        "2026-05-21T23:29:00+08:00",
        defaultTimezone,
      ),
    ).toEqual(["2026-05-20", "2026-05-21"]);
  });

  it("formats Chinese date, time, datetime, and cross-day ranges", () => {
    expect(formatChineseDate("2026-05-20", defaultTimezone)).toBe("2026年5月20日 星期三");
    expect(formatChineseTime("2026-05-20T05:18:00+08:00", defaultTimezone)).toBe("05:18");
    expect(formatChineseDateTime("2026-05-20T05:18:00+08:00", defaultTimezone)).toBe(
      "2026年5月20日 05:18",
    );
    expect(
      formatChineseDateTimeRange(
        "2026-05-20T23:30:00+08:00",
        "2026-05-21T01:00:00+08:00",
        defaultTimezone,
      ),
    ).toBe("2026年5月20日 23:30 至 5月21日 01:00");
  });

  it("returns safe Chinese lunar calendar fields", () => {
    const info = getChineseCalendarInfo("2026-05-20", defaultTimezone);

    expect(info).toMatchObject({
      date: "2026-05-20",
      timezone: defaultTimezone,
      lunarYear: expect.any(Number),
      lunarMonth: expect.any(Number),
      lunarDay: expect.any(Number),
      lunarDateText: expect.any(String),
    });
    expect(info.lunarDateText).not.toHaveLength(0);
  });

  it("returns solar term information without exposing raw library objects", () => {
    const info = getSolarTermInfo("2026-02-04", defaultTimezone);

    expect(info).toMatchObject({
      date: "2026-02-04",
      timezone: defaultTimezone,
      previous: {
        name: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
      next: {
        name: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    });
  });

  it("does not call external network APIs", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("network should not be called");
    });
    vi.stubGlobal("fetch", fetchMock);

    buildForecastDateRange("24h", { now: midnightNow });
    getChineseCalendarInfo("2026-05-20", defaultTimezone);
    getSolarTermInfo("2026-02-04", defaultTimezone);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
