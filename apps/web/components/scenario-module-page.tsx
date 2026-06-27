"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ForecastCalculationResult,
  ForecastHorizon,
  ForecastTarget,
} from "@photo-weather/shared";
import { forecastHorizonLabels } from "@photo-weather/shared";
import {
  normalizeForecastClientErrorMessage,
  requestForecastCalculation,
} from "../app/forecast/forecast-request-client";
import { PlaceSearchCard } from "./place-search-card";
import { PublicShell } from "./public-shell";
import { buildForecastRequestPayload, type SelectedLocation } from "./selected-location";
import { SubjectControlPanel } from "./subject-control-panel";
import { Badge, Card, cn } from "./ui";

type PopularScenarioSpot = {
  readonly name: string;
  readonly province: string;
  readonly reason: string;
  readonly tag: string;
};

type ScenarioLearningItem = {
  readonly title: string;
  readonly description: string;
  readonly tag?: string;
};

export type ScenarioPageConfig = {
  readonly title: string;
  readonly subtitle: string;
  readonly target: ForecastTarget;
  readonly defaultHorizon: ForecastHorizon;
  readonly ctaLabel: string;
  readonly focusTitle: string;
  readonly focusDescription: string;
  readonly focusItems: readonly string[];
  readonly featurePoints: readonly string[];
  readonly infoTitle: string;
  readonly infoItems: readonly string[];
  readonly popularTitle?: string;
  readonly popularSpots?: readonly PopularScenarioSpot[];
  readonly learningTitle?: string;
  readonly learningDescription?: string;
  readonly learningBadgeLabel?: string;
  readonly learningItems?: readonly ScenarioLearningItem[];
};

type CloudSeaLayerStatus = "idle" | "loading" | "ready" | "partial" | "fallback" | "error";

export type CloudSeaForecastLayerState = {
  readonly status: CloudSeaLayerStatus;
  readonly result: ForecastCalculationResult | null;
  readonly errorMessage?: string;
};

type CloudSeaDecisionCard = {
  readonly title: string;
  readonly description: string;
  readonly value?: string;
  readonly badge?: string;
  readonly tone?: "default" | "danger" | "muted" | "warning";
};

function isSubjectScenarioEntryTarget(target: ForecastTarget): boolean {
  return target === "cloud_sea" || target === "glow" || target === "astro";
}

function subjectSearchDescription(target: ForecastTarget): string | undefined {
  if (target === "glow") {
    return "搜索景区、城市或具体地点，选择预报范围后进入朝霞晚霞专项判断。";
  }

  if (target === "astro") {
    return "搜索景区、城市或具体地点，选择预报范围后进入星空银河专项判断。";
  }

  return undefined;
}

function subjectCurrentLocationPrivacyHint(target: ForecastTarget): string {
  if (target === "glow") {
    return "浏览器定位仅用于本次朝霞晚霞判断，不会公开显示。";
  }

  if (target === "astro") {
    return "浏览器定位仅用于本次星空银河判断，不会公开显示。";
  }

  return "浏览器定位仅用于本次云海判断，不会公开显示。";
}

export function ScenarioModulePage({ config }: { readonly config: ScenarioPageConfig }) {
  if (isSubjectScenarioEntryTarget(config.target)) {
    return <SubjectScenarioEntryPage config={config} />;
  }

  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            {config.title}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
            {config.subtitle}
          </p>
        </div>
      </header>

      <section className="grid gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)_clamp(320px,22vw,380px)] min-[1200px]:items-start">
        {config.learningItems ? (
          <ScenarioLearningPageContent config={config} />
        ) : (
          <ScenarioStandardPageContent config={config} />
        )}
      </section>
    </PublicShell>
  );
}

