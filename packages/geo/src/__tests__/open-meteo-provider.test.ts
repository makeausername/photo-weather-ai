import { describe, expect, it, vi } from "vitest";
import { OpenMeteoGeoProvider } from "../open-meteo-provider.js";
describe("Open-Meteo geocoding", () => {
  it("preserves WGS84 coordinates and identifies real search results", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 123,
              name: "黄山市",
              latitude: 29.71,
              longitude: 118.31,
              elevation: 140,
              country_code: "CN",
              admin1: "安徽",
            },
          ],
        }),
      ),
    );
    const results = await new OpenMeteoGeoProvider(fetcher).searchPlace("黄山");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "https://geocoding-api.open-meteo.com/v1/search?",
    );
    expect(results[0]).toMatchObject({
      source: "open_meteo",
      coordinatesWgs84: { latitude: 29.71, longitude: 118.31, system: "wgs84" },
    });
  });
  it("does not replace search failures with mock places", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    await expect(new OpenMeteoGeoProvider(fetcher).searchPlace("黄山")).rejects.toThrow(
      "地点搜索暂时不可用",
    );
  });
});
