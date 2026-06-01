import type { CloudLayerCompletenessContext } from "./cloud-layer-completeness.js";
import type { ProfessionalHourlyCloudLayerBasis } from "./types.js";

export type CloudSeaCloudBasisLevel =
  | "consistent"
  | "minor_mismatch"
  | "mixed_basis"
  | "partial_layers"
  | "total_only"
  | "unknown";

export type CloudSeaCloudBasisMismatchField = "high" | "mid" | "low";

export type CloudSeaCloudBasisHourlyRow = {
  readonly time?: string | null;
  readonly cloudTotalPercent?: number | null;
  readonly totalCloudPercent?: number | null;
  readonly cloudHighPercent?: number | null;
  readonly highCloudPercent?: number | null;
  readonly cloudMidPercent?: number | null;
  readonly midCloudPercent?: number | null;
  readonly cloudLowPercent?: number | null;
  readonly lowCloudPercent?: number | null;
  readonly cloudLayerBasis?: ProfessionalHourlyCloudLayerBasis;
  readonly missingFields?: readonly string[];
};

export type CloudSeaCloudBasisConsistencyInput = {
  readonly hourlyRows?: readonly CloudSeaCloudBasisHourlyRow[] | null;
  readonly cloudLayerCompletenessContext?: CloudLayerCompletenessContext | null;
  readonly focusedWindow?: {
    readonly startTime?: string | null;
    readonly endTime?: string | null;
  } | null;
  readonly providerAvailabilitySummary?: unknown;
  readonly terrainContext?: unknown;
};

export type CloudSeaCloudBasisConsistencyContext = {
  readonly cloudBasisLevel: CloudSeaCloudBasisLevel;
  readonly totalHoursCount: number;
  readonly comparableHoursCount: number;
  readonly mismatchHoursCount: number;
  readonly missingLayerHoursCount: number;
  readonly mismatchFields: readonly CloudSeaCloudBasisMismatchField[];
  readonly hasTotalLessThanAnyLayer: boolean;
  readonly hasTotalOnlyHours: boolean;
  readonly hasLayerOnlyHours: boolean;
  readonly hasPartialLayerHours: boolean;
  readonly shouldLowerCloudSeaConfidence: boolean;
  readonly shouldAvoidStrictLayerInterpretation: boolean;
  readonly shouldShowProfessionalNote: boolean;
  readonly userSummaryZh: string;
  readonly professionalSummaryZh: string;
  readonly rowNotesByHour?: Readonly<Record<string, string>>;
};

export const cloudSeaCloudBasisMinorMismatchTolerancePercent = 5;
export const cloudSeaCloudBasisMixedMismatchThresholdPercent = 15;

type NormalizedCloudBasisRow = {
  readonly time?: string | null;
  readonly total?: number;
  readonly high?: number;
  readonly mid?: number;
  readonly low?: number;
};

type RowBasisEvaluation = {
  readonly basisLevel: CloudSeaCloudBasisLevel;
  readonly comparable: boolean;
  readonly missingLayer: boolean;
  readonly totalOnly: boolean;
  readonly layerOnly: boolean;
  readonly partialLayer: boolean;
  readonly mismatchFields: readonly CloudSeaCloudBasisMismatchField[];
};

const cloudLayerFields = ["high", "mid", "low"] as const;

