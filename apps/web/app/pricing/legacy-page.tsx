import type { Metadata } from "next";
import { PricingClient } from "./pricing-client";

export const metadata: Metadata = {
  title: "定价方案 - 逐光天气",
};

export default function PricingPage() {
  return <PricingClient />;
}
