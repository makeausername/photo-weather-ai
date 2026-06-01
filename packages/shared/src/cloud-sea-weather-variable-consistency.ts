import type { CloudLayerCompletenessContext } from "./cloud-layer-completeness.js";
import {
  buildCloudSeaCloudBasisConsistencyContext,
  type CloudSeaCloudBasisConsistencyContext,
} from "./cloud-sea-cloud-basis-consistency.js";
import type {
  ForecastMultiSourceAgreementContext,
  ProfessionalHourlyCloudLayerBasis,
  ProfessionalHourlyDataPoint,
  ProfessionalHourlyTemperatureBasis,
  TerrainMode,
  TerrainType,
} from "./types.js";

export type CloudSeaWeatherVariableConsistencyLevel = "good" | "watch" | "conflict" | "unknown";

export type CloudSeaTemperatureBasisStatus = "terrain_adjusted" | "raw_grid" | "mixed" | "unknown";

export type CloudSeaHumidityDewPointStatus = "consistent" | "watch" | "conflict" | "unknown";

export type CloudSeaPrecipitationSignalStatus =
  | "none"
  | "light_disturbance"
  | "meaningful_precipitation"
  | "probability_only"
  | "conflict"
  | "unknown";

export type CloudSeaCloudBasisStatus =
  | "consistent"
  | "minor_mismatch"
  | "mixed_basis"
  | "partial_layers"
  | "total_only"
  | "unknown";

export type CloudSeaVisibilityStatus = "good" | "moderate" | "poor" | "unknown";

export type CloudSeaWindStatus = "calm" | "moderate" | "strong" | "unknown";

export type CloudSeaWeatherVariableConsistencyWarningKey =
  | "humidity_dew_point_spread"
  | "precip_probability_trace_amount"
  | "terrain_temperature_delta"
  | "cloud_layer_total_mismatch"
  | "visibility_whiteout_support"
  | "wind_strength";

export type CloudSeaWeatherVariableConsistencyWarning = {
  readonly key: CloudSeaWeatherVariableConsistencyWarningKey;
  readonly level: "low" | "medium" | "high";
  readonly messageZh: string;
  readonly affectedHoursCount: number;
};

export type CloudSeaWeatherVariableConsistencyContext = {
  readonly consistencyLevel: CloudSeaWeatherVariableConsistencyLevel;
  readonly temperatureBasisStatus: CloudSeaTemperatureBasisStatus;
  readonly humidityDewPointStatus: CloudSeaHumidityDewPointStatus;
  readonly precipitationSignalStatus: CloudSeaPrecipitationSignalStatus;
  readonly cloudBasisStatus: CloudSeaCloudBasisStatus;
  readonly visibilityStatus: CloudSeaVisibilityStatus;
  readonly windStatus: CloudSeaWindStatus;
  readonly shouldLowerConfidence: boolean;
  readonly shouldAvoidStrongWording: boolean;
  readonly shouldDowngradePrecipitationWording: boolean;
  readonly shouldPreferTerrainAdjustedTemperature: boolean;
  readonly warningsZh: readonly string[];
  readonly userSummaryZh: string;
  readonly professionalSummaryZh: string;
  readonly warnings: readonly CloudSeaWeatherVariableConsistencyWarning[];
  readonly hasContradictions: boolean;
  readonly cautionLevel: "none" | "low" | "medium" | "high";
  readonly summaryZh: string;
};

export type CloudSeaWeatherVariableConsistencyInput = {
  readonly elevationMeters?: number | null;
  readonly terrainAdjustedTemperatureC?: number | null;
  readonly rawGridTemperatureC?: number | null;
  readonly displayedTemperatureC?: number | null;
  readonly humidityPercent?: number | null;
  readonly dewPointC?: number | null;
  readonly temperatureC?: number | null;
  readonly dewPointSpreadC?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly visibilityKm?: number | null;
  readonly windSpeedMs?: number | null;
  readonly windGustMs?: number | null;
  readonly cloudTotalPercent?: number | null;
  readonly cloudLowPercent?: number | null;
  readonly cloudMidPercent?: number | null;
  readonly cloudHighPercent?: number | null;
  readonly cloudLayerCompletenessContext?: CloudLayerCompletenessContext | null;
  readonly multiSourceAgreementContext?: ForecastMultiSourceAgreementContext | null;
  readonly terrainContext?: {
    readonly elevationMeters?: number | null;
    readonly surroundingReliefMeters?: number | null;
    readonly terrainClass?: string | null;
    readonly terrainMode?: TerrainMode | string | null;
    readonly terrainType?: TerrainType | string | null;
  } | null;
  readonly surroundingReliefMeters?: number | null;
  readonly terrainMode?: TerrainMode | string | null;
  readonly terrainType?: TerrainType | string | null;
  readonly hourlyRows?: readonly ProfessionalHourlyDataPoint[] | null;
  readonly focusedWindow?: {
    readonly startTime?: string | null;
    readonly endTime?: string | null;
  } | null;
};

