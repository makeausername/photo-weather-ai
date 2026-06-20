"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { sanitizeAuthErrorMessage } from "../../components/auth-errors";
import { loginPublicAccount } from "../../components/account-session";
import { Badge, Button, Card, FormField, Input } from "../../components/ui";

export const publicLoginFormLabels = [
  "邮箱或手机号",
  "密码",
  "登录",
  "创建账户",
  "返回首页",
] as const;

type LoginFormProps = {
  readonly initialIdentifier?: string;
  readonly registered?: boolean;
};

export function LoginForm({ initialIdentifier = "", registered = false }: LoginFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(registered ? "账户创建成功，请登录逐光天气。" : "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!identifier.trim()) {
      setStatus("请输入邮箱或手机号。");
      return;
    }

    if (!password) {
      setStatus("请输入密码。");
      return;
    }

    setIsSubmitting(true);
    try {
      await loginPublicAccount(identifier.trim(), password);
      router.replace("/account");
    } catch (error) {
      setStatus(sanitizeAuthErrorMessage((error as Error).message));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="p-5 shadow-soft sm:p-6">
      <div className="mb-5">
        <Badge variant="muted">账户</Badge>
        <h2 className="mt-3 text-xl font-bold text-card-foreground">登录逐光天气</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          登录后可进入账户中心，管理资料、安全信息和后台权限入口。
        </p>
      </div>

      <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <FormField label="邮箱或手机号">
          <Input
            type="text"
            autoComplete="username"
            placeholder="请输入邮箱或手机号"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </FormField>
        <FormField label="密码">
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="请输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>

        {status ? (
          <div
            role="alert"
            className="rounded-lg border border-info bg-card px-3 py-2 text-sm leading-6 text-info"
          >
            {status}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "正在登录..." : "登录"}
          </Button>
          <Link
            href="/register"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
          >
            创建账户
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
          >
            返回首页
          </Link>
        </div>
      </form>
    </Card>
  );
}
