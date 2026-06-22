"use client";

import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, Table } from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { AdminAuditLog } from "../admin-api";

type AuditResponse = {
  readonly logs: AdminAuditLog[];
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
                <td className="px-3 py-2.5 font-medium">{log.actionLabel}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <span className="font-medium text-card-foreground">{log.targetLabel}</span>
                  {log.targetSummary ? (
                    <span className="block text-xs">{log.targetSummary}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{log.actorLabel}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState
          title="暂无审计日志"
          description="后台产生配置、校准或审计事件后会显示在这里。"
        />
      )}
    </Card>
  );
}
