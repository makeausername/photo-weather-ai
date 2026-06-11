import type {
  AstroSummary,
  AstroWindow,
  Coordinates,
  ExposureType,
  TerrainAnalysisSummary,
  TerrainHorizonAssessment,
  TerrainHorizonConfidence,
  TerrainHorizonDataSource,
  TerrainHorizonDirectionSample,
  TerrainHorizonObstructionLevel,
  TerrainHorizonTarget,
  TerrainHorizonUnavailableReason,
  TerrainType,
  TerrainViewingDirection,
} from "@photo-weather/shared";

export type TerrainHorizonObstructionInput = {
  readonly location: Coordinates;
  readonly observerElevationMeters?: number | null;
  readonly target: TerrainHorizonTarget;
  readonly targetAzimuthDegrees?: number | null;
  readonly targetAltitudeDegrees?: number | null;
  readonly directionSamples?: readonly TerrainHorizonDirectionSample[];
  readonly terrainType?: TerrainType;
  readonly exposureType?: ExposureType;
  readonly viewingDirection?: TerrainViewingDirection;
  readonly dataSource?: TerrainHorizonDataSource;
  readonly dataSourceLabelZh?: string;
  readonly maxAzimuthDeltaDegrees?: number;
};

type ResolvedSample = {
  readonly source: TerrainHorizonDirectionSample;
  readonly horizonAltitudeDegrees: number;
  readonly azimuthDeltaDegrees: number;
};

export type DeterministicTerrainHorizonAssessment = TerrainHorizonAssessment & {
  readonly horizonAltitudeDegrees: number;
  readonly obstructionClearanceDegrees: number;
  readonly obstructionLevel: Exclude<TerrainHorizonObstructionLevel, "unknown">;
  readonly confidence: "high" | "medium";
};

const defaultMaxAzimuthDeltaDegrees = 22.5;
const calculationRuleZh =
  "clearance = target altitude - terrain horizon altitude；>=3° 为无遮挡，0° 到 3° 为临界，<0° 为遮挡。";
const missingDirectionalProfileNoteZh =
  "当前缺少目标方向的地形剖面数据，系统未把地形当作无遮挡处理，建议现场确认地平线遮挡。";

