"use client";

import { useEffect, useState } from "react";
import type {
  ForecastCalculationResult,
  ForecastHorizon,
  ForecastTarget,
  ForecastWeatherSourceSummary,
  NormalizedCurrentWeather,
} from "@photo-weather/shared";
import { HomepageSearchPanel, homepageDefaultHorizon, homepageDefaultTarget } from "./homepage-search-panel";
import {
  buildForecastRequestPayload,
  type SelectedLocation,
} from "./selected-location";
import { Badge, Card } from "./ui";

type LayerStatus = "demo" | "loading" | "ready" | "partial" | "fallback" | "error";

type ForecastLayerState = {
  readonly status: LayerStatus;
  readonly result: ForecastCalculationResult | null;
  readonly errorMessage?: string;
};

type ForecastApiErrorPayload = {
  readonly message?: string;
  readonly error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const layerChips = ["云层", "风速", "湿度", "能见度", "月相", "天文窗口"] as const;

const demoTimeline = [
  { time: "04:00", label: "演示云层", tone: "muted" },
  { time: "05:10", label: "示例日出窗口", tone: "best" },
  { time: "06:25", label: "示例云缝", tone: "good" },
  { time: "09:00", label: "示例风速", tone: "risk" },
] as const;

export function HomepageWorkbench() {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [forecastOptions, setForecastOptions] = useState<{
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }>({
    horizon: homepageDefaultHorizon,
    target: homepageDefaultTarget,
  });
  const [layerState, setLayerState] = useState<ForecastLayerState>({
    status: "demo",
    result: null,
  });

  useEffect(() => {
    if (!selectedLocation) {
      setLayerState({ status: "demo", result: null });
      return;
    }

    const location = selectedLocation;
    const controller = new AbortController();
    setLayerState({ status: "loading", result: null });

    async function loadSelectedLocationForecast() {
      try {
        const response = await fetch(`${apiBaseUrl}/forecast/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            buildForecastRequestPayload(
              location,
              forecastOptions.horizon,
              forecastOptions.target,
            ),
          ),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            await readForecastApiError(response, "真实天气暂不可用，当前显示演示图层。"),
          );
        }

        const result = (await response.json()) as ForecastCalculationResult;
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
          errorMessage:
            (error as Error).message || "真实天气暂不可用，当前显示演示图层。",
        });
      }
    }

    void loadSelectedLocationForecast();

    return () => {
      controller.abort();
    };
  }, [forecastOptions.horizon, forecastOptions.target, selectedLocation]);

  return (
    <div
      id="analysis"
      className="grid scroll-mt-24 gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(360px,24vw,420px)_minmax(0,1fr)_clamp(360px,24vw,420px)] min-[1200px]:items-start"
    >
      <HomepageSearchPanel
        onSelectedLocationChange={setSelectedLocation}
        onForecastOptionsChange={setForecastOptions}
      />
      <div className="grid gap-5 min-[1200px]:contents">
        <HomepageWeatherLayer location={selectedLocation} state={layerState} />
        <HomepageDecisionSummary location={selectedLocation} state={layerState} />
      </div>
    </div>
  );
}

export function buildHomepageLayerStatus(result: ForecastCalculationResult): LayerStatus {
  const summaries = result.weatherSourceSummaries ?? [];
  const successfulRealSources = summaries.filter(
    (summary) =>
      isWeatherProviderSummary(summary) &&
      summary.dataMode === "real" &&
      (summary.success ?? summary.status === "available"),
  );
  const failedOrSkippedSources = summaries.filter(
    (summary) =>
      isWeatherProviderSummary(summary) &&
      summary.providerCode !== "mock" &&
      summary.enabled &&
      !(summary.success ?? summary.status === "available"),
  );

  if (successfulRealSources.length === 0 || result.weatherDataMode !== "real") {
    return "fallback";
  }

  return failedOrSkippedSources.length > 0 ? "partial" : "ready";
}

export function HomepageWeatherLayer({
  location,
  state,
}: {
  readonly location: SelectedLocation | null;
  readonly state: ForecastLayerState;
}) {
  const result = state.result;
  const current = result?.currentWeather;
  const cloudOpacity = typeof current?.cloudTotal === "number" ? current.cloudTotal / 100 : 0.55;
  const lowCloudOpacity = typeof current?.cloudLow === "number" ? current.cloudLow / 100 : 0.45;
  const midCloudOpacity = typeof current?.cloudMid === "number" ? current.cloudMid / 100 : 0.38;
  const highCloudOpacity = typeof current?.cloudHigh === "number" ? current.cloudHigh / 100 : 0.32;
  const sourceLabels = formatSuccessfulSourceLabels(result?.weatherSourceSummaries ?? []);

  return (
    <section className="grid min-h-[560px] overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-bold text-primary">中心天气图层</p>
          <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">
            {location ? `${location.displayName} 天气图层` : "拍摄天气图层预览"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {layerChips.map((chip) => (
            <Badge key={chip} variant={chip === "云层" ? "default" : "muted"}>
              {chip}
            </Badge>
          ))}
        </div>
      </div>

      <div className="relative min-h-[390px] overflow-hidden bg-[#EFE8D8]">
        <div
          className="absolute inset-0 opacity-75"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(221,212,196,0.55) 1px, transparent 1px), linear-gradient(0deg, rgba(221,212,196,0.55) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div
          className="absolute -left-20 top-16 h-20 w-[58%] rotate-[-6deg] rounded-full bg-white blur-sm"
          style={{ opacity: Math.max(0.24, cloudOpacity) }}
        />
        <div
          className="absolute right-[-8%] top-28 h-16 w-[48%] rotate-[5deg] rounded-full bg-white blur-sm"
          style={{ opacity: Math.max(0.2, highCloudOpacity) }}
        />
        <div
          className="absolute left-[18%] top-40 h-12 w-[52%] rotate-[-2deg] rounded-full bg-[#DDE5DD] blur-sm"
          style={{ opacity: Math.max(0.18, midCloudOpacity) }}
        />
        <div
          className="absolute left-[5%] top-60 h-14 w-[46%] rotate-[2deg] rounded-full bg-[#C9D7CE] blur-sm"
          style={{ opacity: Math.max(0.16, lowCloudOpacity) }}
        />

        <svg
          className="absolute inset-x-0 bottom-12 h-[280px] w-full"
          viewBox="0 0 900 300"
          role="img"
          aria-label="山地轮廓与天气图层示意图"
          preserveAspectRatio="none"
        >
          <path
            d="M0 245L86 198L148 218L226 148L302 188L384 112L458 174L542 95L628 168L706 132L804 205L900 160V300H0V245Z"
            fill="#D7CFBE"
          />
          <path
            d="M0 268L112 222L210 238L315 178L420 218L552 146L670 202L760 178L900 230V300H0V268Z"
            fill="#A9C7B8"
            opacity="0.72"
          />
          <path
            d="M76 244C170 214 250 210 352 234C476 262 596 226 728 206C792 196 844 199 900 214"
            fill="none"
            stroke="#2F6F5E"
            strokeOpacity="0.5"
            strokeWidth="3"
          />
          <path
            d="M46 206C142 176 238 180 324 204C425 232 532 194 628 166C720 139 802 150 884 182"
            fill="none"
            stroke="#5F8D8A"
            strokeOpacity="0.48"
            strokeWidth="2"
          />
          <path
            d="M108 166C196 134 286 142 374 168C466 195 542 154 626 126C718 96 798 104 872 138"
            fill="none"
            stroke="#D88A20"
            strokeOpacity="0.44"
            strokeWidth="2"
          />
        </svg>

        <div className="absolute left-[52%] top-[39%] grid -translate-x-1/2 -translate-y-1/2 place-items-center">
          <span className="absolute h-14 w-14 rounded-full border border-primary/35 bg-primary/10" />
          <span className="relative h-4 w-4 rounded-full border-[5px] border-primary bg-card shadow-soft" />
          <span className="mt-3 max-w-[260px] rounded-md border border-border bg-card/92 px-2.5 py-1 text-center text-xs font-bold text-card-foreground shadow-sm">
            {location?.displayName ?? "待选择地点"}
          </span>
        </div>

        <div className="absolute left-4 top-4 grid max-w-[min(360px,calc(100%-2rem))] gap-2 rounded-lg border border-border bg-card/88 p-3 shadow-sm backdrop-blur">
          <p className="text-xs font-bold text-card-foreground">图层状态</p>
          <LayerStatusText location={location} state={state} current={current} />
        </div>
      </div>

      <div className="grid gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
        <WeatherLayerTimeline result={result} />
        <p className="text-xs leading-5 text-muted-foreground">
          {layerFooterText(location, state)}
        </p>
        {location && sourceLabels.length > 0 ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {sourceLabels.map((label) => (
              <span key={label} className="rounded-md border border-border bg-muted px-2 py-1">
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LayerStatusText({
  location,
  state,
  current,
}: {
  readonly location: SelectedLocation | null;
  readonly state: ForecastLayerState;
  readonly current?: NormalizedCurrentWeather;
}) {
  if (!location) {
    return (
      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        <span>默认演示图层，请先选择拍摄地点。</span>
        <span>选择后将使用同一套天气融合接口刷新图层。</span>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        <span>{location.displayName}</span>
        <span>正在加载该地点天气图层...</span>
      </div>
    );
  }

  if (state.status === "error" || state.status === "fallback") {
    return (
      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        <span>{location.displayName}</span>
        <span>真实天气暂不可用，当前显示演示图层。</span>
        {state.errorMessage ? <span>{state.errorMessage}</span> : null}
      </div>
    );
  }

  return (
    <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
      <span>时间基准：{formatDateTime(state.result?.generatedAt)}</span>
      <span>
        云量：总 {formatPercent(current?.cloudTotal)} / 低 {formatPercent(current?.cloudLow)} / 中{" "}
        {formatPercent(current?.cloudMid)} / 高 {formatPercent(current?.cloudHigh)}
      </span>
      <span>
        风：{formatWind(current?.windSpeed, current?.windDirection)}；湿度{" "}
        {formatPercent(current?.humidity)}
      </span>
      <span>能见度：{formatKilometers(current?.visibility)}</span>
      <span>
        月相/天文：{state.result?.astroSummaries[0]?.moonPhaseNameZh ?? "本地天文服务待计算"}
      </span>
      {state.status === "partial" ? (
        <span className="font-semibold text-warning">部分数据源暂不可用，已降低置信度。</span>
      ) : null}
    </div>
  );
}

function WeatherLayerTimeline({ result }: { readonly result: ForecastCalculationResult | null }) {
  const windows = result?.bestWindows.slice(0, 4) ?? [];
  const items =
    windows.length > 0
      ? windows.map((window) => ({
          time: formatTime(window.startTime),
          label: window.label,
          tone: window.score >= 75 ? "best" : window.score >= 65 ? "good" : "muted",
        }))
      : demoTimeline;

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div key={`${item.time}-${item.label}`} className="rounded-lg border border-border bg-muted px-3 py-2">
          <div
            className={
              item.tone === "best"
                ? "mb-2 h-1.5 rounded-full bg-primary"
                : item.tone === "good"
                  ? "mb-2 h-1.5 rounded-full bg-accent"
                  : item.tone === "risk"
                    ? "mb-2 h-1.5 rounded-full bg-danger"
                    : "mb-2 h-1.5 rounded-full bg-border"
            }
          />
          <p className="text-xs font-bold text-card-foreground">{item.time}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function HomepageDecisionSummary({
  location,
  state,
}: {
  readonly location: SelectedLocation | null;
  readonly state: ForecastLayerState;
}) {
  const result = state.result;
  const bestWindow = result?.bestWindows[0];
  const mainRisk = result?.riskFlags[0];

  return (
    <Card className="grid content-start gap-4 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-primary">决策摘要</p>
          <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">
            {location ? `${location.displayName} 判断` : "待选择地点"}
          </h2>
        </div>
        <Badge variant={result?.weatherDataMode === "real" ? "success" : "warning"}>
          {summaryBadgeLabel(state)}
        </Badge>
      </div>

      <dl className="grid gap-3 text-sm">
        <SummaryTile label="地点" value={location?.displayName ?? "尚未选择"} muted />
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs font-semibold text-muted-foreground">综合指数</dt>
          <dd className="mt-1 flex items-end gap-1 text-primary">
            <span className="text-4xl font-bold leading-none">
              {typeof result?.overallScore === "number" ? result.overallScore : "--"}
            </span>
            <span className="pb-1 text-sm font-semibold">/ 100</span>
          </dd>
        </div>
        <SummaryTile
          label="推荐"
          value={
            state.status === "loading"
              ? "正在加载该地点天气图层..."
              : result?.recommendationLabel ?? "选择地点后生成判断"
          }
          muted={!result}
        />
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="最佳窗口"
            value={bestWindow ? `${formatTime(bestWindow.startTime)} - ${formatTime(bestWindow.endTime)}` : "暂无"}
          />
          <SummaryTile
            label="主要风险"
            value={mainRisk?.label ?? (result ? "暂无高等级风险" : "待计算")}
            danger={Boolean(mainRisk)}
          />
        </div>
      </dl>

      <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold leading-5 text-muted-foreground">
        {decisionSummaryText(location, state)}
      </p>
    </Card>
  );
}

function SummaryTile({
  label,
  value,
  muted = false,
  danger = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly muted?: boolean;
  readonly danger?: boolean;
}) {
  return (
    <div className={`rounded-lg border border-border ${muted ? "bg-muted" : "bg-card"} p-3`}>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words font-bold ${danger ? "text-danger" : "text-card-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

async function readForecastApiError(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as ForecastApiErrorPayload;
    return payload.message || payload.error || fallback;
  } catch {
    return fallback;
  }
}

function layerFooterText(location: SelectedLocation | null, state: ForecastLayerState): string {
  if (!location) {
    return "默认演示图层，请先选择拍摄地点。";
  }
  if (state.status === "loading") {
    return "正在加载该地点天气图层...";
  }
  if (state.status === "partial") {
    return "部分数据源暂不可用，已降低置信度。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "真实天气暂不可用，当前显示演示图层。";
  }
  return "当前图层使用所选地点与天气融合结果生成。";
}

function decisionSummaryText(location: SelectedLocation | null, state: ForecastLayerState): string {
  if (!location) {
    return "请选择地点后查看真实数据融合判断。";
  }
  if (state.status === "loading") {
    return "天气融合结果加载中，完成后会同步刷新图层和决策摘要。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "真实天气暂不可用，当前判断只可用于界面演示。";
  }
  if (state.status === "partial") {
    return "已有真实天气参与计算，但部分数据源失败，结果置信度已降低。";
  }
  return "当前摘要来自所选地点的天气融合结果。";
}

function summaryBadgeLabel(state: ForecastLayerState): string {
  if (state.status === "ready") {
    return "多源数据";
  }
  if (state.status === "partial") {
    return "部分数据";
  }
  if (state.status === "loading") {
    return "加载中";
  }
  return "演示状态";
}

function formatSuccessfulSourceLabels(
  summaries: readonly ForecastWeatherSourceSummary[],
): readonly string[] {
  const labels = summaries
    .filter(
      (summary) =>
        isWeatherProviderSummary(summary) &&
        (summary.success ?? summary.status === "available") &&
        summary.providerCode !== "mock",
    )
    .map((summary) => summary.providerLabelZh);

  return [...new Set([...labels, "本地天文服务"])];
}

function isWeatherProviderSummary(summary: ForecastWeatherSourceSummary): boolean {
  return summary.providerCode === "qweather" || summary.providerCode === "open_meteo" || summary.providerCode === "meteoblue";
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return "暂无";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
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
  return typeof value === "number" && Number.isFinite(value) ? `${roundDisplay(value)} 公里` : "暂无";
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
