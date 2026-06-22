import { createHash, createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { getRuntimeProviderConfig } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";

export const cdnProviderCodes = ["aliyun_cdn", "tencent_cdn"] as const;

export type CdnProviderCode = (typeof cdnProviderCodes)[number];
export type CdnProviderType = "cdn";
export type CdnOperationMode = "mock" | "config_check" | "real";
export type CdnRefreshType = "file" | "directory" | "url" | "path";
export type CdnCaller = "admin" | "manual" | "system";

export type CdnRefreshInput = {
  readonly urls?: readonly string[];
  readonly directories?: readonly string[];
  readonly refreshType?: CdnRefreshType;
  readonly caller: CdnCaller;
  readonly requestId?: string;
};

export type CdnPrefetchInput = {
  readonly urls: readonly string[];
  readonly caller: CdnCaller;
  readonly requestId?: string;
};

export type CdnTaskListInput = {
  readonly taskId?: string;
  readonly requestId?: string;
};

export type CdnOperationResult = {
  readonly success: boolean;
  readonly providerCode: CdnProviderCode;
  readonly providerNameZh: string;
  readonly mode: CdnOperationMode;
  readonly taskId?: string;
  readonly providerTaskId?: string;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly messageZh: string;
  readonly sanitizedError?: string;
};

export type CdnProviderStatus = {
  readonly providerType: CdnProviderType;
  readonly providerCode: CdnProviderCode;
  readonly providerNameZh: string;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly dryRun: boolean;
  readonly domains: readonly string[];
  readonly endpoint: string;
  readonly configReady: boolean;
  readonly missingFields: readonly string[];
};

export type CdnTestConnectionResult = CdnOperationResult & {
  readonly providerType: CdnProviderType;
  readonly enabled: boolean;
  readonly realCallEnabled: boolean;
  readonly attempted: boolean;
  readonly configReady: boolean;
  readonly missingFields: readonly string[];
  readonly invalidFields: readonly string[];
};

export type CdnProvider = {
  readonly providerType: CdnProviderType;
  readonly providerCode: CdnProviderCode;
  getStatus(): CdnProviderStatus;
  testConnection(): Promise<CdnTestConnectionResult>;
  refreshUrls(input: CdnRefreshInput): Promise<CdnOperationResult>;
  refreshDirectories(input: CdnRefreshInput): Promise<CdnOperationResult>;
  prefetchUrls(input: CdnPrefetchInput): Promise<CdnOperationResult>;
  listTasks(input?: CdnTaskListInput): Promise<CdnOperationResult>;
  normalizeDomain(input: string): string;
};

export type BaseRuntimeCdnConfig = {
  readonly providerType: CdnProviderType;
  readonly providerCode: CdnProviderCode;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly realCallEnabled: boolean;
  readonly endpoint: string;
  readonly domains: readonly string[];
  readonly timeoutMs: number;
  readonly retryCount: number;
  readonly rateLimitPerMinute: number;
  readonly dryRun: boolean;
};

export type AliyunCdnRuntimeConfig = BaseRuntimeCdnConfig & {
  readonly providerCode: "aliyun_cdn";
  readonly defaultRefreshType: "file" | "directory";
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
};

export type TencentCdnRuntimeConfig = BaseRuntimeCdnConfig & {
  readonly providerCode: "tencent_cdn";
  readonly region: string;
  readonly defaultPurgeType: "url" | "path";
  readonly secretId: string;
  readonly secretKey: string;
};

export type RuntimeCdnConfig = AliyunCdnRuntimeConfig | TencentCdnRuntimeConfig;

type CdnRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly providerCode: CdnProviderCode;
};

type CdnProviderFactoryOptions = {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
};

type JsonRecord = {
  readonly [key: string]: JsonValue;
};

const defaultAliyunEndpoint = "https://cdn.aliyuncs.com";
const defaultTencentEndpoint = "https://cdn.tencentcloudapi.com";
const defaultCdnTimeoutMs = 10000;
const minCdnTimeoutMs = 1000;
const maxCdnTimeoutMs = 120000;
const maxRetryCount = 5;
const defaultRateLimitPerMinute = 60;

