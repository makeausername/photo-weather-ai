import { describe, expect, it } from "vitest";
import {
  InvalidBillingProductUpdateError,
  listPublicBillingProducts,
  seedDatabase,
  updateAdminBillingProduct,
} from "../index.js";
import { buildSeedData } from "../seed-data.js";
import type { DatabaseClient, JsonValue } from "../types.js";

function cloneJson<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function createProductTestClient(): {
  readonly client: DatabaseClient;
  readonly state: {
    readonly products: Map<string, any>;
    readonly auditLogs: any[];
  };
} {
  const now = new Date("2026-06-21T00:00:00.000Z");
  const seedData = buildSeedData();
  const products = new Map<string, any>();
  const auditLogs: any[] = [];

  seedData.billingProducts.forEach((product, index) => {
    products.set(product.code, {
      id: `product-${index}`,
      ...product,
      metadataJson: cloneJson(product.metadataJson),
      createdAt: now,
      updatedAt: now,
    });
  });

  const client = {
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
    billingProduct: {
      findUnique: async ({ where }: any) => products.get(where.code) ?? null,
      findMany: async ({ where, orderBy }: any = {}) =>
        [...products.values()]
          .filter((product) => where?.enabled === undefined || product.enabled === where.enabled)
          .sort((left, right) => {
            if (Array.isArray(orderBy)) {
              return left.sortOrder - right.sortOrder || left.code.localeCompare(right.code);
            }
            return left.code.localeCompare(right.code);
          }),
      upsert: async ({ where, create, update }: any) => {
        const existing = products.get(where.code);
        if (existing) {
          const next = { ...existing, ...update, updatedAt: now };
          products.set(where.code, next);
          return next;
        }
        const next = {
          id: `product-${products.size}`,
          ...create,
          metadataJson: cloneJson(create.metadataJson),
          createdAt: now,
          updatedAt: now,
        };
        products.set(next.code, next);
        return next;
      },
      update: async ({ where, data }: any) => {
        const existing = products.get(where.code);
        if (!existing) {
          throw new Error(`Missing product ${where.code}`);
        }
        const next = {
          ...existing,
          ...Object.fromEntries(
            Object.entries(data ?? {}).filter(([, value]) => value !== undefined),
          ),
          updatedAt: now,
        };
        products.set(where.code, next);
        return next;
      },
    },
    adminAuditLog: {
      create: async ({ data }: any) => {
        const log = { id: `audit-${auditLogs.length}`, ...data, createdAt: now };
        auditLogs.unshift(log);
        return log;
      },
      findMany: async () => auditLogs,
    },
    apiUsageLog: {
      create: async ({ data }: any) => ({ id: "usage", ...data, createdAt: now }),
    },
  } satisfies Partial<DatabaseClient>;

  return { client: client as DatabaseClient, state: { products, auditLogs } };
}

function createSeedTestClient(): {
  readonly client: DatabaseClient;
  readonly state: {
    readonly products: Map<string, any>;
  };
} {
  const now = new Date("2026-06-21T00:00:00.000Z");
  const seedData = buildSeedData();
  const roles = new Map<string, any>();
  const permissions = new Map<string, any>();
  const rolePermissions = new Map<string, any>();
  const settings = new Map<string, any>();
  const providers = new Map<string, any>();
  const products = new Map<string, any>();
  const locations = new Map<string, any>();

  seedData.roles.forEach((role, index) =>
    roles.set(role.code, { id: `role-${index}`, ...role, createdAt: now, updatedAt: now }),
  );
  seedData.permissions.forEach((permission, index) =>
    permissions.set(permission.code, {
      id: `permission-${index}`,
      ...permission,
      createdAt: now,
      updatedAt: now,
    }),
  );
  seedData.billingProducts.forEach((product, index) =>
    products.set(product.code, {
      id: `product-${index}`,
      ...product,
      metadataJson: cloneJson(product.metadataJson),
      createdAt: now,
      updatedAt: now,
    }),
  );

  const client = {
    role: {
      findUnique: async ({ where }: any) => roles.get(where.code) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = roles.get(where.code);
        const next = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `role-${roles.size}`, ...create, createdAt: now, updatedAt: now };
        roles.set(next.code, next);
        return next;
      },
    },
    permission: {
      findUnique: async ({ where }: any) => permissions.get(where.code) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = permissions.get(where.code);
        const next = existing
          ? { ...existing, ...update, updatedAt: now }
          : {
              id: `permission-${permissions.size}`,
              ...create,
              createdAt: now,
              updatedAt: now,
            };
        permissions.set(next.code, next);
        return next;
      },
    },
    rolePermission: {
      upsert: async ({ where, create }: any) => {
        const key = `${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`;
        const next = rolePermissions.get(key) ?? {
          id: `role-permission-${rolePermissions.size}`,
          ...create,
          createdAt: now,
        };
        rolePermissions.set(key, next);
        return next;
      },
    },
    systemSetting: {
      findUnique: async ({ where }: any) => settings.get(where.key) ?? null,
      findMany: async () => [...settings.values()],
      upsert: async ({ where, create, update }: any) => {
        const existing = settings.get(where.key);
        const next = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `setting-${settings.size}`, ...create, createdAt: now, updatedAt: now };
        settings.set(next.key, next);
        return next;
      },
    },
    providerConfig: {
      findUnique: async ({ where }: any) =>
        providers.get(
          `${where.providerType_providerCode.providerType}:${where.providerType_providerCode.providerCode}`,
        ) ?? null,
      findMany: async () => [...providers.values()],
      upsert: async ({ where, create, update }: any) => {
        const key = `${where.providerType_providerCode.providerType}:${where.providerType_providerCode.providerCode}`;
        const existing = providers.get(key);
        const next = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `provider-${providers.size}`, ...create, createdAt: now, updatedAt: now };
        providers.set(key, next);
        return next;
      },
      update: async () => null,
    },
    billingProduct: {
      findUnique: async ({ where }: any) => products.get(where.code) ?? null,
      findMany: async () => [...products.values()],
      upsert: async ({ where, create, update }: any) => {
        const existing = products.get(where.code);
        const next = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `product-${products.size}`, ...create, createdAt: now, updatedAt: now };
        products.set(next.code, next);
        return next;
      },
      update: async ({ where, data }: any) => {
        const existing = products.get(where.code);
        if (!existing) {
          throw new Error(`Missing product ${where.code}`);
        }
        const next = {
          ...existing,
          ...data,
          metadataJson:
            data?.metadataJson === undefined
              ? existing.metadataJson
              : cloneJson(data.metadataJson as JsonValue),
          updatedAt: now,
        };
        products.set(where.code, next);
        return next;
      },
    },
    adminAuditLog: {
      create: async ({ data }: any) => ({ id: "audit", ...data, createdAt: now }),
      findMany: async () => [],
    },
    apiUsageLog: {
      create: async ({ data }: any) => ({ id: "usage", ...data, createdAt: now }),
    },
    location: {
      findUnique: async ({ where }: any) => locations.get(where.slug) ?? null,
      findMany: async () => [...locations.values()],
      create: async ({ data }: any) => {
        const next = { id: `location-${locations.size}`, ...data, createdAt: now, updatedAt: now };
        locations.set(next.slug, next);
        return next;
      },
      update: async () => null,
      delete: async () => null,
      upsert: async ({ where, create, update }: any) => {
        const existing = locations.get(where.slug);
        const next = existing
          ? { ...existing, ...update, updatedAt: now }
          : { id: `location-${locations.size}`, ...create, createdAt: now, updatedAt: now };
        locations.set(next.slug, next);
        return next;
      },
    },
  } satisfies Partial<DatabaseClient>;

  return { client: client as DatabaseClient, state: { products } };
}

