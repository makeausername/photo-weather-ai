import type {
  NormalizedHourlyWeather,
  NormalizedWeatherFieldMetadataMap,
} from "@photo-weather/shared";

const intervalFields = [
  "precipitation",
  "precipitationAmountMm",
  "rainAmountMm",
  "snowAmountMm",
  "precipitationProbability",
  "precipitationProbabilityPercent",
  "windGust",
] as const;

/** Normalize Open-Meteo's preceding-hour amounts to [row.time, row.time + 1h).
 * Instantaneous temperature, humidity and clouds retain their valid time. */
export function normalizeOpenMeteoHourlyIntervals(
  rows: readonly NormalizedHourlyWeather[],
): readonly NormalizedHourlyWeather[] {
  return rows.map((row, index) => {
    const next = rows[index + 1];
    const source =
      next && Date.parse(next.time) - Date.parse(row.time) === 3_600_000 ? next : undefined;
    const values: Record<string, unknown> = {};
    const missingFields = new Set(row.missingFields ?? []);
    const estimatedFields = new Set(row.estimatedFields ?? []);
    const metadata: NormalizedWeatherFieldMetadataMap = { ...row.fieldMetadata };
    for (const field of intervalFields) {
      const value = source?.[field] ?? null;
      values[field] = value;
      if (value === null) missingFields.add(field);
      else missingFields.delete(field);
      if (source?.estimatedFields?.includes(field) || source?.fieldMetadata?.[field]?.estimated)
        estimatedFields.add(field);
      else estimatedFields.delete(field);
      metadata[field] = {
        ...source?.fieldMetadata?.[field],
        providerCode: row.providerCode,
        providerLabelZh: row.providerLabelZh,
        estimated: estimatedFields.has(field),
        value,
        sourceValidTime: source?.time,
        intervalStart: row.time,
        intervalEnd: new Date(Date.parse(row.time) + 3_600_000).toISOString(),
        missingReason: value === null ? "following_interval_unavailable" : undefined,
      };
    }
    return {
      ...row,
      ...values,
      precipitationType: source?.precipitationType ?? "unknown",
      missingFields: [...missingFields],
      estimatedFields: [...estimatedFields],
      fieldMetadata: metadata,
    } as NormalizedHourlyWeather;
  });
}
