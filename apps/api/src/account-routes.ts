import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  clearUserForecastHistory,
  consumeAuthVerificationCode,
  createAuditLog,
  createAuthVerificationCode,
  deleteUserForecastHistory,
  DuplicateUserEmailError,
  DuplicateUserPhoneError,
  findLatestActiveAuthVerificationCode,
  getUserAccountByIdentifier,
  getUserAuthContextWithPasswordById,
  incrementAuthVerificationAttempt,
  LastAdminAccountDeletionError,
  listUserForecastHistory,
  normalizeUserEmail,
  normalizeUserPhone,
  revokeUserSessions,
  saveUserForecastHistory,
  softDeleteUserAccount,
  updateUserEmail,
  updateUserPassword,
  updateUserPhone,
  verifyAuthVerificationCode,
  verifyPassword,
} from "@photo-weather/db";
import type {
  AuthVerificationChannel,
  AuthVerificationPurpose,
  AuthenticatedPrincipal,
  DatabaseClient,
  JsonValue,
  UserForecastHistoryRecord,
} from "@photo-weather/db";
import { forecastQueryInputSchema } from "@photo-weather/shared";
import type { ForecastQueryInput } from "@photo-weather/shared";
import { z } from "zod";
import type { AuthConfig, AuthenticatedRequestContext } from "./auth-routes.js";
import { authenticateRequest } from "./auth-routes.js";
import {
  createVerificationSender,
  type VerificationSender,
  type VerificationSenderResult,
} from "./verification-senders.js";

export type AccountRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly verificationSender?: VerificationSender;
};

type PublicAuthError = {
  readonly statusCode?: number;
  readonly code?: string;
};

const authRequiredMessage = "请先登录后再操作。";
const invalidPasswordMessage = "当前密码不正确。";
const invalidVerificationCodeMessage = "验证码错误或已过期，请重新获取。";
const duplicateEmailMessage = "该邮箱已被其他账户绑定。";
const duplicatePhoneMessage = "该手机号已被其他账户绑定。";

const accountEmailSchema = z
  .string()
  .trim()
  .email("请输入有效邮箱地址。")
  .max(200, "邮箱地址过长。");

const accountPhoneSchema = z.string().trim().min(1, "请输入手机号。").max(40, "手机号过长。");

const verificationCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "请输入 6 位数字验证码。");

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码。").max(1000, "密码长度超过限制。"),
    newPassword: z.string().min(8, "新密码至少需要 8 个字符。").max(1000, "密码长度超过限制。"),
    confirmNewPassword: z.string().min(1, "请确认新密码。").optional(),
    currentRefreshToken: z.string().min(20).optional(),
  })
  .refine((value) => !value.confirmNewPassword || value.newPassword === value.confirmNewPassword, {
    message: "两次输入的新密码不一致。",
    path: ["confirmNewPassword"],
  });

const sendEmailCodeSchema = z.object({
  email: accountEmailSchema,
});

const confirmEmailSchema = z.object({
  email: accountEmailSchema,
  code: verificationCodeSchema,
  currentPassword: z.string().min(1, "请输入当前密码。").max(1000, "密码长度超过限制。"),
});

const sendPhoneCodeSchema = z.object({
  phone: accountPhoneSchema,
});

const confirmPhoneSchema = z.object({
  phone: accountPhoneSchema,
  code: verificationCodeSchema,
  currentPassword: z.string().min(1, "请输入当前密码。").max(1000, "密码长度超过限制。"),
});

const deleteAccountSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码。").max(1000, "密码长度超过限制。"),
    confirmation: z.boolean().optional(),
    confirmText: z.string().trim().optional(),
  })
  .refine((value) => value.confirmation === true || value.confirmText === "注销账户", {
    message: "请确认注销账户。",
    path: ["confirmation"],
  });

const historySummarySchema = z
  .object({
    overallScore: z.number().finite().nullable().optional(),
    recommendationLabel: z.string().trim().max(80).nullable().optional(),
    bestWindowStart: z.string().trim().max(80).nullable().optional(),
    bestWindowEnd: z.string().trim().max(80).nullable().optional(),
  })
  .optional();

const saveForecastHistorySchema = z.object({
  query: forecastQueryInputSchema,
  resultSummary: historySummarySchema,
});

const listForecastHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const historyIdParamsSchema = z.object({
  id: z.string().trim().min(1).max(120),
});

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function readAuthVerificationSeconds(
  source: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
): number {
  try {
    return parsePositiveInteger(source[key], fallback, key);
  } catch {
    return fallback;
  }
}

function verificationCodeTtlSeconds(source: NodeJS.ProcessEnv): number {
  return readAuthVerificationSeconds(source, "AUTH_VERIFICATION_CODE_TTL_SECONDS", 10 * 60);
}

function verificationResendCooldownSeconds(source: NodeJS.ProcessEnv): number {
  return readAuthVerificationSeconds(source, "AUTH_VERIFICATION_RESEND_SECONDS", 60);
}

function verificationMaxAttempts(source: NodeJS.ProcessEnv): number {
  return readAuthVerificationSeconds(source, "AUTH_VERIFICATION_MAX_ATTEMPTS", 5);
}

function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function targetMasked(channel: AuthVerificationChannel, target: string): string {
  if (channel === "email") {
    const [name, domain] = target.split("@");
    if (!name || !domain) {
      return target;
    }
    const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
    return `${visible}***@${domain}`;
  }

  return target.length === 11 ? `${target.slice(0, 3)}****${target.slice(-4)}` : target;
}

function shouldExposeMockCode(
  env: NodeJS.ProcessEnv,
  sendResult: Pick<VerificationSenderResult, "mode">,
): boolean {
  return (
    env.NODE_ENV !== "production" &&
    env.AUTH_VERIFICATION_EXPOSE_MOCK_CODE === "true" &&
    sendResult.mode === "mock"
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

function publicPrincipalResponse(principal: AuthenticatedPrincipal) {
  return {
    user: principal.user,
    profile: principal.profile,
    roles: principal.roles,
    roleCodes: principal.roleCodes,
    permissions: principal.permissions,
    isAdmin:
      principal.permissions.includes("admin.manage") ||
      principal.roleCodes.some((roleCode) =>
        ["admin", "super_admin"].includes(roleCode.trim().toLowerCase()),
      ),
  };
}

function toAuditJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

async function recordAccountAudit(
  app: FastifyInstance,
  input: {
    readonly client?: DatabaseClient;
    readonly actorUserId: string | null;
    readonly action: string;
    readonly targetType?: string;
    readonly targetId?: string | null;
    readonly afterJson?: unknown;
    readonly ipAddress?: string;
    readonly userAgent?: string | null;
  },
): Promise<void> {
  try {
    await createAuditLog(
      {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType ?? "account",
        targetId: input.targetId ?? input.actorUserId,
        afterJson: input.afterJson === undefined ? null : toAuditJson(input.afterJson),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      { client: input.client },
    );
  } catch (error) {
    app.log.warn({ err: error }, "Failed to write account audit log");
  }
}

async function requireAccountAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  authConfig: AuthConfig,
): Promise<AuthenticatedRequestContext | null> {
  try {
    return await authenticateRequest(request, client, authConfig);
  } catch (error) {
    const authError = error as PublicAuthError;
    if (authError.statusCode === 401 || authError.statusCode === 403) {
      reply.status(authError.statusCode).send({
        error: authError.code ?? "unauthenticated",
        message: authRequiredMessage,
      });
      return null;
    }

    throw error;
  }
}

function normalizeEmailTarget(email: string): string | null {
  const normalized = normalizeUserEmail(email);
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizePhoneTarget(phone: string): string | null {
  const normalized = normalizeUserPhone(phone);
  return normalized && /^1[3-9]\d{9}$/.test(normalized) ? normalized : null;
}

async function isContactTakenByAnotherUser(input: {
  readonly target: string;
  readonly userId: string;
  readonly client?: DatabaseClient;
}): Promise<boolean> {
  const existing = await getUserAccountByIdentifier(input.target, { client: input.client });
  return Boolean(existing && existing.id !== input.userId);
}

async function verifyCurrentPasswordForUser(input: {
  readonly userId: string;
  readonly password: string;
  readonly client?: DatabaseClient;
}): Promise<boolean> {
  const authContext = await getUserAuthContextWithPasswordById(input.userId, {
    client: input.client,
  });
  return authContext ? verifyPassword(input.password, authContext.passwordHash) : false;
}

async function sendContactVerificationCode(
  app: FastifyInstance,
  input: {
    readonly request: FastifyRequest;
    readonly reply: FastifyReply;
    readonly context: AuthenticatedRequestContext;
    readonly client?: DatabaseClient;
    readonly authConfig: AuthConfig;
    readonly env: NodeJS.ProcessEnv;
    readonly verificationSender: VerificationSender;
    readonly channel: AuthVerificationChannel;
    readonly purpose: AuthVerificationPurpose;
    readonly target: string;
  },
) {
  if (
    await isContactTakenByAnotherUser({
      target: input.target,
      userId: input.context.principal.user.id,
      client: input.client,
    })
  ) {
    return input.reply.status(409).send({
      error: input.channel === "email" ? "duplicate_email" : "duplicate_phone",
      message: input.channel === "email" ? duplicateEmailMessage : duplicatePhoneMessage,
    });
  }

  const now = new Date();
  const cooldownSeconds = verificationResendCooldownSeconds(input.env);
  const existing = await findLatestActiveAuthVerificationCode(
    {
      channel: input.channel,
      purpose: input.purpose,
      target: input.target,
      now,
    },
    { client: input.client },
  );
  if (existing) {
    const resendAt = existing.createdAt.getTime() + cooldownSeconds * 1000;
    if (resendAt > now.getTime()) {
      return input.reply.status(429).send({
        error: "verification_resend_cooldown",
        channel: input.channel,
        targetMasked: targetMasked(input.channel, input.target),
        resendAfterSeconds: Math.ceil((resendAt - now.getTime()) / 1000),
        message: "验证码发送过于频繁，请稍后再试。",
      });
    }
  }

  const code = generateVerificationCode();
  const ttlSeconds = verificationCodeTtlSeconds(input.env);
  await createAuthVerificationCode(
    {
      channel: input.channel,
      purpose: input.purpose,
      target: input.target,
      code,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      ipAddress: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
      secret: input.authConfig.jwtSecret,
      env: input.env,
    },
    { client: input.client },
  );

  const sendResult = await input.verificationSender.send({
    channel: input.channel,
    purpose: input.purpose,
    target: input.target,
    code,
  });
  if (!sendResult.success) {
    return input.reply.status(503).send({
      error: sendResult.error ?? "verification_sender_unavailable",
      channel: input.channel,
      mode: sendResult.mode,
      message: sendResult.messageZh,
    });
  }

  await recordAccountAudit(app, {
    client: input.client,
    actorUserId: input.context.auditActorUserId,
    action: input.channel === "email" ? "account.email.code_sent" : "account.phone.code_sent",
    afterJson: {
      channel: input.channel,
      targetMasked: targetMasked(input.channel, input.target),
    },
    ipAddress: input.request.ip,
    userAgent: input.request.headers["user-agent"] ?? null,
  });

  return input.reply.send({
    success: true,
    channel: input.channel,
    targetMasked: targetMasked(input.channel, input.target),
    expiresInSeconds: ttlSeconds,
    resendAfterSeconds: cooldownSeconds,
    mode: sendResult.mode,
    ...(shouldExposeMockCode(input.env, sendResult) ? { mockCode: code } : {}),
  });
}

async function verifyContactCode(
  app: FastifyInstance,
  input: {
    readonly request: FastifyRequest;
    readonly client?: DatabaseClient;
    readonly authConfig: AuthConfig;
    readonly env: NodeJS.ProcessEnv;
    readonly channel: AuthVerificationChannel;
    readonly purpose: AuthVerificationPurpose;
    readonly target: string;
    readonly code: string;
    readonly auditActorUserId: string | null;
  },
): Promise<boolean> {
  const now = new Date();
  const verificationCode = await findLatestActiveAuthVerificationCode(
    {
      channel: input.channel,
      purpose: input.purpose,
      target: input.target,
      now,
    },
    { client: input.client },
  );

  const auditFailure = async () => {
    await recordAccountAudit(app, {
      client: input.client,
      actorUserId: input.auditActorUserId,
      action:
        input.channel === "email" ? "account.email.verify_failure" : "account.phone.verify_failure",
      afterJson: {
        channel: input.channel,
        targetMasked: targetMasked(input.channel, input.target),
      },
      ipAddress: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
    });
  };

  if (!verificationCode || verificationCode.attemptCount >= verificationMaxAttempts(input.env)) {
    await auditFailure();
    return false;
  }

  if (
    !verifyAuthVerificationCode(verificationCode, {
      code: input.code,
      secret: input.authConfig.jwtSecret,
      env: input.env,
    })
  ) {
    await incrementAuthVerificationAttempt({ id: verificationCode.id }, { client: input.client });
    await auditFailure();
    return false;
  }

  const consumed = await consumeAuthVerificationCode(
    {
      id: verificationCode.id,
      now,
    },
    { client: input.client },
  );
  if (!consumed) {
    await auditFailure();
    return false;
  }

  return true;
}

function stableHistoryQueryKey(query: ForecastQueryInput): string {
  return JSON.stringify({
    name: query.name,
    source: query.source,
    coordinateSource: query.coordinateSource ?? null,
    horizon: query.horizon,
    target: query.target,
    timezone: query.timezone ?? null,
    latitudeGcj02: roundHistoryNumber(query.latitudeGcj02, 7),
    longitudeGcj02: roundHistoryNumber(query.longitudeGcj02, 7),
    latitudeWgs84: roundHistoryNumber(query.latitudeWgs84, 7),
    longitudeWgs84: roundHistoryNumber(query.longitudeWgs84, 7),
    elevationMeters:
      typeof query.elevationMeters === "number"
        ? roundHistoryNumber(query.elevationMeters, 2)
        : null,
    elevationSource: query.elevationSource ?? null,
    elevationConfidence: query.elevationConfidence ?? null,
    locationId: query.locationId ?? null,
    photoSpotId: query.photoSpotId ?? null,
  });
}

function roundHistoryNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compactJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function optionalFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function optionalTrimmedString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function optionalDate(value: string | null | undefined): Date | null {
  const trimmed = optionalTrimmedString(value);
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function historyResponse(record: UserForecastHistoryRecord) {
  return {
    id: record.id,
    locationName: record.locationName,
    target: record.target,
    horizon: record.horizon,
    timezone: record.timezone,
    latitudeGcj02: record.latitudeGcj02,
    longitudeGcj02: record.longitudeGcj02,
    latitudeWgs84: record.latitudeWgs84,
    longitudeWgs84: record.longitudeWgs84,
    elevationMeters: record.elevationMeters,
    locationId: record.locationId,
    photoSpotId: record.photoSpotId,
    queryJson: record.queryJson,
    resultSummaryJson: record.resultSummaryJson,
    overallScore: record.overallScore,
    recommendationLabel: record.recommendationLabel,
    bestWindowStart: record.bestWindowStart?.toISOString() ?? null,
    bestWindowEnd: record.bestWindowEnd?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function registerAccountRoutes(app: FastifyInstance, options: AccountRoutesOptions): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;
  const env = options.env ?? process.env;
  const verificationSender =
    options.verificationSender ?? createVerificationSender({ dbClient: client, env });

  app.post("/account/change-password", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = changePasswordSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const passwordOk = await verifyCurrentPasswordForUser({
      userId: context.principal.user.id,
      password: parsedBody.data.currentPassword,
      client,
    });
    if (!passwordOk) {
      await recordAccountAudit(app, {
        client,
        actorUserId: context.auditActorUserId,
        action: "account.password.change_failure",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });
      return reply.status(401).send({
        error: "invalid_current_password",
        message: invalidPasswordMessage,
      });
    }

    const principal = await updateUserPassword(
      {
        userId: context.principal.user.id,
        password: parsedBody.data.newPassword,
      },
      { client },
    );
    const revokedSessionCount = await revokeUserSessions(
      {
        userId: context.principal.user.id,
        exceptRefreshToken: parsedBody.data.currentRefreshToken,
      },
      { client },
    );

    await recordAccountAudit(app, {
      client,
      actorUserId: context.auditActorUserId,
      action: "account.password.changed",
      afterJson: { revokedSessionCount },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.send(publicPrincipalResponse(principal));
  });

  app.post("/account/email/send-code", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = sendEmailCodeSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const target = normalizeEmailTarget(parsedBody.data.email);
    if (!target) {
      return reply.status(400).send({
        error: "invalid_email",
        message: "请输入有效邮箱地址。",
      });
    }

    return sendContactVerificationCode(app, {
      request,
      reply,
      context,
      client,
      authConfig,
      env,
      verificationSender,
      channel: "email",
      purpose: "change_email",
      target,
    });
  });

  app.post("/account/email/confirm", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = confirmEmailSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const target = normalizeEmailTarget(parsedBody.data.email);
    if (!target) {
      return reply.status(400).send({
        error: "invalid_email",
        message: "请输入有效邮箱地址。",
      });
    }
    if (
      await isContactTakenByAnotherUser({
        target,
        userId: context.principal.user.id,
        client,
      })
    ) {
      return reply.status(409).send({
        error: "duplicate_email",
        message: duplicateEmailMessage,
      });
    }
    if (
      !(await verifyCurrentPasswordForUser({
        userId: context.principal.user.id,
        password: parsedBody.data.currentPassword,
        client,
      }))
    ) {
      return reply.status(401).send({
        error: "invalid_current_password",
        message: invalidPasswordMessage,
      });
    }
    if (
      !(await verifyContactCode(app, {
        request,
        client,
        authConfig,
        env,
        channel: "email",
        purpose: "change_email",
        target,
        code: parsedBody.data.code,
        auditActorUserId: context.auditActorUserId,
      }))
    ) {
      return reply.status(400).send({
        error: "verification_code_invalid",
        message: invalidVerificationCodeMessage,
      });
    }

    try {
      const principal = await updateUserEmail(
        {
          userId: context.principal.user.id,
          email: target,
        },
        { client },
      );
      await recordAccountAudit(app, {
        client,
        actorUserId: context.auditActorUserId,
        action: "account.email.changed",
        afterJson: { targetMasked: targetMasked("email", target) },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send(publicPrincipalResponse(principal));
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        return reply.status(409).send({
          error: "duplicate_email",
          message: duplicateEmailMessage,
        });
      }
      throw error;
    }
  });

  app.post("/account/phone/send-code", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = sendPhoneCodeSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const target = normalizePhoneTarget(parsedBody.data.phone);
    if (!target) {
      return reply.status(400).send({
        error: "invalid_phone",
        message: "请输入有效中国大陆手机号。",
      });
    }

    return sendContactVerificationCode(app, {
      request,
      reply,
      context,
      client,
      authConfig,
      env,
      verificationSender,
      channel: "sms",
      purpose: "change_phone",
      target,
    });
  });

  app.post("/account/phone/confirm", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = confirmPhoneSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const target = normalizePhoneTarget(parsedBody.data.phone);
    if (!target) {
      return reply.status(400).send({
        error: "invalid_phone",
        message: "请输入有效中国大陆手机号。",
      });
    }
    if (
      await isContactTakenByAnotherUser({
        target,
        userId: context.principal.user.id,
        client,
      })
    ) {
      return reply.status(409).send({
        error: "duplicate_phone",
        message: duplicatePhoneMessage,
      });
    }
    if (
      !(await verifyCurrentPasswordForUser({
        userId: context.principal.user.id,
        password: parsedBody.data.currentPassword,
        client,
      }))
    ) {
      return reply.status(401).send({
        error: "invalid_current_password",
        message: invalidPasswordMessage,
      });
    }
    if (
      !(await verifyContactCode(app, {
        request,
        client,
        authConfig,
        env,
        channel: "sms",
        purpose: "change_phone",
        target,
        code: parsedBody.data.code,
        auditActorUserId: context.auditActorUserId,
      }))
    ) {
      return reply.status(400).send({
        error: "verification_code_invalid",
        message: invalidVerificationCodeMessage,
      });
    }

    try {
      const principal = await updateUserPhone(
        {
          userId: context.principal.user.id,
          phone: target,
        },
        { client },
      );
      await recordAccountAudit(app, {
        client,
        actorUserId: context.auditActorUserId,
        action: "account.phone.changed",
        afterJson: { targetMasked: targetMasked("sms", target) },
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.send(publicPrincipalResponse(principal));
    } catch (error) {
      if (error instanceof DuplicateUserPhoneError) {
        return reply.status(409).send({
          error: "duplicate_phone",
          message: duplicatePhoneMessage,
        });
      }
      throw error;
    }
  });

  app.post("/account/delete", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = deleteAccountSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    if (
      !(await verifyCurrentPasswordForUser({
        userId: context.principal.user.id,
        password: parsedBody.data.currentPassword,
        client,
      }))
    ) {
      return reply.status(401).send({
        error: "invalid_current_password",
        message: invalidPasswordMessage,
      });
    }

    await recordAccountAudit(app, {
      client,
      actorUserId: context.auditActorUserId,
      action: "account.delete.requested",
      afterJson: {
        userId: context.principal.user.id,
        roleCodes: context.principal.roleCodes,
      },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    try {
      await softDeleteUserAccount({ userId: context.principal.user.id }, { client });
    } catch (error) {
      if (error instanceof LastAdminAccountDeletionError) {
        return reply.status(409).send({
          error: "last_admin_delete_blocked",
          message: "当前账户是最后一个管理员入口，不能注销。",
        });
      }
      throw error;
    }

    const revokedSessionCount = await revokeUserSessions(
      { userId: context.principal.user.id },
      { client },
    );
    await recordAccountAudit(app, {
      client,
      actorUserId: context.auditActorUserId,
      action: "account.delete.completed",
      afterJson: { revokedSessionCount },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.send({ success: true });
  });

  app.get("/account/forecast-history", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedQuery = listForecastHistoryQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }

    const history = await listUserForecastHistory(
      {
        userId: context.principal.user.id,
        limit: parsedQuery.data.limit ?? 20,
      },
      { client },
    );

    return reply.send({
      items: history.map(historyResponse),
    });
  });

  app.post("/account/forecast-history", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = saveForecastHistorySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const query = parsedBody.data.query;
    const resultSummary = parsedBody.data.resultSummary;
    const compactSummary = {
      overallScore: optionalFiniteNumber(resultSummary?.overallScore),
      recommendationLabel: optionalTrimmedString(resultSummary?.recommendationLabel),
      bestWindowStart: optionalTrimmedString(resultSummary?.bestWindowStart),
      bestWindowEnd: optionalTrimmedString(resultSummary?.bestWindowEnd),
    };
    const record = await saveUserForecastHistory(
      {
        userId: context.principal.user.id,
        locationName: query.name,
        target: query.target,
        horizon: query.horizon,
        timezone: query.timezone ?? null,
        latitudeGcj02: query.latitudeGcj02,
        longitudeGcj02: query.longitudeGcj02,
        latitudeWgs84: query.latitudeWgs84,
        longitudeWgs84: query.longitudeWgs84,
        elevationMeters: query.elevationMeters ?? null,
        locationId: query.locationId ?? null,
        photoSpotId: query.photoSpotId ?? null,
        queryKey: stableHistoryQueryKey(query),
        queryJson: compactJson(query),
        resultSummaryJson: compactJson(compactSummary),
        overallScore: compactSummary.overallScore,
        recommendationLabel: compactSummary.recommendationLabel,
        bestWindowStart: optionalDate(compactSummary.bestWindowStart),
        bestWindowEnd: optionalDate(compactSummary.bestWindowEnd),
      },
      { client },
    );

    return reply.status(201).send(historyResponse(record));
  });

  app.delete("/account/forecast-history", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const deletedCount = await clearUserForecastHistory(
      {
        userId: context.principal.user.id,
      },
      { client },
    );
    await recordAccountAudit(app, {
      client,
      actorUserId: context.auditActorUserId,
      action: "account.forecast_history.cleared",
      afterJson: { deletedCount },
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.send({ success: true, deletedCount });
  });

  app.delete("/account/forecast-history/:id", async (request, reply) => {
    const context = await requireAccountAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedParams = historyIdParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }

    const deleted = await deleteUserForecastHistory(
      {
        userId: context.principal.user.id,
        id: parsedParams.data.id,
      },
      { client },
    );

    if (!deleted) {
      return reply.status(404).send({
        error: "history_not_found",
        message: "未找到该查询历史。",
      });
    }

    return reply.send({ success: true });
  });
}
