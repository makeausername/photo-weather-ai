import type { Coordinates } from "@photo-weather/shared";

export type ElevationPoint = {
  readonly coordinates: Coordinates;
  readonly elevationMeters: number;
};

export type TerrainProfile = {
  readonly points: readonly ElevationPoint[];
  readonly minElevationMeters: number;
  readonly maxElevationMeters: number;
  readonly ascentMeters: number;
  readonly descentMeters: number;
};

export type TerrainProvider = {
  getElevation(coordinates: Coordinates): Promise<ElevationPoint>;
  getElevationBatch(coordinates: readonly Coordinates[]): Promise<readonly ElevationPoint[]>;
  buildTerrainProfile(path: readonly Coordinates[]): Promise<TerrainProfile>;
};
