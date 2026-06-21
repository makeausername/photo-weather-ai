import { AdminCalibrationClient } from "../components/admin-calibration-client";
import { AdminShell } from "../components/admin-shell";

export default function AdminCalibrationPage() {
  return (
    <AdminShell
      title="历史校准"
      description="回放历史天气样本、标注真实结果，并按地点与拍摄目标统计规则命中情况。"
    >
      <AdminCalibrationClient />
    </AdminShell>
  );
}
