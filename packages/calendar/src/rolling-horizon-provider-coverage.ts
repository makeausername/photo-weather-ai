import { TZDate, tz, tzOffset } from "@date-fns/tz";
import { addHours, format } from "date-fns";
import {
  bufferedForecastRequestHours,
  forecastWindowHoursForHorizon,
  resolveRollingForecastHorizon,
  type ForecastWindowHorizon,
} from "./forecast-window-anchor.js";

export const rollingHorizonProviderCoverageVersion = "rolling-provider-coverage-v2";

export type RollingHorizonProviderType =
  | "forecast_hours"
  | "forecast_days"
  | "mixed"
  | "unknown";

export type RollingHorizonProviderCapabilities = {
  readonly supportsForecastHours?: boolean;
  readonly supportsForecastDays?: boolean;
  readonly maxForecastHours?: number;
  readonly maxForecastDays?: number;
  readonly startsAtLocalMidnight?: boolean;
};

export type RollingHorizonProviderCoverageRule =
  | "forecast_hours_with_buffer"
  | "forecast_days_calendar_coverage"
  | "provider_max_limited";

export type RollingHorizonProviderCoverageInput = {
  readonly generatedAt?: Date | string | number;
  readonly now?: Date | string | number;
  readonly timezone?: string;
  readonly horizon: ForecastWindowHorizon;
  readonly providerType?: RollingHorizonProviderType;
  readonly providerCapabilities?: RollingHorizonProviderCapabilities;
  readonly preferredBufferHours?: number;
};

export type RollingHorizonProviderCoveragePlan = {
  readonly version: typeof rollingHorizonProviderCoverageVersion;
  readonly horizon: ForecastWindowHorizon;
  readonly timezone: string;
  readonly horizonHours: number;
  readonly anchorStartLocal: string;
  readonly anchorEndLocal: string;
  readonly anchorEndExclusiveLocal: string;
  readonly expectedRowCount: number;
  readonly minRequestHours: number;
  readonly recommendedRequestHours: number;
  readonly requiredForecastDays: number;
  readonly requestStartLocal: string;
  readonly requestEndLocal: string;
  readonly coverageRule: RollingHorizonProviderCoverageRule;
  readonly displayRangeZh: string;
};

const defaultTimezone = "Asia/Shanghai";
const defaultBufferHours = 6;

export function resolveRollingHorizonProviderRequest(
  input: RollingHorizonProviderCoverageInput,
): RollingHorizonProviderCoveragePlan {
  const timezone = input.timezone?.trim() || defaultTimezone;
  const horizonHours = forecastWindowHoursForHorizon(input.horizon);
  const range = resolveRollingForecastHorizon({
    generatedAt: input.generatedAt ?? input.now ?? new Date(),
    timezone,
    horizon: input.horizon,
    requestedForecastHours: horizonHours,
  });
  const capabilities = normalizeCapabilities(input.providerType, input.providerCapabilities);
  const minRequestHours = horizonHours;
  const preferredRequestHours = Math.max(
    minRequestHours,
    input.preferredBufferHours === undefined
      ? bufferedForecastRequestHours(input.horizon)
      : minRequestHours + normalizedBufferHours(input.preferredBufferHours),
  );
  const recommendedRequestHours = clampByMax(preferredRequestHours, capabilities.maxForecastHours);
  const requestStartDate =
    capabilities.supportsForecastHours && !capabilities.startsAtLocalMidnight
      ? toValidDate(range.anchorStartLocal)
      : startOfLocalDay(range.generatedAtLocal, timezone);
  const bufferedRequestEndDate = addHours(
    toValidDate(range.anchorStartLocal),
    recommendedRequestHours - 1,
  );
  const unclampedForecastDays = countLocalCalendarDays(
    requestStartDate,
    toValidDate(range.anchorEndLocal),
    timezone,
  );
  const requiredForecastDays = clampByMax(unclampedForecastDays, capabilities.maxForecastDays);
  const requestEndDate =
    capabilities.supportsForecastHours && !capabilities.startsAtLocalMidnight
      ? bufferedRequestEndDate
      : endOfForecastDayRequest(requestStartDate, requiredForecastDays, timezone);
  const coverageRule = resolveCoverageRule({
    capabilities,
    preferredRequestHours,
    recommendedRequestHours,
    unclampedForecastDays,
    requiredForecastDays,
  });

  return {
    version: rollingHorizonProviderCoverageVersion,
    horizon: input.horizon,
    timezone: range.timezone,
    horizonHours,
    anchorStartLocal: range.anchorStartLocal,
    anchorEndLocal: range.anchorEndLocal,
    anchorEndExclusiveLocal: range.anchorEndExclusiveLocal,
    expectedRowCount: range.expectedRowCount,
    minRequestHours,
    recommendedRequestHours,
    requiredForecastDays,
    requestStartLocal: formatZonedIsoLocal(requestStartDate, timezone),
    requestEndLocal: formatZonedIsoLocal(requestEndDate, timezone),
    coverageRule,
    displayRangeZh: range.displayRangeZh,
  };
}

