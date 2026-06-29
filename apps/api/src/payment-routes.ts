import { createHmac, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  assertUserOwnsPaymentOrder,
  createAuditLog,
  createPaymentOrder,
  getBillingProductByCode,
  getPaymentOrderByOrderNo,
  grantPaymentEntitlementOnce,
  isPublicPurchasableBillingProduct,
  isUserVisibleBillingOrder,
  listPublicBillingProducts,
  listUserEntitlements,
  listUserVisibleBillingOrders,
  markPaymentOrderPaid,
  PaymentAmountMismatchError,
  PaymentOrderAccessDeniedError,
  PaymentOrderNotFoundError,
  recordPaymentNotification,
  updatePaymentNotificationStatus,
  updatePaymentOrderStatus,
} from "@photo-weather/db";
import type {
  AuthenticatedPrincipal,
  DatabaseClient,
  JsonValue,
  PaymentOrderRecord,
  PaymentProviderCode,
} from "@photo-weather/db";
import { z } from "zod";
import type { AuthConfig, AuthenticatedRequestContext } from "./auth-routes.js";
import { authenticateRequest, requirePermission } from "./auth-routes.js";
import { AlipayProvider } from "./alipay-provider.js";
import { encodeAlipayText, type AlipayCharset } from "./alipay-encoding.js";
import { renderAlipayPagePayFormHtml } from "./alipay-page-pay-form.js";
import {
  checkBillingProviderConfig,
  readRuntimeBillingProviderConfig,
  type BillingProviderRuntimeConfig,
  type PaymentProvider,
  type PublicCheckoutPayload,
} from "./payment-provider.js";
import { isPlainRecord, sanitizePaymentErrorMessage } from "./payment-security.js";
import { WechatPayProvider } from "./wechat-pay-provider.js";

export type PaymentRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
};

type RawBodyRequest = FastifyRequest & {
  rawBody?: string;
  rawBodyBytes?: Buffer;
};

const createOrderSchema = z.object({
  productCode: z.string().trim().min(1).max(120),
  provider: z.enum(["wechat_pay", "alipay"]),
  clientMode: z.string().trim().max(40).optional(),
  returnUrl: z.string().trim().max(1000).optional(),
});

const listOrdersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const orderParamsSchema = z.object({
  orderNo: z.string().trim().min(1).max(80),
});

const alipayPagePaySchema = z.object({
  checkoutToken: z.string().trim().min(20).max(3000),
  orderNo: z.string().trim().min(1).max(80),
});

const authRequiredMessage = "请先登录后再操作。";
const publicBillingPaymentProviders = ["alipay", "wechat_pay"] as const;

type PublicBillingPaymentProvider = (typeof publicBillingPaymentProviders)[number];

type PublicBillingPaymentMethod = {
  readonly provider: PublicBillingPaymentProvider;
  readonly label: string;
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly recommended: boolean;
};

