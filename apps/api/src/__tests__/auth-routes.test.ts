import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { hashRefreshToken, verifyPassword } from "@photo-weather/db";
import { invalidCredentialsMessage, loginServiceUnavailableMessage } from "../auth-routes.js";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

const registerTestEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  AUTH_VERIFICATION_EXPOSE_MOCK_CODE: "true",
  AUTH_VERIFICATION_RESEND_SECONDS: "0",
};

async function sendRegisterCode(
  app: FastifyInstance,
  input: {
    readonly channel: "email" | "sms";
    readonly target: string;
  },
): Promise<{
  readonly statusCode: number;
  readonly body: {
    readonly success?: boolean;
    readonly mockCode?: string;
    readonly mode?: string;
  };
}> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register/send-code",
    payload: input,
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

async function sendAccountEmailCode(
  app: FastifyInstance,
  target: string,
): Promise<{
  readonly statusCode: number;
  readonly body: {
    readonly mockCode?: string;
  };
}> {
  const response = await app.inject({
    method: "POST",
    url: "/account/email/send-code",
    headers: adminAuthorizationHeader("plain-user"),
    payload: {
      email: target,
    },
  });

  return {
    statusCode: response.statusCode,
    body: response.json(),
  };
}

const baseHistoryQuery = {
  name: "测试山顶",
  source: "manual",
  latitudeGcj02: 30.12,
  longitudeGcj02: 118.16,
  latitudeWgs84: 30.118,
  longitudeWgs84: 118.156,
  horizon: "48h",
  target: "cloud_sea",
  timezone: "Asia/Shanghai",
  elevationMeters: 1200,
  locationId: "location-test",
  photoSpotId: "spot-test",
} as const;

