import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminUserNotFoundError,
  DuplicateUserEmailError,
  DuplicateUserPhoneError,
  InvalidAdminRoleAssignmentError,
  LastAdminAccessChangeError,
  MissingUserIdentifierError,
  adminUserAuditSnapshot,
  createAdminManagedUser,
  createAuditLog,
  disableUserAccount,
  enableUserAccount,
  generateAdminTemporaryPassword,
  getAdminUserDetail,
  listAdminUsers,
  listUserAuditLogsForAdmin,
  listUserCreditLedgerForAdmin,
  listUserEntitlementsForAdmin,
  listUserForecastHistoryForAdmin,
  listUserPaymentOrdersForAdmin,
  listUserSessionsForAdmin,
  resetUserPasswordByAdmin,
  revokeUserSessionsByAdmin,
  updateAdminManagedUser,
  updateUserRolesByAdmin,
} from "@photo-weather/db";
import type { AdminUserDetail, DatabaseClient, JsonValue, UserStatus } from "@photo-weather/db";
import { z } from "zod";
import type { AuthConfig, AuthenticatedRequestContext } from "./auth-routes.js";
import { contextHasAdminManage, requireAnyAdminPermission } from "./admin-permissions.js";

export type AdminUserRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
};

const userIdParamsSchema = z.object({
  userId: z.string().trim().min(1).max(120),
});

const listUsersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["active", "disabled", "all"]).optional(),
  role: z.string().trim().max(80).optional(),
  hasOrders: z.enum(["true", "false"]).optional(),
  hasCredits: z.enum(["true", "false"]).optional(),
  createdFrom: z.string().trim().max(40).optional(),
  createdTo: z.string().trim().max(40).optional(),
  lastLoginFrom: z.string().trim().max(40).optional(),
  lastLoginTo: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z
    .enum([
      "created_desc",
      "created_asc",
      "last_login_desc",
      "last_login_asc",
      "paid_desc",
      "orders_desc",
      "credits_desc",
    ])
    .optional(),
});

const roleCodesSchema = z.array(z.string().trim().min(1).max(80)).max(20);

const createUserSchema = z
  .object({
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    password: z.string().min(8).max(1000).optional(),
    generatePassword: z.boolean().optional(),
    displayName: z.string().trim().max(80).nullable().optional(),
    roleCodes: roleCodesSchema.optional(),
    removeDefaultUserRole: z.boolean().optional(),
  })
  .refine((value) => value.password || value.generatePassword === true, {
    message: "password or generatePassword is required",
    path: ["password"],
  });

const updateUserSchema = z
  .object({
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().max(40).nullable().optional(),
    displayName: z.string().trim().max(80).nullable().optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });

const disableUserSchema = z
  .object({
    revokeSessions: z.boolean().optional(),
  })
  .optional();

const resetPasswordSchema = z
  .object({
    temporaryPassword: z.string().min(8).max(1000).optional(),
    generatePassword: z.boolean().optional(),
    revokeSessions: z.boolean().optional(),
  })
  .optional();

const updateRolesSchema = z.object({
  roleCodes: roleCodesSchema,
  removeDefaultUserRole: z.boolean().optional(),
});

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

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
  return reply.status(statusCode).send({ error, message });
}

function toAuditJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseBoolean(value: "true" | "false" | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "true";
}

function roleCodesNeedAdminManage(roleCodes: readonly string[]): boolean {
  return roleCodes.some((roleCode) =>
    ["admin", "super_admin"].includes(roleCode.trim().toLowerCase()),
  );
}

function userDetailHasAdminAccess(user: Pick<AdminUserDetail, "permissions" | "roleCodes">): boolean {
  return (
    user.permissions.includes("admin.manage") ||
    user.roleCodes.some((roleCode) => ["admin", "super_admin"].includes(roleCode))
  );
}

function removesKnownAdminRole(roleCodes: readonly string[]): boolean {
  return !roleCodes.some((roleCode) =>
    ["admin", "super_admin"].includes(roleCode.trim().toLowerCase()),
  );
}

