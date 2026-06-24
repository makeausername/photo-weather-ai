import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminAiProvidersPage() {
  return (
    <AdminShell
      title="智能解读"
      description="管理 GPT / OpenAI 智能解读配置，不参与确定性天气、天文和地形计算。"
    >
      <AdminProvidersClient providerType="ai" />
    </AdminShell>
  );
}
