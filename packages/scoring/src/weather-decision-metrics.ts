import {
  classifyTerrainMode,
  simplifyWeatherSummaryZh,
  terrainModeUsesLowlandSemantics,
  terrainModeUsesMountainSemantics,
  type ElevationTemperatureAdjustment,
  type ExposedRidgeWindRisk,
  type NormalizedCurrentWeather,
  type NormalizedDailyWeather,
  type NormalizedHourlyWeather,
  type PhotographyPrecipitationRisk,
  type PrecipitationType,
  type TerrainAnalysisSummary,
  type TerrainProfileSummary,
  type TerrainType,
  type ExposureType,
  type TransparencyGrade,
  type TripodStabilityRisk,
} from "@photo-weather/shared";
import { clampScore } from "./helpers.js";

export type PrecipitationRiskLevel = PhotographyPrecipitationRisk["rainRiskLevel"];

export type WeatherAdjustmentInput = {
  readonly currentWeather?: NormalizedCurrentWeather;
  readonly hourlyWeather: readonly NormalizedHourlyWeather[];
  readonly dailyWeather: readonly NormalizedDailyWeather[];
  readonly terrainAnalysis: TerrainAnalysisSummary;
};

export type WeatherAdjustmentResult = {
  readonly currentWeather?: NormalizedCurrentWeather;
  readonly hourlyWeather: readonly NormalizedHourlyWeather[];
  readonly dailyWeather: readonly NormalizedDailyWeather[];
  readonly estimatedFields: readonly string[];
};

type TransparencyWeatherInput = {
  readonly visibility?: number | null;
  readonly rawVisibilityKm?: number | null;
  readonly cloudLow?: number | null;
  readonly cloudTotal?: number | null;
  readonly humidity?: number | null;
  readonly dewPointSpread?: number | null;
  readonly precipitation?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationProbability?: number | null;
};

const defaultLapseRateCelsiusPer100m = 0.6;
const elevationCloseEnoughMeters = 300;
const unknownProviderCorrectionBaseMeters = 900;
const unknownProviderDayCorrectionRatio = 0.35;
const unknownProviderNightMinCorrectionRatio = 0.25;
const maxUnknownProviderCoolingCelsius = 4;
const maxVeryHighTerrainUnknownProviderCoolingCelsius = 4;
const maxUnknownProviderNightCoolingCelsius = 2.8;
const maxVeryHighTerrainUnknownProviderNightCoolingCelsius = 3;
const maxKnownProviderCoolingCelsius = 8;
type TemperatureCorrectionRole = "instant" | "daily_min" | "daily_max";

export function precipitationAmountMm(
  weather:
    | Pick<
        NormalizedHourlyWeather,
        "precipitation" | "precipitationAmountMm" | "rainAmountMm" | "snowAmountMm"
      >
    | Pick<
        NormalizedDailyWeather,
        "precipitation" | "precipitationAmountMm" | "rainAmountMm" | "snowAmountMm"
      >
    | undefined,
): number | null {
  if (!weather) {
    return null;
  }
  if (finiteNumber(weather.precipitationAmountMm)) {
    return weather.precipitationAmountMm;
  }
  if (finiteNumber(weather.precipitation)) {
    return weather.precipitation;
  }
  const splitTotal = [weather.rainAmountMm, weather.snowAmountMm].filter(finiteNumber);
  return splitTotal.length > 0 ? round1(splitTotal.reduce((sum, value) => sum + value, 0)) : null;
}

export function precipitationRiskLevel(input: {
  readonly probability?: number | null;
  readonly amountMm?: number | null;
}): PrecipitationRiskLevel {
  const amount = input.amountMm ?? 0;
  const probability = input.probability;

  if (amount >= 25) {
    return "severe";
  }
  if (amount >= 10 || (finiteNumber(probability) && probability >= 70)) {
    return "high";
  }
  if (amount >= 2 || (finiteNumber(probability) && probability >= 40)) {
    return "medium";
  }
  if (amount >= 0.3 || (finiteNumber(probability) && probability >= 20)) {
    return "low";
  }
  return "none";
}

export function buildPhotographyPrecipitationRisk(input: {
  readonly probability?: number | null;
  readonly amountMm?: number | null;
  readonly affectedWindows?: readonly string[];
  readonly weatherTextZh?: string | null;
}): PhotographyPrecipitationRisk {
  const probability = finiteNumber(input.probability) ? input.probability : null;
  const amount = finiteNumber(input.amountMm) ? round1(Math.max(0, input.amountMm)) : null;
  const rainRiskLevel = precipitationRiskLevel({ probability, amountMm: amount });
  const affectedWindows =
    input.affectedWindows && input.affectedWindows.length > 0
      ? [...new Set(input.affectedWindows)]
      : defaultAffectedWindows(rainRiskLevel);

  return {
    precipitationProbabilityPercent: probability,
    precipitationAmountMm: amount,
    rainRiskLevel,
    rainRiskLabelZh: rainRiskLabelZh(rainRiskLevel),
    affectedWindows,
    recommendationZh: precipitationRecommendationZh({
      rainRiskLevel,
      amount,
      probability,
      affectedWindows,
      weatherTextZh: input.weatherTextZh,
    }),
  };
}

