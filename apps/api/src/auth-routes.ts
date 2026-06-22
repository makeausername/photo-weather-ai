import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  consumeAuthVerificationCode,
  createAuditLog,
  createAuthVerificationCode,
  createPublicUserAccount,
  createRefreshToken,
  createUserSession,
  DuplicateUserEmailError,
  DuplicateUserPhoneError,
  findLatestActiveAuthVerificationCode,
  getActiveUserSessionByRefreshToken,
  getUserAccountByIdentifier,
  getUserAuthContextByIdentifier,
  getUserAuthContextById,
  hashRefreshToken,
  incrementAuthVerificationAttempt,
  normalizeUserEmail,
  normalizeUserPhone,
  principalHasAdminRole,
  requiredAdminPermissions,
  revokeUserSessionByRefreshToken,
  touchUserLastLogin,
  verifyAuthVerificationCode,
  verifyPassword,
} from "@photo-weather/db";
import type {
  AuthVerificationChannel,
  AuthenticatedPrincipal,
  DatabaseClient,
  JsonValue,
} from "@photo-weather/db";
import { z } from "zod";
import {
  createVerificationSender,
  type VerificationSender,
  type VerificationSenderResult,
} from "./verification-senders.js";
import {
  tencentCaptchaProviderCode,
  verifyTencentCaptcha,
  type CaptchaVerifyAction,
} from "./captcha-provider.js";

export type AuthConfig = {
  readonly jwtSecret: string;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlDays: number;
  readonly adminAuthBypass: boolean;
};

export type AuthenticatedRequestContext = {
  readonly principal: AuthenticatedPrincipal;
  readonly auditActorUserId: string | null;
  readonly mode: "jwt" | "dev_bypass";
};

export type RequirePermissionOptions = {
  readonly onAuthFailure?: (error: {
    readonly statusCode: 401 | 403;
    readonly code: string;
    readonly message: string;
  }) => unknown;
};

export type AuthRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly verificationSender?: VerificationSender;
  readonly captchaFetcher?: typeof fetch;
};

type AccessTokenPayload = {
  readonly sub: string;
  readonly type: "access";
  readonly iat: number;
  readonly exp: number;
};

