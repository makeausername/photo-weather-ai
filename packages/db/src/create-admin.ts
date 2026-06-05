import { createInterface } from "node:readline/promises";

import { disconnectPrismaClient, getPrismaClient } from "./client.js";
import { buildSeedData } from "./seed-data.js";
import { getUserAuthContextByEmail, requiredAdminPermissions, safeUser } from "./auth.js";
import {
  hashPassword,
  validateAdminPassword,
  verifyPassword,
} from "./passwords.js";
import type { DatabaseClient, SafeUser } from "./types.js";

export type CreateAdminInput = {
  readonly email: string;
  readonly password?: string;
  readonly displayName?: string | null;
  readonly client?: DatabaseClient;
};

export type CreateAdminResult = {
  readonly user: SafeUser;
  readonly created: boolean;
  readonly passwordUpdated: boolean;
  readonly roleAssigned: boolean;
  readonly roleCode: "admin";
  readonly permissionsAssigned: number;
  readonly permissionWarning?: string;
  readonly activated: boolean;
};

export type VerifyAdminInput = {
  readonly email: string;
  readonly password?: string;
  readonly client?: DatabaseClient;
};

export type VerifyAdminResult = {
  readonly user: SafeUser;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly passwordChecked: boolean;
};

export type CreateAdminEnv = {
  readonly [key: string]: string | undefined;
  readonly ADMIN_EMAIL?: string;
  readonly SUPER_ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_PASSWORD_B64?: string;
  readonly ADMIN_INITIAL_PASSWORD?: string;
  readonly ADMIN_INITIAL_PASSWORD_B64?: string;
  readonly INITIAL_ADMIN_PASSWORD?: string;
  readonly INITIAL_ADMIN_PASSWORD_B64?: string;
  readonly SUPER_ADMIN_PASSWORD?: string;
  readonly SUPER_ADMIN_PASSWORD_B64?: string;
  readonly ADMIN_DISPLAY_NAME?: string;
  readonly ADMIN_NAME?: string;
  readonly SUPER_ADMIN_DISPLAY_NAME?: string;
};

export type VerifyAdminEnv = {
  readonly [key: string]: string | undefined;
  readonly ADMIN_EMAIL?: string;
  readonly SUPER_ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_PASSWORD_B64?: string;
  readonly ADMIN_INITIAL_PASSWORD?: string;
  readonly ADMIN_INITIAL_PASSWORD_B64?: string;
  readonly INITIAL_ADMIN_PASSWORD?: string;
  readonly INITIAL_ADMIN_PASSWORD_B64?: string;
  readonly SUPER_ADMIN_PASSWORD?: string;
  readonly SUPER_ADMIN_PASSWORD_B64?: string;
};

export type AdminVerificationErrorCode =
  | "admin_not_found"
  | "admin_role_missing"
  | "admin_permissions_missing"
  | "admin_password_failed"
  | "admin_disabled";

export class AdminVerificationError extends Error {
  constructor(readonly code: AdminVerificationErrorCode) {
    super(adminVerificationMessages[code]);
  }
}

const adminVerificationMessages: Record<AdminVerificationErrorCode, string> = {
  admin_not_found: "管理员账号不存在",
  admin_role_missing: "管理员角色缺失",
  admin_permissions_missing: "管理员权限绑定缺失",
  admin_password_failed: "管理员密码校验失败",
  admin_disabled: "管理员账号未启用",
};

const adminEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const adminRoleCode = "admin";
const legacySuperAdminRoleCode = "super_admin";
const adminRoleCodes = new Set([adminRoleCode, adminRoleCode.toUpperCase(), legacySuperAdminRoleCode]);
const adminRoleName = "admin";
const adminRoleDescription = "Administrator";
const adminEmailEnvKeys = ["ADMIN_EMAIL", "SUPER_ADMIN_EMAIL"] as const;
const adminDisplayNameEnvKeys = [
  "ADMIN_DISPLAY_NAME",
  "ADMIN_NAME",
  "SUPER_ADMIN_DISPLAY_NAME",
] as const;
const adminPasswordB64EnvKeys = [
  "ADMIN_INITIAL_PASSWORD_B64",
  "ADMIN_PASSWORD_B64",
  "INITIAL_ADMIN_PASSWORD_B64",
  "SUPER_ADMIN_PASSWORD_B64",
] as const;
const adminPasswordEnvKeys = [
  "ADMIN_INITIAL_PASSWORD",
  "ADMIN_PASSWORD",
  "INITIAL_ADMIN_PASSWORD",
  "SUPER_ADMIN_PASSWORD",
] as const;

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

