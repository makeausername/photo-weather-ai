import { createInterface } from "node:readline/promises";

import { disconnectPrismaClient, getPrismaClient } from "./client.js";
import { buildSeedData } from "./seed-data.js";
import { safeUser } from "./auth.js";
import {
  hashPassword,
  validateAdminPassword,
  verifyPassword,
} from "./passwords.js";
import type { DatabaseClient, SafeUser } from "./types.js";

export type CreateAdminInput = {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string | null;
  readonly client?: DatabaseClient;
};

export type CreateAdminResult = {
  readonly user: SafeUser;
  readonly created: boolean;
  readonly passwordUpdated: boolean;
  readonly roleAssigned: boolean;
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
  readonly passwordChecked: boolean;
};

export type CreateAdminEnv = {
  readonly [key: string]: string | undefined;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_INITIAL_PASSWORD?: string;
  readonly ADMIN_INITIAL_PASSWORD_B64?: string;
  readonly ADMIN_DISPLAY_NAME?: string;
};

export type VerifyAdminEnv = {
  readonly [key: string]: string | undefined;
  readonly ADMIN_EMAIL?: string;
  readonly ADMIN_PASSWORD?: string;
  readonly ADMIN_INITIAL_PASSWORD?: string;
  readonly ADMIN_INITIAL_PASSWORD_B64?: string;
};

export type AdminVerificationErrorCode =
  | "admin_not_found"
  | "admin_role_missing"
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
  admin_password_failed: "管理员密码校验失败",
  admin_disabled: "管理员账号未启用",
};

const adminEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const superAdminRoleCode = "super_admin";
const adminRoleCodes = new Set(["admin", superAdminRoleCode]);

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
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
  if (source.ADMIN_INITIAL_PASSWORD_B64?.trim()) {
    return decodeAdminInitialPasswordB64(source.ADMIN_INITIAL_PASSWORD_B64);
  }

  if (source.ADMIN_PASSWORD !== undefined) {
    return source.ADMIN_PASSWORD;
  }

  return source.ADMIN_INITIAL_PASSWORD;
}

function hasCompleteAdminEnv(source: CreateAdminEnv): boolean {
  return Boolean(source.ADMIN_EMAIL?.trim()) && Boolean(resolveAdminPassword(source));
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
  const email = source.ADMIN_EMAIL?.trim();
  const password = resolveAdminPassword(source) ?? "";

  if (!email || !password) {
    throw new Error(
      "缺少 ADMIN_EMAIL 以及 ADMIN_INITIAL_PASSWORD_B64、ADMIN_PASSWORD 或 ADMIN_INITIAL_PASSWORD，无法在非交互环境创建管理员。",
    );
  }

  return {
    email,
    password,
    displayName: normalizeDisplayName(source.ADMIN_DISPLAY_NAME),
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
      "缺少 ADMIN_EMAIL 以及 ADMIN_INITIAL_PASSWORD_B64、ADMIN_PASSWORD 或 ADMIN_INITIAL_PASSWORD，无法在非交互环境创建管理员。",
    );
  }

  let email = "";
  while (!email) {
    email = await promptLine("请输入管理员邮箱", source.ADMIN_EMAIL?.trim());
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
      source.ADMIN_DISPLAY_NAME?.trim() || "Super Admin",
    );
    return { email, password, displayName };
  }

  throw new Error("管理员密码不能为空。");
}

async function ensureSuperAdminRole(client: DatabaseClient): Promise<any> {
  const roleDelegate = requireDelegate<NonNullable<DatabaseClient["role"]>>(client, "role", "role");
  const seedData = buildSeedData();
  const roleSeed =
    seedData.roles.find((role) => role.code === superAdminRoleCode) ??
    ({
      code: superAdminRoleCode,
      name: "超级管理员",
      description: "自托管系统的完整管理权限。",
    } as const);

  const role = await roleDelegate.upsert({
    where: { code: roleSeed.code },
    create: {
      code: roleSeed.code,
      name: roleSeed.name,
      description: roleSeed.description,
    },
    update: {
      name: roleSeed.name,
      description: roleSeed.description,
    },
  });

  if (client.permission && client.rolePermission) {
    for (const permission of seedData.permissions) {
      const permissionRecord = await client.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: {
          name: permission.name,
          description: permission.description,
        },
      });

      await client.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permissionRecord.id,
          },
        },
        create: {
          roleId: role.id,
          permissionId: permissionRecord.id,
        },
        update: {},
      });
    }
  }

  return role;
}

