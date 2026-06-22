import { createHash, createHmac } from "node:crypto";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";
import {
  tencentCaptchaDefaultCaptchaType,
  tencentCaptchaDefaultEndpoint,
  tencentCaptchaDefaultSdkUrl,
} from "@photo-weather/shared";

export const tencentCaptchaProviderCode = "tencent_captcha";

export type CaptchaProviderCode = typeof tencentCaptchaProviderCode;

export type CaptchaVerifyAction =
  | "login"
  | "register_send_code"
  | "register_confirm"
  | "account_binding";

export type CaptchaVerifyToken = {
  readonly providerCode: CaptchaProviderCode;
  readonly ticket: string;
  readonly randstr: string;
};

export type CaptchaVerifyInput = {
  readonly action: CaptchaVerifyAction;
  readonly ticket: string;
  readonly randstr: string;
  readonly userIp: string;
  readonly userAgent?: string | null;
};

export type CaptchaVerifyMode = "disabled" | "mock" | "real" | "config_check";

export type CaptchaVerifyResult = {
  readonly success: boolean;
  readonly providerCode: CaptchaProviderCode;
  readonly mode: CaptchaVerifyMode;
  readonly enforced: boolean;
  readonly messageZh: string;
  readonly error?: string;
  readonly providerRequestId?: string;
  readonly latencyMs?: number;
  readonly missingFields?: readonly string[];
  readonly sanitizedError?: string;
};

export type TencentCaptchaPublicConfig = {
  readonly enabled: boolean;
  readonly providerCode: CaptchaProviderCode;
  readonly captchaAppId: string;
  readonly sdkUrl: string;
  readonly enforceOnLogin: boolean;
  readonly enforceOnRegisterSendCode: boolean;
  readonly enforceOnRegisterConfirm: boolean;
  readonly enforceOnAccountBinding: boolean;
};

export type TencentCaptchaConfigCheckResult = {
  readonly success: boolean;
  readonly mode: "config_check";
  readonly providerType: "captcha";
  readonly providerCode: CaptchaProviderCode;
  readonly providerNameZh: string;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly configReady: boolean;
  readonly missingFields: readonly string[];
  readonly messageZh: string;
};

export type TencentCaptchaRuntimeConfig = {
  readonly providerType: "captcha";
  readonly providerCode: CaptchaProviderCode;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly realCallEnabled: boolean;
  readonly captchaAppId: string;
  readonly captchaType: number;
  readonly endpoint: string;
  readonly sdkUrl: string;
  readonly region: string;
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly enforceOnLogin: boolean;
  readonly enforceOnRegisterSendCode: boolean;
  readonly enforceOnRegisterConfirm: boolean;
  readonly enforceOnAccountBinding: boolean;
  readonly failOpenInDevelopment: boolean;
  readonly failOpenInProduction: boolean;
  readonly secretId: string;
  readonly secretKey: string;
  readonly appSecretKey: string;
};

type CaptchaRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
};

type CaptchaVerifyOptions = CaptchaRuntimeOptions & {
  readonly fetcher?: typeof fetch;
};

type JsonRecord = {
  readonly [key: string]: JsonValue;
};

type TencentCaptchaApiResponse = {
  readonly Response?: {
    readonly CaptchaCode?: number;
    readonly CaptchaMsg?: string;
    readonly RequestId?: string;
    readonly Error?: {
      readonly Code?: string;
      readonly Message?: string;
    };
  };
};

const tencentCaptchaProviderNameZh = "腾讯云验证码";
const tencentCaptchaAction = "DescribeCaptchaResult";
const tencentCaptchaVersion = "2019-07-22";
const tencentCaptchaService = "captcha";
const tencentCloudAlgorithm = "TC3-HMAC-SHA256";
const defaultTimeoutMs = 10000;
const minTimeoutMs = 1000;
const maxTimeoutMs = 30000;
const maxRetryCount = 3;

