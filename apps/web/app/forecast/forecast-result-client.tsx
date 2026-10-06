"use client";
import {
  rememberForecastHorizon,
  rememberRecentSelectedLocation,
  selectedLocationFromForecastQuery,
} from "../../components/selected-location";

import {
  buildCloudSeaDecisionReport,
  buildGlowDecisionReport,
  buildAstroDecisionReport,
} from "./subject-decision-report";
import { SubjectDecisionReportView } from "./subject-decision-report-view";

import * as React from "react";
import { DecisionValue } from "../../components/decision-value";
import {
  hourlyColumnGroups,
  hourlyColumnVisibility,
  hourlyTableNumber,
  type HourlyColumnGroup,
} from "./professional-hourly-columns";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  formatLocalDateLabel,
  forecastHorizonLabels,
  forecastTargetLabels,
  type CloudLayerCompletenessContext,
  type CloudSeaCloudBasisConsistencyContext,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastQueryInput,
  type ForecastScore,
  type ForecastScoreLevel,
} from "@photo-weather/shared";
import { PublicShell } from "../../components/public-shell";
import { MoonPhaseCalendar } from "../../components/moon-phase-calendar";
import { Badge, Button, Card, cn } from "../../components/ui";
import { saveForecastHistory } from "../../components/account-session";
import { upgradeRequiredDefaultMessage, upgradeRequiredTitle } from "../../components/api-client";
import {
  buildForecastResultViewModel,
  getForecastResultPageShellCopy,
  type AstroForecastViewModel,
  type CloudSeaForecastViewModel,
  type ForecastResultCard,
  type ForecastResultCardTone,
  type ForecastResultDailyItem,
  type ForecastResultSection,
  type ForecastResultViewModel,
  type ForecastResultWindow,
  type ForecastResultWindowGroup,
  type GlowForecastViewModel,
} from "./forecast-result-view-model";
import { normalizeForecastPublicCopyText } from "./forecast-copy-polish";
import { writeForecastResultContext } from "./subject-detail-links";
import type { CloudSeaTerrainContext } from "./cloud-sea-terrain-context";
import { buildTerrainDisplayModel } from "./terrain-display-model";
import type {
  CloudSeaProfessionalHourlyDisplayData,
  CloudSeaProfessionalHourlyWindow,
  ProfessionalHourlyDisplayData,
  ProfessionalHourlyRowAnnotation,
} from "./cloud-sea-display-data";
import {
  DecisionErrorTemplate,
  DecisionLoadingTemplate,
  DecisionResultTemplate,
  ResultMeter,
  type ResultMeterTone,
} from "./result-dashboard-components";
import { PhotographyOutlook } from "./photography-outlook-view";
import { buildPhotographyOutlook } from "./photography-outlook";
import { WeatherAlerts } from "./weather-alerts";
import { HourlyWeatherMatrix } from "./hourly-weather-matrix";
import { StickyDataScroller } from "../../components/sticky-data-scroller";
import { WeatherDateSelector } from "./general-weather-overview";
import { weatherDates, weatherRowsForDate } from "./general-weather-data";
import {
  isForecastRequestAbortError,
  normalizeForecastClientError,
  requestForecastCalculation,
  stableForecastQueryKey,
} from "./forecast-request-client";

type ForecastResultClientProps = {
  readonly query: ForecastQueryInput | null;
  readonly invalidReason?: string;
};

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export type ForecastPageMode = "search" | "loading" | "result" | "error";

export type DecisionProgressContext = {
  readonly name: string;
  readonly horizon?: ForecastHorizon;
  readonly target?: ForecastQueryInput["target"];
};

type DecisionTemplateTarget = "general" | "cloud_sea";

const scoreLevelLabels: Record<ForecastScoreLevel, string> = {
  poor: "较差",
  fair: "一般",
  good: "较好",
  excellent: "优秀",
};

export function resolveForecastPageMode({
  query,
  status,
  hasResult,
}: {
  readonly query: ForecastQueryInput | null;
  readonly status: LoadStatus;
  readonly hasResult: boolean;
}): ForecastPageMode {
  if (!query) {
    return "search";
  }
  if (status === "loading") {
    return "loading";
  }
  if (status === "error") {
    return "error";
  }
  if (hasResult || status === "ready") {
    return "result";
  }
  return "search";
}

export function ForecastResultClient({ query, invalidReason }: ForecastResultClientProps) {
  const [status, setStatus] = useState<LoadStatus>(query ? "loading" : "idle");
  const [result, setResult] = useState<ForecastCalculationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const latestQueryRef = useRef<ForecastQueryInput | null>(query);
  const resultRef = useRef<ForecastCalculationResult | null>(result);
  const resultQueryKeyRef = useRef("");
  const historySaveKeyRef = useRef("");
  const requestSequenceRef = useRef(0);

  latestQueryRef.current = query;
  resultRef.current = result;

  const queryKey = useMemo(() => (query ? stableForecastQueryKey(query) : ""), [query]);
  const activeTarget = query?.target ?? result?.target ?? "general";
  const shellCopy = getForecastResultPageShellCopy(activeTarget);
  const pageMode = resolveForecastPageMode({
    query,
    status,
    hasResult: result !== null,
  });
  const isCloudSeaFlow = activeTarget === "cloud_sea";
  const usesSpecializedResultHeader =
    result !== null &&
    (activeTarget === "general" ||
      activeTarget === "cloud_sea" ||
      activeTarget === "glow" ||
      activeTarget === "astro");
  const changeLocationPath =
    activeTarget === "cloud_sea"
      ? "/cloud-sea"
      : activeTarget === "glow"
        ? "/glow"
        : activeTarget === "astro"
          ? "/astro"
          : "/";

  useEffect(() => {
    if (query) {
      rememberForecastHorizon(query.horizon);
      rememberRecentSelectedLocation(selectedLocationFromForecastQuery(query));
    }
  }, [query]);

  useEffect(() => {
    if (!queryKey) {
      requestSequenceRef.current += 1;
      resultQueryKeyRef.current = "";
      historySaveKeyRef.current = "";
      resultRef.current = null;
      setStatus("idle");
      setResult(null);
      setErrorMessage("");
      setErrorCode("");
      return;
    }

    const activeQuery = latestQueryRef.current;
    if (!activeQuery) {
      return;
    }
    const requestQuery: ForecastQueryInput = activeQuery;
    const activeQueryKey = queryKey;
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    const controller = new AbortController();
    const hasResultForSameQuery =
      resultQueryKeyRef.current === activeQueryKey && resultRef.current !== null;
    if (!hasResultForSameQuery) {
      resultRef.current = null;
      setResult(null);
      setStatus("loading");
    } else {
      setStatus("ready");
    }
    setErrorMessage("");
    setErrorCode("");

    async function calculateForecast() {
      try {
        const data = await requestForecastCalculation(requestQuery, {
          signal: controller.signal,
        });
        if (
          requestSequenceRef.current !== requestSequence ||
          stableForecastQueryKey(latestQueryRef.current ?? requestQuery) !== activeQueryKey
        ) {
          return;
        }

        await writeForecastResultContext({ query: requestQuery, result: data });
        if (requestSequenceRef.current !== requestSequence || controller.signal.aborted) return;
        resultQueryKeyRef.current = activeQueryKey;
        resultRef.current = data;
        setResult(data);
        setStatus("ready");
        const historySaveKey = `${activeQueryKey}:${data.generatedAt}`;
        if (historySaveKeyRef.current !== historySaveKey) {
          historySaveKeyRef.current = historySaveKey;
          void saveForecastHistory({
            query: requestQuery,
            resultSummary: buildForecastHistorySummary(data),
          }).catch((error) => {
            if (process.env.NODE_ENV !== "production") {
              console.debug(
                "Forecast history save skipped.",
                error instanceof Error ? error.name : "unknown",
              );
            }
          });
        }
      } catch (error) {
        if (isForecastRequestAbortError(error)) {
          return;
        }
        if (
          requestSequenceRef.current !== requestSequence ||
          stableForecastQueryKey(latestQueryRef.current ?? requestQuery) !== activeQueryKey
        ) {
          return;
        }
        if (resultQueryKeyRef.current === activeQueryKey && resultRef.current) {
          setStatus("ready");
          return;
        }

        const normalizedError = normalizeForecastClientError(error);
        setErrorMessage(normalizedError.publicMessage);
        setErrorCode(normalizedError.code ?? "");
        setStatus("error");
      }
    }

    void calculateForecast();

    return () => {
      controller.abort();
    };
  }, [queryKey, retryNonce]);

  const retryForecast = React.useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);

  return (
    <PublicShell contentClassName="grid gap-6 pb-16 lg:gap-8">
      {!usesSpecializedResultHeader ? (
        <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{shellCopy.pageTitle}</h1>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.assign(changeLocationPath)}
          >
            更换地点与范围
          </Button>
        </header>
      ) : null}

      {!query ? <InvalidQueryCard message={invalidReason} /> : null}

      {query && pageMode === "loading" ? (
        <ForecastDecisionLoadingState
          target={isCloudSeaFlow ? "cloud_sea" : "general"}
          context={query}
        />
      ) : null}

      {query && pageMode === "error" ? (
        <ForecastDecisionErrorState
          target={isCloudSeaFlow ? "cloud_sea" : "general"}
          query={query}
          message={errorMessage}
          code={errorCode}
          onRetry={retryForecast}
        />
      ) : null}

      {query && result && pageMode === "result" ? (
        <>
          <WeatherAlerts result={result} />
          <ForecastResultView query={query} result={result} />
        </>
      ) : null}
    </PublicShell>
  );
}

export function buildForecastHistorySummary(result: ForecastCalculationResult) {
  const model = buildForecastResultViewModel(result, result.target);
  const report = model.cloudSea
    ? buildCloudSeaDecisionReport(result, model.cloudSea)
    : model.glow
      ? buildGlowDecisionReport(result, model.glow)
      : model.astro
        ? buildAstroDecisionReport(result, model.astro)
        : undefined;
  const outlook = report ? undefined : buildPhotographyOutlook(result);
  const bestWindow = report?.selectedWindow ?? outlook?.selectedWindow;
  return {
    summaryVersion: 2,
    overallScore: forecastHistoryScoreForTarget(result),
    recommendationLabel: report?.verdict ?? outlook!.conclusion[0],
    windowLabel: report?.timing ?? outlook!.conclusion[1],
    bestWindowStart: bestWindow?.start ?? null,
    bestWindowEnd: bestWindow?.end ?? null,
  };
}

export function forecastHistoryScoreForTarget(result: ForecastCalculationResult): number {
  if (result.target === "cloud_sea") {
    return (
      result.cloudSeaAnalysis.scoreCalibration?.finalCloudSeaScore ??
      result.cloudSeaAnalysis.shootableScore
    );
  }
  if (result.target === "glow") {
    return Math.max(result.glowAnalysis.sunriseGlowScore, result.glowAnalysis.sunsetGlowScore);
  }
  if (result.target === "astro") {
    return result.astroAnalysis.practicalAstroScore;
  }
  return result.finalScore ?? result.overallScore;
}

function DashboardFrame({
  query,
  children,
}: {
  readonly query: ForecastQueryInput;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-5 min-[980px]:grid-cols-[minmax(260px,320px)_minmax(0,1fr)] min-[980px]:items-start">
      <aside className="grid min-w-0 content-start gap-4 min-[980px]:sticky min-[980px]:top-[88px]">
        <QuerySummaryPanel query={query} />
      </aside>
      <div className="grid min-w-0 gap-5">{children}</div>
    </section>
  );
}

export function ForecastDecisionLoadingState({
  target,
  context,
}: {
  readonly target: DecisionTemplateTarget;
  readonly context: DecisionProgressContext;
}) {
  const horizonLabel = decisionProgressHorizonLabel(context);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const progress =
    elapsedSeconds >= 15
      ? `已等待 ${elapsedSeconds} 秒，天气与地形仍在计算，请保持此页；失败后可直接重试，无需重新选点。`
      : "";

  if (target === "cloud_sea") {
    return (
      <DecisionLoadingTemplate
        target="cloud_sea"
        context={decisionContextFromProgressContext("cloud_sea", context)}
        loading={{
          badges: [
            { label: "云海", variant: "default" },
            { label: horizonLabel, variant: "muted" },
          ],
          title: "云海拍摄判断",
          message: "正在读取云海拍摄条件…",
          description:
            progress ||
            `${context.horizon === "7d" ? "7天分析正在汇总多日天气，耗时会更长；数据尚在加载，未判为缺失。" : ""}正在读取天气、地形、云层和光线时段。`,
        }}
        info={cloudSeaDecisionInfoCard()}
        dataCloudSeaPageMode="loading"
        dataCloudSeaLoading="shared-template"
      />
    );
  }

  return (
    <DecisionLoadingTemplate
      target="general"
      context={decisionContextFromProgressContext("general", context)}
      loading={{
        message: "正在读取天气预报…",
        description:
          progress ||
          `${context.horizon === "7d" ? "7天分析正在汇总多日天气，耗时会更长；数据尚在加载，未判为缺失。" : ""}正在读取降水、温度、风和天气风险。`,
      }}
      info={{
        title: "分析基础",
        description: "先看是否值得去，再按日期选择拍摄题材与时段。",
      }}
    />
  );
}