type WeatherVariableSnapshot = {
  readonly rawGridTemperatureC?: number;
  readonly terrainAdjustedTemperatureC?: number;
  readonly displayedTemperatureC?: number;
  readonly temperatureC?: number;
  readonly temperatureBasis?: ProfessionalHourlyTemperatureBasis;
  readonly humidityPercent?: number;
  readonly dewPointC?: number;
  readonly dewPointSpreadC?: number;
  readonly precipitationAmountMm?: number;
  readonly precipitationProbabilityPercent?: number;
  readonly visibilityKm?: number;
  readonly windSpeedMs?: number;
  readonly windGustMs?: number;
  readonly cloudTotalPercent?: number;
  readonly cloudLowPercent?: number;
  readonly cloudMidPercent?: number;
  readonly cloudHighPercent?: number;
  readonly cloudLayerBasis?: ProfessionalHourlyCloudLayerBasis;
};

type TemperatureEvaluation = {
  readonly status: CloudSeaTemperatureBasisStatus;
  readonly shouldPreferTerrainAdjustedTemperature: boolean;
  readonly warning: CloudSeaWeatherVariableConsistencyWarning | null;
  readonly hasConflict: boolean;
  readonly hasWatch: boolean;
};

type HumidityEvaluation = {
  readonly status: CloudSeaHumidityDewPointStatus;
  readonly warning: CloudSeaWeatherVariableConsistencyWarning | null;
};

type PrecipitationEvaluation = {
  readonly status: CloudSeaPrecipitationSignalStatus;
  readonly shouldDowngradePrecipitationWording: boolean;
  readonly warning: CloudSeaWeatherVariableConsistencyWarning | null;
};

type CloudBasisEvaluation = {
  readonly status: CloudSeaCloudBasisStatus;
  readonly warning: CloudSeaWeatherVariableConsistencyWarning | null;
  readonly context: CloudSeaCloudBasisConsistencyContext;
};

const highMountainTerrainModes = new Set(["high_mountain", "mountain"]);
const highMountainTerrainClasses = new Set(["high_mountain", "mountain"]);
const highReliefTerrainTypes = new Set(["summit", "ridge", "mountain_platform"]);

export function buildCloudSeaWeatherVariableConsistencyContext(
  input: CloudSeaWeatherVariableConsistencyInput = {},
): CloudSeaWeatherVariableConsistencyContext {
  const rows = rowsForFocusedWindow(input.hourlyRows, input.focusedWindow);
  const snapshots = [...rows.map(snapshotFromProfessionalRow), ...optionalSnapshotFromInput(input)];
  const highMountainLike = isHighMountainLike(input);
  const temperature = evaluateTemperatureBasis(snapshots, highMountainLike);
  const humidity = evaluateHumidityDewPoint(snapshots);
  const precipitation = evaluatePrecipitationSignal(snapshots);
  const cloudBasis = evaluateCloudBasis(
    snapshots,
    input.cloudLayerCompletenessContext,
    input.multiSourceAgreementContext,
  );
  const visibilityStatus = evaluateVisibilityStatus(snapshots);
  const windStatus = evaluateWindStatus(snapshots);
  const visibilityWarning = warningForVisibilityWhiteoutSupport(visibilityStatus, snapshots);
  const windWarning = warningForWindStatus(windStatus, snapshots);
  const warnings = combineWarnings([
    temperature.warning,
    humidity.warning,
    precipitation.warning,
    cloudBasis.warning,
    visibilityWarning,
    windWarning,
  ]);
  const classifiedConsistencyLevel = classifyConsistencyLevel({
    snapshots,
    temperature,
    humidityStatus: humidity.status,
    precipitationStatus: precipitation.status,
    cloudBasisStatus: cloudBasis.status,
    visibilityStatus,
    windStatus,
  });
  const consistencyLevel =
    classifiedConsistencyLevel === "good" && warnings.length > 0
      ? "watch"
      : classifiedConsistencyLevel;
  const warningsZh = uniqueText(warnings.map((warning) => warning.messageZh));
  const shouldLowerConfidence =
    consistencyLevel === "conflict" ||
    humidity.status === "conflict" ||
    cloudBasis.status === "mixed_basis" ||
    cloudBasis.status === "total_only" ||
    cloudBasis.context.shouldLowerCloudSeaConfidence ||
    temperature.hasConflict;
  const shouldAvoidStrongWording =
    consistencyLevel === "conflict" ||
    humidity.status !== "consistent" ||
    cloudBasis.status === "mixed_basis" ||
    cloudBasis.status === "total_only" ||
    cloudBasis.context.shouldAvoidStrictLayerInterpretation ||
    temperature.hasConflict;
  const userSummaryZh = buildUserSummaryZh(consistencyLevel, warningsZh);
  const professionalSummaryZh = buildProfessionalSummaryZh({
    consistencyLevel,
    temperatureStatus: temperature.status,
    humidityStatus: humidity.status,
    precipitationStatus: precipitation.status,
    cloudBasisStatus: cloudBasis.status,
    visibilityStatus,
    windStatus,
    warningsZh,
  });

  return {
    consistencyLevel,
    temperatureBasisStatus: temperature.status,
    humidityDewPointStatus: humidity.status,
    precipitationSignalStatus: precipitation.status,
    cloudBasisStatus: cloudBasis.status,
    visibilityStatus,
    windStatus,
    shouldLowerConfidence,
    shouldAvoidStrongWording,
    shouldDowngradePrecipitationWording: precipitation.shouldDowngradePrecipitationWording,
    shouldPreferTerrainAdjustedTemperature: temperature.shouldPreferTerrainAdjustedTemperature,
    warningsZh,
    userSummaryZh,
    professionalSummaryZh,
    warnings,
    hasContradictions: consistencyLevel === "conflict" || warnings.length > 0,
    cautionLevel: consistencyCautionLevel(consistencyLevel, warnings),
    summaryZh: userSummaryZh,
  };
}

