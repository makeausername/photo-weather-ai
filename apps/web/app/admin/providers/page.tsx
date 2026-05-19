import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="服务商配置"
      description="查看服务商占位配置、脱敏密钥状态、本地模拟测试和 JSON 参数。"
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
