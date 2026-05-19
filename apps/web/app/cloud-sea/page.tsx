import type { Metadata } from "next";
import { PublicModulePage } from "../../components/public-module-page";

export const metadata: Metadata = {
  title: "云海判断 - 逐光天气",
};

export default function CloudSeaPage() {
  return (
    <PublicModulePage
      title="云海判断"
      description="云海判断模块正在准备中。后续将结合低云高度、湿度、风速、山谷地形与能见度，帮助摄影师判断山地云海机会和白墙风险。"
      highlights={[
        "分时段展示云海机会、遮挡风险和推荐观景高度。",
        "围绕日出前后、雨后转晴和山谷水汽变化提供出行参考。",
        "支持把常用机位纳入同一判断视图，减少临行前反复切换资料。",
      ]}
    />
  );
}