export function ForecastDecisionErrorState({
  target,
  query,
  message,
  code,
  onRetry,
}: {
  readonly target: DecisionTemplateTarget;
  readonly query: ForecastQueryInput;
  readonly message: string;
  readonly code?: string;
  readonly onRetry?: () => void;
}) {
  if (code === "upgrade_required") {
    return <ForecastUpgradeRequiredState query={query} message={message} />;
  }

  const horizonLabel = decisionProgressHorizonLabel(query);

  if (target === "cloud_sea") {
    return (
      <DecisionErrorTemplate
        target="cloud_sea"
        context={decisionContextFromQuery(query)}
        error={{
          badges: [
            { label: "云海", variant: "danger" },
            { label: horizonLabel, variant: "muted" },
          ],
          title: "云海拍摄判断",
          message: "云海判断生成失败",
          description: message,
          actions: (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  window.location.assign("/cloud-sea");
                }}
              >
                重新选择地点
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (onRetry) {
                    onRetry();
                    return;
                  }
                  window.location.assign(buildForecastUrlFromForecastQuery(query));
                }}
              >
                重新判断
              </Button>
            </>
          ),
        }}
        info={cloudSeaDecisionInfoCard()}
        dataCloudSeaPageMode="error"
        dataCloudSeaError="shared-template"
      />
    );
  }

  return (
    <DecisionErrorTemplate
      target="general"
      context={decisionContextFromQuery(query)}
      error={{
        message: "分析失败",
        description: message,
        actions: (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              重新分析
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.assign("/#analysis");
              }}
            >
              重新选择地点
            </Button>
          </>
        ),
      }}
      info={{
        title: "分析基础",
        description: "先看是否值得去，再按日期选择拍摄题材与时段。",
      }}
    />
  );
}

function ForecastUpgradeRequiredState({
  query,
  message,
}: {
  readonly query: ForecastQueryInput;
  readonly message: string;
}) {
  const description = message.trim() || upgradeRequiredDefaultMessage;
  const returnPath =
    query.target === "cloud_sea"
      ? "/cloud-sea"
      : query.target === "glow"
        ? "/glow"
        : query.target === "astro"
          ? "/astro"
          : "/#analysis";

  return (
    <Card
      className="grid gap-4 border-warning bg-warning/10 p-5"
      data-forecast-upgrade-required="true"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">{forecastTargetLabels[query.target]}</Badge>
        <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
        <Badge variant="muted">{query.name}</Badge>
      </div>
      <div className="grid gap-2">
        <h2 className="text-xl font-bold leading-7 text-card-foreground">{upgradeRequiredTitle}</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            window.location.assign("/pricing");
          }}
        >
          查看套餐
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            window.location.assign(returnPath);
          }}
        >
          重新选择地点
        </Button>
      </div>
    </Card>
  );
}

function decisionProgressHorizonLabel(context: DecisionProgressContext): string {
  return context.horizon ? forecastHorizonLabels[context.horizon] : "时间范围待确认";
}

function decisionContextFromProgressContext(
  target: DecisionTemplateTarget,
  context: DecisionProgressContext,
) {
  return {
    titleLabel: "地点 / 查询",
    title: context.name,
    details: [
      { label: "预报范围", value: decisionProgressHorizonLabel(context) },
      {
        label: "分析目标",
        value: target === "cloud_sea" ? "云海" : forecastTargetLabels[context.target ?? target],
      },
    ],
  };
}

function decisionContextFromQuery(query: ForecastQueryInput) {
  return decisionContextFromProgressContext(
    query.target === "cloud_sea" ? "cloud_sea" : "general",
    {
      name: query.name,
      horizon: query.horizon,
      target: query.target,
    },
  );
}

function cloudSeaDecisionInfoCard() {
  return {
    title: "云海判断基础",
    description: "集中查看云海形成条件、可拍机会、白墙风险、雨后开口和现场注意事项。",
    badge: { label: "云海 / 白墙 / 雨后开口", variant: "accent" as const },
  };
}

function QuerySummaryPanel({ query }: { readonly query: ForecastQueryInput }) {
  return (
    <Card className="grid gap-4 p-5">
      <div>
        <p className="text-xs font-bold text-primary">地点 / 查询</p>
        <h2 className="mt-2 break-words text-2xl font-bold leading-tight text-card-foreground">
          {query.name}
        </h2>
      </div>

      <dl className="grid gap-3 text-sm">
        <SummaryItem label="预报范围" value={forecastHorizonLabels[query.horizon]} />
        <SummaryItem label="分析目标" value={forecastTargetLabels[query.target]} />
      </dl>
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

export function SourceDiagnosticsPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const meteoblue = weatherProviderSummary(result, "meteoblue");
  const meteobluePartial = sourceSucceeded(meteoblue) && meteoblue?.partial === true;

  return (
    <Card className="p-5 min-[900px]:col-span-2 min-[1280px]:col-span-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-card-foreground">数据来源</h2>
        <Badge variant={dataReadinessBadgeVariant(result)}>
          置信度：{sourceConfidenceLabel(result)}
        </Badge>
      </div>
      <dl className="mt-3 grid gap-2 text-xs leading-5 text-muted-foreground min-[900px]:grid-cols-2 min-[1280px]:grid-cols-5">
        <CompactDefinition label="地点" value={result.calendarBasis.coordinateSource} />
        <CompactDefinition
          label="天气主源"
          value={publicSourceDiagnosticText(result, "qweather", "基础天气")}
        />
        <CompactDefinition
          label="云层辅助"
          value={publicSourceDiagnosticText(result, "open_meteo", "云层辅助")}
        />
        <CompactDefinition
          label="专业增强"
          value={publicSourceDiagnosticText(result, "meteoblue", "专业增强")}
        />
        <CompactDefinition label="天文" value={result.astroDataSourceLabelZh} />
      </dl>
      {meteobluePartial ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          部分字段缺失不代表服务不可用，仅表示当前数据包未返回全部辅助字段。
        </p>
      ) : null}
    </Card>
  );
}

function weatherStatusLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "已启用真实天气数据";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例天气数据";
  }
  if (result.weatherDataMode === "fallback") {
    return "已回退演示天气数据";
  }
  return "演示天气数据";
}

function weatherModeBadge(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "real") {
    return "真实数据源";
  }
  if (result.weatherDataMode === "fallback") {
    return "已回退演示";
  }
  if (result.weatherDataMode === "fixture") {
    return "样例数据";
  }
  return "演示数据";
}

function isWeatherProviderSummary(
  summary: ForecastCalculationResult["weatherSourceSummaries"][number],
): boolean {
  return (
    summary.providerCode === "qweather" ||
    summary.providerCode === "open_meteo" ||
    summary.providerCode === "meteoblue"
  );
}

function sourceSucceeded(
  summary: ForecastCalculationResult["weatherSourceSummaries"][number] | undefined,
): boolean {
  return Boolean(summary && (summary.success ?? summary.status === "available"));
}

function weatherProviderSummary(
  result: ForecastCalculationResult,
  providerCode: "qweather" | "open_meteo" | "meteoblue",
) {
  return result.weatherSourceSummaries.find((summary) => summary.providerCode === providerCode);
}

function successfulRealWeatherSources(
  result: ForecastCalculationResult,
): readonly ForecastCalculationResult["weatherSourceSummaries"][number][] {
  return result.weatherSourceSummaries.filter(
    (summary) =>
      isWeatherProviderSummary(summary) && summary.dataMode === "real" && sourceSucceeded(summary),
  );
}

function publicSourceDiagnosticText(
  result: ForecastCalculationResult,
  providerCode: "qweather" | "open_meteo" | "meteoblue",
  sourceRoleLabel: string,
): string {
  const summary = weatherProviderSummary(result, providerCode);
  if (!summary) {
    return `${sourceRoleLabel}未参与`;
  }
  if (sourceSucceeded(summary)) {
    return summary.partial ? `${sourceRoleLabel}可用，部分辅助字段缺失` : `${sourceRoleLabel}可用`;
  }
  if (!summary.attempted) {
    return `${sourceRoleLabel}未参与本次融合`;
  }

  return `${sourceRoleLabel}暂不可用：${publicSourceIssueLabel(summary.errorCategory)}`;
}

function publicSourceIssueLabel(errorCategory: string | undefined): string {
  switch (errorCategory) {
    case "invalid_key":
    case "permission":
    case "configuration":
      return "配置或权限未通过";
    case "timeout":
      return "响应超时";
    case "rate_limited":
      return "调用频率受限";
    case "network":
      return "网络连接异常";
    case "invalid_response":
      return "返回数据无法用于本次判断";
    default:
      return "未返回可用数据";
  }
}

function dataReadinessBadgeLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode !== "real") {
    return result.weatherDataMode === "fallback" ? "真实天气不可用" : "体验参考";
  }

  const sources = successfulRealWeatherSources(result);
  if (sources.length >= 2) {
    return "判断依据较完整";
  }
  if (sources.length === 1) {
    return "基础预报可用";
  }

  return "真实天气不可用";
}

function dataReadinessBadgeVariant(result: ForecastCalculationResult): "success" | "warning" {
  return result.weatherDataMode === "real" && successfulRealWeatherSources(result).length >= 2
    ? "success"
    : "warning";
}

export function providerDiagnosticText(
  result: ForecastCalculationResult,
  providerCode: "qweather" | "open_meteo" | "meteoblue",
  fallbackLabel: string,
): string {
  const summary = weatherProviderSummary(result, providerCode);
  const label = summary?.providerLabelZh ?? fallbackLabel;
  if (!summary) {
    return `${label} 未启用`;
  }
  if (sourceSucceeded(summary)) {
    if (providerCode === "meteoblue" && summary.messageZh?.includes("部分字段缺失")) {
      return "meteoblue 通过，部分字段缺失";
    }
    return `${label} 通过`;
  }
  const reason = summary.messageZh ?? summary.warningZh ?? "未返回可用数据";
  const category = summary.errorCategory ? `（${summary.errorCategory}）` : "";
  return summary.attempted ? `失败${category}：${reason}` : `未参与${category}：${reason}`;
}

function sourceConfidenceLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataMode !== "real") {
    return "低";
  }

  if (result.weatherFusionSummary?.confidenceLevel) {
    return confidenceLevelLabel(result.weatherFusionSummary.confidenceLevel);
  }

  const qweatherOk = sourceSucceeded(weatherProviderSummary(result, "qweather"));
  const openMeteoOk = sourceSucceeded(weatherProviderSummary(result, "open_meteo"));
  const meteoblueOk = sourceSucceeded(weatherProviderSummary(result, "meteoblue"));
  const hasMajorConflict = result.weatherFusionSummary?.conflictStatusZh.includes("差异") ?? false;

  if (qweatherOk && openMeteoOk && meteoblueOk && !hasMajorConflict) {
    return "高";
  }
  if (
    (qweatherOk && openMeteoOk) ||
    (qweatherOk && meteoblueOk) ||
    successfulRealWeatherSources(result).length > 0
  ) {
    return "中";
  }
  return "低";
}

function userFacingResultText(text: string): string {
  return normalizeForecastPublicCopyText(
    text
      .replace(/当前天气或地形仍包含演示数据/g, "部分辅助指标仅供体验参考")
      .replace(/地形数据：演示数据/g, "辅助指标仅供体验参考")
      .replace(/本地算法银河窗口/g, "银河窗口")
      .replace(/本地算法计算/g, "天文窗口判断")
      .replace(/本地算法/g, "天文窗口")
      .replace(/演示评分/g, "综合评分")
      .replace(/模拟评分/g, "综合评分")
      .replace(/演示数据/g, "体验参考")
      .replace(/和风天气|QWeather|Open-Meteo|meteoblue|高德地图/g, "预报信息")
      .replace(/WGS84|GCJ-02|GCJ02/g, "")
      .replace(/数据置信度/g, "判断可信度")
      .replace(/数据来源/g, "判断依据")
      .replace(/计算与数据/g, "拍摄判断"),
  );
}

function InvalidQueryCard({ message }: { readonly message?: string }) {
  return (
    <Card className="border-warning p-5">
      <h2 className="text-lg font-bold text-warning-strong">查询参数不完整</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {message ?? "请从首页选择地点和预报范围，或从专题页进入对应题材分析。"}
      </p>
    </Card>
  );
}

