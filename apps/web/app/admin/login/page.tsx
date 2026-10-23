"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { sanitizeAuthErrorMessage } from "../../../components/auth-errors";
import { Button, Card, FormField, Input } from "../../../components/ui";
import {
  clearAdminSession,
  getCurrentAdmin,
  getStoredAdminTokens,
  loginAdmin,
  sessionHasAdminAccess,
} from "../admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!getStoredAdminTokens()) {
      return;
    }
    let active = true;
    void getCurrentAdmin()
      .then((session) => {
        if (active && sessionHasAdminAccess(session)) {
          const returnTo = new URLSearchParams(window.location.search).get("returnTo");
          router.replace(returnTo?.startsWith("/admin") ? returnTo : "/admin");
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    try {
      const session = await loginAdmin(email, password);
      if (!sessionHasAdminAccess(session)) {
        clearAdminSession();
        setStatus("当前账号没有后台访问权限。");
        return;
      }

      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      router.replace(returnTo?.startsWith("/admin") ? returnTo : "/admin");
    } catch (error) {
      setStatus(sanitizeAuthErrorMessage((error as Error).message));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-workspace aw-login px-4 py-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3">
          <img src="/brand-mark.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
          <span className="grid leading-tight">
            <span className="text-lg font-bold">逐光天气</span>
            <span className="text-xs text-muted-foreground">管理控制台</span>
          </span>
        </a>
      </div>

      <section className="mx-auto grid w-full max-w-[440px] py-12">
        <Card className="w-full p-6 shadow-lift sm:p-8">
          <div className="mb-6">
            <div className="mb-4 inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              逐光天气管理后台
            </div>
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground">后台登录</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              使用管理员账号登录。前台免费开放，管理操作仍需验证。
            </p>
          </div>
          <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
            <FormField label="邮箱">
              <Input
                type="email"
                autoComplete="email"
                placeholder="请输入管理员邮箱"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </FormField>
            <FormField label="密码">
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="请输入管理员密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </FormField>
            {status ? (
              <div
                role="alert"
                className="rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger"
              >
                {status}
              </div>
            ) : null}
            <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "正在登录…" : "登录"}
            </Button>
            <a
              href="/"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
            >
              返回前台
            </a>
          </form>
        </Card>
      </section>
    </main>
  );
}
