import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminCdnProvidersPage() {
  return (
    <AdminShell
      title="CDN加速"
      description="管理阿里云 CDN、腾讯云 CDN 的缓存刷新、预热、域名和密钥配置。"
    >
      <AdminProvidersClient providerType="cdn" />
    </AdminShell>
  );
}
