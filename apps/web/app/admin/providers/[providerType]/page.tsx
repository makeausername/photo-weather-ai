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

const providerTypeLabels: Record<string, string> = {
  ai: "AI 服务商",
  weather: "天气服务商",
  geo: "地理服务商",
  storage: "存储服务商",
};

export default function AdminProviderTypePage({ params }: AdminProviderTypePageProps) {
  const title = providerTypeLabels[params.providerType] ?? "服务商配置";

  return (
    <AdminShell
      title={title}
      description="按类型筛选服务商配置，展示脱敏密钥状态和本地模拟连接检查。"
    >
      <AdminProvidersClient providerType={params.providerType} />
    </AdminShell>
  );
}
