"use client";

import { useMemo, useState } from "react";
import type { ForecastTarget } from "@photo-weather/shared";
import { Button, Card, Input, Select } from "../../components/ui";
import { SpotCard } from "./spot-components";
import {
  filterSpotLibraryItems,
  getSpotRegions,
  spotDataStatusLabels,
  spotLibraryItems,
  spotTargetLabels,
  type SpotDataStatus,
  type SpotLibraryFilters,
} from "./spot-library-data";

type TargetFilterValue = ForecastTarget | "all";
type ElevationFilterValue = "all" | "high" | "medium" | "low";
type DataStatusFilterValue = SpotDataStatus | "all";

const initialFilters: Required<SpotLibraryFilters> = {
  keyword: "",
  target: "all",
  region: "all",
  elevation: "all",
  dataStatus: "all",
};

const targetFilterOptions: readonly { readonly value: TargetFilterValue; readonly label: string }[] =
  [
    { value: "all", label: "全部" },
    { value: "cloud_sea", label: "云海" },
    { value: "glow", label: "朝霞晚霞" },
    { value: "astro", label: "星空银河" },
    { value: "general", label: "综合" },
  ];

const elevationFilterOptions: readonly {
  readonly value: ElevationFilterValue;
  readonly label: string;
}[] = [
  { value: "all", label: "全部海拔" },
  { value: "high", label: "高海拔" },
  { value: "medium", label: "中海拔" },
  { value: "low", label: "低海拔" },
];

const dataStatusFilterOptions: readonly {
  readonly value: DataStatusFilterValue;
  readonly label: string;
}[] = [
  { value: "all", label: "全部" },
  { value: "verified", label: spotDataStatusLabels.verified },
  { value: "needs_review", label: spotDataStatusLabels.needs_review },
  { value: "demo", label: spotDataStatusLabels.demo },
];

export function SpotLibraryClient() {
  const [filters, setFilters] = useState(initialFilters);
  const regions = useMemo(() => getSpotRegions(), []);
  const filteredSpots = useMemo(
    () => filterSpotLibraryItems(spotLibraryItems, filters),
    [filters],
  );

  function updateFilter<Key extends keyof typeof filters>(key: Key, value: (typeof filters)[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setFilters(initialFilters);
  }

  return (
    <div className="grid gap-5">
      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.3fr)_repeat(4,minmax(140px,0.8fr))]">
          <label className="grid gap-2 text-sm font-semibold text-card-foreground">
            <span>关键词</span>
            <Input
              value={filters.keyword}
              onChange={(event) => updateFilter("keyword", event.target.value)}
              placeholder="搜索机位、景区、题材或方向"
              aria-label="搜索机位"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-card-foreground">
            <span>拍摄题材</span>
            <Select
              value={filters.target}
              onChange={(event) =>
                updateFilter("target", event.target.value as TargetFilterValue)
              }
              aria-label="按拍摄题材筛选"
            >
              {targetFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-card-foreground">
            <span>地区</span>
            <Select
              value={filters.region}
              onChange={(event) => updateFilter("region", event.target.value)}
              aria-label="按地区筛选"
            >
              <option value="all">全部地区</option>
              {regions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-card-foreground">
            <span>海拔</span>
            <Select
              value={filters.elevation}
              onChange={(event) =>
                updateFilter("elevation", event.target.value as ElevationFilterValue)
              }
              aria-label="按海拔筛选"
            >
              {elevationFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-card-foreground">
            <span>数据状态</span>
            <Select
              value={filters.dataStatus}
              onChange={(event) =>
                updateFilter("dataStatus", event.target.value as DataStatusFilterValue)
              }
              aria-label="按数据状态筛选"
            >
              {dataStatusFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              共 {filteredSpots.length} 个机位，保留 WGS84 坐标用于拍摄天气与天文判断。
            </p>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              清除筛选
            </Button>
          </div>

          {filteredSpots.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {filteredSpots.map((spot) => (
                <SpotCard key={spot.id} spot={spot} />
              ))}
            </div>
          ) : (
            <Card className="grid min-h-52 place-items-center p-6 text-center">
              <div className="max-w-md">
                <h2 className="text-xl font-bold tracking-normal text-foreground">
                  没有找到匹配机位
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  可以减少筛选条件，或返回全部机位查看。
                </p>
                <Button className="mt-4" onClick={clearFilters}>
                  清除筛选
                </Button>
              </div>
            </Card>
          )}
        </section>

        <aside className="grid content-start gap-4">
          <Card className="p-4">
            <h2 className="text-base font-bold tracking-normal text-foreground">机位库说明</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              这里优先整理能直接进入拍摄天气判断的机位资料，包括坐标、海拔、题材适配和风险备注。
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-base font-bold tracking-normal text-foreground">
              数据完整度说明
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              完整度越高，说明坐标、海拔、方向、到达和安全信息越齐全；仍需结合现场开放与天气变化复核。
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-base font-bold tracking-normal text-foreground">快速入口</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["cloud_sea", "glow", "astro"] as const).map((target) => (
                <Button
                  key={target}
                  variant="secondary"
                  size="sm"
                  onClick={() => updateFilter("target", target)}
                >
                  {spotTargetLabels[target]}机位
                </Button>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
