import type { ForecastCalculationResult, ProfessionalHourlyDataPoint } from "@photo-weather/shared";
import { parseRecentSelectedLocation, type SelectedLocation } from "./selected-location";
import { weatherDateKey } from "../app/forecast/general-weather-data";

export const freeStorageKey = "zhuguang-free-locations:v1";
export type LocalWeatherLibrary = { recent: SelectedLocation[]; favorites: SelectedLocation[] };
export const emptyLibrary: LocalWeatherLibrary = { recent: [], favorites: [] };
export function parseLocalLibrary(raw: string | null): LocalWeatherLibrary {
  try {
    const value = JSON.parse(raw ?? "null");
    const valid = (items: unknown) =>
      Array.isArray(items)
        ? items
            .slice(0, 20)
            .map((item) => parseRecentSelectedLocation(JSON.stringify(item)))
            .filter((item): item is SelectedLocation =>
              Boolean(
                item && Math.abs(item.latitudeWgs84) <= 90 && Math.abs(item.longitudeWgs84) <= 180,
              ),
            )
        : [];
    return { recent: valid(value?.recent), favorites: valid(value?.favorites) };
  } catch {
    return { recent: [], favorites: [] };
  }
}
export const presetLocations: readonly SelectedLocation[] = [
  {
    name: "老君山金顶",
    lat: 33.7852,
    lng: 111.6402,
    gcjLat: 33.7867,
    gcjLng: 111.6462,
    elevation: 2190,
    province: "河南",
    city: "洛阳",
  },
  {
    name: "黄山光明顶",
    lat: 30.1328,
    lng: 118.171,
    gcjLat: 30.1351,
    gcjLng: 118.1767,
    elevation: 1860,
    province: "安徽",
    city: "黄山",
  },
  {
    name: "三清山女神峰",
    lat: 28.9139,
    lng: 118.0699,
    gcjLat: 28.9169,
    gcjLng: 118.0751,
    elevation: 1600,
    province: "江西",
    city: "上饶",
  },
].map((item) => ({
  id: `preset:${item.name}`,
  name: item.name,
  displayName: item.name,
  source: "manual",
  originalSource: "local_preset",
  latitudeWgs84: item.lat,
  longitudeWgs84: item.lng,
  latitudeGcj02: item.gcjLat,
  longitudeGcj02: item.gcjLng,
  elevationMeters: item.elevation,
  elevationSource: "manual",
  elevationConfidence: "low",
  dataStatus: "pending",
  coordinateSource: "示例坐标，仅供参考",
  province: item.province,
  city: item.city,
}));
export function locationKey(location: SelectedLocation) {
  return `${location.latitudeWgs84.toFixed(5)},${location.longitudeWgs84.toFixed(5)}`;
}
export function clusterMapPlaces(places: readonly SelectedLocation[]) {
  const minLat = Math.min(...places.map((p) => p.latitudeWgs84)) - 1;
  const maxLat = Math.max(...places.map((p) => p.latitudeWgs84)) + 1;
  const minLng = Math.min(...places.map((p) => p.longitudeWgs84)) - 1;
  const maxLng = Math.max(...places.map((p) => p.longitudeWgs84)) + 1;
  const groups: { x: number; y: number; members: { place: SelectedLocation; number: number }[] }[] =
    [];
  places.forEach((place, index) => {
    const x = 10 + (80 * (place.longitudeWgs84 - minLng)) / (maxLng - minLng);
    const y = 12 + (70 * (maxLat - place.latitudeWgs84)) / (maxLat - minLat);
    const group = groups.find((g) => Math.abs(g.x - x) < 19 && Math.abs(g.y - y) < 25);
    if (group) group.members.push({ place, number: index + 1 });
    else groups.push({ x, y, members: [{ place, number: index + 1 }] });
  });
  return groups;
}
export function addRecent(
  library: LocalWeatherLibrary,
  location: SelectedLocation,
): LocalWeatherLibrary {
  return {
    ...library,
    recent: [
      location,
      ...library.recent.filter((item) => locationKey(item) !== locationKey(location)),
    ].slice(0, 12),
  };
}
export function toggleFavorite(
  library: LocalWeatherLibrary,
  location: SelectedLocation,
): LocalWeatherLibrary {
  const has = library.favorites.some((item) => locationKey(item) === locationKey(location));
  return {
    ...library,
    favorites: has
      ? library.favorites.filter((item) => locationKey(item) !== locationKey(location))
      : [location, ...library.favorites].slice(0, 20),
  };
}
export function formatWeatherNumber(value: number | null | undefined, unit = "", precision = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Number(value.toFixed(precision))}${unit}`
    : "—";
}
export function localTime(value: string | undefined, timezone = "Asia/Shanghai") {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
export function localWindow(start: string | undefined, end: string | undefined, timezone: string) {
  if (!start || !end) return "暂无可用窗口";
  return `${localTime(start, timezone)}–${weatherDateKey(start, timezone) !== weatherDateKey(end, timezone) ? "次日 " : ""}${localTime(end, timezone)}`;
}
export function hoursForDate(
  result: ForecastCalculationResult,
  date: string,
  night = false,
): readonly ProfessionalHourlyDataPoint[] {
  const tz = result.calendarBasis.timezone;
  return (result.professionalHourlyData ?? []).filter((row) => {
    if (!night) return weatherDateKey(row.time, tz) === date;
    const day = weatherDateKey(row.time, tz),
      hour = Number(localTime(row.time, tz).slice(0, 2));
    return (day === date && hour >= 12) || (day === nextDate(date) && hour < 12);
  });
}
export function averageField(
  rows: readonly ProfessionalHourlyDataPoint[],
  key: keyof ProfessionalHourlyDataPoint,
): number | null {
  const values = rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
export function scoreAvailable(result: ForecastCalculationResult) {
  return (
    !result.isMock &&
    result.weatherDataMode === "real" &&
    result.weatherEvidenceStatus !== "insufficient"
  );
}

export function glowScore(
  result: ForecastCalculationResult,
  date: string,
  phase: "sunrise" | "sunset",
): number | undefined {
  const window = result.glowAnalysis.canonicalWindows.find(
    (item) => item.date === date && item.phase === phase,
  );
  return scoreAvailable(result) && window && !window.unavailableReason
    ? window.practicalSuitabilityScore
    : undefined;
}
export function nextDate(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
}
export function nightEvent(
  result: ForecastCalculationResult,
  date: string,
  field: "moonset" | "astronomicalDawn",
): string | undefined {
  const tz = result.calendarBasis.timezone;
  return result.astroSummaries
    .filter((day) => day.date === date || day.date === nextDate(date))
    .map((day) => day[field])
    .filter((value): value is string => Boolean(value))
    .find((value) => {
      const day = weatherDateKey(value, tz),
        hour = Number(localTime(value, tz).slice(0, 2));
      return (day === date && hour >= 12) || (day === nextDate(date) && hour < 12);
    });
}
export function nightTime(value: string | undefined, date: string, timezone: string) {
  return value
    ? `${weatherDateKey(value, timezone) !== date ? "次日 " : ""}${localTime(value, timezone)}`
    : "—";
}
