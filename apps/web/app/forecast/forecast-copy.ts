import {
  formatArrivalDeadlineZh,
  formatLocalTimeRange,
  simplifyWeatherSummaryZh,
  type ClothingGuide,
  type ForecastCalculationResult,
  type ForecastTimeWindow,
  type ForecastWatchableWindow,
  type ForecastWindowRecommendationLevel,
  type PhotographyPrecipitationRisk,
} from "@photo-weather/shared";

type DailySummary = ForecastCalculationResult["dailySummaries"][number];
type DailyWeather = NonNullable<DailySummary["weather"]>;
type TargetDailyBreakdown = ForecastCalculationResult["targetDailyBreakdown"][number];

type RainRiskWeather = {
  readonly weatherTextZh?: string | null;
  readonly weatherCode?: string | null;
  readonly temperature?: number | null;
  readonly terrainAdjustedTemperatureC?: number | null;
  readonly mountainFeelsLikeC?: number | null;
  readonly tempMin?: number | null;
  readonly tempMax?: number | null;
  readonly mountainFeelsLikeMin?: number | null;
  readonly mountainFeelsLikeMax?: number | null;
  readonly precipitationProbability?: number | null;
  readonly precipitationProbabilityPercent?: number | null;
  readonly precipitation?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationType?: DailyWeather["precipitationType"] | null;
  readonly precipitationRisk?: PhotographyPrecipitationRisk;
  readonly mainPrecipitationPeriodLabelZh?: string;
  readonly affectedPrecipitationWindows?: readonly string[];
  readonly maxRainRiskWindow?: string;
  readonly rainTimingConfidence?: DailyWeather["rainTimingConfidence"];
};

type PrecipitationKind = "rain" | "snow" | "mixed" | "unknown" | "none";

const MEANINGFUL_PRECIPITATION_AMOUNT_MM = 0.1;

type WindowCopyLike = Pick<
  ForecastTimeWindow,
  | "label"
  | "target"
  | "startTime"
  | "endTime"
  | "subjectPriorityLabel"
  | "lightPhase"
  | "practicalKind"
  | "weatherBlockers"
  | "recommendationLevel"
  | "windowLevel"
  | "copyReasonZh"
  | "practicalNoteZh"
  | "backupSubjectLabel"
  | "arrivalAdvice"
  | "precipitationRisk"
>;

export type RainRiskCopy = {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly timing: string;
  readonly level: "无明显" | "低" | "中" | "高" | "严重" | "待复核";
};

export function stripRepeatedCopyLabel(text: string | undefined, label: string): string {
  const trimmed = text?.trim();
  if (!trimmed) {
    return "";
  }

  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return trimmed.replace(new RegExp(`^(?:${escaped}\\s*[：:]\\s*)+`), "").trim();
}

export function rainRiskText(weather: RainRiskWeather | undefined): RainRiskCopy {
  const amount = precipitationAmount(weather);
  const probability = displayedPrecipitationProbability(weather, amount);
  const missingAmountSignal = hasMissingAmountPrecipitationSignal(weather, amount);
  const probabilityOnlySignal = hasProbabilityOnlyPrecipitationSignal(weather, amount, probability);
  const timing = rainTimingText(weather);
  const label = precipitationRiskLabel(weather);

  if (missingAmountSignal) {
    const signalWord = precipitationSignalWord(weather, amount);
    const probabilityText =
      typeof probability === "number" && Number.isFinite(probability)
        ? `，概率 ${Math.round(probability)}%`
        : "";
    return {
      label,
      value: `${signalWord}信号${probabilityText}，雨量待复核`,
      detail: `${precipitationSignalSourceText(
        weather,
        amount,
      )}，预计雨量暂缺，需复核短临雷达和实况。`,
      timing,
      level: "待复核",
    };
  }

  if (probabilityOnlySignal) {
    return {
      label,
      value: probabilityOnlyPrecipitationValue(probability, amount),
      detail: probabilityOnlyPrecipitationDetail(weather, probability, amount),
      timing,
      level: "待复核",
    };
  }

  const canUseRiskData = canUsePrecipitationRiskData(weather, amount);
  const level =
    (canUseRiskData ? explicitRainRiskLevel(weather?.precipitationRisk) : undefined) ??
    precipitationRiskLevel(probability, amount);
  const amountText = hasMeaningfulPrecipitationAmount(amount)
    ? `预计 ${formatMillimeters(amount)}`
    : "";
  const riskAmountConflictText = precipitationRiskAmountConflictsWithPrimary(weather, amount)
    ? "雨量证据不一致"
    : "";
  const nonMeaningfulAmountText =
    amount !== null &&
    !hasMeaningfulPrecipitationAmount(amount) &&
    (riskAmountConflictText || hasExplicitPrecipitationWeatherSignal(weather))
      ? `预计雨量 ${formatMillimeters(amount)}`
      : "";
  const probabilityText =
    typeof probability === "number" && Number.isFinite(probability)
      ? `概率 ${Math.round(probability)}%`
      : "";
  const valueParts = [level, amountText || probabilityText].filter(Boolean);
  const split = precipitationSplitText(weather);
  const riskAdvice = canUseRiskData ? weather?.precipitationRisk?.recommendationZh : undefined;
  const explicitWeatherSignalText = hasExplicitPrecipitationWeatherSignal(weather)
    ? `${precipitationSignalWord(weather, amount)}信号`
    : "";
  const detailParts = [
    level === "待复核" ? "降水概率暂缺" : `降水风险${level}`,
    explicitWeatherSignalText,
    amountText,
    nonMeaningfulAmountText,
    split,
    riskAmountConflictText,
    riskAdvice ?? timing,
  ].filter(Boolean);

  return {
    label,
    value: valueParts.join("，") || "待复核",
    detail: detailParts.join("，"),
    timing,
    level,
  };
}

