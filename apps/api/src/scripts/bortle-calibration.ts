import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { EstimatedBortleRange, LightPollutionInfo } from "@photo-weather/shared";
import {
  estimateBortleRangeForLightPollution,
  estimatedBortleMethodVersion,
} from "@photo-weather/scoring";
import {
  bortleNearZeroRadianceThreshold,
  buildBortleCandidateAnalysis,
  buildBortleMismatchReport,
  formatBortleCandidateAnalysisMarkdown,
  formatBortleMismatchCsv,
} from "./bortle-candidate-analysis.js";
import {
  AstroServiceClient,
  AstroServiceClientError,
  type AstroServiceLightPollutionQueryInput,
} from "../astro-service-client.js";

const defaultAstroServiceUrl = "http://astro-service:4100";
const defaultOutputDir = "deploy/calibration/runtime";
const defaultTimeoutMs = 30_000;
const defaultConcurrency = 2;
const maxRetryCount = 2;
const lowValidSampleThreshold = 30;
const radianceRatioThreshold = 5;

export const insufficientBortleCalibrationEvidenceZh =
  "当前参考样本不足，不建议修改生产波特尔映射阈值。";

type ReportFormat = "json" | "csv" | "markdown";

export type BortleCalibrationCliOptions = {
  readonly inputPath: string;
  readonly outputDir: string;
  readonly formats: readonly ReportFormat[];
  readonly astroServiceUrl: string;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly strict: boolean;
  readonly redactNames: boolean;
  readonly includeCoordinates: boolean;
  readonly failOnQueryError: boolean;
  readonly dryRun: boolean;
};

export type BortleCalibrationReference = {
  readonly minClass: number;
  readonly maxClass: number;
  readonly source?: string;
  readonly observedAt?: string;
  readonly confidence?: string;
  readonly notes?: string;
};

export type BortleCalibrationReferencePoint = {
  readonly rowNumber: number;
  readonly id: string;
  readonly name: string;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly category?: string;
  readonly reference?: BortleCalibrationReference;
};

export type BortleCalibrationInvalidRow = {
  readonly rowNumber: number;
  readonly id?: string;
  readonly errors: readonly string[];
};

type RawReferenceRow = {
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, unknown>>;
};

export type BortleRangeComparison = {
  readonly rangeOverlap: boolean;
  readonly overlapClasses: readonly number[];
  readonly classDistance: number;
  readonly estimateBelowReference: boolean;
  readonly estimateAboveReference: boolean;
  readonly exactRangeMatch: boolean;
  readonly acceptableAdjacentMatch: boolean;
};

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

export type BortleCalibrationQueryClient = {
  queryLightPollution(input: AstroServiceLightPollutionQueryInput): Promise<LightPollutionInfo>;
};

export type BortleCalibrationPointReport = {
  readonly rowNumber: number;
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly latitudeWgs84?: number;
  readonly longitudeWgs84?: number;
  readonly coordinates?: {
    readonly latitudeWgs84: number;
    readonly longitudeWgs84: number;
  };
  readonly reference?: BortleCalibrationReference;
  readonly referenceBortleMin?: number;
  readonly referenceBortleMax?: number;
  readonly querySuccess: boolean;
  readonly queryRetries: number;
  readonly queryFailure?: QueryFailure;
  readonly datasetAvailable?: boolean;
  readonly datasetYear?: number | null;
  readonly datasetVersion?: string | null;
  readonly localRadiance?: number | null;
  readonly surroundingHaloRadiance?: number | null;
  readonly localToHaloRatio?: number | null;
  readonly haloToLocalRatio?: number | null;
  readonly ambientRiskIndex?: number | null;
  readonly ambientRiskLevel?: LightPollutionInfo["ambientRiskLevel"];
  readonly ambientRiskLevelLabelZh?: string;
  readonly validSampleCount?: number;
  readonly rasterQueryConfidence?: LightPollutionInfo["confidence"];
  readonly confidence?: LightPollutionInfo["confidence"];
  readonly unavailableReason?: string | null;
  readonly estimatedBortleMin?: number;
  readonly estimatedBortleMax?: number;
  readonly estimatedBortleRangeLabel?: string;
  readonly estimatedSkyQualityLabel?: string;
  readonly estimatorMethodVersion?: string;
  readonly rangeDistance?: number;
  readonly rangeOverlap?: boolean;
  readonly biasDirection?: "estimate_below_reference" | "estimate_above_reference" | "overlap";
  readonly isLocalRadianceZeroOrNearZero?: boolean;
  readonly isAmbientRiskSaturated?: boolean;
  readonly localAndHaloDifferByRatioThreshold?: boolean;
  readonly rangeComparison?: BortleRangeComparison;
  readonly diagnostics: readonly string[];
};

export type BortleCalibrationSummary = {
  readonly totalInputRows: number;
  readonly validRows: number;
  readonly invalidRows: number;
  readonly querySuccesses: number;
  readonly queryFailures: number;
  readonly queryRetries: number;
  readonly unavailableDataCount: number;
  readonly pointsWithReferences: number;
  readonly comparedReferencePoints: number;
  readonly exactRangeMatches: number;
  readonly overlapMatches: number;
  readonly adjacentMatches: number;
  readonly disagreementsGreaterThanOneClass: number;
  readonly meanClassDistance: number | null;
  readonly medianClassDistance: number | null;
  readonly highConfidenceRasterResults: number;
  readonly highConfidenceRasterRatio: number;
  readonly estimatedBortleDistribution: Readonly<Record<string, number>>;
  readonly ambientRiskBandDistribution: Readonly<Record<string, number>>;
  readonly categoryDistribution: Readonly<Record<string, number>>;
};

export type BortleCalibrationRecommendation = {
  readonly action:
    | "keep_current_thresholds"
    | "collect_more_references"
    | "investigate_specific_mismatches"
    | "consider_threshold_review";
  readonly messageZh: string;
  readonly evidenceSufficientForThresholdReview: boolean;
  readonly evidence: {
    readonly referencedPointCount: number;
    readonly meaningfulEnvironmentCategories: number;
    readonly categoriesWithAtLeastFiveReferences: number;
    readonly largestCategoryShare: number;
    readonly highConfidenceRasterRatio: number;
    readonly sameDirectionalBiasCategories: readonly string[];
    readonly medianClassDistance: number | null;
    readonly overOneClassDisagreementRatio: number;
  };
};