function SubjectScenarioEntryPage({ config }: { readonly config: ScenarioPageConfig }) {
  const pageMode = "search";
  const isCloudSea = config.target === "cloud_sea";
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>(config.defaultHorizon);
  const [cloudSeaLayerState, setCloudSeaLayerState] = useState<CloudSeaForecastLayerState>({
    status: "idle",
    result: null,
  });
  const handleForecastOptionsChange = useCallback(
    (options: { readonly horizon: ForecastHorizon; readonly target: ForecastTarget }) => {
      setSelectedHorizon(options.horizon);
    },
    [],
  );

  useEffect(() => {
    if (!isCloudSea) {
      return;
    }

    if (!selectedLocation) {
      setCloudSeaLayerState({ status: "idle", result: null });
      return;
    }

    const location = selectedLocation;
    const controller = new AbortController();
    setCloudSeaLayerState({ status: "loading", result: null });

    async function loadCloudSeaForecast() {
      try {
        const result = await requestForecastCalculation(
          buildForecastRequestPayload(location, selectedHorizon, "cloud_sea"),
          {
            signal: controller.signal,
          },
        );
        setCloudSeaLayerState({
          status: buildCloudSeaLayerStatus(result),
          result,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setCloudSeaLayerState({
          status: "error",
          result: null,
          errorMessage: normalizeForecastClientErrorMessage(error),
        });
      }
    }

    void loadCloudSeaForecast();

    return () => {
      controller.abort();
    };
  }, [isCloudSea, selectedHorizon, selectedLocation]);

  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            {config.title}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
            {config.subtitle}
          </p>
        </div>
      </header>

      <section
        className={cn(
          "grid gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)]",
          isCloudSea ? "min-[900px]:items-stretch" : "min-[1200px]:items-start",
        )}
        data-cloud-sea-page-mode={isCloudSea ? pageMode : undefined}
        data-subject-scenario-page-mode={pageMode}
        data-subject-scenario-target={config.target}
      >
        {pageMode === "search" ? (
          <ScenarioSearchPanel
            config={config}
            selectedLocation={isCloudSea ? selectedLocation : undefined}
            onSelectedLocationChange={isCloudSea ? setSelectedLocation : undefined}
            onForecastOptionsChange={handleForecastOptionsChange}
          />
        ) : null}
        {isCloudSea && selectedLocation ? (
          <CloudSeaDecisionPanel
            location={selectedLocation}
            state={cloudSeaLayerState}
            horizon={selectedHorizon}
          />
        ) : (
          <SubjectKnowledgeGuide config={config} selectedHorizon={selectedHorizon} />
        )}
      </section>
    </PublicShell>
  );
}

export function buildCloudSeaLayerStatus(result: ForecastCalculationResult): CloudSeaLayerStatus {
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

export function CloudSeaDecisionPanel({
  location,
  state,
  horizon,
}: {
  readonly location: SelectedLocation;
  readonly state: CloudSeaForecastLayerState;
  readonly horizon: ForecastHorizon;
}) {
  const result = state.result;
  const hasGeneratedResult = Boolean(
    result && state.status !== "fallback" && state.status !== "error",
  );
  const cards =
    result && hasGeneratedResult
      ? buildCloudSeaResultCards(result)
      : buildCloudSeaPendingCards(state);

  return (
    <section
      className={cn(
        "grid min-w-0 gap-4",
        hasGeneratedResult && "min-[900px]:h-full min-[900px]:grid-rows-[auto_minmax(0,1fr)]",
      )}
      data-cloud-sea-decision-panel="true"
      data-cloud-sea-decision-status={state.status}
      data-cloud-sea-generated-result={hasGeneratedResult ? "true" : "false"}
    >
      <Card className="p-5" data-cloud-sea-decision-intro="true">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">云海判断</Badge>
          <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
          <Badge variant="muted">{location.displayName}</Badge>
          {state.status === "partial" ? <Badge variant="warning">部分可用</Badge> : null}
          {state.status === "fallback" || state.status === "error" ? (
            <Badge variant="warning">暂不可用</Badge>
          ) : null}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {cloudSeaPanelTitle(location, state, hasGeneratedResult)}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {cloudSeaPanelDescription(state, hasGeneratedResult)}
        </p>
      </Card>

      <div
        className={cn(
          "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3",
          hasGeneratedResult && "min-[900px]:h-full min-[900px]:auto-rows-fr",
        )}
        data-cloud-sea-decision-card-grid="true"
      >
        {cards.map((card, index) => (
          <CloudSeaDecisionCardView
            key={card.title}
            card={card}
            index={index}
            fillHeight={hasGeneratedResult}
          />
        ))}
      </div>
    </section>
  );
}

function CloudSeaDecisionCardView({
  card,
  index,
  fillHeight,
}: {
  readonly card: CloudSeaDecisionCard;
  readonly index: number;
  readonly fillHeight?: boolean;
}) {
  return (
    <article
      className={cn(
        "grid min-w-0 content-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm",
        fillHeight && "min-[900px]:h-full",
      )}
      data-cloud-sea-decision-card={card.title}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
            index % 2 === 0
              ? "border-primary bg-secondary text-primary"
              : "border-accent bg-card text-accent",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {card.badge ? <Badge variant={cloudSeaBadgeVariant(card.tone)}>{card.badge}</Badge> : null}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-bold leading-6 text-card-foreground">{card.title}</h3>
        {card.value ? (
          <p
            className={cn(
              "mt-2 break-words text-lg font-bold leading-7",
              card.tone === "danger"
                ? "text-danger"
                : card.tone === "warning"
                  ? "text-warning"
                  : card.tone === "muted"
                    ? "text-muted-foreground"
                    : "text-primary",
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

export function buildCloudSeaResultCards(
  result: ForecastCalculationResult,
): readonly CloudSeaDecisionCard[] {
  const analysis = result.cloudSeaAnalysis;
  const bestWindow =
    analysis.bestCloudSeaWindow ??
    analysis.bestCloudSeaWindows[0] ??
    analysis.watchableCloudSeaWindows[0];
  const windowRiskContext =
    bestWindow?.windowRiskContext ??
    analysis.windowRiskContext ??
    analysis.scoreCalibration.windowRiskContext;
  const firstRecommendation = analysis.travelRecommendations[0];
  const firstBackupPlan = analysis.backupPlans[0];

  return [
    {
      title: "云海综合指数",
      value: formatCloudSeaScore(analysis.overallScore ?? result.finalScore ?? result.overallScore),
      description: firstCloudSeaPublicText(
        [
          analysis.scoreCalibration.scoreExplanationZh,
          analysis.scoreCalibration.recommendationExplanationZh,
        ],
        "结合水汽基础、低云高度、清晨窗口、白墙风险与地形承托后的云海参考分。",
      ),
      badge: "已生成",
    },
    {
      title: "云海可拍机会",
      value: `形成 ${analysis.labels.formationOpportunity} / 可拍 ${analysis.labels.shootableOpportunity}`,
      description:
        "形成信号看水汽和低云是否足够；可拍窗口还会加入清晨开口、雨后开口、能见度、风速打散和降水打断。",
      badge: `可拍${analysis.labels.shootableOpportunity}`,
    },
    {
      title: "白墙风险",
      value: `${analysis.labels.whiteoutRisk}（${Math.round(analysis.whiteoutRiskScore)} / 100）`,
      description: firstCloudSeaPublicText(
        [analysis.whiteoutReasons[0], windowRiskContext?.whiteoutWindowSummaryZh],
        "低云贴近机位或湿度过高时可能遮挡视野，需要现场复核云顶高度和远山能见度。",
      ),
      badge: cloudSeaWhiteoutRiskBadge(analysis.whiteoutRiskScore),
      tone:
        analysis.whiteoutRiskScore >= 70
          ? "danger"
          : analysis.whiteoutRiskScore >= 45
            ? "warning"
            : undefined,
    },
    {
      title: "最佳云海窗口",
      value: bestWindow
        ? `${formatCloudSeaTime(bestWindow.startTime)} - ${formatCloudSeaTime(bestWindow.endTime)}`
        : "暂无明确窗口",
      description: joinCloudSeaPublicText(
        [
          bestWindow?.noteZh,
          bestWindow?.rainOpening?.messageZh,
          analysis.rainOpening.rainSupportSignal ? analysis.rainOpening.messageZh : undefined,
          windowRiskContext?.precipitationWindowSummaryZh,
        ],
        "本轮预报没有稳定云海窗口，重点保留清晨短时观察和雨后开口复核。",
      ),
      badge: bestWindow ? safeCloudSeaPublicText(bestWindow.riskTag, "窗口") : "待观察",
      tone: bestWindow ? undefined : "muted",
    },
    {
      title: "地形与机位优势",
      value: `${analysis.terrainSupport.level}（${Math.round(analysis.terrainSupport.score)} / 100）`,
      description: safeCloudSeaPublicText(
        analysis.terrainSupport.messageZh,
        "优先复核机位是否高于低云层，山谷和高差是否能承托水汽沉降。",
      ),
      badge: "地形承托",
    },
    {
      title: "现场行动建议",
      value: safeCloudSeaPublicText(
        result.finalTripDecisionLabel ??
          result.finalRecommendationLabel ??
          analysis.scoreCalibration.finalRecommendationLabel ??
          analysis.recommendationLabel,
        "现场复核",
      ),
      description: firstCloudSeaPublicText(
        [
          firstRecommendation
            ? `${firstRecommendation.action}：${firstRecommendation.detail}`
            : undefined,
          windowRiskContext?.actionAdviceZh,
          windowRiskContext?.equipmentAdviceZh,
          firstBackupPlan ? `${firstBackupPlan.action}：${firstBackupPlan.detail}` : undefined,
        ],
        "出发前复核低云高度、白墙风险、道路湿滑和雨后开口，再决定是否等待或转拍备选题材。",
      ),
      badge: "行动",
      tone: analysis.whiteoutRiskScore >= 78 ? "danger" : undefined,
    },
  ];
}

function buildCloudSeaPendingCards(
  state: CloudSeaForecastLayerState,
): readonly CloudSeaDecisionCard[] {
  if (state.status === "idle") {
    return [
      {
        title: "准备生成云海判断",
        value: "等待计算",
        description: "已接收地点选择，接下来会生成云海综合指数、白墙风险、最佳窗口和现场行动建议。",
        badge: "准备中",
      },
      {
        title: "右侧将生成云海卡片",
        description: "判断会围绕水汽基础、低云高度、地形承托、清晨窗口和雨后开口展开。",
        badge: "预览",
      },
    ];
  }

  if (state.status === "loading") {
    return [
      {
        title: "正在生成云海判断",
        value: "水汽 / 低云 / 地形",
        description: "正在结合水汽基础、低云高度、山谷地形承托、清晨窗口和风速打散风险。",
        badge: "生成中",
      },
      {
        title: "可拍机会会单独评估",
        description: "云海形成信号不等于可拍窗口；还会继续核对开口、能见度与降水打断。",
        badge: "可拍机会",
      },
      {
        title: "白墙风险同步复核",
        description: "低云接近机位或湿度过高时会降低现场可执行性，结果返回后会单独标出。",
        badge: "风险",
        tone: "warning",
      },
    ];
  }

  return [
    {
      title: "云海判断暂不可用",
      value: "保留已选地点",
      description:
        state.errorMessage ??
        "本次云海数据暂时不可用；先按水汽基础、低云高度、地形承托、风速和雨后开口做现场复核。",
      badge: "稍后重试",
      tone: "muted",
    },
    {
      title: "现场复核重点",
      description: "优先看低云是否低于机位、山谷是否能托住水汽、清晨窗口是否有开口。",
      badge: "复核",
    },
  ];
}

function cloudSeaPanelTitle(
  location: SelectedLocation,
  state: CloudSeaForecastLayerState,
  hasGeneratedResult: boolean,
): string {
  if (hasGeneratedResult) {
    return `${location.displayName} 云海拍摄判断`;
  }
  if (state.status === "loading") {
    return "正在生成云海判断";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "云海判断暂不可用";
  }
  return "准备生成云海判断";
}

function cloudSeaPanelDescription(
  state: CloudSeaForecastLayerState,
  hasGeneratedResult: boolean,
): string {
  if (state.status === "loading") {
    return "正在生成云海判断：会单独拆分水汽基础、低云高度、白墙风险、地形承托、清晨窗口和雨后开口。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "本次云海判断暂不可用；已保留地点和预报范围，可稍后重试或先按现场复核重点判断。";
  }
  if (state.status === "partial") {
    return "已生成云海判断；部分辅助数据可能缺失，建议把白墙风险、低云高度和雨后开口作为现场复核重点。";
  }
  if (hasGeneratedResult) {
    return "已根据当前预报生成云海综合指数、可拍机会、白墙风险、最佳窗口、地形优势和现场行动建议。";
  }
  return "选择地点后会在右侧生成云海专用判断卡片，不会自动离开当前页面。";
}

function cloudSeaBadgeVariant(
  tone: CloudSeaDecisionCard["tone"],
): "accent" | "danger" | "muted" | "warning" {
  if (tone === "danger") {
    return "danger";
  }
  if (tone === "warning") {
    return "warning";
  }
  if (tone === "muted") {
    return "muted";
  }
  return "accent";
}

function cloudSeaWhiteoutRiskBadge(score: number): string {
  if (score >= 70) {
    return "高风险";
  }
  if (score >= 45) {
    return "需复核";
  }
  return "风险可控";
}

function firstCloudSeaPublicText(
  values: readonly (string | null | undefined)[],
  fallback: string,
): string {
  for (const value of values) {
    const safeValue = safeCloudSeaPublicText(value, "");
    if (safeValue) {
      return safeValue;
    }
  }
  return fallback;
}

function joinCloudSeaPublicText(
  values: readonly (string | null | undefined)[],
  fallback: string,
): string {
  const safeValues = values
    .map((value) => safeCloudSeaPublicText(value, ""))
    .filter((value, index, allValues) => value && allValues.indexOf(value) === index);

  return safeValues.length > 0 ? safeValues.slice(0, 2).join(" ") : fallback;
}

function safeCloudSeaPublicText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text || unsafeCloudSeaPublicTextPattern.test(text)) {
    return fallback;
  }
  return text;
}

const unsafeCloudSeaPublicTextPattern =
  /\b(?:AI|GFS|DEM|VRT)\b|Open-Meteo|meteoblue|Copernicus|GLO-30|provider|debug|synthetic|fixture|weatherProvider|dataSource|scoreCalibration|cloudSeaAnalysis/i;

function formatCloudSeaScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} / 100`
    : "待计算";
}

function formatCloudSeaTime(value: string): string {
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

export function SubjectKnowledgeGuide({
  config,
  selectedHorizon,
}: {
  readonly config: ScenarioPageConfig;
  readonly selectedHorizon: ForecastHorizon;
}) {
  const items = config.learningItems ?? [];
  const isCloudSea = config.target === "cloud_sea";

  return (
    <section
      className="grid min-w-0 gap-4"
      data-cloud-sea-pre-result={isCloudSea ? "knowledge-guide" : undefined}
      data-subject-knowledge-guide={config.target}
    >
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{config.learningBadgeLabel ?? "判断参考"}</Badge>
          <Badge variant="muted">{forecastHorizonLabels[selectedHorizon]}</Badge>
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {config.learningTitle ?? "云海判断需要关注什么"}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {config.learningDescription ??
            "选择地点后，系统会结合时间窗口、云层、通透度、降水和地形遮挡，给出是否值得出发的判断。"}
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <article
            key={item.title}
            className="grid min-w-0 content-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm"
            data-cloud-sea-knowledge-card={isCloudSea ? "true" : undefined}
            data-subject-knowledge-card={config.target}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  index % 2 === 0
                    ? "border-primary bg-secondary text-primary"
                    : "border-accent bg-card text-accent",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              {item.tag ? (
                <Badge variant={index % 2 === 0 ? "muted" : "accent"}>{item.tag}</Badge>
              ) : null}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-6 text-card-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScenarioStandardPageContent({ config }: { readonly config: ScenarioPageConfig }) {
  return (
    <>
      <ScenarioSearchPanel config={config} />

      <div className="grid gap-5">
        <ScenarioInfoCard
          title={config.focusTitle}
          description={config.focusDescription}
          items={config.focusItems}
          tone="primary"
        />
        <ScenarioFeatureGrid title={`${config.title}核心指标`} items={config.featurePoints} />
        <ScenarioPopularSpotGrid title={config.popularTitle} spots={config.popularSpots} />
      </div>

      <ScenarioSupportRail config={config} />
    </>
  );
}

function ScenarioLearningPageContent({ config }: { readonly config: ScenarioPageConfig }) {
  if (!config.learningItems) {
    return null;
  }

  return (
    <>
      <ScenarioSearchPanel config={config} />

      <div className="grid gap-5 min-[1200px]:col-span-2">
        <div className="grid gap-5 min-[1200px]:grid-cols-[minmax(0,1fr)_clamp(300px,28vw,360px)] min-[1200px]:items-start">
          <div className="grid gap-5">
            <ScenarioInfoCard
              title={config.focusTitle}
              description={config.focusDescription}
              items={config.focusItems}
              tone="primary"
            />
            <ScenarioFeatureGrid title={`${config.title}核心指标`} items={config.featurePoints} />
          </div>

          <ScenarioSupportRail config={config} />
        </div>

        <ScenarioLearningGrid
          title={config.learningTitle ?? "判断需要看什么"}
          badgeLabel={config.learningBadgeLabel ?? "云海要素"}
          items={config.learningItems}
        />
      </div>
    </>
  );
}

function ScenarioSupportRail({ config }: { readonly config: ScenarioPageConfig }) {
  return (
    <aside className="grid content-start gap-4 min-[1200px]:sticky min-[1200px]:top-[88px]">
      <ScenarioInfoCard
        title={config.infoTitle}
        description="结果页会把该题材相关窗口和风险前置展示，便于快速判断是否值得等待。"
        items={config.infoItems}
        tone="accent"
      />
    </aside>
  );
}

function ScenarioPopularSpotGrid({
  title,
  spots,
}: {
  readonly title?: string;
  readonly spots?: readonly PopularScenarioSpot[];
}) {
  if (!title || !spots || spots.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">地点参考</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">{title}</h2>
        </div>
        <Badge variant="warning">地点参考</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {spots.map((spot) => (
          <Card key={spot.name} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-card-foreground">{spot.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{spot.province}</p>
              </div>
              <Badge variant="muted">{spot.tag}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{spot.reason}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function ScenarioLearningGrid({
  title,
  badgeLabel,
  items,
}: {
  readonly title: string;
  readonly badgeLabel: string;
  readonly items: readonly ScenarioLearningItem[];
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">判断方法</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">{title}</h2>
        </div>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item, index) => (
          <Card key={item.title} className="grid gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-base font-bold text-card-foreground">{item.title}</h3>
              {item.tag ? <Badge variant="muted">{item.tag}</Badge> : null}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ScenarioSearchPanel({
  config,
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: {
  readonly config: ScenarioPageConfig;
  readonly selectedLocation?: SelectedLocation | null;
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
}) {
  const isSubjectControlPanel = isSubjectScenarioEntryTarget(config.target);

  if (isSubjectControlPanel) {
    return (
      <SubjectControlPanel
        config={{
          target: config.target,
          defaultHorizon: config.defaultHorizon,
          ctaLabel: config.ctaLabel,
          description: subjectSearchDescription(config.target),
          currentLocationPrivacyHint: subjectCurrentLocationPrivacyHint(config.target),
        }}
        selectedLocation={selectedLocation}
        onSelectedLocationChange={onSelectedLocationChange}
        onForecastOptionsChange={onForecastOptionsChange}
      />
    );
  }

  return (
    <aside className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
      <PlaceSearchCard
        title="地点搜索与范围选择"
        description="选择景区、城市或具体地点后进入对应题材判断。"
        badgeLabel={null}
        defaultHorizon={config.defaultHorizon}
        fixedTarget={config.target}
        ctaLabel={config.ctaLabel}
        selectedLocation={selectedLocation}
        onSelectedLocationChange={onSelectedLocationChange}
        onForecastOptionsChange={onForecastOptionsChange}
      />
    </aside>
  );
}

export function ScenarioFeatureGrid({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <section className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-primary">判断指标</p>
        <h2 className="mt-1 text-xl font-bold text-foreground">{title}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <div key={item} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <span className="text-xs font-bold text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="mt-2 text-sm font-bold text-card-foreground">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScenarioInfoCard({
  title,
  description,
  items,
  tone = "primary",
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
  readonly tone?: "primary" | "accent";
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant={tone === "accent" ? "accent" : "muted"}>
          {tone === "accent" ? "窗口说明" : "判断重点"}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      <ul className="mt-4 grid gap-2">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground",
              tone === "accent" && "bg-card",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
