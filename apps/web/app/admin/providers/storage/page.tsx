import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminStorageProvidersPage() {
  return (
    <AdminShell
      title="对象存储"
      description="管理本地存储、阿里云 OSS、腾讯云 COS 等报告与文件存储配置。"
    >
      <AdminProvidersClient providerType="storage" />
    </AdminShell>
  );
}
