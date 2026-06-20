import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getRuntimeProviderConfig, getSystemSetting } from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderConfigRecord } from "@photo-weather/db";

export const storageProviderCodes = ["local_storage", "aliyun_oss", "tencent_cos"] as const;

export type StorageProviderCode = (typeof storageProviderCodes)[number];

export type ObjectStorageProviderType = "storage";

export type ObjectStorageMetadata = {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly etag?: string;
  readonly providerType: ObjectStorageProviderType;
  readonly providerCode: StorageProviderCode;
  readonly publicUrl?: string | null;
};

export type ObjectStorageObject = ObjectStorageMetadata & {
  readonly body: Uint8Array;
};

export type PutObjectInput = {
  readonly key: string;
  readonly body: Uint8Array | string;
  readonly contentType?: string;
};

export type ObjectKeyInput = {
  readonly key: string;
};

export type ObjectStorageTestMode = "mock" | "config_check" | "real";

export type ObjectStorageTestConnectionResult = {
  readonly success: boolean;
  readonly providerType: ObjectStorageProviderType;
  readonly providerCode: StorageProviderCode;
  readonly providerNameZh: string;
  readonly mode: ObjectStorageTestMode;
  readonly attempted: boolean;
  readonly messageZh: string;
  readonly requiredMissingFields?: readonly string[];
  readonly latencyMs?: number;
};

export type ObjectStorageProvider = {
  readonly providerType: ObjectStorageProviderType;
  readonly providerCode: StorageProviderCode;
  readonly maxUploadBytes: number;
  putObject(input: PutObjectInput): Promise<ObjectStorageMetadata>;
  getObject(input: ObjectKeyInput): Promise<ObjectStorageObject>;
  deleteObject(input: ObjectKeyInput): Promise<void>;
  headObject(input: ObjectKeyInput): Promise<ObjectStorageMetadata>;
  createReadUrl(input: ObjectKeyInput): Promise<string | null>;
  testConnection(options?: { readonly realCheck?: boolean }): Promise<ObjectStorageTestConnectionResult>;
};

type StorageRuntimeOptions = {
  readonly dbClient?: DatabaseClient;
  readonly env?: NodeJS.ProcessEnv;
  readonly providerCode?: StorageProviderCode;
};

type BaseRuntimeStorageConfig = {
  readonly providerType: ObjectStorageProviderType;
  readonly providerCode: StorageProviderCode;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly basePrefix: string;
  readonly publicBaseUrl: string;
  readonly maxUploadBytes: number;
};

export type LocalStorageRuntimeConfig = BaseRuntimeStorageConfig & {
  readonly providerCode: "local_storage";
  readonly rootPath: string;
};

export type AliyunOssRuntimeConfig = BaseRuntimeStorageConfig & {
  readonly providerCode: "aliyun_oss";
  readonly realCallEnabled: boolean;
  readonly region: string;
  readonly endpoint: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
  readonly timeoutMs: number;
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
};

export type TencentCosRuntimeConfig = BaseRuntimeStorageConfig & {
  readonly providerCode: "tencent_cos";
  readonly realCallEnabled: boolean;
  readonly region: string;
  readonly bucket: string;
  readonly timeoutMs: number;
  readonly secretId: string;
  readonly secretKey: string;
};

export type RuntimeStorageConfig =
  | LocalStorageRuntimeConfig
  | AliyunOssRuntimeConfig
  | TencentCosRuntimeConfig;

type JsonRecord = {
  readonly [key: string]: JsonValue;
};

type AliyunOssConstructor = new (options: {
  readonly region?: string;
  readonly endpoint?: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly accessKeySecret: string;
  readonly timeout?: number;
  readonly secure?: boolean;
  readonly internal?: boolean;
  readonly cname?: boolean;
}) => AliyunOssClient;

type AliyunOssClient = {
  readonly put: (
    key: string,
    body: Uint8Array,
    options?: { readonly headers?: Record<string, string> },
  ) => Promise<unknown>;
  readonly get: (key: string) => Promise<unknown>;
  readonly head: (key: string) => Promise<unknown>;
  readonly delete: (key: string) => Promise<unknown>;
  readonly signatureUrl?: (key: string, options?: Record<string, unknown>) => string;
};

type TencentCosConstructor = new (options: {
  readonly SecretId: string;
  readonly SecretKey: string;
  readonly Timeout?: number;
}) => TencentCosClient;