export function precipitationRiskScore(input: {
  readonly probability?: number | null;
  readonly amountMm?: number | null;
}): number {
  const probabilityScore = finiteNumber(input.probability) ? input.probability : 0;
  const amount = input.amountMm ?? 0;
  const amountScore =
    amount >= 25 ? 100 : amount >= 10 ? 86 : amount >= 2 ? 62 : amount >= 0.3 ? 34 : 0;
  return clampScore(Math.max(probabilityScore, amountScore));
}

export function precipitationTypeFromAmounts(input: {
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly precipitationType?: PrecipitationType;
}): PrecipitationType {
  if (input.precipitationType && input.precipitationType !== "unknown") {
    return input.precipitationType;
  }
  const rain = input.rainAmountMm ?? 0;
  const snow = input.snowAmountMm ?? 0;
  if (rain > 0 && snow > 0) {
    return "mixed";
  }
  if (snow > 0) {
    return "snow";
  }
  if (rain > 0 || (input.precipitationAmountMm ?? 0) > 0) {
    return "rain";
  }
  if (input.precipitationAmountMm === 0) {
    return "none";
  }
  return "unknown";
}

function defaultAffectedWindows(level: PrecipitationRiskLevel): readonly string[] {
  if (level === "none") {
    return [];
  }
  if (level === "low") {
    return ["局地短时窗口"];
  }
  if (level === "medium") {
    return ["清晨", "傍晚", "夜间"];
  }
  return ["主要拍摄窗口", "通行与器材防护"];
}

function rainRiskLabelZh(level: PrecipitationRiskLevel): string {
  switch (level) {
    case "severe":
      return "严重";
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    default:
      return "无明显";
  }
}

function precipitationRecommendationZh(input: {
  readonly rainRiskLevel: PrecipitationRiskLevel;
  readonly amount: number | null;
  readonly probability: number | null;
  readonly affectedWindows: readonly string[];
  readonly weatherTextZh?: string | null;
}): string {
  const amountText = input.amount !== null ? `预计 ${round1(input.amount)}mm` : "预计降水量暂无";
  const probabilityMissingText =
    input.probability === null && input.amount !== null
      ? "降水概率暂无，按预计降水量判断风险。"
      : "";
  const weatherText = input.weatherTextZh ? `${simplifyWeatherSummaryZh(input.weatherTextZh)}，` : "";
  const affectedText =
    input.affectedWindows.length > 0
      ? `可能影响${input.affectedWindows.join("、")}。`
      : "拍摄窗口受降水影响不明显。";

  switch (input.rainRiskLevel) {
    case "severe":
      return `${weatherText}降水干扰很强，${amountText}，不建议把该日作为主拍摄计划。${probabilityMissingText}`;
    case "high":
      return `${weatherText}降水风险高，${amountText}，拍摄窗口可能被打断，优先准备备选日。${probabilityMissingText}`;
    case "medium":
      return `${weatherText}有降水干扰，${amountText}，${affectedText}${probabilityMissingText}`;
    case "low":
      return `${weatherText}降水风险较低，${amountText}，可作为备选窗口，出发前复核雷达和短临预报。${probabilityMissingText}`;
    default:
      return "降水不明显，可作为备选窗口。";
  }
}

export function transparencyGradeFromScore(score: number): TransparencyGrade {
  if (score >= 82) {
    return "excellent";
  }
  if (score >= 68) {
    return "good";
  }
  if (score >= 48) {
    return "fair";
  }
  return "poor";
}

export function calculatePhotographyTransparencyScore(
  weather: TransparencyWeatherInput | undefined,
): number {
  if (!weather) {
    return 0;
  }
  const visibility = weather.rawVisibilityKm ?? weather.visibility ?? 0;
  const lowCloud = weather.cloudLow ?? 45;
  const cloudTotal = weather.cloudTotal ?? lowCloud;
  const humidity = weather.humidity ?? 75;
  const dewPointSpread = weather.dewPointSpread ?? 6;
  const precipitationRisk = precipitationRiskScore({
    probability: weather.precipitationProbability,
    amountMm: precipitationAmountMm(weather),
  });
  const visibilityScore =
    visibility >= 80
      ? 84
      : visibility >= 40
        ? 78
        : visibility >= 20
          ? 70
          : clampScore(visibility * 3.2);
  const lowCloudScore = clampScore(100 - Math.max(0, lowCloud - 25) * 0.9);
  const humidityScore = clampScore(100 - Math.max(0, humidity - 65) * 1.6);
  const dewPointScore = clampScore(42 + Math.min(10, dewPointSpread) * 4.8);
  const cloudScore = clampScore(100 - Math.max(0, cloudTotal - 55) * 0.65);

  return clampScore(
    visibilityScore * 0.32 +
      lowCloudScore * 0.22 +
      humidityScore * 0.16 +
      dewPointScore * 0.08 +
      cloudScore * 0.08 +
      (100 - precipitationRisk) * 0.14,
  );
}

