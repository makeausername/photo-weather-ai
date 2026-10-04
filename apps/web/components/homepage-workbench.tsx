"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  forecastHorizonLabels,
  prioritizeForecastRisks,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastTarget,
} from "@photo-weather/shared";
import {
  HomepageSearchPanel,
  homepageDefaultHorizon,
  homepageDefaultTarget,
} from "./homepage-search-panel";
import {
  buildForecastRequestPayload,
  forgetRecentSelectedLocation,
  readRecentSelectedLocation,
  rememberRecentSelectedLocation,
  type SelectedLocation,
} from "./selected-location";
import {
  normalizeForecastClientErrorMessage,
  requestForecastCalculation,
} from "../app/forecast/forecast-request-client";
import { Badge, Card, cn } from "./ui";
import { DecisionValue } from "./decision-value";
import { ForecastEntryHeader, ForecastEntryHelp } from "./forecast-entry";
import { summarizeWeatherHours } from "../app/forecast/general-weather-data";
import { hourlyTableNumber } from "../app/forecast/professional-hourly-columns";

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
    description: "查看晴雨变化，按需展开分层云量等专业数据。",
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
    description: "先查看每天的天气变化，再按小时核对降水、风和温度。",
  },
  {
    title: "降水与风险",
    description: "提前识别降水、道路湿滑和强风等风险，准备备选方案。",
  },
] as const;

export function HomepageWorkbench() {
  const workspaceRef = useRef<HTMLElement>(null);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [forecastOptions, setForecastOptions] = useState<{
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }>({
    horizon: homepageDefaultHorizon,
    target: homepageDefaultTarget,
  });
  const [layerState, setLayerState] = useState<ForecastLayerState>({
    status: "idle",
    result: null,
  });

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

  useEffect(() => {
    if (!selectedLocation) {
      setLayerState({ status: "idle", result: null });
      return;
    }

    const location = selectedLocation;
    const controller = new AbortController();
    setLayerState({ status: "loading", result: null });

    async function loadSelectedLocationForecast() {
      try {
        const result = await requestForecastCalculation(
          buildForecastRequestPayload(location, forecastOptions.horizon, forecastOptions.target),
          {
            signal: controller.signal,
          },
        );
        setLayerState({
          status: buildHomepageLayerStatus(result),
          result,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setLayerState({
          status: "error",
          result: null,
          errorMessage: normalizeForecastClientErrorMessage(error),
        });
      }
    }

    void loadSelectedLocationForecast();

    return () => {
      controller.abort();
    };
  }, [forecastOptions.horizon, forecastOptions.target, selectedLocation]);

  return (
    <>
      <ForecastEntryHeader
        title="天气概览"
        description="查看目的地的降水、温度、风和天气风险。"
        centered={!selectedLocation}
      />
      <section
        id="analysis"
        ref={workspaceRef}
        tabIndex={-1}
        className={cn(
          "grid w-full min-w-0 scroll-mt-24 gap-5 outline-none",
          selectedLocation
            ? "min-[960px]:grid-cols-[clamp(340px,31vw,420px)_minmax(0,1fr)] min-[960px]:items-stretch xl:gap-8"
            : "mx-auto max-w-[760px]",
        )}
        data-homepage-workbench-layout={
          selectedLocation ? "scenario-two-column" : "centered-search"
        }
      >
        <HomepageSearchPanel
          selectedLocation={selectedLocation}
          onSelectedLocationChange={handleSelectedLocationChange}
          onForecastOptionsChange={setForecastOptions}
        />
        {selectedLocation ? (
          <HomepageGuidancePanel
            location={selectedLocation}
            state={layerState}
            horizon={forecastOptions.horizon}
          />
        ) : (
          <ForecastEntryHelp title="如何查看天气预报？">
            <HomepageGuidancePanel
              location={null}
              state={{ status: "idle", result: null }}
              horizon={forecastOptions.horizon}
            />
          </ForecastEntryHelp>
        )}
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
  const cards = result
    ? buildHomepageResultCards(location, state, result)
    : buildHomepageGuidanceCards(location, state);

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

function buildHomepageResultCards(
  _location: SelectedLocation | null,
  _state: ForecastLayerState,
  result: ForecastCalculationResult,
): readonly HomepageInsightCard[] {
  const summary = summarizeWeatherHours(
    result.professionalHourlyData ?? [],
    result.professionalHourlyDataTimeBasis,
  );
  const mainRisk = prioritizeForecastRisks(result.riskFlags)[0];
  return [
    {
      title: "降水",
      value: summary.rainLabel,
      description: `所示时段${summary.amountComplete ? "累计" : "已知部分"} ${hourlyTableNumber(summary.amount)} mm；小时最高概率${summary.probabilityInconsistent ? "待复核" : ` ${hourlyTableNumber(summary.maxProbability, 0)}%`}。`,
      badge: "预报",
    },
    {
      title: "预报温度",
      value: `${hourlyTableNumber(summary.minTemperature)}–${hourlyTableNumber(summary.maxTemperature)}°C`,
      description: "所示时段温度范围，逐小时查看变化。",
      badge: "温度",
    },
    {
      title: "风速与阵风",
      value: `${hourlyTableNumber(summary.maxWind)} / ${hourlyTableNumber(summary.maxGust)} m/s`,
      description: "所示时段最大风速 / 最大阵风。",
      badge: "风",
    },
    {
      title: "主要风险",
      value: mainRisk?.label ?? "未识别到主要风险",
      description: mainRisk?.description ?? "仅针对已获取数据，完整报告可查看时段与天气预警。",
      badge: mainRisk ? riskLevelLabel(mainRisk.level) : "天气",
      tone: mainRisk ? "danger" : "muted",
    },
  ];
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

function riskLevelLabel(level: ForecastCalculationResult["riskFlags"][number]["level"]): string {
  if (level === "high") {
    return "高风险";
  }
  if (level === "medium") {
    return "中风险";
  }
  return "风险";
}
