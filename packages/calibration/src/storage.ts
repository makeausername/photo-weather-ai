import { getPrismaClient, type DatabaseClient, type JsonValue } from "@photo-weather/db";
import type {
  CalibrationStatsInput,
  CalibrationStatsRecord,
  ForecastReplayResultInput,
  ForecastReplayResultRecord,
  ForecastReplayRunInput,
  ForecastReplayRunRecord,
  ForecastReplayStatus,
  ForecastReplayTarget,
  HistoricalWeatherSampleInput,
  HistoricalWeatherSampleRecord,
  HistoricalWeatherSourceProvider,
  ObservedOutcomeInput,
  ObservedOutcomeRecord,
  StoredHistoricalWeatherResult,
} from "./types.js";

type ClientOptions = {
  readonly client?: DatabaseClient;
};

type ListSampleOptions = ClientOptions & {
  readonly locationKey: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly sourceProvider?: HistoricalWeatherSourceProvider;
};

type ListReplayResultOptions = ClientOptions & {
  readonly locationKey?: string;
  readonly target?: ForecastReplayTarget;
  readonly replayRunId?: string;
  readonly limit?: number;
};

type ListObservedOutcomeOptions = ClientOptions & {
  readonly locationKey?: string;
  readonly target?: ForecastReplayTarget;
  readonly dateStart?: string;
  readonly dateEnd?: string;
};

type ListCalibrationStatsOptions = ClientOptions & {
  readonly locationKey?: string;
  readonly target?: ForecastReplayTarget;
  readonly ruleVersion?: string;
};

export function buildCalibrationLocationKey(input: {
  readonly spotId?: string | null;
  readonly locationId?: string | null;
  readonly latitudeWgs84?: number | null;
  readonly longitudeWgs84?: number | null;
}): string {
  if (input.spotId) {
    return `spot:${input.spotId}`;
  }
  if (input.locationId) {
    return `location:${input.locationId}`;
  }
  if (
    typeof input.latitudeWgs84 === "number" &&
    Number.isFinite(input.latitudeWgs84) &&
    typeof input.longitudeWgs84 === "number" &&
    Number.isFinite(input.longitudeWgs84)
  ) {
    return `wgs84:${input.latitudeWgs84.toFixed(5)},${input.longitudeWgs84.toFixed(5)}`;
  }
  return "unknown";
}

export async function saveHistoricalWeatherSamples(
  samples: readonly HistoricalWeatherSampleInput[],
  options: ClientOptions = {},
): Promise<StoredHistoricalWeatherResult> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.historicalWeatherSample, "historicalWeatherSample");
  const stored: HistoricalWeatherSampleRecord[] = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const sample of samples) {
    const data = historicalWeatherSampleData(sample);
    const existing = await delegate.findUnique({
      where: {
        locationKey_sourceProvider_sampleTime: {
          locationKey: data.locationKey,
          sourceProvider: sample.sourceProvider,
          sampleTime: sample.sampleTime,
        },
      },
    });

    if (existing) {
      if (isSameHistoricalWeatherSample(existing, data)) {
        skippedCount += 1;
        stored.push(normalizeHistoricalWeatherSample(existing));
        continue;
      }

      const record = await delegate.update({
        where: {
          locationKey_sourceProvider_sampleTime: {
            locationKey: data.locationKey,
            sourceProvider: sample.sourceProvider,
            sampleTime: sample.sampleTime,
          },
        },
        data,
      });
      updatedCount += 1;
      stored.push(normalizeHistoricalWeatherSample(record));
      continue;
    }

    const record = await delegate.create({
      data,
    });
    insertedCount += 1;
    stored.push(normalizeHistoricalWeatherSample(record));
  }

  return {
    insertedCount,
    updatedCount,
    skippedCount,
    skippedDuplicateCount: skippedCount,
    samples: stored,
  };
}

export async function storeHistoricalWeatherSamples(
  samples: readonly HistoricalWeatherSampleInput[],
  options: ClientOptions = {},
): Promise<StoredHistoricalWeatherResult> {
  return saveHistoricalWeatherSamples(samples, options);
}

