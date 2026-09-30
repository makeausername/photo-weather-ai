import { describe, expect, it } from "vitest";
import { calculateForecast } from "../engine.js";
import { buildForecastInputFromWeatherBundle, buildMockForecastInput } from "../mock-forecast.js";
import type { ForecastTarget, ForecastWeatherAlert } from "@photo-weather/shared";

const query = {
  name: "测试平原",
  source: "manual" as const,
  latitudeWgs84: 30,
  longitudeWgs84: 118,
  latitudeGcj02: 30,
  longitudeGcj02: 118,
  horizon: "24h" as const,
  elevationMeters: 100,
};
const now = "2026-09-30T18:00:00+08:00";

describe("forecast data range and official warnings", () => {
  it("clips both report and daily risks to a partial final forecast hour", () => {
    const input = buildMockForecastInput({ ...query, target: "general" }, { now });
    const end = "2026-10-01T18:10:00+08:00";
    const result = calculateForecast({
      ...input,
      calendarBasis: { ...input.calendarBasis, forecastEnd: end },
      hourlyWeather: input.hourlyWeather.map((hour) => ({
        ...hour,
        precipitation: 10,
        precipitationAmountMm: 10,
        precipitationProbability: 100,
        cloudLow: 100,
        visibility: 0.1,
        windGust: 20,
      })),
    });
    for (const risk of [
      ...result.riskFlags,
      ...result.dailySummaries.flatMap((day) => day.riskFlags),
    ]) {
      if (risk.startTime && risk.endTime) {
        expect(Date.parse(risk.startTime)).toBeGreaterThanOrEqual(Date.parse(result.forecastStart));
        expect(Date.parse(risk.endTime)).toBeLessThanOrEqual(Date.parse(end));
      }
    }
    expect(result.riskFlags.some((risk) => risk.key === "precipitation")).toBe(true);
  });
  it("carries alerts and supplemental missing fields from the weather bundle to the result", () => {
    const selectedQuery = { ...query, target: "general" as const };
    const mock = buildMockForecastInput(selectedQuery, { now });
    const warning: ForecastWeatherAlert = {
      id: "orange",
      title: "大风橙色预警",
      level: "orange",
      description: "停止登山。",
      startsAt: now,
      endsAt: "2026-10-01T00:00:00+08:00",
    };
    const input = buildForecastInputFromWeatherBundle(
      selectedQuery,
      {
        hourly: mock.hourlyWeather,
        daily: mock.dailyWeather,
        alerts: [warning],
        alertsStatus: "available",
        providerCode: "qweather",
        providerLabelZh: "和风天气",
        dataMode: "real",
        generatedAt: now,
        missingFields: ["currentObservation", "dailyForecast"],
        noticeZh: "测试真实天气链路",
      },
      { now },
    );
    expect(input.weatherMissingFields).toEqual(
      expect.arrayContaining(["currentObservation", "dailyForecast"]),
    );
    const result = calculateForecast(input);
    expect(result.weatherAlertsStatus).toBe("available");
    expect(result.weatherAlerts).toEqual([warning]);
    expect(result.appliedCaps).toContain("weather_alert");
  });
  it.each(["general", "glow", "astro", "cloud_sea"] as ForecastTarget[])(
    "excludes provider buffer and past rows from %s results and scores",
    (target) => {
      const input = buildMockForecastInput({ ...query, target }, { now });
      const baseline = calculateForecast(input);
      const outsideTimes = [
        Date.parse(input.calendarBasis.forecastStart) - 3_600_000,
        ...Array.from(
          { length: 6 },
          (_, i) => Date.parse(input.calendarBasis.forecastEnd) + i * 3_600_000,
        ),
      ];
      const extra = outsideTimes.map((time) => ({
        ...input.hourlyWeather[0]!,
        time: new Date(time).toISOString(),
        cloudTotal: 100,
        cloudLow: 100,
        cloudMid: 100,
        cloudHigh: 100,
        visibility: 0.1,
        humidity: 100,
        precipitation: 30,
        precipitationAmountMm: 30,
        precipitationProbability: 100,
        windSpeed: 30,
        windGust: 40,
      }));
      const result = calculateForecast({
        ...input,
        hourlyWeather: [...input.hourlyWeather, ...extra],
      });
      expect(result.professionalHourlyData).toEqual(baseline.professionalHourlyData);
      expect(result.scores).toEqual(baseline.scores);
      expect(result.finalScore).toBe(baseline.finalScore);
      expect(result.riskFlags).toEqual(baseline.riskFlags);
    },
  );

  it.each(["general", "glow", "astro", "cloud_sea"] as ForecastTarget[])(
    "preserves warnings and caps %s decisions on an active red alert",
    (target) => {
      const input = buildMockForecastInput({ ...query, target }, { now });
      const warning: ForecastWeatherAlert = {
        id: "red-alert",
        level: "red",
        title: "暴雨红色预警",
        description: "请停止户外活动。",
        startsAt: now,
        endsAt: "2026-10-01T01:00:00+08:00",
      };
      const result = calculateForecast({
        ...input,
        weatherAlerts: [warning],
        weatherAlertsStatus: "available",
      });
      expect(result.weatherAlerts).toEqual([warning]);
      expect(result.riskFlags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "weather_alert:red-alert", level: "high" }),
        ]),
      );
      expect(result.finalScore).toBeLessThanOrEqual(35);
      expect(["not_recommended", "data_insufficient"]).toContain(result.decisionMode);
      expect(result.appliedCaps).toContain("weather_alert");
      expect(result.riskReasonsZh).toContain(
        "预报范围内存在橙色或红色天气预警，请优先遵循发布部门的防御指引，暂不安排专程拍摄。",
      );
    },
  );

  it("ignores expired and out-of-range alerts", () => {
    const input = buildMockForecastInput({ ...query, target: "general" }, { now });
    const alerts: ForecastWeatherAlert[] = [
      {
        id: "expired",
        level: "red",
        title: "已过期",
        description: "已结束",
        startsAt: "2026-09-29T00:00:00+08:00",
        endsAt: now,
      },
      {
        id: "future",
        level: "red",
        title: "范围外",
        description: "范围外",
        startsAt: input.calendarBasis.forecastEnd,
      },
    ];
    const baseline = calculateForecast(input);
    const result = calculateForecast({ ...input, weatherAlerts: alerts });
    expect(result.weatherAlerts).toEqual([]);
    expect(result.finalScore).toBe(baseline.finalScore);
    expect(result.appliedCaps).not.toContain("weather_alert");
  });
});
