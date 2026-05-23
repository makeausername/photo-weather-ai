import {
  Body,
  DefineStar,
  Equator,
  Horizon,
  Illumination,
  MoonPhase as astronomyMoonPhase,
  Observer,
  SearchAltitude,
  SearchHourAngle,
  SearchRiseSet,
} from "astronomy-engine";
import type {
  AstroInput,
  AstronomicalNightWindow,
  MilkyWayVisibilityLevel,
  MilkyWayWindow,
  MoonAltitudeByHour,
  MoonIllumination,
  MoonPhase,
  MoonPhaseNameZh,
  MoonWaxingOrWaning,
  MoonTimes,
  SunTimes,
  TwilightTimes,
} from "./types.js";

const defaultTimezone = "Asia/Shanghai";
const hourMs = 3_600_000;
const minuteMs = 60_000;
const milkyWaySampleStepMs = 15 * minuteMs;
const milkyWayMinimumAltitude = 10;
const milkyWayNoteZh = "银河窗口为简化本地估算，实际拍摄仍需结合云量、月光、光污染和地形遮挡。";

let isGalacticCenterDefined = false;

export function getSunTimes(input: AstroInput): SunTimes {
  const context = normalizeInput(input);
  const sunrise = findRiseSet(Body.Sun, context, 1);
  const sunset = findRiseSet(Body.Sun, context, -1);
  const solarNoon = findSolarNoon(context);

  return {
    date: context.date,
    timezone: context.timezone,
    sunrise: formatZonedIso(sunrise, context.timezone),
    sunset: formatZonedIso(sunset, context.timezone),
    solarNoon: formatZonedIso(solarNoon, context.timezone),
    sunriseAzimuth: sunrise === undefined ? undefined : getBodyAzimuth(Body.Sun, sunrise, context),
    sunsetAzimuth: sunset === undefined ? undefined : getBodyAzimuth(Body.Sun, sunset, context),
  };
}

export function getTwilightTimes(input: AstroInput): TwilightTimes {
  const context = normalizeInput(input);

  return {
    date: context.date,
    timezone: context.timezone,
    civilDawn: formatZonedIso(findSunAltitudeCrossing(context, 1, -6), context.timezone),
    civilDusk: formatZonedIso(findSunAltitudeCrossing(context, -1, -6), context.timezone),
    nauticalDawn: formatZonedIso(findSunAltitudeCrossing(context, 1, -12), context.timezone),
    nauticalDusk: formatZonedIso(findSunAltitudeCrossing(context, -1, -12), context.timezone),
    astronomicalDawn: formatZonedIso(findSunAltitudeCrossing(context, 1, -18), context.timezone),
    astronomicalDusk: formatZonedIso(findSunAltitudeCrossing(context, -1, -18), context.timezone),
  };
}

export function getMoonPhase(input: AstroInput): MoonPhase {
  const context = normalizeInput(input);
  const phase = normalizePhase(astronomyMoonPhase(new Date(context.noonUtcMs)) / 360);
  const illumination = getMoonIlluminationFraction(context.noonUtcMs);
  const waxingOrWaning = getMoonWaxingOrWaning(phase);

  return {
    date: context.date,
    timezone: context.timezone,
    moonPhase: round3(phase),
    moonPhaseNameZh: getMoonPhaseNameZh(phase, illumination, waxingOrWaning),
    moonIllumination: round3(illumination),
    waxingOrWaning,
  };
}

export function getMoonIllumination(input: AstroInput): MoonIllumination {
  const context = normalizeInput(input);
  const fraction = getMoonIlluminationFraction(context.noonUtcMs);

  return {
    date: context.date,
    timezone: context.timezone,
    moonIllumination: round3(clamp(fraction, 0, 1)),
  };
}

export function getMoonTimes(input: AstroInput): MoonTimes {
  const context = normalizeInput(input);
  const moonrise = findRiseSet(Body.Moon, context, 1);
  const moonset = findRiseSet(Body.Moon, context, -1);

  return {
    date: context.date,
    timezone: context.timezone,
    moonrise: formatZonedIso(moonrise, context.timezone),
    moonset: formatZonedIso(moonset, context.timezone),
  };
}

