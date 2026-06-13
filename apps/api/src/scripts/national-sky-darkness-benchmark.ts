import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolvePublicSkyDarknessDisplay, type LightPollutionInfo } from "@photo-weather/shared";
import { estimateBortleRangeForLightPollution } from "@photo-weather/scoring";
import {
  AstroServiceClient,
  AstroServiceClientError,
  type AstroServiceLightPollutionQueryInput,
} from "../astro-service-client.js";
import {
  compareBortleRanges,
  parseBortleCalibrationArgs,
  parseBortleReferenceContent,
  validateBortleReferenceRows,
  type BortleCalibrationCliOptions,
  type BortleCalibrationInvalidRow,
  type BortleCalibrationQueryClient,
  type BortleCalibrationReference,
  type BortleCalibrationReferencePoint,
  type BortleRangeComparison,
} from "./bortle-calibration.js";

type QueryFailure = {
  readonly kind: "timeout" | "http" | "invalid_response" | "unavailable" | "unknown";
  readonly message: string;
  readonly status?: number;
  readonly timedOut?: boolean;
};

type QueryResult =
  | {
      readonly success: true;
      readonly lightPollution: LightPollutionInfo;
      readonly retries: number;
    }
  | {
      readonly success: false;
      readonly failure: QueryFailure;
      readonly retries: number;
    };

export type NationalSkyDarknessBenchmarkPoint = {
  readonly rowNumber: number;
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly reference?: BortleCalibrationReference;
  readonly referenceBortleMin?: number;
  readonly referenceBortleMax?: number;
  readonly querySuccess: boolean;
  readonly queryRetries: number;
  readonly queryFailure?: QueryFailure;
  readonly rawEstimatedBortleRangeLabel?: string;
  readonly publicBortleMin?: number;
  readonly publicBortleMax?: number;
  readonly publicBortleRangeLabel?: string;
  readonly publicSkyQualityLabel?: string;
  readonly publicConfidence?: string;
  readonly publicModelVersion?: string;
  readonly nationalStatsVersion?: string;
  readonly localRadiance?: number | null;
  readonly surroundingHaloRadiance?: number | null;
  readonly ambientRiskIndex?: number | null;
  readonly validSampleCount?: number;
  readonly localToHaloRatio?: number | null;
  readonly haloToLocalRatio?: number | null;
  readonly localRadianceQuantile?: number | null;
  readonly haloRadianceQuantile?: number | null;
  readonly nationalRiskIndex?: number | null;
  readonly skyBrightnessAvailable?: boolean;
  readonly skyBrightnessValueType?: string | null;
  readonly skyBrightnessModeledSqm?: number | null;
  readonly skyBrightnessEstimatedBortleRangeLabel?: string | null;
  readonly skyBrightnessDatasetYear?: number | null;
  readonly skyBrightnessDatasetVersion?: string | null;
  readonly lowRadianceSaturationRisk?: boolean;
  readonly urbanSkyglowSpilloverRisk?: boolean;
  readonly darkZoneSaturationRisk?: boolean;
  readonly rangeComparison?: BortleRangeComparison;
  readonly overOptimisticError?: boolean;
  readonly overConservativeError?: boolean;
  readonly classDistance?: number;
  readonly diagnostics: readonly string[];
};

export type NationalSkyDarknessBenchmarkSummary = {
  readonly benchmarkCount: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly querySuccesses: number;
  readonly queryFailures: number;
  readonly comparedReferencePoints: number;
  readonly exactMatches: number;
  readonly overlapMatches: number;
  readonly adjacentMatches: number;
  readonly overOptimisticErrors: number;
  readonly overConservativeErrors: number;
  readonly errorsGreaterThanOneClass: number;
  readonly meanClassDistance: number | null;
  readonly medianClassDistance: number | null;
  readonly categoryDistributionAuditOnly: Readonly<Record<string, number>>;
  readonly mismatchList: readonly string[];
  readonly finalQaRecommendation:
    | "pass"
    | "warn_collect_more_references"
    | "warn_investigate_mismatches"
    | "fail_investigate_over_optimism";
};

