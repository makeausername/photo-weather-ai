"use client";

import { useCallback, useEffect, useState } from "react";
import {
  forecastHorizonLabels,
  type ForecastCalculationResult,
  type ForecastHorizon,
} from "@photo-weather/shared";
import { HomepageSearchPanel } from "./homepage-search-panel";
import {
  forgetRecentSelectedLocation,
  readRecentSelectedLocation,
  rememberRecentSelectedLocation,
  type SelectedLocation,
} from "./selected-location";
import { Badge, Card, cn } from "./ui";
import { DecisionValue } from "./decision-value";
import { ForecastEntryHeader } from "./forecast-entry";
import { PhotographyOutlook } from "../app/forecast/photography-outlook-view";

type LayerStatus = "idle" | "loading" | "ready" | "partial" | "fallback" | "error";

type ForecastLayerState = {
  readonly status: LayerStatus;
  readonly result: ForecastCalculationResult | null;
  readonly errorMessage?: string;
};

type HomepageInsightCard = {
  readonly title: string;
  readonly description: string;
  readonly value?: string;
  readonly badge?: string;
  readonly tone?: "default" | "danger" | "muted";
};

const homepageGuidanceCards = [
  {
    title: "地点与窗口",
    description: "确定拍摄地点和预报范围，先锁定需要评估的日期与时段。",
  },
  {
    title: "云层与天气",
    description: "看晴雨和云层变化，判断等光还是转拍氛围。",
  },
  {
    title: "风与湿度",
    description: "核对风速、体感和湿度变化，评估现场拍摄的可行性。",
  },
  {
    title: "能见度与通透",
    description: "结合能见度与空气通透度，判断远山和城市天际线的清晰度。",
  },
  {
    title: "小时与逐日",
    description: "按日期比较拍摄机会，找到更值得等待的时段。",
  },
  {
    title: "降水与风险",
    description: "提前识别降水、道路湿滑和强风等风险，准备备选方案。",
  },
] as const;

export function HomepageWorkbench() {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

  useEffect(() => {
    const recentLocation = readRecentSelectedLocation();
    if (recentLocation) {
      setSelectedLocation(recentLocation);
    }
  }, []);

  const handleSelectedLocationChange = useCallback((location: SelectedLocation | null) => {
    setSelectedLocation(location);
    if (location) {
      rememberRecentSelectedLocation(location);
    } else {
      forgetRecentSelectedLocation();
    }
  }, []);

  return (
    <>
      <ForecastEntryHeader
        title="拍摄天气报告"
        description="选择地点和时间范围，查看拍摄建议。"
        centered
      />
      <section
        id="analysis"
        className="mx-auto grid w-full min-w-0 max-w-[760px] gap-5"
        data-homepage-workbench-layout="centered-search"
      >
        <HomepageSearchPanel
          selectedLocation={selectedLocation}
          onSelectedLocationChange={handleSelectedLocationChange}
        />
      </section>
    </>
  );
}

export function buildHomepageLayerStatus(result: ForecastCalculationResult): LayerStatus {
  const summaries = result.weatherSourceSummaries ?? [];
  const activeSummaries = summaries.filter((summary) => summary.providerCode !== "mock");
  const successfulRealSources = summaries.filter(
    (summary) =>
      summary.providerCode !== "mock" &&
      summary.dataMode === "real" &&
      (summary.success ?? summary.status === "available"),
  );
  const failedOrSkippedSources = activeSummaries.filter(
    (summary) => summary.enabled && !(summary.success ?? summary.status === "available"),
  );

  if (successfulRealSources.length === 0 || result.weatherDataMode !== "real") {
    return "fallback";
  }

  return failedOrSkippedSources.length > 0 ? "partial" : "ready";
}

