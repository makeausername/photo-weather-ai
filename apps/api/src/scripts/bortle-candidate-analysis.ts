import type {
  BortleCalibrationPointReport,
  BortleCalibrationReport,
  BortleCalibrationReference,
  BortleRangeComparison,
} from "./bortle-calibration.js";

export const bortleNearZeroRadianceThreshold = 0.001;

type CandidateScoreMode = "ambient_risk" | "composite_radiance_halo";

type RangeEstimate = {
  readonly minClass: number;
  readonly maxClass: number;
};

type CandidateSample = {
  readonly id: string;
  readonly category?: string;
  readonly reference: BortleCalibrationReference;
  readonly referenceSourceDocumented: boolean;
  readonly currentEstimate?: RangeEstimate;
  readonly ambientRiskIndex?: number | null;
  readonly localRadiance?: number | null;
  readonly surroundingHaloRadiance?: number | null;
};

type ScoreBounds = {
  readonly localLowLog: number;
  readonly localHighLog: number;
  readonly haloLowLog: number;
  readonly haloHighLog: number;
};

type CandidateDefinition = {
  readonly id: "ambient_reference_thresholds_v1" | "composite_radiance_halo_thresholds_v1";
  readonly label: string;
  readonly description: string;
  readonly scoreMode: CandidateScoreMode;
};

type CandidatePrediction = {
  readonly id: string;
  readonly category?: string;
  readonly reference: BortleCalibrationReference;
  readonly estimatedMinClass: number;
  readonly estimatedMaxClass: number;
  readonly estimatedRangeLabel: string;
  readonly comparison: BortleRangeComparison;
};

export type BortleCalibrationMismatchReason =
  | "range_does_not_overlap"
  | "distance_greater_than_one_class"
  | "ambient_risk_saturated"
  | "suspicious_local_halo_ratio"
  | "zero_or_near_zero_local_radiance_estimated_bortle_1";

export type BortleCalibrationMismatchPoint = BortleCalibrationPointReport & {
  readonly mismatchReasons: readonly BortleCalibrationMismatchReason[];
};

export type BortleCalibrationMismatchReport = {
  readonly run: {
    readonly timestamp: string;
    readonly toolVersion: "bortle-mismatch-investigation-v1";
    readonly estimatorMethodVersion: string;
    readonly auditOnly: true;
  };
  readonly summary: {
    readonly totalPoints: number;
    readonly mismatchPoints: number;
    readonly reasonDistribution: Readonly<Record<string, number>>;
  };
  readonly points: readonly BortleCalibrationMismatchPoint[];
};

export type BortleCandidateMetricSummary = {
  readonly evaluatedPoints: number;
  readonly exactRangeMatches: number;
  readonly overlapMatches: number;
  readonly adjacentMatches: number;
  readonly disagreementsGreaterThanOneClass: number;
  readonly meanClassDistance: number | null;
  readonly medianClassDistance: number | null;
  readonly maximumClassDistance: number | null;
  readonly overOneClassDisagreementRatio: number;
  readonly estimatedBortleDistribution: Readonly<Record<string, number>>;
  readonly perCategoryDiagnostics: Readonly<Record<string, BortleCandidateCategoryDiagnostics>>;
  readonly directionalBiasCount: {
    readonly estimateBelowReference: number;
    readonly estimateAboveReference: number;
    readonly overlappingOrExact: number;
  };
  readonly estimatesBelowReferences: number;
  readonly estimatesAboveReferences: number;
};

export type BortleCandidateCategoryDiagnostics = {
  readonly count: number;
  readonly exactRangeMatches: number;
  readonly overlapMatches: number;
  readonly adjacentMatches: number;
  readonly disagreementsGreaterThanOneClass: number;
  readonly meanClassDistance: number | null;
  readonly medianClassDistance: number | null;
  readonly estimatesBelowReferences: number;
  readonly estimatesAboveReferences: number;
};

export type BortleCandidateThreshold = {
  readonly maxCompositeRiskScore: number;
  readonly minClass: number;
  readonly maxClass: number;
};

export type BortleCandidateEvidenceRule = {
  readonly id:
    | "at_least_50_valid_reference_locations"
    | "at_least_five_environment_categories"
    | "no_single_category_over_50_percent"
    | "at_least_80_percent_high_confidence_raster"
    | "reduces_over_one_class_disagreements"
    | "does_not_materially_worsen_urban_or_dark_site_results"
    | "improves_or_maintains_median_distance"
    | "candidate_mapping_monotonic"
    | "reference_sources_documented";
  readonly passed: boolean;
  readonly currentValue: string | number | boolean | null;
  readonly required: string;
};

export type BortleCandidateEvaluation = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly auditOnly: true;
  readonly scoreMode: CandidateScoreMode | "production_current";
  readonly usesLocationSpecificRules: false;
  readonly usesCategorySpecificMapping: false;
  readonly mappingMonotonic: boolean;
  readonly middleBandsCollapsed: boolean;
  readonly thresholdMapping: readonly BortleCandidateThreshold[];
  readonly fullDatasetMetrics: BortleCandidateMetricSummary;
  readonly crossValidation: {
    readonly mode: "fixed_current_mapping" | "leave_one_out";
    readonly deterministic: true;
    readonly foldCount: number;
    readonly evaluatedPoints: number;
    readonly metrics: BortleCandidateMetricSummary;
  };
  readonly evidenceSufficiency: readonly BortleCandidateEvidenceRule[];
};