export function exposedRidgeWindRisk(input: {
  readonly elevationMeters?: number;
  readonly windSpeed?: number | null;
  readonly windGust?: number | null;
  readonly terrainType?: TerrainType;
  readonly exposureType?: ExposureType;
}): ExposedRidgeWindRisk {
  const wind = input.windSpeed ?? 0;
  const gust = input.windGust ?? wind;
  const isHighMountain =
    typeof input.elevationMeters === "number" &&
    Number.isFinite(input.elevationMeters) &&
    input.elevationMeters >= 1200;
  const isExposedRidge =
    input.exposureType === "exposed" ||
    input.terrainType === "summit" ||
    input.terrainType === "ridge";
  if (
    wind >= 8 ||
    gust >= 12 ||
    (isHighMountain && gust >= 10) ||
    (isExposedRidge && gust >= 9.5)
  ) {
    return "high";
  }
  if (wind >= 5 || gust >= 8 || (isHighMountain && wind >= 4) || (isExposedRidge && wind >= 3.5)) {
    return "medium";
  }
  return "low";
}

export function applyMountainWeatherAdjustments(
  input: WeatherAdjustmentInput,
): WeatherAdjustmentResult {
  const terrainProfile = input.terrainAnalysis.terrainProfile;
  const elevationMeters = finiteNumber(terrainProfile.locationElevation)
    ? terrainProfile.locationElevation
    : undefined;
  const terrainMode = classifyTerrainMode(terrainProfile);
  const shouldApplyElevationCooling =
    elevationMeters !== undefined && !terrainModeUsesLowlandSemantics(terrainMode);
  const hourlyWeather = input.hourlyWeather.map((hour) =>
    annotateDecisionWeather(
      shouldApplyElevationCooling ? adjustHourlyTemperature(hour, elevationMeters) : hour,
      terrainProfile,
    ),
  );
  const currentWeather = input.currentWeather
    ? annotateDecisionCurrent(
        shouldApplyElevationCooling
          ? adjustCurrentTemperature(input.currentWeather, elevationMeters)
          : input.currentWeather,
        terrainProfile,
      )
    : undefined;
  const dailyWeather = input.dailyWeather.map((day) =>
    annotateDecisionDaily(
      shouldApplyElevationCooling ? adjustDailyTemperature(day, elevationMeters) : day,
      terrainProfile,
    ),
  );
  const estimatedFields = hourlyWeather.some(
    (hour) => hour.temperatureAdjustment?.correctionApplied,
  )
    ? ["temperatureElevationCorrection"]
    : [];

  return {
    currentWeather,
    hourlyWeather,
    dailyWeather,
    estimatedFields,
  };
}

function adjustHourlyTemperature(
  hour: NormalizedHourlyWeather,
  spotElevationMeters: number,
): NormalizedHourlyWeather {
  const adjustment = buildTemperatureAdjustment(hour.temperature, {
    spotElevationMeters,
    providerElevationMeters: hour.providerElevationMeters,
    providerCode: hour.providerCode,
    role: "instant",
    existing: hour.temperatureAdjustment,
  });
  const adjustedDewPointSpread = finiteNumber(hour.dewPoint)
    ? round1(adjustment.elevationAdjustedTemperature - hour.dewPoint)
    : hour.dewPointSpread;
  if (!adjustment.correctionApplied) {
    return {
      ...hour,
      rawTemperature: hour.rawTemperature ?? adjustment.rawTemperature,
      elevationAdjustedTemperature: adjustment.elevationAdjustedTemperature,
      dewPointSpread: adjustedDewPointSpread,
      temperatureAdjustment: adjustment,
    };
  }

  return {
    ...hour,
    rawTemperature: adjustment.rawTemperature,
    temperature: adjustment.elevationAdjustedTemperature,
    elevationAdjustedTemperature: adjustment.elevationAdjustedTemperature,
    feelsLike: finiteNumber(hour.feelsLike)
      ? round1(hour.feelsLike - adjustment.correctionCelsius)
      : hour.feelsLike,
    dewPointSpread: adjustedDewPointSpread,
    temperatureAdjustment: adjustment,
    estimatedFields: unique([...(hour.estimatedFields ?? []), "temperatureElevationCorrection"]),
    sourceNotes: unique([
      ...(hour.sourceNotes ?? []),
      "已按机位海拔估算山顶温度，避免低海拔预报直接用于山顶体感。",
    ]),
  };
}

function adjustCurrentTemperature(
  weather: NormalizedCurrentWeather,
  spotElevationMeters: number,
): NormalizedCurrentWeather {
  const adjustment = buildTemperatureAdjustment(weather.temperature, {
    spotElevationMeters,
    providerElevationMeters: weather.providerElevationMeters,
    providerCode: weather.providerCode,
    role: "instant",
    existing: weather.temperatureAdjustment,
  });
  if (!adjustment.correctionApplied) {
    return {
      ...weather,
      rawTemperature: weather.rawTemperature ?? adjustment.rawTemperature,
      elevationAdjustedTemperature: adjustment.elevationAdjustedTemperature,
      temperatureAdjustment: adjustment,
    };
  }

  return {
    ...weather,
    rawTemperature: adjustment.rawTemperature,
    temperature: adjustment.elevationAdjustedTemperature,
    elevationAdjustedTemperature: adjustment.elevationAdjustedTemperature,
    feelsLike: finiteNumber(weather.feelsLike)
      ? round1(weather.feelsLike - adjustment.correctionCelsius)
      : weather.feelsLike,
    temperatureAdjustment: adjustment,
    estimatedFields: unique([...weather.estimatedFields, "temperatureElevationCorrection"]),
  };
}

