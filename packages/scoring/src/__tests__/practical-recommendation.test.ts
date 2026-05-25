import { describe, expect, it } from "vitest";
import type { ForecastCalculationInput, ForecastQueryInput, NormalizedHourlyWeather } from "@photo-weather/shared";
import { buildMockForecastInput, calculateForecast } from "../index.js";

const fixedNow = "2026-05-20T00:00:00+08:00";
const query: ForecastQueryInput = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "general",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
};

function withHourlyWeather(
  input: ForecastCalculationInput,
  mapper: (hour: NormalizedHourlyWeather) => NormalizedHourlyWeather,
): ForecastCalculationInput {
  return {
    ...input,
    hourlyWeather: input.hourlyWeather.map(mapper),
  };
}

function localHour(time: string): number {
  const date = new Date(Date.parse(time));
  const value = Number(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(date).find((part) => part.type === "hour")?.value ?? "0",
  );
  return value === 24 ? 0 : value;
}

describe("general practical trip recommendation", () => {
  it("chooses a sunrise-linked cloud sea window over a stronger deep-night formation signal", () => {
    const input = withHourlyWeather(buildMockForecastInput(query, { now: fixedNow }), (hour) => {
      const hourValue = localHour(hour.time);
      if (hourValue >= 0 && hourValue <= 3) {
        return {
          ...hour,
          humidity: 96,
          cloudTotal: 70,
          cloudLow: 56,
          windSpeed: 1.2,
          visibility: 14,
          dewPoint: hour.temperature - 0.8,
          dewPointSpread: 0.8,
          precipitationProbability: 0,
          precipitation: 0,
          precipitationAmountMm: 0,
        };
      }
      if (hourValue >= 4 && hourValue <= 7) {
        return {
          ...hour,
          humidity: 80,
          cloudTotal: 58,
          cloudLow: 42,
          windSpeed: 2.4,
          visibility: 18,
          dewPoint: hour.temperature - 3.2,
          dewPointSpread: 3.2,
          precipitationProbability: 5,
          precipitation: 0,
          precipitationAmountMm: 0,
        };
      }
      if (hourValue >= 16 && hourValue <= 20) {
        return {
          ...hour,
          humidity: 94,
          cloudTotal: 96,
          cloudLow: 88,
          cloudMid: 12,
          cloudHigh: 8,
          visibility: 8,
          precipitationProbability: 10,
          precipitation: 0,
          precipitationAmountMm: 0,
        };
      }
      return hour;
    });

    const result = calculateForecast(input);
    const bestWindow = result.bestWindows[0];
    const formationSignal = result.bestWindows.find((window) => window.label.includes("形成信号"));

    expect(bestWindow?.label).toContain("清晨云海窗口");
    expect(bestWindow?.practicalKind).toBe("shooting_window");
    expect(bestWindow?.arrivalAdvice?.setupBufferMinutes).toBe(90);
    expect(formationSignal).toBeDefined();
    expect(formationSignal?.practicalKind).toBe("formation_signal");
    expect(formationSignal?.conditionScore).toBeGreaterThan(formationSignal?.practicalScore ?? 0);
    expect(formationSignal?.practicalNoteZh).toContain("不建议为无光云海单独熬夜");
  });

  it("keeps astro night windows valid while adding a rest and lodging note", () => {
    const input = withHourlyWeather(
      buildMockForecastInput({ ...query, name: "武功山金顶" }, { now: fixedNow }),
      (hour) => {
        const hourValue = localHour(hour.time);
        if (hourValue >= 20 || hourValue <= 4) {
          return {
            ...hour,
            cloudTotal: 8,
            cloudLow: 2,
            cloudMid: 4,
            cloudHigh: 5,
            humidity: 44,
            visibility: 32,
          };
        }
        return hour;
      },
    );

    const result = calculateForecast(input);
    const astroWindow = result.bestWindows.find((window) => window.target === "astro");

    expect(astroWindow).toBeDefined();
    expect(astroWindow?.practicalKind).toBe("shooting_window");
    expect(astroWindow?.practicalScore).toBeGreaterThanOrEqual(60);
    expect(astroWindow?.arrivalAdvice?.warningZh).toContain("夜间拍摄需要提前休息");
  });

  it("adds mountain-size arrival buffers and backup subjects to the general plan", () => {
    const result = calculateForecast(buildMockForecastInput(query, { now: fixedNow }));
    const bestWindow = result.bestWindows.find(
      (window) => window.target === "cloud_sea" && window.practicalKind !== "formation_signal",
    );

    expect(bestWindow?.arrivalAdvice).toBeDefined();
    expect(bestWindow?.arrivalAdvice?.setupBufferMinutes).toBeGreaterThanOrEqual(75);
    expect(
      Date.parse(bestWindow!.startTime) - Date.parse(bestWindow!.arrivalAdvice!.recommendedArrivalTime),
    ).toBe(bestWindow!.arrivalAdvice!.setupBufferMinutes * 60 * 1000);
    expect(bestWindow?.backupSubjectLabel).toBeTruthy();
    expect(bestWindow?.subjectPriorityLabel).toContain("云海");
  });
});
