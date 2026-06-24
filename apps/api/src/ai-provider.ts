import {
  missingOpenAiApiKeyMessage,
  OpenAiProvider,
  type OpenAiProviderOptions,
} from "@photo-weather/ai";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import {
  normalizeOpenAiModel,
  normalizeOpenAiModelSelection,
  openAiCustomModelValue,
  openAiDefaultBaseUrl,
  openAiDefaultMaxTokens,
  openAiDefaultModel,
  openAiDefaultPromptMaxChars,
  openAiDefaultTemperature,
  openAiDefaultTimeoutMs,
} from "@photo-weather/shared";

export type AiProviderRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: OpenAiProviderOptions["fetcher"];
};

export type ResolvedOpenAiRuntimeConfig = {
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly apiKeyPresent: boolean;
  readonly baseUrl: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly promptMaxChars: number;
  readonly timeoutMs: number;
  readonly mode: "responses_api";
  readonly modeLabelZh: string;
  readonly internalRelayTokenPresent: boolean;
};

export type RuntimeOpenAiConfig = ResolvedOpenAiRuntimeConfig & {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
  readonly authToken?: string;
  readonly internalRelayToken?: string;
  readonly defaultModel: string;
  readonly jsonOutputEnabled: false;
};

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

function readOpenAiApiKey(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson } = readSecretAndConfig(provider);
  return (
    readString(secretJson.apiKey) ??
    readString(secretJson.authToken) ??
    readEnvString(env.OPENAI_API_KEY)
  );
}

function readOpenAiInternalRelayToken(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const { secretJson } = readSecretAndConfig(provider);
  return (
    readString(secretJson.internalRelayToken) ??
    readString(secretJson.relayToken) ??
    readEnvString(env.OPENAI_INTERNAL_RELAY_TOKEN)
  );
}

function readOpenAiRealCallEnabled(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }

  const { configJson } = readSecretAndConfig(provider);
  return readBoolean(configJson.realCallEnabled) ?? readOptInFlag(env.ENABLE_REAL_OPENAI);
}

function resolveOpenAiModel(
  configJson: Record<string, JsonValue>,
  secretJson: Record<string, JsonValue>,
  env: NodeJS.ProcessEnv,
): string {
  const configuredModel = readString(configJson.model);

  if (configuredModel === openAiCustomModelValue) {
    return normalizeOpenAiModel(readString(configJson.customModel));
  }

  if (configuredModel !== undefined) {
    return normalizeOpenAiModelSelection(configuredModel);
  }

  return normalizeOpenAiModel(
    readString(secretJson.model) ??
      readString(configJson.defaultModel) ??
      readString(secretJson.defaultModel) ??
      readEnvString(env.OPENAI_DEFAULT_MODEL) ??
      openAiDefaultModel,
  );
}

export function resolveOpenAiRuntimeConfig(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedOpenAiRuntimeConfig {
  const { secretJson, configJson } = readSecretAndConfig(provider);
  const model = resolveOpenAiModel(configJson, secretJson, env);
  const apiKey = readOpenAiApiKey(provider, env);
  const internalRelayToken = readOpenAiInternalRelayToken(provider, env);

  return {
    enabled: provider?.enabled ?? false,
    realCallEnabled: readOpenAiRealCallEnabled(provider, env),
    apiKeyPresent: Boolean(apiKey),
    baseUrl:
      readString(configJson.baseUrl) ??
      readString(secretJson.baseUrl) ??
      readEnvString(env.OPENAI_BASE_URL) ??
      openAiDefaultBaseUrl,
    model,
    temperature: clampNumber(
      readNumber(configJson.temperature) ?? readNumber(secretJson.temperature),
      openAiDefaultTemperature,
      0,
      2,
    ),
    maxTokens: clampInteger(
      readNumber(configJson.maxTokens) ?? readNumber(secretJson.maxTokens),
      openAiDefaultMaxTokens,
      128,
      8192,
    ),
    promptMaxChars: clampInteger(
      readNumber(configJson.promptMaxChars) ??
        readEnvNumber(env.OPENAI_AI_EXPLAIN_PROMPT_MAX_CHARS),
      openAiDefaultPromptMaxChars,
      3000,
      20000,
    ),
    timeoutMs: clampInteger(
      readNumber(configJson.timeoutMs) ?? readEnvNumber(env.OPENAI_TIMEOUT_MS),
      openAiDefaultTimeoutMs,
      1000,
      120000,
    ),
    mode: "responses_api",
    modeLabelZh: "GPT / OpenAI",
    internalRelayTokenPresent: Boolean(internalRelayToken),
  };
}

export function normalizeOpenAiAdminConfigJson(
  configJson: JsonValue | undefined,
): Record<string, JsonValue> {
  const current = isJsonObject(configJson) ? { ...configJson } : {};
  const model = normalizeOpenAiModelSelection(readString(current.model));
  const customModel = readString(current.customModel) ?? "";
  const defaultModel =
    model === openAiCustomModelValue
      ? normalizeOpenAiModel(customModel)
      : normalizeOpenAiModel(model);

  return {
    realCallEnabled: readBoolean(current.realCallEnabled) ?? false,
    model,
    customModel,
    defaultModel,
    baseUrl: readString(current.baseUrl) ?? openAiDefaultBaseUrl,
    temperature: clampNumber(readNumber(current.temperature), openAiDefaultTemperature, 0, 2),
    maxTokens: clampInteger(readNumber(current.maxTokens), openAiDefaultMaxTokens, 128, 8192),
    promptMaxChars: clampInteger(
      readNumber(current.promptMaxChars),
      openAiDefaultPromptMaxChars,
      3000,
      20000,
    ),
    timeoutMs: clampInteger(readNumber(current.timeoutMs), openAiDefaultTimeoutMs, 1000, 120000),
  };
}

export async function readRuntimeOpenAiConfig(
  options: Pick<AiProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<RuntimeOpenAiConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("ai", "openai", {
    client: options.dbClient,
  });
  const resolved = resolveOpenAiRuntimeConfig(provider, env);
  const apiKey = readOpenAiApiKey(provider, env);
  const internalRelayToken = readOpenAiInternalRelayToken(provider, env);

  return {
    ...resolved,
    providerEnabled: resolved.enabled,
    realModeEnabled: resolved.realCallEnabled,
    apiKey,
    authToken: apiKey,
    internalRelayToken,
    defaultModel: resolved.model,
    jsonOutputEnabled: false,
  };
}

export async function createRealOpenAiProvider(
  options: AiProviderRuntimeOptions = {},
): Promise<OpenAiProvider> {
  const config = await readRuntimeOpenAiConfig(options);

  return new OpenAiProvider({
    enabled: config.enabled,
    realModeEnabled: config.realCallEnabled,
    apiKey: config.apiKey,
    authToken: config.authToken,
    internalRelayToken: config.internalRelayToken,
    baseUrl: config.baseUrl,
    defaultModel: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    promptMaxChars: config.promptMaxChars,
    timeoutMs: config.timeoutMs,
    fetcher: options.fetcher,
  });
}

export function getMissingOpenAiApiKeyMessage(): string {
  return missingOpenAiApiKeyMessage;
}
