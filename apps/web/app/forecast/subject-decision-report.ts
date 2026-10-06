import {
  localDateKey,
  prioritizeForecastRisks,
  type ForecastCalculationResult,
} from "@photo-weather/shared";
import type {
  AstroForecastViewModel,
  CloudSeaForecastViewModel,
  GlowDailyOpportunitySlot,
  GlowForecastViewModel,
} from "./forecast-result-view-model";
import { normalizeForecastPublicCopyText } from "./forecast-copy-polish";
import { photographyEvidence } from "./photography-evidence";

export type SubjectReportTarget = "cloud_sea" | "glow" | "astro";
export type SubjectReportSection = {
  readonly title: string;
  readonly lines: readonly string[];
};
export type SubjectDecisionReport = {
  readonly target: SubjectReportTarget;
  readonly title: string;
  readonly verdict: string;
  readonly reason: string;
  readonly timing: string;
  readonly arrival: string;
  readonly caution?: string;
  readonly datesTitle: string;
  readonly dates: readonly SubjectReportSection[];
  readonly shooting: SubjectReportSection;
  readonly risks: SubjectReportSection;
};

function lines(...values: (string | undefined | null)[]): string[] {
  return [
    ...new Set(
      values.map((value) => normalizeForecastPublicCopyText(value?.trim() ?? "")).filter(Boolean),
    ),
  ];
}

function conclusion(text: string, count = 1): string {
  return lines(
    ...text
      .split(/(?<=[。！？])/)
      .filter((sentence) => !/评分|得分|\d+\s*分[。；]|强推荐专程仅在/.test(sentence)),
  )
    .slice(0, count)
    .join("");
}

function astroRisk(text: string): string {
  if (/优先级|标为推荐|评分|得分/.test(text)) return "";
  return text
    .split(/[，；]/)
    .filter((part) => !/\d+(?:\.\d+)?%/.test(part))
    .join("，");
}

function direction(text: string): string {
  return text.replace(/\s*·?\s*高度\s*[\d.]+°/g, "");
}

function unavailable(result: ForecastCalculationResult): boolean {
  return (
    result.weatherDataMode !== "real" ||
    result.isMock ||
    result.weatherEvidenceStatus === "insufficient" ||
    result.weatherEvidenceStatus === "stale" ||
    result.weatherDataFreshness === "stale"
  );
}

function finish(
  result: ForecastCalculationResult,
  report: SubjectDecisionReport,
): SubjectDecisionReport {
  if (unavailable(result)) {
    return {
      ...report,
      verdict: "资料不足，暂不安排专程",
      reason:
        result.weatherEvidenceReasonZh || "当前没有足够的新鲜天气资料，不能确认这次是否值得去。",
      timing: "可拍时段待确认",
      arrival: "等预报更新后再安排交通和到场时间。",
      caution: "旧资料或示例数据不能作为出行依据。",
      dates: [],
      shooting: { title: report.shooting.title, lines: ["具体机位、朝向和拍摄安排待确认。"] },
      risks: { title: report.risks.title, lines: ["出发前重新查询，并核对当地预警与现场条件。"] },
    };
  }
  const evidence = photographyEvidence(result);
  // A general report can feed a subject deep link; its overall travel verdict
  // is not the selected subject's verdict. Evidence freshness still applies.
  const sameTarget = result.target === report.target;
  const waiting =
    sameTarget && ["data_insufficient", "wait_for_update"].includes(result.decisionMode ?? "");
  const noTrip =
    sameTarget &&
    (result.decisionMode === "not_recommended" ||
      result.finalRecommendationLevel === "not_recommended");
  const restricted = waiting || noTrip || evidence.review;
  const riskLines = prioritizeForecastRisks(result.riskFlags ?? [])
    .filter((risk) => risk.level === "high")
    .map((risk) => risk.description);
  return {
    ...report,
    verdict: waiting
      ? "先观望，等资料补齐"
      : noTrip
        ? "不建议专程前往"
        : evidence.review
          ? "先观望，拍摄条件需复核"
          : report.verdict,
    reason: waiting
      ? "关键拍摄条件尚未确认，先等资料更新再做出行决定。"
      : noTrip
        ? /^(不|暂不|仅|先|谨慎)/.test(report.verdict)
          ? report.reason
          : "当前天气和出行条件不足以支持专程，已在附近可按下方条件观察。"
        : evidence.review
          ? evidence.note || "天气资料存在分歧，当前机会暂不能作为出行依据。"
          : report.reason,
    timing: restricted ? "可执行的拍摄时段待复核；下方日期只作条件观察。" : report.timing,
    arrival: restricted ? "暂不按参考窗口安排专程；先核对临近预报和现场条件。" : report.arrival,
    caution: lines(evidence.note, report.caution).join("；") || undefined,
    dates: restricted
      ? report.dates.map((day) => ({
          ...day,
          title: `${day.title} · 观察参考`,
          lines: day.lines.map((line) =>
            line.replace(
              /(?<!不)(?:强推荐专程|值得专程|推荐前往|建议专程|可以专程)/g,
              "仅供观察，先不专程",
            ),
          ),
        }))
      : report.dates,
    risks: { ...report.risks, lines: lines(...riskLines, ...report.risks.lines) },
  };
}