export class CdnProviderError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly messageZh: string;

  constructor(code: string, messageZh: string, statusCode = 400) {
    super(messageZh);
    this.name = "CdnProviderError";
    this.code = code;
    this.statusCode = statusCode;
    this.messageZh = messageZh;
  }
}

export function isCdnProviderCode(value: string): value is CdnProviderCode {
  return cdnProviderCodes.includes(value as CdnProviderCode);
}

export function cdnProviderNameZh(providerCode: CdnProviderCode): string {
  return providerCode === "aliyun_cdn" ? "阿里云 CDN" : "腾讯云 CDN";
}

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

function readJsonValue(record: JsonValue | null | undefined, key: string): JsonValue | undefined {
  return isJsonRecord(record) ? record[key] : undefined;
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

function normalizeEndpoint(input: string, fallback: string): string {
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

export function normalizeCdnDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new CdnProviderError("invalid_cdn_domain", "CDN 域名不能为空。");
  }

  let hostname: string;
  try {
    const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    throw new CdnProviderError("invalid_cdn_domain", "CDN 域名格式不正确。");
  }

  hostname = hostname.replace(/\.$/, "");
  if (!hostname || isUnsafeHostname(hostname)) {
    throw new CdnProviderError("invalid_cdn_domain", "CDN 域名不能是本机或内网地址。");
  }

  if (!/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(hostname)) {
    throw new CdnProviderError("invalid_cdn_domain", "CDN 域名格式不正确。");
  }

  return hostname;
}

export function parseCdnDomains(value: JsonValue | null | undefined): readonly string[] {
  const rawItems: string[] = [];
  if (Array.isArray(value)) {
    rawItems.push(...value.filter((item): item is string => typeof item === "string"));
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          rawItems.push(...parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        throw new CdnProviderError("invalid_cdn_domain", "CDN 域名 JSON 数组格式不正确。");
      }
    } else {
      rawItems.push(...trimmed.split(/[\n,]+/));
    }
  }

  return [...new Set(rawItems.map(normalizeCdnDomain))];
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) {
    return false;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isUnsafeHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local")
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }
  return false;
}

function domainAllowed(hostname: string, allowedDomains: readonly string[]): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return allowedDomains.some((domain) => {
    if (domain.startsWith("*.")) {
      const suffix = domain.slice(1);
      return normalized.endsWith(suffix) && normalized.length > suffix.length;
    }
    return normalized === domain;
  });
}

export function validateCdnOperationUrl(
  input: string,
  allowedDomains: readonly string[],
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new CdnProviderError("invalid_cdn_url", "CDN 操作 URL 不能为空。");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CdnProviderError("invalid_cdn_url", "CDN 操作 URL 格式不正确。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CdnProviderError("invalid_cdn_url", "CDN 操作只允许 http/https URL。");
  }
  if (url.username || url.password) {
    throw new CdnProviderError("invalid_cdn_url", "CDN 操作 URL 不能包含用户名或密码。");
  }
  if (isUnsafeHostname(url.hostname)) {
    throw new CdnProviderError("invalid_cdn_url", "CDN 操作不允许 localhost、内网或本机地址。");
  }
  if (allowedDomains.length === 0) {
    throw new CdnProviderError("cdn_domain_missing", "请先配置 CDN 加速域名。", 409);
  }
  if (!domainAllowed(url.hostname, allowedDomains)) {
    throw new CdnProviderError(
      "cdn_domain_not_allowed",
      "CDN 操作 URL 必须属于已配置的加速域名。",
    );
  }

  return url.toString();
}

function normalizeOperationUrls(
  urls: readonly string[] | undefined,
  allowedDomains: readonly string[],
): readonly string[] {
  return [...new Set((urls ?? []).map((url) => validateCdnOperationUrl(url, allowedDomains)))];
}

