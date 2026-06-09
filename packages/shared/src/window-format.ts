export type ShootingWindowDateTimeFormat = "full" | "compact";

export type ShootingWindowLike = {
  readonly startTime?: string;
  readonly endTime?: string;
  readonly start?: string;
  readonly end?: string;
};

export type ShootingWindowFormatOptions = {
  readonly style?: ShootingWindowDateTimeFormat;
  readonly missingText?: string;
  readonly invalidText?: string;
  readonly includeWeekday?: boolean;
};

export type LocalDateTimeFormatOptions = ShootingWindowFormatOptions;

const defaultTimezone = "Asia/Shanghai";
const defaultMissingWindowText = "暂无明确窗口";
const defaultInvalidWindowText = "时间待确认";
const rangeSeparator = "–";
const dateTimeSeparator = " · ";

type DateTimeParts = {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly weekday: string;
  readonly hour: string;
  readonly minute: string;
};

export function formatShootingWindowZh(
  window: ShootingWindowLike,
  timezone = defaultTimezone,
  options: ShootingWindowFormatOptions = {},
): string {
  return formatLocalDateTimeRange(
    window.startTime ?? window.start,
    window.endTime ?? window.end,
    timezone,
    options,
  );
}

export function formatForecastWindowZh(
  start: string | undefined,
  end: string | undefined,
  timezone = defaultTimezone,
  options: ShootingWindowFormatOptions = {},
): string {
  return formatShootingWindowZh({ startTime: start, endTime: end }, timezone, options);
}

export function formatArrivalDeadlineZh(
  value: string | undefined,
  timezone = defaultTimezone,
  options: {
    readonly prefix?: string;
    readonly missingText?: string;
    readonly style?: ShootingWindowDateTimeFormat;
    readonly includeWeekday?: boolean;
  } = {},
): string {
  const missingText = options.missingText ?? "暂无明确到达时间";
  if (!value) {
    return missingText;
  }

  const parts = dateTimeParts(value, timezone);
  if (!parts) {
    return defaultInvalidWindowText;
  }

  const prefix = options.prefix ?? "建议到达：";
  return `${prefix}${formatDateZh(parts, options.style ?? "full", options.includeWeekday ?? true)}${dateTimeSeparator}${parts.hour}:${parts.minute} 前`;
}

export function formatLocalDate(
  value: string | undefined,
  timezone = defaultTimezone,
  options: LocalDateTimeFormatOptions = {},
): string {
  const parts = value ? dateTimeParts(value, timezone) : undefined;
  if (!parts) {
    return options.invalidText ?? defaultInvalidWindowText;
  }
  return formatDateOnlyZh(parts, options.style ?? "full");
}

export function formatLocalWeekday(
  value: string | undefined,
  timezone = defaultTimezone,
  options: Pick<LocalDateTimeFormatOptions, "invalidText"> = {},
): string {
  const parts = value ? dateTimeParts(value, timezone) : undefined;
  return parts?.weekday ?? options.invalidText ?? defaultInvalidWindowText;
}

export function formatLocalDateLabel(
  value: string | undefined,
  timezone = defaultTimezone,
  options: LocalDateTimeFormatOptions = {},
): string {
  const parts = value ? dateTimeParts(value, timezone) : undefined;
  if (!parts) {
    return options.invalidText ?? defaultInvalidWindowText;
  }
  return formatDateZh(parts, options.style ?? "full", options.includeWeekday ?? true);
}

export function formatLocalTime(
  value: string | undefined,
  timezone = defaultTimezone,
  options: Pick<LocalDateTimeFormatOptions, "missingText" | "invalidText"> = {},
): string {
  if (!value) {
    return options.missingText ?? "暂无明确时间";
  }
  const parts = dateTimeParts(value, timezone);
  if (!parts) {
    return options.invalidText ?? defaultInvalidWindowText;
  }
  return formatClock(parts);
}

export function formatLocalTimeRange(
  start: string | undefined,
  end: string | undefined,
  timezone = defaultTimezone,
  options: LocalDateTimeFormatOptions = {},
): string {
  const missingText = options.missingText ?? defaultMissingWindowText;
  const invalidText = options.invalidText ?? defaultInvalidWindowText;
  if (!start || !end) {
    return missingText;
  }

  const startParts = dateTimeParts(start, timezone);
  const endParts = dateTimeParts(end, timezone);
  if (!startParts || !endParts) {
    return invalidText;
  }

  if (!crossesDateBoundary(startParts, endParts)) {
    return `${formatClock(startParts)}${rangeSeparator}${formatClock(endParts)}`;
  }

  return `${formatDateOnlyZh(startParts, "compact")} ${formatClock(startParts)}${rangeSeparator}${formatDateOnlyZh(
    endParts,
    needsYear(startParts, endParts) ? "full" : "compact",
  )} ${formatClock(endParts)}`;
}

