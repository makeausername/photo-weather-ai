import { AdminAuditClient } from "../components/admin-audit-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminAuditPage() {
  return (
    <AdminShell title="审计日志" description="查看近期后台操作记录。审计元数据入库前会先脱敏。">
      <AdminAuditClient />
    </AdminShell>
  );
}
