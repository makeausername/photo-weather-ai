"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  forecastHorizonLabels,
  forecastTargetLabels,
  type ForecastCalculationResult,
  type ForecastQueryInput,
  type ForecastRiskLevel,
  type ForecastScore,
  type ForecastScoreLevel,
} from "@photo-weather/shared";
import { PublicHeader } from "../../components/public-header";
import { Badge, Button, Card, cn } from "../../components/ui";

type ForecastResultClientProps = {
  readonly query: ForecastQueryInput | null;
};

type LoadStatus = "idle" | "loading" | "ready" | "error";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const sourceLabels: Record<string, string> = {
  local_location: "本地点位",
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
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
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
            className="h-8 px-2.5"
            onClick={() => {
              window.location.assign("/");
            }}
          >
            重新选择地点
          </Button>
        </div>

        <header className="grid gap-3">
          <Badge variant="muted">拍摄判断</Badge>
          <div className="grid gap-2">
            <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-3xl">
              拍摄天气分析
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              根据已选择的地点、预报范围和拍摄目标生成出发参考。当前结果仍使用本地样例数据，请结合现场条件与官方预报判断。
            </p>
          </div>
        </header>

        {query ? <QuerySummaryCard query={query} /> : <InvalidQueryCard />}

        {status === "loading" ? (
          <Card className="p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-semibold text-card-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              正在生成拍摄天气分析…
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              正在使用本地模拟天气、地形和天文数据计算出片指数。
            </p>
          </Card>
        ) : null}

        {status === "error" ? (
          <Card className="border-danger p-5 shadow-sm">
            <h2 className="text-lg font-bold text-danger">分析失败</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{errorMessage}</p>
          </Card>
        ) : null}

        {result ? <ForecastResultView result={result} /> : null}
      </div>
    </main>
  );
}

function QuerySummaryCard({ query }: { readonly query: ForecastQueryInput }) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-muted-foreground">地点名称</p>
          <h2 className="mt-1 break-words text-xl font-bold text-card-foreground">{query.name}</h2>
        </div>
        <Badge variant="default">{forecastTargetLabels[query.target]}</Badge>
      </div>

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">预报范围</dt>
          <dd className="mt-1 font-semibold text-card-foreground">
            {forecastHorizonLabels[query.horizon]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">分析目标</dt>
          <dd className="mt-1 font-semibold text-card-foreground">
            {forecastTargetLabels[query.target]}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">数据来源</dt>
          <dd className="mt-1 font-semibold text-card-foreground">
            {sourceLabels[query.source] ?? "其他来源"}
          </dd>
        </div>
      </dl>

      <details className="mt-4 rounded-lg border border-border bg-muted px-3 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-card-foreground">坐标信息</summary>
        <div className="mt-3 grid gap-1 leading-6 text-muted-foreground">
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

function ForecastResultView({ result }: { readonly result: ForecastCalculationResult }) {
  const scoreEntries = scoreOrder.map((key) => result.scores[key]);

  return (
    <>
      <Card className={cn("bg-card p-4 shadow-sm", result.isMock ? "border-warning" : "")}>
        <p
          className={cn(
            "text-sm font-semibold leading-6",
            result.isMock ? "text-warning" : "text-card-foreground",
          )}
        >
          {result.dataNotice}
        </p>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="综合出片指数"
          value={`${result.overallScore} / 100`}
          detail={result.summary}
        />
        <MetricCard
          title="推荐等级"
          value={result.recommendationLabel}
          detail={`分析目标：${forecastTargetLabels[result.target]}`}
        />
        <MetricCard
          title="最佳拍摄窗口"
          value={result.bestWindows[0]?.label ?? "暂无明确高分窗口"}
          detail={
            result.bestWindows[0]
              ? `窗口评分 ${result.bestWindows[0].score} / 100`
              : "建议等待真实天气数据接入后再判断。"
          }
        />
        <MetricCard
          title="主要风险"
          value={result.riskFlags[0]?.label ?? "未发现高等级风险"}
          detail={
            result.riskFlags[0]
              ? `${riskLevelLabels[result.riskFlags[0].level]}风险：${result.riskFlags[0].description}`
              : "仍需在出行前核对真实天气和景区信息。"
          }
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {scoreEntries.map((score) => (
          <ScoreCard key={score.key} score={score} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ListCard title="最佳拍摄窗口" emptyText="暂无明确高分窗口。">
          {result.bestWindows.map((window) => (
            <li
              key={`${window.target}-${window.startTime}`}
              className="rounded-lg bg-muted px-3 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-card-foreground">{window.label}</span>
                <Badge variant="muted">{window.score} 分</Badge>
              </div>
            </li>
          ))}
        </ListCard>

        <ListCard title="主要风险" emptyText="未发现高等级风险。">
          {result.riskFlags.map((risk) => (
            <li key={risk.key} className="rounded-lg bg-muted px-3 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-card-foreground">{risk.label}</span>
                <Badge variant={risk.level === "high" ? "danger" : "warning"}>
                  {riskLevelLabels[risk.level]}风险
                </Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{risk.description}</p>
            </li>
          ))}
        </ListCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ListCard title="关键依据" emptyText="暂无关键依据。">
          {result.keyReasons.map((reason) => (
            <li key={reason} className="text-sm leading-6 text-muted-foreground">
              {reason}
            </li>
          ))}
        </ListCard>

        <ListCard title="风险提示" emptyText="暂无额外风险提示。">
          {scoreEntries.flatMap((score) =>
            score.risks.map((risk) => (
              <li key={`${score.key}-${risk}`} className="text-sm leading-6 text-muted-foreground">
                {risk}
              </li>
            )),
          )}
        </ListCard>

        <ListCard title="拍摄建议" emptyText="暂无拍摄建议。">
          {result.photographyAdvice.map((advice) => (
            <li key={advice} className="text-sm leading-6 text-muted-foreground">
              {advice}
            </li>
          ))}
        </ListCard>
      </section>

      <Card className="p-5 shadow-sm">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">计算模式</dt>
            <dd className="mt-1 font-semibold text-card-foreground">
              {result.dataSourceLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">生成时间</dt>
            <dd className="mt-1 font-semibold text-card-foreground">
              {formatDateTime(result.generatedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">数据说明</dt>
            <dd className="mt-1 leading-6 text-card-foreground">{result.dataNotice}</dd>
          </div>
        </dl>
      </Card>
    </>
  );
}

function MetricCard({
  title,
  value,
  detail,
}: {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
}) {
  return (
    <Card className="p-5 shadow-sm">
      <p className="text-xs font-bold text-muted-foreground">{title}</p>
      <p className="mt-3 text-2xl font-bold leading-8 text-card-foreground">{value}</p>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{detail}</p>
    </Card>
  );
}

function ScoreCard({ score }: { readonly score: ForecastScore }) {
  const isRisk = score.key === "whiteoutRisk";

  return (
    <Card className="p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-card-foreground">{score.label}</p>
          <p className="mt-2 text-3xl font-bold leading-9 text-card-foreground">{score.score}</p>
        </div>
        <Badge variant={score.level === "poor" ? "warning" : "muted"}>
          {isRisk ? "风险值" : scoreLevelLabels[score.level]}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{score.reasons[0]}</p>
      <div
        className={cn(
          "mt-3 h-2 overflow-hidden rounded-full bg-muted",
          isRisk ? "border border-warning/30" : "",
        )}
      >
        <div
          className={cn("h-full rounded-full", isRisk ? "bg-warning" : "bg-primary")}
          style={{ width: `${score.score}%` }}
        />
      </div>
    </Card>
  );
}

function ListCard({
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

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
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
