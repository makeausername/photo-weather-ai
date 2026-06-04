import { describe, expect, it, vi } from "vitest";
import { buildOpenMeteoForecastUrl, OpenMeteoClient } from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

describe("OpenMeteoClient", () => {
  it("resolves free mode without API keys", () => {
    const url = new URL(
      buildOpenMeteoForecastUrl(
        {
          endpoint: "https://api.open-meteo.com",
          mode: "free",
          timezone: "Asia/Shanghai",
        },
        { coordinates, hours: 24, days: 1 },
      ),
    );

    expect(url.origin).toBe("https://api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("apikey")).toBeNull();
    expect(url.searchParams.get("timezone")).toBe("Asia/Shanghai");
    expect(url.searchParams.get("forecast_hours")).toBe("24");
    expect(url.searchParams.get("forecast_days")).toBe("1");
    expect(url.searchParams.get("hourly")).toContain("cloud_cover_low");
    expect(url.searchParams.get("hourly")).not.toContain("apparent_temperature");
    expect(url.searchParams.get("current")).toBe(
      "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code",
    );
  });

  it("resolves customer mode with the apikey parameter only when provided", () => {
    const url = new URL(
      buildOpenMeteoForecastUrl(
        {
          endpoint: "https://customer-api.open-meteo.com",
          mode: "customer",
          apiKey: "open-meteo-secret",
          timezone: "Asia/Shanghai",
          modelPreference: "best_match",
        },
        { coordinates, hours: 48, days: 2 },
      ),
    );

    expect(url.origin).toBe("https://customer-api.open-meteo.com");
    expect(url.pathname).toBe("/v1/forecast");
    expect(url.searchParams.get("apikey")).toBe("open-meteo-secret");
    expect(url.searchParams.get("models")).toBe("best_match");
    expect(url.searchParams.get("forecast_hours")).toBe("48");
    expect(url.searchParams.get("forecast_days")).toBe("2");
  });

  it("allows rolling future48 day-based coverage to request three forecast days", () => {
    const url = new URL(
      buildOpenMeteoForecastUrl(
        {
          endpoint: "https://api.open-meteo.com",
          mode: "free",
          timezone: "Asia/Shanghai",
        },
        { coordinates, hours: 54, days: 3 },
      ),
    );

    expect(url.searchParams.get("forecast_hours")).toBe("54");
    expect(url.searchParams.get("forecast_days")).toBe("3");
  });

  it("uses mocked fetch for connection tests", async () => {
    const fetcher = vi.fn(async () => ({
      status: 200,
      text: async () => JSON.stringify({ hourly: { time: [] }, daily: { time: [] } }),
    })) as unknown as typeof fetch;
    const client = new OpenMeteoClient({
      endpoint: "https://api.open-meteo.com",
      mode: "free",
      timezone: "Asia/Shanghai",
      timeoutMs: 1000,
      retryCount: 0,
      fetcher,
    });

    await expect(client.testConnection()).resolves.toMatchObject({
      success: true,
      mode: "free",
      statusCode: 200,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns a safe parse error without leaking request details", async () => {
    const fetcher = vi.fn(async () => new Response("not-json", { status: 200 }));
    const client = new OpenMeteoClient({
      endpoint: "https://api.open-meteo.com",
      mode: "free",
      timezone: "Asia/Shanghai",
      timeoutMs: 1000,
      retryCount: 0,
      fetcher,
    });

    await expect(client.fetchForecast({ coordinates, hours: 24 })).rejects.toMatchObject({
      errorCategory: "parse_error",
      messageZh: "Open-Meteo 返回格式异常",
    });
  });
});
