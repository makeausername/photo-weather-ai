"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentAccountSession,
  shouldShowAdminEntry,
  type PublicAccountSession,
} from "../../components/account-session";
import { Badge, Card } from "../../components/ui";

const accountSections = [
  {
    id: "queries",
    title: "查询历史",
    description: "后续用于查看历史拍摄天气分析、筛选地点和复用查询条件。",
  },
  {
    id: "favorites",
    title: "收藏机位",
    description: "后续用于保存常用机位、拍摄方向和个人备注。",
  },
  {
    id: "plan",
    title: "套餐权益",
    description: "后续用于查看套餐状态、权益额度和到期信息。",
  },
  {
    id: "reports",
    title: "报告管理",
    description: "后续用于管理已生成的拍摄分析报告和导出记录。",
  },
] as const;

type LoadState = "loading" | "ready";

export function AccountCenterClient() {
  const [state, setState] = useState<LoadState>("loading");
  const [session, setSession] = useState<PublicAccountSession | null>(null);

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

  if (state === "loading") {
    return (
      <Card className="p-5 shadow-sm">
        <p className="text-sm leading-6 text-muted-foreground">正在读取账户状态...</p>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card className="grid gap-4 border-warning p-5 shadow-sm">
        <div>
          <Badge variant="warning">尚未登录</Badge>
          <h2 className="mt-3 text-xl font-bold text-card-foreground">需要登录后查看账户中心</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            用户登录功能将在后续接入。当前页面先作为账户中心入口占位，管理员仍可通过后台登录访问控制台。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
          >
            前往登录
          </Link>
          <Link
            href="/#analysis"
            className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
          >
            开始分析
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5">
      <Card className="p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant="success">已登录</Badge>
            <h2 className="mt-3 text-xl font-bold text-card-foreground">
              {session.user.displayName || session.user.email}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              账户中心将用于统一查看查询历史、收藏机位、套餐权益和报告管理。
            </p>
          </div>
          <Badge variant="muted">账户功能占位</Badge>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2">
        {accountSections.map((section) => (
          <div key={section.id} id={section.id}>
            <Card className="h-full p-5 shadow-sm">
              <h2 className="text-lg font-bold text-card-foreground">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
            </Card>
          </div>
        ))}
      </section>

      {shouldShowAdminEntry(session) ? (
        <Card className="border-primary p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-card-foreground">管理后台</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                进入系统配置、服务商配置、地点与机位管理。
              </p>
            </div>
            <Link
              href="/admin"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
            >
              管理后台
            </Link>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