export type BortleCalibrationReport = {
  readonly run: {
    readonly timestamp: string;
    readonly toolVersion: "bortle-calibration-v1";
    readonly estimatorMethodVersion: typeof estimatedBortleMethodVersion;
    readonly astroServiceUrl: string;
    readonly formats: readonly ReportFormat[];
    readonly strict: boolean;
    readonly redactedNames: boolean;
    readonly includeCoordinates: boolean;
    readonly dryRun: boolean;
  };
  readonly summary: BortleCalibrationSummary;
  readonly datasetVersions: readonly string[];
  readonly invalidRows: readonly BortleCalibrationInvalidRow[];
  readonly points: readonly BortleCalibrationPointReport[];
  readonly recommendation: BortleCalibrationRecommendation;
};

type ValidationResult = {
  readonly validRows: readonly BortleCalibrationReferencePoint[];
  readonly invalidRows: readonly BortleCalibrationInvalidRow[];
  readonly totalInputRows: number;
};

type RunCalibrationOptions = {
  readonly options: BortleCalibrationCliOptions;
  readonly rows: readonly BortleCalibrationReferencePoint[];
  readonly invalidRows: readonly BortleCalibrationInvalidRow[];
  readonly totalInputRows: number;
  readonly client: BortleCalibrationQueryClient;
  readonly timestamp: string;
};

export function parseBortleCalibrationArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): BortleCalibrationCliOptions {
  const values = new Map<string, string>();
  const formatValues: string[] = [];
  let strict = false;
  let redactNames = false;
  let includeCoordinates = false;
  let failOnQueryError = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }
    if (arg === "--") {
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--redact-names") {
      redactNames = true;
      continue;
    }
    if (arg === "--include-coordinates") {
      includeCoordinates = true;
      continue;
    }
    if (arg === "--fail-on-query-error") {
      failOnQueryError = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
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

    if (rawName === "format") {
      formatValues.push(value);
      continue;
    }
    values.set(rawName, value);
  }

  const inputPath = values.get("input");
  if (!inputPath) {
    throw new Error(`Missing required --input\n${usageText()}`);
  }

  return {
    inputPath,
    outputDir: values.get("output-dir") ?? defaultOutputDir,
    formats: normalizeFormats(formatValues),
    astroServiceUrl:
      values.get("astro-service-url") ??
      env.BORTLE_CALIBRATION_ASTRO_SERVICE_URL ??
      env.ASTRO_SERVICE_URL ??
      defaultAstroServiceUrl,
    timeoutMs: readPositiveInteger(values.get("timeout-ms"), defaultTimeoutMs, "timeout-ms"),
    concurrency: Math.min(
      8,
      readPositiveInteger(values.get("concurrency"), defaultConcurrency, "concurrency"),
    ),
    strict,
    redactNames,
    includeCoordinates,
    failOnQueryError,
    dryRun,
  };
}

export function parseBortleReferenceContent(
  content: string,
  inputPath: string,
): readonly RawReferenceRow[] {
  const extension = path.extname(inputPath).toLowerCase();
  const trimmed = content.trimStart();
  if (extension === ".json" || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return parseJsonReferenceRows(content);
  }
  return parseCsvReferenceRows(content);
}

export function validateBortleReferenceRows(rawRows: readonly RawReferenceRow[]): ValidationResult {
  const candidates: BortleCalibrationReferencePoint[] = [];
  const invalidRows: BortleCalibrationInvalidRow[] = [];
  const idCounts = new Map<string, number>();

  for (const rawRow of rawRows) {
    const parsed = validateReferenceRow(rawRow);
    if (parsed.errors.length > 0 || !parsed.point) {
      invalidRows.push({
        rowNumber: rawRow.rowNumber,
        id: parsed.id,
        errors: parsed.errors,
      });
      continue;
    }
    candidates.push(parsed.point);
    idCounts.set(parsed.point.id, (idCounts.get(parsed.point.id) ?? 0) + 1);
  }

  const validRows: BortleCalibrationReferencePoint[] = [];
  for (const candidate of candidates) {
    if ((idCounts.get(candidate.id) ?? 0) > 1) {
      invalidRows.push({
        rowNumber: candidate.rowNumber,
        id: candidate.id,
        errors: [`Duplicate id: ${candidate.id}`],
      });
      continue;
    }
    validRows.push(candidate);
  }

  return {
    validRows,
    invalidRows: invalidRows.sort((left, right) => left.rowNumber - right.rowNumber),
    totalInputRows: rawRows.length,
  };
}

export function compareBortleRanges(
  estimate: Pick<EstimatedBortleRange, "minClass" | "maxClass" | "available">,
  reference: BortleCalibrationReference,
): BortleRangeComparison | null {
  if (
    !estimate.available ||
    typeof estimate.minClass !== "number" ||
    typeof estimate.maxClass !== "number"
  ) {
    return null;
  }

  const rangeOverlap =
    estimate.minClass <= reference.maxClass && estimate.maxClass >= reference.minClass;
  const overlapStart = Math.max(estimate.minClass, reference.minClass);
  const overlapEnd = Math.min(estimate.maxClass, reference.maxClass);
  const overlapClasses = rangeOverlap ? listClasses(overlapStart, overlapEnd) : [];
  const estimateBelowReference = estimate.maxClass < reference.minClass;
  const estimateAboveReference = estimate.minClass > reference.maxClass;
  const classDistance = rangeOverlap
    ? 0
    : estimateBelowReference
      ? reference.minClass - estimate.maxClass
      : estimate.minClass - reference.maxClass;

  return {
    rangeOverlap,
    overlapClasses,
    classDistance,
    estimateBelowReference,
    estimateAboveReference,
    exactRangeMatch:
      estimate.minClass === reference.minClass && estimate.maxClass === reference.maxClass,
    acceptableAdjacentMatch: classDistance <= 1,
  };
}

export async function runBortleCalibrationCli(
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

    if (options.dryRun) {
      output("Bortle calibration dry run");
      output(`input rows: ${validation.totalInputRows}`);
      output(`valid rows: ${validation.validRows.length}`);
      output(`invalid rows: ${validation.invalidRows.length}`);
      output(`planned query count: ${validation.validRows.length}`);
      output("No astro-service queries were sent and no calibration metrics were generated.");
      for (const invalidRow of validation.invalidRows) {
        output(formatInvalidRowLine(invalidRow));
      }
      return options.strict && validation.invalidRows.length > 0 ? 1 : 0;
    }

    if (options.strict && validation.invalidRows.length > 0) {
      errorOutput("Strict mode failed because the reference file contains invalid rows.");
      for (const invalidRow of validation.invalidRows) {
        errorOutput(formatInvalidRowLine(invalidRow));
      }
      return 1;
    }

    const client =
      dependencies.client ??
      new AstroServiceClient({
        baseUrl: options.astroServiceUrl,
        timeoutMs: options.timeoutMs,
      });
    const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
    const report = await buildBortleCalibrationReport({
      options,
      rows: validation.validRows,
      invalidRows: validation.invalidRows,
      totalInputRows: validation.totalInputRows,
      client,
      timestamp,
    });
    const writtenFiles = await writeBortleCalibrationReports(report, options, workspaceRoot);

    output("Bortle calibration audit complete");
    output(`valid rows: ${report.summary.validRows}`);
    output(`query successes: ${report.summary.querySuccesses}`);
    output(`query failures: ${report.summary.queryFailures}`);
    output(`recommendation: ${report.recommendation.action}`);
    for (const file of writtenFiles) {
      output(`wrote: ${file}`);
    }

    return options.failOnQueryError && report.summary.queryFailures > 0 ? 1 : 0;
  } catch (error) {
    errorOutput(error instanceof Error ? error.message : "Bortle calibration command failed.");
    return 1;
  }
}

