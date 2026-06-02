import type { TerrainMode, TerrainType } from "./types.js";

export const DEFAULT_MOUNTAIN_LAPSE_RATE_C_PER_KM = 6.5;

export type TerrainTemperatureBasis =
  | "terrain_adjusted"
  | "terrain_adjusted_lapse_estimate"
  | "raw_grid"
  | "provider_point"
  | "mixed"
  | "unknown";

export type TerrainTemperatureDifferenceLevel =
  | "none"
  | "minor"
  | "medium"
  | "large"
  | "unknown";

export type TerrainTemperatureConfidenceLevel = "high" | "medium" | "low" | "unknown";

export type TerrainTemperatureBasisContextInput = {
  readonly rawGridTemperatureC?: number | null;
  readonly terrainAdjustedTemperatureC?: number | null;
  readonly providerTemperatureC?: number | null;
  readonly displayedTemperatureC?: number | null;
  readonly elevationMeters?: number | null;
  readonly modelElevationMeters?: number | null;
  readonly surroundingReliefMeters?: number | null;
  readonly terrainType?: TerrainType | string | null;
  readonly terrainMode?: TerrainMode | string | null;
  readonly terrainClass?: string | null;
  readonly terrainConfidence?: string | null;
  readonly isClassicCloudSeaEligible?: boolean | null;
  readonly windSpeedMs?: number | null;
  readonly windGustMs?: number | null;
  readonly humidityPercent?: number | null;
  readonly timeOfDay?: string | null;
  readonly forecastHour?: number | null;
  readonly timezone?: string | null;
  readonly lapseRateCPerKm?: number | null;
};

export type TerrainTemperatureBasisContext = {
  readonly temperatureBasis: TerrainTemperatureBasis;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly shouldPreferTerrainAdjustedTemperature: boolean;
  readonly shouldShowTemperatureBasisNote: boolean;
  readonly displayTemperatureC: number | null;
  readonly displayTemperatureRangeC: readonly [number, number] | null;
  readonly bodyFeelTemperatureC: number | null;
  readonly rawGridTemperatureC: number | null;
  readonly terrainAdjustedTemperatureC: number | null;
  readonly providerTemperatureC: number | null;
  readonly temperatureDifferenceC: number | null;
  readonly differenceLevel: TerrainTemperatureDifferenceLevel;
  readonly confidenceLevel: TerrainTemperatureConfidenceLevel;
  readonly userNoteZh: string;
  readonly professionalNoteZh: string;
  readonly clothingAdviceModifierZh: string;
  readonly actionAdviceModifierZh: string;
  readonly lapseRateCPerKm: number;
};

const highMountainTerrainTypes = new Set([
  "high_mountain",
  "summit",
  "ridge",
  "mountain_platform",
]);
const highMountainTerrainModes = new Set(["high_mountain", "mountain"]);
const highMountainTerrainClasses = new Set(["high_mountain", "mountain"]);