function sendZodError(reply: FastifyReply, error: z.ZodError): FastifyReply {
  return reply.status(400).send({
    error: "validation_error",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function sendError(reply: FastifyReply, statusCode: number, error: string, message: string) {
  return reply.status(statusCode).send({ error, message });
}

function publicBillingPaymentMethodLabel(provider: PublicBillingPaymentProvider): string {
  return provider === "alipay" ? "支付宝支付" : "微信支付";
}

function publicBillingPaymentMethodRecommended(provider: PublicBillingPaymentProvider): boolean {
  return provider === "alipay";
}

async function readPublicBillingPaymentMethod(input: {
  readonly client?: DatabaseClient;
  readonly env: NodeJS.ProcessEnv;
  readonly providerCode: PublicBillingPaymentProvider;
}): Promise<PublicBillingPaymentMethod | null> {
  const check = await checkBillingProviderConfig({
    providerCode: input.providerCode,
    dbClient: input.client,
    env: input.env,
  });
  const ready = check.enabled && check.realCallEnabled && check.configReady;
  if (!ready) {
    return null;
  }

  return {
    provider: input.providerCode,
    label: publicBillingPaymentMethodLabel(input.providerCode),
    enabled: true,
    ready: true,
    recommended: publicBillingPaymentMethodRecommended(input.providerCode),
  };
}

async function listPublicBillingPaymentMethods(input: {
  readonly client?: DatabaseClient;
  readonly env: NodeJS.ProcessEnv;
}): Promise<readonly PublicBillingPaymentMethod[]> {
  const methods = await Promise.all(
    publicBillingPaymentProviders.map((providerCode) =>
      readPublicBillingPaymentMethod({
        client: input.client,
        env: input.env,
        providerCode,
      }),
    ),
  );
  return methods.filter((method): method is PublicBillingPaymentMethod => Boolean(method));
}

function compactJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

type AlipayCheckoutTokenPayload = {
  readonly amountCents: number;
  readonly exp: number;
  readonly orderNo: string;
  readonly productCode: string;
  readonly userId: string;
  readonly v: 1;
};

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signCheckoutTokenPayload(payload: string, authConfig: AuthConfig): string {
  return createHmac("sha256", authConfig.jwtSecret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createAlipayCheckoutToken(
  order: PaymentOrderRecord,
  authConfig: AuthConfig,
  now: Date = new Date(),
): string {
  const payload = base64UrlJson({
    amountCents: order.amountCents,
    exp: Math.floor((now.getTime() + 30 * 60 * 1000) / 1000),
    orderNo: order.orderNo,
    productCode: order.productCode,
    userId: order.userId,
    v: 1,
  } satisfies AlipayCheckoutTokenPayload);
  return `${payload}.${signCheckoutTokenPayload(payload, authConfig)}`;
}

function verifyAlipayCheckoutToken(input: {
  readonly authConfig: AuthConfig;
  readonly now?: Date;
  readonly order: PaymentOrderRecord;
  readonly token: string;
}): boolean {
  const [payloadText, signature, ...extra] = input.token.split(".");
  if (!payloadText || !signature || extra.length > 0) {
    return false;
  }

  if (!safeEqual(signature, signCheckoutTokenPayload(payloadText, input.authConfig))) {
    return false;
  }

  let payload: AlipayCheckoutTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadText, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  return (
    payload.v === 1 &&
    payload.exp > nowSeconds &&
    payload.orderNo === input.order.orderNo &&
    payload.userId === input.order.userId &&
    payload.productCode === input.order.productCode &&
    payload.amountCents === input.order.amountCents
  );
}

async function requireBillingAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  authConfig: AuthConfig,
): Promise<AuthenticatedRequestContext | null> {
  try {
    return await authenticateRequest(request, client, authConfig);
  } catch (error) {
    const authError = error as { readonly statusCode?: number; readonly code?: string };
    if (authError.statusCode === 401 || authError.statusCode === 403) {
      reply.status(authError.statusCode).send({
        error: authError.code ?? "unauthenticated",
        message: authRequiredMessage,
      });
      return null;
    }
    throw error;
  }
}

function orderResponse(order: PaymentOrderRecord) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    provider: order.provider,
    amountCents: order.amountCents,
    currency: order.currency,
    productCode: order.productCode,
    status: order.status,
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    providerTradeNo: order.providerTradeNo,
    entitlementGrantedAt: order.entitlementGrantedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function entitlementResponse(entitlement: {
  readonly id: string;
  readonly type: string;
  readonly quantity: number;
  readonly remainingQuantity: number | null;
  readonly startsAt: Date;
  readonly expiresAt: Date | null;
  readonly grantedAt: Date;
}) {
  return {
    id: entitlement.id,
    type: entitlement.type,
    quantity: entitlement.quantity,
    remainingQuantity: entitlement.remainingQuantity,
    startsAt: entitlement.startsAt.toISOString(),
    expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    grantedAt: entitlement.grantedAt.toISOString(),
  };
}

function headersToLower(headers: FastifyRequest["headers"]): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase(),
      Array.isArray(value) ? value.join(",") : value === undefined ? undefined : String(value),
    ]),
  );
}

function safeHeadersForStorage(headers: Record<string, string | undefined>): JsonValue {
  const redacted = new Set(["authorization", "cookie", "wechatpay-signature"]);
  return compactJson(
    Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        key,
        redacted.has(key.toLowerCase()) ? "[redacted]" : value ?? "",
      ]),
    ),
  );
}

