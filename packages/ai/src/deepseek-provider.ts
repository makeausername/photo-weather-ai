import {
  decisionCardSchema,
  deepSeekResponseFormat,
  formatArrivalDeadlineZh,
  formatShootingWindowZh,
  normalizeDeepSeekModel,
  type ForecastWeatherSourceErrorCategory,
  type DeepSeekReasoningEffort,
} from "@photo-weather/shared";
import type { DecisionCard, ForecastCalculationResult } from "@photo-weather/shared";
import { z } from "zod";
import { MockAIProvider } from "./mock-provider.js";
import type {
  AIProvider,
  DecisionCardInput,
  ForecastAiExplanation,
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
};

export const missingDeepSeekApiKeyMessage = "请先填写 DeepSeek API Key。";

const deepSeekRealModeDisabledMessage =
  "DeepSeek 真实调用未启用，请先在后台服务商配置中启用真实调用。";

const deepSeekProviderDisabledMessage =
  "DeepSeek 服务商未启用，请先在后台服务商配置中启用 DeepSeek。";

const defaultBaseUrl = "https://api.deepseek.com";
const defaultTemperature = 0.2;
const defaultMaxTokens = 4000;
const defaultTimeoutMs = 90000;
const maxInterpretationPayloadChars = 18000;

export type DeepSeekProviderErrorOptions = {
  readonly errorCategory: ForecastWeatherSourceErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  readonly cause?: unknown;
};

export class DeepSeekProviderError extends Error {
  readonly errorCategory: ForecastWeatherSourceErrorCategory;
  readonly messageZh: string;
  readonly statusCode?: number;
  readonly latencyMs?: number;
  override readonly cause?: unknown;

  constructor(options: DeepSeekProviderErrorOptions) {
    super(options.messageZh);
    this.name = "DeepSeekProviderError";
    this.errorCategory = options.errorCategory;
    this.messageZh = options.messageZh;
    this.statusCode = options.statusCode;
    this.latencyMs = options.latencyMs;
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

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultTimeoutMs;
  }

  return Math.min(120000, Math.max(60000, Math.round(value)));
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

function getMessageContent(response: DeepSeekChatResponse, latencyMs?: number): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw deepSeekError({
      errorCategory: "parse_error",
      messageZh: "DeepSeek 返回格式异常。",
      latencyMs,
    });
  }

  return content;
}

function parseDeepSeekChatResponse(text: string, latencyMs: number): DeepSeekChatResponse {
  try {
    return JSON.parse(text) as DeepSeekChatResponse;
  } catch (error) {
    throw deepSeekError({
      errorCategory: "parse_error",
      messageZh: "DeepSeek 返回格式异常。",
      latencyMs,
      cause: error,
    });
  }
}

function normalizeDeepSeekRequestError(error: unknown, latencyMs: number): DeepSeekProviderError {
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
      cause: error,
    });
  }

  return deepSeekError({
    errorCategory: "network",
    messageZh: "DeepSeek 网络不可用。",
    latencyMs,
    cause: error,
  });
}

function takeItems<T>(items: readonly T[] | undefined, count: number): readonly T[] {
  return items?.slice(0, count) ?? [];
}

function takeTextItems(items: readonly string[] | undefined, count: number, maxLength = 120) {
  return takeItems(items, count).map((item) => limitText(item, maxLength));
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
    reasons: takeTextItems(score.reasons, 2),
    risks: takeTextItems(score.risks, 2),
  };
}

