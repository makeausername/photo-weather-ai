import type {
  ClothingComfortLevel,
  ClothingGuide,
  ForecastTarget,
  NormalizedCurrentWeather,
  NormalizedHourlyWeather,
} from "@photo-weather/shared";
import { buildTerrainTemperatureBasisContext } from "@photo-weather/shared";
import { getHourInTimezone } from "@photo-weather/calendar";
import { precipitationAmountMm, precipitationRiskLevel } from "./weather-decision-metrics.js";

export type ClothingGuideInput = {
  readonly currentWeather?: NormalizedCurrentWeather;
  readonly hourlyWeather: readonly NormalizedHourlyWeather[];
  readonly elevationMeters?: number;
  readonly surroundingReliefMeters?: number;
  readonly terrainType?: string | null;
  readonly terrainMode?: string | null;
  readonly target: ForecastTarget;
  readonly timezone: string;
  readonly forecastStart: string;
};

export function buildClothingGuide(input: ClothingGuideInput): ClothingGuide {
  const reference = selectReferenceWeather(input);
  const referenceTime = hourlyReferenceTime(reference);
  const temperatureBasis = buildTerrainTemperatureBasisContext({
    rawGridTemperatureC: reference?.rawTemperature ?? reference?.temperature,
    terrainAdjustedTemperatureC:
      reference?.temperatureAdjustment?.terrainAdjustedTemperatureC ??
      reference?.elevationAdjustedTemperature,
    displayedTemperatureC: reference?.temperature,
    providerTemperatureC: reference?.temperature,
    elevationMeters: input.elevationMeters,
    modelElevationMeters:
      reference?.temperatureAdjustment?.providerElevationMeters ??
      reference?.providerElevationMeters,
    surroundingReliefMeters: input.surroundingReliefMeters,
    terrainType: input.terrainType,
    terrainMode: input.terrainMode,
    terrainConfidence:
      reference?.temperatureAdjustment?.providerElevationKnown === false ? "low" : undefined,
    windSpeedMs: reference?.windSpeed,
    windGustMs: reference?.windGust,
    humidityPercent: reference?.humidity,
    forecastHour: referenceTime ? getHourInTimezone(referenceTime, input.timezone) : undefined,
  });
  const referenceFeelsLike =
    typeof reference?.feelsLike === "number" && Number.isFinite(reference.feelsLike)
      ? reference.feelsLike
      : undefined;
  const selectedTemperature = temperatureBasis.displayTemperatureC ?? reference?.temperature;
  const temperature =
    selectedTemperature !== null &&
    selectedTemperature !== undefined &&
    referenceFeelsLike !== undefined
      ? Math.min(selectedTemperature, referenceFeelsLike)
      : selectedTemperature ?? referenceFeelsLike ?? 18;
  const windSpeed = reference?.windSpeed ?? 0;
  const windGust = reference?.windGust ?? windSpeed;
  const humidity = reference?.humidity ?? 60;
  const precipitationProbability = reference?.precipitationProbability ?? null;
  const precipitationAmount = precipitationAmountMm(reference);
  const precipitationRisk = precipitationRiskLevel({
    probability: precipitationProbability,
    amountMm: precipitationAmount,
  });
  const isMountain = temperatureBasis.isHighMountainTemperatureSensitive;
  const isNightTarget =
    input.target === "astro" || isNightTime(input.forecastStart, input.timezone);
  const effectiveTemperature = round1(
    temperature - (isMountain ? 2 : 0) - (isNightTarget ? 2 : 0) - Math.max(0, windSpeed - 4) * 0.6,
  );
  const comfortLevel = classifyComfort({
    effectiveTemperature,
    precipitationProbability,
    precipitationRisk,
    humidity,
    windSpeed: Math.max(windSpeed, windGust),
  });
  const layers = buildLayers(effectiveTemperature, isMountain, isNightTarget);
  const accessories = buildAccessories({
    comfortLevel,
    target: input.target,
    precipitationProbability,
    precipitationRisk,
    precipitationAmount,
    humidity,
    windSpeed,
    windGust,
    isMountain,
  });
  const riskNotes = buildRiskNotes({
    comfortLevel,
    target: input.target,
    precipitationProbability,
    precipitationRisk,
    precipitationAmount,
    humidity,
    windSpeed,
    windGust,
    isMountain,
    effectiveTemperature,
    temperatureBasisAdvice: temperatureBasis.clothingAdviceModifierZh,
  });

  return {
    titleZh: titleForComfort(comfortLevel, input.target),
    summaryZh: `参考体感约 ${Math.round(effectiveTemperature)}°C，风速约 ${round1(
      windSpeed,
    )} m/s，${precipitationSummary(precipitationProbability, precipitationAmount)}。${temperatureBasis.clothingAdviceModifierZh}${summarySuffix(
      comfortLevel,
      input.target,
    )}`,
    layers,
    accessories,
    riskNotes,
    comfortLevel,
  };
}