function rowsForFocusedWindow(
  rows: readonly ProfessionalHourlyDataPoint[] | null | undefined,
  focusedWindow: CloudSeaWeatherVariableConsistencyInput["focusedWindow"],
): readonly ProfessionalHourlyDataPoint[] {
  const hourlyRows = rows ?? [];
  if (!focusedWindow?.startTime || !focusedWindow.endTime || hourlyRows.length === 0) {
    return hourlyRows;
  }
  const start = Date.parse(focusedWindow.startTime);
  const end = Date.parse(focusedWindow.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return hourlyRows;
  }
  const focusedRows = hourlyRows.filter((row) => {
    const time = Date.parse(row.time);
    return Number.isFinite(time) && time >= start && time <= end;
  });
  return focusedRows.length > 0 ? focusedRows : hourlyRows;
}

function snapshotFromProfessionalRow(row: ProfessionalHourlyDataPoint): WeatherVariableSnapshot {
  return {
    rawGridTemperatureC: finiteNumber(row.rawTemperatureC),
    terrainAdjustedTemperatureC: finiteNumber(row.terrainAdjustedTemperatureC),
    displayedTemperatureC: finiteNumber(row.displayedTemperatureC),
    temperatureC: finiteNumber(row.displayedTemperatureC),
    temperatureBasis: row.temperatureBasis,
    humidityPercent: finiteNumber(row.relativeHumidityPercent),
    dewPointC: finiteNumber(row.dewPointC),
    dewPointSpreadC: finiteNumber(row.dewPointSpreadC),
    precipitationAmountMm: finiteNumber(row.precipitationAmountMm),
    precipitationProbabilityPercent: finiteNumber(row.precipitationProbabilityPercent),
    visibilityKm: metersToKilometers(row.visibilityMeters),
    windSpeedMs: finiteNumber(row.windSpeedMs),
    cloudTotalPercent: finiteNumber(row.cloudTotalPercent),
    cloudLowPercent: finiteNumber(row.cloudLowPercent),
    cloudMidPercent: finiteNumber(row.cloudMidPercent),
    cloudHighPercent: finiteNumber(row.cloudHighPercent),
    cloudLayerBasis: row.cloudLayerBasis,
  };
}

function optionalSnapshotFromInput(
  input: CloudSeaWeatherVariableConsistencyInput,
): readonly WeatherVariableSnapshot[] {
  const snapshot: WeatherVariableSnapshot = {
    rawGridTemperatureC: finiteNumber(input.rawGridTemperatureC),
    terrainAdjustedTemperatureC: finiteNumber(input.terrainAdjustedTemperatureC),
    displayedTemperatureC: finiteNumber(input.displayedTemperatureC),
    temperatureC: finiteNumber(input.temperatureC ?? input.displayedTemperatureC),
    humidityPercent: finiteNumber(input.humidityPercent),
    dewPointC: finiteNumber(input.dewPointC),
    dewPointSpreadC: finiteNumber(input.dewPointSpreadC),
    precipitationAmountMm: finiteNumber(input.precipitationAmountMm),
    precipitationProbabilityPercent: finiteNumber(input.precipitationProbabilityPercent),
    visibilityKm: finiteNumber(input.visibilityKm),
    windSpeedMs: finiteNumber(input.windSpeedMs),
    windGustMs: finiteNumber(input.windGustMs),
    cloudTotalPercent: finiteNumber(input.cloudTotalPercent),
    cloudLowPercent: finiteNumber(input.cloudLowPercent),
    cloudMidPercent: finiteNumber(input.cloudMidPercent),
    cloudHighPercent: finiteNumber(input.cloudHighPercent),
  };

  return snapshotHasAnyValue(snapshot) ? [snapshot] : [];
}