export function getMoonAltitudeByHour(input: AstroInput): MoonAltitudeByHour {
  const context = normalizeInput(input);
  const altitudeByHour: Record<string, number> = {};

  for (let hour = 0; hour < 24; hour += 1) {
    const timestamp = zonedDateTimeToUtcMs(context.date, context.timezone, hour, 0, 0);
    altitudeByHour[pad2(hour)] = round1(getBodyHorizontal(Body.Moon, timestamp, context).altitude);
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
  const nightWindow = getAstronomicalNightWindow(context);
  const darkStart = parseTimestamp(nightWindow.windowStart);
  const darkEnd = parseTimestamp(nightWindow.windowEnd);

  if (darkStart === undefined || darkEnd === undefined || darkEnd <= darkStart) {
    return {
      date: context.date,
      timezone: context.timezone,
      calculationPrecision: "v1_approximate",
      visibilityLevel: "unavailable",
      noteZh: milkyWayNoteZh,
    };
  }

  const samples = sampleMilkyWayWindow(context, darkStart, darkEnd);
  if (samples.length === 0) {
    return {
      date: context.date,
      timezone: context.timezone,
      calculationPrecision: "v1_approximate",
      visibilityLevel: "unavailable",
      noteZh: milkyWayNoteZh,
    };
  }

  const bestSample = samples.reduce((best, sample) => (sample.score > best.score ? sample : best));
  const eligibleSamples = samples.filter(
    (sample) => sample.galacticCenterAltitude >= milkyWayMinimumAltitude,
  );
  if (eligibleSamples.length === 0) {
    return {
      date: context.date,
      timezone: context.timezone,
      bestTime: formatZonedIso(bestSample.timestamp, context.timezone),
      directionZh: directionFromAzimuth(bestSample.galacticCenterAzimuth),
      galacticCenterAltitude: round1(bestSample.galacticCenterAltitude),
      galacticCenterAzimuth: round1(bestSample.galacticCenterAzimuth),
      calculationPrecision: "v1_approximate",
      visibilityLevel: "poor",
      noteZh: milkyWayNoteZh,
    };
  }

  const windowStart = eligibleSamples[0]!.timestamp;
  const windowEnd = Math.min(
    eligibleSamples[eligibleSamples.length - 1]!.timestamp + milkyWaySampleStepMs,
    darkEnd,
  );
  const durationHours = (windowEnd - windowStart) / hourMs;
  const visibilityLevel = classifyMilkyWayVisibility(bestSample, durationHours);

  return {
    date: context.date,
    timezone: context.timezone,
    windowStart: formatZonedIso(windowStart, context.timezone),
    windowEnd: formatZonedIso(windowEnd, context.timezone),
    bestTime: formatZonedIso(bestSample.timestamp, context.timezone),
    directionZh: directionFromAzimuth(bestSample.galacticCenterAzimuth),
    galacticCenterAltitude: round1(bestSample.galacticCenterAltitude),
    galacticCenterAzimuth: round1(bestSample.galacticCenterAzimuth),
    calculationPrecision: "v1_approximate",
    visibilityLevel,
    noteZh: milkyWayNoteZh,
  };
}

export function getMoonPhaseNameZh(
  phase: number,
  illumination?: number | null,
  waxingOrWaning: MoonWaxingOrWaning = getMoonWaxingOrWaning(phase),
): MoonPhaseNameZh {
  const normalized = normalizePhase(phase);
  const normalizedIllumination = normalizeIllumination(illumination, normalized);
  const distanceToNew = Math.min(normalized, 1 - normalized);
  const distanceToFull = Math.abs(normalized - 0.5);
  const firstQuarterDistance = Math.abs(normalized - 0.25);
  const lastQuarterDistance = Math.abs(normalized - 0.75);
  const isNearFirstQuarter =
    firstQuarterDistance <= 0.035 &&
    normalizedIllumination >= 0.42 &&
    normalizedIllumination <= 0.58;
  const isNearLastQuarter =
    lastQuarterDistance <= 0.035 &&
    normalizedIllumination >= 0.42 &&
    normalizedIllumination <= 0.58;

  if (distanceToNew <= 0.035 || normalizedIllumination <= 0.03) {
    return "新月";
  }
  if (distanceToFull <= 0.035 || normalizedIllumination >= 0.97) {
    return "满月";
  }
  if (isNearFirstQuarter) {
    return "上弦月";
  }
  if (isNearLastQuarter) {
    return "下弦月";
  }

  const direction =
    waxingOrWaning === "unknown" ? getMoonWaxingOrWaning(normalized) : waxingOrWaning;

  if (direction === "waxing") {
    return normalized < 0.25 ? "娥眉月" : "盈凸月";
  }
  if (direction === "waning") {
    return normalized < 0.75 ? "亏凸月" : "残月";
  }

  return normalized < 0.5 ? "娥眉月" : "残月";
}

export function getMoonWaxingOrWaning(phase: number): MoonWaxingOrWaning {
  const normalized = normalizePhase(phase);

  if (normalized > 0 && normalized < 0.5) {
    return "waxing";
  }
  if (normalized > 0.5 && normalized < 1) {
    return "waning";
  }
  return "unknown";
}

type NormalizedAstroInput = Required<AstroInput> & {
  readonly midnightUtcMs: number;
  readonly nextMidnightUtcMs: number;
  readonly noonUtcMs: number;
  readonly observer: Observer;
};

type MilkyWaySample = {
  readonly timestamp: number;
  readonly galacticCenterAltitude: number;
  readonly galacticCenterAzimuth: number;
  readonly moonAltitude: number;
  readonly moonIllumination: number;
  readonly score: number;
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
    nextMidnightUtcMs: zonedDateTimeToUtcMs(addDays(date, 1), timezone, 0, 0, 0),
    noonUtcMs: zonedDateTimeToUtcMs(date, timezone, 12, 0, 0),
    observer: new Observer(input.latitudeWgs84, input.longitudeWgs84, 0),
  };
}

