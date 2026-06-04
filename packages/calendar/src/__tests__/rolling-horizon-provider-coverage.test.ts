import { describe, expect, it } from "vitest";
import { resolveRollingHorizonProviderRequest } from "../rolling-horizon-provider-coverage.js";

describe("rolling horizon provider coverage", () => {
  it("plans future24 afternoon coverage beyond the current natural day", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T15:20:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "24h",
      providerType: "forecast_days",
    });

    expect(plan).toMatchObject({
      horizonHours: 24,
      anchorStartLocal: "2026-06-04T16:00:00+08:00",
      anchorEndLocal: "2026-06-05T15:00:00+08:00",
      expectedRowCount: 24,
      minRequestHours: 24,
      recommendedRequestHours: 30,
      requiredForecastDays: 2,
      coverageRule: "forecast_days_calendar_coverage",
    });
    expect(plan.anchorEndLocal.endsWith("23:00:00+08:00")).toBe(false);
  });

  it("plans future48 morning as 48 rolling rows and 3 day-based forecast days", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T08:22:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "48h",
      providerType: "forecast_days",
    });

    expect(plan).toMatchObject({
      anchorStartLocal: "2026-06-04T09:00:00+08:00",
      anchorEndLocal: "2026-06-06T08:00:00+08:00",
      expectedRowCount: 48,
      minRequestHours: 48,
      recommendedRequestHours: 54,
      requiredForecastDays: 3,
    });
  });

  it("plans future48 evening as a rolling horizon without assuming forecast_days=2", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T20:30:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "48h",
      providerType: "forecast_days",
    });

    expect(plan).toMatchObject({
      anchorStartLocal: "2026-06-04T21:00:00+08:00",
      anchorEndLocal: "2026-06-06T20:00:00+08:00",
      expectedRowCount: 48,
      requiredForecastDays: 3,
    });
  });

  it("plans future72 with enough buffered hours and calendar days", () => {
    const hourlyPlan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T08:22:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "72h",
      providerType: "forecast_hours",
    });
    const dayPlan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T08:22:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "72h",
      providerType: "forecast_days",
    });

    expect(hourlyPlan).toMatchObject({
      expectedRowCount: 72,
      recommendedRequestHours: 78,
      coverageRule: "forecast_hours_with_buffer",
    });
    expect(dayPlan).toMatchObject({
      anchorEndLocal: "2026-06-07T08:00:00+08:00",
      requiredForecastDays: 4,
    });
  });

  it("plans future7d as a rolling 168-hour horizon", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T08:22:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "7d",
      providerType: "forecast_hours",
    });

    expect(plan).toMatchObject({
      horizonHours: 168,
      expectedRowCount: 168,
      anchorStartLocal: "2026-06-04T09:00:00+08:00",
      anchorEndLocal: "2026-06-11T08:00:00+08:00",
    });
    expect(plan.recommendedRequestHours).toBeGreaterThanOrEqual(168);
  });

  it("formats cross-month coverage correctly", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-01-31T22:30:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "48h",
      providerType: "forecast_days",
    });

    expect(plan.anchorStartLocal).toBe("2026-01-31T23:00:00+08:00");
    expect(plan.anchorEndLocal).toBe("2026-02-02T22:00:00+08:00");
    expect(plan.requiredForecastDays).toBe(3);
  });

  it("formats cross-year coverage correctly", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-12-31T23:20:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "48h",
      providerType: "forecast_days",
    });

    expect(plan.anchorStartLocal).toBe("2027-01-01T00:00:00+08:00");
    expect(plan.anchorEndLocal).toBe("2027-01-02T23:00:00+08:00");
    expect(plan.requiredForecastDays).toBe(3);
  });

  it("marks provider-limited coverage as incomplete request capacity", () => {
    const plan = resolveRollingHorizonProviderRequest({
      generatedAt: "2026-06-04T08:22:00+08:00",
      timezone: "Asia/Shanghai",
      horizon: "72h",
      providerType: "forecast_hours",
      providerCapabilities: {
        supportsForecastHours: true,
        maxForecastHours: 48,
      },
    });

    expect(plan.recommendedRequestHours).toBe(48);
    expect(plan.coverageRule).toBe("provider_max_limited");
  });
});
