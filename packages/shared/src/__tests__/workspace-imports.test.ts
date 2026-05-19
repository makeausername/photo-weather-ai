import { MockAIProvider } from "@photo-weather/ai";
import { MockAstroProvider } from "@photo-weather/astro";
import { databasePackageStatus } from "@photo-weather/db";
import { MockGeoProvider } from "@photo-weather/geo";
import { MockScoringEngine } from "@photo-weather/scoring";
import { MockStorageProvider } from "@photo-weather/storage";
import { MockTerrainProvider } from "@photo-weather/terrain";
import { MockWeatherProvider } from "@photo-weather/weather";
import { describe, expect, it } from "vitest";

describe("workspace package imports", () => {
  it("loads the initial architecture packages", () => {
    expect(new MockAIProvider()).toBeInstanceOf(MockAIProvider);
    expect(new MockAstroProvider()).toBeInstanceOf(MockAstroProvider);
    expect(databasePackageStatus.businessModels).toBe("created");
    expect(new MockGeoProvider()).toBeInstanceOf(MockGeoProvider);
    expect(new MockScoringEngine()).toBeInstanceOf(MockScoringEngine);
    expect(new MockStorageProvider()).toBeInstanceOf(MockStorageProvider);
    expect(new MockTerrainProvider()).toBeInstanceOf(MockTerrainProvider);
    expect(new MockWeatherProvider()).toBeInstanceOf(MockWeatherProvider);
  });
});
