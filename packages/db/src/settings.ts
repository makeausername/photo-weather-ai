import { assertSettingValueType } from "./constants.js";
import { getPrismaClient } from "./client.js";
import { safeSystemSetting } from "./serializers.js";
import type { DatabaseClient, JsonValue, SafeSystemSetting, SettingValueType } from "./types.js";

const SETTING_KEY_PATTERN = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

export type ListSystemSettingsOptions = {
  readonly group?: string;
  readonly publicOnly?: boolean;
  readonly client?: DatabaseClient;
};

export type SetSystemSettingInput = {
  readonly key: string;
  readonly valueJson: JsonValue;
  readonly valueType?: SettingValueType;
  readonly group?: string;
  readonly label?: string;
  readonly description?: string | null;
  readonly isPublic?: boolean;
  readonly isSecret?: boolean;
  readonly isEditable?: boolean;
  readonly client?: DatabaseClient;
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

export function validateSettingKey(key: string): void {
  if (!SETTING_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid system setting key: ${key}`);
  }
}

export function validateSettingValue(valueType: SettingValueType, value: JsonValue): void {
  assertSettingValueType(valueType);

  if (valueType === "boolean" && typeof value !== "boolean") {
    throw new Error("System setting value must be a boolean.");
  }

  if (valueType === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("System setting value must be a finite number.");
  }

  if (
    ["string", "url", "select", "prompt", "secret"].includes(valueType) &&
    typeof value !== "string"
  ) {
    throw new Error(`System setting value must be a string for ${valueType}.`);
  }

  if (valueType === "url" && typeof value === "string" && value.length > 0) {
    try {
      new URL(value);
    } catch {
      throw new Error("System setting value must be a valid URL.");
    }
  }
}

export async function getSystemSetting(
  key: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<SafeSystemSetting | null> {
  validateSettingKey(key);
  const client = await resolveClient(options.client);
  const record = await client.systemSetting.findUnique({ where: { key } });

  return record ? safeSystemSetting(record) : null;
}

export async function listSystemSettings(
  options: ListSystemSettingsOptions = {},
): Promise<SafeSystemSetting[]> {
  const client = await resolveClient(options.client);
  const where: Record<string, string | boolean> = {};

  if (options.group) {
    where.group = options.group;
  }

  if (options.publicOnly) {
    where.isPublic = true;
  }

  const records = await client.systemSetting.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  return records.map((record) => safeSystemSetting(record));
}

export async function setSystemSetting(input: SetSystemSettingInput): Promise<SafeSystemSetting> {
  validateSettingKey(input.key);
  const client = await resolveClient(input.client);
  const existing = await client.systemSetting.findUnique({ where: { key: input.key } });
  const valueType = input.valueType ?? existing?.valueType;

  if (!valueType) {
    throw new Error(`Missing value type for new system setting: ${input.key}`);
  }

  validateSettingValue(valueType, input.valueJson);

  const create = {
    key: input.key,
    valueJson: input.valueJson,
    valueType,
    group: input.group ?? input.key.split(".")[0],
    label: input.label ?? input.key,
    description: input.description ?? null,
    isPublic: input.isPublic ?? false,
    isSecret: input.isSecret ?? valueType === "secret",
    isEditable: input.isEditable ?? true,
  };

  const update = {
    valueJson: input.valueJson,
    valueType,
    group: input.group ?? existing?.group ?? create.group,
    label: input.label ?? existing?.label ?? create.label,
    description: input.description ?? existing?.description ?? null,
    isPublic: input.isPublic ?? existing?.isPublic ?? create.isPublic,
    isSecret: input.isSecret ?? existing?.isSecret ?? create.isSecret,
    isEditable: input.isEditable ?? existing?.isEditable ?? create.isEditable,
  };

  const record = await client.systemSetting.upsert({
    where: { key: input.key },
    create,
    update,
  });

  return safeSystemSetting(record);
}
