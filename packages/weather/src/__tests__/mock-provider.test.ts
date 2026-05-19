import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { normalizedHourlyWeatherSchema } from "@photo-weather/shared";
import {
  createWeatherProvider,
  MockWeatherProvider,
  OpenMeteoProvider,
  QWeatherProvider,
} from "../index";

const coordinates = {
  latitude: 30.129,
  longitude: 118.169,
  system: "wgs84" as const,
};

describe("MockWeatherProvider", () => {
  it("returns deterministic current weather without network access", async () => {
    const provider = new MockWeatherProvider();
    const current = await provider.getCurrentWeather(coordinates);

    expect(current.provider).toBe("mock-weather");
    expect(current.cloudCoverPercent).toBe(42);
    expect(current.summary).toContain("本地模拟天气");
  });

  it("returns deterministic normalized hourly forecasts", async () => {
    const provider = new MockWeatherProvider();
    const first = await provider.getHourlyForecast(coordinates, { hours: 2 });
    const second = await provider.getHourlyForecast(coordinates, { hours: 2 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]?.time).toBe("2026-01-01T06:00:00.000Z");
    expect(first[0]?.providerCode).toBe("mock-weather");
  });
});

describe("fixture weather provider normalization", () => {
  it("normalizes QWeather hourly fixtures and leaves unavailable cloud layers null", () => {
    const fixture = readJsonFixture("qweather-hourly.json");
    const provider = new QWeatherProvider({ hourly: fixture });
    const hourly = provider.normalizeHourlyWeather(fixture);

    expect(hourly[0]).toMatchObject({
      time: "2026-05-19T09:00:00+08:00",
      temperature: 17,
      humidity: 76,
      windSpeed: 2.8,
      precipitationProbability: 18,
      precipitation: 0,
      visibility: 24,
      dewPoint: 13,
      cloudTotal: 48,
      cloudLow: null,
      cloudMid: null,
      cloudHigh: null,
      weatherCode: "101",
      providerCode: "qweather",
      sourceConfidence: 0.72,
    });
    expect(hourly[0]?.sourceNotes?.join("")).toContain("未提供低云、中云、高云分层");
    expect(() => normalizedHourlyWeatherSchema.parse(hourly[0])).not.toThrow();
  });

  it("normalizes Open-Meteo hourly fixtures with cloud layers and visibility", () => {
    const fixture = readJsonFixture("open-meteo-forecast.json");
    const provider = new OpenMeteoProvider({ forecast: fixture });
    const hourly = provider.normalizeHourlyWeather(fixture);

    expect(hourly[0]).toMatchObject({
      time: "2026-05-19T09:00:00+08:00",
      temperature: 17.4,
      feelsLike: 17.1,
      humidity: 74,
      pressure: 872.4,
      windSpeed: 3,
      windGust: 5,
      windDirection: 136,
      precipitationProbability: 16,
      precipitation: 0,
      visibility: 24,
      dewPoint: 12.8,
      cloudTotal: 45,
      cloudLow: 22,
      cloudMid: 34,
      cloudHigh: 40,
      weatherCode: "3",
      providerCode: "open_meteo",
      sourceConfidence: 0.86,
    });
    expect(() => normalizedHourlyWeatherSchema.parse(hourly[0])).not.toThrow();
  });

  it("handles missing Open-Meteo cloud layer fields safely", () => {
    const fixture = cloneRecord(readJsonFixture("open-meteo-forecast.json"));
    const hourly = cloneRecord(fixture.hourly);
    delete hourly.cloud_cover_low;
    fixture.hourly = hourly;

    const provider = new OpenMeteoProvider({ forecast: fixture });
    const normalized = provider.normalizeHourlyWeather(fixture);

    expect(normalized[0]?.cloudLow).toBeNull();
    expect(normalized[0]?.cloudMid).toBe(34);
    expect(normalized[0]?.cloudHigh).toBe(40);
    expect(normalized[0]?.sourceNotes?.join("")).toContain("缺失");
  });

  it("validates normalized hourly weather bounds", () => {
    const fixture = readJsonFixture("open-meteo-forecast.json");
    const provider = new OpenMeteoProvider({ forecast: fixture });
    const [hour] = provider.normalizeHourlyWeather(fixture);

    expect(() =>
      normalizedHourlyWeatherSchema.parse({
        ...hour,
        cloudTotal: 140,
      }),
    ).toThrow();
  });
});

describe("WeatherProviderFactory", () => {
  it("defaults to mock in local and test environments", () => {
    expect(createWeatherProvider({ nodeEnv: "development" }).source.providerCode).toBe("mock");
    expect(createWeatherProvider({ nodeEnv: "test" }).source.providerCode).toBe("mock");
  });

  it("selects fixture adapters only when explicitly requested", () => {
    expect(
      createWeatherProvider({
        provider: "qweather",
        mode: "fixture",
        nodeEnv: "test",
      }).source.displayName,
    ).toBe("和风天气");
    expect(
      createWeatherProvider({
        provider: "open_meteo",
        mode: "fixture",
        nodeEnv: "test",
      }).source.displayName,
    ).toBe("Open-Meteo");
  });

  it("fails closed for real provider mode in tests", () => {
    expect(() =>
      createWeatherProvider({
        provider: "qweather",
        mode: "real",
        nodeEnv: "test",
      }),
    ).toThrow("Real weather provider calls are disabled in tests.");
  });

  it("does not call real external network APIs from fixture adapters", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("network disabled");
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createWeatherProvider({
      provider: "open_meteo",
      mode: "fixture",
      nodeEnv: "test",
    });

    await expect(provider.getHourlyForecast(coordinates, { hours: 1 })).resolves.toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

function readJsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

function cloneRecord(input: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}
