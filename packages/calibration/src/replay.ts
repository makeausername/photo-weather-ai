import { buildForecastInputFromNormalizedWeather, calculateForecast } from "@photo-weather/scoring";
import type {
  ForecastCalculationResult,
  ForecastQueryInput,
  ForecastTarget,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  TerrainAnalysisSummary,
} from "@photo-weather/shared";
import { defaultTimezone, type ForecastDateRange } from "@photo-weather/calendar";
import type { DatabaseClient, JsonValue } from "@photo-weather/db";
import type { TerrainProvider } from "@photo-weather/terrain";
import {
  createForecastReplayResults,
  createForecastReplayRun,
  listHistoricalWeatherSamples,
  updateForecastReplayRunStatus,
} from "./storage.js";
import type {
  ForecastReplayResultInput,
  ForecastReplayRunRecord,
  HistoricalReplayInput,
  HistoricalReplayOutput,
  HistoricalWeatherSampleRecord,
} from "./types.js";

export const historicalCalibrationModelVersion = "historical_calibration_v1";
export const deterministicRuleVersion = "deterministic_rules_v1";

export type HistoricalReplayServiceOptions = {
  readonly client?: DatabaseClient;
  readonly terrainProvider?: TerrainProvider;
};

export async function runHistoricalReplay(
  input: HistoricalReplayInput,
  options: HistoricalReplayServiceOptions = {},
): Promise<HistoricalReplayOutput> {
  const sourceProvider = input.sourceProvider ?? "open_meteo_historical";
  const modelVersion = input.modelVersion ?? historicalCalibrationModelVersion;
  const ruleVersion = input.ruleVersion ?? deterministicRuleVersion;
  const run = await createForecastReplayRun(
    {
      ...input,
      dateStart: input.startDate,
      dateEnd: input.endDate,
      sourceProvider,
      modelVersion,
      ruleVersion,
      status: "running",
    },
    { client: options.client },
  );

  try {
    const samples = await listHistoricalWeatherSamples({
      client: options.client,
      locationKey: input.locationKey,
      startDate: input.startDate,
      endDate: input.endDate,
      sourceProvider,
    });
    if (samples.length === 0) {
      throw new Error("No historical weather samples are available for this replay range.");
    }

    const forecastRange = buildHistoricalForecastRange(
      input.startDate,
      input.endDate,
      input.timezone ?? samples[0]?.timezone ?? defaultTimezone,
    );
    const calculationResult = calculateForecast(
      buildForecastInputFromNormalizedWeather(
        buildReplayForecastQuery(input),
        buildReplayWeather(samples),
        {
          forecastRange,
          terrainAnalysis: await resolveTerrainAnalysis(input, options.terrainProvider),
          astroDataSourceLabelZh: "本地天文算法历史回放",
        },
      ),
    );
    const resultInputs = buildReplayResultInputs({
      run,
      forecastResult: calculationResult,
      ruleVersion,
    });
    const results = await createForecastReplayResults(resultInputs, { client: options.client });
    const completedRun = await updateForecastReplayRunStatus(
      run.id,
      { status: "completed", completedAt: new Date() },
      { client: options.client },
    );

    return {
      run: completedRun,
      resultCount: results.length,
      results,
    };
  } catch (error) {
    await updateForecastReplayRunStatus(
      run.id,
      {
        status: "failed",
        errorMessage: (error as Error).message,
        completedAt: new Date(),
      },
      { client: options.client },
    );
    throw error;
  }
}

function buildReplayForecastQuery(input: HistoricalReplayInput): ForecastQueryInput {
  return {
    name: input.locationName,
    source: "historical_calibration",
    latitudeGcj02: input.latitudeWgs84,
    longitudeGcj02: input.longitudeWgs84,
    latitudeWgs84: input.latitudeWgs84,
    longitudeWgs84: input.longitudeWgs84,
    elevationMeters: input.elevationMeters ?? undefined,
    horizon: "7d",
    target: input.target as ForecastTarget,
    photoSpotId: input.spotId ?? undefined,
  };
}

function buildReplayWeather(samples: readonly HistoricalWeatherSampleRecord[]) {
  const hourlyWeather = samples.map(historySampleToHourlyWeather);
  const dailyWeather = buildDailyWeatherFromSamples(samples);

  return {
    hourlyWeather,
    dailyWeather,
    isMock: false,
    dataSourceLabel: "Open-Meteo 历史天气",
    weatherProviderCode: "open_meteo",
    weatherProviderLabelZh: "Open-Meteo 历史天气",
    weatherDataMode: "real" as const,
    weatherNoticeZh: "天气数据：历史天气样本用于规则回放",
    weatherMissingFields: collectMissingFields(hourlyWeather, dailyWeather),
    weatherEstimatedFields: collectEstimatedFields(hourlyWeather, dailyWeather),
    weatherSourceSummaries: [],
    weatherMissingDataNotes:
      collectMissingFields(hourlyWeather, dailyWeather).length > 0
        ? ["历史样本存在缺失字段，回放结果会降低置信度。"]
        : [],
  };
}

