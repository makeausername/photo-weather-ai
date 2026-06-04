import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { invalidCredentialsMessage, loginServiceUnavailableMessage } from "../auth-routes.js";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

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
    expect(body.roles).toContain("super_admin");
    expect(body.permissions).toContain("admin.manage");
    expect(response.body).not.toContain("passwordHash");
    expect(state.sessions.size).toBeGreaterThan(1);
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "auth.login.success",
    });
  });

  it("registers a public account with the normal user role and safe response", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "New.User@Example.com",
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
      roles: ["user"],
      permissions: [],
      isAdmin: false,
    });
    expect(response.body).not.toContain("passwordHash");

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
  });

  it("rejects duplicate public registration with a Chinese-friendly error", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "user@example.com",
        password: "public88",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "duplicate_email",
      message: "该邮箱已注册，请直接登录。",
    });
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
      roles: ["user"],
      permissions: [],
      isAdmin: false,
    });
    expect(response.body).not.toContain("passwordHash");
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
      roles: ["super_admin"],
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
      roles: ["user"],
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
});
