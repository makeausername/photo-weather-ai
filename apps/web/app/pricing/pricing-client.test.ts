import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PricingClient, pricingCheckoutLabels, type BillingProduct } from "./pricing-client";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pricing",
}));

const testGlobal = globalThis as typeof globalThis & { React: typeof React };
testGlobal.React = React;

const products: readonly BillingProduct[] = [
  {
    id: "product-1",
    code: "trial_7_days",
    name: "注册赠送 7 天",
    description: "新用户注册后自动发放，不开放购买。",
    amountCents: 0,
    currency: "CNY",
    credits: 0,
    durationDays: 7,
    enabled: true,
    sortOrder: 0,
  },
  {
    id: "product-2",
    code: "monthly_full",
    name: "月卡",
    description: "开通完整摄影判断 30 天。",
    amountCents: 1900,
    currency: "CNY",
    credits: 0,
    durationDays: 30,
    enabled: true,
    sortOrder: 10,
  },
  {
    id: "product-3",
    code: "quarterly_full",
    name: "季卡",
    description: "开通完整摄影判断 90 天。",
    amountCents: 4900,
    currency: "CNY",
    credits: 0,
    durationDays: 90,
    enabled: true,
    sortOrder: 20,
  },
  {
    id: "product-4",
    code: "yearly_full",
    name: "年卡",
    description: "开通完整摄影判断 365 天。",
    amountCents: 16800,
    currency: "CNY",
    credits: 0,
    durationDays: 365,
    enabled: true,
    sortOrder: 30,
  },
];

describe("pricing checkout client", () => {
  it("renders payment choices and products without provider internals", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products }),
    );

    expect(pricingCheckoutLabels).toEqual([
      "摄影会员",
      "微信支付",
      "支付宝",
      "创建订单",
      "订单状态",
    ]);
    expect(html).toContain("定价方案");
    expect(html).toContain("月卡");
    expect(html).toContain("季卡");
    expect(html).toContain("年卡");
    expect(html).not.toContain("注册赠送 7 天");
    expect(html).toContain("微信支付");
    expect(html).toContain("支付宝");
    expect(html).toContain("创建订单");
    expect(html).toContain("查看账户权益");
    expect(html).toContain("¥19.00");
    expect(html).toContain("¥49.00");
    expect(html).toContain("¥168.00");

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
});