export type NationalSkyDarknessBenchmarkReport = {
  readonly run: {
    readonly timestamp: string;
    readonly toolVersion: "national-sky-darkness-benchmark-v1";
    readonly auditOnly: true;
    readonly productionRulesGenerated: false;
    readonly astroServiceUrl: string;
    readonly strict: boolean;
    readonly redactedNames: boolean;
    readonly benchmarkSourcePolicy: string;
  };
  readonly summary: NationalSkyDarknessBenchmarkSummary;
  readonly invalidRows: readonly BortleCalibrationInvalidRow[];
  readonly points: readonly NationalSkyDarknessBenchmarkPoint[];
};

type BuildBenchmarkOptions = {
  readonly options: BortleCalibrationCliOptions;
  readonly rows: readonly BortleCalibrationReferencePoint[];
  readonly invalidRows: readonly BortleCalibrationInvalidRow[];
  readonly totalInputRows: number;
  readonly client: BortleCalibrationQueryClient;
  readonly timestamp: string;
};

const maxRetryCount = 2;

export async function runNationalSkyDarknessBenchmarkCli(
  argv: readonly string[],
  output: (text: string) => void = console.log,
  errorOutput: (text: string) => void = console.error,
  dependencies: {
    readonly client?: BortleCalibrationQueryClient;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: () => Date;
    readonly cwd?: string;
  } = {},
): Promise<number> {
  try {
    const runtimeEnv = dependencies.env ?? process.env;
    const cwd = dependencies.cwd ?? process.cwd();
    const workspaceRoot = findWorkspaceRoot(cwd) ?? cwd;
    const options = parseBortleCalibrationArgs(argv, runtimeEnv);
    const inputPath = resolveCliPath(options.inputPath, workspaceRoot);
    const rawRows = parseBortleReferenceContent(await readFile(inputPath, "utf8"), inputPath);
    const validation = validateBortleReferenceRows(rawRows);

    if (options.strict && validation.invalidRows.length > 0) {
      errorOutput("Strict mode failed because the benchmark file contains invalid rows.");
      for (const invalidRow of validation.invalidRows) {
        errorOutput(`invalid row ${invalidRow.rowNumber}: ${invalidRow.errors.join("; ")}`);
      }
      return 1;
    }

    if (options.dryRun) {
      output("National sky darkness benchmark dry run");
      output(`input rows: ${validation.totalInputRows}`);
      output(`valid rows: ${validation.validRows.length}`);
      output(`invalid rows: ${validation.invalidRows.length}`);
      output("No astro-service queries were sent and no benchmark report was generated.");
      return options.strict && validation.invalidRows.length > 0 ? 1 : 0;
    }

    const client =
      dependencies.client ??
      new AstroServiceClient({
        baseUrl: options.astroServiceUrl,
        timeoutMs: options.timeoutMs,
      });
    const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
    const report = await buildNationalSkyDarknessBenchmarkReport({
      options,
      rows: validation.validRows,
      invalidRows: validation.invalidRows,
      totalInputRows: validation.totalInputRows,
      client,
      timestamp,
    });
    const writtenFiles = await writeNationalSkyDarknessBenchmarkReports(
      report,
      options,
      workspaceRoot,
    );

    output("National sky darkness benchmark complete");
    output(`benchmarks compared: ${report.summary.comparedReferencePoints}`);
    output(`over-optimistic errors: ${report.summary.overOptimisticErrors}`);
    output(`over-conservative errors: ${report.summary.overConservativeErrors}`);
    output(`QA recommendation: ${report.summary.finalQaRecommendation}`);
    for (const file of writtenFiles) {
      output(`wrote: ${file}`);
    }

    return options.failOnQueryError && report.summary.queryFailures > 0 ? 1 : 0;
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : "National sky darkness benchmark failed.");
    return 1;
  }
}

