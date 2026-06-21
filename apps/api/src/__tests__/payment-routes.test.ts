import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import {
  alipayCanonicalString,
  encryptWechatResourceForFixture,
  rsaSha256Sign,
} from "../payment-security.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

const apiV3Key = "0123456789abcdef0123456789abcdef";
const testEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  BILLING_ALLOW_MANUAL_MARK_PAID: "true",
};

type PemPair = {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
};

function createPemPair(): PemPair {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

function enableWechatProvider(state: any, pair = createPemPair()) {
  const current = state.providers.get("billing:wechat_pay");
  state.providers.set("billing:wechat_pay", {
    ...current,
    enabled: true,
    configJson: {
      ...(current.configJson ?? {}),
      realCallEnabled: false,
      appId: "wx-app-id",
      mchId: "mch-1000",
      notifyUrl: "https://example.com/billing/wechat-pay/notify",
      returnUrl: "https://example.com/pricing",
    },
    secretJson: {
      merchantSerialNo: "merchant-serial",
      merchantPrivateKeyPem: pair.privateKeyPem,
      apiV3Key,
      platformPublicKeyPem: pair.publicKeyPem,
      platformCertificatePem: "",
    },
    maskedSecretJson: {
      merchantSerialNo: "merc****rial",
      merchantPrivateKeyPem: "[set]",
      apiV3Key: "0123****cdef",
      platformPublicKeyPem: "[set]",
      platformCertificatePem: "",
    },
  });
  return pair;
}

function enableAlipayProvider(state: any, pair = createPemPair()) {
  const current = state.providers.get("billing:alipay");
  state.providers.set("billing:alipay", {
    ...current,
    enabled: true,
    configJson: {
      ...(current.configJson ?? {}),
      realCallEnabled: false,
      appId: "alipay-app-id",
      notifyUrl: "https://example.com/billing/alipay/notify",
      returnUrl: "https://example.com/billing/alipay/return",
      sellerId: "seller-1000",
    },
    secretJson: {
      appPrivateKeyPem: pair.privateKeyPem,
      alipayPublicKeyPem: pair.publicKeyPem,
    },
    maskedSecretJson: {
      appPrivateKeyPem: "[set]",
      alipayPublicKeyPem: "[set]",
    },
  });
  return pair;
}

async function createBillingOrder(
  app: FastifyInstance,
  provider: "wechat_pay" | "alipay",
  productCode = "forecast_credit_20",
) {
  const response = await app.inject({
    method: "POST",
    url: "/billing/orders",
    headers: adminAuthorizationHeader("plain-user"),
    payload: {
      productCode,
      provider,
      clientMode: provider === "wechat_pay" ? "native" : "page",
      returnUrl: "/pricing",
    },
  });

  expect(response.statusCode).toBe(201);
  return response.json() as {
    readonly order: {
      readonly orderNo: string;
      readonly amountCents: number;
      readonly status: string;
      readonly provider: string;
    };
    readonly checkout: {
      readonly kind: string;
      readonly message: string;
    };
  };
}

function createWechatNotifyBody(input: {
  readonly orderNo: string;
  readonly amountCents: number;
  readonly providerTradeNo?: string;
}) {
  const nonce = "0123456789ab";
  const associatedData = "transaction";
  const plaintext = JSON.stringify({
    out_trade_no: input.orderNo,
    transaction_id: input.providerTradeNo ?? "wx-transaction-1",
    trade_state: "SUCCESS",
    amount: {
      total: input.amountCents,
      payer_total: input.amountCents,
      currency: "CNY",
    },
  });
  const ciphertext = encryptWechatResourceForFixture({
    apiV3Key,
    nonce,
    associatedData,
    plaintext,
  });
  return JSON.stringify({
    id: "notify-1",
    create_time: "2026-06-21T08:00:00+08:00",
    event_type: "TRANSACTION.SUCCESS",
    resource_type: "encrypt-resource",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      ciphertext,
      associated_data: associatedData,
      nonce,
    },
    summary: "支付成功",
  });
}