function compactTargetAnalysis(result: ForecastCalculationResult) {
  if (result.target === "cloud_sea") {
    const timezone = result.calendarBasis.timezone;
    const analysis = result.cloudSeaAnalysis;

    return {
      target: result.target,
      confidenceLevel: analysis.confidenceLevel,
      formationScore: analysis.formationScore,
      shootableScore: analysis.shootableScore,
      opportunityScore: analysis.cloudSeaOpportunityScore,
      whiteoutRiskScore: analysis.whiteoutRiskScore,
      lightAlignedScore: analysis.lightAlignedScore,
      confidence: analysis.confidence,
      labels: analysis.labels,
      recommendationLabel: analysis.recommendationLabel,
      terrainSupport: compactCloudSeaTerrainSupport(analysis.terrainSupport),
      rainOpening: compactCloudSeaRainOpening(analysis.rainOpening),
      bestWindow: compactCloudSeaAnalysisWindow(analysis.bestCloudSeaWindow, timezone),
      watchableWindows: takeItems(analysis.watchableCloudSeaWindows, 2).map((window) =>
        compactCloudSeaAnalysisWindow(window, timezone),
      ),
      notRecommendedWindows: takeItems(analysis.notRecommendedCloudSeaWindows, 2).map((window) =>
        compactCloudSeaAnalysisWindow(window, timezone),
      ),
      dailySignals: takeItems(analysis.dailyCloudSea, 3).map((day) => ({
        date: day.date,
        dateZh: day.dateLabelZh,
        formationScore: day.formationScore ?? day.opportunityScore,
        shootableScore: day.shootableScore ?? day.travelScore,
        whiteoutRiskScore: day.whiteoutRiskScore,
        lightAlignedScore: day.lightAlignedScore,
        confidence: day.confidence,
        labels: day.labels,
        rainOpening: compactCloudSeaRainOpening(day.rainOpening),
        onSiteCheckpoints: takeTextItems(day.onSiteCheckpoints, 3, 80),
        recommendationLabel: day.recommendationLabel,
        keyReason: limitText(day.keyReason, 120),
        riskNote: limitText(day.riskNote, 120),
      })),
      formationReasons: takeTextItems(analysis.opportunityReasons, 4, 120),
      whiteoutReasons: takeTextItems(analysis.whiteoutReasons, 4, 120),
      travelRecommendations: takeItems(analysis.travelRecommendations, 3).map((item) => ({
        situation: item.situation,
        action: limitText(item.action, 80),
        detail: limitText(item.detail, 120),
      })),
      missingDataNotes: takeTextItems(analysis.missingDataNotes, 4, 120),
    };
  }

  if (result.target === "glow") {
    return {
      target: result.target,
      confidenceLevel: result.glowAnalysis.confidenceLevel,
      sunriseGlowScore: result.glowAnalysis.sunriseGlowScore,
      sunsetGlowScore: result.glowAnalysis.sunsetGlowScore,
      lowCloudObstructionRisk: result.glowAnalysis.lowCloudObstructionRisk,
      recommendationLabel: result.glowAnalysis.recommendationLabel,
      bestWindows: takeItems(result.glowAnalysis.bestGlowWindows, 3),
      missingDataNotes: takeTextItems(result.glowAnalysis.missingDataNotes, 4),
    };
  }

  if (result.target === "astro") {
    return {
      target: result.target,
      confidenceLevel: result.astroAnalysis.confidenceLevel,
      starsScore: result.astroAnalysis.starsScore,
      milkyWayScore: result.astroAnalysis.milkyWayScore,
      moonImpactScore: result.astroAnalysis.moonImpactScore,
      recommendationLabel: result.astroAnalysis.recommendationLabel,
      bestWindows: takeItems(result.astroAnalysis.bestAstroWindows, 3),
      missingDataNotes: takeTextItems(result.astroAnalysis.missingDataNotes, 4),
    };
  }

  return {
    target: result.target,
    confidenceLevel: result.weatherFusionSummary?.confidenceLevel,
    recommendationLabel: result.recommendationLabel,
  };
}

