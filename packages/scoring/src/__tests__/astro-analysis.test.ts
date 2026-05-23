import { describe, expect, it, vi } from "vitest";
import type { AstroSummary, ForecastCalculationInput } from "@photo-weather/shared";
import {
  buildMockForecastInput,
  calculateAstroAnalysis,
  calculateForecast,
  calculateMilkyWayScore,
  calculateStarsScore,
} from "../index.js";

const fixedNow = "2026-05-20T00:00:00+08:00";
const baseQuery = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "astro",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
} as const;

function withSingleAstro(
  input: ForecastCalculationInput,
  astro: AstroSummary,
): ForecastCalculationInput {
  return {
    ...input,
    astroSummaries: [astro],
    calendarBasis: {
      ...input.calendarBasis,
      targetDates: [astro.date],
      targetDateLabels: ["2026年5月20日 星期三"],
      calendarDays: [
        {
          date: astro.date,
          dateLabel: "2026年5月20日 星期三",
          lunarDateText: astro.lunarDateText,
        },
      ],
    },
  };
}

describe("astro analysis", () => {
  it("keeps recommended Milky Way windows inside astronomical night", () => {
    const result = calculateForecast(
      buildMockForecastInput({ ...baseQuery, horizon: "7d" }, { now: fixedNow }),
    );

    for (const window of result.astroAnalysis.recommendedMilkyWayWindows) {
      const night = result.astroAnalysis.astronomicalNightWindows.find(
        (item) => item.date === window.date,
      );

      expect(night).toBeDefined();
      expect(Date.parse(window.start)).toBeGreaterThanOrEqual(Date.parse(night!.start));
      expect(Date.parse(window.end)).toBeLessThanOrEqual(Date.parse(night!.end));
    }
  });

  it("starts moonless and recommended Milky Way windows after moonset when moon impact is high", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const brightMoonAstro: AstroSummary = {
      ...baseInput.astroSummaries[0]!,
      astronomicalNightStart: "2026-05-20T20:00:00+08:00",
      astronomicalNightEnd: "2026-05-21T04:00:00+08:00",
      moonIllumination: 0.86,
      moonPhaseNameZh: "盈凸月",
      moonrise: "2026-05-20T14:00:00+08:00",
      moonset: "2026-05-20T22:30:00+08:00",
      moonAltitudeByHour: {
        "20": 34,
        "21": 24,
        "22": 6,
        "23": -4,
        "00": -12,
        "01": -18,
        "02": -22,
        "03": -18,
      },
      moonInfo: {
        ...baseInput.astroSummaries[0]!.moonInfo,
        moonIllumination: 0.86,
        moonPhaseNameZh: "盈凸月",
        moonrise: "2026-05-20T14:00:00+08:00",
        moonset: "2026-05-20T22:30:00+08:00",
        moonAltitudeByHour: {
          "20": 34,
          "21": 24,
          "22": 6,
          "23": -4,
          "00": -12,
          "01": -18,
          "02": -22,
          "03": -18,
        },
      },
      milkyWayWindowStart: "2026-05-20T21:00:00+08:00",
      milkyWayWindowEnd: "2026-05-21T03:00:00+08:00",
      milkyWayGalacticCenterAltitude: 25,
      milkyWayDirection: "东南方",
      milkyWayCalculationPrecision: "v1_approximate",
    };
    const input = withSingleAstro(baseInput, brightMoonAstro);
    const analysis = calculateAstroAnalysis(input, {
      starsScore: calculateStarsScore(input).score,
      milkyWayScore: calculateMilkyWayScore(input).score,
      transparencyScore: 70,
    });
    const moonset = Date.parse("2026-05-20T22:30:00+08:00");

    expect(analysis.moonlessNightWindows[0]).toBeDefined();
    expect(Date.parse(analysis.moonlessNightWindows[0]!.start)).toBeGreaterThanOrEqual(moonset);
    expect(analysis.recommendedMilkyWayWindows[0]).toBeDefined();
    expect(Date.parse(analysis.recommendedMilkyWayWindows[0]!.start)).toBeGreaterThanOrEqual(
      moonset,
    );
  });

  it("reduces star and Milky Way scores with high cloud, poor visibility, and strong moon impact", () => {
    const baseInput = buildMockForecastInput(baseQuery, { now: fixedNow });
    const clearDark = {
      ...baseInput,
      hourlyWeather: baseInput.hourlyWeather.map((hour) => ({
        ...hour,
        cloudTotal: 8,
        cloudLow: 4,
        cloudMid: 6,
        cloudHigh: 8,
        humidity: 42,
        visibility: 32,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.08,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), -12]),
        ),
      })),
    };
    const cloudyMoonlit = {
      ...baseInput,
      hourlyWeather: baseInput.hourlyWeather.map((hour) => ({
        ...hour,
        cloudTotal: 88,
        cloudLow: 70,
        cloudMid: 76,
        cloudHigh: 82,
        humidity: 92,
        visibility: 5,
      })),
      astroSummaries: baseInput.astroSummaries.map((summary) => ({
        ...summary,
        moonIllumination: 0.92,
        moonAltitudeByHour: Object.fromEntries(
          Array.from({ length: 24 }, (_, hour) => [String(hour).padStart(2, "0"), 36]),
        ),
      })),
    };

    expect(calculateStarsScore(clearDark).score).toBeGreaterThan(
      calculateStarsScore(cloudyMoonlit).score,
    );
    expect(calculateMilkyWayScore(clearDark).score).toBeGreaterThan(
      calculateMilkyWayScore(cloudyMoonlit).score,
    );
  });

  it("does not call real external APIs for astro analysis", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("astro analysis should stay local");
    });
    vi.stubGlobal("fetch", fetchMock);

    calculateForecast(buildMockForecastInput(baseQuery, { now: fixedNow }));

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