export type BortleCandidateAnalysis = {
  readonly run: {
    readonly timestamp: string;
    readonly toolVersion: "bortle-candidate-analysis-v1";
    readonly productionEstimatorMethodVersion: string;
    readonly auditOnly: true;
    readonly deterministic: true;
  };
  readonly referenceSemantics: {
    readonly rasterMeasurement: string;
    readonly currentDeterministicEstimate: string;
    readonly thirdPartyReferenceRange: string;
    readonly candidateOfflineSimulation: string;
  };
  readonly sampleSummary: {
    readonly validReferenceLocations: number;
    readonly meaningfulEnvironmentCategories: number;
    readonly largestCategoryShare: number;
    readonly highConfidenceRasterRatio: number;
    readonly referenceSourcesClearlyDocumented: boolean;
  };
  readonly currentMapping: BortleCandidateEvaluation;
  readonly candidates: readonly BortleCandidateEvaluation[];
  readonly recommendation: {
    readonly action:
      | "collect_more_references"
      | "investigate_specific_mismatches"
      | "candidate_ready_for_manual_review";
    readonly productionDeploymentRecommended: false;
    readonly automaticActivationAllowed: false;
    readonly reason: string;
  };
};

const candidateDefinitions: readonly CandidateDefinition[] = [
  {
    id: "ambient_reference_thresholds_v1",
    label: "Ambient risk reference thresholds",
    description:
      "Global monotonic thresholds fitted from ambientRiskIndex and reference ranges only.",
    scoreMode: "ambient_risk",
  },
  {
    id: "composite_radiance_halo_thresholds_v1",
    label: "Composite local and halo thresholds",
    description:
      "Global monotonic thresholds fitted from ambient risk, local radiance, and surrounding halo radiance.",
    scoreMode: "composite_radiance_halo",
  },
];

export function buildBortleMismatchReport(
  report: BortleCalibrationReport,
): BortleCalibrationMismatchReport {
  const points = report.points
    .map((point) => ({
      ...point,
      mismatchReasons: mismatchReasonsForPoint(point),
    }))
    .filter((point) => point.mismatchReasons.length > 0);

  return {
    run: {
      timestamp: report.run.timestamp,
      toolVersion: "bortle-mismatch-investigation-v1",
      estimatorMethodVersion: report.run.estimatorMethodVersion,
      auditOnly: true,
    },
    summary: {
      totalPoints: report.points.length,
      mismatchPoints: points.length,
      reasonDistribution: distribution(points.flatMap((point) => point.mismatchReasons)),
    },
    points,
  };
}

export function formatBortleMismatchCsv(report: BortleCalibrationMismatchReport): string {
  const headers = [
    "mismatchReasons",
    "rowNumber",
    "id",
    "name",
    "category",
    "latitudeWgs84",
    "longitudeWgs84",
    "referenceBortleMin",
    "referenceBortleMax",
    "estimatedBortleMin",
    "estimatedBortleMax",
    "estimatedBortleRangeLabel",
    "rangeDistance",
    "rangeOverlap",
    "biasDirection",
    "localRadiance",
    "surroundingHaloRadiance",
    "localToHaloRatio",
    "haloToLocalRatio",
    "ambientRiskIndex",
    "ambientRiskLevel",
    "ambientRiskLevelLabelZh",
    "validSampleCount",
    "rasterQueryConfidence",
    "datasetYear",
    "datasetVersion",
    "isLocalRadianceZeroOrNearZero",
    "isAmbientRiskSaturated",
    "localAndHaloDifferByRatioThreshold",
    "diagnostics",
  ];

  return [
    headers.map(csvCell).join(","),
    ...report.points.map((point) =>
      [
        point.mismatchReasons.join(";"),
        point.rowNumber,
        point.id,
        point.name,
        point.category ?? "",
        point.latitudeWgs84 ?? "",
        point.longitudeWgs84 ?? "",
        point.referenceBortleMin ?? point.reference?.minClass ?? "",
        point.referenceBortleMax ?? point.reference?.maxClass ?? "",
        point.estimatedBortleMin ?? "",
        point.estimatedBortleMax ?? "",
        point.estimatedBortleRangeLabel ?? "",
        point.rangeDistance ?? point.rangeComparison?.classDistance ?? "",
        point.rangeOverlap ?? point.rangeComparison?.rangeOverlap ?? "",
        point.biasDirection ?? biasDirection(point.rangeComparison),
        point.localRadiance ?? "",
        point.surroundingHaloRadiance ?? "",
        point.localToHaloRatio ?? "",
        point.haloToLocalRatio ?? "",
        point.ambientRiskIndex ?? "",
        point.ambientRiskLevel ?? "",
        point.ambientRiskLevelLabelZh ?? "",
        point.validSampleCount ?? "",
        point.rasterQueryConfidence ?? point.confidence ?? "",
        point.datasetYear ?? "",
        point.datasetVersion ?? "",
        point.isLocalRadianceZeroOrNearZero ?? "",
        point.isAmbientRiskSaturated ?? "",
        point.localAndHaloDifferByRatioThreshold ?? "",
        point.diagnostics.join(";"),
      ]
        .map(csvCell)
        .join(","),
    ),
  ].join("\n");
}

