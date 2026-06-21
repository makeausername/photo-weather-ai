import { describe, expect, it } from "vitest";
import {
  assertUserOwnsPaymentOrder,
  createPaymentOrder,
  getPaymentOrderByOrderNo,
  grantPaymentEntitlementOnce,
  listUserEntitlements,
  markPaymentOrderPaid,
  PaymentAmountMismatchError,
  PaymentOrderAccessDeniedError,
} from "../index.js";
import { buildSeedData } from "../seed-data.js";
import type { DatabaseClient } from "../types.js";

function createPaymentFakeClient(): { readonly client: DatabaseClient; readonly state: any } {
  const now = new Date("2026-06-21T00:00:00.000Z");
  const products = new Map<string, any>();
  const orders = new Map<string, any>();
  const entitlements = new Map<string, any>();
  const ledger = new Map<string, any>();

  buildSeedData().billingProducts.forEach((product, index) => {
    products.set(product.code, {
      id: `product-${index}`,
      ...product,
      createdAt: now,
      updatedAt: now,
    });
  });

  const client: DatabaseClient = {
    systemSetting: {
      findUnique: async () => null,
      findMany: async () => [],
      upsert: async () => null,
    },
    providerConfig: {
      findUnique: async () => null,
      findMany: async () => [],
      upsert: async () => null,
      update: async () => null,
    },
    adminAuditLog: {
      create: async ({ data }: any) => ({ id: "audit", ...data, createdAt: now }),
      findMany: async () => [],
    },
    apiUsageLog: {
      create: async ({ data }: any) => ({ id: "usage", ...data, createdAt: now }),
    },
    billingProduct: {
      findUnique: async ({ where }: any) => products.get(where.code) ?? null,
      findMany: async () => [...products.values()],
      upsert: async () => null,
    },
    paymentOrder: {
      create: async ({ data }: any) => {
        const order = {
          id: `order-${orders.size}`,
          productId: null,
          status: "created",
          paidAt: null,
          expiresAt: null,
          providerTradeNo: null,
          providerPayloadJson: null,
          metadataJson: null,
          entitlementGrantedAt: null,
          createdAt: new Date(now.getTime() + orders.size),
          updatedAt: now,
          ...data,
        };
        orders.set(order.orderNo, order);
        return order;
      },
      findUnique: async ({ where }: any) => {
        if (where.orderNo) {
          return orders.get(where.orderNo) ?? null;
        }
        return [...orders.values()].find((order) => order.id === where.id) ?? null;
      },
      findMany: async ({ where }: any = {}) =>
        [...orders.values()].filter(
          (order) => where?.userId === undefined || order.userId === where.userId,
        ),
      update: async ({ where, data }: any) => {
        const existing = orders.get(where.orderNo);
        if (!existing) {
          throw new Error("missing order");
        }
        const next = {
          ...existing,
          ...Object.fromEntries(
            Object.entries(data ?? {}).filter(([, value]) => value !== undefined),
          ),
          updatedAt: now,
        };
        orders.set(next.orderNo, next);
        return next;
      },
    },
    paymentNotification: {
      create: async ({ data }: any) => ({ id: "notification", ...data, createdAt: now }),
      update: async ({ data }: any) => ({ id: "notification", ...data, createdAt: now }),
    },
    userEntitlement: {
      create: async ({ data }: any) => {
        const entitlement = {
          id: `entitlement-${entitlements.size}`,
          startsAt: now,
          expiresAt: null,
          grantedAt: now,
          metadataJson: null,
          ...data,
        };
        entitlements.set(`${entitlement.orderId}:${entitlement.type}`, entitlement);
        return entitlement;
      },
      findMany: async ({ where }: any = {}) =>
        [...entitlements.values()].filter(
          (entitlement) =>
            (where?.userId === undefined || entitlement.userId === where.userId) &&
            (where?.orderId === undefined || entitlement.orderId === where.orderId),
        ),
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.orderId_type.orderId}:${where.orderId_type.type}`;
        const existing = entitlements.get(key);
        if (existing) {
          const next = { ...existing, ...update };
          entitlements.set(key, next);
          return next;
        }
        return client.userEntitlement!.create({ data: create });
      },
    },
    userCreditLedger: {
      create: async ({ data }: any) => {
        const entry = {
          id: `ledger-${ledger.size}`,
          orderId: null,
          entitlementId: null,
          metadataJson: null,
          createdAt: new Date(now.getTime() + ledger.size),
          ...data,
        };
        ledger.set(`${entry.orderId}:${entry.reason}`, entry);
        return entry;
      },
      findMany: async ({ where }: any = {}) =>
        [...ledger.values()].filter((entry) => where?.userId === undefined || entry.userId === where.userId),
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.orderId_reason.orderId}:${where.orderId_reason.reason}`;
        const existing = ledger.get(key);
        if (existing) {
          const next = { ...existing, ...update };
          ledger.set(key, next);
          return next;
        }
        return client.userCreditLedger!.create({ data: create });
      },
    },
  };

  return { client, state: { products, orders, entitlements, ledger } };
}

