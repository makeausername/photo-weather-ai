import { createHash, randomBytes } from "node:crypto";

import { getPrismaClient } from "./client.js";
import type {
  AuthenticatedPrincipal,
  DatabaseClient,
  SafeUser,
  UserRecord,
  UserSessionRecord,
} from "./types.js";

export const requiredAdminPermissions = [
  "admin.manage",
  "settings.manage",
  "providers.manage",
  "users.manage",
  "audit.read",
  "usage.read",
] as const;

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireUserDelegate(client: DatabaseClient) {
  if (!client.user) {
    throw new Error("Database client is missing the user delegate.");
  }

  return client.user;
}

function requireUserSessionDelegate(client: DatabaseClient) {
  if (!client.userSession) {
    throw new Error("Database client is missing the userSession delegate.");
  }

  return client.userSession;
}

export function safeUser(record: UserRecord | any): SafeUser {
  return {
    id: record.id,
    email: record.email,
    phone: record.phone ?? null,
    displayName: record.displayName ?? null,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastLoginAt: record.lastLoginAt ?? null,
  };
}

function normalizePrincipal(record: any): AuthenticatedPrincipal | null {
  if (!record || record.status !== "active") {
    return null;
  }

  const roles = new Set<string>();
  const permissions = new Set<string>();

  for (const userRole of record.roles ?? []) {
    const role = userRole.role;
    if (!role?.code) {
      continue;
    }

    roles.add(role.code);

    for (const rolePermission of role.permissions ?? []) {
      const permission = rolePermission.permission;
      if (permission?.code) {
        permissions.add(permission.code);
      }
    }
  }

  return {
    user: safeUser(record),
    roles: [...roles].sort(),
    permissions: [...permissions].sort(),
  };
}

const userAuthInclude = {
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
};

export async function getUserAuthContextByEmail(
  email: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<(AuthenticatedPrincipal & { readonly passwordHash: string }) | null> {
  const client = await resolveClient(options.client);
  const user = await requireUserDelegate(client).findUnique({
    where: { email: email.trim().toLowerCase() },
    include: userAuthInclude,
  });
  const principal = normalizePrincipal(user);

  return principal && user?.passwordHash ? { ...principal, passwordHash: user.passwordHash } : null;
}

export async function getUserAuthContextById(
  userId: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthenticatedPrincipal | null> {
  const client = await resolveClient(options.client);
  const user = await requireUserDelegate(client).findUnique({
    where: { id: userId },
    include: userAuthInclude,
  });

  return normalizePrincipal(user);
}

export function hasPermission(
  principal: Pick<AuthenticatedPrincipal, "permissions">,
  permission: string,
): boolean {
  return principal.permissions.includes(permission);
}

export function assertPermission(
  principal: Pick<AuthenticatedPrincipal, "permissions">,
  permission: string,
): void {
  if (!hasPermission(principal, permission)) {
    throw new Error(`Missing required permission: ${permission}`);
  }
}

export function createRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken).digest("hex");
}

function normalizeSession(record: any): UserSessionRecord {
  return {
    id: record.id,
    userId: record.userId,
    refreshTokenHash: record.refreshTokenHash,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt ?? null,
    ipAddress: record.ipAddress ?? null,
    userAgent: record.userAgent ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function createUserSession(
  input: {
    readonly userId: string;
    readonly refreshTokenHash: string;
    readonly expiresAt: Date;
    readonly ipAddress?: string | null;
    readonly userAgent?: string | null;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<UserSessionRecord> {
  const client = await resolveClient(options.client);
  const record = await requireUserSessionDelegate(client).create({
    data: {
      userId: input.userId,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: input.expiresAt,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return normalizeSession(record);
}

export async function getActiveUserSessionByRefreshToken(
  refreshToken: string,
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<UserSessionRecord | null> {
  const client = await resolveClient(options.client);
  const record = await requireUserSessionDelegate(client).findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
  });

  if (!record || record.revokedAt) {
    return null;
  }

  if (record.expiresAt.getTime() <= (options.now ?? new Date()).getTime()) {
    return null;
  }

  return normalizeSession(record);
}

export async function revokeUserSessionByRefreshToken(
  refreshToken: string,
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<void> {
  const client = await resolveClient(options.client);
  const existing = await requireUserSessionDelegate(client).findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
  });

  if (!existing || existing.revokedAt) {
    return;
  }

  await requireUserSessionDelegate(client).update({
    where: { id: existing.id },
    data: { revokedAt: options.now ?? new Date() },
  });
}

export async function touchUserLastLogin(
  userId: string,
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<void> {
  const client = await resolveClient(options.client);
  await requireUserDelegate(client).update({
    where: { id: userId },
    data: { lastLoginAt: options.now ?? new Date() },
  });
}
