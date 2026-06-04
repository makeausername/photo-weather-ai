import type { CloudLayerCompletenessContext } from "./cloud-layer-completeness.js";
import type { CloudSeaCloudBasisConsistencyContext } from "./cloud-sea-cloud-basis-consistency.js";
import type { CloudSeaPrecipitationSignalContext } from "./cloud-sea-precipitation-signal.js";
import type {
  CloudSeaConfidenceLevel,
  CloudSeaTemperaturePreparationLevel,
  CloudSeaWhiteoutReviewLevel,
  CloudSeaWindowRainImpact,
  CloudSeaWindowRainImpactLevel,
  CloudSeaWindowRiskContext,
  CloudSeaWindowPrecipitationTiming,
  ProfessionalHourlyCloudLayerBasis,
  ProfessionalHourlyTemperatureBasis,
  TerrainMode,
  TerrainType,
} from "./types.js";
import { formatForecastWindowZh } from "./window-format.js";

export type CloudSeaWindowRiskWindow = {
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly label?: string | null;
};

export type CloudSeaWindowRiskHourlyRow = {
  readonly time?: string | null;
  readonly cloudTotal?: number | null;
  readonly cloudTotalPercent?: number | null;
  readonly totalCloudPercent?: number | null;
  readonly cloudHigh?: number | null;
  readonly cloudHighPercent?: number | null;
  readonly highCloudPercent?: number | null;
  readonly cloudMid?: number | null;
  readonly cloudMidPercent?: number | null;
  readonly midCloudPercent?: number | null;
  readonly cloudLow?: number | null;
  readonly cloudLowPercent?: number | null;
  readonly lowCloudPercent?: number | null;
  readonly cloudLayerBasis?: ProfessionalHourlyCloudLayerBasis;
  readonly visibilityKm?: number | null;
  readonly visibilityMeters?: number | null;
  readonly relativeHumidityPercent?: number | null;
  readonly humidityPercent?: number | null;
  readonly humidity?: number | null;
  readonly dewPointSpreadC?: number | null;
  readonly dewPointSpread?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly rawTemperatureC?: number | null;
  readonly terrainAdjustedTemperatureC?: number | null;
  readonly displayedTemperatureC?: number | null;
  readonly bodyFeelTemperatureC?: number | null;
  readonly temperatureBasis?: ProfessionalHourlyTemperatureBasis | string | null;
};

export type CloudSeaWindowRiskContextInput = {
  readonly normalizedHourlyRows?: readonly CloudSeaWindowRiskHourlyRow[] | null;
  readonly bestWindow?: CloudSeaWindowRiskWindow | null;
  readonly mainWindow?: CloudSeaWindowRiskWindow | null;
  readonly backupWindows?: readonly CloudSeaWindowRiskWindow[] | null;
  readonly arrivalWindow?: CloudSeaWindowRiskWindow | null;
  readonly forecastWindowRange?: CloudSeaWindowRiskWindow | null;
  readonly precipitationSignalContext?: CloudSeaPrecipitationSignalContext | null;
  readonly cloudLayerCoverageContext?: CloudLayerCompletenessContext | null;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
  readonly displayTemperatureContext?: {
    readonly displayTemperatureC?: number | null;
    readonly bodyFeelTemperatureC?: number | null;
    readonly terrainAdjustedTemperatureC?: number | null;
    readonly rawTemperatureC?: number | null;
    readonly basis?: string | null;
    readonly temperatureBasis?: string | null;
  } | null;
  readonly terrainContext?: {
    readonly terrainMode?: TerrainMode | string | null;
    readonly terrainType?: TerrainType | string | null;
    readonly elevationMeters?: number | null;
    readonly surroundingReliefMeters?: number | null;
    readonly confidence?: CloudSeaConfidenceLevel | string | null;
  } | null;
  readonly whiteoutRiskContext?: {
    readonly whiteoutRiskScore?: number | null;
  } | null;
  readonly timezone?: string | null;
};

type NormalizedWindow = {
  readonly startTime: string;
  readonly endTime: string;
};

type WindowRows = {
  readonly pre: readonly CloudSeaWindowRiskHourlyRow[];
  readonly during: readonly CloudSeaWindowRiskHourlyRow[];
  readonly post: readonly CloudSeaWindowRiskHourlyRow[];
  readonly outside: readonly CloudSeaWindowRiskHourlyRow[];
};

type RainStats = {
  readonly hasAmountData: boolean;
  readonly hasProbabilityData: boolean;
  readonly maxProbabilityPercent?: number;
  readonly maxHourlyAmountMm?: number;
  readonly totalAmountMm?: number;
  readonly maxAmountMm?: number;
  readonly affectedHoursCount: number;
};

type WindowCloudStats = {
  readonly rowCount: number;
  readonly totalVeryHigh: boolean;
  readonly highVeryHigh: boolean;
  readonly midVeryHigh: boolean;
  readonly lowHigh: boolean;
  readonly thickMultiLayerOvercast: boolean;
  readonly minVisibilityKm?: number;
  readonly averageVisibilityKm?: number;
  readonly averageHumidityPercent?: number;
  readonly minDewPointSpreadC?: number;
  readonly lowCloudDataCount: number;
};

