import type { Metadata } from "next";
import { PublicModulePage } from "../../components/public-module-page";

export const metadata: Metadata = {
  title: "朝霞晚霞 - 逐光天气",
};

export default function GlowPage() {
  return (
    <PublicModulePage
      title="朝霞晚霞"
      description="朝霞晚霞模块正在准备中。后续将围绕云量层次、太阳高度角、湿度、能见度和地形遮挡，提供日出日落拍摄窗口判断。"
      highlights={[
        "按清晨和傍晚拆分机会窗口，突出适合出发的关键时段。",
        "展示高云、中云、低云与通透度对霞光概率的影响。",
        "为不同机位方向提供更贴近实际拍摄角度的判断说明。",
      ]}
    />
  );
}
