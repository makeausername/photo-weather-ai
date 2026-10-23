import type { Metadata } from "next";
import { LegalInfoPage } from "../../components/legal-info-page";

export const metadata: Metadata = {
  title: "服务条款 - 逐光天气",
};

export default function TermsPage() {
  return (
    <LegalInfoPage
      eyebrow="条款"
      title="服务条款"
      description="使用逐光天气时，请将结果视为摄影出行辅助判断，而不是安全、交通或气象预警的替代。"
      sections={[
        {
          title: "使用范围",
          text: "逐光天气面向风光摄影出行规划，提供天气窗口、题材机会和风险提示等辅助信息。",
        },
        {
          title: "用户责任",
          text: "用户应自行核对官方预警、景区管理要求、道路状态和现场安全条件，并根据自身能力决定是否出行。",
        },
        {
          title: "免费使用",
          text: "无需注册，所有题材免费开放，无广告或付费套餐。请勿发送影响服务稳定的自动化滥用请求。",
        },
        {
          title: "服务变化",
          text: "天气仅使用和风天气和 Open-Meteo。上游接口限额、故障或缺测可能使部分结果暂时不可用，页面会显示数据状态。",
        },
      ]}
    />
  );
}
