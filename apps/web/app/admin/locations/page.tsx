import { AdminLocationsClient } from "../components/admin-locations-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminLocationsPage() {
  return (
    <AdminShell
      title="地点管理"
      description="维护地点基础资料、GCJ-02 / WGS84 坐标、海拔、来源与人工核验状态；每个地点都是预报、地形、天文和历史校准的分析单元。"
    >
      <AdminLocationsClient />
    </AdminShell>
  );
}
