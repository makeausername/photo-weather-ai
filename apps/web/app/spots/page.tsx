import type { Metadata } from "next";
import { PublicShell } from "../../components/public-shell";
import { PageHeader } from "../../components/ui";
import { SpotLibraryClient } from "./spot-library-client";

export const metadata: Metadata = {
  title: "机位库 - 逐光天气",
  description: "按题材、地区和地形条件筛选适合风光摄影的拍摄机位。",
};

export default function SpotsPage() {
  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      <PageHeader
        title="机位库"
        description="按题材、地区和地形条件筛选适合拍摄云海、霞光、星空与银河的风光摄影机位。"
      />
      <SpotLibraryClient />
    </PublicShell>
  );
}
