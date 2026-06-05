import type { FastifyInstance, FastifyReply } from "fastify";
import {
  assertProviderType,
  createAuditLog,
  createLocation,
  createPhotoSpot,
  deleteLocation,
  deletePhotoSpot,
  getProviderConfig,
  getLocation,
  getPhotoSpot,
  listLocations,
  listPhotoSpots,
  getSystemSetting,
  listAuditLogs,
  listProviderConfigs,
  listSystemSettings,
  locationSources,
  locationTypes,
  setSystemSetting,
  updateProviderConfig,
  updateLocation,
  updatePhotoSpot,
  validateProviderCode,
  validateSettingKey,
  validateSettingValue,
  viewDirections,
} from "@photo-weather/db";
import type { DatabaseClient, JsonValue, ProviderType } from "@photo-weather/db";
import { MockGeoProvider, validateCoordinates } from "@photo-weather/geo";
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
import {
  normalizeOpenMeteoAdminConfigJson,
  normalizeMeteoblueAdminConfigJson,
  normalizeQWeatherAdminConfigJson,
  readRuntimeMeteoblueConfig,
  readRuntimeOpenMeteoConfig,
  readRuntimeQWeatherConfig,
} from "./weather-provider.js";

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

const slugSchema = z
  .string({ required_error: "请填写 slug。" })
  .trim()
  .min(1, "请填写 slug。")
  .max(120, "slug 不能超过 120 个字符。")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 只能使用小写字母、数字和连字符。");

const requiredTextSchema = (fieldName: string, maxLength = 120) =>
  z
    .string({ required_error: `请填写${fieldName}。` })
    .trim()
    .min(1, `请填写${fieldName}。`)
    .max(maxLength, `${fieldName}不能超过 ${maxLength} 个字符。`);

const optionalTextSchema = (fieldName: string, maxLength = 1000) =>
  z
    .string()
    .max(maxLength, `${fieldName}不能超过 ${maxLength} 个字符。`)
    .nullable()
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      const trimmed = value?.trim() ?? "";
      return trimmed ? trimmed : null;
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

const locationPayloadSchema = z.object({
  name: requiredTextSchema("地点名称"),
  slug: slugSchema,
  province: requiredTextSchema("省份"),
  city: requiredTextSchema("城市"),
  district: optionalTextSchema("区县", 120),
  address: optionalTextSchema("详细地址", 500),
  latitudeGcj02: latitudeSchema,
  longitudeGcj02: longitudeSchema,
  latitudeWgs84: latitudeSchema,
  longitudeWgs84: longitudeSchema,
  elevation: elevationSchema,
  locationType: z.enum(locationTypes, {
    invalid_type_error: "请选择地点类型。",
    required_error: "请选择地点类型。",
  }),
  source: z.enum(locationSources, {
    invalid_type_error: "请选择地点来源。",
    required_error: "请选择地点来源。",
  }),
  isVerified: z.boolean().default(false),
});

const locationPatchSchema = locationPayloadSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "请至少提供一个要更新的地点字段。");

const photoSpotPayloadSchema = z.object({
  locationId: requiredTextSchema("所属地点"),
  name: requiredTextSchema("机位名称"),
  slug: slugSchema,
  description: optionalTextSchema("机位说明", 2000),
  latitudeGcj02: latitudeSchema,
  longitudeGcj02: longitudeSchema,
  latitudeWgs84: latitudeSchema,
  longitudeWgs84: longitudeSchema,
  elevation: elevationSchema,
  viewDirection: z.enum(viewDirections, {
    invalid_type_error: "请选择朝向。",
    required_error: "请选择朝向。",
  }),
  bestForSunrise: z.boolean().default(false),
  bestForSunset: z.boolean().default(false),
  bestForCloudSea: z.boolean().default(false),
  bestForStars: z.boolean().default(false),
  bestForMilkyWay: z.boolean().default(false),
  bestForSnow: z.boolean().default(false),
  accessNote: optionalTextSchema("到达说明", 2000),
  trafficNote: optionalTextSchema("交通说明", 2000),
  safetyNote: optionalTextSchema("安全说明", 2000),
  riskNote: optionalTextSchema("风险提示", 2000),
  isHot: z.boolean().default(false),
  isVerified: z.boolean().default(false),
});

const photoSpotPatchSchema = photoSpotPayloadSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "请至少提供一个要更新的机位字段。");

const listLocationsQuerySchema = z.object({
  q: z.string().trim().optional(),
});

const listPhotoSpotsQuerySchema = z.object({
  locationId: z.string().trim().min(1).optional(),
  q: z.string().trim().optional(),
});

const geoSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "请输入搜索关键词。"),
});

const providerConnectionTestSchema = z
  .object({
    mode: z.enum(["mock", "fixture", "real"]).optional(),
  })
  .optional();

const dateOnlySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须使用 YYYY-MM-DD。");

