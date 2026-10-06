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
  it.each([
    "complete",
    "rolling-start",
    "missing-assessment",
    "missing-hour",
    "missing-rain",
    "heavy-rain",
    "high-wind",
    "alert",
  ])("handles an empty daily assessment after overnight rain: %s", (kind) => {
    const result = forecast(2);
    const rain = {
      key: "precipitation",
      label: "降水干扰",
      level: "high" as const,
      description: "",
      startTime: "2026-05-20T13:00:00+08:00",
      endTime: "2026-05-21T05:00:00+08:00",
    };
    const dailySummaries = result.dailySummaries.map((d, i) => ({
      ...d,
      practicalTripScore: i === 1 ? 52 : d.practicalTripScore,
      dedicatedTripRecommendation: "仅作备选",
      riskFlags: kind === "missing-assessment" ? undefined : [],
    })) as unknown as typeof result.dailySummaries;
    const model = buildPhotographyOutlook({
      ...result,
      dailySummaries,
      forecastStart: kind === "rolling-start" ? "2026-05-20T12:30:32+08:00" : result.forecastStart,
      riskFlags: [rain, ...(kind === "high-wind" ? [{ ...rain, key: "wind" }] : [])],
      weatherAlerts:
        kind === "alert"
          ? [
              {
                id: "test",
                title: "暴雨",
                description: "",
                level: "orange",
                startsAt: rain.startTime,
                endsAt: rain.endTime,
              },
            ]
          : [],
      professionalHourlyData: result
        .professionalHourlyData!.filter(
          (h) => !(kind === "missing-hour" && h.time === "2026-05-21T00:00:00+08:00"),
        )
        .map((h) => ({
          ...h,
          precipitationAmountMm:
            kind === "missing-rain"
              ? null
              : kind === "heavy-rain"
                ? 2
                : Number(h.time.slice(11, 13)) < 5
                  ? 0.1
                  : 0,
          precipitationProbabilityPercent: 80,
        })),
    });
    expect(model.days[1]!.blocked).toBe(!["complete", "rolling-start"].includes(kind));
    expect(model.days[1]!.score).toBe(kind === "missing-rain" ? undefined : 52);
    if (kind === "complete") expect(model.days[1]!.lines.join(" ")).toContain("⚠️");
  });
  it.each([2, 3, 7])(
    "uses each day's rain grade during an overnight event over %i days",
    (count) => {
      const result = forecast(count);
      const rain = {
        key: "precipitation",
        label: "降水干扰",
        level: "high" as const,
        description: "",
        startTime: "2026-05-20T15:00:00Z",
        endTime: "2026-05-20T23:00:00Z",
      };
      const model = buildPhotographyOutlook({
        ...result,
        riskFlags: [rain],
        dailySummaries: result.dailySummaries.map((d, i) => ({
          ...d,
          practicalTripScore: i === 1 ? 34 : d.practicalTripScore,
          dedicatedTripRecommendation: i === 1 ? "仅作备选" : d.dedicatedTripRecommendation,
          riskFlags:
            i > 1
              ? []
              : [
                  {
                    ...rain,
                    level: i === 0 ? "high" : "medium",
                    startTime: i === 0 ? rain.startTime : "2026-05-20T16:00:00Z",
                    endTime: i === 0 ? "2026-05-20T16:00:00Z" : rain.endTime,
                  },
                ],
        })),
      });
      expect(model.days.map((d) => d.blocked)).toEqual([true, ...Array(count - 1).fill(false)]);
      expect(model.days[1]!.lines.join(" ")).toContain("⚠️");
      expect(model.days[1]!.lines.join(" ")).not.toContain("安全近景");
      expect(model.days[1]!.score).toBe(34);
    },
  );
  it.each([
    "other-risk",
    "missing-day-risk",
    "expired-day-risk",
    "untimed",
    "invalid-time",
    "alert",
  ])("preserves independent severe evidence when daily rain is medium: %s", (kind) => {
    const result = forecast(2);
    const rain = {
      key: "precipitation",
      label: "降水干扰",
      level: "medium" as const,
      description: "",
      startTime: "2026-05-21T00:00:00+08:00",
      endTime: "2026-05-21T07:00:00+08:00",
    };
    const model = buildPhotographyOutlook({
      ...result,
      dailySummaries: result.dailySummaries.map((d) => ({
        ...d,
        riskFlags:
          kind === "missing-day-risk"
            ? []
            : [
                {
                  ...rain,
                  ...(kind === "expired-day-risk"
                    ? {
                        startTime: "2026-05-20T00:00:00+08:00",
                        endTime: "2026-05-21T00:00:00+08:00",
                      }
                    : {}),
                },
              ],
      })),
      riskFlags: [
        {
          ...rain,
          level: "high",
          key: kind === "other-risk" ? "wind" : rain.key,
          ...(kind === "untimed" ? { startTime: undefined, endTime: undefined } : {}),
          ...(kind === "invalid-time" ? { endTime: rain.startTime } : {}),
        },
      ],
      weatherAlerts:
        kind === "alert"
          ? [
              {
                id: "rain",
                title: "暴雨橙色预警",
                level: "orange",
                description: "",
                startsAt: rain.startTime,
                endsAt: rain.endTime,
              },
            ]
          : [],
    });
    expect(model.days[1]!.blocked).toBe(true);
  });
  it.each([1, 2, 3, 7])("scopes timed rain to its date across %i forecast days", (count) => {
    const result = forecast(count);
    const model = buildPhotographyOutlook({
      ...result,
      decisionMode: "not_recommended",
      finalRecommendationLevel: "not_recommended",
      riskFlags: [
        {
          key: "precipitation",
          label: "强降水",
          level: "high",
          description: "",
          startTime: "2026-05-20T03:00:00Z",
          endTime: "2026-05-20T16:00:00Z",
        },
      ],
    });
    expect(model.days[0]!.blocked).toBe(true);
    expect(model.days.slice(1).every((d) => !d.blocked)).toBe(true);
    expect(model.days.every((d) => !d.allowed)).toBe(true);
    expect(model.conclusion[0]).toContain(count === 1 ? "❌" : "⚠️");
    if (count > 1) expect(model.conclusion[1]).not.toContain("5月20日");
  });
  it("keeps overnight alerts on both affected dates but lets an expired alert end", () => {
    const result = forecast(3);
    const model = buildPhotographyOutlook({
      ...result,
      weatherAlerts: [
        {
          id: "rain",
          title: "暴雨橙色预警",
          description: "",
          level: "orange",
          startsAt: "2026-05-20T23:00:00+08:00",
          endsAt: "2026-05-21T01:00:00+08:00",
        },
      ],
    });
    expect(model.days.map((d) => d.blocked)).toEqual([true, true, false]);
    expect(model.conclusion[1]).toContain("5月22日");
  });
  it("does not call a daily trip rejection a physical safety emergency", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      dailySummaries: result.dailySummaries.map((d) => ({
        ...d,
        dedicatedTripRecommendation: "不建议专程前往",
      })),
    });
    expect(model.days[0]!.lines.join(" ")).toContain("当天条件不适合");
    expect(model.days[0]!.lines.join(" ")).not.toContain("安全近景");
  });
  it.each([1, 2, 3, 7])(
    "preserves valid daily scores during trip uncertainty over %i days",
    (count) => {
      const result = forecast(count);
      const model = buildPhotographyOutlook({
        ...result,
        decisionMode: "wait_for_update",
        professionalHourlyData: result.professionalHourlyData!.map((r) => ({
          ...r,
          visibilityMeters: r.time.includes("2026-05-20") ? null : r.visibilityMeters,
        })),
      });
      expect(model.days[0]!.score).toBeUndefined();
      expect(model.days.slice(1).every((d) => d.score === 78)).toBe(true);
      expect(model.days.every((d) => !d.allowed)).toBe(true);
    },
  );
  it("keeps usable weather conclusions when only the trip decision needs an update", () => {
    const result = forecast(3);
    const model = buildPhotographyOutlook({ ...result, decisionMode: "wait_for_update" });
    expect(model.days[0]!.sunrise).toContain("有望露面");
    expect(model.days[0]!.lines.join(" ")).not.toContain("天气资料不足");
    expect(model.days.every((d) => !d.allowed)).toBe(true);
    expect(model.conclusion[0]).toContain("⚠️");
    expect(model.days.every((d) => d.score === 78)).toBe(true);
    expect(model.days.every((d) => d.lines.length <= 6)).toBe(true);
  });
  it("keeps every selected window inside an exact non-hour forecast boundary", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      forecastEnd: "2026-05-20T09:04:19+08:00",
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        cloudTotalPercent: r.time.includes("T09:") ? 0 : 30,
      })),
    });
    expect(model.days[0]!.best).toBeDefined();
    expect(Date.parse(model.days[0]!.best!.end)).toBeLessThanOrEqual(
      Date.parse("2026-05-20T09:04:19+08:00"),
    );
  });
  it("does not present a poor-weather day as a usable fallback window", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        cloudTotalPercent: 100,
        cloudLowPercent: 95,
        precipitationAmountMm: 2,
        precipitationProbabilityPercent: 100,
        visibilityMeters: 2000,
      })),
    });
    expect(model.days[0]!.best).toBeUndefined();
    expect(model.days[0]!.lines.join(" ")).toContain("暂无值得守候");
    expect(model.conclusion[1]).not.toMatch(/\d\d:\d\d/);
  });
  it("excludes out-of-range events from the overall assessment", () => {
    const result = forecast(2);
    const model = buildPhotographyOutlook({
      ...result,
      forecastStart: "2026-05-20T09:00:00+08:00",
      forecastEnd: "2026-05-21T09:00:00+08:00",
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        cloudLowPercent: 100,
        cloudTotalPercent: 100,
      })),
    });
    expect(model.conclusion[2]).toBe(
      "日出整体机会偏低，朝霞整体机会偏低；日落整体机会偏低，晚霞整体机会偏低。",
    );
  });
  it("checks pre-dawn mist separately from daytime low cloud, without claiming confirmed fog", () => {
    const result = forecast(1);
    const terrainAnalysis = {
      ...result.terrainAnalysis,
      terrainProfile: {
        ...result.terrainAnalysis.terrainProfile,
        terrainType: "city" as const,
        elevationMeters: 5,
        locationElevation: 5,
        localReliefMeters: 0,
      },
    };
    const model = buildPhotographyOutlook({
      ...result,
      terrainAnalysis,
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        relativeHumidityPercent: r.time.includes("T04:") ? 96 : 50,
        dewPointSpreadC: r.time.includes("T04:") ? 0.6 : 8,
        windSpeedMs: 1.5,
        visibilityMeters: r.time.includes("T04:") ? 10000 : 20000,
        cloudLowPercent: r.time.includes("T14:") ? 95 : 0,
        cloudTotalPercent: r.time.includes("T14:") ? 95 : 30,
      })),
    });
    expect(model.days[0]!.lines[1]).toContain("有近地雾气形成条件");
    expect(model.days[0]!.lines[1]).toContain("临近日出信号减弱");
    expect(model.days[0]!.lines[1]).toContain("部分时段低云较多");
    expect(model.days[0]!.lines[1]).not.toMatch(/确认有雾|云海/);
  });
  it("keeps a high-altitude viewpoint with missing relief in an uncertain cloud-mist context", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      terrainAnalysis: {
        ...result.terrainAnalysis,
        terrainProfile: {
          ...result.terrainAnalysis.terrainProfile,
          terrainType: "unknown",
          elevationMeters: 3605,
          locationElevation: 3605,
          localReliefMeters: null,
          elevationDiff5km: null,
          nearbyValleyElevationMeters: null,
        },
      },
    });
    expect(model.days[0]!.lines[1]).toContain("云雾：");
    expect(model.days[0]!.lines[1]).toContain("地形高差与云层高度待确认");
    expect(model.days[0]!.lines[1]).not.toContain("云海：");
  });
  it("carries temperature, cloud and visibility disagreement through the decision and clothing", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      weatherFusionSummary: {
        primarySource: "test",
        auxiliarySources: [],
        professionalSourceStatus: "available",
        confidenceLevel: "low",
        conflictStatusZh: "存在分歧",
        conflictFlagsCount: 3,
        aerosolConflictFlagsCount: 0,
        dataStatusZh: "real",
        sourceSummaries: [],
        missingDataNotes: [],
        multiSourceAgreementContext: {
          agreementLevel: "low",
          disagreementLevel: "high",
          shouldLowerConfidence: true,
          shouldShowReviewWarning: true,
          keyWarningsZh: [],
          userSummaryZh: "存在分歧",
          professionalSummaryZh: "存在分歧",
          fieldDisagreements: ["temperature", "cloudLow", "visibility"].map((field) => ({
            field,
            level: "high",
            range: field === "temperature" ? 18.1 : 50,
            sourcesAvailable: 3,
            messageZh: "分歧",
          })),
        },
      },
    });
    expect(model.days[0]!.allowed).toBe(false);
    expect(model.conclusion.join(" ")).toContain("分歧");
    expect(model.days[0]!.lines[0]).toContain("温度");
    expect(model.days[0]!.lines[0]).toContain("需复核");
    expect(model.days[0]!.lines[2]).toContain("通透待确认");
    expect(model.days[0]!.dawn).toContain("需复核");
    expect(model.clothing.join(" ")).toContain("18.1°C");
    expect(model.clothing.join(" ")).toContain("手套");
  });
  it("identifies the actual limitation of a dry clear-sky forecast", () => {
    const result = forecast(1);
    const model = buildPhotographyOutlook({
      ...result,
      professionalHourlyData: result.professionalHourlyData!.map((r) => ({
        ...r,
        displayedTemperatureC: 20,
        cloudTotalPercent: 0,
        cloudLowPercent: 0,
        cloudMidPercent: 0,
        cloudHighPercent: 0,
      })),
    });
    expect(model.conclusion[3]).toContain("天空少云");
    expect(model.conclusion[3]).not.toContain("云层开合");
    expect(model.risks[1]).not.toContain("云缝一直不开");
  });
  it("covers the five requested sections, all days and short/long reading budgets", () => {
    for (const count of [1, 2, 3, 7]) {
      const model = buildPhotographyOutlook(forecast(count));
      expect(model.days).toHaveLength(count);
      expect(model.conclusion).toHaveLength(4);
      expect(model.days.every((day) => day.lines.length === (count <= 2 ? 7 : 6))).toBe(true);
      expect(model.shooting).toHaveLength(4);
      expect(model.clothing).toHaveLength(2);
      expect(model.risks).toHaveLength(3);
      expect(model.conclusion[0]).toContain("✅");
      expect(model.days[0]!.lines.join(" ")).toMatch(/日出.*朝霞.*日落.*晚霞/s);
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
    expect(empty.days[0]!.lines.join(" ")).not.toContain("出片指数");
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
    for (const heading of ["出行结论", "拍摄时段", "拍摄建议", "穿衣与装备", "主要风险"])
      expect(html).toContain(heading);
    expect(html).not.toMatch(/<table|role="tab"|专业数据|总云量|露点/);
  });
  it("uses mist and local subjects for lowlands, hills, lakes and valleys", () => {
    for (const [type, elevation, relief, subject, detail] of [
      ["city", 0, 0, "晨雾", "建筑"],
      ["lake", 15, 10, "晨雾", "水面"],
      ["valley", 250, 500, "云雾", "谷地"],
      ["slope", 400, 200, "云雾", "坡地"],
      ["lake", 2500, 0, "晨雾", "水面"],
      ["unknown", 0, 0, "晨雾", "近景"],
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
    expect(buildPhotographyOutlook(dry).days[0]!.lines[1]).toContain("晨雾：机会偏低");
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
      expect(model.conclusion[0]).toContain(
        daily.every((d) => d.dedicatedTripRecommendation === "不建议专程前往") ? "❌" : "⚠️",
      );
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
    expect(model.days[0]!.lines[3]).toContain("已过本次预报起点");
    expect(model.days[0]!.lines[4]).toContain("本次范围之外");
  });
});