export function formatLocalDateTime(
  value: string | undefined,
  timezone = defaultTimezone,
  options: LocalDateTimeFormatOptions = {},
): string {
  const parts = value ? dateTimeParts(value, timezone) : undefined;
  if (!parts) {
    return options.invalidText ?? defaultInvalidWindowText;
  }
  return `${formatDateZh(parts, options.style ?? "full", options.includeWeekday ?? true)}${dateTimeSeparator}${formatClock(parts)}`;
}

export function formatLocalDateTimeRange(
  start: string | undefined,
  end: string | undefined,
  timezone = defaultTimezone,
  options: LocalDateTimeFormatOptions = {},
): string {
  const missingText = options.missingText ?? defaultMissingWindowText;
  const invalidText = options.invalidText ?? defaultInvalidWindowText;
  const style = options.style ?? "full";
  const includeWeekday = options.includeWeekday ?? true;
  if (!start || !end) {
    return missingText;
  }

  const startParts = dateTimeParts(start, timezone);
  const endParts = dateTimeParts(end, timezone);
  if (!startParts || !endParts) {
    return invalidText;
  }

  if (!crossesDateBoundary(startParts, endParts)) {
    return `${formatDateZh(startParts, style, includeWeekday)}${dateTimeSeparator}${formatClock(
      startParts,
    )}${rangeSeparator}${formatClock(endParts)}`;
  }

  return `${formatDateZh(startParts, style, includeWeekday)} ${formatClock(
    startParts,
  )}${rangeSeparator}${formatRangeEndDateZh(
    startParts,
    endParts,
    style,
    includeWeekday,
  )} ${formatClock(endParts)}`;
}

export function crossesLocalDateBoundary(
  start: string | undefined,
  end: string | undefined,
  timezone = defaultTimezone,
): boolean {
  if (!start || !end) {
    return false;
  }
  const startParts = dateTimeParts(start, timezone);
  const endParts = dateTimeParts(end, timezone);
  return Boolean(startParts && endParts && crossesDateBoundary(startParts, endParts));
}

export function localDateKey(
  value: string | undefined,
  timezone = defaultTimezone,
): string | undefined {
  const parts = value ? dateTimeParts(value, timezone) : undefined;
  if (!parts) {
    return undefined;
  }
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function dateTimeParts(value: string, timezone: string): DateTimeParts | undefined {
  const dateOnly = dateOnlyParts(value);
  if (dateOnly) {
    return dateOnly;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(new Date(timestamp));
  } catch {
    return undefined;
  }

  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(valueFor("year"));
  const month = Number(valueFor("month"));
  const day = Number(valueFor("day"));
  const weekday = valueFor("weekday");
  const hour = valueFor("hour");
  const minute = valueFor("minute");

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !weekday ||
    !hour ||
    !minute
  ) {
    return undefined;
  }

  return {
    year,
    month,
    day,
    weekday,
    hour,
    minute,
  };
}

function dateOnlyParts(value: string): DateTimeParts | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return {
    year,
    month,
    day,
    weekday: weekdayZh(date.getUTCDay()),
    hour: "00",
    minute: "00",
  };
}

function weekdayZh(day: number): string {
  return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][day] ?? "星期日";
}

function formatDateZh(
  parts: DateTimeParts,
  style: ShootingWindowDateTimeFormat,
  includeWeekday: boolean,
): string {
  const weekday = includeWeekday ? ` ${parts.weekday}` : "";
  return `${formatDateOnlyZh(parts, style)}${weekday}`;
}

function formatDateOnlyZh(parts: DateTimeParts, style: ShootingWindowDateTimeFormat): string {
  if (style === "compact") {
    return `${parts.month}月${parts.day}日`;
  }

  return `${parts.year}年${parts.month}月${parts.day}日`;
}

function formatRangeEndDateZh(
  start: DateTimeParts,
  end: DateTimeParts,
  style: ShootingWindowDateTimeFormat,
  includeWeekday: boolean,
): string {
  const weekday = includeWeekday ? ` ${end.weekday}` : "";
  if (style === "full" && start.year !== end.year) {
    return `${end.year}年${end.month}月${end.day}日${weekday}`;
  }

  if (style === "compact" && start.year !== end.year) {
    return `${end.year}年${end.month}月${end.day}日${weekday}`;
  }

  return `${end.month}月${end.day}日${weekday}`;
}

function formatClock(parts: DateTimeParts): string {
  return `${parts.hour}:${parts.minute}`;
}

function crossesDateBoundary(start: DateTimeParts, end: DateTimeParts): boolean {
  return start.year !== end.year || start.month !== end.month || start.day !== end.day;
}

function needsYear(start: DateTimeParts, end: DateTimeParts): boolean {
  return start.year !== end.year;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
