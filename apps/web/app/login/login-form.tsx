"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { sanitizeAuthErrorMessage } from "../../components/auth-errors";
import { loginPublicAccount } from "../../components/account-session";
import { AuthCard, AuthStatusMessage } from "../../components/public-auth";
import { PasswordInput } from "../../components/password-input";
import { Button, FormField, Input } from "../../components/ui";

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

type AuthFormStatusTone = "success" | "error" | "info";

export function LoginForm({ initialIdentifier = "", registered = false }: LoginFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(registered ? "账户创建成功，请登录逐光天气。" : "");
  const [statusTone, setStatusTone] = useState<AuthFormStatusTone>(
    registered ? "success" : "info",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setStatusTone("info");

    if (!identifier.trim()) {
      setStatusTone("error");
      setStatus("请输入邮箱或手机号。");
      return;
    }

    if (!password) {
      setStatusTone("error");
      setStatus("请输入密码。");
      return;
    }

    setIsSubmitting(true);
    try {
      await loginPublicAccount(identifier.trim(), password);
      router.replace("/account");
    } catch (error) {
      setStatusTone("error");
      setStatus(sanitizeAuthErrorMessage((error as Error).message));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="账户登录"
      title="欢迎回来"
      description="使用邮箱或手机号登录，继续管理查询历史、订单权益和账户安全。"
    >
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
          <PasswordInput
            autoComplete="current-password"
            placeholder="请输入密码"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>

        <AuthStatusMessage message={status} tone={statusTone} />

        <div className="grid gap-3">
          <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 w-full">
            {isSubmitting ? "正在登录..." : "登录"}
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
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
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          管理员登录后，可在账户中心按权限进入后台运营控制台。
        </p>
      </form>
    </AuthCard>
  );
}