function compactCloudSeaAnalysisWindow(
  window:
    | ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindow"]
    | ForecastCalculationResult["cloudSeaAnalysis"]["bestCloudSeaWindows"][number]
    | undefined,
  timezone: string,
) {
  if (!window) {
    return null;
  }

  return {
    labelZh: window.label,
    date: window.date,
    windowZh: formatShootingWindowZh(window, timezone),
    score: window.score,
    formationScore: window.formationScore,
    shootableScore: window.shootableScore,
    whiteoutRiskScore: window.whiteoutRiskScore,
    lightAlignedScore: window.lightAlignedScore,
    phase: window.phase,
    riskTag: window.riskTag,
    noteZh: limitText(window.noteZh, 120),
  };
}

function compactCloudSeaTerrainSupport(
  terrain: ForecastCalculationResult["cloudSeaAnalysis"]["terrainSupport"],
) {
  return {
    score: terrain.score,
    level: terrain.level,
    selectedSpotElevationMeters: terrain.selectedSpotElevationMeters,
    nearbyValleyElevationMeters: terrain.nearbyValleyElevationMeters,
    localReliefMeters: terrain.localReliefMeters,
    terrainType: terrain.terrainType,
    exposureType: terrain.exposureType,
    confidence: terrain.confidence,
    messageZh: limitText(terrain.messageZh, 120),
  };
}

function compactCloudSeaRainOpening(
  signal: ForecastCalculationResult["cloudSeaAnalysis"]["rainOpening"] | undefined,
) {
  if (!signal) {
    return undefined;
  }

  return {
    rainSupportSignal: signal.rainSupportSignal,
    activeRainDuringWindow: signal.activeRainDuringWindow,
    postRainOpeningChance: signal.postRainOpeningChance,
    messageZh: limitText(signal.messageZh, 120),
  };
}

