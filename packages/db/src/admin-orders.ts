import { getPrismaClient } from "./client.js";
import { buildAuditLogDisplay } from "./audit-display.js";
import { safeUser } from "./auth.js";
import { isInternalTrialOrder, isPaidUserPurchaseOrder } from "./payments.js";
import type {
  AdminAuditLogRecord,
  BillingProductRecord,
  DatabaseClient,
  JsonValue,
  PaymentNotifyStatus,
  PaymentOrderStatus,
  PaymentProviderCode,
  SafeUser,
} from "./types.js";

export class AdminPaymentOrderNotFoundError extends Error {
  constructor(readonly orderNo: string) {
    super(`Admin payment order not found: ${orderNo}`);
  }
}

export type AdminPaymentOrderListSort =
  | "created_desc"
  | "created_asc"
  | "paid_desc"
  | "amount_desc"
  | "amount_asc";

export type ListAdminPaymentOrdersInput = {
  readonly q?: string | null;
  readonly status?: PaymentOrderStatus | "all";
  readonly provider?: PaymentProviderCode | "all";
  readonly productCode?: string | "all";
  readonly userId?: string | null;
  readonly paid?: boolean;
  readonly createdFrom?: Date | null;
  readonly createdTo?: Date | null;
  readonly paidFrom?: Date | null;
  readonly paidTo?: Date | null;
  readonly amountMinCents?: number | null;
  readonly amountMaxCents?: number | null;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: AdminPaymentOrderListSort;
};

export type AdminPaymentUserSummary = Pick<
  SafeUser,
  "id" | "email" | "phone" | "displayName" | "status" | "createdAt"
>;

export type AdminPaymentProductSummary = Pick<
  BillingProductRecord,
  "id" | "code" | "name" | "description" | "amountCents" | "currency" | "credits" | "durationDays"
> | null;

