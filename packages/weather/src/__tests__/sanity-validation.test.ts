import { describe, expect, it } from "vitest";
import { validateWeatherBundleSanity, type WeatherDataBundle } from "../index";

describe("normalized weather sanity validation", () => {
  it("rejects severe unit/range errors and only clamps mild boundaries", () => {
    const bundle = {
      hourly: [
        {
          time: "2026-07-11T00:00:00+08:00",
          temperature: 20,
          feelsLike: 20,
          humidity: 100.02,
          dewPoint: 15,
          pressure: 101325,
          windSpeed: -4,
          windGust: null,
          windDirection: 0,
          precipitationProbability: 140,
          precipitation: -2,
          visibility: 626.9,
          rawVisibilityKm: 626.9,
          cloudTotal: 150,
          cloudLow: 25,
          cloudMid: 25,
          cloudHigh: 25,
          weatherCode: "1",
          providerCode: "open_meteo",
          sourceConfidence: 0.9,
        },
      ],
      daily: [],
      alerts: [],
      providerCode: "open_meteo",
      providerLabelZh: "Open-Meteo",
      dataMode: "real",
      generatedAt: "2026-07-11T00:00:00+08:00",
      noticeZh: "test",
    } satisfies WeatherDataBundle;

    expect(() => validateWeatherBundleSanity(bundle)).toThrow(
      "Weather provider returned invalid required field: cloudTotal",
    );
  });
});
