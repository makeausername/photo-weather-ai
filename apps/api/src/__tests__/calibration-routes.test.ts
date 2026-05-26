import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { storeHistoricalWeatherSamples } from "@photo-weather/calibration";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

describe("admin calibration routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("renders calibration overview without exposing secrets", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/calibration",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    const bodyText = response.body;
    const body = response.json();
    expect(body.photoSpots.length).toBeGreaterThan(0);
    expect(body.targets).toContain("general");
    expect(bodyText).not.toMatch(/api[_-]?key|secret/i);
  });

  it("does not call real historical weather providers in automated tests", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/calibration/fetch-history",
      headers: adminAuthorizationHeader(),
      payload: {
        spotId: "photo-spot-0",
        startDate: "2026-05-01",
        endDate: "2026-05-02",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "real_history_fetch_disabled_in_tests",
    });
  });

  it("runs replay from stored historical samples and stores observed outcome labels", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const spot = state.photoSpots.get("photo-spot-0");
    if (!spot) {
      throw new Error("expected seeded photo spot");
    }
    await storeHistoricalWeatherSamples(buildSamplesForSpot(spot), { client });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const replayResponse = await app.inject({
      method: "POST",
      url: "/admin/calibration/replay",
      headers: adminAuthorizationHeader(),
      payload: {
        spotId: spot.id,
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        target: "general",
      },
    });

    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json().resultCount).toBe(1);

    const outcomeResponse = await app.inject({
      method: "POST",
      url: "/admin/calibration/outcomes",
      headers: adminAuthorizationHeader(),
      payload: {
        spotId: spot.id,
        target: "general",
        outcomeDate: "2026-05-01",
        observedResult: "success",
        cloudSeaLevel: "medium",
        whiteoutLevel: "none",
        sunriseGlowLevel: "weak",
        sunsetGlowLevel: "none",
        astroVisibilityLevel: "none",
        transparencyLevel: "good",
        rainImpactLevel: "none",
        notes: "现场有可拍云层。",
      },
    });

    expect(outcomeResponse.statusCode).toBe(200);
    expect(outcomeResponse.json().outcome).toMatchObject({
      observedResult: "success",
      target: "general",
    });

    const resultsResponse = await app.inject({
      method: "GET",
      url: `/admin/calibration/replay-results?spotId=${spot.id}&target=general`,
      headers: adminAuthorizationHeader(),
    });

    expect(resultsResponse.statusCode).toBe(200);
    expect(resultsResponse.json().results).toHaveLength(1);
    expect(resultsResponse.json().outcomes).toHaveLength(1);
  });
});

function buildSamplesForSpot(spot: any) {
  return Array.from({ length: 24 }, (_, index) => ({
    spotId: spot.id,
    locationKey: `spot:${spot.id}`,
    locationName: spot.name,
    latitudeWgs84: spot.latitudeWgs84,
    longitudeWgs84: spot.longitudeWgs84,
    elevationMeters: spot.elevation,
    sourceProvider: "open_meteo_historical" as const,
    sampleTime: new Date(`2026-05-01T${String(index).padStart(2, "0")}:00:00+08:00`),
    timezone: "Asia/Shanghai",
    temperature: 12,
    humidity: index < 8 ? 88 : 72,
    dewPoint: 8,
    windSpeed: 3,
    precipitationAmount: 0,
    precipitationProbability: 15,
    rainAmount: 0,
    snowAmount: 0,
    cloudTotal: index < 8 ? 66 : 40,
    cloudLow: index < 8 ? 48 : 20,
    cloudMid: 35,
    cloudHigh: 45,
    visibility: 20,
    pressure: 810,
    weatherCode: "3",
    weatherText: "多云",
  }));
}
