import { describe, expect, it } from "vitest";
import { validateWeatherBundleSanity, type WeatherDataBundle } from "../index";

describe("normalized weather sanity validation", () => {
  it("rejects severe unit/range errors and only clamps mild boundaries", () => {
    const bundle = validateWeatherBundleSanity({
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
    } satisfies WeatherDataBundle);
    const hour = bundle.hourly[0]!;

    expect(hour.humidity).toBe(100);
    expect(hour.visibility).toBeNull();
    expect(hour.rawVisibilityKm).toBeNull();
    expect(hour.pressure).toBeNull();
    expect(hour.precipitation).toBeNull();
    expect(hour.precipitationProbability).toBeNull();
    expect(hour.missingFields).toEqual(
      expect.arrayContaining([
        "invalid:visibility",
        "invalid:pressure",
        "invalid:precipitation",
        "invalid:cloudTotal",
        "invalid:windSpeed",
      ]),
    );
    expect(hour.fieldMetadata?.visibility).toMatchObject({
      providerCode: "open_meteo",
      rawValue: 626.9,
      sourceUnit: "km",
      validationStatus: "rejected_outlier",
    });
  });
});
