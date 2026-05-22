import {
  getMilkyWayWindow,
  getMoonAltitudeByHour,
  getMoonIllumination,
  getMoonPhase,
  getMoonTimes,
  getSunTimes,
  getTwilightTimes,
} from "./calculations.js";
import { buildMoonCalendarMonth } from "./moon-calendar.js";
import type {
  AstroInput,
  AstroProvider,
  MilkyWayWindow,
  MoonAltitudeByHour,
  MoonCalendarMonth,
  MoonCalendarMonthInput,
  MoonIllumination,
  MoonPhase,
  MoonTimes,
  SunTimes,
  TwilightTimes,
} from "./types.js";

export class LocalAstroProvider implements AstroProvider {
  async getSunTimes(input: AstroInput): Promise<SunTimes> {
    return getSunTimes(input);
  }

  async getTwilightTimes(input: AstroInput): Promise<TwilightTimes> {
    return getTwilightTimes(input);
  }

  async getMoonPhase(input: AstroInput): Promise<MoonPhase> {
    return getMoonPhase(input);
  }

  async getMoonIllumination(input: AstroInput): Promise<MoonIllumination> {
    return getMoonIllumination(input);
  }

  async getMoonCalendarMonth(input: MoonCalendarMonthInput): Promise<MoonCalendarMonth> {
    return buildMoonCalendarMonth(input);
  }

  async getMoonTimes(input: AstroInput): Promise<MoonTimes> {
    return getMoonTimes(input);
  }

  async getMoonAltitudeByHour(input: AstroInput): Promise<MoonAltitudeByHour> {
    return getMoonAltitudeByHour(input);
  }

  async getMilkyWayWindow(input: AstroInput): Promise<MilkyWayWindow> {
    return getMilkyWayWindow(input);
  }
}
