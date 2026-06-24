import {
  openAiDefaultBaseUrl,
  openAiDefaultMaxTokens,
  openAiDefaultPromptMaxChars,
  openAiDefaultTemperature,
  openAiDefaultTimeoutMs,
  normalizeOpenAiModel,
  type DecisionCard,
  type ForecastCalculationResult,
} from "@photo-weather/shared";
import { z } from "zod";
import {
  buildDeepSeekForecastContext,
  createRuleBasedForecastExplanation,
  isDeepSeekProviderError,
  parseForecastAiExplanationOutput,
} from "./deepseek-provider.js";
import { MockAIProvider } from "./mock-provider.js";
import type {
  AIProvider,
  DecisionCardInput,
  ForecastAiExplanation,
  ForecastAiExplanationSectionKey,
  ForecastAiExplanationSectionResult,
  ForecastAiExplanationSectionedResult,
  ForecastAiExplanationParseStrategy,
  ForecastAnalysis,
  ForecastAnalysisInput,
  ForecastExplanationInput,
} from "./types.js";

type OpenAiFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenAiProviderOptions = {
  readonly apiKey?: string;
  readonly authToken?: string;
  readonly internalRelayToken?: string;
  readonly baseUrl?: string;
  readonly defaultModel?: string;
  readonly enabled?: boolean;
  readonly realModeEnabled?: boolean;
  readonly fetcher?: OpenAiFetch;
  readonly mode?: "disabled" | "mock" | "real";
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly promptMaxChars?: number;
  readonly timeoutMs?: number;
};

export type OpenAiRequestBody = {
  readonly model: string;
  readonly instructions: string;
  readonly input: string;
  readonly temperature: number;
  readonly max_output_tokens: number;
  readonly store: false;
  readonly stream: false;
};

export type OpenAiRequestPreview = {
  readonly url: string;
  readonly body: OpenAiRequestBody;
  readonly promptSizeChars: number;
  readonly promptMaxChars?: number;
  readonly sectionKey?: ForecastAiExplanationSectionKey;
  readonly compactingApplied?: boolean;
  readonly outputMode: "text_with_json_fallback";
};

export type OpenAiSafeUpstreamDiagnostics = {
  readonly upstreamStatusCode?: number;
  readonly upstreamErrorCode?: string;
  readonly upstreamErrorType?: string;
  readonly upstreamMessageSanitized?: string;
  readonly upstreamRequestId?: string;
  readonly rawResponseSizeChars?: number;
  readonly finishReason?: string;
  readonly choiceIndex?: number;
  readonly messageKeys?: readonly string[];
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly reasoningContentLength?: number;
};

export type OpenAiRequestDiagnostics = OpenAiSafeUpstreamDiagnostics & {
  readonly attempts: number;
  readonly compatibilityFallbackUsed: boolean;
  readonly disabledResponseFormat: boolean;
  readonly disabledReasoningEffort: boolean;
  readonly emptyContentFallbackUsed: boolean;
  readonly firstFailureUpstreamCode?: string;
  readonly finalFailureUpstreamCode?: string;
  readonly finalFinishReason?: string;
  readonly finalContentType?: string;
  readonly finalContentLength?: number;
};

export type OpenAiForecastExplanationResult = {
  readonly explanation: ForecastAiExplanation;
  readonly parseStrategy: ForecastAiExplanationParseStrategy;
  readonly parseSuccess: boolean;
  readonly fallbackUsed: boolean;
  readonly rawResponseSizeChars: number;
  readonly requestDiagnostics: OpenAiRequestDiagnostics;
};

export type OpenAiInterpretationErrorCategory =
  | "provider_disabled"
  | "config_missing"
  | "timeout"
  | "network_error"
  | "provider_http_error"
  | "provider_invalid_response"
  | "provider_parse_error"
  | "prompt_too_large"
  | "unknown";

const openAiSectionedExplanationVersion = "forecast-ai-sectioned-v1" as const;

export const forecastAiExplanationSectionKeys = [
  "overview",
  "timeline",
  "subject_advice",
  "risk_gear",
  "final_decision",
] as const satisfies readonly ForecastAiExplanationSectionKey[];

const forecastAiExplanationGenerationOrder = [
  "overview",
  "final_decision",
  "timeline",
  "subject_advice",
  "risk_gear",
] as const satisfies readonly ForecastAiExplanationSectionKey[];

const sectionTitleZh: Record<ForecastAiExplanationSectionKey, string> = {
  overview: "综合结论",
  timeline: "窗口节奏",
  subject_advice: "题材建议",
  risk_gear: "风险与装备",
  final_decision: "最终行动",
};

const sectionMaxTokens: Record<ForecastAiExplanationSectionKey, number> = {
  overview: 700,
  timeline: 900,
  subject_advice: 900,
  risk_gear: 700,
  final_decision: 500,
};

type ForecastAiPromptHorizon = "24h" | "48h" | "72h" | "7d" | "30d" | "90d" | "unknown";

const horizonInstructions: Record<ForecastAiPromptHorizon, string> = {
  "24h":
    "Horizon style: 24h. Focus on immediate execution, exact hour windows, arrival timing, short-term risks, whether it is worth going today, and what to shoot first. Avoid long-term speculation. Remind the user to check short-term nowcasting before departure. Keep paragraphs concise and action-oriented.",
  "48h":
    "Horizon style: 48h. Compare today and tomorrow, identify the better day/time period, explain confidence differences between near-term and next-day windows, and give a backup plan if the better window shifts.",
  "72h":
    "Horizon style: 72h. Treat this as a 3-day travel decision. Rank the top 1-2 windows, explain which day is worth planning around, give a practical threshold for dedicated trip / nearby trip / wait, and state when to recheck.",
  "7d":
    "Horizon style: 7d. Focus on daily trend instead of excessive hour-by-hour detail. Pick top 1-2 candidate days/windows, explain trend changes in cloud, precipitation, transparency, wind, and moon/astro when relevant. State that uncertainty increases for later days and tell the user when to decide and recheck.",
  "30d":
    "Horizon style: 30d. Do not pretend to provide precise hour-level weather. Focus on medium-range trend, seasonal or climatological tendency, planning value, and uncertainty. Do not invent exact shooting windows unless deterministic facts provide them. Tell the user to use 7d/72h/24h forecasts for the final departure decision.",
  "90d":
    "Horizon style: 90d. Treat this as seasonal planning and destination scouting, not a precise weather forecast. Focus on broad suitability, likely seasonal opportunities, preparation, and timing strategy. Avoid exact claims unless deterministic facts provide them. Tell the user to recheck closer horizons before travel.",
  unknown:
    "Horizon style: unknown. Match the advice to the deterministic forecast range. Prefer concrete execution for short ranges and trend/uncertainty framing for long ranges. Do not invent precision beyond the supplied facts.",
};

type OpenAiCompactForecastFactsDetail = "standard" | "budget";

export type OpenAiCompactForecastExplanationFacts = {
  readonly contextVersion: "openai-forecast-explanation-compact-v1";
  readonly deterministicOnly: true;
  readonly detail: OpenAiCompactForecastFactsDetail;
  readonly location: {
    readonly name: string;
    readonly countryCode?: string;
  };
  readonly target: ForecastCalculationResult["target"];
  readonly horizon: ForecastCalculationResult["horizon"];
  readonly timezone: string;
  readonly generatedAt: string;
  readonly forecastRange: {
    readonly start: string;
    readonly end: string;
    readonly labelZh: string;
  };
  readonly overall: {
    readonly score: number;
    readonly recommendationLevel: ForecastCalculationResult["recommendationLevel"];
    readonly recommendationLabelZh: string;
    readonly summaryZh: string;
    readonly tripDecisionZh: string;
  };
  readonly bestWindows: readonly unknown[];
  readonly keyDaySummaries: readonly unknown[];
  readonly keyHourSummaries: readonly unknown[];
  readonly signals: {
    readonly cloudSea?: unknown;
    readonly glow?: unknown;
    readonly astro?: unknown;
    readonly transparency?: unknown;
  };
  readonly risks: readonly unknown[];
  readonly terrainBasis?: unknown;
  readonly coordinateBasis: {
    readonly source: string;
    readonly wgs84: {
      readonly latitude: number;
      readonly longitude: number;
    };
  };
  readonly sourceBasis: {
    readonly weatherDataMode: ForecastCalculationResult["weatherDataMode"];
    readonly isMock: boolean;
    readonly weatherProviderLabelZh: string;
    readonly dataNoticeZh: string;
  };
  readonly deterministicSafetyNotes: readonly string[];
};

export type OpenAiProviderErrorOptions = {
  readonly errorCategory: OpenAiInterpretationErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly promptSizeChars?: number;
  readonly responseSizeChars?: number;
  readonly parseStrategy?: ForecastAiExplanationParseStrategy;
  readonly attempts?: number;
  readonly compatibilityFallbackUsed?: boolean;
  readonly disabledResponseFormat?: boolean;
  readonly disabledReasoningEffort?: boolean;
  readonly emptyContentFallbackUsed?: boolean;
  readonly firstFailureUpstreamCode?: string;
  readonly finalFailureUpstreamCode?: string;
  readonly upstreamStatusCode?: number;
  readonly upstreamErrorCode?: string;
  readonly upstreamErrorType?: string;
  readonly upstreamMessageSanitized?: string;
  readonly upstreamRequestId?: string;
  readonly rawResponseSizeChars?: number;
  readonly finishReason?: string;
  readonly choiceIndex?: number;
  readonly messageKeys?: readonly string[];
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly reasoningContentLength?: number;
  readonly finalFinishReason?: string;
  readonly finalContentType?: string;
  readonly finalContentLength?: number;
  readonly cause?: unknown;
};