export async function buildBortleCalibrationReport({
  options,
  rows,
  invalidRows,
  totalInputRows,
  client,
  timestamp,
}: RunCalibrationOptions): Promise<BortleCalibrationReport> {
  const queryResults = await queryReferenceRows(rows, client, options);
  const points = rows.map((row, index) =>
    buildPointReport(row, queryResults[index]!, {
      redactNames: options.redactNames,
      includeCoordinates: options.includeCoordinates,
    }),
  );
  const summary = summarizeReport(totalInputRows, invalidRows, points);
  const recommendation = buildCalibrationRecommendation(summary, points);

  return {
    run: {
      timestamp,
      toolVersion: "bortle-calibration-v1",
      estimatorMethodVersion: estimatedBortleMethodVersion,
      astroServiceUrl: sanitizeReportUrl(options.astroServiceUrl),
      formats: options.formats,
      strict: options.strict,
      redactedNames: options.redactNames,
      includeCoordinates: options.includeCoordinates,
      dryRun: false,
    },
    summary,
    datasetVersions: collectDatasetVersions(points),
    invalidRows: invalidRows.map(redactInvalidRow),
    points,
    recommendation,
  };
}

export function formatBortleCalibrationMarkdown(report: BortleCalibrationReport): string {
  const summary = report.summary;
  const lines = [
    "# Estimated Bortle Calibration Audit",
    "",
    "## Run",
    "",
    `- Run timestamp: ${report.run.timestamp}`,
    `- Dataset year/version: ${report.datasetVersions.join(", ") || "n/a"}`,
    `- Estimator method version: ${report.run.estimatorMethodVersion}`,
    `- Total input rows: ${summary.totalInputRows}`,
    `- Valid rows: ${summary.validRows}`,
    `- Invalid rows: ${summary.invalidRows}`,
    `- Query successes: ${summary.querySuccesses}`,
    `- Query failures: ${summary.queryFailures}`,
    `- Unavailable-data count: ${summary.unavailableDataCount}`,
    `- Points with references: ${summary.pointsWithReferences}`,
    `- Exact range matches: ${summary.exactRangeMatches}`,
    `- Overlap matches: ${summary.overlapMatches}`,
    `- Adjacent matches: ${summary.adjacentMatches}`,
    `- Disagreements greater than one class: ${summary.disagreementsGreaterThanOneClass}`,
    `- Mean class distance: ${formatNullableNumber(summary.meanClassDistance)}`,
    `- Median class distance: ${formatNullableNumber(summary.medianClassDistance)}`,
    "",
    "## Estimated Bortle Distribution",
    "",
    formatDistribution(summary.estimatedBortleDistribution),
    "",
    "## Ambient Risk Band Distribution",
    "",
    formatDistribution(summary.ambientRiskBandDistribution),
    "",
    "## Category Distribution",
    "",
    formatDistribution(summary.categoryDistribution),
    "",
    "## Detailed Mismatch Table",
    "",
    formatMismatchTable(report.points, report.run.includeCoordinates),
    "",
    "## Calibration Recommendation",
    "",
    `- Action: ${report.recommendation.action}`,
    `- Recommendation: ${report.recommendation.messageZh}`,
    `- Referenced points compared: ${report.recommendation.evidence.referencedPointCount}`,
    `- Meaningful environment categories: ${report.recommendation.evidence.meaningfulEnvironmentCategories}`,
    `- Categories with at least five references: ${report.recommendation.evidence.categoriesWithAtLeastFiveReferences}`,
    `- Largest category share: ${formatPercent(
      report.recommendation.evidence.largestCategoryShare,
    )}`,
    `- High-confidence raster ratio: ${formatPercent(
      report.recommendation.evidence.highConfidenceRasterRatio,
    )}`,
    `- Same directional bias categories: ${
      report.recommendation.evidence.sameDirectionalBiasCategories.join(", ") || "none"
    }`,
    `- Over-one-class disagreement ratio: ${formatPercent(
      report.recommendation.evidence.overOneClassDisagreementRatio,
    )}`,
    "",
    "## Diagnostic Grouping",
    "",
    formatDiagnosticGrouping(report.points),
    "",
    "The tool does not automatically rewrite production Bortle thresholds.",
  ];

  return `${lines.join("\n")}\n`;
}

