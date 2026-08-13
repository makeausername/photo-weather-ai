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

type SubjectForecastLayerStatus = "idle" | "loading" | "ready" | "partial" | "fallback" | "error";

export type SubjectForecastLayerState = {
  readonly status: SubjectForecastLayerStatus;
  readonly result: ForecastCalculationResult | null;
  readonly errorMessage?: string;
};

export type CloudSeaForecastLayerState = SubjectForecastLayerState;

type CloudSeaDecisionCard = {
  readonly title: string;
  readonly description: string;
  readonly value?: string;
  readonly badge?: string;
  readonly tone?: "default" | "danger" | "muted" | "warning";
};

type GlowDecisionCard = CloudSeaDecisionCard;
type GlowAnalysisForDecision = ForecastCalculationResult["glowAnalysis"];
type GlowWindowForDecision = GlowAnalysisForDecision["bestGlowWindows"][number];
type GlowTerrainObstructionForDecision =
  GlowAnalysisForDecision["terrainObstructionAssessments"][number];
type AstroDecisionCard = CloudSeaDecisionCard;
type AstroAnalysisForDecision = ForecastCalculationResult["astroAnalysis"];
type AstroWindowForDecision = AstroAnalysisForDecision["bestAstroWindows"][number];

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
  const isGlow = config.target === "glow";
  const isAstro = config.target === "astro";
  const isInlineDecisionTarget = isCloudSea || isGlow || isAstro;
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>(config.defaultHorizon);
  const [subjectLayerState, setSubjectLayerState] = useState<SubjectForecastLayerState>({
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
    if (!isInlineDecisionTarget) {
      return;
    }

    if (!selectedLocation) {
      setSubjectLayerState({ status: "idle", result: null });
      return;
    }

    const location = selectedLocation;
    const inlineForecastTarget = isAstro ? "astro" : config.target;
    const controller = new AbortController();
    setSubjectLayerState({ status: "loading", result: null });

    async function loadSubjectForecast() {
      try {
        const result = await requestForecastCalculation(
          buildForecastRequestPayload(location, selectedHorizon, inlineForecastTarget),
          {
            signal: controller.signal,
          },
        );
        setSubjectLayerState({
          status: buildSubjectForecastLayerStatus(result),
          result,
        });
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setSubjectLayerState({
          status: "error",
          result: null,
          errorMessage: normalizeForecastClientErrorMessage(error),
        });
      }
    }

    void loadSubjectForecast();

    return () => {
      controller.abort();
    };
  }, [config.target, isAstro, isInlineDecisionTarget, selectedHorizon, selectedLocation]);

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
          isInlineDecisionTarget ? "min-[900px]:items-stretch" : "min-[1200px]:items-start",
        )}
        data-cloud-sea-page-mode={isCloudSea ? pageMode : undefined}
        data-subject-scenario-page-mode={pageMode}
        data-subject-scenario-target={config.target}
      >
        {pageMode === "search" ? (
          <ScenarioSearchPanel
            config={config}
            selectedLocation={isInlineDecisionTarget ? selectedLocation : undefined}
            onSelectedLocationChange={isInlineDecisionTarget ? setSelectedLocation : undefined}
            onForecastOptionsChange={handleForecastOptionsChange}
          />
        ) : null}
        {isCloudSea && selectedLocation ? (
          <CloudSeaDecisionPanel
            location={selectedLocation}
            state={subjectLayerState}
            horizon={selectedHorizon}
          />
        ) : isGlow && selectedLocation ? (
          <GlowDecisionPanel
            location={selectedLocation}
            state={subjectLayerState}
            horizon={selectedHorizon}
          />
        ) : isAstro && selectedLocation ? (
          <AstroDecisionPanel
            location={selectedLocation}
            state={subjectLayerState}
            horizon={selectedHorizon}
          />
        ) : (
          <SubjectKnowledgeGuide config={config} selectedHorizon={selectedHorizon} />
        )}
      </section>
    </PublicShell>
  );
}

