import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="服务商配置"
      description="管理天气、地图、AI 与存储等服务商占位配置；测试连接仅使用本地模拟接口。"
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
