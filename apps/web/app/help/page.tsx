import type { Metadata } from "next";
import { LegalInfoPage } from "../../components/legal-info-page";

export const metadata: Metadata = {
  title: "帮助与联系 - 逐光天气",
};

export default function HelpPage() {
  return (
    <LegalInfoPage
      eyebrow="支持"
      title="帮助与联系"
      description="如果结果异常、地点信息不准确或需要反馈产品问题，请提供清晰的地点、时间和页面信息。"
      sections={[
        {
          title: "结果反馈",
          text: "反馈天气判断时，请说明地点、日期、预报范围、题材目标和实际观察到的云层、光线或风险情况。",
        },
        {
          title: "定位与坐标",
          text: "地点名称、WGS84 坐标、海拔、题材目标和现场观察会影响结果质量，欢迎补充准确资料。",
        },
        {
          title: "账户问题",
          text: "登录、注册、套餐权益和报告管理问题可在账户中心查看状态后再提交说明。",
        },
        {
          title: "安全问题",
          text: "遇到安全、隐私或合规问题时，请优先说明影响范围和复现步骤，便于快速排查。",
        },
      ]}
    />
  );
}
