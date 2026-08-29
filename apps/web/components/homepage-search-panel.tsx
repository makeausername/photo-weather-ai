import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import type { SelectedLocation } from "./selected-location";

export const homepageDefaultHorizon: ForecastHorizon = "24h";
export const homepageDefaultTarget: ForecastTarget = "general";
export const homepageTargetHelperText =
  "预报范围会影响可评估的窗口数量；短周期适合临近出行，7天适合提前看趋势。";

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
      description="搜索景区、城市或具体地点，查看所选预报范围内的拍摄条件。"
      searchPlaceholder="输入景区、城市或地点名称"
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
      lockExtendedHorizonsForFree
      selectedLocation={selectedLocation}
      onSelectedLocationChange={onSelectedLocationChange}
      onForecastOptionsChange={onForecastOptionsChange}
    />
  );
}