function evaluateTemperatureBasis(
  snapshots: readonly WeatherVariableSnapshot[],
  highMountainLike: boolean,
): TemperatureEvaluation {
  const temperatureRows = snapshots.filter(
    (snapshot) =>
      isFiniteNumber(snapshot.rawGridTemperatureC) ||
      isFiniteNumber(snapshot.terrainAdjustedTemperatureC) ||
      isFiniteNumber(snapshot.displayedTemperatureC) ||
      isFiniteNumber(snapshot.temperatureC),
  );
  if (temperatureRows.length === 0) {
    return {
      status: "unknown",
      shouldPreferTerrainAdjustedTemperature: false,
      warning: null,
      hasConflict: false,
      hasWatch: false,
    };
  }

  const hasTerrainAdjusted = temperatureRows.some((snapshot) =>
    isFiniteNumber(snapshot.terrainAdjustedTemperatureC),
  );
  const hasRawGrid = temperatureRows.some((snapshot) =>
    isFiniteNumber(snapshot.rawGridTemperatureC),
  );
  const maxDelta = maxFinite(
    temperatureRows.map((snapshot) =>
      isFiniteNumber(snapshot.rawGridTemperatureC) &&
      isFiniteNumber(snapshot.terrainAdjustedTemperatureC)
        ? Math.abs(snapshot.rawGridTemperatureC - snapshot.terrainAdjustedTemperatureC)
        : undefined,
    ),
  );
  const rawGridLikeCount = temperatureRows.filter((snapshot) =>
    rowDisplaysRawGridTemperature(snapshot),
  ).length;
  const terrainAdjustedLikeCount = temperatureRows.filter((snapshot) =>
    rowDisplaysTerrainAdjustedTemperature(snapshot),
  ).length;
  const mixedBasis = rawGridLikeCount > 0 && terrainAdjustedLikeCount > 0;
  const rawGridDrivesHighMountainDisplay =
    highMountainLike && hasRawGrid && hasTerrainAdjusted && rawGridLikeCount > 0;

  const status: CloudSeaTemperatureBasisStatus =
    mixedBasis || rawGridDrivesHighMountainDisplay
      ? "mixed"
      : hasTerrainAdjusted && terrainAdjustedLikeCount > 0
        ? "terrain_adjusted"
        : hasRawGrid
          ? "raw_grid"
          : "unknown";
  const hasWatch =
    highMountainLike && hasTerrainAdjusted && isFiniteNumber(maxDelta) && maxDelta >= 3;
  const hasConflict = rawGridDrivesHighMountainDisplay && isFiniteNumber(maxDelta) && maxDelta >= 5;

  return {
    status,
    shouldPreferTerrainAdjustedTemperature: highMountainLike && hasTerrainAdjusted,
    warning:
      hasWatch || hasConflict
        ? {
            key: "terrain_temperature_delta",
            level: hasConflict ? "high" : "medium",
            affectedHoursCount: countTemperatureDeltaRows(temperatureRows, hasConflict ? 5 : 3),
            messageZh: hasConflict
              ? "原始格点温度可能偏暖，穿衣和体感建议以机位估算温度为准。"
              : "高山机位优先参考机位海拔修正温度。",
          }
        : null,
    hasConflict,
    hasWatch,
  };
}

function rowDisplaysRawGridTemperature(snapshot: WeatherVariableSnapshot): boolean {
  if (snapshot.temperatureBasis === "raw_grid") {
    return true;
  }
  if (
    !isFiniteNumber(snapshot.displayedTemperatureC) ||
    !isFiniteNumber(snapshot.rawGridTemperatureC) ||
    !isFiniteNumber(snapshot.terrainAdjustedTemperatureC)
  ) {
    return false;
  }
  return (
    Math.abs(snapshot.displayedTemperatureC - snapshot.rawGridTemperatureC) <
    Math.abs(snapshot.displayedTemperatureC - snapshot.terrainAdjustedTemperatureC)
  );
}

function rowDisplaysTerrainAdjustedTemperature(snapshot: WeatherVariableSnapshot): boolean {
  if (snapshot.temperatureBasis === "terrain_adjusted") {
    return true;
  }
  if (
    !isFiniteNumber(snapshot.displayedTemperatureC) ||
    !isFiniteNumber(snapshot.terrainAdjustedTemperatureC)
  ) {
    return false;
  }
  if (!isFiniteNumber(snapshot.rawGridTemperatureC)) {
    return true;
  }
  return (
    Math.abs(snapshot.displayedTemperatureC - snapshot.terrainAdjustedTemperatureC) <=
    Math.abs(snapshot.displayedTemperatureC - snapshot.rawGridTemperatureC)
  );
}

