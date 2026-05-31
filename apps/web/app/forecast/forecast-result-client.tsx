"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  classifyTerrainMode,
  formatArrivalDeadlineZh,
  formatShootingWindowZh,
  forecastHorizonLabels,
  forecastTargetLabels,
  simplifyWeatherSummaryZh,
  terrainModeUsesLowlandSemantics,
  terrainModeUsesMountainSemantics,
  type AstroWindow,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastQueryInput,
  type ForecastRiskFlag,
  type ForecastScore,
  type ForecastScoreLevel,
  type GlowBackupPlan,
  type GlowWindow,
} from "@photo-weather/shared";
import { PublicShell } from "../../components/public-shell";
import { MoonPhaseCalendar } from "../../components/moon-phase-calendar";
import { Badge, Button, Card, cn } from "../../components/ui";
import {
  buildForecastResultViewModel,
  getForecastResultPageShellCopy,
  type CloudSeaActionPlanItem,
  type AstroDailyTrendItem,
  type AstroEvidenceViewItem,
  type AstroForecastViewModel,
  type AstroWindowViewItem,
  type CloudSeaDailyTrendItem,
  type CloudSeaForecastViewModel,
  type CloudSeaHeroConclusionView,
  type CloudSeaReasoningItem,
  type CloudSeaWindowItem,
  type ForecastResultCard,
  type ForecastResultCardTone,
  type ForecastResultDailyItem,
  type ForecastResultSection,
  type ForecastResultSectionItem,
  type ForecastResultViewModel,
  type ForecastResultWindow,
  type ForecastResultWindowGroup,
  type GlowDailyTrendItem,
  type GlowEvidenceViewItem,
  type GlowForecastViewModel,
} from "./forecast-result-view-model";
import {
  astroBlockedReasonText,
  clothingEquipmentAdvice,
  compactPrecipitationDisplayText,
  rainRiskText,
  windowLabelText,
} from "./forecast-copy";
import {
  buildGeneralForecastReturnUrl,
  buildGeneralDailySubjectLinks,
  buildSubjectDetailDeepLink,
  createForecastResultContextId,
  writeForecastResultContext,
  type SubjectDetailSubject,
  type SubjectDetailTarget,
} from "./subject-detail-links";
import { cloudSeaTerrainAwareText, type CloudSeaTerrainContext } from "./cloud-sea-terrain-context";
import {
  ActionPlanGrid,
  CurrentWeatherCards,
  DailyDecisionList,
  DecisionErrorTemplate,
  DecisionLoadingTemplate,
  DecisionResultTemplate,
  ForecastMetricCard,
  ForecastMetricGrid,
  ForecastResultHeader,
  ForecastResultSummaryCard,
  ForecastScoreCard,
  JudgmentBasisGrid,
} from "./result-dashboard-components";

type ForecastResultClientProps = {
  readonly query: ForecastQueryInput | null;
  readonly invalidReason?: string;
};

export type LoadStatus = "idle" | "loading" | "ready" | "error";

type AiStatus = "idle" | "loading" | "ready" | "error";

export type ForecastPageMode = "search" | "loading" | "result" | "error";

export type DecisionProgressContext = {
  readonly name: string;
  readonly horizon?: ForecastHorizon;
  readonly target?: ForecastQueryInput["target"];
};

type DecisionTemplateTarget = "general" | "cloud_sea";

type ForecastAiExplanation = {
  readonly conclusion: {
    readonly titleZh: string;
    readonly summaryZh: string;
    readonly recommendedDayZh: string;
    readonly recommendationLevelZh: string;
    readonly whetherWorthDedicatedTripZh: string;
    readonly oneSentenceDecisionZh: string;
  };
  readonly bestPlan: {
    readonly primaryTargetZh: string;
    readonly bestDateZh: string;
    readonly bestWindowZh: string;
    readonly recommendedArrivalZh: string;
    readonly whyThisWindowZh: string;
    readonly backupPlanZh: string;
  };
  readonly weatherTrend: {
    readonly trendSummaryZh: string;
    readonly temperatureSummaryZh: string;
    readonly rainSummaryZh: string;
    readonly windSummaryZh: string;
    readonly transparencySummaryZh: string;
  };
  readonly dayByDay: readonly {
    readonly dateZh: string;
    readonly recommendationZh: string;
    readonly scoreZh: string;
    readonly temperatureZh: string;
    readonly rainZh: string;
    readonly cloudSeaZh: string;
    readonly glowZh: string;
    readonly sunsetGlowZh: string;
    readonly astroZh: string;
    readonly transparencyZh: string;
    readonly bestWindowZh: string;
    readonly actionZh: string;
  }[];
  readonly subjectAdvice: {
    readonly cloudSeaZh: string;
    readonly sunriseGlowZh: string;
    readonly sunsetGlowZh: string;
    readonly astroMilkyWayZh: string;
    readonly transparencyZh: string;
  };
  readonly riskAndGear: {
    readonly keyRisks: readonly string[];
    readonly clothingZh: string;
    readonly gearZh: string;
    readonly safetyZh: string;
  };
  readonly finalAdvice: {
    readonly goNoGoZh: string;
    readonly ifAlreadyNearbyZh: string;
    readonly ifDedicatedTripZh: string;
    readonly nextCheckZh: string;
  };
  readonly metadata?: {
    readonly source: "deepseek" | "deterministic_fallback";
    readonly noteZh?: string;
  };
};

type AiExplainResponse = {
  readonly success?: boolean;
  readonly source?: "deepseek" | "fallback";
  readonly explanation?: ForecastAiExplanation;
  readonly interpretation?: unknown;
  readonly fallbackInterpretation?: unknown;
  readonly sections?: unknown;
  readonly data?: unknown;
  readonly result?: unknown;
  readonly payload?: unknown;
  readonly fallback?: boolean;
  readonly errorCategory?:
    | "disabled"
    | "missing_api_key"
    | "timeout"
    | "network_error"
    | "upstream_401"
    | "upstream_429"
    | "upstream_5xx"
    | "parse_error"
    | "empty_response"
    | "prompt_too_large"
    | "unknown";
  readonly messageZh?: string;
  readonly message?: string;
  readonly retryable?: boolean;
  readonly latencyMs?: number;
  readonly model?: string;
  readonly promptSizeChars?: number;
  readonly parseSuccess?: boolean;
  readonly diagnostics?: {
    readonly model?: string;
    readonly timeoutMs?: number;
    readonly promptSizeChars?: number;
    readonly latencyMs?: number;
    readonly attempts?: number;
    readonly parseSuccess?: boolean;
    readonly fallback?: boolean;
    readonly errorCategory?: AiExplainErrorCategory;
  };
};

type ApiErrorPayload = {
  readonly messageZh?: string;
  readonly message?: string;
  readonly error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
export const deepSeekBackendTimeoutMaxMs = 120_000;
export const aiExplainFrontendTimeoutMs = 130_000;

type AiExplainErrorCategory = NonNullable<AiExplainResponse["errorCategory"]>;

type ForecastCalculationResultWithAi = ForecastCalculationResult & {
  readonly aiExplanation?: ForecastAiExplanation | null;
  readonly resultId?: string;
  readonly reportId?: string;
};

type NormalizedAiExplainOutcome = {
  readonly status: AiStatus;
  readonly explanation: ForecastAiExplanation | null;
  readonly errorMessage: string;
  readonly retryable: boolean;
  readonly success: boolean;
  readonly cacheable: boolean;
  readonly errorCategory: AiExplainErrorCategory | "none";
  readonly backendErrorCategory: AiExplainErrorCategory | "none";
  readonly parseSuccess?: boolean;
  readonly latencyMs?: number;
  readonly model?: string;
  readonly promptSizeChars?: number;
};

type AiExplanationCacheRecord = {
  readonly version: 1;
  readonly createdAt: number;
  readonly explanation: ForecastAiExplanation;
};

const aiExplanationCachePrefix = "photo_weather_forecast_ai_explanation:v1:";
const aiExplanationCacheTtlMs = 1000 * 60 * 60;
const aiExplanationMemoryCache = new Map<string, AiExplanationCacheRecord>();

const scoreLevelLabels: Record<ForecastScoreLevel, string> = {
  poor: "较差",
  fair: "一般",
  good: "较好",
  excellent: "优秀",
};

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as ApiErrorPayload;
    return payload.messageZh || payload.message || payload.error || fallback;
  } catch {
    return fallback;
  }
}

async function readApiJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

export function shouldStartAiExplanationRequest(status: AiStatus, inFlight: boolean): boolean {
  return status !== "loading" && !inFlight;
}

export function createAiExplanationCacheKey({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}): string {
  const resultWithIds = result as ForecastCalculationResultWithAi;
  const stableResultId =
    readStringField(resultWithIds, "reportId") ??
    readStringField(resultWithIds, "resultId") ??
    createForecastResultContextId(query, result);
  return `${aiExplanationCachePrefix}${stableResultId}`;
}

export function readCachedAiExplanation(cacheKey: string): ForecastAiExplanation | null {
  const memoryRecord = aiExplanationMemoryCache.get(cacheKey);
  if (isFreshAiExplanationCacheRecord(memoryRecord)) {
    return memoryRecord.explanation;
  }
  if (memoryRecord) {
    aiExplanationMemoryCache.delete(cacheKey);
  }

  const storage = browserSessionStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(cacheKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AiExplanationCacheRecord>;
    if (!isFreshAiExplanationCacheRecord(parsed)) {
      storage.removeItem(cacheKey);
      return null;
    }
    aiExplanationMemoryCache.set(cacheKey, parsed);
    return parsed.explanation;
  } catch {
    return null;
  }
}

export function cacheAiExplanation(cacheKey: string, explanation: ForecastAiExplanation): void {
  const record: AiExplanationCacheRecord = {
    version: 1,
    createdAt: Date.now(),
    explanation,
  };
  aiExplanationMemoryCache.set(cacheKey, record);

  const storage = browserSessionStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(cacheKey, JSON.stringify(record));
  } catch {
    // Cache is an optimization; keep the rendered result even when storage is unavailable.
  }
}

function isFreshAiExplanationCacheRecord(
  record: Partial<AiExplanationCacheRecord> | undefined,
): record is AiExplanationCacheRecord {
  return (
    record?.version === 1 &&
    typeof record.createdAt === "number" &&
    Date.now() - record.createdAt <= aiExplanationCacheTtlMs &&
    isDisplayableAiExplanation(record.explanation)
  );
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }

  return window.sessionStorage;
}

export function normalizeAiExplainResponse(
  payload: unknown,
  _deterministicFallback: ForecastAiExplanation | null = null,
): NormalizedAiExplainOutcome {
  const response = isRecord(payload) ? (payload as AiExplainResponse) : {};
  const diagnostics = isRecord(response.diagnostics) ? response.diagnostics : undefined;
  const directExplanationCandidate = extractAiExplanationFromResponse(response);
  const directExplanation = isDisplayableAiExplanation(directExplanationCandidate)
    ? directExplanationCandidate
    : null;
  const invalidSuccessfulResponse = response.success === true && !directExplanation;
  const backendErrorCategory =
    normalizeAiErrorCategory(response.errorCategory) ??
    normalizeAiErrorCategory(diagnostics?.errorCategory) ??
    (invalidSuccessfulResponse ? "parse_error" : undefined) ??
    "none";
  const parseSuccess =
    typeof response.parseSuccess === "boolean"
      ? response.parseSuccess
      : typeof diagnostics?.parseSuccess === "boolean"
        ? diagnostics.parseSuccess
        : invalidSuccessfulResponse
          ? false
          : undefined;
  const retryable =
    typeof response.retryable === "boolean"
      ? response.retryable
      : backendErrorCategory !== "none" && isRetryableAiExplainCategory(backendErrorCategory);
  const message =
    readStringField(response, "messageZh") ??
    readStringField(response, "message") ??
    publicAiExplanationMessage(backendErrorCategory);

  if (response.success === true && directExplanation) {
    return {
      status: "ready",
      explanation: directExplanation,
      errorMessage: "",
      retryable: false,
      success: true,
      cacheable: true,
      errorCategory: backendErrorCategory,
      backendErrorCategory,
      parseSuccess,
      latencyMs: numericField(response, "latencyMs") ?? diagnostics?.latencyMs,
      model: readStringField(response, "model") ?? diagnostics?.model,
      promptSizeChars: numericField(response, "promptSizeChars") ?? diagnostics?.promptSizeChars,
    };
  }

  const category = backendErrorCategory === "none" ? "unknown" : backendErrorCategory;
  return {
    status: "error",
    explanation: null,
    errorMessage: normalizeAiExplanationErrorMessage(message),
    retryable: retryable || isRetryableAiExplainCategory(category),
    success: false,
    cacheable: false,
    errorCategory: category,
    backendErrorCategory: category,
    parseSuccess,
    latencyMs: numericField(response, "latencyMs") ?? diagnostics?.latencyMs,
    model: readStringField(response, "model") ?? diagnostics?.model,
    promptSizeChars: numericField(response, "promptSizeChars") ?? diagnostics?.promptSizeChars,
  };
}

function normalizeAiExplainThrownError(
  error: unknown,
  latencyMs: number,
): NormalizedAiExplainOutcome {
  const errorCategory: AiExplainErrorCategory = isAbortError(error) ? "timeout" : "network_error";
  const message = publicAiExplanationMessage(errorCategory);

  return {
    status: "error",
    explanation: null,
    errorMessage: normalizeAiExplanationErrorMessage(message),
    retryable: true,
    success: false,
    cacheable: false,
    errorCategory,
    backendErrorCategory: errorCategory,
    parseSuccess: false,
    latencyMs,
  };
}

function extractAiExplanationFromResponse(
  response: AiExplainResponse,
): ForecastAiExplanation | null {
  const candidates = [
    response.explanation,
    response.interpretation,
    response.sections,
    nestedField(response.data, "explanation"),
    nestedField(response.data, "interpretation"),
    nestedField(response.data, "sections"),
    nestedField(response.result, "explanation"),
    nestedField(response.result, "interpretation"),
    nestedField(response.result, "sections"),
    nestedField(response.payload, "explanation"),
    nestedField(response.payload, "interpretation"),
    nestedField(response.payload, "sections"),
  ];

  for (const candidate of candidates) {
    const explanation = normalizeForecastAiExplanationCandidate(candidate);
    if (explanation) {
      return explanation;
    }
  }

  return null;
}

function normalizeForecastAiExplanationCandidate(value: unknown): ForecastAiExplanation | null {
  if (isForecastAiExplanationLike(value)) {
    return withAiExplanationMetadata(value, value.metadata?.source ?? "deepseek");
  }

  if (!isRecord(value)) {
    if (typeof value === "string" && value.trim()) {
      return explanationFromSections([{ title: "智能解读", text: value.trim() }]);
    }
    return null;
  }

  const nested =
    normalizeForecastAiExplanationCandidate(value.explanation) ??
    normalizeForecastAiExplanationCandidate(value.interpretation);
  if (nested) {
    return nested;
  }

  const completed = completeForecastAiExplanationFromPartial(value);
  if (completed) {
    return completed;
  }

  return explanationFromSections(normalizeAiSections(value.sections ?? value));
}

function isForecastAiExplanationLike(value: unknown): value is ForecastAiExplanation {
  if (!isRecord(value)) {
    return false;
  }
  return (
    hasStringField(value.conclusion, "oneSentenceDecisionZh") &&
    hasStringField(value.conclusion, "summaryZh") &&
    hasStringField(value.bestPlan, "primaryTargetZh") &&
    hasStringField(value.weatherTrend, "trendSummaryZh") &&
    Array.isArray(value.dayByDay) &&
    hasStringField(value.subjectAdvice, "cloudSeaZh") &&
    hasStringField(value.riskAndGear, "clothingZh") &&
    hasStringField(value.finalAdvice, "goNoGoZh")
  );
}

function isDisplayableAiExplanation(
  explanation: ForecastAiExplanation | null | undefined,
): explanation is ForecastAiExplanation {
  return Boolean(
    explanation &&
      isForecastAiExplanationLike(explanation) &&
      explanation.metadata?.source !== "deterministic_fallback",
  );
}

function completeForecastAiExplanationFromPartial(
  value: Record<string, unknown>,
): ForecastAiExplanation | null {
  const conclusion = recordField(value, "conclusion");
  const bestPlan = recordField(value, "bestPlan");
  const weatherTrend = recordField(value, "weatherTrend");
  const subjectAdvice = recordField(value, "subjectAdvice");
  const riskAndGear = recordField(value, "riskAndGear");
  const finalAdvice = recordField(value, "finalAdvice");

  if (!conclusion && !bestPlan && !weatherTrend && !subjectAdvice && !riskAndGear && !finalAdvice) {
    return null;
  }

  const summaryText =
    readStringField(conclusion, "summaryZh") ??
    readStringField(conclusion, "contentZh") ??
    readStringField(conclusion, "content") ??
    readStringField(conclusion, "text") ??
    readStringField(value, "summaryZh") ??
    readStringField(value, "summary") ??
    "已生成基于当前确定性结果的拍摄解读。";
  const decisionText =
    readStringField(conclusion, "oneSentenceDecisionZh") ??
    readStringField(conclusion, "contentZh") ??
    readStringField(conclusion, "content") ??
    readStringField(conclusion, "text") ??
    readStringField(value, "oneSentenceDecisionZh") ??
    readStringField(value, "decisionZh") ??
    summaryText;
  const dayByDay = Array.isArray(value.dayByDay)
    ? value.dayByDay
        .map(normalizeAiDay)
        .filter((day): day is ForecastAiExplanation["dayByDay"][number] => Boolean(day))
    : [];

  return withAiExplanationMetadata(
    {
      conclusion: {
        titleZh: readStringField(conclusion, "titleZh") ?? "智能解读",
        summaryZh: summaryText,
        recommendedDayZh: readStringField(conclusion, "recommendedDayZh") ?? "详见确定性逐日判断。",
        recommendationLevelZh:
          readStringField(conclusion, "recommendationLevelZh") ?? "以确定性评分为准",
        whetherWorthDedicatedTripZh:
          readStringField(conclusion, "whetherWorthDedicatedTripZh") ?? "需结合现场复核。",
        oneSentenceDecisionZh: decisionText,
      },
      bestPlan: {
        primaryTargetZh: readStringField(bestPlan, "primaryTargetZh") ?? "优先参考确定性推荐题材",
        bestDateZh: readStringField(bestPlan, "bestDateZh") ?? "详见逐日建议",
        bestWindowZh: readStringField(bestPlan, "bestWindowZh") ?? "详见时间窗口",
        recommendedArrivalZh:
          readStringField(bestPlan, "recommendedArrivalZh") ?? "建议按主窗口提前到位。",
        whyThisWindowZh:
          readStringField(bestPlan, "whyThisWindowZh") ?? "基于当前确定性天气、天文和地形结果。",
        backupPlanZh: readStringField(bestPlan, "backupPlanZh") ?? "保留附近短时观察和备选题材。",
      },
      weatherTrend: {
        trendSummaryZh: readStringField(weatherTrend, "trendSummaryZh") ?? summaryText,
        temperatureSummaryZh:
          readStringField(weatherTrend, "temperatureSummaryZh") ?? "温度以确定性天气卡片为准。",
        rainSummaryZh:
          readStringField(weatherTrend, "rainSummaryZh") ?? "降水以确定性天气卡片为准。",
        windSummaryZh:
          readStringField(weatherTrend, "windSummaryZh") ?? "风力以确定性天气卡片为准。",
        transparencySummaryZh:
          readStringField(weatherTrend, "transparencySummaryZh") ?? "通透度以确定性评分为准。",
      },
      dayByDay:
        dayByDay.length > 0
          ? dayByDay
          : [
              {
                dateZh: "当前结果",
                recommendationZh: decisionText,
                scoreZh: "详见确定性评分",
                temperatureZh: "详见天气卡片",
                rainZh: "详见天气卡片",
                cloudSeaZh: "详见题材判断",
                glowZh: "详见题材判断",
                sunsetGlowZh: "详见题材判断",
                astroZh: "详见题材判断",
                transparencyZh: "详见通透度评分",
                bestWindowZh: "详见时间窗口",
                actionZh: "按确定性结果复核现场条件。",
              },
            ],
      subjectAdvice: {
        cloudSeaZh: readStringField(subjectAdvice, "cloudSeaZh") ?? "云海判断以确定性结果为准。",
        sunriseGlowZh:
          readStringField(subjectAdvice, "sunriseGlowZh") ?? "朝霞判断以确定性结果为准。",
        sunsetGlowZh:
          readStringField(subjectAdvice, "sunsetGlowZh") ?? "晚霞判断以确定性结果为准。",
        astroMilkyWayZh:
          readStringField(subjectAdvice, "astroMilkyWayZh") ?? "星空银河判断以确定性结果为准。",
        transparencyZh:
          readStringField(subjectAdvice, "transparencyZh") ?? "通透度判断以确定性结果为准。",
      },
      riskAndGear: {
        keyRisks:
          stringArrayField(riskAndGear, "keyRisks").length > 0
            ? stringArrayField(riskAndGear, "keyRisks")
            : ["现场仍需复核短临天气、道路和安全条件。"],
        clothingZh: readStringField(riskAndGear, "clothingZh") ?? "按确定性穿衣建议准备。",
        gearZh: readStringField(riskAndGear, "gearZh") ?? "按确定性装备建议准备。",
        safetyZh: readStringField(riskAndGear, "safetyZh") ?? "保留撤离时间，避免冒险等待。",
      },
      finalAdvice: {
        goNoGoZh: readStringField(finalAdvice, "goNoGoZh") ?? decisionText,
        ifAlreadyNearbyZh:
          readStringField(finalAdvice, "ifAlreadyNearbyZh") ?? "若已在附近，可按窗口短时观察。",
        ifDedicatedTripZh:
          readStringField(finalAdvice, "ifDedicatedTripZh") ?? "专程出发前需等待临近预报复核。",
        nextCheckZh:
          readStringField(finalAdvice, "nextCheckZh") ??
          "下次重点复核短临降水、低云、能见度和阵风。",
      },
      metadata: normalizeAiMetadata(value.metadata),
    },
    normalizeAiMetadata(value.metadata)?.source ?? "deepseek",
  );
}

function normalizeAiDay(value: unknown): ForecastAiExplanation["dayByDay"][number] | null {
  if (!isRecord(value)) {
    return null;
  }
  const recommendation =
    readStringField(value, "recommendationZh") ??
    readStringField(value, "summaryZh") ??
    readStringField(value, "text");
  if (!recommendation) {
    return null;
  }

  return {
    dateZh: readStringField(value, "dateZh") ?? readStringField(value, "date") ?? "当前日期",
    recommendationZh: recommendation,
    scoreZh: readStringField(value, "scoreZh") ?? "详见确定性评分",
    temperatureZh: readStringField(value, "temperatureZh") ?? "详见天气卡片",
    rainZh: readStringField(value, "rainZh") ?? "详见天气卡片",
    cloudSeaZh: readStringField(value, "cloudSeaZh") ?? "详见云海判断",
    glowZh: readStringField(value, "glowZh") ?? "详见朝霞判断",
    sunsetGlowZh: readStringField(value, "sunsetGlowZh") ?? "详见晚霞判断",
    astroZh: readStringField(value, "astroZh") ?? "详见星空银河判断",
    transparencyZh: readStringField(value, "transparencyZh") ?? "详见通透度评分",
    bestWindowZh: readStringField(value, "bestWindowZh") ?? "详见时间窗口",
    actionZh: readStringField(value, "actionZh") ?? "按确定性结果复核现场条件。",
  };
}

function explanationFromSections(
  sections: readonly { readonly title: string; readonly text: string }[],
): ForecastAiExplanation | null {
  const usableSections = sections.filter((section) => section.text.trim().length > 0);
  if (usableSections.length === 0) {
    return null;
  }

  const firstSection = usableSections[0];
  if (!firstSection) {
    return null;
  }

  const textFor = (keywords: readonly string[], fallbackIndex: number) =>
    usableSections.find((section) => keywords.some((keyword) => section.title.includes(keyword)))
      ?.text ??
    usableSections[fallbackIndex]?.text ??
    firstSection.text;
  const conclusion = textFor(["结论", "决策", "summary", "decision"], 0);
  const plan = textFor(["计划", "窗口", "plan", "window"], 1);
  const trend = textFor(["天气", "趋势", "trend", "weather"], 2);
  const risk = textFor(["风险", "装备", "risk", "gear"], 3);
  const finalAdvice = textFor(["建议", "行动", "advice", "action"], 4);

  return {
    conclusion: {
      titleZh: firstSection.title || "智能解读",
      summaryZh: conclusion,
      recommendedDayZh: plan,
      recommendationLevelZh: "以确定性评分为准",
      whetherWorthDedicatedTripZh: finalAdvice,
      oneSentenceDecisionZh: conclusion,
    },
    bestPlan: {
      primaryTargetZh: "优先参考确定性推荐题材",
      bestDateZh: plan,
      bestWindowZh: plan,
      recommendedArrivalZh: "按主窗口提前到位。",
      whyThisWindowZh: trend,
      backupPlanZh: "保留附近短时观察和备选题材。",
    },
    weatherTrend: {
      trendSummaryZh: trend,
      temperatureSummaryZh: trend,
      rainSummaryZh: trend,
      windSummaryZh: trend,
      transparencySummaryZh: trend,
    },
    dayByDay: [
      {
        dateZh: "当前结果",
        recommendationZh: conclusion,
        scoreZh: "详见确定性评分",
        temperatureZh: "详见天气卡片",
        rainZh: "详见天气卡片",
        cloudSeaZh: "详见题材判断",
        glowZh: "详见题材判断",
        sunsetGlowZh: "详见题材判断",
        astroZh: "详见题材判断",
        transparencyZh: "详见通透度评分",
        bestWindowZh: plan,
        actionZh: finalAdvice,
      },
    ],
    subjectAdvice: {
      cloudSeaZh: textFor(["云海", "cloud"], 0),
      sunriseGlowZh: textFor(["朝霞", "sunrise"], 0),
      sunsetGlowZh: textFor(["晚霞", "sunset"], 0),
      astroMilkyWayZh: textFor(["星空", "银河", "astro", "milky"], 0),
      transparencyZh: textFor(["通透", "transparency"], 0),
    },
    riskAndGear: {
      keyRisks: [risk],
      clothingZh: risk,
      gearZh: risk,
      safetyZh: risk,
    },
    finalAdvice: {
      goNoGoZh: finalAdvice,
      ifAlreadyNearbyZh: finalAdvice,
      ifDedicatedTripZh: finalAdvice,
      nextCheckZh: "下次重点复核短临降水、低云、能见度和阵风。",
    },
    metadata: {
      source: "deepseek",
      noteZh: "已兼容后端 sections 响应格式。",
    },
  };
}

function normalizeAiSections(
  value: unknown,
): readonly { readonly title: string; readonly text: string }[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => normalizeAiSection(item, `解读 ${index + 1}`));
  }

  if (!isRecord(value)) {
    return typeof value === "string" ? [{ title: "智能解读", text: value }] : [];
  }

  return Object.entries(value).flatMap(([key, item]) => normalizeAiSection(item, key));
}

function normalizeAiSection(
  value: unknown,
  fallbackTitle: string,
): readonly { readonly title: string; readonly text: string }[] {
  if (typeof value === "string") {
    return [{ title: fallbackTitle, text: value }];
  }
  if (Array.isArray(value)) {
    const text = value.flatMap((item) => (typeof item === "string" ? [item] : [])).join("；");
    return text ? [{ title: fallbackTitle, text }] : [];
  }
  if (!isRecord(value)) {
    return [];
  }

  const nested = value.items ?? value.sections ?? value.list;
  const nestedText = Array.isArray(nested)
    ? nested.flatMap((item) => (typeof item === "string" ? [item] : [])).join("；")
    : "";
  const text =
    readStringField(value, "contentZh") ??
    readStringField(value, "content") ??
    readStringField(value, "summaryZh") ??
    readStringField(value, "summary") ??
    readStringField(value, "body") ??
    readStringField(value, "text") ??
    readStringField(value, "value") ??
    nestedText;
  if (!text) {
    return [];
  }

  return [
    {
      title:
        readStringField(value, "titleZh") ??
        readStringField(value, "title") ??
        readStringField(value, "key") ??
        fallbackTitle,
      text,
    },
  ];
}

function withAiExplanationMetadata(
  explanation: ForecastAiExplanation,
  source: NonNullable<ForecastAiExplanation["metadata"]>["source"],
): ForecastAiExplanation {
  return {
    ...explanation,
    metadata: explanation.metadata ?? {
      source,
    },
  };
}

function normalizeAiMetadata(value: unknown): ForecastAiExplanation["metadata"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const source = value.source === "deterministic_fallback" ? "deterministic_fallback" : "deepseek";
  const noteZh = readStringField(value, "noteZh");
  return noteZh ? { source, noteZh } : { source };
}

function applyAiExplainOutcome(
  outcome: NormalizedAiExplainOutcome,
  setters: {
    readonly setAiExplanation: (value: ForecastAiExplanation | null) => void;
    readonly setAiErrorMessage: (value: string) => void;
    readonly setAiRetryable: (value: boolean) => void;
    readonly setAiStatus: (value: AiStatus) => void;
  },
): void {
  setters.setAiExplanation(outcome.explanation);
  setters.setAiErrorMessage(outcome.errorMessage);
  setters.setAiRetryable(outcome.retryable);
  setters.setAiStatus(outcome.status);
}

function logAiExplanationClientEvent(
  event: NormalizedAiExplainOutcome & {
    readonly cacheHit?: boolean;
    readonly frontendTimeoutMs?: number;
  },
): void {
  const payload = {
    route: "/forecast/ai-explain",
    status: event.status,
    success: event.success,
    cacheHit: Boolean(event.cacheHit),
    errorCategory: event.errorCategory,
    backendErrorCategory: event.backendErrorCategory,
    parseSuccess: event.parseSuccess,
    retryable: event.retryable,
    latencyMs: event.latencyMs,
    model: event.model,
    promptSizeChars: event.promptSizeChars,
    frontendTimeoutMs: event.frontendTimeoutMs ?? aiExplainFrontendTimeoutMs,
  };

  if (event.status === "error" || event.errorCategory !== "none") {
    console.warn("forecast_ai_explain_client", payload);
    return;
  }

  console.info("forecast_ai_explain_client", payload);
}

function publicAiExplanationMessage(category: AiExplainErrorCategory | "none"): string {
  void category;
  return "智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。";
}

function isRetryableAiExplainCategory(category: AiExplainErrorCategory | "none"): boolean {
  return (
    category === "timeout" ||
    category === "network_error" ||
    category === "upstream_429" ||
    category === "upstream_5xx" ||
    category === "parse_error" ||
    category === "empty_response" ||
    category === "unknown"
  );
}

function normalizeAiErrorCategory(value: unknown): AiExplainErrorCategory | undefined {
  return typeof value === "string" && aiExplainErrorCategories.has(value as AiExplainErrorCategory)
    ? (value as AiExplainErrorCategory)
    : undefined;
}

const aiExplainErrorCategories = new Set<AiExplainErrorCategory>([
  "disabled",
  "missing_api_key",
  "timeout",
  "network_error",
  "upstream_401",
  "upstream_429",
  "upstream_5xx",
  "parse_error",
  "empty_response",
  "prompt_too_large",
  "unknown",
]);

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(value: unknown, key: string): Record<string, unknown> | undefined {
  const field = isRecord(value) ? value[key] : undefined;
  return isRecord(field) ? field : undefined;
}

function nestedField(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field.trim() : undefined;
}

function hasStringField(value: unknown, key: string): boolean {
  return Boolean(readStringField(value, key));
}

