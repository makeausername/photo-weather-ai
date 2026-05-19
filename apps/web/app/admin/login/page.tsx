"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { ThemeToggle } from "../../../components/theme-toggle";
import { Button, Card, FormField, Input } from "../../../components/ui";
import { clearAdminSession, loginAdmin } from "../admin-api";

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
      if (!session.permissions.includes("admin.manage")) {
        clearAdminSession();
        setStatus("当前账号没有后台访问权限。");
        return;
      }

      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      router.replace(returnTo?.startsWith("/admin") ? returnTo : "/admin");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <a href="/" className="flex items-center gap-3">
          <img src="/brand-mark.svg" alt="" className="h-10 w-10 shrink-0" aria-hidden="true" />
          <span className="grid leading-tight">
            <span className="text-lg font-bold">逐光天气管理后台</span>
            <span className="text-xs text-muted-foreground">运营控制台</span>
          </span>
        </a>
        <ThemeToggle compact />
      </div>

      <section className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl place-items-center py-10">
        <Card className="w-full max-w-md p-7 shadow-soft">
          <div className="mb-7">
            <div className="mb-5 inline-flex rounded-full border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              逐光天气管理后台
            </div>
            <h1 className="text-2xl font-bold tracking-normal text-foreground">后台登录</h1>
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
              <div className="rounded-lg border border-danger bg-card px-3 py-2 text-sm leading-6 text-danger">
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