function countTemperatureDeltaRows(
  snapshots: readonly WeatherVariableSnapshot[],
  threshold: number,
): number {
  return snapshots.filter(
    (snapshot) =>
      isFiniteNumber(snapshot.rawGridTemperatureC) &&
      isFiniteNumber(snapshot.terrainAdjustedTemperatureC) &&
      Math.abs(snapshot.rawGridTemperatureC - snapshot.terrainAdjustedTemperatureC) >= threshold,
  ).length;
}

function evaluateHumidityDewPoint(
  snapshots: readonly WeatherVariableSnapshot[],
): HumidityEvaluation {
  const vaporRows = snapshots
    .map((snapshot) => ({
      humidity: snapshot.humidityPercent,
      spread: dewPointSpreadForSnapshot(snapshot),
    }))
    .filter(
      (row): row is { readonly humidity: number; readonly spread: number } =>
        isFiniteNumber(row.humidity) && isFiniteNumber(row.spread),
    );

  if (vaporRows.length === 0) {
    return { status: "unknown", warning: null };
  }

  const conflictRows = vaporRows.filter(
    (row) =>
      (row.humidity >= 95 && row.spread > 5) ||
      (row.humidity >= 90 && row.spread > 7) ||
      (row.humidity <= 60 && row.spread <= 1.5),
  );
  const watchRows = vaporRows.filter(
    (row) => (row.humidity >= 95 && row.spread > 3) || (row.humidity <= 60 && row.spread <= 1.5),
  );

  if (conflictRows.length > 0) {
    return {
      status: "conflict",
      warning: {
        key: "humidity_dew_point_spread",
        level: "high",
        affectedHoursCount: conflictRows.length,
        messageZh: "水汽指标存在口径差异，湿度与露点差需结合临近预报复核。",
      },
    };
  }

  if (watchRows.length > 0) {
    return {
      status: "watch",
      warning: {
        key: "humidity_dew_point_spread",
        level: "medium",
        affectedHoursCount: watchRows.length,
        messageZh: "湿度与露点差关系偏紧，云雾判断需现场复核。",
      },
    };
  }

  return { status: "consistent", warning: null };
}

function evaluatePrecipitationSignal(
  snapshots: readonly WeatherVariableSnapshot[],
): PrecipitationEvaluation {
  const maxProbabilityPercent = maxFinite(
    snapshots.map((snapshot) => snapshot.precipitationProbabilityPercent),
  );
  const maxAmountMm = maxFinite(snapshots.map((snapshot) => snapshot.precipitationAmountMm));

  if (!isFiniteNumber(maxProbabilityPercent) && !isFiniteNumber(maxAmountMm)) {
    return {
      status: "unknown",
      shouldDowngradePrecipitationWording: false,
      warning: null,
    };
  }

  if ((maxAmountMm ?? 0) >= 3 && (maxProbabilityPercent ?? 100) <= 10) {
    return {
      status: "conflict",
      shouldDowngradePrecipitationWording: true,
      warning: {
        key: "precip_probability_trace_amount",
        level: "high",
        affectedHoursCount: countPrecipitationRows(snapshots, 10, 3),
        messageZh: "降水概率与雨量级别存在冲突，需临近预报复核后再判断降水影响。",
      },
    };
  }

  if ((maxAmountMm ?? 0) >= 1) {
    return {
      status: "meaningful_precipitation",
      shouldDowngradePrecipitationWording: false,
      warning: null,
    };
  }

  if ((maxProbabilityPercent ?? 0) >= 60 && (maxAmountMm ?? 0) <= 0.2) {
    const probabilityOnly = (maxAmountMm ?? 0) <= 0.05;
    return {
      status: probabilityOnly ? "probability_only" : "light_disturbance",
      shouldDowngradePrecipitationWording: true,
      warning: {
        key: "precip_probability_trace_amount",
        level: "medium",
        affectedHoursCount: countProbabilityOnlyRows(snapshots),
        messageZh: probabilityOnly
          ? "降水概率较高但雨量很小，更像局地短时扰动信号，不宜直接按强降水处理。"
          : "降水概率偏高但雨量较小，出行前需复核短临预报。",
      },
    };
  }

  if ((maxAmountMm ?? 0) > 0.05 || (maxProbabilityPercent ?? 0) >= 40) {
    return {
      status: "light_disturbance",
      shouldDowngradePrecipitationWording: true,
      warning: null,
    };
  }

  return {
    status: "none",
    shouldDowngradePrecipitationWording: false,
    warning: null,
  };
}

