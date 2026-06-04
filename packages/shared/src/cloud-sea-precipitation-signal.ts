import type { TerrainMode, TerrainType } from "./types.js";
import { formatForecastWindowZh } from "./window-format.js";

export type CloudSeaPrecipitationSignalLevel =
  | "none"
  | "low"
  | "disturbance"
  | "meaningful"
  | "strong"
  | "unknown";

export type CloudSeaPrecipitationSignalType =
  | "none"
  | "probability_only"
  | "light_disturbance"
  | "short_shower"
  | "meaningful_rain"
  | "sustained_rain"
  | "unknown";

export type CloudSeaPrecipitationImpactLevel = "none" | "low" | "medium" | "high" | "unknown";

export type CloudSeaPrecipitationProbabilityClass =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "very_high"
  | "unknown";

export type CloudSeaPrecipitationAmountClass =
  | "none"
  | "trace"
  | "light"
  | "moderate"
  | "heavy"
  | "unknown";

export type CloudSeaPrecipitationSignalWindow = {
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly label?: string | null;
};

export type CloudSeaPrecipitationHourlyRow = {
  readonly time?: string | null;
  readonly precipitationAmountMm?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly windSpeedMs?: number | null;
  readonly visibilityMeters?: number | null;
};

export type CloudSeaPrecipitationSignalInput = {
  readonly precipitationAmountMm?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly hourlyRows?: readonly CloudSeaPrecipitationHourlyRow[] | null;
  readonly timezone?: string | null;
  readonly focusedWindow?: CloudSeaPrecipitationSignalWindow | null;
  readonly bestWindow?: CloudSeaPrecipitationSignalWindow | null;
  readonly arrivalWindow?: CloudSeaPrecipitationSignalWindow | null;
  readonly terrainContext?: {
    readonly terrainMode?: TerrainMode | string | null;
    readonly terrainType?: TerrainType | string | null;
    readonly elevationMeters?: number | null;
    readonly surroundingReliefMeters?: number | null;
  } | null;
  readonly windSpeedMs?: number | null;
  readonly visibilityKm?: number | null;
  readonly cloudLayerCompletenessContext?: unknown;
  readonly weatherVariableConsistencyContext?: unknown;
};

export type CloudSeaPrecipitationSignalContext = {
  readonly precipitationSignalLevel: CloudSeaPrecipitationSignalLevel;
  readonly precipitationSignalType: CloudSeaPrecipitationSignalType;
  readonly precipitationImpactLevel: CloudSeaPrecipitationImpactLevel;
  readonly probabilityClass: CloudSeaPrecipitationProbabilityClass;
  readonly amountClass: CloudSeaPrecipitationAmountClass;
  readonly affectsMainWindow: boolean;
  readonly affectsArrivalWindow: boolean;
  readonly affectsEquipment: boolean;
  readonly affectsRoadSafety: boolean;
  readonly shouldDowngradeWindow: boolean;
  readonly shouldAvoidStrongRainWording: boolean;
  readonly mainTimeRangeZh: string;
  readonly userSummaryZh: string;
  readonly professionalSummaryZh: string;
  readonly riskLabelZh: string;
  readonly actionAdviceZh: string;
  readonly equipmentAdviceZh: string;
  readonly maxProbabilityPercent: number | null;
  readonly maxAmountMm: number | null;
  readonly maxHourlyAmountMm: number | null;
  readonly totalAmountMm: number | null;
  readonly focusedWindowMaxProbabilityPercent: number | null;
  readonly focusedWindowMaxAmountMm: number | null;
  readonly focusedWindowTotalAmountMm: number | null;
  readonly affectedHoursCount: number;
  readonly hasProbabilityData: boolean;
  readonly hasAmountData: boolean;
  readonly amountBasis: "focused_window" | "expanded_window" | "all_rows" | "direct_input" | "none";
};

type PrecipitationSnapshot = {
  readonly time?: string;
  readonly precipitationAmountMm?: number;
  readonly precipitationProbabilityPercent?: number;
  readonly windSpeedMs?: number;
  readonly visibilityKm?: number;
};

type NormalizedSignalWindow = {
  readonly startTime: string;
  readonly endTime: string;
};

type PrecipitationStats = {
  readonly maxProbabilityPercent?: number;
  readonly maxHourlyAmountMm?: number;
  readonly totalAmountMm?: number;
  readonly maxAmountMm?: number;
  readonly hasProbabilityData: boolean;
  readonly hasAmountData: boolean;
  readonly affectedHoursCount: number;
};

