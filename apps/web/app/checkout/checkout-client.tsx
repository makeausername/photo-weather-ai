"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  createBillingOrder,
  getBillingOrder,
  getCurrentAccountSession,
  listPublicBillingPaymentMethods,
  listPublicBillingProducts,
  type AccountBillingOrderRecord,
  type BillingCheckoutPayload,
  type BillingPaymentProvider,
  type PublicBillingPaymentMethod,
  type PublicBillingProduct,
} from "../../components/account-session";
import { CheckoutPayloadView } from "../../components/billing-checkout-payload-view";
import { PublicShell } from "../../components/public-shell";
import { Badge, Button, Card, cn } from "../../components/ui";

export type CheckoutProductCode = "monthly_full" | "quarterly_full" | "yearly_full";

const checkoutProductCodes: readonly CheckoutProductCode[] = [
  "monthly_full",
  "quarterly_full",
  "yearly_full",
];

const checkoutProductCodeSet = new Set<string>(checkoutProductCodes);

const paymentProviderLabels = {
  alipay: { desktopLabel: "支付宝支付", mobileLabel: "打开支付宝支付" },
  wechat_pay: { desktopLabel: "微信扫码支付", mobileLabel: "打开微信支付" },
} as const satisfies Record<
  BillingPaymentProvider,
  {
    readonly desktopLabel: string;
    readonly mobileLabel: string;
  }
>;

type CheckoutClientProps = {
  readonly initialLoggedIn?: boolean | null;
  readonly initialPaymentMethods?: readonly PublicBillingPaymentMethod[];
  readonly initialProducts?: readonly PublicBillingProduct[];
  readonly paymentReturn?: string | null;
  readonly productCode?: string | null;
};

type AuthState = "checking" | "authenticated" | "guest";
export type PaymentMethodsState = "idle" | "loading" | "ready" | "error";
type ProductState = "idle" | "loading" | "ready" | "error";
export type PaymentClientMode = "desktop" | "mobile_browser" | "wechat_browser" | "alipay_browser";

type PaymentClientModeDetectionInput = {
  readonly maxTouchPoints?: number;
  readonly userAgent?: string;
  readonly viewportHeight?: number;
  readonly viewportWidth?: number;
};

export const checkoutClientLabels = [
  "确认支付",
  "选择支付方式",
  "支付宝支付",
  "微信扫码支付",
  "打开支付宝支付",
  "打开微信支付",
  "正在唤起支付宝...",
  "正在唤起微信支付...",
  "正在生成二维码...",
  "支付完成后，会员权益自动生效。",
  "返回定价",
  "当前暂未开放在线支付，请稍后再试。",
  "查看账户权益",
] as const;

export function isCheckoutProductCode(
  value: string | null | undefined,
): value is CheckoutProductCode {
  return Boolean(value && checkoutProductCodeSet.has(value));
}

export function checkoutPathForProduct(productCode: string): string {
  return `/checkout?product=${encodeURIComponent(productCode)}`;
}

export function detectPaymentClientMode(
  input: PaymentClientModeDetectionInput = {},
): PaymentClientMode {
  const userAgent =
    input.userAgent ??
    (typeof navigator !== "undefined" && typeof navigator.userAgent === "string"
      ? navigator.userAgent
      : "");

  if (/MicroMessenger/i.test(userAgent)) {
    return "wechat_browser";
  }

  if (/AlipayClient/i.test(userAgent)) {
    return "alipay_browser";
  }

  const maxTouchPoints =
    input.maxTouchPoints ??
    (typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number"
      ? navigator.maxTouchPoints
      : 0);
  const viewportWidth =
    input.viewportWidth ?? (typeof window !== "undefined" ? window.innerWidth : undefined);
  const viewportHeight =
    input.viewportHeight ?? (typeof window !== "undefined" ? window.innerHeight : undefined);
  const shortestViewportSide =
    typeof viewportWidth === "number" && typeof viewportHeight === "number"
      ? Math.min(viewportWidth, viewportHeight)
      : undefined;
  const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|Mobile|Windows Phone|HarmonyOS/i.test(
    userAgent,
  );
  const touchSizedViewport =
    maxTouchPoints > 0 && typeof shortestViewportSide === "number" && shortestViewportSide <= 900;
  const narrowViewport = typeof viewportWidth === "number" && viewportWidth <= 760;

  return mobileUserAgent || touchSizedViewport || narrowViewport ? "mobile_browser" : "desktop";
}

function checkoutReturnPathForProvider(
  productCode: string,
  provider: BillingPaymentProvider,
): string {
  return `${checkoutPathForProduct(productCode)}&payment_return=${encodeURIComponent(provider)}`;
}

