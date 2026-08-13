import type {
  CloudLayerCoverageSummary,
  CloudLayerFieldCoverageSummary,
  CloudLayerProviderCoverageSummary,
  NormalizedHourlyWeather,
  NormalizedWeatherFieldMetadata,
  NormalizedWeatherFieldMetadataMap,
} from "@photo-weather/shared";
import {
  openMeteoForecastCloudLayerDefaultModel,
  openMeteoForecastCloudLayerProviderName,
} from "./open-meteo-forecast-cloud-layer-provider.js";
import {
  openMeteoIconCloudLayerDefaultModel,
  openMeteoIconCloudLayerProviderName,
} from "./open-meteo-icon-cloud-layer-provider.js";
import type { WeatherDataBundle, WeatherProviderCode, WeatherSourceSummary } from "./types.js";

type CloudLayerField = "cloudTotal" | "cloudLow" | "cloudMid" | "cloudHigh";

export type CloudLayerCoverageResolverInput = {
  readonly providerBundles: readonly WeatherDataBundle[];
  readonly baseHourlyRows: readonly NormalizedHourlyWeather[];
  readonly forecastHours: number;
  readonly timezone: string;
};

export type CloudLayerCoverageResolverResult = CloudLayerCoverageSummary & {
  readonly hourlyRows: readonly NormalizedHourlyWeather[];
};

type HourlyCandidate = {
  readonly bundle: WeatherDataBundle;
  readonly hour: NormalizedHourlyWeather;
  readonly sourceId: string;
  readonly modelName: string | undefined;
  readonly providerId: string | undefined;
};

type SelectedField = {
  readonly value: number | null | undefined;
  readonly candidate?: HourlyCandidate;
  readonly basis: NonNullable<NormalizedWeatherFieldMetadata["basis"]>;
};

const coverageFields = [
  "totalCloudCoverage",
  "cloudLowCoverage",
  "cloudMidCoverage",
  "cloudHighCoverage",
  "temperatureCoverage",
  "terrainAdjustedTemperatureCoverage",
  "dewPointCoverage",
  "dewPointSpreadCoverage",
  "humidityCoverage",
  "precipitationAmountCoverage",
  "precipitationProbabilityCoverage",
  "visibilityCoverage",
  "windSpeedCoverage",
  "windDirectionCoverage",
  "weatherCodeCoverage",
] as const satisfies readonly (keyof Omit<CloudLayerFieldCoverageSummary, "totalHours">)[];

const cloudLayerFields = ["cloudTotal", "cloudLow", "cloudMid", "cloudHigh"] as const;