const preWindowMinutes = 120;

export function buildCloudSeaPrecipitationSignalContext(
  input: CloudSeaPrecipitationSignalInput = {},
): CloudSeaPrecipitationSignalContext {
  const hourlySnapshots = (input.hourlyRows ?? []).map(snapshotFromHourlyRow);
  const directSnapshot = optionalDirectSnapshot(input);
  const allSnapshots = [...hourlySnapshots, ...directSnapshot];
  const mainWindow = normalizedWindow(input.focusedWindow ?? input.bestWindow);
  const arrivalWindow = normalizedWindow(input.arrivalWindow) ?? arrivalWindowFromMain(mainWindow);
  const expandedWindow = expandWindowBefore(mainWindow, preWindowMinutes);
  const mainRows = mainWindow ? rowsForWindow(allSnapshots, mainWindow) : [];
  const arrivalRows = arrivalWindow ? rowsForWindow(allSnapshots, arrivalWindow) : [];
  const expandedRows = expandedWindow ? rowsForWindow(allSnapshots, expandedWindow) : [];
  const directOnly = hourlySnapshots.length === 0 && directSnapshot.length > 0;
  const basisRows =
    expandedRows.length > 0
      ? expandedRows
      : mainRows.length > 0
        ? mainRows
        : allSnapshots.length > 0
          ? allSnapshots
          : [];
  const amountBasis: CloudSeaPrecipitationSignalContext["amountBasis"] =
    expandedRows.length > 0
      ? "expanded_window"
      : mainRows.length > 0
        ? "focused_window"
        : directOnly
          ? "direct_input"
          : allSnapshots.length > 0
            ? "all_rows"
            : "none";
  const basisStats = summarizeSnapshots(basisRows);
  const mainStats = summarizeSnapshots(mainRows);
  const arrivalStats = summarizeSnapshots(arrivalRows);
  const probabilityClass = classifyProbability(basisStats.maxProbabilityPercent);
  const amountClass = classifyAmount(
    basisStats.maxAmountMm,
    basisStats.hasAmountData,
    probabilityClass,
  );
  const precipitationSignalType = classifySignalType({
    amountClass,
    probabilityClass,
    hasAmountData: basisStats.hasAmountData,
    hasProbabilityData: basisStats.hasProbabilityData,
  });
  const precipitationSignalLevel = classifySignalLevel(
    precipitationSignalType,
    probabilityClass,
    amountClass,
  );
  const affectsMainWindow =
    directOnly && !mainWindow
      ? hasPrecipitationSignal(basisStats)
      : hasPrecipitationSignal(mainStats);
  const affectsArrivalWindow = hasPrecipitationSignal(arrivalStats);
  const precipitationImpactLevel = classifyImpactLevel({
    precipitationSignalType,
    amountClass,
    hasWindow: Boolean(mainWindow),
    affectsMainWindow,
    affectsArrivalWindow,
    hasAmountData: basisStats.hasAmountData,
  });
  const shouldDowngradeWindow =
    (affectsMainWindow &&
      (precipitationSignalType === "meaningful_rain" ||
        precipitationSignalType === "sustained_rain")) ||
    (affectsArrivalWindow && precipitationSignalType === "sustained_rain");
  const affectsEquipment =
    precipitationSignalType !== "none" && precipitationSignalType !== "unknown";
  const affectsRoadSafety =
    (precipitationSignalType === "sustained_rain" && (affectsMainWindow || affectsArrivalWindow)) ||
    (precipitationSignalType === "meaningful_rain" &&
      (affectsMainWindow || affectsArrivalWindow) &&
      (isStrongWind(input.windSpeedMs) || isPoorVisibility(input.visibilityKm)));
  const shouldAvoidStrongRainWording =
    precipitationSignalType === "probability_only" ||
    precipitationSignalType === "light_disturbance" ||
    precipitationSignalType === "short_shower" ||
    amountClass === "trace" ||
    amountClass === "light" ||
    amountClass === "unknown" ||
    precipitationImpactLevel === "low" ||
    precipitationImpactLevel === "unknown";
  const mainTimeRangeZh = formatMainTimeRange(mainWindow, input.timezone);
  const copy = buildSignalCopy({
    precipitationSignalType,
    precipitationSignalLevel,
    precipitationImpactLevel,
    probabilityClass,
    amountClass,
    affectsMainWindow,
    affectsArrivalWindow,
    shouldDowngradeWindow,
    hasAmountData: basisStats.hasAmountData,
    hasProbabilityData: basisStats.hasProbabilityData,
    mainTimeRangeZh,
    stats: basisStats,
  });

  return {
    precipitationSignalLevel,
    precipitationSignalType,
    precipitationImpactLevel,
    probabilityClass,
    amountClass,
    affectsMainWindow,
    affectsArrivalWindow,
    affectsEquipment,
    affectsRoadSafety,
    shouldDowngradeWindow,
    shouldAvoidStrongRainWording,
    mainTimeRangeZh,
    userSummaryZh: copy.userSummaryZh,
    professionalSummaryZh: copy.professionalSummaryZh,
    riskLabelZh: copy.riskLabelZh,
    actionAdviceZh: copy.actionAdviceZh,
    equipmentAdviceZh: copy.equipmentAdviceZh,
    maxProbabilityPercent: basisStats.maxProbabilityPercent ?? null,
    maxAmountMm: basisStats.maxAmountMm ?? null,
    maxHourlyAmountMm: basisStats.maxHourlyAmountMm ?? null,
    totalAmountMm: basisStats.totalAmountMm ?? null,
    focusedWindowMaxProbabilityPercent: mainStats.maxProbabilityPercent ?? null,
    focusedWindowMaxAmountMm: mainStats.maxAmountMm ?? null,
    focusedWindowTotalAmountMm: mainStats.totalAmountMm ?? null,
    affectedHoursCount: basisStats.affectedHoursCount,
    hasProbabilityData: basisStats.hasProbabilityData,
    hasAmountData: basisStats.hasAmountData,
    amountBasis,
  };
}

