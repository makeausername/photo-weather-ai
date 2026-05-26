import { describe, expect, it } from "vitest";
import { formatArrivalDeadlineZh, formatShootingWindowZh } from "../window-format.js";

describe("shooting window zh formatter", () => {
  it("formats same-day windows with full date", () => {
    expect(
      formatShootingWindowZh({
        startTime: "2026-05-27T03:14:00+08:00",
        endTime: "2026-05-27T03:45:00+08:00",
      }),
    ).toBe("2026年5月27日 03:14–03:45");
  });

  it("formats cross-midnight windows with both dates", () => {
    expect(
      formatShootingWindowZh({
        startTime: "2026-05-26T22:45:00+08:00",
        endTime: "2026-05-27T03:45:00+08:00",
      }),
    ).toBe("2026年5月26日 22:45 – 5月27日 03:45");
  });

  it("keeps both years when the window crosses a year boundary", () => {
    expect(
      formatShootingWindowZh({
        startTime: "2026-12-31T22:45:00+08:00",
        endTime: "2027-01-01T03:45:00+08:00",
      }),
    ).toBe("2026年12月31日 22:45 – 2027年1月1日 03:45");
  });

  it("supports compact date labels without dropping the date", () => {
    expect(
      formatShootingWindowZh(
        {
          startTime: "2026-05-27T03:14:00+08:00",
          endTime: "2026-05-27T03:45:00+08:00",
        },
        "Asia/Shanghai",
        { style: "compact" },
      ),
    ).toBe("5月27日 03:14–03:45");
  });

  it("formats previous-day arrival deadlines with date", () => {
    expect(formatArrivalDeadlineZh("2026-05-26T21:15:00+08:00")).toBe(
      "建议到达：2026年5月26日 21:15 前",
    );
  });

  it("falls back safely for missing or invalid windows", () => {
    expect(formatShootingWindowZh({ startTime: "2026-05-27T03:14:00+08:00" })).toBe(
      "暂无明确窗口",
    );
    expect(formatShootingWindowZh({ startTime: "bad", endTime: "2026-05-27T03:45:00+08:00" })).toBe(
      "时间待确认",
    );
  });
});
