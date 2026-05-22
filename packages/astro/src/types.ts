export type AstroInput = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly date: string;
  readonly timezone?: string;
};

export type MoonPhaseNameZh =
  | "新月"
  | "娥眉月"
  | "上弦月"
  | "盈凸月"
  | "满月"
  | "亏凸月"
  | "下弦月"
  | "残月";

export type MoonWaxingOrWaning = "waxing" | "waning" | "unknown";

export type MilkyWayVisibilityLevel = "unavailable" | "poor" | "fair" | "good";

export type SunTimes = {
  readonly date: string;
  readonly timezone: string;
  readonly sunrise?: string;
  readonly sunset?: string;
  readonly solarNoon?: string;
  readonly sunriseAzimuth?: number;
  readonly sunsetAzimuth?: number;
};

export type TwilightTimes = {
  readonly date: string;
  readonly timezone: string;
  readonly civilDawn?: string;
  readonly civilDusk?: string;
  readonly nauticalDawn?: string;
  readonly nauticalDusk?: string;
  readonly astronomicalDawn?: string;
  readonly astronomicalDusk?: string;
};

export type MoonPhase = {
  readonly date: string;
  readonly timezone: string;
  readonly moonPhase: number;
  readonly moonPhaseNameZh: MoonPhaseNameZh;
  readonly moonIllumination: number;
  readonly waxingOrWaning: MoonWaxingOrWaning;
};

export type MoonIllumination = {
  readonly date: string;
  readonly timezone: string;
  readonly moonIllumination: number;
};

export type MoonCalendarDay = {
  readonly date: string;
  readonly dateLabel: string;
  readonly lunarDateText?: string;
  readonly isToday: boolean;
  readonly phaseValue: number;
  readonly phaseNameZh: MoonPhaseNameZh;
  readonly illumination: number;
  readonly waxingOrWaning: MoonWaxingOrWaning;
  readonly isNewMoon: boolean;
  readonly isFullMoon: boolean;
  readonly isFirstQuarter: boolean;
  readonly isLastQuarter: boolean;
};

export type MoonCalendarSummary = {
  readonly newMoon?: MoonCalendarDay;
  readonly fullMoon?: MoonCalendarDay;
  readonly firstQuarter?: MoonCalendarDay;
  readonly lastQuarter?: MoonCalendarDay;
};

export type MoonCalendarMonth = {
  readonly year: number;
  readonly month: number;
  readonly titleZh: string;
  readonly timezone: string;
  readonly firstDayOfWeek: number;
  readonly days: readonly MoonCalendarDay[];
  readonly summary: MoonCalendarSummary;
};

export type MoonCalendarMonthInput = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly year: number;
  readonly month: number;
  readonly timezone?: string;
  readonly today?: string | Date | number;
};

export type MoonCalendarMonthKey = {
  readonly year: number;
  readonly month: number;
};

export type MoonTimes = {
  readonly date: string;
  readonly timezone: string;
  readonly moonrise?: string;
  readonly moonset?: string;
};

export type MoonAltitudeByHour = {
  readonly date: string;
  readonly timezone: string;
  readonly moonAltitudeByHour: Readonly<Record<string, number>>;
};

export type AstronomicalNightWindow = {
  readonly date: string;
  readonly timezone: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
};

export type MilkyWayWindow = {
  readonly date: string;
  readonly timezone: string;
  readonly windowStart?: string;
  readonly windowEnd?: string;
  readonly bestTime?: string;
  readonly directionZh?: string;
  readonly visibilityLevel: MilkyWayVisibilityLevel;
  readonly noteZh: string;
};

export type AstroProvider = {
  getSunTimes(input: AstroInput): Promise<SunTimes>;
  getTwilightTimes(input: AstroInput): Promise<TwilightTimes>;
  getMoonPhase(input: AstroInput): Promise<MoonPhase>;
  getMoonIllumination(input: AstroInput): Promise<MoonIllumination>;
  getMoonCalendarMonth(input: MoonCalendarMonthInput): Promise<MoonCalendarMonth>;
  getMoonTimes(input: AstroInput): Promise<MoonTimes>;
  getMoonAltitudeByHour(input: AstroInput): Promise<MoonAltitudeByHour>;
  getMilkyWayWindow(input: AstroInput): Promise<MilkyWayWindow>;
};
