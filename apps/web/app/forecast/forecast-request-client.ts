import type { ForecastCalculationResult, ForecastQueryInput } from "@photo-weather/shared";
import {
  ApiClientError,
  currentAuthCacheScope,
  optionalAuthApiFetch,
} from "../../components/api-client";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const transientForecastStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const defaultRetryCount = 2;
const defaultRetryDelayMs = [600, 1200, 2400] as const;
const defaultSuccessCacheTtlMs = 5 * 60 * 1000;
const defaultStaleCacheTtlMs = 30 * 60 * 1000;
const sessionCachePrefix = "photo_weather_forecast_calculation:v1:";
const maxSessionCachePayloadChars = 450_000;

export const forecastCalculationTransientFailureMessage =
  "本次分析请求超时或上游数据暂时不可用，已自动重试但仍未成功。可以直接重新分析，通常不需要重新选择地点。";

const forecastCalculationValidationFailureMessage =
  "当前地点坐标或预报范围无效，请重新选择地点后再试。";

const forecastCalculationGenericFailureMessage = "拍摄天气分析暂时不可用，请稍后重试。";

type ForecastCacheRecord = {
  readonly version: 1;
  readonly queryKey: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly staleExpiresAt: number;
  readonly result: ForecastCalculationResult;
};

type ForecastInFlightRecord = {
  readonly promise: Promise<ForecastCalculationResult>;
};

export type ForecastCalculationRequestInput = ForecastQueryInput & {
  readonly startDateTime?: string;
};

export type ForecastRequestErrorOptions = {
  readonly status?: number;
  readonly code?: string;
  readonly retryable?: boolean;
  readonly transient?: boolean;
  readonly publicMessage?: string;
  readonly cause?: unknown;
};

export class ForecastRequestError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryable: boolean;
  readonly transient: boolean;
  readonly publicMessage: string;
  override readonly cause?: unknown;

  constructor(message: string, options: ForecastRequestErrorOptions = {}) {
    super(message);
    this.name = "ForecastRequestError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.transient = options.transient ?? false;
    this.publicMessage = options.publicMessage ?? message;
    this.cause = options.cause;
  }
}

export type RetryWithBackoffOptions = {
  readonly retryCount?: number;
  readonly retryDelayMs?: readonly number[];
  readonly signal?: AbortSignal;
  readonly shouldRetry?: (error: unknown, attempt: number) => boolean;
  readonly jitter?: boolean;
};

export type RequestForecastCalculationOptions = {
  readonly signal?: AbortSignal;
  readonly fetcher?: typeof fetch;
  readonly retryCount?: number;
  readonly retryDelayMs?: readonly number[];
  readonly successCacheTtlMs?: number;
  readonly staleCacheTtlMs?: number;
  readonly useSessionStorage?: boolean;
  readonly baseUrl?: string;
};

const forecastSuccessCache = new Map<string, ForecastCacheRecord>();
const forecastInFlightRequests = new Map<string, ForecastInFlightRecord>();

export function stableForecastQueryKey(query: ForecastCalculationRequestInput): string {
  return JSON.stringify({
    name: query.name,
    source: query.source,
    coordinateSource: query.coordinateSource ?? null,
    horizon: query.horizon,
    target: query.target,
    timezone: query.timezone ?? null,
    latitudeGcj02: roundCacheNumber(query.latitudeGcj02, 7),
    longitudeGcj02: roundCacheNumber(query.longitudeGcj02, 7),
    latitudeWgs84: roundCacheNumber(query.latitudeWgs84, 7),
    longitudeWgs84: roundCacheNumber(query.longitudeWgs84, 7),
    elevationMeters:
      typeof query.elevationMeters === "number" ? roundCacheNumber(query.elevationMeters, 2) : null,
    elevationSource: query.elevationSource ?? null,
    elevationConfidence: query.elevationConfidence ?? null,
    locationId: query.locationId ?? null,
    photoSpotId: query.photoSpotId ?? null,
    startDateTime: query.startDateTime ?? null,
  });
}