const calibrationTargetSchema = z.enum(calibrationTargets);
const historicalSourceProviderSchema = z.enum(historicalWeatherSourceProviders);

const calibrationLocationSchema = z.object({
  spotId: z.string().trim().min(1).optional(),
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
  locationKey: z.string().trim().min(1).optional(),
  target: calibrationTargetSchema.optional(),
  ruleVersion: z.string().trim().min(1).optional(),
});

const calibrationReplayResultsQuerySchema = z.object({
  spotId: z.string().trim().min(1).optional(),
  locationKey: z.string().trim().min(1).optional(),
  target: calibrationTargetSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

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

function isLocalDevelopment(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV !== "production";
}

function sanitizeProviderErrorMessage(message: string, secret: string | undefined): string {
  if (!secret) {
    return message;
  }

  return message.split(secret).join("[redacted]");
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
  };

  return names[key] ?? "服务商";
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

function validateCoordinatePair(input: {
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
}): string | null {
  const gcj02Validation = validateCoordinates(
    {
      latitude: input.latitudeGcj02,
      longitude: input.longitudeGcj02,
      system: "gcj02",
    },
    { expectedSystem: "gcj02" },
  );
  const wgs84Validation = validateCoordinates(
    {
      latitude: input.latitudeWgs84,
      longitude: input.longitudeWgs84,
      system: "wgs84",
    },
    { expectedSystem: "wgs84" },
  );

  if (!gcj02Validation.ok) {
    return "GCJ-02 坐标不合法。";
  }

  if (!wgs84Validation.ok) {
    return "WGS84 坐标不合法。";
  }

  return null;
}

async function resolveCalibrationLocation(
  input: z.infer<typeof calibrationLocationSchema>,
  client: DatabaseClient | undefined,
) {
  if (input.spotId) {
    const spot = await getPhotoSpot(input.spotId, { client });
    if (!spot) {
      throw new Error("未找到用于历史校准的机位。");
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

  if (
    !input.locationName ||
    typeof input.latitudeWgs84 !== "number" ||
    typeof input.longitudeWgs84 !== "number"
  ) {
    throw new Error("请提供机位，或提供地点名称与 WGS84 坐标。");
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

    const [photoSpots, stats, recentResults, outcomes, overview] = await Promise.all([
      listPhotoSpots({ client }),
      listCalibrationStats({ client }),
      listForecastReplayResults({ client, limit: 50 }),
      listObservedOutcomes({ client }),
      getCalibrationOverviewCounts({ client }),
    ]);

    return {
      overview,
      photoSpots,
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

    const [photoSpots, stats, recentResults, outcomes, overview] = await Promise.all([
      listPhotoSpots({ client }),
      listCalibrationStats({ client }),
      listForecastReplayResults({ client, limit: 50 }),
      listObservedOutcomes({ client }),
      getCalibrationOverviewCounts({ client }),
    ]);

    return {
      overview,
      photoSpots,
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

    const locationKey = parsedQuery.data.spotId
      ? buildCalibrationLocationKey({ spotId: parsedQuery.data.spotId })
      : parsedQuery.data.locationKey;
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

    const locationKey = parsedQuery.data.spotId
      ? buildCalibrationLocationKey({ spotId: parsedQuery.data.spotId })
      : parsedQuery.data.locationKey;
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
    const auth = await requirePermission(request, reply, client, authConfig, "locations.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = listLocationsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const locations = await listLocations({
      search: parsedQuery.data.q,
      client,
    });

    return { locations };
  });

  app.get<{ Params: { id: string } }>("/admin/locations/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "locations.manage");
    if (!auth) {
      return reply;
    }

    const location = await getLocation(request.params.id, { client });
    if (!location) {
      return sendError(reply, 404, "location_not_found", "未找到地点。");
    }

    return { location };
  });

  app.post("/admin/locations", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "locations.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = locationPayloadSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const coordinateError = validateCoordinatePair(parsedBody.data);
    if (coordinateError) {
      return sendError(reply, 400, "invalid_coordinates", coordinateError);
    }

    const location = await createLocation(parsedBody.data, { client });
    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "location.create",
        targetType: "location",
        targetId: location.id,
        afterJson: toAuditJson(location),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return reply.status(201).send({ location });
  });

  app.patch<{ Params: { id: string } }>("/admin/locations/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "locations.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = locationPatchSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const existingLocation = await getLocation(request.params.id, { client });
    if (!existingLocation) {
      return sendError(reply, 404, "location_not_found", "未找到地点。");
    }

    const coordinateError = validateCoordinatePair({
      latitudeGcj02: parsedBody.data.latitudeGcj02 ?? existingLocation.latitudeGcj02,
      longitudeGcj02: parsedBody.data.longitudeGcj02 ?? existingLocation.longitudeGcj02,
      latitudeWgs84: parsedBody.data.latitudeWgs84 ?? existingLocation.latitudeWgs84,
      longitudeWgs84: parsedBody.data.longitudeWgs84 ?? existingLocation.longitudeWgs84,
    });
    if (coordinateError) {
      return sendError(reply, 400, "invalid_coordinates", coordinateError);
    }

    const location = await updateLocation(request.params.id, parsedBody.data, { client });
    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "location.update",
        targetType: "location",
        targetId: location.id,
        beforeJson: toAuditJson(existingLocation),
        afterJson: toAuditJson(location),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return { location };
  });

  app.delete<{ Params: { id: string } }>("/admin/locations/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "locations.manage");
    if (!auth) {
      return reply;
    }

    const existingLocation = await getLocation(request.params.id, { client });
    if (!existingLocation) {
      return sendError(reply, 404, "location_not_found", "未找到地点。");
    }

    const location = await deleteLocation(request.params.id, { client });
    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "location.delete",
        targetType: "location",
        targetId: existingLocation.id,
        beforeJson: toAuditJson(existingLocation),
        afterJson: toAuditJson(location),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return { location };
  });

  app.get("/admin/photo-spots", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "photo_spots.manage");
    if (!auth) {
      return reply;
    }

    const parsedQuery = listPhotoSpotsQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const photoSpots = await listPhotoSpots({
      locationId: parsedQuery.data.locationId,
      search: parsedQuery.data.q,
      client,
    });

    return { photoSpots };
  });

  app.get<{ Params: { id: string } }>("/admin/photo-spots/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "photo_spots.manage");
    if (!auth) {
      return reply;
    }

    const photoSpot = await getPhotoSpot(request.params.id, { client });
    if (!photoSpot) {
      return sendError(reply, 404, "photo_spot_not_found", "未找到摄影机位。");
    }

    return { photoSpot };
  });

  app.post("/admin/photo-spots", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "photo_spots.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = photoSpotPayloadSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const location = await getLocation(parsedBody.data.locationId, { client });
    if (!location) {
      return sendError(reply, 400, "invalid_location", "请选择有效的所属地点。");
    }

    const coordinateError = validateCoordinatePair(parsedBody.data);
    if (coordinateError) {
      return sendError(reply, 400, "invalid_coordinates", coordinateError);
    }

    const photoSpot = await createPhotoSpot(parsedBody.data, { client });
    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "photo_spot.create",
        targetType: "photo_spot",
        targetId: photoSpot.id,
        afterJson: toAuditJson(photoSpot),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return reply.status(201).send({ photoSpot });
  });

  app.patch<{ Params: { id: string } }>("/admin/photo-spots/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "photo_spots.manage");
    if (!auth) {
      return reply;
    }

    const parsedBody = photoSpotPatchSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const existingPhotoSpot = await getPhotoSpot(request.params.id, { client });
    if (!existingPhotoSpot) {
      return sendError(reply, 404, "photo_spot_not_found", "未找到摄影机位。");
    }

    if (parsedBody.data.locationId) {
      const location = await getLocation(parsedBody.data.locationId, { client });
      if (!location) {
        return sendError(reply, 400, "invalid_location", "请选择有效的所属地点。");
      }
    }

    const coordinateError = validateCoordinatePair({
      latitudeGcj02: parsedBody.data.latitudeGcj02 ?? existingPhotoSpot.latitudeGcj02,
      longitudeGcj02: parsedBody.data.longitudeGcj02 ?? existingPhotoSpot.longitudeGcj02,
      latitudeWgs84: parsedBody.data.latitudeWgs84 ?? existingPhotoSpot.latitudeWgs84,
      longitudeWgs84: parsedBody.data.longitudeWgs84 ?? existingPhotoSpot.longitudeWgs84,
    });
    if (coordinateError) {
      return sendError(reply, 400, "invalid_coordinates", coordinateError);
    }

    const photoSpot = await updatePhotoSpot(request.params.id, parsedBody.data, { client });
    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "photo_spot.update",
        targetType: "photo_spot",
        targetId: photoSpot.id,
        beforeJson: toAuditJson(existingPhotoSpot),
        afterJson: toAuditJson(photoSpot),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return { photoSpot };
  });

  app.delete<{ Params: { id: string } }>("/admin/photo-spots/:id", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "photo_spots.manage");
    if (!auth) {
      return reply;
    }

    const existingPhotoSpot = await getPhotoSpot(request.params.id, { client });
    if (!existingPhotoSpot) {
      return sendError(reply, 404, "photo_spot_not_found", "未找到摄影机位。");
    }

    const photoSpot = await deletePhotoSpot(request.params.id, { client });
    await createAuditLog(
      {
        actorUserId: auth.auditActorUserId,
        action: "photo_spot.delete",
        targetType: "photo_spot",
        targetId: existingPhotoSpot.id,
        beforeJson: toAuditJson(existingPhotoSpot),
        afterJson: toAuditJson(photoSpot),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return { photoSpot };
  });

  app.get("/admin/geo/search", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "locations.manage");
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