function isJsonRecord(value: JsonValue | null | undefined): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonValue | null | undefined, key: string, fallback = ""): string {
  if (!isJsonRecord(record)) {
    return fallback;
  }

  const value = record[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function readBoolean(record: JsonValue | null | undefined, key: string, fallback = false): boolean {
  if (!isJsonRecord(record)) {
    return fallback;
  }

  const value = record[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return fallback;
}

function readNumber(record: JsonValue | null | undefined, key: string): number | undefined {
  if (!isJsonRecord(record)) {
    return undefined;
  }

  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.round(Math.min(max, Math.max(min, value)));
}

function normalizeEndpoint(input: string, fallback = tencentCaptchaDefaultEndpoint): string {
  const raw = input.trim() || fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return fallback;
    }
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback;
  }
}

function resolveCaptchaConfig(
  record: ProviderConfigRecord | null,
  env: NodeJS.ProcessEnv,
): TencentCaptchaRuntimeConfig {
  const captchaAppId =
    readString(record?.configJson, "captchaAppId") || env.TENCENT_CAPTCHA_APP_ID?.trim() || "";
  const secretId =
    readString(record?.secretJson, "secretId") || env.TENCENTCLOUD_SECRET_ID?.trim() || "";
  const secretKey =
    readString(record?.secretJson, "secretKey") || env.TENCENTCLOUD_SECRET_KEY?.trim() || "";
  const appSecretKey =
    readString(record?.secretJson, "appSecretKey") ||
    env.TENCENT_CAPTCHA_APP_SECRET_KEY?.trim() ||
    "";

  return {
    providerType: "captcha",
    providerCode: tencentCaptchaProviderCode,
    displayName: record?.displayName ?? tencentCaptchaProviderNameZh,
    enabled: record?.enabled ?? false,
    priority: record?.priority ?? 100,
    realCallEnabled: readBoolean(record?.configJson, "realCallEnabled"),
    captchaAppId,
    captchaType: clampInteger(
      readNumber(record?.configJson, "captchaType"),
      tencentCaptchaDefaultCaptchaType,
      tencentCaptchaDefaultCaptchaType,
      tencentCaptchaDefaultCaptchaType,
    ),
    endpoint: normalizeEndpoint(
      readString(record?.configJson, "endpoint") || env.TENCENT_CAPTCHA_ENDPOINT?.trim() || "",
    ),
    sdkUrl: normalizeEndpoint(
      readString(record?.configJson, "sdkUrl") || env.TENCENT_CAPTCHA_SDK_URL?.trim() || "",
      tencentCaptchaDefaultSdkUrl,
    ),
    region: readString(record?.configJson, "region", "ap-guangzhou"),
    timeoutMs: clampInteger(
      readNumber(record?.configJson, "timeoutMs"),
      defaultTimeoutMs,
      minTimeoutMs,
      maxTimeoutMs,
    ),
    retryCount: clampInteger(readNumber(record?.configJson, "retryCount"), 1, 0, maxRetryCount),
    enforceOnLogin: readBoolean(record?.configJson, "enforceOnLogin"),
    enforceOnRegisterSendCode: readBoolean(record?.configJson, "enforceOnRegisterSendCode", true),
    enforceOnRegisterConfirm: readBoolean(record?.configJson, "enforceOnRegisterConfirm"),
    enforceOnAccountBinding: readBoolean(record?.configJson, "enforceOnAccountBinding", true),
    failOpenInDevelopment: readBoolean(record?.configJson, "failOpenInDevelopment", true),
    failOpenInProduction: readBoolean(record?.configJson, "failOpenInProduction"),
    secretId,
    secretKey,
    appSecretKey,
  };
}

export async function readRuntimeTencentCaptchaConfig(
  options: CaptchaRuntimeOptions = {},
): Promise<TencentCaptchaRuntimeConfig> {
  const env = options.env ?? process.env;
  const record = await getRuntimeProviderConfig("captcha", tencentCaptchaProviderCode, {
    client: options.dbClient,
  });
  return resolveCaptchaConfig(record, env);
}

function captchaActionEnforced(
  config: TencentCaptchaRuntimeConfig,
  action: CaptchaVerifyAction,
): boolean {
  if (!config.enabled || !config.realCallEnabled) {
    return false;
  }

  switch (action) {
    case "login":
      return config.enforceOnLogin;
    case "register_send_code":
      return config.enforceOnRegisterSendCode;
    case "register_confirm":
      return config.enforceOnRegisterConfirm;
    case "account_binding":
      return config.enforceOnAccountBinding;
  }
}

function shouldFailOpen(config: TencentCaptchaRuntimeConfig, env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" ? config.failOpenInProduction : config.failOpenInDevelopment;
}

function missingConfigFields(config: TencentCaptchaRuntimeConfig): string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.realCallEnabled) {
    missingFields.push("启用真实调用");
  }
  if (!config.captchaAppId) {
    missingFields.push("CaptchaAppId");
  }
  if (!config.appSecretKey) {
    missingFields.push("AppSecretKey");
  }
  if (!config.secretId) {
    missingFields.push("Secret ID");
  }
  if (!config.secretKey) {
    missingFields.push("Secret Key");
  }
  return missingFields;
}

function tokenInvalid(ticket: string, randstr: string): boolean {
  return (
    ticket.trim().length < 8 ||
    ticket.trim().length > 4096 ||
    randstr.trim().length < 1 ||
    randstr.trim().length > 256
  );
}