function loginHrefForCheckout(checkoutPath: string): string {
  return `/login?returnTo=${encodeURIComponent(checkoutPath)}`;
}

function registerHrefForCheckout(checkoutPath: string): string {
  return `/register?returnTo=${encodeURIComponent(checkoutPath)}`;
}

function planOrder(code: string): number {
  const index = checkoutProductCodes.indexOf(code as CheckoutProductCode);
  return index >= 0 ? index : 99;
}

function filterCheckoutProducts(
  products: readonly PublicBillingProduct[] | undefined,
): readonly PublicBillingProduct[] {
  return products
    ? [...products]
        .filter((product) => isCheckoutProductCode(product.code))
        .sort((left, right) => planOrder(left.code) - planOrder(right.code))
    : [];
}

function filterPublicPaymentMethods(
  methods: readonly PublicBillingPaymentMethod[] | undefined,
): readonly PublicBillingPaymentMethod[] {
  return methods
    ? methods.filter(
        (method) =>
          method.enabled === true &&
          method.ready === true &&
          (method.provider === "alipay" || method.provider === "wechat_pay"),
      )
    : [];
}

function formatPrice(product: PublicBillingProduct): string {
  return product.priceText || formatPriceCents(product.amountCents);
}

function formatPriceCents(amountCents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

function displayProductName(product: PublicBillingProduct): string {
  return product.name || "套餐";
}

function paymentStatusLabel(status: AccountBillingOrderRecord["status"]): string {
  const labels: Record<AccountBillingOrderRecord["status"], string> = {
    created: "等待支付",
    pending: "等待支付",
    paid: "支付成功",
    closed: "未完成",
    canceled: "未完成",
    failed: "支付失败",
    refunded: "已退款",
  };
  return labels[status];
}

function paymentStatusMessage(order: AccountBillingOrderRecord): string {
  if (order.status === "paid") {
    return "支付成功，会员权益自动生效。";
  }
  if (order.status === "failed" || order.status === "closed" || order.status === "canceled") {
    return "支付未完成，请重新选择支付方式。";
  }
  if (order.status === "refunded") {
    return "支付已退款，权益状态以账户中心为准。";
  }
  return "支付完成后，会员权益自动生效。";
}

function isMobilePaymentClientMode(clientMode: PaymentClientMode): boolean {
  return clientMode !== "desktop";
}

function paymentButtonLabel(
  provider: BillingPaymentProvider,
  clientMode: PaymentClientMode,
  fallbackLabel?: string,
): string {
  const option = paymentProviderLabels[provider];
  const label = isMobilePaymentClientMode(clientMode) ? option.mobileLabel : option.desktopLabel;
  return label || fallbackLabel || "继续支付";
}

function paymentLoadingLabel(
  provider: BillingPaymentProvider,
  clientMode: PaymentClientMode,
): string {
  if (provider === "alipay") {
    return isMobilePaymentClientMode(clientMode) ? "正在唤起支付宝..." : "正在跳转支付宝...";
  }
  return isMobilePaymentClientMode(clientMode) ? "正在唤起微信支付..." : "正在生成二维码...";
}

function paymentCheckoutReadyMessage(
  provider: BillingPaymentProvider,
  clientMode: PaymentClientMode,
  checkout: BillingCheckoutPayload | null,
): string {
  if (!checkout) {
    return "";
  }
  if (checkout.kind === "redirect_url") {
    return paymentLoadingLabel(provider, clientMode);
  }
  if (provider === "alipay" && checkout.kind === "form_post") {
    return paymentLoadingLabel(provider, clientMode);
  }
  return "";
}

export function CheckoutClient({
  initialLoggedIn = null,
  initialPaymentMethods,
  initialProducts,
  paymentReturn,
  productCode,
}: CheckoutClientProps) {
  const selectedProductCode = isCheckoutProductCode(productCode) ? productCode : null;
  const initialCheckoutProducts = filterCheckoutProducts(initialProducts);
  const initialAvailablePaymentMethods = filterPublicPaymentMethods(initialPaymentMethods);
  const [products, setProducts] =
    useState<readonly PublicBillingProduct[]>(initialCheckoutProducts);
  const [productState, setProductState] = useState<ProductState>(
    selectedProductCode ? (initialProducts ? "ready" : "loading") : "idle",
  );
  const [paymentMethods, setPaymentMethods] = useState<readonly PublicBillingPaymentMethod[]>(
    initialAvailablePaymentMethods,
  );
  const [paymentMethodsState, setPaymentMethodsState] = useState<PaymentMethodsState>(
    selectedProductCode ? (initialPaymentMethods ? "ready" : "loading") : "idle",
  );
  const [authState, setAuthState] = useState<AuthState>(
    initialLoggedIn === true ? "authenticated" : initialLoggedIn === false ? "guest" : "checking",
  );
  const [checkout, setCheckout] = useState<BillingCheckoutPayload | null>(null);
  const [order, setOrder] = useState<AccountBillingOrderRecord | null>(null);
  const [submittingProvider, setSubmittingProvider] = useState<BillingPaymentProvider | null>(null);
  const [clientMode, setClientMode] = useState<PaymentClientMode>("desktop");
  const [message, setMessage] = useState("");
  const checkoutSubmissionRef = useRef(false);
  const checkoutRequestIdRef = useRef(0);

  const checkoutPath = selectedProductCode
    ? checkoutPathForProduct(selectedProductCode)
    : "/pricing";
  const selectedProduct = useMemo(
    () =>
      selectedProductCode
        ? products.find((product) => product.code === selectedProductCode) ?? null
        : null,
    [products, selectedProductCode],
  );
  const availablePaymentProviderSet = useMemo(
    () => new Set(paymentMethods.map((method) => method.provider)),
    [paymentMethods],
  );

  useEffect(() => {
    setClientMode(detectPaymentClientMode());
  }, []);

  useEffect(() => {
    checkoutRequestIdRef.current += 1;
    checkoutSubmissionRef.current = false;
    setCheckout(null);
    setOrder(null);
    setSubmittingProvider(null);
    setMessage("");
  }, [selectedProductCode]);

  useEffect(() => {
    if (!selectedProductCode) {
      setProductState("idle");
      return;
    }
    if (initialProducts) {
      return;
    }

    let cancelled = false;
    setProductState("loading");
    listPublicBillingProducts()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setProducts(filterCheckoutProducts(items));
        setProductState("ready");
      })
      .catch((error) => {
        if (!cancelled) {
          setProductState("error");
          setMessage(error instanceof Error ? error.message : "暂时无法读取套餐。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialProducts, selectedProductCode]);

  useEffect(() => {
    if (!selectedProductCode) {
      setPaymentMethods([]);
      setPaymentMethodsState("idle");
      return;
    }
    if (initialPaymentMethods) {
      setPaymentMethods(filterPublicPaymentMethods(initialPaymentMethods));
      setPaymentMethodsState("ready");
      return;
    }

    let cancelled = false;
    setPaymentMethodsState("loading");
    listPublicBillingPaymentMethods()
      .then((methods) => {
        if (cancelled) {
          return;
        }
        setPaymentMethods(filterPublicPaymentMethods(methods));
        setPaymentMethodsState("ready");
      })
      .catch((error) => {
        if (!cancelled) {
          setPaymentMethods([]);
          setPaymentMethodsState("error");
          setMessage(
            error instanceof Error ? error.message : "支付方式暂时不可用，请稍后再试。",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialPaymentMethods, selectedProductCode]);

  useEffect(() => {
    if (!selectedProductCode || initialLoggedIn !== null) {
      return;
    }

    let cancelled = false;
    setAuthState("checking");
    getCurrentAccountSession()
      .then((session) => {
        if (!cancelled) {
          setAuthState(session ? "authenticated" : "guest");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthState("guest");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialLoggedIn, selectedProductCode]);

  useEffect(() => {
    if (!order || order.status !== "pending") {
      return;
    }

    let active = true;
    const timer = window.setInterval(() => {
      void getBillingOrder(order.orderNo)
        .then((nextOrder) => {
          if (active) {
            setOrder(nextOrder);
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [order]);

  async function handleProviderPayment(nextProvider: BillingPaymentProvider) {
    if (checkoutSubmissionRef.current) {
      return;
    }
    if (!selectedProductCode || !selectedProduct) {
      setMessage("请选择有效套餐后继续支付。");
      return;
    }
    if (authState !== "authenticated") {
      setMessage("请先登录后继续支付。");
      return;
    }
    if (!availablePaymentProviderSet.has(nextProvider)) {
      setMessage("当前支付方式暂不可用，请刷新后重试。");
      return;
    }

    const productCode = selectedProduct.code;
    const nextClientMode = detectPaymentClientMode();
    const returnUrl = checkoutReturnPathForProvider(productCode, nextProvider);
    const requestId = checkoutRequestIdRef.current + 1;
    checkoutRequestIdRef.current = requestId;
    checkoutSubmissionRef.current = true;
    setClientMode(nextClientMode);
    setSubmittingProvider(nextProvider);
    setCheckout(null);
    setOrder(null);
    setMessage(paymentLoadingLabel(nextProvider, nextClientMode));
    try {
      const result = await createBillingOrder({
        productCode,
        provider: nextProvider,
        clientMode: nextClientMode,
        returnUrl,
      });
      if (checkoutRequestIdRef.current !== requestId) {
        return;
      }
      const nextCheckout = result.checkout ?? null;
      setOrder(result.order);
      setCheckout(nextCheckout);
      setMessage(paymentCheckoutReadyMessage(nextProvider, nextClientMode, nextCheckout));
    } catch (error) {
      if (checkoutRequestIdRef.current !== requestId) {
        return;
      }
      setMessage(error instanceof Error ? error.message : "生成支付请求失败，请稍后重试。");
    } finally {
      if (checkoutRequestIdRef.current === requestId) {
        checkoutSubmissionRef.current = false;
        setSubmittingProvider(null);
      }
    }
  }

  if (!selectedProductCode) {
    return (
      <CheckoutShell>
        <SafeCheckoutMessage
          title="无法继续支付"
          description="请选择有效套餐后继续支付。"
          actionLabel="返回定价"
          actionHref="/pricing"
        />
      </CheckoutShell>
    );
  }

  const productUnavailable = productState === "ready" && !selectedProduct;
  const submitting = Boolean(submittingProvider);

  return (
    <CheckoutShell>
      <div className="grid min-w-0 max-w-full gap-4">
        <header className="min-w-0">
          <Badge variant="muted">收银台</Badge>
          <h1 className="mt-3 text-2xl font-bold tracking-normal text-foreground sm:text-[30px]">
            确认支付
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            选择支付方式后将跳转到对应支付页面。支付完成后，会员权益自动生效。
          </p>
        </header>

        {paymentReturn ? <PaymentReturnNotice /> : null}

        {message ? (
          <p
            role="alert"
            className={cn(
              "rounded-lg border bg-card px-3 py-2 text-sm",
              productState === "error"
                ? "border-danger text-danger"
                : "border-border text-foreground",
            )}
          >
            {message}
          </p>
        ) : null}

        <Card className="grid min-w-0 max-w-full gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
          <PlanSummary product={selectedProduct} loading={productState === "loading"} />

          <div className="grid min-w-0 gap-4">
            {productUnavailable ? (
              <SafeCheckoutMessage
                compact
                title="套餐暂时不可用"
                description="请返回定价页重新选择套餐。"
                actionLabel="返回定价"
                actionHref="/pricing"
              />
            ) : null}

            {!productUnavailable && authState === "checking" ? (
              <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                正在确认账户状态...
              </p>
            ) : null}

            {!productUnavailable && authState === "guest" ? (
              <LoginPrompt checkoutPath={checkoutPath} />
            ) : null}

            {!productUnavailable && authState === "authenticated" ? (
              <CheckoutPaymentMethods
                clientMode={clientMode}
                paymentMethods={paymentMethods}
                paymentMethodsState={paymentMethodsState}
                selectedProduct={selectedProduct}
                submittingProvider={submittingProvider}
                onProviderPayment={(nextProvider) => void handleProviderPayment(nextProvider)}
              />
            ) : null}
          </div>

          {order ? (
            <PaymentActionPanel
              checkout={checkout}
              order={order}
              provider={
                order.provider === "alipay" || order.provider === "wechat_pay"
                  ? order.provider
                  : null
              }
              submitting={submitting}
            />
          ) : null}
        </Card>
      </div>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { readonly children: ReactNode }) {
  return (
    <PublicShell contentClassName="pb-10 sm:pb-12">
      <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-4">{children}</div>
    </PublicShell>
  );
}

function PlanSummary({
  loading,
  product,
}: {
  readonly loading: boolean;
  readonly product: PublicBillingProduct | null;
}) {
  return (
    <section className="grid min-w-0 gap-3">
      <div>
        <p className="text-sm font-semibold text-card-foreground">已选套餐</p>
        <dl className="mt-2 grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">套餐</dt>
            <dd className="text-right font-semibold text-card-foreground">
              {loading ? "正在读取套餐..." : product ? displayProductName(product) : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">金额</dt>
            <dd className="text-right font-semibold text-card-foreground">
              {product ? formatPrice(product) : "-"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">有效期</dt>
            <dd className="text-right font-semibold text-card-foreground">
              {product?.durationText ?? "-"}
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/pricing"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-foreground"
        >
          返回定价
        </Link>
        <Link
          href="/account"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:bg-secondary hover:text-foreground"
        >
          查看账户权益
        </Link>
      </div>
    </section>
  );
}

function LoginPrompt({ checkoutPath }: { readonly checkoutPath: string }) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold text-card-foreground">请先登录后继续支付</p>
      <p className="text-xs leading-5 text-muted-foreground">
        登录后会回到当前收银台页面继续选择支付方式。
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Link
          href={loginHrefForCheckout(checkoutPath)}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
        >
          登录后继续
        </Link>
        <Link
          href={registerHrefForCheckout(checkoutPath)}
          className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
        >
          创建账户
        </Link>
      </div>
    </div>
  );
}

export function CheckoutPaymentMethods({
  clientMode,
  onProviderPayment,
  paymentMethods,
  paymentMethodsState,
  selectedProduct,
  submittingProvider,
}: {
  readonly clientMode: PaymentClientMode;
  readonly onProviderPayment: (provider: BillingPaymentProvider) => void;
  readonly paymentMethods: readonly PublicBillingPaymentMethod[];
  readonly paymentMethodsState: PaymentMethodsState;
  readonly selectedProduct: PublicBillingProduct | null;
  readonly submittingProvider: BillingPaymentProvider | null;
}) {
  const submitting = Boolean(submittingProvider);

  if (paymentMethodsState === "loading") {
    return (
      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        正在读取支付方式...
      </p>
    );
  }

  if (paymentMethods.length === 0) {
    return <PaymentMethodsUnavailable />;
  }

  return (
    <div className="grid gap-2" data-checkout-payment-methods="primary">
      <p className="text-sm font-semibold text-card-foreground">选择支付方式</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {paymentMethods.map((item) => {
          const loading = submittingProvider === item.provider;
          return (
            <Button
              key={item.provider}
              type="button"
              variant={item.recommended || paymentMethods.length === 1 ? "primary" : "secondary"}
              size="lg"
              className="h-12 w-full"
              disabled={!selectedProduct || submitting}
              onClick={() => onProviderPayment(item.provider)}
            >
              {loading
                ? paymentLoadingLabel(item.provider, clientMode)
                : paymentButtonLabel(item.provider, clientMode, item.label)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function PaymentMethodsUnavailable() {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold text-card-foreground">
        当前暂未开放在线支付，请稍后再试。
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Link
          href="/pricing"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
        >
          返回定价
        </Link>
        <Link
          href="/account"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
        >
          查看账户权益
        </Link>
      </div>
    </div>
  );
}

function PaymentActionPanel({
  checkout,
  order,
  provider,
  submitting,
}: {
  readonly checkout: BillingCheckoutPayload | null;
  readonly order: AccountBillingOrderRecord;
  readonly provider: BillingPaymentProvider | null;
  readonly submitting: boolean;
}) {
  const paid = order.status === "paid";
  const pending = order.status === "pending" || order.status === "created";

  return (
    <div className="grid min-w-0 gap-3 border-t border-border pt-4 lg:col-span-2">
      <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold leading-6 text-card-foreground">
            {paymentStatusMessage(order)}
          </p>
          <Badge variant={paid ? "success" : pending ? "warning" : "muted"} className="shrink-0">
            {paymentStatusLabel(order.status)}
          </Badge>
        </div>
        {pending ? (
          <p className="text-xs leading-5 text-muted-foreground">
            如已完成支付，权益会在稍后自动生效。
          </p>
        ) : null}
      </div>
      {checkout ? (
        <CheckoutPayloadView
          checkout={checkout}
          autoRedirect={checkout.kind === "redirect_url" && !submitting}
          autoSubmit={provider === "alipay" && checkout.kind === "form_post" && !submitting}
        />
      ) : null}
    </div>
  );
}

function PaymentReturnNotice() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="leading-6 text-muted-foreground">如果已经完成支付，权益会在稍后自动生效。</p>
      <Link
        href="/account"
        className="inline-flex h-9 w-fit items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
      >
        查看账户权益
      </Link>
    </div>
  );
}

function SafeCheckoutMessage({
  actionHref,
  actionLabel,
  compact = false,
  description,
  title,
}: {
  readonly actionHref: string;
  readonly actionLabel: string;
  readonly compact?: boolean;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <Card className={cn("grid gap-3 p-5", compact && "border-none bg-transparent p-0 shadow-none")}>
      <div>
        <h1 className="text-lg font-bold text-card-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <Link
        href={actionHref}
        className="inline-flex h-10 w-fit items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
      >
        {actionLabel}
      </Link>
    </Card>
  );
}
