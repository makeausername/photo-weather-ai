import type { FastifyInstance, FastifyReply } from "fastify";
import {
  assertProviderType,
  createAuditLog,
  getProviderConfig,
  getLocation,
  getPhotoSpot,
  getSystemSetting,
  listAuditLogs,
  listProviderConfigs,
  listSystemSettings,
  setSystemSetting,
  updateProviderConfig,
  validateProviderCode,
  validateSettingKey,
  validateSettingValue,
} from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderType } from "@photo-weather/db";
import { MockGeoProvider } from "@photo-weather/geo";
import type { GeoProvider } from "@photo-weather/geo";
import {
  buildCalibrationLocationKey,
  calibrationStrengthLevels,
  calibrationTargets,
  compareReplayResultsWithOutcomes,
  defaultCalibrationMinimumSampleCount,
  deterministicRuleVersion,
  getCalibrationOverviewCounts,
  historicalWeatherSourceProviders,
  listCalibrationStats,
  listForecastReplayResults,
  listObservedOutcomes,
  OpenMeteoHistoricalWeatherProvider,
  observedResults,
  rainImpactLevels,
  rebuildCalibrationStats,
  runHistoricalReplay,
  saveHistoricalWeatherSamples,
  fetchAndNormalizeHistoricalWeather,
  transparencyLevels,
  updateObservedOutcome,
  upsertObservedOutcome,
  whiteoutLevels,
  type HistoricalWeatherProvider,
} from "@photo-weather/calibration";
import {
  maskQWeatherApiHost,
  MeteoblueClient,
  OpenMeteoClient,
  QWeatherClient,
} from "@photo-weather/weather";
import { MockTerrainProvider, type TerrainProvider } from "@photo-weather/terrain";
import { z } from "zod";
import type { AuthConfig } from "./auth-routes.js";
import { requirePermission } from "./auth-routes.js";
import {
  createRealDeepSeekProvider,
  normalizeDeepSeekAdminConfigJson,
  readRuntimeDeepSeekConfig,
} from "./ai-provider.js";
import { createRealAmapProvider, readRuntimeAmapConfig } from "./geo-provider.js";
import {
  providerDiagnosticCodeFromRoute,
  runProviderDiagnostic,
  type ProviderDiagnosticResult,
} from "./provider-diagnostics.js";
import { checkBillingProviderConfig } from "./payment-provider.js";
import {
  normalizeOpenMeteoAdminConfigJson,
  normalizeMeteoblueAdminConfigJson,
  normalizeQWeatherAdminConfigJson,
  readRuntimeMeteoblueConfig,
  readRuntimeOpenMeteoConfig,
  readRuntimeQWeatherConfig,
} from "./weather-provider.js";
import {
  createObjectStorageProvider,
  getActiveObjectStorageProvider,
  isStorageProviderCode,
  normalizeContentType,
  readRuntimeStorageConfig,
  storageProviderNameZh,
  type ObjectStorageTestConnectionResult,
} from "./object-storage.js";
import {
  cdnProviderCodes,
  CdnProviderError,
  cdnProviderNameZh,
  createCdnProvider,
  isCdnProviderCode,
  readRuntimeCdnConfig,
  type CdnOperationResult,
  type CdnProviderCode,
  type CdnRefreshType,
  type CdnTestConnectionResult,
} from "./cdn-provider.js";
import { checkVerificationProviderConfig } from "./verification-senders.js";

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);

const jsonObjectSchema = z.record(jsonSchema);

const settingPatchSchema = z.object({
  valueJson: jsonSchema,
});

const providerPatchSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(10000).optional(),
    configJson: jsonObjectSchema.optional(),
    secretJson: jsonObjectSchema.nullable().optional(),
    clearSecretKeys: z
      .array(
        z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z][A-Za-z0-9_]*$/),
      )
      .max(50)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "请至少提供一个要更新的服务商字段。",
  });