export function resolveCloudLayerHourlyCoverage(
  input: CloudLayerCoverageResolverInput,
): CloudLayerCoverageResolverResult {
  const forecastHours = normalizedForecastHours(input.forecastHours);
  const baseRowsByTime = new Map(input.baseHourlyRows.map((hour) => [hour.time, hour]));
  const times = [
    ...new Set([
      ...input.baseHourlyRows.map((hour) => hour.time),
      ...input.providerBundles.flatMap((bundle) => bundle.hourly.map((hour) => hour.time)),
    ]),
  ]
    .sort()
    .slice(0, forecastHours);

  const fallbackSourcesUsed = new Set<string>();
  let selectedPrimaryCloudLayerSource: string | undefined;

  const hourlyRows = times
    .map((time): NormalizedHourlyWeather | null => {
      const candidates = candidatesAtTime(input.providerBundles, time);
      const base = baseRowsByTime.get(time) ?? candidates[0]?.hour;
      if (!base) {
        return null;
      }
      const primaryCloudCandidate = selectPrimaryCloudLayerCandidate(candidates);
      if (primaryCloudCandidate && !selectedPrimaryCloudLayerSource) {
        selectedPrimaryCloudLayerSource = primaryCloudCandidate.sourceId;
      }

      const next: Record<string, unknown> = { ...base };
      const missingFields = new Set(base.missingFields ?? []);
      const estimatedFields = new Set(base.estimatedFields ?? []);
      const fieldMetadata: NormalizedWeatherFieldMetadataMap = {
        ...(base.fieldMetadata ?? {}),
      };

      for (const field of cloudLayerFields) {
        const existingMetadata = base.fieldMetadata?.[field];
        if (existingMetadata?.providerCode === "multi_model" && hasFiniteNumber(base[field])) {
          next[field] = base[field];
          if (existingMetadata.estimated) {
            estimatedFields.add(field);
            missingFields.add(field);
          } else {
            missingFields.delete(field);
          }
          fieldMetadata[field] = existingMetadata;
          continue;
        }

        const selected = selectCloudLayerField(field, primaryCloudCandidate, candidates);
        applySelectedNumberField({
          next,
          missingFields,
          estimatedFields,
          fieldMetadata,
          field,
          selected,
          base,
          fallbackSourcesUsed,
        });
      }

      return {
        ...(next as NormalizedHourlyWeather),
        missingFields: [...missingFields],
        estimatedFields: estimatedFields.size > 0 ? [...estimatedFields] : undefined,
        fieldMetadata,
      } as NormalizedHourlyWeather;
    })
    .filter((hour): hour is NormalizedHourlyWeather => hour !== null);

  const fieldCoverageSummary = buildFieldCoverageSummary(hourlyRows);
  const providerCoverageSummary = input.providerBundles.map(buildProviderCoverageSummary);
  const missingFieldSummary = buildMissingFieldSummary(fieldCoverageSummary);
  const coverageNotes = buildCoverageNotes(fieldCoverageSummary);

  return {
    hourlyRows,
    totalHours: fieldCoverageSummary.totalHours,
    fieldCoverageSummary,
    providerCoverageSummary,
    selectedPrimaryCloudLayerSource,
    fallbackSourcesUsed: [...fallbackSourcesUsed],
    missingFieldSummary,
    userFacingCoverageNoteZh: coverageNotes.userFacingCoverageNoteZh,
    professionalCoverageNoteZh: coverageNotes.professionalCoverageNoteZh,
  };
}

function candidatesAtTime(
  providerBundles: readonly WeatherDataBundle[],
  time: string,
): readonly HourlyCandidate[] {
  return providerBundles
    .map((bundle): HourlyCandidate | null => {
      const hour = bundle.hourly.find((point) => point.time === time);
      if (!hour) {
        return null;
      }
      const summary = sourceSummaryForBundle(bundle);
      return {
        bundle,
        hour,
        sourceId: sourceIdForBundle(bundle),
        modelName: summary?.modelName,
        providerId: summary?.providerId,
      };
    })
    .filter((candidate): candidate is HourlyCandidate => candidate !== null);
}

function selectPrimaryCloudLayerCandidate(
  candidates: readonly HourlyCandidate[],
): HourlyCandidate | undefined {
  const ordered = [...candidates].sort(
    (left, right) => sourcePriority(left) - sourcePriority(right),
  );
  const iconCandidate = ordered.find(
    (candidate) =>
      candidate.sourceId === openMeteoIconCloudLayerProviderName &&
      (hasFiniteNumber(candidate.hour.cloudTotal) || hasAnyExplicitCloudLayer(candidate.hour)),
  );
  if (iconCandidate) {
    return iconCandidate;
  }

  return (
    ordered.find((candidate) => hasCompleteCloudLayerGroup(candidate.hour)) ??
    ordered.find((candidate) => hasAnyExplicitCloudLayer(candidate.hour)) ??
    ordered.find((candidate) => hasFiniteNumber(candidate.hour.cloudTotal))
  );
}

function selectCloudLayerField(
  field: CloudLayerField,
  primary: HourlyCandidate | undefined,
  candidates: readonly HourlyCandidate[],
): SelectedField {
  const primaryValue = primary ? finiteOrNull(primary.hour[field]) : null;
  if (primaryValue !== null) {
    return {
      value: primaryValue,
      candidate: primary,
      basis: field === "cloudTotal" ? "total_cloud" : "explicit_layer",
    };
  }

  const fallback = [...candidates]
    .filter((candidate) => candidate !== primary)
    .sort((left, right) => sourcePriority(left) - sourcePriority(right))
    .find((candidate) => finiteOrNull(candidate.hour[field]) !== null);

  if (fallback) {
    return {
      value: finiteOrNull(fallback.hour[field]),
      candidate: fallback,
      basis: "fallback_same_field",
    };
  }

  return {
    value: null,
    candidate: primary,
    basis: "missing",
  };
}

