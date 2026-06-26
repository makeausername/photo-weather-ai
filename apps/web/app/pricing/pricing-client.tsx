"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createBillingOrder,
  getBillingOrder,
  getCurrentAccountSession,
  listPublicBillingProducts,
  type AccountBillingOrderRecord,
  type BillingCheckoutPayload,
  type BillingPaymentProvider,
  type PublicBillingProduct,
} from "../../components/account-session";
import { Badge, Button, Card, cn } from "../../components/ui";
import { PublicShell } from "../../components/public-shell";

export type BillingProduct = PublicBillingProduct;

const paidPlanCodes = new Set(["monthly_full", "quarterly_full", "yearly_full"]);

const planDisplayCopy: Partial<
  Record<
    string,
    {
      readonly name: string;
      readonly description: string;
    }
  >
> = {
  monthly_full: {
    name: "月卡",
    description: "开通后 30 天内查看完整摄影判断、专业时序表和历史报告。",
  },
  quarterly_full: {
    name: "季卡",
    description: "开通后 90 天内查看完整摄影判断、专业时序表和历史报告。",
  },
  yearly_full: {
    name: "年卡",
    description: "开通后 365 天内查看完整摄影判断、专业时序表和历史报告。",
  },
};

const planFeatureCopy: Partial<Record<string, readonly string[]>> = {
  monthly_full: [
    "未来多日完整摄影判断",
    "云海 / 朝霞晚霞 / 星空银河",
    "专业逐小时表格",
    "会员期内完整历史报告",
    "适合短期出行和临时追光",
  ],
  quarterly_full: [
    "未来多日完整摄影判断",
    "云海 / 朝霞晚霞 / 星空银河",
    "专业逐小时表格",
    "会员期内完整历史报告",
    "适合连续旅行和多地踩点",
    "续费后有效期自动顺延",
  ],
  yearly_full: [
    "全年完整摄影判断",
    "云海 / 朝霞晚霞 / 星空银河",
    "专业逐小时表格",
    "全年完整历史报告",
    "适合长期风光摄影规划",
    "续费后有效期自动顺延",
  ],
};

const fallbackPaidFeatures = [
  "完整摄影判断",
  "云海 / 朝霞晚霞 / 星空银河",
  "专业逐小时表格",
  "会员期内完整历史报告",
] as const;

const stalePricingCopyPatternTexts = [
  ["A", "I", "\\s*", "解读"].join(""),
  ["智能", "解读"].join(""),
  ["G", "P", "T"].join(""),
  ["Open", "A", "I"].join(""),
  ["\\b", "A", "I", "\\b"].join(""),
];

const stalePricingCopyPatterns = stalePricingCopyPatternTexts.map(
  (pattern) => new RegExp(pattern, "gi"),
);

const legacyPlanDescriptions: Partial<Record<string, readonly string[]>> = {
  monthly_full: ["开通后 30 天内可查看完整摄影判断、专业时序表。", "开通完整摄影判断 30 天。"],
  quarterly_full: ["开通后 90 天内可查看完整摄影判断、专业时序表。", "开通完整摄影判断 90 天。"],
  yearly_full: ["开通后 365 天内可查看完整摄影判断、专业时序表。", "开通完整摄影判断 365 天。"],
};

const legacyPlanFeatureKeys: Partial<Record<string, readonly string[]>> = {
  monthly_full: [
    featureKey([
      "完整摄影判断",
      "云海 / 朝霞晚霞 / 星空银河",
      "专业逐小时表格",
      "会员期内完整历史报告",
    ]),
    featureKey(["完整摄影判断", "专业逐小时表格"]),
  ],
  quarterly_full: [
    featureKey([
      "完整摄影判断",
      "云海 / 朝霞晚霞 / 星空银河",
      "专业逐小时表格",
      "续费后有效期自动顺延",
    ]),
    featureKey(["完整摄影判断", "云海 / 朝霞晚霞 / 星空银河"]),
  ],
  yearly_full: [
    featureKey([
      "完整摄影判断",
      "云海 / 朝霞晚霞 / 星空银河",
      "专业逐小时表格",
      "全年完整历史报告",
    ]),
    featureKey(["完整历史报告", "会员期内完整历史报告"]),
  ],
};

const paymentProviderOptions = [
  { value: "wechat_pay", label: "微信支付" },
  { value: "alipay", label: "支付宝" },
] as const satisfies readonly {
  readonly value: BillingPaymentProvider;
  readonly label: string;
}[];

export const pricingCheckoutIntroCopy =
  "确认套餐信息后选择支付方式。支付完成后，会员权益将自动生效。";

