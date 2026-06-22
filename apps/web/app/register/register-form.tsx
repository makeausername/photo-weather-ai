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
import { PasswordInput } from "../../components/password-input";
import { AuthCard, AuthStatusMessage } from "../../components/public-auth";
import { Button, FormField, Input, cn } from "../../components/ui";

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

type AuthFormStatusTone = "success" | "error" | "info";

export function buildRegisteredLoginHref(identifier: string): string {
  const params = new URLSearchParams({
    registered: "1",
    identifier,
  });
  return `/login?${params.toString()}`;
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
  const [statusTone, setStatusTone] = useState<AuthFormStatusTone>("info");
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
  const passwordRequirements = [
    { label: "至少 8 个字符", met: password.length >= 8 },
    { label: "两次输入一致", met: Boolean(confirmPassword) && password === confirmPassword },
  ] as const;

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
    setStatusTone("info");
    setCooldown(0);
  }

  async function handleSendCode() {
    setStatus("");
    setStatusTone("info");
    if (!targetIsValid) {
      setStatusTone("error");
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
      setStatusTone("success");
      setStatus("验证码已发送，请查收。");
      if (result.mockCode) {
        setCode(result.mockCode);
      }
    } catch (error) {
      setStatusTone("error");
      setStatus((error as Error).message || "验证码发送失败，请稍后重试。");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setStatusTone("info");

    if (!targetIsValid) {
      setStatusTone("error");
      setStatus(channel === "email" ? "请输入有效邮箱地址。" : "请输入有效手机号。");
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      setStatusTone("error");
      setStatus("请输入 6 位数字验证码。");
      return;
    }

    if (password.length < 8) {
      setStatusTone("error");
      setStatus("密码至少需要 8 个字符。");
      return;
    }

    if (password !== confirmPassword) {
      setStatusTone("error");
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

      router.replace(buildRegisteredLoginHref(target));
    } catch (error) {
      setStatusTone("error");
      setStatus((error as Error).message || "验证码错误或已过期，请重新获取。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      eyebrow="账户"
      title="创建账户"
      description="选择邮箱或短信验证，设置密码后就可以用这个账户登录。"
    >
      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/70 p-1"
        aria-label="注册方式"
      >
        {[
          { value: "email", label: "邮箱注册" },
          { value: "sms", label: "短信注册" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={cn(
              "h-10 rounded-md text-sm font-semibold transition",
              channel === item.value
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={channel === item.value}
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
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_136px]">
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
              className="w-full"
              disabled={!targetIsValid || cooldown > 0 || isSendingCode}
              onClick={() => void handleSendCode()}
            >
              {cooldown > 0 ? `${cooldown}s 后重发` : isSendingCode ? "发送中..." : "发送验证码"}
            </Button>
          </div>
        </FormField>

        <FormField label="密码" hint="至少 8 个字符。">
          <PasswordInput
            autoComplete="new-password"
            placeholder="请输入密码"
            value={password}
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </FormField>
        <FormField label="确认密码">
          <PasswordInput
            autoComplete="new-password"
            placeholder="请再次输入密码"
            value={confirmPassword}
            minLength={8}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </FormField>

        <div className="grid gap-2 rounded-lg border border-border bg-muted/35 p-3">
          <p className="text-xs font-bold text-card-foreground">密码要求</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {passwordRequirements.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "inline-flex items-center gap-2 text-xs font-medium",
                  item.met ? "text-success" : "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 rounded-full",
                    item.met ? "bg-success" : "bg-muted-foreground/45",
                  )}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        <AuthStatusMessage message={status} tone={statusTone} />

        <div className="grid gap-3">
          <Button type="submit" size="lg" disabled={!canRegister} className="h-11 w-full">
            {isSubmitting ? "正在注册..." : "注册"}
          </Button>
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-foreground"
          >
            已有账户，去登录
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