function adjustDailyTemperature(
  day: NormalizedDailyWeather,
  spotElevationMeters: number,
): NormalizedDailyWeather {
  const minAdjustment = buildTemperatureAdjustment(day.tempMin, {
    spotElevationMeters,
    providerElevationMeters: day.providerElevationMeters,
    providerCode: day.providerCode,
    role: "daily_min",
    existing: day.temperatureAdjustment,
  });
  const maxAdjustment = buildTemperatureAdjustment(day.tempMax, {
    spotElevationMeters,
    providerElevationMeters: day.providerElevationMeters,
    providerCode: day.providerCode,
    role: "daily_max",
    existing: day.temperatureAdjustment,
  });
  const adjustment = maxAdjustment.correctionApplied ? maxAdjustment : minAdjustment;
  if (!minAdjustment.correctionApplied && !maxAdjustment.correctionApplied) {
    return {
      ...day,
      rawTempMin: day.rawTempMin ?? day.tempMin,
      rawTempMax: day.rawTempMax ?? day.tempMax,
      elevationAdjustedTempMin: day.elevationAdjustedTempMin ?? day.tempMin,
      elevationAdjustedTempMax: day.elevationAdjustedTempMax ?? day.tempMax,
      temperatureAdjustment: {
        correctionApplied: false,
        correctionMeters: 0,
        correctionCelsius: 0,
        lapseRateCelsiusPer100m: adjustment.lapseRateCelsiusPer100m,
        selectedSpotElevationMeters: adjustment.selectedSpotElevationMeters,
        providerElevationMeters: adjustment.providerElevationMeters,
        providerElevationKnown: adjustment.providerElevationKnown,
        correctionReason: adjustment.correctionReason,
      },
    };
  }

  return {
    ...day,
    rawTempMin: day.rawTempMin ?? day.tempMin,
    rawTempMax: day.rawTempMax ?? day.tempMax,
    tempMin: round1(day.tempMin - minAdjustment.correctionCelsius),
    tempMax: round1(day.tempMax - maxAdjustment.correctionCelsius),
    elevationAdjustedTempMin: round1(day.tempMin - minAdjustment.correctionCelsius),
    elevationAdjustedTempMax: round1(day.tempMax - maxAdjustment.correctionCelsius),
    temperatureAdjustment: {
      correctionApplied: adjustment.correctionApplied,
      correctionMeters: adjustment.correctionMeters,
      correctionCelsius: adjustment.correctionCelsius,
      lapseRateCelsiusPer100m: adjustment.lapseRateCelsiusPer100m,
      selectedSpotElevationMeters: adjustment.selectedSpotElevationMeters,
      providerElevationMeters: adjustment.providerElevationMeters,
      providerElevationKnown: adjustment.providerElevationKnown,
      correctionReason: adjustment.correctionReason,
    },
    estimatedFields: unique([...(day.estimatedFields ?? []), "temperatureElevationCorrection"]),
  };
}

