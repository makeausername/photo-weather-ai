import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  buildCloudSeaRecommendationExplanation,
  buildCloudSeaRecommendationGuardForResult,
  buildCloudSeaWeatherVariableConsistencyContext,
  buildCloudSeaWindowCenteredRiskContext,
  decisionCardSchema,
  deepSeekResponseFormat,
  formatArrivalDeadlineZh,
  formatLocalDateLabel,
  formatLocalTimeRange,
  formatShootingWindowZh,
  classifyGlowWindowLifecycle,
  glowLocalDateKey,
  glowDisplayRecommendationForScore,
  isGlowWindowRecommendationEligible,
  normalizeDeepSeekModel,
  type DeepSeekReasoningEffort,
  type GlowWindowLifecycleState,
} from "@photo-weather/shared";
import type {
  DecisionCard,
  ForecastCalculationResult,
  GlowProviderAgreement,
  GlowVividnessLevel,
} from "@photo-weather/shared";
import { z } from "zod";
import { MockAIProvider } from "./mock-provider.js";
import type {
  AIProvider,
  DecisionCardInput,
  ForecastAiExplanation,
  ForecastAiExplanationParseStrategy,
  ForecastAnalysis,
  ForecastAnalysisInput,
  ForecastExplanationInput,
} from "./types.js";

type DeepSeekFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type DeepSeekProviderOptions = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly enabled?: boolean;
  readonly realModeEnabled?: boolean;
  readonly fetcher?: DeepSeekFetch;
  readonly mode?: "disabled" | "mock" | "real";
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly promptMaxChars?: number;
  readonly responseFormat?: "json_object";
  readonly thinkingEnabled?: boolean;
  readonly reasoningEffort?: DeepSeekReasoningEffort;
  readonly jsonOutputEnabled?: boolean;
  readonly timeoutMs?: number;
};

type DeepSeekChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

type DeepSeekRequestBody = {
  readonly model: string;
  readonly messages: readonly DeepSeekChatMessage[];
  readonly temperature: number;
  readonly max_tokens: number;
  readonly stream: false;
  reasoning_effort?: Exclude<DeepSeekReasoningEffort, "none">;
  response_format?: {
    readonly type: "json_object";
  };
};

type DeepSeekChatResponse = {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: unknown;
    };
    readonly finish_reason?: unknown;
  }[];
};

export type DeepSeekRequestPreview = {
  readonly url: string;
  readonly body: DeepSeekRequestBody;
  readonly promptSizeChars: number;
  readonly outputMode: "json_object" | "text_with_json_fallback";
};

export type ForecastAiInterpretationTargetCode = "cloud_sea" | "glow";

type ForecastAiTargetConfig = {
  readonly targetCode: ForecastAiInterpretationTargetCode;
  readonly subjectZh: string;
  readonly task: string;
  readonly outputLength: string;
  readonly visibleSectionsZh: readonly string[];
  readonly promptPrioritiesZh: readonly string[];
  readonly constraints: readonly string[];
};

export const forecastAiTargetConfigs = {
  cloud_sea: {
    targetCode: "cloud_sea",
    subjectZh: "云海",
    task: "Explain deterministic Cloud Sea photo-weather forecast facts in concise Simplified Chinese.",
    outputLength: "600-900 Chinese characters total. No Markdown.",
    visibleSectionsZh: [
      "一句话结论",
      "最建议关注",
      "天气大势",
      "题材判断",
      "风险与装备",
      "最终建议",
    ],
    promptPrioritiesZh: [
      "解释云海形成、可拍窗口、白墙风险、到达与等待策略。",
      "低海拔或地形证据不足时使用低云/晨雾等保守说法。",
      "不得把总云量推断成低云、中云或高云分层。",
    ],
    constraints: [
      "For cloud_sea, keep the current deterministic cloud-sea recommendation authoritative.",
      "Do not invent cloud layer values, whiteout risk, cloud-sea windows, arrival advice, or professional hourly values.",
      "Explain temperature, precipitation, cloud basis, and window risk only from provided deterministic facts.",
    ],
  },
  glow: {
    targetCode: "glow",
    subjectZh: "朝霞晚霞",
    task: "Explain deterministic sunrise and sunset glow photography forecast facts in concise Simplified Chinese.",
    outputLength: "420-650 Chinese characters total. No Markdown.",
    visibleSectionsZh: ["是否值得去", "最佳时间", "为什么", "怎么拍", "备选方案"],
    promptPrioritiesZh: [
      "先回答是否值得去，并明确优先朝霞、晚霞、两者都关注还是不建议专程。",
      "使用已给出的预测概率、最佳本地时间和建议到达时间，不要重算。",
      "只解释一个主要原因、一个主要风险和一个备选方案。",
      "不要重复完整云层、气溶胶、地形或小时天气报告。",
    ],
    constraints: [
      "For glow, deterministic probability, sunriseGlowScore, sunsetGlowScore, best windows, sunrise/sunset times, and recommendation are authoritative facts.",
      "Do not change sunrise glow probability, sunset glow probability, sunrise glow score, sunset glow score, best window, sunrise time, sunset time, cloud values, aerosol values, terrain obstruction details, or deterministic recommendation.",
      "Do not recompute glow suitability. Explain why the deterministic result is practical or risky.",
      "If aerosol data are unavailable, say aerosol evidence is insufficient and rely only on visibility and humidity as supporting observations.",
      "If terrain-horizon data are unavailable, say natural-terrain obstruction detail is unavailable; do not infer local obstruction.",
      "Terrain blocking the direct solar disk must not be described as eliminating all colored-cloud potential.",
      "Do not use cloud-sea wording as the primary subject.",
    ],
  },
} satisfies Record<ForecastAiInterpretationTargetCode, ForecastAiTargetConfig>;

function forecastAiTargetConfigFor(
  target: ForecastCalculationResult["target"],
): ForecastAiTargetConfig | undefined {
  return target === "cloud_sea" || target === "glow" ? forecastAiTargetConfigs[target] : undefined;
}

type JsonParseStrategy = Extract<
  ForecastAiExplanationParseStrategy,
  "strict_json" | "fenced_json" | "extracted_json"
>;

type JsonParseResult = {
  readonly value: unknown;
  readonly strategy: JsonParseStrategy;
};

type ForecastAiExplanationParseResult = {
  readonly explanation: ForecastAiExplanation;
  readonly parseStrategy: ForecastAiExplanationParseStrategy;
  readonly parseSuccess: boolean;
  readonly fallbackUsed: boolean;
  readonly rawResponseSizeChars: number;
};

export const missingDeepSeekApiKeyMessage = "请先填写 DeepSeek API Key。";

const deepSeekRealModeDisabledMessage =
  "DeepSeek 真实调用未启用，请先在后台服务商配置中启用真实调用。";

const deepSeekProviderDisabledMessage =
  "DeepSeek 服务商未启用，请先在后台服务商配置中启用 DeepSeek。";

const defaultBaseUrl = "https://api.deepseek.com";
const defaultTemperature = 0.2;
const defaultMaxTokens = 1200;
const defaultTimeoutMs = 120000;
const targetInterpretationPromptChars = 4000;
const defaultInterpretationPromptMaxChars = 6000;

export type DeepSeekInterpretationErrorCategory =
  | "provider_disabled"
  | "config_missing"
  | "timeout"
  | "network_error"
  | "provider_http_error"
  | "provider_invalid_response"
  | "provider_parse_error"
  | "prompt_too_large"
  | "unknown";

export type DeepSeekProviderErrorOptions = {
  readonly errorCategory: DeepSeekInterpretationErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly promptSizeChars?: number;
  readonly responseSizeChars?: number;
  readonly parseStrategy?: ForecastAiExplanationParseStrategy;
  readonly cause?: unknown;
};

export class DeepSeekProviderError extends Error {
  readonly errorCategory: DeepSeekInterpretationErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly promptSizeChars?: number;
  readonly responseSizeChars?: number;
  readonly parseStrategy?: ForecastAiExplanationParseStrategy;
  override readonly cause?: unknown;

  constructor(options: DeepSeekProviderErrorOptions) {
    super(options.messageZh);
    this.name = "DeepSeekProviderError";
    this.errorCategory = options.errorCategory;
    this.messageZh = options.messageZh;
    this.statusCode = options.statusCode;
    this.latencyMs = options.latencyMs;
    this.promptSizeChars = options.promptSizeChars;
    this.responseSizeChars = options.responseSizeChars;
    this.parseStrategy = options.parseStrategy;
    this.cause = options.cause;
  }
}

export function isDeepSeekProviderError(error: unknown): error is DeepSeekProviderError {
  return error instanceof DeepSeekProviderError;
}

const nonEmptyZh = z.string().trim().min(1);

const dayByDayExplanationSchema = z.object({
  dateZh: nonEmptyZh,
  recommendationZh: nonEmptyZh,
  scoreZh: nonEmptyZh,
  temperatureZh: nonEmptyZh,
  rainZh: nonEmptyZh,
  cloudSeaZh: nonEmptyZh,
  glowZh: nonEmptyZh,
  sunsetGlowZh: nonEmptyZh,
  astroZh: nonEmptyZh,
  transparencyZh: nonEmptyZh,
  bestWindowZh: nonEmptyZh,
  actionZh: nonEmptyZh,
});

export const forecastAiExplanationSchema = z.object({
  conclusion: z.object({
    titleZh: nonEmptyZh,
    summaryZh: nonEmptyZh,
    recommendedDayZh: nonEmptyZh,
    recommendationLevelZh: nonEmptyZh,
    whetherWorthDedicatedTripZh: nonEmptyZh,
    oneSentenceDecisionZh: nonEmptyZh,
  }),
  bestPlan: z.object({
    primaryTargetZh: nonEmptyZh,
    bestDateZh: nonEmptyZh,
    bestWindowZh: nonEmptyZh,
    recommendedArrivalZh: nonEmptyZh,
    whyThisWindowZh: nonEmptyZh,
    backupPlanZh: nonEmptyZh,
  }),
  weatherTrend: z.object({
    trendSummaryZh: nonEmptyZh,
    temperatureSummaryZh: nonEmptyZh,
    rainSummaryZh: nonEmptyZh,
    windSummaryZh: nonEmptyZh,
    transparencySummaryZh: nonEmptyZh,
  }),
  dayByDay: z.array(dayByDayExplanationSchema).min(1).max(7),
  subjectAdvice: z.object({
    cloudSeaZh: nonEmptyZh,
    sunriseGlowZh: nonEmptyZh,
    sunsetGlowZh: nonEmptyZh,
    astroMilkyWayZh: nonEmptyZh,
    transparencyZh: nonEmptyZh,
  }),
  riskAndGear: z.object({
    keyRisks: z.array(nonEmptyZh).min(1).max(8),
    clothingZh: nonEmptyZh,
    gearZh: nonEmptyZh,
    safetyZh: nonEmptyZh,
  }),
  finalAdvice: z.object({
    goNoGoZh: nonEmptyZh,
    ifAlreadyNearbyZh: nonEmptyZh,
    ifDedicatedTripZh: nonEmptyZh,
    nextCheckZh: nonEmptyZh,
  }),
  metadata: z
    .object({
      source: z.enum(["deepseek", "deterministic_fallback"]),
      noteZh: nonEmptyZh.optional(),
      parseStrategy: z
        .enum(["strict_json", "fenced_json", "extracted_json", "plain_text_fallback", "failed"])
        .optional(),
      fallbackUsed: z.boolean().optional(),
      rawResponseSizeChars: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

const forecastAnalysisSchema = z.object({
  summary: z.string().trim().min(1),
  opportunities: z.array(z.string().trim().min(1)).min(1).max(8),
  risks: z.array(z.string().trim().min(1)).max(8),
  confidence: z.number().min(0).max(1),
});

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimTrailingSlash(trimmed && trimmed.length > 0 ? trimmed : defaultBaseUrl);
}

function normalizeModel(value: string | undefined): string {
  return normalizeDeepSeekModel(value);
}

function normalizeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultTemperature;
  }

  return Math.min(2, Math.max(0, value));
}

function normalizeMaxTokens(value: number | undefined, fallback = defaultMaxTokens): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(8192, Math.max(1, Math.round(value)));
}

function normalizePromptMaxChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultInterpretationPromptMaxChars;
  }

  return Math.min(6000, Math.max(3000, Math.round(value)));
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultTimeoutMs;
  }

  return Math.min(120000, Math.max(120000, Math.round(value)));
}

function normalizeResponseFormat(value: "json_object" | undefined): "json_object" {
  return value ?? deepSeekResponseFormat;
}

function normalizeReasoningEffort(
  value: DeepSeekReasoningEffort | undefined,
): DeepSeekReasoningEffort {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return "none";
}

function applyReasoningEffort(
  body: DeepSeekRequestBody,
  options: Pick<DeepSeekProviderOptions, "thinkingEnabled" | "reasoningEffort">,
): void {
  if (!options.thinkingEnabled) {
    return;
  }

  const effort = normalizeReasoningEffort(options.reasoningEffort);
  if (effort === "none") {
    return;
  }

  body.reasoning_effort = effort;
}

function deepSeekError(options: DeepSeekProviderErrorOptions): DeepSeekProviderError {
  return new DeepSeekProviderError(options);
}

function getMessageContent(
  response: DeepSeekChatResponse,
  latencyMs?: number,
  responseSizeChars?: number,
): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw deepSeekError({
      errorCategory: "provider_parse_error",
      messageZh: "DeepSeek 返回内容为空。",
      latencyMs,
      responseSizeChars: typeof content === "string" ? content.length : responseSizeChars,
      parseStrategy: "failed",
    });
  }

  return content;
}

function parseDeepSeekChatResponse(text: string, latencyMs: number): DeepSeekChatResponse {
  try {
    return JSON.parse(text) as DeepSeekChatResponse;
  } catch (error) {
    throw deepSeekError({
      errorCategory: "provider_invalid_response",
      messageZh: "DeepSeek 返回格式异常。",
      latencyMs,
      responseSizeChars: text.length,
      cause: error,
    });
  }
}

function normalizeDeepSeekRequestError(
  error: unknown,
  latencyMs: number,
  promptSizeChars?: number,
): DeepSeekProviderError {
  if (isDeepSeekProviderError(error)) {
    return error;
  }

  const candidate =
    error && typeof error === "object"
      ? (error as { readonly name?: unknown; readonly message?: unknown })
      : undefined;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  if (name === "AbortError" || message.includes("timed out") || message.includes("timeout")) {
    return deepSeekError({
      errorCategory: "timeout",
      messageZh: "DeepSeek 服务请求超时。",
      latencyMs,
      promptSizeChars,
      cause: error,
    });
  }

  return deepSeekError({
    errorCategory: "network_error",
    messageZh: "DeepSeek 网络不可用。",
    latencyMs,
    promptSizeChars,
    cause: error,
  });
}

function takeItems<T>(items: readonly T[] | undefined, count: number): readonly T[] {
  return items?.slice(0, count) ?? [];
}

function takeTextItems(items: readonly string[] | undefined, count: number, maxLength = 120) {
  return takeItems(items, count).map((item) => limitText(item, maxLength));
}

function firstText(items: readonly (string | undefined | null)[], fallback: string): string {
  return (
    items.find((item): item is string => typeof item === "string" && item.trim().length > 0) ??
    fallback
  );
}

function compactRiskFlags(
  flags: readonly ForecastCalculationResult["riskFlags"][number][] | undefined,
  count: number,
) {
  return takeItems(flags, count).map((flag) => ({
    key: flag.key,
    label: flag.label,
    level: flag.level,
    description: limitText(flag.description, 120),
  }));
}

