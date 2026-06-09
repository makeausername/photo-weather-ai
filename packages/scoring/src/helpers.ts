import {
  formatLocalTimeRange,
  type ForecastHorizon,
  type NormalizedHourlyWeather,
} from "@photo-weather/shared";
import {
  addHoursInTimezone,
  defaultTimezone,
  getForecastHorizonHours,
} from "@photo-weather/calendar";

export type WeightedScore = {
  readonly score: number;
  readonly weight: number;
};

const oneHourMs = 60 * 60 * 1000;

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

export function averageWeightedScore(items: readonly WeightedScore[]): number {
  const usableItems = items.filter((item) => item.weight > 0);
  const totalWeight = usableItems.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0) {
    return 0;
  }

  const weightedTotal = usableItems.reduce(
    (sum, item) => sum + clampScore(item.score) * item.weight,
    0,
  );

  return clampScore(weightedTotal / totalWeight);
}

export function getHorizonHours(horizon: ForecastHorizon): number {
  return getForecastHorizonHours(horizon);
}

export function getWeatherWindowAroundTime(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  targetTime: string | undefined,
  beforeHours = 1,
  afterHours = 2,
): readonly NormalizedHourlyWeather[] {
  if (!targetTime) {
    return [];
  }

  const targetMs = Date.parse(targetTime);
  if (!Number.isFinite(targetMs)) {
    return [];
  }

  const startMs = targetMs - beforeHours * oneHourMs;
  const endMs = targetMs + afterHours * oneHourMs;

  return hourlyWeather.filter((hour) => {
    const hourMs = Date.parse(hour.time);
    return Number.isFinite(hourMs) && hourMs >= startMs && hourMs <= endMs;
  });
}

export function formatChineseTimeRange(
  startTime: string,
  endTime: string,
  timezone = defaultTimezone,
): string {
  if (!Number.isFinite(Date.parse(startTime)) || !Number.isFinite(Date.parse(endTime))) {
    return `${startTime}–${endTime}`;
  }

  return formatLocalTimeRange(startTime, endTime, timezone);
}

export function averageHourly(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  selector: (hour: NormalizedHourlyWeather) => number | null | undefined,
): number {
  const values = hourlyWeather
    .map((hour) => selector(hour))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function pickHighestScoredHour(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  scoreHour: (hour: NormalizedHourlyWeather) => number,
): NormalizedHourlyWeather | undefined {
  return hourlyWeather.reduce<NormalizedHourlyWeather | undefined>((best, hour) => {
    if (!best) {
      return hour;
    }

    return scoreHour(hour) > scoreHour(best) ? hour : best;
  }, undefined);
}

export function addHours(time: string, hours: number): string {
  if (!Number.isFinite(Date.parse(time))) {
    return time;
  }

  return addHoursInTimezone(time, hours, defaultTimezone);
}
