import { pathToFileURL } from "node:url";
import { disconnectPrismaClient, getPrismaClient, type DatabaseClient } from "@photo-weather/db";
import {
  buildCalibrationLocationKey,
  buildCalibrationHint,
  compareReplayResultWithOutcome,
  computeCalibrationStats,
  deterministicRuleVersion,
  OpenMeteoHistoricalWeatherProvider,
  runHistoricalReplay,
  saveHistoricalWeatherSamples,
  normalizeOpenMeteoHistoricalWeather,
  upsertObservedOutcome,
  type ForecastReplayTarget,
  type HistoricalWeatherFetchInput,
  type HistoricalWeatherProvider,
  type HistoricalWeatherRawResponse,
  type ObservedResult,
} from "@photo-weather/calibration";

type HistoricalCalibrationCliOptions = {
  readonly provider: "open_meteo_historical";
  readonly locationName: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevationMeters?: number | null;
  readonly spotId?: string | null;
  readonly locationKey?: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly timezone: string;
  readonly targets: readonly ForecastReplayTarget[];
  readonly mock: boolean;
};

export type HistoricalCalibrationCliDependencies = {
  readonly dbClient?: DatabaseClient;
  readonly provider?: HistoricalWeatherProvider;
  readonly env?: NodeJS.ProcessEnv;
};

const calibrationTargets = ["general", "cloud_sea", "glow", "astro"] as const;

export function parseHistoricalCalibrationArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): HistoricalCalibrationCliOptions {
  const values = new Map<string, string>();
  const targetValues: string[] = [];
  let mock = readBoolean(env.CALIBRATION_MOCK);

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mock") {
      mock = true;
      continue;
    }
    if (arg === "--no-mock") {
      mock = false;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      throw new Error(usageText());
    }
    if (!arg?.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}\n${usageText()}`);
    }

    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawName) {
      throw new Error(`Unknown argument: ${arg}\n${usageText()}`);
    }
    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${rawName}\n${usageText()}`);
    }
    if (inlineValue === undefined) {
      index += 1;
    }

    if (rawName === "target" || rawName === "targets") {
      targetValues.push(value);
      continue;
    }
    values.set(rawName, value);
  }

  const provider =
    values.get("provider") ?? env.CALIBRATION_SOURCE_PROVIDER ?? "open_meteo_historical";
  if (provider !== "open_meteo_historical") {
    throw new Error("Historical Calibration V1 supports only open_meteo_historical.");
  }

  const locationName = values.get("location-name") ?? env.CALIBRATION_LOCATION_NAME ?? "黄山光明顶";
  const latitudeWgs84 = readRequiredNumber(
    values.get("lat") ?? values.get("latitude") ?? env.CALIBRATION_LATITUDE_WGS84 ?? "30.1321",
    "latitude",
  );
  const longitudeWgs84 = readRequiredNumber(
    values.get("lng") ?? values.get("longitude") ?? env.CALIBRATION_LONGITUDE_WGS84 ?? "118.1691",
    "longitude",
  );
  const elevation = values.get("elevation") ?? env.CALIBRATION_ELEVATION_METERS;
  const targets = parseTargets(
    targetValues.length > 0 ? targetValues : [env.CALIBRATION_TARGETS ?? "general"],
  );

  return {
    provider,
    locationName,
    latitudeWgs84,
    longitudeWgs84,
    elevationMeters: elevation ? readRequiredNumber(elevation, "elevation") : 1800,
    spotId: values.get("spot-id") ?? env.CALIBRATION_SPOT_ID ?? null,
    locationKey: values.get("location-key") ?? env.CALIBRATION_LOCATION_KEY ?? null,
    startDate: values.get("start-date") ?? env.CALIBRATION_START_DATE ?? "2026-05-01",
    endDate: values.get("end-date") ?? env.CALIBRATION_END_DATE ?? "2026-05-02",
    timezone: values.get("timezone") ?? env.CALIBRATION_TIMEZONE ?? "Asia/Shanghai",
    targets,
    mock,
  };
}

