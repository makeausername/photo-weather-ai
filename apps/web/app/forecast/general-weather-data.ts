import type {
  ProfessionalHourlyDataPoint as WeatherHour,
  ProfessionalHourlyDataTimeBasis,
} from "@photo-weather/shared";

export const finiteWeatherValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export function weatherDateKey(time: string, timezone: string): string {
  if (!Number.isFinite(Date.parse(time))) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  return ["year", "month", "day"].map((key) => parts.find((p) => p.type === key)?.value).join("-");
}
export function weatherDates(rows: readonly WeatherHour[], timezone: string) {
  return [...new Set(rows.map((row) => weatherDateKey(row.time, timezone)).filter(Boolean))];
}
export function weatherRowsForDate(rows: readonly WeatherHour[], date: string, timezone: string) {
  return date === "all" ? rows : rows.filter((row) => weatherDateKey(row.time, timezone) === date);
}
export function summarizeWeatherHours(
  rows: readonly WeatherHour[],
  basis?: ProfessionalHourlyDataTimeBasis | null,
) {
  const values = (key: keyof WeatherHour) => rows.map((row) => row[key]).filter(finiteWeatherValue);
  const min = (key: keyof WeatherHour) => {
    const v = values(key);
    return v.length ? Math.min(...v) : null;
  };
  const max = (key: keyof WeatherHour) => {
    const v = values(key);
    return v.length ? Math.max(...v) : null;
  };
  const amountValues = values("precipitationAmountMm");
  const probabilityValues = values("precipitationProbabilityPercent");
  const stepMs = (basis?.stepMinutes ?? 60) * 60_000;
  const continuous = rows.every(
    (row, index) =>
      index === 0 || Date.parse(row.time) - Date.parse(rows[index - 1]!.time) === stepMs,
  );
  const complete =
    rows.length > 0 &&
    continuous &&
    amountValues.length === rows.length &&
    probabilityValues.length === rows.length;
  const rainHours = rows.filter(
    (row) => (row.precipitationAmountMm ?? 0) > 0 || (row.precipitationProbabilityPercent ?? 0) > 0,
  );
  return {
    minTemperature: min("displayedTemperatureC"),
    maxTemperature: max("displayedTemperatureC"),
    maxWind: max("windSpeedMs"),
    maxGust: max("windGustMs"),
    minVisibility: min("visibilityMeters"),
    amount: amountValues.length ? amountValues.reduce((sum, value) => sum + value, 0) : null,
    probabilityInconsistent: rows.some(
      (row) => (row.precipitationAmountMm ?? 0) > 0 && row.precipitationProbabilityPercent === 0,
    ),
    maxProbability: max("precipitationProbabilityPercent"),
    complete,
    amountComplete: rows.length > 0 && continuous && amountValues.length === rows.length,
    rainHours,
    rainLabel: rainHours.length ? "有降水信号" : complete ? "暂无降水信号" : "降水数据不完整",
  };
}

/** Only explicit adverse statements become blocker badges; a mention of a variable is not a risk. */
export function weatherBlockerLabels(blockers: readonly string[]): string[] {
  const text = blockers.filter((item) => !/暂未构成|无明显|没有|暂无|未见/.test(item)).join(" ");
  return [
    /低云[^。；]*(?:偏多|偏高|阻|遮|过多|可见性较差)/.test(text) ? "低云偏多" : "",
    /(?:总云|云量|云层|厚云)[^。；]*(?:偏高|偏多|过多|遮挡|压制|不可见)/.test(text)
      ? "云量偏高"
      : "",
    /降水(?:干扰|信号|明显|偏强|风险(?:较高|偏高|高|中))|预计降水\s*[1-9]|(?:中|大|暴)(?:雨|雪)/.test(
      text,
    )
      ? "降水干扰"
      : "",
    /(?:通透度?|能见度)[^。；]*(?:不足|偏低|较低|偏差|透明度不足)|霾偏重|雾遮挡|雾霾信号/.test(text)
      ? "通透度不足"
      : "",
    /月光(?:偏强|影响|干扰)/.test(text) ? "月光影响" : "",
    /结露风险|露水风险|湿度偏高/.test(text) ? "露水风险" : "",
  ].filter(Boolean);
}