export function ForecastResultView({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  const viewModel = useMemo(
    () => buildForecastResultViewModel(result, query.target),
    [query.target, result],
  );

  if (
    result.weatherDataMode !== "real" ||
    result.weatherEvidenceStatus === "insufficient" ||
    result.weatherEvidenceStatus === "stale" ||
    result.weatherDataFreshness === "stale"
  ) {
    return (
      <DashboardFrame query={query}>
        <main className="grid gap-4">
          <Card className="border-warning p-5">
            <Badge variant="warning">天气证据不足</Badge>
            <h2 className="mt-3 text-xl font-bold text-card-foreground">
              当前没有足够的新鲜天气数据
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {result.weatherEvidenceReasonZh ??
                "实时天气请求失败，旧缓存不能作为当前出发或拍摄结论。"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              缓存生成时间：{formatDateTime(result.generatedAt)}
              。请稍后重试，或以权威临近预报和现场观测为准。
            </p>
          </Card>
        </main>
      </DashboardFrame>
    );
  }

  if (viewModel.target === "general") {
    return <ComprehensiveForecastView query={query} result={result} viewModel={viewModel} />;
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
        <Card className="grid gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-primary">{viewModel.targetLabel}</p>
              <h2 className="mt-2 text-2xl font-bold leading-tight text-card-foreground">
                {viewModel.recommendationLabel}
              </h2>
            </div>
            <Badge variant={dataReadinessBadgeVariant(result)}>
              {dataReadinessBadgeLabel(result)}
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
  returnUrl,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: CloudSeaForecastViewModel;
  readonly returnUrl?: string;
}) {
  return (
    <SubjectDecisionReportView
      query={query}
      result={result}
      report={buildCloudSeaDecisionReport(result, viewModel)}
      returnUrl={returnUrl}
    />
  );
}

function ExpandChevron({ expanded }: { readonly expanded: boolean }) {
  return (
    <svg
      className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
    <SubjectDecisionReportView
      query={query}
      result={result}
      report={buildGlowDecisionReport(result, viewModel)}
    />
  );
}

export function AstroResultPage({
  query,
  result,
  viewModel,
  initialNightDate,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: AstroForecastViewModel;
  readonly initialNightDate?: string;
}) {
  return (
    <SubjectDecisionReportView
      query={query}
      result={result}
      report={buildAstroDecisionReport(result, viewModel, initialNightDate)}
    />
  );
}

function buildForecastUrlFromForecastQuery(query: ForecastQueryInput): string {
  const params = new URLSearchParams({
    name: query.name,
    source: query.source,
    lat: String(query.latitudeGcj02 ?? query.latitudeWgs84),
    lng: String(query.longitudeGcj02 ?? query.longitudeWgs84),
    latGcj02: String(query.latitudeGcj02 ?? query.latitudeWgs84),
    lngGcj02: String(query.longitudeGcj02 ?? query.longitudeWgs84),
    latWgs84: String(query.latitudeWgs84),
    lngWgs84: String(query.longitudeWgs84),
    latitudeWgs84: String(query.latitudeWgs84),
    longitudeWgs84: String(query.longitudeWgs84),
    horizon: query.horizon,
    target: query.target,
  });

  setOptionalForecastQueryParam(params, "coordinateSource", query.coordinateSource);
  setOptionalForecastQueryParam(params, "timezone", query.timezone);
  setOptionalForecastQueryParam(params, "elevationMeters", query.elevationMeters);
  setOptionalForecastQueryParam(params, "elevationSource", query.elevationSource);
  setOptionalForecastQueryParam(params, "elevationConfidence", query.elevationConfidence);
  setOptionalForecastQueryParam(params, "locationId", query.locationId);
  setOptionalForecastQueryParam(params, "photoSpotId", query.photoSpotId);

  return `/forecast?${params.toString()}`;
}

function setOptionalForecastQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | number | null | undefined,
) {
  if (value === undefined || value === null) {
    return;
  }
  const normalized = String(value).trim();
  if (normalized.length > 0) {
    params.set(key, normalized);
  }
}

function _cloudSeaTerrainSummary(
  result: ForecastCalculationResult,
  terrainContext: CloudSeaTerrainContext,
): string {
  const terrainDisplay = buildTerrainDisplayModel(result);
  if (
    terrainContext.shouldDowngradeCloudSeaWording ||
    terrainContext.elevationMeters === undefined
  ) {
    return terrainContext.terrainNoteZh;
  }
  return terrainDisplay.cloudSeaNoteZh;
}

type ProfessionalHourlyFilterMode = "all" | "cloudSea" | "morning" | "rain" | "risk";
export type ProfessionalHourlyRow = NonNullable<
  ForecastCalculationResult["professionalHourlyData"]
>[number];
type CloudSeaAnalysisWindowLike = CloudSeaProfessionalHourlyWindow;

type ProfessionalHourlyFilterDefinition = {
  readonly mode: ProfessionalHourlyFilterMode;
  readonly label: string;
};

export type ProfessionalHourlySectionTarget = "general" | "cloud_sea" | "glow" | "astro";
type ProfessionalHourlySectionVariant = "card" | "embedded";

type ProfessionalHourlySectionConfig = {
  readonly sectionTitle?: string;
  readonly sectionBadge?: string;
  readonly sectionDescription?: string;
  readonly usageText?: string;
  readonly signalColumnLabel?: string;
  readonly signalColumnDescription?: string;
  readonly focusFilterLabel?: string;
  readonly allFilterLabel?: string;
  readonly riskFilterLabel?: string;
  readonly defaultFilterMode?: ProfessionalHourlyFilterMode;
  readonly ordinarySignalLabel?: string;
  readonly initiallyExpanded?: boolean;
  readonly expandButtonLabel?: string;
  readonly collapseButtonLabel?: string;
  readonly previewTitle?: string;
  readonly showCoverageNote?: boolean;
  readonly showCollapsedPreview?: boolean;
  readonly showMorningFilter?: boolean;
  readonly showRainFilter?: boolean;
  readonly previewRowLimit?: number;
  readonly focusPaddingHours?: number;
  readonly showBasisSummary?: boolean;
  readonly showEmbeddedLeadDescription?: boolean;
  readonly rainFilterLabel?: string;
  readonly showFocusFilter?: boolean;
  readonly showSignalColumn?: boolean;
  readonly showWeatherColumn?: boolean;
  readonly showCloudColumns?: boolean;
  readonly showTemperatureColumns?: boolean;
  readonly showDewPointColumns?: boolean;
  readonly showHumidityColumn?: boolean;
  readonly showVisibilityColumn?: boolean;
  readonly showWindColumns?: boolean;
  readonly precipitationColumnLabel?: string;
  readonly showPrecipitationColumns?: boolean;
  readonly compactTable?: boolean;
  readonly cardClassName?: string;
};

type ProfessionalHourlyCloudSectionProps = {
  readonly onSelectTime?: (time: string) => void;
  readonly selectedDate?: string;
  readonly selectedTime?: string;
  readonly target: ProfessionalHourlySectionTarget;
  readonly data: ProfessionalHourlyDisplayData;
  readonly terrainContext?: CloudSeaTerrainContext;
  readonly config?: ProfessionalHourlySectionConfig;
  readonly variant?: ProfessionalHourlySectionVariant;
};

function professionalHourlyFiltersForContext(
  terrainContext: CloudSeaTerrainContext | undefined,
  config: ProfessionalHourlySectionConfig | undefined,
): readonly ProfessionalHourlyFilterDefinition[] {
  return [
    { mode: "all", label: config?.allFilterLabel ?? "全部小时" },
    ...(config?.showFocusFilter === false
      ? []
      : ([
          {
            mode: "cloudSea",
            label:
              config?.focusFilterLabel ??
              terrainContext?.vocabulary.professionalCloudSeaFilterLabel ??
              "只看重点窗口",
          },
        ] as const)),
    ...(config?.showMorningFilter === false
      ? []
      : ([{ mode: "morning", label: "只看清晨窗口" }] as const)),
    ...(config?.showRainFilter
      ? ([{ mode: "rain", label: config?.rainFilterLabel ?? "只看降水时段" }] as const)
      : []),
    { mode: "risk", label: config?.riskFilterLabel ?? "只看有风险时段" },
  ];
}

function isValidProfessionalHourlyTimeBasis(
  basis: CloudSeaProfessionalHourlyDisplayData["timeBasis"],
): basis is NonNullable<CloudSeaProfessionalHourlyDisplayData["timeBasis"]> {
  if (
    !basis?.startTime ||
    !basis.endTime ||
    !basis.timezone ||
    !Number.isFinite(basis.stepMinutes) ||
    basis.stepMinutes <= 0
  ) {
    return false;
  }

  const startTimestamp = Date.parse(basis.startTime);
  const endTimestamp = Date.parse(basis.endTime);

  return (
    Number.isFinite(startTimestamp) &&
    Number.isFinite(endTimestamp) &&
    endTimestamp > startTimestamp
  );
}

export function CloudSeaProfessionalHourlyDataPanel({
  target = "cloud_sea",
  data,
  terrainContext,
  config,
  variant = "card",
  selectedDate,
  selectedTime,
  onSelectTime,
}: {
  readonly onSelectTime?: (time: string) => void;
  readonly selectedDate?: string;
  readonly selectedTime?: string;
  readonly target?: ProfessionalHourlySectionTarget;
  readonly data: ProfessionalHourlyDisplayData;
  readonly terrainContext?: CloudSeaTerrainContext;
  readonly config?: ProfessionalHourlySectionConfig;
  readonly variant?: ProfessionalHourlySectionVariant;
}) {
  if (!isValidProfessionalHourlyTimeBasis(data.timeBasis)) {
    return null;
  }
  return (
    <div
      className="CloudSeaProfessionalHourlyDataPanel min-w-0 max-w-full"
      data-professional-hourly-table-layout="mobile-scroll-safe"
    >
      <ProfessionalHourlyCloudSection
        target={target}
        data={data}
        terrainContext={terrainContext}
        config={config}
        variant={variant}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        onSelectTime={onSelectTime}
      />
    </div>
  );
}

function professionalHourlyDateHeaderClassName(): string {
  return "hidden sm:table-cell professional-time sticky left-0 z-20 w-[4.5rem] min-w-[4.5rem] text-left";
}

function professionalHourlyDateCellClassName(_rowBackgroundClassName: string): string {
  return "hidden sm:table-cell professional-time sticky left-0 z-10 w-[4.5rem] min-w-[4.5rem] font-semibold text-card-foreground";
}

function professionalHourlyTimeCellClassName(): string {
  return "professional-time sticky left-0 sm:left-[4.5rem] z-10 w-[5rem] min-w-[5rem] font-semibold text-card-foreground shadow-[2px_0_0_var(--border)]";
}

function professionalHourlyRowBackgroundClassName(
  rowIndex: number,
  tone: ProfessionalHourlyRowAnnotation["tone"] | undefined,
): string {
  if (tone === "success") return "professional-row professional-row-success";
  if (tone === "warning" || tone === "danger") return "professional-row professional-row-warning";
  return rowIndex % 2 === 0 ? "professional-row" : "professional-row professional-row-alternate";
}

function ProfessionalHourlyCloudSection({
  target,
  data,
  terrainContext,
  config: sourceConfig,
  selectedDate,
  selectedTime,
  onSelectTime,
  variant = "card",
}: ProfessionalHourlyCloudSectionProps) {
  const [matrixMode, setMatrixMode] = useState(true);
  const [columnGroup, setColumnGroup] = useState<HourlyColumnGroup>(
    target === "general" ? "common" : "all",
  );
  const config = useMemo(
    () => ({
      ...sourceConfig,
      ...hourlyColumnVisibility(columnGroup, sourceConfig),
      showWeatherColumn: target !== "general" || columnGroup === "all" || columnGroup === "common",
    }),
    [sourceConfig, columnGroup, target],
  );
  const rows = data.rows;
  const basis = data.timeBasis;
  const embedded = variant === "embedded";
  const [expanded, setExpanded] = useState(config?.initiallyExpanded ?? true);
  const [filterMode, setFilterMode] = useState<ProfessionalHourlyFilterMode>(() => "all");

  useEffect(() => {
    setExpanded(config?.initiallyExpanded ?? true);
  }, [sourceConfig]);

  useEffect(() => {
    setFilterMode("all");
  }, [sourceConfig, data]);

  const [localDate, setLocalDate] = useState("all");
  const dateOptions = weatherDates(rows, basis?.timezone ?? "Asia/Shanghai");
  const activeDate = selectedDate ?? localDate;
  const filteredRows = useMemo(
    () =>
      weatherRowsForDate(
        filterProfessionalHourlyRows(rows, data, filterMode, config?.focusPaddingHours ?? 3),
        activeDate,
        basis?.timezone ?? "Asia/Shanghai",
      ),
    [config?.focusPaddingHours, data, filterMode, rows, activeDate, basis?.timezone],
  );
  const rowAnnotations = useMemo(
    () => new Map((data.rowAnnotations ?? []).map((item) => [item.rowTime, item])),
    [data.rowAnnotations],
  );

  if (!isValidProfessionalHourlyTimeBasis(basis) || rows.length === 0) {
    return null;
  }

  const timeStepLabel = basis.stepMinutes === 60 ? "逐小时" : `${basis.stepMinutes} 分钟`;
  const professionalHourlyFilters = professionalHourlyFiltersForContext(terrainContext, config);
  const activeFilterLabel =
    professionalHourlyFilters.find((filter) => filter.mode === filterMode)?.label ?? "全部小时";
  const sectionTitle = config?.sectionTitle ?? "专业小时数据";
  const sectionBadge = config?.sectionBadge ?? "专业参考";
  const sectionDescription =
    config?.sectionDescription ??
    terrainContext?.vocabulary.professionalDescription ??
    "逐小时展示云层、湿度、露点、降水、能见度和风。";
  const professionalUsageText =
    config?.usageText ??
    terrainContext?.vocabulary.professionalUsageText ??
    "逐小时数据使用同一标准化口径，重点复核窗口附近变化。";
  const signalColumnLabel =
    config?.signalColumnLabel ?? terrainContext?.vocabulary.professionalSignalColumnLabel ?? "信号";
  const cloudLayerCompleteness = data.cloudLayerCompleteness;
  const cloudBasisConsistency = data.cloudBasisConsistency;
  const missingHeaderNote = professionalHourlyMissingHeaderNote(
    rows,
    basis,
    cloudLayerCompleteness,
    cloudBasisConsistency,
  );
  const incompleteFieldNote = professionalHourlyIncompleteFieldNote(
    rows,
    basis,
    cloudLayerCompleteness,
    cloudBasisConsistency,
  );
  const coverageNote = basis.professionalCoverageNoteZh ?? basis.userFacingCoverageNoteZh;
  const temperatureColumnLabels = professionalTemperatureColumnLabels(rows, basis);
  const showRawTemperatureColumn = temperatureColumnLabels.length > 1;
  const expectedRowCount = basis.expectedRowCount ?? basis.requestedHours ?? rows.length;
  const coverageComplete = rows.length >= expectedRowCount;
  const targetRangeLabel = `${formatFullDateTimeForTimezone(
    basis.anchorStartLocal ?? basis.startTime,
    basis.timezone,
  )} - ${formatFullDateTimeForTimezone(basis.anchorEndLocal ?? basis.endTime, basis.timezone)}`;
  const actualRangeLabel = `${formatFullDateTimeForTimezone(
    rows[0]?.time ?? basis.startTime,
    basis.timezone,
  )} - ${formatFullDateTimeForTimezone(rows.at(-1)?.time ?? basis.endTime, basis.timezone)}`;
  const showHourlyToggleHeader = !embedded || config?.initiallyExpanded === false;
  const showCoverageNote = target !== "astro" && (config?.showCoverageNote ?? true);
  const coverageNeedsAttention =
    !coverageComplete ||
    basis.partialData ||
    cloudLayerCompleteness.layerCompletenessLevel !== "complete" ||
    cloudBasisConsistency.cloudBasisLevel === "mixed_basis";
  const showCollapsedPreview = target !== "astro" && (config?.showCollapsedPreview ?? true);
  const previewRowLimit = Math.max(1, config?.previewRowLimit ?? 4);
  const hourlyTableHeaders = [
    "日期",
    "时间",
    ...(config.showWeatherColumn === false ? [] : ["天气"]),
    ...(config?.showSignalColumn === false ? [] : [signalColumnLabel]),
    ...(config?.showCloudColumns === false ? [] : ["总云量 %", "高云量 %", "中云量 %", "低云量 %"]),
    ...(config?.showTemperatureColumns === false ? [] : [...temperatureColumnLabels]),
    ...(config?.showDewPointColumns === false ? [] : ["露点 °C", "露点差 °C"]),
    ...(config?.showHumidityColumn === false ? [] : ["湿度 %"]),
    ...(config.showPrecipitationColumns === false ? [] : ["降水 mm", "降水概率 %"]),
    ...(config?.showVisibilityColumn === false ? [] : ["能见度 km"]),
    ...(config?.showWindColumns === false ? [] : ["风速 m/s", "阵风 m/s", "风向"]),
  ];

  const content = (
    <>
      {showHourlyToggleHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {embedded ? (
                <h3 className="text-sm font-bold text-card-foreground">{sectionTitle}</h3>
              ) : (
                <h2 className="text-lg font-bold text-card-foreground">{sectionTitle}</h2>
              )}
              <Badge variant="accent">{sectionBadge}</Badge>
            </div>
          </div>
          {target !== "general" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-expanded={expanded}
              data-professional-hourly-toggle="true"
              onClick={() => {
                setExpanded((current) => !current);
              }}
            >
              {expanded
                ? config?.collapseButtonLabel ?? "收起小时表"
                : config?.expandButtonLabel ?? "展开小时表"}
              <ExpandChevron expanded={expanded} />
            </Button>
          ) : null}
        </div>
      ) : config?.showEmbeddedLeadDescription === false ? null : (
        <p className="text-xs leading-5 text-muted-foreground">{sectionDescription}</p>
      )}

      {selectedDate === undefined && dateOptions.length > 1 ? (
        <div className="mt-3">
          <WeatherDateSelector dates={dateOptions} value={localDate} onChange={setLocalDate} />
        </div>
      ) : null}
      {!expanded && showCollapsedPreview ? (
        <CloudSeaHourlyFocusPreview
          target={target}
          rows={filteredRows.slice(0, previewRowLimit)}
          timezone={basis.timezone}
          rowAnnotations={rowAnnotations}
          ordinarySignalLabel={config?.ordinarySignalLabel}
          title={config?.previewTitle}
        />
      ) : null}

      {!coverageComplete || basis.partialData ? (
        <p className="text-xs text-warning-strong">
          预报覆盖不完整：{rows.length}/{expectedRowCount} 时次，缺测不等于无风险。
        </p>
      ) : null}
      {expanded ? (
        <div
          className="mt-2 grid min-w-0 max-w-full gap-3"
          data-professional-hourly-expanded={expanded ? "true" : "false"}
        >
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-primary">
              指标设置 · {hourlyColumnGroups.find((group) => group.value === columnGroup)?.label} ·{" "}
              {matrixMode ? "天气矩阵" : "纵向列表"}
            </summary>
            <div className="mt-3 grid gap-3">
              <label className="flex items-center gap-2 text-sm">
                阅读方式{" "}
                <select
                  aria-label="阅读方式"
                  className="rounded border border-border bg-card p-2"
                  value={matrixMode ? "matrix" : "list"}
                  onChange={(event) => setMatrixMode(event.target.value === "matrix")}
                >
                  <option value="matrix">天气矩阵</option>
                  <option value="list">纵向列表</option>
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2" role="group" aria-label="专业小时数据筛选">
                  {professionalHourlyFilters.map((filter) => (
                    <button
                      key={filter.mode}
                      type="button"
                      className={cn(
                        "min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold transition",
                        filterMode === filter.mode
                          ? "border-primary bg-secondary text-secondary-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground",
                      )}
                      aria-pressed={filterMode === filter.mode}
                      onClick={() => {
                        setFilterMode(filter.mode);
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                当前筛选：{activeFilterLabel}，显示 {filteredRows.length} 个时次；覆盖 {rows.length}{" "}
                / {expectedRowCount} 小时。{professionalUsageText}
              </p>

              {!sourceConfig?.compactTable ? (
                <div role="group" aria-label="专业数据指标分组" className="flex flex-wrap gap-2">
                  {hourlyColumnGroups.map((group) => (
                    <button
                      key={group.value}
                      type="button"
                      aria-pressed={columnGroup === group.value}
                      onClick={() => setColumnGroup(group.value)}
                      className={cn(
                        "min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold",
                        columnGroup === group.value
                          ? "border-primary bg-secondary text-secondary-foreground"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {group.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                单位见表头；蓝色深浅只表示云量大小。— 表示缺失。
              </p>
            </div>
          </details>
          {matrixMode ? (
            <HourlyWeatherMatrix
              rows={filteredRows}
              timezone={basis.timezone}
              config={config}
              temperatureLabel={temperatureColumnLabels.at(-1) ?? "气温 °C"}
              showRawTemperature={showRawTemperatureColumn}
              selectedTime={selectedTime}
              onSelectTime={onSelectTime}
              annotations={
                new Map(
                  filteredRows.map((row) => {
                    const annotation = rowAnnotations.get(row.time);
                    const signal = professionalHourlySignalDisplayForTarget(
                      target,
                      professionalHourlyDisplaySignal(row),
                      { annotation, ordinarySignalLabel: config?.ordinarySignalLabel },
                    );
                    return [
                      row.time,
                      {
                        label: annotation?.badges?.length
                          ? annotation.badges.map((badge) => badge.label).join(" / ")
                          : signal.label,
                        tone: annotation?.tone,
                      },
                    ];
                  }),
                )
              }
            />
          ) : null}
          <div hidden={matrixMode}>
            <StickyDataScroller>
              <table
                className={cn(
                  "border-separate border-spacing-0 text-left text-[13px] leading-5",
                  target === "general" && (columnGroup === "rain" || columnGroup === "wind")
                    ? "mx-auto w-full max-w-max min-w-[300px]"
                    : config?.compactTable || columnGroup !== "all"
                      ? "mx-auto w-full max-w-max min-w-[560px]"
                      : "w-full min-w-[1280px]",
                )}
                data-professional-hourly-table-layout={
                  config?.compactTable ? "rain-focused" : "mobile-scroll-safe"
                }
              >
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    {hourlyTableHeaders.map((label, index) => (
                      <th
                        key={label}
                        scope="col"
                        className={cn(
                          "whitespace-nowrap border-b border-border px-2 py-2 font-semibold",
                          index === 0 && professionalHourlyDateHeaderClassName(),
                          index === 1 &&
                            "professional-time sticky left-0 sm:left-[4.5rem] z-20 w-[5rem] min-w-[5rem] shadow-[2px_0_0_var(--border)]",
                          index > (config?.showSignalColumn === false ? 2 : 3) && "text-right",
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length > 0 ? (
                    filteredRows.map((row, rowIndex) => (
                      <CloudSeaProfessionalHourlyRow
                        key={row.time}
                        target={target}
                        row={row}
                        rowIndex={rowIndex}
                        selected={row.time === selectedTime}
                        timezone={basis.timezone}
                        annotation={rowAnnotations.get(row.time)}
                        ordinarySignalLabel={config?.ordinarySignalLabel}
                        cloudBasisRowNote={cloudBasisConsistency.rowNotesByHour?.[row.time]}
                        showRawTemperatureColumn={showRawTemperatureColumn}
                        config={config}
                      />
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={hourlyTableHeaders.length}
                        className="border-t border-border px-3 py-4 text-center text-sm text-muted-foreground"
                      >
                        当前筛选下暂无小时数据，请切换上方筛选复核完整预报。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </StickyDataScroller>
          </div>
        </div>
      ) : null}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">
          数据说明 · {rows.length}/{expectedRowCount} 时次
          {coverageNeedsAttention ? " · 部分指标需复核" : ""}
        </summary>
        <div className="pb-3">
          {" "}
          {config?.showBasisSummary !== false ? (
            <div className="text-xs leading-5 text-muted-foreground">
              <p className="font-semibold">
                数据口径与覆盖 · {rows.length} / {expectedRowCount} 小时 · {timeStepLabel} ·{" "}
                {basis.timezone}
              </p>
              <dl className="mt-3 grid gap-3 min-[760px]:grid-cols-4">
                <CompactDefinition label="目标有效时间" value={targetRangeLabel} />
                <CompactDefinition
                  label="覆盖率"
                  value={`${rows.length} / ${expectedRowCount} 小时`}
                />
                {!coverageComplete ? (
                  <CompactDefinition label="实际显示" value={actualRangeLabel} />
                ) : null}
                <CompactDefinition
                  label="有效时间"
                  value={`${formatFullDateTimeForTimezone(
                    basis.startTime,
                    basis.timezone,
                  )} – ${formatFullDateTimeForTimezone(basis.endTime, basis.timezone)}`}
                />
                <CompactDefinition label="时间步长" value={timeStepLabel} />
                <CompactDefinition label="时区" value={basis.timezone} />
                <CompactDefinition
                  label="温度口径"
                  value={professionalTemperatureBasisLabel(basis.temperatureBasis)}
                />
                <CompactDefinition
                  label="云量口径"
                  value={professionalCloudBasisLabel(cloudBasisConsistency, cloudLayerCompleteness)}
                />
                {basis.fieldCoverageSummary ? (
                  <CompactDefinition
                    label="分层覆盖"
                    value={professionalCloudCoverageLabel(basis.fieldCoverageSummary)}
                  />
                ) : null}
                {missingHeaderNote ? (
                  <CompactDefinition label="缺失说明" value={missingHeaderNote} />
                ) : null}
                {showCoverageNote && coverageNote && !coverageNeedsAttention ? (
                  <p className="min-[760px]:col-span-4" data-testid="cloud-layer-coverage-note">
                    {coverageNote}
                  </p>
                ) : null}
              </dl>
            </div>
          ) : null}
          {missingHeaderNote ? (
            <p className="mt-3 text-xs leading-5 text-warning-strong">{missingHeaderNote}</p>
          ) : null}
          {showCoverageNote &&
          coverageNeedsAttention &&
          coverageNote &&
          coverageNote !== missingHeaderNote &&
          coverageNote !== incompleteFieldNote ? (
            <p
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-xs leading-5 text-muted-foreground",
                cloudLayerCompleteness.layerCompletenessLevel === "complete"
                  ? "border-border bg-muted"
                  : "border-warning/40 bg-accent/10",
              )}
              data-testid="cloud-layer-coverage-note"
            >
              {coverageNote}
            </p>
          ) : null}
          {incompleteFieldNote && incompleteFieldNote !== missingHeaderNote ? (
            <p className="mt-3 rounded-lg border border-warning/40 bg-accent/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {incompleteFieldNote}
            </p>
          ) : null}
        </div>
      </details>
    </>
  );

  if (embedded) {
    return (
      <section
        className={cn(
          "ProfessionalHourlyCloudSection grid min-w-0 max-w-full gap-3",
          target === "cloud_sea" &&
            "CloudSeaProfessionalHourlyData cloud-sea-professional-hourly-data",
        )}
        data-cloud-sea-section={
          target === "cloud_sea" ? "CloudSeaProfessionalHourlyData" : undefined
        }
        data-glow-section={target === "glow" ? "ProfessionalHourlyCloudSection" : undefined}
        data-astro-section={target === "astro" ? "ProfessionalHourlyCloudSection" : undefined}
        data-general-section={target === "general" ? "GeneralHourlyWeatherSection" : undefined}
        data-professional-hourly-shared="true"
        data-professional-hourly-target={target}
        data-professional-hourly-default-expanded={
          config?.initiallyExpanded === false ? "false" : "true"
        }
        data-professional-hourly-expanded={expanded ? "true" : "false"}
        data-general-professional-hourly-expanded={
          target === "general" ? (expanded ? "true" : "false") : undefined
        }
        data-professional-hourly-variant="embedded"
        data-testid="professional-hourly-data"
      >
        {content}
      </section>
    );
  }

  return (
    <Card
      className={cn(
        "ProfessionalHourlyCloudSection min-w-0 max-w-full p-3 sm:p-4",
        config?.cardClassName,
        target === "cloud_sea" &&
          "CloudSeaProfessionalHourlyData cloud-sea-professional-hourly-data",
        target === "glow" && "glow-professional-hourly-cloud-section",
      )}
      data-cloud-sea-section={target === "cloud_sea" ? "CloudSeaProfessionalHourlyData" : undefined}
      data-glow-section={target === "glow" ? "ProfessionalHourlyCloudSection" : undefined}
      data-astro-section={target === "astro" ? "ProfessionalHourlyCloudSection" : undefined}
      data-general-section={target === "general" ? "GeneralHourlyWeatherSection" : undefined}
      data-professional-hourly-shared="true"
      data-professional-hourly-target={target}
      data-professional-hourly-default-expanded={
        config?.initiallyExpanded === false ? "false" : "true"
      }
      data-professional-hourly-expanded={expanded ? "true" : "false"}
      data-general-professional-hourly-expanded={
        target === "general" ? (expanded ? "true" : "false") : undefined
      }
      data-professional-hourly-variant="card"
      data-testid="professional-hourly-data"
    >
      {content}
    </Card>
  );
}

function professionalHourlyAnnotationBadgeVariant(
  tone: ProfessionalHourlyRowAnnotation["tone"],
): BadgeVariant {
  if (tone === "success") {
    return "default";
  }
  if (tone === "warning") {
    return "warning";
  }
  if (tone === "danger") {
    return "danger";
  }
  if (tone === "info") {
    return "info";
  }
  return "muted";
}

type ProfessionalHourlySignalDisplay = {
  readonly label: string;
  readonly badgeVariant: BadgeVariant;
};

const astroProfessionalHourlySignalDisplayBySignal = {
  霞光参考: { label: "云层偏多", badgeVariant: "warning" },
  云层纹理: { label: "云层参考", badgeVariant: "info" },
  可拍窗口: { label: "夜拍窗口", badgeVariant: "default" },
  形成信号: { label: "夜拍参考", badgeVariant: "info" },
  雨后开口: { label: "开口需复核", badgeVariant: "warning" },
  白墙风险: { label: "低云/雾风险", badgeVariant: "danger" },
  需复核: { label: "需复核", badgeVariant: "warning" },
  普通: { label: "普通", badgeVariant: "muted" },
} satisfies Record<ProfessionalHourlyRow["cloudSeaSignal"], ProfessionalHourlySignalDisplay>;

const cloudSeaProfessionalHourlySignalDisplayBySignal = {
  霞光参考: { label: "普通", badgeVariant: "muted" },
  云层纹理: { label: "普通", badgeVariant: "muted" },
  可拍窗口: { label: "云海信号", badgeVariant: "default" },
  形成信号: { label: "形成信号", badgeVariant: "info" },
  雨后开口: { label: "雨后开口", badgeVariant: "accent" },
  白墙风险: { label: "白墙风险", badgeVariant: "danger" },
  需复核: { label: "需复核", badgeVariant: "warning" },
  普通: { label: "普通", badgeVariant: "muted" },
} satisfies Record<ProfessionalHourlyRow["cloudSeaSignal"], ProfessionalHourlySignalDisplay>;

const generalProfessionalHourlySignalDisplayBySignal = {
  霞光参考: { label: "云层参考", badgeVariant: "info" },
  云层纹理: { label: "云层参考", badgeVariant: "info" },
  可拍窗口: { label: "天气窗口", badgeVariant: "default" },
  形成信号: { label: "天气参考", badgeVariant: "info" },
  雨后开口: { label: "雨后开口", badgeVariant: "accent" },
  白墙风险: { label: "低云/雾风险", badgeVariant: "danger" },
  需复核: { label: "需复核", badgeVariant: "warning" },
  普通: { label: "普通时段", badgeVariant: "muted" },
} satisfies Record<ProfessionalHourlyRow["cloudSeaSignal"], ProfessionalHourlySignalDisplay>;

export function professionalHourlySignalDisplayForTarget(
  target: ProfessionalHourlySectionTarget,
  signal: ProfessionalHourlyRow["cloudSeaSignal"],
  {
    annotation,
    ordinarySignalLabel,
  }: {
    readonly annotation?: Pick<ProfessionalHourlyRowAnnotation, "label" | "tone">;
    readonly ordinarySignalLabel?: string;
  } = {},
): ProfessionalHourlySignalDisplay {
  if (annotation?.label !== undefined) {
    return {
      label: annotation.label,
      badgeVariant: annotation.tone
        ? professionalHourlyAnnotationBadgeVariant(annotation.tone)
        : ordinarySignalLabel
          ? "muted"
          : professionalSignalBadgeVariantForTarget(target, signal),
    };
  }

  if (ordinarySignalLabel && signal === "普通") {
    return { label: ordinarySignalLabel, badgeVariant: "muted" };
  }

  if (target === "cloud_sea") {
    return cloudSeaProfessionalHourlySignalDisplayBySignal[signal];
  }

  if (target === "astro") {
    return astroProfessionalHourlySignalDisplayBySignal[signal];
  }

  if (target === "general") {
    return generalProfessionalHourlySignalDisplayBySignal[signal];
  }

  return { label: signal, badgeVariant: professionalSignalBadgeVariant(signal) };
}

function CloudSeaProfessionalHourlyRow({
  selected,
  target,
  row,
  rowIndex,
  timezone,
  annotation,
  ordinarySignalLabel,
  cloudBasisRowNote,
  showRawTemperatureColumn,
  config,
}: {
  readonly selected?: boolean;
  readonly target: ProfessionalHourlySectionTarget;
  readonly row: ProfessionalHourlyRow;
  readonly rowIndex: number;
  readonly timezone: string;
  readonly annotation?: ProfessionalHourlyRowAnnotation;
  readonly ordinarySignalLabel?: string;
  readonly cloudBasisRowNote?: string;
  readonly showRawTemperatureColumn: boolean;
  readonly config?: ProfessionalHourlySectionConfig;
}) {
  const signal = professionalHourlyDisplaySignal(row);
  const signalDisplay = professionalHourlySignalDisplayForTarget(target, signal, {
    annotation,
    ordinarySignalLabel,
  });
  const signalBadges = annotation?.badges?.length
    ? annotation.badges.map((badge) => ({
        label: badge.label,
        badgeVariant: badge.tone
          ? professionalHourlyAnnotationBadgeVariant(badge.tone)
          : signalDisplay.badgeVariant,
      }))
    : [signalDisplay];
  const weatherText = providerNeutralProfessionalWeatherText(row.weatherText) ?? "—";
  const weatherGlyph = weatherGlyphForProfessionalHour(row, weatherText);
  const rowBackgroundClassName = professionalHourlyRowBackgroundClassName(
    rowIndex,
    selected ? "success" : target === "general" ? undefined : annotation?.tone,
  );

  return (
    <tr
      className={rowBackgroundClassName}
      data-professional-hourly-row={row.time}
      data-professional-hourly-row-annotation={annotation?.label}
      data-professional-hourly-row-emphasis={annotation?.tone}
    >
      <ProfessionalHourlyCell
        cell="date"
        className={professionalHourlyDateCellClassName(rowBackgroundClassName)}
      >
        {row.dateLabel || formatProfessionalDate(row.time, timezone)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="time" className={professionalHourlyTimeCellClassName()}>
        <span className="block text-[11px] text-muted-foreground sm:hidden">
          {row.dateLabel || formatProfessionalDate(row.time, timezone)}
        </span>
        {row.timeLabel || formatProfessionalTime(row.time, timezone)}
      </ProfessionalHourlyCell>
      {config?.showWeatherColumn === false ? null : (
        <ProfessionalHourlyCell cell="weather">
          <span className="inline-flex items-center gap-1.5">
            {weatherGlyph ? (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[11px] font-bold text-primary">
                {weatherGlyph}
              </span>
            ) : null}
            <span>{weatherText}</span>
          </span>
        </ProfessionalHourlyCell>
      )}
      {config?.showSignalColumn === false ? null : (
        <ProfessionalHourlyCell cell="signal">
          <span className="flex max-w-[15rem] flex-wrap gap-1">
            {signalBadges.map((badge) => (
              <Badge key={badge.label} variant={badge.badgeVariant}>
                {badge.label}
              </Badge>
            ))}
          </span>
        </ProfessionalHourlyCell>
      )}
      {config?.showCloudColumns === false ? null : (
        <>
          <ProfessionalHourlyCell cell="cloud-total" cloudAmount={row.cloudTotalPercent}>
            <ProfessionalCloudValue
              value={hourlyTableNumber(row.cloudTotalPercent, 0)}
              note={cloudBasisRowNote}
            />
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="cloud-high" cloudAmount={row.cloudHighPercent}>
            {hourlyTableNumber(row.cloudHighPercent, 0)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="cloud-mid" cloudAmount={row.cloudMidPercent}>
            {hourlyTableNumber(row.cloudMidPercent, 0)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="cloud-low" cloudAmount={row.cloudLowPercent}>
            {hourlyTableNumber(row.cloudLowPercent, 0)}
          </ProfessionalHourlyCell>
        </>
      )}
      {showRawTemperatureColumn && config?.showTemperatureColumns !== false ? (
        <ProfessionalHourlyCell cell="raw-temperature" dataBasis="raw_grid">
          {hourlyTableNumber(row.rawTemperatureC)}
        </ProfessionalHourlyCell>
      ) : null}
      {config?.showTemperatureColumns === false ? null : (
        <ProfessionalHourlyCell cell="temperature" dataBasis={row.temperatureBasis}>
          {hourlyTableNumber(row.displayedTemperatureC)}
        </ProfessionalHourlyCell>
      )}
      {config?.showDewPointColumns === false ? null : (
        <>
          <ProfessionalHourlyCell cell="dew-point">
            {hourlyTableNumber(row.dewPointC)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="dew-point-spread">
            {hourlyTableNumber(row.dewPointSpreadC)}
          </ProfessionalHourlyCell>
        </>
      )}
      {config?.showHumidityColumn === false ? null : (
        <ProfessionalHourlyCell cell="humidity">
          {hourlyTableNumber(row.relativeHumidityPercent, 0)}
        </ProfessionalHourlyCell>
      )}
      {config?.showPrecipitationColumns === false ? null : (
        <>
          <ProfessionalHourlyCell cell="precipitation">
            {hourlyTableNumber(row.precipitationAmountMm, 2)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="precipitation-probability">
            {hourlyTableNumber(row.precipitationProbabilityPercent, 0)}
          </ProfessionalHourlyCell>
        </>
      )}
      {config?.showVisibilityColumn === false ? null : (
        <ProfessionalHourlyCell
          cell="visibility"
          className={professionalHourlyToneClass(row.visibilityMeters, "visibility")}
        >
          {hourlyTableNumber(
            isFiniteNumber(row.visibilityMeters) ? row.visibilityMeters / 1000 : null,
          )}
        </ProfessionalHourlyCell>
      )}
      {config?.showWindColumns === false ? null : (
        <>
          <ProfessionalHourlyCell
            cell="wind-speed"
            className={professionalHourlyToneClass(row.windSpeedMs, "wind-speed")}
          >
            {hourlyTableNumber(row.windSpeedMs)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="wind-gust">
            {hourlyTableNumber(row.windGustMs)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="wind-direction">
            {formatProfessionalWindDirection(row.windDirectionDeg)}
          </ProfessionalHourlyCell>
        </>
      )}
    </tr>
  );
}

function CloudSeaHourlyFocusPreview({
  target,
  rows,
  timezone,
  rowAnnotations,
  ordinarySignalLabel,
  title,
}: {
  readonly target: ProfessionalHourlySectionTarget;
  readonly rows: readonly ProfessionalHourlyRow[];
  readonly timezone: string;
  readonly rowAnnotations: ReadonlyMap<string, ProfessionalHourlyRowAnnotation>;
  readonly ordinarySignalLabel?: string;
  readonly title?: string;
}) {
  return (
    <div className="mt-3 grid gap-2" data-cloud-sea-hourly-preview="true">
      <p className="text-xs font-semibold text-muted-foreground">{title ?? "逐小时数据预览"}</p>
      {rows.length > 0 ? (
        <div className="grid gap-2 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
          {rows.map((row) => {
            const annotation = rowAnnotations.get(row.time);
            const signal = professionalHourlyDisplaySignal(row);
            const signalDisplay = professionalHourlySignalDisplayForTarget(target, signal, {
              annotation,
              ordinarySignalLabel,
            });
            const signalBadges = annotation?.badges?.length
              ? annotation.badges.map((badge) => ({
                  label: badge.label,
                  badgeVariant: badge.tone
                    ? professionalHourlyAnnotationBadgeVariant(badge.tone)
                    : signalDisplay.badgeVariant,
                }))
              : [signalDisplay];
            return (
              <div key={row.time} className="rounded-lg border border-border bg-muted px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-card-foreground">
                    {row.timeLabel || formatProfessionalTime(row.time, timezone)}
                  </p>
                  <span className="flex flex-wrap justify-end gap-1">
                    {signalBadges.map((badge) => (
                      <Badge key={badge.label} variant={badge.badgeVariant}>
                        {badge.label}
                      </Badge>
                    ))}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {target === "general" ? (
                    <>
                      降水 {formatProfessionalPrecipitation(row)} · 总云量{" "}
                      {formatProfessionalPercent(row.cloudTotalPercent)} · 风速{" "}
                      {formatProfessionalWindSpeed(row.windSpeedMs)}
                    </>
                  ) : (
                    <>
                      低云 {formatProfessionalPercent(row.cloudLowPercent)} · 湿度{" "}
                      {formatProfessionalPercent(row.relativeHumidityPercent)} · 能见度{" "}
                      {formatProfessionalVisibility(row.visibilityMeters)}
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-warning bg-muted p-3 text-sm leading-6 text-muted-foreground">
          当前窗口附近暂无可展示小时，展开后可查看完整小时表。
        </p>
      )}
    </div>
  );
}

function ProfessionalCloudValue({
  value,
  note,
}: {
  readonly value: string;
  readonly note?: string;
}) {
  if (!note) {
    return <>{value}</>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{value}</span>
      <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">
        {note}
      </span>
    </span>
  );
}

function professionalTemperatureBasisLabel(
  basis: NonNullable<
    ForecastCalculationResult["professionalHourlyDataTimeBasis"]
  >["temperatureBasis"],
): string {
  if (basis === "mixed") {
    return "原始格点 / 机位估算需对照";
  }
  if (basis === "terrain_adjusted") {
    return "机位海拔修正后";
  }
  if (basis === "terrain_adjusted_lapse_estimate") {
    return "递减率机位估算";
  }
  if (basis === "raw_grid") {
    return "原始格点";
  }
  if (basis === "provider_point") {
    return "预报点位";
  }
  return "暂无";
}

function professionalCloudBasisLabel(
  context: CloudSeaCloudBasisConsistencyContext,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
): string {
  if (context.cloudBasisLevel === "mixed_basis") {
    return "总云量与分层云量口径差异";
  }
  if (context.cloudBasisLevel === "minor_mismatch") {
    return "总云量与分层云量需轻度复核";
  }
  if (context.cloudBasisLevel === "total_only") {
    return "仅总云量，缺少低/中/高云分层";
  }
  if (
    context.cloudBasisLevel === "partial_layers" &&
    cloudLayerCompleteness.layerCompletenessLevel === "weak"
  ) {
    return "较多时段缺少低/中/高云分层";
  }
  if (context.cloudBasisLevel === "partial_layers") {
    return "部分时段缺少低/中/高云分层";
  }
  if (context.cloudBasisLevel === "consistent") {
    return "总云量 + 低/中/高云分层口径较一致";
  }
  return "暂无";
}

function professionalCloudCoverageLabel(
  summary: NonNullable<
    NonNullable<
      ForecastCalculationResult["professionalHourlyDataTimeBasis"]
    >["fieldCoverageSummary"]
  >,
): string {
  return `低云 ${summary.cloudLowCoverage}/${summary.totalHours}，中云 ${summary.cloudMidCoverage}/${summary.totalHours}，高云 ${summary.cloudHighCoverage}/${summary.totalHours}`;
}

function professionalTemperatureColumnLabels(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
): readonly string[] {
  const hasRawRows = rows.some((row) => row.rawTemperatureC !== null);
  const hasTerrainAdjustedRows = rows.some((row) => row.terrainAdjustedTemperatureC !== null);
  const hasRawGridRows = rows.some((row) => row.temperatureBasis === "raw_grid");
  const hasProviderRows = rows.some((row) => row.temperatureBasis === "provider_point");
  if (hasRawRows && hasTerrainAdjustedRows) {
    return ["原始格点气温 °C", "机位估算气温 °C"];
  }
  if (hasTerrainAdjustedRows) {
    return ["机位估算气温 °C"];
  }
  if (hasRawGridRows || basis.temperatureBasis === "raw_grid") {
    return ["原始格点气温 °C"];
  }
  if (hasProviderRows || basis.temperatureBasis === "provider_point") {
    return ["预报点气温 °C"];
  }
  if (
    basis.temperatureBasis === "terrain_adjusted" ||
    basis.temperatureBasis === "terrain_adjusted_lapse_estimate" ||
    basis.temperatureBasis === "mixed"
  ) {
    return ["机位估算气温 °C"];
  }
  return ["气温 °C"];
}

const professionalHourlyIncompleteFieldNoteText = "部分小时字段缺失，缺失值以 “—” 显示。";

function professionalHourlyMissingHeaderNote(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
  cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext,
): string | null {
  if (basis.partialData || rows.some(professionalHourlyRowHasIncompleteFields)) {
    return professionalHourlyPartialDataNote(rows, basis);
  }
  if (shouldShowCloudBasisProfessionalNote(cloudBasisConsistency)) {
    return professionalCloudBasisNote(cloudBasisConsistency);
  }
  if (cloudLayerCompleteness.layerCompletenessLevel !== "complete") {
    return "低/中/高云分层缺失时以 — 显示，不用总云量回填。";
  }
  const hasRawTemperature = rows.some((row) => row.temperatureBasis === "raw_grid");
  const hasProviderTemperature = rows.some((row) => row.temperatureBasis === "provider_point");
  const hasLapseEstimate = rows.some(
    (row) => row.temperatureBasis === "terrain_adjusted_lapse_estimate",
  );
  const hasMixedTemperature = rows.some((row) => row.temperatureBasis === "mixed");
  if (hasMixedTemperature) {
    return "原始格点温度与机位估算温度同时保留；高山体感和穿衣建议以机位估算温度为准。";
  }
  if (hasLapseEstimate) {
    return "当前温度按机位与模型海拔差估算，需结合临近预报复核。";
  }
  if (hasRawTemperature && basis.temperatureBasis !== "terrain_adjusted") {
    return "当前仅有原始格点温度，高山机位体感需谨慎参考。";
  }
  if (hasProviderTemperature && basis.temperatureBasis !== "terrain_adjusted") {
    return "当前仅有来源点位温度，未确认机位海拔修正。";
  }
  return null;
}

function professionalHourlyIncompleteFieldNote(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
  cloudLayerCompleteness: CloudLayerCompletenessContext,
  cloudBasisConsistency: CloudSeaCloudBasisConsistencyContext,
): string | null {
  if (basis.partialData || rows.some(professionalHourlyRowHasIncompleteFields)) {
    return professionalHourlyPartialDataNote(rows, basis);
  }
  if (shouldShowCloudBasisProfessionalNote(cloudBasisConsistency)) {
    return professionalCloudBasisNote(cloudBasisConsistency);
  }
  if (cloudLayerCompleteness.layerCompletenessLevel !== "complete") {
    return cloudLayerCompleteness.professionalNoteZh;
  }
  return null;
}

function professionalHourlyPartialDataNote(
  rows: readonly ProfessionalHourlyRow[],
  basis: NonNullable<ForecastCalculationResult["professionalHourlyDataTimeBasis"]>,
): string {
  if (rows.some(professionalHourlyRowHasIncompleteFields)) {
    return professionalHourlyIncompleteFieldNoteText;
  }
  if (
    typeof basis.requestedHours === "number" &&
    rows.length < basis.requestedHours &&
    basis.missingDataNoteZh
  ) {
    return basis.missingDataNoteZh;
  }
  return professionalHourlyIncompleteFieldNoteText;
}

function shouldShowCloudBasisProfessionalNote(
  context: CloudSeaCloudBasisConsistencyContext,
): boolean {
  return context.cloudBasisLevel !== "consistent" && context.cloudBasisLevel !== "unknown";
}

function professionalCloudBasisNote(context: CloudSeaCloudBasisConsistencyContext): string {
  if (context.cloudBasisLevel === "total_only" || context.cloudBasisLevel === "partial_layers") {
    const missingnessNote = "缺失值以 — 显示，不使用总云量回填。";
    return context.professionalSummaryZh.includes("不使用总云量回填")
      ? context.professionalSummaryZh
      : `${context.professionalSummaryZh} ${missingnessNote}`;
  }
  return context.professionalSummaryZh;
}

function professionalHourlyRowHasIncompleteFields(row: ProfessionalHourlyRow): boolean {
  return (
    (row.missingFields?.length ?? 0) > 0 ||
    row.cloudTotalPercent === null ||
    row.cloudHighPercent === null ||
    row.cloudMidPercent === null ||
    row.cloudLowPercent === null ||
    row.displayedTemperatureC === null ||
    row.dewPointC === null ||
    row.dewPointSpreadC === null ||
    row.relativeHumidityPercent === null ||
    row.precipitationAmountMm === null ||
    row.precipitationProbabilityPercent === null ||
    row.visibilityMeters === null ||
    row.windSpeedMs === null ||
    row.windDirectionDeg === null
  );
}

function ProfessionalHourlyCell({
  cell,
  dataBasis,
  cloudAmount,
  className,
  children,
}: {
  readonly cell: string;
  readonly dataBasis?: string;
  readonly cloudAmount?: number | null;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-t border-border px-2 py-2.5 align-middle",
        !["date", "time", "weather", "signal"].includes(cell) && "professional-numeric",
        cloudAmount !== undefined && "professional-cloud",
        className,
      )}
      style={
        isFiniteNumber(cloudAmount)
          ? ({
              "--cloud-fill": `${Math.min(100, Math.max(0, cloudAmount)) * 0.16}%`,
            } as React.CSSProperties)
          : undefined
      }
      data-professional-hourly-cell={cell}
      data-professional-hourly-basis={dataBasis}
    >
      {children}
    </td>
  );
}

function filterProfessionalHourlyRows(
  rows: readonly ProfessionalHourlyRow[],
  data: CloudSeaProfessionalHourlyDisplayData,
  mode: ProfessionalHourlyFilterMode,
  focusPaddingHours: number,
): readonly ProfessionalHourlyRow[] {
  if (mode === "all") {
    return rows;
  }

  if (mode === "cloudSea") {
    const focusWindows = professionalHourlyFocusWindows(data);
    return rows.filter((row) =>
      focusWindows.some((window) => professionalHourInWindow(row, window, focusPaddingHours)),
    );
  }

  if (mode === "morning") {
    return rows.filter((row) => {
      const hour = hourFromIsoLike(row.time);
      return hour !== undefined && hour >= 4 && hour <= 9;
    });
  }

  if (mode === "rain") {
    return rows.filter(
      (row) =>
        professionalHourlyHasPrecipitation(row) ||
        (isFiniteNumber(row.precipitationProbabilityPercent) &&
          row.precipitationProbabilityPercent >= 60),
    );
  }

  return rows.filter(
    (row) =>
      professionalHourlyDisplaySignal(row) === "白墙风险" ||
      professionalHourlyDisplaySignal(row) === "需复核" ||
      professionalHourlyHasRisk(row) ||
      data.riskWindows.some((window) => professionalHourInWindow(row, window, 1)),
  );
}

function professionalHourlyFocusWindows(
  data: CloudSeaProfessionalHourlyDisplayData,
): readonly CloudSeaAnalysisWindowLike[] {
  return data.focusWindows;
}

function professionalHourInWindow(
  row: ProfessionalHourlyRow,
  window: CloudSeaAnalysisWindowLike,
  paddingHours: number,
): boolean {
  const hourTime = Date.parse(row.time);
  const startTime = Date.parse(window.startTime);
  const endTime = Date.parse(window.endTime);
  if (!Number.isFinite(hourTime) || !Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return false;
  }

  const paddingMs = paddingHours * 60 * 60 * 1000;
  return hourTime >= startTime - paddingMs && hourTime <= endTime + paddingMs;
}

function professionalSignalBadgeVariant(signal: ProfessionalHourlyRow["cloudSeaSignal"]) {
  if (signal === "白墙风险") {
    return "danger" as const;
  }
  if (signal === "雨后开口") {
    return "accent" as const;
  }
  if (signal === "可拍窗口") {
    return "default" as const;
  }
  if (signal === "形成信号") {
    return "info" as const;
  }
  if (signal === "霞光参考") {
    return "accent" as const;
  }
  if (signal === "云层纹理") {
    return "info" as const;
  }
  if (signal === "需复核") {
    return "warning" as const;
  }
  return "muted" as const;
}

function professionalSignalBadgeVariantForTarget(
  target: ProfessionalHourlySectionTarget,
  signal: ProfessionalHourlyRow["cloudSeaSignal"],
): BadgeVariant {
  if (target === "astro") {
    return astroProfessionalHourlySignalDisplayBySignal[signal].badgeVariant;
  }
  if (target === "cloud_sea") {
    return cloudSeaProfessionalHourlySignalDisplayBySignal[signal].badgeVariant;
  }

  return professionalSignalBadgeVariant(signal);
}

function professionalHourlyDisplaySignal(
  row: ProfessionalHourlyRow,
): ProfessionalHourlyRow["cloudSeaSignal"] {
  const cloudLayerCompleteness = buildCloudLayerCompletenessContext([row]);
  const cloudBasisConsistency = buildCloudSeaCloudBasisConsistencyContext([row]);

  const strongOrRelevantSignal =
    row.cloudSeaSignal === "可拍窗口" ||
    row.cloudSeaSignal === "白墙风险" ||
    row.cloudSeaSignal === "形成信号" ||
    row.cloudSeaSignal === "雨后开口" ||
    row.cloudSeaSignal === "霞光参考" ||
    row.cloudSeaSignal === "云层纹理" ||
    row.cloudSeaSignal === "需复核";
  const significantTotalCloud = row.cloudTotalPercent !== null && row.cloudTotalPercent >= 70;

  if (
    cloudBasisConsistency.hasTotalLessThanAnyLayer &&
    (strongOrRelevantSignal || significantTotalCloud)
  ) {
    return "需复核";
  }

  if (!cloudLayerCompleteness.shouldPreferNeedsReviewSignal) {
    return row.cloudSeaSignal;
  }

  return strongOrRelevantSignal || significantTotalCloud ? "需复核" : "普通";
}

function professionalHourlyHasRisk(row: ProfessionalHourlyRow): boolean {
  return (
    (professionalHourlyHasPrecipitation(row) &&
      (!isFiniteNumber(row.cloudLowPercent) || row.cloudLowPercent >= 50)) ||
    (isFiniteNumber(row.precipitationProbabilityPercent) &&
      row.precipitationProbabilityPercent >= 60) ||
    (isFiniteNumber(row.visibilityMeters) && row.visibilityMeters <= 3000) ||
    (isFiniteNumber(row.windSpeedMs) && row.windSpeedMs >= 9)
  );
}

function professionalHourlyHasPrecipitation(row: ProfessionalHourlyRow): boolean {
  return isFiniteNumber(row.precipitationAmountMm) && row.precipitationAmountMm > 0;
}

function professionalHourlyToneClass(
  value: number | null | undefined,
  field: "visibility" | "wind-speed",
): string | undefined {
  if (!isFiniteNumber(value)) return undefined;
  if ((field === "visibility" && value <= 3000) || (field === "wind-speed" && value >= 9))
    return "bg-danger/10 font-semibold text-danger";
  if ((field === "visibility" && value <= 8000) || (field === "wind-speed" && value >= 6))
    return "bg-accent/10 font-semibold text-accent-strong";
  return undefined;
}

function weatherGlyphForProfessionalHour(
  row: ProfessionalHourlyRow,
  displayText: string,
): string | null {
  const text = displayText === "—" ? "" : displayText;
  if (text.includes("雪")) {
    return "雪";
  }
  if (text.includes("雨")) {
    return "雨";
  }
  if (text.includes("雾")) {
    return "雾";
  }
  if (text.includes("阴")) {
    return "阴";
  }
  if (text.includes("晴")) {
    return "晴";
  }
  if (text.includes("云")) {
    return "云";
  }
  if (row.weatherCode === "clear") {
    return "晴";
  }
  if (row.weatherCode === "partly_cloudy") {
    return "云";
  }
  return null;
}

function providerNeutralProfessionalWeatherText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || /meteoblue|open[-_ ]?meteo|qweather|和风天气|和风|provider/i.test(text)) {
    return null;
  }
  return text;
}

function formatProfessionalPercent(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${Math.round(value)}%` : "—";
}

function formatProfessionalPrecipitation(row: ProfessionalHourlyRow): string {
  const amount = isFiniteNumber(row.precipitationAmountMm)
    ? `${hourlyTableNumber(row.precipitationAmountMm, 2)} mm`
    : "—";
  const probability = isFiniteNumber(row.precipitationProbabilityPercent)
    ? `${Math.round(row.precipitationProbabilityPercent)}%`
    : "—";

  return amount === "—" && probability === "—" ? "—" : `${amount} / ${probability}`;
}

function formatProfessionalVisibility(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value / 1000)} km` : "—";
}

function formatProfessionalWindSpeed(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)} m/s` : "—";
}

function formatProfessionalWindDirection(value: number | null | undefined): string {
  return isFiniteNumber(value) ? windDirectionLabel(value) : "—";
}

function formatProfessionalDate(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp));
}

function professionalDateKey(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatProfessionalDayHeading(value: string, timezone: string, fallback: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }
  const date = new Date(timestamp);
  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    month: "long",
    day: "numeric",
  }).format(date);
  const weekdayLabel = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    weekday: "short",
  }).format(date);
  return `${dateLabel} · ${weekdayLabel}`;
}

function formatProfessionalTime(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

function formatFullDateTimeForTimezone(value: string, timezone: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp));
  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = valueFor("year");
  const month = valueFor("month");
  const day = valueFor("day");
  const hour = valueFor("hour");
  const minute = valueFor("minute");

  return year && month && day && hour && minute
    ? `${year}年${month}月${day}日 ${hour}:${minute}`
    : value;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function ComprehensiveForecastView({
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: ForecastResultViewModel;
}) {
  return (
    <DecisionResultTemplate
      target="general"
      className="GeneralResultPage general-result-page mx-auto grid w-full max-w-4xl gap-4"
    >
      <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-1">
        <div>
          <h1 className="text-xl font-bold">{result.place.name} · 拍摄建议</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            天气概览 · {forecastHorizonLabels[result.horizon]}
          </p>
        </div>
        <a href="/" className="rounded-lg border border-border px-3 py-2 text-sm text-primary">
          更换地点与范围
        </a>
      </header>
      <PhotographyOutlook result={result} />
    </DecisionResultTemplate>
  );
}

export type AstroHourlyTimelineNightOption = {
  readonly key: string;
  readonly label: string;
  readonly compactLabel: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly recommended: boolean;
};

export function buildAstroHourlyTimelineNightOptions(
  viewModel: AstroForecastViewModel,
): readonly AstroHourlyTimelineNightOption[] {
  const timezone = viewModel.professionalHourlyData.timeBasis?.timezone ?? "Asia/Shanghai";
  return viewModel.nightlyCards
    .map((night) => {
      const fallbackRows = professionalRowsForLocalNight(
        viewModel.professionalHourlyData.rows,
        night.localEveningDate,
        timezone,
      );
      const startAt = night.astronomicalNight.startAt ?? fallbackRows[0]?.time;
      const endAt = night.astronomicalNight.endAt ?? fallbackRows.at(-1)?.time;
      return startAt && endAt
        ? {
            key: night.nightKey,
            label: `${night.localEveningDateLabel} ${night.weekdayLabel}`,
            compactLabel: `${Number(night.localEveningDate.slice(5, 7))}/${Number(
              night.localEveningDate.slice(8, 10),
            )} ${night.weekdayLabel}`,
            startAt,
            endAt,
            recommended: night.nightKey === viewModel.bestNight?.nightKey,
          }
        : null;
    })
    .filter((option): option is AstroHourlyTimelineNightOption => option !== null);
}

function professionalRowsForLocalNight(
  rows: readonly ProfessionalHourlyRow[],
  localEveningDate: string,
  timezone: string,
): readonly ProfessionalHourlyRow[] {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  return rows.filter((row) => {
    const timestamp = Date.parse(row.time);
    if (!Number.isFinite(timestamp)) {
      return false;
    }
    const parts = formatter.formatToParts(new Date(timestamp));
    const numberPart = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const year = numberPart("year");
    const month = numberPart("month");
    const day = numberPart("day");
    const hour = numberPart("hour");
    if (![year, month, day, hour].every(Number.isFinite) || (hour > 6 && hour < 18)) {
      return false;
    }
    const dateTimestamp = Date.UTC(year, month - 1, day);
    const eveningTimestamp = hour <= 6 ? dateTimestamp - 24 * 60 * 60 * 1000 : dateTimestamp;
    return new Date(eveningTimestamp).toISOString().slice(0, 10) === localEveningDate;
  });
}

export function filterProfessionalRowsForAstroNight(
  rows: readonly ProfessionalHourlyRow[],
  night: Pick<AstroHourlyTimelineNightOption, "startAt" | "endAt">,
): readonly ProfessionalHourlyRow[] {
  const startTimestamp = Date.parse(night.startAt);
  const endTimestamp = Date.parse(night.endAt);
  if (!Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp)) {
    return [];
  }
  return rows.filter((row) => {
    const timestamp = Date.parse(row.time);
    return Number.isFinite(timestamp) && timestamp >= startTimestamp && timestamp <= endTimestamp;
  });
}

const generalRainfallSectionCopy = {
  sectionTitle: "未来小时降雨",
  sectionBadge: "逐小时降水",
  sectionDescription: "逐小时查看未来降雨量与降水概率，重点复核降水时段，辅助判断拍摄可行性。",
  expandButtonLabel: "展开小时降雨",
  collapseButtonLabel: "收起小时降雨",
  allFilterLabel: "全部小时",
  rainFilterLabel: "只看降水时段",
  tableAriaLabel: "小时降雨筛选",
  rainAmountColumnLabel: "降水 mm",
  rainProbabilityColumnLabel: "概率 %",
  previewTitle: "近期降雨时段预览",
  emptyMessage: "当前筛选下暂无降水小时，请切换筛选复核完整预报。",
};

export function GeneralHourlyWeatherSection({
  data,
  initiallyExpanded = false,
}: {
  readonly data: ProfessionalHourlyDisplayData;
  readonly initiallyExpanded?: boolean;
}) {
  const rows = data.rows;
  const basis = data.timeBasis;
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [filterMode, setFilterMode] = useState<"all" | "rain">("all");

  if (!isValidProfessionalHourlyTimeBasis(basis) || rows.length === 0) {
    return null;
  }

  const expectedRowCount = basis.expectedRowCount ?? basis.requestedHours ?? rows.length;
  const rainRows = filterProfessionalHourlyRows(rows, data, "rain", 0);
  const previewRows = (rainRows.length > 0 ? rainRows : rows).slice(0, 4);

  return (
    <Card
      className="GeneralProfessionalHourlyData w-full min-w-0 rounded-2xl border border-border bg-card p-5 shadow-panel"
      data-general-section="GeneralHourlyWeatherSection"
      data-general-professional-hourly-expanded={expanded ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-card-foreground">
              {generalRainfallSectionCopy.sectionTitle}
            </h2>
            <Badge variant="accent">{generalRainfallSectionCopy.sectionBadge}</Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {generalRainfallSectionCopy.sectionDescription}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={expanded}
          data-general-hourly-toggle="true"
          onClick={() => {
            setExpanded((current) => !current);
          }}
        >
          {expanded
            ? generalRainfallSectionCopy.collapseButtonLabel
            : generalRainfallSectionCopy.expandButtonLabel}
          <ExpandChevron expanded={expanded} />
        </Button>
      </div>

      {expanded ? (
        <div className="mt-4 grid w-full min-w-0 gap-3" data-general-hourly-body="true">
          <dl className="grid gap-2 rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-muted-foreground min-[760px]:grid-cols-4">
            <CompactDefinition
              label="目标有效时间"
              value={`${formatFullDateTimeForTimezone(
                basis.anchorStartLocal ?? basis.startTime,
                basis.timezone,
              )} - ${formatFullDateTimeForTimezone(
                basis.anchorEndLocal ?? basis.endTime,
                basis.timezone,
              )}`}
            />
            <CompactDefinition
              label="覆盖小时"
              value={`${rows.length} / ${expectedRowCount} 小时`}
            />
            <CompactDefinition
              label="时间步长"
              value={basis.stepMinutes === 60 ? "逐小时" : `${basis.stepMinutes} 分钟`}
            />
            <CompactDefinition label="时区" value={basis.timezone} />
          </dl>
          <GeneralRainHourlyTable
            data={data}
            filterMode={filterMode}
            onFilterModeChange={setFilterMode}
          />
        </div>
      ) : (
        <GeneralRainHourlyPreview
          rows={previewRows}
          timezone={basis.timezone}
          showingRainRows={rainRows.length > 0}
        />
      )}
    </Card>
  );
}

function GeneralRainHourlyPreview({
  rows,
  timezone,
  showingRainRows,
}: {
  readonly rows: readonly ProfessionalHourlyRow[];
  readonly timezone: string;
  readonly showingRainRows: boolean;
}) {
  return (
    <div className="mt-3 grid gap-2" data-general-rain-preview="true">
      <p className="text-xs font-semibold text-muted-foreground">
        {showingRainRows ? generalRainfallSectionCopy.previewTitle : "近期小时降雨概览"}
      </p>
      <div className="grid gap-2 min-[760px]:grid-cols-2 min-[1180px]:grid-cols-4">
        {rows.map((row) => {
          const weatherText = providerNeutralProfessionalWeatherText(row.weatherText) ?? "—";
          const weatherGlyph = weatherGlyphForProfessionalHour(row, weatherText);
          return (
            <div key={row.time} className="rounded-lg border border-border bg-muted px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-card-foreground">
                  {row.dateLabel || formatProfessionalDate(row.time, timezone)} ·{" "}
                  {row.timeLabel || formatProfessionalTime(row.time, timezone)}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  {weatherGlyph ? (
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-card text-[11px] font-bold text-primary">
                      {weatherGlyph}
                    </span>
                  ) : null}
                  {weatherText}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                降水 {formatProfessionalRainAmount(row)} · 概率{" "}
                {formatProfessionalRainProbability(row)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GeneralRainHourlyTable({
  data,
  filterMode,
  onFilterModeChange,
}: {
  readonly data: ProfessionalHourlyDisplayData;
  readonly filterMode: "all" | "rain";
  readonly onFilterModeChange: (mode: "all" | "rain") => void;
}) {
  const rows = useMemo(
    () =>
      filterMode === "rain" ? filterProfessionalHourlyRows(data.rows, data, "rain", 0) : data.rows,
    [data, filterMode],
  );

  const activeFilterLabel =
    filterMode === "rain"
      ? generalRainfallSectionCopy.rainFilterLabel
      : generalRainfallSectionCopy.allFilterLabel;
  const timezone = data.timeBasis?.timezone ?? "Asia/Shanghai";
  const dayGroups = useMemo(() => groupGeneralRainRowsByDay(rows, timezone), [rows, timezone]);
  const columnLabels = [
    "时间",
    "天气",
    generalRainfallSectionCopy.rainAmountColumnLabel,
    generalRainfallSectionCopy.rainProbabilityColumnLabel,
  ];

  return (
    <section
      className="w-full"
      data-general-rain-table="true"
      data-general-rain-content-width="full"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={generalRainfallSectionCopy.tableAriaLabel}
        >
          {(
            [
              { mode: "all", label: generalRainfallSectionCopy.allFilterLabel },
              { mode: "rain", label: generalRainfallSectionCopy.rainFilterLabel },
            ] as const
          ).map((filter) => (
            <button
              key={filter.mode}
              type="button"
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                filterMode === filter.mode
                  ? "border-primary bg-secondary text-secondary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground",
              )}
              onClick={() => {
                onFilterModeChange(filter.mode);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          当前筛选：{activeFilterLabel} · 显示 {rows.length} / {data.rows.length} 小时
        </p>
      </div>

      {rows.length > 0 ? (
        <>
          <div
            className="mt-3 hidden overflow-hidden rounded-lg border border-border sm:block"
            data-general-rain-desktop-layout="true"
          >
            <table
              className="w-full table-fixed border-separate border-spacing-0 text-left text-[13px] leading-5"
              data-general-rain-table-layout="grouped-days"
            >
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[30%]" />
                <col className="w-[18%]" />
                <col className="w-[38%]" />
              </colgroup>
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  {columnLabels.map((label, index) => (
                    <th
                      key={label}
                      scope="col"
                      className={cn(
                        "whitespace-nowrap border-b border-border px-4 py-2 font-semibold",
                        index >= 2 && "text-right",
                      )}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              {dayGroups.map((group) => (
                <tbody key={group.key} data-general-rain-day={group.key}>
                  <tr className="bg-secondary/35">
                    <th
                      colSpan={4}
                      scope="rowgroup"
                      className="border-b border-border px-4 py-2 text-left text-xs font-bold text-card-foreground"
                    >
                      <span>{group.label}</span>
                      <span className="ml-2 font-normal text-muted-foreground">
                        {group.rows.length} 小时
                      </span>
                    </th>
                  </tr>
                  {group.rows.map((row, rowIndex) => (
                    <GeneralRainHourlyRow
                      key={row.time}
                      row={row}
                      rowIndex={rowIndex}
                      timezone={timezone}
                    />
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <div className="mt-3 grid gap-3 sm:hidden" data-general-rain-mobile-layout="true">
            {dayGroups.map((group) => (
              <section key={group.key} data-general-rain-mobile-day={group.key}>
                <div className="flex items-center justify-between rounded-t-lg border border-border bg-secondary/35 px-3 py-2">
                  <h3 className="text-xs font-bold text-card-foreground">{group.label}</h3>
                  <span className="text-xs text-muted-foreground">{group.rows.length} 小时</span>
                </div>
                <div className="divide-y divide-border overflow-hidden rounded-b-lg border-x border-b border-border">
                  {group.rows.map((row) => (
                    <GeneralRainMobileHourlyRow key={row.time} row={row} timezone={timezone} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
          {generalRainfallSectionCopy.emptyMessage}
        </p>
      )}
    </section>
  );
}

type GeneralRainDayGroup = {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly ProfessionalHourlyRow[];
};

function groupGeneralRainRowsByDay(
  rows: readonly ProfessionalHourlyRow[],
  timezone: string,
): readonly GeneralRainDayGroup[] {
  const groups: Array<{ key: string; label: string; rows: ProfessionalHourlyRow[] }> = [];

  for (const row of rows) {
    const key = professionalDateKey(row.time, timezone);
    const previous = groups.at(-1);
    if (previous?.key === key) {
      previous.rows.push(row);
      continue;
    }
    groups.push({
      key,
      label: formatProfessionalDayHeading(row.time, timezone, row.dateLabel),
      rows: [row],
    });
  }

  return groups;
}

function GeneralRainHourlyRow({
  row,
  rowIndex,
  timezone,
}: {
  readonly row: ProfessionalHourlyRow;
  readonly rowIndex: number;
  readonly timezone: string;
}) {
  const weatherText = providerNeutralProfessionalWeatherText(row.weatherText) ?? "—";
  const weatherGlyph = weatherGlyphForProfessionalHour(row, weatherText);
  const hasMeasuredRain = professionalHourlyHasPrecipitation(row);
  const rowBackgroundClassName = generalRainRowBackgroundClassName(rowIndex, hasMeasuredRain);

  return (
    <tr
      className={rowBackgroundClassName}
      data-general-rain-row={row.time}
      data-general-rain-has-precipitation={hasMeasuredRain ? "true" : "false"}
    >
      <ProfessionalHourlyCell cell="time" className="px-4 font-semibold text-card-foreground">
        {row.timeLabel || formatProfessionalTime(row.time, timezone)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="weather" className="px-4">
        <span className="inline-flex items-center gap-1.5">
          {weatherGlyph ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[11px] font-bold text-primary">
              {weatherGlyph}
            </span>
          ) : null}
          <span>{weatherText}</span>
        </span>
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell
        cell="rain-amount"
        className={cn("px-4 tabular-nums", hasMeasuredRain && "font-semibold text-accent-strong")}
      >
        {formatProfessionalRainAmount(row)}
      </ProfessionalHourlyCell>
      <ProfessionalHourlyCell cell="rain-probability" className="px-4">
        <GeneralRainProbabilityDisplay row={row} />
      </ProfessionalHourlyCell>
    </tr>
  );
}

function GeneralRainMobileHourlyRow({
  row,
  timezone,
}: {
  readonly row: ProfessionalHourlyRow;
  readonly timezone: string;
}) {
  const weatherText = providerNeutralProfessionalWeatherText(row.weatherText) ?? "—";
  const weatherGlyph = weatherGlyphForProfessionalHour(row, weatherText);
  const hasMeasuredRain = professionalHourlyHasPrecipitation(row);

  return (
    <article
      className={cn("grid gap-2 px-3 py-2.5", hasMeasuredRain ? "bg-accent/10" : "bg-card")}
      data-general-rain-mobile-row={row.time}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold tabular-nums text-card-foreground">
          {row.timeLabel || formatProfessionalTime(row.time, timezone)}
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {weatherGlyph ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-muted text-[11px] font-bold text-primary">
              {weatherGlyph}
            </span>
          ) : null}
          {weatherText}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-3 text-xs">
        <p
          className={cn(
            "tabular-nums text-muted-foreground",
            hasMeasuredRain && "font-semibold text-accent-strong",
          )}
        >
          降水 {formatProfessionalRainAmount(row)}
        </p>
        <GeneralRainProbabilityDisplay row={row} compact />
      </div>
    </article>
  );
}

function GeneralRainProbabilityDisplay({
  row,
  compact = false,
}: {
  readonly row: ProfessionalHourlyRow;
  readonly compact?: boolean;
}) {
  const probability = isFiniteNumber(row.precipitationProbabilityPercent)
    ? Math.max(0, Math.min(100, Math.round(row.precipitationProbabilityPercent)))
    : null;

  if (probability === null) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div
      className={cn("flex min-w-0 items-center gap-2", compact && "justify-end")}
      data-general-rain-probability={probability}
    >
      <div
        className={cn(
          "h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted",
          compact ? "max-w-24" : "max-w-44",
        )}
        role="meter"
        aria-label={`降水概率 ${probability}%`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={probability}
        data-general-rain-probability-bar="true"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            generalRainProbabilityBarClassName(probability),
          )}
          style={{ width: `${probability}%` }}
        />
      </div>
      <span
        className={cn(
          "w-10 shrink-0 text-right font-semibold tabular-nums",
          generalRainProbabilityTextClassName(probability),
        )}
      >
        {formatProfessionalRainProbability(row)}
      </span>
    </div>
  );
}

function generalRainRowBackgroundClassName(rowIndex: number, hasMeasuredRain: boolean): string {
  if (hasMeasuredRain) {
    return "bg-accent/10";
  }
  return rowIndex % 2 === 0 ? "bg-card" : "bg-muted/35";
}

function generalRainProbabilityBarClassName(probability: number): string {
  if (probability >= 60) {
    return "bg-accent";
  }
  if (probability >= 30) {
    return "bg-primary/60";
  }
  return "bg-primary/30";
}

function generalRainProbabilityTextClassName(probability: number): string {
  return probability >= 60 ? "text-accent-strong" : "text-muted-foreground";
}

function formatProfessionalRainAmount(row: ProfessionalHourlyRow): string {
  return isFiniteNumber(row.precipitationAmountMm)
    ? `${hourlyTableNumber(row.precipitationAmountMm, 2)} mm`
    : "—";
}

function formatProfessionalRainProbability(row: ProfessionalHourlyRow): string {
  return isFiniteNumber(row.precipitationProbabilityPercent)
    ? `${Math.round(row.precipitationProbabilityPercent)}%`
    : "—";
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
    <div className="grid h-full content-start rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
      <DecisionValue value={card.value} className="mt-2 text-card-foreground" />
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {card.key === "comprehensive-arrival"
          ? userFacingResultText(card.detail)
          : compactResultCardDetail(card.detail)}
      </p>
      {typeof card.score === "number" ? (
        <ResultMeter
          className="mt-3 bg-card"
          value={card.score}
          label={`${card.label} ${Math.round(card.score)} / 100`}
          tone={resultMeterToneForCard(card.tone)}
        />
      ) : null}
    </div>
  );
}

function compactResultCardDetail(value: string): string {
  const normalized = userFacingResultText(value).trim();
  const summary = normalized.split(/[。！？!?；;]/)[0]?.trim() ?? normalized;
  if (summary.length > 84) {
    return `${summary.slice(0, 84).replace(/[，、\s]+$/, "")}…`;
  }
  return /[。！？!?]$/.test(summary) ? summary : `${summary}。`;
}

function resultMeterToneForCard(tone: ForecastResultCardTone): ResultMeterTone {
  return tone;
}

type BadgeVariant = NonNullable<Parameters<typeof Badge>[0]["variant"]>;

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
    <Card className={cn("p-5", compact && "p-4")}>
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
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">逐日判断</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.key} className="rounded-xl border border-border bg-muted/70 p-4">
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
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant="muted">目标优先</Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {groups.length > 0 ? (
        <div className="mt-4 grid gap-4">
          {groups.map((group) => (
            <section key={group.key} className="rounded-xl border border-border bg-muted/70 p-4">
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
          className="grid gap-2 rounded-xl border border-border bg-card px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        >
          <div>
            <p className="font-semibold text-card-foreground">{window.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{window.timeRangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Badge variant={windowCategoryBadgeVariant(window)}>
              {windowDisplayCategory(window)}
            </Badge>
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
    <Card className={cn("p-4", nonReal ? "border-warning" : "")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
        <p className="text-sm font-semibold text-card-foreground">数据提醒</p>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{dataNotice}</p>
    </Card>
  );
}

function DataStatusPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const nonReal = result.weatherDataMode !== "real" || result.terrainAnalysis.isMock;
  const confidence = sourceConfidenceLabel(result);
  const conflictStatus = result.weatherFusionSummary?.conflictStatusZh ?? "缺少多源一致性证据";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">数据状态</h2>
        <Badge variant={nonReal ? "warning" : "success"}>{weatherModeBadge(result)}</Badge>
      </div>
      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="地点" value={result.calendarBasis.coordinateSource} />
        <SummaryItem
          label="天气主源"
          value={publicSourceDiagnosticText(result, "qweather", "基础天气")}
        />
        <SummaryItem
          label="云层辅助"
          value={publicSourceDiagnosticText(result, "open_meteo", "云层辅助")}
        />
        <SummaryItem
          label="专业增强"
          value={publicSourceDiagnosticText(result, "meteoblue", "专业增强")}
        />
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
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">计算依据</h2>
        <Badge variant="muted">日历核心</Badge>
      </div>

      <dl className="mt-4 grid gap-3 text-sm">
        <SummaryItem label="预报起点" value={basis.forecastStartLabel} />
        <SummaryItem label="预报终点" value={basis.forecastEndLabel} />
        <SummaryItem
          label="覆盖日期"
          value={basis.targetDates.map((date) => dateLabelForResultClient(result, date)).join("、")}
        />
        <SummaryItem label="时区" value={basis.timezoneLabel} />
        <SummaryItem label="WGS84 经纬度" value={formatWgs84Coordinates(basis)} />
        <SummaryItem label="坐标来源" value={basis.coordinateSource} />
        <SummaryItem
          label="机位海拔"
          value={formatElevationValue(result.terrainAnalysis.terrainProfile.locationElevation)}
        />
        <SummaryItem
          label="周边高差"
          value={formatReliefValue(result.terrainAnalysis.terrainProfile.elevationDiff5km)}
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

  return (
    <Card className="p-4">
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
      <ResultMeter
        className="mt-3"
        value={score.score}
        label={`${score.label} ${Math.round(score.score)} / 100`}
        tone={isRisk ? "warning" : "primary"}
      />
    </Card>
  );
}

function windowDisplayCategory(
  window: Pick<
    ForecastResultWindow,
    | "windowLevel"
    | "recommendationLevel"
    | "practicalScore"
    | "score"
    | "executableForDedicatedTrip"
  >,
): "推荐拍摄" | "可观察" | "仅作备选" | "不建议" {
  if (window.windowLevel === "blocked" || window.recommendationLevel === "not_recommended") {
    return "不建议";
  }
  if (window.recommendationLevel === "backup") {
    return "仅作备选";
  }
  if (
    window.windowLevel === "best" ||
    window.windowLevel === "shootable" ||
    window.executableForDedicatedTrip === true
  ) {
    return window.executableForDedicatedTrip === true ? "推荐拍摄" : "可观察";
  }
  if (window.windowLevel === "watchable" || window.recommendationLevel === "cautious") {
    return "可观察";
  }
  return (window.practicalScore ?? window.score) >= 65 ? "可观察" : "仅作备选";
}

function windowCategoryBadgeVariant(window: ForecastResultWindow): BadgeVariant {
  return glowWindowCategoryBadge(windowDisplayCategory(window));
}

function glowWindowCategoryBadge(category: string): BadgeVariant {
  if (category === "推荐拍摄") {
    return "default";
  }
  if (category === "可观察") {
    return "accent";
  }
  if (category === "不建议") {
    return "danger";
  }
  return "muted";
}

function hourFromIsoLike(value: string): number | undefined {
  const match = /T(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : undefined;
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

function dateLabelForResultClient(result: ForecastCalculationResult, date: string): string {
  const index = result.calendarBasis.targetDates.indexOf(date);
  const label = formatLocalDateLabel(date, result.calendarBasis.timezone);
  return label === "时间待确认" ? result.calendarBasis.targetDateLabels[index] ?? date : label;
}

function windDirectionLabel(value: number): string {
  const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  const normalized = ((value % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index] ?? `${Math.round(value)}°`;
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : "未提供";
}

function formatElevationValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `约 ${Math.round(value)} 米`
    : "暂未确认";
}

function formatReliefValue(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `约 ${Math.round(value)} 米`
    : "周边高差暂未返回";
}

function terrainPotentialLabel(
  potential: ForecastCalculationResult["terrainAnalysis"]["terrainProfile"]["terrainCloudSeaPotential"],
): string {
  if (potential === "high") {
    return "云海地形支撑高";
  }
  if (potential === "medium") {
    return "云海地形支撑中";
  }
  return "云海地形支撑低";
}

function formatWgs84Coordinates(result: ForecastCalculationResult["calendarBasis"]): string {
  return `${formatCoordinate(result.wgs84Coordinates.latitude)}, ${formatCoordinate(
    result.wgs84Coordinates.longitude,
  )}`;
}
