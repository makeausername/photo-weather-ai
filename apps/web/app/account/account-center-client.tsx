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
  "账户概览",
  "我的查询",
  "收藏机位",
  "报告管理",
  "套餐权益",
  "安全设置",
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
    <Card className="grid gap-4 border-warning p-5 shadow-sm sm:p-6">
      <div>
        <Badge variant="warning">尚未登录</Badge>
        <h2 className="mt-3 text-xl font-bold text-card-foreground">请先登录后查看账户中心。</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          登录后可查看查询历史、收藏机位、保存报告和管理套餐权益。
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

function AuthenticatedAccountCenter({
  session,
  onLogout,
  isLoggingOut,
}: {
  readonly session: PublicAccountSession;
  readonly onLogout: () => void;
  readonly isLoggingOut: boolean;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.45fr)_minmax(240px,0.8fr)]">
      <div className="grid gap-5">
        <AccountOverview session={session} />
        <PlanCard />
      </div>

      <div className="grid gap-5">
        <PlaceholderCard
          id="queries"
          title="我的查询"
          description="暂无查询记录。完成一次拍摄天气分析后，将在这里显示历史记录。"
        />
        <PlaceholderCard
          id="favorites"
          title="收藏机位"
          description="暂无收藏机位。你可以在机位库中收藏常用拍摄点，便于快速分析。"
        />
        <PlaceholderCard
          id="reports"
          title="报告管理"
          description="暂无已保存报告。后续生成的拍摄天气报告会集中显示在这里。"
        />
      </div>

      <div className="grid content-start gap-5">
        <SecurityCard session={session} onLogout={onLogout} isLoggingOut={isLoggingOut} />
        {shouldShowAdminEntry(session) ? <AdminAccessCard /> : null}
      </div>
    </div>
  );
}

function AccountOverview({ session }: { readonly session: PublicAccountSession }) {
  const roleText = formatRoles(session.roles);
  const statusText = formatStatus(session.user.status);

  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="success">已登录</Badge>
          <h2 className="mt-3 text-xl font-bold text-card-foreground">账户概览</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            逐光天气账户中心会集中承载查询、收藏、报告和权益信息。
          </p>
        </div>
        <Badge variant="muted">基础体验</Badge>
      </div>

      <dl className="mt-5 grid gap-3 text-sm">
        <AccountField label="邮箱" value={session.user.email} />
        <AccountField label="昵称 / 显示名称" value={session.user.displayName} />
        <AccountField label="用户角色" value={roleText} />
        <AccountField label="当前状态" value={statusText} />
        <AccountField label="注册时间" value={formatOptionalDateTime(session.user.createdAt)} />
        <AccountField
          label="最近登录时间"
          value={formatOptionalDateTime(session.user.lastLoginAt)}
        />
        <AccountField label="当前权益" value="基础体验模式" />
      </dl>
    </Card>
  );
}

function PlaceholderCard({
  id,
  title,
  description,
}: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div id={id}>
      <Card className="p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <Badge variant="muted">即将开放</Badge>
        </div>
      </Card>
    </div>
  );
}

function PlanCard() {
  return (
    <div id="plan">
      <Card className="p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-card-foreground">套餐权益</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">当前为基础体验模式。</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              该功能将在后续版本开放。
            </p>
          </div>
          <Badge variant="info">规划中</Badge>
        </div>
      </Card>
    </div>
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
  return (
    <Card className="p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-bold text-card-foreground">安全设置</h2>
      <div className="mt-4 grid gap-3 text-sm">
        <AccountField label="登录邮箱" value={session.user.email} />
        <div className="rounded-lg border border-border bg-muted px-4 py-3">
          <p className="font-semibold text-card-foreground">修改密码</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            该功能将在后续版本开放。
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="mt-4"
        disabled={isLoggingOut}
        onClick={onLogout}
      >
        {isLoggingOut ? "正在退出..." : "退出登录"}
      </Button>
    </Card>
  );
}

function AdminAccessCard() {
  return (
    <Card className="border-primary p-5 shadow-sm sm:p-6">
      <Badge variant="success">管理员可见</Badge>
      <h2 className="mt-3 text-lg font-bold text-card-foreground">管理后台</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        进入系统配置、服务商配置、地点与机位管理。
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

function formatRoles(roles: readonly string[]): string {
  if (roles.length === 0) {
    return emptyValue;
  }

  return roles.map((role) => roleLabels[role] ?? "自定义角色").join("、");
}

function formatStatus(status: string | null): string {
  if (!status) {
    return emptyValue;
  }

  return statusLabels[status] ?? "未知状态";
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
