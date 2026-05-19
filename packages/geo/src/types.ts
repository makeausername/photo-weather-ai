import type { Coordinates, CoordinateSystem, JsonValue, Place } from "@photo-weather/shared";

export type Wgs84Coordinates = Coordinates & {
  readonly system: "wgs84";
};

export type Gcj02Coordinates = Coordinates & {
  readonly system: "gcj02";
};

export type PlaceSearchOptions = {
  readonly countryCode?: string;
  readonly city?: string;
  readonly locale?: "zh-CN";
  readonly limit?: number;
};

export type GeocodeOptions = {
  readonly countryCode?: string;
  readonly city?: string;
  readonly locale?: "zh-CN";
};

export type ReverseGeocodeOptions = {
  readonly locale?: "zh-CN";
};

export type GeoPlaceSource = "mock" | "amap" | "manual";

export type GeoPlaceResult = Place & {
  readonly province?: string;
  readonly city?: string;
  readonly district?: string;
  readonly address?: string;
  readonly coordinatesGcj02: Gcj02Coordinates;
  readonly coordinatesWgs84: Wgs84Coordinates;
  readonly providerPlaceId?: string;
  readonly source: GeoPlaceSource;
  readonly raw?: JsonValue;
};

export type RawGeoPlaceResult = {
  readonly id?: string;
  readonly name: string;
  readonly countryCode?: string;
  readonly province?: string;
  readonly city?: string;
  readonly district?: string;
  readonly address?: string;
  readonly coordinatesGcj02?: Gcj02Coordinates;
  readonly coordinatesWgs84?: Wgs84Coordinates;
  readonly providerPlaceId?: string;
  readonly source?: GeoPlaceSource;
  readonly raw?: JsonValue;
};

export type ReverseGeocodeResult = {
  readonly place: GeoPlaceResult;
  readonly formattedAddress: string;
};

export type CoordinateValidationIssue =
  | "latitude_not_finite"
  | "longitude_not_finite"
  | "latitude_out_of_range"
  | "longitude_out_of_range"
  | "coordinate_system_mismatch"
  | "unsupported_coordinate_system";

export type CoordinateValidationResult =
  | {
      readonly ok: true;
      readonly coordinates: Coordinates;
    }
  | {
      readonly ok: false;
      readonly issues: readonly CoordinateValidationIssue[];
    };

export type CoordinateValidationOptions = {
  readonly expectedSystem?: CoordinateSystem;
};

export type GeoProvider = {
  searchPlace(query: string, options?: PlaceSearchOptions): Promise<readonly GeoPlaceResult[]>;
  geocode(address: string, options?: GeocodeOptions): Promise<GeoPlaceResult>;
  reverseGeocode(
    coordinates: Coordinates,
    options?: ReverseGeocodeOptions,
  ): Promise<ReverseGeocodeResult>;
  normalizePlaceResult(input: RawGeoPlaceResult): GeoPlaceResult;
  gcj02ToWgs84(coordinates: Gcj02Coordinates): Wgs84Coordinates;
  wgs84ToGcj02(coordinates: Wgs84Coordinates): Gcj02Coordinates;
  isInsideChina(coordinates: Coordinates): boolean;
  validateCoordinates(
    coordinates: Coordinates,
    options?: CoordinateValidationOptions,
  ): CoordinateValidationResult;
};