export async function buildNationalSkyDarknessBenchmarkReport({
  options,
  rows,
  invalidRows,
  totalInputRows,
  client,
  timestamp,
}: BuildBenchmarkOptions): Promise<NationalSkyDarknessBenchmarkReport> {
  const queryResults = await queryReferenceRows(rows, client, options);
  const points = rows.map((row, index) =>
    buildBenchmarkPoint(row, queryResults[index]!, {
      redactNames: options.redactNames,
    }),
  );
  return {
    run: {
      timestamp,
      toolVersion: "national-sky-darkness-benchmark-v1",
      auditOnly: true,
      productionRulesGenerated: false,
      astroServiceUrl: sanitizeReportUrl(options.astroServiceUrl),
      strict: options.strict,
      redactedNames: options.redactNames,
      benchmarkSourcePolicy:
        "References are competitorBenchmark / thirdPartyReference / notGroundTruth QA inputs only and never generate production place, coordinate, or category rules.",
    },
    summary: summarizeBenchmark(totalInputRows, invalidRows, points),
    invalidRows,
    points,
  };
}

export function formatNationalSkyDarknessBenchmarkMarkdown(
  report: NationalSkyDarknessBenchmarkReport,
): string {
  const summary = report.summary;
  return [
    "# National Sky Darkness Benchmark",
    "",
    "## Run",
    "",
    `- Run timestamp: ${report.run.timestamp}`,
    `- Tool version: ${report.run.toolVersion}`,
    `- Audit only: ${report.run.auditOnly}`,
    `- Production rules generated: ${report.run.productionRulesGenerated}`,
    `- Benchmark policy: ${report.run.benchmarkSourcePolicy}`,
    "",
    "## Summary",
    "",
    `- Benchmark count: ${summary.benchmarkCount}`,
    `- Compared reference points: ${summary.comparedReferencePoints}`,
    `- Exact matches: ${summary.exactMatches}`,
    `- Overlap matches: ${summary.overlapMatches}`,
    `- Adjacent matches: ${summary.adjacentMatches}`,
    `- Over-optimistic errors: ${summary.overOptimisticErrors}`,
    `- Over-conservative errors: ${summary.overConservativeErrors}`,
    `- Errors greater than one class: ${summary.errorsGreaterThanOneClass}`,
    `- Mean class distance: ${formatNullableNumber(summary.meanClassDistance)}`,
    `- Median class distance: ${formatNullableNumber(summary.medianClassDistance)}`,
    `- Final QA recommendation: ${summary.finalQaRecommendation}`,
    "",
    "## Category Distribution (Audit Only)",
    "",
    formatDistribution(summary.categoryDistributionAuditOnly),
    "",
    "## Mismatches",
    "",
    summary.mismatchList.length > 0
      ? summary.mismatchList.map((id) => `- ${id}`).join("\n")
      : "- none",
    "",
    "This command is QA-only. It does not write thresholds, location rules, coordinate rules, or category-specific production mappings.",
  ].join("\n");
}

export function formatNationalSkyDarknessBenchmarkCsv(
  report: NationalSkyDarknessBenchmarkReport,
): string {
  const headers = [
    "id",
    "name",
    "category",
    "referenceBortleMin",
    "referenceBortleMax",
    "publicBortleMin",
    "publicBortleMax",
    "publicBortleRangeLabel",
    "rawEstimatedBortleRangeLabel",
    "rangeOverlap",
    "classDistance",
    "overOptimisticError",
    "overConservativeError",
    "localRadiance",
    "surroundingHaloRadiance",
    "ambientRiskIndex",
    "localRadianceQuantile",
    "haloRadianceQuantile",
    "nationalRiskIndex",
    "skyBrightnessAvailable",
    "skyBrightnessValueType",
    "skyBrightnessModeledSqm",
    "skyBrightnessEstimatedBortleRangeLabel",
    "skyBrightnessDatasetYear",
    "skyBrightnessDatasetVersion",
    "publicModelVersion",
    "nationalStatsVersion",
    "diagnostics",
  ];
  const rows = report.points.map((point) =>
    [
      point.id,
      point.name,
      point.category ?? "",
      point.referenceBortleMin ?? "",
      point.referenceBortleMax ?? "",
      point.publicBortleMin ?? "",
      point.publicBortleMax ?? "",
      point.publicBortleRangeLabel ?? "",
      point.rawEstimatedBortleRangeLabel ?? "",
      point.rangeComparison?.rangeOverlap ?? "",
      point.rangeComparison?.classDistance ?? "",
      point.overOptimisticError ?? "",
      point.overConservativeError ?? "",
      point.localRadiance ?? "",
      point.surroundingHaloRadiance ?? "",
      point.ambientRiskIndex ?? "",
      point.localRadianceQuantile ?? "",
      point.haloRadianceQuantile ?? "",
      point.nationalRiskIndex ?? "",
      point.skyBrightnessAvailable ?? "",
      point.skyBrightnessValueType ?? "",
      point.skyBrightnessModeledSqm ?? "",
      point.skyBrightnessEstimatedBortleRangeLabel ?? "",
      point.skyBrightnessDatasetYear ?? "",
      point.skyBrightnessDatasetVersion ?? "",
      point.publicModelVersion ?? "",
      point.nationalStatsVersion ?? "",
      point.diagnostics.join(";"),
    ].map(csvCell),
  );
  return [headers.map(csvCell).join(","), ...rows.map((row) => row.join(","))].join("\n");
}

