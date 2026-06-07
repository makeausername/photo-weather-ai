import {
  DeepSeekProvider,
  missingDeepSeekApiKeyMessage,
  type DeepSeekProviderOptions,
} from "@photo-weather/ai";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import {
  deepSeekResponseFormat,
  deepSeekProfessionalModel,
  getDeepSeekModeRuntimeDefaults,
  normalizeDeepSeekAnalysisMode,
  normalizeDeepSeekModel,
  type DeepSeekAnalysisMode,
  type DeepSeekReasoningEffort,
} from "@photo-weather/shared";

export type AiProviderRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: DeepSeekProviderOptions["fetcher"];
};

export type ResolvedDeepSeekRuntimeConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly analysisMode: DeepSeekAnalysisMode;
  readonly baseUrl: string;
  readonly model: string;
  readonly responseFormat: "json_object";
  readonly temperature: number;
  readonly maxTokens: number;
  readonly promptMaxChars: number;
  readonly thinkingEnabled: boolean;
  readonly reasoningEffort: DeepSeekReasoningEffort;
  readonly timeoutMs: number;
  readonly modeLabelZh: string;
};

export type RuntimeDeepSeekConfig = ResolvedDeepSeekRuntimeConfig & {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
  readonly defaultModel: string;
  readonly jsonOutputEnabled: boolean;
};

const defaultDeepSeekBaseUrl = "https://api.deepseek.com";
const defaultDeepSeekTimeoutMs = 120000;
const defaultDeepSeekPromptMaxChars = 6000;