function stringArrayField(value: unknown, key: string): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }
  const field = value[key];
  if (!Array.isArray(field)) {
    return [];
  }
  return field.flatMap((item) =>
    typeof item === "string" && item.trim().length > 0 ? [item.trim()] : [],
  );
}

function numericField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

export function resolveForecastPageMode({
  query,
  status,
  hasResult,
}: {
  readonly query: ForecastQueryInput | null;
  readonly status: LoadStatus;
  readonly hasResult: boolean;
}): ForecastPageMode {
  if (!query) {
    return "search";
  }
  if (status === "loading") {
    return "loading";
  }
  if (status === "error") {
    return "error";
  }
  if (hasResult || status === "ready") {
    return "result";
  }
  return "search";
}

export function ForecastResultClient({ query, invalidReason }: ForecastResultClientProps) {
  const [status, setStatus] = useState<LoadStatus>(query ? "loading" : "idle");
  const [result, setResult] = useState<ForecastCalculationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiExplanation, setAiExplanation] = useState<ForecastAiExplanation | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState("");
  const [aiRetryable, setAiRetryable] = useState(false);
  const aiRequestInFlightRef = useRef(false);
  const aiAbortControllerRef = useRef<AbortController | null>(null);

  const queryKey = useMemo(() => (query ? JSON.stringify(query) : ""), [query]);
  const activeTarget = query?.target ?? result?.target ?? "general";
  const shellCopy = getForecastResultPageShellCopy(activeTarget);
  const pageMode = resolveForecastPageMode({
    query,
    status,
    hasResult: result !== null,
  });
  const isCloudSeaFlow = activeTarget === "cloud_sea";
  const usesSpecializedResultHeader =
    result !== null &&
    (activeTarget === "general" ||
      activeTarget === "cloud_sea" ||
      activeTarget === "glow" ||
      activeTarget === "astro");
  const changeLocationPath = isCloudSeaFlow ? "/cloud-sea" : "/#analysis";

  useEffect(() => {
    if (!query) {
      return;
    }

    const activeQuery = query;
    const controller = new AbortController();
    aiAbortControllerRef.current?.abort();
    aiAbortControllerRef.current = null;
    aiRequestInFlightRef.current = false;
    setStatus("loading");
    setResult(null);
    setErrorMessage("");
    setAiStatus("idle");
    setAiExplanation(null);
    setAiErrorMessage("");
    setAiRetryable(false);

    async function calculateForecast() {
      try {
        const response = await fetch(`${apiBaseUrl}/forecast/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(activeQuery),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(response, "拍摄天气分析暂时不可用，请稍后重试。"),
          );
        }

        const data = (await response.json()) as ForecastCalculationResult;
        writeForecastResultContext({ query: activeQuery, result: data });
        setResult(data);
        const cachedAiExplanation = readCachedAiExplanation(
          createAiExplanationCacheKey({ query: activeQuery, result: data }),
        );
        if (cachedAiExplanation) {
          setAiExplanation(cachedAiExplanation);
          setAiStatus("ready");
          setAiErrorMessage("");
          setAiRetryable(false);
        }
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setErrorMessage((error as Error).message || "拍摄天气分析暂时不可用，请稍后重试。");
        setStatus("error");
      }
    }

    void calculateForecast();

    return () => {
      controller.abort();
      aiAbortControllerRef.current?.abort();
    };
  }, [query, queryKey]);

  async function generateAiExplanation() {
    if (
      !query ||
      !result ||
      !shouldStartAiExplanationRequest(aiStatus, aiRequestInFlightRef.current)
    ) {
      return;
    }

    const cacheKey = createAiExplanationCacheKey({ query, result });
    const cachedAiExplanation = readCachedAiExplanation(cacheKey);
    if (cachedAiExplanation) {
      const cacheOutcome: NormalizedAiExplainOutcome = {
        status: "ready",
        explanation: cachedAiExplanation,
        errorMessage: "",
        retryable: false,
        success: true,
        cacheable: false,
        errorCategory: "none",
        backendErrorCategory: "none",
      };
      applyAiExplainOutcome(cacheOutcome, {
        setAiExplanation,
        setAiErrorMessage,
        setAiRetryable,
        setAiStatus,
      });
      logAiExplanationClientEvent({ ...cacheOutcome, cacheHit: true });
      return;
    }

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), aiExplainFrontendTimeoutMs);
    aiAbortControllerRef.current = controller;
    aiRequestInFlightRef.current = true;
    setAiExplanation(null);
    setAiStatus("loading");
    setAiErrorMessage("");
    setAiRetryable(false);
    try {
      const response = await fetch(`${apiBaseUrl}/forecast/ai-explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(query),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorPayload = await readApiJsonPayload(response);
        const outcome = normalizeAiExplainResponse({
          success: false,
          ...(isRecord(errorPayload)
            ? errorPayload
            : {
                messageZh: "智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。",
              }),
        });
        applyAiExplainOutcome(outcome, {
          setAiExplanation,
          setAiErrorMessage,
          setAiRetryable,
          setAiStatus,
        });
        logAiExplanationClientEvent(outcome);
        return;
      }

      const data = await readApiJsonPayload(response);
      const outcome = normalizeAiExplainResponse(data);
      if (outcome.cacheable && outcome.explanation) {
        cacheAiExplanation(cacheKey, outcome.explanation);
      }
      applyAiExplainOutcome(outcome, {
        setAiExplanation,
        setAiErrorMessage,
        setAiRetryable,
        setAiStatus,
      });
      logAiExplanationClientEvent(outcome);
    } catch (error) {
      const outcome = normalizeAiExplainThrownError(error, Date.now() - startedAt);
      applyAiExplainOutcome(outcome, {
        setAiExplanation,
        setAiErrorMessage,
        setAiRetryable,
        setAiStatus,
      });
      logAiExplanationClientEvent(outcome);
    } finally {
      clearTimeout(timeout);
      if (aiAbortControllerRef.current === controller) {
        aiAbortControllerRef.current = null;
      }
      aiRequestInFlightRef.current = false;
    }
  }

  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      {!usesSpecializedResultHeader ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="当前位置" className="flex items-center gap-2 text-sm">
              <a
                href="/"
                className="font-medium text-muted-foreground transition hover:text-primary"
              >
                首页
              </a>
              <span className="text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">{shellCopy.pageTitle}</span>
            </nav>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.assign(changeLocationPath);
              }}
            >
              重新选择地点
            </Button>
          </div>

          <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 min-[900px]:flex-row min-[900px]:items-end">
            <div className="max-w-4xl">
              <Badge variant="default">{shellCopy.badgeLabel}</Badge>
              <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
                {shellCopy.pageTitle}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {shellCopy.pageSubtitle}
              </p>
            </div>
            <Badge variant={result ? dataReadinessBadgeVariant(result) : "warning"}>
              {result ? dataReadinessBadgeLabel(result) : "加载中"}
            </Badge>
          </header>
        </>
      ) : null}

      {!query ? <InvalidQueryCard message={invalidReason} /> : null}

      {query && pageMode === "loading" ? (
        <ForecastDecisionLoadingState
          target={isCloudSeaFlow ? "cloud_sea" : "general"}
          context={query}
        />
      ) : null}

      {query && pageMode === "error" ? (
        <ForecastDecisionErrorState
          target={isCloudSeaFlow ? "cloud_sea" : "general"}
          query={query}
          message={errorMessage}
        />
      ) : null}

      {query && result && pageMode === "result" ? (
        <ForecastResultView
          query={query}
          result={result}
          aiStatus={aiStatus}
          aiExplanation={aiExplanation}
          aiErrorMessage={aiErrorMessage}
          aiRetryable={aiRetryable}
          onGenerateAiExplanation={generateAiExplanation}
        />
      ) : null}
    </PublicShell>
  );
}

function DashboardFrame({
  query,
  children,
}: {
  readonly query: ForecastQueryInput;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid gap-5 min-[900px]:grid-cols-[clamp(300px,32vw,360px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(320px,23vw,380px)_minmax(0,1fr)_clamp(320px,23vw,380px)] min-[1200px]:items-start">
      <aside className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
        <QuerySummaryPanel query={query} />
      </aside>
      <div className="grid gap-5 min-[1200px]:contents">{children}</div>
    </section>
  );
}

export function ForecastDecisionLoadingState({
  target,
  context,
}: {
  readonly target: DecisionTemplateTarget;
  readonly context: DecisionProgressContext;
}) {
  const horizonLabel = decisionProgressHorizonLabel(context);

  if (target === "cloud_sea") {
    return (
      <DecisionLoadingTemplate
        target="cloud_sea"
        context={decisionContextFromProgressContext("cloud_sea", context)}
        loading={{
          badges: [
            { label: "云海", variant: "default" },
            { label: horizonLabel, variant: "muted" },
          ],
          title: "云海拍摄判断",
          message: "正在生成云海拍摄判断...",
          description: "正在结合天气、地形、云层和光线窗口生成判断。",
        }}
        info={cloudSeaDecisionInfoCard()}
        dataCloudSeaPageMode="loading"
        dataCloudSeaLoading="shared-template"
      />
    );
  }

  return (
    <DecisionLoadingTemplate
      target="general"
      context={decisionContextFromProgressContext("general", context)}
      loading={{
        message: "正在生成拍摄天气分析...",
        description: "正在结合天气条件、天文窗口和地形特征生成出行判断。",
      }}
      info={{
        title: "分析基础",
        description: "页面会优先呈现是否值得去、什么时候到、拍什么和需要规避的风险。",
      }}
    />
  );
}

export function ForecastDecisionErrorState({
  target,
  query,
  message,
}: {
  readonly target: DecisionTemplateTarget;
  readonly query: ForecastQueryInput;
  readonly message: string;
}) {
  const horizonLabel = decisionProgressHorizonLabel(query);

  if (target === "cloud_sea") {
    return (
      <DecisionErrorTemplate
        target="cloud_sea"
        context={decisionContextFromQuery(query)}
        error={{
          badges: [
            { label: "云海", variant: "danger" },
            { label: horizonLabel, variant: "muted" },
          ],
          title: "云海拍摄判断",
          message: "云海判断生成失败",
          description: message,
          actions: (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.assign("/cloud-sea");
                }}
              >
                重新选择地点
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.location.assign(buildForecastUrlFromForecastQuery(query));
                }}
              >
                重新判断
              </Button>
            </>
          ),
        }}
        info={cloudSeaDecisionInfoCard()}
        dataCloudSeaPageMode="error"
        dataCloudSeaError="shared-template"
      />
    );
  }

  return (
    <DecisionErrorTemplate
      target="general"
      context={decisionContextFromQuery(query)}
      error={{
        message: "分析失败",
        description: message,
      }}
      info={{
        title: "分析基础",
        description: "页面会优先呈现是否值得去、什么时候到、拍什么和需要规避的风险。",
      }}
    />
  );
}

function decisionProgressHorizonLabel(context: DecisionProgressContext): string {
  return context.horizon ? forecastHorizonLabels[context.horizon] : "时间范围待确认";
}

function decisionContextFromProgressContext(
  target: DecisionTemplateTarget,
  context: DecisionProgressContext,
) {
  return {
    titleLabel: "地点 / 查询",
    title: context.name,
    details: [
      { label: "预报范围", value: decisionProgressHorizonLabel(context) },
      {
        label: "分析目标",
        value: target === "cloud_sea" ? "云海" : forecastTargetLabels[context.target ?? target],
      },
    ],
  };
}

function decisionContextFromQuery(query: ForecastQueryInput) {
  return decisionContextFromProgressContext(
    query.target === "cloud_sea" ? "cloud_sea" : "general",
    {
      name: query.name,
      horizon: query.horizon,
      target: query.target,
    },
  );
}

function cloudSeaDecisionInfoCard() {
  return {
    title: "云海判断基础",
    description:
      "页面会把云海形成、可拍机会、白墙风险、雨后开口和现场复核动作放在同一套判断结构里。",
    badge: { label: "云海 / 白墙 / 雨后开口", variant: "accent" as const },
  };
}

function QuerySummaryPanel({ query }: { readonly query: ForecastQueryInput }) {
  return (
    <Card className="grid gap-4 p-4 shadow-sm">
      <div>
        <p className="text-xs font-bold text-primary">地点 / 查询</p>
        <h2 className="mt-2 break-words text-2xl font-bold leading-tight text-card-foreground">
          {query.name}
        </h2>
      </div>

      <dl className="grid gap-3 text-sm">
        <SummaryItem label="预报范围" value={forecastHorizonLabels[query.horizon]} />
        <SummaryItem label="分析目标" value={forecastTargetLabels[query.target]} />
      </dl>
    </Card>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-bold text-card-foreground">{value}</dd>
    </div>
  );
}

function SectionHeading({
  title,
  description,
  badge,
}: {
  readonly title: string;
  readonly description?: string;
  readonly badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {badge ? <Badge variant="muted">{badge}</Badge> : null}
    </div>
  );
}

function WeatherEssentialsPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const current = result.currentWeather;
  const clothing = result.clothingGuide;
  const firstDay = result.dailySummaries[0]?.weather;
  const auxiliaryNotice = auxiliaryDataNotice(result);
  const timeContext = buildNearTermWeatherTimeContext(result);

  return (
    <CurrentWeatherCards target="general" dataTestId="near-term-weather">
      <SectionHeading
        title={`当前与近时段天气（${timeContext.sectionWindowLabel}）`}
        description={timeContext.description}
        badge={weatherReadinessLabel(result)}
      />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <CompactInfoCard
          title="气温与体感"
          timeBasis={timeContext.currentBasisLabel}
          badge={comfortLevelLabel(clothing.comfortLevel)}
          value={mountainTemperatureValue(current, firstDay, result)}
          detail={`${dailyTemperatureRangeText(firstDay, result)}，${temperatureActionText(
            current,
            firstDay,
            result,
          )} ${terrainCorrectionUserNote(result, current, firstDay)}`}
        />
        <CompactInfoCard
          title="云层与能见度"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={`通透度 ${transparencyGradeLabel(firstDay?.transparencyGrade, result.scores.transparency.score)}`}
          value={`云量 ${formatPercentNumber(current?.cloudTotal ?? firstDay?.cloudTotal)}`}
          detail={`能见度 ${formatKilometers(
            current?.rawVisibilityKm ??
              current?.visibility ??
              firstDay?.rawVisibilityKm ??
              firstDay?.visibility,
          )}，低云 ${formatPercentNumber(
            current?.cloudLow ?? firstDay?.cloudLow,
          )}。${cloudVisibilityActionText(result)}`}
        />
        <CompactInfoCard
          title="风与降水"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={formatWindWithGust(
            current?.windSpeed ?? firstDay?.windSpeed,
            current?.windDirection ?? firstDay?.windDirection,
            current?.windGust ?? firstDay?.windGust,
          )}
          value={precipitationDisplayValue(current ?? firstDay)}
          detail={`${precipitationDisplayDetail(current ?? firstDay)}。${windPrecipitationActionText(result)}`}
        />
        <CompactInfoCard
          title="湿度与露点"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={`湿度 ${formatPercentNumber(current?.humidity ?? firstDay?.humidity)}`}
          value={`露点差 ${formatTemperatureDelta(current?.dewPointSpread ?? firstDay?.dewPointSpread)}`}
          detail={`${dewPointActionText(current?.dewPointSpread ?? firstDay?.dewPointSpread)} ${auxiliaryNotice}`}
        />
        <CompactInfoCard
          title="穿衣与装备"
          timeBasis={timeContext.tripBasisLabel}
          badge={clothing.titleZh}
          value={packingMainValue(clothing)}
          detail={packingDetail(clothing)}
        />
      </div>
    </CurrentWeatherCards>
  );
}

type NearTermWeatherTimeContext = {
  readonly sectionWindowLabel: string;
  readonly description: string;
  readonly currentBasisLabel: string;
  readonly nearTermBasisLabel: string;
  readonly tripBasisLabel: string;
};

function buildNearTermWeatherTimeContext(
  result: ForecastCalculationResult,
): NearTermWeatherTimeContext {
  const basisStart =
    firstValidTime(result.currentWeather?.observedAt, result.forecastStart, result.generatedAt) ??
    "";
  const basisEnd = nearTermWindowEnd(basisStart, result.forecastEnd);
  const sectionWindowLabel =
    basisStart && basisEnd
      ? formatWindow(basisStart, basisEnd)
      : result.calendarBasis.forecastRangeLabel;
  const currentBasisLabel = result.currentWeather?.observedAt
    ? `当前实况：${formatFullDateTime(result.currentWeather.observedAt)}`
    : `当前参考：${dateLabelForResultClient(result, result.targetDates[0] ?? "")}`;
  const nearTermBasisLabel = `近时段参考：${sectionWindowLabel}`;
  const tripBasisLabel = `装备参考：${sectionWindowLabel}`;

  return {
    sectionWindowLabel,
    currentBasisLabel,
    nearTermBasisLabel,
    tripBasisLabel,
    description: `${currentBasisLabel}；${nearTermBasisLabel}。气温、云层、降水、风和体感只按这个时间范围解释。`,
  };
}

function firstValidTime(...values: readonly (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && Number.isFinite(Date.parse(value)));
}

function nearTermWindowEnd(startTime: string, forecastEnd: string): string {
  const startTimestamp = Date.parse(startTime);
  const forecastEndTimestamp = Date.parse(forecastEnd);
  if (!Number.isFinite(startTimestamp)) {
    return forecastEnd;
  }

  const sixHoursLater = shiftTime(startTime, 6 * 60);
  const sixHoursLaterTimestamp = Date.parse(sixHoursLater);
  if (
    Number.isFinite(forecastEndTimestamp) &&
    Number.isFinite(sixHoursLaterTimestamp) &&
    forecastEndTimestamp > startTimestamp
  ) {
    return new Date(Math.min(forecastEndTimestamp, sixHoursLaterTimestamp)).toISOString();
  }
  return sixHoursLater;
}

export function SourceDiagnosticsPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const meteoblue = weatherProviderSummary(result, "meteoblue");
  const meteobluePartial = sourceSucceeded(meteoblue) && meteoblue?.partial === true;

  return (
    <Card className="p-4 shadow-sm min-[900px]:col-span-2 min-[1280px]:col-span-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-card-foreground">数据来源</h2>
        <Badge variant={dataReadinessBadgeVariant(result)}>
          置信度：{sourceConfidenceLabel(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1280px]:grid-cols-5">
        <CompactDefinition label="地点" value={result.calendarBasis.coordinateSource} />
        <CompactDefinition
          label="天气主源"
          value={publicSourceDiagnosticText(result, "qweather", "基础天气")}
        />
        <CompactDefinition
          label="云层辅助"
          value={publicSourceDiagnosticText(result, "open_meteo", "云层辅助")}
        />
        <CompactDefinition
          label="专业增强"
          value={publicSourceDiagnosticText(result, "meteoblue", "专业增强")}
        />
        <CompactDefinition label="天文" value={result.astroDataSourceLabelZh} />
      </dl>
      {meteobluePartial ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          部分字段缺失不代表服务不可用，仅表示当前数据包未返回全部辅助字段。
        </p>
      ) : null}
    </Card>
  );
}

function CompactInfoCard({
  title,
  value,
  detail,
  badge,
  timeBasis,
  tone = "default",
}: {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly badge?: string;
  readonly timeBasis?: string;
  readonly tone?: "default" | "success" | "warning";
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-card-foreground">{title}</p>
        {badge ? (
          <Badge
            variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "muted"}
          >
            {badge}
          </Badge>
        ) : null}
      </div>
      {timeBasis ? <p className="mt-2 text-xs font-semibold text-accent">{timeBasis}</p> : null}
      <p className="mt-3 break-words text-lg font-bold leading-6 text-card-foreground">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </Card>
  );
}

function weatherStatusLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "已启用真实天气数据";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例天气数据";
  }
  if (result.weatherDataMode === "fallback") {
    return "已回退演示天气数据";
  }
  return "演示天气数据";
}

function weatherModeBadge(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "真实数据源";
  }
  if (result.weatherDataMode === "fallback") {
    return "已回退演示";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例数据";
  }
  return "演示数据";
}

function isWeatherProviderSummary(
  summary: ForecastCalculationResult["weatherSourceSummaries"][number],
): boolean {
  return (
    summary.providerCode === "qweather" ||
    summary.providerCode === "open_meteo" ||
    summary.providerCode === "meteoblue"
  );
}

function sourceSucceeded(
  summary: ForecastCalculationResult["weatherSourceSummaries"][number] | undefined,
): boolean {
  return Boolean(summary && (summary.success ?? summary.status === "available"));
}

function weatherProviderSummary(
  result: ForecastCalculationResult,
  providerCode: "qweather" | "open_meteo" | "meteoblue",
) {
  return result.weatherSourceSummaries.find((summary) => summary.providerCode === providerCode);
}

function successfulRealWeatherSources(
  result: ForecastCalculationResult,
): readonly ForecastCalculationResult["weatherSourceSummaries"][number][] {
  return result.weatherSourceSummaries.filter(
    (summary) =>
      isWeatherProviderSummary(summary) && summary.dataMode === "real" && sourceSucceeded(summary),
  );
}

function publicSourceDiagnosticText(
  result: ForecastCalculationResult,
  providerCode: "qweather" | "open_meteo" | "meteoblue",
  sourceRoleLabel: string,
): string {
  const summary = weatherProviderSummary(result, providerCode);
  if (!summary) {
    return `${sourceRoleLabel}未参与`;
  }
  if (sourceSucceeded(summary)) {
    return summary.partial ? `${sourceRoleLabel}可用，部分辅助字段缺失` : `${sourceRoleLabel}可用`;
  }
  if (!summary.attempted) {
    return `${sourceRoleLabel}未参与本次融合`;
  }

  return `${sourceRoleLabel}暂不可用：${publicSourceIssueLabel(summary.errorCategory)}`;
}

function publicSourceIssueLabel(errorCategory: string | undefined): string {
  switch (errorCategory) {
    case "invalid_key":
    case "permission":
    case "configuration":
      return "配置或权限未通过";
    case "timeout":
      return "响应超时";
    case "rate_limited":
      return "调用频率受限";
    case "network":
      return "网络连接异常";
    case "invalid_response":
      return "返回数据无法用于本次判断";
    default:
      return "未返回可用数据";
  }
}

function dataReadinessBadgeLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode !== "real") {
    return result.weatherDataMode === "fallback" ? "真实天气不可用" : "体验参考";
  }

  const sources = successfulRealWeatherSources(result);
  if (sources.length >= 2) {
    return "判断依据较完整";
  }
  if (sources.length === 1) {
    return "基础预报可用";
  }

  return "真实天气不可用";
}

function dataReadinessBadgeVariant(result: ForecastCalculationResult): "success" | "warning" {
  return result.weatherDataMode === "real" && successfulRealWeatherSources(result).length >= 2
    ? "success"
    : "warning";
}

export function providerDiagnosticText(
  result: ForecastCalculationResult,
  providerCode: "qweather" | "open_meteo" | "meteoblue",
  fallbackLabel: string,
): string {
  const summary = weatherProviderSummary(result, providerCode);
  const label = summary?.providerLabelZh ?? fallbackLabel;
  if (!summary) {
    return `${label} 未启用`;
  }
  if (sourceSucceeded(summary)) {
    if (providerCode === "meteoblue" && summary.messageZh?.includes("部分字段缺失")) {
      return "meteoblue 通过，部分字段缺失";
    }
    return `${label} 通过`;
  }
  const reason = summary.messageZh ?? summary.warningZh ?? "未返回可用数据";
  const category = summary.errorCategory ? `（${summary.errorCategory}）` : "";
  return summary.attempted ? `失败${category}：${reason}` : `未参与${category}：${reason}`;
}

function sourceConfidenceLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode !== "real") {
    return "低";
  }

  if (result.weatherFusionSummary?.confidenceLevel) {
    return confidenceLevelLabel(result.weatherFusionSummary.confidenceLevel);
  }

  const qweatherOk = sourceSucceeded(weatherProviderSummary(result, "qweather"));
  const openMeteoOk = sourceSucceeded(weatherProviderSummary(result, "open_meteo"));
  const meteoblueOk = sourceSucceeded(weatherProviderSummary(result, "meteoblue"));
  const hasMajorConflict = result.weatherFusionSummary?.conflictStatusZh.includes("差异") ?? false;

  if (qweatherOk && openMeteoOk && meteoblueOk && !hasMajorConflict) {
    return "高";
  }
  if (
    (qweatherOk && openMeteoOk) ||
    (qweatherOk && meteoblueOk) ||
    successfulRealWeatherSources(result).length > 0
  ) {
    return "中";
  }
  return "低";
}

function comfortLevelLabel(
  level: ForecastCalculationResult["clothingGuide"]["comfortLevel"],
): string {
  const labels: Record<ForecastCalculationResult["clothingGuide"]["comfortLevel"], string> = {
    comfortable: "舒适",
    cool: "偏凉",
    cold: "寒冷",
    very_cold: "严寒",
    hot: "炎热",
    humid: "潮湿",
    windy: "多风",
    rainy: "有雨",
  };
  return labels[level];
}

function weatherReadinessLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "实况与预报已更新";
  }
  if (result.weatherDataMode === "fallback") {
    return "真实天气暂不可用";
  }
  return "体验参考";
}

function judgmentConfidenceText(result: ForecastCalculationResult): string {
  const level = result.weatherFusionSummary?.confidenceLevel;
  if (level === "high") {
    return "当前判断可信度：较高";
  }
  if (level === "medium") {
    return "当前判断可信度：中等";
  }
  return result.weatherDataMode === "real" ? "当前判断可信度：中等" : "当前判断可信度：偏低";
}

function auxiliaryDataNotice(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "fallback") {
    return "真实天气暂不可用，当前结果仅供体验参考。";
  }
  if (result.weatherMissingFields.length > 0 || result.weatherMissingDataNotes.length > 0) {
    return "部分辅助指标缺失，建议结合现场云层变化复核。";
  }
  return "云层与能见度已纳入判断。";
}

function dailyDecisionBadgeVariant(label: string | undefined): BadgeVariant {
  if (!label) {
    return "muted";
  }
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("强推荐") || label.includes("推荐安排")) {
    return "default";
  }
  if (label.includes("谨慎") || label.includes("观察") || label.includes("等待")) {
    return "accent";
  }
  return "muted";
}

function departureRecommendationLabel(result: ForecastCalculationResult): string {
  const firstDailyDecision = result.target === "general" ? result.dailySummaries[0] : undefined;
  if (firstDailyDecision?.dedicatedTripRecommendation === "不建议专程前往") {
    return firstDailyDecision.nearbyObservationRecommendation === "已在附近可观察"
      ? "已在附近可观察"
      : "不建议专程前往";
  }
  if (firstDailyDecision?.dedicatedTripRecommendation) {
    return firstDailyDecision.dedicatedTripRecommendation;
  }

  if (result.recommendationLabel.includes("不建议") || result.overallScore < 45) {
    return "不建议专程前往";
  }
  if (result.recommendationLabel.includes("谨慎") || result.overallScore < 65) {
    return "谨慎参考";
  }
  if (result.recommendationLabel.includes("强推荐")) {
    return "强推荐专程";
  }
  return "推荐安排";
}

function normalizeRecommendationLabel(label: string): string {
  if (label.includes("不建议")) {
    return "不建议专程前往";
  }
  if (label.includes("谨慎")) {
    return "谨慎参考";
  }
  if (label.includes("等待")) {
    return "推荐安排";
  }
  if (label.includes("强推荐")) {
    return "强推荐专程";
  }
  return "推荐安排";
}

function recommendationBadgeVariant(label: string): BadgeVariant {
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("谨慎") || label.includes("等待")) {
    return "accent";
  }
  return "default";
}

function userFacingResultText(text: string): string {
  return text
    .replace(/当前天气或地形仍包含演示数据/g, "部分辅助指标仅供体验参考")
    .replace(/地形数据：演示数据/g, "辅助指标仅供体验参考")
    .replace(/本地算法银河窗口/g, "银河窗口")
    .replace(/本地算法计算/g, "天文窗口判断")
    .replace(/本地算法/g, "天文窗口")
    .replace(/演示评分/g, "综合评分")
    .replace(/模拟评分/g, "综合评分")
    .replace(/演示数据/g, "体验参考")
    .replace(/和风天气|QWeather|Open-Meteo|meteoblue|高德地图/g, "预报信息")
    .replace(/WGS84|GCJ-02|GCJ02/g, "")
    .replace(/数据置信度/g, "判断可信度")
    .replace(/数据来源/g, "判断依据")
    .replace(/计算与数据/g, "拍摄判断")
    .replace(/\s+/g, " ")
    .trim();
}

function primaryReasonSentence(result: ForecastCalculationResult): string {
  return userFacingResultText(firstText(result.keyReasons, result.summary));
}

function arrivalAdviceValue(
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
): string {
  if (!window) {
    return "等待更新";
  }
  if (window.windowLevel === "watchable" || window.windowLevel === "blocked") {
    return "暂无专程到达建议";
  }
  if ("arrivalFullLabel" in window && window.arrivalFullLabel) {
    return window.arrivalFullLabel;
  }
  if (window.arrivalAdvice?.recommendedArrivalLabel) {
    return formatArrivalDeadlineZh(window.arrivalAdvice.recommendedArrivalTime);
  }
  const arrivalTime = shiftTime(window.startTime, -50);
  return formatArrivalDeadlineZh(arrivalTime);
}

function arrivalAdviceDetail(
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
): string {
  if (!window) {
    return "暂无明确高分窗口，先等待下一次预报更新，不建议为单一窗口赶路。";
  }
  if (window.windowLevel === "watchable" || window.windowLevel === "blocked") {
    return window.copyReasonZh ?? "当前只有可观察或备选信号，不建议按专程拍摄窗口安排到达时间。";
  }

  if (window.arrivalAdvice) {
    const warning = window.arrivalAdvice.warningZh ? ` ${window.arrivalAdvice.warningZh}` : "";
    return `${arrivalAdviceValue(window)}。${window.arrivalAdvice.reasonZh}${warning}`;
  }

  return `最佳窗口 ${formatWindow(window.startTime, window.endTime)}，${formatArrivalDeadlineZh(
    shiftTime(window.startTime, -50),
  )}，完成取景、三脚架和防护准备。`;
}

function averagePair(left: number | undefined, right: number | undefined): number | undefined {
  if (typeof left === "number" && typeof right === "number") {
    return (left + right) / 2;
  }
  return left ?? right;
}

function terrainModeForResult(result: ForecastCalculationResult | undefined) {
  return classifyTerrainMode(result?.terrainAnalysis?.terrainProfile ?? {});
}

function resultUsesMountainSemantics(result: ForecastCalculationResult | undefined): boolean {
  return terrainModeUsesMountainSemantics(terrainModeForResult(result));
}

function resultUsesLowlandSemantics(result: ForecastCalculationResult | undefined): boolean {
  return terrainModeUsesLowlandSemantics(terrainModeForResult(result));
}

