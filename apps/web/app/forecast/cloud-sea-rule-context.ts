import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaRecommendationGuard,
  type CloudLayerCompletenessContext,
  type CloudSeaRecommendationGuardOutput,
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

export type CloudSeaWeatherVariableConsistencyWarningKey =
  | "humidity_dew_point_spread"
  | "precip_probability_trace_amount"
  | "terrain_temperature_delta"
  | "cloud_layer_total_mismatch";

export type CloudSeaWeatherVariableConsistencyWarning = {
  readonly key: CloudSeaWeatherVariableConsistencyWarningKey;
  readonly level: "low" | "medium" | "high";
  readonly messageZh: string;
  readonly affectedHoursCount: number;
};

export type CloudSeaWeatherVariableConsistencyContext = {
  readonly warnings: readonly CloudSeaWeatherVariableConsistencyWarning[];
  readonly hasContradictions: boolean;
  readonly cautionLevel: "none" | "low" | "medium" | "high";
  readonly summaryZh: string;
};

export type CloudSeaPrecipitationSignalContext = {
  readonly maxProbabilityPercent: number | null;
  readonly maxAmountMm: number | null;
  readonly activePrecipitation: boolean;
  readonly highProbabilityTraceAmount: boolean;
  readonly cautionLevel: "none" | "low" | "medium" | "high";
  readonly messageZh: string;
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
  const cloudLayerCompletenessContext = buildCloudLayerCompletenessContext(
    result.professionalHourlyData,
  );
  const multiSourceAgreementContext =
    result.weatherFusionSummary?.multiSourceAgreementContext ?? null;
  const recommendationGuardContext = buildCloudSeaRecommendationGuardForRuleContext(
    result,
    terrainContext,
    {
      cloudLayerCompleteness: cloudLayerCompletenessContext,
      multiSourceAgreementContext,
    },
  );

  return {
    terrainContext,
    cloudLayerCompletenessContext,
    cloudLayerRoleContext: buildCloudLayerRoleContext(result.professionalHourlyData),
    weatherVariableConsistencyContext: buildWeatherVariableConsistencyContext(
      result.professionalHourlyData,
    ),
    precipitationSignalContext: buildPrecipitationSignalContext(result.professionalHourlyData),
    multiSourceAgreementContext,
    recommendationGuardContext,
  };
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
    proposedRecommendationLabel: options.proposedRecommendationLabel ?? analysis.recommendationLabel,
    terrainContext: {
      shouldDowngradeCloudSeaWording: terrainContext.shouldDowngradeCloudSeaWording,
      isClassicCloudSeaEligible: terrainContext.isClassicCloudSeaEligible,
      terrainClass: terrainContext.terrainClass,
    },
    cloudLayerCompletenessContext: options.cloudLayerCompleteness,
    multiSourceAgreementContext:
      options.multiSourceAgreementContext ??
      result.weatherFusionSummary?.multiSourceAgreementContext ??
      null,
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

function buildWeatherVariableConsistencyContext(
  rows: readonly ProfessionalHourlyDataPoint[] | null | undefined,
): CloudSeaWeatherVariableConsistencyContext {
  const hourlyRows = rows ?? [];
  const warnings = [
    warningForCount(
      "humidity_dew_point_spread",
      hourlyRows.filter(
        (row) =>
          (row.relativeHumidityPercent ?? 0) >= 95 && (row.dewPointSpreadC ?? 0) >= 6,
      ).length,
      "湿度接近饱和但露点差仍偏大，需复核湿度或露点来源。",
    ),
    warningForCount(
      "precip_probability_trace_amount",
      hourlyRows.filter(
        (row) =>
          (row.precipitationProbabilityPercent ?? 0) >= 70 &&
          (row.precipitationAmountMm ?? 0) <= 0.1,
      ).length,
      "降水概率较高但小时降水量接近 0，需结合临近雷达或短临预报复核。",
    ),
    warningForCount(
      "terrain_temperature_delta",
      hourlyRows.filter(
        (row) =>
          isFiniteNumber(row.rawTemperatureC) &&
          isFiniteNumber(row.terrainAdjustedTemperatureC) &&
          Math.abs(row.rawTemperatureC - row.terrainAdjustedTemperatureC) >= 8,
      ).length,
      "原始格点温度与地形修正温度差异较大，需留意海拔修正影响。",
    ),
    warningForCount(
      "cloud_layer_total_mismatch",
      hourlyRows.filter((row) => {
        if (!isFiniteNumber(row.cloudTotalPercent)) {
          return false;
        }
        const layerMax = Math.max(
          row.cloudHighPercent ?? Number.NEGATIVE_INFINITY,
          row.cloudMidPercent ?? Number.NEGATIVE_INFINITY,
          row.cloudLowPercent ?? Number.NEGATIVE_INFINITY,
        );
        return Number.isFinite(layerMax) && layerMax > row.cloudTotalPercent + 15;
      }).length,
      "总云量与分层云量关系异常，云层角色需按低置信度复核。",
    ),
  ].filter(
    (warning): warning is CloudSeaWeatherVariableConsistencyWarning => warning !== null,
  );

  return {
    warnings,
    hasContradictions: warnings.length > 0,
    cautionLevel: consistencyCautionLevel(warnings),
    summaryZh:
      warnings.length > 0
        ? warnings[0]!.messageZh
        : "核心天气变量关系未发现明显矛盾。",
  };
}

function buildPrecipitationSignalContext(
  rows: readonly ProfessionalHourlyDataPoint[] | null | undefined,
): CloudSeaPrecipitationSignalContext {
  const hourlyRows = rows ?? [];
  const maxProbabilityPercent = maxFinite(
    hourlyRows.map((row) => row.precipitationProbabilityPercent),
  );
  const maxAmountMm = maxFinite(hourlyRows.map((row) => row.precipitationAmountMm));
  const activePrecipitation = (maxAmountMm ?? 0) >= 0.3 || (maxProbabilityPercent ?? 0) >= 60;
  const highProbabilityTraceAmount =
    (maxProbabilityPercent ?? 0) >= 70 && (maxAmountMm ?? 0) <= 0.1;
  const cautionLevel =
    (maxAmountMm ?? 0) >= 1
      ? "high"
      : activePrecipitation || highProbabilityTraceAmount
        ? "medium"
        : (maxProbabilityPercent ?? 0) >= 40
          ? "low"
          : "none";

  return {
    maxProbabilityPercent: maxProbabilityPercent ?? null,
    maxAmountMm: maxAmountMm ?? null,
    activePrecipitation,
    highProbabilityTraceAmount,
    cautionLevel,
    messageZh: precipitationSignalMessageZh({
      maxProbabilityPercent,
      maxAmountMm,
      activePrecipitation,
      highProbabilityTraceAmount,
    }),
  };
}

function countSignals(
  rows: readonly ProfessionalHourlyDataPoint[],
  signals: readonly ProfessionalHourlyCloudSeaSignal[],
): number {
  return rows.filter((row) => signals.includes(row.cloudSeaSignal)).length;
}

function dominantCloudLayerRole(
  counts: Omit<CloudSeaCloudLayerRoleContext, "dominantRole" | "noteZh" | "redirectedMidHighHoursCount">,
): CloudSeaCloudLayerRoleContext["dominantRole"] {
  const candidates: readonly (readonly [CloudSeaCloudLayerRoleContext["dominantRole"], number])[] = [
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

function warningForCount(
  key: CloudSeaWeatherVariableConsistencyWarningKey,
  affectedHoursCount: number,
  messageZh: string,
): CloudSeaWeatherVariableConsistencyWarning | null {
  if (affectedHoursCount <= 0) {
    return null;
  }
  return {
    key,
    affectedHoursCount,
    level: affectedHoursCount >= 3 ? "high" : "medium",
    messageZh,
  };
}

function consistencyCautionLevel(
  warnings: readonly CloudSeaWeatherVariableConsistencyWarning[],
): CloudSeaWeatherVariableConsistencyContext["cautionLevel"] {
  if (warnings.some((warning) => warning.level === "high")) {
    return "high";
  }
  if (warnings.length > 0) {
    return "medium";
  }
  return "none";
}

function precipitationSignalMessageZh(input: {
  readonly maxProbabilityPercent?: number;
  readonly maxAmountMm?: number;
  readonly activePrecipitation: boolean;
  readonly highProbabilityTraceAmount: boolean;
}): string {
  if (input.highProbabilityTraceAmount) {
    return "降水概率高但量级接近 0，出发前需结合短临预报复核。";
  }
  if (input.activePrecipitation) {
    return "窗口附近存在降水信号，需复核雨后开口和低云遮挡。";
  }
  if (input.maxProbabilityPercent !== undefined || input.maxAmountMm !== undefined) {
    return "降水信号暂未构成主要阻断。";
  }
  return "降水字段不足，需临近预报复核。";
}

function maxFinite(values: readonly (number | null | undefined)[]): number | undefined {
  const finiteValues = values.filter(isFiniteNumber);
  return finiteValues.length > 0 ? Math.max(...finiteValues) : undefined;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