export class OpenAiProviderError extends Error {
  readonly errorCategory: OpenAiInterpretationErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly promptSizeChars?: number;
  readonly responseSizeChars?: number;
  readonly parseStrategy?: ForecastAiExplanationParseStrategy;
  readonly attempts?: number;
  readonly compatibilityFallbackUsed?: boolean;
  readonly disabledResponseFormat?: boolean;
  readonly disabledReasoningEffort?: boolean;
  readonly emptyContentFallbackUsed?: boolean;
  readonly firstFailureUpstreamCode?: string;
  readonly finalFailureUpstreamCode?: string;
  readonly upstreamStatusCode?: number;
  readonly upstreamErrorCode?: string;
  readonly upstreamErrorType?: string;
  readonly upstreamMessageSanitized?: string;
  readonly upstreamRequestId?: string;
  readonly rawResponseSizeChars?: number;
  readonly finishReason?: string;
  readonly choiceIndex?: number;
  readonly messageKeys?: readonly string[];
  readonly contentType?: string;
  readonly contentLength?: number;
  readonly reasoningContentLength?: number;
  readonly finalFinishReason?: string;
  readonly finalContentType?: string;
  readonly finalContentLength?: number;
  override readonly cause?: unknown;

  constructor(options: OpenAiProviderErrorOptions) {
    super(options.messageZh);
    this.name = "OpenAiProviderError";
    this.errorCategory = options.errorCategory;
    this.messageZh = options.messageZh;
    this.statusCode = options.statusCode;
    this.latencyMs = options.latencyMs;
    this.promptSizeChars = options.promptSizeChars;
    this.responseSizeChars = options.responseSizeChars;
    this.parseStrategy = options.parseStrategy;
    this.attempts = options.attempts;
    this.compatibilityFallbackUsed = options.compatibilityFallbackUsed;
    this.disabledResponseFormat = options.disabledResponseFormat;
    this.disabledReasoningEffort = options.disabledReasoningEffort;
    this.emptyContentFallbackUsed = options.emptyContentFallbackUsed;
    this.firstFailureUpstreamCode = options.firstFailureUpstreamCode;
    this.finalFailureUpstreamCode = options.finalFailureUpstreamCode;
    this.upstreamStatusCode = options.upstreamStatusCode;
    this.upstreamErrorCode = options.upstreamErrorCode;
    this.upstreamErrorType = options.upstreamErrorType;
    this.upstreamMessageSanitized = options.upstreamMessageSanitized;
    this.upstreamRequestId = options.upstreamRequestId;
    this.rawResponseSizeChars = options.rawResponseSizeChars;
    this.finishReason = options.finishReason;
    this.choiceIndex = options.choiceIndex;
    this.messageKeys = options.messageKeys;
    this.contentType = options.contentType;
    this.contentLength = options.contentLength;
    this.reasoningContentLength = options.reasoningContentLength;
    this.finalFinishReason = options.finalFinishReason;
    this.finalContentType = options.finalContentType;
    this.finalContentLength = options.finalContentLength;
    this.cause = options.cause;
  }
}

export function isOpenAiProviderError(error: unknown): error is OpenAiProviderError {
  return error instanceof OpenAiProviderError;
}

export const missingOpenAiApiKeyMessage = "请先填写 GPT / OpenAI API Key 或中转鉴权令牌。";

const openAiRealModeDisabledMessage =
  "GPT / OpenAI 真实调用未启用，请先在后台服务商配置中启用真实调用。";

const openAiProviderDisabledMessage =
  "GPT / OpenAI 服务商未启用，请先在后台服务商配置中启用 GPT / OpenAI。";

function openAiError(options: OpenAiProviderErrorOptions): OpenAiProviderError {
  return new OpenAiProviderError(options);
}

function normalizeBaseUrl(value: string | undefined): string {
  const trimmed = value?.trim() || openAiDefaultBaseUrl;
  return trimmed.replace(/\/+$/, "");
}

function normalizeTemperature(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return openAiDefaultTemperature;
  }
  return Math.min(2, Math.max(0, value));
}

function normalizeMaxTokens(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return openAiDefaultMaxTokens;
  }
  return Math.round(Math.min(8192, Math.max(128, value)));
}

function normalizePromptMaxChars(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return openAiDefaultPromptMaxChars;
  }
  return Math.round(Math.min(20000, Math.max(3000, value)));
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return openAiDefaultTimeoutMs;
  }
  return Math.round(Math.min(120000, Math.max(1000, value)));
}

export function buildCompactForecastExplanationFacts(
  result: ForecastCalculationResult,
  detail: OpenAiCompactForecastFactsDetail = "standard",
): OpenAiCompactForecastExplanationFacts {
  const sharedContext = buildDeepSeekForecastContext(
    result,
    detail === "budget" ? "budget" : "minimal",
  ) as Record<string, unknown>;
  const fallback = createRuleBasedForecastExplanation(result);
  const horizon = isPlainRecord(sharedContext.horizon) ? sharedContext.horizon : {};
  const overall = isPlainRecord(sharedContext.overall) ? sharedContext.overall : {};
  const dataStatus = isPlainRecord(sharedContext.dataStatus) ? sharedContext.dataStatus : {};
  const topicScores = arrayField(sharedContext.topicScores);

  return {
    contextVersion: "openai-forecast-explanation-compact-v1",
    deterministicOnly: true,
    detail,
    location: {
      name: limitText(result.place.name, 80),
      countryCode: result.place.countryCode,
    },
    target: result.target,
    horizon: result.horizon,
    timezone: result.calendarBasis.timezone,
    generatedAt: result.generatedAt,
    forecastRange: {
      start: result.forecastStart,
      end: result.forecastEnd,
      labelZh:
        typeof horizon.rangeZh === "string"
          ? limitText(horizon.rangeZh, 120)
          : result.calendarBasis.forecastRangeLabel,
    },
    overall: {
      score: result.overallScore,
      recommendationLevel: result.recommendationLevel,
      recommendationLabelZh:
        typeof overall.recommendationLabelZh === "string"
          ? limitText(overall.recommendationLabelZh, 80)
          : result.recommendationLabel,
      summaryZh:
        typeof overall.summaryZh === "string"
          ? limitText(overall.summaryZh, 180)
          : limitText(result.summary, 180),
      tripDecisionZh: limitText(fallback.finalAdvice.ifDedicatedTripZh, 180),
    },
    bestWindows: arrayField(sharedContext.bestWindows).slice(0, detail === "budget" ? 1 : 3),
    keyDaySummaries: arrayField(sharedContext.dailySummaries).slice(0, detail === "budget" ? 1 : 3),
    keyHourSummaries: compactProfessionalHourlyFacts(result, detail),
    signals: {
      cloudSea: compactSignalForFacts(
        sharedContext.cloudSeaAiExplainPayload ?? topicScores.find(scoreHasKey("cloudSea")),
      ),
      glow: compactSignalForFacts(
        sharedContext.glowAiExplainPayload ?? {
          sunriseGlow: topicScores.find(scoreHasKey("sunriseGlow")),
          sunsetGlow: topicScores.find(scoreHasKey("sunsetGlow")),
        },
      ),
      astro: compactSignalForFacts(
        sharedContext.astroAiExplainPayload ??
          {
            astroShootable: result.astroAnalysis.astroShootable,
            weatherBlockers: result.astroAnalysis.weatherBlockers.slice(0, 3),
            stars: topicScores.find(scoreHasKey("stars")),
            milkyWay: topicScores.find(scoreHasKey("milkyWay")),
            lightPollution: result.astroAnalysis.lightPollution
              ? {
                  dataAvailable: result.astroAnalysis.lightPollution.dataAvailable,
                  ambientLevelZh: result.astroAnalysis.lightPollution.ambientRiskLevelLabelZh,
                  targetDirectionLevelZh:
                    result.astroAnalysis.lightPollution.targetDirectionLevelLabelZh ?? null,
                }
              : null,
          },
      ),
      transparency: compactSignalForFacts(topicScores.find(scoreHasKey("transparency"))),
    },
    risks: arrayField(sharedContext.risks).slice(0, detail === "budget" ? 3 : 6),
    terrainBasis: compactSignalForFacts(sharedContext.terrain),
    coordinateBasis: {
      source: result.calendarBasis.coordinateSource,
      wgs84: {
        latitude: roundNumber(result.calendarBasis.wgs84Coordinates.latitude, 5),
        longitude: roundNumber(result.calendarBasis.wgs84Coordinates.longitude, 5),
      },
    },
    sourceBasis: {
      weatherDataMode: result.weatherDataMode,
      isMock: result.isMock,
      weatherProviderLabelZh: result.weatherProviderLabelZh,
      dataNoticeZh:
        typeof dataStatus.noticeZh === "string"
          ? limitText(dataStatus.noticeZh, 180)
          : limitText(result.dataNotice, 180),
    },
    deterministicSafetyNotes: [
      ...result.clothingGuide.riskNotes.slice(0, detail === "budget" ? 2 : 4),
      fallback.riskAndGear.safetyZh,
      fallback.finalAdvice.nextCheckZh,
    ]
      .filter(Boolean)
      .map((item) => limitText(item, 140)),
  };
}

