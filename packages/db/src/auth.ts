import { createHash, randomBytes } from "node:crypto";

import { getPrismaClient } from "./client.js";
import { hashUserPassword } from "./passwords.js";
import type {
  AuthenticatedPrincipal,
  DatabaseClient,
  SafeRole,
  SafeUserProfile,
  SafeUser,
  UserRecord,
  UserSessionRecord,
} from "./types.js";

export const requiredAdminPermissions = [
  "admin.manage",
  "settings.manage",
  "providers.manage",
  "users.manage",
  "locations.manage",
  "photo_spots.manage",
  "audit.read",
  "usage.read",
] as const;

export const adminRoleCodes = ["admin", "super_admin"] as const;
const adminRoleCodeSet = new Set<string>(adminRoleCodes);

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

function requireRoleDelegate(client: DatabaseClient) {
  if (!client.role) {
    throw new Error("Database client is missing the role delegate.");
  }

  return client.role;
}

function requireUserRoleDelegate(client: DatabaseClient) {
  if (!client.userRole) {
    throw new Error("Database client is missing the userRole delegate.");
  }

  return client.userRole;
}

export class DuplicateUserEmailError extends Error {
  constructor(readonly email: string) {
    super("Duplicate user email.");
  }
}

export class DuplicateUserPhoneError extends Error {
  constructor(readonly phone: string) {
    super("Duplicate user phone.");
  }
}

export class MissingUserIdentifierError extends Error {
  constructor() {
    super("User email or phone is required.");
  }
}

export class LastAdminAccountDeletionError extends Error {
  constructor(readonly userId: string) {
    super("Cannot delete the last active admin account.");
  }
}

export function safeUser(record: UserRecord | any): SafeUser {
  return {
    id: record.id,
    email: record.email ?? null,
    phone: record.phone ?? null,
    displayName: record.displayName ?? null,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastLoginAt: record.lastLoginAt ?? null,
  };
}

