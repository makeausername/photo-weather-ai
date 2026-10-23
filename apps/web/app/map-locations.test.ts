import { describe, it, expect } from "vitest";
import { groupNearbyPins, locationFromMap, mapPoint } from "../components/map-locations";

describe("geographic map selection", () => {
  it("converts Amap clicks back to weather WGS84 coordinates within 5 metres", () => {
    const location = locationFromMap({ latitude: 33.7852, longitude: 111.6402 }, "osm");
    const gcj = mapPoint(location, "amap");
    expect(Math.abs(gcj.longitude - location.longitudeWgs84)).toBeGreaterThan(0.001);
    const roundTrip = locationFromMap(gcj, "amap");
    expect(Math.abs(roundTrip.latitudeWgs84 - location.latitudeWgs84)).toBeLessThan(0.000045);
    expect(Math.abs(roundTrip.longitudeWgs84 - location.longitudeWgs84)).toBeLessThan(0.000045);
    expect(roundTrip.longitudeGcj02).toBeCloseTo(gcj.longitude, 10);
  });
  it("keeps international coordinates unchanged and normalizes wrapped longitudes", () => {
    const paris = locationFromMap({ latitude: 48.85, longitude: 2.35 }, "amap");
    expect(paris.latitudeWgs84).toBe(48.85);
    expect(paris.longitudeWgs84).toBeCloseTo(2.35);
    expect(locationFromMap({ latitude: 0, longitude: 181 }, "osm").longitudeWgs84).toBe(-179);
  });
  it("groups overlapping pins in screen pixels and separates them when zoomed", () => {
    const points = [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 150, y: 10 },
    ];
    expect(groupNearbyPins(points, (p) => p).map((g) => g.members.length)).toEqual([2, 1]);
    expect(groupNearbyPins(points, (p) => ({ x: p.x * 3, y: p.y * 3 }))).toHaveLength(3);
  });
});
