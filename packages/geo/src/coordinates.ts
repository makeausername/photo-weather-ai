import type { CoordinateSystem, Coordinates } from "@photo-weather/shared";
import type {
  CoordinateValidationIssue,
  CoordinateValidationOptions,
  CoordinateValidationResult,
  Gcj02Coordinates,
  Wgs84Coordinates,
} from "./types.js";

const supportedCoordinateSystems = new Set<CoordinateSystem>(["wgs84", "gcj02", "bd09"]);
const pi = Math.PI;
const semiMajorAxis = 6378245.0;
const eccentricitySquared = 0.006693421622965943;

export function validateCoordinates(
  coordinates: Coordinates,
  options: CoordinateValidationOptions = {},
): CoordinateValidationResult {
  const issues: CoordinateValidationIssue[] = [];

  if (!Number.isFinite(coordinates.latitude)) {
    issues.push("latitude_not_finite");
  } else if (coordinates.latitude < -90 || coordinates.latitude > 90) {
    issues.push("latitude_out_of_range");
  }

  if (!Number.isFinite(coordinates.longitude)) {
    issues.push("longitude_not_finite");
  } else if (coordinates.longitude < -180 || coordinates.longitude > 180) {
    issues.push("longitude_out_of_range");
  }

  if (!supportedCoordinateSystems.has(coordinates.system)) {
    issues.push("unsupported_coordinate_system");
  }

  if (options.expectedSystem && coordinates.system !== options.expectedSystem) {
    issues.push("coordinate_system_mismatch");
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, coordinates };
}

export function isInsideChina(coordinates: Coordinates): boolean {
  const valid = validateCoordinates(coordinates);
  if (!valid.ok) {
    return false;
  }

  return (
    coordinates.longitude >= 72.004 &&
    coordinates.longitude <= 137.8347 &&
    coordinates.latitude >= 0.8293 &&
    coordinates.latitude <= 55.8271
  );
}

function transformLatitude(longitudeOffset: number, latitudeOffset: number): number {
  let result =
    -100.0 +
    2.0 * longitudeOffset +
    3.0 * latitudeOffset +
    0.2 * latitudeOffset * latitudeOffset +
    0.1 * longitudeOffset * latitudeOffset +
    0.2 * Math.sqrt(Math.abs(longitudeOffset));
  result +=
    ((20.0 * Math.sin(6.0 * longitudeOffset * pi) + 20.0 * Math.sin(2.0 * longitudeOffset * pi)) *
      2.0) /
    3.0;
  result +=
    ((20.0 * Math.sin(latitudeOffset * pi) + 40.0 * Math.sin((latitudeOffset / 3.0) * pi)) * 2.0) /
    3.0;
  result +=
    ((160.0 * Math.sin((latitudeOffset / 12.0) * pi) +
      320 * Math.sin((latitudeOffset * pi) / 30.0)) *
      2.0) /
    3.0;
  return result;
}

function transformLongitude(longitudeOffset: number, latitudeOffset: number): number {
  let result =
    300.0 +
    longitudeOffset +
    2.0 * latitudeOffset +
    0.1 * longitudeOffset * longitudeOffset +
    0.1 * longitudeOffset * latitudeOffset +
    0.1 * Math.sqrt(Math.abs(longitudeOffset));
  result +=
    ((20.0 * Math.sin(6.0 * longitudeOffset * pi) + 20.0 * Math.sin(2.0 * longitudeOffset * pi)) *
      2.0) /
    3.0;
  result +=
    ((20.0 * Math.sin(longitudeOffset * pi) + 40.0 * Math.sin((longitudeOffset / 3.0) * pi)) *
      2.0) /
    3.0;
  result +=
    ((150.0 * Math.sin((longitudeOffset / 12.0) * pi) +
      300.0 * Math.sin((longitudeOffset / 30.0) * pi)) *
      2.0) /
    3.0;
  return result;
}

export function wgs84ToGcj02(coordinates: Wgs84Coordinates): Gcj02Coordinates {
  const validation = validateCoordinates(coordinates, { expectedSystem: "wgs84" });
  if (!validation.ok) {
    throw new Error(`Invalid WGS84 coordinates: ${validation.issues.join(",")}`);
  }

  if (!isInsideChina(coordinates)) {
    return {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      system: "gcj02",
    };
  }

  let deltaLatitude = transformLatitude(coordinates.longitude - 105.0, coordinates.latitude - 35.0);
  let deltaLongitude = transformLongitude(
    coordinates.longitude - 105.0,
    coordinates.latitude - 35.0,
  );
  const radianLatitude = (coordinates.latitude / 180.0) * pi;
  let magic = Math.sin(radianLatitude);
  magic = 1 - eccentricitySquared * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  deltaLatitude =
    (deltaLatitude * 180.0) /
    (((semiMajorAxis * (1 - eccentricitySquared)) / (magic * sqrtMagic)) * pi);
  deltaLongitude =
    (deltaLongitude * 180.0) / ((semiMajorAxis / sqrtMagic) * Math.cos(radianLatitude) * pi);

  return {
    latitude: coordinates.latitude + deltaLatitude,
    longitude: coordinates.longitude + deltaLongitude,
    system: "gcj02",
  };
}

export function gcj02ToWgs84(coordinates: Gcj02Coordinates): Wgs84Coordinates {
  const validation = validateCoordinates(coordinates, { expectedSystem: "gcj02" });
  if (!validation.ok) {
    throw new Error(`Invalid GCJ-02 coordinates: ${validation.issues.join(",")}`);
  }

  if (!isInsideChina(coordinates)) {
    return {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      system: "wgs84",
    };
  }

  const converted = wgs84ToGcj02({
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    system: "wgs84",
  });

  return {
    latitude: coordinates.latitude * 2 - converted.latitude,
    longitude: coordinates.longitude * 2 - converted.longitude,
    system: "wgs84",
  };
}