function limitText<T extends string | undefined | null>(text: T, maxLength = 160): T {
  if (typeof text !== "string" || text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...` as T;
}

function compactScore(
  score: ForecastCalculationResult["scores"][keyof ForecastCalculationResult["scores"]],
) {
  return {
    key: score.key,
    label: score.label,
    score: score.score,
    level: score.level,
    reasons: takeTextItems(score.reasons, 1, 90),
    risks: takeTextItems(score.risks, 1, 90),
  };
}

function compactTopicScoresForAi(result: ForecastCalculationResult) {
  const scores = Object.values(result.scores);
  if (result.target !== "cloud_sea") {
    return scores.map(compactScore);
  }
  const preferredKeys = new Set(["cloudSea", "whiteoutRisk", "stars", "milkyWay"]);
  const selected = scores.filter((score) => preferredKeys.has(score.key)).slice(0, 4);
  return (selected.length > 0 ? selected : scores.slice(0, 4)).map(compactScore);
}

export type DeepSeekForecastContextDetail = "standard" | "minimal" | "budget";

export function buildDeepSeekForecastContext(
  result: ForecastCalculationResult,
  detail: DeepSeekForecastContextDetail = "standard",
) {
  const timezone = result.calendarBasis.timezone;
  const isCloudSeaTarget = result.target === "cloud_sea";
  const isGlowTarget = result.target === "glow";
  const isCompactTarget = isCloudSeaTarget || isGlowTarget;
  const dailyLimit = detail === "minimal" || isCompactTarget ? 2 : 4;
  const windowLimit = detail === "minimal" || isCompactTarget ? 1 : 3;
  const bestWindow = result.bestWindows.find(isExecutableWindow) ?? result.bestWindows[0];
  const bestDay = bestDailySummaryForPlan(result, bestWindow);
  const cloudSeaGuard =
    result.target === "cloud_sea" ? buildCloudSeaRecommendationGuardForResult(result) : null;
  const dailyFacts = takeItems(result.dailySummaries, dailyLimit).map((summary) =>
    compactDailyFact(result, summary, timezone),
  );

  return {
    contextVersion: "forecast-interpretation-v4",
    note: "All values are precomputed deterministic facts. Interpret only; do not calculate or invent.",
    detail,
    location: {
      name: result.place.name,
      countryCode: result.place.countryCode,
    },
    horizon: {
      key: result.horizon,
      rangeZh: result.calendarBasis.forecastRangeLabel,
      timezone: result.calendarBasis.timezone,
      generatedAt: result.generatedAt,
    },
    target: result.target,
    overall: {
      score: result.overallScore,
      recommendationLevel: result.recommendationLevel,
      recommendationLabelZh: cloudSeaGuard?.finalRecommendationLabel ?? result.recommendationLabel,
      confidenceLabelZh: confidenceLabelZh(result.weatherFusionSummary?.confidenceLevel),
      summaryZh: limitText(result.summary, 180),
    },
    bestDay: bestDay
      ? {
          date: bestDay.date,
          dateZh: formatDateLabelZh(bestDay.date, timezone, bestDay.dateLabelZh),
          score: bestDay.score,
          recommendationZh:
            cloudSeaGuard?.finalRecommendationLabel ??
            bestDay.dedicatedTripRecommendation ??
            bestDay.recommendationLabel,
          bestWindowZh: bestDay.bestShootableWindow
            ? formatWindowTimeZh(bestDay.bestShootableWindow, timezone)
            : undefined,
          actionZh: limitText(bestDay.shortAdvice, 140),
        }
      : null,
    bestWindows: takeItems(result.bestWindows, windowLimit).map((window) =>
      compactForecastWindowBrief(window, timezone),
    ),
    dailySummaries: dailyFacts,
    topicScores: compactTopicScoresForAi(result),
    risks: compactRiskFlags(result.riskFlags, detail === "minimal" || isCloudSeaTarget ? 3 : 5),
    keyReasons: takeTextItems(result.keyReasons, isCloudSeaTarget ? 2 : 4, 90),
    deterministicActionSuggestions: takeTextItems(
      result.photographyAdvice,
      isCloudSeaTarget ? 2 : 3,
      100,
    ),
    clothingAndEquipment: {
      summaryZh: limitText(result.clothingGuide.summaryZh, isCloudSeaTarget ? 100 : 160),
      comfortLevel: result.clothingGuide.comfortLevel,
      layers: takeTextItems(
        result.clothingGuide.layers,
        detail === "minimal" || isCloudSeaTarget ? 2 : 4,
      ),
      accessories: takeTextItems(
        result.clothingGuide.accessories,
        detail === "minimal" || isCloudSeaTarget ? 2 : 4,
      ),
      riskNotes: takeTextItems(
        result.clothingGuide.riskNotes,
        detail === "minimal" || isCloudSeaTarget ? 2 : 3,
        90,
      ),
    },
    dataStatus: {
      dataMode: result.weatherDataMode,
      isMock: result.isMock,
      noticeZh: limitText(providerNeutralText(result.dataNotice), 140),
    },
    cloudSeaAiExplainPayload:
      result.target === "cloud_sea" ? buildCloudSeaAiExplainPayloadForContext(result) : undefined,
    glowAiExplainPayload:
      result.target === "glow" ? buildGlowAiExplainPayloadForContext(result) : undefined,
    calibrationHint: result.calibrationHint
      ? {
          sampleCount: result.calibrationHint.sampleCount,
          hitRate: result.calibrationHint.hitRate,
          falsePositiveRate: result.calibrationHint.falsePositiveRate,
          confidenceAdjustment: result.calibrationHint.confidenceAdjustment,
          displayNoteZh: limitText(result.calibrationHint.displayNoteZh, 140),
          cautionNoteZh: limitText(result.calibrationHint.cautionNoteZh, 140),
        }
      : undefined,
  };
}

function buildCloudSeaAiExplainPayloadForContext(result: ForecastCalculationResult) {
  const payload = buildCloudSeaAiExplainPayload(result, "minimal");
  return {
    contextVersion: payload.contextVersion,
    target: payload.target,
    deterministicOnly: payload.deterministicOnly,
    instruction: "Explain deterministic Cloud Sea facts only; keep window-centered risk reasons.",
    scoreAndRecommendation: payload.scoreAndRecommendation,
    scoreCalibration: {
      finalCloudSeaScore: payload.scoreCalibration.finalCloudSeaScore,
      capApplied: payload.scoreCalibration.capApplied,
      capReasons: takeTextItems(payload.scoreCalibration.capReasons, 2, 60),
    },
    recommendationExplanation: payload.recommendationExplanation,
    precipitationSignalSummary: payload.precipitationSignalSummary,
    windowRiskContext: payload.windowRiskContext,
    cloudLayerCoverageContext: payload.cloudLayerCoverageContext,
    professionalHourlySummary: {
      rowCount: payload.professionalHourlySummary.rowCount,
      focusedRows: takeItems(payload.professionalHourlySummary.focusedRows, 1),
    },
  };
}

function buildGlowAiExplainPayloadForContext(result: ForecastCalculationResult) {
  const payload = buildGlowAiExplainPayload(result, "minimal");
  return {
    contextVersion: payload.contextVersion,
    target: payload.target,
    targetCode: payload.targetCode,
    deterministicOnly: payload.deterministicOnly,
    instruction:
      "Explain deterministic sunrise and sunset glow facts only; keep probability, scores, windows, and recommendation authoritative.",
    primaryDecision: payload.primaryDecision,
    sunriseGlow: payload.sunriseGlow,
    sunsetGlow: payload.sunsetGlow,
    deterministicAuthority: payload.deterministicAuthority,
    whyThisJudgment: payload.whyThisJudgment,
    professionalHourlySummary: payload.professionalHourlySummary,
    actionPlan: payload.actionPlan,
  };
}

export function buildCloudSeaAiExplainPayload(
  result: ForecastCalculationResult,
  detail: DeepSeekForecastContextDetail = "standard",
) {
  const timezone = result.calendarBasis.timezone;
  const analysis = result.cloudSeaAnalysis;
  const bestAnalysisWindow =
    analysis.bestCloudSeaWindow ??
    analysis.bestCloudSeaWindows[0] ??
    analysis.watchableCloudSeaWindows[0] ??
    analysis.notRecommendedCloudSeaWindows[0];
  const bestForecastWindow =
    result.bestWindows.find(
      (window) => window.target === "cloud_sea" && isExecutableWindow(window),
    ) ?? result.bestWindows.find((window) => window.target === "cloud_sea");
  const professionalRows = professionalHourlyRowsAtOrAfterAnchor(
    result.professionalHourlyData ?? [],
    result.professionalHourlyDataTimeBasis?.anchorStartLocal,
    result.professionalHourlyDataTimeBasis?.expectedRowCount ??
      result.professionalHourlyDataTimeBasis?.requestedHours,
  );
  const focusedRows = professionalHourlyRowsForAiPayload(professionalRows, detail);
  const cloudLayerCompleteness = buildCloudLayerCompletenessContext(professionalRows);
  const cloudBasisConsistency = buildCloudSeaCloudBasisConsistencyContext({
    hourlyRows: professionalRows,
    cloudLayerCompletenessContext: cloudLayerCompleteness,
    focusedWindow: bestAnalysisWindow
      ? {
          startTime: bestAnalysisWindow.startTime,
          endTime: bestAnalysisWindow.endTime,
        }
      : null,
  });
  const agreement = result.weatherFusionSummary?.multiSourceAgreementContext;
  const weatherVariableConsistency = buildCloudSeaWeatherVariableConsistencyContext({
    elevationMeters:
      result.terrainAnalysis.terrainProfile.locationElevation ??
      result.terrainAnalysis.terrainProfile.elevationMeters ??
      result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
    timezone,
    surroundingReliefMeters:
      result.terrainAnalysis.terrainProfile.localReliefMeters ??
      result.terrainAnalysis.terrainProfile.elevationDiff5km ??
      result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
    terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
    terrainType:
      result.terrainAnalysis.terrainProfile.terrainType ??
      result.cloudSeaAnalysis.terrainSupport.terrainType,
    hourlyRows: professionalRows,
    focusedWindow: bestAnalysisWindow
      ? {
          startTime: bestAnalysisWindow.startTime,
          endTime: bestAnalysisWindow.endTime,
        }
      : null,
    cloudLayerCompletenessContext: cloudLayerCompleteness,
    multiSourceAgreementContext: agreement,
  });
  const precipitationSignal = weatherVariableConsistency.precipitationSignalContext;
  const scoreCalibration = analysis.scoreCalibration;
  const recommendationGuard = buildCloudSeaRecommendationGuardForResult(result);
  const recommendationExplanation = buildCloudSeaRecommendationExplanation({
    finalRecommendationLabel: recommendationGuard.finalRecommendationLabel,
    cloudSeaScore: scoreCalibration.finalCloudSeaScore,
    formationScore: analysis.formationScore,
    shootabilityScore: scoreCalibration.calibratedShootabilityScore,
    whiteoutRiskScore: analysis.whiteoutRiskScore,
    terrainContext: {
      shouldDowngradeCloudSeaWording: ["lowland", "urban_or_plain", "unknown"].includes(
        analysis.terrainSupport.terrainMode,
      ),
      terrainClass: analysis.terrainSupport.terrainMode,
      terrainNoteZh: analysis.terrainSupport.messageZh,
    },
    cloudLayerCoverageContext: cloudLayerCompleteness,
    cloudBasisConsistencyContext: cloudBasisConsistency,
    weatherVariableConsistencyContext: weatherVariableConsistency,
    precipitationSignalContext: precipitationSignal,
    multiSourceAgreementContext: agreement ?? null,
    bestWindow: bestAnalysisWindow ?? null,
    recommendationGuardContext: recommendationGuard,
  });
  const temperatureBasisContext = compactTemperatureBasisForAi(weatherVariableConsistency);
  const nearTermRows = takeItems(professionalRows, 6);
  const nearTermPrecipitationSummary = summarizeProfessionalHourlyPrecipitation(nearTermRows);
  const nearTermCloudSummary = summarizeProfessionalHourlyCloudLayers(nearTermRows);

  return {
    contextVersion: "cloud-sea-ai-explain-v2",
    target: "cloud_sea",
    deterministicOnly: true,
    instruction:
      "Explain deterministic Cloud Sea facts only. Do not recompute facts, infer low/mid/high cloud from total cloud, invent temperature correction, invent rain amount, override the selected deterministic temperature and precipitation signal basis, or change the window-centered risk reasons. Do not convert high precipitation probability with trace amount into strong rain.",
    locationName: result.place.name,
    horizon: {
      key: result.horizon,
      forecastRange: result.calendarBasis.forecastRangeLabel,
    },
    scoreAndRecommendation: {
      overallScore: result.overallScore,
      cloudSeaScore: scoreCalibration.finalCloudSeaScore,
      formationScore: analysis.formationScore,
      whiteoutRiskScore: analysis.whiteoutRiskScore,
      recommendationLevel: result.recommendationLevel,
      recommendationLabelZh: recommendationGuard.finalRecommendationLabel,
      maxAllowedRecommendationStrength: recommendationGuard.maxAllowedRecommendationStrength,
    },
    scoreCalibration: {
      rawFormationScore: scoreCalibration.rawFormationScore,
      calibratedShootabilityScore: scoreCalibration.calibratedShootabilityScore,
      finalCloudSeaScore: scoreCalibration.finalCloudSeaScore,
      capApplied: scoreCalibration.capApplied,
      capReasons: takeTextItems(scoreCalibration.capReasons, 5, 100),
      shouldDowngradeToCautious: scoreCalibration.shouldDowngradeToCautious,
      shouldDowngradeToBackup: scoreCalibration.shouldDowngradeToBackup,
    },
    recommendationConsistencyGuard: {
      finalRecommendationLevel: recommendationGuard.finalRecommendationLevel,
      finalRecommendationLabelZh: recommendationGuard.finalRecommendationLabel,
      reasonZh: limitText(providerNeutralText(recommendationGuard.reasonZh), 120),
      departureAdviceZh: limitText(providerNeutralText(recommendationGuard.departureAdviceZh), 120),
      blockedStrongRecommendationReasons: takeTextItems(
        recommendationGuard.blockedStrongRecommendationReasons,
        2,
        70,
      ),
      consistencyWarnings: takeTextItems(recommendationGuard.consistencyWarnings, 2, 70),
    },
    recommendationExplanation: {
      oneLineConclusionZh: limitText(
        providerNeutralText(recommendationExplanation.oneLineConclusionZh),
        120,
      ),
      whyNotStrongerZh: limitText(
        providerNeutralText(recommendationExplanation.whyNotStrongerZh),
        120,
      ),
      confidenceExplanationZh: limitText(
        providerNeutralText(recommendationExplanation.confidenceExplanationZh),
        120,
      ),
      reviewPointsZh: takeTextItems(recommendationExplanation.reviewPointsZh, 3, 36),
      actionSummaryZh: limitText(
        providerNeutralText(recommendationExplanation.actionSummaryZh),
        120,
      ),
    },
    displayDataAlignment: {
      sourceAlignmentStatus: "normalized",
      anchorStart:
        result.professionalHourlyDataTimeBasis?.anchorStartLocal ??
        result.professionalHourlyDataTimeBasis?.startTime ??
        result.forecastStart,
      anchorEnd:
        result.professionalHourlyDataTimeBasis?.anchorEndLocal ??
        result.professionalHourlyDataTimeBasis?.endTime ??
        result.forecastEnd,
      expectedRowCount:
        result.professionalHourlyDataTimeBasis?.expectedRowCount ??
        result.professionalHourlyDataTimeBasis?.requestedHours ??
        result.calendarBasis.horizonHours,
      normalizedHourlyRowCount: professionalRows.length,
      nearTermRowCount: nearTermRows.length,
    },
    displayTemperatureContext: {
      temperatureBasis: temperatureBasisContext.temperatureBasis,
      displayTemperatureC: temperatureBasisContext.displayTemperatureC,
      terrainAdjustedTemperatureC: temperatureBasisContext.terrainAdjustedTemperatureC,
    },
    precipitationSignalSummary: {
      precipitationSignalLevel: precipitationSignal.precipitationSignalLevel,
      precipitationSignalType: precipitationSignal.precipitationSignalType,
      precipitationImpactLevel: precipitationSignal.precipitationImpactLevel,
      probabilityClass: precipitationSignal.probabilityClass,
      amountClass: precipitationSignal.amountClass,
      affectsMainWindow: precipitationSignal.affectsMainWindow,
      affectsArrivalWindow: precipitationSignal.affectsArrivalWindow,
      shouldDowngradeWindow: precipitationSignal.shouldDowngradeWindow,
      shouldAvoidStrongRainWording: precipitationSignal.shouldAvoidStrongRainWording,
      mainTimeRangeZh: precipitationSignal.mainTimeRangeZh,
      userSummaryZh: limitText(providerNeutralText(precipitationSignal.userSummaryZh), 100),
      actionAdviceZh: limitText(providerNeutralText(precipitationSignal.actionAdviceZh), 90),
    },
    precipitationSignalContext: {
      precipitationSignalType: precipitationSignal.precipitationSignalType,
      precipitationImpactLevel: precipitationSignal.precipitationImpactLevel,
      maxProbabilityPercent: precipitationSignal.maxProbabilityPercent,
      maxAmountMm: precipitationSignal.maxAmountMm,
      mainTimeRangeZh: precipitationSignal.mainTimeRangeZh,
      nearTermProbabilityPercent: nearTermPrecipitationSummary.probabilityPercent,
      nearTermAmountMm: nearTermPrecipitationSummary.amountMm,
      riskLabelZh: precipitationSignal.riskLabelZh,
      userSummaryZh: limitText(providerNeutralText(precipitationSignal.userSummaryZh), 80),
      shouldDowngradeWindow: precipitationSignal.shouldDowngradeWindow,
    },
    windowRiskContext: compactCloudSeaWindowRiskContext(
      analysis.windowRiskContext ??
        buildCloudSeaWindowCenteredRiskContext({
          normalizedHourlyRows: professionalRows,
          bestWindow: bestAnalysisWindow ?? null,
          mainWindow: bestAnalysisWindow ?? null,
          forecastWindowRange: {
            startTime:
              result.professionalHourlyDataTimeBasis?.anchorStartLocal ?? result.forecastStart,
            endTime: result.professionalHourlyDataTimeBasis?.anchorEndLocal ?? result.forecastEnd,
          },
          precipitationSignalContext: precipitationSignal,
          cloudLayerCoverageContext: cloudLayerCompleteness,
          cloudBasisConsistencyContext: cloudBasisConsistency,
          displayTemperatureContext: {
            displayTemperatureC: temperatureBasisContext.displayTemperatureC,
            terrainAdjustedTemperatureC: temperatureBasisContext.terrainAdjustedTemperatureC,
            basis: temperatureBasisContext.temperatureBasis,
          },
          terrainContext: {
            terrainMode: analysis.terrainSupport.terrainMode,
            terrainType:
              result.terrainAnalysis.terrainProfile.terrainType ??
              analysis.terrainSupport.terrainType,
            elevationMeters:
              result.terrainAnalysis.terrainProfile.locationElevation ??
              result.terrainAnalysis.terrainProfile.elevationMeters ??
              analysis.terrainSupport.selectedSpotElevationMeters,
            surroundingReliefMeters:
              result.terrainAnalysis.terrainProfile.localReliefMeters ??
              result.terrainAnalysis.terrainProfile.elevationDiff5km ??
              analysis.terrainSupport.localReliefMeters,
            confidence: analysis.terrainSupport.confidence,
          },
          whiteoutRiskContext: {
            whiteoutRiskScore: analysis.whiteoutRiskScore,
          },
          timezone,
        }),
    ),
    bestWindow: bestAnalysisWindow
      ? compactCloudSeaAnalysisWindow(bestAnalysisWindow, timezone)
      : null,
    bestForecastWindow: bestForecastWindow
      ? compactForecastWindowBrief(bestForecastWindow, timezone)
      : null,
    arrivalSuggestionZh: bestForecastWindow?.arrivalAdvice
      ? formatArrivalDeadlineZh(bestForecastWindow.arrivalAdvice.recommendedArrivalTime, timezone)
      : bestAnalysisWindow
        ? `建议在 ${formatShootingWindowZh(
            { startTime: bestAnalysisWindow.startTime, endTime: bestAnalysisWindow.endTime },
            timezone,
          )} 前完成到位、构图和现场复核。`
        : "暂无明确到达时间，出发前优先复核临近云层和能见度。",
    terrainContext: {
      terrainMode: analysis.terrainSupport.terrainMode,
      terrainType: result.terrainSummary.terrainType,
      exposureType: result.terrainSummary.exposureType,
      supportScore: analysis.terrainSupport.score,
      supportLevel: analysis.terrainSupport.level,
      confidenceLevel: analysis.terrainSupport.confidence,
      messageZh: limitText(providerNeutralText(analysis.terrainSupport.messageZh), 120),
      lowElevationDowngradeContext: ["lowland", "urban_or_plain", "hill"].includes(
        analysis.terrainSupport.terrainMode,
      )
        ? "Use lowland/plain wording unless terrain evidence supports cloud-sea wording."
        : undefined,
    },
    cloudSeaWindowCards: {
      best: takeItems(analysis.bestCloudSeaWindows, 1).map((window) =>
        compactCloudSeaAnalysisWindow(window, timezone),
      ),
      watchable: takeItems(analysis.watchableCloudSeaWindows, 1).map((window) =>
        compactCloudSeaAnalysisWindow(window, timezone),
      ),
      notRecommended: takeItems(analysis.notRecommendedCloudSeaWindows, 1).map((window) =>
        compactCloudSeaAnalysisWindow(window, timezone),
      ),
    },
    dailyCloudSeaSummary: takeItems(analysis.dailyCloudSea, detail === "minimal" ? 1 : 2).map(
      (day) => ({
        date: day.date,
        dateZh: formatDateLabelZh(day.date, timezone, day.dateLabelZh),
        recommendationZh: buildCloudSeaRecommendationGuardForResult(result, {
          cloudSeaScore: day.shootableScore ?? day.travelScore,
          shootabilityScore: day.shootableScore ?? day.travelScore,
          formationScore: day.formationScore ?? day.opportunityScore,
          whiteoutRiskScore: day.whiteoutRiskScore,
          proposedRecommendationLabel: day.recommendationLabel,
          bestWindow: day.bestWindow,
          hasWindow: true,
        }).finalRecommendationLabel,
        travelScore: day.travelScore,
        formationScore: day.formationScore,
        shootableScore: day.shootableScore,
        whiteoutRiskScore: day.whiteoutRiskScore,
        bestWindow: compactCloudSeaAnalysisWindow(day.bestWindow, timezone),
        keyReasonZh: limitText(day.keyReason, 90),
        riskNoteZh: limitText(day.riskNote, 90),
        onSiteCheckpoints: takeTextItems(day.onSiteCheckpoints, 2, 70),
      }),
    ),
    professionalHourlySummary: {
      rowCount: professionalRows.length,
      timeBasis: compactProfessionalHourlyTimeBasisForAi(
        result.professionalHourlyDataTimeBasis,
        detail,
      ),
      temperatureBasis: temperatureBasisContext,
      signalCounts: countProfessionalHourlySignals(professionalRows),
      focusedRows: focusedRows.map(compactProfessionalHourlyRowForAi),
    },
    cloudLayerCoverageContext: {
      layerCompletenessLevel: cloudLayerCompleteness.layerCompletenessLevel,
      nearTermCloudLowPercent: nearTermCloudSummary.cloudLowPercent,
      nearTermCloudMidPercent: nearTermCloudSummary.cloudMidPercent,
      nearTermCloudHighPercent: nearTermCloudSummary.cloudHighPercent,
    },
    cloudLayerCompletenessSummary: {
      cloudLayerBasis: cloudLayerCompleteness.cloudLayerBasis,
      layerCompletenessLevel: cloudLayerCompleteness.layerCompletenessLevel,
      cautionLevel: cloudLayerCompleteness.cautionLevel,
      totalHoursCount: cloudLayerCompleteness.totalHoursCount,
      completeLayerHoursCount: cloudLayerCompleteness.completeLayerHoursCount,
      missingLayerHoursCount: cloudLayerCompleteness.missingLayerHoursCount,
      lowLayerMissingHoursCount: cloudLayerCompleteness.lowLayerMissingHoursCount,
      missingLayerFields: cloudLayerCompleteness.missingLayerFields,
      userNoteZh: limitText(cloudLayerCompleteness.userNoteZh, 100),
      professionalNoteZh: limitText(cloudLayerCompleteness.professionalNoteZh, 100),
    },
    cloudBasisConsistencySummary: {
      cloudBasisLevel: cloudBasisConsistency.cloudBasisLevel,
      professionalSummaryZh: limitText(
        providerNeutralText(cloudBasisConsistency.professionalSummaryZh),
        100,
      ),
      shouldLowerCloudSeaConfidence: cloudBasisConsistency.shouldLowerCloudSeaConfidence,
    },
    weatherVariableConsistencySummary: {
      consistencyLevel: weatherVariableConsistency.consistencyLevel,
      temperatureBasisStatus: weatherVariableConsistency.temperatureBasisStatus,
      humidityDewPointStatus: weatherVariableConsistency.humidityDewPointStatus,
      precipitationSignalStatus: weatherVariableConsistency.precipitationSignalStatus,
      cloudBasisStatus: weatherVariableConsistency.cloudBasisStatus,
      visibilityStatus: weatherVariableConsistency.visibilityStatus,
      windStatus: weatherVariableConsistency.windStatus,
      shouldLowerConfidence: weatherVariableConsistency.shouldLowerConfidence,
      shouldAvoidStrongWording: weatherVariableConsistency.shouldAvoidStrongWording,
      shouldDowngradePrecipitationWording:
        weatherVariableConsistency.shouldDowngradePrecipitationWording,
      userSummaryZh: limitText(providerNeutralText(weatherVariableConsistency.userSummaryZh), 100),
      professionalSummaryZh: limitText(
        providerNeutralText(weatherVariableConsistency.professionalSummaryZh),
        120,
      ),
      warningsZh: takeTextItems(
        weatherVariableConsistency.warningsZh.map((item) => providerNeutralText(item) ?? item),
        3,
        90,
      ),
    },
    multiSourceAgreementSummary: agreement
      ? {
          agreementLevel: agreement.agreementLevel,
          disagreementLevel: agreement.disagreementLevel,
          shouldLowerConfidence: agreement.shouldLowerConfidence,
          shouldShowReviewWarning: agreement.shouldShowReviewWarning,
          userSummaryZh: limitText(providerNeutralText(agreement.userSummaryZh), 140),
          professionalSummaryZh: limitText(
            providerNeutralText(agreement.professionalSummaryZh),
            100,
          ),
          keyWarningsZh: takeTextItems(
            agreement.keyWarningsZh.map((item) => providerNeutralText(item) ?? item),
            2,
            80,
          ),
          fieldDisagreements: takeItems(agreement.fieldDisagreements, 2).map((item) => ({
            field: item.field,
            level: item.level,
            messageZh: limitText(providerNeutralText(item.messageZh), 80),
          })),
        }
      : null,
    risks: {
      whiteoutReasons: takeTextItems(analysis.whiteoutReasons, 3, 80),
      missingDataNotes: takeTextItems(
        analysis.missingDataNotes.map((item) => providerNeutralText(item) ?? item),
        3,
        80,
      ),
      riskFlags: compactRiskFlags(result.riskFlags, 4),
    },
    actionPlan: {
      finalRecommendationZh: recommendationGuard.finalRecommendationLabel,
      explanationActionSummaryZh: limitText(
        providerNeutralText(recommendationExplanation.actionSummaryZh),
        120,
      ),
      travelRecommendations: takeItems(analysis.travelRecommendations, 1).map((item) => ({
        situation: item.situation,
        action: limitText(item.action, 70),
        detail: limitText(item.detail, 80),
      })),
      backupPlans: takeItems(analysis.backupPlans, 1).map((item) => ({
        condition: limitText(item.condition, 70),
        action: limitText(item.action, 70),
        detail: limitText(item.detail, 80),
      })),
      deterministicAdvice: takeTextItems(result.photographyAdvice, 1, 90),
    },
    riskReview: {
      precipitationRiskZh: limitText(providerNeutralText(precipitationSignal.userSummaryZh), 90),
      cloudBasisRiskZh: limitText(providerNeutralText(cloudBasisConsistency.userSummaryZh), 90),
    },
  };
}

export function buildGlowAiExplainPayload(
  result: ForecastCalculationResult,
  detail: DeepSeekForecastContextDetail = "standard",
) {
  const timezone = result.calendarBasis.timezone;
  const isBudget = detail === "budget";
  const textLimit = isBudget ? 55 : detail === "minimal" ? 70 : 110;
  const analysis = result.glowAnalysis;
  const professionalRows = professionalHourlyRowsAtOrAfterAnchor(
    result.professionalHourlyData ?? [],
    result.professionalHourlyDataTimeBasis?.anchorStartLocal,
    result.professionalHourlyDataTimeBasis?.expectedRowCount ??
      result.professionalHourlyDataTimeBasis?.requestedHours,
  );
  const focusedRows = professionalHourlyRowsForGlowPayload(result, professionalRows, detail);
  const glowWindowStates = buildGlowPromptWindowStates(result);
  const sunriseWindowState = selectGlowPromptPhaseState(result, glowWindowStates, "sunrise");
  const sunsetWindowState = selectGlowPromptPhaseState(result, glowWindowStates, "sunset");
  const precipitationSummary = summarizeProfessionalHourlyPrecipitation(focusedRows);
  const maxWindSpeedMs = maxNullableNumber(focusedRows.map((row) => row.windSpeedMs));
  const preferredWindowState = selectGlowPromptPrimaryState(result, glowWindowStates);
  const preferredPhase =
    preferredWindowState?.phase ??
    (analysis.sunriseGlowScore >= analysis.sunsetGlowScore ? "sunrise" : "sunset");
  const preferredProbability = preferredWindowState?.probabilityPercent ?? 0;
  const preferredTargetZh =
    preferredWindowState === undefined
      ? "暂无后续霞光窗口"
      : preferredPhase === "sunrise"
        ? "朝霞"
        : preferredPhase === "sunset"
          ? "晚霞"
          : "霞光";
  const backupPlan = analysis.backupPlans[0];

  return {
    contextVersion: "glow-ai-explain-v3",
    target: "glow",
    targetCode: "glow",
    deterministicOnly: true,
    instruction:
      "Explain deterministic sunrise/sunset glow facts only. Keep three concepts separate: 出现可能性, 出现后的鲜艳程度, and 是否值得前往. Use lifecycle, occurrence probability, vividness, practical recommendation, best local time, one main reason, one main risk, and one backup plan. Do not recommend ended windows as actionable. Do not recompute or change occurrence probability, vividness, practical scores, windows, sun times, cloud values, aerosol values, terrain obstruction, provider agreement, or deterministic recommendation.",
    locationName: limitText(result.place.name, 80),
    horizon: {
      key: result.horizon,
      forecastRange: result.calendarBasis.forecastRangeLabel,
      timezone,
      targetDates: takeItems(result.targetDates, isBudget ? 1 : detail === "minimal" ? 2 : 4),
    },
    primaryDecision: {
      preferredTargetZh,
      preferredProbabilityPercent: preferredProbability,
      preferredProbabilityDisplay: preferredWindowState?.probabilityDisplay ?? "暂无后续窗口",
      lifecycle: preferredWindowState?.lifecycle ?? "unavailable",
      actionable: preferredWindowState?.isActionable ?? false,
      preferredWindowZh: preferredWindowState
        ? formatGlowWindowStateForAiDisplay(preferredWindowState, timezone)
        : "暂无明确最佳时间",
      recommendedArrivalZh: preferredWindowState
        ? recommendedGlowArrivalForStateZh(preferredWindowState, timezone)
        : "临近更新后再决定到达时间",
      recommendationZh: preferredWindowState
        ? glowPromptRecommendationZh(preferredWindowState)
        : "暂无后续窗口",
      mainReasonZh: limitText(
        firstText(
          [preferredWindowState?.window?.noteZh, ...analysis.opportunityReasons],
          "霞光机会由中高云、低云遮挡、降水和通透度共同决定。",
        ),
        textLimit,
      ),
      mainRiskZh: limitText(
        firstText(analysis.riskReasons, "主要风险较低，仍需临近复核。"),
        textLimit,
      ),
      backupPlanZh: backupPlan
        ? limitText(`${backupPlan.condition}：${backupPlan.action}`, textLimit)
        : "若霞光不足，转拍远山层次、云缝光或通透地景。",
    },
    sunriseGlow: {
      probabilityPercent: sunriseWindowState.probabilityPercent,
      probabilityDisplay: sunriseWindowState.probabilityDisplay,
      vividnessIndex: sunriseWindowState.vividnessIndex,
      vividnessLevel: sunriseWindowState.vividnessLevel,
      practicalSuitabilityScore: sunriseWindowState.practicalSuitabilityScore,
      confidence: sunriseWindowState.confidence,
      providerAgreementStatus: sunriseWindowState.providerAgreement?.status,
      lifecycle: sunriseWindowState.lifecycle,
      actionable: sunriseWindowState.isActionable,
      recommendationZh: glowPromptRecommendationZh(sunriseWindowState),
      bestWindow: compactGlowWindowStateForAi(sunriseWindowState, timezone, textLimit, detail),
      sunEvent: compactGlowSunEvent(
        result,
        "sunrise",
        sunriseWindowState,
        timezone,
        textLimit,
        detail,
      ),
    },
    sunsetGlow: {
      probabilityPercent: sunsetWindowState.probabilityPercent,
      probabilityDisplay: sunsetWindowState.probabilityDisplay,
      vividnessIndex: sunsetWindowState.vividnessIndex,
      vividnessLevel: sunsetWindowState.vividnessLevel,
      practicalSuitabilityScore: sunsetWindowState.practicalSuitabilityScore,
      confidence: sunsetWindowState.confidence,
      providerAgreementStatus: sunsetWindowState.providerAgreement?.status,
      lifecycle: sunsetWindowState.lifecycle,
      actionable: sunsetWindowState.isActionable,
      recommendationZh: glowPromptRecommendationZh(sunsetWindowState),
      bestWindow: compactGlowWindowStateForAi(sunsetWindowState, timezone, textLimit, detail),
      sunEvent: compactGlowSunEvent(
        result,
        "sunset",
        sunsetWindowState,
        timezone,
        textLimit,
        detail,
      ),
    },
    deterministicAuthority: {
      sunriseGlowScore: analysis.sunriseGlowScore,
      sunsetGlowScore: analysis.sunsetGlowScore,
      occurrenceProbabilityPercent: analysis.occurrenceProbabilityPercent,
      vividnessIndex: analysis.vividnessIndex,
      vividnessLevel: analysis.vividnessLevel,
      practicalSuitabilityScore: analysis.practicalSuitabilityScore,
      calibrationMode: analysis.calibrationMode,
      providerAgreement: {
        status: analysis.providerAgreement.status,
        providerCount: analysis.providerAgreement.providerCount,
        modelCount: analysis.providerAgreement.modelCount,
        modelSpread: analysis.providerAgreement.modelSpread,
      },
      glowTravelScore: analysis.glowTravelScore,
      recommendationLabelZh: glowDisplayRecommendationForScore(analysis.glowTravelScore),
      confidenceLevel: analysis.confidenceLevel,
      noteZh:
        "These deterministic occurrence, vividness, practical, window, and confidence values are authoritative; AI must not change them.",
    },
    whyThisJudgment: [
      {
        labelZh: "中高云条件",
        valueZh: analysis.labels.colorCarrier,
        detailZh: limitText(
          compactGlowEvidenceByLabel(analysis.cloudLayerEvidence, "中云", textLimit)?.noteZh ??
            compactGlowEvidenceByLabel(analysis.cloudLayerEvidence, "高云", textLimit)?.noteZh,
          textLimit,
        ),
      },
      {
        labelZh: "低云遮挡",
        valueZh: analysis.labels.lowCloudObstruction,
        detailZh: limitText(
          compactGlowEvidenceByLabel(analysis.cloudLayerEvidence, "低云", textLimit)?.noteZh,
          textLimit,
        ),
      },
      {
        labelZh: "降水风险",
        valueZh: analysis.glowWindowRainRisk,
        detailZh: limitText(
          analysis.rainOverlapsSunriseWindow || analysis.rainOverlapsSunsetWindow
            ? "降水与朝霞或晚霞窗口存在重叠，需要临近复核。"
            : "降水与主要晨昏窗口重叠较少。",
          textLimit,
        ),
      },
      {
        labelZh: "通透度",
        valueZh: `${Math.round(analysis.visibilityColorQualityScore)} 分`,
        detailZh: limitText(
          compactGlowEvidenceByLabel(analysis.visibilityEvidence, "能见度", textLimit)?.noteZh,
          textLimit,
        ),
      },
    ],
    professionalHourlySummary: {
      rowCount: professionalRows.length,
      focusedRowCount: focusedRows.length,
      precipitationProbabilityPercent: precipitationSummary.probabilityPercent,
      precipitationAmountMm: precipitationSummary.amountMm,
      maxWindSpeedMs,
    },
    actionPlan: {
      recommendationLabelZh: glowDisplayRecommendationForScore(analysis.glowTravelScore),
      travelAdviceZh: takeTextItems(
        analysis.travelRecommendations.map((item) => providerNeutralText(item) ?? item),
        isBudget ? 1 : detail === "minimal" ? 1 : 2,
        textLimit,
      ),
      backupPlans: takeItems(analysis.backupPlans, isBudget ? 1 : 1).map((plan) => ({
        condition: limitText(plan.condition, 50),
        action: limitText(plan.action, 60),
        detail: limitText(plan.detail, textLimit),
      })),
    },
    dailyGlowSummary: takeItems(
      analysis.dailyGlow,
      isBudget ? 0 : detail === "minimal" ? 1 : 2,
    ).map((day) => ({
      date: day.date,
      dateZh: formatDateLabelZh(day.date, timezone, day.dateLabelZh),
      sunriseProbabilityPercent: day.sunriseOccurrenceProbabilityPercent ?? day.sunriseScore,
      sunsetProbabilityPercent: day.sunsetOccurrenceProbabilityPercent ?? day.sunsetScore,
      sunriseVividnessIndex: day.sunriseVividnessIndex,
      sunsetVividnessIndex: day.sunsetVividnessIndex,
      sunrisePracticalSuitabilityScore: day.sunrisePracticalSuitabilityScore,
      sunsetPracticalSuitabilityScore: day.sunsetPracticalSuitabilityScore,
      bestTarget: day.bestTarget,
      recommendationLabelZh: glowDisplayRecommendationForScore(
        day.practicalScore ?? Math.max(day.sunriseScore, day.sunsetScore),
      ),
      sunriseLifecycle: glowPromptLifecycleForDatePhase(result, day.date, "sunrise"),
      sunsetLifecycle: glowPromptLifecycleForDatePhase(result, day.date, "sunset"),
      bestWindow: compactGlowWindowStateForAi(
        glowPromptWindowStateForDailyWindow(result, day.bestWindow),
        timezone,
        textLimit,
        detail,
      ),
      keyReasonZh: limitText(day.keyReason, textLimit),
      riskNoteZh: limitText(day.riskNote, textLimit),
    })),
    missingDataNotes: takeTextItems(analysis.missingDataNotes, isBudget ? 1 : 3, textLimit),
  };
}

type GlowPromptPhase = "sunrise" | "sunset";

type GlowPromptWindow =
  | ForecastCalculationResult["glowAnalysis"]["bestGlowWindows"][number]
  | ForecastCalculationResult["glowAnalysis"]["watchableGlowWindows"][number]
  | ForecastCalculationResult["glowAnalysis"]["notRecommendedGlowWindows"][number];

type GlowPromptWindowState = {
  readonly phase: GlowPromptPhase;
  readonly lifecycle: GlowWindowLifecycleState;
  readonly isActionable: boolean;
  readonly window?: GlowPromptWindow;
  readonly date?: string;
  readonly startAt?: string;
  readonly endAt?: string;
  readonly score: number;
  readonly probabilityPercent: number;
  readonly probabilityDisplay: string;
  readonly vividnessIndex?: number;
  readonly vividnessLevel?: GlowVividnessLevel;
  readonly practicalSuitabilityScore?: number;
  readonly confidence?: number;
  readonly calibrationMode?: string;
  readonly providerAgreement?: GlowProviderAgreement;
};

function buildGlowPromptWindowStates(
  result: ForecastCalculationResult,
): readonly GlowPromptWindowState[] {
  return allGlowPromptWindows(result.glowAnalysis).map((window) =>
    glowPromptWindowStateForWindow(
      result,
      window,
      window.practicalSuitabilityScore ?? window.practicalScore ?? window.score,
    ),
  );
}

function allGlowPromptWindows(
  analysis: ForecastCalculationResult["glowAnalysis"],
): readonly GlowPromptWindow[] {
  const windows = [
    analysis.bestGlowWindow,
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
  ].filter((window): window is GlowPromptWindow => Boolean(window));
  const seen = new Set<string>();
  const unique: GlowPromptWindow[] = [];

  for (const window of windows) {
    const key = `${window.type}-${window.start}-${window.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(window);
  }

  return unique;
}

function selectGlowPromptPhaseState(
  result: ForecastCalculationResult,
  states: readonly GlowPromptWindowState[],
  phase: GlowPromptPhase,
): GlowPromptWindowState {
  const score =
    phase === "sunrise"
      ? result.glowAnalysis.sunriseGlowScore
      : result.glowAnalysis.sunsetGlowScore;
  const phaseStates = states.filter((state) => state.phase === phase);
  const actionable = selectGlowPromptActionableState(result, phaseStates);
  if (actionable) {
    return actionable;
  }

  const currentDate = glowLocalDateKey(
    glowPromptEvaluatedAt(result),
    result.calendarBasis.timezone,
  );
  const currentEnded = phaseStates
    .filter((state) => state.lifecycle === "ended" && state.date === currentDate)
    .sort((left, right) => Date.parse(right.endAt ?? "") - Date.parse(left.endAt ?? ""))[0];
  if (currentEnded) {
    return currentEnded;
  }

  const derivedEnded = currentDate
    ? derivedEndedGlowPromptState(result, phase, currentDate, score)
    : undefined;
  return derivedEnded ?? unavailableGlowPromptState(result, phase, score);
}

function selectGlowPromptPrimaryState(
  result: ForecastCalculationResult,
  states: readonly GlowPromptWindowState[],
): GlowPromptWindowState | undefined {
  return selectGlowPromptActionableState(result, states);
}

function selectGlowPromptActionableState(
  result: ForecastCalculationResult,
  states: readonly GlowPromptWindowState[],
): GlowPromptWindowState | undefined {
  const actionables = states.filter((state) => state.isActionable);
  if (actionables.length === 0) {
    return undefined;
  }

  const currentDate = glowLocalDateKey(
    glowPromptEvaluatedAt(result),
    result.calendarBasis.timezone,
  );
  const currentDateStates = currentDate
    ? actionables.filter((state) => state.date === currentDate)
    : [];
  if (currentDateStates.length > 0) {
    return [...currentDateStates].sort(compareGlowPromptStates)[0];
  }

  const futureDates = [
    ...new Set(
      actionables
        .map((state) => state.date)
        .filter((date): date is string => Boolean(date))
        .filter((date) => !currentDate || date > currentDate),
    ),
  ].sort();
  const nextDate = futureDates[0];
  const nextDateStates = nextDate ? actionables.filter((state) => state.date === nextDate) : [];
  const pool = nextDateStates.length > 0 ? nextDateStates : actionables;

  return [...pool].sort(compareGlowPromptStates)[0];
}

function compareGlowPromptStates(
  left: GlowPromptWindowState,
  right: GlowPromptWindowState,
): number {
  return (
    glowPromptLifecycleRank(left.lifecycle) - glowPromptLifecycleRank(right.lifecycle) ||
    right.score - left.score ||
    Date.parse(left.startAt ?? "") - Date.parse(right.startAt ?? "")
  );
}

function glowPromptLifecycleRank(state: GlowWindowLifecycleState): number {
  if (state === "active") {
    return 0;
  }
  if (state === "upcoming") {
    return 1;
  }
  if (state === "ended") {
    return 2;
  }
  return 3;
}

function glowPromptWindowStateForDailyWindow(
  result: ForecastCalculationResult,
  window: GlowPromptWindow | undefined,
): GlowPromptWindowState | undefined {
  return window
    ? glowPromptWindowStateForWindow(
        result,
        window,
        window.practicalSuitabilityScore ?? window.practicalScore ?? window.score,
      )
    : undefined;
}

function glowPromptLifecycleForDatePhase(
  result: ForecastCalculationResult,
  date: string,
  phase: GlowPromptPhase,
) {
  const state =
    buildGlowPromptWindowStates(result).find(
      (item) => item.date === date && item.phase === phase,
    ) ?? derivedEndedGlowPromptState(result, phase, date, phaseScoreForPrompt(result, phase));

  return {
    lifecycle: state?.lifecycle ?? "unavailable",
    actionable: state?.isActionable ?? false,
    windowZh:
      state?.startAt && state.endAt
        ? formatLocalTimeRange(state.startAt, state.endAt, result.calendarBasis.timezone)
        : null,
  };
}

function glowPromptWindowStateForWindow(
  result: ForecastCalculationResult,
  window: GlowPromptWindow,
  score: number,
): GlowPromptWindowState {
  const lifecycle = classifyGlowWindowLifecycle({
    startAt: window.start,
    endAt: window.end,
    evaluatedAt: glowPromptEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
  }).state;
  const probabilityPercent = promptPercent(window.occurrenceProbabilityPercent ?? score);
  const practicalSuitabilityScore = promptPercent(
    window.practicalSuitabilityScore ?? window.practicalScore ?? score,
  );

  return {
    phase: glowWindowPhase(window),
    lifecycle,
    isActionable: isGlowWindowRecommendationEligible(lifecycle),
    window,
    date: window.date ?? glowLocalDateKey(window.start, result.calendarBasis.timezone) ?? undefined,
    startAt: window.start,
    endAt: window.end,
    score: practicalSuitabilityScore,
    probabilityPercent,
    probabilityDisplay: glowPromptProbabilityDisplay(lifecycle, probabilityPercent),
    vividnessIndex: window.vividnessIndex,
    vividnessLevel: window.vividnessLevel,
    practicalSuitabilityScore,
    confidence: window.confidence,
    calibrationMode: window.calibrationMode,
    providerAgreement: window.providerAgreement,
  };
}

function derivedEndedGlowPromptState(
  result: ForecastCalculationResult,
  phase: GlowPromptPhase,
  date: string,
  score: number,
): GlowPromptWindowState | undefined {
  const window = derivedGlowPromptSunWindowForDate(result, phase, date);
  if (!window) {
    return undefined;
  }
  const lifecycle = classifyGlowWindowLifecycle({
    startAt: window.startAt,
    endAt: window.endAt,
    evaluatedAt: glowPromptEvaluatedAt(result),
    timezone: result.calendarBasis.timezone,
  }).state;
  if (lifecycle !== "ended") {
    return undefined;
  }
  const probabilityPercent = promptPercent(score);

  return {
    phase,
    lifecycle,
    isActionable: false,
    date,
    startAt: window.startAt,
    endAt: window.endAt,
    score,
    probabilityPercent,
    probabilityDisplay: "已结束",
  };
}

function unavailableGlowPromptState(
  result: ForecastCalculationResult,
  phase: GlowPromptPhase,
  score: number,
): GlowPromptWindowState {
  const probabilityPercent = promptPercent(score);
  return {
    phase,
    lifecycle: "unavailable",
    isActionable: false,
    score,
    probabilityPercent,
    probabilityDisplay: "暂无明确时间",
    date:
      glowLocalDateKey(glowPromptEvaluatedAt(result), result.calendarBasis.timezone) ?? undefined,
  };
}

function derivedGlowPromptSunWindowForDate(
  result: ForecastCalculationResult,
  phase: GlowPromptPhase,
  date: string,
): { readonly startAt: string; readonly endAt: string } | undefined {
  const astro = result.astroSummaries.find((summary) => summary.date === date);
  if (!astro) {
    return undefined;
  }
  if (phase === "sunrise" && astro.sunriseGlowBestStartAt && astro.sunriseGlowBestEndAt) {
    return {
      startAt: astro.sunriseGlowBestStartAt,
      endAt: astro.sunriseGlowBestEndAt,
    };
  }
  if (phase === "sunset" && astro.sunsetGlowBestStartAt && astro.sunsetGlowBestEndAt) {
    return {
      startAt: astro.sunsetGlowBestStartAt,
      endAt: astro.sunsetGlowBestEndAt,
    };
  }
  return undefined;
}

function phaseScoreForPrompt(result: ForecastCalculationResult, phase: GlowPromptPhase): number {
  return phase === "sunrise"
    ? result.glowAnalysis.sunriseGlowScore
    : result.glowAnalysis.sunsetGlowScore;
}

function glowPromptEvaluatedAt(result: ForecastCalculationResult): string {
  return result.generatedAt || result.calendarBasis.forecastStart;
}

function glowPromptProbabilityDisplay(
  lifecycle: GlowWindowLifecycleState,
  probabilityPercent: number,
): string {
  if (lifecycle === "ended") {
    return "已结束";
  }
  if (lifecycle === "unavailable") {
    return "暂无明确时间";
  }
  return `${probabilityPercent}%`;
}

function promptPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function glowPromptRecommendationZh(state: GlowPromptWindowState): string {
  if (state.lifecycle === "active") {
    return "窗口进行中";
  }
  if (state.lifecycle === "ended") {
    return "已结束";
  }
  if (state.lifecycle === "unavailable") {
    return "暂无明确时间";
  }
  return glowDisplayRecommendationForScore(state.score);
}

function glowWindowPhase(
  window: Pick<
    ForecastCalculationResult["glowAnalysis"]["bestGlowWindows"][number],
    "type" | "start" | "phase"
  >,
): "sunrise" | "sunset" {
  if (window.phase === "sunrise") {
    return "sunrise";
  }
  if (window.phase === "sunset") {
    return "sunset";
  }
  if (
    ["sunrise_glow", "pre_dawn_glow", "sunrise_core", "morning_warm_light", "sunrise"].includes(
      window.type,
    )
  ) {
    return "sunrise";
  }
  if (
    [
      "sunset_glow",
      "sunset_warm_light",
      "sunset_core",
      "afterglow",
      "blue_hour_transition",
      "sunset",
    ].includes(window.type)
  ) {
    return "sunset";
  }
  const hour = hourOf(window.start);
  return typeof hour === "number" && hour < 12 ? "sunrise" : "sunset";
}

function compactGlowWindowStateForAi(
  state: GlowPromptWindowState | undefined,
  timezone: string,
  textLimit: number,
  detail: DeepSeekForecastContextDetail = "standard",
) {
  if (!state || !state.startAt || !state.endAt || state.lifecycle === "unavailable") {
    return null;
  }
  const window = state.window;
  if (detail === "budget") {
    return {
      type: window?.type,
      phase: state.phase,
      lifecycle: state.lifecycle,
      actionable: state.isActionable,
      labelZh: window?.labelZh ?? `${glowPromptPhaseLabel(state.phase)}窗口`,
      date: state.date,
      windowZh: formatLocalTimeRange(state.startAt, state.endAt, timezone),
      probabilityPercent: state.probabilityPercent,
      probabilityDisplay: state.probabilityDisplay,
      vividnessIndex: state.vividnessIndex,
      vividnessLevel: state.vividnessLevel,
      practicalSuitabilityScore: state.practicalSuitabilityScore,
      confidence: state.confidence,
      providerAgreementStatus: state.providerAgreement?.status,
      score: state.score,
      rainOverlapsWindow: window?.rainOverlapsWindow,
      riskTags: takeTextItems(window?.riskTags ?? [], 2, 40),
      noteZh: limitText(window?.noteZh ?? glowPromptActionabilityZh(state), textLimit),
    };
  }
  return {
    type: window?.type,
    phase: state.phase,
    lifecycle: state.lifecycle,
    actionable: state.isActionable,
    actionabilityZh: glowPromptActionabilityZh(state),
    labelZh: window?.labelZh ?? `${glowPromptPhaseLabel(state.phase)}窗口`,
    date: state.date,
    windowZh: formatLocalTimeRange(state.startAt, state.endAt, timezone),
    originalWindowZh: formatShootingWindowZh(
      { startTime: state.startAt, endTime: state.endAt },
      timezone,
    ),
    probabilityPercent: state.probabilityPercent,
    probabilityDisplay: state.probabilityDisplay,
    vividnessIndex: state.vividnessIndex,
    vividnessLevel: state.vividnessLevel,
    practicalSuitabilityScore: state.practicalSuitabilityScore,
    confidence: state.confidence,
    calibrationMode: state.calibrationMode,
    providerAgreement: state.providerAgreement
      ? {
          status: state.providerAgreement.status,
          providerCount: state.providerAgreement.providerCount,
          modelCount: state.providerAgreement.modelCount,
          modelSpread: state.providerAgreement.modelSpread,
        }
      : undefined,
    score: state.score,
    colorCarrierScore: window?.colorCarrierScore,
    lowCloudObstructionRisk: window?.lowCloudObstructionRisk,
    precipitationDisruptionRisk: window?.precipitationDisruptionRisk,
    visibilityColorQualityScore: window?.visibilityColorQualityScore,
    aerosolScore: window?.aerosolScore,
    terrainScore: window?.terrainScore,
    rainOverlapsWindow: window?.rainOverlapsWindow,
    postRainOpeningChance: window?.postRainOpeningChance,
    glowWindowRainRisk: window?.glowWindowRainRisk,
    riskTags: takeTextItems(window?.riskTags ?? [], 3, 50),
    noteZh: limitText(window?.noteZh ?? glowPromptActionabilityZh(state), textLimit),
  };
}

function formatGlowWindowStateForAiDisplay(state: GlowPromptWindowState, timezone: string): string {
  if (!state.startAt || !state.endAt) {
    return "暂无明确最佳时间";
  }
  return `${state.window?.labelZh ?? `${glowPromptPhaseLabel(state.phase)}窗口`} ${formatShootingWindowZh(
    { startTime: state.startAt, endTime: state.endAt },
    timezone,
  )}`;
}

function recommendedGlowArrivalForStateZh(state: GlowPromptWindowState, timezone: string): string {
  if (state.lifecycle === "active") {
    return "窗口进行中，建议尽快到位";
  }
  if (state.lifecycle === "ended") {
    return "本次窗口已结束，不建议为此窗口到达";
  }
  if (state.lifecycle === "unavailable" || !state.startAt) {
    return "临近更新后再决定到达时间";
  }
  const startMs = Date.parse(state.startAt);
  if (!Number.isFinite(startMs)) {
    return "建议提前 45 分钟到达";
  }
  const arrival = new Date(startMs - 45 * 60 * 1000);
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(arrival);
  return `建议 ${time} 前到达`;
}

function compactGlowSunEvent(
  result: ForecastCalculationResult,
  phase: GlowPromptPhase,
  state: GlowPromptWindowState,
  timezone: string,
  textLimit: number,
  detail: DeepSeekForecastContextDetail,
) {
  const astro = astroSummaryForGlowPhase(result, phase, state.date);
  const eventTime = phase === "sunrise" ? astro?.sunrise : astro?.sunset;
  const civilStart = phase === "sunrise" ? astro?.civilDawn : astro?.sunset;
  const civilEnd = phase === "sunrise" ? astro?.sunrise : astro?.civilDusk;
  const solarAzimuthDegrees = phase === "sunrise" ? astro?.sunriseAzimuth : astro?.sunsetAzimuth;

  return {
    score:
      phase === "sunrise"
        ? result.glowAnalysis.sunriseGlowScore
        : result.glowAnalysis.sunsetGlowScore,
    statusZh:
      phase === "sunrise"
        ? result.glowAnalysis.labels.sunriseGlowOpportunity
        : result.glowAnalysis.labels.sunsetGlowOpportunity,
    eventTime,
    lifecycle: state.lifecycle,
    actionable: state.isActionable,
    civilTwilightWindowZh:
      civilStart && civilEnd
        ? formatShootingWindowZh({ startTime: civilStart, endTime: civilEnd }, timezone)
        : undefined,
    solarAzimuthDegrees,
    bestWindow:
      detail === "budget"
        ? undefined
        : compactGlowWindowStateForAi(state, timezone, textLimit, detail),
    arrivalPreparationZh: glowArrivalPreparationZh(result, phase, state, timezone, textLimit),
  };
}

function astroSummaryForGlowPhase(
  result: ForecastCalculationResult,
  phase: "sunrise" | "sunset",
  date: string | undefined,
) {
  const withDate = date
    ? result.astroSummaries.find((summary) => summary.date === date)
    : undefined;
  return (
    withDate ??
    result.astroSummaries.find((summary) =>
      phase === "sunrise" ? summary.sunrise : summary.sunset,
    )
  );
}

function glowArrivalPreparationZh(
  result: ForecastCalculationResult,
  phase: GlowPromptPhase,
  state: GlowPromptWindowState,
  timezone: string,
  textLimit: number,
): string {
  if (state.lifecycle === "ended") {
    return "该窗口已结束，不作为当前到达建议。";
  }
  if (state.lifecycle === "active") {
    return "窗口进行中，建议尽快到位并现场复核云层。";
  }
  if (state.lifecycle === "unavailable") {
    return "暂无明确到达时间，出发前优先复核日出/日落窗口、云层和降水。";
  }

  const keyword = phase === "sunrise" ? /(朝霞|日出)/ : /(晚霞|日落|余晖)/;
  const deterministicAdvice = result.glowAnalysis.travelRecommendations.find((item) =>
    keyword.test(item),
  );
  if (deterministicAdvice) {
    return limitText(deterministicAdvice, textLimit);
  }
  if (state.startAt && state.endAt) {
    return `按 ${formatShootingWindowZh(
      { startTime: state.startAt, endTime: state.endAt },
      timezone,
    )} 提前完成到位、构图和安全复核。`;
  }
  return "暂无明确到达时间，出发前优先复核日出/日落窗口、云层和降水。";
}

function glowPromptActionabilityZh(state: GlowPromptWindowState): string {
  if (state.lifecycle === "ended") {
    return "窗口已结束，不作为当前行动建议。";
  }
  if (state.lifecycle === "active") {
    return "窗口进行中，优先现场复核。";
  }
  if (state.lifecycle === "upcoming") {
    return "未来窗口，可作为当前推荐候选。";
  }
  return "暂无可靠 deterministic 窗口。";
}

function glowPromptPhaseLabel(phase: GlowPromptPhase): "朝霞" | "晚霞" {
  return phase === "sunrise" ? "朝霞" : "晚霞";
}

function compactGlowEvidenceByLabel(
  items: readonly ForecastCalculationResult["glowAnalysis"]["cloudLayerEvidence"][number][],
  label: string,
  textLimit: number,
) {
  const item = items.find((entry) => entry.label.includes(label));
  if (!item) {
    return null;
  }
  return {
    label: item.label,
    value: item.value,
    effect: item.effect,
    noteZh: limitText(item.noteZh, textLimit),
  };
}

function professionalHourlyRowsForGlowPayload(
  result: ForecastCalculationResult,
  rows: readonly NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number][],
  detail: DeepSeekForecastContextDetail,
) {
  const limit = detail === "budget" ? 1 : detail === "minimal" ? 2 : 3;
  const windows = [
    result.glowAnalysis.bestGlowWindow,
    ...result.glowAnalysis.bestGlowWindows,
    ...result.glowAnalysis.watchableGlowWindows,
  ].filter((window): window is NonNullable<typeof window> => Boolean(window));
  const focused = rows.filter((row) =>
    windows.some((window) => isTimeWithinRange(row.time, window.start, window.end)),
  );
  return takeItems(focused.length > 0 ? focused : rows, limit);
}

