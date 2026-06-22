"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, EmptyState, Table } from "../../../components/ui";
import { adminApiFetch } from "../admin-api";
import type {
  AdminAuditLog,
  AdminPaymentOrderListResponse,
  AdminUserListResponse,
  SafeProviderConfig,
} from "../admin-api";

type DashboardState = {
  readonly settingsOk: boolean | null;
  readonly providers: SafeProviderConfig[];
  readonly auditLogs: AdminAuditLog[];
  readonly userSummary: AdminUserListResponse["summary"] | null;
  readonly orderSummary: AdminPaymentOrderListResponse["summary"] | null;
  readonly error?: string;
};

const initialState: DashboardState = {
  settingsOk: null,
  providers: [],
  auditLogs: [],
  userSummary: null,
  orderSummary: null,
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
      const [settingsResult, providersResult, auditResult, usersResult, ordersResult] =
        await Promise.allSettled([
          adminApiFetch<{ readonly settings: unknown[] }>("/admin/settings"),
          adminApiFetch<{ readonly providers: SafeProviderConfig[] }>("/admin/providers"),
          adminApiFetch<{ readonly logs: AdminAuditLog[] }>("/admin/audit-logs?limit=5"),
          adminApiFetch<AdminUserListResponse>("/admin/users?pageSize=1"),
          adminApiFetch<AdminPaymentOrderListResponse>("/admin/orders?pageSize=1"),
        ]);

      if (cancelled) {
        return;
      }

      setState({
        settingsOk: settingsResult.status === "fulfilled",
        providers: providersResult.status === "fulfilled" ? providersResult.value.providers : [],
        auditLogs: auditResult.status === "fulfilled" ? auditResult.value.logs : [],
        userSummary: usersResult.status === "fulfilled" ? usersResult.value.summary : null,
        orderSummary: ordersResult.status === "fulfilled" ? ordersResult.value.summary : null,
        error:
          settingsResult.status === "rejected" &&
          providersResult.status === "rejected" &&
          auditResult.status === "rejected" &&
          usersResult.status === "rejected" &&
          ordersResult.status === "rejected"
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
      title: "用户运营",
      value: state.userSummary
        ? `${state.userSummary.activeUsers} / ${state.userSummary.totalUsers}`
        : "--",
      description: "活跃用户 / 用户总数",
      badge: "运营",
    },
    {
      title: "订单收入",
      value: state.orderSummary
        ? `¥${(state.orderSummary.totalRevenueCents / 100).toFixed(2)}`
        : "--",
      description: state.orderSummary
        ? `${state.orderSummary.paidOrders} 笔已支付，今日 ¥${(state.orderSummary.todayRevenueCents / 100).toFixed(2)}`
        : "等待订单统计",
      badge: "订单",
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

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/users"
          className="rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-primary hover:bg-secondary"
        >
          <p className="text-sm font-semibold text-muted-foreground">运营模块</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">用户管理</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            查看账号、角色、订单、积分、查询历史、会话和审计记录。
          </p>
        </Link>
        <Link
          href="/admin/orders"
          className="rounded-lg border border-border bg-card p-5 shadow-sm transition hover:border-primary hover:bg-secondary"
        >
          <p className="text-sm font-semibold text-muted-foreground">运营模块</p>
          <h2 className="mt-2 text-xl font-bold text-foreground">订单管理</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            查看支付订单、通知、权益发放、积分流水和安全操作。
          </p>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">最近操作</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            展示近期后台操作，系统会保留必要的安全记录。
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
          <EmptyState title="暂无最近操作" description="有配置或校准操作后会显示在这里。" />
        )}
      </Card>
    </div>
  );
}
