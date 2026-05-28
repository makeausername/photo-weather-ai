import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import type { SelectedLocation } from "./selected-location";

export const homepageDefaultHorizon: ForecastHorizon = "48h";
export const homepageDefaultTarget: ForecastTarget = "general";
export const homepageTargetHelperText =
  "云海和霞光建议重点查看未来24–72小时，星空银河可查看未来7天。";

export function HomepageSearchPanel({
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: {
  readonly selectedLocation?: SelectedLocation | null;
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
} = {}) {
  return (
    <PlaceSearchCard
      className="min-[900px]:sticky min-[900px]:top-[88px]"
      badgeLabel={null}
      description="搜索景区、城市或具体机位，系统会结合坐标和预报范围生成判断。"
      searchPlaceholder="输入景区、城市或机位名称"
      horizonLabel="预报范围"
      defaultHorizon={homepageDefaultHorizon}
      defaultTarget={homepageDefaultTarget}
      showTargetSelector={false}
      targetHelperText={homepageTargetHelperText}
      ctaLabel="生成拍摄判断"
      ctaDisabledLabel="请先选择地点"
      showResultSourceBadges={false}
      selectedLocationDetailMode="compact"
      showSelectedLocationActions
      showQuickLocations={false}
      enableCurrentLocation
      selectedLocation={selectedLocation}
      onSelectedLocationChange={onSelectedLocationChange}
      onForecastOptionsChange={onForecastOptionsChange}
    />
  );
}