function applySelectedNumberField(input: {
  readonly next: Record<string, unknown>;
  readonly missingFields: Set<string>;
  readonly estimatedFields: Set<string>;
  readonly fieldMetadata: NormalizedWeatherFieldMetadataMap;
  readonly field: CloudLayerField;
  readonly selected: SelectedField;
  readonly base: NormalizedHourlyWeather;
  readonly fallbackSourcesUsed: Set<string>;
}): void {
  const { selected, field } = input;
  input.next[field] = selected.value ?? null;

  const estimated = selected.candidate?.hour.estimatedFields?.includes(field) ?? false;
  if (estimated) {
    input.estimatedFields.add(field);
  }

  if (selected.value === null || selected.value === undefined || estimated) {
    input.missingFields.add(field);
  } else {
    input.missingFields.delete(field);
  }

  if (selected.basis === "fallback_same_field" && selected.candidate) {
    input.fallbackSourcesUsed.add(selected.candidate.sourceId);
  }

  const existingMetadata = input.base.fieldMetadata?.[field];
  const candidateMetadata = selected.candidate?.hour.fieldMetadata?.[field];
  const preservedMetadata = existingMetadata ?? candidateMetadata;
  input.fieldMetadata[field] = {
    ...preservedMetadata,
    value: selected.value ?? null,
    providerCode:
      preservedMetadata?.providerCode ??
      selected.candidate?.bundle.providerCode ??
      input.base.providerCode,
    providerLabelZh:
      preservedMetadata?.providerLabelZh ??
      selected.candidate?.bundle.providerLabelZh ??
      input.base.providerLabelZh,
    sourceId: preservedMetadata?.sourceId ?? selected.candidate?.sourceId,
    modelName: preservedMetadata?.modelName ?? selected.candidate?.modelName,
    basis:
      selected.basis === "fallback_same_field"
        ? selected.basis
        : (preservedMetadata?.basis ?? selected.basis),
    estimated,
    missingReason:
      selected.value === null || selected.value === undefined || estimated
        ? "provider_field_missing"
        : undefined,
    providerElevationMeters: selected.candidate?.hour.providerElevationMeters,
    selectedSpotElevationMeters:
      selected.candidate?.hour.selectedSpotElevationMeters ??
      selected.candidate?.bundle.terrainMetadata?.selectedSpotElevationMeters,
    elevationDifferenceMeters:
      selected.candidate?.hour.elevationDifferenceMeters ??
      selected.candidate?.bundle.terrainMetadata?.elevationDifferenceMeters,
  };
}

function buildFieldCoverageSummary(
  hourlyRows: readonly NormalizedHourlyWeather[],
): CloudLayerFieldCoverageSummary {
  return {
    totalHours: hourlyRows.length,
    totalCloudCoverage: countFinite(hourlyRows, (hour) => hour.cloudTotal),
    cloudLowCoverage: countFinite(hourlyRows, (hour) => hour.cloudLow),
    cloudMidCoverage: countFinite(hourlyRows, (hour) => hour.cloudMid),
    cloudHighCoverage: countFinite(hourlyRows, (hour) => hour.cloudHigh),
    temperatureCoverage: countFinite(hourlyRows, (hour) => hour.temperature),
    terrainAdjustedTemperatureCoverage: countFinite(hourlyRows, (hour) =>
      terrainAdjustedTemperature(hour),
    ),
    dewPointCoverage: countFinite(hourlyRows, (hour) => hour.dewPoint),
    dewPointSpreadCoverage: countFinite(hourlyRows, (hour) => hour.dewPointSpread),
    humidityCoverage: countFinite(hourlyRows, (hour) => hour.humidity),
    precipitationAmountCoverage: countFinite(
      hourlyRows,
      (hour) => hour.precipitationAmountMm ?? hour.precipitation,
    ),
    precipitationProbabilityCoverage: countFinite(
      hourlyRows,
      (hour) => hour.precipitationProbabilityPercent ?? hour.precipitationProbability,
    ),
    visibilityCoverage: countFinite(hourlyRows, (hour) => hour.rawVisibilityKm ?? hour.visibility),
    windSpeedCoverage: countFinite(hourlyRows, (hour) => hour.windSpeed),
    windDirectionCoverage: countFinite(hourlyRows, (hour) => hour.windDirection),
    weatherCodeCoverage: hourlyRows.filter(
      (hour) => Boolean(hour.weatherCode) || Boolean(hour.weatherTextZh),
    ).length,
  };
}