export function formatBortleCalibrationCsv(report: BortleCalibrationReport): string {
  const headers = [
    "rowNumber",
    "id",
    "name",
    "category",
    "latitudeWgs84",
    "longitudeWgs84",
    "referenceBortleMin",
    "referenceBortleMax",
    "querySuccess",
    "queryRetries",
    "datasetAvailable",
    "datasetYear",
    "datasetVersion",
    "localRadiance",
    "surroundingHaloRadiance",
    "localToHaloRatio",
    "haloToLocalRatio",
    "ambientRiskIndex",
    "ambientRiskLevel",
    "ambientRiskLevelLabelZh",
    "validSampleCount",
    "rasterQueryConfidence",
    "confidence",
    "unavailableReason",
    "estimatedBortleMin",
    "estimatedBortleMax",
    "estimatedBortleRangeLabel",
    "estimatedSkyQualityLabel",
    "estimatorMethodVersion",
    "rangeDistance",
    "rangeOverlap",
    "overlapClasses",
    "classDistance",
    "biasDirection",
    "estimateBelowReference",
    "estimateAboveReference",
    "exactRangeMatch",
    "acceptableAdjacentMatch",
    "isLocalRadianceZeroOrNearZero",
    "isAmbientRiskSaturated",
    "localAndHaloDifferByRatioThreshold",
    "diagnostics",
    "queryFailureKind",
    "queryFailureMessage",
  ];
  const rows = report.points.map((point) =>
    [
      point.rowNumber,
      point.id,
      point.name,
      point.category ?? "",
      point.latitudeWgs84 ?? "",
      point.longitudeWgs84 ?? "",
      point.referenceBortleMin ?? point.reference?.minClass ?? "",
      point.referenceBortleMax ?? point.reference?.maxClass ?? "",
      point.querySuccess,
      point.queryRetries,
      point.datasetAvailable ?? "",
      point.datasetYear ?? "",
      point.datasetVersion ?? "",
      point.localRadiance ?? "",
      point.surroundingHaloRadiance ?? "",
      point.localToHaloRatio ?? "",
      point.haloToLocalRatio ?? "",
      point.ambientRiskIndex ?? "",
      point.ambientRiskLevel ?? "",
      point.ambientRiskLevelLabelZh ?? "",
      point.validSampleCount ?? "",
      point.rasterQueryConfidence ?? "",
      point.confidence ?? "",
      point.unavailableReason ?? "",
      point.estimatedBortleMin ?? "",
      point.estimatedBortleMax ?? "",
      point.estimatedBortleRangeLabel ?? "",
      point.estimatedSkyQualityLabel ?? "",
      point.estimatorMethodVersion ?? "",
      point.rangeDistance ?? "",
      point.rangeComparison?.rangeOverlap ?? "",
      point.rangeComparison?.overlapClasses.join(" ") ?? "",
      point.rangeComparison?.classDistance ?? "",
      point.biasDirection ?? "",
      point.rangeComparison?.estimateBelowReference ?? "",
      point.rangeComparison?.estimateAboveReference ?? "",
      point.rangeComparison?.exactRangeMatch ?? "",
      point.rangeComparison?.acceptableAdjacentMatch ?? "",
      point.isLocalRadianceZeroOrNearZero ?? "",
      point.isAmbientRiskSaturated ?? "",
      point.localAndHaloDifferByRatioThreshold ?? "",
      point.diagnostics.join(";"),
      point.queryFailure?.kind ?? "",
      point.queryFailure?.message ?? "",
    ].map(csvCell),
  );
  const invalidRows = report.invalidRows.map((row) =>
    headers
      .map((header) => {
        if (header === "rowNumber") {
          return row.rowNumber;
        }
        if (header === "id") {
          return row.id ?? "";
        }
        if (header === "name") {
          return "INVALID";
        }
        if (header === "querySuccess") {
          return false;
        }
        if (header === "diagnostics" || header === "queryFailureMessage") {
          return row.errors.join(";");
        }
        if (header === "queryFailureKind") {
          return "validation";
        }
        return "";
      })
      .map(csvCell),
  );

  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.join(",")),
    ...invalidRows.map((row) => row.join(",")),
  ].join("\n");
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
      const lightPollution = await client.queryLightPollution({
        latitudeWgs84: row.latitudeWgs84,
        longitudeWgs84: row.longitudeWgs84,
      });
      return { success: true, lightPollution, retries };
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

