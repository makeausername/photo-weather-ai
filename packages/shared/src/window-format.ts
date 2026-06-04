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

const defaultTimezone = "Asia/Shanghai";
const defaultMissingWindowText = "暂无明确窗口";
const defaultInvalidWindowText = "时间待确认";

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
  const startValue = window.startTime ?? window.start;
  const endValue = window.endTime ?? window.end;
  const missingText = options.missingText ?? defaultMissingWindowText;
  const invalidText = options.invalidText ?? defaultInvalidWindowText;
  const style = options.style ?? "full";
  const includeWeekday = options.includeWeekday ?? true;

  if (!startValue || !endValue) {
    return missingText;
  }

  const start = dateTimeParts(startValue, timezone);
  const end = dateTimeParts(endValue, timezone);
  if (!start || !end) {
    return invalidText;
  }

  const sameDay = start.year === end.year && start.month === end.month && start.day === end.day;
  const startClock = `${start.hour}:${start.minute}`;
  const endClock = `${end.hour}:${end.minute}`;

  if (sameDay) {
    return `${formatDateZh(start, style, includeWeekday)} ${startClock}-${endClock}`;
  }

  return `${formatDateZh(start, style, includeWeekday)} ${startClock} - ${formatRangeEndDateZh(
    start,
    end,
    style,
    includeWeekday,
  )} ${endClock}`;
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
  return `${prefix}${formatDateZh(
    parts,
    options.style ?? "full",
    options.includeWeekday ?? true,
  )} ${parts.hour}:${parts.minute} 前`;
}

function dateTimeParts(value: string, timezone: string): DateTimeParts | undefined {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));

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

function formatDateZh(
  parts: DateTimeParts,
  style: ShootingWindowDateTimeFormat,
  includeWeekday: boolean,
): string {
  const weekday = includeWeekday ? ` ${parts.weekday}` : "";
  if (style === "compact") {
    return `${parts.month}月${parts.day}日${weekday}`;
  }

  return `${parts.year}年${parts.month}月${parts.day}日${weekday}`;
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