export function buildTerrainTemperatureBasisContext(
  input: TerrainTemperatureBasisContextInput = {},
): TerrainTemperatureBasisContext {
  const rawGridTemperatureC = finiteNumber(input.rawGridTemperatureC);
  const providerTemperatureC = finiteNumber(input.providerTemperatureC);
  const inputDisplayedTemperatureC = finiteNumber(input.displayedTemperatureC);
  const directTerrainAdjustedTemperatureC = finiteNumber(input.terrainAdjustedTemperatureC);
  const elevationMeters = finiteNumber(input.elevationMeters);
  const modelElevationMeters = finiteNumber(input.modelElevationMeters);
  const lapseRateCPerKm =
    finitePositiveNumber(input.lapseRateCPerKm) ?? DEFAULT_MOUNTAIN_LAPSE_RATE_C_PER_KM;
  const isHighMountainTemperatureSensitive = isHighMountainTemperatureSensitiveLocation(input);
  const lapseEstimate =
    directTerrainAdjustedTemperatureC === undefined &&
    rawGridTemperatureC !== undefined &&
    elevationMeters !== undefined &&
    modelElevationMeters !== undefined
      ? round1(rawGridTemperatureC - ((elevationMeters - modelElevationMeters) / 1000) * lapseRateCPerKm)
      : undefined;
  const selectedTerrainAdjustedTemperatureC =
    directTerrainAdjustedTemperatureC ?? (isHighMountainTemperatureSensitive ? lapseEstimate : undefined);
  const selectedBasis = selectTemperatureBasis({
    isHighMountainTemperatureSensitive,
    directTerrainAdjustedTemperatureC,
    lapseEstimate,
    selectedTerrainAdjustedTemperatureC,
    rawGridTemperatureC,
    providerTemperatureC,
    inputDisplayedTemperatureC,
  });
  const displayTemperatureC = selectDisplayTemperature({
    basis: selectedBasis,
    isHighMountainTemperatureSensitive,
    selectedTerrainAdjustedTemperatureC,
    inputDisplayedTemperatureC,
    providerTemperatureC,
    rawGridTemperatureC,
  });
  const terrainAdjustedTemperatureC = selectedTerrainAdjustedTemperatureC ?? null;
  const temperatureDifferenceC =
    rawGridTemperatureC !== undefined && selectedTerrainAdjustedTemperatureC !== undefined
      ? round1(Math.abs(rawGridTemperatureC - selectedTerrainAdjustedTemperatureC))
      : null;
  const differenceLevel = differenceLevelForTemperature(temperatureDifferenceC);
  const confidenceLevel = confidenceLevelForTemperature({
    basis: selectedBasis,
    isHighMountainTemperatureSensitive,
    hasDirectTerrainAdjustedTemperature: directTerrainAdjustedTemperatureC !== undefined,
    hasLapseEstimate: lapseEstimate !== undefined,
    hasRawGridTemperature: rawGridTemperatureC !== undefined,
    terrainConfidence: input.terrainConfidence,
    displayTemperatureC,
  });
  const bodyFeelTemperatureC =
    displayTemperatureC === null
      ? null
      : round1(displayTemperatureC - bodyFeelCoolingC(input, isHighMountainTemperatureSensitive));
  const shouldPreferTerrainAdjustedTemperature =
    isHighMountainTemperatureSensitive && selectedTerrainAdjustedTemperatureC !== undefined;
  const shouldShowTemperatureBasisNote =
    isHighMountainTemperatureSensitive &&
    (selectedBasis === "raw_grid" ||
      selectedBasis === "provider_point" ||
      selectedBasis === "unknown" ||
      selectedBasis === "mixed" ||
      selectedBasis === "terrain_adjusted_lapse_estimate" ||
      (temperatureDifferenceC !== null && temperatureDifferenceC >= 3) ||
      confidenceLevel === "low" ||
      confidenceLevel === "unknown");
  const notes = buildTemperatureBasisNotes({
    basis: selectedBasis,
    isHighMountainTemperatureSensitive,
    differenceLevel,
    temperatureDifferenceC,
    confidenceLevel,
  });

  return {
    temperatureBasis: selectedBasis,
    isHighMountainTemperatureSensitive,
    shouldPreferTerrainAdjustedTemperature,
    shouldShowTemperatureBasisNote,
    displayTemperatureC,
    displayTemperatureRangeC: displayTemperatureC === null ? null : [displayTemperatureC, displayTemperatureC],
    bodyFeelTemperatureC,
    rawGridTemperatureC: rawGridTemperatureC ?? null,
    terrainAdjustedTemperatureC,
    providerTemperatureC: providerTemperatureC ?? null,
    temperatureDifferenceC,
    differenceLevel,
    confidenceLevel,
    userNoteZh: notes.userNoteZh,
    professionalNoteZh: notes.professionalNoteZh,
    clothingAdviceModifierZh: notes.clothingAdviceModifierZh,
    actionAdviceModifierZh: notes.actionAdviceModifierZh,
    lapseRateCPerKm,
  };
}

export function isHighMountainTemperatureSensitiveLocation(
  input: Pick<
    TerrainTemperatureBasisContextInput,
    | "elevationMeters"
    | "surroundingReliefMeters"
    | "terrainType"
    | "terrainMode"
    | "terrainClass"
    | "isClassicCloudSeaEligible"
  > = {},
): boolean {
  const elevation = finiteNumber(input.elevationMeters);
  const relief = finiteNumber(input.surroundingReliefMeters);
  const terrainType = normalizeText(input.terrainType);
  const terrainMode = normalizeText(input.terrainMode);
  const terrainClass = normalizeText(input.terrainClass);

  return (
    (elevation !== undefined && elevation >= 800) ||
    (relief !== undefined && relief >= 500) ||
    highMountainTerrainTypes.has(terrainType) ||
    highMountainTerrainModes.has(terrainMode) ||
    highMountainTerrainClasses.has(terrainClass) ||
    input.isClassicCloudSeaEligible === true
  );
}

