import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { normalizedHourlyWeatherSchema } from "@photo-weather/shared";
import {
  buildQWeatherRequestUrl,
  buildQWeatherRequestHeaders,
  createWeatherProvider,
  formatQWeatherLocation,
  MockWeatherProvider,
  normalizeQWeatherApiHost,
  OpenMeteoProvider,
  QWeatherProvider,
  WeatherDataService,
} from "../index";

const coordinates = {
  latitude: 30.129,
  longitude: 118.169,
  system: "wgs84" as const,
};

describe("MockWeatherProvider", () => {
  it("returns deterministic current weather without network access", async () => {
    const provider = new MockWeatherProvider();
    const current = await provider.getCurrentWeather({ coordinates });

    expect(current.provider).toBe("mock-weather");
    expect(current.cloudCoverPercent).toBe(42);
    expect(current.summary).toContain("演示天气数据");
  });

  it("returns deterministic normalized hourly forecasts", async () => {
    const provider = new MockWeatherProvider();
    const options = {
      coordinates,
      hours: 2,
      forecastStart: "2026-05-20T00:00:00+08:00",
      timezone: "Asia/Shanghai",
    };
    const first = await provider.getHourlyForecast(options);
    const second = await provider.getHourlyForecast(options);

    expect(first).toEqual(second);
    expect(first).toHaveLength(2);
    expect(first[0]?.time).toBe("2026-05-20T00:00:00+08:00");
    expect(first[0]?.providerCode).toBe("mock");
  });

  it("uses forecastStart and forecastEnd instead of fixed mock calendar dates", async () => {
    const provider = new MockWeatherProvider();
    const hourly = await provider.getHourlyForecast({
      coordinates,
      forecastStart: "2026-05-22T03:00:00+08:00",
      forecastEnd: "2026-05-22T09:00:00+08:00",
      timezone: "Asia/Shanghai",
      target: "cloud_sea",
    });

    expect(hourly).toHaveLength(6);
    expect(hourly[0]?.time).toBe("2026-05-22T03:00:00+08:00");
    expect(hourly.at(-1)?.time).toBe("2026-05-22T08:00:00+08:00");
    expect(hourly.every((hour) => hour.time.startsWith("2026-05-22"))).toBe(true);
  });

  it("does not invent astronomy fields in mock daily weather", async () => {
    const provider = new MockWeatherProvider();
    const [daily] = await provider.getDailyForecast({
      coordinates,
      days: 1,
      forecastStart: "2026-05-20T00:00:00+08:00",
      targetDates: ["2026-05-20"],
      timezone: "Asia/Shanghai",
    });

    expect(daily?.date).toBe("2026-05-20");
    expect(daily?.sunrise).toBeUndefined();
    expect(daily?.sunset).toBeUndefined();
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
    expect(hourly[0]?.missingFields).toEqual(["cloudLow", "cloudMid", "cloudHigh"]);
    expect(hourly[0]?.estimatedFields).toBeUndefined();
    expect(hourly[0]?.sourceNotes?.join("")).toContain("未提供低云、中云、高云分层");
    expect(() => normalizedHourlyWeatherSchema.parse(hourly[0])).not.toThrow();
  });

  it("keeps missing QWeather precipitation probability null instead of defaulting to 0", () => {
    const fixture = cloneRecord(readJsonFixture("qweather-hourly.json"));
    const rows = fixture.hourly as Record<string, unknown>[];
    delete rows[0]!.pop;
    rows[0]!.precip = "3.2";

    const provider = new QWeatherProvider({ hourly: fixture });
    const [hour] = provider.normalizeHourlyWeather(fixture);

    expect(hour?.precipitationProbability).toBeNull();
    expect(hour?.precipitationProbabilityPercent).toBeNull();
    expect(hour?.precipitationAmountMm).toBe(3.2);
    expect(hour?.precipitationType).toBe("rain");
    expect(hour?.missingFields).toEqual(expect.arrayContaining(["precipitationProbability"]));
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
      pressure: 1008.4,
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

  it("keeps missing Open-Meteo probability nullable while separating rain and snow amounts", () => {
    const fixture = cloneRecord(readJsonFixture("open-meteo-forecast.json"));
    const hourly = cloneRecord(fixture.hourly);
    delete hourly.precipitation_probability;
    hourly.precipitation = [1.6, 0];
    hourly.rain = [1.2, 0];
    hourly.snowfall = [0.4, 0];
    fixture.hourly = hourly;

    const provider = new OpenMeteoProvider({ forecast: fixture });
    const [hour] = provider.normalizeHourlyWeather(fixture);

    expect(hour?.precipitationProbability).toBeNull();
    expect(hour?.precipitationProbabilityPercent).toBeNull();
    expect(hour?.precipitationAmountMm).toBe(1.6);
    expect(hour?.rainAmountMm).toBe(1.2);
    expect(hour?.snowAmountMm).toBe(0.4);
    expect(hour?.precipitationType).toBe("mixed");
    expect(hour?.missingFields).toEqual(expect.arrayContaining(["precipitationProbability"]));
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
    expect(normalized[0]?.missingFields).toEqual(["cloudLow"]);
    expect(normalized[0]?.sourceNotes?.join("")).toContain("缺失");
  });

  it("tracks estimated Open-Meteo pressure fallback fields", () => {
    const fixture = cloneRecord(readJsonFixture("open-meteo-forecast.json"));
    const hourly = cloneRecord(fixture.hourly);
    delete hourly.pressure_msl;
    fixture.hourly = hourly;

    const provider = new OpenMeteoProvider({ forecast: fixture });
    const normalized = provider.normalizeHourlyWeather(fixture);

    expect(normalized[0]?.pressure).toBe(872.4);
    expect(normalized[0]?.estimatedFields).toEqual(["pressure"]);
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

    await expect(provider.getHourlyForecast({ coordinates, hours: 1 })).resolves.toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("QWeatherClient helpers", () => {
  it("normalizes dedicated API hosts and strips accidental URL wrappers", () => {
    expect(normalizeQWeatherApiHost("xxxxx.qweatherapi.com")).toBe("xxxxx.qweatherapi.com");
    expect(normalizeQWeatherApiHost("https://xxxxx.qweatherapi.com/")).toBe(
      "xxxxx.qweatherapi.com",
    );
  });

  it("builds requests with the account API host and longitude,latitude location", () => {
    const location = formatQWeatherLocation({
      latitude: 30.1328,
      longitude: 118.1718,
      system: "wgs84",
    });
    const requestUrl = buildQWeatherRequestUrl(
      {
        apiKey: "qweather-secret",
        apiHost: "xxxxx.qweatherapi.com",
        language: "zh",
        unit: "metric",
      },
      "/v7/weather/now",
      { location },
    );
    const url = new URL(requestUrl);

    expect(url.origin).toBe("https://xxxxx.qweatherapi.com");
    expect(url.pathname).toBe("/v7/weather/now");
    expect(url.searchParams.get("location")).toBe("118.1718,30.1328");
    expect(url.searchParams.get("key")).toBeNull();
    expect(url.searchParams.get("lang")).toBe("zh");
    expect(url.searchParams.get("unit")).toBe("m");
    expect(buildQWeatherRequestHeaders({ apiKey: "qweather-secret" })).toEqual({
      "X-QW-Api-Key": "qweather-secret",
    });
  });
});

describe("WeatherDataService", () => {
  it("builds a fixture bundle with honest source status", async () => {
    const provider = new QWeatherProvider();
    const service = new WeatherDataService(provider);
    const bundle = await service.getWeatherDataBundle({
      coordinates,
      hours: 2,
      days: 2,
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-24T00:00:00+08:00",
      timezone: "Asia/Shanghai",
      target: "cloud_sea",
    });

    expect(bundle).toMatchObject({
      providerCode: "qweather",
      providerLabelZh: "和风天气样例数据",
      dataMode: "fixture",
      noticeZh: "天气数据：和风天气样例数据",
      generatedAt: "2026-05-22T00:00:00+08:00",
    });
    expect(bundle.hourly[0]?.missingFields).toEqual(["cloudLow", "cloudMid", "cloudHigh"]);
  });
});

function readJsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
}

function cloneRecord(input: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
}
