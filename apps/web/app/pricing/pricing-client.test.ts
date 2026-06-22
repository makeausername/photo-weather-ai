import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { PricingClient, pricingCheckoutLabels, type BillingProduct } from "./pricing-client";

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
    description: "新用户注册后自动发放，不开放购买。",
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
    description: "开通完整摄影判断 30 天。",
    amountCents: 2100,
    currency: "CNY",
    priceText: "¥21.00",
    durationDays: 30,
    durationText: "30 天",
    recommended: false,
    badgeText: null,
    featureBullets: ["完整摄影判断", "专业逐小时表格"],
    sortOrder: 10,
  },
  {
    code: "quarterly_full",
    name: "季卡",
    description: "开通完整摄影判断 90 天。",
    amountCents: 5600,
    currency: "CNY",
    priceText: "¥56.00",
    durationDays: 90,
    durationText: "90 天",
    recommended: true,
    badgeText: "推荐",
    featureBullets: ["完整摄影判断", "云海 / 朝霞晚霞 / 星空银河"],
    sortOrder: 20,
  },
  {
    code: "yearly_full",
    name: "年卡",
    description: "开通完整摄影判断 365 天。",
    amountCents: 18800,
    currency: "CNY",
    priceText: "¥188.00",
    durationDays: 365,
    durationText: "365 天",
    recommended: false,
    badgeText: "最划算",
    featureBullets: ["完整历史报告", "会员期内完整历史报告"],
    sortOrder: 30,
  },
];

describe("pricing checkout client", () => {
  it("renders free and paid plans from public product data without trial purchase cards", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products }),
    );

    expect(pricingCheckoutLabels).toEqual([
      "免费版",
      "月卡",
      "季卡",
      "年卡",
      "微信支付",
      "支付宝",
      "创建订单",
      "订单状态",
    ]);
    expect(html).toContain("定价方案");
    expect(html).toContain("新用户注册即送 7 天完整权限");
    expect(html).toContain("免费版");
    expect(html).toContain("未来 24 小时基础天气");
    expect(html).toContain("月卡");
    expect(html).toContain("季卡");
    expect(html).toContain("年卡");
    expect(html).not.toContain("注册赠送 7 天");
    expect(html).toContain("¥21.00");
    expect(html).toContain("¥56.00");
    expect(html).toContain("¥188.00");
    expect(html).not.toContain("¥19.00");
    expect(html).not.toContain("¥49.00");
    expect(html).not.toContain("¥168.00");
    expect(html).toContain("微信支付");
    expect(html).toContain("支付宝");
    expect(html).toContain("登录后购买");
    expect(html).toContain('href="/login?returnTo=%2Fpricing"');
    expect(html).toContain('href="/register"');
    expect(html).toContain("注册领取 7 天完整权限");
    expect(html).toContain("查看账户权益");

    for (const forbidden of [
      "providerPayload",
      "secretJson",
      "merchantPrivateKeyPem",
      "apiV3Key",
      "appPrivateKeyPem",
      "platformCertificatePem",
      "alipayPublicKeyPem",
      "signature",
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it("keeps checkout creation scoped to productCode and provider", () => {
    expect(pricingClientSource).toContain("createBillingOrder({ productCode, provider })");
    expect(pricingClientSource).not.toContain("durationDays:");
    expect(pricingClientSource).not.toContain("grantType:");
    expect(pricingClientSource).not.toContain("hasFullAccess:");
    expect(pricingClientSource).not.toContain("entitlement type");
  });
});