const adjacentWindowMinutes = 180;

const emptyRainImpact = (
  timing: CloudSeaWindowPrecipitationTiming,
  label = "无明显降水",
): CloudSeaWindowRainImpact => ({
  timing,
  impactLevel: "none",
  riskLabelZh: label,
  summaryZh: "主窗口附近暂无明显降水信号。",
  actionAdviceZh: "不因降水否定窗口，重点复核云层开口、低云高度和能见度。",
  equipmentAdviceZh: "按清晨防潮和镜头结露准备。",
  maxProbabilityPercent: null,
  maxAmountMm: null,
  maxHourlyAmountMm: null,
  totalAmountMm: null,
  affectedHoursCount: 0,
  shouldCapScore: false,
  scoreCap: null,
});

export function buildCloudSeaWindowCenteredRiskContext(
  input: CloudSeaWindowRiskContextInput = {},
): CloudSeaWindowRiskContext {
  const rows = (input.normalizedHourlyRows ?? []).filter((row) =>
    Number.isFinite(Date.parse(row.time ?? "")),
  );
  const timezone = input.timezone ?? "Asia/Shanghai";
  const mainWindow = normalizedWindow(input.mainWindow ?? input.bestWindow);
  const groupedRows = groupRowsByWindow(rows, mainWindow);
  const preWindowRainImpact = buildRainImpact("pre_window", groupedRows.pre);
  const duringWindowRainImpact = buildRainImpact("during_window", groupedRows.during);
  const postWindowRainImpact = buildRainImpact("post_window", groupedRows.post);
  const outsideWindowRainImpact = buildRainImpact("outside_window", groupedRows.outside);
  const windowRainImpact = dominantRainImpact(
    duringWindowRainImpact,
    preWindowRainImpact,
    postWindowRainImpact,
    outsideWindowRainImpact,
    input.precipitationSignalContext,
  );
  const cloudStats = summarizeWindowCloudRows(
    groupedRows.during.length > 0 ? groupedRows.during : rowsForFallback(rows, mainWindow),
  );
  const whiteoutReviewLevel = classifyWhiteoutReviewLevel({
    cloudStats,
    cloudBasisConsistencyContext: input.cloudBasisConsistencyContext,
    whiteoutRiskScore: input.whiteoutRiskContext?.whiteoutRiskScore,
  });
  const cloudTopReviewNeed = shouldReviewCloudTop({
    cloudStats,
    whiteoutReviewLevel,
    cloudBasisConsistencyContext: input.cloudBasisConsistencyContext,
    cloudLayerCoverageContext: input.cloudLayerCoverageContext,
  });
  const windowOpeningConfidence = classifyOpeningConfidence({
    cloudStats,
    duringWindowRainImpact,
    whiteoutReviewLevel,
    cloudTopReviewNeed,
    cloudLayerCoverageContext: input.cloudLayerCoverageContext,
    cloudBasisConsistencyContext: input.cloudBasisConsistencyContext,
  });
  const temperaturePreparationLevel = classifyTemperaturePreparation(input);
  const displayTemperatureBasisValue = resolveDisplayTemperatureBasis(input);
  const scoreCapReasons = buildScoreCapReasons({
    windowOpeningConfidence,
    duringWindowRainImpact,
    whiteoutReviewLevel,
    cloudTopReviewNeed,
    cloudLayerCoverageContext: input.cloudLayerCoverageContext,
    cloudBasisConsistencyContext: input.cloudBasisConsistencyContext,
  });
  const windowLabel = mainWindow
    ? formatForecastWindowZh(mainWindow.startTime, mainWindow.endTime, timezone)
    : "主窗口待定";
  const whiteoutReviewLabelZh = whiteoutReviewLabel(whiteoutReviewLevel, cloudTopReviewNeed);
  const openingConfidenceReasonZh = openingReason({
    windowOpeningConfidence,
    cloudStats,
    duringWindowRainImpact,
    whiteoutReviewLabelZh,
  });
  const precipitationWindowSummaryZh = precipitationSummary(
    windowLabel,
    preWindowRainImpact,
    duringWindowRainImpact,
    postWindowRainImpact,
    outsideWindowRainImpact,
  );
  const whiteoutWindowSummaryZh = `${whiteoutReviewLabelZh}，${whiteoutReason({
    cloudStats,
    whiteoutReviewLevel,
    cloudTopReviewNeed,
  })}`;
  const temperaturePreparationLabelZh = temperaturePreparationLabel(temperaturePreparationLevel);
  const actionAdviceZh = windowActionAdvice({
    windowRainImpact,
    duringWindowRainImpact,
    preWindowRainImpact,
    postWindowRainImpact,
    windowOpeningConfidence,
    whiteoutReviewLevel,
    cloudTopReviewNeed,
  });
  const equipmentAdviceZh = equipmentAdvice({
    windowRainImpact,
    temperaturePreparationLevel,
    temperaturePreparationLabelZh,
  });
  const limitingFactorZh =
    scoreCapReasons[0] ??
    (windowOpeningConfidence === "high" ? windowRainImpact.riskLabelZh : openingConfidenceReasonZh);

  return {
    windowRainImpact,
    preWindowRainImpact,
    duringWindowRainImpact,
    postWindowRainImpact,
    outsideWindowRainImpact,
    windowOpeningConfidence,
    windowOpeningConfidenceLabelZh: openingConfidenceLabel(windowOpeningConfidence),
    openingConfidenceReasonZh,
    cloudTopReviewNeed,
    whiteoutReviewLevel,
    whiteoutReviewLabelZh,
    temperaturePreparationLevel,
    temperaturePreparationLabelZh,
    displayTemperatureBasis: displayTemperatureBasisValue,
    scoreCapReasons,
    limitingFactorZh,
    windowCenteredSummaryZh: `${windowLabel}：${openingConfidenceReasonZh}${precipitationWindowSummaryZh}${whiteoutWindowSummaryZh}`,
    precipitationWindowSummaryZh,
    whiteoutWindowSummaryZh,
    actionAdviceZh,
    equipmentAdviceZh,
  };
}

