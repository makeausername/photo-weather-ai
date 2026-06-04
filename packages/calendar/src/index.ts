import { addDays, addHours, format } from "date-fns";
import { zhCN } from "date-fns/locale/zh-CN";
import { TZDate, tz, tzOffset } from "@date-fns/tz";
import { Solar } from "lunar-typescript";
export * from "./forecast-window-anchor.js";
export * from "./rolling-horizon-provider-coverage.js";

export const defaultTimezone = "Asia/Shanghai";

export const forecastDateRangeErrorMessage = "缺少有效预报时间范围，无法生成拍摄天气分析。";

export type CalendarDateInput = Date | string | number;

export type ForecastHorizon = "24h" | "48h" | "72h" | "7d";

export type ForecastDateRangeOptions = {
  readonly now?: CalendarDateInput;
  readonly timezone?: string;
};

export type ForecastDateRange = {
  readonly forecastStart: string;
  readonly forecastEnd: string;
  readonly targetDates: readonly string[];
  readonly horizonHours: number;
  readonly timezone: string;
};

export type ChineseCalendarInfo = {
  readonly date: string;
  readonly timezone: string;
  readonly lunarYear: number;
  readonly lunarMonth: number;
  readonly lunarDay: number;
  readonly lunarDateText: string;
  readonly solarTerm?: string;
  readonly ganzhiYear?: string;
  readonly zodiac?: string;
};

export type SolarTermBrief = {
  readonly name: string;
  readonly date: string;
  readonly dateTime: string;
};

export type SolarTermInfo = {
  readonly date: string;
  readonly timezone: string;
  readonly solarTerm?: string;
  readonly previous?: SolarTermBrief;
  readonly next?: SolarTermBrief;
};

type ZonedParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
};

export function getNowInTimezone(timezone = defaultTimezone): TZDate {
  return TZDate.tz(normalizeTimezone(timezone), new Date());
}

export function getForecastHorizonHours(horizon: ForecastHorizon): number {
  switch (horizon) {
    case "24h":
      return 24;
    case "48h":
      return 48;
    case "72h":
      return 72;
    case "7d":
      return 7 * 24;
  }
}

export function buildForecastDateRange(
  horizon: ForecastHorizon,
  options: ForecastDateRangeOptions = {},
): ForecastDateRange {
  const timezone = normalizeTimezone(options.timezone);
  const now =
    options.now === undefined ? getNowInTimezone(timezone) : toValidDate(options.now, timezone);
  const horizonHours = getForecastHorizonHours(horizon);
  const forecastEndDate = horizon === "7d" ? addDays(now, 7) : addHours(now, horizonHours);
  const targetDates = getForecastTargetDates(now, forecastEndDate, timezone);

  if (targetDates.length === 0) {
    throw new Error(forecastDateRangeErrorMessage);
  }

  return {
    forecastStart: formatZonedIso(now, timezone),
    forecastEnd: formatZonedIso(forecastEndDate, timezone),
    targetDates,
    horizonHours,
    timezone,
  };
}