export async function listHistoricalWeatherSamples(
  options: ListSampleOptions,
): Promise<HistoricalWeatherSampleRecord[]> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.historicalWeatherSample, "historicalWeatherSample");
  const records = await delegate.findMany({
    where: {
      locationKey: options.locationKey,
      ...(options.sourceProvider ? { sourceProvider: options.sourceProvider } : {}),
      sampleTime: {
        gte: startOfDate(options.startDate),
        lt: dayAfter(options.endDate),
      },
    },
    orderBy: [{ sampleTime: "asc" }],
  });

  return records.map(normalizeHistoricalWeatherSample);
}

export async function createForecastReplayRun(
  input: ForecastReplayRunInput,
  options: ClientOptions = {},
): Promise<ForecastReplayRunRecord> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.forecastReplayRun, "forecastReplayRun");
  const record = await delegate.create({
    data: {
      spotId: input.spotId ?? null,
      locationKey: input.locationKey,
      locationName: input.locationName,
      latitudeWgs84: input.latitudeWgs84,
      longitudeWgs84: input.longitudeWgs84,
      elevationMeters: input.elevationMeters ?? null,
      dateStart: dateOnly(input.dateStart),
      dateEnd: dateOnly(input.dateEnd),
      target: input.target,
      modelVersion: input.modelVersion ?? null,
      ruleVersion: input.ruleVersion ?? null,
      sourceProvider: input.sourceProvider,
      status: input.status ?? "pending",
      errorMessage: input.errorMessage ?? null,
    },
  });

  return normalizeForecastReplayRun(record);
}

export async function updateForecastReplayRunStatus(
  id: string,
  input: {
    readonly status: ForecastReplayStatus;
    readonly errorMessage?: string | null;
    readonly completedAt?: Date | null;
  },
  options: ClientOptions = {},
): Promise<ForecastReplayRunRecord> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.forecastReplayRun, "forecastReplayRun");
  const record = await delegate.update({
    where: { id },
    data: {
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      completedAt: input.completedAt === undefined ? null : input.completedAt,
    },
  });

  return normalizeForecastReplayRun(record);
}

export async function createForecastReplayResults(
  inputs: readonly ForecastReplayResultInput[],
  options: ClientOptions = {},
): Promise<ForecastReplayResultRecord[]> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.forecastReplayResult, "forecastReplayResult");
  const records: ForecastReplayResultRecord[] = [];

  for (const input of inputs) {
    const record = await delegate.create({
      data: forecastReplayResultData(input),
    });
    records.push(normalizeForecastReplayResult(record));
  }

  return records;
}

export async function listForecastReplayResults(
  options: ListReplayResultOptions = {},
): Promise<ForecastReplayResultRecord[]> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.forecastReplayResult, "forecastReplayResult");
  const records = await delegate.findMany({
    where: {
      ...(options.locationKey ? { locationKey: options.locationKey } : {}),
      ...(options.target ? { target: options.target } : {}),
      ...(options.replayRunId ? { replayRunId: options.replayRunId } : {}),
    },
    orderBy: [{ forecastDate: "desc" }, { createdAt: "desc" }],
    ...(options.limit ? { take: options.limit } : {}),
  });

  return records.map(normalizeForecastReplayResult);
}

export async function upsertObservedOutcome(
  input: ObservedOutcomeInput,
  options: ClientOptions = {},
): Promise<ObservedOutcomeRecord> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.observedOutcome, "observedOutcome");
  const data = observedOutcomeData(input);
  const record = await delegate.upsert({
    where: {
      locationKey_target_outcomeDate: {
        locationKey: input.locationKey,
        target: input.target,
        outcomeDate: dateOnly(input.outcomeDate),
      },
    },
    create: data,
    update: data,
  });

  return normalizeObservedOutcome(record);
}