function groupRowsByWindow(
  rows: readonly CloudSeaWindowRiskHourlyRow[],
  window: NormalizedWindow | null,
): WindowRows {
  if (!window) {
    return { pre: [], during: [], post: [], outside: rows };
  }
  const startMs = Date.parse(window.startTime);
  const endMs = Date.parse(window.endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { pre: [], during: [], post: [], outside: rows };
  }
  const preStartMs = startMs - adjacentWindowMinutes * 60 * 1000;
  const postEndMs = endMs + adjacentWindowMinutes * 60 * 1000;
  const pre: CloudSeaWindowRiskHourlyRow[] = [];
  const during: CloudSeaWindowRiskHourlyRow[] = [];
  const post: CloudSeaWindowRiskHourlyRow[] = [];
  const outside: CloudSeaWindowRiskHourlyRow[] = [];

  for (const row of rows) {
    const rowMs = Date.parse(row.time ?? "");
    if (!Number.isFinite(rowMs)) {
      outside.push(row);
    } else if (rowMs >= startMs && rowMs <= endMs) {
      during.push(row);
    } else if (rowMs >= preStartMs && rowMs < startMs) {
      pre.push(row);
    } else if (rowMs > endMs && rowMs <= postEndMs) {
      post.push(row);
    } else {
      outside.push(row);
    }
  }

  return { pre, during, post, outside };
}

function rowsForFallback(
  rows: readonly CloudSeaWindowRiskHourlyRow[],
  window: NormalizedWindow | null,
): readonly CloudSeaWindowRiskHourlyRow[] {
  if (!window) {
    return rows.slice(0, 6);
  }
  const startMs = Date.parse(window.startTime);
  if (!Number.isFinite(startMs)) {
    return rows.slice(0, 6);
  }
  const fallbackEndMs = startMs + 6 * 60 * 60 * 1000;
  return rows.filter((row) => {
    const rowMs = Date.parse(row.time ?? "");
    return Number.isFinite(rowMs) && rowMs >= startMs && rowMs <= fallbackEndMs;
  });
}

function buildRainImpact(
  timing: CloudSeaWindowPrecipitationTiming,
  rows: readonly CloudSeaWindowRiskHourlyRow[],
): CloudSeaWindowRainImpact {
  const stats = summarizeRainRows(rows);
  const impactLevel = classifyRainImpactLevel(stats);
  if (impactLevel === "none") {
    return emptyRainImpact(timing, noRainLabelForTiming(timing));
  }
  const scoreCap = scoreCapForRain(timing, impactLevel);
  const riskLabelZh = rainRiskLabel(timing, impactLevel);
  return {
    timing,
    impactLevel,
    riskLabelZh,
    summaryZh: rainSummary(timing, impactLevel, stats),
    actionAdviceZh: rainActionAdvice(timing, impactLevel),
    equipmentAdviceZh: rainEquipmentAdvice(timing, impactLevel),
    maxProbabilityPercent: stats.maxProbabilityPercent ?? null,
    maxAmountMm: stats.maxAmountMm ?? null,
    maxHourlyAmountMm: stats.maxHourlyAmountMm ?? null,
    totalAmountMm: stats.totalAmountMm ?? null,
    affectedHoursCount: stats.affectedHoursCount,
    shouldCapScore: scoreCap !== null,
    scoreCap,
  };
}