function findRiseSet(
  body: Body,
  context: NormalizedAstroInput,
  direction: 1 | -1,
): number | undefined {
  const event = SearchRiseSet(
    body,
    context.observer,
    direction,
    new Date(context.midnightUtcMs),
    1,
  );
  return timestampWithinLocalDate(event?.date.getTime(), context);
}

function findSolarNoon(context: NormalizedAstroInput): number | undefined {
  const event = SearchHourAngle(Body.Sun, context.observer, 0, new Date(context.midnightUtcMs), 1);
  return timestampWithinLocalDate(event.time.date.getTime(), context);
}

function findSunAltitudeCrossing(
  context: NormalizedAstroInput,
  direction: 1 | -1,
  altitude: number,
): number | undefined {
  const event = SearchAltitude(
    Body.Sun,
    context.observer,
    direction,
    new Date(context.midnightUtcMs),
    1,
    altitude,
  );

  return timestampWithinLocalDate(event?.date.getTime(), context);
}

function timestampWithinLocalDate(
  timestamp: number | undefined,
  context: NormalizedAstroInput,
): number | undefined {
  if (
    timestamp === undefined ||
    !Number.isFinite(timestamp) ||
    timestamp < context.midnightUtcMs ||
    timestamp >= context.nextMidnightUtcMs
  ) {
    return undefined;
  }

  return timestamp;
}

function getBodyAzimuth(body: Body, timestamp: number, context: NormalizedAstroInput): number {
  return round1(getBodyHorizontal(body, timestamp, context).azimuth);
}

