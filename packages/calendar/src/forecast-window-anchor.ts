import { TZDate, tz, tzOffset } from "@date-fns/tz";
import { addHours, format } from "date-fns";

export type ForecastWindowHorizon = "24h" | "48h" | "72h" | "7d";

export type ForecastWindowAnchorRule = "future_hour_ceil_to_next_hour";

export type ForecastWindowAnchor = {
  readonly timezone: string;
  readonly generatedAtLocal: string;
  readonly anchorStartLocal: string;
  readonly anchorEndLocal: string;
  readonly anchorEndExclusiveLocal: string;
  readonly requestedHours: number;
  readonly displayLabel: string;
  readonly isFutureOnly: boolean;
  readonly anchorRule: ForecastWindowAnchorRule;
};

export type ForecastWindowAnchorInput = {
  readonly generatedAt?: Date | string | number;
  readonly now?: Date | string | number;
  readonly timezone?: string;
  readonly horizon: ForecastWindowHorizon;
  readonly requestedForecastHours?: number;
};

const defaultForecastTimezone = "Asia/Shanghai";

const horizonDisplayLabels = {
  "24h": "未来24小时",
  "48h": "未来48小时",
  "72h": "未来72小时",
  "7d": "未来7天",
} as const satisfies Record<ForecastWindowHorizon, string>;

export function forecastWindowHoursForHorizon(horizon: ForecastWindowHorizon): number {
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

export function bufferedForecastRequestHours(horizon: ForecastWindowHorizon): number {
  switch (horizon) {
    case "24h":
      return 30;
    case "48h":
      return 54;
    case "72h":
      return 78;
    case "7d":
      return 7 * 24 + 6;
  }
}

export function resolveForecastWindowRange(input: ForecastWindowAnchorInput): ForecastWindowAnchor {
  const timezone = normalizeTimezone(input.timezone);
  const generatedAt = toValidDate(input.generatedAt ?? input.now ?? new Date());
  const requestedHours = normalizedRequestedHours(
    input.requestedForecastHours ?? forecastWindowHoursForHorizon(input.horizon),
  );
  const anchorStart = ceilToNextForecastHour(generatedAt, timezone);
  const anchorEnd = addHours(anchorStart, Math.max(0, requestedHours - 1));
  const anchorEndExclusive = addHours(anchorStart, requestedHours);

  return {
    timezone,
    generatedAtLocal: formatZonedIsoLocal(generatedAt, timezone),
    anchorStartLocal: formatZonedIsoLocal(anchorStart, timezone),
    anchorEndLocal: formatZonedIsoLocal(anchorEnd, timezone),
    anchorEndExclusiveLocal: formatZonedIsoLocal(anchorEndExclusive, timezone),
    requestedHours,
    displayLabel: horizonDisplayLabels[input.horizon],
    isFutureOnly: true,
    anchorRule: "future_hour_ceil_to_next_hour",
  };
}

export function filterRowsToForecastWindow<TRow>(
  rows: readonly TRow[],
  range: ForecastWindowAnchor,
  selectTime: (row: TRow) => string | null | undefined,
): readonly TRow[] {
  const startMs = Date.parse(range.anchorStartLocal);
  const endExclusiveMs = Date.parse(range.anchorEndExclusiveLocal);
  if (!Number.isFinite(startMs) || !Number.isFinite(endExclusiveMs) || endExclusiveMs <= startMs) {
    return [];
  }

  return rows
    .map((row) => ({ row, timestamp: Date.parse(selectTime(row) ?? "") }))
    .filter(
      (entry): entry is { readonly row: TRow; readonly timestamp: number } =>
        Number.isFinite(entry.timestamp) &&
        entry.timestamp >= startMs &&
        entry.timestamp < endExclusiveMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, range.requestedHours)
    .map((entry) => entry.row);
}

function ceilToNextForecastHour(date: Date, timezone: string): Date {
  const zoned = TZDate.tz(timezone, date);
  const floored = TZDate.tz(
    timezone,
    zoned.getFullYear(),
    zoned.getMonth(),
    zoned.getDate(),
    zoned.getHours(),
    0,
    0,
    0,
  );
  const isExactHour =
    zoned.getMinutes() === 0 &&
    zoned.getSeconds() === 0 &&
    zoned.getMilliseconds() === 0;

  return isExactHour ? floored : addHours(floored, 1);
}

function normalizedRequestedHours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 24;
  }
  return Math.max(1, Math.round(value));
}

function normalizeTimezone(timezone: string | undefined): string {
  return timezone?.trim() || defaultForecastTimezone;
}

function toValidDate(value: Date | string | number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid forecast window anchor time.");
  }
  return date;
}

function formatZonedIsoLocal(date: Date, timezone: string): string {
  const localDateTime = format(date, "yyyy-MM-dd'T'HH:mm:ss", {
    in: tz(timezone),
  });
  const offset = tzOffset(timezone, date);
  return `${localDateTime}${formatOffset(offset)}`;
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