function arrayField(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function scoreHasKey(key: string): (value: unknown) => boolean {
  return (value) => isPlainRecord(value) && value.key === key;
}

function compactSignalForFacts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 4).map(compactSignalForFacts);
  }
  if (!isPlainRecord(value)) {
    return value;
  }

  const compact: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "debugMeta" || key === "rawPrompt" || key === "rawResponse") {
      continue;
    }
    if (typeof item === "string") {
      compact[key] = limitText(item, 180);
    } else if (Array.isArray(item)) {
      compact[key] = item.slice(0, 4).map(compactSignalForFacts);
    } else if (isPlainRecord(item)) {
      compact[key] = compactSignalForFacts(item);
    } else {
      compact[key] = item;
    }
  }
  return compact;
}

function compactProfessionalHourlyFacts(
  result: ForecastCalculationResult,
  detail: OpenAiCompactForecastFactsDetail,
): readonly unknown[] {
  const rows = result.professionalHourlyData ?? [];
  if (rows.length === 0) {
    return [];
  }

  const limit = detail === "budget" ? 4 : 8;
  const selected = new Map<string, (typeof rows)[number]>();
  for (const window of result.bestWindows.slice(0, 3)) {
    const match = rows.find((row) => row.time >= window.startTime && row.time <= window.endTime);
    if (match) {
      selected.set(match.time, match);
    }
  }
  for (const row of rows) {
    selected.set(row.time, row);
    if (selected.size >= limit) {
      break;
    }
  }

  return Array.from(selected.values())
    .slice(0, limit)
    .map((row) => ({
      time: row.time,
      labelZh: `${row.dateLabel} ${row.timeLabel}`,
      weatherTextZh: row.weatherText,
      cloudSeaSignal: row.cloudSeaSignal,
      cloudTotalPercent: row.cloudTotalPercent,
      cloudLowPercent: row.cloudLowPercent,
      cloudMidPercent: row.cloudMidPercent,
      cloudHighPercent: row.cloudHighPercent,
      temperatureC: row.displayedTemperatureC ?? row.terrainAdjustedTemperatureC ?? row.rawTemperatureC,
      dewPointSpreadC: row.dewPointSpreadC,
      humidityPercent: row.relativeHumidityPercent,
      precipitationAmountMm: row.precipitationAmountMm,
      precipitationProbabilityPercent: row.precipitationProbabilityPercent,
      visibilityMeters: row.visibilityMeters,
      windSpeedMs: row.windSpeedMs,
      notesZh: row.notesZh?.slice(0, 2),
    }));
}

export function compactForecastFactsForSection(
  facts: OpenAiCompactForecastExplanationFacts,
  sectionKey: ForecastAiExplanationSectionKey,
): Record<string, unknown> {
  const base = {
    contextVersion: facts.contextVersion,
    deterministicOnly: facts.deterministicOnly,
    detail: facts.detail,
    location: facts.location,
    target: facts.target,
    horizon: facts.horizon,
    timezone: facts.timezone,
    generatedAt: facts.generatedAt,
    forecastRange: facts.forecastRange,
    overall: facts.overall,
    sourceBasis: facts.sourceBasis,
  };

  switch (sectionKey) {
    case "overview":
      return {
        ...base,
        bestWindows: facts.bestWindows.slice(0, 2),
        keyDaySummaries: facts.keyDaySummaries.slice(0, 2),
        risks: facts.risks.slice(0, 3),
      };
    case "timeline":
      return {
        ...base,
        bestWindows: facts.bestWindows,
        keyDaySummaries: facts.keyDaySummaries,
        keyHourSummaries: facts.keyHourSummaries,
      };
    case "subject_advice":
      return {
        ...base,
        bestWindows: facts.bestWindows,
        keyDaySummaries: facts.keyDaySummaries,
        signals: facts.signals,
      };
    case "risk_gear":
      return {
        ...base,
        risks: facts.risks,
        keyHourSummaries: facts.keyHourSummaries,
        terrainBasis: facts.terrainBasis,
        deterministicSafetyNotes: facts.deterministicSafetyNotes,
      };
    case "final_decision":
      return {
        ...base,
        bestWindows: facts.bestWindows.slice(0, 2),
        risks: facts.risks.slice(0, 3),
        deterministicSafetyNotes: facts.deterministicSafetyNotes.slice(0, 3),
      };
  }
}

export function trimCompactFactsToBudget(
  value: Record<string, unknown>,
  maxChars: number,
): { readonly facts: Record<string, unknown>; readonly compactingApplied: boolean } {
  if (safeJsonSize(value) <= maxChars) {
    return { facts: value, compactingApplied: false };
  }

  const compact = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  trimArrayField(compact, "keyHourSummaries", 3);
  trimArrayField(compact, "keyDaySummaries", 2);
  trimArrayField(compact, "bestWindows", 2);
  trimArrayField(compact, "risks", 3);
  trimArrayField(compact, "deterministicSafetyNotes", 3);
  if (safeJsonSize(compact) <= maxChars) {
    return { facts: compact, compactingApplied: true };
  }

  trimArrayField(compact, "keyHourSummaries", 1);
  trimArrayField(compact, "keyDaySummaries", 1);
  trimArrayField(compact, "bestWindows", 1);
  trimArrayField(compact, "risks", 2);
  if (safeJsonSize(compact) <= maxChars) {
    return { facts: compact, compactingApplied: true };
  }

  return {
    facts: {
      contextVersion: compact.contextVersion,
      deterministicOnly: compact.deterministicOnly,
      location: compact.location,
      target: compact.target,
      horizon: compact.horizon,
      timezone: compact.timezone,
      forecastRange: compact.forecastRange,
      overall: compact.overall,
      sourceBasis: compact.sourceBasis,
      limitationZh:
        "确定性结果较长，本节只保留总分、推荐等级、预报范围和最关键窗口；缺失事实必须说明未提供。",
    },
    compactingApplied: true,
  };
}

function trimArrayField(record: Record<string, unknown>, key: string, count: number): void {
  const value = record[key];
  if (Array.isArray(value)) {
    record[key] = value.slice(0, count);
  }
}

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sectionOutputMaxTokens(
  sectionKey: ForecastAiExplanationSectionKey,
  configuredMaxTokens: number | undefined,
): number {
  const configured = normalizeMaxTokens(configuredMaxTokens);
  return Math.max(300, Math.min(sectionMaxTokens[sectionKey], configured));
}

function promptHorizonForFacts(
  horizon: OpenAiCompactForecastExplanationFacts["horizon"] | string,
): ForecastAiPromptHorizon {
  return horizon === "24h" ||
    horizon === "48h" ||
    horizon === "72h" ||
    horizon === "7d" ||
    horizon === "30d" ||
    horizon === "90d"
    ? horizon
    : "unknown";
}

function isLongRangePromptHorizon(horizon: ForecastAiPromptHorizon): boolean {
  return horizon === "7d" || horizon === "30d" || horizon === "90d";
}

const sectionKeyOverviewInstruction =
  "For the overview section, answer in Chinese: 值不值得去、最适合拍什么、什么时候去、如果只选一个窗口该选哪一个。";

