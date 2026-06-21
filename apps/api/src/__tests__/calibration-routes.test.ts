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
    expect(body.locations).toBeUndefined();
    expect(body.photoSpots).toBeUndefined();
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
        locationName: "手动校准点",
        latitudeWgs84: 30.12345,
        longitudeWgs84: 120.54321,
        elevationMeters: 300,
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
    const { client } = await createFakeDatabaseClient();
    const location = manualCalibrationLocation();
    await storeHistoricalWeatherSamples(buildSamplesForLocation(location), { client });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const replayResponse = await app.inject({
      method: "POST",
      url: "/admin/calibration/replay",
      headers: adminAuthorizationHeader(),
      payload: {
        locationName: location.locationName,
        latitudeWgs84: location.latitudeWgs84,
        longitudeWgs84: location.longitudeWgs84,
        elevationMeters: location.elevationMeters,
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
        locationName: location.locationName,
        latitudeWgs84: location.latitudeWgs84,
        longitudeWgs84: location.longitudeWgs84,
        elevationMeters: location.elevationMeters,
        target: "general",
        outcomeDate: "2026-05-01",
        observedResult: "success",
        cloudSeaLevel: "medium",
        whiteoutLevel: "none",
        sunriseGlowLevel: "weak",
        sunsetGlowLevel: "none",
        astroVisibilityLevel: "none",
        milkyWayVisibilityLevel: "unknown",
        transparencyLevel: "good",
        rainImpactLevel: "none",
        notes: "现场有可拍云层。",
      },
    });

    expect(outcomeResponse.statusCode).toBe(200);
    expect(outcomeResponse.json().outcome).toMatchObject({
      spotId: null,
      locationKey: location.locationKey,
      locationName: location.locationName,
      observedResult: "success",
      target: "general",
    });

    const resultsResponse = await app.inject({
      method: "GET",
      url: `/admin/calibration/replay-results?locationKey=${encodeURIComponent(location.locationKey)}&target=general`,
      headers: adminAuthorizationHeader(),
    });

    expect(resultsResponse.statusCode).toBe(200);
    expect(resultsResponse.json().results).toHaveLength(1);
    expect(resultsResponse.json().outcomes).toHaveLength(1);
    expect(resultsResponse.json().comparisons[0]).toMatchObject({
      matchStatus: expect.stringMatching(/true_positive|partial_match|false_negative/),
    });

    const outcomeId = outcomeResponse.json().outcome.id;
    const updateResponse = await app.inject({
      method: "PUT",
      url: `/admin/calibration/outcomes/${outcomeId}`,
      headers: adminAuthorizationHeader(),
      payload: {
        locationName: location.locationName,
        latitudeWgs84: location.latitudeWgs84,
        longitudeWgs84: location.longitudeWgs84,
        elevationMeters: location.elevationMeters,
        target: "general",
        outcomeDate: "2026-05-01",
        observedResult: "partial",
        cloudSeaLevel: "unknown",
        whiteoutLevel: "unknown",
        sunriseGlowLevel: "unknown",
        sunsetGlowLevel: "unknown",
        astroVisibilityLevel: "unknown",
        milkyWayVisibilityLevel: "unknown",
        transparencyLevel: "unknown",
        rainImpactLevel: "unknown",
        notes: null,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().outcome).toMatchObject({
      id: outcomeId,
      observedResult: "partial",
      milkyWayVisibilityLevel: "unknown",
    });

    const statsResponse = await app.inject({
      method: "POST",
      url: "/admin/calibration/stats/recompute",
      headers: adminAuthorizationHeader(),
      payload: {
        locationName: location.locationName,
        latitudeWgs84: location.latitudeWgs84,
        longitudeWgs84: location.longitudeWgs84,
        elevationMeters: location.elevationMeters,
        target: "general",
      },
    });

    expect(statsResponse.statusCode).toBe(200);
    expect(statsResponse.json().stats).toMatchObject({
      locationKey: location.locationKey,
      sampleCount: 1,
      labeledCount: 1,
      partialCount: 1,
    });
  });

  it("keeps legacy locationId resolution for old calibration records", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const legacyLocation = {
      id: "legacy-location",
      name: "旧版地点",
      slug: "legacy-location",
      province: "浙江省",
      city: "杭州市",
      district: null,
      address: null,
      latitudeGcj02: 30.11,
      longitudeGcj02: 120.11,
      latitudeWgs84: 30.1,
      longitudeWgs84: 120.1,
      elevation: 120,
      locationType: "custom",
      source: "manual",
      isVerified: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    state.locations.set(legacyLocation.id, legacyLocation);
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/calibration/outcomes",
      headers: adminAuthorizationHeader(),
      payload: {
        locationId: legacyLocation.id,
        target: "general",
        outcomeDate: "2026-05-01",
        observedResult: "unknown",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().outcome).toMatchObject({
      locationKey: `location:${legacyLocation.id}`,
      locationName: legacyLocation.name,
    });
  });

  it("validates observed outcome enum values", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/admin/calibration/outcomes",
      headers: adminAuthorizationHeader(),
      payload: {
        locationName: "手动校准点",
        latitudeWgs84: 30.12345,
        longitudeWgs84: 120.54321,
        target: "general",
        outcomeDate: "2026-05-01",
        observedResult: "great",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "validation_error",
    });
  });
});

function manualCalibrationLocation() {
  return {
    locationName: "手动校准点",
    locationKey: "wgs84:30.12345,120.54321",
    latitudeWgs84: 30.12345,
    longitudeWgs84: 120.54321,
    elevationMeters: 300,
  };
}

function buildSamplesForLocation(location: ReturnType<typeof manualCalibrationLocation>) {
  return Array.from({ length: 24 }, (_, index) => ({
    spotId: null,
    locationKey: location.locationKey,
    locationName: location.locationName,
    latitudeWgs84: location.latitudeWgs84,
    longitudeWgs84: location.longitudeWgs84,
    elevationMeters: location.elevationMeters,
    sourceProvider: "open_meteo_historical" as const,
    sampleTime: new Date(`2026-05-01T${String(index).padStart(2, "0")}:00:00+08:00`),
    timezone: "Asia/Shanghai",
    temperatureC: 12,
    relativeHumidityPercent: index < 8 ? 88 : 72,
    dewPointC: 8,
    windSpeedMs: 3,
    precipitationAmountMm: 0,
    precipitationProbabilityPercent: 15,
    rainAmountMm: 0,
    snowAmountMm: 0,
    cloudTotalPercent: index < 8 ? 66 : 40,
    cloudLowPercent: index < 8 ? 48 : 20,
    cloudMidPercent: 35,
    cloudHighPercent: 45,
    visibilityMeters: 20000,
    pressureMslHpa: 810,
    weatherCode: "3",
    weatherText: "多云",
  }));
}
