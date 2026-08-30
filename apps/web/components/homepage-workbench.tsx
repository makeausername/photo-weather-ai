"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  forecastHorizonLabels,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastTarget,
  type NormalizedCurrentWeather,
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
    title: "云层与光线",
    description: "对照总云量、分层云量和日出日落时间，确认光线条件。",
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
    title: "月相与夜景",
    description: "查看月相、月出月落和天文黑夜，为夜景拍摄安排时间。",
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
    <section
      id="analysis"
      ref={workspaceRef}
      tabIndex={-1}
      className="grid scroll-mt-24 gap-6 outline-none min-[960px]:grid-cols-[clamp(340px,31vw,420px)_minmax(0,1fr)] min-[960px]:items-stretch xl:gap-8"
      data-homepage-workbench-layout="scenario-two-column"
    >
      <HomepageSearchPanel
        selectedLocation={selectedLocation}
        onSelectedLocationChange={handleSelectedLocationChange}
        onForecastOptionsChange={setForecastOptions}
      />
      <HomepageGuidancePanel
        location={selectedLocation}
        state={layerState}
        horizon={forecastOptions.horizon}
      />
    </section>
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
      <Card className="p-5 sm:p-6" data-homepage-guidance-intro="true">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">综合判断</Badge>
          <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
          {location ? <Badge variant="muted">{location.displayName}</Badge> : null}
          {result && state.status === "partial" ? <Badge variant="warning">部分可用</Badge> : null}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {result && location ? `${location.displayName} 拍摄条件` : "拍摄前先看这六项"}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {homepagePanelDescription(location, state, Boolean(result))}
        </p>
      </Card>

      <div className="grid min-w-0 gap-4">
        <div
          className={cn(
            "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3",
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
        "grid min-w-0 content-start gap-4 overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-panel transition",
        fillHeight && "min-[960px]:h-full",
        loading && "animate-pulse",
      )}
      data-homepage-guidance-card={card.title}
      aria-busy={loading}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            index % 2 === 0
              ? "border-primary bg-secondary text-primary"
              : "border-accent bg-card text-accent-strong",
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
          <p
            className={cn(
              "mt-2 break-words text-lg font-bold leading-7",
              card.tone === "danger" ? "text-danger" : "text-primary",
            )}
          >
            {card.value}
          </p>
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
  location: SelectedLocation | null,
  state: ForecastLayerState,
  result: ForecastCalculationResult,
): readonly HomepageInsightCard[] {
  const current = result.currentWeather;
  const bestWindow = result.bestWindows[0];
  const mainRisk = result.riskFlags[0];
  const finalResultLabel = result.finalRecommendationLabel ?? result.recommendationLabel;
  const finalDecisionSummary =
    result.finalDecisionSummaryZh ?? decisionSummaryText(location, state);

  return [
    {
      title: "综合指数",
      value:
        typeof (result.finalScore ?? result.overallScore) === "number"
          ? `${Math.round(result.finalScore ?? result.overallScore)} / 100`
          : "待计算",
      description: "综合天气、光线、窗口和风险后的出发参考分。",
      badge: "已生成",
    },
    {
      title: "推荐等级",
      value: finalResultLabel || "待计算",
      description: finalDecisionSummary,
      badge: "判断",
    },
    {
      title: "最佳窗口",
      value: bestWindow
        ? `${formatTime(bestWindow.startTime)} - ${formatTime(bestWindow.endTime)}`
        : "暂无推荐窗口",
      description: bestWindow?.label ?? "本轮预报没有找到明确的优先拍摄窗口。",
      badge: bestWindow ? "窗口" : "待观察",
      tone: bestWindow ? undefined : "muted",
    },
    {
      title: "主要风险",
      value: mainRisk?.label ?? "暂无高等级风险",
      description: mainRisk?.description ?? "仍需在出发前复核短临天气和现场通行条件。",
      badge: mainRisk ? riskLevelLabel(mainRisk.level) : "风险",
      tone: mainRisk ? "danger" : undefined,
    },
    {
      title: "云层与风",
      value: formatCloudWindValue(current),
      description: formatCloudWindDetail(current),
      badge: "天气",
    },
    {
      title: "当前建议",
      value: currentAdviceText(location, state, result),
      description: "用于准备到达时间、备选题材和随身装备。",
      badge: "行动",
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
    return "选择地点后，将显示综合指数、推荐时段、主要风险和出行建议。";
  }
  if (state.status === "loading") {
    return "正在读取该地点的天气与天文数据。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "该地点拍摄条件暂不可用，请稍后重试；已选地点和预报范围会保留在搜索卡片中。";
  }
  if (state.status === "partial") {
    return "拍摄条件已更新；部分辅助数据暂不可用，详情会在结果页标明。";
  }
  if (hasResult) {
    return "已更新综合指数、推荐时段、主要风险、云层风况和出行建议。";
  }
  return "选择地点后，将显示综合指数、推荐时段、主要风险和出行建议。";
}

function decisionSummaryText(location: SelectedLocation | null, state: ForecastLayerState): string {
  if (!location) {
    return "选择地点后，可查看综合指数、推荐时段、主要风险和题材建议。";
  }
  if (state.status === "loading") {
    return "正在读取天气与天文数据。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "该地点拍摄条件暂不可用，请稍后重试。";
  }
  if (state.status === "partial") {
    return "部分辅助数据暂不可用，结果页会给出更完整说明。";
  }
  return "综合最佳窗口、主要风险和装备建议，优先安排到达时间与备选题材。";
}

function currentAdviceText(
  location: SelectedLocation | null,
  state: ForecastLayerState,
  result: ForecastCalculationResult | null,
): string {
  if (!location) {
    return "选择地点后生成到达时间、拍摄题材、风险和装备建议。";
  }
  if (state.status === "loading") {
    return "正在整理到达时间、拍摄题材和装备建议。";
  }
  if (!result || state.status === "fallback" || state.status === "error") {
    return "暂时无法生成建议，请稍后重试。";
  }

  const clothing = result.clothingGuide;
  const clothingLayers = clothing?.layers.slice(0, 2).join("、") ?? "";
  const accessories = clothing?.accessories.slice(0, 2).join("、") ?? "";
  const adviceParts = [
    clothing?.summaryZh,
    clothingLayers ? `穿着：${clothingLayers}` : "",
    accessories ? `携带：${accessories}` : "",
  ].filter(Boolean);

  return adviceParts.length > 0 ? adviceParts.join("；") : "根据窗口和风险安排到达时间与备选题材。";
}

function formatCloudWindValue(current: NormalizedCurrentWeather | undefined): string {
  return `云层 ${formatPercent(current?.cloudTotal)} / 风 ${formatWind(
    current?.windSpeed,
    current?.windDirection,
  )}`;
}

function formatCloudWindDetail(current: NormalizedCurrentWeather | undefined): string {
  return `低云 ${formatPercent(current?.cloudLow)}，湿度 ${formatPercent(
    current?.humidity,
  )}，能见度 ${formatKilometers(current?.visibility)}。`;
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

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatPercent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "暂无";
}

function formatKilometers(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${roundDisplay(value)} 公里`
    : "暂无";
}

function formatWind(
  windSpeed: number | null | undefined,
  windDirection: number | null | undefined,
): string {
  const speed =
    typeof windSpeed === "number" && Number.isFinite(windSpeed)
      ? `${roundDisplay(windSpeed)} m/s`
      : "暂无风速";
  const direction =
    typeof windDirection === "number" && Number.isFinite(windDirection)
      ? `${Math.round(windDirection)}°`
      : "";

  return direction ? `${speed} ${direction}` : speed;
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