async function queryReferenceRows(
  rows: readonly BortleCalibrationReferencePoint[],
  client: BortleCalibrationQueryClient,
  options: BortleCalibrationCliOptions,
): Promise<readonly QueryResult[]> {
  const results: QueryResult[] = new Array(rows.length);
  let nextIndex = 0;
  const workerCount = Math.min(options.concurrency, rows.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < rows.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await queryReferenceRow(rows[index]!, client);
      }
    }),
  );
  return results;
}

async function queryReferenceRow(
  row: BortleCalibrationReferencePoint,
  client: BortleCalibrationQueryClient,
): Promise<QueryResult> {
  let retries = 0;
  for (let attempt = 0; attempt <= maxRetryCount; attempt += 1) {
    try {
      const input: AstroServiceLightPollutionQueryInput = {
        latitudeWgs84: row.latitudeWgs84,
        longitudeWgs84: row.longitudeWgs84,
      };
      const lightPollution = await client.queryLightPollution(input);
      const querySkyBrightness = (
        client as BortleCalibrationQueryClient & {
          querySkyBrightness?: (query: {
            readonly latitudeWgs84: number;
            readonly longitudeWgs84: number;
          }) => Promise<LightPollutionInfo["skyBrightness"]>;
        }
      ).querySkyBrightness;
      const skyBrightness = querySkyBrightness
        ? await querySkyBrightness({
            latitudeWgs84: row.latitudeWgs84,
            longitudeWgs84: row.longitudeWgs84,
          }).catch(() => null)
        : null;
      return {
        success: true,
        lightPollution: skyBrightness ? { ...lightPollution, skyBrightness } : lightPollution,
        retries,
      };
    } catch (error) {
      const failure = normalizeQueryFailure(error);
      if (attempt < maxRetryCount && isRetryableFailure(failure)) {
        retries += 1;
        continue;
      }
      return { success: false, failure, retries };
    }
  }
  return {
    success: false,
    failure: { kind: "unknown", message: "Query failed after retries." },
    retries,
  };
}

