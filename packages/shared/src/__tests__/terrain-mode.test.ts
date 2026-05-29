import { describe, expect, it } from "vitest";
import { classifyTerrainMode } from "../terrain-mode.js";

describe("terrain mode classification", () => {
  it("does not treat a 142m ordinary location as mountain terrain", () => {
    expect(
      classifyTerrainMode({
        elevationMeters: 142,
        localReliefMeters: null,
        terrainType: "unknown",
        exposureType: "unknown",
        elevationConfidence: "medium",
      }),
    ).toBe("lowland");
  });

  it("classifies city lowland separately from missing terrain", () => {
    expect(
      classifyTerrainMode({
        elevationMeters: 86,
        localReliefMeters: null,
        terrainType: "city",
        exposureType: "sheltered",
      }),
    ).toBe("urban_or_plain");

    expect(classifyTerrainMode({ terrainType: "unknown", exposureType: "unknown" })).toBe(
      "unknown",
    );
  });

  it("keeps high mountain and relief-supported terrain in mountain modes", () => {
    expect(
      classifyTerrainMode({
        elevationMeters: 1860,
        localReliefMeters: 1480,
        terrainType: "summit",
        exposureType: "exposed",
      }),
    ).toBe("high_mountain");

    expect(
      classifyTerrainMode({
        elevationMeters: 420,
        localReliefMeters: 520,
        terrainType: "ridge",
        exposureType: "semi_exposed",
      }),
    ).toBe("high_mountain");
  });
});
