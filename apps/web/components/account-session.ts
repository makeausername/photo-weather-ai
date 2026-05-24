import {
  clearAdminSession,
  getStoredAdminTokens,
  storeAdminSession,
  type AdminAuthSession,
  type SafeAccountProfile,
  type SafeAdminUser,
} from "../app/admin/admin-api";
import { loginServiceUnavailableMessage, sanitizeAuthErrorMessage } from "./auth-errors";

export type PublicAccountSession = {
  readonly user: SafeAdminUser;
  readonly profile: SafeAccountProfile | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly isAdmin: boolean;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type PublicApiErrorPayload = {
  readonly error?: string;
  readonly message?: string;
  readonly issues?: readonly { readonly message?: string }[];
};

export function shouldShowAdminEntry(
  session:
    | {
        readonly isAdmin?: boolean;
        readonly roles?: readonly string[];
        readonly permissions?: readonly string[];
      }
    | null
    | undefined,
): boolean {
  const roles = new Set(session?.roles ?? []);
  return (
    Boolean(session?.isAdmin) ||
    Boolean(session?.permissions?.includes("admin.manage")) ||
    roles.has("admin") ||
    roles.has("super_admin")
  );
}

async function readPublicApiError(response: Response, fallback: string): Promise<string> {
  const errorText = await response.text();
  if (!errorText) {
    return fallback;
  }

  try {
    const payload = JSON.parse(errorText) as PublicApiErrorPayload;
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

async function refreshCurrentAccountSession(): Promise<PublicAccountSession | null> {
  const tokens = getStoredAdminTokens();
  if (!tokens) {
    return null;
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
    return null;
  }

  const session = (await response.json()) as AdminAuthSession;
  storeAdminSession(session);
  return session;
}

export async function getCurrentAccountSession(): Promise<PublicAccountSession | null> {
  const tokens = getStoredAdminTokens();
  if (!tokens) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/auth/me`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  });

  if (response.status === 401) {
    return refreshCurrentAccountSession();
  }

  if (response.status === 403) {
    clearAdminSession();
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as PublicAccountSession;
}

export async function loginPublicAccount(
  email: string,
  password: string,
): Promise<PublicAccountSession> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(await readPublicApiError(response, loginServiceUnavailableMessage));
  }

  const session = (await response.json()) as AdminAuthSession;
  storeAdminSession(session);
  return session;
}

export async function registerPublicAccount(input: {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string;
}): Promise<PublicAccountSession> {
  const response = await fetch(`${apiBaseUrl}/auth/register`, {
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
