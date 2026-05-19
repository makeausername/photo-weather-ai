export type CoordinateSystem = "wgs84" | "gcj02" | "bd09";

export type Coordinates = {
  readonly latitude: number;
  readonly longitude: number;
  readonly system: CoordinateSystem;
};

export type Place = {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly adminArea?: string;
  readonly locality?: string;
  readonly coordinates: Coordinates;
};

export type ProviderStatus = "mock" | "configured" | "disabled" | "not_implemented";

export type ProviderMetadata = {
  readonly id: string;
  readonly displayName: string;
  readonly status: ProviderStatus;
};

export type TimeWindow = {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
};

export type DecisionGrade = "excellent" | "good" | "fair" | "poor";

export type DecisionCard = {
  readonly grade: DecisionGrade;
  readonly score: number;
  readonly title: string;
  readonly summary: string;
  readonly reasons: readonly string[];
  readonly recommendedWindow?: TimeWindow;
};

export type ForecastHorizon = "24h" | "48h" | "72h" | "7d";

export type ForecastTarget = "general" | "cloud_sea" | "glow" | "astro";

export type ForecastQueryInput = {
  readonly name: string;
  readonly source: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly horizon: ForecastHorizon;
  readonly target: ForecastTarget;
  readonly locationId?: string;
  readonly photoSpotId?: string;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  readonly [key: string]: JsonValue;
};
