import type { JsonValue } from "./types.js";

export function cloneJsonValue<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isPlainJsonObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeJsonObjects(base: JsonValue | null | undefined, patch: JsonValue): JsonValue {
  if (!isPlainJsonObject(base) || !isPlainJsonObject(patch)) {
    return cloneJsonValue(patch);
  }

  const merged: Record<string, JsonValue> = {
    ...cloneJsonValue(base),
  };

  for (const [key, value] of Object.entries(patch)) {
    const existingValue = merged[key];
    merged[key] =
      isPlainJsonObject(existingValue) && isPlainJsonObject(value)
        ? mergeJsonObjects(existingValue, value)
        : cloneJsonValue(value);
  }

  return merged;
}
