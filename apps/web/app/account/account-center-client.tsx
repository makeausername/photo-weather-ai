"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCurrentAccountSession,
  logoutPublicAccount,
  shouldShowAdminEntry,
  type PublicAccountSession,
} from "../../components/account-session";
import type { AccountRole } from "../admin/admin-api";
import { Badge, Button, Card, cn } from "../../components/ui";

type LoadState = "loading" | "ready";

const emptyValue = "暂无数据";

const roleLabels: Record<string, string> = {
  super_admin: "超级管理员",
  admin: "管理员",
  user: "普通用户",
};

const statusLabels: Record<string, string> = {
  active: "正常",
  disabled: "已停用",
  pending: "待确认",
};

export const accountCenterSectionLabels = [
  "账户总览",
  "资料信息",
  "偏好设置",
  "安全与登录",
  "快捷入口",
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
          登录后可管理账户信息，并继续使用逐光天气的拍摄判断工具。
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
}: {
  readonly session: PublicAccountSession;
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
}) {
  return (
    <div className="grid gap-5">
      <AccountStatusHero session={session} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <div className="grid gap-5">
          <ProfileCard session={session} />
          <PreferencesCard session={session} />
        </div>

        <div className="grid content-start gap-5">
          <SecurityCard session={session} onLogout={onLogout} isLoggingOut={isLoggingOut} />
          <QuickActionsCard />
          {shouldShowAdminEntry(session) ? <AdminAccessCard /> : null}
        </div>
      </div>
    </div>
  );
}

function AccountStatusHero({ session }: { readonly session: PublicAccountSession }) {
  const roleText = formatAccountRoleLabels(session.roles, session.roleCodes);
  const statusText = formatStatus(session.user.status);
  const displayName = session.user.displayName || session.user.email;

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] lg:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">已登录</Badge>
            <Badge variant={statusBadgeVariant(session.user.status)}>{statusText}</Badge>
            <Badge variant="muted">{roleText}</Badge>
          </div>
          <h2 className="mt-4 break-words text-2xl font-bold leading-tight text-card-foreground sm:text-[30px]">
            {displayName}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            管理你的登录信息、安全状态和逐光天气使用入口。
          </p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <SummaryField label="最近登录" value={formatOptionalDateTime(session.user.lastLoginAt)} />
          <SummaryField label="注册时间" value={formatOptionalDateTime(session.user.createdAt)} />
          <SummaryField label="账户角色" value={roleText} />
        </dl>
      </div>
    </Card>
  );
}

function ProfileCard({ session }: { readonly session: PublicAccountSession }) {
  const roleText = formatAccountRoleLabels(session.roles, session.roleCodes);
  const statusText = formatStatus(session.user.status);

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-card-foreground">资料信息</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        当前账户的基础身份信息和可见状态。
      </p>
      <dl className="mt-5 grid gap-3 text-sm">
        <AccountField label="邮箱" value={session.user.email} />
        <AccountField label="显示名称" value={session.user.displayName} />
        <AccountField label="用户角色" value={roleText} />
        <AccountField label="当前状态" value={statusText} />
        <AccountField label="注册时间" value={formatOptionalDateTime(session.user.createdAt)} />
        <AccountField
          label="最近登录时间"
          value={formatOptionalDateTime(session.user.lastLoginAt)}
        />
      </dl>
    </Card>
  );
}

function PreferencesCard({ session }: { readonly session: PublicAccountSession }) {
  if (!session.profile) {
    return (
      <Card className="p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-card-foreground">偏好设置</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          账户偏好将在保存后显示。
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-card-foreground">偏好设置</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        与账户资料绑定的显示偏好。
      </p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <AccountField label="单位制" value={formatPreferredUnits(session.profile.preferredUnits)} />
        <AccountField
          label="界面语言"
          value={formatPreferredLanguage(session.profile.preferredLanguage)}
        />
      </dl>
    </Card>
  );
}

function SecurityCard({
  session,
  onLogout,
  isLoggingOut,
}: {
  readonly session: PublicAccountSession;
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
}) {
  const statusText = formatStatus(session.user.status);

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-card-foreground">安全与登录</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        查看当前登录身份，并在需要时退出账户。
      </p>
      <dl className="mt-5 grid gap-3 text-sm">
        <AccountField label="登录邮箱" value={session.user.email} />
        <AccountField label="账户状态" value={statusText} />
        <AccountField label="最近登录时间" value={formatOptionalDateTime(session.user.lastLoginAt)} />
      </dl>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="mt-4 w-full"
        disabled={isLoggingOut}
        onClick={onLogout}
      >
        {isLoggingOut ? "正在退出..." : "退出登录"}
      </Button>
    </Card>
  );
}

const quickActionLinks = [
  { href: "/#analysis", label: "首页 / 开始判断" },
  { href: "/cloud-sea", label: "云海" },
  { href: "/glow", label: "朝霞晚霞" },
  { href: "/astro", label: "星空银河" },
  { href: "/pricing", label: "定价" },
] as const;

function QuickActionsCard() {
  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-card-foreground">快捷入口</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        继续使用逐光天气的常用页面。
      </p>
      <div className="mt-5 grid gap-2">
        {quickActionLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
          >
            <span>{item.label}</span>
            <span className="text-muted-foreground">访问</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function AdminAccessCard() {
  return (
    <Card className="border-primary p-5 shadow-sm sm:p-6">
      <Badge variant="muted">管理员</Badge>
      <h2 className="mt-3 text-lg font-bold text-card-foreground">管理后台</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        管理系统配置、服务商配置和地点数据。
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

function SummaryField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted px-4 py-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-bold text-card-foreground">
        {value || emptyValue}
      </dd>
    </div>
  );
}

function AccountField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-muted px-4 py-3">
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

function roleDisplayText(role: AccountRole): string {
  if (typeof role === "string") {
    return roleLabels[role] ?? roleLabels[role.toLowerCase()] ?? role;
  }

  const code = role.code ?? undefined;
  const codeLabel = code ? (roleLabels[code] ?? roleLabels[code.toLowerCase()]) : undefined;
  if (codeLabel) {
    return codeLabel;
  }

  return role.displayName ?? role.display_name ?? role.name ?? code ?? "自定义角色";
}

export function formatAccountRoleLabels(
  roles: readonly AccountRole[],
  roleCodes: readonly string[] = [],
): string {
  if (roles.length === 0 && roleCodes.length === 0) {
    return emptyValue;
  }

  const values = new Map<string, string>();
  for (const role of roles) {
    const key = roleCodeOf(role) ?? roleDisplayText(role);
    values.set(key, roleDisplayText(role));
  }
  for (const roleCode of roleCodes) {
    if (!values.has(roleCode)) {
      values.set(roleCode, roleLabels[roleCode] ?? roleCode);
    }
  }

  return [...values.values()].join("、");
}

function formatStatus(status: string | null): string {
  if (!status) {
    return emptyValue;
  }

  return statusLabels[status] ?? "未知状态";
}

type AccountBadgeVariant = "success" | "warning" | "danger" | "muted" | "info";

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

function formatPreferredUnits(value: string | null): string {
  if (!value) {
    return emptyValue;
  }

  const labels: Record<string, string> = {
    metric: "公制单位",
    imperial: "英制单位",
  };

  return labels[value] ?? value;
}

function formatPreferredLanguage(value: string | null): string {
  if (!value) {
    return emptyValue;
  }

  const labels: Record<string, string> = {
    "zh-CN": "简体中文",
    "en-US": "English",
  };

  return labels[value] ?? value;
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
