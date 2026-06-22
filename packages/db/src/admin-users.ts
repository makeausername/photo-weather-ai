import { randomBytes } from "node:crypto";

import { getPrismaClient } from "./client.js";
import {
  buildAccountAccessStatus,
  resolveUserForecastAccess,
  type AccountAccessStatus,
} from "./access.js";
import { buildAuditLogDisplay } from "./audit-display.js";
import {
  DuplicateUserEmailError,
  DuplicateUserPhoneError,
  MissingUserIdentifierError,
  isLastActiveAdminUser,
  normalizeUserEmail,
  normalizeUserPhone,
  revokeUserSessions,
  safeUser,
  updateUserPassword,
} from "./auth.js";
import { hashUserPassword } from "./passwords.js";
import type {
  AdminAuditLogRecord,
  AuthenticatedPrincipal,
  DatabaseClient,
  JsonValue,
  SafeRole,
  SafeUser,
  UserStatus,
} from "./types.js";

export class AdminUserNotFoundError extends Error {
  constructor(readonly userId: string) {
    super(`Admin user not found: ${userId}`);
  }
}

export class LastAdminAccessChangeError extends Error {
  constructor(readonly userId: string) {
    super("Cannot remove or disable the last active admin account.");
  }
}

export class InvalidAdminRoleAssignmentError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type AdminUserListSort =
  | "created_desc"
  | "created_asc"
  | "last_login_desc"
  | "last_login_asc"
  | "paid_desc"
  | "orders_desc"
  | "credits_desc";

export type ListAdminUsersInput = {
  readonly q?: string | null;
  readonly status?: UserStatus | "all";
  readonly role?: string | "all";
  readonly hasOrders?: boolean;
  readonly hasCredits?: boolean;
  readonly createdFrom?: Date | null;
  readonly createdTo?: Date | null;
  readonly lastLoginFrom?: Date | null;
  readonly lastLoginTo?: Date | null;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: AdminUserListSort;
};

