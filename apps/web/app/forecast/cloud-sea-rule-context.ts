import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  buildCloudSeaPrecipitationSignalContext,
  buildCloudSeaRecommendationGuard,
  buildCloudSeaWeatherVariableConsistencyContext,
  type CloudLayerCompletenessContext,
  type CloudSeaCloudBasisConsistencyContext,
  type CloudSeaPrecipitationSignalContext,
  type CloudSeaRecommendationGuardOutput,
  type CloudSeaWeatherVariableConsistencyContext,
  type ForecastCalculationResult,
  type ForecastMultiSourceAgreementContext,
  type ProfessionalHourlyCloudSeaSignal,
  type ProfessionalHourlyDataPoint,
} from "@photo-weather/shared";
import {
  buildCloudSeaTerrainContextFromResult,
  type CloudSeaTerrainContext,
} from "./cloud-sea-terrain-context";

export type CloudSeaRuleContext = {
  readonly terrainContext: CloudSeaTerrainContext;
  readonly cloudLayerCompletenessContext: CloudLayerCompletenessContext;
  readonly cloudBasisConsistencyContext: CloudSeaCloudBasisConsistencyContext;
  readonly cloudLayerRoleContext: CloudSeaCloudLayerRoleContext;
  readonly weatherVariableConsistencyContext: CloudSeaWeatherVariableConsistencyContext;
  readonly precipitationSignalContext: CloudSeaPrecipitationSignalContext;
  readonly multiSourceAgreementContext: ForecastMultiSourceAgreementContext | null;
  readonly recommendationGuardContext: CloudSeaRecommendationGuardOutput;
};

export type CloudSeaCloudLayerRoleContext = {
  readonly dominantRole:
    | "cloud_sea"
    | "whiteout"
    | "formation"
    | "rain_opening"
    | "glow_reference"
    | "texture"
    | "needs_review"
    | "ordinary";
  readonly cloudSeaHoursCount: number;
  readonly whiteoutRiskHoursCount: number;
  readonly formationSignalHoursCount: number;
  readonly rainOpeningHoursCount: number;
  readonly glowReferenceHoursCount: number;
  readonly textureHoursCount: number;
  readonly needsReviewHoursCount: number;
  readonly redirectedMidHighHoursCount: number;
  readonly noteZh: string;
};

export type CloudSeaRecommendationGuardForRuleOptions = {
  readonly cloudLayerCompleteness: CloudLayerCompletenessContext;
  readonly multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null;
  readonly cloudSeaScore?: number;
  readonly shootabilityScore?: number;
  readonly formationScore?: number;
  readonly whiteoutRiskScore?: number;
  readonly proposedRecommendationLabel?: string;
  readonly bestWindow?: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindow"];
  readonly hasWindow?: boolean;
  readonly bestWindowLabelZh?: string;
  readonly lowCloudSignalSupported?: boolean;
  readonly cloudBasisConsistencyContext?: CloudSeaCloudBasisConsistencyContext;
  readonly weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext;
  readonly precipitationSignalContext?: CloudSeaPrecipitationSignalContext;
};

const signalRoleRank: Record<CloudSeaCloudLayerRoleContext["dominantRole"], number> = {
  whiteout: 8,
  cloud_sea: 7,
  formation: 6,
  rain_opening: 5,
  needs_review: 4,
  glow_reference: 3,
  texture: 2,
  ordinary: 1,
};

