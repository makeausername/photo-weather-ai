"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  FormField,
  Input,
  Select,
  Table,
  cn,
} from "../../../components/ui";
import { safeDisplayNameFromUser } from "../../../components/display-labels";
import {
  createAdminUser,
  disableAdminUser,
  enableAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  revokeAdminUserSessions,
  type AdminUserListItem,
  type AdminUserListResponse,
} from "../admin-api";
import {
  AdminActionToast,
  type AdminActionFeedback,
  type AdminActionFeedbackInput,
} from "./admin-action-feedback";
import { getAdaptiveGridClassName, getAdaptiveGridItemClassName } from "./admin-adaptive-grid";

type PendingAction =
  | { readonly kind: "disable"; readonly user: AdminUserListItem }
  | { readonly kind: "enable"; readonly user: AdminUserListItem }
  | { readonly kind: "reset"; readonly user: AdminUserListItem }
  | { readonly kind: "revoke"; readonly user: AdminUserListItem };

const initialResponse: AdminUserListResponse = {
  items: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  },
  summary: {
    totalUsers: 0,
    activeUsers: 0,
    disabledUsers: 0,
    todayNewUsers: 0,
    paidUsers: 0,
    totalPaidAmountCents: 0,
  },
};

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

function statusBadge(status: string) {
  return status === "active" ? (
    <Badge variant="success">启用</Badge>
  ) : (
    <Badge variant="danger">禁用</Badge>
  );
}

function roleLabels(roleCodes: readonly string[]): string {
  if (roleCodes.length === 0) {
    return "未分配";
  }
  const labels: Record<string, string> = {
    user: "用户",
    admin: "管理员",
    super_admin: "超级管理员",
  };
  return roleCodes.map((roleCode) => labels[roleCode] ?? "自定义角色").join(" / ");
}

function summaryCards(response: AdminUserListResponse) {
  return [
    { title: "用户总数", value: response.summary.totalUsers },
    { title: "活跃用户", value: response.summary.activeUsers },
    { title: "禁用用户", value: response.summary.disabledUsers },
    { title: "今日新增", value: response.summary.todayNewUsers },
    { title: "付费用户", value: response.summary.paidUsers },
    { title: "总支付金额", value: formatMoney(response.summary.totalPaidAmountCents) },
  ];
}

