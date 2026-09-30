import { afterEach, describe, expect, it, vi } from "vitest";
import type { ForecastCalculationResult, ForecastQueryInput } from "@photo-weather/shared";
import {
  buildSubjectDetailDeepLink,
  buildSubjectDetailFallbackRequest,
  parseSubjectDetailSearchParams,
  readForecastResultContext,
  writeForecastResultContext,
} from "./subject-detail-links";

const prefix = "photo_weather_forecast_result_context:v1:";
const query: ForecastQueryInput = {
  name: "黄山",
  source: "manual",
  target: "general",
  horizon: "7d",
  latitudeGcj02: 30,
  longitudeGcj02: 118,
  latitudeWgs84: 30,
  longitudeWgs84: 118,
};
const result = {
  place: { name: "黄山" },
  forecastStart: "2026-09-30T17:17:00+08:00",
  forecastEnd: "2026-10-07T17:17:00+08:00",
  generatedAt: "2026-09-30T09:17:00Z",
  calendarBasis: { timezone: "Asia/Shanghai" },
  dataNotice: "小时天气与报告证据".repeat(30000),
} as ForecastCalculationResult;
class QuotaStorage {
  entries = new Map<string, string>();
  constructor(private budget = 5 * 1024 * 1024) {}
  get length() {
    return this.entries.size;
  }
  key(index: number) {
    return [...this.entries.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
  setItem(key: string, value: string) {
    const used = [...this.entries]
      .filter(([k]) => k !== key)
      .reduce((n, [k, v]) => n + (k.length + v.length) * 2, 0);
    if (used + (key.length + value.length) * 2 > this.budget) throw new Error("QuotaExceededError");
    this.entries.set(key, value);
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("multi-location detail context", () => {
  it("keeps six large reports readable across three query rounds", async () => {
    const storage = new QuotaStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
    const places = ["黄山", "牛背山", "外滩", "北岐", "鸣沙山", "梧桐山"];
    for (let round = 0; round < 3; round++) {
      const roundResult = {
        ...result,
        generatedAt: new Date(Date.parse(result.generatedAt) + round * 60000).toISOString(),
      };
      const ids = [];
      for (const name of places)
        ids.push(
          await writeForecastResultContext({ query: { ...query, name }, result: roundResult }),
        );
      for (let index = 0; index < ids.length; index++) {
        expect(ids[index]).not.toBeNull();
        const record = await readForecastResultContext(ids[index]!);
        expect(record?.query.name).toBe(places[index]);
        expect(record?.result).toEqual(roundResult);
      }
    }
  });
  it("evicts only old report contexts when compression is unavailable and quota is tight", async () => {
    const storage = new QuotaStorage(2000);
    vi.stubGlobal("window", { sessionStorage: storage });
    vi.stubGlobal("CompressionStream", undefined);
    storage.setItem("unrelated-setting", "keep");
    storage.setItem(`${prefix}old`, "old".repeat(220));
    const id = await writeForecastResultContext({
      query,
      result: { ...result, dataNotice: "new".repeat(30) },
    });
    expect(id).not.toBeNull();
    expect(storage.getItem(`${prefix}old`)).toBeNull();
    expect(storage.getItem("unrelated-setting")).toBe("keep");
    expect((await readForecastResultContext(id!))?.result.forecastStart).toBe(result.forecastStart);
  });
  it("expires stored contexts and retains the original range in fallback requests", async () => {
    const storage = new QuotaStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
    vi.useFakeTimers();
    const id = await writeForecastResultContext({ query, result });
    vi.setSystemTime(Date.now() + 3_600_001);
    expect(await readForecastResultContext(id!)).toBeNull();
    const href = buildSubjectDetailDeepLink({
      query,
      result,
      resultId: id!,
      target: "astro",
      date: "2026-10-05",
    });
    const parsed = parseSubjectDetailSearchParams(
      "astro",
      Object.fromEntries(new URL(href, "http://localhost").searchParams),
    );
    expect(parsed.kind).toBe("ready");
    if (parsed.kind === "ready") {
      const request = buildSubjectDetailFallbackRequest(parsed);
      expect(request).toMatchObject({
        target: "general",
        horizon: "7d",
        startDateTime: result.forecastStart,
      });
      expect(parsed.context.forecastEnd).toBe(result.forecastEnd);
    }
  });
});