export async function requestForecastCalculation(
  query: ForecastCalculationRequestInput,
  options: RequestForecastCalculationOptions = {},
): Promise<ForecastCalculationResult> {
  const cacheable = isFrontendForecastCacheable(query);
  const authCacheKey = currentAuthCacheScope();
  const queryKey = `${stableForecastQueryKey(query)}|auth:${authCacheKey}`;
  if (cacheable) {
    const cached = readCachedForecastResult(queryKey, {
      allowStale: false,
      useSessionStorage: options.useSessionStorage ?? true,
    });
    if (cached) {
      return cached;
    }
  }

  const inFlight = forecastInFlightRequests.get(queryKey);
  if (inFlight) {
    return rejectWhenAborted(inFlight.promise, options.signal);
  }

  const requestPromise = retryWithBackoff(
    async () => {
      throwIfAborted(options.signal);
      const result = await optionalAuthApiFetch<ForecastCalculationResult>(
        "/forecast/calculate",
        {
          method: "POST",
          body: JSON.stringify(query),
          signal: options.signal,
        },
        {
          baseUrl: options.baseUrl ?? apiBaseUrl,
          fetcher: options.fetcher,
          fallbackMessage: forecastCalculationGenericFailureMessage,
        },
      );
      if (cacheable) {
        writeCachedForecastResult(queryKey, result, options);
      }
      return result;
    },
    {
      retryCount: options.retryCount ?? defaultRetryCount,
      retryDelayMs: options.retryDelayMs ?? defaultRetryDelayMs,
      signal: options.signal,
      shouldRetry: isTransientForecastError,
    },
  ).catch((error) => {
    if (cacheable && isTransientForecastError(error)) {
      const stale = readCachedForecastResult(queryKey, {
        allowStale: true,
        useSessionStorage: options.useSessionStorage ?? true,
      });
      if (stale) {
        return stale;
      }
    }
    throw normalizeForecastClientError(error);
  });

  forecastInFlightRequests.set(queryKey, { promise: requestPromise });
  const cleanup = () => {
    const current = forecastInFlightRequests.get(queryKey);
    if (current?.promise === requestPromise) {
      forecastInFlightRequests.delete(queryKey);
    }
  };
  requestPromise.then(cleanup, cleanup);

  return rejectWhenAborted(requestPromise, options.signal);
}

export async function retryWithBackoff<TValue>(
  operation: (attempt: number) => Promise<TValue>,
  options: RetryWithBackoffOptions = {},
): Promise<TValue> {
  const retryCount = options.retryCount ?? defaultRetryCount;
  const shouldRetry = options.shouldRetry ?? (() => true);

  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(options.signal);
    try {
      return await operation(attempt);
    } catch (error) {
      if (isForecastRequestAbortError(error) || options.signal?.aborted) {
        throw error;
      }
      if (attempt >= retryCount || !shouldRetry(error, attempt)) {
        throw error;
      }
      await sleepWithAbort(retryDelayForAttempt(attempt, options), options.signal);
    }
  }
}

export async function normalizeForecastApiError(response: Response): Promise<ForecastRequestError> {
  const payload = await readResponsePayload(response);
  const code = readStringField(payload, "error");
  const status = response.status;
  const transient = isTransientForecastStatus(status);
  const publicMessage =
    code === "upgrade_required"
      ? safeValidationMessage(payload)
      : status === 400
      ? safeValidationMessage(payload)
      : transient
        ? forecastCalculationTransientFailureMessage
        : forecastCalculationGenericFailureMessage;

  return new ForecastRequestError(publicMessage, {
    status,
    code,
    retryable: transient,
    transient,
    publicMessage,
  });
}

export function isTransientForecastError(error: unknown): boolean {
  if (isForecastRequestAbortError(error)) {
    return false;
  }
  if (error instanceof ForecastRequestError) {
    return error.transient || error.retryable || isTransientForecastStatus(error.status);
  }
  if (isRecord(error)) {
    const status = error.status ?? error.statusCode;
    if (typeof status === "number" && isTransientForecastStatus(status)) {
      return true;
    }
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error instanceof Error) {
    return /fetch failed|failed to fetch|network|timeout|temporarily unavailable/i.test(
      error.message,
    );
  }
  return false;
}

export function isForecastRequestAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function normalizeForecastClientErrorMessage(error: unknown): string {
  return normalizeForecastClientError(error).publicMessage;
}

export function clearForecastRequestClientCachesForTest(): void {
  forecastSuccessCache.clear();
  forecastInFlightRequests.clear();
}

export function normalizeForecastClientError(error: unknown): ForecastRequestError {
  if (error instanceof ForecastRequestError) {
    return error;
  }
  if (error instanceof ApiClientError) {
    return new ForecastRequestError(error.publicMessage, {
      status: error.status,
      code: error.code,
      retryable: error.retryable,
      transient: error.retryable && isTransientForecastStatus(error.status),
      publicMessage: error.publicMessage,
      cause: error,
    });
  }
  if (isForecastRequestAbortError(error)) {
    return new ForecastRequestError("", {
      code: "aborted",
      retryable: false,
      transient: false,
      publicMessage: "",
      cause: error,
    });
  }
  if (isTransientForecastError(error)) {
    return new ForecastRequestError(forecastCalculationTransientFailureMessage, {
      retryable: true,
      transient: true,
      publicMessage: forecastCalculationTransientFailureMessage,
      cause: error,
    });
  }
  return new ForecastRequestError(forecastCalculationGenericFailureMessage, {
    retryable: false,
    transient: false,
    publicMessage: forecastCalculationGenericFailureMessage,
    cause: error,
  });
}

function isFrontendForecastCacheable(query: ForecastCalculationRequestInput): boolean {
  return query.target === "general" && query.horizon === "24h";
}

