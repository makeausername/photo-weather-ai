import type { Coordinates } from "@photo-weather/shared";
import { gcj02ToWgs84, isInsideChina, validateCoordinates, wgs84ToGcj02 } from "./coordinates.js";
import { normalizePlaceResult } from "./place.js";
import type {
  Gcj02Coordinates,
  GeocodeOptions,
  GeoPlaceResult,
  GeoProvider,
  PlaceSearchOptions,
  RawGeoPlaceResult,
  ReverseGeocodeOptions,
  ReverseGeocodeResult,
  Wgs84Coordinates,
} from "./types.js";

export type AmapProviderConfig = {
  readonly apiKey?: string;
  readonly enabled?: boolean;
};

export class AmapProvider implements GeoProvider {
  constructor(private readonly config: AmapProviderConfig = {}) {}

  async searchPlace(
    _query: string,
    _options: PlaceSearchOptions = {},
  ): Promise<readonly GeoPlaceResult[]> {
    this.assertConfigured();
    throw new Error("高德地图真实检索尚未接入，自动化测试不得调用真实网络服务。");
  }

  async geocode(_address: string, _options: GeocodeOptions = {}): Promise<GeoPlaceResult> {
    this.assertConfigured();
    throw new Error("高德地图真实地理编码尚未接入，自动化测试不得调用真实网络服务。");
  }

  async reverseGeocode(
    _coordinates: Coordinates,
    _options: ReverseGeocodeOptions = {},
  ): Promise<ReverseGeocodeResult> {
    this.assertConfigured();
    throw new Error("高德地图真实逆地理编码尚未接入，自动化测试不得调用真实网络服务。");
  }

  normalizePlaceResult(input: RawGeoPlaceResult): GeoPlaceResult {
    return normalizePlaceResult({
      ...input,
      source: input.source ?? "amap",
    });
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

  private assertConfigured(): void {
    if (!this.config.enabled || !this.config.apiKey) {
      throw new Error("高德地图服务尚未显式配置，当前只能使用 MockGeoProvider。");
    }
  }
}
