import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="服务商配置"
      description="按服务类型管理地图、天气、AI 解读、支付收款、账户验证和对象存储配置。"
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
