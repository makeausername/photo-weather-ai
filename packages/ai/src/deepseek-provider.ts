import {
  decisionCardSchema,
  deepSeekResponseFormat,
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
const maxInterpretationPayloadChars = 12000;

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

export const forecastAiExplanationSchema = z.object({
  summary: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
  mainReasons: z.array(z.string().trim().min(1)).min(1).max(8),
  mainRisks: z.array(z.string().trim().min(1)).max(8),
  photographerAdvice: z.array(z.string().trim().min(1)).min(1).max(8),
  backupPlan: z.array(z.string().trim().min(1)).min(1).max(8),
  confidenceNote: z.string().trim().min(1),
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

function compactScore(
  score: ForecastCalculationResult["scores"][keyof ForecastCalculationResult["scores"]],
) {
  return {
    key: score.key,
    label: score.label,
    score: score.score,
    level: score.level,
    reasons: takeItems(score.reasons, 3),
    risks: takeItems(score.risks, 3),
  };
}

function compactSourceSummary(
  summary: ForecastCalculationResult["weatherSourceSummaries"][number],
) {
  return {
    providerCode: summary.providerCode,
    providerLabelZh: summary.providerLabelZh,
    dataMode: summary.dataMode,
    attempted: summary.attempted,
    success: summary.success,
    partial: summary.partial,
    status: summary.status,
    errorCategory: summary.errorCategory,
    messageZh: summary.messageZh,
    extractedFields: takeItems(summary.extractedFields ?? summary.availableFields, 16),
    missingFields: takeItems(summary.missingFields, 16),
  };
}

function compactTargetAnalysis(result: ForecastCalculationResult) {
  if (result.target === "cloud_sea") {
    return {
      target: result.target,
      confidenceLevel: result.cloudSeaAnalysis.confidenceLevel,
      opportunityScore: result.cloudSeaAnalysis.cloudSeaOpportunityScore,
      whiteoutRiskScore: result.cloudSeaAnalysis.whiteoutRiskScore,
      recommendationLabel: result.cloudSeaAnalysis.recommendationLabel,
      bestWindows: takeItems(result.cloudSeaAnalysis.bestCloudSeaWindows, 4),
      missingDataNotes: takeItems(result.cloudSeaAnalysis.missingDataNotes, 6),
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
      bestWindows: takeItems(result.glowAnalysis.bestGlowWindows, 4),
      missingDataNotes: takeItems(result.glowAnalysis.missingDataNotes, 6),
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
      bestWindows: takeItems(result.astroAnalysis.bestAstroWindows, 4),
      missingDataNotes: takeItems(result.astroAnalysis.missingDataNotes, 6),
    };
  }

  return {
    target: result.target,
    confidenceLevel: result.weatherFusionSummary?.confidenceLevel,
    recommendationLabel: result.recommendationLabel,
  };
}

export function buildDeepSeekForecastContext(result: ForecastCalculationResult) {
  return {
    contextVersion: "forecast-interpretation-v2",
    note: "All values are precomputed read-only facts. Interpret them only.",
    place: {
      name: result.place.name,
      countryCode: result.place.countryCode,
      coordinates: result.place.coordinates,
    },
    horizon: result.horizon,
    target: result.target,
    forecastStart: result.forecastStart,
    forecastEnd: result.forecastEnd,
    overallScore: result.overallScore,
    recommendationLevel: result.recommendationLevel,
    recommendationLabel: result.recommendationLabel,
    summary: result.summary,
    scores: Object.values(result.scores).map(compactScore),
    bestWindows: takeItems(result.bestWindows, 6).map(compactForecastWindow),
    riskFlags: takeItems(result.riskFlags, 8),
    keyReasons: takeItems(result.keyReasons, 8),
    photographyAdvice: takeItems(result.photographyAdvice, 5),
    clothingGuide: {
      titleZh: result.clothingGuide.titleZh,
      summaryZh: result.clothingGuide.summaryZh,
      comfortLevel: result.clothingGuide.comfortLevel,
      layers: takeItems(result.clothingGuide.layers, 5),
      accessories: takeItems(result.clothingGuide.accessories, 5),
      riskNotes: takeItems(result.clothingGuide.riskNotes, 5),
    },
    currentWeather: result.currentWeather
      ? {
          observedAt: result.currentWeather.observedAt,
          temperature: result.currentWeather.temperature,
          feelsLike: result.currentWeather.feelsLike,
          humidity: result.currentWeather.humidity,
          dewPoint: result.currentWeather.dewPoint,
          windSpeed: result.currentWeather.windSpeed,
          windDirection: result.currentWeather.windDirection,
          visibility: result.currentWeather.visibility,
          cloudTotal: result.currentWeather.cloudTotal,
          cloudLow: result.currentWeather.cloudLow,
          cloudMid: result.currentWeather.cloudMid,
          cloudHigh: result.currentWeather.cloudHigh,
          precipitation: result.currentWeather.precipitation,
          precipitationProbability: result.currentWeather.precipitationProbability,
          weatherTextZh: result.currentWeather.weatherTextZh,
          missingFields: result.currentWeather.missingFields,
        }
      : undefined,
    providerSourceSummaries: result.weatherSourceSummaries.map(compactSourceSummary),
    weatherConfidence: {
      dataMode: result.weatherDataMode,
      noticeZh: result.weatherNoticeZh,
      missingFields: takeItems(result.weatherMissingFields, 20),
      estimatedFields: takeItems(result.weatherEstimatedFields, 20),
      missingDataNotes: takeItems(result.weatherMissingDataNotes, 8),
      fusionConfidenceLevel: result.weatherFusionSummary?.confidenceLevel,
      confidenceByTarget: result.weatherFusionSummary?.confidenceByTarget,
      conflictStatusZh: result.weatherFusionSummary?.conflictStatusZh,
      dataStatusZh: result.weatherFusionSummary?.dataStatusZh,
    },
    astroFacts: {
      dataSourceLabelZh: result.astroDataSourceLabelZh,
      calculationBasis: result.astroCalculationBasis
        ? {
            coordinateSystem: result.astroCalculationBasis.coordinateSystem,
            timezone: result.astroCalculationBasis.timezone,
            elevationMeters: result.astroCalculationBasis.elevationMeters,
            generatedAt: result.astroCalculationBasis.generatedAt,
          }
        : undefined,
      summaries: takeItems(result.astroSummaries, 3).map((summary) => ({
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
    },
    terrainFacts: {
      dataSourceLabelZh: result.terrainAnalysis.dataSourceLabelZh,
      isMock: result.terrainAnalysis.isMock,
      locationElevation: result.terrainSummary.locationElevation,
      elevationDiff5km: result.terrainSummary.elevationDiff5km,
      terrainCloudSeaPotential: result.terrainSummary.terrainCloudSeaPotential,
      terrainNoteZh: result.terrainSummary.terrainNoteZh,
      obstructionNoteZh: result.terrainSummary.obstructionNoteZh,
    },
    targetAnalysis: compactTargetAnalysis(result),
    dailySummaries: takeItems(result.dailySummaries, 3).map((summary) => ({
      date: summary.date,
      dateLabelZh: summary.dateLabelZh,
      score: summary.score,
      recommendationLabel: summary.recommendationLabel,
      target: summary.target,
      keyWindows: takeItems(summary.keyWindows, 3).map(compactForecastWindow),
      riskFlags: takeItems(summary.riskFlags, 4),
      shortAdvice: summary.shortAdvice,
      weather: summary.weather
        ? {
            weatherTextZh: summary.weather.weatherTextZh,
            tempMin: summary.weather.tempMin,
            tempMax: summary.weather.tempMax,
            precipitationProbability: summary.weather.precipitationProbability,
            precipitationAmountMm: summary.weather.precipitationAmountMm,
            windSpeed: summary.weather.windSpeed,
            windGust: summary.weather.windGust,
            visibility: summary.weather.visibility,
            cloudTotal: summary.weather.cloudTotal,
            cloudLow: summary.weather.cloudLow,
            cloudMid: summary.weather.cloudMid,
            cloudHigh: summary.weather.cloudHigh,
          }
        : undefined,
    })),
    dataNotice: result.dataNotice,
    isMock: result.isMock,
    dataSourceLabel: result.dataSourceLabel,
    generatedAt: result.generatedAt,
  };
}

function compactForecastWindow(window: ForecastCalculationResult["bestWindows"][number]) {
  return {
    label: window.label,
    date: window.date,
    startTime: window.startTime,
    endTime: window.endTime,
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
          setupBufferMinutes: window.arrivalAdvice.setupBufferMinutes,
          warningZh: window.arrivalAdvice.warningZh,
        }
      : undefined,
  };
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
    task: "请基于 computedForecastFacts 输出摄影天气智能解读 JSON。",
    outputSchema: {
      summary: "综合解读，一到两句话",
      recommendation: "行动建议，一句话",
      mainReasons: ["关键依据"],
      mainRisks: ["主要风险"],
      photographerAdvice: ["拍摄建议"],
      backupPlan: ["备用方案"],
      confidenceNote: "置信说明，必须说明若 isMock=true 则当前结果基于演示数据",
    },
    constraints: [
      "只解释 computedForecastFacts 中已有的确定性事实。",
      "不要计算、推断或改写天气、天文、地形、坐标、评分和服务商结果。",
      "不要生成输入中没有的小时级天气、天文窗口或分数。",
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
  return {
    summary: result.summary,
    recommendation: result.recommendationLabel,
    mainReasons: result.keyReasons.slice(0, 5),
    mainRisks: result.riskFlags.slice(0, 5).map((risk) => `${risk.label}：${risk.description}`),
    photographerAdvice: result.photographyAdvice.slice(0, 5),
    backupPlan:
      result.bestWindows.length > 1
        ? result.bestWindows
            .slice(1, 4)
            .map((window) => `备选 ${window.label}，分值 ${window.score}，仍需现场确认。`)
        : ["若现场云量、降水或风力与模拟结果不一致，优先选择近距离机位并保留撤离时间。"],
    confidenceNote: result.isMock
      ? "当前解读基于演示天气和地形数据，仅用于体验分析流程；正式数据源启用后再用于出行前复核。"
      : "当前解读基于已接入的数据源和确定性评分结果，仍需结合现场安全与最新预报复核。",
  };
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

    return this.validateJsonOutput(forecastAiExplanationSchema, parsed);
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