export function HomepageGuidancePanel({
  location,
  state,
  horizon,
}: {
  readonly location: SelectedLocation | null;
  readonly state: ForecastLayerState;
  readonly horizon: ForecastHorizon;
}) {
  const result = state.result;
  const hasResult = Boolean(result);
  const cards = buildHomepageGuidanceCards(location, state);
  if (result) {
    return (
      <section className="grid min-w-0 content-start gap-4" data-homepage-guidance-panel="true">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{location?.displayName ?? result.place?.name} · 拍摄建议</Badge>
          <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
          {state.status === "partial" ? <Badge variant="warning">部分资料待确认</Badge> : null}
        </div>
        <PhotographyOutlook result={result} />
      </section>
    );
  }

  return (
    <section
      className={cn(
        "grid min-w-0 gap-4",
        hasResult && "min-[960px]:h-full min-[960px]:grid-rows-[auto_minmax(0,1fr)]",
      )}
      data-homepage-guidance-panel="true"
    >
      <Card
        className={cn("p-5 sm:p-6", location && "decision-hero")}
        data-homepage-guidance-intro="true"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">天气概览</Badge>
          <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
          {location ? <Badge variant="muted">{location.displayName}</Badge> : null}
          {result && state.status === "partial" ? <Badge variant="warning">部分可用</Badge> : null}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {result && location ? `${location.displayName} 天气概览` : "如何查看天气预报"}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {homepagePanelDescription(location, state, Boolean(result))}
        </p>
      </Card>

      <div className="grid min-w-0 gap-4">
        <div
          className={cn(
            "grid min-w-0 gap-3 sm:grid-cols-2",
            !hasResult && "guide-grid xl:grid-cols-3",
            hasResult && "min-[960px]:h-full min-[960px]:auto-rows-fr",
          )}
          data-homepage-card-grid="true"
        >
          {cards.map((card, index) => (
            <HomepageInsightCardView
              key={card.title}
              card={card}
              index={index}
              fillHeight={hasResult}
              loading={state.status === "loading"}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HomepageInsightCardView({
  card,
  index,
  fillHeight,
  loading,
}: {
  readonly card: HomepageInsightCard;
  readonly index: number;
  readonly fillHeight?: boolean;
  readonly loading?: boolean;
}) {
  return (
    <article
      className={cn(
        "grid min-w-0 content-start gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 transition sm:p-5",
        fillHeight && "min-[960px]:h-full",
        loading && "animate-pulse",
      )}
      data-homepage-guidance-card={card.title}
      aria-busy={loading}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex shrink-0 items-center text-xs font-semibold",
            "text-muted-foreground",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {card.badge ? (
          <Badge
            variant={card.tone === "danger" ? "danger" : card.tone === "muted" ? "muted" : "accent"}
          >
            {card.badge}
          </Badge>
        ) : null}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold leading-6 text-card-foreground">{card.title}</h3>
        {loading ? (
          <div className="mt-2 h-4 w-1/2 animate-pulse rounded-full bg-muted" aria-hidden="true" />
        ) : null}
        {card.value ? (
          <DecisionValue value={card.value} className="mt-2 text-card-foreground" />
        ) : null}
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
      </div>
    </article>
  );
}

function buildHomepageGuidanceCards(
  location: SelectedLocation | null,
  state: ForecastLayerState,
): readonly HomepageInsightCard[] {
  const badge = homepagePendingCardBadge(location, state);

  return homepageGuidanceCards.map((card) => ({
    ...card,
    badge,
    tone: badge === "暂不可用" ? "muted" : undefined,
  }));
}

function homepagePendingCardBadge(
  location: SelectedLocation | null,
  state: ForecastLayerState,
): string | undefined {
  if (!location) {
    return undefined;
  }
  if (state.status === "loading") {
    return "加载中";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "暂不可用";
  }
  return "待计算";
}

function homepagePanelDescription(
  location: SelectedLocation | null,
  state: ForecastLayerState,
  hasResult: boolean,
): string {
  if (!location) {
    return "选择地点后，查看天气变化、降水和主要风险。";
  }
  if (state.status === "loading") {
    return "正在读取该地点的天气预报。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "该地点天气预报暂不可用，请稍后重试；已选地点和预报范围会保留在搜索卡片中。";
  }
  if (state.status === "partial") {
    return "天气预报已更新，部分数据暂缺。";
  }
  if (hasResult) {
    return "降水、温度、风和天气风险已更新。";
  }
  return "选择地点后，查看天气变化、降水和主要风险。";
}
