import { AdminProductsClient } from "../components/admin-products-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProductsPage() {
  return (
    <AdminShell title="套餐定价" description="管理公开套餐价格、购买状态、展示文案和推荐角标。">
      <AdminProductsClient />
    </AdminShell>
  );
}
