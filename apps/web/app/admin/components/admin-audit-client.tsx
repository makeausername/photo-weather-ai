"use client";

import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, Table } from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { AdminAuditLog } from "../admin-api";

type AuditResponse = {
  readonly logs: AdminAuditLog[];
};

const actionLabels: Record<string, string> = {
  "system_setting.update": "更新系统设置",
  "provider_config.update": "更新服务商配置",
  "location.create": "新增地点",
  "location.update": "编辑地点",
  "location.delete": "删除地点",
  "photo_spot.create": "新增机位",
  "photo_spot.update": "编辑机位",
  "photo_spot.delete": "删除机位",
};

const targetTypeLabels: Record<string, string> = {
  system_setting: "系统设置",
  provider_config: "服务商配置",
  location: "地点",
  photo_spot: "机位",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

export function AdminAuditClient() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [status, setStatus] = useState("正在加载审计日志...");

  async function loadAuditLogs() {
    try {
      const response = await adminApiFetch<AuditResponse>("/admin/audit-logs?limit=50");
      setLogs(response.logs);
      setStatus(response.logs.length > 0 ? "审计日志已加载。" : "暂无审计日志。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void loadAuditLogs();
  }, []);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold">近期操作</h2>
          <p className="mt-1 text-sm text-muted-foreground">展示最近 50 条后台操作记录。</p>
        </div>
        <Badge variant="muted">{status}</Badge>
      </div>
      {logs.length > 0 ? (
        <Table aria-label="近期后台审计日志">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">时间</th>
              <th className="px-3 py-2.5">操作</th>
              <th className="px-3 py-2.5">对象</th>
              <th className="px-3 py-2.5">操作者</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="px-3 py-2.5 text-card-foreground">{formatDate(log.createdAt)}</td>
                <td className="px-3 py-2.5 font-medium">
                  {actionLabels[log.action] ?? log.action}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {targetTypeLabels[log.targetType] ?? log.targetType}
                  {log.targetId ? ` / ${log.targetId}` : ""}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{log.actorUserId ?? "系统"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState
          title="暂无审计日志"
          description="后台产生配置、地点或机位变更后会显示在这里。"
        />
      )}
    </Card>
  );
}