describe("billing products", () => {
  it("lists only enabled public full-access products for public pricing", async () => {
    const { client, state } = createProductTestClient();
    state.products.set("quarterly_full", {
      ...state.products.get("quarterly_full"),
      enabled: false,
    });

    const products = await listPublicBillingProducts({ client });

    expect(products.map((product) => product.code)).toEqual(["monthly_full", "yearly_full"]);
    expect(products[0]).toMatchObject({
      code: "monthly_full",
      priceText: "¥19.00",
      durationText: "30 天",
      recommended: false,
    });
    expect(JSON.stringify(products)).not.toContain("trial_7_days");
    expect(JSON.stringify(products)).not.toContain("metadataJson");
    expect(JSON.stringify(products)).not.toContain("grantType");
  });

  it("lets admins update standard public product pricing and writes safe audit logs", async () => {
    const { client, state } = createProductTestClient();

    const product = await updateAdminBillingProduct(
      {
        code: "monthly_full",
        amountCents: 2500,
        description: "运营调整后的月卡文案。",
        publicVisible: true,
        publicPurchasable: true,
        recommended: true,
        badgeText: "热卖",
        featureBullets: ["完整摄影判断", "专业逐小时表格"],
        actorUserId: "admin-user",
      },
      { client },
    );

    expect(product).toMatchObject({
      code: "monthly_full",
      amountCents: 2500,
      description: "运营调整后的月卡文案。",
      publicVisible: true,
      publicPurchasable: true,
      recommended: true,
      badgeText: "热卖",
      featureBullets: ["完整摄影判断", "专业逐小时表格"],
    });
    expect(state.products.get("monthly_full").metadataJson).toMatchObject({
      publicVisible: true,
      publicPurchasable: true,
      recommended: true,
      badgeText: "热卖",
      grantType: "full_forecast_access",
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

  it("keeps registration trial internal and not publicly purchasable", async () => {
    const { client } = createProductTestClient();

    await expect(
      updateAdminBillingProduct(
        { code: "trial_7_days", amountCents: 100, publicPurchasable: true },
        { client },
      ),
    ).rejects.toBeInstanceOf(InvalidBillingProductUpdateError);
  });

  it("seeds missing product metadata without overwriting admin-edited paid prices", async () => {
    const { client, state } = createSeedTestClient();
    state.products.set("monthly_full", {
      ...state.products.get("monthly_full"),
      name: "运营月卡",
      amountCents: 2500,
      metadataJson: {
        public: true,
        grantType: "full_forecast_access",
      },
    });
    state.products.set("trial_7_days", {
      ...state.products.get("trial_7_days"),
      amountCents: 100,
      metadataJson: {
        public: true,
      },
    });

    await seedDatabase(client);

    expect(state.products.get("monthly_full")).toMatchObject({
      name: "运营月卡",
      amountCents: 2500,
      durationDays: 30,
      currency: "CNY",
    });
    expect(state.products.get("monthly_full").metadataJson).toMatchObject({
      publicVisible: true,
      publicPurchasable: true,
      grantType: "full_forecast_access",
      plan: "monthly",
    });
    expect(state.products.get("trial_7_days")).toMatchObject({
      amountCents: 0,
      durationDays: 7,
      currency: "CNY",
    });
    expect(state.products.get("trial_7_days").metadataJson).toMatchObject({
      internal: true,
      public: false,
      publicVisible: false,
      publicPurchasable: false,
      source: "registration_trial",
    });
  });
});