export async function listObservedOutcomes(
  options: ListObservedOutcomeOptions = {},
): Promise<ObservedOutcomeRecord[]> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.observedOutcome, "observedOutcome");
  const records = await delegate.findMany({
    where: {
      ...(options.locationKey ? { locationKey: options.locationKey } : {}),
      ...(options.target ? { target: options.target } : {}),
      ...(options.dateStart || options.dateEnd
        ? {
            outcomeDate: {
              ...(options.dateStart ? { gte: dateOnly(options.dateStart) } : {}),
              ...(options.dateEnd ? { lte: dateOnly(options.dateEnd) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ outcomeDate: "desc" }],
  });

  return records.map(normalizeObservedOutcome);
}

export async function upsertCalibrationStats(
  input: CalibrationStatsInput,
  options: ClientOptions = {},
): Promise<CalibrationStatsRecord> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.calibrationStats, "calibrationStats");
  const data = calibrationStatsData(input);
  const record = await delegate.upsert({
    where: {
      locationKey_target_ruleVersion: {
        locationKey: input.locationKey,
        target: input.target,
        ruleVersion: input.ruleVersion,
      },
    },
    create: data,
    update: data,
  });

  return normalizeCalibrationStats(record);
}

export async function listCalibrationStats(
  options: ListCalibrationStatsOptions = {},
): Promise<CalibrationStatsRecord[]> {
  const client = await resolveClient(options.client);
  const delegate = requireDelegate(client.calibrationStats, "calibrationStats");
  const records = await delegate.findMany({
    where: {
      ...(options.locationKey ? { locationKey: options.locationKey } : {}),
      ...(options.target ? { target: options.target } : {}),
      ...(options.ruleVersion ? { ruleVersion: options.ruleVersion } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return records.map(normalizeCalibrationStats);
}

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireDelegate<T>(delegate: T | undefined, name: string): T {
  if (!delegate) {
    throw new Error(`Database client is missing the ${name} delegate.`);
  }
  return delegate;
}

function historicalWeatherSampleData(input: HistoricalWeatherSampleInput) {
  return {
    spotId: input.spotId ?? null,
    locationKey: input.locationKey,
    locationName: input.locationName,
    latitudeWgs84: input.latitudeWgs84,
    longitudeWgs84: input.longitudeWgs84,
    elevationMeters: input.elevationMeters ?? null,
    sourceProvider: input.sourceProvider,
    sampleTime: input.sampleTime,
    timezone: input.timezone,
    temperatureC: input.temperatureC ?? null,
    relativeHumidityPercent: input.relativeHumidityPercent ?? null,
    dewPointC: input.dewPointC ?? null,
    windSpeedMs: input.windSpeedMs ?? null,
    windGustMs: input.windGustMs ?? null,
    windDirectionDeg: input.windDirectionDeg ?? null,
    precipitationAmountMm: input.precipitationAmountMm ?? null,
    precipitationProbabilityPercent: input.precipitationProbabilityPercent ?? null,
    rainAmountMm: input.rainAmountMm ?? null,
    snowAmountMm: input.snowAmountMm ?? null,
    cloudTotalPercent: input.cloudTotalPercent ?? null,
    cloudLowPercent: input.cloudLowPercent ?? null,
    cloudMidPercent: input.cloudMidPercent ?? null,
    cloudHighPercent: input.cloudHighPercent ?? null,
    visibilityMeters: input.visibilityMeters ?? null,
    pressureMslHpa: input.pressureMslHpa ?? null,
    weatherCode: input.weatherCode ?? null,
    weatherText: input.weatherText ?? null,
    rawJson: input.rawJson ?? null,
  };
}

function isSameHistoricalWeatherSample(
  record: any,
  data: ReturnType<typeof historicalWeatherSampleData>,
): boolean {
  return (
    record.spotId === data.spotId &&
    record.locationKey === data.locationKey &&
    record.locationName === data.locationName &&
    record.latitudeWgs84 === data.latitudeWgs84 &&
    record.longitudeWgs84 === data.longitudeWgs84 &&
    (record.elevationMeters ?? null) === data.elevationMeters &&
    record.sourceProvider === data.sourceProvider &&
    sameDate(record.sampleTime, data.sampleTime) &&
    record.timezone === data.timezone &&
    sameNullableNumber(record.temperatureC, data.temperatureC) &&
    sameNullableNumber(record.relativeHumidityPercent, data.relativeHumidityPercent) &&
    sameNullableNumber(record.dewPointC, data.dewPointC) &&
    sameNullableNumber(record.windSpeedMs, data.windSpeedMs) &&
    sameNullableNumber(record.windGustMs, data.windGustMs) &&
    sameNullableNumber(record.windDirectionDeg, data.windDirectionDeg) &&
    sameNullableNumber(record.precipitationAmountMm, data.precipitationAmountMm) &&
    sameNullableNumber(
      record.precipitationProbabilityPercent,
      data.precipitationProbabilityPercent,
    ) &&
    sameNullableNumber(record.rainAmountMm, data.rainAmountMm) &&
    sameNullableNumber(record.snowAmountMm, data.snowAmountMm) &&
    sameNullableNumber(record.cloudTotalPercent, data.cloudTotalPercent) &&
    sameNullableNumber(record.cloudLowPercent, data.cloudLowPercent) &&
    sameNullableNumber(record.cloudMidPercent, data.cloudMidPercent) &&
    sameNullableNumber(record.cloudHighPercent, data.cloudHighPercent) &&
    sameNullableNumber(record.visibilityMeters, data.visibilityMeters) &&
    sameNullableNumber(record.pressureMslHpa, data.pressureMslHpa) &&
    (record.weatherCode ?? null) === data.weatherCode &&
    (record.weatherText ?? null) === data.weatherText &&
    JSON.stringify(record.rawJson ?? null) === JSON.stringify(data.rawJson)
  );
}

function sameDate(left: Date | string, right: Date | string): boolean {
  return toDate(left).getTime() === toDate(right).getTime();
}

function sameNullableNumber(left: unknown, right: unknown): boolean {
  const normalizedLeft = typeof left === "number" && Number.isFinite(left) ? left : null;
  const normalizedRight = typeof right === "number" && Number.isFinite(right) ? right : null;
  return normalizedLeft === normalizedRight;
}

function forecastReplayResultData(input: ForecastReplayResultInput) {
  return {
    replayRunId: input.replayRunId,
    spotId: input.spotId ?? null,
    locationKey: input.locationKey,
    locationName: input.locationName,
    target: input.target,
    forecastDate: dateOnly(input.forecastDate),
    overallScore: input.overallScore ?? null,
    recommendationLabel: input.recommendationLabel ?? null,
    dedicatedTripRecommendation: input.dedicatedTripRecommendation ?? null,
    nearbyObservationRecommendation: input.nearbyObservationRecommendation ?? null,
    bestWindowStart: input.bestWindowStart ? new Date(input.bestWindowStart) : null,
    bestWindowEnd: input.bestWindowEnd ? new Date(input.bestWindowEnd) : null,
    bestSubject: input.bestSubject ?? null,
    cloudSeaFormationScore: input.cloudSeaFormationScore ?? null,
    cloudSeaShootableScore: input.cloudSeaShootableScore ?? null,
    whiteoutRiskScore: input.whiteoutRiskScore ?? null,
    sunriseGlowScore: input.sunriseGlowScore ?? null,
    sunsetGlowScore: input.sunsetGlowScore ?? null,
    astroPracticalScore: input.astroPracticalScore ?? null,
    milkyWayPracticalScore: input.milkyWayPracticalScore ?? null,
    precipitationRiskLevel: input.precipitationRiskLevel ?? null,
    transparencyGrade: input.transparencyGrade ?? null,
    confidenceLabel: input.confidenceLabel ?? null,
    predictedJson: input.predictedJson,
  };
}

function observedOutcomeData(input: ObservedOutcomeInput) {
  return {
    spotId: input.spotId ?? null,
    locationKey: input.locationKey,
    locationName: input.locationName,
    target: input.target,
    outcomeDate: dateOnly(input.outcomeDate),
    observationWindowStart: input.observationWindowStart
      ? new Date(input.observationWindowStart)
      : null,
    observationWindowEnd: input.observationWindowEnd ? new Date(input.observationWindowEnd) : null,
    observedResult: input.observedResult,
    cloudSeaLevel: input.cloudSeaLevel ?? null,
    whiteoutLevel: input.whiteoutLevel ?? null,
    sunriseGlowLevel: input.sunriseGlowLevel ?? null,
    sunsetGlowLevel: input.sunsetGlowLevel ?? null,
    astroVisibilityLevel: input.astroVisibilityLevel ?? null,
    transparencyLevel: input.transparencyLevel ?? null,
    rainImpactLevel: input.rainImpactLevel ?? null,
    notes: input.notes ?? null,
    photoEvidenceUrl: input.photoEvidenceUrl ?? null,
    source: input.source ?? "admin_manual",
    createdBy: input.createdBy ?? null,
  };
}

function calibrationStatsData(input: CalibrationStatsInput) {
  return {
    spotId: input.spotId ?? null,
    locationKey: input.locationKey,
    target: input.target,
    ruleVersion: input.ruleVersion,
    sampleCount: input.sampleCount,
    successCount: input.successCount,
    partialCount: input.partialCount,
    failCount: input.failCount,
    hitRate: input.hitRate,
    falsePositiveRate: input.falsePositiveRate,
    falseNegativeRate: input.falseNegativeRate,
    whiteoutFalsePositiveRate: input.whiteoutFalsePositiveRate ?? null,
    bestWindowHitRate: input.bestWindowHitRate ?? null,
    recommendedTripHitRate: input.recommendedTripHitRate ?? null,
    summaryJson: input.summaryJson,
  };
}

function normalizeHistoricalWeatherSample(record: any): HistoricalWeatherSampleRecord {
  return {
    id: record.id,
    spotId: record.spotId ?? null,
    locationKey: record.locationKey,
    locationName: record.locationName,
    latitudeWgs84: record.latitudeWgs84,
    longitudeWgs84: record.longitudeWgs84,
    elevationMeters: record.elevationMeters ?? null,
    sourceProvider: record.sourceProvider,
    sampleTime: toDate(record.sampleTime),
    timezone: record.timezone,
    temperatureC: record.temperatureC ?? null,
    relativeHumidityPercent: record.relativeHumidityPercent ?? null,
    dewPointC: record.dewPointC ?? null,
    windSpeedMs: record.windSpeedMs ?? null,
    windGustMs: record.windGustMs ?? null,
    windDirectionDeg: record.windDirectionDeg ?? null,
    precipitationAmountMm: record.precipitationAmountMm ?? null,
    precipitationProbabilityPercent: record.precipitationProbabilityPercent ?? null,
    rainAmountMm: record.rainAmountMm ?? null,
    snowAmountMm: record.snowAmountMm ?? null,
    cloudTotalPercent: record.cloudTotalPercent ?? null,
    cloudLowPercent: record.cloudLowPercent ?? null,
    cloudMidPercent: record.cloudMidPercent ?? null,
    cloudHighPercent: record.cloudHighPercent ?? null,
    visibilityMeters: record.visibilityMeters ?? null,
    pressureMslHpa: record.pressureMslHpa ?? null,
    weatherCode: record.weatherCode ?? null,
    weatherText: record.weatherText ?? null,
    rawJson: record.rawJson ?? null,
    createdAt: toDate(record.createdAt),
    updatedAt: toDate(record.updatedAt),
  };
}

function normalizeForecastReplayRun(record: any): ForecastReplayRunRecord {
  return {
    id: record.id,
    spotId: record.spotId ?? null,
    locationKey: record.locationKey,
    locationName: record.locationName,
    latitudeWgs84: record.latitudeWgs84,
    longitudeWgs84: record.longitudeWgs84,
    elevationMeters: record.elevationMeters ?? null,
    dateStart: toDate(record.dateStart),
    dateEnd: toDate(record.dateEnd),
    target: record.target,
    modelVersion: record.modelVersion ?? null,
    ruleVersion: record.ruleVersion ?? null,
    sourceProvider: record.sourceProvider,
    status: record.status,
    errorMessage: record.errorMessage ?? null,
    createdAt: toDate(record.createdAt),
    completedAt: record.completedAt ? toDate(record.completedAt) : null,
  };
}

function normalizeForecastReplayResult(record: any): ForecastReplayResultRecord {
  return {
    id: record.id,
    replayRunId: record.replayRunId,
    spotId: record.spotId ?? null,
    locationKey: record.locationKey,
    locationName: record.locationName,
    target: record.target,
    forecastDate: toDate(record.forecastDate),
    overallScore: record.overallScore ?? null,
    recommendationLabel: record.recommendationLabel ?? null,
    dedicatedTripRecommendation: record.dedicatedTripRecommendation ?? null,
    nearbyObservationRecommendation: record.nearbyObservationRecommendation ?? null,
    bestWindowStart: record.bestWindowStart ? toDate(record.bestWindowStart) : null,
    bestWindowEnd: record.bestWindowEnd ? toDate(record.bestWindowEnd) : null,
    bestSubject: record.bestSubject ?? null,
    cloudSeaFormationScore: record.cloudSeaFormationScore ?? null,
    cloudSeaShootableScore: record.cloudSeaShootableScore ?? null,
    whiteoutRiskScore: record.whiteoutRiskScore ?? null,
    sunriseGlowScore: record.sunriseGlowScore ?? null,
    sunsetGlowScore: record.sunsetGlowScore ?? null,
    astroPracticalScore: record.astroPracticalScore ?? null,
    milkyWayPracticalScore: record.milkyWayPracticalScore ?? null,
    precipitationRiskLevel: record.precipitationRiskLevel ?? null,
    transparencyGrade: record.transparencyGrade ?? null,
    confidenceLabel: record.confidenceLabel ?? null,
    predictedJson: record.predictedJson as JsonValue,
    createdAt: toDate(record.createdAt),
  };
}

function normalizeObservedOutcome(record: any): ObservedOutcomeRecord {
  return {
    id: record.id,
    spotId: record.spotId ?? null,
    locationKey: record.locationKey,
    locationName: record.locationName,
    target: record.target,
    outcomeDate: toDate(record.outcomeDate),
    observationWindowStart: record.observationWindowStart
      ? toDate(record.observationWindowStart)
      : null,
    observationWindowEnd: record.observationWindowEnd ? toDate(record.observationWindowEnd) : null,
    observedResult: record.observedResult,
    cloudSeaLevel: record.cloudSeaLevel ?? null,
    whiteoutLevel: record.whiteoutLevel ?? null,
    sunriseGlowLevel: record.sunriseGlowLevel ?? null,
    sunsetGlowLevel: record.sunsetGlowLevel ?? null,
    astroVisibilityLevel: record.astroVisibilityLevel ?? null,
    transparencyLevel: record.transparencyLevel ?? null,
    rainImpactLevel: record.rainImpactLevel ?? null,
    notes: record.notes ?? null,
    photoEvidenceUrl: record.photoEvidenceUrl ?? null,
    source: record.source,
    createdBy: record.createdBy ?? null,
    createdAt: toDate(record.createdAt),
    updatedAt: toDate(record.updatedAt),
  };
}

function normalizeCalibrationStats(record: any): CalibrationStatsRecord {
  return {
    id: record.id,
    spotId: record.spotId ?? null,
    locationKey: record.locationKey,
    target: record.target,
    ruleVersion: record.ruleVersion,
    sampleCount: record.sampleCount,
    successCount: record.successCount,
    partialCount: record.partialCount,
    failCount: record.failCount,
    hitRate: record.hitRate,
    falsePositiveRate: record.falsePositiveRate,
    falseNegativeRate: record.falseNegativeRate,
    whiteoutFalsePositiveRate: record.whiteoutFalsePositiveRate ?? null,
    bestWindowHitRate: record.bestWindowHitRate ?? null,
    recommendedTripHitRate: record.recommendedTripHitRate ?? null,
    updatedAt: toDate(record.updatedAt),
    summaryJson: record.summaryJson as JsonValue,
  };
}

function startOfDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000+08:00`);
}

function dayAfter(value: string): Date {
  const date = startOfDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function dateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