function buildProviderCoverageSummary(
  bundle: WeatherDataBundle,
): CloudLayerProviderCoverageSummary {
  const summary = sourceSummaryForBundle(bundle);
  return {
    providerId: sourceIdForBundle(bundle),
    providerCode: bundle.providerCode,
    modelName: summary?.modelName,
    returnedHours: bundle.hourly.length,
    cloudTotalHours: countFinite(bundle.hourly, (hour) => hour.cloudTotal),
    cloudLowHours: countFinite(bundle.hourly, (hour) => hour.cloudLow),
    cloudMidHours: countFinite(bundle.hourly, (hour) => hour.cloudMid),
    cloudHighHours: countFinite(bundle.hourly, (hour) => hour.cloudHigh),
    dewPointHours: countFinite(bundle.hourly, (hour) => hour.dewPoint),
    visibilityHours: countFinite(bundle.hourly, (hour) => hour.rawVisibilityKm ?? hour.visibility),
    precipitationProbabilityHours: countFinite(
      bundle.hourly,
      (hour) => hour.precipitationProbabilityPercent ?? hour.precipitationProbability,
    ),
    error: summary?.success === false ? summary.messageZh : undefined,
  };
}

function buildMissingFieldSummary(summary: CloudLayerFieldCoverageSummary): readonly string[] {
  return coverageFields
    .filter((field) => summary[field] < summary.totalHours)
    .map((field) => `${field}:${summary[field]}/${summary.totalHours}`);
}

function buildCoverageNotes(
  summary: CloudLayerFieldCoverageSummary,
): Pick<CloudLayerCoverageSummary, "userFacingCoverageNoteZh" | "professionalCoverageNoteZh"> {
  const layerMinimum = Math.min(
    summary.cloudLowCoverage,
    summary.cloudMidCoverage,
    summary.cloudHighCoverage,
  );
  const totalHours = Math.max(1, summary.totalHours);
  const layerRatio = layerMinimum / totalHours;
  const coverageText = `覆盖率：低云 ${summary.cloudLowCoverage}/${summary.totalHours}，中云 ${summary.cloudMidCoverage}/${summary.totalHours}，高云 ${summary.cloudHighCoverage}/${summary.totalHours}`;

  if (layerRatio >= 0.9) {
    return {
      userFacingCoverageNoteZh: `分层云量覆盖较完整，${coverageText}。`,
      professionalCoverageNoteZh: `分层云量覆盖较完整，${coverageText}；可用于复核云海、白墙和开口风险。缺失值仍以“-”显示，不使用总云量回填。`,
    };
  }

  if (layerRatio < 0.7) {
    return {
      userFacingCoverageNoteZh: `分层云量覆盖不足，${coverageText}；当前仅可作为趋势参考。`,
      professionalCoverageNoteZh: `分层云量覆盖不足，${coverageText}；当前仅可作为趋势参考，建议结合临近预报复核。缺失值以“-”显示，不使用总云量回填。`,
    };
  }

  return {
    userFacingCoverageNoteZh: `分层云量部分补全，${coverageText}。`,
    professionalCoverageNoteZh: `分层云量部分补全，${coverageText}；缺失值以“-”显示，不使用总云量回填，后续仍需临近复核。`,
  };
}

function sourceSummaryForBundle(bundle: WeatherDataBundle): WeatherSourceSummary | undefined {
  return (
    bundle.sourceSummaries?.find((summary) => summary.providerCode === bundle.providerCode) ??
    bundle.sourceSummaries?.[0]
  );
}