export function buildBortleCandidateAnalysis(
  report: BortleCalibrationReport,
): BortleCandidateAnalysis {
  const samples = buildCandidateSamples(report.points);
  const currentMapping = evaluateCurrentMapping(samples);
  const candidates = candidateDefinitions.map((definition) =>
    evaluateCandidateMapping(definition, samples, currentMapping, report),
  );
  const sampleSummary = buildSampleSummary(samples, report.summary.highConfidenceRasterRatio);
  const eligibleCandidates = candidates.filter((candidate) =>
    candidate.evidenceSufficiency.every((rule) => rule.passed),
  );
  const currentHasLargeMismatch =
    currentMapping.crossValidation.metrics.disagreementsGreaterThanOneClass > 0;

  return {
    run: {
      timestamp: report.run.timestamp,
      toolVersion: "bortle-candidate-analysis-v1",
      productionEstimatorMethodVersion: report.run.estimatorMethodVersion,
      auditOnly: true,
      deterministic: true,
    },
    referenceSemantics: {
      rasterMeasurement:
        "Raster fields are EOG VIIRS satellite night-light measurements and derived local/halo risk diagnostics.",
      currentDeterministicEstimate:
        "Current estimates are produced by the existing deterministic production estimator.",
      thirdPartyReferenceRange:
        "Reference Bortle ranges are third-party model references supplied from Tianwentong screenshots, not field SQM measurements or physical ground truth.",
      candidateOfflineSimulation:
        "Candidate mappings are offline audit simulations only and are never activated automatically.",
    },
    sampleSummary,
    currentMapping,
    candidates,
    recommendation: {
      action:
        eligibleCandidates.length > 0
          ? "candidate_ready_for_manual_review"
          : currentHasLargeMismatch
            ? "investigate_specific_mismatches"
            : "collect_more_references",
      productionDeploymentRecommended: false,
      automaticActivationAllowed: false,
      reason:
        eligibleCandidates.length > 0
          ? "At least one candidate passed the audit sufficiency gates, but production deployment still requires manual review and a separate change."
          : currentHasLargeMismatch
            ? "Large mismatches remain and the current evidence is insufficient for production threshold replacement."
            : "Current evidence is insufficient for production threshold replacement.",
    },
  };
}

export function formatBortleCandidateAnalysisMarkdown(analysis: BortleCandidateAnalysis): string {
  const lines = [
    "# Bortle Calibration Candidate Analysis",
    "",
    "## Scope",
    "",
    `- Audit only: ${analysis.run.auditOnly}`,
    `- Deterministic: ${analysis.run.deterministic}`,
    `- Production estimator method: ${analysis.run.productionEstimatorMethodVersion}`,
    `- Raster measurement: ${analysis.referenceSemantics.rasterMeasurement}`,
    `- Current deterministic estimate: ${analysis.referenceSemantics.currentDeterministicEstimate}`,
    `- Third-party reference range: ${analysis.referenceSemantics.thirdPartyReferenceRange}`,
    `- Candidate offline simulation: ${analysis.referenceSemantics.candidateOfflineSimulation}`,
    "",
    "## Evidence Summary",
    "",
    `- Valid reference locations: ${analysis.sampleSummary.validReferenceLocations}`,
    `- Meaningful environment categories: ${analysis.sampleSummary.meaningfulEnvironmentCategories}`,
    `- Largest category share: ${formatPercent(analysis.sampleSummary.largestCategoryShare)}`,
    `- High-confidence raster ratio: ${formatPercent(
      analysis.sampleSummary.highConfidenceRasterRatio,
    )}`,
    `- Reference sources documented: ${analysis.sampleSummary.referenceSourcesClearlyDocumented}`,
    "",
    "## Current Mapping",
    "",
    formatMetricsList(analysis.currentMapping.crossValidation.metrics),
    "",
    "## Candidate Comparison",
    "",
    formatCandidateComparisonTable(analysis),
    "",
    "## Candidate Thresholds",
    "",
    ...analysis.candidates.flatMap((candidate) => [
      `### ${candidate.label}`,
      "",
      `- Score mode: ${candidate.scoreMode}`,
      `- Monotonic: ${candidate.mappingMonotonic}`,
      `- Uses location-specific rules: ${candidate.usesLocationSpecificRules}`,
      `- Uses category-specific mapping: ${candidate.usesCategorySpecificMapping}`,
      "",
      formatThresholdTable(candidate.thresholdMapping),
      "",
    ]),
    "## Evidence Sufficiency Rules",
    "",
    ...analysis.candidates.flatMap((candidate) => [
      `### ${candidate.label}`,
      "",
      ...candidate.evidenceSufficiency.map(
        (rule) =>
          `- ${rule.id}: ${rule.passed ? "pass" : "fail"} (current=${rule.currentValue}; required=${rule.required})`,
      ),
      "",
    ]),
    "## Recommendation",
    "",
    `- Action: ${analysis.recommendation.action}`,
    `- Production deployment recommended: ${analysis.recommendation.productionDeploymentRecommended}`,
    `- Automatic activation allowed: ${analysis.recommendation.automaticActivationAllowed}`,
    `- Reason: ${analysis.recommendation.reason}`,
  ];

  return `${lines.join("\n")}\n`;
}

function mismatchReasonsForPoint(
  point: BortleCalibrationPointReport,
): readonly BortleCalibrationMismatchReason[] {
  const reasons: BortleCalibrationMismatchReason[] = [];
  if (point.rangeComparison && !point.rangeComparison.rangeOverlap) {
    reasons.push("range_does_not_overlap");
  }
  if ((point.rangeComparison?.classDistance ?? 0) > 1) {
    reasons.push("distance_greater_than_one_class");
  }
  if (point.isAmbientRiskSaturated) {
    reasons.push("ambient_risk_saturated");
  }
  if (point.localAndHaloDifferByRatioThreshold) {
    reasons.push("suspicious_local_halo_ratio");
  }
  if (
    point.isLocalRadianceZeroOrNearZero &&
    typeof point.estimatedBortleMin === "number" &&
    point.estimatedBortleMin <= 1
  ) {
    reasons.push("zero_or_near_zero_local_radiance_estimated_bortle_1");
  }
  return reasons;
}