function buildPointReport(
  row: BortleCalibrationReferencePoint,
  queryResult: QueryResult,
  outputOptions: { readonly redactNames: boolean; readonly includeCoordinates: boolean },
): BortleCalibrationPointReport {
  const base = {
    rowNumber: row.rowNumber,
    id: row.id,
    name: outputOptions.redactNames ? row.id : row.name,
    category: row.category,
    latitudeWgs84: row.latitudeWgs84,
    longitudeWgs84: row.longitudeWgs84,
    coordinates: outputOptions.includeCoordinates
      ? {
          latitudeWgs84: row.latitudeWgs84,
          longitudeWgs84: row.longitudeWgs84,
        }
      : undefined,
    reference: row.reference
      ? redactReference(row.reference, outputOptions.redactNames)
      : undefined,
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
  const estimatedBortle = estimateBortleRangeForLightPollution(lightPollution);
  const rangeComparison = row.reference
    ? compareBortleRanges(estimatedBortle, row.reference)
    : undefined;
  const radianceDiagnostics = buildRadianceDiagnosticFields(lightPollution);

  return {
    ...base,
    querySuccess: true,
    queryRetries: queryResult.retries,
    datasetAvailable: lightPollution.dataAvailable,
    datasetYear: lightPollution.datasetYear,
    datasetVersion: lightPollution.datasetVersion,
    localRadiance: lightPollution.localRadiance,
    surroundingHaloRadiance: lightPollution.surroundingHaloRadiance,
    localToHaloRatio: radianceDiagnostics.localToHaloRatio,
    haloToLocalRatio: radianceDiagnostics.haloToLocalRatio,
    ambientRiskIndex: lightPollution.ambientRiskIndex,
    ambientRiskLevel: lightPollution.ambientRiskLevel,
    ambientRiskLevelLabelZh: lightPollution.ambientRiskLevelLabelZh,
    validSampleCount: lightPollution.validSampleCount,
    rasterQueryConfidence: lightPollution.confidence,
    confidence: lightPollution.confidence,
    unavailableReason: estimatedBortle.available
      ? lightPollution.unavailableReason
      : estimatedBortle.unavailableReason,
    estimatedBortleMin: estimatedBortle.minClass,
    estimatedBortleMax: estimatedBortle.maxClass,
    estimatedBortleRangeLabel: estimatedBortle.rangeLabelZh,
    estimatedSkyQualityLabel: estimatedBortle.skyQualityLabelZh,
    estimatorMethodVersion: estimatedBortle.methodVersion,
    rangeDistance: rangeComparison?.classDistance,
    rangeOverlap: rangeComparison?.rangeOverlap,
    biasDirection: rangeComparison ? comparisonBiasDirection(rangeComparison) : undefined,
    isLocalRadianceZeroOrNearZero: radianceDiagnostics.isLocalRadianceZeroOrNearZero,
    isAmbientRiskSaturated: radianceDiagnostics.isAmbientRiskSaturated,
    localAndHaloDifferByRatioThreshold: radianceDiagnostics.localAndHaloDifferByRatioThreshold,
    rangeComparison: rangeComparison ?? undefined,
    diagnostics: buildGeographicDiagnostics(lightPollution, estimatedBortle),
  };
}

function summarizeReport(
  totalInputRows: number,
  invalidRows: readonly BortleCalibrationInvalidRow[],
  points: readonly BortleCalibrationPointReport[],
): BortleCalibrationSummary {
  const comparisons = points
    .map((point) => point.rangeComparison)
    .filter((comparison): comparison is BortleRangeComparison => Boolean(comparison));
  const distances = comparisons.map((comparison) => comparison.classDistance);
  const pointsWithReferences = points.filter((point) => Boolean(point.reference)).length;
  const querySuccesses = points.filter((point) => point.querySuccess).length;
  const highConfidenceRasterResults = points.filter(
    (point) => point.querySuccess && point.datasetAvailable && point.confidence === "high",
  ).length;

  return {
    totalInputRows,
    validRows: points.length,
    invalidRows: invalidRows.length,
    querySuccesses,
    queryFailures: points.filter((point) => !point.querySuccess).length,
    queryRetries: points.reduce((sum, point) => sum + point.queryRetries, 0),
    unavailableDataCount: points.filter(
      (point) =>
        point.querySuccess &&
        (point.datasetAvailable === false || point.estimatedBortleMin === undefined),
    ).length,
    pointsWithReferences,
    comparedReferencePoints: comparisons.length,
    exactRangeMatches: comparisons.filter((comparison) => comparison.exactRangeMatch).length,
    overlapMatches: comparisons.filter((comparison) => comparison.rangeOverlap).length,
    adjacentMatches: comparisons.filter(
      (comparison) => !comparison.rangeOverlap && comparison.acceptableAdjacentMatch,
    ).length,
    disagreementsGreaterThanOneClass: comparisons.filter(
      (comparison) => comparison.classDistance > 1,
    ).length,
    meanClassDistance: mean(distances),
    medianClassDistance: median(distances),
    highConfidenceRasterResults,
    highConfidenceRasterRatio: points.length > 0 ? highConfidenceRasterResults / points.length : 0,
    estimatedBortleDistribution: distribution(
      points
        .filter((point) => point.querySuccess)
        .map((point) => point.estimatedBortleRangeLabel ?? "unavailable"),
    ),
    ambientRiskBandDistribution: distribution(
      points
        .filter((point) => point.querySuccess)
        .map((point) => point.ambientRiskLevelLabelZh ?? point.ambientRiskLevel ?? "unknown"),
    ),
    categoryDistribution: distribution(points.map((point) => point.category ?? "uncategorized")),
  };
}

function buildCalibrationRecommendation(
  summary: BortleCalibrationSummary,
  points: readonly BortleCalibrationPointReport[],
): BortleCalibrationRecommendation {
  const comparedPoints = points.filter((point) => point.rangeComparison);
  const comparedCount = comparedPoints.length;
  const categoryCounts = new Map<string, number>();
  for (const point of comparedPoints) {
    if (!point.category) {
      continue;
    }
    categoryCounts.set(point.category, (categoryCounts.get(point.category) ?? 0) + 1);
  }
  const categoriesWithAtLeastFiveReferences = [...categoryCounts.values()].filter(
    (count) => count >= 5,
  ).length;
  const meaningfulEnvironmentCategories = categoryCounts.size;
  const largestCategoryCount =
    categoryCounts.size > 0 ? Math.max(...[...categoryCounts.values()]) : 0;
  const largestCategoryShare = comparedCount > 0 ? largestCategoryCount / comparedCount : 0;
  const belowCategories = new Set<string>();
  const aboveCategories = new Set<string>();
  for (const point of comparedPoints) {
    if (!point.category || !point.rangeComparison || point.rangeComparison.classDistance === 0) {
      continue;
    }
    if (point.rangeComparison.estimateBelowReference) {
      belowCategories.add(point.category);
    }
    if (point.rangeComparison.estimateAboveReference) {
      aboveCategories.add(point.category);
    }
  }
  const sameDirectionalBiasCategories =
    belowCategories.size >= 2
      ? [...belowCategories].sort()
      : aboveCategories.size >= 2
        ? [...aboveCategories].sort()
        : [];
  const overOneClassDisagreementRatio =
    comparedCount > 0 ? summary.disagreementsGreaterThanOneClass / comparedCount : 0;
  const evidenceSufficientForThresholdReview =
    comparedCount >= 50 &&
    meaningfulEnvironmentCategories >= 5 &&
    largestCategoryShare <= 0.5 &&
    summary.highConfidenceRasterRatio >= 0.8 &&
    sameDirectionalBiasCategories.length >= 2 &&
    ((summary.medianClassDistance ?? 0) > 1 || overOneClassDisagreementRatio > 0.25);

  if (evidenceSufficientForThresholdReview) {
    return {
      action: "consider_threshold_review",
      messageZh:
        "参考样本已达到最低证据门槛，且跨类别出现一致方向偏差；建议人工复核阈值，但本工具不会自动修改生产映射。",
      evidenceSufficientForThresholdReview,
      evidence: {
        referencedPointCount: comparedCount,
        meaningfulEnvironmentCategories,
        categoriesWithAtLeastFiveReferences,
        largestCategoryShare,
        highConfidenceRasterRatio: summary.highConfidenceRasterRatio,
        sameDirectionalBiasCategories,
        medianClassDistance: summary.medianClassDistance,
        overOneClassDisagreementRatio,
      },
    };
  }

  const action =
    summary.disagreementsGreaterThanOneClass > 0
      ? "investigate_specific_mismatches"
      : comparedCount < 30 || categoriesWithAtLeastFiveReferences < 4
        ? "collect_more_references"
        : "keep_current_thresholds";

  return {
    action,
    messageZh:
      action === "investigate_specific_mismatches"
        ? `存在超过一档的差异点，建议先排查具体错配、数据边界和样本来源。${insufficientBortleCalibrationEvidenceZh}`
        : action === "collect_more_references"
          ? `需要继续收集独立参考样本。${insufficientBortleCalibrationEvidenceZh}`
          : `当前没有足够证据支持阈值调整。${insufficientBortleCalibrationEvidenceZh}`,
    evidenceSufficientForThresholdReview,
    evidence: {
      referencedPointCount: comparedCount,
      meaningfulEnvironmentCategories,
      categoriesWithAtLeastFiveReferences,
      largestCategoryShare,
      highConfidenceRasterRatio: summary.highConfidenceRasterRatio,
      sameDirectionalBiasCategories,
      medianClassDistance: summary.medianClassDistance,
      overOneClassDisagreementRatio,
    },
  };
}

function buildRadianceDiagnosticFields(lightPollution: LightPollutionInfo): {
  readonly localToHaloRatio: number | null;
  readonly haloToLocalRatio: number | null;
  readonly isLocalRadianceZeroOrNearZero: boolean;
  readonly isAmbientRiskSaturated: boolean;
  readonly localAndHaloDifferByRatioThreshold: boolean;
} {
  const localRadiance = lightPollution.localRadiance;
  const haloRadiance = lightPollution.surroundingHaloRadiance;
  const localToHaloRatio = radianceRatio(localRadiance, haloRadiance);
  const haloToLocalRatio = radianceRatio(haloRadiance, localRadiance);
  const isLocalRadianceZeroOrNearZero =
    typeof localRadiance === "number" &&
    Number.isFinite(localRadiance) &&
    Math.abs(localRadiance) <= bortleNearZeroRadianceThreshold;
  const isAmbientRiskSaturated =
    lightPollution.ambientRiskIndex === 0 || lightPollution.ambientRiskIndex === 100;
  const localAndHaloDifferByRatioThreshold =
    typeof localRadiance === "number" &&
    Number.isFinite(localRadiance) &&
    typeof haloRadiance === "number" &&
    Number.isFinite(haloRadiance) &&
    ((localRadiance > 0 &&
      localRadiance >= Math.max(haloRadiance, 0.0001) * radianceRatioThreshold) ||
      (haloRadiance > 0 &&
        haloRadiance >= Math.max(localRadiance, 0.0001) * radianceRatioThreshold));

  return {
    localToHaloRatio,
    haloToLocalRatio,
    isLocalRadianceZeroOrNearZero,
    isAmbientRiskSaturated,
    localAndHaloDifferByRatioThreshold,
  };
}

function radianceRatio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    typeof numerator !== "number" ||
    !Number.isFinite(numerator) ||
    typeof denominator !== "number" ||
    !Number.isFinite(denominator)
  ) {
    return null;
  }
  if (Math.abs(denominator) <= bortleNearZeroRadianceThreshold) {
    return Math.abs(numerator) <= bortleNearZeroRadianceThreshold ? 1 : null;
  }
  return round(numerator / denominator, 3);
}

