import { describe, expect, it, vi } from "vitest";
import {
  OpenMeteoIconCloudLayerClient,
  OpenMeteoIconCloudLayerProvider,
  normalizeOpenMeteoIconCloudLayers,
  normalizeOpenMeteoIconDailyWeather,
} from "../open-meteo-icon-cloud-layer-provider.js";
import { WeatherDataService, WeatherIntelligenceService } from "../service.js";
import { QWeatherClient } from "../qweather-client.js";
import { QWeatherRealProvider } from "../qweather-real-provider.js";
import { QWeatherProvider } from "../qweather-provider.js";
import { weatherConditionFromCode } from "../normalization.js";
import { normalizeQWeatherAlerts } from "../qweather-alerts.js";
import { OpenMeteoProvider } from "../open-meteo-provider.js";

const coordinates = { latitude: 30, longitude: 118, system: "wgs84" as const };
const time = "2026-09-30T10:00:00+08:00";
function openBody(elevation = 100) {
  return {
    elevation,
    utc_offset_seconds: 28800,
    hourly: {
      time: [time],
      temperature_2m: [elevation / 100],
      relative_humidity_2m: [80],
      dew_point_2m: [0],
      cloud_cover: [80],
      cloud_cover_low: [50],
      cloud_cover_mid: [20],
      cloud_cover_high: [10],
      wind_speed_10m: [2],
      wind_gusts_10m: [3],
      visibility: [20000],
      precipitation: [10],
      precipitation_probability: [80],
      rain: [0],
      snowfall: [7],
      weather_code: [73],
    },
    daily: {
      time: ["2026-09-30"],
      temperature_2m_min: [0],
      temperature_2m_max: [2],
      snowfall_sum: [7],
      precipitation_sum: [10],
      weather_code: [73],
    },
  };
}
function qProvider(now: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return new QWeatherRealProvider({
    client: new QWeatherClient({
      apiKey: "test",
      apiHost: "qweather.test",
      language: "zh",
      unit: "metric",
      timeoutMs: 1000,
      retryCount: 0,
      fetcher: vi.fn(
        async () => new Response(JSON.stringify({ code: "200", now, ...extra })),
      ) as typeof fetch,
    }),
  });
}
const validNow = {
  obsTime: time,
  temp: "20",
  humidity: "80",
  cloud: "50",
  windSpeed: "7.2",
  vis: "0.2",
  icon: "100",
  text: "晴",
};

describe("data pipeline boundary regressions", () => {
  it("does not reuse weather for a different elevation", async () => {
    const fetcher = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify(openBody(Number(new URL(String(url)).searchParams.get("elevation")))),
        ),
    );
    const service = new WeatherIntelligenceService({
      providers: [
        new OpenMeteoIconCloudLayerProvider({
          client: new OpenMeteoIconCloudLayerClient({
            fetcher: fetcher as typeof fetch,
            retryCount: 0,
          }),
        }),
      ],
    });
    const request = {
      coordinates,
      hours: 24,
      horizon: "24h" as const,
      target: "general" as const,
      forecastStart: time,
      forecastEnd: "2026-10-01T10:00:00+08:00",
    };
    const low = await service.getWeatherDataBundle({ ...request, elevationMeters: 100 });
    const high = await service.getWeatherDataBundle({ ...request, elevationMeters: 2000 });
    expect(low.hourly[0]?.temperature).toBe(1);
    expect(high.hourly[0]?.temperature).toBe(20);
    expect(high.hourly[0]?.selectedSpotElevationMeters).toBe(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await service.getWeatherDataBundle({ ...request, elevationMeters: 2000 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retains current fog visibility even if hourly data is clear or missing", async () => {
    const provider = new QWeatherProvider();
    const current = await provider.getCurrentWeather({ coordinates });
    vi.spyOn(provider, "getCurrentWeather").mockResolvedValue({
      ...current,
      observedAt: time,
      visibilityKilometers: 0.2,
    });
    const hourly = await provider.getHourlyForecast({ coordinates, hours: 1 });
    vi.spyOn(provider, "getHourlyForecast").mockResolvedValue([{ ...hourly[0]!, visibility: 20 }]);
    let result = await new WeatherDataService(provider).getWeatherDataBundle({ coordinates });
    expect(result.currentWeather?.visibility).toBe(0.2);
    vi.spyOn(provider, "getHourlyForecast").mockResolvedValue([
      { ...hourly[0]!, visibility: null, missingFields: ["visibility"] },
    ]);
    result = await new WeatherDataService(provider).getWeatherDataBundle({ coordinates });
    expect(result.currentWeather?.visibility).toBe(0.2);
    expect(result.currentWeather?.missingFields).not.toContain("visibility");
  });

  it.each(["temp", "humidity", "cloud", "windSpeed"])(
    "rejects empty required current %s instead of zero",
    async (field) => {
      for (const missing of [null, "", " "]) {
        await expect(
          qProvider({ ...validNow, [field]: missing }).getCurrentWeather({ coordinates }),
        ).rejects.toThrow("missing required field");
      }
    },
  );
  it("preserves genuine zero readings and null optional observations", async () => {
    const result = await qProvider({
      ...validNow,
      temp: "0",
      cloud: "0",
      windSpeed: "0",
      vis: null,
      feelsLike: "",
    }).getCurrentWeather({ coordinates });
    expect(result.temperatureCelsius).toBe(0);
    expect(result.feelsLikeCelsius).toBe(0);
    expect(result.visibilityKilometers).toBeNull();
  });

  it.each([
    ["100", "clear"],
    ["150", "clear"],
    ["101", "partly_cloudy"],
    ["104", "cloudy"],
    ["300", "rain"],
    ["400", "snow"],
    ["45", "fog"],
    ["85", "snow"],
    ["95", "rain"],
  ])("classifies code %s as %s", (code, expected) => {
    expect(weatherConditionFromCode(code!)).toBe(expected);
  });
  it("converts hourly and daily snow depth to precipitation water equivalent", () => {
    expect(normalizeOpenMeteoIconCloudLayers(openBody())[0]?.snowAmountMm).toBe(10);
    expect(normalizeOpenMeteoIconDailyWeather(openBody())[0]?.snowAmountMm).toBe(10);
    const provider = new OpenMeteoProvider();
    expect(provider.normalizeHourlyWeather(openBody())[0]?.snowAmountMm).toBe(10);
    expect(provider.normalizeDailyWeather(openBody())[0]?.snowAmountMm).toBe(10);
  });

  it("parses alert lifecycle and does not revive canceled or superseded warnings", () => {
    const alert = {
      id: "original",
      headline: "强风预警",
      description: "大风",
      severity: "severe",
      effectiveTime: time,
      expireTime: "2026-10-01T00:00:00+08:00",
      color: { code: "orange" },
    };
    const result = normalizeQWeatherAlerts({
      metadata: { attributions: ["Official warning"] },
      alerts: [
        alert,
        { ...alert, id: "updated", messageType: { code: "update", supersedes: ["original"] } },
      ],
    });
    expect(result.map((warning) => warning.id)).toEqual(["updated"]);
    expect(result[0]).toMatchObject({ level: "orange", attributions: ["Official warning"] });
    expect(
      normalizeQWeatherAlerts({
        alerts: [
          alert,
          { id: "cancel", messageType: { code: "cancel", supersedes: ["original"] } },
        ],
      }),
    ).toEqual([]);
    expect(() => normalizeQWeatherAlerts({})).toThrow();
    expect(normalizeQWeatherAlerts({ metadata: { zeroResult: true } })).toEqual([]);
  });
});