function buildCandidateSamples(
  points: readonly BortleCalibrationPointReport[],
): readonly CandidateSample[] {
  return points.flatMap((point) => {
    if (!point.reference || !point.querySuccess) {
      return [];
    }
    return [
      {
        id: point.id,
        category: point.category,
        reference: point.reference,
        referenceSourceDocumented: hasText(point.reference.source),
        currentEstimate:
          typeof point.estimatedBortleMin === "number" &&
          typeof point.estimatedBortleMax === "number"
            ? {
                minClass: point.estimatedBortleMin,
                maxClass: point.estimatedBortleMax,
              }
            : undefined,
        ambientRiskIndex: point.ambientRiskIndex,
        localRadiance: point.localRadiance,
        surroundingHaloRadiance: point.surroundingHaloRadiance,
      },
    ];
  });
}

function evaluateCurrentMapping(samples: readonly CandidateSample[]): BortleCandidateEvaluation {
  const predictions = samples.flatMap((sample) => {
    if (!sample.currentEstimate) {
      return [];
    }
    return [
      predictionForEstimate(
        sample,
        sample.currentEstimate.minClass,
        sample.currentEstimate.maxClass,
      ),
    ];
  });
  const metrics = buildMetricSummary(predictions);

  return {
    id: "production_current",
    label: "Current production mapping",
    description: "Fixed current production estimator output. No thresholds are fitted here.",
    auditOnly: true,
    scoreMode: "production_current",
    usesLocationSpecificRules: false,
    usesCategorySpecificMapping: false,
    mappingMonotonic: true,
    middleBandsCollapsed: false,
    thresholdMapping: [],
    fullDatasetMetrics: metrics,
    crossValidation: {
      mode: "fixed_current_mapping",
      deterministic: true,
      foldCount: samples.length,
      evaluatedPoints: predictions.length,
      metrics,
    },
    evidenceSufficiency: [],
  };
}

function evaluateCandidateMapping(
  definition: CandidateDefinition,
  samples: readonly CandidateSample[],
  currentMapping: BortleCandidateEvaluation,
  report: BortleCalibrationReport,
): BortleCandidateEvaluation {
  const fullMapping = fitCandidateThresholds(samples, definition.scoreMode);
  const fullDatasetPredictions = predictSamples(samples, definition.scoreMode, fullMapping);
  const crossValidationPredictions: CandidatePrediction[] = [];

  if (samples.length >= 2) {
    for (let index = 0; index < samples.length; index += 1) {
      const validationSample = samples[index]!;
      const trainingSamples = samples.filter((_, candidateIndex) => candidateIndex !== index);
      const foldMapping = fitCandidateThresholds(trainingSamples, definition.scoreMode);
      const prediction = predictSample(validationSample, definition.scoreMode, foldMapping);
      if (prediction) {
        crossValidationPredictions.push(prediction);
      }
    }
  }

  const fullDatasetMetrics = buildMetricSummary(fullDatasetPredictions);
  const crossValidationMetrics = buildMetricSummary(crossValidationPredictions);
  const mappingMonotonic = isThresholdMappingMonotonic(fullMapping.thresholdMapping);
  const middleBandsCollapsed = middleBandsCollapsedInMapping(fullMapping.thresholdMapping);

  const evaluation: BortleCandidateEvaluation = {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    auditOnly: true,
    scoreMode: definition.scoreMode,
    usesLocationSpecificRules: false,
    usesCategorySpecificMapping: false,
    mappingMonotonic,
    middleBandsCollapsed,
    thresholdMapping: fullMapping.thresholdMapping,
    fullDatasetMetrics,
    crossValidation: {
      mode: "leave_one_out",
      deterministic: true,
      foldCount: samples.length,
      evaluatedPoints: crossValidationPredictions.length,
      metrics: crossValidationMetrics,
    },
    evidenceSufficiency: [],
  };

  return {
    ...evaluation,
    evidenceSufficiency: buildEvidenceSufficiencyRules(evaluation, currentMapping, samples, report),
  };
}

function fitCandidateThresholds(
  samples: readonly CandidateSample[],
  scoreMode: CandidateScoreMode,
): {
  readonly scoreBounds: ScoreBounds;
  readonly thresholdMapping: readonly BortleCandidateThreshold[];
} {
  const scoreBounds = buildScoreBounds(samples);
  const scoredSamples = samples
    .map((sample) => ({
      score: scoreCandidateSample(sample, scoreMode, scoreBounds),
      targetMinClass: targetMinClass(sample.reference),
    }))
    .filter(
      (sample): sample is { readonly score: number; readonly targetMinClass: number } =>
        typeof sample.score === "number" && Number.isFinite(sample.score),
    );
  const sortedScores = scoredSamples
    .map((sample) => sample.score)
    .sort((left, right) => left - right);
  const rawThresholds: number[] = [];

  for (let boundaryClass = 1; boundaryClass <= 7; boundaryClass += 1) {
    const lowerScores = scoredSamples
      .filter((sample) => sample.targetMinClass <= boundaryClass)
      .map((sample) => sample.score);
    const upperScores = scoredSamples
      .filter((sample) => sample.targetMinClass >= boundaryClass + 1)
      .map((sample) => sample.score);
    const fallback = percentile(sortedScores, boundaryClass / 8) ?? (boundaryClass * 100) / 8;
    const maxLower = maxOrNull(lowerScores);
    const minUpper = minOrNull(upperScores);
    rawThresholds.push(
      maxLower !== null && minUpper !== null && maxLower <= minUpper
        ? (maxLower + minUpper) / 2
        : fallback,
    );
  }

  const thresholds = enforceMonotonicThresholds(rawThresholds);

  return {
    scoreBounds,
    thresholdMapping: thresholds.map((maxCompositeRiskScore, index) => ({
      maxCompositeRiskScore,
      minClass: index + 1,
      maxClass: index + 2,
    })),
  };
}