const listSettingsQuerySchema = z.object({
  group: z.string().min(1).optional(),
  publicOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const listProvidersQuerySchema = z.object({
  providerType: z.string().min(1).optional(),
  enabledOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const auditLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const latitudeSchema = z
  .number({ invalid_type_error: "纬度必须是数字。" })
  .finite("纬度必须是有效数字。")
  .min(-90, "纬度不能小于 -90。")
  .max(90, "纬度不能大于 90。");

const longitudeSchema = z
  .number({ invalid_type_error: "经度必须是数字。" })
  .finite("经度必须是有效数字。")
  .min(-180, "经度不能小于 -180。")
  .max(180, "经度不能大于 180。");

const elevationSchema = z
  .number({ invalid_type_error: "海拔必须是数字。" })
  .finite("海拔必须是有效数字。")
  .min(-500, "海拔不能小于 -500 米。")
  .max(9000, "海拔不能大于 9000 米。")
  .nullable()
  .optional();

const geoSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词。"),
});

const providerConnectionTestSchema = z
  .object({
    mode: z.enum(["mock", "fixture", "real"]).optional(),
  })
  .optional();

const storageProviderCodeSchema = z.enum(["local_storage", "aliyun_oss", "tencent_cos"]);

const storageTestObjectKeySchema = z
  .string()
  .trim()
  .min(1, "请填写测试对象 Key。")
  .max(240, "测试对象 Key 不能超过 240 个字符。");

const storageTestUploadSchema = z.object({
  providerCode: storageProviderCodeSchema.optional(),
  key: storageTestObjectKeySchema.default("health-check/manual-test.txt"),
  content: z.string().max(65536, "测试内容不能超过 65536 个字符。").default("hello"),
  contentType: z.string().trim().max(120).default("text/plain"),
});

const storageTestObjectQuerySchema = z.object({
  providerCode: storageProviderCodeSchema.optional(),
  key: storageTestObjectKeySchema.default("health-check/manual-test.txt"),
});

const cdnProviderCodeSchema = z.enum(cdnProviderCodes);
const cdnRefreshTypeValues = ["file", "directory", "url", "path"] as const;
const cdnRefreshTypeSchema = z.enum(cdnRefreshTypeValues);
const cdnOperationUrlSchema = z.string().trim().min(1).max(2048);
const cdnOperationUrlListSchema = z.array(cdnOperationUrlSchema).max(100).default([]);

const cdnRefreshSchema = z
  .object({
    providerCode: cdnProviderCodeSchema.optional(),
    urls: cdnOperationUrlListSchema.optional().default([]),
    directories: cdnOperationUrlListSchema.optional().default([]),
    refreshType: cdnRefreshTypeSchema.optional(),
  })
  .refine((value) => value.urls.length + value.directories.length > 0, {
    message: "请填写至少一个需要刷新的 CDN URL 或目录。",
  })
  .refine((value) => value.urls.length + value.directories.length <= 100, {
    message: "单次 CDN 刷新不能超过 100 条 URL/目录。",
  });

const cdnPrefetchSchema = z.object({
  providerCode: cdnProviderCodeSchema.optional(),
  urls: cdnOperationUrlListSchema.refine((value) => value.length > 0, {
    message: "请填写至少一个需要预热的 CDN URL。",
  }),
});

const cdnTasksQuerySchema = z.object({
  providerCode: cdnProviderCodeSchema.optional(),
  taskId: z.string().trim().min(1).max(120).optional(),
});

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须使用 YYYY-MM-DD。");

const calibrationTargetSchema = z.enum(calibrationTargets);
const historicalSourceProviderSchema = z.enum(historicalWeatherSourceProviders);

const calibrationLocationSchema = z.object({
  spotId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  locationKey: z.string().trim().min(1).optional(),
  locationName: z.string().trim().min(1).optional(),
  latitudeWgs84: latitudeSchema.optional(),
  longitudeWgs84: longitudeSchema.optional(),
  elevationMeters: elevationSchema,
});

const calibrationFetchHistorySchema = calibrationLocationSchema.extend({
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  timezone: z.string().trim().min(1).optional().default("Asia/Shanghai"),
  sourceProvider: historicalSourceProviderSchema.optional().default("open_meteo_historical"),
});

const calibrationReplaySchema = calibrationLocationSchema.extend({
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  target: calibrationTargetSchema,
  timezone: z.string().trim().min(1).optional().default("Asia/Shanghai"),
  sourceProvider: historicalSourceProviderSchema.optional().default("open_meteo_historical"),
  ruleVersion: z.string().trim().min(1).optional().default(deterministicRuleVersion),
  fetch: z.boolean().optional().default(false),
});

const observedOutcomePayloadSchema = calibrationLocationSchema.extend({
  target: calibrationTargetSchema,
  outcomeDate: dateOnlySchema,
  observationWindowStart: z.string().datetime({ offset: true }).nullable().optional(),
  observationWindowEnd: z.string().datetime({ offset: true }).nullable().optional(),
  observedResult: z.enum(observedResults),
  cloudSeaLevel: z.enum(calibrationStrengthLevels).nullable().optional(),
  whiteoutLevel: z.enum(whiteoutLevels).nullable().optional(),
  sunriseGlowLevel: z.enum(calibrationStrengthLevels).nullable().optional(),
  sunsetGlowLevel: z.enum(calibrationStrengthLevels).nullable().optional(),
  astroVisibilityLevel: z.enum(calibrationStrengthLevels).nullable().optional(),
  milkyWayVisibilityLevel: z.enum(calibrationStrengthLevels).nullable().optional(),
  transparencyLevel: z.enum(transparencyLevels).nullable().optional(),
  rainImpactLevel: z.enum(rainImpactLevels).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  photoEvidenceUrl: z.string().url().nullable().optional(),
  source: z.enum(["admin_manual", "user_feedback", "imported"]).optional().default("admin_manual"),
});

const calibrationStatsQuerySchema = z.object({
  spotId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  locationKey: z.string().trim().min(1).optional(),
  target: calibrationTargetSchema.optional(),
  ruleVersion: z.string().trim().min(1).optional(),
});

const calibrationReplayResultsQuerySchema = z.object({
  spotId: z.string().trim().min(1).optional(),
  locationId: z.string().trim().min(1).optional(),
  locationKey: z.string().trim().min(1).optional(),
  target: calibrationTargetSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const retiredFixedLocationLibraryMessage =
  "固定地点库管理已停用，历史校准请直接输入地点名称与 WGS84 坐标。";

export type AdminRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly geoProvider?: GeoProvider;
  readonly resolveGeoProvider?: () => Promise<GeoProvider>;
  readonly historicalWeatherProvider?: HistoricalWeatherProvider;
  readonly terrainProvider?: TerrainProvider;
  readonly env?: NodeJS.ProcessEnv;
};

function toAuditJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function calibrationLocationKeyFromQuery(input: {
  readonly spotId?: string;
  readonly locationId?: string;
  readonly locationKey?: string;
}): string | undefined {
  if (input.spotId) {
    return buildCalibrationLocationKey({ spotId: input.spotId });
  }
  if (input.locationId) {
    return buildCalibrationLocationKey({ locationId: input.locationId });
  }
  return input.locationKey;
}

function sendRetiredFixedLocationLibrary(reply: FastifyReply) {
  return sendError(
    reply,
    410,
    "fixed_location_library_retired",
    retiredFixedLocationLibraryMessage,
  );
}

function isLocalDevelopment(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== "production";
}

function sanitizeProviderErrorMessage(message: string, secret: string | undefined): string {
  if (!secret) {
    return message;
  }

  return message.split(secret).join("[redacted]");
}

function safeStorageRouteErrorMessage(error: unknown): string {
  const fallback = "对象存储测试失败，请检查服务商配置。";
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const trimmed = message.trim().split(/\r?\n/)[0]?.slice(0, 300) ?? "";
  if (!trimmed) {
    return fallback;
  }

  if (
    [
      /secretJson/i,
      /accessKeySecret/i,
      /secretKey/i,
      /SecretId/i,
      /password/i,
      /authorization/i,
      /token/i,
      /[A-Za-z]:[\\/]/,
      /\/(?:home|var|srv|app|tmp)\//,
      /\bat\s+\S+\s+\(/,
    ].some((pattern) => pattern.test(trimmed))
  ) {
    return fallback;
  }

  return trimmed;
}

function groupBy<TItem, TKey extends string>(
  items: readonly TItem[],
  getKey: (item: TItem) => TKey,
): Record<TKey, TItem[]> {
  return items.reduce(
    (groups, item) => {
      const key = getKey(item);
      groups[key] = groups[key] ?? [];
      groups[key].push(item);
      return groups;
    },
    {} as Record<TKey, TItem[]>,
  );
}

function sendZodError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.status(statusCode).send({
    error,
    message,
  });
}

function createProviderTestMetadata(
  providerType: string,
  providerCode: string,
  connectionMode: "mock" | "fixture" | "real",
  modeLabelZh?: string,
) {
  const defaultModeLabelZh = connectionMode === "real" ? "真实服务" : "模拟测试";
  return {
    providerType,
    providerCode,
    providerNameZh: getProviderNameZh(providerType, providerCode),
    connectionMode,
    modeZh: modeLabelZh ?? defaultModeLabelZh,
    modeLabelZh: modeLabelZh ?? defaultModeLabelZh,
    testedAt: new Date().toISOString(),
    sampleLocation: "黄山光明顶",
  };
}

function getProviderNameZh(providerType: string, providerCode: string): string {
  const key = `${providerType}:${providerCode}`;
  const names: Record<string, string> = {
    "geo:amap": "高德地图",
    "weather:qweather": "和风天气",
    "weather:open_meteo": "Open-Meteo",
    "weather:meteoblue": "meteoblue",
    "ai:deepseek": "DeepSeek",
    "email:aliyun_smtp": "阿里云企业邮箱 SMTP",
    "sms:aliyun_sms": "阿里云短信",
    "storage:local_storage": "本地存储",
    "storage:aliyun_oss": "阿里云 OSS",
    "storage:tencent_cos": "腾讯云 COS",
    "cdn:aliyun_cdn": "阿里云 CDN",
    "cdn:tencent_cdn": "腾讯云 CDN",
    "billing:wechat_pay": "微信支付",
    "billing:alipay": "支付宝",
  };

  return names[key] ?? "服务商";
}

function storageConnectionMode(mode: ObjectStorageTestConnectionResult["mode"]): "mock" | "real" {
  return mode === "real" ? "real" : "mock";
}

function storageModeLabelZh(mode: ObjectStorageTestConnectionResult["mode"]): string {
  return mode === "real" ? "真实服务" : "配置检查";
}

function storageProviderTestResponse(result: ObjectStorageTestConnectionResult) {
  const modeLabelZh = storageModeLabelZh(result.mode);
  return {
    ...result,
    connectionMode: storageConnectionMode(result.mode),
    modeZh: modeLabelZh,
    modeLabelZh,
    testedAt: new Date().toISOString(),
    message: result.messageZh,
  };
}

function cdnProviderTestResponse(result: CdnTestConnectionResult) {
  const modeLabelZh = result.mode === "real" ? "真实服务" : "配置检查";
  return {
    ...result,
    connectionMode: result.mode === "real" ? "real" : "mock",
    modeZh: modeLabelZh,
    modeLabelZh,
    testedAt: new Date().toISOString(),
    message: result.messageZh,
  };
}

function safeCdnRouteErrorMessage(error: unknown): string {
  if (error instanceof CdnProviderError) {
    return error.messageZh;
  }

  return "CDN 操作失败，请检查服务商配置。";
}

function cdnRouteErrorStatus(error: unknown): number {
  return error instanceof CdnProviderError ? error.statusCode : 400;
}

async function resolveCdnProviderCode(
  providerCode: CdnProviderCode | undefined,
  client: DatabaseClient | undefined,
): Promise<CdnProviderCode> {
  if (providerCode) {
    return providerCode;
  }

  const providers = await listProviderConfigs({
    providerType: "cdn",
    enabledOnly: true,
    client,
  });
  const provider = providers.find((item) => isCdnProviderCode(item.providerCode));
  if (!provider || !isCdnProviderCode(provider.providerCode)) {
    throw new CdnProviderError("cdn_provider_missing", "请先启用一个 CDN 服务商。", 409);
  }
  return provider.providerCode;
}

function combineCdnOperationResults(
  providerCode: CdnProviderCode,
  results: readonly CdnOperationResult[],
): CdnOperationResult {
  if (results.length === 0) {
    throw new CdnProviderError("cdn_operation_empty", "CDN 操作内容为空。");
  }

  if (results.length === 1) {
    const onlyResult = results[0];
    if (!onlyResult) {
      throw new CdnProviderError("cdn_operation_empty", "CDN 操作内容为空。");
    }
    return onlyResult;
  }

  const acceptedCount = results.reduce((sum, result) => sum + result.acceptedCount, 0);
  const rejectedCount = results.reduce((sum, result) => sum + result.rejectedCount, 0);
  const success = results.every((result) => result.success);
  const mode = results.some((result) => result.mode === "real")
    ? "real"
    : results.some((result) => result.mode === "config_check")
      ? "config_check"
      : "mock";
  return {
    success,
    providerCode,
    providerNameZh: cdnProviderNameZh(providerCode),
    mode,
    acceptedCount,
    rejectedCount,
    providerTaskId: results.map((result) => result.providerTaskId).filter(Boolean).join(",") || undefined,
    messageZh: success
      ? `${cdnProviderNameZh(providerCode)} 已受理 ${acceptedCount} 条 CDN 操作。`
      : `${cdnProviderNameZh(providerCode)} CDN 操作未完全受理。`,
    sanitizedError: results.find((result) => result.sanitizedError)?.sanitizedError,
  };
}

function providerSaveMessageZh(providerType: string, providerCode: string): string {
  return `${getProviderNameZh(providerType, providerCode)} 配置已保存。`;
}

function sendProviderTestFailure(
  reply: FastifyReply,
  input: {
    readonly providerType: string;
    readonly providerCode: string;
    readonly mode?: string;
    readonly connectionMode?: "mock" | "fixture" | "real";
    readonly modeLabelZh?: string;
    readonly messageZh: string;
    readonly error?: string;
    readonly statusCode?: number;
    readonly latencyMs?: number;
  },
) {
  const connectionMode = input.connectionMode ?? "real";
  return reply.send({
    success: false,
    mode: input.mode ?? (connectionMode === "real" ? "real" : "mock"),
    ...createProviderTestMetadata(
      input.providerType,
      input.providerCode,
      connectionMode,
      input.modeLabelZh,
    ),
    error: input.error ?? "provider_test_failed",
    statusCode: input.statusCode,
    latencyMs: input.latencyMs,
    messageZh: input.messageZh,
    message: input.messageZh,
  });
}

function providerTestAuthFailureResponse(
  providerType: string,
  providerCode: string,
  error: { readonly statusCode: 401 | 403; readonly code: string; readonly message: string },
) {
  const errorCategory = error.statusCode === 401 ? "admin_unauthorized" : "admin_forbidden";
  const messageZh =
    error.statusCode === 401
      ? "登录状态已失效，请重新登录后台后再测试。"
      : "当前账号没有服务商测试权限。";

  return {
    success: false,
    mode: "auth",
    ...createProviderTestMetadata(providerType, providerCode, "real"),
    enabled: false,
    realCallEnabled: false,
    apiKeyPresent: false,
    attempted: false,
    error: errorCategory,
    errorCategory,
    authErrorCode: error.code,
    statusCode: error.statusCode,
    messageZh,
    message: messageZh,
  };
}

function providerDiagnosticResponse(result: ProviderDiagnosticResult) {
  const modeZh = result.connectionMode === "real" ? result.modeLabelZh ?? "真实服务" : "模拟测试";
  const mode =
    result.connectionMode === "mock"
      ? result.providerCode === "deepseek"
        ? result.mode ?? "mock"
        : "mock"
      : result.mode ?? "real";
  return {
    ...result,
    mode,
    modeZh,
    modeLabelZh: modeZh,
    testedAt: new Date().toISOString(),
    error: result.errorCategory,
    message: result.messageZh,
  };
}

function isJsonObjectValue(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveCalibrationLocation(
  input: z.infer<typeof calibrationLocationSchema>,
  client: DatabaseClient | undefined,
) {
  if (input.spotId) {
    const spot = await getPhotoSpot(input.spotId, { client });
    if (!spot) {
      throw new Error("未找到用于历史校准的旧版拍摄点。");
    }

    return {
      spotId: spot.id,
      locationKey: buildCalibrationLocationKey({ spotId: spot.id }),
      locationName: spot.name,
      latitudeWgs84: spot.latitudeWgs84,
      longitudeWgs84: spot.longitudeWgs84,
      elevationMeters: spot.elevation,
    };
  }

  if (input.locationId) {
    const location = await getLocation(input.locationId, { client });
    if (!location) {
      throw new Error("未找到用于历史校准的地点。");
    }

    return {
      spotId: null,
      locationKey:
        input.locationKey ?? buildCalibrationLocationKey({ locationId: location.id }),
      locationName: input.locationName ?? location.name,
      latitudeWgs84: input.latitudeWgs84 ?? location.latitudeWgs84,
      longitudeWgs84: input.longitudeWgs84 ?? location.longitudeWgs84,
      elevationMeters: input.elevationMeters ?? location.elevation,
    };
  }

  if (
    !input.locationName ||
    typeof input.latitudeWgs84 !== "number" ||
    typeof input.longitudeWgs84 !== "number"
  ) {
    throw new Error("请填写地点名称与 WGS84 坐标。");
  }

  return {
    spotId: null,
    locationKey:
      input.locationKey ??
      buildCalibrationLocationKey({
        latitudeWgs84: input.latitudeWgs84,
        longitudeWgs84: input.longitudeWgs84,
      }),
    locationName: input.locationName,
    latitudeWgs84: input.latitudeWgs84,
    longitudeWgs84: input.longitudeWgs84,
    elevationMeters: input.elevationMeters ?? null,
  };
}

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;
  const env = options.env ?? process.env;
  const geoProvider = options.geoProvider ?? new MockGeoProvider();
  const resolveAdminGeoProvider =
    options.resolveGeoProvider ?? (() => Promise.resolve(geoProvider));
  const historicalWeatherProvider =
    options.historicalWeatherProvider ?? new OpenMeteoHistoricalWeatherProvider();
  const calibrationTerrainProvider = options.terrainProvider ?? new MockTerrainProvider();

  app.get("/admin", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return {
      ok: true,
      user: auth.principal.user,
      roles: auth.principal.roles,
      roleCodes: auth.principal.roleCodes,
      permissions: auth.principal.permissions,
    };
  });

  app.get("/admin/calibration", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const [stats, recentResults, outcomes, overview] = await Promise.all([
      listCalibrationStats({ client }),
      listForecastReplayResults({ client, limit: 50 }),
      listObservedOutcomes({ client }),
      getCalibrationOverviewCounts({ client }),
    ]);

    return {
      overview,
      targets: calibrationTargets,
      minimumHintSampleCount: defaultCalibrationMinimumSampleCount,
      stats,
      recentResults,
      outcomes,
    };
  });

  app.get("/admin/calibration/overview", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const [stats, recentResults, outcomes, overview] = await Promise.all([
      listCalibrationStats({ client }),
      listForecastReplayResults({ client, limit: 50 }),
      listObservedOutcomes({ client }),
      getCalibrationOverviewCounts({ client }),
    ]);

    return {
      overview,
      targets: calibrationTargets,
      minimumHintSampleCount: defaultCalibrationMinimumSampleCount,
      stats,
      recentResults,
      outcomes,
    };
  });

  app.post("/admin/calibration/fetch-history", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = calibrationFetchHistorySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    if (env.NODE_ENV === "test" && !options.historicalWeatherProvider) {
      return sendError(
        reply,
        409,
        "real_history_fetch_disabled_in_tests",
        "测试环境不会触发真实历史天气请求。",
      );
    }

    if (parsedBody.data.sourceProvider !== "open_meteo_historical") {
      return sendError(
        reply,
        400,
        "historical_provider_unavailable",
        "V1 仅支持 Open-Meteo 历史天气；meteoblue 历史接口保留为后续增强。",
      );
    }

    try {
      const location = await resolveCalibrationLocation(parsedBody.data, client);
      const fetched = await fetchAndNormalizeHistoricalWeather(historicalWeatherProvider, {
        ...location,
        startDate: parsedBody.data.startDate,
        endDate: parsedBody.data.endDate,
        timezone: parsedBody.data.timezone,
      });
      const stored = await saveHistoricalWeatherSamples(fetched.samples, { client });

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "calibration.history.fetch",
          targetType: "historical_weather_sample",
          targetId: location.locationKey,
          afterJson: toAuditJson({
            locationKey: location.locationKey,
            sourceProvider: fetched.sourceProvider,
            startDate: parsedBody.data.startDate,
            endDate: parsedBody.data.endDate,
            insertedCount: stored.insertedCount,
            updatedCount: stored.updatedCount,
            skippedCount: stored.skippedCount,
          }),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return {
        location,
        sourceProvider: fetched.sourceProvider,
        insertedCount: stored.insertedCount,
        updatedCount: stored.updatedCount,
        skippedCount: stored.skippedCount,
        skippedDuplicateCount: stored.skippedDuplicateCount,
        sampleCount: fetched.samples.length,
      };
    } catch (error) {
      return sendError(reply, 400, "calibration_history_fetch_failed", (error as Error).message);
    }
  });

  app.post("/admin/calibration/replay", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = calibrationReplaySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    try {
      const location = await resolveCalibrationLocation(parsedBody.data, client);
      const replay = await runHistoricalReplay(
        {
          ...location,
          startDate: parsedBody.data.startDate,
          endDate: parsedBody.data.endDate,
          target: parsedBody.data.target,
          sourceProvider: parsedBody.data.sourceProvider,
          ruleVersion: parsedBody.data.ruleVersion,
          timezone: parsedBody.data.timezone,
          fetch: Boolean(parsedBody.data.fetch),
        },
        {
          client,
          terrainProvider: calibrationTerrainProvider,
          historicalWeatherProvider,
        },
      );

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "calibration.replay.run",
          targetType: "forecast_replay_run",
          targetId: replay.run.id,
          afterJson: toAuditJson({
            locationKey: location.locationKey,
            target: parsedBody.data.target,
            startDate: parsedBody.data.startDate,
            endDate: parsedBody.data.endDate,
            resultCount: replay.resultCount,
          }),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return replay;
    } catch (error) {
      return sendError(reply, 400, "calibration_replay_failed", (error as Error).message);
    }
  });

  app.get("/admin/calibration/replay-results", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = calibrationReplayResultsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const locationKey = calibrationLocationKeyFromQuery(parsedQuery.data);
    const [results, outcomes] = await Promise.all([
      listForecastReplayResults({
        client,
        locationKey,
        target: parsedQuery.data.target,
        limit: parsedQuery.data.limit ?? 100,
      }),
      listObservedOutcomes({
        client,
        locationKey,
        target: parsedQuery.data.target,
      }),
    ]);

    return {
      results,
      outcomes,
      comparisons: compareReplayResultsWithOutcomes(results, outcomes),
    };
  });

  app.post("/admin/calibration/outcomes", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = observedOutcomePayloadSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    try {
      const location = await resolveCalibrationLocation(parsedBody.data, client);
      const outcome = await upsertObservedOutcome(
        {
          ...location,
          target: parsedBody.data.target,
          outcomeDate: parsedBody.data.outcomeDate,
          observationWindowStart: parsedBody.data.observationWindowStart,
          observationWindowEnd: parsedBody.data.observationWindowEnd,
          observedResult: parsedBody.data.observedResult,
          cloudSeaLevel: parsedBody.data.cloudSeaLevel,
          whiteoutLevel: parsedBody.data.whiteoutLevel,
          sunriseGlowLevel: parsedBody.data.sunriseGlowLevel,
          sunsetGlowLevel: parsedBody.data.sunsetGlowLevel,
          astroVisibilityLevel: parsedBody.data.astroVisibilityLevel,
          milkyWayVisibilityLevel: parsedBody.data.milkyWayVisibilityLevel,
          transparencyLevel: parsedBody.data.transparencyLevel,
          rainImpactLevel: parsedBody.data.rainImpactLevel,
          notes: parsedBody.data.notes,
          photoEvidenceUrl: parsedBody.data.photoEvidenceUrl,
          source: parsedBody.data.source,
          createdBy: auth.auditActorUserId,
        },
        { client },
      );

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "calibration.outcome.upsert",
          targetType: "observed_outcome",
          targetId: outcome.id,
          afterJson: toAuditJson(outcome),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return { outcome };
    } catch (error) {
      return sendError(reply, 400, "observed_outcome_update_failed", (error as Error).message);
    }
  });

  app.put<{ Params: { id: string } }>("/admin/calibration/outcomes/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = observedOutcomePayloadSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    try {
      const location = await resolveCalibrationLocation(parsedBody.data, client);
      const outcome = await updateObservedOutcome(
        request.params.id,
        {
          ...location,
          target: parsedBody.data.target,
          outcomeDate: parsedBody.data.outcomeDate,
          observationWindowStart: parsedBody.data.observationWindowStart,
          observationWindowEnd: parsedBody.data.observationWindowEnd,
          observedResult: parsedBody.data.observedResult,
          cloudSeaLevel: parsedBody.data.cloudSeaLevel,
          whiteoutLevel: parsedBody.data.whiteoutLevel,
          sunriseGlowLevel: parsedBody.data.sunriseGlowLevel,
          sunsetGlowLevel: parsedBody.data.sunsetGlowLevel,
          astroVisibilityLevel: parsedBody.data.astroVisibilityLevel,
          milkyWayVisibilityLevel: parsedBody.data.milkyWayVisibilityLevel,
          transparencyLevel: parsedBody.data.transparencyLevel,
          rainImpactLevel: parsedBody.data.rainImpactLevel,
          notes: parsedBody.data.notes,
          photoEvidenceUrl: parsedBody.data.photoEvidenceUrl,
          source: parsedBody.data.source,
          createdBy: auth.auditActorUserId,
        },
        { client },
      );

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "calibration.outcome.update",
          targetType: "observed_outcome",
          targetId: outcome.id,
          afterJson: toAuditJson(outcome),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return { outcome };
    } catch (error) {
      return sendError(reply, 400, "observed_outcome_update_failed", (error as Error).message);
    }
  });

  app.get("/admin/calibration/stats", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = calibrationStatsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const locationKey = calibrationLocationKeyFromQuery(parsedQuery.data);
    const stats = await listCalibrationStats({
      client,
      locationKey,
      target: parsedQuery.data.target,
      ruleVersion: parsedQuery.data.ruleVersion,
    });

    return { stats };
  });

  app.post("/admin/calibration/stats/rebuild", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = calibrationReplaySchema
      .pick({
        spotId: true,
        locationId: true,
        locationKey: true,
        locationName: true,
        latitudeWgs84: true,
        longitudeWgs84: true,
        elevationMeters: true,
        target: true,
        ruleVersion: true,
      })
      .safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    try {
      const location = await resolveCalibrationLocation(parsedBody.data, client);
      const stats = await rebuildCalibrationStats({
        client,
        locationKey: location.locationKey,
        locationName: location.locationName,
        spotId: location.spotId,
        target: parsedBody.data.target,
        ruleVersion: parsedBody.data.ruleVersion,
      });

      return { stats };
    } catch (error) {
      return sendError(reply, 400, "calibration_stats_rebuild_failed", (error as Error).message);
    }
  });

  app.post("/admin/calibration/stats/recompute", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = calibrationReplaySchema
      .pick({
        spotId: true,
        locationId: true,
        locationKey: true,
        locationName: true,
        latitudeWgs84: true,
        longitudeWgs84: true,
        elevationMeters: true,
        target: true,
        ruleVersion: true,
      })
      .safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    try {
      const location = await resolveCalibrationLocation(parsedBody.data, client);
      const stats = await rebuildCalibrationStats({
        client,
        locationKey: location.locationKey,
        locationName: location.locationName,
        spotId: location.spotId,
        target: parsedBody.data.target,
        ruleVersion: parsedBody.data.ruleVersion,
      });

      return { stats };
    } catch (error) {
      return sendError(reply, 400, "calibration_stats_rebuild_failed", (error as Error).message);
    }
  });

  app.get("/admin/settings", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "settings.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = listSettingsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const settings = await listSystemSettings({
      group: parsedQuery.data.group,
      publicOnly: parsedQuery.data.publicOnly,
      client,
    });

    return {
      settings,
      groups: groupBy(settings, (setting) => setting.group),
    };
  });

  app.get("/admin/settings/groups", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "settings.manage");
    if (!auth) {
      return reply;
    }

    const settings = await listSystemSettings({ client });
    const groupedSettings = groupBy(settings, (setting) => setting.group);

    return {
      groups: Object.entries(groupedSettings).map(([group, groupSettings]) => ({
        group,
        count: groupSettings.length,
      })),
    };
  });

  app.get<{ Params: { key: string } }>("/admin/settings/:key", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "settings.manage");
    if (!auth) {
      return reply;
    }

    try {
      validateSettingKey(request.params.key);
    } catch (error) {
      return sendError(reply, 400, "invalid_setting_key", (error as Error).message);
    }

    const setting = await getSystemSetting(request.params.key, { client });
    if (!setting) {
      return sendError(reply, 404, "setting_not_found", "System setting was not found.");
    }

    return {
      setting,
    };
  });

  app.patch<{ Params: { key: string } }>("/admin/settings/:key", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "settings.manage");
    if (!auth) {
      return reply;
    }

    try {
      validateSettingKey(request.params.key);
    } catch (error) {
      return sendError(reply, 400, "invalid_setting_key", (error as Error).message);
    }

    const parsedBody = settingPatchSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const existingSetting = await getSystemSetting(request.params.key, { client });
    if (!existingSetting) {
      return sendError(reply, 404, "setting_not_found", "System setting was not found.");
    }

    if (!existingSetting.isEditable) {
      return sendError(
        reply,
        409,
        "setting_not_editable",
        "This system setting is not editable through the admin API.",
      );
    }

    try {
      validateSettingValue(existingSetting.valueType, parsedBody.data.valueJson);
    } catch (error) {
      return sendError(reply, 400, "invalid_setting_value", (error as Error).message);
    }

    const updatedSetting = await setSystemSetting({
      key: existingSetting.key,
      valueJson: parsedBody.data.valueJson,
      valueType: existingSetting.valueType,
      group: existingSetting.group,
      label: existingSetting.label,
      description: existingSetting.description,
      isPublic: existingSetting.isPublic,
      isSecret: existingSetting.isSecret,
      isEditable: existingSetting.isEditable,
      client,
    });

    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "system_setting.update",
        targetType: "system_setting",
        targetId: existingSetting.key,
        beforeJson: toAuditJson(existingSetting),
        afterJson: toAuditJson(updatedSetting),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return {
      setting: updatedSetting,
    };
  });

  app.get("/admin/providers", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = listProvidersQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    let providerType: ProviderType | undefined;
    if (parsedQuery.data.providerType) {
      try {
        assertProviderType(parsedQuery.data.providerType);
        providerType = parsedQuery.data.providerType;
      } catch (error) {
        return sendError(reply, 400, "invalid_provider_type", (error as Error).message);
      }
    }

    const providers = await listProviderConfigs({
      providerType,
      enabledOnly: parsedQuery.data.enabledOnly,
      client,
    });

    return {
      providers,
      groups: groupBy(providers, (provider) => provider.providerType),
      realDevCallFlags: {
        amap: (await readRuntimeAmapConfig({ dbClient: client, env })).realModeEnabled,
        deepseek: (await readRuntimeDeepSeekConfig({ dbClient: client, env })).realModeEnabled,
        qweather: (await readRuntimeQWeatherConfig({ dbClient: client, env })).realModeEnabled,
        openMeteo: (await readRuntimeOpenMeteoConfig({ dbClient: client, env })).realModeEnabled,
        meteoblue: (await readRuntimeMeteoblueConfig({ dbClient: client, env })).realModeEnabled,
      },
    };
  });

  app.get<{ Params: { providerType: string; providerCode: string } }>(
    "/admin/providers/:providerType/:providerCode",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
      if (!auth) {
        return reply;
      }

      let providerType: ProviderType;
      try {
        assertProviderType(request.params.providerType);
        validateProviderCode(request.params.providerCode);
        providerType = request.params.providerType;
      } catch (error) {
        return sendError(reply, 400, "invalid_provider", (error as Error).message);
      }

      const provider = await getProviderConfig(providerType, request.params.providerCode, {
        client,
      });
      if (!provider) {
        return sendError(reply, 404, "provider_not_found", "Provider config was not found.");
      }

      return {
        provider,
      };
    },
  );

  app.patch<{ Params: { providerType: string; providerCode: string } }>(
    "/admin/providers/:providerType/:providerCode",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
      if (!auth) {
        return reply;
      }

      let providerType: ProviderType;
      try {
        assertProviderType(request.params.providerType);
        validateProviderCode(request.params.providerCode);
        providerType = request.params.providerType;
      } catch (error) {
        return sendError(reply, 400, "invalid_provider", (error as Error).message);
      }

      const parsedBody = providerPatchSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendZodError(reply, parsedBody.error);
      }

      const existingProvider = await getProviderConfig(providerType, request.params.providerCode, {
        client,
      });
      if (!existingProvider) {
        return sendError(reply, 404, "provider_not_found", "Provider config was not found.");
      }

      const providerPatch = { ...parsedBody.data };
      if (
        providerType === "ai" &&
        request.params.providerCode === "deepseek" &&
        providerPatch.configJson !== undefined
      ) {
        const incomingConfigJson = isJsonObjectValue(providerPatch.configJson)
          ? providerPatch.configJson
          : {};
        const mergedConfigJson: Record<string, JsonValue> = {
          ...(isJsonObjectValue(existingProvider.configJson) ? existingProvider.configJson : {}),
          ...incomingConfigJson,
        };
        if (
          incomingConfigJson.analysisMode !== undefined &&
          incomingConfigJson.maxTokens === undefined
        ) {
          delete mergedConfigJson.maxTokens;
        }
        if (
          incomingConfigJson.analysisMode !== undefined &&
          incomingConfigJson.thinkingEnabled === undefined
        ) {
          delete mergedConfigJson.thinkingEnabled;
        }
        if (
          incomingConfigJson.analysisMode !== undefined &&
          incomingConfigJson.reasoningEffort === undefined
        ) {
          delete mergedConfigJson.reasoningEffort;
        }
        providerPatch.configJson = normalizeDeepSeekAdminConfigJson({
          ...mergedConfigJson,
        });
      }
      if (
        providerType === "weather" &&
        providerPatch.configJson !== undefined &&
        (request.params.providerCode === "qweather" ||
          request.params.providerCode === "open_meteo" ||
          request.params.providerCode === "meteoblue")
      ) {
        const incomingConfigJson = isJsonObjectValue(providerPatch.configJson)
          ? providerPatch.configJson
          : {};
        const mergedConfigJson: Record<string, JsonValue> = {
          ...(isJsonObjectValue(existingProvider.configJson) ? existingProvider.configJson : {}),
          ...incomingConfigJson,
        };
        providerPatch.configJson =
          request.params.providerCode === "qweather"
            ? normalizeQWeatherAdminConfigJson(mergedConfigJson)
            : request.params.providerCode === "open_meteo"
              ? normalizeOpenMeteoAdminConfigJson(mergedConfigJson)
              : normalizeMeteoblueAdminConfigJson(mergedConfigJson);
      }

      const updatedProvider = await updateProviderConfig({
        providerType,
        providerCode: request.params.providerCode,
        ...providerPatch,
        client,
      });

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "provider_config.update",
          targetType: "provider_config",
          targetId: `${providerType}:${request.params.providerCode}`,
          beforeJson: toAuditJson(existingProvider),
          afterJson: toAuditJson(updatedProvider),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return {
        success: true,
        messageZh: providerSaveMessageZh(providerType, request.params.providerCode),
        provider: updatedProvider,
      };
    },
  );

  app.post<{ Params: { providerType: string; providerCode: string } }>(
    "/admin/providers/:providerType/:providerCode/test-connection",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "providers.manage", {
        onAuthFailure: (error) =>
          providerTestAuthFailureResponse(
            request.params.providerType,
            request.params.providerCode,
            error,
          ),
      });
      if (!auth) {
        return reply;
      }

      try {
        assertProviderType(request.params.providerType);
        validateProviderCode(request.params.providerCode);
      } catch (error) {
        return sendError(reply, 400, "invalid_provider", (error as Error).message);
      }

      const parsedBody = providerConnectionTestSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return sendZodError(reply, parsedBody.error);
      }

      if (
        request.params.providerType === "billing" &&
        (request.params.providerCode === "wechat_pay" || request.params.providerCode === "alipay")
      ) {
        const result = await checkBillingProviderConfig({
          providerCode: request.params.providerCode,
          dbClient: client,
          env,
        });

        return {
          success: result.success,
          mode: result.mode,
          ...createProviderTestMetadata(
            request.params.providerType,
            request.params.providerCode,
            "mock",
            "配置检查",
          ),
          enabled: result.enabled,
          realCallEnabled: result.realCallEnabled,
          configReady: result.configReady,
          missingFields: result.missingFields,
          invalidFields: result.invalidFields,
          messageZh: result.messageZh,
          message: result.messageZh,
        };
      }

      if (request.params.providerType === "storage") {
        if (!isStorageProviderCode(request.params.providerCode)) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            connectionMode: "mock",
            mode: "config_check",
            modeLabelZh: "配置检查",
            error: "unsupported_storage_provider",
            messageZh: "当前版本仅支持本地存储、阿里云 OSS 和腾讯云 COS。",
          });
        }

        const runtimeConfig = await readRuntimeStorageConfig({
          dbClient: client,
          env,
          providerCode: request.params.providerCode,
        });
        const provider = createObjectStorageProvider(runtimeConfig, env);
        const result = await provider.testConnection({ realCheck: true });
        return storageProviderTestResponse(result);
      }

      if (request.params.providerType === "cdn") {
        if (!isCdnProviderCode(request.params.providerCode)) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            connectionMode: "mock",
            mode: "config_check",
            modeLabelZh: "配置检查",
            error: "unsupported_cdn_provider",
            messageZh: "当前版本仅支持阿里云 CDN 和腾讯云 CDN。",
          });
        }

        const runtimeConfig = await readRuntimeCdnConfig({
          dbClient: client,
          providerCode: request.params.providerCode,
        });
        const provider = createCdnProvider(runtimeConfig, { env });
        const result = await provider.testConnection();
        return cdnProviderTestResponse(result);
      }

      const diagnosticProviderCode = providerDiagnosticCodeFromRoute(
        request.params.providerType,
        request.params.providerCode,
      );
      if (diagnosticProviderCode) {
        const result = await runProviderDiagnostic({
          providerCode: diagnosticProviderCode,
          dbClient: client,
          env,
        });
        return providerDiagnosticResponse(result);
      }

      if (
        (request.params.providerType === "email" &&
          request.params.providerCode === "aliyun_smtp") ||
        (request.params.providerType === "sms" && request.params.providerCode === "aliyun_sms")
      ) {
        const result = await checkVerificationProviderConfig({
          channel: request.params.providerType === "email" ? "email" : "sms",
          dbClient: client,
        });

        return {
          success: result.success,
          mode: result.mode,
          ...createProviderTestMetadata(
            request.params.providerType,
            request.params.providerCode,
            "mock",
            "配置检查",
          ),
          configReady: result.configReady,
          error: result.error,
          missingFields: result.missingFields,
          messageZh: result.messageZh,
          message: result.messageZh,
        };
      }

      if (request.params.providerType === "geo" && request.params.providerCode === "amap") {
        const runtimeConfig = await readRuntimeAmapConfig({ dbClient: client, env });
        if (!runtimeConfig.realModeEnabled) {
          return {
            success: true,
            mode: "mock",
            ...createProviderTestMetadata(
              request.params.providerType,
              request.params.providerCode,
              "mock",
            ),
            messageZh: "当前为模拟测试，未请求高德地图服务。",
            message: "当前为模拟测试，未请求高德地图服务。",
          };
        }

        if (!runtimeConfig.providerEnabled) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            error: "provider_not_enabled",
            messageZh: "高德地图服务商未启用，请先在后台服务商配置中启用高德地图。",
          });
        }

        if (!runtimeConfig.apiKey) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            error: "provider_key_missing",
            messageZh: "请先填写高德 Web 服务 Key。",
          });
        }

        try {
          const startedAt = Date.now();
          const amapProvider = await createRealAmapProvider({ dbClient: client, env });
          const results = await amapProvider.searchPlace("黄山光明顶", {
            countryCode: "CN",
            locale: "zh-CN",
            limit: 1,
          });
          const latencyMs = Date.now() - startedAt;

          return {
            success: true,
            mode: "real",
            ...createProviderTestMetadata(
              request.params.providerType,
              request.params.providerCode,
              "real",
            ),
            latencyMs,
            messageZh: results[0]
              ? `高德地图连接测试通过，耗时 ${latencyMs}ms。`
              : `高德地图连接成功，但未返回测试地点，耗时 ${latencyMs}ms。`,
            message: results[0]
              ? `高德地图连接测试通过，耗时 ${latencyMs}ms。`
              : `高德地图连接成功，但未返回测试地点，耗时 ${latencyMs}ms。`,
            sample: results[0]
              ? {
                  name: results[0].name,
                  source: results[0].source,
                  city: results[0].city ?? null,
                }
              : null,
          };
        } catch (error) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            error: "provider_test_failed",
            messageZh: sanitizeProviderErrorMessage(
              (error as Error).message || "高德地图连接测试失败。",
              runtimeConfig.apiKey,
            ),
          });
        }
      }

      if (request.params.providerType === "ai" && request.params.providerCode === "deepseek") {
        const runtimeConfig = await readRuntimeDeepSeekConfig({ dbClient: client, env });
        if (!runtimeConfig.realCallEnabled) {
          return {
            success: true,
            mode: runtimeConfig.analysisMode,
            connectionMode: "mock",
            modeZh: "模拟测试",
            modeLabelZh: "模拟测试",
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            providerNameZh: getProviderNameZh(
              request.params.providerType,
              request.params.providerCode,
            ),
            testedAt: new Date().toISOString(),
            sampleLocation: "黄山光明顶",
            model: runtimeConfig.model,
            messageZh: "当前为模拟测试，未请求 DeepSeek 服务。",
            message: "当前为模拟测试，未请求 DeepSeek 服务。",
          };
        }

        if (!runtimeConfig.enabled) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            mode: runtimeConfig.analysisMode,
            modeLabelZh: runtimeConfig.modeLabelZh,
            error: "provider_not_enabled",
            messageZh: "DeepSeek 服务商未启用，请先在后台服务商配置中启用 DeepSeek。",
          });
        }

        if (!runtimeConfig.apiKeyPresent) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            mode: runtimeConfig.analysisMode,
            modeLabelZh: runtimeConfig.modeLabelZh,
            error: "provider_key_missing",
            messageZh: "请先填写 DeepSeek API Key。",
          });
        }

        try {
          const startedAt = Date.now();
          const deepSeekProvider = await createRealDeepSeekProvider({ dbClient: client, env });
          const result = await deepSeekProvider.testConnection();
          const latencyMs = Date.now() - startedAt;

          return {
            success: true,
            mode: runtimeConfig.analysisMode,
            ...createProviderTestMetadata(
              request.params.providerType,
              request.params.providerCode,
              "real",
              runtimeConfig.modeLabelZh,
            ),
            model: runtimeConfig.model,
            latencyMs,
            messageZh:
              result.message || `DeepSeek 连接测试通过，当前使用${runtimeConfig.modeLabelZh}。`,
            message:
              result.message || `DeepSeek 连接测试通过，当前使用${runtimeConfig.modeLabelZh}。`,
          };
        } catch (error) {
          return sendProviderTestFailure(reply, {
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            mode: runtimeConfig.analysisMode,
            modeLabelZh: runtimeConfig.modeLabelZh,
            error: "provider_test_failed",
            messageZh: sanitizeProviderErrorMessage(
              (error as Error).message || "DeepSeek 连接测试失败。",
              runtimeConfig.apiKey,
            ),
          });
        }
      }

      if (request.params.providerType === "weather") {
        if (request.params.providerCode === "qweather") {
          const runtimeConfig = await readRuntimeQWeatherConfig({ dbClient: client, env });
          if (!runtimeConfig.realCallEnabled) {
            return {
              success: true,
              mode: "mock",
              ...createProviderTestMetadata(
                request.params.providerType,
                request.params.providerCode,
                "mock",
              ),
              messageZh: "当前为模拟测试，未请求和风天气服务。",
              message: "当前为模拟测试，未请求和风天气服务。",
            };
          }

          if (!runtimeConfig.apiKeyPresent || !runtimeConfig.apiKey) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_key_missing",
              messageZh: "请先填写和风天气 API Key。",
            });
          }

          if (!runtimeConfig.apiHostPresent || !runtimeConfig.apiHost) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_host_missing",
              messageZh: "请先填写和风天气 API Host。",
            });
          }

          if (!runtimeConfig.enabled) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_not_enabled",
              messageZh: "和风天气服务商未启用，请先在后台服务商配置中启用和风天气。",
            });
          }

          try {
            const qweatherClient = new QWeatherClient({
              apiKey: runtimeConfig.apiKey,
              apiHost: runtimeConfig.apiHost,
              timeoutMs: runtimeConfig.timeoutMs,
              retryCount: runtimeConfig.retryCount,
              language: runtimeConfig.language,
              unit: runtimeConfig.unit,
            });
            const result = await qweatherClient.testConnection();

            return {
              success: result.success,
              mode: "real",
              ...createProviderTestMetadata(
                request.params.providerType,
                request.params.providerCode,
                "real",
              ),
              provider: "qweather",
              apiHost: maskQWeatherApiHost(runtimeConfig.apiHost),
              statusCode: result.statusCode,
              qweatherCode: result.qweatherCode,
              location: result.location,
              observedWeatherSummary: result.observedWeatherSummary,
              latencyMs: result.latencyMs,
              messageZh: result.success
                ? `和风天气连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`
                : result.messageZh,
              message: result.success
                ? `和风天气连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`
                : result.messageZh,
            };
          } catch (error) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_test_failed",
              messageZh: sanitizeProviderErrorMessage(
                (error as Error).message || "和风天气连接测试失败。",
                runtimeConfig.apiKey,
              ),
            });
          }
        }

        if (request.params.providerCode === "open_meteo") {
          const runtimeConfig = await readRuntimeOpenMeteoConfig({ dbClient: client, env });
          if (!runtimeConfig.realCallEnabled) {
            return {
              success: true,
              mode: "mock",
              ...createProviderTestMetadata(
                request.params.providerType,
                request.params.providerCode,
                "mock",
              ),
              messageZh: "当前为模拟测试，未请求真实天气服务。",
              message: "当前为模拟测试，未请求真实天气服务。",
            };
          }

          if (!runtimeConfig.enabled) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              mode: runtimeConfig.mode,
              modeLabelZh: runtimeConfig.modeLabelZh,
              error: "provider_not_enabled",
              messageZh: "Open-Meteo 服务商未启用，请先在后台服务商配置中启用 Open-Meteo。",
            });
          }

          if (runtimeConfig.mode === "customer" && !runtimeConfig.apiKey) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              mode: runtimeConfig.mode,
              modeLabelZh: runtimeConfig.modeLabelZh,
              error: "provider_key_missing",
              messageZh: "商业客户模式请先填写 Open-Meteo API Key。",
            });
          }

          try {
            const openMeteoClient = new OpenMeteoClient({
              endpoint: runtimeConfig.endpoint,
              mode: runtimeConfig.mode,
              apiKey: runtimeConfig.apiKey,
              timezone: runtimeConfig.timezone,
              timeoutMs: runtimeConfig.timeoutMs,
              retryCount: runtimeConfig.retryCount,
              modelPreference: runtimeConfig.modelPreference,
            });
            const result = await openMeteoClient.testConnection();

            return {
              success: result.success,
              mode: runtimeConfig.mode,
              ...createProviderTestMetadata(
                request.params.providerType,
                request.params.providerCode,
                "real",
                runtimeConfig.modeLabelZh,
              ),
              endpoint: result.endpoint,
              statusCode: result.statusCode,
              latencyMs: result.latencyMs,
              messageZh: result.success
                ? `Open-Meteo 连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`
                : result.messageZh,
              message: result.success
                ? `Open-Meteo 连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`
                : result.messageZh,
            };
          } catch (error) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              mode: runtimeConfig.mode,
              modeLabelZh: runtimeConfig.modeLabelZh,
              error: "provider_test_failed",
              messageZh: sanitizeProviderErrorMessage(
                (error as Error).message || "Open-Meteo 连接测试失败。",
                runtimeConfig.apiKey,
              ),
            });
          }
        }

        if (request.params.providerCode === "meteoblue") {
          const runtimeConfig = await readRuntimeMeteoblueConfig({ dbClient: client, env });
          if (!runtimeConfig.realCallEnabled) {
            return {
              success: true,
              mode: "mock",
              ...createProviderTestMetadata(
                request.params.providerType,
                request.params.providerCode,
                "mock",
              ),
              packages: runtimeConfig.packages,
              messageZh: "当前为模拟测试，未请求 meteoblue 服务。",
              message: "当前为模拟测试，未请求 meteoblue 服务。",
            };
          }

          if (!runtimeConfig.enabled) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_not_enabled",
              messageZh: "meteoblue 服务商未启用，请先在后台服务商配置中启用 meteoblue。",
            });
          }

          if (!runtimeConfig.apiKeyPresent || !runtimeConfig.apiKey) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_key_missing",
              messageZh: "请先填写 meteoblue API Key。",
            });
          }

          try {
            const meteoblueClient = new MeteoblueClient({
              apiKey: runtimeConfig.apiKey,
              baseUrl: runtimeConfig.baseUrl,
              packages: runtimeConfig.packages,
              timeoutMs: runtimeConfig.timeoutMs,
              retryCount: runtimeConfig.retryCount,
            });
            const result = await meteoblueClient.testConnection();

            return {
              success: result.success,
              mode: "real",
              ...createProviderTestMetadata(
                request.params.providerType,
                request.params.providerCode,
                "real",
              ),
              statusCode: result.statusCode,
              latencyMs: result.latencyMs,
              endpoint: result.baseUrl,
              packages: result.packages,
              sampleLocation: result.sampleLocation,
              messageZh: result.success
                ? `meteoblue 连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`
                : result.messageZh,
              message: result.success
                ? `meteoblue 连接测试通过，耗时 ${Math.round(result.latencyMs)}ms。`
                : result.messageZh,
            };
          } catch (error) {
            return sendProviderTestFailure(reply, {
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              error: "provider_test_failed",
              messageZh: sanitizeProviderErrorMessage(
                (error as Error).message || "meteoblue 连接测试失败。",
                runtimeConfig.apiKey,
              ),
            });
          }
        }
      }

      return {
        success: true,
        mode: "mock",
        ...createProviderTestMetadata(
          request.params.providerType,
          request.params.providerCode,
          "mock",
        ),
        messageZh: "当前为模拟测试，未触发真实外部连接。",
        message: "当前为模拟测试，未触发真实外部连接。",
      };
    },
  );

  app.post("/admin/cdn/refresh", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = cdnRefreshSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    let providerCode: CdnProviderCode | undefined;
    try {
      providerCode = await resolveCdnProviderCode(parsedBody.data.providerCode, client);
      const runtimeConfig = await readRuntimeCdnConfig({ dbClient: client, providerCode });
      const provider = createCdnProvider(runtimeConfig, { env });
      const results: CdnOperationResult[] = [];
      if (parsedBody.data.urls.length > 0) {
        results.push(
          await provider.refreshUrls({
            urls: parsedBody.data.urls,
            refreshType: parsedBody.data.refreshType as CdnRefreshType | undefined,
            caller: "admin",
          }),
        );
      }
      if (parsedBody.data.directories.length > 0) {
        results.push(
          await provider.refreshDirectories({
            directories: parsedBody.data.directories,
            refreshType: parsedBody.data.refreshType as CdnRefreshType | undefined,
            caller: "admin",
          }),
        );
      }
      const result = combineCdnOperationResults(providerCode, results);

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "cdn.refresh",
          targetType: "cdn_provider",
          targetId: `cdn:${providerCode}`,
          afterJson: toAuditJson({
            providerCode,
            urlsCount: parsedBody.data.urls.length,
            directoriesCount: parsedBody.data.directories.length,
            refreshType: parsedBody.data.refreshType ?? null,
            mode: result.mode,
            success: result.success,
            acceptedCount: result.acceptedCount,
            rejectedCount: result.rejectedCount,
          }),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return result;
    } catch (error) {
      if (providerCode) {
        await createAuditLog(
          {
            actorUserId: auth.auditActorUserId,
            action: "cdn.refresh",
            targetType: "cdn_provider",
            targetId: `cdn:${providerCode}`,
            afterJson: toAuditJson({
              providerCode,
              urlsCount: parsedBody.data.urls.length,
              directoriesCount: parsedBody.data.directories.length,
              success: false,
              error: error instanceof CdnProviderError ? error.code : "cdn_refresh_failed",
            }),
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
          },
          { client },
        );
      }
      return sendError(
        reply,
        cdnRouteErrorStatus(error),
        error instanceof CdnProviderError ? error.code : "cdn_refresh_failed",
        safeCdnRouteErrorMessage(error),
      );
    }
  });

  app.post("/admin/cdn/prefetch", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = cdnPrefetchSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    let providerCode: CdnProviderCode | undefined;
    try {
      providerCode = await resolveCdnProviderCode(parsedBody.data.providerCode, client);
      const runtimeConfig = await readRuntimeCdnConfig({ dbClient: client, providerCode });
      const provider = createCdnProvider(runtimeConfig, { env });
      const result = await provider.prefetchUrls({
        urls: parsedBody.data.urls,
        caller: "admin",
      });

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "cdn.prefetch",
          targetType: "cdn_provider",
          targetId: `cdn:${providerCode}`,
          afterJson: toAuditJson({
            providerCode,
            urlsCount: parsedBody.data.urls.length,
            mode: result.mode,
            success: result.success,
            acceptedCount: result.acceptedCount,
            rejectedCount: result.rejectedCount,
          }),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      return result;
    } catch (error) {
      if (providerCode) {
        await createAuditLog(
          {
            actorUserId: auth.auditActorUserId,
            action: "cdn.prefetch",
            targetType: "cdn_provider",
            targetId: `cdn:${providerCode}`,
            afterJson: toAuditJson({
              providerCode,
              urlsCount: parsedBody.data.urls.length,
              success: false,
              error: error instanceof CdnProviderError ? error.code : "cdn_prefetch_failed",
            }),
            ipAddress: request.ip,
            userAgent: request.headers["user-agent"] ?? null,
          },
          { client },
        );
      }
      return sendError(
        reply,
        cdnRouteErrorStatus(error),
        error instanceof CdnProviderError ? error.code : "cdn_prefetch_failed",
        safeCdnRouteErrorMessage(error),
      );
    }
  });

  app.get("/admin/cdn/tasks", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = cdnTasksQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    try {
      const providerCode = await resolveCdnProviderCode(parsedQuery.data.providerCode, client);
      const runtimeConfig = await readRuntimeCdnConfig({ dbClient: client, providerCode });
      const provider = createCdnProvider(runtimeConfig, { env });
      return await provider.listTasks({ taskId: parsedQuery.data.taskId });
    } catch (error) {
      return sendError(
        reply,
        cdnRouteErrorStatus(error),
        error instanceof CdnProviderError ? error.code : "cdn_tasks_failed",
        safeCdnRouteErrorMessage(error),
      );
    }
  });

  app.post("/admin/storage/test-upload", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = storageTestUploadSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    let contentType: string;
    try {
      contentType = normalizeContentType(parsedBody.data.contentType);
    } catch (error) {
      return sendError(reply, 400, "invalid_content_type", (error as Error).message);
    }

    const provider = await getActiveObjectStorageProvider({
      dbClient: client,
      env,
      providerCode: parsedBody.data.providerCode,
    });
    const contentBytes = new TextEncoder().encode(parsedBody.data.content);
    const maxJsonTestBytes = Math.min(provider.maxUploadBytes, 65536);
    if (contentBytes.byteLength > maxJsonTestBytes) {
      return reply.status(413).send({
        error: "storage_test_payload_too_large",
        message: `测试内容不能超过 ${maxJsonTestBytes} 字节。`,
        messageZh: `测试内容不能超过 ${maxJsonTestBytes} 字节。`,
      });
    }

    try {
      const object = await provider.putObject({
        key: parsedBody.data.key,
        body: contentBytes,
        contentType,
      });

      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "storage_test.upload",
          targetType: "storage_object",
          targetId: `${object.providerCode}:${object.key}`,
          afterJson: toAuditJson(object),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      const messageZh = `${storageProviderNameZh(provider.providerCode)} 测试对象已写入。`;
      return {
        success: true,
        providerType: provider.providerType,
        providerCode: provider.providerCode,
        providerNameZh: storageProviderNameZh(provider.providerCode),
        object,
        readUrl: await provider.createReadUrl({ key: object.key }),
        messageZh,
        message: messageZh,
      };
    } catch (error) {
      return sendError(
        reply,
        400,
        "storage_test_upload_failed",
        safeStorageRouteErrorMessage(error),
      );
    }
  });

  app.get("/admin/storage/test-download", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = storageTestObjectQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const provider = await getActiveObjectStorageProvider({
      dbClient: client,
      env,
      providerCode: parsedQuery.data.providerCode,
    });

    try {
      const object = await provider.getObject({ key: parsedQuery.data.key });
      if (object.body.byteLength > 65536) {
        return reply.status(413).send({
          error: "storage_test_object_too_large",
          message: "测试下载对象超过 65536 字节，未在 JSON 响应中返回内容。",
          messageZh: "测试下载对象超过 65536 字节，未在 JSON 响应中返回内容。",
        });
      }

      const { body: _body, ...metadata } = object;
      const messageZh = `${storageProviderNameZh(provider.providerCode)} 测试对象读取成功。`;
      return {
        success: true,
        providerType: provider.providerType,
        providerCode: provider.providerCode,
        providerNameZh: storageProviderNameZh(provider.providerCode),
        object: metadata,
        content: new TextDecoder().decode(object.body),
        messageZh,
        message: messageZh,
      };
    } catch (error) {
      return sendError(
        reply,
        400,
        "storage_test_download_failed",
        safeStorageRouteErrorMessage(error),
      );
    }
  });

  app.delete("/admin/storage/test-object", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = storageTestObjectQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const provider = await getActiveObjectStorageProvider({
      dbClient: client,
      env,
      providerCode: parsedQuery.data.providerCode,
    });

    try {
      await provider.deleteObject({ key: parsedQuery.data.key });
      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "storage_test.delete",
          targetType: "storage_object",
          targetId: `${provider.providerCode}:${parsedQuery.data.key}`,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );

      const messageZh = `${storageProviderNameZh(provider.providerCode)} 测试对象已删除。`;
      return {
        success: true,
        providerType: provider.providerType,
        providerCode: provider.providerCode,
        providerNameZh: storageProviderNameZh(provider.providerCode),
        key: parsedQuery.data.key,
        messageZh,
        message: messageZh,
      };
    } catch (error) {
      return sendError(
        reply,
        400,
        "storage_test_delete_failed",
        safeStorageRouteErrorMessage(error),
      );
    }
  });

  if (isLocalDevelopment(env)) {
    app.get("/debug/providers", async () => {
      const [qweather, openMeteo, meteoblue] = await Promise.all([
        readRuntimeQWeatherConfig({ dbClient: client, env }),
        readRuntimeOpenMeteoConfig({ dbClient: client, env }),
        readRuntimeMeteoblueConfig({ dbClient: client, env }),
      ]);

      return {
        qweather: {
          enabled: qweather.enabled,
          realCallEnabled: qweather.realCallEnabled,
          apiKeyPresent: qweather.apiKeyPresent,
          apiHostPresent: qweather.apiHostPresent,
          apiHost: maskQWeatherApiHost(qweather.apiHost),
          timeoutMs: qweather.timeoutMs,
          retryCount: qweather.retryCount,
        },
        openMeteo: {
          enabled: openMeteo.enabled,
          realCallEnabled: openMeteo.realCallEnabled,
          mode: openMeteo.mode,
          apiKeyPresent: openMeteo.apiKeyPresent,
          endpoint: openMeteo.endpoint,
          customerEndpointPresent: openMeteo.customerEndpointPresent,
          timezone: openMeteo.timezone,
          timeoutMs: openMeteo.timeoutMs,
          retryCount: openMeteo.retryCount,
          modelPreference: openMeteo.modelPreference ?? null,
        },
        meteoblue: {
          enabled: meteoblue.enabled,
          realCallEnabled: meteoblue.realCallEnabled,
          apiKeyPresent: meteoblue.apiKeyPresent,
          baseUrl: meteoblue.baseUrl,
          packages: meteoblue.packages,
          packageName: meteoblue.packageName ?? null,
          timeoutMs: meteoblue.timeoutMs,
          retryCount: meteoblue.retryCount,
        },
      };
    });
  }

  app.get("/admin/locations", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return sendRetiredFixedLocationLibrary(reply);
  });

  app.get<{ Params: { id: string } }>("/admin/locations/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return sendRetiredFixedLocationLibrary(reply);
  });

  app.post("/admin/locations", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return sendRetiredFixedLocationLibrary(reply);
  });

  app.patch<{ Params: { id: string } }>("/admin/locations/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return sendRetiredFixedLocationLibrary(reply);
  });

  app.delete<{ Params: { id: string } }>("/admin/locations/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return sendRetiredFixedLocationLibrary(reply);
  });

  app.get("/admin/geo/search", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = geoSearchQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    try {
      const provider = await resolveAdminGeoProvider();
      const results = await provider.searchPlace(parsedQuery.data.q, {
        countryCode: "CN",
        locale: "zh-CN",
        limit: 8,
      });

      return {
        provider: results[0]?.source ?? "mock",
        results,
      };
    } catch (error) {
      return sendError(reply, 503, "geo_search_unavailable", (error as Error).message);
    }
  });

  app.get("/admin/audit-logs", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "audit.read");
    if (!auth) {
      return reply;
    }

    const parsedQuery = auditLogsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const logs = await listAuditLogs({
      limit: parsedQuery.data.limit,
      client,
    });

    return {
      logs,
    };
  });
}
