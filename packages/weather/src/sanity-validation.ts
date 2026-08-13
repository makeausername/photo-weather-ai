import type { NormalizedHourlyWeather } from "@photo-weather/shared";
import type { WeatherDataBundle } from "./types.js";

type SanityField =
  | "temperature"
  | "feelsLike"
  | "dewPoint"
  | "cloudTotal"
  | "cloudLow"
  | "cloudMid"
  | "cloudHigh"
  | "humidity"
  | "windSpeed"
  | "windGust"
  | "precipitation"
  | "precipitationAmountMm"
  | "rainAmountMm"
  | "snowAmountMm"
  | "precipitationProbability"
  | "precipitationProbabilityPercent"
  | "visibility"
  | "rawVisibilityKm"
  | "pressure";

type FieldRule = {
  readonly min: number;
  readonly max: number;
  readonly boundaryTolerance: number;
  readonly required?: boolean;
  readonly unit: string;
};

const rules: Readonly<Record<SanityField, FieldRule>> = {
  temperature: { min: -100, max: 70, boundaryTolerance: 0.05, required: true, unit: "celsius" },
  feelsLike: { min: -120, max: 80, boundaryTolerance: 0.05, unit: "celsius" },
  dewPoint: { min: -120, max: 70, boundaryTolerance: 0.05, unit: "celsius" },
  cloudTotal: { min: 0, max: 100, boundaryTolerance: 0.05, required: true, unit: "percent" },
  cloudLow: { min: 0, max: 100, boundaryTolerance: 0.05, unit: "percent" },
  cloudMid: { min: 0, max: 100, boundaryTolerance: 0.05, unit: "percent" },
  cloudHigh: { min: 0, max: 100, boundaryTolerance: 0.05, unit: "percent" },
  humidity: { min: 0, max: 100, boundaryTolerance: 0.05, required: true, unit: "percent" },
  windSpeed: { min: 0, max: 150, boundaryTolerance: 0.01, required: true, unit: "m/s" },
  windGust: { min: 0, max: 180, boundaryTolerance: 0.01, unit: "m/s" },
  precipitation: { min: 0, max: 500, boundaryTolerance: 0.01, unit: "mm" },
  precipitationAmountMm: { min: 0, max: 500, boundaryTolerance: 0.01, unit: "mm" },
  rainAmountMm: { min: 0, max: 500, boundaryTolerance: 0.01, unit: "mm" },
  snowAmountMm: { min: 0, max: 500, boundaryTolerance: 0.01, unit: "mm" },
  precipitationProbability: { min: 0, max: 100, boundaryTolerance: 0.05, unit: "percent" },
  precipitationProbabilityPercent: { min: 0, max: 100, boundaryTolerance: 0.05, unit: "percent" },
  visibility: { min: 0, max: 200, boundaryTolerance: 0.01, unit: "km" },
  rawVisibilityKm: { min: 0, max: 200, boundaryTolerance: 0.01, unit: "km" },
  pressure: { min: 800, max: 1100, boundaryTolerance: 0.1, unit: "hPa" },
};

export function validateWeatherBundleSanity(bundle: WeatherDataBundle): WeatherDataBundle {
  const hourly = bundle.hourly.map((hour) => validateHourlySanity(hour));
  const rejectedFields = [
    ...new Set(hourly.flatMap((hour) => hour.missingFields ?? []).filter((field) => field.startsWith("invalid:"))),
  ];
  if (rejectedFields.length === 0) {
    return { ...bundle, hourly };
  }

  const missingFields = [...new Set([...(bundle.missingFields ?? []), ...rejectedFields])];
  return {
    ...bundle,
    hourly,
    missingFields,
    sourceSummaries: bundle.sourceSummaries?.map((summary) =>
      summary.providerCode === bundle.providerCode
        ? {
            ...summary,
            missingFields: [...new Set([...summary.missingFields, ...rejectedFields])],
            partial: true,
          }
        : summary,
    ),
  };
}

function validateHourlySanity(hour: NormalizedHourlyWeather): NormalizedHourlyWeather {
  const next: Record<string, unknown> = { ...hour };
  const missingFields = new Set(hour.missingFields ?? []);
  const fieldMetadata = { ...(hour.fieldMetadata ?? {}) };

  for (const [field, rule] of Object.entries(rules) as [SanityField, FieldRule][]) {
    const raw = hour[field];
    if (raw === null || raw === undefined) {
      continue;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      rejectField(next, field, rule, missingFields);
      fieldMetadata[field] = rejectedMetadata(hour, field, raw, rule, "non_finite_normalized_value");
      continue;
    }
    if (raw < rule.min || raw > rule.max) {
      const distance = raw < rule.min ? rule.min - raw : raw - rule.max;
      if (distance <= rule.boundaryTolerance) {
        const clamped = Math.min(rule.max, Math.max(rule.min, raw));
        next[field] = clamped;
        fieldMetadata[field] = {
          ...(hour.fieldMetadata?.[field] ?? defaultMetadata(hour, field)),
          value: clamped,
          rawValue: raw,
          sourceUnit: rule.unit,
          validationStatus: "clamped_boundary",
        };
      } else {
        rejectField(next, field, rule, missingFields);
        fieldMetadata[field] = rejectedMetadata(hour, field, raw, rule, "normalized_value_out_of_range");
      }
    }
  }

  if (next.visibility === null) {
    next.rawVisibilityKm = null;
  }
  return {
    ...(next as NormalizedHourlyWeather),
    missingFields: [...missingFields],
    fieldMetadata,
  };
}

function rejectField(
  target: Record<string, unknown>,
  field: SanityField,
  rule: FieldRule,
  missingFields: Set<string>,
): void {
  target[field] = rule.required ? 0 : null;
  missingFields.add(field);
  missingFields.add(`invalid:${field}`);
}

function rejectedMetadata(
  hour: NormalizedHourlyWeather,
  field: SanityField,
  rawValue: unknown,
  rule: FieldRule,
  reason: string,
) {
  return {
    ...(hour.fieldMetadata?.[field] ?? defaultMetadata(hour, field)),
    value: null,
    rawValue: typeof rawValue === "number" || typeof rawValue === "string" ? rawValue : null,
    sourceUnit: rule.unit,
    validationStatus: "rejected_outlier" as const,
    missingReason: reason,
  };
}

function defaultMetadata(hour: NormalizedHourlyWeather, field: string) {
  return {
    providerCode: hour.providerCode,
    providerLabelZh: hour.providerLabelZh,
    estimated: hour.estimatedFields?.includes(field) ?? false,
  };
}