function predictSamples(
  samples: readonly CandidateSample[],
  scoreMode: CandidateScoreMode,
  mapping: {
    readonly scoreBounds: ScoreBounds;
    readonly thresholdMapping: readonly BortleCandidateThreshold[];
  },
): readonly CandidatePrediction[] {
  return samples.flatMap((sample) => {
    const prediction = predictSample(sample, scoreMode, mapping);
    return prediction ? [prediction] : [];
  });
}

function predictSample(
  sample: CandidateSample,
  scoreMode: CandidateScoreMode,
  mapping: {
    readonly scoreBounds: ScoreBounds;
    readonly thresholdMapping: readonly BortleCandidateThreshold[];
  },
): CandidatePrediction | null {
  const score = scoreCandidateSample(sample, scoreMode, mapping.scoreBounds);
  if (score === null) {
    return null;
  }
  let minClass = 1;
  for (const threshold of mapping.thresholdMapping) {
    if (score > threshold.maxCompositeRiskScore) {
      minClass += 1;
    }
  }
  minClass = clampInteger(minClass, 1, 8);
  return predictionForEstimate(sample, minClass, minClass + 1);
}

function predictionForEstimate(
  sample: CandidateSample,
  minClass: number,
  maxClass: number,
): CandidatePrediction {
  return {
    id: sample.id,
    category: sample.category,
    reference: sample.reference,
    estimatedMinClass: minClass,
    estimatedMaxClass: maxClass,
    estimatedRangeLabel: formatRangeLabel(minClass, maxClass),
    comparison: compareEstimateToReference({ minClass, maxClass }, sample.reference),
  };
}

function buildMetricSummary(
  predictions: readonly CandidatePrediction[],
): BortleCandidateMetricSummary {
  const distances = predictions.map((prediction) => prediction.comparison.classDistance);
  const perCategoryDiagnostics = buildPerCategoryDiagnostics(predictions);
  const estimatesBelowReferences = predictions.filter(
    (prediction) => prediction.comparison.estimateBelowReference,
  ).length;
  const estimatesAboveReferences = predictions.filter(
    (prediction) => prediction.comparison.estimateAboveReference,
  ).length;
  const overlappingOrExact =
    predictions.length - estimatesBelowReferences - estimatesAboveReferences;
  const disagreementsGreaterThanOneClass = predictions.filter(
    (prediction) => prediction.comparison.classDistance > 1,
  ).length;

  return {
    evaluatedPoints: predictions.length,
    exactRangeMatches: predictions.filter((prediction) => prediction.comparison.exactRangeMatch)
      .length,
    overlapMatches: predictions.filter((prediction) => prediction.comparison.rangeOverlap).length,
    adjacentMatches: predictions.filter(
      (prediction) =>
        !prediction.comparison.rangeOverlap && prediction.comparison.acceptableAdjacentMatch,
    ).length,
    disagreementsGreaterThanOneClass,
    meanClassDistance: mean(distances),
    medianClassDistance: median(distances),
    maximumClassDistance: distances.length > 0 ? Math.max(...distances) : null,
    overOneClassDisagreementRatio:
      predictions.length > 0 ? disagreementsGreaterThanOneClass / predictions.length : 0,
    estimatedBortleDistribution: distribution(
      predictions.map((prediction) => prediction.estimatedRangeLabel),
    ),
    perCategoryDiagnostics,
    directionalBiasCount: {
      estimateBelowReference: estimatesBelowReferences,
      estimateAboveReference: estimatesAboveReferences,
      overlappingOrExact,
    },
    estimatesBelowReferences,
    estimatesAboveReferences,
  };
}

function buildPerCategoryDiagnostics(
  predictions: readonly CandidatePrediction[],
): Readonly<Record<string, BortleCandidateCategoryDiagnostics>> {
  const grouped = new Map<string, CandidatePrediction[]>();
  for (const prediction of predictions) {
    const category = prediction.category ?? "uncategorized";
    grouped.set(category, [...(grouped.get(category) ?? []), prediction]);
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, categoryPredictions]) => {
        const distances = categoryPredictions.map(
          (prediction) => prediction.comparison.classDistance,
        );
        return [
          category,
          {
            count: categoryPredictions.length,
            exactRangeMatches: categoryPredictions.filter(
              (prediction) => prediction.comparison.exactRangeMatch,
            ).length,
            overlapMatches: categoryPredictions.filter(
              (prediction) => prediction.comparison.rangeOverlap,
            ).length,
            adjacentMatches: categoryPredictions.filter(
              (prediction) =>
                !prediction.comparison.rangeOverlap &&
                prediction.comparison.acceptableAdjacentMatch,
            ).length,
            disagreementsGreaterThanOneClass: categoryPredictions.filter(
              (prediction) => prediction.comparison.classDistance > 1,
            ).length,
            meanClassDistance: mean(distances),
            medianClassDistance: median(distances),
            estimatesBelowReferences: categoryPredictions.filter(
              (prediction) => prediction.comparison.estimateBelowReference,
            ).length,
            estimatesAboveReferences: categoryPredictions.filter(
              (prediction) => prediction.comparison.estimateAboveReference,
            ).length,
          },
        ];
      }),
  );
}