function buildTemperatureAdjustment(
  rawTemperature: number,
  input: {
    readonly spotElevationMeters: number;
    readonly providerElevationMeters?: number;
    readonly providerCode?: string;
    readonly role?: TemperatureCorrectionRole;
    readonly existing?: Partial<ElevationTemperatureAdjustment>;
  },
): ElevationTemperatureAdjustment {
  if (input.existing?.correctionApplied) {
    return {
      rawTemperature: input.existing.rawTemperature ?? rawTemperature,
      rawTemperatureC: input.existing.rawTemperatureC ?? input.existing.rawTemperature ?? rawTemperature,
      elevationAdjustedTemperature: input.existing.elevationAdjustedTemperature ?? rawTemperature,
      terrainAdjustedTemperatureC:
        input.existing.terrainAdjustedTemperatureC ??
        input.existing.elevationAdjustedTemperature ??
        rawTemperature,
      correctionApplied: true,
      correctionMeters: input.existing.correctionMeters ?? 0,
      correctionCelsius: input.existing.correctionCelsius ?? 0,
      lapseRateCelsiusPer100m:
        input.existing.lapseRateCelsiusPer100m ?? defaultLapseRateCelsiusPer100m,
      selectedSpotElevationMeters:
        input.existing.selectedSpotElevationMeters ?? input.spotElevationMeters,
      providerElevationMeters: input.existing.providerElevationMeters,
      providerElevationKnown: input.existing.providerElevationKnown ?? false,
      correctionReason: input.existing.correctionReason ?? "existing_correction_preserved",
      dayCorrectionRatio: input.existing.dayCorrectionRatio,
      nightCorrectionRatio: input.existing.nightCorrectionRatio,
      maxCoolingCelsius: input.existing.maxCoolingCelsius,
    };
  }

  const providerElevationMeters = finiteNumber(input.providerElevationMeters)
    ? input.providerElevationMeters
    : undefined;
  const providerElevationKnown = providerElevationMeters !== undefined;
  const providerCode = input.providerCode ?? "";

  if (providerElevationKnown) {
    const elevationDifference = input.spotElevationMeters - providerElevationMeters;
    if (Math.abs(elevationDifference) <= elevationCloseEnoughMeters) {
      return temperatureAdjustmentResult(rawTemperature, {
        spotElevationMeters: input.spotElevationMeters,
        providerElevationMeters,
        providerElevationKnown: true,
        correctionReason: "provider_elevation_close_to_spot",
      });
    }

    if (elevationDifference <= 0) {
      return temperatureAdjustmentResult(rawTemperature, {
        spotElevationMeters: input.spotElevationMeters,
        providerElevationMeters,
        providerElevationKnown: true,
        correctionReason: "provider_elevation_higher_than_spot",
      });
    }

    const correctionMeters = Math.max(0, elevationDifference - elevationCloseEnoughMeters);
    const correctionCelsius = Math.min(
      maxKnownProviderCoolingCelsius,
      round1((correctionMeters / 100) * defaultLapseRateCelsiusPer100m),
    );
    return temperatureAdjustmentResult(rawTemperature, {
      spotElevationMeters: input.spotElevationMeters,
      providerElevationMeters,
      providerElevationKnown: true,
      correctionReason: "provider_elevation_delta_beyond_threshold",
      correctionMeters,
      correctionCelsius,
      dayCorrectionRatio: 1,
      nightCorrectionRatio: input.role === "daily_min" ? 1 : undefined,
      maxCoolingCelsius: maxKnownProviderCoolingCelsius,
    });
  }

  if (providerHasTerrainAwareDemoValues(providerCode)) {
    return temperatureAdjustmentResult(rawTemperature, {
      spotElevationMeters: input.spotElevationMeters,
      providerElevationKnown: false,
      correctionReason: "provider_terrain_aware_no_extra_correction",
    });
  }

  if (input.spotElevationMeters < 1200) {
    return temperatureAdjustmentResult(rawTemperature, {
      spotElevationMeters: input.spotElevationMeters,
      providerElevationKnown: false,
      correctionReason: "spot_elevation_too_low_for_unknown_correction",
    });
  }

  const unknownDeltaMeters = Math.max(
    0,
    input.spotElevationMeters - unknownProviderCorrectionBaseMeters,
  );
  const isNightMin = input.role === "daily_min";
  const maxCooling = isNightMin
    ? input.spotElevationMeters >= 2200
      ? maxVeryHighTerrainUnknownProviderNightCoolingCelsius
      : maxUnknownProviderNightCoolingCelsius
    : input.spotElevationMeters >= 2200
      ? maxVeryHighTerrainUnknownProviderCoolingCelsius
      : maxUnknownProviderCoolingCelsius;
  const correctionRatio = isNightMin
    ? unknownProviderNightMinCorrectionRatio
    : unknownProviderDayCorrectionRatio;
  const correctionCelsius = Math.min(
    maxCooling,
    round1(
      (unknownDeltaMeters / 100) *
        defaultLapseRateCelsiusPer100m *
        correctionRatio,
    ),
  );
  const correctionMeters =
    correctionCelsius > 0
      ? Math.round((correctionCelsius / defaultLapseRateCelsiusPer100m) * 100)
      : 0;

  return temperatureAdjustmentResult(rawTemperature, {
    spotElevationMeters: input.spotElevationMeters,
    providerElevationKnown: false,
    correctionReason: "unknown_provider_elevation_conservative",
    correctionMeters,
    correctionCelsius,
    dayCorrectionRatio: unknownProviderDayCorrectionRatio,
    nightCorrectionRatio: unknownProviderNightMinCorrectionRatio,
    maxCoolingCelsius: maxCooling,
  });
}

function temperatureAdjustmentResult(
  rawTemperature: number,
  input: {
    readonly spotElevationMeters: number;
    readonly providerElevationMeters?: number;
    readonly providerElevationKnown: boolean;
    readonly correctionReason: ElevationTemperatureAdjustment["correctionReason"];
    readonly correctionMeters?: number;
    readonly correctionCelsius?: number;
    readonly dayCorrectionRatio?: number;
    readonly nightCorrectionRatio?: number;
    readonly maxCoolingCelsius?: number;
  },
): ElevationTemperatureAdjustment {
  const correctionMeters = Math.max(0, Math.round(input.correctionMeters ?? 0));
  const correctionCelsius = round1(Math.max(0, input.correctionCelsius ?? 0));
  const correctionApplied = correctionMeters > 0 && correctionCelsius > 0;

  return {
    rawTemperature,
    rawTemperatureC: rawTemperature,
    elevationAdjustedTemperature: round1(rawTemperature - correctionCelsius),
    terrainAdjustedTemperatureC: round1(rawTemperature - correctionCelsius),
    correctionApplied,
    correctionMeters,
    correctionCelsius,
    lapseRateCelsiusPer100m: defaultLapseRateCelsiusPer100m,
    selectedSpotElevationMeters: Math.round(input.spotElevationMeters),
    providerElevationMeters: input.providerElevationMeters,
    providerElevationKnown: input.providerElevationKnown,
    correctionReason: input.correctionReason,
    dayCorrectionRatio: input.dayCorrectionRatio,
    nightCorrectionRatio: input.nightCorrectionRatio,
    maxCoolingCelsius: input.maxCoolingCelsius,
  };
}

function providerHasTerrainAwareDemoValues(providerCode: string): boolean {
  return /^mock/i.test(providerCode) || providerCode.includes("mock");
}

