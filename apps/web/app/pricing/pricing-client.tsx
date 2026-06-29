"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCurrentAccountSession,
  listPublicBillingProducts,
  type PublicBillingProduct,
} from "../../components/account-session";
import { Badge, Card, cn } from "../../components/ui";
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

export function checkoutPathForProduct(productCode: string): string {
  return `/checkout?product=${encodeURIComponent(productCode)}`;
}

function loginHrefForProduct(productCode: string): string {
  return `/login?returnTo=${encodeURIComponent(checkoutPathForProduct(productCode))}`;
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
  const [loggedIn, setLoggedIn] = useState(initialLoggedIn);
  const [state, setState] = useState<"loading" | "ready" | "error">(
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
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary sm:w-fit sm:shrink-0"
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
          className="grid min-w-0 max-w-full gap-4"
        >
          <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state === "loading" ? (
              <Card className="min-w-0 max-w-full p-5 text-sm text-muted-foreground">
                正在读取套餐...
              </Card>
            ) : null}
            {products.map((product) => (
              <PaidPlanCard
                key={product.code}
                product={product}
                loggedIn={loggedIn}
              />
            ))}
          </div>
        </section>
      </div>
    </PublicShell>
  );
}

function PaidPlanCard({
  product,
  loggedIn,
}: {
  readonly product: PublicBillingProduct;
  readonly loggedIn: boolean;
}) {
  const badgeText = displayProductBadgeText(product);
  const description = displayProductDescription(product);

  return (
    <Card
      className="grid min-w-0 max-w-full grid-rows-[auto_auto_1fr_auto] gap-4 border-border p-5 transition"
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
          <Link
            href={checkoutPathForProduct(product.code)}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
          >
            立即购买
          </Link>
        ) : (
          <Link
            href={loginHrefForProduct(product.code)}
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
          >
            登录后购买
          </Link>
        )}
      </div>
    </Card>
  );
}