function terrainCorrectionUserNote(
  result: ForecastCalculationResult,
  current: ForecastCalculationResult["currentWeather"] | undefined,
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
): string {
  const terrainProfile = result.terrainAnalysis.terrainProfile;
  const usesMountainSemantics = resultUsesMountainSemantics(result);
  const usesLowlandSemantics = resultUsesLowlandSemantics(result);
  const correctionApplied =
    current?.terrainAdjustmentApplied ?? weather?.temperatureCorrectionApplied ?? false;
  const correctionReason =
    current?.terrainAdjustmentReason ?? weather?.temperatureCorrectionReason ?? "";
  const windRisk = current?.exposedRidgeWindRisk ?? weather?.exposedRidgeWindRisk;
  const tripodRisk = current?.tripodStabilityRisk ?? weather?.tripodStabilityRisk;
  const lowConfidence = terrainProfile.elevationConfidence === "low";

  if (lowConfidence) {
    return "海拔资料暂未确认，体感仅作参考。";
  }
  if (windRisk === "high" || tripodRisk === "high") {
    return (
      current?.windChillNoteZh ??
      weather?.windChillNoteZh ??
      (usesMountainSemantics
        ? "山脊风风险较高，三脚架和人员站位需留余量。"
        : "阵风影响较明显，三脚架和人员站位需留余量。")
    );
  }
  if (usesLowlandSemantics) {
    return "预报接近该地点海拔，未额外修正。";
  }
  if (correctionApplied) {
    return "已结合机位海拔做轻量修正。";
  }
  if (
    correctionReason === "provider_elevation_close_to_spot" ||
    correctionReason === "provider_terrain_aware_no_extra_correction"
  ) {
    return "预报已接近机位海拔，未额外修正。";
  }
  return weather?.clothingRiskNoteZh ?? current?.clothingRiskNoteZh ?? "";
}

function dailyTemperatureRangeText(
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
): string {
  const prefix = terrainTemperaturePrefix(result);
  if (!weather) {
    return `${prefix}：暂缺`;
  }

  const temperature =
    typeof weather.tempMin === "number" && typeof weather.tempMax === "number"
      ? `${Math.round(weather.tempMin)}-${Math.round(weather.tempMax)}°C`
      : formatTemperature(averagePair(weather.tempMin, weather.tempMax));
  const feelsLikeMin = weather.mountainFeelsLikeMin ?? weather.feelsLikeMin;
  const feelsLikeMax = weather.mountainFeelsLikeMax ?? weather.feelsLikeMax;
  const feelsLikeLabel = resultUsesMountainSemantics(result)
    ? "山地体感"
    : terrainModeForResult(result) === "hill"
      ? "山地/丘陵体感"
      : "体感温度";
  const feelsLike =
    typeof feelsLikeMin === "number" && typeof feelsLikeMax === "number"
      ? `${feelsLikeLabel} ${Math.round(feelsLikeMin)}-${Math.round(feelsLikeMax)}°C`
      : `${feelsLikeLabel} ${formatTemperature(averagePair(feelsLikeMin, feelsLikeMax))}`;

  return `${prefix}：${temperature}｜${feelsLike}｜${temperatureCorrectionText(weather, result)}`;
}

function mountainTemperatureValue(
  current: ForecastCalculationResult["currentWeather"] | undefined,
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
): string {
  const temperature = current?.temperature ?? averagePair(weather?.tempMin, weather?.tempMax);
  const feelsLike =
    resultUsesMountainSemantics(result) || terrainModeForResult(result) === "hill"
      ? current?.mountainFeelsLikeC ??
        current?.feelsLike ??
        averagePair(weather?.mountainFeelsLikeMin, weather?.mountainFeelsLikeMax) ??
        averagePair(weather?.feelsLikeMin, weather?.feelsLikeMax)
      : current?.feelsLike ??
        averagePair(weather?.feelsLikeMin, weather?.feelsLikeMax) ??
        current?.mountainFeelsLikeC ??
        averagePair(weather?.mountainFeelsLikeMin, weather?.mountainFeelsLikeMax);
  const feelsLikeLabel = resultUsesMountainSemantics(result)
    ? "山地体感"
    : terrainModeForResult(result) === "hill"
      ? "山地/丘陵体感"
      : "体感温度";
  return `${terrainTemperaturePrefix(result)}：${formatTemperature(
    temperature,
  )} / ${feelsLikeLabel} ${formatTemperature(feelsLike)}`;
}

function terrainTemperaturePrefix(result: ForecastCalculationResult | undefined): string {
  if (resultUsesMountainSemantics(result)) {
    return result?.terrainAnalysis?.terrainProfile?.elevationConfidence === "low"
      ? "山顶参考温度"
      : "山顶估算温度";
  }
  return "机位估算温度";
}

function temperatureCorrectionText(
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
): string {
  if (!weather) {
    return "温度修正待复核";
  }
  if (resultUsesLowlandSemantics(result)) {
    return "预报接近该地点海拔，未额外修正";
  }
  if (weather.temperatureCorrectionApplied) {
    return "已结合机位海拔做轻量修正";
  }
  if (
    weather.temperatureCorrectionReason === "provider_elevation_close_to_spot" ||
    weather.temperatureCorrectionReason === "provider_terrain_aware_no_extra_correction"
  ) {
    return "预报已接近机位海拔，未额外修正";
  }
  return "未额外修正";
}

function temperatureActionText(
  current: ForecastCalculationResult["currentWeather"] | undefined,
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
): string {
  const feelsLike = current?.feelsLike ?? averagePair(weather?.feelsLikeMin, weather?.feelsLikeMax);
  if (typeof feelsLike === "number" && feelsLike <= 5) {
    return "风寒感明显，提前加保暖层。";
  }
  if (typeof feelsLike === "number" && feelsLike >= 28) {
    return "体感偏热，注意补水和遮阳。";
  }
  return resultUsesMountainSemantics(result)
    ? "按分层穿法准备，山顶体感仍需现场复核。"
    : "按清晨体感准备，现场复核风口、湿度和遮挡。";
}

function cloudVisibilityActionText(result: ForecastCalculationResult): string {
  if (result.scores.whiteoutRisk.score >= 70) {
    return resultUsesMountainSemantics(result)
      ? "白墙风险偏高，先观察云雾上沿。"
      : "低云或雾气影响偏高，先观察通透度。";
  }
  if (result.scores.transparency.score >= 70) {
    return "通透度较好，适合安排远景层次。";
  }
  return "通透度一般，保留近景和云层纹理备选。";
}

function precipitationDisplayValue(
  weather:
    | ForecastCalculationResult["dailySummaries"][number]["weather"]
    | ForecastCalculationResult["currentWeather"]
    | undefined,
): string {
  return rainRiskText(weather).value;
}

function precipitationDisplayDetail(
  weather:
    | ForecastCalculationResult["dailySummaries"][number]["weather"]
    | ForecastCalculationResult["currentWeather"]
    | undefined,
): string {
  return rainRiskText(weather).detail;
}

function windPrecipitationActionText(result: ForecastCalculationResult): string {
  const rainRisk = result.riskFlags.find((risk) => risk.key === "precipitation");
  const windRisk = result.riskFlags.find((risk) => risk.key === "wind");
  if (rainRisk) {
    return "降水干扰需优先规避。";
  }
  if (windRisk) {
    return resultUsesMountainSemantics(result)
      ? "注意三脚架稳定和山顶风寒。"
      : "注意阵风影响和三脚架稳定。";
  }
  return "风雨对拍摄干扰相对可控。";
}

function dewPointActionText(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "露点差暂缺，雾气和结露需现场复核。";
  }
  if (value <= 2) {
    return "露点差很小，雾气、结露和云雾变化会更敏感。";
  }
  if (value <= 5) {
    return "露点差偏小，清晨云雾变化值得关注。";
  }
  return "露点差相对拉开，云雾突变概率较低。";
}

function packingMainValue(guide: ForecastCalculationResult["clothingGuide"]): string {
  return clothingEquipmentAdvice(guide)[1] ?? guide.titleZh;
}

function packingDetail(guide: ForecastCalculationResult["clothingGuide"]): string {
  return clothingEquipmentAdvice(guide)[0] ?? guide.summaryZh;
}

type RiskDecisionItem = {
  readonly label: string;
  readonly levelLabel: string;
  readonly timeWindow: string;
  readonly action: string;
};

function buildRiskDecisionItems(
  result: ForecastCalculationResult,
  mainRisk: ForecastResultSectionItem,
): readonly RiskDecisionItem[] {
  const explicitRisks = result.riskFlags.map((risk) => riskDecisionFromFlag(result, risk));
  const riskItems =
    explicitRisks.length > 0 ? explicitRisks : [riskDecisionFromSection(result, mainRisk)];
  const usesMountainSemantics = resultUsesMountainSemantics(result);
  const whiteoutItem =
    result.scores.whiteoutRisk.score >= 60
      ? [
          {
            label: usesMountainSemantics ? "白墙风险" : "低云遮挡",
            levelLabel: result.scores.whiteoutRisk.score >= 75 ? "高风险" : "中风险",
            timeWindow: fallbackRiskTimeLabel(result, "whiteout") ?? "清晨窗口前后",
            action: usesMountainSemantics
              ? "到场观察云顶高度，避免只守单一机位。"
              : "关注雾气厚度、低云遮挡和通透度变化。",
          },
        ]
      : [];

  return dedupeRiskDecisionItems([...riskItems, ...whiteoutItem]).slice(0, 4);
}

function riskDecisionFromFlag(
  result: ForecastCalculationResult,
  risk: ForecastRiskFlag,
): RiskDecisionItem {
  return {
    label: risk.label,
    levelLabel: `${riskLevelText(risk.level)}风险`,
    timeWindow: risk.timeWindowLabelZh ?? fallbackRiskTimeLabel(result, risk.key) ?? "出行前复核",
    action: riskActionText(result, risk.key, risk.description),
  };
}

function riskDecisionFromSection(
  result: ForecastCalculationResult,
  item: ForecastResultSectionItem,
): RiskDecisionItem {
  return {
    label: item.label,
    levelLabel: item.value ?? "低风险",
    timeWindow: buildNearTermWeatherTimeContext(result).sectionWindowLabel ?? "出行前复核",
    action: compactRiskActionFromText(item.detail),
  };
}

function riskActionText(result: ForecastCalculationResult, key: string, detail: string): string {
  if (key === "precipitation") {
    return "防水收纳，清晨窗口需复核临近预报。";
  }
  if (key === "whiteout" || key === "low_cloud") {
    return resultUsesMountainSemantics(result)
      ? "到场观察云顶高度，避免只守单一机位。"
      : "关注雾气厚度、低云遮挡和通透度变化。";
  }
  if (key === "wind") {
    return resultUsesMountainSemantics(result)
      ? "三脚架加重，山脊位置留安全余量。"
      : "三脚架加重，空旷位置留安全余量。";
  }
  if (key === "visibility") {
    return "优先准备中近景构图，远景层次现场再定。";
  }

  return compactRiskActionFromText(detail);
}

function compactRiskActionFromText(detail: string): string {
  const withoutTime = detail.replace(/重点时段：[^。]+。?/g, "").trim();
  return withoutTime ? firstSentence(withoutTime) : "出行前复核最新天气、道路和景区开放信息。";
}

function dedupeRiskDecisionItems(items: readonly RiskDecisionItem[]): readonly RiskDecisionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.label)) {
      return false;
    }
    seen.add(item.label);
    return true;
  });
}

function riskDetailWithTime(result: ForecastCalculationResult, risk: ForecastRiskFlag): string {
  return appendRiskTimeContext(
    risk.description,
    risk.timeWindowLabelZh ?? fallbackRiskTimeLabel(result, risk.key),
  );
}

function appendRiskTimeContext(detail: string, timeLabel: string | undefined): string {
  const cleanDetail = detail.trim().replace(/[。.]$/, "");
  if (!timeLabel) {
    return `${cleanDetail}。`;
  }
  if (cleanDetail.includes(timeLabel)) {
    return `${cleanDetail}。`;
  }
  return `${cleanDetail}。重点时段：${timeLabel}。`;
}

function fallbackRiskTimeLabel(
  result: ForecastCalculationResult,
  riskKey: string,
): string | undefined {
  if (riskKey === "whiteout" || riskKey === "low_cloud") {
    const whiteoutDay = [...result.cloudSeaAnalysis.dailyCloudSea]
      .filter((day) => day.whiteoutRiskScore >= 50)
      .sort((left, right) => right.whiteoutRiskScore - left.whiteoutRiskScore)[0];
    if (whiteoutDay?.bestWindow) {
      return formatWindow(whiteoutDay.bestWindow.startTime, whiteoutDay.bestWindow.endTime);
    }
    return formatDateBlockLabel(result, result.targetDates[0], "清晨窗口前后");
  }

  if (riskKey === "precipitation") {
    const precipitationDay = result.dailySummaries.find((summary) => {
      const level = summary.weather?.precipitationRisk?.rainRiskLevel;
      return level === "medium" || level === "high" || level === "severe";
    });
    if (precipitationDay) {
      return formatDateBlockLabel(
        result,
        precipitationDay.date,
        precipitationDay.weather?.maxRainRiskWindow ??
          precipitationDay.weather?.affectedPrecipitationWindows?.[0] ??
          "当日降水时段",
      );
    }
  }

  if (riskKey === "wind") {
    const windDay = [...result.dailySummaries]
      .filter((summary) => typeof summary.weather?.windGust === "number")
      .sort((left, right) => (right.weather?.windGust ?? 0) - (left.weather?.windGust ?? 0))[0];
    if (windDay) {
      return formatDateBlockLabel(result, windDay.date, "风力较强时段");
    }
  }

  if (riskKey === "visibility") {
    const visibilityDay = [...result.dailySummaries]
      .filter((summary) => typeof summary.weather?.visibility === "number")
      .sort(
        (left, right) => (left.weather?.visibility ?? 99) - (right.weather?.visibility ?? 99),
      )[0];
    if (visibilityDay) {
      return formatDateBlockLabel(result, visibilityDay.date, "低能见度时段");
    }
  }

  return buildNearTermWeatherTimeContext(result).sectionWindowLabel;
}

