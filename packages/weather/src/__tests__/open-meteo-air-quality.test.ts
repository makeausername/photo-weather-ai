import { describe, expect, it } from "vitest";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";
import {
  attachAirQualityToHourly,
  buildOpenMeteoAirQualityUrl,
  normalizeOpenMeteoAirQuality,
} from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

describe("Open-Meteo air-quality aerosol normalization", () => {
  it("requests real aerosol and particulate fields without provider-side defaults", () => {
    const url = new URL(
      buildOpenMeteoAirQualityUrl(
        {
          endpoint: "https://air-quality-api.open-meteo.com/v1",
          timezone: "Asia/Shanghai",
          timeoutMs: 1000,
          retryCount: 0,
        },
        {
          coordinates,
          forecastHours: 48,
          timezone: "Asia/Shanghai",
        },
      ),
    );

    expect(url.origin).toBe("https://air-quality-api.open-meteo.com");
    expect(url.pathname).toBe("/v1/air-quality");
    expect(url.searchParams.get("forecast_hours")).toBe("48");
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("hourly")?.split(",")).toEqual([
      "pm10",
      "pm2_5",
      "aerosol_optical_depth",
      "dust",
    ]);
  });

  it("preserves valid time, source resolution, and missing aerosol values", () => {
    const airQuality = normalizeOpenMeteoAirQuality(
      {
        utc_offset_seconds: 28800,
        hourly: {
          time: ["2026-05-20T08:00", "2026-05-20T09:00"],
          pm10: [30, null],
          pm2_5: [16, null],
          aerosol_optical_depth: [0.12, null],
          dust: [8, null],
        },
      },
      { providerCode: "open_meteo", forecastHours: 2 },
    );

    expect(airQuality.hourly?.[0]).toMatchObject({
      aerosolOpticalDepth550: 0.12,
      pm25: 16,
      pm10: 30,
      dust: 8,
      aerosolValidTime: "2026-05-20T08:00:00+08:00",
      aerosolSourceResolutionHours: 1,
      aerosolAvailability: "available",
      aerosolConfidence: "high",
    });
    expect(airQuality.hourly?.[1]).toMatchObject({
      aerosolOpticalDepth550: null,
      pm25: null,
      pm10: null,
      dust: null,
      aerosolAvailability: "unavailable",
    });
  });

  it("attaches only real aerosol references to matching hourly forecast rows", () => {
    const airQuality = normalizeOpenMeteoAirQuality(
      {
        utc_offset_seconds: 28800,
        hourly: {
          time: ["2026-05-20T08:00", "2026-05-20T09:00"],
          pm10: [30, null],
          pm2_5: [16, null],
          aerosol_optical_depth: [0.12, null],
          dust: [8, null],
        },
      },
      { providerCode: "open_meteo", forecastHours: 2 },
    );
    const rows = attachAirQualityToHourly(
      [
        hour("2026-05-20T08:00:00+08:00"),
        hour("2026-05-20T09:00:00+08:00"),
      ],
      airQuality,
    );

    expect(rows[0]).toMatchObject({
      aerosolOpticalDepth550: 0.12,
      pm25: 16,
      pm10: 30,
      dust: 8,
      aerosolValidTime: "2026-05-20T08:00:00+08:00",
    });
    expect(rows[1]?.aerosolOpticalDepth550).toBeUndefined();
    expect(rows[1]?.pm25).toBeUndefined();
  });
});

function hour(time: string): NormalizedHourlyWeather {
  return {
    time,
    temperature: 12,
    feelsLike: 12,
    humidity: 60,
    dewPoint: 5,
    pressure: 1010,
    windSpeed: 2,
    windGust: null,
    windDirection: 180,
    precipitationProbability: 0,
    precipitation: 0,
    visibility: 20,
    cloudTotal: 40,
    cloudLow: 10,
    cloudMid: 30,
    cloudHigh: 40,
    weatherCode: "1",
    providerCode: "open_meteo",
    sourceConfidence: 0.9,
  };
}
