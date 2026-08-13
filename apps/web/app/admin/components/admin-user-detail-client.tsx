"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Table,
} from "../../../components/ui";
import {
  entitlementTypeDisplayName,
  ledgerReasonDisplayName,
  productDisplayName,
  safeDisplayNameFromUser,
} from "../../../components/display-labels";
import {
  disableAdminUser,
  enableAdminUser,
  fetchAdminUserDetail,
  resetAdminUserPassword,
  revokeAdminUserSessions,
  updateAdminUser,
  updateAdminUserRoles,
  type AdminUserDetail,
} from "../admin-api";
import {
  AdminActionToast,
  type AdminActionFeedback,
  type AdminActionFeedbackInput,
} from "./admin-action-feedback";
import { getAdaptiveGridClassName } from "./admin-adaptive-grid";

type TabKey = "overview" | "orders" | "credits" | "history" | "sessions" | "audit";
type PendingAction = "disable" | "enable" | "reset" | "revoke" | null;

const tabs: readonly { readonly key: TabKey; readonly label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "orders", label: "订单" },
  { key: "credits", label: "权益/积分" },
  { key: "history", label: "查询历史" },
  { key: "sessions", label: "会话安全" },
  { key: "audit", label: "审计记录" },
];

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
  });
}

function formatMoney(amountCents: number): string {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function roleLabel(roleCode: string): string {
  const labels: Record<string, string> = {
    user: "用户",
    admin: "管理员",
    super_admin: "超级管理员",
  };
  return labels[roleCode] ?? "自定义角色";
}

function statusBadge(status: string) {
  return status === "active" ? (
    <Badge variant="success">启用</Badge>
  ) : (
    <Badge variant="danger">禁用</Badge>
  );
}

function InfoItem({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="break-words text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

export function AdminUserDetailClient({ userId }: { readonly userId: string }) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [status, setStatus] = useState("正在加载用户详情...");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ email: "", phone: "", displayName: "" });
  const [roleCodes, setRoleCodes] = useState<readonly string[]>([]);
  const [actionToast, setActionToast] = useState<AdminActionFeedback | null>(null);
  const actionToastId = useRef(0);

  function showActionToast(feedback: AdminActionFeedbackInput) {
    actionToastId.current += 1;
    setActionToast({ id: actionToastId.current, ...feedback });
  }

  async function loadUser() {
    try {
      const next = await fetchAdminUserDetail(userId);
      setUser(next);
      setProfileForm({
        email: next.profile.email ?? "",
        phone: next.profile.phone ?? "",
        displayName: next.profile.displayName ?? "",
      });
      setRoleCodes(next.roleCodes);
      setStatus("用户详情已加载。");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  useEffect(() => {
    void loadUser();
  }, [userId]);

  async function saveProfile() {
    const userLabel = user ? safeDisplayNameFromUser(user.profile) : "用户";
    showActionToast({
      variant: "saving",
      title: "保存用户资料",
      message: `正在保存「${userLabel}」资料...`,
    });
    try {
      const next = await updateAdminUser(userId, {
        email: profileForm.email || null,
        phone: profileForm.phone || null,
        displayName: profileForm.displayName || null,
      });
      setUser(next);
      setStatus("资料已保存。");
      showActionToast({
        variant: "success",
        title: "保存用户资料",
        message: "资料已保存。",
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "保存用户资料",
        message,
      });
    }
  }

  async function saveRoles() {
    const userLabel = user ? safeDisplayNameFromUser(user.profile) : "用户";
    showActionToast({
      variant: "saving",
      title: "保存用户角色",
      message: `正在保存「${userLabel}」角色...`,
    });
    try {
      const next = await updateAdminUserRoles(userId, roleCodes);
      setUser(next);
      setRoleCodes(next.roleCodes);
      setStatus("角色已更新。");
      showActionToast({
        variant: "success",
        title: "保存用户角色",
        message: "角色已更新。",
      });
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "保存用户角色",
        message,
      });
    }
  }

  async function runPendingAction() {
    if (!pendingAction) {
      return;
    }
    const userLabel = user ? safeDisplayNameFromUser(user.profile) : "用户";
    showActionToast({
      variant: "saving",
      title: "用户操作",
      message: `正在处理「${userLabel}」...`,
    });
    try {
      if (pendingAction === "disable") {
        const result = await disableAdminUser(userId);
        setUser(result.user);
        setStatus("用户已禁用，活跃会话已撤销。");
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: "用户已禁用，活跃会话已撤销。",
        });
      }
      if (pendingAction === "enable") {
        setUser(await enableAdminUser(userId));
        setStatus("用户已启用。");
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: "用户已启用。",
        });
      }
      if (pendingAction === "reset") {
        const result = await resetAdminUserPassword(userId);
        setUser(result.user);
        setTemporaryPassword(result.generatedPassword);
        setStatus("临时密码已生成，会话已撤销。");
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: "临时密码已生成，请查看页面提示。",
        });
      }
      if (pendingAction === "revoke") {
        const result = await revokeAdminUserSessions(userId);
        setStatus(`已撤销 ${result.revokedSessionCount} 个会话。`);
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: `已撤销 ${result.revokedSessionCount} 个会话。`,
        });
        await loadUser();
      }
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "用户操作",
        message,
      });
    } finally {
      setPendingAction(null);
    }
  }

  function toggleRole(roleCode: string, checked: boolean) {
    setRoleCodes((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(roleCode);
      } else {
        next.delete(roleCode);
      }
      return [...next].sort();
    });
  }

  if (!user) {
    return (
      <Card>
        <EmptyState title="正在加载用户详情" description={status} />
      </Card>
    );
  }

  const userDisplayLabel = safeDisplayNameFromUser(user.profile);

  return (
    <div className="grid gap-5">
      <AdminActionToast feedback={actionToast} onDismiss={() => setActionToast(null)} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="grid gap-4 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-2xl font-bold text-foreground">
                  {userDisplayLabel}
                </h2>
                {statusBadge(user.profile.status)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={user.profile.status === "active" ? "danger" : "success"}
                onClick={() =>
                  setPendingAction(user.profile.status === "active" ? "disable" : "enable")
                }
              >
                {user.profile.status === "active" ? "禁用" : "启用"}
              </Button>
              <Button variant="secondary" onClick={() => setPendingAction("reset")}>
                重置密码
              </Button>
              <Button variant="secondary" onClick={() => setPendingAction("revoke")}>
                撤销所有会话
              </Button>
            </div>
          </div>
          <div
            className={getAdaptiveGridClassName(10, {
              variant: "metric",
              allowThreeMetricColumns: true,
            })}
          >
            <InfoItem label="会员套餐" value={user.access.currentPlanName} />
            <InfoItem
              label="会员到期"
              value={
                user.access.entitlementExpiresAt
                  ? formatDate(user.access.entitlementExpiresAt)
                  : "免费/不限"
              }
            />
            <InfoItem label="积分余额" value={user.creditBalance} />
            <InfoItem label="支付金额" value={formatMoney(user.summary.totalPaidAmountCents)} />
            <InfoItem
              label="订单数"
              value={`${user.summary.orderCount} / 已付 ${user.summary.paidOrderCount}`}
            />
            <InfoItem label="查询历史" value={user.summary.forecastHistoryCount} />
            <InfoItem label="活跃会话" value={user.summary.activeSessionCount} />
            <InfoItem label="最近登录" value={formatDate(user.profile.lastLoginAt)} />
            <InfoItem label="创建时间" value={formatDate(user.profile.createdAt)} />
            <InfoItem label="角色" value={user.roleCodes.map(roleLabel).join(" / ") || "未分配"} />
          </div>
        </Card>

        <Card className="grid gap-4 p-5">
          <div>
            <h2 className="text-lg font-bold">操作区</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              资料、密码、状态和角色变更都会写入审计日志。
            </p>
          </div>
          <Badge variant="info" className="w-fit">
            {status}
          </Badge>
          {temporaryPassword ? (
            <div className="rounded-md border border-warning bg-card p-3">
              <p className="text-xs font-semibold text-warning-strong">临时密码仅显示一次</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {temporaryPassword}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => setTemporaryPassword(null)}
              >
                已记录
              </Button>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <Button
            key={item.key}
            variant={tab === item.key ? "primary" : "secondary"}
            size="sm"
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className={getAdaptiveGridClassName(2, { breakpoint: "lg", gapClassName: "gap-4" })}>
          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-bold">编辑资料</h2>
            <div className="grid gap-3">
              <FormField label="邮箱">
                <Input
                  value={profileForm.email}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="手机号">
                <Input
                  value={profileForm.phone}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </FormField>
              <FormField label="显示名称">
                <Input
                  value={profileForm.displayName}
                  onChange={(event) =>
                    setProfileForm((current) => ({ ...current, displayName: event.target.value }))
                  }
                />
              </FormField>
            </div>
            <Button className="justify-self-start" onClick={saveProfile}>
              保存资料
            </Button>
          </Card>

          <Card className="grid gap-4 p-5">
            <h2 className="text-lg font-bold">角色管理</h2>
            <div className="grid gap-2">
              {["user", "admin", "super_admin"].map((roleCode) => (
                <label
                  key={roleCode}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <input
                    type="checkbox"
                    checked={roleCodes.includes(roleCode)}
                    onChange={(event) => toggleRole(roleCode, event.target.checked)}
                  />
                  {roleLabel(roleCode)}
                </label>
              ))}
            </div>
            <Button className="justify-self-start" onClick={saveRoles}>
              保存角色
            </Button>
          </Card>
        </div>
      ) : null}

      {tab === "orders" ? (
        user.recentOrders.length > 0 ? (
          <Table aria-label="用户订单">
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">订单号</th>
                <th className="px-3 py-2.5">产品</th>
                <th className="px-3 py-2.5">金额</th>
                <th className="px-3 py-2.5">状态</th>
                <th className="px-3 py-2.5">支付时间</th>
                <th className="px-3 py-2.5">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {user.recentOrders.map((order) => (
                <tr key={order.orderNo}>
                  <td className="px-3 py-2.5">
                    <Link
                      className="font-semibold text-primary"
                      href={`/admin/orders/${encodeURIComponent(order.orderNo)}`}
                    >
                      {order.orderNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{productDisplayName(order.productCode)}</td>
                  <td className="px-3 py-2.5">{formatMoney(order.amountCents)}</td>
                  <td className="px-3 py-2.5">{order.status}</td>
                  <td className="px-3 py-2.5">{formatDate(order.paidAt)}</td>
                  <td className="px-3 py-2.5">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="没有订单记录" description="该用户还没有产生订单。" />
        )
      ) : null}

      {tab === "credits" ? (
        <div className={getAdaptiveGridClassName(2, { breakpoint: "xl", gapClassName: "gap-4" })}>
          <Table aria-label="用户权益">
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">类型</th>
                <th className="px-3 py-2.5">数量</th>
                <th className="px-3 py-2.5">剩余</th>
                <th className="px-3 py-2.5">发放时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {user.entitlements.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5">{entitlementTypeDisplayName(item.type)}</td>
                  <td className="px-3 py-2.5">{item.quantity}</td>
                  <td className="px-3 py-2.5">{item.remainingQuantity ?? "-"}</td>
                  <td className="px-3 py-2.5">{formatDate(item.grantedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Table aria-label="用户积分流水">
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">变化</th>
                <th className="px-3 py-2.5">余额</th>
                <th className="px-3 py-2.5">原因</th>
                <th className="px-3 py-2.5">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {user.creditLedger.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5">{item.delta}</td>
                  <td className="px-3 py-2.5">{item.balanceAfter}</td>
                  <td className="px-3 py-2.5">{ledgerReasonDisplayName(item.reason)}</td>
                  <td className="px-3 py-2.5">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}

      {tab === "history" ? (
        user.recentForecastHistory.length > 0 ? (
          <Table aria-label="查询历史">
            <thead className="bg-muted text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">地点</th>
                <th className="px-3 py-2.5">目标</th>
                <th className="px-3 py-2.5">评分</th>
                <th className="px-3 py-2.5">建议</th>
                <th className="px-3 py-2.5">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {user.recentForecastHistory.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2.5">{item.locationName}</td>
                  <td className="px-3 py-2.5">{item.target}</td>
                  <td className="px-3 py-2.5">{item.overallScore ?? "-"}</td>
                  <td className="px-3 py-2.5">{item.recommendationLabel ?? "-"}</td>
                  <td className="px-3 py-2.5">{formatDate(item.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="没有查询历史" description="该用户还没有保存预测查询。" />
        )
      ) : null}

      {tab === "sessions" ? (
        <Table aria-label="用户会话">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">IP</th>
              <th className="px-3 py-2.5">User Agent</th>
              <th className="px-3 py-2.5">创建时间</th>
              <th className="px-3 py-2.5">过期时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {user.recentSessions.map((session) => (
              <tr key={session.id}>
                <td className="px-3 py-2.5">
                  {session.active ? (
                    <Badge variant="success">活跃</Badge>
                  ) : (
                    <Badge variant="muted">失效</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5">{session.ipAddress ?? "-"}</td>
                <td className="max-w-md break-words px-3 py-2.5">{session.userAgent ?? "-"}</td>
                <td className="px-3 py-2.5">{formatDate(session.createdAt)}</td>
                <td className="px-3 py-2.5">{formatDate(session.expiresAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      {tab === "audit" ? (
        <Table aria-label="用户审计记录">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">时间</th>
              <th className="px-3 py-2.5">操作</th>
              <th className="px-3 py-2.5">对象</th>
              <th className="px-3 py-2.5">操作者</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {user.recentAuditLogs.map((log) => (
              <tr key={log.id}>
                <td className="px-3 py-2.5">{formatDate(log.createdAt)}</td>
                <td className="px-3 py-2.5">{log.actionLabel}</td>
                <td className="px-3 py-2.5">
                  <div className="grid gap-0.5">
                    <span className="font-medium text-foreground">{log.targetLabel}</span>
                    <span className="text-xs text-muted-foreground">{log.targetSummary}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5">{log.actorLabel}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction === "disable"
            ? "确认禁用用户"
            : pendingAction === "enable"
              ? "确认启用用户"
              : pendingAction === "reset"
                ? "确认重置密码"
                : "确认撤销会话"
        }
        description={
          <span>
            {userDisplayLabel}
            {pendingAction === "reset"
              ? " 将获得一个只显示一次的临时密码。"
              : pendingAction === "revoke"
                ? " 的所有活跃会话会立即失效。"
                : " 的账号状态将被更新。"}
          </span>
        }
        confirmLabel="确认"
        cancelLabel="取消"
        confirmVariant={pendingAction === "enable" ? "success" : "danger"}
        onConfirm={runPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
