import { describe, expect, it, vi } from "vitest";
import { QWeatherClient, QWeatherRealProvider } from "../index";

describe("QWeatherRealProvider unavailable auxiliary data", () => {
  it("does not fabricate clean-air zero readings or claim alerts were fetched", async () => {
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
    await expect(provider.getWeatherAlerts(input)).resolves.toEqual([]);
  });
});
