import {
  clearAdminSession,
  getStoredAdminTokens,
  type SafeAdminUser,
} from "../app/admin/admin-api";

export type PublicAccountSession = {
  readonly user: SafeAdminUser;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function shouldShowAdminEntry(
  session: Pick<PublicAccountSession, "permissions"> | null | undefined,
): boolean {
  return Boolean(session?.permissions.includes("admin.manage"));
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

  if (response.status === 401 || response.status === 403) {
    clearAdminSession();
    return null;
  }

  if (!response.ok) {
    return null;
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
