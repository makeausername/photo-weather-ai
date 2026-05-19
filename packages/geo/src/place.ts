import type { GeoPlaceResult, RawGeoPlaceResult } from "./types.js";
import { gcj02ToWgs84, validateCoordinates, wgs84ToGcj02 } from "./coordinates.js";

export function normalizePlaceResult(input: RawGeoPlaceResult): GeoPlaceResult {
  if (!input.coordinatesGcj02 && !input.coordinatesWgs84) {
    throw new Error("Place result must include GCJ-02 or WGS84 coordinates.");
  }

  const coordinatesWgs84 =
    input.coordinatesWgs84 ??
    gcj02ToWgs84({
      latitude: input.coordinatesGcj02?.latitude ?? 0,
      longitude: input.coordinatesGcj02?.longitude ?? 0,
      system: "gcj02",
    });
  const coordinatesGcj02 =
    input.coordinatesGcj02 ??
    wgs84ToGcj02({
      latitude: input.coordinatesWgs84?.latitude ?? 0,
      longitude: input.coordinatesWgs84?.longitude ?? 0,
      system: "wgs84",
    });

  const wgs84Validation = validateCoordinates(coordinatesWgs84, { expectedSystem: "wgs84" });
  const gcj02Validation = validateCoordinates(coordinatesGcj02, { expectedSystem: "gcj02" });
  if (!wgs84Validation.ok || !gcj02Validation.ok) {
    throw new Error("Place result contains invalid coordinates.");
  }

  return {
    id: input.id ?? input.providerPlaceId ?? input.name,
    name: input.name,
    countryCode: input.countryCode ?? "CN",
    adminArea: input.province,
    locality: input.city,
    coordinates: coordinatesWgs84,
    province: input.province,
    city: input.city,
    district: input.district,
    address: input.address,
    coordinatesGcj02,
    coordinatesWgs84,
    providerPlaceId: input.providerPlaceId,
    source: input.source ?? "manual",
    raw: input.raw,
  };
}
