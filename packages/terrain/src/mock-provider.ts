import type { TerrainDataSource } from "@photo-weather/shared";
import {
  calculateElevationDiff,
  classifyHorizonObstruction,
  classifyTerrainCloudSeaPotential,
  getDirectionZhFromAzimuth,
  validateTerrainCoordinates,
} from "./calculations.js";
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
const mockTerrainDataSourceLabelZh = "本地模拟地形数据";
const mockTerrainHonestyNoteZh = "地形数据：本地模拟地形数据，真实 DEM / 海拔数据将在后续接入。";

type MockTerrainSeed = {
  readonly key: string;
  readonly names: readonly string[];
  readonly coordinate: TerrainCoordinate;
  readonly locationElevation: number;
  readonly minElevation1km: number;
  readonly minElevation3km: number;
  readonly minElevation5km: number;
  readonly maxElevation5km: number;
  readonly avgElevation5km: number;
  readonly valleyDirectionZh: string;
  readonly ridgeDirectionZh: string;
  readonly sunriseHorizonAngle: number;
  readonly sunsetHorizonAngle: number;
  readonly milkyWayHorizonAngle: number;
  readonly blockedDirectionsZh: readonly string[];
  readonly weatherToneZh: string;
};

const mockTerrainSeeds: readonly MockTerrainSeed[] = [
  {
    key: "huangshan-guangmingding",
    names: ["黄山光明顶", "黄山"],
    coordinate: { latitude: 30.1328, longitude: 118.171, system: "wgs84" },
    locationElevation: 1860,
    minElevation1km: 980,
    minElevation3km: 520,
    minElevation5km: 380,
    maxElevation5km: 1864,
    avgElevation5km: 1125,
    valleyDirectionZh: "东南",
    ridgeDirectionZh: "西北-东南",
    sunriseHorizonAngle: 4.8,
    sunsetHorizonAngle: 5.5,
    milkyWayHorizonAngle: 7.2,
    blockedDirectionsZh: ["西北", "东北"],
    weatherToneZh: "山顶与周边谷地高差明显，清晨低云若落在谷地更容易形成云海边界。",
  },
  {
    key: "laojunshan-jinding",
    names: ["老君山金顶", "老君山"],
    coordinate: { latitude: 33.7852, longitude: 111.6402, system: "wgs84" },
    locationElevation: 2190,
    minElevation1km: 1280,
    minElevation3km: 780,
    minElevation5km: 560,
    maxElevation5km: 2217,
    avgElevation5km: 1390,
    valleyDirectionZh: "西南",
    ridgeDirectionZh: "西北-东南",
    sunriseHorizonAngle: 6.2,
    sunsetHorizonAngle: 7.4,
    milkyWayHorizonAngle: 9.1,
    blockedDirectionsZh: ["西南", "西北"],
    weatherToneZh: "高海拔山脊与低处谷地落差较大，云海判断应同时关注强风和低云厚度。",
  },
  {
    key: "sanqingshan-nvshenfeng",
    names: ["三清山女神峰", "三清山"],
    coordinate: { latitude: 28.9139, longitude: 118.0699, system: "wgs84" },
    locationElevation: 1600,
    minElevation1km: 870,
    minElevation3km: 510,
    minElevation5km: 410,
    maxElevation5km: 1819,
    avgElevation5km: 1040,
    valleyDirectionZh: "东北",
    ridgeDirectionZh: "南北向峰林",
    sunriseHorizonAngle: 8.4,
    sunsetHorizonAngle: 6.5,
    milkyWayHorizonAngle: 10.8,
    blockedDirectionsZh: ["东", "东北"],
    weatherToneZh: "峰林遮挡和局部谷地并存，云海潜力较好，但视线方向更依赖具体机位。",
  },
  {
    key: "wugongshan-jinding",
    names: ["武功山金顶", "武功山"],
    coordinate: { latitude: 27.4716, longitude: 114.1808, system: "wgs84" },
    locationElevation: 1918,
    minElevation1km: 1120,
    minElevation3km: 720,
    minElevation5km: 610,
    maxElevation5km: 1918,
    avgElevation5km: 1260,
    valleyDirectionZh: "东南",
    ridgeDirectionZh: "东北-西南",
    sunriseHorizonAngle: 3.7,
    sunsetHorizonAngle: 4.6,
    milkyWayHorizonAngle: 5.9,
    blockedDirectionsZh: ["北"],
    weatherToneZh: "高山草甸视野较开阔，周边谷地高差可为云海和夜间地平线判断提供参考。",
  },
];

