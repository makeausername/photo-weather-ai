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
    { providerType: "email" },
    { providerType: "sms" },
  ];
}

export default function AdminProviderTypePage({ params }: AdminProviderTypePageProps) {
  return (
    <AdminShell
      title="服务商配置"
      description="统一管理地图、天气数据源、智能解读、邮箱和短信验证码服务。保存配置只保存参数，测试连接用于验证服务配置。"
    >
      <AdminProvidersClient providerType={params.providerType} />
    </AdminShell>
  );
}
