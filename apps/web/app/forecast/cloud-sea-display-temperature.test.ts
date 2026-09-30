import { describe, expect, it } from "vitest";
import { buildTerrainTemperatureBasisContext } from "@photo-weather/shared";
import { buildCloudSeaDisplayTemperatureContext } from "./cloud-sea-display-temperature";

describe("period-specific temperature and body feel", () => {
  it("preserves the selected six-hour ranges and does not prefer a whole-report body feel", () => {
    const source = buildTerrainTemperatureBasisContext({
      rawGridTemperatureC: 25,
      terrainAdjustedTemperatureC: 18,
      elevationMeters: 1800,
      terrainMode: "high_mountain",
    });
    const context = buildCloudSeaDisplayTemperatureContext({
      temperatureBasisContext: { ...source, bodyFeelTemperatureC: 15 },
      terrainAdjustedTemperatureC: 22,
      bodyFeelTemperatureC: 20.7,
      displayTemperatureRangeC: [21, 23],
      bodyFeelRangeC: [19.7, 21.7],
    });
    expect(context.displayTemperatureRangeC).toEqual([21, 23]);
    expect(context.bodyFeelTemperatureC).toBe(20.7);
    expect(context.bodyFeelRangeC).toEqual([19.7, 21.7]);
  });
});
