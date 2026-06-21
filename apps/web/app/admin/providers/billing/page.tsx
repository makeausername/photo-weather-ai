import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminBillingProvidersPage() {
  return (
    <AdminShell
      title="支付收款"
      description="管理微信支付、支付宝、订单回调、证书、密钥和验签配置。"
    >
      <AdminProvidersClient providerType="billing" />
    </AdminShell>
  );
}
