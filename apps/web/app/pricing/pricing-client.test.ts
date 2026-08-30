import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  PricingClient,
  checkoutPathForProduct,
  displayProductDescription,
  type BillingProduct,
} from "./pricing-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const __dirname = dirname(fileURLToPath(import.meta.url));
const pricingClientSource = readFileSync(resolve(__dirname, "pricing-client.tsx"), "utf8");

const products: readonly BillingProduct[] = [
  {
    code: "trial_7_days",
    name: "注册赠送 7 天",
    description: "注册后自动发放，不开放购买。",
    amountCents: 0,
    currency: "CNY",
    priceText: "¥0.00",
    durationDays: 7,
    durationText: "7 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["注册后自动发放"],
    sortOrder: 0,
  },
  {
    code: "monthly_full",
    name: "月卡",
    description: "开通后 30 天内查看完整摄影判断、专业时序表和历史报告。",
    amountCents: 2100,
    currency: "CNY",
    priceText: "¥21.00",
    durationDays: 30,
    durationText: "30 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["未来多日完整摄影判断", "专业逐小时表格"],
    sortOrder: 10,
  },
  {
    code: "quarterly_full",
    name: "季卡",
    description: "开通后 90 天内查看完整摄影判断、专业时序表和历史报告。",
    amountCents: 5600,
    currency: "CNY",
    priceText: "¥56.00",
    durationDays: 90,
    durationText: "90 天",
    recommended: true,
    badgeText: "推荐",
    featureBullets: ["未来多日完整摄影判断", "云海 / 朝霞晚霞 / 星空银河"],
    sortOrder: 20,
  },
  {
    code: "yearly_full",
    name: "年卡",
    description: "开通后 365 天内查看完整摄影判断、专业时序表和历史报告。",
    amountCents: 18800,
    currency: "CNY",
    priceText: "¥188.00",
    durationDays: 365,
    durationText: "365 天",
    recommended: false,
    badgeText: "最划算",
    featureBullets: ["全年完整摄影判断", "全年完整历史报告"],
    sortOrder: 30,
  },
];

describe("pricing plan selection", () => {
  it("renders paid plans only and does not embed checkout UI", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products }),
    );

    expect(html).toContain("选择套餐");
    expect(html).toContain("月卡");
    expect(html).toContain("季卡");
    expect(html).toContain("年卡");
    expect(html).toContain("¥21.00");
    expect(html).toContain("¥56.00");
    expect(html).toContain("¥188.00");
    expect(html).not.toContain("注册赠送 7 天");
    expect(html).not.toContain("¥0.00");
    expect(html).not.toContain("选择支付方式");
    expect(html).not.toContain("支付宝支付");
    expect(html).not.toContain("微信支付");
    expect(html).not.toContain("创建订单");
    expect(html.match(/登录后购买/g) ?? []).toHaveLength(3);
    expect(html.match(/href="\/login\?returnTo=%2Fcheckout%3Fproduct%3D/g) ?? []).toHaveLength(3);
    expect(pricingClientSource).toContain("w-full items-center justify-center");
    expect(pricingClientSource).toContain("sm:w-fit sm:shrink-0");

    expect(pricingClientSource).not.toContain("CheckoutPanel");
    expect(pricingClientSource).not.toContain("checkoutStarted");
    expect(pricingClientSource).not.toContain("createBillingOrder");
    expect(pricingClientSource).not.toContain("getBillingOrder");
  });

  it("links logged-in purchase actions to the selected checkout route", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products, initialLoggedIn: true }),
    );

    expect(html.match(/立即购买/g) ?? []).toHaveLength(3);
    expect(html).toContain('href="/checkout?product=monthly_full"');
    expect(html).toContain('href="/checkout?product=quarterly_full"');
    expect(html).toContain('href="/checkout?product=yearly_full"');
    expect(html).not.toContain("/login?returnTo=%2Fpricing");
    expect(html).not.toContain("选择支付方式");
    expect(pricingClientSource).toContain("href={checkoutPathForProduct(product.code)}");
  });

  it("builds the checkout route contract for paid products", () => {
    expect(checkoutPathForProduct("monthly_full")).toBe("/checkout?product=monthly_full");
    expect(checkoutPathForProduct("quarterly_full")).toBe("/checkout?product=quarterly_full");
    expect(checkoutPathForProduct("yearly_full")).toBe("/checkout?product=yearly_full");
  });

  it("repairs stale or truncated paid-plan descriptions", () => {
    expect(
      displayProductDescription({
        ...products[0]!,
        code: "monthly_full",
        description: "开通后 30 天内查看完整摄影判断、专业时序表和。",
      }),
    ).toBe("开通后 30 天内查看完整摄影判断、专业时序表和历史报告。");
  });
});
