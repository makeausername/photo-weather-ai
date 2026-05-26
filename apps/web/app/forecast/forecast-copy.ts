import {
  formatArrivalDeadlineZh,
  formatShootingWindowZh,
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
  readonly precipitationProbability?: number | null;
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
  const level =
    explicitRainRiskLevel(weather?.precipitationRisk) ??
    precipitationRiskLevel(probability, amount);
  const amountText = amount !== null && amount > 0 ? `预计 ${formatMillimeters(amount)}` : "";
  const probabilityText =
    typeof probability === "number" && Number.isFinite(probability)
      ? `概率 ${Math.round(probability)}%`
      : "";
  const valueParts = [level, amountText || probabilityText].filter(Boolean);
  const split = precipitationSplitText(weather);
  const timing = rainTimingText(weather);
  const riskAdvice = weather?.precipitationRisk?.recommendationZh;
  const detailParts = [
    level === "待复核" ? "降水概率暂缺" : `降水风险${level}`,
    amountText,
    split,
    riskAdvice ?? timing,
  ].filter(Boolean);

  return {
    label:
      weather?.precipitationType === "snow"
        ? "降雪风险"
        : weather?.precipitationType === "mixed"
          ? "雨雪风险"
          : "降水风险",
    value: valueParts.join("，") || "待复核",
    detail: detailParts.join("，"),
    timing,
    level,
  };
}

export function rainTimingText(weather: RainRiskWeather | undefined): string {
  const raw = stripRepeatedCopyLabel(weather?.mainPrecipitationPeriodLabelZh, "主要降水");
  const natural = naturalRainPeriod(raw);
  const amount = precipitationAmount(weather);
  const level =
    explicitRainRiskLevel(weather?.precipitationRisk) ?? precipitationRiskLevel(null, amount);
  const precipitationWord = precipitationTypeWord(weather);
  const disruptionWord =
    weather?.precipitationType === "snow"
      ? "降雪"
      : weather?.precipitationType === "mixed"
        ? "雨雪"
        : "降水";

  if (!natural) {
    if (amount !== null && amount > 0) {
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

export function windowLabelText(window: WindowCopyLike | undefined): string {
  if (!window) {
    return "暂无高确定性拍摄窗口";
  }

  const raw = stripWindowTime(window.subjectPriorityLabel ?? window.label);
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
    return "云海形成信号";
  }

  return raw || window.label;
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

  if (bestWindow) {
    const subject = windowLabelText(bestWindow);
    const windowTime = formatShootingWindowZh(bestWindow, timezone);
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
    return `${label} ${formatShootingWindowZh(
      {
        startTime: window.startTime,
        endTime: window.endTime,
      },
      timezone,
    )}`;
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
  return `${windowLabelText(window)} ${formatShootingWindowZh(window, timezone)}`;
}

function watchableWindowLabel(window: ForecastWatchableWindow): string {
  return windowLabelText({
    label: window.subject,
    subjectPriorityLabel: window.subject,
    target: window.target,
    startTime: window.startTime ?? "",
    endTime: window.endTime ?? "",
    recommendationLevel: window.recommendationLevel,
    windowLevel: window.windowLevel,
  });
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

function stripWindowTime(text: string): string {
  return text.replace(/\s*\d{1,2}:\d{2}\s*[-–至到]\s*\d{1,2}:\d{2}\s*/g, "").trim();
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
  const probability = weather?.precipitationProbability;
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    return null;
  }
  if (amount !== null && amount >= 0.1 && probability <= 0) {
    return null;
  }
  return probability;
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
    typeof rain === "number" && rain > 0 ? `降雨 ${formatMillimeters(rain)}` : "",
    typeof snow === "number" && snow > 0 ? `降雪 ${formatMillimeters(snow)}` : "",
  ]
    .filter(Boolean)
    .join("，");
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

function formatMillimeters(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "待复核";
  }
  return `${roundDisplay(value)} mm`;
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}
