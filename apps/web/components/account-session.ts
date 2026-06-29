import {
  clearAdminSession,
  getStoredAdminTokens,
  sessionHasAdminAccess,
  storeAdminSession,
  type AccountRole,
  type AdminAuthSession,
  type JsonValue,
  type SafeAccountProfile,
  type SafeAdminUser,
} from "../app/admin/admin-api";
import type { ForecastHorizon, ForecastQueryInput, ForecastTarget } from "@photo-weather/shared";
import { loginServiceUnavailableMessage, sanitizeAuthErrorMessage } from "./auth-errors";
import { publicApiFetch, requiredAuthApiFetch, retryableServiceMessage } from "./api-client";

export type PublicAccountSession = {
  readonly user: SafeAdminUser;
  readonly profile: SafeAccountProfile | null;
  readonly roles: readonly AccountRole[];
  readonly roleCodes?: readonly string[];
  readonly permissions: readonly string[];
  readonly isAdmin: boolean;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type RegisterVerificationChannel = "email" | "sms";

export type CaptchaProviderCode = "tencent_captcha";

export type CaptchaToken = {
  readonly providerCode: CaptchaProviderCode;
  readonly ticket: string;
  readonly randstr: string;
};

export type CaptchaPublicConfig = {
  readonly enabled: boolean;
  readonly providerCode: CaptchaProviderCode;
  readonly captchaAppId: string;
  readonly sdkUrl: string;
  readonly enforceOnLogin: boolean;
  readonly enforceOnRegisterSendCode: boolean;
  readonly enforceOnRegisterConfirm: boolean;
  readonly enforceOnAccountBinding: boolean;
};

const disabledCaptchaConfig: CaptchaPublicConfig = {
  enabled: false,
  providerCode: "tencent_captcha",
  captchaAppId: "",
  sdkUrl: "https://turing.captcha.qcloud.com/TCaptcha.js",
  enforceOnLogin: false,
  enforceOnRegisterSendCode: false,
  enforceOnRegisterConfirm: false,
  enforceOnAccountBinding: false,
};

export type SendRegisterVerificationCodeResponse = {
  readonly success: boolean;
  readonly channel: RegisterVerificationChannel;
  readonly targetMasked: string;
  readonly expiresInSeconds: number;
  readonly resendAfterSeconds: number;
  readonly mode: "mock" | "real" | "config_check";
  readonly mockCode?: string;
};

export type AccountVerificationCodeResponse = {
  readonly success: boolean;
  readonly channel: RegisterVerificationChannel;
  readonly targetMasked: string;
  readonly expiresInSeconds: number;
  readonly resendAfterSeconds: number;
  readonly mode: "mock" | "real" | "config_check";
  readonly mockCode?: string;
};

export type AccountForecastHistorySummary = {
  readonly overallScore?: number | null;
  readonly recommendationLabel?: string | null;
  readonly bestWindowStart?: string | null;
  readonly bestWindowEnd?: string | null;
};

export type AccountForecastHistoryRecord = {
  readonly id: string;
  readonly locationName: string;
  readonly target: ForecastTarget;
  readonly horizon: ForecastHorizon | string;
  readonly timezone: string | null;
  readonly latitudeGcj02: number | null;
  readonly longitudeGcj02: number | null;
  readonly latitudeWgs84: number | null;
  readonly longitudeWgs84: number | null;
  readonly elevationMeters: number | null;
  readonly locationId: string | null;
  readonly photoSpotId: string | null;
  readonly locked?: boolean;
  readonly upgradeRequiredMessage?: string | null;
  readonly queryJson: JsonValue;
  readonly resultSummaryJson: JsonValue | null;
  readonly overallScore: number | null;
  readonly recommendationLabel: string | null;
  readonly bestWindowStart: string | null;
  readonly bestWindowEnd: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AccountBillingOrderRecord = {
  readonly orderNo: string;
  readonly provider: "wechat_pay" | "alipay" | "mock";
  readonly amountCents: number;
  readonly currency: string;
  readonly productCode: string;
  readonly status: "created" | "pending" | "paid" | "closed" | "canceled" | "failed" | "refunded";
  readonly paidAt: string | null;
  readonly expiresAt: string | null;
  readonly providerTradeNo: string | null;
  readonly entitlementGrantedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type PublicBillingProduct = {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly priceText: string;
  readonly durationDays: number | null;
  readonly durationText: string;
  readonly recommended: boolean;
  readonly badgeText: string | null;
  readonly featureBullets: readonly string[];
  readonly sortOrder: number;
};

export type BillingPaymentProvider = "wechat_pay" | "alipay";

export type PublicBillingPaymentMethod = {
  readonly provider: BillingPaymentProvider;
  readonly label: string;
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly recommended: boolean;
  readonly unavailableReason?: string | null;
};

export type BillingCheckoutPayload =
  | { readonly kind: "mock"; readonly message: string }
  | { readonly kind: "qr_code"; readonly codeUrl: string; readonly message: string }
  | { readonly kind: "redirect_url"; readonly redirectUrl: string; readonly message: string }
  | {
      readonly kind: "form_post";
      readonly actionUrl: string;
      readonly method: "POST";
      readonly charset: string;
      readonly fields: Record<string, string>;
      readonly message: string;
    }
  | { readonly kind: "form_html"; readonly formHtml: string; readonly message: string };

export type CreateBillingOrderResponse = {
  readonly order: AccountBillingOrderRecord;
  readonly checkout?: BillingCheckoutPayload;
};

export type AccountEntitlementRecord = {
  readonly id: string;
  readonly type: "forecast_credit" | "subscription" | "feature_unlock" | "full_forecast_access";
  readonly quantity: number;
  readonly remainingQuantity: number | null;
  readonly startsAt: string;
  readonly expiresAt: string | null;
  readonly grantedAt: string;
};

export type AccountAccessStatus = {
  readonly userId: string | null;
  readonly tier: "guest" | "free" | "trial" | "monthly" | "quarterly" | "yearly" | "admin";
  readonly hasFullAccess: boolean;
  readonly maxForecastHours: number;
  readonly allowedTargets: readonly string[];
  readonly canViewFullHistory: boolean;
  readonly activeEntitlementId?: string;
  readonly activeProductCode?: string;
  readonly entitlementExpiresAt?: string;
  readonly currentPlanName: string;
  readonly remainingDays: number | null;
  readonly trialExpired: boolean;
  readonly upgradeRequiredForFullAccess: boolean;
  readonly freeLimitMessage: string;
  readonly reason: string;
};

type PublicApiErrorPayload = {
  readonly error?: string;
  readonly message?: string;
  readonly issues?: readonly { readonly message?: string }[];
};

const publicSessionExpiredMessage = "登录状态已过期，请重新登录。";

function isSessionAuthErrorCode(error: string | undefined): boolean {
  return (
    error === "invalid_refresh_token" ||
    error === "token_expired" ||
    error === "invalid_session" ||
    error === "invalid_token" ||
    error === "missing_token"
  );
}

export function shouldShowAdminEntry(
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
  return sessionHasAdminAccess(session);
}

async function readPublicApiError(response: Response, fallback: string): Promise<string> {
  const errorText = await response.text();
  if (!errorText) {
    return fallback;
  }

  try {
    const payload = JSON.parse(errorText) as PublicApiErrorPayload;
    if (isSessionAuthErrorCode(payload.error)) {
      return publicSessionExpiredMessage;
    }

    if (payload.message) {
      return sanitizeAuthErrorMessage(payload.message, fallback);
    }

    const issueMessage = payload.issues?.find((issue) => issue.message)?.message;
    if (issueMessage) {
      return sanitizeAuthErrorMessage(issueMessage, fallback);
    }
  } catch {
    return sanitizeAuthErrorMessage(errorText, fallback);
  }

  return fallback;
}

export async function getCaptchaPublicConfig(): Promise<CaptchaPublicConfig> {
  const response = await fetch(`${apiBaseUrl}/captcha/config`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return disabledCaptchaConfig;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    readonly captcha?: Partial<CaptchaPublicConfig>;
  };
  const captcha = payload.captcha;
  if (!captcha || captcha.providerCode !== "tencent_captcha") {
    return disabledCaptchaConfig;
  }

  return {
    ...disabledCaptchaConfig,
    enabled: captcha.enabled === true,
    providerCode: "tencent_captcha",
    captchaAppId: typeof captcha.captchaAppId === "string" ? captcha.captchaAppId : "",
    sdkUrl:
      typeof captcha.sdkUrl === "string" && captcha.sdkUrl
        ? captcha.sdkUrl
        : disabledCaptchaConfig.sdkUrl,
    enforceOnLogin: captcha.enforceOnLogin === true,
    enforceOnRegisterSendCode: captcha.enforceOnRegisterSendCode === true,
    enforceOnRegisterConfirm: captcha.enforceOnRegisterConfirm === true,
    enforceOnAccountBinding: captcha.enforceOnAccountBinding === true,
  };
}

async function accountApiFetch<TResponse>(
  path: string,
  init: RequestInit = {},
  options: { readonly retryOnUnauthorized?: boolean } = { retryOnUnauthorized: true },
): Promise<TResponse> {
  return requiredAuthApiFetch<TResponse>(path, init, {
    retryOnUnauthorized: options.retryOnUnauthorized,
    fallbackMessage: retryableServiceMessage,
  });
}

export async function getCurrentAccountSession(): Promise<PublicAccountSession | null> {
  if (!getStoredAdminTokens()) {
    return null;
  }

  try {
    return await requiredAuthApiFetch<PublicAccountSession>(
      "/auth/me",
      {},
      {
        fallbackMessage: publicSessionExpiredMessage,
      },
    );
  } catch {
    return null;
  }
}

export async function loginPublicAccount(
  identifier: string,
  password: string,
  captcha?: CaptchaToken,
): Promise<PublicAccountSession> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identifier, password, ...(captcha ? { captcha } : {}) }),
  });

  if (!response.ok) {
    throw new Error(await readPublicApiError(response, loginServiceUnavailableMessage));
  }

  const session = (await response.json()) as AdminAuthSession;
  storeAdminSession(session);
  return session;
}

