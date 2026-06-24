import {
  openAiDefaultBaseUrl,
  openAiDefaultMaxTokens,
  openAiDefaultPromptMaxChars,
  openAiDefaultTemperature,
  openAiDefaultTimeoutMs,
  normalizeOpenAiModel,
  type DecisionCard,
} from "@photo-weather/shared";
import { z } from "zod";
import {
  buildDeepSeekForecastExplanationRequest,
  createRuleBasedForecastExplanation,
  isDeepSeekProviderError,
  parseForecastAiExplanationOutput,
} from "./deepseek-provider.js";
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

type OpenAiForecastPromptMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
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
  return Math.round(Math.min(6000, Math.max(3000, value)));
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return openAiDefaultTimeoutMs;
  }
  return Math.round(Math.min(120000, Math.max(1000, value)));
}

function promptMessagesFromLegacyRequest(
  request: ReturnType<typeof buildDeepSeekForecastExplanationRequest>,
): readonly OpenAiForecastPromptMessage[] {
  const body = request.body as unknown as {
    readonly messages?: readonly OpenAiForecastPromptMessage[];
  };
  return body.messages ?? [];
}

export function buildOpenAiForecastExplanationRequest(
  input: ForecastExplanationInput,
  options: Pick<
    OpenAiProviderOptions,
    "baseUrl" | "defaultModel" | "temperature" | "maxTokens" | "promptMaxChars"
  > = {},
): OpenAiRequestPreview {
  const legacyTextRequest = buildDeepSeekForecastExplanationRequest(input, {
    baseUrl: options.baseUrl,
    defaultModel: options.defaultModel,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    promptMaxChars: options.promptMaxChars,
    jsonOutputEnabled: false,
  });
  const messages = promptMessagesFromLegacyRequest(legacyTextRequest);
  const baseInstructions =
    messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n\n") ||
    [
      "Explain deterministic photo-weather forecast facts in concise Simplified Chinese.",
      "Use only the supplied facts. Do not calculate or invent weather, astronomy, terrain, score, probability, timing, risk, moon, Milky Way, cloud sea, or glow facts.",
    ].join("\n");
  const instructions = baseInstructions.includes("computedForecastFacts")
    ? baseInstructions
    : `${baseInstructions}\nUse only computedForecastFacts from the input payload; do not infer facts outside that object.`;
  const userInput = messages
    .filter((message) => message.role !== "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const body: OpenAiRequestBody = {
    model: normalizeOpenAiModel(options.defaultModel),
    instructions,
    input: userInput,
    temperature: normalizeTemperature(options.temperature),
    max_output_tokens: normalizeMaxTokens(options.maxTokens),
    store: false,
    stream: false,
  };

  return {
    url: `${normalizeBaseUrl(options.baseUrl)}/v1/responses`,
    body,
    promptSizeChars: instructions.length + userInput.length,
    outputMode: "text_with_json_fallback",
  };
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
    } catch (error) {
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
