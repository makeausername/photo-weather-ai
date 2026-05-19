import { describe, expect, it } from "vitest";
import {
  forecastHorizonLabels,
  forecastTargetLabels,
  getForecastHorizonLabel,
  getForecastTargetLabel,
  getLocationSourceLabel,
  getLocationTypeLabel,
  getViewDirectionLabel,
  locationSourceLabels,
  locationTypeLabels,
  viewDirectionLabels,
} from "../index";

describe("Chinese enum labels", () => {
  it("maps location and photo spot enum codes to Simplified Chinese labels", () => {
    expect(getLocationTypeLabel("scenic_area")).toBe("景区");
    expect(getLocationSourceLabel("amap")).toBe("高德地图");
    expect(getViewDirectionLabel("northeast")).toBe("东北");
  });

  it("maps forecast horizon and target codes to Simplified Chinese labels", () => {
    expect(getForecastHorizonLabel("24h")).toBe("未来24小时");
    expect(getForecastHorizonLabel("48h")).toBe("未来48小时");
    expect(getForecastHorizonLabel("72h")).toBe("未来72小时");
    expect(getForecastHorizonLabel("7d")).toBe("未来7天");

    expect(getForecastTargetLabel("general")).toBe("综合判断");
    expect(getForecastTargetLabel("cloud_sea")).toBe("云海");
    expect(getForecastTargetLabel("glow")).toBe("朝霞晚霞");
    expect(getForecastTargetLabel("astro")).toBe("星空银河");
  });

  it("does not expose raw enum values as labels", () => {
    expect(locationTypeLabels.scenic_area).not.toBe("scenic_area");
    expect(locationSourceLabels.manual).not.toBe("manual");
    expect(viewDirectionLabels.unknown).not.toBe("unknown");
    expect(forecastTargetLabels.cloud_sea).not.toBe("cloud_sea");
    expect(forecastHorizonLabels["24h"]).not.toBe("24h");
  });
});