function summarizeRainRows(rows: readonly CloudSeaWindowRiskHourlyRow[]): RainStats {
  const amountValues = rows
    .map((row) => finiteNumber(row.precipitationAmountMm))
    .filter((value): value is number => value !== undefined);
  const probabilityValues = rows
    .map((row) => finiteNumber(row.precipitationProbabilityPercent))
    .filter((value): value is number => value !== undefined);
  const totalAmountMm =
    amountValues.length > 0
      ? round1(amountValues.reduce((sum, value) => sum + Math.max(0, value), 0))
      : undefined;
  const maxHourlyAmountMm =
    amountValues.length > 0 ? round1(Math.max(...amountValues.map((value) => Math.max(0, value)))) : undefined;
  const maxAmountMm =
    totalAmountMm !== undefined || maxHourlyAmountMm !== undefined
      ? Math.max(totalAmountMm ?? 0, maxHourlyAmountMm ?? 0)
      : undefined;

  return {
    hasAmountData: amountValues.length > 0,
    hasProbabilityData: probabilityValues.length > 0,
    maxProbabilityPercent:
      probabilityValues.length > 0 ? Math.max(...probabilityValues) : undefined,
    maxHourlyAmountMm,
    totalAmountMm,
    maxAmountMm,
    affectedHoursCount: rows.filter((row) => rowHasRainSignal(row)).length,
  };
}

function classifyRainImpactLevel(stats: RainStats): CloudSeaWindowRainImpactLevel {
  if (!stats.hasAmountData && !stats.hasProbabilityData) {
    return "unknown";
  }
  const probability = stats.maxProbabilityPercent ?? 0;
  const total = stats.totalAmountMm ?? 0;
  const maxHourly = stats.maxHourlyAmountMm ?? 0;
  if (total <= 0 && maxHourly <= 0 && probability < 30) {
    return "none";
  }
  if (
    total >= 3 ||
    maxHourly >= 2 ||
    (stats.affectedHoursCount >= 3 && maxHourly >= 1) ||
    (probability >= 85 && total >= 1)
  ) {
    return "high";
  }
  if (total >= 1 || maxHourly >= 0.8 || (!stats.hasAmountData && probability >= 70)) {
    return "medium";
  }
  if (total > 0.2 || maxHourly > 0.2 || probability >= 50) {
    return "low";
  }
  if (total > 0 || maxHourly > 0 || probability > 5) {
    return "trace";
  }
  return "none";
}

function dominantRainImpact(
  during: CloudSeaWindowRainImpact,
  pre: CloudSeaWindowRainImpact,
  post: CloudSeaWindowRainImpact,
  outside: CloudSeaWindowRainImpact,
  precipitationSignalContext: CloudSeaPrecipitationSignalContext | null | undefined,
): CloudSeaWindowRainImpact {
  const ordered = [during, pre, post, outside];
  const strongest = ordered
    .filter((impact) => impact.impactLevel !== "none")
    .sort((left, right) => rainImpactRank(right.impactLevel) - rainImpactRank(left.impactLevel))[0];
  if (strongest) {
    return strongest;
  }
  if (precipitationSignalContext?.precipitationSignalType === "unknown") {
    return {
      ...emptyRainImpact("unknown", "降水待复核"),
      impactLevel: "unknown",
      summaryZh: "降水概率和雨量数据不足，需临近复核。",
      actionAdviceZh: "出发前复核雷达和短临预报，暂不按强降水或无降水下结论。",
    };
  }
  return during;
}

function summarizeWindowCloudRows(rows: readonly CloudSeaWindowRiskHourlyRow[]): WindowCloudStats {
  const total = rows.map(totalCloudPercent).filter(isFiniteNumber);
  const high = rows.map(highCloudPercent).filter(isFiniteNumber);
  const mid = rows.map(midCloudPercent).filter(isFiniteNumber);
  const low = rows.map(lowCloudPercent).filter(isFiniteNumber);
  const visibility = rows.map(visibilityKm).filter(isFiniteNumber);
  const humidity = rows.map(humidityPercent).filter(isFiniteNumber);
  const dewPointSpread = rows.map(dewPointSpreadC).filter(isFiniteNumber);
  const totalVeryHigh = ratioAtLeast(total, 90) >= 0.67;
  const highVeryHigh = ratioAtLeast(high, 80) >= 0.67;
  const midVeryHigh = ratioAtLeast(mid, 80) >= 0.67;
  const lowHigh = ratioAtLeast(low, 65) >= 0.5;

  return {
    rowCount: rows.length,
    totalVeryHigh,
    highVeryHigh,
    midVeryHigh,
    lowHigh,
    thickMultiLayerOvercast: totalVeryHigh && (highVeryHigh || midVeryHigh) && lowHigh,
    minVisibilityKm: visibility.length > 0 ? Math.min(...visibility) : undefined,
    averageVisibilityKm: average(visibility),
    averageHumidityPercent: average(humidity),
    minDewPointSpreadC: dewPointSpread.length > 0 ? Math.min(...dewPointSpread) : undefined,
    lowCloudDataCount: low.length,
  };
}

