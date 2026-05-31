import type { ProfessionalHourlyCloudLayerBasis } from "./types.js";

export type CloudLayerField = "high" | "mid" | "low";

export type CloudLayerCompletenessLevel = "complete" | "partial" | "weak" | "missing";

export type CloudLayerCautionLevel = "none" | "low" | "medium" | "high";

export type CloudLayerCompletenessHourlyRow = {
  readonly cloudTotalPercent?: number | null;
  readonly cloudHighPercent?: number | null;
  readonly cloudMidPercent?: number | null;
  readonly cloudLowPercent?: number | null;
  readonly cloudLayerBasis?: ProfessionalHourlyCloudLayerBasis;
  readonly missingFields?: readonly string[];
};

export type CloudLayerCompletenessContext = {
  readonly cloudLayerBasis: ProfessionalHourlyCloudLayerBasis;
  readonly hasTotalCloud: boolean;
  readonly hasHighCloudLayer: boolean;
  readonly hasMidCloudLayer: boolean;
  readonly hasLowCloudLayer: boolean;
  readonly missingLayerFields: readonly CloudLayerField[];
  readonly missingLayerHoursCount: number;
  readonly totalHoursCount: number;
  readonly completeLayerHoursCount: number;
  readonly lowLayerMissingHoursCount: number;
  readonly layerCompletenessLevel: CloudLayerCompletenessLevel;
  readonly cautionLevel: CloudLayerCautionLevel;
  readonly userNoteZh: string;
  readonly professionalNoteZh: string;
  readonly shouldReduceCloudSeaConfidence: boolean;
  readonly shouldPreferNeedsReviewSignal: boolean;
};

const cloudLayerFields = [
  { field: "high", valueKey: "cloudHighPercent", missingKey: "cloudHigh" },
  { field: "mid", valueKey: "cloudMidPercent", missingKey: "cloudMid" },
  { field: "low", valueKey: "cloudLowPercent", missingKey: "cloudLow" },
] as const satisfies readonly {
  readonly field: CloudLayerField;
  readonly valueKey: keyof CloudLayerCompletenessHourlyRow;
  readonly missingKey: string;
}[];

export function buildCloudLayerCompletenessContext(
  rows: readonly CloudLayerCompletenessHourlyRow[] | null | undefined,
): CloudLayerCompletenessContext {
  const hourlyRows = rows ?? [];
  const totalHoursCount = hourlyRows.length;
  let hasTotalCloud = false;
  let hasHighCloudLayer = false;
  let hasMidCloudLayer = false;
  let hasLowCloudLayer = false;
  let highMissingHoursCount = 0;
  let midMissingHoursCount = 0;
  let lowLayerMissingHoursCount = 0;
  let missingLayerHoursCount = 0;
  let completeLayerHoursCount = 0;

  for (const row of hourlyRows) {
    if (hasUsableTotalCloud(row)) {
      hasTotalCloud = true;
    }

    const hasHigh = hasUsableLayerValue(row, "high");
    const hasMid = hasUsableLayerValue(row, "mid");
    const hasLow = hasUsableLayerValue(row, "low");

    hasHighCloudLayer ||= hasHigh;
    hasMidCloudLayer ||= hasMid;
    hasLowCloudLayer ||= hasLow;

    if (!hasHigh) {
      highMissingHoursCount += 1;
    }
    if (!hasMid) {
      midMissingHoursCount += 1;
    }
    if (!hasLow) {
      lowLayerMissingHoursCount += 1;
    }

    if (hasHigh && hasMid && hasLow) {
      completeLayerHoursCount += 1;
    } else {
      missingLayerHoursCount += 1;
    }
  }

  const hasAnyLayer = hasHighCloudLayer || hasMidCloudLayer || hasLowCloudLayer;
  const cloudLayerBasis = classifyCloudLayerBasis({
    totalHoursCount,
    hasTotalCloud,
    hasAnyLayer,
    missingLayerHoursCount,
  });
  const missingLayerFields = cloudLayerFields
    .filter(({ field }) => {
      if (totalHoursCount === 0) {
        return false;
      }
      if (field === "high") {
        return highMissingHoursCount > 0;
      }
      if (field === "mid") {
        return midMissingHoursCount > 0;
      }
      return lowLayerMissingHoursCount > 0;
    })
    .map(({ field }) => field);
  const layerCompletenessLevel = classifyCloudLayerCompleteness({
    totalHoursCount,
    hasTotalCloud,
    hasAnyLayer,
    missingLayerHoursCount,
    completeLayerHoursCount,
    lowLayerMissingHoursCount,
  });
  const cautionLevel = cloudLayerCautionLevel(layerCompletenessLevel, lowLayerMissingHoursCount);
  const notes = cloudLayerCompletenessNotesZh(layerCompletenessLevel, cloudLayerBasis);

  return {
    cloudLayerBasis,
    hasTotalCloud,
    hasHighCloudLayer,
    hasMidCloudLayer,
    hasLowCloudLayer,
    missingLayerFields,
    missingLayerHoursCount,
    totalHoursCount,
    completeLayerHoursCount,
    lowLayerMissingHoursCount,
    layerCompletenessLevel,
    cautionLevel,
    userNoteZh: notes.userNoteZh,
    professionalNoteZh: notes.professionalNoteZh,
    shouldReduceCloudSeaConfidence: layerCompletenessLevel !== "complete",
    shouldPreferNeedsReviewSignal:
      lowLayerMissingHoursCount > 0 ||
      layerCompletenessLevel === "weak" ||
      layerCompletenessLevel === "missing",
  };
}

