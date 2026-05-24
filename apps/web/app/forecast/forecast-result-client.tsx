"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  forecastHorizonLabels,
  forecastTargetLabels,
  type ForecastCalculationResult,
  type ForecastQueryInput,
  type ForecastScore,
  type ForecastScoreLevel,
  type GlowBackupPlan,
} from "@photo-weather/shared";
import { PublicShell } from "../../components/public-shell";
import { MoonPhaseCalendar } from "../../components/moon-phase-calendar";
import { Badge, Button, Card, cn } from "../../components/ui";
import {
  buildForecastResultViewModel,
  getForecastResultPageShellCopy,
  type AstroDailyTrendItem,
  type AstroEvidenceViewItem,
  type AstroForecastViewModel,
  type AstroWindowViewItem,
  type CloudSeaBackupPlan,
  type CloudSeaDailyTrendItem,
  type CloudSeaForecastViewModel,
  type CloudSeaIndicatorItem,
  type CloudSeaTravelRecommendation,
  type CloudSeaWeatherEvidenceItem,
  type CloudSeaWindowItem,
  type CloudSeaVsWhiteoutView,
  type ForecastResultCard,
  type ForecastResultCardTone,
  type ForecastResultDailyItem,
  type ForecastResultSection,
  type ForecastResultSectionItem,
  type ForecastResultViewModel,
  type ForecastResultWindow,
  type ForecastResultWindowGroup,
  type GlowDailyTrendItem,
  type GlowEvidenceViewItem,
  type GlowForecastViewModel,
} from "./forecast-result-view-model";

type ForecastResultClientProps = {
  readonly query: ForecastQueryInput | null;
  readonly invalidReason?: string;
};

type LoadStatus = "idle" | "loading" | "ready" | "error";

type AiStatus = "idle" | "loading" | "ready" | "error";

type ForecastAiExplanation = {
  readonly summary: string;
  readonly recommendation: string;
  readonly mainReasons: readonly string[];
  readonly mainRisks: readonly string[];
  readonly photographerAdvice: readonly string[];
  readonly backupPlan: readonly string[];
  readonly confidenceNote: string;
};

type AiExplainResponse = {
  readonly explanation: ForecastAiExplanation;
};

type ApiErrorPayload = {
  readonly message?: string;
  readonly error?: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const sourceLabels: Record<string, string> = {
  local_location: "本地地点",
  local_photo_spot: "本地机位",
  amap: "高德地图",
  mock: "演示数据",
};

const scoreLevelLabels: Record<ForecastScoreLevel, string> = {
  poor: "较差",
  fair: "一般",
  good: "较好",
  excellent: "优秀",
};

async function readApiErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text();
  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as ApiErrorPayload;
    return payload.message || payload.error || fallback;
  } catch {
    return fallback;
  }
}

export function ForecastResultClient({ query, invalidReason }: ForecastResultClientProps) {
  const [status, setStatus] = useState<LoadStatus>(query ? "loading" : "idle");
  const [result, setResult] = useState<ForecastCalculationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiExplanation, setAiExplanation] = useState<ForecastAiExplanation | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState("");

  const queryKey = useMemo(() => (query ? JSON.stringify(query) : ""), [query]);
  const shellCopy = getForecastResultPageShellCopy(query?.target ?? result?.target ?? "general");
  const usesSpecializedResultHeader =
    (query?.target === "general" ||
      query?.target === "cloud_sea" ||
      query?.target === "glow" ||
      query?.target === "astro") &&
    result !== null;

  useEffect(() => {
    if (!query) {
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setResult(null);
    setErrorMessage("");
    setAiStatus("idle");
    setAiExplanation(null);
    setAiErrorMessage("");

    async function calculateForecast() {
      try {
        const response = await fetch(`${apiBaseUrl}/forecast/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(query),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            await readApiErrorMessage(response, "拍摄天气分析暂时不可用，请稍后重试。"),
          );
        }

        const data = (await response.json()) as ForecastCalculationResult;
        setResult(data);
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }

        setErrorMessage((error as Error).message || "拍摄天气分析暂时不可用，请稍后重试。");
        setStatus("error");
      }
    }

    void calculateForecast();

    return () => {
      controller.abort();
    };
  }, [query, queryKey]);

  async function generateAiExplanation() {
    if (!query || !result || aiStatus === "loading") {
      return;
    }

    setAiStatus("loading");
    setAiErrorMessage("");
    try {
      const response = await fetch(`${apiBaseUrl}/forecast/ai-explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(query),
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "智能解读暂时不可用。"));
      }

      const data = (await response.json()) as AiExplainResponse;
      setAiExplanation(data.explanation);
      setAiStatus("ready");
    } catch (error) {
      setAiErrorMessage((error as Error).message || "智能解读暂时不可用。");
      setAiStatus("error");
    }
  }

  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      {!usesSpecializedResultHeader ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="当前位置" className="flex items-center gap-2 text-sm">
              <a
                href="/"
                className="font-medium text-muted-foreground transition hover:text-primary"
              >
                首页
              </a>
              <span className="text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">{shellCopy.pageTitle}</span>
            </nav>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.assign("/#analysis");
              }}
            >
              重新选择地点
            </Button>
          </div>

          <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 min-[900px]:flex-row min-[900px]:items-end">
            <div className="max-w-4xl">
              <Badge variant="default">{shellCopy.badgeLabel}</Badge>
              <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
                {shellCopy.pageTitle}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
                {shellCopy.pageSubtitle}
              </p>
            </div>
            <Badge variant={result?.isMock || status === "loading" ? "warning" : "success"}>
              {result?.isMock || status === "loading" ? "体验模式" : "已接入数据源"}
            </Badge>
          </header>
        </>
      ) : null}

      {!query ? <InvalidQueryCard message={invalidReason} /> : null}

      {query && status === "loading" ? <LoadingDashboard query={query} /> : null}

      {query && status === "error" ? (
        <DashboardFrame query={query}>
          <Card className="border-danger p-5 shadow-sm">
            <h2 className="text-lg font-bold text-danger">分析失败</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorMessage}</p>
          </Card>
        </DashboardFrame>
      ) : null}

      {query && result ? (
        <ForecastResultView
          query={query}
          result={result}
          aiStatus={aiStatus}
          aiExplanation={aiExplanation}
          aiErrorMessage={aiErrorMessage}
          onGenerateAiExplanation={generateAiExplanation}
        />
      ) : null}
    </PublicShell>
  );
}

function DashboardFrame({
  query,
  children,
}: {
  readonly query: ForecastQueryInput;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid gap-5 min-[900px]:grid-cols-[clamp(300px,32vw,360px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(320px,23vw,380px)_minmax(0,1fr)_clamp(320px,23vw,380px)] min-[1200px]:items-start">
      <aside className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
        <QuerySummaryPanel query={query} />
      </aside>
      <div className="grid gap-5 min-[1200px]:contents">{children}</div>
    </section>
  );
}

function LoadingDashboard({ query }: { readonly query: ForecastQueryInput }) {
  return (
    <DashboardFrame query={query}>
      <Card className="p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-card-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          正在生成拍摄天气分析...
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          正在结合天文计算数据、演示天气数据和演示地形数据计算出片指数。
        </p>
      </Card>
      <Card className="p-5 shadow-sm">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          天文数据由本地计算流程生成；天气与地形当前使用演示数据生成体验结果。
        </p>
      </Card>
    </DashboardFrame>
  );
}

function QuerySummaryPanel({ query }: { readonly query: ForecastQueryInput }) {
  return (
    <Card className="grid gap-4 p-4 shadow-sm">
      <div>
        <p className="text-xs font-bold text-primary">地点 / 查询</p>
        <h2 className="mt-2 break-words text-2xl font-bold leading-tight text-card-foreground">
          {query.name}
        </h2>
      </div>

      <dl className="grid gap-3 text-sm">
        <SummaryItem label="预报范围" value={forecastHorizonLabels[query.horizon]} />
        <SummaryItem label="分析目标" value={forecastTargetLabels[query.target]} />
        <SummaryItem label="数据来源" value={sourceLabels[query.source] ?? "其他来源"} />
      </dl>

      <details className="rounded-lg border border-border bg-muted px-3 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-card-foreground">坐标信息</summary>
        <div className="mt-3 grid gap-1 break-words text-xs leading-5 text-muted-foreground">
          <span>
            GCJ-02：{formatCoordinate(query.latitudeGcj02)},{" "}
            {formatCoordinate(query.longitudeGcj02)}
          </span>
          <span>
            WGS84：{formatCoordinate(query.latitudeWgs84)}, {formatCoordinate(query.longitudeWgs84)}
          </span>
        </div>
      </details>
    </Card>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-bold text-card-foreground">{value}</dd>
    </div>
  );
}

function weatherStatusLabel(result: ForecastCalculationResult): string {
  return result.weatherNoticeZh.replace(/^天气数据：/, "");
}

function weatherModeBadge(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "真实数据源";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例数据";
  }
  return "演示数据";
}

function InvalidQueryCard({ message }: { readonly message?: string }) {
  return (
    <Card className="border-warning p-5 shadow-sm">
      <h2 className="text-lg font-bold text-warning">查询参数不完整</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {message ?? "请从首页选择地点和预报范围，或从专题页进入对应题材分析。"}
      </p>
    </Card>
  );
}