export function safeUserProfile(record: any): SafeUserProfile | null {
  if (!record) {
    return null;
  }

  return {
    id: record.id,
    userId: record.userId,
    avatarUrl: record.avatarUrl ?? null,
    preferredUnits: record.preferredUnits,
    preferredLanguage: record.preferredLanguage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeRole(record: any): SafeRole | null {
  const code = typeof record?.code === "string" ? record.code.trim() : "";
  const name = typeof record?.name === "string" ? record.name.trim() : "";
  if (!code && !name) {
    return null;
  }

  const displayName =
    typeof record?.displayName === "string"
      ? record.displayName
      : typeof record?.display_name === "string"
        ? record.display_name
        : name || null;

  return {
    id: String(record?.id ?? (code || name)),
    code: code || name,
    name: name || code,
    displayName,
    description: typeof record?.description === "string" ? record.description : null,
  };
}

export function isAdminRoleLike(role: SafeRole | string | null | undefined): boolean {
  const values =
    typeof role === "string"
      ? [role]
      : [role?.code, role?.name].filter((value): value is string => typeof value === "string");

  return values.some((value) => adminRoleCodeSet.has(value.trim().toLowerCase()));
}

export function principalHasAdminRole(
  principal: Pick<AuthenticatedPrincipal, "roles" | "roleCodes">,
): boolean {
  return (
    principal.roleCodes.some((roleCode) => isAdminRoleLike(roleCode)) ||
    principal.roles.some((role) => isAdminRoleLike(role))
  );
}

function normalizePrincipal(record: any): AuthenticatedPrincipal | null {
  if (!record || record.status !== "active") {
    return null;
  }

  const roleMap = new Map<string, SafeRole>();
  const roleCodes = new Set<string>();
  const permissions = new Set<string>();

  for (const userRole of record.roles ?? []) {
    const role = normalizeRole(userRole.role ?? userRole);
    if (!role) {
      continue;
    }

    const roleKey = role.id || role.code || role.name;
    roleMap.set(roleKey, role);
    roleCodes.add(role.code);

    for (const rolePermission of (userRole.role ?? userRole).permissions ?? []) {
      const permission = rolePermission.permission;
      if (permission?.code) {
        permissions.add(permission.code);
      }
    }
  }

  return {
    user: safeUser(record),
    profile: safeUserProfile(record.profile),
    roles: [...roleMap.values()].sort((left, right) => left.code.localeCompare(right.code)),
    roleCodes: [...roleCodes].sort(),
    permissions: [...permissions].sort(),
  };
}

const userAuthInclude = {
  profile: true,
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
  const normalizedEmail = normalizeUserEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const user = await requireUserDelegate(client).findUnique({
    where: { email: normalizedEmail },
    include: userAuthInclude,
  });
  const principal = normalizePrincipal(user);

  return principal && user?.passwordHash ? { ...principal, passwordHash: user.passwordHash } : null;
}

export async function getUserAuthContextByIdentifier(
  identifier: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<(AuthenticatedPrincipal & { readonly passwordHash: string }) | null> {
  const client = await resolveClient(options.client);
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const normalizedEmail = normalizedIdentifier.includes("@")
    ? normalizeRequiredEmail(normalizedIdentifier)
    : null;
  const normalizedPhone = normalizedEmail ? null : normalizeUserPhone(normalizedIdentifier);
  if (!normalizedEmail && !normalizedPhone) {
    return null;
  }

  const user = await requireUserDelegate(client).findUnique({
    where: normalizedEmail ? { email: normalizedEmail } : { phone: normalizedPhone },
    include: userAuthInclude,
  });
  const principal = normalizePrincipal(user);

  return principal && user?.passwordHash ? { ...principal, passwordHash: user.passwordHash } : null;
}

export async function getUserAccountByIdentifier(
  identifier: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<SafeUser | null> {
  const client = await resolveClient(options.client);
  const normalizedIdentifier = identifier.trim();
  if (!normalizedIdentifier) {
    return null;
  }

  const normalizedEmail = normalizedIdentifier.includes("@")
    ? normalizeRequiredEmail(normalizedIdentifier)
    : null;
  const normalizedPhone = normalizedEmail ? null : normalizeUserPhone(normalizedIdentifier);
  if (!normalizedEmail && !normalizedPhone) {
    return null;
  }

  const user = await requireUserDelegate(client).findUnique({
    where: normalizedEmail ? { email: normalizedEmail } : { phone: normalizedPhone },
  });

  return user ? safeUser(user) : null;
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

export async function getUserAuthContextWithPasswordById(
  userId: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<(AuthenticatedPrincipal & { readonly passwordHash: string }) | null> {
  const client = await resolveClient(options.client);
  const user = await requireUserDelegate(client).findUnique({
    where: { id: userId },
    include: userAuthInclude,
  });
  const principal = normalizePrincipal(user);

  return principal && user?.passwordHash ? { ...principal, passwordHash: user.passwordHash } : null;
}

export function normalizeUserEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function normalizeUserPhone(phone: string | null | undefined): string | null {
  const normalized = phone
    ?.replace(/[\s-]/g, "")
    .replace(/^\+?86/, "")
    .trim();
  return normalized ? normalized : null;
}

function normalizeRequiredEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string | null | undefined): string | null {
  const normalized = displayName?.trim();
  return normalized ? normalized : null;
}

export async function createPublicUserAccount(
  input: {
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly password: string;
    readonly displayName?: string | null;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthenticatedPrincipal> {
  const client = await resolveClient(options.client);
  const userDelegate = requireUserDelegate(client);
  const roleDelegate = requireRoleDelegate(client);
  const userRoleDelegate = requireUserRoleDelegate(client);
  const email = normalizeUserEmail(input.email);
  const phone = normalizeUserPhone(input.phone);

  if (!email && !phone) {
    throw new MissingUserIdentifierError();
  }

  if (email) {
    const existingEmailUser = await userDelegate.findUnique({
      where: { email },
    });
    if (existingEmailUser) {
      throw new DuplicateUserEmailError(email);
    }
  }

  if (phone) {
    const existingPhoneUser = await userDelegate.findUnique({
      where: { phone },
    });
    if (existingPhoneUser) {
      throw new DuplicateUserPhoneError(phone);
    }
  }

  const userRole = await roleDelegate.findUnique({
    where: { code: "user" },
  });
  if (!userRole) {
    throw new Error("Missing user role. Run db:seed before public registration.");
  }

  const user = await userDelegate.create({
    data: {
      email,
      phone,
      passwordHash: await hashUserPassword(input.password),
      displayName: normalizeDisplayName(input.displayName),
      status: "active",
    },
  });

  if (client.userProfile) {
    await client.userProfile.create({
      data: {
        userId: user.id,
      },
    });
  }

  await userRoleDelegate.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: userRole.id,
      },
    },
    create: {
      userId: user.id,
      roleId: userRole.id,
    },
    update: {},
  });

  const principal = await getUserAuthContextById(user.id, { client });
  if (!principal) {
    throw new Error("Created public user could not be loaded.");
  }

  return principal;
}

export async function updateUserPassword(
  input: {
    readonly userId: string;
    readonly password: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthenticatedPrincipal> {
  const client = await resolveClient(options.client);
  await requireUserDelegate(client).update({
    where: { id: input.userId },
    data: {
      passwordHash: await hashUserPassword(input.password),
    },
  });

  const principal = await getUserAuthContextById(input.userId, { client });
  if (!principal) {
    throw new Error("Updated user could not be loaded.");
  }

  return principal;
}

export async function updateUserEmail(
  input: {
    readonly userId: string;
    readonly email: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthenticatedPrincipal> {
  const client = await resolveClient(options.client);
  const userDelegate = requireUserDelegate(client);
  const email = normalizeUserEmail(input.email);
  if (!email) {
    throw new MissingUserIdentifierError();
  }

  const existingEmailUser = await userDelegate.findUnique({
    where: { email },
  });
  if (existingEmailUser && existingEmailUser.id !== input.userId) {
    throw new DuplicateUserEmailError(email);
  }

  await userDelegate.update({
    where: { id: input.userId },
    data: { email },
  });

  const principal = await getUserAuthContextById(input.userId, { client });
  if (!principal) {
    throw new Error("Updated user could not be loaded.");
  }

  return principal;
}

export async function updateUserPhone(
  input: {
    readonly userId: string;
    readonly phone: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AuthenticatedPrincipal> {
  const client = await resolveClient(options.client);
  const userDelegate = requireUserDelegate(client);
  const phone = normalizeUserPhone(input.phone);
  if (!phone) {
    throw new MissingUserIdentifierError();
  }

  const existingPhoneUser = await userDelegate.findUnique({
    where: { phone },
  });
  if (existingPhoneUser && existingPhoneUser.id !== input.userId) {
    throw new DuplicateUserPhoneError(phone);
  }

  await userDelegate.update({
    where: { id: input.userId },
    data: { phone },
  });

  const principal = await getUserAuthContextById(input.userId, { client });
  if (!principal) {
    throw new Error("Updated user could not be loaded.");
  }

  return principal;
}

function principalHasAdminAccess(principal: AuthenticatedPrincipal): boolean {
  return principal.permissions.includes("admin.manage") || principalHasAdminRole(principal);
}

export async function isLastActiveAdminUser(
  userId: string,
  options: { readonly client?: DatabaseClient } = {},
): Promise<boolean> {
  const client = await resolveClient(options.client);
  const principal = await getUserAuthContextById(userId, { client });
  if (!principal || !principalHasAdminAccess(principal)) {
    return false;
  }

  const userDelegate = requireUserDelegate(client);
  if (!userDelegate.findMany) {
    return true;
  }

  const activeUsers = await userDelegate.findMany({
    where: {
      status: "active",
      id: {
        not: userId,
      },
    },
    include: userAuthInclude,
  });

  return !activeUsers
    .map((record) => normalizePrincipal(record))
    .some((candidate) => candidate !== null && principalHasAdminAccess(candidate));
}

export async function softDeleteUserAccount(
  input: {
    readonly userId: string;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<void> {
  const client = await resolveClient(options.client);
  if (await isLastActiveAdminUser(input.userId, { client })) {
    throw new LastAdminAccountDeletionError(input.userId);
  }

  await requireUserDelegate(client).update({
    where: { id: input.userId },
    data: {
      status: "disabled",
      email: null,
      phone: null,
      displayName: null,
      passwordHash: await hashUserPassword(randomBytes(32).toString("base64url")),
    },
  });
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

export async function revokeUserSessions(
  input: {
    readonly userId: string;
    readonly exceptRefreshToken?: string | null;
  },
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<number> {
  const client = await resolveClient(options.client);
  const delegate = requireUserSessionDelegate(client);
  if (!delegate.updateMany) {
    return 0;
  }

  const where: Record<string, unknown> = {
    userId: input.userId,
    revokedAt: null,
  };
  if (input.exceptRefreshToken) {
    where.refreshTokenHash = {
      not: hashRefreshToken(input.exceptRefreshToken),
    };
  }

  const result = await delegate.updateMany({
    where,
    data: { revokedAt: options.now ?? new Date() },
  });

  return result.count;
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
