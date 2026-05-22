import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="服务商配置"
      description="管理天气、地图、AI 与存储等服务商配置；高德地图和 DeepSeek 可通过显式开发开关真实测试，和风天气与 Open-Meteo 当前本地仅使用样例或模拟数据。"
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