export function getForecastTargetDates(
  forecastStart: CalendarDateInput,
  forecastEnd: CalendarDateInput,
  timezone = defaultTimezone,
): readonly string[] {
  const normalizedTimezone = normalizeTimezone(timezone);
  const start = toValidDate(forecastStart, normalizedTimezone);
  const end = toValidDate(forecastEnd, normalizedTimezone);

  if (end.getTime() <= start.getTime()) {
    throw new Error(forecastDateRangeErrorMessage);
  }

  const inclusiveEnd = new Date(end.getTime() - 1);
  const startParts = getZonedParts(start, normalizedTimezone);
  const endParts = getZonedParts(inclusiveEnd, normalizedTimezone);
  const dates: string[] = [];
  let cursor = plainDateToUtcNoon(startParts);
  const last = plainDateToUtcNoon(endParts);

  while (cursor.getTime() <= last.getTime()) {
    dates.push(formatPlainDate(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function formatChineseDate(date: CalendarDateInput, timezone = defaultTimezone): string {
  return formatInTimezone(date, "yyyy年M月d日 EEEE", timezone);
}

export function formatChineseTime(date: CalendarDateInput, timezone = defaultTimezone): string {
  return formatInTimezone(date, "HH:mm", timezone);
}

export function formatChineseDateTime(date: CalendarDateInput, timezone = defaultTimezone): string {
  return formatInTimezone(date, "yyyy年M月d日 HH:mm", timezone);
}

export function formatChineseDateTimeRange(
  start: CalendarDateInput,
  end: CalendarDateInput,
  timezone = defaultTimezone,
): string {
  const normalizedTimezone = normalizeTimezone(timezone);
  const startDate = toValidDate(start, normalizedTimezone);
  const endDate = toValidDate(end, normalizedTimezone);
  const startParts = getZonedParts(startDate, normalizedTimezone);
  const endParts = getZonedParts(endDate, normalizedTimezone);
  const startClock = `${pad2(startParts.hour)}:${pad2(startParts.minute)}`;
  const endClock = `${pad2(endParts.hour)}:${pad2(endParts.minute)}`;
  const startDateText = `${startParts.year}年${startParts.month}月${startParts.day}日`;

  if (
    startParts.year === endParts.year &&
    startParts.month === endParts.month &&
    startParts.day === endParts.day
  ) {
    return `${startDateText} ${startClock}-${endClock}`;
  }

  const endDateText =
    startParts.year === endParts.year
      ? `${endParts.month}月${endParts.day}日`
      : `${endParts.year}年${endParts.month}月${endParts.day}日`;

  return `${startDateText} ${startClock} 至 ${endDateText} ${endClock}`;
}

export function getChineseCalendarInfo(
  date: CalendarDateInput,
  timezone = defaultTimezone,
): ChineseCalendarInfo {
  const normalizedTimezone = normalizeTimezone(timezone);
  const solar = toSolar(date, normalizedTimezone);
  const lunar = solar.getLunar();
  const solarTerm = cleanOptionalText(lunar.getJieQi()) ?? getCurrentSolarTermName(lunar);
  const monthPrefix = lunar.getMonth() < 0 ? "闰" : "";
  const monthText = `${monthPrefix}${lunar.getMonthInChinese()}月`;

  return {
    date: solar.toYmd(),
    timezone: normalizedTimezone,
    lunarYear: lunar.getYear(),
    lunarMonth: lunar.getMonth(),
    lunarDay: lunar.getDay(),
    lunarDateText: `${monthText}${lunar.getDayInChinese()}`,
    solarTerm,
    ganzhiYear: cleanOptionalText(lunar.getYearInGanZhi()),
    zodiac: cleanOptionalText(lunar.getYearShengXiao()),
  };
}

export function getSolarTermInfo(
  date: CalendarDateInput,
  timezone = defaultTimezone,
): SolarTermInfo {
  const normalizedTimezone = normalizeTimezone(timezone);
  const solar = toSolar(date, normalizedTimezone);
  const lunar = solar.getLunar();
  const current = cleanOptionalText(lunar.getJieQi()) ?? getCurrentSolarTermName(lunar);

  return {
    date: solar.toYmd(),
    timezone: normalizedTimezone,
    solarTerm: current,
    previous: toSolarTermBrief(lunar.getPrevJieQi(true)),
    next: toSolarTermBrief(lunar.getNextJieQi(true)),
  };
}

export function addHoursInTimezone(
  date: CalendarDateInput,
  hours: number,
  timezone = defaultTimezone,
): string {
  return formatZonedIso(addHours(toValidDate(date, timezone), hours), normalizeTimezone(timezone));
}

export function getHourInTimezone(date: CalendarDateInput, timezone = defaultTimezone): number {
  return getZonedParts(toValidDate(date, normalizeTimezone(timezone)), normalizeTimezone(timezone))
    .hour;
}

export function formatZonedIso(date: CalendarDateInput, timezone = defaultTimezone): string {
  const normalizedTimezone = normalizeTimezone(timezone);
  const value = toValidDate(date, normalizedTimezone);
  const localDateTime = format(value, "yyyy-MM-dd'T'HH:mm:ss", {
    in: tz(normalizedTimezone),
  });
  const offset = tzOffset(normalizedTimezone, value);

  return `${localDateTime}${formatOffset(offset)}`;
}

function formatInTimezone(date: CalendarDateInput, pattern: string, timezone: string): string {
  const normalizedTimezone = normalizeTimezone(timezone);

  return format(toValidDate(date, normalizedTimezone), pattern, {
    locale: zhCN,
    in: tz(normalizedTimezone),
  });
}

function toSolar(date: CalendarDateInput, timezone: string): Solar {
  const parts = getZonedParts(toValidDate(date, timezone), timezone);

  return Solar.fromYmdHms(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function getCurrentSolarTermName(lunar: ReturnType<Solar["getLunar"]>): string | undefined {
  const current = lunar.getCurrentJieQi();

  return current ? cleanOptionalText(current.getName()) : undefined;
}

function toSolarTermBrief(
  term: ReturnType<ReturnType<Solar["getLunar"]>["getNextJieQi"]>,
): SolarTermBrief | undefined {
  const name = cleanOptionalText(term.getName());
  if (!name) {
    return undefined;
  }

  const solar = term.getSolar();

  return {
    name,
    date: solar.toYmd(),
    dateTime: solar.toYmdHms(),
  };
}

function toValidDate(value: CalendarDateInput, timezone: string): Date {
  const date = toDate(value, timezone);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(forecastDateRangeErrorMessage);
  }

  return date;
}

function toDate(value: CalendarDateInput, timezone: string): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = parsePlainDate(value);
    return TZDate.tz(timezone, year, month - 1, day, 0, 0, 0);
  }

  return new Date(value);
}

function getZonedParts(date: Date, timezone: string): ZonedParts {
  const zoned = TZDate.tz(timezone, date);

  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds(),
  };
}

function plainDateToUtcNoon(parts: Pick<ZonedParts, "year" | "month" | "day">): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
}

function formatPlainDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parsePlainDate(value: string): readonly [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);

  return [year ?? 0, month ?? 0, day ?? 0];
}

function cleanOptionalText(value: string | undefined | null): string | undefined {
  const text = value?.trim();

  return text ? text : undefined;
}

function normalizeTimezone(timezone: string | undefined): string {
  return timezone?.trim() || defaultTimezone;
}

function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;

  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