function compactProfessionalHourlyTimeBasisForAi(
  basis: ForecastCalculationResult["professionalHourlyDataTimeBasis"],
  detail: DeepSeekForecastContextDetail,
) {
  if (!basis) {
    return null;
  }

  const compactBasis = {
    startTime: basis.startTime,
    endTime: basis.endTime,
    stepMinutes: basis.stepMinutes,
    anchorStartLocal: basis.anchorStartLocal,
    anchorEndLocal: basis.anchorEndLocal,
    expectedRowCount: basis.expectedRowCount,
    requestedHours: basis.requestedHours,
    recommendedRequestHours: basis.recommendedRequestHours,
    requiredForecastDays: basis.requiredForecastDays,
    providerCoverageVersion: basis.providerCoverageVersion,
    coverageRule: basis.coverageRule,
    displayRangeZh: basis.displayRangeZh,
    partialData: basis.partialData,
    cloudLayerBasis: basis.cloudLayerBasis,
  };

  if (detail === "minimal") {
    return compactBasis;
  }

  return {
    ...compactBasis,
    generatedAtLocal: basis.generatedAtLocal,
    displayLabel: basis.displayLabel,
    isFutureOnly: basis.isFutureOnly,
    anchorRule: basis.anchorRule,
    cloudLayerBasisNoteZh: limitText(providerNeutralText(basis.cloudLayerBasisNoteZh), 120),
    missingDataNoteZh: limitText(providerNeutralText(basis.missingDataNoteZh), 120),
  };
}

