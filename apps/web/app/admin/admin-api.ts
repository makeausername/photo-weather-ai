import {
  loginServiceUnavailableMessage,
  sanitizeAuthErrorMessage,
} from "../../components/auth-errors";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValue }
  | readonly JsonValue[];

export type SafeSystemSetting = {
  readonly id: string;
  readonly key: string;
  readonly valueJson: JsonValue;
  readonly valueType: string;
  readonly group: string;
  readonly label: string;
  readonly description: string | null;
  readonly isPublic: boolean;
  readonly isSecret: boolean;
  readonly isEditable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type SafeProviderConfig = {
  readonly id: string;
  readonly providerType: string;
  readonly providerCode: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly priority: number;
  readonly configJson: JsonValue;
  readonly maskedSecretJson: JsonValue | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminLocation = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly province: string;
  readonly city: string;
  readonly district: string | null;
  readonly address: string | null;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly locationType: string;
  readonly source: string;
  readonly isVerified: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminGeoSearchResult = {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly province?: string;
  readonly city?: string;
  readonly district?: string;
  readonly address?: string;
  readonly coordinatesGcj02: {
    readonly latitude: number;
    readonly longitude: number;
    readonly system: "gcj02";
  };
  readonly coordinatesWgs84: {
    readonly latitude: number;
    readonly longitude: number;
    readonly system: "wgs84";
  };
  readonly source: string;
};

export type AdminAuditLog = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
};

export type AdminCalibrationTarget = "general" | "cloud_sea" | "glow" | "astro";

export type AdminForecastReplayResult = {
  readonly id: string;
  readonly replayRunId: string;
  readonly spotId: string | null;
  readonly locationKey: string | null;
  readonly locationName: string;
  readonly target: AdminCalibrationTarget;
  readonly forecastDate: string;
  readonly overallScore: number | null;
  readonly recommendationLabel: string | null;
  readonly dedicatedTripRecommendation: string | null;
  readonly nearbyObservationRecommendation: string | null;
  readonly bestWindowStart: string | null;
  readonly bestWindowEnd: string | null;
  readonly bestSubject: string | null;
  readonly whiteoutRiskScore: number | null;
  readonly precipitationRiskLevel: string | null;
  readonly transparencyGrade: string | null;
  readonly confidenceLabel: string | null;
  readonly createdAt: string;
};

export type AdminCalibrationComparison = {
  readonly replayResultId: string;
  readonly outcomeId?: string;
  readonly forecastDate: string;
  readonly target: AdminCalibrationTarget;
  readonly predictedClass: "recommended" | "cautious" | "nearby" | "not_recommended";
  readonly observedResult?: "success" | "partial" | "fail" | "unknown";
  readonly matchStatus:
    | "true_positive"
    | "true_negative"
    | "false_positive"
    | "false_negative"
    | "partial_match"
    | "unlabeled"
    | "unknown";
  readonly matchScore: number;
  readonly mismatchReasons: readonly string[];
};

export type AdminObservedOutcome = {
  readonly id: string;
  readonly spotId: string | null;
  readonly locationKey: string | null;
  readonly locationName: string;
  readonly latitudeWgs84: number | null;
  readonly longitudeWgs84: number | null;
  readonly target: AdminCalibrationTarget;
  readonly outcomeDate: string;
  readonly observationWindowStart: string | null;
  readonly observationWindowEnd: string | null;
  readonly observedResult: "success" | "partial" | "fail" | "unknown";
  readonly cloudSeaLevel: "none" | "weak" | "medium" | "strong" | "unknown" | null;
  readonly whiteoutLevel: "none" | "low" | "medium" | "high" | "unknown" | null;
  readonly sunriseGlowLevel: "none" | "weak" | "medium" | "strong" | "unknown" | null;
  readonly sunsetGlowLevel: "none" | "weak" | "medium" | "strong" | "unknown" | null;
  readonly astroVisibilityLevel: "none" | "weak" | "medium" | "strong" | "unknown" | null;
  readonly milkyWayVisibilityLevel: "none" | "weak" | "medium" | "strong" | "unknown" | null;
  readonly transparencyLevel: "poor" | "fair" | "good" | "excellent" | "unknown" | null;
  readonly rainImpactLevel: "none" | "low" | "medium" | "high" | "unknown" | null;
  readonly notes: string | null;
  readonly photoEvidenceUrl: string | null;
  readonly source: "admin_manual" | "user_feedback" | "imported";
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminCalibrationStats = {
  readonly id: string;
  readonly spotId: string | null;
  readonly locationKey: string;
  readonly locationName: string;
  readonly target: AdminCalibrationTarget;
  readonly ruleVersion: string | null;
  readonly sampleCount: number;
  readonly labeledCount: number;
  readonly successCount: number;
  readonly partialCount: number;
  readonly failCount: number;
  readonly hitCount: number;
  readonly partialHitCount: number;
  readonly falsePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly truePositiveCount: number;
  readonly trueNegativeCount: number;
  readonly hitRate: number;
  readonly falsePositiveRate: number;
  readonly falseNegativeRate: number;
  readonly whiteoutFalsePositiveRate: number | null;
  readonly bestWindowHitRate: number | null;
  readonly recommendedTripHitRate: number | null;
  readonly updatedAt: string;
  readonly summaryJson: JsonValue;
};

export type MockConnectionTestResult = {
  readonly success: boolean;
  readonly providerCode?: string;
  readonly providerNameZh?: string;
  readonly mode:
    | "mock"
    | "fixture"
    | "real"
    | "free"
    | "customer"
    | "config_check"
    | "professional";
  readonly connectionMode?: "mock" | "fixture" | "real";
  readonly modeZh?: string;
  readonly modeLabelZh?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly apiHost?: string;
  readonly endpoint?: string;
  readonly packages?: readonly string[];
  readonly statusCode?: number;
  readonly qweatherCode?: string;
  readonly location?: string;
  readonly sampleLocation?: string;
  readonly observedWeatherSummary?: string;
  readonly latencyMs?: number;
  readonly enabled?: boolean;
  readonly realCallEnabled?: boolean;
  readonly apiKeyPresent?: boolean;
  readonly attempted?: boolean;
  readonly configReady?: boolean;
  readonly error?: string;
  readonly errorCategory?: string;
  readonly missingFields?: readonly string[];
  readonly invalidFields?: readonly string[];
  readonly testedAt?: string;
  readonly providerType?: string;
  readonly messageZh?: string;
  readonly message: string;
};

export type AdminCdnProviderCode = "aliyun_cdn" | "tencent_cdn";

export type AdminCdnRefreshType = "file" | "directory" | "url" | "path";

export type AdminCdnRefreshRequest = {
  readonly providerCode?: AdminCdnProviderCode;
  readonly urls?: readonly string[];
  readonly directories?: readonly string[];
  readonly refreshType?: AdminCdnRefreshType;
};

export type AdminCdnPrefetchRequest = {
  readonly providerCode?: AdminCdnProviderCode;
  readonly urls: readonly string[];
};

export type AdminCdnOperationResult = {
  readonly success: boolean;
  readonly providerCode: AdminCdnProviderCode;
  readonly providerNameZh: string;
  readonly mode: "mock" | "config_check" | "real";
  readonly taskId?: string;
  readonly providerTaskId?: string;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly messageZh: string;
  readonly sanitizedError?: string;
};

export type SafeAdminUser = {
  readonly id: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastLoginAt: string | null;
};

export type SafeAccountProfile = {
  readonly id: string;
  readonly userId: string;
  readonly avatarUrl: string | null;
  readonly preferredUnits: string;
  readonly preferredLanguage: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AccountRole =
  | string
  | {
      readonly id?: string;
      readonly code?: string | null;
      readonly name?: string | null;
      readonly displayName?: string | null;
      readonly display_name?: string | null;
      readonly description?: string | null;
    };

export type AdminAuthSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: SafeAdminUser;
  readonly profile: SafeAccountProfile | null;
  readonly roles: readonly AccountRole[];
  readonly roleCodes?: readonly string[];
  readonly permissions: readonly string[];
  readonly isAdmin: boolean;
};

export type AdminRole = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly displayName: string | null;
  readonly description: string | null;
};

export type AdminUserOperationalSummary = {
  readonly orderCount: number;
  readonly paidOrderCount: number;
  readonly totalPaidAmountCents: number;
  readonly currentCreditBalance: number;
  readonly forecastHistoryCount: number;
  readonly activeSessionCount: number;
  readonly entitlementCount: number;
};

export type AdminUserListItem = SafeAdminUser &
  AdminUserOperationalSummary & {
    readonly emailMasked: string | null;
    readonly phoneMasked: string | null;
    readonly roles: readonly AdminRole[];
    readonly roleCodes: readonly string[];
    readonly permissions: readonly string[];
  };

export type AdminUserListResponse = {
  readonly items: readonly AdminUserListItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly summary: {
    readonly totalUsers: number;
    readonly activeUsers: number;
    readonly disabledUsers: number;
    readonly todayNewUsers: number;
    readonly paidUsers: number;
    readonly totalPaidAmountCents: number;
  };
};

export type AdminUserOrderItem = {
  readonly orderNo: string;
  readonly provider: string;
  readonly productCode: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: string;
  readonly paidAt: string | null;
  readonly expiresAt: string | null;
  readonly providerTradeNo: string | null;
  readonly entitlementGrantedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminUserForecastHistoryItem = {
  readonly id: string;
  readonly locationName: string;
  readonly target: string;
  readonly horizon: string;
  readonly timezone: string | null;
  readonly overallScore: number | null;
  readonly recommendationLabel: string | null;
  readonly bestWindowStart: string | null;
  readonly bestWindowEnd: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminUserEntitlementItem = {
  readonly id: string;
  readonly orderId: string;
  readonly type: string;
  readonly quantity: number;
  readonly remainingQuantity: number | null;
  readonly startsAt: string;
  readonly expiresAt: string | null;
  readonly grantedAt: string;
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
  readonly createdAt: string;
};

export type AdminUserSessionItem = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly active: boolean;
};

export type AdminUserAuditLogItem = {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
};

export type AdminUserDetail = {
  readonly profile: SafeAdminUser;
  readonly emailMasked: string | null;
  readonly phoneMasked: string | null;
  readonly roles: readonly AdminRole[];
  readonly roleCodes: readonly string[];
  readonly permissions: readonly string[];
  readonly accountStatus: string;
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

export type AdminPaymentUserSummary = Pick<
  SafeAdminUser,
  "id" | "email" | "phone" | "displayName" | "status" | "createdAt"
>;

export type AdminPaymentOrderListItem = {
  readonly orderNo: string;
  readonly user: AdminPaymentUserSummary | null;
  readonly provider: "mock" | "wechat_pay" | "alipay";
  readonly productCode: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: string;
  readonly paidAt: string | null;
  readonly expiresAt: string | null;
  readonly providerTradeNo: string | null;
  readonly entitlementGrantedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AdminPaymentOrderListResponse = {
  readonly items: readonly AdminPaymentOrderListItem[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
  };
  readonly summary: {
    readonly totalOrders: number;
    readonly paidOrders: number;
    readonly unpaidOrders: number;
    readonly failedOrCanceledOrders: number;
    readonly totalRevenueCents: number;
    readonly todayRevenueCents: number;
  };
};

export type AdminPaymentNotificationItem = {
  readonly id: string;
  readonly provider: "mock" | "wechat_pay" | "alipay";
  readonly orderNo: string | null;
  readonly providerTradeNo: string | null;
  readonly signatureVerified: boolean;
  readonly status: string;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly processedAt: string | null;
};

export type AdminOrderTimelineItem = {
  readonly at: string;
  readonly type: "created" | "notification" | "paid" | "entitlement" | "status";
  readonly title: string;
  readonly status: string;
  readonly description: string | null;
};

export type AdminOrderEntitlementItem = {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string;
  readonly type: string;
  readonly quantity: number;
  readonly remainingQuantity: number | null;
  readonly startsAt: string;
  readonly expiresAt: string | null;
  readonly grantedAt: string;
  readonly metadataJson: JsonValue | null;
};

export type AdminOrderCreditLedgerItem = {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string | null;
  readonly entitlementId: string | null;
  readonly delta: number;
  readonly balanceAfter: number;
  readonly reason: string;
  readonly metadataJson: JsonValue | null;
  readonly createdAt: string;
};

export type AdminPaymentOrderDetail = {
  readonly order: AdminPaymentOrderListItem & {
    readonly id: string;
    readonly metadataJson: JsonValue | null;
    readonly adminNote: string | null;
  };
  readonly user: AdminPaymentUserSummary | null;
  readonly product: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly description: string | null;
    readonly amountCents: number;
    readonly currency: string;
    readonly credits: number;
    readonly durationDays: number | null;
  } | null;
  readonly timeline: readonly AdminOrderTimelineItem[];
  readonly notifications: readonly AdminPaymentNotificationItem[];
  readonly entitlements: readonly AdminOrderEntitlementItem[];
  readonly creditLedger: readonly AdminOrderCreditLedgerItem[];
  readonly auditLogs: readonly AdminUserAuditLogItem[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const accessTokenKey = "photo_weather_admin_access_token";
const refreshTokenKey = "photo_weather_admin_refresh_token";
export const adminSessionExpiredMessage = "登录状态已失效，请重新登录后台后再测试。";

type AdminApiErrorPayload = {
  readonly error?: string;
  readonly message?: string;
  readonly issues?: readonly { readonly message?: string }[];
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getStoredAdminTokens(): {
  readonly accessToken: string;
  readonly refreshToken: string;
} | null {
  if (!isBrowser()) {
    return null;
  }

  const accessToken = window.localStorage.getItem(accessTokenKey);
  const refreshToken = window.localStorage.getItem(refreshTokenKey);

  return accessToken && refreshToken ? { accessToken, refreshToken } : null;
}

export function storeAdminSession(session: AdminAuthSession): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(accessTokenKey, session.accessToken);
  window.localStorage.setItem(refreshTokenKey, session.refreshToken);
}

export function clearAdminSession(): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(accessTokenKey);
  window.localStorage.removeItem(refreshTokenKey);
}

function redirectToLogin(): void {
  if (!isBrowser() || window.location.pathname === "/admin/login") {
    return;
  }

  const returnTo = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/admin/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function roleValueMatchesAdmin(value: unknown): boolean {
  return typeof value === "string" && ["admin", "super_admin"].includes(value.trim().toLowerCase());
}

export function sessionHasAdminAccess(
  session:
    | {
        readonly isAdmin?: boolean;
        readonly roles?: readonly AccountRole[];
        readonly roleCodes?: readonly string[];
        readonly permissions?: readonly string[];
      }
    | null
    | undefined,
): boolean {
  if (!session) {
    return false;
  }

  if (session.isAdmin === true || session.permissions?.includes("admin.manage")) {
    return true;
  }

  if (session.roleCodes?.some(roleValueMatchesAdmin)) {
    return true;
  }

  return Boolean(
    session.roles?.some((role) =>
      typeof role === "string"
        ? roleValueMatchesAdmin(role)
        : roleValueMatchesAdmin(role.code) || roleValueMatchesAdmin(role.name),
    ),
  );
}

function formatAdminApiError(errorText: string, status: number): string {
  if (!errorText) {
    return `后台接口请求失败，状态码 ${status}`;
  }

  try {
    const payload = JSON.parse(errorText) as AdminApiErrorPayload;
    if (payload.message) {
      return sanitizeAuthErrorMessage(payload.message, `后台接口请求失败，状态码 ${status}`);
    }

    const issueMessage = payload.issues?.find((issue) => issue.message)?.message;
    if (issueMessage) {
      return sanitizeAuthErrorMessage(issueMessage, `后台接口请求失败，状态码 ${status}`);
    }

    if (payload.error) {
      return `后台接口请求失败：${payload.error}`;
    }
  } catch {
    return sanitizeAuthErrorMessage(errorText, `后台接口请求失败，状态码 ${status}`);
  }

  return errorText;
}

function formatAdminLoginError(errorText: string): string {
  if (!errorText) {
    return loginServiceUnavailableMessage;
  }

  try {
    const payload = JSON.parse(errorText) as AdminApiErrorPayload;
    if (payload.message) {
      return sanitizeAuthErrorMessage(payload.message, loginServiceUnavailableMessage);
    }

    const issueMessage = payload.issues?.find((issue) => issue.message)?.message;
    if (issueMessage) {
      return sanitizeAuthErrorMessage(issueMessage, loginServiceUnavailableMessage);
    }
  } catch {
    return sanitizeAuthErrorMessage(errorText, loginServiceUnavailableMessage);
  }

  return loginServiceUnavailableMessage;
}

export function createProviderConnectionTestRequestInit(): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({}),
  };
}

export async function refreshCdnCache(
  input: AdminCdnRefreshRequest,
): Promise<AdminCdnOperationResult> {
  return adminApiFetch<AdminCdnOperationResult>("/admin/cdn/refresh", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function prefetchCdnUrls(
  input: AdminCdnPrefetchRequest,
): Promise<AdminCdnOperationResult> {
  return adminApiFetch<AdminCdnOperationResult>("/admin/cdn/prefetch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

async function refreshAdminSession(): Promise<boolean> {
  const tokens = getStoredAdminTokens();
  if (!tokens) {
    return false;
  }

  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!response.ok) {
    clearAdminSession();
    return false;
  }

  storeAdminSession((await response.json()) as AdminAuthSession);
  return true;
}

export async function adminApiFetch<TResponse>(
  path: string,
  init: RequestInit = {},
  options: { readonly retryOnUnauthorized?: boolean } = { retryOnUnauthorized: true },
): Promise<TResponse> {
  const tokens = getStoredAdminTokens();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && options.retryOnUnauthorized !== false) {
    const refreshed = await refreshAdminSession();
    if (refreshed) {
      return adminApiFetch<TResponse>(path, init, { retryOnUnauthorized: false });
    }

    redirectToLogin();
    throw new Error(adminSessionExpiredMessage);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatAdminApiError(errorText, response.status));
  }

  return (await response.json()) as TResponse;
}

export async function loginAdmin(email: string, password: string): Promise<AdminAuthSession> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(formatAdminLoginError(errorText));
  }

  const session = (await response.json()) as AdminAuthSession;
  storeAdminSession(session);
  return session;
}

export async function getCurrentAdmin(): Promise<
  Omit<AdminAuthSession, "accessToken" | "refreshToken">
> {
  return adminApiFetch<Omit<AdminAuthSession, "accessToken" | "refreshToken">>("/auth/me");
}

export async function logoutAdmin(): Promise<void> {
  const tokens = getStoredAdminTokens();
  try {
    await fetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tokens ? { refreshToken: tokens.refreshToken } : {}),
    });
  } finally {
    clearAdminSession();
    if (isBrowser()) {
      window.location.href = "/admin/login";
    }
  }
}

