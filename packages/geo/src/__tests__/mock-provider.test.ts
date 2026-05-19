import { describe, expect, it } from "vitest";
import {
  AmapProvider,
  MockGeoProvider,
  gcj02ToWgs84,
  normalizeAmapPoi,
  validateCoordinates,
  wgs84ToGcj02,
} from "../index";

describe("MockGeoProvider", () => {
  it("returns deterministic place search results", async () => {
    const provider = new MockGeoProvider();
    const places = await provider.searchPlace("黄山光明顶");

    expect(places[0]?.name).toBe("黄山光明顶");
    expect(places[0]?.coordinatesGcj02.system).toBe("gcj02");
    expect(places[0]?.coordinates.system).toBe("wgs84");
    expect(places[0]?.latitudeGcj02).toBeCloseTo(30.1351, 4);
    expect(places[0]?.longitudeWgs84).toBeCloseTo(118.171, 4);
  });

  it("includes the four public Chinese sample photo places", async () => {
    const provider = new MockGeoProvider();
    const sampleNames = ["黄山光明顶", "老君山金顶", "三清山女神峰", "武功山金顶"] as const;

    for (const name of sampleNames) {
      const places = await provider.searchPlace(name);
      expect(places[0]).toMatchObject({
        name,
        source: "mock",
        coordinatesGcj02: {
          system: "gcj02",
        },
        coordinatesWgs84: {
          system: "wgs84",
        },
      });
      expect(places[0]?.latitudeGcj02).toEqual(expect.any(Number));
      expect(places[0]?.latitudeWgs84).toEqual(expect.any(Number));
    }
  });

  it("converts WGS84 coordinates to GCJ-02 for mainland map display", () => {
    const provider = new MockGeoProvider();
    const converted = provider.wgs84ToGcj02({
      latitude: 39.908823,
      longitude: 116.39747,
      system: "wgs84",
    });

    expect(converted.system).toBe("gcj02");
    expect(converted.latitude).toBeCloseTo(39.9102, 3);
    expect(converted.longitude).toBeCloseTo(116.4037, 3);
  });
});

describe("AmapProvider normalization", () => {
  it("normalizes Amap POI fixture data without network calls", () => {
    const place = normalizeAmapPoi({
      id: "B000A7BD6C",
      name: "黄山风景区",
      pname: "安徽省",
      cityname: "黄山市",
      adname: "黄山区",
      address: "汤口镇",
      location: "118.1767,30.1351",
    });

    expect(place).toMatchObject({
      id: "amap:B000A7BD6C",
      providerPlaceId: "B000A7BD6C",
      name: "黄山风景区",
      province: "安徽省",
      city: "黄山市",
      district: "黄山区",
      address: "汤口镇",
      source: "amap",
      latitudeGcj02: 30.1351,
      longitudeGcj02: 118.1767,
      coordinatesGcj02: {
        system: "gcj02",
      },
      coordinatesWgs84: {
        system: "wgs84",
      },
    });
  });

  it("rejects invalid Amap fixture coordinates", () => {
    expect(() =>
      normalizeAmapPoi({
        id: "invalid",
        name: "无效地点",
        location: "200,120",
      }),
    ).toThrow("高德地图结果包含不合法坐标。");
  });

  it("throws a clear configuration error before any real request", async () => {
    const provider = new AmapProvider({ enabled: true });

    await expect(provider.searchPlace("黄山光明顶")).rejects.toThrow(
      "高德地图已启用，但尚未配置 Web 服务 API Key。",
    );
  });
});

describe("coordinate conversion utilities", () => {
  it("round-trips GCJ-02 and WGS84 coordinates with explicit coordinate systems", () => {
    const wgs84 = {
      latitude: 30.1328,
      longitude: 118.171,
      system: "wgs84" as const,
    };

    const gcj02 = wgs84ToGcj02(wgs84);
    const roundTripped = gcj02ToWgs84(gcj02);

    expect(gcj02.system).toBe("gcj02");
    expect(roundTripped.system).toBe("wgs84");
    expect(roundTripped.latitude).toBeCloseTo(wgs84.latitude, 4);
    expect(roundTripped.longitude).toBeCloseTo(wgs84.longitude, 4);
  });

  it("keeps out-of-China conversion numerically unchanged while changing system names", () => {
    const paris = {
      latitude: 48.8566,
      longitude: 2.3522,
      system: "wgs84" as const,
    };

    const converted = wgs84ToGcj02(paris);

    expect(converted).toEqual({
      latitude: paris.latitude,
      longitude: paris.longitude,
      system: "gcj02",
    });
  });

  it("rejects unsafe coordinate values and system mismatches", () => {
    expect(
      validateCoordinates({
        latitude: Number.NaN,
        longitude: 120,
        system: "wgs84",
      }).ok,
    ).toBe(false);

    expect(
      validateCoordinates(
        {
          latitude: 30,
          longitude: 120,
          system: "gcj02",
        },
        { expectedSystem: "wgs84" },
      ),
    ).toEqual({
      ok: false,
      issues: ["coordinate_system_mismatch"],
    });
  });
});