function hourlyReferenceTime(
  reference:
    | (NormalizedCurrentWeather & {
        readonly precipitationProbability?: number | null;
      })
    | NormalizedHourlyWeather
    | undefined,
): string | undefined {
  return reference && "time" in reference ? reference.time : undefined;
}

function selectReferenceWeather(input: ClothingGuideInput):
  | (NormalizedCurrentWeather & {
      readonly precipitationProbability?: number | null;
    })
  | NormalizedHourlyWeather
  | undefined {
  if (input.target !== "astro" && input.currentWeather) {
    return input.currentWeather;
  }

  const targetHours = input.hourlyWeather.filter((hour) => {
    const localHour = getHourInTimezone(hour.time, input.timezone);
    if (input.target === "astro") {
      return localHour >= 20 || localHour <= 5;
    }
    if (input.target === "cloud_sea") {
      return localHour >= 4 && localHour <= 9;
    }
    if (input.target === "glow") {
      return (localHour >= 4 && localHour <= 8) || (localHour >= 16 && localHour <= 20);
    }
    return true;
  });

  return targetHours[0] ?? input.currentWeather ?? input.hourlyWeather[0];
}

function classifyComfort(input: {
  readonly effectiveTemperature: number;
  readonly precipitationProbability: number | null;
  readonly precipitationRisk: ReturnType<typeof precipitationRiskLevel>;
  readonly humidity: number;
  readonly windSpeed: number;
}): ClothingComfortLevel {
  if (
    input.precipitationRisk === "medium" ||
    input.precipitationRisk === "high" ||
    input.precipitationRisk === "severe"
  ) {
    return "rainy";
  }
  if (input.windSpeed >= 8) {
    return "windy";
  }
  if (input.effectiveTemperature <= 0) {
    return "very_cold";
  }
  if (input.effectiveTemperature <= 10) {
    return "cold";
  }
  if (input.effectiveTemperature <= 16) {
    return "cool";
  }
  if (input.effectiveTemperature >= 30) {
    return "hot";
  }
  if (input.humidity >= 85 && input.effectiveTemperature >= 22) {
    return "humid";
  }
  return "comfortable";
}

function buildLayers(
  effectiveTemperature: number,
  isMountain: boolean,
  isNightTarget: boolean,
): readonly string[] {
  if (effectiveTemperature <= 0 || (isNightTarget && effectiveTemperature <= 6)) {
    return ["羽绒服或厚保暖外套", "抓绒或羊毛中层", "保暖内层"];
  }
  if (effectiveTemperature <= 10) {
    return ["薄羽绒或厚抓绒", "防风外套", "长裤保暖层"];
  }
  if (effectiveTemperature <= 15 || isMountain) {
    return ["软壳或薄羽绒", "抓绒中层", "防风长裤"];
  }
  if (effectiveTemperature >= 30) {
    return ["轻薄速干上衣", "透气长裤或防晒裤"];
  }
  return ["速干长袖或薄外套", "轻量中层备穿"];
}

function buildAccessories(input: {
  readonly comfortLevel: ClothingComfortLevel;
  readonly target: ForecastTarget;
  readonly precipitationProbability: number | null;
  readonly precipitationRisk: ReturnType<typeof precipitationRiskLevel>;
  readonly precipitationAmount: number | null;
  readonly humidity: number;
  readonly windSpeed: number;
  readonly windGust: number;
  readonly isMountain: boolean;
}): readonly string[] {
  const accessories = new Set<string>();

  if (
    input.target === "astro" ||
    input.comfortLevel === "cold" ||
    input.comfortLevel === "very_cold"
  ) {
    accessories.add("帽子");
    accessories.add("手套");
  }
  if (
    input.precipitationRisk !== "none" ||
    (input.precipitationProbability !== null && input.precipitationProbability >= 40) ||
    input.comfortLevel === "rainy"
  ) {
    accessories.add("防水外套");
    accessories.add("防滑鞋");
    accessories.add("备用干衣");
    accessories.add("干燥袋");
  }
  if (input.humidity >= 80 || input.target === "cloud_sea") {
    accessories.add("镜头布");
    accessories.add("防潮袋");
  }
  if (input.windSpeed >= 6 || input.windGust >= 9 || input.isMountain) {
    accessories.add("防风帽或头巾");
  }
  if (input.comfortLevel === "hot") {
    accessories.add("防晒帽");
    accessories.add("补水");
  }

  return [...accessories];
}

