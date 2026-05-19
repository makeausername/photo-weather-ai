import { AdminAuditClient } from "../components/admin-audit-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminAuditPage() {
  return (
    <AdminShell
      title="Audit logs"
      description="Recent admin configuration changes. Metadata is redacted before persistence."
    >
      <AdminAuditClient />
    </AdminShell>
  );
}
