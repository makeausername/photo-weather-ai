import type { Metadata } from "next";
import { PublicModulePage } from "../../components/public-module-page";

export const metadata: Metadata = {
  title: "星空银河 - 逐光天气",
};

export default function AstroPage() {
  return (
    <PublicModulePage
      title="星空银河"
      description="星空银河模块正在准备中。后续将结合月相、天文暮光、云量、透明度和机位朝向，帮助规划夜景、星空与银河拍摄。"
      highlights={[
        "展示夜间可拍窗口、月光干扰和银河方位参考。",
        "结合云量与透明度，减少只看天气图标造成的误判。",
        "为高海拔和偏远机位补充安全、通行和返程提醒。",
      ]}
    />
  );
}
