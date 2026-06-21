import { AdminOrdersClient } from "../components/admin-orders-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminOrdersPage() {
  return (
    <AdminShell
      title="订单管理"
      description="管理支付订单、人工支付操作、权益发放状态、支付通知、积分流水和相关审计记录。"
    >
      <AdminOrdersClient />
    </AdminShell>
  );
}