export function compactPrecipitationDisplayText(weather: RainRiskWeather | undefined): string {
  const amount = precipitationAmount(weather);
  const probability = displayedPrecipitationProbability(weather, amount);

  if (hasMissingAmountPrecipitationSignal(weather, amount)) {
    return `${precipitationSignalWord(weather, amount)}信号，雨量待复核`;
  }

  if (hasProbabilityOnlyPrecipitationSignal(weather, amount, probability)) {
    return `${precipitationProbabilityLabel(weather, amount)}信号：${Math.round(
      probability ?? 0,
    )}%，雨量 ${formatCompactMillimeters(amount)}`;
  }

  if (typeof probability === "number" && Number.isFinite(probability)) {
    if (hasMeaningfulPrecipitationAmount(amount)) {
      const level = rainRiskText(weather).level;
      const riskLevel = level === "无明显" || level === "待复核" ? "低" : level;
      return `降水风险：${riskLevel}，概率 ${Math.round(probability)}%，预计 ${formatCompactMillimeters(
        amount,
      )}`;
    }
    if (amount !== null) {
      return `${precipitationProbabilityLabel(weather, amount)}：${Math.round(
        probability,
      )}%，雨量 ${formatCompactMillimeters(amount)}`;
    }
    return `${precipitationProbabilityLabel(weather, amount)}：${Math.round(probability)}%`;
  }

  if (hasMeaningfulPrecipitationAmount(amount)) {
    const level = rainRiskText(weather).level;
    const riskLevel = level === "无明显" || level === "待复核" ? "低" : level;
    return `降水风险：${riskLevel}，预计 ${formatCompactMillimeters(amount)}`;
  }

  if (hasExplicitPrecipitationWeatherSignal(weather) && amount === null) {
    return `${precipitationSignalWord(weather, amount)}信号，雨量待复核`;
  }

  if (hasPrecipitationSignal(weather, amount)) {
    return `${precipitationProbabilityLabel(weather, amount)}：暂无`;
  }

  if (amount === 0 || probability === 0) {
    return "降水不明显";
  }

  return "降水证据不足";
}

