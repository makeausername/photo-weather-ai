"use client";
import { AdminDataContext } from "../admin/components/admin-data-context";
import { AdminShell } from "../admin/components/admin-shell";
import { AdminDashboardClient } from "../admin/components/admin-dashboard-client";
import { AdminProvidersClient } from "../admin/components/admin-providers-client";
import { AdminSettingsClient } from "../admin/components/admin-settings-client";
import { AdminAuditClient } from "../admin/components/admin-audit-client";
import { AdminCalibrationClient } from "../admin/components/admin-calibration-client";
import { AdminHostingNote } from "../admin/components/admin-workspace-sections";
import { previewAdminRequest } from "./preview-data";
const context = { request: previewAdminRequest, preview: true };
export const previewSections = {
  "": { title: "运行总览", description: "查看数据服务状态，完成网站配置。" },
  "providers/weather": {
    title: "天气数据",
    description: "配置和风天气与 Open-Meteo，查看连接状态。",
  },
  "providers/geo": {
    title: "高德地图",
    description: "配置地图底图、地点搜索和坐标服务。",
  },
  settings: { title: "网站设置", description: "管理网站基本信息和显示偏好。" },
  audit: { title: "操作日志", description: "查看配置变更与后台任务记录。" },
  calibration: { title: "预报校准", description: "记录实际观测，对照预报结果。" },
} as const;
export function AdminPreviewClient({
  section,
}: {
  readonly section: keyof typeof previewSections;
}) {
  const heading = previewSections[section];
  return (
    <AdminDataContext.Provider value={context}>
      <AdminShell {...heading}>
        {section === "" && <AdminDashboardClient />}
        {section === "providers/weather" && (
          <>
            <AdminProvidersClient providerType="weather" />
          </>
        )}
        {section === "providers/geo" && (
          <>
            <AdminProvidersClient providerType="geo" />
          </>
        )}
        {section === "settings" && (
          <>
            <AdminSettingsClient />
            <AdminHostingNote />
          </>
        )}
        {section === "audit" && (
          <>
            <AdminAuditClient />
          </>
        )}
        {section === "calibration" && (
          <>
            <AdminCalibrationClient />
          </>
        )}
      </AdminShell>
    </AdminDataContext.Provider>
  );
}
