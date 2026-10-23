import { AdminShell } from "./components/admin-shell";
import { AdminDashboardClient } from "./components/admin-dashboard-client";

export default function AdminPage() {
  return (
    <AdminShell title="运行总览" description="查看数据服务状态，完成网站配置。">
      <AdminDashboardClient />
    </AdminShell>
  );
}
