import type { Coordinates, Place } from "@photo-weather/shared";
import type { GeoProvider, PlaceSearchOptions, ReverseGeocodeResult } from "./types.js";

const HUANGSHAN_PLACE: Place = {
  id: "mock-place-huangshan",
  name: "Huangshan Scenic Area",
  countryCode: "CN",
  adminArea: "Anhui",
  locality: "Huangshan",
  coordinates: {
    latitude: 30.129,
    longitude: 118.169,
    system: "wgs84",
  },
};

export class MockGeoProvider implements GeoProvider {
  async searchPlace(query: string, options: PlaceSearchOptions = {}): Promise<readonly Place[]> {
    if (!query.trim()) {
      return [];
    }

    const limit = options.limit ?? 5;
    return [HUANGSHAN_PLACE].slice(0, limit);
  }

  async geocode(_query: string): Promise<Place> {
    return HUANGSHAN_PLACE;
  }

  async reverseGeocode(coordinates: Coordinates): Promise<ReverseGeocodeResult> {
    return {
      place: {
        ...HUANGSHAN_PLACE,
        coordinates,
      },
      formattedAddress: "Huangshan Scenic Area, Anhui, China",
    };
  }

  gcj02ToWgs84(coordinates: Coordinates): Coordinates {
    return {
      ...coordinates,
      system: "wgs84",
    };
  }

  wgs84ToGcj02(coordinates: Coordinates): Coordinates {
    return {
      ...coordinates,
      system: "gcj02",
    };
  }
}
