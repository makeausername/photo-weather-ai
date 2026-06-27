import type { Metadata } from "next";
import { CheckoutClient } from "./checkout-client";

export const metadata: Metadata = {
  title: "确认支付 - 逐光天气",
};

type CheckoutPageProps = {
  readonly searchParams?: {
    readonly payment_return?: string | string[];
    readonly product?: string | string[];
  };
};

function firstSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default function CheckoutPage({ searchParams }: CheckoutPageProps) {
  return (
    <CheckoutClient
      paymentReturn={firstSearchParam(searchParams?.payment_return)}
      productCode={firstSearchParam(searchParams?.product)}
    />
  );
}
