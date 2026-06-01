import { describe, expect, it, vi } from "vitest";
import {
  buildOpenMeteoIconCloudLayerUrl,
  normalizeOpenMeteoIconCloudLayers,
  OpenMeteoIconCloudLayerClient,
  OpenMeteoIconCloudLayerProvider,
  WeatherIntelligenceService,
  type WeatherRequestInput,
} from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

describe("OpenMeteoIconCloudLayerProvider", () => {
  it("builds a public ICON cloud-layer URL with 72h, timezone, elevation, and explicit units", () => {
    const url = new URL(
      buildOpenMeteoIconCloudLayerUrl(
        {
          endpoint: "https://api.open-meteo.com/v1",
          mode: "free",
          timezone: "Asia/Shanghai",
          timeoutMs: 1000,
          retryCount: 0,
          modelName: "icon_global",
        },
        {
          coordinates,
          elevationMeters: 1860,
          forecastHours: 48,
          timezone: "Asia/Shanghai",
        },
      ),
    );

    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("apikey")).toBeNull();
    expect(url.searchParams.get("forecast_hours")).toBe("72");
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("elevation")).toBe("1860");
    expect(url.searchParams.get("temperature_unit")).toBe("celsius");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("precipitation_unit")).toBe("mm");
    expect(url.searchParams.get("models")).toBe("icon_global");
    expect(url.searchParams.get("hourly")?.split(",")).toEqual(
      expect.arrayContaining([
        "cloud_cover",
        "cloud_cover_low",
        "cloud_cover_mid",
        "cloud_cover_high",
        "temperature_2m",
        "relative_humidity_2m",
        "dew_point_2m",
        "precipitation",
        "precipitation_probability",
        "visibility",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "weather_code",
      ]),
    );
  });

  it("omits elevation when no real elevation is available", () => {
    const url = new URL(
      buildOpenMeteoIconCloudLayerUrl(
        {
          endpoint: "https://api.open-meteo.com",
          mode: "free",
          timezone: "Asia/Shanghai",
          timeoutMs: 1000,
          retryCount: 0,
          modelName: "icon_global",
        },
        { coordinates, forecastHours: 72 },
      ),
    );

    expect(url.searchParams.get("elevation")).toBeNull();
    expect(url.searchParams.get("forecast_hours")).toBe("72");
  });

  it("normalizes same-source total, low, mid, and high cloud layers without filling gaps", () => {
    const [complete, partial] = normalizeOpenMeteoIconCloudLayers(payload({ hours: 2 }));

    expect(complete).toMatchObject({
      cloudTotal: 55,
      cloudLow: 24,
      cloudMid: 38,
      cloudHigh: 48,
      dewPoint: 10,
      humidity: 84,
      precipitationAmountMm: 0,
      precipitationProbabilityPercent: 12,
      visibility: 22,
      windSpeed: 4.5,
      windGust: 8.1,
      weatherCode: "2",
    });
    expect(complete?.fieldMetadata?.cloudLow).toMatchObject({
      providerCode: "open_meteo",
      estimated: false,
      value: 24,
    });

    expect(partial?.cloudTotal).toBe(60);
    expect(partial?.cloudLow).toBeNull();
    expect(partial?.cloudMid).toBe(40);
    expect(partial?.cloudHigh).toBeNull();
    expect(partial?.missingFields).toEqual(expect.arrayContaining(["cloudLow", "cloudHigh"]));
    expect(partial?.fieldMetadata?.cloudLow).toMatchObject({
      providerCode: "open_meteo",
      estimated: false,
      value: null,
      missingReason: "provider_field_missing",
    });
  });

  it("falls back safely when the ICON cloud-layer request fails", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
    const provider = new OpenMeteoIconCloudLayerProvider({
      client: new OpenMeteoIconCloudLayerClient({
        endpoint: "https://api.open-meteo.com",
        timeoutMs: 1000,
        retryCount: 0,
        fetcher,
      }),
    });
    const service = new WeatherIntelligenceService({
      providers: [provider],
    });

    const bundle = await service.getWeatherDataBundle(requestInput());

    expect(bundle.dataMode).toBe("fallback");
    expect(bundle.hourly.length).toBeGreaterThan(0);
    expect(bundle.sourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerCode: "open_meteo",
          status: "failed",
          success: false,
          diagnosticStatus: "icon_layer_source_failed",
          missingFields: expect.arrayContaining([
            "cloudTotal",
            "cloudLow",
            "cloudMid",
            "cloudHigh",
          ]),
        }),
        expect.objectContaining({ providerCode: "mock", status: "fallback" }),
      ]),
    );
  });
});

function requestInput(): WeatherRequestInput {
  return {
    coordinates,
    horizon: "72h",
    hours: 72,
    days: 3,
    forecastStart: "2026-05-20T00:00:00+08:00",
    forecastEnd: "2026-05-23T00:00:00+08:00",
    target: "cloud_sea",
    timezone: "Asia/Shanghai",
  };
}

function payload(options: { readonly hours: number }) {
  const time = Array.from({ length: options.hours }, (_, index) =>
    `2026-05-20T${String(index).padStart(2, "0")}:00`,
  );

  return {
    utc_offset_seconds: 28800,
    elevation: 1850,
    hourly: {
      time,
      temperature_2m: [12, 13],
      relative_humidity_2m: [84, 86],
      dew_point_2m: [10, 11],
      cloud_cover: [55, 60],
      cloud_cover_low: [24, null],
      cloud_cover_mid: [38, 40],
      cloud_cover_high: [48, null],
      precipitation: [0, 0],
      precipitation_probability: [12, 16],
      visibility: [22000, 18000],
      wind_speed_10m: [4.5, 5.2],
      wind_direction_10m: [125, 128],
      wind_gusts_10m: [8.1, 8.8],
      weather_code: [2, 3],
      pressure_msl: [1008, 1007],
    },
  };
}
