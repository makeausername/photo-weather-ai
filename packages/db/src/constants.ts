import type {
  LocationSource,
  LocationType,
  ProviderType,
  SettingValueType,
  UserStatus,
  ViewDirection,
} from "./types.js";

export const userStatuses = ["active", "disabled"] as const satisfies readonly UserStatus[];

export const providerTypes = [
  "ai",
  "weather",
  "geo",
  "terrain",
  "storage",
  "billing",
  "email",
  "sms",
  "cdn",
  "captcha",
] as const satisfies readonly ProviderType[];

export const locationTypes = [
  "scenic_area",
  "viewpoint",
  "mountain",
  "lake",
  "city",
  "custom",
] as const satisfies readonly LocationType[];

export const locationSources = [
  "manual",
  "amap",
  "user",
] as const satisfies readonly LocationSource[];

export const viewDirections = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
  "all",
  "unknown",
] as const satisfies readonly ViewDirection[];

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

export function isLocationType(value: string): value is LocationType {
  return locationTypes.includes(value as LocationType);
}

export function isLocationSource(value: string): value is LocationSource {
  return locationSources.includes(value as LocationSource);
}

export function isViewDirection(value: string): value is ViewDirection {
  return viewDirections.includes(value as ViewDirection);
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