function countPrecipitationRows(
  snapshots: readonly WeatherVariableSnapshot[],
  maxProbabilityThreshold: number,
  minAmountThreshold: number,
): number {
  return snapshots.filter(
    (snapshot) =>
      (snapshot.precipitationProbabilityPercent ?? 100) <= maxProbabilityThreshold &&
      (snapshot.precipitationAmountMm ?? 0) >= minAmountThreshold,
  ).length;
}

function countProbabilityOnlyRows(snapshots: readonly WeatherVariableSnapshot[]): number {
  return snapshots.filter(
    (snapshot) =>
      (snapshot.precipitationProbabilityPercent ?? 0) >= 60 &&
      (snapshot.precipitationAmountMm ?? 0) <= 0.2,
  ).length;
}

function evaluateCloudBasis(
  snapshots: readonly WeatherVariableSnapshot[],
  completeness: CloudLayerCompletenessContext | null | undefined,
  agreement: ForecastMultiSourceAgreementContext | null | undefined,
): CloudBasisEvaluation {
  const basisValues = uniqueText(
    snapshots
      .map((snapshot) => snapshot.cloudLayerBasis)
      .filter((basis): basis is ProfessionalHourlyCloudLayerBasis => Boolean(basis)),
  );
  const mixedSourceDisagreement = hasHighCloudBasisDisagreement(agreement);
  const context = buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: snapshots,
    cloudLayerCompletenessContext: completeness,
  });

  if (
    context.cloudBasisLevel === "mixed_basis" ||
    basisValues.length > 1 ||
    mixedSourceDisagreement
  ) {
    return {
      status: "mixed_basis",
      context,
      warning: {
        key: "cloud_layer_total_mismatch",
        level: mixedSourceDisagreement ? "high" : "medium",
        affectedHoursCount: Math.max(1, context.mismatchHoursCount),
        messageZh: context.professionalSummaryZh,
      },
    };
  }

  if (context.cloudBasisLevel === "minor_mismatch") {
    return {
      status: "minor_mismatch",
      context,
      warning: {
        key: "cloud_layer_total_mismatch",
        level: "low",
        affectedHoursCount: Math.max(1, context.mismatchHoursCount),
        messageZh: context.professionalSummaryZh,
      },
    };
  }

  if (context.cloudBasisLevel === "total_only") {
    return {
      status: "total_only",
      context,
      warning: {
        key: "cloud_layer_total_mismatch",
        level: "medium",
        affectedHoursCount: Math.max(1, context.totalHoursCount),
        messageZh: context.professionalSummaryZh,
      },
    };
  }

  if (context.cloudBasisLevel === "partial_layers") {
    return {
      status: "partial_layers",
      context,
      warning: {
        key: "cloud_layer_total_mismatch",
        level: context.shouldLowerCloudSeaConfidence ? "medium" : "low",
        affectedHoursCount: Math.max(1, context.missingLayerHoursCount),
        messageZh: context.professionalSummaryZh,
      },
    };
  }

  if (context.cloudBasisLevel === "unknown") {
    return { status: "unknown", warning: null, context };
  }

  return { status: "consistent", warning: null, context };
}

function hasHighCloudBasisDisagreement(
  agreement: ForecastMultiSourceAgreementContext | null | undefined,
): boolean {
  if (!agreement || agreement.disagreementLevel !== "high") {
    return false;
  }
  return agreement.fieldDisagreements.some((item) => {
    if (item.level !== "high") {
      return false;
    }
    const field = item.field.toLowerCase();
    return field.includes("cloudtotal") || field.includes("cloudlow");
  });
}

function evaluateVisibilityStatus(
  snapshots: readonly WeatherVariableSnapshot[],
): CloudSeaVisibilityStatus {
  const minVisibilityKm = minFinite(snapshots.map((snapshot) => snapshot.visibilityKm));
  if (!isFiniteNumber(minVisibilityKm)) {
    return "unknown";
  }
  if (minVisibilityKm < 2) {
    return "poor";
  }
  if (minVisibilityKm < 8) {
    return "moderate";
  }
  return "good";
}

function evaluateWindStatus(snapshots: readonly WeatherVariableSnapshot[]): CloudSeaWindStatus {
  const maxWindSpeedMs = maxFinite(snapshots.map((snapshot) => snapshot.windSpeedMs));
  const maxWindGustMs = maxFinite(snapshots.map((snapshot) => snapshot.windGustMs));
  const strongestWindMs = maxFinite([maxWindSpeedMs, maxWindGustMs]);
  if (!isFiniteNumber(strongestWindMs)) {
    return "unknown";
  }
  if (strongestWindMs >= 8 || (maxWindGustMs ?? 0) >= 12) {
    return "strong";
  }
  if (strongestWindMs >= 3) {
    return "moderate";
  }
  return "calm";
}

