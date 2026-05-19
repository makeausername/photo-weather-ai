"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "../../../components/theme-toggle";
import { cn } from "../../../components/ui";
import { AdminSessionBadge } from "./admin-session-badge";

const adminLinks = [
  { href: "/admin", label: "控制台" },
  { href: "/admin/settings", label: "系统设置" },
  { href: "/admin/providers", label: "服务商配置" },
  { href: "/admin/locations", label: "地点管理" },
  { href: "/admin/photo-spots", label: "机位管理" },
  { href: "/admin/audit", label: "审计日志" },
] as const;

type AdminShellProps = {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ title, description, children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[236px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-card lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="sticky top-0 grid content-start gap-4 p-4 lg:min-h-screen">
          <Link href="/" className="flex items-center gap-3 rounded-xl">
            <img src="/brand-mark.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
            <span className="grid leading-tight">
              <span className="text-base font-bold text-card-foreground">逐光天气管理后台</span>
              <span className="text-xs text-muted-foreground">运营控制台</span>
            </span>
          </Link>

          <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:content-start lg:gap-1 lg:overflow-visible lg:pb-0">
            {adminLinks.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium transition",
                    active
                      ? "border-transparent bg-muted text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <section className="min-w-0">
        <header className="border-b border-border bg-card px-4 py-3 shadow-sm lg:px-6">
          <div className="mx-auto flex max-w-[1320px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                <img src="/brand-mark.svg" alt="" className="h-5 w-5" aria-hidden="true" />
                <span>逐光天气管理后台</span>
              </div>
              <h1 className="mt-1 text-lg font-bold tracking-normal text-foreground sm:text-xl">
                {title}
              </h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground sm:text-sm">
                {description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition hover:border-primary hover:bg-secondary"
              >
                返回前台
              </Link>
              <ThemeToggle compact />
              <AdminSessionBadge />
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-[1320px] gap-5 px-4 py-5 lg:px-6 lg:py-6">
          {children}
        </div>
      </section>
    </main>
  );
}