export function rainTimingText(weather: RainRiskWeather | undefined): string {
  const raw = stripRepeatedCopyLabel(weather?.mainPrecipitationPeriodLabelZh, "主要降水");
  const natural = naturalRainPeriod(raw);
  const amount = precipitationAmount(weather);
  const probability = displayedPrecipitationProbability(weather, amount);
  if (
    !hasExplicitPrecipitationWeatherSignal(weather) &&
    !hasMeaningfulPrecipitationAmount(amount) &&
    (typeof probability !== "number" || !Number.isFinite(probability))
  ) {
    return "降水概率和预计雨量均缺失，证据不足，无法判断降水时段。";
  }
  if (hasMissingAmountPrecipitationSignal(weather, amount)) {
    return `${precipitationSignalWord(
      weather,
      amount,
    )}信号明确但预计雨量暂缺，出发前复核短临雷达和实况。`;
  }

  if (hasProbabilityOnlyPrecipitationSignal(weather, amount, probability)) {
    return probabilityOnlyPrecipitationTiming(weather, probability, amount);
  }

  const canUseRiskData = canUsePrecipitationRiskData(weather, amount);
  const level =
    (canUseRiskData ? explicitRainRiskLevel(weather?.precipitationRisk) : undefined) ??
    precipitationRiskLevel(null, amount);
  const precipitationWord = precipitationTypeWord(weather);
  const disruptionWord =
    weather?.precipitationType === "snow"
      ? "降雪"
      : weather?.precipitationType === "mixed"
        ? "雨雪"
        : "降水";

  if (!natural) {
    if (hasMeaningfulPrecipitationAmount(amount)) {
      return `${precipitationWord}时段待复核，出发前看短临雷达和山顶实况。`;
    }
    return "降水不明显，重点观察云层开口和通透度。";
  }

  if (natural.includes("降水不明显")) {
    return "降水不明显，可把重点放在云层开口和通透度。";
  }

  if (/雨|雪|降水|雷达|复核|开口/.test(natural)) {
    return natural;
  }

  if (level === "严重" || level === "高") {
    return `${natural}${disruptionWord}干扰明显，建议把该时段降级为备选。`;
  }

  if (level === "中") {
    return `${natural}有间歇${precipitationWord}，可等待雨后短暂开口。`;
  }

  if (level === "低") {
    return `${natural}可能有零星${precipitationWord}，注意保护相机和滤镜。`;
  }

  return `${natural}降水信号较弱，出发前复核短临预报。`;
}

export function isProbabilityOnlyPrecipitationSignal(
  weather: RainRiskWeather | undefined,
): boolean {
  const amount = precipitationAmount(weather);
  const probability = displayedPrecipitationProbability(weather, amount);
  return hasProbabilityOnlyPrecipitationSignal(weather, amount, probability);
}

export function windowLabelText(window: WindowCopyLike | undefined): string {
  if (!window) {
    return "暂无高确定性拍摄窗口";
  }

  const raw = stripWindowTime(
    window.subjectPriorityLabel ?? window.label ?? fallbackWindowLabel(window.target),
  );
  const startHour = hourOf(window.startTime);

  if (window.target === "glow") {
    if (window.lightPhase === "blue_hour") {
      return "日落后余晖";
    }
    if (window.lightPhase === "sunset") {
      return raw.includes("晚霞") ? "晚霞" : "日落暖光";
    }
    if (typeof startHour === "number" && startHour >= 12) {
      if (raw.includes("朝霞")) {
        return "晚霞";
      }
      if (raw.includes("日出")) {
        return "日落暖光";
      }
    }
    if (window.lightPhase === "dawn" || window.lightPhase === "sunrise") {
      return raw.includes("晚霞") ? "朝霞" : raw || "朝霞";
    }
  }

  if (window.target === "astro" && (window.weatherBlockers?.length ?? 0) > 0) {
    return raw.includes("银河") ? "银河天文窗口" : "天文窗口";
  }

  if (window.target === "cloud_sea" && window.practicalKind === "formation_signal") {
    return "云雾变化";
  }
  if (window.target === "cloud_sea" && /晨雾|低云|云层变化/.test(raw)) {
    if (/开口|变化/.test(raw)) {
      return "晨雾或云层变化";
    }
    return "晨雾/低云";
  }

  return raw || window.label || fallbackWindowLabel(window.target);
}

export function recommendationLevelText(
  level: ForecastWindowRecommendationLevel | undefined,
): string {
  if (level === "recommended") {
    return "推荐拍摄";
  }
  if (level === "cautious") {
    return "可观察";
  }
  if (level === "backup") {
    return "仅作备选";
  }
  if (level === "not_recommended") {
    return "不建议";
  }
  return "仅作备选";
}

export function dedicatedTripText(summary: DailySummary): string {
  const advice = stripRepeatedCopyLabel(summary.dedicatedTripAdviceZh, "专程判断");
  if (advice) {
    return advice;
  }
  if (summary.dedicatedTripRecommendation) {
    return `${summary.dedicatedTripRecommendation}，${summary.shortAdvice}`;
  }
  return summary.shortAdvice;
}

