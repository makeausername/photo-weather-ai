import { AdminShell } from "../components/admin-shell";
import { AdminAuditClient } from "../components/admin-audit-client";

export default function AdminPage() {
  return (
    <AdminShell title="操作日志" description="查看配置变更与后台任务记录。">
      <AdminAuditClient />
    </AdminShell>
  );
}
