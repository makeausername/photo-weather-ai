import { TZDate, tz, tzOffset } from "@date-fns/tz";
import { addHours, format } from "date-fns";

export type ForecastWindowHorizon = "24h" | "48h" | "72h" | "7d";

export type ForecastWindowAnchorRule = "future_hour_ceil_to_next_hour";
export type RollingForecastHorizonRule = "rolling_future_hours";

export type ForecastWindowAnchor = {
  readonly horizon: ForecastWindowHorizon;
  readonly timezone: string;
  readonly generatedAtLocal: string;
  readonly anchorStartLocal: string;
  readonly anchorEndLocal: string;
  readonly anchorEndExclusiveLocal: string;
  readonly horizonHours: number;
  readonly expectedRowCount: number;
  readonly requestedHours: number;
  readonly rule: RollingForecastHorizonRule;
  readonly displayLabel: string;
  readonly displayRangeZh: string;
  readonly isFutureOnly: boolean;
  readonly anchorRule: ForecastWindowAnchorRule;
  readonly debugMeta: {
    readonly allowCurrentHour: boolean;
    readonly providerRowsSupplied: boolean;
    readonly providerRowCount: number;
    readonly anchorStartSource: "current_hour" | "next_full_hour";
  };
};

export type ForecastWindowAnchorInput = {
  readonly generatedAt?: Date | string | number;
  readonly now?: Date | string | number;
  readonly timezone?: string;
  readonly horizon: ForecastWindowHorizon;
  readonly requestedForecastHours?: number;
  readonly providerRows?: readonly unknown[];
  readonly selectProviderRowTime?: (row: unknown) => string | null | undefined;
  readonly allowCurrentHour?: boolean;
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

export function resolveRollingForecastHorizon(
  input: ForecastWindowAnchorInput,
): ForecastWindowAnchor {
  const timezone = normalizeTimezone(input.timezone);
  const generatedAt = toValidDate(input.generatedAt ?? input.now ?? new Date());
  const requestedHours = normalizedRequestedHours(
    input.requestedForecastHours ?? forecastWindowHoursForHorizon(input.horizon),
  );
  const anchorStartResolution = resolveAnchorStart(generatedAt, timezone, input);
  const anchorStart = anchorStartResolution.anchorStart;
  const anchorEnd = addHours(anchorStart, Math.max(0, requestedHours - 1));
  const anchorEndExclusive = addHours(anchorStart, requestedHours);
  const generatedAtLocal = formatZonedIsoLocal(generatedAt, timezone);
  const anchorStartLocal = formatZonedIsoLocal(anchorStart, timezone);
  const anchorEndLocal = formatZonedIsoLocal(anchorEnd, timezone);
  const anchorEndExclusiveLocal = formatZonedIsoLocal(anchorEndExclusive, timezone);

  return {
    horizon: input.horizon,
    timezone,
    generatedAtLocal,
    anchorStartLocal,
    anchorEndLocal,
    anchorEndExclusiveLocal,
    horizonHours: requestedHours,
    expectedRowCount: requestedHours,
    requestedHours,
    rule: "rolling_future_hours",
    displayLabel: horizonDisplayLabels[input.horizon],
    displayRangeZh: formatDisplayRangeZh(anchorStart, anchorEnd, timezone),
    isFutureOnly: true,
    anchorRule: "future_hour_ceil_to_next_hour",
    debugMeta: {
      allowCurrentHour: input.allowCurrentHour !== false,
      providerRowsSupplied: input.providerRows !== undefined,
      providerRowCount: input.providerRows?.length ?? 0,
      anchorStartSource: anchorStartResolution.source,
    },
  };
}

export function resolveForecastWindowRange(input: ForecastWindowAnchorInput): ForecastWindowAnchor {
  return resolveRollingForecastHorizon(input);
}

export function filterRowsToForecastWindow<TRow>(
  rows: readonly TRow[],
  range: ForecastWindowAnchor,
  selectTime: (row: TRow) => string | null | undefined,
): readonly TRow[] {
  const startMs = Date.parse(range.anchorStartLocal);
  if (!Number.isFinite(startMs)) {
    return [];
  }

  return rows
    .map((row) => ({ row, timestamp: Date.parse(selectTime(row) ?? "") }))
    .filter(
      (entry): entry is { readonly row: TRow; readonly timestamp: number } =>
        Number.isFinite(entry.timestamp) && entry.timestamp >= startMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, range.expectedRowCount)
    .map((entry) => entry.row);
}

function resolveAnchorStart(
  date: Date,
  timezone: string,
  input: Pick<
    ForecastWindowAnchorInput,
    "allowCurrentHour" | "providerRows" | "selectProviderRowTime"
  >,
): {
  readonly anchorStart: Date;
  readonly source: ForecastWindowAnchor["debugMeta"]["anchorStartSource"];
} {
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
    zoned.getMinutes() === 0 && zoned.getSeconds() === 0 && zoned.getMilliseconds() === 0;

  if (!isExactHour || input.allowCurrentHour === false) {
    return { anchorStart: addHours(floored, 1), source: "next_full_hour" };
  }

  if (
    input.providerRows !== undefined &&
    input.providerRows.length > 0 &&
    input.selectProviderRowTime
  ) {
    const currentHourMs = floored.getTime();
    const hasCurrentProviderRow = input.providerRows.some((row) => {
      const timestamp = Date.parse(input.selectProviderRowTime?.(row) ?? "");
      return Number.isFinite(timestamp) && timestamp === currentHourMs;
    });
    if (!hasCurrentProviderRow) {
      return { anchorStart: addHours(floored, 1), source: "next_full_hour" };
    }
  }

  return { anchorStart: floored, source: "current_hour" };
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

function formatDisplayRangeZh(start: Date, end: Date, timezone: string): string {
  const startText = format(start, "yyyy年M月d日 HH:mm", { in: tz(timezone) });
  const endText = format(end, "yyyy年M月d日 HH:mm", { in: tz(timezone) });
  return `${startText}–${endText}`;
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