function signedWechatHeaders(rawBody: string, privateKeyPem: string) {
  const timestamp = "1782000000";
  const nonce = "notify-nonce";
  const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
  return {
    "content-type": "application/json",
    "wechatpay-timestamp": timestamp,
    "wechatpay-nonce": nonce,
    "wechatpay-serial": "platform-serial",
    "wechatpay-signature": rsaSha256Sign(message, privateKeyPem),
  };
}

function signedAlipayBody(
  input: {
    readonly orderNo: string;
    readonly totalAmount: string;
    readonly tradeStatus?: string;
  },
  privateKeyPem: string,
) {
  const params = new Map<string, string>([
    ["app_id", "alipay-app-id"],
    ["out_trade_no", input.orderNo],
    ["trade_no", "alipay-trade-1"],
    ["trade_status", input.tradeStatus ?? "TRADE_SUCCESS"],
    ["total_amount", input.totalAmount],
    ["seller_id", "seller-1000"],
    ["sign_type", "RSA2"],
  ]);
  const signature = rsaSha256Sign(alipayCanonicalString(params), privateKeyPem);
  params.set("sign", signature);
  return new URLSearchParams([...params.entries()]).toString();
}

describe("payment routes", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    vi.restoreAllMocks();
  });

  it("lists enabled billing products without authentication", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const response = await app.inject({ method: "GET", url: "/billing/products" });

    expect(response.statusCode).toBe(200);
    expect(response.json().products).toEqual([
      expect.objectContaining({
        code: "forecast_credit_20",
        amountCents: 990,
        currency: "CNY",
      }),
      expect.objectContaining({
        code: "forecast_credit_100",
        amountCents: 3990,
        currency: "CNY",
      }),
    ]);
    expect(response.body).not.toContain("secretJson");
  });

  it("requires authentication and an enabled provider to create orders", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/billing/orders",
      payload: {
        productCode: "forecast_credit_20",
        provider: "wechat_pay",
      },
    });
    const disabledProvider = await app.inject({
      method: "POST",
      url: "/billing/orders",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        productCode: "forecast_credit_20",
        provider: "wechat_pay",
      },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(disabledProvider.statusCode).toBe(400);
    expect(disabledProvider.json()).toMatchObject({
      error: "payment_provider_disabled",
    });
  });

  it("creates a pending mock checkout order without calling a real payment service", async () => {
    const fetcher = vi.fn(() => {
      throw new Error("payment tests must not call real network");
    }) as unknown as typeof fetch;
    const { client, state } = await createFakeDatabaseClient();
    enableWechatProvider(state);
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      paymentFetcher: fetcher,
      logger: false,
    });

    const body = await createBillingOrder(app, "wechat_pay");

    expect(body.order).toMatchObject({
      provider: "wechat_pay",
      amountCents: 990,
      status: "pending",
    });
    expect(body.checkout).toMatchObject({ kind: "mock" });
    expect(JSON.stringify(body)).not.toContain("providerPayloadJson");
    expect(JSON.stringify(body)).not.toContain("merchantPrivateKeyPem");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects invalid WeChat signatures and processes valid notifications idempotently", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const pair = enableWechatProvider(state);
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });
    const { order } = await createBillingOrder(app, "wechat_pay");
    const rawBody = createWechatNotifyBody({
      orderNo: order.orderNo,
      amountCents: order.amountCents,
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/billing/wechat-pay/notify",
      headers: {
        ...signedWechatHeaders(rawBody, pair.privateKeyPem),
        "wechatpay-signature": "invalid-signature",
      },
      payload: rawBody,
    });
    const first = await app.inject({
      method: "POST",
      url: "/billing/wechat-pay/notify",
      headers: signedWechatHeaders(rawBody, pair.privateKeyPem),
      payload: rawBody,
    });
    const second = await app.inject({
      method: "POST",
      url: "/billing/wechat-pay/notify",
      headers: signedWechatHeaders(rawBody, pair.privateKeyPem),
      payload: rawBody,
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "FAIL" });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ code: "SUCCESS" });
    expect(second.statusCode).toBe(200);
    expect(state.paymentOrders.get(order.orderNo)).toMatchObject({
      status: "paid",
      providerTradeNo: "wx-transaction-1",
    });
    expect(state.userEntitlements.size).toBe(1);
    expect(state.userCreditLedger.size).toBe(1);
    expect([...state.paymentNotifications.values()].map((item) => item.status)).toEqual([
      "failed",
      "processed",
      "processed",
    ]);
    expect(JSON.stringify([...state.paymentNotifications.values()])).not.toContain(apiV3Key);
    expect(JSON.stringify([...state.paymentNotifications.values()])).not.toContain(
      pair.privateKeyPem,
    );
  });

  it("rejects WeChat notification amount mismatches without granting entitlements", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const pair = enableWechatProvider(state);
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });
    const { order } = await createBillingOrder(app, "wechat_pay");
    const rawBody = createWechatNotifyBody({
      orderNo: order.orderNo,
      amountCents: order.amountCents + 1,
      providerTradeNo: "wx-bad-amount",
    });

    const response = await app.inject({
      method: "POST",
      url: "/billing/wechat-pay/notify",
      headers: signedWechatHeaders(rawBody, pair.privateKeyPem),
      payload: rawBody,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "FAIL" });
    expect(state.paymentOrders.get(order.orderNo)).toMatchObject({ status: "pending" });
    expect(state.userEntitlements.size).toBe(0);
    expect(state.userCreditLedger.size).toBe(0);
    expect(response.body).not.toContain("PaymentAmountMismatchError");
    expect(response.body).not.toContain("payment-routes.ts");
  });

  it("processes Alipay notifications only when the signature, app, seller, and amount match", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const pair = enableAlipayProvider(state);
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });
    const { order } = await createBillingOrder(app, "alipay");
    const body = signedAlipayBody(
      { orderNo: order.orderNo, totalAmount: "9.90" },
      pair.privateKeyPem,
    );

    const invalid = await app.inject({
      method: "POST",
      url: "/billing/alipay/notify",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: `${body}&sign=bad`,
    });
    const first = await app.inject({
      method: "POST",
      url: "/billing/alipay/notify",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: body,
    });
    const second = await app.inject({
      method: "POST",
      url: "/billing/alipay/notify",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: body,
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).toBe("failure");
    expect(first.statusCode).toBe(200);
    expect(first.body).toBe("success");
    expect(second.statusCode).toBe(200);
    expect(state.paymentOrders.get(order.orderNo)).toMatchObject({
      status: "paid",
      providerTradeNo: "alipay-trade-1",
    });
    expect(state.userEntitlements.size).toBe(1);
    expect(state.userCreditLedger.size).toBe(1);
    expect(JSON.stringify([...state.paymentNotifications.values()])).not.toContain(
      pair.privateKeyPem,
    );
  });

  it("rejects Alipay amount mismatches without granting entitlements", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const pair = enableAlipayProvider(state);
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });
    const { order } = await createBillingOrder(app, "alipay");
    const body = signedAlipayBody(
      { orderNo: order.orderNo, totalAmount: "9.91" },
      pair.privateKeyPem,
    );

    const response = await app.inject({
      method: "POST",
      url: "/billing/alipay/notify",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: body,
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toBe("failure");
    expect(state.paymentOrders.get(order.orderNo)).toMatchObject({ status: "pending" });
    expect(state.userEntitlements.size).toBe(0);
    expect(response.body).not.toContain("PaymentAmountMismatchError");
  });

  it("lets admins manually mark unpaid mock-mode orders paid and writes a safe audit log", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state);
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });
    const { order } = await createBillingOrder(app, "alipay", "forecast_credit_100");

    const response = await app.inject({
      method: "POST",
      url: `/admin/billing/orders/${order.orderNo}/mark-paid`,
      headers: adminAuthorizationHeader("admin-user"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      entitlementGranted: true,
      order: {
        orderNo: order.orderNo,
        status: "paid",
        amountCents: 3990,
      },
    });
    expect(state.userEntitlements.size).toBe(1);
    expect([...state.userEntitlements.values()][0]).toMatchObject({
      quantity: 100,
      remainingQuantity: 100,
    });
    expect(state.auditLogs[0]).toMatchObject({
      actorUserId: "admin-user",
      action: "billing.order.manual_mark_paid",
      targetId: order.orderNo,
    });
    expect(JSON.stringify(state.auditLogs)).not.toContain("appPrivateKeyPem");
    expect(JSON.stringify(state.auditLogs)).not.toContain("secretJson");
  });
});
