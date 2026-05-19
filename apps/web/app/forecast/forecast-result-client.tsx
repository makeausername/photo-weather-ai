"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  forecastHorizonLabels,
  forecastTargetLabels,
  type AstroSummary,
  type ForecastCalculationResult,
  type ForecastQueryInput,
  type ForecastRiskLevel,
  type ForecastScore,
  type ForecastScoreLevel,
  type ForecastTimeWindow,
} from "@photo-weather/shared";
import { PublicShell } from "../../components/public-shell";
import { Badge, Button, Card, cn } from "../../components/ui";

type ForecastResultClientProps = {
  readonly query: ForecastQueryInput | null;
};

type LoadStatus = "idle" | "loading" | "ready" | "error";

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

const riskLevelLabels: Record<ForecastRiskLevel, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const scoreOrder = [
  "sunriseGlow",
  "sunsetGlow",
  "cloudSea",
  "whiteoutRisk",
  "stars",
  "milkyWay",
  "transparency",
] as const;

export function ForecastResultClient({ query }: ForecastResultClientProps) {
  const [status, setStatus] = useState<LoadStatus>(query ? "loading" : "idle");
  const [result, setResult] = useState<ForecastCalculationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const queryKey = useMemo(() => (query ? JSON.stringify(query) : ""), [query]);

  useEffect(() => {
    if (!query) {
      return;
    }

    const controller = new AbortController();
    setStatus("loading");
    setResult(null);
    setErrorMessage("");

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
          throw new Error("拍摄天气分析暂时不可用，请稍后重试。");
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

  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="当前位置" className="flex items-center gap-2 text-sm">
          <a href="/" className="font-medium text-muted-foreground transition hover:text-primary">
            首页
          </a>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold text-foreground">拍摄天气分析</span>
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
          <Badge variant="default">结果工作台</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            拍摄天气分析
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-[15px]">
            按地点、时间范围和拍摄目标展示综合指数、窗口、风险、建议与数据状态。当前结果用于界面和本地计算验证，不代表真实预报。
          </p>
        </div>
        <Badge variant={result?.isMock || status === "loading" ? "warning" : "success"}>
          {result?.isMock || status === "loading" ? "模拟展示" : "已接入数据源"}
        </Badge>
      </header>

      {!query ? <InvalidQueryCard /> : null}

      {query && status === "loading" ? <LoadingDashboard query={query} /> : null}

      {query && status === "error" ? (
        <DashboardFrame query={query}>
          <Card className="border-danger p-5 shadow-sm">
            <h2 className="text-lg font-bold text-danger">分析失败</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorMessage}</p>
          </Card>
        </DashboardFrame>
      ) : null}

      {query && result ? <ForecastResultView query={query} result={result} /> : null}
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
          正在使用本地模拟天气、地形和天文数据计算出片指数。
        </p>
      </Card>
      <Card className="p-5 shadow-sm">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          当前展示模拟计算流程，不会调用真实天气、地图图层或外部分析服务。
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

function InvalidQueryCard() {
  return (
    <Card className="border-warning p-5 shadow-sm">
      <h2 className="text-lg font-bold text-warning">查询参数不完整</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        请从首页选择地点、预报范围和分析目标后进入分析页面。
      </p>
    </Card>
  );
}

function ForecastResultView({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  const scoreEntries = scoreOrder.map((key) => result.scores[key]);
  const bestWindow = result.bestWindows[0];
  const mainRisk = result.riskFlags[0];
  const astroSummary = result.astroSummaries[0];

  return (
    <DashboardFrame query={query}>
      <main className="grid gap-4">
        <Card className="grid gap-4 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-primary">综合判断</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-card-foreground">
                {result.recommendationLabel}
              </h2>
            </div>
            <Badge variant={result.isMock ? "warning" : "success"}>
              {result.isMock ? "模拟展示" : "真实数据"}
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-xs font-semibold text-muted-foreground">综合指数</p>
              <p className="mt-2 text-5xl font-bold leading-none text-primary">
                {result.overallScore}
              </p>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">/ 100</p>
            </div>
            <div className="grid gap-3">
              <p className="text-sm leading-6 text-muted-foreground">{result.summary}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <CompactFact
                  label="最佳窗口"
                  value={bestWindow?.label ?? "暂无明确高分窗口"}
                  detail={bestWindow ? formatWindowRange(bestWindow) : "等待更多数据"}
                  tone="accent"
                />
                <CompactFact
                  label="主要风险"
                  value={mainRisk?.label ?? "未发现高等级风险"}
                  detail={mainRisk ? `${riskLevelLabels[mainRisk.level]}风险` : "仍需现场核对"}
                  tone="danger"
                />
              </div>
            </div>
          </div>
        </Card>

        <WindowPanel windows={result.bestWindows} />

        <AstronomyPanel astro={astroSummary} />

        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {scoreEntries.map((score) => (
            <ScoreCard key={score.key} score={score} />
          ))}
        </section>
      </main>

      <aside className="grid content-start gap-4">
        <MockWarningCard result={result} />
        <RiskPanel risks={result.riskFlags} />
        <TextListPanel title="拍摄建议" emptyText="暂无拍摄建议。">
          {result.photographyAdvice.map((advice) => (
            <li key={advice} className="text-sm leading-6 text-muted-foreground">
              {advice}
            </li>
          ))}
        </TextListPanel>
        <TextListPanel title="关键依据" emptyText="暂无关键依据。">
          {result.keyReasons.map((reason) => (
            <li key={reason} className="text-sm leading-6 text-muted-foreground">
              {reason}
            </li>
          ))}
        </TextListPanel>
        <DataStatusPanel result={result} />
      </aside>
    </DashboardFrame>
  );
}

const missingText = "暂无数据";

const milkyWayVisibilityLabels: Record<NonNullable<AstroSummary["milkyWayVisibilityLevel"]>, string> = {
  unavailable: "不可见",
  poor: "条件较差",
  fair: "可尝试",
  good: "条件较好",
};

function AstronomyPanel({ astro }: { readonly astro: AstroSummary | undefined }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">天文条件</h2>
        <Badge variant="muted">本地计算</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
        <AstronomyFactCard
          title="日出 / 日落"
          primary={`${formatOptionalTime(astro?.sunrise)} / ${formatOptionalTime(astro?.sunset)}`}
          detail={`太阳中天：${formatOptionalTime(astro?.solarNoon)}`}
        />
        <AstronomyFactCard
          title="月相 / 月亮照明"
          primary={`${astro?.moonPhaseNameZh ?? missingText} / ${formatPercent(astro?.moonIllumination)}`}
          detail={`月相值：${formatNumber(astro?.moonPhase)}`}
        />
        <AstronomyFactCard
          title="月出 / 月落"
          primary={`${formatOptionalTime(astro?.moonrise)} / ${formatOptionalTime(astro?.moonset)}`}
          detail="以当地地平线近似计算"
        />
        <AstronomyFactCard
          title="天文黑夜窗口"
          primary={formatOptionalWindow(astro?.astronomicalNightStart, astro?.astronomicalNightEnd)}
          detail={`天文晨光：${formatOptionalTime(astro?.astronomicalDawn)}`}
        />
        <AstronomyFactCard
          title="银河窗口"
          primary={formatOptionalWindow(astro?.milkyWayWindowStart, astro?.milkyWayWindowEnd)}
          detail={`${formatMilkyWayVisibility(astro?.milkyWayVisibilityLevel)} / ${
            astro?.milkyWayDirection ?? missingText
          }`}
        />
      </div>

      <p className="mt-4 rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
        天文时间基于经纬度本地计算，真实拍摄效果仍需结合云量、能见度和地形遮挡。
      </p>
      {astro?.milkyWayNoteZh ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{astro.milkyWayNoteZh}</p>
      ) : null}
    </Card>
  );
}

function AstronomyFactCard({
  title,
  primary,
  detail,
}: {
  readonly title: string;
  readonly primary: string;
  readonly detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <p className="mt-2 break-words text-sm font-bold leading-5 text-card-foreground">
        {primary}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function CompactFact({
  label,
  value,
  detail,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: "accent" | "danger";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-bold text-card-foreground",
          tone === "accent" && "text-accent",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function WindowPanel({ windows }: { readonly windows: readonly ForecastTimeWindow[] }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">时间窗口</h2>
        <Badge variant="muted">按评分排序</Badge>
      </div>
      {windows.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {windows.map((window) => (
            <li
              key={`${window.target}-${window.startTime}`}
              className="grid gap-2 rounded-lg border border-border bg-muted px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div>
                <p className="font-semibold text-card-foreground">{window.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatWindowRange(window)}</p>
              </div>
              <Badge variant={window.score >= 75 ? "default" : "accent"}>{window.score} 分</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">暂无明确高分窗口。</p>
      )}
    </Card>
  );
}

function MockWarningCard({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className={cn("p-4 shadow-sm", result.isMock ? "border-warning" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.isMock ? "warning" : "success"}>
          {result.isMock ? "模拟展示" : "真实数据"}
        </Badge>
        <p className="text-sm font-semibold text-card-foreground">数据提醒</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{result.dataNotice}</p>
    </Card>
  );
}

function RiskPanel({
  risks,
}: {
  readonly risks: readonly ForecastCalculationResult["riskFlags"][number][];
}) {
  return (
    <Card className="p-5 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">风险与注意事项</h2>
      {risks.length > 0 ? (
        <ul className="mt-4 grid gap-3">
          {risks.map((risk) => (
            <li key={risk.key} className="rounded-lg border border-border bg-muted px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-card-foreground">{risk.label}</span>
                <Badge variant={risk.level === "high" ? "danger" : "warning"}>
                  {riskLevelLabels[risk.level]}风险
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{risk.description}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">未发现高等级风险。</p>
      )}
    </Card>
  );
}

function TextListPanel({
  title,
  emptyText,
  children,
}: {
  readonly title: string;
  readonly emptyText: string;
  readonly children: ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasItems = Array.isArray(items) ? items.length > 0 : Boolean(items);

  return (
    <Card className="p-5 shadow-sm">
      <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
      {hasItems ? (
        <ul className="mt-4 grid gap-3">{items}</ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{emptyText}</p>
      )}
    </Card>
  );
}

function DataStatusPanel({ result }: { readonly result: ForecastCalculationResult }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={result.isMock ? "warning" : "success"}>
          {result.isMock ? "模拟预报" : "真实数据"}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="计算模式" value={result.dataSourceLabel} />
        <SummaryItem label="生成时间" value={formatDateTime(result.generatedAt)} />
      </dl>
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

function formatOptionalTime(value: string | undefined): string {
  return value ? formatTime(value) : missingText;
}

function formatOptionalWindow(startTime: string | undefined, endTime: string | undefined): string {
  return startTime && endTime ? `${formatTime(startTime)} - ${formatTime(endTime)}` : missingText;
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return missingText;
  }

  return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return missingText;
  }

  return value.toFixed(3);
}

function formatMilkyWayVisibility(
  value: AstroSummary["milkyWayVisibilityLevel"] | undefined,
): string {
  return value ? milkyWayVisibilityLabels[value] : missingText;
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}

function formatWindowRange(window: ForecastTimeWindow): string {
  return `${formatTime(window.startTime)} - ${formatTime(window.endTime)}`;
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

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}