async function runInTransaction<TResult>(
  client: DatabaseClient,
  operation: (transactionClient: DatabaseClient) => Promise<TResult>,
): Promise<TResult> {
  if (client.$transaction) {
    return client.$transaction((transactionClient) => operation(transactionClient));
  }

  return operation(client);
}

function requireDelegate<TDelegate>(
  client: DatabaseClient,
  key: keyof DatabaseClient,
  label: string,
): TDelegate {
  const delegate = client[key];
  if (!delegate) {
    throw new Error(`Database client is missing the ${label} delegate.`);
  }

  return delegate as TDelegate;
}

function firstEnvValue(
  source: CreateAdminEnv | VerifyAdminEnv,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = source[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeAdminEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (!adminEmailPattern.test(normalizedEmail)) {
    throw new Error("ADMIN_EMAIL 不是有效邮箱地址。");
  }

  return normalizedEmail;
}

function normalizeDisplayName(displayName: string | null | undefined): string | undefined {
  const normalized = displayName?.trim();
  return normalized || undefined;
}

function assertAdminPassword(password: string): void {
  validateAdminPassword(password);
}

function decodeAdminInitialPasswordB64(encodedPassword: string): string {
  const normalized = encodedPassword.trim();
  const compact = normalized.replace(/=+$/, "");
  if (
    !normalized ||
    normalized.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error("ADMIN_INITIAL_PASSWORD_B64 不是有效的 base64 编码。");
  }

  const decodedPassword = Buffer.from(normalized, "base64").toString("utf8");
  const encodedAgain = Buffer.from(decodedPassword, "utf8").toString("base64").replace(/=+$/, "");
  if (encodedAgain !== compact) {
    throw new Error("ADMIN_INITIAL_PASSWORD_B64 不是有效的 base64 编码。");
  }

  return decodedPassword;
}

function resolveAdminPassword(source: CreateAdminEnv | VerifyAdminEnv): string | undefined {
  const encodedPassword = firstEnvValue(source, adminPasswordB64EnvKeys);
  if (encodedPassword) {
    return decodeAdminInitialPasswordB64(encodedPassword);
  }

  return firstEnvValue(source, adminPasswordEnvKeys);
}

function hasCompleteAdminEnv(source: CreateAdminEnv): boolean {
  return Boolean(firstEnvValue(source, adminEmailEnvKeys)) && Boolean(resolveAdminPassword(source));
}

function isInteractiveTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function promptLine(label: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = await rl.question(`${label}${suffix}: `);
    return (answer || defaultValue || "").trim();
  } finally {
    rl.close();
  }
}

async function promptHidden(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error("当前终端不支持隐藏输入。");
  }

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    let value = "";
    const wasRaw = stdin.isRaw;

    function cleanup(): void {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    }

    function onData(chunk: Buffer): void {
      const text = chunk.toString("utf8");
      for (const char of text) {
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("已取消。"));
          return;
        }

        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
          return;
        }

        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        value += char;
      }
    }

    process.stdout.write(`${label}: `);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

export function readCreateAdminEnv(source: CreateAdminEnv = process.env): CreateAdminInput {
  const email = firstEnvValue(source, adminEmailEnvKeys);
  const password = resolveAdminPassword(source) ?? "";

  if (!email || !password) {
    throw new Error(
      "缺少 ADMIN_EMAIL 以及 ADMIN_INITIAL_PASSWORD_B64、ADMIN_INITIAL_PASSWORD 或 ADMIN_PASSWORD，无法在非交互环境创建管理员。",
    );
  }

  return {
    email,
    password,
    displayName: normalizeDisplayName(firstEnvValue(source, adminDisplayNameEnvKeys)),
  };
}