export function nearbyObservationText(summary: DailySummary): string {
  const advice = stripRepeatedCopyLabel(summary.nearbyObservationAdviceZh, "附近观察");
  if (advice) {
    return advice;
  }
  if (summary.nearbyObservationRecommendation) {
    return `${summary.nearbyObservationRecommendation}，适合短时机位观察，不建议只押一个题材。`;
  }
  return "若已在附近，可结合现场云底高度、风向和雨隙决定是否短时等待。";
}

export function astroBlockedReasonText(
  window: Pick<ForecastTimeWindow, "weatherBlockers" | "target"> | undefined,
): string {
  const blockers = window?.target === "astro" ? window.weatherBlockers ?? [] : [];
  if (blockers.length === 0) {
    return "天文窗口仍需结合云量、月光、通透度和地面安全复核。";
  }
  return `有天文时间不等于能拍银河；当前主要受${blockers.slice(0, 2).join("、")}影响，不建议把银河作为唯一目标。`;
}

export function clothingEquipmentAdvice(guide: ClothingGuide): readonly string[] {
  const clothing = [guide.summaryZh, ...guide.layers.slice(0, 2)].filter(Boolean).join(" ");
  const equipment = [...guide.accessories.slice(0, 3), ...guide.riskNotes.slice(0, 2)].filter(
    Boolean,
  );

  return [
    clothing || guide.titleZh,
    equipment.length > 0
      ? `装备重点：${equipment.join("、")}。`
      : "装备重点：防风、防潮、头灯和备用电池。山地窗口不稳定时保留撤离时间。",
  ];
}

export function dailyCardActionSuggestion(options: {
  readonly summary: DailySummary;
  readonly breakdown?: TargetDailyBreakdown;
  readonly bestWindow?: ForecastTimeWindow;
  readonly timezone?: string;
}): string {
  const { summary, breakdown, bestWindow, timezone = "Asia/Shanghai" } = options;
  const weather = summary.weather;
  const rain = rainRiskText(weather);
  const whiteoutScore = breakdown?.whiteoutRisk?.score;
  const transparencyScore = breakdown?.transparency?.score;
  const gust = weather?.windGust;
  const nearbyOnly =
    summary.dedicatedTripRecommendation === "不建议专程前往" &&
    summary.nearbyObservationRecommendation === "已在附近可观察";
  const rainAffectsPriority =
    summary.rainOverlapsPriorityWindow === true || summary.rainNearPriorityWindow === true;

  if (rainAffectsPriority && summary.rainActionZh) {
    return summary.rainActionZh;
  }

  if (bestWindow) {
    const subject = windowLabelText(bestWindow);
    const windowTime = formatLocalTimeRange(bestWindow.startTime, bestWindow.endTime, timezone);
    const arrival = bestWindow.arrivalAdvice
      ? formatArrivalDeadlineZh(bestWindow.arrivalAdvice.recommendedArrivalTime, timezone)
      : "";
    const riskTail =
      typeof whiteoutScore === "number" && whiteoutScore >= 70
        ? "白墙风险高，现场先确认云雾上沿。"
        : rain.level === "高" || rain.level === "严重"
          ? "降水干扰明显，优先等待雨后短暂开口。"
          : typeof gust === "number" && gust >= 12
            ? "阵风偏强，三脚架和保暖要提前准备。"
            : typeof transparencyScore === "number" && transparencyScore < 50
              ? "通透度一般，优先准备中近景和云层纹理。"
              : "按窗口执行，现场重点复核云层开口和通透度。";

    if (bestWindow.target === "astro" && (bestWindow.weatherBlockers?.length ?? 0) > 0) {
      return `${subject} ${windowTime} 仅作天文时间参考；${astroBlockedReasonText(bestWindow)}`;
    }

    return [`优先关注${subject} ${windowTime}`, arrival, riskTail].filter(Boolean).join("；");
  }

  if (nearbyOnly) {
    return `${nearbyObservationText(summary)} ${rain.timing}`;
  }

  if (rain.level === "高" || rain.level === "严重") {
    return `${rain.timing} 不建议把这一天作为唯一目标，可等雨后短暂开口或转向近景。`;
  }

  if (typeof whiteoutScore === "number" && whiteoutScore >= 70) {
    return "白墙风险偏高，不建议专程押云海；已在山上可观察低云上沿和风向变化。";
  }

  return (
    stripRepeatedCopyLabel(summary.shortAdvice, "建议") ||
    "保留机位观察，把云层开口和通透度作为临场决策重点。"
  );
}

