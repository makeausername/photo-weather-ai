import { describe, expect, it } from "vitest";
import { MockGeoProvider, gcj02ToWgs84, validateCoordinates, wgs84ToGcj02 } from "../index";

describe("MockGeoProvider", () => {
  it("returns deterministic place search results", async () => {
    const provider = new MockGeoProvider();
    const places = await provider.searchPlace("黄山");

    expect(places[0]?.name).toBe("黄山");
    expect(places[0]?.coordinatesGcj02.system).toBe("gcj02");
    expect(places[0]?.coordinates.system).toBe("wgs84");
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
