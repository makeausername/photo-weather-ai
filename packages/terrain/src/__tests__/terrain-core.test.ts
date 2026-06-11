import { describe, expect, it, vi } from "vitest";
import {
  assessTerrainHorizonObstruction,
  calculateElevationDiff,
  buildSpotTerrainProfile,
  classifyHorizonObstruction,
  classifyTerrainCloudSeaPotential,
  getDirectionZhFromAzimuth,
  InMemoryElevationCacheStore,
  MockTerrainProvider,
  OpenMeteoElevationProvider,
  TerrainElevationService,
  terrainHorizonAssessmentHasDeterministicClearance,
  validateTerrainCoordinates,
} from "../index.js";

const knownSpots = [
  {
    name: "黄山光明顶",
    coordinate: { latitude: 30.1328, longitude: 118.171, system: "wgs84" as const },
    elevation: 1860,
  },
  {
    name: "老君山金顶",
    coordinate: { latitude: 33.7852, longitude: 111.6402, system: "wgs84" as const },
    elevation: 2190,
  },
  {
    name: "三清山女神峰",
    coordinate: { latitude: 28.9139, longitude: 118.0699, system: "wgs84" as const },
    elevation: 1600,
  },
  {
    name: "武功山金顶",
    coordinate: { latitude: 27.4716, longitude: 114.1808, system: "wgs84" as const },
    elevation: 1918,
  },
] as const;

