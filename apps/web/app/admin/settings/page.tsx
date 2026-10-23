import { AdminShell } from "../components/admin-shell";
import { AdminSettingsClient } from "../components/admin-settings-client";
import { AdminHostingNote } from "../components/admin-workspace-sections";

export default function AdminPage() {
  return (
    <AdminShell title="网站设置" description="管理网站基本信息和显示偏好。">
      <AdminSettingsClient />
      <AdminHostingNote />
    </AdminShell>
  );
}