export function buildDeepSeekForecastContext(result: ForecastCalculationResult) {
  const timezone = result.calendarBasis.timezone;
  const dailyFacts = takeItems(result.dailySummaries, 3).map((summary) =>
    compactDailyFact(result, summary, timezone),
  );

  return {
    contextVersion: "forecast-interpretation-v3",
    note: "All values are precomputed deterministic facts. Interpret only; do not calculate or invent.",
    place: {
      name: result.place.name,
      countryCode: result.place.countryCode,
    },
    forecastHorizon: {
      key: result.horizon,
      rangeZh: result.calendarBasis.forecastRangeLabel,
      timezone: result.calendarBasis.timezone,
      generatedAt: result.generatedAt,
    },
    target: result.target,
    overallDecision: {
      score: result.overallScore,
      recommendationLevel: result.recommendationLevel,
      recommendationLabelZh: result.recommendationLabel,
      confidenceLabelZh: confidenceLabelZh(result.weatherFusionSummary?.confidenceLevel),
      summaryZh: limitText(result.summary, 180),
    },
    topicScores: Object.values(result.scores).map(compactScore),
    topRankedWindows: takeItems(result.bestWindows, 3).map((window) =>
      compactForecastWindow(window, timezone),
    ),
    riskFlags: compactRiskFlags(result.riskFlags, 6),
    keyReasons: takeTextItems(result.keyReasons, 6),
    deterministicActionSuggestions: takeTextItems(result.photographyAdvice, 4, 150),
    clothingGuide: {
      titleZh: result.clothingGuide.titleZh,
      summaryZh: limitText(result.clothingGuide.summaryZh, 180),
      comfortLevel: result.clothingGuide.comfortLevel,
      layers: takeTextItems(result.clothingGuide.layers, 4),
      accessories: takeTextItems(result.clothingGuide.accessories, 4),
      riskNotes: takeTextItems(result.clothingGuide.riskNotes, 4, 150),
    },
    currentWeatherSummary: result.currentWeather
      ? {
          observedAt: result.currentWeather.observedAt,
          temperatureZh: formatTemperatureValue(result.currentWeather.temperature),
          feelsLikeZh: formatTemperatureValue(result.currentWeather.feelsLike),
          mountainFeelsLikeZh: formatTemperatureValue(result.currentWeather.mountainFeelsLikeC),
          humidityPercent: result.currentWeather.humidity,
          dewPointZh: formatTemperatureValue(result.currentWeather.dewPoint),
          windZh: formatWindValue(result.currentWeather.windSpeed, result.currentWeather.windGust),
          visibilityZh: formatDistanceKm(result.currentWeather.visibility),
          cloudTotalPercent: result.currentWeather.cloudTotal,
          cloudLowPercent: result.currentWeather.cloudLow,
          cloudMidPercent: result.currentWeather.cloudMid,
          cloudHighPercent: result.currentWeather.cloudHigh,
          rainRiskZh: rainRiskSummaryZh(result.currentWeather),
          exposedRidgeWindRisk: result.currentWeather.exposedRidgeWindRisk,
          tripodStabilityRisk: result.currentWeather.tripodStabilityRisk,
          windChillNoteZh: result.currentWeather.windChillNoteZh,
          clothingRiskNoteZh: result.currentWeather.clothingRiskNoteZh,
          weatherTextZh: result.currentWeather.weatherTextZh,
        }
      : null,
    sourceStatus: {
      dataMode: result.weatherDataMode,
      noticeZh: providerNeutralText(result.weatherNoticeZh),
      missingFields: takeItems(result.weatherMissingFields, 8),
      estimatedFields: takeItems(result.weatherEstimatedFields, 8),
      missingDataNotes: providerNeutralItems(result.weatherMissingDataNotes, 4),
      fusionConfidenceLevel: result.weatherFusionSummary?.confidenceLevel,
      conflictStatusZh: providerNeutralText(result.weatherFusionSummary?.conflictStatusZh),
      dataStatusZh: providerNeutralText(result.weatherFusionSummary?.dataStatusZh),
    },
    astroFacts: {
      dataSourceLabelZh: result.astroDataSourceLabelZh,
      calculationBasis: result.astroCalculationBasis
        ? {
            timezone: result.astroCalculationBasis.timezone,
            elevationMeters: result.astroCalculationBasis.elevationMeters,
            generatedAt: result.astroCalculationBasis.generatedAt,
          }
        : undefined,
      summaries: takeItems(result.astroSummaries, 2).map((summary) => ({
        date: summary.date,
        sunrise: summary.sunrise,
        sunset: summary.sunset,
        moonIllumination: summary.moonIllumination,
        moonPhaseNameZh: summary.moonPhaseNameZh,
        milkyWayWindowStart: summary.milkyWayWindowStart,
        milkyWayWindowEnd: summary.milkyWayWindowEnd,
        milkyWayBestTime: summary.milkyWayBestTime,
        milkyWayDirection: summary.milkyWayDirection,
        milkyWayVisibilityLevel: summary.milkyWayVisibilityLevel,
        milkyWayNoteZh: summary.milkyWayNoteZh,
      })),
      practicalStatus: {
        starsScore: result.astroAnalysis.starsScore,
        milkyWayScore: result.astroAnalysis.milkyWayScore,
        astroShootable: result.astroAnalysis.astroShootable,
        recommendationLabelZh: result.astroAnalysis.recommendationLabel,
        weatherBlockers: takeTextItems(result.astroAnalysis.weatherBlockers, 4),
        recommendedMilkyWayWindows: takeItems(result.astroAnalysis.recommendedMilkyWayWindows, 2).map(
          (window) => ({
            labelZh: window.labelZh,
            windowZh: formatShootingWindowZh(
              { startTime: window.start, endTime: window.end },
              timezone,
            ),
            score: window.score,
            noteZh: window.noteZh,
          }),
        ),
      },
    },
    terrainFacts: {
      dataSourceLabelZh: result.terrainAnalysis.dataSourceLabelZh,
      isMock: result.terrainAnalysis.isMock,
      locationElevation: result.terrainSummary.locationElevation,
      elevationMeters: result.terrainSummary.elevationMeters,
      elevationSource: result.terrainSummary.elevationSource,
      elevationConfidence: result.terrainSummary.elevationConfidence,
      terrainType: result.terrainSummary.terrainType,
      exposureType: result.terrainSummary.exposureType,
      viewingDirection: result.terrainSummary.viewingDirection,
      nearbyValleyElevationMeters: result.terrainSummary.nearbyValleyElevationMeters,
      localReliefMeters: result.terrainSummary.localReliefMeters,
      elevationDiff5km: result.terrainSummary.elevationDiff5km,
      terrainCloudSeaPotential: result.terrainSummary.terrainCloudSeaPotential,
      terrainNoteZh: limitText(result.terrainSummary.terrainNoteZh, 160),
      obstructionNoteZh: limitText(result.terrainSummary.obstructionNoteZh, 160),
    },
    targetAnalysis: compactTargetAnalysis(result),
    dailySummaries: dailyFacts,
    dataNoticeZh: limitText(providerNeutralText(result.dataNotice), 220),
    isMock: result.isMock,
  };
}

