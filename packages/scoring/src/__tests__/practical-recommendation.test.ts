import { describe, expect, it } from "vitest";
import type { ForecastCalculationInput, ForecastQueryInput, NormalizedHourlyWeather } from "@photo-weather/shared";
import {
  buildMockForecastInput,
  calculateForecast,
  classifyPhotographyWindow,
  derivePrecipitationPeriods,
} from "../index.js";

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
  it("classifies evening glow windows as sunset subjects instead of sunrise glow", () => {
    const classification = classifyPhotographyWindow(
      {
        label: "朝霞峰值窗口 19:01-19:28",
        date: "2026-05-20",
        startTime: "2026-05-20T19:01:00+08:00",
        endTime: "2026-05-20T19:28:00+08:00",
        score: 78,
        target: "glow",
        recommendationLevel: "recommended",
        practicalKind: "shooting_window",
        practicalScore: 78,
      },
      {
        date: "2026-05-20",
        timezone: "Asia/Shanghai",
        sunset: "2026-05-20T19:05:00+08:00",
        civilDusk: "2026-05-20T19:36:00+08:00",
      },
      undefined,
      "Asia/Shanghai",
    );

    expect(classification.subjectPriorityLabel).not.toContain("朝霞");
    expect(["晚霞", "日落暖光", "日落后余晖", "蓝调转场"]).toContain(
      classification.subjectPriorityLabel,
    );
    expect(classification.lightPhase).toBe("sunset");
    expect(classification.executableForDedicatedTrip).toBe(true);
  });

  it("classifies morning cloud sea as shootable and deep-night cloud sea as formation only", () => {
    const morning = classifyPhotographyWindow(
      {
        label: "清晨云海窗口 05:00-06:20",
        date: "2026-05-20",
        startTime: "2026-05-20T05:00:00+08:00",
        endTime: "2026-05-20T06:20:00+08:00",
        score: 72,
        target: "cloud_sea",
        recommendationLevel: "cautious",
        practicalKind: "shooting_window",
        practicalScore: 68,
      },
      {
        date: "2026-05-20",
        timezone: "Asia/Shanghai",
        sunrise: "2026-05-20T05:12:00+08:00",
        civilDawn: "2026-05-20T04:45:00+08:00",
      },
      undefined,
      "Asia/Shanghai",
    );
    const deepNight = classifyPhotographyWindow(
      {
        label: "云海形成信号 01:00-03:00",
        date: "2026-05-20",
        startTime: "2026-05-20T01:00:00+08:00",
        endTime: "2026-05-20T03:00:00+08:00",
        score: 76,
        target: "cloud_sea",
        recommendationLevel: "backup",
        practicalKind: "formation_signal",
        practicalScore: 34,
      },
      undefined,
      undefined,
      "Asia/Shanghai",
    );

    expect(morning.subjectPriorityLabel).toBe("清晨云海");
    expect(morning.windowLevel).toBe("shootable");
    expect(deepNight.subjectPriorityLabel).toBe("云海形成信号");
    expect(deepNight.windowLevel).toBe("watchable");
    expect(deepNight.executableForDedicatedTrip).toBe(false);
  });

  it("keeps cross-midnight Milky Way windows in the night hierarchy", () => {
    const classification = classifyPhotographyWindow(
      {
        label: "推荐银河窗口 22:45-03:45",
        date: "2026-05-20",
        startTime: "2026-05-20T22:45:00+08:00",
        endTime: "2026-05-21T03:45:00+08:00",
        score: 82,
        target: "astro",
        recommendationLevel: "recommended",
        practicalKind: "shooting_window",
        practicalScore: 74,
      },
      undefined,
      {
        date: "2026-05-20",
        timezone: "Asia/Shanghai",
        astronomicalNightStart: "2026-05-20T20:50:00+08:00",
        astronomicalNightEnd: "2026-05-21T04:10:00+08:00",
      },
      "Asia/Shanghai",
    );

    expect(classification.subjectPriorityLabel).toBe("银河");
    expect(classification.lightPhase).toBe("astronomical_night");
    expect(classification.windowLevel).toBe("shootable");
  });

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

  it("separates dedicated trip and nearby observation under rain with cloud sea signal", () => {
    const input = withHourlyWeather(buildMockForecastInput(query, { now: fixedNow }), (hour) => {
      const hourValue = localHour(hour.time);
      if (hourValue >= 4 && hourValue <= 8) {
        return {
          ...hour,
          humidity: 94,
          cloudTotal: 76,
          cloudLow: 58,
          visibility: 12,
          windSpeed: 2,
          dewPoint: hour.temperature - 1.1,
          dewPointSpread: 1.1,
          precipitationProbability: 78,
          precipitation: 1.2,
          precipitationAmountMm: 1.2,
          rainAmountMm: 1.2,
          weatherTextZh: "小雨有雾",
        };
      }
      return {
        ...hour,
        precipitationProbability: 65,
        precipitation: 0.5,
        precipitationAmountMm: 0.5,
        rainAmountMm: 0.5,
        weatherTextZh: "小雨",
      };
    });

    const result = calculateForecast({
      ...input,
      dailyWeather: input.dailyWeather.map((day) => ({
        ...day,
        precipitationProbability: 78,
        precipitation: 16,
        precipitationAmountMm: 16,
        rainAmountMm: 16,
        weatherSummary: "小雨有雾",
        precipitationRisk: undefined,
      })),
    });
    const firstDaily = result.dailySummaries[0]!;

    expect(firstDaily.dedicatedTripRecommendation).toBe("不建议专程前往");
    expect(firstDaily.nearbyObservationRecommendation).toBe("已在附近可观察");
    expect(firstDaily.nearbyObservationScore ?? 0).toBeGreaterThan(
      firstDaily.practicalTripScore ?? 0,
    );
    expect(firstDaily.shortAdvice).toContain("观察");
    expect(firstDaily.bestShootableWindow).toBeUndefined();
    expect(firstDaily.watchableWindows?.[0]?.suitableForDedicatedTrip).toBe(false);
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

  it("formats grouped precipitation timing as natural shooting advice", () => {
    const input = buildMockForecastInput(query, { now: fixedNow });
    const rainyHours = input.hourlyWeather
      .filter((hour) => localDateForTimeForTest(hour.time) === "2026-05-20")
      .map((hour) => {
        const hourValue = localHour(hour.time);
        if (hourValue >= 1 && hourValue <= 8) {
          return {
            ...hour,
            precipitationProbability: 62,
            precipitation: 0.7,
            precipitationAmountMm: 0.7,
            rainAmountMm: 0.7,
            weatherTextZh: "小雨",
          };
        }
        return {
          ...hour,
          precipitationProbability: 0,
          precipitation: 0,
          precipitationAmountMm: 0,
          rainAmountMm: 0,
        };
      });

    const summary = derivePrecipitationPeriods(rainyHours, "Asia/Shanghai");

    expect(summary.mainPrecipitationPeriodLabelZh).toContain("清晨窗口");
    expect(summary.mainPrecipitationPeriodLabelZh).not.toContain("主要降水：");
    expect(summary.mainPrecipitationPeriodLabelZh).not.toContain("、");
  });
});

function localDateForTimeForTest(time: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.parse(time)));
}
