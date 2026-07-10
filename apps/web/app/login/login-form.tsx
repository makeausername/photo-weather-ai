"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { sanitizeAuthErrorMessage } from "../../components/auth-errors";
import {
  getCaptchaPublicConfig,
  loginPublicAccountBySms,
  loginPublicAccount,
  sendLoginSmsCode,
  type CaptchaPublicConfig,
} from "../../components/account-session";
import { AuthCard, AuthStatusMessage } from "../../components/public-auth";
import { PasswordInput } from "../../components/password-input";
import { runTencentCaptcha } from "../../components/tencent-captcha";
import { Button, cn, FormField, Input } from "../../components/ui";

export const publicLoginFormLabels = [
  "密码登录",
  "手机号验证码登录",
  "邮箱或手机号",
  "密码",
  "手机号",
  "发送验证码",
  "验证码",
  "登录",
  "创建账户",
  "返回首页",
] as const;

type LoginFormProps = {
  readonly initialIdentifier?: string;
  readonly registered?: boolean;
  readonly returnTo?: string | null;
};

type AuthFormStatusTone = "success" | "error" | "info";
type LoginMode = "password" | "sms";

export function safePublicLoginReturnTo(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  if (trimmed === "/admin" || trimmed.startsWith("/admin/")) {
    return null;
  }
  return trimmed;
}

function normalizePhoneInput(value: string): string {
  return value
    .replace(/[\s-]/g, "")
    .replace(/^\+?86/, "")
    .trim();
}

function isValidMainlandPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(normalizePhoneInput(value));
}

