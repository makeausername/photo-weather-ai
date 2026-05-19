import { forecastQueryInputSchema } from "@photo-weather/shared";
import type { ForecastQueryInput } from "@photo-weather/shared";
import { ForecastResultClient } from "./forecast-result-client";

type ForecastPageProps = {
  readonly searchParams: Record<string, string | readonly string[] | undefined>;
};

function firstParam(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  return value?.[0];
}

function parseNumberParam(value: string | undefined): number {
  return value === undefined || value.trim() === "" ? Number.NaN : Number(value);
}

export default function ForecastPage({ searchParams }: ForecastPageProps) {
  const parsedQuery = forecastQueryInputSchema.safeParse({
    name: firstParam(searchParams.name),
    source: firstParam(searchParams.source),
    latitudeGcj02: parseNumberParam(firstParam(searchParams.lat)),
    longitudeGcj02: parseNumberParam(firstParam(searchParams.lng)),
    latitudeWgs84: parseNumberParam(firstParam(searchParams.latWgs84)),
    longitudeWgs84: parseNumberParam(firstParam(searchParams.lngWgs84)),
    horizon: firstParam(searchParams.horizon),
    target: firstParam(searchParams.target),
    locationId: firstParam(searchParams.locationId),
    photoSpotId: firstParam(searchParams.photoSpotId),
  });
  const query: ForecastQueryInput | null = parsedQuery.success ? parsedQuery.data : null;

  return <ForecastResultClient query={query} />;
}
