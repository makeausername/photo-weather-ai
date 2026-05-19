import Link from "next/link";
import { AdminShell } from "./components/admin-shell";

const adminEntryPoints = [
  {
    href: "/admin/settings",
    title: "System settings",
    description: "Site, AI, weather, scoring, storage, billing, and deployment placeholders.",
  },
  {
    href: "/admin/providers",
    title: "Provider configs",
    description: "DeepSeek, QWeather, Open-Meteo, Amap, and storage provider placeholders.",
  },
  {
    href: "/admin/audit",
    title: "Audit logs",
    description: "Recent admin configuration changes with secret-safe metadata.",
  },
] as const;

export default function AdminPage() {
  return (
    <AdminShell
      title="Admin console"
      description="Initial visual configuration console for the self-hosted commercial system."
    >
      <div className="adminOverviewGrid">
        {adminEntryPoints.map((entry) => (
          <Link key={entry.href} href={entry.href} className="adminOverviewItem">
            <span>{entry.title}</span>
            <p>{entry.description}</p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
