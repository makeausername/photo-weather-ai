import { AdminLocationsClient } from "../components/admin-locations-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminLocationsPage() {
  return (
    <AdminShell
      title="地点与机位"
      description="维护地点基础资料、双坐标系数据、来源和人工核验状态。"
    >
      <AdminLocationsClient />
    </AdminShell>
  );
}
