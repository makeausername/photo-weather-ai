import { describe, expect, it, vi } from "vitest";
import {
  calculateElevationDiff,
  buildSpotTerrainProfile,
  classifyHorizonObstruction,
  classifyTerrainCloudSeaPotential,
  getDirectionZhFromAzimuth,
  MockTerrainProvider,
  OpenMeteoElevationProvider,
  TerrainElevationService,
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

  it("does not call external APIs from the disabled future provider skeleton", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("terrain provider tests must not call network");
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenMeteoElevationProvider();

    await expect(
      provider.buildTerrainProfile({
        locationName: "黄山光明顶",
        coordinate: knownSpots[0].coordinate,
      }),
    ).rejects.toThrow("默认禁用");
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
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
    expect(elevation.elevationMeters).toBeUndefined();
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
});
