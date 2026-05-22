import type { Metadata } from "next";
import { PublicModulePage } from "../../components/public-module-page";

export const metadata: Metadata = {
  title: "摄影机位库 - 逐光天气",
};

export default function SpotsPage() {
  return (
    <PublicModulePage
      title="摄影机位库"
      description="摄影机位库即将开放。这里会集中整理常用风光摄影地点、机位方向、海拔、通行方式、安全备注和适合题材。"
      highlights={[
        "按地区、题材和季节整理适合拍摄的机位资料。",
        "为每个机位保留经纬度、海拔、朝向、交通和风险说明。",
        "收藏常用机位，并与拍摄天气分析联动。",
      ]}
    />
  );
}
