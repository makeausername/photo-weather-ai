import {
  DEFAULT_MOUNTAIN_LAPSE_RATE_C_PER_KM,
  isHighMountainTemperatureSensitiveLocation,
  type TerrainMode,
  type TerrainTemperatureBasisContext,
  type TerrainType,
} from "@photo-weather/shared";

export type CloudSeaDisplayTemperatureBasis =
  | "terrain_adjusted"
  | "terrain_adjusted_lapse_estimate"
  | "provider_point"
  | "raw_grid_with_warning"
  | "unknown";

export type CloudSeaDisplayTemperatureContext = {
  readonly displayTemperatureC: number | null;
  readonly displayTemperatureRangeC: readonly [number, number] | null;
  readonly bodyFeelTemperatureC: number | null;
  readonly bodyFeelRangeC: readonly [number, number] | null;
  readonly basis: CloudSeaDisplayTemperatureBasis;
  readonly rawGridTemperatureC: number | null;
  readonly terrainAdjustedTemperatureC: number | null;
  readonly modelElevationMeters: number | null;
  readonly cameraElevationMeters: number | null;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly isUserFacingTemperatureReliable: boolean;
  readonly basisLabelZh: string;
  readonly userTemperatureTitleZh: string;
  readonly userTemperatureSummaryZh: string;
  readonly professionalTemperatureSummaryZh: string;
  readonly clothingAdviceZh: string;
  readonly equipmentAdviceZh: string;
  readonly warningZh: string;
};

export type CloudSeaDisplayTemperatureContextInput = {
  readonly temperatureBasisContext?: TerrainTemperatureBasisContext | null;
  readonly rawGridTemperatureC?: number | null;
  readonly terrainAdjustedTemperatureC?: number | null;
  readonly providerTemperatureC?: number | null;
  readonly displayedTemperatureC?: number | null;
  readonly displayTemperatureRangeC?: readonly [number | null | undefined, number | null | undefined] | null;
  readonly bodyFeelTemperatureC?: number | null;
  readonly bodyFeelRangeC?: readonly [number | null | undefined, number | null | undefined] | null;
  readonly cameraElevationMeters?: number | null;
  readonly modelElevationMeters?: number | null;
  readonly surroundingReliefMeters?: number | null;
  readonly terrainType?: TerrainType | string | null;
  readonly terrainMode?: TerrainMode | string | null;
  readonly terrainClass?: string | null;
  readonly isClassicCloudSeaEligible?: boolean | null;
  readonly windSpeedMs?: number | null;
  readonly windGustMs?: number | null;
  readonly humidityPercent?: number | null;
  readonly forecastHour?: number | null;
  readonly sourceTemperatureBasis?: string | null;
  readonly lapseRateCPerKm?: number | null;
};

const meaningfulElevationDifferenceMeters = 150;

