import { z } from "zod";
import type { ForecastTarget } from "./types.js";

export const coordinateSystemSchema = z.enum(["wgs84", "gcj02", "bd09"]);

export const coordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  system: coordinateSystemSchema,
});

export const placeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  countryCode: z.string().length(2),
  adminArea: z.string().optional(),
  locality: z.string().optional(),
  coordinates: coordinatesSchema,
});

export const timeWindowSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().min(1),
});

export const decisionCardSchema = z.object({
  grade: z.enum(["excellent", "good", "fair", "poor"]),
  score: z.number().min(0).max(100),
  title: z.string().min(1),
  summary: z.string().min(1),
  reasons: z.array(z.string().min(1)),
  recommendedWindow: timeWindowSchema.optional(),
});

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);

export const forecastHorizonSchema = z.enum(["24h", "48h", "72h", "7d"]);

export const forecastTargetSchema = z.enum(["general", "cloud_sea", "glow", "astro"]);

const forecastTargetAliases: Readonly<Record<string, ForecastTarget>> = {
  general: "general",
  综合: "general",
  综合判断: "general",
  cloud_sea: "cloud_sea",
  cloudsea: "cloud_sea",
  云海: "cloud_sea",
  glow: "glow",
  朝霞晚霞: "glow",
  霞光: "glow",
  astro: "astro",
  stars: "astro",
  star: "astro",
  milky_way: "astro",
  milkyway: "astro",
  星空银河: "astro",
  星空: "astro",
  银河: "astro",
};

const astroScenarioFields = [
  "scenario",
  "scenarioTarget",
  "sourceScenario",
  "fixedTarget",
  "module",
] as const;

export function normalizeForecastTargetValue(value: unknown): ForecastTarget | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const aliasKey = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return forecastTargetAliases[aliasKey];
}

export function normalizeForecastQueryInput(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;
  const normalizedTarget = normalizeForecastTargetValue(record.target);
  const scenarioTarget = astroScenarioFields
    .map((field) => normalizeForecastTargetValue(record[field]))
    .find((target) => target === "astro");
  const nextTarget =
    normalizedTarget === "general" && scenarioTarget === "astro"
      ? "astro"
      : normalizedTarget ?? scenarioTarget;

  if (!nextTarget || nextTarget === record.target) {
    return input;
  }

  return {
    ...record,
    target: nextTarget,
  };
}

export const forecastQueryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80),
  latitudeGcj02: latitudeSchema,
  longitudeGcj02: longitudeSchema,
  latitudeWgs84: latitudeSchema,
  longitudeWgs84: longitudeSchema,
  horizon: forecastHorizonSchema,
  target: forecastTargetSchema,
  elevationMeters: z.number().finite().optional(),
  locationId: z.string().trim().min(1).max(120).optional(),
  photoSpotId: z.string().trim().min(1).max(120).optional(),
});

const nullableFiniteNumberSchema = z.number().finite().nullable();
const nullablePercentSchema = z.number().finite().min(0).max(100).nullable();
const weatherFieldListSchema = z.array(z.string().trim().min(1)).optional();
const precipitationTypeSchema = z.enum(["rain", "snow", "mixed", "none", "unknown"]);
const ridgeWindRiskSchema = z.enum(["low", "medium", "high"]);
const transparencyGradeSchema = z.enum(["excellent", "good", "fair", "poor"]);
const cloudFogObstructionRiskSchema = z.enum(["low", "medium", "high"]);
const precipitationRiskSchema = z.object({
  precipitationProbabilityPercent: nullablePercentSchema,
  precipitationAmountMm: nullableFiniteNumberSchema,
  rainRiskLevel: z.enum(["none", "low", "medium", "high", "severe"]),
  rainRiskLabelZh: z.string().trim().min(1),
  affectedWindows: z.array(z.string().trim().min(1)),
  recommendationZh: z.string().trim().min(1),
});
const weatherFieldMetadataSchema = z
  .record(
    z.object({
      value: z.union([z.string(), z.number().finite(), z.boolean(), z.null()]).optional(),
      providerCode: z.string().trim().min(1),
      providerLabelZh: z.string().trim().min(1).optional(),
      estimated: z.boolean(),
      missingReason: z.string().trim().min(1).optional(),
      providerElevationMeters: z.number().finite().optional(),
    }),
  )
  .optional();
const hourlyTemperatureAdjustmentSchema = z
  .object({
    rawTemperature: z.number().finite(),
    elevationAdjustedTemperature: z.number().finite(),
    correctionApplied: z.boolean(),
    correctionMeters: z.number().finite().min(0),
    correctionCelsius: z.number().finite().min(0),
    lapseRateCelsiusPer100m: z.number().finite().min(0.5).max(0.7),
    selectedSpotElevationMeters: z.number().finite(),
    providerElevationMeters: z.number().finite().optional(),
    providerElevationKnown: z.boolean(),
    correctionReason: z.enum([
      "provider_elevation_close_to_spot",
      "provider_elevation_delta_beyond_threshold",
      "provider_terrain_aware_no_extra_correction",
      "unknown_provider_elevation_conservative",
      "spot_elevation_too_low_for_unknown_correction",
      "provider_elevation_higher_than_spot",
      "existing_correction_preserved",
    ]),
  })
  .optional();
