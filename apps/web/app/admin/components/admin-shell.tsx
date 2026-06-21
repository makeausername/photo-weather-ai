"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "../../../components/theme-toggle";
import { cn } from "../../../components/ui";
import { AdminSessionBadge } from "./admin-session-badge";

const adminLinkGroups = [
  {
    label: "总览",
    links: [{ href: "/admin", label: "控制台" }],
  },
  {
    label: "运营",
    links: [
      { href: "/admin/users", label: "用户管理" },
      { href: "/admin/orders", label: "订单管理" },
    ],
  },
  {
    label: "配置",
    links: [
      { href: "/admin/settings", label: "系统设置" },
      { href: "/admin/providers/geo", label: "地图服务" },
      { href: "/admin/providers/weather", label: "天气数据" },
      { href: "/admin/providers/ai", label: "智能解读" },
      { href: "/admin/providers/billing", label: "支付收款" },
      { href: "/admin/providers/notification", label: "邮箱短信" },
      { href: "/admin/providers/storage", label: "对象存储" },
    ],
  },
  {
    label: "运维",
    links: [
      { href: "/admin/calibration", label: "历史校准" },
      { href: "/admin/audit", label: "审计日志" },
    ],
  },
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
    <main className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="border-b border-border bg-card/96 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="sticky top-0 grid content-start gap-5 p-4 lg:min-h-screen lg:p-5">
          <Link href="/admin" className="flex items-center gap-3">
            <img src="/brand-mark.svg" alt="" className="h-9 w-9 shrink-0" aria-hidden="true" />
            <span className="grid leading-tight">
              <span className="text-base font-bold text-card-foreground">逐光天气</span>
              <span className="text-xs text-muted-foreground">后台控制台</span>
            </span>
          </Link>

          <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-5 lg:overflow-visible lg:pb-0">
            {adminLinkGroups.map((group) => (
              <div key={group.label} className="flex shrink-0 gap-2 lg:grid lg:shrink lg:gap-1.5">
                <p className="hidden px-3.5 text-[11px] font-bold text-muted-foreground lg:block">
                  {group.label}
                </p>
                {group.links.map((link) => {
                  const active = isActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        "min-w-max whitespace-nowrap rounded-md border px-3 py-2 text-sm font-semibold leading-5 transition lg:w-full lg:min-w-0 lg:whitespace-normal lg:border-l-2 lg:px-3.5 lg:py-2.5",
                        active
                          ? "border-primary bg-secondary text-secondary-foreground"
                          : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground lg:hover:border-l-primary",
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
      </aside>

      <section className="min-w-0">
        <header className="border-b border-border bg-card/92 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">逐光天气后台</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight tracking-normal text-foreground">
                {title}
              </h1>
              <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-8 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
              >
                返回前台
              </Link>
              <ThemeToggle compact />
              <AdminSessionBadge />
            </div>
          </div>
        </header>
        <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">{children}</div>
      </section>
    </main>
  );
}