export function buildCloudSeaDisplayTemperatureContext(
  input: CloudSeaDisplayTemperatureContextInput,
): CloudSeaDisplayTemperatureContext {
  const source = input.temperatureBasisContext;
  const rawGridTemperatureC = finiteNumber(input.rawGridTemperatureC ?? source?.rawGridTemperatureC);
  const sourceBasis = input.sourceTemperatureBasis ?? source?.temperatureBasis;
  const sourceTerrainAdjustedTemperatureC = finiteNumber(
    input.terrainAdjustedTemperatureC ?? source?.terrainAdjustedTemperatureC,
  );
  const sourceIsLapseEstimate = sourceBasis === "terrain_adjusted_lapse_estimate";
  const directTerrainAdjustedTemperatureC =
    sourceTerrainAdjustedTemperatureC !== undefined && !sourceIsLapseEstimate
      ? sourceTerrainAdjustedTemperatureC
      : undefined;
  const providerTemperatureC = finiteNumber(input.providerTemperatureC);
  const displayedTemperatureC = finiteNumber(input.displayedTemperatureC ?? source?.displayTemperatureC);
  const cameraElevationMeters = finiteNumber(input.cameraElevationMeters);
  const modelElevationMeters = finiteNumber(input.modelElevationMeters);
  const lapseRateCPerKm =
    finitePositiveNumber(input.lapseRateCPerKm ?? source?.lapseRateCPerKm) ??
    DEFAULT_MOUNTAIN_LAPSE_RATE_C_PER_KM;
  const isHighMountainTemperatureSensitive =
    source?.isHighMountainTemperatureSensitive ??
    isHighMountainTemperatureSensitiveLocation({
      elevationMeters: cameraElevationMeters,
      surroundingReliefMeters: input.surroundingReliefMeters,
      terrainType: input.terrainType,
      terrainMode: input.terrainMode,
      terrainClass: input.terrainClass,
      isClassicCloudSeaEligible: input.isClassicCloudSeaEligible,
    });
  const deterministicLapseEstimate =
    directTerrainAdjustedTemperatureC === undefined &&
    rawGridTemperatureC !== undefined &&
    cameraElevationMeters !== undefined &&
    modelElevationMeters !== undefined &&
    cameraElevationMeters > modelElevationMeters &&
    cameraElevationMeters - modelElevationMeters >= meaningfulElevationDifferenceMeters
      ? round1(
          rawGridTemperatureC -
            ((cameraElevationMeters - modelElevationMeters) / 1000) * lapseRateCPerKm,
        )
      : undefined;
  const lapseTerrainAdjustedTemperatureC =
    sourceIsLapseEstimate && sourceTerrainAdjustedTemperatureC !== undefined
      ? sourceTerrainAdjustedTemperatureC
      : deterministicLapseEstimate;
  const terrainAdjustedTemperatureC =
    directTerrainAdjustedTemperatureC ?? lapseTerrainAdjustedTemperatureC ?? null;
  const basis = displayBasis({
    isHighMountainTemperatureSensitive,
    directTerrainAdjustedTemperatureC,
    lapseTerrainAdjustedTemperatureC,
    rawGridTemperatureC,
    providerTemperatureC,
    displayedTemperatureC,
  });
  const displayTemperatureC = selectDisplayTemperature({
    basis,
    terrainAdjustedTemperatureC,
    rawGridTemperatureC,
    providerTemperatureC,
    displayedTemperatureC,
  });
  const inputDisplayTemperatureRangeC = normalizedRange(input.displayTemperatureRangeC);
  const displayTemperatureRangeC =
    basis === "terrain_adjusted" || basis === "terrain_adjusted_lapse_estimate"
      ? displayTemperatureC === null
        ? null
        : ([displayTemperatureC, displayTemperatureC] as const)
      : inputDisplayTemperatureRangeC ??
        (displayTemperatureC === null ? null : ([displayTemperatureC, displayTemperatureC] as const));
  const bodyFeelTemperatureC = selectBodyFeelTemperature({
    inputBodyFeelTemperatureC: input.bodyFeelTemperatureC,
    sourceBodyFeelTemperatureC: source?.bodyFeelTemperatureC,
    basis,
    displayTemperatureC,
    windSpeedMs: input.windSpeedMs,
    windGustMs: input.windGustMs,
    humidityPercent: input.humidityPercent,
    forecastHour: input.forecastHour,
  });
  const inputBodyFeelRangeC = normalizedRange(input.bodyFeelRangeC);
  const bodyFeelRangeC =
    basis === "terrain_adjusted" || basis === "terrain_adjusted_lapse_estimate"
      ? bodyFeelTemperatureC === null
        ? null
        : ([bodyFeelTemperatureC, bodyFeelTemperatureC] as const)
      : inputBodyFeelRangeC ??
        (bodyFeelTemperatureC === null ? null : ([bodyFeelTemperatureC, bodyFeelTemperatureC] as const));
  const warningZh = warningText({
    basis,
    isHighMountainTemperatureSensitive,
    rawGridTemperatureC,
    terrainAdjustedTemperatureC,
    displayTemperatureC,
  });
  const basisLabelZh = basisLabel(basis);
  const bodyFeelLabelZh = isHighMountainTemperatureSensitive ? "山地体感" : "体感温度";
  const isUserFacingTemperatureReliable =
    basis === "terrain_adjusted" ||
    basis === "terrain_adjusted_lapse_estimate" ||
    (!isHighMountainTemperatureSensitive && basis === "provider_point");

  return {
    displayTemperatureC,
    displayTemperatureRangeC,
    bodyFeelTemperatureC,
    bodyFeelRangeC,
    basis,
    rawGridTemperatureC: rawGridTemperatureC ?? null,
    terrainAdjustedTemperatureC,
    modelElevationMeters: modelElevationMeters ?? null,
    cameraElevationMeters: cameraElevationMeters ?? null,
    isHighMountainTemperatureSensitive,
    isUserFacingTemperatureReliable,
    basisLabelZh,
    userTemperatureTitleZh:
      basis === "raw_grid_with_warning" ? "原始格点温度，未做海拔订正" : basisLabelZh,
    userTemperatureSummaryZh: userTemperatureSummary({
      basisLabelZh,
      bodyFeelLabelZh,
      displayTemperatureC,
      bodyFeelTemperatureC,
      warningZh,
    }),
    professionalTemperatureSummaryZh: professionalSummary({
      basis,
      displayTemperatureC,
      bodyFeelTemperatureC,
      rawGridTemperatureC,
      terrainAdjustedTemperatureC,
      cameraElevationMeters,
      modelElevationMeters,
    }),
    clothingAdviceZh: clothingAdvice({
      basis,
      isHighMountainTemperatureSensitive,
      displayTemperatureC,
      bodyFeelTemperatureC,
    }),
    equipmentAdviceZh: equipmentAdvice(basis, isHighMountainTemperatureSensitive),
    warningZh,
  };
}

