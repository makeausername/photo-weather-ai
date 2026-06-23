import { randomBytes } from "node:crypto";

import {
  fullForecastAccessEntitlementType,
  getForecastAccessSettings,
  isInternalTrialProduct,
  monthlyFullAccessProductCode,
  quarterlyFullAccessProductCode,
  trialFullAccessProductCode,
  yearlyFullAccessProductCode,
} from "./access.js";
import { createAuditLog } from "./audit.js";
import { getPrismaClient } from "./client.js";
import { isPlainJsonObject } from "./json.js";
import type {
  BillingProductRecord,
  DatabaseClient,
  EntitlementType,
  JsonValue,
  PaymentNotificationRecord,
  PaymentNotifyStatus,
  PaymentOrderRecord,
  PaymentOrderStatus,
  PaymentProviderCode,
  UserCreditLedgerRecord,
  UserEntitlementRecord,
} from "./types.js";

export class PaymentOrderNotFoundError extends Error {
  constructor(orderNo: string) {
    super(`Payment order not found: ${orderNo}`);
  }
}

export class PaymentAmountMismatchError extends Error {
  constructor(
    readonly orderNo: string,
    readonly expectedAmountCents: number,
    readonly receivedAmountCents: number,
  ) {
    super(`Payment amount mismatch for ${orderNo}.`);
  }
}

export class InvalidPaymentStatusTransitionError extends Error {
  constructor(
    readonly orderNo: string,
    readonly fromStatus: PaymentOrderStatus,
    readonly toStatus: PaymentOrderStatus,
  ) {
    super(`Invalid payment status transition for ${orderNo}: ${fromStatus} -> ${toStatus}`);
  }
}

export class PaymentOrderAccessDeniedError extends Error {
  constructor(orderNo: string) {
    super(`Payment order is not owned by the current user: ${orderNo}`);
  }
}

export class PaymentEntitlementGrantError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type CreatePaymentOrderInput = {
  readonly userId: string;
  readonly provider: PaymentProviderCode;
  readonly amountCents: number;
  readonly currency?: string;
  readonly productCode: string;
  readonly productId?: string | null;
  readonly orderNo?: string;
  readonly status?: PaymentOrderStatus;
  readonly expiresAt?: Date | null;
  readonly providerPayloadJson?: JsonValue | null;
  readonly metadataJson?: JsonValue | null;
};

export type UpdatePaymentOrderStatusInput = {
  readonly orderNo: string;
  readonly status: PaymentOrderStatus;
  readonly providerTradeNo?: string | null;
  readonly providerPayloadJson?: JsonValue | null;
  readonly metadataJson?: JsonValue | null;
};

export type MarkPaymentOrderPaidInput = {
  readonly orderNo: string;
  readonly provider?: PaymentProviderCode;
  readonly amountCents: number;
  readonly providerTradeNo?: string | null;
  readonly providerPayloadJson?: JsonValue | null;
  readonly paidAt?: Date;
};

export type RecordPaymentNotificationInput = {
  readonly provider: PaymentProviderCode;
  readonly orderNo?: string | null;
  readonly providerTradeNo?: string | null;
  readonly rawBody?: string | null;
  readonly rawJson?: JsonValue | null;
  readonly headersJson?: JsonValue | null;
  readonly signatureVerified?: boolean;
  readonly status?: PaymentNotifyStatus;
  readonly errorMessage?: string | null;
  readonly processedAt?: Date | null;
};

export type GrantPaymentEntitlementResult = {
  readonly granted: boolean;
  readonly order: PaymentOrderRecord;
  readonly entitlements: readonly UserEntitlementRecord[];
  readonly creditLedgerEntry?: UserCreditLedgerRecord | null;
};