function hasUsableTotalCloud(row: CloudLayerCompletenessHourlyRow): boolean {
  return hasFiniteNumber(row.cloudTotalPercent) && !rowMissingFields(row).includes("cloudTotal");
}

function hasUsableLayerValue(
  row: CloudLayerCompletenessHourlyRow,
  field: CloudLayerField,
): boolean {
  if (row.cloudLayerBasis === "total_only" || row.cloudLayerBasis === "unknown") {
    return false;
  }

  const config = cloudLayerFields.find((item) => item.field === field);
  if (!config) {
    return false;
  }

  return (
    hasFiniteNumber(row[config.valueKey]) &&
    !rowMissingFields(row).includes(config.missingKey) &&
    !rowMissingFields(row).includes(field)
  );
}

function rowMissingFields(row: CloudLayerCompletenessHourlyRow): readonly string[] {
  return row.missingFields ?? [];
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function classifyCloudLayerBasis(input: {
  readonly totalHoursCount: number;
  readonly hasTotalCloud: boolean;
  readonly hasAnyLayer: boolean;
  readonly missingLayerHoursCount: number;
}): ProfessionalHourlyCloudLayerBasis {
  if (input.totalHoursCount === 0 || (!input.hasTotalCloud && !input.hasAnyLayer)) {
    return "unknown";
  }
  if (!input.hasAnyLayer && input.hasTotalCloud) {
    return "total_only";
  }
  if (input.missingLayerHoursCount === 0) {
    return "explicit_layers";
  }
  return "partial_layers";
}

function classifyCloudLayerCompleteness(input: {
  readonly totalHoursCount: number;
  readonly hasTotalCloud: boolean;
  readonly hasAnyLayer: boolean;
  readonly missingLayerHoursCount: number;
  readonly completeLayerHoursCount: number;
  readonly lowLayerMissingHoursCount: number;
}): CloudLayerCompletenessLevel {
  if (input.totalHoursCount === 0 || (!input.hasTotalCloud && !input.hasAnyLayer)) {
    return "missing";
  }
  if (!input.hasAnyLayer && input.hasTotalCloud) {
    return "missing";
  }
  if (input.missingLayerHoursCount === 0) {
    return "complete";
  }

  const missingRatio = input.missingLayerHoursCount / input.totalHoursCount;
  const completeRatio = input.completeLayerHoursCount / input.totalHoursCount;
  const lowMissingRatio = input.lowLayerMissingHoursCount / input.totalHoursCount;

  if (missingRatio >= 0.5 || completeRatio < 0.5 || lowMissingRatio >= 0.5) {
    return "weak";
  }
  return "partial";
}

function cloudLayerCautionLevel(
  level: CloudLayerCompletenessLevel,
  lowLayerMissingHoursCount: number,
): CloudLayerCautionLevel {
  if (level === "complete") {
    return "none";
  }
  if (level === "missing") {
    return "high";
  }
  if (level === "weak" || lowLayerMissingHoursCount > 0) {
    return "medium";
  }
  return "low";
}

function cloudLayerCompletenessNotesZh(
  level: CloudLayerCompletenessLevel,
  basis: ProfessionalHourlyCloudLayerBasis,
): Pick<CloudLayerCompletenessContext, "userNoteZh" | "professionalNoteZh"> {
  if (level === "complete") {
    return {
      userNoteZh: "低/中/高云分层较完整，可用于复核云海与白墙风险。",
      professionalNoteZh: "分层完整：低/中/高云数据较完整，可用于复核云海与白墙风险。",
    };
  }
  if (level === "partial") {
    return {
      userNoteZh: "部分时段缺少低/中/高云分层，云海与白墙判断需结合临近预报复核。",
      professionalNoteZh:
        "部分小时缺少低/中/高云分层，缺失值以 “—” 显示，不使用总云量回填。缺少低云分层时，云海与白墙判断需结合临近预报复核。",
    };
  }
  if (level === "weak") {
    return {
      userNoteZh: "较多时段缺少低/中/高云分层，云海形成与白墙风险需结合临近预报复核。",
      professionalNoteZh:
        "较多小时缺少低/中/高云分层，缺失值以 “—” 显示，不使用总云量回填。云海形成与白墙风险需结合临近预报复核。",
    };
  }
  if (basis === "total_only") {
    return {
      userNoteZh: "当前时段仅有总云量，缺少低/中/高云分层，云海与白墙判断置信度降低。",
      professionalNoteZh:
        "当前时段仅有总云量，缺少低/中/高云分层，缺失值以 “—” 显示，不使用总云量回填。云海形成、白墙风险和开口判断置信度降低，建议结合临近预报复核。",
    };
  }
  return {
    userNoteZh: "当前缺少可用云量分层，云海与白墙判断需临近预报复核。",
    professionalNoteZh:
      "当前缺少可用云量分层，缺失值以 “—” 显示，不使用总云量回填。云海形成与白墙风险需临近预报复核。",
  };
}
