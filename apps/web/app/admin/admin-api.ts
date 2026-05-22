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

export type AdminPhotoSpot = {
  readonly id: string;
  readonly locationId: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly latitudeGcj02: number;
  readonly longitudeGcj02: number;
  readonly latitudeWgs84: number;
  readonly longitudeWgs84: number;
  readonly elevation: number | null;
  readonly viewDirection: string;
  readonly bestForSunrise: boolean;
  readonly bestForSunset: boolean;
  readonly bestForCloudSea: boolean;
  readonly bestForStars: boolean;
  readonly bestForMilkyWay: boolean;
  readonly bestForSnow: boolean;
  readonly accessNote: string | null;
  readonly trafficNote: string | null;
  readonly safetyNote: string | null;
  readonly riskNote: string | null;
  readonly isHot: boolean;
  readonly isVerified: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly location?: AdminLocation;
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

export type MockConnectionTestResult = {
  readonly success: boolean;
  readonly mode: "mock" | "fixture" | "real";
  readonly providerType?: string;
  readonly providerCode?: string;
  readonly message: string;
};

export type SafeAdminUser = {
  readonly id: string;
  readonly email: string;
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

export type AdminAuthSession = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: SafeAdminUser;
  readonly profile: SafeAccountProfile | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly isAdmin: boolean;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const accessTokenKey = "photo_weather_admin_access_token";
const refreshTokenKey = "photo_weather_admin_refresh_token";

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

function formatAdminApiError(errorText: string, status: number): string {
  if (!errorText) {
    return `后台接口请求失败，状态码 ${status}`;
  }

  try {
    const payload = JSON.parse(errorText) as AdminApiErrorPayload;
    if (payload.message) {
      return payload.message;
    }

    const issueMessage = payload.issues?.find((issue) => issue.message)?.message;
    if (issueMessage) {
      return issueMessage;
    }

    if (payload.error) {
      return `后台接口请求失败：${payload.error}`;
    }
  } catch {
    return errorText;
  }

  return errorText;
}

export function createProviderConnectionTestRequestInit(): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify({}),
  };
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
    throw new Error(errorText || "后台登录失败，请检查邮箱和密码。");
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