export function assessTerrainHorizonObstruction(
  input: TerrainHorizonObstructionInput,
): TerrainHorizonAssessment {
  const samples = input.directionSamples ?? [];
  const targetAzimuth = finiteNumber(input.targetAzimuthDegrees);
  const targetAltitude = finiteNumber(input.targetAltitudeDegrees);
  const observerElevation = finiteNumber(input.observerElevationMeters);
  const maxDelta = finiteNumber(input.maxAzimuthDeltaDegrees) ?? defaultMaxAzimuthDeltaDegrees;
  const baseDiagnostics = {
    calculationRuleZh,
    sampleCount: samples.length,
    validSampleCount: 0,
    usedDirectionalProfile: false,
    nearestAzimuthDeltaDegrees: null,
    notesZh: [] as readonly string[],
  };

  if (targetAzimuth === undefined || targetAltitude === undefined) {
    return unknownAssessment(input, {
      unavailableReason: "missing_target_geometry",
      notesZh: [
        "缺少目标方位角或目标高度角，无法计算地形地平线 clearance。",
        missingDirectionalProfileNoteZh,
      ],
      diagnostics: baseDiagnostics,
    });
  }

  const matchingSamples: ResolvedSample[] = [];
  for (const sample of samples) {
    if (sample.target !== undefined && sample.target !== input.target) {
      continue;
    }
    const sampleAzimuth = finiteNumber(sample.azimuthDegrees);
    if (sampleAzimuth === undefined) {
      continue;
    }
    const azimuthDelta = circularDistanceDegrees(targetAzimuth, sampleAzimuth);
    if (azimuthDelta > maxDelta) {
      continue;
    }
    const horizonAltitude = sampleHorizonAltitude(sample, observerElevation);
    if (horizonAltitude === undefined) {
      continue;
    }
    matchingSamples.push({
      source: sample,
      horizonAltitudeDegrees: horizonAltitude,
      azimuthDeltaDegrees: round1(azimuthDelta),
    });
  }

  if (matchingSamples.length === 0) {
    const hasNearbyButInvalid = samples.some((sample) => {
      const sampleAzimuth = finiteNumber(sample.azimuthDegrees);
      return (
        sampleAzimuth !== undefined &&
        circularDistanceDegrees(targetAzimuth, sampleAzimuth) <= maxDelta
      );
    });
    return unknownAssessment(input, {
      unavailableReason: hasNearbyButInvalid
        ? "insufficient_directional_sample"
        : "missing_directional_profile",
      notesZh: [
        hasNearbyButInvalid
          ? "目标方向附近有样本，但样本缺少可用 horizon altitude 或 elevation/distance。"
          : missingDirectionalProfileNoteZh,
      ],
      diagnostics: {
        ...baseDiagnostics,
        nearestAzimuthDeltaDegrees: nearestAzimuthDelta(targetAzimuth, samples),
      },
    });
  }

  const selected = pickBlockingSample(matchingSamples);
  const clearance = round1(targetAltitude - selected.horizonAltitudeDegrees);
  const obstructionLevel = classifyTerrainHorizonClearance(clearance);

  return {
    location: input.location,
    observerElevationMeters: observerElevation ?? null,
    target: input.target,
    targetAzimuthDegrees: round1(normalizeAzimuth(targetAzimuth)),
    targetAltitudeDegrees: round1(targetAltitude),
    horizonAltitudeDegrees: selected.horizonAltitudeDegrees,
    obstructionClearanceDegrees: clearance,
    obstructionLevel,
    confidence: normalizeConfidence(selected.source.confidence),
    dataSource: selected.source.dataSource,
    dataSourceLabelZh: input.dataSourceLabelZh,
    directionSample: selected.source,
    directionSamples: samples,
    professionalDiagnostics: {
      calculationRuleZh,
      sampleCount: samples.length,
      validSampleCount: matchingSamples.length,
      usedDirectionalProfile: true,
      nearestAzimuthDeltaDegrees: selected.azimuthDeltaDegrees,
      sampleDistanceRangeMeters: sampleDistanceRange(matchingSamples.map((sample) => sample.source)),
      notesZh: [
        "已使用目标方向附近的地形剖面样本计算 clearance。",
        `目标高度角 ${round1(targetAltitude)}°，地形地平线 ${selected.horizonAltitudeDegrees}°，clearance ${clearance}°。`,
      ],
    },
  };
}

export function resolveMilkyWayTerrainHorizonAssessment(input: {
  readonly terrainAnalysis: TerrainAnalysisSummary;
  readonly astro?: AstroSummary;
  readonly window?: Pick<
    AstroWindow,
    "galacticCenterAltitude" | "galacticCenterAzimuth" | "terrainHorizonAssessment"
  >;
}): TerrainHorizonAssessment {
  if (input.window?.terrainHorizonAssessment) {
    return input.window.terrainHorizonAssessment;
  }

  const terrainProfile = input.terrainAnalysis.terrainProfile;
  const horizonProfile = input.terrainAnalysis.horizonProfile;
  const targetAzimuth =
    finiteNumber(input.window?.galacticCenterAzimuth) ??
    finiteNumber(input.astro?.milkyWayGalacticCenterAzimuth);
  const targetAltitude =
    finiteNumber(input.window?.galacticCenterAltitude) ??
    finiteNumber(input.astro?.milkyWayGalacticCenterAltitude);

  return assessTerrainHorizonObstruction({
    location: {
      latitude: terrainProfile.latitudeWgs84,
      longitude: terrainProfile.longitudeWgs84,
      system: "wgs84",
    },
    observerElevationMeters: terrainProfile.locationElevation ?? terrainProfile.elevationMeters,
    target: "milky_way",
    targetAzimuthDegrees: targetAzimuth,
    targetAltitudeDegrees: targetAltitude,
    directionSamples: normalizeMilkyWayDirectionSamples({
      targetAzimuth,
      horizonProfile,
      dataSource: input.terrainAnalysis.isMock ? "mock_terrain_profile" : "manual_profile",
    }),
    terrainType: terrainProfile.terrainType,
    exposureType: terrainProfile.exposureType,
    viewingDirection: terrainProfile.viewingDirection,
    dataSourceLabelZh: input.terrainAnalysis.dataSourceLabelZh,
  });
}