function normalizeReturnUrl(value: string | undefined, env: NodeJS.ProcessEnv): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  const allowedBase = env.SITE_BASE_URL ?? env.PUBLIC_SITE_BASE_URL ?? env.NEXT_PUBLIC_SITE_URL;
  if (!allowedBase) {
    throw new Error("returnUrl must be a relative URL when site base URL is not configured.");
  }
  const allowed = new URL(allowedBase);
  const parsed = new URL(trimmed);
  if (parsed.origin !== allowed.origin) {
    throw new Error("returnUrl origin is not allowed.");
  }
  return parsed.toString();
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeClientIpCandidate(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const withoutIpv4Port = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/)?.[1];
  return (withoutIpv4Port ?? trimmed).slice(0, 64);
}

function resolveClientIp(request: FastifyRequest): string | null {
  const forwarded = firstHeaderValue(request.headers["x-forwarded-for"])
    ?.split(",")
    .map((item) => normalizeClientIpCandidate(item))
    .find((item): item is string => Boolean(item));
  return forwarded ?? normalizeClientIpCandidate(request.ip);
}

function resolveApiActionUrl(
  request: FastifyRequest,
  env: NodeJS.ProcessEnv,
  pathOrUrl: string,
): string {
  if (!pathOrUrl.startsWith("/")) {
    return pathOrUrl;
  }

  const configuredBase =
    env.NEXT_PUBLIC_API_BASE_URL ?? env.PUBLIC_API_BASE_URL ?? env.API_BASE_URL;
  if (configuredBase) {
    return new URL(pathOrUrl, configuredBase).toString();
  }

  const forwardedHost = firstHeaderValue(request.headers["x-forwarded-host"]);
  const forwardedProto = firstHeaderValue(request.headers["x-forwarded-proto"]);
  const host = forwardedHost ?? request.headers.host ?? "localhost:4000";
  const protocol = forwardedProto?.split(",")[0]?.trim() || request.protocol || "http";
  return new URL(pathOrUrl, `${protocol}://${host}`).toString();
}

function attachAlipayCheckoutProof(input: {
  readonly authConfig: AuthConfig;
  readonly env: NodeJS.ProcessEnv;
  readonly order: PaymentOrderRecord;
  readonly payload: PublicCheckoutPayload;
  readonly request: FastifyRequest;
}): PublicCheckoutPayload {
  if (input.payload.kind !== "form_post") {
    return input.payload;
  }

  return {
    ...input.payload,
    actionUrl: resolveApiActionUrl(input.request, input.env, input.payload.actionUrl),
    fields: {
      ...input.payload.fields,
      checkoutToken: createAlipayCheckoutToken(input.order, input.authConfig),
    },
  };
}

function readUrlEncodedFormBody(request: FastifyRequest): Record<string, string> {
  const rawBody = typeof request.body === "string" ? request.body : "";
  return Object.fromEntries(new URLSearchParams(rawBody).entries());
}

function readOrderReturnUrl(order: PaymentOrderRecord): string | null {
  const metadata = isPlainRecord(order.metadataJson) ? order.metadataJson : {};
  const returnUrl = metadata.returnUrl;
  return typeof returnUrl === "string" && returnUrl.trim() ? returnUrl.trim() : null;
}

function readOrderClientMode(order: PaymentOrderRecord): string | undefined {
  const metadata = isPlainRecord(order.metadataJson) ? order.metadataJson : {};
  const clientMode = metadata.clientMode;
  return typeof clientMode === "string" && clientMode.trim() ? clientMode.trim() : undefined;
}

function htmlHeaders(charset: AlipayCharset): Record<string, string> {
  return {
    "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    "Content-Type": `text/html; charset=${charset}`,
    Expires: "0",
    Pragma: "no-cache",
  };
}

