import { pathToFileURL } from "node:url";
import {
  resolvePublicSkyDarknessDisplay,
  type EstimatedBortleRange,
  type LightPollutionInfo,
  type SkyBrightnessInfo,
} from "@photo-weather/shared";
import { estimateBortleRangeForLightPollution } from "@photo-weather/scoring";
import {
  AstroServiceClient,
  type AstroServiceLightPollutionQueryInput,
  type AstroServiceSkyBrightnessQueryInput,
} from "../astro-service-client.js";

const defaultAstroServiceUrl = "http://127.0.0.1:4100";
const defaultTimeoutMs = 15_000;

export type SkyDarknessDiagnosticOptions = {
  readonly coordinate: {
    readonly latitudeWgs84: number;
    readonly longitudeWgs84: number;
  };
  readonly label?: string;
  readonly azimuthDegrees?: number;
  readonly json: boolean;
  readonly astroServiceUrl: string;
  readonly timeoutMs: number;
};

export type SkyDarknessDiagnosticClient = {
  queryLightPollution(input: AstroServiceLightPollutionQueryInput): Promise<LightPollutionInfo>;
  querySkyBrightness?(
    input: AstroServiceSkyBrightnessQueryInput,
  ): Promise<SkyBrightnessInfo | null | undefined>;
};

export type SkyDarknessDiagnosticReport = {
  readonly run: {
    readonly timestamp: string;
    readonly toolVersion: "sky-darkness-diagnostic-v1";
    readonly localDatasetOnly: true;
    readonly externalNetworkCalls: false;
    readonly astroServiceUrl: string;
  };
  readonly coordinate: {
    readonly latitudeWgs84: number;
    readonly longitudeWgs84: number;
    readonly label?: string;
  };
  readonly wa: {
    readonly available: boolean;
    readonly dataAvailable: boolean;
    readonly rawValue: number | null;
    readonly valueType: SkyBrightnessInfo["valueType"] | null;
    readonly valueUnit: string | null;
    readonly artificialBrightness: number | null;
    readonly naturalSkyBrightnessMcdM2: number | null;
    readonly modeledTotalSkyBrightnessMcdM2: number | null;
    readonly modeledSqm: number | null;
    readonly estimatedBortleRange: SkyBrightnessInfo["estimatedBortleRange"] | null;
    readonly datasetName: string | null;
    readonly datasetYear: number | null;
    readonly datasetVersion: string | null;
    readonly checksumShort: string | null;
    readonly conversionNotes: readonly string[];
    readonly uncertaintyNotes: readonly string[];
    readonly queryFailure: string | null;
  };
  readonly viirs: {
    readonly available: boolean;
    readonly dataAvailable: boolean;
    readonly localRadiance: number | null;
    readonly surroundingHaloRadiance: number | null;
    readonly ambientRiskIndex: number | null;
    readonly ambientRiskLevel: string;
    readonly rawBortleEstimate: EstimatedBortleRange;
    readonly datasetYear: number | null;
    readonly datasetVersion: string | null;
    readonly checksumShort: string | null;
    readonly validSampleCount: number;
    readonly sampleCount: number;
  };
  readonly nationalQuantileContext: {
    readonly positiveRadianceQuantile: number | null;
    readonly localRadianceQuantile: number | null;
    readonly haloRadianceQuantile: number | null;
    readonly ambientRiskQuantile: number | null;
    readonly nationalRiskIndex: number | null;
  };
  readonly ratios: {
    readonly localToHaloRatio: number | null;
    readonly haloToLocalRatio: number | null;
    readonly localToHaloRatioQuantile: number | null;
    readonly haloToLocalRatioQuantile: number | null;
  };
  readonly directionalRisk: {
    readonly azimuthDegrees: number | null;
    readonly targetDirectionRisk: number | null;
    readonly targetDirectionLevel: string | null;
    readonly targetDirectionLevelLabelZh: string | null;
    readonly directionalRisk: LightPollutionInfo["directionalRisk"];
  };
  readonly fusedPublicBortleRange: {
    readonly available: boolean;
    readonly minClass?: number;
    readonly maxClass?: number;
    readonly rangeLabelZh: string;
    readonly rangeWidthClasses: number | null;
    readonly rangeWidthPolicy: string;
    readonly tooWideRange: boolean;
  };
  readonly publicLabel: string;
  readonly confidence: string;
  readonly uncertaintyReasons: readonly string[];
  readonly diagnostics: readonly string[];
  readonly datasets: {
    readonly waDatasetYear: number | null;
    readonly waDatasetVersion: string | null;
    readonly viirsDatasetYear: number | null;
    readonly viirsDatasetVersion: string | null;
  };
};

export function parseSkyDarknessDiagnosticArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): SkyDarknessDiagnosticOptions {
  const values = new Map<string, string>();
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      throw new Error(usageText());
    }
    if (!arg.startsWith("--")) {
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
    values.set(rawName, value);
  }

  const coordinate = parseCoordinate(values.get("coordinate"));
  const azimuthDegrees =
    values.has("azimuth") ? readBoundedNumber(values.get("azimuth"), 0, 360, "azimuth") : undefined;

  return {
    coordinate,
    label: values.get("label"),
    azimuthDegrees,
    json,
    astroServiceUrl:
      values.get("astro-service-url") ??
      env.SKY_DARKNESS_ASTRO_SERVICE_URL ??
      env.ASTRO_SERVICE_URL ??
      defaultAstroServiceUrl,
    timeoutMs: readPositiveInteger(values.get("timeout-ms"), defaultTimeoutMs, "timeout-ms"),
  };
}

export async function runSkyDarknessDiagnosticCli(
  argv: readonly string[],
  output: (text: string) => void = console.log,
  errorOutput: (text: string) => void = console.error,
  dependencies: {
    readonly client?: SkyDarknessDiagnosticClient;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: () => Date;
  } = {},
): Promise<number> {
  try {
    const options = parseSkyDarknessDiagnosticArgs(argv, dependencies.env ?? process.env);
    const client =
      dependencies.client ??
      new AstroServiceClient({
        baseUrl: options.astroServiceUrl,
        timeoutMs: options.timeoutMs,
      });
    const report = await buildSkyDarknessDiagnosticReport(options, client, {
      now: dependencies.now,
    });
    output(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatSkyDarknessDiagnosticText(report));
    return 0;
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : "Sky-darkness diagnostic failed.");
    return 1;
  }
}

