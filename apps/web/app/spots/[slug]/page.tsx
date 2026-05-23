import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "../../../components/public-shell";
import { Card, cn } from "../../../components/ui";
import {
  DetailSection,
  SpotDetailHeader,
  SpotInfoGrid,
  SpotQuickActions,
  SpotStatusBadge,
  SpotTargetBadges,
  spotLinkButtonClassNames,
} from "../spot-components";
import {
  getMissingSpotFieldNote,
  getSpotBySlug,
  spotDataStatusLabels,
  spotLibraryItems,
} from "../spot-library-data";

type SpotDetailPageProps = {
  readonly params: {
    readonly slug: string;
  };
};

export function generateStaticParams() {
  return spotLibraryItems.map((spot) => ({ slug: spot.slug }));
}

export function generateMetadata({ params }: SpotDetailPageProps): Metadata {
  const spot = getSpotBySlug(params.slug);

  return {
    title: spot ? `${spot.name} - 机位库 - 逐光天气` : "机位详情 - 逐光天气",
    description: spot?.shortDescriptionZh ?? "逐光天气机位库详情页。",
  };
}

export default function SpotDetailPage({ params }: SpotDetailPageProps) {
  const spot = getSpotBySlug(params.slug);

  if (!spot) {
    notFound();
  }

  const missingNote = getMissingSpotFieldNote();

  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      <SpotDetailHeader spot={spot} />

      <SpotInfoGrid spot={spot} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="grid gap-5 p-5">
          <DetailSection title="适合拍什么">
            <p>{spot.suitableForZh}</p>
          </DetailSection>

          <DetailSection title="云海判断价值">
            <p>{spot.cloudSeaValueZh}</p>
          </DetailSection>

          <DetailSection title="朝霞晚霞判断价值">
            <p>{spot.glowValueZh}</p>
          </DetailSection>

          <DetailSection title="星空银河判断价值">
            <p>{spot.astroValueZh}</p>
          </DetailSection>

          <DetailSection title="到达与安全提醒">
            <div className="grid gap-2">
              <p>到达：{spot.accessNoteZh ?? missingNote}</p>
              <p>安全：{spot.safetyNoteZh ?? missingNote}</p>
            </div>
          </DetailSection>

          <DetailSection title="数据说明">
            <div className="grid gap-2">
              <p>{spot.dataNoteZh}</p>
              <p>
                当前状态为{spotDataStatusLabels[spot.dataStatus]}，WGS84 坐标用于天文计算；
                GCJ-02 坐标会保留给后续地图展示与位置校对。
              </p>
            </div>
          </DetailSection>
        </Card>

        <aside className="grid content-start gap-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <SpotStatusBadge status={spot.dataStatus} />
              <SpotTargetBadges targets={spot.suitableTargets} />
            </div>
            <h2 className="mt-4 text-base font-bold tracking-normal text-foreground">快速分析</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              从该机位直接进入拍摄天气判断，链接会带上名称、坐标、海拔、题材和预报范围。
            </p>
            <SpotQuickActions spot={spot} detailLabels className="mt-4" />
          </Card>

          <Card className="p-4">
            <h2 className="text-base font-bold tracking-normal text-foreground">坐标说明</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              WGS84 坐标用于天气、地形与天文计算；GCJ-02 坐标保留给后续地图展示。
            </p>
          </Card>

          <Link
            href="/spots"
            className={cn(
              spotLinkButtonClassNames.base,
              spotLinkButtonClassNames.secondary,
              "w-fit",
            )}
          >
            返回机位库
          </Link>
        </aside>
      </div>
    </PublicShell>
  );
}
