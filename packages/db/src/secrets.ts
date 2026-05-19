import { isPlainJsonObject } from "./json.js";
import type { JsonValue } from "./types.js";

const MASK = "****";

export function maskSecretString(value: string): string {
  if (value.length === 0) {
    return "";
  }

  if (value.length <= 4) {
    return MASK;
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}${MASK}${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}${MASK}${value.slice(-4)}`;
}

export function maskSecretValue(value: JsonValue): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === "string") {
    return maskSecretString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return MASK;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskSecretValue(item));
  }

  if (isPlainJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, maskSecretValue(item)]),
    );
  }

  return MASK;
}

export function maskSecretJson(value: JsonValue | null | undefined): JsonValue {
  if (value === null || value === undefined) {
    return {};
  }

  return maskSecretValue(value);
}
