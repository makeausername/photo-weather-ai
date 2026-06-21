"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  changeAccountPassword,
  confirmAccountEmail,
  confirmAccountPhone,
  deleteAccountForecastHistory,
  deletePublicAccount,
  getCurrentAccountSession,
  listAccountBillingOrders,
  listAccountEntitlements,
  listAccountForecastHistory,
  logoutPublicAccount,
  sendAccountEmailCode,
  sendAccountPhoneCode,
  shouldShowAdminEntry,
  type AccountBillingOrderRecord,
  type AccountEntitlementRecord,
  type AccountForecastHistoryRecord,
  type PublicAccountSession,
} from "../../components/account-session";
import type { AccountRole, JsonValue } from "../admin/admin-api";
import { Badge, Button, Card, FormField, Input, cn } from "../../components/ui";
import {
  forecastHorizonLabels,
  forecastTargetLabels,
  type ForecastHorizon,
  type ForecastTarget,
} from "@photo-weather/shared";

type LoadState = "loading" | "ready";
type FormState = "idle" | "loading" | "success" | "error";

const emptyValue = "暂无数据";

const statusLabels: Record<string, string> = {
  active: "正常",
  disabled: "已停用",
  pending: "待确认",
};

export const accountCenterSectionLabels = [
  "账户概览",
  "订单与权益",
  "账户资料",
  "安全设置",
  "查询历史",
  "绑定方式",
  "管理入口",
  "注销账户",
] as const;

export function AccountCenterClient() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>("loading");
  const [session, setSession] = useState<PublicAccountSession | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getCurrentAccountSession()
      .then((nextSession) => {
        if (!cancelled) {
          setSession(nextSession);
          setState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSession(null);
          setState("ready");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutPublicAccount();
      setSession(null);
      router.replace("/");
    } finally {
      setIsLoggingOut(false);
    }
  }

  function handleAccountDeleted() {
    setSession(null);
    router.replace("/");
  }

  if (state === "loading") {
    return (
      <Card className="p-5 shadow-sm">
        <p className="text-sm leading-6 text-muted-foreground">正在读取账户状态...</p>
      </Card>
    );
  }

  if (!session) {
    return <UnauthenticatedAccountPrompt />;
  }

  return (
    <AuthenticatedAccountCenter
      session={session}
      onLogout={() => void handleLogout()}
      isLoggingOut={isLoggingOut}
      onSessionUpdate={setSession}
      onAccountDeleted={handleAccountDeleted}
    />
  );
}

export function UnauthenticatedAccountPrompt() {
  return (
    <Card className="grid gap-4 p-5 shadow-sm sm:p-6">
      <div>
        <Badge variant="warning">尚未登录</Badge>
        <h2 className="mt-3 text-xl font-bold text-card-foreground">请先登录后查看账户中心。</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          登录后可管理账户资料、登录安全、绑定方式和查询历史。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
        >
          登录逐光天气
        </Link>
        <Link
          href="/register"
          className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
        >
          创建账户
        </Link>
      </div>
    </Card>
  );
}

export function AuthenticatedAccountCenter({
  session,
  onLogout,
  isLoggingOut,
  onSessionUpdate,
  onAccountDeleted,
  initialHistory,
  initialBillingSummary,
}: {
  readonly session: PublicAccountSession;
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
  readonly onSessionUpdate?: (session: PublicAccountSession) => void;
  readonly onAccountDeleted?: () => void;
  readonly initialHistory?: readonly AccountForecastHistoryRecord[];
  readonly initialBillingSummary?: {
    readonly orders: readonly AccountBillingOrderRecord[];
    readonly entitlements: readonly AccountEntitlementRecord[];
  };
}) {
  const showAdminEntry = shouldShowAdminEntry(session);

  return (
    <div className="grid gap-5">
      <AccountOverviewCard session={session} />
      <BillingSummaryCard initialSummary={initialBillingSummary} />
      <ForecastHistoryCard initialHistory={initialHistory} />

      <div
        className="grid gap-5 xl:grid-cols-2 xl:items-start"
        data-account-layout="balanced-columns"
      >
        <div className="grid gap-5">
          <ProfileCard session={session} />
          <SecuritySettingsCard
            onLogout={onLogout}
            isLoggingOut={isLoggingOut}
            onSessionUpdate={onSessionUpdate}
          />
          {showAdminEntry ? <AdminAccessCard /> : null}
        </div>
        <div className="grid gap-5">
          <ContactBindingCard session={session} onSessionUpdate={onSessionUpdate} />
          <DangerZoneCard onAccountDeleted={onAccountDeleted} />
        </div>
      </div>
    </div>
  );
}

