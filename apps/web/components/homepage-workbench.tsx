"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ForecastCalculationResult,
  ForecastHorizon,
  ForecastTarget,
  NormalizedCurrentWeather,
} from "@photo-weather/shared";
import {
  HomepageSearchPanel,
  homepageDefaultHorizon,
  homepageDefaultTarget,
} from "./homepage-search-panel";
import { buildForecastRequestPayload, type SelectedLocation } from "./selected-location";
import { Card } from "./ui";

type LayerStatus = "idle" | "loading" | "ready" | "partial" | "fallback" | "error";

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

const emptyTimeline = [
  { time: "云层", label: "云层趋势", tone: "muted" },
  { time: "日出", label: "日出窗口", tone: "best" },
  { time: "云隙", label: "云隙机会", tone: "good" },
  { time: "风速", label: "风速变化", tone: "risk" },
] as const;

export type HomepagePopularSpot = {
  readonly id: string;
  readonly name: string;
  readonly province: string;
  readonly location: string;
  readonly subjects: readonly string[];
  readonly reason: string;
  readonly selectedLocation: SelectedLocation;
};

export const homepagePopularSpots = [
  {
    id: "homepage-spot-huangshan-guangmingding",
    name: "黄山光明顶",
    province: "安徽",
    location: "黄山风景区",
    subjects: ["云海", "日出", "雪后层次"],
    reason: "高海拔观景平台，适合同时判断云海高度、日出方向和山脊层次。",
    selectedLocation: {
      id: "homepage-spot-huangshan-guangmingding",
      name: "黄山光明顶",
      displayName: "黄山光明顶",
      source: "local_photo_spot",
      originalSource: "homepage_popular_spot",
      latitudeWgs84: 30.1328,
      longitudeWgs84: 118.171,
      latitudeGcj02: 30.1351,
      longitudeGcj02: 118.1767,
      elevationMeters: 1860,
      province: "安徽省",
      city: "黄山市",
      district: "黄山区",
      scenicArea: "黄山风景区光明顶",
      dataStatus: "pending",
      coordinateSource: "本地机位",
      locationId: "location-huangshan",
      photoSpotId: "spot-guangmingding",
    },
  },
  {
    id: "homepage-spot-laojunshan-jinding",
    name: "老君山金顶",
    province: "河南",
    location: "老君山景区",
    subjects: ["云海", "日出", "雪后层次"],
    reason: "金顶主体辨识度强，适合复核高山云海、霞光和冬季强风风险。",
    selectedLocation: {
      id: "homepage-spot-laojunshan-jinding",
      name: "老君山金顶",
      displayName: "老君山金顶",
      source: "local_photo_spot",
      originalSource: "homepage_popular_spot",
      latitudeWgs84: 33.7852,
      longitudeWgs84: 111.6402,
      latitudeGcj02: 33.7867,
      longitudeGcj02: 111.6462,
      elevationMeters: 2190,
      province: "河南省",
      city: "洛阳市",
      district: "栾川县",
      scenicArea: "老君山景区金顶",
      dataStatus: "pending",
      coordinateSource: "本地机位",
      locationId: "location-laojunshan",
      photoSpotId: "spot-laojunshan-jinding",
    },
  },
  {
    id: "homepage-spot-sanqingshan-nvshenfeng",
    name: "三清山女神峰",
    province: "江西",
    location: "三清山风景名胜区",
    subjects: ["云雾", "日出", "山地通透度"],
    reason: "峰林遮挡和东方视野并存，适合判断清晨云雾、霞光与能见度。",
    selectedLocation: {
      id: "homepage-spot-sanqingshan-nvshenfeng",
      name: "三清山女神峰",
      displayName: "三清山女神峰",
      source: "local_photo_spot",
      originalSource: "homepage_popular_spot",
      latitudeWgs84: 28.9139,
      longitudeWgs84: 118.0699,
      latitudeGcj02: 28.9169,
      longitudeGcj02: 118.0751,
      elevationMeters: 1600,
      province: "江西省",
      city: "上饶市",
      district: "玉山县",
      scenicArea: "三清山风景名胜区女神峰",
      dataStatus: "pending",
      coordinateSource: "本地机位",
      locationId: "location-sanqingshan",
      photoSpotId: "spot-sanqingshan-nvshenfeng",
    },
  },
  {
    id: "homepage-spot-wugongshan-jinding",
    name: "武功山金顶",
    province: "江西",
    location: "武功山景区",
    subjects: ["云海", "日出", "星空银河"],
    reason: "高山草甸视野开阔，适合同时评估日出日落、云海和银河窗口。",
    selectedLocation: {
      id: "homepage-spot-wugongshan-jinding",
      name: "武功山金顶",
      displayName: "武功山金顶",
      source: "local_photo_spot",
      originalSource: "homepage_popular_spot",
      latitudeWgs84: 27.4716,
      longitudeWgs84: 114.1808,
      latitudeGcj02: 27.4748,
      longitudeGcj02: 114.1859,
      elevationMeters: 1918,
      province: "江西省",
      city: "萍乡市",
      district: "芦溪县",
      scenicArea: "武功山景区金顶",
      dataStatus: "pending",
      coordinateSource: "本地机位",
      locationId: "location-wugongshan",
      photoSpotId: "spot-wugongshan-jinding",
    },
  },
] as const satisfies readonly HomepagePopularSpot[];