function readCachedForecastResult(
  queryKey: string,
  options: {
    readonly allowStale: boolean;
    readonly useSessionStorage: boolean;
  },
): ForecastCalculationResult | null {
  const now = Date.now();
  const memoryRecord = forecastSuccessCache.get(queryKey);
  if (memoryRecord && isUsableCacheRecord(memoryRecord, queryKey, now, options.allowStale)) {
    return memoryRecord.result;
  }
  if (memoryRecord && memoryRecord.staleExpiresAt <= now) {
    forecastSuccessCache.delete(queryKey);
  }

  if (!options.useSessionStorage) {
    return null;
  }

  const sessionRecord = readSessionCacheRecord(queryKey);
  if (sessionRecord && isUsableCacheRecord(sessionRecord, queryKey, now, options.allowStale)) {
    forecastSuccessCache.set(queryKey, sessionRecord);
    return sessionRecord.result;
  }

  return null;
}

function writeCachedForecastResult(
  queryKey: string,
  result: ForecastCalculationResult,
  options: RequestForecastCalculationOptions,
): void {
  const now = Date.now();
  const record: ForecastCacheRecord = {
    version: 1,
    queryKey,
    createdAt: now,
    expiresAt: now + (options.successCacheTtlMs ?? defaultSuccessCacheTtlMs),
    staleExpiresAt: now + (options.staleCacheTtlMs ?? defaultStaleCacheTtlMs),
    result,
  };
  forecastSuccessCache.set(queryKey, record);
  pruneMemoryCache(now);

  if (options.useSessionStorage === false) {
    return;
  }
  writeSessionCacheRecord(queryKey, record);
}

function isUsableCacheRecord(
  record: ForecastCacheRecord | null | undefined,
  queryKey: string,
  now: number,
  allowStale: boolean,
): boolean {
  if (!record || record.version !== 1 || record.queryKey !== queryKey) {
    return false;
  }
  return allowStale ? record.staleExpiresAt > now : record.expiresAt > now;
}

function pruneMemoryCache(now: number): void {
  for (const [key, record] of forecastSuccessCache) {
    if (record.staleExpiresAt <= now) {
      forecastSuccessCache.delete(key);
    }
  }
  while (forecastSuccessCache.size > 64) {
    const oldestKey = forecastSuccessCache.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    forecastSuccessCache.delete(oldestKey);
  }
}

function readSessionCacheRecord(queryKey: string): ForecastCacheRecord | null {
  const storage = browserSessionStorage();
  if (!storage) {
    return null;
  }
  const storageKey = sessionCacheKey(queryKey);
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<ForecastCacheRecord>;
    if (
      parsed.version !== 1 ||
      parsed.queryKey !== queryKey ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.staleExpiresAt !== "number" ||
      !isRecord(parsed.result)
    ) {
      storage.removeItem(storageKey);
      return null;
    }
    return parsed as ForecastCacheRecord;
  } catch {
    return null;
  }
}

function writeSessionCacheRecord(queryKey: string, record: ForecastCacheRecord): void {
  const storage = browserSessionStorage();
  if (!storage) {
    return;
  }
  try {
    const serialized = JSON.stringify(record);
    if (serialized.length > maxSessionCachePayloadChars) {
      return;
    }
    storage.setItem(sessionCacheKey(queryKey), serialized);
  } catch {
    // Session cache is an optimization. Ignore quota and privacy-mode failures.
  }
}

function browserSessionStorage(): Storage | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }
  return window.sessionStorage;
}

function sessionCacheKey(queryKey: string): string {
  return `${sessionCachePrefix}${stableStringHash(queryKey)}`;
}

function stableStringHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function safeValidationMessage(payload: unknown): string {
  const message =
    readStringField(payload, "messageZh") ??
    readStringField(payload, "message") ??
    readStringField(payload, "error");
  if (message && isSafePublicErrorMessage(message)) {
    return message;
  }
  return forecastCalculationValidationFailureMessage;
}

function isSafePublicErrorMessage(message: string): boolean {
  return !/(stack|trace|provider|cache|key|token|secret|api[_-]?key|https?:\/\/|[A-Z]:\\|\/app\/)/i.test(
    message,
  );
}

function readStringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field.trim() : undefined;
}

function isTransientForecastStatus(status: number | undefined): boolean {
  return typeof status === "number" && transientForecastStatuses.has(status);
}

function retryDelayForAttempt(attempt: number, options: RetryWithBackoffOptions): number {
  const configured = options.retryDelayMs ?? defaultRetryDelayMs;
  const baseDelay = configured[Math.min(attempt, configured.length - 1)] ?? 0;
  if (baseDelay <= 0 || options.jitter === false) {
    return Math.max(0, baseDelay);
  }
  return Math.round(baseDelay + Math.random() * baseDelay * 0.2);
}

function sleepWithAbort(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
  if (delayMs <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timeout: ReturnType<typeof globalThis.setTimeout> = globalThis.setTimeout(
      resolveDelay,
      delayMs,
    );
    function abort() {
      globalThis.clearTimeout(timeout);
      reject(createAbortError());
    }
    function resolveDelay() {
      signal?.removeEventListener("abort", abort);
      resolve();
    }
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function rejectWhenAborted<TValue>(
  promise: Promise<TValue>,
  signal: AbortSignal | undefined,
): Promise<TValue> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function roundCacheNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
