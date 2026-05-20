import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalAstroProvider,
  getMilkyWayWindow,
  getMoonAltitudeByHour,
  getMoonIllumination,
  getMoonPhase,
  getMoonPhaseNameZh,
  getMoonTimes,
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

  it("keeps moon illumination in the 0-1 range", () => {
    const illumination = getMoonIllumination(huangshanInput).moonIllumination;

    expect(illumination).toBeGreaterThanOrEqual(0);
    expect(illumination).toBeLessThanOrEqual(1);
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
      noteZh: "银河窗口为本地天文算法初步估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。",
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
