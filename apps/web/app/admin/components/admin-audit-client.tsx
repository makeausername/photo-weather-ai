"use client";
import { useAdminRequest } from "./admin-data-context";

import { useEffect, useState } from "react";
import { Button, Card, EmptyState, Table } from "../../../components/ui";
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
  const adminApiFetch = useAdminRequest();
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAuditLogs() {
    setLoading(true);
    setError("");
    try {
      const response = await adminApiFetch<AuditResponse>("/admin/audit-logs?limit=50");
      setLogs(response.logs);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
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
        <Button variant="secondary" disabled={loading} onClick={() => void loadAuditLogs()}>
          {loading ? "读取中…" : "刷新记录"}
        </Button>
      </div>
      {error && (
        <div role="alert" className="border-b border-border px-5 py-4 text-sm text-danger">
          读取失败：{error}
        </div>
      )}
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
          title={loading ? "正在读取操作记录" : error ? "暂时无法读取记录" : "暂无操作记录"}
          description={
            error
              ? "请确认服务连接和管理员权限，然后刷新重试。"
              : "保存配置或执行校准任务后，记录会显示在这里。"
          }
        />
      )}
    </Card>
  );
}
