import { getUserAuthContextById, principalHasAdminAccess } from "./auth.js";
import { getPrismaClient } from "./client.js";
import { isPlainJsonObject } from "./json.js";
import type {
  AuthenticatedPrincipal,
  BillingProductRecord,
  DatabaseClient,
  JsonValue,
  UserEntitlementRecord,
} from "./types.js";

export const fullForecastAccessEntitlementType = "full_forecast_access" as const;
export const trialFullAccessProductCode = "trial_7_days" as const;
export const monthlyFullAccessProductCode = "monthly_full" as const;
export const quarterlyFullAccessProductCode = "quarterly_full" as const;
export const yearlyFullAccessProductCode = "yearly_full" as const;

export const fullForecastAccessProductCodes = [
  trialFullAccessProductCode,
  monthlyFullAccessProductCode,
  quarterlyFullAccessProductCode,
  yearlyFullAccessProductCode,
] as const;

const publicFullForecastAccessProductCodes = new Set<string>([
  monthlyFullAccessProductCode,
  quarterlyFullAccessProductCode,
  yearlyFullAccessProductCode,
]);

export type ForecastAccessTier =
  | "guest"
  | "free"
  | "trial"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "admin";

export type ForecastAccessReason =
  | "guest"
  | "none"
  | "trial_active"
  | "paid_active"
  | "expired"
  | "admin";

export type ForecastAccessStatus = {
  readonly userId: string | null;
  readonly tier: ForecastAccessTier;
  readonly hasFullAccess: boolean;
  readonly maxForecastHours: number;
  readonly allowedTargets: readonly string[];
  readonly canUseAiExplanation: boolean;
  readonly canViewFullHistory: boolean;
  readonly activeEntitlementId?: string;
  readonly activeProductCode?: string;
  readonly entitlementExpiresAt?: string;
  readonly expiredProductCode?: string;
  readonly reason: ForecastAccessReason;
};

export type AccountAccessStatus = ForecastAccessStatus & {
  readonly currentPlanName: string;
  readonly remainingDays: number | null;
  readonly trialExpired: boolean;
  readonly upgradeRequiredForFullAccess: boolean;
  readonly freeLimitMessage: string;
};

export type ForecastAccessSettings = {
  readonly registrationTrialEnabled: boolean;
  readonly registrationTrialDays: number;
  readonly freeMaxForecastHours: number;
  readonly fullMaxForecastHours: number;
};

export type ForecastAccessDecision = {
  readonly allowed: boolean;
  readonly statusCode?: 402 | 403;
  readonly reason?: string;
};

export const upgradeRequiredMessage =
  "当前账户只能查看未来 24 小时基础天气。开通月卡、季卡或年卡后可查看完整摄影判断。";

const freeTargets = ["general"] as const;
const fullTargets = ["general", "cloud_sea", "glow", "astro"] as const;
const accessClockSkewMs = 5 * 60 * 1000;

async function resolveClient(client?: DatabaseClient): Promise<DatabaseClient> {
  return client ?? ((await getPrismaClient()) as unknown as DatabaseClient);
}

