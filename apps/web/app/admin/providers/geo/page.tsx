import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminGeoProvidersPage() {
  return (
    <AdminShell title="地图服务" description="管理高德地图的地点搜索、地理编码和坐标转换配置。">
      <AdminProvidersClient providerType="geo" />
    </AdminShell>
  );
}
