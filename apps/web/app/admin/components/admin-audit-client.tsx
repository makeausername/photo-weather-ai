"use client";

import { useEffect, useState } from "react";
import { adminApiFetch } from "../admin-api";
import type { AdminAuditLog } from "../admin-api";

type AuditResponse = {
  readonly logs: AdminAuditLog[];
};

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
    <section className="adminSection">
      <div className="adminSectionHeader">
        <h2>近期操作</h2>
        <span>{status}</span>
      </div>
      <div className="auditTable" role="table" aria-label="近期后台审计日志">
        <div className="auditRow auditHead" role="row">
          <span>时间</span>
          <span>操作</span>
          <span>对象</span>
          <span>操作者</span>
        </div>
        {logs.map((log) => (
          <div key={log.id} className="auditRow" role="row">
            <span>
              {new Date(log.createdAt).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
              })}
            </span>
            <span>{log.action}</span>
            <span>
              {log.targetType}
              {log.targetId ? `:${log.targetId}` : ""}
            </span>
            <span>{log.actorUserId ?? "系统"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