function selectTemperatureBasis(input: {
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly directTerrainAdjustedTemperatureC?: number;
  readonly lapseEstimate?: number;
  readonly selectedTerrainAdjustedTemperatureC?: number;
  readonly rawGridTemperatureC?: number;
  readonly providerTemperatureC?: number;
  readonly inputDisplayedTemperatureC?: number;
}): TerrainTemperatureBasis {
  if (input.directTerrainAdjustedTemperatureC !== undefined) {
    if (
      input.isHighMountainTemperatureSensitive &&
      input.inputDisplayedTemperatureC !== undefined &&
      input.rawGridTemperatureC !== undefined &&
      Math.abs(input.inputDisplayedTemperatureC - input.rawGridTemperatureC) <
        Math.abs(input.inputDisplayedTemperatureC - input.directTerrainAdjustedTemperatureC)
    ) {
      return "mixed";
    }
    return "terrain_adjusted";
  }

  if (input.lapseEstimate !== undefined) {
    return "terrain_adjusted_lapse_estimate";
  }

  if (input.rawGridTemperatureC !== undefined) {
    return "raw_grid";
  }

  if (input.providerTemperatureC !== undefined || input.inputDisplayedTemperatureC !== undefined) {
    return "provider_point";
  }

  return "unknown";
}

function selectDisplayTemperature(input: {
  readonly basis: TerrainTemperatureBasis;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly selectedTerrainAdjustedTemperatureC?: number;
  readonly inputDisplayedTemperatureC?: number;
  readonly providerTemperatureC?: number;
  readonly rawGridTemperatureC?: number;
}): number | null {
  if (
    input.isHighMountainTemperatureSensitive &&
    input.selectedTerrainAdjustedTemperatureC !== undefined
  ) {
    return input.selectedTerrainAdjustedTemperatureC;
  }
  if (input.basis === "terrain_adjusted" || input.basis === "terrain_adjusted_lapse_estimate") {
    return input.selectedTerrainAdjustedTemperatureC ?? null;
  }
  return (
    input.inputDisplayedTemperatureC ??
    input.providerTemperatureC ??
    input.rawGridTemperatureC ??
    input.selectedTerrainAdjustedTemperatureC ??
    null
  );
}

function differenceLevelForTemperature(
  temperatureDifferenceC: number | null,
): TerrainTemperatureDifferenceLevel {
  if (temperatureDifferenceC === null) {
    return "unknown";
  }
  if (temperatureDifferenceC <= 0) {
    return "none";
  }
  if (temperatureDifferenceC < 2) {
    return "minor";
  }
  if (temperatureDifferenceC < 5) {
    return "medium";
  }
  return "large";
}

function confidenceLevelForTemperature(input: {
  readonly basis: TerrainTemperatureBasis;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly hasDirectTerrainAdjustedTemperature: boolean;
  readonly hasLapseEstimate: boolean;
  readonly hasRawGridTemperature: boolean;
  readonly terrainConfidence?: string | null;
  readonly displayTemperatureC: number | null;
}): TerrainTemperatureConfidenceLevel {
  if (input.displayTemperatureC === null) {
    return "unknown";
  }
  if (!input.isHighMountainTemperatureSensitive) {
    return input.basis === "unknown" ? "unknown" : "medium";
  }
  if (input.terrainConfidence === "low") {
    return "low";
  }
  if (input.hasDirectTerrainAdjustedTemperature && input.hasRawGridTemperature) {
    return "high";
  }
  if (input.hasDirectTerrainAdjustedTemperature || input.hasLapseEstimate) {
    return "medium";
  }
  return "low";
}

function buildTemperatureBasisNotes(input: {
  readonly basis: TerrainTemperatureBasis;
  readonly isHighMountainTemperatureSensitive: boolean;
  readonly differenceLevel: TerrainTemperatureDifferenceLevel;
  readonly temperatureDifferenceC: number | null;
  readonly confidenceLevel: TerrainTemperatureConfidenceLevel;
}): Pick<
  TerrainTemperatureBasisContext,
  "userNoteZh" | "professionalNoteZh" | "clothingAdviceModifierZh" | "actionAdviceModifierZh"
