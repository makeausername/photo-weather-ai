import { describe, expect, it } from "vitest";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";
import { fuseWeatherSources, targetPriorityFields, type WeatherDataBundle } from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

describe("weather source fusion", () => {
  it("increases confidence when two sources agree within thresholds", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "和风天气", hour({ cloudTotal: 48, visibility: 22 })),
        bundle("open_meteo", "Open-Meteo", hour({ cloudTotal: 50, visibility: 23 })),
      ],
      target: "glow",
      location: { name: "黄山光明顶", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.conflictFlags).toHaveLength(0);
    expect(result.confidenceByField.cloudTotal).toBeGreaterThan(0.8);
    expect(result.confidenceByTarget.glow).toBeGreaterThan(0.75);
    expect(result.fusedHourly[0]?.cloudLow).toBe(20);
  });

  it("lowers confidence and records conflict flags when fields diverge", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "和风天气", hour({ cloudTotal: 12, visibility: 28 })),
        bundle("open_meteo", "Open-Meteo", hour({ cloudTotal: 90, visibility: 4 })),
      ],
      target: "astro",
      location: { name: "黄山光明顶", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.conflictFlags.map((flag) => flag.field)).toEqual(
      expect.arrayContaining(["cloudTotal", "visibility"]),
    );
    expect(result.confidenceByField.cloudTotal).toBeLessThan(0.7);
    expect(result.confidenceByTarget.astro).toBeLessThan(0.75);
    expect(result.summary.multiSourceAgreementContext).toMatchObject({
      agreementLevel: "low",
      disagreementLevel: "high",
      shouldShowReviewWarning: true,
    });
    expect(result.summary.multiSourceAgreementContext?.fieldDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "cloudTotal", level: "high" }),
        expect.objectContaining({ field: "visibility", level: "high" }),
      ]),
    );
    expect(result.summary.conflictStatusZh).toContain("差异");
  });

  it("keeps precipitation probability nullable while using amount for rain confidence", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle(
          "qweather",
          "和风天气",
          hour({
            providerCode: "qweather",
            precipitationProbability: null,
            precipitation: 12,
            precipitationAmountMm: 12,
            rainAmountMm: 12,
            missingFields: ["precipitationProbability"],
          }),
        ),
        bundle(
          "open_meteo",
          "Open-Meteo",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "Open-Meteo",
            precipitationProbability: null,
            precipitation: 10,
            precipitationAmountMm: 10,
            rainAmountMm: 10,
            missingFields: ["precipitationProbability"],
          }),
        ),
      ],
      target: "general",
      location: { name: "高山机位", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.fusedHourly[0]?.precipitationProbability).toBeNull();
    expect(result.fusedHourly[0]?.precipitationAmountMm).toBe(10);
    expect(result.fusedHourly[0]?.fieldMetadata?.precipitationProbability).toMatchObject({
      value: null,
      missingReason: "provider_field_missing",
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.precipitationAmountMm).toMatchObject({
      value: 10,
      providerCode: "open_meteo",
      estimated: false,
    });
    expect(result.confidenceByField.precipitation).toBeGreaterThanOrEqual(0.8);
    expect(result.confidenceByTarget.general).toBeGreaterThanOrEqual(0.55);
  });

  it("keeps target-specific field priorities explicit", () => {
    expect(targetPriorityFields("cloud_sea")).toEqual(
      expect.arrayContaining(["humidity", "dewPointSpread", "cloudLow", "terrain.elevationDiff"]),
    );
    expect(targetPriorityFields("glow")).toEqual(
      expect.arrayContaining(["cloudLow", "cloudMid", "cloudHigh", "astro.twilight"]),
    );
    expect(targetPriorityFields("astro")).toEqual(
      expect.arrayContaining(["cloudTotal", "visibility", "astro.moonImpact", "lightPollution"]),
    );
  });
});

function bundle(
  providerCode: "qweather" | "open_meteo",
  providerLabelZh: string,
  hourly: NormalizedHourlyWeather,
): WeatherDataBundle {
  return {
    hourly: [hourly],
    daily: [],
    alerts: [],
    providerCode,
    providerLabelZh,
    dataMode: "fixture",
    generatedAt: "2026-05-22T00:00:00+08:00",
    noticeZh: `天气数据：${providerLabelZh}`,
    missingFields: hourly.missingFields ?? [],
    estimatedFields: hourly.estimatedFields ?? [],
  };
}

function hour(overrides: Partial<NormalizedHourlyWeather> = {}): NormalizedHourlyWeather {
  return {
    time: "2026-05-22T06:00:00+08:00",
    temperature: 15,
    feelsLike: 14,
    humidity: 82,
    dewPointSpread: 2.8,
    pressure: 1006,
    windSpeed: 2.6,
    windGust: 4.2,
    windDirection: 135,
    precipitationProbability: 12,
    precipitation: 0,
    visibility: 22,
    dewPoint: 12.2,
    cloudTotal: 48,
    cloudLow: 20,
    cloudMid: 35,
    cloudHigh: 42,
    weatherCode: "3",
    providerCode: "open_meteo",
    providerLabelZh: "Open-Meteo",
    dataMode: "fixture",
    sourceConfidence: 0.82,
    missingFields: [],
    ...overrides,
  };
}