class ApiAuthError extends Error {
  constructor(
    readonly statusCode: 401 | 403,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const invalidCredentialsMessage = "邮箱、手机号或密码不正确。";
export const loginServiceUnavailableMessage = "登录服务暂时不可用，请稍后重试或联系管理员。";
export const captchaRequiredMessage = "请先完成安全验证。";

const captchaTokenSchema = z.object({
  providerCode: z.literal(tencentCaptchaProviderCode),
  ticket: z.string().trim().min(1).max(4096),
  randstr: z.string().trim().min(1).max(256),
});

const loginSchema = z
  .object({
    identifier: z.string().trim().min(1, "请输入邮箱或手机号。").max(200).optional(),
    email: z.string().trim().email("请输入有效邮箱地址。").optional(),
    password: z.string().min(1, "请输入密码。").max(1000, "密码长度超过限制。"),
    captcha: captchaTokenSchema.optional(),
  })
  .refine((value) => value.identifier || value.email, {
    message: "请输入邮箱或手机号。",
    path: ["identifier"],
  });

const verificationChannelSchema = z.enum(["email", "sms"]);

const sendRegisterCodeSchema = z.object({
  channel: verificationChannelSchema,
  target: z.string().trim().min(1, "请输入邮箱或手机号。").max(200, "账号标识过长。"),
  captcha: captchaTokenSchema.optional(),
});

const registerConfirmSchema = z.object({
  channel: verificationChannelSchema,
  target: z.string().trim().min(1, "请输入邮箱或手机号。").max(200, "账号标识过长。"),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "请输入 6 位数字验证码。"),
  password: z.string().min(8, "密码至少需要 8 个字符。").max(1000, "密码长度超过限制。"),
  displayName: z
    .string()
    .trim()
    .max(40, "昵称最多 40 个字符。")
    .optional()
    .transform((value) => value || undefined),
  captcha: captchaTokenSchema.optional(),
});

type RegisterConfirmInput = z.infer<typeof registerConfirmSchema>;

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(20).optional(),
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

function normalizeRegisterTarget(channel: AuthVerificationChannel, target: string): string | null {
  if (channel === "email") {
    const normalized = normalizeUserEmail(target);
    return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
  }

  const normalized = normalizeUserPhone(target);
  return normalized && /^1[3-9]\d{9}$/.test(normalized) ? normalized : null;
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

async function isRegisterTargetTaken(target: string, client?: DatabaseClient): Promise<boolean> {
  const account = await getUserAccountByIdentifier(target, { client });
  return account !== null;
}

export function loadAuthConfig(source: NodeJS.ProcessEnv = process.env): AuthConfig {
  const jwtSecret = source.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to at least 32 characters.");
  }

  const adminAuthBypass = source.ADMIN_AUTH_BYPASS === "true";
  if (adminAuthBypass && source.NODE_ENV === "production") {
    throw new Error("ADMIN_AUTH_BYPASS cannot be enabled in production.");
  }

  return {
    jwtSecret,
    accessTokenTtlSeconds: parsePositiveInteger(
      source.JWT_ACCESS_TOKEN_TTL_SECONDS,
      15 * 60,
      "JWT_ACCESS_TOKEN_TTL_SECONDS",
    ),
    refreshTokenTtlDays: parsePositiveInteger(
      source.JWT_REFRESH_TOKEN_TTL_DAYS,
      30,
      "JWT_REFRESH_TOKEN_TTL_DAYS",
    ),
    adminAuthBypass,
  };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signTokenData(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function signAccessToken(
  userId: string,
  config: AuthConfig,
  now: Date = new Date(),
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    sub: userId,
    type: "access",
    iat: issuedAt,
    exp: issuedAt + config.accessTokenTtlSeconds,
  } satisfies AccessTokenPayload);
  const data = `${header}.${payload}`;

  return `${data}.${signTokenData(data, config.jwtSecret)}`;
}

function verifyAccessToken(
  token: string,
  config: AuthConfig,
  now: Date = new Date(),
): AccessTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new ApiAuthError(401, "invalid_token", "Invalid access token.");
  }

  const data = `${parts[0]}.${parts[1]}`;
  const expectedSignature = signTokenData(data, config.jwtSecret);
  if (!safeEqual(parts[2], expectedSignature)) {
    throw new ApiAuthError(401, "invalid_token", "Invalid access token.");
  }

  let payload: AccessTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AccessTokenPayload;
  } catch {
    throw new ApiAuthError(401, "invalid_token", "Invalid access token.");
  }

  if (payload.type !== "access" || !payload.sub || typeof payload.exp !== "number") {
    throw new ApiAuthError(401, "invalid_token", "Invalid access token.");
  }

  if (payload.exp <= Math.floor(now.getTime() / 1000)) {
    throw new ApiAuthError(401, "token_expired", "Access token expired.");
  }

  return payload;
}

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiAuthError(401, "missing_token", "Authorization bearer token is required.");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new ApiAuthError(401, "missing_token", "Authorization bearer token is required.");
  }

  return token;
}

function createDevBypassContext(): AuthenticatedRequestContext {
  const now = new Date(0);
  return {
    principal: {
      user: {
        id: "admin-auth-bypass",
        email: "admin-auth-bypass@local.invalid",
        phone: null,
        displayName: "Local auth bypass",
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      },
      profile: null,
      roles: [
        {
          id: "role-admin-auth-bypass",
          code: "admin",
          name: "admin",
          displayName: "管理员",
          description: "Local admin auth bypass.",
        },
      ],
      roleCodes: ["admin"],
      permissions: [...requiredAdminPermissions],
    },
    auditActorUserId: null,
    mode: "dev_bypass",
  };
}

export async function authenticateRequest(
  request: FastifyRequest,
  client: DatabaseClient | undefined,
  config: AuthConfig,
): Promise<AuthenticatedRequestContext> {
  if (config.adminAuthBypass) {
    return createDevBypassContext();
  }

  const payload = verifyAccessToken(readBearerToken(request), config);
  const principal = await getUserAuthContextById(payload.sub, { client });
  if (!principal) {
    throw new ApiAuthError(401, "invalid_session", "Authenticated user is not active.");
  }

  return {
    principal,
    auditActorUserId: principal.user.id,
    mode: "jwt",
  };
}

function hasPermission(principal: AuthenticatedPrincipal, permission: string): boolean {
  return (
    principal.permissions.includes(permission) ||
    (requiredAdminPermissions.includes(permission as (typeof requiredAdminPermissions)[number]) &&
      principalHasAdminRole(principal))
  );
}

function isAdminPrincipal(principal: AuthenticatedPrincipal): boolean {
  return principal.permissions.includes("admin.manage") || principalHasAdminRole(principal);
}