function ForecastResultView({
  query,
  result,
  aiStatus,
  aiExplanation,
  aiErrorMessage,
  onGenerateAiExplanation,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly aiStatus: AiStatus;
  readonly aiExplanation: ForecastAiExplanation | null;
  readonly aiErrorMessage: string;
  readonly onGenerateAiExplanation: () => void;
}) {
  const viewModel = useMemo(
    () => buildForecastResultViewModel(result, query.target),
    [query.target, result],
  );

  if (viewModel.target === "general") {
    return (
      <ComprehensiveForecastView
        query={query}
        result={result}
        viewModel={viewModel}
        aiStatus={aiStatus}
        aiExplanation={aiExplanation}
        aiErrorMessage={aiErrorMessage}
        onGenerateAiExplanation={onGenerateAiExplanation}
      />
    );
  }

  if (viewModel.target === "cloud_sea" && viewModel.cloudSea) {
    return <CloudSeaResultPage query={query} result={result} viewModel={viewModel.cloudSea} />;
  }

  if (viewModel.target === "glow" && viewModel.glow) {
    return <GlowResultPage query={query} result={result} viewModel={viewModel.glow} />;
  }

  if (viewModel.target === "astro" && viewModel.astro) {
    return <AstroResultPage query={query} result={result} viewModel={viewModel.astro} />;
  }

  return (
    <DashboardFrame query={query}>
      <main className="grid gap-4">
        <Card className="grid gap-4 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-primary">{viewModel.targetLabel}</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-card-foreground">
                {viewModel.recommendationLabel}
              </h2>
            </div>
            <Badge variant={result.isMock ? "warning" : "success"}>
              {result.isMock ? "演示数据" : "已接入数据源"}
            </Badge>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{viewModel.primarySummary}</p>
          <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {viewModel.primaryCards.map((card) => (
              <PrimaryResultCard key={card.key} card={card} />
            ))}
          </section>
        </Card>

        {viewModel.dailyItems.length > 0 ? (
          <DailyOverviewPanel
            title={viewModel.dailyOverviewTitle ?? "逐日判断"}
            description={viewModel.dailyOverviewDescription ?? "按日期展示主要判断。"}
            items={viewModel.dailyItems}
          />
        ) : null}

        <WindowPanel
          title={viewModel.windowsTitle}
          description={viewModel.windowsDescription}
          windows={viewModel.bestWindows}
          groups={viewModel.windowGroups}
        />

        <ScoreCardsPanel title={viewModel.scoreSectionTitle} scores={viewModel.scoreCards} />

        <SectionGrid sections={viewModel.detailSections} />

        {query.target === "astro" ? (
          <MoonPhaseCalendar
            latitudeWgs84={query.latitudeWgs84}
            longitudeWgs84={query.longitudeWgs84}
            timezone={result.calendarBasis.timezone}
          />
        ) : null}
      </main>

      <aside className="grid content-start gap-4">
        <MockWarningCard result={result} dataNotice={viewModel.dataNotice} />
        <AiExplanationPanel
          status={aiStatus}
          explanation={aiExplanation}
          errorMessage={aiErrorMessage}
          onGenerate={onGenerateAiExplanation}
        />
        <SectionStack sections={viewModel.riskSections} />
        <SectionStack sections={viewModel.adviceSections} />
        <CalculationBasisPanel result={result} />
        <DataStatusPanel result={result} />
      </aside>
    </DashboardFrame>
  );
}

export function CloudSeaResultPage({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: CloudSeaForecastViewModel;
}) {
  return (
    <section
      className="CloudSeaResultPage cloud-sea-result-page grid gap-5"
      data-cloud-sea-section="CloudSeaResultPage"
    >
      <CloudSeaTopContext query={query} result={result} />
      <CloudSeaCoreDecision cards={viewModel.coreCards} />

      <main
        className="cloud-sea-result-stack grid gap-5"
        data-cloud-sea-section="CloudSeaStackedLayout"
      >
        <CloudSeaDailyTrend result={result} items={viewModel.dailyTrend} />
        <CloudSeaWhiteoutSection view={viewModel.cloudSeaVsWhiteout} />
        <CloudSeaTimeWindowSection windows={viewModel.cloudSeaWindows} />
        <CloudSeaTerrainEvidence terrainEvidence={viewModel.terrainEvidence} />
        <CloudSeaWeatherEvidence items={viewModel.weatherEvidence} />
        <CloudSeaActionGrid
          result={result}
          travelRecommendations={viewModel.travelRecommendations}
          riskSummary={viewModel.riskSummary}
          backupPlans={viewModel.backupPlans}
        />
        {viewModel.missingDataNotes.length > 0 ? (
          <CloudSeaMissingDataSection notes={viewModel.missingDataNotes} />
        ) : null}
      </main>
    </section>
  );
}

export function GlowResultPage({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: GlowForecastViewModel;
}) {
  return (
    <section
      className="GlowResultPage glow-result-page grid gap-5"
      data-glow-section="GlowResultPage"
    >
      <GlowTopContext query={query} result={result} />
      <GlowCoreDecision cards={viewModel.coreCards} />

      <main className="glow-result-stack grid gap-5" data-glow-section="GlowStackedLayout">
        <GlowDailyTrend result={result} items={viewModel.dailyTrend} />
        <GlowTwilightSection result={result} />
        <GlowEvidenceSection
          title="云层结构判断"
          badgeLabel="总云量 / 低云 / 中云 / 高云"
          items={viewModel.cloudLayerEvidence}
          dataSection="GlowCloudLayerSection"
        />
        <GlowLowCloudRiskSection result={result} />
        <GlowEvidenceSection
          title="能见度与通透度"
          badgeLabel="能见度 / 湿度 / 风 / 降水"
          items={viewModel.visibilityEvidence}
          dataSection="GlowVisibilitySection"
        />
        <GlowTerrainSection result={result} items={viewModel.terrainObstructionEvidence} />
        <GlowAdviceSection items={viewModel.travelRecommendations} />
        <GlowRiskSection result={result} risks={viewModel.riskReasons} />
        <GlowBackupPlanSection plans={viewModel.backupPlans} />
        <GlowDataStatusSection
          result={result}
          notes={viewModel.missingDataNotes}
          dataNotice={viewModel.dataNotice}
        />
      </main>
    </section>
  );
}

export function AstroResultPage({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: AstroForecastViewModel;
}) {
  return (
    <section
      className="AstroResultPage astro-result-page grid gap-5"
      data-astro-section="AstroResultPage"
    >
      <AstroTopContext query={query} result={result} />
      <AstroCoreDecision cards={viewModel.coreCards} />

      <main
        className="AstroResultLayout astro-result-stack grid gap-5"
        data-astro-section="AstroResultLayout"
      >
        <AstroDailyTrend result={result} items={viewModel.dailyTrend} />
        <AstroNightWindowSection
          astronomicalNightWindows={viewModel.astronomicalNightWindows}
          moonlessNightWindows={viewModel.moonlessNightWindows}
          astroDataSourceLabel={result.astroDataSourceLabelZh}
        />
        <AstroMilkyWaySection
          candidateWindows={viewModel.milkyWayCandidateWindows}
          recommendedWindows={viewModel.recommendedMilkyWayWindows}
        />
        <AstroMoonPhaseSection result={result} />
        <AstroMoonriseMoonsetSection result={result} />
        <AstroEvidenceSection
          title="云量与能见度"
          badgeLabel="云层 / 通透 / 湿度"
          items={[...viewModel.cloudEvidence, ...viewModel.visibilityEvidence]}
          dataSection="AstroCloudVisibilitySection"
        />
        <AstroEvidenceSection
          title="光污染与地形遮挡"
          badgeLabel="光污染 / 地平线"
          items={[...viewModel.lightPollutionEvidence, ...viewModel.terrainEvidence]}
          dataSection="AstroLightTerrainSection"
        />
        <AstroAdviceSection items={viewModel.travelRecommendations} />
        <AstroRiskSection risks={viewModel.riskReasons} />
        <AstroBackupPlanSection plans={viewModel.backupPlans} />
        <AstroDataStatusSection
          result={result}
          notes={viewModel.missingDataNotes}
          dataNotice={viewModel.dataNotice}
        />
        <AstroMoonCalendarAction query={query} result={result} />
      </main>
    </section>
  );
}

