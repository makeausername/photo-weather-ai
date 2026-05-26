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

function withLowMoon(input: ForecastCalculationInput): ForecastCalculationInput {
  return {
    ...input,
    astroSummaries: input.astroSummaries.map((summary) => ({
      ...summary,
      moonIllumination: 0.08,
      moonAltitudeByHour: Object.fromEntries(
        Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), -12]),
      ),
      moonInfo: {
        ...summary.moonInfo,
        moonIllumination: 0.08,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), -12]),
        ),
      },
    })),
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

  it("does not choose astro as the general best subject when night weather is blocked", () => {
    const input = withLowMoon(
      withHourlyWeather(buildMockForecastInput(query, { now: fixedNow }), (hour) => {
        const hourValue = localHour(hour.time);
        if (hourValue >= 20 || hourValue <= 4) {
          return {
            ...hour,
            cloudTotal: 95,
            cloudLow: 82,
            humidity: 95,
            visibility: 4,
            precipitationProbability: 72,
            precipitation: 0.7,
            precipitationAmountMm: 0.7,
            rainAmountMm: 0.7,
            weatherTextZh: "小雨有雾",
          };
        }
        if (hourValue >= 5 && hourValue <= 8) {
          return {
            ...hour,
            humidity: 84,
            cloudTotal: 52,
            cloudLow: 38,
            visibility: 18,
            precipitationProbability: 5,
            precipitation: 0,
            precipitationAmountMm: 0,
          };
        }
        return hour;
      }),
    );

    const result = calculateForecast(input);

    expect(result.astroAnalysis.astroPracticalScore).toBeLessThan(40);
    expect(result.bestWindows[0]?.target).not.toBe("astro");
  });

  it("penalizes rain overlapping a shootable window without over-penalizing later rain", () => {
    const baseInput = withHourlyWeather(buildMockForecastInput(query, { now: fixedNow }), (hour) => {
      const hourValue = localHour(hour.time);
      if (hourValue >= 4 && hourValue <= 7) {
        return {
          ...hour,
          humidity: 84,
          cloudTotal: 54,
          cloudLow: 38,
          windSpeed: 2.2,
          visibility: 20,
          dewPointSpread: 2.8,
          precipitationProbability: 0,
          precipitation: 0,
          precipitationAmountMm: 0,
        };
      }
      return {
        ...hour,
        precipitationProbability: 0,
        precipitation: 0,
        precipitationAmountMm: 0,
      };
    });
    const rainDuringWindow = withHourlyWeather(baseInput, (hour) => {
      const hourValue = localHour(hour.time);
      if (hourValue >= 4 && hourValue <= 7) {
        return {
          ...hour,
          precipitationProbability: 52,
          precipitation: 0.8,
          precipitationAmountMm: 0.8,
          rainAmountMm: 0.8,
          weatherTextZh: "小雨",
        };
      }
      return hour;
    });
    const rainAfterWindow = withHourlyWeather(baseInput, (hour) => {
      const hourValue = localHour(hour.time);
      if (hourValue >= 13 && hourValue <= 15) {
        return {
          ...hour,
          precipitationProbability: 70,
          precipitation: 4,
          precipitationAmountMm: 4,
          rainAmountMm: 4,
          weatherTextZh: "小雨",
        };
      }
      return hour;
    });

    const clearWindow = calculateForecast(baseInput).bestWindows.find(
      (window) => window.target === "cloud_sea" && window.practicalKind === "shooting_window",
    );
    const wetWindow = calculateForecast(rainDuringWindow).bestWindows.find(
      (window) => window.target === "cloud_sea" && window.practicalKind === "shooting_window",
    );
    const laterRainWindow = calculateForecast(rainAfterWindow).bestWindows.find(
      (window) => window.target === "cloud_sea" && window.practicalKind === "shooting_window",
    );

    expect(clearWindow?.practicalScore).toBeDefined();
    expect(wetWindow?.precipitationRisk?.rainRiskLevel).toBe("medium");
    expect(wetWindow!.practicalScore ?? 0).toBeLessThan(clearWindow!.practicalScore ?? 0);
    expect(laterRainWindow?.precipitationRisk?.rainRiskLevel ?? "none").toBe("none");
    expect(laterRainWindow!.practicalScore ?? 0).toBeGreaterThanOrEqual(
      (clearWindow!.practicalScore ?? 0) - 4,
    );
  });
});