function buildRiskNotes(input: {
  readonly comfortLevel: ClothingComfortLevel;
  readonly target: ForecastTarget;
  readonly precipitationProbability: number | null;
  readonly precipitationRisk: ReturnType<typeof precipitationRiskLevel>;
  readonly precipitationAmount: number | null;
  readonly humidity: number;
  readonly windSpeed: number;
  readonly windGust: number;
  readonly isMountain: boolean;
  readonly effectiveTemperature: number;
  readonly temperatureBasisAdvice: string;
}): readonly string[] {
  const notes: string[] = [];

  if (input.target === "astro" && input.effectiveTemperature <= 10) {
    notes.push("夜间长时间等待会明显降温，建议按更低一档准备保暖。");
  }
  if (input.precipitationRisk !== "none") {
    notes.push("存在降水干扰，器材、备用衣物和存储卡需要防水收纳。");
  }
  if (input.humidity >= 82 || input.target === "cloud_sea") {
    notes.push("高湿环境注意防潮、防滑，并准备镜头布处理结露。");
  }
  if (input.windSpeed >= 6 || input.windGust >= 9) {
    notes.push("山顶阵风会放大体感寒冷，三脚架和人员站位需要留余量。");
  }
  if (input.windSpeed >= 8 || input.windGust >= 12) {
    notes.push("风力已接近影响长焦和慢门稳定的区间，建议准备三脚架配重。");
  }
  if (input.isMountain) {
    notes.push("高海拔机位早晚温差更明显，返程层也要保留。");
  }
  if (input.temperatureBasisAdvice) {
    notes.push(input.temperatureBasisAdvice);
  }

  return notes;
}

function titleForComfort(level: ClothingComfortLevel, target: ForecastTarget): string {
  if (target === "astro") {
    return level === "very_cold" || level === "cold" ? "夜间保暖优先" : "夜间防风保暖";
  }
  if (level === "rainy") {
    return "防雨防滑优先";
  }
  if (level === "windy") {
    return "防风层优先";
  }
  if (level === "hot") {
    return "轻薄防晒";
  }
  if (level === "cold" || level === "very_cold") {
    return "保暖防风";
  }
  if (level === "cool") {
    return "薄保暖层";
  }
  return "轻量分层";
}

function summarySuffix(level: ClothingComfortLevel, target: ForecastTarget): string {
  if (target === "cloud_sea") {
    return "云海机位湿度高，防潮和防滑比城市同温更重要。";
  }
  if (target === "astro") {
    return "星空拍摄等待时间长，保暖等级建议高于短暂停留。";
  }
  if (target === "glow") {
    return "日出日落前后风感更明显，建议分层穿脱。";
  }
  if (level === "hot") {
    return "白天出行注意防晒和补水。";
  }
  return "按分层穿法准备，方便随窗口变化调整。";
}

function precipitationSummary(probability: number | null, amount: number | null): string {
  const displayProbability =
    amount !== null && amount >= 0.1 && probability !== null && probability <= 0
      ? null
      : probability;
  if (displayProbability !== null && amount !== null) {
    return `降水概率约 ${Math.round(displayProbability)}%，预计 ${round1(amount)} mm`;
  }
  if (amount !== null && amount > 0) {
    return `预计降水 ${round1(amount)} mm`;
  }
  if (displayProbability !== null) {
    return `降水概率约 ${Math.round(displayProbability)}%`;
  }
  return "降水概率暂缺";
}

function isNightTime(time: string, timezone: string): boolean {
  if (!Number.isFinite(Date.parse(time))) {
    return false;
  }
  const hour = getHourInTimezone(time, timezone);
  return hour >= 20 || hour <= 5;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
