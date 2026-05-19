import { maskSecretJson } from "./secrets.js";
import type {
  JsonValue,
  ProviderConfigRecord,
  SafeProviderConfig,
  SafeSystemSetting,
  SystemSettingRecord,
} from "./types.js";

function readJsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

export function normalizeSystemSetting(record: any): SystemSettingRecord {
  return {
    id: record.id,
    key: record.key,
    valueJson: readJsonValue(record.valueJson),
    valueType: record.valueType,
    group: record.group,
    label: record.label,
    description: record.description ?? null,
    isPublic: record.isPublic,
    isSecret: record.isSecret,
    isEditable: record.isEditable,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function safeSystemSetting(record: any): SafeSystemSetting {
  const setting = normalizeSystemSetting(record);

  if (!setting.isSecret) {
    return setting;
  }

  return {
    ...setting,
    valueJson: maskSecretJson(setting.valueJson),
  };
}

export function normalizeProviderConfig(record: any): ProviderConfigRecord {
  return {
    id: record.id,
    providerType: record.providerType,
    providerCode: record.providerCode,
    displayName: record.displayName,
    enabled: record.enabled,
    priority: record.priority,
    configJson: readJsonValue(record.configJson),
    secretJson: record.secretJson === null || record.secretJson === undefined ? null : readJsonValue(record.secretJson),
    maskedSecretJson:
      record.maskedSecretJson === null || record.maskedSecretJson === undefined
        ? null
        : readJsonValue(record.maskedSecretJson),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function safeProviderConfig(record: any): SafeProviderConfig {
  const providerConfig = normalizeProviderConfig(record);
  const { secretJson: _secretJson, ...safeConfig } = providerConfig;

  return {
    ...safeConfig,
    maskedSecretJson:
      providerConfig.maskedSecretJson ?? maskSecretJson(providerConfig.secretJson ?? undefined),
  };
}
