import type { TerrainCloudSeaPotential } from "@photo-weather/shared";
import type { TerrainCoordinate } from "./types.js";

export type HorizonObstructionLevel = "low" | "medium" | "high";

export function calculateElevationDiff(maxElevation: number, minElevation: number): number {
  if (!Number.isFinite(maxElevation) || !Number.isFinite(minElevation)) {
    throw new Error("地形海拔值必须是有效数字。");
  }

  return Math.max(0, Math.round(maxElevation - minElevation));
}

export function classifyTerrainCloudSeaPotential(input: {
  readonly elevationDiff5km: number;
  readonly locationElevation?: number;
}): TerrainCloudSeaPotential {
  const elevationDiff5km = input.elevationDiff5km;
  const locationElevation = input.locationElevation ?? 0;

  if (!Number.isFinite(elevationDiff5km) || elevationDiff5km < 0) {
    throw new Error("周边5公里高差必须是非负有效数字。");
  }

  if (elevationDiff5km >= 900 && locationElevation >= 1200) {
    return "high";
  }

  if (elevationDiff5km >= 450 || (elevationDiff5km >= 320 && locationElevation >= 1500)) {
    return "medium";
  }

  return "low";
}

export function classifyHorizonObstruction(horizonAngle: number | undefined): HorizonObstructionLevel {
  if (horizonAngle === undefined) {
    return "low";
  }

  if (!Number.isFinite(horizonAngle)) {
    throw new Error("地平遮挡角必须是有效数字。");
  }

  if (horizonAngle >= 12) {
    return "high";
  }
  if (horizonAngle >= 7) {
    return "medium";
  }
  return "low";
}

export function getDirectionZhFromAzimuth(azimuth: number): string {
  if (!Number.isFinite(azimuth)) {
    throw new Error("方位角必须是有效数字。");
  }

  const normalized = ((azimuth % 360) + 360) % 360;
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"] as const;
  const index = Math.round(normalized / 45) % directions.length;

  return directions[index]!;
}

export function validateTerrainCoordinates(coordinate: TerrainCoordinate): void {
  const issues: string[] = [];

  if (coordinate.system !== "wgs84") {
    issues.push("地形计算必须使用 WGS84 坐标");
  }
  if (!Number.isFinite(coordinate.latitude) || coordinate.latitude < -90 || coordinate.latitude > 90) {
    issues.push("纬度必须在 -90 到 90 之间");
  }
  if (
    !Number.isFinite(coordinate.longitude) ||
    coordinate.longitude < -180 ||
    coordinate.longitude > 180
  ) {
    issues.push("经度必须在 -180 到 180 之间");
  }

  if (issues.length > 0) {
    throw new Error(`地形坐标不合法：${issues.join("；")}`);
  }
}