function historySampleToHourlyWeather(
  sample: HistoricalWeatherSampleRecord,
): NormalizedHourlyWeather {
  const missingFields: string[] = [];
  const estimatedFields: string[] = [];
  const cloudTotal = sample.cloudTotal ?? 50;
  const visibility = sample.visibility ?? null;

  if (sample.cloudTotal === null) {
    estimatedFields.push("cloudTotal");
  }
  if (sample.cloudLow === null) {
    missingFields.push("cloudLow");
  }
  if (sample.cloudMid === null) {
    missingFields.push("cloudMid");
  }
  if (sample.cloudHigh === null) {
    missingFields.push("cloudHigh");
  }
  if (sample.visibility === null) {
    missingFields.push("visibility");
  }
  if (sample.precipitationProbability === null) {
    missingFields.push("precipitationProbability");
  }

  return {
    time: sample.sampleTime.toISOString(),
    temperature: sample.temperature,
    feelsLike: null,
    humidity: sample.humidity,
    dewPointSpread: sample.dewPoint === null ? null : round1(sample.temperature - sample.dewPoint),
    pressure: sample.pressure,
    windSpeed: sample.windSpeed,
    windGust: sample.windGust,
    windDirection: sample.windDirection,
    precipitationProbability: sample.precipitationProbability,
    precipitationProbabilityPercent: sample.precipitationProbability,
    precipitation: sample.precipitationAmount,
    precipitationAmountMm: sample.precipitationAmount,
    rainAmountMm: sample.rainAmount,
    snowAmountMm: sample.snowAmount,
    precipitationType: inferPrecipitationType(sample),
    visibility,
    rawVisibilityKm: visibility,
    dewPoint: sample.dewPoint,
    cloudTotal,
    cloudLow: sample.cloudLow,
    cloudMid: sample.cloudMid,
    cloudHigh: sample.cloudHigh,
    weatherCode: sample.weatherCode,
    weatherTextZh: sample.weatherText,
    providerCode: sample.sourceProvider,
    providerLabelZh: "Open-Meteo 历史天气",
    dataMode: "real",
    sourceConfidence: missingFields.length > 0 || estimatedFields.length > 0 ? 0.72 : 0.84,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    estimatedFields: estimatedFields.length > 0 ? estimatedFields : undefined,
  };
}

function buildDailyWeatherFromSamples(
  samples: readonly HistoricalWeatherSampleRecord[],
): readonly NormalizedDailyWeather[] {
  const byDate = new Map<string, HistoricalWeatherSampleRecord[]>();
  for (const sample of samples) {
    const date = localDate(sample.sampleTime, sample.timezone);
    byDate.set(date, [...(byDate.get(date) ?? []), sample]);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, daySamples]) => {
      const precipitationAmount = sum(daySamples.map((sample) => sample.precipitationAmount));
      const rainAmount = sumOptional(daySamples.map((sample) => sample.rainAmount));
      const snowAmount = sumOptional(daySamples.map((sample) => sample.snowAmount));
      const precipitationProbability = maxOptional(
        daySamples.map((sample) => sample.precipitationProbability),
      );
      const cloudTotal = averageOptional(daySamples.map((sample) => sample.cloudTotal));
      const cloudLow = averageOptional(daySamples.map((sample) => sample.cloudLow));
      const cloudMid = averageOptional(daySamples.map((sample) => sample.cloudMid));
      const cloudHigh = averageOptional(daySamples.map((sample) => sample.cloudHigh));
      const visibility = averageOptional(daySamples.map((sample) => sample.visibility));
      const firstText = daySamples.find((sample) => sample.weatherText)?.weatherText;

      return {
        date,
        tempMin: min(daySamples.map((sample) => sample.temperature)),
        tempMax: max(daySamples.map((sample) => sample.temperature)),
        precipitationProbability,
        precipitationProbabilityPercent: precipitationProbability,
        precipitation: precipitationAmount,
        precipitationAmountMm: precipitationAmount,
        rainAmountMm: rainAmount,
        snowAmountMm: snowAmount,
        precipitationType: inferDailyPrecipitationType({
          rainAmount,
          snowAmount,
          precipitationAmount,
        }),
        windSpeed: average(daySamples.map((sample) => sample.windSpeed)),
        windGust: maxOptional(daySamples.map((sample) => sample.windGust)),
        windDirection: averageOptional(daySamples.map((sample) => sample.windDirection)),
        humidity: average(daySamples.map((sample) => sample.humidity)),
        visibility,
        rawVisibilityKm: visibility,
        cloudTotal,
        cloudLow,
        cloudMid,
        cloudHigh,
        weatherSummary: firstText ?? "历史天气样本",
        providerCode: "open_meteo_historical",
        providerLabelZh: "Open-Meteo 历史天气",
        dataMode: "real",
        missingFields: collectDailyMissingFields({
          precipitationProbability,
          cloudLow,
          cloudMid,
          cloudHigh,
          visibility,
        }),
      };
    });
}

