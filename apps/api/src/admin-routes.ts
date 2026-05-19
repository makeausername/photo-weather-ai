import type { FastifyInstance, FastifyReply } from "fastify";
import {
  assertProviderType,
  createAuditLog,
  getProviderConfig,
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
import { z } from "zod";

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
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one provider field must be provided.",
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

export type AdminRoutesOptions = {
  readonly dbClient?: DatabaseClient;
};

function toAuditJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
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

export function registerAdminRoutes(app: FastifyInstance, options: AdminRoutesOptions = {}): void {
  // TODO: Replace this temporary unauthenticated admin surface with RBAC once auth lands.
  const client = options.dbClient;

  app.get("/admin/settings", async (request, reply) => {
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

  app.get("/admin/settings/groups", async () => {
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
        actorUserId: null,
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
    };
  });

  app.get<{ Params: { providerType: string; providerCode: string } }>(
    "/admin/providers/:providerType/:providerCode",
    async (request, reply) => {
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

      const updatedProvider = await updateProviderConfig({
        providerType,
        providerCode: request.params.providerCode,
        ...parsedBody.data,
        client,
      });

      await createAuditLog(
        {
          actorUserId: null,
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
        provider: updatedProvider,
      };
    },
  );

  app.post<{ Params: { providerType: string; providerCode: string } }>(
    "/admin/providers/:providerType/:providerCode/test-connection",
    async (request, reply) => {
      try {
        assertProviderType(request.params.providerType);
        validateProviderCode(request.params.providerCode);
      } catch (error) {
        return sendError(reply, 400, "invalid_provider", (error as Error).message);
      }

      return {
        success: true,
        mode: "mock",
        providerType: request.params.providerType,
        providerCode: request.params.providerCode,
        message: "Provider connection test is mocked in local development.",
      };
    },
  );

  app.get("/admin/audit-logs", async (request, reply) => {
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