export function buildCloudSeaRuleContext(result: ForecastCalculationResult): CloudSeaRuleContext {
  const terrainContext = buildCloudSeaTerrainContextFromResult(result);
  const timezone =
    result.calendarBasis?.timezone ??
    result.professionalHourlyDataTimeBasis?.timezone ??
    "Asia/Shanghai";
  const professionalHourlyRows = rollingProfessionalHourlyRowsForResult(result);
  const cloudLayerCompletenessContext = buildCloudLayerCompletenessContext(professionalHourlyRows);
  const cloudBasisConsistencyContext = buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: professionalHourlyRows,
    cloudLayerCompletenessContext,
  });
  const multiSourceAgreementContext =
    result.weatherFusionSummary?.multiSourceAgreementContext ?? null;
  const bestWindow =
    result.cloudSeaAnalysis.bestCloudSeaWindow ??
    result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
    result.cloudSeaAnalysis.watchableCloudSeaWindows[0] ??
    null;
  const precipitationSignalContext = buildCloudSeaPrecipitationSignalContext({
    hourlyRows: professionalHourlyRows,
    timezone,
    focusedWindow: bestWindow
      ? {
          startTime: bestWindow.startTime,
          endTime: bestWindow.endTime,
        }
      : null,
    bestWindow,
    terrainContext: {
      elevationMeters: terrainContext.elevationMeters,
      surroundingReliefMeters: terrainContext.surroundingReliefMeters,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      terrainType: terrainContext.terrainType,
    },
    cloudLayerCompletenessContext,
  });
  const weatherVariableConsistencyContext = buildCloudSeaWeatherVariableConsistencyContext({
    elevationMeters: terrainContext.elevationMeters,
    surroundingReliefMeters: terrainContext.surroundingReliefMeters,
    timezone,
    terrainContext: {
      elevationMeters: terrainContext.elevationMeters,
      surroundingReliefMeters: terrainContext.surroundingReliefMeters,
      terrainClass: terrainContext.terrainClass,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      terrainType: terrainContext.terrainType,
      isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
    },
    hourlyRows: professionalHourlyRows,
    focusedWindow: bestWindow
      ? {
          startTime: bestWindow.startTime,
          endTime: bestWindow.endTime,
        }
      : null,
    cloudLayerCompletenessContext,
    multiSourceAgreementContext,
    precipitationSignalContext,
  });
  const recommendationGuardContext = buildCloudSeaRecommendationGuardForRuleContext(
    result,
    terrainContext,
    {
      cloudLayerCompleteness: cloudLayerCompletenessContext,
      cloudBasisConsistencyContext,
      multiSourceAgreementContext,
      weatherVariableConsistencyContext,
      precipitationSignalContext,
    },
  );

  return {
    terrainContext,
    cloudLayerCompletenessContext,
    cloudBasisConsistencyContext,
    cloudLayerRoleContext: buildCloudLayerRoleContext(professionalHourlyRows),
    weatherVariableConsistencyContext,
    precipitationSignalContext,
    multiSourceAgreementContext,
    recommendationGuardContext,
  };
}

function rollingProfessionalHourlyRowsForResult(
  result: ForecastCalculationResult,
): readonly ProfessionalHourlyDataPoint[] {
  const rows = result.professionalHourlyData ?? [];
  const anchorMs = Date.parse(
    result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
  );
  const expectedRowCount =
    normalizedRowCount(
      result.professionalHourlyDataTimeBasis?.expectedRowCount ??
        result.professionalHourlyDataTimeBasis?.requestedHours ??
        result.calendarBasis?.horizonHours,
    ) ?? rows.length;
  if (!Number.isFinite(anchorMs)) {
    return rows.slice(0, expectedRowCount);
  }

  return rows
    .map((row) => ({ row, timestamp: Date.parse(row.time) }))
    .filter(
      (entry): entry is { readonly row: ProfessionalHourlyDataPoint; readonly timestamp: number } =>
        Number.isFinite(entry.timestamp) && entry.timestamp >= anchorMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, expectedRowCount)
    .map((entry) => entry.row);
}

function normalizedRowCount(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined;
}

export function buildCloudSeaRecommendationGuardForRuleContext(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
  options: CloudSeaRecommendationGuardForRuleOptions,
): CloudSeaRecommendationGuardOutput {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow =
    options.bestWindow ??
    analysis.bestCloudSeaWindow ??
    analysis.bestCloudSeaWindows[0] ??
    analysis.watchableCloudSeaWindows[0];
  const formationScore = options.formationScore ?? analysis.formationScore;

  return buildCloudSeaRecommendationGuard({
    cloudSeaScore: options.cloudSeaScore ?? result.scores.cloudSea.score,
    shootabilityScore: options.shootabilityScore ?? analysis.shootableScore,
    formationScore,
    whiteoutRiskScore: options.whiteoutRiskScore ?? analysis.whiteoutRiskScore,
    proposedRecommendationLabel:
      options.proposedRecommendationLabel ?? analysis.recommendationLabel,
    terrainContext: {
      shouldDowngradeCloudSeaWording: terrainContext.shouldDowngradeCloudSeaWording,
      isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
      terrainClass: terrainContext.terrainClass,
    },
    cloudLayerCompletenessContext: options.cloudLayerCompleteness,
    cloudBasisConsistencyContext: options.cloudBasisConsistencyContext,
    multiSourceAgreementContext:
      options.multiSourceAgreementContext ??
      result.weatherFusionSummary?.multiSourceAgreementContext ??
      null,
    weatherVariableConsistencyContext: options.weatherVariableConsistencyContext,
    precipitationSignalContext:
      options.precipitationSignalContext ??
      options.weatherVariableConsistencyContext?.precipitationSignalContext,
    bestWindow: bestWindow ?? null,
    hasWindow: options.hasWindow ?? Boolean(bestWindow),
    risks: result.riskFlags,
    lowCloudSignalSupported:
      options.lowCloudSignalSupported ??
      (options.cloudLayerCompleteness.hasLowCloudLayer && formationScore >= 55),
    mainTargetZh: terrainContext.shouldDowngradeCloudSeaWording ? "低云/晨雾" : "清晨云海",
    bestWindowLabelZh: options.bestWindowLabelZh ?? bestWindow?.label,
  });
}