export async function sendRegisterVerificationCode(input: {
  readonly channel: RegisterVerificationChannel;
  readonly target: string;
  readonly captcha?: CaptchaToken;
}): Promise<SendRegisterVerificationCodeResponse> {
  const response = await fetch(`${apiBaseUrl}/auth/register/send-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const fallback =
      input.channel === "email"
        ? "邮件服务暂不可用，请稍后重试。"
        : "短信服务暂不可用，请稍后重试。";
    throw new Error(await readPublicApiError(response, fallback));
  }

  return (await response.json()) as SendRegisterVerificationCodeResponse;
}

export async function confirmRegisterPublicAccount(input: {
  readonly channel: RegisterVerificationChannel;
  readonly target: string;
  readonly code: string;
  readonly password: string;
  readonly displayName?: string;
  readonly captcha?: CaptchaToken;
}): Promise<PublicAccountSession> {
  const response = await fetch(`${apiBaseUrl}/auth/register/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await readPublicApiError(response, "注册失败，请检查输入后重试。"));
  }

  return (await response.json()) as PublicAccountSession;
}

export async function registerPublicAccount(input: {
  readonly channel: RegisterVerificationChannel;
  readonly target: string;
  readonly code: string;
  readonly password: string;
  readonly displayName?: string;
  readonly captcha?: CaptchaToken;
}): Promise<PublicAccountSession> {
  return confirmRegisterPublicAccount(input);
}

