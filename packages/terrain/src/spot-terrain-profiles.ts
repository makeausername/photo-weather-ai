import type {
  ElevationConfidence,
  ElevationSource,
  ExposureType,
  SpotTerrainProfile,
  TerrainType,
  TerrainViewingDirection,
} from "@photo-weather/shared";
import type { TerrainAnalysisInput, TerrainCoordinate } from "./types.js";

export type TerrainProfileSeed = SpotTerrainProfile & {
  readonly key: string;
  readonly names: readonly string[];
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

export const terrainProfileSeeds: readonly TerrainProfileSeed[] = [
  {
    key: "huangshan-guangmingding",
    names: ["黄山光明顶", "黄山"],
    latitudeWgs84: 30.1328,
    longitudeWgs84: 118.171,
    latitudeGcj02: 30.1351,
    longitudeGcj02: 118.1767,
    elevationMeters: 1860,
    elevationSource: "manual",
    elevationConfidence: "high",
    terrainType: "summit",
    exposureType: "exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 380,
    localReliefMeters: 1484,
    terrainNotesZh: "山顶平台与周边谷地高差明显，清晨低云落在谷地时更容易形成云海边界。",
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
    latitudeWgs84: 33.7852,
    longitudeWgs84: 111.6402,
    latitudeGcj02: 33.7867,
    longitudeGcj02: 111.6462,
    elevationMeters: 2190,
    elevationSource: "manual",
    elevationConfidence: "high",
    terrainType: "summit",
    exposureType: "exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 560,
    localReliefMeters: 1657,
    terrainNotesZh: "高海拔山脊与低处谷地落差较大，云海判断应同时关注强风和低云厚度。",
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
    latitudeWgs84: 28.9139,
    longitudeWgs84: 118.0699,
    latitudeGcj02: 28.9169,
    longitudeGcj02: 118.0751,
    elevationMeters: 1600,
    elevationSource: "manual",
    elevationConfidence: "medium",
    terrainType: "ridge",
    exposureType: "semi_exposed",
    viewingDirection: "east",
    nearbyValleyElevationMeters: 410,
    localReliefMeters: 1409,
    terrainNotesZh: "峰林遮挡和局部谷地并存，视线方向更依赖具体机位。",
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
    latitudeWgs84: 27.4716,
    longitudeWgs84: 114.1808,
    latitudeGcj02: 27.4748,
    longitudeGcj02: 114.1859,
    elevationMeters: 1918,
    elevationSource: "manual",
    elevationConfidence: "high",
    terrainType: "ridge",
    exposureType: "exposed",
    viewingDirection: "panoramic",
    nearbyValleyElevationMeters: 610,
    localReliefMeters: 1308,
    terrainNotesZh: "高山草甸视野较开阔，周边谷地高差可为云海和夜间地平线判断提供参考。",
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

export function resolveSeedTerrainProfile(
  input: Pick<TerrainAnalysisInput, "coordinate" | "locationName">,
): TerrainProfileSeed | undefined {
  const normalizedName = input.locationName?.trim() ?? "";
  if (normalizedName.length > 0) {
    const byName = terrainProfileSeeds.find((seed) =>
      seed.names.some((name) => normalizedName.includes(name) || name.includes(normalizedName)),
    );
    if (byName) {
      return byName;
    }
  }

  return terrainProfileSeeds.find(
    (seed) =>
      Math.abs(seed.latitudeWgs84 - input.coordinate.latitude) <= 0.08 &&
      Math.abs(seed.longitudeWgs84 - input.coordinate.longitude) <= 0.08,
  );
}

export function buildSpotTerrainProfile(input: TerrainAnalysisInput): SpotTerrainProfile {
  if (input.terrainProfile) {
    return input.terrainProfile;
  }

  const seed = resolveSeedTerrainProfile(input);
  if (seed) {
    return pickSpotTerrainProfile(seed);
  }

  const manualElevation = finiteElevation(input.elevationMeters);
  const elevationSource =
    input.elevationSource ?? (manualElevation === null ? "unknown" : "manual");
  const elevationConfidence =
    input.elevationConfidence ?? (manualElevation === null ? "low" : "medium");
  return {
    latitudeWgs84: input.coordinate.latitude,
    longitudeWgs84: input.coordinate.longitude,
    latitudeGcj02: finiteCoordinate(input.latitudeGcj02),
    longitudeGcj02: finiteCoordinate(input.longitudeGcj02),
    elevationMeters: manualElevation,
    elevationSource,
    elevationConfidence,
    terrainType: "unknown",
    exposureType: "unknown",
    viewingDirection: "unknown",
    nearbyValleyElevationMeters: null,
    localReliefMeters: null,
    terrainNotesZh:
      manualElevation === null
        ? "机位海拔资料不完整，山顶体感仅作参考。"
        : "仅有机位海拔，周边谷地和暴露度仍需补充。",
  };
}

export function pickSpotTerrainProfile(profile: SpotTerrainProfile): SpotTerrainProfile {
  return {
    latitudeWgs84: profile.latitudeWgs84,
    longitudeWgs84: profile.longitudeWgs84,
    latitudeGcj02: profile.latitudeGcj02,
    longitudeGcj02: profile.longitudeGcj02,
    elevationMeters: profile.elevationMeters,
    elevationSource: profile.elevationSource,
    elevationConfidence: profile.elevationConfidence,
    terrainType: profile.terrainType,
    exposureType: profile.exposureType,
    viewingDirection: profile.viewingDirection,
    nearbyValleyElevationMeters: profile.nearbyValleyElevationMeters,
    localReliefMeters: profile.localReliefMeters,
    terrainNotesZh: profile.terrainNotesZh,
  };
}

export function terrainCoordinateFromProfile(profile: SpotTerrainProfile): TerrainCoordinate {
  return {
    latitude: profile.latitudeWgs84,
    longitude: profile.longitudeWgs84,
    system: "wgs84",
  };
}

export function terrainProfileDefaults(input: {
  readonly terrainType?: TerrainType;
  readonly exposureType?: ExposureType;
  readonly viewingDirection?: TerrainViewingDirection;
  readonly elevationSource?: ElevationSource;
  readonly elevationConfidence?: ElevationConfidence;
} = {}): Pick<
  SpotTerrainProfile,
  "terrainType" | "exposureType" | "viewingDirection" | "elevationSource" | "elevationConfidence"
> {
  return {
    terrainType: input.terrainType ?? "unknown",
    exposureType: input.exposureType ?? "unknown",
    viewingDirection: input.viewingDirection ?? "unknown",
    elevationSource: input.elevationSource ?? "unknown",
    elevationConfidence: input.elevationConfidence ?? "low",
  };
}

function finiteElevation(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function finiteCoordinate(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