function compactForecastWindow(
  window: ForecastCalculationResult["bestWindows"][number],
  timezone = "Asia/Shanghai",
) {
  return {
    labelZh: windowLabelZh(window),
    windowZh: formatShootingWindowZh(window, timezone),
    score: window.score,
    target: window.target,
    conditionScore: window.conditionScore,
    practicalScore: window.practicalScore,
    practicalKind: window.practicalKind,
    lightPhase: window.lightPhase,
    subjectPriorityLabel: window.subjectPriorityLabel,
    arrivalAdvice: window.arrivalAdvice
      ? {
          recommendedArrivalLabel: window.arrivalAdvice.recommendedArrivalLabel,
          recommendedArrivalZh: formatArrivalDeadlineZh(
            window.arrivalAdvice.recommendedArrivalTime,
            timezone,
          ),
          setupBufferMinutes: window.arrivalAdvice.setupBufferMinutes,
          reasonZh: limitText(window.arrivalAdvice.reasonZh, 120),
          warningZh: limitText(window.arrivalAdvice.warningZh, 120),
        }
      : undefined,
    copyReasonZh: limitText(window.copyReasonZh ?? window.practicalNoteZh, 140),
    weatherBlockers: takeTextItems(window.weatherBlockers, 3),
    precipitationRiskZh: window.precipitationRisk
      ? `${window.precipitationRisk.rainRiskLabelZh}，${window.precipitationRisk.recommendationZh}`
      : undefined,
  };
}

