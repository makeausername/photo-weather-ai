import type { Coordinates, TimeWindow } from "@photo-weather/shared";

export type SunTimes = {
  readonly date: string;
  readonly coordinates: Coordinates;
  readonly sunriseAt: string;
  readonly sunsetAt: string;
  readonly goldenHourMorning: TimeWindow;
  readonly goldenHourEvening: TimeWindow;
};

export type MoonTimes = {
  readonly date: string;
  readonly moonriseAt: string;
  readonly moonsetAt: string;
};

export type MoonPhase = {
  readonly date: string;
  readonly phaseName: "new" | "waxing" | "full" | "waning";
  readonly illuminationPercent: number;
};

export type MilkyWayWindow = {
  readonly window: TimeWindow;
  readonly visibilityScore: number;
  readonly notes: readonly string[];
};

export type AstroProvider = {
  getSunTimes(coordinates: Coordinates, date: string): Promise<SunTimes>;
  getMoonTimes(coordinates: Coordinates, date: string): Promise<MoonTimes>;
  getMoonPhase(date: string): Promise<MoonPhase>;
  getMilkyWayWindow(coordinates: Coordinates, date: string): Promise<MilkyWayWindow>;
};