function annotateDecisionWeather(
  hour: NormalizedHourlyWeather,
  terrainProfile: TerrainProfileSummary,
): NormalizedHourlyWeather {
  const selectedElevation = finiteNumber(terrainProfile.locationElevation)
    ? terrainProfile.locationElevation
    : undefined;
  const transparencyScore = calculatePhotographyTransparencyScore(hour);
  const windRisk = exposedRidgeWindRisk({
    elevationMeters: selectedElevation,
    windSpeed: hour.windSpeed,
    windGust: hour.windGust,
    terrainType: terrainProfile.terrainType,
    exposureType: terrainProfile.exposureType,
  });
  const comfort = buildMountainComfortMetadata({
    temperature: hour.temperature,
    feelsLike: hour.feelsLike,
    humidity: hour.humidity,
    windSpeed: hour.windSpeed,
    windGust: hour.windGust,
    precipitationAmountMm: precipitationAmountMm(hour),
    rainRiskLevel: precipitationRiskLevel({
      probability: hour.precipitationProbability,
      amountMm: precipitationAmountMm(hour),
    }),
    terrainProfile,
    windRisk,
  });
  const providerElevation = hour.providerElevationMeters;
  const elevationDifference =
    typeof providerElevation === "number" && selectedElevation !== undefined
      ? Math.round(selectedElevation - providerElevation)
      : undefined;

  return {
    ...hour,
    precipitationAmountMm: precipitationAmountMm(hour),
    precipitationProbabilityPercent: hour.precipitationProbability,
    precipitationType: precipitationTypeFromAmounts(hour),
    precipitationRisk: buildPhotographyPrecipitationRisk({
      probability: hour.precipitationProbability,
      amountMm: precipitationAmountMm(hour),
      affectedWindows: [hourWindowLabel(hour.time)],
      weatherTextZh: hour.weatherTextZh,
    }),
    rawVisibilityKm: hour.rawVisibilityKm ?? hour.visibility,
    photographyTransparencyScore: transparencyScore,
    transparencyGrade: transparencyGradeFromScore(transparencyScore),
    cloudFogObstructionRisk: cloudFogRiskFromScore(transparencyScore, hour.cloudLow, hour.humidity),
    exposedRidgeWindRisk: windRisk,
    mountainFeelsLikeC: comfort.mountainFeelsLikeC,
    tripodStabilityRisk: comfort.tripodStabilityRisk,
    windChillNoteZh: comfort.windChillNoteZh,
    clothingRiskNoteZh: comfort.clothingRiskNoteZh,
    selectedSpotElevationMeters: selectedElevation,
    elevationDifferenceMeters: elevationDifference,
    terrainAdjustmentApplied: hour.temperatureAdjustment?.correctionApplied ?? false,
    terrainAdjustmentReason:
      hour.temperatureAdjustment?.correctionReason ?? "temperature_adjustment_not_required",
  };
}

function annotateDecisionCurrent(
  weather: NormalizedCurrentWeather,
  terrainProfile: TerrainProfileSummary,
): NormalizedCurrentWeather {
  const selectedElevation = finiteNumber(terrainProfile.locationElevation)
    ? terrainProfile.locationElevation
    : undefined;
  const transparencyScore = calculatePhotographyTransparencyScore({
    visibility: weather.visibility ?? null,
    rawVisibilityKm: weather.rawVisibilityKm ?? weather.visibility ?? null,
    cloudLow: weather.cloudLow ?? null,
    cloudTotal: weather.cloudTotal ?? null,
    humidity: weather.humidity,
    dewPointSpread: weather.dewPointSpread ?? null,
    precipitation: weather.precipitation ?? null,
    precipitationAmountMm: weather.precipitationAmountMm ?? weather.precipitation ?? null,
    rainAmountMm: weather.rainAmountMm ?? null,
    snowAmountMm: weather.snowAmountMm ?? null,
    precipitationProbability: weather.precipitationProbability ?? null,
  });
  const windRisk = exposedRidgeWindRisk({
    elevationMeters: selectedElevation,
    windSpeed: weather.windSpeed,
    windGust: weather.windGust,
    terrainType: terrainProfile.terrainType,
    exposureType: terrainProfile.exposureType,
  });
  const comfort = buildMountainComfortMetadata({
    temperature: weather.temperature,
    feelsLike: weather.feelsLike,
    humidity: weather.humidity,
    windSpeed: weather.windSpeed,
    windGust: weather.windGust,
    precipitationAmountMm: precipitationAmountMm(weather),
    rainRiskLevel: precipitationRiskLevel({
      probability: weather.precipitationProbability,
      amountMm: precipitationAmountMm(weather),
    }),
    terrainProfile,
    windRisk,
  });
  const elevationDifference =
    typeof weather.providerElevationMeters === "number" && selectedElevation !== undefined
      ? Math.round(selectedElevation - weather.providerElevationMeters)
      : undefined;

  return {
    ...weather,
    precipitationAmountMm: precipitationAmountMm(weather),
    precipitationProbabilityPercent: weather.precipitationProbability,
    precipitationType: precipitationTypeFromAmounts(weather),
    precipitationRisk: buildPhotographyPrecipitationRisk({
      probability: weather.precipitationProbability,
      amountMm: precipitationAmountMm(weather),
      weatherTextZh: weather.weatherTextZh,
    }),
    rawVisibilityKm: weather.rawVisibilityKm ?? weather.visibility ?? null,
    photographyTransparencyScore: transparencyScore,
    transparencyGrade: transparencyGradeFromScore(transparencyScore),
    cloudFogObstructionRisk: cloudFogRiskFromScore(
      transparencyScore,
      weather.cloudLow,
      weather.humidity,
    ),
    exposedRidgeWindRisk: windRisk,
    mountainFeelsLikeC: comfort.mountainFeelsLikeC,
    tripodStabilityRisk: comfort.tripodStabilityRisk,
    windChillNoteZh: comfort.windChillNoteZh,
    clothingRiskNoteZh: comfort.clothingRiskNoteZh,
    selectedSpotElevationMeters: selectedElevation,
    elevationDifferenceMeters: elevationDifference,
    terrainAdjustmentApplied: weather.temperatureAdjustment?.correctionApplied ?? false,
    terrainAdjustmentReason:
      weather.temperatureAdjustment?.correctionReason ?? "temperature_adjustment_not_required",
  };
}

