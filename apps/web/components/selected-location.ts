import type {
  ElevationConfidence,
  ElevationSource,
  ForecastHorizon,
  ForecastTarget,
  SpotTerrainProfile,
} from "@photo-weather/shared";

export type SelectedLocationSource = "local_photo_spot" | "amap" | "manual";

export type SelectedLocation = {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly source: SelectedLocationSource;
  readonly originalSource: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly latitudeGcj02?: number;
  readonly longitudeGcj02?: number;
  readonly elevationMeters?: number | null;
  readonly elevationSource?: ElevationSource;
  readonly elevationConfidence?: ElevationConfidence;
  readonly terrainProfile?: SpotTerrainProfile;
  readonly province?: string;
  readonly city?: string;
  readonly district?: string;
  readonly scenicArea?: string;
  readonly dataStatus: "verified" | "pending";
  readonly coordinateSource: string;
  readonly locationId?: string;
  readonly photoSpotId?: string;
};

type SearchResultLike = {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly province: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly source: string;
  readonly matchedPhotoSpotId?: string;
  readonly matchedLocationId?: string;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly elevationSource?: ElevationSource;
  readonly elevationConfidence?: ElevationConfidence;
  readonly isVerified: boolean;
};

export function selectedLocationFromSearchResult(result: SearchResultLike): SelectedLocation {
  const source = normalizeSelectedLocationSource(result);
  const area = [result.province, result.city, result.district].filter(Boolean).join(" / ");
  const hasTrustedSearchElevation =
    source !== "amap" && typeof result.elevation === "number" && Number.isFinite(result.elevation);

  return {
    id: result.id,
    name: result.name,
    displayName: result.name,
    source,
    originalSource: result.source,
    latitudeWgs84: result.latitudeWgs84,
    longitudeWgs84: result.longitudeWgs84,
    latitudeGcj02: result.latitudeGcj02,
    longitudeGcj02: result.longitudeGcj02,
    elevationMeters: hasTrustedSearchElevation ? result.elevation : null,
    elevationSource: hasTrustedSearchElevation
      ? result.elevationSource ?? selectedLocationElevationSource()
      : "unknown",
    elevationConfidence: hasTrustedSearchElevation
      ? result.elevationConfidence ?? selectedLocationElevationConfidence(source, result.isVerified)
      : "low",
    province: result.province ?? undefined,
    city: result.city ?? undefined,
    district: result.district ?? undefined,
    scenicArea: result.address ?? (area || undefined),
    dataStatus: result.isVerified ? "verified" : "pending",
    coordinateSource: coordinateSourceLabel(source),
    locationId: result.matchedLocationId,
    photoSpotId: result.matchedPhotoSpotId,
  };
}

export function buildForecastUrlFromSelectedLocation(
  location: SelectedLocation,
  horizon: ForecastHorizon,
  target: ForecastTarget,
): string {
  const params = new URLSearchParams({
    name: location.name,
    source: location.source,
    lat: String(location.latitudeGcj02 ?? location.latitudeWgs84),
    lng: String(location.longitudeGcj02 ?? location.longitudeWgs84),
    latGcj02: String(location.latitudeGcj02 ?? location.latitudeWgs84),
    lngGcj02: String(location.longitudeGcj02 ?? location.longitudeWgs84),
    latWgs84: String(location.latitudeWgs84),
    lngWgs84: String(location.longitudeWgs84),
    latitudeWgs84: String(location.latitudeWgs84),
    longitudeWgs84: String(location.longitudeWgs84),
    horizon,
    target,
  });

  if (location.locationId) {
    params.set("locationId", location.locationId);
  }

  if (location.photoSpotId) {
    params.set("photoSpotId", location.photoSpotId);
  }

  if (typeof location.elevationMeters === "number" && Number.isFinite(location.elevationMeters)) {
    params.set("elevationMeters", String(location.elevationMeters));
  }
  if (location.elevationSource) {
    params.set("elevationSource", location.elevationSource);
  }
  if (location.elevationConfidence) {
    params.set("elevationConfidence", location.elevationConfidence);
  }

  return `/forecast?${params.toString()}`;
}

export function buildForecastRequestPayload(
  location: SelectedLocation,
  horizon: ForecastHorizon,
  target: ForecastTarget,
) {
  return {
    name: location.name,
    source: location.source,
    latitudeGcj02: location.latitudeGcj02 ?? location.latitudeWgs84,
    longitudeGcj02: location.longitudeGcj02 ?? location.longitudeWgs84,
    latitudeWgs84: location.latitudeWgs84,
    longitudeWgs84: location.longitudeWgs84,
    elevationMeters: location.elevationMeters,
    elevationSource: location.elevationSource,
    elevationConfidence: location.elevationConfidence,
    horizon,
    target,
    locationId: location.locationId,
    photoSpotId: location.photoSpotId,
  };
}

function normalizeSelectedLocationSource(result: SearchResultLike): SelectedLocationSource {
  if (result.source === "amap") {
    return "amap";
  }
  if (result.source === "local_photo_spot" || result.matchedPhotoSpotId) {
    return "local_photo_spot";
  }
  return "manual";
}

function coordinateSourceLabel(source: SelectedLocationSource): string {
  if (source === "amap") {
    return "高德地图";
  }
  if (source === "local_photo_spot") {
    return "本地机位";
  }
  return "手动/本地地点";
}

function selectedLocationElevationSource(): ElevationSource {
  return "manual";
}

function selectedLocationElevationConfidence(
  source: SelectedLocationSource,
  isVerified: boolean,
): ElevationConfidence {
  if (source === "amap") {
    return "medium";
  }
  return isVerified ? "high" : "medium";
}
