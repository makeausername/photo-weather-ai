"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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

export const pricingCheckoutLabels = [
  "免费版",
  "月卡",
  "季卡",
  "年卡",
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
  return product.featureBullets.length > 0
    ? product.featureBullets
    : [
        "完整摄影判断",
        "7 天完整摄影判断窗口",
        "云海 / 朝霞晚霞 / 星空银河",
        "专业逐小时表格",
        "AI 解读（服务启用时）",
        "会员期内完整历史报告",
      ];
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

  async function handleCreateOrder(productCode: string) {
    setSelectedProductCode(productCode);
    if (!loggedIn) {
      setMessage("请先登录或注册后再购买套餐。注册即送 7 天完整权限。");
      return;
    }

    setState("submitting");
    setMessage("");
    setCheckout(null);
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
      <div className="grid gap-6">
        <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="muted">订阅套餐</Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-foreground sm:text-[36px]">
              定价方案
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              新用户注册即送 7 天完整权限。试用结束后自动回到免费版，可继续查询未来
              24 小时基础天气。
            </p>
          </div>
          <Link
            href="/account"
            className="inline-flex h-10 w-fit items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
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

        <section className="grid gap-3 lg:grid-cols-2">
          <ComparisonCard
            title="免费版"
            items={["未来 24 小时基础天气", "基础结果视图", "适合临时查看近端天气"]}
            action={
              <Link
                href="/#analysis"
                className="inline-flex h-9 w-fit items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
              >
                开始查询
              </Link>
            }
          />
          <ComparisonCard
            title="付费套餐"
            items={[
              "完整摄影判断",
              "云海 / 朝霞晚霞 / 星空银河",
              "专业逐小时表格与历史报告",
            ]}
            action={
              <a
                href="#paid-plans"
                className="inline-flex h-9 w-fit items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
              >
                查看套餐
              </a>
            }
          />
        </section>

        <section id="paid-plans" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FreePlanCard loggedIn={loggedIn} />
            {state === "loading" ? (
              <Card className="p-5 text-sm text-muted-foreground">正在读取套餐...</Card>
            ) : null}
            {products.map((product) => (
              <PaidPlanCard
                key={product.code}
                product={product}
                selected={selectedProduct?.code === product.code}
                loggedIn={loggedIn}
                submitting={state === "submitting" && selectedProductCode === product.code}
                onSelect={() => setSelectedProductCode(product.code)}
                onCreateOrder={() => void handleCreateOrder(product.code)}
              />
            ))}
          </div>

          <CheckoutPanel
            provider={provider}
            onProviderChange={setProvider}
            selectedProduct={selectedProduct}
            order={order}
            checkout={checkout}
          />
        </section>
      </div>
    </PublicShell>
  );
}

function ComparisonCard({
  title,
  items,
  action,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly action: ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="mt-4">{action}</div>
    </Card>
  );
}

function FreePlanCard({ loggedIn }: { readonly loggedIn: boolean }) {
  return (
    <Card className="grid gap-4 p-5">
      <div>
        <Badge variant="muted">永久免费</Badge>
        <h2 className="mt-3 text-lg font-bold text-card-foreground">免费版</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">未来 24 小时基础天气。</p>
      </div>
      <p className="text-2xl font-bold text-foreground">¥0.00</p>
      <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
        <li>基础结果视图</li>
        <li>未来 24 小时基础天气</li>
        <li>试用到期后自动回到免费版</li>
      </ul>
      <Link
        href={loggedIn ? "/account" : "/register"}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
      >
        {loggedIn ? "查看账户" : "注册领取 7 天完整权限"}
      </Link>
    </Card>
  );
}

function PaidPlanCard({
  product,
  selected,
  loggedIn,
  submitting,
  onSelect,
  onCreateOrder,
}: {
  readonly product: PublicBillingProduct;
  readonly selected: boolean;
  readonly loggedIn: boolean;
  readonly submitting: boolean;
  readonly onSelect: () => void;
  readonly onCreateOrder: () => void;
}) {
  return (
    <Card
      className={cn(
        "grid gap-4 p-5 transition",
        selected ? "border-primary shadow-soft" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap gap-2">
            {product.recommended ? <Badge variant="accent">推荐</Badge> : null}
            {product.badgeText ? <Badge variant="info">{product.badgeText}</Badge> : null}
          </div>
          <h2 className="mt-3 text-lg font-bold text-card-foreground">{product.name}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {product.description}
          </p>
        </div>
        <Badge variant="muted">{product.durationText}</Badge>
      </div>
      <p className="text-2xl font-bold text-foreground">{formatPrice(product)}</p>
      <ul className="grid gap-2 text-sm leading-6 text-muted-foreground">
        {paidFeatures(product).map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className="grid gap-2">
        <Button type="button" variant="secondary" onClick={onSelect}>
          选择套餐
        </Button>
        {loggedIn ? (
          <Button type="button" disabled={submitting} onClick={onCreateOrder}>
            {submitting ? "创建中..." : "立即购买"}
          </Button>
        ) : (
          <Link
            href="/login?returnTo=%2Fpricing"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
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
}: {
  readonly provider: BillingPaymentProvider;
  readonly onProviderChange: (provider: BillingPaymentProvider) => void;
  readonly selectedProduct: PublicBillingProduct | null;
  readonly order: AccountBillingOrderRecord | null;
  readonly checkout: BillingCheckoutPayload | null;
}) {
  return (
    <Card className="grid gap-4 p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-card-foreground">支付方式</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          订单金额、权益时长和发放类型由后台产品配置读取。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { value: "wechat_pay", label: "微信支付" },
          { value: "alipay", label: "支付宝" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={cn(
              "h-10 rounded-lg border px-3 text-sm font-semibold transition",
              provider === item.value
                ? "border-primary bg-secondary text-secondary-foreground"
                : "border-border bg-card text-card-foreground hover:border-primary",
            )}
            onClick={() => onProviderChange(item.value as BillingPaymentProvider)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <dl className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">已选套餐</dt>
          <dd className="font-semibold text-card-foreground">
            {selectedProduct ? selectedProduct.name : "请选择套餐"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">有效期</dt>
          <dd className="font-semibold text-card-foreground">
            {selectedProduct?.durationText ?? "-"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">续费规则</dt>
          <dd className="font-semibold text-card-foreground">续费后有效期自动顺延</dd>
        </div>
      </dl>

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

function CheckoutPayloadView({ checkout }: { readonly checkout: BillingCheckoutPayload }) {
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

  return (
    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {checkout.message}
    </p>
  );
}
