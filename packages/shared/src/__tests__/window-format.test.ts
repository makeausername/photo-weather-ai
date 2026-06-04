import { describe, expect, it } from "vitest";
import {
  formatArrivalDeadlineZh,
  formatForecastWindowZh,
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
    ).toBe("2026年6月5日 周五 04:38-06:35");
  });

  it("formats same-day windows with full date and weekday", () => {
    expect(
      formatShootingWindowZh({
        startTime: "2026-05-08T04:38:00+08:00",
        endTime: "2026-05-08T06:35:00+08:00",
      }),
    ).toBe("2026年5月8日 周五 04:38-06:35");
  });

  it("formats cross-midnight windows with both dates", () => {
    expect(formatForecastWindowZh("2026-05-08T23:30:00+08:00", "2026-05-09T01:10:00+08:00")).toBe(
      "2026年5月8日 周五 23:30 - 5月9日 周六 01:10",
    );
  });

  it("keeps both years when the window crosses a year boundary", () => {
    expect(formatForecastWindowZh("2026-12-31T23:30:00+08:00", "2027-01-01T01:10:00+08:00")).toBe(
      "2026年12月31日 周四 23:30 - 2027年1月1日 周五 01:10",
    );
  });

  it("keeps both dates when the window crosses a month boundary", () => {
    expect(
      formatForecastWindowZh(
        "2026-06-30T23:30:00+08:00",
        "2026-07-01T01:10:00+08:00",
        "Asia/Shanghai",
      ),
    ).toBe("2026年6月30日 周二 23:30 - 7月1日 周三 01:10");
  });

  it("formats the requested local date in the supplied timezone", () => {
    expect(
      formatForecastWindowZh("2026-06-05T20:30:00Z", "2026-06-05T22:00:00Z", "America/Los_Angeles"),
    ).toBe("2026年6月5日 周五 13:30-15:00");
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
    ).toBe("5月8日 周五 04:38-06:35");
  });

  it("formats previous-day arrival deadlines with date and weekday", () => {
    expect(formatArrivalDeadlineZh("2026-05-07T21:15:00+08:00")).toBe(
      "建议到达：2026年5月7日 周四 21:15 前",
    );
  });

  it("falls back safely for missing or invalid windows", () => {
    expect(formatShootingWindowZh({ startTime: "2026-05-27T03:14:00+08:00" })).toBe("暂无明确窗口");
    expect(formatShootingWindowZh({ startTime: "bad", endTime: "2026-05-27T03:45:00+08:00" })).toBe(
      "时间待确认",
    );
  });
});
