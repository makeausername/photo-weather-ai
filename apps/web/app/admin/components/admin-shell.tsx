import Link from "next/link";
import type { ReactNode } from "react";
import { AdminSessionBadge } from "./admin-session-badge";

const adminLinks = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/providers/ai", label: "AI" },
  { href: "/admin/providers/weather", label: "Weather" },
  { href: "/admin/providers/geo", label: "Geo" },
  { href: "/admin/providers/storage", label: "Storage" },
  { href: "/admin/audit", label: "Audit" },
] as const;

type AdminShellProps = {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
};

export function AdminShell({ title, description, children }: AdminShellProps) {
  return (
    <main className="adminShell">
      <aside className="adminSidebar" aria-label="Admin navigation">
        <Link href="/" className="adminBrand">
          Photo Weather AI
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
          Admin access is protected by JWT login and database-backed RBAC. TODO: harden browser
          token storage before production release.
        </div>
        <header className="adminHeader">
          <div>
            <p className="eyebrow">Admin configuration</p>
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