export function buildCloudSeaCloudBasisConsistencyContext(
  input:
    | CloudSeaCloudBasisConsistencyInput
    | readonly CloudSeaCloudBasisHourlyRow[]
    | null
    | undefined = {},
): CloudSeaCloudBasisConsistencyContext {
  const normalizedInput: CloudSeaCloudBasisConsistencyInput = Array.isArray(input)
    ? { hourlyRows: input as readonly CloudSeaCloudBasisHourlyRow[] }
    : ((input ?? {}) as CloudSeaCloudBasisConsistencyInput);
  const rows = rowsForFocusedWindow(
    normalizedInput.hourlyRows ?? [],
    normalizedInput.focusedWindow,
  ).map(normalizeCloudBasisRow);
  const totalHoursCount = rows.length;
  const rowEvaluations = rows.map(evaluateCloudBasisRow);
  const comparableHoursCount = rowEvaluations.filter((row) => row.comparable).length;
  const mismatchRows = rowEvaluations.filter((row) => row.mismatchFields.length > 0);
  const mismatchHoursCount = mismatchRows.length;
  const missingLayerHoursCount = rowEvaluations.filter((row) => row.missingLayer).length;
  const hasTotalOnlyHours = rowEvaluations.some((row) => row.totalOnly);
  const hasLayerOnlyHours = rowEvaluations.some((row) => row.layerOnly);
  const hasPartialLayerHours = rowEvaluations.some((row) => row.partialLayer);
  const mismatchFields = uniqueCloudLayerFields(mismatchRows.flatMap((row) => row.mismatchFields));
  const rowNotesByHour = buildRowNotesByHour(rows, rowEvaluations);
  const hasAnyCloudValue = rows.some((row) =>
    [row.total, row.high, row.mid, row.low].some((value) => value !== undefined),
  );
  const hasSignificantMismatch = rowEvaluations.some((row) => row.basisLevel === "mixed_basis");
  const hasMinorMismatch = rowEvaluations.some((row) => row.basisLevel === "minor_mismatch");
  const cloudBasisLevel = classifyCloudBasisLevel({
    totalHoursCount,
    hasAnyCloudValue,
    comparableHoursCount,
    hasSignificantMismatch,
    hasMinorMismatch,
    hasTotalOnlyHours,
    hasLayerOnlyHours,
    hasPartialLayerHours,
  });
  const weakPartialLayers = isWeakPartialLayerContext(
    cloudBasisLevel,
    missingLayerHoursCount,
    totalHoursCount,
    normalizedInput.cloudLayerCompletenessContext,
  );
  const shouldLowerCloudSeaConfidence =
    cloudBasisLevel === "mixed_basis" ||
    cloudBasisLevel === "total_only" ||
    weakPartialLayers ||
    (cloudBasisLevel === "minor_mismatch" &&
      comparableHoursCount > 0 &&
      mismatchHoursCount / comparableHoursCount >= 0.5);
  const shouldAvoidStrictLayerInterpretation =
    cloudBasisLevel === "minor_mismatch" ||
    cloudBasisLevel === "mixed_basis" ||
    cloudBasisLevel === "partial_layers" ||
    cloudBasisLevel === "total_only" ||
    hasLayerOnlyHours;
  const summaries = cloudBasisSummariesZh(cloudBasisLevel, {
    weakPartialLayers,
    hasLayerOnlyHours,
  });

  return {
    cloudBasisLevel,
    totalHoursCount,
    comparableHoursCount,
    mismatchHoursCount,
    missingLayerHoursCount,
    mismatchFields,
    hasTotalLessThanAnyLayer: mismatchHoursCount > 0,
    hasTotalOnlyHours,
    hasLayerOnlyHours,
    hasPartialLayerHours,
    shouldLowerCloudSeaConfidence,
    shouldAvoidStrictLayerInterpretation,
    shouldShowProfessionalNote: totalHoursCount > 0,
    userSummaryZh: summaries.userSummaryZh,
    professionalSummaryZh: summaries.professionalSummaryZh,
    rowNotesByHour: Object.keys(rowNotesByHour).length > 0 ? rowNotesByHour : undefined,
  };
}

function rowsForFocusedWindow(
  rows: readonly CloudSeaCloudBasisHourlyRow[],
  focusedWindow: CloudSeaCloudBasisConsistencyInput["focusedWindow"],
): readonly CloudSeaCloudBasisHourlyRow[] {
  if (!focusedWindow?.startTime || !focusedWindow.endTime || rows.length === 0) {
    return rows;
  }
  const start = Date.parse(focusedWindow.startTime);
  const end = Date.parse(focusedWindow.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return rows;
  }
  const focusedRows = rows.filter((row) => {
    if (!row.time) {
      return false;
    }
    const time = Date.parse(row.time);
    return Number.isFinite(time) && time >= start && time <= end;
  });
  return focusedRows.length > 0 ? focusedRows : rows;
}

function normalizeCloudBasisRow(row: CloudSeaCloudBasisHourlyRow): NormalizedCloudBasisRow {
  return {
    time: row.time,
    total: usableFieldValue(row, "cloudTotal"),
    high: usableFieldValue(row, "high"),
    mid: usableFieldValue(row, "mid"),
    low: usableFieldValue(row, "low"),
  };
}

