import type { ElevationConfidence, ExposureType, TerrainMode, TerrainType } from "./types.js";

export type TerrainModeInput = {
  readonly elevationMeters?: number | null;
  readonly locationElevation?: number | null;
  readonly nearbyValleyElevationMeters?: number | null;
  readonly localReliefMeters?: number | null;
  readonly elevationDiff5km?: number | null;
  readonly terrainType?: TerrainType;
  readonly exposureType?: ExposureType;
  readonly elevationConfidence?: ElevationConfidence;
};

export function classifyTerrainMode(input: TerrainModeInput): TerrainMode {
  const elevation = finiteNumber(input.locationElevation) ?? finiteNumber(input.elevationMeters);
  const nearbyValleyElevation = finiteNumber(input.nearbyValleyElevationMeters);
  const relief =
    finiteNumber(input.localReliefMeters) ??
    finiteNumber(input.elevationDiff5km) ??
    (elevation !== undefined && nearbyValleyElevation !== undefined
      ? elevation - nearbyValleyElevation
      : undefined);
  const terrainType = input.terrainType ?? "unknown";
  const strongRelief = relief !== undefined && relief >= 500;
  const ridgeOrSummit = terrainType === "summit" || terrainType === "ridge";

  if (elevation === undefined && relief === undefined) {
    return "unknown";
  }

  if ((elevation !== undefined && elevation >= 1200) || (ridgeOrSummit && strongRelief)) {
    return "high_mountain";
  }

  if (
    (elevation !== undefined && elevation >= 700) ||
    strongRelief ||
    (terrainType === "mountain_platform" && relief !== undefined && relief >= 300)
  ) {
    return "mountain";
  }

  if ((elevation !== undefined && elevation >= 300) || (relief !== undefined && relief >= 200)) {
    return "hill";
  }

  if (terrainType === "city" || terrainType === "lake" || terrainType === "valley") {
    return "urban_or_plain";
  }

  return "lowland";
}

export function terrainModeUsesMountainSemantics(mode: TerrainMode): boolean {
  return mode === "high_mountain" || mode === "mountain";
}

export function terrainModeUsesLowlandSemantics(mode: TerrainMode): boolean {
  return mode === "lowland" || mode === "urban_or_plain" || mode === "unknown";
}

export function terrainModeAllowsDefaultCloudSea(mode: TerrainMode): boolean {
  return mode === "high_mountain" || mode === "mountain";
}

export function terrainModeLabelZh(mode: TerrainMode): string {
  switch (mode) {
    case "high_mountain":
      return "高山";
    case "mountain":
      return "山地";
    case "hill":
      return "丘陵";
    case "lowland":
      return "低海拔";
    case "urban_or_plain":
      return "城市/平原";
    default:
      return "地形未确认";
  }
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