export function buildCloudSeaDecisionReport(
  result: ForecastCalculationResult,
  model: CloudSeaForecastViewModel,
): SubjectDecisionReport {
  const display = model.displayData;
  const terrain = model.terrainContext;
  const classic = terrain.isClassicCloudSeaEligible && !terrain.shouldDowngradeCloudSeaWording;
  const subject = classic ? "云海" : terrain.vocabulary.subjectLabel;
  const actionable =
    model.travelDecision === "go" && model.recommendationGuard.isSpecialTripRecommended;
  const weatherRisk = display.windowRiskContext;
  return finish(result, {
    target: "cloud_sea",
    title: `${subject}拍摄建议`,
    verdict: display.header.recommendationLabel,
    reason: conclusion(
      display.header.conclusion.replace(`${display.header.bestWindowLabel}：`, ""),
    ),
    timing: `${actionable ? "重点守候" : "附近观察参考"}：${display.header.bestWindowLabel}`,
    arrival: actionable
      ? display.header.arrivalLabel
      : "不为参考窗口专程赶路；已在附近再看云层开口。",
    caution: lines(
      /不足|缺|不一致|分歧|复核|待确认|待补/.test(model.dataCaution ?? "")
        ? model.dataCaution
        : undefined,
      !classic ? terrain.terrainNoteZh : undefined,
    ).join("；"),
    datesTitle: classic ? "哪天值得上山守云海" : "哪天留意低云和晨雾",
    dates: display.dailyJudgment.map((day) => ({
      title: day.dateLabel,
      lines: lines(
        (day.decisionReason || day.keyReason).includes(day.recommendedAction)
          ? conclusion(day.decisionReason || day.keyReason)
          : `${day.recommendedAction}。${conclusion(day.decisionReason || day.keyReason)}`,
        `守候参考：${day.bestMorningWindow}`,
        `${classic ? "白墙" : "低云遮挡"}：${day.whiteoutRiskLabel}`,
      ),
    })),
    shooting: {
      title: classic ? "站在哪、等什么画面" : "把云雾拍出层次",
      lines: lines(
        classic
          ? "先确认机位高于云层、能看到山脊或谷地，再等云缝与侧光重叠；有低云不等于能俯拍云海。"
          : "优先在可达的安全位置找树、山脊或建筑作前景，拍雾的透视层次；当前地形依据只支持低云或晨雾判断。",
        classic
          ? "云层打开时先拍山峰与云海的整体关系，再用中长焦截取露出的峰峦；白墙遮住远景时，转拍近处树影和雾中细节。"
          : "能见度转好时拍远近景的分离；雾浓时收紧取景，保留一个清楚的主体，不必强等整片云海。",
        weatherRisk?.equipmentAdviceZh,
      ),
    },
    risks: {
      title: classic ? "白墙、降雨和撤退条件" : "遮挡与现场取舍",
      lines: lines(
        weatherRisk?.whiteoutReviewLabelZh,
        weatherRisk?.duringWindowRainImpact.actionAdviceZh,
        weatherRisk?.preWindowRainImpact.impactLevel === "unknown"
          ? "窗口前的降雨资料不完整，水汽和道路情况需临近确认。"
          : weatherRisk?.preWindowRainImpact.actionAdviceZh,
        "若风雨增强、道路湿滑或视野持续被遮住，结束等待；不要为追云进入封闭区域或临崖位置。",
      ),
    },
  });
}

