import type {
  AstroInput,
  AstronomicalNightWindow,
  MilkyWayVisibilityLevel,
  MilkyWayWindow,
  MoonAltitudeByHour,
  MoonIllumination,
  MoonPhase,
  MoonPhaseNameZh,
  MoonTimes,
  SunTimes,
  TwilightTimes,
} from "./types.js";

const defaultTimezone = "Asia/Shanghai";
const dayMs = 86_400_000;
const minuteMs = 60_000;
const rad = Math.PI / 180;
const eclipticObliquity = rad * 23.4397;
const j1970 = 2440588;
const j2000 = 2451545;
const j0 = 0.0009;

export function getSunTimes(input: AstroInput): SunTimes {
  const context = normalizeInput(input);
  const result = calculateSunEventSet(context, -0.833);
  const sunriseAzimuth =
    result.sunrise === undefined ? undefined : calculateSunAzimuth(result.sunrise, context);
  const sunsetAzimuth =
    result.sunset === undefined ? undefined : calculateSunAzimuth(result.sunset, context);

  return {
    date: context.date,
    timezone: context.timezone,
    sunrise: formatZonedIso(result.sunrise, context.timezone),
    sunset: formatZonedIso(result.sunset, context.timezone),
    solarNoon: formatZonedIso(result.solarNoon, context.timezone),
    sunriseAzimuth,
    sunsetAzimuth,
  };
}

export function getTwilightTimes(input: AstroInput): TwilightTimes {
  const context = normalizeInput(input);
  const civil = calculateSunEventSet(context, -6);
  const nautical = calculateSunEventSet(context, -12);
  const astronomical = calculateSunEventSet(context, -18);

  return {
    date: context.date,
    timezone: context.timezone,
    civilDawn: formatZonedIso(civil.sunrise, context.timezone),
    civilDusk: formatZonedIso(civil.sunset, context.timezone),
    nauticalDawn: formatZonedIso(nautical.sunrise, context.timezone),
    nauticalDusk: formatZonedIso(nautical.sunset, context.timezone),
    astronomicalDawn: formatZonedIso(astronomical.sunrise, context.timezone),
    astronomicalDusk: formatZonedIso(astronomical.sunset, context.timezone),
  };
}

export function getMoonPhase(input: AstroInput): MoonPhase {
  const context = normalizeInput(input);
  const phase = getMoonIlluminationDetails(context.noonUtcMs).phase;

  return {
    date: context.date,
    timezone: context.timezone,
    moonPhase: round3(phase),
    moonPhaseNameZh: getMoonPhaseNameZh(phase),
  };
}

export function getMoonIllumination(input: AstroInput): MoonIllumination {
  const context = normalizeInput(input);
  const fraction = getMoonIlluminationDetails(context.noonUtcMs).fraction;

  return {
    date: context.date,
    timezone: context.timezone,
    moonIllumination: round3(clamp(fraction, 0, 1)),
  };
}

export function getMoonTimes(input: AstroInput): MoonTimes {
  const context = normalizeInput(input);
  const events = searchMoonRiseSet(context);

  return {
    date: context.date,
    timezone: context.timezone,
    moonrise: formatZonedIso(events.moonrise, context.timezone),
    moonset: formatZonedIso(events.moonset, context.timezone),
  };
}

export function getMoonAltitudeByHour(input: AstroInput): MoonAltitudeByHour {
  const context = normalizeInput(input);
  const altitudeByHour: Record<string, number> = {};

  for (let hour = 0; hour < 24; hour += 1) {
    const timestamp = zonedDateTimeToUtcMs(context.date, context.timezone, hour, 0, 0);
    altitudeByHour[pad2(hour)] = round1(
      getMoonPosition(timestamp, context.latitudeWgs84, context.longitudeWgs84).altitude,
    );
  }

  return {
    date: context.date,
    timezone: context.timezone,
    moonAltitudeByHour: altitudeByHour,
  };
}

export function getAstronomicalNightWindow(input: AstroInput): AstronomicalNightWindow {
  const context = normalizeInput(input);
  const twilight = getTwilightTimes(context);
  const nextTwilight = getTwilightTimes({
    ...context,
    date: addDays(context.date, 1),
  });

  return {
    date: context.date,
    timezone: context.timezone,
    windowStart: twilight.astronomicalDusk,
    windowEnd: nextTwilight.astronomicalDawn,
  };
}

