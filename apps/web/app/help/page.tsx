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
          href: "mailto:info@ruilianke.com?subject=%E9%80%90%E5%85%89%E5%A4%A9%E6%B0%94%E5%8F%8D%E9%A6%88",
          linkLabel: "发送反馈至 info@ruilianke.com",
        },
        {
          title: "定位与坐标",
          text: "地点名称、WGS84 坐标、海拔、题材目标和现场观察会影响结果质量，欢迎补充准确资料。",
        },
        {
          title: "免费使用与本机收藏",
          text: "全部题材免费开放，无需注册。搜索地点或输入 WGS84 坐标即可查询。收藏和最近地点只保存在当前浏览器，清理网站数据后会丢失，不会跨设备同步。",
        },
        {
          title: "安全问题",
          text: "遇到安全、隐私或合规问题时，请优先说明影响范围和复现步骤，便于快速排查。",
        },
      ]}
    />
  );
}