function usableFieldValue(
  row: CloudSeaCloudBasisHourlyRow,
  field: "cloudTotal" | CloudSeaCloudBasisMismatchField,
): number | undefined {
  const missingFields = row.missingFields ?? [];
  if (missingFields.includes(field)) {
    return undefined;
  }

  if (field === "cloudTotal") {
    if (missingFields.includes("total") || missingFields.includes("cloudTotalPercent")) {
      return undefined;
    }
    return finiteNumber(row.cloudTotalPercent ?? row.totalCloudPercent);
  }

  const missingField = field === "high" ? "cloudHigh" : field === "mid" ? "cloudMid" : "cloudLow";
  if (missingFields.includes(missingField) || missingFields.includes(`${field}Cloud`)) {
    return undefined;
  }

  if (field === "high") {
    return finiteNumber(row.cloudHighPercent ?? row.highCloudPercent);
  }
  if (field === "mid") {
    return finiteNumber(row.cloudMidPercent ?? row.midCloudPercent);
  }
  return finiteNumber(row.cloudLowPercent ?? row.lowCloudPercent);
}

function evaluateCloudBasisRow(row: NormalizedCloudBasisRow): RowBasisEvaluation {
  const layerValues = [
    ["high", row.high],
    ["mid", row.mid],
    ["low", row.low],
  ] as const;
  const availableLayers = layerValues.filter(
    (item): item is readonly [CloudSeaCloudBasisMismatchField, number] => item[1] !== undefined,
  );
  const totalExists = row.total !== undefined;
  const allLayersExist = availableLayers.length === cloudLayerFields.length;
  const partialLayer = availableLayers.length > 0 && !allLayersExist;
  const missingLayer = !allLayersExist;
  const totalOnly = totalExists && availableLayers.length === 0;
  const layerOnly = !totalExists && availableLayers.length > 0;

  if (!totalExists && availableLayers.length === 0) {
    return {
      basisLevel: "unknown",
      comparable: false,
      missingLayer,
      totalOnly: false,
      layerOnly: false,
      partialLayer: false,
      mismatchFields: [],
    };
  }

  if (totalOnly) {
    return {
      basisLevel: "total_only",
      comparable: false,
      missingLayer,
      totalOnly,
      layerOnly: false,
      partialLayer: false,
      mismatchFields: [],
    };
  }

  if (!totalExists) {
    return {
      basisLevel: "partial_layers",
      comparable: false,
      missingLayer,
      totalOnly: false,
      layerOnly,
      partialLayer: true,
      mismatchFields: [],
    };
  }

  const mismatchFields = availableLayers
    .filter(
      ([, layerValue]) => row.total! + cloudSeaCloudBasisMinorMismatchTolerancePercent < layerValue,
    )
    .map(([field]) => field);
  const maxLayerCloud = Math.max(...availableLayers.map(([, layerValue]) => layerValue));
  const basisLevel =
    row.total + cloudSeaCloudBasisMixedMismatchThresholdPercent < maxLayerCloud
      ? "mixed_basis"
      : row.total + cloudSeaCloudBasisMinorMismatchTolerancePercent < maxLayerCloud
        ? "minor_mismatch"
        : partialLayer
          ? "partial_layers"
          : "consistent";

  return {
    basisLevel,
    comparable: true,
    missingLayer,
    totalOnly: false,
    layerOnly: false,
    partialLayer,
    mismatchFields,
  };
}

function classifyCloudBasisLevel(input: {
  readonly totalHoursCount: number;
  readonly hasAnyCloudValue: boolean;
  readonly comparableHoursCount: number;
  readonly hasSignificantMismatch: boolean;
  readonly hasMinorMismatch: boolean;
  readonly hasTotalOnlyHours: boolean;
  readonly hasLayerOnlyHours: boolean;
  readonly hasPartialLayerHours: boolean;
}): CloudSeaCloudBasisLevel {
  if (input.totalHoursCount === 0 || !input.hasAnyCloudValue) {
    return "unknown";
  }
  if (input.hasSignificantMismatch) {
    return "mixed_basis";
  }
  if (input.hasMinorMismatch) {
    return "minor_mismatch";
  }
  if (
    input.hasTotalOnlyHours &&
    input.comparableHoursCount === 0 &&
    !input.hasLayerOnlyHours &&
    !input.hasPartialLayerHours
  ) {
    return "total_only";
  }
  if (input.hasTotalOnlyHours || input.hasLayerOnlyHours || input.hasPartialLayerHours) {
    return "partial_layers";
  }
  if (input.comparableHoursCount > 0) {
    return "consistent";
  }
  return "unknown";
}