export async function buildSkyDarknessDiagnosticReport(
  options: SkyDarknessDiagnosticOptions,
  client: SkyDarknessDiagnosticClient,
  dependencies: { readonly now?: () => Date } = {},
): Promise<SkyDarknessDiagnosticReport> {
  const queryInput: AstroServiceLightPollutionQueryInput = {
    latitudeWgs84: options.coordinate.latitudeWgs84,
    longitudeWgs84: options.coordinate.longitudeWgs84,
    targetAzimuthDegrees: options.azimuthDegrees ?? null,
  };
  const lightPollution = await client.queryLightPollution(queryInput);
  let skyBrightness: SkyBrightnessInfo | null = null;
  let skyBrightnessFailure: string | null = null;
  if (client.querySkyBrightness) {
    try {
      skyBrightness =
        (await client.querySkyBrightness({
          latitudeWgs84: options.coordinate.latitudeWgs84,
          longitudeWgs84: options.coordinate.longitudeWgs84,
        })) ?? null;
    } catch (error) {
      skyBrightnessFailure = error instanceof Error ? error.message : String(error);
    }
  }

  const rawBortleEstimate = estimateBortleRangeForLightPollution(lightPollution);
  const fusedLightPollution: LightPollutionInfo = {
    ...lightPollution,
    estimatedBortleRange: rawBortleEstimate,
    skyBrightness: skyBrightness ?? lightPollution.skyBrightness ?? null,
  };
  const publicDisplay = resolvePublicSkyDarknessDisplay(fusedLightPollution);
  const wa = fusedLightPollution.skyBrightness ?? null;

  return {
    run: {
      timestamp: (dependencies.now ?? (() => new Date()))().toISOString(),
      toolVersion: "sky-darkness-diagnostic-v1",
      localDatasetOnly: true,
      externalNetworkCalls: false,
      astroServiceUrl: sanitizeReportUrl(options.astroServiceUrl),
    },
    coordinate: {
      latitudeWgs84: options.coordinate.latitudeWgs84,
      longitudeWgs84: options.coordinate.longitudeWgs84,
      ...(options.label ? { label: options.label } : {}),
    },
    wa: {
      available: wa?.available ?? false,
      dataAvailable: wa?.dataAvailable ?? false,
      rawValue: finiteOrNull(wa?.rawValue),
      valueType: wa?.valueType ?? null,
      valueUnit: wa?.valueUnit ?? null,
      artificialBrightness: finiteOrNull(wa?.artificialBrightness),
      naturalSkyBrightnessMcdM2: finiteOrNull(wa?.naturalSkyBrightnessMcdM2),
      modeledTotalSkyBrightnessMcdM2: finiteOrNull(wa?.modeledTotalSkyBrightnessMcdM2),
      modeledSqm: finiteOrNull(wa?.modeledSqm),
      estimatedBortleRange: wa?.estimatedBortleRange ?? null,
      datasetName: wa?.datasetName ?? null,
      datasetYear: wa?.datasetYear ?? null,
      datasetVersion: wa?.datasetVersion ?? null,
      checksumShort: wa?.checksumShort ?? null,
      conversionNotes: wa?.diagnostics?.conversionNotes ?? [],
      uncertaintyNotes: wa?.diagnostics?.uncertaintyNotes ?? [],
      queryFailure: skyBrightnessFailure,
    },
    viirs: {
      available: lightPollution.available,
      dataAvailable: lightPollution.dataAvailable,
      localRadiance: finiteOrNull(lightPollution.localRadiance),
      surroundingHaloRadiance: finiteOrNull(lightPollution.surroundingHaloRadiance),
      ambientRiskIndex: finiteOrNull(lightPollution.ambientRiskIndex),
      ambientRiskLevel: lightPollution.ambientRiskLevel,
      rawBortleEstimate,
      datasetYear: lightPollution.datasetYear ?? null,
      datasetVersion: lightPollution.datasetVersion ?? null,
      checksumShort: lightPollution.checksumShort ?? null,
      validSampleCount: lightPollution.validSampleCount,
      sampleCount: lightPollution.sampleCount,
    },
    nationalQuantileContext: {
      positiveRadianceQuantile: publicDisplay.positiveRadianceQuantile,
      localRadianceQuantile: publicDisplay.localRadianceQuantile,
      haloRadianceQuantile: publicDisplay.haloRadianceQuantile,
      ambientRiskQuantile: publicDisplay.ambientRiskQuantile,
      nationalRiskIndex: publicDisplay.nationalRiskIndex,
    },
    ratios: {
      localToHaloRatio: publicDisplay.localToHaloRatio,
      haloToLocalRatio: publicDisplay.haloToLocalRatio,
      localToHaloRatioQuantile: publicDisplay.localToHaloRatioQuantile,
      haloToLocalRatioQuantile: publicDisplay.haloToLocalRatioQuantile,
    },
    directionalRisk: {
      azimuthDegrees: options.azimuthDegrees ?? lightPollution.targetAzimuthDegrees ?? null,
      targetDirectionRisk: finiteOrNull(lightPollution.targetDirectionRisk),
      targetDirectionLevel: lightPollution.targetDirectionLevel ?? null,
      targetDirectionLevelLabelZh: lightPollution.targetDirectionLevelLabelZh ?? null,
      directionalRisk: lightPollution.directionalRisk,
    },
    fusedPublicBortleRange: {
      available: publicDisplay.available,
      minClass: publicDisplay.minClass,
      maxClass: publicDisplay.maxClass,
      rangeLabelZh: publicDisplay.rangeLabelZh,
      rangeWidthClasses: publicDisplay.rangeWidthClasses,
      rangeWidthPolicy: publicDisplay.rangeWidthPolicy,
      tooWideRange: publicDisplay.tooWideRange,
    },
    publicLabel: publicDisplay.skyQualityLabelZh,
    confidence: publicDisplay.confidence,
    uncertaintyReasons: publicDisplay.confidenceReasonsZh,
    diagnostics: publicDisplay.diagnostics,
    datasets: {
      waDatasetYear: wa?.datasetYear ?? null,
      waDatasetVersion: wa?.datasetVersion ?? null,
      viirsDatasetYear: lightPollution.datasetYear ?? null,
      viirsDatasetVersion: lightPollution.datasetVersion ?? null,
    },
  };
}

