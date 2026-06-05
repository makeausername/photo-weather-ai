"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { sanitizeAuthErrorMessage } from "../../../components/auth-errors";
import { ThemeToggle } from "../../../components/theme-toggle";
import { Button, Card, FormField, Input } from "../../../components/ui";
import { clearAdminSession, loginAdmin, sessionHasAdminAccess } from "../admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    <main className="min-h-screen bg-background px-4 py-5 text-foreground sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3">
          <img src="/brand-mark.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
          <span className="grid leading-tight">
            <span className="text-lg font-bold">逐光天气</span>
            <span className="text-xs text-muted-foreground">管理控制台</span>
          </span>
        </a>
        <ThemeToggle compact />
      </div>

      <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-[1180px] gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
        <div className="hidden min-w-0 lg:block">
          <p className="text-sm font-semibold text-primary">后台运营</p>
          <h1 className="mt-4 max-w-2xl text-[38px] font-bold leading-tight tracking-normal text-foreground">
            管理地点、机位与服务商配置
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">
            控制台用于维护逐光天气的本地资料、模拟服务商配置和审计记录。密钥保存后仅展示脱敏结果。
          </p>
          <div className="mt-6 grid max-w-2xl gap-3 md:grid-cols-3">
            {["地点资料", "服务商配置", "审计日志"].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
                <p className="text-sm font-semibold text-card-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="w-full p-6 shadow-soft sm:p-7">
          <div className="mb-6">
            <div className="mb-4 inline-flex rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              逐光天气管理后台
            </div>
            <h2 className="text-2xl font-bold tracking-normal text-foreground">后台登录</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              请使用初始化脚本创建的超级管理员账号登录。
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
                className="rounded-lg border border-danger bg-card px-3 py-2 text-sm leading-6 text-danger"
              >
                {status}
              </div>
            ) : null}
            <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "正在登录..." : "登录"}
            </Button>
            <a
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
            >
              返回前台
            </a>
          </form>
        </Card>
      </section>
    </main>
  );
}
