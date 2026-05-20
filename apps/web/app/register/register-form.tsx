"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { registerPublicAccount } from "../../components/account-session";
import { Badge, Button, Card, FormField, Input } from "../../components/ui";

export const publicRegisterFormLabels = [
  "昵称",
  "邮箱",
  "密码",
  "确认密码",
  "注册",
  "已有账户，去登录",
] as const;

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!email.trim()) {
      setStatus("请输入邮箱。");
      return;
    }

    if (password.length < 8) {
      setStatus("密码至少需要 8 个字符。");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("两次输入的密码不一致。");
      return;
    }

    setIsSubmitting(true);
    try {
      await registerPublicAccount({
        email: email.trim(),
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });

      const params = new URLSearchParams({
        registered: "1",
        email: email.trim(),
      });
      router.replace(`/login?${params.toString()}`);
    } catch (error) {
      setStatus((error as Error).message || "注册失败，请检查输入后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="p-5 shadow-soft sm:p-6">
      <div className="mb-5">
        <Badge variant="muted">新账户</Badge>
        <h2 className="mt-3 text-xl font-bold text-card-foreground">创建逐光天气账户</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          用于保存拍摄天气查询记录、收藏机位和后续报告管理。
        </p>
      </div>

      <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <FormField label="昵称" hint="可选，最多 40 个字符。">
          <Input
            type="text"
            autoComplete="nickname"
            placeholder="请输入昵称"
            value={displayName}
            maxLength={40}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </FormField>
        <FormField label="邮箱">
          <Input
            type="email"
            autoComplete="email"
            placeholder="请输入邮箱"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </FormField>
        <FormField label="密码" hint="至少 8 个字符。">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="请输入密码"
            value={password}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>
        <FormField label="确认密码">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="请再次输入密码"
            value={confirmPassword}
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </FormField>

        {status ? (
          <div className="rounded-lg border border-danger bg-card px-3 py-2 text-sm leading-6 text-danger">
            {status}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Button type="submit" size="lg" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "正在注册..." : "注册"}
          </Button>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
          >
            已有账户，去登录
          </Link>
        </div>
      </form>
    </Card>
  );
}
