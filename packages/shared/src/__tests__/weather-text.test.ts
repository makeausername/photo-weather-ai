import { describe, expect, it } from "vitest";
import { formatWeatherTransitionZh, simplifyWeatherSummaryZh } from "../weather-text.js";

describe("weather text formatting", () => {
  it("deduplicates same day and night weather text", () => {
    expect(formatWeatherTransitionZh("多云", "多云")).toBe("多云");
    expect(formatWeatherTransitionZh("阴", "阴")).toBe("阴");
    expect(formatWeatherTransitionZh("晴", "晴")).toBe("晴");
    expect(formatWeatherTransitionZh("小雨", "小雨")).toBe("小雨为主");
  });

  it("keeps real transitions intact", () => {
    expect(formatWeatherTransitionZh("多云", "晴")).toBe("多云转晴");
    expect(simplifyWeatherSummaryZh("阴转阴")).toBe("阴");
    expect(simplifyWeatherSummaryZh("晴转晴")).toBe("晴");
    expect(simplifyWeatherSummaryZh("小雨转小雨")).toBe("小雨为主");
    expect(simplifyWeatherSummaryZh("多云 转 多云")).toBe("多云");
    expect(simplifyWeatherSummaryZh("阴转晴")).toBe("阴转晴");
  });
});
