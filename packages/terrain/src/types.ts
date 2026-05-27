import type {
  Coordinates,
  ElevationConfidence,
  ElevationSource,
  HorizonProfileSummary,
  TerrainAnalysisSummary,
  TerrainDataSource,
  TerrainProfileSummary,
  SpotTerrainProfile,
} from "@photo-weather/shared";

export type TerrainCoordinate = Coordinates & {
  readonly name?: string;
};

export type ElevationSample = {
  readonly coordinate: TerrainCoordinate;
  readonly elevation: number | null;
  readonly distanceMeters?: number;
  readonly azimuth?: number;
  readonly directionZh?: string;
  readonly dataSource: TerrainDataSource;
};

export type TerrainProfile = TerrainProfileSummary & {
  readonly samples: readonly ElevationSample[];
};

export type HorizonProfile = HorizonProfileSummary;

export type TerrainAnalysisInput = {
  readonly coordinate: TerrainCoordinate;
  readonly locationName?: string;
  readonly latitudeGcj02?: number;
  readonly longitudeGcj02?: number;
  readonly elevationMeters?: number | null;
  readonly elevationSource?: ElevationSource;
  readonly elevationConfidence?: ElevationConfidence;
  readonly terrainProfile?: SpotTerrainProfile;
  readonly sunriseAzimuth?: number;
  readonly sunsetAzimuth?: number;
  readonly milkyWayAzimuth?: number;
};

export type TerrainAnalysisResult = Omit<TerrainAnalysisSummary, "terrainProfile"> & {
  readonly terrainProfile: TerrainProfile;
};

export type TerrainProvider = {
  getElevation(coordinate: TerrainCoordinate): Promise<ElevationSample>;
  getElevationBatch(coordinates: readonly TerrainCoordinate[]): Promise<readonly ElevationSample[]>;
  buildTerrainProfile(input: TerrainAnalysisInput): Promise<TerrainProfile>;
  buildHorizonProfile(input: TerrainAnalysisInput): Promise<HorizonProfile>;
};