function annotateDecisionDaily(
  day: NormalizedDailyWeather,
  terrainProfile: TerrainProfileSummary,
): NormalizedDailyWeather {
  const selectedElevation = finiteNumber(terrainProfile.locationElevation)
    ? terrainProfile.locationElevation
    : undefined;
  const transparencyScore =
    finiteNumber(day.photographyTransparencyScore) && day.photographyTransparencyScore > 0
      ? day.photographyTransparencyScore
      : calculatePhotographyTransparencyScore({
          visibility: day.visibility ?? null,
          rawVisibilityKm: day.rawVisibilityKm ?? day.visibility ?? null,
          cloudLow: day.cloudLow ?? null,
          cloudTotal: day.cloudTotal ?? null,
          humidity: day.humidity ?? null,
          dewPointSpread: null,
          precipitation: day.precipitation ?? null,
          precipitationAmountMm: day.precipitationAmountMm ?? day.precipitation ?? null,
          precipitationProbability: day.precipitationProbability,
        });
  const windRisk = exposedRidgeWindRisk({
    elevationMeters: selectedElevation,
    windSpeed: day.windSpeed,
    windGust: day.windGust,
    terrainType: terrainProfile.terrainType,
    exposureType: terrainProfile.exposureType,
  });
  const averageTemperature =
    typeof day.tempMin === "number" && typeof day.tempMax === "number"
      ? (day.tempMin + day.tempMax) / 2
      : day.tempMax;
  const comfort = buildMountainComfortMetadata({
    temperature: averageTemperature,
    humidity: day.humidity,
    windSpeed: day.windSpeed,
    windGust: day.windGust,
    precipitationAmountMm: precipitationAmountMm(day),
    rainRiskLevel: precipitationRiskLevel({
      probability: day.precipitationProbability,
      amountMm: precipitationAmountMm(day),
    }),
    terrainProfile,
    windRisk,
  });
  const providerElevation = day.providerElevationMeters ?? day.temperatureAdjustment?.providerElevationMeters;
  const elevationDifference =
    typeof providerElevation === "number" && selectedElevation !== undefined
      ? Math.round(selectedElevation - providerElevation)
      : undefined;

  return {
    ...day,
    precipitationAmountMm: precipitationAmountMm(day),
    precipitationProbabilityPercent: day.precipitationProbability,
    precipitationType: precipitationTypeFromAmounts(day),
    precipitationRisk: buildPhotographyPrecipitationRisk({
      probability: day.precipitationProbability,
      amountMm: precipitationAmountMm(day),
      weatherTextZh: day.weatherSummary,
    }),
    rawVisibilityKm: day.rawVisibilityKm ?? day.visibility ?? null,
    photographyTransparencyScore: transparencyScore,
    transparencyGrade: transparencyGradeFromScore(transparencyScore),
    cloudFogObstructionRisk: cloudFogRiskFromScore(transparencyScore, day.cloudLow, day.humidity),
    exposedRidgeWindRisk: windRisk,
    mountainFeelsLikeC: comfort.mountainFeelsLikeC,
    tripodStabilityRisk: comfort.tripodStabilityRisk,
    windChillNoteZh: comfort.windChillNoteZh,
    clothingRiskNoteZh: comfort.clothingRiskNoteZh,
    selectedSpotElevationMeters: selectedElevation,
    elevationDifferenceMeters: elevationDifference,
    terrainAdjustmentApplied: day.temperatureAdjustment?.correctionApplied ?? false,
    terrainAdjustmentReason:
      day.temperatureAdjustment?.correctionReason ?? "temperature_adjustment_not_required",
  };
}

function cloudFogRiskFromScore(
  transparencyScore: number,
  lowCloud?: number | null,
  humidity?: number | null,
): "low" | "medium" | "high" {
  if (transparencyScore < 42 || (lowCloud ?? 0) >= 85 || (humidity ?? 0) >= 94) {
    return "high";
  }
  if (transparencyScore < 62 || (lowCloud ?? 0) >= 65 || (humidity ?? 0) >= 86) {
    return "medium";
  }
  return "low";
}

