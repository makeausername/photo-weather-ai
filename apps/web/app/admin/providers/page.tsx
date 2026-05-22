import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="服务商配置"
      description="管理天气、地图、智能解读与存储等服务商配置；真实调用需显式启用，天气服务商未启用真实调用时使用模拟测试。"
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