function buildCloudLayerRoleContext(
  rows: readonly ProfessionalHourlyDataPoint[] | null | undefined,
): CloudSeaCloudLayerRoleContext {
  const hourlyRows = rows ?? [];
  const counts = {
    cloudSeaHoursCount: countSignals(hourlyRows, ["可拍窗口"]),
    whiteoutRiskHoursCount: countSignals(hourlyRows, ["白墙风险"]),
    formationSignalHoursCount: countSignals(hourlyRows, ["形成信号"]),
    rainOpeningHoursCount: countSignals(hourlyRows, ["雨后开口"]),
    glowReferenceHoursCount: countSignals(hourlyRows, ["霞光参考"]),
    textureHoursCount: countSignals(hourlyRows, ["云层纹理"]),
    needsReviewHoursCount: countSignals(hourlyRows, ["需复核"]),
  };
  const redirectedMidHighHoursCount = hourlyRows.filter(
    (row) =>
      (row.cloudSeaSignal === "霞光参考" || row.cloudSeaSignal === "云层纹理") &&
      (!isFiniteNumber(row.cloudLowPercent) || row.cloudLowPercent < 35),
  ).length;
  const dominantRole = dominantCloudLayerRole(counts);

  return {
    ...counts,
    redirectedMidHighHoursCount,
    dominantRole,
    noteZh: cloudLayerRoleNoteZh(dominantRole, redirectedMidHighHoursCount),
  };
}

function countSignals(
  rows: readonly ProfessionalHourlyDataPoint[],
  signals: readonly ProfessionalHourlyCloudSeaSignal[],
): number {
  return rows.filter((row) => signals.includes(row.cloudSeaSignal)).length;
}

function dominantCloudLayerRole(
  counts: Omit<
    CloudSeaCloudLayerRoleContext,
    "dominantRole" | "noteZh" | "redirectedMidHighHoursCount"
  >,
): CloudSeaCloudLayerRoleContext["dominantRole"] {
  const candidates: readonly (readonly [CloudSeaCloudLayerRoleContext["dominantRole"], number])[] =
    [
      ["cloud_sea", counts.cloudSeaHoursCount],
      ["whiteout", counts.whiteoutRiskHoursCount],
      ["formation", counts.formationSignalHoursCount],
      ["rain_opening", counts.rainOpeningHoursCount],
      ["needs_review", counts.needsReviewHoursCount],
      ["glow_reference", counts.glowReferenceHoursCount],
      ["texture", counts.textureHoursCount],
    ];
  const best = [...candidates].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return signalRoleRank[right[0]] - signalRoleRank[left[0]];
  })[0];

  return best && best[1] > 0 ? best[0] : "ordinary";
}

function cloudLayerRoleNoteZh(
  dominantRole: CloudSeaCloudLayerRoleContext["dominantRole"],
  redirectedMidHighHoursCount: number,
): string {
  if (redirectedMidHighHoursCount > 0) {
    return "中高云主要作为霞光或云层纹理参考，低云不足时不直接作为云海依据。";
  }
  if (dominantRole === "cloud_sea" || dominantRole === "formation") {
    return "低云、湿度和通透度共同支持云海形成信号。";
  }
  if (dominantRole === "whiteout") {
    return "低云遮挡或白墙风险占主导，需优先复核能见度。";
  }
  if (dominantRole === "needs_review") {
    return "关键云层字段不足，云海与白墙判断需临近复核。";
  }
  return "云层角色未形成单一强信号，按保守观察处理。";
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
