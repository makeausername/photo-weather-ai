import type { ForecastHorizon, NormalizedHourlyWeather } from "@photo-weather/shared";

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
  switch (horizon) {
    case "24h":
      return 24;
    case "48h":
      return 48;
    case "72h":
      return 72;
    case "7d":
      return 168;
  }
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

export function formatChineseTimeRange(startTime: string, endTime: string): string {
  const start = toShanghaiParts(startTime);
  const end = toShanghaiParts(endTime);

  if (!start || !end) {
    return `${startTime} 至 ${endTime}`;
  }

  const startDate = `${start.month}月${start.day}日`;
  const startClock = `${pad2(start.hour)}:${pad2(start.minute)}`;
  const endClock = `${pad2(end.hour)}:${pad2(end.minute)}`;

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return `${startDate} ${startClock}-${endClock}`;
  }

  return `${startDate} ${startClock} 至 ${end.month}月${end.day}日 ${endClock}`;
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
  const timestamp = Date.parse(time);
  if (!Number.isFinite(timestamp)) {
    return time;
  }

  return new Date(timestamp + hours * oneHourMs).toISOString();
}

function toShanghaiParts(value: string):
  | {
      readonly year: number;
      readonly month: number;
      readonly day: number;
      readonly hour: number;
      readonly minute: number;
    }
  | undefined {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  const shifted = new Date(timestamp + 8 * oneHourMs);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
