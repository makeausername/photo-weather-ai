import { AdminShell } from "../components/admin-shell";
import { AdminCalibrationClient } from "../components/admin-calibration-client";

export default function AdminPage() {
  return (
    <AdminShell title="预报校准" description="记录实际观测，对照预报结果。">
      <AdminCalibrationClient />
    </AdminShell>
  );
}