export function formatSkyDarknessDiagnosticText(report: SkyDarknessDiagnosticReport): string {
  return [
    "Sky darkness diagnostic",
    `coordinate: ${report.coordinate.latitudeWgs84},${report.coordinate.longitudeWgs84}${
      report.coordinate.label ? ` (${report.coordinate.label})` : ""
    }`,
    `WA/model: ${report.wa.available ? "available" : "missing"}; raw=${formatNullable(report.wa.rawValue)} ${
      report.wa.valueUnit ?? ""
    }; valueType=${report.wa.valueType ?? "n/a"}; modeledSqm=${formatNullable(report.wa.modeledSqm)}`,
    `WA estimated Bortle: ${report.wa.estimatedBortleRange?.rangeLabelZh ?? "not derived"}`,
    `VIIRS: ${report.viirs.available ? "available" : "missing"}; local=${formatNullable(
      report.viirs.localRadiance,
    )}; halo=${formatNullable(report.viirs.surroundingHaloRadiance)}; ambient=${formatNullable(
      report.viirs.ambientRiskIndex,
    )}`,
    `VIIRS raw Bortle: ${report.viirs.rawBortleEstimate.rangeLabelZh}`,
    `Ratios: local/halo=${formatNullable(report.ratios.localToHaloRatio)}; halo/local=${formatNullable(
      report.ratios.haloToLocalRatio,
    )}`,
    `Fused public range: ${report.fusedPublicBortleRange.rangeLabelZh}; label=${report.publicLabel}; confidence=${report.confidence}`,
    `Range width: ${formatNullable(report.fusedPublicBortleRange.rangeWidthClasses)} classes; policy=${report.fusedPublicBortleRange.rangeWidthPolicy}`,
    `Diagnostics: ${report.diagnostics.length > 0 ? report.diagnostics.join(", ") : "none"}`,
    "No external services were called by this diagnostic; it uses the configured local astro-service datasets.",
  ].join("\n");
}

function parseCoordinate(value: string | undefined): SkyDarknessDiagnosticOptions["coordinate"] {
  if (!value) {
    throw new Error(`Missing required --coordinate\n${usageText()}`);
  }
  const [latText, lonText] = value.split(",", 2).map((part) => part.trim());
  const latitudeWgs84 = readBoundedNumber(latText, -90, 90, "coordinate latitude");
  const longitudeWgs84 = readBoundedNumber(lonText, -180, 180, "coordinate longitude");
  return { latitudeWgs84, longitudeWgs84 };
}

function readBoundedNumber(
  value: string | undefined,
  min: number,
  max: number,
  label: string,
): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return numberValue;
}

function readPositiveInteger(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatNullable(value: number | null | undefined): string {
  return value === null || value === undefined ? "n/a" : String(value);
}

function sanitizeReportUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "<invalid-url>";
  }
}

function usageText(): string {
  return [
    "Usage: pnpm sky-darkness:diagnose -- --coordinate lat,lon [--json] [--azimuth degrees] [--label text]",
    "",
    "Options:",
    "  --coordinate lat,lon       Required WGS84 coordinate.",
    "  --json                     Emit JSON instead of text.",
    "  --azimuth degrees          Optional target direction for directional light-pollution risk.",
    "  --label text               Optional diagnostic label.",
    "  --astro-service-url url    Local astro-service URL. Defaults to ASTRO_SERVICE_URL or http://127.0.0.1:4100.",
    "  --timeout-ms ms            Local request timeout.",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runSkyDarknessDiagnosticCli(process.argv.slice(2));
  process.exit(exitCode);
}
