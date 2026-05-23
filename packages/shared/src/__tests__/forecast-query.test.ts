import { describe, expect, it } from "vitest";
import {
  forecastQueryInputSchema,
  normalizeForecastQueryInput,
  normalizeForecastTargetValue,
} from "../index";

const validForecastQuery = {
  name: "黄山光明顶",
  source: "local_photo_spot",
  latitudeGcj02: 30.13254,
  longitudeGcj02: 118.16876,
  latitudeWgs84: 30.13012,
  longitudeWgs84: 118.16389,
  horizon: "48h",
  target: "general",
  locationId: "location-huangshan",
  photoSpotId: "spot-guangmingding",
} as const;

describe("forecast query schema", () => {
  it("accepts the public forecast query contract", () => {
    expect(forecastQueryInputSchema.parse(validForecastQuery)).toEqual(validForecastQuery);
  });

  it("rejects unsupported forecast horizons and targets", () => {
    expect(
      forecastQueryInputSchema.safeParse({
        ...validForecastQuery,
        horizon: "96h",
      }).success,
    ).toBe(false);

    expect(
      forecastQueryInputSchema.safeParse({
        ...validForecastQuery,
        target: "rainbow",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid coordinate ranges", () => {
    expect(
      forecastQueryInputSchema.safeParse({
        ...validForecastQuery,
        latitudeWgs84: 91,
      }).success,
    ).toBe(false);

    expect(
      forecastQueryInputSchema.safeParse({
        ...validForecastQuery,
        longitudeGcj02: -181,
      }).success,
    ).toBe(false);
  });

  it("normalizes supported astro target aliases before validation", () => {
    for (const target of ["astro", "星空银河", "milky_way", "stars"]) {
      const normalized = normalizeForecastQueryInput({
        ...validForecastQuery,
        target,
      });

      expect(forecastQueryInputSchema.parse(normalized).target).toBe("astro");
    }

    expect(
      forecastQueryInputSchema.parse(
        normalizeForecastQueryInput({
          ...validForecastQuery,
          target: "general",
          scenario: "astro",
        }),
      ).target,
    ).toBe("astro");
    expect(normalizeForecastTargetValue("rainbow")).toBeUndefined();
  });
});