function classifyOpeningConfidence(input: {
  readonly cloudStats: WindowCloudStats;
  readonly duringWindowRainImpact: CloudSeaWindowRainImpact;
  readonly whiteoutReviewLevel: CloudSeaWhiteoutReviewLevel;
  readonly cloudTopReviewNeed: boolean;
  readonly cloudLayerCoverageContext?: CloudLayerCompletenessContext | null;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
}): CloudSeaConfidenceLevel {
  const poorVisibility = (input.cloudStats.minVisibilityKm ?? 99) < 3;
  const mediumOrHeavyRain = rainImpactRank(input.duringWindowRainImpact.impactLevel) >= 4;
  const layerWeak =
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "weak" ||
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing";
  const basisWeak =
    input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence === true ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "mixed_basis" ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "total_only";

  if (
    mediumOrHeavyRain ||
    poorVisibility ||
    input.whiteoutReviewLevel === "high" ||
    (input.cloudStats.thickMultiLayerOvercast && input.whiteoutReviewLevel === "medium")
  ) {
    return "low";
  }
  if (
    input.cloudStats.thickMultiLayerOvercast ||
    input.whiteoutReviewLevel === "medium" ||
    input.whiteoutReviewLevel === "low_to_medium" ||
    input.cloudTopReviewNeed ||
    layerWeak ||
    basisWeak ||
    input.duringWindowRainImpact.impactLevel === "low" ||
    input.duringWindowRainImpact.impactLevel === "trace"
  ) {
    return "medium";
  }
  return "high";
}

function classifyWhiteoutReviewLevel(input: {
  readonly cloudStats: WindowCloudStats;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
  readonly whiteoutRiskScore?: number | null;
}): CloudSeaWhiteoutReviewLevel {
  const lowCloudHigh = input.cloudStats.lowHigh;
  const visibility = input.cloudStats.minVisibilityKm;
  const humidityHigh = (input.cloudStats.averageHumidityPercent ?? 0) >= 90;
  const dewPointClose = (input.cloudStats.minDewPointSpreadC ?? 99) <= 3;
  const visibilityPoor = (visibility ?? 99) < 3;
  const visibilityLimited = (visibility ?? 99) < 6;
  const score = input.whiteoutRiskScore;
  const basisReview =
    input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence === true ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "total_only" ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "partial_layers";

  if ((score ?? 0) >= 78 || (lowCloudHigh && visibilityPoor && (humidityHigh || dewPointClose))) {
    return "high";
  }
  if ((score ?? 0) >= 58 || (lowCloudHigh && visibilityLimited && (humidityHigh || dewPointClose))) {
    return "medium";
  }
  if (
    (score ?? 0) >= 45 ||
    (lowCloudHigh && (humidityHigh || dewPointClose || visibilityLimited)) ||
    (lowCloudHigh && (visibility ?? 99) >= 6) ||
    (basisReview && input.cloudStats.lowCloudDataCount === 0)
  ) {
    return "low_to_medium";
  }
  return "low";
}

function shouldReviewCloudTop(input: {
  readonly cloudStats: WindowCloudStats;
  readonly whiteoutReviewLevel: CloudSeaWhiteoutReviewLevel;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
  readonly cloudLayerCoverageContext?: CloudLayerCompletenessContext | null;
}): boolean {
  return (
    input.cloudStats.lowHigh ||
    input.whiteoutReviewLevel !== "low" ||
    input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence === true ||
    input.cloudBasisConsistencyContext?.cloudBasisLevel === "total_only" ||
    (input.cloudLayerCoverageContext?.lowLayerMissingHoursCount ?? 0) > 0
  );
}

function classifyTemperaturePreparation(
  input: CloudSeaWindowRiskContextInput,
): CloudSeaTemperaturePreparationLevel {
  const explicit =
    finiteNumber(input.displayTemperatureContext?.bodyFeelTemperatureC) ??
    finiteNumber(input.displayTemperatureContext?.displayTemperatureC) ??
    finiteNumber(input.displayTemperatureContext?.terrainAdjustedTemperatureC);
  const rowValues = (input.normalizedHourlyRows ?? [])
    .map(
      (row) =>
        finiteNumber(row.bodyFeelTemperatureC) ??
        finiteNumber(row.displayedTemperatureC) ??
        finiteNumber(row.terrainAdjustedTemperatureC),
    )
    .filter((value): value is number => value !== undefined);
  const value = explicit ?? (rowValues.length > 0 ? Math.min(...rowValues) : undefined);
  if (value === undefined) {
    return "unknown";
  }
  if (value <= -5) {
    return "severe_cold";
  }
  if (value <= 5) {
    return "cold";
  }
  if (value <= 12) {
    return "cool";
  }
  return "normal";
}

