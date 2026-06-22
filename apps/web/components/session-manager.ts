export type StoredSessionTokens = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt?: string;
  readonly sessionExpiresAt?: string;
};

export type SessionTokenPayload = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt?: string;
  readonly sessionExpiresAt?: string;
};

export type SessionClearReason =
  | "explicit_logout"
  | "session_expired_at_reached"
  | "refresh_failed"
  | "refresh_token_missing"
  | "token_storage_missing"
  | "server_invalid_session";

export type SessionChangeType = "session:stored" | "session:refreshed" | "session:cleared";

export type SessionChangeEvent = {
  readonly type: SessionChangeType;
  readonly reason?: SessionClearReason;
};

export type RefreshSessionOptions = {
  readonly baseUrl?: string;
  readonly fetcher?: typeof fetch;
};

export type SessionForRequestOptions = RefreshSessionOptions & {
  readonly proactiveRefreshWindowMs?: number;
};

type RefreshLock = {
  readonly ownerId: string;
  readonly startedAt: number;
  readonly expiresAt: number;
};

type BroadcastSessionEvent = SessionChangeEvent & {
  readonly id: string;
  readonly ownerId: string;
  readonly at: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const accessTokenKey = "photo_weather_admin_access_token";
const refreshTokenKey = "photo_weather_admin_refresh_token";
const accessTokenExpiresAtKey = "photo_weather_admin_access_token_expires_at";
const sessionExpiresAtKey = "photo_weather_admin_session_expires_at";
const refreshLockKey = "photo_weather_session_refresh_lock";
const sessionEventKey = "photo_weather_session_event";
const refreshLockTtlMs = 10_000;
const externalRefreshPollMs = 50;
const externalRefreshGraceMs = 250;
const defaultProactiveRefreshWindowMs = 60_000;

const ownerId = createOwnerId();
const listeners = new Set<(event: SessionChangeEvent) => void>();

let refreshInFlight: Promise<StoredSessionTokens | null> | null = null;
let eventsInitialized = false;
let broadcastChannel: BroadcastChannel | null = null;

export const sessionStorageKeys = {
  accessToken: accessTokenKey,
  refreshToken: refreshTokenKey,
  accessTokenExpiresAt: accessTokenExpiresAtKey,
  sessionExpiresAt: sessionExpiresAtKey,
  refreshLock: refreshLockKey,
} as const;

export function getStoredSessionTokens(): StoredSessionTokens | null {
  const storage = browserLocalStorage();
  if (!storage) {
    return null;
  }

  const accessToken = cleanStorageValue(storage.getItem(accessTokenKey));
  const refreshToken = cleanStorageValue(storage.getItem(refreshTokenKey));
  const accessTokenExpiresAt = cleanStorageValue(storage.getItem(accessTokenExpiresAtKey));
  const sessionExpiresAt = cleanStorageValue(storage.getItem(sessionExpiresAtKey));

  if (!accessToken && !refreshToken) {
    return null;
  }

  if (!accessToken || !refreshToken) {
    clearSession("token_storage_missing");
    return null;
  }

  if (isStoredSessionExpired(sessionExpiresAt)) {
    clearSession("session_expired_at_reached");
    return null;
  }

  return compactTokens({
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    sessionExpiresAt,
  });
}

export function storeSession(
  session: SessionTokenPayload,
  options: {
    readonly eventType?: Extract<SessionChangeType, "session:stored" | "session:refreshed">;
  } = {},
): void {
  const storage = browserLocalStorage();
  if (!storage) {
    return;
  }

  storage.setItem(accessTokenKey, session.accessToken);
  storage.setItem(refreshTokenKey, session.refreshToken);
  setOptionalStorageValue(storage, accessTokenExpiresAtKey, session.accessTokenExpiresAt);
  setOptionalStorageValue(storage, sessionExpiresAtKey, session.sessionExpiresAt);
  publishSessionChange({ type: options.eventType ?? "session:stored" });
}

export function clearSession(reason: SessionClearReason = "explicit_logout"): void {
  const storage = browserLocalStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(accessTokenKey);
  storage.removeItem(refreshTokenKey);
  storage.removeItem(accessTokenExpiresAtKey);
  storage.removeItem(sessionExpiresAtKey);
  publishSessionChange({ type: "session:cleared", reason });
}

export function clearSessionIfRefreshTokenUnchanged(
  attemptedRefreshToken: string,
  reason: SessionClearReason = "refresh_failed",
): boolean {
  const current = getStoredSessionTokens();
  if (current?.refreshToken && current.refreshToken !== attemptedRefreshToken) {
    return false;
  }

  clearSession(reason);
  return true;
}

export function subscribeToSessionChanges(
  listener: (event: SessionChangeEvent) => void,
): () => void {
  ensureBrowserEventListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function getSessionForRequest(
  options: SessionForRequestOptions = {},
): Promise<StoredSessionTokens | null> {
  const tokens = getStoredSessionTokens();
  if (!tokens) {
    return null;
  }

  if (shouldRefreshAccessTokenSoon(tokens, options.proactiveRefreshWindowMs)) {
    return (await refreshStoredSession(options)) ?? getStoredSessionTokens();
  }

  return tokens;
}

export function shouldRefreshAccessTokenSoon(
  tokens: Pick<StoredSessionTokens, "accessTokenExpiresAt">,
  windowMs = defaultProactiveRefreshWindowMs,
): boolean {
  if (!tokens.accessTokenExpiresAt) {
    return false;
  }

  const expiresAt = Date.parse(tokens.accessTokenExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + windowMs;
}

export async function refreshStoredSession(
  options: RefreshSessionOptions = {},
): Promise<StoredSessionTokens | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = refreshStoredSessionInternal(options).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export function storedRefreshTokenChanged(attemptedRefreshToken: string | undefined): boolean {
  if (!attemptedRefreshToken) {
    return false;
  }

  const current = getStoredSessionTokens();
  return Boolean(current?.refreshToken && current.refreshToken !== attemptedRefreshToken);
}

async function refreshStoredSessionInternal(
  options: RefreshSessionOptions,
): Promise<StoredSessionTokens | null> {
  const tokens = getStoredSessionTokens();
  if (!tokens) {
    return null;
  }

  if (!tokens.refreshToken) {
    clearSession("refresh_token_missing");
    return null;
  }

  const externalRefresh = await waitForOtherTabRefreshIfNeeded(tokens.refreshToken);
  if (externalRefresh) {
    return externalRefresh;
  }

  let lockAcquired = acquireRefreshLock();
  if (!lockAcquired) {
    const waited = await waitForExternalRefresh(tokens.refreshToken);
    if (waited) {
      return waited;
    }
    lockAcquired = acquireRefreshLock();
    if (!lockAcquired) {
      return getStoredSessionTokens();
    }
  }

  try {
    const latestBeforeRefresh = getStoredSessionTokens();
    if (
      latestBeforeRefresh?.refreshToken &&
      latestBeforeRefresh.refreshToken !== tokens.refreshToken
    ) {
      return latestBeforeRefresh;
    }

    const fetcher = options.fetcher ?? fetch;
    const response = await fetcher(`${options.baseUrl ?? apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).catch(() => null);

    if (!response?.ok) {
      const current = getStoredSessionTokens();
      if (current?.refreshToken && current.refreshToken !== tokens.refreshToken) {
        return current;
      }
      if (response) {
        clearSession("refresh_failed");
      }
      return null;
    }

    const session = (await response.json()) as SessionTokenPayload;
    storeSession(session, { eventType: "session:refreshed" });
    return getStoredSessionTokens() ?? compactTokens(session);
  } finally {
    releaseRefreshLock();
  }
}

async function waitForOtherTabRefreshIfNeeded(
  attemptedRefreshToken: string,
): Promise<StoredSessionTokens | null> {
  const lock = readRefreshLock();
  if (!lock || lock.ownerId === ownerId || lock.expiresAt <= Date.now()) {
    return null;
  }

  return waitForExternalRefresh(attemptedRefreshToken, lock.expiresAt);
}

function waitForExternalRefresh(
  attemptedRefreshToken: string,
  lockExpiresAt = Date.now() + refreshLockTtlMs,
): Promise<StoredSessionTokens | null> {
  const deadline = Math.min(
    lockExpiresAt + externalRefreshGraceMs,
    Date.now() + refreshLockTtlMs + externalRefreshGraceMs,
  );

  return new Promise((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToSessionChanges(check);

    function finish(value: StoredSessionTokens | null) {
      if (timeout) {
        clearTimeout(timeout);
      }
      unsubscribe();
      resolve(value);
    }

    function check() {
      const latest = getStoredSessionTokens();
      if (latest?.refreshToken && latest.refreshToken !== attemptedRefreshToken) {
        finish(latest);
        return;
      }

      const lock = readRefreshLock();
      if (
        !lock ||
        lock.ownerId === ownerId ||
        lock.expiresAt <= Date.now() ||
        Date.now() >= deadline
      ) {
        finish(null);
        return;
      }

      timeout = setTimeout(check, externalRefreshPollMs);
    }

    check();
  });
}

function acquireRefreshLock(): boolean {
  const storage = browserLocalStorage();
  if (!storage) {
    return true;
  }

  const now = Date.now();
  const existing = readRefreshLock();
  if (existing && existing.ownerId !== ownerId && existing.expiresAt > now) {
    return false;
  }

  const lock: RefreshLock = {
    ownerId,
    startedAt: now,
    expiresAt: now + refreshLockTtlMs,
  };
  storage.setItem(refreshLockKey, JSON.stringify(lock));
  return readRefreshLock()?.ownerId === ownerId;
}

function releaseRefreshLock(): void {
  const storage = browserLocalStorage();
  if (!storage) {
    return;
  }

  if (readRefreshLock()?.ownerId === ownerId) {
    storage.removeItem(refreshLockKey);
  }
}

function readRefreshLock(): RefreshLock | null {
  const storage = browserLocalStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(refreshLockKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RefreshLock>;
    if (
      typeof parsed.ownerId !== "string" ||
      typeof parsed.startedAt !== "number" ||
      typeof parsed.expiresAt !== "number"
    ) {
      storage.removeItem(refreshLockKey);
      return null;
    }
    return parsed as RefreshLock;
  } catch {
    storage.removeItem(refreshLockKey);
    return null;
  }
}

function publishSessionChange(event: SessionChangeEvent): void {
  ensureBrowserEventListeners();
  notifyLocalListeners(event);

  const storage = browserLocalStorage();
  if (!storage) {
    return;
  }

  const payload: BroadcastSessionEvent = {
    ...event,
    id: createOwnerId(),
    ownerId,
    at: Date.now(),
  };

  try {
    broadcastChannel?.postMessage(payload);
  } catch {
    // BroadcastChannel is best-effort cross-tab coordination.
  }

  try {
    storage.setItem(sessionEventKey, JSON.stringify(payload));
  } catch {
    // Storage events are a fallback signal. Ignore quota/privacy-mode failures.
  }
}

function notifyLocalListeners(event: SessionChangeEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function ensureBrowserEventListeners(): void {
  if (eventsInitialized || typeof window === "undefined") {
    return;
  }
  eventsInitialized = true;

  if (typeof window.addEventListener === "function") {
    window.addEventListener("storage", (event) => {
      if (event.key !== sessionEventKey || !event.newValue) {
        return;
      }
      handleExternalSessionEvent(event.newValue);
    });
  }

  if (typeof BroadcastChannel !== "undefined") {
    try {
      broadcastChannel = new BroadcastChannel("photo_weather_session");
      broadcastChannel.onmessage = (event) => {
        handleExternalSessionEvent(event.data);
      };
    } catch {
      broadcastChannel = null;
    }
  }
}

function handleExternalSessionEvent(raw: unknown): void {
  try {
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as Partial<BroadcastSessionEvent>)
        : (raw as Partial<BroadcastSessionEvent>);
    if (
      parsed.ownerId === ownerId ||
      (parsed.type !== "session:stored" &&
        parsed.type !== "session:refreshed" &&
        parsed.type !== "session:cleared")
    ) {
      return;
    }
    notifyLocalListeners({ type: parsed.type, reason: parsed.reason });
  } catch {
    // Ignore malformed cross-tab session events.
  }
}

function compactTokens(session: SessionTokenPayload): StoredSessionTokens {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    ...(session.accessTokenExpiresAt ? { accessTokenExpiresAt: session.accessTokenExpiresAt } : {}),
    ...(session.sessionExpiresAt ? { sessionExpiresAt: session.sessionExpiresAt } : {}),
  };
}

function setOptionalStorageValue(storage: Storage, key: string, value: string | undefined): void {
  if (value) {
    storage.setItem(key, value);
  } else {
    storage.removeItem(key);
  }
}

function cleanStorageValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isStoredSessionExpired(sessionExpiresAt: string | undefined): boolean {
  if (!sessionExpiresAt) {
    return false;
  }

  const expiresAt = Date.parse(sessionExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function browserLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function createOwnerId(): string {
  const randomValue =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `session-${randomValue}`;
}
