import type {
  ElevationSample,
  HorizonProfile,
  TerrainAnalysisInput,
  TerrainCoordinate,
  TerrainProfile,
  TerrainProvider,
} from "./types.js";

const disabledMessage =
  "Open-Meteo Elevation 当前默认禁用，不会发起真实外部请求。";

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
