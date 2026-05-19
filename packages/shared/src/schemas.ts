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