export const buildProviderCoverageRequestPlan = resolveRollingHorizonProviderRequest;

function normalizeCapabilities(
  providerType: RollingHorizonProviderType | undefined,
  capabilities: RollingHorizonProviderCapabilities | undefined,
): Required<Pick<RollingHorizonProviderCapabilities, "supportsForecastHours" | "supportsForecastDays" | "startsAtLocalMidnight">> &
  Pick<RollingHorizonProviderCapabilities, "maxForecastHours" | "maxForecastDays"> {
  const supportsForecastHours =
    capabilities?.supportsForecastHours ??
    (providerType === "forecast_hours" || providerType === "mixed");
  const supportsForecastDays =
    capabilities?.supportsForecastDays ??
    (providerType === "forecast_days" || providerType === "mixed" || !supportsForecastHours);

  return {
    supportsForecastHours,
    supportsForecastDays,
    startsAtLocalMidnight:
      capabilities?.startsAtLocalMidnight ?? (!supportsForecastHours || providerType === "forecast_days"),
    maxForecastHours: positiveInteger(capabilities?.maxForecastHours),
    maxForecastDays: positiveInteger(capabilities?.maxForecastDays),
  };
}

function resolveCoverageRule(input: {
  readonly capabilities: ReturnType<typeof normalizeCapabilities>;
  readonly preferredRequestHours: number;
  readonly recommendedRequestHours: number;
  readonly unclampedForecastDays: number;
  readonly requiredForecastDays: number;
}): RollingHorizonProviderCoverageRule {
  if (
    input.recommendedRequestHours < input.preferredRequestHours ||
    input.requiredForecastDays < input.unclampedForecastDays
  ) {
    return "provider_max_limited";
  }
  if (input.capabilities.supportsForecastHours) {
    return "forecast_hours_with_buffer";
  }
  return "forecast_days_calendar_coverage";
}

function normalizedBufferHours(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return defaultBufferHours;
  }
  return Math.round(value);
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

function clampByMax(value: number, max: number | undefined): number {
  return max === undefined ? value : Math.min(value, max);
}

function countLocalCalendarDays(start: Date, end: Date, timezone: string): number {
  const startParts = localDateParts(start, timezone);
  const endParts = localDateParts(end, timezone);
  const startNoon = Date.UTC(startParts.year, startParts.month - 1, startParts.day, 12, 0, 0);
  const endNoon = Date.UTC(endParts.year, endParts.month - 1, endParts.day, 12, 0, 0);
  return Math.max(1, Math.round((endNoon - startNoon) / (24 * 60 * 60 * 1000)) + 1);
}

function startOfLocalDay(value: Date | string | number, timezone: string): Date {
  const zoned = TZDate.tz(timezone, toValidDate(value));
  return TZDate.tz(timezone, zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), 0, 0, 0, 0);
}

function endOfForecastDayRequest(start: Date, days: number, timezone: string): Date {
  const startParts = localDateParts(start, timezone);
  const nextDayStart = TZDate.tz(
    timezone,
    startParts.year,
    startParts.month - 1,
    startParts.day + Math.max(1, days),
    0,
    0,
    0,
    0,
  );
  return new Date(nextDayStart.getTime() - 60 * 60 * 1000);
}

function localDateParts(
  value: Date,
  timezone: string,
): { readonly year: number; readonly month: number; readonly day: number } {
  const zoned = TZDate.tz(timezone, value);
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
  };
}

function toValidDate(value: Date | string | number): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid rolling horizon provider coverage time.");
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
