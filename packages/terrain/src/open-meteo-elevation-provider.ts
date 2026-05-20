import type {
  ElevationSample,
  HorizonProfile,
  TerrainAnalysisInput,
  TerrainCoordinate,
  TerrainProfile,
  TerrainProvider,
} from "./types.js";

const disabledMessage =
  "Open-Meteo Elevation Provider 仍是 Terrain Core V1 占位，当前默认禁用且不会发起真实外部请求。";

export class OpenMeteoElevationProvider implements TerrainProvider {
  async getElevation(_coordinate: TerrainCoordinate): Promise<ElevationSample> {
    throw new Error(disabledMessage);
  }

  async getElevationBatch(_coordinates: readonly TerrainCoordinate[]): Promise<readonly ElevationSample[]> {
    throw new Error(disabledMessage);
  }

  async buildTerrainProfile(_input: TerrainAnalysisInput): Promise<TerrainProfile> {
    throw new Error(disabledMessage);
  }

  async buildHorizonProfile(_input: TerrainAnalysisInput): Promise<HorizonProfile> {
    throw new Error(disabledMessage);
  }
}