export async function readCreateAdminInput(
  source: CreateAdminEnv = process.env,
): Promise<CreateAdminInput> {
  if (hasCompleteAdminEnv(source)) {
    return readCreateAdminEnv(source);
  }

  if (!isInteractiveTty()) {
    throw new Error(
      "缺少 ADMIN_EMAIL 以及 ADMIN_INITIAL_PASSWORD_B64、ADMIN_INITIAL_PASSWORD 或 ADMIN_PASSWORD，无法在非交互环境创建管理员。",
    );
  }

  let email = "";
  while (!email) {
    email = await promptLine("请输入管理员邮箱", firstEnvValue(source, adminEmailEnvKeys));
    if (!email) {
      console.error("管理员邮箱不能为空。");
    }
  }

  let password = "";
  while (!password) {
    password = await promptHidden("请输入管理员密码");
    const repeatedPassword = await promptHidden("请再次输入管理员密码");
    if (!password) {
      console.error("管理员密码不能为空。");
      continue;
    }
    if (password !== repeatedPassword) {
      console.error("两次输入的管理员密码不一致，请重新输入。");
      password = "";
      continue;
    }

    const displayName = await promptLine(
      "请输入管理员显示名称",
      firstEnvValue(source, adminDisplayNameEnvKeys) || "Super Admin",
    );
    return { email, password, displayName };
  }

  throw new Error("管理员密码不能为空。");
}

type PermissionBindingResult = {
  readonly role: any;
  readonly permissionsAssigned: number;
  readonly warning?: string;
};

async function listPermissions(client: DatabaseClient): Promise<any[]> {
  if (!client.permission) {
    return [];
  }

  if (client.permission.findMany) {
    return client.permission.findMany();
  }

  const seedData = buildSeedData();
  const permissions: any[] = [];
  for (const permission of seedData.permissions) {
    permissions.push(
      await client.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {
          name: permission.name,
          description: permission.description,
        },
      }),
    );
  }

  return permissions;
}

async function ensureSeedPermissions(client: DatabaseClient): Promise<void> {
  if (!client.permission) {
    return;
  }

  const seedData = buildSeedData();
  for (const permission of seedData.permissions) {
    await client.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: {
        name: permission.name,
        description: permission.description,
      },
    });
  }
}

type LegacyAdminRoleRow = {
  readonly id: string;
};

async function repairLegacyAdminRoleWithoutCode(client: DatabaseClient): Promise<void> {
  if (!client.$queryRawUnsafe || !client.$executeRawUnsafe) {
    return;
  }

  const rows = await client.$queryRawUnsafe<LegacyAdminRoleRow[]>(
    `SELECT id
       FROM "roles"
      WHERE NULLIF(BTRIM(COALESCE("code", '')), '') IS NULL
        AND LOWER(BTRIM("name")) IN ('admin', 'administrator', '管理员', '超级管理员')
        AND NOT EXISTS (
          SELECT 1 FROM "roles" WHERE LOWER(BTRIM("code")) = 'admin'
        )
      ORDER BY "created_at" ASC
      LIMIT 1`,
  );
  const roleId = rows[0]?.id;
  if (!roleId) {
    return;
  }

  await client.$executeRawUnsafe(
    `UPDATE "roles"
        SET "code" = $1,
            "name" = $2,
            "description" = COALESCE("description", $3),
            "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = $4`,
    adminRoleCode,
    adminRoleName,
    adminRoleDescription,
    roleId,
  );
}

async function ensureAdminRole(client: DatabaseClient): Promise<PermissionBindingResult> {
  const roleDelegate = requireDelegate<NonNullable<DatabaseClient["role"]>>(client, "role", "role");

  await repairLegacyAdminRoleWithoutCode(client);

  const role = await roleDelegate.upsert({
    where: { code: adminRoleCode },
    create: {
      code: adminRoleCode,
      name: adminRoleName,
      description: adminRoleDescription,
    },
    update: {
      name: adminRoleName,
      description: adminRoleDescription,
    },
  });

  if (!client.permission || !client.rolePermission) {
    return {
      role,
      permissionsAssigned: 0,
      warning: "Permission tables are not available; admin role was assigned without permission bindings.",
    };
  }

  await ensureSeedPermissions(client);
  const permissions = await listPermissions(client);
  if (permissions.length === 0) {
    return {
      role,
      permissionsAssigned: 0,
      warning: "Permission tables are empty; admin role was assigned without permission bindings.",
    };
  }

  for (const permission of permissions) {
    await client.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }

  return {
    role,
    permissionsAssigned: permissions.length,
  };
}