function readPositiveIntegerEnv(
  source: NodeJS.ProcessEnv | undefined,
  key: string,
  fallback: number,
): number {
  const raw = source?.[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readBooleanEnv(source: NodeJS.ProcessEnv | undefined, key: string, fallback: boolean) {
  const raw = source?.[key];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function getForecastAccessSettings(
  env: NodeJS.ProcessEnv | undefined = process.env,
): ForecastAccessSettings {
  return {
    registrationTrialEnabled: readBooleanEnv(env, "REGISTRATION_TRIAL_ENABLED", true),
    registrationTrialDays: readPositiveIntegerEnv(env, "REGISTRATION_TRIAL_DAYS", 7),
    freeMaxForecastHours: readPositiveIntegerEnv(env, "FREE_MAX_FORECAST_HOURS", 24),
    fullMaxForecastHours: readPositiveIntegerEnv(env, "FULL_MAX_FORECAST_HOURS", 168),
  };
}

function isDateActive(value: Date | string | null | undefined, now: Date): boolean {
  if (!value) {
    return true;
  }
  return new Date(value).getTime() > now.getTime();
}

function hasStarted(value: Date | string | null | undefined, now: Date): boolean {
  if (!value) {
    return true;
  }
  return new Date(value).getTime() <= now.getTime();
}

function readProductCode(metadataJson: JsonValue | null | undefined): string | null {
  if (!isPlainJsonObject(metadataJson)) {
    return null;
  }
  const productCode = metadataJson.productCode;
  return typeof productCode === "string" && productCode.trim() ? productCode.trim() : null;
}

export function isFullForecastAccessProduct(product: BillingProductRecord): boolean {
  if (!product.enabled || !product.durationDays || product.durationDays <= 0) {
    return false;
  }
  const metadata = isPlainJsonObject(product.metadataJson) ? product.metadataJson : {};
  return metadata.grantType === fullForecastAccessEntitlementType;
}

export function isInternalTrialProduct(product: BillingProductRecord): boolean {
  if (product.code !== trialFullAccessProductCode) {
    return false;
  }
  const metadata = isPlainJsonObject(product.metadataJson) ? product.metadataJson : {};
  return metadata.internal === true && metadata.source === "registration_trial";
}

export function isPublicPurchasableBillingProduct(product: BillingProductRecord): boolean {
  if (
    !publicFullForecastAccessProductCodes.has(product.code) ||
    !isFullForecastAccessProduct(product) ||
    product.amountCents <= 0 ||
    product.currency !== "CNY"
  ) {
    return false;
  }
  const metadata = isPlainJsonObject(product.metadataJson) ? product.metadataJson : {};
  if (metadata.internal === true || metadata.publicPurchasable === false) {
    return false;
  }
  return metadata.publicPurchasable === true || metadata.public === true;
}

function tierForProductCode(productCode: string | null | undefined): ForecastAccessTier {
  if (productCode === trialFullAccessProductCode) {
    return "trial";
  }
  if (productCode === monthlyFullAccessProductCode) {
    return "monthly";
  }
  if (productCode === quarterlyFullAccessProductCode) {
    return "quarterly";
  }
  if (productCode === yearlyFullAccessProductCode) {
    return "yearly";
  }
  return "free";
}

function productNameForTier(tier: ForecastAccessTier): string {
  if (tier === "admin") {
    return "管理员";
  }
  if (tier === "trial") {
    return "7 天试用";
  }
  if (tier === "monthly") {
    return "月卡";
  }
  if (tier === "quarterly") {
    return "季卡";
  }
  if (tier === "yearly") {
    return "年卡";
  }
  if (tier === "guest") {
    return "未登录";
  }
  return "免费版";
}

function latestByExpiration(
  entitlements: readonly UserEntitlementRecord[],
): UserEntitlementRecord | null {
  let latest: UserEntitlementRecord | null = null;
  for (const entitlement of entitlements) {
    if (!latest) {
      latest = entitlement;
      continue;
    }
    const left = entitlement.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const right = latest.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (left > right) {
      latest = entitlement;
    }
  }
  return latest;
}

function normalizeEntitlement(record: any): UserEntitlementRecord {
  return {
    id: record.id,
    userId: record.userId,
    orderId: record.orderId,
    type: record.type,
    quantity: record.quantity,
    remainingQuantity: record.remainingQuantity ?? null,
    startsAt: record.startsAt,
    expiresAt: record.expiresAt ?? null,
    grantedAt: record.grantedAt,
    metadataJson: record.metadataJson ?? null,
  };
}

function fullAccessStatus(input: {
  readonly userId: string;
  readonly tier: ForecastAccessTier;
  readonly reason: ForecastAccessReason;
  readonly maxForecastHours: number;
  readonly entitlement?: UserEntitlementRecord | null;
}): ForecastAccessStatus {
  return {
    userId: input.userId,
    tier: input.tier,
    hasFullAccess: true,
    maxForecastHours: input.maxForecastHours,
    allowedTargets: fullTargets,
    canUseAiExplanation: true,
    canViewFullHistory: true,
    activeEntitlementId: input.entitlement?.id,
    activeProductCode: readProductCode(input.entitlement?.metadataJson) ?? undefined,
    entitlementExpiresAt: input.entitlement?.expiresAt?.toISOString(),
    reason: input.reason,
  };
}

function freeStatus(input: {
  readonly userId: string | null;
  readonly maxForecastHours: number;
  readonly reason: ForecastAccessReason;
  readonly expiredProductCode?: string | null;
}): ForecastAccessStatus {
  return {
    userId: input.userId,
    tier: input.userId ? "free" : "guest",
    hasFullAccess: false,
    maxForecastHours: input.maxForecastHours,
    allowedTargets: freeTargets,
    canUseAiExplanation: false,
    canViewFullHistory: false,
    expiredProductCode: input.expiredProductCode ?? undefined,
    reason: input.reason,
  };
}

export async function resolveUserForecastAccess(
  input: {
    readonly userId?: string | null;
    readonly principal?: AuthenticatedPrincipal | null;
    readonly client?: DatabaseClient;
    readonly env?: NodeJS.ProcessEnv;
    readonly now?: Date;
  } = {},
): Promise<ForecastAccessStatus> {
  const settings = getForecastAccessSettings(input.env);
  const now = input.now ?? new Date();
  const principal =
    input.principal ??
    (input.userId
      ? await getUserAuthContextById(input.userId, { client: input.client })
      : null);
  const userId = principal?.user.id ?? input.userId ?? null;

  if (!userId) {
    return freeStatus({
      userId: null,
      maxForecastHours: settings.freeMaxForecastHours,
      reason: "guest",
    });
  }

  if (!principal || principal.user.status !== "active") {
    return freeStatus({
      userId,
      maxForecastHours: settings.freeMaxForecastHours,
      reason: "none",
    });
  }

  if (principalHasAdminAccess(principal)) {
    return fullAccessStatus({
      userId,
      tier: "admin",
      reason: "admin",
      maxForecastHours: settings.fullMaxForecastHours,
    });
  }

  const client = await resolveClient(input.client);
  const userEntitlement = client.userEntitlement;
  if (!userEntitlement) {
    return freeStatus({
      userId,
      maxForecastHours: settings.freeMaxForecastHours,
      reason: "none",
    });
  }

  const records = await userEntitlement.findMany({
    where: {
      userId,
      type: fullForecastAccessEntitlementType,
    },
    orderBy: [{ expiresAt: "desc" }, { grantedAt: "desc" }],
  });
  const entitlements = records.map(normalizeEntitlement);
  const active = latestByExpiration(
    entitlements.filter(
      (entitlement) =>
        hasStarted(entitlement.startsAt, now) && isDateActive(entitlement.expiresAt, now),
    ),
  );
  if (active) {
    const productCode = readProductCode(active.metadataJson);
    const tier = tierForProductCode(productCode);
    return fullAccessStatus({
      userId,
      tier: tier === "free" ? "monthly" : tier,
      reason: tier === "trial" ? "trial_active" : "paid_active",
      maxForecastHours: settings.fullMaxForecastHours,
      entitlement: active,
    });
  }

  const expired = latestByExpiration(
    entitlements.filter(
      (entitlement) => entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() <= now.getTime(),
    ),
  );
  return freeStatus({
    userId,
    maxForecastHours: settings.freeMaxForecastHours,
    reason: expired ? "expired" : "none",
    expiredProductCode: readProductCode(expired?.metadataJson),
  });
}

export function buildAccountAccessStatus(
  access: ForecastAccessStatus,
  options: { readonly now?: Date } = {},
): AccountAccessStatus {
  const now = options.now ?? new Date();
  const expiresAt = access.entitlementExpiresAt ? new Date(access.entitlementExpiresAt) : null;
  const remainingDays = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : null;
  return {
    ...access,
    currentPlanName: productNameForTier(access.tier),
    remainingDays,
    trialExpired:
      access.reason === "expired" && access.expiredProductCode === trialFullAccessProductCode,
    upgradeRequiredForFullAccess: !access.hasFullAccess,
    freeLimitMessage: upgradeRequiredMessage,
  };
}

export function upgradeRequiredResponse(access: ForecastAccessStatus) {
  return {
    error: "upgrade_required",
    message: upgradeRequiredMessage,
    access: {
      tier: access.tier,
      hasFullAccess: access.hasFullAccess,
      maxForecastHours: access.maxForecastHours,
      entitlementExpiresAt: access.entitlementExpiresAt ?? null,
    },
    required: {
      feature: fullForecastAccessEntitlementType,
      maxForecastHours: getForecastAccessSettings().fullMaxForecastHours,
    },
  };
}

export function checkForecastAccess(input: {
  readonly access: ForecastAccessStatus;
  readonly target: string;
  readonly useAiExplanation?: boolean;
  readonly forecastStart: Date;
  readonly forecastEnd: Date;
  readonly now?: Date;
}): ForecastAccessDecision {
  const now = input.now ?? new Date();
  const maxEnd = new Date(now.getTime() + input.access.maxForecastHours * 60 * 60 * 1000);

  if (!input.access.allowedTargets.includes(input.target)) {
    return { allowed: false, statusCode: 402, reason: "target_requires_upgrade" };
  }

  if (input.useAiExplanation && !input.access.canUseAiExplanation) {
    return { allowed: false, statusCode: 402, reason: "ai_requires_upgrade" };
  }

  if (!input.access.hasFullAccess) {
    if (input.forecastStart.getTime() > now.getTime() + accessClockSkewMs) {
      return { allowed: false, statusCode: 402, reason: "future_start_requires_upgrade" };
    }
    if (input.forecastEnd.getTime() > maxEnd.getTime() + accessClockSkewMs) {
      return { allowed: false, statusCode: 402, reason: "forecast_window_requires_upgrade" };
    }
    return { allowed: true };
  }

  if (input.access.tier !== "admin" && input.forecastEnd.getTime() > maxEnd.getTime() + accessClockSkewMs) {
    return { allowed: false, statusCode: 402, reason: "forecast_window_exceeds_plan" };
  }

  return { allowed: true };
}
