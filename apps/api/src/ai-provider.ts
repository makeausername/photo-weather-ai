import {
  DeepSeekProvider,
  missingDeepSeekApiKeyMessage,
  type DeepSeekProviderOptions,
} from "@photo-weather/ai";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";

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
};

const defaultDeepSeekBaseUrl = "https://api.deepseek.com";
const defaultDeepSeekModel = "deepseek-chat";

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

function readSecretAndConfig(provider: ProviderConfigRecord | null): {
  readonly secretJson: Record<string, JsonValue>;
  readonly configJson: Record<string, JsonValue>;
} {
  return {
    secretJson: isJsonObject(provider?.secretJson) ? provider.secretJson : {},
    configJson: isJsonObject(provider?.configJson) ? provider.configJson : {},
  };
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
    realModeEnabled: readOptInFlag(env.ENABLE_REAL_DEEPSEEK),
    apiKey: readString(secretJson.apiKey) ?? readEnvString(env.DEEPSEEK_API_KEY),
    baseUrl:
      readString(secretJson.baseUrl) ??
      readString(configJson.baseUrl) ??
      readEnvString(env.DEEPSEEK_BASE_URL) ??
      defaultDeepSeekBaseUrl,
    defaultModel:
      readString(secretJson.defaultModel) ??
      readString(configJson.defaultModel) ??
      readEnvString(env.DEEPSEEK_DEFAULT_MODEL) ??
      defaultDeepSeekModel,
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
    fetcher: options.fetcher,
  });
}

export function getMissingDeepSeekApiKeyMessage(): string {
  return missingDeepSeekApiKeyMessage;
}
