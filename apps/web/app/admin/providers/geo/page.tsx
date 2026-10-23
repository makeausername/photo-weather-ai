import { AdminShell } from "../../components/admin-shell";
import { AdminProvidersClient } from "../../components/admin-providers-client";

export default function AdminPage() {
  return (
    <AdminShell title="高德地图" description="配置地图底图、地点搜索和坐标服务。">
      <AdminProvidersClient providerType="geo" />
    </AdminShell>
  );
}
