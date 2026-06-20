"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  confirmRegisterPublicAccount,
  sendRegisterVerificationCode,
  type RegisterVerificationChannel,
} from "../../components/account-session";
import { Badge, Button, Card, FormField, Input, cn } from "../../components/ui";

export const publicRegisterFormLabels = [
  "邮箱注册",
  "短信注册",
  "昵称",
  "邮箱",
  "手机号",
  "验证码",
  "发送验证码",
  "密码",
  "确认密码",
  "注册",
  "已有账户，去登录",
] as const;

function isTargetValid(channel: RegisterVerificationChannel, target: string): boolean {
  const value = target.trim();
  return channel === "email"
    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    : /^1[3-9]\d{9}$/.test(value);
}

export function RegisterForm() {
  const router = useRouter();
  const [channel, setChannel] = useState<RegisterVerificationChannel>("email");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const target = channel === "email" ? email.trim() : phone.trim();
  const targetIsValid = isTargetValid(channel, target);
  const canRegister = useMemo(
    () =>
      targetIsValid &&
      /^\d{6}$/.test(code.trim()) &&
      password.length >= 8 &&
      password === confirmPassword &&
      !isSubmitting,
    [code, confirmPassword, isSubmitting, password, targetIsValid],
  );

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function switchChannel(nextChannel: RegisterVerificationChannel) {
    setChannel(nextChannel);
    setCode("");
    setStatus("");
    setCooldown(0);
  }

  async function handleSendCode() {
    setStatus("");
    if (!targetIsValid) {
      setStatus(channel === "email" ? "请输入有效邮箱地址。" : "请输入有效手机号。");
      return;
    }

    setIsSendingCode(true);
    try {
      const result = await sendRegisterVerificationCode({
        channel,
        target,
      });
      setCooldown(result.resendAfterSeconds);
      setStatus("验证码已发送，请查收。");
      if (result.mockCode) {
        setCode(result.mockCode);
      }
    } catch (error) {
      setStatus((error as Error).message || "验证码发送失败，请稍后重试。");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");

    if (!targetIsValid) {
      setStatus(channel === "email" ? "请输入有效邮箱地址。" : "请输入有效手机号。");
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setStatus("请输入 6 位数字验证码。");
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
      await confirmRegisterPublicAccount({
        channel,
        target,
        code: code.trim(),
        password,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });

      const params = new URLSearchParams({
        registered: "1",
        identifier: target,
      });
      router.replace(`/login?${params.toString()}`);
    } catch (error) {
      setStatus((error as Error).message || "验证码错误或已过期，请重新获取。");
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
          使用邮箱或手机号完成验证，创建后可在账户中心管理资料和安全信息。
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted p-1">
        {[
          { value: "email", label: "邮箱注册" },
          { value: "sms", label: "短信注册" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={cn(
              "h-9 rounded-md text-sm font-semibold transition",
              channel === item.value
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => switchChannel(item.value as RegisterVerificationChannel)}
          >
            {item.label}
          </button>
        ))}
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

        {channel === "email" ? (
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
        ) : (
          <FormField label="手机号">
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="请输入中国大陆手机号"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </FormField>
        )}

        <FormField label="验证码">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="请输入 6 位验证码"
              value={code}
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!targetIsValid || cooldown > 0 || isSendingCode}
              onClick={() => void handleSendCode()}
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : isSendingCode ? "发送中..." : "发送验证码"}
            </Button>
          </div>
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
          <div className="rounded-lg border border-info bg-card px-3 py-2 text-sm leading-6 text-info">
            {status}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Button type="submit" size="lg" disabled={!canRegister} className="w-full">
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