function normalizeDirectoryUrls(
  urls: readonly string[] | undefined,
  allowedDomains: readonly string[],
): readonly string[] {
  return normalizeOperationUrls(urls, allowedDomains).map((url) => (url.endsWith("/") ? url : `${url}/`));
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

function sanitizeCdnErrorMessage(error: unknown, secrets: readonly string[]): string {
  const fallback = "CDN 服务暂不可用";
  const raw =
    error instanceof Error
      ? error.message
      : isRecord(error) && typeof error.message === "string"
        ? error.message
        : "";
  let sanitized = (raw || fallback).split(/\r?\n/)[0]?.slice(0, 300) ?? fallback;
  for (const secret of secrets) {
    if (secret) {
      sanitized = sanitized.split(secret).join("[redacted]");
    }
  }
  return sanitized
    .replace(/Authorization:\s*[^,\s]+/gi, "Authorization: [redacted]")
    .replace(/(Signature=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(AccessKeySecret["'\s:=]+)[^&\s,}"]+/gi, "$1[redacted]")
    .replace(/(SecretKey["'\s:=]+)[^&\s,}"]+/gi, "$1[redacted]");
}

function resultMessageForConfigCheck(
  providerCode: CdnProviderCode,
  dryRun: boolean,
): string {
  if (dryRun) {
    return `${cdnProviderNameZh(providerCode)} Dry Run 已开启，配置检查通过，未请求真实 CDN 服务。`;
  }
  return `${cdnProviderNameZh(providerCode)} 当前为配置检查模式，未请求真实 CDN 服务。`;
}

function baseConfigMissingFields(config: BaseRuntimeCdnConfig): string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.endpoint) {
    missingFields.push("Endpoint");
  }
  if (config.domains.length === 0) {
    missingFields.push("CDN 加速域名");
  }
  return missingFields;
}

function resolveBaseConfig(
  record: ProviderConfigRecord | null,
  providerCode: CdnProviderCode,
): BaseRuntimeCdnConfig {
  const fallbackEndpoint =
    providerCode === "aliyun_cdn" ? defaultAliyunEndpoint : defaultTencentEndpoint;
  return {
    providerType: "cdn",
    providerCode,
    displayName: record?.displayName ?? cdnProviderNameZh(providerCode),
    enabled: record?.enabled ?? false,
    priority: record?.priority ?? 100,
    realCallEnabled: readBoolean(record?.configJson, "realCallEnabled"),
    endpoint: normalizeEndpoint(readString(record?.configJson, "endpoint"), fallbackEndpoint),
    domains: parseCdnDomains(readJsonValue(record?.configJson, "domains")),
    timeoutMs: clampInteger(
      readNumber(record?.configJson, "timeoutMs"),
      defaultCdnTimeoutMs,
      minCdnTimeoutMs,
      maxCdnTimeoutMs,
    ),
    retryCount: clampInteger(readNumber(record?.configJson, "retryCount"), 1, 0, maxRetryCount),
    rateLimitPerMinute: clampInteger(
      readNumber(record?.configJson, "rateLimitPerMinute"),
      defaultRateLimitPerMinute,
      1,
      1000,
    ),
    dryRun: readBoolean(record?.configJson, "dryRun", true),
  };
}

function resolveAliyunConfig(record: ProviderConfigRecord | null): AliyunCdnRuntimeConfig {
  const base = resolveBaseConfig(record, "aliyun_cdn");
  const rawRefreshType = readString(record?.configJson, "defaultRefreshType", "file");
  return {
    ...base,
    providerCode: "aliyun_cdn",
    defaultRefreshType: rawRefreshType === "directory" ? "directory" : "file",
    accessKeyId: readString(record?.secretJson, "accessKeyId"),
    accessKeySecret: readString(record?.secretJson, "accessKeySecret"),
  };
}

function resolveTencentConfig(record: ProviderConfigRecord | null): TencentCdnRuntimeConfig {
  const base = resolveBaseConfig(record, "tencent_cdn");
  const rawPurgeType = readString(record?.configJson, "defaultPurgeType", "url");
  return {
    ...base,
    providerCode: "tencent_cdn",
    region: readString(record?.configJson, "region"),
    defaultPurgeType: rawPurgeType === "path" ? "path" : "url",
    secretId: readString(record?.secretJson, "secretId"),
    secretKey: readString(record?.secretJson, "secretKey"),
  };
}

export async function readRuntimeCdnConfig(
  options: CdnRuntimeOptions,
): Promise<RuntimeCdnConfig> {
  const record = await getRuntimeProviderConfig("cdn", options.providerCode, {
    client: options.dbClient,
  });
  return options.providerCode === "aliyun_cdn"
    ? resolveAliyunConfig(record)
    : resolveTencentConfig(record);
}

abstract class BaseCdnProvider<TConfig extends RuntimeCdnConfig> implements CdnProvider {
  readonly providerType = "cdn" as const;
  abstract readonly providerCode: CdnProviderCode;
  protected readonly env: NodeJS.ProcessEnv;
  protected readonly fetcher: typeof fetch;

  constructor(protected readonly config: TConfig, options: CdnProviderFactoryOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetcher = options.fetcher ?? fetch;
  }

  getStatus(): CdnProviderStatus {
    const missingFields = this.missingFields();
    return {
      providerType: "cdn",
      providerCode: this.config.providerCode,
      providerNameZh: cdnProviderNameZh(this.config.providerCode),
      enabled: this.config.enabled,
      realCallEnabled: this.config.realCallEnabled,
      dryRun: this.config.dryRun,
      domains: this.config.domains,
      endpoint: this.config.endpoint,
      configReady: missingFields.length === 0,
      missingFields,
    };
  }

  async testConnection(): Promise<CdnTestConnectionResult> {
    const invalidFields = this.invalidFields();
    const missingFields = this.missingFields();
    const success = invalidFields.length === 0 && missingFields.length === 0;
    const mode: CdnOperationMode = this.config.realCallEnabled ? "config_check" : "mock";
    const messageZh = success
      ? resultMessageForConfigCheck(this.providerCode, this.config.dryRun)
      : `${cdnProviderNameZh(this.providerCode)} 配置不完整，请补充：${[
          ...missingFields,
          ...invalidFields,
        ].join("、")}。`;

    if (success && this.config.realCallEnabled) {
      this.prepareSignedConnectionCheck();
    }

    return {
      success,
      providerType: "cdn",
      providerCode: this.providerCode,
      providerNameZh: cdnProviderNameZh(this.providerCode),
      mode,
      attempted: false,
      acceptedCount: 0,
      rejectedCount: success ? 0 : missingFields.length + invalidFields.length,
      enabled: this.config.enabled,
      realCallEnabled: this.config.realCallEnabled,
      configReady: success,
      missingFields,
      invalidFields,
      messageZh,
    };
  }

  async listTasks(): Promise<CdnOperationResult> {
    return this.configCheckResult(0, "CDN 任务查询接口已预留，当前未请求真实 CDN 服务。");
  }

  normalizeDomain(input: string): string {
    return normalizeCdnDomain(input);
  }

  protected missingFields(): string[] {
    return baseConfigMissingFields(this.config);
  }

  protected invalidFields(): string[] {
    const invalidFields: string[] = [];
    if (!this.config.endpoint.startsWith("https://") && !this.config.endpoint.startsWith("http://")) {
      invalidFields.push("Endpoint");
    }
    if (this.config.timeoutMs < minCdnTimeoutMs || this.config.timeoutMs > maxCdnTimeoutMs) {
      invalidFields.push("请求超时");
    }
    if (this.config.retryCount < 0 || this.config.retryCount > maxRetryCount) {
      invalidFields.push("重试次数");
    }
    return invalidFields;
  }

  protected prepareUrls(urls: readonly string[] | undefined): readonly string[] {
    this.assertConfigReady();
    return normalizeOperationUrls(urls, this.config.domains);
  }

  protected prepareDirectoryUrls(urls: readonly string[] | undefined): readonly string[] {
    this.assertConfigReady();
    return normalizeDirectoryUrls(urls, this.config.domains);
  }

  protected shouldCallRealProvider(): boolean {
    return (
      this.config.realCallEnabled &&
      !this.config.dryRun &&
      this.env.NODE_ENV !== "test" &&
      this.missingFields().length === 0 &&
      this.realSecretMissingFields().length === 0
    );
  }

  protected configCheckResult(
    acceptedCount: number,
    messageZh = resultMessageForConfigCheck(this.providerCode, this.config.dryRun),
  ): CdnOperationResult {
    return {
      success: true,
      providerCode: this.providerCode,
      providerNameZh: cdnProviderNameZh(this.providerCode),
      mode: this.config.realCallEnabled && this.config.dryRun ? "config_check" : "mock",
      acceptedCount,
      rejectedCount: 0,
      messageZh,
    };
  }

  protected failureResult(error: unknown, acceptedCount = 0): CdnOperationResult {
    return {
      success: false,
      providerCode: this.providerCode,
      providerNameZh: cdnProviderNameZh(this.providerCode),
      mode: "real",
      acceptedCount,
      rejectedCount: acceptedCount,
      messageZh: `${cdnProviderNameZh(this.providerCode)} CDN 操作失败。`,
      sanitizedError: sanitizeCdnErrorMessage(error, this.secretValues()),
    };
  }

  protected assertConfigReady(): void {
    const missingFields = this.missingFields();
    if (missingFields.length > 0) {
      throw new CdnProviderError(
        "cdn_config_missing",
        `${cdnProviderNameZh(this.providerCode)} 配置不完整，请补充：${missingFields.join("、")}。`,
        409,
      );
    }
  }

  protected assertRealSecretReady(): void {
    const missingFields = this.realSecretMissingFields();
    if (missingFields.length > 0) {
      throw new CdnProviderError(
        "cdn_secret_missing",
        `${cdnProviderNameZh(this.providerCode)} 真实调用已开启，请补充：${missingFields.join("、")}。`,
        409,
      );
    }
  }

  protected async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.retryCount; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await this.fetcher(url, {
          ...init,
          signal: controller.signal,
        });
        const text = await response.text();
        const payload = text ? (JSON.parse(text) as unknown) : {};
        if (!response.ok) {
          throw new Error(`CDN upstream ${response.status}`);
        }
        return payload;
      } catch (error) {
        lastError = error;
        if (attempt >= this.config.retryCount) {
          break;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("CDN request failed.");
  }

  protected abstract prepareSignedConnectionCheck(): void;
  protected abstract realSecretMissingFields(): string[];
  protected abstract secretValues(): readonly string[];
  abstract refreshUrls(input: CdnRefreshInput): Promise<CdnOperationResult>;
  abstract refreshDirectories(input: CdnRefreshInput): Promise<CdnOperationResult>;
  abstract prefetchUrls(input: CdnPrefetchInput): Promise<CdnOperationResult>;
}

export class AliyunCdnProvider extends BaseCdnProvider<AliyunCdnRuntimeConfig> {
  override readonly providerCode = "aliyun_cdn" as const;

  protected override missingFields(): string[] {
    return [...super.missingFields()];
  }

  protected override realSecretMissingFields(): string[] {
    const missingFields: string[] = [];
    if (!this.config.accessKeyId) {
      missingFields.push("AccessKey ID");
    }
    if (!this.config.accessKeySecret) {
      missingFields.push("AccessKey Secret");
    }
    return missingFields;
  }

  protected override secretValues(): readonly string[] {
    return [this.config.accessKeyId, this.config.accessKeySecret];
  }

  protected override prepareSignedConnectionCheck(): void {
    if (this.config.realCallEnabled) {
      this.assertRealSecretReady();
      this.buildSignedUrl("DescribeCdnService", {});
    }
  }

  override async refreshUrls(input: CdnRefreshInput): Promise<CdnOperationResult> {
    const urls = this.prepareUrls(input.urls);
    if (urls.length === 0) {
      throw new CdnProviderError("cdn_refresh_empty", "请填写需要刷新的 CDN URL。");
    }
    if (!this.shouldCallRealProvider()) {
      return this.configCheckResult(urls.length);
    }
    this.assertRealSecretReady();
    return this.callRefresh(urls, "File");
  }

  override async refreshDirectories(input: CdnRefreshInput): Promise<CdnOperationResult> {
    const directories = this.prepareDirectoryUrls(input.directories);
    if (directories.length === 0) {
      throw new CdnProviderError("cdn_refresh_empty", "请填写需要刷新的 CDN 目录。");
    }
    if (!this.shouldCallRealProvider()) {
      return this.configCheckResult(directories.length);
    }
    this.assertRealSecretReady();
    return this.callRefresh(directories, "Directory");
  }

  override async prefetchUrls(input: CdnPrefetchInput): Promise<CdnOperationResult> {
    const urls = this.prepareUrls(input.urls);
    if (urls.length === 0) {
      throw new CdnProviderError("cdn_prefetch_empty", "请填写需要预热的 CDN URL。");
    }
    if (!this.shouldCallRealProvider()) {
      return this.configCheckResult(urls.length);
    }
    this.assertRealSecretReady();
    return this.callAliyunAction("PushObjectCache", { ObjectPath: urls.join("\n") }, urls.length);
  }

  private async callRefresh(
    objectPaths: readonly string[],
    objectType: "File" | "Directory",
  ): Promise<CdnOperationResult> {
    return this.callAliyunAction(
      "RefreshObjectCaches",
      {
        ObjectPath: objectPaths.join("\n"),
        ObjectType: objectType,
      },
      objectPaths.length,
    );
  }

  private async callAliyunAction(
    action: string,
    params: Record<string, string>,
    acceptedCount: number,
  ): Promise<CdnOperationResult> {
    const startedAt = Date.now();
    try {
      const payload = await this.fetchJson(this.buildSignedUrl(action, params), { method: "GET" });
      const response = isRecord(payload) ? payload : {};
      const providerTaskId =
        stringProperty(response, "RefreshTaskId") ??
        stringProperty(response, "PushTaskId") ??
        stringProperty(response, "RequestId");
      return {
        success: true,
        providerCode: this.providerCode,
        providerNameZh: cdnProviderNameZh(this.providerCode),
        mode: "real",
        acceptedCount,
        rejectedCount: 0,
        providerTaskId,
        messageZh: `阿里云 CDN 已受理 ${acceptedCount} 条操作，耗时 ${Date.now() - startedAt}ms。`,
      };
    } catch (error) {
      return this.failureResult(error, acceptedCount);
    }
  }

  private buildSignedUrl(action: string, params: Record<string, string>): string {
    const query: Record<string, string> = {
      Action: action,
      Version: "2018-05-10",
      Format: "JSON",
      SignatureMethod: "HMAC-SHA1",
      SignatureVersion: "1.0",
      SignatureNonce: randomUUID(),
      Timestamp: new Date().toISOString(),
      AccessKeyId: this.config.accessKeyId,
      ...params,
    };
    const canonical = Object.keys(query)
      .sort()
      .map((key) => `${aliyunEncode(key)}=${aliyunEncode(query[key] ?? "")}`)
      .join("&");
    const stringToSign = `GET&%2F&${aliyunEncode(canonical)}`;
    const signature = createHmac("sha1", `${this.config.accessKeySecret}&`)
      .update(stringToSign, "utf8")
      .digest("base64");
    const url = new URL(this.config.endpoint);
    url.search = `${canonical}&Signature=${aliyunEncode(signature)}`;
    return url.toString();
  }
}

export class TencentCdnProvider extends BaseCdnProvider<TencentCdnRuntimeConfig> {
  override readonly providerCode = "tencent_cdn" as const;

  protected override realSecretMissingFields(): string[] {
    const missingFields: string[] = [];
    if (!this.config.secretId) {
      missingFields.push("Secret ID");
    }
    if (!this.config.secretKey) {
      missingFields.push("Secret Key");
    }
    return missingFields;
  }

  protected override secretValues(): readonly string[] {
    return [this.config.secretId, this.config.secretKey];
  }

  protected override prepareSignedConnectionCheck(): void {
    if (this.config.realCallEnabled) {
      this.assertRealSecretReady();
      this.buildSignedRequest("DescribeDomains", "{}");
    }
  }

  override async refreshUrls(input: CdnRefreshInput): Promise<CdnOperationResult> {
    const urls = this.prepareUrls(input.urls);
    if (urls.length === 0) {
      throw new CdnProviderError("cdn_refresh_empty", "请填写需要刷新的 CDN URL。");
    }
    if (!this.shouldCallRealProvider()) {
      return this.configCheckResult(urls.length);
    }
    this.assertRealSecretReady();
    return this.callTencentAction("PurgeUrlsCache", { Urls: urls }, urls.length);
  }

  override async refreshDirectories(input: CdnRefreshInput): Promise<CdnOperationResult> {
    const paths = this.prepareDirectoryUrls(input.directories);
    if (paths.length === 0) {
      throw new CdnProviderError("cdn_refresh_empty", "请填写需要刷新的 CDN 路径。");
    }
    if (!this.shouldCallRealProvider()) {
      return this.configCheckResult(paths.length);
    }
    this.assertRealSecretReady();
    return this.callTencentAction("PurgePathCache", { Paths: paths, FlushType: "flush" }, paths.length);
  }

  override async prefetchUrls(input: CdnPrefetchInput): Promise<CdnOperationResult> {
    const urls = this.prepareUrls(input.urls);
    if (urls.length === 0) {
      throw new CdnProviderError("cdn_prefetch_empty", "请填写需要预热的 CDN URL。");
    }
    if (!this.shouldCallRealProvider()) {
      return this.configCheckResult(urls.length);
    }
    this.assertRealSecretReady();
    return this.callTencentAction("PushUrlsCache", { Urls: urls }, urls.length);
  }

  private async callTencentAction(
    action: string,
    payload: Record<string, unknown>,
    acceptedCount: number,
  ): Promise<CdnOperationResult> {
    const startedAt = Date.now();
    const body = JSON.stringify(payload);
    const signed = this.buildSignedRequest(action, body);
    try {
      const responsePayload = await this.fetchJson(this.config.endpoint, {
        method: "POST",
        headers: signed.headers,
        body,
      });
      const response = isRecord(responsePayload) ? responsePayload.Response : undefined;
      if (isRecord(response) && isRecord(response.Error)) {
        throw new Error(stringProperty(response.Error, "Message") ?? "Tencent CDN provider error");
      }
      const providerTaskId = isRecord(response)
        ? stringProperty(response, "TaskId") ?? stringProperty(response, "RequestId")
        : undefined;
      return {
        success: true,
        providerCode: this.providerCode,
        providerNameZh: cdnProviderNameZh(this.providerCode),
        mode: "real",
        acceptedCount,
        rejectedCount: 0,
        providerTaskId,
        messageZh: `腾讯云 CDN 已受理 ${acceptedCount} 条操作，耗时 ${Date.now() - startedAt}ms。`,
      };
    } catch (error) {
      return this.failureResult(error, acceptedCount);
    }
  }

  private buildSignedRequest(
    action: string,
    body: string,
  ): { readonly headers: Record<string, string> } {
    const endpoint = new URL(this.config.endpoint);
    const host = endpoint.host;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const date = new Date(Number(timestamp) * 1000).toISOString().slice(0, 10);
    const contentType = "application/json; charset=utf-8";
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
    const signedHeaders = "content-type;host";
    const canonicalRequest = [
      "POST",
      "/",
      "",
      canonicalHeaders,
      signedHeaders,
      sha256Hex(body),
    ].join("\n");
    const credentialScope = `${date}/cdn/tc3_request`;
    const stringToSign = [
      "TC3-HMAC-SHA256",
      timestamp,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");
    const secretDate = hmacBuffer(`TC3${this.config.secretKey}`, date);
    const secretService = hmacBuffer(secretDate, "cdn");
    const secretSigning = hmacBuffer(secretService, "tc3_request");
    const signature = hmacHex(secretSigning, stringToSign);
    const authorization =
      `TC3-HMAC-SHA256 Credential=${this.config.secretId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const headers: Record<string, string> = {
      Authorization: authorization,
      "Content-Type": contentType,
      Host: host,
      "X-TC-Action": action,
      "X-TC-Version": "2018-06-06",
      "X-TC-Timestamp": timestamp,
    };
    if (this.config.region) {
      headers["X-TC-Region"] = this.config.region;
    }
    return { headers };
  }
}

function aliyunEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function stringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function createCdnProvider(
  config: RuntimeCdnConfig,
  options: CdnProviderFactoryOptions = {},
): CdnProvider {
  if (config.providerCode === "aliyun_cdn") {
    return new AliyunCdnProvider(config, options);
  }
  return new TencentCdnProvider(config, options);
}
