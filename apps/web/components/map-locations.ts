import { gcj02ToWgs84, wgs84ToGcj02 } from "@photo-weather/geo";
import type { SelectedLocation } from "./selected-location";

export type MapPoint = { latitude: number; longitude: number };
export function mapPoint(location: SelectedLocation, provider: "osm" | "amap"): MapPoint {
  const point = {
    latitude: location.latitudeWgs84,
    longitude: location.longitudeWgs84,
    system: "wgs84" as const,
  };
  return provider === "amap" ? wgs84ToGcj02(point) : point;
}
export function locationFromMap(point: MapPoint, provider: "osm" | "amap"): SelectedLocation {
  const normalized = { ...point, longitude: ((((point.longitude + 180) % 360) + 360) % 360) - 180 };
  const wgs = provider === "amap" ? gcj02ToWgs84({ ...normalized, system: "gcj02" }) : normalized;
  const name = `地图选点 ${wgs.latitude.toFixed(3)}, ${wgs.longitude.toFixed(3)}`;
  return {
    id: `map:${wgs.latitude.toFixed(5)},${wgs.longitude.toFixed(5)}`,
    name,
    displayName: name,
    source: "manual",
    originalSource: provider === "amap" ? "amap" : "manual",
    latitudeWgs84: wgs.latitude,
    longitudeWgs84: wgs.longitude,
    ...(provider === "amap"
      ? { latitudeGcj02: normalized.latitude, longitudeGcj02: normalized.longitude }
      : {}),
    dataStatus: "pending",
    coordinateSource: provider === "amap" ? "高德选点 · 已转为 WGS84" : "地图选点 · WGS84",
  };
}

export function groupNearbyPins<T>(
  items: readonly T[],
  project: (item: T) => { x: number; y: number },
) {
  const groups: { x: number; y: number; members: T[] }[] = [];
  for (const item of items) {
    const point = project(item);
    const group = groups.find((g) => Math.hypot(g.x - point.x, g.y - point.y) < 44);
    if (group) group.members.push(item);
    else groups.push({ ...point, members: [item] });
  }
  return groups;
}
