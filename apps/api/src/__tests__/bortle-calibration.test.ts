import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { DirectionalLightPollutionRisk, LightPollutionInfo } from "@photo-weather/shared";
import { estimateBortleRangeForLightPollution } from "@photo-weather/scoring";
import { AstroServiceClientError } from "../astro-service-client.js";
import {
  buildBortleCalibrationReport,
  compareBortleRanges,
  formatBortleCalibrationCsv,
  formatBortleCalibrationMarkdown,
  insufficientBortleCalibrationEvidenceZh,
  parseBortleCalibrationArgs,
  parseBortleReferenceContent,
  runBortleCalibrationCli,
  validateBortleReferenceRows,
  type BortleCalibrationQueryClient,
  type BortleCalibrationReferencePoint,
} from "../scripts/bortle-calibration.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

const directionalRiskFixture: readonly DirectionalLightPollutionRisk[] = [
  directionRisk("north", "北", 0, 12),
  directionRisk("northeast", "东北", 45, 18),
  directionRisk("east", "东", 90, 24),
  directionRisk("southeast", "东南", 135, 30),
  directionRisk("south", "南", 180, 36),
  directionRisk("southwest", "西南", 225, 42),
  directionRisk("west", "西", 270, 48),
  directionRisk("northwest", "西北", 315, 54),
];

function directionRisk(
  direction: DirectionalLightPollutionRisk["direction"],
  label: string,
  azimuthDegrees: number,
  riskIndex: number,
): DirectionalLightPollutionRisk {
  return {
    direction,
    directionLabelZh: label,
    azimuthDegrees,
    radiance: riskIndex / 10,
    riskIndex,
    riskLevel: riskIndex < 20 ? "very_low" : riskIndex < 40 ? "low" : "medium",
    riskLevelLabelZh: riskIndex < 20 ? "极低" : riskIndex < 40 ? "低" : "中",
    sampleCount: 12,
    validSampleCount: 12,
  };
}

function lightPollutionFixture(overrides: Partial<LightPollutionInfo> = {}): LightPollutionInfo {
  const ambientRiskIndex = overrides.ambientRiskIndex ?? 35;
  return {
    available: true,
    dataAvailable: true,
    sourceCode: "eog_viirs",
    sourceLabel: "EOG VIIRS",
    datasetYear: 2024,
    datasetVersion: "test-v1",
    localRadiance: 0.4,
    localRadiancePercentile: 35,
    surroundingHaloRadiance: 1.1,
    ambientRiskIndex,
    ambientRiskLevel:
      ambientRiskIndex < 20
        ? "very_low"
        : ambientRiskIndex < 40
          ? "low"
          : ambientRiskIndex < 60
            ? "medium"
            : ambientRiskIndex < 80
              ? "high"
              : "very_high",
    ambientRiskLevelLabelZh:
      ambientRiskIndex < 20
        ? "极低"
        : ambientRiskIndex < 40
          ? "低"
          : ambientRiskIndex < 60
            ? "中"
            : ambientRiskIndex < 80
              ? "高"
              : "很高",
    directionalRisk: directionalRiskFixture,
    confidence: "high",
    sampleCount: 96,
    validSampleCount: 96,
    calculationBasis: {
      samplingConfigVersion: "satellite-night-light-v1",
      coordinateSystem: "WGS84",
      distancesKm: [5, 15, 30, 60],
      distanceWeights: { local: 0.45, "5km": 0.22, "15km": 0.16, "30km": 0.11, "60km": 0.06 },
      localNeighborhoodKm: [0, 0.5, 1.5],
      directionSectorsDegrees: 45,
      quantileBasis: "adaptive_positive_log_radiance_quantiles",
      scoringMode: "heuristic",
      nonSqmBortleNoticeZh: "该结果为卫星夜光参考，不是现场SQM实测，也不代表测量Bortle等级。",
    },
    lightPollutionNoteZh: "卫星夜光参考：环境光污染低。",
    starPenalty: 7,
    milkyWayPenalty: 12,
    scoringMode: "heuristic",
    ...overrides,
  };
}

