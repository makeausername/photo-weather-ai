import type { Metadata } from "next";
import { LegalInfoPage } from "../../components/legal-info-page";

export const metadata: Metadata = {
  title: "免责声明 - 逐光天气",
};

export default function DisclaimerPage() {
  return (
    <LegalInfoPage
      eyebrow="安全"
      title="免责声明"
      description="逐光天气的结果只用于摄影出行参考，不能替代官方气象预警和现场安全判断。"
      sections={[
        {
          title: "天气不确定性",
          text: "云层、降水、能见度、地形遮挡和夜间条件存在快速变化，预报与实际情况可能不一致。",
        },
        {
          title: "山地与夜间风险",
          text: "山地、海边、高海拔、低温、强风、雷雨、低能见度和夜间活动存在额外风险，请优先遵守官方预警。",
        },
        {
          title: "现场判断优先",
          text: "是否出发、等待、撤离或改变路线，应以现场安全、管理规定和个人装备能力为准。",
        },
        {
          title: "数据说明",
          text: "页面会尽量保留数据来源、缺失项和置信度提示；缺失数据不代表条件安全或适合拍摄。",
        },
      ]}
    />
  );
}
