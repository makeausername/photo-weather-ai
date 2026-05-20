import { decisionCardSchema, normalizeDeepSeekModel } from "@photo-weather/shared";
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
  readonly jsonOutputEnabled?: boolean;
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

export const missingDeepSeekApiKeyMessage =
  "DeepSeek 服务未配置 API Key，请先在后台服务商配置中填写 DeepSeek API Key。";

const deepSeekRealModeDisabledMessage =
  "DeepSeek 真实开发调用未启用，请设置 ENABLE_REAL_DEEPSEEK=true 后再测试。";

const deepSeekProviderDisabledMessage =
  "DeepSeek 服务商未启用，请先在后台服务商配置中启用 DeepSeek。";

const defaultBaseUrl = "https://api.deepseek.com";
const defaultTemperature = 0.2;
const defaultMaxTokens = 1200;

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

function getMessageContent(response: DeepSeekChatResponse): string {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("DeepSeek 未返回可解析内容。");
  }

  return content;
}

function pickForecastInput(result: ForecastCalculationResult) {
  return {
    place: {
      name: result.place.name,
      countryCode: result.place.countryCode,
      coordinates: result.place.coordinates,
    },
    horizon: result.horizon,
    target: result.target,
    overallScore: result.overallScore,
    recommendationLabel: result.recommendationLabel,
    summary: result.summary,
    scores: result.scores,
    bestWindows: result.bestWindows,
    riskFlags: result.riskFlags,
    keyReasons: result.keyReasons,
    photographyAdvice: result.photographyAdvice,
    astroSummaries: result.astroSummaries,
    dataNotice: result.dataNotice,
    isMock: result.isMock,
    dataSourceLabel: result.dataSourceLabel,
    generatedAt: result.generatedAt,
  };
}

function buildJsonOnlySystemPrompt(): string {
  return [
    "你是面向中国摄影师的拍摄天气解读助手。",
    "只解释已经计算好的确定性结果，不得计算、覆盖或改写天气、天文、地形、坐标或评分数据。",
    "不得编造天气数据，不得声称模拟数据具有真实预报准确率。",
    "输出简体中文。",
    "必须只输出 JSON 对象，不要输出 Markdown、解释文字或代码块。",
  ].join("\n");
}

export function buildDeepSeekForecastExplanationRequest(
  input: ForecastExplanationInput,
  options: Pick<
    DeepSeekProviderOptions,
    "baseUrl" | "defaultModel" | "temperature" | "maxTokens" | "jsonOutputEnabled"
  > = {},
): DeepSeekRequestPreview {
  const jsonOutputEnabled = options.jsonOutputEnabled ?? true;
  const body: DeepSeekRequestBody = {
    model: normalizeModel(options.defaultModel),
    messages: [
      {
        role: "system",
        content: buildJsonOnlySystemPrompt(),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "请基于 deterministicForecastResult 输出摄影天气智能解读 JSON。",
          outputSchema: {
            summary: "综合解读，一到两句话",
            recommendation: "行动建议，一句话",
            mainReasons: ["关键依据"],
            mainRisks: ["主要风险"],
            photographerAdvice: ["拍摄建议"],
            backupPlan: ["备用方案"],
            confidenceNote: "置信说明，必须说明若 isMock=true 则不代表真实预报准确率",
          },
          constraints: [
            "不要发明任何未提供的天气、天文、地形或交通数据。",
            "不要覆盖 deterministicForecastResult 中的评分、窗口和风险。",
            "如果 isMock=true，必须明确这是模拟数据解读，只适合流程验证和规划参考。",
            "输出 JSON only。",
          ],
          userGoal: input.userGoal ?? null,
          deterministicForecastResult: pickForecastInput(input.forecastResult),
        }),
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
      ? "当前解读基于本地模拟天气和地形数据，只适合流程验证与拍摄计划草拟，不代表真实预报准确率。"
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
  readonly jsonOutputEnabled: boolean;

  constructor(private readonly options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey?.trim();
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.defaultModel = normalizeModel(options.defaultModel);
    this.temperature = normalizeTemperature(options.temperature);
    this.maxTokens = normalizeMaxTokens(options.maxTokens);
    this.jsonOutputEnabled = options.jsonOutputEnabled ?? true;
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
        throw new Error("DeepSeek 返回的 JSON 无法解析。");
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

    const request: DeepSeekRequestPreview = {
      url: `${this.baseUrl}/chat/completions`,
      body,
    };

    return this.request(request);
  }

  private async request(request: DeepSeekRequestPreview): Promise<string> {
    const apiKey = this.getApiKey();
    const response = await this.fetcher(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(request.body),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek 服务请求失败，状态码 ${response.status}。`);
    }

    return getMessageContent((await response.json()) as DeepSeekChatResponse);
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
