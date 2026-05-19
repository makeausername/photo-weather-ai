import { AdminLocationsClient } from "../components/admin-locations-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminLocationsPage() {
  return (
    <AdminShell title="地点管理" description="维护地点基础资料、双坐标系数据、来源与人工核验状态。">
      <AdminLocationsClient />
    </AdminShell>
  );
}
