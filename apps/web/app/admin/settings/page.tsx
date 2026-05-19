import { AdminSettingsClient } from "../components/admin-settings-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminSettingsPage() {
  return (
    <AdminShell title="系统设置" description="按配置组查看和编辑允许后台维护的系统参数。">
      <AdminSettingsClient />
    </AdminShell>
  );
}
