"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentAccountSession,
  logoutPublicAccount,
  type PublicAccountSession,
} from "./account-session";
import { cn } from "./ui";

type PublicAccountEntryProps = {
  readonly onNavigate?: () => void;
  readonly variant?: "desktop" | "mobile";
};

type PublicAccountMenuPlacement = "dropdown" | "inline";

export const publicAccountMenuLinks = [
  { href: "/account", label: "账户中心" },
] as const;

export function PublicAccountEntry({ onNavigate, variant = "desktop" }: PublicAccountEntryProps) {
  const [session, setSession] = useState<PublicAccountSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isMobile = variant === "mobile";

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
        className={cn(
          "inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary",
          isMobile && "w-full max-w-full min-w-0 justify-center",
        )}
      >
        账户
      </Link>
    );
  }

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
    <div className={cn(isMobile ? "grid w-full max-w-full min-w-0" : "relative")}>
      <button
        type="button"
        className={cn(
          "inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary",
          isMobile && "w-full max-w-full min-w-0 justify-center",
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
          placement={isMobile ? "inline" : "dropdown"}
          onNavigate={handleNavigate}
          onLogout={() => void handleLogout()}
        />
      ) : null}
    </div>
  );
}

export function PublicAccountMenuContent({
  placement = "dropdown",
  onNavigate,
  onLogout,
}: {
  readonly placement?: PublicAccountMenuPlacement;
  readonly onNavigate?: () => void;
  readonly onLogout: () => void;
}) {
  return (
    <div
      role="menu"
      className={cn(
        "mt-2 grid overflow-hidden rounded-lg border border-border bg-card p-1 shadow-soft",
        placement === "dropdown"
          ? "absolute right-0 z-50 min-w-48"
          : "w-full max-w-full min-w-0",
      )}
    >
      {publicAccountMenuLinks.map((item) => (
        <AccountMenuLink
          key={item.href}
          href={item.href}
          label={item.label}
          onNavigate={onNavigate}
        />
      ))}
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
