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
      title={`${params.providerType} providers`}
      description="Filtered provider configuration with masked secret output and mock connection checks."
    >
      <AdminProvidersClient providerType={params.providerType} />
    </AdminShell>
  );
}
