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
  listBillingProducts,
  listUserEntitlements,
  listUserPaymentOrders,
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
  BillingProductRecord,
  DatabaseClient,
  JsonValue,
  PaymentOrderRecord,
  PaymentProviderCode,
} from "@photo-weather/db";
import { z } from "zod";
import type { AuthConfig, AuthenticatedRequestContext } from "./auth-routes.js";
import { authenticateRequest, requirePermission } from "./auth-routes.js";
import { AlipayProvider } from "./alipay-provider.js";
import {
  checkBillingProviderConfig,
  readRuntimeBillingProviderConfig,
  type BillingProviderRuntimeConfig,
  type PaymentProvider,
} from "./payment-provider.js";
import { sanitizePaymentErrorMessage } from "./payment-security.js";
import { WechatPayProvider } from "./wechat-pay-provider.js";

export type PaymentRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: typeof fetch;
};

type RawBodyRequest = FastifyRequest & {
  rawBody?: string;
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

const authRequiredMessage = "请先登录后再操作。";

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

function compactJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
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

function productResponse(product: BillingProductRecord) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    amountCents: product.amountCents,
    currency: product.currency,
    credits: product.credits,
    durationDays: product.durationDays,
    enabled: product.enabled,
    sortOrder: product.sortOrder,
    metadataJson: product.metadataJson,
  };
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
  const verification = await provider.verifyNotification({ rawBody, headers });
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
    const products = await listBillingProducts({ enabledOnly: true, client });
    return { products: products.filter(isPublicPurchasableBillingProduct).map(productResponse) };
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
        clientMode: parsedBody.data.clientMode,
        returnUrl,
      });
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
        checkout: payment.publicPayload,
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

  app.get("/billing/orders", async (request, reply) => {
    const context = await requireBillingAuth(request, reply, client, authConfig);
    if (!context) {
      return reply;
    }
    const parsedQuery = listOrdersQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }
    const orders = await listUserPaymentOrders(
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
