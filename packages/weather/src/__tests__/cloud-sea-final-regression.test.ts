import { describe, expect, it } from "vitest";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";
import { buildMultiSourceAgreementContext } from "../disagreement.js";
import type { WeatherDataBundle } from "../types.js";

describe("Cloud Sea final regression multi-source agreement", () => {
  it("low-cloud disagreement lowers cloud sea confidence", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle("qweather", hour({ cloudLow: 18 })),
        bundle("open_meteo", hour({ cloudLow: 66 })),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("high");
    expect(context.shouldLowerConfidence).toBe(true);
    expect(context.shouldShowReviewWarning).toBe(true);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "cloudLow",
          level: "high",
          range: 48,
        }),
      ]),
    );
  });

  it("mid/high-cloud disagreement remains secondary when low cloud agrees", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle("qweather", hour({ cloudLow: 18, cloudMid: 22, cloudHigh: 20 })),
        bundle("meteoblue", hour({ cloudLow: 20, cloudMid: 74, cloudHigh: 82 })),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("high");
    expect(context.shouldLowerConfidence).toBe(false);
    expect(context.shouldShowReviewWarning).toBe(true);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "cloudHigh", level: "high" })]),
    );
    expect(context.fieldDisagreements.find((entry) => entry.field === "cloudMid")?.level).toMatch(
      /medium|high/,
    );
  });

  it("meaningful precipitation disagreement lowers confidence", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle(
          "qweather",
          hour({
            precipitationAmountMm: 0,
            precipitation: 0,
            precipitationProbability: 8,
          }),
        ),
        bundle(
          "open_meteo",
          hour({
            precipitationAmountMm: 1.6,
            precipitation: 1.6,
            precipitationProbability: 76,
          }),
        ),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("high");
    expect(context.shouldLowerConfidence).toBe(true);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "precipitationAmountMm", level: "medium" }),
        expect.objectContaining({ field: "precipitationProbability", level: "high" }),
      ]),
    );
  });
});

function bundle(
  providerCode: WeatherDataBundle["providerCode"],
  hourly: NormalizedHourlyWeather,
): Pick<WeatherDataBundle, "providerCode" | "providerLabelZh" | "dataMode" | "hourly"> {
  return {
    providerCode,
    providerLabelZh: providerCode,
    dataMode: "fixture",
    hourly: [hourly],
  };
}

function hour(overrides: Partial<NormalizedHourlyWeather> = {}): NormalizedHourlyWeather {
  return {
    time: "2026-05-20T06:00:00+08:00",
    temperature: 12,
    feelsLike: 11,
    humidity: 86,
    dewPointSpread: 2.2,
    pressure: 1008,
    windSpeed: 2.8,
    windGust: 4.1,
    windDirection: 120,
    precipitationProbability: 10,
    precipitation: 0,
    precipitationAmountMm: 0,
    visibility: 18,
    dewPoint: 9.8,
    cloudTotal: 66,
    cloudLow: 32,
    cloudMid: 28,
    cloudHigh: 24,
    weatherCode: "cloudy",
    providerCode: "qweather",
    providerLabelZh: "provider",
    dataMode: "fixture",
    sourceConfidence: 0.8,
    missingFields: [],
    ...overrides,
  };
}