type TencentCosRequest<TData> = (
  params: Record<string, unknown>,
  callback: (error: unknown, data: TData | undefined) => void,
) => void;

type TencentCosClient = {
  readonly putObject: TencentCosRequest<unknown>;
  readonly getObject: TencentCosRequest<unknown>;
  readonly headObject: TencentCosRequest<unknown>;
  readonly deleteObject: TencentCosRequest<unknown>;
  readonly getObjectUrl?: TencentCosRequest<unknown>;
};

const defaultBasePrefix = "uploads";
const defaultRootPath = "data/uploads";
const defaultMaxUploadBytes = 10 * 1024 * 1024;
const defaultStorageTimeoutMs = 10000;
const minStorageTimeoutMs = 1000;
const maxStorageTimeoutMs = 120000;
const maxConfigurableUploadBytes = 100 * 1024 * 1024;
const storageHealthCheckKey = "health-check/storage-test.txt";

const allowedContentTypes = new Set([
  "application/json",
  "application/octet-stream",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
]);

export function isStorageProviderCode(value: string): value is StorageProviderCode {
  return storageProviderCodes.includes(value as StorageProviderCode);
}

export function storageProviderNameZh(providerCode: StorageProviderCode): string {
  if (providerCode === "local_storage") {
    return "本地存储";
  }
  if (providerCode === "aliyun_oss") {
    return "阿里云 OSS";
  }
  return "腾讯云 COS";
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

function normalizePublicBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeBasePrefix(value: string): string {
  if (!value.trim()) {
    return "";
  }

  return normalizeSafeKey(value, { allowEmpty: true });
}

function normalizeSafeKey(
  input: string,
  options: { readonly allowEmpty?: boolean } = {},
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    if (options.allowEmpty) {
      return "";
    }
    throw new Error("对象 Key 不能为空。");
  }
  if (trimmed.startsWith("/")) {
    throw new Error("对象 Key 不能以斜杠开头。");
  }
  if (trimmed.includes("\\")) {
    throw new Error("对象 Key 不能包含反斜杠。");
  }

  const segments = trimmed.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error("对象 Key 不能包含空路径段。");
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("对象 Key 不能包含相对路径段。");
  }
  if (segments.some((segment) => segment.includes(".."))) {
    throw new Error("对象 Key 不能包含 '..'。");
  }

  return segments.join("/");
}

export function normalizeObjectKey(key: string, basePrefix: string): string {
  const normalizedKey = normalizeSafeKey(key);
  const normalizedPrefix = normalizeBasePrefix(basePrefix);
  if (!normalizedPrefix) {
    return normalizedKey;
  }
  if (normalizedKey === normalizedPrefix || normalizedKey.startsWith(`${normalizedPrefix}/`)) {
    return normalizedKey;
  }

  return `${normalizedPrefix}/${normalizedKey}`;
}

export function normalizeContentType(contentType: string | undefined): string {
  const normalized = (contentType ?? "application/octet-stream").trim().toLowerCase();
  if (!allowedContentTypes.has(normalized)) {
    throw new Error("不支持的文件 Content-Type。");
  }

  return normalized;
}

function bodyToBytes(body: Uint8Array | string): Uint8Array {
  return typeof body === "string" ? new TextEncoder().encode(body) : body;
}

