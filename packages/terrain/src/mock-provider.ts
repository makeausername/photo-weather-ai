import type { TerrainDataSource } from "@photo-weather/shared";
import {
  calculateElevationDiff,
  classifyHorizonObstruction,
  classifyTerrainCloudSeaPotential,
  getDirectionZhFromAzimuth,
  validateTerrainCoordinates,
} from "./calculations.js";
import {
  buildSpotTerrainProfile,
  resolveSeedTerrainProfile,
  type TerrainProfileSeed,
} from "./spot-terrain-profiles.js";
import type {
  ElevationSample,
  HorizonProfile,
  TerrainAnalysisInput,
  TerrainAnalysisResult,
  TerrainCoordinate,
  TerrainProfile,
  TerrainProvider,
} from "./types.js";

const mockTerrainDataSource: TerrainDataSource = "mock_terrain";
const mockTerrainDataSourceLabelZh = "演示地形数据";
const mockTerrainHonestyNoteZh =
  "地形信息当前使用基础机位资料和演示地形剖面，正式 DEM 接入后会继续校准云海、白墙和地平线判断。";

export function buildMockTerrainAnalysis(input: TerrainAnalysisInput): TerrainAnalysisResult {
  validateTerrainCoordinates(input.coordinate);

  const seed = resolveSeedTerrainProfile(input);
  const spotProfile = buildSpotTerrainProfile(input);
  const terrainProfile = seed
    ? buildSeededTerrainProfile(seed, input)
    : buildUnknownTerrainProfile(input);
  const horizonProfile = seed ? buildSeededHorizonProfile(seed, input) : buildUnknownHorizonProfile();

  return {
    terrainProfile: {
      ...terrainProfile,
      ...spotProfile,
      locationElevation: terrainProfile.locationElevation,
      elevationMeters: spotProfile.elevationMeters,
      terrainNoteZh: terrainProfile.terrainNoteZh,
    },
    horizonProfile,
    dataSource: mockTerrainDataSource,
    dataSourceLabelZh: mockTerrainDataSourceLabelZh,
    isMock: true,
    honestyNoteZh: mockTerrainHonestyNoteZh,
  };
}

export class MockTerrainProvider implements TerrainProvider {
  async getElevation(coordinate: TerrainCoordinate): Promise<ElevationSample> {
    validateTerrainCoordinates(coordinate);
    const seed = resolveSeedTerrainProfile({ coordinate, locationName: coordinate.name });
    const elevation = seed?.elevationMeters;

    return {
      coordinate,
      elevation: typeof elevation === "number" ? elevation : 0,
      distanceMeters: 0,
      dataSource: mockTerrainDataSource,
    };
  }

  async getElevationBatch(
    coordinates: readonly TerrainCoordinate[],
  ): Promise<readonly ElevationSample[]> {
    return coordinates.map((coordinate, index) => buildSampleForCoordinate(coordinate, index));
  }

  async buildTerrainProfile(input: TerrainAnalysisInput): Promise<TerrainProfile> {
    return buildMockTerrainAnalysis(input).terrainProfile;
  }

  async buildHorizonProfile(input: TerrainAnalysisInput): Promise<HorizonProfile> {
    return buildMockTerrainAnalysis(input).horizonProfile;
  }
}

function buildSeededTerrainProfile(
  seed: TerrainProfileSeed,
  input: TerrainAnalysisInput,
): TerrainProfile {
  const coordinate = input.coordinate;
  const elevation = input.elevationMeters ?? seed.elevationMeters ?? 0;
  const minElevation5km = seed.nearbyValleyElevationMeters ?? seed.minElevation5km;
  const maxElevation5km = Math.max(seed.maxElevation5km, elevation);
  const elevationDiff5km = calculateElevationDiff(maxElevation5km, minElevation5km);
  const potential = classifyTerrainCloudSeaPotential({
    elevationDiff5km,
    locationElevation: elevation,
  });

  return {
    ...seed,
    latitudeWgs84: coordinate.latitude,
    longitudeWgs84: coordinate.longitude,
    latitudeGcj02: input.latitudeGcj02 ?? seed.latitudeGcj02,
    longitudeGcj02: input.longitudeGcj02 ?? seed.longitudeGcj02,
    elevationMeters: elevation,
    locationElevation: elevation,
    minElevation1km: seed.minElevation1km,
    minElevation3km: seed.minElevation3km,
    minElevation5km,
    maxElevation5km,
    avgElevation5km: seed.avgElevation5km,
    elevationDiff5km,
    nearbyValleyElevationMeters: minElevation5km,
    localReliefMeters: elevationDiff5km,
    valleyDirectionZh: seed.valleyDirectionZh,
    ridgeDirectionZh: seed.ridgeDirectionZh,
    terrainCloudSeaPotential: potential,
    terrainNoteZh: `${seed.weatherToneZh} 当前为基础地形剖面，正式 DEM 接入后可进一步校准。`,
    samples: [
      {
        coordinate,
        elevation,
        distanceMeters: 0,
        dataSource: mockTerrainDataSource,
      },
      {
        coordinate: offsetCoordinate(coordinate, 0.009, 0.006),
        elevation: seed.minElevation1km,
        distanceMeters: 1000,
        azimuth: 135,
        directionZh: "东南",
        dataSource: mockTerrainDataSource,
      },
      {
        coordinate: offsetCoordinate(coordinate, -0.018, 0.012),
        elevation: seed.minElevation3km,
        distanceMeters: 3000,
        azimuth: 330,
        directionZh: "西北",
        dataSource: mockTerrainDataSource,
      },
      {
        coordinate: offsetCoordinate(coordinate, 0.031, -0.026),
        elevation: minElevation5km,
        distanceMeters: 5000,
        azimuth: 210,
        directionZh: "西南",
        dataSource: mockTerrainDataSource,
      },
    ],
  };
}

