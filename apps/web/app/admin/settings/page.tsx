import { AdminSettingsClient } from "../components/admin-settings-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminSettingsPage() {
  return (
    <AdminShell
      title="System settings"
      description="Grouped settings with inline editing for values that are marked editable."
    >
      <AdminSettingsClient />
    </AdminShell>
  );
}
