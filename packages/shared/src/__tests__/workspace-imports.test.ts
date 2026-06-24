import { LocalAstroProvider } from "@photo-weather/astro";
import { defaultTimezone } from "@photo-weather/calendar";
import { databasePackageStatus } from "@photo-weather/db";
import { MockGeoProvider } from "@photo-weather/geo";
import { MockScoringEngine } from "@photo-weather/scoring";
import { MockStorageProvider } from "@photo-weather/storage";
import { MockTerrainProvider } from "@photo-weather/terrain";
import { MockWeatherProvider } from "@photo-weather/weather";
import { describe, expect, it } from "vitest";

describe("workspace package imports", () => {
  it("loads the initial architecture packages", () => {
    expect(new LocalAstroProvider()).toBeInstanceOf(LocalAstroProvider);
    expect(defaultTimezone).toBe("Asia/Shanghai");
    expect(databasePackageStatus.businessModels).toBe("created");
    expect(new MockGeoProvider()).toBeInstanceOf(MockGeoProvider);
    expect(new MockScoringEngine()).toBeInstanceOf(MockScoringEngine);
    expect(new MockStorageProvider()).toBeInstanceOf(MockStorageProvider);
    expect(new MockTerrainProvider()).toBeInstanceOf(MockTerrainProvider);
    expect(new MockWeatherProvider()).toBeInstanceOf(MockWeatherProvider);
  });
});
