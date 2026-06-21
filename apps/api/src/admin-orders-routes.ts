import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdminPaymentOrderNotFoundError,
  InvalidPaymentStatusTransitionError,
  PaymentAmountMismatchError,
  PaymentEntitlementGrantError,
  PaymentOrderNotFoundError,
  adminOrderAuditSnapshot,
  createAuditLog,
  getAdminPaymentOrderDetail,
  getPaymentOrderByOrderNo,
  grantPaymentEntitlementOnce,
  listAdminPaymentOrders,
  listOrderCreditLedger,
  listOrderEntitlements,
  listPaymentNotificationsForAdmin,
  markPaymentOrderPaid,
  updateAdminPaymentOrderDetail,
  updatePaymentOrderStatus,
} from "@photo-weather/db";
import type {
  DatabaseClient,
  JsonValue,
  PaymentOrderRecord,
  PaymentOrderStatus,
  PaymentProviderCode,
} from "@photo-weather/db";
import { z } from "zod";
import type { AuthConfig, AuthenticatedRequestContext } from "./auth-routes.js";
import { requireAnyAdminPermission } from "./admin-permissions.js";
import { readRuntimeBillingProviderConfig } from "./payment-provider.js";

export type AdminOrderRoutesOptions = {
  readonly dbClient?: DatabaseClient;
  readonly authConfig: AuthConfig;
  readonly env?: NodeJS.ProcessEnv;
};

const orderNoParamsSchema = z.object({
  orderNo: z.string().trim().min(1).max(120),
});

const listOrdersQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z
    .enum(["created", "pending", "paid", "closed", "canceled", "failed", "refunded", "all"])
    .optional(),
  provider: z.enum(["wechat_pay", "alipay", "mock", "all"]).optional(),
  productCode: z.string().trim().max(120).optional(),
  userId: z.string().trim().max(120).optional(),
  paid: z.enum(["true", "false"]).optional(),
  createdFrom: z.string().trim().max(40).optional(),
  createdTo: z.string().trim().max(40).optional(),
  paidFrom: z.string().trim().max(40).optional(),
  paidTo: z.string().trim().max(40).optional(),
  amountMinCents: z.coerce.number().int().min(0).optional(),
  amountMaxCents: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["created_desc", "created_asc", "paid_desc", "amount_desc", "amount_asc"]).optional(),
});

const patchOrderSchema = z
  .object({
    adminNote: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at least one field is required",
  });

const markPaidSchema = z
  .object({
    amountCents: z.number().int().positive().optional(),
    providerTradeNo: z.string().trim().max(160).optional(),
  })
  .optional();

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

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

function toAuditJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function parseBoolean(value: "true" | "false" | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "true";
}

async function requireOrderReadPermission(
  request: FastifyRequest,
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  authConfig: AuthConfig,
): Promise<AuthenticatedRequestContext | null> {
  return requireAnyAdminPermission(request, reply, client, authConfig, [
    "users.manage",
    "admin.manage",
  ]);
}

async function requireOrderOperatePermission(
  request: FastifyRequest,
  reply: FastifyReply,
  client: DatabaseClient | undefined,
  authConfig: AuthConfig,
): Promise<AuthenticatedRequestContext | null> {
  return requireAnyAdminPermission(request, reply, client, authConfig, ["admin.manage"]);
}

function sendAdminOrderError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof AdminPaymentOrderNotFoundError || error instanceof PaymentOrderNotFoundError) {
    return sendError(reply, 404, "order_not_found", "未找到该订单。");
  }
  if (error instanceof PaymentAmountMismatchError) {
    return sendError(reply, 400, "payment_amount_mismatch", "手动标记支付金额必须与订单金额一致。");
  }
  if (error instanceof InvalidPaymentStatusTransitionError) {
    return sendError(reply, 409, "invalid_order_status_transition", "当前订单状态不允许该操作。");
  }
  if (error instanceof PaymentEntitlementGrantError) {
    return sendError(reply, 409, "payment_entitlement_grant_failed", error.message);
  }
  throw error;
}

async function writeOrderAudit(input: {
  readonly client?: DatabaseClient;
  readonly context: AuthenticatedRequestContext;
  readonly action: string;
  readonly orderNo: string;
  readonly beforeJson?: JsonValue | null;
  readonly afterJson?: JsonValue | null;
  readonly request: FastifyRequest;
}) {
  await createAuditLog(
    {
      actorUserId: input.context.auditActorUserId,
      action: input.action,
      targetType: "payment_order",
      targetId: input.orderNo,
      beforeJson: input.beforeJson ?? null,
      afterJson: input.afterJson ?? null,
      ipAddress: input.request.ip,
      userAgent: input.request.headers["user-agent"] ?? null,
    },
    { client: input.client },
  );
}