function buildSampleSummary(
  samples: readonly CandidateSample[],
  highConfidenceRasterRatio: number,
): BortleCandidateAnalysis["sampleSummary"] {
  const categoryCounts = countCategories(samples);
  const largestCategoryCount =
    categoryCounts.size > 0 ? Math.max(...[...categoryCounts.values()]) : 0;

  return {
    validReferenceLocations: samples.length,
    meaningfulEnvironmentCategories: categoryCounts.size,
    largestCategoryShare: samples.length > 0 ? largestCategoryCount / samples.length : 0,
    highConfidenceRasterRatio,
    referenceSourcesClearlyDocumented:
      samples.length > 0 && samples.every((sample) => sample.referenceSourceDocumented),
  };
}

function buildEvidenceSufficiencyRules(
  candidate: BortleCandidateEvaluation,
  currentMapping: BortleCandidateEvaluation,
  samples: readonly CandidateSample[],
  report: BortleCalibrationReport,
): readonly BortleCandidateEvidenceRule[] {
  const categoryCounts = countCategories(samples);
  const largestCategoryCount =
    categoryCounts.size > 0 ? Math.max(...[...categoryCounts.values()]) : 0;
  const largestCategoryShare = samples.length > 0 ? largestCategoryCount / samples.length : 0;
  const currentMetrics = currentMapping.crossValidation.metrics;
  const candidateMetrics = candidate.crossValidation.metrics;
  const currentMedian = currentMetrics.medianClassDistance;
  const candidateMedian = candidateMetrics.medianClassDistance;
  const candidateReducesOverOne =
    candidateMetrics.disagreementsGreaterThanOneClass <
    currentMetrics.disagreementsGreaterThanOneClass;
  const candidateMaintainsMedian =
    candidateMedian !== null && (currentMedian === null || candidateMedian <= currentMedian);
  const referenceSourcesDocumented =
    samples.length > 0 && samples.every((sample) => sample.referenceSourceDocumented);
  const urbanAndDarkSiteSafe = doesNotWorsenUrbanOrDarkSite(candidateMetrics, currentMetrics);

  return [
    {
      id: "at_least_50_valid_reference_locations",
      passed: samples.length >= 50,
      currentValue: samples.length,
      required: ">= 50",
    },
    {
      id: "at_least_five_environment_categories",
      passed: categoryCounts.size >= 5,
      currentValue: categoryCounts.size,
      required: ">= 5",
    },
    {
      id: "no_single_category_over_50_percent",
      passed: largestCategoryShare <= 0.5,
      currentValue: round(largestCategoryShare, 3),
      required: "<= 0.5",
    },
    {
      id: "at_least_80_percent_high_confidence_raster",
      passed: report.summary.highConfidenceRasterRatio >= 0.8,
      currentValue: round(report.summary.highConfidenceRasterRatio, 3),
      required: ">= 0.8",
    },
    {
      id: "reduces_over_one_class_disagreements",
      passed: candidateReducesOverOne,
      currentValue: `${candidateMetrics.disagreementsGreaterThanOneClass} vs current ${currentMetrics.disagreementsGreaterThanOneClass}`,
      required: "candidate < current",
    },
    {
      id: "does_not_materially_worsen_urban_or_dark_site_results",
      passed: urbanAndDarkSiteSafe,
      currentValue: urbanAndDarkSiteSafe,
      required: "no material urban/dark-site regression",
    },
    {
      id: "improves_or_maintains_median_distance",
      passed: candidateMaintainsMedian,
      currentValue:
        candidateMedian === null ? null : `${candidateMedian} vs current ${currentMedian ?? "n/a"}`,
      required: "candidate median <= current median",
    },
    {
      id: "candidate_mapping_monotonic",
      passed: candidate.mappingMonotonic && !candidate.middleBandsCollapsed,
      currentValue: candidate.mappingMonotonic && !candidate.middleBandsCollapsed,
      required: "monotonic and middle bands preserved",
    },
    {
      id: "reference_sources_documented",
      passed: referenceSourcesDocumented,
      currentValue: referenceSourcesDocumented,
      required: "all references carry a source",
    },
  ];
}