function buildScoreCapReasons(input: {
  readonly windowOpeningConfidence: CloudSeaConfidenceLevel;
  readonly duringWindowRainImpact: CloudSeaWindowRainImpact;
  readonly whiteoutReviewLevel: CloudSeaWhiteoutReviewLevel;
  readonly cloudTopReviewNeed: boolean;
  readonly cloudLayerCoverageContext?: CloudLayerCompletenessContext | null;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext | null;
}): readonly string[] {
  const reasons: string[] = [];
  const mediumUncertainties: string[] = [];
  if (input.windowOpeningConfidence === "medium") {
    reasons.push("开口稳定性中等。厚实多层云覆盖下开口稳定性不足，最终分数不按近满分处理。");
    mediumUncertainties.push("opening");
  }
  if (input.windowOpeningConfidence === "low") {
    reasons.push("主窗口开口稳定性偏低，最终分数上限 75。");
    mediumUncertainties.push("opening");
  }
  if (input.duringWindowRainImpact.impactLevel === "medium") {
    reasons.push("主窗口受可计量降水影响，最终分数上限 72。");
    mediumUncertainties.push("rain");
  }
  if (input.duringWindowRainImpact.impactLevel === "high") {
    reasons.push("主窗口受较强或持续降水影响，最终分数上限 64。");
    mediumUncertainties.push("rain");
  }
  if (input.whiteoutReviewLevel === "medium") {
    reasons.push("主窗口白墙风险中等，需复核云顶高度，可拍分数上限 78。");
    mediumUncertainties.push("whiteout");
  }
  if (input.whiteoutReviewLevel === "high") {
    reasons.push("主窗口白墙风险偏高，云顶高度和能见度未确认前分数上限 70。");
    mediumUncertainties.push("whiteout");
  }
  if (input.whiteoutReviewLevel === "low_to_medium" || input.cloudTopReviewNeed) {
    mediumUncertainties.push("cloud_top");
  }
  if (
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "weak" ||
    input.cloudLayerCoverageContext?.layerCompletenessLevel === "missing" ||
    input.cloudBasisConsistencyContext?.shouldLowerCloudSeaConfidence
  ) {
    mediumUncertainties.push("basis");
  }
  if (new Set(mediumUncertainties).size >= 3) {
    reasons.push("多个中等不确定性叠加，最终分数上限 78。");
  }
  return uniqueText(reasons);
}

function precipitationSummary(
  windowLabel: string,
  pre: CloudSeaWindowRainImpact,
  during: CloudSeaWindowRainImpact,
  post: CloudSeaWindowRainImpact,
  outside: CloudSeaWindowRainImpact,
): string {
  const active = [pre, during, post, outside].filter((impact) => impact.impactLevel !== "none");
  if (active.length === 0) {
    return `降水：${windowLabel} 内暂无明显降水信号。`;
  }
  const parts = [pre, during, post]
    .filter((impact) => impact.impactLevel !== "none")
    .map((impact) => impact.summaryZh);
  if (parts.length === 0 && outside.impactLevel !== "none") {
    parts.push(outside.summaryZh);
  }
  return `降水：${parts.join(" ")} `;
}

function rainSummary(
  timing: CloudSeaWindowPrecipitationTiming,
  impactLevel: CloudSeaWindowRainImpactLevel,
  stats: RainStats,
): string {
  const amountText = stats.hasAmountData
    ? `预计雨量 ${formatAmount(stats.maxAmountMm ?? 0)}`
    : "雨量缺测";
  const probabilityText = stats.hasProbabilityData
    ? `概率 ${Math.round(stats.maxProbabilityPercent ?? 0)}%`
    : "概率缺测";
  const levelText = rainImpactLevelLabel(impactLevel);
  if (timing === "pre_window") {
    return `窗口前有${levelText}降水信号（${probabilityText}，${amountText}），可补充水汽，但需复核是否转弱和开口。`;
  }
  if (timing === "during_window") {
    return `主窗口内有${levelText}可计量降水信号（${probabilityText}，${amountText}），直接影响可拍稳定性。`;
  }
  if (timing === "post_window") {
    return `降水主要在窗口后（${probabilityText}，${amountText}），对主窗口影响有限，需关注返程和器材防潮。`;
  }
  if (timing === "outside_window") {
    return `降水主要不在推荐窗口内（${probabilityText}，${amountText}），作为背景风险复核。`;
  }
  return "降水时段待复核。";
}

function rainActionAdvice(
  timing: CloudSeaWindowPrecipitationTiming,
  impactLevel: CloudSeaWindowRainImpactLevel,
): string {
  if (timing === "pre_window") {
    return "窗口前有小雨或局地扰动，可带来水汽，但需复核是否转弱和开口。";
  }
  if (timing === "during_window") {
    return rainImpactRank(impactLevel) >= 4
      ? "主窗口受降水影响，建议转为备选或等待短临确认。"
      : "主窗口有轻微降水扰动，需短临复核雨带位置后再决定是否等待。";
  }
  if (timing === "post_window") {
    return "降水主要在窗口后，对主窗口影响有限，但需注意返程和器材防潮。";
  }
  if (timing === "outside_window") {
    return "降水主要不在推荐窗口内，不应过度降级主窗口，仍需复核雨带移动。";
  }
  return "出发前复核雷达和短临预报。";
}

function rainEquipmentAdvice(
  timing: CloudSeaWindowPrecipitationTiming,
  impactLevel: CloudSeaWindowRainImpactLevel,
): string {
  const strong = rainImpactRank(impactLevel) >= 4;
  if (timing === "during_window" && strong) {
    return "准备防雨、防滑、镜头防水和备用题材。";
  }
  if (timing === "post_window") {
    return "准备返程防雨和器材防潮。";
  }
  if (timing === "pre_window") {
    return "准备防潮和轻量防雨，带镜头布。";
  }
  return "准备防潮和轻量防雨，带镜头布做基础准备。";
}