function queryString(params: Record<string, string | number | boolean | null | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }
  const value = searchParams.toString();
  return value ? `?${value}` : "";
}

export async function fetchAdminUsers(params: {
  readonly q?: string;
  readonly status?: string;
  readonly role?: string;
  readonly hasOrders?: string;
  readonly hasCredits?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
} = {}): Promise<AdminUserListResponse> {
  return adminApiFetch<AdminUserListResponse>(`/admin/users${queryString(params)}`);
}

export async function fetchAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const response = await adminApiFetch<{ readonly user: AdminUserDetail }>(
    `/admin/users/${encodeURIComponent(userId)}`,
  );
  return response.user;
}

export async function createAdminUser(input: {
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly password?: string;
  readonly generatePassword?: boolean;
  readonly displayName?: string | null;
  readonly roleCodes?: readonly string[];
}): Promise<{ readonly user: AdminUserDetail; readonly generatedPassword: string | null }> {
  return adminApiFetch("/admin/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminUser(
  userId: string,
  input: {
    readonly email?: string | null;
    readonly phone?: string | null;
    readonly displayName?: string | null;
    readonly status?: "active" | "disabled";
  },
): Promise<AdminUserDetail> {
  const response = await adminApiFetch<{ readonly user: AdminUserDetail }>(
    `/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return response.user;
}

export async function disableAdminUser(
  userId: string,
  revokeSessions = true,
): Promise<{ readonly user: AdminUserDetail; readonly revokedSessionCount: number }> {
  return adminApiFetch(`/admin/users/${encodeURIComponent(userId)}/disable`, {
    method: "POST",
    body: JSON.stringify({ revokeSessions }),
  });
}

export async function enableAdminUser(userId: string): Promise<AdminUserDetail> {
  const response = await adminApiFetch<{ readonly user: AdminUserDetail }>(
    `/admin/users/${encodeURIComponent(userId)}/enable`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return response.user;
}

export async function resetAdminUserPassword(
  userId: string,
  input: { readonly temporaryPassword?: string; readonly generatePassword?: boolean } = {
    generatePassword: true,
  },
): Promise<{
  readonly user: AdminUserDetail;
  readonly generatedPassword: string | null;
  readonly revokedSessionCount: number;
}> {
  return adminApiFetch(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeAdminUserSessions(
  userId: string,
): Promise<{ readonly revokedSessionCount: number; readonly sessions: readonly AdminUserSessionItem[] }> {
  return adminApiFetch(`/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function updateAdminUserRoles(
  userId: string,
  roleCodes: readonly string[],
): Promise<AdminUserDetail> {
  const response = await adminApiFetch<{ readonly user: AdminUserDetail }>(
    `/admin/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "PATCH",
      body: JSON.stringify({ roleCodes }),
    },
  );
  return response.user;
}

export async function fetchAdminOrders(params: {
  readonly q?: string;
  readonly status?: string;
  readonly provider?: string;
  readonly productCode?: string;
  readonly userId?: string;
  readonly paid?: string;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly page?: number;
  readonly pageSize?: number;
  readonly sort?: string;
} = {}): Promise<AdminPaymentOrderListResponse> {
  return adminApiFetch<AdminPaymentOrderListResponse>(`/admin/orders${queryString(params)}`);
}

export async function fetchAdminOrderDetail(orderNo: string): Promise<AdminPaymentOrderDetail> {
  const response = await adminApiFetch<{ readonly order: AdminPaymentOrderDetail }>(
    `/admin/orders/${encodeURIComponent(orderNo)}`,
  );
  return response.order;
}

export async function updateAdminOrder(
  orderNo: string,
  input: { readonly adminNote?: string | null },
): Promise<AdminPaymentOrderDetail> {
  const response = await adminApiFetch<{ readonly order: AdminPaymentOrderDetail }>(
    `/admin/orders/${encodeURIComponent(orderNo)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
  return response.order;
}

export async function cancelAdminOrder(orderNo: string): Promise<AdminPaymentOrderDetail> {
  const response = await adminApiFetch<{ readonly order: AdminPaymentOrderDetail }>(
    `/admin/orders/${encodeURIComponent(orderNo)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return response.order;
}

export async function closeAdminOrder(orderNo: string): Promise<AdminPaymentOrderDetail> {
  const response = await adminApiFetch<{ readonly order: AdminPaymentOrderDetail }>(
    `/admin/orders/${encodeURIComponent(orderNo)}/close`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return response.order;
}

export async function markAdminOrderPaid(orderNo: string): Promise<{
  readonly success: boolean;
  readonly order: AdminPaymentOrderDetail;
  readonly entitlementGranted: boolean;
}> {
  return adminApiFetch(`/admin/orders/${encodeURIComponent(orderNo)}/mark-paid`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
