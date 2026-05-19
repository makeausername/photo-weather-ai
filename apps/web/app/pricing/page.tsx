import type { Metadata } from "next";
import { PublicModulePage } from "../../components/public-module-page";

export const metadata: Metadata = {
  title: "定价方案 - 逐光天气",
};

export default function PricingPage() {
  return (
    <PublicModulePage
      title="定价方案"
      description="定价方案正在准备中。当前阶段不会接入支付，后续将围绕查询历史、收藏机位、报告管理和团队使用权益设计套餐。"
      highlights={[
        "先提供清晰的免费体验范围，再逐步开放进阶功能。",
        "套餐权益会围绕风光摄影出行决策场景设计，而不是单纯堆叠次数。",
        "支付与额度系统将在后续阶段接入，当前页面仅展示产品规划。",
      ]}
    />
  );
}
