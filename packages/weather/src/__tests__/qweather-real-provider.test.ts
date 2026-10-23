import { describe, expect, it, vi } from "vitest";
import { QWeatherClient, QWeatherRealProvider } from "../index";

describe("QWeatherRealProvider unavailable auxiliary data", () => {
  it("uses the dedicated HTTPS host and a header-only API key for hourly requests", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: "200", hourly: [] })));
    const client = new QWeatherClient({
      apiKey: "test-only-secret",
      apiHost: "https://example.qweatherapi.com/",
      timeoutMs: 1000,
      retryCount: 0,
      language: "zh",
      unit: "metric",
      fetcher,
    });
    await client.fetchWeatherHourly("113.3155,33.7309", 168);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(new URL(url).origin).toBe("https://example.qweatherapi.com");
    expect(new URL(url).pathname).toBe("/v7/weather/72h");
    expect(new URL(url).searchParams.get("location")).toBe("113.3155,33.7309");
    expect(url).not.toContain("test-only-secret");
    expect(init.headers).toEqual({ "X-QW-Api-Key": "test-only-secret" });
  });
  it("does not fabricate clean-air zero readings", async () => {
    const provider = new QWeatherRealProvider({
      client: new QWeatherClient({
        apiKey: "secret",
        apiHost: "example.qweather.test",
        timeoutMs: 1000,
        retryCount: 0,
        language: "zh",
        unit: "metric",
        fetcher: vi.fn() as unknown as typeof fetch,
      }),
    });
    const input = {
      coordinates: { latitude: 30.2, longitude: 120.1, system: "wgs84" as const },
    };

    await expect(provider.getAirQuality(input)).resolves.toMatchObject({
      availability: "unavailable",
      aqi: null,
      category: null,
      pm25: null,
      pm10: null,
    });
  });

  it("requests real coordinate-based alerts and distinguishes no alerts from an unavailable API", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ metadata: { zeroResult: true } })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "subscription required" }), { status: 403 }),
      );
    const provider = new QWeatherRealProvider({
      client: new QWeatherClient({
        apiKey: "test-key",
        apiHost: "example.qweather.test",
        timeoutMs: 1000,
        retryCount: 0,
        language: "zh",
        unit: "metric",
        fetcher,
      }),
    });
    const input = { coordinates: { latitude: 30.2, longitude: 120.1, system: "wgs84" as const } };
    await expect(provider.getWeatherAlerts(input)).resolves.toEqual([]);
    const url = new URL(fetcher.mock.calls[0]![0]);
    expect(url.pathname).toBe("/weatheralert/v1/current/30.2/120.1");
    expect(url.searchParams.get("localTime")).toBe("true");
    await expect(provider.getWeatherAlerts(input)).rejects.toThrow("403");
  });
});
