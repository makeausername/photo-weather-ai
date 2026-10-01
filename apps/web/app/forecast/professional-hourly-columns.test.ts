import { describe, expect, it } from "vitest";
import { hourlyColumnVisibility, hourlyTableNumber } from "./professional-hourly-columns";
import { splitDecisionValue } from "../../components/decision-value";

describe("professional data presentation", () => {
  it("narrows columns without restoring fields disabled by the report", () => {
    expect(hourlyColumnVisibility("all", { showCloudColumns: false }).showCloudColumns).toBe(false);
    expect(hourlyColumnVisibility("cloud")).toMatchObject({
      showCloudColumns: true,
      showTemperatureColumns: false,
      showPrecipitationColumns: false,
    });
    expect(hourlyColumnVisibility("thermal")).toMatchObject({
      showCloudColumns: false,
      showTemperatureColumns: true,
      showDewPointColumns: true,
      showWindColumns: true,
      showPrecipitationColumns: false,
    });
    expect(hourlyColumnVisibility("rain")).toMatchObject({
      showPrecipitationColumns: true,
      showVisibilityColumn: true,
      showTemperatureColumns: false,
    });
    expect(
      hourlyColumnVisibility("rain", { showVisibilityColumn: false }).showVisibilityColumn,
    ).toBe(false);
  });
  it("distinguishes zero, small positive rain, missing and invalid data", () => {
    expect(hourlyTableNumber(0, 2)).toBe("0");
    expect(hourlyTableNumber(0.004, 2)).toBe("<0.01");
    expect(hourlyTableNumber(0.045, 2)).toBe("0.05");
    expect(hourlyTableNumber(-22.65)).toBe("-22.7");
    expect(hourlyTableNumber(null, 2)).toBe("—");
    expect(hourlyTableNumber(undefined)).toBe("—");
    expect(hourlyTableNumber(NaN)).toBe("—");
    expect(hourlyTableNumber(Infinity)).toBe("—");
    expect(hourlyTableNumber(-0.03)).toBe(">-0.1");
  });
  it("separates a date prefix without removing overnight window information", () => {
    expect(splitDecisionValue("2026年10月1日 星期四 · 19:25–次日03:48")).toEqual({
      context: "2026年10月1日 星期四",
      value: "19:25–次日03:48",
    });
    expect(splitDecisionValue("19:25–10月2日03:48")).toEqual({
      context: null,
      value: "19:25–10月2日03:48",
    });
    expect(splitDecisionValue("暂无可拍窗口").value).toBe("暂无可拍窗口");
  });
});
