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
};

export type MoonIllumination = {
  readonly date: string;
  readonly timezone: string;
  readonly moonIllumination: number;
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
  getMoonTimes(input: AstroInput): Promise<MoonTimes>;
  getMoonAltitudeByHour(input: AstroInput): Promise<MoonAltitudeByHour>;
  getMilkyWayWindow(input: AstroInput): Promise<MilkyWayWindow>;
};
