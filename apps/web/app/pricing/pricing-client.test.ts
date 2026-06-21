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
    code: "forecast_credit_20",
    name: "20 次专业预测包",
    description: "适合短期旅行和拍摄计划使用，支付成功后发放预测次数。",
    amountCents: 990,
    currency: "CNY",
    credits: 20,
    durationDays: null,
    enabled: true,
    sortOrder: 10,
  },
  {
    id: "product-2",
    code: "forecast_credit_100",
    name: "100 次专业预测包",
    description: "适合高频拍摄和团队使用。",
    amountCents: 3990,
    currency: "CNY",
    credits: 100,
    durationDays: null,
    enabled: true,
    sortOrder: 20,
  },
];

describe("pricing checkout client", () => {
  it("renders payment choices and products without provider internals", () => {
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, { initialProducts: products }),
    );

    expect(pricingCheckoutLabels).toEqual([
      "专业预测包",
      "微信支付",
      "支付宝",
      "创建订单",
      "订单状态",
    ]);
    expect(html).toContain("定价方案");
    expect(html).toContain("20 次专业预测包");
    expect(html).toContain("100 次专业预测包");
    expect(html).toContain("微信支付");
    expect(html).toContain("支付宝");
    expect(html).toContain("创建订单");
    expect(html).toContain("查看账户权益");
    expect(html).toContain("¥9.90");
    expect(html).toContain("¥39.90");

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
