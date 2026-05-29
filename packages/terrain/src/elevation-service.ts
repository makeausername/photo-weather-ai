import type {
  ElevationConfidence,
  ElevationSource,
  SpotTerrainProfile,
} from "@photo-weather/shared";
import {
  buildSpotTerrainProfile,
  terrainSeedMatchesElevation,
} from "./spot-terrain-profiles.js";
import type { TerrainAnalysisInput } from "./types.js";

const defaultKnownElevationTtlMs = 30 * 24 * 60 * 60 * 1000;
const defaultUnknownElevationTtlMs = 60 * 60 * 1000;

export type ElevationProviderResult = {
  readonly elevationMeters: number | null;
  readonly elevationSource: ElevationSource;
  readonly elevationConfidence: ElevationConfidence;
};

export type ElevationProvider = {
  getElevationForLocation(input: TerrainAnalysisInput): Promise<ElevationProviderResult>;
};

export type ElevationCacheEntry = ElevationProviderResult & {
  readonly cacheKey: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly expiresAt: number;
};

export type ElevationCacheStore = {
  get(cacheKey: string): Promise<ElevationCacheEntry | null>;
  set(entry: ElevationCacheEntry): Promise<void>;
};

export type ElevationEnrichmentResult = ElevationProviderResult & {
  readonly terrainProfile: SpotTerrainProfile;
  readonly cacheKey: string;
  readonly reasonZh: string;
};

export type TerrainElevationServiceOptions = {
  readonly provider?: ElevationProvider;
  readonly cacheStore?: ElevationCacheStore;
  readonly now?: () => number;
  readonly knownElevationTtlMs?: number;
  readonly unknownElevationTtlMs?: number;
};

export class InMemoryElevationCacheStore implements ElevationCacheStore {
  private readonly cache = new Map<string, ElevationCacheEntry>();

  async get(cacheKey: string): Promise<ElevationCacheEntry | null> {
    return this.cache.get(cacheKey) ?? null;
  }

  async set(entry: ElevationCacheEntry): Promise<void> {
    this.cache.set(entry.cacheKey, entry);
  }
}

export class TerrainElevationService {
  private readonly provider?: ElevationProvider;
  private readonly cacheStore: ElevationCacheStore;
  private readonly now: () => number;
  private readonly knownElevationTtlMs: number;
  private readonly unknownElevationTtlMs: number;

  constructor(providerOrOptions?: ElevationProvider | TerrainElevationServiceOptions) {
    const options = isElevationServiceOptions(providerOrOptions)
      ? providerOrOptions
      : { provider: providerOrOptions };

    this.provider = options.provider;
    this.cacheStore = options.cacheStore ?? new InMemoryElevationCacheStore();
    this.now = options.now ?? (() => Date.now());
    this.knownElevationTtlMs = options.knownElevationTtlMs ?? defaultKnownElevationTtlMs;
    this.unknownElevationTtlMs = options.unknownElevationTtlMs ?? defaultUnknownElevationTtlMs;
  }

  async getElevationForWgs84(
    latitudeWgs84: number,
    longitudeWgs84: number,
  ): Promise<ElevationEnrichmentResult> {
    return this.getElevationForLocation({
      coordinate: {
        latitude: latitudeWgs84,
        longitude: longitudeWgs84,
        system: "wgs84",
      },
    });
  }

  async getElevationForLocation(input: TerrainAnalysisInput): Promise<ElevationEnrichmentResult> {
    const baseProfile = buildSpotTerrainProfile(input);
    const cacheKey = elevationCacheKey(input);
    const knownInputElevation = resolveKnownInputElevation(input, baseProfile);

    if (knownInputElevation) {
      const result = buildResult({
        input,
        baseProfile,
        cacheKey,
        elevationMeters: knownInputElevation.elevationMeters,
        elevationSource: knownInputElevation.elevationSource,
        elevationConfidence: knownInputElevation.elevationConfidence,
        reasonZh: knownInputElevation.reasonZh,
      });
      await this.writeCache(result, input);
      return result;
    }

    const cached = await this.readUsableCache(cacheKey);
    if (cached) {
      return buildResult({
        input,
        baseProfile,
        cacheKey,
        elevationMeters: cached.elevationMeters,
        elevationSource: cached.elevationSource,
        elevationConfidence: cached.elevationConfidence,
        reasonZh:
          cached.elevationMeters === null
            ? "使用缓存的未知海拔状态。"
            : "使用缓存的坐标海拔。",
      });
    }

    if (this.provider) {
      try {
        const providerResult = await this.provider.getElevationForLocation(input);
        const providerElevation = finiteElevation(providerResult.elevationMeters);
        if (providerElevation !== null) {
          const result = buildResult({
            input,
            baseProfile,
            cacheKey,
            elevationMeters: providerElevation,
            elevationSource: providerResult.elevationSource,
            elevationConfidence: providerResult.elevationConfidence,
            reasonZh: "使用海拔服务返回值。",
          });
          await this.writeCache(result, input);
          return result;
        }
      } catch {
        // Forecast calculation must continue when elevation lookup fails.
      }
    }

    const unknown = buildResult({
      input,
      baseProfile,
      cacheKey,
      elevationMeters: null,
      elevationSource: "unknown",
      elevationConfidence: "low",
      reasonZh: "当前地点没有可用海拔资料。",
    });
    await this.writeCache(unknown, input);
    return unknown;
  }