export function AdminUsersClient() {
  const [response, setResponse] = useState<AdminUserListResponse>(initialResponse);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("正在加载用户...");
  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    role: "all",
    hasOrders: "",
    hasCredits: "",
    createdFrom: "",
    createdTo: "",
  });
  const [createForm, setCreateForm] = useState({
    email: "",
    phone: "",
    displayName: "",
    password: "",
    generatePassword: true,
    role: "user",
  });
  const [showCreate, setShowCreate] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<AdminActionFeedback | null>(null);
  const actionToastId = useRef(0);

  function showActionToast(feedback: AdminActionFeedbackInput) {
    actionToastId.current += 1;
    setActionToast({ id: actionToastId.current, ...feedback });
  }

  const query = useMemo(
    () => ({
      q: filters.q,
      status: filters.status,
      role: filters.role,
      hasOrders: filters.hasOrders,
      hasCredits: filters.hasCredits,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      pageSize: 20,
    }),
    [filters],
  );

  async function loadUsers() {
    setLoading(true);
    try {
      const next = await fetchAdminUsers(query);
      setResponse(next);
      setStatus(`已加载 ${next.pagination.total} 个用户。`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, [query]);

  async function submitCreateUser() {
    const roleCodes =
      createForm.role === "user" ? ["user"] : ["user", createForm.role].filter(Boolean);
    showActionToast({
      variant: "saving",
      title: "创建用户",
      message: "正在创建用户...",
    });
    try {
      const result = await createAdminUser({
        email: createForm.email || null,
        phone: createForm.phone || null,
        displayName: createForm.displayName || null,
        password: createForm.generatePassword ? undefined : createForm.password,
        generatePassword: createForm.generatePassword,
        roleCodes,
      });
      setTemporaryPassword(result.generatedPassword);
      setStatus("用户已创建。");
      showActionToast({
        variant: "success",
        title: "创建用户",
        message: "用户已创建。",
      });
      setShowCreate(false);
      setCreateForm({
        email: "",
        phone: "",
        displayName: "",
        password: "",
        generatePassword: true,
        role: "user",
      });
      await loadUsers();
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "创建用户",
        message,
      });
    }
  }

  async function runPendingAction() {
    if (!pendingAction) {
      return;
    }
    const actionUserLabel = safeDisplayNameFromUser(pendingAction.user);
    showActionToast({
      variant: "saving",
      title: "用户操作",
      message: `正在处理「${actionUserLabel}」...`,
    });
    try {
      if (pendingAction.kind === "disable") {
        await disableAdminUser(pendingAction.user.id);
        setStatus("用户已禁用，活跃会话已撤销。");
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: "用户已禁用，活跃会话已撤销。",
        });
      }
      if (pendingAction.kind === "enable") {
        await enableAdminUser(pendingAction.user.id);
        setStatus("用户已启用。");
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: "用户已启用。",
        });
      }
      if (pendingAction.kind === "reset") {
        const result = await resetAdminUserPassword(pendingAction.user.id);
        setTemporaryPassword(result.generatedPassword);
        setStatus("临时密码已生成，会话已撤销。");
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: "临时密码已生成，请查看页面提示。",
        });
      }
      if (pendingAction.kind === "revoke") {
        const result = await revokeAdminUserSessions(pendingAction.user.id);
        setStatus(`已撤销 ${result.revokedSessionCount} 个会话。`);
        showActionToast({
          variant: "success",
          title: "用户操作",
          message: `已撤销 ${result.revokedSessionCount} 个会话。`,
        });
      }
      setPendingAction(null);
      await loadUsers();
    } catch (error) {
      const message = (error as Error).message;
      setStatus(message);
      showActionToast({
        variant: "error",
        title: "用户操作",
        message,
      });
      setPendingAction(null);
    }
  }

  const summaryCardItems = summaryCards(response);
  const filterFieldCount = 6;
  const createFieldCount = 6;

  return (
    <div className="grid gap-5">
      <AdminActionToast feedback={actionToast} onDismiss={() => setActionToast(null)} />
      <div
        className={getAdaptiveGridClassName(summaryCardItems.length, {
          variant: "metric",
          allowThreeMetricColumns: true,
        })}
      >
        {summaryCardItems.map((card, index) => (
          <Card
            key={card.title}
            className={cn(
              getAdaptiveGridItemClassName(summaryCardItems.length, index, {
                variant: "metric",
                allowThreeMetricColumns: true,
              }),
              "grid gap-2 p-4",
            )}
          >
            <p className="text-xs font-semibold text-muted-foreground">{card.title}</p>
            <p className="text-2xl font-bold text-foreground">{loading ? "--" : card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="grid gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div
            className={cn(
              "flex-1",
              getAdaptiveGridClassName(filterFieldCount, { variant: "form" }),
            )}
          >
            <FormField label="搜索">
              <Input
                value={filters.q}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, q: event.target.value }))
                }
                placeholder="邮箱、手机号或昵称"
              />
            </FormField>
            <FormField label="状态">
              <Select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="all">全部</option>
                <option value="active">启用</option>
                <option value="disabled">禁用</option>
              </Select>
            </FormField>
            <FormField label="角色">
              <Select
                value={filters.role}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, role: event.target.value }))
                }
              >
                <option value="all">全部</option>
                <option value="user">用户</option>
                <option value="admin">管理员</option>
                <option value="super_admin">超级管理员</option>
              </Select>
            </FormField>
            <FormField label="订单">
              <Select
                value={filters.hasOrders}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, hasOrders: event.target.value }))
                }
              >
                <option value="">全部</option>
                <option value="true">有订单</option>
                <option value="false">无订单</option>
              </Select>
            </FormField>
            <FormField label="积分">
              <Select
                value={filters.hasCredits}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, hasCredits: event.target.value }))
                }
              >
                <option value="">全部</option>
                <option value="true">有积分</option>
                <option value="false">无积分</option>
              </Select>
            </FormField>
            <FormField label="创建日期">
              <Input
                type="date"
                value={filters.createdFrom}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, createdFrom: event.target.value }))
                }
              />
            </FormField>
          </div>
          <Button onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? "收起创建" : "新建用户"}
          </Button>
        </div>
        <Badge variant={loading ? "muted" : "info"} className="w-fit">
          {status}
        </Badge>
      </Card>

      {temporaryPassword ? (
        <Card className="border-warning p-4">
          <p className="text-sm font-semibold text-warning-strong">临时密码仅显示一次</p>
          <p className="mt-2 break-all rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
            {temporaryPassword}
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            onClick={() => setTemporaryPassword(null)}
          >
            已记录
          </Button>
        </Card>
      ) : null}

      {showCreate ? (
        <Card className="grid gap-4 p-4">
          <div>
            <h2 className="text-lg font-bold">新建用户</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              邮箱或手机号至少填写一个；生成的临时密码只会在创建成功后显示一次。
            </p>
          </div>
          <div className={getAdaptiveGridClassName(createFieldCount, { variant: "form" })}>
            <FormField label="邮箱">
              <Input
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </FormField>
            <FormField label="手机号">
              <Input
                value={createForm.phone}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </FormField>
            <FormField label="显示名称">
              <Input
                value={createForm.displayName}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, displayName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="角色">
              <Select
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, role: event.target.value }))
                }
              >
                <option value="user">用户</option>
                <option value="admin">管理员</option>
                <option value="super_admin">超级管理员</option>
              </Select>
            </FormField>
            <FormField label="密码">
              <Input
                type="password"
                disabled={createForm.generatePassword}
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder={createForm.generatePassword ? "自动生成" : "至少 8 位"}
              />
            </FormField>
            <label className="flex items-center gap-2 pt-7 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                checked={createForm.generatePassword}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    generatePassword: event.target.checked,
                  }))
                }
              />
              生成临时密码
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button onClick={submitCreateUser}>创建用户</Button>
          </div>
        </Card>
      ) : null}

      {response.items.length > 0 ? (
        <Table aria-label="用户管理列表">
          <thead className="bg-muted text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5">用户</th>
              <th className="px-3 py-2.5">联系方式</th>
              <th className="px-3 py-2.5">角色</th>
              <th className="px-3 py-2.5">状态</th>
              <th className="px-3 py-2.5">会员</th>
              <th className="px-3 py-2.5">订单/支付</th>
              <th className="px-3 py-2.5">积分</th>
              <th className="px-3 py-2.5">最近登录</th>
              <th className="px-3 py-2.5">创建时间</th>
              <th className="px-3 py-2.5">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {response.items.map((user) => (
              <tr key={user.id}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{safeDisplayNameFromUser(user)}</p>
                  <p className="text-xs text-muted-foreground">
                    {user.displayName ? "显示名称" : "账户标识"}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  <p>{user.emailMasked ?? "-"}</p>
                  <p>{user.phoneMasked ?? "-"}</p>
                </td>
                <td className="px-3 py-2.5 text-card-foreground">{roleLabels(user.roleCodes)}</td>
                <td className="px-3 py-2.5">{statusBadge(user.status)}</td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-card-foreground">
                    {user.access.currentPlanName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.access.entitlementExpiresAt
                      ? `${formatDate(user.access.entitlementExpiresAt)} 到期`
                      : user.access.hasFullAccess
                        ? "不限套餐"
                        : "免费/已过期"}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold">
                    {user.orderCount} 单 / {user.paidOrderCount} 已付
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(user.totalPaidAmountCents)}
                  </p>
                </td>
                <td className="px-3 py-2.5 font-semibold">{user.currentCreditBalance}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {formatDate(user.lastLoginAt)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{formatDate(user.createdAt)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/admin/users/${encodeURIComponent(user.id)}`}
                      className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-semibold hover:border-primary"
                    >
                      查看
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setPendingAction({
                          kind: user.status === "active" ? "disable" : "enable",
                          user,
                        })
                      }
                    >
                      {user.status === "active" ? "禁用" : "启用"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPendingAction({ kind: "reset", user })}
                    >
                      重置密码
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingAction({ kind: "revoke", user })}
                    >
                      撤销会话
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState
          title={loading ? "正在加载用户" : "没有匹配用户"}
          description="调整搜索、状态、角色或日期筛选后可继续查看运营用户。"
        />
      )}

      <ConfirmDialog
        open={pendingAction !== null}
        title={
          pendingAction?.kind === "disable"
            ? "确认禁用用户"
            : pendingAction?.kind === "enable"
              ? "确认启用用户"
              : pendingAction?.kind === "reset"
                ? "确认重置密码"
                : "确认撤销会话"
        }
        description={
          <span>
            {safeDisplayNameFromUser(pendingAction?.user)}
            {pendingAction?.kind === "reset"
              ? " 将获得一个只显示一次的临时密码。"
              : pendingAction?.kind === "revoke"
                ? " 的活跃登录会话会立即失效。"
                : " 的账号状态将被更新。"}
          </span>
        }
        confirmLabel="确认"
        cancelLabel="取消"
        confirmVariant={pendingAction?.kind === "enable" ? "success" : "danger"}
        onConfirm={runPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
