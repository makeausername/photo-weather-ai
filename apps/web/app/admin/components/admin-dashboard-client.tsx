"use client";

import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, Table } from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type {
  AdminAuditLog,
  AdminLocation,
  AdminPhotoSpot,
  SafeProviderConfig,
} from "../admin-api";

type DashboardState = {
  readonly settingsOk: boolean | null;
  readonly providers: SafeProviderConfig[];
  readonly locations: AdminLocation[];
  readonly photoSpots: AdminPhotoSpot[];
  readonly auditLogs: AdminAuditLog[];
  readonly error?: string;
};

const initialState: DashboardState = {
  settingsOk: null,
  providers: [],
  locations: [],
  photoSpots: [],
  auditLogs: [],
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

export function AdminDashboardClient() {
  const [state, setState] = useState<DashboardState>(initialState);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      const [settingsResult, providersResult, locationsResult, spotsResult, auditResult] =
        await Promise.allSettled([
          adminApiFetch<{ readonly settings: unknown[] }>("/admin/settings"),
          adminApiFetch<{ readonly providers: SafeProviderConfig[] }>("/admin/providers"),
          adminApiFetch<{ readonly locations: AdminLocation[] }>("/admin/locations"),
          adminApiFetch<{ readonly photoSpots: AdminPhotoSpot[] }>("/admin/photo-spots"),
          adminApiFetch<{ readonly logs: AdminAuditLog[] }>("/admin/audit-logs?limit=5"),
        ]);

      if (cancelled) {
        return;
      }

      setState({
        settingsOk: settingsResult.status === "fulfilled",
        providers: providersResult.status === "fulfilled" ? providersResult.value.providers : [],
        locations: locationsResult.status === "fulfilled" ? locationsResult.value.locations : [],
        photoSpots: spotsResult.status === "fulfilled" ? spotsResult.value.photoSpots : [],
        auditLogs: auditResult.status === "fulfilled" ? auditResult.value.logs : [],
        error:
          settingsResult.status === "rejected" &&
          providersResult.status === "rejected" &&
          locationsResult.status === "rejected" &&
          spotsResult.status === "rejected"
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
    {
      title: "地点数量",
      value: String(state.locations.length),
      description: "来自地点管理接口；接口不可用时显示 0",
      badge: "地点",
    },
    {
      title: "机位数量",
      value: String(state.photoSpots.length),
      description: "来自机位管理接口；接口不可用时显示 0",
      badge: "机位",
    },
  ] as const;

  return (
    <div className="grid gap-5">
      {state.error ? (
        <div className="rounded-lg border border-warning bg-card px-4 py-3 text-sm text-warning">
          {state.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
          <EmptyState title="暂无最近操作" description="有配置、地点或机位变更后会显示在这里。" />
        )}
      </Card>
    </div>
  );
}
