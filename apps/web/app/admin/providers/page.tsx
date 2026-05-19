import { AdminProvidersClient } from "../components/admin-providers-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminProvidersPage() {
  return (
    <AdminShell
      title="Provider configs"
      description="Provider placeholders, masked secrets, local mock testing, and editable JSON config."
    >
      <AdminProvidersClient />
    </AdminShell>
  );
}
