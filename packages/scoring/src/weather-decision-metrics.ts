import type {
  ElevationTemperatureAdjustment,
  ExposedRidgeWindRisk,
  NormalizedCurrentWeather,
  NormalizedDailyWeather,
  NormalizedHourlyWeather,
  PrecipitationType,
  TerrainAnalysisSummary,
  TransparencyGrade,
} from "@photo-weather/shared";
import { clampScore } from "./helpers.js";

export type PrecipitationRiskLevel = "none" | "low" | "medium" | "high" | "heavy";

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
const assumedUnknownProviderElevationMeters = 800;
const elevationCloseEnoughMeters = 150;
const minimumMeaningfulCorrectionMeters = 100;

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
    return "heavy";
  }
  if (amount >= 10 || (finiteNumber(probability) && probability >= 75)) {
    return "high";
  }
  if (amount >= 2 || (finiteNumber(probability) && probability >= 55)) {
    return "medium";
  }
  if (amount >= 0.1 || (finiteNumber(probability) && probability >= 25)) {
    return "low";
  }
  return "none";
}

export function precipitationRiskScore(input: {
  readonly probability?: number | null;
  readonly amountMm?: number | null;
}): number {
  const probabilityScore = finiteNumber(input.probability) ? input.probability : 0;
  const amount = input.amountMm ?? 0;
  const amountScore =
    amount >= 25 ? 100 : amount >= 10 ? 86 : amount >= 2 ? 62 : amount >= 0.1 ? 34 : 0;
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
    existing: hour.temperatureAdjustment,
  });
  if (!adjustment.correctionApplied) {
    return hour;
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
    existing: weather.temperatureAdjustment,
  });
  if (!adjustment.correctionApplied) {
    return weather;
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
  const adjustment = buildTemperatureAdjustment((day.tempMin + day.tempMax) / 2, {
    spotElevationMeters,
    providerElevationMeters: day.providerElevationMeters,
    existing: day.temperatureAdjustment,
  });
  if (!adjustment.correctionApplied) {
    return day;
  }

  return {
    ...day,
    rawTempMin: day.rawTempMin ?? day.tempMin,
    rawTempMax: day.rawTempMax ?? day.tempMax,
    tempMin: round1(day.tempMin - adjustment.correctionCelsius),
    tempMax: round1(day.tempMax - adjustment.correctionCelsius),
    elevationAdjustedTempMin: round1(day.tempMin - adjustment.correctionCelsius),
    elevationAdjustedTempMax: round1(day.tempMax - adjustment.correctionCelsius),
    temperatureAdjustment: {
      correctionApplied: adjustment.correctionApplied,
      correctionMeters: adjustment.correctionMeters,
      correctionCelsius: adjustment.correctionCelsius,
      lapseRateCelsiusPer100m: adjustment.lapseRateCelsiusPer100m,
      providerElevationMeters: adjustment.providerElevationMeters,
    },
    estimatedFields: unique([...(day.estimatedFields ?? []), "temperatureElevationCorrection"]),
  };
}

function buildTemperatureAdjustment(
  rawTemperature: number,
  input: {
    readonly spotElevationMeters: number;
    readonly providerElevationMeters?: number;
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
      providerElevationMeters: input.existing.providerElevationMeters,
    };
  }

  const providerElevationMeters =
    input.providerElevationMeters ??
    (input.spotElevationMeters >= 900 ? assumedUnknownProviderElevationMeters : undefined);
  const correctionMeters = Math.max(0, input.spotElevationMeters - (providerElevationMeters ?? 0));
  const correctionApplied =
    correctionMeters >= minimumMeaningfulCorrectionMeters &&
    Math.abs(input.spotElevationMeters - (providerElevationMeters ?? 0)) >
      elevationCloseEnoughMeters;
  const correctionCelsius = correctionApplied
    ? round1((correctionMeters / 100) * defaultLapseRateCelsiusPer100m)
    : 0;

  return {
    rawTemperature,
    elevationAdjustedTemperature: round1(rawTemperature - correctionCelsius),
    correctionApplied,
    correctionMeters: Math.round(correctionMeters),
    correctionCelsius,
    lapseRateCelsiusPer100m: defaultLapseRateCelsiusPer100m,
    providerElevationMeters: input.providerElevationMeters,
  };
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

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
