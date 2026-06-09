import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalAstroProvider,
  getMilkyWayWindow,
  getMoonAltitudeByHour,
  getMoonIllumination,
  getMoonPhase,
  getMoonPhaseNameZh,
  getMoonWaxingOrWaning,
  getMoonTimes,
  getSolarAltitudeCrossing,
  getSolarGlowGeometry,
  getSolarPosition,
  getSunTimes,
  getTwilightTimes,
} from "../index.js";
import type { AstroInput } from "../index.js";

const huangshanInput: AstroInput = {
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  date: "2026-05-20",
  timezone: "Asia/Shanghai",
};

const isoWithShanghaiOffset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;

function requiredTimestamp(value: string | undefined): number {
  expect(value).toMatch(isoWithShanghaiOffset);
  const timestamp = Date.parse(value ?? "");
  expect(timestamp).toEqual(expect.any(Number));
  expect(Number.isFinite(timestamp)).toBe(true);

  return timestamp;
}

describe("local astronomy calculations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calculates plausible sunrise, solar noon, and sunset for Huangshan-like coordinates", () => {
    const sunTimes = getSunTimes(huangshanInput);
    const sunrise = requiredTimestamp(sunTimes.sunrise);
    const solarNoon = requiredTimestamp(sunTimes.solarNoon);
    const sunset = requiredTimestamp(sunTimes.sunset);

    expect(sunTimes).toMatchObject({
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
    });
    expect(sunrise).toBeLessThan(solarNoon);
    expect(solarNoon).toBeLessThan(sunset);
    expect(new Date(sunrise).getUTCHours()).toBe(21);
    expect(new Date(sunset).getUTCHours()).toBe(10);
    expect(sunTimes.sunriseAzimuth).toEqual(expect.any(Number));
    expect(sunTimes.sunsetAzimuth).toEqual(expect.any(Number));
  });

  it("calculates ordered civil, nautical, and astronomical twilight times", () => {
    const sunTimes = getSunTimes(huangshanInput);
    const twilight = getTwilightTimes(huangshanInput);
    const astronomicalDawn = requiredTimestamp(twilight.astronomicalDawn);
    const nauticalDawn = requiredTimestamp(twilight.nauticalDawn);
    const civilDawn = requiredTimestamp(twilight.civilDawn);
    const sunrise = requiredTimestamp(sunTimes.sunrise);
    const sunset = requiredTimestamp(sunTimes.sunset);
    const civilDusk = requiredTimestamp(twilight.civilDusk);
    const nauticalDusk = requiredTimestamp(twilight.nauticalDusk);
    const astronomicalDusk = requiredTimestamp(twilight.astronomicalDusk);

    expect(astronomicalDawn).toBeLessThan(nauticalDawn);
    expect(nauticalDawn).toBeLessThan(civilDawn);
    expect(civilDawn).toBeLessThan(sunrise);
    expect(sunset).toBeLessThan(civilDusk);
    expect(civilDusk).toBeLessThan(nauticalDusk);
    expect(nauticalDusk).toBeLessThan(astronomicalDusk);
  });

  it("builds ordered solar-altitude glow geometry around exact sun events", () => {
    const sunTimes = getSunTimes({ ...huangshanInput, elevationMeters: 1860 });
    const geometry = getSolarGlowGeometry({ ...huangshanInput, elevationMeters: 1860 });

    const sunriseCandidateStart = requiredTimestamp(geometry.sunriseGlowCandidateWindow?.start);
    const sunriseBestStart = requiredTimestamp(geometry.sunriseGlowBestWindow?.start);
    const sunrise = requiredTimestamp(sunTimes.sunrise);
    const sunriseBestEnd = requiredTimestamp(geometry.sunriseGlowBestWindow?.end);
    const sunriseCandidateEnd = requiredTimestamp(geometry.sunriseGlowCandidateWindow?.end);
    const sunsetCandidateStart = requiredTimestamp(geometry.sunsetGlowCandidateWindow?.start);
    const sunsetBestStart = requiredTimestamp(geometry.sunsetGlowBestWindow?.start);
    const sunset = requiredTimestamp(sunTimes.sunset);
    const sunsetBestEnd = requiredTimestamp(geometry.sunsetGlowBestWindow?.end);
    const sunsetCandidateEnd = requiredTimestamp(geometry.sunsetGlowCandidateWindow?.end);

    expect(geometry).toMatchObject({
      elevationMeters: 1860,
      elevationAvailable: true,
      windowDerivationMethod: "solar_altitude_weather_v1",
      solarCalculationResolutionMinutes: 1,
    });
    expect(sunriseCandidateStart).toBeLessThan(sunriseBestStart);
    expect(sunriseBestStart).toBeLessThan(sunrise);
    expect(sunrise).toBeLessThan(sunriseBestEnd);
    expect(sunriseBestEnd).toBeLessThan(sunriseCandidateEnd);
    expect(sunsetCandidateStart).toBeLessThan(sunsetBestStart);
    expect(sunsetBestStart).toBeLessThan(sunset);
    expect(sunset).toBeLessThan(sunsetBestEnd);
    expect(sunsetBestEnd).toBeLessThan(sunsetCandidateEnd);
  });

  it("exposes direct solar altitude crossings and positions without fixed time offsets", () => {
    const input = { ...huangshanInput, elevationMeters: 1860 };
    const minusSix = getSolarAltitudeCrossing({
      ...input,
      altitudeDegrees: -6,
      direction: "rising",
    });
    const plusTwo = getSolarAltitudeCrossing({
      ...input,
      altitudeDegrees: 2,
      direction: "rising",
    });
    const solarPosition = getSolarPosition({
      ...input,
      timestamp: getSunTimes(input).sunrise ?? "",
    });

    expect(requiredTimestamp(minusSix.at)).toBeLessThan(requiredTimestamp(plusTwo.at));
    expect(Math.abs(solarPosition.altitudeDegrees)).toBeLessThan(1);
    expect(solarPosition.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(solarPosition.azimuthDegrees).toBeLessThanOrEqual(360);
  });

  it("uses observer elevation in sun and glow geometry calculations", () => {
    const seaLevel = getSunTimes({ ...huangshanInput, elevationMeters: 0 });
    const summit = getSunTimes({ ...huangshanInput, elevationMeters: 1860 });
    const summitGeometry = getSolarGlowGeometry({ ...huangshanInput, elevationMeters: 1860 });

    expect(requiredTimestamp(seaLevel.sunrise)).not.toBe(requiredTimestamp(summit.sunrise));
    expect(summitGeometry.elevationMeters).toBe(1860);
    expect(summitGeometry.elevationAvailable).toBe(true);
  });

  it("marks polar solar-altitude glow windows unavailable when crossings do not occur", () => {
    const geometry = getSolarGlowGeometry({
      latitudeWgs84: 78.2232,
      longitudeWgs84: 15.6469,
      date: "2026-12-21",
      timezone: "Arctic/Longyearbyen",
      elevationMeters: 0,
    });

    expect(geometry.sunriseGlowCandidateWindow).toBeUndefined();
    expect(geometry.sunriseGlowBestWindow).toBeUndefined();
    expect(geometry.sunsetGlowCandidateWindow).toBeUndefined();
    expect(geometry.sunsetGlowBestWindow).toBeUndefined();
    expect(geometry.sunriseAltitudeCrossings.every((crossing) => crossing.at === undefined)).toBe(
      true,
    );
    expect(geometry.sunsetAltitudeCrossings.every((crossing) => crossing.at === undefined)).toBe(
      true,
    );
  });

  it("maps moon phase fractions to Simplified Chinese labels", () => {
    expect(getMoonPhaseNameZh(0)).toBe("新月");
    expect(getMoonPhaseNameZh(0.12)).toBe("娥眉月");
    expect(getMoonPhaseNameZh(0.25)).toBe("上弦月");
    expect(getMoonPhaseNameZh(0.38)).toBe("盈凸月");
    expect(getMoonPhaseNameZh(0.5)).toBe("满月");
    expect(getMoonPhaseNameZh(0.62)).toBe("亏凸月");
    expect(getMoonPhaseNameZh(0.75)).toBe("下弦月");
    expect(getMoonPhaseNameZh(0.88)).toBe("残月");

    expect(getMoonPhase(huangshanInput).moonPhaseNameZh).toEqual(expect.any(String));
  });

  it("does not label a 36% illuminated waxing crescent as first quarter", () => {
    expect(getMoonPhaseNameZh(0.205, 0.36, "waxing")).toBe("娥眉月");
    expect(getMoonPhaseNameZh(0.2, 36, "waxing")).toBe("娥眉月");
  });

  it("uses narrow thresholds for first quarter and full moon labels", () => {
    expect(getMoonPhaseNameZh(0.25, 0.5, "waxing")).toBe("上弦月");
    expect(getMoonPhaseNameZh(0.5, 0.99, "unknown")).toBe("满月");
    expect(getMoonPhaseNameZh(0.54, 0.96, "waning")).toBe("亏凸月");
  });

  it("maps waning phases to waning gibbous, last quarter, and crescent labels", () => {
    expect(getMoonWaxingOrWaning(0.62)).toBe("waning");
    expect(getMoonPhaseNameZh(0.62, 0.86, "waning")).toBe("亏凸月");
    expect(getMoonPhaseNameZh(0.75, 0.5, "waning")).toBe("下弦月");
    expect(getMoonPhaseNameZh(0.88, 0.25, "waning")).toBe("残月");
  });

  it("keeps moon illumination in the 0-1 range", () => {
    const illumination = getMoonIllumination(huangshanInput).moonIllumination;
    const phase = getMoonPhase(huangshanInput);

    expect(illumination).toBeGreaterThanOrEqual(0);
    expect(illumination).toBeLessThanOrEqual(1);
    expect(phase.moonIllumination).toBeGreaterThanOrEqual(0);
    expect(phase.moonIllumination).toBeLessThanOrEqual(1);
    expect(["waxing", "waning", "unknown"]).toContain(phase.waxingOrWaning);
  });

  it("calculates moonrise, moonset, and hourly moon altitude locally", () => {
    const moonTimes = getMoonTimes(huangshanInput);
    const altitude = getMoonAltitudeByHour(huangshanInput).moonAltitudeByHour;

    expect(moonTimes).toMatchObject({
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
    });
    requiredTimestamp(moonTimes.moonrise);
    requiredTimestamp(moonTimes.moonset);
    expect(Object.keys(altitude)).toHaveLength(24);
    expect(altitude["00"]).toEqual(expect.any(Number));
    expect(altitude["23"]).toEqual(expect.any(Number));
    for (const value of Object.values(altitude)) {
      expect(value).toBeGreaterThanOrEqual(-90);
      expect(value).toBeLessThanOrEqual(90);
    }
  });

  it("calculates a local V1 Milky Way window shape without fixed mock values", () => {
    const window = getMilkyWayWindow(huangshanInput);

    expect(window).toMatchObject({
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
      noteZh: "银河窗口为简化本地估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。",
    });
    expect(["unavailable", "poor", "fair", "good"]).toContain(window.visibilityLevel);
    if (window.windowStart && window.windowEnd) {
      const windowStart = requiredTimestamp(window.windowStart);
      const windowEnd = requiredTimestamp(window.windowEnd);
      const bestTime = requiredTimestamp(window.bestTime);

      expect(windowStart).toBeLessThan(windowEnd);
      expect(bestTime).toBeGreaterThanOrEqual(windowStart);
      expect(bestTime).toBeLessThanOrEqual(windowEnd);
      expect(window.directionZh).toMatch(/方$/);
    }
  });

  it("validates WGS84 coordinate ranges", () => {
    expect(() =>
      getSunTimes({
        ...huangshanInput,
        latitudeWgs84: 91,
      }),
    ).toThrow(/latitudeWgs84/);
    expect(() =>
      getSunTimes({
        ...huangshanInput,
        longitudeWgs84: 181,
      }),
    ).toThrow(/longitudeWgs84/);
  });

  it("does not perform network calls for local astronomy functions or provider methods", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("astronomy calculations must stay local");
    });
    vi.stubGlobal("fetch", fetchMock);

    getSunTimes(huangshanInput);
    getTwilightTimes(huangshanInput);
    getMoonPhase(huangshanInput);
    getMoonIllumination(huangshanInput);
    getMoonTimes(huangshanInput);
    getMoonAltitudeByHour(huangshanInput);
    getMilkyWayWindow(huangshanInput);
    await new LocalAstroProvider().getSunTimes(huangshanInput);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