function windowActionAdvice(input: {
  readonly windowRainImpact: CloudSeaWindowRainImpact;
  readonly duringWindowRainImpact: CloudSeaWindowRainImpact;
  readonly preWindowRainImpact: CloudSeaWindowRainImpact;
  readonly postWindowRainImpact: CloudSeaWindowRainImpact;
  readonly windowOpeningConfidence: CloudSeaConfidenceLevel;
  readonly whiteoutReviewLevel: CloudSeaWhiteoutReviewLevel;
  readonly cloudTopReviewNeed: boolean;
}): string {
  if (input.duringWindowRainImpact.impactLevel === "high") {
    return `${input.duringWindowRainImpact.actionAdviceZh} 同时复核开口稳定性和白墙风险。`;
  }
  if (input.duringWindowRainImpact.impactLevel === "medium") {
    return `${input.duringWindowRainImpact.actionAdviceZh} 形成信号可保留，但可拍推荐需降级。`;
  }
  if (input.preWindowRainImpact.impactLevel !== "none") {
    return `${input.preWindowRainImpact.actionAdviceZh} ${openingFollowup(input.windowOpeningConfidence, input.cloudTopReviewNeed)}`;
  }
  if (input.postWindowRainImpact.impactLevel !== "none") {
    return `${input.postWindowRainImpact.actionAdviceZh} ${openingFollowup(input.windowOpeningConfidence, input.cloudTopReviewNeed)}`;
  }
  if (input.windowOpeningConfidence !== "high") {
    return openingFollowup(input.windowOpeningConfidence, input.cloudTopReviewNeed);
  }
  if (input.whiteoutReviewLevel !== "low") {
    return "窗口可参考，但需现场确认低云是否压过机位和远山层次是否打开。";
  }
  return "优先按主窗口安排，到场后复核低云高度、开口和能见度。";
}

function equipmentAdvice(input: {
  readonly windowRainImpact: CloudSeaWindowRainImpact;
  readonly temperaturePreparationLevel: CloudSeaTemperaturePreparationLevel;
  readonly temperaturePreparationLabelZh: string;
}): string {
  const temperature =
    input.temperaturePreparationLevel === "normal"
      ? "按常规清晨防潮和防滑准备。"
      : `${input.temperaturePreparationLabelZh}，按机位显示温度准备保暖。`;
  const rain =
    input.windowRainImpact.impactLevel === "none"
      ? "镜头布和防潮准备仍需带齐。"
      : input.windowRainImpact.equipmentAdviceZh;
  return `${temperature}${rain}`;
}

function openingReason(input: {
  readonly windowOpeningConfidence: CloudSeaConfidenceLevel;
  readonly cloudStats: WindowCloudStats;
  readonly duringWindowRainImpact: CloudSeaWindowRainImpact;
  readonly whiteoutReviewLabelZh: string;
}): string {
  if (input.windowOpeningConfidence === "high") {
    return "主窗口开口信号较好，总云未完全饱和，且降水未直接覆盖窗口。";
  }
  if (input.windowOpeningConfidence === "low") {
    return "主窗口开口稳定性偏低，多层云、能见度、降水或白墙复核项形成明显限制。";
  }
  if (input.cloudStats.thickMultiLayerOvercast) {
    return `主窗口云层较厚，开口稳定性中等，${input.whiteoutReviewLabelZh}。`;
  }
  if (input.duringWindowRainImpact.impactLevel !== "none") {
    return "主窗口有降水扰动，开口稳定性中等。";
  }
  return `主窗口开口仍需复核，${input.whiteoutReviewLabelZh}。`;
}

function whiteoutReason(input: {
  readonly cloudStats: WindowCloudStats;
  readonly whiteoutReviewLevel: CloudSeaWhiteoutReviewLevel;
  readonly cloudTopReviewNeed: boolean;
}): string {
  if (input.whiteoutReviewLevel === "high") {
    return "低云、湿度、露点差或能见度信号显示机位可能被云雾包住。";
  }
  if (input.whiteoutReviewLevel === "medium") {
    return "低云偏高且湿度、露点差或能见度需要现场确认。";
  }
  if (input.cloudTopReviewNeed) {
    return "低云较高或分层证据不足，需复核云顶高度。";
  }
  return "低云、湿度和能见度暂未形成强白墙信号。";
}

function openingFollowup(
  confidence: CloudSeaConfidenceLevel,
  cloudTopReviewNeed: boolean,
): string {
  if (confidence === "low") {
    return "不建议强推，等待短临确认开口和云顶高度。";
  }
  if (cloudTopReviewNeed) {
    return "可谨慎参考，但出发前必须复核云顶高度和开口。";
  }
  return "可谨慎参考，出发前复核开口和能见度。";
}

function scoreCapForRain(
  timing: CloudSeaWindowPrecipitationTiming,
  impactLevel: CloudSeaWindowRainImpactLevel,
): number | null {
  if (timing !== "during_window") {
    return null;
  }
  if (impactLevel === "high") {
    return 64;
  }
  if (impactLevel === "medium") {
    return 72;
  }
  if (impactLevel === "low") {
    return 85;
  }
  return null;
}