export function terrainHorizonAssessmentHasDeterministicClearance(
  assessment: TerrainHorizonAssessment | undefined,
): assessment is DeterministicTerrainHorizonAssessment {
  return Boolean(
    assessment &&
      assessment.professionalDiagnostics.usedDirectionalProfile &&
      (assessment.confidence === "medium" || assessment.confidence === "high") &&
      typeof assessment.horizonAltitudeDegrees === "number" &&
      typeof assessment.obstructionClearanceDegrees === "number" &&
      assessment.obstructionLevel !== "unknown",
  );
}

export function terrainHorizonObstructionStatusZh(
  level: TerrainHorizonObstructionLevel,
): string {
  switch (level) {
    case "clear":
      return "无遮挡";
    case "marginal":
      return "临界";
    case "obstructed":
      return "可能遮挡";
    case "unknown":
      return "数据不足";
  }
}

export function terrainHorizonConfidenceZh(confidence: TerrainHorizonConfidence): string {
  switch (confidence) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    case "unknown":
      return "未知";
  }
}

export function terrainHorizonUnavailableReasonZh(
  reason: TerrainHorizonUnavailableReason | undefined,
): string {
  switch (reason) {
    case "missing_target_geometry":
      return "缺少目标方位角或高度角";
    case "missing_observer_elevation":
      return "缺少机位海拔";
    case "insufficient_directional_sample":
      return "目标方向样本不足";
    case "invalid_directional_sample":
      return "地形剖面样本无效";
    case "missing_directional_profile":
      return "缺少目标方向地形剖面";
    case "unknown":
    case undefined:
      return "数据不足";
  }
}

function unknownAssessment(
  input: TerrainHorizonObstructionInput,
  options: {
    readonly unavailableReason: TerrainHorizonUnavailableReason;
    readonly notesZh: readonly string[];
    readonly diagnostics: TerrainHorizonAssessment["professionalDiagnostics"];
  },
): TerrainHorizonAssessment {
  const fallback = qualitativeFallbackSummary(input);
  return {
    location: input.location,
    observerElevationMeters: finiteNumber(input.observerElevationMeters) ?? null,
    target: input.target,
    targetAzimuthDegrees: finiteNumber(input.targetAzimuthDegrees) ?? null,
    targetAltitudeDegrees: finiteNumber(input.targetAltitudeDegrees) ?? null,
    horizonAltitudeDegrees: null,
    obstructionClearanceDegrees: null,
    obstructionLevel: "unknown",
    confidence: "low",
    dataSource: "qualitative_fallback",
    dataSourceLabelZh: input.dataSourceLabelZh,
    unavailableReason: options.unavailableReason,
    directionSamples: input.directionSamples ?? [],
    qualitativeFallback: fallback,
    professionalDiagnostics: {
      ...options.diagnostics,
      usedDirectionalProfile: false,
      validSampleCount: options.diagnostics.validSampleCount,
      notesZh: [...options.notesZh, fallback.summaryZh],
    },
  };
}

function qualitativeFallbackSummary(input: TerrainHorizonObstructionInput): {
  readonly terrainType?: TerrainType;
  readonly exposureType?: ExposureType;
  readonly viewingDirection?: TerrainViewingDirection;
  readonly summaryZh: string;
} {
  const terrainType = input.terrainType;
  const exposureType = input.exposureType;
  const viewingDirection = input.viewingDirection;

  if (
    terrainType === "summit" ||
    terrainType === "ridge" ||
    terrainType === "mountain_platform"
  ) {
    return {
      terrainType,
      exposureType,
      viewingDirection,
      summaryZh:
        "高山、山脊或观景平台机位可能拥有较低地平线，但仍需要目标方向剖面确认，不按无遮挡处理。",
    };
  }

  if (terrainType === "lake" && (exposureType === "exposed" || viewingDirection === "panoramic")) {
    return {
      terrainType,
      exposureType,
      viewingDirection,
      summaryZh:
        "湖面或开阔平台方向遮挡可能较低，但缺少目标方向剖面时只作为低置信度提示。",
    };
  }

  if (terrainType === "valley" || terrainType === "city" || terrainType === "slope") {
    return {
      terrainType,
      exposureType,
      viewingDirection,
      summaryZh: "谷地、城市或坡面机位的地形遮挡不确定，需现场确认目标方向视野。",
    };
  }

  return {
    terrainType,
    exposureType,
    viewingDirection,
    summaryZh: "当前地形类型不足以判断目标方向遮挡，需补充方向剖面或现场复核。",
  };
}