function isSelfAdminAccessRemoval(input: {
  readonly context: AuthenticatedRequestContext;
  readonly targetUserId: string;
  readonly before: AdminUserDetail;
  readonly nextRoleCodes: readonly string[];
}): boolean {
  return (
    input.context.principal.user.id === input.targetUserId &&
    userDetailHasAdminAccess(input.before) &&
    removesKnownAdminRole(input.nextRoleCodes)
  );
}

async function requireUserConsolePermission(
  request: Parameters<typeof requireAnyAdminPermission>[0],
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  authConfig: AuthConfig,
): Promise<AuthenticatedRequestContext | null> {
  return requireAnyAdminPermission(request, reply, client, authConfig, [
    "users.manage",
    "admin.manage",
  ]);
}

function sendAdminUserError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AdminUserNotFoundError) {
    return sendError(reply, 404, "user_not_found", "未找到该用户。");
  }
  if (error instanceof DuplicateUserEmailError) {
    return sendError(reply, 409, "duplicate_email", "邮箱已被其他用户使用。");
  }
  if (error instanceof DuplicateUserPhoneError) {
    return sendError(reply, 409, "duplicate_phone", "手机号已被其他用户使用。");
  }
  if (error instanceof MissingUserIdentifierError) {
    return sendError(reply, 400, "missing_user_identifier", "邮箱或手机号至少需要保留一个。");
  }
  if (error instanceof LastAdminAccessChangeError) {
    return sendError(reply, 409, "last_admin_blocked", "不能禁用或移除最后一个管理员入口。");
  }
  if (error instanceof InvalidAdminRoleAssignmentError) {
    return sendError(reply, 400, "invalid_role_assignment", error.message);
  }
  if (error instanceof Error && /password/i.test(error.message)) {
    return sendError(reply, 400, "invalid_password", error.message);
  }
  throw error;
}

async function writeUserAudit(input: {
  readonly client?: DatabaseClient;
  readonly context: AuthenticatedRequestContext;
  readonly action: string;
  readonly userId: string;
  readonly beforeJson?: JsonValue | null;
  readonly afterJson?: JsonValue | null;
  readonly request: FastifyRequest;
}) {
  await createAuditLog(
    {
      actorUserId: input.context.auditActorUserId,
      action: input.action,
      targetType: "user",
      targetId: input.userId,
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
      ipAddress: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
    },
    { client: input.client },
  );
}