export const pricingCheckoutLabels = [
  "月卡",
  "季卡",
  "年卡",
  "确认订单",
  "微信支付",
  "支付宝",
  "创建订单",
  "订单状态",
] as const;

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

function statusLabel(status: AccountBillingOrderRecord["status"]): string {
  const labels: Record<AccountBillingOrderRecord["status"], string> = {
    created: "已创建",
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
    canceled: "已取消",
    failed: "支付失败",
    refunded: "已退款",
  };
  return labels[status];
}

function planOrder(code: string): number {
  if (code === "monthly_full") {
    return 1;
  }
  if (code === "quarterly_full") {
    return 2;
  }
  if (code === "yearly_full") {
    return 3;
  }
  return 10;
}

function paidFeatures(product: PublicBillingProduct): readonly string[] {
  const features = product.featureBullets
    .map((feature) => sanitizePricingCopy(feature))
    .filter((feature): feature is string => Boolean(feature));
  const planFeatures = planFeatureCopy[product.code];
  if (
    planFeatures &&
    (product.featureBullets.some((feature) => containsStalePricingCopy(feature)) ||
      legacyPlanFeatureKeys[product.code]?.includes(featureKey(features)))
  ) {
    return planFeatures;
  }

  return features.length > 0 ? features : fallbackPaidFeatures;
}

function displayProductName(product: PublicBillingProduct): string {
  return sanitizePricingCopy(product.name) ?? planDisplayCopy[product.code]?.name ?? "套餐";
}

function displayProductDescription(product: PublicBillingProduct): string | null {
  const description = sanitizePricingCopy(product.description);
  const defaultDescription = planDisplayCopy[product.code]?.description ?? null;
  if (description && legacyPlanDescriptions[product.code]?.includes(description)) {
    return defaultDescription;
  }
  return description ?? defaultDescription;
}

function displayProductBadgeText(product: PublicBillingProduct): string | null {
  return sanitizePricingCopy(product.badgeText);
}

