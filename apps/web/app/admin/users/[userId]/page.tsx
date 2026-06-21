import { AdminShell } from "../../components/admin-shell";
import { AdminUserDetailClient } from "../../components/admin-user-detail-client";

export default function AdminUserDetailPage({
  params,
}: {
  readonly params: { readonly userId: string };
}) {
  return (
    <AdminShell
      title="用户详情"
      description="查看用户概览、订单、权益积分、查询历史、会话安全和审计记录，并执行受控运营操作。"
    >
      <AdminUserDetailClient userId={params.userId} />
    </AdminShell>
  );
}