function glowSlot(slot: GlowDailyOpportunitySlot): string {
  if (slot.lifecycle === "ended") return `${slot.label}：窗口已结束，不再安排赶场。`;
  if (slot.lifecycle === "outside_horizon") return `${slot.label}：超出本次预报范围，条件待确认。`;
  if (slot.lifecycle === "unavailable") return `${slot.label}：时间或条件待确认。`;
  return `${slot.label}：${slot.timeLabel}，${slot.recommendation}。${slot.isRecommendationEligible ? "" : "仅供观察，不按此安排专程。"}`;
}

export function buildGlowDecisionReport(
  result: ForecastCalculationResult,
  model: GlowForecastViewModel,
): SubjectDecisionReport {
  const decision = model.overallRecommendation;
  const target = decision.preferredTarget;
  const selectedDate = decision.windowStartAt
    ? localDateKey(decision.windowStartAt, model.timezone)
    : undefined;
  const terrainCards = model.terrainObstructionCards.filter(
    (card) =>
      selectedDate &&
      card.key.startsWith(selectedDate) &&
      (target === "朝霞"
        ? card.key.endsWith("sunrise")
        : target === "晚霞"
          ? card.key.endsWith("sunset")
          : true),
  );
  const direction =
    target === "朝霞"
      ? "朝霞优先找东侧天空开阔的机位"
      : target === "晚霞"
        ? "晚霞优先找西侧天空开阔的机位"
        : "朝霞看东侧，晚霞看西侧天空";
  return finish(result, {
    target: "glow",
    title: "朝霞晚霞拍摄建议",
    verdict: decision.hasActionableWindow
      ? `${target} · ${decision.recommendation}`
      : "暂不为霞光专程赶场",
    reason: conclusion(decision.conciseReason, 2),
    timing: decision.hasActionableWindow
      ? `${decision.preferredDate} ${decision.preferredWindow}`
      : "暂无可执行的霞光窗口",
    arrival: decision.hasActionableWindow
      ? decision.arrivalAdvice
      : "若已在附近，可观察云缝和光线变化；先不安排远途赶场。",
    caution: model.missingDataNotes.length
      ? "部分霞光条件待确认，朝向遮挡和云层变化需在出发前复核。"
      : undefined,
    datesTitle: "追朝霞还是等晚霞",
    dates: model.dailyOpportunities.map((day) => ({
      title: day.localDateLabel,
      lines: lines(
        glowSlot(day.sunrise),
        glowSlot(day.sunset),
        conclusion(day.conciseReason),
        day.isPartiallyCovered ? "这一天只覆盖部分时段，未覆盖的窗口仍待确认。" : undefined,
      ),
    })),
    shooting: {
      title: "朝向、构图与现场节奏",
      lines: lines(
        `${direction}，具体位置以太阳实际方位和地平线遮挡为准；先找水面、山脊或城市轮廓作前景。`,
        ...terrainCards.slice(0, 2).map((card) => card.detail),
        "显色开始时先保留天空亮部，拍下完整前景；颜色和云缝稳定后再换长焦取局部。反差很大时可包围曝光，避免只顾天空丢掉前景。",
        "日出前留意东侧染色，日落后也看云层是否继续返红；是否继续等，以所列窗口与现场变化为准。",
      ),
    },
    risks: {
      title: "没烧起来，怎么取舍",
      lines: lines(
        decision.mainRisk,
        ...model.riskReasons.slice(0, 2),
        decision.backupPlan,
        "如果低云封住光路或降雨持续，转拍云层纹理、剪影和倒影；不要把日出日落时间当成一定会出霞的承诺。",
      ),
    },
  });
}

