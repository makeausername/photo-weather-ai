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

function stripPemEnvelope(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
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

function enableAlipayProvider(
  state: any,
  pair = createPemPair(),
  options: {
    readonly realCallEnabled?: boolean;
    readonly mode?: "page" | "wap";
    readonly appPrivateKeyPem?: string;
    readonly alipayPublicKeyPem?: string;
  } = {},
) {
  const current = state.providers.get("billing:alipay");
  state.providers.set("billing:alipay", {
    ...current,
    enabled: true,
    configJson: {
      ...(current.configJson ?? {}),
      realCallEnabled: options.realCallEnabled ?? false,
      mode: options.mode ?? "page",
      appId: "alipay-app-id",
      notifyUrl: "https://example.com/billing/alipay/notify",
      returnUrl: "https://example.com/billing/alipay/return",
      sellerId: "seller-1000",
    },
    secretJson: {
      appPrivateKeyPem: options.appPrivateKeyPem ?? pair.privateKeyPem,
      alipayPublicKeyPem: options.alipayPublicKeyPem ?? pair.publicKeyPem,
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
  productCode = "monthly_full",
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
      readonly actionUrl?: string;
      readonly method?: string;
      readonly charset?: string;
      readonly fields?: Record<string, string>;
      readonly redirectUrl?: string;
    };
  };
}

function insertStoredPaymentOrder(
  state: any,
  input: {
    readonly orderNo: string;
    readonly productCode: string;
    readonly amountCents: number;
    readonly provider?: "mock" | "wechat_pay" | "alipay";
    readonly userId?: string;
    readonly status?: "created" | "pending" | "paid" | "closed" | "canceled" | "failed" | "refunded";
    readonly createdAt?: Date;
    readonly paidAt?: Date | null;
    readonly providerTradeNo?: string | null;
    readonly metadataJson?: Record<string, unknown> | null;
  },
) {
  const now = input.createdAt ?? new Date("2026-06-21T08:00:00.000Z");
  const order = {
    id: `payment-order-${state.paymentOrders.size}`,
    orderNo: input.orderNo,
    userId: input.userId ?? "plain-user",
    provider: input.provider ?? "wechat_pay",
    amountCents: input.amountCents,
    currency: "CNY",
    productCode: input.productCode,
    productId: state.billingProducts.get(input.productCode)?.id ?? null,
    status: input.status ?? "paid",
    paidAt: input.paidAt === undefined ? now : input.paidAt,
    expiresAt: null,
    providerTradeNo: input.providerTradeNo ?? `trade:${input.orderNo}`,
    providerPayloadJson: null,
    metadataJson: input.metadataJson ?? null,
    entitlementGrantedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  state.paymentOrders.set(order.orderNo, order);
  return order;
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

  it("lists only public purchasable full-access billing products without authentication", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const response = await app.inject({ method: "GET", url: "/billing/products" });

    expect(response.statusCode).toBe(200);
    expect(response.json().products).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "monthly_full",
          amountCents: 1900,
          currency: "CNY",
        }),
        expect.objectContaining({
          code: "quarterly_full",
          amountCents: 4900,
          currency: "CNY",
        }),
        expect.objectContaining({
          code: "yearly_full",
          amountCents: 16800,
          currency: "CNY",
        }),
      ]),
    );
    expect(response.json().products.map((product: any) => product.code)).toEqual([
      "monthly_full",
      "quarterly_full",
      "yearly_full",
    ]);
    expect(response.json().products).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "trial_7_days" })]),
    );
    expect(response.body).not.toContain("metadataJson");
    expect(response.body).not.toContain("grantType");
    expect(response.body).not.toContain("secretJson");
  });

  it("requires authentication and an enabled provider to create orders", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const unauthenticated = await app.inject({
      method: "POST",
      url: "/billing/orders",
      payload: {
        productCode: "monthly_full",
        provider: "wechat_pay",
      },
    });
    const disabledProvider = await app.inject({
      method: "POST",
      url: "/billing/orders",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        productCode: "monthly_full",
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
      amountCents: 1900,
      status: "pending",
    });
    expect(body.checkout).toMatchObject({ kind: "mock" });
    expect(JSON.stringify(body)).not.toContain("providerPayloadJson");
    expect(JSON.stringify(body)).not.toContain("merchantPrivateKeyPem");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects trial purchases, ignores frontend amount tampering, and blocks disabled products", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableWechatProvider(state);
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });

    const trial = await app.inject({
      method: "POST",
      url: "/billing/orders",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        productCode: "trial_7_days",
        provider: "wechat_pay",
      },
    });
    const tampered = await app.inject({
      method: "POST",
      url: "/billing/orders",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        productCode: "monthly_full",
        provider: "wechat_pay",
        amountCents: 1,
        durationDays: 365,
        grantType: "full_forecast_access",
      },
    });
    state.billingProducts.set("monthly_full", {
      ...state.billingProducts.get("monthly_full"),
      enabled: false,
    });
    const disabled = await app.inject({
      method: "POST",
      url: "/billing/orders",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        productCode: "monthly_full",
        provider: "wechat_pay",
      },
    });

    expect(trial.statusCode).toBe(403);
    expect(trial.json()).toMatchObject({ error: "product_not_purchasable" });
    expect(tampered.statusCode).toBe(201);
    expect(tampered.json().order).toMatchObject({
      productCode: "monthly_full",
      amountCents: 1900,
    });
    expect(JSON.stringify(state.paymentOrders.get(tampered.json().order.orderNo))).not.toContain(
      "365",
    );
    expect(disabled.statusCode).toBe(404);
    expect(disabled.json()).toMatchObject({ error: "product_not_found" });
  });

  it("filters registration trial grants out of user billing orders and direct order lookup", async () => {
    const { client, state } = await createFakeDatabaseClient();
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });
    const monthly = insertStoredPaymentOrder(state, {
      orderNo: "PUSERMONTHLY",
      productCode: "monthly_full",
      amountCents: 1900,
      createdAt: new Date("2026-06-21T08:00:00.000Z"),
    });
    insertStoredPaymentOrder(state, {
      orderNo: "PUSERQUARTERLY",
      productCode: "quarterly_full",
      amountCents: 4900,
      createdAt: new Date("2026-06-21T08:01:00.000Z"),
    });
    insertStoredPaymentOrder(state, {
      orderNo: "PUSERYEARLY",
      productCode: "yearly_full",
      amountCents: 16800,
      createdAt: new Date("2026-06-21T08:02:00.000Z"),
    });
    const trial = insertStoredPaymentOrder(state, {
      orderNo: "TUSERTRIAL",
      productCode: "trial_7_days",
      amountCents: 0,
      provider: "mock",
      createdAt: new Date("2026-06-21T08:03:00.000Z"),
      providerTradeNo: "registration_trial:plain-user",
      metadataJson: {
        internal: true,
        source: "registration_trial",
      },
    });

    const list = await app.inject({
      method: "GET",
      url: "/billing/orders?limit=2",
      headers: adminAuthorizationHeader("plain-user"),
    });
    const detail = await app.inject({
      method: "GET",
      url: `/billing/orders/${trial.orderNo}`,
      headers: adminAuthorizationHeader("plain-user"),
    });
    const paidDetail = await app.inject({
      method: "GET",
      url: `/billing/orders/${monthly.orderNo}`,
      headers: adminAuthorizationHeader("plain-user"),
    });

    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((order: any) => order.orderNo)).toEqual([
      "PUSERYEARLY",
      "PUSERQUARTERLY",
    ]);
    expect(JSON.stringify(list.json())).not.toContain("TUSERTRIAL");
    expect(JSON.stringify(list.json())).not.toContain("registration_trial");
    expect(detail.statusCode).toBe(404);
    expect(detail.json()).toMatchObject({ error: "order_not_found" });
    expect(paidDetail.statusCode).toBe(200);
    expect(paidDetail.json().order).toMatchObject({
      orderNo: "PUSERMONTHLY",
      productCode: "monthly_full",
      amountCents: 1900,
    });
  });

  it("uses the current DB product amount and duration for paid full-access orders", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state);
    state.billingProducts.set("monthly_full", {
      ...state.billingProducts.get("monthly_full"),
      amountCents: 2500,
      durationDays: 45,
    });
    app = buildApiServer({ dbClient: client, authConfig: testAuthConfig, env: testEnv, logger: false });

    const { order } = await createBillingOrder(app, "alipay", "monthly_full");
    const response = await app.inject({
      method: "POST",
      url: `/admin/billing/orders/${order.orderNo}/mark-paid`,
      headers: adminAuthorizationHeader("admin-user"),
    });

    expect(order.amountCents).toBe(2500);
    expect(response.statusCode).toBe(200);
    expect([...state.userEntitlements.values()][0]).toMatchObject({
      type: "full_forecast_access",
      metadataJson: expect.objectContaining({
        productCode: "monthly_full",
        durationDays: 45,
      }),
    });
  });

  it("creates real Alipay page payments as POST form payloads with bare keys", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const pair = createPemPair();
    enableAlipayProvider(state, pair, {
      realCallEnabled: true,
      mode: "page",
      appPrivateKeyPem: stripPemEnvelope(pair.privateKeyPem),
      alipayPublicKeyPem: stripPemEnvelope(pair.publicKeyPem),
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: { ...testEnv, NODE_ENV: "production" },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "monthly_full");
    const checkout = body.checkout;
    const fields = checkout.fields ?? {};
    const bizContent = JSON.parse(fields.biz_content ?? "{}") as Record<string, string>;
    const storedOrder = state.paymentOrders.get(body.order.orderNo);

    expect(checkout).toMatchObject({
      kind: "form_post",
      actionUrl: "https://openapi.alipay.com/gateway.do",
      method: "POST",
      charset: "utf-8",
    });
    expect(checkout.redirectUrl).toBeUndefined();
    expect(checkout.actionUrl).not.toContain("?");
    expect(fields).toMatchObject({
      app_id: "alipay-app-id",
      method: "alipay.trade.page.pay",
      sign_type: "RSA2",
      notify_url: "https://example.com/billing/alipay/notify",
      return_url: "/pricing",
    });
    expect(fields.sign).toEqual(expect.any(String));
    expect(bizContent).toMatchObject({
      out_trade_no: body.order.orderNo,
      total_amount: "19.00",
      subject: "月卡",
      product_code: "FAST_INSTANT_TRADE_PAY",
    });
    expect(storedOrder?.providerPayloadJson).toMatchObject({
      provider: "alipay",
      method: "alipay.trade.page.pay",
      mode: "page",
      orderNo: body.order.orderNo,
      gatewayHost: "openapi.alipay.com",
      charset: "utf-8",
      signType: "RSA2",
      transportMode: "server_post_form",
    });
    expect(JSON.stringify(storedOrder?.providerPayloadJson)).not.toContain('"sign":');
    expect(JSON.stringify(storedOrder?.providerPayloadJson)).not.toContain("biz_content");
    expect(JSON.stringify(body)).not.toContain(pair.privateKeyPem);
    expect(JSON.stringify(body)).not.toContain(pair.publicKeyPem);
    expect(JSON.stringify(body)).not.toContain("redirect_url");
  });

  it("creates real Alipay wap payments as POST form payloads", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "wap",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: { ...testEnv, NODE_ENV: "production" },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "quarterly_full");
    const fields = body.checkout.fields ?? {};
    const bizContent = JSON.parse(fields.biz_content ?? "{}") as Record<string, string>;

    expect(body.checkout).toMatchObject({
      kind: "form_post",
      actionUrl: "https://openapi.alipay.com/gateway.do",
      method: "POST",
    });
    expect(fields.method).toBe("alipay.trade.wap.pay");
    expect(bizContent.product_code).toBe("QUICK_WAP_WAY");
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
      { orderNo: order.orderNo, totalAmount: "19.00" },
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
    const { order } = await createBillingOrder(app, "alipay", "yearly_full");

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
        amountCents: 16800,
      },
    });
    expect(state.userEntitlements.size).toBe(1);
    expect([...state.userEntitlements.values()][0]).toMatchObject({
      type: "full_forecast_access",
      metadataJson: expect.objectContaining({
        productCode: "yearly_full",
        durationDays: 365,
      }),
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
