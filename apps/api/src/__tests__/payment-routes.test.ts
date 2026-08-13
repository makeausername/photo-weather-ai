import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApiServer } from "../server.js";
import {
  alipayCanonicalString,
  alipayRequestSignContent,
  encryptWechatResourceForFixture,
  rsaSha256Sign,
  rsaSha256Verify,
} from "../payment-security.js";
import { decodeAlipayText, type AlipayCharset } from "../alipay-encoding.js";
import { adminAuthorizationHeader, createFakeDatabaseClient, testAuthConfig } from "./fake-db.js";

const apiV3Key = "0123456789abcdef0123456789abcdef";
const testEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "test",
  BILLING_ALLOW_MANUAL_MARK_PAID: "true",
};
const productionPaymentEnv: NodeJS.ProcessEnv = {
  ...testEnv,
  NODE_ENV: "production",
};
const merchantSiteUrl = "https://zhuguangweather.com";

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

function enableWechatProvider(
  state: any,
  pair = createPemPair(),
  options: {
    readonly mode?: "native" | "h5" | "jsapi" | "auto";
    readonly realCallEnabled?: boolean;
  } = {},
) {
  const current = state.providers.get("billing:wechat_pay");
  state.providers.set("billing:wechat_pay", {
    ...current,
    enabled: true,
    configJson: {
      ...(current.configJson ?? {}),
      realCallEnabled: options.realCallEnabled ?? false,
      mode: options.mode ?? current.configJson?.mode ?? "auto",
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
    readonly charset?: string;
    readonly realCallEnabled?: boolean;
    readonly mode?: "page" | "wap";
    readonly returnUrl?: string;
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
      ...(options.charset ? { charset: options.charset } : {}),
      notifyUrl: "https://example.com/billing/alipay/notify",
      returnUrl: options.returnUrl ?? "https://example.com/billing/alipay/return",
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
  options: {
    readonly clientMode?: string;
    readonly headers?: Record<string, string>;
    readonly returnUrl?: string | null;
  } = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/billing/orders",
    headers: {
      ...adminAuthorizationHeader("plain-user"),
      ...(options.headers ?? {}),
    },
    payload: {
      productCode,
      provider,
      clientMode: options.clientMode ?? "desktop",
      ...(options.returnUrl === null ? {} : { returnUrl: options.returnUrl ?? "/pricing" }),
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
    readonly status?:
      | "created"
      | "pending"
      | "paid"
      | "closed"
      | "canceled"
      | "failed"
      | "refunded";
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

function decodeHtmlResponse(
  response: { readonly rawPayload?: Buffer; readonly body: string },
  charset: AlipayCharset = "GBK",
) {
  const rawPayload = response.rawPayload ?? Buffer.from(response.body, "binary");
  return decodeAlipayText(rawPayload, charset);
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractHiddenFields(html: string): Record<string, string> {
  return Object.fromEntries(
    [...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)">/g)].map((match) => [
      decodeHtmlAttribute(match[1] ?? ""),
      decodeHtmlAttribute(match[2] ?? ""),
    ]),
  );
}

async function postAlipayPagePay(
  app: FastifyInstance,
  checkout: { readonly fields?: Record<string, string> },
) {
  return app.inject({
    method: "POST",
    url: "/billing/alipay/page-pay",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(checkout.fields ?? {}).toString(),
  });
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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });

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

  it("lists only Alipay as a public payment method when Alipay is ready and WeChat is disabled", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), { realCallEnabled: true });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: productionPaymentEnv,
      logger: false,
    });

    const response = await app.inject({ method: "GET", url: "/billing/payment-methods" });

    expect(response.statusCode).toBe(200);
    expect(response.json().methods).toEqual([
      {
        provider: "alipay",
        label: "支付宝支付",
        enabled: true,
        ready: true,
        recommended: true,
      },
    ]);
    expect(response.body).not.toContain("wechat_pay");
    expect(response.body).not.toContain("secretJson");
    expect(response.body).not.toContain("appPrivateKeyPem");
    expect(response.body).not.toContain("alipayPublicKeyPem");
  });

  it("hides disabled billing payment providers from the public method list", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), { realCallEnabled: true });
    const wechatProvider = state.providers.get("billing:wechat_pay");
    state.providers.set("billing:wechat_pay", {
      ...wechatProvider,
      enabled: false,
      configJson: {
        ...(wechatProvider.configJson ?? {}),
        realCallEnabled: true,
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: productionPaymentEnv,
      logger: false,
    });

    const response = await app.inject({ method: "GET", url: "/billing/payment-methods" });

    expect(response.statusCode).toBe(200);
    expect(response.json().methods.map((method: any) => method.provider)).toEqual(["alipay"]);
  });

  it("hides billing payment providers when real calls are disabled", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), { realCallEnabled: true });
    enableWechatProvider(state, createPemPair(), { realCallEnabled: false });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: productionPaymentEnv,
      logger: false,
    });

    const response = await app.inject({ method: "GET", url: "/billing/payment-methods" });

    expect(response.statusCode).toBe(200);
    expect(response.json().methods.map((method: any) => method.provider)).toEqual(["alipay"]);
  });

  it("hides billing payment providers when config readiness fails", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), { realCallEnabled: true });
    const pair = createPemPair();
    enableWechatProvider(state, pair, { realCallEnabled: true });
    const wechatProvider = state.providers.get("billing:wechat_pay");
    state.providers.set("billing:wechat_pay", {
      ...wechatProvider,
      secretJson: {
        ...(wechatProvider.secretJson ?? {}),
        merchantPrivateKeyPem: "",
      },
      maskedSecretJson: {
        ...(wechatProvider.maskedSecretJson ?? {}),
        merchantPrivateKeyPem: "",
      },
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: productionPaymentEnv,
      logger: false,
    });

    const response = await app.inject({ method: "GET", url: "/billing/payment-methods" });

    expect(response.statusCode).toBe(200);
    expect(response.json().methods.map((method: any) => method.provider)).toEqual(["alipay"]);
    expect(response.body).not.toContain("merchantPrivateKeyPem");
    expect(response.body).not.toContain(pair.privateKeyPem);
  });

  it("requires authentication and an enabled provider to create orders", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });

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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });
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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });

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
      env: {
        ...testEnv,
        NODE_ENV: "production",
        PUBLIC_SITE_URL: merchantSiteUrl,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
      },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "monthly_full", {
      returnUrl: "/account?payment_return=alipay&checkoutToken=client",
    });
    const checkout = body.checkout;
    const fields = checkout.fields ?? {};
    const storedOrder = state.paymentOrders.get(body.order.orderNo);
    const productName = state.billingProducts.get("monthly_full").name;
    const expectedReturnUrl = `${merchantSiteUrl}/account?payment_return=alipay&orderNo=${body.order.orderNo}`;

    expect(checkout).toMatchObject({
      kind: "form_post",
      actionUrl: "http://localhost:4000/billing/alipay/page-pay",
      method: "POST",
      charset: "GBK",
    });
    expect(checkout.redirectUrl).toBeUndefined();
    expect(checkout.actionUrl).not.toContain("?");
    expect(fields).toMatchObject({
      orderNo: body.order.orderNo,
      checkoutToken: expect.any(String),
    });
    expect(fields).not.toHaveProperty("sign");
    expect(fields).not.toHaveProperty("biz_content");
    expect(storedOrder?.providerPayloadJson).toMatchObject({
      provider: "alipay",
      method: "alipay.trade.page.pay",
      productCode: "FAST_INSTANT_TRADE_PAY",
      mode: "page",
      configuredMode: "page",
      resolvedMode: "page",
      clientMode: "desktop",
      orderNo: body.order.orderNo,
      gatewayHost: "openapi.alipay.com",
      charset: "GBK",
      signType: "RSA2",
      transportMode: "server_post_form",
      merchantReturnHost: "zhuguangweather.com",
      returnUrlSource: "metadata.returnUrl",
      subjectLength: productName.length,
      subjectPreview: productName.slice(0, 8),
      signContentIncludesSignType: true,
    });
    expect(storedOrder?.metadataJson).toMatchObject({
      clientMode: "desktop",
      returnUrl: "/account?payment_return=alipay",
      merchantReturnUrl: expectedReturnUrl,
    });
    expect(JSON.stringify(storedOrder?.providerPayloadJson)).not.toContain('"sign":');
    expect(JSON.stringify(storedOrder?.providerPayloadJson)).not.toContain("biz_content");
    expect(JSON.stringify(storedOrder?.metadataJson)).not.toContain("checkoutToken");
    expect(JSON.stringify(body)).not.toContain(pair.privateKeyPem);
    expect(JSON.stringify(body)).not.toContain(pair.publicKeyPem);
    expect(JSON.stringify(body)).not.toContain("redirect_url");

    const pagePayResponse = await postAlipayPagePay(app, checkout);
    const html = decodeHtmlResponse(pagePayResponse);
    const pageFields = extractHiddenFields(html);
    const bizContent = JSON.parse(pageFields.biz_content ?? "{}") as Record<string, string>;
    const signContent = alipayRequestSignContent(new Map(Object.entries(pageFields)));

    expect(pagePayResponse.statusCode).toBe(200);
    expect(pagePayResponse.headers["content-type"]).toContain("text/html; charset=GBK");
    expect(html).toContain('<meta charset="GBK">');
    expect(html).toContain('method="post"');
    expect(html).toContain('action="https://openapi.alipay.com/gateway.do"');
    expect(html).toContain('accept-charset="GBK"');
    expect(pageFields).toMatchObject({
      app_id: "alipay-app-id",
      charset: "GBK",
      method: "alipay.trade.page.pay",
      notify_url: "https://example.com/billing/alipay/notify",
      return_url: expectedReturnUrl,
      sign_type: "RSA2",
    });
    expect(pageFields.return_url).toMatch(/^https:\/\/zhuguangweather\.com\//);
    expect(pageFields.return_url).toContain(`orderNo=${body.order.orderNo}`);
    expect(pageFields.return_url).not.toContain("checkoutToken");
    expect(pageFields.sign).toEqual(expect.any(String));
    expect(pageFields.biz_content).not.toContain("\\u");
    expect(bizContent).toMatchObject({
      out_trade_no: body.order.orderNo,
      total_amount: "19.00",
      subject: productName,
      body: "逐光天气会员套餐",
      product_code: "FAST_INSTANT_TRADE_PAY",
    });
    expect(signContent).toContain("sign_type=RSA2");
    expect(signContent).not.toContain("sign=");
    expect(rsaSha256Verify(signContent, pageFields.sign ?? "", pair.publicKeyPem, "GBK")).toBe(
      true,
    );
    expect(JSON.stringify(pageFields)).not.toContain(pair.privateKeyPem);
    expect(JSON.stringify(pageFields)).not.toContain(pair.publicKeyPem);
  });

  it("creates real Alipay wap payments for mobile client mode as POST form payloads", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "page",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
        PUBLIC_SITE_URL: merchantSiteUrl,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
      },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "quarterly_full", {
      clientMode: "mobile_browser",
      returnUrl: "/account?payment_return=alipay",
    });
    const pagePayResponse = await postAlipayPagePay(app, body.checkout);
    const html = decodeHtmlResponse(pagePayResponse);
    const fields = extractHiddenFields(html);
    const bizContent = JSON.parse(fields.biz_content ?? "{}") as Record<string, string>;
    const expectedReturnUrl = `${merchantSiteUrl}/account?payment_return=alipay&orderNo=${body.order.orderNo}`;

    expect(body.checkout).toMatchObject({
      kind: "form_post",
      actionUrl: "http://localhost:4000/billing/alipay/page-pay",
      method: "POST",
      charset: "GBK",
    });
    expect(pagePayResponse.statusCode).toBe(200);
    expect(html).toContain('accept-charset="GBK"');
    expect(state.paymentOrders.get(body.order.orderNo)?.providerPayloadJson).toMatchObject({
      provider: "alipay",
      method: "alipay.trade.wap.pay",
      productCode: "QUICK_WAP_WAY",
      mode: "wap",
      configuredMode: "page",
      resolvedMode: "wap",
      clientMode: "mobile_browser",
      merchantReturnHost: "zhuguangweather.com",
    });
    expect(fields.method).toBe("alipay.trade.wap.pay");
    expect(fields.return_url).toBe(expectedReturnUrl);
    expect(fields.return_url).not.toMatch(/^\/(?!\/)/);
    expect(bizContent.product_code).toBe("QUICK_WAP_WAY");
  });

  it("allows absolute same-origin Alipay return URLs and appends the order number", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "page",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
        PUBLIC_SITE_URL: merchantSiteUrl,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
      },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "yearly_full", {
      returnUrl: `${merchantSiteUrl}/account?payment_return=alipay&utm=campaign`,
    });
    const pagePayResponse = await postAlipayPagePay(app, body.checkout);
    const fields = extractHiddenFields(decodeHtmlResponse(pagePayResponse));
    const expectedReturnUrl = `${merchantSiteUrl}/account?payment_return=alipay&utm=campaign&orderNo=${body.order.orderNo}`;

    expect(pagePayResponse.statusCode).toBe(200);
    expect(fields.return_url).toBe(expectedReturnUrl);
    expect(state.paymentOrders.get(body.order.orderNo)?.metadataJson).toMatchObject({
      returnUrl: `${merchantSiteUrl}/account?payment_return=alipay&utm=campaign`,
      merchantReturnUrl: expectedReturnUrl,
    });
  });

  it("rejects cross-origin billing return URLs before creating a payment order", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "page",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
        PUBLIC_SITE_URL: merchantSiteUrl,
      },
      logger: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/billing/orders",
      headers: adminAuthorizationHeader("plain-user"),
      payload: {
        productCode: "monthly_full",
        provider: "alipay",
        clientMode: "desktop",
        returnUrl: "https://evil.example/account?payment_return=alipay",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_return_url" });
    expect(state.paymentOrders.size).toBe(0);
  });

  it("converts a relative configured Alipay return URL to the public merchant origin", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "page",
      returnUrl: "/billing/alipay/return",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
        PUBLIC_SITE_URL: merchantSiteUrl,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
      },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "monthly_full", {
      returnUrl: null,
    });
    const pagePayResponse = await postAlipayPagePay(app, body.checkout);
    const fields = extractHiddenFields(decodeHtmlResponse(pagePayResponse));
    const expectedReturnUrl = `${merchantSiteUrl}/billing/alipay/return?orderNo=${body.order.orderNo}`;

    expect(pagePayResponse.statusCode).toBe(200);
    expect(fields.return_url).toBe(expectedReturnUrl);
    expect(state.paymentOrders.get(body.order.orderNo)?.metadataJson).toMatchObject({
      returnUrl: null,
      merchantReturnUrl: expectedReturnUrl,
    });
    expect(state.paymentOrders.get(body.order.orderNo)?.providerPayloadJson).toMatchObject({
      merchantReturnHost: "zhuguangweather.com",
      returnUrlSource: "provider_config",
    });
  });

  it("keeps the Alipay browser return route as an order-preserving fallback", async () => {
    const { client } = await createFakeDatabaseClient();
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });

    const outTradeNo = await app.inject({
      method: "GET",
      url: "/billing/alipay/return?out_trade_no=ML202606290001&trade_status=TRADE_SUCCESS",
    });
    const orderNo = await app.inject({
      method: "GET",
      url: "/billing/alipay/return?orderNo=ML202606290002",
    });
    const noOrder = await app.inject({
      method: "GET",
      url: "/billing/alipay/return",
    });

    expect(outTradeNo.statusCode).toBe(302);
    expect(outTradeNo.headers.location).toBe(
      "/account?payment_return=alipay&orderNo=ML202606290001",
    );
    expect(orderNo.headers.location).toBe("/account?payment_return=alipay&orderNo=ML202606290002");
    expect(noOrder.headers.location).toBe("/account?payment_return=alipay");
  });

  it("accepts explicitly configured UTF-8 for Alipay page-pay transport", async () => {
    const { client, state } = await createFakeDatabaseClient();
    enableAlipayProvider(state, createPemPair(), {
      charset: "utf-8",
      realCallEnabled: true,
      mode: "page",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
        PUBLIC_SITE_URL: merchantSiteUrl,
        NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000",
      },
      logger: false,
    });

    const body = await createBillingOrder(app, "alipay", "monthly_full");
    const pagePayResponse = await postAlipayPagePay(app, body.checkout);
    const html = decodeHtmlResponse(pagePayResponse, "UTF-8");
    const fields = extractHiddenFields(html);

    expect(body.checkout).toMatchObject({
      kind: "form_post",
      charset: "UTF-8",
    });
    expect(pagePayResponse.headers["content-type"]).toContain("text/html; charset=UTF-8");
    expect(html).toContain('<meta charset="UTF-8">');
    expect(html).toContain('accept-charset="UTF-8"');
    expect(fields.charset).toBe("UTF-8");
    expect(fields.return_url).toMatch(/^https:\/\/zhuguangweather\.com\/pricing\?orderNo=/);
  });

  it("creates WeChat Native QR payments for desktop auto mode", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(JSON.stringify({ code_url: "weixin://wxpay/bizpayurl?pr=desktop" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const { client, state } = await createFakeDatabaseClient();
    enableWechatProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "auto",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
      },
      paymentFetcher: fetcher,
      logger: false,
    });

    const body = await createBillingOrder(app, "wechat_pay", "monthly_full", {
      clientMode: "desktop",
    });
    const [, init] = (fetcher as any).mock.calls[0] ?? [];
    const requestBody = JSON.parse(String((init as RequestInit).body));

    expect(String((fetcher as any).mock.calls[0]?.[0])).toBe(
      "https://api.mch.weixin.qq.com/v3/pay/transactions/native",
    );
    expect(requestBody).toMatchObject({
      appid: "wx-app-id",
      mchid: "mch-1000",
      out_trade_no: body.order.orderNo,
      notify_url: "https://example.com/billing/wechat-pay/notify",
      amount: {
        total: 1900,
        currency: "CNY",
      },
    });
    expect(body.checkout).toMatchObject({
      kind: "qr_code",
      codeUrl: "weixin://wxpay/bizpayurl?pr=desktop",
    });
    expect(state.paymentOrders.get(body.order.orderNo)?.providerPayloadJson).toMatchObject({
      provider: "wechat_pay",
      configuredMode: "auto",
      resolvedMode: "native",
      clientMode: "desktop",
      endpoint: "/v3/pay/transactions/native",
      transportMode: "wechat_native_qr",
    });
  });

  it("creates WeChat H5 redirect payments for mobile browser auto mode", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          mweb_url: "https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx-h5",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as unknown as typeof fetch;
    const { client, state } = await createFakeDatabaseClient();
    enableWechatProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "auto",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
      },
      paymentFetcher: fetcher,
      logger: false,
    });

    const body = await createBillingOrder(app, "wechat_pay", "monthly_full", {
      clientMode: "mobile_browser",
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.2" },
      returnUrl: "/account?payment_return=wechat_pay",
    });
    const [, init] = (fetcher as any).mock.calls[0] ?? [];
    const requestBody = JSON.parse(String((init as RequestInit).body));

    expect(String((fetcher as any).mock.calls[0]?.[0])).toBe(
      "https://api.mch.weixin.qq.com/v3/pay/transactions/h5",
    );
    expect(requestBody).toMatchObject({
      appid: "wx-app-id",
      mchid: "mch-1000",
      out_trade_no: body.order.orderNo,
      scene_info: {
        payer_client_ip: "203.0.113.9",
        h5_info: {
          type: "Wap",
          app_name: "逐光天气",
          app_url: "https://example.com",
        },
      },
    });
    expect(body.checkout).toMatchObject({
      kind: "redirect_url",
      redirectUrl: "https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=wx-h5",
      message: "正在唤起微信支付...",
    });
    expect(state.paymentOrders.get(body.order.orderNo)?.providerPayloadJson).toMatchObject({
      provider: "wechat_pay",
      configuredMode: "auto",
      resolvedMode: "h5",
      clientMode: "mobile_browser",
      endpoint: "/v3/pay/transactions/h5",
      transportMode: "wechat_h5_redirect",
      appUrlHost: "example.com",
      mwebUrlHost: "wx.tenpay.com",
    });
    expect(
      JSON.stringify(state.paymentOrders.get(body.order.orderNo)?.providerPayloadJson),
    ).not.toContain("prepay_id=wx-h5");
  });

  it("does not fake WeChat JSAPI inside the WeChat browser", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("JSAPI unsupported path must not call WeChat H5 or Native APIs");
    }) as unknown as typeof fetch;
    const { client, state } = await createFakeDatabaseClient();
    enableWechatProvider(state, createPemPair(), {
      realCallEnabled: true,
      mode: "auto",
    });
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: {
        ...testEnv,
        NODE_ENV: "production",
      },
      paymentFetcher: fetcher,
      logger: false,
    });

    const body = await createBillingOrder(app, "wechat_pay", "monthly_full", {
      clientMode: "wechat_browser",
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(body.checkout).toMatchObject({
      kind: "mock",
      message: "微信内浏览器支付需要 JSAPI 授权，当前请在系统浏览器打开或使用支付宝。",
    });
    expect(state.paymentOrders.get(body.order.orderNo)?.providerPayloadJson).toMatchObject({
      provider: "wechat_pay",
      configuredMode: "auto",
      resolvedMode: "jsapi",
      clientMode: "wechat_browser",
      transportMode: "wechat_jsapi_unsupported",
    });
  });

  it("rejects invalid WeChat signatures and processes valid notifications idempotently", async () => {
    const { client, state } = await createFakeDatabaseClient();
    const pair = enableWechatProvider(state);
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });
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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });
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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });
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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });
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
    app = buildApiServer({
      dbClient: client,
      authConfig: testAuthConfig,
      env: testEnv,
      logger: false,
    });
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