function targetInstructions(
  target: OpenAiCompactForecastExplanationFacts["target"],
  horizon: ForecastAiPromptHorizon,
  sectionKey: ForecastAiExplanationSectionKey,
): string {
  const longRange = isLongRangePromptHorizon(horizon);
  switch (target) {
    case "cloud_sea":
      return [
        "Target style: cloud_sea. Emphasize humidity, low cloud or fog signal, wind, precipitation, terrain/elevation, whiteout, and safety.",
        horizon === "24h" || horizon === "48h"
          ? "For this short cloud-sea horizon, emphasize arrival timing and retreat timing."
          : "",
        longRange
          ? "For long-range cloud-sea horizons, identify candidate days and tell the user when to recheck."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "glow":
      return [
        "Target style: glow. Emphasize sunrise/sunset, twilight window, cloud layers, horizon obstruction, precipitation, and wind.",
        horizon === "24h" ? "For 24h glow advice, give exact pre-position timing." : "",
        longRange
          ? "For long-range glow horizons, identify candidate days and warn that uncertainty is higher."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "astro":
      return [
        "Target style: astro. Emphasize moon, astronomical night, Milky Way window, cloud cover, transparency, wind, and light pollution.",
        horizon === "24h" || horizon === "48h"
          ? "For this short astro horizon, give an actionable night window and fallback."
          : "",
        longRange
          ? "For long-range astro horizons, identify candidate nights and tell the user when to recheck."
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "general":
    default:
      return [
        "Target style: general. Balance cloud sea, glow, astro, transparency, and travel risk.",
        sectionKey === "overview" ? sectionKeyOverviewInstruction : "",
      ]
        .filter(Boolean)
        .join(" ");
  }
}

function buildSectionInstructions(
  sectionKey: ForecastAiExplanationSectionKey,
  facts: OpenAiCompactForecastExplanationFacts,
): string {
  const focusBySection: Record<ForecastAiExplanationSectionKey, string> = {
    overview:
      "本节只写整体去不去、推荐等级、优先题材和核心原因，避免展开逐小时细节。",
    timeline:
      "本节只写 24h / 48h / 72h / 7d 的窗口节奏；什么时候拍什么必须来自事实。",
    subject_advice:
      "本节只写云海、日出朝霞、日落晚霞、星空银河、通透度等题材建议；缺失值要直说未提供。",
    risk_gear:
      "本节只写降水、风、温度、道路/安全、穿衣、器材和备选计划，不编造现场道路或管制。",
    final_decision:
      "本节只写最终行动：专程、附近顺路、等待、下一次复核时间；不要新增确定性结果之外的时间。",
  };

  return [
    "You are only explaining deterministic forecast facts.",
    "Use only computedForecastFacts from the input payload.",
    "Do not recalculate or invent weather, astronomy, terrain, score, probability, time windows, moon phase, Milky Way windows, cloud sea probability, glow probability, or risk facts.",
    "If facts are insufficient, state the limitation in Chinese.",
    "Write practical Chinese advice for photographers and travel decisions.",
    "Avoid AI-flavored empty wording.",
    "Avoid data source names unless present in deterministic user-facing basis.",
    "Keep output useful and concise.",
    horizonInstructions[promptHorizonForFacts(facts.horizon)],
    targetInstructions(facts.target, promptHorizonForFacts(facts.horizon), sectionKey),
    focusBySection[sectionKey],
    'Return either compact JSON {"textZh":"...","bulletPointsZh":["..."]} or plain Chinese text for this one section only.',
  ].join("\n");
}

export function buildSectionPromptFromCompactFacts(
  sectionKey: ForecastAiExplanationSectionKey,
  facts: OpenAiCompactForecastExplanationFacts,
  options: Pick<
    OpenAiProviderOptions,
    "baseUrl" | "defaultModel" | "temperature" | "maxTokens" | "promptMaxChars"
  > = {},
): OpenAiRequestPreview {
  const promptMaxChars = normalizePromptMaxChars(options.promptMaxChars);
  const horizonProfile = promptHorizonForFacts(facts.horizon);
  const instructions = buildSectionInstructions(sectionKey, facts);
  const buildInput = (computedForecastFacts: Record<string, unknown>) =>
    JSON.stringify({
      task: "Generate one section of a deterministic photo-weather forecast explanation.",
      sectionKey,
      titleZh: sectionTitleZh[sectionKey],
      horizonProfile,
      outputLanguage: "Simplified Chinese",
      computedForecastFacts,
    });
  let compacted = trimCompactFactsToBudget(
    compactForecastFactsForSection(facts, sectionKey),
    Math.max(1200, promptMaxChars - instructions.length - 600),
  );
  let userInput = buildInput(compacted.facts);
  let promptSizeChars = instructions.length + userInput.length;

  if (promptSizeChars > promptMaxChars) {
    compacted = trimCompactFactsToBudget(compacted.facts, Math.max(800, promptMaxChars - instructions.length - 900));
    userInput = buildInput(compacted.facts);
    promptSizeChars = instructions.length + userInput.length;
  }

  if (promptSizeChars > promptMaxChars) {
    throw openAiError({
      errorCategory: "prompt_too_large",
      messageZh: "GPT / OpenAI section prompt is too large; deterministic fallback will be used.",
      promptSizeChars,
      parseStrategy: "failed",
    });
  }

  return {
    url: `${normalizeBaseUrl(options.baseUrl)}/v1/responses`,
    body: {
      model: normalizeOpenAiModel(options.defaultModel),
      instructions,
      input: userInput,
      temperature: normalizeTemperature(options.temperature),
      max_output_tokens: sectionOutputMaxTokens(sectionKey, options.maxTokens),
      store: false,
      stream: false,
    },
    promptSizeChars,
    promptMaxChars,
    sectionKey,
    compactingApplied: compacted.compactingApplied,
    outputMode: "text_with_json_fallback",
  };
}

export function buildOpenAiForecastExplanationRequest(
  input: ForecastExplanationInput,
  options: Pick<
    OpenAiProviderOptions,
    "baseUrl" | "defaultModel" | "temperature" | "maxTokens" | "promptMaxChars"
  > = {},
): OpenAiRequestPreview {
  return buildSectionPromptFromCompactFacts(
    "overview",
    buildCompactForecastExplanationFacts(input.forecastResult),
    options,
  );
}

type OpenAiRequestAttemptSuccess = {
  readonly content: string;
  readonly upstreamDiagnostics: OpenAiSafeUpstreamDiagnostics;
};

type OpenAiRequestSuccess = {
  readonly content: string;
  readonly diagnostics: OpenAiRequestDiagnostics;
};

function buildOpenAiRequestDiagnostics(options: {
  readonly attempts: number;
  readonly finalFailure?: OpenAiProviderError;
  readonly upstreamDiagnostics?: OpenAiSafeUpstreamDiagnostics;
}): OpenAiRequestDiagnostics {
  const finishReason =
    options.upstreamDiagnostics?.finishReason ?? options.finalFailure?.finishReason;
  const contentType =
    options.upstreamDiagnostics?.contentType ?? options.finalFailure?.contentType;
  const contentLength =
    options.upstreamDiagnostics?.contentLength ?? options.finalFailure?.contentLength;
  return {
    attempts: options.attempts,
    compatibilityFallbackUsed: false,
    disabledResponseFormat: false,
    disabledReasoningEffort: false,
    emptyContentFallbackUsed: false,
    upstreamStatusCode:
      options.upstreamDiagnostics?.upstreamStatusCode ?? options.finalFailure?.upstreamStatusCode,
    upstreamErrorCode:
      options.upstreamDiagnostics?.upstreamErrorCode ?? options.finalFailure?.upstreamErrorCode,
    upstreamErrorType:
      options.upstreamDiagnostics?.upstreamErrorType ?? options.finalFailure?.upstreamErrorType,
    upstreamMessageSanitized:
      options.upstreamDiagnostics?.upstreamMessageSanitized ??
      options.finalFailure?.upstreamMessageSanitized,
    upstreamRequestId:
      options.upstreamDiagnostics?.upstreamRequestId ?? options.finalFailure?.upstreamRequestId,
    rawResponseSizeChars:
      options.upstreamDiagnostics?.rawResponseSizeChars ??
      options.finalFailure?.rawResponseSizeChars,
    finishReason,
    choiceIndex: options.upstreamDiagnostics?.choiceIndex ?? options.finalFailure?.choiceIndex,
    messageKeys: options.upstreamDiagnostics?.messageKeys ?? options.finalFailure?.messageKeys,
    contentType,
    contentLength,
    reasoningContentLength:
      options.upstreamDiagnostics?.reasoningContentLength ??
      options.finalFailure?.reasoningContentLength,
    finalFinishReason: finishReason,
    finalContentType: contentType,
    finalContentLength: contentLength,
    finalFailureUpstreamCode: failureCode(options.finalFailure),
  };
}

function failureCode(error: OpenAiProviderError | undefined): string | undefined {
  return (
    error?.upstreamErrorCode ??
    error?.upstreamErrorType ??
    (typeof error?.statusCode === "number" ? `http_${error.statusCode}` : undefined) ??
    error?.errorCategory
  );
}

function augmentOpenAiProviderError(
  error: OpenAiProviderError,
  options: {
    readonly promptSizeChars?: number;
    readonly attempts?: number;
    readonly firstFailure?: OpenAiProviderError;
  },
): OpenAiProviderError {
  return openAiError({
    errorCategory: error.errorCategory,
    messageZh: error.messageZh,
    statusCode: error.statusCode,
    latencyMs: error.latencyMs,
    promptSizeChars: error.promptSizeChars ?? options.promptSizeChars,
    responseSizeChars: error.responseSizeChars,
    parseStrategy: error.parseStrategy,
    attempts: options.attempts ?? error.attempts,
    compatibilityFallbackUsed: false,
    disabledResponseFormat: false,
    disabledReasoningEffort: false,
    emptyContentFallbackUsed: false,
    firstFailureUpstreamCode: failureCode(options.firstFailure ?? error),
    finalFailureUpstreamCode: failureCode(error),
    upstreamStatusCode: error.upstreamStatusCode,
    upstreamErrorCode: error.upstreamErrorCode,
    upstreamErrorType: error.upstreamErrorType,
    upstreamMessageSanitized: error.upstreamMessageSanitized,
    upstreamRequestId: error.upstreamRequestId,
    rawResponseSizeChars: error.rawResponseSizeChars,
    finishReason: error.finishReason,
    choiceIndex: error.choiceIndex,
    messageKeys: error.messageKeys,
    contentType: error.contentType,
    contentLength: error.contentLength,
    reasoningContentLength: error.reasoningContentLength,
    finalFinishReason: error.finalFinishReason,
    finalContentType: error.finalContentType,
    finalContentLength: error.finalContentLength,
    cause: error.cause,
  });
}

type ParsedOpenAiSection = Pick<
  ForecastAiExplanationSectionResult,
  "status" | "textZh" | "bulletPointsZh" | "parseStrategy"
>;

function parseOpenAiForecastExplanationSectionOutput(
  rawOutput: string,
  sectionKey: ForecastAiExplanationSectionKey,
): ParsedOpenAiSection {
  const rawResponseSizeChars = rawOutput.length;
  try {
    const parseStrategy: ForecastAiExplanationParseStrategy =
      stripMarkdownCodeFence(rawOutput.trim()) !== rawOutput.trim() ? "fenced_json" : "strict_json";
    const parsed = parseJsonObjectWithExtraction(rawOutput);
    if (isPlainRecord(parsed)) {
      const textZh =
        readTextValue(parsed.textZh) ??
        readTextValue(parsed.text) ??
        readTextValue(parsed.contentZh) ??
        readTextValue(parsed.content) ??
        readTextValue(parsed.summaryZh) ??
        readTextValue(parsed.summary) ??
        readLegacyExplanationTextForSection(parsed, sectionKey);
      const bulletPointsZh = readStringArrayValue(
        parsed.bulletPointsZh ?? parsed.bulletsZh ?? parsed.bullets ?? parsed.points,
      );
      const textFromBullets = bulletPointsZh.join(" ");
      const text = limitText((textZh ?? textFromBullets).trim(), 1200);
      if (isDisplayableSectionText(text) || bulletPointsZh.length > 0) {
        return {
          status: "success",
          textZh: text,
          bulletPointsZh,
          parseStrategy,
        };
      }
    }
  } catch {
    // Fall through to plain-text handling.
  }

  const text = stripMarkdownCodeFence(rawOutput).trim();
  if (isDisplayableSectionText(text)) {
    return {
      status: "success",
      textZh: limitText(text, 1200),
      bulletPointsZh: splitSectionBulletPoints(text),
      parseStrategy: "plain_text_fallback",
    };
  }

  throw openAiError({
    errorCategory: "provider_parse_error",
    messageZh: "GPT / OpenAI section response could not be parsed.",
    responseSizeChars: rawResponseSizeChars,
    parseStrategy: "failed",
  });
}

function readStringArrayValue(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 6)
      .map((item) => limitText(item, 180));
  }
  if (typeof value === "string") {
    return splitSectionBulletPoints(value);
  }
  return [];
}

function readLegacyExplanationTextForSection(
  value: Record<string, unknown>,
  sectionKey: ForecastAiExplanationSectionKey,
): string | undefined {
  const conclusion = isPlainRecord(value.conclusion) ? value.conclusion : {};
  const bestPlan = isPlainRecord(value.bestPlan) ? value.bestPlan : {};
  const weatherTrend = isPlainRecord(value.weatherTrend) ? value.weatherTrend : {};
  const subjectAdvice = isPlainRecord(value.subjectAdvice) ? value.subjectAdvice : {};
  const riskAndGear = isPlainRecord(value.riskAndGear) ? value.riskAndGear : {};
  const finalAdvice = isPlainRecord(value.finalAdvice) ? value.finalAdvice : {};
  const topLevelConclusion = typeof value.conclusion === "string" ? value.conclusion : undefined;
  const topLevelReasons = readStringArrayValue(value.reasons).join(" ");
  const topLevelSuggestions = readStringArrayValue(value.suggestions).join(" ");
  const topLevelRisks = readStringArrayValue(value.risks).join(" ");
  const riskItems = readStringArrayValue(riskAndGear.keyRisks).join(" ");

  const candidates: Record<ForecastAiExplanationSectionKey, readonly unknown[]> = {
    overview: [
      value.summaryText,
      topLevelConclusion,
      topLevelReasons,
      conclusion.oneSentenceDecisionZh,
      conclusion.summaryZh,
      bestPlan.whyThisWindowZh,
    ],
    timeline: [
      topLevelReasons,
      conclusion.recommendedDayZh,
      bestPlan.bestWindowZh,
      bestPlan.recommendedArrivalZh,
      weatherTrend.trendSummaryZh,
    ],
    subject_advice: [
      topLevelSuggestions,
      subjectAdvice.cloudSeaZh,
      subjectAdvice.sunriseGlowZh,
      subjectAdvice.sunsetGlowZh,
      subjectAdvice.astroMilkyWayZh,
      subjectAdvice.transparencyZh,
    ],
    risk_gear: [
      topLevelRisks,
      riskItems,
      riskAndGear.clothingZh,
      riskAndGear.gearZh,
      riskAndGear.safetyZh,
    ],
    final_decision: [
      value.summaryText,
      topLevelConclusion,
      topLevelSuggestions,
      finalAdvice.goNoGoZh,
      finalAdvice.ifAlreadyNearbyZh,
      finalAdvice.ifDedicatedTripZh,
      finalAdvice.nextCheckZh,
    ],
  };
  const text = candidates[sectionKey]
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return text ? limitText(text, 1200) : undefined;
}

function splitSectionBulletPoints(text: string): readonly string[] {
  return text
    .split(/\r?\n|[;；。]/u)
    .map((line) => line.replace(/^[-*•]\s*/u, "").trim())
    .filter((line) => line.length >= 6)
    .slice(0, 5)
    .map((line) => limitText(line, 180));
}

function isDisplayableSectionText(text: string): boolean {
  const compact = text.replace(/[`"'{}[\]():,.;!?，。！？；：\s_-]+/gu, "").trim();
  if (compact.length < 10) {
    return false;
  }
  const cjkCount = compact.match(/[\u3400-\u9fff]/gu)?.length ?? 0;
  return cjkCount >= 6 || compact.length >= 24;
}

function shouldUseSectionFallback(error: unknown): boolean {
  return !(
    isOpenAiProviderError(error) &&
    (error.errorCategory === "provider_disabled" || error.errorCategory === "config_missing")
  );
}

function deterministicFallbackSection(
  result: ForecastCalculationResult,
  sectionKey: ForecastAiExplanationSectionKey,
  options: {
    readonly errorCategory?: string;
    readonly promptSizeChars?: number;
    readonly promptMaxChars?: number;
    readonly parseStrategy?: ForecastAiExplanationParseStrategy;
    readonly model?: string;
    readonly latencyMs?: number;
  } = {},
): ForecastAiExplanationSectionResult {
  const fallback = createRuleBasedForecastExplanation(result);
  const sectionText: Record<ForecastAiExplanationSectionKey, string> = {
    overview: [
      fallback.conclusion.oneSentenceDecisionZh,
      fallback.conclusion.summaryZh,
      fallback.bestPlan.whyThisWindowZh,
    ].join(" "),
    timeline: [
      fallback.conclusion.recommendedDayZh,
      fallback.bestPlan.bestWindowZh,
      fallback.bestPlan.recommendedArrivalZh,
      fallback.weatherTrend.trendSummaryZh,
    ].join(" "),
    subject_advice: [
      fallback.subjectAdvice.cloudSeaZh,
      fallback.subjectAdvice.sunriseGlowZh,
      fallback.subjectAdvice.sunsetGlowZh,
      fallback.subjectAdvice.astroMilkyWayZh,
      fallback.subjectAdvice.transparencyZh,
    ].join(" "),
    risk_gear: [
      ...fallback.riskAndGear.keyRisks,
      fallback.riskAndGear.clothingZh,
      fallback.riskAndGear.gearZh,
      fallback.riskAndGear.safetyZh,
    ].join(" "),
    final_decision: [
      fallback.finalAdvice.goNoGoZh,
      fallback.finalAdvice.ifAlreadyNearbyZh,
      fallback.finalAdvice.ifDedicatedTripZh,
      fallback.finalAdvice.nextCheckZh,
    ].join(" "),
  };
  const textZh = limitText(sectionText[sectionKey].trim(), 1200);

  return {
    key: sectionKey,
    titleZh: sectionTitleZh[sectionKey],
    status: textZh ? "fallback" : "failed",
    textZh:
      textZh ||
      "本节智能解读暂时不可用，确定性天气判断已保留，请先参考页面上的确定性结果。",
    bulletPointsZh: splitSectionBulletPoints(textZh),
    ...(options.errorCategory ? { errorCategory: options.errorCategory } : {}),
    ...(options.promptSizeChars ? { promptSizeChars: options.promptSizeChars } : {}),
    ...(options.promptMaxChars ? { promptMaxChars: options.promptMaxChars } : {}),
    ...(options.errorCategory === "prompt_too_large" ? { compactingApplied: true } : {}),
    parseStrategy: options.parseStrategy ?? "failed",
    ...(options.model ? { model: options.model } : {}),
    ...(options.latencyMs ? { latencyMs: options.latencyMs } : {}),
  };
}

function sectionHasDisplayableContent(section: ForecastAiExplanationSectionResult): boolean {
  return isDisplayableSectionText(section.textZh) || section.bulletPointsZh.length > 0;
}

const sectionDisplayOrder = new Map<ForecastAiExplanationSectionKey, number>(
  forecastAiExplanationSectionKeys.map((key, index) => [key, index]),
);

function orderSectionsForDisplay(
  sections: readonly ForecastAiExplanationSectionResult[],
): readonly ForecastAiExplanationSectionResult[] {
  return [...sections].sort(
    (left, right) =>
      (sectionDisplayOrder.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
      (sectionDisplayOrder.get(right.key) ?? Number.MAX_SAFE_INTEGER),
  );
}

function shouldStopSectionGenerationForDeadline(options: {
  readonly startedAt: number;
  readonly timeoutMs: number;
  readonly sections: readonly ForecastAiExplanationSectionResult[];
}): boolean {
  if (!options.sections.some(sectionHasDisplayableContent)) {
    return false;
  }
  const elapsedMs = Date.now() - options.startedAt;
  const remainingMs = options.timeoutMs - elapsedMs;
  const guardMs = Math.min(20_000, Math.max(5_000, Math.floor(options.timeoutMs * 0.15)));
  return remainingMs <= guardMs;
}

function synthesizeSectionedForecastExplanation(
  result: ForecastCalculationResult,
  sectionedExplanation: ForecastAiExplanationSectionedResult,
  options: {
    readonly parseStrategy: ForecastAiExplanationParseStrategy;
    readonly fallbackUsed: boolean;
    readonly rawResponseSizeChars: number;
  },
): ForecastAiExplanation {
  const fallback = createRuleBasedForecastExplanation(result);
  const sectionByKey = new Map(sectionedExplanation.sections.map((section) => [section.key, section]));
  const textFor = (key: ForecastAiExplanationSectionKey, fallbackText: string): string =>
    sectionByKey.get(key)?.textZh || fallbackText;
  const bulletsFor = (key: ForecastAiExplanationSectionKey): readonly string[] =>
    sectionByKey.get(key)?.bulletPointsZh ?? [];
  const overview = textFor("overview", fallback.conclusion.summaryZh);
  const timeline = textFor("timeline", fallback.weatherTrend.trendSummaryZh);
  const subjectAdvice = textFor("subject_advice", fallback.subjectAdvice.transparencyZh);
  const riskGear = textFor("risk_gear", fallback.riskAndGear.safetyZh);
  const finalDecision = textFor("final_decision", fallback.finalAdvice.goNoGoZh);
  const summaryText = [overview, finalDecision].filter(Boolean).join("\n\n");
  const reasons = uniqueStrings([...bulletsFor("overview"), ...bulletsFor("timeline"), timeline]);
  const suggestions = uniqueStrings([
    ...bulletsFor("subject_advice"),
    ...bulletsFor("final_decision"),
    finalDecision,
  ]);
  const risks = uniqueStrings([...bulletsFor("risk_gear"), riskGear]);
  const displaySections = sectionedExplanation.sections
    .filter((section) => section.status === "success" || section.status === "fallback")
    .filter(sectionHasDisplayableContent)
    .map((section) => ({
      title: section.titleZh,
      text: section.textZh || section.bulletPointsZh.join(" "),
    }));

  return {
    ...fallback,
    conclusion: {
      ...fallback.conclusion,
      summaryZh: overview,
      oneSentenceDecisionZh: firstSectionSentence(overview),
    },
    bestPlan: {
      ...fallback.bestPlan,
      whyThisWindowZh: timeline,
      backupPlanZh: finalDecision,
    },
    weatherTrend: {
      ...fallback.weatherTrend,
      trendSummaryZh: timeline,
    },
    subjectAdvice: {
      cloudSeaZh: subjectAdvice,
      sunriseGlowZh: subjectAdvice,
      sunsetGlowZh: subjectAdvice,
      astroMilkyWayZh: subjectAdvice,
      transparencyZh: subjectAdvice,
    },
    riskAndGear: {
      ...fallback.riskAndGear,
      keyRisks: risks.length > 0 ? risks : fallback.riskAndGear.keyRisks,
      safetyZh: riskGear,
    },
    finalAdvice: {
      ...fallback.finalAdvice,
      goNoGoZh: finalDecision,
      nextCheckZh: finalDecision,
    },
    summaryText,
    reasons,
    suggestions,
    risks,
    displayContent: {
      hasContent: displaySections.length > 0 || Boolean(summaryText),
      title: "智能解读",
      summaryText,
      conclusion: firstSectionSentence(overview),
      reasons,
      suggestions,
      risks,
      sections: displaySections,
    },
    displayOnly: true,
    sections: sectionedExplanation.sections,
    sectionedExplanation,
    metadata: {
      source: "openai",
      parseStrategy: options.parseStrategy,
      fallbackUsed: options.fallbackUsed,
      rawResponseSizeChars: options.rawResponseSizeChars,
    },
  };
}

function firstSectionSentence(text: string): string {
  const trimmed = text.trim();
  const sentence = trimmed.split(/[。！？!?]/u)[0]?.trim();
  return limitText(sentence || trimmed, 180);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 8);
}

export class OpenAiProvider implements AIProvider {
  private readonly delegate: MockAIProvider;
  private readonly fetcher: OpenAiFetch;
  private readonly enabled: boolean;
  private readonly realModeEnabled: boolean;
  readonly apiKey?: string;
  readonly authToken?: string;
  readonly internalRelayToken?: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly promptMaxChars: number;
  readonly timeoutMs: number;

  constructor(private readonly options: OpenAiProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim();
    this.authToken = options.authToken?.trim();
    this.internalRelayToken = options.internalRelayToken?.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.defaultModel = normalizeOpenAiModel(options.defaultModel);
    this.temperature = normalizeTemperature(options.temperature);
    this.maxTokens = normalizeMaxTokens(options.maxTokens);
    this.promptMaxChars = normalizePromptMaxChars(options.promptMaxChars);
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

    const text = await this.requestText({
      url: `${this.baseUrl}/v1/responses`,
      promptSizeChars: JSON.stringify(input).length,
      outputMode: "text_with_json_fallback",
      body: {
        model: this.defaultModel,
        instructions:
          "Return concise Simplified Chinese JSON for a deterministic photo-weather analysis. Do not invent facts.",
        input: JSON.stringify(input),
        temperature: this.temperature,
        max_output_tokens: normalizeMaxTokens(800),
        store: false,
        stream: false,
      },
    });
    const parsed = this.validateJsonOutput(
      z.object({
        summary: z.string().trim().min(1),
        opportunities: z.array(z.string()).default([]),
        risks: z.array(z.string()).default([]),
        confidence: z.number().min(0).max(1).default(0.6),
      }),
      text,
    );
    return {
      provider: "openai",
      summary: parsed.summary,
      opportunities: parsed.opportunities ?? [],
      risks: parsed.risks ?? [],
      confidence: parsed.confidence ?? 0.6,
    };
  }

  async generateDecisionCard(input: DecisionCardInput): Promise<DecisionCard> {
    if (this.options.mode === "mock") {
      return this.delegate.generateDecisionCard(input);
    }

    const text = await this.requestText({
      url: `${this.baseUrl}/v1/responses`,
      promptSizeChars: JSON.stringify(input).length,
      outputMode: "text_with_json_fallback",
      body: {
        model: this.defaultModel,
        instructions:
          "Return a compact Simplified Chinese JSON decision card using only supplied deterministic facts.",
        input: JSON.stringify(input),
        temperature: this.temperature,
        max_output_tokens: normalizeMaxTokens(800),
        store: false,
        stream: false,
      },
    });
    return this.validateJsonOutput(
      z.object({
        grade: z.enum(["excellent", "good", "fair", "poor"]),
        score: z.number().min(0).max(100),
        title: z.string().trim().min(1),
        summary: z.string().trim().min(1),
        reasons: z.array(z.string().trim().min(1)).min(1),
      }),
      text,
    );
  }

  async generateForecastExplanation(
    input: ForecastExplanationInput,
  ): Promise<ForecastAiExplanation> {
    return (await this.generateForecastExplanationWithDiagnostics(input)).explanation;
  }

  async generateForecastExplanationWithDiagnostics(
    input: ForecastExplanationInput,
  ): Promise<OpenAiForecastExplanationResult> {
    if (this.options.mode === "mock") {
      const explanation = createRuleBasedForecastExplanation(input.forecastResult);
      return {
        explanation,
        parseStrategy: explanation.metadata?.parseStrategy ?? "strict_json",
        parseSuccess: true,
        fallbackUsed: explanation.metadata?.fallbackUsed ?? true,
        rawResponseSizeChars: 0,
        requestDiagnostics: buildOpenAiRequestDiagnostics({ attempts: 0 }),
      };
    }

    return this.generateSectionedForecastExplanationWithDiagnostics(input);

    let request: OpenAiRequestPreview;
    try {
      request = buildOpenAiForecastExplanationRequest(input, {
        baseUrl: this.baseUrl,
        defaultModel: this.defaultModel,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        promptMaxChars: this.promptMaxChars,
      });
    } catch (error) {
      throw normalizeOpenAiRequestError(error, 0);
    }

    const rawOutput = await this.requestWithDiagnostics(request);
    try {
      const parsed = parseForecastAiExplanationOutput(rawOutput.content, input.forecastResult, {
        finishReason:
          rawOutput.diagnostics.finalFinishReason ?? rawOutput.diagnostics.finishReason,
        source: "openai",
      });
      return {
        ...parsed,
        requestDiagnostics: rawOutput.diagnostics,
      };
    } catch (error: any) {
      if (isDeepSeekProviderError(error)) {
        throw openAiError({
          errorCategory:
            error.errorCategory === "prompt_too_large" ? "prompt_too_large" : "provider_parse_error",
          messageZh:
            error.errorCategory === "prompt_too_large"
              ? "GPT / OpenAI 解读上下文过大，已停止发送请求。"
              : "GPT / OpenAI 返回内容无法解析。",
          responseSizeChars: error.responseSizeChars,
          rawResponseSizeChars:
            rawOutput.diagnostics.rawResponseSizeChars ?? error.rawResponseSizeChars,
          parseStrategy: error.parseStrategy ?? "failed",
          attempts: rawOutput.diagnostics.attempts,
          contentType: rawOutput.diagnostics.finalContentType,
          contentLength: rawOutput.diagnostics.finalContentLength,
          finishReason: rawOutput.diagnostics.finalFinishReason,
          messageKeys: rawOutput.diagnostics.messageKeys,
          cause: error,
        });
      }
      throw error;
    }
  }

  private async generateSectionedForecastExplanationWithDiagnostics(
    input: ForecastExplanationInput,
  ): Promise<OpenAiForecastExplanationResult> {
    this.getAuthToken();

    const facts = buildCompactForecastExplanationFacts(input.forecastResult);
    const sections: ForecastAiExplanationSectionResult[] = [];
    const generationStartedAt = Date.now();
    let attempts = 0;
    let rawResponseSizeChars = 0;
    let promptSizeChars = 0;
    let compatibilityFallbackUsed = false;
    let firstFailure: OpenAiProviderError | undefined;
    let finalFailure: OpenAiProviderError | undefined;
    let finalDiagnostics: OpenAiRequestDiagnostics | undefined;

    for (const sectionKey of forecastAiExplanationGenerationOrder) {
      let request: OpenAiRequestPreview | undefined;
      let requestAttemptCounted = false;
      const startedAt = Date.now();
      try {
        request = buildSectionPromptFromCompactFacts(sectionKey, facts, {
          baseUrl: this.baseUrl,
          defaultModel: this.defaultModel,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
          promptMaxChars: this.promptMaxChars,
        });
        promptSizeChars += request.promptSizeChars;
      } catch (error) {
        const normalized = normalizeOpenAiRequestError(error, 0);
        if (!shouldUseSectionFallback(normalized)) {
          throw normalized;
        }
        firstFailure ??= normalized;
        finalFailure = normalized;
        compatibilityFallbackUsed = true;
        sections.push(
          deterministicFallbackSection(input.forecastResult, sectionKey, {
            errorCategory: normalized.errorCategory,
            promptSizeChars: normalized.promptSizeChars,
            promptMaxChars: this.promptMaxChars,
            parseStrategy: normalized.parseStrategy ?? "failed",
            model: this.defaultModel,
            latencyMs: Date.now() - startedAt,
          }),
        );
        if (
          shouldStopSectionGenerationForDeadline({
            startedAt: generationStartedAt,
            timeoutMs: this.timeoutMs,
            sections,
          })
        ) {
          break;
        }
        continue;
      }

      try {
        const rawOutput = await this.requestWithDiagnostics(request);
        attempts += rawOutput.diagnostics.attempts;
        requestAttemptCounted = true;
        rawResponseSizeChars +=
          rawOutput.diagnostics.rawResponseSizeChars ?? rawOutput.content.length;
        finalDiagnostics = rawOutput.diagnostics;
        const parsed = parseOpenAiForecastExplanationSectionOutput(rawOutput.content, sectionKey);
        sections.push({
          key: sectionKey,
          titleZh: sectionTitleZh[sectionKey],
          status: parsed.status,
          textZh: parsed.textZh,
          bulletPointsZh: parsed.bulletPointsZh,
          promptSizeChars: request.promptSizeChars,
          ...(request.promptMaxChars ? { promptMaxChars: request.promptMaxChars } : {}),
          ...(request.compactingApplied ? { compactingApplied: true } : {}),
          responseSizeChars: rawOutput.content.length,
          parseStrategy: parsed.parseStrategy,
          model: this.defaultModel,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        const normalized = normalizeOpenAiRequestError(
          error,
          Date.now() - startedAt,
          request.promptSizeChars,
        );
        if (!shouldUseSectionFallback(normalized)) {
          throw normalized;
        }
        if (!requestAttemptCounted) {
          attempts += normalized.attempts ?? 1;
        }
        firstFailure ??= normalized;
        finalFailure = normalized;
        compatibilityFallbackUsed = true;
        rawResponseSizeChars += normalized.rawResponseSizeChars ?? normalized.responseSizeChars ?? 0;
        sections.push(
          deterministicFallbackSection(input.forecastResult, sectionKey, {
            errorCategory: normalized.errorCategory,
            promptSizeChars: normalized.promptSizeChars ?? request.promptSizeChars,
            promptMaxChars: request.promptMaxChars,
            parseStrategy: normalized.parseStrategy ?? "failed",
            model: this.defaultModel,
            latencyMs: Date.now() - startedAt,
          }),
        );
      }
      if (
        shouldStopSectionGenerationForDeadline({
          startedAt: generationStartedAt,
          timeoutMs: this.timeoutMs,
          sections,
        })
      ) {
        break;
      }
    }

    const orderedSections = orderSectionsForDisplay(sections);
    const displaySuccess = orderedSections.some(sectionHasDisplayableContent);
    if (!displaySuccess) {
      throw openAiError({
        errorCategory: finalFailure?.errorCategory ?? "provider_parse_error",
        messageZh: "GPT / OpenAI sectioned explanation has no displayable content.",
        attempts,
        promptSizeChars,
        rawResponseSizeChars,
        parseStrategy: "failed",
        cause: finalFailure,
      });
    }

    const parseStrategy: ForecastAiExplanationParseStrategy = orderedSections.some(
      (section) => section.parseStrategy === "plain_text_fallback",
    )
      ? "plain_text_fallback"
      : orderedSections.some((section) => section.status !== "success")
        ? "failed"
        : orderedSections.some((section) => section.parseStrategy === "fenced_json")
          ? "fenced_json"
          : orderedSections.some((section) => section.parseStrategy === "extracted_json")
            ? "extracted_json"
            : "strict_json";
    const parseSuccess =
      parseStrategy === "strict_json" ||
      parseStrategy === "fenced_json" ||
      parseStrategy === "extracted_json";
    const fallbackUsed =
      orderedSections.some((section) => section.status !== "success") ||
      parseStrategy !== "strict_json";
    const responseSizeChars = orderedSections.reduce(
      (total, section) => total + (section.responseSizeChars ?? 0),
      0,
    );
    const sectionedExplanation: ForecastAiExplanationSectionedResult = {
      version: openAiSectionedExplanationVersion,
      providerCode: "openai",
      model: this.defaultModel,
      sections: orderedSections,
      success: true,
      displaySuccess,
      promptMaxChars: this.promptMaxChars,
      promptSizeChars,
      responseSizeChars,
    };
    const explanation = synthesizeSectionedForecastExplanation(
      input.forecastResult,
      sectionedExplanation,
      {
        parseStrategy,
        fallbackUsed,
        rawResponseSizeChars,
      },
    );
    const requestDiagnostics: OpenAiRequestDiagnostics = {
      ...(finalDiagnostics ?? buildOpenAiRequestDiagnostics({ attempts: 0 })),
      attempts,
      compatibilityFallbackUsed,
      disabledResponseFormat: false,
      disabledReasoningEffort: false,
      emptyContentFallbackUsed: false,
      rawResponseSizeChars,
      finalFailureUpstreamCode: failureCode(finalFailure),
      firstFailureUpstreamCode: failureCode(firstFailure),
    };

    return {
      explanation,
      parseStrategy,
      parseSuccess,
      fallbackUsed,
      rawResponseSizeChars,
      requestDiagnostics,
    };
  }

  async testConnection(): Promise<{ readonly message: string }> {
    const text = await this.requestText({
      url: `${this.baseUrl}/v1/responses`,
      promptSizeChars: 36,
      outputMode: "text_with_json_fallback",
      body: {
        model: this.defaultModel,
        instructions: "Return a short Simplified Chinese connection-test success message.",
        input: "请返回“连接测试通过”。",
        temperature: 0,
        max_output_tokens: 120,
        store: false,
        stream: false,
      },
    });
    return {
      message: text.trim() || "GPT / OpenAI 连接测试通过。",
    };
  }

  validateJsonOutput<T>(schema: z.ZodSchema<T>, rawOutput: string): T {
    try {
      return schema.parse(parseJsonObjectWithExtraction(rawOutput));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw openAiError({
          errorCategory: "provider_parse_error",
          messageZh: "GPT / OpenAI 返回格式异常。",
          cause: error,
        });
      }
      if (error instanceof z.ZodError) {
        throw openAiError({
          errorCategory: "provider_parse_error",
          messageZh: "GPT / OpenAI 返回结构不符合要求。",
          cause: error,
        });
      }
      throw error;
    }
  }

  private async requestText(request: OpenAiRequestPreview): Promise<string> {
    return (await this.requestWithDiagnostics(request)).content;
  }

  private async requestWithDiagnostics(request: OpenAiRequestPreview): Promise<OpenAiRequestSuccess> {
    const authToken = this.getAuthToken();
    try {
      const result = await this.requestOnce(request, authToken);
      return {
        content: result.content,
        diagnostics: buildOpenAiRequestDiagnostics({
          attempts: 1,
          upstreamDiagnostics: result.upstreamDiagnostics,
        }),
      };
    } catch (error) {
      const normalized = augmentOpenAiProviderError(
        normalizeOpenAiRequestError(error, 0, request.promptSizeChars),
        {
          promptSizeChars: request.promptSizeChars,
          attempts: 1,
          firstFailure: isOpenAiProviderError(error) ? error : undefined,
        },
      );
      throw normalized;
    }
  }

  private async requestOnce(
    request: OpenAiRequestPreview,
    authToken: string,
  ): Promise<OpenAiRequestAttemptSuccess> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      };
      if (this.internalRelayToken) {
        headers["X-Internal-AI-Token"] = this.internalRelayToken;
      }
      const response = await this.fetcher(request.url, {
        method: "POST",
        headers,
        body: JSON.stringify(request.body),
        signal: controller.signal,
      });
      const text = await response.text();
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        const upstreamDiagnostics = extractOpenAiUpstreamDiagnostics(response, text);
        throw openAiError({
          errorCategory: classifyOpenAiHttpError(response.status),
          messageZh: openAiHttpErrorMessageZh(response.status, upstreamDiagnostics),
          statusCode: response.status,
          latencyMs,
          promptSizeChars: request.promptSizeChars,
          responseSizeChars: text.length,
          upstreamStatusCode: upstreamDiagnostics.upstreamStatusCode,
          upstreamErrorCode: upstreamDiagnostics.upstreamErrorCode,
          upstreamErrorType: upstreamDiagnostics.upstreamErrorType,
          upstreamMessageSanitized: upstreamDiagnostics.upstreamMessageSanitized,
          upstreamRequestId: upstreamDiagnostics.upstreamRequestId,
          rawResponseSizeChars: upstreamDiagnostics.rawResponseSizeChars,
        });
      }

      return parseOpenAiResponsesApiResponse(text, latencyMs);
    } catch (error) {
      throw normalizeOpenAiRequestError(error, Date.now() - startedAt, request.promptSizeChars);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getAuthToken(): string {
    if (!this.realModeEnabled) {
      throw openAiError({
        errorCategory: "provider_disabled",
        messageZh: openAiRealModeDisabledMessage,
      });
    }

    if (!this.enabled) {
      throw openAiError({
        errorCategory: "provider_disabled",
        messageZh: openAiProviderDisabledMessage,
      });
    }

    const token = this.apiKey ?? this.authToken;
    if (!token) {
      throw openAiError({
        errorCategory: "config_missing",
        messageZh: missingOpenAiApiKeyMessage,
      });
    }

    return token;
  }
}

function classifyOpenAiHttpError(status: number): OpenAiInterpretationErrorCategory {
  return status >= 400 ? "provider_http_error" : "unknown";
}

function openAiHttpErrorMessageZh(
  status: number,
  diagnostics: OpenAiSafeUpstreamDiagnostics,
): string {
  if (status === 401 || status === 403) {
    return "GPT / OpenAI API Key 或中转鉴权令牌无效。";
  }
  if (status === 429) {
    return "GPT / OpenAI 上游限流，请稍后重试。";
  }
  if (status >= 500) {
    return "GPT / OpenAI 上游服务暂时不可用。";
  }
  if (status === 400 && diagnostics.upstreamErrorCode === "model_not_found") {
    return "GPT / OpenAI 模型不存在或不可用。";
  }
  return `GPT / OpenAI 服务请求失败，状态码 ${status}。`;
}

function normalizeOpenAiRequestError(
  error: unknown,
  latencyMs: number,
  promptSizeChars?: number,
): OpenAiProviderError {
  if (isOpenAiProviderError(error)) {
    return error;
  }

  if (isDeepSeekProviderError(error)) {
    return openAiError({
      errorCategory:
        error.errorCategory === "prompt_too_large" ? "prompt_too_large" : "provider_parse_error",
      messageZh:
        error.errorCategory === "prompt_too_large"
          ? "GPT / OpenAI 解读上下文过大，已停止发送请求。"
          : "GPT / OpenAI 解读请求构建失败。",
      latencyMs,
      promptSizeChars: error.promptSizeChars ?? promptSizeChars,
      parseStrategy: error.parseStrategy,
      cause: error,
    });
  }

  const candidate =
    error && typeof error === "object"
      ? (error as { readonly name?: unknown; readonly message?: unknown })
      : undefined;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const message = typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  if (name === "AbortError" || message.includes("timed out") || message.includes("timeout")) {
    return openAiError({
      errorCategory: "timeout",
      messageZh: "GPT / OpenAI 服务请求超时。",
      latencyMs,
      promptSizeChars,
      cause: error,
    });
  }

  return openAiError({
    errorCategory: "network_error",
    messageZh: "GPT / OpenAI 网络请求失败。",
    latencyMs,
    promptSizeChars,
    cause: error,
  });
}

function parseOpenAiResponsesApiResponse(
  text: string,
  latencyMs: number,
): OpenAiRequestAttemptSuccess {
  const trimmed = text.trim();
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    if (trimmed.length > 0) {
      return {
        content: trimmed,
        upstreamDiagnostics: {
          rawResponseSizeChars: text.length,
          contentType: "plain_text_response",
          contentLength: trimmed.length,
        },
      };
    }
    throw openAiError({
      errorCategory: "provider_invalid_response",
      messageZh: "GPT / OpenAI 返回格式异常。",
      latencyMs,
      responseSizeChars: text.length,
      cause: error,
    });
  }

  const extracted = extractTextFromOpenAiResponse(value);
  if (extracted.content) {
    return {
      content: extracted.content,
      upstreamDiagnostics: {
        rawResponseSizeChars: text.length,
        finishReason: extracted.finishReason,
        choiceIndex: extracted.choiceIndex,
        messageKeys: extracted.messageKeys,
        contentType: extracted.contentType,
        contentLength: extracted.content.length,
      },
    };
  }

  throw openAiError({
    errorCategory: "provider_parse_error",
    messageZh: "GPT / OpenAI 返回内容为空。",
    latencyMs,
    responseSizeChars: text.length,
    parseStrategy: "failed",
    rawResponseSizeChars: text.length,
    messageKeys: extracted.messageKeys,
    contentType: extracted.contentType,
    contentLength: 0,
    finalContentType: extracted.contentType,
    finalContentLength: 0,
  });
}

type OpenAiExtractedText = {
  readonly content?: string;
  readonly contentType?: string;
  readonly finishReason?: string;
  readonly choiceIndex?: number;
  readonly messageKeys?: readonly string[];
};

function extractTextFromOpenAiResponse(value: unknown): OpenAiExtractedText {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? { content: trimmed, contentType: "json_string" } : {};
  }
  if (Array.isArray(value)) {
    const content = collectOpenAiText(value).join("\n").trim();
    return content ? { content, contentType: "array" } : { contentType: "array" };
  }
  if (!isPlainRecord(value)) {
    return { contentType: typeof value };
  }

  const outputText = readTextValue(value.output_text);
  if (outputText) {
    return {
      content: outputText,
      contentType: "output_text",
      finishReason: readDiagnosticString(value.finish_reason ?? value.status),
      messageKeys: Object.keys(value).sort().slice(0, 24),
    };
  }

  const outputItems = Array.isArray(value.output) ? value.output : [];
  const outputTextParts = collectOpenAiText(outputItems);
  if (outputTextParts.length > 0) {
    return {
      content: outputTextParts.join("\n").trim(),
      contentType: "output.content",
      finishReason: readDiagnosticString(value.finish_reason ?? value.status),
      messageKeys: Object.keys(value).sort().slice(0, 24),
    };
  }

  const messageText = collectOpenAiText([value.message, value.content, value.text]).join("\n").trim();
  if (messageText) {
    return {
      content: messageText,
      contentType: "message.content",
      finishReason: readDiagnosticString(value.finish_reason ?? value.status),
      messageKeys: Object.keys(value).sort().slice(0, 24),
    };
  }

  return {
    contentType: "object",
    finishReason: readDiagnosticString(value.finish_reason ?? value.status),
    messageKeys: Object.keys(value).sort().slice(0, 24),
  };
}

function collectOpenAiText(values: readonly unknown[]): string[] {
  const output: string[] = [];
  for (const value of values) {
    const text = extractOpenAiTextPart(value);
    if (text) {
      output.push(text);
    }
  }
  return output;
}

function extractOpenAiTextPart(value: unknown): string | undefined {
  const direct = readTextValue(value);
  if (direct) {
    return direct;
  }
  if (Array.isArray(value)) {
    const nested = collectOpenAiText(value).join("\n").trim();
    return nested || undefined;
  }
  if (!isPlainRecord(value)) {
    return undefined;
  }

  const type = readDiagnosticString(value.type)?.toLowerCase();
  if (type && !["text", "output_text", "message"].includes(type)) {
    return undefined;
  }

  const text =
    readTextValue(value.text) ??
    readTextValue(value.output_text) ??
    readTextValue(value.content) ??
    readTextValue(value.value);
  if (text) {
    return text;
  }

  if (Array.isArray(value.content)) {
    const nested = collectOpenAiText(value.content).join("\n").trim();
    if (nested) {
      return nested;
    }
  }
  if (Array.isArray(value.output)) {
    const nested = collectOpenAiText(value.output).join("\n").trim();
    if (nested) {
      return nested;
    }
  }
  return undefined;
}

function readTextValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (isPlainRecord(value) && typeof value.value === "string") {
    const trimmed = value.value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function parseJsonObjectWithExtraction(rawOutput: string): unknown {
  const trimmed = rawOutput.trim();
  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    const unfenced = stripMarkdownCodeFence(trimmed);
    if (unfenced !== trimmed) {
      try {
        return JSON.parse(unfenced);
      } catch {
        // Continue to object extraction below.
      }
    }

    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) {
      throw firstError;
    }
    return JSON.parse(extracted);
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

function extractOpenAiUpstreamDiagnostics(
  response: Response,
  text: string,
): OpenAiSafeUpstreamDiagnostics {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const error = isPlainRecord(parsed) && isPlainRecord(parsed.error) ? parsed.error : {};

  return {
    upstreamStatusCode: response.status,
    upstreamErrorCode: readDiagnosticString(error.code),
    upstreamErrorType: readDiagnosticString(error.type),
    upstreamMessageSanitized: sanitizeOpenAiUpstreamMessage(error.message),
    upstreamRequestId:
      response.headers.get("x-request-id") ??
      response.headers.get("openai-request-id") ??
      response.headers.get("x-openai-request-id") ??
      undefined,
    rawResponseSizeChars: text.length,
  };
}

function sanitizeOpenAiUpstreamMessage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[redacted]")
    .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}/g, "[redacted-token]")
    .trim();
  return redacted ? limitText(redacted, 180) : undefined;
}

function readDiagnosticString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? limitText(trimmed, 120) : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function limitText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
