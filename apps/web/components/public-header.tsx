"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PublicAccountEntry } from "./public-account-entry";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "./ui";

export const publicHeaderActionLabels = ["账户"] as const;

const navLinks = [
  { href: "/", label: "首页" },
  { href: "/cloud-sea", label: "云海" },
  { href: "/glow", label: "朝霞晚霞" },
  { href: "/astro", label: "星空银河" },
] as const;

export const publicHeaderNavLabels = navLinks.map((link) => link.label);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  active,
  onClick,
}: {
  readonly href: string;
  readonly label: string;
  readonly active: boolean;
  readonly onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center rounded-xl px-3.5 text-sm font-medium transition",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

type PublicHeaderProps = {
  readonly initialMenuOpen?: boolean;
};

export function PublicHeader(props?: PublicHeaderProps) {
  const { initialMenuOpen = false } = props ?? {};
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(initialMenuOpen);
  const headerMenuRef = useRef<HTMLElement | null>(null);
  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <header
      ref={headerMenuRef}
      className="sticky top-0 z-40 border-b border-border/90 bg-card/90 backdrop-blur-xl"
    >
      <nav className="mx-auto flex min-h-[72px] w-full max-w-[1440px] min-w-0 items-center gap-2 px-[clamp(16px,4vw,48px)] lg:grid lg:grid-cols-[minmax(200px,1fr)_auto_minmax(200px,1fr)]">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2"
          onClick={() => setMenuOpen(false)}
        >
          <img src="/brand-mark.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-base font-bold text-card-foreground">逐光天气</span>
          </span>
        </Link>

        <div className="hidden min-w-0 items-center justify-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={isActive(pathname, link.href)}
            />
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center justify-end gap-2 lg:ml-0">
          <ThemeToggle />
          <div className="hidden lg:block">
            <PublicAccountEntry variant="desktop" />
          </div>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            onClick={() => setMenuOpen((current) => !current)}
          >
            菜单
            <svg
              className={cn("h-3.5 w-3.5 transition-transform", menuOpen && "rotate-180")}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div
          id="public-mobile-menu"
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-73px)] w-full max-w-full min-w-0 overflow-y-auto border-b border-border bg-card shadow-panel lg:hidden"
        >
          <div className="mx-auto grid w-full max-w-[1600px] min-w-0 gap-4 px-[clamp(16px,4vw,64px)] py-4">
            <div className="grid w-full max-w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
              {navLinks.map((link) => (
                <NavLink
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  active={isActive(pathname, link.href)}
                  onClick={() => setMenuOpen(false)}
                />
              ))}
            </div>
            <div className="grid w-full max-w-full min-w-0 gap-2 border-t border-border pt-3">
              <PublicAccountEntry variant="mobile" onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