async function resolveTerrainAnalysis(
  input: HistoricalReplayInput,
  terrainProvider: TerrainProvider | undefined,
): Promise<TerrainAnalysisSummary | undefined> {
  if (!terrainProvider) {
    return undefined;
  }

  const coordinate = {
    latitude: input.latitudeWgs84,
    longitude: input.longitudeWgs84,
    system: "wgs84" as const,
    name: input.locationName,
  };
  const terrainInput = {
    locationName: input.locationName,
    coordinate,
    elevationMeters: input.elevationMeters ?? null,
  };
  const [terrainProfile, horizonProfile] = await Promise.all([
    terrainProvider.buildTerrainProfile(terrainInput),
    terrainProvider.buildHorizonProfile(terrainInput),
  ]);

  return {
    terrainProfile,
    horizonProfile,
    dataSource: terrainProfile.elevationSource === "open_meteo" ? "open_meteo_elevation" : "manual",
    dataSourceLabelZh:
      terrainProfile.elevationSource === "open_meteo" ? "Open-Meteo 海拔" : "历史回放地形",
    isMock: terrainProfile.elevationSource !== "open_meteo",
    honestyNoteZh: "历史回放使用当前地形模型参与规则计算。",
  };
}

function buildReplayResultInputs(options: {
  readonly run: ForecastReplayRunRecord;
  readonly forecastResult: ForecastCalculationResult;
  readonly ruleVersion: string;
}): readonly ForecastReplayResultInput[] {
  return options.forecastResult.dailySummaries.map((dailySummary) => {
    const breakdown = options.forecastResult.targetDailyBreakdown.find(
      (candidate) => candidate.date === dailySummary.date,
    );
    const bestWindow =
      dailySummary.bestShootableWindow ??
      options.forecastResult.bestWindows.find((window) => window.date === dailySummary.date);

    return {
      replayRunId: options.run.id,
      spotId: options.run.spotId,
      locationKey: options.run.locationKey,
      target: options.run.target,
      forecastDate: dailySummary.date,
      overallScore: dailySummary.score,
      recommendationLabel: dailySummary.recommendationLabel,
      dedicatedTripRecommendation: dailySummary.dedicatedTripRecommendation ?? null,
      nearbyObservationRecommendation: dailySummary.nearbyObservationRecommendation ?? null,
      bestWindowStart: bestWindow?.startTime ?? null,
      bestWindowEnd: bestWindow?.endTime ?? null,
      bestSubject: bestWindow?.subjectPriorityLabel ?? bestWindow?.label ?? null,
      cloudSeaFormationScore:
        breakdown?.cloudSeaFormation?.score ??
        options.forecastResult.cloudSeaAnalysis.formationScore ??
        null,
      cloudSeaShootableScore:
        breakdown?.cloudSeaShootable?.score ??
        options.forecastResult.cloudSeaAnalysis.shootableScore ??
        null,
      whiteoutRiskScore:
        breakdown?.whiteoutRisk?.score ??
        options.forecastResult.cloudSeaAnalysis.whiteoutRiskScore ??
        null,
      sunriseGlowScore:
        breakdown?.sunriseGlow?.score ?? options.forecastResult.scores.sunriseGlow.score,
      sunsetGlowScore:
        breakdown?.sunsetGlow?.score ?? options.forecastResult.scores.sunsetGlow.score,
      astroPracticalScore:
        breakdown?.stars?.score ?? options.forecastResult.astroAnalysis.astroPracticalScore,
      milkyWayPracticalScore:
        breakdown?.milkyWay?.score ?? options.forecastResult.astroAnalysis.milkyWayScore,
      precipitationRiskLevel: dailySummary.weather?.precipitationRisk?.rainRiskLevel ?? null,
      transparencyGrade: dailySummary.weather?.transparencyGrade ?? null,
      confidenceLabel: confidenceLabelForResult(options.forecastResult),
      predictedJson: toJsonValue({
        ruleVersion: options.ruleVersion,
        recommendationLevel: options.forecastResult.recommendationLevel,
        dailySummary,
        bestWindow,
        scores: options.forecastResult.scores,
      }),
    };
  });
}

