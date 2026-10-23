import { describe, expect, it } from "vitest";
import type { ForecastCalculationResult } from "@photo-weather/shared";
import {
  addRecent,
  clusterMapPlaces,
  emptyLibrary,
  formatWeatherNumber,
  glowScore,
  hoursForDate,
  localWindow,
  nightEvent,
  parseLocalLibrary,
  presetLocations,
  toggleFavorite,
} from "../components/free-weather-data";

describe("free weather data", () => {
  it("keeps every nearby map location selectable without changing its coordinates", () => {
    const first = presetLocations[0]!;
    const near = { ...first, name: "相邻机位", latitudeWgs84: first.latitudeWgs84 + 0.00001 };
    const groups = clusterMapPlaces([first, near, ...presetLocations.slice(1)]);
    expect(groups[0]?.members.map((member) => member.place.name)).toEqual([first.name, near.name]);
    expect(groups.flatMap((group) => group.members)).toHaveLength(4);
    expect(groups[0]?.members[1]?.place.latitudeWgs84).toBe(near.latitudeWgs84);
    expect(clusterMapPlaces([])).toEqual([]);
  });
  it("keeps local favorites and recent coordinates without an account", () => {
    const place = presetLocations[0]!;
    const saved = addRecent(toggleFavorite(emptyLibrary, place), place);
    expect(parseLocalLibrary(JSON.stringify(saved))).toEqual(saved);
    expect(addRecent(saved, place).recent).toHaveLength(1);
    expect(toggleFavorite(saved, place).favorites).toEqual([]);
    expect(parseLocalLibrary("broken")).toEqual(emptyLibrary);
    expect(
      parseLocalLibrary(
        JSON.stringify({ recent: [{ ...place, latitudeWgs84: 200 }], favorites: [] }),
      ),
    ).toEqual(emptyLibrary);
  });
  it("distinguishes missing values from real zero scores", () => {
    expect(formatWeatherNumber(null)).toBe("—");
    expect(formatWeatherNumber(0, "%")).toBe("0%");
    const result = {
      isMock: false,
      weatherDataMode: "real",
      weatherEvidenceStatus: "sufficient",
      glowAnalysis: {
        canonicalWindows: [
          {
            date: "2026-10-23",
            phase: "sunrise",
            unavailableReason: "missing_weather",
            practicalSuitabilityScore: 0,
          },
          { date: "2026-10-23", phase: "sunset", practicalSuitabilityScore: 0 },
        ],
      },
    } as unknown as ForecastCalculationResult;
    expect(glowScore(result, "2026-10-23", "sunrise")).toBeUndefined();
    expect(glowScore(result, "2026-10-23", "sunset")).toBe(0);
  });
  it("uses the next morning for the selected night in the result timezone", () => {
    const result = {
      calendarBasis: { timezone: "Asia/Shanghai" },
      astroSummaries: [
        { date: "2026-10-23", moonset: "2026-10-23T03:00:00+08:00" },
        { date: "2026-10-24", moonset: "2026-10-24T04:00:00+08:00" },
      ],
      professionalHourlyData: [
        { time: "2026-10-23T01:00:00+08:00" },
        { time: "2026-10-23T20:00:00+08:00" },
        { time: "2026-10-24T04:00:00+08:00" },
        { time: "2026-10-24T13:00:00+08:00" },
      ],
    } as unknown as ForecastCalculationResult;
    expect(nightEvent(result, "2026-10-23", "moonset")).toBe("2026-10-24T04:00:00+08:00");
    expect(hoursForDate(result, "2026-10-23", true)).toHaveLength(2);
    expect(
      localWindow("2026-10-23T20:00:00+08:00", "2026-10-24T04:00:00+08:00", "Asia/Shanghai"),
    ).toBe("20:00–次日 04:00");
  });
});