function displayBasis(input: {
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly directTerrainAdjustedTemperatureC?: number;
  readonly lapseTerrainAdjustedTemperatureC?: number;
  readonly rawGridTemperatureC?: number;
  readonly providerTemperatureC?: number;
  readonly displayedTemperatureC?: number;
}): CloudSeaDisplayTemperatureBasis {
  if (input.directTerrainAdjustedTemperatureC !== undefined) {
    return "terrain_adjusted";
  }
  if (input.lapseTerrainAdjustedTemperatureC !== undefined) {
    return "terrain_adjusted_lapse_estimate";
  }
  if (input.rawGridTemperatureC !== undefined && input.isHighMountainTemperatureSensitive) {
    return "raw_grid_with_warning";
  }
  if (
    input.providerTemperatureC !== undefined ||
    input.displayedTemperatureC !== undefined ||
    input.rawGridTemperatureC !== undefined
  ) {
    return "provider_point";
  }
  return "unknown";
}

function selectDisplayTemperature(input: {
  readonly basis: CloudSeaDisplayTemperatureBasis;
  readonly terrainAdjustedTemperatureC: number | null;
  readonly rawGridTemperatureC?: number;
  readonly providerTemperatureC?: number;
  readonly displayedTemperatureC?: number;
}): number | null {
  if (input.basis === "terrain_adjusted" || input.basis === "terrain_adjusted_lapse_estimate") {
    return input.terrainAdjustedTemperatureC;
  }
  if (input.basis === "raw_grid_with_warning") {
    return input.rawGridTemperatureC ?? null;
  }
  return input.displayedTemperatureC ?? input.providerTemperatureC ?? input.rawGridTemperatureC ?? null;
}

function selectBodyFeelTemperature(input: {
  readonly inputBodyFeelTemperatureC?: number | null;
  readonly sourceBodyFeelTemperatureC?: number | null;
  readonly basis: CloudSeaDisplayTemperatureBasis;
  readonly displayTemperatureC: number | null;
  readonly windSpeedMs?: number | null;
  readonly windGustMs?: number | null;
  readonly humidityPercent?: number | null;
  readonly forecastHour?: number | null;
}): number | null {
  if (input.basis === "provider_point") {
    const providerFeel = finiteNumber(input.inputBodyFeelTemperatureC);
    if (providerFeel !== undefined) {
      return providerFeel;
    }
  }
  if (
    input.basis === "terrain_adjusted" ||
    input.basis === "terrain_adjusted_lapse_estimate"
  ) {
    const sourceFeel = finiteNumber(input.sourceBodyFeelTemperatureC);
    if (sourceFeel !== undefined) {
      return sourceFeel;
    }
  }
  if (input.displayTemperatureC === null) {
    return null;
  }
  if (input.basis === "raw_grid_with_warning") {
    return null;
  }
  const windSpeed = finiteNumber(input.windSpeedMs) ?? 0;
  const windGust = finiteNumber(input.windGustMs) ?? windSpeed;
  const humidity = finiteNumber(input.humidityPercent) ?? 0;
  const hour = finiteNumber(input.forecastHour);
  const windCooling = Math.min(5, Math.max(0, windSpeed - 4) * 0.55);
  const gustCooling = windGust >= 12 ? 1.5 : windGust >= 9 ? 0.8 : 0;
  const humidityCooling = humidity >= 85 ? 0.6 : 0;
  const waitingCooling = hour !== undefined && (hour <= 7 || hour >= 18) ? 0.8 : 0;
  return round1(input.displayTemperatureC - windCooling - gustCooling - humidityCooling - waitingCooling);
}

function basisLabel(basis: CloudSeaDisplayTemperatureBasis): string {
  if (basis === "terrain_adjusted" || basis === "terrain_adjusted_lapse_estimate") {
    return "机位估算温度";
  }
  if (basis === "raw_grid_with_warning") {
    return "原始格点温度，未做海拔订正";
  }
  if (basis === "provider_point") {
    return "机位估算温度";
  }
  return "高山体感需复核";
}

