import { forecastQueryInputSchema, normalizeForecastQueryInput } from "@photo-weather/shared";
import type { ForecastQueryInput } from "@photo-weather/shared";
import { ForecastResultClient } from "./forecast-result-client";

const missingWgs84CoordinateErrorMessage =
  "当前地点缺少有效 WGS84 坐标，无法计算日出日落、月相和银河窗口。";

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

function parseOptionalNumberParam(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function ForecastPage({ searchParams }: ForecastPageProps) {
  const latitudeWgs84 = parseNumberParam(
    firstParam(searchParams.latWgs84) ?? firstParam(searchParams.latitudeWgs84),
  );
  const longitudeWgs84 = parseNumberParam(
    firstParam(searchParams.lngWgs84) ?? firstParam(searchParams.longitudeWgs84),
  );
  const parsedQuery = forecastQueryInputSchema.safeParse(
    normalizeForecastQueryInput({
      name: firstParam(searchParams.name),
      source: firstParam(searchParams.source),
      latitudeGcj02: parseNumberParam(
        firstParam(searchParams.lat) ?? firstParam(searchParams.latGcj02),
      ),
      longitudeGcj02: parseNumberParam(
        firstParam(searchParams.lng) ?? firstParam(searchParams.lngGcj02),
      ),
      latitudeWgs84,
      longitudeWgs84,
      horizon: firstParam(searchParams.horizon),
      target: firstParam(searchParams.target),
      elevationMeters: parseOptionalNumberParam(firstParam(searchParams.elevationMeters)),
      scenario: firstParam(searchParams.scenario),
      locationId: firstParam(searchParams.locationId),
      photoSpotId: firstParam(searchParams.photoSpotId),
    }),
  );
  const query: ForecastQueryInput | null = parsedQuery.success ? parsedQuery.data : null;
  const invalidReason =
    !Number.isFinite(latitudeWgs84) ||
    latitudeWgs84 < -90 ||
    latitudeWgs84 > 90 ||
    !Number.isFinite(longitudeWgs84) ||
    longitudeWgs84 < -180 ||
    longitudeWgs84 > 180
      ? missingWgs84CoordinateErrorMessage
      : undefined;

  return <ForecastResultClient query={query} invalidReason={invalidReason} />;
}