function buildMountainComfortMetadata(input: {
  readonly temperature?: number | null;
  readonly feelsLike?: number | null;
  readonly humidity?: number | null;
  readonly windSpeed?: number | null;
  readonly windGust?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly rainRiskLevel: PrecipitationRiskLevel;
  readonly terrainProfile: TerrainProfileSummary;
  readonly windRisk: ExposedRidgeWindRisk;
}): {
  readonly mountainFeelsLikeC: number | null;
  readonly tripodStabilityRisk: TripodStabilityRisk;
  readonly windChillNoteZh: string;
  readonly clothingRiskNoteZh: string;
} {
  const baseTemperature =
    finiteNumber(input.feelsLike) && input.feelsLike !== null
      ? input.feelsLike
      : finiteNumber(input.temperature)
        ? input.temperature
        : null;
  const wind = input.windSpeed ?? 0;
  const gust = input.windGust ?? wind;
  const isExposed =
    input.terrainProfile.exposureType === "exposed" ||
    input.terrainProfile.terrainType === "summit" ||
    input.terrainProfile.terrainType === "ridge";
  const terrainMode = classifyTerrainMode(input.terrainProfile);
  const usesMountainSemantics = terrainModeUsesMountainSemantics(terrainMode);
  const wetPenalty =
    input.rainRiskLevel === "high" || input.rainRiskLevel === "severe"
      ? 1.4
      : (input.precipitationAmountMm ?? 0) >= 0.3 || input.rainRiskLevel === "medium"
        ? 0.8
        : 0;
  const humidityPenalty = (input.humidity ?? 0) >= 90 ? 0.7 : 0;
  const windPenalty = usesMountainSemantics
    ? isExposed
      ? Math.min(3.2, wind * 0.28 + gust * 0.08)
      : Math.min(2, wind * 0.2)
    : Math.min(1.2, wind * 0.12 + gust * 0.04);
  const mountainFeelsLikeC =
    baseTemperature === null
      ? null
      : round1(baseTemperature - windPenalty - wetPenalty - humidityPenalty);
  const tripodStabilityRisk = classifyTripodStabilityRisk({
    windSpeed: wind,
    windGust: gust,
    isExposed,
  });

  return {
    mountainFeelsLikeC,
    tripodStabilityRisk,
    windChillNoteZh: windChillNoteZh({
      windRisk: input.windRisk,
      tripodStabilityRisk,
      mountainFeelsLikeC,
      isExposed,
      usesMountainSemantics,
    }),
    clothingRiskNoteZh: clothingRiskNoteZh({
      rainRiskLevel: input.rainRiskLevel,
      humidity: input.humidity,
      windRisk: input.windRisk,
      isExposed,
      usesMountainSemantics,
    }),
  };
}

function classifyTripodStabilityRisk(input: {
  readonly windSpeed: number;
  readonly windGust: number;
  readonly isExposed: boolean;
}): TripodStabilityRisk {
  if (input.windGust >= 14 || input.windSpeed >= 9 || (input.isExposed && input.windGust >= 11)) {
    return "high";
  }
  if (input.windGust >= 9 || input.windSpeed >= 5 || (input.isExposed && input.windGust >= 7)) {
    return "medium";
  }
  return "low";
}

function windChillNoteZh(input: {
  readonly windRisk: ExposedRidgeWindRisk;
  readonly tripodStabilityRisk: TripodStabilityRisk;
  readonly mountainFeelsLikeC: number | null;
  readonly isExposed: boolean;
  readonly usesMountainSemantics: boolean;
}): string {
  if (input.windRisk === "high" || input.tripodStabilityRisk === "high") {
    return input.usesMountainSemantics
      ? "山脊风风险较高，三脚架和人员站位需留余量。"
      : "阵风影响较明显，三脚架稳定和人员站位需留余量。";
  }
  if (input.mountainFeelsLikeC !== null && input.mountainFeelsLikeC <= 8) {
    return input.usesMountainSemantics
      ? "清晨和夜间体感偏凉，长时间等云层开口时要预留保暖层。"
      : "清晨和夜间体感偏凉，长时间等待云层开口时要预留保暖层。";
  }
  if (input.isExposed && input.windRisk === "medium") {
    return "机位较暴露，阵风会放大体感和三脚架晃动。";
  }
  return input.usesMountainSemantics
    ? "山顶体感仍需结合现场风口位置复核。"
    : "体感仍需结合现场风口和遮挡条件复核。";
}

function clothingRiskNoteZh(input: {
  readonly rainRiskLevel: PrecipitationRiskLevel;
  readonly humidity?: number | null;
  readonly windRisk: ExposedRidgeWindRisk;
  readonly isExposed: boolean;
  readonly usesMountainSemantics: boolean;
}): string {
  if (input.rainRiskLevel === "high" || input.rainRiskLevel === "severe") {
    return "降水干扰明显，防水外层、镜头布和干燥备份袋优先级高。";
  }
  if ((input.humidity ?? 0) >= 88 && input.windRisk !== "low") {
    return input.usesMountainSemantics
      ? "高湿叠加山顶风，体感会比气温更冷，建议带防风外套。"
      : "高湿叠加阵风，体感会比气温更冷，建议带防风外套。";
  }
  if (input.isExposed) {
    return "暴露机位风感更强，建议按分层穿法准备。";
  }
  return input.usesMountainSemantics
    ? "穿衣按山地分层准备，清晨和夜间保留防风层。"
    : "穿衣按清晨体感准备，保留轻量防风层。";
}

function hourWindowLabel(time: string): string {
  const hour = Number(time.slice(11, 13));
  if (!Number.isFinite(hour)) {
    return "拍摄窗口";
  }
  if (hour >= 4 && hour <= 9) {
    return "清晨窗口";
  }
  if (hour >= 16 && hour <= 20) {
    return "傍晚窗口";
  }
  if (hour >= 21 || hour <= 3) {
    return "夜间窗口";
  }
  return "日间窗口";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
