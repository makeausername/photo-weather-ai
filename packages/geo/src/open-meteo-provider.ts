import { MockGeoProvider } from "./mock-provider.js";
import { normalizePlaceResult } from "./place.js";
import type { GeoPlaceResult, PlaceSearchOptions } from "./types.js";

/** Coordinate helpers are local; remote search only uses Open-Meteo. */
export class OpenMeteoGeoProvider extends MockGeoProvider {
  constructor(private readonly fetcher: typeof fetch = fetch) {
    super();
  }
  override async searchPlace(
    query: string,
    options: PlaceSearchOptions = {},
  ): Promise<readonly GeoPlaceResult[]> {
    if (query.trim().length < 2) return [];
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", query.trim());
    url.searchParams.set("language", "zh");
    url.searchParams.set("count", String(Math.min(20, Math.max(1, options.limit ?? 10))));
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("地点搜索暂时不可用，请稍后重试或使用坐标查询。");
    const data = (await response.json()) as {
      results?: Array<{
        id: number;
        name: string;
        latitude: number;
        longitude: number;
        elevation?: number;
        country_code?: string;
        admin1?: string;
        admin2?: string;
      }>;
    };
    return (data.results ?? [])
      .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
      .map((item) =>
        normalizePlaceResult({
          id: `open-meteo-${item.id}`,
          name: item.name,
          providerPlaceId: String(item.id),
          source: "open_meteo",
          countryCode: item.country_code,
          province: item.admin1,
          city: item.admin2,
          address: [item.admin1, item.admin2].filter(Boolean).join(" · "),
          elevation: item.elevation,
          coordinatesWgs84: { latitude: item.latitude, longitude: item.longitude, system: "wgs84" },
          locationType: "city",
          isVerified: false,
        }),
      );
  }
}
