import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import { GeneralWeatherHeader, GeneralWeatherOverview } from "./general-weather-overview";
import {
  summarizeWeatherHours,
  weatherDateKey,
  weatherRowsForDate,
  weatherBlockerLabels,
} from "./general-weather-data";
import { buildProfessionalHourlyDisplayDataForResult } from "./cloud-sea-display-data";
import { hourlyColumnVisibility } from "./professional-hourly-columns";
import ForecastPage from "./page";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const fixture = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase");
const baseHour = fixture.result.professionalHourlyData![0]!;
const hours = [0, 1, 2].map((index) => ({
  ...baseHour,
  time: `2026-10-04T${String(15 + index).padStart(2, "0")}:00:00Z`,
  precipitationAmountMm: 0,
  precipitationProbabilityPercent: 0,
  windGustMs: 8 + index,
}));

describe("weather overview data contract", () => {
  it("groups by location timezone across midnight", () => {
    expect(weatherDateKey(hours[1]!.time, "Asia/Shanghai")).toBe("2026-10-05");
    expect(weatherRowsForDate(hours, "2026-10-04", "Asia/Shanghai")).toHaveLength(1);
    expect(weatherRowsForDate(hours, "all", "Asia/Shanghai")).toHaveLength(3);
  });
  it("does not infer no rain from missing amounts, probabilities or gaps", () => {
    expect(summarizeWeatherHours(hours).rainLabel).toBe("暂无降水信号");
    expect(summarizeWeatherHours([]).rainLabel).toBe("降水数据不完整");
    expect(summarizeWeatherHours([{ ...hours[0]!, precipitationAmountMm: null }]).rainLabel).toBe(
      "降水数据不完整",
    );
    expect(
      summarizeWeatherHours([{ ...hours[0]!, precipitationProbabilityPercent: null }]).rainLabel,
    ).toBe("降水数据不完整");
    expect(summarizeWeatherHours([hours[0]!, hours[2]!]).complete).toBe(false);
  });
  it("retains trace rain, sums amounts and labels maximum hourly probability", () => {
    const summary = summarizeWeatherHours([
      { ...hours[0]!, precipitationAmountMm: 0.004, precipitationProbabilityPercent: 15 },
      { ...hours[1]!, precipitationAmountMm: 1.2, precipitationProbabilityPercent: 60 },
    ]);
    expect(summary.rainLabel).toBe("有降水信号");
    expect(summary.amount).toBeCloseTo(1.204);
    expect(summary.maxProbability).toBe(60);
    expect(summary.probabilityInconsistent).toBe(false);
    expect(
      summarizeWeatherHours([{ ...hours[0]!, precipitationAmountMm: 2 }]).probabilityInconsistent,
    ).toBe(true);
    expect(summarizeWeatherHours(hours).maxGust).toBe(10);
  });
  it("does not turn a list of possible phenomena into three confirmed blockers", () => {
    expect(weatherBlockerLabels(["天气现象包含雨、雾或厚云信号"])).toEqual([]);
    expect(weatherBlockerLabels(["天气现象有厚云遮挡"])).toEqual(["云量偏高"]);
    expect(weatherBlockerLabels(["暂无降水干扰"])).toEqual([]);
    expect(weatherBlockerLabels(["降水风险高，夜间窗口可能被打断", "能见度偏低"])).toEqual([
      "降水干扰",
      "通透度不足",
    ]);
  });
  it("places rain and wind in selected groups without re-enabling hidden fields", () => {
    expect(hourlyColumnVisibility("common")).toMatchObject({
      showCloudColumns: false,
      showPrecipitationColumns: true,
      showWindColumns: true,
    });
    expect(hourlyColumnVisibility("wind")).toMatchObject({
      showWindColumns: true,
      showPrecipitationColumns: false,
      showCloudColumns: false,
    });
    expect(hourlyColumnVisibility("common", { showWindColumns: false }).showWindColumns).toBe(
      false,
    );
  });
});

describe("weather overview presentation", () => {
  function render(rows = hours, riskFlags = fixture.result.riskFlags.slice(0, 0)) {
    const result = {
      ...fixture.result,
      target: "general" as const,
      professionalHourlyData: rows,
      riskFlags,
    };
    const data = {
      ...buildProfessionalHourlyDisplayDataForResult({ result: fixture.result }),
      rows,
    };
    return renderToStaticMarkup(
      <GeneralWeatherOverview
        result={result}
        query={{ ...fixture.query, target: "general" }}
        data={data}
        onHour={() => {}}
        onDate={() => {}}
      />,
    );
  }
  it("focuses on weather and links all three specialist pages with the original place and horizon", () => {
    const html = render();
    expect(html).toContain("天气风险");
    expect(html).toContain("逐日天气");
    expect(html).not.toContain("综合出片指数");
    expect(html).not.toContain("当前与近时段天气");
    expect(html).not.toContain("1 项需关注");
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(
      (match) => new URL(match[1]!.replaceAll("&amp;", "&"), "http://localhost"),
    );
    expect(links.map((link) => link.pathname)).toEqual(["/forecast", "/forecast", "/forecast"]);
    expect(links.map((link) => link.searchParams.get("target"))).toEqual([
      "cloud_sea",
      "glow",
      "astro",
    ]);
    for (const link of links) {
      expect(link.searchParams.get("horizon")).toBe(fixture.query.horizon);
      expect(link.searchParams.get("name")).toBe(fixture.query.name);
      const page = ForecastPage({ searchParams: Object.fromEntries(link.searchParams) });
      expect(page.props.query).toMatchObject({
        target: link.searchParams.get("target"),
        horizon: fixture.query.horizon,
        latitudeWgs84: fixture.query.latitudeWgs84,
        longitudeWgs84: fixture.query.longitudeWgs84,
      });
    }
  });
  it("marks a nonzero amount with zero probability for review", () => {
    const html = render([{ ...hours[0]!, precipitationAmountMm: 3 }]);
    expect(html).toContain("有降水信号");
    expect(html).toContain("概率待复核");
    expect(html).toContain("雨量与概率不一致");
  });
  it("does not synthesize a risk card for an empty risk list", () => {
    const html = render();
    expect(html).not.toContain("低风险</");
    expect(html).not.toContain("天气风险 · 1");
    const wet = render(hours, [
      {
        key: "precipitation",
        label: "降水时段",
        level: "medium",
        description: "注意防水",
        startTime: hours[1]!.time,
        endTime: hours[2]!.time,
      },
    ]);
    expect(wet).toContain("查看对应小时");
    expect(wet).toContain("注意防水");
  });
  it("keeps observations distinct from a forecast fallback", () => {
    const current = fixture.result.currentWeather!;
    const observed = renderToStaticMarkup(
      <GeneralWeatherHeader
        result={{
          ...fixture.result,
          currentWeather: {
            ...current,
            dataKind: "observation",
            observedAt: hours[0]!.time,
            temperature: 18,
            windSpeed: 4,
          },
        }}
      />,
    );
    const forecast = renderToStaticMarkup(
      <GeneralWeatherHeader
        result={{
          ...fixture.result,
          currentWeather: {
            ...current,
            dataKind: "forecast",
            observedAt: hours[0]!.time,
            temperature: 18,
            windSpeed: 4,
          },
        }}
      />,
    );
    expect(observed).toContain("实况");
    expect(forecast).toContain("当前预报参考");
    expect(observed).not.toContain("综合出片指数");
  });
});
