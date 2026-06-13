import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { DirectionalLightPollutionRisk, LightPollutionInfo, SkyBrightnessInfo } from "@photo-weather/shared";
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
import {
  buildBortleCandidateAnalysis,
  buildBortleMismatchReport,
  formatBortleCandidateAnalysisMarkdown,
  formatBortleMismatchCsv,
} from "../scripts/bortle-candidate-analysis.js";
import {
  buildNationalSkyDarknessBenchmarkReport,
  formatNationalSkyDarknessBenchmarkMarkdown,
} from "../scripts/national-sky-darkness-benchmark.js";
import {
  buildSkyDarknessDiagnosticReport,
  parseSkyDarknessDiagnosticArgs,
  runSkyDarknessDiagnosticCli,
  type SkyDarknessDiagnosticClient,
} from "../scripts/diagnose-sky-darkness.js";

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

function mockClientByLatitude(
  lightPollutionByLatitude: Readonly<Record<number, LightPollutionInfo>>,
): BortleCalibrationQueryClient {
  return {
    queryLightPollution: vi.fn(async (input) => {
      const lightPollution = lightPollutionByLatitude[input.latitudeWgs84];
      if (!lightPollution) {
        throw new Error(`missing fixture for latitude ${input.latitudeWgs84}`);
      }
      return lightPollution;
    }),
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
    [
      "invalid longitude",
      "id,name,latitudeWgs84,longitudeWgs84\na,Alpha,31,-181",
      "longitudeWgs84",
    ],
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
    [
      "malformed extra column",
      "id,name,latitudeWgs84,longitudeWgs84\na,Alpha,31,120,extra",
      "more columns",
    ],
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
    expect(compareBortleRanges({ available: false }, { minClass: 1, maxClass: 2 })).toBeNull();

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
  it("renders deterministic JSON, CSV, Markdown, redacted names, raw diagnostics, and insufficient evidence", async () => {
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
    expect(report.points[0]).toMatchObject({
      latitudeWgs84: 1,
      longitudeWgs84: 110,
      referenceBortleMin: 1,
      referenceBortleMax: 2,
      localRadiance: 0.4,
      surroundingHaloRadiance: 1.1,
      localToHaloRatio: 0.364,
      haloToLocalRatio: 2.75,
      rasterQueryConfidence: "high",
      rangeDistance: 1,
      rangeOverlap: false,
      biasDirection: "estimate_above_reference",
      isLocalRadianceZeroOrNearZero: false,
      isAmbientRiskSaturated: false,
    });
    expect(report.points[0]?.reference?.notes).toBeUndefined();
    expect(json).not.toContain("Private private-1");
    expect(json).not.toContain("private note");
    expect(csv.split("\n")[0]).toContain("latitudeWgs84");
    expect(csv.split("\n")[0]).toContain("localToHaloRatio");
    expect(markdown).toContain("Run timestamp: 2026-06-10T00:00:00.000Z");
    expect(markdown).toContain("Detailed Mismatch Table");
    expect(markdown).toContain("Diagnostic Grouping");
    expect(markdown).toContain(insufficientBortleCalibrationEvidenceZh);
    expect(report.recommendation.action).toBe("investigate_specific_mismatches");
  });

  it("allows threshold-review recommendations only when the stricter evidence gate is met", async () => {
    const categories = ["dense_urban", "suburban", "rural", "protected_dark_site", "town"];
    const rows = Array.from({ length: 50 }, (_, index) =>
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

    expect(report.summary.comparedReferencePoints).toBe(50);
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
      expect(
        readFileSync(
          path.join(runtimeDir, "bortle-calibration-2026-06-10T00-00-00-000Z.json"),
          "utf8",
        ),
      ).toContain('"redactedNames": true');
      expect(
        readFileSync(
          path.join(runtimeDir, "bortle-calibration-2026-06-10T00-00-00-000Z.md"),
          "utf8",
        ),
      ).toContain("Estimated Bortle Calibration Audit");
      expect(
        readFileSync(
          path.join(runtimeDir, "bortle-calibration-2026-06-10T00-00-00-000Z-mismatches.csv"),
          "utf8",
        ),
      ).toContain("mismatchReasons");
      expect(
        JSON.parse(
          readFileSync(
            path.join(runtimeDir, "bortle-calibration-2026-06-10T00-00-00-000Z-mismatches.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({ run: { auditOnly: true } });
      expect(
        JSON.parse(
          readFileSync(
            path.join(
              runtimeDir,
              "bortle-calibration-2026-06-10T00-00-00-000Z-candidate-analysis.json",
            ),
            "utf8",
          ),
        ),
      ).toMatchObject({ run: { auditOnly: true, deterministic: true } });
      expect(
        readFileSync(
          path.join(
            runtimeDir,
            "bortle-calibration-2026-06-10T00-00-00-000Z-candidate-analysis.md",
          ),
          "utf8",
        ),
      ).toContain("Bortle Calibration Candidate Analysis");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("Bortle mismatch investigation diagnostics", () => {
  it("surfaces zero-radiance, halo, high-radiance, and saturation diagnostics without frontend exposure", async () => {
    const rows = [
      row("zero-local-halo", 10, 4, 5, "rural"),
      row("zero-local-zero-halo", 11, 1, 2, "astronomy_dark_site"),
      row("low-local-city-halo", 12, 5, 6, "suburban"),
      row("high-local", 13, 8, 9, "dense_urban"),
    ];
    const report = await buildBortleCalibrationReport({
      options: defaultOptions(),
      rows,
      invalidRows: [],
      totalInputRows: rows.length,
      client: mockClientByLatitude({
        10: lightPollutionFixture({
          ambientRiskIndex: 5,
          localRadiance: 0,
          surroundingHaloRadiance: 20,
        }),
        11: lightPollutionFixture({
          ambientRiskIndex: 0,
          localRadiance: 0,
          surroundingHaloRadiance: 0,
        }),
        12: lightPollutionFixture({
          ambientRiskIndex: 8,
          localRadiance: 0.0005,
          surroundingHaloRadiance: 80,
        }),
        13: lightPollutionFixture({
          ambientRiskIndex: 100,
          localRadiance: 120,
          surroundingHaloRadiance: 1,
        }),
      }),
      timestamp: "2026-06-10T00:00:00.000Z",
    });

    const zeroLocalHalo = report.points.find((point) => point.id === "zero-local-halo");
    const zeroZero = report.points.find((point) => point.id === "zero-local-zero-halo");
    const lowLocalCityHalo = report.points.find((point) => point.id === "low-local-city-halo");
    const highLocal = report.points.find((point) => point.id === "high-local");

    expect(zeroLocalHalo).toMatchObject({
      isLocalRadianceZeroOrNearZero: true,
      localToHaloRatio: 0,
      haloToLocalRatio: null,
      localAndHaloDifferByRatioThreshold: true,
    });
    expect(zeroLocalHalo?.diagnostics).toEqual(
      expect.arrayContaining([
        "zero_or_near_zero_local_radiance",
        "surrounding_halo_much_higher_than_local_radiance",
      ]),
    );
    expect(zeroZero).toMatchObject({
      isLocalRadianceZeroOrNearZero: true,
      isAmbientRiskSaturated: true,
      localToHaloRatio: 1,
      haloToLocalRatio: 1,
    });
    expect(zeroZero?.diagnostics).toEqual(
      expect.arrayContaining(["ambient_risk_saturated_0", "zero_or_near_zero_local_radiance"]),
    );
    expect(lowLocalCityHalo).toMatchObject({
      isLocalRadianceZeroOrNearZero: true,
      localAndHaloDifferByRatioThreshold: true,
    });
    expect(highLocal).toMatchObject({
      isAmbientRiskSaturated: true,
      localAndHaloDifferByRatioThreshold: true,
    });
    expect(highLocal?.diagnostics).toEqual(
      expect.arrayContaining([
        "ambient_risk_saturated_100",
        "local_radiance_much_higher_than_surrounding_halo",
      ]),
    );

    const mismatchReport = buildBortleMismatchReport(report);
    expect(mismatchReport.summary.reasonDistribution).toMatchObject({
      ambient_risk_saturated: 2,
      suspicious_local_halo_ratio: 3,
      zero_or_near_zero_local_radiance_estimated_bortle_1: 3,
    });
    expect(formatBortleMismatchCsv(mismatchReport)).toContain("haloToLocalRatio");
  });
});

describe("Bortle candidate simulation", () => {
  it("builds deterministic global monotonic candidates without category-specific mappings", async () => {
    const categories = [
      "dense_urban",
      "suburban",
      "town",
      "rural",
      "mountain",
      "astronomy_dark_site",
      "coastal",
      "plain",
    ];
    const rows = categories.map((category, index) =>
      row(
        `candidate-${index + 1}`,
        index + 20,
        Math.min(index + 1, 8),
        Math.min(index + 2, 9),
        category,
      ),
    );
    const lightPollutionByLatitude = Object.fromEntries(
      rows.map((referenceRow, index) => {
        const risk = index * 12 + 4;
        return [
          referenceRow.latitudeWgs84,
          lightPollutionFixture({
            ambientRiskIndex: risk,
            localRadiance: index === 0 ? 0 : index * 0.8 + 0.1,
            surroundingHaloRadiance: index === 0 ? 10 : index * 1.4 + 0.2,
          }),
        ];
      }),
    );
    const report = await buildBortleCalibrationReport({
      options: defaultOptions(),
      rows,
      invalidRows: [],
      totalInputRows: rows.length,
      client: mockClientByLatitude(lightPollutionByLatitude),
      timestamp: "2026-06-10T00:00:00.000Z",
    });

    const first = buildBortleCandidateAnalysis(report);
    const second = buildBortleCandidateAnalysis(report);
    const markdown = formatBortleCandidateAnalysisMarkdown(first);

    expect(second).toEqual(first);
    expect(first.currentMapping.crossValidation).toMatchObject({
      mode: "fixed_current_mapping",
      deterministic: true,
      foldCount: rows.length,
    });
    expect(first.candidates).toHaveLength(2);
    for (const candidate of first.candidates) {
      expect(candidate.crossValidation).toMatchObject({
        mode: "leave_one_out",
        deterministic: true,
        foldCount: rows.length,
      });
      expect(candidate.usesLocationSpecificRules).toBe(false);
      expect(candidate.usesCategorySpecificMapping).toBe(false);
      expect(candidate.mappingMonotonic).toBe(true);
      expect(candidate.thresholdMapping).toHaveLength(7);
      expect(
        candidate.thresholdMapping.every(
          (threshold, index, thresholds) =>
            index === 0 ||
            threshold.maxCompositeRiskScore > thresholds[index - 1]!.maxCompositeRiskScore,
        ),
      ).toBe(true);
    }
    expect(first.recommendation).toMatchObject({
      action: expect.stringMatching(/collect_more_references|investigate_specific_mismatches/),
      productionDeploymentRecommended: false,
      automaticActivationAllowed: false,
    });
    expect(
      first.candidates[0]?.evidenceSufficiency.find(
        (rule) => rule.id === "at_least_50_valid_reference_locations",
      )?.passed,
    ).toBe(false);
    expect(markdown).toContain("Tianwentong screenshots");
    expect(markdown).toContain("Uses category-specific mapping: false");
  });
});

describe("National sky darkness benchmark QA", () => {
  it("reports over-optimistic public errors without generating production rules", async () => {
    const rows = [
      row("optimistic", 21, 6, 7, "audit_dark_reference"),
      row("conservative", 22, 6, 7, "audit_bright_reference"),
    ];
    const report = await buildNationalSkyDarknessBenchmarkReport({
      options: defaultOptions(),
      rows,
      invalidRows: [],
      totalInputRows: rows.length,
      client: mockClientByLatitude({
        21: lightPollutionFixture({
          ambientRiskIndex: 5,
          localRadiance: 0,
          surroundingHaloRadiance: 20,
        }),
        22: lightPollutionFixture({
          ambientRiskIndex: 95,
          localRadiance: 60,
          surroundingHaloRadiance: 80,
        }),
      }),
      timestamp: "2026-06-10T00:00:00.000Z",
    });
    const markdown = formatNationalSkyDarknessBenchmarkMarkdown(report);
    const optimistic = report.points.find((point) => point.id === "optimistic");

    expect(report.run).toMatchObject({
      auditOnly: true,
      productionRulesGenerated: false,
      toolVersion: "national-sky-darkness-benchmark-v1",
    });
    expect(report.summary).toMatchObject({
      overOptimisticErrors: 1,
      overConservativeErrors: 1,
      tooWideOutputs: 0,
      benchmarkLikeFourPlusDisplayedAsVeryDark: 0,
      errorsGreaterThanOneClass: 1,
      finalQaRecommendation: "fail_investigate_over_optimism",
    });
    expect(optimistic).toMatchObject({
      publicBortleRangeLabel: "2–4级（保守参考）",
      overOptimisticError: true,
    });
    expect(optimistic?.diagnostics).toEqual(
      expect.arrayContaining([
        "urban_skyglow_spillover_risk",
        "over_optimistic_public_range",
      ]),
    );
    expect(markdown).toContain("Production rules generated: false");
    expect(markdown).toContain("Too-wide public outputs: 0");
    expect(markdown).toContain("does not write thresholds, location rules, coordinate rules");
  });
});

describe("Sky darkness coordinate diagnostic", () => {
  it("parses coordinate diagnostics and reports WA, VIIRS, fused range, and local-only policy", async () => {
    const options = parseSkyDarknessDiagnosticArgs(
      ["--coordinate", "35.1,112.2", "--azimuth", "135", "--label", "qa", "--json"],
      { ASTRO_SERVICE_URL: "http://127.0.0.1:4100" } as NodeJS.ProcessEnv,
    );
    const client: SkyDarknessDiagnosticClient = {
      queryLightPollution: vi.fn(async () =>
        lightPollutionFixture({
          localRadiance: 0.2,
          surroundingHaloRadiance: 0.5,
          ambientRiskIndex: 32,
        }),
      ),
      querySkyBrightness: vi.fn(async (): Promise<SkyBrightnessInfo> => ({
        available: true,
        dataAvailable: true,
        datasetName: "Synthetic WA",
        datasetYear: 2015,
        datasetVersion: "WA2015-Falchi2016-v1.1",
        checksumShort: "abc123",
        valueType: "artificial_brightness_mcd_m2",
        rawValue: 0.35,
        valueUnit: "mcd/m^2",
        artificialBrightness: 0.35,
        naturalSkyBrightnessMcdM2: 0.174,
        modeledTotalSkyBrightnessMcdM2: 0.524,
        modeledSqm: 20.8,
        estimatedBortleRange: {
          available: true,
          minClass: 3,
          maxClass: 4,
          rangeLabelZh: "3-4",
          confidence: "low",
          basisZh: "Modeled, not measured.",
          methodVersion: "wa-modeled-sqm-v1",
        },
        confidence: "low",
        diagnostics: {
          healthStatus: "available",
          metadataExists: true,
          datasetExists: true,
          sampleCount: 1,
          validSampleCount: 1,
          conversionNotes: ["artificial plus natural baseline"],
          uncertaintyNotes: ["modeled, not measured"],
        },
      })),
      queryTerrainDemProfile: vi.fn(async () => ({
        available: true,
        dataAvailable: true,
        sourceName: "Synthetic DEM",
        datasetName: "Synthetic terrain DEM",
        datasetYear: 2026,
        datasetVersion: "test-dem-v1",
        checksumShort: "dem123",
        observerElevationMeters: 1860,
        observerElevationSource: "dem" as const,
        target: "milky_way" as const,
        targetAzimuthDegrees: 135,
        targetAltitudeDegrees: null,
        horizonAltitudeDegrees: 4.2,
        obstructionClearanceDegrees: 16.8,
        obstructionLevel: "clear" as const,
        confidence: "high" as const,
        sampleCount: 120,
        validSampleCount: 118,
        maxSampleDistanceMeters: 30000,
        maxObstructionSample: null,
        profileSamples: [],
        calculationBasis: null,
        demCoverage: {
          status: "available" as const,
          coveredByActiveDataset: true,
          tileFileExists: true,
          tileMetadataExists: true,
          sourceName: "Synthetic DEM",
          datasetName: "Synthetic terrain DEM",
          datasetVersion: "test-dem-v1",
          datasetYear: 2026,
          resolutionMeters: 90,
          noteZh: "DEM 覆盖该坐标。",
        },
        terrainHorizonNoteZh: "银河方向地形遮挡较低。",
        queryElapsedMs: 1,
        cacheHit: false,
      })),
    };

    const report = await buildSkyDarknessDiagnosticReport(options, client, {
      now: () => new Date("2026-06-13T00:00:00.000Z"),
    });

    expect(report.run).toMatchObject({
      toolVersion: "sky-darkness-diagnostic-v1",
      localDatasetOnly: true,
      externalNetworkCalls: false,
    });
    expect(report.coordinate).toMatchObject({ latitudeWgs84: 35.1, longitudeWgs84: 112.2, label: "qa" });
    expect(report.wa).toMatchObject({
      available: true,
      valueType: "artificial_brightness_mcd_m2",
      rawValue: 0.35,
      artificialBrightness: 0.35,
      naturalSkyBrightnessMcdM2: 0.174,
      modeledTotalSkyBrightnessMcdM2: 0.524,
      modeledSqm: 20.8,
      datasetVersion: "WA2015-Falchi2016-v1.1",
    });
    expect(report.viirs.localRadiance).toBe(0.2);
    expect(report.fusedPublicBortleRange.available).toBe(true);
    expect(report.publicLabel).toEqual(expect.any(String));
    expect(report.diagnostics).toEqual(expect.arrayContaining(["wa_model_baseline_available"]));
    expect(report.dem).toMatchObject({
      queried: true,
      available: true,
      status: "available",
      horizonAltitudeDegrees: 4.2,
      obstructionClearanceDegrees: 16.8,
      confidence: "high",
      datasetVersion: "test-dem-v1",
    });
    expect(client.queryLightPollution).toHaveBeenCalledTimes(1);
    expect(client.querySkyBrightness).toHaveBeenCalledTimes(1);
    expect(client.queryTerrainDemProfile).toHaveBeenCalledTimes(1);
  });

  it("runs the JSON CLI with an injected client without external network access", async () => {
    const output: string[] = [];
    const client: SkyDarknessDiagnosticClient = {
      queryLightPollution: vi.fn(async () => lightPollutionFixture()),
      querySkyBrightness: vi.fn(async () => null),
    };

    await expect(
      runSkyDarknessDiagnosticCli(
        ["--coordinate", "35.1,112.2", "--json"],
        (text) => output.push(text),
        () => undefined,
        {
          client,
          now: () => new Date("2026-06-13T00:00:00.000Z"),
        },
      ),
    ).resolves.toBe(0);

    const payload = JSON.parse(output.join(""));
    expect(payload.run.externalNetworkCalls).toBe(false);
    expect(payload.fusedPublicBortleRange).toHaveProperty("rangeLabelZh");
    expect(payload.dem).toMatchObject({ queried: false, status: "not_queried" });
    expect(client.queryLightPollution).toHaveBeenCalledTimes(1);
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
          return lightPollutionFixture({
            ambientRiskIndex: 0,
            localRadiance: 10,
            surroundingHaloRadiance: 1,
          });
        }
        if (input.latitudeWgs84 === 7) {
          return lightPollutionFixture({
            ambientRiskIndex: 100,
            localRadiance: 1,
            surroundingHaloRadiance: 10,
          });
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
    writeFileSync(inputPath, "id,name,latitudeWgs84,longitudeWgs84\np1,Private,1,2\n", "utf8");

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
    expect(
      estimateBortleRangeForLightPollution(lightPollutionFixture({ ambientRiskIndex: 14 })),
    ).toMatchObject({
      minClass: 1,
      maxClass: 2,
    });
    expect(
      estimateBortleRangeForLightPollution(lightPollutionFixture({ ambientRiskIndex: 15 })),
    ).toMatchObject({
      minClass: 2,
      maxClass: 3,
    });
    expect(
      estimateBortleRangeForLightPollution(lightPollutionFixture({ ambientRiskIndex: 95 })),
    ).toMatchObject({
      minClass: 8,
      maxClass: 9,
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
    expect(apiPackage.scripts["bortle:calibrate"]).toBe("tsx src/scripts/bortle-calibration.ts");
    expect(gitignore).toContain("deploy/calibration/runtime/*");
    expect(gitignore).toContain("!deploy/calibration/runtime/.gitkeep");
  });
});