function extractRoleCodes(user: any): readonly string[] {
  const roleCodes = new Set<string>();

  for (const roleCode of user?.roleCodes ?? []) {
    if (typeof roleCode === "string") {
      roleCodes.add(roleCode);
    }
  }

  for (const userRole of user?.roles ?? []) {
    const role = userRole?.role ?? userRole;
    for (const value of [role?.code, role?.name]) {
      if (typeof value === "string") {
        roleCodes.add(value);
      }
    }
  }

  return [...roleCodes].sort();
}

function extractPermissionCodes(user: any): readonly string[] {
  const permissionCodes = new Set<string>();

  for (const userRole of user?.roles ?? []) {
    const role = userRole?.role ?? userRole;
    for (const rolePermission of role?.permissions ?? []) {
      const permissionCode = rolePermission?.permission?.code ?? rolePermission?.code;
      if (typeof permissionCode === "string") {
        permissionCodes.add(permissionCode);
      }
    }
  }

  return [...permissionCodes].sort();
}

async function findAdminUserByEmail(client: DatabaseClient, email: string): Promise<any | null> {
  const userDelegate = requireDelegate<NonNullable<DatabaseClient["user"]>>(client, "user", "user");
  return userDelegate.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function createOrUpdateAdmin(input: CreateAdminInput): Promise<CreateAdminResult> {
  const email = normalizeAdminEmail(input.email);
  if (input.password !== undefined) {
    assertAdminPassword(input.password);
  }

  const displayName = normalizeDisplayName(input.displayName);
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const client = await resolveClient(input.client);

  return runInTransaction(client, async (transactionClient) => {
    const userDelegate = requireDelegate<NonNullable<DatabaseClient["user"]>>(
      transactionClient,
      "user",
      "user",
    );
    const userRoleDelegate = requireDelegate<NonNullable<DatabaseClient["userRole"]>>(
      transactionClient,
      "userRole",
      "userRole",
    );

    const adminRole = await ensureAdminRole(transactionClient);
    const existingUser = await findAdminUserByEmail(transactionClient, email);

    let user = existingUser;
    let created = false;
    let activated = false;

    if (!existingUser) {
      if (!passwordHash) {
        throw new Error("管理员账号不存在，必须提供初始密码才能创建。");
      }

      user = await userDelegate.create({
        data: {
          email,
          passwordHash,
          displayName: displayName ?? "Admin",
          status: "active",
        },
      });
      created = true;
      activated = true;
    } else {
      activated = existingUser.status !== "active";
      user = await userDelegate.update({
        where: { id: existingUser.id },
        data: {
          ...(passwordHash ? { passwordHash } : {}),
          ...(displayName ? { displayName } : {}),
          status: "active",
        },
      });
    }

    await userRoleDelegate.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: adminRole.role.id,
        },
      },
      create: {
        userId: user.id,
        roleId: adminRole.role.id,
      },
      update: {},
    });

    return {
      user: safeUser(user),
      created,
      passwordUpdated: Boolean(passwordHash),
      roleAssigned: true,
      roleCode: adminRoleCode,
      permissionsAssigned: adminRole.permissionsAssigned,
      ...(adminRole.warning ? { permissionWarning: adminRole.warning } : {}),
      activated,
    };
  });
}

export const createOrUpdateSuperAdmin = createOrUpdateAdmin;

export function formatCreateAdminResult(result: CreateAdminResult): readonly string[] {
  return [
    `管理员账号已创建或更新：${result.user.email}`,
    `管理员角色：${result.roleCode}`,
    `管理员权限绑定数：${result.permissionsAssigned}`,
    ...(result.permissionWarning ? [`WARNING ${result.permissionWarning}`] : []),
  ];
}