function isSimpleOrderOperationAllowed(status: PaymentOrderStatus): boolean {
  return status === "created" || status === "pending";
}

async function canManualMarkPaid(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly order: PaymentOrderRecord;
  readonly dbClient?: DatabaseClient;
}): Promise<boolean> {
  if (
    input.env.BILLING_ALLOW_MANUAL_MARK_PAID === "true" ||
    input.env.NODE_ENV !== "production" ||
    input.order.provider === "mock"
  ) {
    return true;
  }
  if (input.order.provider !== "wechat_pay" && input.order.provider !== "alipay") {
    return false;
  }
  const config = await readRuntimeBillingProviderConfig({
    providerCode: input.order.provider,
    dbClient: input.dbClient,
    env: input.env,
  });
  return config.realCallEnabled === false;
}

export function registerAdminOrderRoutes(
  app: FastifyInstance,
  options: AdminOrderRoutesOptions,
): void {
  const client = options.dbClient;
  const authConfig = options.authConfig;
  const env = options.env ?? process.env;

  app.get("/admin/orders", async (request, reply) => {
    const auth = await requireOrderReadPermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedQuery = listOrdersQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      return sendZodError(reply, parsedQuery.error);
    }
    return listAdminPaymentOrders(
      {
        q: parsedQuery.data.q,
        status: parsedQuery.data.status as PaymentOrderStatus | "all" | undefined,
        provider: parsedQuery.data.provider as PaymentProviderCode | "all" | undefined,
        productCode: parsedQuery.data.productCode,
        userId: parsedQuery.data.userId,
        paid: parseBoolean(parsedQuery.data.paid),
        createdFrom: parseDate(parsedQuery.data.createdFrom),
        createdTo: parseDate(parsedQuery.data.createdTo),
        paidFrom: parseDate(parsedQuery.data.paidFrom),
        paidTo: parseDate(parsedQuery.data.paidTo),
        amountMinCents: parsedQuery.data.amountMinCents,
        amountMaxCents: parsedQuery.data.amountMaxCents,
        page: parsedQuery.data.page,
        pageSize: parsedQuery.data.pageSize,
        sort: parsedQuery.data.sort,
      },
      { client },
    );
  });

  app.get<{ Params: { orderNo: string } }>("/admin/orders/:orderNo", async (request, reply) => {
    const auth = await requireOrderReadPermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedParams = orderNoParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    try {
      return { order: await getAdminPaymentOrderDetail(parsedParams.data.orderNo, { client }) };
    } catch (error) {
      return sendAdminOrderError(reply, error);
    }
  });

  app.patch<{ Params: { orderNo: string } }>("/admin/orders/:orderNo", async (request, reply) => {
    const auth = await requireOrderOperatePermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedParams = orderNoParamsSchema.safeParse(request.params);
    const parsedBody = patchOrderSchema.safeParse(request.body ?? {});
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    if (!parsedBody.success) {
      return sendZodError(reply, parsedBody.error);
    }
    try {
      const before = await getAdminPaymentOrderDetail(parsedParams.data.orderNo, { client });
      const order = await updateAdminPaymentOrderDetail(
        {
          orderNo: parsedParams.data.orderNo,
          adminNote: parsedBody.data.adminNote,
        },
        { client },
      );
      await writeOrderAudit({
        client,
        context: auth,
        action: "admin.order.update",
        orderNo: parsedParams.data.orderNo,
        beforeJson: adminOrderAuditSnapshot(before),
        afterJson: adminOrderAuditSnapshot(order),
        request,
      });
      return { order };
    } catch (error) {
      return sendAdminOrderError(reply, error);
    }
  });

  async function updateSimpleStatus(
    request: FastifyRequest<{ Params: { orderNo: string } }>,
    reply: FastifyReply,
    status: "canceled" | "closed",
    action: string,
  ) {
    const auth = await requireOrderOperatePermission(request, reply, client, authConfig);
    if (!auth) {
      return reply;
    }
    const parsedParams = orderNoParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendZodError(reply, parsedParams.error);
    }
    const order = await getPaymentOrderByOrderNo(parsedParams.data.orderNo, { client });
    if (!order) {
      return sendError(reply, 404, "order_not_found", "未找到该订单。");
    }
    if (!isSimpleOrderOperationAllowed(order.status)) {
      return sendError(reply, 409, "order_status_final", "已支付或最终状态订单不能执行该操作。");
    }
    try {
      const before = await getAdminPaymentOrderDetail(order.orderNo, { client });
      await updatePaymentOrderStatus({ orderNo: order.orderNo, status }, { client });
      const detail = await getAdminPaymentOrderDetail(order.orderNo, { client });
      await writeOrderAudit({
        client,
        context: auth,
        action,
        orderNo: order.orderNo,
        beforeJson: adminOrderAuditSnapshot(before),
        afterJson: adminOrderAuditSnapshot(detail),
        request,
      });
      return { order: detail };
    } catch (error) {
      return sendAdminOrderError(reply, error);
    }
  }

  app.post<{ Params: { orderNo: string } }>(
    "/admin/orders/:orderNo/cancel",
    async (request, reply) => updateSimpleStatus(request, reply, "canceled", "admin.order.cancel"),
  );

  app.post<{ Params: { orderNo: string } }>(
    "/admin/orders/:orderNo/close",
    async (request, reply) => updateSimpleStatus(request, reply, "closed", "admin.order.close"),
  );

  app.post<{ Params: { orderNo: string } }>(
    "/admin/orders/:orderNo/mark-paid",
    async (request, reply) => {
      const auth = await requireOrderOperatePermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = orderNoParamsSchema.safeParse(request.params);
      const parsedBody = markPaidSchema.safeParse(request.body ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedBody.success) {
        return sendZodError(reply, parsedBody.error);
      }
      const order = await getPaymentOrderByOrderNo(parsedParams.data.orderNo, { client });
      if (!order) {
        return sendError(reply, 404, "order_not_found", "未找到该订单。");
      }
      if (parsedBody.data?.amountCents !== undefined && parsedBody.data.amountCents !== order.amountCents) {
        return sendError(reply, 400, "payment_amount_mismatch", "手动标记支付金额必须与订单金额一致。");
      }
      if (!(await canManualMarkPaid({ env, order, dbClient: client }))) {
        return sendError(reply, 403, "manual_mark_paid_disabled", "当前环境不允许手动完成订单。");
      }
      try {
        const before = await getAdminPaymentOrderDetail(order.orderNo, { client });
        await markPaymentOrderPaid(
          {
            orderNo: order.orderNo,
            amountCents: parsedBody.data?.amountCents ?? order.amountCents,
            provider: order.provider,
            providerTradeNo:
              parsedBody.data?.providerTradeNo ?? order.providerTradeNo ?? `manual:${order.orderNo}`,
            providerPayloadJson: {
              manual: true,
              actorUserId: auth.auditActorUserId,
            },
          },
          { client },
        );
        const grant = await grantPaymentEntitlementOnce({ orderNo: order.orderNo }, { client });
        const detail = await getAdminPaymentOrderDetail(order.orderNo, { client });
        await writeOrderAudit({
          client,
          context: auth,
          action: "admin.order.manual_mark_paid",
          orderNo: order.orderNo,
          beforeJson: adminOrderAuditSnapshot(before),
          afterJson: toAuditJson({
            order: adminOrderAuditSnapshot(detail),
            entitlementGranted: grant.granted,
          }),
          request,
        });
        return {
          success: true,
          order: detail,
          entitlementGranted: grant.granted,
        };
      } catch (error) {
        return sendAdminOrderError(reply, error);
      }
    },
  );

  app.get<{ Params: { orderNo: string } }>(
    "/admin/orders/:orderNo/notifications",
    async (request, reply) => {
      const auth = await requireOrderReadPermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = orderNoParamsSchema.safeParse(request.params);
      const parsedQuery = limitQuerySchema.safeParse(request.query ?? {});
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      if (!parsedQuery.success) {
        return sendZodError(reply, parsedQuery.error);
      }
      return {
        items: await listPaymentNotificationsForAdmin(
          { orderNo: parsedParams.data.orderNo, limit: parsedQuery.data.limit },
          { client },
        ),
      };
    },
  );

  app.get<{ Params: { orderNo: string } }>(
    "/admin/orders/:orderNo/entitlements",
    async (request, reply) => {
      const auth = await requireOrderReadPermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = orderNoParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        return {
          items: await listOrderEntitlements({ orderNo: parsedParams.data.orderNo }, { client }),
        };
      } catch (error) {
        return sendAdminOrderError(reply, error);
      }
    },
  );

  app.get<{ Params: { orderNo: string } }>(
    "/admin/orders/:orderNo/credit-ledger",
    async (request, reply) => {
      const auth = await requireOrderReadPermission(request, reply, client, authConfig);
      if (!auth) {
        return reply;
      }
      const parsedParams = orderNoParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return sendZodError(reply, parsedParams.error);
      }
      try {
        return {
          items: await listOrderCreditLedger({ orderNo: parsedParams.data.orderNo }, { client }),
        };
      } catch (error) {
        return sendAdminOrderError(reply, error);
      }
    },
  );
}