export function getMilkyWayWindow(input: AstroInput): MilkyWayWindow {
  const context = normalizeInput(input);
  const seasonal = getSeasonalMilkyWayWindow(context.date);
  const noteZh =
    "银河窗口为 V1 初步估算，基于天文黑夜、季节和月光影响，尚未计算银心精确高度、地形遮挡和光污染。";

  if (!seasonal) {
    return {
      date: context.date,
      timezone: context.timezone,
      visibilityLevel: "unavailable",
      noteZh,
    };
  }

  const nightWindow = getAstronomicalNightWindow(context);
  if (!nightWindow.windowStart || !nightWindow.windowEnd) {
    return {
      date: context.date,
      timezone: context.timezone,
      directionZh: seasonal.directionZh,
      visibilityLevel: "unavailable",
      noteZh,
    };
  }

  const candidateStart = seasonalLocalHourToUtcMs(context.date, context.timezone, seasonal.startHour);
  const candidateEnd = seasonalLocalHourToUtcMs(context.date, context.timezone, seasonal.endHour);
  const darkStart = Date.parse(nightWindow.windowStart);
  const darkEnd = Date.parse(nightWindow.windowEnd);
  const windowStartMs = Math.max(darkStart, candidateStart);
  const windowEndMs = Math.min(darkEnd, candidateEnd);
  const windowMinutes = (windowEndMs - windowStartMs) / minuteMs;

  if (!Number.isFinite(windowMinutes) || windowMinutes < 45) {
    return {
      date: context.date,
      timezone: context.timezone,
      directionZh: seasonal.directionZh,
      visibilityLevel: "poor",
      noteZh,
    };
  }

  const bestTimeMs = windowStartMs + (windowEndMs - windowStartMs) / 2;
  const moonIllumination = getMoonIlluminationDetails(bestTimeMs).fraction;
  const moonAltitude = getMoonPosition(
    bestTimeMs,
    context.latitudeWgs84,
    context.longitudeWgs84,
  ).altitude;
  const visibilityLevel = adjustVisibilityForMoon(
    seasonal.baseVisibility,
    moonIllumination,
    moonAltitude,
    windowMinutes,
  );

  return {
    date: context.date,
    timezone: context.timezone,
    windowStart: formatZonedIso(windowStartMs, context.timezone),
    windowEnd: formatZonedIso(windowEndMs, context.timezone),
    bestTime: formatZonedIso(bestTimeMs, context.timezone),
    directionZh: seasonal.directionZh,
    visibilityLevel,
    noteZh,
  };
}

export function getMoonPhaseNameZh(phase: number): MoonPhaseNameZh {
  const normalized = ((phase % 1) + 1) % 1;

  if (normalized < 1 / 16 || normalized >= 15 / 16) {
    return "新月";
  }
  if (normalized < 3 / 16) {
    return "娥眉月";
  }
  if (normalized < 5 / 16) {
    return "上弦月";
  }
  if (normalized < 7 / 16) {
    return "盈凸月";
  }
  if (normalized < 9 / 16) {
    return "满月";
  }
  if (normalized < 11 / 16) {
    return "亏凸月";
  }
  if (normalized < 13 / 16) {
    return "下弦月";
  }
  return "残月";
}

type NormalizedAstroInput = Required<AstroInput> & {
  readonly midnightUtcMs: number;
  readonly noonUtcMs: number;
};

type SunEventSet = {
  readonly sunrise?: number;
  readonly sunset?: number;
  readonly solarNoon?: number;
};

type SeasonalMilkyWayWindow = {
  readonly startHour: number;
  readonly endHour: number;
  readonly directionZh: string;
  readonly baseVisibility: Exclude<MilkyWayVisibilityLevel, "unavailable">;
};

