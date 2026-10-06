import { describe, expect, it } from "vitest";
import { buildMockForecastInput, flattenTerrainAnalysis } from "@photo-weather/scoring";
import { terrainCloudSubject } from "@photo-weather/shared";
import { applyTerrainRegion } from "../terrain-region.js";

const input = buildMockForecastInput({
  name: "测试机位",
  source: "amap",
  latitudeGcj02: 30,
  longitudeGcj02: 110,
  latitudeWgs84: 30,
  longitudeWgs84: 110,
  target: "cloud_sea",
  horizon: "24h",
});
const region = {
  available: true,
  elevationMeters: 510,
  minElevation1km: 450,
  minElevation3km: 400,
  minElevation5km: 300,
  maxElevation5km: 1600,
  avgElevation5km: 800,
  sampleCount: 1000,
  validSampleCount: 1000,
  datasetName: "DEM",
  datasetVersion: "v1",
};
describe("regional terrain evidence", () => {
  it("preserves weather point elevation and does not turn a valley into an elevated cloud-sea viewpoint", () => {
    const profile = applyTerrainRegion(
      {
        ...input.terrainAnalysis.terrainProfile,
        elevationMeters: 500,
        elevationSource: "manual",
        terrainType: "unknown",
      },
      region,
    );
    expect(profile.elevationMeters).toBe(500);
    expect(profile.elevationDiff5km).toBe(1300);
    expect(profile.localReliefMeters).toBe(200);
    expect(terrainCloudSubject(profile)).not.toBe("云海");
    expect(profile.terrainCloudSeaPotential).toBe("low");
  });
  it("clears mock area estimates on real coverage failure and keeps summary in sync", () => {
    const profile = applyTerrainRegion(input.terrainAnalysis.terrainProfile, null);
    expect(profile.minElevation5km).toBeNull();
    expect(profile.regionalEvidence?.source).toBe("unavailable");
    const analysis = { ...input.terrainAnalysis, terrainProfile: profile };
    const flat = flattenTerrainAnalysis(analysis);
    expect(flat.regionalEvidence).toEqual(profile.regionalEvidence);
    expect(flat.directionSamples).toEqual(analysis.horizonProfile.directionSamples);
  });
});