function snapshotFromHourlyRow(row: CloudSeaPrecipitationHourlyRow): PrecipitationSnapshot {
  return {
    time: row.time ?? undefined,
    precipitationAmountMm: finiteNumber(row.precipitationAmountMm),
    precipitationProbabilityPercent: finiteNumber(row.precipitationProbabilityPercent),
    windSpeedMs: finiteNumber(row.windSpeedMs),
    visibilityKm:
      typeof row.visibilityMeters === "number" && Number.isFinite(row.visibilityMeters)
        ? row.visibilityMeters / 1000
        : undefined,
  };
}

function optionalDirectSnapshot(
  input: CloudSeaPrecipitationSignalInput,
): readonly PrecipitationSnapshot[] {
  const precipitationAmountMm = finiteNumber(input.precipitationAmountMm);
  const precipitationProbabilityPercent = finiteNumber(input.precipitationProbabilityPercent);
  const windSpeedMs = finiteNumber(input.windSpeedMs);
  const visibilityKm = finiteNumber(input.visibilityKm);
  if (
    precipitationAmountMm === undefined &&
    precipitationProbabilityPercent === undefined &&
    windSpeedMs === undefined &&
    visibilityKm === undefined
  ) {
    return [];
  }

  return [
    {
      time:
        input.focusedWindow?.startTime ??
        input.bestWindow?.startTime ??
        input.arrivalWindow?.startTime ??
        undefined,
      precipitationAmountMm,
      precipitationProbabilityPercent,
      windSpeedMs,
      visibilityKm,
    },
  ];
}

function summarizeSnapshots(rows: readonly PrecipitationSnapshot[]): PrecipitationStats {
  const amountValues = rows
    .map((row) => row.precipitationAmountMm)
    .filter((value): value is number => isFiniteNumber(value));
  const probabilityValues = rows
    .map((row) => row.precipitationProbabilityPercent)
    .filter((value): value is number => isFiniteNumber(value));
  const totalAmountMm =
    amountValues.length > 0
      ? roundPrecipitation(amountValues.reduce((sum, value) => sum + Math.max(0, value), 0))
      : undefined;
  const maxHourlyAmountMm =
    amountValues.length > 0 ? roundPrecipitation(Math.max(...amountValues)) : undefined;
  const maxAmountMm =
    maxHourlyAmountMm !== undefined || totalAmountMm !== undefined
      ? Math.max(maxHourlyAmountMm ?? 0, totalAmountMm ?? 0)
      : undefined;

  return {
    maxProbabilityPercent:
      probabilityValues.length > 0 ? Math.max(...probabilityValues) : undefined,
    maxHourlyAmountMm,
    totalAmountMm,
    maxAmountMm,
    hasProbabilityData: probabilityValues.length > 0,
    hasAmountData: amountValues.length > 0,
    affectedHoursCount: rows.filter((row) =>
      hasPrecipitationSignal({
        maxProbabilityPercent: row.precipitationProbabilityPercent,
        maxHourlyAmountMm: row.precipitationAmountMm,
        totalAmountMm: row.precipitationAmountMm,
        maxAmountMm: row.precipitationAmountMm,
        hasProbabilityData: isFiniteNumber(row.precipitationProbabilityPercent),
        hasAmountData: isFiniteNumber(row.precipitationAmountMm),
        affectedHoursCount: 0,
      }),
    ).length,
  };
}

