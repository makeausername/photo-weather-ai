import { describe, expect, it } from "vitest";
import type { NormalizedHourlyWeather } from "@photo-weather/shared";
import {
  fuseWeatherSources,
  openMeteoForecastCloudLayerProviderName,
  openMeteoIconCloudLayerProviderName,
  targetPriorityFields,
  type WeatherDataBundle,
  type WeatherSourceSummary,
} from "../index";

const coordinates = {
  latitude: 30.1328,
  longitude: 118.1718,
  system: "wgs84",
} as const;

describe("weather source fusion", () => {
  it("increases confidence when two sources agree within thresholds", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "鍜岄澶╂皵", hour({ cloudTotal: 48, visibility: 22 })),
        bundle("open_meteo", "Open-Meteo", hour({ cloudTotal: 50, visibility: 23 })),
      ],
      target: "glow",
      location: { name: "generic mountain", coordinates },
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
        bundle("qweather", "鍜岄澶╂皵", hour({ cloudTotal: 12, visibility: 28 })),
        bundle("open_meteo", "Open-Meteo", hour({ cloudTotal: 90, visibility: 4 })),
      ],
      target: "astro",
      location: { name: "generic mountain", coordinates },
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
          "鍜岄澶╂皵",
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
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.fusedHourly[0]?.precipitationProbability).toBeNull();
    expect(result.fusedHourly[0]?.precipitationAmountMm).toBe(12);
    expect(result.fusedHourly[0]?.fieldMetadata?.precipitationProbability).toMatchObject({
      value: null,
      missingReason: "provider_field_missing",
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.precipitationAmountMm).toMatchObject({
      value: 12,
      providerCode: "multi_model",
      consensusStrategy: "upper_percentile",
      minValue: 10,
      maxValue: 12,
      spread: 2,
      estimated: false,
    });
    expect(result.confidenceByField.precipitation).toBeGreaterThanOrEqual(0.6);
    expect(result.confidenceByTarget.general).toBeGreaterThanOrEqual(0.55);
  });

  it("uses multi-model consensus for cloud totals while preserving single-source layer fields", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle(
          "qweather",
          "閸滃矂顥撴径鈺傜毜",
          hour({
            providerCode: "qweather",
            cloudTotal: 88,
            cloudLow: null,
            cloudMid: null,
            cloudHigh: null,
            missingFields: ["cloudLow", "cloudMid", "cloudHigh"],
          }),
        ),
        bundle(
          "open_meteo",
          "浜戝眰鍒嗗眰杈呭姪",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "浜戝眰鍒嗗眰杈呭姪",
            cloudTotal: 55,
            cloudLow: 24,
            cloudMid: 38,
            cloudHigh: 48,
          }),
        ),
      ],
      target: "cloud_sea",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.fusedHourly[0]).toMatchObject({
      cloudTotal: 71.5,
      cloudLow: 24,
      cloudMid: 38,
      cloudHigh: 48,
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudTotal).toMatchObject({
      providerCode: "multi_model",
      providerLabelZh: "多模型融合",
      modelCount: 2,
      providerCount: 2,
      minValue: 55,
      maxValue: 88,
      medianValue: 71.5,
      spread: 33,
      consensusStrategy: "median",
      estimated: false,
    });
    for (const field of ["cloudLow", "cloudMid", "cloudHigh"] as const) {
      expect(result.fusedHourly[0]?.fieldMetadata?.[field]).toMatchObject({
        providerCode: "open_meteo",
        estimated: false,
      });
    }
    expect(result.summary.cloudLayerCoverage?.fieldCoverageSummary).toMatchObject({
      totalHours: 1,
      cloudLowCoverage: 1,
      cloudMidCoverage: 1,
      cloudHighCoverage: 1,
    });
    expect(result.summary.cloudLayerCoverage?.missingFieldSummary).not.toEqual(
      expect.arrayContaining([expect.stringContaining("cloudLow")]),
    );
    expect(result.confidenceByField.cloudLow).toBeGreaterThan(0.45);
  });

  it("uses Open-Meteo model consensus where two cloud layer model values exist", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle(
          "open_meteo",
          "浜戝眰鍒嗗眰杈呭姪",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "浜戝眰鍒嗗眰杈呭姪",
            cloudTotal: 62,
            cloudLow: null,
            cloudMid: 36,
            cloudHigh: null,
            missingFields: ["cloudLow", "cloudHigh"],
          }),
          {
            providerId: openMeteoIconCloudLayerProviderName,
            modelFamily: "icon",
            modelName: "icon_global",
          },
        ),
        bundle(
          "open_meteo",
          "浜戝眰鍒嗗眰琛ュ叏",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "浜戝眰鍒嗗眰琛ュ叏",
            cloudTotal: 58,
            cloudLow: 22,
            cloudMid: 40,
            cloudHigh: 51,
          }),
          {
            providerId: openMeteoForecastCloudLayerProviderName,
            modelFamily: "best_match",
            modelName: "best_match",
          },
        ),
      ],
      target: "cloud_sea",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.fusedHourly[0]).toMatchObject({
      cloudTotal: 60,
      cloudLow: 22,
      cloudMid: 38,
      cloudHigh: 51,
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudTotal).toMatchObject({
      providerCode: "multi_model",
      modelCount: 2,
      providerCount: 1,
      minValue: 58,
      maxValue: 62,
      medianValue: 60,
      spread: 4,
      consensusStrategy: "median",
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudMid).toMatchObject({
      providerCode: "multi_model",
      modelCount: 2,
      providerCount: 1,
      minValue: 36,
      maxValue: 40,
      medianValue: 38,
      spread: 4,
      consensusStrategy: "median",
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudLow).toMatchObject({
      sourceId: openMeteoForecastCloudLayerProviderName,
      basis: "fallback_same_field",
      value: 22,
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudHigh).toMatchObject({
      sourceId: openMeteoForecastCloudLayerProviderName,
      basis: "fallback_same_field",
      value: 51,
    });
    expect(result.summary.cloudLayerCoverage?.fallbackSourcesUsed).toContain(
      openMeteoForecastCloudLayerProviderName,
    );
    expect(result.summary.cloudLayerCoverage?.fieldCoverageSummary).toMatchObject({
      cloudLowCoverage: 1,
      cloudMidCoverage: 1,
      cloudHighCoverage: 1,
    });
  });

  it("uses conservative low-cloud obstruction consensus for astro when models diverge", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle(
          "open_meteo",
          "云层分层补全",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "云层分层补全",
            cloudTotal: 18,
            cloudLow: 10,
            cloudMid: 14,
            cloudHigh: 22,
          }),
          {
            providerId: `${openMeteoForecastCloudLayerProviderName}:best_match`,
            modelFamily: "open_meteo",
            modelName: "best_match",
          },
        ),
        bundle(
          "open_meteo",
          "云层分层补全",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "云层分层补全",
            cloudTotal: 74,
            cloudLow: 82,
            cloudMid: 18,
            cloudHigh: 24,
          }),
          {
            providerId: `${openMeteoForecastCloudLayerProviderName}:ecmwf_ifs025`,
            modelFamily: "open_meteo",
            modelName: "ecmwf_ifs025",
          },
        ),
      ],
      target: "astro",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.fusedHourly[0]?.cloudLow).toBe(82);
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudLow).toMatchObject({
      providerCode: "multi_model",
      modelCount: 2,
      providerCount: 1,
      minValue: 10,
      maxValue: 82,
      medianValue: 46,
      spread: 72,
      consensusStrategy: "upper_percentile",
    });
    expect(result.conflictFlags.map((flag) => flag.field)).toEqual(
      expect.arrayContaining([
        "multi_model_cloud_total_spread",
        "multi_model_low_cloud_obstruction_spread",
      ]),
    );
    expect(
      result.summary.multiModelConsensusDiagnostics?.multiModelConfidencePenaltyByTarget.astro,
    ).toBeGreaterThan(0);
    expect(result.confidenceByTarget.astro).toBeLessThan(0.7);
  });

  it("keeps missing ICON layer values null instead of backfilling them from total cloud", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle(
          "qweather",
          "閸滃矂顥撴径鈺傜毜",
          hour({
            providerCode: "qweather",
            cloudTotal: 92,
            cloudLow: null,
            cloudMid: null,
            cloudHigh: null,
            missingFields: ["cloudLow", "cloudMid", "cloudHigh"],
          }),
        ),
        bundle(
          "open_meteo",
          "浜戝眰鍒嗗眰杈呭姪",
          hour({
            providerCode: "open_meteo",
            providerLabelZh: "浜戝眰鍒嗗眰杈呭姪",
            cloudTotal: 62,
            cloudLow: null,
            cloudMid: 36,
            cloudHigh: null,
            missingFields: ["cloudLow", "cloudHigh"],
          }),
        ),
      ],
      target: "cloud_sea",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.fusedHourly[0]).toMatchObject({
      cloudTotal: 77,
      cloudLow: null,
      cloudMid: 36,
      cloudHigh: null,
    });
    expect(result.fusedHourly[0]?.missingFields).toEqual(
      expect.arrayContaining(["cloudLow", "cloudHigh"]),
    );
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudLow).toMatchObject({
      providerCode: "open_meteo",
      value: null,
      missingReason: "provider_field_missing",
    });
    expect(result.fusedHourly[0]?.fieldMetadata?.cloudTotal).toMatchObject({
      providerCode: "multi_model",
      modelCount: 2,
      minValue: 62,
      maxValue: 92,
      medianValue: 77,
      spread: 30,
    });
    expect(result.confidenceByField.cloudLow).toBeLessThanOrEqual(0.45);
    expect(result.summary.cloudLayerCoverage?.fieldCoverageSummary).toMatchObject({
      cloudLowCoverage: 0,
      cloudMidCoverage: 1,
      cloudHighCoverage: 0,
    });
  });

  it("keeps target-specific field priorities explicit", () => {
    expect(targetPriorityFields("cloud_sea")).toEqual(
      expect.arrayContaining([
        "humidity",
        "dewPointSpread",
        "cloudLow",
        "aerosolOpticalDepth550",
        "terrain.elevationDiff",
      ]),
    );
    expect(targetPriorityFields("glow")).toEqual(
      expect.arrayContaining([
        "cloudLow",
        "cloudMid",
        "cloudHigh",
        "aerosolOpticalDepth550",
        "pm25",
        "dust",
        "astro.twilight",
      ]),
    );
    expect(targetPriorityFields("astro")).toEqual(
      expect.arrayContaining([
        "cloudTotal",
        "visibility",
        "aerosolOpticalDepth550",
        "pm10",
        "astro.moonImpact",
        "lightPollution",
      ]),
    );
  });

  it("preserves auxiliary aerosol fields and lowers glow confidence for suppressed transparency", () => {
    const clean = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "閸滃矂顥撴径鈺傜毜", hour({ cloudTotal: 48, visibility: 22 })),
        bundle(
          "open_meteo",
          "Open-Meteo",
          hour({
            providerCode: "open_meteo",
            aerosolOpticalDepth550: 0.12,
            pm25: 16,
            pm10: 30,
            dust: 8,
            aerosolAvailability: "available",
            aerosolConfidence: "high",
          }),
        ),
      ],
      target: "glow",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });
    const hazy = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "閸滃矂顥撴径鈺傜毜", hour({ cloudTotal: 48, visibility: 22 })),
        bundle(
          "open_meteo",
          "Open-Meteo",
          hour({
            providerCode: "open_meteo",
            aerosolOpticalDepth550: 0.72,
            pm25: 88,
            pm10: 180,
            dust: 130,
            aerosolAvailability: "available",
            aerosolConfidence: "high",
          }),
        ),
      ],
      target: "glow",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(hazy.fusedHourly[0]).toMatchObject({
      aerosolOpticalDepth550: 0.72,
      pm25: 88,
      pm10: 180,
      dust: 130,
      aerosolAvailability: "available",
    });
    expect(hazy.confidenceByTarget.glow).toBeLessThan(clean.confidenceByTarget.glow);
    expect(hazy.confidenceByTarget.astro).toBeLessThan(clean.confidenceByTarget.astro);
    expect(hazy.confidenceByTarget.cloud_sea).toBeGreaterThan(hazy.confidenceByTarget.glow);
    expect(hazy.summary.transparencyPenaltyByTarget?.glow).toBeGreaterThan(
      hazy.summary.transparencyPenaltyByTarget?.cloud_sea ?? 0,
    );
    expect(hazy.summary.aerosolDiagnostics).toMatchObject({
      aerosolHoursAvailable: 1,
      aerosolSuppressedHours: 1,
      aerosolPoorHours: 1,
      maxAerosolOpticalDepth550: 0.72,
      maxPm25: 88,
      maxPm10: 180,
      maxDust: 130,
    });
  });

  it("flags good visibility with poor aerosol transparency without exposing provider names in copy", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "閸滃矂顥撴径鈺傜毜", hour({ cloudTotal: 20, visibility: 26 })),
        bundle(
          "open_meteo",
          "Open-Meteo",
          hour({
            providerCode: "open_meteo",
            visibility: 25,
            aerosolOpticalDepth550: 0.7,
            pm25: 42,
            pm10: 96,
            dust: 40,
            aerosolAvailability: "available",
            aerosolConfidence: "high",
          }),
        ),
      ],
      target: "astro",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.conflictFlags.map((flag) => flag.field)).toEqual(
      expect.arrayContaining(["aerosolTransparency", "aerosolVisibilityMismatch"]),
    );
    expect(result.confidenceByTarget.astro).toBeLessThan(0.75);
    expect(result.summary.aerosolConflictFlagsCount).toBeGreaterThanOrEqual(2);
    for (const note of result.conflictFlags.map((flag) => flag.noteZh)) {
      expect(note).not.toMatch(/Open-Meteo|GFS|NOAA|CAMS|meteoblue|ECMWF|NCEP|閸滃矂顥撴径鈺傜毜/i);
    }
  });

  it("keeps no-aerosol fusion behavior stable", () => {
    const result = fuseWeatherSources({
      providerBundles: [
        bundle("qweather", "閸滃矂顥撴径鈺傜毜", hour({ cloudTotal: 48, visibility: 22 })),
        bundle("open_meteo", "Open-Meteo", hour({ cloudTotal: 50, visibility: 23 })),
      ],
      target: "general",
      location: { name: "generic mountain", coordinates },
      forecastStart: "2026-05-22T00:00:00+08:00",
      forecastEnd: "2026-05-23T00:00:00+08:00",
    });

    expect(result.conflictFlags).toHaveLength(0);
    expect(result.summary.aerosolDiagnostics).toMatchObject({
      aerosolHoursAvailable: 0,
      aerosolSuppressedHours: 0,
      aerosolPoorHours: 0,
      maxAerosolOpticalDepth550: null,
    });
    expect(result.summary.transparencyPenaltyByTarget).toMatchObject({
      cloud_sea: 0,
      glow: 0,
      astro: 0,
      general: 0,
    });
    expect(result.confidenceByTarget.general).toBeGreaterThanOrEqual(0.55);
  });
});

function bundle(
  providerCode: "qweather" | "open_meteo",
  providerLabelZh: string,
  hourly: NormalizedHourlyWeather,
  sourceSummaryOverrides: Partial<WeatherSourceSummary> = {},
): WeatherDataBundle {
  return {
    hourly: [hourly],
    daily: [],
    alerts: [],
    providerCode,
    providerLabelZh,
    dataMode: "fixture",
    generatedAt: "2026-05-22T00:00:00+08:00",
    noticeZh: `澶╂皵鏁版嵁锛?{providerLabelZh}`,
    missingFields: hourly.missingFields ?? [],
    estimatedFields: hourly.estimatedFields ?? [],
    sourceSummaries: [
      {
        providerCode,
        providerLabelZh,
        dataMode: "fixture",
        enabled: true,
        realCallEnabled: false,
        attempted: true,
        success: true,
        status: "available",
        availableFields: [],
        missingFields: hourly.missingFields ?? [],
        cacheHit: false,
        generatedAt: "2026-05-22T00:00:00+08:00",
        messageZh: `${providerLabelZh} available`,
        ...sourceSummaryOverrides,
      },
    ],
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
