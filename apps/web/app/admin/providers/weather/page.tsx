import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminWeatherProvidersPage() {
  return (
    <AdminShell
      title="天气数据"
      description="管理和风天气、Open-Meteo、meteoblue 等天气数据源、逐小时预报和云层分层配置。"
    >
      <AdminProvidersClient providerType="weather" />
    </AdminShell>
  );
}