export function buildSubjectForecastLayerStatus(
  result: ForecastCalculationResult,
): SubjectForecastLayerStatus {
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

export function buildCloudSeaLayerStatus(
  result: ForecastCalculationResult,
): SubjectForecastLayerStatus {
  return buildSubjectForecastLayerStatus(result);
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
              : "border-accent bg-card text-accent-strong",
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
                  ? "text-warning-strong"
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

export function GlowDecisionPanel({
  location,
  state,
  horizon,
}: {
  readonly location: SelectedLocation;
  readonly state: SubjectForecastLayerState;
  readonly horizon: ForecastHorizon;
}) {
  const result = state.result;
  const hasGeneratedResult = Boolean(
    result && state.status !== "fallback" && state.status !== "error",
  );
  const cards =
    result && hasGeneratedResult ? buildGlowResultCards(result) : buildGlowPendingCards(state);

  return (
    <section
      className={cn(
        "grid min-w-0 gap-4",
        hasGeneratedResult && "min-[900px]:h-full min-[900px]:grid-rows-[auto_minmax(0,1fr)]",
      )}
      data-glow-decision-panel="true"
      data-glow-decision-status={state.status}
      data-glow-generated-result={hasGeneratedResult ? "true" : "false"}
    >
      <Card className="p-5" data-glow-decision-intro="true">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">朝霞晚霞判断</Badge>
          <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
          <Badge variant="muted">{location.displayName}</Badge>
          {state.status === "partial" ? <Badge variant="warning">部分可用</Badge> : null}
          {state.status === "fallback" || state.status === "error" ? (
            <Badge variant="warning">暂不可用</Badge>
          ) : null}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {glowPanelTitle(location, state, hasGeneratedResult)}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {glowPanelDescription(state, hasGeneratedResult)}
        </p>
      </Card>

      <div
        className={cn(
          "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3",
          hasGeneratedResult && "min-[900px]:h-full min-[900px]:auto-rows-fr",
        )}
        data-glow-decision-card-grid="true"
      >
        {cards.map((card, index) => (
          <GlowDecisionCardView
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

function GlowDecisionCardView({
  card,
  index,
  fillHeight,
}: {
  readonly card: GlowDecisionCard;
  readonly index: number;
  readonly fillHeight?: boolean;
}) {
  return (
    <article
      className={cn(
        "grid min-w-0 content-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm",
        fillHeight && "min-[900px]:h-full",
      )}
      data-glow-decision-card={card.title}
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
        {card.badge ? <Badge variant={glowBadgeVariant(card.tone)}>{card.badge}</Badge> : null}
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
                  ? "text-warning-strong"
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

export function buildGlowResultCards(
  result: ForecastCalculationResult,
): readonly GlowDecisionCard[] {
  const analysis = result.glowAnalysis;
  const bestWindow =
    analysis.bestGlowWindow ?? analysis.bestGlowWindows[0] ?? analysis.watchableGlowWindows[0];
  const sunriseWindow = glowWindowForPhase(analysis, "sunrise");
  const sunsetWindow = glowWindowForPhase(analysis, "sunset");
  const sunriseDay = glowDailyForPhase(analysis, "sunrise");
  const sunsetDay = glowDailyForPhase(analysis, "sunset");
  const obstructionAssessment = prioritizedGlowTerrainObstruction(analysis);
  const obstructionScore = Math.max(
    analysis.lowCloudObstructionRisk,
    analysis.glowLightPathObstructionRisk,
    analysis.cloudSuppressionRisk,
  );
  const firstBackupPlan = analysis.backupPlans[0];
  const rainWindowText = glowRainWindowText(analysis);
  const actionText = firstGlowPublicText(
    [
      analysis.travelRecommendations[0],
      firstBackupPlan ? `${firstBackupPlan.action}：${firstBackupPlan.detail}` : undefined,
    ],
    "出发前复核日出日落窗口、低云遮挡、通透度、降水打断和现场风况，再决定专程、附近蹲守或临近复核。",
  );

  return [
    {
      title: "朝霞机会",
      value: formatGlowScoreWithLabel(
        analysis.sunriseGlowScore,
        analysis.labels.sunriseGlowOpportunity,
      ),
      description: firstGlowPublicText(
        [
          sunriseWindow?.noteZh,
          sunriseDay?.keyReason,
          analysis.opportunityReasons.find((reason) => reason.includes("朝霞")),
          analysis.opportunityReasons[0],
        ],
        "重点看日出前后的东方低角度光线、中高云色彩载体、低云遮挡和降水是否打断窗口。",
      ),
      badge: "朝霞",
    },
    {
      title: "晚霞机会",
      value: formatGlowScoreWithLabel(analysis.sunsetGlowScore, analysis.labels.sunsetGlowOpportunity),
      description: firstGlowPublicText(
        [
          sunsetWindow?.noteZh,
          sunsetDay?.keyReason,
          analysis.opportunityReasons.find((reason) => reason.includes("晚霞")),
          analysis.opportunityReasons[1],
        ],
        "重点看日落前后的西向云缝、通透度、中高云层次以及低云是否压住太阳方向。",
      ),
      badge: "晚霞",
    },
    {
      title: "最佳霞光窗口",
      value: bestWindow
        ? `${formatGlowTime(bestWindow.start)} - ${formatGlowTime(bestWindow.end)}`
        : "暂无明确窗口",
      description: joinGlowPublicText(
        [
          bestWindow?.noteZh,
          bestWindow?.recommendationLabel,
          bestWindow?.riskTags.slice(0, 2).join("、"),
        ],
        "本轮预报没有明确霞光窗口，建议只保留临近复核，并关注短时云缝和降水结束后的转机。",
      ),
      badge: bestWindow ? "窗口" : "临近复核",
      tone: bestWindow ? undefined : "muted",
    },
    {
      title: "色彩载体",
      value: `${analysis.labels.colorCarrier} · ${formatGlowScore(analysis.glowCarrierScore ?? analysis.colorCarrierScore)}`,
      description: firstGlowPublicText(
        [
          analysis.cloudLayerEvidence[0]?.noteZh,
          analysis.opportunityReasons.find(
            (reason) => reason.includes("中高云") || reason.includes("色彩"),
          ),
        ],
        "适量中高云更容易承载日出日落暖色层次；过厚低云或完全空天都可能削弱霞光表现。",
      ),
      badge: "中高云",
    },
    {
      title: "遮挡与光路",
      value: obstructionAssessment
        ? obstructionAssessment.labelZh
        : `低云${analysis.labels.lowCloudObstruction} / 光路${analysis.labels.glowLightPathObstructionRisk}`,
      description: joinGlowPublicText(
        [
          obstructionAssessment?.noteZh,
          `低云遮挡${analysis.labels.lowCloudObstruction}，地形光路遮挡${analysis.labels.glowLightPathObstructionRisk}，云层压制${analysis.labels.cloudSuppressionRisk}。`,
          analysis.riskReasons.find(
            (reason) =>
              reason.includes("低云") || reason.includes("遮挡") || reason.includes("地形"),
          ),
        ],
        "需要同时复核低云是否压住太阳方向、地形是否挡住光路，以及云层厚度是否削弱霞光。",
      ),
      badge: "遮挡",
      tone: glowObstructionTone(obstructionScore, obstructionAssessment),
    },
    {
      title: "通透与现场建议",
      value: safeGlowPublicText(
        result.finalTripDecisionLabel ??
          result.finalRecommendationLabel ??
          analysis.recommendationLabel ??
          formatGlowConfidence(analysis.confidence),
        "临近复核",
      ),
      description: joinGlowPublicText(
        [analysis.aerosolAssessment.implicationZh, rainWindowText, actionText],
        "复核通透度、气溶胶影响、降水打断、风与现场稳定性后，再决定是否专程、附近蹲守或改拍备选题材。",
        3,
      ),
      badge: "行动",
      tone:
        analysis.precipitationDisruptionRisk >= 70 ||
        analysis.aerosolAssessment.state === "hazy" ||
        analysis.aerosolAssessment.state === "dusty"
          ? "warning"
          : undefined,
    },
  ];
}

function buildGlowPendingCards(state: SubjectForecastLayerState): readonly GlowDecisionCard[] {
  if (state.status === "idle") {
    return [
      {
        title: "准备生成朝霞晚霞判断",
        value: "等待计算",
        description: "已接收地点选择，接下来会生成朝霞机会、晚霞机会、霞光窗口、色彩载体和现场建议。",
        badge: "准备中",
      },
      {
        title: "右侧将生成霞光卡片",
        description: "判断会围绕日出日落窗口、中高云色彩载体、低云遮挡、地形光路、通透度和降水打断展开。",
        badge: "预览",
      },
    ];
  }

  if (state.status === "loading") {
    return [
      {
        title: "正在生成朝霞晚霞判断",
        value: "日出 / 日落 / 云层",
        description: "正在结合日出日落窗口、中高云色彩载体、低云遮挡、地形光路、通透度和降水打断。",
        badge: "生成中",
      },
      {
        title: "朝霞晚霞会分开评估",
        description: "朝霞和晚霞的太阳方位、云缝和降水时段不同，结果返回后会分别给出机会判断。",
        badge: "双窗口",
      },
      {
        title: "遮挡与通透同步复核",
        description: "低云、地形光路、气溶胶和降水会影响是否值得专程，结果返回后会单独标出。",
        badge: "复核",
        tone: "warning",
      },
    ];
  }

  return [
    {
      title: "朝霞晚霞判断暂不可用",
      value: "保留已选地点",
      description:
        state.errorMessage ??
        "本次霞光数据暂时不可用；先按日出日落时间、中高云、低云遮挡、通透度、降水和风况做临近复核。",
      badge: "稍后重试",
      tone: "muted",
    },
    {
      title: "现场复核重点",
      description: "优先看太阳方向是否有云缝、低云是否遮挡光路、透明度是否足够，以及降水是否打断关键窗口。",
      badge: "复核",
    },
  ];
}

export function AstroDecisionPanel({
  location,
  state,
  horizon,
}: {
  readonly location: SelectedLocation;
  readonly state: SubjectForecastLayerState;
  readonly horizon: ForecastHorizon;
}) {
  const result = state.result;
  const hasGeneratedResult = Boolean(
    result && state.status !== "fallback" && state.status !== "error",
  );
  const cards =
    result && hasGeneratedResult ? buildAstroResultCards(result) : buildAstroPendingCards(state);

  return (
    <section
      className={cn(
        "grid min-w-0 gap-4",
        hasGeneratedResult && "min-[900px]:h-full min-[900px]:grid-rows-[auto_minmax(0,1fr)]",
      )}
      data-astro-decision-panel="true"
      data-astro-decision-status={state.status}
      data-astro-generated-result={hasGeneratedResult ? "true" : "false"}
    >
      <Card className="p-5" data-astro-decision-intro="true">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">星空银河判断</Badge>
          <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
          <Badge variant="muted">{location.displayName}</Badge>
          {state.status === "partial" ? <Badge variant="warning">部分可用</Badge> : null}
          {state.status === "fallback" || state.status === "error" ? (
            <Badge variant="warning">暂不可用</Badge>
          ) : null}
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {astroPanelTitle(location, state, hasGeneratedResult)}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {astroPanelDescription(state, hasGeneratedResult)}
        </p>
      </Card>

      <div
        className={cn(
          "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3",
          hasGeneratedResult && "min-[900px]:h-full min-[900px]:auto-rows-fr",
        )}
        data-astro-decision-card-grid="true"
      >
        {cards.map((card, index) => (
          <AstroDecisionCardView
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

function AstroDecisionCardView({
  card,
  index,
  fillHeight,
}: {
  readonly card: AstroDecisionCard;
  readonly index: number;
  readonly fillHeight?: boolean;
}) {
  return (
    <article
      className={cn(
        "grid min-w-0 content-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm",
        fillHeight && "min-[900px]:h-full",
      )}
      data-astro-decision-card={card.title}
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
        {card.badge ? <Badge variant={astroBadgeVariant(card.tone)}>{card.badge}</Badge> : null}
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
                  ? "text-warning-strong"
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

export function buildAstroResultCards(
  result: ForecastCalculationResult,
): readonly AstroDecisionCard[] {
  const analysis = result.astroAnalysis;
  const milkyWayWindow = astroMilkyWayDecisionWindow(analysis);
  const bestWindow = milkyWayWindow ?? astroBestDecisionWindow(analysis);
  const firstBackupPlan = analysis.backupPlans[0];
  const actionText = firstAstroPublicText(
    [
      analysis.travelRecommendations[0],
      firstBackupPlan ? `${firstBackupPlan.action}：${firstBackupPlan.detail}` : undefined,
    ],
    "出发前复核暗夜窗口、月光、云量通透度、光污染方向和地平线遮挡，再决定专程、附近蹲守或临近复核。",
  );

  return [
    {
      title: "星空指数",
      value: formatAstroScore(analysis.starsScore ?? result.finalScore ?? result.overallScore),
      description: joinAstroPublicText(
        [
          analysis.astronomicalNightWindows[0]?.noteZh,
          analysis.moonlessNightWindows[0]?.noteZh,
          analysis.cloudEvidence[0]?.noteZh,
          analysis.visibilityEvidence[0]?.noteZh,
        ],
        "结合天文黑夜、云量与通透度、月光影响和现场天气风险后的星空参考。",
        3,
      ),
      badge: "星空",
    },
    {
      title: "银河机会",
      value: formatAstroScoreWithLabel(analysis.milkyWayScore, analysis.labels.milkyWayShootability),
      description: joinAstroPublicText(
        [
          milkyWayWindow?.noteZh,
          astroWindowDirectionText(milkyWayWindow),
          astroMilkyWayGeometryText(analysis, milkyWayWindow),
        ],
        "重点看银河核心是否进入天文黑夜、银心高度与方向是否可用，以及月光和地形是否压低可拍性。",
        3,
      ),
      badge: "银河",
    },
    {
      title: "最佳银河窗口",
      value: bestWindow
        ? `${formatAstroTime(bestWindow.start)} - ${formatAstroTime(bestWindow.end)}`
        : "暂无明确银河窗口",
      description: joinAstroPublicText(
        [
          bestWindow?.noteZh,
          astroWindowDirectionText(bestWindow),
          bestWindow?.riskTags.slice(0, 2).join("、"),
        ],
        "本轮预报没有明确银河窗口，可保留星空、夜景或月色题材作为备选，并临近复核云量与月光。",
        3,
      ),
      badge: bestWindow ? "窗口" : "备选",
      tone: bestWindow ? undefined : "muted",
    },
    {
      title: "月光影响",
      value: formatAstroScoreWithLabel(
        analysis.moonlightImpactScore ?? analysis.moonImpactScore,
        analysis.labels.moonlightImpact,
      ),
      description: joinAstroPublicText(
        [
          analysis.moonEvidence[0]?.noteZh,
          astroMoonInfoText(analysis),
          analysis.riskReasons.find((reason) => reason.includes("月")),
          analysis.opportunityReasons.find((reason) => reason.includes("月")),
        ],
        "重点复核月相、月亮照明、月出月落和无月黑夜长度，强月光会压低银河对比度。",
        3,
      ),
      badge: "月光",
      tone: astroMoonImpactTone(analysis),
    },
    {
      title: "云量与通透",
      value: `天况 ${formatAstroScore(analysis.skyConditionScore)} · 通透 ${formatAstroScore(
        analysis.transparencyScore,
      )}`,
      description: joinAstroPublicText(
        [
          analysis.cloudEvidence[0]?.noteZh,
          analysis.visibilityEvidence[0]?.noteZh,
          analysis.weatherBlockers[0],
          analysis.weatherBlockers[1],
        ],
        "总云量、低云、中高云、能见度、风和露水风险都会影响是否值得等待。",
        3,
      ),
      badge: "天气",
      tone: astroWeatherTone(analysis),
    },
    {
      title: "光污染与地形",
      value: safeAstroPublicText(
        analysis.finalPhotographyDecision?.recommendationLabel ??
          result.finalTripDecisionLabel ??
          result.finalRecommendationLabel ??
          analysis.recommendationLabel,
        "临近复核",
      ),
      description: joinAstroPublicText(
        [
          analysis.finalPhotographyDecision?.summaryZh,
          astroSkyDarknessText(analysis),
          analysis.lightPollution.lightPollutionNoteZh,
          analysis.targetDirectionLightPollution?.warningZh,
          analysis.terrainEvidence[0]?.noteZh,
          astroTerrainHorizonText(analysis.terrainHorizonAssessment),
          analysis.finalPhotographyDecision?.reasonsZh[0],
          analysis.lightPollutionEvidence[0]?.noteZh,
          actionText,
        ],
        "复核整体暗空、银河方向光污染、地平线遮挡和机位前景后，再决定专程、附近蹲守或改拍备选题材。",
        5,
      ),
      badge: analysis.finalPhotographyDecision ? "行动" : "地平线",
      tone: astroLightTerrainTone(analysis),
    },
  ];
}

function buildAstroPendingCards(state: SubjectForecastLayerState): readonly AstroDecisionCard[] {
  if (state.status === "idle") {
    return [
      {
        title: "准备生成星空银河判断",
        value: "等待计算",
        description: "已接收地点选择，接下来会生成星空指数、银河机会、暗夜窗口、月光影响和现场复核重点。",
        badge: "准备中",
      },
      {
        title: "右侧将生成星空卡片",
        description: "判断会围绕天文黑夜、无月黑夜、银河核心窗口、云量通透、光污染和地平线遮挡展开。",
        badge: "预览",
      },
    ];
  }

  if (state.status === "loading") {
    return [
      {
        title: "正在生成星空银河判断",
        value: "天文黑夜 / 月光 / 银河",
        description: "正在结合天文黑夜、无月时段、银河核心高度与方向、月光影响和云量通透度。",
        badge: "生成中",
      },
      {
        title: "银河窗口会单独评估",
        description: "银河窗口会同时看银心高度、方向、月光、光污染和目标方向地平线遮挡。",
        badge: "银河",
      },
      {
        title: "光污染与天气同步复核",
        description: "云量、通透度、露水风险、风和光污染方向会影响是否值得专程，结果返回后会单独标出。",
        badge: "复核",
        tone: "warning",
      },
    ];
  }

  return [
    {
      title: "星空银河判断暂不可用",
      value: "保留已选地点",
      description: safeAstroPublicText(
        state.errorMessage,
        "本次星空银河数据暂时不可用；先按天文黑夜、月出月落、云量通透、光污染和地平线遮挡做临近复核。",
      ),
      badge: "稍后重试",
      tone: "muted",
    },
    {
      title: "现场复核重点",
      description: "优先看无月黑夜是否覆盖银河窗口、云量是否打开、银河方向光污染是否偏高，以及地形是否挡住地平线。",
      badge: "复核",
    },
  ];
}

function astroPanelTitle(
  location: SelectedLocation,
  state: SubjectForecastLayerState,
  hasGeneratedResult: boolean,
): string {
  if (hasGeneratedResult) {
    return `${location.displayName} 星空银河拍摄判断`;
  }
  if (state.status === "loading") {
    return "正在生成星空银河判断";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "星空银河判断暂不可用";
  }
  return "准备生成星空银河判断";
}

function astroPanelDescription(
  state: SubjectForecastLayerState,
  hasGeneratedResult: boolean,
): string {
  if (state.status === "loading") {
    return "正在生成星空银河判断：会拆分星空指数、银河机会、最佳银河窗口、月光影响、云量通透和光污染地形。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "本次星空银河判断暂不可用；已保留地点和预报范围，可稍后重试或先按现场复核重点判断。";
  }
  if (state.status === "partial") {
    return "已生成星空银河判断；部分辅助数据可能缺失，建议把月光、云量通透、光污染方向和地形遮挡作为现场复核重点。";
  }
  if (hasGeneratedResult) {
    return "已根据当前预报生成星空指数、银河机会、最佳银河窗口、月光影响、云量通透和光污染地形建议。";
  }
  return "选择地点后会在右侧生成星空银河专用判断卡片，不会自动离开当前页面。";
}

function astroBadgeVariant(tone: AstroDecisionCard["tone"]): "accent" | "danger" | "muted" | "warning" {
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

function astroMilkyWayDecisionWindow(
  analysis: AstroAnalysisForDecision,
): AstroWindowForDecision | undefined {
  return (
    analysis.recommendedMilkyWayWindow ??
    analysis.recommendedMilkyWayWindows[0] ??
    analysis.bestAstroWindows.find(
      (window) =>
        window.type === "recommended_milky_way" || window.type === "milky_way_candidate",
    )
  );
}

function astroBestDecisionWindow(
  analysis: AstroAnalysisForDecision,
): AstroWindowForDecision | undefined {
  return (
    astroMilkyWayDecisionWindow(analysis) ??
    analysis.bestAstroWindows[0] ??
    analysis.moonlessNightWindows[0] ??
    analysis.astronomicalNightWindows[0]
  );
}

function astroWindowDirectionText(window: AstroWindowForDecision | undefined): string | undefined {
  if (!window) {
    return undefined;
  }

  const parts = [
    window.directionZh ? `银河核心方向 ${window.directionZh}` : undefined,
    typeof window.galacticCenterAltitude === "number" && Number.isFinite(window.galacticCenterAltitude)
      ? `银心高度约 ${Math.round(window.galacticCenterAltitude)}°`
      : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? `${parts.join("，")}。` : undefined;
}

function astroMilkyWayGeometryText(
  analysis: AstroAnalysisForDecision,
  window: AstroWindowForDecision | undefined,
): string | undefined {
  const windowText = astroWindowDirectionText(window);
  if (windowText) {
    return windowText;
  }
  return typeof analysis.milkyWayGeometryScore === "number" &&
    Number.isFinite(analysis.milkyWayGeometryScore)
    ? `银心高度与方向 ${formatAstroScore(analysis.milkyWayGeometryScore)}。`
    : undefined;
}

function astroMoonInfoText(analysis: AstroAnalysisForDecision): string | undefined {
  const moon = analysis.moonInfo;
  if (!moon) {
    return undefined;
  }

  const parts = [
    moon.moonPhaseNameZh ? `月相${moon.moonPhaseNameZh}` : undefined,
    typeof moon.moonIllumination === "number" && Number.isFinite(moon.moonIllumination)
      ? `月亮照明${formatAstroIllumination(moon.moonIllumination)}`
      : undefined,
    moon.moonrise ? `月出${formatAstroTime(moon.moonrise)}` : undefined,
    moon.moonset ? `月落${formatAstroTime(moon.moonset)}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? `${parts.join("，")}。` : undefined;
}

function astroSkyDarknessText(analysis: AstroAnalysisForDecision): string | undefined {
  const darkness = analysis.overallSkyDarkness;
  if (darkness?.available) {
    return `整体暗空 ${darkness.rangeLabelZh}，${darkness.skyQualityLabelZh}。`;
  }

  const estimatedRange = analysis.lightPollution.estimatedBortleRange;
  if (estimatedRange?.available) {
    return `暗空参考 ${estimatedRange.rangeLabelZh}，${estimatedRange.skyQualityLabelZh}。`;
  }

  return undefined;
}

function astroTerrainHorizonText(
  assessment: AstroAnalysisForDecision["terrainHorizonAssessment"],
): string | undefined {
  if (!assessment) {
    return undefined;
  }

  const qualitativeSummary = safeAstroPublicText(
    assessment.qualitativeFallback?.summaryZh,
    "",
  );
  if (qualitativeSummary) {
    return qualitativeSummary;
  }

  if (assessment.obstructionLevel === "clear") {
    return "目标方向地平线遮挡较低，仍需到点位复核前景和实际视线。";
  }
  if (assessment.obstructionLevel === "marginal") {
    return "目标方向地平线余量偏窄，银河核心低高度时需要提前复核遮挡。";
  }
  if (assessment.obstructionLevel === "obstructed") {
    return "目标方向存在地形遮挡，低高度银河核心可能被山体或建筑挡住。";
  }
  return undefined;
}

function astroMoonImpactTone(analysis: AstroAnalysisForDecision): AstroDecisionCard["tone"] {
  const moonImpactLevel = analysis.assessment.moonImpactLevel;
  if (
    moonImpactLevel === "high" ||
    analysis.labels.moonlightImpact === "高" ||
    analysis.moonlightImpactScore >= 70
  ) {
    return "danger";
  }
  if (moonImpactLevel === "medium" || analysis.moonlightImpactScore >= 55) {
    return "warning";
  }
  return undefined;
}

function astroWeatherTone(analysis: AstroAnalysisForDecision): AstroDecisionCard["tone"] {
  if (analysis.cloudBlockerLevel === "high" || analysis.weatherBlockers.length >= 2) {
    return "danger";
  }
  if (analysis.cloudBlockerLevel === "medium" || analysis.weatherBlockers.length > 0) {
    return "warning";
  }
  return undefined;
}

function astroLightTerrainTone(analysis: AstroAnalysisForDecision): AstroDecisionCard["tone"] {
  const lightRisk = analysis.targetDirectionLightPollution?.riskLevel;
  const terrainLevel = analysis.terrainHorizonAssessment?.obstructionLevel;
  if (lightRisk === "high" || lightRisk === "very_high" || terrainLevel === "obstructed") {
    return "danger";
  }
  if (lightRisk === "medium" || terrainLevel === "marginal") {
    return "warning";
  }
  return undefined;
}

function formatAstroScoreWithLabel(value: number | null | undefined, label: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} / 100 · ${label}`
    : label;
}

function formatAstroScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} / 100`
    : "待计算";
}

function formatAstroIllumination(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${Math.round(normalized)}%`;
}

function formatAstroTime(value: string): string {
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

function firstAstroPublicText(
  values: readonly (string | null | undefined)[],
  fallback: string,
): string {
  for (const value of values) {
    const safeValue = safeAstroPublicText(value, "");
    if (safeValue) {
      return safeValue;
    }
  }
  return fallback;
}

function joinAstroPublicText(
  values: readonly (string | null | undefined)[],
  fallback: string,
  maxItems = 2,
): string {
  const safeValues = values
    .map((value) => safeAstroPublicText(value, ""))
    .filter((value, index, allValues) => value && allValues.indexOf(value) === index);

  return safeValues.length > 0 ? safeValues.slice(0, maxItems).join(" ") : fallback;
}

function safeAstroPublicText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text || unsafeAstroPublicTextPattern.test(text)) {
    return fallback;
  }
  return text;
}

const unsafeAstroPublicTextPattern =
  /\b(?:AI|GFS|DEM|VRT)\b|Open-Meteo|meteoblue|Copernicus|GLO-30|provider|debug|synthetic|fixture|weatherProvider|dataSource|providerCode|dataset|sourceCode|sourceLabel|sourceName|VIIRS|milkyWayGeometryScore|targetDirectionLightPollution|terrainHorizonAssessment|scoreBreakdown|diagnostic|diagnostics|fieldMetadata|astroAnalysis|cloudEvidence|visibilityEvidence|moonEvidence|terrainEvidence|lightPollutionEvidence|rawValue|checksum|model|模型/i;

function glowPanelTitle(
  location: SelectedLocation,
  state: SubjectForecastLayerState,
  hasGeneratedResult: boolean,
): string {
  if (hasGeneratedResult) {
    return `${location.displayName} 朝霞晚霞拍摄判断`;
  }
  if (state.status === "loading") {
    return "正在生成朝霞晚霞判断";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "朝霞晚霞判断暂不可用";
  }
  return "准备生成朝霞晚霞判断";
}

function glowPanelDescription(
  state: SubjectForecastLayerState,
  hasGeneratedResult: boolean,
): string {
  if (state.status === "loading") {
    return "正在生成朝霞晚霞判断：会分别拆分朝霞机会、晚霞机会、霞光窗口、中高云色彩载体、遮挡光路和现场建议。";
  }
  if (state.status === "fallback" || state.status === "error") {
    return "本次朝霞晚霞判断暂不可用；已保留地点和预报范围，可稍后重试或先按现场复核重点判断。";
  }
  if (state.status === "partial") {
    return "已生成朝霞晚霞判断；部分辅助数据可能缺失，建议把低云遮挡、地形光路、通透度和降水打断作为现场复核重点。";
  }
  if (hasGeneratedResult) {
    return "已根据当前预报生成朝霞机会、晚霞机会、最佳霞光窗口、色彩载体、遮挡光路和现场行动建议。";
  }
  return "选择地点后会在右侧生成朝霞晚霞专用判断卡片，不会自动离开当前页面。";
}

function glowBadgeVariant(tone: GlowDecisionCard["tone"]): "accent" | "danger" | "muted" | "warning" {
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

function glowWindowForPhase(
  analysis: GlowAnalysisForDecision,
  phase: GlowWindowForDecision["phase"],
): GlowWindowForDecision | undefined {
  return glowDecisionWindows(analysis).find((window) => window.phase === phase);
}

function glowDecisionWindows(
  analysis: GlowAnalysisForDecision,
): readonly GlowWindowForDecision[] {
  const windows = [
    analysis.bestGlowWindow,
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
  ];

  return windows.filter((window): window is GlowWindowForDecision => Boolean(window));
}

function glowDailyForPhase(
  analysis: GlowAnalysisForDecision,
  phase: NonNullable<GlowWindowForDecision["phase"]>,
): GlowAnalysisForDecision["dailyGlow"][number] | undefined {
  return analysis.dailyGlow.find((day) =>
    phase === "sunrise" ? day.sunriseScore >= day.sunsetScore : day.sunsetScore >= day.sunriseScore,
  );
}

function prioritizedGlowTerrainObstruction(
  analysis: GlowAnalysisForDecision,
): GlowTerrainObstructionForDecision | undefined {
  return (
    analysis.terrainObstructionAssessments.find(
      (assessment) => assessment.obstructionStatus === "blocked",
    ) ??
    analysis.terrainObstructionAssessments.find(
      (assessment) => assessment.obstructionStatus === "marginal",
    ) ??
    analysis.terrainObstructionAssessments.find(
      (assessment) => assessment.dataAvailable && assessment.obstructionStatus !== "clear",
    )
  );
}

function glowObstructionTone(
  obstructionScore: number,
  assessment: GlowTerrainObstructionForDecision | undefined,
): GlowDecisionCard["tone"] {
  if (assessment?.obstructionStatus === "blocked" || obstructionScore >= 70) {
    return "danger";
  }
  if (assessment?.obstructionStatus === "marginal" || obstructionScore >= 45) {
    return "warning";
  }
  return undefined;
}

function glowRainWindowText(analysis: GlowAnalysisForDecision): string | undefined {
  if (analysis.rainOverlapsSunriseWindow && analysis.rainOverlapsSunsetWindow) {
    return "降水可能打断朝霞和晚霞关键窗口，临近出发前需要复核短临变化。";
  }
  if (analysis.rainOverlapsSunriseWindow) {
    return "降水可能打断朝霞窗口，日出前需要重点复核短临变化。";
  }
  if (analysis.rainOverlapsSunsetWindow) {
    return "降水可能打断晚霞窗口，日落前需要重点复核短临变化。";
  }
  if (analysis.precipitationDisruptionRisk >= 55) {
    return "降水打断风险偏高，关键窗口前后需要保留备选题材。";
  }
  return undefined;
}

function formatGlowScoreWithLabel(value: number | null | undefined, label: string): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} / 100 · ${label}`
    : label;
}

function formatGlowScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)} / 100`
    : "待计算";
}

function formatGlowConfidence(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `置信度 ${Math.round(value)} / 100`
    : "临近复核";
}

function formatGlowTime(value: string): string {
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

function firstGlowPublicText(
  values: readonly (string | null | undefined)[],
  fallback: string,
): string {
  for (const value of values) {
    const safeValue = safeGlowPublicText(value, "");
    if (safeValue) {
      return safeValue;
    }
  }
  return fallback;
}

function joinGlowPublicText(
  values: readonly (string | null | undefined)[],
  fallback: string,
  maxItems = 2,
): string {
  const safeValues = values
    .map((value) => safeGlowPublicText(value, ""))
    .filter((value, index, allValues) => value && allValues.indexOf(value) === index);

  return safeValues.length > 0 ? safeValues.slice(0, maxItems).join(" ") : fallback;
}

function safeGlowPublicText(value: string | null | undefined, fallback: string): string {
  const text = value?.trim();
  if (!text || unsafeGlowPublicTextPattern.test(text)) {
    return fallback;
  }
  return text;
}

const unsafeGlowPublicTextPattern =
  /\b(?:AI|GFS|DEM|VRT)\b|Open-Meteo|meteoblue|Copernicus|GLO-30|provider|debug|synthetic|fixture|weatherProvider|dataSource|glowLightPathObstructionRisk|aerosolOpticalDepth550|providerAgreement|scoreBreakdown|diagnostic|diagnostics|fieldMetadata/i;

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
                    : "border-accent bg-card text-accent-strong",
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
