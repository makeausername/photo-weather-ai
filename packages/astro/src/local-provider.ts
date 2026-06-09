import {
  getMilkyWayWindow,
  getMoonAltitudeByHour,
  getMoonIllumination,
  getMoonPhase,
  getMoonTimes,
  getSolarAltitudeCrossing,
  getSolarGlowGeometry,
  getSolarPosition,
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
  SolarAltitudeCrossing,
  SolarAltitudeCrossingInput,
  SolarGlowGeometry,
  SolarPosition,
  SolarPositionInput,
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

  async getSolarPosition(input: SolarPositionInput): Promise<SolarPosition> {
    return getSolarPosition(input);
  }

  async getSolarAltitudeCrossing(
    input: SolarAltitudeCrossingInput,
  ): Promise<SolarAltitudeCrossing> {
    return getSolarAltitudeCrossing(input);
  }

  async getSolarGlowGeometry(input: AstroInput): Promise<SolarGlowGeometry> {
    return getSolarGlowGeometry(input);
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
