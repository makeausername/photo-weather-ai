import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HourlyWeatherMatrix, weatherMatrixMetrics } from "./hourly-weather-matrix";
import { HourlyWeatherTimeline } from "./hourly-weather-timeline";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import { hourlyColumnVisibility } from "./professional-hourly-columns";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const row = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result
  .professionalHourlyData![0]!;

describe("weather matrix data and reading order", () => {
  it("also reconciles clear text from older cached payloads with the displayed clouds", () => {
    const metric = weatherMatrixMetrics({}, "气温", false).find((m) => m.key === "weather")!;
    expect(metric.value({ ...row, weatherText: "晴", cloudTotalPercent: 100 })).toBe(
      "云量预报有分歧",
    );
    expect(metric.value({ ...row, weatherText: "雨夹雪", cloudTotalPercent: 100 })).toBe("雨夹雪");
  });
  it("renders time across columns and metrics down rows across local midnight", () => {
    const rows = [
      { ...row, time: "2026-10-04T15:00:00Z" },
      { ...row, time: "2026-10-04T16:00:00Z" },
    ];
    const html = renderToStaticMarkup(
      <HourlyWeatherMatrix
        rows={rows}
        timezone="Asia/Shanghai"
        config={hourlyColumnVisibility("common")}
        temperatureLabel="机位估算气温 °C"
        showRawTemperature={true}
      />,
    );
    expect(html).toContain('scope="row"');
    expect(html).toContain("2026-10-04 23:00 小时详情");
    expect(html).toContain("2026-10-05 00:00 小时详情");
    expect(html).toContain('data-matrix-metric="windGustMs"');
    expect(html.match(/data-matrix-metric="precipitationAmountMm"/g)).toHaveLength(1);
    expect(html.match(/data-matrix-time=/g)).toHaveLength(2);
  });
  it("preserves trace rain, true zero and missing data while retaining units", () => {
    const metrics = weatherMatrixMetrics({}, "机位估算气温 °C", true);
    const precipitation = metrics.find((metric) => metric.key === "precipitationAmountMm")!;
    expect(precipitation.unit).toBe("mm");
    expect(precipitation.value({ ...row, precipitationAmountMm: 0 })).toBe("0");
    expect(precipitation.value({ ...row, precipitationAmountMm: 0.004 })).toBe("<0.01");
    expect(precipitation.value({ ...row, precipitationAmountMm: null })).toBe("—");
    expect(
      metrics
        .find((metric) => metric.key === "visibilityMeters")!
        .value({ ...row, visibilityMeters: 12345 }),
    ).toBe("12.3");
    expect(
      metrics
        .find((metric) => metric.key === "rawTemperatureC")!
        .value({ ...row, rawTemperatureC: 23.5 }),
    ).toBe("23.5");
  });
  it("does not invent missing weather text or reveal provider labels as weather", () => {
    const metric = weatherMatrixMetrics({}, "气温 °C", false).find(
      (item) => item.key === "weather",
    )!;
    expect(metric.value({ ...row, weatherText: "meteoblue" })).toBe("—");
    expect(metric.value({ ...row, weatherText: null })).toBe("—");
    expect(metric.value({ ...row, weatherText: "小雨" })).toBe("小雨");
  });
  it("keeps metric filters from re-enabling configured hidden data", () => {
    const metrics = weatherMatrixMetrics(
      hourlyColumnVisibility("rain", { showVisibilityColumn: false }),
      "气温 °C",
      false,
    );
    expect(metrics.map((item) => item.key)).toEqual([
      "weather",
      "precipitationAmountMm",
      "precipitationProbabilityPercent",
    ]);
  });
});

describe("compact hourly rain summary", () => {
  const point = {
    key: "2026-10-04T12:00:00+08:00",
    label: "12:00",
    temperatureC: 20,
    dewPointC: 10,
    cloudCoverPercent: 50,
    precipitationMm: 0,
    precipitationProbabilityPercent: 0,
    isNight: false,
  };
  it("replaces an entirely dry track with a short summary", () => {
    const html = renderToStaticMarkup(<HourlyWeatherTimeline points={[point]} weatherFirst />);
    expect(html).toContain('data-dry-hourly-summary="true"');
    expect(html).not.toContain('data-hourly-track="rain"');
    expect(html).toContain('data-hourly-track="temperature"');
  });
  it("retains the rain track for missing or nonzero data", () => {
    for (const precipitationMm of [null, 0.004, 2]) {
      const html = renderToStaticMarkup(
        <HourlyWeatherTimeline points={[{ ...point, precipitationMm }]} weatherFirst />,
      );
      expect(html).not.toContain('data-dry-hourly-summary="true"');
      expect(html).toContain('data-hourly-track="rain"');
    }
  });
});