function comparisonBiasDirection(
  comparison: BortleRangeComparison,
): "estimate_below_reference" | "estimate_above_reference" | "overlap" {
  if (comparison.estimateBelowReference) {
    return "estimate_below_reference";
  }
  if (comparison.estimateAboveReference) {
    return "estimate_above_reference";
  }
  return "overlap";
}

function buildGeographicDiagnostics(
  lightPollution: LightPollutionInfo,
  estimatedBortle: EstimatedBortleRange,
): readonly string[] {
  const diagnostics: string[] = [];
  const reason = (estimatedBortle.unavailableReason ?? lightPollution.unavailableReason ?? "")
    .toString()
    .toLowerCase();

  if (reason.includes("outside") || reason.includes("bounds")) {
    diagnostics.push("outside_dataset_bounds");
  }
  if (reason.includes("nodata") || reason.includes("no_data")) {
    diagnostics.push("raster_nodata");
  }
  if (lightPollution.validSampleCount === 0) {
    diagnostics.push("zero_valid_samples");
  } else if (lightPollution.validSampleCount < lowValidSampleThreshold) {
    diagnostics.push("unusually_low_valid_sample_count");
  }
  if (
    typeof lightPollution.localRadiance === "number" &&
    typeof lightPollution.surroundingHaloRadiance === "number"
  ) {
    if (
      lightPollution.localRadiance > 0 &&
      lightPollution.localRadiance >=
        Math.max(lightPollution.surroundingHaloRadiance, 0.0001) * radianceRatioThreshold
    ) {
      diagnostics.push("local_radiance_much_higher_than_surrounding_halo");
    }
    if (
      lightPollution.surroundingHaloRadiance > 0 &&
      lightPollution.surroundingHaloRadiance >=
        Math.max(lightPollution.localRadiance, 0.0001) * radianceRatioThreshold
    ) {
      diagnostics.push("surrounding_halo_much_higher_than_local_radiance");
    }
  }
  if (
    typeof lightPollution.localRadiance === "number" &&
    Number.isFinite(lightPollution.localRadiance) &&
    Math.abs(lightPollution.localRadiance) <= bortleNearZeroRadianceThreshold
  ) {
    diagnostics.push("zero_or_near_zero_local_radiance");
  }
  if (lightPollution.ambientRiskIndex === 0) {
    diagnostics.push("ambient_risk_saturated_0");
  }
  if (lightPollution.ambientRiskIndex === 100) {
    diagnostics.push("ambient_risk_saturated_100");
  }
  if (lightPollution.confidence !== "high") {
    diagnostics.push("confidence_below_high");
  }
  if (
    typeof lightPollution.datasetYear !== "number" ||
    !hasText(lightPollution.datasetVersion) ||
    !hasText(lightPollution.sourceLabel ?? lightPollution.sourceCode)
  ) {
    diagnostics.push("missing_dataset_metadata");
  }
  if (diagnostics.length === 0 && (!lightPollution.dataAvailable || !estimatedBortle.available)) {
    diagnostics.push("light_pollution_unavailable");
  }

  return diagnostics;
}

async function writeBortleCalibrationReports(
  report: BortleCalibrationReport,
  options: BortleCalibrationCliOptions,
  cwd: string,
): Promise<readonly string[]> {
  const outputDir = path.resolve(cwd, options.outputDir);
  await mkdir(outputDir, { recursive: true });
  const timestampSlug = report.run.timestamp.replace(/[:.]/g, "-");
  const writtenFiles: string[] = [];

  if (options.formats.includes("json")) {
    const file = path.join(outputDir, `bortle-calibration-${timestampSlug}.json`);
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writtenFiles.push(file);
  }
  if (options.formats.includes("csv")) {
    const file = path.join(outputDir, `bortle-calibration-${timestampSlug}.csv`);
    await writeFile(file, `${formatBortleCalibrationCsv(report)}\n`, "utf8");
    writtenFiles.push(file);
  }
  if (options.formats.includes("markdown")) {
    const file = path.join(outputDir, `bortle-calibration-${timestampSlug}.md`);
    await writeFile(file, formatBortleCalibrationMarkdown(report), "utf8");
    writtenFiles.push(file);
  }

  const mismatchReport = buildBortleMismatchReport(report);
  const mismatchJsonFile = path.join(
    outputDir,
    `bortle-calibration-${timestampSlug}-mismatches.json`,
  );
  await writeFile(mismatchJsonFile, `${JSON.stringify(mismatchReport, null, 2)}\n`, "utf8");
  writtenFiles.push(mismatchJsonFile);

  const mismatchCsvFile = path.join(
    outputDir,
    `bortle-calibration-${timestampSlug}-mismatches.csv`,
  );
  await writeFile(mismatchCsvFile, `${formatBortleMismatchCsv(mismatchReport)}\n`, "utf8");
  writtenFiles.push(mismatchCsvFile);

  const candidateAnalysis = buildBortleCandidateAnalysis(report);
  const candidateAnalysisJsonFile = path.join(
    outputDir,
    `bortle-calibration-${timestampSlug}-candidate-analysis.json`,
  );
  await writeFile(
    candidateAnalysisJsonFile,
    `${JSON.stringify(candidateAnalysis, null, 2)}\n`,
    "utf8",
  );
  writtenFiles.push(candidateAnalysisJsonFile);

  const candidateAnalysisMarkdownFile = path.join(
    outputDir,
    `bortle-calibration-${timestampSlug}-candidate-analysis.md`,
  );
  await writeFile(
    candidateAnalysisMarkdownFile,
    formatBortleCandidateAnalysisMarkdown(candidateAnalysis),
    "utf8",
  );
  writtenFiles.push(candidateAnalysisMarkdownFile);

  return writtenFiles;
}

