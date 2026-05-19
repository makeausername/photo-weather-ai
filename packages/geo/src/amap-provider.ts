import type { Coordinates, JsonValue } from "@photo-weather/shared";
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

type AmapFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type AmapProviderConfig = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly enabled?: boolean;
  readonly fetcher?: AmapFetch;
};

type AmapApiEnvelope = {
  readonly status?: string;
  readonly info?: string;
  readonly infocode?: string;
};

export type AmapPoiFixture = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly pname?: unknown;
  readonly cityname?: unknown;
  readonly adname?: unknown;
  readonly address?: unknown;
  readonly location?: unknown;
};

type AmapPlaceSearchResponse = AmapApiEnvelope & {
  readonly pois?: readonly AmapPoiFixture[];
};

type AmapGeocodeFixture = {
  readonly formatted_address?: unknown;
  readonly province?: unknown;
  readonly city?: unknown;
  readonly district?: unknown;
  readonly location?: unknown;
};

type AmapGeocodeResponse = AmapApiEnvelope & {
  readonly geocodes?: readonly AmapGeocodeFixture[];
};

type AmapReverseGeocodeResponse = AmapApiEnvelope & {
  readonly regeocode?: {
    readonly formatted_address?: unknown;
    readonly addressComponent?: {
      readonly province?: unknown;
      readonly city?: unknown;
      readonly district?: unknown;
      readonly township?: unknown;
    };
  };
};

const defaultBaseUrl = "https://restapi.amap.com";

function toText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  return undefined;
}

function toAmapComponentText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return undefined;
  }

  return toText(value);
}

export function parseAmapLocation(location: unknown): Gcj02Coordinates {
  const text = toText(location);
  if (!text) {
    throw new Error("高德地图结果缺少坐标。");
  }

  const [longitudeText, latitudeText] = text.split(",");
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  const coordinates: Gcj02Coordinates = {
    latitude,
    longitude,
    system: "gcj02",
  };
  const validation = validateCoordinates(coordinates, { expectedSystem: "gcj02" });
  if (!validation.ok) {
    throw new Error("高德地图结果包含不合法坐标。");
  }

  return coordinates;
}

export function normalizeAmapPoi(poi: AmapPoiFixture): GeoPlaceResult {
  const name = toText(poi.name);
  if (!name) {
    throw new Error("高德地图地点结果缺少名称。");
  }

  const coordinatesGcj02 = parseAmapLocation(poi.location);
  return normalizePlaceResult({
    id: toText(poi.id) ? `amap:${toText(poi.id)}` : undefined,
    name,
    countryCode: "CN",
    province: toAmapComponentText(poi.pname),
    city: toAmapComponentText(poi.cityname),
    district: toAmapComponentText(poi.adname),
    address: toAmapComponentText(poi.address),
    coordinatesGcj02,
    providerPlaceId: toText(poi.id),
    locationType: "scenic_area",
    isVerified: false,
    source: "amap",
    raw: poi as JsonValue,
  });
}

export function normalizeAmapGeocodeResult(geocode: AmapGeocodeFixture): GeoPlaceResult {
  const address = toText(geocode.formatted_address);
  const coordinatesGcj02 = parseAmapLocation(geocode.location);

  return normalizePlaceResult({
    id: address ? `amap:geocode:${address}` : undefined,
    name: address ?? "高德地图地点",
    countryCode: "CN",
    province: toAmapComponentText(geocode.province),
    city: toAmapComponentText(geocode.city),
    district: toAmapComponentText(geocode.district),
    address,
    coordinatesGcj02,
    locationType: "scenic_area",
    isVerified: false,
    source: "amap",
    raw: geocode as JsonValue,
  });
}

export class AmapProvider implements GeoProvider {
  private readonly fetcher: AmapFetch;

  constructor(private readonly config: AmapProviderConfig = {}) {
    this.fetcher = config.fetcher ?? fetch;
  }

  async searchPlace(
    query: string,
    options: PlaceSearchOptions = {},
  ): Promise<readonly GeoPlaceResult[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const data = await this.request<AmapPlaceSearchResponse>("/v5/place/text", {
      keywords: trimmedQuery,
      region: options.city,
      page_size: String(Math.min(Math.max(options.limit ?? 8, 1), 25)),
      show_fields: "children,business,photos",
    });

    return (data.pois ?? []).map((poi) => normalizeAmapPoi(poi));
  }

  async geocode(address: string, options: GeocodeOptions = {}): Promise<GeoPlaceResult> {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      throw new Error("地理编码地址不能为空。");
    }

    const data = await this.request<AmapGeocodeResponse>("/v3/geocode/geo", {
      address: trimmedAddress,
      city: options.city,
    });
    const first = data.geocodes?.[0];
    if (!first) {
      throw new Error("高德地图未返回可用地理编码结果。");
    }

    return normalizeAmapGeocodeResult(first);
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
      throw new Error("高德地图逆地理编码仅支持 GCJ-02 和 WGS84 输入。");
    }

    const coordinatesGcj02 =
      coordinates.system === "wgs84"
        ? wgs84ToGcj02(coordinates as Wgs84Coordinates)
        : (coordinates as Gcj02Coordinates);
    const data = await this.request<AmapReverseGeocodeResponse>("/v3/geocode/regeo", {
      location: `${coordinatesGcj02.longitude},${coordinatesGcj02.latitude}`,
      extensions: "base",
      radius: "1000",
    });

    const regeocode = data.regeocode;
    const formattedAddress = toText(regeocode?.formatted_address) ?? "高德地图逆地理编码地点";
    const component = regeocode?.addressComponent;
    const place = this.normalizePlaceResult({
      id: `amap:reverse:${coordinatesGcj02.longitude},${coordinatesGcj02.latitude}`,
      name:
        toAmapComponentText(component?.township) ??
        toAmapComponentText(component?.district) ??
        formattedAddress,
      countryCode: "CN",
      province: toAmapComponentText(component?.province),
      city: toAmapComponentText(component?.city),
      district: toAmapComponentText(component?.district),
      address: formattedAddress,
      coordinatesGcj02,
      source: "amap",
      raw: (regeocode ?? {}) as JsonValue,
    });

    return {
      place,
      formattedAddress,
    };
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

  private async request<TResponse extends AmapApiEnvelope>(
    path: string,
    params: Record<string, string | undefined>,
  ): Promise<TResponse> {
    const apiKey = this.getApiKey();
    const url = new URL(path, this.config.baseUrl ?? defaultBaseUrl);
    url.searchParams.set("key", apiKey);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value.trim().length > 0) {
        url.searchParams.set(key, value);
      }
    });

    const response = await this.fetcher(url);
    if (!response.ok) {
      throw new Error(`高德地图服务请求失败，状态码 ${response.status}。`);
    }

    const data = (await response.json()) as TResponse;
    if (data.status !== "1") {
      const info = data.info ? `：${data.info}` : "";
      throw new Error(`高德地图服务返回失败${info}。`);
    }

    return data;
  }

  private getApiKey(): string {
    const apiKey = this.config.apiKey?.trim();
    if (apiKey) {
      return apiKey;
    }

    if (this.config.enabled) {
      throw new Error("高德地图已启用，但尚未配置 Web 服务 API Key。");
    }

    throw new Error("高德地图 Web 服务 API Key 尚未配置。");
  }
}
