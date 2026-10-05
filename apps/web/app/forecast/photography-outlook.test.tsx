import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import { cloudSeaRegressionFixture } from "./__tests__/fixtures/cloudSeaRegressionFixtures";
import { buildPhotographyOutlook } from "./photography-outlook";
import { PhotographyOutlook } from "./photography-outlook-view";
import { photographyScene } from "./photography-scene";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const base = cloudSeaRegressionFixture("genericHighMountainGoodCloudSeaCase").result;
function forecast(count = 2): ForecastCalculationResult {
  const dates = Array.from({ length: count }, (_, i) => `2026-05-${20 + i}`);
  return {
    ...base,
    target: "general",
    weatherDataMode: "real",
    isMock: false,
    weatherEvidenceStatus: "sufficient",
    weatherDataFreshness: "fresh",
    decisionMode: "strong_go",
    finalRecommendationLevel: "recommended",
    riskFlags: [],
    weatherAlerts: [],
    forecastStart: `${dates[0]}T00:00:00+08:00`,
    forecastEnd: `2026-05-${20 + count}T00:00:00+08:00`,
    targetDates: dates,
    astroSummaries: dates.map((date) => ({
      ...base.astroSummaries[0]!,
      date,
      sunrise: `${date}T06:15:00+08:00`,
      sunset: `${date}T18:15:00+08:00`,
    })),
    dailySummaries: dates.map((date) => ({
      ...base.dailySummaries[0]!,
      date,
      score: 78,
      practicalTripScore: 78,
      riskFlags: [],
    })),
    targetDailyBreakdown: dates.map((date) => ({
      date,
      sunriseGlow: { label: "朝霞", score: 72, detail: "" },
      sunsetGlow: { label: "晚霞", score: 40, detail: "" },
      cloudSeaFormation: { label: "云海", score: 75, detail: "" },
    })),
    professionalHourlyData: dates.flatMap((date) =>
      Array.from({ length: 24 }, (_, i) => ({
        ...base.professionalHourlyData![0]!,
        time: `${date}T${String(i).padStart(2, "0")}:00:00+08:00`,
        displayedTemperatureC: i < 8 ? 3 : 14,
        cloudTotalPercent: 30,
        cloudLowPercent: 10,
        cloudMidPercent: 20,
        cloudHighPercent: 30,
        precipitationAmountMm: 0,
        precipitationProbabilityPercent: 0,
        windSpeedMs: 2,
        windGustMs: 4,
        visibilityMeters: 20000,
        relativeHumidityPercent: 85,
      })),
    ),
  };
}
describe("photography conclusion", () => {
  it("covers the five requested sections, all days and short/long reading budgets", () => {
    for (const count of [1, 2, 3, 7]) {
      const model = buildPhotographyOutlook(forecast(count));
      expect(model.days).toHaveLength(count);
      expect(model.conclusion).toHaveLength(4);
      expect(model.days.every((day) => day.lines.length === (count <= 2 ? 6 : 5))).toBe(true);
      expect(model.shooting).toHaveLength(4);
      expect(model.clothing).toHaveLength(2);
      expect(model.risks).toHaveLength(3);
      expect(model.conclusion[0]).toContain("✅");
      expect(model.days[0]!.lines.join(" ")).toMatch(/日出.*朝霞.*日落.*晚霞.*出片指数/s);
      expect(model.clothing.join(" ")).toContain("手套");
    }
  });
  it("does not confuse sunshine with glow, or a score with probability", () => {
    const model = buildPhotographyOutlook(forecast());
    expect(model.days[0]!.sunrise).toContain("有望露面");
    expect(model.days[0]!.dusk).toBe("机会偏低");
    expect(model.days[0]!.lines.join(" ")).toContain("云海：机会较好");
    expect(model.days[0]!.lines.join(" ")).not.toContain("75%");
  });
  it("leaves uncovered sunrise and missing weather uncertain despite high scores", () => {
    const result = forecast();
    const model = buildPhotographyOutlook({
      ...result,
      professionalHourlyData: result.professionalHourlyData!.filter(
        (r) => Number(r.time.slice(11, 13)) >= 12,
      ),
    });
    expect(model.days[0]!.sunrise).toBe("不确定");
    expect(model.days[0]!.dawn).toBe("不确定");
    const empty = buildPhotographyOutlook({ ...result, professionalHourlyData: [] });
    expect(empty.conclusion[0]).toContain("⚠️");
    expect(empty.days[0]!.lines.join(" ")).toContain("出片指数 待确认");
  });
  it("does not turn missing rain or a gap into a stable window", () => {
    const result = forecast();
    for (const rows of [
      result.professionalHourlyData!.map((r) => ({ ...r, precipitationAmountMm: null })),
      result.professionalHourlyData!.filter((_, i) => i % 2 === 0),
    ]) {
      const model = buildPhotographyOutlook({ ...result, professionalHourlyData: rows });
      expect(model.days.every((d) => !d.best)).toBe(true);
      expect(model.conclusion[0]).toContain("⚠️");
    }
  });
  it("keeps stale, demo, severe wind and active alert conditions from recommending a trip", () => {
    const result = forecast();
    const stale = buildPhotographyOutlook({ ...result, weatherDataFreshness: "stale" });
    expect(stale.conclusion[0]).toContain("⚠️");
    expect(stale.conclusion[0]).not.toContain("适合就近");
    expect(stale.days.every((d) => !d.allowed)).toBe(true);
    const demo = buildPhotographyOutlook({ ...result, isMock: true });
    expect(demo.days[0]!.sunrise).toBe("不确定");
    const wind = buildPhotographyOutlook({
      ...result,
      riskFlags: [{ key: "wind", label: "山顶强风", level: "high", description: "阵风大" }],
    });
    expect(wind.conclusion[0]).toContain("❌");
    expect(wind.conclusion[3]).toContain("山顶强风");
    const alert = buildPhotographyOutlook({
      ...result,
      weatherAlerts: [
        {
          id: "1",
          title: "暴雨橙色预警",
          level: "orange",
          description: "",
          startsAt: result.forecastStart,
        },
      ],
    });
    expect(alert.conclusion[0]).toContain("❌");
    expect(alert.risks.join(" ")).toContain("暴雨橙色预警");
  });
  it("changes practical advice for rain, poor visibility and low temperatures", () => {
    const result = forecast();
    const model = buildPhotographyOutlook({
      ...result,
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        precipitationAmountMm: 2,
        windSpeedMs: 11,
        visibilityMeters: 2000,
      })),
    });
    expect(model.clothing.join(" ")).toContain("雨具");
    expect(model.clothing.join(" ")).toContain("袖口");
    expect(model.shooting[0]).toContain("雾散");
    expect(model.shooting[1]).toContain("确有雾气时");
    expect(model.conclusion[0]).not.toContain("✅");
  });
  it("groups UTC hours into the destination local date and preserves missing dates", () => {
    const result = forecast();
    const rows = result.professionalHourlyData!.map((r) => ({
      ...r,
      time: new Date(r.time).toISOString(),
    }));
    const model = buildPhotographyOutlook({
      ...result,
      professionalHourlyData: rows.filter((r) => r.time < "2026-05-20T16:00:00Z"),
    });
    expect(model.days.map((d) => d.date)).toEqual(result.targetDates);
    expect(model.days[0]!.sunrise).toContain("有望");
    expect(model.days[1]!.sunrise).toBe("不确定");
  });
  it("renders readable narrative without professional tables or tabs", () => {
    const html = renderToStaticMarkup(<PhotographyOutlook result={forecast()} />);
    for (const heading of ["先说结论", "按日期看", "怎么拍 / 怎么选", "穿衣指南", "风险提醒"])
      expect(html).toContain(heading);
    expect(html).not.toMatch(/<table|role="tab"|专业数据|总云量|露点/);
  });
  it("uses mist and local subjects for lowlands, hills, lakes and valleys", () => {
    for (const [type, elevation, relief, subject, detail] of [
      ["city", 0, 0, "晨雾 / 低云", "建筑"],
      ["lake", 15, 10, "晨雾 / 低云", "水面"],
      ["valley", 250, 500, "云雾", "谷地"],
      ["slope", 400, 200, "云雾", "坡地"],
      ["lake", 2500, 0, "晨雾 / 低云", "水面"],
      ["unknown", 0, 0, "晨雾 / 低云", "近景"],
    ] as const) {
      const result = forecast();
      const profile = {
        ...result.terrainAnalysis.terrainProfile,
        terrainType: type,
        locationElevation: elevation,
        elevationMeters: elevation,
        localReliefMeters: relief,
        elevationDiff5km: relief,
      };
      const model = buildPhotographyOutlook({
        ...result,
        terrainAnalysis: { ...result.terrainAnalysis, terrainProfile: profile },
      });
      const text = [...model.days.flatMap((d) => d.lines), ...model.shooting, ...model.risks].join(
        " ",
      );
      expect(text).toContain(subject);
      expect(text).toContain(detail);
      expect(text).not.toMatch(/云海|山体|山路/);
    }
  });
  it("does not infer a mountain scene from a high place name or missing terrain", () => {
    const result = forecast();
    const profile = {
      ...result.terrainAnalysis.terrainProfile,
      terrainType: "unknown" as const,
      elevationMeters: null,
      locationElevation: null,
      localReliefMeters: null,
      elevationDiff5km: null,
      nearbyValleyElevationMeters: null,
    };
    const unknown = {
      ...result,
      place: { ...result.place, name: "云海山顶" },
      terrainAnalysis: { ...result.terrainAnalysis, terrainProfile: profile },
    };
    expect(photographyScene(unknown).mountain).toBe(false);
    expect(buildPhotographyOutlook(unknown).days[0]!.lines[1]).toContain("待确认");
    expect(
      photographyScene({ ...result, terrainAnalysis: { ...result.terrainAnalysis, isMock: true } })
        .mountain,
    ).toBe(false);
  });
  it("derives lowland mist from actual morning conditions, not the cloud-sea score", () => {
    const result = forecast();
    const terrain = {
      ...result.terrainAnalysis,
      terrainProfile: {
        ...result.terrainAnalysis.terrainProfile,
        terrainType: "city" as const,
        elevationMeters: 5,
        locationElevation: 5,
        localReliefMeters: 0,
      },
    };
    const mist = {
      ...result,
      terrainAnalysis: terrain,
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        relativeHumidityPercent: 96,
        dewPointSpreadC: 1,
        windSpeedMs: 1,
        visibilityMeters: 3000,
      })),
    };
    expect(buildPhotographyOutlook(mist).days[0]!.lines[1]).toContain("有近地雾气形成条件");
    const dry = {
      ...mist,
      professionalHourlyData: mist.professionalHourlyData.map((r) => ({
        ...r,
        relativeHumidityPercent: 50,
        dewPointSpreadC: 8,
      })),
    };
    expect(buildPhotographyOutlook(dry).days[0]!.lines[1]).toContain("晨雾机会偏低");
    const rain = {
      ...mist,
      professionalHourlyData: mist.professionalHourlyData.map((r) => ({
        ...r,
        precipitationAmountMm: 2,
      })),
    };
    expect(buildPhotographyOutlook(rain).days[0]!.lines[1]).toContain("不能直接当作起雾信号");
  });
  it("keeps a 52-point or explicitly cautious day from receiving a green trip recommendation", () => {
    const result = forecast();
    for (const daily of [
      result.dailySummaries.map((d) => ({ ...d, practicalTripScore: 52 })),
      result.dailySummaries.map((d) => ({
        ...d,
        practicalTripScore: 90,
        dedicatedTripRecommendation: "不建议专程前往" as const,
      })),
    ]) {
      const model = buildPhotographyOutlook({ ...result, dailySummaries: daily });
      expect(model.conclusion[0]).toContain("⚠️");
      expect(model.days.every((d) => !d.allowed && !d.lines.join(" ").includes("✅"))).toBe(true);
      expect(model.days[0]!.lines.join(" ")).toContain("参考窗口");
    }
  });
  it("explains events outside the selected forecast range rather than calling them missing", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      forecastStart: "2026-05-20T09:00:00+08:00",
      forecastEnd: "2026-05-20T17:00:00+08:00",
    });
    expect(model.days[0]!.lines[2]).toContain("已过本次预报起点");
    expect(model.days[0]!.lines[3]).toContain("本次范围之外");
  });
});
