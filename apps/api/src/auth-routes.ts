import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createAuditLog,
  createPublicUserAccount,
  createRefreshToken,
  createUserSession,
  DuplicateUserEmailError,
  getActiveUserSessionByRefreshToken,
  getUserAuthContextByEmail,
  getUserAuthContextById,
  hashRefreshToken,
  principalHasAdminRole,
  requiredAdminPermissions,
  revokeUserSessionByRefreshToken,
  touchUserLastLogin,
  verifyPassword,
} from "@photo-weather/db";
import type { AuthenticatedPrincipal, DatabaseClient, JsonValue } from "@photo-weather/db";
import { z } from "zod";

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

export const invalidCredentialsMessage = "邮箱或密码不正确。";
export const loginServiceUnavailableMessage =
  "登录服务暂时不可用，请稍后重试或联系管理员。";

const loginSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱地址。"),
  password: z.string().min(1, "请输入密码。").max(1000, "密码长度超过限制。"),
});

const registerSchema = z.object({
  email: z.string().trim().email("请输入有效邮箱地址。"),
  password: z.string().min(8, "密码至少需要 8 个字符。").max(1000, "密码长度超过限制。"),
  displayName: z
    .string()
    .trim()
    .max(40, "昵称最多 40 个字符。")
    .optional()
    .transform((value) => value || undefined),
});

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
  return principal.permissions.includes(permission);
}

function isAdminPrincipal(principal: AuthenticatedPrincipal): boolean {
  return (
    principal.permissions.includes("admin.manage") ||
    principalHasAdminRole(principal)
  );
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
    readonly email?: string;
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
        targetId: input.email ?? null,
        afterJson: input.email ? toAuditJson({ email: input.email }) : null,
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

  app.post("/auth/register", async (request, reply) => {
    const parsedBody = registerSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const email = parsedBody.data.email.trim().toLowerCase();

    try {
      const principal = await createPublicUserAccount(
        {
          email,
          password: parsedBody.data.password,
          displayName: parsedBody.data.displayName,
        },
        { client },
      );

      await recordAuthAudit(app, {
        client,
        actorUserId: principal.user.id,
        action: "auth.register.success",
        email,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return reply.status(201).send(publicPrincipalResponse(principal));
    } catch (error) {
      if (error instanceof DuplicateUserEmailError) {
        await recordAuthAudit(app, {
          client,
          action: "auth.register.duplicate",
          email,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        });

        return reply.status(409).send({
          error: "duplicate_email",
          message: "该邮箱已注册，请直接登录。",
        });
      }

      throw error;
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const parsedBody = loginSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    const email = parsedBody.data.email.trim().toLowerCase();
    try {
      const authContext = await getUserAuthContextByEmail(email, { client });
      const passwordMatches = authContext
        ? await verifyPassword(parsedBody.data.password, authContext.passwordHash)
        : false;

      if (!authContext || !passwordMatches) {
        await recordAuthAudit(app, {
          client,
          action: "auth.login.failure",
          email,
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
        email,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"] ?? null,
      });

      return authResponse(principal, signAccessToken(principal.user.id, authConfig), refreshToken);
    } catch (error) {
      request.log.error({ err: error, email }, "Auth login failed");
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