function formatDateBlockLabel(
  result: ForecastCalculationResult,
  date: string | undefined,
  blockLabel: string,
): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${dateLabelForResultClient(result, date)} ${blockLabel}`;
}

function subjectActionSuggestion(key: SubjectScoreKey, score: number): string {
  if (key === "cloudSea") {
    return score >= 70 ? "提前到达，先守清晨云海窗口。" : "作为备选，现场重点看低云上沿。";
  }
  if (key === "sunriseGlow") {
    return score >= 70 ? "日出前完成构图，等待云缝和色温变化。" : "只作为清晨备选。";
  }
  if (key === "sunsetGlow") {
    return score >= 70 ? "下午提前踩点，保留日落前后机动窗口。" : "晚霞信号一般，转向云层纹理。";
  }
  if (key === "stars") {
    return score >= 70 ? "夜间可安排星空窗口，注意月光和云量复核。" : "夜景作为备选。";
  }
  if (key === "milkyWay") {
    return score >= 70 ? "银河窗口可纳入计划，提前确认前景和安全通行。" : "银河不宜作为唯一目标。";
  }
  return score >= 70 ? "适合远山层次和长焦景别。" : "通透度一般，优先准备中近景构图。";
}

function astroMainBlockers(
  result: ForecastCalculationResult,
  day: DailyAstroLike | undefined,
): readonly string[] {
  const labels = day?.labels ?? result.astroAnalysis.labels;
  const rawBlockers = day?.weatherBlockers ?? result.astroAnalysis.weatherBlockers;
  const text = rawBlockers.join(" ");
  const blockers = [
    /低云/.test(text) || labels.cloudBlocker === "高" ? "低云偏多" : "",
    /总云|云量|云层|厚云/.test(text) ? "云量偏高" : "",
    /降水|雨|雪/.test(text) ? "降水干扰" : "",
    labels.moonlightImpact === "高" || /月光/.test(text) ? "月光影响" : "",
    labels.dewRisk === "高" || /露|结露|湿度/.test(text) ? "露水风险" : "",
    /通透|能见度|霾|雾/.test(text) ? "通透度不足" : "",
  ].filter(Boolean);

  if (blockers.length > 0) {
    return [...new Set(blockers)].slice(0, 4);
  }

  if (rawBlockers.length > 0) {
    return rawBlockers.map((blocker) => blocker.replace(/[。.]$/, "")).slice(0, 3);
  }

  return result.astroAnalysis.astroShootable ? [] : ["云量/低云/降水条件"];
}

function formatAstroWindowForUi(window: AstroWindowLike): string {
  return formatShootingWindowZh({ startTime: window.start, endTime: window.end });
}

function normalizeAiExplanationErrorMessage(message: string | undefined): string {
  void message;
  return "智能解读暂时不可用，请稍后重试。当前确定性判断结果仍可正常参考。";
}

function InvalidQueryCard({ message }: { readonly message?: string }) {
  return (
    <Card className="border-warning p-5 shadow-sm">
      <h2 className="text-lg font-bold text-warning">查询参数不完整</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {message ?? "请从首页选择地点和预报范围，或从专题页进入对应题材分析。"}
      </p>
    </Card>
  );
}

function ForecastResultView({
  query,
  result,
  aiStatus,
  aiExplanation,
  aiErrorMessage,
  aiRetryable,
  onGenerateAiExplanation,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly aiStatus: AiStatus;
  readonly aiExplanation: ForecastAiExplanation | null;
  readonly aiErrorMessage: string;
  readonly aiRetryable: boolean;
  readonly onGenerateAiExplanation: () => void;
}) {
  const viewModel = useMemo(
    () => buildForecastResultViewModel(result, query.target),
    [query.target, result],
  );

  if (viewModel.target === "general") {
    return (
      <ComprehensiveForecastView
        query={query}
        result={result}
        viewModel={viewModel}
        aiStatus={aiStatus}
        aiExplanation={aiExplanation}
        aiErrorMessage={aiErrorMessage}
        aiRetryable={aiRetryable}
        onGenerateAiExplanation={onGenerateAiExplanation}
      />
    );
  }

  if (viewModel.target === "cloud_sea" && viewModel.cloudSea) {
    return <CloudSeaResultPage query={query} result={result} viewModel={viewModel.cloudSea} />;
  }

  if (viewModel.target === "glow" && viewModel.glow) {
    return <GlowResultPage query={query} result={result} viewModel={viewModel.glow} />;
  }

  if (viewModel.target === "astro" && viewModel.astro) {
    return <AstroResultPage query={query} result={result} viewModel={viewModel.astro} />;
  }

  return (
    <DashboardFrame query={query}>
      <main className="grid gap-4">
        <Card className="grid gap-4 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-primary">{viewModel.targetLabel}</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-card-foreground">
                {viewModel.recommendationLabel}
              </h2>
            </div>
            <Badge variant={dataReadinessBadgeVariant(result)}>
              {dataReadinessBadgeLabel(result)}
            </Badge>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{viewModel.primarySummary}</p>
          <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {viewModel.primaryCards.map((card) => (
              <PrimaryResultCard key={card.key} card={card} />
            ))}
          </section>
        </Card>

        {viewModel.dailyItems.length > 0 ? (
          <DailyOverviewPanel
            title={viewModel.dailyOverviewTitle ?? "逐日判断"}
            description={viewModel.dailyOverviewDescription ?? "按日期展示主要判断。"}
            items={viewModel.dailyItems}
          />
        ) : null}

        <WindowPanel
          title={viewModel.windowsTitle}
          description={viewModel.windowsDescription}
          windows={viewModel.bestWindows}
          groups={viewModel.windowGroups}
        />

        <ScoreCardsPanel title={viewModel.scoreSectionTitle} scores={viewModel.scoreCards} />

        <SectionGrid sections={viewModel.detailSections} />

        {query.target === "astro" ? (
          <MoonPhaseCalendar
            latitudeWgs84={query.latitudeWgs84}
            longitudeWgs84={query.longitudeWgs84}
            timezone={result.calendarBasis.timezone}
          />
        ) : null}
      </main>

      <aside className="grid content-start gap-4">
        <MockWarningCard result={result} dataNotice={viewModel.dataNotice} />
        <AiExplanationPanel
          status={aiStatus}
          explanation={aiExplanation}
          errorMessage={aiErrorMessage}
          retryable={aiRetryable}
          onGenerate={onGenerateAiExplanation}
        />
        <SectionStack sections={viewModel.riskSections} />
        <SectionStack sections={viewModel.adviceSections} />
        <CalculationBasisPanel result={result} />
        <DataStatusPanel result={result} />
      </aside>
    </DashboardFrame>
  );
}

export function CloudSeaResultPage({
  query,
  result,
  viewModel,
  returnUrl,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: CloudSeaForecastViewModel;
  readonly returnUrl?: string;
}) {
  return (
    <DecisionResultTemplate
      target="cloud_sea"
      className="CloudSeaResultPage cloud-sea-result-page grid gap-5"
      dataCloudSeaSection="CloudSeaResultPage"
      dataCloudSeaPageMode="result"
    >
      <main className="grid w-full min-w-0 gap-5" data-forecast-decision-layout="stacked">
        <CloudSeaTopResultHeader
          query={query}
          hero={viewModel.hero}
          result={result}
          terrainContext={viewModel.terrainContext}
        />
        <CloudSeaMetricCards
          hero={viewModel.hero}
          result={result}
          cards={viewModel.coreCards}
          riskSummary={viewModel.riskSummary}
          terrainContext={viewModel.terrainContext}
        />
        <CloudSeaNearTermWeatherSection result={result} terrainContext={viewModel.terrainContext} />
        <CloudSeaWindowCardsSection
          windows={viewModel.cloudSeaWindows}
          terrainContext={viewModel.terrainContext}
        />
        <CloudSeaProfessionalHourlyDataPanel
          result={result}
          terrainContext={viewModel.terrainContext}
        />
        <CloudSeaDailyTrend
          result={result}
          items={viewModel.dailyTrend}
          terrainContext={viewModel.terrainContext}
        />
        <CloudSeaReasoningSection items={viewModel.reasoningItems} />
        <CloudSeaActionPlanSection items={viewModel.actionPlan} />
        <CloudSeaRiskSummarySection riskSummary={viewModel.riskSummary} />
        {viewModel.dataCaution ? <CloudSeaInlineCaution text={viewModel.dataCaution} /> : null}
        {returnUrl ? <CloudSeaReturnLink href={returnUrl} /> : null}
      </main>
    </DecisionResultTemplate>
  );
}

export function GlowResultPage({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: GlowForecastViewModel;
}) {
  return (
    <section
      className="GlowResultPage glow-result-page grid gap-5"
      data-glow-section="GlowResultPage"
    >
      <GlowTopContext query={query} result={result} />
      <GlowCoreDecision cards={viewModel.coreCards} />
      <WeatherEssentialsPanel result={result} />

      <main className="glow-result-stack grid gap-5" data-glow-section="GlowStackedLayout">
        <GlowDailyTrend result={result} items={viewModel.dailyTrend} />
        <GlowWindowSection windows={viewModel.glowWindows} />
        <GlowTwilightSection result={result} />
        <GlowCloudStructureSection result={result} items={viewModel.cloudLayerEvidence} />
        <GlowLowCloudRiskSection result={result} />
        <GlowEvidenceSection
          title="能见度与通透度"
          badgeLabel="能见度 / 湿度 / 风 / 降水"
          items={viewModel.visibilityEvidence}
          dataSection="GlowVisibilitySection"
        />
        <GlowTerrainSection result={result} items={viewModel.terrainObstructionEvidence} />
        <GlowAdviceSection result={result} items={viewModel.travelRecommendations} />
        <GlowRiskSection result={result} risks={viewModel.riskReasons} />
        <GlowBackupPlanSection plans={viewModel.backupPlans} />
        <GlowDataStatusSection
          result={result}
          notes={viewModel.missingDataNotes}
          dataNotice={viewModel.dataNotice}
        />
      </main>
    </section>
  );
}

export function AstroResultPage({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: AstroForecastViewModel;
}) {
  return (
    <section
      className="AstroResultPage astro-result-page grid gap-5"
      data-astro-section="AstroResultPage"
    >
      <AstroTopContext query={query} result={result} />
      <SectionHeading
        title="核心判断"
        description="先看实际可拍性，再看天文黑夜、银河几何、月光、云量和露水风险。"
        badge={result.astroAnalysis.astroShootable ? "建议夜拍" : "谨慎夜拍"}
      />
      <AstroCoreDecision cards={viewModel.coreCards} />
      <WeatherEssentialsPanel result={result} />

      <main
        className="AstroResultLayout astro-result-stack grid gap-5"
        data-astro-section="AstroResultLayout"
      >
        <AstroDailyTrend result={result} items={viewModel.dailyTrend} />
        <AstroNightWindowSection
          astronomicalNightWindows={viewModel.astronomicalNightWindows}
          moonlessNightWindows={viewModel.moonlessNightWindows}
          astroDataSourceLabel={result.astroDataSourceLabelZh}
        />
        <AstroMilkyWaySection
          candidateWindows={viewModel.milkyWayCandidateWindows}
          recommendedWindows={viewModel.recommendedMilkyWayWindows}
        />
        <AstroMoonPhaseSection result={result} />
        <AstroMoonriseMoonsetSection result={result} />
        <AstroEvidenceSection
          title="云量与通透"
          badgeLabel="云层 / 通透 / 湿度"
          items={[...viewModel.cloudEvidence, ...viewModel.visibilityEvidence]}
          dataSection="AstroCloudVisibilitySection"
        />
        <AstroEvidenceSection
          title="光污染与地形遮挡"
          badgeLabel="光污染 / 地平线"
          items={[...viewModel.lightPollutionEvidence, ...viewModel.terrainEvidence]}
          dataSection="AstroLightTerrainSection"
        />
        <AstroAdviceSection items={viewModel.travelRecommendations} />
        <AstroRiskSection risks={viewModel.riskReasons} />
        <AstroBackupPlanSection plans={viewModel.backupPlans} />
        <AstroDataStatusSection
          result={result}
          notes={viewModel.missingDataNotes}
          dataNotice={viewModel.dataNotice}
        />
        <AstroMoonCalendarAction query={query} result={result} />
      </main>
    </section>
  );
}

function AstroTopContext({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">星空银河判断</Badge>
            <Badge variant={dataReadinessBadgeVariant(result)}>
              {dataReadinessBadgeLabel(result)}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
            <Badge variant="info">
              置信度：{confidenceLabel(result.astroAnalysis.confidenceLevel)}
            </Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1120px]:flex min-[1120px]:flex-wrap min-[1120px]:gap-2">
            <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>更新时间：{formatDateTime(result.generatedAt)}</span>
            <span>数据状态：{weatherStatusLabel(result)}</span>
            <span>天气数据：{weatherModeBadge(result)}</span>
            <span>地形数据：{result.terrainAnalysis.dataSourceLabelZh}</span>
            <span>天文数据：{result.astroDataSourceLabelZh}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign("/astro");
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function AstroCoreDecision({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section
      className="AstroCoreDecision astro-core-decision grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]"
      data-astro-section="AstroCoreDecision"
    >
      {cards.map((card) => (
        <PrimaryResultCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function AstroDailyTrend({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly AstroDailyTrendItem[];
}) {
  return (
    <Card
      className="AstroDailyTrend astro-daily-trend p-4 shadow-sm"
      data-astro-section="AstroDailyTrend"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">每晚观星条件</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            分开看天文窗口、天气可拍性、银河几何、月光、云量和露水风险。
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article
            key={item.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(155px,0.9fr)_minmax(165px,0.9fr)_minmax(210px,1.2fr)_minmax(0,1.5fr)] min-[900px]:items-start"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
                <Badge variant={item.recommendationLabel === "不建议专程" ? "warning" : "default"}>
                  {item.recommendationLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.lunarDateText ? `农历${item.lunarDateText}` : "夜间窗口"}
              </p>
            </div>
            <dl className="grid gap-1 text-sm">
              <AstroInlineDefinition
                label="天文窗口"
                value={item.astronomicalWindowAvailable ? "有" : "无"}
              />
              <AstroInlineDefinition label="天文条件" value={`${item.astroConditionScore} 分`} />
              <AstroInlineDefinition
                label="星空可拍性"
                value={`${item.starShootabilityLabel} / ${item.astroPracticalScore} 分`}
              />
              <AstroInlineDefinition
                label="银河可拍性"
                value={`${item.milkyWayShootabilityLabel} / ${item.milkyWayGeometryScore} 分`}
              />
              <AstroInlineDefinition label="月光影响" value={item.moonImpactLabel} />
            </dl>
            <dl className="grid gap-1 text-sm">
              <AstroInlineDefinition label="云量阻挡" value={item.cloudBlockerLabel} />
              <AstroInlineDefinition label="露水风险" value={item.dewRiskLabel} />
              <AstroInlineDefinition label="透明度" value={`${item.transparencyScore} 分`} />
              <AstroInlineDefinition label="天文黑夜" value={item.astronomicalNightLabel} />
              <AstroInlineDefinition label="无月黑夜" value={item.moonlessNightLabel} />
              <AstroInlineDefinition label="银心窗口" value={item.galacticCenterWindowLabel} />
              <AstroInlineDefinition
                label={item.astroShootable ? "推荐银河窗口" : "银河窗口判断"}
                value={item.recommendedMilkyWayLabel}
              />
            </dl>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">{item.riskNote}</Badge>
                {item.weatherBlockers.length > 0 ? <Badge variant="danger">天气阻断</Badge> : null}
                <Badge variant={item.astroShootable ? "default" : "warning"}>
                  {item.nightShootingAdviceLabel}
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {item.blockerReasonLabel}；{item.keyReason}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                云量条件：{item.cloudConditionLabel}；降水：{item.precipitationRiskLabel}
              </p>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroNightWindowSection({
  astronomicalNightWindows,
  moonlessNightWindows,
  astroDataSourceLabel,
}: {
  readonly astronomicalNightWindows: readonly AstroWindowViewItem[];
  readonly moonlessNightWindows: readonly AstroWindowViewItem[];
  readonly astroDataSourceLabel: string;
}) {
  return (
    <Card className="AstroNightWindowSection astro-night-window p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">天文黑夜与无月黑夜</h2>
        <Badge variant="muted">{astroDataSourceLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-4 min-[900px]:grid-cols-2">
        <AstroWindowList title="天文黑夜" windows={astronomicalNightWindows} />
        <AstroWindowList title="无月黑夜" windows={moonlessNightWindows} />
      </div>
    </Card>
  );
}

function AstroMilkyWaySection({
  candidateWindows,
  recommendedWindows,
}: {
  readonly candidateWindows: readonly AstroWindowViewItem[];
  readonly recommendedWindows: readonly AstroWindowViewItem[];
}) {
  return (
    <Card className="AstroMilkyWaySection astro-milky-way p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">银河窗口与可拍性</h2>
        <Badge variant="muted">银心方向 / 月光交集</Badge>
      </div>
      <div className="mt-4 grid gap-4 min-[900px]:grid-cols-2">
        <AstroWindowList title="推荐窗口" windows={recommendedWindows} />
        <AstroWindowList title="候选窗口" windows={candidateWindows} />
      </div>
    </Card>
  );
}

function AstroWindowList({
  title,
  windows,
}: {
  readonly title: string;
  readonly windows: readonly AstroWindowViewItem[];
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      {windows.length > 0 ? (
        windows.map((window) => (
          <article key={window.key} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-card-foreground">{window.dateLabel}</p>
                <p className="mt-1 text-sm font-semibold text-accent">{window.timeRangeLabel}</p>
              </div>
              <Badge variant={badgeVariantForTone(window.tone)}>{window.score} 分</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {window.direction ? <Badge variant="muted">{window.direction}</Badge> : null}
              {window.altitude !== "暂缺数据" ? (
                <Badge variant="info">银心高度 {window.altitude}</Badge>
              ) : null}
              {window.riskTags.map((tag) => (
                <Badge key={tag} variant={tag.includes("偏") ? "warning" : "muted"}>
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{window.note}</p>
          </article>
        ))
      ) : (
        <p className="rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          暂无可推荐拍摄窗口；若只有天文时间，仍需等待云量、月光和降水条件转好。
        </p>
      )}
    </section>
  );
}

function AstroMoonPhaseSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="AstroMoonPhaseSection astro-moon-phase p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">月相与月光</h2>
        <Badge variant="muted">月相 / 照明 / 高度</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {result.astroSummaries.map((astro) => (
          <article key={astro.date} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-card-foreground">
                {dateLabelForResultClient(result, astro.date)}
              </h3>
              <Badge variant={astro.moonIllumination >= 0.55 ? "warning" : "muted"}>
                {formatPercent(astro.moonIllumination)}
              </Badge>
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              <AstroInlineDefinition label="月相" value={astro.moonPhaseNameZh} />
              <AstroInlineDefinition label="农历" value={astro.lunarDateText} />
              <AstroInlineDefinition label="月光影响" value={moonImpactText(astro)} />
              <AstroInlineDefinition label="月出" value={formatOptionalTime(astro.moonrise)} />
              <AstroInlineDefinition label="月落" value={formatOptionalTime(astro.moonset)} />
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroMoonriseMoonsetSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="AstroMoonriseMoonsetSection astro-moonrise-moonset p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">月出月落</h2>
        <Badge variant="muted">{result.astroDataSourceLabelZh}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
        {result.astroSummaries.map((astro) => (
          <article key={astro.date} className="rounded-lg border border-border bg-muted p-3">
            <h3 className="font-bold text-card-foreground">
              {dateLabelForResultClient(result, astro.date)}
            </h3>
            <dl className="mt-3 grid gap-2 text-sm">
              <AstroInlineDefinition label="月出" value={formatOptionalTime(astro.moonrise)} />
              <AstroInlineDefinition label="月落" value={formatOptionalTime(astro.moonset)} />
              <AstroInlineDefinition
                label="夜间月亮高度"
                value={formatMoonAltitudeSummary(astro.moonAltitudeByHour)}
              />
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroEvidenceSection({
  title,
  badgeLabel,
  items,
  dataSection,
}: {
  readonly title: string;
  readonly badgeLabel: string;
  readonly items: readonly AstroEvidenceViewItem[];
  readonly dataSection: string;
}) {
  return (
    <Card className={`${dataSection} p-4 shadow-sm`} data-astro-section={dataSection}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroAdviceSection({ items }: { readonly items: readonly string[] }) {
  return (
    <Card className="AstroAdviceSection astro-advice p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">拍摄建议</h2>
        <Badge variant="muted">是否出发 / 到达 / 装备</Badge>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground min-[900px]:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-border bg-muted px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AstroRiskSection({ risks }: { readonly risks: readonly string[] }) {
  return (
    <Card className="AstroRiskSection astro-risk p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">风险提示</h2>
        <Badge variant="muted">月光 / 云量 / 通透 / 光污染</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {risks.map((risk) => (
          <article key={risk} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-sm leading-6 text-muted-foreground">{risk}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroBackupPlanSection({ plans }: { readonly plans: readonly GlowBackupPlan[] }) {
  return (
    <Card className="AstroBackupPlanSection astro-backup p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">备选拍摄方案</h2>
        <Badge variant="muted">银河受限时</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.condition} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">{plan.condition}</p>
            <h3 className="mt-2 font-bold text-card-foreground">{plan.action}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroDataStatusSection({
  result,
  notes,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly notes: readonly string[];
  readonly dataNotice: string;
}) {
  return (
    <Card className="AstroDataStatusSection astro-data-status p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态 / 数据缺失说明</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[900px]:grid-cols-4">
        <CompactDefinition label="天文数据" value={result.astroDataSourceLabelZh} />
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <CompactDefinition label="光污染数据" value="暂未接入" />
      </dl>
      <p className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm leading-6 text-muted-foreground">
        {dataNotice}
      </p>
      {notes.length > 0 ? (
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function AstroMoonCalendarAction({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-card-foreground">
        查看整月月相
      </summary>
      <div className="mt-4">
        <MoonPhaseCalendar
          latitudeWgs84={query.latitudeWgs84}
          longitudeWgs84={query.longitudeWgs84}
          timezone={result.calendarBasis.timezone}
        />
      </div>
    </details>
  );
}

function AstroInlineDefinition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

function GlowTopContext({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">朝霞晚霞专项判断</Badge>
            <Badge variant={dataReadinessBadgeVariant(result)}>
              {dataReadinessBadgeLabel(result)}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
            <Badge variant="info">
              置信度：{confidenceLabel(result.glowAnalysis.confidenceLevel)}
            </Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1120px]:flex min-[1120px]:flex-wrap min-[1120px]:gap-2">
            <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>更新时间：{formatDateTime(result.generatedAt)}</span>
            <span>数据状态：{weatherStatusLabel(result)}</span>
            <span>地形数据：{result.terrainAnalysis.dataSourceLabelZh}</span>
            <span>天文数据：{result.astroDataSourceLabelZh}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign("/glow");
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function GlowCoreDecision({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section className="glow-core-decision grid gap-3" data-glow-section="GlowCoreDecision">
      <SectionHeading
        title="核心判断"
        description="分开查看朝霞、晚霞、最佳霞光窗口和低云遮挡风险。"
        badge="确定性霞光模型"
      />
      <div className="grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-4">
        {cards.map((card) => (
          <PrimaryResultCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

function GlowDailyTrend({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly GlowDailyTrendItem[];
}) {
  return (
    <Card
      className="GlowDailyTrend glow-daily-trend p-4 shadow-sm"
      data-glow-section="GlowDailyTrend"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">逐日朝霞晚霞趋势</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {result.calendarBasis.horizonHours <= 24
              ? "仅展示未来24小时内可用的朝霞、晚霞和余晖窗口。"
              : "按每天的朝霞分、晚霞分、最佳窗口和主要风险横向比较。"}
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article
            key={item.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(150px,0.8fr)_minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(0,1.35fr)] min-[900px]:items-start"
          >
            <div className="min-w-0">
              <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.bestTargetLabel}</p>
            </div>
            <dl className="grid gap-1 text-sm">
              <GlowInlineDefinition label="朝霞机会" value={`${item.sunriseScore} 分`} />
              <GlowInlineDefinition label="晚霞机会" value={`${item.sunsetScore} 分`} />
              <GlowInlineDefinition label="低云遮挡" value={item.lowCloudRiskLabel} />
              <GlowInlineDefinition label="色彩云条件" value={item.colorCarrierLabel} />
            </dl>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">日出 / 日落窗口</p>
              <dl className="mt-1 grid gap-1 text-sm">
                <GlowInlineDefinition label="日出窗口" value={item.sunriseWindowLabel} />
                <GlowInlineDefinition label="日落窗口" value={item.sunsetWindowLabel} />
                <GlowInlineDefinition label="降水重叠" value={item.rainOverlapLabel} />
                <GlowInlineDefinition label="雨后开口" value={item.postRainOpeningLabel} />
              </dl>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.recommendationLabel === "不建议专程" ? "warning" : "default"}>
                  {item.recommendationLabel}
                </Badge>
                <Badge variant="muted">{item.riskNote}</Badge>
              </div>
              <p className="mt-2 text-sm font-semibold leading-6 text-card-foreground">
                最佳霞光窗口：{item.bestWindowLabel}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.keyReason}</p>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowTwilightSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="GlowTwilightSection glow-twilight-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">光线窗口</h2>
        <Badge variant="muted">{result.astroDataSourceLabelZh}</Badge>
      </div>
      {result.astroSummaries.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {result.astroSummaries.map((astro) => (
            <article
              key={astro.date}
              className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(150px,0.75fr)_repeat(3,minmax(180px,1fr))] min-[900px]:items-start"
            >
              <div>
                <h3 className="font-bold text-card-foreground">
                  {dateLabelForResultClient(result, astro.date)}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{astro.timezone}</p>
              </div>
              <dl className="grid gap-2 text-sm">
                <GlowInlineDefinition label="日出" value={formatOptionalTime(astro.sunrise)} />
                <GlowInlineDefinition label="日落" value={formatOptionalTime(astro.sunset)} />
              </dl>
              <dl className="grid gap-2 text-sm">
                <GlowInlineDefinition
                  label="民用晨光"
                  value={formatOptionalTime(astro.civilDawn)}
                />
                <GlowInlineDefinition
                  label="日出暖光"
                  value={formatDerivedWindow(astro.sunrise, shiftTime(astro.sunrise ?? "", 60))}
                />
                <GlowInlineDefinition
                  label="日落后余晖"
                  value={formatDerivedWindow(astro.sunset, astro.civilDusk)}
                />
              </dl>
              <dl className="grid gap-2 text-sm">
                <GlowInlineDefinition
                  label="蓝调时间"
                  value={formatDerivedWindow(astro.civilDusk, astro.nauticalDusk)}
                />
                <GlowInlineDefinition
                  label="天文晨昏"
                  value={`${formatOptionalTime(astro.astronomicalDawn)} / ${formatOptionalTime(
                    astro.astronomicalDusk,
                  )}`}
                />
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          缺少日出日落时间，无法生成精确霞光窗口。
        </p>
      )}
    </Card>
  );
}

function GlowWindowSection({
  windows,
}: {
  readonly windows: GlowForecastViewModel["glowWindows"];
}) {
  return (
    <Card className="GlowWindowSection glow-window-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">霞光拍摄窗口</h2>
        <Badge variant="muted">推荐拍摄 / 可观察 / 仅作备选 / 不建议</Badge>
      </div>
      {windows.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {windows.map((window) => (
            <li key={window.key} className="rounded-lg border border-border bg-muted p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={glowWindowCategoryBadge(window.categoryLabel)}>
                      {window.categoryLabel}
                    </Badge>
                    <h3 className="font-bold text-card-foreground">{window.label}</h3>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-accent">{window.timeRangeLabel}</p>
                </div>
                <Badge variant={badgeVariantForTone(window.tone)}>{window.score} 分</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {window.riskTags.map((tag) => (
                  <Badge
                    key={`${window.key}-${tag}`}
                    variant={tag.includes("降水") ? "warning" : "muted"}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{window.note}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          暂无明确霞光窗口，优先复核日出日落时间、云层分层和降水变化。
        </p>
      )}
    </Card>
  );
}

function GlowCloudStructureSection({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly GlowEvidenceViewItem[];
}) {
  return (
    <Card
      className="GlowCloudLayerSection glow-cloud-structure p-4 shadow-sm"
      data-glow-section="GlowCloudLayerSection"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">云层结构</h2>
        <Badge variant="muted">低云 / 中云 / 高云 / 色彩载体</Badge>
      </div>
      <dl className="mt-4 grid gap-2 text-sm min-[900px]:grid-cols-2 min-[1280px]:grid-cols-4">
        <GlowInlineDefinition
          label="色彩云条件"
          value={`${result.glowAnalysis.labels.colorCarrier}（${result.glowAnalysis.colorCarrierScore} 分）`}
        />
        <GlowInlineDefinition
          label="低云遮挡风险"
          value={`${result.glowAnalysis.labels.lowCloudObstruction}（${result.glowAnalysis.lowCloudObstructionRisk} 分）`}
        />
        <GlowInlineDefinition
          label="降水打断风险"
          value={`${glowRiskText(result.glowAnalysis.precipitationDisruptionRisk)}（${result.glowAnalysis.precipitationDisruptionRisk} 分）`}
        />
        <GlowInlineDefinition
          label="通透与色彩质量"
          value={`${scoreLabelFromNumber(result.glowAnalysis.visibilityColorQualityScore)}（${result.glowAnalysis.visibilityColorQualityScore} 分）`}
        />
      </dl>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowEvidenceSection({
  title,
  badgeLabel,
  items,
  dataSection,
}: {
  readonly title: string;
  readonly badgeLabel: string;
  readonly items: readonly GlowEvidenceViewItem[];
  readonly dataSection: string;
}) {
  return (
    <Card className={`${dataSection} p-4 shadow-sm`} data-glow-section={dataSection}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowLowCloudRiskSection({ result }: { readonly result: ForecastCalculationResult }) {
  const risk = result.glowAnalysis.lowCloudObstructionRisk;
  return (
    <Card className="GlowLowCloudRiskSection glow-low-cloud-risk p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">低云遮挡风险</h2>
        <Badge variant={risk >= 70 ? "danger" : risk >= 45 ? "warning" : "info"}>{risk} 分</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-3">
        <article className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-card-foreground">太阳方向</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            低云可能遮挡太阳方向，低云过厚可能导致无明显霞光或只剩白光。
          </p>
        </article>
        <article className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-card-foreground">色彩载体</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            中高云更适合作为霞光载体，低云更多用于判断遮挡和反差风险。
          </p>
        </article>
        <article className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-card-foreground">现场动作</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            若太阳方向被低云压住，优先寻找更高机位、侧逆光角度或转拍层峦与云缝光。
          </p>
        </article>
      </div>
    </Card>
  );
}

function GlowTerrainSection({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly GlowEvidenceViewItem[];
}) {
  const horizon = result.terrainAnalysis.horizonProfile;
  const terrainMissing =
    typeof horizon.sunriseHorizonAngle !== "number" ||
    typeof horizon.sunsetHorizonAngle !== "number";

  return (
    <Card className="GlowTerrainSection glow-terrain-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">地形遮挡参考</h2>
        <Badge variant="muted">{result.terrainAnalysis.dataSourceLabelZh}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-3">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className="mt-2 break-words text-xl font-bold text-card-foreground">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[900px]:grid-cols-3">
        <CompactDefinition
          label="日出遮挡角"
          value={formatAngle(result.terrainAnalysis.horizonProfile.sunriseHorizonAngle)}
        />
        <CompactDefinition
          label="日落遮挡角"
          value={formatAngle(result.terrainAnalysis.horizonProfile.sunsetHorizonAngle)}
        />
        <CompactDefinition
          label="遮挡方向"
          value={formatBlockedDirections(result.terrainAnalysis.horizonProfile.blockedDirectionsZh)}
        />
      </dl>
      {terrainMissing ? (
        <p className="mt-3 rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          暂缺地形遮挡细节，正式地形数据接入后将提升判断精度。
        </p>
      ) : null}
    </Card>
  );
}

function GlowAdviceSection({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly string[];
}) {
  const practicalItems = glowPracticalAdviceItems(result, items);

  return (
    <Card className="GlowAdviceSection glow-advice-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">拍摄建议</h2>
        <Badge variant="muted">提前到达 / 方向 / 备选 / 风险</Badge>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
        {practicalItems.map((item) => (
          <li key={item} className="rounded-lg border border-border bg-muted px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GlowRiskSection({
  result,
  risks,
}: {
  readonly result: ForecastCalculationResult;
  readonly risks: readonly string[];
}) {
  const runtimeRisks = result.riskFlags.filter((risk) =>
    ["precipitation", "visibility", "wind"].includes(risk.key),
  );

  return (
    <Card className="GlowRiskSection glow-risk-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">风险提示</h2>
        <Badge variant="muted">低云 / 降水 / 通透 / 风</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {risks.map((risk) => (
          <article key={risk} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-sm leading-6 text-muted-foreground">{risk}</p>
          </article>
        ))}
        {runtimeRisks.map((risk) => (
          <article key={risk.key} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-card-foreground">{risk.label}</h3>
              <Badge variant={risk.level === "high" ? "danger" : "warning"}>
                {riskLevelText(risk.level)}风险
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{risk.description}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowBackupPlanSection({ plans }: { readonly plans: readonly GlowBackupPlan[] }) {
  return (
    <Card className="GlowBackupPlanSection glow-backup-plan p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">备选拍摄方案</h2>
        <Badge variant="muted">霞光失败时</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.condition} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">{plan.condition}</p>
            <h3 className="mt-2 font-bold text-card-foreground">{plan.action}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowDataStatusSection({
  result,
  notes,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly notes: readonly string[];
  readonly dataNotice: string;
}) {
  return (
    <Card className="GlowDataStatusSection glow-data-status p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态 / 数据缺失说明</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[900px]:grid-cols-3">
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <CompactDefinition label="天文数据" value={result.astroDataSourceLabelZh} />
      </dl>
      <p className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm leading-6 text-muted-foreground">
        {dataNotice}
      </p>
      {notes.length > 0 ? (
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function GlowInlineDefinition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

function CloudSeaTopResultHeader({
  query,
  hero,
  result,
  terrainContext,
}: {
  readonly query: ForecastQueryInput;
  readonly hero: CloudSeaHeroConclusionView;
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  return (
    <ForecastResultHeader
      target="cloud_sea"
      className="CloudSeaTopResultHeader grid gap-4 min-[880px]:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] min-[880px]:items-stretch"
      dataCloudSeaSection="CloudSeaTopResultHeader"
    >
      <CloudSeaHeroConclusion
        query={query}
        hero={hero}
        result={result}
        terrainContext={terrainContext}
      />
      <CloudSeaScoreCard hero={hero} result={result} terrainContext={terrainContext} />
    </ForecastResultHeader>
  );
}

function CloudSeaHeroConclusion({
  query,
  hero,
  result,
  terrainContext,
}: {
  readonly query: ForecastQueryInput;
  readonly hero: CloudSeaHeroConclusionView;
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  return (
    <ForecastResultSummaryCard
      target="cloud_sea"
      className="CloudSeaHeroConclusion cloud-sea-hero-conclusion h-full p-5 shadow-sm"
    >
      <div className="flex h-full min-w-0 flex-col justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{terrainContext.vocabulary.heroBadgeLabel}</Badge>
            <Badge variant={cloudSeaDataBadgeVariant(result)}>
              {cloudSeaDataBadgeLabel(result)}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {hero.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {hero.conclusion}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs leading-5 text-muted-foreground">
            <span>时间范围：{hero.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>当前置信度：{hero.confidenceLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.assign("/cloud-sea");
            }}
          >
            重新选择地点
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.assign(buildForecastUrlFromForecastQuery(query));
            }}
          >
            重新判断
          </Button>
        </div>
      </div>
    </ForecastResultSummaryCard>
  );
}

function buildForecastUrlFromForecastQuery(query: ForecastQueryInput): string {
  const params = new URLSearchParams({
    name: query.name,
    source: query.source,
    lat: String(query.latitudeGcj02 ?? query.latitudeWgs84),
    lng: String(query.longitudeGcj02 ?? query.longitudeWgs84),
    latGcj02: String(query.latitudeGcj02 ?? query.latitudeWgs84),
    lngGcj02: String(query.longitudeGcj02 ?? query.longitudeWgs84),
    latWgs84: String(query.latitudeWgs84),
    lngWgs84: String(query.longitudeWgs84),
    latitudeWgs84: String(query.latitudeWgs84),
    longitudeWgs84: String(query.longitudeWgs84),
    horizon: query.horizon,
    target: query.target,
  });

  setOptionalForecastQueryParam(params, "coordinateSource", query.coordinateSource);
  setOptionalForecastQueryParam(params, "timezone", query.timezone);
  setOptionalForecastQueryParam(params, "elevationMeters", query.elevationMeters);
  setOptionalForecastQueryParam(params, "elevationSource", query.elevationSource);
  setOptionalForecastQueryParam(params, "elevationConfidence", query.elevationConfidence);
  setOptionalForecastQueryParam(params, "locationId", query.locationId);
  setOptionalForecastQueryParam(params, "photoSpotId", query.photoSpotId);

  return `/forecast?${params.toString()}`;
}

function setOptionalForecastQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
) {
  if (value === undefined || value === null) {
    return;
  }
  const normalized = String(value).trim();
  if (normalized.length > 0) {
    params.set(key, normalized);
  }
}

function CloudSeaScoreCard({
  hero,
  result,
  terrainContext,
}: {
  readonly hero: CloudSeaHeroConclusionView;
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const score = clampScorePercent(result.cloudSeaAnalysis.shootableScore);

  return (
    <ForecastScoreCard
      target="cloud_sea"
      className="CloudSeaScoreCard grid h-full content-between gap-4 p-5 shadow-sm"
      dataCloudSeaSection="CloudSeaScoreCard"
      label={terrainContext.vocabulary.scoreCardLabel}
      score={score}
      badgeLabel={hero.recommendationLabel}
      badgeVariant={recommendationBadgeVariant(hero.recommendationLabel)}
      summary={cloudSeaTerrainSummary(result, terrainContext)}
    />
  );
}

function cloudSeaDataBadgeLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real" && successfulRealWeatherSources(result).length >= 2) {
    return "判断依据较完整";
  }
  if (result.weatherDataMode === "real") {
    return "基础预报可用";
  }
  return "数据需复核";
}

function cloudSeaDataBadgeVariant(result: ForecastCalculationResult): "success" | "warning" {
  return result.weatherDataMode === "real" && successfulRealWeatherSources(result).length >= 2
    ? "success"
    : "warning";
}

function CloudSeaMetricCards({
  hero,
  result,
  cards,
  riskSummary,
  terrainContext,
}: {
  readonly hero: CloudSeaHeroConclusionView;
  readonly result: ForecastCalculationResult;
  readonly cards: readonly ForecastResultCard[];
  readonly riskSummary: readonly ForecastResultSectionItem[];
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const decisionCards = cloudSeaDecisionCards(hero, result, cards, riskSummary, terrainContext);

  return (
    <ForecastMetricGrid
      target="cloud_sea"
      className="cloud-sea-core-metrics grid items-stretch gap-3 sm:grid-cols-2 min-[1180px]:grid-cols-3"
      dataCloudSeaSection="CloudSeaCoreMetrics"
    >
      {decisionCards.map((card) => (
        <ForecastMetricCard key={card.key} target="cloud_sea" dataCloudSeaMetricCard>
          <PrimaryResultCard card={card} />
        </ForecastMetricCard>
      ))}
    </ForecastMetricGrid>
  );
}

function cloudSeaDecisionCards(
  hero: CloudSeaHeroConclusionView,
  result: ForecastCalculationResult,
  cards: readonly ForecastResultCard[],
  riskSummary: readonly ForecastResultSectionItem[],
  terrainContext: CloudSeaTerrainContext,
): readonly ForecastResultCard[] {
  const mainRisk = pickMainRisk(result);
  const formation = cards.find((card) => card.key.includes("formation")) ?? cards[0];
  const shootable = cards.find((card) => card.key.includes("shootable")) ?? cards[1];
  const whiteout = cards.find((card) => card.moduleKey === "whiteoutRisk") ?? cards[2];
  const vocabulary = terrainContext.vocabulary;

  return [
    textCard(
      "cloud-sea-recommendation",
      "recommendation",
      "推荐等级",
      hero.recommendationLabel,
      hero.conclusion,
      cloudSeaRecommendationTone(hero.recommendationLabel),
    ),
    textCard(
      "cloud-sea-best-window",
      "bestWindow",
      vocabulary.bestWindowMetricLabel,
      hero.bestWindowLabel,
      terrainContext.shouldDowngradeCloudSeaWording
        ? "按低云、晨雾、云层开口和通透度安排顺带观察，临近出发前复核近地雾气。"
        : "优先以主窗口安排到场和构图，临近出发前复核低云高度、能见度和降水。",
      "accent",
    ),
    textCard(
      "cloud-sea-arrival",
      "recommendation",
      "建议到达",
      hero.arrivalLabel,
      terrainContext.shouldDowngradeCloudSeaWording
        ? "到达后先观察近地雾气、低云是否贴地、远山层次和通透度。"
        : "到达后先观察云顶高度、低云厚度和远山层次，再决定是否继续守远景机位。",
      result.cloudSeaAnalysis.shootableScore >= 65 ? "primary" : "accent",
    ),
    scoreCard(
      "cloud-sea-formation-shootable",
      "cloudSea",
      vocabulary.formationShootableMetricLabel,
      `${formation?.value ?? result.cloudSeaAnalysis.labels.formationOpportunity} / ${
        shootable?.value ?? result.cloudSeaAnalysis.labels.shootableOpportunity
      }`,
      `${result.cloudSeaAnalysis.formationScore} 分 / ${result.cloudSeaAnalysis.shootableScore} 分。${userFacingResultText(
        cloudSeaTerrainAwareText(
          firstText(
            result.cloudSeaAnalysis.opportunityReasons,
            terrainContext.shouldDowngradeCloudSeaWording
              ? "低云、晨雾、云层开口、湿度、露点差、风速和地形共同决定观察参考。"
              : "低云、湿度、露点差、风速和地形共同决定云海机会。",
          ),
          terrainContext,
        ),
      )}`,
      result.cloudSeaAnalysis.shootableScore >= 65 ? "primary" : "accent",
      result.cloudSeaAnalysis.shootableScore,
    ),
    scoreCard(
      "cloud-sea-whiteout-risk",
      "whiteoutRisk",
      vocabulary.obstructionRiskLabel,
      whiteout?.value ?? result.cloudSeaAnalysis.labels.whiteoutRisk,
      userFacingResultText(
        cloudSeaTerrainAwareText(
          firstText(result.cloudSeaAnalysis.whiteoutReasons, "低云接近机位时可能遮挡视野。"),
          terrainContext,
        ),
      ),
      result.cloudSeaAnalysis.whiteoutRiskScore >= 70
        ? "danger"
        : result.cloudSeaAnalysis.whiteoutRiskScore >= 45
          ? "accent"
          : "info",
      result.cloudSeaAnalysis.whiteoutRiskScore,
    ),
    textCard(
      "cloud-sea-main-risk",
      "risk",
      "主要风险",
      mainRisk.label,
      mainRisk.detail || riskSummary[0]?.detail || "出行前复核最新天气、道路和景区开放信息。",
      mainRisk.value?.includes("高")
        ? "danger"
        : mainRisk.value?.includes("中")
          ? "accent"
          : "muted",
    ),
  ];
}

function cloudSeaRecommendationTone(label: string): ForecastResultCardTone {
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("谨慎") || label.includes("备选") || label.includes("观察")) {
    return "accent";
  }
  return "primary";
}

function cloudSeaTerrainSummary(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): string {
  if (
    terrainContext.shouldDowngradeCloudSeaWording ||
    terrainContext.elevationMeters === undefined
  ) {
    return terrainContext.terrainNoteZh;
  }
  const profile = result.terrainAnalysis.terrainProfile;
  const support = result.cloudSeaAnalysis.terrainSupport;
  const elevation =
    profile.locationElevation ?? profile.elevationMeters ?? support.selectedSpotElevationMeters;
  const relief = profile.localReliefMeters ?? profile.elevationDiff5km ?? support.localReliefMeters;
  const elevationText = isFiniteNumber(elevation)
    ? `机位海拔约 ${Math.round(elevation)} 米`
    : "机位海拔暂未确认";
  const reliefText = isFiniteNumber(relief)
    ? `周边高差约 ${Math.round(relief)} 米，${support.level === "高" ? "支持云海观察" : "需结合现场云雾高度复核"}。`
    : "周边高差暂未计算。";

  return `地形参考：${elevationText}，${reliefText}`;
}

function clampScorePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function CloudSeaNearTermWeatherSection({
  result,
  terrainContext,
}: {
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const current = result.currentWeather;
  const clothing = result.clothingGuide;
  const firstDay = result.dailySummaries[0]?.weather;
  const timeContext = buildNearTermWeatherTimeContext(result);
  const auxiliaryNotice = cloudSeaAuxiliaryDataNotice(result);

  return (
    <CurrentWeatherCards
      target="cloud_sea"
      className="CloudSeaNearTermWeather grid gap-3"
      dataCloudSeaSection="CloudSeaNearTermWeather"
      dataTestId="cloud-sea-near-term-weather"
    >
      <SectionHeading
        title={`当前与近时段天气（${timeContext.sectionWindowLabel}）`}
        description={`${timeContext.currentBasisLabel}；${timeContext.nearTermBasisLabel}。以下指标只按这个时间范围解释，用于复核${
          terrainContext.shouldDowngradeCloudSeaWording
            ? "低云、晨雾、低云遮挡、降水和现场装备"
            : "云海、白墙、降水和现场装备"
        }。`}
        badge={cloudSeaDataBadgeLabel(result)}
      />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <CompactInfoCard
          title="气温与体感"
          timeBasis={timeContext.currentBasisLabel}
          badge={comfortLevelLabel(clothing.comfortLevel)}
          value={mountainTemperatureValue(current, firstDay, result)}
          detail={`${dailyTemperatureRangeText(firstDay, result)}，${temperatureActionText(
            current,
            firstDay,
            result,
          )} ${terrainCorrectionUserNote(result, current, firstDay)}`}
        />
        <CompactInfoCard
          title="云层与能见度"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={`通透度 ${transparencyGradeLabel(firstDay?.transparencyGrade, result.scores.transparency.score)}`}
          value={`云量 ${formatPercentNumber(current?.cloudTotal ?? firstDay?.cloudTotal)}`}
          detail={`能见度 ${formatKilometers(
            current?.rawVisibilityKm ??
              current?.visibility ??
              firstDay?.rawVisibilityKm ??
              firstDay?.visibility,
          )}，低云 ${formatPercentNumber(
            current?.cloudLow ?? firstDay?.cloudLow,
          )}。${cloudVisibilityActionText(result)}`}
        />
        <CompactInfoCard
          title="风与降水"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={formatWindWithGust(
            current?.windSpeed ?? firstDay?.windSpeed,
            current?.windDirection ?? firstDay?.windDirection,
            current?.windGust ?? firstDay?.windGust,
          )}
          value={precipitationDisplayValue(current ?? firstDay)}
          detail={`${precipitationDisplayDetail(current ?? firstDay)}。${windPrecipitationActionText(result)}`}
        />
        <CompactInfoCard
          title="湿度与露点"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={`湿度 ${formatPercentNumber(current?.humidity ?? firstDay?.humidity)}`}
          value={`露点差 ${formatTemperatureDelta(current?.dewPointSpread ?? firstDay?.dewPointSpread)}`}
          detail={`${dewPointActionText(current?.dewPointSpread ?? firstDay?.dewPointSpread)} ${auxiliaryNotice}`}
        />
        <CompactInfoCard
          title="穿衣与装备"
          timeBasis={timeContext.tripBasisLabel}
          badge={clothing.titleZh}
          value={packingMainValue(clothing)}
          detail={packingDetail(clothing)}
        />
      </div>
    </CurrentWeatherCards>
  );
}

function cloudSeaAuxiliaryDataNotice(result: ForecastCalculationResult): string {
  if (result.weatherMissingFields.length > 0 || result.weatherMissingDataNotes.length > 0) {
    return "部分辅助指标缺失，建议结合现场云层变化复核。";
  }
  if (result.weatherDataMode !== "real") {
    return "天气数据需复核，出行前重新确认临近预报。";
  }
  return "云层与能见度已纳入判断。";
}

type CloudSeaWindowCategoryKey = "sunrise" | "sunset" | "lit" | "lowLight";

type CloudSeaWindowCategoryDefinition = {
  readonly key: CloudSeaWindowCategoryKey;
  readonly title: string;
  readonly noWindowIssue: string;
  readonly noWindowAction: string;
};

type CloudSeaWindowCardData = {
  readonly key: CloudSeaWindowCategoryKey;
  readonly title: string;
  readonly badgeLabel: string;
  readonly badgeVariant: BadgeVariant;
  readonly chanceText: string;
  readonly scoreText: string;
  readonly scoreTone: ForecastResultCardTone;
  readonly primaryWindow: string;
  readonly backupWindow: string;
  readonly mainIssue: string;
  readonly action: string;
};

function cloudSeaWindowCategoryDefinitions(
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaWindowCategoryDefinition[] {
  const labels = terrainContext.vocabulary.windowCategories;
  return [
    { key: "sunrise", ...labels.sunrise },
    { key: "sunset", ...labels.sunset },
    { key: "lit", ...labels.lit },
    { key: "lowLight", ...labels.lowLight },
  ];
}

function CloudSeaWindowCardsSection({
  windows,
  terrainContext,
}: {
  readonly windows: readonly CloudSeaWindowItem[];
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const cards = buildCloudSeaWindowCardData(windows, terrainContext);

  return (
    <section
      className="CloudSeaWindowCards cloud-sea-window-cards grid gap-3"
      data-cloud-sea-section="CloudSeaWindowCards"
      data-testid="cloud-sea-window-cards-section"
    >
      <SectionHeading
        title={terrainContext.vocabulary.windowSectionTitle}
        description={terrainContext.vocabulary.windowSectionDescription}
        badge={terrainContext.vocabulary.windowSectionBadge}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.key}
            className="grid h-full content-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
            data-testid="cloud-sea-window-category-card"
            data-cloud-sea-window-category={card.key}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-bold text-card-foreground">{card.title}</h3>
              <Badge variant={card.badgeVariant}>{card.badgeLabel}</Badge>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">机会指数 / 概率评分</p>
              <p className={cn("mt-1 text-2xl font-bold leading-8", cardToneText(card.scoreTone))}>
                {card.scoreText}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{card.chanceText}</p>
            </div>

            <dl className="grid gap-1.5 text-xs leading-5 text-muted-foreground">
              <CloudSeaWindowCardLine label="推荐窗口" value={card.primaryWindow} />
              <CloudSeaWindowCardLine label="备选窗口" value={card.backupWindow} />
              <CloudSeaWindowCardLine label="主要限制" value={card.mainIssue} />
            </dl>

            <p className="text-sm leading-6 text-card-foreground">
              <span className="font-semibold">建议：</span>
              {card.action}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CloudSeaWindowCardLine({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="inline font-semibold text-card-foreground">{label}：</dt>
      <dd className="inline break-words">{value}</dd>
    </div>
  );
}

function buildCloudSeaWindowCardData(
  windows: readonly CloudSeaWindowItem[],
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaWindowCardData[] {
  const sortedWindows = [...windows].sort(compareCloudSeaWindowPriority);

  return cloudSeaWindowCategoryDefinitions(terrainContext).map((definition) => {
    const candidates = sortedWindows.filter((item) =>
      cloudSeaWindowMatchesCategory(item, definition.key),
    );
    return cloudSeaWindowCategoryCard(definition, candidates, terrainContext);
  });
}

function cloudSeaWindowCategoryCard(
  definition: CloudSeaWindowCategoryDefinition,
  candidates: readonly CloudSeaWindowItem[],
  terrainContext: CloudSeaTerrainContext,
): CloudSeaWindowCardData {
  const primary = candidates[0];
  const backup = candidates.find((candidate) => candidate.key !== primary?.key);

  if (!primary) {
    return {
      key: definition.key,
      title: definition.title,
      badgeLabel: "暂无明确窗口",
      badgeVariant: "warning",
      chanceText: "暂无明确评分",
      scoreText: "暂无评分",
      scoreTone: "muted",
      primaryWindow: "暂无明确窗口",
      backupWindow: "等待下一次预报更新",
      mainIssue: definition.noWindowIssue,
      action: definition.noWindowAction,
    };
  }

  return {
    key: definition.key,
    title: definition.title,
    badgeLabel: cloudSeaWindowCategoryBadgeLabel(definition.key, primary),
    badgeVariant: cloudSeaWindowCategoryBadgeVariant(definition.key, primary),
    chanceText: primary.cloudSeaChance,
    scoreText: `${primary.score} 分`,
    scoreTone: cloudSeaWindowCardTone(definition.key, primary),
    primaryWindow: primary.timeRangeLabel,
    backupWindow: backup?.timeRangeLabel ?? "暂无数据支撑的备选窗口",
    mainIssue: cloudSeaWindowMainIssue(definition.key, primary, terrainContext),
    action: cloudSeaWindowCardAction(definition.key, primary, terrainContext),
  };
}

function compareCloudSeaWindowPriority(
  left: CloudSeaWindowItem,
  right: CloudSeaWindowItem,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return left.startTime.localeCompare(right.startTime);
}

function cloudSeaWindowMatchesCategory(
  item: CloudSeaWindowItem,
  category: CloudSeaWindowCategoryKey,
): boolean {
  if (category === "sunrise") {
    return isSunriseCloudSeaWindow(item);
  }
  if (category === "sunset") {
    return isSunsetCloudSeaWindow(item);
  }
  if (category === "lowLight") {
    return isLowLightCloudSeaWindow(item);
  }
  return isLitCloudSeaWindow(item);
}

function isSunriseCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const text = cloudSeaWindowSearchText(item);
  const startHour = localHourFromIso(item.startTime);
  return (
    item.lightPhase === "dawn" ||
    item.lightPhase === "sunrise" ||
    /清晨|早晨|晨光|日出|朝霞/.test(text) ||
    (startHour !== undefined && startHour >= 4 && startHour < 9)
  );
}

function isSunsetCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const text = cloudSeaWindowSearchText(item);
  const startHour = localHourFromIso(item.startTime);
  return (
    item.lightPhase === "sunset" ||
    item.lightPhase === "blue_hour" ||
    /傍晚|黄昏|日落|晚霞|余晖/.test(text) ||
    (startHour !== undefined && startHour >= 16 && startHour < 20.5)
  );
}

function isLowLightCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const text = cloudSeaWindowSearchText(item);
  const startHour = localHourFromIso(item.startTime);
  return (
    item.lightPhase === "deep_night" ||
    item.lightPhase === "astronomical_night" ||
    /夜间|凌晨|无光|低光|深夜/.test(text) ||
    (startHour !== undefined && (startHour < 4 || startHour >= 20.5))
  );
}

function isLitCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const startHour = localHourFromIso(item.startTime);
  return (
    !isLowLightCloudSeaWindow(item) &&
    (item.lightPhase === "dawn" ||
      item.lightPhase === "sunrise" ||
      item.lightPhase === "daytime" ||
      item.lightPhase === "sunset" ||
      item.lightPhase === "blue_hour" ||
      isSunriseCloudSeaWindow(item) ||
      isSunsetCloudSeaWindow(item) ||
      (startHour !== undefined && startHour >= 4 && startHour < 20.5))
  );
}

function cloudSeaWindowSearchText(item: CloudSeaWindowItem): string {
  return `${item.label} ${item.timeRangeLabel} ${item.note} ${item.riskTag}`;
}

function localHourFromIso(value: string): number | undefined {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) + Number(match[2]) / 60;
}

function cloudSeaWindowCategoryBadgeLabel(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
): string {
  if (category === "lowLight") {
    return "低光观察";
  }
  if (item.score >= 70) {
    return "优先守拍";
  }
  if (item.score >= 50) {
    return "可作备选";
  }
  return "谨慎观察";
}

function cloudSeaWindowCategoryBadgeVariant(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
): BadgeVariant {
  if (category === "lowLight" || item.score < 55 || item.tone === "danger") {
    return "warning";
  }
  if (item.score >= 70) {
    return "default";
  }
  return "accent";
}

function cloudSeaWindowCardTone(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
): ForecastResultCardTone {
  if (category === "lowLight" || item.score < 55) {
    return "accent";
  }
  return item.score >= 70 ? "primary" : "accent";
}

function cloudSeaWindowMainIssue(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
  terrainContext: CloudSeaTerrainContext,
): string {
  const basis = terrainContext.shouldDowngradeCloudSeaWording
    ? `低云遮挡：${item.whiteoutRisk}；雨后开口：${item.rainInterference}。`
    : `白墙风险：${item.whiteoutRisk}；雨后开口：${item.rainInterference}。`;
  if (category === "lowLight") {
    return `${basis}光线不足，不适合作为常规明亮风光主窗口。`;
  }
  return basis;
}

function cloudSeaWindowCardAction(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
  terrainContext: CloudSeaTerrainContext,
): string {
  if (category === "lowLight") {
    return terrainContext.shouldDowngradeCloudSeaWording
      ? "仅作雾气层次、夜景氛围或现场观察，不作为正常明亮风光主窗口。"
      : "仅作氛围、剪影、层次或现场观察，不作为正常明亮风光主窗口。";
  }
  return item.actionSuggestion;
}

type ProfessionalHourlyFilterMode = "all" | "cloudSea" | "morning" | "risk";
type ProfessionalHourlyRow = NonNullable<
  ForecastCalculationResult["professionalHourlyData"]
>[number];
type CloudSeaAnalysisWindowLike =
  ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number];

type ProfessionalHourlyFilterDefinition = {
  readonly mode: ProfessionalHourlyFilterMode;
  readonly label: string;
};

function professionalHourlyFiltersForContext(
  terrainContext: CloudSeaTerrainContext,
): readonly ProfessionalHourlyFilterDefinition[] {
  return [
    { mode: "all", label: "全部小时" },
    { mode: "cloudSea", label: terrainContext.vocabulary.professionalCloudSeaFilterLabel },
    { mode: "morning", label: "只看清晨窗口" },
    { mode: "risk", label: "只看有风险时段" },
  ];
}

function CloudSeaProfessionalHourlyDataPanel({
  result,
  terrainContext,
}: {
  readonly result: ForecastCalculationResult;
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const rows = result.professionalHourlyData ?? [];
  const basis = result.professionalHourlyDataTimeBasis;
  const [expanded, setExpanded] = useState(true);
  const [filterMode, setFilterMode] = useState<ProfessionalHourlyFilterMode>(() =>
    defaultProfessionalHourlyFilter(result),
  );

  useEffect(() => {
    setFilterMode(defaultProfessionalHourlyFilter(result));
  }, [result.forecastStart, result.forecastEnd, result.generatedAt]);

  const filteredRows = useMemo(
    () => filterProfessionalHourlyRows(rows, result, filterMode),
    [filterMode, result, rows],
  );

  if (!basis || rows.length === 0 || !basis.startTime || !basis.endTime) {
    return null;
  }

  const timeStepLabel = basis.stepMinutes === 60 ? "逐小时" : `${basis.stepMinutes} 分钟`;
  const professionalHourlyFilters = professionalHourlyFiltersForContext(terrainContext);
  const activeFilterLabel =
    professionalHourlyFilters.find((filter) => filter.mode === filterMode)?.label ?? "全部小时";
  const missingHeaderNote = professionalHourlyMissingHeaderNote(rows, basis);
  const incompleteFieldNote = professionalHourlyIncompleteFieldNote(rows, basis);
  const temperatureColumnLabel = professionalTemperatureColumnLabel(rows, basis);

  return (
    <Card
      className="CloudSeaProfessionalHourlyData cloud-sea-professional-hourly-data p-4 shadow-sm"
      data-cloud-sea-section="CloudSeaProfessionalHourlyData"
      data-testid="professional-hourly-data"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-card-foreground">专业小时数据</h2>
            <Badge variant="accent">专业参考</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {terrainContext.vocabulary.professionalDescription}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "收起小时表" : "展开小时表"}
        </Button>
      </div>

      <dl className="mt-4 grid gap-2 rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-muted-foreground min-[760px]:grid-cols-4">
        <CompactDefinition
          label="有效时间"
          value={`${formatFullDateTimeForTimezone(
            basis.startTime,
            basis.timezone,
          )} – ${formatFullDateTimeForTimezone(basis.endTime, basis.timezone)}`}
        />
        <CompactDefinition label="时间步长" value={timeStepLabel} />
        <CompactDefinition label="时区" value={basis.timezone} />
        <CompactDefinition
          label="温度口径"
          value={professionalTemperatureBasisLabel(basis.temperatureBasis)}
        />
        <CompactDefinition
          label="云量口径"
          value={professionalCloudLayerBasisLabel(basis.cloudLayerBasis)}
        />
        {missingHeaderNote ? (
          <CompactDefinition label="缺失说明" value={missingHeaderNote} />
        ) : null}
      </dl>
      {incompleteFieldNote && incompleteFieldNote !== missingHeaderNote ? (
        <p className="mt-3 rounded-lg border border-warning/40 bg-accent/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {incompleteFieldNote}
        </p>
      ) : null}

      {!expanded ? (
        <CloudSeaHourlyFocusPreview rows={filteredRows.slice(0, 4)} timezone={basis.timezone} />
      ) : null}

      <div
        className={cn("mt-4 grid gap-3", !expanded && "hidden")}
        data-professional-hourly-expanded={expanded ? "true" : "false"}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="专业小时数据筛选">
            {professionalHourlyFilters.map((filter) => (
              <button
                key={filter.mode}
                type="button"
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  filterMode === filter.mode
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground",
                )}
                onClick={() => {
                  setFilterMode(filter.mode);
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          当前筛选：{activeFilterLabel}，显示 {filteredRows.length} / {rows.length} 小时。
          {terrainContext.vocabulary.professionalUsageText}
          最终出行仍需结合临近预报和现场观测。
        </p>

        <div
          className="max-w-full overflow-x-auto rounded-lg border border-border bg-card"
          data-cloud-sea-professional-table-scroll="true"
        >
          <table className="w-full min-w-[1280px] border-collapse text-left text-[12px] leading-5">
            <thead className="bg-muted text-xs text-muted-foreground">
              <tr>
                {[
                  "日期",
                  "时间",
                  "天气",
                  terrainContext.vocabulary.professionalSignalColumnLabel,
                  "总云量 %",
                  "高云量 %",
                  "中云量 %",
                  "低云量 %",
                  temperatureColumnLabel,
                  "露点 °C",
                  "露点差 °C",
                  "湿度 %",
                  "降水 mm / 降水概率 %",
                  "能见度 km",
                  "风速 m/s",
                  "风向",
                ].map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap border-b border-border px-2 py-2 font-semibold",
                      index === 0 && "sticky left-0 z-20 bg-muted",
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <CloudSeaProfessionalHourlyRow
                    key={row.time}
                    row={row}
                    timezone={basis.timezone}
                  />
                ))
              ) : (
                <tr>
                  <td
                    colSpan={16}
                    className="border-t border-border px-3 py-4 text-center text-sm text-muted-foreground"
                  >
                    当前筛选下暂无小时数据，请切换上方筛选复核完整预报。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function CloudSeaProfessionalHourlyRow({
  row,
  timezone,
}: {
  readonly row: ProfessionalHourlyRow;
  readonly timezone: string;
}) {
  const signal = row.cloudSeaSignal;
  const weatherText = providerNeutralProfessionalWeatherText(row.weatherText) ?? "—";
  const weatherGlyph = weatherGlyphForProfessionalHour(row, weatherText);

  return (
    <tr className="odd:bg-card even:bg-muted/35" data-professional-hourly-row={row.time}>
      <ProfessionalHourlyCell
        cell="date"
        className="sticky left-0 z-10 bg-inherit font-semibold text-card-foreground"
      >
        {row.dateLabel || formatProfessionalDate(row.time, timezone)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="time" className="font-semibold text-card-foreground">
        {row.timeLabel || formatProfessionalTime(row.time, timezone)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="weather">
        <span className="inline-flex items-center gap-1.5">
          {weatherGlyph ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[11px] font-bold text-primary">
              {weatherGlyph}
            </span>
          ) : null}
          <span>{weatherText}</span>
        </span>
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="signal">
        <Badge variant={professionalSignalBadgeVariant(signal)}>{signal}</Badge>
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="cloud-total"
        className={professionalHourlyToneClass(row.cloudTotalPercent, "cloud-total")}
      >
        {formatProfessionalPercent(row.cloudTotalPercent)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="cloud-high">
        {formatProfessionalPercent(row.cloudHighPercent)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="cloud-mid">
        {formatProfessionalPercent(row.cloudMidPercent)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="cloud-low"
        className={professionalHourlyToneClass(row.cloudLowPercent, "cloud-low")}
      >
        {formatProfessionalPercent(row.cloudLowPercent)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="temperature" dataBasis={row.temperatureBasis}>
        {formatProfessionalTemperature(row.displayedTemperatureC)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="dew-point">
        {formatProfessionalTemperature(row.dewPointC)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="dew-point-spread"
        className={professionalHourlyToneClass(row.dewPointSpreadC, "dew-point-spread")}
      >
        {formatProfessionalTemperatureDelta(row.dewPointSpreadC)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="humidity"
        className={professionalHourlyToneClass(row.relativeHumidityPercent, "humidity")}
      >
        {formatProfessionalPercent(row.relativeHumidityPercent)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="precipitation"
        className={
          professionalHourlyHasPrecipitation(row)
            ? "bg-accent/10 font-semibold text-accent"
            : undefined
        }
      >
        {formatProfessionalPrecipitation(row)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="visibility"
        className={professionalHourlyToneClass(row.visibilityMeters, "visibility")}
      >
        {formatProfessionalVisibility(row.visibilityMeters)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="wind-speed"
        className={professionalHourlyToneClass(row.windSpeedMs, "wind-speed")}
      >
        {formatProfessionalWindSpeed(row.windSpeedMs)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="wind-direction">
        {formatProfessionalWindDirection(row.windDirectionDeg)}
      </ProfessionalHourlyCell>
    </tr>
  );
}

function CloudSeaHourlyFocusPreview({
  rows,
  timezone,
}: {
  readonly rows: readonly ProfessionalHourlyRow[];
  readonly timezone: string;
}) {
  return (
    <div className="mt-3 grid gap-2" data-cloud-sea-hourly-preview="true">
      <p className="text-xs font-semibold text-muted-foreground">默认聚焦云海窗口附近小时</p>
      {rows.length > 0 ? (
        <div className="grid gap-2 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
          {rows.map((row) => (
            <div key={row.time} className="rounded-lg border border-border bg-muted px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-card-foreground">
                  {row.timeLabel || formatProfessionalTime(row.time, timezone)}
                </p>
                <Badge variant={professionalSignalBadgeVariant(row.cloudSeaSignal)}>
                  {row.cloudSeaSignal}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                低云 {formatProfessionalPercent(row.cloudLowPercent)} · 湿度{" "}
                {formatProfessionalPercent(row.relativeHumidityPercent)} · 能见度{" "}
                {formatProfessionalVisibility(row.visibilityMeters)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          当前窗口附近暂无可展示小时，展开后可查看完整小时表。
        </p>
      )}
    </div>
  );
}

function professionalTemperatureBasisLabel(
  basis: NonNullable<
    ForecastCalculationResult["professionalHourlyDataTimeBasis"]
  >["temperatureBasis"],
): string {
  if (basis === "terrain_adjusted") {
    return "机位海拔修正后";
  }
  if (basis === "raw_grid") {
    return "原始格点";
  }
  return "暂无";
}

function professionalCloudLayerBasisLabel(
  basis: NonNullable<
    ForecastCalculationResult["professionalHourlyDataTimeBasis"]
  >["cloudLayerBasis"],
): string {
  if (basis === "explicit_layers") {
    return "总云量 + 低/中/高云分层";
  }
  if (basis === "total_only") {
    return "仅总云量";
  }
  if (basis === "partial_layers") {
    return "部分字段缺失";
  }
  return "暂无";
}

function professionalTemperatureColumnLabel(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
): string {
  const rowBasis = rows.find(
    (row) => row.temperatureBasis === "terrain_adjusted",
  )?.temperatureBasis;
  const effectiveBasis = rowBasis ?? basis.temperatureBasis;
  if (effectiveBasis === "terrain_adjusted") {
    return "机位估算温度 °C";
  }
  if (effectiveBasis === "raw_grid") {
    return "原始格点温度 °C";
  }
  return "温度 °C";
}

const professionalHourlyIncompleteFieldNoteText = "部分小时字段缺失，缺失值以 “—” 显示。";

function professionalHourlyMissingHeaderNote(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
): string | null {
  const hasTotalOnly = rows.some((row) => row.cloudLayerBasis === "total_only");
  if (hasTotalOnly) {
    return "低/中/高云分层缺失时以 — 显示，不用总云量回填。";
  }
  const hasPartialLayers = rows.some((row) => row.cloudLayerBasis === "partial_layers");
  if (hasPartialLayers) {
    return professionalHourlyIncompleteFieldNoteText;
  }
  const hasRawTemperature = rows.some((row) => row.temperatureBasis === "raw_grid");
  if (hasRawTemperature && basis.temperatureBasis !== "terrain_adjusted") {
    return "温度为原始格点值，未代表机位海拔修正。";
  }
  if (basis.partialData) {
    return professionalHourlyIncompleteFieldNoteText;
  }
  return null;
}

function professionalHourlyIncompleteFieldNote(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
): string | null {
  if (basis.partialData || rows.some(professionalHourlyRowHasIncompleteFields)) {
    return professionalHourlyIncompleteFieldNoteText;
  }
  return null;
}

function professionalHourlyRowHasIncompleteFields(row: ProfessionalHourlyRow): boolean {
  return (
    (row.missingFields?.length ?? 0) > 0 ||
    row.cloudTotalPercent === null ||
    row.cloudHighPercent === null ||
    row.cloudMidPercent === null ||
    row.cloudLowPercent === null ||
    row.displayedTemperatureC === null ||
    row.dewPointC === null ||
    row.dewPointSpreadC === null ||
    row.relativeHumidityPercent === null ||
    row.precipitationAmountMm === null ||
    row.precipitationProbabilityPercent === null ||
    row.visibilityMeters === null ||
    row.windSpeedMs === null ||
    row.windDirectionDeg === null
  );
}

function ProfessionalHourlyCell({
  cell,
  dataBasis,
  className,
  children,
}: {
  readonly cell: string;
  readonly dataBasis?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <td
      className={cn("whitespace-nowrap border-t border-border px-2 py-1.5 align-middle", className)}
      data-professional-hourly-cell={cell}
      data-professional-hourly-basis={dataBasis}
    >
      {children}
    </td>
  );
}

function defaultProfessionalHourlyFilter(
  result: ForecastCalculationResult,
): ProfessionalHourlyFilterMode {
  return professionalHourlyFocusWindows(result).length > 0 ? "cloudSea" : "morning";
}

function filterProfessionalHourlyRows(
  rows: readonly ProfessionalHourlyRow[],
  result: ForecastCalculationResult,
  mode: ProfessionalHourlyFilterMode,
): readonly ProfessionalHourlyRow[] {
  if (mode === "all") {
    return rows;
  }

  if (mode === "cloudSea") {
    const focusWindows = professionalHourlyFocusWindows(result);
    return rows.filter((row) =>
      focusWindows.some((window) => professionalHourInWindow(row, window, 3)),
    );
  }

  if (mode === "morning") {
    return rows.filter((row) => {
      const hour = hourFromIsoLike(row.time);
      return hour !== undefined && hour >= 4 && hour <= 9;
    });
  }

  return rows.filter(
    (row) =>
      row.cloudSeaSignal === "白墙风险" ||
      row.cloudSeaSignal === "需复核" ||
      professionalHourlyHasRisk(row) ||
      result.cloudSeaAnalysis.notRecommendedCloudSeaWindows.some((window) =>
        professionalHourInWindow(row, window, 1),
      ),
  );
}

function professionalHourlyFocusWindows(
  result: ForecastCalculationResult,
): readonly CloudSeaAnalysisWindowLike[] {
  const primary =
    result.cloudSeaAnalysis.bestCloudSeaWindow ??
    result.cloudSeaAnalysis.bestCloudSeaWindows[0] ??
    result.cloudSeaAnalysis.watchableCloudSeaWindows[0];

  return primary ? [primary] : [];
}

function professionalHourInWindow(
  row: ProfessionalHourlyRow,
  window: CloudSeaAnalysisWindowLike,
  paddingHours: number,
): boolean {
  const hourTime = Date.parse(row.time);
  const startTime = Date.parse(window.startTime);
  const endTime = Date.parse(window.endTime);
  if (!Number.isFinite(hourTime) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return false;
  }

  const paddingMs = paddingHours * 60 * 60 * 1000;
  return hourTime >= startTime - paddingMs && hourTime <= endTime + paddingMs;
}

function professionalSignalBadgeVariant(signal: ProfessionalHourlyRow["cloudSeaSignal"]) {
  if (signal === "白墙风险") {
    return "danger" as const;
  }
  if (signal === "雨后开口") {
    return "accent" as const;
  }
  if (signal === "可拍窗口") {
    return "default" as const;
  }
  if (signal === "形成信号") {
    return "info" as const;
  }
  if (signal === "需复核") {
    return "warning" as const;
  }
  return "muted" as const;
}

function professionalHourlyHasRisk(row: ProfessionalHourlyRow): boolean {
  return (
    (professionalHourlyHasPrecipitation(row) &&
      (!isFiniteNumber(row.cloudLowPercent) || row.cloudLowPercent >= 50)) ||
    (isFiniteNumber(row.precipitationProbabilityPercent) &&
      row.precipitationProbabilityPercent >= 60) ||
    (isFiniteNumber(row.visibilityMeters) && row.visibilityMeters <= 3000) ||
    (isFiniteNumber(row.windSpeedMs) && row.windSpeedMs >= 9)
  );
}

function professionalHourlyHasPrecipitation(row: ProfessionalHourlyRow): boolean {
  return isFiniteNumber(row.precipitationAmountMm) && row.precipitationAmountMm > 0;
}

function professionalHourlyToneClass(
  value: number | null | undefined,
  field:
    | "cloud-total"
    | "cloud-low"
    | "dew-point-spread"
    | "humidity"
    | "visibility"
    | "wind-speed",
): string | undefined {
  if (!isFiniteNumber(value)) {
    return undefined;
  }

  if (field === "cloud-low" && value >= 75) {
    return "bg-primary/10 font-semibold text-primary";
  }
  if (field === "cloud-total" && value >= 90) {
    return "bg-accent/10 font-semibold text-accent";
  }
  if (field === "humidity" && value >= 90) {
    return "bg-primary/10 font-semibold text-primary";
  }
  if (field === "dew-point-spread" && value <= 2) {
    return "bg-accent/10 font-semibold text-accent";
  }
  if (field === "visibility" && value <= 3000) {
    return "bg-danger/10 font-semibold text-danger";
  }
  if (field === "visibility" && value <= 8000) {
    return "bg-accent/10 font-semibold text-accent";
  }
  if (field === "wind-speed" && value >= 9) {
    return "bg-danger/10 font-semibold text-danger";
  }
  if (field === "wind-speed" && value >= 6) {
    return "bg-accent/10 font-semibold text-accent";
  }

  return undefined;
}

function weatherGlyphForProfessionalHour(
  row: ProfessionalHourlyRow,
  displayText: string,
): string | null {
  const text = displayText === "—" ? "" : displayText;
  if (text.includes("雪")) {
    return "雪";
  }
  if (text.includes("雨")) {
    return "雨";
  }
  if (text.includes("雾")) {
    return "雾";
  }
  if (text.includes("阴")) {
    return "阴";
  }
  if (text.includes("晴")) {
    return "晴";
  }
  if (text.includes("云")) {
    return "云";
  }
  if (row.weatherCode === "clear") {
    return "晴";
  }
  if (row.weatherCode === "partly_cloudy") {
    return "云";
  }
  return null;
}

function providerNeutralProfessionalWeatherText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || /meteoblue|open[-_ ]?meteo|qweather|和风天气|和风|provider/i.test(text)) {
    return null;
  }
  return text;
}

function formatProfessionalPercent(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${Math.round(value)}%` : "—";
}

