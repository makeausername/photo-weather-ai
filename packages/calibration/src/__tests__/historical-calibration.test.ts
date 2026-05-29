import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient, ForecastReplayResultRecord, ObservedOutcomeRecord } from "@photo-weather/db";
import {
  buildCalibrationHint,
  buildOpenMeteoHistoricalWeatherUrl,
  classifyPrediction,
  compareReplayResultWithOutcome,
  compareReplayResultsWithOutcomes,
  createForecastReplayResults,
  createForecastReplayRun,
  deterministicRuleVersion,
  normalizeOpenMeteoHistoricalWeather,
  rebuildCalibrationStats,
  runHistoricalReplay,
  saveHistoricalWeatherSamples,
  upsertObservedOutcome,
} from "../index.js";
import type { ForecastReplayResultInput, HistoricalWeatherSampleInput } from "../types.js";

type MemoryState = {
  readonly historicalWeatherSamples: Map<string, any>;
  readonly forecastReplayRuns: Map<string, any>;
  readonly forecastReplayResults: Map<string, any>;
  readonly observedOutcomes: Map<string, any>;
  readonly calibrationStats: Map<string, any>;
};

const location = {
  spotId: "spot-test",
  locationKey: "spot:spot-test",
  locationName: "测试机位",
  latitudeWgs84: 30.1328,
  longitudeWgs84: 118.1718,
  elevationMeters: 1800,
};