function row(
  id: string,
  latitudeWgs84: number,
  referenceMin = 3,
  referenceMax = 4,
  category = "rural",
): BortleCalibrationReferencePoint {
  return {
    rowNumber: Number(id.replace(/\D/g, "")) || 1,
    id,
    name: `Private ${id}`,
    latitudeWgs84,
    longitudeWgs84: 110,
    category,
    reference: {
      minClass: referenceMin,
      maxClass: referenceMax,
      source: "independent observation",
      notes: `private note ${id}`,
    },
  };
}

function mockClientFor(lightPollution: LightPollutionInfo): BortleCalibrationQueryClient {
  return {
    queryLightPollution: vi.fn(async () => lightPollution),
  };
}

function defaultOptions() {
  return parseBortleCalibrationArgs(["--input", "reference.csv"], {
    ASTRO_SERVICE_URL: "http://astro-service:4100",
  } as NodeJS.ProcessEnv);
}

describe("Bortle calibration input validation", () => {
  it("accepts valid CSV and JSON references with blank optional references", () => {
    const csvRows = parseBortleReferenceContent(
      [
        "id,name,latitudeWgs84,longitudeWgs84,category,referenceBortleMin,referenceBortleMax,referenceSource,referenceObservedAt,referenceConfidence,notes",
        "a,Alpha,31.1,121.2,urban,6,8,field log,2026-01-01,medium,clear",
        "b,Bravo,30,120,rural,,,,,,",
      ].join("\n"),
      "reference.csv",
    );
    const csvValidation = validateBortleReferenceRows(csvRows);

    expect(csvValidation.invalidRows).toEqual([]);
    expect(csvValidation.validRows).toHaveLength(2);
    expect(csvValidation.validRows[0]?.reference).toMatchObject({ minClass: 6, maxClass: 8 });
    expect(csvValidation.validRows[1]?.reference).toBeUndefined();

    const jsonRows = parseBortleReferenceContent(
      JSON.stringify({
        references: [
          {
            id: "json-a",
            name: "Json Alpha",
            latitudeWgs84: 1,
            longitudeWgs84: 2,
            referenceBortleMin: 2,
            referenceBortleMax: 3,
          },
        ],
      }),
      "reference.json",
    );

    expect(validateBortleReferenceRows(jsonRows).validRows[0]).toMatchObject({
      id: "json-a",
      reference: { minClass: 2, maxClass: 3 },
    });
  });

  it.each([
    ["invalid latitude", "id,name,latitudeWgs84,longitudeWgs84\na,Alpha,91,120", "latitudeWgs84"],
    ["invalid longitude", "id,name,latitudeWgs84,longitudeWgs84\na,Alpha,31,-181", "longitudeWgs84"],
    [
      "invalid Bortle class",
      "id,name,latitudeWgs84,longitudeWgs84,referenceBortleMin,referenceBortleMax\na,Alpha,31,120,0,3",
      "referenceBortleMin",
    ],
    [
      "minimum greater than maximum",
      "id,name,latitudeWgs84,longitudeWgs84,referenceBortleMin,referenceBortleMax\na,Alpha,31,120,5,3",
      "must not exceed",
    ],
    ["missing required field", "id,latitudeWgs84,longitudeWgs84\na,31,120", "name"],
    ["malformed extra column", "id,name,latitudeWgs84,longitudeWgs84\na,Alpha,31,120,extra", "more columns"],
  ])("rejects %s", (_caseName, csv, expectedError) => {
    const result = validateBortleReferenceRows(parseBortleReferenceContent(csv, "reference.csv"));

    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows[0]?.errors.join("\n")).toContain(expectedError);
  });

  it("rejects duplicate IDs and supports strict/non-strict dry-run behavior", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "bortle-calibration-"));
    const inputPath = path.join(tempDir, "reference.csv");
    writeFileSync(
      inputPath,
      "id,name,latitudeWgs84,longitudeWgs84\ndup,Alpha,31,120\ndup,Bravo,32,121\n",
      "utf8",
    );

    try {
      const nonStrictOutput: string[] = [];
      const strictOutput: string[] = [];
      const client = { queryLightPollution: vi.fn() };

      await expect(
        runBortleCalibrationCli(
          ["--input", inputPath, "--dry-run"],
          (text) => nonStrictOutput.push(text),
          () => undefined,
          { client },
        ),
      ).resolves.toBe(0);
      await expect(
        runBortleCalibrationCli(
          ["--input", inputPath, "--dry-run", "--strict"],
          (text) => strictOutput.push(text),
          () => undefined,
          { client },
        ),
      ).resolves.toBe(1);

      expect(nonStrictOutput.join("\n")).toContain("invalid rows: 2");
      expect(strictOutput.join("\n")).toContain("planned query count: 0");
      expect(client.queryLightPollution).not.toHaveBeenCalled();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Bortle range comparison", () => {
  it.each([
    [{ minClass: 3, maxClass: 4, available: true }, [3, 4], true, 0, false, false, true],
    [{ minClass: 3, maxClass: 5, available: true }, [4, 6], true, 0, false, false, false],
    [{ minClass: 2, maxClass: 3, available: true }, [4, 5], false, 1, true, false, false],
    [{ minClass: 1, maxClass: 2, available: true }, [4, 5], false, 2, true, false, false],
    [{ minClass: 6, maxClass: 7, available: true }, [3, 4], false, 2, false, true, false],
  ] as const)(
    "compares estimate %j against reference %j",
    (estimate, referenceRange, rangeOverlap, classDistance, below, above, exact) => {
      const comparison = compareBortleRanges(estimate, {
        minClass: referenceRange[0],
        maxClass: referenceRange[1],
      });

      expect(comparison).toMatchObject({
        rangeOverlap,
        classDistance,
        estimateBelowReference: below,
        estimateAboveReference: above,
        exactRangeMatch: exact,
        acceptableAdjacentMatch: classDistance <= 1,
      });
    },
  );

  it("skips comparison when the estimate is unavailable or reference is missing", async () => {
    expect(
      compareBortleRanges({ available: false }, { minClass: 1, maxClass: 2 }),
    ).toBeNull();

    const report = await buildBortleCalibrationReport({
      options: defaultOptions(),
      rows: [{ ...row("no-ref", 1), reference: undefined }],
      invalidRows: [],
      totalInputRows: 1,
      client: mockClientFor(lightPollutionFixture()),
      timestamp: "2026-06-10T00:00:00.000Z",
    });

    expect(report.points[0]?.rangeComparison).toBeUndefined();
    expect(report.summary.pointsWithReferences).toBe(0);
  });
});