> {
  if (!input.isHighMountainTemperatureSensitive) {
    return {
      userNoteZh: "当前地点不强制按高山机位温度修正。",
      professionalNoteZh: "低海拔或平缓地形未触发高山温度敏感规则。",
      clothingAdviceModifierZh: "",
      actionAdviceModifierZh: "",
    };
  }

  const largeDifference = input.temperatureDifferenceC !== null && input.temperatureDifferenceC >= 5;
  const mediumProfessionalDifference =
    input.temperatureDifferenceC !== null && input.temperatureDifferenceC >= 3;
  const hasAdjustedBasis =
    input.basis === "terrain_adjusted" ||
    input.basis === "terrain_adjusted_lapse_estimate" ||
    input.basis === "mixed";
  const estimated = input.basis === "terrain_adjusted_lapse_estimate";
  const rawOnly = input.basis === "raw_grid" || input.basis === "provider_point";

  const userNoteZh = largeDifference
    ? "高山机位与周边格点温度差异较大，等待拍摄时请按更冷体感准备。"
    : estimated
      ? "当前温度按机位与模型海拔差做确定性递减率估算，出行前仍需复核临近预报。"
      : rawOnly
        ? "当前仅有原始格点温度，高山机位体感需谨慎参考。"
        : hasAdjustedBasis
          ? "当前温度已按机位海拔估算。"
          : "高山机位温度口径暂不完整，体感需临近复核。";
  const professionalNoteZh = mediumProfessionalDifference
    ? estimated
      ? "原始格点温度与机位估算温度存在差异，高山体感与穿衣建议以机位估算温度为准；本次机位温度使用确定性递减率估算。"
      : "原始格点温度与机位估算温度存在差异，高山体感与穿衣建议以机位估算温度为准。"
    : estimated
      ? "缺少直接机位温度时，使用机位海拔与模型海拔差及递减率做确定性估算。"
      : rawOnly
        ? "当前仅有原始格点温度，高山机位体感需谨慎参考。"
        : hasAdjustedBasis
          ? "当前温度已按机位海拔估算。"
          : "暂无可确认的温度口径。";
  const clothingAdviceModifierZh = rawOnly
    ? "当前缺少高置信机位温度修正，按更冷一档准备防风、轻保暖和防潮。"
    : largeDifference
      ? "高山体感可能低于城市/低海拔预报，防风、轻保暖、防潮，长时间等待注意体感下降。"
      : "按机位估算温度准备防风、防潮和轻保暖层，清晨/夜间多带一层。";
  const actionAdviceModifierZh = rawOnly
    ? "出发前复核临近高山预报，现场按风口体感决定等待时长。"
    : "到位后按机位体感复核风口位置，清晨/夜间或长时间等待时多带一层。";

  return {
    userNoteZh,
    professionalNoteZh:
      input.confidenceLevel === "low"
        ? `${professionalNoteZh} 置信度偏低，舒适度和装备建议需谨慎。`
        : professionalNoteZh,
    clothingAdviceModifierZh,
    actionAdviceModifierZh,
  };
}

function bodyFeelCoolingC(
  input: TerrainTemperatureBasisContextInput,
  isHighMountainTemperatureSensitive: boolean,
): number {
  const windSpeed = finiteNumber(input.windSpeedMs) ?? 0;
  const windGust = finiteNumber(input.windGustMs) ?? windSpeed;
  const humidity = finiteNumber(input.humidityPercent) ?? 0;
  const hour = finiteNumber(input.forecastHour);
  const windCooling = Math.min(5, Math.max(0, windSpeed - 4) * 0.55);
  const gustCooling = windGust >= 12 ? 1.5 : windGust >= 9 ? 0.8 : 0;
  const humidityCooling = humidity >= 85 ? 0.6 : 0;
  const waitingCooling = hour !== undefined && (hour <= 7 || hour >= 18) ? 0.8 : 0;
  const mountainCooling = isHighMountainTemperatureSensitive ? 0.8 : 0;
  return round1(windCooling + gustCooling + humidityCooling + waitingCooling + mountainCooling);
}

function finiteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finitePositiveNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
