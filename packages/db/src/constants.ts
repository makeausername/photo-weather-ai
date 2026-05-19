import type { ProviderType, SettingValueType, UserStatus } from "./types.js";

export const userStatuses = ["active", "disabled"] as const satisfies readonly UserStatus[];

export const providerTypes = [
  "ai",
  "weather",
  "geo",
  "terrain",
  "storage",
  "billing",
  "sms",
] as const satisfies readonly ProviderType[];

export const settingValueTypes = [
  "string",
  "number",
  "boolean",
  "json",
  "url",
  "select",
  "prompt",
  "secret",
] as const satisfies readonly SettingValueType[];

export function isProviderType(value: string): value is ProviderType {
  return providerTypes.includes(value as ProviderType);
}

export function isSettingValueType(value: string): value is SettingValueType {
  return settingValueTypes.includes(value as SettingValueType);
}

export function assertProviderType(value: string): asserts value is ProviderType {
  if (!isProviderType(value)) {
    throw new Error(`Unsupported provider type: ${value}`);
  }
}

export function assertSettingValueType(value: string): asserts value is SettingValueType {
  if (!isSettingValueType(value)) {
    throw new Error(`Unsupported setting value type: ${value}`);
  }
}
