"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
      { href: "/admin/products", label: "套餐定价" },
    ],
  },
  {
    label: "配置",
    links: [
      { href: "/admin/settings", label: "系统设置" },
      { href: "/admin/providers/geo", label: "地图服务" },
      { href: "/admin/providers/weather", label: "天气数据" },
      { href: "/admin/providers/billing", label: "支付收款" },
      { href: "/admin/providers/notification", label: "邮箱短信" },
      { href: "/admin/providers/captcha", label: "人机验证" },
      { href: "/admin/providers/storage", label: "对象存储" },
      { href: "/admin/providers/cdn", label: "CDN加速" },
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
    <main className="min-h-screen max-w-full min-w-0 bg-background text-foreground lg:grid lg:grid-cols-[272px_minmax(0,1fr)] xl:grid-cols-[288px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-border bg-card/95 lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="sticky top-0 grid content-start gap-6 p-4 lg:min-h-screen lg:p-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex min-w-0 items-center gap-3">
              <img src="/brand-mark.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
              <span className="grid min-w-0 leading-tight">
                <span className="break-words text-base font-bold text-card-foreground">
                  逐光天气
                </span>
                <span className="break-words text-xs text-muted-foreground">后台控制台</span>
              </span>
            </Link>
            <MobileAdminNavigation pathname={pathname} />
          </div>

          <nav className="hidden gap-6 lg:grid" aria-label="后台主导航">
            <AdminNavigationLinks pathname={pathname} />
          </nav>
        </div>
      </aside>

      <section className="min-w-0 max-w-full">
        <header className="border-b border-border bg-card/85 px-4 py-5 backdrop-blur sm:px-6 lg:px-10 lg:py-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold tracking-[0.1em] text-primary">管理后台</p>
              <h1 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[28px]">
                {title}
              </h1>
              <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
              >
                返回前台
              </Link>
              <AdminSessionBadge />
            </div>
          </div>
        </header>
        <div className="grid max-w-full min-w-0 gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </div>
      </section>
    </main>
  );
}

function AdminNavigationLinks({
  pathname,
  mobile = false,
}: {
  readonly pathname: string;
  readonly mobile?: boolean;
}) {
  return adminLinkGroups.map((group) => (
    <div key={group.label} className="grid gap-1.5">
      <p className="px-3.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground">
        {group.label}
      </p>
      {group.links.map((link) => {
        const active = isActive(pathname, link.href);
        const navigationLink = (
          <Link
            href={link.href}
            className={cn(
              "w-full min-w-0 rounded-xl border px-4 py-3 text-sm font-semibold leading-5 transition lg:w-full lg:min-w-0 lg:whitespace-normal",
              active
                ? "border-primary bg-secondary text-secondary-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );

        return mobile ? (
          <Dialog.Close key={link.href} asChild>
            {navigationLink}
          </Dialog.Close>
        ) : (
          <span key={link.href} className="contents">
            {navigationLink}
          </span>
        );
      })}
    </div>
  ));
}

export function MobileAdminNavigation({ pathname }: { readonly pathname: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-card-foreground outline-none transition hover:border-primary hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          aria-label="打开后台导航"
          data-admin-mobile-menu-trigger="true"
        >
          <span aria-hidden="true" className="grid gap-1">
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
            <span className="block h-0.5 w-4 rounded-full bg-current" />
          </span>
          菜单
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 grid w-[min(90vw,380px)] grid-rows-[auto_minmax(0,1fr)] border-l border-border bg-card shadow-2xl outline-none"
          data-admin-mobile-navigation="sheet"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-5">
            <div>
              <Dialog.Title className="text-lg font-bold text-card-foreground">
                后台导航
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                按业务分组进入管理页面
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border text-lg text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="关闭后台导航"
              >
                ×
              </button>
            </Dialog.Close>
          </div>
          <nav
            className="grid content-start gap-5 overflow-y-auto px-4 py-5"
            aria-label="移动端后台导航"
          >
            <AdminNavigationLinks pathname={pathname} mobile />
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
