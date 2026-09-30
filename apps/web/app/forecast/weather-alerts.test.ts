import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import { WeatherAlerts } from "./weather-alerts";

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const basis = { calendarBasis: { timezone: "Asia/Shanghai" } };
function render(result: Partial<ForecastCalculationResult>): string {
  return renderToStaticMarkup(
    React.createElement(WeatherAlerts, {
      result: { ...basis, ...result } as ForecastCalculationResult,
    }),
  );
}
describe("official weather warning display", () => {
  it("distinguishes unavailable warnings from a successful empty response", () => {
    expect(render({ weatherAlertsStatus: "available", weatherAlerts: [] })).toBe("");
    expect(render({ weatherAlertsStatus: "unavailable", weatherAlerts: [] })).toContain(
      "天气预警暂未获取",
    );
  });
  it("shows warning instructions, localized validity and required attribution safely", () => {
    const html = render({
      weatherAlertsStatus: "available",
      weatherAlerts: [
        {
          id: "warning",
          level: "orange",
          title: "大风橙色预警",
          description: "<script>大风</script>",
          startsAt: "2026-09-30T02:00:00Z",
          endsAt: "2026-09-30T10:00:00Z",
          senderName: "当地气象部门",
          instruction: "暂停户外高山拍摄。",
          attributions: ["官方天气预警来源"],
        },
      ],
    });
    expect(html).toContain("大风橙色预警");
    expect(html).toContain("暂停户外高山拍摄。");
    expect(html).toContain("当地气象部门");
    expect(html).toContain("10:00");
    expect(html).toContain("18:00");
    expect(html).toContain("官方天气预警来源");
    expect(html).not.toContain("<script>");
  });
});