export function watchableWindowText(
  summary: Pick<DailySummary, "watchableWindows">,
  timezone = "Asia/Shanghai",
): string {
  const window = summary.watchableWindows?.[0];
  if (!window) {
    return "暂无明确可观察窗口";
  }
  const label = watchableWindowLabel(window);
  if (window.startTime && window.endTime) {
    return `${label} ${formatLocalTimeRange(window.startTime, window.endTime, timezone)}`;
  }
  return label;
}

export function bestShootableWindowText(
  summary: Pick<DailySummary, "bestShootableWindow">,
  timezone = "Asia/Shanghai",
): string {
  const window = summary.bestShootableWindow;
  if (!window) {
    return "暂无高确定性拍摄窗口";
  }
  return `${windowLabelText(window)} ${formatLocalTimeRange(
    window.startTime,
    window.endTime,
    timezone,
  )}`;
}

function watchableWindowLabel(window: ForecastWatchableWindow): string {
  return windowLabelText({
    label: window.subject ?? fallbackWindowLabel(window.target),
    subjectPriorityLabel: window.subject ?? fallbackWindowLabel(window.target),
    target: window.target,
    startTime: window.startTime ?? "",
    endTime: window.endTime ?? "",
    recommendationLevel: window.recommendationLevel,
    windowLevel: window.windowLevel,
  });
}

function fallbackWindowLabel(target: ForecastTimeWindow["target"]): string {
  if (target === "cloud_sea") {
    return "云雾变化";
  }
  if (target === "glow") {
    return "晨昏光线";
  }
  if (target === "astro") {
    return "天文窗口";
  }
  return "拍摄窗口";
}

function naturalRainPeriod(raw: string): string {
  return raw
    .replace(/夜间、上午/g, "夜间至上午")
    .replace(/上午、下午/g, "白天大部时段")
    .replace(/下午、夜间/g, "午后至夜间")
    .replace(/清晨、上午/g, "清晨至上午")
    .replace(/傍晚、夜间/g, "傍晚至夜间")
    .replace(/、/g, "至")
    .replace(/\s+/g, "")
    .trim();
}

function stripWindowTime(text: string | undefined): string {
  return (
    text
      ?.trim()
      .replace(/\s*\d{1,2}:\d{2}\s*[-–至到]\s*\d{1,2}:\d{2}\s*/g, "")
      .replace(/(?:观察)?窗口$/g, "")
      .trim() ?? ""
  );
}

function hourOf(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/T(\d{2}):/);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : undefined;
}

function explicitRainRiskLevel(
  risk: PhotographyPrecipitationRisk | undefined,
): RainRiskCopy["level"] | undefined {
  if (!risk) {
    return undefined;
  }
  if (risk.rainRiskLevel === "severe") {
    return "严重";
  }
  if (risk.rainRiskLevel === "high") {
    return "高";
  }
  if (risk.rainRiskLevel === "medium") {
    return "中";
  }
  if (risk.rainRiskLevel === "low") {
    return "低";
  }
  return "无明显";
}

function precipitationRiskLabel(weather: RainRiskWeather | undefined): string {
  if (weather?.precipitationType === "snow") {
    return "降雪风险";
  }
  if (weather?.precipitationType === "mixed") {
    return "雨雪风险";
  }
  return "降水风险";
}

function hasMeaningfulPrecipitationAmount(amount: number | null | undefined): boolean {
  return (
    typeof amount === "number" &&
    Number.isFinite(amount) &&
    amount >= MEANINGFUL_PRECIPITATION_AMOUNT_MM
  );
}

function canUsePrecipitationRiskData(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): boolean {
  return (
    Boolean(weather?.precipitationRisk) &&
    hasPrimaryConfirmedPrecipitationEvidence(weather, amount) &&
    !precipitationRiskAmountConflictsWithPrimary(weather, amount)
  );
}

function hasPrimaryConfirmedPrecipitationEvidence(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): boolean {
  if (!weather) {
    return false;
  }
  return (
    hasMeaningfulPrecipitationAmount(amount) ||
    hasMeaningfulPrecipitationAmount(weather.rainAmountMm) ||
    hasMeaningfulPrecipitationAmount(weather.snowAmountMm) ||
    hasExplicitPrecipitationWeatherSignal(weather) ||
    hasMissingAmountPrecipitationSignal(weather, amount)
  );
}