export async function requirePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  config: AuthConfig,
  permission: string,
  options: RequirePermissionOptions = {},
): Promise<AuthenticatedRequestContext | null> {
  try {
    const context = await authenticateRequest(request, client, config);
    if (!hasPermission(context.principal, permission)) {
      throw new ApiAuthError(
        403,
        "missing_permission",
        `Missing required permission: ${permission}`,
      );
    }

    return context;
  } catch (error) {
    if (error instanceof ApiAuthError) {
      reply.status(error.statusCode).send(
        options.onAuthFailure
          ? options.onAuthFailure({
              statusCode: error.statusCode,
              code: error.code,
              message: error.message,
            })
          : {
              error: error.code,
              message: error.message,
            },
      );
      return null;
    }

    throw error;
  }
}

function refreshTokenExpiresAt(config: AuthConfig, now: Date = new Date()): Date {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + config.refreshTokenTtlDays);
  return expiresAt;
}

function authResponse(
  principal: AuthenticatedPrincipal,
  accessToken: string,
  refreshToken: string,
) {
  return {
    accessToken,
    refreshToken,
    user: principal.user,
    profile: principal.profile,
    roles: principal.roles,
    roleCodes: principal.roleCodes,
    permissions: principal.permissions,
    isAdmin: isAdminPrincipal(principal),
  };
}

function publicPrincipalResponse(principal: AuthenticatedPrincipal) {
  return {
    user: principal.user,
    profile: principal.profile,
    roles: principal.roles,
    roleCodes: principal.roleCodes,
    permissions: principal.permissions,
    isAdmin: isAdminPrincipal(principal),
  };
}

function toAuditJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