export type AdminPaymentOrderListItem = {
  readonly orderNo: string;
  readonly user: AdminPaymentUserSummary | null;
  readonly provider: PaymentProviderCode;
  readonly productCode: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: PaymentOrderStatus;
  readonly paidAt: Date | null;
  readonly expiresAt: Date | null;
  readonly providerTradeNo: string | null;
  readonly entitlementGrantedAt: Date | null;
  readonly billingCategory: "paid_purchase" | "system_grant" | "other";
  readonly billingCategoryLabel: string;
  readonly revenueEligible: boolean;
  readonly adminLabels: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AdminPaymentNotificationItem = {
  readonly id: string;
  readonly provider: PaymentProviderCode;
  readonly orderNo: string | null;
  readonly providerTradeNo: string | null;
  readonly signatureVerified: boolean;
  readonly status: PaymentNotifyStatus;
  readonly errorMessage: string | null;
  readonly createdAt: Date;
  readonly processedAt: Date | null;
};

export type AdminOrderTimelineItem = {
  readonly at: Date;
  readonly type: "created" | "notification" | "paid" | "entitlement" | "status";
  readonly title: string;
  readonly status: string;
  readonly description: string | null;
};

export type AdminOrderEntitlementItem = {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string;
  readonly type: string;
  readonly quantity: number;
  readonly remainingQuantity: number | null;
  readonly startsAt: Date;
  readonly expiresAt: Date | null;
  readonly grantedAt: Date;
  readonly metadataJson: JsonValue | null;
};

export type AdminOrderCreditLedgerItem = {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string | null;
  readonly entitlementId: string | null;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly reason: string;
  readonly metadataJson: JsonValue | null;
  readonly createdAt: Date;
};

export type AdminOrderAuditLogItem = Pick<
  AdminAuditLogRecord,
  | "id"
  | "actorUserId"
  | "actorDisplayName"
  | "actorEmailMasked"
  | "actorPhoneMasked"
  | "actorLabel"
  | "action"
  | "actionLabel"
  | "targetType"
  | "targetId"
  | "targetLabel"
  | "targetSummary"
  | "technicalActorUserId"
  | "technicalTargetId"
  | "createdAt"
>;

export type AdminPaymentOrderDetail = {
  readonly order: AdminPaymentOrderListItem & {
    readonly id: string;
    readonly metadataJson: JsonValue | null;
    readonly adminNote: string | null;
  };
  readonly user: AdminPaymentUserSummary | null;
  readonly product: AdminPaymentProductSummary;
  readonly timeline: readonly AdminOrderTimelineItem[];
  readonly notifications: readonly AdminPaymentNotificationItem[];
  readonly entitlements: readonly AdminOrderEntitlementItem[];
  readonly creditLedger: readonly AdminOrderCreditLedgerItem[];
  readonly auditLogs: readonly AdminOrderAuditLogItem[];
};

export type AdminPaymentOrderListSummary = {
  readonly totalOrders: number;
  readonly paidOrders: number;
  readonly unpaidOrders: number;
  readonly failedOrCanceledOrders: number;
  readonly systemGrantOrders: number;
  readonly totalRevenueCents: number;
  readonly todayRevenueCents: number;
};

export type AdminPaymentOrderListResult = {
  readonly items: readonly AdminPaymentOrderListItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly summary: AdminPaymentOrderListSummary;
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireDelegate<TDelegate>(delegate: TDelegate | undefined, name: string): TDelegate {
  if (!delegate) {
    throw new Error(`Database client is missing ${name} delegate.`);
  }

  return delegate;
}

function isJsonObject(value: JsonValue | null | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeUserSummary(record: any): AdminPaymentUserSummary | null {
  return record ? safeUser(record) : null;
}

function normalizeProductSummary(record: any): AdminPaymentProductSummary {
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    amountCents: record.amountCents,
    currency: record.currency,
    credits: record.credits,
    durationDays: record.durationDays ?? null,
  };
}

async function loadUserSummary(userId: string, client: DatabaseClient) {
  const user = client.user ? await client.user.findUnique({ where: { id: userId } }) : null;
  return normalizeUserSummary(user);
}

async function loadProductSummary(productCode: string, client: DatabaseClient) {
  const product = client.billingProduct
    ? await client.billingProduct.findUnique({ where: { code: productCode } })
    : null;
  return normalizeProductSummary(product);
}

function normalizeOrderListItem(
  record: any,
  user: AdminPaymentUserSummary | null,
): AdminPaymentOrderListItem {
  const internalTrial = isInternalTrialOrder(record);
  const revenueEligible = isPaidUserPurchaseOrder(record);
  const billingCategory = internalTrial
    ? "system_grant"
    : revenueEligible
      ? "paid_purchase"
      : "other";
  return {
    orderNo: record.orderNo,
    user,
    provider: record.provider,
    productCode: record.productCode,
    amountCents: record.amountCents,
    currency: record.currency,
    status: record.status,
    paidAt: record.paidAt ?? null,
    expiresAt: record.expiresAt ?? null,
    providerTradeNo: record.providerTradeNo ?? null,
    entitlementGrantedAt: record.entitlementGrantedAt ?? null,
    billingCategory,
    billingCategoryLabel: internalTrial
      ? "系统赠送 / 注册试用"
      : revenueEligible
        ? "付费购买"
        : "普通订单",
    revenueEligible,
    adminLabels: internalTrial ? ["系统赠送", "注册试用", "非收入订单"] : [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeNotification(record: any): AdminPaymentNotificationItem {
  return {
    id: record.id,
    provider: record.provider,
    orderNo: record.orderNo ?? null,
    providerTradeNo: record.providerTradeNo ?? null,
    signatureVerified: Boolean(record.signatureVerified),
    status: record.status,
    errorMessage: record.errorMessage ? String(record.errorMessage).slice(0, 500) : null,
    createdAt: record.createdAt,
    processedAt: record.processedAt ?? null,
  };
}

function normalizeEntitlement(record: any): AdminOrderEntitlementItem {
  return {
    id: record.id,
    userId: record.userId,
    orderId: record.orderId,
    type: record.type,
    quantity: record.quantity,
    remainingQuantity: record.remainingQuantity ?? null,
    startsAt: record.startsAt,
    expiresAt: record.expiresAt ?? null,
    grantedAt: record.grantedAt,
    metadataJson: (record.metadataJson ?? null) as JsonValue | null,
  };
}

function normalizeCreditLedger(record: any): AdminOrderCreditLedgerItem {
  return {
    id: record.id,
    userId: record.userId,
    orderId: record.orderId ?? null,
    entitlementId: record.entitlementId ?? null,
    delta: record.delta,
    balanceAfter: record.balanceAfter,
    reason: record.reason,
    metadataJson: (record.metadataJson ?? null) as JsonValue | null,
    createdAt: record.createdAt,
  };
}

function normalizeAuditLog(record: any): AdminOrderAuditLogItem {
  const display = buildAuditLogDisplay({
    actorUserId: record.actorUserId ?? null,
    actor: record.actor ?? null,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    beforeJson: record.beforeJson ?? null,
    afterJson: record.afterJson ?? null,
  });

  return {
    id: record.id,
    actorUserId: record.actorUserId ?? null,
    actorDisplayName: display.actorDisplayName,
    actorEmailMasked: display.actorEmailMasked,
    actorPhoneMasked: display.actorPhoneMasked,
    actorLabel: display.actorLabel,
    action: record.action,
    actionLabel: display.actionLabel,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    targetLabel: display.targetLabel,
    targetSummary: display.targetSummary,
    technicalActorUserId: display.technicalActorUserId,
    technicalTargetId: display.technicalTargetId,
    createdAt: record.createdAt,
  };
}

function dateInRange(
  value: Date | null | undefined,
  from?: Date | null,
  to?: Date | null,
): boolean {
  if (!value) {
    return !from && !to;
  }
  return (!from || value.getTime() >= from.getTime()) && (!to || value.getTime() <= to.getTime());
}

function orderMatchesSearch(item: AdminPaymentOrderListItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [
    item.orderNo,
    item.providerTradeNo,
    item.user?.email,
    item.user?.phone,
    item.user?.displayName,
  ].some((value) => typeof value === "string" && value.toLowerCase().includes(needle));
}

function sortOrders(
  left: AdminPaymentOrderListItem,
  right: AdminPaymentOrderListItem,
  sort: AdminPaymentOrderListSort,
) {
  if (sort === "created_asc") {
    return left.createdAt.getTime() - right.createdAt.getTime();
  }
  if (sort === "paid_desc") {
    return (right.paidAt?.getTime() ?? 0) - (left.paidAt?.getTime() ?? 0);
  }
  if (sort === "amount_desc") {
    return right.amountCents - left.amountCents;
  }
  if (sort === "amount_asc") {
    return left.amountCents - right.amountCents;
  }
  return right.createdAt.getTime() - left.createdAt.getTime();
}

export async function listAdminPaymentOrders(
  input: ListAdminPaymentOrdersInput = {},
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<AdminPaymentOrderListResult> {
  const client = await resolveClient(options.client);
  const paymentOrder = requireDelegate(client.paymentOrder, "paymentOrder");
  const records = await paymentOrder.findMany({
    orderBy: [{ createdAt: "desc" }],
  });
  const items = await Promise.all(
    records.map(async (record) =>
      normalizeOrderListItem(record, await loadUserSummary(record.userId, client)),
    ),
  );
  const now = options.now ?? new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const summary: AdminPaymentOrderListSummary = {
    totalOrders: items.length,
    paidOrders: items.filter((item) => item.revenueEligible).length,
    unpaidOrders: items.filter((item) => ["created", "pending"].includes(item.status)).length,
    failedOrCanceledOrders: items.filter((item) =>
      ["failed", "canceled", "closed"].includes(item.status),
    ).length,
    systemGrantOrders: items.filter((item) => item.billingCategory === "system_grant").length,
    totalRevenueCents: items
      .filter((item) => item.revenueEligible)
      .reduce((total, item) => total + item.amountCents, 0),
    todayRevenueCents: items
      .filter(
        (item) =>
          item.revenueEligible &&
          item.paidAt !== null &&
          item.paidAt.getTime() >= todayStart.getTime(),
      )
      .reduce((total, item) => total + item.amountCents, 0),
  };

  const filtered = items
    .filter((item) => !input.q || orderMatchesSearch(item, input.q))
    .filter((item) => !input.status || input.status === "all" || item.status === input.status)
    .filter(
      (item) => !input.provider || input.provider === "all" || item.provider === input.provider,
    )
    .filter(
      (item) =>
        !input.productCode || input.productCode === "all" || item.productCode === input.productCode,
    )
    .filter((item) => !input.userId || item.user?.id === input.userId)
    .filter((item) => input.paid === undefined || (item.status === "paid") === input.paid)
    .filter((item) => dateInRange(item.createdAt, input.createdFrom, input.createdTo))
    .filter((item) => dateInRange(item.paidAt, input.paidFrom, input.paidTo))
    .filter(
      (item) =>
        input.amountMinCents === undefined ||
        input.amountMinCents === null ||
        item.amountCents >= input.amountMinCents,
    )
    .filter(
      (item) =>
        input.amountMaxCents === undefined ||
        input.amountMaxCents === null ||
        item.amountCents <= input.amountMaxCents,
    )
    .sort((left, right) => sortOrders(left, right, input.sort ?? "created_desc"));

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: filtered.length,
      totalPages,
    },
    summary,
  };
}

async function getPaymentOrderRecord(orderNo: string, client: DatabaseClient): Promise<any> {
  const record = await requireDelegate(client.paymentOrder, "paymentOrder").findUnique({
    where: { orderNo },
  });
  if (!record) {
    throw new AdminPaymentOrderNotFoundError(orderNo);
  }
  return record;
}

export async function listPaymentNotificationsForAdmin(
  input: { readonly orderNo: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminPaymentNotificationItem[]> {
  const client = await resolveClient(options.client);
  if (!client.paymentNotification?.findMany) {
    return [];
  }
  const records = await client.paymentNotification.findMany({
    where: { orderNo: input.orderNo },
    orderBy: [{ createdAt: "desc" }],
    take: input.limit,
  });
  return records.map(normalizeNotification);
}

export async function listOrderEntitlements(
  input: { readonly orderNo: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminOrderEntitlementItem[]> {
  const client = await resolveClient(options.client);
  const order = await getPaymentOrderRecord(input.orderNo, client);
  if (!client.userEntitlement) {
    return [];
  }
  const records = await client.userEntitlement.findMany({
    where: { orderId: order.id },
    orderBy: [{ grantedAt: "desc" }],
  });
  return records.map(normalizeEntitlement);
}

export async function listOrderCreditLedger(
  input: { readonly orderNo: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminOrderCreditLedgerItem[]> {
  const client = await resolveClient(options.client);
  const order = await getPaymentOrderRecord(input.orderNo, client);
  if (!client.userCreditLedger) {
    return [];
  }
  const records = await client.userCreditLedger.findMany({
    where: { orderId: order.id },
    orderBy: [{ createdAt: "desc" }],
  });
  return records.map(normalizeCreditLedger);
}

async function listOrderAuditLogs(
  orderNo: string,
  orderId: string,
  client: DatabaseClient,
): Promise<readonly AdminOrderAuditLogItem[]> {
  const records = await client.adminAuditLog.findMany({
    where: {
      OR: [{ targetId: orderNo }, { targetId: orderId }],
    },
    orderBy: [{ createdAt: "desc" }],
    take: 20,
    include: { actor: true },
  });
  return records.map(normalizeAuditLog);
}

export function getOrderOperationalTimeline(input: {
  readonly order: AdminPaymentOrderListItem;
  readonly notifications: readonly AdminPaymentNotificationItem[];
  readonly entitlements: readonly AdminOrderEntitlementItem[];
}): readonly AdminOrderTimelineItem[] {
  const items: AdminOrderTimelineItem[] = [
    {
      at: input.order.createdAt,
      type: "created",
      title: "订单创建",
      status: input.order.status,
      description: input.order.productCode,
    },
  ];
  for (const notification of input.notifications) {
    items.push({
      at: notification.processedAt ?? notification.createdAt,
      type: "notification",
      title: "支付通知",
      status: notification.status,
      description: notification.providerTradeNo,
    });
  }
  if (input.order.paidAt) {
    items.push({
      at: input.order.paidAt,
      type: "paid",
      title: "支付完成",
      status: "paid",
      description: input.order.providerTradeNo,
    });
  }
  if (input.order.entitlementGrantedAt) {
    items.push({
      at: input.order.entitlementGrantedAt,
      type: "entitlement",
      title: "权益发放",
      status: "granted",
      description: `${input.entitlements.length} 条权益/积分记录`,
    });
  }
  if (["closed", "canceled", "failed", "refunded"].includes(input.order.status)) {
    items.push({
      at: input.order.updatedAt,
      type: "status",
      title: "订单状态更新",
      status: input.order.status,
      description: null,
    });
  }
  return items.sort((left, right) => left.at.getTime() - right.at.getTime());
}

export async function getAdminPaymentOrderDetail(
  orderNo: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminPaymentOrderDetail> {
  const client = await resolveClient(options.client);
  const record = await getPaymentOrderRecord(orderNo, client);
  const user = await loadUserSummary(record.userId, client);
  const product = await loadProductSummary(record.productCode, client);
  const order = normalizeOrderListItem(record, user);
  const [notifications, entitlements, creditLedger, auditLogs] = await Promise.all([
    listPaymentNotificationsForAdmin({ orderNo }, { client }),
    listOrderEntitlements({ orderNo }, { client }),
    listOrderCreditLedger({ orderNo }, { client }),
    listOrderAuditLogs(orderNo, record.id, client),
  ]);
  const metadataJson = (record.metadataJson ?? null) as JsonValue | null;
  const adminNote =
    isJsonObject(metadataJson) && typeof metadataJson.adminNote === "string"
      ? metadataJson.adminNote
      : null;

  return {
    order: {
      ...order,
      id: record.id,
      metadataJson,
      adminNote,
    },
    user,
    product,
    timeline: getOrderOperationalTimeline({ order, notifications, entitlements }),
    notifications,
    entitlements,
    creditLedger,
    auditLogs,
  };
}

export async function updateAdminPaymentOrderDetail(
  input: { readonly orderNo: string; readonly adminNote?: string | null },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminPaymentOrderDetail> {
  const client = await resolveClient(options.client);
  const record = await getPaymentOrderRecord(input.orderNo, client);
  const metadataJson = (record.metadataJson ?? null) as JsonValue | null;
  const baseMetadata = isJsonObject(metadataJson) ? metadataJson : {};
  await requireDelegate(client.paymentOrder, "paymentOrder").update({
    where: { orderNo: input.orderNo },
    data: {
      metadataJson: {
        ...baseMetadata,
        ...(input.adminNote === undefined ? {} : { adminNote: input.adminNote?.trim() || null }),
      },
    },
  });
  return getAdminPaymentOrderDetail(input.orderNo, { client });
}

export function adminOrderAuditSnapshot(detail: AdminPaymentOrderDetail): JsonValue {
  return JSON.parse(
    JSON.stringify({
      orderNo: detail.order.orderNo,
      userId: detail.user?.id ?? null,
      provider: detail.order.provider,
      productCode: detail.order.productCode,
      amountCents: detail.order.amountCents,
      status: detail.order.status,
      paidAt: detail.order.paidAt,
      entitlementGrantedAt: detail.order.entitlementGrantedAt,
      billingCategory: detail.order.billingCategory,
      revenueEligible: detail.order.revenueEligible,
      adminNote: detail.order.adminNote,
    }),
  ) as JsonValue;
}
