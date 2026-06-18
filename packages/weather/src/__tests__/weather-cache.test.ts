import { describe, expect, it } from "vitest";
import { InMemoryWeatherCache } from "../weather-cache.js";

describe("InMemoryWeatherCache", () => {
  it("deletes expired entries and reports how many were removed", () => {
    const cache = new InMemoryWeatherCache({ maxEntries: 10 });

    cache.set("expired", "old", 100, 1_000);
    cache.set("fresh", "new", 1_000, 1_000);

    expect(cache.deleteExpired(1_101)).toBe(1);
    expect(cache.get<string>("expired", 1_101)).toBeUndefined();
    expect(cache.get<string>("fresh", 1_101)).toBe("new");
    expect(cache.size()).toBe(1);
  });

  it("prunes oldest entries when maxEntries is exceeded", () => {
    const cache = new InMemoryWeatherCache({ maxEntries: 2 });

    cache.set("a", 1, 10_000, 1_000);
    cache.set("b", 2, 10_000, 1_001);
    cache.set("c", 3, 10_000, 1_002);

    expect(cache.size()).toBe(2);
    expect(cache.get<number>("a", 1_003)).toBeUndefined();
    expect(cache.get<number>("b", 1_003)).toBe(2);
    expect(cache.get<number>("c", 1_003)).toBe(3);
  });

  it("keeps recently read entries ahead of older entries during pruning", () => {
    const cache = new InMemoryWeatherCache({ maxEntries: 2 });

    cache.set("a", 1, 10_000, 1_000);
    cache.set("b", 2, 10_000, 1_001);
    expect(cache.get<number>("a", 1_002)).toBe(1);

    cache.set("c", 3, 10_000, 1_003);

    expect(cache.get<number>("a", 1_004)).toBe(1);
    expect(cache.get<number>("b", 1_004)).toBeUndefined();
    expect(cache.get<number>("c", 1_004)).toBe(3);
  });
});