describe("Bortle calibration reporting", () => {
  it("renders deterministic JSON, CSV, Markdown, redacted names, hidden coordinates, and insufficient evidence", async () => {
    const report = await buildBortleCalibrationReport({
      options: { ...defaultOptions(), redactNames: true },
      rows: [row("private-1", 1, 1, 2, "protected_dark_site"), row("private-2", 2, 8, 9, "urban")],
      invalidRows: [{ rowNumber: 5, id: "bad", errors: ["invalid latitude"] }],
      totalInputRows: 3,
      client: mockClientFor(lightPollutionFixture({ ambientRiskIndex: 35 })),
      timestamp: "2026-06-10T00:00:00.000Z",
    });
    const json = JSON.stringify(report);
    const csv = formatBortleCalibrationCsv(report);
    const markdown = formatBortleCalibrationMarkdown(report);

    expect(report.points.map((point) => point.id)).toEqual(["private-1", "private-2"]);
    expect(report.points[0]).toMatchObject({ name: "private-1" });
    expect(report.points[0]?.coordinates).toBeUndefined();
    expect(report.points[0]?.reference?.notes).toBeUndefined();
    expect(json).not.toContain("Private private-1");
    expect(json).not.toContain("private note");
    expect(csv.split("\n")[0]).not.toContain("latitudeWgs84");
    expect(markdown).toContain("Run timestamp: 2026-06-10T00:00:00.000Z");
    expect(markdown).toContain("Detailed Mismatch Table");
    expect(markdown).toContain(insufficientBortleCalibrationEvidenceZh);
    expect(report.recommendation.action).toBe("investigate_specific_mismatches");
  });

  it("allows threshold-review recommendations only when the minimum evidence gate is met", async () => {
    const categories = ["dense_urban", "suburban", "rural", "protected_dark_site"];
    const rows = Array.from({ length: 32 }, (_, index) =>
      row(`p${index + 1}`, index, 3, 4, categories[index % categories.length]!),
    );

    const report = await buildBortleCalibrationReport({
      options: defaultOptions(),
      rows,
      invalidRows: [],
      totalInputRows: rows.length,
      client: mockClientFor(lightPollutionFixture({ ambientRiskIndex: 95 })),
      timestamp: "2026-06-10T00:00:00.000Z",
    });

    expect(report.summary.comparedReferencePoints).toBe(32);
    expect(report.summary.highConfidenceRasterRatio).toBe(1);
    expect(report.recommendation).toMatchObject({
      action: "consider_threshold_review",
      evidenceSufficientForThresholdReview: true,
    });
    expect(report.recommendation.messageZh).not.toContain(insufficientBortleCalibrationEvidenceZh);
  });

  it("writes selected output formats to the gitignored runtime directory", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "bortle-calibration-"));
    const runtimeDir = path.join(tempDir, "deploy", "calibration", "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    const inputPath = path.join(runtimeDir, "reference.csv");
    writeFileSync(
      inputPath,
      "id,name,latitudeWgs84,longitudeWgs84,referenceBortleMin,referenceBortleMax\np1,Private,1,2,3,4\n",
      "utf8",
    );

    try {
      const output: string[] = [];
      const exitCode = await runBortleCalibrationCli(
        [
          "--input",
          inputPath,
          "--output-dir",
          runtimeDir,
          "--format",
          "json,markdown",
          "--redact-names",
        ],
        (text) => output.push(text),
        () => undefined,
        {
          client: mockClientFor(lightPollutionFixture({ ambientRiskIndex: 35 })),
          now: () => new Date("2026-06-10T00:00:00.000Z"),
        },
      );

      expect(exitCode).toBe(0);
      expect(output.join("\n")).toContain("wrote:");
      expect(readFileSync(path.join(runtimeDir, "bortle-calibration-2026-06-10T00-00-00-000Z.json"), "utf8")).toContain(
        '"redactedNames": true',
      );
      expect(readFileSync(path.join(runtimeDir, "bortle-calibration-2026-06-10T00-00-00-000Z.md"), "utf8")).toContain(
        "Estimated Bortle Calibration Audit",
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Bortle calibration query behavior", () => {
  it("handles success, retryable HTTP 500, timeout, unavailable data, insufficient calibration, saturation, and missing metadata", async () => {
    const attemptsByLatitude = new Map<number, number>();
    const client: BortleCalibrationQueryClient = {
      queryLightPollution: vi.fn(async (input) => {
        const attempts = attemptsByLatitude.get(input.latitudeWgs84) ?? 0;
        attemptsByLatitude.set(input.latitudeWgs84, attempts + 1);
        if (input.latitudeWgs84 === 2 && attempts === 0) {
          throw new AstroServiceClientError("unavailable", "service unavailable", {
            url: "http://astro-service:4100/light-pollution/query",
            status: 500,
            timedOut: false,
          });
        }
        if (input.latitudeWgs84 === 3) {
          throw new AstroServiceClientError("timeout", "timeout", {
            url: "http://astro-service:4100/light-pollution/query",
            timedOut: true,
          });
        }
        if (input.latitudeWgs84 === 4) {
          return lightPollutionFixture({
            available: false,
            dataAvailable: false,
            unavailableReason: "outside_dataset_bounds",
            ambientRiskIndex: null,
            ambientRiskLevel: "insufficient",
            ambientRiskLevelLabelZh: "数据不足",
            confidence: "low",
            validSampleCount: 0,
          });
        }
        if (input.latitudeWgs84 === 5) {
          return lightPollutionFixture({
            ambientRiskIndex: null,
            ambientRiskLevel: "insufficient",
            ambientRiskLevelLabelZh: "数据不足",
            confidence: "low",
            validSampleCount: 12,
          });
        }
        if (input.latitudeWgs84 === 6) {
          return lightPollutionFixture({ ambientRiskIndex: 0, localRadiance: 10, surroundingHaloRadiance: 1 });
        }
        if (input.latitudeWgs84 === 7) {
          return lightPollutionFixture({ ambientRiskIndex: 100, localRadiance: 1, surroundingHaloRadiance: 10 });
        }
        if (input.latitudeWgs84 === 8) {
          return lightPollutionFixture({
            sourceCode: null,
            sourceLabel: null,
            datasetYear: null,
            datasetVersion: null,
          });
        }
        return lightPollutionFixture({ ambientRiskIndex: 35 });
      }),
    };
    const rows = [
      row("success", 1),
      row("retry", 2),
      row("timeout", 3),
      row("unavailable", 4),
      row("insufficient", 5),
      row("zero-risk", 6),
      row("hundred-risk", 7),
      row("missing-meta", 8),
    ];

    const report = await buildBortleCalibrationReport({
      options: { ...defaultOptions(), concurrency: 3 },
      rows,
      invalidRows: [],
      totalInputRows: rows.length,
      client,
      timestamp: "2026-06-10T00:00:00.000Z",
    });

    expect(report.summary.querySuccesses).toBe(7);
    expect(report.summary.queryFailures).toBe(1);
    expect(report.summary.queryRetries).toBe(3);
    expect(report.points.find((point) => point.id === "retry")?.queryRetries).toBe(1);
    expect(report.points.find((point) => point.id === "timeout")?.queryFailure?.kind).toBe(
      "timeout",
    );
    expect(report.points.find((point) => point.id === "unavailable")?.diagnostics).toEqual(
      expect.arrayContaining(["outside_dataset_bounds", "zero_valid_samples"]),
    );
    expect(report.points.find((point) => point.id === "insufficient")?.diagnostics).toContain(
      "unusually_low_valid_sample_count",
    );
    expect(report.points.find((point) => point.id === "zero-risk")?.diagnostics).toEqual(
      expect.arrayContaining([
        "ambient_risk_saturated_0",
        "local_radiance_much_higher_than_surrounding_halo",
      ]),
    );
    expect(report.points.find((point) => point.id === "hundred-risk")?.diagnostics).toEqual(
      expect.arrayContaining([
        "ambient_risk_saturated_100",
        "surrounding_halo_much_higher_than_local_radiance",
      ]),
    );
    expect(report.points.find((point) => point.id === "missing-meta")?.diagnostics).toContain(
      "missing_dataset_metadata",
    );
  });

  it("returns a non-zero CLI exit when fail-on-query-error is enabled", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "bortle-calibration-"));
    const inputPath = path.join(tempDir, "reference.csv");
    writeFileSync(
      inputPath,
      "id,name,latitudeWgs84,longitudeWgs84\np1,Private,1,2\n",
      "utf8",
    );

    try {
      const exitCode = await runBortleCalibrationCli(
        ["--input", inputPath, "--output-dir", tempDir, "--fail-on-query-error"],
        () => undefined,
        () => undefined,
        {
          client: {
            queryLightPollution: vi.fn(async () => {
              throw new Error("fetch failed");
            }),
          },
          now: () => new Date("2026-06-10T00:00:00.000Z"),
        },
      );

      expect(exitCode).toBe(1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Bortle calibration estimator consistency", () => {
  it("uses the canonical production estimator and does not copy the threshold table into the CLI", async () => {
    const lightPollution = lightPollutionFixture({ ambientRiskIndex: 73 });
    const canonical = estimateBortleRangeForLightPollution(lightPollution);
    const report = await buildBortleCalibrationReport({
      options: defaultOptions(),
      rows: [row("p1", 1, 6, 7)],
      invalidRows: [],
      totalInputRows: 1,
      client: mockClientFor(lightPollution),
      timestamp: "2026-06-10T00:00:00.000Z",
    });
    const source = readFileSync(
      path.join(repoRoot, "apps/api/src/scripts/bortle-calibration.ts"),
      "utf8",
    );

    expect(report.points[0]).toMatchObject({
      estimatedBortleMin: canonical.minClass,
      estimatedBortleMax: canonical.maxClass,
      estimatedBortleRangeLabel: canonical.rangeLabelZh,
      estimatorMethodVersion: canonical.methodVersion,
    });
    expect(source).toContain("estimateBortleRangeForLightPollution");
    expect(source).not.toContain("maxRiskIndex");
    expect(source).not.toContain("0–14");
  });

  it("wires package commands and keeps generated reports ignored", () => {
    const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const apiPackage = JSON.parse(
      readFileSync(path.join(repoRoot, "apps/api/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8");

    expect(rootPackage.scripts["bortle:calibrate"]).toBe(
      "pnpm --filter @photo-weather/api bortle:calibrate",
    );
    expect(apiPackage.scripts["bortle:calibrate"]).toBe(
      "tsx src/scripts/bortle-calibration.ts",
    );
    expect(gitignore).toContain("deploy/calibration/runtime/*");
    expect(gitignore).toContain("!deploy/calibration/runtime/.gitkeep");
  });
});