function normalizeMilkyWayDirectionSamples(input: {
  readonly targetAzimuth: number | undefined;
  readonly horizonProfile: TerrainAnalysisSummary["horizonProfile"];
  readonly dataSource: TerrainHorizonDataSource;
}): readonly TerrainHorizonDirectionSample[] {
  const existingSamples = input.horizonProfile.directionSamples ?? [];
  if (existingSamples.length > 0) {
    return existingSamples;
  }

  const horizonAngle = finiteNumber(input.horizonProfile.milkyWayHorizonAngle);
  if (input.targetAzimuth === undefined || horizonAngle === undefined) {
    return [];
  }

  return [
    {
      target: "milky_way",
      azimuthDegrees: round1(normalizeAzimuth(input.targetAzimuth)),
      horizonAltitudeDegrees: round1(horizonAngle),
      dataSource: input.dataSource,
      confidence: input.dataSource === "mock_terrain_profile" ? "medium" : "medium",
    },
  ];
}

function classifyTerrainHorizonClearance(clearanceDegrees: number): TerrainHorizonObstructionLevel {
  if (clearanceDegrees >= 3) {
    return "clear";
  }
  if (clearanceDegrees >= 0) {
    return "marginal";
  }
  return "obstructed";
}

function sampleHorizonAltitude(
  sample: TerrainHorizonDirectionSample,
  observerElevationMeters: number | undefined,
): number | undefined {
  const explicitHorizon = finiteNumber(sample.horizonAltitudeDegrees);
  if (explicitHorizon !== undefined) {
    return round1(explicitHorizon);
  }

  const elevation = finiteNumber(sample.elevationMeters);
  const distance = finiteNumber(sample.distanceMeters);
  if (elevation === undefined || distance === undefined || distance <= 0) {
    return undefined;
  }
  if (observerElevationMeters === undefined) {
    return undefined;
  }

  return round1((Math.atan((elevation - observerElevationMeters) / distance) * 180) / Math.PI);
}

function pickBlockingSample(samples: readonly ResolvedSample[]): ResolvedSample {
  return [...samples].sort(
    (left, right) =>
      right.horizonAltitudeDegrees - left.horizonAltitudeDegrees ||
      left.azimuthDeltaDegrees - right.azimuthDeltaDegrees,
  )[0]!;
}

function sampleDistanceRange(
  samples: readonly TerrainHorizonDirectionSample[],
): readonly [number, number] | undefined {
  const distances = samples
    .map((sample) => finiteNumber(sample.distanceMeters))
    .filter((distance): distance is number => distance !== undefined && distance >= 0);
  if (distances.length === 0) {
    return undefined;
  }
  return [Math.min(...distances), Math.max(...distances)] as const;
}

function nearestAzimuthDelta(
  targetAzimuth: number,
  samples: readonly TerrainHorizonDirectionSample[],
): number | null {
  const deltas = samples
    .map((sample) => finiteNumber(sample.azimuthDegrees))
    .filter((azimuth): azimuth is number => azimuth !== undefined)
    .map((azimuth) => circularDistanceDegrees(targetAzimuth, azimuth));
  return deltas.length > 0 ? round1(Math.min(...deltas)) : null;
}

function normalizeConfidence(confidence: TerrainHorizonConfidence): TerrainHorizonConfidence {
  return confidence === "unknown" ? "low" : confidence;
}

function circularDistanceDegrees(left: number, right: number): number {
  return Math.abs(((normalizeAzimuth(left) - normalizeAzimuth(right) + 180) % 360) - 180);
}

function normalizeAzimuth(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}