export function homepagePopularSpotToSelectedLocation(spot: HomepagePopularSpot): SelectedLocation {
  return spot.selectedLocation;
}

export function HomepageWorkbench() {
  const workspaceRef = useRef<HTMLDivElement>(null);
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

  const selectPopularSpot = useCallback((spot: HomepagePopularSpot) => {
    setSelectedLocation(homepagePopularSpotToSelectedLocation(spot));
    window.requestAnimationFrame(() => {
      workspaceRef.current?.focus({ preventScroll: true });
      workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
        const response = await fetch(`${apiBaseUrl}/forecast/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            buildForecastRequestPayload(location, forecastOptions.horizon, forecastOptions.target),
          ),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            await readForecastApiError(response, "该地点拍摄条件暂不可用，请稍后重试。"),
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
          errorMessage: (error as Error).message || "该地点拍摄条件暂不可用，请稍后重试。",
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
      <div
        id="analysis"
        ref={workspaceRef}
        tabIndex={-1}
        className="grid scroll-mt-24 gap-5 outline-none min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(360px,24vw,420px)_minmax(0,1fr)_clamp(360px,24vw,420px)] min-[1200px]:items-start"
      >
        <HomepageSearchPanel
          selectedLocation={selectedLocation}
          onSelectedLocationChange={setSelectedLocation}
          onForecastOptionsChange={setForecastOptions}
        />
        <div className="grid gap-5 min-[1200px]:contents">
          <HomepageWeatherLayer location={selectedLocation} state={layerState} />
          <HomepageDecisionSummary location={selectedLocation} state={layerState} />
        </div>
      </div>
      <HomepagePopularSpotsSection onSelectSpot={selectPopularSpot} />
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
    (summary) =>
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

  return (
    <section className="grid min-h-[520px] overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-bold text-primary">拍摄条件概览</p>
          <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">
            {location ? `${location.displayName} 拍摄条件概览` : "拍摄条件概览"}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {location
              ? "结合该机位的云层、风、湿度、能见度、月相和关键拍摄窗口生成摘要。"
              : "选择地点后，这里会显示云层、风、湿度、能见度、月相和关键拍摄窗口。"}
          </p>
        </div>
      </div>

      <div className="relative min-h-[360px] overflow-hidden bg-[#EFE8D8]">
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
            {location?.displayName ?? "等待选择地点"}
          </span>
        </div>

        <div className="absolute left-4 top-4 grid max-w-[min(360px,calc(100%-2rem))] gap-2 rounded-lg border border-border bg-card/88 p-3 shadow-sm backdrop-blur">
          <p className="text-xs font-bold text-card-foreground">条件摘要</p>
          <LayerStatusText location={location} state={state} current={current} />
        </div>
      </div>

      <div className="grid gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
        <WeatherLayerTimeline result={result} />
        <p className="text-xs leading-5 text-muted-foreground">
          {layerFooterText(location, state)}
        </p>
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
        <span className="font-semibold text-card-foreground">等待选择地点</span>
        <span>选择地点后生成该机位的拍摄条件摘要。</span>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        <span>{location.displayName}</span>
        <span>正在加载该地点拍摄条件...</span>
      </div>
    );
  }

  if (state.status === "error" || state.status === "fallback") {
    return (
      <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
        <span>{location.displayName}</span>
        <span>该地点拍摄条件暂不可用，请稍后重试。</span>
      </div>
    );
  }

  const bestWindow = state.result?.bestWindows[0];

  return (
    <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
      <span>时间基准：{formatDateTime(state.result?.generatedAt)}</span>
      <span>
        云层：总 {formatPercent(current?.cloudTotal)} / 低 {formatPercent(current?.cloudLow)} / 中{" "}
        {formatPercent(current?.cloudMid)} / 高 {formatPercent(current?.cloudHigh)}
      </span>
      <span>风速：{formatWind(current?.windSpeed, current?.windDirection)}</span>
      <span>湿度：{formatPercent(current?.humidity)}</span>
      <span>能见度：{formatKilometers(current?.visibility)}</span>
      <span>月相：{state.result?.astroSummaries[0]?.moonPhaseNameZh ?? "待计算"}</span>
      <span>天文窗口：{bestWindow?.label ?? "等待窗口计算"}</span>
      {state.status === "partial" ? (
        <span className="font-semibold text-warning">
          部分辅助数据暂不可用，结果页会给出更完整说明。
        </span>
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
      : emptyTimeline;

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={`${item.time}-${item.label}`}
          className="rounded-lg border border-border bg-muted px-3 py-2"
        >
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

export function HomepageDecisionSummary({
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
      <div>
        <p className="text-xs font-bold text-primary">出行判断摘要</p>
        <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">
          {location ? `${location.displayName} 出行判断` : "出行判断摘要"}
        </h2>
        {!location ? (
          <p className="mt-1 text-xs font-semibold text-muted-foreground">等待选择地点</p>
        ) : null}
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
          label="推荐等级"
          value={
            state.status === "loading"
              ? "正在加载拍摄判断..."
              : result?.recommendationLabel ?? "选择地点后生成判断"
          }
          muted={!result}
        />
        <div className="grid grid-cols-2 gap-3">
          <SummaryTile
            label="最佳窗口"
            value={
              bestWindow
                ? `${formatTime(bestWindow.startTime)} - ${formatTime(bestWindow.endTime)}`
                : location
                  ? "暂无"
                  : "待计算"
            }
          />
          <SummaryTile
            label="主要风险"
            value={mainRisk?.label ?? (result ? "暂无高等级风险" : "待计算")}
            danger={Boolean(mainRisk)}
          />
        </div>
        <SummaryTile
          label="当前建议"
          value={currentAdviceText(location, state, result)}
          muted={!result}
        />
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
      <dd
        className={`mt-1 break-words font-bold ${danger ? "text-danger" : "text-card-foreground"}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function HomepagePopularSpotsSection({
  spots = homepagePopularSpots,
  onSelectSpot,
}: {
  readonly spots?: readonly HomepagePopularSpot[];
  readonly onSelectSpot: (spot: HomepagePopularSpot) => void;
}) {
  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-2xl font-bold text-foreground">精选机位</h2>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          选择常用风光机位，快速进入判断。
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {spots.map((spot) => (
          <button
            key={spot.id}
            type="button"
            onClick={() => onSelectSpot(spot)}
            className="group grid min-w-0 content-start gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground">
                {spot.province} / {spot.location}
              </p>
              <h3 className="mt-1 break-words text-lg font-bold text-card-foreground">
                {spot.name}
              </h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {spot.subjects.map((subject) => (
                <span
                  key={subject}
                  className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground group-hover:border-primary/40"
                >
                  {subject}
                </span>
              ))}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{spot.reason}</p>
            <span className="text-xs font-bold text-primary">选择机位</span>
          </button>
        ))}
      </div>
    </section>
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
    return "云层趋势、日出窗口、云隙机会和风速变化会在选择地点后刷新。";
  }
  if (state.status === "loading") {
    return "正在加载该地点拍摄条件...";
  }
  if (state.status === "partial") {
    return "部分辅助数据暂不可用，结果页会给出更完整说明。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "该地点拍摄条件暂不可用，请稍后重试。";
  }
  return "根据最佳窗口、主要风险和题材机会判断是否出发。";
}

function decisionSummaryText(location: SelectedLocation | null, state: ForecastLayerState): string {
  if (!location) {
    return "选择地点后，将生成综合指数、最佳窗口、主要风险、当前建议和拍摄题材优先级。";
  }
  if (state.status === "loading") {
    return "正在生成出行判断，完成后会同步刷新条件概览和摘要。";
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
    return "正在生成到达时间、拍摄题材和装备建议。";
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