function enforceMaxUploadBytes(sizeBytes: number, maxUploadBytes: number): void {
  if (sizeBytes > maxUploadBytes) {
    throw new Error(`上传内容不能超过 ${maxUploadBytes} 字节。`);
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function createPublicUrl(publicBaseUrl: string, key: string): string | null {
  const baseUrl = normalizePublicBaseUrl(publicBaseUrl);
  if (!baseUrl) {
    return null;
  }

  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/${encodedKey}`;
}

function readHeader(headers: Record<string, unknown>, key: string): string | undefined {
  const direct = headers[key];
  if (typeof direct === "string") {
    return direct;
  }

  const lowerKey = key.toLowerCase();
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === lowerKey);
  return typeof found?.[1] === "string" ? found[1] : undefined;
}

function contentLengthFromHeaders(headers: Record<string, unknown>): number | undefined {
  const value = readHeader(headers, "content-length");
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function etagFromHeaders(headers: Record<string, unknown>): string | undefined {
  return readHeader(headers, "etag")?.replace(/^"|"$/g, "");
}

function contentTypeFromHeaders(headers: Record<string, unknown>): string | undefined {
  const value = readHeader(headers, "content-type");
  return value ? normalizeContentType(value.split(";")[0]) : undefined;
}

function headersFromSdkResult(result: unknown): Record<string, unknown> {
  if (!isRecord(result)) {
    return {};
  }

  const directHeaders = result.headers;
  if (isRecord(directHeaders)) {
    return directHeaders;
  }

  const response = result.res;
  if (isRecord(response) && isRecord(response.headers)) {
    return response.headers;
  }

  return {};
}

function objectBodyFromSdkResult(result: unknown, key: string): Uint8Array {
  if (!isRecord(result)) {
    throw new Error(`对象读取失败：${key}`);
  }

  const content = result.content ?? result.Body;
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === "string") {
    return new TextEncoder().encode(content);
  }

  throw new Error(`对象读取失败：${key}`);
}

function sdkStringProperty(result: unknown, key: string): string | undefined {
  if (!isRecord(result)) {
    return undefined;
  }

  const value = result[key];
  return typeof value === "string" ? value : undefined;
}

function ensureConstructor<TConstructor>(
  module: unknown,
  packageName: string,
): TConstructor {
  const candidate = isRecord(module) ? (module.default ?? module) : module;
  if (typeof candidate !== "function") {
    throw new Error(`${packageName} SDK 未正确安装。`);
  }

  return candidate as TConstructor;
}

async function dynamicImportPackage(packageName: string): Promise<unknown> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<unknown>;
  return dynamicImport(packageName);
}

function storageTestResponse(input: {
  readonly config: RuntimeStorageConfig;
  readonly success: boolean;
  readonly mode: ObjectStorageTestMode;
  readonly attempted: boolean;
  readonly messageZh: string;
  readonly requiredMissingFields?: readonly string[];
  readonly latencyMs?: number;
}): ObjectStorageTestConnectionResult {
  return {
    success: input.success,
    providerType: "storage",
    providerCode: input.config.providerCode,
    providerNameZh: storageProviderNameZh(input.config.providerCode),
    mode: input.mode,
    attempted: input.attempted,
    messageZh: input.messageZh,
    requiredMissingFields: input.requiredMissingFields,
    latencyMs: input.latencyMs,
  };
}

function localMissingFields(config: LocalStorageRuntimeConfig): readonly string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.rootPath) {
    missingFields.push("本地保存路径");
  }
  if (!config.basePrefix) {
    missingFields.push("存储前缀");
  }
  if (!config.maxUploadBytes) {
    missingFields.push("最大上传字节数");
  }
  return missingFields;
}

function aliyunMissingFields(config: AliyunOssRuntimeConfig): readonly string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.bucket) {
    missingFields.push("Bucket");
  }
  if (!config.region && !config.endpoint) {
    missingFields.push("Region 或 Endpoint");
  }
  if (!config.accessKeyId) {
    missingFields.push("AccessKey ID");
  }
  if (!config.accessKeySecret) {
    missingFields.push("AccessKey Secret");
  }
  return missingFields;
}

function tencentMissingFields(config: TencentCosRuntimeConfig): readonly string[] {
  const missingFields: string[] = [];
  if (!config.enabled) {
    missingFields.push("启用该服务商");
  }
  if (!config.region) {
    missingFields.push("Region");
  }
  if (!config.bucket) {
    missingFields.push("Bucket");
  }
  if (!config.secretId) {
    missingFields.push("Secret ID");
  }
  if (!config.secretKey) {
    missingFields.push("Secret Key");
  }
  return missingFields;
}

function missingConfigMessage(
  providerCode: StorageProviderCode,
  missingFields: readonly string[],
): string {
  return `${storageProviderNameZh(providerCode)} 真实调用已开启，请补充：${missingFields.join(
    "、",
  )}。本次未请求对象存储服务。`;
}

function resolveBaseConfig(
  record: ProviderConfigRecord | null,
  providerCode: StorageProviderCode,
): BaseRuntimeStorageConfig {
  return {
    providerType: "storage",
    providerCode,
    displayName: record?.displayName ?? storageProviderNameZh(providerCode),
    enabled: record?.enabled ?? providerCode === "local_storage",
    priority: record?.priority ?? 100,
    basePrefix: normalizeBasePrefix(readString(record?.configJson, "basePrefix", defaultBasePrefix)),
    publicBaseUrl: normalizePublicBaseUrl(readString(record?.configJson, "publicBaseUrl")),
    maxUploadBytes: clampInteger(
      readNumber(record?.configJson, "maxUploadBytes"),
      defaultMaxUploadBytes,
      1,
      maxConfigurableUploadBytes,
    ),
  };
}

function resolveLocalStorageConfig(record: ProviderConfigRecord | null): LocalStorageRuntimeConfig {
  const base = resolveBaseConfig(record, "local_storage");
  const rootPath =
    readString(record?.configJson, "rootPath") ||
    readString(record?.configJson, "basePath") ||
    defaultRootPath;

  return {
    ...base,
    providerCode: "local_storage",
    rootPath,
  };
}

function resolveAliyunOssConfig(record: ProviderConfigRecord | null): AliyunOssRuntimeConfig {
  const base = resolveBaseConfig(record, "aliyun_oss");

  return {
    ...base,
    providerCode: "aliyun_oss",
    realCallEnabled: readBoolean(record?.configJson, "realCallEnabled"),
    region: readString(record?.configJson, "region"),
    endpoint: readString(record?.configJson, "endpoint"),
    bucket: readString(record?.configJson, "bucket"),
    forcePathStyle: readBoolean(record?.configJson, "forcePathStyle"),
    timeoutMs: clampInteger(
      readNumber(record?.configJson, "timeoutMs"),
      defaultStorageTimeoutMs,
      minStorageTimeoutMs,
      maxStorageTimeoutMs,
    ),
    accessKeyId: readString(record?.secretJson, "accessKeyId"),
    accessKeySecret: readString(record?.secretJson, "accessKeySecret"),
  };
}

function resolveTencentCosConfig(record: ProviderConfigRecord | null): TencentCosRuntimeConfig {
  const base = resolveBaseConfig(record, "tencent_cos");

  return {
    ...base,
    providerCode: "tencent_cos",
    realCallEnabled: readBoolean(record?.configJson, "realCallEnabled"),
    region: readString(record?.configJson, "region"),
    bucket: readString(record?.configJson, "bucket"),
    timeoutMs: clampInteger(
      readNumber(record?.configJson, "timeoutMs"),
      defaultStorageTimeoutMs,
      minStorageTimeoutMs,
      maxStorageTimeoutMs,
    ),
    secretId: readString(record?.secretJson, "secretId"),
    secretKey: readString(record?.secretJson, "secretKey"),
  };
}

async function readDefaultStorageProviderCode(
  options: Pick<StorageRuntimeOptions, "dbClient">,
): Promise<StorageProviderCode> {
  const setting = await getSystemSetting("storage.provider", { client: options.dbClient });
  return typeof setting?.valueJson === "string" && isStorageProviderCode(setting.valueJson)
    ? setting.valueJson
    : "local_storage";
}

export async function readRuntimeStorageConfig(
  options: StorageRuntimeOptions = {},
): Promise<RuntimeStorageConfig> {
  const providerCode = options.providerCode ?? (await readDefaultStorageProviderCode(options));
  const record = await getRuntimeProviderConfig("storage", providerCode, {
    client: options.dbClient,
  });

  if (providerCode === "local_storage") {
    return resolveLocalStorageConfig(record);
  }
  if (providerCode === "aliyun_oss") {
    return resolveAliyunOssConfig(record);
  }
  return resolveTencentCosConfig(record);
}

class LocalObjectStorageProvider implements ObjectStorageProvider {
  readonly providerType = "storage" as const;
  readonly providerCode = "local_storage" as const;
  readonly maxUploadBytes: number;
  private readonly rootPath: string;

  constructor(private readonly config: LocalStorageRuntimeConfig) {
    this.maxUploadBytes = config.maxUploadBytes;
    this.rootPath = path.resolve(config.rootPath);
  }

  async putObject(input: PutObjectInput): Promise<ObjectStorageMetadata> {
    this.assertEnabled();
    const key = this.normalizeKey(input.key);
    const contentType = normalizeContentType(input.contentType);
    const body = bodyToBytes(input.body);
    enforceMaxUploadBytes(body.byteLength, this.maxUploadBytes);

    const objectPath = this.objectPath(key);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, body);
    await writeFile(
      this.metadataPath(objectPath),
      JSON.stringify({ contentType, sizeBytes: body.byteLength, etag: sha256Hex(body) }),
      "utf8",
    );

    return this.metadataFromValues(key, contentType, body.byteLength, sha256Hex(body));
  }

  async getObject(input: ObjectKeyInput): Promise<ObjectStorageObject> {
    const metadata = await this.headObject(input);
    let body: Uint8Array;
    try {
      body = await readFile(this.objectPath(metadata.key));
    } catch {
      throw new Error("对象读取失败。");
    }

    return {
      ...metadata,
      body,
    };
  }

  async deleteObject(input: ObjectKeyInput): Promise<void> {
    this.assertEnabled();
    const key = this.normalizeKey(input.key);
    const objectPath = this.objectPath(key);
    await rm(objectPath, { force: true });
    await rm(this.metadataPath(objectPath), { force: true });
  }

  async headObject(input: ObjectKeyInput): Promise<ObjectStorageMetadata> {
    this.assertEnabled();
    const key = this.normalizeKey(input.key);
    const objectPath = this.objectPath(key);
    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(objectPath);
    } catch {
      throw new Error("对象不存在。");
    }
    const metadata = await this.readSidecarMetadata(objectPath);

    return this.metadataFromValues(
      key,
      metadata.contentType ?? "application/octet-stream",
      metadata.sizeBytes ?? fileStat.size,
      metadata.etag,
    );
  }

  async createReadUrl(input: ObjectKeyInput): Promise<string | null> {
    const key = this.normalizeKey(input.key);
    return createPublicUrl(this.config.publicBaseUrl, key);
  }

  async testConnection(): Promise<ObjectStorageTestConnectionResult> {
    const missingFields = localMissingFields(this.config);
    if (missingFields.length > 0) {
      return storageTestResponse({
        config: this.config,
        success: false,
        mode: "config_check",
        attempted: false,
        requiredMissingFields: missingFields,
        messageZh: `本地存储配置不完整，请补充：${missingFields.join("、")}。`,
      });
    }

    return storageTestResponse({
      config: this.config,
      success: true,
      mode: "config_check",
      attempted: false,
      messageZh: "本地存储配置检查通过，未写入测试文件。",
    });
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new Error("本地存储服务商未启用。");
    }
  }

  private normalizeKey(key: string): string {
    return normalizeObjectKey(key, this.config.basePrefix);
  }

  private objectPath(key: string): string {
    const resolvedPath = path.resolve(this.rootPath, key);
    const relativePath = path.relative(this.rootPath, resolvedPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      throw new Error("对象 Key 超出本地存储根目录。");
    }

    return resolvedPath;
  }

  private metadataPath(objectPath: string): string {
    return `${objectPath}.meta.json`;
  }

  private async readSidecarMetadata(objectPath: string): Promise<{
    readonly contentType?: string;
    readonly sizeBytes?: number;
    readonly etag?: string;
  }> {
    try {
      const raw = await readFile(this.metadataPath(objectPath), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!isRecord(parsed)) {
        return {};
      }

      const contentType =
        typeof parsed.contentType === "string" ? normalizeContentType(parsed.contentType) : undefined;
      const sizeBytes =
        typeof parsed.sizeBytes === "number" && Number.isFinite(parsed.sizeBytes)
          ? parsed.sizeBytes
          : undefined;
      const etag = typeof parsed.etag === "string" ? parsed.etag : undefined;

      return { contentType, sizeBytes, etag };
    } catch {
      return {};
    }
  }

  private metadataFromValues(
    key: string,
    contentType: string,
    sizeBytes: number,
    etag?: string,
  ): ObjectStorageMetadata {
    return {
      key,
      contentType,
      sizeBytes,
      etag,
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: createPublicUrl(this.config.publicBaseUrl, key),
    };
  }
}

class AliyunOssObjectStorageProvider implements ObjectStorageProvider {
  readonly providerType = "storage" as const;
  readonly providerCode = "aliyun_oss" as const;
  readonly maxUploadBytes: number;

  constructor(
    private readonly config: AliyunOssRuntimeConfig,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.maxUploadBytes = config.maxUploadBytes;
  }

  async putObject(input: PutObjectInput): Promise<ObjectStorageMetadata> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    const contentType = normalizeContentType(input.contentType);
    const body = bodyToBytes(input.body);
    enforceMaxUploadBytes(body.byteLength, this.maxUploadBytes);

    const client = await this.createClient();
    const result = await client.put(key, body, {
      headers: {
        "Content-Type": contentType,
      },
    });
    const headers = headersFromSdkResult(result);

    return {
      key,
      contentType,
      sizeBytes: body.byteLength,
      etag: etagFromHeaders(headers) ?? sdkStringProperty(result, "etag"),
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: await this.createReadUrl({ key }),
    };
  }

  async getObject(input: ObjectKeyInput): Promise<ObjectStorageObject> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    const result = await (await this.createClient()).get(key);
    const body = objectBodyFromSdkResult(result, key);
    const headers = headersFromSdkResult(result);

    return {
      key,
      body,
      contentType: contentTypeFromHeaders(headers) ?? "application/octet-stream",
      sizeBytes: body.byteLength,
      etag: etagFromHeaders(headers) ?? sdkStringProperty(result, "etag"),
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: await this.createReadUrl({ key }),
    };
  }

  async deleteObject(input: ObjectKeyInput): Promise<void> {
    this.assertRealOperationReady();
    await (await this.createClient()).delete(this.normalizeKey(input.key));
  }

  async headObject(input: ObjectKeyInput): Promise<ObjectStorageMetadata> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    const result = await (await this.createClient()).head(key);
    const headers = headersFromSdkResult(result);

    return {
      key,
      contentType: contentTypeFromHeaders(headers) ?? "application/octet-stream",
      sizeBytes: contentLengthFromHeaders(headers) ?? 0,
      etag: etagFromHeaders(headers) ?? sdkStringProperty(result, "etag"),
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: await this.createReadUrl({ key }),
    };
  }

  async createReadUrl(input: ObjectKeyInput): Promise<string | null> {
    const key = this.normalizeKey(input.key);
    const publicUrl = createPublicUrl(this.config.publicBaseUrl, key);
    if (publicUrl) {
      return publicUrl;
    }
    if (!this.isRealOperationAllowed()) {
      return null;
    }

    const client = await this.createClient();
    return client.signatureUrl?.(key, { expires: 600, method: "GET" }) ?? null;
  }

  async testConnection(
    options: { readonly realCheck?: boolean } = {},
  ): Promise<ObjectStorageTestConnectionResult> {
    if (!this.config.realCallEnabled) {
      return storageTestResponse({
        config: this.config,
        success: true,
        mode: "config_check",
        attempted: false,
        messageZh: "当前为配置检查模式，未请求阿里云 OSS 服务。",
      });
    }

    const missingFields = aliyunMissingFields(this.config);
    if (missingFields.length > 0) {
      return storageTestResponse({
        config: this.config,
        success: false,
        mode: "config_check",
        attempted: false,
        requiredMissingFields: missingFields,
        messageZh: missingConfigMessage(this.providerCode, missingFields),
      });
    }

    if (this.env.NODE_ENV === "test" || !options.realCheck) {
      return storageTestResponse({
        config: this.config,
        success: true,
        mode: "config_check",
        attempted: false,
        messageZh: "阿里云 OSS 配置完整，本次未请求真实对象存储服务。",
      });
    }

    return this.realHealthCheck();
  }

  private async realHealthCheck(): Promise<ObjectStorageTestConnectionResult> {
    const startedAt = Date.now();
    const key = this.normalizeKey(storageHealthCheckKey);
    try {
      await this.putObject({
        key,
        body: "storage health check",
        contentType: "text/plain",
      });
      await this.headObject({ key });
      await this.getObject({ key });
      await this.deleteObject({ key });

      return storageTestResponse({
        config: this.config,
        success: true,
        mode: "real",
        attempted: true,
        latencyMs: Date.now() - startedAt,
        messageZh: `阿里云 OSS 连接测试通过，耗时 ${Date.now() - startedAt}ms。`,
      });
    } catch (error) {
      await this.deleteObject({ key }).catch(() => undefined);
      return storageTestResponse({
        config: this.config,
        success: false,
        mode: "real",
        attempted: true,
        latencyMs: Date.now() - startedAt,
        messageZh: `阿里云 OSS 连接测试失败：${safeStorageErrorMessage(error)}。`,
      });
    }
  }

  private normalizeKey(key: string): string {
    return normalizeObjectKey(key, this.config.basePrefix);
  }

  private isRealOperationAllowed(): boolean {
    return (
      this.config.realCallEnabled &&
      this.env.NODE_ENV !== "test" &&
      aliyunMissingFields(this.config).length === 0
    );
  }

  private assertRealOperationReady(): void {
    if (!this.config.realCallEnabled) {
      throw new Error("阿里云 OSS 未启用真实调用。");
    }
    const missingFields = aliyunMissingFields(this.config);
    if (missingFields.length > 0) {
      throw new Error(missingConfigMessage(this.providerCode, missingFields));
    }
    if (this.env.NODE_ENV === "test") {
      throw new Error("自动测试环境不会请求阿里云 OSS。");
    }
  }

  private async createClient(): Promise<AliyunOssClient> {
    const module = await dynamicImportPackage("ali-oss");
    const AliyunOss = ensureConstructor<AliyunOssConstructor>(module, "ali-oss");
    return new AliyunOss({
      region: this.config.region || undefined,
      endpoint: this.config.endpoint || undefined,
      bucket: this.config.bucket,
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      timeout: this.config.timeoutMs,
      secure: true,
      cname: this.config.forcePathStyle ? false : undefined,
    });
  }
}

class TencentCosObjectStorageProvider implements ObjectStorageProvider {
  readonly providerType = "storage" as const;
  readonly providerCode = "tencent_cos" as const;
  readonly maxUploadBytes: number;

  constructor(
    private readonly config: TencentCosRuntimeConfig,
    private readonly env: NodeJS.ProcessEnv,
  ) {
    this.maxUploadBytes = config.maxUploadBytes;
  }

  async putObject(input: PutObjectInput): Promise<ObjectStorageMetadata> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    const contentType = normalizeContentType(input.contentType);
    const body = bodyToBytes(input.body);
    enforceMaxUploadBytes(body.byteLength, this.maxUploadBytes);

    const result = await this.cosRequest((client, callback) =>
      client.putObject(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
        callback,
      ),
    );
    const headers = headersFromSdkResult(result);

    return {
      key,
      contentType,
      sizeBytes: body.byteLength,
      etag: sdkStringProperty(result, "ETag") ?? etagFromHeaders(headers),
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: await this.createReadUrl({ key }),
    };
  }

  async getObject(input: ObjectKeyInput): Promise<ObjectStorageObject> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    const result = await this.cosRequest((client, callback) =>
      client.getObject(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
        },
        callback,
      ),
    );
    const body = objectBodyFromSdkResult(result, key);
    const headers = headersFromSdkResult(result);

    return {
      key,
      body,
      contentType: contentTypeFromHeaders(headers) ?? "application/octet-stream",
      sizeBytes: body.byteLength,
      etag: sdkStringProperty(result, "ETag") ?? etagFromHeaders(headers),
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: await this.createReadUrl({ key }),
    };
  }

  async deleteObject(input: ObjectKeyInput): Promise<void> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    await this.cosRequest((client, callback) =>
      client.deleteObject(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
        },
        callback,
      ),
    );
  }

  async headObject(input: ObjectKeyInput): Promise<ObjectStorageMetadata> {
    this.assertRealOperationReady();
    const key = this.normalizeKey(input.key);
    const result = await this.cosRequest((client, callback) =>
      client.headObject(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
        },
        callback,
      ),
    );
    const headers = headersFromSdkResult(result);

    return {
      key,
      contentType: contentTypeFromHeaders(headers) ?? "application/octet-stream",
      sizeBytes: contentLengthFromHeaders(headers) ?? 0,
      etag: sdkStringProperty(result, "ETag") ?? etagFromHeaders(headers),
      providerType: this.providerType,
      providerCode: this.providerCode,
      publicUrl: await this.createReadUrl({ key }),
    };
  }

  async createReadUrl(input: ObjectKeyInput): Promise<string | null> {
    const key = this.normalizeKey(input.key);
    const publicUrl = createPublicUrl(this.config.publicBaseUrl, key);
    if (publicUrl) {
      return publicUrl;
    }
    if (!this.isRealOperationAllowed()) {
      return null;
    }

    if (!(await this.createClient()).getObjectUrl) {
      return null;
    }

    const result = await this.cosRequest((client, callback) => {
      if (!client.getObjectUrl) {
        callback(new Error("COS getObjectUrl is unavailable."), undefined);
        return;
      }
      client.getObjectUrl(
        {
          Bucket: this.config.bucket,
          Region: this.config.region,
          Key: key,
          Sign: true,
          Expires: 600,
        },
        callback,
      );
    });

    return sdkStringProperty(result, "Url") ?? sdkStringProperty(result, "url") ?? null;
  }

  async testConnection(
    options: { readonly realCheck?: boolean } = {},
  ): Promise<ObjectStorageTestConnectionResult> {
    if (!this.config.realCallEnabled) {
      return storageTestResponse({
        config: this.config,
        success: true,
        mode: "config_check",
        attempted: false,
        messageZh: "当前为配置检查模式，未请求腾讯云 COS 服务。",
      });
    }

    const missingFields = tencentMissingFields(this.config);
    if (missingFields.length > 0) {
      return storageTestResponse({
        config: this.config,
        success: false,
        mode: "config_check",
        attempted: false,
        requiredMissingFields: missingFields,
        messageZh: missingConfigMessage(this.providerCode, missingFields),
      });
    }

    if (this.env.NODE_ENV === "test" || !options.realCheck) {
      return storageTestResponse({
        config: this.config,
        success: true,
        mode: "config_check",
        attempted: false,
        messageZh: "腾讯云 COS 配置完整，本次未请求真实对象存储服务。",
      });
    }

    return this.realHealthCheck();
  }

  private async realHealthCheck(): Promise<ObjectStorageTestConnectionResult> {
    const startedAt = Date.now();
    const key = this.normalizeKey(storageHealthCheckKey);
    try {
      await this.putObject({
        key,
        body: "storage health check",
        contentType: "text/plain",
      });
      await this.headObject({ key });
      await this.getObject({ key });
      await this.deleteObject({ key });

      return storageTestResponse({
        config: this.config,
        success: true,
        mode: "real",
        attempted: true,
        latencyMs: Date.now() - startedAt,
        messageZh: `腾讯云 COS 连接测试通过，耗时 ${Date.now() - startedAt}ms。`,
      });
    } catch (error) {
      await this.deleteObject({ key }).catch(() => undefined);
      return storageTestResponse({
        config: this.config,
        success: false,
        mode: "real",
        attempted: true,
        latencyMs: Date.now() - startedAt,
        messageZh: `腾讯云 COS 连接测试失败：${safeStorageErrorMessage(error)}。`,
      });
    }
  }

  private normalizeKey(key: string): string {
    return normalizeObjectKey(key, this.config.basePrefix);
  }

  private isRealOperationAllowed(): boolean {
    return (
      this.config.realCallEnabled &&
      this.env.NODE_ENV !== "test" &&
      tencentMissingFields(this.config).length === 0
    );
  }

  private assertRealOperationReady(): void {
    if (!this.config.realCallEnabled) {
      throw new Error("腾讯云 COS 未启用真实调用。");
    }
    const missingFields = tencentMissingFields(this.config);
    if (missingFields.length > 0) {
      throw new Error(missingConfigMessage(this.providerCode, missingFields));
    }
    if (this.env.NODE_ENV === "test") {
      throw new Error("自动测试环境不会请求腾讯云 COS。");
    }
  }

  private async cosRequest(
    operation: (
      client: TencentCosClient,
      callback: (error: unknown, data: unknown | undefined) => void,
    ) => void,
  ): Promise<unknown> {
    const client = await this.createClient();
    return new Promise((resolve, reject) => {
      operation(client, (error, data) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(data);
      });
    });
  }

  private async createClient(): Promise<TencentCosClient> {
    const module = await dynamicImportPackage("cos-nodejs-sdk-v5");
    const TencentCos = ensureConstructor<TencentCosConstructor>(module, "cos-nodejs-sdk-v5");
    return new TencentCos({
      SecretId: this.config.secretId,
      SecretKey: this.config.secretKey,
      Timeout: this.config.timeoutMs,
    });
  }
}

function safeStorageErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (isRecord(error) && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "对象存储服务暂不可用";
}

export function createObjectStorageProvider(
  config: RuntimeStorageConfig,
  env: NodeJS.ProcessEnv = process.env,
): ObjectStorageProvider {
  if (config.providerCode === "local_storage") {
    return new LocalObjectStorageProvider(config);
  }
  if (config.providerCode === "aliyun_oss") {
    return new AliyunOssObjectStorageProvider(config, env);
  }
  return new TencentCosObjectStorageProvider(config, env);
}

export async function getActiveObjectStorageProvider(
  options: StorageRuntimeOptions = {},
): Promise<ObjectStorageProvider> {
  const config = await readRuntimeStorageConfig(options);
  return createObjectStorageProvider(config, options.env ?? process.env);
}