function warningForVisibilityWhiteoutSupport(
  visibilityStatus: CloudSeaVisibilityStatus,
  snapshots: readonly WeatherVariableSnapshot[],
): CloudSeaWeatherVariableConsistencyWarning | null {
  if (visibilityStatus === "unknown" || visibilityStatus === "poor") {
    return null;
  }
  const humidityOnlyRows = snapshots.filter((snapshot) => {
    const spread = dewPointSpreadForSnapshot(snapshot);
    return (
      (snapshot.humidityPercent ?? 0) >= 95 &&
      isFiniteNumber(spread) &&
      spread <= 2 &&
      (!isFiniteNumber(snapshot.cloudLowPercent) || snapshot.cloudLowPercent < 35)
    );
  });
  if (humidityOnlyRows.length === 0) {
    return null;
  }
  return {
    key: "visibility_whiteout_support",
    level: "low",
    affectedHoursCount: humidityOnlyRows.length,
    messageZh: "能见度未明显转差时，不宜仅凭湿度放大白墙风险。",
  };
}

function warningForWindStatus(
  windStatus: CloudSeaWindStatus,
  snapshots: readonly WeatherVariableSnapshot[],
): CloudSeaWeatherVariableConsistencyWarning | null {
  if (windStatus !== "strong") {
    return null;
  }
  return {
    key: "wind_strength",
    level: "medium",
    affectedHoursCount: Math.max(
      1,
      snapshots.filter((snapshot) => (snapshot.windSpeedMs ?? 0) >= 8).length,
    ),
    messageZh: "风速偏强，需复核云雾稳定性、保暖和三脚架稳定。",
  };
}

function classifyConsistencyLevel(input: {
  readonly snapshots: readonly WeatherVariableSnapshot[];
  readonly temperature: TemperatureEvaluation;
  readonly humidityStatus: CloudSeaHumidityDewPointStatus;
  readonly precipitationStatus: CloudSeaPrecipitationSignalStatus;
  readonly cloudBasisStatus: CloudSeaCloudBasisStatus;
  readonly visibilityStatus: CloudSeaVisibilityStatus;
  readonly windStatus: CloudSeaWindStatus;
}): CloudSeaWeatherVariableConsistencyLevel {
  if (
    input.snapshots.length === 0 &&
    input.cloudBasisStatus === "unknown" &&
    input.visibilityStatus === "unknown" &&
    input.windStatus === "unknown"
  ) {
    return "unknown";
  }
  if (
    input.temperature.hasConflict ||
    input.humidityStatus === "conflict" ||
    input.precipitationStatus === "conflict"
  ) {
    return "conflict";
  }
  if (
    input.temperature.hasWatch ||
    input.humidityStatus === "watch" ||
    input.precipitationStatus === "probability_only" ||
    input.precipitationStatus === "light_disturbance" ||
    input.cloudBasisStatus === "minor_mismatch" ||
    input.cloudBasisStatus === "mixed_basis" ||
    input.cloudBasisStatus === "partial_layers" ||
    input.cloudBasisStatus === "total_only" ||
    input.visibilityStatus === "poor" ||
    input.windStatus === "strong"
  ) {
    return "watch";
  }
  return "good";
}

function isHighMountainLike(input: CloudSeaWeatherVariableConsistencyInput): boolean {
  const elevation =
    finiteNumber(input.elevationMeters) ?? finiteNumber(input.terrainContext?.elevationMeters);
  const relief =
    finiteNumber(input.surroundingReliefMeters) ??
    finiteNumber(input.terrainContext?.surroundingReliefMeters);
  const terrainMode = input.terrainMode ?? input.terrainContext?.terrainMode;
  const terrainType = input.terrainType ?? input.terrainContext?.terrainType;
  const terrainClass = input.terrainContext?.terrainClass;

  return (
    (isFiniteNumber(elevation) && elevation >= 800) ||
    (isFiniteNumber(relief) && relief >= 500) ||
    (typeof terrainMode === "string" && highMountainTerrainModes.has(terrainMode)) ||
    (typeof terrainType === "string" && highReliefTerrainTypes.has(terrainType)) ||
    (typeof terrainClass === "string" && highMountainTerrainClasses.has(terrainClass))
  );
}

function dewPointSpreadForSnapshot(snapshot: WeatherVariableSnapshot): number | undefined {
  if (isFiniteNumber(snapshot.dewPointSpreadC)) {
    return snapshot.dewPointSpreadC;
  }
  if (isFiniteNumber(snapshot.temperatureC) && isFiniteNumber(snapshot.dewPointC)) {
    return snapshot.temperatureC - snapshot.dewPointC;
  }
  if (isFiniteNumber(snapshot.displayedTemperatureC) && isFiniteNumber(snapshot.dewPointC)) {
    return snapshot.displayedTemperatureC - snapshot.dewPointC;
  }
  return undefined;
}