function classifyProbability(value: number | undefined): CloudSeaPrecipitationProbabilityClass {
  if (!isFiniteNumber(value)) {
    return "unknown";
  }
  if (value <= 5) {
    return "none";
  }
  if (value < 30) {
    return "low";
  }
  if (value < 60) {
    return "medium";
  }
  if (value < 80) {
    return "high";
  }
  return "very_high";
}

function classifyAmount(
  value: number | undefined,
  hasAmountData: boolean,
  probabilityClass: CloudSeaPrecipitationProbabilityClass,
): CloudSeaPrecipitationAmountClass {
  if (!hasAmountData) {
    return probabilityClass === "unknown" || probabilityClass === "none" ? "none" : "unknown";
  }
  if (!isFiniteNumber(value) || value <= 0) {
    return "none";
  }
  if (value <= 0.2) {
    return "trace";
  }
  if (value < 1) {
    return "light";
  }
  if (value < 3) {
    return "moderate";
  }
  return "heavy";
}

function classifySignalType(input: {
  readonly amountClass: CloudSeaPrecipitationAmountClass;
  readonly probabilityClass: CloudSeaPrecipitationProbabilityClass;
  readonly hasAmountData: boolean;
  readonly hasProbabilityData: boolean;
}): CloudSeaPrecipitationSignalType {
  if (!input.hasAmountData && !input.hasProbabilityData) {
    return "unknown";
  }
  if (input.amountClass === "heavy") {
    return "sustained_rain";
  }
  if (input.amountClass === "moderate") {
    return "meaningful_rain";
  }
  if (input.amountClass === "light") {
    return input.probabilityClass === "high" || input.probabilityClass === "very_high"
      ? "short_shower"
      : "light_disturbance";
  }
  if (input.amountClass === "trace") {
    return "light_disturbance";
  }
  if (input.amountClass === "unknown") {
    return input.probabilityClass === "medium" ||
      input.probabilityClass === "high" ||
      input.probabilityClass === "very_high"
      ? "probability_only"
      : "unknown";
  }
  if (
    input.probabilityClass === "medium" ||
    input.probabilityClass === "high" ||
    input.probabilityClass === "very_high"
  ) {
    return "probability_only";
  }
  return "none";
}

function classifySignalLevel(
  signalType: CloudSeaPrecipitationSignalType,
  probabilityClass: CloudSeaPrecipitationProbabilityClass,
  amountClass: CloudSeaPrecipitationAmountClass,
): CloudSeaPrecipitationSignalLevel {
  if (signalType === "unknown") {
    return "unknown";
  }
  if (signalType === "none") {
    return "none";
  }
  if (signalType === "sustained_rain") {
    return "strong";
  }
  if (signalType === "meaningful_rain") {
    return "meaningful";
  }
  if (
    signalType === "short_shower" ||
    probabilityClass === "high" ||
    probabilityClass === "very_high"
  ) {
    return "disturbance";
  }
  return amountClass === "trace" || amountClass === "light" ? "low" : "disturbance";
}

function classifyImpactLevel(input: {
  readonly precipitationSignalType: CloudSeaPrecipitationSignalType;
  readonly amountClass: CloudSeaPrecipitationAmountClass;
  readonly hasWindow: boolean;
  readonly affectsMainWindow: boolean;
  readonly affectsArrivalWindow: boolean;
  readonly hasAmountData: boolean;
}): CloudSeaPrecipitationImpactLevel {
  if (input.precipitationSignalType === "none") {
    return "none";
  }
  if (input.precipitationSignalType === "unknown") {
    return "unknown";
  }
  if (!input.hasWindow) {
    if (input.precipitationSignalType === "sustained_rain") {
      return "high";
    }
    if (input.precipitationSignalType === "meaningful_rain") {
      return "medium";
    }
    return input.hasAmountData ? "low" : "unknown";
  }
  if (!input.affectsMainWindow && !input.affectsArrivalWindow) {
    return "low";
  }
  if (input.precipitationSignalType === "sustained_rain") {
    return "high";
  }
  if (input.precipitationSignalType === "meaningful_rain") {
    return "medium";
  }
  if (input.precipitationSignalType === "short_shower" && input.affectsMainWindow) {
    return "medium";
  }
  return input.amountClass === "unknown" ? "unknown" : "low";
}

