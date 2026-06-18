"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentAccountSession,
  logoutPublicAccount,
  shouldShowAdminEntry,
  type PublicAccountSession,
} from "./account-session";
import { cn } from "./ui";

type PublicAccountEntryProps = {
  readonly onNavigate?: () => void;
};

export const publicAccountMenuLinks = [
  { href: "/account", label: "账户中心" },
  { href: "/#analysis", label: "开始判断" },
  { href: "/pricing", label: "定价" },
] as const;

export function PublicAccountEntry({ onNavigate }: PublicAccountEntryProps) {
  const [session, setSession] = useState<PublicAccountSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getCurrentAccountSession()
      .then((nextSession) => {
        if (!cancelled) {
          setSession(nextSession);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!session) {
    return (
      <Link
        href="/login"
        onClick={onNavigate}
        className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
      >
        账户
      </Link>
    );
  }

  const showAdminEntry = shouldShowAdminEntry(session);

  function handleNavigate() {
    setMenuOpen(false);
    onNavigate?.();
  }

  async function handleLogout() {
    await logoutPublicAccount();
    setSession(null);
    setMenuOpen(false);
    onNavigate?.();
    window.location.href = "/";
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary",
          menuOpen && "border-primary bg-secondary",
        )}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((current) => !current)}
      >
        账户
      </button>

      {menuOpen ? (
        <PublicAccountMenuContent
          showAdminEntry={showAdminEntry}
          onNavigate={handleNavigate}
          onLogout={() => void handleLogout()}
        />
      ) : null}
    </div>
  );
}

export function PublicAccountMenuContent({
  showAdminEntry,
  onNavigate,
  onLogout,
}: {
  readonly showAdminEntry: boolean;
  readonly onNavigate?: () => void;
  readonly onLogout: () => void;
}) {
  return (
    <div
      role="menu"
      className="absolute right-0 z-50 mt-2 grid min-w-48 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-soft"
    >
      {publicAccountMenuLinks.map((item) => (
        <AccountMenuLink
          key={item.href}
          href={item.href}
          label={item.label}
          onNavigate={onNavigate}
        />
      ))}
      {showAdminEntry ? (
        <AccountMenuLink href="/admin" label="管理后台入口" onNavigate={onNavigate} />
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="rounded-md px-3 py-2 text-left text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        onClick={onLogout}
      >
        退出登录
      </button>
    </div>
  );
}

function AccountMenuLink({
  href,
  label,
  onNavigate,
}: {
  readonly href: string;
  readonly label: string;
  readonly onNavigate?: () => void;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      onClick={onNavigate}
    >
      {label}
    </Link>
  );
}
