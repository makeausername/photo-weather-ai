import type {
  ElevationConfidence,
  ElevationSource,
  ForecastHorizon,
  ForecastTarget,
  SpotTerrainProfile,
} from "@photo-weather/shared";

export type SelectedLocationSource = "local_photo_spot" | "amap" | "manual" | "browser_geolocation";

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

export const recentSelectedLocationStorageKey = "photo_weather_recent_selected_location:v1";

type SelectedLocationStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

export function serializeRecentSelectedLocation(location: SelectedLocation): string {
  return JSON.stringify(location);
}

export function parseRecentSelectedLocation(
  value: string | null | undefined,
): SelectedLocation | null {
  if (!value) {
    return null;
  }

  try {
    const candidate = JSON.parse(value) as Partial<SelectedLocation>;
    const validSource =
      candidate.source === "local_photo_spot" ||
      candidate.source === "amap" ||
      candidate.source === "manual" ||
      candidate.source === "browser_geolocation";
    const validDataStatus =
      candidate.dataStatus === "verified" || candidate.dataStatus === "pending";

    if (
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.displayName !== "string" ||
      typeof candidate.originalSource !== "string" ||
      typeof candidate.coordinateSource !== "string" ||
      !validSource ||
      !validDataStatus ||
      typeof candidate.latitudeWgs84 !== "number" ||
      !Number.isFinite(candidate.latitudeWgs84) ||
      typeof candidate.longitudeWgs84 !== "number" ||
      !Number.isFinite(candidate.longitudeWgs84)
    ) {
      return null;
    }

    return candidate as SelectedLocation;
  } catch {
    return null;
  }
}

export function readRecentSelectedLocation(
  storage: SelectedLocationStorage | null = browserSessionStorage(),
): SelectedLocation | null {
  try {
    return parseRecentSelectedLocation(storage?.getItem(recentSelectedLocationStorageKey));
  } catch {
    return null;
  }
}

export function rememberRecentSelectedLocation(
  location: SelectedLocation,
  storage: SelectedLocationStorage | null = browserSessionStorage(),
): void {
  try {
    storage?.setItem(recentSelectedLocationStorageKey, serializeRecentSelectedLocation(location));
  } catch {
    // A disabled or full session store must never block a forecast query.
  }
}

export function forgetRecentSelectedLocation(
  storage: SelectedLocationStorage | null = browserSessionStorage(),
): void {
  try {
    storage?.removeItem(recentSelectedLocationStorageKey);
  } catch {
    // Clearing the visible selection is still valid when browser storage is unavailable.
  }
}

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

export type BrowserGeolocationReverseResult = {
  readonly available?: boolean;
  readonly name?: string | null;
  readonly address?: string | null;
  readonly province?: string | null;
  readonly city?: string | null;
  readonly district?: string | null;
  readonly latitudeGcj02?: number | null;
  readonly longitudeGcj02?: number | null;
};

export type BrowserGeolocationSelectionInput = {
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly reverseGeocode?: BrowserGeolocationReverseResult | null;
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

export function selectedLocationFromBrowserGeolocation(
  input: BrowserGeolocationSelectionInput,
): SelectedLocation {
  const reverseGeocode =
    input.reverseGeocode?.available === true ? input.reverseGeocode : undefined;
  const reverseName =
    cleanReverseText(reverseGeocode?.name) ?? cleanReverseText(reverseGeocode?.address);
  const displayName = reverseName ?? "当前位置";
  const area = [
    cleanReverseText(reverseGeocode?.province),
    cleanReverseText(reverseGeocode?.city),
    cleanReverseText(reverseGeocode?.district),
  ]
    .filter(Boolean)
    .join(" / ");

  return {
    id: `browser-geolocation:${input.latitudeWgs84.toFixed(5)},${input.longitudeWgs84.toFixed(5)}`,
    name: displayName,
    displayName,
    source: "browser_geolocation",
    originalSource: "browser_geolocation",
    latitudeWgs84: input.latitudeWgs84,
    longitudeWgs84: input.longitudeWgs84,
    latitudeGcj02: finiteNumberOrUndefined(reverseGeocode?.latitudeGcj02),
    longitudeGcj02: finiteNumberOrUndefined(reverseGeocode?.longitudeGcj02),
    elevationMeters: null,
    elevationSource: "unknown",
    elevationConfidence: "low",
    province: cleanReverseText(reverseGeocode?.province),
    city: cleanReverseText(reverseGeocode?.city),
    district: cleanReverseText(reverseGeocode?.district),
    scenicArea: cleanReverseText(reverseGeocode?.address) ?? (area || "当前位置附近"),
    dataStatus: "pending",
    coordinateSource: "浏览器定位 WGS84 坐标",
  };
}

export function buildForecastUrlFromSelectedLocation(
  location: SelectedLocation,
  horizon: ForecastHorizon,
  target: ForecastTarget,
  options: { readonly timezone?: string } = {},
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
    coordinateSource: location.source,
    horizon,
    target,
  });
  const timezone = options.timezone ?? resolveBrowserTimezone();

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
  if (timezone) {
    params.set("timezone", timezone);
  }

  return `/forecast?${params.toString()}`;
}

export function buildForecastRequestPayload(
  location: SelectedLocation,
  horizon: ForecastHorizon,
  target: ForecastTarget,
  options: { readonly timezone?: string } = {},
) {
  const timezone = options.timezone ?? resolveBrowserTimezone();

  return {
    name: location.name,
    source: location.source,
    latitudeGcj02: location.latitudeGcj02 ?? location.latitudeWgs84,
    longitudeGcj02: location.longitudeGcj02 ?? location.longitudeWgs84,
    latitudeWgs84: location.latitudeWgs84,
    longitudeWgs84: location.longitudeWgs84,
    coordinateSource: location.source,
    elevationMeters: location.elevationMeters,
    elevationSource: location.elevationSource,
    elevationConfidence: location.elevationConfidence,
    horizon,
    target,
    timezone,
    locationId: location.locationId,
    photoSpotId: location.photoSpotId,
  };
}

export function resolveBrowserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
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
  if (source === "browser_geolocation") {
    return "浏览器定位";
  }
  if (source === "amap") {
    return "高德地图";
  }
  if (source === "local_photo_spot") {
    return "本地地点";
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

function cleanReverseText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function finiteNumberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function browserSessionStorage(): SelectedLocationStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