function hasMissingAmountPrecipitationSignal(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): boolean {
  if (!weather || amount !== null) {
    return false;
  }
  return hasExplicitPrecipitationWeatherSignal(weather) || hasPrecipitationTypeSignal(weather);
}

function hasPrecipitationTypeSignal(weather: RainRiskWeather | undefined): boolean {
  return (
    weather?.precipitationType === "rain" ||
    weather?.precipitationType === "snow" ||
    weather?.precipitationType === "mixed"
  );
}

function precipitationRiskAmountConflictsWithPrimary(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): boolean {
  const riskAmount = weather?.precipitationRisk?.precipitationAmountMm;
  if (
    amount === null ||
    typeof riskAmount !== "number" ||
    !Number.isFinite(riskAmount)
  ) {
    return false;
  }

  const primaryIsMeaningful = hasMeaningfulPrecipitationAmount(amount);
  const riskIsMeaningful = hasMeaningfulPrecipitationAmount(riskAmount);
  if (primaryIsMeaningful !== riskIsMeaningful) {
    return true;
  }
  if (!primaryIsMeaningful && !riskIsMeaningful) {
    return false;
  }
  return Math.abs(riskAmount - amount) >= MEANINGFUL_PRECIPITATION_AMOUNT_MM;
}

function hasProbabilityOnlyPrecipitationSignal(
  weather: RainRiskWeather | undefined,
  amount: number | null,
  probability: number | null | undefined,
): boolean {
  if (
    !weather ||
    typeof probability !== "number" ||
    !Number.isFinite(probability) ||
    probability <= 0
  ) {
    return false;
  }

  if (hasMeaningfulPrecipitationAmount(amount)) {
    return false;
  }

  if (hasPrimaryConfirmedPrecipitationEvidence(weather, amount)) {
    return false;
  }

  if (hasSupportingPrecipitationRiskData(weather)) {
    return false;
  }

  return true;
}

function probabilityOnlyPrecipitationValue(
  probability: number | null | undefined,
  amount: number | null,
): string {
  const probabilityText =
    typeof probability === "number" && Number.isFinite(probability)
      ? `降水概率 ${Math.round(probability)}%`
      : "降水概率信号";
  const amountText = amount === null ? "预计雨量待复核" : `预计雨量 ${formatMillimeters(amount)}`;
  return `${probabilityText}，${amountText}`;
}

function probabilityOnlyPrecipitationDetail(
  weather: RainRiskWeather | undefined,
  probability: number | null | undefined,
  amount: number | null,
): string {
  const probabilityText =
    typeof probability === "number" && Number.isFinite(probability)
      ? ` ${Math.round(probability)}%`
      : "";
  const amountText =
    amount === null ? "预计雨量待复核" : `预计雨量 ${formatMillimeters(amount)}`;
  const consistencyText = precipitationRiskAmountConflictsWithPrimary(weather, amount)
    ? "雨量证据不一致，"
    : "";
  const affectedText = probabilityOnlyAffectedWindowsText(weather);
  return [
    `降水概率信号${probabilityText}，${amountText}，${consistencyText}需复核短临雷达和实况。`,
    "暂不按确定降水处理。",
    "不直接判定为降水干扰。",
    affectedText,
  ]
    .filter(Boolean)
    .join("");
}

function probabilityOnlyPrecipitationTiming(
  weather: RainRiskWeather | undefined,
  probability: number | null | undefined,
  amount: number | null,
): string {
  const probabilityText =
    typeof probability === "number" && Number.isFinite(probability)
      ? `降水概率 ${Math.round(probability)}%`
      : "降水概率信号";
  const amountText = amount === null ? "预计雨量待复核" : `预计雨量 ${formatMillimeters(amount)}`;
  const consistencyText = precipitationRiskAmountConflictsWithPrimary(weather, amount)
    ? "雨量证据不一致"
    : "降水信号不一致";
  const affectedText = probabilityOnlyAffectedWindowsText(weather);
  return [
    `${probabilityText}，${amountText}；${consistencyText}，暂不按确定降水处理，出发前复核短临雷达和实况。`,
    affectedText,
  ]
    .filter(Boolean)
    .join("");
}