function compactTemperatureBasisForAi(
  weatherVariableConsistency: ReturnType<typeof buildCloudSeaWeatherVariableConsistencyContext>,
) {
  const context = weatherVariableConsistency.temperatureBasisContext;
  return {
    temperatureBasis: context.temperatureBasis,
    displayTemperatureC: context.displayTemperatureC,
    displayTemperatureRangeC: context.displayTemperatureRangeC,
    rawGridTemperatureC: context.rawGridTemperatureC,
    terrainAdjustedTemperatureC: context.terrainAdjustedTemperatureC,
    userNoteZh: limitText(providerNeutralText(context.userNoteZh), 90),
    professionalNoteZh: limitText(providerNeutralText(context.professionalNoteZh), 110),
  };
}

function summarizeProfessionalHourlyPrecipitation(
  rows: readonly NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number][],
) {
  const amountValues = rows
    .map((row) => row.precipitationAmountMm)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const probabilityValues = rows
    .map((row) => row.precipitationProbabilityPercent)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    amountMm: amountValues.length > 0 ? Math.round(Math.max(...amountValues) * 10) / 10 : null,
    probabilityPercent:
      probabilityValues.length > 0 ? Math.round(Math.max(...probabilityValues)) : null,
  };
}

function summarizeProfessionalHourlyCloudLayers(
  rows: readonly NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number][],
) {
  return {
    cloudLowPercent: maxNullableNumber(rows.map((row) => row.cloudLowPercent)),
    cloudMidPercent: maxNullableNumber(rows.map((row) => row.cloudMidPercent)),
    cloudHighPercent: maxNullableNumber(rows.map((row) => row.cloudHighPercent)),
  };
}

function maxNullableNumber(values: readonly (number | null | undefined)[]): number | null {
  const finiteValues = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return finiteValues.length > 0 ? Math.round(Math.max(...finiteValues) * 10) / 10 : null;
}

function isTimeWithinRange(value: string, start: string, end: string): boolean {
  const timestamp = Date.parse(value);
  const startTimestamp = Date.parse(start);
  const endTimestamp = Date.parse(end);
  return (
    Number.isFinite(timestamp) &&
    Number.isFinite(startTimestamp) &&
    Number.isFinite(endTimestamp) &&
    timestamp >= startTimestamp &&
    timestamp <= endTimestamp
  );
}

function compactCloudSeaAnalysisWindow(
  window: ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number],
  timezone: string,
) {
  return {
    labelZh: window.label,
    date: window.date,
    windowZh: formatLocalTimeRange(window.startTime, window.endTime, timezone),
    score: window.score,
    formationScore: window.formationScore,
    shootableScore: window.shootableScore,
    whiteoutRiskScore: window.whiteoutRiskScore,
    phase: window.phase,
    noteZh: limitText(window.noteZh, 80),
    riskTag: limitText(window.riskTag, 60),
    rainOpeningZh: limitText(window.rainOpening?.messageZh, 70),
  };
}

function compactCloudSeaWindowRiskContext(
  context: NonNullable<ForecastCalculationResult["cloudSeaAnalysis"]["windowRiskContext"]>,
) {
  return {
    windowRainImpact: compactRainImpact(context.windowRainImpact),
    preWindowRainImpact: compactRainImpact(context.preWindowRainImpact),
    duringWindowRainImpact: compactRainImpact(context.duringWindowRainImpact),
    postWindowRainImpact: compactRainImpact(context.postWindowRainImpact),
    windowOpeningConfidence: context.windowOpeningConfidence,
    windowOpeningConfidenceLabelZh: context.windowOpeningConfidenceLabelZh,
    cloudTopReviewNeed: context.cloudTopReviewNeed,
    whiteoutReviewLevel: context.whiteoutReviewLevel,
    whiteoutReviewLabelZh: context.whiteoutReviewLabelZh,
    temperaturePreparationLevel: context.temperaturePreparationLevel,
    displayTemperatureBasis: context.displayTemperatureBasis,
    scoreCapReasons: takeTextItems(context.scoreCapReasons, 3, 70),
    precipitationWindowSummaryZh: limitText(
      providerNeutralText(context.precipitationWindowSummaryZh),
      100,
    ),
    whiteoutWindowSummaryZh: limitText(providerNeutralText(context.whiteoutWindowSummaryZh), 80),
    actionAdviceZh: limitText(providerNeutralText(context.actionAdviceZh), 80),
    equipmentAdviceZh: limitText(providerNeutralText(context.equipmentAdviceZh), 70),
  };
}

function compactRainImpact(
  impact: NonNullable<
    ForecastCalculationResult["cloudSeaAnalysis"]["windowRiskContext"]
  >["windowRainImpact"],
) {
  return {
    timing: impact.timing,
    impactLevel: impact.impactLevel,
    riskLabelZh: impact.riskLabelZh,
    maxProbabilityPercent: impact.maxProbabilityPercent,
    maxAmountMm: impact.maxAmountMm,
    totalAmountMm: impact.totalAmountMm,
    shouldCapScore: impact.shouldCapScore,
    scoreCap: impact.scoreCap,
    summaryZh: limitText(providerNeutralText(impact.summaryZh), 50),
  };
}