function normalizeInput(input: AstroInput): NormalizedAstroInput {
  const timezone = input.timezone?.trim() || defaultTimezone;
  const date = normalizeDate(input.date);

  assertWgs84Coordinate(input.latitudeWgs84, "latitudeWgs84", -90, 90);
  assertWgs84Coordinate(input.longitudeWgs84, "longitudeWgs84", -180, 180);

  return {
    latitudeWgs84: input.latitudeWgs84,
    longitudeWgs84: input.longitudeWgs84,
    date,
    timezone,
    midnightUtcMs: zonedDateTimeToUtcMs(date, timezone, 0, 0, 0),
    noonUtcMs: zonedDateTimeToUtcMs(date, timezone, 12, 0, 0),
  };
}

function calculateSunEventSet(context: NormalizedAstroInput, altitudeDeg: number): SunEventSet {
  const lw = rad * -context.longitudeWgs84;
  const phi = rad * context.latitudeWgs84;
  const d = toDays(new Date(context.noonUtcMs));
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l, 0);
  const solarNoonJ = solarTransitJ(ds, m, l);
  const setJ = getSetJ(altitudeDeg * rad, lw, phi, dec, n, m, l);

  if (setJ === undefined) {
    return {
      solarNoon: fromJulian(solarNoonJ).getTime(),
    };
  }

  const riseJ = solarNoonJ - (setJ - solarNoonJ);

  return {
    sunrise: fromJulian(riseJ).getTime(),
    sunset: fromJulian(setJ).getTime(),
    solarNoon: fromJulian(solarNoonJ).getTime(),
  };
}

function calculateSunAzimuth(timestamp: number, context: NormalizedAstroInput): number {
  const lw = rad * -context.longitudeWgs84;
  const phi = rad * context.latitudeWgs84;
  const d = toDays(new Date(timestamp));
  const sun = sunCoords(d);
  const h = siderealTime(d, lw) - sun.ra;
  const azimuthDeg = ((azimuth(h, phi, sun.dec) / rad + 180) % 360) - 180;

  return round1(azimuthDeg);
}

function searchMoonRiseSet(context: NormalizedAstroInput): {
  readonly moonrise?: number;
  readonly moonset?: number;
} {
  const intervalMs = 10 * minuteMs;
  let previousTime = context.midnightUtcMs;
  let previousAltitude = getMoonPosition(
    previousTime,
    context.latitudeWgs84,
    context.longitudeWgs84,
  ).altitude;
  let moonrise: number | undefined;
  let moonset: number | undefined;

  for (
    let timestamp = context.midnightUtcMs + intervalMs;
    timestamp <= context.midnightUtcMs + dayMs;
    timestamp += intervalMs
  ) {
    const altitude = getMoonPosition(
      timestamp,
      context.latitudeWgs84,
      context.longitudeWgs84,
    ).altitude;

    if (previousAltitude < 0 && altitude >= 0 && moonrise === undefined) {
      moonrise = interpolateCrossing(previousTime, timestamp, previousAltitude, altitude);
    }
    if (previousAltitude >= 0 && altitude < 0 && moonset === undefined) {
      moonset = interpolateCrossing(previousTime, timestamp, previousAltitude, altitude);
    }
    if (moonrise !== undefined && moonset !== undefined) {
      break;
    }

    previousTime = timestamp;
    previousAltitude = altitude;
  }

  return { moonrise, moonset };
}

function getMoonPosition(
  timestamp: number,
  latitudeWgs84: number,
  longitudeWgs84: number,
): {
  readonly altitude: number;
  readonly azimuth: number;
} {
  const lw = rad * -longitudeWgs84;
  const phi = rad * latitudeWgs84;
  const d = toDays(new Date(timestamp));
  const moon = moonCoords(d);
  const h = siderealTime(d, lw) - moon.ra;
  const altitudeRad = altitude(h, phi, moon.dec);

  return {
    altitude: (altitudeRad + astroRefraction(altitudeRad)) / rad,
    azimuth: azimuth(h, phi, moon.dec) / rad,
  };
}

