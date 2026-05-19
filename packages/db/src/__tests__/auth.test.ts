import {
  createOrUpdateSuperAdmin,
  formatCreateAdminResult,
  hasPermission,
  hashPassword,
  safeUser,
  verifyPassword,
} from "../index.js";
import type { DatabaseClient } from "../types.js";
import { describe, expect, it } from "vitest";

function createAdminScriptClient(): {
  readonly client: DatabaseClient;
  readonly state: { readonly users: Map<string, any>; readonly assignments: any[] };
} {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const users = new Map<string, any>();
  const assignments: any[] = [];
  const superAdminRole = {
    id: "role-super-admin",
    code: "super_admin",
    name: "Super administrator",
    description: "Full operator access.",
    createdAt: now,
    updatedAt: now,
  };

  const client: DatabaseClient = {
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id) {
          return users.get(where.id) ?? null;
        }

        return [...users.values()].find((user) => user.email === where.email) ?? null;
      },
      create: async ({ data }: any) => {
        const user = {
          id: `user-${users.size}`,
          phone: null,
          createdAt: now,
          updatedAt: now,
          lastLoginAt: null,
          ...data,
        };
        users.set(user.id, user);
        return user;
      },
      update: async ({ where, data }: any) => {
        const existing = users.get(where.id);
        if (!existing) {
          throw new Error(`Missing user ${where.id}`);
        }

        const next = {
          ...existing,
          ...data,
          updatedAt: now,
        };
        users.set(where.id, next);
        return next;
      },
    },
    role: {
      findUnique: async ({ where }: any) => (where.code === "super_admin" ? superAdminRole : null),
      upsert: async () => superAdminRole,
    },
    userRole: {
      upsert: async ({ create }: any) => {
        assignments.push(create);
        return { id: "user-role", ...create };
      },
    },
    systemSetting: {
      findUnique: async () => null,
      findMany: async () => [],
      upsert: async () => {
        throw new Error("Not used.");
      },
    },
    providerConfig: {
      findUnique: async () => null,
      findMany: async () => [],
      update: async () => {
        throw new Error("Not used.");
      },
      upsert: async () => {
        throw new Error("Not used.");
      },
    },
    adminAuditLog: {
      create: async () => ({ id: "audit" }),
      findMany: async () => [],
    },
    apiUsageLog: {
      create: async () => ({ id: "usage" }),
    },
  };

  return {
    client,
    state: { users, assignments },
  };
}

describe("admin auth helpers", () => {
  it("hashes and verifies passwords without storing plain text", async () => {
    const password = "CorrectHorseBattery99";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("wrong-password", passwordHash)).toBe(false);
  });

  it("serializes users without passwordHash", () => {
    const user = safeUser({
      id: "user-1",
      email: "admin@example.com",
      phone: null,
      passwordHash: "hashed-password",
      displayName: "Admin",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastLoginAt: null,
    });

    expect(user).toMatchObject({
      id: "user-1",
      email: "admin@example.com",
    });
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("checks RBAC permissions", () => {
    expect(hasPermission({ permissions: ["settings.manage"] }, "settings.manage")).toBe(true);
    expect(hasPermission({ permissions: ["settings.manage"] }, "providers.manage")).toBe(false);
  });

  it("create-admin helper creates a super admin and assigns the role", async () => {
    const { client, state } = createAdminScriptClient();

    const result = await createOrUpdateSuperAdmin({
      email: "ADMIN@EXAMPLE.COM",
      password: "CorrectHorseBattery99",
      displayName: "Owner",
      client,
    });

    expect(result).toMatchObject({
      created: true,
      passwordUpdated: true,
      roleAssigned: true,
      user: {
        email: "admin@example.com",
        displayName: "Owner",
      },
    });
    expect([...state.users.values()][0].passwordHash).not.toBe("CorrectHorseBattery99");
    expect(state.assignments).toEqual([
      {
        userId: "user-0",
        roleId: "role-super-admin",
      },
    ]);
  });

  it("create-admin output does not print the password", async () => {
    const { client } = createAdminScriptClient();
    const password = "CorrectHorseBattery99";
    const result = await createOrUpdateSuperAdmin({
      email: "admin@example.com",
      password,
      client,
    });

    expect(formatCreateAdminResult(result).join("\n")).not.toContain(password);
  });
});
