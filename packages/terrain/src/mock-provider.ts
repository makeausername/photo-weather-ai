import type { Coordinates } from "@photo-weather/shared";
import type { ElevationPoint, TerrainProfile, TerrainProvider } from "./types.js";

function sampleElevation(coordinates: Coordinates, index = 0): ElevationPoint {
  return {
    coordinates,
    elevationMeters: 640 + index * 24,
  };
}

export class MockTerrainProvider implements TerrainProvider {
  async getElevation(coordinates: Coordinates): Promise<ElevationPoint> {
    return sampleElevation(coordinates);
  }

  async getElevationBatch(coordinates: readonly Coordinates[]): Promise<readonly ElevationPoint[]> {
    return coordinates.map((coordinate, index) => sampleElevation(coordinate, index));
  }

  async buildTerrainProfile(path: readonly Coordinates[]): Promise<TerrainProfile> {
    const points = await this.getElevationBatch(path);
    const elevations = points.map((point) => point.elevationMeters);

    return {
      points,
      minElevationMeters: Math.min(...elevations),
      maxElevationMeters: Math.max(...elevations),
      ascentMeters: Math.max(0, elevations[elevations.length - 1] ?? 0) - Math.min(...elevations),
      descentMeters: 0,
    };
  }
}
