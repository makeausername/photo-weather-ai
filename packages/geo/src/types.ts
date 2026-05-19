import type { Coordinates, Place } from "@photo-weather/shared";

export type PlaceSearchOptions = {
  readonly countryCode?: string;
  readonly limit?: number;
};

export type ReverseGeocodeResult = {
  readonly place: Place;
  readonly formattedAddress: string;
};

export type GeoProvider = {
  searchPlace(query: string, options?: PlaceSearchOptions): Promise<readonly Place[]>;
  geocode(query: string): Promise<Place>;
  reverseGeocode(coordinates: Coordinates): Promise<ReverseGeocodeResult>;
  gcj02ToWgs84(coordinates: Coordinates): Coordinates;
  wgs84ToGcj02(coordinates: Coordinates): Coordinates;
};