function countCategories(samples: readonly CandidateSample[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    const category = sample.category?.trim();
    if (!category) {
      continue;
    }
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return counts;
}

function doesNotWorsenUrbanOrDarkSite(
  candidate: BortleCandidateMetricSummary,
  current: BortleCandidateMetricSummary,
): boolean {
  return (
    doesNotMateriallyWorsenCategoryGroup(candidate, current, isUrbanCategory) &&
    doesNotMateriallyWorsenCategoryGroup(candidate, current, isDarkSiteCategory)
  );
}

function doesNotMateriallyWorsenCategoryGroup(
  candidate: BortleCandidateMetricSummary,
  current: BortleCandidateMetricSummary,
  matcher: (category: string) => boolean,
): boolean {
  const candidateGroup = mergeCategoryDiagnostics(candidate.perCategoryDiagnostics, matcher);
  const currentGroup = mergeCategoryDiagnostics(current.perCategoryDiagnostics, matcher);
  if (!candidateGroup || !currentGroup) {
    return true;
  }
  return (
    candidateGroup.disagreementsGreaterThanOneClass <=
      currentGroup.disagreementsGreaterThanOneClass &&
    (candidateGroup.meanClassDistance ?? 0) <= (currentGroup.meanClassDistance ?? 0) + 0.25
  );
}

function mergeCategoryDiagnostics(
  diagnostics: Readonly<Record<string, BortleCandidateCategoryDiagnostics>>,
  matcher: (category: string) => boolean,
): BortleCandidateCategoryDiagnostics | null {
  const matched = Object.entries(diagnostics)
    .filter(([category]) => matcher(category))
    .map(([, value]) => value);
  if (matched.length === 0) {
    return null;
  }
  const distances = matched.flatMap((value) => {
    if (value.meanClassDistance === null || value.count === 0) {
      return [];
    }
    return Array.from({ length: value.count }, () => value.meanClassDistance as number);
  });
  return {
    count: matched.reduce((sum, value) => sum + value.count, 0),
    exactRangeMatches: matched.reduce((sum, value) => sum + value.exactRangeMatches, 0),
    overlapMatches: matched.reduce((sum, value) => sum + value.overlapMatches, 0),
    adjacentMatches: matched.reduce((sum, value) => sum + value.adjacentMatches, 0),
    disagreementsGreaterThanOneClass: matched.reduce(
      (sum, value) => sum + value.disagreementsGreaterThanOneClass,
      0,
    ),
    meanClassDistance: mean(distances),
    medianClassDistance: null,
    estimatesBelowReferences: matched.reduce(
      (sum, value) => sum + value.estimatesBelowReferences,
      0,
    ),
    estimatesAboveReferences: matched.reduce(
      (sum, value) => sum + value.estimatesAboveReferences,
      0,
    ),
  };
}

function scoreCandidateSample(
  sample: CandidateSample,
  scoreMode: CandidateScoreMode,
  bounds: ScoreBounds,
): number | null {
  const ambientRisk =
    typeof sample.ambientRiskIndex === "number" && Number.isFinite(sample.ambientRiskIndex)
      ? clamp(sample.ambientRiskIndex, 0, 100)
      : null;
  if (scoreMode === "ambient_risk") {
    return ambientRisk;
  }

  const localRisk = radianceRisk(sample.localRadiance, bounds.localLowLog, bounds.localHighLog);
  const haloRisk = radianceRisk(
    sample.surroundingHaloRadiance,
    bounds.haloLowLog,
    bounds.haloHighLog,
  );
  if (ambientRisk === null && localRisk === null && haloRisk === null) {
    return null;
  }
  const ambientComponent = ambientRisk ?? 0;
  const localComponent = localRisk ?? ambientComponent;
  const haloComponent = haloRisk ?? ambientComponent;

  return round(
    clamp(0.45 * ambientComponent + 0.2 * localComponent + 0.35 * haloComponent, 0, 100),
    3,
  );
}

function buildScoreBounds(samples: readonly CandidateSample[]): ScoreBounds {
  const localLogs = samples
    .map((sample) => safeLogRadiance(sample.localRadiance))
    .filter((value): value is number => value !== null);
  const haloLogs = samples
    .map((sample) => safeLogRadiance(sample.surroundingHaloRadiance))
    .filter((value): value is number => value !== null);
  return {
    ...logBounds("local", localLogs),
    ...logBounds("halo", haloLogs),
  };
}

function logBounds(
  prefix: "local" | "halo",
  logs: readonly number[],
): Pick<ScoreBounds, `${typeof prefix}LowLog` | `${typeof prefix}HighLog`> {
  const values = logs.length > 0 ? logs : [0];
  const low = Math.min(...values, 0);
  const high = Math.max(...values, 1);
  const adjustedHigh = high > low ? high : low + 1;
  return {
    [`${prefix}LowLog`]: low,
    [`${prefix}HighLog`]: adjustedHigh,
  } as Pick<ScoreBounds, `${typeof prefix}LowLog` | `${typeof prefix}HighLog`>;
}

function radianceRisk(
  radiance: number | null | undefined,
  lowLog: number,
  highLog: number,
): number | null {
  const value = safeLogRadiance(radiance);
  if (value === null) {
    return null;
  }
  return clamp(((value - lowLog) / (highLog - lowLog)) * 100, 0, 100);
}

function safeLogRadiance(radiance: number | null | undefined): number | null {
  if (typeof radiance !== "number" || !Number.isFinite(radiance)) {
    return null;
  }
  return Math.log1p(Math.max(0, radiance));
}

function targetMinClass(reference: BortleCalibrationReference): number {
  return clampInteger(reference.minClass, 1, 8);
}

function compareEstimateToReference(
  estimate: RangeEstimate,
  reference: BortleCalibrationReference,
): BortleRangeComparison {
  const rangeOverlap =
    estimate.minClass <= reference.maxClass && estimate.maxClass >= reference.minClass;
  const overlapStart = Math.max(estimate.minClass, reference.minClass);
  const overlapEnd = Math.min(estimate.maxClass, reference.maxClass);
  const estimateBelowReference = estimate.maxClass < reference.minClass;
  const estimateAboveReference = estimate.minClass > reference.maxClass;
  const classDistance = rangeOverlap
    ? 0
    : estimateBelowReference
      ? reference.minClass - estimate.maxClass
      : estimate.minClass - reference.maxClass;

  return {
    rangeOverlap,
    overlapClasses: rangeOverlap ? listClasses(overlapStart, overlapEnd) : [],
    classDistance,
    estimateBelowReference,
    estimateAboveReference,
    exactRangeMatch:
      estimate.minClass === reference.minClass && estimate.maxClass === reference.maxClass,
    acceptableAdjacentMatch: classDistance <= 1,
  };
}

function enforceMonotonicThresholds(rawThresholds: readonly number[]): readonly number[] {
  const minimumGap = 2;
  const thresholdCount = 7;
  const thresholds: number[] = [];
  let previous = 0;
  for (let index = 0; index < thresholdCount; index += 1) {
    const fallback = ((index + 1) * 100) / 8;
    const raw = Number.isFinite(rawThresholds[index]) ? rawThresholds[index]! : fallback;
    const remaining = thresholdCount - index;
    const maxAllowed = 100 - minimumGap * remaining;
    const value = clamp(raw, previous + minimumGap, maxAllowed);
    thresholds.push(round(value, 3));
    previous = value;
  }
  return thresholds;
}

function isThresholdMappingMonotonic(thresholds: readonly BortleCandidateThreshold[]): boolean {
  return thresholds.every(
    (threshold, index) =>
      index === 0 || threshold.maxCompositeRiskScore > thresholds[index - 1]!.maxCompositeRiskScore,
  );
}

function middleBandsCollapsedInMapping(thresholds: readonly BortleCandidateThreshold[]): boolean {
  if (thresholds.length < 7) {
    return true;
  }
  const middleSpan = thresholds[5]!.maxCompositeRiskScore - thresholds[1]!.maxCompositeRiskScore;
  return middleSpan < 8;
}

function listClasses(start: number, end: number): readonly number[] {
  const result: number[] = [];
  for (let value = start; value <= end; value += 1) {
    result.push(value);
  }
  return result;
}

function percentile(sortedValues: readonly number[], percentileValue: number): number | null {
  if (sortedValues.length === 0) {
    return null;
  }
  const index = clamp(percentileValue, 0, 1) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]!;
  }
  const lower = sortedValues[lowerIndex]!;
  const upper = sortedValues[upperIndex]!;
  return lower + (upper - lower) * (index - lowerIndex);
}

