import Link from "next/link";
import type { ReactNode } from "react";
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

export function AdminShell({ title, description, children }: AdminShellProps) {
  return (
    <main className="min-h-screen bg-slate-100 text-foreground lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="border-b border-slate-800 bg-slate-950 text-white lg:min-h-screen lg:border-b-0 lg:border-r lg:border-slate-800">
        <div className="sticky top-0 grid gap-6 p-5 lg:p-6">
          <Link href="/" className="grid gap-1">
            <span className="text-lg font-bold">风光天气 AI</span>
            <span className="text-xs text-slate-400">管理后台</span>
          </Link>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <section className="min-w-0">
        <header className="border-b border-border bg-white/90 px-5 py-4 backdrop-blur lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-primary">后台管理</p>
              <h1 className="mt-1 text-2xl font-bold tracking-normal text-foreground">{title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
            </div>
            <AdminSessionBadge />
          </div>
        </header>
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:px-8 lg:py-8">{children}</div>
      </section>
    </main>
  );
}
