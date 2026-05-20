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
import { Badge, Button, Card, cn } from "../../components/ui";
import {
  buildForecastResultViewModel,
  getForecastResultPageShellCopy,
  type ForecastResultCard,
  type ForecastResultCardTone,
  type ForecastResultSection,
  type ForecastResultWindow,
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
  mock: "模拟数据",
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="当前位置" className="flex items-center gap-2 text-sm">
          <a href="/" className="font-medium text-muted-foreground transition hover:text-primary">
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
          {result?.isMock || status === "loading" ? "部分模拟数据" : "已接入数据源"}
        </Badge>
      </header>

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
          正在使用本地算法天文数据、模拟天气数据和模拟地形数据计算出片指数。
        </p>
      </Card>
      <Card className="p-5 shadow-sm">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          天文计算在本地完成；天气与地形仍使用本地模拟数据，不会调用外部分析服务。
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
              {result.isMock ? "天气/地形模拟" : "已接入数据源"}
            </Badge>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">{viewModel.primarySummary}</p>
          <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {viewModel.primaryCards.map((card) => (
              <PrimaryResultCard key={card.key} card={card} />
            ))}
          </section>
        </Card>

        <WindowPanel
          title={viewModel.windowsTitle}
          description={viewModel.windowsDescription}
          windows={viewModel.bestWindows}
        />

        <ScoreCardsPanel title={viewModel.scoreSectionTitle} scores={viewModel.scoreCards} />

        <SectionGrid sections={viewModel.detailSections} />
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

function WindowPanel({
  title,
  description,
  windows,
}: {
  readonly title: string;
  readonly description: string;
  readonly windows: readonly ForecastResultWindow[];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">目标优先</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {windows.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {windows.map((window) => (
            <li
              key={`${window.target}-${window.startTime}`}
              className="grid gap-2 rounded-lg border border-border bg-muted px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
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
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">暂无明确高分窗口。</p>
      )}
    </Card>
  );
}

function MockWarningCard({
  result,
  dataNotice,
}: {
  readonly result: ForecastCalculationResult;
  readonly dataNotice: string;
}) {
  return (
    <Card className={cn("p-4 shadow-sm", result.isMock ? "border-warning" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.isMock ? "warning" : "success"}>
          {result.isMock ? "部分模拟数据" : "已接入数据源"}
        </Badge>
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
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={result.isMock ? "warning" : "success"}>
          {result.isMock ? "部分模拟数据" : "已接入数据源"}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="天文数据" value="本地算法计算" />
        <SummaryItem label="天气数据" value={result.dataSourceLabel} />
        <SummaryItem label="地形数据" value="本地模拟数据" />
        <SummaryItem label="计算基准" value={result.calendarBasis.forecastStartLabel} />
      </dl>
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
        <SummaryItem label="天文数据" value="本地算法计算" />
        <SummaryItem label="天气数据" value={result.dataSourceLabel} />
        <SummaryItem label="地形数据" value="本地模拟数据" />
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

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}

function formatWgs84Coordinates(result: ForecastCalculationResult["calendarBasis"]): string {
  return `${formatCoordinate(result.wgs84Coordinates.latitude)}, ${formatCoordinate(
    result.wgs84Coordinates.longitude,
  )}`;
}