function parseJsonReferenceRows(content: string): readonly RawReferenceRow[] {
  const parsed = JSON.parse(content) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.references)
      ? parsed.references
      : isRecord(parsed) && Array.isArray(parsed.points)
        ? parsed.points
        : null;
  if (!rows) {
    throw new Error("JSON reference input must be an array or an object with references/points.");
  }
  return rows.map((row, index) => ({
    rowNumber: index + 1,
    values: isRecord(row) ? row : { __malformed: row },
  }));
}

function parseCsvReferenceRows(content: string): readonly RawReferenceRow[] {
  const rows = parseCsv(content).filter((row) => row.some((value) => value.trim().length > 0));
  const header = rows[0]?.map((value) => value.trim());
  if (!header || header.length === 0) {
    throw new Error("CSV reference input is empty.");
  }

  const headerCounts = new Map<string, number>();
  for (const column of header) {
    if (!column) {
      throw new Error("CSV header contains a blank column name.");
    }
    headerCounts.set(column, (headerCounts.get(column) ?? 0) + 1);
  }
  const duplicateHeader = [...headerCounts.entries()].find(([, count]) => count > 1);
  if (duplicateHeader) {
    throw new Error(`CSV header contains duplicate column: ${duplicateHeader[0]}`);
  }

  return rows.slice(1).map((row, index) => {
    const values: Record<string, unknown> = {};
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      values[header[columnIndex]!] = row[columnIndex] ?? "";
    }
    if (row.length > header.length) {
      values.__extraColumns = row.slice(header.length).join(",");
    }
    return {
      rowNumber: index + 2,
      values,
    };
  });
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      if (field.length > 0) {
        throw new Error("Malformed CSV: quote appears in the middle of an unquoted field.");
      }
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      if (char === "\r" && content[index + 1] === "\n") {
        index += 1;
      }
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unclosed quoted field.");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function validateReferenceRow(rawRow: RawReferenceRow): {
  readonly point?: BortleCalibrationReferencePoint;
  readonly id?: string;
  readonly errors: readonly string[];
} {
  const errors: string[] = [];
  const values = rawRow.values;
  const id = readRequiredText(values, "id", errors);
  const name = readRequiredText(values, "name", errors);
  const latitudeWgs84 = readRequiredNumber(values, "latitudeWgs84", errors);
  const longitudeWgs84 = readRequiredNumber(values, "longitudeWgs84", errors);
  const category = readOptionalText(values, "category");
  const referenceBortleMin = readOptionalBortleClass(values, "referenceBortleMin", errors);
  const referenceBortleMax = readOptionalBortleClass(values, "referenceBortleMax", errors);

  if ("__malformed" in values) {
    errors.push("JSON row must be an object.");
  }
  if ("__extraColumns" in values) {
    errors.push("CSV row contains more columns than the header.");
  }
  if (typeof latitudeWgs84 === "number" && (latitudeWgs84 < -90 || latitudeWgs84 > 90)) {
    errors.push("latitudeWgs84 must be between -90 and 90.");
  }
  if (typeof longitudeWgs84 === "number" && (longitudeWgs84 < -180 || longitudeWgs84 > 180)) {
    errors.push("longitudeWgs84 must be between -180 and 180.");
  }
  if (
    (referenceBortleMin === undefined) !== (referenceBortleMax === undefined) &&
    !errors.some((error) => error.includes("referenceBortle"))
  ) {
    errors.push("referenceBortleMin and referenceBortleMax must be supplied together.");
  }
  if (
    typeof referenceBortleMin === "number" &&
    typeof referenceBortleMax === "number" &&
    referenceBortleMin > referenceBortleMax
  ) {
    errors.push("referenceBortleMin must not exceed referenceBortleMax.");
  }

  if (
    errors.length > 0 ||
    !id ||
    !name ||
    typeof latitudeWgs84 !== "number" ||
    typeof longitudeWgs84 !== "number"
  ) {
    return { id, errors };
  }

  const reference =
    typeof referenceBortleMin === "number" && typeof referenceBortleMax === "number"
      ? {
          minClass: referenceBortleMin,
          maxClass: referenceBortleMax,
          source: readOptionalText(values, "referenceSource"),
          observedAt: readOptionalText(values, "referenceObservedAt"),
          confidence: readOptionalText(values, "referenceConfidence"),
          notes: readOptionalText(values, "notes"),
        }
      : undefined;

  return {
    point: {
      rowNumber: rawRow.rowNumber,
      id,
      name,
      latitudeWgs84,
      longitudeWgs84,
      category,
      reference,
    },
    id,
    errors: [],
  };
}

function readRequiredText(
  values: Readonly<Record<string, unknown>>,
  field: string,
  errors: string[],
): string | undefined {
  const value = readOptionalText(values, field);
  if (!value) {
    errors.push(`Missing required field: ${field}.`);
  }
  return value;
}

