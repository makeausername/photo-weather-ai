import type { AdminAuthSession } from "../app/admin/admin-api";
import {
  clearAdminSession,
  getStoredAdminTokens,
  storeAdminSession,
} from "../app/admin/admin-api";
import { sanitizeAuthErrorMessage } from "./auth-errors";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type ApiAuthMode = "public" | "optional" | "required";

export type ApiErrorKind =
  | "upgrade_required"
  | "auth"
  | "captcha"
  | "validation"
  | "provider"
  | "service"
  | "unknown";

export type ApiIssue = {
  readonly path?: string;
  readonly message?: string;
};

type ApiErrorPayload = {
  readonly error?: string;
  readonly message?: string;
  readonly messageZh?: string;
  readonly access?: unknown;
  readonly required?: unknown;
  readonly issues?: readonly ApiIssue[];
  readonly errorCategory?: string;
};

export type ApiClientErrorOptions = {
  readonly status?: number;
  readonly code?: string;
  readonly kind?: ApiErrorKind;
  readonly publicMessage?: string;
  readonly retryable?: boolean;
  readonly access?: unknown;
  readonly required?: unknown;
  readonly issues?: readonly ApiIssue[];
  readonly payload?: unknown;
  readonly cause?: unknown;
};

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly kind: ApiErrorKind;
  readonly publicMessage: string;
  readonly retryable: boolean;
  readonly access?: unknown;
  readonly required?: unknown;
  readonly issues?: readonly ApiIssue[];
  readonly payload?: unknown;
  override readonly cause?: unknown;

  constructor(message: string, options: ApiClientErrorOptions = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = options.status;
    this.code = options.code;
    this.kind = options.kind ?? "unknown";
    this.publicMessage = options.publicMessage ?? message;
    this.retryable = options.retryable ?? false;
    this.access = options.access;
    this.required = options.required;
    this.issues = options.issues;
    this.payload = options.payload;
    this.cause = options.cause;
  }
}

export type ApiFetchOptions = {
  readonly authMode?: ApiAuthMode;
  readonly retryOnUnauthorized?: boolean;
  readonly fallbackMessage?: string;
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
};

export const loginExpiredMessage = "登录状态已过期，请重新登录。";
export const loginRequiredMessage = "请先登录后再操作。";
export const upgradeRequiredTitle = "需要开通套餐";
export const upgradeRequiredDefaultMessage =
  "当前账户只能查看未来 24 小时基础天气。开通月卡、季卡或年卡后可查看完整摄影判断。";
export const captchaRequiredMessage = "请先完成人机验证后再提交。";
export const validationFailedMessage = "提交内容有误，请检查后重试。";
export const retryableServiceMessage = "服务暂时不可用，请稍后重试。";
export const unknownServiceMessage = "服务暂时不可用，请稍后重试。";

const authErrorCodes = new Set([
  "invalid_refresh_token",
  "token_expired",
  "invalid_session",
  "invalid_token",
  "missing_token",
  "unauthenticated",
  "admin_unauthorized",
]);

const captchaErrorCodes = new Set(["captcha_required", "captcha_invalid"]);

const unsafePublicErrorPatterns: readonly RegExp[] = [
  /prisma/i,
  /database/i,
  /postgres/i,
  /passwordHash/i,
  /refreshTokenHash/i,
  /providerPayload/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /stack/i,
  /trace/i,
  /:\d+:\d+/,
  /[A-Z]:\\/,
  /\/app\//,
  /\.ts:\d+/,
  /\bat\s+/,
];

export function currentAuthCacheScope(): string {
  const tokens = getStoredAdminTokens();
  return tokens ? `user:${stableStringHash(tokens.accessToken)}` : "guest";
}

export function stableStringHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function sanitizeApiErrorMessage(
  message: string | undefined,
  fallback = unknownServiceMessage,
): string {
  const sanitized = sanitizeAuthErrorMessage(message, fallback);
  if (unsafePublicErrorPatterns.some((pattern) => pattern.test(sanitized))) {
    return fallback;
  }
  return sanitized;
}

export async function publicApiFetch<TResponse>(
  path: string,
  init: RequestInit = {},
  options: Omit<ApiFetchOptions, "authMode"> = {},
): Promise<TResponse> {
  return apiFetch<TResponse>(path, init, { ...options, authMode: "public" });
}

export async function optionalAuthApiFetch<TResponse>(
  path: string,
  init: RequestInit = {},
  options: Omit<ApiFetchOptions, "authMode"> = {},
): Promise<TResponse> {
  return apiFetch<TResponse>(path, init, { ...options, authMode: "optional" });
}

export async function requiredAuthApiFetch<TResponse>(
  path: string,
  init: RequestInit = {},
  options: Omit<ApiFetchOptions, "authMode"> = {},
): Promise<TResponse> {
  return apiFetch<TResponse>(path, init, { ...options, authMode: "required" });
}