function sanitizePricingCopy(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const sanitized = stalePricingCopyPatterns
    .reduce((current, pattern) => current.replace(pattern, ""), value)
    .replace(/\s*([、，,。；;：:])\s*/g, "$1")
    .replace(/[、，,；;：:]+/g, "、")
    .replace(/^[\s、，,。；;：:]+|[\s、，,；;：:]+$/g, "")
    .replace(/\(\s*\)|（\s*）/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return /[0-9A-Za-z\u4e00-\u9fff]/.test(sanitized) ? sanitized : null;
}

function containsStalePricingCopy(value: string): boolean {
  return stalePricingCopyPatternTexts.some((pattern) => new RegExp(pattern, "i").test(value));
}

function featureKey(features: readonly string[]): string {
  return features.join("\n");
}

export function PricingClient({
  initialProducts,
  initialLoggedIn = false,
}: {
  readonly initialProducts?: readonly PublicBillingProduct[];
  readonly initialLoggedIn?: boolean;
}) {
  const initialPaidProducts = initialProducts
    ? [...initialProducts]
        .filter((product) => paidPlanCodes.has(product.code))
        .sort((left, right) => planOrder(left.code) - planOrder(right.code))
    : undefined;
  const [products, setProducts] = useState<readonly PublicBillingProduct[]>(
    initialPaidProducts ?? [],
  );
  const [selectedProductCode, setSelectedProductCode] = useState(
    initialPaidProducts?.[0]?.code ?? "",
  );
  const [provider, setProvider] = useState<BillingPaymentProvider>("wechat_pay");
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [checkout, setCheckout] = useState<BillingCheckoutPayload | null>(null);
  const [order, setOrder] = useState<AccountBillingOrderRecord | null>(null);
  const [loggedIn, setLoggedIn] = useState(initialLoggedIn);
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "error">(
    initialProducts ? "ready" : "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    getCurrentAccountSession()
      .then((session) => {
        if (!cancelled) {
          setLoggedIn(Boolean(session));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoggedIn(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (initialProducts) {
      return;
    }

    let cancelled = false;
    listPublicBillingProducts()
      .then((items) => {
        if (cancelled) {
          return;
        }
        const paidProducts = [...items]
          .filter((product) => paidPlanCodes.has(product.code))
          .sort((left, right) => planOrder(left.code) - planOrder(right.code));
        setProducts(paidProducts);
        setSelectedProductCode((current) => current || paidProducts[0]?.code || "");
        setState("ready");
        setMessage("");
      })
      .catch((error) => {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "暂时无法读取套餐。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialProducts]);

  useEffect(() => {
    if (!order || order.status !== "pending") {
      return;
    }

    const timer = window.setInterval(() => {
      void getBillingOrder(order.orderNo)
        .then((nextOrder) => {
          setOrder(nextOrder);
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [order]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.code === selectedProductCode) ?? products[0] ?? null,
    [products, selectedProductCode],
  );

  const checkoutActive = checkoutStarted && loggedIn;

  function clearOrderState() {
    setCheckout(null);
    setOrder(null);
  }

  function handleStartCheckout(productCode: string) {
    const changed = productCode !== selectedProductCode;
    setSelectedProductCode(productCode);
    if (!loggedIn) {
      setMessage("请先登录或注册后再购买套餐。注册即送 7 天完整权限。");
      return;
    }

    if (changed) {
      clearOrderState();
    }
    setCheckoutStarted(true);
    setMessage("");
  }

  async function handleCreateOrder() {
    if (!selectedProduct) {
      setMessage("请选择套餐后再创建订单。");
      return;
    }
    if (!loggedIn) {
      setCheckoutStarted(false);
      setMessage("请先登录或注册后再购买套餐。注册即送 7 天完整权限。");
      return;
    }

    const productCode = selectedProduct.code;
    setCheckoutStarted(true);
    setState("submitting");
    setMessage("");
    clearOrderState();
    try {
      const result = await createBillingOrder({ productCode, provider });
      setOrder(result.order);
      setCheckout(result.checkout ?? null);
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "创建订单失败，请稍后重试。");
    }
  }

  return (
    <PublicShell contentClassName="pb-14">
      <div className="grid min-w-0 max-w-full gap-6">
        <header className="flex min-w-0 max-w-full flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <Badge variant="muted">订阅套餐</Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-foreground sm:text-[36px]">
              定价方案
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              新用户注册即送 7 天完整权限。试用结束后自动回到免费版，可继续查询未来 24
              小时基础天气。
            </p>
          </div>
          <Link
            href="/account"
            className="inline-flex h-10 w-fit shrink-0 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
          >
            查看账户权益
          </Link>
        </header>

        {message ? (
          <p
            role="alert"
            className={cn(
              "rounded-lg border bg-card px-3 py-2 text-sm",
              state === "error" ? "border-danger text-danger" : "border-warning text-warning",
            )}
          >
            {message}
          </p>
        ) : null}

        <section
          id="paid-plans"
          className={cn(
            "grid min-w-0 max-w-full gap-4",
            checkoutActive ? "lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start" : "",
          )}
        >
          <div
            className={cn(
              "grid min-w-0 max-w-full gap-3 sm:grid-cols-2",
              checkoutActive ? "xl:grid-cols-3" : "lg:grid-cols-3",
            )}
          >
            {state === "loading" ? (
              <Card className="min-w-0 max-w-full p-5 text-sm text-muted-foreground">
                正在读取套餐...
              </Card>
            ) : null}
            {products.map((product) => (
              <PaidPlanCard
                key={product.code}
                product={product}
                selected={checkoutActive && selectedProduct?.code === product.code}
                loggedIn={loggedIn}
                submitting={state === "submitting" && selectedProductCode === product.code}
                onStartCheckout={() => handleStartCheckout(product.code)}
              />
            ))}
          </div>

          {checkoutActive ? (
            <CheckoutPanel
              provider={provider}
              onProviderChange={setProvider}
              selectedProduct={selectedProduct}
              order={order}
              checkout={checkout}
              submitting={state === "submitting"}
              onCreateOrder={() => void handleCreateOrder()}
            />
          ) : null}
        </section>
      </div>
    </PublicShell>
  );
}

function PaidPlanCard({
  product,
  selected,
  loggedIn,
  submitting,
  onStartCheckout,
}: {
  readonly product: PublicBillingProduct;
  readonly selected: boolean;
  readonly loggedIn: boolean;
  readonly submitting: boolean;
  readonly onStartCheckout: () => void;
}) {
  const badgeText = displayProductBadgeText(product);
  const description = displayProductDescription(product);

  return (
    <Card
      className={cn(
        "grid min-w-0 max-w-full grid-rows-[auto_auto_1fr_auto] gap-4 p-5 transition",
        selected ? "border-primary shadow-soft" : "border-border",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {product.recommended ? <Badge variant="accent">推荐</Badge> : null}
            {badgeText ? <Badge variant="info">{badgeText}</Badge> : null}
          </div>
          <h2 className="mt-3 text-lg font-bold text-card-foreground">
            {displayProductName(product)}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <Badge variant="muted" className="shrink-0">
          {product.durationText}
        </Badge>
      </div>
      <p className="text-2xl font-bold text-foreground">{formatPrice(product)}</p>
      <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
        {paidFeatures(product).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div>
        {loggedIn ? (
          <Button type="button" className="w-full" disabled={submitting} onClick={onStartCheckout}>
            {submitting ? "创建中..." : "立即购买"}
          </Button>
        ) : (
          <Link
            href="/login?returnTo=%2Fpricing"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
          >
            登录后购买
          </Link>
        )}
      </div>
    </Card>
  );
}

function CheckoutPanel({
  provider,
  onProviderChange,
  selectedProduct,
  order,
  checkout,
  submitting,
  onCreateOrder,
}: {
  readonly provider: BillingPaymentProvider;
  readonly onProviderChange: (provider: BillingPaymentProvider) => void;
  readonly selectedProduct: PublicBillingProduct | null;
  readonly order: AccountBillingOrderRecord | null;
  readonly checkout: BillingCheckoutPayload | null;
  readonly submitting: boolean;
  readonly onCreateOrder: () => void;
}) {
  const selectedProviderLabel =
    paymentProviderOptions.find((item) => item.value === provider)?.label ?? "微信支付";

  return (
    <Card className="grid min-w-0 max-w-full gap-4 p-5 shadow-sm">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-card-foreground">确认订单</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{pricingCheckoutIntroCopy}</p>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold text-card-foreground">支付方式</p>
        <div className="grid grid-cols-2 gap-2">
          {paymentProviderOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={cn(
                "h-10 rounded-lg border px-3 text-sm font-semibold transition",
                provider === item.value
                  ? "border-primary bg-secondary text-secondary-foreground"
                  : "border-border bg-card text-card-foreground hover:border-primary",
              )}
              onClick={() => onProviderChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">已选套餐</dt>
          <dd className="font-semibold text-card-foreground">
            {selectedProduct ? displayProductName(selectedProduct) : "请选择套餐"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">套餐金额</dt>
          <dd className="font-semibold text-card-foreground">
            {selectedProduct ? formatPrice(selectedProduct) : "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">有效期</dt>
          <dd className="font-semibold text-card-foreground">
            {selectedProduct?.durationText ?? "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">支付方式</dt>
          <dd className="font-semibold text-card-foreground">{selectedProviderLabel}</dd>
        </div>
      </dl>

      <Button type="button" disabled={!selectedProduct || submitting} onClick={onCreateOrder}>
        {submitting ? "创建中..." : "创建订单"}
      </Button>

      {order ? <OrderStatusPanel order={order} checkout={checkout} /> : null}
    </Card>
  );
}

function OrderStatusPanel({
  order,
  checkout,
}: {
  readonly order: AccountBillingOrderRecord;
  readonly checkout: BillingCheckoutPayload | null;
}) {
  return (
    <div className="grid gap-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-card-foreground">订单状态</span>
        <Badge variant={order.status === "paid" ? "success" : "muted"}>
          {statusLabel(order.status)}
        </Badge>
      </div>
      <dl className="grid gap-2 text-xs text-muted-foreground">
        <div className="flex justify-between gap-3">
          <dt>订单号</dt>
          <dd className="break-all text-right font-semibold text-card-foreground">
            {order.orderNo}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>金额</dt>
          <dd className="font-semibold text-card-foreground">
            {formatPriceCents(order.amountCents)}
          </dd>
        </div>
      </dl>
      {checkout ? <CheckoutPayloadView checkout={checkout} /> : null}
    </div>
  );
}

export function CheckoutPayloadView({ checkout }: { readonly checkout: BillingCheckoutPayload }) {
  if (checkout.kind === "qr_code") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-sm font-bold text-card-foreground">扫码支付</p>
        <p className="mt-2 break-all rounded-md bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          {checkout.codeUrl}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{checkout.message}</p>
      </div>
    );
  }

  if (checkout.kind === "redirect_url") {
    return (
      <a
        href={checkout.redirectUrl}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
      >
        前往支付
      </a>
    );
  }

  if (checkout.kind === "form_post") {
    return (
      <form
        action={checkout.actionUrl}
        method={checkout.method}
        acceptCharset={checkout.charset}
        className="grid gap-2"
      >
        {Object.entries(checkout.fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Button type="submit">前往支付宝支付</Button>
        <p className="text-xs leading-5 text-muted-foreground">{checkout.message}</p>
      </form>
    );
  }

  return (
    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {checkout.message}
    </p>
  );
}
