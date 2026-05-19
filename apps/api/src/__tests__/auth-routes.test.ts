import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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
        password: "CorrectHorseBattery99",
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
    });
    expect(response.body).not.toContain("accessToken");
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: null,
      action: "auth.login.failure",
    });
    expect(JSON.stringify(state.auditLogs)).not.toContain("wrong-password");
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