function professionalHourlyRowsForAiPayload(
  rows: NonNullable<ForecastCalculationResult["professionalHourlyData"]>,
  detail: DeepSeekForecastContextDetail,
) {
  const limit = detail === "minimal" ? 1 : 2;
  const focused = rows.filter((row) =>
    ["可拍窗口", "白墙风险", "形成信号", "雨后开口", "需复核"].includes(row.cloudSeaSignal),
  );
  return takeItems(focused.length > 0 ? focused : rows, limit);
}

function professionalHourlyRowsAtOrAfterAnchor(
  rows: NonNullable<ForecastCalculationResult["professionalHourlyData"]>,
  anchorStart: string | undefined,
  expectedRowCount: number | undefined,
) {
  const anchorMs = Date.parse(anchorStart ?? "");
  const rowLimit =
    typeof expectedRowCount === "number" &&
    Number.isFinite(expectedRowCount) &&
    expectedRowCount > 0
      ? Math.round(expectedRowCount)
      : rows.length;
  if (!Number.isFinite(anchorMs)) {
    return rows.slice(0, rowLimit);
  }

  return rows
    .map((row) => ({ row, timestamp: Date.parse(row.time) }))
    .filter(
      (entry): entry is { readonly row: (typeof rows)[number]; readonly timestamp: number } =>
        Number.isFinite(entry.timestamp) && entry.timestamp >= anchorMs,
    )
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(0, rowLimit)
    .map((entry) => entry.row);
}

function countProfessionalHourlySignals(
  rows: NonNullable<ForecastCalculationResult["professionalHourlyData"]>,
): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.cloudSeaSignal] = (counts[row.cloudSeaSignal] ?? 0) + 1;
    return counts;
  }, {});
}

function compactProfessionalHourlyRowForAi(
  row: NonNullable<ForecastCalculationResult["professionalHourlyData"]>[number],
) {
  return {
    dateLabel: row.dateLabel,
    timeLabel: row.timeLabel,
    cloudSeaSignal: row.cloudSeaSignal,
    cloudSeaSignalLevel: row.cloudSeaSignalLevel,
    weatherTextZh: providerNeutralText(row.weatherText ?? undefined),
    cloudTotalPercent: row.cloudTotalPercent,
    cloudHighPercent: row.cloudHighPercent,
    cloudMidPercent: row.cloudMidPercent,
    cloudLowPercent: row.cloudLowPercent,
    cloudLayerBasis: row.cloudLayerBasis,
    displayedTemperatureC: row.displayedTemperatureC,
    dewPointSpreadC: row.dewPointSpreadC,
    relativeHumidityPercent: row.relativeHumidityPercent,
    precipitationAmountMm: row.precipitationAmountMm,
    precipitationProbabilityPercent: row.precipitationProbabilityPercent,
    visibilityMeters: row.visibilityMeters,
    windSpeedMs: row.windSpeedMs,
    missingFields: takeItems(row.missingFields, 5),
    notesZh: takeTextItems(
      row.notesZh?.map((item) => providerNeutralText(item) ?? item),
      2,
      80,
    ),
  };
}

function compactAstroWindow(
  window:
    | ForecastCalculationResult["astroAnalysis"]["recommendedMilkyWayWindows"][number]
    | undefined,
  timezone = "Asia/Shanghai",
) {
  if (!window) {
    return null;
  }

  return {
    labelZh: window.labelZh,
    date: window.date,
    windowZh: formatLocalTimeRange(window.start, window.end, timezone),
    directionZh: window.directionZh,
    galacticCenterAltitude: window.galacticCenterAltitude,
  };
}

function compactForecastWindowBrief(
  window: ForecastCalculationResult["bestWindows"][number],
  timezone = "Asia/Shanghai",
) {
  return {
    labelZh: windowLabelZh(window),
    date: window.date,
    windowZh: formatWindowTimeZh(window, timezone),
    score: window.score,
    target: window.target,
    conditionScore: window.conditionScore,
    practicalScore: window.practicalScore,
    practicalKind: window.practicalKind,
    lightPhase: window.lightPhase,
    copyReasonZh: limitText(window.copyReasonZh ?? window.practicalNoteZh, 110),
    weatherBlockers: takeTextItems(window.weatherBlockers, 2, 80),
  };
}

function formatWindowTimeZh(
  window: {
    readonly startTime?: string;
    readonly endTime?: string;
    readonly start?: string;
    readonly end?: string;
  },
  timezone: string,
): string {
  return formatLocalTimeRange(
    window.startTime ?? window.start,
    window.endTime ?? window.end,
    timezone,
  );
}

function formatDateLabelZh(
  date: string | undefined,
  timezone: string,
  fallback = "日期待复核",
): string {
  if (!date) {
    return fallback;
  }
  const label = formatLocalDateLabel(date, timezone);
  return label === "时间待确认" ? fallback : label;
}

function compactDailyFact(
  result: ForecastCalculationResult,
  summary: ForecastCalculationResult["dailySummaries"][number],
  timezone: string,
) {
  const breakdown = result.targetDailyBreakdown.find((item) => item.date === summary.date);
  const dailyAstro = result.astroAnalysis.dailyAstro.find((item) => item.date === summary.date);
  const bestWindow = summary.bestShootableWindow ?? summary.keyWindows.find(isExecutableWindow);

  return {
    date: summary.date,
    dateZh: formatDateLabelZh(summary.date, timezone, summary.dateLabelZh),
    score: summary.score,
    recommendationLabelZh: summary.recommendationLabel,
    dedicatedTripRecommendationZh: summary.dedicatedTripRecommendation,
    nearbyObservationRecommendationZh: summary.nearbyObservationRecommendation,
    dedicatedTripAdviceZh: limitText(summary.dedicatedTripAdviceZh, 140),
    nearbyObservationAdviceZh: limitText(summary.nearbyObservationAdviceZh, 140),
    deterministicActionZh: limitText(summary.shortAdvice, 140),
    bestShootableWindow: bestWindow ? compactForecastWindowBrief(bestWindow, timezone) : null,
    watchableWindows: takeItems(summary.watchableWindows, 1).map((window) => ({
      subjectZh: windowLabelZh({
        label: window.subject,
        target: window.target,
        startTime: window.startTime ?? "",
        endTime: window.endTime ?? "",
      }),
      windowZh:
        window.startTime && window.endTime
          ? formatLocalTimeRange(window.startTime, window.endTime, timezone)
          : "暂无明确时间",
      reasonZh: limitText(window.reasonZh, 120),
      suitableForDedicatedTrip: window.suitableForDedicatedTrip,
      suitableIfNearby: window.suitableIfNearby,
    })),
    riskFlags: compactRiskFlags(summary.riskFlags, 3),
    weather: summary.weather
      ? {
          weatherTextZh: summary.weather.weatherTextZh,
          temperatureRangeZh: formatTemperatureRange(
            summary.weather.tempMin,
            summary.weather.tempMax,
          ),
          mountainFeelsLikeRangeZh: formatTemperatureRange(
            summary.weather.mountainFeelsLikeMin,
            summary.weather.mountainFeelsLikeMax,
          ),
          rainRiskZh: rainRiskSummaryZh(summary.weather),
          rainTimingZh: rainTimingSummaryZh(summary.weather),
          windZh: formatWindValue(summary.weather.windSpeed, summary.weather.windGust),
          visibilityZh: formatDistanceKm(
            summary.weather.rawVisibilityKm ?? summary.weather.visibility,
          ),
          transparencyZh: formatTransparencyValue(
            summary.weather.transparencyGrade,
            summary.weather.photographyTransparencyScore,
          ),
          exposedRidgeWindRisk: summary.weather.exposedRidgeWindRisk,
          tripodStabilityRisk: summary.weather.tripodStabilityRisk,
          windChillNoteZh: summary.weather.windChillNoteZh,
          clothingRiskNoteZh: summary.weather.clothingRiskNoteZh,
          cloudLowPercent: summary.weather.cloudLow,
          cloudMidPercent: summary.weather.cloudMid,
          cloudHighPercent: summary.weather.cloudHigh,
          dewPointSpread: summary.weather.dewPointSpread,
        }
      : null,
    astro: dailyAstro
      ? {
          astroWindowAvailable: dailyAstro.astroWindowAvailable,
          astroShootable: dailyAstro.astroShootable,
          recommendedMilkyWayWindow: compactAstroWindow(
            dailyAstro.astroShootable ? dailyAstro.recommendedMilkyWayWindow : undefined,
            timezone,
          ),
          moonImpact: {
            level: dailyAstro.moonImpactLevel,
            labelZh: dailyAstro.labels.moonlightImpact,
          },
          astroWeatherBlockers: takeTextItems(dailyAstro.weatherBlockers, 2, 90),
          dewRisk: {
            level: dailyAstro.dewRiskLevel,
            labelZh: dailyAstro.labels.dewRisk,
          },
        }
      : null,
    topicScores: {
      cloudSeaZh: dailyMetricZh(breakdown?.cloudSea),
      whiteoutRiskZh: dailyMetricZh(breakdown?.whiteoutRisk),
      sunriseGlowZh: dailyMetricZh(breakdown?.sunriseGlow),
      sunsetGlowZh: dailyMetricZh(breakdown?.sunsetGlow),
      starsZh: dailyMetricZh(breakdown?.stars),
      milkyWayZh: dailyMetricZh(breakdown?.milkyWay),
      transparencyZh: dailyMetricZh(breakdown?.transparency),
    },
    weatherSummaryZh: limitText(breakdown?.weatherSummary, 160),
    terrainSummaryZh: limitText(breakdown?.terrainSummary, 160),
  };
}

function windowLabelZh(
  window: Pick<
    ForecastCalculationResult["bestWindows"][number],
    | "label"
    | "target"
    | "startTime"
    | "endTime"
    | "subjectPriorityLabel"
    | "lightPhase"
    | "practicalKind"
    | "weatherBlockers"
  >,
): string {
  const raw = stripWindowTime(window.subjectPriorityLabel ?? window.label);
  const hour = hourOf(window.startTime);

  if (window.target === "glow") {
    if (window.lightPhase === "blue_hour") {
      return "日落后余晖";
    }
    if (window.lightPhase === "sunset") {
      return raw.includes("晚霞") ? "晚霞" : "日落暖光";
    }
    if (typeof hour === "number" && hour >= 12 && raw.includes("朝霞")) {
      return "晚霞";
    }
  }

  if (window.target === "astro" && (window.weatherBlockers?.length ?? 0) > 0) {
    return raw.includes("银河") ? "银河天文窗口" : "天文窗口";
  }

  if (window.target === "cloud_sea" && window.practicalKind === "formation_signal") {
    return "云雾变化";
  }

  return raw || window.label;
}

function confidenceLabelZh(level: string | undefined): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  if (level === "low") {
    return "低";
  }
  return "待复核";
}

function providerNeutralText(text: string | undefined): string | undefined {
  return text
    ?.replace(/和风天气|QWeather/g, "基础天气")
    .replace(/Open-Meteo/g, "云层辅助")
    .replace(/meteoblue/g, "专业增强")
    .replace(/高德地图|Amap/g, "地理服务");
}

type RainWeatherLike = {
  readonly precipitationProbability?: number | null;
  readonly precipitation?: number | null;
  readonly precipitationAmountMm?: number | null;
  readonly rainAmountMm?: number | null;
  readonly snowAmountMm?: number | null;
  readonly precipitationType?: string | null;
  readonly precipitationRisk?: {
    readonly rainRiskLabelZh: string;
    readonly recommendationZh: string;
    readonly precipitationAmountMm?: number | null;
  };
  readonly mainPrecipitationPeriodLabelZh?: string;
};

function rainRiskSummaryZh(weather: RainWeatherLike | undefined): string {
  if (!weather) {
    return "降水风险待复核";
  }
  const amount = precipitationAmountMm(weather);
  const riskLabel = weather.precipitationRisk?.rainRiskLabelZh ?? rainRiskLevelZh(weather);
  const amountText = amount !== null && amount > 0 ? `，预计 ${roundDisplay(amount)} mm` : "";
  const probability =
    typeof weather.precipitationProbability === "number" && weather.precipitationProbability > 0
      ? `，概率 ${Math.round(weather.precipitationProbability)}%`
      : "";
  return `降水风险${riskLabel}${amountText || probability}`;
}

function rainTimingSummaryZh(weather: RainWeatherLike | undefined): string {
  const raw = weather?.mainPrecipitationPeriodLabelZh
    ?.replace(/^(主要降水[：:]\s*)+/, "")
    .replace(/夜间、上午/g, "夜间至上午")
    .replace(/上午、下午/g, "白天大部时段")
    .replace(/下午、夜间/g, "午后至夜间")
    .replace(/、/g, "至")
    .trim();
  if (raw) {
    return raw;
  }
  return precipitationAmountMm(weather) ? "有降水量信号，具体时段待复核" : "降水不明显";
}

function rainRiskLevelZh(weather: RainWeatherLike): string {
  const amount = precipitationAmountMm(weather) ?? 0;
  const probability =
    typeof weather.precipitationProbability === "number" ? weather.precipitationProbability : 0;
  if (amount >= 25) {
    return "严重";
  }
  if (amount >= 10 || probability >= 70) {
    return "高";
  }
  if (amount >= 2 || probability >= 40) {
    return "中";
  }
  if (amount >= 0.3 || probability >= 20) {
    return "低";
  }
  return "无明显";
}

function precipitationAmountMm(weather: RainWeatherLike | undefined): number | null {
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

function formatTemperatureRange(min: number | undefined, max: number | undefined): string {
  if (typeof min === "number" && typeof max === "number") {
    return `${Math.round(min)}-${Math.round(max)}°C`;
  }
  if (typeof min === "number") {
    return `${Math.round(min)}°C 左右`;
  }
  if (typeof max === "number") {
    return `${Math.round(max)}°C 左右`;
  }
  return "温度待复核";
}

function formatWindValue(speed: number | null | undefined, gust?: number | null): string {
  if (typeof speed !== "number" || !Number.isFinite(speed)) {
    return "风力待复核";
  }
  const gustText =
    typeof gust === "number" && Number.isFinite(gust) ? `，阵风 ${roundDisplay(gust)} m/s` : "";
  return `${roundDisplay(speed)} m/s${gustText}`;
}

function formatDistanceKm(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${roundDisplay(value)} 公里`
    : "待复核";
}

function formatTransparencyValue(grade: string | undefined, score: number | undefined): string {
  const gradeText =
    grade === "excellent"
      ? "优秀"
      : grade === "good"
        ? "较好"
        : grade === "fair"
          ? "一般"
          : grade === "poor"
            ? "偏差"
            : "待复核";
  return typeof score === "number" ? `${gradeText}，${Math.round(score)} 分` : gradeText;
}

function dailyMetricZh(
  metric: ForecastCalculationResult["targetDailyBreakdown"][number]["cloudSea"] | undefined,
): string {
  if (!metric) {
    return "暂缺";
  }
  return `${metric.label} ${Math.round(metric.score)} 分，${limitText(metric.detail, 100)}`;
}

function stripWindowTime(text: string): string {
  return text
    .replace(/\s*\d{1,2}:\d{2}\s*[-–至到]\s*\d{1,2}:\d{2}\s*/g, "")
    .replace(/(?:观察)?窗口$/g, "")
    .trim();
}

function hourOf(value: string | undefined): number | undefined {
  const match = value?.match(/T(\d{2}):/);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : undefined;
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function parseJsonObjectWithExtraction(rawOutput: string): unknown {
  return parseJsonObjectWithStrategy(rawOutput).value;
}

function parseJsonObjectWithStrategy(rawOutput: string): JsonParseResult {
  const trimmed = rawOutput.trim();
  try {
    return {
      value: JSON.parse(trimmed),
      strategy: "strict_json",
    };
  } catch (firstError) {
    const unfenced = stripMarkdownCodeFence(trimmed);
    if (unfenced !== trimmed) {
      try {
        return {
          value: JSON.parse(unfenced),
          strategy: "fenced_json",
        };
      } catch {
        // Continue to object extraction below; DeepSeek often wraps useful JSON in prose.
      }
    }

    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) {
      throw firstError;
    }
    return {
      value: JSON.parse(extracted),
      strategy: "extracted_json",
    };
  }
}

function stripMarkdownCodeFence(rawOutput: string): string {
  const trimmed = rawOutput.trim();
  const match = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n([\s\S]*?)\r?\n```$/);
  return match?.[1]?.trim() ?? trimmed;
}