export async function apiFetch<TResponse>(
  path: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {},
): Promise<TResponse> {
  const authMode = options.authMode ?? "public";
  const fetcher = options.fetcher ?? fetch;
  const tokens = getStoredAdminTokens();

  if (authMode === "required" && !tokens) {
    throw new ApiClientError(loginRequiredMessage, {
      status: 401,
      code: "missing_token",
      kind: "auth",
      publicMessage: loginRequiredMessage,
    });
  }

  const response = await fetcher(`${options.baseUrl ?? apiBaseUrl}${path}`, {
    ...init,
    headers: requestHeaders(init.headers, tokens?.accessToken, authMode),
  });

  if (
    response.status === 401 &&
    options.retryOnUnauthorized !== false &&
    tokens?.refreshToken &&
    authMode !== "public"
  ) {
    const refreshed = await refreshCurrentSession({
      baseUrl: options.baseUrl,
      fetcher,
    });
    if (refreshed) {
      return apiFetch<TResponse>(path, init, {
        ...options,
        retryOnUnauthorized: false,
      });
    }
  }

  if (!response.ok) {
    throw await normalizeApiResponseError(response, options.fallbackMessage);
  }

  return (await response.json()) as TResponse;
}

export async function normalizeApiResponseError(
  response: Response,
  fallbackMessage = unknownServiceMessage,
): Promise<ApiClientError> {
  const payload = await readApiErrorPayload(response);
  const record = isRecord(payload) ? (payload as ApiErrorPayload) : {};
  const code = readString(record.error);
  const status = response.status;
  const kind = apiErrorKind(status, code, record.errorCategory);
  const fallback = fallbackMessageForKind(kind, status, code, fallbackMessage);
  const message = publicMessageFromPayload(record, fallback);
  const retryable = isRetryableApiError(status, code, kind);

  if (kind === "auth") {
    clearAdminSession();
  }

  return new ApiClientError(message, {
    status,
    code,
    kind,
    publicMessage: message,
    retryable,
    access: record.access,
    required: record.required,
    issues: record.issues,
    payload,
  });
}

function requestHeaders(
  headers: HeadersInit | undefined,
  accessToken: string | undefined,
  authMode: ApiAuthMode,
): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(authMode !== "public" && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };
}

async function refreshCurrentSession(options: {
  readonly baseUrl?: string;
  readonly fetcher: typeof fetch;
}): Promise<boolean> {
  const tokens = getStoredAdminTokens();
  if (!tokens) {
    return false;
  }

  const response = await options.fetcher(`${options.baseUrl ?? apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!response.ok) {
    clearAdminSession();
    return false;
  }

  storeAdminSession((await response.json()) as AdminAuthSession);
  return true;
}

async function readApiErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function publicMessageFromPayload(payload: ApiErrorPayload, fallback: string): string {
  const issueMessage = payload.issues?.find((issue) => issue.message)?.message;
  return sanitizeApiErrorMessage(
    readString(payload.messageZh) ?? readString(payload.message) ?? issueMessage,
    fallback,
  );
}

function apiErrorKind(
  status: number,
  code: string | undefined,
  errorCategory: string | undefined,
): ApiErrorKind {
  if (code === "upgrade_required") {
    return "upgrade_required";
  }
  if (code && authErrorCodes.has(code)) {
    return "auth";
  }
  if (code && captchaErrorCodes.has(code)) {
    return "captcha";
  }
  if (code === "validation_error" || status === 400) {
    return "validation";
  }
  if (
    status === 408 ||
    status === 429 ||
    status >= 500 ||
    /provider|timeout|unavailable|upstream|temporar/i.test(code ?? "") ||
    /provider|timeout|unavailable|upstream|temporar/i.test(errorCategory ?? "")
  ) {
    return status >= 500 ? "service" : "provider";
  }
  return "unknown";
}

function fallbackMessageForKind(
  kind: ApiErrorKind,
  status: number,
  code: string | undefined,
  fallbackMessage: string,
): string {
  if (kind === "upgrade_required") {
    return upgradeRequiredDefaultMessage;
  }
  if (kind === "auth") {
    return code === "missing_token" || status === 403 ? loginRequiredMessage : loginExpiredMessage;
  }
  if (kind === "captcha") {
    return captchaRequiredMessage;
  }
  if (kind === "validation") {
    return validationFailedMessage;
  }
  if (kind === "provider" || kind === "service") {
    return retryableServiceMessage;
  }
  return fallbackMessage;
}

function isRetryableApiError(status: number, code: string | undefined, kind: ApiErrorKind): boolean {
  if (kind === "upgrade_required" || kind === "auth" || kind === "captcha" || kind === "validation") {
    return false;
  }
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    /timeout|temporary|unavailable|upstream/i.test(code ?? "")
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
