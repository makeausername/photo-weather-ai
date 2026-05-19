import Link from "next/link";
import type { ReactNode } from "react";
import { AdminSessionBadge } from "./admin-session-badge";

const adminLinks = [
  { href: "/admin", label: "控制台" },
  { href: "/admin/settings", label: "系统设置" },
  { href: "/admin/providers", label: "服务商配置" },
  { href: "/admin/locations", label: "地点与机位" },
  { href: "/admin/audit", label: "审计日志" },
] as const;

type AdminShellProps = {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
};

export function AdminShell({ title, description, children }: AdminShellProps) {
  return (
    <main className="adminShell">
      <aside className="adminSidebar" aria-label="后台导航">
        <Link href="/" className="adminBrand">
          风光天气 AI
        </Link>
        <nav className="adminNav">
          {adminLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="adminMain">
        <div className="adminNotice">
          后台访问已接入 JWT 登录和数据库
          RBAC。当前浏览器令牌存储仍是早期实现，上线前需要加固为生产级会话方案。
        </div>
        <header className="adminHeader">
          <div>
            <p className="eyebrow">后台管理</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <AdminSessionBadge />
        </header>
        {children}
      </section>
    </main>
  );
}
