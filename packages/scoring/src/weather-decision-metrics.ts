import type {
  ElevationTemperatureAdjustment,
  ExposedRidgeWindRisk,
  NormalizedCurrentWeather,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  PhotographyPrecipitationRisk,
  PrecipitationType,
  TerrainAnalysisSummary,
  TransparencyGrade,
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
const maxVeryHighTerrainUnknownProviderCoolingCelsius = 4.5;
const maxUnknownProviderNightCoolingCelsius = 2.8;
const maxVeryHighTerrainUnknownProviderNightCoolingCelsius = 3;
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
  const weatherText = input.weatherTextZh ? `${input.weatherTextZh}，` : "";
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
}): ExposedRidgeWindRisk {
  const wind = input.windSpeed ?? 0;
  const gust = input.windGust ?? wind;
  const isHighMountain = (input.elevationMeters ?? 0) >= 1200;
  if (wind >= 8 || gust >= 12 || (isHighMountain && gust >= 10)) {
    return "high";
  }
  if (wind >= 5 || gust >= 8 || (isHighMountain && wind >= 4)) {
    return "medium";
  }
  return "low";
}

export function applyMountainWeatherAdjustments(
  input: WeatherAdjustmentInput,
): WeatherAdjustmentResult {
  const elevationMeters = input.terrainAnalysis.terrainProfile.locationElevation;
  const hourlyWeather = input.hourlyWeather.map((hour) =>
    annotateDecisionWeather(adjustHourlyTemperature(hour, elevationMeters), elevationMeters),
  );
  const currentWeather = input.currentWeather
    ? annotateDecisionCurrent(
        adjustCurrentTemperature(input.currentWeather, elevationMeters),
        elevationMeters,
      )
    : undefined;
  const dailyWeather = input.dailyWeather.map((day) =>
    annotateDecisionDaily(adjustDailyTemperature(day, elevationMeters), elevationMeters),
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
  if (!adjustment.correctionApplied) {
    return {
      ...hour,
      rawTemperature: hour.rawTemperature ?? adjustment.rawTemperature,
      elevationAdjustedTemperature: adjustment.elevationAdjustedTemperature,
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
      elevationAdjustedTemperature: input.existing.elevationAdjustedTemperature ?? rawTemperature,
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
    const correctionCelsius = round1((correctionMeters / 100) * defaultLapseRateCelsiusPer100m);
    return temperatureAdjustmentResult(rawTemperature, {
      spotElevationMeters: input.spotElevationMeters,
      providerElevationMeters,
      providerElevationKnown: true,
      correctionReason: "provider_elevation_delta_beyond_threshold",
      correctionMeters,
      correctionCelsius,
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
  },
): ElevationTemperatureAdjustment {
  const correctionMeters = Math.max(0, Math.round(input.correctionMeters ?? 0));
  const correctionCelsius = round1(Math.max(0, input.correctionCelsius ?? 0));
  const correctionApplied = correctionMeters > 0 && correctionCelsius > 0;

  return {
    rawTemperature,
    elevationAdjustedTemperature: round1(rawTemperature - correctionCelsius),
    correctionApplied,
    correctionMeters,
    correctionCelsius,
    lapseRateCelsiusPer100m: defaultLapseRateCelsiusPer100m,
    selectedSpotElevationMeters: Math.round(input.spotElevationMeters),
    providerElevationMeters: input.providerElevationMeters,
    providerElevationKnown: input.providerElevationKnown,
    correctionReason: input.correctionReason,
  };
}

function providerHasTerrainAwareDemoValues(providerCode: string): boolean {
  return /^mock/i.test(providerCode) || providerCode.includes("mock");
}

function annotateDecisionWeather(
  hour: NormalizedHourlyWeather,
  elevationMeters: number,
): NormalizedHourlyWeather {
  const transparencyScore = calculatePhotographyTransparencyScore(hour);
  const windRisk = exposedRidgeWindRisk({
    elevationMeters,
    windSpeed: hour.windSpeed,
    windGust: hour.windGust,
  });

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
  };
}

function annotateDecisionCurrent(
  weather: NormalizedCurrentWeather,
  elevationMeters: number,
): NormalizedCurrentWeather {
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
    exposedRidgeWindRisk: exposedRidgeWindRisk({
      elevationMeters,
      windSpeed: weather.windSpeed,
      windGust: weather.windGust,
    }),
  };
}

function annotateDecisionDaily(
  day: NormalizedDailyWeather,
  elevationMeters: number,
): NormalizedDailyWeather {
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
    exposedRidgeWindRisk: exposedRidgeWindRisk({
      elevationMeters,
      windSpeed: day.windSpeed,
      windGust: day.windGust,
    }),
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
