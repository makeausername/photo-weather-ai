import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

type AdminProviderTypePageProps = {
  readonly params: {
    readonly providerType: string;
  };
};

export function generateStaticParams() {
  return [
    { providerType: "ai" },
    { providerType: "weather" },
    { providerType: "geo" },
    { providerType: "storage" },
  ];
}

export default function AdminProviderTypePage({ params }: AdminProviderTypePageProps) {
  return (
    <AdminShell
      title="服务商配置"
      description="统一管理地图、天气数据源和智能解读服务。保存配置只保存参数，测试连接用于验证真实服务是否可用。"
    >
      <AdminProvidersClient providerType={params.providerType} />
    </AdminShell>
  );
}
