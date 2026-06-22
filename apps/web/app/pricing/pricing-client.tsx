"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStoredAdminTokens } from "../admin/admin-api";
import { Badge, Button, Card, cn } from "../../components/ui";
import { PublicShell } from "../../components/public-shell";

export type BillingProduct = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly credits: number;
  readonly durationDays: number | null;
  readonly enabled: boolean;
  readonly sortOrder: number;
};

export type BillingOrder = {
  readonly orderNo: string;
  readonly provider: "wechat_pay" | "alipay";
  readonly amountCents: number;
  readonly currency: string;
  readonly productCode: string;
  readonly status: "created" | "pending" | "paid" | "closed" | "canceled" | "failed" | "refunded";
  readonly paidAt: string | null;
  readonly expiresAt: string | null;
  readonly providerTradeNo: string | null;
  readonly entitlementGrantedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type CheckoutPayload =
  | { readonly kind: "mock"; readonly message: string }
  | { readonly kind: "qr_code"; readonly codeUrl: string; readonly message: string }
  | { readonly kind: "redirect_url"; readonly redirectUrl: string; readonly message: string }
  | { readonly kind: "form_html"; readonly formHtml: string; readonly message: string };

type ProductResponse = {
  readonly products: readonly BillingProduct[];
};

type OrderResponse = {
  readonly order: BillingOrder;
  readonly checkout?: CheckoutPayload;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const membershipProductCodes = new Set(["monthly_full", "quarterly_full", "yearly_full"]);

export const pricingCheckoutLabels = [
  "摄影会员",
  "微信支付",
  "支付宝",
  "创建订单",
  "订单状态",
] as const;

function formatPrice(amountCents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amountCents / 100);
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) {
    return fallback;
  }
  try {
    const payload = JSON.parse(text) as { readonly message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

async function fetchProducts(): Promise<readonly BillingProduct[]> {
  const response = await fetch(`${apiBaseUrl}/billing/products`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "暂时无法读取套餐。"));
  }
  return ((await response.json()) as ProductResponse).products.filter((product) =>
    membershipProductCodes.has(product.code),
  );
}

async function createOrder(input: {
  readonly productCode: string;
  readonly provider: "wechat_pay" | "alipay";
}): Promise<OrderResponse> {
  const tokens = getStoredAdminTokens();
  if (!tokens) {
    throw new Error("请先登录后再创建订单。");
  }

  const response = await fetch(`${apiBaseUrl}/billing/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokens.accessToken}`,
    },
    body: JSON.stringify({
      productCode: input.productCode,
      provider: input.provider,
      clientMode: input.provider === "wechat_pay" ? "native" : "page",
      returnUrl: "/pricing",
    }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "创建订单失败，请稍后重试。"));
  }
  return (await response.json()) as OrderResponse;
}

async function fetchOrder(orderNo: string): Promise<BillingOrder> {
  const tokens = getStoredAdminTokens();
  if (!tokens) {
    throw new Error("登录状态已失效。");
  }

  const response = await fetch(`${apiBaseUrl}/billing/orders/${encodeURIComponent(orderNo)}`, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "订单状态暂时无法读取。"));
  }
  return ((await response.json()) as OrderResponse).order;
}

function statusLabel(status: BillingOrder["status"]): string {
  const labels: Record<BillingOrder["status"], string> = {
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

export function PricingClient({
  initialProducts,
}: {
  readonly initialProducts?: readonly BillingProduct[];
}) {
  const initialVisibleProducts = initialProducts?.filter((product) =>
    membershipProductCodes.has(product.code),
  );
  const [products, setProducts] = useState<readonly BillingProduct[]>(initialVisibleProducts ?? []);
  const [selectedProductCode, setSelectedProductCode] = useState(
    initialVisibleProducts?.[0]?.code ?? "",
  );
  const [provider, setProvider] = useState<"wechat_pay" | "alipay">("wechat_pay");
  const [checkout, setCheckout] = useState<CheckoutPayload | null>(null);
  const [order, setOrder] = useState<BillingOrder | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "submitting" | "error">(
    initialProducts ? "ready" : "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (initialProducts) {
      const nextProducts = initialProducts.filter((product) =>
        membershipProductCodes.has(product.code),
      );
      setProducts(nextProducts);
      setSelectedProductCode((current) => current || nextProducts[0]?.code || "");
      return;
    }

    let cancelled = false;
    fetchProducts()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setProducts(items);
        setSelectedProductCode((current) => current || items[0]?.code || "");
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
      void fetchOrder(order.orderNo)
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

  async function handleCreateOrder() {
    if (!selectedProduct) {
      return;
    }

    setState("submitting");
    setMessage("");
    setCheckout(null);
    try {
      const result = await createOrder({ productCode: selectedProduct.code, provider });
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
            <Badge variant="muted">专业预测包</Badge>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-foreground sm:text-[36px]">
              定价方案
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              购买预测次数后用于后续专业天气判断。支付成功回调验签通过后，权益会自动进入账户中心。
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
            className="rounded-lg border border-danger bg-card px-3 py-2 text-sm text-danger"
          >
            {message}
          </p>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            {state === "loading" ? (
              <Card className="p-5 text-sm text-muted-foreground">正在读取套餐...</Card>
            ) : null}
            {products.map((product) => (
              <button
                key={product.code}
                type="button"
                onClick={() => setSelectedProductCode(product.code)}
                className={cn(
                  "grid min-h-[172px] gap-3 rounded-lg border bg-card p-5 text-left shadow-sm transition hover:border-primary",
                  selectedProduct?.code === product.code ? "border-primary" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-card-foreground">{product.name}</h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {product.description}
                    </p>
                  </div>
                  <Badge variant="info">
                    {product.durationDays ? `${product.durationDays} 天` : "会员"}
                  </Badge>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {formatPrice(product.amountCents)}
                </p>
              </button>
            ))}
          </div>

          <Card className="grid gap-4 p-5 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-card-foreground">创建订单</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                选择支付方式后生成待支付订单，付款成功前不会扣减或发放权益。
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
                  onClick={() => setProvider(item.value as "wechat_pay" | "alipay")}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              className="w-full"
              disabled={!selectedProduct || state === "submitting"}
              onClick={() => void handleCreateOrder()}
            >
              {state === "submitting" ? "正在创建..." : "创建订单"}
            </Button>

            {order ? <OrderStatusPanel order={order} checkout={checkout} /> : null}
          </Card>
        </section>
      </div>
    </PublicShell>
  );
}

function OrderStatusPanel({
  order,
  checkout,
}: {
  readonly order: BillingOrder;
  readonly checkout: CheckoutPayload | null;
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
          <dd className="font-semibold text-card-foreground">{formatPrice(order.amountCents)}</dd>
        </div>
      </dl>
      {checkout ? <CheckoutPayloadView checkout={checkout} /> : null}
    </div>
  );
}

function CheckoutPayloadView({ checkout }: { readonly checkout: CheckoutPayload }) {
  if (checkout.kind === "qr_code") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="text-sm font-bold text-card-foreground">微信扫码信息</p>
        <p className="mt-2 break-all rounded-md bg-card px-3 py-2 text-xs leading-5 text-muted-foreground">
          {checkout.codeUrl}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {checkout.message}
        </p>
      </div>
    );
  }

  if (checkout.kind === "redirect_url") {
    return (
      <a
        href={checkout.redirectUrl}
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
      >
        前往支付宝支付
      </a>
    );
  }

  return (
    <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {checkout.message}
    </p>
  );
}
