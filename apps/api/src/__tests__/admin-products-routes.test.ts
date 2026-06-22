import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

describe("admin product routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.restoreAllMocks();
  });

  it("requires admin permissions for product pricing APIs", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const unauthenticated = await app.inject({ method: "GET", url: "/admin/products" });
    const plainUserList = await app.inject({
      method: "GET",
      url: "/admin/products",
      headers: adminAuthorizationHeader("plain-user"),
    });
    const plainUserPatch = await app.inject({
      method: "PATCH",
      url: "/admin/products/monthly_full",
      headers: adminAuthorizationHeader("plain-user"),
      payload: { amountCents: 2600 },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(plainUserList.statusCode).toBe(403);
    expect(plainUserPatch.statusCode).toBe(403);
  });

  it("returns safe admin product rows without payment payloads or secrets", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "GET",
      url: "/admin/products",
      headers: adminAuthorizationHeader(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "trial_7_days",
          amountCents: 0,
          publicPurchasable: false,
          metadataJson: expect.objectContaining({
            internal: true,
            source: "registration_trial",
          }),
        }),
        expect.objectContaining({
          code: "monthly_full",
          amountCents: 1900,
          currency: "CNY",
          durationDays: 30,
          publicVisible: true,
          publicPurchasable: true,
        }),
      ]),
    );
    expect(response.body).not.toContain("providerPayloadJson");
    expect(response.body).not.toContain("secretJson");
    expect(response.body).not.toContain("merchantPrivateKeyPem");
    expect(response.body).not.toContain("refreshTokenHash");
  });

  it("lets admins update public plan pricing and records a safe audit log", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/products/monthly_full",
      headers: adminAuthorizationHeader("admin-user"),
      payload: {
        amountCents: 2600,
        description: "运营调整后的月卡。",
        publicVisible: true,
        publicPurchasable: true,
        recommended: true,
        badgeText: "热卖",
        featureBullets: ["完整摄影判断", "专业逐小时表格"],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().product).toMatchObject({
      code: "monthly_full",
      amountCents: 2600,
      description: "运营调整后的月卡。",
      publicVisible: true,
      publicPurchasable: true,
      recommended: true,
      badgeText: "热卖",
      featureBullets: ["完整摄影判断", "专业逐小时表格"],
    });
    expect(state.billingProducts.get("monthly_full")).toMatchObject({
      amountCents: 2600,
      description: "运营调整后的月卡。",
    });
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "billing.product.update",
      targetType: "billing_product",
      targetId: "monthly_full",
    });
    expect(JSON.stringify(state.auditLogs)).not.toContain("secretJson");
    expect(JSON.stringify(state.auditLogs)).not.toContain("providerPayloadJson");
  });

  it("does not allow admins to make registration trial publicly purchasable", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const response = await app.inject({
      method: "PATCH",
      url: "/admin/products/trial_7_days",
      headers: adminAuthorizationHeader("admin-user"),
      payload: {
        publicPurchasable: true,
        amountCents: 100,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_product_update" });
    expect(state.billingProducts.get("trial_7_days")).toMatchObject({
      amountCents: 0,
    });
    expect(state.billingProducts.get("trial_7_days").metadataJson).toMatchObject({
      publicPurchasable: false,
    });
  });

  it("uses enable and disable actions for public products", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, logger: false });

    const disabled = await app.inject({
      method: "POST",
      url: "/admin/products/monthly_full/disable",
      headers: adminAuthorizationHeader("admin-user"),
    });
    const enabled = await app.inject({
      method: "POST",
      url: "/admin/products/monthly_full/enable",
      headers: adminAuthorizationHeader("admin-user"),
    });

    expect(disabled.statusCode).toBe(200);
    expect(disabled.json().product).toMatchObject({ code: "monthly_full", enabled: false });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().product).toMatchObject({ code: "monthly_full", enabled: true });
    expect(state.auditLogs.map((log) => log.action)).toEqual([
      "billing.product.update",
      "billing.product.update",
    ]);
  });
});