function getMoonIlluminationDetails(timestamp: number): {
  readonly fraction: number;
  readonly phase: number;
} {
  const d = toDays(new Date(timestamp));
  const sun = sunCoords(d);
  const moon = moonCoords(d);
  const sunDistance = 149_598_000;
  const phi = Math.acos(
    Math.sin(sun.dec) * Math.sin(moon.dec) +
      Math.cos(sun.dec) * Math.cos(moon.dec) * Math.cos(sun.ra - moon.ra),
  );
  const inc = Math.atan2(sunDistance * Math.sin(phi), moon.dist - sunDistance * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(sun.dec) * Math.sin(sun.ra - moon.ra),
    Math.sin(sun.dec) * Math.cos(moon.dec) -
      Math.cos(sun.dec) * Math.sin(moon.dec) * Math.cos(sun.ra - moon.ra),
  );
  const phase = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;

  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: ((phase % 1) + 1) % 1,
  };
}

function sunCoords(d: number): {
  readonly dec: number;
  readonly ra: number;
} {
  const m = solarMeanAnomaly(d);
  const l = eclipticLongitude(m);

  return {
    dec: declination(l, 0),
    ra: rightAscension(l, 0),
  };
}

function moonCoords(d: number): {
  readonly dec: number;
  readonly dist: number;
  readonly ra: number;
} {
  const l = rad * (218.316 + 13.176396 * d);
  const m = rad * (134.963 + 13.064993 * d);
  const f = rad * (93.272 + 13.22935 * d);
  const longitude = l + rad * 6.289 * Math.sin(m);
  const latitude = rad * 5.128 * Math.sin(f);

  return {
    ra: rightAscension(longitude, latitude),
    dec: declination(longitude, latitude),
    dist: 385_001 - 20_905 * Math.cos(m),
  };
}

function getSeasonalMilkyWayWindow(date: string): SeasonalMilkyWayWindow | undefined {
  const month = Number(date.slice(5, 7));

  switch (month) {
    case 2:
      return { startHour: 4, endHour: 5.5, directionZh: "东南方低空", baseVisibility: "poor" };
    case 3:
      return { startHour: 3, endHour: 5.5, directionZh: "东南至南方", baseVisibility: "fair" };
    case 4:
      return { startHour: 1.5, endHour: 4.5, directionZh: "东南至南方", baseVisibility: "fair" };
    case 5:
      return { startHour: 0, endHour: 3.5, directionZh: "东南至南方", baseVisibility: "good" };
    case 6:
      return { startHour: 22.5, endHour: 26.5, directionZh: "南方", baseVisibility: "good" };
    case 7:
      return { startHour: 21.5, endHour: 25.5, directionZh: "南方至西南", baseVisibility: "good" };
    case 8:
      return { startHour: 20.5, endHour: 23.5, directionZh: "南方至西南", baseVisibility: "good" };
    case 9:
      return { startHour: 19.5, endHour: 22.5, directionZh: "西南方", baseVisibility: "fair" };
    case 10:
      return { startHour: 18.5, endHour: 20.5, directionZh: "西南方低空", baseVisibility: "poor" };
    default:
      return undefined;
  }
}

function adjustVisibilityForMoon(
  baseVisibility: Exclude<MilkyWayVisibilityLevel, "unavailable">,
  moonIllumination: number,
  moonAltitude: number,
  windowMinutes: number,
): MilkyWayVisibilityLevel {
  let levelScore = baseVisibility === "good" ? 3 : baseVisibility === "fair" ? 2 : 1;

  if (windowMinutes < 90) {
    levelScore -= 1;
  }
  if (moonAltitude > 5 && moonIllumination > 0.35) {
    levelScore -= 1;
  }
  if (moonAltitude > 15 && moonIllumination > 0.65) {
    levelScore -= 1;
  }

  if (levelScore >= 3) {
    return "good";
  }
  if (levelScore === 2) {
    return "fair";
  }
  return "poor";
}

function seasonalLocalHourToUtcMs(date: string, timezone: string, hourFloat: number): number {
  const dayOffset = hourFloat >= 24 ? Math.floor(hourFloat / 24) : hourFloat < 12 ? 1 : 0;
  const normalizedHour = ((hourFloat % 24) + 24) % 24;
  const hour = Math.floor(normalizedHour);
  const minute = Math.round((normalizedHour - hour) * 60);

  return zonedDateTimeToUtcMs(addDays(date, dayOffset), timezone, hour, minute, 0);
}

