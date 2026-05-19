import { describe, expect, it } from "vitest";
import {
  getMilkyWayWindow,
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

describe("local astronomy calculations", () => {
  it("returns the sun times output shape", () => {
    const sunTimes = getSunTimes(huangshanInput);

    expect(sunTimes).toMatchObject({
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
    });
    expect(sunTimes.sunrise).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    expect(sunTimes.sunset).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    expect(sunTimes.solarNoon).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  });

  it("returns the twilight output shape", () => {
    const twilight = getTwilightTimes(huangshanInput);

    expect(twilight.civilDawn).toBeDefined();
    expect(twilight.civilDusk).toBeDefined();
    expect(twilight.nauticalDawn).toBeDefined();
    expect(twilight.nauticalDusk).toBeDefined();
    expect(twilight.astronomicalDawn).toBeDefined();
    expect(twilight.astronomicalDusk).toBeDefined();
  });

  it("maps moon phases to Chinese labels", () => {
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

  it("returns moonrise and moonset fields when available", () => {
    const moonTimes = getMoonTimes(huangshanInput);

    expect(moonTimes).toMatchObject({
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
    });
    expect(Object.keys(moonTimes)).toEqual(expect.arrayContaining(["moonrise", "moonset"]));
  });

  it("returns the Milky Way window output shape with a preliminary note", () => {
    const window = getMilkyWayWindow(huangshanInput);

    expect(window).toMatchObject({
      date: "2026-05-20",
      timezone: "Asia/Shanghai",
    });
    expect(["unavailable", "poor", "fair", "good"]).toContain(window.visibilityLevel);
    expect(window.noteZh).toContain("V1 初步估算");
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
});
