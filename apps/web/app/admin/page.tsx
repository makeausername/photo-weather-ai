import { AdminDashboardClient } from "./components/admin-dashboard-client";
import { AdminShell } from "./components/admin-shell";

export default function AdminPage() {
  return (
    <AdminShell
      title="控制台"
      description="查看逐光天气的系统状态、服务商配置概况、历史校准与最近后台操作。"
    >
      <AdminDashboardClient />
    </AdminShell>
  );
}