function hasPrecipitationSignal(stats: PrecipitationStats): boolean {
  return (
    (stats.hasAmountData && (stats.maxAmountMm ?? 0) > 0) ||
    (stats.hasProbabilityData && (stats.maxProbabilityPercent ?? 0) > 5)
  );
}

function buildSignalCopy(input: {
  readonly precipitationSignalType: CloudSeaPrecipitationSignalType;
  readonly precipitationSignalLevel: CloudSeaPrecipitationSignalLevel;
  readonly precipitationImpactLevel: CloudSeaPrecipitationImpactLevel;
  readonly probabilityClass: CloudSeaPrecipitationProbabilityClass;
  readonly amountClass: CloudSeaPrecipitationAmountClass;
  readonly affectsMainWindow: boolean;
  readonly affectsArrivalWindow: boolean;
  readonly shouldDowngradeWindow: boolean;
  readonly hasAmountData: boolean;
  readonly hasProbabilityData: boolean;
  readonly mainTimeRangeZh: string;
  readonly stats: PrecipitationStats;
}): Pick<
  CloudSeaPrecipitationSignalContext,
  "userSummaryZh" | "professionalSummaryZh" | "riskLabelZh" | "actionAdviceZh" | "equipmentAdviceZh"
> {
  const probabilityText = input.hasProbabilityData
    ? `降水概率 ${Math.round(input.stats.maxProbabilityPercent ?? 0)}%`
    : "降水概率缺测";
  const amountText = input.hasAmountData
    ? `预计雨量 ${formatMillimeters(input.stats.maxAmountMm ?? 0)}`
    : "雨量数据不足";
  const overlapText = input.affectsMainWindow
    ? "影响主窗口"
    : input.affectsArrivalWindow
      ? "主要影响到达/提前准备时段"
      : "主要不在主窗口内";
  const professionalSummaryZh = `${probabilityText}，${amountText}，概率等级 ${input.probabilityClass}，雨量等级 ${input.amountClass}，${overlapText}；主窗口：${input.mainTimeRangeZh}。`;

  if (input.precipitationSignalType === "unknown") {
    return {
      riskLabelZh: "降水待复核",
      userSummaryZh: "降水概率和雨量数据不足，需临近复核后再判断窗口稳定性。",
      professionalSummaryZh,
      actionAdviceZh: "出发前复核雷达和短临预报，暂不按强降水或无降水下结论。",
      equipmentAdviceZh: "按防潮、镜头布和轻量防雨做基础准备。",
    };
  }

  if (input.precipitationSignalType === "none") {
    return {
      riskLabelZh: "无明显降水",
      userSummaryZh: "主窗口附近暂无明显降水信号，仍需临近复核云层、能见度和风。",
      professionalSummaryZh,
      actionAdviceZh: "不因降水否定窗口，重点复核低云高度和能见度。",
      equipmentAdviceZh: "按清晨防潮和镜头结露准备。",
    };
  }

  if (!input.hasAmountData && input.hasProbabilityData) {
    return {
      riskLabelZh: "降水待复核",
      userSummaryZh: "降水概率可参考，但雨量数据不足，需临近复核。",
      professionalSummaryZh,
      actionAdviceZh: "出发前复核雷达和短临预报，不仅凭概率信号直接否定窗口。",
      equipmentAdviceZh: "准备防潮和轻量防雨，等待雨量数据确认后再加重防护。",
    };
  }

  if (input.precipitationSignalType === "probability_only" || input.amountClass === "trace") {
    return {
      riskLabelZh: "局地扰动",
      userSummaryZh: "降水概率偏高但雨量很小，更像局地短时扰动信号，主要影响器材防护和窗口稳定性。",
      professionalSummaryZh,
      actionAdviceZh: "出发前复核雷达和短临预报，不因概率信号直接否定窗口。",
      equipmentAdviceZh: "准备防潮和轻量防雨。",
    };
  }

  if (
    input.precipitationSignalType === "light_disturbance" ||
    input.precipitationSignalType === "short_shower"
  ) {
    return {
      riskLabelZh: "短时小雨",
      userSummaryZh: "可能有短时小雨或局地扰动，主要影响窗口稳定性和器材防护。",
      professionalSummaryZh,
      actionAdviceZh: input.affectsMainWindow
        ? "主窗口需临近复核雨带位置，保留短时等待和备选题材。"
        : "作为背景扰动跟进，不直接否定主窗口。",
      equipmentAdviceZh: "准备防潮和轻量防雨。",
    };
  }

  if (input.precipitationSignalType === "meaningful_rain") {
    return {
      riskLabelZh: "降水干扰",
      userSummaryZh: input.shouldDowngradeWindow
        ? "预计雨量已达到可计量降水，对主窗口稳定性有明显影响。"
        : "存在可计量降水，但主要不在主窗口内，作为背景风险复核。",
      professionalSummaryZh,
      actionAdviceZh: input.shouldDowngradeWindow
        ? "主窗口可能被打断，建议保留备选题材。"
        : "关注雨带移动，不因窗口外降水过度降级。",
      equipmentAdviceZh: "准备防雨、防滑和镜头防水。",
    };
  }

  return {
    riskLabelZh: input.precipitationImpactLevel === "high" ? "强降水风险" : "明显降水风险",
    userSummaryZh: input.shouldDowngradeWindow
      ? "降水风险较高，需优先评估通行安全和器材防护。"
      : "存在较强降水信号，但当前不直接覆盖主窗口，需作为通行和装备背景风险复核。",
    professionalSummaryZh,
    actionAdviceZh: input.shouldDowngradeWindow
      ? "不建议按云海主目标专程前往，需优先评估通行和安全。"
      : "复核雨带时间和道路状况，避免把窗口外降水误判为主窗口阻断。",
    equipmentAdviceZh: "准备防雨、防滑、镜头防水和安全通行预案。",
  };
}