function confidenceLabelForResult(result: ForecastCalculationResult): string {
  if (result.weatherMissingFields.length >= 5) {
    return "low";
  }
  if (result.weatherMissingFields.length > 0) {
    return "medium";
  }
  return result.weatherFusionSummary?.confidenceLevel ?? "high";
}

function buildHistoricalForecastRange(
  startDate: string,
  endDate: string,
  timezone: string,
): ForecastDateRange {
  const targetDates = listDateRange(startDate, endDate);
  return {
    forecastStart: `${startDate}T00:00:00+08:00`,
    forecastEnd: `${addDays(endDate, 1)}T00:00:00+08:00`,
    targetDates,
    horizonHours: targetDates.length * 24,
    timezone,
  };
}

function listDateRange(startDate: string, endDate: string): readonly string[] {
  const dates: string[] = [];
  let cursor = parseDate(startDate);
  const end = parseDate(endDate);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1),
    );
  }

  return dates;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function collectMissingFields(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  dailyWeather: readonly NormalizedDailyWeather[],
): readonly string[] {
  return unique([
    ...hourlyWeather.flatMap((hour) => hour.missingFields ?? []),
    ...dailyWeather.flatMap((day) => day.missingFields ?? []),
  ]);
}

function collectEstimatedFields(
  hourlyWeather: readonly NormalizedHourlyWeather[],
  dailyWeather: readonly NormalizedDailyWeather[],
): readonly string[] {
  return unique([
    ...hourlyWeather.flatMap((hour) => hour.estimatedFields ?? []),
    ...dailyWeather.flatMap((day) => day.estimatedFields ?? []),
  ]);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function collectDailyMissingFields(input: {
  readonly precipitationProbability: number | null | undefined;
  readonly cloudLow: number | null | undefined;
  readonly cloudMid: number | null | undefined;
  readonly cloudHigh: number | null | undefined;
  readonly visibility: number | null | undefined;
}): readonly string[] | undefined {
  const fields = [
    input.precipitationProbability === null || input.precipitationProbability === undefined
      ? "precipitationProbability"
      : null,
    input.cloudLow === null || input.cloudLow === undefined ? "cloudLow" : null,
    input.cloudMid === null || input.cloudMid === undefined ? "cloudMid" : null,
    input.cloudHigh === null || input.cloudHigh === undefined ? "cloudHigh" : null,
    input.visibility === null || input.visibility === undefined ? "visibility" : null,
  ].filter((field): field is string => field !== null);

  return fields.length > 0 ? fields : undefined;
}

function inferPrecipitationType(
  sample: Pick<HistoricalWeatherSampleRecord, "rainAmount" | "snowAmount" | "precipitationAmount">,
): "none" | "rain" | "snow" | "mixed" {
  return inferDailyPrecipitationType({
    rainAmount: sample.rainAmount,
    snowAmount: sample.snowAmount,
    precipitationAmount: sample.precipitationAmount,
  });
}

function inferDailyPrecipitationType(input: {
  readonly rainAmount: number | null | undefined;
  readonly snowAmount: number | null | undefined;
  readonly precipitationAmount: number;
}): "none" | "rain" | "snow" | "mixed" {
  const rain = input.rainAmount ?? 0;
  const snow = input.snowAmount ?? 0;
  if (rain > 0 && snow > 0) {
    return "mixed";
  }
  if (snow > 0) {
    return "snow";
  }
  if (rain > 0 || input.precipitationAmount > 0) {
    return "rain";
  }
  return "none";
}

function average(values: readonly number[]): number {
  return round1(
    values.reduce((sumValue, value) => sumValue + value, 0) / Math.max(1, values.length),
  );
}

function averageOptional(values: readonly (number | null)[]): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");
  return usable.length > 0 ? average(usable) : null;
}

function sum(values: readonly number[]): number {
  return round1(values.reduce((sumValue, value) => sumValue + value, 0));
}

function sumOptional(values: readonly (number | null)[]): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");
  return usable.length > 0 ? sum(usable) : null;
}

function min(values: readonly number[]): number {
  return round1(Math.min(...values));
}

function max(values: readonly number[]): number {
  return round1(Math.max(...values));
}

function maxOptional(values: readonly (number | null)[]): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");
  return usable.length > 0 ? max(usable) : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function toJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