function getBodyHorizontal(
  body: Body,
  timestamp: number,
  context: Pick<NormalizedAstroInput, "observer">,
): {
  readonly altitude: number;
  readonly azimuth: number;
} {
  const date = new Date(timestamp);
  const equatorial = Equator(body, date, context.observer, true, true);
  const horizontal = Horizon(date, context.observer, equatorial.ra, equatorial.dec, "normal");

  return {
    altitude: horizontal.altitude,
    azimuth: horizontal.azimuth,
  };
}

function sampleMilkyWayWindow(
  context: NormalizedAstroInput,
  darkStart: number,
  darkEnd: number,
): readonly MilkyWaySample[] {
  ensureGalacticCenterStar();

  const samples: MilkyWaySample[] = [];
  const firstSample = Math.ceil(darkStart / milkyWaySampleStepMs) * milkyWaySampleStepMs;

  for (let timestamp = firstSample; timestamp <= darkEnd; timestamp += milkyWaySampleStepMs) {
    const galacticCenter = getBodyHorizontal(Body.Star1, timestamp, context);
    const moon = getBodyHorizontal(Body.Moon, timestamp, context);
    const moonIllumination = clamp(
      Illumination(Body.Moon, new Date(timestamp)).phase_fraction,
      0,
      1,
    );
    const moonPenalty =
      moon.altitude <= 0
        ? 0
        : moonIllumination * (moon.altitude >= 20 ? 35 : moon.altitude >= 8 ? 24 : 14);
    const altitudeScore = clamp((galacticCenter.altitude - 5) * 3.2, 0, 100);
    const score = clamp(altitudeScore - moonPenalty, 0, 100);

    samples.push({
      timestamp,
      galacticCenterAltitude: galacticCenter.altitude,
      galacticCenterAzimuth: galacticCenter.azimuth,
      moonAltitude: moon.altitude,
      moonIllumination,
      score,
    });
  }

  return samples;
}

function ensureGalacticCenterStar(): void {
  if (isGalacticCenterDefined) {
    return;
  }

  // Local V1 approximation: Sagittarius A* J2000 coordinates stand in for the Galactic Center.
  DefineStar(Body.Star1, 17 + 45 / 60 + 40.04 / 3600, -29.00781, 26_000);
  isGalacticCenterDefined = true;
}

function classifyMilkyWayVisibility(
  bestSample: MilkyWaySample,
  durationHours: number,
): MilkyWayVisibilityLevel {
  let score = bestSample.score;

  if (bestSample.galacticCenterAltitude >= 25) {
    score += 12;
  } else if (bestSample.galacticCenterAltitude < 15) {
    score -= 15;
  }

  if (durationHours >= 2.5) {
    score += 10;
  } else if (durationHours < 1) {
    score -= 18;
  }

  if (score >= 78) {
    return "good";
  }
  if (score >= 52) {
    return "fair";
  }
  return "poor";
}

function directionFromAzimuth(azimuth: number): string {
  const normalized = ((azimuth % 360) + 360) % 360;
  const directions = [
    "北方",
    "东北方",
    "东方",
    "东南方",
    "南方",
    "西南方",
    "西方",
    "西北方",
  ] as const;
  const index = Math.round(normalized / 45) % directions.length;

  return directions[index]!;
}

function normalizePhase(phase: number): number {
  return ((phase % 1) + 1) % 1;
}

function normalizeIllumination(illumination: number | null | undefined, phase: number): number {
  if (typeof illumination === "number" && Number.isFinite(illumination)) {
    const asRatio = illumination > 1 && illumination <= 100 ? illumination / 100 : illumination;

    return clamp(asRatio, 0, 1);
  }

  return clamp((1 - Math.cos(phase * Math.PI * 2)) / 2, 0, 1);
}

function getMoonIlluminationFraction(timestamp: number): number {
  return clamp(Illumination(Body.Moon, new Date(timestamp)).phase_fraction, 0, 1);
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
  const [year, month, day] = parseDateParts(date);
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

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = parseDateParts(date);
  const timestamp = Date.UTC(year, month - 1, day + days);
  const next = new Date(timestamp);

  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function parseDateParts(date: string): [number, number, number] {
  const parts = date.split("-").map(Number);

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
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