function isWeakPartialLayerContext(
  level: CloudSeaCloudBasisLevel,
  missingLayerHoursCount: number,
  totalHoursCount: number,
  completeness: CloudLayerCompletenessContext | null | undefined,
): boolean {
  if (level !== "partial_layers") {
    return false;
  }
  if (
    completeness?.layerCompletenessLevel === "weak" ||
    completeness?.layerCompletenessLevel === "missing"
  ) {
    return true;
  }
  return totalHoursCount > 0 && missingLayerHoursCount / totalHoursCount >= 0.5;
}

function buildRowNotesByHour(
  rows: readonly NormalizedCloudBasisRow[],
  evaluations: readonly RowBasisEvaluation[],
): Record<string, string> {
  const rowNotesByHour: Record<string, string> = {};
  rows.forEach((row, index) => {
    if (!row.time || evaluations[index]?.mismatchFields.length === 0) {
      return;
    }
    rowNotesByHour[row.time] =
      evaluations[index]?.basisLevel === "mixed_basis" ? "口径需复核" : "分层参考";
  });
  return rowNotesByHour;
}

function cloudBasisSummariesZh(
  level: CloudSeaCloudBasisLevel,
  context: { readonly weakPartialLayers: boolean; readonly hasLayerOnlyHours: boolean },
): Pick<CloudSeaCloudBasisConsistencyContext, "userSummaryZh" | "professionalSummaryZh"> {
  if (level === "consistent") {
    return {
      userSummaryZh: "云量口径一致：总云量与低/中/高云分层较一致，可用于复核云海。",
      professionalSummaryZh: "云量口径：总云量与低/中/高云分层口径较一致。",
    };
  }
  if (level === "minor_mismatch") {
    return {
      userSummaryZh: "云量口径需轻度复核：少数时段总云量略低于分层云量。",
      professionalSummaryZh:
        "云量口径：少数时段总云量略低于分层云量，可能受取整或插值影响，分层云量仅作趋势复核。",
    };
  }
  if (level === "mixed_basis") {
    return {
      userSummaryZh: "云量口径不一致，云海判断需以低云、地形和临近预报复核为主。",
      professionalSummaryZh:
        "云量口径：总云量与分层云量存在口径差异，分层云量仅作趋势复核，云海判断以低云、地形和临近预报复核为主。",
    };
  }
  if (level === "partial_layers") {
    return {
      userSummaryZh: context.weakPartialLayers
        ? "分层云量不完整，云海与白墙判断需临近复核。"
        : "部分时段分层云量不完整，缺失值不会用总云量回填。",
      professionalSummaryZh: context.hasLayerOnlyHours
        ? "云量口径：部分时段缺少总云量或低/中/高云分层，缺失值以 “—” 显示，分层云量仅作趋势复核。"
        : "云量口径：部分时段缺少低/中/高云分层，缺失值以 “—” 显示，不使用总云量回填。",
    };
  }
  if (level === "total_only") {
    return {
      userSummaryZh: "仅总云量，低云分层缺失，不能独立判断云海和白墙风险。",
      professionalSummaryZh:
        "云量口径：当前仅有总云量，缺少低/中/高云分层，不足以完整判断云海和白墙风险；缺失值以 “—” 显示，不使用总云量回填。",
    };
  }
  return {
    userSummaryZh: "云量字段不足，云海和白墙判断需临近复核。",
    professionalSummaryZh: "云量口径：当前云量字段不足，云海和白墙判断需临近复核。",
  };
}

function uniqueCloudLayerFields(
  values: readonly CloudSeaCloudBasisMismatchField[],
): readonly CloudSeaCloudBasisMismatchField[] {
  return cloudLayerFields.filter((field) => values.includes(field));
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
