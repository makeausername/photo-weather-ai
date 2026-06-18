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

  it("returns sanitized Chinese error when database place search fails", async () => {
    const { client } = await createFakeDatabaseClient();
    const rawDatabaseError = new Error(
      "Invalid `requireLocationDelegate(client).findMany()` invocation in C:\\Users\\konne\\Desktop\\photo-weather-ai\\packages\\db\\src\\locations.ts:141:58\nCan't reach database server at `127.0.0.1:15432`",
    );
    rawDatabaseError.name = "PrismaClientInitializationError";
    if (!client.location) {
      throw new Error("Fake database client is missing location delegate.");
    }
    const failingClient = {
      ...client,
      location: {
        ...client.location,
        findMany: vi.fn(async () => {
          throw rawDatabaseError;
        }),
      },
    };

    app = buildApiServer({ dbClient: failingClient, authConfig: testAuthConfig, logger: false });

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
    expect(response.body).not.toContain("127.0.0.1:15432");
    expect(response.body).not.toContain("C:\\Users");
    expect(response.body).not.toContain("locations.ts");
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
      source: "local_location",
      matchedLocationId: "location-0",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches successful identical public place searches", async () => {
    const { client } = await createFakeDatabaseClient();
    if (!client.location || !client.photoSpot) {
      throw new Error("Fake database client is missing public search delegates.");
    }
    const cachedClient = {
      ...client,
      location: {
        ...client.location,
        findMany: vi.fn(client.location.findMany),
      },
      photoSpot: {
        ...client.photoSpot,
        findMany: vi.fn(client.photoSpot.findMany),
      },
    };
    app = buildApiServer({
      dbClient: cachedClient,
      authConfig: testAuthConfig,
      logger: false,
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
    expect(cachedClient.location.findMany).toHaveBeenCalledTimes(1);
    expect(cachedClient.photoSpot.findMany).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed public place searches", async () => {
    const { client } = await createFakeDatabaseClient();
    if (!client.location) {
      throw new Error("Fake database client is missing location delegate.");
    }
    const locationFindMany = vi.fn(async (...args: Parameters<typeof client.location.findMany>) => {
      if (locationFindMany.mock.calls.length === 1) {
        throw new Error("temporary local place search failure");
      }

      return client.location!.findMany(...args);
    });
    const retryingClient = {
      ...client,
      location: {
        ...client.location,
        findMany: locationFindMany,
      },
    };
    app = buildApiServer({
      dbClient: retryingClient,
      authConfig: testAuthConfig,
      logger: false,
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
    expect(locationFindMany).toHaveBeenCalledTimes(2);
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