function AstroTopContext({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">星空银河判断</Badge>
            <Badge variant={result.isMock ? "warning" : "success"}>
              {result.isMock ? "体验模式" : "已接入数据源"}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
            <Badge variant="info">
              置信度：{confidenceLabel(result.astroAnalysis.confidenceLevel)}
            </Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1120px]:flex min-[1120px]:flex-wrap min-[1120px]:gap-2">
            <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>更新时间：{formatDateTime(result.generatedAt)}</span>
            <span>数据状态：{weatherStatusLabel(result)}</span>
            <span>天气数据：{weatherModeBadge(result)}</span>
            <span>地形数据：{result.terrainAnalysis.dataSourceLabelZh}</span>
            <span>天文数据：{result.astroDataSourceLabelZh}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign("/astro");
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function AstroCoreDecision({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section
      className="AstroCoreDecision astro-core-decision grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-4"
      data-astro-section="AstroCoreDecision"
    >
      {cards.map((card) => (
        <PrimaryResultCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function AstroDailyTrend({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly AstroDailyTrendItem[];
}) {
  return (
    <Card
      className="AstroDailyTrend astro-daily-trend p-4 shadow-sm"
      data-astro-section="AstroDailyTrend"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">每晚观星条件</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            按每晚星空指数、银河指数、月光影响和主要窗口判断是否值得出发。
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article
            key={item.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(155px,0.9fr)_minmax(165px,0.9fr)_minmax(210px,1.2fr)_minmax(0,1.5fr)] min-[900px]:items-start"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
                <Badge variant={item.recommendationLabel === "不建议专程" ? "warning" : "default"}>
                  {item.recommendationLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.lunarDateText ? `农历${item.lunarDateText}` : "夜间窗口"}
              </p>
            </div>
            <dl className="grid gap-1 text-sm">
              <AstroInlineDefinition label="星空指数" value={`${item.starsScore} 分`} />
              <AstroInlineDefinition label="银河指数" value={`${item.milkyWayScore} 分`} />
              <AstroInlineDefinition label="月光影响" value={item.moonImpactLabel} />
            </dl>
            <dl className="grid gap-1 text-sm">
              <AstroInlineDefinition label="天文黑夜" value={item.astronomicalNightLabel} />
              <AstroInlineDefinition label="无月黑夜" value={item.moonlessNightLabel} />
              <AstroInlineDefinition label="推荐银河窗口" value={item.recommendedMilkyWayLabel} />
            </dl>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">{item.riskNote}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.keyReason}</p>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroNightWindowSection({
  astronomicalNightWindows,
  moonlessNightWindows,
  astroDataSourceLabel,
}: {
  readonly astronomicalNightWindows: readonly AstroWindowViewItem[];
  readonly moonlessNightWindows: readonly AstroWindowViewItem[];
  readonly astroDataSourceLabel: string;
}) {
  return (
    <Card className="AstroNightWindowSection astro-night-window p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">天文黑夜与无月黑夜</h2>
        <Badge variant="muted">{astroDataSourceLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-4 min-[900px]:grid-cols-2">
        <AstroWindowList title="天文黑夜" windows={astronomicalNightWindows} />
        <AstroWindowList title="无月黑夜" windows={moonlessNightWindows} />
      </div>
    </Card>
  );
}

function AstroMilkyWaySection({
  candidateWindows,
  recommendedWindows,
}: {
  readonly candidateWindows: readonly AstroWindowViewItem[];
  readonly recommendedWindows: readonly AstroWindowViewItem[];
}) {
  return (
    <Card className="AstroMilkyWaySection astro-milky-way p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">推荐银河窗口</h2>
        <Badge variant="muted">银心方向 / 月光交集</Badge>
      </div>
      <div className="mt-4 grid gap-4 min-[900px]:grid-cols-2">
        <AstroWindowList title="推荐窗口" windows={recommendedWindows} />
        <AstroWindowList title="候选窗口" windows={candidateWindows} />
      </div>
    </Card>
  );
}

function AstroWindowList({
  title,
  windows,
}: {
  readonly title: string;
  readonly windows: readonly AstroWindowViewItem[];
}) {
  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      {windows.length > 0 ? (
        windows.map((window) => (
          <article key={window.key} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-card-foreground">{window.dateLabel}</p>
                <p className="mt-1 text-sm font-semibold text-accent">{window.timeRangeLabel}</p>
              </div>
              <Badge variant={badgeVariantForTone(window.tone)}>{window.score} 分</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {window.direction ? <Badge variant="muted">{window.direction}</Badge> : null}
              {window.altitude !== "暂缺数据" ? (
                <Badge variant="info">银心高度 {window.altitude}</Badge>
              ) : null}
              {window.riskTags.map((tag) => (
                <Badge key={tag} variant={tag.includes("偏") ? "warning" : "muted"}>
                  {tag}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{window.note}</p>
          </article>
        ))
      ) : (
        <p className="rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          暂无明确窗口，请扩大预报范围或等待后续数据。
        </p>
      )}
    </section>
  );
}

function AstroMoonPhaseSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="AstroMoonPhaseSection astro-moon-phase p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">月相与月光影响</h2>
        <Badge variant="muted">月相 / 照明 / 高度</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {result.astroSummaries.map((astro) => (
          <article key={astro.date} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-card-foreground">
                {dateLabelForResultClient(result, astro.date)}
              </h3>
              <Badge variant={astro.moonIllumination >= 0.55 ? "warning" : "muted"}>
                {formatPercent(astro.moonIllumination)}
              </Badge>
            </div>
            <dl className="mt-3 grid gap-2 text-sm">
              <AstroInlineDefinition label="月相" value={astro.moonPhaseNameZh} />
              <AstroInlineDefinition label="农历" value={astro.lunarDateText} />
              <AstroInlineDefinition label="月光影响" value={moonImpactText(astro)} />
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroMoonriseMoonsetSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="AstroMoonriseMoonsetSection astro-moonrise-moonset p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">月出月落</h2>
        <Badge variant="muted">{result.astroDataSourceLabelZh}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-3">
        {result.astroSummaries.map((astro) => (
          <article key={astro.date} className="rounded-lg border border-border bg-muted p-3">
            <h3 className="font-bold text-card-foreground">
              {dateLabelForResultClient(result, astro.date)}
            </h3>
            <dl className="mt-3 grid gap-2 text-sm">
              <AstroInlineDefinition label="月出" value={formatOptionalTime(astro.moonrise)} />
              <AstroInlineDefinition label="月落" value={formatOptionalTime(astro.moonset)} />
              <AstroInlineDefinition
                label="夜间月亮高度"
                value={formatMoonAltitudeSummary(astro.moonAltitudeByHour)}
              />
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroEvidenceSection({
  title,
  badgeLabel,
  items,
  dataSection,
}: {
  readonly title: string;
  readonly badgeLabel: string;
  readonly items: readonly AstroEvidenceViewItem[];
  readonly dataSection: string;
}) {
  return (
    <Card className={`${dataSection} p-4 shadow-sm`} data-astro-section={dataSection}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroAdviceSection({ items }: { readonly items: readonly string[] }) {
  return (
    <Card className="AstroAdviceSection astro-advice p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">拍摄建议</h2>
        <Badge variant="muted">到达 / 等待 / 转拍</Badge>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground min-[900px]:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-border bg-muted px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AstroRiskSection({ risks }: { readonly risks: readonly string[] }) {
  return (
    <Card className="AstroRiskSection astro-risk p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">风险提示</h2>
        <Badge variant="muted">月光 / 云量 / 通透 / 光污染</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {risks.map((risk) => (
          <article key={risk} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-sm leading-6 text-muted-foreground">{risk}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroBackupPlanSection({ plans }: { readonly plans: readonly GlowBackupPlan[] }) {
  return (
    <Card className="AstroBackupPlanSection astro-backup p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">备选拍摄方案</h2>
        <Badge variant="muted">银河受限时</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.condition} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">{plan.condition}</p>
            <h3 className="mt-2 font-bold text-card-foreground">{plan.action}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function AstroDataStatusSection({
  result,
  notes,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly notes: readonly string[];
  readonly dataNotice: string;
}) {
  return (
    <Card className="AstroDataStatusSection astro-data-status p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态 / 数据缺失说明</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[900px]:grid-cols-4">
        <CompactDefinition label="天文数据" value={result.astroDataSourceLabelZh} />
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <CompactDefinition label="光污染数据" value="暂未接入" />
      </dl>
      <p className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm leading-6 text-muted-foreground">
        {dataNotice}
      </p>
      {notes.length > 0 ? (
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function AstroMoonCalendarAction({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <details className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-card-foreground">
        查看整月月相
      </summary>
      <div className="mt-4">
        <MoonPhaseCalendar
          latitudeWgs84={query.latitudeWgs84}
          longitudeWgs84={query.longitudeWgs84}
          timezone={result.calendarBasis.timezone}
        />
      </div>
    </details>
  );
}

function AstroInlineDefinition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

function GlowTopContext({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">朝霞晚霞专项判断</Badge>
            <Badge variant={result.isMock ? "warning" : "success"}>
              {result.isMock ? "体验模式" : "已接入数据源"}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
            <Badge variant="info">
              置信度：{confidenceLabel(result.glowAnalysis.confidenceLevel)}
            </Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1120px]:flex min-[1120px]:flex-wrap min-[1120px]:gap-2">
            <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>更新时间：{formatDateTime(result.generatedAt)}</span>
            <span>数据状态：{weatherStatusLabel(result)}</span>
            <span>地形数据：{result.terrainAnalysis.dataSourceLabelZh}</span>
            <span>天文数据：{result.astroDataSourceLabelZh}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign("/glow");
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function GlowCoreDecision({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section
      className="glow-core-decision grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-4"
      data-glow-section="GlowCoreDecision"
    >
      {cards.map((card) => (
        <PrimaryResultCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function GlowDailyTrend({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly GlowDailyTrendItem[];
}) {
  return (
    <Card
      className="GlowDailyTrend glow-daily-trend p-4 shadow-sm"
      data-glow-section="GlowDailyTrend"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">逐日朝霞晚霞趋势</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {result.calendarBasis.horizonHours <= 24
              ? "仅展示未来24小时内可用的朝霞、晚霞和余晖窗口。"
              : "按每天的朝霞分、晚霞分、最佳窗口和主要风险横向比较。"}
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article
            key={item.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(150px,1fr)_minmax(180px,1fr)_minmax(0,1.35fr)_minmax(0,1.4fr)] min-[900px]:items-center"
          >
            <div className="min-w-0">
              <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.bestTargetLabel}</p>
            </div>
            <dl className="grid gap-1 text-sm">
              <GlowInlineDefinition label="朝霞机会" value={`${item.sunriseScore} 分`} />
              <GlowInlineDefinition label="晚霞机会" value={`${item.sunsetScore} 分`} />
            </dl>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">最佳窗口</p>
              <p className="mt-1 text-sm font-semibold leading-5 text-card-foreground">
                {item.bestWindowLabel}
              </p>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.recommendationLabel === "不建议专程" ? "warning" : "default"}>
                  {item.recommendationLabel}
                </Badge>
                <Badge variant="muted">{item.riskNote}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.keyReason}</p>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowTwilightSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="GlowTwilightSection glow-twilight-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">日出日落与晨昏窗口</h2>
        <Badge variant="muted">{result.astroDataSourceLabelZh}</Badge>
      </div>
      {result.astroSummaries.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {result.astroSummaries.map((astro) => (
            <article
              key={astro.date}
              className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(150px,0.9fr)_repeat(3,minmax(160px,1fr))] min-[900px]:items-start"
            >
              <div>
                <h3 className="font-bold text-card-foreground">
                  {dateLabelForResultClient(result, astro.date)}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{astro.timezone}</p>
              </div>
              <dl className="grid gap-2 text-sm">
                <GlowInlineDefinition label="日出" value={formatOptionalTime(astro.sunrise)} />
                <GlowInlineDefinition label="日落" value={formatOptionalTime(astro.sunset)} />
              </dl>
              <dl className="grid gap-2 text-sm">
                <GlowInlineDefinition
                  label="民用晨光"
                  value={formatOptionalTime(astro.civilDawn)}
                />
                <GlowInlineDefinition
                  label="民用昏影"
                  value={formatOptionalTime(astro.civilDusk)}
                />
              </dl>
              <dl className="grid gap-2 text-sm">
                <GlowInlineDefinition
                  label="航海晨光/昏影"
                  value={`${formatOptionalTime(astro.nauticalDawn)} / ${formatOptionalTime(
                    astro.nauticalDusk,
                  )}`}
                />
                <GlowInlineDefinition
                  label="天文晨光/昏影"
                  value={`${formatOptionalTime(astro.astronomicalDawn)} / ${formatOptionalTime(
                    astro.astronomicalDusk,
                  )}`}
                />
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          缺少日出日落时间，无法生成精确霞光窗口。
        </p>
      )}
    </Card>
  );
}

function GlowEvidenceSection({
  title,
  badgeLabel,
  items,
  dataSection,
}: {
  readonly title: string;
  readonly badgeLabel: string;
  readonly items: readonly GlowEvidenceViewItem[];
  readonly dataSection: string;
}) {
  return (
    <Card className={`${dataSection} p-4 shadow-sm`} data-glow-section={dataSection}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowLowCloudRiskSection({ result }: { readonly result: ForecastCalculationResult }) {
  const risk = result.glowAnalysis.lowCloudObstructionRisk;
  return (
    <Card className="GlowLowCloudRiskSection glow-low-cloud-risk p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">低云遮挡风险</h2>
        <Badge variant={risk >= 70 ? "danger" : risk >= 45 ? "warning" : "info"}>{risk} 分</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-3">
        <article className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-card-foreground">太阳方向</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            低云可能遮挡太阳方向，低云过厚可能导致无明显霞光或只剩白光。
          </p>
        </article>
        <article className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-card-foreground">色彩载体</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            中高云更适合作为霞光载体，低云更多用于判断遮挡和反差风险。
          </p>
        </article>
        <article className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-card-foreground">现场动作</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            若太阳方向被低云压住，优先寻找更高机位、侧逆光角度或转拍层峦与云缝光。
          </p>
        </article>
      </div>
    </Card>
  );
}

function GlowTerrainSection({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly GlowEvidenceViewItem[];
}) {
  const horizon = result.terrainAnalysis.horizonProfile;
  const terrainMissing =
    typeof horizon.sunriseHorizonAngle !== "number" ||
    typeof horizon.sunsetHorizonAngle !== "number";

  return (
    <Card className="GlowTerrainSection glow-terrain-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">地形遮挡参考</h2>
        <Badge variant="muted">{result.terrainAnalysis.dataSourceLabelZh}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-3">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className="mt-2 break-words text-xl font-bold text-card-foreground">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[900px]:grid-cols-3">
        <CompactDefinition
          label="日出遮挡角"
          value={formatAngle(result.terrainAnalysis.horizonProfile.sunriseHorizonAngle)}
        />
        <CompactDefinition
          label="日落遮挡角"
          value={formatAngle(result.terrainAnalysis.horizonProfile.sunsetHorizonAngle)}
        />
        <CompactDefinition
          label="遮挡方向"
          value={formatBlockedDirections(result.terrainAnalysis.horizonProfile.blockedDirectionsZh)}
        />
      </dl>
      {terrainMissing ? (
        <p className="mt-3 rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          暂缺地形遮挡细节，正式地形数据接入后将提升判断精度。
        </p>
      ) : null}
    </Card>
  );
}

function GlowAdviceSection({ items }: { readonly items: readonly string[] }) {
  return (
    <Card className="GlowAdviceSection glow-advice-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">拍摄建议</h2>
        <Badge variant="muted">到达 / 等待 / 转拍</Badge>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item} className="rounded-lg border border-border bg-muted px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function GlowRiskSection({
  result,
  risks,
}: {
  readonly result: ForecastCalculationResult;
  readonly risks: readonly string[];
}) {
  const runtimeRisks = result.riskFlags.filter((risk) =>
    ["precipitation", "visibility", "wind"].includes(risk.key),
  );

  return (
    <Card className="GlowRiskSection glow-risk-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">风险提示</h2>
        <Badge variant="muted">低云 / 降水 / 通透 / 风</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {risks.map((risk) => (
          <article key={risk} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-sm leading-6 text-muted-foreground">{risk}</p>
          </article>
        ))}
        {runtimeRisks.map((risk) => (
          <article key={risk.key} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-card-foreground">{risk.label}</h3>
              <Badge variant={risk.level === "high" ? "danger" : "warning"}>
                {riskLevelText(risk.level)}风险
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{risk.description}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowBackupPlanSection({ plans }: { readonly plans: readonly GlowBackupPlan[] }) {
  return (
    <Card className="GlowBackupPlanSection glow-backup-plan p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">备选拍摄方案</h2>
        <Badge variant="muted">霞光失败时</Badge>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {plans.map((plan) => (
          <article key={plan.condition} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">{plan.condition}</p>
            <h3 className="mt-2 font-bold text-card-foreground">{plan.action}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function GlowDataStatusSection({
  result,
  notes,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly notes: readonly string[];
  readonly dataNotice: string;
}) {
  return (
    <Card className="GlowDataStatusSection glow-data-status p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态 / 数据缺失说明</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm min-[900px]:grid-cols-3">
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <CompactDefinition label="天文数据" value={result.astroDataSourceLabelZh} />
      </dl>
      <p className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm leading-6 text-muted-foreground">
        {dataNotice}
      </p>
      {notes.length > 0 ? (
        <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
          {notes.map((note) => (
            <li key={note} className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
              {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function GlowInlineDefinition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

function CloudSeaTopContext({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="grid gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">云海专项判断</Badge>
            <Badge variant={result.isMock ? "warning" : "success"}>
              {result.isMock ? "体验模式" : "已接入数据源"}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <div className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1120px]:flex min-[1120px]:flex-wrap min-[1120px]:gap-2">
            <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>天气数据：{weatherStatusLabel(result)}</span>
            <span>地形数据：{result.terrainAnalysis.dataSourceLabelZh}</span>
            <span>坐标来源：{result.calendarBasis.coordinateSource}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign("/#analysis");
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function CloudSeaCoreDecision({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section
      className="cloud-sea-core-decision grid gap-3 min-[900px]:grid-cols-2 min-[1280px]:grid-cols-4"
      data-cloud-sea-section="CloudSeaCoreDecision"
    >
      {cards.map((card) => (
        <PrimaryResultCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function CloudSeaDailyTrend({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly CloudSeaDailyTrendItem[];
}) {
  const title = result.calendarBasis.horizonHours <= 24 ? "每日清晨窗口" : "逐日云海趋势";

  return (
    <Card className="CloudSeaDailyTrend cloud-sea-daily-trend p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            按云海机会、白墙风险和清晨窗口排列，便于横向比较每天是否值得等待。
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-2">
        {items.map((item) => (
          <article
            key={item.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-3 min-[900px]:grid-cols-[minmax(150px,1.1fr)_minmax(170px,1fr)_minmax(170px,1fr)_minmax(0,1.4fr)] min-[900px]:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
                <Badge variant={item.cloudSeaScore >= 70 ? "default" : "accent"}>
                  {item.cloudSeaScore} 分
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.bestMorningWindow}</p>
            </div>
            <dl className="grid gap-1 text-sm">
              <CloudSeaInlineDefinition label="云海机会" value={item.cloudSeaLevel} />
              <CloudSeaInlineDefinition
                label="白墙风险"
                value={`${item.whiteoutRiskLabel}（${item.whiteoutRiskScore} 分）`}
              />
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">推荐动作</span>
              <Badge variant="muted">{item.recommendedAction}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.keyReason}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaWhiteoutSection({ view }: { readonly view: CloudSeaVsWhiteoutView }) {
  return (
    <Card className="CloudSeaWhiteoutSection cloud-sea-whiteout-section p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">云海 vs 白墙判断</h2>
        <Badge variant="muted">低云 / 能见度 / 海拔</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-primary">云海</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{view.cloudSeaDefinition}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-danger">白墙</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{view.whiteoutDefinition}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 min-[900px]:grid-cols-2">
        {view.indicators.map((item) => (
          <CloudSeaIndicatorCard key={item.key} item={item} />
        ))}
      </div>
    </Card>
  );
}

function CloudSeaIndicatorCard({ item }: { readonly item: CloudSeaIndicatorItem }) {
  return (
    <article className="rounded-lg border border-border bg-muted p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-card-foreground">{item.label}</h3>
        <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
    </article>
  );
}

function CloudSeaTimeWindowSection({
  windows,
}: {
  readonly windows: readonly CloudSeaWindowItem[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">云海时间窗口</h2>
        <Badge variant="muted">等待 / 观测 / 消散</Badge>
      </div>
      <div className="mt-4 grid gap-3">
        {windows.map((window) => (
          <article
            key={window.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-card-foreground">{window.label}</h3>
                <Badge variant={badgeVariantForTone(window.tone)}>{window.riskTag}</Badge>
              </div>
              <p className="mt-1 text-sm font-semibold text-accent">{window.timeRangeLabel}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{window.note}</p>
            </div>
            <Badge variant={window.score >= 70 ? "default" : "accent"}>{window.score} 分</Badge>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaTerrainEvidence({
  terrainEvidence,
}: {
  readonly terrainEvidence: CloudSeaForecastViewModel["terrainEvidence"];
}) {
  return (
    <Card className="CloudSeaTerrainEvidence cloud-sea-terrain-evidence p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">地形依据</h2>
        <Badge variant="muted">{terrainEvidence.dataSource}</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {terrainEvidence.items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <p className="text-xs font-semibold text-muted-foreground">{item.label}</p>
            <p className="mt-2 break-words text-xl font-bold text-card-foreground">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaWeatherEvidence({
  items,
}: {
  readonly items: readonly CloudSeaWeatherEvidenceItem[];
}) {
  return (
    <Card className="CloudSeaWeatherEvidence cloud-sea-weather-evidence p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">气象依据</h2>
        <Badge variant="muted">水汽 / 低云 / 风 / 通透</Badge>
      </div>
      <div className="mt-4 grid gap-3 min-[900px]:grid-cols-2">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">{item.trend}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.effect}</p>
            {item.confidenceNote ? (
              <p className="mt-3 rounded-lg border border-warning bg-card px-3 py-2 text-xs leading-5 text-warning">
                {item.confidenceNote}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaActionGrid({
  result,
  travelRecommendations,
  riskSummary,
  backupPlans,
}: {
  readonly result: ForecastCalculationResult;
  readonly travelRecommendations: readonly CloudSeaTravelRecommendation[];
  readonly riskSummary: readonly ForecastResultSectionItem[];
  readonly backupPlans: readonly CloudSeaBackupPlan[];
}) {
  return (
    <section
      className="cloud-sea-action-grid grid gap-5 min-[900px]:grid-cols-2"
      data-cloud-sea-section="CloudSeaActionGrid"
    >
      <CloudSeaTravelRecommendationSection items={travelRecommendations} />
      <CloudSeaRiskSummarySection items={riskSummary} />
      <CloudSeaBackupPlanSection plans={backupPlans} />
      <CloudSeaDataStatusSection result={result} />
    </section>
  );
}

function CloudSeaTravelRecommendationSection({
  items,
}: {
  readonly items: readonly CloudSeaTravelRecommendation[];
}) {
  return (
    <Card className="p-4 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">出行建议</h2>
      <div className="mt-3 grid gap-3">
        {items.map((item) => (
          <article key={item.situation} className="rounded-lg border border-border bg-muted p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-card-foreground">{item.situation}</h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.action}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaRiskSummarySection({
  items,
}: {
  readonly items: readonly ForecastResultSectionItem[];
}) {
  return (
    <Card className="p-4 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">风险提示</h2>
      <div className="mt-3 grid gap-3">
        {items.map((item, index) => (
          <article
            key={`${item.label}-${index}`}
            className="rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-card-foreground">{item.label}</h3>
              {item.value ? <Badge variant="accent">{item.value}</Badge> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaBackupPlanSection({ plans }: { readonly plans: readonly CloudSeaBackupPlan[] }) {
  return (
    <Card className="p-4 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">备选拍摄方案</h2>
      <div className="mt-3 grid gap-3">
        {plans.map((plan) => (
          <article key={plan.condition} className="rounded-lg border border-border bg-muted p-3">
            <p className="text-xs font-semibold text-muted-foreground">{plan.condition}</p>
            <h3 className="mt-2 font-bold text-card-foreground">{plan.action}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaDataStatusSection({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <CompactDefinition label="天文数据" value={result.astroDataSourceLabelZh} />
        <CompactDefinition
          label="WGS84 坐标"
          value={formatWgs84Coordinates(result.calendarBasis)}
        />
      </dl>
      <p className="mt-3 rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-muted-foreground">
        天气数据：{weatherStatusLabel(result)}；地形数据：
        {result.terrainAnalysis.dataSourceLabelZh}；正式数据源启用后将显示对应来源与更新时间。
      </p>
    </Card>
  );
}

function CloudSeaMissingDataSection({ notes }: { readonly notes: readonly string[] }) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据缺失说明</h2>
        <Badge variant="warning">需复核</Badge>
      </div>
      <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
        {notes.map((note) => (
          <li key={note} className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
            {note}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CloudSeaInlineDefinition({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

type SubjectScoreKey =
  | "cloudSea"
  | "sunriseGlow"
  | "sunsetGlow"
  | "stars"
  | "milkyWay"
  | "transparency";

type SubjectBreakdownCard = {
  readonly key: SubjectScoreKey;
  readonly label: string;
  readonly score: ForecastScore;
  readonly windowLabel: string;
  readonly reason: string;
};

const subjectScoreOrder: readonly SubjectScoreKey[] = [
  "cloudSea",
  "sunriseGlow",
  "sunsetGlow",
  "stars",
  "milkyWay",
  "transparency",
];

const subjectLabels: Record<SubjectScoreKey, string> = {
  cloudSea: "云海",
  sunriseGlow: "朝霞",
  sunsetGlow: "晚霞",
  stars: "星空",
  milkyWay: "银河",
  transparency: "通透 / 景别清晰度",
};

function ComprehensiveForecastView({
  query,
  result,
  viewModel,
  aiStatus,
  aiExplanation,
  aiErrorMessage,
  onGenerateAiExplanation,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: ForecastResultViewModel;
  readonly aiStatus: AiStatus;
  readonly aiExplanation: ForecastAiExplanation | null;
  readonly aiErrorMessage: string;
  readonly onGenerateAiExplanation: () => void;
}) {
  const subjectCards = buildSubjectBreakdownCards(result);
  const bestSubject = pickBestSubject(subjectCards);
  const mainRisk = pickMainRisk(result);
  const sortedWindows = [...viewModel.bestWindows].sort(
    (left, right) =>
      right.score - left.score || Date.parse(left.startTime) - Date.parse(right.startTime),
  );

  return (
    <section className="grid gap-5">
      <ComprehensiveContextBar query={query} result={result} />
      <ComprehensiveCoreDecisionCards
        result={result}
        bestWindow={viewModel.bestWindows[0]}
        bestSubject={bestSubject}
        mainRisk={mainRisk}
      />

      <div className="grid gap-5 min-[1024px]:grid-cols-12 min-[1024px]:items-start">
        <main className="grid gap-5 min-[1024px]:col-span-8">
          <SubjectBreakdownSection cards={subjectCards} />
          <OpportunityWindowSection result={result} windows={sortedWindows} />
          {result.calendarBasis.horizonHours > 24 ? (
            <ComprehensiveMultiDaySummary result={result} />
          ) : null}
          <KeyEvidenceSection result={result} />
        </main>

        <aside className="grid content-start gap-5 min-[1024px]:col-span-4">
          <ActionableAdviceSection result={result} bestSubject={bestSubject} mainRisk={mainRisk} />
          <CompactCalculationDataCard result={result} />
          <AiExplanationPanel
            status={aiStatus}
            explanation={aiExplanation}
            errorMessage={aiErrorMessage}
            onGenerate={onGenerateAiExplanation}
          />
        </aside>
      </div>
    </section>
  );
}

function ComprehensiveContextBar({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="grid gap-4 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">综合拍摄判断</Badge>
            <Badge variant={result.isMock ? "warning" : "success"}>
              {result.isMock ? "体验模式" : "已接入数据源"}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs leading-5 text-muted-foreground">
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>天气：{weatherStatusLabel(result)}</span>
            <span>天文：本地算法</span>
            <span>地形：{result.terrainAnalysis.dataSourceLabelZh}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign("/#analysis");
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function ComprehensiveCoreDecisionCards({
  result,
  bestWindow,
  bestSubject,
  mainRisk,
}: {
  readonly result: ForecastCalculationResult;
  readonly bestWindow: ForecastResultWindow | undefined;
  readonly bestSubject: SubjectBreakdownCard;
  readonly mainRisk: ForecastResultSectionItem;
}) {
  const cards: readonly ForecastResultCard[] = [
    scoreCard(
      "comprehensive-score",
      "overall",
      "综合出片指数",
      `${result.overallScore}`,
      "/ 100",
      "primary",
      result.overallScore,
    ),
    textCard(
      "comprehensive-recommendation",
      "recommendation",
      "推荐等级",
      result.recommendationLabel,
      result.summary,
      "primary",
    ),
    textCard(
      "comprehensive-window",
      "bestWindow",
      "最佳拍摄窗口",
      coreWindowValue(bestWindow),
      coreWindowDetail(result, bestWindow),
      "accent",
    ),
    scoreCard(
      "comprehensive-subject",
      bestSubject.key === "milkyWay" ? "milkyWay" : bestSubject.key,
      "最佳题材",
      subjectLabels[bestSubject.key],
      `${bestSubject.score.score} 分，${bestSubject.reason}`,
      "info",
      bestSubject.score.score,
    ),
    textCard(
      "comprehensive-risk",
      "risk",
      "主要风险",
      mainRisk.label,
      mainRisk.detail,
      mainRisk.value?.includes("高") ? "danger" : "muted",
    ),
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <PrimaryResultCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function SubjectBreakdownSection({ cards }: { readonly cards: readonly SubjectBreakdownCard[] }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">题材拆解</h2>
        <Badge variant="muted">6 个拍摄方向</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 min-[1320px]:grid-cols-3">
        {cards.map((card) => (
          <article key={card.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-card-foreground">{card.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{card.windowLabel}</p>
              </div>
              <Badge variant={card.score.score >= 70 ? "default" : "accent"}>
                {card.score.score} 分
              </Badge>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-card-foreground">
                {scoreLevelLabels[card.score.level]}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-card">
                <div
                  className={cn(
                    "h-full rounded-full",
                    card.key === "transparency" ? "bg-info" : "bg-primary",
                  )}
                  style={{ width: `${card.score.score}%` }}
                />
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.reason}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function OpportunityWindowSection({
  result,
  windows,
}: {
  readonly result: ForecastCalculationResult;
  readonly windows: readonly ForecastResultWindow[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">机会窗口</h2>
        <Badge variant="muted">按评分排序</Badge>
      </div>
      <ul className="mt-4 grid gap-3">
        {windows.map((window) => (
          <li
            key={window.key}
            className="grid gap-3 rounded-lg border border-border bg-muted p-4 min-[720px]:grid-cols-[minmax(0,1fr)_auto] min-[720px]:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{window.badgeLabel}</Badge>
                <h3 className="font-semibold text-card-foreground">{window.label}</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{window.timeRangeLabel}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 min-[720px]:justify-end">
              <Badge variant={window.score >= 75 ? "default" : "accent"}>{window.score} 分</Badge>
              <Badge variant="muted">{windowRiskTag(result, window)}</Badge>
              <Badge variant={window.score >= 75 ? "success" : "info"}>
                {windowActionLabel(window.score)}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ComprehensiveMultiDaySummary({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">多日摘要</h2>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 min-[1320px]:grid-cols-3">
        {result.dailySummaries.map((summary) => {
          const dayBreakdown = result.targetDailyBreakdown.find(
            (breakdown) => breakdown.date === summary.date,
          );
          const bestSubject = dayBreakdown ? pickBestDailySubject(dayBreakdown) : undefined;
          const bestWindow =
            result.bestWindows.find((window) => window.date === summary.date) ??
            summary.keyWindows[0];
          const risk = summary.riskFlags[0] ?? result.riskFlags[0];

          return (
            <article key={summary.date} className="rounded-lg border border-border bg-muted p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-card-foreground">{summary.dateLabelZh}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary.lunarDateText ? `农历${summary.lunarDateText}` : summary.shortAdvice}
                  </p>
                </div>
                <Badge variant={summary.score >= 70 ? "default" : "accent"}>
                  {summary.score} 分
                </Badge>
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                <CompactDefinition label="最佳题材" value={bestSubject ?? "综合判断"} />
                <CompactDefinition
                  label="最佳窗口"
                  value={
                    bestWindow
                      ? `${bestWindow.label}（${formatWindow(bestWindow.startTime, bestWindow.endTime)}）`
                      : "暂无明确高分窗口"
                  }
                />
                <CompactDefinition
                  label="主要风险"
                  value={
                    risk ? `${risk.label}：${riskLevelText(risk.level)}风险` : "暂无高等级风险"
                  }
                />
              </dl>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function KeyEvidenceSection({ result }: { readonly result: ForecastCalculationResult }) {
  const astro = firstAstroSummary(result);
  const whiteoutReason =
    firstText(result.scores.whiteoutRisk.risks, "") ||
    firstText(result.scores.whiteoutRisk.reasons, "白墙风险已纳入云海和通透度判断。");
  const evidenceItems: readonly ForecastResultSectionItem[] = [
    {
      label: "云层结构",
      value: hasMissingCloudLayers(result) ? "分层缺失" : "已纳入评分",
      detail: firstText(
        [
          ...result.scores.cloudSea.reasons,
          ...result.scores.sunriseGlow.reasons,
          ...result.scores.sunsetGlow.reasons,
        ],
        "云量和云层结构会影响云海、霞光和星空可见性。",
      ),
    },
    {
      label: "能见度 / 通透度",
      value: `${result.scores.transparency.score} 分`,
      detail: firstText(
        result.scores.transparency.reasons,
        "能见度会影响远山层次和夜间星点清晰度。",
      ),
    },
    {
      label: "风",
      value: windRiskLabel(result),
      detail:
        result.riskFlags.find((risk) => risk.key === "wind")?.description ??
        "风速、阵风和风向会影响云海稳定、三脚架稳定性和山顶体感风险。",
    },
    {
      label: "湿度 / 露点 / 白墙",
      value: `${result.scores.whiteoutRisk.score} 分`,
      detail: whiteoutReason,
    },
    {
      label: "日出 / 日落 / 晨昏光",
      value: `${formatOptionalTime(astro?.sunrise)} / ${formatOptionalTime(astro?.sunset)}`,
      detail: `民用晨光 ${formatOptionalTime(astro?.civilDawn)}，民用昏影 ${formatOptionalTime(
        astro?.civilDusk,
      )}。`,
    },
    {
      label: "月相 / 月光 / 月出月落",
      value: `${astro?.moonPhaseNameZh ?? "暂无月相"} / ${formatPercent(astro?.moonIllumination)}`,
      detail: `月出 ${formatOptionalTime(astro?.moonrise)}，月落 ${formatOptionalTime(
        astro?.moonset,
      )}；${moonImpactText(astro)}。`,
    },
  ];

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">关键依据</h2>
        <Badge variant="muted">天气 / 天文 / 地形</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {evidenceItems.map((item) => (
          <article key={item.label} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground">{item.label}</h3>
              {item.value ? <Badge variant="accent">{item.value}</Badge> : null}
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ActionableAdviceSection({
  result,
  bestSubject,
  mainRisk,
}: {
  readonly result: ForecastCalculationResult;
  readonly bestSubject: SubjectBreakdownCard;
  readonly mainRisk: ForecastResultSectionItem;
}) {
  const backupSubjects = buildSubjectBreakdownCards(result)
    .filter((subject) => subject.key !== bestSubject.key)
    .sort((left, right) => right.score.score - left.score.score)
    .slice(0, 2);
  const backupPlan =
    backupSubjects.length > 0
      ? `若${subjectLabels[bestSubject.key]}不成立，优先转向${backupSubjects
          .map((subject) => `${subjectLabels[subject.key]}（${subject.score.score} 分）`)
          .join("或")}。`
      : "如果主目标不成立，保留现场光线、云层纹理和地景构图作为备选。";

  return (
    <Card className="p-5 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">行动建议</h2>
      <div className="mt-4 grid gap-3">
        <AdviceBlock title="拍摄建议" items={result.photographyAdvice.slice(0, 3)} />
        <AdviceBlock title="风险提醒" items={[`${mainRisk.label}：${mainRisk.detail}`]} />
        <AdviceBlock title="备选方案" items={[backupPlan]} />
      </div>
    </Card>
  );
}

function AdviceBlock({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <section className="rounded-lg border border-border bg-muted p-3">
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      <ul className="mt-2 grid gap-2">
        {(items.length > 0
          ? items
          : ["当前结果未给出额外建议，出行前复核最新天气和现场安全信息。"]
        ).map((item) => (
          <li key={item} className="text-sm leading-6 text-muted-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CompactCalculationDataCard({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">计算与数据</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <CompactDefinition label="预报起点" value={result.calendarBasis.forecastStartLabel} />
        <CompactDefinition label="预报终点" value={result.calendarBasis.forecastEndLabel} />
        <CompactDefinition label="时区" value={result.calendarBasis.timezoneLabel} />
        <CompactDefinition
          label="WGS84 经纬度"
          value={formatWgs84Coordinates(result.calendarBasis)}
        />
        <CompactDefinition label="坐标来源" value={result.calendarBasis.coordinateSource} />
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
      </dl>
      {result.weatherDataMode !== "real" || result.terrainAnalysis.isMock ? (
        <p className="mt-4 rounded-lg border border-warning bg-muted p-3 text-xs leading-5 text-muted-foreground">
          当前天气或地形仍包含演示数据，结论用于体验分析流程，正式出行前需要复核真实预报和现场条件。
        </p>
      ) : null}
    </Card>
  );
}

function CompactDefinition({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

function PrimaryResultCard({ card }: { readonly card: ForecastResultCard }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-4">
      <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
      <p className={cn("mt-2 break-words text-3xl font-bold leading-9", cardToneText(card.tone))}>
        {card.value}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{card.detail}</p>
      {typeof card.score === "number" ? (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-card">
          <div
            className={cn("h-full rounded-full", cardToneBar(card.tone))}
            style={{ width: `${card.score}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function cardToneText(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "text-primary",
    accent: "text-accent",
    danger: "text-danger",
    info: "text-info",
    muted: "text-card-foreground",
  };

  return toneClasses[tone];
}

function cardToneBar(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "bg-primary",
    accent: "bg-accent",
    danger: "bg-danger",
    info: "bg-info",
    muted: "bg-muted-foreground",
  };

  return toneClasses[tone];
}

type BadgeVariant = NonNullable<Parameters<typeof Badge>[0]["variant"]>;

function badgeVariantForTone(tone: ForecastResultCardTone): BadgeVariant {
  const variants: Record<ForecastResultCardTone, BadgeVariant> = {
    primary: "default",
    accent: "accent",
    danger: "danger",
    info: "info",
    muted: "muted",
  };

  return variants[tone];
}

function ScoreCardsPanel({
  title,
  scores,
}: {
  readonly title: string;
  readonly scores: readonly ForecastScore[];
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <Badge variant="muted">按当前目标筛选</Badge>
      </div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {scores.map((score) => (
          <ScoreCard key={score.key} score={score} />
        ))}
      </div>
    </section>
  );
}

function SectionGrid({ sections }: { readonly sections: readonly ForecastResultSection[] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {sections.map((section) => (
        <SectionPanel key={section.key} section={section} />
      ))}
    </section>
  );
}

function SectionStack({ sections }: { readonly sections: readonly ForecastResultSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <SectionPanel key={section.key} section={section} compact />
      ))}
    </>
  );
}

function SectionPanel({
  section,
  compact = false,
}: {
  readonly section: ForecastResultSection;
  readonly compact?: boolean;
}) {
  return (
    <Card className={cn("p-5 shadow-sm", compact && "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{section.title}</h2>
        {section.badgeLabel ? <Badge variant="muted">{section.badgeLabel}</Badge> : null}
      </div>
      {section.description ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.description}</p>
      ) : null}
      <ul className="mt-4 grid gap-3">
        {section.items.map((item, index) => (
          <li
            key={`${section.key}-${index}`}
            className="rounded-lg border border-border bg-muted p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-card-foreground">{item.label}</span>
              {item.value ? <Badge variant="accent">{item.value}</Badge> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DailyOverviewPanel({
  title,
  description,
  items,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly ForecastResultDailyItem[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">逐日判断</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-card-foreground">{item.dateLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.recommendationLabel}</p>
              </div>
              <Badge variant={item.score >= 70 ? "default" : "accent"}>{item.score} 分</Badge>
            </div>
            <dl className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground">
              <div>
                <dt className="font-semibold text-card-foreground">最佳窗口</dt>
                <dd className="mt-1">{item.bestWindowLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold text-card-foreground">主要风险</dt>
                <dd className="mt-1">{item.riskLabel}</dd>
              </div>
              <div>
                <dt className="font-semibold text-card-foreground">建议</dt>
                <dd className="mt-1">{item.shortAdvice}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function WindowPanel({
  title,
  description,
  windows,
  groups,
}: {
  readonly title: string;
  readonly description: string;
  readonly windows: readonly ForecastResultWindow[];
  readonly groups: readonly ForecastResultWindowGroup[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">目标优先</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {groups.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {groups.map((group) => (
            <section key={group.key} className="rounded-lg border border-border bg-muted p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-card-foreground">{group.dateLabel}</h3>
                <Badge variant="muted">每日窗口</Badge>
              </div>
              <WindowList windows={group.windows} />
            </section>
          ))}
        </div>
      ) : windows.length > 0 ? (
        <WindowList windows={windows} />
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">暂无明确高分窗口。</p>
      )}
    </Card>
  );
}

function WindowList({ windows }: { readonly windows: readonly ForecastResultWindow[] }) {
  return (
    <ul className="mt-4 grid gap-3">
      {windows.map((window) => (
        <li
          key={`${window.target}-${window.startTime}`}
          className="grid gap-2 rounded-lg border border-border bg-card px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div>
            <p className="font-semibold text-card-foreground">{window.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{window.timeRangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant="muted">{window.badgeLabel}</Badge>
            <Badge variant={window.score >= 75 ? "default" : "accent"}>{window.score} 分</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MockWarningCard({
  result,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly dataNotice: string;
}) {
  const nonReal = result.weatherDataMode !== "real" || result.terrainAnalysis.isMock;

  return (
    <Card className={cn("p-4 shadow-sm", nonReal ? "border-warning" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
        <p className="text-sm font-semibold text-card-foreground">数据提醒</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{dataNotice}</p>
    </Card>
  );
}

function AiExplanationPanel({
  status,
  explanation,
  errorMessage,
  onGenerate,
}: {
  readonly status: AiStatus;
  readonly explanation: ForecastAiExplanation | null;
  readonly errorMessage: string;
  readonly onGenerate: () => void;
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">智能解读</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            仅解释当前确定性结果，不重新计算天气、天文或地形。
          </p>
        </div>
        <Badge variant="muted">手动触发</Badge>
      </div>

      <Button
        className="mt-4 w-full"
        variant="secondary"
        disabled={status === "loading"}
        onClick={onGenerate}
      >
        {status === "loading" ? "正在生成解读…" : "生成智能解读"}
      </Button>

      {status === "error" ? (
        <p className="mt-3 rounded-lg border border-danger bg-card px-3 py-2 text-sm leading-6 text-danger">
          {errorMessage || "智能解读暂时不可用。"}
        </p>
      ) : null}

      {explanation ? (
        <div className="mt-4 grid gap-4">
          <AiTextSection title="综合解读">
            <p className="text-sm leading-6 text-muted-foreground">{explanation.summary}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-card-foreground">
              {explanation.recommendation}
            </p>
          </AiTextSection>
          <AiListSection title="关键依据" items={explanation.mainReasons} />
          <AiListSection title="主要风险" items={explanation.mainRisks} />
          <AiListSection title="拍摄建议" items={explanation.photographerAdvice} />
          <AiListSection title="备用方案" items={explanation.backupPlan} />
          <AiTextSection title="置信说明">
            <p className="text-sm leading-6 text-muted-foreground">{explanation.confidenceNote}</p>
          </AiTextSection>
        </div>
      ) : null}
    </Card>
  );
}

function AiTextSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-muted p-3">
      <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function AiListSection({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <AiTextSection title={title}>
      {items.length > 0 ? (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item} className="text-sm leading-6 text-muted-foreground">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">暂无。</p>
      )}
    </AiTextSection>
  );
}

function DataStatusPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const nonReal = result.weatherDataMode !== "real" || result.terrainAnalysis.isMock;
  const fusion = result.weatherFusionSummary;
  const weatherSource = result.weatherDataMode === "real"
    ? fusion?.primarySource ?? weatherStatusLabel(result)
    : "演示数据";
  const cloudAuxiliary =
    fusion?.auxiliarySources.find((source) => source.includes("Open-Meteo")) ??
    (result.weatherProviderCode === "open_meteo" ? result.weatherProviderLabelZh : "Open-Meteo 未启用");
  const professionalSource = fusion?.professionalSourceStatus ?? "专业增强：meteoblue 未启用";
  const confidence = fusion ? confidenceLevelLabel(fusion.confidenceLevel) : nonReal ? "低" : "中";
  const conflictStatus = fusion?.conflictStatusZh ?? "无明显冲突";

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="天气数据" value={weatherSource} />
        <SummaryItem label="云层辅助" value={cloudAuxiliary} />
        <SummaryItem label="专业增强" value={professionalSource} />
        <SummaryItem label="数据置信度" value={confidence} />
        <SummaryItem label="数据冲突" value={conflictStatus} />
        <SummaryItem label="天文数据" value={result.astroDataSourceLabelZh} />
        <SummaryItem label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <SummaryItem label="计算基准" value={result.calendarBasis.forecastStartLabel} />
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {result.terrainAnalysis.honestyNoteZh}
      </p>
    </Card>
  );
}

function confidenceLevelLabel(level: "high" | "medium" | "low"): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function CalculationBasisPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const basis = result.calendarBasis;

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">计算依据</h2>
        <Badge variant="muted">日历核心</Badge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="预报起点" value={basis.forecastStartLabel} />
        <SummaryItem label="预报终点" value={basis.forecastEndLabel} />
        <SummaryItem label="覆盖日期" value={basis.targetDateLabels.join("、")} />
        <SummaryItem label="时区" value={basis.timezoneLabel} />
        <SummaryItem label="WGS84 经纬度" value={formatWgs84Coordinates(basis)} />
        <SummaryItem label="坐标来源" value={basis.coordinateSource} />
        <SummaryItem
          label="机位海拔"
          value={formatMeters(result.terrainAnalysis.terrainProfile.locationElevation)}
        />
        <SummaryItem
          label="周边5公里高差"
          value={formatMeters(result.terrainAnalysis.terrainProfile.elevationDiff5km)}
        />
        <SummaryItem
          label="云海地形潜力"
          value={terrainPotentialLabel(
            result.terrainAnalysis.terrainProfile.terrainCloudSeaPotential,
          )}
        />
        <SummaryItem label="天文数据" value={result.astroDataSourceLabelZh} />
        {result.astroCalculationBasis?.ephemerisFileName ? (
          <SummaryItem label="星历文件" value={result.astroCalculationBasis.ephemerisFileName} />
        ) : null}
        {result.astroCalculationBasis?.coordinateSystem ? (
          <SummaryItem label="天文坐标基准" value={result.astroCalculationBasis.coordinateSystem} />
        ) : null}
        <SummaryItem label="天气数据" value={weatherStatusLabel(result)} />
        <SummaryItem label="地形数据来源" value={result.terrainAnalysis.dataSourceLabelZh} />
      </dl>

      <div className="mt-3 rounded-lg border border-border bg-muted p-3">
        <p className="text-xs font-semibold text-muted-foreground">农历 / 节气</p>
        {basis.calendarDays.length > 0 ? (
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground">
            {basis.calendarDays.map((day) => (
              <li key={day.date}>
                {day.dateLabel}：农历{day.lunarDateText}
                {day.solarTerm ? ` / ${day.solarTerm}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">暂无农历或节气信息。</p>
        )}
      </div>
    </Card>
  );
}

function ScoreCard({ score }: { readonly score: ForecastScore }) {
  const isRisk = score.key === "whiteoutRisk";
  const barTone = isRisk ? "bg-warning" : "bg-primary";

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-card-foreground">{score.label}</p>
          <p className="mt-2 text-3xl font-bold leading-9 text-card-foreground">{score.score}</p>
        </div>
        <Badge variant={score.level === "poor" || isRisk ? "warning" : "muted"}>
          {isRisk ? "风险值" : scoreLevelLabels[score.level]}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{score.reasons[0]}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", barTone)} style={{ width: `${score.score}%` }} />
      </div>
    </Card>
  );
}

function buildSubjectBreakdownCards(
  result: ForecastCalculationResult,
): readonly SubjectBreakdownCard[] {
  return subjectScoreOrder.map((key) => {
    const score = result.scores[key];

    return {
      key,
      label: subjectLabels[key],
      score,
      windowLabel: subjectWindowLabel(result, key),
      reason: firstText(score.reasons, "当前题材已纳入综合评分。"),
    };
  });
}

function pickBestSubject(cards: readonly SubjectBreakdownCard[]): SubjectBreakdownCard {
  const best = [...cards].sort((left, right) => right.score.score - left.score.score)[0];
  if (best) {
    return best;
  }

  return {
    key: "transparency",
    label: subjectLabels.transparency,
    score: {
      key: "transparency",
      label: subjectLabels.transparency,
      score: 0,
      level: "poor",
      reasons: ["当前缺少可用于题材排序的评分。"],
      risks: [],
    },
    windowLabel: "暂无明确高分窗口",
    reason: "当前缺少可用于题材排序的评分。",
  };
}

function pickMainRisk(result: ForecastCalculationResult): ForecastResultSectionItem {
  const risk = result.riskFlags[0];
  if (risk) {
    return {
      label: risk.label,
      value: `${riskLevelText(risk.level)}风险`,
      detail: risk.description,
    };
  }

  if (result.scores.whiteoutRisk.score >= 65) {
    return {
      label: "白墙风险",
      value: "中风险",
      detail: firstText(
        [...result.scores.whiteoutRisk.risks, ...result.scores.whiteoutRisk.reasons],
        "低云、湿度和能见度组合需要出行前复核。",
      ),
    };
  }

  return {
    label: "暂无高等级风险",
    value: "低风险",
    detail: "仍需在出行前复核最新天气、道路和景区开放信息。",
  };
}

function scoreCard(
  key: string,
  moduleKey: ForecastResultCard["moduleKey"],
  label: string,
  value: string,
  detail: string,
  tone: ForecastResultCardTone,
  score?: number,
): ForecastResultCard {
  return {
    key,
    moduleKey,
    label,
    value,
    detail,
    score,
    tone,
  };
}

function textCard(
  key: string,
  moduleKey: ForecastResultCard["moduleKey"],
  label: string,
  value: string,
  detail: string,
  tone: ForecastResultCardTone,
): ForecastResultCard {
  return {
    key,
    moduleKey,
    label,
    value,
    detail,
    tone,
  };
}

function coreWindowValue(window: ForecastResultWindow | undefined): string {
  if (!window) {
    return "暂无明确高分窗口";
  }

  return `${formatDateTime(window.startTime)} - ${formatTime(window.endTime)}`;
}

function coreWindowDetail(
  result: ForecastCalculationResult,
  window: ForecastResultWindow | undefined,
): string {
  if (!window) {
    return "优先复核后续天气更新。";
  }

  return `${window.badgeLabel}，${windowActionLabel(window.score)}，${windowRiskTag(result, window)}。`;
}

function subjectWindowLabel(result: ForecastCalculationResult, key: SubjectScoreKey): string {
  const window = bestWindowForSubject(result, key);
  if (window) {
    return formatWindow(window.startTime, window.endTime);
  }

  if (key === "transparency") {
    return "随最佳窗口复核";
  }

  return "暂无明确高分窗口";
}

function bestWindowForSubject(
  result: ForecastCalculationResult,
  key: SubjectScoreKey,
): ForecastCalculationResult["bestWindows"][number] | undefined {
  const windows = [...result.bestWindows].sort(
    (left, right) =>
      right.score - left.score || Date.parse(left.startTime) - Date.parse(right.startTime),
  );

  if (key === "cloudSea") {
    return windows.find((window) => window.target === "cloud_sea");
  }
  if (key === "sunriseGlow") {
    return windows.find((window) => window.target === "glow" && window.label.includes("朝霞"));
  }
  if (key === "sunsetGlow") {
    return windows.find((window) => window.target === "glow" && window.label.includes("晚霞"));
  }
  if (key === "stars") {
    return windows.find((window) => window.target === "astro" && window.label.includes("天文黑夜"));
  }
  if (key === "milkyWay") {
    return windows.find((window) => window.target === "astro" && window.label.includes("银河"));
  }

  return windows[0];
}

function windowRiskTag(result: ForecastCalculationResult, window: ForecastResultWindow): string {
  if (window.target === "cloud_sea" && result.scores.whiteoutRisk.score >= 65) {
    return "白墙需复核";
  }
  if (window.target === "glow" && result.scores.transparency.score < 60) {
    return "通透度偏弱";
  }
  if (
    window.target === "astro" &&
    Math.max(result.scores.stars.score, result.scores.milkyWay.score) < 60
  ) {
    return "云量月光复核";
  }
  if (window.score < 65) {
    return "谨慎窗口";
  }

  return result.riskFlags[0]?.label ?? "风险可控";
}

function windowActionLabel(score: number): string {
  if (score >= 75) {
    return "优先安排";
  }
  if (score >= 65) {
    return "可等待";
  }
  return "作为备选";
}

function pickBestDailySubject(
  breakdown: ForecastCalculationResult["targetDailyBreakdown"][number],
): string {
  const metrics = [
    { label: "云海", metric: breakdown.cloudSea },
    { label: "朝霞", metric: breakdown.sunriseGlow },
    { label: "晚霞", metric: breakdown.sunsetGlow },
    { label: "星空", metric: breakdown.stars },
    { label: "银河", metric: breakdown.milkyWay },
    { label: "通透", metric: breakdown.transparency },
  ];
  const best = metrics
    .filter((item) => item.metric !== undefined)
    .sort((left, right) => (right.metric?.score ?? 0) - (left.metric?.score ?? 0))[0];

  return best ? `${best.label}（${best.metric?.score ?? 0} 分）` : "综合判断";
}

function firstAstroSummary(
  result: ForecastCalculationResult,
): ForecastCalculationResult["astroSummaries"][number] | undefined {
  return result.astroSummaries[0];
}

function windRiskLabel(result: ForecastCalculationResult): string {
  const windRisk = result.riskFlags.find((risk) => risk.key === "wind");
  return windRisk ? `${riskLevelText(windRisk.level)}风险` : "已纳入评分";
}

function hasMissingCloudLayers(result: ForecastCalculationResult): boolean {
  return ["cloudLow", "cloudMid", "cloudHigh"].some((field) =>
    result.weatherMissingFields.includes(field),
  );
}

function firstText(items: readonly string[], fallback: string): string {
  return items[0] ?? fallback;
}

function riskLevelText(level: ForecastCalculationResult["riskFlags"][number]["level"]): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function formatDateTime(value: string): string {
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

function formatOptionalTime(value: string | undefined): string {
  return value ? formatTime(value) : "暂无数据";
}

function dateLabelForResultClient(result: ForecastCalculationResult, date: string): string {
  const index = result.calendarBasis.targetDates.indexOf(date);
  return result.calendarBasis.targetDateLabels[index] ?? date;
}

function confidenceLabel(
  level: ForecastCalculationResult["glowAnalysis"]["confidenceLevel"],
): string {
  if (level === "high") {
    return "高";
  }
  if (level === "medium") {
    return "中";
  }
  return "低";
}

function formatWindow(startTime: string, endTime: string): string {
  return `${formatTime(startTime)} - ${formatTime(endTime)}`;
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

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "暂无数据";
  }

  return `${Math.round(value * 100)}%`;
}

function formatAngle(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}°` : "暂缺数据";
}

function formatBlockedDirections(directions: readonly string[]): string {
  return directions.length > 0 ? directions.join("、") : "暂无明显方向";
}

function formatMoonAltitudeSummary(values: Readonly<Record<string, number>> | undefined): string {
  if (!values) {
    return "暂无数据";
  }

  const nightValues = ["20", "21", "22", "23", "00", "01", "02", "03", "04"].flatMap((hour) => {
    const value = values[hour];
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });

  if (nightValues.length === 0) {
    return "暂无数据";
  }

  const maxAltitude = Math.max(...nightValues);
  const visibleHours = nightValues.filter((value) => value > 0).length;

  return `最高约 ${maxAltitude.toFixed(1)}°，地平线上 ${visibleHours} 个采样小时`;
}

function moonImpactText(
  astro: ForecastCalculationResult["astroSummaries"][number] | undefined,
): string {
  if (!astro) {
    return "暂无月光影响数据";
  }
  if (astro.moonIllumination < 0.35) {
    return "月光影响较轻";
  }
  if (astro.moonIllumination < 0.65) {
    return "月光影响中等";
  }
  return "月光影响偏强";
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}

function formatMeters(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)} 米` : "暂无数据";
}

function terrainPotentialLabel(
  potential: ForecastCalculationResult["terrainAnalysis"]["terrainProfile"]["terrainCloudSeaPotential"],
): string {
  if (potential === "high") {
    return "高";
  }
  if (potential === "medium") {
    return "中";
  }
  return "低";
}

function formatWgs84Coordinates(result: ForecastCalculationResult["calendarBasis"]): string {
  return `${formatCoordinate(result.wgs84Coordinates.latitude)}, ${formatCoordinate(
    result.wgs84Coordinates.longitude,
  )}`;
}