function extractRoleCodes(user: any): readonly string[] {
  const roleCodes = new Set<string>();

  for (const roleCode of user?.roleCodes ?? []) {
    if (typeof roleCode === "string") {
      roleCodes.add(roleCode);
    }
  }

  for (const userRole of user?.roles ?? []) {
    const roleCode = userRole?.role?.code ?? userRole?.code;
    if (typeof roleCode === "string") {
      roleCodes.add(roleCode);
    }
  }

  return [...roleCodes].sort();
}

async function findAdminUserByEmail(client: DatabaseClient, email: string): Promise<any | null> {
  const userDelegate = requireDelegate<NonNullable<DatabaseClient["user"]>>(client, "user", "user");
  return userDelegate.findUnique({
    where: { email },
    include: {
      roles: {
        include: {
          role: true,
        },
      },
    },
  });
}

export async function createOrUpdateSuperAdmin(
  input: CreateAdminInput,
): Promise<CreateAdminResult> {
  const email = normalizeAdminEmail(input.email);
  assertAdminPassword(input.password);

  const client = await resolveClient(input.client);
  const userDelegate = requireDelegate<NonNullable<DatabaseClient["user"]>>(client, "user", "user");
  const userRoleDelegate = requireDelegate<NonNullable<DatabaseClient["userRole"]>>(
    client,
    "userRole",
    "userRole",
  );

  const superAdminRole = await ensureSuperAdminRole(client);
  const existingUser = await findAdminUserByEmail(client, email);
  const displayName = normalizeDisplayName(input.displayName);
  const passwordHash = await hashPassword(input.password);

  let user = existingUser;
  let created = false;
  let activated = false;

  if (!existingUser) {
    user = await userDelegate.create({
      data: {
        email,
        passwordHash,
        displayName: displayName ?? "Super Admin",
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
        passwordHash,
        ...(displayName ? { displayName } : {}),
        status: "active",
      },
    });
  }

  await userRoleDelegate.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: superAdminRole.id,
      },
    },
    create: {
      userId: user.id,
      roleId: superAdminRole.id,
    },
    update: {},
  });

  return {
    user: safeUser(user),
    created,
    passwordUpdated: true,
    roleAssigned: true,
    activated,
  };
}

export function formatCreateAdminResult(result: CreateAdminResult): readonly string[] {
  return [`管理员账号已创建或更新：${result.user.email}`];
}

export async function runCreateAdminFromEnv(
  source: CreateAdminEnv = process.env,
): Promise<CreateAdminResult> {
  return createOrUpdateSuperAdmin(readCreateAdminEnv(source));
}

export function readVerifyAdminEnv(source: VerifyAdminEnv = process.env): VerifyAdminInput {
  const email = source.ADMIN_EMAIL?.trim();
  if (!email) {
    throw new Error("缺少 ADMIN_EMAIL，无法验证管理员账号。");
  }

  return {
    email,
    password: resolveAdminPassword(source),
  };
}

export async function verifySuperAdmin(input: VerifyAdminInput): Promise<VerifyAdminResult> {
  const email = normalizeAdminEmail(input.email);
  const client = await resolveClient(input.client);
  const user = await findAdminUserByEmail(client, email);

  if (!user) {
    throw new AdminVerificationError("admin_not_found");
  }

  if (user.status !== "active") {
    throw new AdminVerificationError("admin_disabled");
  }

  const roles = extractRoleCodes(user);
  if (!roles.some((roleCode) => adminRoleCodes.has(roleCode))) {
    throw new AdminVerificationError("admin_role_missing");
  }

  if (input.password) {
    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AdminVerificationError("admin_password_failed");
    }
  }

  return {
    user: safeUser(user),
    roles,
    passwordChecked: Boolean(input.password),
  };
}

export function formatVerifyAdminResult(result: VerifyAdminResult): readonly string[] {
  return [`管理员账号验证通过：${result.user.email}`];
}

export async function runVerifyAdminFromEnv(
  source: VerifyAdminEnv = process.env,
): Promise<VerifyAdminResult> {
  return verifySuperAdmin(readVerifyAdminEnv(source));
}

async function main(): Promise<void> {
  const result = await createOrUpdateSuperAdmin(await readCreateAdminInput());
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