const defaultSeed = mockTerrainSeeds[0]!;

export function buildMockTerrainAnalysis(input: TerrainAnalysisInput): TerrainAnalysisResult {
  validateTerrainCoordinates(input.coordinate);

  const seed = resolveSeed(input);
  const terrainProfile = buildMockTerrainProfile(seed, input.coordinate);
  const horizonProfile = buildMockHorizonProfile(seed, input);

  return {
    terrainProfile,
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
    const seed = resolveSeed({ coordinate, locationName: coordinate.name });

    return {
      coordinate,
      elevation: seed.locationElevation,
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

function buildMockTerrainProfile(
  seed: MockTerrainSeed,
  coordinate: TerrainCoordinate,
): TerrainProfile {
  const elevationDiff5km = calculateElevationDiff(seed.maxElevation5km, seed.minElevation5km);
  const potential = classifyTerrainCloudSeaPotential({
    elevationDiff5km,
    locationElevation: seed.locationElevation,
  });

  return {
    locationElevation: seed.locationElevation,
    minElevation1km: seed.minElevation1km,
    minElevation3km: seed.minElevation3km,
    minElevation5km: seed.minElevation5km,
    maxElevation5km: seed.maxElevation5km,
    avgElevation5km: seed.avgElevation5km,
    elevationDiff5km,
    valleyDirectionZh: seed.valleyDirectionZh,
    ridgeDirectionZh: seed.ridgeDirectionZh,
    terrainCloudSeaPotential: potential,
    terrainNoteZh: `${seed.weatherToneZh} 当前为本地模拟地形，不代表真实 DEM。`,
    samples: [
      {
        coordinate,
        elevation: seed.locationElevation,
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
        elevation: seed.minElevation5km,
        distanceMeters: 5000,
        azimuth: 210,
        directionZh: "西南",
        dataSource: mockTerrainDataSource,
      },
    ],
  };
}

function buildMockHorizonProfile(
  seed: MockTerrainSeed,
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
    obstructionNoteZh: `本地模拟地形显示主要方向地平遮挡${obstructionText}，只能作为日出日落和银河构图的辅助参考。`,
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
  const seed = resolveSeed({ coordinate, locationName: coordinate.name });
  const elevationSteps = [
    seed.locationElevation,
    seed.minElevation1km,
    seed.minElevation3km,
    seed.minElevation5km,
    seed.maxElevation5km,
  ];

  return {
    coordinate,
    elevation: elevationSteps[index % elevationSteps.length]!,
    distanceMeters: index * 1000,
    dataSource: mockTerrainDataSource,
  };
}

function resolveSeed(input: Pick<TerrainAnalysisInput, "coordinate" | "locationName">): MockTerrainSeed {
  const normalizedName = input.locationName?.trim() ?? "";
  if (normalizedName.length > 0) {
    const byName = mockTerrainSeeds.find((seed) =>
      seed.names.some((name) => normalizedName.includes(name) || name.includes(normalizedName)),
    );
    if (byName) {
      return byName;
    }
  }

  const byCoordinate = mockTerrainSeeds.find(
    (seed) =>
      Math.abs(seed.coordinate.latitude - input.coordinate.latitude) <= 0.08 &&
      Math.abs(seed.coordinate.longitude - input.coordinate.longitude) <= 0.08,
  );

  return byCoordinate ?? defaultSeed;
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
