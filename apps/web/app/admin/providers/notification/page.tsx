import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminNotificationProvidersPage() {
  return (
    <AdminShell title="邮箱短信" description="管理邮箱验证码和短信验证码服务配置。">
      <AdminProvidersClient providerType="notification" />
    </AdminShell>
  );
}