function buildBenchmarkPoint(
  row: BortleCalibrationReferencePoint,
  queryResult: QueryResult,
  outputOptions: { readonly redactNames: boolean },
): NationalSkyDarknessBenchmarkPoint {
  const base = {
    rowNumber: row.rowNumber,
    id: row.id,
    name: outputOptions.redactNames ? row.id : row.name,
    category: row.category,
    reference: row.reference,
    referenceBortleMin: row.reference?.minClass,
    referenceBortleMax: row.reference?.maxClass,
  };
  if (!queryResult.success) {
    return {
      ...base,
      querySuccess: false,
      queryRetries: queryResult.retries,
      queryFailure: queryResult.failure,
      diagnostics: ["query_failed"],
    };
  }

  const lightPollution = queryResult.lightPollution;
  const rawEstimate = estimateBortleRangeForLightPollution(lightPollution);
  const display = resolvePublicSkyDarknessDisplay({
    ...lightPollution,
    estimatedBortleRange: rawEstimate,
  });
  const estimateForComparison = {
    available: display.available,
    minClass: display.minClass,
    maxClass: display.maxClass,
  };
  const rangeComparison = row.reference
    ? compareBortleRanges(estimateForComparison, row.reference)
    : undefined;
  const overOptimisticError = Boolean(rangeComparison?.estimateBelowReference);
  const overConservativeError = Boolean(rangeComparison?.estimateAboveReference);

  return {
    ...base,
    querySuccess: true,
    queryRetries: queryResult.retries,
    rawEstimatedBortleRangeLabel: rawEstimate.rangeLabelZh,
    publicBortleMin: display.minClass,
    publicBortleMax: display.maxClass,
    publicBortleRangeLabel: display.rangeLabelZh,
    publicSkyQualityLabel: display.skyQualityLabelZh,
    publicConfidence: display.confidence,
    publicModelVersion: display.nationalModelVersion,
    nationalStatsVersion: display.nationalStatsVersion,
    localRadiance: lightPollution.localRadiance,
    surroundingHaloRadiance: lightPollution.surroundingHaloRadiance,
    ambientRiskIndex: lightPollution.ambientRiskIndex,
    validSampleCount: lightPollution.validSampleCount,
    localToHaloRatio: display.localToHaloRatio,
    haloToLocalRatio: display.haloToLocalRatio,
    localRadianceQuantile: display.localRadianceQuantile,
    haloRadianceQuantile: display.haloRadianceQuantile,
    nationalRiskIndex: display.nationalRiskIndex,
    skyBrightnessAvailable: lightPollution.skyBrightness?.available ?? false,
    skyBrightnessValueType: lightPollution.skyBrightness?.valueType ?? null,
    skyBrightnessModeledSqm: lightPollution.skyBrightness?.modeledSqm ?? null,
    skyBrightnessEstimatedBortleRangeLabel:
      lightPollution.skyBrightness?.estimatedBortleRange?.rangeLabelZh ?? null,
    skyBrightnessDatasetYear: lightPollution.skyBrightness?.datasetYear ?? null,
    skyBrightnessDatasetVersion: lightPollution.skyBrightness?.datasetVersion ?? null,
    lowRadianceSaturationRisk: display.lowRadianceSaturationRisk,
    urbanSkyglowSpilloverRisk: display.urbanSkyglowSpilloverRisk,
    darkZoneSaturationRisk: display.darkZoneSaturationRisk,
    rangeComparison: rangeComparison ?? undefined,
    overOptimisticError,
    overConservativeError,
    classDistance: rangeComparison?.classDistance,
    diagnostics: [
      ...display.diagnostics,
      ...(overOptimisticError ? ["over_optimistic_public_range"] : []),
      ...(overConservativeError ? ["over_conservative_public_range"] : []),
    ],
  };
}

function summarizeBenchmark(
  totalInputRows: number,
  invalidRows: readonly BortleCalibrationInvalidRow[],
  points: readonly NationalSkyDarknessBenchmarkPoint[],
): NationalSkyDarknessBenchmarkSummary {
  const compared = points.filter((point) => point.rangeComparison);
  const distances = compared.map((point) => point.rangeComparison!.classDistance);
  const overOptimisticErrors = compared.filter((point) => point.overOptimisticError).length;
  const overConservativeErrors = compared.filter((point) => point.overConservativeError).length;
  const errorsGreaterThanOneClass = compared.filter(
    (point) => (point.rangeComparison?.classDistance ?? 0) > 1,
  ).length;
  const mismatchList = compared
    .filter((point) => !point.rangeComparison?.rangeOverlap)
    .map((point) => point.id);
  return {
    benchmarkCount: totalInputRows,
    validRows: points.length,
    invalidRows: invalidRows.length,
    querySuccesses: points.filter((point) => point.querySuccess).length,
    queryFailures: points.filter((point) => !point.querySuccess).length,
    comparedReferencePoints: compared.length,
    exactMatches: compared.filter((point) => point.rangeComparison?.exactRangeMatch).length,
    overlapMatches: compared.filter((point) => point.rangeComparison?.rangeOverlap).length,
    adjacentMatches: compared.filter((point) => point.rangeComparison?.acceptableAdjacentMatch)
      .length,
    overOptimisticErrors,
    overConservativeErrors,
    errorsGreaterThanOneClass,
    meanClassDistance: mean(distances),
    medianClassDistance: median(distances),
    categoryDistributionAuditOnly: distribution(points.map((point) => point.category ?? "n/a")),
    mismatchList,
    finalQaRecommendation: finalQaRecommendation({
      comparedCount: compared.length,
      overOptimisticErrors,
      errorsGreaterThanOneClass,
      mismatchCount: mismatchList.length,
    }),
  };
}

