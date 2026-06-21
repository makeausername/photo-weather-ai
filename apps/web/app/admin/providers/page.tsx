import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="服务商配置"
      description="按服务类型管理地图与地理、天气数据、智能解读、支付收款、邮箱短信和对象存储配置。"
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