export type GrantRegistrationTrialResult = GrantPaymentEntitlementResult & {
  readonly trialEnabled: boolean;
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

async function withTransaction<TResult>(
  client: DatabaseClient,
  operation: (transactionClient: DatabaseClient) => Promise<TResult>,
): Promise<TResult> {
  if (typeof client.$transaction === "function") {
    return client.$transaction(operation);
  }

  return operation(client);
}

function requireDelegate<TDelegate>(
  delegate: TDelegate | undefined,
  name: string,
): TDelegate {
  if (!delegate) {
    throw new Error(`Database client is missing ${name} delegate.`);
  }
  return delegate;
}

function normalizeBillingProduct(record: any): BillingProductRecord {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    amountCents: record.amountCents,
    currency: record.currency,
    credits: record.credits,
    durationDays: record.durationDays ?? null,
    enabled: record.enabled,
    sortOrder: record.sortOrder,
    metadataJson: record.metadataJson ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizePaymentOrder(record: any): PaymentOrderRecord {
  return {
    id: record.id,
    orderNo: record.orderNo,
    userId: record.userId,
    provider: record.provider,
    amountCents: record.amountCents,
    currency: record.currency,
    productCode: record.productCode,
    productId: record.productId ?? null,
    status: record.status,
    paidAt: record.paidAt ?? null,
    expiresAt: record.expiresAt ?? null,
    providerTradeNo: record.providerTradeNo ?? null,
    providerPayloadJson: record.providerPayloadJson ?? null,
    metadataJson: record.metadataJson ?? null,
    entitlementGrantedAt: record.entitlementGrantedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizePaymentNotification(record: any): PaymentNotificationRecord {
  return {
    id: record.id,
    provider: record.provider,
    orderNo: record.orderNo ?? null,
    providerTradeNo: record.providerTradeNo ?? null,
    rawBody: record.rawBody ?? null,
    rawJson: record.rawJson ?? null,
    headersJson: record.headersJson ?? null,
    signatureVerified: record.signatureVerified,
    status: record.status,
    errorMessage: record.errorMessage ?? null,
    createdAt: record.createdAt,
    processedAt: record.processedAt ?? null,
  };
}

function normalizeUserEntitlement(record: any): UserEntitlementRecord {
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
    metadataJson: record.metadataJson ?? null,
  };
}

function normalizeUserCreditLedger(record: any): UserCreditLedgerRecord {
  return {
    id: record.id,
    userId: record.userId,
    orderId: record.orderId ?? null,
    entitlementId: record.entitlementId ?? null,
    delta: record.delta,
    balanceAfter: record.balanceAfter,
    reason: record.reason,
    metadataJson: record.metadataJson ?? null,
    createdAt: record.createdAt,
  };
}

function assertPositiveAmount(amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("Payment amount must be a positive integer number of cents.");
  }
}

function generatePaymentOrderNo(now = new Date()): string {
  const timestamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  return `P${timestamp}${randomBytes(5).toString("hex").toUpperCase()}`;
}

function canTransitionPaymentStatus(
  current: PaymentOrderStatus,
  next: PaymentOrderStatus,
): boolean {
  if (current === next) {
    return true;
  }
  if (current === "paid") {
    return next === "refunded";
  }
  if (current === "closed" || current === "canceled" || current === "refunded") {
    return false;
  }
  if (next === "created") {
    return false;
  }
  return true;
}

function entitlementTypeForProduct(product: BillingProductRecord): EntitlementType {
  if (product.credits > 0) {
    return "forecast_credit";
  }
  if (product.durationDays && product.durationDays > 0) {
    return "subscription";
  }
  return "feature_unlock";
}

function entitlementQuantityForProduct(product: BillingProductRecord): number {
  return product.credits > 0 ? product.credits : 1;
}

function entitlementExpiryForProduct(product: BillingProductRecord, startsAt: Date): Date | null {
  if (!product.durationDays || product.durationDays <= 0) {
    return null;
  }

  return new Date(startsAt.getTime() + product.durationDays * 24 * 60 * 60 * 1000);
}

function readStringMetadata(value: JsonValue | null | undefined, key: string): string | null {
  if (!isPlainJsonObject(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function readBooleanMetadata(value: JsonValue | null | undefined, key: string): boolean | null {
  if (!isPlainJsonObject(value)) {
    return null;
  }
  const field = value[key];
  return typeof field === "boolean" ? field : null;
}

const publicFullAccessPurchaseProductCodes = new Set<string>([
  monthlyFullAccessProductCode,
  quarterlyFullAccessProductCode,
  yearlyFullAccessProductCode,
]);

export function isInternalTrialOrder(
  order: Pick<
    PaymentOrderRecord,
    "productCode" | "metadataJson" | "providerTradeNo" | "provider" | "amountCents"
  >,
): boolean {
  const source = readStringMetadata(order.metadataJson, "source");
  const internal = readBooleanMetadata(order.metadataJson, "internal");
  return (
    order.productCode === trialFullAccessProductCode ||
    internal === true ||
    source === "registration_trial" ||
    order.providerTradeNo?.startsWith("registration_trial:") === true ||
    (order.provider === "mock" &&
      order.amountCents === 0 &&
      order.productCode === trialFullAccessProductCode)
  );
}

export function isUserVisibleBillingOrder(
  order: Pick<
    PaymentOrderRecord,
    "productCode" | "metadataJson" | "providerTradeNo" | "provider" | "amountCents"
  >,
): boolean {
  if (isInternalTrialOrder(order) || order.amountCents <= 0) {
    return false;
  }

  if (!publicFullAccessPurchaseProductCodes.has(order.productCode)) {
    return false;
  }

  return order.provider === "wechat_pay" || order.provider === "alipay" || order.provider === "mock";
}

export function isPaidUserPurchaseOrder(
  order: Pick<
    PaymentOrderRecord,
    "productCode" | "metadataJson" | "providerTradeNo" | "provider" | "amountCents" | "status"
  >,
): boolean {
  return isUserVisibleBillingOrder(order) && order.status === "paid" && order.amountCents > 0;
}

function productGrantsFullForecastAccess(product: BillingProductRecord): boolean {
  if (!product.durationDays || product.durationDays <= 0) {
    return false;
  }
  return readStringMetadata(product.metadataJson, "grantType") === fullForecastAccessEntitlementType;
}

function compactJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function latestActiveFullAccessExpiration(
  entitlements: readonly UserEntitlementRecord[],
  now: Date,
): Date | null {
  let latest: Date | null = null;
  for (const entitlement of entitlements) {
    if (entitlement.expiresAt === null || entitlement.expiresAt.getTime() <= now.getTime()) {
      continue;
    }
    if (!latest || entitlement.expiresAt.getTime() > latest.getTime()) {
      latest = entitlement.expiresAt;
    }
  }
  return latest;
}

function assertFullAccessProductGrantable(input: {
  readonly order: PaymentOrderRecord;
  readonly product: BillingProductRecord;
}): void {
  const { order, product } = input;
  if (!productGrantsFullForecastAccess(product)) {
    throw new PaymentEntitlementGrantError(
      `Billing product ${product.code} does not grant full forecast access.`,
    );
  }
  if (!product.durationDays || product.durationDays <= 0) {
    throw new PaymentEntitlementGrantError("Full-access product duration must be positive.");
  }

  if (isInternalTrialProduct(product)) {
    const source = readStringMetadata(order.metadataJson, "source");
    const internal = readBooleanMetadata(order.metadataJson, "internal");
    if (
      order.provider !== "mock" ||
      order.amountCents !== 0 ||
      source !== "registration_trial" ||
      internal !== true
    ) {
      throw new PaymentEntitlementGrantError("Trial product can only be granted by internal registration flow.");
    }
    return;
  }

  if (product.code === trialFullAccessProductCode || order.amountCents <= 0) {
    throw new PaymentEntitlementGrantError("Public paid orders must have a positive amount.");
  }
}

export async function listBillingProducts(
  options: { readonly enabledOnly?: boolean; readonly client?: DatabaseClient } = {},
): Promise<BillingProductRecord[]> {
  const client = await resolveClient(options.client);
  const billingProduct = requireDelegate(client.billingProduct, "billingProduct");
  const records = await billingProduct.findMany({
    where: options.enabledOnly ? { enabled: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  return records.map(normalizeBillingProduct);
}

export async function getBillingProductByCode(
  code: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<BillingProductRecord | null> {
  const client = await resolveClient(options.client);
  const billingProduct = requireDelegate(client.billingProduct, "billingProduct");
  const record = await billingProduct.findUnique({ where: { code } });
  return record ? normalizeBillingProduct(record) : null;
}

export async function createPaymentOrder(
  input: CreatePaymentOrderInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord> {
  assertPositiveAmount(input.amountCents);
  const client = await resolveClient(options.client);
  const paymentOrder = requireDelegate(client.paymentOrder, "paymentOrder");
  const now = new Date();
  const record = await paymentOrder.create({
    data: {
      orderNo: input.orderNo ?? generatePaymentOrderNo(now),
      userId: input.userId,
      provider: input.provider,
      amountCents: input.amountCents,
      currency: input.currency ?? "CNY",
      productCode: input.productCode,
      productId: input.productId ?? null,
      status: input.status ?? "created",
      expiresAt: input.expiresAt ?? new Date(now.getTime() + 30 * 60 * 1000),
      providerPayloadJson: input.providerPayloadJson ?? null,
      metadataJson: input.metadataJson ?? null,
    },
  });
  return normalizePaymentOrder(record);
}

export async function getPaymentOrderByOrderNo(
  orderNo: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord | null> {
  const client = await resolveClient(options.client);
  const paymentOrder = requireDelegate(client.paymentOrder, "paymentOrder");
  const record = await paymentOrder.findUnique({ where: { orderNo } });
  return record ? normalizePaymentOrder(record) : null;
}

export async function assertUserOwnsPaymentOrder(
  input: { readonly orderNo: string; readonly userId: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord> {
  const order = await getPaymentOrderByOrderNo(input.orderNo, options);
  if (!order) {
    throw new PaymentOrderNotFoundError(input.orderNo);
  }
  if (order.userId !== input.userId) {
    throw new PaymentOrderAccessDeniedError(input.orderNo);
  }
  return order;
}

export async function listUserPaymentOrders(
  input: { readonly userId: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord[]> {
  const client = await resolveClient(options.client);
  const paymentOrder = requireDelegate(client.paymentOrder, "paymentOrder");
  const records = await paymentOrder.findMany({
    where: { userId: input.userId },
    orderBy: [{ createdAt: "desc" }],
    take: input.limit ?? 20,
  });
  return records.map(normalizePaymentOrder);
}

export async function listUserVisibleBillingOrders(
  input: { readonly userId: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord[]> {
  const client = await resolveClient(options.client);
  const paymentOrder = requireDelegate(client.paymentOrder, "paymentOrder");
  const records = await paymentOrder.findMany({
    where: { userId: input.userId },
    orderBy: [{ createdAt: "desc" }],
  });
  const limit = input.limit ?? 20;
  return records.map(normalizePaymentOrder).filter(isUserVisibleBillingOrder).slice(0, limit);
}

export async function updatePaymentOrderStatus(
  input: UpdatePaymentOrderStatusInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord> {
  const client = await resolveClient(options.client);
  return withTransaction(client, async (tx) => {
    const paymentOrder = requireDelegate(tx.paymentOrder, "paymentOrder");
    const existing = await paymentOrder.findUnique({ where: { orderNo: input.orderNo } });
    if (!existing) {
      throw new PaymentOrderNotFoundError(input.orderNo);
    }

    const current = normalizePaymentOrder(existing);
    if (!canTransitionPaymentStatus(current.status, input.status)) {
      throw new InvalidPaymentStatusTransitionError(input.orderNo, current.status, input.status);
    }

    const record = await paymentOrder.update({
      where: { orderNo: input.orderNo },
      data: {
        status: input.status,
        providerTradeNo: input.providerTradeNo ?? current.providerTradeNo,
        providerPayloadJson: input.providerPayloadJson ?? current.providerPayloadJson,
        metadataJson: input.metadataJson ?? current.metadataJson,
      },
    });
    return normalizePaymentOrder(record);
  });
}

export async function markPaymentOrderPaid(
  input: MarkPaymentOrderPaidInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentOrderRecord> {
  assertPositiveAmount(input.amountCents);
  const client = await resolveClient(options.client);
  return withTransaction(client, async (tx) => {
    const paymentOrder = requireDelegate(tx.paymentOrder, "paymentOrder");
    const existing = await paymentOrder.findUnique({ where: { orderNo: input.orderNo } });
    if (!existing) {
      throw new PaymentOrderNotFoundError(input.orderNo);
    }

    const current = normalizePaymentOrder(existing);
    if (input.provider && current.provider !== input.provider) {
      throw new InvalidPaymentStatusTransitionError(input.orderNo, current.status, current.status);
    }
    if (current.amountCents !== input.amountCents) {
      throw new PaymentAmountMismatchError(input.orderNo, current.amountCents, input.amountCents);
    }
    if (current.status === "paid") {
      return current;
    }
    if (!canTransitionPaymentStatus(current.status, "paid")) {
      throw new InvalidPaymentStatusTransitionError(input.orderNo, current.status, "paid");
    }

    const record = await paymentOrder.update({
      where: { orderNo: input.orderNo },
      data: {
        status: "paid",
        paidAt: input.paidAt ?? new Date(),
        providerTradeNo: input.providerTradeNo ?? current.providerTradeNo,
        providerPayloadJson: input.providerPayloadJson ?? current.providerPayloadJson,
      },
    });
    return normalizePaymentOrder(record);
  });
}

export async function recordPaymentNotification(
  input: RecordPaymentNotificationInput,
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentNotificationRecord> {
  const client = await resolveClient(options.client);
  const paymentNotification = requireDelegate(client.paymentNotification, "paymentNotification");
  const record = await paymentNotification.create({
    data: {
      provider: input.provider,
      orderNo: input.orderNo ?? null,
      providerTradeNo: input.providerTradeNo ?? null,
      rawBody: input.rawBody ?? null,
      rawJson: input.rawJson ?? null,
      headersJson: input.headersJson ?? null,
      signatureVerified: input.signatureVerified ?? false,
      status: input.status ?? "received",
      errorMessage: input.errorMessage ?? null,
      processedAt: input.processedAt ?? null,
    },
  });
  return normalizePaymentNotification(record);
}

export async function updatePaymentNotificationStatus(
  input: {
    readonly id: string;
    readonly status: PaymentNotifyStatus;
    readonly signatureVerified?: boolean;
    readonly orderNo?: string | null;
    readonly providerTradeNo?: string | null;
    readonly errorMessage?: string | null;
    readonly processedAt?: Date | null;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<PaymentNotificationRecord> {
  const client = await resolveClient(options.client);
  const paymentNotification = requireDelegate(client.paymentNotification, "paymentNotification");
  const record = await paymentNotification.update({
    where: { id: input.id },
    data: {
      status: input.status,
      signatureVerified: input.signatureVerified,
      orderNo: input.orderNo,
      providerTradeNo: input.providerTradeNo,
      errorMessage: input.errorMessage ?? null,
      processedAt: input.processedAt ?? new Date(),
    },
  });
  return normalizePaymentNotification(record);
}

async function grantFullForecastAccessFromPaidOrderInTransaction(
  input: {
    readonly order: PaymentOrderRecord;
    readonly product: BillingProductRecord;
    readonly now: Date;
    readonly actorUserId?: string | null;
  },
  tx: DatabaseClient,
): Promise<GrantPaymentEntitlementResult> {
  const paymentOrder = requireDelegate(tx.paymentOrder, "paymentOrder");
  const userEntitlement = requireDelegate(tx.userEntitlement, "userEntitlement");
  const userCreditLedger = requireDelegate(tx.userCreditLedger, "userCreditLedger");
  const { order, product, now } = input;

  if (order.status !== "paid") {
    throw new PaymentEntitlementGrantError("Full forecast access can only be granted for paid orders.");
  }
  assertFullAccessProductGrantable({ order, product });

  const existingEntitlements = await userEntitlement.findMany({
    where: { orderId: order.id, type: fullForecastAccessEntitlementType },
    orderBy: [{ grantedAt: "asc" }],
  });
  if (order.entitlementGrantedAt || existingEntitlements.length > 0) {
    return {
      granted: false,
      order,
      entitlements: existingEntitlements.map(normalizeUserEntitlement),
      creditLedgerEntry: null,
    };
  }

  const activeRecords = await userEntitlement.findMany({
    where: {
      userId: order.userId,
      type: fullForecastAccessEntitlementType,
    },
    orderBy: [{ expiresAt: "desc" }, { grantedAt: "desc" }],
  });
  const activeEntitlements = activeRecords.map(normalizeUserEntitlement);
  const stackedFrom = latestActiveFullAccessExpiration(activeEntitlements, now);
  const base = stackedFrom && stackedFrom.getTime() > now.getTime() ? stackedFrom : now;
  const expiresAt = addDays(base, product.durationDays ?? 0);
  const entitlementData = {
    userId: order.userId,
    orderId: order.id,
    type: fullForecastAccessEntitlementType,
    quantity: 1,
    remainingQuantity: null,
    startsAt: now,
    expiresAt,
    grantedAt: now,
    metadataJson: compactJson({
      productCode: product.code,
      productName: product.name,
      durationDays: product.durationDays,
      source: isInternalTrialProduct(product) ? "registration_trial" : "paid_order",
      orderNo: order.orderNo,
      stackedFrom: stackedFrom?.toISOString() ?? null,
    }),
  };
  const entitlementRecord =
    typeof userEntitlement.upsert === "function"
      ? await userEntitlement.upsert({
          where: {
            orderId_type: {
              orderId: order.id,
              type: fullForecastAccessEntitlementType,
            },
          },
          create: entitlementData,
          update: {},
        })
      : await userEntitlement.create({ data: entitlementData });
  const entitlement = normalizeUserEntitlement(entitlementRecord);

  const ledgerRecords = await userCreditLedger.findMany({
    where: { userId: order.userId },
    orderBy: [{ createdAt: "asc" }],
  });
  const currentBalance = ledgerRecords.reduce(
    (total, record) => total + Number(record.delta ?? 0),
    0,
  );
  const ledgerData = {
    userId: order.userId,
    orderId: order.id,
    entitlementId: entitlement.id,
    delta: 0,
    balanceAfter: currentBalance,
    reason: "full_forecast_access_grant",
    metadataJson: compactJson({
      orderNo: order.orderNo,
      productCode: product.code,
      expiresAt: expiresAt.toISOString(),
    }),
  };
  const ledgerRecord =
    typeof userCreditLedger.upsert === "function"
      ? await userCreditLedger.upsert({
          where: { orderId_reason: { orderId: order.id, reason: ledgerData.reason } },
          create: ledgerData,
          update: {},
        })
      : await userCreditLedger.create({ data: ledgerData });
  const creditLedgerEntry = normalizeUserCreditLedger(ledgerRecord);

  const updatedOrder = normalizePaymentOrder(
    await paymentOrder.update({
      where: { orderNo: order.orderNo },
      data: { entitlementGrantedAt: now },
    }),
  );

  await createAuditLog(
    {
      actorUserId: input.actorUserId ?? null,
      action: "billing.entitlement.full_forecast_access_granted",
      targetType: "payment_order",
      targetId: order.orderNo,
      afterJson: compactJson({
        userId: order.userId,
        orderNo: order.orderNo,
        productCode: product.code,
        entitlementId: entitlement.id,
        expiresAt: expiresAt.toISOString(),
      }),
    },
    { client: tx },
  );

  return {
    granted: true,
    order: updatedOrder,
    entitlements: [entitlement],
    creditLedgerEntry,
  };
}

export async function grantFullForecastAccessFromOrderOnce(
  input: {
    readonly orderNo: string;
    readonly actorUserId?: string | null;
  },
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<GrantPaymentEntitlementResult> {
  const client = await resolveClient(options.client);
  const now = options.now ?? new Date();
  return withTransaction(client, async (tx) => {
    const paymentOrder = requireDelegate(tx.paymentOrder, "paymentOrder");
    const billingProduct = requireDelegate(tx.billingProduct, "billingProduct");
    const orderRecord = await paymentOrder.findUnique({ where: { orderNo: input.orderNo } });
    if (!orderRecord) {
      throw new PaymentOrderNotFoundError(input.orderNo);
    }
    const order = normalizePaymentOrder(orderRecord);
    const productRecord = await billingProduct.findUnique({ where: { code: order.productCode } });
    if (!productRecord) {
      throw new PaymentEntitlementGrantError(`Billing product not found: ${order.productCode}`);
    }
    const product = normalizeBillingProduct(productRecord);
    return grantFullForecastAccessFromPaidOrderInTransaction(
      { order, product, now, actorUserId: input.actorUserId },
      tx,
    );
  });
}

export async function grantRegistrationTrialForUserOnce(
  input: { readonly userId: string; readonly actorUserId?: string | null },
  options: { readonly client?: DatabaseClient; readonly env?: NodeJS.ProcessEnv; readonly now?: Date } = {},
): Promise<GrantRegistrationTrialResult> {
  const settings = getForecastAccessSettings(options.env);
  const client = await resolveClient(options.client);
  const now = options.now ?? new Date();
  if (!settings.registrationTrialEnabled) {
    return {
      trialEnabled: false,
      granted: false,
      order: {
        id: "",
        orderNo: "",
        userId: input.userId,
        provider: "mock",
        amountCents: 0,
        currency: "CNY",
        productCode: trialFullAccessProductCode,
        productId: null,
        status: "closed",
        paidAt: null,
        expiresAt: null,
        providerTradeNo: null,
        providerPayloadJson: null,
        metadataJson: null,
        entitlementGrantedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      entitlements: [],
      creditLedgerEntry: null,
    };
  }

  return withTransaction(client, async (tx) => {
    const paymentOrder = requireDelegate(tx.paymentOrder, "paymentOrder");
    const billingProduct = requireDelegate(tx.billingProduct, "billingProduct");
    const productRecord = await billingProduct.findUnique({
      where: { code: trialFullAccessProductCode },
    });
    if (!productRecord) {
      throw new PaymentEntitlementGrantError(`Billing product not found: ${trialFullAccessProductCode}`);
    }
    const product = normalizeBillingProduct(productRecord);
    if (!product.enabled || !isInternalTrialProduct(product)) {
      throw new PaymentEntitlementGrantError("Registration trial product is not marked internal.");
    }

    const existingOrders = await paymentOrder.findMany({
      where: {
        userId: input.userId,
      },
      orderBy: [{ createdAt: "asc" }],
    });
    const existingTrial = existingOrders
      .map(normalizePaymentOrder)
      .find((order) => order.productCode === trialFullAccessProductCode);

    const order =
      existingTrial ??
      normalizePaymentOrder(
        await paymentOrder.create({
          data: {
            orderNo: generatePaymentOrderNo(now).replace(/^P/, "T"),
            userId: input.userId,
            provider: "mock",
            amountCents: 0,
            currency: product.currency,
            productCode: product.code,
            productId: product.id,
            status: "paid",
            paidAt: now,
            expiresAt: null,
            providerTradeNo: `registration_trial:${input.userId}`,
            providerPayloadJson: null,
            metadataJson: compactJson({
              internal: true,
              source: "registration_trial",
              grantType: fullForecastAccessEntitlementType,
              trialDays: settings.registrationTrialDays,
            }),
          },
        }),
      );

    if (existingTrial && existingTrial.status !== "paid") {
      return {
        trialEnabled: true,
        granted: false,
        order: existingTrial,
        entitlements: [],
        creditLedgerEntry: null,
      };
    }

    const grant = await grantFullForecastAccessFromPaidOrderInTransaction(
      {
        order,
        product: {
          ...product,
          durationDays: settings.registrationTrialDays,
        },
        now,
        actorUserId: input.actorUserId ?? input.userId,
      },
      tx,
    );
    return {
      trialEnabled: true,
      ...grant,
    };
  });
}

export async function grantPaymentEntitlementOnce(
  input: { readonly orderNo: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<GrantPaymentEntitlementResult> {
  const client = await resolveClient(options.client);
  return withTransaction(client, async (tx) => {
    const paymentOrder = requireDelegate(tx.paymentOrder, "paymentOrder");
    const billingProduct = requireDelegate(tx.billingProduct, "billingProduct");
    const userEntitlement = requireDelegate(tx.userEntitlement, "userEntitlement");
    const userCreditLedger = requireDelegate(tx.userCreditLedger, "userCreditLedger");
    const orderRecord = await paymentOrder.findUnique({ where: { orderNo: input.orderNo } });
    if (!orderRecord) {
      throw new PaymentOrderNotFoundError(input.orderNo);
    }

    const order = normalizePaymentOrder(orderRecord);
    if (order.status !== "paid") {
      throw new PaymentEntitlementGrantError("Payment entitlement can only be granted for paid orders.");
    }

    const productRecord = await billingProduct.findUnique({ where: { code: order.productCode } });
    if (!productRecord) {
      throw new PaymentEntitlementGrantError(`Billing product not found: ${order.productCode}`);
    }

    const product = normalizeBillingProduct(productRecord);
    if (productGrantsFullForecastAccess(product)) {
      return grantFullForecastAccessFromPaidOrderInTransaction(
        { order, product, now: new Date() },
        tx,
      );
    }

    const existingEntitlements = await userEntitlement.findMany({
      where: { orderId: order.id },
      orderBy: [{ grantedAt: "asc" }],
    });
    if (order.entitlementGrantedAt || existingEntitlements.length > 0) {
      return {
        granted: false,
        order,
        entitlements: existingEntitlements.map(normalizeUserEntitlement),
        creditLedgerEntry: null,
      };
    }

    const startsAt = new Date();
    const type = entitlementTypeForProduct(product);
    const quantity = entitlementQuantityForProduct(product);
    const expiresAt = entitlementExpiryForProduct(product, startsAt);
    const entitlementData = {
      userId: order.userId,
      orderId: order.id,
      type,
      quantity,
      remainingQuantity: type === "forecast_credit" ? quantity : null,
      startsAt,
      expiresAt,
      grantedAt: startsAt,
      metadataJson: {
        productCode: product.code,
        productName: product.name,
      },
    };
    const entitlementRecord =
      typeof userEntitlement.upsert === "function"
        ? await userEntitlement.upsert({
            where: { orderId_type: { orderId: order.id, type } },
            create: entitlementData,
            update: {},
          })
        : await userEntitlement.create({ data: entitlementData });
    const entitlement = normalizeUserEntitlement(entitlementRecord);

    let creditLedgerEntry: UserCreditLedgerRecord | null = null;
    if (type === "forecast_credit" && quantity > 0) {
      const ledgerRecords = await userCreditLedger.findMany({
        where: { userId: order.userId },
        orderBy: [{ createdAt: "asc" }],
      });
      const currentBalance = ledgerRecords.reduce(
        (total, record) => total + Number(record.delta ?? 0),
        0,
      );
      const ledgerData = {
        userId: order.userId,
        orderId: order.id,
        entitlementId: entitlement.id,
        delta: quantity,
        balanceAfter: currentBalance + quantity,
        reason: "payment_entitlement_grant",
        metadataJson: {
          orderNo: order.orderNo,
          productCode: product.code,
        },
      };
      const ledgerRecord =
        typeof userCreditLedger.upsert === "function"
          ? await userCreditLedger.upsert({
              where: { orderId_reason: { orderId: order.id, reason: ledgerData.reason } },
              create: ledgerData,
              update: {},
            })
          : await userCreditLedger.create({ data: ledgerData });
      creditLedgerEntry = normalizeUserCreditLedger(ledgerRecord);
    }

    const updatedOrder = normalizePaymentOrder(
      await paymentOrder.update({
        where: { orderNo: order.orderNo },
        data: { entitlementGrantedAt: startsAt },
      }),
    );

    return {
      granted: true,
      order: updatedOrder,
      entitlements: [entitlement],
      creditLedgerEntry,
    };
  });
}

export async function listUserEntitlements(
  input: { readonly userId: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<UserEntitlementRecord[]> {
  const client = await resolveClient(options.client);
  const userEntitlement = requireDelegate(client.userEntitlement, "userEntitlement");
  const records = await userEntitlement.findMany({
    where: { userId: input.userId },
    orderBy: [{ grantedAt: "desc" }],
  });
  return records.map(normalizeUserEntitlement);
}

export async function consumeUserCredit(
  input: {
    readonly userId: string;
    readonly quantity?: number;
    readonly reason?: string;
    readonly metadataJson?: JsonValue | null;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<UserCreditLedgerRecord> {
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("Credit consumption quantity must be a positive integer.");
  }

  const client = await resolveClient(options.client);
  return withTransaction(client, async (tx) => {
    const userEntitlement = requireDelegate(tx.userEntitlement, "userEntitlement");
    const userCreditLedger = requireDelegate(tx.userCreditLedger, "userCreditLedger");
    const now = new Date();
    const entitlements = await userEntitlement.findMany({
      where: {
        userId: input.userId,
        type: "forecast_credit",
      },
      orderBy: [{ expiresAt: "asc" }, { grantedAt: "asc" }],
    });
    const entitlement = entitlements.find((item) => {
      const remaining = Number(item.remainingQuantity ?? 0);
      const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
      return remaining >= quantity && (!expiresAt || expiresAt.getTime() > now.getTime());
    });
    if (!entitlement) {
      throw new PaymentEntitlementGrantError("Insufficient forecast credits.");
    }

    if (typeof userEntitlement.update !== "function") {
      throw new Error("Database client does not support entitlement updates.");
    }
    await userEntitlement.update({
      where: { id: entitlement.id },
      data: {
        remainingQuantity: Number(entitlement.remainingQuantity ?? 0) - quantity,
      },
    });

    const ledgerRecords = await userCreditLedger.findMany({
      where: { userId: input.userId },
      orderBy: [{ createdAt: "asc" }],
    });
    const currentBalance = ledgerRecords.reduce(
      (total, record) => total + Number(record.delta ?? 0),
      0,
    );
    const ledgerRecord = await userCreditLedger.create({
      data: {
        userId: input.userId,
        entitlementId: entitlement.id,
        delta: -quantity,
        balanceAfter: currentBalance - quantity,
        reason: input.reason ?? "forecast_credit_consumed",
        metadataJson: input.metadataJson ?? null,
      },
    });
    return normalizeUserCreditLedger(ledgerRecord);
  });
}
