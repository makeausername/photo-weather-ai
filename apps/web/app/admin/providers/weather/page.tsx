import { AdminShell } from "../../components/admin-shell";
import { AdminProvidersClient } from "../../components/admin-providers-client";

export default function AdminPage() {
  return (
    <AdminShell title="天气数据" description="配置和风天气与 Open-Meteo，查看连接状态。">
      <AdminProvidersClient providerType="weather" />
    </AdminShell>
  );
}
