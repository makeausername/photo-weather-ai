import Link from "next/link";
import type { ReactNode } from "react";
import type { ForecastTarget } from "@photo-weather/shared";
import { Badge, Card, cn } from "../../components/ui";
import {
  buildSpotForecastUrl,
  formatSpotCoordinate,
  formatSpotElevation,
  getMissingSpotFieldNote,
  spotDataStatusLabels,
  spotDifficultyLabels,
  spotTargetActionLabels,
  spotTargetDetailActionLabels,
  spotTargetLabels,
  type SpotDataStatus,
  type SpotLibraryItem,
} from "./spot-library-data";

type SpotStatusBadgeProps = {
  readonly status: SpotDataStatus;
};

const statusBadgeVariants: Record<SpotDataStatus, "accent" | "success" | "warning"> = {
  demo: "accent",
  verified: "success",
  needs_review: "warning",
};

const linkButtonBase =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-2.5 text-xs font-semibold transition";

const linkButtonVariants = {
  primary:
    "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)]",
  secondary: "border-border bg-card text-card-foreground hover:border-primary hover:bg-secondary",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
} as const;

export function SpotStatusBadge({ status }: SpotStatusBadgeProps) {
  return <Badge variant={statusBadgeVariants[status]}>{spotDataStatusLabels[status]}</Badge>;
}

export function SpotTargetBadges({ targets }: { readonly targets: readonly ForecastTarget[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {targets.map((target) => (
        <Badge key={target} variant={target === "general" ? "muted" : "default"}>
          {spotTargetLabels[target]}
        </Badge>
      ))}
    </div>
  );
}

export function SpotQuickActions({
  spot,
  detailLabels = false,
  className,
}: {
  readonly spot: SpotLibraryItem;
  readonly detailLabels?: boolean;
  readonly className?: string;
}) {
  const labels = detailLabels ? spotTargetDetailActionLabels : spotTargetActionLabels;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {(["general", "cloud_sea", "glow", "astro"] as const).map((target, index) => (
        <Link
          key={target}
          href={buildSpotForecastUrl(spot, target)}
          className={cn(
            linkButtonBase,
            index === 0 ? linkButtonVariants.primary : linkButtonVariants.secondary,
          )}
        >
          {labels[target]}
        </Link>
      ))}
    </div>
  );
}

export function SpotCard({ spot }: { readonly spot: SpotLibraryItem }) {
  const areaText = [spot.province, spot.city, spot.scenicAreaName].filter(Boolean).join(" / ");

  return (
    <Card className="flex h-full min-w-0 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-bold tracking-normal text-foreground">
            {spot.name}
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{areaText}</p>
        </div>
        <SpotStatusBadge status={spot.dataStatus} />
      </div>

      <div className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>海拔：{formatSpotElevation(spot)}</span>
          <span>难度：{spotDifficultyLabels[spot.difficultyLevel]}</span>
        </div>
        <SpotTargetBadges targets={spot.suitableTargets} />
        <div className="flex flex-wrap gap-1.5">
          {spot.bestDirectionsZh.map((direction) => (
            <Badge key={direction} variant="info">
              {direction}
            </Badge>
          ))}
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm leading-6 text-card-foreground">
        {spot.shortDescriptionZh}
      </p>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>数据完整度</span>
          <span className="font-semibold text-foreground">{spot.dataCompletenessScore}%</span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${spot.dataCompletenessScore}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href={`/spots/${spot.slug}`}
          className={cn(linkButtonBase, linkButtonVariants.secondary)}
        >
          查看详情
        </Link>
        <SpotQuickActions spot={spot} />
      </div>
    </Card>
  );
}

export function SpotInfoGrid({ spot }: { readonly spot: SpotLibraryItem }) {
  const missingNote = getMissingSpotFieldNote();
  const infoItems = [
    { label: "海拔", value: formatSpotElevation(spot) },
    {
      label: "WGS84 坐标",
      value: `${formatSpotCoordinate(spot.latitudeWgs84)}, ${formatSpotCoordinate(
        spot.longitudeWgs84,
      )}`,
    },
    {
      label: "GCJ-02 坐标",
      value:
        typeof spot.latitudeGcj02 === "number" && typeof spot.longitudeGcj02 === "number"
          ? `${formatSpotCoordinate(spot.latitudeGcj02)}, ${formatSpotCoordinate(
              spot.longitudeGcj02,
            )}`
          : missingNote,
    },
    {
      label: "适合题材",
      value: spot.suitableTargets.map((target) => spotTargetLabels[target]).join("、"),
    },
    { label: "推荐方向", value: spot.bestDirectionsZh.join("、") },
    { label: "数据完整度", value: `${spot.dataCompletenessScore}%` },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {infoItems.map((item) => (
        <Card key={item.label} className="p-4">
          <div className="text-xs font-semibold text-muted-foreground">{item.label}</div>
          <div className="mt-2 break-words text-sm font-semibold leading-6 text-foreground">
            {item.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function SpotDetailHeader({ spot }: { readonly spot: SpotLibraryItem }) {
  const areaText = [spot.scenicAreaName, spot.province, spot.city].filter(Boolean).join(" / ");

  return (
    <header className="grid gap-4 border-b border-border pb-5">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="font-medium transition hover:text-primary">
          首页
        </Link>
        <span>/</span>
        <Link href="/spots" className="font-medium transition hover:text-primary">
          机位库
        </Link>
      </nav>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SpotStatusBadge status={spot.dataStatus} />
            <Badge variant="muted">{spotDifficultyLabels[spot.difficultyLevel]}</Badge>
          </div>
          <h1 className="break-words text-3xl font-bold tracking-normal text-foreground">
            {spot.name}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{areaText}</p>
        </div>
        <SpotTargetBadges targets={spot.suitableTargets} />
      </div>
    </header>
  );
}

export function DetailSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="border-b border-border pb-5 last:border-b-0 last:pb-0">
      <h2 className="text-lg font-bold tracking-normal text-foreground">{title}</h2>
      <div className="mt-2 text-sm leading-7 text-card-foreground">{children}</div>
    </section>
  );
}

export const spotLinkButtonClassNames = {
  base: linkButtonBase,
  primary: linkButtonVariants.primary,
  secondary: linkButtonVariants.secondary,
  ghost: linkButtonVariants.ghost,
} as const;