export async function runCreateAdminFromEnv(
  source: CreateAdminEnv = process.env,
): Promise<CreateAdminResult> {
  return createOrUpdateAdmin(readCreateAdminEnv(source));
}

export function readVerifyAdminEnv(source: VerifyAdminEnv = process.env): VerifyAdminInput {
  const email = firstEnvValue(source, adminEmailEnvKeys);
  if (!email) {
    throw new Error("缺少 ADMIN_EMAIL，无法验证管理员账号。");
  }

  return {
    email,
    password: resolveAdminPassword(source),
  };
}

function isAdminRoleValue(value: string): boolean {
  return adminRoleCodes.has(value.trim()) || adminRoleCodes.has(value.trim().toLowerCase());
}

async function listAvailablePermissionCodes(client: DatabaseClient): Promise<readonly string[]> {
  if (!client.permission?.findMany) {
    return [];
  }

  const records = await client.permission.findMany();
  return records
    .map((record: any) => (typeof record?.code === "string" ? record.code : ""))
    .filter((code: string) => code.length > 0)
    .sort();
}

export async function verifyAdminBootstrap(input: VerifyAdminInput): Promise<VerifyAdminResult> {
  const email = normalizeAdminEmail(input.email);
  const client = await resolveClient(input.client);
  const user = await findAdminUserByEmail(client, email);
  const roleDelegate = requireDelegate<NonNullable<DatabaseClient["role"]>>(client, "role", "role");

  if (!user) {
    throw new AdminVerificationError("admin_not_found");
  }

  if (user.status !== "active") {
    throw new AdminVerificationError("admin_disabled");
  }

  const authContext = await getUserAuthContextByEmail(email, { client });
  if (!authContext) {
    throw new AdminVerificationError("admin_role_missing");
  }

  const roles = authContext.roleCodes.length > 0 ? authContext.roleCodes : extractRoleCodes(user);
  const permissions =
    authContext.permissions.length > 0 ? authContext.permissions : extractPermissionCodes(user);
  const adminRole = await roleDelegate.findUnique({ where: { code: adminRoleCode } });
  const hasAdminBinding = user.roles?.some((userRole: any) => userRole?.role?.code === adminRoleCode);
  if (!adminRole || !hasAdminBinding || !roles.some((roleCode) => isAdminRoleValue(roleCode))) {
    throw new AdminVerificationError("admin_role_missing");
  }

  const availablePermissionCodes = await listAvailablePermissionCodes(client);
  if (availablePermissionCodes.length > 0) {
    const assignedPermissionCodes = new Set(permissions);
    const requiredPermissionsInSchema = requiredAdminPermissions.filter((permissionCode) =>
      availablePermissionCodes.includes(permissionCode),
    );
    const missingRequiredPermissions = requiredPermissionsInSchema.filter(
      (permissionCode) => !assignedPermissionCodes.has(permissionCode),
    );
    if (permissions.length === 0 || missingRequiredPermissions.length > 0) {
      throw new AdminVerificationError("admin_permissions_missing");
    }
  }

  if (input.password) {
    const passwordMatches = await verifyPassword(input.password, authContext.passwordHash);
    if (!passwordMatches) {
      throw new AdminVerificationError("admin_password_failed");
    }
  }

  return {
    user: safeUser(user),
    roles,
    permissions,
    passwordChecked: Boolean(input.password),
  };
}

export const verifySuperAdmin = verifyAdminBootstrap;

export function formatVerifyAdminResult(result: VerifyAdminResult): readonly string[] {
  return [
    `管理员账号验证通过：${result.user.email}`,
    `管理员角色：${result.roles.join(", ")}`,
    `管理员权限数：${result.permissions.length}`,
  ];
}

export async function runVerifyAdminFromEnv(
  source: VerifyAdminEnv = process.env,
): Promise<VerifyAdminResult> {
  return verifyAdminBootstrap(readVerifyAdminEnv(source));
}

async function main(): Promise<void> {
  const result = await createOrUpdateAdmin(await readCreateAdminInput());
  for (const line of formatCreateAdminResult(result)) {
    console.log(line);
  }
}

if (process.argv[1]?.endsWith("create-admin.ts")) {
  main()
    .catch((error) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await disconnectPrismaClient();
    });
}
