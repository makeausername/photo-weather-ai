import { defaultTimezone, getChineseCalendarInfo } from "@photo-weather/calendar";
import { getMoonPhase } from "./calculations.js";
import type {
  MoonCalendarDay,
  MoonCalendarMonth,
  MoonCalendarMonthInput,
  MoonCalendarMonthKey,
} from "./types.js";

const daysInWeek = 7;

export function buildMoonCalendarMonth(input: MoonCalendarMonthInput): MoonCalendarMonth {
  const timezone = input.timezone?.trim() || defaultTimezone;
  const year = assertYear(input.year);
  const month = assertMonth(input.month);
  const today = normalizeToday(input.today, timezone);
  const daysInMonth = getDaysInMonth(year, month);
  const days: MoonCalendarDay[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = formatPlainDate(year, month, day);
    const phase = getMoonPhase({
      latitudeWgs84: input.latitudeWgs84,
      longitudeWgs84: input.longitudeWgs84,
      date,
      timezone,
    });
    const lunar = getChineseCalendarInfo(date, timezone);

    days.push({
      date,
      dateLabel: `${month}月${day}日`,
      lunarDateText: lunar.lunarDateText,
      isToday: date === today,
      phaseValue: phase.moonPhase,
      phaseNameZh: phase.moonPhaseNameZh,
      illumination: phase.moonIllumination,
      waxingOrWaning: phase.waxingOrWaning,
      isNewMoon: phase.moonPhaseNameZh === "新月",
      isFullMoon: phase.moonPhaseNameZh === "满月",
      isFirstQuarter: phase.moonPhaseNameZh === "上弦月",
      isLastQuarter: phase.moonPhaseNameZh === "下弦月",
    });
  }

  return {
    year,
    month,
    titleZh: `${year}年${month}月`,
    timezone,
    firstDayOfWeek: getMondayFirstDayOfWeek(year, month),
    days,
    summary: {
      newMoon: findPhaseDay(days, "new"),
      fullMoon: findPhaseDay(days, "full"),
      firstQuarter: findPhaseDay(days, "firstQuarter"),
      lastQuarter: findPhaseDay(days, "lastQuarter"),
    },
  };
}

export function shiftMoonCalendarMonth(
  year: number,
  month: number,
  offsetMonths: number,
): MoonCalendarMonthKey {
  const cursor = new Date(Date.UTC(assertYear(year), assertMonth(month) - 1 + offsetMonths, 1));

  return {
    year: cursor.getUTCFullYear(),
    month: cursor.getUTCMonth() + 1,
  };
}

export function getCurrentMoonCalendarMonthKey(
  timezone = defaultTimezone,
  now: Date | number | string = new Date(),
): MoonCalendarMonthKey {
  const parts = getZonedDateParts(now, timezone);

  return {
    year: parts.year,
    month: parts.month,
  };
}

function findPhaseDay(
  days: readonly MoonCalendarDay[],
  phase: "new" | "full" | "firstQuarter" | "lastQuarter",
): MoonCalendarDay | undefined {
  const exact = days.find((day) => {
    switch (phase) {
      case "new":
        return day.isNewMoon;
      case "full":
        return day.isFullMoon;
      case "firstQuarter":
        return day.isFirstQuarter;
      case "lastQuarter":
        return day.isLastQuarter;
    }
  });

  if (exact) {
    return exact;
  }

  const targetPhase = {
    new: 0,
    firstQuarter: 0.25,
    full: 0.5,
    lastQuarter: 0.75,
  }[phase];

  return days.reduce<MoonCalendarDay | undefined>((best, day) => {
    if (!best) {
      return day;
    }

    return phaseDistance(day.phaseValue, targetPhase) < phaseDistance(best.phaseValue, targetPhase)
      ? day
      : best;
  }, undefined);
}

function phaseDistance(value: number, target: number): number {
  const direct = Math.abs(value - target);

  return Math.min(direct, 1 - direct);
}

function normalizeToday(
  value: string | Date | number | undefined,
  timezone: string,
): string | undefined {
  if (value === undefined) {
    return formatDateInTimezone(new Date(), timezone);
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }

  return formatDateInTimezone(toDate(value), timezone);
}

function getZonedDateParts(
  value: Date | number | string,
  timezone: string,
): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function formatDateInTimezone(value: Date, timezone: string): string | undefined {
  if (!Number.isFinite(value.getTime())) {
    return undefined;
  }

  const parts = getZonedDateParts(value, timezone);

  return formatPlainDate(parts.year, parts.month, parts.day);
}

function toDate(value: Date | number | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function getMondayFirstDayOfWeek(year: number, month: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();

  return (jsDay + daysInWeek - 1) % daysInWeek;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatPlainDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function assertYear(year: number): number {
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw new Error("Moon calendar year must be an integer between 1900 and 2100.");
  }

  return year;
}

function assertMonth(month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Moon calendar month must be an integer between 1 and 12.");
  }

  return month;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
