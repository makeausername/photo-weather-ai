import { AdminSettingsClient } from "../components/admin-settings-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminSettingsPage() {
  return (
    <AdminShell title="系统设置" description="查看并维护允许后台编辑的系统参数。">
      <AdminSettingsClient />
    </AdminShell>
  );
}
