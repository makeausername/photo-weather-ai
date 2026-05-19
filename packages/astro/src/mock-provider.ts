import type { Coordinates } from "@photo-weather/shared";
import type { AstroProvider, MilkyWayWindow, MoonPhase, MoonTimes, SunTimes } from "./types.js";

const TIMEZONE = "Asia/Shanghai";

export class MockAstroProvider implements AstroProvider {
  async getSunTimes(coordinates: Coordinates, date: string): Promise<SunTimes> {
    return {
      date,
      coordinates,
      sunriseAt: `${date}T06:42:00+08:00`,
      sunsetAt: `${date}T17:28:00+08:00`,
      goldenHourMorning: {
        startsAt: `${date}T06:12:00+08:00`,
        endsAt: `${date}T07:12:00+08:00`,
        timezone: TIMEZONE,
      },
      goldenHourEvening: {
        startsAt: `${date}T16:58:00+08:00`,
        endsAt: `${date}T17:58:00+08:00`,
        timezone: TIMEZONE,
      },
    };
  }

  async getMoonTimes(_coordinates: Coordinates, date: string): Promise<MoonTimes> {
    return {
      date,
      moonriseAt: `${date}T21:14:00+08:00`,
      moonsetAt: `${date}T09:20:00+08:00`,
    };
  }

  async getMoonPhase(date: string): Promise<MoonPhase> {
    return {
      date,
      phaseName: "waxing",
      illuminationPercent: 38,
    };
  }

  async getMilkyWayWindow(_coordinates: Coordinates, date: string): Promise<MilkyWayWindow> {
    return {
      window: {
        startsAt: `${date}T02:10:00+08:00`,
        endsAt: `${date}T04:40:00+08:00`,
        timezone: TIMEZONE,
      },
      visibilityScore: 76,
      notes: ["Mock dark-sky window with moderate moon impact."],
    };
  }
}