function buildUserSummaryZh(
  consistencyLevel: CloudSeaWeatherVariableConsistencyLevel,
  warningsZh: readonly string[],
): string {
  if (warningsZh.length > 0) {
    return warningsZh[0]!;
  }
  if (consistencyLevel === "unknown") {
    return "关键天气变量不足，需结合临近预报复核。";
  }
  return "核心天气变量关系未发现明显矛盾。";
}

function buildProfessionalSummaryZh(input: {
  readonly consistencyLevel: CloudSeaWeatherVariableConsistencyLevel;
  readonly temperatureStatus: CloudSeaTemperatureBasisStatus;
  readonly humidityStatus: CloudSeaHumidityDewPointStatus;
  readonly precipitationStatus: CloudSeaPrecipitationSignalStatus;
  readonly cloudBasisStatus: CloudSeaCloudBasisStatus;
  readonly visibilityStatus: CloudSeaVisibilityStatus;
  readonly windStatus: CloudSeaWindStatus;
  readonly warningsZh: readonly string[];
}): string {
  const statusText = [
    `温度口径 ${input.temperatureStatus}`,
    `水汽 ${input.humidityStatus}`,
    `降水 ${input.precipitationStatus}`,
    `云量 ${input.cloudBasisStatus}`,
    `能见度 ${input.visibilityStatus}`,
    `风 ${input.windStatus}`,
  ].join("；");
  const warningText = input.warningsZh.length > 0 ? `；${input.warningsZh.join("；")}` : "";
  return `变量一致性 ${input.consistencyLevel}：${statusText}${warningText}`;
}

function consistencyCautionLevel(
  consistencyLevel: CloudSeaWeatherVariableConsistencyLevel,
  warnings: readonly CloudSeaWeatherVariableConsistencyWarning[],
): CloudSeaWeatherVariableConsistencyContext["cautionLevel"] {
  if (consistencyLevel === "conflict" || warnings.some((warning) => warning.level === "high")) {
    return "high";
  }
  if (warnings.some((warning) => warning.level === "medium")) {
    return "medium";
  }
  if (warnings.length > 0 || consistencyLevel === "watch") {
    return "low";
  }
  return "none";
}

function combineWarnings(
  warnings: readonly (CloudSeaWeatherVariableConsistencyWarning | null)[],
): readonly CloudSeaWeatherVariableConsistencyWarning[] {
  const byKey = new Map<
    CloudSeaWeatherVariableConsistencyWarningKey,
    CloudSeaWeatherVariableConsistencyWarning
  >();
  for (const warning of warnings) {
    if (!warning) {
      continue;
    }
    const existing = byKey.get(warning.key);
    if (!existing || warningLevelRank(warning.level) > warningLevelRank(existing.level)) {
      byKey.set(warning.key, warning);
      continue;
    }
    if (
      existing.level === warning.level &&
      warning.affectedHoursCount > existing.affectedHoursCount
    ) {
      byKey.set(warning.key, warning);
    }
  }
  return [...byKey.values()];
}

function warningLevelRank(level: CloudSeaWeatherVariableConsistencyWarning["level"]): number {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  return 1;
}

function snapshotHasAnyValue(snapshot: WeatherVariableSnapshot): boolean {
  return [
    snapshot.rawGridTemperatureC,
    snapshot.terrainAdjustedTemperatureC,
    snapshot.displayedTemperatureC,
    snapshot.temperatureC,
    snapshot.humidityPercent,
    snapshot.dewPointC,
    snapshot.dewPointSpreadC,
    snapshot.precipitationAmountMm,
    snapshot.precipitationProbabilityPercent,
    snapshot.visibilityKm,
    snapshot.windSpeedMs,
    snapshot.windGustMs,
    snapshot.cloudTotalPercent,
    snapshot.cloudLowPercent,
    snapshot.cloudMidPercent,
    snapshot.cloudHighPercent,
  ].some(isFiniteNumber);
}

function metersToKilometers(value: number | null | undefined): number | undefined {
  const meters = finiteNumber(value);
  return isFiniteNumber(meters) ? meters / 1000 : undefined;
}

function maxFinite(values: readonly (number | null | undefined)[]): number | undefined {
  const finiteValues = values.filter(isFiniteNumber);
  return finiteValues.length > 0 ? Math.max(...finiteValues) : undefined;
}

function minFinite(values: readonly (number | null | undefined)[]): number | undefined {
  const finiteValues = values.filter(isFiniteNumber);
  return finiteValues.length > 0 ? Math.min(...finiteValues) : undefined;
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function uniqueText(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
