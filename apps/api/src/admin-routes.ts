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
import { maskQWeatherApiHost, QWeatherClient } from "@photo-weather/weather";
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
  normalizeOpenMeteoAdminConfigJson,
  normalizeQWeatherAdminConfigJson,
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

export type AdminRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly geoProvider?: GeoProvider;
  readonly resolveGeoProvider?: () => Promise<GeoProvider>;
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

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;
  const env = options.env ?? process.env;
  const geoProvider = options.geoProvider ?? new MockGeoProvider();
  const resolveAdminGeoProvider =
    options.resolveGeoProvider ?? (() => Promise.resolve(geoProvider));

  app.get("/admin", async (request, reply) => {
    const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
    if (!auth) {
      return reply;
    }

    return {
      ok: true,
      user: auth.principal.user,
      roles: auth.principal.roles,
      permissions: auth.principal.permissions,
    };
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
        (request.params.providerCode === "qweather" || request.params.providerCode === "open_meteo")
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
            : normalizeOpenMeteoAdminConfigJson(mergedConfigJson);
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
        messageZh: "配置已保存。",
        provider: updatedProvider,
      };
    },
  );

  app.post<{ Params: { providerType: string; providerCode: string } }>(
    "/admin/providers/:providerType/:providerCode/test-connection",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "providers.manage");
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

      if (request.params.providerType === "geo" && request.params.providerCode === "amap") {
        const runtimeConfig = await readRuntimeAmapConfig({ dbClient: client, env });
        if (!runtimeConfig.realModeEnabled) {
          return {
            success: true,
            mode: "mock",
            message: "当前为模拟测试，未请求高德地图服务。",
          };
        }

        if (!runtimeConfig.providerEnabled) {
          return sendError(
            reply,
            409,
            "provider_not_enabled",
            "高德地图服务商未启用，请先在后台服务商配置中启用高德地图。",
          );
        }

        if (!runtimeConfig.apiKey) {
          return sendError(reply, 400, "provider_key_missing", "请先填写高德 Web 服务 Key。");
        }

        try {
          const amapProvider = await createRealAmapProvider({ dbClient: client, env });
          const results = await amapProvider.searchPlace("黄山光明顶", {
            countryCode: "CN",
            locale: "zh-CN",
            limit: 1,
          });

          return {
            success: true,
            mode: "real",
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            message: results[0] ? "高德地图连接测试通过。" : "高德地图连接成功，但未返回测试地点。",
            sample: results[0]
              ? {
                  name: results[0].name,
                  source: results[0].source,
                  city: results[0].city ?? null,
                }
              : null,
          };
        } catch (error) {
          return sendError(reply, 503, "provider_test_failed", (error as Error).message);
        }
      }

      if (request.params.providerType === "ai" && request.params.providerCode === "deepseek") {
        const runtimeConfig = await readRuntimeDeepSeekConfig({ dbClient: client, env });
        if (!runtimeConfig.realCallEnabled) {
          return {
            success: true,
            mode: runtimeConfig.analysisMode,
            connectionMode: "mock",
            model: runtimeConfig.model,
            message: "当前为模拟测试，未请求 DeepSeek 服务。",
          };
        }

        if (!runtimeConfig.enabled) {
          return sendError(
            reply,
            409,
            "provider_not_enabled",
            "DeepSeek 服务商未启用，请先在后台服务商配置中启用 DeepSeek。",
          );
        }

        if (!runtimeConfig.apiKeyPresent) {
          return sendError(reply, 400, "provider_key_missing", "请先填写 DeepSeek API Key。");
        }

        try {
          const startedAt = Date.now();
          const deepSeekProvider = await createRealDeepSeekProvider({ dbClient: client, env });
          const result = await deepSeekProvider.testConnection();
          const latencyMs = Date.now() - startedAt;

          return {
            success: true,
            mode: runtimeConfig.analysisMode,
            connectionMode: "real",
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            model: runtimeConfig.model,
            latencyMs,
            message:
              result.message || `DeepSeek 连接测试通过，当前使用${runtimeConfig.modeLabelZh}。`,
          };
        } catch (error) {
          return sendError(reply, 503, "provider_test_failed", (error as Error).message);
        }
      }

      if (request.params.providerType === "weather") {
        if (request.params.providerCode === "qweather") {
          const runtimeConfig = await readRuntimeQWeatherConfig({ dbClient: client, env });
          if (!runtimeConfig.realCallEnabled) {
            return {
              success: true,
              mode: "mock",
              connectionMode: "mock",
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              message: "当前为演示测试，未请求和风天气服务。",
            };
          }

          if (!runtimeConfig.apiKeyPresent || !runtimeConfig.apiKey) {
            return sendError(reply, 400, "provider_key_missing", "请先填写和风天气 API Key。");
          }

          if (!runtimeConfig.apiHostPresent || !runtimeConfig.apiHost) {
            return sendError(reply, 400, "provider_host_missing", "请先填写和风天气 API Host。");
          }

          if (!runtimeConfig.enabled) {
            return sendError(
              reply,
              409,
              "provider_not_enabled",
              "和风天气服务商未启用，请先在后台服务商配置中启用和风天气。",
            );
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
              connectionMode: "real",
              provider: "qweather",
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              apiHost: maskQWeatherApiHost(runtimeConfig.apiHost),
              statusCode: result.statusCode,
              qweatherCode: result.qweatherCode,
              location: result.location,
              observedWeatherSummary: result.observedWeatherSummary,
              latencyMs: result.latencyMs,
              messageZh: result.messageZh,
              message: result.messageZh,
            };
          } catch (error) {
            return sendError(
              reply,
              503,
              "provider_test_failed",
              sanitizeProviderErrorMessage(
                (error as Error).message || "和风天气连接测试失败。",
                runtimeConfig.apiKey,
              ),
            );
          }
        }

        if (request.params.providerCode === "open_meteo") {
          const runtimeConfig = await readRuntimeOpenMeteoConfig({ dbClient: client, env });
          if (!runtimeConfig.realCallEnabled) {
            return {
              success: true,
              mode: "mock",
              connectionMode: "mock",
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              message: "当前为模拟测试，未请求真实天气服务。",
            };
          }

          if (!runtimeConfig.enabled) {
            return sendError(
              reply,
              409,
              "provider_not_enabled",
              "Open-Meteo 服务商未启用，请先在后台服务商配置中启用 Open-Meteo。",
            );
          }

          if (!runtimeConfig.apiKeyPresent && !runtimeConfig.customerEndpointPresent) {
            return {
              success: true,
              mode: "mock",
              connectionMode: "mock",
              providerType: request.params.providerType,
              providerCode: request.params.providerCode,
              message:
                "Open-Meteo 未配置商业 Key，将使用默认样例/演示数据；真实商业接口请填写 API Key 和 Customer Endpoint。",
            };
          }

          return {
            success: true,
            mode: "real",
            connectionMode: "real",
            providerType: request.params.providerType,
            providerCode: request.params.providerCode,
            message: "Open-Meteo 商业配置已保存，当前版本未请求真实天气服务。",
          };
        }
      }

      return {
        success: true,
        mode: "mock",
        message: "当前为模拟测试，未触发真实外部连接。",
      };
    },
  );

  if (isLocalDevelopment(env)) {
    app.get("/debug/providers", async () => {
      const qweather = await readRuntimeQWeatherConfig({ dbClient: client, env });

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