export async function getTencentCaptchaPublicConfig(
  options: CaptchaRuntimeOptions = {},
): Promise<TencentCaptchaPublicConfig> {
  const config = await readRuntimeTencentCaptchaConfig(options);
  const enabled = config.enabled && config.realCallEnabled && Boolean(config.captchaAppId);
  return {
    enabled,
    providerCode: tencentCaptchaProviderCode,
    captchaAppId: enabled ? config.captchaAppId : "",
    sdkUrl: config.sdkUrl,
    enforceOnLogin: enabled ? config.enforceOnLogin : false,
    enforceOnRegisterSendCode: enabled ? config.enforceOnRegisterSendCode : false,
    enforceOnRegisterConfirm: enabled ? config.enforceOnRegisterConfirm : false,
    enforceOnAccountBinding: enabled ? config.enforceOnAccountBinding : false,
  };
}

export async function checkTencentCaptchaConfig(
  options: CaptchaRuntimeOptions = {},
): Promise<TencentCaptchaConfigCheckResult> {
  const config = await readRuntimeTencentCaptchaConfig(options);
  const missingFields = missingConfigFields(config);
  const configReady = missingFields.length === 0;
  const messageZh = configReady
    ? "腾讯云验证码配置检查通过，未请求真实验证码服务。"
    : "腾讯云验证码配置尚未完整，请补齐必要字段后再启用真实校验。";

  return {
    success: true,
    mode: "config_check",
    providerType: "captcha",
    providerCode: tencentCaptchaProviderCode,
    providerNameZh: tencentCaptchaProviderNameZh,
    enabled: config.enabled,
    realCallEnabled: config.realCallEnabled,
    configReady,
    missingFields,
    messageZh,
  };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacBuffer(key: string | Buffer, input: string): Buffer {
  return createHmac("sha256", key).update(input, "utf8").digest();
}

function hmacHex(key: string | Buffer, input: string): string {
  return createHmac("sha256", key).update(input, "utf8").digest("hex");
}

function timestampToDate(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function captchaAppIdPayloadValue(appId: string): number | string {
  const parsed = Number(appId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : appId;
}

function buildTencentCloudHeaders(
  config: TencentCaptchaRuntimeConfig,
  payload: string,
  timestamp: number,
): Record<string, string> {
  const endpointUrl = new URL(config.endpoint);
  const host = endpointUrl.host;
  const date = timestampToDate(timestamp);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${tencentCaptchaService}/tc3_request`;
  const stringToSign = [
    tencentCloudAlgorithm,
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacBuffer(`TC3${config.secretKey}`, date);
  const secretService = hmacBuffer(secretDate, tencentCaptchaService);
  const secretSigning = hmacBuffer(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);
  const authorization = [
    `${tencentCloudAlgorithm} Credential=${config.secretId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  return {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: host,
    "X-TC-Action": tencentCaptchaAction,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": tencentCaptchaVersion,
    ...(config.region ? { "X-TC-Region": config.region } : {}),
  };
}

async function fetchWithTimeout(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function responseToTencentCaptchaApiResponse(value: unknown): TencentCaptchaApiResponse {
  if (!isRecord(value) || !isRecord(value.Response)) {
    return {};
  }
  const response = value.Response;
  const error = isRecord(response.Error) ? response.Error : undefined;
  return {
    Response: {
      CaptchaCode: typeof response.CaptchaCode === "number" ? response.CaptchaCode : undefined,
      CaptchaMsg: typeof response.CaptchaMsg === "string" ? response.CaptchaMsg : undefined,
      RequestId: typeof response.RequestId === "string" ? response.RequestId : undefined,
      Error: error
        ? {
            Code: typeof error.Code === "string" ? error.Code : undefined,
            Message: typeof error.Message === "string" ? error.Message : undefined,
          }
        : undefined,
    },
  };
}

function sanitizeCaptchaErrorMessage(
  error: unknown,
  secrets: readonly string[],
  token: Pick<CaptchaVerifyInput, "ticket" | "randstr">,
): string {
  const fallback = "验证码服务暂不可用";
  const raw =
    error instanceof Error
      ? error.message
      : isRecord(error) && typeof error.message === "string"
        ? error.message
        : "";
  let sanitized = (raw || fallback).split(/\r?\n/)[0]?.slice(0, 300) ?? fallback;
  for (const secret of [...secrets, token.ticket, token.randstr]) {
    if (secret) {
      sanitized = sanitized.split(secret).join("[redacted]");
    }
  }
  return sanitized
    .replace(/Authorization:\s*[^,\s]+/gi, "Authorization: [redacted]")
    .replace(/(Signature=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(SecretKey["'\s:=]+)[^&\s,}"]+/gi, "$1[redacted]")
    .replace(/(AppSecretKey["'\s:=]+)[^&\s,}"]+/gi, "$1[redacted]")
    .replace(/(Ticket["'\s:=]+)[^&\s,}"]+/gi, "$1[redacted]")
    .replace(/(Randstr["'\s:=]+)[^&\s,}"]+/gi, "$1[redacted]");
}

async function callTencentCaptcha(
  config: TencentCaptchaRuntimeConfig,
  input: CaptchaVerifyInput,
  fetcher: typeof fetch,
): Promise<CaptchaVerifyResult> {
  const startedAt = Date.now();
  const payload = JSON.stringify({
    CaptchaType: config.captchaType,
    Ticket: input.ticket.trim(),
    UserIp: input.userIp,
    Randstr: input.randstr.trim(),
    CaptchaAppId: captchaAppIdPayloadValue(config.captchaAppId),
    AppSecretKey: config.appSecretKey,
    NeedGetCaptchaTime: 1,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await fetchWithTimeout(
        fetcher,
        config.endpoint,
        {
          method: "POST",
          headers: buildTencentCloudHeaders(config, payload, timestamp),
          body: payload,
        },
        config.timeoutMs,
      );
      const body = responseToTencentCaptchaApiResponse(await response.json().catch(() => ({})));
      const apiResponse = body.Response;
      const latencyMs = Date.now() - startedAt;
      if (!response.ok) {
        throw new Error(apiResponse?.Error?.Message || `Tencent captcha HTTP ${response.status}`);
      }
      if (apiResponse?.Error?.Code) {
        throw new Error(apiResponse.Error.Message || apiResponse.Error.Code);
      }
      if (apiResponse?.CaptchaCode === 1) {
        return {
          success: true,
          providerCode: tencentCaptchaProviderCode,
          mode: "real",
          enforced: true,
          providerRequestId: apiResponse.RequestId,
          latencyMs,
          messageZh: "安全验证已通过。",
        };
      }

      return {
        success: false,
        providerCode: tencentCaptchaProviderCode,
        mode: "real",
        enforced: true,
        error: "captcha_invalid",
        providerRequestId: apiResponse?.RequestId,
        latencyMs,
        messageZh: "安全验证未通过，请重新验证。",
      };
    } catch (error) {
      lastError = error;
      if (attempt >= config.retryCount) {
        break;
      }
    }
  }

  return {
    success: false,
    providerCode: tencentCaptchaProviderCode,
    mode: "real",
    enforced: true,
    error: "captcha_provider_unavailable",
    latencyMs: Date.now() - startedAt,
    sanitizedError: sanitizeCaptchaErrorMessage(
      lastError,
      [config.secretId, config.secretKey, config.appSecretKey],
      input,
    ),
    messageZh: "安全验证服务暂不可用，请稍后重试。",
  };
}

export async function verifyTencentCaptcha(
  input: CaptchaVerifyInput,
  options: CaptchaVerifyOptions = {},
): Promise<CaptchaVerifyResult> {
  const env = options.env ?? process.env;
  const config = await readRuntimeTencentCaptchaConfig(options);
  const enforced = captchaActionEnforced(config, input.action);

  if (!enforced) {
    return {
      success: true,
      providerCode: tencentCaptchaProviderCode,
      mode: "disabled",
      enforced: false,
      messageZh: "当前操作未启用人机验证。",
    };
  }

  if (!input.ticket.trim() || !input.randstr.trim()) {
    return {
      success: false,
      providerCode: tencentCaptchaProviderCode,
      mode: "config_check",
      enforced: true,
      error: "captcha_required",
      messageZh: "请先完成安全验证。",
    };
  }

  if (tokenInvalid(input.ticket, input.randstr)) {
    return {
      success: false,
      providerCode: tencentCaptchaProviderCode,
      mode: "config_check",
      enforced: true,
      error: "captcha_invalid",
      messageZh: "安全验证参数无效，请重新验证。",
    };
  }

  const missingFields = missingConfigFields(config);
  if (missingFields.length > 0) {
    if (shouldFailOpen(config, env)) {
      return {
        success: true,
        providerCode: tencentCaptchaProviderCode,
        mode: "mock",
        enforced: true,
        missingFields,
        messageZh: "当前环境验证码配置缺失，已按配置放行。",
      };
    }

    return {
      success: false,
      providerCode: tencentCaptchaProviderCode,
      mode: "config_check",
      enforced: true,
      error: "captcha_config_missing",
      missingFields,
      messageZh: "安全验证配置尚未完整，请联系管理员。",
    };
  }

  const result = await callTencentCaptcha(config, input, options.fetcher ?? fetch);
  if (!result.success && shouldFailOpen(config, env)) {
    return {
      ...result,
      success: true,
      mode: "mock",
      messageZh: "安全验证服务暂不可用，当前环境已按配置放行。",
    };
  }

  return result;
}