export async function runHistoricalCalibrationCli(
  argv: readonly string[],
  output: (text: string) => void = console.log,
  errorOutput: (text: string) => void = console.error,
  dependencies: HistoricalCalibrationCliDependencies = {},
): Promise<number> {
  let ownsClient = false;
  try {
    const runtimeEnv = dependencies.env ?? process.env;
    const options = parseHistoricalCalibrationArgs(argv, runtimeEnv);
    const dbClient =
      dependencies.dbClient ?? ((await getPrismaClient()) as unknown as DatabaseClient);
    ownsClient = !dependencies.dbClient;
    const provider =
      dependencies.provider ??
      (options.mock
        ? new MockHistoricalWeatherProvider()
        : new OpenMeteoHistoricalWeatherProvider());
    const locationKey =
      options.locationKey ??
      buildCalibrationLocationKey({
        spotId: options.spotId,
        latitudeWgs84: options.latitudeWgs84,
        longitudeWgs84: options.longitudeWgs84,
      });
    const location = {
      spotId: options.spotId,
      locationKey,
      locationName: options.locationName,
      latitudeWgs84: options.latitudeWgs84,
      longitudeWgs84: options.longitudeWgs84,
      elevationMeters: options.elevationMeters,
    };

    output("Historical calibration replay");
    output(`provider: ${options.provider}${options.mock ? " (mocked)" : ""}`);
    output(
      `location: ${location.locationName} ${location.latitudeWgs84},${location.longitudeWgs84}`,
    );
    output(`date range: ${options.startDate} to ${options.endDate}`);
    output("No API keys or secrets will be printed.");

    const raw = await provider.fetchHourlyHistoricalWeather({
      ...location,
      startDate: options.startDate,
      endDate: options.endDate,
      timezone: options.timezone,
    });
    const samples = provider.normalizeHistoricalWeather(raw, {
      ...location,
      startDate: options.startDate,
      endDate: options.endDate,
      timezone: options.timezone,
    });
    const stored = await saveHistoricalWeatherSamples(samples, { client: dbClient });
    output(
      `samples inserted/updated/skipped: ${stored.insertedCount}/${stored.updatedCount}/${stored.skippedCount}`,
    );
    output(`historical sample count: ${samples.length}`);

    for (const target of options.targets) {
      const replay = await runHistoricalReplay(
        {
          ...location,
          startDate: options.startDate,
          endDate: options.endDate,
          target,
          sourceProvider: options.provider,
          ruleVersion: deterministicRuleVersion,
          timezone: options.timezone,
        },
        { client: dbClient },
      );
      output(`target: ${target}`);
      output(`replayRunId=${replay.run.id}`);
      output(`replayResultsCount=${replay.resultCount}`);
      output("daily recommendations:");
      for (const result of replay.results) {
        output(formatReplayResultLine(result));
      }
      const firstResult = replay.results[0];
      if (!firstResult) {
        output("observedOutcomeId=n/a");
        output("matchStatus=unlabeled");
        output("labeledCount=0");
        output("hitRate=0");
        output("falsePositiveRate=0");
        output("falseNegativeRate=0");
        output("calibrationHint=历史样本较少，当前仍以实时判断为主。");
        continue;
      }

      const outcome = await upsertObservedOutcome(
        {
          ...location,
          target,
          outcomeDate: firstResult.forecastDate.toISOString().slice(0, 10),
          observedResult: readObservedResult(runtimeEnv.CALIBRATION_OBSERVED_RESULT),
          cloudSeaLevel: "unknown",
          whiteoutLevel: "unknown",
          sunriseGlowLevel: "unknown",
          sunsetGlowLevel: "unknown",
          astroVisibilityLevel: "unknown",
          milkyWayVisibilityLevel: "unknown",
          transparencyLevel: "unknown",
          rainImpactLevel: "unknown",
          notes: "服务器历史校准 smoke test 创建的人工标注样例，请按真实观测覆盖。",
          source: "admin_manual",
        },
        { client: dbClient },
      );
      const comparison = compareReplayResultWithOutcome(firstResult, outcome);
      const stats = await computeCalibrationStats({
        client: dbClient,
        locationKey,
        locationName: location.locationName,
        spotId: location.spotId,
        target,
        ruleVersion: deterministicRuleVersion,
      });
      const hint = buildCalibrationHint(stats);

      output(`observedOutcomeId=${outcome.id}`);
      output(`matchStatus=${comparison.matchStatus}`);
      output(`labeledCount=${stats.labeledCount}`);
      output(`hitRate=${stats.hitRate}`);
      output(`falsePositiveRate=${stats.falsePositiveRate}`);
      output(`falseNegativeRate=${stats.falseNegativeRate}`);
      output(`calibrationHint=${hint?.displayNoteZh ?? "历史样本较少，当前仍以实时判断为主。"}`);
    }

    return 0;
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : "Historical calibration command failed.");
    return 1;
  } finally {
    if (ownsClient) {
      await disconnectPrismaClient();
    }
  }
}

