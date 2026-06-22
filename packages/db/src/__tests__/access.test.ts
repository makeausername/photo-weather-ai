import { describe, expect, it } from "vitest";
import {
  buildAccountAccessStatus,
  checkForecastAccess,
  resolveUserForecastAccess,
} from "../access.js";
import type { DatabaseClient } from "../types.js";

function createAccessFakeClient(): {
  readonly client: DatabaseClient;
  readonly state: { readonly entitlements: any[] };
} {
  const now = new Date("2026-06-21T00:00:00.000Z");
  const users = new Map<string, any>([
    [
      "user-active",
      {
        id: "user-active",
        email: "user@example.com",
        phone: null,
        passwordHash: "hash",
        displayName: "User",
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        profile: null,
        roles: [
          {
            role: {
              id: "role-user",
              code: "user",
              name: "user",
              displayName: "User",
              description: null,
              permissions: [],
            },
          },
        ],
      },
    ],
    [
      "admin-active",
      {
        id: "admin-active",
        email: "admin@example.com",
        phone: null,
        passwordHash: "hash",
        displayName: "Admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        profile: null,
        roles: [
          {
            role: {
              id: "role-admin",
              code: "admin",
              name: "admin",
              displayName: "Admin",
              description: null,
              permissions: [],
            },
          },
        ],
      },
    ],
    [
      "disabled-user",
      {
        id: "disabled-user",
        email: "disabled@example.com",
        phone: null,
        passwordHash: "hash",
        displayName: "Disabled",
        status: "disabled",
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
        profile: null,
        roles: [],
      },
    ],
  ]);
  const entitlements: any[] = [];
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
    user: {
      findUnique: async ({ where }: any) => users.get(where.id) ?? null,
      create: async ({ data }: any) => ({ id: "created", ...data, createdAt: now, updatedAt: now }),
      update: async ({ where, data }: any) => ({ ...users.get(where.id), ...data, updatedAt: now }),
    },
    userEntitlement: {
      create: async ({ data }: any) => {
        const entitlement = {
          id: `entitlement-${entitlements.length}`,
          startsAt: now,
          expiresAt: null,
          grantedAt: now,
          metadataJson: null,
          ...data,
        };
        entitlements.push(entitlement);
        return entitlement;
      },
      findMany: async ({ where }: any = {}) =>
        entitlements.filter(
          (entitlement) =>
            (where?.userId === undefined || entitlement.userId === where.userId) &&
            (where?.type === undefined || entitlement.type === where.type),
        ),
    },
  };
  return { client, state: { entitlements } };
}

function addFullAccessEntitlement(input: {
  readonly state: { readonly entitlements: any[] };
  readonly userId: string;
  readonly productCode: string;
  readonly startsAt?: string;
  readonly expiresAt: string;
}) {
  input.state.entitlements.push({
    id: `entitlement-${input.state.entitlements.length}`,
    userId: input.userId,
    orderId: `order-${input.state.entitlements.length}`,
    type: "full_forecast_access",
    quantity: 1,
    remainingQuantity: null,
    startsAt: new Date(input.startsAt ?? "2026-06-01T00:00:00.000Z"),
    expiresAt: new Date(input.expiresAt),
    grantedAt: new Date(input.startsAt ?? "2026-06-01T00:00:00.000Z"),
    metadataJson: {
      productCode: input.productCode,
    },
  });
}

describe("forecast access resolver", () => {
  it("resolves guest and free users to 24h basic weather only", async () => {
    const { client } = createAccessFakeClient();
    const guest = await resolveUserForecastAccess({ client, now: new Date("2026-06-21T00:00:00.000Z") });
    const free = await resolveUserForecastAccess({
      userId: "user-active",
      client,
      now: new Date("2026-06-21T00:00:00.000Z"),
    });

    expect(guest).toMatchObject({
      tier: "guest",
      hasFullAccess: false,
      maxForecastHours: 24,
      allowedTargets: ["general"],
    });
    expect(free).toMatchObject({
      tier: "free",
      hasFullAccess: false,
      reason: "none",
    });
  });

  it("resolves active and expired trial access correctly", async () => {
    const { client, state } = createAccessFakeClient();
    addFullAccessEntitlement({
      state,
      userId: "user-active",
      productCode: "trial_7_days",
      expiresAt: "2026-06-28T00:00:00.000Z",
    });

    const active = await resolveUserForecastAccess({
      userId: "user-active",
      client,
      now: new Date("2026-06-21T00:00:00.000Z"),
    });
    const expired = await resolveUserForecastAccess({
      userId: "user-active",
      client,
      now: new Date("2026-06-29T00:00:00.000Z"),
    });

    expect(active).toMatchObject({
      tier: "trial",
      hasFullAccess: true,
      reason: "trial_active",
      activeProductCode: "trial_7_days",
    });
    expect(buildAccountAccessStatus(expired, { now: new Date("2026-06-29T00:00:00.000Z") })).toMatchObject({
      tier: "free",
      hasFullAccess: false,
      reason: "expired",
      trialExpired: true,
    });
  });

  it("resolves paid and admin access while disabled users do not inherit entitlements", async () => {
    const { client, state } = createAccessFakeClient();
    addFullAccessEntitlement({
      state,
      userId: "user-active",
      productCode: "monthly_full",
      expiresAt: "2026-07-21T00:00:00.000Z",
    });
    addFullAccessEntitlement({
      state,
      userId: "disabled-user",
      productCode: "yearly_full",
      expiresAt: "2027-06-21T00:00:00.000Z",
    });

    await expect(
      resolveUserForecastAccess({
        userId: "user-active",
        client,
        now: new Date("2026-06-21T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      tier: "monthly",
      hasFullAccess: true,
      reason: "paid_active",
    });
    await expect(
      resolveUserForecastAccess({
        userId: "admin-active",
        client,
        now: new Date("2026-06-21T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      tier: "admin",
      hasFullAccess: true,
      reason: "admin",
    });
    await expect(
      resolveUserForecastAccess({
        userId: "disabled-user",
        client,
        now: new Date("2026-06-21T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      tier: "free",
      hasFullAccess: false,
    });
  });

  it("blocks free future startDateTime and full users beyond the 168h package window", async () => {
    const now = new Date("2026-06-21T00:00:00.000Z");
    const free = {
      userId: "user-active",
      tier: "free",
      hasFullAccess: false,
      maxForecastHours: 24,
      allowedTargets: ["general"],
      canUseAiExplanation: false,
      canViewFullHistory: false,
      reason: "none",
    } as const;
    const full = {
      ...free,
      tier: "monthly",
      hasFullAccess: true,
      maxForecastHours: 168,
      allowedTargets: ["general", "cloud_sea", "glow", "astro"],
      canUseAiExplanation: true,
      canViewFullHistory: true,
      reason: "paid_active",
    } as const;

    expect(
      checkForecastAccess({
        access: free,
        target: "general",
        forecastStart: new Date("2026-06-24T00:00:00.000Z"),
        forecastEnd: new Date("2026-06-25T00:00:00.000Z"),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "future_start_requires_upgrade" });
    expect(
      checkForecastAccess({
        access: free,
        target: "cloud_sea",
        forecastStart: now,
        forecastEnd: new Date("2026-06-22T00:00:00.000Z"),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "target_requires_upgrade" });
    expect(
      checkForecastAccess({
        access: full,
        target: "astro",
        forecastStart: now,
        forecastEnd: new Date("2026-06-29T01:00:00.000Z"),
        now,
      }),
    ).toMatchObject({ allowed: false, reason: "forecast_window_exceeds_plan" });
  });
});