async function recordAuthAudit(
  app: FastifyInstance,
  input: {
    readonly client?: DatabaseClient;
    readonly actorUserId?: string | null;
    readonly action: string;
    readonly target?: string;
    readonly channel?: AuthVerificationChannel;
    readonly ipAddress?: string;
    readonly userAgent?: string | null;
  },
): Promise<void> {
  try {
    await createAuditLog(
      {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: "auth",
        targetId: input.target ?? null,
        afterJson: input.target
          ? toAuditJson({
              target: input.target,
              ...(input.channel ? { channel: input.channel } : {}),
            })
          : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      { client: input.client },
    );
  } catch (error) {
    app.log.warn({ err: error }, "Failed to write auth audit log");
  }
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

function sendLoginServiceUnavailable(reply: FastifyReply): FastifyReply {
  return reply.status(503).send({
    error: "login_service_unavailable",
    message: loginServiceUnavailableMessage,
  });
}

export function registerAuthRoutes(app: FastifyInstance, options: AuthRoutesOptions): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;
  const env = options.env ?? process.env;
  const verificationSender =
    options.verificationSender ?? createVerificationSender({ dbClient: client, env });

  async function verifyAuthCaptcha(
    input: {
      readonly action: CaptchaVerifyAction;
      readonly captcha?: z.infer<typeof captchaTokenSchema>;
      readonly target?: string;
      readonly channel?: AuthVerificationChannel;
    },
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<boolean> {
    const result = await verifyTencentCaptcha(
      {
        action: input.action,
        ticket: input.captcha?.ticket ?? "",
        randstr: input.captcha?.randstr ?? "",
        userIp: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      {
        dbClient: client,
        env,
        fetcher: options.captchaFetcher,
      },
    );

    if (result.success) {
      if (result.enforced) {
        await recordAuthAudit(app, {
          client,
          action: "auth.captcha.success",
          target: input.target,
          channel: input.channel,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });
      }
      return true;
    }

    await recordAuthAudit(app, {
      client,
      action: "auth.captcha.failure",
      target: input.target,
      channel: input.channel,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    const statusCode = result.error === "captcha_required" ? 400 : 403;
    reply.status(statusCode).send({
      error: result.error ?? "captcha_invalid",
      message: result.error === "captcha_required" ? captchaRequiredMessage : result.messageZh,
    });
    return false;
  }

  async function confirmPublicRegistration(
    input: RegisterConfirmInput,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const target = normalizeRegisterTarget(input.channel, input.target);
    if (!target) {
      return reply.status(400).send({
        error: "invalid_register_target",
        message: input.channel === "email" ? "请输入有效邮箱地址。" : "请输入有效手机号。",
      });
    }

    if (
      !(await verifyAuthCaptcha(
        {
          action: "register_confirm",
          captcha: input.captcha,
          target,
          channel: input.channel,
        },
        request,
        reply,
      ))
    ) {
      return reply;
    }

    const now = new Date();
    const verificationCode = await findLatestActiveAuthVerificationCode(
      {
        channel: input.channel,
        purpose: "register",
        target,
        now,
      },
      { client },
    );

    const sendVerifyFailure = async () => {
      await recordAuthAudit(app, {
        client,
        action: "auth.register.verify_failure",
        target,
        channel: input.channel,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(400).send({
        error: "verification_code_invalid",
        message: "验证码错误或已过期，请重新获取。",
      });
    };

    if (!verificationCode || verificationCode.attemptCount >= verificationMaxAttempts(env)) {
      return sendVerifyFailure();
    }

    if (
      !verifyAuthVerificationCode(verificationCode, {
        code: input.code,
        secret: authConfig.jwtSecret,
        env,
      })
    ) {
      await incrementAuthVerificationAttempt({ id: verificationCode.id }, { client });
      return sendVerifyFailure();
    }

    const consumed = await consumeAuthVerificationCode(
      {
        id: verificationCode.id,
        now,
      },
      { client },
    );
    if (!consumed) {
      return sendVerifyFailure();
    }

    try {
      const principal = await createPublicUserAccount(
        {
          email: input.channel === "email" ? target : null,
          phone: input.channel === "sms" ? target : null,
          password: input.password,
          displayName: input.displayName,
        },
        { client },
      );

      await recordAuthAudit(app, {
        client,
        actorUserId: principal.user.id,
        action: "auth.register.success",
        target,
        channel: input.channel,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(201).send(publicPrincipalResponse(principal));
    } catch (error) {
      if (error instanceof DuplicateUserEmailError || error instanceof DuplicateUserPhoneError) {
        await recordAuthAudit(app, {
          client,
          action: "auth.register.duplicate",
          target,
          channel: input.channel,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        return reply.status(409).send({
          error: input.channel === "email" ? "duplicate_email" : "duplicate_phone",
          message:
            input.channel === "email"
              ? "该邮箱已注册，请直接登录。"
              : "该手机号已注册，请直接登录。",
        });
      }

      throw error;
    }
  }

  app.post("/auth/register", async (request, reply) => {
    const parsedBody = registerConfirmSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    return confirmPublicRegistration(parsedBody.data, request, reply);
  });

  app.post("/auth/register/send-code", async (request, reply) => {
    const parsedBody = sendRegisterCodeSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const target = normalizeRegisterTarget(parsedBody.data.channel, parsedBody.data.target);
    if (!target) {
      return reply.status(400).send({
        error: "invalid_register_target",
        message:
          parsedBody.data.channel === "email" ? "请输入有效邮箱地址。" : "请输入有效手机号。",
      });
    }

    if (
      !(await verifyAuthCaptcha(
        {
          action: "register_send_code",
          captcha: parsedBody.data.captcha,
          target,
          channel: parsedBody.data.channel,
        },
        request,
        reply,
      ))
    ) {
      return reply;
    }

    if (await isRegisterTargetTaken(target, client)) {
      await recordAuthAudit(app, {
        client,
        action: "auth.register.duplicate",
        target,
        channel: parsedBody.data.channel,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(409).send({
        error: parsedBody.data.channel === "email" ? "duplicate_email" : "duplicate_phone",
        message:
          parsedBody.data.channel === "email"
            ? "该邮箱已注册，请直接登录。"
            : "该手机号已注册，请直接登录。",
      });
    }

    const now = new Date();
    const cooldownSeconds = verificationResendCooldownSeconds(env);
    const existing = await findLatestActiveAuthVerificationCode(
      {
        channel: parsedBody.data.channel,
        purpose: "register",
        target,
        now,
      },
      { client },
    );
    if (existing) {
      const resendAt = existing.createdAt.getTime() + cooldownSeconds * 1000;
      if (resendAt > now.getTime()) {
        return reply.status(429).send({
          error: "verification_resend_cooldown",
          channel: parsedBody.data.channel,
          targetMasked: targetMasked(parsedBody.data.channel, target),
          resendAfterSeconds: Math.ceil((resendAt - now.getTime()) / 1000),
          message: "验证码发送过于频繁，请稍后再试。",
        });
      }
    }

    const code = generateVerificationCode();
    const ttlSeconds = verificationCodeTtlSeconds(env);
    await createAuthVerificationCode(
      {
        channel: parsedBody.data.channel,
        purpose: "register",
        target,
        code,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
        secret: authConfig.jwtSecret,
        env,
      },
      { client },
    );

    const sendResult = await verificationSender.send({
      channel: parsedBody.data.channel,
      purpose: "register",
      target,
      code,
    });
    if (!sendResult.success) {
      return reply.status(503).send({
        error: sendResult.error ?? "verification_sender_unavailable",
        channel: parsedBody.data.channel,
        mode: sendResult.mode,
        message: sendResult.messageZh,
      });
    }

    await recordAuthAudit(app, {
      client,
      action: "auth.register.code_sent",
      target,
      channel: parsedBody.data.channel,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
    });

    return reply.send({
      success: true,
      channel: parsedBody.data.channel,
      targetMasked: targetMasked(parsedBody.data.channel, target),
      expiresInSeconds: ttlSeconds,
      resendAfterSeconds: cooldownSeconds,
      mode: sendResult.mode,
      ...(shouldExposeMockCode(env, sendResult) ? { mockCode: code } : {}),
    });
  });

  app.post("/auth/register/confirm", async (request, reply) => {
    const parsedBody = registerConfirmSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    return confirmPublicRegistration(parsedBody.data, request, reply);
  });

  app.post("/auth/login", async (request, reply) => {
    const parsedBody = loginSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const identifier = (parsedBody.data.identifier ?? parsedBody.data.email ?? "").trim();
    if (
      !(await verifyAuthCaptcha(
        {
          action: "login",
          captcha: parsedBody.data.captcha,
          target: identifier,
        },
        request,
        reply,
      ))
    ) {
      return reply;
    }

    try {
      const authContext = await getUserAuthContextByIdentifier(identifier, { client });
      const passwordMatches = authContext
        ? await verifyPassword(parsedBody.data.password, authContext.passwordHash)
        : false;

      if (!authContext || !passwordMatches) {
        await recordAuthAudit(app, {
          client,
          action: "auth.login.failure",
          target: identifier,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        return reply.status(401).send({
          error: "invalid_credentials",
          message: invalidCredentialsMessage,
        });
      }

      const refreshToken = createRefreshToken();
      await createUserSession(
        {
          userId: authContext.user.id,
          refreshTokenHash: hashRefreshToken(refreshToken),
          expiresAt: refreshTokenExpiresAt(authConfig),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );
      await touchUserLastLogin(authContext.user.id, { client });

      const refreshedPrincipal = await getUserAuthContextById(authContext.user.id, { client });
      const principal = refreshedPrincipal ?? authContext;
      await recordAuthAudit(app, {
        client,
        actorUserId: principal.user.id,
        action: "auth.login.success",
        target: identifier,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return authResponse(principal, signAccessToken(principal.user.id, authConfig), refreshToken);
    } catch (error) {
      request.log.error({ err: error, identifier }, "Auth login failed");
      return sendLoginServiceUnavailable(reply);
    }
  });

  app.post("/auth/refresh", async (request, reply) => {
    const parsedBody = refreshSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const existingSession = await getActiveUserSessionByRefreshToken(parsedBody.data.refreshToken, {
      client,
    });
    if (!existingSession) {
      return reply.status(401).send({
        error: "invalid_refresh_token",
        message: "Refresh token is invalid or expired.",
      });
    }

    const principal = await getUserAuthContextById(existingSession.userId, { client });
    if (!principal) {
      await revokeUserSessionByRefreshToken(parsedBody.data.refreshToken, { client });
      return reply.status(401).send({
        error: "invalid_session",
        message: "Authenticated user is not active.",
      });
    }

    await revokeUserSessionByRefreshToken(parsedBody.data.refreshToken, { client });
    const refreshToken = createRefreshToken();
    await createUserSession(
      {
        userId: principal.user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshTokenExpiresAt(authConfig),
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      },
      { client },
    );

    return authResponse(principal, signAccessToken(principal.user.id, authConfig), refreshToken);
  });

  app.post("/auth/logout", async (request) => {
    const parsedBody = logoutSchema.safeParse(request.body ?? {});
    if (parsedBody.success && parsedBody.data.refreshToken) {
      await revokeUserSessionByRefreshToken(parsedBody.data.refreshToken, { client });
    }

    return {
      success: true,
    };
  });

  app.get("/auth/me", async (request, reply) => {
    try {
      const context = await authenticateRequest(request, client, authConfig);
      return publicPrincipalResponse(context.principal);
    } catch (error) {
      if (error instanceof ApiAuthError) {
        return reply.status(error.statusCode).send({
          error: error.code,
          message: error.message,
        });
      }

      throw error;
    }
  });
}
