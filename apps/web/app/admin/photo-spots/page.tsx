import { AdminPhotoSpotsClient } from "../components/admin-photo-spots-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminPhotoSpotsPage() {
  return (
    <AdminShell
      title="机位管理"
      description="维护机位坐标、海拔、朝向、适拍类型、交通、安全和风险备注。"
    >
      <AdminPhotoSpotsClient />
    </AdminShell>
  );
}
