import { assertProviderType } from "./constants.js";
import { getPrismaClient } from "./client.js";
import { cloneJsonValue, isPlainJsonObject, mergeJsonObjects } from "./json.js";
import { maskSecretJson } from "./secrets.js";
import { normalizeProviderConfig, safeProviderConfig } from "./serializers.js";
import type {
  DatabaseClient,
  JsonValue,
  ProviderConfigRecord,
  ProviderType,
  SafeProviderConfig,
} from "./types.js";

export type ListProviderConfigsOptions = {
  readonly providerType?: ProviderType;
  readonly enabledOnly?: boolean;
  readonly client?: DatabaseClient;
};

export type UpdateProviderConfigInput = {
  readonly providerType: ProviderType;
  readonly providerCode: string;
  readonly displayName?: string;
  readonly enabled?: boolean;
  readonly priority?: number;
  readonly configJson?: JsonValue;
  readonly secretJson?: JsonValue | null;
  readonly clearSecretKeys?: readonly string[];
  readonly client?: DatabaseClient;
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

export function validateProviderCode(providerCode: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(providerCode)) {
    throw new Error(`Invalid provider code: ${providerCode}`);
  }
}

function mergeSecretJson(
  base: JsonValue | null | undefined,
  patch: JsonValue | null | undefined,
  clearSecretKeys: readonly string[] = [],
): JsonValue {
  const next: Record<string, JsonValue> = isPlainJsonObject(base) ? cloneJsonValue(base) : {};

  if (isPlainJsonObject(patch)) {
    for (const [key, value] of Object.entries(patch)) {
      if (typeof value === "string" && value.trim() === "") {
        continue;
      }

      next[key] = cloneJsonValue(value);
    }
  }

  for (const key of clearSecretKeys) {
    delete next[key];
  }

  return next;
}

export async function getProviderConfig(
  providerType: ProviderType,
  providerCode: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<SafeProviderConfig | null> {
  assertProviderType(providerType);
  validateProviderCode(providerCode);

  const client = await resolveClient(options.client);
  const record = await client.providerConfig.findUnique({
    where: {
      providerType_providerCode: {
        providerType,
        providerCode,
      },
    },
  });

  return record ? safeProviderConfig(record) : null;
}

export async function getRuntimeProviderConfig(
  providerType: ProviderType,
  providerCode: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<ProviderConfigRecord | null> {
  assertProviderType(providerType);
  validateProviderCode(providerCode);

  const client = await resolveClient(options.client);
  const record = await client.providerConfig.findUnique({
    where: {
      providerType_providerCode: {
        providerType,
        providerCode,
      },
    },
  });

  return record ? normalizeProviderConfig(record) : null;
}

export async function listProviderConfigs(
  options: ListProviderConfigsOptions = {},
): Promise<SafeProviderConfig[]> {
  const client = await resolveClient(options.client);
  const where: Record<string, string | boolean> = {};

  if (options.providerType) {
    assertProviderType(options.providerType);
    where.providerType = options.providerType;
  }

  if (options.enabledOnly) {
    where.enabled = true;
  }

  const records = await client.providerConfig.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: [{ providerType: "asc" }, { priority: "asc" }, { providerCode: "asc" }],
  });

  return records.map((record) => safeProviderConfig(record));
}

export async function updateProviderConfig(
  input: UpdateProviderConfigInput,
): Promise<SafeProviderConfig> {
  assertProviderType(input.providerType);
  validateProviderCode(input.providerCode);

  const client = await resolveClient(input.client);
  const existing = await client.providerConfig.findUnique({
    where: {
      providerType_providerCode: {
        providerType: input.providerType,
        providerCode: input.providerCode,
      },
    },
  });

  if (!existing) {
    throw new Error(`Provider config not found: ${input.providerType}/${input.providerCode}`);
  }

  const existingProviderConfig = normalizeProviderConfig(existing);
  const data: Record<string, unknown> = {};

  if (input.displayName !== undefined) {
    data.displayName = input.displayName;
  }

  if (input.enabled !== undefined) {
    data.enabled = input.enabled;
  }

  if (input.priority !== undefined) {
    data.priority = input.priority;
  }

  if (input.configJson !== undefined) {
    data.configJson = mergeJsonObjects(existingProviderConfig.configJson, input.configJson);
  }

  if (input.secretJson !== undefined || (input.clearSecretKeys?.length ?? 0) > 0) {
    const nextSecretJson =
      input.secretJson === null
        ? null
        : mergeSecretJson(
            existingProviderConfig.secretJson,
            input.secretJson,
            input.clearSecretKeys,
          );
    data.secretJson = nextSecretJson;
    data.maskedSecretJson = maskSecretJson(nextSecretJson);
  }

  const record = await client.providerConfig.update({
    where: {
      providerType_providerCode: {
        providerType: input.providerType,
        providerCode: input.providerCode,
      },
    },
    data,
  });

  return safeProviderConfig(record);
}
