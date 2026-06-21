import {
  forecastQueryInputSchema,
  normalizeForecastQueryInput,
  type ForecastQueryInput,
  type ForecastTarget,
} from "@photo-weather/shared";

export type AccountHistoryDeepLinkParseResult =
  | {
      readonly kind: "empty";
    }
  | {
      readonly kind: "ready";
      readonly query: ForecastQueryInput;
      readonly invalidReason?: string;
    }
  | {
      readonly kind: "invalid";
      readonly message: string;
    };

const missingWgs84CoordinateErrorMessage =
  "当前地点缺少有效 WGS84 坐标，无法计算日出日落、月相和银河窗口。";

export function parseAccountHistoryForecastSearchParams(
  expectedTarget: ForecastTarget,
  searchParams: Record<string, string | readonly string[] | undefined> | undefined,
): AccountHistoryDeepLinkParseResult {
  if (firstParam(searchParams?.from) !== "account_history") {
    return { kind: "empty" };
  }

  const target = firstParam(searchParams?.target);
  if (target !== expectedTarget) {
    return {
      kind: "invalid",
      message: "查询历史链接与当前分析类型不匹配，请从账户中心重新打开。",
    };
  }

  const latitudeWgs84 = parseNumberParam(
    firstParam(searchParams?.latWgs84) ?? firstParam(searchParams?.latitudeWgs84),
  );
  const longitudeWgs84 = parseNumberParam(
    firstParam(searchParams?.lngWgs84) ?? firstParam(searchParams?.longitudeWgs84),
  );
  const parsedQuery = forecastQueryInputSchema.safeParse(
    normalizeForecastQueryInput({
      name: firstParam(searchParams?.name),
      source: firstParam(searchParams?.source),
      latitudeGcj02: parseNumberParam(
        firstParam(searchParams?.lat) ?? firstParam(searchParams?.latGcj02),
      ),
      longitudeGcj02: parseNumberParam(
        firstParam(searchParams?.lng) ?? firstParam(searchParams?.lngGcj02),
      ),
      latitudeWgs84,
      longitudeWgs84,
      coordinateSource: firstParam(searchParams?.coordinateSource),
      horizon: firstParam(searchParams?.horizon),
      target,
      timezone: firstParam(searchParams?.timezone),
      elevationMeters: parseOptionalNumberParam(firstParam(searchParams?.elevationMeters)),
      elevationSource: firstParam(searchParams?.elevationSource),
      elevationConfidence: firstParam(searchParams?.elevationConfidence),
      locationId: firstParam(searchParams?.locationId),
      photoSpotId: firstParam(searchParams?.photoSpotId),
    }),
  );

  if (!parsedQuery.success) {
    return {
      kind: "invalid",
      message: "查询历史链接缺少必要地点信息，请重新选择地点分析。",
    };
  }

  return {
    kind: "ready",
    query: parsedQuery.data,
    invalidReason:
      !Number.isFinite(latitudeWgs84) ||
      latitudeWgs84 < -90 ||
      latitudeWgs84 > 90 ||
      !Number.isFinite(longitudeWgs84) ||
      longitudeWgs84 < -180 ||
      longitudeWgs84 > 180
        ? missingWgs84CoordinateErrorMessage
        : undefined,
  };
}

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
