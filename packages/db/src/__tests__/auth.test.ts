import {
  createOrUpdateAdmin,
  createOrUpdateSuperAdmin,
  createPublicUserAccount,
  DuplicateUserEmailError,
  DuplicateUserPhoneError,
  formatCreateAdminResult,
  getUserAuthContextByIdentifier,
  hasPermission,
  hashPassword,
  hashUserPassword,
  MissingUserIdentifierError,
  readCreateAdminEnv,
  readVerifyAdminEnv,
  safeUser,
  verifyAdminBootstrap,
  verifySuperAdmin,
  verifyPassword,
} from "../index.js";
import type { DatabaseClient } from "../types.js";
import { describe, expect, it } from "vitest";

function createAdminScriptClient(): {
  readonly client: DatabaseClient;
  readonly state: {
    readonly users: Map<string, any>;
    readonly roles: Map<string, any>;
    readonly permissions: Map<string, any>;
    readonly userRoles: Map<string, any>;
    readonly rolePermissions: Map<string, any>;
    readonly transactions: { count: number };
  };
} {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const users = new Map<string, any>();
  const roles = new Map<string, any>();
  const permissions = new Map<string, any>();
  const userRoles = new Map<string, any>();
  const rolePermissions = new Map<string, any>();
  const transactions = { count: 0 };

  function roleWithPermissions(role: any) {
    if (!role) {
      return null;
    }

    return {
      ...role,
      permissions: [...rolePermissions.values()]
        .filter((rolePermission) => rolePermission.roleId === role.id)
        .map((rolePermission) => ({
          permission: [...permissions.values()].find(
            (permission) => permission.id === rolePermission.permissionId,
          ),
        })),
    };
  }

  function userWithRoles(user: any) {
    return {
      ...user,
      roles: [...userRoles.values()]
        .filter((userRole) => userRole.userId === user.id)
        .map((userRole) => ({
          role: roleWithPermissions(
            [...roles.values()].find((role) => role.id === userRole.roleId),
          ),
        })),
    };
  }

  const client: DatabaseClient = {
    $transaction: async (operation) => {
      transactions.count += 1;
      return operation(client);
    },
    $queryRawUnsafe: async <TResult = unknown>() => {
      if ([...roles.values()].some((role) => role.code === "admin")) {
        return [] as unknown as TResult;
      }

      return [...roles.values()]
        .filter((role) => !String(role.code ?? "").trim())
        .filter((role) =>
          ["admin", "administrator", "管理员", "超级管理员"].includes(
            String(role.name ?? "")
              .trim()
              .toLowerCase(),
          ),
        )
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .slice(0, 1)
        .map((role) => ({ id: role.id })) as unknown as TResult;
    },
    $executeRawUnsafe: async (_query, ...values) => {
      const [code, name, description, roleId] = values;
      const role = [...roles.values()].find((candidate) => candidate.id === roleId);
      if (!role) {
        return 0;
      }

      roles.delete(role.code);
      roles.set(String(code), {
        ...role,
        code,
        name,
        description: role.description ?? description,
        updatedAt: now,
      });
      return 1;
    },
    user: {
      findUnique: async ({ where }: any) => {
        const user =
          where.id !== undefined
            ? users.get(where.id)
            : where.email !== undefined
              ? [...users.values()].find((candidate) => candidate.email === where.email)
              : [...users.values()].find((candidate) => candidate.phone === where.phone);
        return user ? userWithRoles(user) : null;
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
      findUnique: async ({ where }: any) => roles.get(where.code) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const existing = roles.get(where.code);
        if (existing) {
          const next = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          roles.set(where.code, next);
          return next;
        }

        const role = {
          id: `role-${roles.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        roles.set(role.code, role);
        return role;
      },
    },
    userRole: {
      upsert: async ({ create }: any) => {
        const key = `${create.userId}:${create.roleId}`;
        const existing = userRoles.get(key);
        if (existing) {
          return existing;
        }

        const userRole = {
          id: `user-role-${userRoles.size}`,
          ...create,
        };
        userRoles.set(key, userRole);
        return userRole;
      },
    },
    permission: {
      findUnique: async ({ where }: any) => permissions.get(where.code) ?? null,
      findMany: async () => [...permissions.values()],
      upsert: async ({ where, create, update }: any) => {
        const existing = permissions.get(where.code);
        if (existing) {
          const next = {
            ...existing,
            ...update,
            updatedAt: now,
          };
          permissions.set(where.code, next);
          return next;
        }

        const permission = {
          id: `permission-${permissions.size}`,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        permissions.set(permission.code, permission);
        return permission;
      },
    },
    rolePermission: {
      findMany: async () => [...rolePermissions.values()],
      upsert: async ({ create }: any) => {
        const key = `${create.roleId}:${create.permissionId}`;
        const existing = rolePermissions.get(key);
        if (existing) {
          return existing;
        }

        const rolePermission = {
          id: `role-permission-${rolePermissions.size}`,
          ...create,
        };
        rolePermissions.set(key, rolePermission);
        return rolePermission;
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
    state: { users, roles, permissions, userRoles, rolePermissions, transactions },
  };
}

function seedPublicUserRole(state: ReturnType<typeof createAdminScriptClient>["state"]): void {
  const now = new Date("2026-01-01T00:00:00.000Z");
  state.roles.set("user", {
    id: "role-user",
    code: "user",
    name: "user",
    description: "Public user",
    createdAt: now,
    updatedAt: now,
  });
}

describe("admin auth helpers", () => {
  it("hashes and verifies passwords without storing plain text", async () => {
    const password = "CorrectHorseBattery99!";
    const passwordHash = await hashPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("wrong-password", passwordHash)).toBe(false);
  });

  it("hashes public user passwords with the shorter public minimum", async () => {
    const password = "public88";
    const passwordHash = await hashUserPassword(password);

    expect(passwordHash).not.toBe(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
  });

  it("creates public users with email only", async () => {
    const { client, state } = createAdminScriptClient();
    seedPublicUserRole(state);

    const principal = await createPublicUserAccount(
      {
        email: "Photo@Example.com",
        password: "public88",
        displayName: "Photo User",
      },
      { client },
    );

    expect(principal.user).toMatchObject({
      email: "photo@example.com",
      phone: null,
      displayName: "Photo User",
      status: "active",
    });
    expect([...state.users.values()][0].passwordHash).not.toBe("public88");
  });

  it("creates public users with phone only", async () => {
    const { client, state } = createAdminScriptClient();
    seedPublicUserRole(state);

    const principal = await createPublicUserAccount(
      {
        phone: "+86 138-0013-8000",
        password: "public88",
      },
      { client },
    );

    expect(principal.user).toMatchObject({
      email: null,
      phone: "13800138000",
      status: "active",
    });
  });

  it("rejects public users without email and phone", async () => {
    const { client, state } = createAdminScriptClient();
    seedPublicUserRole(state);

    await expect(
      createPublicUserAccount(
        {
          password: "public88",
        },
        { client },
      ),
    ).rejects.toBeInstanceOf(MissingUserIdentifierError);
  });

  it("rejects duplicate public email and phone values", async () => {
    const { client, state } = createAdminScriptClient();
    seedPublicUserRole(state);
    await createPublicUserAccount(
      {
        email: "user@example.com",
        phone: "13800138000",
        password: "public88",
      },
      { client },
    );

    await expect(
      createPublicUserAccount(
        {
          email: "USER@example.com",
          password: "public88",
        },
        { client },
      ),
    ).rejects.toBeInstanceOf(DuplicateUserEmailError);

    await expect(
      createPublicUserAccount(
        {
          phone: "13800138000",
          password: "public88",
        },
        { client },
      ),
    ).rejects.toBeInstanceOf(DuplicateUserPhoneError);
  });

  it("looks up login context by email or phone identifier", async () => {
    const { client, state } = createAdminScriptClient();
    seedPublicUserRole(state);
    await createPublicUserAccount(
      {
        email: "lookup@example.com",
        phone: "13800138000",
        password: "public88",
      },
      { client },
    );

    await expect(
      getUserAuthContextByIdentifier("LOOKUP@example.com", { client }),
    ).resolves.toMatchObject({
      user: {
        email: "lookup@example.com",
      },
    });
    await expect(
      getUserAuthContextByIdentifier("+86 13800138000", { client }),
    ).resolves.toMatchObject({
      user: {
        phone: "13800138000",
      },
    });
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

  it("keeps legacy super-admin helper names as bootstrap aliases", () => {
    expect(createOrUpdateSuperAdmin).toBe(createOrUpdateAdmin);
    expect(verifySuperAdmin).toBe(verifyAdminBootstrap);
  });

  it("bootstrap helper creates an admin role with code and assigns permissions", async () => {
    const { client, state } = createAdminScriptClient();

    const result = await createOrUpdateAdmin({
      email: "ADMIN@EXAMPLE.COM",
      password: "CorrectHorseBattery99!",
      displayName: "Owner",
      client,
    });

    expect(result).toMatchObject({
      created: true,
      passwordUpdated: true,
      roleAssigned: true,
      roleCode: "admin",
      user: {
        email: "admin@example.com",
        displayName: "Owner",
      },
    });
    expect([...state.users.values()][0].passwordHash).not.toBe("CorrectHorseBattery99!");
    expect(state.roles.get("admin")).toMatchObject({
      code: "admin",
      name: "admin",
      description: "Administrator",
    });
    expect(state.userRoles.size).toBe(1);
    expect([...state.userRoles.values()][0]).toMatchObject({
      userId: "user-0",
      roleId: state.roles.get("admin")?.id,
    });
    expect(state.rolePermissions.size).toBe(state.permissions.size);
    expect(state.transactions.count).toBe(1);
  });

  it("create-admin output does not print the password", async () => {
    const { client } = createAdminScriptClient();
    const password = "CorrectHorseBattery99!";
    const result = await createOrUpdateAdmin({
      email: "admin@example.com",
      password,
      client,
    });

    expect(formatCreateAdminResult(result).join("\n")).not.toContain(password);
    expect(formatCreateAdminResult(result).join("\n")).not.toContain(
      Buffer.from(password, "utf8").toString("base64"),
    );
  });

  it("bootstrap repairs an existing admin user that has no role", async () => {
    const { client, state } = createAdminScriptClient();
    state.users.set("existing-admin", {
      id: "existing-admin",
      email: "admin@example.com",
      phone: null,
      passwordHash: await hashPassword("CorrectHorseBattery99!"),
      displayName: "Existing Admin",
      status: "active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastLoginAt: null,
    });

    const result = await createOrUpdateAdmin({
      email: "admin@example.com",
      client,
    });

    expect(result).toMatchObject({
      created: false,
      passwordUpdated: false,
      roleAssigned: true,
      roleCode: "admin",
    });
    expect(state.userRoles.size).toBe(1);
    await expect(
      verifyAdminBootstrap({ email: "admin@example.com", client }),
    ).resolves.toMatchObject({
      roles: ["admin"],
    });
  });

  it("bootstrap repairs an existing admin role without a user binding", async () => {
    const { client, state } = createAdminScriptClient();
    const now = new Date("2026-01-01T00:00:00.000Z");
    state.roles.set("admin", {
      id: "role-existing-admin",
      code: "admin",
      name: "legacy admin",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    state.users.set("existing-admin", {
      id: "existing-admin",
      email: "admin@example.com",
      phone: null,
      passwordHash: await hashPassword("CorrectHorseBattery99!"),
      displayName: "Existing Admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    });

    await createOrUpdateAdmin({
      email: "admin@example.com",
      client,
    });

    expect(state.roles.get("admin")).toMatchObject({
      code: "admin",
      name: "admin",
      description: "Administrator",
    });
    expect([...state.userRoles.values()]).toEqual([
      expect.objectContaining({
        userId: "existing-admin",
        roleId: "role-existing-admin",
      }),
    ]);
  });

  it("bootstrap repairs a legacy admin role with a blank code when safe", async () => {
    const { client, state } = createAdminScriptClient();
    const now = new Date("2026-01-01T00:00:00.000Z");
    state.roles.set("", {
      id: "role-legacy-admin",
      code: "",
      name: "Administrator",
      description: null,
      createdAt: now,
      updatedAt: now,
    });

    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });

    expect(state.roles.get("admin")).toMatchObject({
      id: "role-legacy-admin",
      code: "admin",
      name: "admin",
    });
    expect(state.roles.has("")).toBe(false);
    expect([...state.userRoles.values()]).toEqual([
      expect.objectContaining({
        roleId: "role-legacy-admin",
      }),
    ]);
  });

  it("bootstrap is idempotent and does not duplicate roles or bindings", async () => {
    const { client, state } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });

    const user = [...state.users.values()][0];
    const originalPasswordHash = user.passwordHash;
    const before = {
      users: state.users.size,
      roles: state.roles.size,
      permissions: state.permissions.size,
      userRoles: state.userRoles.size,
      rolePermissions: state.rolePermissions.size,
    };

    const result = await createOrUpdateAdmin({
      email: "admin@example.com",
      client,
    });

    expect(result.passwordUpdated).toBe(false);
    expect([...state.users.values()][0].passwordHash).toBe(originalPasswordHash);
    expect({
      users: state.users.size,
      roles: state.roles.size,
      permissions: state.permissions.size,
      userRoles: state.userRoles.size,
      rolePermissions: state.rolePermissions.size,
    }).toEqual(before);
  });

  it("reads base64 admin initial passwords before legacy raw password env vars", () => {
    const encodedPassword = Buffer.from("CorrectHorseBattery99!", "utf8").toString("base64");

    expect(
      readCreateAdminEnv({
        ADMIN_EMAIL: "ADMIN@EXAMPLE.COM",
        ADMIN_INITIAL_PASSWORD_B64: encodedPassword,
        ADMIN_PASSWORD: "WrongHorseBattery99!",
        ADMIN_DISPLAY_NAME: "Owner",
      }),
    ).toMatchObject({
      email: "ADMIN@EXAMPLE.COM",
      password: "CorrectHorseBattery99!",
      displayName: "Owner",
    });

    expect(
      readVerifyAdminEnv({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_INITIAL_PASSWORD_B64: encodedPassword,
      }),
    ).toMatchObject({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
    });
  });

  it("keeps legacy raw admin password env vars compatible", () => {
    expect(
      readCreateAdminEnv({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_INITIAL_PASSWORD: "LegacyHorseBattery99!",
      }),
    ).toMatchObject({
      password: "LegacyHorseBattery99!",
    });

    expect(
      readVerifyAdminEnv({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "LegacyHorseBattery99!",
      }),
    ).toMatchObject({
      password: "LegacyHorseBattery99!",
    });

    expect(
      readCreateAdminEnv({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_INITIAL_PASSWORD: "InitialHorseBattery99!",
        ADMIN_PASSWORD: "WrongHorseBattery99!",
      }),
    ).toMatchObject({
      password: "InitialHorseBattery99!",
    });
  });

  it("keeps legacy super-admin and initial-admin env aliases compatible", () => {
    const encodedPassword = Buffer.from("AliasHorseBattery99!", "utf8").toString("base64");

    expect(
      readCreateAdminEnv({
        SUPER_ADMIN_EMAIL: "OWNER@EXAMPLE.COM",
        ADMIN_PASSWORD_B64: encodedPassword,
        ADMIN_NAME: "Owner",
      }),
    ).toMatchObject({
      email: "OWNER@EXAMPLE.COM",
      password: "AliasHorseBattery99!",
      displayName: "Owner",
    });

    expect(
      readVerifyAdminEnv({
        SUPER_ADMIN_EMAIL: "owner@example.com",
        INITIAL_ADMIN_PASSWORD: "AliasHorseBattery99!",
      }),
    ).toMatchObject({
      email: "owner@example.com",
      password: "AliasHorseBattery99!",
    });
  });

  it("create-admin updates an existing admin password and keeps the login verifier compatible", async () => {
    const { client, state } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      displayName: "Owner",
      client,
    });

    const result = await createOrUpdateAdmin({
      email: "ADMIN@EXAMPLE.COM",
      password: "UpdatedHorseBattery99!",
      displayName: "Operator",
      client,
    });

    const user = [...state.users.values()][0];
    expect(result).toMatchObject({
      created: false,
      passwordUpdated: true,
      user: {
        email: "admin@example.com",
        displayName: "Operator",
        status: "active",
      },
    });
    expect(await verifyPassword("CorrectHorseBattery99!", user.passwordHash)).toBe(false);
    expect(await verifyPassword("UpdatedHorseBattery99!", user.passwordHash)).toBe(true);
  });

  it("create-admin re-enables an existing disabled admin account", async () => {
    const { client, state } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });
    const user = [...state.users.values()][0];
    state.users.set(user.id, {
      ...user,
      status: "disabled",
    });

    const result = await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "UpdatedHorseBattery99!",
      client,
    });

    expect(result).toMatchObject({
      activated: true,
      user: {
        status: "active",
      },
    });
  });

  it("verify-admin succeeds with the correct password", async () => {
    const { client } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });

    await expect(
      verifyAdminBootstrap({
        email: "admin@example.com",
        password: "CorrectHorseBattery99!",
        client,
      }),
    ).resolves.toMatchObject({
      user: {
        email: "admin@example.com",
      },
      roles: ["admin"],
      permissions: expect.arrayContaining(["admin.manage"]),
      passwordChecked: true,
    });
  });

  it("verify-admin fails with the wrong password", async () => {
    const { client } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });

    await expect(
      verifyAdminBootstrap({
        email: "admin@example.com",
        password: "WrongHorseBattery99!",
        client,
      }),
    ).rejects.toThrow("管理员密码校验失败");
  });

  it("verify-admin fails when the admin role is missing", async () => {
    const { client, state } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });
    state.userRoles.clear();

    await expect(
      verifyAdminBootstrap({
        email: "admin@example.com",
        password: "CorrectHorseBattery99!",
        client,
      }),
    ).rejects.toThrow("管理员角色缺失");
  });

  it("verify-admin fails when permission bindings are missing", async () => {
    const { client, state } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });
    state.rolePermissions.clear();

    await expect(
      verifyAdminBootstrap({
        email: "admin@example.com",
        password: "CorrectHorseBattery99!",
        client,
      }),
    ).rejects.toThrow("管理员权限绑定缺失");
  });

  it("verify-admin fails when one required permission binding is missing", async () => {
    const { client, state } = createAdminScriptClient();
    await createOrUpdateAdmin({
      email: "admin@example.com",
      password: "CorrectHorseBattery99!",
      client,
    });
    const providersPermission = state.permissions.get("providers.manage");
    const missingBinding = [...state.rolePermissions.entries()].find(
      ([, rolePermission]) => rolePermission.permissionId === providersPermission?.id,
    );
    if (!missingBinding) {
      throw new Error("Expected providers.manage binding to exist.");
    }
    state.rolePermissions.delete(missingBinding[0]);

    await expect(
      verifyAdminBootstrap({
        email: "admin@example.com",
        password: "CorrectHorseBattery99!",
        client,
      }),
    ).rejects.toThrow("管理员权限绑定缺失");
  });
});
