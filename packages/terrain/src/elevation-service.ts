import type {
  ElevationConfidence,
  ElevationSource,
  SpotTerrainProfile,
} from "@photo-weather/shared";
import { buildSpotTerrainProfile } from "./spot-terrain-profiles.js";
import type { TerrainAnalysisInput } from "./types.js";

export type ElevationProviderResult = {
  readonly elevationMeters?: number;
  readonly elevationSource: ElevationSource;
  readonly elevationConfidence: ElevationConfidence;
};

export type ElevationProvider = {
  getElevationForLocation(input: TerrainAnalysisInput): Promise<ElevationProviderResult>;
};

export type ElevationEnrichmentResult = ElevationProviderResult & {
  readonly elevationMeters?: number;
  readonly terrainProfile: SpotTerrainProfile;
  readonly cacheKey: string;
  readonly reasonZh: string;
};

export class TerrainElevationService {
  private readonly cache = new Map<string, ElevationEnrichmentResult>();

  constructor(private readonly provider?: ElevationProvider) {}

  async getElevationForLocation(input: TerrainAnalysisInput): Promise<ElevationEnrichmentResult> {
    const profile = buildSpotTerrainProfile(input);
    const manualElevation = finiteElevation(input.elevationMeters ?? profile.elevationMeters);
    const cacheKey = elevationCacheKey(input);

    if (manualElevation !== undefined) {
      const result = {
        elevationMeters: manualElevation,
        elevationSource: profile.elevationSource === "unknown" ? "manual" : profile.elevationSource,
        elevationConfidence: profile.elevationConfidence === "low" ? "medium" : profile.elevationConfidence,
        terrainProfile: {
          ...profile,
          elevationMeters: manualElevation,
          elevationSource: profile.elevationSource === "unknown" ? "manual" : profile.elevationSource,
          elevationConfidence:
            profile.elevationConfidence === "low" ? "medium" : profile.elevationConfidence,
        },
        cacheKey,
        reasonZh: "使用人工维护或种子机位海拔。",
      } satisfies ElevationEnrichmentResult;
      this.cache.set(cacheKey, result);
      return result;
    }

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    if (this.provider) {
      const providerResult = await this.provider.getElevationForLocation(input);
      if (finiteElevation(providerResult.elevationMeters) !== undefined) {
        const result = {
          elevationMeters: Math.round(providerResult.elevationMeters!),
          elevationSource: providerResult.elevationSource,
          elevationConfidence: providerResult.elevationConfidence,
          terrainProfile: {
            ...profile,
            elevationMeters: Math.round(providerResult.elevationMeters!),
            elevationSource: providerResult.elevationSource,
            elevationConfidence: providerResult.elevationConfidence,
          },
          cacheKey,
          reasonZh: "使用已配置的海拔服务返回值。",
        } satisfies ElevationEnrichmentResult;
        this.cache.set(cacheKey, result);
        return result;
      }
    }

    const unknown = {
      elevationSource: "unknown",
      elevationConfidence: "low",
      terrainProfile: {
        ...profile,
        elevationMeters: null,
        elevationSource: "unknown",
        elevationConfidence: "low",
      },
      cacheKey,
      reasonZh: "未配置真实海拔服务，且当前地点没有人工海拔资料。",
    } satisfies ElevationEnrichmentResult;
    this.cache.set(cacheKey, unknown);
    return unknown;
  }
}

export function elevationCacheKey(input: Pick<TerrainAnalysisInput, "coordinate">): string {
  return `${roundCoordinate(input.coordinate.latitude)},${roundCoordinate(input.coordinate.longitude)}`;
}

function roundCoordinate(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3);
}

function finiteElevation(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : undefined;
}