function maxOrNull(values: readonly number[]): number | null {
  return values.length > 0 ? Math.max(...values) : null;
}

function minOrNull(values: readonly number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null;
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

function distribution(values: readonly string[]): Readonly<Record<string, number>> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function biasDirection(comparison: BortleRangeComparison | undefined): string {
  if (!comparison) {
    return "";
  }
  if (comparison.estimateBelowReference) {
    return "estimate_below_reference";
  }
  if (comparison.estimateAboveReference) {
    return "estimate_above_reference";
  }
  return "overlap";
}

function formatRangeLabel(minClass: number, maxClass: number): string {
  return `${minClass}-${maxClass}`;
}

function formatMetricsList(metrics: BortleCandidateMetricSummary): string {
  return [
    `- Evaluated points: ${metrics.evaluatedPoints}`,
    `- Exact range matches: ${metrics.exactRangeMatches}`,
    `- Overlap matches: ${metrics.overlapMatches}`,
    `- Adjacent matches: ${metrics.adjacentMatches}`,
    `- Disagreements greater than one class: ${metrics.disagreementsGreaterThanOneClass}`,
    `- Mean class distance: ${formatNullableNumber(metrics.meanClassDistance)}`,
    `- Median class distance: ${formatNullableNumber(metrics.medianClassDistance)}`,
    `- Maximum class distance: ${formatNullableNumber(metrics.maximumClassDistance)}`,
    `- Over-one-class disagreement ratio: ${formatPercent(metrics.overOneClassDisagreementRatio)}`,
    `- Estimates below references: ${metrics.estimatesBelowReferences}`,
    `- Estimates above references: ${metrics.estimatesAboveReferences}`,
  ].join("\n");
}

function formatCandidateComparisonTable(analysis: BortleCandidateAnalysis): string {
  const rows = [analysis.currentMapping, ...analysis.candidates].map((candidate) => {
    const metrics = candidate.crossValidation.metrics;
    return `| ${candidate.label} | ${candidate.crossValidation.mode} | ${metrics.exactRangeMatches} | ${metrics.overlapMatches} | ${metrics.adjacentMatches} | ${metrics.disagreementsGreaterThanOneClass} | ${formatNullableNumber(metrics.meanClassDistance)} | ${formatNullableNumber(metrics.medianClassDistance)} | ${formatNullableNumber(metrics.maximumClassDistance)} | ${formatPercent(metrics.overOneClassDisagreementRatio)} | ${metrics.estimatesBelowReferences} | ${metrics.estimatesAboveReferences} |`;
  });
  return [
    "| Mapping | CV mode | Exact | Overlap | Adjacent | >1 class | Mean distance | Median distance | Max distance | >1 ratio | Below refs | Above refs |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

function formatThresholdTable(thresholds: readonly BortleCandidateThreshold[]): string {
  if (thresholds.length === 0) {
    return "No fitted thresholds for the fixed current mapping.";
  }
  return [
    "| Max risk score | Estimated Bortle range |",
    "| --- | --- |",
    ...thresholds.map(
      (threshold) =>
        `| ${threshold.maxCompositeRiskScore} | ${threshold.minClass}-${threshold.maxClass} |`,
    ),
  ].join("\n");
}

function isUrbanCategory(category: string): boolean {
  const normalized = category.toLowerCase();
  return (
    normalized.includes("urban") ||
    normalized.includes("city") ||
    normalized.includes("town") ||
    normalized.includes("suburban")
  );
}

function isDarkSiteCategory(category: string): boolean {
  const normalized = category.toLowerCase();
  return (
    normalized.includes("dark") ||
    normalized.includes("astronomy") ||
    normalized.includes("protected")
  );
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.trunc(clamp(value, min, max));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
