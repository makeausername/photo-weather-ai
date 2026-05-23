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

export const normalizedHourlyWeatherSchema = z.object({
  time: z.string().datetime({ offset: true }),
  temperature: z.number().finite(),
  feelsLike: nullableFiniteNumberSchema,
  humidity: z.number().finite().min(0).max(100),
  pressure: nullableFiniteNumberSchema,
  windSpeed: z.number().finite().min(0),
  windGust: nullableFiniteNumberSchema,
  windDirection: z.number().finite().min(0).max(360).nullable(),
  precipitationProbability: z.number().finite().min(0).max(100),
  precipitation: nullableFiniteNumberSchema,
  visibility: nullableFiniteNumberSchema,
  dewPoint: nullableFiniteNumberSchema,
  cloudTotal: z.number().finite().min(0).max(100),
  cloudLow: nullablePercentSchema,
  cloudMid: nullablePercentSchema,
  cloudHigh: nullablePercentSchema,
  weatherCode: z.string().trim().min(1).nullable(),
  providerCode: z.string().trim().min(1),
  sourceConfidence: z.number().finite().min(0).max(1).nullable(),
  missingFields: weatherFieldListSchema,
  estimatedFields: weatherFieldListSchema,
  sourceNotes: z.array(z.string().trim().min(1)).optional(),
});

export const normalizedDailyWeatherSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tempMin: z.number().finite(),
  tempMax: z.number().finite(),
  precipitationProbability: z.number().finite().min(0).max(100),
  weatherSummary: z.string().trim().min(1),
  sunrise: z.string().datetime({ offset: true }).optional(),
  sunset: z.string().datetime({ offset: true }).optional(),
  providerCode: z.string().trim().min(1),
  missingFields: weatherFieldListSchema,
  estimatedFields: weatherFieldListSchema,
});
