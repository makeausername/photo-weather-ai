import { AdminOrderDetailClient } from "../../components/admin-order-detail-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminOrderDetailPage({
  params,
}: {
  readonly params: { readonly orderNo: string };
}) {
  return (
    <AdminShell
      title="订单详情"
      description="查看订单核心信息、用户、产品、支付时间线、通知、权益、积分流水和安全运营操作。"
    >
      <AdminOrderDetailClient orderNo={params.orderNo} />
    </AdminShell>
  );
}