function readOptionalText(
  values: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = values[field];
  if (value === null || value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function readRequiredNumber(
  values: Readonly<Record<string, unknown>>,
  field: string,
  errors: string[],
): number | undefined {
  const value = values[field];
  if (value === null || value === undefined || String(value).trim() === "") {
    errors.push(`Missing required field: ${field}.`);
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${field} must be a finite number.`);
    return undefined;
  }
  return parsed;
}

function readOptionalBortleClass(
  values: Readonly<Record<string, unknown>>,
  field: string,
  errors: string[],
): number | undefined {
  const text = readOptionalText(values, field);
  if (text === undefined) {
    return undefined;
  }
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9) {
    errors.push(`${field} must be an integer from 1 to 9.`);
    return undefined;
  }
  return parsed;
}

function normalizeFormats(values: readonly string[]): readonly ReportFormat[] {
  if (values.length === 0) {
    return ["json", "csv", "markdown"];
  }
  const formats = new Set<ReportFormat>();
  for (const value of values.flatMap((item) => item.split(","))) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "all") {
      return ["json", "csv", "markdown"];
    }
    if (normalized === "json" || normalized === "csv" || normalized === "markdown") {
      formats.add(normalized);
      continue;
    }
    if (normalized === "md") {
      formats.add("markdown");
      continue;
    }
    throw new Error(`Unsupported --format value: ${value}`);
  }
  return [...formats];
}

function readPositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
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

function redactReference(
  reference: BortleCalibrationReference,
  redactNames: boolean,
): BortleCalibrationReference {
  return {
    ...reference,
    notes: redactNames ? undefined : reference.notes,
  };
}

function redactInvalidRow(row: BortleCalibrationInvalidRow): BortleCalibrationInvalidRow {
  return {
    rowNumber: row.rowNumber,
    id: row.id,
    errors: row.errors,
  };
}

function collectDatasetVersions(
  points: readonly BortleCalibrationPointReport[],
): readonly string[] {
  return [
    ...new Set(
      points
        .filter((point) => point.querySuccess)
        .map((point) =>
          point.datasetYear || point.datasetVersion
            ? `${point.datasetYear ?? "unknown-year"}/${point.datasetVersion ?? "unknown-version"}`
            : "missing-metadata",
        ),
    ),
  ].sort();
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

function listClasses(start: number, end: number): readonly number[] {
  const result: number[] = [];
  for (let value = start; value <= end; value += 1) {
    result.push(value);
  }
  return result;
}

function formatDistribution(distributionValue: Readonly<Record<string, number>>): string {
  const entries = Object.entries(distributionValue);
  if (entries.length === 0) {
    return "- n/a";
  }
  return entries.map(([label, count]) => `- ${label}: ${count}`).join("\n");
}

function formatDiagnosticGrouping(points: readonly BortleCalibrationPointReport[]): string {
  const groupedPoints = points.filter((point) => isInvestigationPoint(point));
  const groups = [
    {
      label: "ambient_risk_saturated_0",
      points: groupedPoints.filter((point) =>
        point.diagnostics.includes("ambient_risk_saturated_0"),
      ),
    },
    {
      label: "local_radiance_much_higher_than_surrounding_halo",
      points: groupedPoints.filter((point) =>
        point.diagnostics.includes("local_radiance_much_higher_than_surrounding_halo"),
      ),
    },
    {
      label: "surrounding_halo_much_higher_than_local_radiance",
      points: groupedPoints.filter((point) =>
        point.diagnostics.includes("surrounding_halo_much_higher_than_local_radiance"),
      ),
    },
    {
      label: "zero_or_near_zero_local_radiance",
      points: groupedPoints.filter((point) =>
        point.diagnostics.includes("zero_or_near_zero_local_radiance"),
      ),
    },
    {
      label: "estimated_below_reference",
      points: groupedPoints.filter((point) => point.rangeComparison?.estimateBelowReference),
    },
    {
      label: "estimated_above_reference",
      points: groupedPoints.filter((point) => point.rangeComparison?.estimateAboveReference),
    },
  ];
  const categoryGroups = groupPointIds(groupedPoints, (point) => point.category ?? "uncategorized");
  const estimatedBandGroups = groupPointIds(
    groupedPoints,
    (point) => point.estimatedBortleRangeLabel ?? "unavailable",
  );

  return [
    `- investigation_points: ${groupedPoints.length}${formatGroupedIds(groupedPoints)}`,
    ...groups.map(
      (group) => `- ${group.label}: ${group.points.length}${formatGroupedIds(group.points)}`,
    ),
    "- category:",
    formatGroupedDistribution(categoryGroups),
    "- estimated Bortle band:",
    formatGroupedDistribution(estimatedBandGroups),
  ].join("\n");
}

function isInvestigationPoint(point: BortleCalibrationPointReport): boolean {
  return (
    Boolean(point.rangeComparison && !point.rangeComparison.rangeOverlap) ||
    (point.rangeComparison?.classDistance ?? 0) > 1 ||
    Boolean(point.isAmbientRiskSaturated) ||
    Boolean(point.localAndHaloDifferByRatioThreshold) ||
    Boolean(
      point.isLocalRadianceZeroOrNearZero &&
        typeof point.estimatedBortleMin === "number" &&
        point.estimatedBortleMin <= 1,
    )
  );
}

function groupPointIds(
  points: readonly BortleCalibrationPointReport[],
  keyForPoint: (point: BortleCalibrationPointReport) => string,
): Readonly<Record<string, readonly string[]>> {
  const grouped = new Map<string, string[]>();
  for (const point of points) {
    const key = keyForPoint(point);
    grouped.set(key, [...(grouped.get(key) ?? []), point.id]);
  }
  return Object.fromEntries(
    [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function formatGroupedIds(points: readonly BortleCalibrationPointReport[]): string {
  return points.length > 0 ? ` (${points.map((point) => point.id).join(", ")})` : "";
}

function formatGroupedDistribution(grouped: Readonly<Record<string, readonly string[]>>): string {
  const entries = Object.entries(grouped);
  if (entries.length === 0) {
    return "  - n/a";
  }
  return entries
    .map(
      ([label, ids]) =>
        `  - ${label}: ${ids.length}${ids.length > 0 ? ` (${ids.join(", ")})` : ""}`,
    )
    .join("\n");
}

function formatMismatchTable(
  points: readonly BortleCalibrationPointReport[],
  includeCoordinates: boolean,
): string {
  const mismatches = points.filter(
    (point) => point.rangeComparison && !point.rangeComparison.rangeOverlap,
  );
  const coordinateHeader = includeCoordinates ? "| Lat | Lon " : "";
  const coordinateSeparator = includeCoordinates ? "| --- | --- " : "";
  const header = `| ID | Name | Category ${coordinateHeader}| Reference | Estimate | Distance | Bias | Diagnostics |`;
  const separator = `| --- | --- | --- ${coordinateSeparator}| --- | --- | --- | --- | --- |`;
  if (mismatches.length === 0) {
    return `${header}\n${separator}\n| n/a | n/a | n/a ${
      includeCoordinates ? "| n/a | n/a " : ""
    }| n/a | n/a | n/a | n/a | n/a |`;
  }
  return [
    header,
    separator,
    ...mismatches.map((point) => {
      const comparison = point.rangeComparison!;
      const bias = comparison.estimateBelowReference
        ? "estimate_below_reference"
        : comparison.estimateAboveReference
          ? "estimate_above_reference"
          : "none";
      const coordinates = includeCoordinates
        ? `| ${point.coordinates?.latitudeWgs84 ?? ""} | ${point.coordinates?.longitudeWgs84 ?? ""} `
        : "";
      return `| ${point.id} | ${point.name} | ${point.category ?? ""} ${coordinates}| ${formatReferenceRange(
        point.reference,
      )} | ${point.estimatedBortleRangeLabel ?? "unavailable"} | ${
        comparison.classDistance
      } | ${bias} | ${point.diagnostics.join("; ") || "none"} |`;
    }),
  ].join("\n");
}

function formatReferenceRange(reference: BortleCalibrationReference | undefined): string {
  return reference ? `${reference.minClass}-${reference.maxClass}` : "n/a";
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "n/a" : String(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
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

function formatInvalidRowLine(row: BortleCalibrationInvalidRow): string {
  return `invalid row ${row.rowNumber}${row.id ? ` id=${row.id}` : ""}: ${row.errors.join("; ")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
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

function usageText(): string {
  return [
    "Usage: pnpm bortle:calibrate -- --input deploy/calibration/reference.csv",
    "       pnpm bortle:calibrate -- --input refs.json --dry-run --strict",
    "Options: --output-dir --format json,csv,markdown --astro-service-url --timeout-ms --concurrency --strict --redact-names --include-coordinates --fail-on-query-error --dry-run",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runBortleCalibrationCli(process.argv.slice(2));
  process.exit(exitCode);
}
