import { describe, expect, it } from "vitest";
import { MockWeatherProvider } from "../index";

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
  });

  it("returns bounded hourly forecasts", async () => {
    const provider = new MockWeatherProvider();
    const forecast = await provider.getHourlyForecast(coordinates, { hours: 2 });

    expect(forecast.hours).toHaveLength(2);
    expect(forecast.hours[0]?.startsAt).toBe("2026-01-01T06:00:00.000Z");
  });
});
