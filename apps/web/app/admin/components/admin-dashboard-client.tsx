"use client";

import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, Table } from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type { AdminAuditLog, SafeProviderConfig } from "../admin-api";

type DashboardState = {
  readonly settingsOk: boolean | null;
  readonly providers: SafeProviderConfig[];
  readonly auditLogs: AdminAuditLog[];
  readonly error?: string;
};

const initialState: DashboardState = {
  settingsOk: null,
  providers: [],
  auditLogs: [],
};

const actionLabels: Record<string, string> = {
  "system_setting.update": "更新系统设置",
  "provider_config.update": "更新服务商配置",
  "location.create": "旧版地点记录新增",
  "location.update": "旧版地点记录编辑",
  "location.delete": "旧版地点记录删除",
  "photo_spot.create": "旧版拍摄点记录新增",
  "photo_spot.update": "旧版拍摄点记录编辑",
  "photo_spot.delete": "旧版拍摄点记录删除",
};

const targetTypeLabels: Record<string, string> = {
  system_setting: "系统设置",
  provider_config: "服务商配置",
  location: "旧版地点",
  photo_spot: "旧版拍摄点",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

export function AdminDashboardClient() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const [settingsResult, providersResult, auditResult] =
        await Promise.allSettled([
          adminApiFetch<{ readonly settings: unknown[] }>("/admin/settings"),
          adminApiFetch<{ readonly providers: SafeProviderConfig[] }>("/admin/providers"),
          adminApiFetch<{ readonly logs: AdminAuditLog[] }>("/admin/audit-logs?limit=5"),
        ]);

      if (cancelled) {
        return;
      }

      setState({
        settingsOk: settingsResult.status === "fulfilled",
        providers: providersResult.status === "fulfilled" ? providersResult.value.providers : [],
        auditLogs: auditResult.status === "fulfilled" ? auditResult.value.logs : [],
        error:
          settingsResult.status === "rejected" &&
          providersResult.status === "rejected" &&
          auditResult.status === "rejected"
            ? "后台接口暂不可用，当前显示兜底状态。"
            : undefined,
      });
      setLoading(false);
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const enabledProviders = state.providers.filter((provider) => provider.enabled).length;
  const summaryCards = [
    {
      title: "系统状态",
      value: state.settingsOk === null ? "检查中" : state.settingsOk ? "可访问" : "未连接",
      description: state.settingsOk ? "后台接口与权限检查可用" : "无法读取系统设置时自动降级显示",
      badge: state.settingsOk ? "正常" : "兜底",
    },
    {
      title: "服务商配置",
      value: `${enabledProviders} / ${state.providers.length || 0}`,
      description: "仅统计配置开关，不触发真实连接或外部调用",
      badge: "本地状态",
    },
  ] as const;

  return (
    <div className="grid gap-5">
      {state.error ? (
        <div className="rounded-lg border border-warning bg-card px-4 py-3 text-sm text-warning">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {summaryCards.map((card) => (
          <Card key={card.title} className="grid gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{card.title}</h2>
              <Badge variant={card.badge === "正常" ? "success" : "muted"}>{card.badge}</Badge>
            </div>
            <p className="text-[28px] font-bold leading-none tracking-normal text-foreground">
              {loading ? "--" : card.value}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">{card.description}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">最近操作</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            最近 5 条后台审计日志，敏感字段由后端脱敏。
          </p>
        </div>
        {state.auditLogs.length > 0 ? (
          <Table>
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">时间</th>
                <th className="px-3 py-2.5">操作</th>
                <th className="px-3 py-2.5">对象</th>
                <th className="px-3 py-2.5">操作者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.auditLogs.map((log) => (
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
          <EmptyState title="暂无最近操作" description="有配置或校准操作后会显示在这里。" />
        )}
      </Card>
    </div>
  );
}