function htmlError(reply: FastifyReply, message: string, statusCode: number): FastifyReply {
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body>
  <p>${escapeHtml(message)}</p>
  <p><a href="/pricing">返回定价页</a></p>
</body>
</html>`;
  return reply
    .status(statusCode)
    .headers(htmlHeaders("UTF-8"))
    .send(Buffer.from(encodeAlipayText(html, "UTF-8")));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      default:
        return "&gt;";
    }
  });
}

async function createPaymentProvider(input: {
  readonly providerCode: "wechat_pay" | "alipay";
  readonly dbClient?: DatabaseClient;
  readonly env: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
}): Promise<{
  readonly config: BillingProviderRuntimeConfig;
  readonly provider: PaymentProvider;
}> {
  const config = await readRuntimeBillingProviderConfig({
    providerCode: input.providerCode,
    dbClient: input.dbClient,
    env: input.env,
  });
  return {
    config,
    provider:
      config.providerCode === "wechat_pay"
        ? new WechatPayProvider(config, input.fetcher)
        : new AlipayProvider(config),
  };
}

function providerFailureResponse(
  provider: PaymentProviderCode,
  reply: FastifyReply,
  message: string,
) {
  if (provider === "wechat_pay") {
    return reply.status(400).send({ code: "FAIL", message });
  }
  return reply.status(400).type("text/plain").send("failure");
}

function providerSuccessResponse(provider: PaymentProviderCode, reply: FastifyReply) {
  if (provider === "wechat_pay") {
    return reply.send({ code: "SUCCESS", message: "OK" });
  }
  return reply.type("text/plain").send("success");
}

async function handleProviderNotify(input: {
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
  readonly dbClient?: DatabaseClient;
  readonly env: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
  readonly providerCode: "wechat_pay" | "alipay";
}) {
  const request = input.request as RawBodyRequest;
  const rawBody =
    request.rawBody ??
    (typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {}));
  const headers = headersToLower(request.headers);
  const notification = await recordPaymentNotification(
    {
      provider: input.providerCode,
      rawBody,
      headersJson: safeHeadersForStorage(headers),
      status: "received",
    },
    { client: input.dbClient },
  );

  const { provider } = await createPaymentProvider({
    providerCode: input.providerCode,
    dbClient: input.dbClient,
    env: input.env,
    fetcher: input.fetcher,
  });
  const verification = await provider.verifyNotification({
    rawBody,
    rawBodyBytes: request.rawBodyBytes,
    headers,
  });
  if (!verification.ok) {
    await updatePaymentNotificationStatus(
      {
        id: notification.id,
        status: "failed",
        signatureVerified: false,
        orderNo: verification.parsed?.orderNo ?? null,
        providerTradeNo: verification.parsed?.providerTradeNo ?? null,
        errorMessage: verification.safeMessage,
      },
      { client: input.dbClient },
    );
    return providerFailureResponse(input.providerCode, input.reply, verification.safeMessage);
  }

  if (verification.parsed.status !== "paid") {
    await updatePaymentNotificationStatus(
      {
        id: notification.id,
        status: "ignored",
        signatureVerified: true,
        orderNo: verification.parsed.orderNo,
        providerTradeNo: verification.parsed.providerTradeNo ?? null,
      },
      { client: input.dbClient },
    );
    return providerSuccessResponse(input.providerCode, input.reply);
  }

  try {
    await markPaymentOrderPaid(
      {
        orderNo: verification.parsed.orderNo,
        provider: input.providerCode,
        amountCents: verification.parsed.amountCents,
        providerTradeNo: verification.parsed.providerTradeNo ?? null,
        providerPayloadJson: verification.parsed.rawJson ?? null,
      },
      { client: input.dbClient },
    );
    const grantResult = await grantPaymentEntitlementOnce(
      { orderNo: verification.parsed.orderNo },
      { client: input.dbClient },
    );
    await updatePaymentNotificationStatus(
      {
        id: notification.id,
        status: "processed",
        signatureVerified: true,
        orderNo: verification.parsed.orderNo,
        providerTradeNo: verification.parsed.providerTradeNo ?? null,
      },
      { client: input.dbClient },
    );
    input.request.log.info(
      {
        provider: input.providerCode,
        orderNo: verification.parsed.orderNo,
        entitlementGranted: grantResult.granted,
      },
      "Processed billing notification",
    );
    return providerSuccessResponse(input.providerCode, input.reply);
  } catch (error) {
    const safeMessage =
      error instanceof PaymentAmountMismatchError
        ? "支付通知金额与订单金额不一致。"
        : sanitizePaymentErrorMessage(error, "支付通知处理失败。");
    await updatePaymentNotificationStatus(
      {
        id: notification.id,
        status: "failed",
        signatureVerified: true,
        orderNo: verification.parsed.orderNo,
        providerTradeNo: verification.parsed.providerTradeNo ?? null,
        errorMessage: safeMessage,
      },
      { client: input.dbClient },
    );
    return providerFailureResponse(input.providerCode, input.reply, safeMessage);
  }
}

function canManualMarkPaid(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly order: PaymentOrderRecord;
  readonly config: BillingProviderRuntimeConfig | null;
}): boolean {
  return (
    input.env.BILLING_ALLOW_MANUAL_MARK_PAID === "true" ||
    input.env.NODE_ENV !== "production" ||
    input.order.provider === "mock" ||
    input.config?.realCallEnabled === false
  );
}

function registerRawBodyCapture(app: FastifyInstance) {
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  app.addHook("preParsing", (request, _reply, payload, done) => {
    const path = request.url.split("?")[0];
    if (
      request.method !== "POST" ||
      (path !== "/billing/wechat-pay/notify" && path !== "/billing/alipay/notify")
    ) {
      done(null, payload);
      return;
    }

    const chunks: Buffer[] = [];
    payload.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    payload.on("error", (error) => {
      done(error as Error);
    });
    payload.on("end", () => {
      const buffer = Buffer.concat(chunks);
      (request as RawBodyRequest).rawBodyBytes = buffer;
      (request as RawBodyRequest).rawBody = buffer.toString("utf8");
      done(null, Readable.from([buffer]));
    });
  });
}

export function registerPaymentRoutes(app: FastifyInstance, options: PaymentRoutesOptions): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;
  const env = options.env ?? process.env;
  registerRawBodyCapture(app);

  app.get("/billing/products", async () => {
    return { products: await listPublicBillingProducts({ client }) };
  });

  app.get("/billing/payment-methods", async () => {
    return { methods: await listPublicBillingPaymentMethods({ client, env }) };
  });

  app.post("/billing/orders", async (request, reply) => {
    const context = await requireBillingAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }

    const parsedBody = createOrderSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }

    let returnUrl: string | null;
    try {
      returnUrl = normalizeReturnUrl(parsedBody.data.returnUrl, env);
    } catch (error) {
      return sendError(reply, 400, "invalid_return_url", (error as Error).message);
    }

    const product = await getBillingProductByCode(parsedBody.data.productCode, { client });
    if (!product || !product.enabled) {
      return sendError(reply, 404, "product_not_found", "计费产品不存在或未启用。");
    }
    if (!isPublicPurchasableBillingProduct(product)) {
      return sendError(reply, 403, "product_not_purchasable", "该套餐不支持公开购买。");
    }
    if (product.currency !== "CNY") {
      return sendError(reply, 400, "unsupported_currency", "V1 仅支持人民币订单。");
    }

    const { config, provider } = await createPaymentProvider({
      providerCode: parsedBody.data.provider,
      dbClient: client,
      env,
      fetcher: options.fetcher,
    });
    if (!config.enabled) {
      return sendError(reply, 400, "payment_provider_disabled", "支付服务商未启用。");
    }
    if (config.realCallEnabled) {
      const check = await checkBillingProviderConfig({
        providerCode: parsedBody.data.provider,
        dbClient: client,
        env,
      });
      if (!check.configReady) {
        return sendError(reply, 400, "payment_provider_config_incomplete", check.messageZh);
      }
    }

    const order = await createPaymentOrder(
      {
        userId: context.principal.user.id,
        provider: parsedBody.data.provider,
        amountCents: product.amountCents,
        currency: product.currency,
        productCode: product.code,
        productId: product.id,
        status: "pending",
        metadataJson: compactJson({
          clientMode: parsedBody.data.clientMode ?? null,
          returnUrl,
        }),
      },
      { client },
    );

    if (!config.realCallEnabled) {
      return reply.status(201).send({
        order: orderResponse(order),
        checkout: {
          kind: "mock",
          message: "当前支付服务商处于配置检查模式，订单不会自动完成支付。",
        },
      });
    }

    try {
      const payment = await provider.createPayment({
        order,
        product,
        clientIp: resolveClientIp(request),
        clientMode: parsedBody.data.clientMode,
        returnUrl,
      });
      const checkout =
        parsedBody.data.provider === "alipay"
          ? attachAlipayCheckoutProof({
              authConfig,
              env,
              order,
              payload: payment.publicPayload,
              request,
            })
          : payment.publicPayload;
      if (
        parsedBody.data.provider === "alipay" &&
        payment.providerPayloadJson &&
        typeof payment.providerPayloadJson === "object" &&
        !Array.isArray(payment.providerPayloadJson)
      ) {
        request.log.info(payment.providerPayloadJson, "Created Alipay checkout request");
      }
      const updatedOrder = await updatePaymentOrderStatus(
        {
          orderNo: order.orderNo,
          status: "pending",
          providerPayloadJson: payment.providerPayloadJson ?? null,
        },
        { client },
      );
      return reply.status(201).send({
        order: orderResponse(updatedOrder),
        checkout,
      });
    } catch (error) {
      await updatePaymentOrderStatus({ orderNo: order.orderNo, status: "failed" }, { client });
      return sendError(
        reply,
        502,
        "payment_create_failed",
        sanitizePaymentErrorMessage(error, "创建支付订单失败，请稍后重试。"),
      );
    }
  });

  app.post("/billing/alipay/page-pay", async (request, reply) => {
    const parsedBody = alipayPagePaySchema.safeParse(readUrlEncodedFormBody(request));
    if (!parsedBody.success) {
      return htmlError(reply, "支付参数无效，请返回定价页重试。", 400);
    }

    const order = await getPaymentOrderByOrderNo(parsedBody.data.orderNo, { client });
    if (!order || order.provider !== "alipay") {
      return htmlError(reply, "订单不存在或支付方式不匹配，请重新创建订单。", 404);
    }
    if (order.status !== "pending" && order.status !== "created") {
      return htmlError(reply, "这笔订单暂时无法继续支付，请重新创建订单。", 409);
    }
    if (
      !verifyAlipayCheckoutToken({
        authConfig,
        order,
        token: parsedBody.data.checkoutToken,
      })
    ) {
      return htmlError(reply, "支付请求已失效，请重新创建订单。", 403);
    }

    const product = await getBillingProductByCode(order.productCode, { client });
    if (!product || !product.enabled) {
      return htmlError(reply, "计费产品不存在或未启用，请重新创建订单。", 404);
    }

    const { config, provider } = await createPaymentProvider({
      providerCode: "alipay",
      dbClient: client,
      env,
      fetcher: options.fetcher,
    });
    if (!config.enabled || !config.realCallEnabled) {
      return htmlError(reply, "支付宝通道尚未启用真实支付，请稍后重试。", 400);
    }

    const check = await checkBillingProviderConfig({
      providerCode: "alipay",
      dbClient: client,
      env,
    });
    if (!check.configReady) {
      return htmlError(reply, check.messageZh, 400);
    }

    try {
      const pagePayRequest = (provider as AlipayProvider).createPagePayRequest({
        order,
        product,
        clientMode: readOrderClientMode(order),
        returnUrl: readOrderReturnUrl(order) || config.returnUrl,
      });
      request.log.info(pagePayRequest.safeDiagnostics, "Created Alipay checkout request");
      const html = renderAlipayPagePayFormHtml({
        charset: pagePayRequest.charset,
        fields: pagePayRequest.fields,
        gatewayUrl: pagePayRequest.gatewayUrl,
      });

      return reply
        .status(200)
        .headers(htmlHeaders(pagePayRequest.charset))
        .send(Buffer.from(encodeAlipayText(html, pagePayRequest.charset)));
    } catch (error) {
      return htmlError(
        reply,
        sanitizePaymentErrorMessage(error, "支付请求生成失败，请稍后重试。"),
        502,
      );
    }
  });

  app.get("/billing/orders", async (request, reply) => {
    const context = await requireBillingAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }
    const parsedQuery = listOrdersQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }
    const orders = await listUserVisibleBillingOrders(
      { userId: context.principal.user.id, limit: parsedQuery.data.limit ?? 20 },
      { client },
    );
    return { items: orders.map(orderResponse) };
  });

  app.get("/billing/entitlements", async (request, reply) => {
    const context = await requireBillingAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }
    const entitlements = await listUserEntitlements(
      { userId: context.principal.user.id },
      { client },
    );
    return { items: entitlements.map(entitlementResponse) };
  });

  app.get<{ Params: { orderNo: string } }>("/billing/orders/:orderNo", async (request, reply) => {
    const context = await requireBillingAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }
    const parsedParams = orderParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    try {
      const order = await assertUserOwnsPaymentOrder(
        { orderNo: parsedParams.data.orderNo, userId: context.principal.user.id },
        { client },
      );
      if (!isUserVisibleBillingOrder(order)) {
        return sendError(reply, 404, "order_not_found", "未找到该订单。");
      }
      return { order: orderResponse(order) };
    } catch (error) {
      if (
        error instanceof PaymentOrderNotFoundError ||
        error instanceof PaymentOrderAccessDeniedError
      ) {
        return sendError(reply, 404, "order_not_found", "未找到该订单。");
      }
      throw error;
    }
  });

  app.post<{ Params: { orderNo: string } }>(
    "/billing/orders/:orderNo/cancel",
    async (request, reply) => {
      const context = await requireBillingAuth(request, reply, client, authConfig);
      if (!context) {
        return reply;
      }
      const parsedParams = orderParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        const order = await assertUserOwnsPaymentOrder(
          { orderNo: parsedParams.data.orderNo, userId: context.principal.user.id },
          { client },
        );
        if (!isUserVisibleBillingOrder(order)) {
          return sendError(reply, 404, "order_not_found", "未找到该订单。");
        }
        if (order.status === "paid") {
          return sendError(reply, 409, "paid_order_cannot_cancel", "已支付订单不能取消。");
        }
        const updated = await updatePaymentOrderStatus(
          { orderNo: order.orderNo, status: "canceled" },
          { client },
        );
        return { order: orderResponse(updated) };
      } catch (error) {
        if (
          error instanceof PaymentOrderNotFoundError ||
          error instanceof PaymentOrderAccessDeniedError
        ) {
          return sendError(reply, 404, "order_not_found", "未找到该订单。");
        }
        throw error;
      }
    },
  );

  app.post("/billing/wechat-pay/notify", async (request, reply) =>
    handleProviderNotify({
      request,
      reply,
      dbClient: client,
      env,
      fetcher: options.fetcher,
      providerCode: "wechat_pay",
    }),
  );

  app.post("/billing/alipay/notify", async (request, reply) =>
    handleProviderNotify({
      request,
      reply,
      dbClient: client,
      env,
      fetcher: options.fetcher,
      providerCode: "alipay",
    }),
  );

  app.get("/billing/alipay/return", async (_request, reply) => {
    return reply.redirect("/pricing?payment_return=alipay");
  });

  app.post<{ Params: { orderNo: string } }>(
    "/admin/billing/orders/:orderNo/mark-paid",
    async (request, reply) => {
      const auth = await requirePermission(request, reply, client, authConfig, "admin.manage");
      if (!auth) {
        return reply;
      }
      const parsedParams = orderParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }

      const order = await getPaymentOrderByOrderNo(parsedParams.data.orderNo, { client });
      if (!order) {
        return sendError(reply, 404, "order_not_found", "未找到该订单。");
      }
      const config =
        order.provider === "wechat_pay" || order.provider === "alipay"
          ? (
              await createPaymentProvider({
                providerCode: order.provider,
                dbClient: client,
                env,
                fetcher: options.fetcher,
              })
            ).config
          : null;
      if (!canManualMarkPaid({ env, order, config })) {
        return sendError(reply, 403, "manual_mark_paid_disabled", "当前环境不允许手动完成订单。");
      }

      const paidOrder = await markPaymentOrderPaid(
        {
          orderNo: order.orderNo,
          amountCents: order.amountCents,
          provider: order.provider,
          providerTradeNo: order.providerTradeNo ?? `manual:${order.orderNo}`,
          providerPayloadJson: {
            manual: true,
            actorUserId: auth.auditActorUserId,
          },
        },
        { client },
      );
      const grant = await grantPaymentEntitlementOnce({ orderNo: order.orderNo }, { client });
      await createAuditLog(
        {
          actorUserId: auth.auditActorUserId,
          action: "billing.order.manual_mark_paid",
          targetType: "payment_order",
          targetId: order.orderNo,
          afterJson: compactJson({
            orderNo: order.orderNo,
            provider: order.provider,
            entitlementGranted: grant.granted,
          }),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
        },
        { client },
      );
      return {
        success: true,
        order: orderResponse(paidOrder),
        entitlementGranted: grant.granted,
      };
    },
  );
}

export function principalForBillingTests(
  principal: AuthenticatedPrincipal,
): Pick<AuthenticatedPrincipal, "user" | "roleCodes" | "permissions"> {
  return {
    user: principal.user,
    roleCodes: principal.roleCodes,
    permissions: principal.permissions,
  };
}