function normalizedWindow(window: CloudSeaWindowRiskWindow | null | undefined): NormalizedWindow | null {
  if (!window?.startTime || !window.endTime) {
    return null;
  }
  return {
    startTime: window.startTime,
    endTime: window.endTime,
  };
}

function rowHasRainSignal(row: CloudSeaWindowRiskHourlyRow): boolean {
  return (
    (finiteNumber(row.precipitationAmountMm) ?? 0) > 0 ||
    (finiteNumber(row.precipitationProbabilityPercent) ?? 0) >= 30
  );
}

function rainRiskLabel(
  timing: CloudSeaWindowPrecipitationTiming,
  impactLevel: CloudSeaWindowRainImpactLevel,
): string {
  if (timing === "pre_window") {
    return rainImpactRank(impactLevel) >= 4 ? "窗口前明显降水" : "窗口前局地扰动";
  }
  if (timing === "during_window") {
    return rainImpactRank(impactLevel) >= 5
      ? "主窗口强降水"
      : rainImpactRank(impactLevel) >= 4
        ? "主窗口降水干扰"
        : "主窗口小雨扰动";
  }
  if (timing === "post_window") {
    return "窗口后降水";
  }
  if (timing === "outside_window") {
    return "窗口外降水";
  }
  return "降水待复核";
}

function noRainLabelForTiming(timing: CloudSeaWindowPrecipitationTiming): string {
  if (timing === "pre_window") {
    return "窗口前无明显降水";
  }
  if (timing === "during_window") {
    return "主窗口无明显降水";
  }
  if (timing === "post_window") {
    return "窗口后无明显降水";
  }
  return "无明显降水";
}

function rainImpactLevelLabel(level: CloudSeaWindowRainImpactLevel): string {
  if (level === "high") {
    return "较强或持续";
  }
  if (level === "medium") {
    return "可计量";
  }
  if (level === "low") {
    return "偏弱";
  }
  if (level === "trace") {
    return "微量";
  }
  return "待复核";
}

function rainImpactRank(level: CloudSeaWindowRainImpactLevel): number {
  if (level === "high") {
    return 5;
  }
  if (level === "medium") {
    return 4;
  }
  if (level === "low") {
    return 3;
  }
  if (level === "trace") {
    return 2;
  }
  if (level === "unknown") {
    return 1;
  }
  return 0;
}

function openingConfidenceLabel(level: CloudSeaConfidenceLevel): string {
  if (level === "high") {
    return "开口置信度高";
  }
  if (level === "medium") {
    return "开口置信度中";
  }
  return "开口置信度低";
}

function whiteoutReviewLabel(
  level: CloudSeaWhiteoutReviewLevel,
  cloudTopReviewNeed: boolean,
): string {
  const base =
    level === "high"
      ? "白墙风险高"
      : level === "medium"
        ? "白墙风险中"
        : level === "low_to_medium"
          ? "白墙风险低到中"
          : "白墙风险低";
  return cloudTopReviewNeed && level !== "high" ? `${base}，需复核云顶高度` : base;
}

function temperaturePreparationLabel(level: CloudSeaTemperaturePreparationLevel): string {
  if (level === "severe_cold") {
    return "低温准备强";
  }
  if (level === "cold") {
    return "低温准备中";
  }
  if (level === "cool") {
    return "清晨偏凉";
  }
  if (level === "unknown") {
    return "温度需复核";
  }
  return "常规温度准备";
}

function resolveDisplayTemperatureBasis(input: CloudSeaWindowRiskContextInput): string {
  return (
    input.displayTemperatureContext?.basis ??
    input.displayTemperatureContext?.temperatureBasis ??
    input.normalizedHourlyRows?.find((row) => row.temperatureBasis)?.temperatureBasis ??
    "unknown"
  );
}

function totalCloudPercent(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.cloudTotalPercent ?? row.totalCloudPercent ?? row.cloudTotal);
}

function highCloudPercent(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.cloudHighPercent ?? row.highCloudPercent ?? row.cloudHigh);
}

function midCloudPercent(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.cloudMidPercent ?? row.midCloudPercent ?? row.cloudMid);
}

function lowCloudPercent(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.cloudLowPercent ?? row.lowCloudPercent ?? row.cloudLow);
}

function visibilityKm(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.visibilityKm) ?? metersToKilometers(row.visibilityMeters);
}

function humidityPercent(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.relativeHumidityPercent ?? row.humidityPercent ?? row.humidity);
}

function dewPointSpreadC(row: CloudSeaWindowRiskHourlyRow): number | undefined {
  return finiteNumber(row.dewPointSpreadC ?? row.dewPointSpread);
}

function metersToKilometers(value: number | null | undefined): number | undefined {
  const meters = finiteNumber(value);
  return meters === undefined ? undefined : meters / 1000;
}

function ratioAtLeast(values: readonly number[], threshold: number): number {
  return values.length === 0 ? 0 : values.filter((value) => value >= threshold).length / values.length;
}

function average(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatAmount(value: number): string {
  return `${round1(value)} mm`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function uniqueText(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
