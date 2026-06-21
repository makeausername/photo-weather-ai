import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";
import { hashRefreshToken } from "@photo-weather/db";

const testEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  BILLING_ALLOW_MANUAL_MARK_PAID: "true",
};

function createOrder(state: any, input: Partial<any> = {}) {
  const now = new Date("2026-06-21T00:00:00.000Z");
  const order = {
    id: `payment-order-${state.paymentOrders.size}`,
    orderNo: input.orderNo ?? `PTEST${state.paymentOrders.size}`,
    userId: input.userId ?? "plain-user",
    provider: input.provider ?? "mock",
    amountCents: input.amountCents ?? 990,
    currency: "CNY",
    productCode: input.productCode ?? "forecast_credit_20",
    productId: null,
    status: input.status ?? "pending",
    paidAt: input.paidAt ?? null,
    expiresAt: input.expiresAt ?? new Date(now.getTime() + 30 * 60 * 1000),
    providerTradeNo: input.providerTradeNo ?? null,
    providerPayloadJson: input.providerPayloadJson ?? {
      signature: "raw-payment-signature",
      apiKey: "provider-api-key",
    },
    metadataJson: input.metadataJson ?? null,
    entitlementGrantedAt: input.entitlementGrantedAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  state.paymentOrders.set(order.orderNo, order);
  return order;
}

describe("admin user and order routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it("requires admin permissions for user and order lists", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const userList = await app.inject({
      method: "GET",
      url: "/admin/users",
      headers: adminAuthorizationHeader("plain-user"),
    });
    const orderList = await app.inject({
      method: "GET",
      url: "/admin/orders",
      headers: adminAuthorizationHeader("plain-user"),
    });

    expect(userList.statusCode).toBe(403);
    expect(orderList.statusCode).toBe(403);
  });

  it("lists users with operational summaries and never returns password hashes", async () => {
    const { client, state } = await createFakeDatabaseClient();
    createOrder(state, { orderNo: "PUSERLIST", status: "paid", paidAt: new Date("2026-06-21T01:00:00.000Z") });
    state.userCreditLedger.set("payment-order-0:payment_entitlement_grant", {
      id: "ledger-1",
      userId: "plain-user",
      orderId: "payment-order-0",
      entitlementId: null,
      delta: 20,
      balanceAfter: 20,
      reason: "payment_entitlement_grant",
      metadataJson: null,
      createdAt: new Date("2026-06-21T01:01:00.000Z"),
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/users?q=user@example.com&hasOrders=true&hasCredits=true",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      id: "plain-user",
      orderCount: 1,
      paidOrderCount: 1,
      currentCreditBalance: 20,
    });
    expect(response.body).not.toContain("passwordHash");
    expect(response.body).not.toContain("refreshTokenHash");
  });

  it("creates, rejects duplicates, edits, disables, enables, resets password, and revokes sessions", async () => {
    const { client, state } = await createFakeDatabaseClient();
    state.sessions.set(hashRefreshToken("plain-user-refresh"), {
      id: "plain-session",
      userId: "plain-user",
      refreshTokenHash: hashRefreshToken("plain-user-refresh"),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      revokedAt: null,
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const created = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: adminAuthorizationHeader(),
      payload: {
        email: "managed@example.com",
        displayName: "Managed User",
        generatePassword: true,
        roleCodes: ["user"],
      },
    });
    const duplicate = await app.inject({
      method: "POST",
      url: "/admin/users",
      headers: adminAuthorizationHeader(),
      payload: {
        email: "managed@example.com",
        password: "public888",
      },
    });
    const edited = await app.inject({
      method: "PATCH",
      url: "/admin/users/plain-user",
      headers: adminAuthorizationHeader(),
      payload: {
        displayName: "Plain User Edited",
      },
    });
    const disabled = await app.inject({
      method: "POST",
      url: "/admin/users/plain-user/disable",
      headers: adminAuthorizationHeader(),
      payload: {},
    });
    const enabled = await app.inject({
      method: "POST",
      url: "/admin/users/plain-user/enable",
      headers: adminAuthorizationHeader(),
      payload: {},
    });
    const reset = await app.inject({
      method: "POST",
      url: "/admin/users/plain-user/reset-password",
      headers: adminAuthorizationHeader(),
      payload: { generatePassword: true },
    });
    const revoke = await app.inject({
      method: "POST",
      url: "/admin/users/plain-user/revoke-sessions",
      headers: adminAuthorizationHeader(),
      payload: {},
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().generatedPassword).toEqual(expect.any(String));
    expect(created.body).not.toContain("passwordHash");
    expect(duplicate.statusCode).toBe(409);
    expect(edited.json().user.profile.displayName).toBe("Plain User Edited");
    expect(disabled.json().user.profile.status).toBe("disabled");
    expect(enabled.json().user.profile.status).toBe("active");
    expect(reset.json().generatedPassword).toEqual(expect.any(String));
    expect(reset.body).not.toContain("passwordHash");
    expect(reset.body).not.toContain("plain-user-refresh");
    expect(revoke.json().revokedSessionCount).toBe(0);
    expect(state.sessions.get(hashRefreshToken("plain-user-refresh")).revokedAt).toBeTruthy();
    expect(state.auditLogs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        "admin.user.create",
        "admin.user.update",
        "admin.user.disable",
        "admin.user.enable",
        "admin.user.reset_password",
        "admin.user.revoke_sessions",
      ]),
    );
  });

  it("blocks disabling or stripping the last admin", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const disable = await app.inject({
      method: "POST",
      url: "/admin/users/admin-user/disable",
      headers: adminAuthorizationHeader(),
      payload: {},
    });
    const stripRole = await app.inject({
      method: "PATCH",
      url: "/admin/users/admin-user/roles",
      headers: adminAuthorizationHeader(),
      payload: {
        roleCodes: ["user"],
      },
    });

    expect(disable.statusCode).toBe(409);
    expect(stripRole.statusCode).toBe(409);
  });

  it("blocks an admin from stripping their own admin access", async () => {
    const { client, state } = await createFakeDatabaseClient();
    state.users.get("plain-user").roleCodes = ["admin"];
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/users/admin-user/roles",
      headers: adminAuthorizationHeader(),
      payload: {
        roleCodes: ["user"],
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: "self_admin_access_change_blocked",
    });
    expect(state.users.get("admin-user").roleCodes).toEqual(["admin"]);
  });

  it("updates roles and requires admin.manage for admin role grants", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/users/plain-user/roles",
      headers: adminAuthorizationHeader(),
      payload: {
        roleCodes: ["user", "admin"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.roleCodes).toEqual(["admin", "user"]);
    expect(response.body).not.toContain("passwordHash");
  });

  it("lists and details orders safely, including notifications, entitlements, and ledger", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const order = createOrder(state, { orderNo: "PORDERDETAIL" });
    state.paymentNotifications.set("notify-1", {
      id: "notify-1",
      provider: "mock",
      orderNo: order.orderNo,
      providerTradeNo: "provider-trade-1",
      rawBody: "raw-payment-signature",
      rawJson: { secret: "raw-private-payment-payload" },
      headersJson: { authorization: "Bearer secret" },
      signatureVerified: true,
      status: "processed",
      errorMessage: null,
      createdAt: new Date("2026-06-21T01:00:00.000Z"),
      processedAt: new Date("2026-06-21T01:01:00.000Z"),
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const paid = await app.inject({
      method: "POST",
      url: `/admin/orders/${order.orderNo}/mark-paid`,
      headers: adminAuthorizationHeader(),
      payload: {},
    });
    const list = await app.inject({
      method: "GET",
      url: "/admin/orders?q=PORDERDETAIL&status=paid",
      headers: adminAuthorizationHeader(),
    });
    const detail = await app.inject({
      method: "GET",
      url: `/admin/orders/${order.orderNo}`,
      headers: adminAuthorizationHeader(),
    });

    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ success: true, entitlementGranted: true });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0]).toMatchObject({ orderNo: "PORDERDETAIL", status: "paid" });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().order.notifications).toHaveLength(1);
    expect(detail.json().order.entitlements).toHaveLength(1);
    expect(detail.json().order.creditLedger).toHaveLength(1);
    expect(detail.body).not.toContain("providerPayloadJson");
    expect(detail.body).not.toContain("raw-payment-signature");
    expect(detail.body).not.toContain("raw-private-payment-payload");
    expect(detail.body).not.toContain("authorization");
  });

  it("keeps manual mark-paid idempotent and blocks canceling paid orders", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const order = createOrder(state, { orderNo: "PIDEMPOTENT" });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const first = await app.inject({
      method: "POST",
      url: `/admin/orders/${order.orderNo}/mark-paid`,
      headers: adminAuthorizationHeader(),
      payload: {},
    });
    const second = await app.inject({
      method: "POST",
      url: `/admin/orders/${order.orderNo}/mark-paid`,
      headers: adminAuthorizationHeader(),
      payload: {},
    });
    const cancel = await app.inject({
      method: "POST",
      url: `/admin/orders/${order.orderNo}/cancel`,
      headers: adminAuthorizationHeader(),
      payload: {},
    });

    expect(first.json().entitlementGranted).toBe(true);
    expect(second.json().entitlementGranted).toBe(false);
    expect(state.userEntitlements.size).toBe(1);
    expect(state.userCreditLedger.size).toBe(1);
    expect(cancel.statusCode).toBe(409);
  });
});
