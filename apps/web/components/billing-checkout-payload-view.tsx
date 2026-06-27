"use client";

import { useEffect, useRef } from "react";
import type { BillingCheckoutPayload } from "./account-session";
import { Button, cn } from "./ui";

type CheckoutPayloadViewProps = {
  readonly checkout: BillingCheckoutPayload;
  readonly autoRedirect?: boolean;
  readonly autoSubmit?: boolean;
  readonly className?: string;
};

export function CheckoutPayloadView({
  checkout,
  autoRedirect = false,
  autoSubmit = false,
  className,
}: CheckoutPayloadViewProps) {
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!autoRedirect || checkout.kind !== "redirect_url") {
      return;
    }
    window.location.assign(checkout.redirectUrl);
  }, [autoRedirect, checkout]);

  useEffect(() => {
    if (!autoSubmit || checkout.kind !== "form_post") {
      return;
    }
    const timer = window.setTimeout(() => {
      formRef.current?.submit();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [autoSubmit, checkout]);

  if (checkout.kind === "qr_code") {
    return (
      <div className={cn("rounded-lg border border-border bg-muted/30 p-4", className)}>
        <p className="text-sm font-bold text-card-foreground">微信扫码支付</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          请使用微信扫码完成支付。支付完成后，会员权益自动生效。
        </p>
        <p className="mt-3 break-all rounded-md bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          {checkout.codeUrl}
        </p>
        {checkout.message ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{checkout.message}</p>
        ) : null}
        <p className="mt-3 rounded-md border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          当前微信支付为扫码模式，手机端可使用另一台设备扫码，或返回选择支付宝。
        </p>
      </div>
    );
  }

  if (checkout.kind === "redirect_url") {
    return (
      <div className={cn("grid gap-2", className)}>
        {autoRedirect ? (
          <p className="text-sm font-semibold text-card-foreground">正在唤起支付...</p>
        ) : null}
        <a
          href={checkout.redirectUrl}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
        >
          继续完成支付
        </a>
        {checkout.message ? (
          <p className="text-xs leading-5 text-muted-foreground">{checkout.message}</p>
        ) : null}
      </div>
    );
  }

  if (checkout.kind === "form_post") {
    return (
      <form
        ref={formRef}
        action={checkout.actionUrl}
        method={checkout.method}
        acceptCharset={checkout.charset}
        className={cn("grid gap-2", className)}
      >
        {Object.entries(checkout.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        {autoSubmit ? (
          <p className="text-sm font-semibold text-card-foreground">正在跳转支付宝收银台...</p>
        ) : null}
        <Button type="submit" className="w-full">
          继续前往支付宝
        </Button>
        <p className="text-xs leading-5 text-muted-foreground">
          支付页面已生成，请继续完成支付。支付完成后，会员权益自动生效。
        </p>
        {checkout.message ? (
          <p className="text-xs leading-5 text-muted-foreground">{checkout.message}</p>
        ) : null}
      </form>
    );
  }

  if (checkout.kind === "form_html") {
    return (
      <p
        className={cn(
          "rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground",
          className,
        )}
      >
        支付页面已生成，请按页面提示继续完成支付。
      </p>
    );
  }

  return (
    <p
      className={cn(
        "rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground",
        className,
      )}
    >
      {checkout.message}
    </p>
  );
}
