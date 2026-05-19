"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "./ui";

const navLinks = [
  { href: "/", label: "首页" },
  { href: "/cloud-sea", label: "云海" },
  { href: "/glow", label: "朝霞晚霞" },
  { href: "/astro", label: "星空银河" },
  { href: "/spots", label: "机位库" },
  { href: "/pricing", label: "定价" },
] as const;

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
        "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

export function PublicHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/92 backdrop-blur-xl">
      <nav className="flex w-full items-center gap-4 px-[clamp(24px,4vw,72px)] py-3 min-[1200px]:grid min-[1200px]:grid-cols-[minmax(250px,auto)_minmax(0,1fr)_auto]">
        <Link
          href="/"
          className="flex min-w-0 shrink-0 items-center gap-3"
          onClick={() => setMenuOpen(false)}
        >
          <img src="/brand-mark.svg" alt="" className="h-9 w-9 shrink-0" aria-hidden="true" />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-base font-bold text-card-foreground">逐光天气</span>
            <span className="truncate text-xs text-muted-foreground">风光摄影出行判断工具</span>
          </span>
        </Link>

        <div className="hidden min-w-0 items-center justify-center gap-1 min-[1200px]:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.href}
              href={link.href}
              label={link.label}
              active={isActive(pathname, link.href)}
            />
          ))}
        </div>

        <div className="hidden shrink-0 items-center justify-end gap-2 min-[1200px]:flex">
          <ThemeToggle compact />
          <Link
            href="/login"
            className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
          >
            登录
          </Link>
          <Link
            href="/#analysis"
            className="inline-flex h-8 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
          >
            开始分析
          </Link>
          <Link
            href="/admin"
            className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            管理后台
          </Link>
        </div>

        <button
          type="button"
          className="ml-auto inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary min-[1200px]:hidden"
          aria-expanded={menuOpen}
          aria-controls="public-mobile-menu"
          onClick={() => setMenuOpen((current) => !current)}
        >
          菜单
        </button>
      </nav>

      {menuOpen ? (
        <div id="public-mobile-menu" className="border-t border-border bg-card min-[1200px]:hidden">
          <div className="grid w-full gap-3 px-[clamp(24px,4vw,72px)] py-3">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
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
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <ThemeToggle compact />
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
              >
                登录
              </Link>
              <Link
                href="/#analysis"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-[var(--primary-hover)]"
              >
                开始分析
              </Link>
              <Link
                href="/admin"
                onClick={() => setMenuOpen(false)}
                className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                管理后台
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