export function LoginForm({
  initialIdentifier = "",
  registered = false,
  returnTo = null,
}: LoginFormProps) {
  const router = useRouter();
  const safeReturnTo = safePublicLoginReturnTo(returnTo);
  const initialPhone = isValidMainlandPhone(initialIdentifier) ? initialIdentifier : "";
  const [loginMode, setLoginMode] = useState<LoginMode>("password");
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const [smsPhone, setSmsPhone] = useState(initialPhone);
  const [smsCode, setSmsCode] = useState("");
  const [smsTargetMasked, setSmsTargetMasked] = useState("");
  const [smsMockCode, setSmsMockCode] = useState("");
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [status, setStatus] = useState(
    registered ? "账户已创建，可以用刚才的邮箱或手机号登录。" : "",
  );
  const [statusTone, setStatusTone] = useState<AuthFormStatusTone>(registered ? "success" : "info");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingSmsCode, setIsSendingSmsCode] = useState(false);
  const [captchaConfig, setCaptchaConfig] = useState<CaptchaPublicConfig | null>(null);

  useEffect(() => {
    let active = true;
    void getCaptchaPublicConfig().then((config) => {
      if (active) {
        setCaptchaConfig(config);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (smsCooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSmsCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCooldown]);

  async function resolveLoginCaptcha() {
    const activeCaptchaConfig = captchaConfig ?? (await getCaptchaPublicConfig());
    if (!captchaConfig) {
      setCaptchaConfig(activeCaptchaConfig);
    }
    return activeCaptchaConfig.enabled && activeCaptchaConfig.enforceOnLogin
      ? runTencentCaptcha(activeCaptchaConfig, "login")
      : undefined;
  }

  function selectLoginMode(nextMode: LoginMode) {
    setLoginMode(nextMode);
    setStatus("");
    setStatusTone("info");
  }

  async function handleSendSmsCode() {
    setStatus("");
    setStatusTone("info");
    setSmsMockCode("");

    if (!isValidMainlandPhone(smsPhone)) {
      setStatusTone("error");
      setStatus("请输入有效中国大陆手机号。");
      return;
    }

    setIsSendingSmsCode(true);
    try {
      const captcha = await resolveLoginCaptcha();
      const result = await sendLoginSmsCode({
        phone: smsPhone.trim(),
        ...(captcha ? { captcha } : {}),
      });
      setSmsTargetMasked(result.targetMasked);
      setSmsMockCode(result.mockCode ?? "");
      setSmsCooldown(result.resendAfterSeconds);
      setStatusTone("success");
      setStatus(result.message ?? "如果该手机号已注册或已绑定，验证码将发送到该手机。");
    } catch (error) {
      setStatusTone("error");
      setStatus(sanitizeAuthErrorMessage((error as Error).message));
    } finally {
      setIsSendingSmsCode(false);
    }
  }

  async function handlePasswordSubmit() {
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
      const captcha = await resolveLoginCaptcha();
      await loginPublicAccount(identifier.trim(), password, captcha);
      router.replace(safeReturnTo ?? "/account");
    } catch (error) {
      setStatusTone("error");
      setStatus(sanitizeAuthErrorMessage((error as Error).message));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSmsSubmit() {
    setStatus("");
    setStatusTone("info");

    if (!isValidMainlandPhone(smsPhone)) {
      setStatusTone("error");
      setStatus("请输入有效中国大陆手机号。");
      return;
    }

    if (!/^\d{6}$/.test(smsCode.trim())) {
      setStatusTone("error");
      setStatus("请输入 6 位数字验证码。");
      return;
    }

    setIsSubmitting(true);
    try {
      await loginPublicAccountBySms({
        phone: smsPhone.trim(),
        code: smsCode.trim(),
      });
      router.replace(safeReturnTo ?? "/account");
    } catch (error) {
      setStatusTone("error");
      setStatus(sanitizeAuthErrorMessage((error as Error).message));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginMode === "sms") {
      await handleSmsSubmit();
      return;
    }

    await handlePasswordSubmit();
  }

  return (
    <AuthCard
      eyebrow="账户"
      title="登录"
      description="支持邮箱或手机号密码登录，也支持已绑定手机号接收验证码登录。"
    >
      <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
        <div
          role="tablist"
          aria-label="登录方式"
          className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          <button
            type="button"
            id="login-password-tab"
            role="tab"
            aria-selected={loginMode === "password"}
            aria-controls="login-password-panel"
            className={cn(
              "h-9 rounded-md px-3 text-sm font-semibold transition",
              loginMode === "password"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => selectLoginMode("password")}
          >
            密码登录
          </button>
          <button
            type="button"
            id="login-sms-tab"
            role="tab"
            aria-selected={loginMode === "sms"}
            aria-controls="login-sms-panel"
            className={cn(
              "h-9 rounded-md px-3 text-sm font-semibold transition",
              loginMode === "sms"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => selectLoginMode("sms")}
          >
            手机号验证码登录
          </button>
        </div>

        {loginMode === "password" ? (
          <div
            id="login-password-panel"
            role="tabpanel"
            aria-labelledby="login-password-tab"
            className="grid gap-4"
          >
            <FormField label="邮箱或手机号">
              <Input
                id="login-identifier"
                name="identifier"
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
                id="login-password"
                name="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </FormField>
          </div>
        ) : (
          <div
            id="login-sms-panel"
            role="tabpanel"
            aria-labelledby="login-sms-tab"
            className="grid gap-4"
          >
            <FormField label="手机号">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  id="login-sms-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="请输入已绑定手机号"
                  value={smsPhone}
                  onChange={(event) => setSmsPhone(event.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 w-full sm:w-36"
                  disabled={isSendingSmsCode || smsCooldown > 0}
                  onClick={() => void handleSendSmsCode()}
                >
                  {isSendingSmsCode
                    ? "正在发送..."
                    : smsCooldown > 0
                      ? `重新发送 ${smsCooldown}s`
                      : "发送验证码"}
                </Button>
              </div>
            </FormField>
            {smsTargetMasked ? (
              <p className="text-xs leading-5 text-muted-foreground">
                验证码已发送至 {smsTargetMasked}。
              </p>
            ) : null}
            {smsMockCode ? (
              <p className="text-xs leading-5 text-muted-foreground">测试验证码：{smsMockCode}</p>
            ) : null}
            <FormField label="验证码">
              <Input
                id="login-sms-code"
                name="code"
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="请输入 6 位验证码"
                value={smsCode}
                onChange={(event) => setSmsCode(event.target.value)}
                required
              />
            </FormField>
          </div>
        )}

        <AuthStatusMessage message={status} tone={statusTone} />

        <div className="grid gap-3">
          <Button type="submit" size="lg" disabled={isSubmitting} className="h-11 w-full">
            {isSubmitting ? "正在登录..." : "登录"}
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              href="/register"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-foreground"
            >
              创建账户
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-foreground"
            >
              返回首页
            </Link>
          </div>
        </div>
      </form>
    </AuthCard>
  );
}
