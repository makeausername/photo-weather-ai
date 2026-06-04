import { describe, expect, it, vi } from "vitest";
import {
  buildOpenMeteoIconCloudLayerUrl,
  buildOpenMeteoForecastCloudLayerUrl,
  normalizeOpenMeteoIconCloudLayers,
  openMeteoForecastCloudLayerProviderName,
  OpenMeteoIconCloudLayerClient,
  openMeteoIconCloudLayerProviderName,
  OpenMeteoIconCloudLayerProvider,
  OpenMeteoForecastCloudLayerClient,
  OpenMeteoForecastCloudLayerProvider,
  WeatherIntelligenceService,
  type WeatherRequestInput,
} from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

describe("OpenMeteoIconCloudLayerProvider", () => {
  it("builds a public ICON cloud-layer URL with default 72h, timezone, elevation, and explicit units", () => {
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
          timezone: "Asia/Shanghai",
        },
      ),
    );

    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("apikey")).toBeNull();
    expect(url.searchParams.get("forecast_hours")).toBe("72");
    expect(url.searchParams.get("forecast_days")).toBe("3");
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

  it("builds a standard Open-Meteo Forecast fallback URL with explicit rolling hours", () => {
    const url = new URL(
      buildOpenMeteoForecastCloudLayerUrl(
        {
          endpoint: "https://api.open-meteo.com/v1",
          mode: "free",
          timezone: "Asia/Shanghai",
          timeoutMs: 1000,
          retryCount: 0,
        },
        {
          coordinates,
          elevationMeters: 1860,
          forecastHours: 54,
          timezone: "Asia/Shanghai",
        },
      ),
    );

    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("models")).toBeNull();
    expect(url.searchParams.get("forecast_hours")).toBe("54");
    expect(url.searchParams.get("forecast_days")).toBe("3");
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("elevation")).toBe("1860");
    expect(url.searchParams.get("wind_speed_unit")).toBe("ms");
    expect(url.searchParams.get("precipitation_unit")).toBe("mm");
    expect(url.searchParams.get("hourly")?.split(",")).toEqual(
      expect.arrayContaining([
        "cloud_cover",
        "cloud_cover_low",
        "cloud_cover_mid",
        "cloud_cover_high",
        "dew_point_2m",
        "precipitation_probability",
        "visibility",
      ]),
    );
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

  it("uses the standard Forecast provider as a safe coverage fallback when ICON is incomplete", async () => {
    const iconFetcher = vi.fn(async () => new Response(JSON.stringify(payload({ hours: 72 }))));
    const forecastFetcher = vi.fn(async () => {
      const body = payload({ hours: 72 }) as unknown as {
        hourly: {
          cloud_cover_low: unknown[];
          cloud_cover_mid: unknown[];
          cloud_cover_high: unknown[];
        };
      };
      body.hourly.cloud_cover_low = Array.from({ length: 72 }, () => 22);
      body.hourly.cloud_cover_mid = Array.from({ length: 72 }, () => 40);
      body.hourly.cloud_cover_high = Array.from({ length: 72 }, () => 51);
      return new Response(JSON.stringify(body));
    });
    const iconProvider = new OpenMeteoIconCloudLayerProvider({
      client: new OpenMeteoIconCloudLayerClient({
        endpoint: "https://api.open-meteo.com",
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: iconFetcher,
      }),
    });
    const forecastProvider = new OpenMeteoForecastCloudLayerProvider({
      client: new OpenMeteoForecastCloudLayerClient({
        endpoint: "https://api.open-meteo.com",
        timeoutMs: 1000,
        retryCount: 0,
        fetcher: forecastFetcher,
      }),
    });
    const service = new WeatherIntelligenceService({
      providers: [iconProvider, forecastProvider],
    });

    const bundle = await service.getWeatherDataBundle(requestInput());

    expect(iconFetcher).toHaveBeenCalled();
    expect(forecastFetcher).toHaveBeenCalled();
    expect(bundle.hourly).toHaveLength(72);
    expect(bundle.hourly[1]).toMatchObject({
      cloudLow: 22,
      cloudMid: 40,
      cloudHigh: 51,
    });
    expect(bundle.hourly[1]?.fieldMetadata?.cloudLow).toMatchObject({
      basis: "fallback_same_field",
    });
    expect(bundle.fusionSummary?.cloudLayerCoverage?.fieldCoverageSummary).toMatchObject({
      totalHours: 72,
      cloudLowCoverage: 72,
      cloudMidCoverage: 72,
      cloudHighCoverage: 72,
    });
  });

  it("records failed ICON coverage diagnostics while best-match fallback keeps data usable", async () => {
    const iconFetcher = vi.fn(
      async () => new Response(JSON.stringify({ reason: "ICON unavailable" }), { status: 503 }),
    );
    const forecastFetcher = vi.fn(async () => {
      const body = payload({ hours: 72 }) as unknown as {
        hourly: {
          cloud_cover_low: unknown[];
          cloud_cover_mid: unknown[];
          cloud_cover_high: unknown[];
        };
      };
      body.hourly.cloud_cover_low = Array.from({ length: 72 }, () => 22);
      body.hourly.cloud_cover_mid = Array.from({ length: 72 }, () => 40);
      body.hourly.cloud_cover_high = Array.from({ length: 72 }, () => 51);
      return new Response(JSON.stringify(body));
    });
    const service = new WeatherIntelligenceService({
      providers: [
        new OpenMeteoIconCloudLayerProvider({
          client: new OpenMeteoIconCloudLayerClient({
            endpoint: "https://api.open-meteo.com",
            timeoutMs: 1000,
            retryCount: 0,
            fetcher: iconFetcher,
          }),
        }),
        new OpenMeteoForecastCloudLayerProvider({
          client: new OpenMeteoForecastCloudLayerClient({
            endpoint: "https://api.open-meteo.com",
            timeoutMs: 1000,
            retryCount: 0,
            fetcher: forecastFetcher,
          }),
        }),
      ],
    });

    const bundle = await service.getWeatherDataBundle(requestInput());

    expect(bundle.dataMode).toBe("real");
    expect(bundle.hourly).toHaveLength(72);
    expect(bundle.sourceSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: openMeteoIconCloudLayerProviderName,
          status: "failed",
          success: false,
        }),
      ]),
    );
    expect(bundle.fusionSummary?.cloudLayerCoverage?.providerCoverageSummary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          providerId: openMeteoForecastCloudLayerProviderName,
          returnedHours: 72,
          cloudLowHours: 72,
          cloudMidHours: 72,
          cloudHighHours: 72,
        }),
        expect.objectContaining({
          providerId: openMeteoIconCloudLayerProviderName,
          returnedHours: 0,
          cloudLowHours: 0,
          cloudMidHours: 0,
          cloudHighHours: 0,
          error: expect.any(String),
        }),
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
  const time = Array.from({ length: options.hours }, (_, index) => {
    const value = new Date(Date.UTC(2026, 4, 20, index));
    const date = value.toISOString().slice(0, 10);
    const hour = String(value.getUTCHours()).padStart(2, "0");
    return `${date}T${hour}:00`;
  });

  return {
    utc_offset_seconds: 28800,
    elevation: 1850,
    hourly: {
      time,
      temperature_2m: time.map((_, index) => 12 + (index % 6)),
      relative_humidity_2m: time.map((_, index) => (index === 1 ? 86 : 84)),
      dew_point_2m: time.map((_, index) => (index === 1 ? 11 : 10)),
      cloud_cover: time.map((_, index) => (index === 1 ? 60 : 55)),
      cloud_cover_low: time.map((_, index) => (index === 1 ? null : 24)),
      cloud_cover_mid: time.map((_, index) => (index === 1 ? 40 : 38)),
      cloud_cover_high: time.map((_, index) => (index === 1 ? null : 48)),
      precipitation: time.map(() => 0),
      precipitation_probability: time.map((_, index) => (index === 1 ? 16 : 12)),
      visibility: time.map((_, index) => (index === 1 ? 18000 : 22000)),
      wind_speed_10m: time.map((_, index) => (index === 1 ? 5.2 : 4.5)),
      wind_direction_10m: time.map((_, index) => (index === 1 ? 128 : 125)),
      wind_gusts_10m: time.map((_, index) => (index === 1 ? 8.8 : 8.1)),
      weather_code: time.map((_, index) => (index === 1 ? 3 : 2)),
      pressure_msl: time.map((_, index) => (index === 1 ? 1007 : 1008)),
    },
  };
}
