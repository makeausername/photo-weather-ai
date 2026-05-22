import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
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
});
