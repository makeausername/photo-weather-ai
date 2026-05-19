import type { Coordinates } from "@photo-weather/shared";
import { gcj02ToWgs84, isInsideChina, validateCoordinates, wgs84ToGcj02 } from "./coordinates.js";
import { normalizePlaceResult } from "./place.js";
import type {
  Gcj02Coordinates,
  GeoPlaceResult,
  GeoProvider,
  PlaceSearchOptions,
  RawGeoPlaceResult,
  ReverseGeocodeOptions,
  ReverseGeocodeResult,
  Wgs84Coordinates,
} from "./types.js";

const mockPlaces: readonly RawGeoPlaceResult[] = [
  {
    id: "mock-place-huangshan-guangmingding",
    name: "黄山光明顶",
    countryCode: "CN",
    province: "安徽省",
    city: "黄山市",
    district: "黄山区",
    address: "安徽省黄山市黄山风景区光明顶",
    coordinatesGcj02: {
      latitude: 30.1351,
      longitude: 118.1767,
      system: "gcj02",
    },
    coordinatesWgs84: {
      latitude: 30.1328,
      longitude: 118.171,
      system: "wgs84",
    },
    elevation: 1860,
    locationType: "viewpoint",
    isVerified: false,
    source: "mock",
  },
  {
    id: "mock-place-laojunshan-jinding",
    name: "老君山金顶",
    countryCode: "CN",
    province: "河南省",
    city: "洛阳市",
    district: "栾川县",
    address: "河南省洛阳市栾川县老君山景区金顶",
    coordinatesGcj02: {
      latitude: 33.7867,
      longitude: 111.6462,
      system: "gcj02",
    },
    coordinatesWgs84: {
      latitude: 33.7852,
      longitude: 111.6402,
      system: "wgs84",
    },
    elevation: 2190,
    locationType: "viewpoint",
    isVerified: false,
    source: "mock",
  },
  {
    id: "mock-place-sanqingshan-nvshenfeng",
    name: "三清山女神峰",
    countryCode: "CN",
    province: "江西省",
    city: "上饶市",
    district: "玉山县",
    address: "江西省上饶市三清山风景名胜区女神峰",
    coordinatesGcj02: {
      latitude: 28.9169,
      longitude: 118.0751,
      system: "gcj02",
    },
    coordinatesWgs84: {
      latitude: 28.9139,
      longitude: 118.0699,
      system: "wgs84",
    },
    elevation: 1600,
    locationType: "viewpoint",
    isVerified: false,
    source: "mock",
  },
  {
    id: "mock-place-wugongshan-jinding",
    name: "武功山金顶",
    countryCode: "CN",
    province: "江西省",
    city: "萍乡市",
    district: "芦溪县",
    address: "江西省萍乡市芦溪县武功山景区金顶",
    coordinatesGcj02: {
      latitude: 27.4748,
      longitude: 114.1859,
      system: "gcj02",
    },
    coordinatesWgs84: {
      latitude: 27.4716,
      longitude: 114.1808,
      system: "wgs84",
    },
    elevation: 1918,
    locationType: "viewpoint",
    isVerified: false,
    source: "mock",
  },
];

export class MockGeoProvider implements GeoProvider {
  async searchPlace(
    query: string,
    options: PlaceSearchOptions = {},
  ): Promise<readonly GeoPlaceResult[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const limit = options.limit ?? 5;
    return mockPlaces
      .map((place) => this.normalizePlaceResult(place))
      .filter((place) => {
        const haystack = [place.name, place.province, place.city, place.district, place.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery) || normalizedQuery.includes(place.name);
      })
      .slice(0, limit);
  }

  async geocode(address: string): Promise<GeoPlaceResult> {
    const results = await this.searchPlace(address, { limit: 1 });
    return results[0] ?? this.normalizePlaceResult(mockPlaces[0]!);
  }

  async reverseGeocode(
    coordinates: Coordinates,
    _options: ReverseGeocodeOptions = {},
  ): Promise<ReverseGeocodeResult> {
    const validation = validateCoordinates(coordinates);
    if (!validation.ok) {
      throw new Error(`坐标不合法：${validation.issues.join(",")}`);
    }
    if (coordinates.system !== "gcj02" && coordinates.system !== "wgs84") {
      throw new Error("MockGeoProvider 仅支持 GCJ-02 和 WGS84 坐标。");
    }

    const coordinatesWgs84 =
      coordinates.system === "gcj02"
        ? gcj02ToWgs84(coordinates as Gcj02Coordinates)
        : ({ ...coordinates, system: "wgs84" } as Wgs84Coordinates);
    const coordinatesGcj02 =
      coordinates.system === "wgs84"
        ? wgs84ToGcj02(coordinates as Wgs84Coordinates)
        : ({ ...coordinates, system: "gcj02" } as Gcj02Coordinates);

    return {
      place: {
        ...this.normalizePlaceResult(mockPlaces[0]!),
        coordinates: coordinatesWgs84,
        coordinatesGcj02,
        coordinatesWgs84,
      },
      formattedAddress: "安徽省黄山市黄山风景区（模拟地址）",
    };
  }

  normalizePlaceResult(input: RawGeoPlaceResult): GeoPlaceResult {
    return normalizePlaceResult(input);
  }

  gcj02ToWgs84(coordinates: Gcj02Coordinates): Wgs84Coordinates {
    return gcj02ToWgs84(coordinates);
  }

  wgs84ToGcj02(coordinates: Wgs84Coordinates): Gcj02Coordinates {
    return wgs84ToGcj02(coordinates);
  }

  isInsideChina(coordinates: Coordinates): boolean {
    return isInsideChina(coordinates);
  }

  validateCoordinates: GeoProvider["validateCoordinates"] = (coordinates, options) => {
    return validateCoordinates(coordinates, options);
  };
}
