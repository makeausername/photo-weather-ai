import { describe, expect, it } from "vitest";
import { MockGeoProvider } from "../index";

describe("MockGeoProvider", () => {
  it("returns deterministic place search results", async () => {
    const provider = new MockGeoProvider();
    const places = await provider.searchPlace("huangshan");

    expect(places[0]?.name).toBe("Huangshan Scenic Area");
    expect(places[0]?.coordinates.system).toBe("wgs84");
  });

  it("keeps coordinate conversion as a safe placeholder", () => {
    const provider = new MockGeoProvider();
    const converted = provider.wgs84ToGcj02({
      latitude: 30,
      longitude: 120,
      system: "wgs84",
    });

    expect(converted).toEqual({
      latitude: 30,
      longitude: 120,
      system: "gcj02",
    });
  });
});
