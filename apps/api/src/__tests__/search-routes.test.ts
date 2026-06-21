import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { AmapProvider, MockGeoProvider } from "@photo-weather/geo";
import { buildApiServer } from "../server.js";
import { createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";
import { publicPlaceSearchUnavailableMessage } from "../search-routes.js";

describe("public search routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.unstubAllGlobals();
  });

  it("returns sanitized Chinese error when provider place search fails", async () => {
    const { client } = await createFakeDatabaseClient();
    const rawProviderError = new Error(
      "Amap request failed at C:\\Users\\konne\\Desktop\\photo-weather-ai\\apps\\api\\src\\geo-provider.ts:20:5 with key=secret",
    );
    const geoProvider = new MockGeoProvider();
    vi.spyOn(geoProvider, "searchPlace").mockRejectedValue(rawProviderError);

    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      geoProvider,
    });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "place_search_unavailable",
      message: publicPlaceSearchUnavailableMessage,
    });
    expect(response.body).not.toContain("Prisma");
    expect(response.body).not.toContain("requireLocationDelegate");
    expect(response.body).not.toContain("findMany");
    expect(response.body).not.toContain("Amap");
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("127.0.0.1:15432");
    expect(response.body).not.toContain("C:\\Users");
    expect(response.body).not.toContain("geo-provider.ts");
  });

  it("keeps successful public place search working without external APIs", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("public local search must not call external APIs in this test");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().results[0]).toMatchObject({
      source: "mock",
      name: "黄山光明顶",
    });
    expect(response.body).not.toContain("matchedLocationId");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches successful identical public place searches", async () => {
    const { client } = await createFakeDatabaseClient();
    const geoProvider = new MockGeoProvider();
    const searchSpy = vi.spyOn(geoProvider, "searchPlace");
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      geoProvider,
      env: {
        ...process.env,
        PUBLIC_SEARCH_CACHE_TTL_MS: "300000",
      },
    });

    const firstResponse = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });
    const secondResponse = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toEqual(firstResponse.json());
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed public place searches", async () => {
    const { client } = await createFakeDatabaseClient();
    const geoProvider = new MockGeoProvider();
    const originalSearchPlace = geoProvider.searchPlace.bind(geoProvider);
    const searchSpy = vi
      .spyOn(geoProvider, "searchPlace")
      .mockRejectedValueOnce(new Error("temporary provider search failure"))
      .mockImplementationOnce(originalSearchPlace);
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      geoProvider,
      env: {
        ...process.env,
        PUBLIC_SEARCH_CACHE_TTL_MS: "300000",
      },
    });

    const firstResponse = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });
    const secondResponse = await app.inject({
      method: "GET",
      url: "/search/places?q=%E9%BB%84%E5%B1%B1",
    });

    expect(firstResponse.statusCode).toBe(503);
    expect(secondResponse.statusCode).toBe(200);
    expect(searchSpy).toHaveBeenCalledTimes(2);
  });

  it("reports reverse geocoding unavailable without calling external APIs by default", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("reverse geocode must not call external APIs by default");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches successful identical reverse geocode responses", async () => {
    const { client } = await createFakeDatabaseClient();
    const geoProvider = new MockGeoProvider();
    const reverseGeocodeSpy = vi.spyOn(geoProvider, "reverseGeocode");
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      geoProvider,
      env: {
        ...process.env,
        PUBLIC_SEARCH_CACHE_TTL_MS: "300000",
      },
    });

    const firstResponse = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });
    const secondResponse = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toEqual(firstResponse.json());
    expect(reverseGeocodeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed reverse geocode provider responses", async () => {
    const { client } = await createFakeDatabaseClient();
    const geoProvider = new MockGeoProvider();
    const originalReverseGeocode = geoProvider.reverseGeocode.bind(geoProvider);
    const reverseGeocodeSpy = vi
      .spyOn(geoProvider, "reverseGeocode")
      .mockRejectedValueOnce(new Error("temporary reverse geocode failure"))
      .mockImplementationOnce(originalReverseGeocode);
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      geoProvider,
      env: {
        ...process.env,
        PUBLIC_SEARCH_CACHE_TTL_MS: "300000",
      },
    });

    const firstResponse = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });
    const secondResponse = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.json()).toEqual({ available: false });
    expect(secondResponse.statusCode).toBe(200);
    expect(secondResponse.json()).toMatchObject({ available: true });
    expect(reverseGeocodeSpy).toHaveBeenCalledTimes(2);
  });

  it("reverse geocodes current coordinates through an injected Amap provider without exposing keys", async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v3/geocode/regeo");
      expect(url.searchParams.get("key")).toBe("amap-test-secret");

      return new Response(
        JSON.stringify({
          status: "1",
          regeocode: {
            formatted_address: "上海市黄浦区外滩",
            addressComponent: {
              province: "上海市",
              city: "上海市",
              district: "黄浦区",
              township: "外滩街道",
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      geoProvider: new AmapProvider({
        enabled: true,
        apiKey: "amap-test-secret",
        fetcher: fetchMock,
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/search/reverse-geocode?lat=31.2304&lng=121.4737",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      available: true,
      name: "外滩街道",
      address: "上海市黄浦区外滩",
      province: "上海市",
      city: "上海市",
      district: "黄浦区",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.body).not.toContain("amap-test-secret");
  });
});