class MockHistoricalWeatherProvider implements HistoricalWeatherProvider {
  async fetchHourlyHistoricalWeather(
    input: HistoricalWeatherFetchInput,
  ): Promise<HistoricalWeatherRawResponse> {
    return {
      sourceProvider: "open_meteo_historical",
      requestedUrl: "mock://open-meteo-historical",
      response: buildMockOpenMeteoArchiveResponse(input),
    };
  }

  normalizeHistoricalWeather(
    response: HistoricalWeatherRawResponse | unknown,
    input: HistoricalWeatherFetchInput,
  ) {
    const raw =
      typeof response === "object" && response !== null && "response" in response
        ? (response as HistoricalWeatherRawResponse).response
        : response;
    return normalizeOpenMeteoHistoricalWeather(raw, input);
  }
}

function buildMockOpenMeteoArchiveResponse(input: HistoricalWeatherFetchInput) {
  const hours = listHourlyTimes(input.startDate, input.endDate);
  return {
    timezone: input.timezone ?? "Asia/Shanghai",
    utc_offset_seconds: 28800,
    elevation: input.elevationMeters ?? null,
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, index) => 11 + (index % 8) * 0.7),
      relative_humidity_2m: hours.map((_, index) => (index % 24 < 8 ? 88 : 70)),
      dew_point_2m: hours.map(() => 8),
      precipitation: hours.map((_, index) => (index % 24 === 14 ? 0.4 : 0)),
      rain: hours.map((_, index) => (index % 24 === 14 ? 0.4 : 0)),
      snowfall: hours.map(() => 0),
      cloud_cover: hours.map((_, index) => (index % 24 < 8 ? 68 : 42)),
      cloud_cover_low: hours.map((_, index) => (index % 24 < 8 ? 50 : 24)),
      cloud_cover_mid: hours.map(() => 35),
      cloud_cover_high: hours.map(() => 45),
      visibility: hours.map(() => 18000),
      wind_speed_10m: hours.map(() => 3),
      wind_gusts_10m: hours.map(() => 6),
      wind_direction_10m: hours.map(() => 120),
      pressure_msl: hours.map(() => 810),
      weather_code: hours.map(() => 3),
    },
  };
}

function listHourlyTimes(startDate: string, endDate: string): readonly string[] {
  const times: string[] = [];
  let cursor = parseDate(startDate);
  const end = parseDate(endDate);

  while (cursor.getTime() <= end.getTime()) {
    const date = cursor.toISOString().slice(0, 10);
    for (let hour = 0; hour < 24; hour += 1) {
      times.push(`${date}T${String(hour).padStart(2, "0")}:00`);
    }
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1),
    );
  }

  return times;
}

function parseTargets(values: readonly string[]): readonly ForecastReplayTarget[] {
  const parsed = values
    .flatMap((value) => value.split(/[,\s]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const uniqueTargets = [...new Set(parsed)];

  if (uniqueTargets.length === 0) {
    return ["general"];
  }

  return uniqueTargets.map((target) => {
    if (!calibrationTargets.includes(target as ForecastReplayTarget)) {
      throw new Error(`Unsupported target: ${target}`);
    }
    return target as ForecastReplayTarget;
  });
}

function readRequiredNumber(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

function readBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function readObservedResult(value: string | undefined): ObservedResult {
  if (value === "success" || value === "partial" || value === "fail" || value === "unknown") {
    return value;
  }
  return "partial";
}

function parseDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

function formatReplayResultLine(result: {
  readonly forecastDate: Date;
  readonly overallScore: number | null;
  readonly recommendationLabel: string | null;
  readonly bestWindowStart: Date | null;
  readonly bestWindowEnd: Date | null;
}): string {
  const score =
    typeof result.overallScore === "number" ? String(Math.round(result.overallScore)) : "n/a";
  const window =
    result.bestWindowStart && result.bestWindowEnd
      ? `${result.bestWindowStart.toISOString().slice(11, 16)}-${result.bestWindowEnd
          .toISOString()
          .slice(11, 16)}`
      : "none";
  return `- ${result.forecastDate.toISOString().slice(0, 10)} score=${score} label=${
    result.recommendationLabel ?? "n/a"
  } window=${window}`;
}

function usageText(): string {
  return [
    "Usage: pnpm calibration:test -- --start-date 2026-05-01 --end-date 2026-05-02",
    "       pnpm calibration:test -- --mock --target general",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runHistoricalCalibrationCli(process.argv.slice(2));
  process.exit(exitCode);
}