describe("payment helpers", () => {
  it("creates a payment order with integer cents", async () => {
    const { client } = createPaymentFakeClient();
    const order = await createPaymentOrder(
      {
        orderNo: "PTEST001",
        userId: "user-1",
        provider: "wechat_pay",
        amountCents: 990,
        productCode: "forecast_credit_20",
        status: "pending",
      },
      { client },
    );

    expect(order).toMatchObject({
      orderNo: "PTEST001",
      userId: "user-1",
      amountCents: 990,
      currency: "CNY",
      status: "pending",
    });
  });

  it("marks paid and grants entitlement only once for repeated callbacks", async () => {
    const { client, state } = createPaymentFakeClient();
    await createPaymentOrder(
      {
        orderNo: "PTEST002",
        userId: "user-1",
        provider: "wechat_pay",
        amountCents: 990,
        productCode: "forecast_credit_20",
        status: "pending",
      },
      { client },
    );

    await markPaymentOrderPaid(
      { orderNo: "PTEST002", provider: "wechat_pay", amountCents: 990, providerTradeNo: "wx-1" },
      { client },
    );
    await markPaymentOrderPaid(
      { orderNo: "PTEST002", provider: "wechat_pay", amountCents: 990, providerTradeNo: "wx-1" },
      { client },
    );
    const firstGrant = await grantPaymentEntitlementOnce({ orderNo: "PTEST002" }, { client });
    const secondGrant = await grantPaymentEntitlementOnce({ orderNo: "PTEST002" }, { client });

    expect(firstGrant.granted).toBe(true);
    expect(secondGrant.granted).toBe(false);
    expect(state.entitlements.size).toBe(1);
    expect(state.ledger.size).toBe(1);
    await expect(listUserEntitlements({ userId: "user-1" }, { client })).resolves.toHaveLength(1);
  });

  it("rejects amount mismatch and does not mark the order paid", async () => {
    const { client } = createPaymentFakeClient();
    await createPaymentOrder(
      {
        orderNo: "PTEST003",
        userId: "user-1",
        provider: "alipay",
        amountCents: 3990,
        productCode: "forecast_credit_100",
        status: "pending",
      },
      { client },
    );

    await expect(
      markPaymentOrderPaid(
        { orderNo: "PTEST003", provider: "alipay", amountCents: 3900 },
        { client },
      ),
    ).rejects.toBeInstanceOf(PaymentAmountMismatchError);
    await expect(getPaymentOrderByOrderNo("PTEST003", { client })).resolves.toMatchObject({
      status: "pending",
    });
  });

  it("does not allow a user to access another user's order", async () => {
    const { client } = createPaymentFakeClient();
    await createPaymentOrder(
      {
        orderNo: "PTEST004",
        userId: "user-1",
        provider: "wechat_pay",
        amountCents: 990,
        productCode: "forecast_credit_20",
      },
      { client },
    );

    await expect(
      assertUserOwnsPaymentOrder({ orderNo: "PTEST004", userId: "user-2" }, { client }),
    ).rejects.toBeInstanceOf(PaymentOrderAccessDeniedError);
  });
});