const dailyTemperatureAdjustmentSchema = hourlyTemperatureAdjustmentSchema
  .unwrap()
  .omit({
    rawTemperature: true,
    elevationAdjustedTemperature: true,
  })
  .optional();

export const normalizedHourlyWeatherSchema = z.object({
  time: z.string().datetime({ offset: true }),
  temperature: z.number().finite(),
  rawTemperature: z.number().finite().optional(),
  elevationAdjustedTemperature: z.number().finite().optional(),
  temperatureAdjustment: hourlyTemperatureAdjustmentSchema,
  feelsLike: nullableFiniteNumberSchema,
  humidity: z.number().finite().min(0).max(100),
  dewPointSpread: nullableFiniteNumberSchema.optional(),
  pressure: nullableFiniteNumberSchema,
  windSpeed: z.number().finite().min(0),
  windGust: nullableFiniteNumberSchema,
  windDirection: z.number().finite().min(0).max(360).nullable(),
  precipitationProbability: nullablePercentSchema,
  precipitationProbabilityPercent: nullablePercentSchema.optional(),
  precipitation: nullableFiniteNumberSchema,
  precipitationAmountMm: nullableFiniteNumberSchema.optional(),
  rainAmountMm: nullableFiniteNumberSchema.optional(),
  snowAmountMm: nullableFiniteNumberSchema.optional(),
  precipitationType: precipitationTypeSchema.optional(),
  precipitationRisk: precipitationRiskSchema.optional(),
  visibility: nullableFiniteNumberSchema,
  rawVisibilityKm: nullableFiniteNumberSchema.optional(),
  photographyTransparencyScore: z.number().finite().min(0).max(100).optional(),
  transparencyGrade: transparencyGradeSchema.optional(),
  cloudFogObstructionRisk: cloudFogObstructionRiskSchema.optional(),
  dewPoint: nullableFiniteNumberSchema,
  cloudTotal: z.number().finite().min(0).max(100),
  cloudLow: nullablePercentSchema,
  cloudMid: nullablePercentSchema,
  cloudHigh: nullablePercentSchema,
  exposedRidgeWindRisk: ridgeWindRiskSchema.optional(),
  providerElevationMeters: z.number().finite().optional(),
  weatherCode: z.string().trim().min(1).nullable(),
  weatherTextZh: z.string().trim().min(1).nullable().optional(),
  providerCode: z.string().trim().min(1),
  providerLabelZh: z.string().trim().min(1).optional(),
  dataMode: z.enum(["mock", "demo", "fixture", "fallback", "real"]).optional(),
  sourceConfidence: z.number().finite().min(0).max(1).nullable(),
  missingFields: weatherFieldListSchema,
  estimatedFields: weatherFieldListSchema,
  sourceNotes: z.array(z.string().trim().min(1)).optional(),
  fieldMetadata: weatherFieldMetadataSchema,
});

export const normalizedDailyWeatherSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tempMin: z.number().finite(),
  tempMax: z.number().finite(),
  rawTempMin: z.number().finite().optional(),
  rawTempMax: z.number().finite().optional(),
  elevationAdjustedTempMin: z.number().finite().optional(),
  elevationAdjustedTempMax: z.number().finite().optional(),
  temperatureAdjustment: dailyTemperatureAdjustmentSchema,
  precipitationProbability: nullablePercentSchema,
  precipitationProbabilityPercent: nullablePercentSchema.optional(),
  precipitation: nullableFiniteNumberSchema.optional(),
  precipitationAmountMm: nullableFiniteNumberSchema.optional(),
  rainAmountMm: nullableFiniteNumberSchema.optional(),
  snowAmountMm: nullableFiniteNumberSchema.optional(),
  precipitationType: precipitationTypeSchema.optional(),
  precipitationRisk: precipitationRiskSchema.optional(),
  windSpeed: nullableFiniteNumberSchema.optional(),
  windGust: nullableFiniteNumberSchema.optional(),
  windDirection: z.number().finite().min(0).max(360).nullable().optional(),
  humidity: nullablePercentSchema.optional(),
  visibility: nullableFiniteNumberSchema.optional(),
  rawVisibilityKm: nullableFiniteNumberSchema.optional(),
  photographyTransparencyScore: z.number().finite().min(0).max(100).optional(),
  transparencyGrade: transparencyGradeSchema.optional(),
  cloudFogObstructionRisk: cloudFogObstructionRiskSchema.optional(),
  cloudTotal: nullablePercentSchema.optional(),
  cloudLow: nullablePercentSchema.optional(),
  cloudMid: nullablePercentSchema.optional(),
  cloudHigh: nullablePercentSchema.optional(),
  exposedRidgeWindRisk: ridgeWindRiskSchema.optional(),
  providerElevationMeters: z.number().finite().optional(),
  weatherSummary: z.string().trim().min(1),
  cloudSummary: z.string().trim().min(1).optional(),
  sunrise: z.string().datetime({ offset: true }).optional(),
  sunset: z.string().datetime({ offset: true }).optional(),
  providerCode: z.string().trim().min(1),
  providerLabelZh: z.string().trim().min(1).optional(),
  dataMode: z.enum(["mock", "demo", "fixture", "fallback", "real"]).optional(),
  missingFields: weatherFieldListSchema,
  estimatedFields: weatherFieldListSchema,
  fieldMetadata: weatherFieldMetadataSchema,
});