function finalQaRecommendation(input: {
  readonly comparedCount: number;
  readonly overOptimisticErrors: number;
  readonly errorsGreaterThanOneClass: number;
  readonly mismatchCount: number;
}): NationalSkyDarknessBenchmarkSummary["finalQaRecommendation"] {
  if (input.overOptimisticErrors > 0 && input.errorsGreaterThanOneClass > 0) {
    return "fail_investigate_over_optimism";
  }
  if (input.comparedCount < 30) {
    return "warn_collect_more_references";
  }
  if (input.mismatchCount / Math.max(1, input.comparedCount) > 0.25) {
    return "warn_investigate_mismatches";
  }
  return "pass";
}

async function writeNationalSkyDarknessBenchmarkReports(
  report: NationalSkyDarknessBenchmarkReport,
  options: BortleCalibrationCliOptions,
  workspaceRoot: string,
): Promise<readonly string[]> {
  const outputDir = resolveCliPath(options.outputDir, workspaceRoot);
  await mkdir(outputDir, { recursive: true });
  const timestampSlug = report.run.timestamp.replace(/[:.]/g, "-");
  const writtenFiles: string[] = [];
  if (options.formats.includes("json")) {
    const jsonFile = path.join(outputDir, `national-sky-darkness-benchmark-${timestampSlug}.json`);
    await writeFile(jsonFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writtenFiles.push(jsonFile);
  }
  if (options.formats.includes("markdown")) {
    const markdownFile = path.join(outputDir, `national-sky-darkness-benchmark-${timestampSlug}.md`);
    await writeFile(markdownFile, `${formatNationalSkyDarknessBenchmarkMarkdown(report)}\n`, "utf8");
    writtenFiles.push(markdownFile);
  }
  if (options.formats.includes("csv")) {
    const csvFile = path.join(outputDir, `national-sky-darkness-benchmark-${timestampSlug}.csv`);
    await writeFile(csvFile, `${formatNationalSkyDarknessBenchmarkCsv(report)}\n`, "utf8");
    writtenFiles.push(csvFile);
  }
  return writtenFiles;
}

function normalizeQueryFailure(error: unknown): QueryFailure {
  if (error instanceof AstroServiceClientError) {
    return {
      kind:
        error.kind === "timeout"
          ? "timeout"
          : error.kind === "invalid_response"
            ? "invalid_response"
            : error.diagnostics.status
              ? "http"
              : "unavailable",
      message: error.message,
      status: error.diagnostics.status,
      timedOut: error.diagnostics.timedOut,
    };
  }
  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

function isRetryableFailure(failure: QueryFailure): boolean {
  if (failure.kind === "timeout" || failure.timedOut) {
    return true;
  }
  if (failure.kind === "http") {
    return typeof failure.status === "number" && failure.status >= 500;
  }
  return failure.kind === "unavailable" || failure.kind === "unknown";
}

function distribution(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 3);
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }
  return round((sorted[middle - 1]! + sorted[middle]!) / 2, 3);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function formatDistribution(distributionValue: Readonly<Record<string, number>>): string {
  const entries = Object.entries(distributionValue);
  if (entries.length === 0) {
    return "- n/a";
  }
  return entries.map(([label, count]) => `- ${label}: ${count}`).join("\n");
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
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

function resolveCliPath(value: string, baseDir: string): string {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function findWorkspaceRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (current.length > 0) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runNationalSkyDarknessBenchmarkCli(process.argv.slice(2));
  process.exit(exitCode);
}
