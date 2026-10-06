import { describe, it, expect } from "vitest";
import {
  readRecentForecastHorizon,
  rememberForecastHorizon,
  recentForecastHorizonStorageKey,
} from "../components/selected-location";

describe("forecast range across subjects", () => {
  it("restores each explicitly selected horizon and tolerates blocked storage", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
    };
    for (const horizon of ["24h", "48h", "72h", "7d"] as const) {
      rememberForecastHorizon(horizon, storage);
      expect(readRecentForecastHorizon(storage)).toBe(horizon);
    }
    entries.set(recentForecastHorizonStorageKey, "invalid");
    expect(readRecentForecastHorizon(storage)).toBeNull();
    const blocked = {
      ...storage,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => rememberForecastHorizon("7d", blocked)).not.toThrow();
    expect(readRecentForecastHorizon(blocked)).toBeNull();
  });
});