function sourceIdForBundle(bundle: WeatherDataBundle): string {
  const summary = sourceSummaryForBundle(bundle);
  if (summary?.providerId) {
    return summary.providerId;
  }
  if (summary?.modelFamily === "icon") {
    return openMeteoIconCloudLayerProviderName;
  }
  if (summary?.modelFamily === "best_match") {
    return openMeteoForecastCloudLayerProviderName;
  }
  if (
    bundle.providerCode === "open_meteo" &&
    summary?.modelName === openMeteoIconCloudLayerDefaultModel
  ) {
    return openMeteoIconCloudLayerProviderName;
  }
  if (
    bundle.providerCode === "open_meteo" &&
    summary?.modelName === openMeteoForecastCloudLayerDefaultModel
  ) {
    return openMeteoForecastCloudLayerProviderName;
  }
  return summary?.modelName ? `${bundle.providerCode}:${summary.modelName}` : bundle.providerCode;
}

function sourcePriority(candidate: HourlyCandidate): number {
  if (candidate.providerId === openMeteoIconCloudLayerProviderName) {
    return 0;
  }
  if (isOpenMeteoForecastProviderId(candidate.providerId)) {
    return 1;
  }
  if (
    candidate.bundle.providerCode === "open_meteo" &&
    (candidate.modelName === openMeteoIconCloudLayerDefaultModel ||
      candidate.sourceId === openMeteoIconCloudLayerProviderName)
  ) {
    return 0;
  }
  if (
    candidate.bundle.providerCode === "open_meteo" &&
    (candidate.modelName === openMeteoForecastCloudLayerDefaultModel ||
      candidate.sourceId === openMeteoForecastCloudLayerProviderName)
  ) {
    return 1;
  }
  if (candidate.bundle.providerCode === "open_meteo") {
    return 1;
  }
  const order: readonly WeatherProviderCode[] = ["meteoblue", "qweather", "mock"];
  const index = order.indexOf(candidate.bundle.providerCode);
  return index === -1 ? order.length + 1 : index + 2;
}

function isOpenMeteoForecastProviderId(providerId: string | undefined): boolean {
  return (
    providerId === openMeteoForecastCloudLayerProviderName ||
    providerId?.startsWith(`${openMeteoForecastCloudLayerProviderName}:`) === true
  );
}

function hasCompleteCloudLayerGroup(hour: NormalizedHourlyWeather): boolean {
  return (
    hasFiniteNumber(hour.cloudTotal) &&
    hasFiniteNumber(hour.cloudLow) &&
    hasFiniteNumber(hour.cloudMid) &&
    hasFiniteNumber(hour.cloudHigh)
  );
}

function hasAnyExplicitCloudLayer(hour: NormalizedHourlyWeather): boolean {
  return (
    hasFiniteNumber(hour.cloudLow) ||
    hasFiniteNumber(hour.cloudMid) ||
    hasFiniteNumber(hour.cloudHigh)
  );
}

function terrainAdjustedTemperature(hour: NormalizedHourlyWeather): number | null | undefined {
  return (
    hour.temperatureAdjustment?.terrainAdjustedTemperatureC ??
    hour.elevationAdjustedTemperature ??
    undefined
  );
}

function countFinite<T>(rows: readonly T[], select: (row: T) => number | null | undefined): number {
  return rows.filter((row) => hasFiniteNumber(select(row))).length;
}

function finiteOrNull(value: unknown): number | null {
  return hasFiniteNumber(value) ? value : null;
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizedForecastHours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 72;
  }
  return Math.max(1, Math.round(value));
}

export function annotateSourceSummaryWithCloudLayerCoverage(
  summary: WeatherSourceSummary,
  providerCoverage: CloudLayerProviderCoverageSummary | undefined,
): WeatherSourceSummary {
  if (!providerCoverage) {
    return summary;
  }

  return {
    ...summary,
    providerId: summary.providerId ?? providerCoverage.providerId,
    returnedHours: summary.returnedHours ?? providerCoverage.returnedHours,
    cloudTotalHours: providerCoverage.cloudTotalHours,
    cloudLowHours: providerCoverage.cloudLowHours,
    cloudMidHours: providerCoverage.cloudMidHours,
    cloudHighHours: providerCoverage.cloudHighHours,
    dewPointHours: providerCoverage.dewPointHours,
    visibilityHours: providerCoverage.visibilityHours,
    precipitationProbabilityHours: providerCoverage.precipitationProbabilityHours,
  };
}
