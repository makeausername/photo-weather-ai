import { describe, expect, it } from "vitest";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";
import { buildMultiSourceAgreementContext } from "../disagreement.js";
import type { WeatherDataBundle } from "../types.js";

describe("multi-source agreement context", () => {
  it("detects high low-cloud disagreement and lowers cloud sea confidence", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle("qweather", hour({ cloudLow: 18 })),
        bundle("open_meteo", hour({ cloudLow: 63 })),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("high");
    expect(context.agreementLevel).toBe("low");
    expect(context.shouldLowerConfidence).toBe(true);
    expect(context.shouldShowReviewWarning).toBe(true);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "cloudLow",
          level: "high",
          range: 45,
          sourcesAvailable: 2,
        }),
      ]),
    );
    expect(context.userSummaryZh).toContain("低云");
  });

  it("detects medium total-cloud disagreement", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle("qweather", hour({ cloudTotal: 40, cloudLow: 12 })),
        bundle("open_meteo", hour({ cloudTotal: 75, cloudLow: 14 })),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("medium");
    expect(context.shouldLowerConfidence).toBe(false);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "cloudTotal",
          level: "medium",
          range: 35,
        }),
      ]),
    );
    expect(context.userSummaryZh).toContain("低云");
  });

  it("keeps mid/high-cloud disagreement secondary when low cloud agrees", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle("qweather", hour({ cloudLow: 16, cloudMid: 18, cloudHigh: 20 })),
        bundle("meteoblue", hour({ cloudLow: 18, cloudMid: 74, cloudHigh: 82 })),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("high");
    expect(context.shouldLowerConfidence).toBe(false);
    expect(context.userSummaryZh).toContain("霞光");
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "cloudMid", level: "high" }),
        expect.objectContaining({ field: "cloudHigh", level: "high" }),
      ]),
    );
  });

  it("does not count missing low cloud in one source as disagreement", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle("qweather", hour({ cloudLow: 48 })),
        bundle("open_meteo", hour({ cloudLow: null, missingFields: ["cloudLow"] })),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("none");
    expect(context.shouldLowerConfidence).toBe(false);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "cloudLow",
          level: "unknown",
          range: null,
          sourcesAvailable: 1,
        }),
      ]),
    );
  });

  it("returns data availability limited when only one source is available", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [bundle("qweather", hour())],
      target: "cloud_sea",
    });

    expect(context.agreementLevel).toBe("unknown");
    expect(context.disagreementLevel).toBe("unknown");
    expect(context.shouldLowerConfidence).toBe(false);
    expect(context.keyWarningsZh.join(" ")).toContain("单一");
  });

  it("flags meaningful precipitation versus none as a confidence-lowering caution", () => {
    const context = buildMultiSourceAgreementContext({
      providerBundles: [
        bundle(
          "qweather",
          hour({
            precipitationAmountMm: 0,
            precipitation: 0,
            precipitationProbability: 5,
          }),
        ),
        bundle(
          "open_meteo",
          hour({
            precipitationAmountMm: 6,
            precipitation: 6,
            precipitationProbability: 82,
          }),
        ),
      ],
      target: "cloud_sea",
    });

    expect(context.disagreementLevel).toBe("high");
    expect(context.shouldLowerConfidence).toBe(true);
    expect(context.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "precipitationAmountMm", level: "high" }),
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
    time: "2026-05-22T06:00:00+08:00",
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