function compactForecastWindowBrief(
  window: ForecastCalculationResult["bestWindows"][number],
  timezone = "Asia/Shanghai",
) {
  return {
    labelZh: windowLabelZh(window),
    date: window.date,
    windowZh: formatShootingWindowZh(window, timezone),
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

function compactDailyFact(
  result: ForecastCalculationResult,
  summary: ForecastCalculationResult["dailySummaries"][number],
  timezone: string,
) {
  const breakdown = result.targetDailyBreakdown.find((item) => item.date === summary.date);
  const bestWindow = summary.bestShootableWindow ?? summary.keyWindows[0];

  return {
    date: summary.date,
    dateZh: summary.dateLabelZh,
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
          ? formatShootingWindowZh(
              { startTime: window.startTime, endTime: window.endTime },
              timezone,
            )
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

function windowLabelZh(window: Pick<ForecastCalculationResult["bestWindows"][number], "label" | "target" | "startTime" | "endTime" | "subjectPriorityLabel" | "lightPhase" | "practicalKind" | "weatherBlockers">): string {
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
    return "云海形成信号";
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

function providerNeutralItems(
  items: readonly string[] | undefined,
  count: number,
): readonly string[] {
  return takeItems(items, count).map((item) => limitText(providerNeutralText(item) ?? item));
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

function formatTemperatureValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°C` : "待复核";
}

function formatWindValue(speed: number | null | undefined, gust?: number | null): string {
  if (typeof speed !== "number" || !Number.isFinite(speed)) {
    return "风力待复核";
  }
  const gustText = typeof gust === "number" && Number.isFinite(gust) ? `，阵风 ${roundDisplay(gust)} m/s` : "";
  return `${roundDisplay(speed)} m/s${gustText}`;
}

function formatDistanceKm(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${roundDisplay(value)} 公里` : "待复核";
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

function assertInterpretationPayloadSize(content: string): string {
  if (content.length <= maxInterpretationPayloadChars) {
    return content;
  }

  throw deepSeekError({
    errorCategory: "unsupported",
    messageZh: "DeepSeek 解读上下文过大，请稍后重试。",
  });
}

function buildJsonOnlySystemPrompt(): string {
  return [
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
    | "responseFormat"
    | "thinkingEnabled"
    | "reasoningEffort"
    | "jsonOutputEnabled"
  > = {},
): DeepSeekRequestPreview {
  const responseFormat = normalizeResponseFormat(options.responseFormat);
  const jsonOutputEnabled = options.jsonOutputEnabled ?? responseFormat === "json_object";
  const userPayload = {
    task: "请基于 computedForecastFacts 输出专业风光摄影决策解读 JSON。",
    outputSchema: {
      conclusion: {
        titleZh: "报告标题",
        summaryZh: "两到三句话总结天气大势和拍摄价值",
        recommendedDayZh: "最建议冲哪一天，必须包含具体日期和理由",
        recommendationLevelZh: "推荐等级",
        whetherWorthDedicatedTripZh: "推荐专程前往/谨慎参考/不建议专程前往/已在附近可观察/仅作备选",
        oneSentenceDecisionZh: "一句话出行决策",
      },
      bestPlan: {
        primaryTargetZh: "主拍题材",
        bestDateZh: "最佳日期",
        bestWindowZh: "最佳窗口，必须包含完整日期和时间",
        recommendedArrivalZh: "建议到达时间，必须包含完整日期和时间",
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
          bestWindowZh: "当天最佳窗口，必须包含完整日期和时间；没有则说明暂无",
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
      "只解释 computedForecastFacts 中已有的确定性事实。",
      "不要计算、推断或改写天气、天文、地形、坐标、评分和服务商结果。",
      "不要生成输入中没有的小时级天气、天文窗口或分数。",
      "不要说云海概率，除非输入事实明确提供概率；优先使用云海机会、云海分数、形成条件。",
      "必须区分日出、朝霞、日落、晚霞和日落后余晖；夜间或傍晚窗口不得写成朝霞。",
      "有天文窗口不代表能拍银河；如果云量、低云、降水或通透度不支持，必须明确不建议专程。",
      "重要窗口必须输出完整日期和时间，例如 2026年5月28日 04:07–06:07。",
      "每条建议必须绑定具体日期、窗口、题材或风险，不要泛泛而谈。",
      "如果 isMock=true，必须明确这是演示数据解读，只适合体验分析流程和规划参考。",
      "输出 JSON only。",
    ],
    safetyRules: [
      "Do not invent weather data.",
      "Do not recompute astronomy.",
      "Do not recompute coordinates.",
      "Do not override deterministic scores.",
      "Do not claim mock weather is real forecast.",
      "Output Simplified Chinese.",
      "Output json only.",
    ],
    userGoal: input.userGoal ?? null,
    computedForecastFacts: buildDeepSeekForecastContext(input.forecastResult),
  };
  const body: DeepSeekRequestBody = {
    model: normalizeModel(options.defaultModel),
    messages: [
      {
        role: "system",
        content: buildJsonOnlySystemPrompt(),
      },
      {
        role: "user",
        content: assertInterpretationPayloadSize(JSON.stringify(userPayload)),
      },
    ],
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
  };
}

export function createRuleBasedForecastExplanation(
  result: ForecastCalculationResult,
): ForecastAiExplanation {
  const timezone = result.calendarBasis.timezone;
  const bestWindow = result.bestWindows.find(isExecutableWindow) ?? result.bestWindows[0];
  const backupWindow = result.bestWindows.find((window) => window !== bestWindow);
  const bestDaily = bestDailySummaryForPlan(result, bestWindow);
  const dedicatedDecision = dedicatedTripDecisionZh(result, bestDaily);
  const clothing = [
    result.clothingGuide.summaryZh,
    ...result.clothingGuide.layers.slice(0, 2),
  ]
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
        ? `最值得关注的是 ${bestDaily.dateLabelZh}，${bestDaily.bestShootableWindow ? `${windowLabelZh(bestDaily.bestShootableWindow)} ${formatShootingWindowZh(bestDaily.bestShootableWindow, timezone)}` : bestDaily.shortAdvice}`
        : "暂无足够逐日数据，先参考确定性评分和窗口列表。",
      recommendationLevelZh: result.recommendationLabel,
      whetherWorthDedicatedTripZh: dedicatedDecision,
      oneSentenceDecisionZh: `${dedicatedDecision}；优先看${bestWindow ? `${windowLabelZh(bestWindow)} ${formatShootingWindowZh(bestWindow, timezone)}` : "后续天气更新"}。`,
    },
    bestPlan: {
      primaryTargetZh: bestWindow ? windowLabelZh(bestWindow) : bestSubjectFromScores(result),
      bestDateZh: bestDaily?.dateLabelZh ?? bestWindow?.date ?? "日期待复核",
      bestWindowZh: bestWindow
        ? formatShootingWindowZh(bestWindow, timezone)
        : "暂无高确定性拍摄窗口",
      recommendedArrivalZh: bestWindow?.arrivalAdvice
        ? formatArrivalDeadlineZh(bestWindow.arrivalAdvice.recommendedArrivalTime, timezone)
        : bestWindow
          ? `建议在 ${formatShootingWindowZh(bestWindow, timezone)} 前预留机位和取景时间`
          : "暂无明确到达时间",
      whyThisWindowZh:
        bestWindow?.copyReasonZh ??
        bestWindow?.practicalNoteZh ??
        result.keyReasons[0] ??
        "当前窗口在确定性评分中排序靠前。",
      backupPlanZh: backupWindow
        ? `${windowLabelZh(backupWindow)} ${formatShootingWindowZh(backupWindow, timezone)}`
        : "若主窗口不成立，转向近景、云层纹理或等待下一轮短临预报。",
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
      cloudSeaZh: `${scoreSentence(result.scores.cloudSea)} 白墙风险 ${result.scores.whiteoutRisk.score} 分，重点复核低云厚度、湿度、风和能见度。`,
      sunriseGlowZh: `${scoreSentence(result.scores.sunriseGlow)} 日出前后需要看东方低云遮挡和中高云承载色彩。`,
      sunsetGlowZh: `${scoreSentence(result.scores.sunsetGlow)} 傍晚必须区分日落暖光、晚霞和日落后余晖，现场看西向云层开口。`,
      astroMilkyWayZh: astroAdviceZh(result),
      transparencyZh: `${scoreSentence(result.scores.transparency)} 通透度会直接影响远山层次、长焦山脊和银河暗部细节。`,
    },
    riskAndGear: {
      keyRisks:
        result.riskFlags.length > 0
          ? takeItems(result.riskFlags, 6).map((risk) => `${risk.label}：${risk.description}`)
          : ["暂无高等级风险，但山地天气仍需出发前复核。"],
      clothingZh: clothing || result.clothingGuide.titleZh,
      gearZh: gear || "建议带防风外套、防潮袋、头灯、备用电池和镜头布。",
      safetyZh:
        bestWindow?.arrivalAdvice?.warningZh ??
        "山地机位保留撤离时间，遇到强风、雷雨、低能见度或道路风险时不要硬等窗口。",
    },
    finalAdvice: {
      goNoGoZh: `${dedicatedDecision}。${result.keyReasons[0] ?? result.summary}`,
      ifAlreadyNearbyZh: nearbyDecisionZh(result, bestDaily),
      ifDedicatedTripZh: dedicatedDecision.includes("推荐")
        ? "可以把主窗口作为计划核心，但出发前仍要复核短临降水、低云和风。"
        : "不建议只为单一窗口远途出发，除非还有住宿、机位和备选题材支撑。",
      nextCheckZh: "下次重点复核短临降水、低云高度、能见度、阵风和主窗口前后云层开口。",
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
    dateZh: summary.dateLabelZh,
    recommendationZh: summary.dedicatedTripRecommendation ?? summary.recommendationLabel,
    scoreZh: `综合 ${summary.score} 分`,
    temperatureZh: summary.weather
      ? formatTemperatureRange(summary.weather.tempMin, summary.weather.tempMax)
      : "温度待复核",
    rainZh: summary.weather ? `${rainRiskSummaryZh(summary.weather)}；${rainTimingSummaryZh(summary.weather)}` : "降水待复核",
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
      ? `${windowLabelZh(bestWindow)} ${formatShootingWindowZh(bestWindow, timezone)}`
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

function scoreSentence(score: ForecastCalculationResult["scores"][keyof ForecastCalculationResult["scores"]]): string {
  return `${score.label} ${Math.round(score.score)} 分，${score.reasons[0] ?? "仍需现场复核"}`;
}

function bestSubjectFromScores(result: ForecastCalculationResult): string {
  return [
    result.scores.cloudSea,
    result.scores.sunriseGlow,
    result.scores.sunsetGlow,
    result.scores.milkyWay,
    result.scores.transparency,
  ].sort((left, right) => right.score - left.score)[0]?.label ?? "综合题材";
}

function dedicatedTripDecisionZh(
  result: ForecastCalculationResult,
  day: ForecastCalculationResult["dailySummaries"][number] | undefined,
): string {
  if (day?.dedicatedTripRecommendation) {
    return day.dedicatedTripRecommendation;
  }
  if (result.recommendationLabel.includes("不建议")) {
    return "不建议专程前往";
  }
  if (result.recommendationLabel.includes("谨慎")) {
    return "谨慎参考";
  }
  if (result.overallScore >= 70) {
    return "推荐专程前往";
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
      responseFormat: this.responseFormat,
      thinkingEnabled: this.thinkingEnabled,
      reasoningEffort: this.reasoningEffort,
      jsonOutputEnabled: this.jsonOutputEnabled,
    });
    const parsed = await this.request(request);

    const explanation = this.validateJsonOutput(forecastAiExplanationSchema, parsed);
    return {
      ...explanation,
      metadata: explanation.metadata ?? {
        source: "deepseek",
      },
    };
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
      return schema.parse(JSON.parse(rawOutput));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw deepSeekError({
          errorCategory: "parse_error",
          messageZh: "DeepSeek 返回格式异常。",
          cause: error,
        });
      }
      if (error instanceof z.ZodError) {
        throw deepSeekError({
          errorCategory: "parse_error",
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
          errorCategory:
            response.status === 401 || response.status === 403 ? "invalid_key" : "provider_error",
          messageZh:
            response.status === 401 || response.status === 403
              ? "DeepSeek API Key 无效或权限不足。"
              : `DeepSeek 服务请求失败，状态码 ${response.status}。`,
          statusCode: response.status,
          latencyMs,
        });
      }

      return getMessageContent(parseDeepSeekChatResponse(text, latencyMs), latencyMs);
    } catch (error) {
      throw normalizeDeepSeekRequestError(error, Date.now() - startedAt);
    } finally {
      clearTimeout(timeout);
    }
  }

  private getApiKey(): string {
    if (!this.realModeEnabled) {
      throw new Error(deepSeekRealModeDisabledMessage);
    }

    if (!this.enabled) {
      throw new Error(deepSeekProviderDisabledMessage);
    }

    if (!this.apiKey) {
      throw new Error(missingDeepSeekApiKeyMessage);
    }

    return this.apiKey;
  }
}