function userTemperatureSummary(input: {
  readonly basisLabelZh: string;
  readonly bodyFeelLabelZh: string;
  readonly displayTemperatureC: number | null;
  readonly bodyFeelTemperatureC: number | null;
  readonly warningZh: string;
}): string {
  const temperature = `${input.basisLabelZh} ${formatTemperature(input.displayTemperatureC)}`;
  const feel =
    input.bodyFeelTemperatureC === null
      ? "高山体感需复核"
      : `${input.bodyFeelLabelZh} ${formatTemperature(input.bodyFeelTemperatureC)}`;
  return input.warningZh ? `${temperature} / ${feel}。${input.warningZh}` : `${temperature} / ${feel}`;
}

function professionalSummary(input: {
  readonly basis: CloudSeaDisplayTemperatureBasis;
  readonly displayTemperatureC: number | null;
  readonly bodyFeelTemperatureC: number | null;
  readonly rawGridTemperatureC?: number;
  readonly terrainAdjustedTemperatureC: number | null;
  readonly cameraElevationMeters?: number;
  readonly modelElevationMeters?: number;
}): string {
  const values = [
    `显示 ${formatTemperature(input.displayTemperatureC)}`,
    `体感 ${formatTemperature(input.bodyFeelTemperatureC)}`,
    `原始格点 ${formatTemperature(input.rawGridTemperatureC)}`,
    `机位估算 ${formatTemperature(input.terrainAdjustedTemperatureC)}`,
    `机位海拔 ${formatMeters(input.cameraElevationMeters)}`,
    `模型海拔 ${formatMeters(input.modelElevationMeters)}`,
  ];
  return `${basisLabel(input.basis)}；${values.join("，")}。`;
}

function clothingAdvice(input: {
  readonly basis: CloudSeaDisplayTemperatureBasis;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly displayTemperatureC: number | null;
  readonly bodyFeelTemperatureC: number | null;
}): string {
  if (input.basis === "raw_grid_with_warning") {
    return "高山体感可能明显低于格点预报，建议多带一层保暖，并按防风、防潮和轻保暖准备。";
  }
  if (input.isHighMountainTemperatureSensitive) {
    const reference = input.bodyFeelTemperatureC ?? input.displayTemperatureC;
    const temperatureText = reference === null ? "" : `，参考体感 ${formatTemperature(reference)}`;
    return `高山体感可能低于城市/低海拔预报，按机位体感准备防风、防潮、轻保暖${temperatureText}；清晨或日落后长时间等待时多带一层。`;
  }
  return "按近时段体感准备，保留防潮、防滑和镜头清洁用品。";
}

function equipmentAdvice(
  basis: CloudSeaDisplayTemperatureBasis,
  isHighMountainTemperatureSensitive: boolean,
): string {
  if (basis === "raw_grid_with_warning" || isHighMountainTemperatureSensitive) {
    return "防风 / 防潮 / 轻保暖";
  }
  return "防潮 / 防滑 / 镜头布";
}

function warningText(input: {
  readonly basis: CloudSeaDisplayTemperatureBasis;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly rawGridTemperatureC?: number;
  readonly terrainAdjustedTemperatureC: number | null;
  readonly displayTemperatureC: number | null;
}): string {
  if (input.basis === "raw_grid_with_warning") {
    return "原始格点温度，仅作参考；高山机位体感可能更冷。";
  }
  if (
    input.isHighMountainTemperatureSensitive &&
    input.rawGridTemperatureC !== undefined &&
    input.terrainAdjustedTemperatureC !== null &&
    Math.abs(input.rawGridTemperatureC - input.terrainAdjustedTemperatureC) >= 5
  ) {
    return "高山机位与周边格点温度差异较大，穿衣和等待以机位估算温度为准。";
  }
  if (input.basis === "unknown") {
    return "高山体感需复核，出行前请确认临近预报。";
  }
  return "";
}

function normalizedRange(
  range: readonly [number | null | undefined, number | null | undefined] | null | undefined,
): readonly [number, number] | null {
  const low = finiteNumber(range?.[0]);
  const high = finiteNumber(range?.[1]);
  if (low === undefined || high === undefined) {
    return null;
  }
  return low <= high ? [low, high] : [high, low];
}

function formatTemperature(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°C` : "待复核";
}

function formatMeters(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)} m` : "待复核";
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finitePositiveNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