function AccountOverviewCard({ session }: { readonly session: PublicAccountSession }) {
  const roleText = formatAccountRoleLabels(session.roles, session.roleCodes);
  const statusText = formatStatus(session.user.status);
  const accountIdentifier = primaryAccountIdentifier(session);
  const displayName = session.user.displayName || accountIdentifier;

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">已登录</Badge>
            <Badge variant={statusBadgeVariant(session.user.status)}>{statusText}</Badge>
            <Badge variant="muted">{roleText}</Badge>
          </div>
          <h2 className="mt-4 break-words text-2xl font-bold leading-tight text-card-foreground sm:text-[30px]">
            {displayName}
          </h2>
          <p className="mt-1 break-words text-sm font-medium text-muted-foreground">
            {accountIdentifier}
          </p>
        </div>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-3 lg:w-[520px]">
          <SummaryField label="账户角色" value={roleText} />
          <SummaryField label="最近登录" value={formatOptionalDateTime(session.user.lastLoginAt)} />
          <SummaryField label="注册时间" value={formatOptionalDateTime(session.user.createdAt)} />
        </dl>
      </div>
    </Card>
  );
}

function ProfileCard({ session }: { readonly session: PublicAccountSession }) {
  const statusText = formatStatus(session.user.status);

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <SectionTitle
        title="账户资料"
        description="查看当前账户的基础资料和公开显示信息。"
        aside={<Badge variant={statusBadgeVariant(session.user.status)}>{statusText}</Badge>}
      />
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <AccountField label="邮箱" value={session.user.email} />
        <AccountField label="手机号" value={session.user.phone} />
        <AccountField label="显示名称" value={session.user.displayName} />
        <AccountField label="账户状态" value={statusText} />
        <AccountField label="资料更新时间" value={formatOptionalDateTime(session.user.updatedAt)} />
        <AccountField
          label="最近登录时间"
          value={formatOptionalDateTime(session.user.lastLoginAt)}
        />
      </dl>
    </Card>
  );
}

function ContactBindingCard({
  session,
  onSessionUpdate,
}: {
  readonly session: PublicAccountSession;
  readonly onSessionUpdate?: (session: PublicAccountSession) => void;
}) {
  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <SectionTitle title="绑定方式" description="换绑邮箱或手机号时需要验证码和当前密码。" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <EmailBindingForm session={session} onSessionUpdate={onSessionUpdate} />
        <PhoneBindingForm session={session} onSessionUpdate={onSessionUpdate} />
      </div>
    </Card>
  );
}