describe("auth routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("logs in with a valid admin account and excludes passwordHash", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.com",
        password: "CorrectHorseBattery99!",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.refreshToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({
      id: "admin-user",
      email: "admin@example.com",
      displayName: "Test Admin",
    });
    expect(body.roles).toEqual([
      expect.objectContaining({
        code: "admin",
        displayName: expect.any(String),
        id: expect.any(String),
        name: expect.any(String),
      }),
    ]);
    expect(body.roleCodes).toContain("admin");
    expect(body.permissions).toContain("admin.manage");
    expect(response.body).not.toContain("passwordHash");
    expect(state.sessions.size).toBeGreaterThan(1);
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "auth.login.success",
    });
  });

  it("sends an email verification code through the mock sender and stores only a hash", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const response = await sendRegisterCode(app, {
      channel: "email",
      target: "New.User@Example.com",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      mode: "mock",
    });
    expect(response.body.mockCode).toMatch(/^\d{6}$/);
    const storedCode = [...state.verificationCodes.values()][0];
    expect(storedCode).toMatchObject({
      channel: "email",
      purpose: "register",
      target: "new.user@example.com",
      consumedAt: null,
      attemptCount: 0,
    });
    expect(storedCode.codeHash).toHaveLength(64);
    expect(storedCode.codeHash).not.toBe(response.body.mockCode);
  });

  it("sends an SMS verification code through the mock sender and stores only a hash", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const response = await sendRegisterCode(app, {
      channel: "sms",
      target: "+86 13800138000",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.mockCode).toMatch(/^\d{6}$/);
    const storedCode = [...state.verificationCodes.values()][0];
    expect(storedCode).toMatchObject({
      channel: "sms",
      purpose: "register",
      target: "13800138000",
    });
    expect(storedCode.codeHash).not.toBe(response.body.mockCode);
  });

  it("confirms a verification code and registers a public email account", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const sent = await sendRegisterCode(app, {
      channel: "email",
      target: "New.User@Example.com",
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "email",
        target: "New.User@Example.com",
        code: sent.body.mockCode,
        password: "public88",
        displayName: "逐光用户",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: {
        email: "new.user@example.com",
        displayName: "逐光用户",
        status: "active",
      },
      roles: [
        expect.objectContaining({
          code: "user",
        }),
      ],
      roleCodes: ["user"],
      permissions: [],
      isAdmin: false,
    });
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("accessToken");

    const createdUser = [...state.users.values()].find(
      (user) => user.email === "new.user@example.com",
    );
    expect(createdUser).toMatchObject({
      roleCodes: ["user"],
    });
    expect(createdUser?.passwordHash).not.toBe("public88");
    expect(state.profiles.get(createdUser?.id)).toMatchObject({
      userId: createdUser?.id,
      preferredLanguage: "zh-CN",
    });
    expect([...state.verificationCodes.values()][0].consumedAt).toEqual(expect.any(Date));
  });

  it("rejects duplicate email or phone targets before sending codes", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const emailResponse = await app.inject({
      method: "POST",
      url: "/auth/register/send-code",
      payload: {
        channel: "email",
        target: "user@example.com",
      },
    });

    expect(emailResponse.statusCode).toBe(409);
    expect(emailResponse.json()).toMatchObject({
      error: "duplicate_email",
      message: "该邮箱已注册，请直接登录。",
    });

    const sent = await sendRegisterCode(app, {
      channel: "sms",
      target: "13800138000",
    });
    await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "sms",
        target: "13800138000",
        code: sent.body.mockCode,
        password: "public88",
      },
    });

    const phoneResponse = await app.inject({
      method: "POST",
      url: "/auth/register/send-code",
      payload: {
        channel: "sms",
        target: "13800138000",
      },
    });
    expect(phoneResponse.statusCode).toBe(409);
    expect(phoneResponse.json()).toMatchObject({
      error: "duplicate_phone",
      message: "该手机号已注册，请直接登录。",
    });
  });

  it("rejects wrong, expired, and reused verification codes", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const sent = await sendRegisterCode(app, {
      channel: "email",
      target: "wrong-code@example.com",
    });
    const wrongResponse = await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "email",
        target: "wrong-code@example.com",
        code: "000000",
        password: "public88",
      },
    });
    expect(wrongResponse.statusCode).toBe(400);
    expect([...state.verificationCodes.values()][0].attemptCount).toBe(1);
    expect([...state.users.values()].some((user) => user.email === "wrong-code@example.com")).toBe(
      false,
    );

    const storedCode = [...state.verificationCodes.values()][0];
    state.verificationCodes.set(storedCode.id, {
      ...storedCode,
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredResponse = await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "email",
        target: "wrong-code@example.com",
        code: sent.body.mockCode,
        password: "public88",
      },
    });
    expect(expiredResponse.statusCode).toBe(400);

    const sentAgain = await sendRegisterCode(app, {
      channel: "email",
      target: "reuse@example.com",
    });
    const successResponse = await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "email",
        target: "reuse@example.com",
        code: sentAgain.body.mockCode,
        password: "public88",
      },
    });
    expect(successResponse.statusCode).toBe(201);
    const reusedResponse = await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "email",
        target: "reuse@example.com",
        code: sentAgain.body.mockCode,
        password: "public88",
      },
    });
    expect(reusedResponse.statusCode).toBe(400);
  });

  it("does not allow direct unverified public registration", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "direct@example.com",
        password: "public88",
      },
    });

    expect(response.statusCode).toBe(400);
    expect([...state.users.values()].some((user) => user.email === "direct@example.com")).toBe(
      false,
    );
  });

  it("logs in with a normal public user account", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "user@example.com",
        password: "CorrectHorseBattery99!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: {
        id: "plain-user",
        email: "user@example.com",
      },
      roles: [
        expect.objectContaining({
          code: "user",
        }),
      ],
      roleCodes: ["user"],
      permissions: [],
      isAdmin: false,
    });
    expect(response.body).not.toContain("passwordHash");
  });

  it("logs in with a phone identifier after SMS registration", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const sent = await sendRegisterCode(app, {
      channel: "sms",
      target: "13900139000",
    });
    await app.inject({
      method: "POST",
      url: "/auth/register/confirm",
      payload: {
        channel: "sms",
        target: "13900139000",
        code: sent.body.mockCode,
        password: "public88",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        identifier: "13900139000",
        password: "public88",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        email: null,
        phone: "13900139000",
      },
      roleCodes: ["user"],
    });
  });

  it("rejects login with the wrong password and does not return tokens", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.com",
        password: "wrong-password",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "invalid_credentials",
      message: invalidCredentialsMessage,
    });
    expect(response.body).not.toContain("accessToken");
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: null,
      action: "auth.login.failure",
    });
    expect(JSON.stringify(state.auditLogs)).not.toContain("wrong-password");
  });

  it("sanitizes database login failures instead of exposing Prisma details", async () => {
    const { client } = await createFakeDatabaseClient();
    (client.user as any).findUnique = async () => {
      const error = new Error(
        "Invalid `prisma.user.findUnique()` invocation: Authentication failed against database server at `postgres`, the provided database credentials for `photo_weather_ai` are not valid.",
      );
      error.name = "PrismaClientInitializationError";
      throw error;
    };
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.com",
        password: "CorrectHorseBattery99!",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: "login_service_unavailable",
      message: loginServiceUnavailableMessage,
    });
    expect(response.body).not.toContain("Prisma");
    expect(response.body).not.toContain("findUnique");
    expect(response.body).not.toContain("postgres");
    expect(response.body).not.toContain("photo_weather_ai");
    expect(response.body).not.toContain("Authentication failed");
  });

  it("refreshes a valid refresh token and revokes the old session", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: {
        refreshToken: "existing-refresh-token-for-tests",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toEqual(expect.any(String));
    expect(response.json().refreshToken).not.toBe("existing-refresh-token-for-tests");
    expect(
      [...state.sessions.values()].find((session) => session.id === "existing-session"),
    ).toMatchObject({
      revokedAt: expect.any(Date),
    });
  });

  it("returns the current user for a valid access token", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: "admin-user",
        email: "admin@example.com",
      },
      roles: [
        expect.objectContaining({
          code: "admin",
          displayName: expect.any(String),
          name: expect.any(String),
        }),
      ],
      roleCodes: ["admin"],
      isAdmin: true,
    });
    expect(response.body).not.toContain("passwordHash");
  });

  it("returns roles and isAdmin for a normal current user", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: adminAuthorizationHeader("plain-user"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: "plain-user",
        email: "user@example.com",
      },
      roles: [
        expect.objectContaining({
          code: "user",
        }),
      ],
      roleCodes: ["user"],
      permissions: [],
      isAdmin: false,
    });
    expect(response.body).not.toContain("passwordHash");
  });

  it("rejects admin APIs when the user lacks the required permission", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/settings",
      headers: adminAuthorizationHeader("plain-user"),
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: "missing_permission",
    });
  });

  it("allows admin APIs for an admin role code even if permission rows are not loaded", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const adminRole = state.roles.get("admin");
    if (!adminRole) {
      throw new Error("Expected fake admin role.");
    }
    state.roles.set("admin", {
      ...adminRole,
      permissions: [],
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      user: {
        id: "admin-user",
      },
      roleCodes: ["admin"],
    });
  });

  it("changes the current user's password and revokes other sessions", async () => {
    const { client, state } = await createFakeDatabaseClient();
    state.sessions.set(hashRefreshToken("plain-refresh-1"), {
      id: "plain-session-1",
      userId: "plain-user",
      refreshTokenHash: hashRefreshToken("plain-refresh-1"),
      expiresAt: new Date("2030-02-01T00:00:00.000Z"),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/account/change-password",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        currentPassword: "CorrectHorseBattery99!",
        newPassword: "updated88",
        confirmNewPassword: "updated88",
      },
    });

    expect(response.statusCode).toBe(200);
    const user = state.users.get("plain-user");
    expect(await verifyPassword("updated88", user.passwordHash)).toBe(true);
    expect(state.sessions.get(hashRefreshToken("plain-refresh-1"))).toMatchObject({
      revokedAt: expect.any(Date),
    });
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: "plain-user",
      action: "account.password.changed",
    });
  });

  it("rejects password changes with the wrong current password", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/account/change-password",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        currentPassword: "wrong-password",
        newPassword: "updated88",
        confirmNewPassword: "updated88",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "invalid_current_password",
    });
    expect(
      await verifyPassword("CorrectHorseBattery99!", state.users.get("plain-user").passwordHash),
    ).toBe(true);
  });

  it("rejects duplicate email targets before account email verification", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const response = await app.inject({
      method: "POST",
      url: "/account/email/send-code",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        email: "admin@example.com",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "duplicate_email",
    });
  });

  it("confirms an account email verification code and updates the email", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const sent = await sendAccountEmailCode(app, "new-email@example.com");
    expect(sent.statusCode).toBe(200);
    const response = await app.inject({
      method: "POST",
      url: "/account/email/confirm",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        email: "new-email@example.com",
        code: sent.body.mockCode,
        currentPassword: "CorrectHorseBattery99!",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      user: {
        id: "plain-user",
        email: "new-email@example.com",
      },
    });
    expect(state.users.get("plain-user")).toMatchObject({
      email: "new-email@example.com",
    });
    expect([...state.verificationCodes.values()][0]).toMatchObject({
      purpose: "change_email",
      consumedAt: expect.any(Date),
    });
  });

  it("rejects duplicate phone targets before account phone verification", async () => {
    const { client, state } = await createFakeDatabaseClient();
    state.users.set("admin-user", {
      ...state.users.get("admin-user"),
      phone: "13800138000",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      logger: false,
      env: registerTestEnv,
    });

    const response = await app.inject({
      method: "POST",
      url: "/account/phone/send-code",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        phone: "13800138000",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "duplicate_phone",
    });
  });

  it("requires the current password before deleting an account", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/account/delete",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        currentPassword: "wrong-password",
        confirmation: true,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(state.users.get("plain-user")).toMatchObject({
      status: "active",
    });
  });

  it("soft-deletes a normal account and revokes all of its sessions", async () => {
    const { client, state } = await createFakeDatabaseClient();
    state.sessions.set(hashRefreshToken("plain-refresh-1"), {
      id: "plain-session-1",
      userId: "plain-user",
      refreshTokenHash: hashRefreshToken("plain-refresh-1"),
      expiresAt: new Date("2030-02-01T00:00:00.000Z"),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/account/delete",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        currentPassword: "CorrectHorseBattery99!",
        confirmation: true,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(state.users.get("plain-user")).toMatchObject({
      status: "disabled",
      email: null,
      phone: null,
      displayName: null,
    });
    expect(state.sessions.get(hashRefreshToken("plain-refresh-1"))).toMatchObject({
      revokedAt: expect.any(Date),
    });
  });

  it("does not allow deleting the last active admin account", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/account/delete",
      headers: adminAuthorizationHeader("admin-user"),
      payload: {
        currentPassword: "CorrectHorseBattery99!",
        confirmation: true,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "last_admin_delete_blocked",
    });
    expect(state.users.get("admin-user")).toMatchObject({
      status: "active",
      email: "admin@example.com",
    });
  });

  it("saves and lists forecast history only for the authenticated user", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const plainSave = await app.inject({
      method: "POST",
      url: "/account/forecast-history",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        query: baseHistoryQuery,
        resultSummary: {
          overallScore: 82,
          recommendationLabel: "推荐前往",
          bestWindowStart: "2026-06-22T05:00:00+08:00",
          bestWindowEnd: "2026-06-22T07:00:00+08:00",
        },
      },
    });
    const adminSave = await app.inject({
      method: "POST",
      url: "/account/forecast-history",
      headers: adminAuthorizationHeader("admin-user"),
      payload: {
        query: { ...baseHistoryQuery, name: "管理员地点", target: "general" },
        resultSummary: {
          overallScore: 61,
          recommendationLabel: "谨慎参考",
        },
      },
    });

    expect(plainSave.statusCode).toBe(201);
    expect(adminSave.statusCode).toBe(201);
    const plainList = await app.inject({
      method: "GET",
      url: "/account/forecast-history",
      headers: adminAuthorizationHeader("plain-user"),
    });
    const adminList = await app.inject({
      method: "GET",
      url: "/account/forecast-history",
      headers: adminAuthorizationHeader("admin-user"),
    });

    expect(plainList.statusCode).toBe(200);
    expect(plainList.json().items).toEqual([
      expect.objectContaining({
        locationName: "测试山顶",
        target: "cloud_sea",
        recommendationLabel: "推荐前往",
      }),
    ]);
    expect(JSON.stringify(plainList.json())).not.toContain("管理员地点");
    expect(adminList.json().items).toEqual([
      expect.objectContaining({
        locationName: "管理员地点",
        target: "general",
      }),
    ]);
    expect(JSON.stringify(adminList.json())).not.toContain("测试山顶");

    const forbiddenDelete = await app.inject({
      method: "DELETE",
      url: `/account/forecast-history/${plainSave.json().id}`,
      headers: adminAuthorizationHeader("admin-user"),
    });
    expect(forbiddenDelete.statusCode).toBe(404);
  });
});