function isJsonObject(value: JsonValue | null | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readEnvString(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptInFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

function readBoolean(value: JsonValue | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

function readNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readEnvNumber(value: string | undefined): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

function readSecretAndConfig(provider: ProviderConfigRecord | null): {
  readonly secretJson: Record<string, JsonValue>;
  readonly configJson: Record<string, JsonValue>;
} {
  return {
    secretJson: isJsonObject(provider?.secretJson) ? provider.secretJson : {},
    configJson: isJsonObject(provider?.configJson) ? provider.configJson : {},
  };
}

function readDeepSeekApiKey(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson } = readSecretAndConfig(provider);
  return readString(secretJson.apiKey) ?? readEnvString(env.DEEPSEEK_API_KEY);
}

function readDeepSeekRealCallEnabled(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }

  const { configJson } = readSecretAndConfig(provider);
  return readBoolean(configJson.realCallEnabled) ?? readOptInFlag(env.ENABLE_REAL_DEEPSEEK);
}

function normalizeReasoningEffort(
  value: string | undefined,
  fallback: DeepSeekReasoningEffort,
): DeepSeekReasoningEffort {
  if (value === "none" || value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return fallback;
}

export function resolveDeepSeekRuntimeConfig(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedDeepSeekRuntimeConfig {
  const { secretJson, configJson } = readSecretAndConfig(provider);
  const configuredMode = readString(configJson.analysisMode);
  const hasConfiguredMode = configuredMode === "professional";
  const configuredModel =
    readString(configJson.model) ??
    readString(secretJson.model) ??
    readString(configJson.defaultModel) ??
    readString(secretJson.defaultModel);
  const envModel = readEnvString(env.DEEPSEEK_DEFAULT_MODEL);
  const analysisMode = normalizeDeepSeekAnalysisMode(
    configuredMode,
    hasConfiguredMode ? undefined : configuredModel ?? envModel,
  );
  const modeDefaults = getDeepSeekModeRuntimeDefaults(analysisMode);
  const model = normalizeDeepSeekModel(
    hasConfiguredMode
      ? modeDefaults.model
      : configuredModel ?? envModel ?? modeDefaults.model ?? deepSeekProfessionalModel,
  );
  const thinkingEnabled =
    readBoolean(configJson.thinkingEnabled) ??
    readBoolean(secretJson.thinkingEnabled) ??
    modeDefaults.thinkingEnabled;
  const reasoningEffort = thinkingEnabled
    ? normalizeReasoningEffort(
        readString(configJson.reasoningEffort) ?? readString(secretJson.reasoningEffort),
        modeDefaults.reasoningEffort === "none" ? "medium" : modeDefaults.reasoningEffort,
      )
    : "none";

  return {
    enabled: provider?.enabled ?? false,
    realCallEnabled: readDeepSeekRealCallEnabled(provider, env),
    apiKeyPresent: Boolean(readDeepSeekApiKey(provider, env)),
    analysisMode,
    baseUrl:
      readString(configJson.baseUrl) ??
      readString(secretJson.baseUrl) ??
      readEnvString(env.DEEPSEEK_BASE_URL) ??
      defaultDeepSeekBaseUrl,
    model,
    responseFormat: deepSeekResponseFormat,
    temperature: clampNumber(
      readNumber(configJson.temperature) ?? readNumber(secretJson.temperature),
      modeDefaults.temperature,
      0,
      2,
    ),
    maxTokens: clampInteger(
      readNumber(configJson.maxTokens) ?? readNumber(secretJson.maxTokens),
      modeDefaults.maxTokens,
      128,
      8192,
    ),
    promptMaxChars: clampInteger(
      readNumber(configJson.promptMaxChars) ??
        readEnvNumber(env.DEEPSEEK_AI_EXPLAIN_PROMPT_MAX_CHARS),
      defaultDeepSeekPromptMaxChars,
      3000,
      6000,
    ),
    thinkingEnabled,
    reasoningEffort,
    timeoutMs: clampInteger(
      readNumber(configJson.timeoutMs),
      defaultDeepSeekTimeoutMs,
      120000,
      120000,
    ),
    modeLabelZh: modeDefaults.modeLabelZh,
  };
}

export function normalizeDeepSeekAdminConfigJson(
  configJson: JsonValue | undefined,
): Record<string, JsonValue> {
  const current = isJsonObject(configJson) ? { ...configJson } : {};
  const analysisMode = normalizeDeepSeekAnalysisMode(
    readString(current.analysisMode),
    readString(current.model) ?? readString(current.defaultModel),
  );
  const modeDefaults = getDeepSeekModeRuntimeDefaults(analysisMode);
  const thinkingEnabled = readBoolean(current.thinkingEnabled) ?? modeDefaults.thinkingEnabled;
  const reasoningEffort = thinkingEnabled
    ? normalizeReasoningEffort(
        readString(current.reasoningEffort),
        modeDefaults.reasoningEffort === "none" ? "medium" : modeDefaults.reasoningEffort,
      )
    : "none";

  return {
    ...current,
    realCallEnabled: readBoolean(current.realCallEnabled) ?? false,
    analysisMode,
    model: modeDefaults.model,
    defaultModel: modeDefaults.model,
    baseUrl: readString(current.baseUrl) ?? defaultDeepSeekBaseUrl,
    responseFormat: deepSeekResponseFormat,
    temperature: clampNumber(readNumber(current.temperature), modeDefaults.temperature, 0, 2),
    maxTokens: clampInteger(readNumber(current.maxTokens), modeDefaults.maxTokens, 128, 8192),
    promptMaxChars: clampInteger(
      readNumber(current.promptMaxChars),
      defaultDeepSeekPromptMaxChars,
      3000,
      6000,
    ),
    thinkingEnabled,
    reasoningEffort,
    modelPolicyNoteZh: "当前项目固定使用 deepseek-v4-pro。",
    timeoutMs: clampInteger(
      readNumber(current.timeoutMs),
      defaultDeepSeekTimeoutMs,
      120000,
      120000,
    ),
  };
}

export async function readRuntimeDeepSeekConfig(
  options: Pick<AiProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<RuntimeDeepSeekConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("ai", "deepseek", {
    client: options.dbClient,
  });
  const resolved = resolveDeepSeekRuntimeConfig(provider, env);
  const apiKey = readDeepSeekApiKey(provider, env);

  return {
    ...resolved,
    providerEnabled: resolved.enabled,
    realModeEnabled: resolved.realCallEnabled,
    apiKey,
    defaultModel: resolved.model,
    jsonOutputEnabled: resolved.responseFormat === "json_object",
  };
}

export async function createRealDeepSeekProvider(
  options: AiProviderRuntimeOptions = {},
): Promise<DeepSeekProvider> {
  const config = await readRuntimeDeepSeekConfig(options);

  return new DeepSeekProvider({
    enabled: config.enabled,
    realModeEnabled: config.realCallEnabled,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultModel: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    promptMaxChars: config.promptMaxChars,
    responseFormat: config.responseFormat,
    thinkingEnabled: config.thinkingEnabled,
    reasoningEffort: config.reasoningEffort,
    timeoutMs: config.timeoutMs,
    jsonOutputEnabled: config.jsonOutputEnabled,
    fetcher: options.fetcher,
  });
}

export function getMissingDeepSeekApiKeyMessage(): string {
  return missingDeepSeekApiKeyMessage;
}
