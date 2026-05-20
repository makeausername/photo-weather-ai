import {
  DeepSeekProvider,
  missingDeepSeekApiKeyMessage,
  type DeepSeekProviderOptions,
} from "@photo-weather/ai";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import { deepSeekDefaultModel, normalizeDeepSeekModel } from "@photo-weather/shared";

export type AiProviderRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: DeepSeekProviderOptions["fetcher"];
};

export type RuntimeDeepSeekConfig = {
  readonly providerEnabled: boolean;
  readonly realModeEnabled: boolean;
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly jsonOutputEnabled: boolean;
};

const defaultDeepSeekBaseUrl = "https://api.deepseek.com";

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

function readSecretAndConfig(provider: ProviderConfigRecord | null): {
  readonly secretJson: Record<string, JsonValue>;
  readonly configJson: Record<string, JsonValue>;
} {
  return {
    secretJson: isJsonObject(provider?.secretJson) ? provider.secretJson : {},
    configJson: isJsonObject(provider?.configJson) ? provider.configJson : {},
  };
}

function readDeepSeekRealModeEnabled(
  provider: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): boolean {
  if (env.NODE_ENV === "test") {
    return false;
  }

  const { configJson } = readSecretAndConfig(provider);
  return readBoolean(configJson.realCallEnabled) ?? readOptInFlag(env.ENABLE_REAL_DEEPSEEK);
}

export async function readRuntimeDeepSeekConfig(
  options: Pick<AiProviderRuntimeOptions, "dbClient" | "env"> = {},
): Promise<RuntimeDeepSeekConfig> {
  const env = options.env ?? process.env;
  const provider = await getRuntimeProviderConfig("ai", "deepseek", {
    client: options.dbClient,
  });
  const { secretJson, configJson } = readSecretAndConfig(provider);

  return {
    providerEnabled: provider?.enabled ?? false,
    realModeEnabled: readDeepSeekRealModeEnabled(provider, env),
    apiKey: readString(secretJson.apiKey) ?? readEnvString(env.DEEPSEEK_API_KEY),
    baseUrl:
      readString(secretJson.baseUrl) ??
      readString(configJson.baseUrl) ??
      readEnvString(env.DEEPSEEK_BASE_URL) ??
      defaultDeepSeekBaseUrl,
    defaultModel: normalizeDeepSeekModel(
      readString(secretJson.defaultModel) ??
        readString(configJson.defaultModel) ??
        readEnvString(env.DEEPSEEK_DEFAULT_MODEL) ??
        deepSeekDefaultModel,
    ),
    temperature: readNumber(secretJson.temperature) ?? readNumber(configJson.temperature),
    maxTokens: readNumber(secretJson.maxTokens) ?? readNumber(configJson.maxTokens),
    jsonOutputEnabled:
      readBoolean(secretJson.jsonOutputEnabled) ??
      readBoolean(configJson.jsonOutputEnabled) ??
      true,
  };
}

export async function createRealDeepSeekProvider(
  options: AiProviderRuntimeOptions = {},
): Promise<DeepSeekProvider> {
  const config = await readRuntimeDeepSeekConfig(options);

  return new DeepSeekProvider({
    enabled: config.providerEnabled,
    realModeEnabled: config.realModeEnabled,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    defaultModel: config.defaultModel,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    jsonOutputEnabled: config.jsonOutputEnabled,
    fetcher: options.fetcher,
  });
}

export function getMissingDeepSeekApiKeyMessage(): string {
  return missingDeepSeekApiKeyMessage;
}
