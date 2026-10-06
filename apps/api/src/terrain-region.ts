import type { TerrainProfileSummary } from "@photo-weather/shared";
import type { AstroServiceTerrainRegion } from "./astro-service-client.js";

/** Keep point elevation, area relief and directional horizons as separate evidence. */
export function applyTerrainRegion(
  profile: TerrainProfileSummary,
  region: AstroServiceTerrainRegion | null,
): TerrainProfileSummary {
  const cleanProfile = { ...profile } as TerrainProfileSummary & { samples?: unknown };
  delete cleanProfile.samples;
  const usable =
    region?.available === true &&
    [
      region.elevationMeters,
      region.minElevation1km,
      region.minElevation3km,
      region.minElevation5km,
      region.maxElevation5km,
      region.avgElevation5km,
    ].every((value) => typeof value === "number" && Number.isFinite(value));
  const min = usable ? region!.minElevation5km! : null;
  const max = usable ? region!.maxElevation5km! : null;
  // Preserve the point elevation already used for weather correction.
  const useDemElevation = profile.elevationMeters === null && usable;
  const elevation = useDemElevation ? region!.elevationMeters : profile.elevationMeters;
  const aboveValley = elevation !== null && min !== null ? Math.max(0, elevation - min) : null;
  return {
    ...cleanProfile,
    terrainType: usable ? profile.terrainType : "unknown",
    elevationMeters: elevation,
    locationElevation: elevation,
    elevationSource: useDemElevation ? "dem" : profile.elevationSource,
    elevationConfidence: useDemElevation ? "high" : profile.elevationConfidence,
    regionalEvidence: {
      source: usable ? "dem" : "unavailable",
      sampleCount: region?.sampleCount ?? 0,
      validSampleCount: region?.validSampleCount ?? 0,
      datasetName: region?.datasetName,
      datasetVersion: region?.datasetVersion,
    },
    minElevation1km: usable ? region!.minElevation1km : null,
    minElevation3km: usable ? region!.minElevation3km : null,
    minElevation5km: min,
    maxElevation5km: max,
    avgElevation5km: usable ? region!.avgElevation5km : null,
    elevationDiff5km: min !== null && max !== null ? Math.max(0, max - min) : null,
    nearbyValleyElevationMeters: min,
    localReliefMeters: aboveValley,
    terrainCloudSeaPotential:
      aboveValley === null || aboveValley < 300 ? "low" : aboveValley >= 900 ? "high" : "medium",
    terrainNoteZh: usable
      ? "已采样机位周边 1、3、5 公里地形；高差支持机位判断，云顶高度与现场遮挡仍需确认。"
      : "周边地形覆盖不足，云海高差待确认。",
    terrainNotesZh: usable ? "区域高差来自地形采样，近景需现场核对。" : "区域地形待确认。",
    valleyDirectionZh: undefined,
    ridgeDirectionZh: undefined,
  };
}