function extractFirstJsonObject(rawOutput: string): string | null {
  const text = stripMarkdownCodeFence(rawOutput.trim());
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function assertInterpretationPayloadSize(
  content: string,
  promptMaxChars = defaultInterpretationPromptMaxChars,
): string {
  if (content.length <= promptMaxChars) {
    return content;
  }

  throw deepSeekError({
    errorCategory: "prompt_too_large",
    messageZh: "DeepSeek 解读上下文过大，已停止发送请求。",
    promptSizeChars: content.length,
  });
}

function buildPromptSizeChars(messages: readonly DeepSeekChatMessage[]): number {
  return messages.reduce((sum, message) => sum + message.content.length, 0);
}

function assertInterpretationMessagesSize(
  messages: readonly DeepSeekChatMessage[],
  promptMaxChars: number,
): void {
  const promptSizeChars = buildPromptSizeChars(messages);
  if (promptSizeChars <= promptMaxChars) {
    return;
  }

  throw deepSeekError({
    errorCategory: "prompt_too_large",
    messageZh: "DeepSeek prompt is too large; request was not sent.",
    promptSizeChars,
  });
}

function buildForecastExplanationUserPayload(
  input: ForecastExplanationInput,
  detail: DeepSeekForecastContextDetail,
) {
  const targetConfig = forecastAiTargetConfigFor(input.forecastResult.target);
  const isGlowBudget = input.forecastResult.target === "glow" && detail === "budget";
  const baseConstraints = [
    "Use only computedForecastFacts. Do not calculate, invent, or override weather, terrain, astronomy, coordinates, scores, risks, or windows.",
    "If a fact is missing, say it needs a near-term recheck. Do not fill unknown values.",
    "Do not infer low/mid/high cloud layers from total cloud.",
    "If dataStatus.isMock=true, clearly call it demo data.",
    "Return JSON only when possible; plain structured Chinese text is acceptable if JSON mode fails.",
  ];

  return {
    task: isGlowBudget
      ? "Explain deterministic sunrise/sunset glow facts in concise Simplified Chinese."
      : targetConfig?.task ??
        "Explain deterministic photo-weather forecast facts in concise Simplified Chinese.",
    targetCode: targetConfig?.targetCode ?? input.forecastResult.target,
    targetSubjectZh: targetConfig?.subjectZh ?? null,
    outputMode: "short_practical_json",
    outputLength: isGlowBudget
      ? "500-700 Chinese chars. No Markdown."
      : targetConfig?.outputLength ?? "600-900 Chinese characters total. No Markdown.",
    preferredVisibleSectionsZh: targetConfig?.visibleSectionsZh ?? null,
    promptPrioritiesZh: isGlowBudget
      ? ["是否值得去；朝霞/晚霞概率；最佳本地时间；到达时间；主因、主风险和备选方案。"]
      : targetConfig?.promptPrioritiesZh ?? null,
    requiredKeys:
      input.forecastResult.target === "glow"
        ? isGlowBudget
          ? "shared ForecastAiExplanation JSON keys: conclusion, bestPlan, weatherTrend, subjectAdvice, riskAndGear, finalAdvice"
          : {
              conclusion: ["titleZh", "summaryZh", "oneSentenceDecisionZh"],
              bestPlan: [
                "primaryTargetZh",
                "bestWindowZh",
                "recommendedArrivalZh",
                "whyThisWindowZh",
                "backupPlanZh",
              ],
              weatherTrend: ["trendSummaryZh", "rainSummaryZh"],
              subjectAdvice: ["sunriseGlowZh", "sunsetGlowZh"],
              riskAndGear: ["keyRisks", "gearZh"],
              finalAdvice: ["goNoGoZh", "ifDedicatedTripZh", "nextCheckZh"],
            }
        : {
            conclusion: [
              "titleZh",
              "summaryZh",
              "recommendedDayZh",
              "recommendationLevelZh",
              "whetherWorthDedicatedTripZh",
              "oneSentenceDecisionZh",
            ],
            bestPlan: [
              "primaryTargetZh",
              "bestDateZh",
              "bestWindowZh",
              "recommendedArrivalZh",
              "whyThisWindowZh",
              "backupPlanZh",
            ],
            weatherTrend: [
              "trendSummaryZh",
              "temperatureSummaryZh",
              "rainSummaryZh",
              "windSummaryZh",
              "transparencySummaryZh",
            ],
            dayByDay: "1 item in budget mode, 1-2 items otherwise",
            subjectAdvice: [
              "cloudSeaZh",
              "sunriseGlowZh",
              "sunsetGlowZh",
              "astroMilkyWayZh",
              "transparencyZh",
            ],
            riskAndGear: ["keyRisks", "clothingZh", "gearZh", "safetyZh"],
            finalAdvice: ["goNoGoZh", "ifAlreadyNearbyZh", "ifDedicatedTripZh", "nextCheckZh"],
          },
    constraints: isGlowBudget
      ? [
          "Use only computedForecastFacts; missing facts need recheck, never filling.",
          "Do not change sunrise/sunset glow probability, deterministic sunriseGlowScore/sunsetGlowScore, windows, sun times, cloud/aerosol/terrain values, or recommendation; do not recompute or use cloud-sea wording.",
        ]
      : [...baseConstraints, ...(targetConfig?.constraints ?? [])],
    userGoal: input.userGoal ?? null,
    computedForecastFacts: buildDeepSeekForecastPromptFacts(input.forecastResult, detail),
  };
}

function buildDeepSeekForecastPromptFacts(
  result: ForecastCalculationResult,
  detail: DeepSeekForecastContextDetail,
) {
  if (result.target === "glow") {
    return buildDeepSeekGlowPromptFacts(result, detail);
  }

  const timezone = result.calendarBasis.timezone;
  const targetConfig = forecastAiTargetConfigFor(result.target);
  const bestWindow = result.bestWindows.find(isExecutableWindow) ?? result.bestWindows[0];
  const bestDay = bestDailySummaryForPlan(result, bestWindow);
  const cloudSeaGuard =
    result.target === "cloud_sea" ? buildCloudSeaRecommendationGuardForResult(result) : null;
  const dailyLimit = detail === "budget" ? 1 : 2;
  const riskLimit = detail === "budget" ? 2 : 3;
  const textLimit = detail === "budget" ? 70 : 110;

  return {
    contextVersion: "forecast-interpretation-lean-v1",
    deterministicOnly: true,
    targetCode: targetConfig?.targetCode ?? result.target,
    location: {
      name: limitText(result.place.name, 80),
      countryCode: result.place.countryCode,
      coordinateSystem: result.place.coordinates.system,
    },
    target: result.target,
    horizon: {
      key: result.horizon,
      rangeZh: result.calendarBasis.forecastRangeLabel,
      timezone,
      generatedAt: result.generatedAt,
    },
    overall: {
      score: result.overallScore,
      recommendationLevel: result.recommendationLevel,
      recommendationLabelZh: cloudSeaGuard?.finalRecommendationLabel ?? result.recommendationLabel,
      summaryZh: limitText(result.summary, textLimit),
    },
    bestDay: bestDay
      ? {
          date: bestDay.date,
          dateZh: formatDateLabelZh(bestDay.date, timezone, bestDay.dateLabelZh),
          score: bestDay.score,
          recommendationZh:
            cloudSeaGuard?.finalRecommendationLabel ??
            bestDay.dedicatedTripRecommendation ??
            bestDay.recommendationLabel,
          actionZh: limitText(bestDay.shortAdvice, textLimit),
        }
      : null,
    keyWindows: takeItems(result.bestWindows, detail === "budget" ? 1 : 2).map((window) =>
      compactPromptWindow(window, timezone, textLimit),
    ),
    keyRisks: compactRiskFlags(result.riskFlags, riskLimit).map((risk) => ({
      label: risk.label,
      level: risk.level,
      description: limitText(risk.description, textLimit),
    })),
    keyReasons: takeTextItems(result.keyReasons, detail === "budget" ? 2 : 3, textLimit),
    deterministicSuggestions: takeTextItems(
      result.photographyAdvice,
      detail === "budget" ? 1 : 2,
      textLimit,
    ),
    daily: takeItems(result.dailySummaries, dailyLimit).map((summary) =>
      compactPromptDailyFact(result, summary, timezone, textLimit),
    ),
    topicScores: [
      result.scores.cloudSea,
      result.scores.sunriseGlow,
      result.scores.sunsetGlow,
      result.scores.stars,
      result.scores.milkyWay,
      result.scores.transparency,
    ].map(compactPromptScore),
    terrain: {
      terrainType: result.terrainAnalysis.terrainProfile.terrainType,
      terrainMode: result.cloudSeaAnalysis.terrainSupport.terrainMode,
      elevationMeters:
        result.terrainAnalysis.terrainProfile.locationElevation ??
        result.terrainAnalysis.terrainProfile.elevationMeters ??
        result.cloudSeaAnalysis.terrainSupport.selectedSpotElevationMeters,
      localReliefMeters:
        result.terrainAnalysis.terrainProfile.localReliefMeters ??
        result.terrainAnalysis.terrainProfile.elevationDiff5km ??
        result.cloudSeaAnalysis.terrainSupport.localReliefMeters,
    },
    cloudSea:
      result.target === "cloud_sea"
        ? compactCloudSeaPromptFacts(result, timezone, textLimit)
        : undefined,
    astro: {
      astroShootable: result.astroAnalysis.astroShootable,
      weatherBlockers: takeTextItems(result.astroAnalysis.weatherBlockers, 2, textLimit),
    },
    clothingAndEquipment: {
      summaryZh: limitText(result.clothingGuide.summaryZh, textLimit),
      layers: takeTextItems(result.clothingGuide.layers, detail === "budget" ? 1 : 2, 60),
      accessories: takeTextItems(result.clothingGuide.accessories, detail === "budget" ? 1 : 2, 60),
      riskNotes: takeTextItems(result.clothingGuide.riskNotes, detail === "budget" ? 1 : 2, 60),
    },
    dataStatus: {
      dataMode: result.weatherDataMode,
      isMock: result.isMock,
      noticeZh: limitText(providerNeutralText(result.dataNotice), textLimit),
    },
  };
}

function buildDeepSeekGlowPromptFacts(
  result: ForecastCalculationResult,
  detail: DeepSeekForecastContextDetail,
) {
  const timezone = result.calendarBasis.timezone;
  const targetConfig = forecastAiTargetConfigFor(result.target);
  const textLimit = detail === "budget" ? 60 : 90;

  return {
    contextVersion: "forecast-interpretation-glow-lean-v1",
    deterministicOnly: true,
    targetCode: targetConfig?.targetCode ?? result.target,
    location: {
      name: limitText(result.place.name, 80),
      countryCode: result.place.countryCode,
      coordinateSystem: result.place.coordinates.system,
    },
    target: result.target,
    horizon: {
      key: result.horizon,
      rangeZh: result.calendarBasis.forecastRangeLabel,
      timezone,
      generatedAt: result.generatedAt,
    },
    glow: buildGlowAiExplainPayload(result, detail),
    dataStatus: {
      dataMode: result.weatherDataMode,
      isMock: result.isMock,
      noticeZh: limitText(providerNeutralText(result.dataNotice), textLimit),
    },
  };
}

function compactPromptScore(
  score: ForecastCalculationResult["scores"][keyof ForecastCalculationResult["scores"]],
) {
  return {
    key: score.key,
    label: score.label,
    score: score.score,
    level: score.level,
  };
}

function compactPromptWindow(
  window: ForecastCalculationResult["bestWindows"][number],
  timezone: string,
  textLimit: number,
) {
  return {
    labelZh: windowLabelZh(window),
    date: window.date,
    windowZh: formatWindowTimeZh(window, timezone),
    target: window.target,
    score: window.score,
    practicalScore: window.practicalScore,
    practicalKind: window.practicalKind,
    lightPhase: window.lightPhase,
    reasonZh: limitText(window.copyReasonZh ?? window.practicalNoteZh, textLimit),
    weatherBlockers: takeTextItems(window.weatherBlockers, 2, textLimit),
  };
}

function compactPromptDailyFact(
  result: ForecastCalculationResult,
  summary: ForecastCalculationResult["dailySummaries"][number],
  timezone: string,
  textLimit: number,
) {
  const breakdown = result.targetDailyBreakdown.find((item) => item.date === summary.date);
  const bestWindow = summary.bestShootableWindow ?? summary.keyWindows.find(isExecutableWindow);

  return {
    date: summary.date,
    dateZh: formatDateLabelZh(summary.date, timezone, summary.dateLabelZh),
    score: summary.score,
    recommendationZh: summary.dedicatedTripRecommendation ?? summary.recommendationLabel,
    bestWindow: bestWindow ? compactPromptWindow(bestWindow, timezone, textLimit) : null,
    actionZh: limitText(summary.shortAdvice, textLimit),
    weather: summary.weather
      ? {
          textZh: summary.weather.weatherTextZh,
          temperatureRangeZh: formatTemperatureRange(
            summary.weather.tempMin,
            summary.weather.tempMax,
          ),
          rainRiskZh: rainRiskSummaryZh(summary.weather),
          windZh: formatWindValue(summary.weather.windSpeed, summary.weather.windGust),
          visibilityZh: formatDistanceKm(
            summary.weather.rawVisibilityKm ?? summary.weather.visibility,
          ),
          transparencyZh: formatTransparencyValue(
            summary.weather.transparencyGrade,
            summary.weather.photographyTransparencyScore,
          ),
          cloudLowPercent: summary.weather.cloudLow,
          cloudMidPercent: summary.weather.cloudMid,
          cloudHighPercent: summary.weather.cloudHigh,
        }
      : null,
    subjectScoresZh: {
      cloudSea: dailyMetricZh(breakdown?.cloudSea),
      sunriseGlow: dailyMetricZh(breakdown?.sunriseGlow),
      sunsetGlow: dailyMetricZh(breakdown?.sunsetGlow),
      stars: dailyMetricZh(breakdown?.stars),
      milkyWay: dailyMetricZh(breakdown?.milkyWay),
      transparency: dailyMetricZh(breakdown?.transparency),
    },
  };
}

function compactCloudSeaPromptFacts(
  result: ForecastCalculationResult,
  timezone: string,
  textLimit: number,
) {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow =
    analysis.bestCloudSeaWindow ??
    analysis.bestCloudSeaWindows[0] ??
    analysis.watchableCloudSeaWindows[0] ??
    analysis.notRecommendedCloudSeaWindows[0];
  const guard = buildCloudSeaRecommendationGuardForResult(result);

  return {
    recommendationZh: guard.finalRecommendationLabel,
    score: analysis.scoreCalibration.finalCloudSeaScore,
    formationScore: analysis.formationScore,
    shootableScore: analysis.shootableScore,
    calibratedShootabilityScore: analysis.scoreCalibration.calibratedShootabilityScore,
    whiteoutRiskScore: analysis.whiteoutRiskScore,
    terrainMode: analysis.terrainSupport.terrainMode,
    terrainType: analysis.terrainSupport.terrainType,
    terrainNoteZh: limitText(analysis.terrainSupport.messageZh, textLimit),
    bestWindow: bestWindow
      ? {
          labelZh: bestWindow.label,
          date: bestWindow.date,
          windowZh: formatWindowTimeZh(bestWindow, timezone),
          score: bestWindow.score,
          phase: bestWindow.phase,
          riskTag: bestWindow.riskTag,
          noteZh: limitText(bestWindow.noteZh, textLimit),
        }
      : null,
    opportunityReasons: takeTextItems(analysis.opportunityReasons, 2, textLimit),
    whiteoutReasons: takeTextItems(analysis.whiteoutReasons, 2, textLimit),
    missingDataNotes: takeTextItems(analysis.missingDataNotes, 2, textLimit),
  };
}

function _buildLegacyForecastExplanationUserPayload(
  input: ForecastExplanationInput,
  detail: DeepSeekForecastContextDetail,
) {
  return {
    task: "请基于 computedForecastFacts 输出专业风光摄影决策解读 JSON。",
    outputSchema: {
      conclusion: {
        titleZh: "报告标题",
        summaryZh: "两到三句话总结天气大势和拍摄价值",
        recommendedDayZh: "最建议冲哪一天，必须包含具体日期和理由",
        recommendationLevelZh: "推荐等级",
        whetherWorthDedicatedTripZh:
          "强推荐专程/推荐安排/谨慎参考/不建议专程前往/已在附近可观察/仅作备选",
        oneSentenceDecisionZh: "一句话出行决策",
      },
      bestPlan: {
        primaryTargetZh: "主拍题材",
        bestDateZh: "最佳日期",
        bestWindowZh: "最佳窗口本地时间段，不重复 bestDateZh",
        recommendedArrivalZh: "建议到达时间，使用确定性本地时间，不自行改写时间戳",
        whyThisWindowZh: "为什么选这个窗口",
        backupPlanZh: "备选窗口或备选题材",
      },
      weatherTrend: {
        trendSummaryZh: "天气大势",
        temperatureSummaryZh: "山顶估算温度区间和体感提示",
        rainSummaryZh: "降水风险和主要降水时段",
        windSummaryZh: "风速/阵风和机位影响",
        transparencySummaryZh: "通透度和远山层次影响",
      },
      dayByDay: [
        {
          dateZh: "日期",
          recommendationZh: "当天是否适合拍摄",
          scoreZh: "分数描述",
          temperatureZh: "温度",
          rainZh: "降水",
          cloudSeaZh: "云海机会/云海分数，不能编造概率",
          glowZh: "日出/朝霞判断",
          sunsetGlowZh: "日落/晚霞/日落后余晖判断",
          astroZh: "星空/银河判断及天气阻断",
          transparencyZh: "通透度",
          bestWindowZh: "当天最佳窗口本地时间段，不重复 dateZh；没有则说明暂无",
          actionZh: "绑定当天窗口/风险的行动建议",
        },
      ],
      subjectAdvice: {
        cloudSeaZh: "云海机会、白墙风险、形成条件",
        sunriseGlowZh: "日出和朝霞是否有戏",
        sunsetGlowZh: "日落、晚霞和日落后余晖是否有戏",
        astroMilkyWayZh: "星空/银河是否有戏，必须说明天气阻断",
        transparencyZh: "通透度对远山层次的影响",
      },
      riskAndGear: {
        keyRisks: ["主要风险"],
        clothingZh: "穿衣建议",
        gearZh: "器材建议",
        safetyZh: "安全和撤离建议",
      },
      finalAdvice: {
        goNoGoZh: "最终去不去",
        ifAlreadyNearbyZh: "如果已在山上/附近怎么做",
        ifDedicatedTripZh: "如果需要专程出发是否值得",
        nextCheckZh: "下次复核重点",
      },
    },
    constraints: [
      "If target is cloud_sea, use cloudSeaAiExplainPayload as deterministic context only; do not invent cloud layers, cloud-sea windows, whiteout risk, arrival advice, or professional hourly values.",
      "For cloud_sea recommendation wording, use cloudSeaAiExplainPayload.recommendationExplanation as the deterministic reason source; do not invent why-not-stronger or review reasons.",
      "For cloud_sea temperature, explain only the provided temperatureBasis/displayTemperatureC/rawGridTemperatureC/terrainAdjustedTemperatureC and notes; do not invent a new correction or override deterministic temperature.",
      "For cloud_sea output, focus on practical photography guidance: one-sentence conclusion, best window, cloud sea/low cloud/morning fog judgment, whiteout risk, arrival and waiting plan, on-site checks, gear, and backup plan.",
      "只解释 computedForecastFacts 中已有的确定性事实。",
      "不要计算、推断或改写天气、天文、地形、坐标、评分和服务商结果。",
      "不要生成输入中没有的小时级天气、天文窗口或分数。",
      "不要说云海概率，除非输入事实明确提供概率；优先使用云海机会、云海分数、形成条件。",
      "必须区分日出、朝霞、日落、晚霞和日落后余晖；夜间或傍晚窗口不得写成朝霞。",
      "有天文窗口不代表能拍银河；如果云量、低云、降水或通透度不支持，必须明确不建议专程。",
      "重要窗口必须输出完整日期和时间，例如 2026年5月28日 04:07–06:07。",
      "每条建议必须绑定具体日期、窗口、题材或风险，不要泛泛而谈。",
      "如果 dataStatus.isMock=true，必须明确这是演示数据解读，只适合体验分析流程和规划参考。",
      "输出 JSON only。",
    ],
    safetyRules: [
      "Do not invent weather data.",
      "Do not invent or override temperature correction.",
      "Do not infer low cloud, mid cloud, or high cloud from total cloud.",
      "Do not treat mixed-basis cloud data as high-confidence cloud sea evidence.",
      "Do not recompute astronomy.",
      "Do not recompute coordinates.",
      "Do not recompute or invent weather, cloud, cloud-sea, terrain, astronomy, score, risk, or window data.",
      "Do not override deterministic scores.",
      "Do not claim mock weather is real forecast.",
      "Output Simplified Chinese.",
      "Output json only.",
    ],
    userGoal: input.userGoal ?? null,
    computedForecastFacts: buildDeepSeekForecastContext(input.forecastResult, detail),
  };
}

function buildJsonOnlySystemPrompt(
  target?: ForecastCalculationResult["target"],
  detail?: DeepSeekForecastContextDetail,
): string {
  if (target === "glow" && detail === "budget") {
    return [
      "Explain only deterministic forecast facts. Do not recompute or invent weather, sun times, cloud, aerosol, terrain, scores, windows, or recommendation.",
      "Return one JSON object in Simplified Chinese. No Markdown.",
    ].join("\n");
  }

  return [
    "You are only allowed to explain and organize deterministic forecast results. Never recompute or invent weather, cloud, cloud-sea, terrain, astronomy, score, recommendation, risk, or window data.",
    "Return concise Simplified Chinese. Prefer one JSON object matching the requested schema; if exact JSON is not possible, return concise structured Chinese text without extra commentary.",
    "你是面向中国风光摄影用户的拍摄天气解读助手。",
    "只解释已经计算好的确定性结果，不得计算、覆盖或改写天气、天文、地形、坐标或评分数据。",
    "不得编造天气数据，不得覆盖 deterministic scores，不得声称 mock weather 是真实 forecast。",
    "输出简体中文。",
    "必须只输出 json 对象，不要输出 Markdown、解释文字或代码块。",
  ].join("\n");
}

export function buildDeepSeekForecastExplanationRequest(
  input: ForecastExplanationInput,
  options: Pick<
    DeepSeekProviderOptions,
    | "baseUrl"
    | "defaultModel"
    | "temperature"
    | "maxTokens"
    | "promptMaxChars"
    | "responseFormat"
    | "thinkingEnabled"
    | "reasoningEffort"
    | "jsonOutputEnabled"
  > = {},
): DeepSeekRequestPreview {
  const responseFormat = normalizeResponseFormat(options.responseFormat);
  const jsonOutputEnabled = options.jsonOutputEnabled ?? responseFormat === "json_object";
  const promptMaxChars = normalizePromptMaxChars(options.promptMaxChars);
  let promptDetail: DeepSeekForecastContextDetail = "minimal";
  let userContent = JSON.stringify(buildForecastExplanationUserPayload(input, promptDetail));
  let messages: readonly DeepSeekChatMessage[] = [
    {
      role: "system",
      content: buildJsonOnlySystemPrompt(input.forecastResult.target, promptDetail),
    },
    {
      role: "user",
      content: userContent,
    },
  ];
  if (buildPromptSizeChars(messages) > targetInterpretationPromptChars) {
    promptDetail = "budget";
    userContent = JSON.stringify(buildForecastExplanationUserPayload(input, promptDetail));
    messages = [
      {
        role: "system",
        content: buildJsonOnlySystemPrompt(input.forecastResult.target, promptDetail),
      },
      {
        role: "user",
        content: userContent,
      },
    ];
  }
  assertInterpretationPayloadSize(userContent, promptMaxChars);
  assertInterpretationMessagesSize(messages, promptMaxChars);
  const body: DeepSeekRequestBody = {
    model: normalizeModel(options.defaultModel),
    messages,
    temperature: normalizeTemperature(options.temperature),
    max_tokens: normalizeMaxTokens(options.maxTokens),
    stream: false,
  };
  if (jsonOutputEnabled) {
    body.response_format = {
      type: "json_object",
    };
  }
  applyReasoningEffort(body, options);

  return {
    url: `${normalizeBaseUrl(options.baseUrl)}/chat/completions`,
    body,
    promptSizeChars: buildPromptSizeChars(messages),
    outputMode: jsonOutputEnabled ? "json_object" : "text_with_json_fallback",
  };
}

export function createRuleBasedForecastExplanation(
  result: ForecastCalculationResult,
): ForecastAiExplanation {
  const timezone = result.calendarBasis.timezone;
  const bestWindow = result.bestWindows.find(isExecutableWindow) ?? result.bestWindows[0];
  const backupWindow = result.bestWindows.find((window) => window !== bestWindow);
  const bestDaily = bestDailySummaryForPlan(result, bestWindow);
  const cloudSeaGuard =
    result.target === "cloud_sea" ? buildCloudSeaRecommendationGuardForResult(result) : null;
  const cloudSeaExplanation = cloudSeaGuard
    ? buildCloudSeaRecommendationExplanation({
        finalRecommendationLabel: cloudSeaGuard.finalRecommendationLabel,
        cloudSeaScore: result.cloudSeaAnalysis.scoreCalibration.finalCloudSeaScore,
        formationScore: result.cloudSeaAnalysis.formationScore,
        shootabilityScore: result.cloudSeaAnalysis.scoreCalibration.calibratedShootabilityScore,
        whiteoutRiskScore: result.cloudSeaAnalysis.whiteoutRiskScore,
        terrainContext: {
          shouldDowngradeCloudSeaWording: ["lowland", "urban_or_plain", "unknown"].includes(
            result.cloudSeaAnalysis.terrainSupport.terrainMode,
          ),
          terrainClass: result.cloudSeaAnalysis.terrainSupport.terrainMode,
          terrainNoteZh: result.cloudSeaAnalysis.terrainSupport.messageZh,
        },
        bestWindow:
          result.cloudSeaAnalysis.bestCloudSeaWindow ??
          result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
          result.cloudSeaAnalysis.watchableCloudSeaWindows[0] ??
          null,
        recommendationGuardContext: cloudSeaGuard,
      })
    : null;
  const dedicatedDecision = dedicatedTripDecisionZh(result, bestDaily);
  const recommendationLevelZh =
    cloudSeaGuard?.finalRecommendationLabel ?? result.recommendationLabel;
  const oneSentenceDecisionBase =
    cloudSeaExplanation && !cloudSeaExplanation.oneLineConclusionZh.includes(recommendationLevelZh)
      ? `${recommendationLevelZh}：${cloudSeaExplanation.oneLineConclusionZh}`
      : cloudSeaExplanation?.oneLineConclusionZh ?? dedicatedDecision;
  const topScoredSubject = bestSubjectFromScores(result, 0);
  const primarySubject = bestWindow ? windowLabelZh(bestWindow) : topScoredSubject;
  const backupSubject = bestSubjectFromScores(
    result,
    primarySubject.includes(topScoredSubject) ? 1 : 0,
  );
  const clothing = [result.clothingGuide.summaryZh, ...result.clothingGuide.layers.slice(0, 2)]
    .filter(Boolean)
    .join(" ");
  const gear = [
    ...result.clothingGuide.accessories.slice(0, 3),
    ...result.clothingGuide.riskNotes.slice(0, 2),
  ]
    .filter(Boolean)
    .join("、");

  return {
    conclusion: {
      titleZh: `${result.place.name}摄影天气决策`,
      summaryZh: `${result.summary} ${forecastTrendSummary(result)}`,
      recommendedDayZh: bestDaily
        ? `最值得关注的是 ${formatDateLabelZh(bestDaily.date, timezone, bestDaily.dateLabelZh)}，${bestDaily.bestShootableWindow ? `${windowLabelZh(bestDaily.bestShootableWindow)} ${formatWindowTimeZh(bestDaily.bestShootableWindow, timezone)}` : bestDaily.shortAdvice}`
        : "暂无足够逐日数据，先参考确定性评分和窗口列表。",
      recommendationLevelZh,
      whetherWorthDedicatedTripZh: cloudSeaExplanation?.actionSummaryZh ?? dedicatedDecision,
      oneSentenceDecisionZh: `${oneSentenceDecisionBase}；优先看${bestWindow ? `${windowLabelZh(bestWindow)} ${formatShootingWindowZh(bestWindow, timezone)}` : "后续天气更新"}。`,
    },
    bestPlan: {
      primaryTargetZh: primarySubject,
      bestDateZh: bestDaily
        ? formatDateLabelZh(bestDaily.date, timezone, bestDaily.dateLabelZh)
        : formatDateLabelZh(bestWindow?.date, timezone),
      bestWindowZh: bestWindow ? formatWindowTimeZh(bestWindow, timezone) : "暂无高确定性拍摄窗口",
      recommendedArrivalZh: bestWindow?.arrivalAdvice
        ? formatArrivalDeadlineZh(bestWindow.arrivalAdvice.recommendedArrivalTime, timezone)
        : bestWindow
          ? `建议在 ${formatWindowTimeZh(bestWindow, timezone)} 前预留机位和取景时间`
          : "暂无明确到达时间",
      whyThisWindowZh:
        bestWindow?.copyReasonZh ??
        bestWindow?.practicalNoteZh ??
        result.keyReasons[0] ??
        "当前窗口在确定性评分中排序靠前。",
      backupPlanZh: backupWindow
        ? `备用题材：${backupSubject}；备用窗口：${windowLabelZh(backupWindow)} ${formatShootingWindowZh(backupWindow, timezone)}`
        : `备用题材：${backupSubject}；若主窗口不成立，转向近景、云层纹理或等待下一轮短临预报。`,
    },
    weatherTrend: {
      trendSummaryZh: forecastTrendSummary(result),
      temperatureSummaryZh: temperatureTrendSummary(result),
      rainSummaryZh: rainTrendSummary(result),
      windSummaryZh: windTrendSummary(result),
      transparencySummaryZh: transparencyTrendSummary(result),
    },
    dayByDay: takeItems(result.dailySummaries, 5).map((summary) =>
      deterministicDayExplanation(result, summary, timezone),
    ),
    subjectAdvice: {
      cloudSeaZh:
        cloudSeaExplanation?.professionalSummaryZh ??
        `${scoreSentence(result.scores.cloudSea)} 白墙风险 ${result.scores.whiteoutRisk.score} 分，重点复核低云厚度、湿度、风和能见度。`,
      sunriseGlowZh: `${scoreSentence(result.scores.sunriseGlow)} 日出前后需要看东方低云遮挡和中高云承载色彩。`,
      sunsetGlowZh: `${scoreSentence(result.scores.sunsetGlow)} 傍晚必须区分日落暖光、晚霞和日落后余晖，现场看西向云层开口。`,
      astroMilkyWayZh: astroAdviceZh(result),
      transparencyZh: `${scoreSentence(result.scores.transparency)} 通透度会直接影响远山层次、长焦山脊和银河暗部细节。`,
    },
    riskAndGear: {
      keyRisks:
        result.riskFlags.length > 0
          ? takeItems(result.riskFlags, 6).map((risk) => formatRiskWithTime(risk, timezone))
          : ["暂无高等级风险，但山地天气仍需出发前复核。"],
      clothingZh: clothing || result.clothingGuide.titleZh,
      gearZh: gear || "建议带防风外套、防潮袋、头灯、备用电池和镜头布。",
      safetyZh:
        bestWindow?.arrivalAdvice?.warningZh ??
        "山地机位保留撤离时间，遇到强风、雷雨、低能见度或道路风险时不要硬等窗口。",
    },
    finalAdvice: {
      goNoGoZh: cloudSeaGuard
        ? `${cloudSeaGuard.finalRecommendationLabel}。${cloudSeaExplanation?.userFacingSummaryZh ?? cloudSeaGuard.reasonZh}`
        : `${dedicatedDecision}。${result.keyReasons[0] ?? result.summary}`,
      ifAlreadyNearbyZh: nearbyDecisionZh(result, bestDaily),
      ifDedicatedTripZh:
        cloudSeaExplanation?.actionSummaryZh ??
        cloudSeaGuard?.departureAdviceZh ??
        (dedicatedDecision.includes("推荐")
          ? "可以把主窗口作为计划核心，但出发前仍要复核短临降水、低云和风。"
          : "不建议只为单一窗口远途出发，除非还有住宿、机位和备选题材支撑。"),
      nextCheckZh: cloudSeaExplanation
        ? `下次重点复核${cloudSeaExplanation.reviewPointsZh.slice(0, 4).join("、")}。`
        : "下次重点复核短临降水、低云高度、能见度、阵风和主窗口前后云层开口。",
    },
    metadata: {
      source: "deterministic_fallback",
      noteZh: result.isMock
        ? "基于演示天气和地形数据生成，仅用于体验分析流程。"
        : "基于确定性计算结果生成的简版解读。",
    },
  };
}

function bestDailySummaryForPlan(
  result: ForecastCalculationResult,
  bestWindow: ForecastCalculationResult["bestWindows"][number] | undefined,
): ForecastCalculationResult["dailySummaries"][number] | undefined {
  if (bestWindow) {
    const matchingDay = result.dailySummaries.find((summary) => summary.date === bestWindow.date);
    if (matchingDay) {
      return matchingDay;
    }
  }

  return (
    result.dailySummaries.find((summary) => summary.bestShootableWindow) ??
    [...result.dailySummaries].sort(
      (left, right) =>
        (right.practicalTripScore ?? right.score) - (left.practicalTripScore ?? left.score),
    )[0]
  );
}

function deterministicDayExplanation(
  result: ForecastCalculationResult,
  summary: ForecastCalculationResult["dailySummaries"][number],
  timezone: string,
): ForecastAiExplanation["dayByDay"][number] {
  const breakdown = result.targetDailyBreakdown.find((item) => item.date === summary.date);
  const bestWindow = summary.bestShootableWindow ?? summary.keyWindows.find(isExecutableWindow);

  return {
    dateZh: formatDateLabelZh(summary.date, timezone, summary.dateLabelZh),
    recommendationZh: summary.dedicatedTripRecommendation ?? summary.recommendationLabel,
    scoreZh: `综合 ${summary.score} 分`,
    temperatureZh: summary.weather
      ? formatTemperatureRange(summary.weather.tempMin, summary.weather.tempMax)
      : "温度待复核",
    rainZh: summary.weather
      ? `${rainRiskSummaryZh(summary.weather)}；${rainTimingSummaryZh(summary.weather)}`
      : "降水待复核",
    cloudSeaZh: dailyMetricZh(breakdown?.cloudSea),
    glowZh: dailyMetricZh(breakdown?.sunriseGlow),
    sunsetGlowZh: dailyMetricZh(breakdown?.sunsetGlow),
    astroZh: [
      dailyMetricZh(breakdown?.stars),
      dailyMetricZh(breakdown?.milkyWay),
      result.astroAnalysis.weatherBlockers[0]
        ? `天气阻断：${result.astroAnalysis.weatherBlockers[0]}`
        : "仍需结合云量和月光复核",
    ].join("；"),
    transparencyZh: dailyMetricZh(breakdown?.transparency),
    bestWindowZh: bestWindow
      ? `${windowLabelZh(bestWindow)} ${formatWindowTimeZh(bestWindow, timezone)}`
      : "暂无高确定性拍摄窗口",
    actionZh:
      summary.dedicatedTripAdviceZh ??
      summary.nearbyObservationAdviceZh ??
      summary.shortAdvice ??
      "出发前复核短临天气和现场安全。",
  };
}

function isExecutableWindow(window: ForecastCalculationResult["bestWindows"][number]): boolean {
  return (
    window.executableForDedicatedTrip === true ||
    (window.practicalKind !== "formation_signal" &&
      window.recommendationLevel !== "backup" &&
      window.recommendationLevel !== "not_recommended" &&
      window.windowLevel !== "blocked")
  );
}

function forecastTrendSummary(result: ForecastCalculationResult): string {
  const firstWeather = result.dailySummaries[0]?.weather;
  const lastWeather = result.dailySummaries[result.dailySummaries.length - 1]?.weather;
  const cloudText =
    typeof firstWeather?.cloudTotal === "number" || typeof lastWeather?.cloudTotal === "number"
      ? `云量从 ${formatPercent(firstWeather?.cloudTotal)} 到 ${formatPercent(lastWeather?.cloudTotal)}，需要看云层开口。`
      : "云量趋势待复核，需结合短临云图。";
  return `未来 ${result.calendarBasis.forecastRangeLabel} 整体按${result.recommendationLabel}处理，${cloudText}`;
}

function temperatureTrendSummary(result: ForecastCalculationResult): string {
  const ranges = result.dailySummaries
    .map((summary) => summary.weather)
    .filter(
      (
        weather,
      ): weather is NonNullable<ForecastCalculationResult["dailySummaries"][number]["weather"]> =>
        Boolean(weather),
    )
    .map((weather) => [weather.tempMin, weather.tempMax] as const);
  const values = ranges.flat().filter((value): value is number => typeof value === "number");
  if (values.length === 0) {
    return "山顶估算温度待复核，清晨和夜间按偏凉处理。";
  }
  return `山顶估算温度约 ${Math.round(Math.min(...values))}-${Math.round(Math.max(...values))}°C，清晨体感偏凉，按山地防风准备。`;
}

function rainTrendSummary(result: ForecastCalculationResult): string {
  const rainyDays = result.dailySummaries
    .map((summary) => summary.weather)
    .filter((weather) => {
      const amount = precipitationAmountMm(weather);
      return amount !== null && amount > 0.3;
    });
  if (rainyDays.length === 0) {
    return "降水信号不明显，主要变量转为云层开口、低云和通透度。";
  }
  const strongest = rainyDays
    .map((weather) => ({ weather, amount: precipitationAmountMm(weather) ?? 0 }))
    .sort((left, right) => right.amount - left.amount)[0]?.weather;
  return `${rainRiskSummaryZh(strongest)}；${rainTimingSummaryZh(strongest)}。`;
}

function windTrendSummary(result: ForecastCalculationResult): string {
  const gusts = result.dailySummaries
    .map((summary) => summary.weather?.windGust)
    .filter((value): value is number => typeof value === "number");
  const speeds = result.dailySummaries
    .map((summary) => summary.weather?.windSpeed)
    .filter((value): value is number => typeof value === "number");
  if (gusts.length === 0 && speeds.length === 0) {
    return "风力待复核，山顶机位仍需按防风和保暖准备。";
  }
  const maxGust = gusts.length > 0 ? Math.max(...gusts) : undefined;
  const maxSpeed = speeds.length > 0 ? Math.max(...speeds) : undefined;
  return `最大风速约 ${formatWindValue(maxSpeed, maxGust)}，山顶三脚架稳定和风寒要提前考虑。`;
}

function transparencyTrendSummary(result: ForecastCalculationResult): string {
  const scores = result.dailySummaries
    .map((summary) => summary.weather?.photographyTransparencyScore)
    .filter((value): value is number => typeof value === "number");
  if (scores.length === 0) {
    return `${scoreSentence(result.scores.transparency)} 能见度字段不足时，远山层次需要现场复核。`;
  }
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return `平均通透度约 ${Math.round(avg)} 分；湿度、低云和能见度会影响远山层次。`;
}

function scoreSentence(
  score: ForecastCalculationResult["scores"][keyof ForecastCalculationResult["scores"]],
): string {
  return `${score.label} ${Math.round(score.score)} 分，${score.reasons[0] ?? "仍需现场复核"}`;
}

function bestSubjectFromScores(result: ForecastCalculationResult, index = 0): string {
  return (
    [
      result.scores.cloudSea,
      result.scores.sunriseGlow,
      result.scores.sunsetGlow,
      result.scores.milkyWay,
      result.scores.transparency,
    ].sort((left, right) => right.score - left.score)[index]?.label ?? "综合题材"
  );
}

function formatRiskWithTime(
  risk: ForecastCalculationResult["riskFlags"][number],
  timezone: string,
): string {
  const timeWindow =
    risk.timeWindowLabelZh ??
    (risk.startTime && risk.endTime
      ? formatShootingWindowZh({ startTime: risk.startTime, endTime: risk.endTime }, timezone)
      : "出行前后");
  return `${risk.label}（${timeWindow}）：${risk.description}`;
}

function dedicatedTripDecisionZh(
  result: ForecastCalculationResult,
  day: ForecastCalculationResult["dailySummaries"][number] | undefined,
): string {
  if (result.target === "cloud_sea") {
    return buildCloudSeaRecommendationGuardForResult(result).finalRecommendationLabel;
  }
  if (day?.dedicatedTripRecommendation) {
    return day.dedicatedTripRecommendation;
  }
  if (result.recommendationLabel.includes("不建议")) {
    return "不建议专程前往";
  }
  if (result.recommendationLabel.includes("谨慎")) {
    return "谨慎参考";
  }
  if (result.overallScore >= 80) {
    return "强推荐专程";
  }
  if (result.overallScore >= 62) {
    return "推荐安排";
  }
  return "仅作备选";
}

function nearbyDecisionZh(
  result: ForecastCalculationResult,
  day: ForecastCalculationResult["dailySummaries"][number] | undefined,
): string {
  if (day?.nearbyObservationAdviceZh) {
    return day.nearbyObservationAdviceZh;
  }
  if (day?.nearbyObservationRecommendation) {
    return `${day.nearbyObservationRecommendation}，优先短时观察云层、低云和雨隙变化。`;
  }
  return "如果已经在山上或附近，可短时观察云层开口；不要为单一信号持续消耗体力。";
}

function astroAdviceZh(result: ForecastCalculationResult): string {
  const blockers = result.astroAnalysis.weatherBlockers;
  if (!result.astroAnalysis.astroShootable || blockers.length > 0) {
    return `有天文窗口不代表能拍银河；当前星空 ${result.scores.stars.score} 分、银河 ${result.scores.milkyWay.score} 分，主要阻断为${blockers.slice(0, 2).join("、") || "云量、月光或通透度待复核"}，不建议只为银河专程。`;
  }
  return `星空 ${result.scores.stars.score} 分、银河 ${result.scores.milkyWay.score} 分，可纳入计划，但仍需复核云量、月光和夜间通行安全。`;
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "待复核";
}

function parseForecastAiExplanationOutput(
  rawOutput: string,
  result: ForecastCalculationResult,
): ForecastAiExplanationParseResult {
  const rawResponseSizeChars = rawOutput.length;
  let parseError: unknown;

  try {
    const parsed = parseJsonObjectWithStrategy(rawOutput);
    const explanation = normalizeForecastAiExplanationJson(parsed.value, result);
    if (explanation) {
      return {
        explanation: withDeepSeekParseMetadata(
          explanation,
          parsed.strategy,
          rawResponseSizeChars,
          false,
        ),
        parseStrategy: parsed.strategy,
        parseSuccess: true,
        fallbackUsed: false,
        rawResponseSizeChars,
      };
    }
  } catch (error) {
    parseError = error;
  }

  if (isMeaningfulPlainTextResponse(rawOutput)) {
    return {
      explanation: withDeepSeekParseMetadata(
        createPlainTextForecastExplanation(rawOutput, result),
        "plain_text_fallback",
        rawResponseSizeChars,
        true,
      ),
      parseStrategy: "plain_text_fallback",
      parseSuccess: false,
      fallbackUsed: true,
      rawResponseSizeChars,
    };
  }

  throw deepSeekError({
    errorCategory: "provider_parse_error",
    messageZh: "DeepSeek \u8fd4\u56de\u5185\u5bb9\u65e0\u6cd5\u89e3\u6790\u3002",
    responseSizeChars: rawResponseSizeChars,
    parseStrategy: "failed",
    cause: parseError,
  });
}

function normalizeForecastAiExplanationJson(
  value: unknown,
  result: ForecastCalculationResult,
): ForecastAiExplanation | null {
  const direct = forecastAiExplanationSchema.safeParse(value);
  if (direct.success) {
    return direct.data;
  }

  const unwrapped = unwrapLooseForecastExplanationValue(value);
  if (unwrapped !== value) {
    const unwrappedDirect = forecastAiExplanationSchema.safeParse(unwrapped);
    if (unwrappedDirect.success) {
      return unwrappedDirect.data;
    }
  }

  return createLooseJsonForecastExplanation(unwrapped, result);
}

function unwrapLooseForecastExplanationValue(value: unknown): unknown {
  if (!isPlainRecord(value)) {
    return value;
  }

  for (const key of [
    "explanation",
    "interpretation",
    "sections",
    "data",
    "result",
    "payload",
    "content",
    "report",
    "\u89e3\u8bfb",
    "\u667a\u80fd\u89e3\u8bfb",
    "\u62a5\u544a",
  ]) {
    const nested = value[key];
    if (isPlainRecord(nested)) {
      return nested;
    }
  }

  return value;
}

function createLooseJsonForecastExplanation(
  value: unknown,
  result: ForecastCalculationResult,
): ForecastAiExplanation | null {
  if (!isPlainRecord(value)) {
    return null;
  }

  const snippets = collectLooseTextSnippets(value, 12);
  if (!isMeaningfulAiText(snippets.join(" "))) {
    return null;
  }

  const fallback = createRuleBasedForecastExplanation(result);
  const conclusionRecord = looseRecordField(value, [
    "conclusion",
    "summary",
    "summaryText",
    "\u7ed3\u8bba",
    "\u603b\u7ed3",
    "\u6458\u8981",
  ]);
  const bestPlanRecord = looseRecordField(value, [
    "bestPlan",
    "plan",
    "suggestions",
    "advice",
    "\u6700\u4f73\u8ba1\u5212",
    "\u8ba1\u5212",
    "\u5efa\u8bae",
  ]);
  const weatherTrendRecord = looseRecordField(value, [
    "weatherTrend",
    "weather",
    "trend",
    "\u5929\u6c14\u8d8b\u52bf",
    "\u5929\u6c14",
    "\u8d8b\u52bf",
  ]);
  const subjectAdviceRecord = looseRecordField(value, [
    "subjectAdvice",
    "subjects",
    "\u9898\u6750\u5efa\u8bae",
    "\u9898\u6750",
  ]);
  const riskAndGearRecord = looseRecordField(value, [
    "riskAndGear",
    "risks",
    "gear",
    "\u98ce\u9669\u4e0e\u88c5\u5907",
    "\u98ce\u9669",
    "\u88c5\u5907",
  ]);
  const finalAdviceRecord = looseRecordField(value, [
    "finalAdvice",
    "final",
    "action",
    "\u6700\u7ec8\u5efa\u8bae",
    "\u884c\u52a8\u5efa\u8bae",
  ]);
  const reasons = readLooseStringArray(value, [
    "reasons",
    "reason",
    "why",
    "\u539f\u56e0",
    "\u7406\u7531",
  ]);
  const suggestions = readLooseStringArray(value, [
    "suggestions",
    "advice",
    "actions",
    "\u5efa\u8bae",
    "\u884c\u52a8",
  ]);
  const risks = readLooseStringArray(value, ["risks", "risk", "\u98ce\u9669"]);
  const summaryText = limitText(
    firstNonEmptyString([
      readLooseText(conclusionRecord, ["summaryZh", "summary", "summaryText", "text", "content"]),
      readLooseText(value, [
        "summaryZh",
        "summary",
        "summaryText",
        "text",
        "content",
        "\u7ed3\u8bba",
        "\u603b\u7ed3",
        "\u6458\u8981",
      ]),
      snippets[0],
    ]) ?? fallback.conclusion.summaryZh,
    700,
  );
  const decisionText = limitText(
    firstNonEmptyString([
      readLooseText(conclusionRecord, [
        "oneSentenceDecisionZh",
        "decision",
        "decisionZh",
        "\u4e00\u53e5\u8bdd\u7ed3\u8bba",
        "\u51b3\u7b56",
      ]),
      summaryText,
    ]) ?? fallback.conclusion.oneSentenceDecisionZh,
    180,
  );
  const planText = limitText(
    firstNonEmptyString([
      readLooseText(bestPlanRecord, [
        "bestWindowZh",
        "bestWindow",
        "plan",
        "window",
        "\u7a97\u53e3",
        "\u6700\u4f73\u7a97\u53e3",
      ]),
      suggestions[0],
      fallback.bestPlan.bestWindowZh,
    ]) ?? fallback.bestPlan.bestWindowZh,
    300,
  );
  const reasonText = limitText(
    firstNonEmptyString([
      readLooseText(bestPlanRecord, ["whyThisWindowZh", "why", "reason"]),
      reasons[0],
      readLooseText(weatherTrendRecord, ["trendSummaryZh", "summary", "text"]),
      fallback.bestPlan.whyThisWindowZh,
    ]) ?? fallback.bestPlan.whyThisWindowZh,
    360,
  );
  const actionText = limitText(
    firstNonEmptyString([
      readLooseText(finalAdviceRecord, ["goNoGoZh", "action", "advice", "text"]),
      suggestions[0],
      fallback.finalAdvice.goNoGoZh,
    ]) ?? fallback.finalAdvice.goNoGoZh,
    320,
  );
  const riskItems = takeTextItems(
    risks.length > 0
      ? risks
      : [
          readLooseText(riskAndGearRecord, ["keyRisks", "risk", "risks", "safetyZh", "text"]) ??
            fallback.riskAndGear.keyRisks[0] ??
            fallback.finalAdvice.nextCheckZh,
        ],
    4,
    180,
  );

  return {
    ...fallback,
    conclusion: {
      ...fallback.conclusion,
      titleZh:
        readLooseText(conclusionRecord, ["titleZh", "title", "\u6807\u9898"]) ??
        fallback.conclusion.titleZh,
      summaryZh: summaryText,
      recommendedDayZh:
        readLooseText(conclusionRecord, [
          "recommendedDayZh",
          "recommendedDay",
          "\u63a8\u8350\u65e5\u671f",
          "\u63a8\u8350\u65e5",
        ]) ?? fallback.conclusion.recommendedDayZh,
      recommendationLevelZh:
        readLooseText(conclusionRecord, [
          "recommendationLevelZh",
          "level",
          "\u63a8\u8350\u7b49\u7ea7",
        ]) ?? fallback.conclusion.recommendationLevelZh,
      whetherWorthDedicatedTripZh:
        readLooseText(conclusionRecord, [
          "whetherWorthDedicatedTripZh",
          "dedicatedTrip",
          "\u662f\u5426\u503c\u5f97\u4e13\u7a0b",
        ]) ?? fallback.conclusion.whetherWorthDedicatedTripZh,
      oneSentenceDecisionZh: decisionText,
    },
    bestPlan: {
      ...fallback.bestPlan,
      bestWindowZh: planText,
      whyThisWindowZh: reasonText,
      backupPlanZh: suggestions[1] ?? fallback.bestPlan.backupPlanZh,
    },
    weatherTrend: {
      ...fallback.weatherTrend,
      trendSummaryZh:
        readLooseText(weatherTrendRecord, ["trendSummaryZh", "summary", "text"]) ?? reasonText,
    },
    subjectAdvice: {
      ...fallback.subjectAdvice,
      cloudSeaZh:
        readLooseText(subjectAdviceRecord, ["cloudSeaZh", "cloudSea", "\u4e91\u6d77"]) ??
        fallback.subjectAdvice.cloudSeaZh,
      sunriseGlowZh:
        readLooseText(subjectAdviceRecord, ["sunriseGlowZh", "sunrise", "\u671d\u971e"]) ??
        fallback.subjectAdvice.sunriseGlowZh,
      sunsetGlowZh:
        readLooseText(subjectAdviceRecord, ["sunsetGlowZh", "sunset", "\u665a\u971e"]) ??
        fallback.subjectAdvice.sunsetGlowZh,
      astroMilkyWayZh:
        readLooseText(subjectAdviceRecord, [
          "astroMilkyWayZh",
          "astro",
          "milkyWay",
          "\u661f\u7a7a",
          "\u94f6\u6cb3",
        ]) ?? fallback.subjectAdvice.astroMilkyWayZh,
      transparencyZh:
        readLooseText(subjectAdviceRecord, ["transparencyZh", "transparency", "\u901a\u900f"]) ??
        fallback.subjectAdvice.transparencyZh,
    },
    riskAndGear: {
      ...fallback.riskAndGear,
      keyRisks: riskItems.length > 0 ? riskItems : fallback.riskAndGear.keyRisks,
      clothingZh:
        readLooseText(riskAndGearRecord, ["clothingZh", "clothing", "\u7a7f\u8863"]) ??
        fallback.riskAndGear.clothingZh,
      gearZh:
        readLooseText(riskAndGearRecord, ["gearZh", "gear", "\u5668\u6750", "\u88c5\u5907"]) ??
        fallback.riskAndGear.gearZh,
      safetyZh:
        readLooseText(riskAndGearRecord, ["safetyZh", "safety", "\u5b89\u5168"]) ??
        riskItems[0] ??
        fallback.riskAndGear.safetyZh,
    },
    finalAdvice: {
      ...fallback.finalAdvice,
      goNoGoZh: actionText,
      nextCheckZh: riskItems[0] ?? fallback.finalAdvice.nextCheckZh,
    },
    metadata: {
      source: "deepseek",
      noteZh: "Loose JSON response normalized by API.",
    },
  };
}

function withDeepSeekParseMetadata(
  explanation: ForecastAiExplanation,
  parseStrategy: ForecastAiExplanationParseStrategy,
  rawResponseSizeChars: number,
  fallbackUsed: boolean,
): ForecastAiExplanation {
  return {
    ...explanation,
    metadata: {
      ...explanation.metadata,
      source: "deepseek",
      parseStrategy,
      fallbackUsed,
      rawResponseSizeChars,
    },
  };
}

function isMeaningfulPlainTextResponse(text: string): boolean {
  const trimmed = stripMarkdownCodeFence(text).trim();
  return isMeaningfulAiText(trimmed);
}

function isMeaningfulAiText(text: string): boolean {
  const compact = text.replace(/[`"'{}[\]():,.;!?，。！？；：、\s_-]+/g, "").trim();
  if (compact.length < 16) {
    return false;
  }

  const cjkCount = compact.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  const latinCount = compact.match(/[a-zA-Z]/g)?.length ?? 0;
  return cjkCount >= 8 || latinCount >= 24 || compact.length >= 30;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function looseRecordField(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  const value = looseValueField(record, keys);
  return isPlainRecord(value) ? value : undefined;
}

function looseValueField(record: Record<string, unknown> | undefined, keys: readonly string[]) {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function readLooseText(
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
): string | undefined {
  return firstNonEmptyString(stringsFromLooseValue(looseValueField(record, keys)));
}

function readLooseStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
): readonly string[] {
  return stringsFromLooseValue(looseValueField(record, keys));
}

function stringsFromLooseValue(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return splitLooseTextItems(value);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringsFromLooseValue(item));
  }
  if (isPlainRecord(value)) {
    return collectLooseTextSnippets(value, 6);
  }
  return [];
}

function splitLooseTextItems(text: string): readonly string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const parts = trimmed
    .split(/\r?\n|[;；]/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

function collectLooseTextSnippets(value: unknown, limit: number, depth = 0): readonly string[] {
  if (limit <= 0 || depth > 4) {
    return [];
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [limitText(trimmed, 280)] : [];
  }
  if (Array.isArray(value)) {
    const output: string[] = [];
    for (const item of value) {
      output.push(...collectLooseTextSnippets(item, limit - output.length, depth + 1));
      if (output.length >= limit) {
        break;
      }
    }
    return output;
  }
  if (!isPlainRecord(value)) {
    return [];
  }

  const output: string[] = [];
  for (const [key, item] of Object.entries(value)) {
    if (["metadata", "source", "parseStrategy", "rawResponseSizeChars"].includes(key)) {
      continue;
    }
    output.push(...collectLooseTextSnippets(item, limit - output.length, depth + 1));
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

function firstNonEmptyString(values: readonly (string | undefined)[]): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

function createPlainTextForecastExplanation(
  text: string,
  result: ForecastCalculationResult,
): ForecastAiExplanation {
  const fallback = createRuleBasedForecastExplanation(result);
  const sections = splitPlainTextSections(text);
  const allText = limitText(text.trim(), 900);
  const conclusion = sections[0] ?? allText;
  const why = sections[1] ?? fallback.bestPlan.whyThisWindowZh;
  const advice = sections[2] ?? fallback.finalAdvice.goNoGoZh;
  const risk = sections[3] ?? fallback.riskAndGear.keyRisks[0] ?? fallback.finalAdvice.nextCheckZh;

  return {
    ...fallback,
    conclusion: {
      ...fallback.conclusion,
      summaryZh: conclusion,
      oneSentenceDecisionZh: firstPlainTextSentence(conclusion),
    },
    bestPlan: {
      ...fallback.bestPlan,
      whyThisWindowZh: why,
      backupPlanZh: advice,
    },
    weatherTrend: {
      ...fallback.weatherTrend,
      trendSummaryZh: why,
    },
    riskAndGear: {
      ...fallback.riskAndGear,
      keyRisks: [risk],
      safetyZh: risk,
    },
    finalAdvice: {
      ...fallback.finalAdvice,
      goNoGoZh: advice,
      nextCheckZh: risk,
    },
    metadata: {
      source: "deepseek",
      noteZh: "Plain text response normalized by API.",
    },
  };
}

function splitPlainTextSections(text: string): readonly string[] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const normalizedHeading = line
      .replace(/^#+\s*/, "")
      .replace(/[:：]$/, "")
      .trim();
    const isHeading = normalizedHeading.length <= 12 && current.length > 0;
    if (isHeading) {
      sections.push(limitText(current.join(" "), 260));
      current = [];
      continue;
    }
    current.push(line.replace(/^[-*]\s*/, ""));
  }

  if (current.length > 0) {
    sections.push(limitText(current.join(" "), 260));
  }

  return sections.length > 0 ? sections : [limitText(text.trim(), 260)];
}

function firstPlainTextSentence(text: string): string {
  const trimmed = text.trim();
  const sentence = trimmed.split(/[。！？!?]/)[0]?.trim();
  return sentence ? limitText(sentence, 120) : limitText(trimmed, 120);
}

export class DeepSeekProvider implements AIProvider {
  private readonly delegate: MockAIProvider;
  private readonly fetcher: DeepSeekFetch;
  private readonly enabled: boolean;
  private readonly realModeEnabled: boolean;
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly promptMaxChars: number;
  readonly responseFormat: "json_object";
  readonly thinkingEnabled: boolean;
  readonly reasoningEffort: DeepSeekReasoningEffort;
  readonly jsonOutputEnabled: boolean;
  readonly timeoutMs: number;

  constructor(private readonly options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.defaultModel = normalizeModel(options.defaultModel);
    this.temperature = normalizeTemperature(options.temperature);
    this.maxTokens = normalizeMaxTokens(options.maxTokens);
    this.promptMaxChars = normalizePromptMaxChars(options.promptMaxChars);
    this.responseFormat = normalizeResponseFormat(options.responseFormat);
    this.thinkingEnabled = options.thinkingEnabled ?? false;
    this.reasoningEffort = normalizeReasoningEffort(options.reasoningEffort);
    this.jsonOutputEnabled = options.jsonOutputEnabled ?? this.responseFormat === "json_object";
    this.timeoutMs = normalizeTimeoutMs(options.timeoutMs);
    this.enabled = options.enabled ?? false;
    this.realModeEnabled = options.realModeEnabled ?? options.mode === "real";
    this.fetcher = options.fetcher ?? fetch;
    this.delegate = new MockAIProvider();
  }

  async analyzeForecast(input: ForecastAnalysisInput): Promise<ForecastAnalysis> {
    if (this.options.mode === "mock") {
      return this.delegate.analyzeForecast(input);
    }

    const parsed = await this.requestJson(
      [
        {
          role: "system",
          content: buildJsonOnlySystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "请基于已提供的天气字段输出 JSON 分析，不要补充未提供的数据。",
            outputSchema: {
              summary: "一句综合说明",
              opportunities: ["机会点"],
              risks: ["风险点"],
              confidence: "0 到 1 的数字",
            },
            input,
          }),
        },
      ],
      800,
    );

    return {
      provider: "deepseek",
      ...this.validateJsonOutput(forecastAnalysisSchema, parsed),
    };
  }

  async generateDecisionCard(input: DecisionCardInput): Promise<DecisionCard> {
    if (this.options.mode === "mock") {
      return this.delegate.generateDecisionCard(input);
    }

    const parsed = await this.requestJson(
      [
        {
          role: "system",
          content: buildJsonOnlySystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "请基于输入生成摄影决策卡 JSON，不要改写已有分数。",
            outputSchema: {
              grade: "excellent|good|fair|poor",
              score: "0 到 100 的数字",
              title: "标题",
              summary: "摘要",
              reasons: ["理由"],
            },
            input,
          }),
        },
      ],
      800,
    );

    return this.validateJsonOutput(decisionCardSchema, parsed);
  }

  async generateForecastExplanation(
    input: ForecastExplanationInput,
  ): Promise<ForecastAiExplanation> {
    if (this.options.mode === "mock") {
      return createRuleBasedForecastExplanation(input.forecastResult);
    }

    const request = buildDeepSeekForecastExplanationRequest(input, {
      baseUrl: this.baseUrl,
      defaultModel: this.defaultModel,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      promptMaxChars: this.promptMaxChars,
      responseFormat: this.responseFormat,
      thinkingEnabled: this.thinkingEnabled,
      reasoningEffort: this.reasoningEffort,
      jsonOutputEnabled: this.jsonOutputEnabled,
    });
    const rawOutput = await this.request(request);
    return parseForecastAiExplanationOutput(rawOutput, input.forecastResult).explanation;
  }

  async testConnection(): Promise<{ readonly message: string }> {
    const parsed = await this.requestJson(
      [
        {
          role: "system",
          content: "输出简体中文 JSON。必须只输出 JSON 对象。",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "返回一个最小连接测试 JSON。",
            outputSchema: {
              message: "连接测试通过",
            },
          }),
        },
      ],
      120,
    );
    const result = this.validateJsonOutput(
      z.object({
        message: z.string().trim().min(1),
      }),
      parsed,
    );

    return result;
  }

  validateJsonOutput<T>(schema: z.ZodSchema<T>, rawOutput: string): T {
    try {
      return schema.parse(parseJsonObjectWithExtraction(rawOutput));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw deepSeekError({
          errorCategory: "provider_parse_error",
          messageZh: "DeepSeek 返回格式异常。",
          cause: error,
        });
      }
      if (error instanceof z.ZodError) {
        throw deepSeekError({
          errorCategory: "provider_parse_error",
          messageZh: "DeepSeek 返回结构不符合解读要求。",
          cause: error,
        });
      }

      throw error;
    }
  }

  private async requestJson(
    messages: readonly DeepSeekChatMessage[],
    maxTokens: number,
  ): Promise<string> {
    const body: DeepSeekRequestBody = {
      model: this.defaultModel,
      messages,
      temperature: this.temperature,
      max_tokens: normalizeMaxTokens(maxTokens, this.maxTokens),
      stream: false,
    };
    if (this.jsonOutputEnabled) {
      body.response_format = {
        type: "json_object",
      };
    }
    applyReasoningEffort(body, {
      thinkingEnabled: this.thinkingEnabled,
      reasoningEffort: this.reasoningEffort,
    });

    const request: DeepSeekRequestPreview = {
      url: `${this.baseUrl}/chat/completions`,
      body,
      promptSizeChars: buildPromptSizeChars(messages),
      outputMode: this.jsonOutputEnabled ? "json_object" : "text_with_json_fallback",
    };

    return this.request(request);
  }

  private async request(request: DeepSeekRequestPreview): Promise<string> {
    const apiKey = this.getApiKey();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetcher(request.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const text = await response.text();
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        throw deepSeekError({
          errorCategory: classifyDeepSeekHttpError(response.status),
          messageZh:
            response.status === 401 || response.status === 403
              ? "DeepSeek API Key 无效或权限不足。"
              : response.status === 429
                ? "DeepSeek 上游限流，请稍后重试。"
                : response.status >= 500
                  ? "DeepSeek 上游服务暂时不可用。"
                  : `DeepSeek 服务请求失败，状态码 ${response.status}。`,
          statusCode: response.status,
          latencyMs,
          promptSizeChars: request.promptSizeChars,
          responseSizeChars: text.length,
        });
      }

      return getMessageContent(parseDeepSeekChatResponse(text, latencyMs), latencyMs, text.length);
    } catch (error) {
      throw normalizeDeepSeekRequestError(error, Date.now() - startedAt, request.promptSizeChars);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getApiKey(): string {
    if (!this.realModeEnabled) {
      throw deepSeekError({
        errorCategory: "provider_disabled",
        messageZh: deepSeekRealModeDisabledMessage,
      });
    }

    if (!this.enabled) {
      throw deepSeekError({
        errorCategory: "provider_disabled",
        messageZh: deepSeekProviderDisabledMessage,
      });
    }

    if (!this.apiKey) {
      throw deepSeekError({
        errorCategory: "config_missing",
        messageZh: missingDeepSeekApiKeyMessage,
      });
    }

    return this.apiKey;
  }
}

function classifyDeepSeekHttpError(status: number): DeepSeekInterpretationErrorCategory {
  return status >= 400 ? "provider_http_error" : "unknown";
}