function probabilityOnlyAffectedWindowsText(weather: RainRiskWeather | undefined): string {
  const affectedWindows =
    weather?.precipitationRisk?.affectedWindows.filter((window) => window.trim().length > 0) ?? [];
  if (affectedWindows.length === 0) {
    return "";
  }
  return `可能受降水概率信号影响的时段：${affectedWindows.slice(0, 3).join("、")}，需复核。`;
}

function hasSupportingPrecipitationRiskData(weather: RainRiskWeather | undefined): boolean {
  return (
    canUsePrecipitationRiskData(weather, precipitationAmount(weather)) &&
    hasMeaningfulPrecipitationAmount(weather?.precipitationRisk?.precipitationAmountMm)
  );
}

function precipitationRiskLevel(
  probability: number | null | undefined,
  amount: number | null,
): RainRiskCopy["level"] {
  const probabilityValue =
    typeof probability === "number" && Number.isFinite(probability) ? probability : 0;
  const amountValue = amount ?? 0;
  if (amount === null && probability === null) {
    return "待复核";
  }
  if (amountValue >= 25) {
    return "严重";
  }
  if (amountValue >= 10 || probabilityValue >= 70) {
    return "高";
  }
  if (amountValue >= 2 || probabilityValue >= 40) {
    return "中";
  }
  if (amountValue >= 0.3 || probabilityValue >= 20) {
    return "低";
  }
  return "无明显";
}

function displayedPrecipitationProbability(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): number | null {
  const candidates = [
    weather?.precipitationProbability,
    weather?.precipitationProbabilityPercent,
    weather?.precipitationRisk?.precipitationProbabilityPercent,
  ];

  for (const probability of candidates) {
    if (typeof probability !== "number" || !Number.isFinite(probability)) {
      continue;
    }
    if (hasMeaningfulPrecipitationAmount(amount) && probability <= 0) {
      continue;
    }
    return probability;
  }

  return null;
}

function precipitationAmount(weather: RainRiskWeather | undefined): number | null {
  if (!weather) {
    return null;
  }
  if (
    typeof weather.precipitationAmountMm === "number" &&
    Number.isFinite(weather.precipitationAmountMm)
  ) {
    return weather.precipitationAmountMm;
  }
  if (typeof weather.precipitation === "number" && Number.isFinite(weather.precipitation)) {
    return weather.precipitation;
  }
  const split = [weather.rainAmountMm, weather.snowAmountMm].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return split.length > 0 ? split.reduce((sum, value) => sum + value, 0) : null;
}

function precipitationSplitText(weather: RainRiskWeather | undefined): string {
  const rain = weather?.rainAmountMm;
  const snow = weather?.snowAmountMm;
  return [
    hasMeaningfulPrecipitationAmount(rain) ? `降雨 ${formatMillimeters(rain)}` : "",
    hasMeaningfulPrecipitationAmount(snow) ? `降雪 ${formatMillimeters(snow)}` : "",
  ]
    .filter(Boolean)
    .join("，");
}

function precipitationSignalWord(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): string {
  const kind = inferPrecipitationKind(weather, amount);
  if (kind === "snow") {
    return "降雪";
  }
  if (kind === "rain") {
    return "降雨";
  }
  if (kind === "mixed") {
    return "雨雪";
  }
  return "降水";
}

function precipitationSignalSourceText(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): string {
  const signalWord = precipitationSignalWord(weather, amount);
  if (hasExplicitPrecipitationWeatherSignal(weather)) {
    return `${signalWord}来自天气文本或天气代码`;
  }
  if (hasMissingAmountPrecipitationSignal(weather, amount)) {
    return `${signalWord}来自降水类型`;
  }
  return `${signalWord}信号`;
}

function precipitationTypeWord(weather: RainRiskWeather | undefined): string {
  if (weather?.precipitationType === "snow") {
    return "降雪";
  }
  if (weather?.precipitationType === "mixed") {
    return "雨雪";
  }
  return "小雨";
}

function precipitationProbabilityLabel(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): string {
  const kind = inferPrecipitationKind(weather, amount);
  if (kind === "snow") {
    return "降雪概率";
  }
  if (kind === "rain") {
    return "降雨概率";
  }
  if (kind === "mixed") {
    return "雨雪概率";
  }
  return "降水概率";
}