function rowsForWindow(
  rows: readonly PrecipitationSnapshot[],
  window: NormalizedSignalWindow,
): readonly PrecipitationSnapshot[] {
  const start = Date.parse(window.startTime);
  const end = Date.parse(window.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [];
  }
  return rows.filter((row) => {
    const time = Date.parse(row.time ?? "");
    return Number.isFinite(time) && time >= start && time <= end;
  });
}

function normalizedWindow(
  window: CloudSeaPrecipitationSignalWindow | null | undefined,
): NormalizedSignalWindow | null {
  if (!window?.startTime || !window.endTime) {
    return null;
  }
  return {
    startTime: window.startTime,
    endTime: window.endTime,
  };
}

function arrivalWindowFromMain(
  window: NormalizedSignalWindow | null,
): NormalizedSignalWindow | null {
  if (!window) {
    return null;
  }
  const start = Date.parse(window.startTime);
  if (!Number.isFinite(start)) {
    return null;
  }
  return {
    startTime: new Date(start - preWindowMinutes * 60 * 1000).toISOString(),
    endTime: window.startTime,
  };
}

function expandWindowBefore(
  window: NormalizedSignalWindow | null,
  minutes: number,
): NormalizedSignalWindow | null {
  if (!window) {
    return null;
  }
  const start = Date.parse(window.startTime);
  if (!Number.isFinite(start)) {
    return window;
  }
  return {
    startTime: new Date(start - minutes * 60 * 1000).toISOString(),
    endTime: window.endTime,
  };
}

function formatMainTimeRange(
  window: NormalizedSignalWindow | null,
  timezone: string | null | undefined,
): string {
  if (!window) {
    return "主窗口待定";
  }
  return formatForecastWindowZh(window.startTime, window.endTime, timezone ?? "Asia/Shanghai", {
    missingText: "主窗口待定",
    invalidText: "时间待确认",
  });
}

function isStrongWind(value: number | null | undefined): boolean {
  return isFiniteNumber(value) && value >= 8;
}

function isPoorVisibility(value: number | null | undefined): boolean {
  return isFiniteNumber(value) && value < 2;
}

function formatMillimeters(value: number): string {
  return `${roundPrecipitation(value)} mm`;
}

function roundPrecipitation(value: number): number {
  return Math.round(value * 10) / 10;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