function getSetJ(
  altitudeRad: number,
  lw: number,
  phi: number,
  dec: number,
  n: number,
  m: number,
  l: number,
): number | undefined {
  const hourAngleValue = hourAngle(altitudeRad, phi, dec);
  if (hourAngleValue === undefined) {
    return undefined;
  }

  const a = approxTransit(hourAngleValue, lw, n);
  return solarTransitJ(a, m, l);
}

function rightAscension(l: number, b: number): number {
  return Math.atan2(
    Math.sin(l) * Math.cos(eclipticObliquity) - Math.tan(b) * Math.sin(eclipticObliquity),
    Math.cos(l),
  );
}

function declination(l: number, b: number): number {
  return Math.asin(
    Math.sin(b) * Math.cos(eclipticObliquity) +
      Math.cos(b) * Math.sin(eclipticObliquity) * Math.sin(l),
  );
}

function azimuth(h: number, phi: number, dec: number): number {
  return Math.atan2(
    Math.sin(h),
    Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi),
  );
}

function altitude(h: number, phi: number, dec: number): number {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h));
}

function siderealTime(d: number, lw: number): number {
  return rad * (280.16 + 360.9856235 * d) - lw;
}

function astroRefraction(altitudeRad: number): number {
  const safeAltitude = altitudeRad < 0 ? 0 : altitudeRad;
  return (0.0002967 / Math.tan(safeAltitude + 0.00312536 / (safeAltitude + 0.08901179))) || 0;
}

function solarMeanAnomaly(d: number): number {
  return rad * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(m: number): number {
  const c = rad * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const p = rad * 102.9372;

  return m + c + p + Math.PI;
}

function julianCycle(d: number, lw: number): number {
  return Math.round(d - j0 - lw / (2 * Math.PI));
}

function approxTransit(ht: number, lw: number, n: number): number {
  return j0 + (ht + lw) / (2 * Math.PI) + n;
}

function solarTransitJ(ds: number, m: number, l: number): number {
  return j2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
}

function hourAngle(altitudeRad: number, phi: number, dec: number): number | undefined {
  const value =
    (Math.sin(altitudeRad) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));

  if (value < -1 || value > 1) {
    return undefined;
  }

  return Math.acos(value);
}

function toJulian(date: Date): number {
  return date.getTime() / dayMs - 0.5 + j1970;
}

function fromJulian(julianDate: number): Date {
  return new Date((julianDate + 0.5 - j1970) * dayMs);
}

function toDays(date: Date): number {
  return toJulian(date) - j2000;
}

function interpolateCrossing(
  previousTime: number,
  nextTime: number,
  previousAltitude: number,
  nextAltitude: number,
): number {
  const fraction =
    previousAltitude === nextAltitude
      ? 0
      : (0 - previousAltitude) / (nextAltitude - previousAltitude);

  return previousTime + clamp(fraction, 0, 1) * (nextTime - previousTime);
}

function normalizeDate(value: string): string {
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Astro input date must use YYYY-MM-DD format.");
  }

  return date;
}

function assertWgs84Coordinate(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be a finite WGS84 coordinate between ${min} and ${max}.`);
  }
}

function zonedDateTimeToUtcMs(
  date: string,
  timezone: string,
  hour: number,
  minute: number,
  second: number,
): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(timezone, utcMs);
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * minuteMs;
  }

  return utcMs;
}

function getTimeZoneOffsetMinutes(timezone: string, utcMs: number): number {
  if (timezone === "UTC" || timezone === "Etc/UTC" || timezone === "Z") {
    return 0;
  }

  const fixedOffset = parseFixedOffsetMinutes(timezone);
  if (fixedOffset !== undefined) {
    return fixedOffset;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(utcMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtcMs = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return Math.round((asUtcMs - utcMs) / minuteMs);
}

function parseFixedOffsetMinutes(value: string): number | undefined {
  const match = /^(?:UTC)?([+-])(\d{2}):?(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }

  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function formatZonedIso(timestamp: number | undefined, timezone: string): string | undefined {
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    return undefined;
  }

  const date = new Date(timestamp);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const offsetMinutes = getTimeZoneOffsetMinutes(timezone, timestamp);

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}${formatOffset(offsetMinutes)}`;
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const timestamp = Date.UTC(year, month - 1, day + days);
  const next = new Date(timestamp);

  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
