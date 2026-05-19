import Link from "next/link";
import type { ReactNode } from "react";

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
          TODO: Admin RBAC and login are not implemented yet. This console is a configuration
          skeleton for local/self-hosted development only.
        </div>
        <header className="adminHeader">
          <p className="eyebrow">Admin configuration</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
