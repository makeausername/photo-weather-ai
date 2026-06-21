import { AdminShell } from "../components/admin-shell";
import { AdminUsersClient } from "../components/admin-users-client";

export default function AdminUsersPage() {
  return (
    <AdminShell
      title="用户管理"
      description="管理账号资料、状态、角色、会话、订单、积分和查询历史，敏感操作会写入审计日志。"
    >
      <AdminUsersClient />
    </AdminShell>
  );
}