export async function logoutPublicAccount(): Promise<void> {
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
  }
}

export async function changeAccountPassword(input: {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly confirmNewPassword: string;
}): Promise<PublicAccountSession> {
  const tokens = getStoredAdminTokens();
  return accountApiFetch<PublicAccountSession>("/account/change-password", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      currentRefreshToken: tokens?.refreshToken,
    }),
  });
}

export async function sendAccountEmailCode(input: {
  readonly email: string;
}): Promise<AccountVerificationCodeResponse> {
  return accountApiFetch<AccountVerificationCodeResponse>("/account/email/send-code", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function confirmAccountEmail(input: {
  readonly email: string;
  readonly code: string;
  readonly currentPassword: string;
}): Promise<PublicAccountSession> {
  return accountApiFetch<PublicAccountSession>("/account/email/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function sendAccountPhoneCode(input: {
  readonly phone: string;
}): Promise<AccountVerificationCodeResponse> {
  return accountApiFetch<AccountVerificationCodeResponse>("/account/phone/send-code", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function confirmAccountPhone(input: {
  readonly phone: string;
  readonly code: string;
  readonly currentPassword: string;
}): Promise<PublicAccountSession> {
  return accountApiFetch<PublicAccountSession>("/account/phone/confirm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deletePublicAccount(input: {
  readonly currentPassword: string;
  readonly confirmation: boolean;
}): Promise<void> {
  await accountApiFetch<{ readonly success: boolean }>("/account/delete", {
    method: "POST",
    body: JSON.stringify(input),
  });
  clearAdminSession();
}

export async function listAccountForecastHistory(
  input: {
    readonly limit?: number;
  } = {},
): Promise<readonly AccountForecastHistoryRecord[]> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await accountApiFetch<{
    readonly items: readonly AccountForecastHistoryRecord[];
  }>(`/account/forecast-history${suffix}`);
  return response.items;
}

export async function listAccountBillingOrders(
  input: {
    readonly limit?: number;
  } = {},
): Promise<readonly AccountBillingOrderRecord[]> {
  const params = new URLSearchParams();
  if (input.limit) {
    params.set("limit", String(input.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const response = await accountApiFetch<{
    readonly items: readonly AccountBillingOrderRecord[];
  }>(`/billing/orders${suffix}`);
  return response.items;
}

export async function listPublicBillingProducts(): Promise<readonly PublicBillingProduct[]> {
  const payload = await publicApiFetch<{
    readonly products?: readonly PublicBillingProduct[];
  }>(
    "/billing/products",
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
    {
      fallbackMessage: retryableServiceMessage,
    },
  );
  return payload.products ?? [];
}

function isBillingPaymentProvider(value: unknown): value is BillingPaymentProvider {
  return value === "wechat_pay" || value === "alipay";
}

export async function listPublicBillingPaymentMethods(): Promise<
  readonly PublicBillingPaymentMethod[]
> {
  const payload = await publicApiFetch<{
    readonly methods?: readonly PublicBillingPaymentMethod[];
  }>(
    "/billing/payment-methods",
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
    {
      fallbackMessage: retryableServiceMessage,
    },
  );
  return (payload.methods ?? []).filter(
    (method) =>
      isBillingPaymentProvider(method.provider) &&
      method.enabled === true &&
      method.ready === true,
  );
}

export async function createBillingOrder(input: {
  readonly productCode: string;
  readonly provider: BillingPaymentProvider;
  readonly clientMode?: string;
  readonly returnUrl?: string;
}): Promise<CreateBillingOrderResponse> {
  return accountApiFetch<CreateBillingOrderResponse>("/billing/orders", {
    method: "POST",
    body: JSON.stringify({
      productCode: input.productCode,
      provider: input.provider,
      ...(input.clientMode ? { clientMode: input.clientMode } : {}),
      ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
    }),
  });
}

export async function getBillingOrder(orderNo: string): Promise<AccountBillingOrderRecord> {
  const response = await accountApiFetch<{ readonly order: AccountBillingOrderRecord }>(
    `/billing/orders/${encodeURIComponent(orderNo)}`,
  );
  return response.order;
}

export async function listAccountEntitlements(): Promise<readonly AccountEntitlementRecord[]> {
  const response = await accountApiFetch<{
    readonly items: readonly AccountEntitlementRecord[];
  }>("/billing/entitlements");
  return response.items;
}

export async function getAccountAccess(): Promise<AccountAccessStatus> {
  return accountApiFetch<AccountAccessStatus>("/account/access");
}

export async function saveForecastHistory(input: {
  readonly query: ForecastQueryInput;
  readonly resultSummary: AccountForecastHistorySummary;
}): Promise<AccountForecastHistoryRecord | null> {
  if (!getStoredAdminTokens()) {
    return null;
  }

  return accountApiFetch<AccountForecastHistoryRecord>("/account/forecast-history", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteAccountForecastHistory(id: string): Promise<void> {
  await accountApiFetch<{ readonly success: boolean }>(
    `/account/forecast-history/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
