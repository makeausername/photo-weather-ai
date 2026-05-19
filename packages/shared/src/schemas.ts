import { z } from "zod";

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

export const forecastQueryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(80),
  latitudeGcj02: latitudeSchema,
  longitudeGcj02: longitudeSchema,
  latitudeWgs84: latitudeSchema,
  longitudeWgs84: longitudeSchema,
  horizon: forecastHorizonSchema,
  target: forecastTargetSchema,
  locationId: z.string().trim().min(1).max(120).optional(),
  photoSpotId: z.string().trim().min(1).max(120).optional(),
});
