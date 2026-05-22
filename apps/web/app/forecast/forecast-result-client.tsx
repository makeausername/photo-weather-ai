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
} from "@photo-weather/shared";
import { PublicShell } from "../../components/public-shell";
import { MoonPhaseCalendar } from "../../components/moon-phase-calendar";
import { Badge, Button, Card, cn } from "../../components/ui";
import {
  buildForecastResultViewModel,
  getForecastResultPageShellCopy,
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
    (query?.target === "general" || query?.target === "cloud_sea") && result !== null;

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
          正在结合本地算法天文数据、演示天气数据和演示地形数据计算出片指数。
        </p>
      </Card>
      <Card className="p-5 shadow-sm">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          天文数据由本地算法计算；天气与地形当前使用演示数据生成体验结果。
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
    return <CloudSeaForecastView query={query} result={result} viewModel={viewModel.cloudSea} />;
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

function CloudSeaForecastView({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: CloudSeaForecastViewModel;
}) {
  return (
    <section className="grid gap-5">
      <CloudSeaTopContext query={query} result={result} />
      <CloudSeaCoreDecisionCards cards={viewModel.coreCards} />

      <div className="grid gap-5 min-[1024px]:grid-cols-12 min-[1024px]:items-start">
        <main className="grid gap-5 min-[1024px]:col-span-8">
          <CloudSeaDailyTrendSection result={result} items={viewModel.dailyTrend} />
          <CloudSeaTimeWindowSection windows={viewModel.cloudSeaWindows} />
          <CloudSeaVsWhiteoutSection view={viewModel.cloudSeaVsWhiteout} />
          <CloudSeaTerrainSection terrainEvidence={viewModel.terrainEvidence} />
          <CloudSeaWeatherEvidenceSection items={viewModel.weatherEvidence} />
        </main>

        <aside className="grid content-start gap-5 min-[1024px]:col-span-4">
          <CloudSeaTravelRecommendationSection items={viewModel.travelRecommendations} />
          <CloudSeaRiskSummarySection items={viewModel.riskSummary} />
          <CloudSeaBackupPlanSection plans={viewModel.backupPlans} />
          <CloudSeaDataStatusSection
            result={result}
            dataNotice={viewModel.dataNotice}
            missingDataNotes={viewModel.missingDataNotes}
          />
        </aside>
      </div>
    </section>
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
      <div className="grid gap-4 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-center">
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
          <div className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-2 min-[1120px]:flex min-[1120px]:flex-wrap min-[1120px]:gap-2">
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

function CloudSeaCoreDecisionCards({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <PrimaryResultCard key={card.key} card={card} />
      ))}
    </section>
  );
}

function CloudSeaDailyTrendSection({
  result,
  items,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly CloudSeaDailyTrendItem[];
}) {
  const title = result.calendarBasis.horizonHours <= 24 ? "每日清晨窗口" : "逐日云海趋势";

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            按云海机会、白墙风险和清晨窗口排序，不混入星空或银河窗口。
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 min-[1320px]:grid-cols-3">
        {items.map((item) => (
          <article key={item.key} className="rounded-lg border border-border bg-muted p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-card-foreground">{item.dateLabel}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  最佳清晨窗口：{item.bestMorningWindow}
                </p>
              </div>
              <Badge variant={item.cloudSeaScore >= 70 ? "default" : "accent"}>
                {item.cloudSeaScore} 分
              </Badge>
            </div>
            <dl className="mt-4 grid gap-2 text-sm">
              <CloudSeaInlineDefinition label="云海机会" value={item.cloudSeaLevel} />
              <CloudSeaInlineDefinition
                label="白墙风险"
                value={`${item.whiteoutRiskLabel}（${item.whiteoutRiskScore} 分）`}
              />
              <CloudSeaInlineDefinition label="推荐动作" value={item.recommendedAction} />
            </dl>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.keyReason}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaVsWhiteoutSection({ view }: { readonly view: CloudSeaVsWhiteoutView }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">云海还是白墙</h2>
        <Badge variant="muted">低云 / 能见度 / 海拔</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-primary">云海</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{view.cloudSeaDefinition}</p>
        </div>
        <div className="rounded-lg border border-border bg-muted p-4">
          <h3 className="font-bold text-danger">白墙</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{view.whiteoutDefinition}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
            className="grid gap-3 rounded-lg border border-border bg-muted p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
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

function CloudSeaTerrainSection({
  terrainEvidence,
}: {
  readonly terrainEvidence: CloudSeaForecastViewModel["terrainEvidence"];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">地形依据</h2>
        <Badge variant="muted">{terrainEvidence.dataSource}</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

function CloudSeaWeatherEvidenceSection({
  items,
}: {
  readonly items: readonly CloudSeaWeatherEvidenceItem[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">气象依据</h2>
        <Badge variant="muted">水汽 / 低云 / 风 / 通透</Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

function CloudSeaTravelRecommendationSection({
  items,
}: {
  readonly items: readonly CloudSeaTravelRecommendation[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">出行建议</h2>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <article key={item.situation} className="rounded-lg border border-border bg-muted p-4">
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
    <Card className="p-5 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">白墙风险原因</h2>
      <div className="mt-4 grid gap-3">
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
    <Card className="p-5 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">备选拍摄方案</h2>
      <div className="mt-4 grid gap-3">
        {plans.map((plan) => (
          <article key={plan.condition} className="rounded-lg border border-border bg-muted p-4">
            <p className="text-xs font-semibold text-muted-foreground">{plan.condition}</p>
            <h3 className="mt-2 font-bold text-card-foreground">{plan.action}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{plan.detail}</p>
          </article>
        ))}
      </div>
    </Card>
  );
}

function CloudSeaDataStatusSection({
  result,
  dataNotice,
  missingDataNotes,
}: {
  readonly result: ForecastCalculationResult;
  readonly dataNotice: string;
  readonly missingDataNotes: readonly string[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={result.weatherDataMode === "real" ? "success" : "warning"}>
          {weatherModeBadge(result)}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <CompactDefinition label="天气数据" value={weatherStatusLabel(result)} />
        <CompactDefinition label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <CompactDefinition label="天文数据" value="本地算法计算" />
        <CompactDefinition
          label="WGS84 坐标"
          value={formatWgs84Coordinates(result.calendarBasis)}
        />
      </dl>
      <p className="mt-4 rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-muted-foreground">
        {dataNotice}
      </p>
      {missingDataNotes.length > 0 ? (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 p-3">
          <p className="text-xs font-semibold text-card-foreground">数据缺失说明</p>
          <ul className="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground">
            {missingDataNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
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

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="天文数据" value="本地算法计算" />
        <SummaryItem label="天气数据" value={weatherStatusLabel(result)} />
        <SummaryItem label="地形数据" value={result.terrainAnalysis.dataSourceLabelZh} />
        <SummaryItem label="计算基准" value={result.calendarBasis.forecastStartLabel} />
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {result.terrainAnalysis.honestyNoteZh}
      </p>
    </Card>
  );
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
        <SummaryItem label="天文数据" value="本地算法计算" />
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