  private async readUsableCache(cacheKey: string): Promise<ElevationCacheEntry | null> {
    try {
      const cached = await this.cacheStore.get(cacheKey);
      if (!cached || cached.expiresAt <= this.now()) {
        return null;
      }
      return cached;
    } catch {
      return null;
    }
  }

  private async writeCache(
    result: ElevationEnrichmentResult,
    input: TerrainAnalysisInput,
  ): Promise<void> {
    try {
      const ttlMs =
        result.elevationMeters === null ? this.unknownElevationTtlMs : this.knownElevationTtlMs;
      await this.cacheStore.set({
        cacheKey: result.cacheKey,
        latitudeWgs84: input.coordinate.latitude,
        longitudeWgs84: input.coordinate.longitude,
        elevationMeters: result.elevationMeters,
        elevationSource: result.elevationSource,
        elevationConfidence: result.elevationConfidence,
        expiresAt: this.now() + ttlMs,
      });
    } catch {
      // Cache failures are non-fatal.
    }
  }
}

export function elevationCacheKey(input: Pick<TerrainAnalysisInput, "coordinate">): string {
  return `${roundCoordinate(input.coordinate.latitude)},${roundCoordinate(input.coordinate.longitude)}`;
}

function buildResult(input: {
  readonly input: TerrainAnalysisInput;
  readonly baseProfile: SpotTerrainProfile;
  readonly cacheKey: string;
  readonly elevationMeters: number | null;
  readonly elevationSource: ElevationSource;
  readonly elevationConfidence: ElevationConfidence;
  readonly reasonZh: string;
}): ElevationEnrichmentResult {
  const baseProfile = terrainSeedMatchesElevation(input.baseProfile, input.elevationMeters)
    ? input.baseProfile
    : stripIncompatibleSeedTerrain(input.baseProfile);
  return {
    elevationMeters: input.elevationMeters,
    elevationSource: input.elevationSource,
    elevationConfidence: input.elevationConfidence,
    terrainProfile: {
      ...baseProfile,
      latitudeWgs84: input.input.coordinate.latitude,
      longitudeWgs84: input.input.coordinate.longitude,
      latitudeGcj02: input.input.latitudeGcj02 ?? baseProfile.latitudeGcj02,
      longitudeGcj02: input.input.longitudeGcj02 ?? baseProfile.longitudeGcj02,
      elevationMeters: input.elevationMeters,
      elevationSource: input.elevationSource,
      elevationConfidence: input.elevationConfidence,
      terrainType: baseProfile.terrainType ?? "unknown",
      exposureType: baseProfile.exposureType ?? "unknown",
      viewingDirection: baseProfile.viewingDirection ?? "unknown",
      terrainNotesZh:
        input.elevationMeters === null
          ? "海拔资料暂未确认，体感仅作参考。"
          : baseProfile.terrainNotesZh ?? "仅有机位海拔，周边地形仍需补充。",
    },
    cacheKey: input.cacheKey,
    reasonZh: input.reasonZh,
  };
}

function stripIncompatibleSeedTerrain(profile: SpotTerrainProfile): SpotTerrainProfile {
  return {
    ...profile,
    terrainType: "unknown",
    exposureType: "unknown",
    viewingDirection: "unknown",
    nearbyValleyElevationMeters: null,
    localReliefMeters: null,
    terrainNotesZh: "仅采用该地点海拔，周边高差未确认，不按高山机位判断。",
  };
}

function resolveKnownInputElevation(
  input: TerrainAnalysisInput,
  profile: SpotTerrainProfile,
):
  | {
      readonly elevationMeters: number;
      readonly elevationSource: ElevationSource;
      readonly elevationConfidence: ElevationConfidence;
      readonly reasonZh: string;
    }
  | null {
  const inputElevation = finiteElevation(input.elevationMeters);
  if (inputElevation !== null && shouldTrustKnownElevation(inputElevation, input.elevationSource)) {
    return {
      elevationMeters: inputElevation,
      elevationSource: input.elevationSource ?? (profile.elevationSource || "manual"),
      elevationConfidence: input.elevationConfidence ?? profile.elevationConfidence ?? "medium",
      reasonZh: "使用请求中已提供的海拔。",
    };
  }

  const profileElevation = finiteElevation(profile.elevationMeters);
  if (
    profileElevation !== null &&
    shouldTrustKnownElevation(profileElevation, profile.elevationSource)
  ) {
    return {
      elevationMeters: profileElevation,
      elevationSource: profile.elevationSource === "unknown" ? "manual" : profile.elevationSource,
      elevationConfidence:
        profile.elevationConfidence === "low" ? "medium" : profile.elevationConfidence,
      reasonZh: "使用人工维护或种子机位海拔。",
    };
  }

  return null;
}

function shouldTrustKnownElevation(
  elevationMeters: number,
  source: ElevationSource | undefined,
): boolean {
  if (elevationMeters !== 0) {
    return true;
  }
  return source !== undefined && source !== "unknown";
}

function roundCoordinate(value: number): string {
  return (Math.round(value * 100_000) / 100_000).toFixed(5);
}

function finiteElevation(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function isElevationServiceOptions(
  value: ElevationProvider | TerrainElevationServiceOptions | undefined,
): value is TerrainElevationServiceOptions {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("provider" in value ||
        "cacheStore" in value ||
        "now" in value ||
        "knownElevationTtlMs" in value ||
        "unknownElevationTtlMs" in value),
  );
}