export function registerAdminUserRoutes(
  app: FastifyInstance,
  options: AdminUserRoutesOptions,
): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;

  app.get("/admin/users", async (request, reply) => {
    const auth = await requireUserConsolePermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedQuery = listUsersQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }
    const result = await listAdminUsers(
      {
        q: parsedQuery.data.q,
        status: parsedQuery.data.status,
        role: parsedQuery.data.role,
        hasOrders: parseBoolean(parsedQuery.data.hasOrders),
        hasCredits: parseBoolean(parsedQuery.data.hasCredits),
        createdFrom: parseDate(parsedQuery.data.createdFrom),
        createdTo: parseDate(parsedQuery.data.createdTo),
        lastLoginFrom: parseDate(parsedQuery.data.lastLoginFrom),
        lastLoginTo: parseDate(parsedQuery.data.lastLoginTo),
        page: parsedQuery.data.page,
        pageSize: parsedQuery.data.pageSize,
        sort: parsedQuery.data.sort,
      },
      { client },
    );
    return result;
  });

  app.post("/admin/users", async (request, reply) => {
    const auth = await requireUserConsolePermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedBody = createUserSchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }
    if (
      parsedBody.data.roleCodes &&
      roleCodesNeedAdminManage(parsedBody.data.roleCodes) &&
      !contextHasAdminManage(auth)
    ) {
      return sendError(reply, 403, "admin_role_requires_admin_manage", "分配管理员角色需要 admin.manage。");
    }

    const generatedPassword = parsedBody.data.password
      ? null
      : generateAdminTemporaryPassword();
    const password = parsedBody.data.password ?? generatedPassword;
    if (!password) {
      return sendError(reply, 400, "password_required", "需要设置密码或生成临时密码。");
    }
    try {
      const user = await createAdminManagedUser(
        {
          email: parsedBody.data.email,
          phone: parsedBody.data.phone,
          password,
          displayName: parsedBody.data.displayName,
          roleCodes: parsedBody.data.roleCodes,
          removeDefaultUserRole: parsedBody.data.removeDefaultUserRole,
        },
        { client },
      );
      await writeUserAudit({
        client,
        context: auth,
        action: "admin.user.create",
        userId: user.profile.id,
        afterJson: adminUserAuditSnapshot(user),
        request,
      });
      return reply.status(201).send({
        user,
        generatedPassword,
      });
    } catch (error) {
      return sendAdminUserError(reply, error);
    }
  });

  app.get<{ Params: { userId: string } }>("/admin/users/:userId", async (request, reply) => {
    const auth = await requireUserConsolePermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedParams = userIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    try {
      return { user: await getAdminUserDetail(parsedParams.data.userId, { client }) };
    } catch (error) {
      return sendAdminUserError(reply, error);
    }
  });

  app.patch<{ Params: { userId: string } }>("/admin/users/:userId", async (request, reply) => {
    const auth = await requireUserConsolePermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedParams = userIdParamsSchema.safeParse(request.params);
    const parsedBody = updateUserSchema.safeParse(request.body ?? {});
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }
    try {
      const before = await getAdminUserDetail(parsedParams.data.userId, { client });
      const user = await updateAdminManagedUser(
        {
          userId: parsedParams.data.userId,
          email: parsedBody.data.email,
          phone: parsedBody.data.phone,
          displayName: parsedBody.data.displayName,
          status: parsedBody.data.status as UserStatus | undefined,
        },
        { client },
      );
      await writeUserAudit({
        client,
        context: auth,
        action: "admin.user.update",
        userId: user.profile.id,
        beforeJson: adminUserAuditSnapshot(before),
        afterJson: adminUserAuditSnapshot(user),
        request,
      });
      return { user };
    } catch (error) {
      return sendAdminUserError(reply, error);
    }
  });

  app.post<{ Params: { userId: string } }>(
    "/admin/users/:userId/disable",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedBody = disableUserSchema.safeParse(request.body ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedBody.success) {
        return sendZodError(reply, parsedBody.error);
      }
      try {
        const before = await getAdminUserDetail(parsedParams.data.userId, { client });
        const result = await disableUserAccount(
          {
            userId: parsedParams.data.userId,
            revokeSessions: parsedBody.data?.revokeSessions,
          },
          { client },
        );
        await writeUserAudit({
          client,
          context: auth,
          action: "admin.user.disable",
          userId: result.user.profile.id,
          beforeJson: adminUserAuditSnapshot(before),
          afterJson: toAuditJson({
            user: adminUserAuditSnapshot(result.user),
            revokedSessionCount: result.revokedSessionCount,
          }),
          request,
        });
        return result;
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/admin/users/:userId/enable",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        const before = await getAdminUserDetail(parsedParams.data.userId, { client });
        const user = await enableUserAccount({ userId: parsedParams.data.userId }, { client });
        await writeUserAudit({
          client,
          context: auth,
          action: "admin.user.enable",
          userId: user.profile.id,
          beforeJson: adminUserAuditSnapshot(before),
          afterJson: adminUserAuditSnapshot(user),
          request,
        });
        return { user };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/admin/users/:userId/reset-password",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedBody = resetPasswordSchema.safeParse(request.body ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedBody.success) {
        return sendZodError(reply, parsedBody.error);
      }
      try {
        const result = await resetUserPasswordByAdmin(
          {
            userId: parsedParams.data.userId,
            password: parsedBody.data?.temporaryPassword,
            revokeSessions: parsedBody.data?.revokeSessions,
          },
          { client },
        );
        await writeUserAudit({
          client,
          context: auth,
          action: "admin.user.reset_password",
          userId: result.user.profile.id,
          afterJson: toAuditJson({
            generatedPasswordReturned: Boolean(result.generatedPassword),
            revokedSessionCount: result.revokedSessionCount,
          }),
          request,
        });
        return result;
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.post<{ Params: { userId: string } }>(
    "/admin/users/:userId/revoke-sessions",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        const result = await revokeUserSessionsByAdmin(
          { userId: parsedParams.data.userId },
          { client },
        );
        await writeUserAudit({
          client,
          context: auth,
          action: "admin.user.revoke_sessions",
          userId: parsedParams.data.userId,
          afterJson: toAuditJson({ revokedSessionCount: result.revokedSessionCount }),
          request,
        });
        return result;
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.patch<{ Params: { userId: string } }>(
    "/admin/users/:userId/roles",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedBody = updateRolesSchema.safeParse(request.body ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedBody.success) {
        return sendZodError(reply, parsedBody.error);
      }
      if (roleCodesNeedAdminManage(parsedBody.data.roleCodes) && !contextHasAdminManage(auth)) {
        return sendError(reply, 403, "admin_role_requires_admin_manage", "分配管理员角色需要 admin.manage。");
      }
      try {
        const before = await getAdminUserDetail(parsedParams.data.userId, { client });
        if (
          isSelfAdminAccessRemoval({
            context: auth,
            targetUserId: parsedParams.data.userId,
            before,
            nextRoleCodes: parsedBody.data.roleCodes,
          })
        ) {
          return sendError(
            reply,
            409,
            "self_admin_access_change_blocked",
            "Admins cannot remove their own admin access from this console.",
          );
        }
        const user = await updateUserRolesByAdmin(
          {
            userId: parsedParams.data.userId,
            roleCodes: parsedBody.data.roleCodes,
            removeDefaultUserRole: parsedBody.data.removeDefaultUserRole,
            actorCanManageAdminRoles: contextHasAdminManage(auth),
          },
          { client },
        );
        await writeUserAudit({
          client,
          context: auth,
          action: "admin.user.roles_update",
          userId: user.profile.id,
          beforeJson: adminUserAuditSnapshot(before),
          afterJson: adminUserAuditSnapshot(user),
          request,
        });
        return { user };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/admin/users/:userId/orders",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedQuery = limitQuerySchema.safeParse(request.query ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedQuery.success) {
        return sendZodError(reply, parsedQuery.error);
      }
      try {
        return {
          items: await listUserPaymentOrdersForAdmin(
            { userId: parsedParams.data.userId, limit: parsedQuery.data.limit },
            { client },
          ),
        };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/admin/users/:userId/forecast-history",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedQuery = limitQuerySchema.safeParse(request.query ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedQuery.success) {
        return sendZodError(reply, parsedQuery.error);
      }
      try {
        return {
          items: await listUserForecastHistoryForAdmin(
            { userId: parsedParams.data.userId, limit: parsedQuery.data.limit },
            { client },
          ),
        };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/admin/users/:userId/entitlements",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        return {
          items: await listUserEntitlementsForAdmin(
            { userId: parsedParams.data.userId },
            { client },
          ),
        };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/admin/users/:userId/credit-ledger",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        return {
          items: await listUserCreditLedgerForAdmin(
            { userId: parsedParams.data.userId },
            { client },
          ),
        };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/admin/users/:userId/sessions",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedQuery = limitQuerySchema.safeParse(request.query ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedQuery.success) {
        return sendZodError(reply, parsedQuery.error);
      }
      try {
        return {
          items: await listUserSessionsForAdmin(
            { userId: parsedParams.data.userId, limit: parsedQuery.data.limit },
            { client },
          ),
        };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );

  app.get<{ Params: { userId: string } }>(
    "/admin/users/:userId/audit-logs",
    async (request, reply) => {
      const auth = await requireUserConsolePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = userIdParamsSchema.safeParse(request.params);
      const parsedQuery = limitQuerySchema.safeParse(request.query ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedQuery.success) {
        return sendZodError(reply, parsedQuery.error);
      }
      try {
        return {
          items: await listUserAuditLogsForAdmin(
            { userId: parsedParams.data.userId, limit: parsedQuery.data.limit },
            { client },
          ),
        };
      } catch (error) {
        return sendAdminUserError(reply, error);
      }
    },
  );
}
