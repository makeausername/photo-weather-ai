import type { Metadata } from "next";
import { LegalInfoPage } from "../../components/legal-info-page";

export const metadata: Metadata = {
  title: "隐私政策 - 逐光天气",
};

export default function PrivacyPage() {
  return (
    <LegalInfoPage
      eyebrow="隐私"
      title="隐私政策"
      description="逐光天气仅围绕摄影天气判断、账户功能和服务安全处理必要信息。"
      sections={[
        {
          title: "地点与查询",
          text: "地点、坐标、预报范围和题材选择用于生成天气与拍摄窗口判断；公开页面不会展示后台密钥或服务商配置。",
        },
        {
          title: "账户信息",
          text: "账户邮箱、登录状态和后续权益信息用于识别用户身份、保存常用内容和维护服务安全。",
        },
        {
          title: "安全与运维",
          text: "必要的请求日志、错误信息和审计记录用于排查故障、防止滥用和保持系统稳定。",
        },
        {
          title: "联系",
          text: "如需处理隐私相关问题，可通过帮助与联系页面提交说明。",
        },
      ]}
    />
  );
}
