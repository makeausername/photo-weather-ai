import { describe, expect, it } from "vitest";
import {
  crossesLocalDateBoundary,
  formatArrivalDeadlineZh,
  formatForecastWindowZh,
  formatLocalDate,
  formatLocalDateLabel,
  formatLocalDateTime,
  formatLocalDateTimeRange,
  formatLocalTime,
  formatLocalTimeRange,
  formatLocalWeekday,
  formatShootingWindowZh,
} from "../window-format.js";

describe("shooting window zh formatter", () => {
  it("formats the requested same-day Cloud Sea window with full date and weekday", () => {
    expect(
      formatForecastWindowZh(
        "2026-06-05T04:38:00+08:00",
        "2026-06-05T06:35:00+08:00",
        "Asia/Shanghai",
      ),
    ).toBe("2026年6月5日 星期五 · 04:38–06:35");
  });

  it("formats same-day windows with full date and weekday", () => {
    expect(
      formatShootingWindowZh({
        startTime: "2026-05-08T04:38:00+08:00",
        endTime: "2026-05-08T06:35:00+08:00",
      }),
    ).toBe("2026年5月8日 星期五 · 04:38–06:35");
  });

  it("formats cross-midnight windows with both dates", () => {
    expect(formatForecastWindowZh("2026-05-08T23:30:00+08:00", "2026-05-09T01:10:00+08:00")).toBe(
      "2026年5月8日 星期五 23:30–5月9日 星期六 01:10",
    );
  });

  it("keeps both years when the window crosses a year boundary", () => {
    expect(formatForecastWindowZh("2026-12-31T23:30:00+08:00", "2027-01-01T01:10:00+08:00")).toBe(
      "2026年12月31日 星期四 23:30–2027年1月1日 星期五 01:10",
    );
  });

  it("keeps both dates when the window crosses a month boundary", () => {
    expect(
      formatForecastWindowZh(
        "2026-06-30T23:30:00+08:00",
        "2026-07-01T01:10:00+08:00",
        "Asia/Shanghai",
      ),
    ).toBe("2026年6月30日 星期二 23:30–7月1日 星期三 01:10");
  });

  it("formats the requested local date in the supplied timezone", () => {
    expect(
      formatForecastWindowZh("2026-06-05T20:30:00Z", "2026-06-05T22:00:00Z", "America/Los_Angeles"),
    ).toBe("2026年6月5日 星期五 · 13:30–15:00");
  });

  it("supports compact date labels without dropping the date", () => {
    expect(
      formatShootingWindowZh(
        {
          startTime: "2026-05-08T04:38:00+08:00",
          endTime: "2026-05-08T06:35:00+08:00",
        },
        "Asia/Shanghai",
        { style: "compact" },
      ),
    ).toBe("5月8日 星期五 · 04:38–06:35");
  });

  it("formats previous-day arrival deadlines with date and weekday", () => {
    expect(formatArrivalDeadlineZh("2026-05-07T21:15:00+08:00")).toBe(
      "建议到达：2026年5月7日 星期四 · 21:15 前",
    );
  });

  it("falls back safely for missing or invalid windows", () => {
    expect(formatShootingWindowZh({ startTime: "2026-05-27T03:14:00+08:00" })).toBe("暂无明确窗口");
    expect(formatShootingWindowZh({ startTime: "bad", endTime: "2026-05-27T03:45:00+08:00" })).toBe(
      "时间待确认",
    );
  });

  it("formats same-day child time ranges without repeating a visible parent date", () => {
    const label = formatLocalTimeRange(
      "2026-06-10T05:17:00+08:00",
      "2026-06-10T06:32:00+08:00",
      "Asia/Shanghai",
    );

    expect(label).toBe("05:17–06:32");
    expect(label).not.toContain("2026年6月10日");
    expect(label).not.toContain("星期三");
  });

  it("formats standalone same-day date-time ranges with the date exactly once", () => {
    const label = formatLocalDateTimeRange(
      "2026-06-10T05:17:00+08:00",
      "2026-06-10T06:32:00+08:00",
      "Asia/Shanghai",
    );

    expect(label).toBe("2026年6月10日 星期三 · 05:17–06:32");
    expect(label.match(/2026年6月10日/g)).toHaveLength(1);
    expect(label).not.toContain("周三");
    expect(label).not.toContain("-");
  });

  it("keeps both necessary dates for child cross-day ranges", () => {
    expect(
      formatLocalTimeRange(
        "2026-06-09T23:30:00+08:00",
        "2026-06-10T00:40:00+08:00",
        "Asia/Shanghai",
      ),
    ).toBe("6月9日 23:30–6月10日 00:40");
    expect(
      crossesLocalDateBoundary(
        "2026-06-09T23:30:00+08:00",
        "2026-06-10T00:40:00+08:00",
        "Asia/Shanghai",
      ),
    ).toBe(true);
  });

  it("formats date, weekday, time, and date-time labels from one contract", () => {
    const value = "2026-06-10T05:17:00+08:00";

    expect(formatLocalDate(value, "Asia/Shanghai")).toBe("2026年6月10日");
    expect(formatLocalWeekday(value, "Asia/Shanghai")).toBe("星期三");
    expect(formatLocalDateLabel(value, "Asia/Shanghai")).toBe("2026年6月10日 星期三");
    expect(formatLocalTime(value, "Asia/Shanghai")).toBe("05:17");
    expect(formatLocalDateTime(value, "Asia/Shanghai")).toBe("2026年6月10日 星期三 · 05:17");
  });

  it("uses the supplied non-Asia timezone for local day boundaries", () => {
    expect(formatLocalDateLabel("2026-06-10T06:30:00Z", "America/Los_Angeles")).toBe(
      "2026年6月9日 星期二",
    );
    expect(
      formatLocalTimeRange("2026-06-10T06:30:00Z", "2026-06-10T07:40:00Z", "America/Los_Angeles"),
    ).toBe("6月9日 23:30–6月10日 00:40");
    expect(
      crossesLocalDateBoundary(
        "2026-06-10T06:30:00Z",
        "2026-06-10T07:40:00Z",
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });
});