function buildUnknownTerrainProfile(input: TerrainAnalysisInput): TerrainProfile {
  const spotProfile = buildSpotTerrainProfile(input);
  const elevation = spotProfile.elevationMeters ?? 0;
  const note =
    spotProfile.elevationMeters === null
      ? "机位海拔资料不完整，山顶体感仅作参考。"
      : "仅有机位海拔，周边谷地高差、暴露度和遮挡仍需补充。";

  return {
    ...spotProfile,
    locationElevation: elevation,
    minElevation1km: elevation,
    minElevation3km: elevation,
    minElevation5km: elevation,
    maxElevation5km: elevation,
    avgElevation5km: elevation,
    elevationDiff5km: 0,
    nearbyValleyElevationMeters: null,
    localReliefMeters: null,
    terrainCloudSeaPotential: "low",
    terrainNoteZh: note,
    samples: [
      {
        coordinate: input.coordinate,
        elevation,
        distanceMeters: 0,
        dataSource: mockTerrainDataSource,
      },
    ],
  };
}

function buildSeededHorizonProfile(
  seed: TerrainProfileSeed,
  input: TerrainAnalysisInput,
): HorizonProfile {
  const dynamicBlockedDirections = [
    directionForAngle(input.sunriseAzimuth, seed.sunriseHorizonAngle),
    directionForAngle(input.sunsetAzimuth, seed.sunsetHorizonAngle),
    directionForAngle(input.milkyWayAzimuth, seed.milkyWayHorizonAngle),
  ].filter((direction): direction is string => typeof direction === "string");
  const blockedDirectionsZh = Array.from(
    new Set([...seed.blockedDirectionsZh, ...dynamicBlockedDirections]),
  );
  const maxObstruction = Math.max(
    seed.sunriseHorizonAngle,
    seed.sunsetHorizonAngle,
    seed.milkyWayHorizonAngle,
  );
  const obstructionLevel = classifyHorizonObstruction(maxObstruction);
  const obstructionText =
    obstructionLevel === "high" ? "偏高" : obstructionLevel === "medium" ? "中等" : "较低";

  return {
    sunriseHorizonAngle: seed.sunriseHorizonAngle,
    sunsetHorizonAngle: seed.sunsetHorizonAngle,
    milkyWayHorizonAngle: seed.milkyWayHorizonAngle,
    blockedDirectionsZh,
    obstructionNoteZh: `基础地形剖面显示主要方向地平遮挡${obstructionText}，可作为日出日落和银河构图的辅助参考。`,
  };
}

function buildUnknownHorizonProfile(): HorizonProfile {
  return {
    blockedDirectionsZh: [],
    obstructionNoteZh: "当前缺少可靠地平线遮挡资料，日出、日落和银河方向需现场复核。",
  };
}

function directionForAngle(azimuth: number | undefined, horizonAngle: number): string | undefined {
  if (azimuth === undefined || classifyHorizonObstruction(horizonAngle) === "low") {
    return undefined;
  }

  return getDirectionZhFromAzimuth(azimuth);
}

function buildSampleForCoordinate(coordinate: TerrainCoordinate, index: number): ElevationSample {
  validateTerrainCoordinates(coordinate);
  const seed = resolveSeedTerrainProfile({ coordinate, locationName: coordinate.name });
  const elevations = seed
    ? [
        seed.elevationMeters ?? 0,
        seed.minElevation1km,
        seed.minElevation3km,
        seed.minElevation5km,
        seed.maxElevation5km,
      ]
    : [0];

  return {
    coordinate,
    elevation: elevations[index % elevations.length]!,
    distanceMeters: index * 1000,
    dataSource: mockTerrainDataSource,
  };
}

function offsetCoordinate(
  coordinate: TerrainCoordinate,
  latitudeOffset: number,
  longitudeOffset: number,
): TerrainCoordinate {
  return {
    latitude: round6(coordinate.latitude + latitudeOffset),
    longitude: round6(coordinate.longitude + longitudeOffset),
    system: "wgs84",
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
