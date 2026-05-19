"use client";

import { useEffect, useState } from "react";
import { adminApiFetch } from "../admin-api";
import type { AdminAuditLog } from "../admin-api";

type AuditResponse = {
  readonly logs: AdminAuditLog[];
};

export function AdminAuditClient() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [status, setStatus] = useState("Loading audit logs...");

  async function loadAuditLogs() {
    try {
      const response = await adminApiFetch<AuditResponse>("/admin/audit-logs?limit=50");
      setLogs(response.logs);
      setStatus(response.logs.length > 0 ? "Recent audit logs loaded." : "No audit logs yet.");
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
        <h2>Recent activity</h2>
        <span>{status}</span>
      </div>
      <div className="auditTable" role="table" aria-label="Recent admin audit logs">
        <div className="auditRow auditHead" role="row">
          <span>Time</span>
          <span>Action</span>
          <span>Target</span>
          <span>Actor</span>
        </div>
        {logs.map((log) => (
          <div key={log.id} className="auditRow" role="row">
            <span>{new Date(log.createdAt).toLocaleString()}</span>
            <span>{log.action}</span>
            <span>
              {log.targetType}
              {log.targetId ? `:${log.targetId}` : ""}
            </span>
            <span>{log.actorUserId ?? "system"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