function inferPrecipitationKind(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): PrecipitationKind {
  if (!weather) {
    return "none";
  }

  const hasRainAmount = positiveAmount(weather.rainAmountMm);
  const hasSnowAmount = positiveAmount(weather.snowAmountMm);
  const text = simplifyWeatherSummaryZh(weather.weatherTextZh) ?? "";
  const hasMixedSignal = hasRainAmount && hasSnowAmount;
  const hasMixedText = /雨夹雪|雨雪|冻雨|冰雨/.test(text);
  const hasSnowSignal =
    hasSnowAmount || weatherTextIndicatesSnow(text) || codeIndicatesSnow(weather.weatherCode);
  const hasRainSignal =
    hasRainAmount || weatherTextIndicatesRain(text) || codeIndicatesRain(weather.weatherCode);
  const precipitationExists = hasPrecipitationSignal(weather, amount);

  if (weather.precipitationType === "mixed" || hasMixedSignal || hasMixedText) {
    return "mixed";
  }
  if (weather.precipitationType === "snow") {
    return "snow";
  }
  if (weather.precipitationType === "rain") {
    return "rain";
  }
  if (precipitationExists && isClearlyBelowFreezing(weather)) {
    return "snow";
  }
  if (hasSnowSignal) {
    return "snow";
  }
  if (hasRainSignal) {
    return "rain";
  }
  if (weather.precipitationType === "none" && !precipitationExists) {
    return "none";
  }
  return precipitationExists ? "unknown" : "none";
}

function hasPrecipitationSignal(
  weather: RainRiskWeather | undefined,
  amount: number | null,
): boolean {
  if (!weather) {
    return false;
  }
  return hasPrimaryConfirmedPrecipitationEvidence(weather, amount);
}

function hasExplicitPrecipitationWeatherSignal(weather: RainRiskWeather | undefined): boolean {
  if (!weather) {
    return false;
  }
  const text = simplifyWeatherSummaryZh(weather.weatherTextZh) ?? weather.weatherTextZh ?? "";
  return (
    weatherTextIndicatesRain(text) ||
    weatherTextIndicatesSnow(text) ||
    codeIndicatesRain(weather.weatherCode) ||
    codeIndicatesSnow(weather.weatherCode)
  );
}

function weatherTextIndicatesRain(text: string): boolean {
  return /雨|阵雨|雷暴|雷阵雨|毛毛雨|降雨/.test(text);
}

function weatherTextIndicatesSnow(text: string): boolean {
  return /雪|霰|冰粒|降雪|暴风雪/.test(text);
}

function codeIndicatesRain(code: string | null | undefined): boolean {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (/rain|drizzle|shower|thunderstorm/.test(normalized)) {
    return true;
  }
  const numericCode = numericWeatherCode(normalized);
  if (numericCode === null) {
    return false;
  }
  return (
    (numericCode >= 51 && numericCode <= 67) ||
    (numericCode >= 80 && numericCode <= 82) ||
    (numericCode >= 95 && numericCode <= 99) ||
    (numericCode >= 300 && numericCode <= 399)
  );
}

function codeIndicatesSnow(code: string | null | undefined): boolean {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (/snow|sleet|blizzard|flurr/.test(normalized)) {
    return true;
  }
  const numericCode = numericWeatherCode(normalized);
  if (numericCode === null) {
    return false;
  }
  return (
    numericCode === 77 ||
    (numericCode >= 71 && numericCode <= 75) ||
    (numericCode >= 85 && numericCode <= 86) ||
    (numericCode >= 400 && numericCode <= 499)
  );
}

function numericWeatherCode(code: string): number | null {
  const match = code.match(/\d+/);
  if (!match) {
    return null;
  }
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

function isClearlyBelowFreezing(weather: RainRiskWeather): boolean {
  if (typeof weather.tempMax === "number" && Number.isFinite(weather.tempMax)) {
    return weather.tempMax <= 0;
  }
  const temperatures = [
    weather.terrainAdjustedTemperatureC,
    weather.temperature,
    weather.mountainFeelsLikeC,
    weather.mountainFeelsLikeMax,
    weather.mountainFeelsLikeMin,
    weather.tempMin,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return temperatures.length > 0 && Math.max(...temperatures) <= 0;
}

function formatMillimeters(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "待复核";
  }
  return `${roundDisplay(value)} mm`;
}

function formatCompactMillimeters(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "待复核";
  }
  return `${roundDisplay(value)}mm`;
}

function positiveAmount(value: number | null | undefined): boolean {
  return hasMeaningfulPrecipitationAmount(value);
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