describe("Historical Calibration V1", () => {
  it("builds an Open-Meteo archive URL with supported historical hourly fields", () => {
    const url = new URL(
      buildOpenMeteoHistoricalWeatherUrl("https://archive-api.open-meteo.com/v1/archive", {
        ...location,
        startDate: "2026-05-01",
        endDate: "2026-05-07",
        timezone: "Asia/Shanghai",
      }),
    );
    const hourly = url.searchParams.get("hourly") ?? "";

    expect(hourly).toContain("temperature_2m");
    expect(hourly).toContain("cloud_cover_low");
    expect(hourly).toContain("visibility");
    expect(hourly).toContain("wind_gusts_10m");
    expect(hourly).not.toContain("precipitation_probability");
    expect(url.toString()).not.toMatch(/api[_-]?key|secret|token/i);
  });

  it("normalizes Open-Meteo historical hourly samples and tolerates optional missing fields", () => {
    const samples = normalizeOpenMeteoHistoricalWeather(
      openMeteoFixture({ includeOptional: false, includeProbability: false }),
      {
        ...location,
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        timezone: "Asia/Shanghai",
      },
    );

    expect(samples).toHaveLength(2);
    expect(samples[0]).toMatchObject({
      locationKey: "spot:spot-test",
      sourceProvider: "open_meteo_historical",
      temperatureC: 12,
      relativeHumidityPercent: 88,
      precipitationAmountMm: 0.2,
      precipitationProbabilityPercent: null,
      cloudLowPercent: null,
      visibilityMeters: null,
    });
  });

  it("stores historical samples without inserting duplicates", async () => {
    const { client } = createMemoryClient();
    const samples = normalizeOpenMeteoHistoricalWeather(openMeteoFixture(), {
      ...location,
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      timezone: "Asia/Shanghai",
    });

    const first = await saveHistoricalWeatherSamples(samples, { client });
    const second = await saveHistoricalWeatherSamples(samples, { client });

    expect(first.insertedCount).toBe(2);
    expect(second.insertedCount).toBe(0);
    expect(second.updatedCount).toBe(0);
    expect(second.skippedCount).toBe(2);
    expect(second.skippedDuplicateCount).toBe(2);
  });

  it("updates changed duplicate historical samples without creating another row", async () => {
    const { client, state } = createMemoryClient();
    const [sample] = normalizeOpenMeteoHistoricalWeather(openMeteoFixture(), {
      ...location,
      startDate: "2026-05-01",
      endDate: "2026-05-01",
      timezone: "Asia/Shanghai",
    });
    if (!sample) {
      throw new Error("expected fixture sample");
    }

    await saveHistoricalWeatherSamples([sample], { client });
    const updated = await saveHistoricalWeatherSamples([{ ...sample, temperatureC: 14 }], {
      client,
    });

    expect(updated.updatedCount).toBe(1);
    expect(state.historicalWeatherSamples.size).toBe(1);
    expect([...state.historicalWeatherSamples.values()][0]?.temperatureC).toBe(14);
  });

  it("replays deterministic scoring from stored historical samples without DeepSeek or forecast providers", async () => {
    const { client } = createMemoryClient();
    const fetchSpy = vi.fn(() => {
      throw new Error("replay must not call network");
    });
    vi.stubGlobal("fetch", fetchSpy);
    await saveHistoricalWeatherSamples(buildHourlySamples(24, "2026-05-01"), { client });

    const replay = await runHistoricalReplay(
      {
        ...location,
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        target: "general",
      },
      { client },
    );

    expect(replay.resultCount).toBe(1);
    expect(replay.results[0]?.predictedJson).toMatchObject({
      ruleVersion: deterministicRuleVersion,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("replays with missing historical fields marked as lower confidence instead of crashing", async () => {
    const { client } = createMemoryClient();
    await saveHistoricalWeatherSamples(
      buildHourlySamples(24, "2026-05-01").map((sample, index) =>
        index === 0
          ? {
              ...sample,
              temperatureC: null,
              relativeHumidityPercent: null,
              windSpeedMs: null,
              precipitationProbabilityPercent: null,
            }
          : sample,
      ),
      { client },
    );

    const replay = await runHistoricalReplay(
      {
        ...location,
        startDate: "2026-05-01",
        endDate: "2026-05-01",
        target: "general",
      },
      { client },
    );

    expect(replay.results).toHaveLength(1);
    expect(replay.results[0]?.confidenceLabel).toBe("medium");
  });

  it("classifies outcomes, computes stats, and gates low-sample calibration hints", async () => {
    const { client } = createMemoryClient();
    const run = await createForecastReplayRun(
      {
        ...location,
        dateStart: "2026-05-01",
        dateEnd: "2026-05-10",
        target: "general",
        modelVersion: "test",
        ruleVersion: deterministicRuleVersion,
        sourceProvider: "manual",
      },
      { client },
    );
    const results = await createForecastReplayResults(buildReplayResults(run.id, 10), { client });
    for (let index = 0; index < 10; index += 1) {
      await upsertObservedOutcome(
        {
          ...location,
          target: "general",
          outcomeDate: `2026-05-${String(index + 1).padStart(2, "0")}`,
          observedResult: index === 0 ? "fail" : index === 1 ? "partial" : "success",
          whiteoutLevel: index === 0 ? "high" : "none",
        },
        { client },
      );
    }

    const comparisons = compareReplayResultsWithOutcomes(results, [
      await upsertObservedOutcome(
        {
          ...location,
          target: "general",
          outcomeDate: "2026-05-11",
          observedResult: "unknown",
        },
        { client },
      ),
    ]);
    expect(comparisons[0]?.classification).toBe("unlabeled");

    const stats = await rebuildCalibrationStats({
      client,
      locationKey: location.locationKey,
      spotId: location.spotId,
      target: "general",
      ruleVersion: deterministicRuleVersion,
    });

    expect(stats.sampleCount).toBe(10);
    expect(stats.labeledCount).toBe(10);
    expect(stats.falsePositiveRate).toBe(0.1);
    expect(stats.partialCount).toBe(1);
    expect(buildCalibrationHint({ ...stats, labeledCount: 9 })).toBeNull();
    expect(buildCalibrationHint(stats)?.displayNoteZh).toContain("历史校准");
  });

  it("creates and updates observed outcomes with unknown subject labels and optional fields", async () => {
    const { client } = createMemoryClient();

    const created = await upsertObservedOutcome(
      {
        ...location,
        target: "astro",
        outcomeDate: "2026-05-01",
        observedResult: "partial",
        astroVisibilityLevel: "unknown",
        milkyWayVisibilityLevel: "unknown",
      },
      { client },
    );
    const updated = await upsertObservedOutcome(
      {
        ...location,
        target: "astro",
        outcomeDate: "2026-05-01",
        observedResult: "success",
        astroVisibilityLevel: "strong",
        milkyWayVisibilityLevel: "medium",
      },
      { client },
    );

    expect(created.id).toBe(updated.id);
    expect(updated.observedResult).toBe("success");
    expect(updated.milkyWayVisibilityLevel).toBe("medium");
    expect(updated.notes).toBeNull();
  });

  it("maps replay predictions to observed outcomes with deterministic match scores", () => {
    const base = buildReplayResults("run-test", 1)[0];
    if (!base) {
      throw new Error("expected replay result fixture");
    }
    const result: ForecastReplayResultRecord = {
      id: "result-test",
      replayRunId: base.replayRunId,
      spotId: base.spotId ?? null,
      locationKey: base.locationKey,
      locationName: base.locationName,
      target: base.target,
      forecastDate: new Date(`${base.forecastDate}T00:00:00.000Z`),
      overallScore: base.overallScore ?? null,
      recommendationLabel: base.recommendationLabel ?? null,
      dedicatedTripRecommendation: base.dedicatedTripRecommendation ?? null,
      nearbyObservationRecommendation: base.nearbyObservationRecommendation ?? null,
      bestWindowStart: null,
      bestWindowEnd: null,
      bestSubject: null,
      cloudSeaFormationScore: null,
      cloudSeaShootableScore: null,
      whiteoutRiskScore: null,
      sunriseGlowScore: null,
      sunsetGlowScore: null,
      astroPracticalScore: null,
      milkyWayPracticalScore: null,
      precipitationRiskLevel: null,
      transparencyGrade: null,
      confidenceLabel: "high",
      predictedJson: base.predictedJson,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    };
    const outcome: ObservedOutcomeRecord = {
      id: "outcome-test",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      spotId: location.spotId,
      locationKey: location.locationKey,
      locationName: location.locationName,
      latitudeWgs84: location.latitudeWgs84,
      longitudeWgs84: location.longitudeWgs84,
      target: "general" as const,
      outcomeDate: new Date("2026-05-01T00:00:00.000Z"),
      observationWindowStart: null,
      observationWindowEnd: null,
      observedResult: "success" as const,
      cloudSeaLevel: null,
      whiteoutLevel: null,
      sunriseGlowLevel: null,
      sunsetGlowLevel: null,
      astroVisibilityLevel: null,
      milkyWayVisibilityLevel: null,
      transparencyLevel: null,
      rainImpactLevel: null,
      notes: null,
      photoEvidenceUrl: null,
      source: "admin_manual" as const,
      createdBy: null,
    };

    expect(compareReplayResultWithOutcome(result, outcome).matchStatus).toBe("true_positive");
    expect(
      compareReplayResultWithOutcome(result, { ...outcome, observedResult: "fail" }).matchStatus,
    ).toBe("false_positive");
    expect(
      compareReplayResultWithOutcome(
        { ...result, overallScore: 20, recommendationLabel: "不建议专程前往" },
        { ...outcome, observedResult: "fail" },
      ).matchStatus,
    ).toBe("true_negative");
    expect(
      compareReplayResultWithOutcome(
        { ...result, overallScore: 20, recommendationLabel: "不建议专程前往" },
        outcome,
      ).matchStatus,
    ).toBe("false_negative");
    expect(classifyPrediction("cautious", "partial", "general")).toBe("partial_match");
    expect(compareReplayResultWithOutcome(result, null).matchStatus).toBe("unlabeled");
  });
});

function openMeteoFixture(
  options: { readonly includeOptional?: boolean; readonly includeProbability?: boolean } = {},
) {
  const includeOptional = options.includeOptional ?? true;
  const includeProbability = options.includeProbability ?? true;
  return {
    timezone: "Asia/Shanghai",
    utc_offset_seconds: 28800,
    elevation: 1800,
    hourly: {
      time: ["2026-05-01T00:00", "2026-05-01T01:00"],
      temperature_2m: [12, 11.5],
      relative_humidity_2m: [88, 91],
      dew_point_2m: [9, 9.5],
      precipitation_probability: includeProbability ? [20, 30] : undefined,
      precipitation: [0.2, 0],
      rain: [0.2, 0],
      snowfall: [0, 0],
      cloud_cover: [72, 80],
      cloud_cover_low: includeOptional ? [40, 55] : undefined,
      cloud_cover_mid: includeOptional ? [30, 42] : undefined,
      cloud_cover_high: includeOptional ? [65, 70] : undefined,
      visibility: includeOptional ? [16000, 12000] : undefined,
      wind_speed_10m: [3.2, 3.8],
      wind_gusts_10m: [6.5, 7],
      wind_direction_10m: [120, 130],
      pressure_msl: [810, 809],
      weather_code: [3, 3],
    },
  };
}

function buildHourlySamples(hours: number, date: string): readonly HistoricalWeatherSampleInput[] {
  return Array.from({ length: hours }, (_, index) => ({
    ...location,
    sourceProvider: "open_meteo_historical",
    sampleTime: new Date(`${date}T${String(index).padStart(2, "0")}:00:00+08:00`),
    timezone: "Asia/Shanghai",
    temperatureC: 12 + Math.sin(index / 24) * 4,
    relativeHumidityPercent: index < 8 ? 88 : 70,
    dewPointC: 8,
    windSpeedMs: 3,
    precipitationAmountMm: index === 14 ? 0.4 : 0,
    precipitationProbabilityPercent: index === 14 ? 60 : 15,
    cloudTotalPercent: index < 8 ? 68 : 42,
    cloudLowPercent: index < 8 ? 50 : 24,
    cloudMidPercent: 35,
    cloudHighPercent: 45,
    visibilityMeters: 18000,
    pressureMslHpa: 810,
    weatherCode: "3",
    weatherText: "多云",
  }));
}

function buildReplayResults(runId: string, days: number): readonly ForecastReplayResultInput[] {
  return Array.from({ length: days }, (_, index) => ({
    replayRunId: runId,
    spotId: location.spotId,
    locationKey: location.locationKey,
    locationName: location.locationName,
    target: "general",
    forecastDate: `2026-05-${String(index + 1).padStart(2, "0")}`,
    overallScore: index === 9 ? 38 : 82,
    recommendationLabel: index === 9 ? "不建议" : "推荐",
    confidenceLabel: "high",
    whiteoutRiskScore: index === 0 ? 20 : 70,
    predictedJson: {
      ruleVersion: deterministicRuleVersion,
      recommendationLevel: index === 9 ? "not_recommended" : "recommended",
    },
  }));
}

function createMemoryClient(): { readonly client: DatabaseClient; readonly state: MemoryState } {
  const now = new Date("2026-05-01T00:00:00.000Z");
  const state: MemoryState = {
    historicalWeatherSamples: new Map(),
    forecastReplayRuns: new Map(),
    forecastReplayResults: new Map(),
    observedOutcomes: new Map(),
    calibrationStats: new Map(),
  };

  const client = {
    historicalWeatherSample: {
      findUnique: async ({ where }: any) =>
        state.historicalWeatherSamples.get(
          historyKey(where.locationKey_sourceProvider_sampleTime),
        ) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...state.historicalWeatherSamples.values()]
          .filter((item) => !where?.locationKey || item.locationKey === where.locationKey)
          .filter((item) => !where?.sourceProvider || item.sourceProvider === where.sourceProvider)
          .filter(
            (item) =>
              !where?.sampleTime ||
              (item.sampleTime >= where.sampleTime.gte && item.sampleTime < where.sampleTime.lt),
          )
          .sort((left, right) => left.sampleTime.getTime() - right.sampleTime.getTime()),
      create: async ({ data }: any) => {
        const record = {
          id: `sample-${state.historicalWeatherSamples.size}`,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.historicalWeatherSamples.set(historyKey(record), record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const key = historyKey(where.locationKey_sourceProvider_sampleTime);
        const existing = state.historicalWeatherSamples.get(key);
        if (!existing) {
          throw new Error(`missing historical sample ${key}`);
        }
        const record = { ...existing, ...data, updatedAt: now };
        state.historicalWeatherSamples.set(key, record);
        return record;
      },
      upsert: async () => {
        throw new Error("not used");
      },
      count: async () => state.historicalWeatherSamples.size,
    },
    forecastReplayRun: {
      findUnique: async ({ where }: any) => state.forecastReplayRuns.get(where.id) ?? null,
      findMany: async () => [...state.forecastReplayRuns.values()],
      create: async ({ data }: any) => {
        const record = {
          id: `run-${state.forecastReplayRuns.size}`,
          errorMessage: null,
          completedAt: null,
          createdAt: now,
          ...data,
        };
        state.forecastReplayRuns.set(record.id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const next = { ...state.forecastReplayRuns.get(where.id), ...data };
        state.forecastReplayRuns.set(where.id, next);
        return next;
      },
    },
    forecastReplayResult: {
      findUnique: async ({ where }: any) =>
        state.forecastReplayResults.get(resultKey(where.replayRunId_forecastDate_target)) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...state.forecastReplayResults.values()]
          .filter((item) => !where?.locationKey || item.locationKey === where.locationKey)
          .filter((item) => !where?.target || item.target === where.target)
          .sort((left, right) => right.forecastDate.getTime() - left.forecastDate.getTime()),
      create: async ({ data }: any) => {
        const record = {
          id: `result-${state.forecastReplayResults.size}`,
          createdAt: now,
          ...data,
        };
        state.forecastReplayResults.set(resultKey(record), record);
        return record;
      },
      count: async () => state.forecastReplayResults.size,
    },
    observedOutcome: {
      findUnique: async ({ where }: any) =>
        state.observedOutcomes.get(outcomeKey(where.locationKey_target_outcomeDate)) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...state.observedOutcomes.values()]
          .filter((item) => !where?.locationKey || item.locationKey === where.locationKey)
          .filter((item) => !where?.target || item.target === where.target),
      create: async ({ data }: any) => {
        const record = {
          id: `outcome-${state.observedOutcomes.size}`,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.observedOutcomes.set(outcomeKey(record), record);
        return record;
      },
      update: async () => {
        throw new Error("not used");
      },
      upsert: async ({ where, create, update }: any) => {
        const key = outcomeKey(where.locationKey_target_outcomeDate);
        const existing = state.observedOutcomes.get(key);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: now };
          state.observedOutcomes.set(key, next);
          return next;
        }
        const record = {
          id: `outcome-${state.observedOutcomes.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        state.observedOutcomes.set(key, record);
        return record;
      },
    },
    calibrationStats: {
      findUnique: async ({ where }: any) =>
        state.calibrationStats.get(statsKey(where.locationKey_target_ruleVersion)) ?? null,
      findMany: async ({ where }: any = {}) =>
        [...state.calibrationStats.values()]
          .filter((item) => !where?.locationKey || item.locationKey === where.locationKey)
          .filter((item) => !where?.target || item.target === where.target),
      upsert: async ({ where, create, update }: any) => {
        const key = statsKey(where.locationKey_target_ruleVersion);
        const existing = state.calibrationStats.get(key);
        const record = {
          id: existing?.id ?? `stats-${state.calibrationStats.size}`,
          updatedAt: now,
          ...(existing ? update : create),
        };
        state.calibrationStats.set(key, record);
        return record;
      },
    },
    systemSetting: {} as any,
    providerConfig: {} as any,
    adminAuditLog: {} as any,
    apiUsageLog: {} as any,
  } satisfies DatabaseClient;

  return { client, state };
}

function historyKey(input: { locationKey: string; sourceProvider: string; sampleTime: Date }) {
  return `${input.locationKey}:${input.sourceProvider}:${input.sampleTime.toISOString()}`;
}

function resultKey(input: { replayRunId: string; forecastDate: Date; target: string }) {
  return `${input.replayRunId}:${input.forecastDate.toISOString().slice(0, 10)}:${input.target}`;
}

function outcomeKey(input: { locationKey: string; target: string; outcomeDate: Date }) {
  return `${input.locationKey}:${input.target}:${input.outcomeDate.toISOString().slice(0, 10)}`;
}

function statsKey(input: { locationKey: string; target: string; ruleVersion: string }) {
  return `${input.locationKey}:${input.target}:${input.ruleVersion}`;
}