export type AdminUserOrderItem = {
  readonly orderNo: string;
  readonly provider: string;
  readonly productCode: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: string;
  readonly paidAt: Date | null;
  readonly expiresAt: Date | null;
  readonly providerTradeNo: string | null;
  readonly entitlementGrantedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AdminUserForecastHistoryItem = {
  readonly id: string;
  readonly locationName: string;
  readonly target: string;
  readonly horizon: string;
  readonly timezone: string | null;
  readonly overallScore: number | null;
  readonly recommendationLabel: string | null;
  readonly bestWindowStart: Date | null;
  readonly bestWindowEnd: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AdminUserEntitlementItem = {
  readonly id: string;
  readonly orderId: string;
  readonly type: string;
  readonly quantity: number;
  readonly remainingQuantity: number | null;
  readonly startsAt: Date;
  readonly expiresAt: Date | null;
  readonly grantedAt: Date;
  readonly metadataJson: JsonValue | null;
};

export type AdminUserCreditLedgerItem = {
  readonly id: string;
  readonly orderId: string | null;
  readonly entitlementId: string | null;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly reason: string;
  readonly metadataJson: JsonValue | null;
  readonly createdAt: Date;
};

export type AdminUserSessionItem = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly active: boolean;
};

export type AdminUserAuditLogItem = Pick<
  AdminAuditLogRecord,
  | "id"
  | "actorUserId"
  | "actorDisplayName"
  | "actorEmailMasked"
  | "actorPhoneMasked"
  | "actorLabel"
  | "action"
  | "actionLabel"
  | "targetType"
  | "targetId"
  | "targetLabel"
  | "targetSummary"
  | "technicalActorUserId"
  | "technicalTargetId"
  | "ipAddress"
  | "userAgent"
  | "createdAt"
>;

export type AdminUserOperationalSummary = {
  readonly orderCount: number;
  readonly paidOrderCount: number;
  readonly totalPaidAmountCents: number;
  readonly currentCreditBalance: number;
  readonly forecastHistoryCount: number;
  readonly activeSessionCount: number;
  readonly entitlementCount: number;
};

export type AdminUserListItem = SafeUser & {
  readonly emailMasked: string | null;
  readonly phoneMasked: string | null;
  readonly roles: readonly SafeRole[];
  readonly roleCodes: readonly string[];
  readonly permissions: readonly string[];
  readonly access: AccountAccessStatus;
} & AdminUserOperationalSummary;

export type AdminUserListSummary = {
  readonly totalUsers: number;
  readonly activeUsers: number;
  readonly disabledUsers: number;
  readonly todayNewUsers: number;
  readonly paidUsers: number;
  readonly totalPaidAmountCents: number;
};

export type AdminUserListResult = {
  readonly items: readonly AdminUserListItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly summary: AdminUserListSummary;
};

export type AdminUserDetail = {
  readonly profile: SafeUser;
  readonly emailMasked: string | null;
  readonly phoneMasked: string | null;
  readonly roles: readonly SafeRole[];
  readonly roleCodes: readonly string[];
  readonly permissions: readonly string[];
  readonly accountStatus: UserStatus;
  readonly access: AccountAccessStatus;
  readonly summary: AdminUserOperationalSummary;
  readonly sessionsSummary: {
    readonly active: number;
    readonly revoked: number;
    readonly expired: number;
    readonly total: number;
  };
  readonly orderSummary: {
    readonly total: number;
    readonly paid: number;
    readonly unpaid: number;
    readonly totalPaidAmountCents: number;
  };
  readonly entitlementSummary: {
    readonly total: number;
    readonly active: number;
    readonly forecastCreditsRemaining: number;
  };
  readonly creditBalance: number;
  readonly recentOrders: readonly AdminUserOrderItem[];
  readonly recentForecastHistory: readonly AdminUserForecastHistoryItem[];
  readonly recentAuditLogs: readonly AdminUserAuditLogItem[];
  readonly recentSessions: readonly AdminUserSessionItem[];
  readonly entitlements: readonly AdminUserEntitlementItem[];
  readonly creditLedger: readonly AdminUserCreditLedgerItem[];
};

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function requireDelegate<TDelegate>(delegate: TDelegate | undefined, name: string): TDelegate {
  if (!delegate) {
    throw new Error(`Database client is missing ${name} delegate.`);
  }

  return delegate;
}

function requireFindMany<TDelegate extends { readonly findMany?: (args?: any) => Promise<any[]> }>(
  delegate: TDelegate,
  name: string,
): (args?: any) => Promise<any[]> {
  if (typeof delegate.findMany !== "function") {
    throw new Error(`Database client is missing ${name}.findMany.`);
  }

  return delegate.findMany;
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function normalizeRole(record: any): SafeRole | null {
  const roleRecord = record?.role ?? record;
  const code = typeof roleRecord?.code === "string" ? roleRecord.code.trim() : "";
  const name = typeof roleRecord?.name === "string" ? roleRecord.name.trim() : "";
  if (!code && !name) {
    return null;
  }

  return {
    id: String(roleRecord?.id ?? code ?? name),
    code: code || name,
    name: name || code,
    displayName:
      typeof roleRecord?.displayName === "string"
        ? roleRecord.displayName
        : typeof roleRecord?.display_name === "string"
          ? roleRecord.display_name
          : name || code,
    description: typeof roleRecord?.description === "string" ? roleRecord.description : null,
  };
}

function principalParts(record: any): {
  readonly roles: readonly SafeRole[];
  readonly roleCodes: readonly string[];
  readonly permissions: readonly string[];
} {
  const roleMap = new Map<string, SafeRole>();
  const roleCodes = new Set<string>();
  const permissions = new Set<string>();

  for (const entry of record?.roles ?? []) {
    const role = normalizeRole(entry);
    if (!role) {
      continue;
    }
    roleMap.set(role.id || role.code, role);
    roleCodes.add(role.code);

    const roleRecord = entry?.role ?? entry;
    for (const permissionEntry of roleRecord?.permissions ?? []) {
      const code = permissionEntry?.permission?.code;
      if (typeof code === "string" && code) {
        permissions.add(code);
      }
    }
  }

  for (const code of record?.roleCodes ?? []) {
    if (typeof code === "string" && code && !roleCodes.has(code)) {
      roleCodes.add(code);
      roleMap.set(code, {
        id: code,
        code,
        name: code,
        displayName: code,
        description: null,
      });
    }
  }

  return {
    roles: [...roleMap.values()].sort((left, right) => left.code.localeCompare(right.code)),
    roleCodes: [...roleCodes].sort(),
    permissions: [...permissions].sort(),
  };
}

function maskEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return email;
  }
  const visible = name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}***@${domain}`;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) {
    return null;
  }
  return phone.length === 11 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;
}

function dateInRange(
  value: Date | null | undefined,
  from?: Date | null,
  to?: Date | null,
): boolean {
  if (!value) {
    return !from && !to;
  }
  return (!from || value.getTime() >= from.getTime()) && (!to || value.getTime() <= to.getTime());
}

function normalizePaymentOrder(record: any): AdminUserOrderItem {
  return {
    orderNo: record.orderNo,
    provider: record.provider,
    productCode: record.productCode,
    amountCents: record.amountCents,
    currency: record.currency,
    status: record.status,
    paidAt: record.paidAt ?? null,
    expiresAt: record.expiresAt ?? null,
    providerTradeNo: record.providerTradeNo ?? null,
    entitlementGrantedAt: record.entitlementGrantedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeForecastHistory(record: any): AdminUserForecastHistoryItem {
  return {
    id: record.id,
    locationName: record.locationName,
    target: record.target,
    horizon: record.horizon,
    timezone: record.timezone ?? null,
    overallScore: record.overallScore ?? null,
    recommendationLabel: record.recommendationLabel ?? null,
    bestWindowStart: record.bestWindowStart ?? null,
    bestWindowEnd: record.bestWindowEnd ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function normalizeEntitlement(record: any): AdminUserEntitlementItem {
  return {
    id: record.id,
    orderId: record.orderId,
    type: record.type,
    quantity: record.quantity,
    remainingQuantity: record.remainingQuantity ?? null,
    startsAt: record.startsAt,
    expiresAt: record.expiresAt ?? null,
    grantedAt: record.grantedAt,
    metadataJson: (record.metadataJson ?? null) as JsonValue | null,
  };
}

function normalizeCreditLedger(record: any): AdminUserCreditLedgerItem {
  return {
    id: record.id,
    orderId: record.orderId ?? null,
    entitlementId: record.entitlementId ?? null,
    delta: record.delta,
    balanceAfter: record.balanceAfter,
    reason: record.reason,
    metadataJson: (record.metadataJson ?? null) as JsonValue | null,
    createdAt: record.createdAt,
  };
}

function normalizeSession(record: any, now = new Date()): AdminUserSessionItem {
  return {
    id: record.id,
    userId: record.userId,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt ?? null,
    ipAddress: record.ipAddress ?? null,
    userAgent: record.userAgent ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    active: !record.revokedAt && new Date(record.expiresAt).getTime() > now.getTime(),
  };
}

function normalizeAuditLog(record: any): AdminUserAuditLogItem {
  const display = buildAuditLogDisplay({
    actorUserId: record.actorUserId ?? null,
    actor: record.actor ?? null,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    beforeJson: record.beforeJson ?? null,
    afterJson: record.afterJson ?? null,
  });

  return {
    id: record.id,
    actorUserId: record.actorUserId ?? null,
    actorDisplayName: display.actorDisplayName,
    actorEmailMasked: display.actorEmailMasked,
    actorPhoneMasked: display.actorPhoneMasked,
    actorLabel: display.actorLabel,
    action: record.action,
    actionLabel: display.actionLabel,
    targetType: record.targetType,
    targetId: record.targetId ?? null,
    targetLabel: display.targetLabel,
    targetSummary: display.targetSummary,
    technicalActorUserId: display.technicalActorUserId,
    technicalTargetId: display.technicalTargetId,
    ipAddress: record.ipAddress ?? null,
    userAgent: record.userAgent ?? null,
    createdAt: record.createdAt,
  };
}

async function getUserRecord(userId: string, client: DatabaseClient): Promise<any> {
  const record = await requireDelegate(client.user, "user").findUnique({
    where: { id: userId },
    include: {
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
    },
  });

  if (!record) {
    throw new AdminUserNotFoundError(userId);
  }
  return record;
}

async function listOrdersForUser(
  userId: string,
  client: DatabaseClient,
  limit?: number,
): Promise<AdminUserOrderItem[]> {
  const paymentOrder = client.paymentOrder;
  if (!paymentOrder) {
    return [];
  }
  const records = await paymentOrder.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  return records.map(normalizePaymentOrder);
}

async function listForecastHistoryForUser(
  userId: string,
  client: DatabaseClient,
  limit?: number,
): Promise<AdminUserForecastHistoryItem[]> {
  const userForecastHistory = client.userForecastHistory;
  if (!userForecastHistory) {
    return [];
  }
  const records = await userForecastHistory.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });
  return records.map(normalizeForecastHistory);
}

async function listEntitlementsForUser(
  userId: string,
  client: DatabaseClient,
): Promise<AdminUserEntitlementItem[]> {
  const userEntitlement = client.userEntitlement;
  if (!userEntitlement) {
    return [];
  }
  const records = await userEntitlement.findMany({
    where: { userId },
    orderBy: [{ grantedAt: "desc" }],
  });
  return records.map(normalizeEntitlement);
}

async function listCreditLedgerForUser(
  userId: string,
  client: DatabaseClient,
): Promise<AdminUserCreditLedgerItem[]> {
  const userCreditLedger = client.userCreditLedger;
  if (!userCreditLedger) {
    return [];
  }
  const records = await userCreditLedger.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
  });
  return records.map(normalizeCreditLedger);
}

export async function listUserSessionsForAdmin(
  input: { readonly userId: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<AdminUserSessionItem[]> {
  const client = await resolveClient(options.client);
  const userSession = client.userSession;
  if (!userSession?.findMany) {
    return [];
  }
  const records = await userSession.findMany({
    where: { userId: input.userId },
    orderBy: [{ createdAt: "desc" }],
    take: input.limit,
  });
  return records.map((record) => normalizeSession(record, options.now));
}

async function listAuditLogsForUser(
  userId: string,
  client: DatabaseClient,
  limit?: number,
): Promise<AdminUserAuditLogItem[]> {
  const records = await client.adminAuditLog.findMany({
    where: {
      OR: [{ targetId: userId }, { actorUserId: userId }],
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit ?? 20,
    include: { actor: true },
  });
  return records.map(normalizeAuditLog);
}

export async function getUserOperationalSummary(
  input: { readonly userId: string },
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<AdminUserOperationalSummary> {
  const client = await resolveClient(options.client);
  const now = options.now ?? new Date();
  const [orders, history, sessions, entitlements, creditLedger] = await Promise.all([
    listOrdersForUser(input.userId, client),
    listForecastHistoryForUser(input.userId, client),
    listUserSessionsForAdmin({ userId: input.userId }, { client, now }),
    listEntitlementsForUser(input.userId, client),
    listCreditLedgerForUser(input.userId, client),
  ]);
  const paidOrders = orders.filter((order) => order.status === "paid");
  const currentCreditBalance =
    creditLedger[0]?.balanceAfter ??
    creditLedger.reduce((total, entry) => total + Number(entry.delta ?? 0), 0);

  return {
    orderCount: orders.length,
    paidOrderCount: paidOrders.length,
    totalPaidAmountCents: paidOrders.reduce((total, order) => total + order.amountCents, 0),
    currentCreditBalance,
    forecastHistoryCount: history.length,
    activeSessionCount: sessions.filter((session) => session.active).length,
    entitlementCount: entitlements.length,
  };
}

function userMatchesSearch(item: AdminUserListItem, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [
    item.id,
    item.email,
    item.phone,
    item.emailMasked,
    item.phoneMasked,
    item.displayName,
  ].some((value) => typeof value === "string" && value.toLowerCase().includes(needle));
}

function sortUsers(left: AdminUserListItem, right: AdminUserListItem, sort: AdminUserListSort) {
  if (sort === "created_asc") {
    return left.createdAt.getTime() - right.createdAt.getTime();
  }
  if (sort === "last_login_desc") {
    return (right.lastLoginAt?.getTime() ?? 0) - (left.lastLoginAt?.getTime() ?? 0);
  }
  if (sort === "last_login_asc") {
    return (left.lastLoginAt?.getTime() ?? 0) - (right.lastLoginAt?.getTime() ?? 0);
  }
  if (sort === "paid_desc") {
    return right.totalPaidAmountCents - left.totalPaidAmountCents;
  }
  if (sort === "orders_desc") {
    return right.orderCount - left.orderCount;
  }
  if (sort === "credits_desc") {
    return right.currentCreditBalance - left.currentCreditBalance;
  }
  return right.createdAt.getTime() - left.createdAt.getTime();
}

export async function listAdminUsers(
  input: ListAdminUsersInput = {},
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<AdminUserListResult> {
  const client = await resolveClient(options.client);
  const now = options.now ?? new Date();
  const userDelegate = requireDelegate(client.user, "user");
  const findMany = requireFindMany(userDelegate, "user");
  const records = await findMany({
    include: {
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
    },
  });

  const items = await Promise.all(
    records.map(async (record) => {
      const parts = principalParts(record);
      const [summary, access] = await Promise.all([
        getUserOperationalSummary({ userId: record.id }, { client, now }),
        resolveUserForecastAccess({ userId: record.id, client, now }),
      ]);
      const user = safeUser(record);
      return {
        ...user,
        emailMasked: maskEmail(user.email),
        phoneMasked: maskPhone(user.phone),
        roles: parts.roles,
        roleCodes: parts.roleCodes,
        permissions: parts.permissions,
        access: buildAccountAccessStatus(access, { now }),
        ...summary,
      } satisfies AdminUserListItem;
    }),
  );

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const summary: AdminUserListSummary = {
    totalUsers: items.length,
    activeUsers: items.filter((item) => item.status === "active").length,
    disabledUsers: items.filter((item) => item.status === "disabled").length,
    todayNewUsers: items.filter((item) => item.createdAt.getTime() >= todayStart.getTime()).length,
    paidUsers: items.filter((item) => item.paidOrderCount > 0).length,
    totalPaidAmountCents: items.reduce((total, item) => total + item.totalPaidAmountCents, 0),
  };

  const roleFilter = input.role && input.role !== "all" ? input.role : null;
  const filtered = items
    .filter((item) => !input.q || userMatchesSearch(item, input.q))
    .filter((item) => !input.status || input.status === "all" || item.status === input.status)
    .filter((item) => !roleFilter || item.roleCodes.includes(roleFilter))
    .filter((item) => input.hasOrders === undefined || item.orderCount > 0 === input.hasOrders)
    .filter(
      (item) =>
        input.hasCredits === undefined || item.currentCreditBalance > 0 === input.hasCredits,
    )
    .filter((item) => dateInRange(item.createdAt, input.createdFrom, input.createdTo))
    .filter((item) => dateInRange(item.lastLoginAt, input.lastLoginFrom, input.lastLoginTo))
    .sort((left, right) => sortUsers(left, right, input.sort ?? "created_desc"));

  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;

  return {
    items: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: filtered.length,
      totalPages,
    },
    summary,
  };
}

export async function getAdminUserDetail(
  userId: string,
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<AdminUserDetail> {
  const client = await resolveClient(options.client);
  const now = options.now ?? new Date();
  const record = await getUserRecord(userId, client);
  const profile = safeUser(record);
  const parts = principalParts(record);
  const [orders, history, auditLogs, sessions, entitlements, creditLedger, access] =
    await Promise.all([
      listOrdersForUser(userId, client),
      listForecastHistoryForUser(userId, client),
      listAuditLogsForUser(userId, client, 20),
      listUserSessionsForAdmin({ userId, limit: 20 }, { client, now }),
      listEntitlementsForUser(userId, client),
      listCreditLedgerForUser(userId, client),
      resolveUserForecastAccess({ userId, client, now }),
    ]);
  const paidOrders = orders.filter((order) => order.status === "paid");
  const unpaidOrders = orders.filter(
    (order) => !["paid", "closed", "canceled", "refunded"].includes(order.status),
  );
  const activeEntitlements = entitlements.filter(
    (item) => !item.expiresAt || item.expiresAt.getTime() > now.getTime(),
  );
  const creditBalance =
    creditLedger[0]?.balanceAfter ??
    creditLedger.reduce((total, entry) => total + Number(entry.delta ?? 0), 0);
  const sessionBuckets = {
    active: sessions.filter((session) => session.active).length,
    revoked: sessions.filter((session) => session.revokedAt).length,
    expired: sessions.filter(
      (session) => !session.revokedAt && session.expiresAt.getTime() <= now.getTime(),
    ).length,
    total: sessions.length,
  };
  const summary: AdminUserOperationalSummary = {
    orderCount: orders.length,
    paidOrderCount: paidOrders.length,
    totalPaidAmountCents: paidOrders.reduce((total, order) => total + order.amountCents, 0),
    currentCreditBalance: creditBalance,
    forecastHistoryCount: history.length,
    activeSessionCount: sessionBuckets.active,
    entitlementCount: entitlements.length,
  };

  return {
    profile,
    emailMasked: maskEmail(profile.email),
    phoneMasked: maskPhone(profile.phone),
    roles: parts.roles,
    roleCodes: parts.roleCodes,
    permissions: parts.permissions,
    accountStatus: profile.status,
    access: buildAccountAccessStatus(access, { now }),
    summary,
    sessionsSummary: sessionBuckets,
    orderSummary: {
      total: orders.length,
      paid: paidOrders.length,
      unpaid: unpaidOrders.length,
      totalPaidAmountCents: summary.totalPaidAmountCents,
    },
    entitlementSummary: {
      total: entitlements.length,
      active: activeEntitlements.length,
      forecastCreditsRemaining: activeEntitlements.reduce(
        (total, entitlement) => total + Number(entitlement.remainingQuantity ?? 0),
        0,
      ),
    },
    creditBalance,
    recentOrders: orders.slice(0, 10),
    recentForecastHistory: history.slice(0, 10),
    recentAuditLogs: auditLogs.slice(0, 10),
    recentSessions: sessions.slice(0, 10),
    entitlements,
    creditLedger,
  };
}

async function assertUniqueContact(input: {
  readonly userId?: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly client: DatabaseClient;
}): Promise<void> {
  const userDelegate = requireDelegate(input.client.user, "user");
  if (input.email) {
    const existing = await userDelegate.findUnique({ where: { email: input.email } });
    if (existing && existing.id !== input.userId) {
      throw new DuplicateUserEmailError(input.email);
    }
  }
  if (input.phone) {
    const existing = await userDelegate.findUnique({ where: { phone: input.phone } });
    if (existing && existing.id !== input.userId) {
      throw new DuplicateUserPhoneError(input.phone);
    }
  }
}

function normalizeRoleCodes(input: {
  readonly roleCodes?: readonly string[] | null;
  readonly removeDefaultUserRole?: boolean;
}): string[] {
  const codes = new Set(
    (input.roleCodes ?? [])
      .map((roleCode) => roleCode.trim())
      .filter((roleCode) => roleCode.length > 0),
  );
  if (!input.removeDefaultUserRole) {
    codes.add("user");
  }
  if (codes.size === 0) {
    throw new InvalidAdminRoleAssignmentError("At least one role is required.");
  }
  return [...codes].sort();
}

async function resolveRolesByCode(
  roleCodes: readonly string[],
  client: DatabaseClient,
): Promise<readonly any[]> {
  const roleDelegate = requireDelegate(client.role, "role");
  const roles: any[] = [];
  for (const roleCode of roleCodes) {
    const role = await roleDelegate.findUnique({ where: { code: roleCode } });
    if (!role) {
      throw new InvalidAdminRoleAssignmentError(`Unknown role code: ${roleCode}`);
    }
    roles.push(role);
  }
  return roles;
}

function roleSetHasAdminAccess(roles: readonly any[]): boolean {
  return roles.some((role) => {
    const code = String(role?.code ?? "").toLowerCase();
    if (code === "admin" || code === "super_admin") {
      return true;
    }
    return (role?.permissions ?? []).some(
      (entry: any) => entry?.permission?.code === "admin.manage",
    );
  });
}

async function replaceUserRoles(input: {
  readonly userId: string;
  readonly roles: readonly any[];
  readonly client: DatabaseClient;
}): Promise<void> {
  const userRoleDelegate = requireDelegate(input.client.userRole, "userRole");
  if (userRoleDelegate.deleteMany) {
    await userRoleDelegate.deleteMany({ where: { userId: input.userId } });
  }
  for (const role of input.roles) {
    await userRoleDelegate.upsert({
      where: {
        userId_roleId: {
          userId: input.userId,
          roleId: role.id,
        },
      },
      create: {
        userId: input.userId,
        roleId: role.id,
      },
      update: {},
    });
  }
}

export function generateAdminTemporaryPassword(): string {
  return `Temp${randomBytes(9).toString("base64url")}!9`;
}

export async function createAdminManagedUser(
  input: {
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly password: string;
    readonly displayName?: string | null;
    readonly roleCodes?: readonly string[] | null;
    readonly removeDefaultUserRole?: boolean;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminUserDetail> {
  const client = await resolveClient(options.client);
  const email = normalizeUserEmail(input.email);
  const phone = normalizeUserPhone(input.phone);
  if (!email && !phone) {
    throw new MissingUserIdentifierError();
  }
  await assertUniqueContact({ email, phone, client });
  const roleCodes = normalizeRoleCodes({
    roleCodes: input.roleCodes,
    removeDefaultUserRole: input.removeDefaultUserRole,
  });
  const roles = await resolveRolesByCode(roleCodes, client);
  const user = await requireDelegate(client.user, "user").create({
    data: {
      email,
      phone,
      passwordHash: await hashUserPassword(input.password),
      displayName: input.displayName?.trim() || null,
      status: "active",
    },
  });
  if (client.userProfile) {
    await client.userProfile.create({ data: { userId: user.id } });
  }
  await replaceUserRoles({ userId: user.id, roles, client });

  return getAdminUserDetail(user.id, { client });
}

export async function updateAdminManagedUser(
  input: {
    readonly userId: string;
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly displayName?: string | null;
    readonly status?: UserStatus;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminUserDetail> {
  const client = await resolveClient(options.client);
  const existing = safeUser(await getUserRecord(input.userId, client));
  const nextEmail = input.email === undefined ? existing.email : normalizeUserEmail(input.email);
  const nextPhone = input.phone === undefined ? existing.phone : normalizeUserPhone(input.phone);
  if (!nextEmail && !nextPhone) {
    throw new MissingUserIdentifierError();
  }
  await assertUniqueContact({
    userId: input.userId,
    email: nextEmail,
    phone: nextPhone,
    client,
  });
  if (input.status === "disabled" && existing.status !== "disabled") {
    if (await isLastActiveAdminUser(input.userId, { client })) {
      throw new LastAdminAccessChangeError(input.userId);
    }
  }

  await requireDelegate(client.user, "user").update({
    where: { id: input.userId },
    data: {
      ...(input.email !== undefined ? { email: nextEmail } : {}),
      ...(input.phone !== undefined ? { phone: nextPhone } : {}),
      ...(input.displayName !== undefined
        ? { displayName: input.displayName?.trim() || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });

  return getAdminUserDetail(input.userId, { client });
}

export async function disableUserAccount(
  input: { readonly userId: string; readonly revokeSessions?: boolean },
  options: { readonly client?: DatabaseClient } = {},
): Promise<{ readonly user: AdminUserDetail; readonly revokedSessionCount: number }> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  if (await isLastActiveAdminUser(input.userId, { client })) {
    throw new LastAdminAccessChangeError(input.userId);
  }
  await requireDelegate(client.user, "user").update({
    where: { id: input.userId },
    data: { status: "disabled" },
  });
  const revokedSessionCount =
    input.revokeSessions === false
      ? 0
      : await revokeUserSessions({ userId: input.userId }, { client });
  return {
    user: await getAdminUserDetail(input.userId, { client }),
    revokedSessionCount,
  };
}

export async function enableUserAccount(
  input: { readonly userId: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminUserDetail> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  await requireDelegate(client.user, "user").update({
    where: { id: input.userId },
    data: { status: "active" },
  });
  return getAdminUserDetail(input.userId, { client });
}

export async function resetUserPasswordByAdmin(
  input: {
    readonly userId: string;
    readonly password?: string | null;
    readonly revokeSessions?: boolean;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<{
  readonly user: AdminUserDetail;
  readonly generatedPassword: string | null;
  readonly revokedSessionCount: number;
}> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  const generatedPassword = input.password ? null : generateAdminTemporaryPassword();
  const password = input.password ?? generatedPassword;
  if (!password) {
    throw new Error("Temporary password is required.");
  }
  await updateUserPassword({ userId: input.userId, password }, { client });
  const revokedSessionCount =
    input.revokeSessions === false
      ? 0
      : await revokeUserSessions({ userId: input.userId }, { client });
  return {
    user: await getAdminUserDetail(input.userId, { client }),
    generatedPassword,
    revokedSessionCount,
  };
}

export async function updateUserRolesByAdmin(
  input: {
    readonly userId: string;
    readonly roleCodes: readonly string[];
    readonly removeDefaultUserRole?: boolean;
    readonly actorCanManageAdminRoles?: boolean;
  },
  options: { readonly client?: DatabaseClient } = {},
): Promise<AdminUserDetail> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  const roleCodes = normalizeRoleCodes(input);
  const roles = await resolveRolesByCode(roleCodes, client);
  const desiredHasAdminAccess = roleSetHasAdminAccess(roles);
  const touchesPrivilegedRole = roleCodes.some((roleCode) =>
    ["admin", "super_admin"].includes(roleCode),
  );
  if (touchesPrivilegedRole && !input.actorCanManageAdminRoles) {
    throw new InvalidAdminRoleAssignmentError("admin.manage is required to assign admin roles.");
  }
  if (!desiredHasAdminAccess && (await isLastActiveAdminUser(input.userId, { client }))) {
    throw new LastAdminAccessChangeError(input.userId);
  }

  await replaceUserRoles({ userId: input.userId, roles, client });
  return getAdminUserDetail(input.userId, { client });
}

export async function revokeUserSessionsByAdmin(
  input: { readonly userId: string },
  options: { readonly client?: DatabaseClient; readonly now?: Date } = {},
): Promise<{
  readonly revokedSessionCount: number;
  readonly sessions: readonly AdminUserSessionItem[];
}> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  const revokedSessionCount = await revokeUserSessions(
    { userId: input.userId },
    { client, now: options.now },
  );
  return {
    revokedSessionCount,
    sessions: await listUserSessionsForAdmin(
      { userId: input.userId },
      { client, now: options.now },
    ),
  };
}

export async function listUserPaymentOrdersForAdmin(
  input: { readonly userId: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminUserOrderItem[]> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  return listOrdersForUser(input.userId, client, input.limit);
}

export async function listUserForecastHistoryForAdmin(
  input: { readonly userId: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminUserForecastHistoryItem[]> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  return listForecastHistoryForUser(input.userId, client, input.limit);
}

export async function listUserEntitlementsForAdmin(
  input: { readonly userId: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminUserEntitlementItem[]> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  return listEntitlementsForUser(input.userId, client);
}

export async function listUserCreditLedgerForAdmin(
  input: { readonly userId: string },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminUserCreditLedgerItem[]> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  return listCreditLedgerForUser(input.userId, client);
}

export async function listUserAuditLogsForAdmin(
  input: { readonly userId: string; readonly limit?: number },
  options: { readonly client?: DatabaseClient } = {},
): Promise<readonly AdminUserAuditLogItem[]> {
  const client = await resolveClient(options.client);
  await getUserRecord(input.userId, client);
  return listAuditLogsForUser(input.userId, client, input.limit);
}

export function adminUserAuditSnapshot(user: AdminUserDetail | AdminUserListItem): JsonValue {
  const profile = "profile" in user ? user.profile : user;
  return toJson({
    id: profile.id,
    email: profile.email,
    phone: profile.phone,
    displayName: profile.displayName,
    status: profile.status,
    roleCodes: "roleCodes" in user ? user.roleCodes : [],
  });
}

export function principalCanManageAdminRoles(
  principal: Pick<AuthenticatedPrincipal, "permissions" | "roleCodes">,
): boolean {
  return (
    principal.permissions.includes("admin.manage") ||
    principal.roleCodes.some((roleCode) => roleCode === "admin" || roleCode === "super_admin")
  );
}
