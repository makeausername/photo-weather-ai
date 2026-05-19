"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
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
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-10">
      <Card className="w-full max-w-md border-white/10 bg-white p-7 shadow-2xl">
        <div className="mb-7">
          <p className="text-sm font-semibold text-primary">风光天气 AI 管理后台</p>
          <h1 className="mt-3 text-3xl font-bold tracking-normal text-foreground">后台登录</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            请使用初始化脚本创建的超级管理员账号登录。
          </p>
        </div>
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <FormField label="邮箱">
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </FormField>
          <FormField label="密码">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </FormField>
          {status ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-700">
              {status}
            </div>
          ) : null}
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "正在登录..." : "登录"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