describe("Terrain Core V1", () => {
  it("classifies target-direction terrain horizon clearance with deterministic thresholds", () => {
    const baseInput = {
      location: { latitude: 30.13, longitude: 118.16, system: "wgs84" as const },
      observerElevationMeters: 1800,
      target: "milky_way" as const,
      targetAzimuthDegrees: 180,
      directionSamples: [
        {
          target: "milky_way" as const,
          azimuthDegrees: 181,
          horizonAltitudeDegrees: 6,
          dataSource: "manual_profile" as const,
          confidence: "high" as const,
        },
      ],
    };

    expect(
      assessTerrainHorizonObstruction({
        ...baseInput,
        targetAltitudeDegrees: 10,
      }),
    ).toMatchObject({
      obstructionLevel: "clear",
      obstructionClearanceDegrees: 4,
      horizonAltitudeDegrees: 6,
    });
    expect(
      assessTerrainHorizonObstruction({
        ...baseInput,
        targetAltitudeDegrees: 8.5,
      }).obstructionLevel,
    ).toBe("marginal");
    expect(
      assessTerrainHorizonObstruction({
        ...baseInput,
        targetAltitudeDegrees: 5.5,
      }).obstructionLevel,
    ).toBe("obstructed");
  });

  it("keeps missing directional terrain profile unknown instead of assuming no obstruction", () => {
    const fetchMock = vi.fn(() => {
      throw new Error("terrain horizon helper should stay local");
    });
    vi.stubGlobal("fetch", fetchMock);

    const assessment = assessTerrainHorizonObstruction({
      location: { latitude: 30.13, longitude: 118.16, system: "wgs84" },
      observerElevationMeters: 1800,
      target: "milky_way",
      targetAzimuthDegrees: 180,
      targetAltitudeDegrees: 8,
      terrainType: "summit",
      exposureType: "exposed",
      viewingDirection: "panoramic",
      directionSamples: [],
    });

    expect(assessment.obstructionLevel).toBe("unknown");
    expect(assessment.horizonAltitudeDegrees).toBeNull();
    expect(assessment.obstructionClearanceDegrees).toBeNull();
    expect(assessment.dataSource).toBe("qualitative_fallback");
    expect(terrainHorizonAssessmentHasDeterministicClearance(assessment)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does not treat low-confidence directional samples as deterministic clearance", () => {
    const assessment = assessTerrainHorizonObstruction({
      location: { latitude: 30.13, longitude: 118.16, system: "wgs84" },
      observerElevationMeters: 1800,
      target: "milky_way",
      targetAzimuthDegrees: 180,
      targetAltitudeDegrees: 5,
      directionSamples: [
        {
          target: "milky_way",
          azimuthDegrees: 180,
          horizonAltitudeDegrees: 7,
          dataSource: "manual_profile",
          confidence: "low",
        },
      ],
    });

    expect(assessment.obstructionLevel).toBe("obstructed");
    expect(assessment.obstructionClearanceDegrees).toBe(-2);
    expect(terrainHorizonAssessmentHasDeterministicClearance(assessment)).toBe(false);
  });

  it("uses DEM sample observer elevation and aggregate diagnostics metadata", () => {
    const assessment = assessTerrainHorizonObstruction({
      location: { latitude: 30.13, longitude: 118.16, system: "wgs84" },
      target: "milky_way",
      targetAzimuthDegrees: 146,
      targetAltitudeDegrees: 31,
      directionSamples: [
        {
          target: "milky_way",
          azimuthDegrees: 146,
          horizonAltitudeDegrees: 34,
          observerElevationMeters: 1860,
          dataSource: "dem_raster",
          dataSourceLabelZh: "本地 DEM 地形剖面",
          confidence: "high",
          sampleCount: 120,
          validSampleCount: 118,
          maxSampleDistanceMeters: 30000,
          datasetName: "Synthetic terrain DEM",
          datasetYear: 2026,
          datasetVersion: "test-dem-v1",
          sourceName: "Synthetic DEM",
          checksumShort: "abc123def456",
        },
      ],
    });

    expect(assessment).toMatchObject({
      observerElevationMeters: 1860,
      obstructionLevel: "obstructed",
      obstructionClearanceDegrees: -3,
      dataSource: "dem_raster",
      dataSourceLabelZh: "本地 DEM 地形剖面",
      professionalDiagnostics: expect.objectContaining({
        sampleCount: 120,
        validSampleCount: 118,
        maxSampleDistanceMeters: 30000,
        datasetName: "Synthetic terrain DEM",
        datasetYear: 2026,
        datasetVersion: "test-dem-v1",
        sourceName: "Synthetic DEM",
        checksumShort: "abc123def456",
      }),
    });
    expect(terrainHorizonAssessmentHasDeterministicClearance(assessment)).toBe(true);
  });

  it("returns deterministic mock terrain for known seed spots", async () => {
    const provider = new MockTerrainProvider();

    for (const spot of knownSpots) {
      const firstProfile = await provider.buildTerrainProfile({
        locationName: spot.name,
        coordinate: spot.coordinate,
      });
      const secondProfile = await provider.buildTerrainProfile({
        locationName: spot.name,
        coordinate: spot.coordinate,
      });
      const horizon = await provider.buildHorizonProfile({
        locationName: spot.name,
        coordinate: spot.coordinate,
      });

      expect(firstProfile).toEqual(secondProfile);
      expect(firstProfile.locationElevation).toBe(spot.elevation);
      if (firstProfile.locationElevation === null || firstProfile.minElevation5km === null) {
        throw new Error("seeded terrain profile must include elevation and local valley data");
      }
      expect(firstProfile.minElevation5km).toBeLessThan(firstProfile.locationElevation);
      expect(firstProfile.elevationDiff5km).toBeGreaterThan(700);
      expect(firstProfile.terrainNoteZh).toContain("基础地形剖面");
      expect(horizon.obstructionNoteZh).toContain("基础地形剖面");
      expect(horizon.blockedDirectionsZh.length).toBeGreaterThan(0);
    }
  });

  it("classifies terrain cloud sea potential from elevation difference", () => {
    expect(
      classifyTerrainCloudSeaPotential({
        elevationDiff5km: 1200,
        locationElevation: 1800,
      }),
    ).toBe("high");
    expect(
      classifyTerrainCloudSeaPotential({
        elevationDiff5km: 520,
        locationElevation: 900,
      }),
    ).toBe("medium");
    expect(
      classifyTerrainCloudSeaPotential({
        elevationDiff5km: 180,
        locationElevation: 600,
      }),
    ).toBe("low");
  });

  it("calculates elevation diff and horizon directions", () => {
    expect(calculateElevationDiff(1864, 380)).toBe(1484);
    expect(classifyHorizonObstruction(4)).toBe("low");
    expect(classifyHorizonObstruction(8)).toBe("medium");
    expect(classifyHorizonObstruction(14)).toBe("high");
    expect(getDirectionZhFromAzimuth(92)).toBe("东");
    expect(getDirectionZhFromAzimuth(315)).toBe("西北");
  });

  it("rejects invalid terrain coordinates", () => {
    expect(() =>
      validateTerrainCoordinates({ latitude: 30, longitude: 118, system: "gcj02" }),
    ).toThrow("WGS84");
    expect(() =>
      validateTerrainCoordinates({ latitude: 91, longitude: 118, system: "wgs84" }),
    ).toThrow("纬度");
    expect(() =>
      validateTerrainCoordinates({ latitude: 30, longitude: 181, system: "wgs84" }),
    ).toThrow("经度");
  });

  it("gets elevation for non-seeded WGS84 coordinates from a mocked Open-Meteo provider", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ elevation: [1326.4] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const provider = new OpenMeteoElevationProvider({ fetcher: fetchMock });
    const service = new TerrainElevationService({ provider });

    const result = await service.getElevationForWgs84(30.2528, 120.1078);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchCalls = fetchMock.mock.calls as unknown as readonly [string | URL, RequestInit?][];
    expect(String(fetchCalls[0]?.[0])).toContain("/v1/elevation");
    expect(String(fetchCalls[0]?.[0])).toContain("latitude=30.2528");
    expect(result.elevationMeters).toBe(1326);
    expect(result.elevationSource).toBe("open_meteo_elevation");
    expect(result.elevationConfidence).toBe("medium");
    expect(result.terrainProfile).toMatchObject({
      elevationMeters: 1326,
      terrainType: "unknown",
      exposureType: "unknown",
    });
  });

  it("builds seeded terrain profiles for core mountain photo spots", () => {
    const huangshan = buildSpotTerrainProfile({
      locationName: "黄山光明顶",
      coordinate: { latitude: 30.1328, longitude: 118.171, system: "wgs84" },
    });
    const laojunshan = buildSpotTerrainProfile({
      locationName: "老君山金顶",
      coordinate: { latitude: 33.7852, longitude: 111.6402, system: "wgs84" },
    });

    expect(huangshan).toMatchObject({
      elevationMeters: 1860,
      elevationSource: "manual",
      elevationConfidence: "high",
      terrainType: "summit",
      exposureType: "exposed",
      viewingDirection: "panoramic",
    });
    expect(laojunshan.elevationMeters).toBe(2190);
    expect(laojunshan.localReliefMeters).toBeGreaterThan(1200);
  });

  it("does not invent precise elevation for unknown locations", async () => {
    const input = {
      locationName: "未知山口",
      coordinate: { latitude: 31.2345, longitude: 119.9876, system: "wgs84" as const },
    };
    const profile = buildSpotTerrainProfile(input);
    const elevation = await new TerrainElevationService().getElevationForLocation(input);

    expect(profile.elevationMeters).toBeNull();
    expect(profile.elevationSource).toBe("unknown");
    expect(profile.elevationConfidence).toBe("low");
    expect(elevation.elevationMeters).toBeNull();
    expect(elevation.elevationSource).toBe("unknown");
    expect(elevation.elevationConfidence).toBe("low");
  });

  it("uses manual elevation before optional provider enrichment", async () => {
    const provider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 900,
        elevationSource: "open_meteo" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    const service = new TerrainElevationService(provider);
    const result = await service.getElevationForLocation({
      locationName: "手动机位",
      coordinate: { latitude: 31.2345, longitude: 119.9876, system: "wgs84" },
      elevationMeters: 1688,
    });

    expect(result.elevationMeters).toBe(1688);
    expect(result.elevationSource).toBe("manual");
    expect(result.elevationConfidence).toBe("medium");
    expect(provider.getElevationForLocation).not.toHaveBeenCalled();
  });

  it("uses seeded photo spot elevation before provider lookup", async () => {
    const provider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 900,
        elevationSource: "open_meteo_elevation" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    const service = new TerrainElevationService({ provider });
    const result = await service.getElevationForLocation({
      locationName: "黄山光明顶",
      coordinate: knownSpots[0].coordinate,
    });

    expect(result.elevationMeters).toBe(1860);
    expect(result.elevationSource).toBe("manual");
    expect(result.elevationConfidence).toBe("high");
    expect(provider.getElevationForLocation).not.toHaveBeenCalled();
  });

  it("does not attach summit metadata when a broad seed match has conflicting low elevation", async () => {
    const service = new TerrainElevationService();
    const result = await service.getElevationForLocation({
      locationName: "黄山市区低海拔机位",
      coordinate: { latitude: 30.1328, longitude: 118.171, system: "wgs84" },
      elevationMeters: 142,
      elevationSource: "manual",
      elevationConfidence: "medium",
    });
    const provider = new MockTerrainProvider();
    const profile = await provider.buildTerrainProfile({
      locationName: "黄山市区低海拔机位",
      coordinate: { latitude: 30.1328, longitude: 118.171, system: "wgs84" },
      elevationMeters: result.elevationMeters,
      elevationSource: result.elevationSource,
      elevationConfidence: result.elevationConfidence,
      terrainProfile: result.terrainProfile,
    });

    expect(result.elevationMeters).toBe(142);
    expect(result.terrainProfile.terrainType).toBe("unknown");
    expect(result.terrainProfile.localReliefMeters).toBeNull();
    expect(profile.locationElevation).toBe(142);
    expect(profile.terrainType).toBe("unknown");
    expect(profile.localReliefMeters).toBeNull();
  });

  it("returns null unknown when provider lookup fails instead of coercing to zero", async () => {
    const provider = {
      getElevationForLocation: vi.fn(async () => {
        throw new Error("mock elevation outage");
      }),
    };
    const service = new TerrainElevationService({ provider });
    const result = await service.getElevationForWgs84(30.2528, 120.1078);

    expect(provider.getElevationForLocation).toHaveBeenCalledTimes(1);
    expect(result.elevationMeters).toBeNull();
    expect(result.elevationSource).toBe("unknown");
    expect(result.elevationConfidence).toBe("low");
    expect(result.terrainProfile.elevationMeters).toBeNull();
  });

  it("treats provider-returned zero as real sea-level elevation", async () => {
    const provider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 0,
        elevationSource: "open_meteo_elevation" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    const service = new TerrainElevationService({ provider });
    const result = await service.getElevationForWgs84(22.25, 113.58);

    expect(result.elevationMeters).toBe(0);
    expect(result.elevationSource).toBe("open_meteo_elevation");
    expect(result.terrainProfile.elevationMeters).toBe(0);
  });

  it("uses the rounded coordinate cache for repeated elevation lookups", async () => {
    const provider = {
      getElevationForLocation: vi.fn(async () => ({
        elevationMeters: 1333,
        elevationSource: "open_meteo_elevation" as const,
        elevationConfidence: "medium" as const,
      })),
    };
    const cacheStore = new InMemoryElevationCacheStore();
    const service = new TerrainElevationService({ provider, cacheStore });

    const first = await service.getElevationForWgs84(30.252801, 120.107804);
    const second = await service.getElevationForWgs84(30.252802, 120.107803);

    expect(first.elevationMeters).toBe(1333);
    expect(second.elevationMeters).toBe(1333);
    expect(provider.getElevationForLocation).toHaveBeenCalledTimes(1);
  });
});