export function buildAstroDecisionReport(
  result: ForecastCalculationResult,
  model: AstroForecastViewModel,
  initialNightDate?: string,
): SubjectDecisionReport {
  const selected = initialNightDate
    ? model.nightlyCards.find((night) => night.localEveningDate === initialNightDate)
    : model.bestNight;
  const nights = initialNightDate
    ? model.nightlyCards.filter((night) => night.localEveningDate === initialNightDate)
    : model.nightlyCards;
  const decision = model.decisionSummary;
  // A linked night owns its conclusion and direction; never borrow the best night elsewhere.
  const focused = Boolean(initialNightDate);
  const missingNight = focused && !selected;
  const directions =
    selected?.directionSummaryLabel || (focused ? "拍摄方向待确认" : decision.directionLabel);
  const timing = selected
    ? `${selected.localEveningDateLabel}：${selected.bestShootingWindowLabel}`
    : focused
      ? "所选观测夜的窗口待确认"
      : decision.bestWindowLabel;
  return finish(result, {
    target: "astro",
    title: "星空银河拍摄建议",
    verdict: missingNight
      ? "所选观测夜资料不足"
      : focused
        ? selected!.recommendationLabel
        : decision.recommendationLabel,
    reason: missingNight
      ? "这份预报没有覆盖所选夜晚，请调整时间范围后再查询。"
      : focused
        ? selected!.conciseReason
        : decision.oneSentenceAdvice,
    timing,
    arrival: focused
      ? selected?.actionNote || "可拍窗口确认后再安排到场，优先趁天亮完成踩点。"
      : decision.arrivalLabel,
    caution: lines(
      selected?.isPartiallyCovered
        ? "仅覆盖这个观测夜的部分时段，不能据此判断整夜都能拍。"
        : undefined,
      model.missingDataNotes.length
        ? "部分星空条件待确认；天文可见窗口不等于天气允许拍摄。"
        : undefined,
    ).join("；"),
    datesTitle: focused ? "这个夜晚能拍什么" : "哪一晚值得守银河",
    dates: nights.map((night) => ({
      title: night.localEveningDateLabel,
      lines: lines(
        `${night.recommendationLabel}。${conclusion(night.conciseReason, 2)}`,
        `时段参考：${night.bestShootingWindowLabel}`,
        `月光干扰：${night.moon.moonlightInterferenceLevel}；取景方向：${direction(night.directionSummaryLabel)}`,
        night.isPartiallyCovered ? "仅覆盖部分夜间时段，未覆盖时段待确认。" : undefined,
      ),
    })),
    shooting: {
      title: "银河朝向与拍摄准备",
      lines: lines(
        `取景方向：${direction(directions)}`,
        selected?.terrainHorizon.publicDecisionLabel ||
          (focused ? undefined : decision.terrainLabel),
        selected?.lightPollutionSummaryLabel ||
          (focused ? undefined : decision.lightPollutionLabel),
        "趁天亮确认前景、脚下路线和撤离方向；夜间用三脚架固定机位，手动对焦并放大检查星点，先试拍确认拖线再决定曝光时间。",
        selected?.moon.moonlightInterferenceLevel
          ? /^(无|低|弱)$/.test(selected.moon.moonlightInterferenceLevel)
            ? "月光干扰较小，云层放开后可尝试银河与暗处地景；先试拍确认前景曝光。"
            : `月光干扰：${selected.moon.moonlightInterferenceLevel}。若天空被照亮，改拍月光地景，不强求暗弱银河。`
          : "月光影响待确认，不先假定整夜无月。",
      ),
    },
    risks: {
      title: "什么情况下放弃夜守",
      lines: lines(
        ...(selected?.blockerReasons ?? []).map(astroRisk),
        astroRisk((focused ? selected?.cloudWeatherBlockerLabel : decision.mainRiskDetail) ?? ""),
        focused ? undefined : astroRisk(decision.backupDetail),
        "若云层持续遮挡、风雨增强或镜头结露，先保护器材并撤回安全位置；不要因存在天文窗口就继续长时间夜守。",
      ),
    },
  });
}