function formatProfessionalTemperature(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)}°C` : "—";
}

function formatProfessionalTemperatureDelta(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)}°C` : "—";
}

function formatProfessionalPrecipitation(row: ProfessionalHourlyRow): string {
  const amount = isFiniteNumber(row.precipitationAmountMm)
    ? `${roundDisplay(row.precipitationAmountMm)} mm`
    : "—";
  const probability = isFiniteNumber(row.precipitationProbabilityPercent)
    ? `${Math.round(row.precipitationProbabilityPercent)}%`
    : "—";

  return amount === "—" && probability === "—" ? "—" : `${amount} / ${probability}`;
}

function formatProfessionalVisibility(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value / 1000)} km` : "—";
}

function formatProfessionalWindSpeed(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)} m/s` : "—";
}

function formatProfessionalWindDirection(value: number | null | undefined): string {
  return isFiniteNumber(value) ? windDirectionLabel(value) : "—";
}

function formatProfessionalDate(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatProfessionalTime(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatFullDateTimeForTimezone(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = valueFor("year");
  const month = valueFor("month");
  const day = valueFor("day");
  const hour = valueFor("hour");
  const minute = valueFor("minute");

  return year && month && day && hour && minute
    ? `${year}年${month}月${day}日 ${hour}:${minute}`
    : value;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function CloudSeaDailyTrend({
  result,
  items,
  terrainContext,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly CloudSeaDailyTrendItem[];
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const title =
    result.calendarBasis.horizonHours <= 24
      ? `未来24小时${terrainContext.vocabulary.subjectLabel}判断`
      : `每日${terrainContext.vocabulary.subjectLabel}判断`;

  return (
    <DailyDecisionList
      target="cloud_sea"
      dataCloudSeaSection="CloudSeaDailyTrend"
      dataTestId="cloud-sea-daily-decision"
    >
      <Card className="CloudSeaDailyTrend cloud-sea-daily-trend p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {terrainContext.vocabulary.dailyDescription}
            </p>
          </div>
          <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
        </div>
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <article
              key={item.key}
              className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(150px,0.8fr)_minmax(175px,1fr)_minmax(210px,1.2fr)_minmax(0,1.3fr)] min-[900px]:items-start"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
                  <Badge variant={item.recommendedAction === "不建议专程" ? "warning" : "default"}>
                    {item.recommendedAction}
                  </Badge>
                </div>
              </div>
              <dl className="grid gap-1 text-sm">
                <CloudSeaInlineDefinition
                  label={terrainContext.vocabulary.dailyBestWindowLabel}
                  value={item.bestMorningWindow}
                />
                <CloudSeaInlineDefinition label="雨后开口" value={item.rainOpeningLabel} />
              </dl>
              <div className="grid gap-2 min-[520px]:grid-cols-3 min-[900px]:grid-cols-1 min-[1180px]:grid-cols-3">
                <CloudSeaDailyStat
                  label="形成"
                  value={`${item.formationLevel} ${item.formationScore}分`}
                />
                <CloudSeaDailyStat
                  label="可拍"
                  value={`${item.shootableLevel} ${item.shootableScore}分`}
                />
                <CloudSeaDailyStat
                  label={terrainContext.vocabulary.dailyObstructionStatLabel}
                  value={`${item.whiteoutRiskLabel} ${item.whiteoutRiskScore}分`}
                />
              </div>
              <div className="grid gap-1 text-sm leading-6 text-muted-foreground">
                <p>{item.actionSuggestion}</p>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </DailyDecisionList>
  );
}

function CloudSeaDailyStat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs font-bold text-card-foreground">{value}</p>
    </div>
  );
}

function CloudSeaReasoningSection({ items }: { readonly items: readonly CloudSeaReasoningItem[] }) {
  return (
    <Card className="CloudSeaReasoning cloud-sea-reasoning p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">判断依据</h2>
        <Badge variant="muted">当前结果</Badge>
      </div>
      <JudgmentBasisGrid
        target="cloud_sea"
        className="mt-4 grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3"
      >
        {items.map((item) => (
          <article
            key={item.key}
            className="grid content-start gap-2 rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{firstSentence(item.detail)}</p>
          </article>
        ))}
      </JudgmentBasisGrid>
    </Card>
  );
}

function CloudSeaInlineCaution({ text }: { readonly text: string }) {
  return (
    <p className="rounded-lg border border-warning bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground">
      {text}
    </p>
  );
}

function CloudSeaActionPlanSection({
  items,
}: {
  readonly items: readonly CloudSeaActionPlanItem[];
}) {
  return (
    <Card className="CloudSeaActionPlan cloud-sea-action-plan p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">行动方案</h2>
        <Badge variant="muted">到达 / 主守 / 备选</Badge>
      </div>
      <ActionPlanGrid
        target="cloud_sea"
        className="mt-4 grid gap-3 min-[760px]:grid-cols-2 min-[1280px]:grid-cols-5"
      >
        {items.map((item) => (
          <article
            key={item.key}
            className="grid content-start gap-2 rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{firstSentence(item.detail)}</p>
          </article>
        ))}
      </ActionPlanGrid>
    </Card>
  );
}

function CloudSeaRiskSummarySection({
  riskSummary,
}: {
  readonly riskSummary: readonly ForecastResultSectionItem[];
}) {
  const focusedRiskSummary = riskSummary.filter(
    (item) =>
      !["云海形成机会", "云海可拍机会", "低云/晨雾信号", "云层可观察机会", "雨后开口"].includes(
        item.label,
      ),
  );

  return (
    <Card className="CloudSeaRiskSummary cloud-sea-risk-summary p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">风险与复核</h2>
        <Badge variant="muted">白墙 / 降水 / 通行</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-3">
        {focusedRiskSummary.slice(0, 6).map((item, index) => (
          <article
            key={`${item.label}-${index}`}
            className="grid content-start gap-2 rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-card-foreground">{item.label}</h3>
              {item.value ? <Badge variant="accent">{item.value}</Badge> : null}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{firstSentence(item.detail)}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaReturnLink({ href }: { readonly href: string }) {
  return (
    <a
      href={href}
      className="inline-flex w-fit items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
    >
      返回综合判断
      <span aria-hidden="true">→</span>
    </a>
  );
}

function CloudSeaInlineDefinition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

type SubjectScoreKey =
  | "cloudSea"
  | "sunriseGlow"
  | "sunsetGlow"
  | "stars"
  | "milkyWay"
  | "transparency";

type SubjectBreakdownCard = {
  readonly key: SubjectScoreKey;
  readonly label: string;
  readonly score: ForecastScore;
  readonly priorityScore: number;
  readonly windowLabel: string;
  readonly reason: string;
  readonly actionSuggestion: string;
  readonly detailItems?: readonly {
    readonly label: string;
    readonly value: string;
    readonly detail?: string;
  }[];
};

type DailyAstroLike = ForecastCalculationResult["astroAnalysis"]["dailyAstro"][number];

type AstroWindowLike = Pick<
  AstroWindow,
  "date" | "start" | "end" | "directionZh" | "galacticCenterAltitude" | "noteZh"
>;

const subjectScoreOrder: readonly SubjectScoreKey[] = [
  "cloudSea",
  "sunriseGlow",
  "sunsetGlow",
  "stars",
  "milkyWay",
  "transparency",
];

const subjectLabels: Record<SubjectScoreKey, string> = {
  cloudSea: "云海",
  sunriseGlow: "朝霞",
  sunsetGlow: "晚霞",
  stars: "星空",
  milkyWay: "银河",
  transparency: "通透 / 景别清晰度",
};

type GeneralSubjectKey = Exclude<SubjectScoreKey, "transparency">;

type GeneralSubjectSummary = {
  readonly key: GeneralSubjectKey;
  readonly name: string;
  readonly chanceText: string;
  readonly recommendationLabel: GeneralSubjectRecommendationLabel;
  readonly badgeVariant: BadgeVariant;
  readonly riskBadge?: {
    readonly label: string;
    readonly variant: BadgeVariant;
  };
  readonly recommendedWindowText: string;
  readonly backupWindowText?: string;
  readonly blockerText?: string;
  readonly action: string;
  readonly linkLabel: string;
  readonly href: string;
};

type GeneralSubjectRecommendationLabel = "推荐" | "可观察" | "谨慎参考" | "仅作备选" | "不建议";

const generalSubjectOrder: readonly GeneralSubjectKey[] = [
  "cloudSea",
  "sunriseGlow",
  "sunsetGlow",
  "stars",
  "milkyWay",
];

const generalSubjectLinkConfig: Record<
  GeneralSubjectKey,
  {
    readonly target: SubjectDetailTarget;
    readonly subject: SubjectDetailSubject;
    readonly label: string;
  }
> = {
  cloudSea: {
    target: "cloud_sea",
    subject: "cloud_sea",
    label: "查看云海详情",
  },
  sunriseGlow: {
    target: "glow",
    subject: "sunrise_glow",
    label: "查看霞光详情",
  },
  sunsetGlow: {
    target: "glow",
    subject: "sunset_glow",
    label: "查看霞光详情",
  },
  stars: {
    target: "astro",
    subject: "astro",
    label: "查看星空详情",
  },
  milkyWay: {
    target: "astro",
    subject: "milky_way",
    label: "查看星空详情",
  },
};

function buildGeneralSubjectSummaries(
  query: ForecastQueryInput,
  result: ForecastCalculationResult,
): readonly GeneralSubjectSummary[] {
  const cardsByKey = new Map(buildSubjectBreakdownCards(result).map((card) => [card.key, card]));
  const resultContext = result as ForecastCalculationResultWithAi;
  const resultId = resultContext.resultId ?? createForecastResultContextId(query, result);
  const returnUrl = buildGeneralForecastReturnUrl(query);

  return generalSubjectOrder.map((key) => {
    const score = generalSubjectChanceScore(result, key, cardsByKey.get(key));
    const subjectWindows = generalSubjectWindows(result, key);
    const recommendedWindow = subjectWindows.find((window) =>
      isRecommendedGeneralSubjectWindow(result, key, window),
    );
    const backupWindow = subjectWindows.find(
      (window) => window !== recommendedWindow && isBackupGeneralSubjectWindow(result, key, window),
    );
    const linkWindow = recommendedWindow ?? backupWindow ?? subjectWindows[0];
    const blocker = generalSubjectBlocker(result, key, linkWindow, score);
    const recommendationLabel = generalSubjectRecommendationLabel(
      score,
      recommendedWindow,
      backupWindow,
      blocker,
    );
    const linkConfig = generalSubjectLinkConfig[key];

    return {
      key,
      name: subjectDisplayLabel(result, key),
      chanceText: formatGeneralChanceText(score),
      recommendationLabel,
      badgeVariant: generalSubjectBadgeVariant(recommendationLabel),
      riskBadge:
        blocker && recommendationLabel !== "推荐"
          ? {
              label: blocker,
              variant: recommendationLabel === "不建议" ? "danger" : "warning",
            }
          : undefined,
      recommendedWindowText: recommendedWindow
        ? formatWindow(recommendedWindow.startTime, recommendedWindow.endTime)
        : "暂无高确定性窗口",
      backupWindowText: backupWindow
        ? formatWindow(backupWindow.startTime, backupWindow.endTime)
        : undefined,
      blockerText: recommendedWindow ? undefined : blocker,
      action: generalSubjectAction(result, key, recommendationLabel, blocker),
      linkLabel: subjectLinkLabel(result, key, linkConfig.label),
      href: buildSubjectDetailDeepLink({
        query,
        result,
        resultId,
        reportId: resultContext.reportId,
        target: linkConfig.target,
        subject: linkConfig.subject,
        date: generalSubjectLinkDate(result, linkWindow),
        window: linkWindow,
        returnUrl,
      }),
    };
  });
}

function subjectDisplayLabel(result: ForecastCalculationResult, key: SubjectScoreKey): string {
  if (key === "cloudSea" && !resultUsesMountainSemantics(result)) {
    return "晨雾 / 低云";
  }
  return subjectLabels[key];
}

function subjectLinkLabel(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  fallback: string,
): string {
  if (key === "cloudSea" && !resultUsesMountainSemantics(result)) {
    return "查看云雾详情";
  }
  return fallback;
}

function generalSubjectChanceScore(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  card: SubjectBreakdownCard | undefined,
): number | undefined {
  if (key === "cloudSea") {
    return result.cloudSeaAnalysis.shootableScore;
  }
  if (key === "sunriseGlow") {
    return result.glowAnalysis.sunriseGlowScore;
  }
  if (key === "sunsetGlow") {
    return result.glowAnalysis.sunsetGlowScore;
  }
  if (key === "stars") {
    return result.astroAnalysis.starsScore;
  }
  if (key === "milkyWay") {
    return result.astroAnalysis.milkyWayScore;
  }

  return card?.score.score;
}

function formatGeneralChanceText(score: number | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "暂无";
  }

  return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
}

function generalSubjectWindows(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
): readonly ForecastCalculationResult["bestWindows"][number][] {
  return [...result.bestWindows]
    .filter((window) => matchesGeneralSubjectWindow(window, key))
    .sort(
      (left, right) =>
        windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
        (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
        Date.parse(left.startTime) - Date.parse(right.startTime),
    );
}

function matchesGeneralSubjectWindow(
  window: ForecastCalculationResult["bestWindows"][number],
  key: GeneralSubjectKey,
): boolean {
  const text = generalSubjectWindowSearchText(window);

  if (key === "cloudSea") {
    return window.target === "cloud_sea";
  }
  if (key === "sunriseGlow") {
    return window.target === "glow" && isMorningForecastWindow(window);
  }
  if (key === "sunsetGlow") {
    return window.target === "glow" && isEveningForecastWindow(window);
  }
  if (key === "milkyWay") {
    return window.target === "astro" && (/银河/.test(text) || /milky\s*way/i.test(text));
  }

  return (
    window.target === "astro" &&
    !/银河|milky\s*way/i.test(text) &&
    (/星空|星野|夜景星空|天文黑夜/.test(text) || window.target === "astro")
  );
}

function generalSubjectWindowSearchText(
  window: Pick<ForecastCalculationResult["bestWindows"][number], "label" | "subjectPriorityLabel">,
): string {
  return `${window.subjectPriorityLabel ?? ""} ${window.label}`;
}

function isRecommendedGeneralSubjectWindow(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  if ((key === "stars" || key === "milkyWay") && !result.astroAnalysis.astroShootable) {
    return false;
  }

  return isUsableClientWindow(window);
}

function isBackupGeneralSubjectWindow(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  if ((key === "stars" || key === "milkyWay") && !result.astroAnalysis.astroShootable) {
    return false;
  }
  if (window.windowLevel === "blocked" || window.recommendationLevel === "not_recommended") {
    return false;
  }

  return (window.practicalScore ?? window.score) >= 45;
}

function generalSubjectRecommendationLabel(
  score: number | undefined,
  recommendedWindow: ForecastCalculationResult["bestWindows"][number] | undefined,
  backupWindow: ForecastCalculationResult["bestWindows"][number] | undefined,
  blocker: string | undefined,
): GeneralSubjectRecommendationLabel {
  const value = typeof score === "number" && Number.isFinite(score) ? score : 0;

  if (recommendedWindow) {
    return value >= 72 ? "推荐" : "可观察";
  }
  if (backupWindow) {
    return "仅作备选";
  }
  if (value >= 55 && !blocker) {
    return "可观察";
  }
  if (value >= 40) {
    return "谨慎参考";
  }
  return "不建议";
}

function generalSubjectBadgeVariant(label: GeneralSubjectRecommendationLabel): BadgeVariant {
  if (label === "推荐") {
    return "default";
  }
  if (label === "可观察") {
    return "accent";
  }
  if (label === "不建议") {
    return "danger";
  }
  if (label === "谨慎参考") {
    return "warning";
  }
  return "muted";
}

function generalSubjectBlocker(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  window: ForecastCalculationResult["bestWindows"][number] | undefined,
  score: number | undefined,
): string | undefined {
  if (key === "cloudSea") {
    if (result.cloudSeaAnalysis.whiteoutRiskScore >= 65 || result.scores.whiteoutRisk.score >= 65) {
      return resultUsesMountainSemantics(result) ? "白墙风险" : "低云遮挡";
    }
    if (window?.practicalKind === "formation_signal") {
      return "无光形成信号";
    }
  }

  if (key === "sunriseGlow" || key === "sunsetGlow") {
    if (result.glowAnalysis.lowCloudObstructionRisk >= 65) {
      return "低云遮挡";
    }
    if (
      (key === "sunriseGlow" && result.glowAnalysis.rainOverlapsSunriseWindow) ||
      (key === "sunsetGlow" && result.glowAnalysis.rainOverlapsSunsetWindow)
    ) {
      return "降水干扰";
    }
    if (result.scores.transparency.score < 55) {
      return "通透偏弱";
    }
  }

  if (key === "stars" || key === "milkyWay") {
    const blockers = [
      ...(window?.blockerReasons ?? []),
      ...(window?.weatherBlockers ?? []),
      ...result.astroAnalysis.weatherBlockers,
    ];
    if (blockers.length > 0) {
      return astroWindowBlockerLabels(blockers).join("、");
    }
    if (!result.astroAnalysis.astroShootable) {
      if (result.astroAnalysis.cloudBlockerLevel === "high") {
        return "云量偏高";
      }
      if (result.astroAnalysis.labels.moonlightImpact === "高") {
        return "月光影响";
      }
      return "天气不支持";
    }
  }

  return typeof score === "number" && score < 45 ? "条件不足" : undefined;
}

function generalSubjectAction(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  recommendationLabel: GeneralSubjectRecommendationLabel,
  blocker: string | undefined,
): string {
  if (key === "cloudSea") {
    if (!resultUsesMountainSemantics(result)) {
      return "关注晨雾、云层开口或远景层次，不建议按高山云海逻辑判断。";
    }
    if (recommendationLabel === "推荐" || recommendationLabel === "可观察") {
      return "清晨重点关注，现场复核白墙风险。";
    }
    return blocker === "白墙风险"
      ? "云海信号需降级，先确认云顶高度。"
      : "云海信号不足，不建议只为单一窗口出发。";
  }

  if (key === "sunriseGlow") {
    return recommendationLabel === "推荐" || recommendationLabel === "可观察"
      ? "日出前完成构图，复核东方低云遮挡。"
      : "可顺带观察，不建议作为唯一目标。";
  }

  if (key === "sunsetGlow") {
    return recommendationLabel === "推荐" || recommendationLabel === "可观察"
      ? "关注西向云层开口，日落前到位。"
      : "保留日落前后机动，不押单一霞光。";
  }

  if (key === "stars") {
    return recommendationLabel === "推荐" || recommendationLabel === "可观察"
      ? "夜间可纳入计划，复核云量、月光和通行安全。"
      : "云量或月光影响较大，不建议专程夜拍。";
  }

  return recommendationLabel === "推荐" || recommendationLabel === "可观察"
    ? "银心方向可重点跟进，临近复核云量和月光。"
    : "天文窗口存在但天气不支持，仅作参考。";
}

function generalSubjectLinkDate(
  result: ForecastCalculationResult,
  window: ForecastCalculationResult["bestWindows"][number] | undefined,
): string {
  return (
    window?.date ??
    dateFromIsoLike(window?.startTime) ??
    result.calendarBasis.targetDates[0] ??
    result.targetDates[0] ??
    dateFromIsoLike(result.forecastStart) ??
    "1970-01-01"
  );
}

function dateFromIsoLike(value: string | undefined): string | undefined {
  const date = value?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

export function ComprehensiveForecastView({
  query,
  result,
  viewModel,
  aiStatus,
  aiExplanation,
  aiErrorMessage,
  aiRetryable,
  onGenerateAiExplanation,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: ForecastResultViewModel;
  readonly aiStatus: AiStatus;
  readonly aiExplanation: ForecastAiExplanation | null;
  readonly aiErrorMessage: string;
  readonly aiRetryable: boolean;
  readonly onGenerateAiExplanation: () => void;
}) {
  const subjectCards = buildSubjectBreakdownCards(result);
  const bestSubject = pickBestSubject(subjectCards);
  const mainRisk = pickMainRisk(result);
  const primaryBestWindow = viewModel.bestWindows.find(isExecutableDisplayWindow);

  return (
    <DecisionResultTemplate target="general">
      <ComprehensiveContextBar query={query} result={result} />
      <ComprehensiveCoreDecisionCards
        result={result}
        bestWindow={primaryBestWindow}
        bestSubject={bestSubject}
        mainRisk={mainRisk}
      />
      <WeatherEssentialsPanel result={result} />
      {result.dailySummaries.length > 0 ? (
        <ComprehensiveMultiDaySummary query={query} result={result} />
      ) : null}
      <OpportunityWindowSection query={query} result={result} />
      <RiskDecisionSection result={result} mainRisk={mainRisk} />
      <ActionableAdviceSection result={result} bestSubject={bestSubject} mainRisk={mainRisk} />
      <AiExplanationPanel
        status={aiStatus}
        explanation={aiExplanation}
        errorMessage={aiErrorMessage}
        retryable={aiRetryable}
        onGenerate={onGenerateAiExplanation}
      />
    </DecisionResultTemplate>
  );
}

function ComprehensiveContextBar({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <ForecastResultHeader target="general">
      <ForecastResultSummaryCard
        target="general"
        className="min-w-0 rounded-lg border border-border bg-card"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">出行判断</Badge>
          <Badge variant={dataReadinessBadgeVariant(result)}>{weatherReadinessLabel(result)}</Badge>
          <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
        </div>
        <h1 className="mt-4 break-words text-2xl font-bold leading-tight text-foreground sm:text-[30px]">
          {query.name}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {userFacingResultText(result.summary)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs leading-5 text-muted-foreground">
          <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
          <span>生成时间：{formatDateTime(result.generatedAt)}</span>
          <span>{judgmentConfidenceText(result)}</span>
        </div>
        <Button
          className="mt-4"
          size="sm"
          variant="secondary"
          onClick={() => {
            window.location.assign("/#analysis");
          }}
        >
          重新选择地点
        </Button>
      </ForecastResultSummaryCard>
      <ForecastScoreCard
        target="general"
        label="综合出片指数"
        score={result.overallScore}
        badgeLabel={departureRecommendationLabel(result)}
        badgeVariant={recommendationBadgeVariant(result.recommendationLabel)}
        summary={userFacingResultText(primaryReasonSentence(result))}
      />
    </ForecastResultHeader>
  );
}

function ComprehensiveCoreDecisionCards({
  result,
  bestWindow,
  bestSubject,
  mainRisk,
}: {
  readonly result: ForecastCalculationResult;
  readonly bestWindow: ForecastResultWindow | undefined;
  readonly bestSubject: SubjectBreakdownCard;
  readonly mainRisk: ForecastResultSectionItem;
}) {
  const cards: readonly ForecastResultCard[] = [
    textCard(
      "comprehensive-recommendation",
      "recommendation",
      "推荐等级",
      result.recommendationLabel,
      departureRecommendationLabel(result),
      "primary",
    ),
    textCard(
      "comprehensive-window",
      "bestWindow",
      "最佳拍摄窗口",
      coreWindowValue(bestWindow),
      coreWindowDetail(result, bestWindow),
      "accent",
    ),
    textCard(
      "comprehensive-arrival",
      "recommendation",
      "到达建议",
      arrivalAdviceValue(bestWindow),
      arrivalAdviceDetail(bestWindow),
      result.overallScore >= 65 ? "primary" : "accent",
    ),
    generalCloudMistCard(result),
    textCard(
      "comprehensive-glow-v2",
      "sunsetGlow",
      "朝霞 / 晚霞机会",
      `朝霞${result.glowAnalysis.labels.sunriseGlowOpportunity} · 晚霞${result.glowAnalysis.labels.sunsetGlowOpportunity}`,
      `${glowGeneralFactsText(result)} ${glowGeneralWindowText(result)}`,
      result.glowAnalysis.lowCloudObstructionRisk >= 70 ? "danger" : "accent",
    ),
    scoreCard(
      "comprehensive-subject",
      bestSubject.key === "milkyWay" ? "milkyWay" : bestSubject.key,
      "最佳题材",
      subjectDisplayLabel(result, bestSubject.key),
      userFacingResultText(`${bestSubject.score.score} 分，${bestSubject.reason}`),
      "info",
      bestSubject.score.score,
    ),
    textCard(
      "comprehensive-risk",
      "risk",
      "主要风险",
      mainRisk.label,
      mainRisk.detail,
      mainRisk.value?.includes("高") ? "danger" : "muted",
    ),
  ];

  return (
    <ForecastMetricGrid
      target="general"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7"
      dataTestId="top-decision-cards"
    >
      {cards.map((card) => (
        <ForecastMetricCard key={card.key} target="general">
          <PrimaryResultCard card={card} />
        </ForecastMetricCard>
      ))}
    </ForecastMetricGrid>
  );
}

function generalCloudMistCard(result: ForecastCalculationResult): ForecastResultCard {
  if (!resultUsesMountainSemantics(result)) {
    return textCard(
      "comprehensive-cloud-mist",
      "cloudSea",
      "晨雾 / 低云",
      `云雾信号${result.cloudSeaAnalysis.labels.formationOpportunity} · 通透风险${result.cloudSeaAnalysis.labels.whiteoutRisk}`,
      `低云/雾气 ${result.cloudSeaAnalysis.formationScore} 分，云层开口 ${result.cloudSeaAnalysis.shootableScore} 分，低云遮挡 ${result.cloudSeaAnalysis.whiteoutRiskScore} 分。`,
      result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "info",
    );
  }

  return textCard(
    "comprehensive-cloud-sea",
    "cloudSea",
    "云海 / 白墙",
    `形成${result.cloudSeaAnalysis.labels.formationOpportunity} · 可拍${result.cloudSeaAnalysis.labels.shootableOpportunity} · 白墙${result.cloudSeaAnalysis.labels.whiteoutRisk}`,
    `形成 ${result.cloudSeaAnalysis.formationScore} 分，可拍 ${result.cloudSeaAnalysis.shootableScore} 分，白墙风险 ${result.cloudSeaAnalysis.whiteoutRiskScore} 分。`,
    result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "info",
  );
}

function OpportunityWindowSection({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  const summaries = buildGeneralSubjectSummaries(query, result);

  return (
    <section className="grid gap-3" data-testid="opportunity-windows">
      <SectionHeading
        title="拍摄窗口与备选"
        description="只汇总五类核心题材，快速判断哪个最值得拍。"
        badge="五类题材"
      />
      <div
        className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]"
        data-testid="general-subject-summary-grid"
      >
        {summaries.map((summary) => (
          <article
            key={summary.key}
            className="grid min-h-[260px] content-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
            data-testid="general-subject-summary-card"
            data-subject={summary.key}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-bold text-card-foreground">{summary.name}</h3>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span data-testid="general-subject-recommendation-badge">
                  <Badge variant={summary.badgeVariant}>{summary.recommendationLabel}</Badge>
                </span>
                {summary.riskBadge ? (
                  <span data-testid="general-subject-risk-badge">
                    <Badge variant={summary.riskBadge.variant}>{summary.riskBadge.label}</Badge>
                  </span>
                ) : null}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">机会指数</p>
              <p className="mt-1 text-2xl font-bold leading-8 text-primary">{summary.chanceText}</p>
            </div>

            <div className="grid gap-1.5 text-xs leading-5 text-muted-foreground">
              <p data-testid="general-subject-recommended-window">
                <span className="font-semibold text-card-foreground">推荐窗口：</span>
                {summary.recommendedWindowText}
              </p>
              {summary.backupWindowText ? (
                <p data-testid="general-subject-backup-window">
                  <span className="font-semibold text-card-foreground">备选窗口：</span>
                  {summary.backupWindowText}
                </p>
              ) : null}
              {summary.blockerText ? (
                <p>
                  <span className="font-semibold text-card-foreground">主要阻碍：</span>
                  {summary.blockerText}
                </p>
              ) : null}
            </div>

            <p className="text-sm leading-6 text-card-foreground">
              <span className="font-semibold">建议：</span>
              {summary.action}
            </p>

            <a className="mt-auto text-sm font-semibold text-primary" href={summary.href}>
              {summary.linkLabel}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function ComprehensiveMultiDaySummary({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <DailyDecisionList target="general" dataTestId="daily-forecast-decision">
      <SectionHeading
        title="逐日拍摄判断"
        description="按天保留出发判断、关键天气、优先窗口和下一步动作。"
        badge={forecastHorizonLabels[result.horizon]}
      />
      <div
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]"
        data-testid="daily-cards-adaptive-grid"
      >
        {result.dailySummaries.map((summary) => {
          const dayBreakdown = result.targetDailyBreakdown.find(
            (breakdown) => breakdown.date === summary.date,
          );
          const primaryWindow = dailyPrimaryWindow(result, summary);
          const backupWindow = dailyBackupWindow(result, summary, primaryWindow);
          const backupWindowText = dailyBackupWindowText(
            result,
            summary,
            primaryWindow,
            backupWindow,
          );
          const mainRiskText = dailyMainRiskText(result, summary, dayBreakdown);
          const decisionLabel = dailyOverallDecisionLabel(summary);
          const actionSuggestion = dailyCompactActionSuggestion(
            result,
            summary,
            dayBreakdown,
            primaryWindow,
            backupWindow,
          );
          const subjectLinks = buildGeneralDailySubjectLinks({
            query,
            result,
            date: summary.date,
          });

          return (
            <article key={summary.date} data-testid="daily-card">
              <Card className="grid h-full content-start gap-3 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-card-foreground">{summary.dateLabelZh}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summary.lunarDateText ? `农历${summary.lunarDateText}` : "农历暂缺"}
                    </p>
                  </div>
                  <Badge variant={dailyDecisionBadgeVariant(decisionLabel)}>{decisionLabel}</Badge>
                </div>
                <p className="text-sm font-semibold leading-6 text-card-foreground">
                  {dailyMainWeatherSummary(summary, dayBreakdown)}
                </p>
                <div className="grid gap-1.5 text-sm leading-6 text-muted-foreground">
                  <p className="font-semibold text-card-foreground">
                    {dailyCompactTemperatureRangeText(summary.weather, result)}
                  </p>
                  <p data-testid="daily-compact-weather-row">
                    {dailyCompactWeatherRow(summary.weather, dayBreakdown)}
                  </p>
                </div>
                <div
                  className="grid gap-1.5 border-y border-border py-3 text-sm leading-6"
                  data-testid="daily-priority-windows"
                >
                  <p data-testid="daily-primary-window">
                    <span className="font-semibold text-card-foreground">优先关注：</span>
                    {primaryWindow
                      ? `${windowLabelText(primaryWindow)} ${formatWindow(
                          primaryWindow.startTime,
                          primaryWindow.endTime,
                        )}`
                      : "暂无高确定性拍摄窗口"}
                  </p>
                  {backupWindowText ? (
                    <p className="text-muted-foreground" data-testid="daily-backup-window">
                      <span className="font-semibold text-card-foreground">备选观察：</span>
                      {backupWindowText}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 text-sm leading-6">
                  <p data-testid="daily-main-risk">
                    <span className="font-semibold text-card-foreground">主要风险：</span>
                    {mainRiskText}
                  </p>
                  <p className="text-card-foreground" data-testid="daily-action-suggestion">
                    <span className="font-semibold">行动：</span>
                    {actionSuggestion}
                  </p>
                </div>
                {subjectLinks.length > 0 ? (
                  <nav className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs font-semibold text-primary">
                    {subjectLinks.map((link) => (
                      <a key={link.target} href={link.href}>
                        {link.label}
                      </a>
                    ))}
                  </nav>
                ) : null}
              </Card>
            </article>
          );
        })}
      </div>
    </DailyDecisionList>
  );
}

type GeneralDailySummary = ForecastCalculationResult["dailySummaries"][number];
type GeneralDailyBreakdown = ForecastCalculationResult["targetDailyBreakdown"][number];
type GeneralForecastWindow = ForecastCalculationResult["bestWindows"][number];

function dailyOverallDecisionLabel(summary: GeneralDailySummary): string {
  if (
    summary.dedicatedTripRecommendation === "不建议专程前往" &&
    summary.nearbyObservationRecommendation === "已在附近可观察"
  ) {
    return "已在附近可观察";
  }

  if (summary.dedicatedTripRecommendation) {
    return summary.dedicatedTripRecommendation;
  }

  if (summary.nearbyObservationRecommendation && summary.score < 65) {
    return summary.nearbyObservationRecommendation;
  }

  if (summary.recommendationLabel.includes("不建议") || summary.score < 45) {
    return "不建议专程前往";
  }
  if (summary.recommendationLabel.includes("谨慎") || summary.score < 65) {
    return "谨慎参考";
  }
  if (summary.recommendationLabel.includes("强推荐")) {
    return "强推荐专程";
  }
  if (
    summary.recommendationLabel.includes("等待") ||
    summary.recommendationLabel.includes("推荐")
  ) {
    return "推荐安排";
  }

  return normalizeRecommendationLabel(summary.recommendationLabel);
}

function dailyMainWeatherSummary(
  summary: GeneralDailySummary,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  const source =
    simplifyWeatherSummaryZh(summary.weather?.weatherTextZh ?? breakdown?.weatherSummary) ??
    "天气待复核";
  return compactSentence(source, 24);
}

function dailyCompactTemperatureRangeText(
  weather: GeneralDailySummary["weather"] | undefined,
  result: ForecastCalculationResult,
): string {
  const prefix = terrainTemperaturePrefix(result);
  if (!weather) {
    return `${prefix}：暂缺`;
  }

  if (typeof weather.tempMin === "number" && typeof weather.tempMax === "number") {
    return `${prefix}：${Math.round(weather.tempMin)}–${Math.round(weather.tempMax)}°C`;
  }

  return `${prefix}：${formatTemperature(averagePair(weather.tempMin, weather.tempMax))}`;
}

function dailyCompactWeatherRow(
  weather: GeneralDailySummary["weather"] | undefined,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  return [
    compactPrecipitationDisplayText(weather),
    `风：${formatCompactWindSpeed(weather?.windSpeed)}`,
    `通透：${compactTransparencyLabel(weather, breakdown)}`,
  ].join("｜");
}

function formatCompactWindSpeed(windSpeed: number | null | undefined): string {
  return typeof windSpeed === "number" && Number.isFinite(windSpeed)
    ? `${roundDisplay(windSpeed)}m/s`
    : "待复核";
}

function compactTransparencyLabel(
  weather: GeneralDailySummary["weather"] | undefined,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  const score = weather?.photographyTransparencyScore ?? breakdown?.transparency?.score;
  return transparencyGradeLabel(weather?.transparencyGrade, score).replace(/\s*\d+\s*分$/, "");
}

function dailyPrimaryWindow(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
): GeneralForecastWindow | undefined {
  if (
    summary.bestShootableWindow &&
    windowBelongsToDate(summary.bestShootableWindow, summary.date) &&
    isHighConfidenceDailyWindow(result, summary.bestShootableWindow)
  ) {
    return summary.bestShootableWindow;
  }

  return sortedDailyWindows(result, summary.date).find((window) =>
    isHighConfidenceDailyWindow(result, window),
  );
}

function dailyBackupWindow(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  primaryWindow: GeneralForecastWindow | undefined,
): GeneralForecastWindow | undefined {
  return sortedDailyWindows(result, summary.date).find(
    (window) => !sameDailyWindow(window, primaryWindow) && isBackupDailyWindow(window),
  );
}

function sortedDailyWindows(
  result: ForecastCalculationResult,
  date: string,
): readonly GeneralForecastWindow[] {
  return result.bestWindows
    .filter((window) => windowBelongsToDate(window, date))
    .sort(
      (left, right) =>
        windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
        (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
        Date.parse(left.startTime) - Date.parse(right.startTime),
    );
}

function windowBelongsToDate(window: GeneralForecastWindow, date: string): boolean {
  return (
    window.date === date ||
    window.startTime.startsWith(`${date}T`) ||
    window.endTime.startsWith(`${date}T`)
  );
}

function sameDailyWindow(
  left: GeneralForecastWindow,
  right: GeneralForecastWindow | undefined,
): boolean {
  return (
    right !== undefined &&
    left.target === right.target &&
    left.startTime === right.startTime &&
    left.endTime === right.endTime
  );
}

function isHighConfidenceDailyWindow(
  result: ForecastCalculationResult,
  window: GeneralForecastWindow,
): boolean {
  if (isBlockedAstroWindow(window)) {
    return false;
  }
  if (!resultUsesMountainSemantics(result) && window.target === "cloud_sea") {
    return (
      window.windowLevel === "watchable" &&
      window.recommendationLevel !== "not_recommended" &&
      (window.practicalScore ?? window.score) >= 25
    );
  }
  return isUsableClientWindow(window);
}

function isBackupDailyWindow(window: GeneralForecastWindow): boolean {
  if (isBlockedAstroWindow(window)) {
    return false;
  }
  return window.recommendationLevel !== "not_recommended" && window.windowLevel !== "blocked";
}

function isBlockedAstroWindow(window: GeneralForecastWindow): boolean {
  return (
    window.target === "astro" &&
    ((window.weatherBlockers?.length ?? 0) > 0 ||
      (window.blockerReasons?.length ?? 0) > 0 ||
      window.windowLevel === "blocked" ||
      window.recommendationLevel === "not_recommended")
  );
}

function dailyBackupWindowText(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  primaryWindow: GeneralForecastWindow | undefined,
  backupWindow: GeneralForecastWindow | undefined,
): string | undefined {
  if (backupWindow) {
    return `${windowLabelText(backupWindow)} ${formatWindow(
      backupWindow.startTime,
      backupWindow.endTime,
    )}`;
  }

  return primaryWindow ? undefined : dailyFallbackBackupObservation(result, summary);
}

function dailyFallbackBackupObservation(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
): string {
  const rain = rainRiskText(summary.weather);
  if (rain.level === "中" || rain.level === "高" || rain.level === "严重") {
    return "雨后短暂开口";
  }

  const glowDay = result.glowAnalysis.dailyGlow.find((day) => day.date === summary.date);
  if (glowDay?.postRainOpeningChance === "medium" || glowDay?.postRainOpeningChance === "high") {
    return "日落后余晖";
  }

  const cloudSeaDay = result.cloudSeaAnalysis.dailyCloudSea.find(
    (day) => day.date === summary.date,
  );
  if ((cloudSeaDay?.formationScore ?? 0) >= 50) {
    return "云雾变化";
  }

  return "云层纹理或近景";
}

function dailyMainRiskText(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  const weather = summary.weather;
  const rain = rainRiskText(weather);
  if (summary.rainOverlapsPriorityWindow) {
    return "降水干扰";
  }
  if (summary.rainNearPriorityWindow) {
    return "窗口前降水";
  }
  if (rain.level === "中" || rain.level === "高" || rain.level === "严重") {
    return summary.rainOverlapWindowLabelZh === "推荐窗口之后" ? "降水在窗口后" : "降水干扰";
  }

  const cloudSeaDay = result.cloudSeaAnalysis.dailyCloudSea.find(
    (day) => day.date === summary.date,
  );
  if ((cloudSeaDay?.whiteoutRiskScore ?? breakdown?.whiteoutRisk?.score ?? 0) >= 60) {
    return resultUsesMountainSemantics(result) ? "白墙风险" : "低云遮挡";
  }

  if ((weather?.cloudLow ?? 0) >= 70) {
    return "低云遮挡";
  }

  if ((weather?.windGust ?? weather?.windSpeed ?? 0) >= 10) {
    return "阵风偏强";
  }

  const transparencyScore = weather?.photographyTransparencyScore ?? breakdown?.transparency?.score;
  if (typeof transparencyScore === "number" && transparencyScore < 60) {
    return "通透一般";
  }

  return summary.riskFlags[0]?.label ?? result.riskFlags[0]?.label ?? "风险可控";
}

function dailyCompactActionSuggestion(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  breakdown: GeneralDailyBreakdown | undefined,
  primaryWindow: GeneralForecastWindow | undefined,
  backupWindow: GeneralForecastWindow | undefined,
): string {
  const rain = rainRiskText(summary.weather);
  const rainAffectsPrimary =
    summary.rainOverlapsPriorityWindow === true || summary.rainNearPriorityWindow === true;
  if (rainAffectsPrimary && summary.rainActionZh) {
    return summary.rainActionZh;
  }
  if (
    summary.rainOverlapWindowLabelZh === "推荐窗口之后" &&
    (rain.level === "中" || rain.level === "高" || rain.level === "严重") &&
    summary.rainActionZh
  ) {
    return summary.rainActionZh;
  }
  if (rain.level === "高" || rain.level === "严重") {
    return "降水干扰明显，优先等待雨后短暂开口。";
  }
  if (rain.level === "中") {
    return "降水时段分散，优先等待雨后短暂开口。";
  }

  const mainRisk = dailyMainRiskText(result, summary, breakdown);
  if ((mainRisk === "白墙风险" || mainRisk === "低云遮挡") && !primaryWindow) {
    return resultUsesMountainSemantics(result)
      ? "白墙风险偏高，到场先看云顶高度，避免只守单一机位。"
      : "低云或雾气影响偏高，优先观察通透度和云层开口。";
  }

  if (!primaryWindow) {
    return backupWindow
      ? "条件一般，建议作为备选观察日。"
      : "暂无明确高确定性窗口，出行前等待下一次预报更新。";
  }

  const subject = windowLabelText(primaryWindow);
  if (primaryWindow.target === "cloud_sea") {
    if (!resultUsesMountainSemantics(result)) {
      return "关注晨雾、云层开口或日落光线，不建议按高山云海逻辑判断。";
    }
    return dailyOverallDecisionLabel(summary).includes("不建议")
      ? `若在附近，可观察${subject}；不建议只为单一窗口专程。`
      : `${subject}可优先安排，到场先复核云顶高度和白墙风险。`;
  }

  if (primaryWindow.target === "glow") {
    return subject.includes("日落") || subject.includes("晚霞") || subject.includes("余晖")
      ? "保留日落前后机动，窗口前复核太阳方向云缝。"
      : "日出前完成构图，等待云缝和色温变化。";
  }

  if (primaryWindow.target === "astro") {
    return (primaryWindow.weatherBlockers?.length ?? 0) > 0
      ? "有天文时间但天气不支持，不建议把星空作为主目标。"
      : "夜间窗口可纳入计划，提前确认前景和安全通行。";
  }

  if (mainRisk === "通透一般") {
    return "通透条件一般，优先准备中近景和云层纹理。";
  }

  return "条件可用，按优先窗口安排到达并保留备选题材。";
}

function compactSentence(value: string, maxLength: number): string {
  const firstClause = value
    .trim()
    .split(/[。；;]/)[0]
    ?.split("，")
    .slice(0, 2)
    .join("，")
    .trim();

  if (!firstClause) {
    return "待复核";
  }

  return firstClause.length > maxLength ? `${firstClause.slice(0, maxLength)}…` : firstClause;
}

function RiskDecisionSection({
  result,
  mainRisk,
}: {
  readonly result: ForecastCalculationResult;
  readonly mainRisk: ForecastResultSectionItem;
}) {
  const riskItems = buildRiskDecisionItems(result, mainRisk);

  return (
    <section className="grid gap-3" data-testid="risk-section">
      <SectionHeading
        title="风险提醒"
        description="只保留会影响出发、机位等待和器材保护的风险。"
        badge={riskItems.length > 0 ? `${riskItems.length} 项需关注` : "风险可控"}
      />
      <JudgmentBasisGrid
        target="general"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]"
      >
        {riskItems.map((item) => (
          <Card key={item.label} className="p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-card-foreground">{item.label}</h3>
              <Badge variant={item.levelLabel.includes("高") ? "danger" : "warning"}>
                {item.levelLabel}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
              <p>
                <span className="font-semibold text-card-foreground">影响时段：</span>
                {item.timeWindow}
              </p>
              <p>
                <span className="font-semibold text-card-foreground">建议：</span>
                {item.action}
              </p>
            </div>
          </Card>
        ))}
      </JudgmentBasisGrid>
    </section>
  );
}

function ActionableAdviceSection({
  result,
  bestSubject,
  mainRisk,
}: {
  readonly result: ForecastCalculationResult;
  readonly bestSubject: SubjectBreakdownCard;
  readonly mainRisk: ForecastResultSectionItem;
}) {
  const bestWindow = bestWindowForSubject(result, bestSubject.key);
  const backupSubjects = buildSubjectBreakdownCards(result)
    .filter((subject) => subject.key !== bestSubject.key)
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 2);
  const backupPlan = bestWindow?.backupSubjectLabel
    ? `若主窗口不成立，优先转向${bestWindow.backupSubjectLabel}。`
    : backupSubjects.length > 0
      ? `若${subjectDisplayLabel(result, bestSubject.key)}不成立，优先转向${backupSubjects
          .map(
            (subject) => `${subjectDisplayLabel(result, subject.key)}（${subject.score.score} 分）`,
          )
          .join("或")}。`
      : "如果主目标不成立，保留现场光线、云层纹理和地景构图作为备选。";

  return (
    <section className="grid gap-3" data-testid="action-plan">
      <SectionHeading
        title="出行建议"
        description="只保留到达、题材、备选、风险、装备和是否出发六类动作。"
        badge={departureRecommendationLabel(result)}
      />
      <ActionPlanGrid
        target="general"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]"
      >
        <AdviceBlock title="建议到达时间" items={[compactArrivalAdvice(bestWindow)]} />
        <AdviceBlock
          title="优先拍摄题材"
          items={[compactSubjectAdvice(result, bestWindow, bestSubject)]}
        />
        <AdviceBlock title="备选方案" items={[backupPlan]} />
        <AdviceBlock title="风险提醒" items={[compactRiskAdvice(mainRisk)]} />
        <AdviceBlock
          title="穿衣与装备"
          items={[packingDetail(result.clothingGuide), packingMainValue(result.clothingGuide)]}
        />
        <AdviceBlock title="是否建议出发" items={[compactDepartureAdvice(result)]} />
      </ActionPlanGrid>
    </section>
  );
}

function compactArrivalAdvice(
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
): string {
  if (!window) {
    return "暂无明确高分窗口，先等下一次预报更新。";
  }
  if (window.windowLevel === "watchable" || window.windowLevel === "blocked") {
    return "当前仅适合观察或备选，不按专程到达安排。";
  }

  const windowText = `拍摄窗口：${formatWindow(window.startTime, window.endTime)}`;
  const warning = window.arrivalAdvice?.warningZh
    ? ` ${firstSentence(window.arrivalAdvice.warningZh)}`
    : "";
  return `${arrivalAdviceValue(window)}；${windowText}。${warning}`.trim();
}

function compactSubjectAdvice(
  result: ForecastCalculationResult,
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
  subject: SubjectBreakdownCard,
): string {
  const label = window ? windowLabelText(window) : subjectDisplayLabel(result, subject.key);
  return `${label}优先；${subject.score.score} 分，${firstSentence(subject.actionSuggestion)}`;
}

function compactRiskAdvice(mainRisk: ForecastResultSectionItem): string {
  return `${mainRisk.label}：${firstSentence(mainRisk.detail)}`;
}

function compactDepartureAdvice(result: ForecastCalculationResult): string {
  return `${departureRecommendationLabel(result)}；${firstSentence(primaryReasonSentence(result))}`;
}

function firstSentence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^[^。！？!?]+[。！？!?]?/);
  return (match?.[0] ?? trimmed).replace(/[。！？!?]?$/, "。");
}

function AdviceBlock({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      <ul className="mt-2 grid gap-2">
        {(items.length > 0
          ? items
          : ["当前结果未给出额外建议，出行前复核最新天气和现场安全信息。"]
        ).map((item) => (
          <li key={item} className="text-sm leading-6 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CompactDefinition({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

function PrimaryResultCard({ card }: { readonly card: ForecastResultCard }) {
  return (
    <div className="grid h-full content-start rounded-lg border border-border bg-muted p-4">
      <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
      <p className={cn("mt-2 break-words text-2xl font-bold leading-8", cardToneText(card.tone))}>
        {card.value}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {userFacingResultText(card.detail)}
      </p>
      {typeof card.score === "number" ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
          <div
            className={cn("h-full rounded-full", cardToneBar(card.tone))}
            style={{ width: `${card.score}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function cardToneText(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "text-primary",
    accent: "text-accent",
    danger: "text-danger",
    info: "text-info",
    muted: "text-card-foreground",
  };

  return toneClasses[tone];
}

function cardToneBar(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "bg-primary",
    accent: "bg-accent",
    danger: "bg-danger",
    info: "bg-info",
    muted: "bg-muted-foreground",
  };

  return toneClasses[tone];
}

type BadgeVariant = NonNullable<Parameters<typeof Badge>[0]["variant"]>;

function badgeVariantForTone(tone: ForecastResultCardTone): BadgeVariant {
  const variants: Record<ForecastResultCardTone, BadgeVariant> = {
    primary: "default",
    accent: "accent",
    danger: "danger",
    info: "info",
    muted: "muted",
  };

  return variants[tone];
}

function ScoreCardsPanel({
  title,
  scores,
}: {
  readonly title: string;
  readonly scores: readonly ForecastScore[];
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <Badge variant="muted">按当前目标筛选</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {scores.map((score) => (
          <ScoreCard key={score.key} score={score} />
        ))}
      </div>
    </section>
  );
}

function SectionGrid({ sections }: { readonly sections: readonly ForecastResultSection[] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {sections.map((section) => (
        <SectionPanel key={section.key} section={section} />
      ))}
    </section>
  );
}

function SectionStack({ sections }: { readonly sections: readonly ForecastResultSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <SectionPanel key={section.key} section={section} compact />
      ))}
    </>
  );
}

function SectionPanel({
  section,
  compact = false,
}: {
  readonly section: ForecastResultSection;
  readonly compact?: boolean;
}) {
  return (
    <Card className={cn("p-5 shadow-sm", compact && "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{section.title}</h2>
        {section.badgeLabel ? <Badge variant="muted">{section.badgeLabel}</Badge> : null}
      </div>
      {section.description ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
      ) : null}
      <ul className="mt-4 grid gap-3">
        {section.items.map((item, index) => (
          <li
            key={`${section.key}-${index}`}
            className="rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-card-foreground">{item.label}</span>
              {item.value ? <Badge variant="accent">{item.value}</Badge> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DailyOverviewPanel({
  title,
  description,
  items,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly ForecastResultDailyItem[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">逐日判断</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-card-foreground">{item.dateLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.recommendationLabel}</p>
              </div>
              <Badge variant={item.score >= 70 ? "default" : "accent"}>{item.score} 分</Badge>
            </div>
            <dl className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
              <div>
                <dt className="font-semibold text-card-foreground">最佳窗口</dt>
                <dd className="mt-1">{item.bestWindowLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold text-card-foreground">主要风险</dt>
                <dd className="mt-1">{item.riskLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold text-card-foreground">建议</dt>
                <dd className="mt-1">{item.shortAdvice}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WindowPanel({
  title,
  description,
  windows,
  groups,
}: {
  readonly title: string;
  readonly description: string;
  readonly windows: readonly ForecastResultWindow[];
  readonly groups: readonly ForecastResultWindowGroup[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">目标优先</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {groups.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {groups.map((group) => (
            <section key={group.key} className="rounded-lg border border-border bg-muted p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-card-foreground">{group.dateLabel}</h3>
                <Badge variant="muted">每日窗口</Badge>
              </div>
              <WindowList windows={group.windows} />
            </section>
          ))}
        </div>
      ) : windows.length > 0 ? (
        <WindowList windows={windows} />
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">暂无明确高分窗口。</p>
      )}
    </Card>
  );
}

function WindowList({ windows }: { readonly windows: readonly ForecastResultWindow[] }) {
  return (
    <ul className="mt-4 grid gap-3">
      {windows.map((window) => (
        <li
          key={`${window.target}-${window.startTime}`}
          className="grid gap-2 rounded-lg border border-border bg-card px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div>
            <p className="font-semibold text-card-foreground">{window.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{window.timeRangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={windowCategoryBadgeVariant(window)}>
              {windowDisplayCategory(window)}
            </Badge>
            <Badge variant="muted">{window.badgeLabel}</Badge>
            <Badge variant={window.score >= 75 ? "default" : "accent"}>{window.score} 分</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MockWarningCard({
  result,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly dataNotice: string;
}) {
  const nonReal = result.weatherDataMode !== "real" || result.terrainAnalysis.isMock;

  return (
    <Card className={cn("p-4 shadow-sm", nonReal ? "border-warning" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
        <p className="text-sm font-semibold text-card-foreground">数据提醒</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{dataNotice}</p>
    </Card>
  );
}

export function AiExplanationPanel({
  status,
  explanation,
  errorMessage,
  retryable,
  onGenerate,
}: {
  readonly status: AiStatus;
  readonly explanation: ForecastAiExplanation | null;
  readonly errorMessage: string;
  readonly retryable: boolean;
  readonly onGenerate: () => void;
}) {
  const visibleExplanation = isDisplayableAiExplanation(explanation) ? explanation : null;
  const hasCompletedExplanation = Boolean(visibleExplanation) && !retryable && status !== "loading";
  const buttonLabel =
    status === "loading"
      ? "正在生成智能解读..."
      : retryable
        ? "重试智能解读"
        : hasCompletedExplanation
          ? "已生成智能解读"
          : "生成智能解读";

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 className="text-lg font-bold text-card-foreground">智能解读</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            可手动生成更自然的摄影建议，当前判断结果不依赖 AI。
          </p>
        </div>
        <Button
          className="min-w-[132px] shrink-0"
          variant="secondary"
          disabled={status === "loading" || hasCompletedExplanation}
          onClick={onGenerate}
        >
          {buttonLabel}
        </Button>
      </div>

      {errorMessage ? (
        <p className="mt-3 rounded-lg border border-warning/70 bg-muted px-3 py-2 text-sm leading-6 text-card-foreground">
          {errorMessage}
        </p>
      ) : null}

      {visibleExplanation ? (
        <div className="mt-4 grid gap-3">
          <AiTextSection title="一句话结论">
            <p className="text-base font-semibold leading-7 text-card-foreground">
              {visibleExplanation.conclusion.oneSentenceDecisionZh}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {visibleExplanation.conclusion.summaryZh}
            </p>
          </AiTextSection>
          <AiDefinitionGrid
            title="最建议关注"
            items={[
              ["最建议冲哪一天", visibleExplanation.conclusion.recommendedDayZh],
              ["是否推荐", visibleExplanation.conclusion.whetherWorthDedicatedTripZh],
              ["主目标", visibleExplanation.bestPlan.primaryTargetZh],
              ["建议到达", visibleExplanation.bestPlan.recommendedArrivalZh],
              ["建议窗口", visibleExplanation.bestPlan.bestWindowZh],
              ["备选窗口", visibleExplanation.bestPlan.backupPlanZh],
            ]}
          />
          <AiDefinitionGrid
            title="天气大势"
            items={[
              ["趋势", visibleExplanation.weatherTrend.trendSummaryZh],
              ["温度", visibleExplanation.weatherTrend.temperatureSummaryZh],
              ["降水", visibleExplanation.weatherTrend.rainSummaryZh],
              ["风", visibleExplanation.weatherTrend.windSummaryZh],
              ["通透度", visibleExplanation.weatherTrend.transparencySummaryZh],
            ]}
          />
          <AiDayByDaySection days={visibleExplanation.dayByDay} />
          <AiDefinitionGrid
            title="题材判断"
            items={[
              ["云海", visibleExplanation.subjectAdvice.cloudSeaZh],
              ["日出 / 朝霞", visibleExplanation.subjectAdvice.sunriseGlowZh],
              ["日落 / 晚霞", visibleExplanation.subjectAdvice.sunsetGlowZh],
              ["星空 / 银河", visibleExplanation.subjectAdvice.astroMilkyWayZh],
              ["通透度", visibleExplanation.subjectAdvice.transparencyZh],
            ]}
          />
          <AiListSection title="风险与装备" items={visibleExplanation.riskAndGear.keyRisks} />
          <AiDefinitionGrid
            title="风险与装备建议"
            items={[
              ["穿衣", visibleExplanation.riskAndGear.clothingZh],
              ["装备", visibleExplanation.riskAndGear.gearZh],
              ["安全", visibleExplanation.riskAndGear.safetyZh],
            ]}
          />
          <AiDefinitionGrid
            title="最终建议"
            items={[
              ["去不去", visibleExplanation.finalAdvice.goNoGoZh],
              ["已在附近", visibleExplanation.finalAdvice.ifAlreadyNearbyZh],
              ["专程出发", visibleExplanation.finalAdvice.ifDedicatedTripZh],
              ["下次复核", visibleExplanation.finalAdvice.nextCheckZh],
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}

function AiTextSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted p-3">
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function AiDefinitionGrid({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly (readonly [string, string])[];
}) {
  return (
    <AiTextSection title={title}>
      <dl className="grid gap-2 sm:grid-cols-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-md bg-card px-3 py-2">
            <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm leading-6 text-card-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </AiTextSection>
  );
}

function AiDayByDaySection({ days }: { readonly days: ForecastAiExplanation["dayByDay"] }) {
  return (
    <AiTextSection title="逐日建议">
      <div className="grid gap-2">
        {days.map((day) => (
          <article key={day.dateZh} className="rounded-md bg-card px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-card-foreground">{day.dateZh}</h3>
              <Badge variant="muted">{day.scoreZh}</Badge>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-card-foreground">
              {day.recommendationZh}
            </p>
            <dl className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
              <div>温度：{day.temperatureZh}</div>
              <div>降水：{day.rainZh}</div>
              <div>云海：{day.cloudSeaZh}</div>
              <div>朝霞：{day.glowZh}</div>
              <div>晚霞：{day.sunsetGlowZh}</div>
              <div>星空银河：{day.astroZh}</div>
              <div>通透度：{day.transparencyZh}</div>
              <div>窗口：{day.bestWindowZh}</div>
            </dl>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{day.actionZh}</p>
          </article>
        ))}
      </div>
    </AiTextSection>
  );
}

function AiListSection({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <AiTextSection title={title}>
      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item} className="text-sm leading-6 text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">暂无。</p>
      )}
    </AiTextSection>
  );
}

function DataStatusPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const nonReal = result.weatherDataMode !== "real" || result.terrainAnalysis.isMock;
  const confidence = sourceConfidenceLabel(result);
  const conflictStatus = result.weatherFusionSummary?.conflictStatusZh ?? "无明显冲突";

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="地点" value={result.calendarBasis.coordinateSource} />
        <SummaryItem
          label="天气主源"
          value={publicSourceDiagnosticText(result, "qweather", "基础天气")}
        />
        <SummaryItem
          label="云层辅助"
          value={publicSourceDiagnosticText(result, "open_meteo", "云层辅助")}
        />
        <SummaryItem
          label="专业增强"
          value={publicSourceDiagnosticText(result, "meteoblue", "专业增强")}
        />
        <SummaryItem label="数据置信度" value={confidence} />
        <SummaryItem label="数据冲突" value={conflictStatus} />
        <SummaryItem label="天文数据" value={result.astroDataSourceLabelZh} />
        <SummaryItem label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <SummaryItem label="计算基准" value={result.calendarBasis.forecastStartLabel} />
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {result.terrainAnalysis.honestyNoteZh}
      </p>
    </Card>
  );
}

function confidenceLevelLabel(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function CalculationBasisPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const basis = result.calendarBasis;

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">计算依据</h2>
        <Badge variant="muted">日历核心</Badge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="预报起点" value={basis.forecastStartLabel} />
        <SummaryItem label="预报终点" value={basis.forecastEndLabel} />
        <SummaryItem label="覆盖日期" value={basis.targetDateLabels.join("、")} />
        <SummaryItem label="时区" value={basis.timezoneLabel} />
        <SummaryItem label="WGS84 经纬度" value={formatWgs84Coordinates(basis)} />
        <SummaryItem label="坐标来源" value={basis.coordinateSource} />
        <SummaryItem
          label="机位海拔"
          value={formatElevationValue(result.terrainAnalysis.terrainProfile.locationElevation)}
        />
        <SummaryItem
          label="周边高差"
          value={formatReliefValue(result.terrainAnalysis.terrainProfile.elevationDiff5km)}
        />
        <SummaryItem
          label="云海地形潜力"
          value={terrainPotentialLabel(
            result.terrainAnalysis.terrainProfile.terrainCloudSeaPotential,
          )}
        />
        <SummaryItem label="天文数据" value={result.astroDataSourceLabelZh} />
        {result.astroCalculationBasis?.ephemerisFileName ? (
          <SummaryItem label="星历文件" value={result.astroCalculationBasis.ephemerisFileName} />
        ) : null}
        {result.astroCalculationBasis?.coordinateSystem ? (
          <SummaryItem label="天文坐标基准" value={result.astroCalculationBasis.coordinateSystem} />
        ) : null}
        <SummaryItem label="天气数据" value={weatherStatusLabel(result)} />
        <SummaryItem label="地形数据来源" value={result.terrainAnalysis.dataSourceLabelZh} />
      </dl>

      <div className="mt-3 rounded-lg border border-border bg-muted p-3">
        <p className="text-xs font-semibold text-muted-foreground">农历 / 节气</p>
        {basis.calendarDays.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground">
            {basis.calendarDays.map((day) => (
              <li key={day.date}>
                {day.dateLabel}：农历{day.lunarDateText}
                {day.solarTerm ? ` / ${day.solarTerm}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">暂无农历或节气信息。</p>
        )}
      </div>
    </Card>
  );
}

function ScoreCard({ score }: { readonly score: ForecastScore }) {
  const isRisk = score.key === "whiteoutRisk";
  const barTone = isRisk ? "bg-warning" : "bg-primary";

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-card-foreground">{score.label}</p>
          <p className="mt-2 text-3xl font-bold leading-9 text-card-foreground">{score.score}</p>
        </div>
        <Badge variant={score.level === "poor" || isRisk ? "warning" : "muted"}>
          {isRisk ? "风险值" : scoreLevelLabels[score.level]}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{score.reasons[0]}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", barTone)} style={{ width: `${score.score}%` }} />
      </div>
    </Card>
  );
}

function buildSubjectBreakdownCards(
  result: ForecastCalculationResult,
): readonly SubjectBreakdownCard[] {
  return subjectScoreOrder.map((key) => {
    const score = result.scores[key];
    if (key === "cloudSea") {
      const analysis = result.cloudSeaAnalysis;
      const whiteoutLabel = analysis.labels.whiteoutRisk;
      const usesMountainSemantics = resultUsesMountainSemantics(result);

      return {
        key,
        label: subjectDisplayLabel(result, key),
        score: {
          ...score,
          score: analysis.shootableScore,
          reasons: [
            usesMountainSemantics
              ? `云海形成 ${analysis.formationScore} 分，可拍 ${analysis.shootableScore} 分，白墙风险 ${analysis.whiteoutRiskScore} 分。`
              : `低云/雾气 ${analysis.formationScore} 分，云层开口 ${analysis.shootableScore} 分，遮挡风险 ${analysis.whiteoutRiskScore} 分。`,
          ],
        },
        priorityScore: practicalSubjectScoreFromCloudSea(result),
        windowLabel: analysis.bestCloudSeaWindow
          ? `${usesMountainSemantics ? "最佳云海窗口" : "云雾观察窗口"}：${formatWindow(
              analysis.bestCloudSeaWindow.startTime,
              analysis.bestCloudSeaWindow.endTime,
            )}`
          : analysis.labels.watchableWindowLabel ??
            (usesMountainSemantics ? "暂无明确可拍云海窗口" : "暂无明确云雾观察窗口"),
        reason: !usesMountainSemantics
          ? `低海拔地形不按高山云海判断；当前云雾信号${analysis.labels.formationOpportunity}，低云遮挡${whiteoutLabel}。`
          : whiteoutLabel === "高"
            ? `云海形成条件${analysis.labels.formationOpportunity}，但低云偏厚，白墙风险高；可拍机会${analysis.labels.shootableOpportunity}。`
            : `云海形成条件${analysis.labels.formationOpportunity}，可拍机会${analysis.labels.shootableOpportunity}，白墙风险${whiteoutLabel}。`,
        actionSuggestion: !usesMountainSemantics
          ? "关注晨雾、云层开口和远景通透，不建议按高山云海逻辑判断。"
          : whiteoutLabel === "高"
            ? "若已在山上，可等待短暂开口；不建议为单一窗口专程奔赴。"
            : analysis.shootableScore >= 70
              ? "清晨有云海窗口，建议提前到达并观察云顶开口。"
              : "有云海信号，但需把白墙、降水和能见度作为现场复核点。",
      };
    }

    if (key === "sunriseGlow" || key === "sunsetGlow") {
      return buildGlowSubjectBreakdownCard(result, key, score);
    }

    if (key === "stars" || key === "milkyWay") {
      return buildAstroSubjectBreakdownCard(result, key, score);
    }

    return {
      key,
      label: subjectLabels[key],
      score,
      priorityScore: subjectPriorityScore(result, key, score.score),
      windowLabel: subjectWindowLabel(result, key),
      reason: userFacingResultText(firstText(score.reasons, "当前题材已纳入综合评分。")),
      actionSuggestion: subjectActionSuggestion(key, score.score),
    };
  });
}

function buildGlowSubjectBreakdownCard(
  result: ForecastCalculationResult,
  key: "sunriseGlow" | "sunsetGlow",
  score: ForecastScore,
): SubjectBreakdownCard {
  const analysis = result.glowAnalysis;
  const isSunrise = key === "sunriseGlow";
  const glowScore = isSunrise ? analysis.sunriseGlowScore : analysis.sunsetGlowScore;
  const chanceLabel = isSunrise
    ? analysis.labels.sunriseGlowOpportunity
    : analysis.labels.sunsetGlowOpportunity;
  const window = bestWindowForSubject(result, key);
  const analysisWindow = bestGlowWindowForPhase(analysis, isSunrise ? "sunrise" : "sunset");
  const windowText = window
    ? `${windowLabelText(window)}：${formatWindow(window.startTime, window.endTime)}`
    : analysisWindow
      ? `${analysisWindow.labelZh}：${formatWindow(analysisWindow.start, analysisWindow.end)}`
      : isSunrise
        ? "暂无明确日出暖光窗口"
        : "暂无明确日落暖光或日落后余晖窗口";
  const rainText = isSunrise
    ? analysis.rainOverlapsSunriseWindow
      ? "降水主要影响清晨窗口，朝霞不确定性较高。"
      : "降水与清晨窗口重叠较少。"
    : analysis.rainOverlapsSunsetWindow
      ? "降水主要影响日落窗口，晚霞需要现场复核云层开口。"
      : "降水与日落窗口重叠较少。";
  const reason =
    analysisWindow?.noteZh ??
    firstText(
      isSunrise
        ? score.reasons.filter((item) => item.includes("日出") || item.includes("朝霞"))
        : score.reasons.filter((item) => item.includes("日落") || item.includes("晚霞")),
      isSunrise
        ? "朝霞按日出前后中高云、低云遮挡、降水和通透度综合判断。"
        : "晚霞按日落前后中高云承载、低云遮挡、降水和通透度综合判断。",
    );

  return {
    key,
    label: subjectLabels[key],
    score: {
      ...score,
      score: glowScore,
      reasons: [reason],
    },
    priorityScore: subjectPriorityScore(result, key, glowScore),
    windowLabel: `${isSunrise ? "日出暖光窗口" : "日落暖光 / 日落后余晖窗口"}：${windowText}`,
    reason: `${reason}${rainText}`,
    actionSuggestion:
      glowScore >= 70 && analysis.lowCloudObstructionRisk < 65
        ? isSunrise
          ? "朝霞窗口具备等待价值，建议日出前完成构图并复核东方低云遮挡。"
          : "晚霞窗口具备等待价值，建议日落前观察西向中高云和透光缝。"
        : isSunrise
          ? "朝霞仅作谨慎观察，若低云偏厚可转拍云雾层次和远山。"
          : "日落前后可观察云层开口，但不建议只为晚霞专程前往。",
    detailItems: [
      {
        label: isSunrise ? "朝霞机会" : "晚霞机会",
        value: `${chanceLabel}（${glowScore} 分）`,
      },
      {
        label: isSunrise ? "日出暖光窗口" : "日落暖光 / 日落后余晖窗口",
        value: windowText,
      },
      {
        label: "低云遮挡",
        value: `${analysis.labels.lowCloudObstruction}（${analysis.lowCloudObstructionRisk} 分）`,
        detail:
          analysis.lowCloudObstructionRisk >= 65
            ? isSunrise
              ? "低云偏厚，日出方向可能被遮挡。"
              : "低云偏厚，日落前后需要现场确认西向开口。"
            : "低云遮挡暂未成为主要阻断项。",
      },
      {
        label: "色彩云条件",
        value: `${analysis.labels.colorCarrier}（${analysis.colorCarrierScore} 分）`,
        detail:
          analysis.colorCarrierScore >= 65
            ? "中高云条件较好，有机会承载暖色。"
            : "中高云载体偏弱，可能只有局部暖色或短时色彩。",
      },
      {
        label: "判断依据",
        value: rainText,
      },
    ],
  };
}

function buildAstroSubjectBreakdownCard(
  result: ForecastCalculationResult,
  key: "stars" | "milkyWay",
  score: ForecastScore,
): SubjectBreakdownCard {
  const analysis = result.astroAnalysis;
  const firstDaily = analysis.dailyAstro[0];
  const blockers = astroMainBlockers(result, firstDaily);
  const blockerText = blockers.join("、");
  const recommendedWindow =
    analysis.recommendedMilkyWayWindow ?? analysis.recommendedMilkyWayWindows[0];
  const candidateWindow = analysis.milkyWayCandidateWindows[0];
  const moonlessWindow = analysis.moonlessNightWindows[0];
  const astronomicalWindow = analysis.astronomicalNightWindows[0];
  const isMilkyWay = key === "milkyWay";
  const displayScore = isMilkyWay ? analysis.milkyWayGeometryScore : analysis.practicalAstroScore;
  const shootability = isMilkyWay
    ? analysis.labels.milkyWayShootability
    : analysis.labels.starShootability;
  const windowLabel = isMilkyWay
    ? analysis.astroShootable && recommendedWindow
      ? `推荐银河窗口：${formatAstroWindowForUi(recommendedWindow)}`
      : candidateWindow
        ? `银河天文窗口：${formatAstroWindowForUi(candidateWindow)}；${blockerText}，不建议专程夜拍`
        : "银河窗口：暂无可用"
    : astronomicalWindow
      ? `天文窗口：${analysis.labels.astronomicalWindow}｜${formatAstroWindowForUi(astronomicalWindow)}`
      : `天文窗口：${analysis.labels.astronomicalWindow}`;
  const reason = analysis.astroShootable
    ? isMilkyWay
      ? "云量较低、月光影响小，可重点关注银河窗口。"
      : "天文窗口、云量、通透度和月光组合可用，星空可作为夜间主目标。"
    : analysis.astroWindowAvailable
      ? isMilkyWay
        ? `银河方向和时间合适，但${blockerText}，建议放弃专程夜拍。`
        : `有天文窗口，但${blockerText}，实际可见性较差。`
      : "暂无有效天文窗口，夜间拍摄不宜作为主目标。";

  return {
    key,
    label: subjectLabels[key],
    score: {
      ...score,
      score: displayScore,
      reasons: [reason],
    },
    priorityScore: subjectPriorityScore(result, key, displayScore),
    windowLabel,
    reason,
    actionSuggestion: analysis.astroShootable
      ? isMilkyWay
        ? "云量较低、月光影响小，可重点关注银河窗口。"
        : "夜间可纳入计划，仍需临近复核云层开口、路况和安全撤离时间。"
      : analysis.astroWindowAvailable
        ? "天气窗口不足，夜间可作为备选观察，不建议作为主目标。"
        : "不建议专程夜拍，优先转向云海、霞光或通透地景。",
    detailItems: [
      {
        label: "天文窗口",
        value: astronomicalWindow
          ? `${analysis.labels.astronomicalWindow}｜${formatAstroWindowForUi(astronomicalWindow)}`
          : analysis.labels.astronomicalWindow,
      },
      {
        label: isMilkyWay ? "银河可拍性" : "星空可拍性",
        value: `${shootability}｜${displayScore} 分`,
        detail: analysis.astroShootable
          ? "天文与天气同时可用。"
          : "天文窗口不等于实际可拍性，需按天气阻断降级。",
      },
      {
        label: "主要阻碍",
        value: blockers.length > 0 ? blockerText : "暂无主要阻碍",
      },
      {
        label: "云量阻挡",
        value: analysis.labels.cloudBlocker,
        detail:
          analysis.cloudBlockerLevel === "high"
            ? "低云或总云量已明显压低星空银河实际可见性。"
            : "云量仍需临近复核。高云会影响银河反差，低云会遮挡地景和近地平线。",
      },
      {
        label: "月光影响",
        value: analysis.labels.moonlightImpact,
        detail:
          analysis.labels.moonlightImpact === "高"
            ? "月亮在地平线上且照明较强时，不建议把银河作为最佳目标。"
            : "月光暂未成为主要阻断，可结合无月黑夜窗口安排。",
      },
      {
        label: "露水风险",
        value: analysis.labels.dewRisk,
        detail:
          analysis.dewRiskLevel === "high"
            ? "湿度和露点差组合偏危险，需准备防露带、镜头布和保暖。"
            : "仍建议携带镜头布、备用电池和防潮装备。",
      },
      ...(isMilkyWay
        ? [
            {
              label: "银心窗口",
              value: candidateWindow ? formatAstroWindowForUi(candidateWindow) : "暂无明确窗口",
              detail: candidateWindow?.directionZh
                ? `银河方向：${candidateWindow.directionZh}`
                : "银河方向需结合现场前景复核。",
            },
            {
              label: "无月黑夜",
              value: moonlessWindow ? formatAstroWindowForUi(moonlessWindow) : "暂无明确窗口",
            },
            {
              label: analysis.astroShootable ? "推荐银河窗口" : "银河窗口判断",
              value:
                analysis.astroShootable && recommendedWindow
                  ? formatAstroWindowForUi(recommendedWindow)
                  : "天气未通过，不显示为推荐窗口",
            },
          ]
        : []),
    ],
  };
}

function pickBestSubject(cards: readonly SubjectBreakdownCard[]): SubjectBreakdownCard {
  const best = [...cards].sort((left, right) => right.priorityScore - left.priorityScore)[0];
  if (best) {
    return best;
  }

  return {
    key: "transparency",
    label: subjectLabels.transparency,
    score: {
      key: "transparency",
      label: subjectLabels.transparency,
      score: 0,
      level: "poor",
      reasons: ["当前缺少可用于题材排序的评分。"],
      risks: [],
    },
    priorityScore: 0,
    windowLabel: "暂无明确高分窗口",
    reason: "当前缺少可用于题材排序的评分。",
    actionSuggestion: "先以现场通透度和安全条件作为判断基准。",
  };
}

function subjectPriorityScore(
  result: ForecastCalculationResult,
  key: SubjectScoreKey,
  fallbackScore: number,
): number {
  if ((key === "stars" || key === "milkyWay") && !result.astroAnalysis.astroShootable) {
    return Math.min(result.astroAnalysis.astroPracticalScore, 34);
  }

  const window = bestWindowForSubject(result, key);
  if (!window) {
    return fallbackScore;
  }

  return (
    Math.round((fallbackScore * 0.42 + (window.practicalScore ?? window.score) * 0.58) * 10) / 10
  );
}

function practicalSubjectScoreFromCloudSea(result: ForecastCalculationResult): number {
  const window = bestWindowForSubject(result, "cloudSea");
  const windowScore = window?.practicalScore ?? window?.score;
  return (
    Math.round(
      ((windowScore ?? result.cloudSeaAnalysis.shootableScore) * 0.58 +
        result.cloudSeaAnalysis.shootableScore * 0.42) *
        10,
    ) / 10
  );
}

function pickMainRisk(result: ForecastCalculationResult): ForecastResultSectionItem {
  const risk = result.riskFlags[0];
  if (risk) {
    return {
      label: risk.label,
      value: `${riskLevelText(risk.level)}风险`,
      detail: riskDetailWithTime(result, risk),
    };
  }

  if (result.scores.whiteoutRisk.score >= 65) {
    const usesMountainSemantics = resultUsesMountainSemantics(result);
    return {
      label: usesMountainSemantics ? "白墙风险" : "低云遮挡",
      value: "中风险",
      detail: appendRiskTimeContext(
        firstText(
          [...result.scores.whiteoutRisk.risks, ...result.scores.whiteoutRisk.reasons],
          usesMountainSemantics
            ? "低云、湿度和能见度组合需要出行前复核。"
            : "低云、雾气和能见度组合需要出行前复核。",
        ),
        fallbackRiskTimeLabel(result, "whiteout"),
      ),
    };
  }

  return {
    label: "暂无高等级风险",
    value: "低风险",
    detail: appendRiskTimeContext(
      "仍需在出行前复核最新天气、道路和景区开放信息。",
      buildNearTermWeatherTimeContext(result).sectionWindowLabel,
    ),
  };
}

function scoreCard(
  key: string,
  moduleKey: ForecastResultCard["moduleKey"],
  label: string,
  value: string,
  detail: string,
  tone: ForecastResultCardTone,
  score?: number,
): ForecastResultCard {
  return {
    key,
    moduleKey,
    label,
    value,
    detail,
    score,
    tone,
  };
}

function textCard(
  key: string,
  moduleKey: ForecastResultCard["moduleKey"],
  label: string,
  value: string,
  detail: string,
  tone: ForecastResultCardTone,
): ForecastResultCard {
  return {
    key,
    moduleKey,
    label,
    value,
    detail,
    tone,
  };
}

function coreWindowValue(window: ForecastResultWindow | undefined): string {
  if (!window) {
    return "暂无明确高分窗口";
  }

  return window.fullTimeRangeLabel ?? formatShootingWindowZh(window);
}

function coreWindowDetail(
  result: ForecastCalculationResult,
  window: ForecastResultWindow | undefined,
): string {
  if (!window) {
    return "优先复核后续天气更新。";
  }

  const scores =
    typeof window.conditionScore === "number" && typeof window.practicalScore === "number"
      ? `实用 ${window.practicalScore} 分，气象 ${window.conditionScore} 分`
      : `${window.score} 分`;
  const note = window.practicalNoteZh ? ` ${window.practicalNoteZh}` : "";

  return `${window.badgeLabel}，${windowActionLabel(window)}，${windowRiskTag(
    result,
    window,
  )}，${scores}。${note}`;
}

function subjectWindowLabel(result: ForecastCalculationResult, key: SubjectScoreKey): string {
  const window = bestWindowForSubject(result, key);
  if (window) {
    const label = windowLabelText(window);
    const blockers = window.blockerReasons ?? window.weatherBlockers ?? [];
    if (
      (key === "milkyWay" || key === "stars") &&
      (blockers.length > 0 || window.windowLevel === "blocked")
    ) {
      return `天文窗口：${formatWindow(window.startTime, window.endTime)}；${
        blockers[0] ?? astroBlockedReasonText(window)
      }，不建议作为唯一目标。`;
    }
    if (key === "milkyWay") {
      return `银河可拍窗口：${formatWindow(window.startTime, window.endTime)}`;
    }
    if (key === "sunsetGlow") {
      return `${label}：${formatWindow(window.startTime, window.endTime)}`;
    }
    if (key === "sunriseGlow") {
      return `${label}：${formatWindow(window.startTime, window.endTime)}`;
    }
    return `${label}：${formatWindow(window.startTime, window.endTime)}`;
  }

  if (key === "transparency") {
    return "随最佳窗口复核";
  }

  return "暂无明确高分窗口";
}

function bestWindowForSubject(
  result: ForecastCalculationResult,
  key: SubjectScoreKey,
): ForecastCalculationResult["bestWindows"][number] | undefined {
  const windows = [...result.bestWindows].sort(
    (left, right) =>
      windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
      (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
      Date.parse(left.startTime) - Date.parse(right.startTime),
  );
  const executableWindows = windows.filter(isExecutableClientWindow);
  const findCandidate = (
    predicate: (window: ForecastCalculationResult["bestWindows"][number]) => boolean,
  ) => executableWindows.find(predicate) ?? windows.find(predicate);

  if (key === "cloudSea") {
    return findCandidate((window) => window.target === "cloud_sea");
  }
  if (key === "sunriseGlow") {
    return findCandidate((window) => window.target === "glow" && isMorningForecastWindow(window));
  }
  if (key === "sunsetGlow") {
    return findCandidate((window) => window.target === "glow" && isEveningForecastWindow(window));
  }
  if (key === "stars") {
    return findCandidate(
      (window) =>
        window.target === "astro" &&
        ((window.subjectPriorityLabel ?? window.label).includes("星空") ||
          window.label.includes("天文黑夜")),
    );
  }
  if (key === "milkyWay") {
    return findCandidate((window) => window.target === "astro" && window.label.includes("银河"));
  }

  return executableWindows[0] ?? windows[0];
}

function isMorningForecastWindow(
  window: Pick<
    ForecastCalculationResult["bestWindows"][number],
    "lightPhase" | "startTime" | "label" | "subjectPriorityLabel"
  >,
): boolean {
  if (window.lightPhase === "dawn" || window.lightPhase === "sunrise") {
    return true;
  }
  if (window.lightPhase === "sunset" || window.lightPhase === "blue_hour") {
    return false;
  }
  const hour = hourFromIsoLike(window.startTime);
  if (typeof hour === "number") {
    return hour < 12;
  }
  const subject = window.subjectPriorityLabel ?? window.label;
  return subject.includes("朝霞") || subject.includes("日出");
}

function isEveningForecastWindow(
  window: Pick<
    ForecastCalculationResult["bestWindows"][number],
    "lightPhase" | "startTime" | "label" | "subjectPriorityLabel"
  >,
): boolean {
  if (window.lightPhase === "sunset" || window.lightPhase === "blue_hour") {
    return true;
  }
  if (window.lightPhase === "dawn" || window.lightPhase === "sunrise") {
    return false;
  }
  const hour = hourFromIsoLike(window.startTime);
  if (typeof hour === "number") {
    return hour >= 12;
  }
  const subject = window.subjectPriorityLabel ?? window.label;
  return subject.includes("晚霞") || subject.includes("日落") || subject.includes("余晖");
}

function isExecutableClientWindow(
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  const hasHierarchy =
    window.windowLevel !== undefined || window.executableForDedicatedTrip !== undefined;
  if (window.executableForDedicatedTrip !== undefined) {
    return window.executableForDedicatedTrip;
  }
  if (!hasHierarchy) {
    return (
      window.practicalKind !== "formation_signal" &&
      window.recommendationLevel === "recommended" &&
      (window.practicalScore ?? window.score) >= 72
    );
  }
  return (
    window.practicalKind !== "formation_signal" &&
    (window.windowLevel === "best" || window.windowLevel === "shootable") &&
    window.recommendationLevel === "recommended" &&
    (window.practicalScore ?? window.score) >= 72
  );
}

function isUsableClientWindow(window: ForecastCalculationResult["bestWindows"][number]): boolean {
  if (window.practicalKind === "formation_signal" || window.windowLevel === "blocked") {
    return false;
  }
  if (window.recommendationLevel === "backup" || window.recommendationLevel === "not_recommended") {
    return false;
  }
  if (
    window.windowLevel !== undefined &&
    window.windowLevel !== "shootable" &&
    window.windowLevel !== "best"
  ) {
    return false;
  }
  return (window.practicalScore ?? window.score) >= 54;
}

function isExecutableDisplayWindow(window: ForecastResultWindow): boolean {
  const hasHierarchy =
    window.windowLevel !== undefined || window.executableForDedicatedTrip !== undefined;
  if (window.executableForDedicatedTrip !== undefined) {
    return window.executableForDedicatedTrip;
  }
  if (!hasHierarchy) {
    return (
      window.practicalKind !== "formation_signal" &&
      window.recommendationLevel === "recommended" &&
      (window.practicalScore ?? window.score) >= 72
    );
  }

  return (
    window.practicalKind !== "formation_signal" &&
    (window.windowLevel === "best" || window.windowLevel === "shootable") &&
    window.recommendationLevel === "recommended" &&
    (window.practicalScore ?? window.score) >= 72
  );
}

function windowUsefulnessRank(window: ForecastCalculationResult["bestWindows"][number]): number {
  if (window.windowLevel === "best") {
    return 4;
  }
  if (window.windowLevel === "shootable") {
    return 3;
  }
  if (window.windowLevel === "watchable") {
    return 2;
  }
  if (window.windowLevel === "blocked") {
    return 0;
  }
  return 1;
}

function windowRiskTag(result: ForecastCalculationResult, window: ForecastResultWindow): string {
  if ((window.blockerReasons?.length ?? 0) > 0) {
    return window.blockerReasons![0]!;
  }
  if (window.practicalKind === "formation_signal") {
    return "无光形成信号";
  }
  if (
    window.precipitationRisk?.rainRiskLevel === "high" ||
    window.precipitationRisk?.rainRiskLevel === "severe"
  ) {
    return "降水打断";
  }
  if (window.restWarningZh) {
    return "作息成本高";
  }
  if (window.target === "cloud_sea" && result.scores.whiteoutRisk.score >= 65) {
    return resultUsesMountainSemantics(result) ? "白墙需复核" : "低云遮挡需复核";
  }
  if (window.target === "glow" && result.scores.transparency.score < 60) {
    return "通透度偏弱";
  }
  if (
    window.target === "astro" &&
    Math.max(result.scores.stars.score, result.scores.milkyWay.score) < 60
  ) {
    return "云量月光复核";
  }
  if (window.score < 65) {
    return "谨慎窗口";
  }

  return result.riskFlags[0]?.label ?? "风险可控";
}

function windowDisplayCategory(
  window: Pick<
    ForecastResultWindow,
    | "windowLevel"
    | "recommendationLevel"
    | "practicalScore"
    | "score"
    | "executableForDedicatedTrip"
  >,
): "推荐拍摄" | "可观察" | "仅作备选" | "不建议" {
  if (window.windowLevel === "blocked" || window.recommendationLevel === "not_recommended") {
    return "不建议";
  }
  if (window.recommendationLevel === "backup") {
    return "仅作备选";
  }
  if (
    window.windowLevel === "best" ||
    window.windowLevel === "shootable" ||
    window.executableForDedicatedTrip === true
  ) {
    return window.executableForDedicatedTrip === true ? "推荐拍摄" : "可观察";
  }
  if (window.windowLevel === "watchable" || window.recommendationLevel === "cautious") {
    return "可观察";
  }
  return (window.practicalScore ?? window.score) >= 65 ? "可观察" : "仅作备选";
}

function windowCategoryBadgeVariant(window: ForecastResultWindow): BadgeVariant {
  return glowWindowCategoryBadge(windowDisplayCategory(window));
}

function glowWindowCategoryBadge(category: string): BadgeVariant {
  if (category === "推荐拍摄") {
    return "default";
  }
  if (category === "可观察") {
    return "accent";
  }
  if (category === "不建议") {
    return "danger";
  }
  return "muted";
}

function astroWindowBlockerLabels(blockers: readonly string[]): readonly string[] {
  const text = blockers.join(" ");
  const labels = [
    /低云/.test(text) ? "低云偏多" : "",
    /总云|云量|云层|厚云/.test(text) ? "云量偏高" : "",
    /降水|雨|雪/.test(text) ? "降水干扰" : "",
    /通透|能见度|霾|雾/.test(text) ? "通透度不足" : "",
    /月光/.test(text) ? "月光影响" : "",
    /露|结露|湿度/.test(text) ? "露水风险" : "",
  ].filter(Boolean);

  return [
    ...new Set(
      labels.length > 0 ? labels : blockers.map((blocker) => blocker.replace(/[。.]$/, "")),
    ),
  ].slice(0, 3);
}

function windowActionLabel(window: ForecastResultWindow): string {
  if (window.windowLevel === "blocked") {
    return "不建议专程";
  }
  if (window.windowLevel === "watchable") {
    return "仅作观察";
  }
  if (window.practicalKind === "formation_signal") {
    return "仅作观察";
  }
  const score = window.practicalScore ?? window.score;
  if (score >= 75) {
    return "优先安排";
  }
  if (score >= 65) {
    return "可等待";
  }
  return "作为备选";
}

function glowGeneralFactsText(result: ForecastCalculationResult): string {
  const analysis = result.glowAnalysis;
  return `朝霞机会 ${analysis.sunriseGlowScore} 分，晚霞机会 ${analysis.sunsetGlowScore} 分；色彩云条件${analysis.labels.colorCarrier}（${analysis.colorCarrierScore} 分），低云遮挡风险${analysis.labels.lowCloudObstruction}（${analysis.lowCloudObstructionRisk} 分）。${glowRainImpactText(analysis)}`;
}

function glowGeneralWindowText(result: ForecastCalculationResult): string {
  const mainWindow =
    result.glowAnalysis.bestGlowWindow ??
    result.glowAnalysis.bestGlowWindows[0] ??
    result.glowAnalysis.watchableGlowWindows[0];
  const highConfidence = result.glowAnalysis.bestGlowWindows.find(
    (window) => (window.practicalScore ?? window.score) >= 75,
  );
  const mainText = mainWindow
    ? `主要可观察窗口：${glowWindowDisplayName(mainWindow)} ${formatWindow(
        mainWindow.start,
        mainWindow.end,
      )}。`
    : "主要可观察窗口：暂无。";
  const highText = highConfidence
    ? `高确定性拍摄窗口：${glowWindowDisplayName(highConfidence)} ${formatWindow(
        highConfidence.start,
        highConfidence.end,
      )}。`
    : "高确定性拍摄窗口：暂无。";
  return `${mainText}${highText}`;
}

function glowRainImpactText(analysis: ForecastCalculationResult["glowAnalysis"]): string {
  if (analysis.rainOverlapsSunriseWindow && analysis.rainOverlapsSunsetWindow) {
    return "降水影响日出和日落窗口，霞光不确定性较高。";
  }
  if (analysis.rainOverlapsSunriseWindow) {
    return "降水主要影响清晨窗口，朝霞不确定性较高。";
  }
  if (analysis.rainOverlapsSunsetWindow) {
    return "降水主要影响日落窗口，晚霞需要现场复核云层开口。";
  }
  return `降水对日出/日落窗口影响较小，${postRainOpeningText(analysis.postRainOpeningChance)}。`;
}

function bestGlowWindowForPhase(
  analysis: ForecastCalculationResult["glowAnalysis"],
  phase: "sunrise" | "sunset",
): GlowWindow | undefined {
  return [
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
  ].find((window) =>
    phase === "sunrise" ? isMorningGlowWindow(window) : !isMorningGlowWindow(window),
  );
}

function isMorningGlowWindow(window: Pick<GlowWindow, "type" | "start" | "labelZh">): boolean {
  if (
    window.type === "pre_dawn_glow" ||
    window.type === "sunrise_core" ||
    window.type === "morning_warm_light" ||
    window.type === "sunrise"
  ) {
    return true;
  }
  if (
    window.type === "sunset_warm_light" ||
    window.type === "sunset_core" ||
    window.type === "afterglow" ||
    window.type === "sunset" ||
    window.type === "blue_hour_transition"
  ) {
    return false;
  }
  const hour = hourFromIsoLike(window.start);
  return typeof hour === "number" ? hour < 12 : window.labelZh.includes("朝霞");
}

function glowWindowDisplayName(window: GlowWindow): string {
  if (isMorningGlowWindow(window)) {
    return window.labelZh.includes("日出") || window.labelZh.includes("朝霞")
      ? window.labelZh
      : "朝霞";
  }
  if (window.type === "afterglow" || window.labelZh.includes("余晖")) {
    return window.labelZh.includes("余晖") ? window.labelZh : "日落后余晖";
  }
  return window.labelZh.includes("日落") || window.labelZh.includes("晚霞")
    ? window.labelZh
    : "晚霞";
}

function postRainOpeningText(
  chance: ForecastCalculationResult["glowAnalysis"]["postRainOpeningChance"] | undefined,
): string {
  if (chance === "high") {
    return "雨后开口机会高";
  }
  if (chance === "medium") {
    return "雨后若短暂开口，可转拍云雾层次和远山";
  }
  if (chance === "low") {
    return "雨后开口机会低";
  }
  return "雨后开口待复核";
}

function scoreLabelFromNumber(score: number | undefined): "高" | "中" | "低" {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "低";
  }
  if (score >= 70) {
    return "高";
  }
  if (score >= 45) {
    return "中";
  }
  return "低";
}

function glowRiskText(score: number): "高" | "中" | "低" {
  return scoreLabelFromNumber(score);
}

function glowPracticalAdviceItems(
  result: ForecastCalculationResult,
  items: readonly string[],
): readonly string[] {
  const best = result.glowAnalysis.bestGlowWindow ?? result.glowAnalysis.bestGlowWindows[0];
  const direction =
    result.terrainSummary.viewingDirection === "panoramic"
      ? "全景机位可同时预留东向日出和西向日落构图，现场优先选择太阳方向有开口的位置。"
      : `优先选择${result.terrainSummary.valleyDirectionZh || "开阔"}方向的层次作为前景，避免低云完全压住太阳方向。`;
  const arrival = best
    ? `建议提前到达：${glowWindowDisplayName(best)} ${formatWindow(
        best.start,
        best.end,
      )}，至少预留 40-60 分钟完成构图、测光和安全检查。`
    : "建议提前到达：暂无明确霞光窗口时，只建议短时观察云层开口，不建议长时间空等。";
  const backup =
    result.glowAnalysis.postRainOpeningChance === "medium" ||
    result.glowAnalysis.postRainOpeningChance === "high"
      ? "备选题材：雨后若短暂开口，可转拍云雾层次、远山和局部暖色。"
      : "备选题材：若无霞光，转拍远山层次、云缝光、雾中近景或长焦山脊。";
  const rainAndWhiteout =
    result.glowAnalysis.lowCloudObstructionRisk >= 70 ||
    result.glowAnalysis.precipitationDisruptionRisk >= 65
      ? "风险控制：低云遮挡或降水打断偏强，不建议只为霞光专程前往。"
      : "风险控制：低云和降水暂未形成强阻断，仍需在窗口前复核云底和雨带。";

  return [arrival, direction, backup, rainAndWhiteout, ...items];
}

function formatDerivedWindow(start: string | undefined, end: string | undefined): string {
  return start && end ? formatWindow(start, end) : "暂无数据";
}

function hourFromIsoLike(value: string): number | undefined {
  const match = /T(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : undefined;
}

function firstText(items: readonly string[], fallback: string): string {
  return items[0] ?? fallback;
}

function riskLevelText(level: ForecastCalculationResult["riskFlags"][number]["level"]): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatFullDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = valueFor("year");
  const month = valueFor("month");
  const day = valueFor("day");
  const hour = valueFor("hour");
  const minute = valueFor("minute");

  return year && month && day && hour && minute
    ? `${year}年${month}月${day}日 ${hour}:${minute}`
    : value;
}

function formatOptionalTime(value: string | undefined): string {
  return value ? formatTime(value) : "暂无数据";
}

function dateLabelForResultClient(result: ForecastCalculationResult, date: string): string {
  const index = result.calendarBasis.targetDates.indexOf(date);
  return result.calendarBasis.targetDateLabels[index] ?? date;
}

function confidenceLabel(
  level: ForecastCalculationResult["glowAnalysis"]["confidenceLevel"],
): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function formatWindow(startTime: string, endTime: string): string {
  return formatShootingWindowZh({ startTime, endTime });
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatTemperature(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°C` : "暂无";
}

function formatKilometers(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${roundDisplay(value)} 公里`
    : "暂无";
}

function formatPercentNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "暂无";
}

function formatWind(
  windSpeed: number | null | undefined,
  windDirection: number | null | undefined,
): string {
  const speed =
    typeof windSpeed === "number" && Number.isFinite(windSpeed)
      ? `${roundDisplay(windSpeed)} m/s`
      : "暂无风速";
  const direction =
    typeof windDirection === "number" && Number.isFinite(windDirection)
      ? windDirectionLabel(windDirection)
      : "";
  return direction ? `${speed} ${direction}` : speed;
}

function formatWindWithGust(
  windSpeed: number | null | undefined,
  windDirection: number | null | undefined,
  windGust: number | null | undefined,
): string {
  const wind = formatWind(windSpeed, windDirection);
  return typeof windGust === "number" && Number.isFinite(windGust)
    ? `${wind}，阵风 ${formatWindSpeed(windGust)}`
    : wind;
}

function formatWindSpeed(windSpeed: number | null | undefined): string {
  return typeof windSpeed === "number" && Number.isFinite(windSpeed)
    ? `${roundDisplay(windSpeed)} m/s`
    : "暂无";
}

function formatTemperatureDelta(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${roundDisplay(value)}°C` : "暂无";
}

function windDirectionLabel(value: number): string {
  const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  const normalized = ((value % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index] ?? `${Math.round(value)}°`;
}

function shiftTime(value: string, minutes: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp + minutes * 60 * 1000).toISOString();
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function transparencyGradeLabel(
  grade: string | null | undefined,
  score: number | null | undefined,
): string {
  const normalizedGrade =
    grade ??
    (typeof score === "number" && Number.isFinite(score)
      ? score >= 82
        ? "excellent"
        : score >= 68
          ? "good"
          : score >= 48
            ? "fair"
            : "poor"
      : undefined);
  const labels: Record<string, string> = {
    excellent: "优秀",
    good: "较好",
    fair: "一般",
    poor: "较差",
  };
  const label = normalizedGrade ? labels[normalizedGrade] ?? "待复核" : "待复核";
  return typeof score === "number" && Number.isFinite(score)
    ? `${label} ${Math.round(score)} 分`
    : label;
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "暂无数据";
  }

  return `${Math.round(value * 100)}%`;
}

function formatAngle(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂缺数据";
}

function formatBlockedDirections(directions: readonly string[]): string {
  return directions.length > 0 ? directions.join("、") : "暂无明显方向";
}

function formatMoonAltitudeSummary(values: Readonly<Record<string, number>> | undefined): string {
  if (!values) {
    return "暂无数据";
  }

  const nightValues = ["20", "21", "22", "23", "00", "01", "02", "03", "04"].flatMap((hour) => {
    const value = values[hour];
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });

  if (nightValues.length === 0) {
    return "暂无数据";
  }

  const maxAltitude = Math.max(...nightValues);
  const visibleHours = nightValues.filter((value) => value > 0).length;

  return `最高约 ${maxAltitude.toFixed(1)}°，地平线上 ${visibleHours} 个采样小时`;
}

function moonImpactText(
  astro: ForecastCalculationResult["astroSummaries"][number] | undefined,
): string {
  if (!astro) {
    return "暂无月光影响数据";
  }
  if (astro.moonIllumination < 0.35) {
    return "月光影响较轻";
  }
  if (astro.moonIllumination < 0.65) {
    return "月光影响中等";
  }
  return "月光影响偏强";
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}

function formatElevationValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `约 ${Math.round(value)} 米`
    : "暂未确认";
}

function formatReliefValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `约 ${Math.round(value)} 米`
    : "周边高差暂未计算";
}

function terrainPotentialLabel(
  potential: ForecastCalculationResult["terrainAnalysis"]["terrainProfile"]["terrainCloudSeaPotential"],
): string {
  if (potential === "high") {
    return "高";
  }
  if (potential === "medium") {
    return "中";
  }
  return "低";
}

function formatWgs84Coordinates(result: ForecastCalculationResult["calendarBasis"]): string {
  return `${formatCoordinate(result.wgs84Coordinates.latitude)}, ${formatCoordinate(
    result.wgs84Coordinates.longitude,
  )}`;
}