function SecuritySettingsCard({
  onLogout,
  isLoggingOut,
  onSessionUpdate,
}: {
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
  readonly onSessionUpdate?: (session: PublicAccountSession) => void;
}) {
  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <SectionTitle title="安全设置" description="修改密码会保留当前会话，并撤销其他登录会话。" />
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start">
        <ChangePasswordForm onSessionUpdate={onSessionUpdate} />
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-bold text-card-foreground">当前会话</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            如需更换设备或结束本机登录，可直接退出账户。
          </p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="mt-4 w-full"
            disabled={isLoggingOut}
            onClick={onLogout}
          >
            {isLoggingOut ? "正在退出..." : "退出登录"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function BillingSummaryCard({
  initialSummary,
}: {
  readonly initialSummary?: {
    readonly orders: readonly AccountBillingOrderRecord[];
    readonly entitlements: readonly AccountEntitlementRecord[];
  };
}) {
  const [orders, setOrders] = useState<readonly AccountBillingOrderRecord[]>(
    initialSummary?.orders ?? [],
  );
  const [entitlements, setEntitlements] = useState<readonly AccountEntitlementRecord[]>(
    initialSummary?.entitlements ?? [],
  );
  const [state, setState] = useState<LoadState>(initialSummary ? "ready" : "loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (initialSummary) {
      setOrders(initialSummary.orders);
      setEntitlements(initialSummary.entitlements);
      setState("ready");
      setErrorMessage("");
      return () => {
        cancelled = true;
      };
    }

    Promise.all([listAccountBillingOrders({ limit: 5 }), listAccountEntitlements()])
      .then(([nextOrders, nextEntitlements]) => {
        if (!cancelled) {
          setOrders(nextOrders);
          setEntitlements(nextEntitlements);
          setState("ready");
          setErrorMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOrders([]);
          setEntitlements([]);
          setState("ready");
          setErrorMessage(error instanceof Error ? error.message : "订单与权益暂时无法加载。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialSummary]);

  const remainingCredits = entitlements
    .filter((item) => item.type === "forecast_credit")
    .reduce((total, item) => total + Math.max(0, item.remainingQuantity ?? 0), 0);
  const paidCount = orders.filter((order) => order.status === "paid").length;

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <SectionTitle
        title="订单与权益"
        description="仅展示订单状态和可用权益，不展示支付服务商原始回调、签名或密钥配置。"
        aside={<Badge variant="info">可用 {remainingCredits} 次</Badge>}
      />
      {state === "loading" ? (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          正在读取订单与权益...
        </p>
      ) : null}
      {errorMessage ? <StatusMessage state="error" message={errorMessage} /> : null}
      {state === "ready" && orders.length === 0 ? <BillingEmptyState /> : null}
      {orders.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <SummaryField label="可用预测次数" value={`${remainingCredits} 次`} />
            <SummaryField label="已支付订单" value={`${paidCount} 笔`} />
          </dl>
          <div className="grid gap-2">
            {orders.map((order) => (
              <BillingOrderRow key={order.orderNo} order={order} />
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function BillingEmptyState() {
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-bold text-card-foreground">暂无订单</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          购买预测次数后，订单状态和剩余权益会显示在这里。
        </p>
      </div>
      <Link
        href="/pricing"
        className="inline-flex h-9 w-fit items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
      >
        查看定价
      </Link>
    </div>
  );
}

function BillingOrderRow({ order }: { readonly order: AccountBillingOrderRecord }) {
  return (
    <article className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant={billingStatusVariant(order.status)}>{billingStatusLabel(order.status)}</Badge>
            <Badge variant="muted">{billingProviderLabel(order.provider)}</Badge>
          </div>
          <p className="mt-2 break-all text-sm font-bold text-card-foreground">
            {order.orderNo}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {order.productCode} · {formatPriceCny(order.amountCents)}
          </p>
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          {formatOptionalDateTime(order.createdAt)}
        </p>
      </div>
    </article>
  );
}

function ForecastHistoryCard({
  initialHistory,
}: {
  readonly initialHistory?: readonly AccountForecastHistoryRecord[];
}) {
  const [items, setItems] = useState<readonly AccountForecastHistoryRecord[] | null>(
    initialHistory ?? null,
  );
  const [state, setState] = useState<LoadState>(initialHistory === undefined ? "loading" : "ready");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (initialHistory !== undefined) {
      setItems(initialHistory);
      setState("ready");
      setErrorMessage("");
      return () => {
        cancelled = true;
      };
    }

    setState("loading");
    listAccountForecastHistory({ limit: 10 })
      .then((history) => {
        if (!cancelled) {
          setItems(history);
          setState("ready");
          setErrorMessage("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setItems([]);
          setState("ready");
          setErrorMessage(error instanceof Error ? error.message : "查询历史暂时无法加载。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialHistory]);

  async function handleDelete(id: string) {
    try {
      await deleteAccountForecastHistory(id);
      setItems((current) => current?.filter((item) => item.id !== id) ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除查询历史失败。");
    }
  }

  const history = items ?? [];

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <SectionTitle title="查询历史" description="最近成功分析的地点会保存在这里。" />
      {state === "loading" ? (
        <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          正在读取查询历史...
        </p>
      ) : null}
      {errorMessage ? <StatusMessage state="error" message={errorMessage} /> : null}
      {state === "ready" && history.length === 0 ? <HistoryEmptyState /> : null}
      {history.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {history.map((item) => (
            <HistoryRow key={item.id} item={item} onDelete={() => void handleDelete(item.id)} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function HistoryEmptyState() {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <p className="text-sm font-bold text-card-foreground">暂无查询历史</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        完成一次天气分析后，最近记录会自动出现在这里。
      </p>
      <Link
        href="/"
        className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
      >
        开始分析
      </Link>
    </div>
  );
}

function HistoryRow({
  item,
  onDelete,
}: {
  readonly item: AccountForecastHistoryRecord;
  readonly onDelete: () => void;
}) {
  const href = buildForecastHistoryHref(item);
  const targetLabel = targetLabelFor(item.target);
  const horizonLabel = horizonLabelFor(item.horizon);
  const scoreText =
    typeof item.overallScore === "number" && Number.isFinite(item.overallScore)
      ? `${Math.round(item.overallScore)} 分`
      : null;

  return (
    <article className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="muted">{targetLabel}</Badge>
            <Badge variant="muted">{horizonLabel}</Badge>
            {scoreText ? <Badge variant="info">{scoreText}</Badge> : null}
          </div>
          <h3 className="mt-2 break-words text-sm font-bold text-card-foreground">
            {item.locationName}
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {item.recommendationLabel || "结果摘要待补充"}
            {item.bestWindowStart ? ` · ${formatHistoryWindow(item)}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatOptionalDateTime(item.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {href ? (
            <Link
              href={href}
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
            >
              打开分析
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-muted-foreground">
              坐标不足
            </span>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            删除
          </Button>
        </div>
      </div>
    </article>
  );
}

function AdminAccessCard() {
  return (
    <Card className="border-primary p-5 shadow-sm">
      <Badge variant="muted">管理入口</Badge>
      <h2 className="mt-3 text-lg font-bold text-card-foreground">管理后台</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        管理系统配置、服务商配置和历史校准。
      </p>
      <Link
        href="/admin"
        className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
      >
        进入管理后台
      </Link>
    </Card>
  );
}

function DangerZoneCard({ onAccountDeleted }: { readonly onAccountDeleted?: () => void }) {
  return (
    <Card className="border-danger p-5 shadow-sm sm:p-6">
      <SectionTitle
        title="注销账户"
        description="注销后账户会被停用，邮箱和手机号会从账户资料中移除。"
        aside={<Badge variant="danger">危险操作</Badge>}
      />
      <DeleteAccountForm onAccountDeleted={onAccountDeleted} />
    </Card>
  );
}

function ChangePasswordForm({
  onSessionUpdate,
}: {
  readonly onSessionUpdate?: (session: PublicAccountSession) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [status, setStatus] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 8) {
      setStatus("error");
      setMessage("新密码至少需要 8 个字符。");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatus("error");
      setMessage("两次输入的新密码不一致。");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const nextSession = await changeAccountPassword({
        currentPassword,
        newPassword,
        confirmNewPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      onSessionUpdate?.(nextSession);
      setStatus("success");
      setMessage("密码已更新，其他设备登录已失效。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "密码修改失败。");
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
      <p className="text-sm font-bold text-card-foreground">修改密码</p>
      <FormField label="当前密码">
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="新密码">
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </FormField>
        <FormField label="确认新密码">
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
          />
        </FormField>
      </div>
      <Button type="submit" className="w-fit" disabled={status === "loading"}>
        {status === "loading" ? "正在保存..." : "保存新密码"}
      </Button>
      <StatusMessage state={status} message={message} />
    </form>
  );
}

function EmailBindingForm({
  session,
  onSessionUpdate,
}: {
  readonly session: PublicAccountSession;
  readonly onSessionUpdate?: (session: PublicAccountSession) => void;
}) {
  const [email, setEmail] = useState(session.user.email ?? "");
  const [code, setCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [status, setStatus] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSendCode() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus("error");
      setMessage("请输入有效邮箱地址。");
      return;
    }

    setSending(true);
    setMessage("");
    try {
      await sendAccountEmailCode({ email });
      setStatus("success");
      setMessage("邮箱验证码已发送。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "邮箱验证码发送失败。");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || !currentPassword) {
      setStatus("error");
      setMessage("请输入验证码和当前密码。");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const nextSession = await confirmAccountEmail({ email, code, currentPassword });
      setCode("");
      setCurrentPassword("");
      onSessionUpdate?.(nextSession);
      setStatus("success");
      setMessage("绑定邮箱已更新。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "绑定邮箱更新失败。");
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="text-sm font-bold text-card-foreground">修改绑定邮箱</p>
      <FormField label="邮箱">
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <FormField label="验证码">
          <Input
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </FormField>
        <Button
          type="button"
          variant="secondary"
          className="self-end"
          disabled={sending}
          onClick={() => void handleSendCode()}
        >
          {sending ? "发送中..." : "发送验证码"}
        </Button>
      </div>
      <FormField label="当前密码">
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormField>
      <Button type="submit" className="w-fit" disabled={status === "loading"}>
        {status === "loading" ? "正在确认..." : "确认换绑邮箱"}
      </Button>
      <StatusMessage state={status} message={message} />
    </form>
  );
}

function PhoneBindingForm({
  session,
  onSessionUpdate,
}: {
  readonly session: PublicAccountSession;
  readonly onSessionUpdate?: (session: PublicAccountSession) => void;
}) {
  const [phone, setPhone] = useState(session.user.phone ?? "");
  const [code, setCode] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [status, setStatus] = useState<FormState>("idle");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSendCode() {
    if (!/^(\+?86)?1[3-9]\d{9}$/.test(phone.trim().replace(/[\s-]/g, ""))) {
      setStatus("error");
      setMessage("请输入有效中国大陆手机号。");
      return;
    }

    setSending(true);
    setMessage("");
    try {
      await sendAccountPhoneCode({ phone });
      setStatus("success");
      setMessage("短信验证码已发送。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "短信验证码发送失败。");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code.trim() || !currentPassword) {
      setStatus("error");
      setMessage("请输入验证码和当前密码。");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const nextSession = await confirmAccountPhone({ phone, code, currentPassword });
      setCode("");
      setCurrentPassword("");
      onSessionUpdate?.(nextSession);
      setStatus("success");
      setMessage("绑定手机号已更新。");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "绑定手机号更新失败。");
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-muted/30 p-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p className="text-sm font-bold text-card-foreground">绑定/修改手机</p>
      <FormField label="手机号">
        <Input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <FormField label="验证码">
          <Input
            inputMode="numeric"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </FormField>
        <Button
          type="button"
          variant="secondary"
          className="self-end"
          disabled={sending}
          onClick={() => void handleSendCode()}
        >
          {sending ? "发送中..." : "发送验证码"}
        </Button>
      </div>
      <FormField label="当前密码">
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormField>
      <Button type="submit" className="w-fit" disabled={status === "loading"}>
        {status === "loading" ? "正在确认..." : "确认绑定手机"}
      </Button>
      <StatusMessage state={status} message={message} />
    </form>
  );
}

function DeleteAccountForm({ onAccountDeleted }: { readonly onAccountDeleted?: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [status, setStatus] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentPassword || !confirmation) {
      setStatus("error");
      setMessage("请输入当前密码并确认注销账户。");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      await deletePublicAccount({ currentPassword, confirmation });
      setStatus("success");
      setMessage("账户已注销。");
      onAccountDeleted?.();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "账户注销失败。");
    }
  }

  return (
    <form className="mt-4 grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
      <FormField label="当前密码">
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormField>
      <label className="flex items-start gap-3 rounded-lg border border-danger/60 bg-card p-3 text-sm">
        <input
          type="checkbox"
          checked={confirmation}
          onChange={(event) => setConfirmation(event.target.checked)}
          className="mt-1 h-4 w-4 rounded border-border text-danger"
        />
        <span className="leading-6 text-card-foreground">
          我确认注销当前账户，并理解该操作会撤销所有登录会话。
        </span>
      </label>
      <Button type="submit" variant="danger" className="w-fit" disabled={status === "loading"}>
        {status === "loading" ? "正在注销..." : "注销账户"}
      </Button>
      <StatusMessage state={status} message={message} />
    </form>
  );
}

function SectionTitle({
  title,
  description,
  aside,
}: {
  readonly title: string;
  readonly description?: string;
  readonly aside?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {aside}
    </div>
  );
}

function StatusMessage({
  state,
  message,
}: {
  readonly state: FormState;
  readonly message: string;
}) {
  if (!message || state === "idle" || state === "loading") {
    return null;
  }

  return (
    <p
      role={state === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-3 py-2 text-xs leading-5",
        state === "success"
          ? "border-success bg-card text-success"
          : "border-danger bg-card text-danger",
      )}
    >
      {message}
    </p>
  );
}

function primaryAccountIdentifier(session: PublicAccountSession): string {
  return session.user.email ?? session.user.phone ?? emptyValue;
}

function SummaryField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-card-foreground">
        {value || emptyValue}
      </dd>
    </div>
  );
}

function AccountField({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-1 rounded-lg border border-border bg-muted/40 px-3 py-2.5",
        className,
      )}
    >
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "break-words text-sm font-semibold text-card-foreground",
          !value && "text-muted-foreground",
        )}
      >
        {value || emptyValue}
      </dd>
    </div>
  );
}

function roleCodeOf(role: AccountRole): string | null {
  if (typeof role === "string") {
    return role;
  }

  return role.code ?? role.name ?? null;
}

export function formatAccountRoleLabels(
  roles: readonly AccountRole[],
  roleCodes: readonly string[] = [],
): string {
  const codes = new Set<string>();
  for (const role of roles) {
    const code = roleCodeOf(role);
    if (code) {
      codes.add(code.trim().toLowerCase());
    }
  }
  for (const roleCode of roleCodes) {
    codes.add(roleCode.trim().toLowerCase());
  }

  if (codes.has("super_admin")) {
    return "超级管理员";
  }
  if (codes.has("admin")) {
    return "管理员";
  }
  return "普通用户";
}

function formatStatus(status: string | null): string {
  if (!status) {
    return emptyValue;
  }

  return statusLabels[status] ?? "未知状态";
}

type AccountBadgeVariant = "success" | "warning" | "danger" | "muted" | "info";

function billingStatusLabel(status: AccountBillingOrderRecord["status"]): string {
  const labels: Record<AccountBillingOrderRecord["status"], string> = {
    created: "已创建",
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
    canceled: "已取消",
    failed: "支付失败",
    refunded: "已退款",
  };
  return labels[status];
}

function billingStatusVariant(status: AccountBillingOrderRecord["status"]): AccountBadgeVariant {
  if (status === "paid") {
    return "success";
  }
  if (status === "pending" || status === "created") {
    return "warning";
  }
  if (status === "failed" || status === "refunded") {
    return "danger";
  }
  return "muted";
}

function billingProviderLabel(provider: AccountBillingOrderRecord["provider"]): string {
  if (provider === "wechat_pay") {
    return "微信支付";
  }
  if (provider === "alipay") {
    return "支付宝";
  }
  return "模拟支付";
}

function formatPriceCny(amountCents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function statusBadgeVariant(status: string | null): AccountBadgeVariant {
  if (status === "active") {
    return "success";
  }

  if (status === "pending") {
    return "warning";
  }

  if (status === "disabled") {
    return "danger";
  }

  return "muted";
}

function formatOptionalDateTime(value: string | null): string {
  if (!value) {
    return emptyValue;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return emptyValue;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatHistoryWindow(item: AccountForecastHistoryRecord): string {
  if (!item.bestWindowStart || !item.bestWindowEnd) {
    return "窗口待确认";
  }

  const start = new Date(item.bestWindowStart);
  const end = new Date(item.bestWindowEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "窗口待确认";
  }

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: item.timezone ?? "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${formatter.format(start)}-${formatter.format(end)}`;
}

function targetLabelFor(target: string): string {
  return forecastTargetLabels[target as ForecastTarget] ?? target;
}

function horizonLabelFor(horizon: string): string {
  return forecastHorizonLabels[horizon as ForecastHorizon] ?? horizon;
}

export function buildForecastHistoryHref(record: AccountForecastHistoryRecord): string | null {
  const target = normalizeHistoryTarget(record.target);
  if (!target) {
    return null;
  }

  const queryRecord = isJsonRecord(record.queryJson) ? record.queryJson : {};
  const latitudeWgs84 =
    record.latitudeWgs84 ??
    readNumberField(queryRecord, "latitudeWgs84") ??
    readNumberField(queryRecord, "latWgs84");
  const longitudeWgs84 =
    record.longitudeWgs84 ??
    readNumberField(queryRecord, "longitudeWgs84") ??
    readNumberField(queryRecord, "lngWgs84");
  if (
    typeof latitudeWgs84 !== "number" ||
    typeof longitudeWgs84 !== "number" ||
    !Number.isFinite(latitudeWgs84) ||
    !Number.isFinite(longitudeWgs84)
  ) {
    return null;
  }

  const latitudeGcj02 =
    record.latitudeGcj02 ?? readNumberField(queryRecord, "latitudeGcj02") ?? latitudeWgs84;
  const longitudeGcj02 =
    record.longitudeGcj02 ?? readNumberField(queryRecord, "longitudeGcj02") ?? longitudeWgs84;
  const source = readStringField(queryRecord, "source") ?? "manual";
  const params = new URLSearchParams({
    from: "account_history",
    name: record.locationName,
    source,
    lat: String(latitudeGcj02),
    lng: String(longitudeGcj02),
    latGcj02: String(latitudeGcj02),
    lngGcj02: String(longitudeGcj02),
    latWgs84: String(latitudeWgs84),
    lngWgs84: String(longitudeWgs84),
    latitudeWgs84: String(latitudeWgs84),
    longitudeWgs84: String(longitudeWgs84),
    horizon: String(record.horizon),
    target,
  });

  setOptionalHistoryParam(
    params,
    "timezone",
    record.timezone ?? readStringField(queryRecord, "timezone"),
  );
  setOptionalHistoryParam(
    params,
    "elevationMeters",
    record.elevationMeters ?? readNumberField(queryRecord, "elevationMeters"),
  );
  setOptionalHistoryParam(
    params,
    "locationId",
    record.locationId ?? readStringField(queryRecord, "locationId"),
  );
  setOptionalHistoryParam(
    params,
    "photoSpotId",
    record.photoSpotId ?? readStringField(queryRecord, "photoSpotId"),
  );
  setOptionalHistoryParam(
    params,
    "coordinateSource",
    readStringField(queryRecord, "coordinateSource"),
  );
  setOptionalHistoryParam(
    params,
    "elevationSource",
    readStringField(queryRecord, "elevationSource"),
  );
  setOptionalHistoryParam(
    params,
    "elevationConfidence",
    readStringField(queryRecord, "elevationConfidence"),
  );

  return `${pathForHistoryTarget(target)}?${params.toString()}`;
}

function normalizeHistoryTarget(target: string): ForecastTarget | null {
  return target === "general" || target === "cloud_sea" || target === "glow" || target === "astro"
    ? target
    : null;
}

function pathForHistoryTarget(target: ForecastTarget): string {
  if (target === "general") {
    return "/forecast";
  }
  if (target === "cloud_sea") {
    return "/cloud-sea";
  }
  if (target === "glow") {
    return "/glow";
  }
  return "/astro";
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  value: { readonly [key: string]: JsonValue },
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function readNumberField(
  value: { readonly [key: string]: JsonValue },
  key: string,
): number | undefined {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function setOptionalHistoryParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    params.set(key, String(value));
  }
}
