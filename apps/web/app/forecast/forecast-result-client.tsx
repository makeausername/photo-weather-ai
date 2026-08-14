"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  buildCloudLayerCompletenessContext,
  buildCloudSeaCloudBasisConsistencyContext,
  classifyGlowWindowLifecycle,
  classifyTerrainMode,
  formatArrivalDeadlineZh,
  formatLocalDateLabel,
  formatLocalDateTimeRange,
  formatLocalTimeRange,
  forecastHorizonLabels,
  forecastTargetLabels,
  type CloudLayerCompletenessContext,
  type CloudSeaCloudBasisConsistencyContext,
  type CloudSeaWeatherVariableConsistencyContext,
  simplifyWeatherSummaryZh,
  terrainModeUsesLowlandSemantics,
  terrainModeUsesMountainSemantics,
  type AstroWindow,
  type ForecastCalculationResult,
  type ForecastHorizon,
  type ForecastQueryInput,
  type ForecastRiskFlag,
  type ForecastScore,
  type ForecastScoreLevel,
  type GlowWindow,
} from "@photo-weather/shared";
import { PublicShell } from "../../components/public-shell";
import { MoonPhaseCalendar } from "../../components/moon-phase-calendar";
import { Badge, Button, Card, ResponsiveDataScroller, cn } from "../../components/ui";
import { saveForecastHistory } from "../../components/account-session";
import {
  upgradeRequiredDefaultMessage,
  upgradeRequiredTitle,
} from "../../components/api-client";
import {
  buildForecastResultViewModel,
  filterAstroPublicProfessionalDataGroups,
  getForecastResultPageShellCopy,
  type CloudSeaActionPlanItem,
  type AstroForecastViewModel,
  type CloudSeaDailyTrendItem,
  type CloudSeaForecastViewModel,
  type CloudSeaReasoningItem,
  type CloudSeaWindowItem,
  type ForecastResultCard,
  type ForecastResultCardTone,
  type ForecastResultDailyItem,
  type ForecastResultSection,
  type ForecastResultSectionItem,
  type ForecastResultViewModel,
  type ForecastResultWindow,
  type ForecastResultWindowGroup,
  type GlowForecastViewModel,
} from "./forecast-result-view-model";
import {
  astroBlockedReasonText,
  clothingEquipmentAdvice,
  compactPrecipitationDisplayText,
  isProbabilityOnlyPrecipitationSignal,
  rainRiskText,
  windowLabelText,
} from "./forecast-copy";
import { normalizeForecastPublicCopyText } from "./forecast-copy-polish";
import {
  buildGeneralForecastReturnUrl,
  buildGeneralDailySubjectLinks,
  buildSubjectDetailDeepLink,
  createForecastResultContextId,
  writeForecastResultContext,
  type SubjectDetailSubject,
  type SubjectDetailTarget,
} from "./subject-detail-links";
import type { CloudSeaTerrainContext } from "./cloud-sea-terrain-context";
import { buildTerrainDisplayModel } from "./terrain-display-model";
import type {
  CloudSeaCurrentNearTermWeatherDisplay,
  CloudSeaDisplayData,
  CloudSeaProfessionalHourlyDisplayData,
  CloudSeaProfessionalHourlyWindow,
  ProfessionalHourlyDisplayData,
  ProfessionalHourlyRowAnnotation,
} from "./cloud-sea-display-data";
import {
  ActionPlanGrid,
  CurrentWeatherCards,
  DailyDecisionList,
  DecisionErrorTemplate,
  DecisionLoadingTemplate,
  DecisionResultTemplate,
  ForecastMetricCard,
  ForecastMetricGrid,
  ForecastResultHeader,
  ForecastResultSummaryCard,
  ForecastScoreCard,
  JudgmentBasisGrid,
} from "./result-dashboard-components";
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

type CloudSeaTravelDecision = "go" | "cautious" | "no_go";

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
  const changeLocationPath = isCloudSeaFlow ? "/cloud-sea" : "/#analysis";

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

        writeForecastResultContext({ query: requestQuery, result: data });
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
                window.location.assign(changeLocationPath);
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
            <Badge variant={result ? dataReadinessBadgeVariant(result) : "warning"}>
              {result ? dataReadinessBadgeLabel(result) : "加载中"}
            </Badge>
          </header>
        </>
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
        <ForecastResultView query={query} result={result} />
      ) : null}
    </PublicShell>
  );
}

function buildForecastHistorySummary(result: ForecastCalculationResult) {
  const bestWindow = result.bestWindows[0];
  return {
    overallScore: result.finalScore ?? result.overallScore,
    recommendationLabel: result.finalRecommendationLabel ?? result.recommendationLabel,
    bestWindowStart: bestWindow?.startTime ?? null,
    bestWindowEnd: bestWindow?.endTime ?? null,
  };
}

function DashboardFrame({
  query,
  children,
}: {
  readonly query: ForecastQueryInput;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 max-w-full gap-5 min-[900px]:grid-cols-[clamp(300px,32vw,360px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(320px,23vw,380px)_minmax(0,1fr)_clamp(320px,23vw,380px)] min-[1200px]:items-start">
      <aside className="grid min-w-0 content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
        <QuerySummaryPanel query={query} />
      </aside>
      <div className="grid min-w-0 gap-5 min-[1200px]:contents">{children}</div>
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
          message: "正在生成云海拍摄判断...",
          description: "正在结合天气、地形、云层和光线窗口生成判断。",
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
        message: "正在生成拍摄天气分析...",
        description: "正在结合天气条件、天文窗口和地形特征生成出行判断。",
      }}
      info={{
        title: "分析基础",
        description: "页面会优先呈现是否值得去、什么时候到、拍什么和需要规避的风险。",
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
        description: "页面会优先呈现是否值得去、什么时候到、拍什么和需要规避的风险。",
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
    description:
      "页面会把云海形成、可拍机会、白墙风险、雨后开口和现场复核动作放在同一套判断结构里。",
    badge: { label: "云海 / 白墙 / 雨后开口", variant: "accent" as const },
  };
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

function SectionHeading({
  title,
  description,
  badge,
}: {
  readonly title: string;
  readonly description?: string;
  readonly badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {badge ? <Badge variant="muted">{badge}</Badge> : null}
    </div>
  );
}

function WeatherEssentialsPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const current = result.currentWeather;
  const clothing = result.clothingGuide;
  const firstDay = result.dailySummaries[0]?.weather;
  const auxiliaryNotice = auxiliaryDataNotice(result);
  const timeContext = buildNearTermWeatherTimeContext(result);

  return (
    <CurrentWeatherCards target="general" dataTestId="near-term-weather">
      <SectionHeading
        title={`当前与近时段天气（${timeContext.sectionWindowLabel}）`}
        description={timeContext.description}
        badge={weatherReadinessLabel(result)}
      />
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <CompactInfoCard
          title="气温与体感"
          timeBasis={timeContext.currentBasisLabel}
          badge={comfortLevelLabel(clothing.comfortLevel)}
          value={mountainTemperatureValue(current, firstDay, result)}
          detail={`${dailyTemperatureRangeText(firstDay, result)}，${temperatureActionText(
            current,
            firstDay,
            result,
          )} ${terrainCorrectionUserNote(result, current, firstDay)}`}
        />
        <CompactInfoCard
          title="云层与能见度"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={`通透度 ${transparencyGradeLabel(firstDay?.transparencyGrade, result.scores.transparency.score)}`}
          value={`云量 ${formatPercentNumber(current?.cloudTotal ?? firstDay?.cloudTotal)}`}
          detail={`能见度 ${formatKilometers(
            current?.rawVisibilityKm ??
              current?.visibility ??
              firstDay?.rawVisibilityKm ??
              firstDay?.visibility,
          )}，低云 ${formatPercentNumber(
            current?.cloudLow ?? firstDay?.cloudLow,
          )}。${cloudVisibilityActionText(result)}`}
        />
        <CompactInfoCard
          title="风与降水"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={formatWindWithGust(
            current?.windSpeed ?? firstDay?.windSpeed,
            current?.windDirection ?? firstDay?.windDirection,
            current?.windGust ?? firstDay?.windGust,
          )}
          value={precipitationDisplayValue(current ?? firstDay)}
          detail={`${precipitationDisplayDetail(current ?? firstDay)}。${windPrecipitationActionText(
            result,
            current ?? firstDay,
          )}`}
        />
        <CompactInfoCard
          title="湿度与露点"
          timeBasis={timeContext.nearTermBasisLabel}
          badge={`湿度 ${formatPercentNumber(current?.humidity ?? firstDay?.humidity)}`}
          value={`露点差 ${formatTemperatureDelta(current?.dewPointSpread ?? firstDay?.dewPointSpread)}`}
          detail={`${dewPointActionText(current?.dewPointSpread ?? firstDay?.dewPointSpread)} ${auxiliaryNotice}`}
        />
        <CompactInfoCard
          title="穿衣与装备"
          timeBasis={timeContext.tripBasisLabel}
          badge={clothing.titleZh}
          value={packingMainValue(clothing)}
          detail={packingDetail(clothing)}
        />
      </div>
    </CurrentWeatherCards>
  );
}

type NearTermWeatherTimeContext = {
  readonly sectionWindowLabel: string;
  readonly description: string;
  readonly currentBasisLabel: string;
  readonly nearTermBasisLabel: string;
  readonly tripBasisLabel: string;
};

function buildNearTermWeatherTimeContext(
  result: ForecastCalculationResult,
): NearTermWeatherTimeContext {
  const basisStart =
    firstValidTime(result.currentWeather?.observedAt, result.forecastStart, result.generatedAt) ??
    "";
  const basisEnd = nearTermWindowEnd(basisStart, result.forecastEnd);
  const sectionWindowLabel =
    basisStart && basisEnd
      ? formatWindow(basisStart, basisEnd, result.calendarBasis.timezone)
      : result.calendarBasis.forecastRangeLabel;
  const currentBasisLabel = result.currentWeather?.observedAt
    ? `当前实况：${formatFullDateTime(result.currentWeather.observedAt)}`
    : `当前参考：${dateLabelForResultClient(result, result.targetDates[0] ?? "")}`;
  const nearTermBasisLabel = `近时段参考：${sectionWindowLabel}`;
  const tripBasisLabel = `装备参考：${sectionWindowLabel}`;

  return {
    sectionWindowLabel,
    currentBasisLabel,
    nearTermBasisLabel,
    tripBasisLabel,
    description: `${currentBasisLabel}；${nearTermBasisLabel}。气温、云层、降水、风和体感只按这个时间范围解释。`,
  };
}

function firstValidTime(...values: readonly (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && Number.isFinite(Date.parse(value)));
}

function nearTermWindowEnd(startTime: string, forecastEnd: string): string {
  const startTimestamp = Date.parse(startTime);
  const forecastEndTimestamp = Date.parse(forecastEnd);
  if (!Number.isFinite(startTimestamp)) {
    return forecastEnd;
  }

  const sixHoursLater = shiftTime(startTime, 6 * 60);
  const sixHoursLaterTimestamp = Date.parse(sixHoursLater);
  if (
    Number.isFinite(forecastEndTimestamp) &&
    Number.isFinite(sixHoursLaterTimestamp) &&
    forecastEndTimestamp > startTimestamp
  ) {
    return new Date(Math.min(forecastEndTimestamp, sixHoursLaterTimestamp)).toISOString();
  }
  return sixHoursLater;
}

export function SourceDiagnosticsPanel({ result }: { readonly result: ForecastCalculationResult }) {
  const meteoblue = weatherProviderSummary(result, "meteoblue");
  const meteobluePartial = sourceSucceeded(meteoblue) && meteoblue?.partial === true;

  return (
    <Card className="p-4 shadow-sm min-[900px]:col-span-2 min-[1280px]:col-span-5">
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

function CompactInfoCard({
  title,
  value,
  detail,
  badge,
  timeBasis,
  tone = "default",
}: {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly badge?: string;
  readonly timeBasis?: string;
  readonly tone?: "default" | "success" | "warning";
}) {
  return (
    <Card className="p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-card-foreground">{title}</p>
        {badge ? (
          <Badge
            variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "muted"}
          >
            {badge}
          </Badge>
        ) : null}
      </div>
      {timeBasis ? <p className="mt-2 text-xs font-semibold text-accent-strong">{timeBasis}</p> : null}
      <p className="mt-3 break-words text-lg font-bold leading-6 text-card-foreground">{value}</p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
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

function comfortLevelLabel(
  level: ForecastCalculationResult["clothingGuide"]["comfortLevel"],
): string {
  const labels: Record<ForecastCalculationResult["clothingGuide"]["comfortLevel"], string> = {
    unknown: "证据不足",
    comfortable: "舒适",
    cool: "偏凉",
    cold: "寒冷",
    very_cold: "严寒",
    hot: "炎热",
    humid: "潮湿",
    windy: "多风",
    rainy: "有雨",
  };
  return labels[level];
}

function weatherReadinessLabel(result: ForecastCalculationResult): string {
  if (result.weatherDataFreshness === "stale" || result.weatherEvidenceStatus === "stale") {
    return "旧缓存，仅供核对";
  }
  if (result.weatherDataMode === "real") {
    return "实况与预报已更新";
  }
  if (result.weatherDataMode === "fallback") {
    return "真实天气暂不可用";
  }
  return "体验参考";
}

function judgmentConfidenceText(result: ForecastCalculationResult): string {
  const level = result.weatherFusionSummary?.confidenceLevel;
  if (level === "high") {
    return "当前判断可信度：较高";
  }
  if (level === "medium") {
    return "当前判断可信度：中等";
  }
  return result.weatherDataMode === "real" ? "当前判断可信度：中等" : "当前判断可信度：偏低";
}

function auxiliaryDataNotice(result: ForecastCalculationResult): string {
  if (result.weatherDataMode === "fallback") {
    return "真实天气暂不可用，当前结果仅供体验参考。";
  }
  if (result.weatherMissingFields.length > 0 || result.weatherMissingDataNotes.length > 0) {
    return "部分辅助指标缺失，建议结合现场云层变化复核。";
  }
  return "云层与能见度已纳入判断。";
}

function dailyDecisionBadgeVariant(label: string | undefined): BadgeVariant {
  if (!label) {
    return "muted";
  }
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("强推荐") || label.includes("推荐安排")) {
    return "default";
  }
  if (label.includes("谨慎") || label.includes("观察") || label.includes("等待")) {
    return "accent";
  }
  return "muted";
}

function finalDecisionScore(result: ForecastCalculationResult): number {
  return result.finalScore ?? result.overallScore;
}

function finalRecommendationLabel(result: ForecastCalculationResult): string {
  return result.finalRecommendationLabel ?? result.recommendationLabel;
}

function departureRecommendationLabel(result: ForecastCalculationResult): string {
  if (result.finalTripDecisionLabel) {
    return result.finalTripDecisionLabel;
  }
  const recommendationLabel = finalRecommendationLabel(result);
  const decisionScore = finalDecisionScore(result);
  const firstDailyDecision = result.target === "general" ? result.dailySummaries[0] : undefined;
  if (firstDailyDecision?.dedicatedTripRecommendation === "不建议专程前往") {
    return firstDailyDecision.nearbyObservationRecommendation === "已在附近可观察"
      ? "已在附近可观察"
      : "不建议专程前往";
  }
  if (firstDailyDecision?.dedicatedTripRecommendation) {
    return firstDailyDecision.dedicatedTripRecommendation;
  }

  if (recommendationLabel.includes("不建议") || decisionScore < 45) {
    return "不建议专程前往";
  }
  if (recommendationLabel.includes("谨慎") || decisionScore < 65) {
    return "谨慎参考";
  }
  if (recommendationLabel.includes("强推荐")) {
    return "强推荐专程";
  }
  return "推荐安排";
}

function normalizeRecommendationLabel(label: string): string {
  if (label.includes("不建议")) {
    return "不建议专程前往";
  }
  if (label.includes("谨慎")) {
    return "谨慎参考";
  }
  if (label.includes("等待")) {
    return "推荐安排";
  }
  if (label.includes("强推荐")) {
    return "强推荐专程";
  }
  return "推荐安排";
}

function recommendationBadgeVariant(label: string): BadgeVariant {
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("谨慎") || label.includes("等待")) {
    return "accent";
  }
  return "default";
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

function primaryReasonSentence(result: ForecastCalculationResult): string {
  return userFacingResultText(result.finalDecisionSummaryZh ?? firstText(result.keyReasons, result.summary));
}

function arrivalAdviceValue(
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
  timezone = "Asia/Shanghai",
): string {
  if (!window) {
    return "等待更新";
  }
  if (window.windowLevel === "watchable" || window.windowLevel === "blocked") {
    return "暂无专程到达建议";
  }
  if ("arrivalFullLabel" in window && window.arrivalFullLabel) {
    return window.arrivalFullLabel;
  }
  if (window.arrivalAdvice?.recommendedArrivalLabel) {
    return formatArrivalDeadlineZh(window.arrivalAdvice.recommendedArrivalTime, timezone);
  }
  const arrivalTime = shiftTime(window.startTime, -50);
  return formatArrivalDeadlineZh(arrivalTime, timezone);
}

function arrivalAdviceDetail(
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
  timezone = "Asia/Shanghai",
): string {
  if (!window) {
    return "暂无明确高分窗口，先等待下一次预报更新，不建议为单一窗口赶路。";
  }
  if (window.windowLevel === "watchable" || window.windowLevel === "blocked") {
    return window.copyReasonZh ?? "当前只有可观察或备选信号，不建议按专程拍摄窗口安排到达时间。";
  }

  if (window.arrivalAdvice) {
    const warning = window.arrivalAdvice.warningZh ? ` ${window.arrivalAdvice.warningZh}` : "";
    return `${arrivalAdviceValue(window, timezone)}。${window.arrivalAdvice.reasonZh}${warning}`;
  }

  return `最佳窗口 ${formatWindow(window.startTime, window.endTime, timezone)}，${formatArrivalDeadlineZh(
    shiftTime(window.startTime, -50),
    timezone,
  )}，完成取景、三脚架和防护准备。`;
}

function averagePair(left: number | undefined, right: number | undefined): number | undefined {
  if (typeof left === "number" && typeof right === "number") {
    return (left + right) / 2;
  }
  return left ?? right;
}

function terrainModeForResult(result: ForecastCalculationResult | undefined) {
  return classifyTerrainMode(result?.terrainAnalysis?.terrainProfile ?? {});
}

function resultUsesMountainSemantics(result: ForecastCalculationResult | undefined): boolean {
  return terrainModeUsesMountainSemantics(terrainModeForResult(result));
}

function resultUsesLowlandSemantics(result: ForecastCalculationResult | undefined): boolean {
  return terrainModeUsesLowlandSemantics(terrainModeForResult(result));
}

function terrainCorrectionUserNote(
  result: ForecastCalculationResult,
  current: ForecastCalculationResult["currentWeather"] | undefined,
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
): string {
  const terrainProfile = result.terrainAnalysis.terrainProfile;
  const usesMountainSemantics = resultUsesMountainSemantics(result);
  const usesLowlandSemantics = resultUsesLowlandSemantics(result);
  const correctionApplied =
    current?.terrainAdjustmentApplied ?? weather?.temperatureCorrectionApplied ?? false;
  const correctionReason =
    current?.terrainAdjustmentReason ?? weather?.temperatureCorrectionReason ?? "";
  const windRisk = current?.exposedRidgeWindRisk ?? weather?.exposedRidgeWindRisk;
  const tripodRisk = current?.tripodStabilityRisk ?? weather?.tripodStabilityRisk;
  const lowConfidence = terrainProfile.elevationConfidence === "low";

  if (lowConfidence) {
    return "海拔资料暂未确认，体感仅作参考。";
  }
  if (windRisk === "high" || tripodRisk === "high") {
    return (
      current?.windChillNoteZh ??
      weather?.windChillNoteZh ??
      (usesMountainSemantics
        ? "山脊风风险较高，三脚架和人员站位需留余量。"
        : "阵风影响较明显，三脚架和人员站位需留余量。")
    );
  }
  if (usesLowlandSemantics) {
    return "预报接近该地点海拔，未额外修正。";
  }
  if (correctionApplied) {
    return "已结合机位海拔做轻量修正。";
  }
  if (
    correctionReason === "provider_elevation_close_to_spot" ||
    correctionReason === "provider_terrain_aware_no_extra_correction"
  ) {
    return "预报已接近机位海拔，未额外修正。";
  }
  return weather?.clothingRiskNoteZh ?? current?.clothingRiskNoteZh ?? "";
}

function dailyTemperatureRangeText(
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  displayTemperatureContext?: CloudSeaForecastViewModel["displayTemperatureContext"],
): string {
  if (displayTemperatureContext) {
    const rangeText = formatTemperatureRange(displayTemperatureContext.displayTemperatureRangeC);
    const feelsLikeText = displayTemperatureContext.bodyFeelRangeC
      ? `${displayTemperatureContext.isHighMountainTemperatureSensitive ? "山地体感" : "体感温度"} ${formatTemperatureRange(
          displayTemperatureContext.bodyFeelRangeC,
        )}`
      : "高山体感需复核";
    return `${displayTemperatureContext.userTemperatureTitleZh}：${rangeText}｜${feelsLikeText}｜${displayTemperatureContext.basisLabelZh}`;
  }

  const prefix = terrainTemperaturePrefix(result, weatherVariableConsistencyContext);
  if (!weather) {
    return `${prefix}：暂缺`;
  }

  const temperature =
    typeof weather.tempMin === "number" && typeof weather.tempMax === "number"
      ? `${Math.round(weather.tempMin)}-${Math.round(weather.tempMax)}°C`
      : formatTemperature(averagePair(weather.tempMin, weather.tempMax));
  const feelsLikeMin = weather.mountainFeelsLikeMin ?? weather.feelsLikeMin;
  const feelsLikeMax = weather.mountainFeelsLikeMax ?? weather.feelsLikeMax;
  const feelsLikeLabel = resultUsesMountainSemantics(result)
    ? "山地体感"
    : terrainModeForResult(result) === "hill"
      ? "山地/丘陵体感"
      : "体感温度";
  const feelsLike =
    typeof feelsLikeMin === "number" && typeof feelsLikeMax === "number"
      ? `${feelsLikeLabel} ${Math.round(feelsLikeMin)}-${Math.round(feelsLikeMax)}°C`
      : `${feelsLikeLabel} ${formatTemperature(averagePair(feelsLikeMin, feelsLikeMax))}`;

  return `${prefix}：${temperature}｜${feelsLike}｜${temperatureCorrectionText(weather, result)}`;
}

function mountainTemperatureValue(
  current: ForecastCalculationResult["currentWeather"] | undefined,
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  displayTemperatureContext?: CloudSeaForecastViewModel["displayTemperatureContext"],
): string {
  if (displayTemperatureContext) {
    const feelsLike =
      displayTemperatureContext.bodyFeelTemperatureC === null
        ? "高山体感需复核"
        : `${
            displayTemperatureContext.isHighMountainTemperatureSensitive ? "山地体感" : "体感温度"
          } ${formatTemperature(displayTemperatureContext.bodyFeelTemperatureC)}`;
    return `${displayTemperatureContext.userTemperatureTitleZh}：${formatTemperature(
      displayTemperatureContext.displayTemperatureC,
    )} / ${feelsLike}`;
  }

  const basisContext = weatherVariableConsistencyContext?.temperatureBasisContext;
  const basisTemperature =
    basisContext?.isHighMountainTemperatureSensitive === true
      ? basisContext.displayTemperatureC
      : null;
  const temperature =
    basisTemperature ?? current?.temperature ?? averagePair(weather?.tempMin, weather?.tempMax);
  const fallbackFeelsLike =
    resultUsesMountainSemantics(result) || terrainModeForResult(result) === "hill"
      ? current?.mountainFeelsLikeC ??
        current?.feelsLike ??
        averagePair(weather?.mountainFeelsLikeMin, weather?.mountainFeelsLikeMax) ??
        averagePair(weather?.feelsLikeMin, weather?.feelsLikeMax)
      : current?.feelsLike ??
        averagePair(weather?.feelsLikeMin, weather?.feelsLikeMax) ??
        current?.mountainFeelsLikeC ??
        averagePair(weather?.mountainFeelsLikeMin, weather?.mountainFeelsLikeMax);
  const feelsLike =
    basisContext?.isHighMountainTemperatureSensitive === true &&
    basisContext.bodyFeelTemperatureC !== null
      ? basisContext.bodyFeelTemperatureC
      : fallbackFeelsLike;
  const feelsLikeLabel = resultUsesMountainSemantics(result)
    ? "山地体感"
    : terrainModeForResult(result) === "hill"
      ? "山地/丘陵体感"
      : "体感温度";
  return `${terrainTemperaturePrefix(result, weatherVariableConsistencyContext)}：${formatTemperature(
    temperature,
  )} / ${feelsLikeLabel} ${formatTemperature(feelsLike)}`;
}

function terrainTemperaturePrefix(
  result: ForecastCalculationResult | undefined,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
): string {
  const basisContext = weatherVariableConsistencyContext?.temperatureBasisContext;
  if (basisContext?.isHighMountainTemperatureSensitive) {
    if (
      basisContext.temperatureBasis === "raw_grid" ||
      basisContext.temperatureBasis === "provider_point" ||
      basisContext.temperatureBasis === "unknown"
    ) {
      return "原始格点温度";
    }
    return "机位估算温度";
  }
  if (resultUsesMountainSemantics(result)) {
    return result?.terrainAnalysis?.terrainProfile?.elevationConfidence === "low"
      ? "机位参考温度"
      : "机位估算温度";
  }
  return "机位估算温度";
}

function temperatureCorrectionText(
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
): string {
  if (!weather) {
    return "温度修正待复核";
  }
  if (resultUsesLowlandSemantics(result)) {
    return "预报接近该地点海拔，未额外修正";
  }
  if (weather.temperatureCorrectionApplied) {
    return "已结合机位海拔做轻量修正";
  }
  if (
    weather.temperatureCorrectionReason === "provider_elevation_close_to_spot" ||
    weather.temperatureCorrectionReason === "provider_terrain_aware_no_extra_correction"
  ) {
    return "预报已接近机位海拔，未额外修正";
  }
  return "未额外修正";
}

function temperatureActionText(
  current: ForecastCalculationResult["currentWeather"] | undefined,
  weather: ForecastCalculationResult["dailySummaries"][number]["weather"] | undefined,
  result?: ForecastCalculationResult,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  displayTemperatureContext?: CloudSeaForecastViewModel["displayTemperatureContext"],
): string {
  if (displayTemperatureContext) {
    if (displayTemperatureContext.basis === "raw_grid_with_warning") {
      return displayTemperatureContext.clothingAdviceZh;
    }
    const feelsLike =
      displayTemperatureContext.bodyFeelTemperatureC ??
      displayTemperatureContext.displayTemperatureC;
    if (typeof feelsLike === "number" && feelsLike <= 5) {
      return "风寒感明显，提前加保暖层。";
    }
    if (typeof feelsLike === "number" && feelsLike >= 28) {
      return "体感偏热，注意补水和遮阳。";
    }
    return displayTemperatureContext.clothingAdviceZh;
  }

  if (hasTemperatureBasisWarning(weatherVariableConsistencyContext)) {
    return (
      weatherVariableConsistencyContext?.temperatureBasisContext.actionAdviceModifierZh ||
      "高山机位体感需临近复核，按更冷一档准备。"
    );
  }
  const feelsLike = current?.feelsLike ?? averagePair(weather?.feelsLikeMin, weather?.feelsLikeMax);
  if (typeof feelsLike === "number" && feelsLike <= 5) {
    return "风寒感明显，提前加保暖层。";
  }
  if (typeof feelsLike === "number" && feelsLike >= 28) {
    return "体感偏热，注意补水和遮阳。";
  }
  return resultUsesMountainSemantics(result)
    ? "按分层穿法准备，山顶体感仍需现场复核。"
    : "按清晨体感准备，现场复核风口、湿度和遮挡。";
}

function cloudVisibilityActionText(result: ForecastCalculationResult): string {
  if (result.scores.whiteoutRisk.score >= 70) {
    return resultUsesMountainSemantics(result)
      ? "白墙风险偏高，先观察云雾上沿。"
      : "低云或雾气影响偏高，先观察通透度。";
  }
  if (result.scores.transparency.score >= 70) {
    return "通透度较好，适合安排远景层次。";
  }
  return "通透度一般，保留近景和云层纹理备选。";
}

function precipitationDisplayValue(
  weather:
    | ForecastCalculationResult["dailySummaries"][number]["weather"]
    | ForecastCalculationResult["currentWeather"]
    | undefined,
  precipitationSignalContext?: CloudSeaForecastViewModel["precipitationSignal"],
): string {
  const amount =
    weather?.precipitationAmountMm ??
    weather?.precipitation ??
    weather?.rainAmountMm ??
    precipitationSignalContext?.maxAmountMm;
  const probability =
    normalizePrecipitationProbabilityPercent(
      (weather && "precipitationProbabilityPercent" in weather
        ? weather.precipitationProbabilityPercent
        : undefined) ?? weather?.precipitationProbability,
      amount,
    ) ?? precipitationSignalContext?.maxProbabilityPercent;
  return `降水概率 ${formatPercentNumber(probability)} / 预计雨量 ${formatPrecipitationAmount(amount)}`;
}

function precipitationDisplayDetail(
  weather:
    | ForecastCalculationResult["dailySummaries"][number]["weather"]
    | ForecastCalculationResult["currentWeather"]
    | undefined,
  precipitationSignalContext?: CloudSeaForecastViewModel["precipitationSignal"],
): string {
  if (precipitationSignalContext) {
    return precipitationSignalContext.userSummaryZh;
  }
  return rainRiskText(weather).detail;
}

function windPrecipitationActionText(
  result: ForecastCalculationResult,
  weather:
    | ForecastCalculationResult["dailySummaries"][number]["weather"]
    | ForecastCalculationResult["currentWeather"]
    | undefined,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  precipitationSignalContext?: CloudSeaForecastViewModel["precipitationSignal"],
): string {
  if (precipitationSignalContext?.shouldDowngradeWindow) {
    return precipitationSignalContext.actionAdviceZh;
  }
  if (
    precipitationSignalContext &&
    precipitationSignalContext.precipitationSignalType !== "none" &&
    precipitationSignalContext.precipitationSignalType !== "unknown"
  ) {
    return precipitationSignalContext.actionAdviceZh;
  }
  if (weatherVariableConsistencyContext?.shouldDowngradePrecipitationWording) {
    return "降水概率和雨量分开判断，准备防潮和轻量防雨，关注局地短时小雨。";
  }
  const rainRisk = result.riskFlags.find((risk) => risk.key === "precipitation");
  const windRisk = result.riskFlags.find((risk) => risk.key === "wind");
  if (rainRisk && isProbabilityOnlyPrecipitationSignal(weather)) {
    return "降水概率和雨量信号不一致，暂不按确定降水处理，出发前复核短临雷达和实况。";
  }
  if (rainRisk) {
    return "降水干扰需优先规避。";
  }
  if (windRisk) {
    return resultUsesMountainSemantics(result)
      ? "注意三脚架稳定和山顶风寒。"
      : "注意阵风影响和三脚架稳定。";
  }
  return "风雨对拍摄干扰相对可控。";
}

function normalizePrecipitationProbabilityPercent(
  value: number | null | undefined,
  amount?: number | null,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (typeof amount === "number" && Number.isFinite(amount) && amount > 0 && value <= 0) {
    return undefined;
  }
  return value > 0 && value <= 1 ? value * 100 : value;
}

function formatPrecipitationAmount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "缺测";
  }
  return `${Math.round(value * 10) / 10} mm`;
}

function dewPointActionText(
  value: number | null | undefined,
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
): string {
  if (weatherVariableConsistencyContext?.humidityDewPointStatus === "conflict") {
    return "水汽指标存在口径差异，湿度与露点差需结合临近预报复核，不宜仅凭湿度判断云海。";
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "露点差暂缺，雾气和结露需现场复核。";
  }
  if (value <= 2) {
    return "露点差很小，雾气、结露和云雾变化会更敏感。";
  }
  if (value <= 5) {
    return "露点差偏小，清晨云雾变化值得关注。";
  }
  return "露点差相对拉开，云雾突变概率较低。";
}

function packingMainValue(
  guide: ForecastCalculationResult["clothingGuide"],
  displayTemperatureContext?: CloudSeaForecastViewModel["displayTemperatureContext"],
): string {
  if (
    displayTemperatureContext &&
    (displayTemperatureContext.isHighMountainTemperatureSensitive ||
      displayTemperatureContext.basis === "raw_grid_with_warning")
  ) {
    return displayTemperatureContext.equipmentAdviceZh;
  }
  return clothingEquipmentAdvice(guide)[1] ?? guide.titleZh;
}

function packingDetail(
  guide: ForecastCalculationResult["clothingGuide"],
  weatherVariableConsistencyContext?: CloudSeaWeatherVariableConsistencyContext,
  displayTemperatureContext?: CloudSeaForecastViewModel["displayTemperatureContext"],
): string {
  const base = clothingEquipmentAdvice(guide)[0] ?? guide.summaryZh;
  const extra = [
    displayTemperatureContext
      ? displayTemperatureContext.clothingAdviceZh
      : hasTemperatureBasisWarning(weatherVariableConsistencyContext)
        ? weatherVariableConsistencyContext?.temperatureBasisContext.clothingAdviceModifierZh ||
          "高山体感可能更冷，按机位修正温度准备。"
        : undefined,
    weatherVariableConsistencyContext?.shouldDowngradePrecipitationWording
      ? "降水按局地短时扰动准备轻量防雨。"
      : undefined,
  ].filter((item): item is string => Boolean(item));
  return extra.length > 0 ? `${base}${extra.join("")}` : base;
}

function hasTemperatureBasisWarning(
  context: CloudSeaWeatherVariableConsistencyContext | undefined,
): boolean {
  return (
    context?.shouldLowerComfortEquipmentConfidence === true ||
    context?.temperatureBasisContext.shouldShowTemperatureBasisNote === true ||
    context?.temperatureBasisStatus === "mixed" ||
    context?.temperatureBasisStatus === "raw_grid" ||
    context?.temperatureBasisStatus === "provider_point" ||
    context?.temperatureBasisStatus === "unknown"
  );
}

type RiskDecisionItem = {
  readonly label: string;
  readonly levelLabel: string;
  readonly timeWindow: string;
  readonly action: string;
};

function buildRiskDecisionItems(
  result: ForecastCalculationResult,
  mainRisk: ForecastResultSectionItem,
): readonly RiskDecisionItem[] {
  const explicitRisks = result.riskFlags.map((risk) => riskDecisionFromFlag(result, risk));
  const riskItems =
    explicitRisks.length > 0 ? explicitRisks : [riskDecisionFromSection(result, mainRisk)];
  const usesMountainSemantics = resultUsesMountainSemantics(result);
  const whiteoutItem =
    result.scores.whiteoutRisk.score >= 60
      ? [
          {
            label: usesMountainSemantics ? "白墙风险" : "低云遮挡",
            levelLabel: result.scores.whiteoutRisk.score >= 75 ? "高风险" : "中风险",
            timeWindow: fallbackRiskTimeLabel(result, "whiteout") ?? "清晨窗口前后",
            action: usesMountainSemantics
              ? "到场观察云顶高度，避免只守单一机位。"
              : "关注雾气厚度、低云遮挡和通透度变化。",
          },
        ]
      : [];

  return dedupeRiskDecisionItems([...riskItems, ...whiteoutItem]).slice(0, 4);
}

function riskDecisionFromFlag(
  result: ForecastCalculationResult,
  risk: ForecastRiskFlag,
): RiskDecisionItem {
  return {
    label: risk.label,
    levelLabel: `${riskLevelText(risk.level)}风险`,
    timeWindow: risk.timeWindowLabelZh ?? fallbackRiskTimeLabel(result, risk.key) ?? "出行前复核",
    action: riskActionText(result, risk.key, risk.description),
  };
}

function riskDecisionFromSection(
  result: ForecastCalculationResult,
  item: ForecastResultSectionItem,
): RiskDecisionItem {
  return {
    label: item.label,
    levelLabel: item.value ?? "低风险",
    timeWindow: buildNearTermWeatherTimeContext(result).sectionWindowLabel ?? "出行前复核",
    action: compactRiskActionFromText(item.detail),
  };
}

function riskActionText(result: ForecastCalculationResult, key: string, detail: string): string {
  if (key === "precipitation") {
    return "防水收纳，清晨窗口需复核临近预报。";
  }
  if (key === "whiteout" || key === "low_cloud") {
    return resultUsesMountainSemantics(result)
      ? "到场观察云顶高度，避免只守单一机位。"
      : "关注雾气厚度、低云遮挡和通透度变化。";
  }
  if (key === "wind") {
    return resultUsesMountainSemantics(result)
      ? "三脚架加重，山脊位置留安全余量。"
      : "三脚架加重，空旷位置留安全余量。";
  }
  if (key === "visibility") {
    return "优先准备中近景构图，远景层次现场再定。";
  }

  return compactRiskActionFromText(detail);
}

function compactRiskActionFromText(detail: string): string {
  const withoutTime = detail.replace(/重点时段：[^。]+。?/g, "").trim();
  return withoutTime ? firstSentence(withoutTime) : "出行前复核最新天气、道路和景区开放信息。";
}

function dedupeRiskDecisionItems(items: readonly RiskDecisionItem[]): readonly RiskDecisionItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.label)) {
      return false;
    }
    seen.add(item.label);
    return true;
  });
}

function riskDetailWithTime(result: ForecastCalculationResult, risk: ForecastRiskFlag): string {
  return appendRiskTimeContext(
    risk.description,
    risk.timeWindowLabelZh ?? fallbackRiskTimeLabel(result, risk.key),
  );
}

function appendRiskTimeContext(detail: string, timeLabel: string | undefined): string {
  const cleanDetail = detail.trim().replace(/[。.]$/, "");
  if (!timeLabel) {
    return `${cleanDetail}。`;
  }
  if (cleanDetail.includes(timeLabel)) {
    return `${cleanDetail}。`;
  }
  return `${cleanDetail}。重点时段：${timeLabel}。`;
}

function fallbackRiskTimeLabel(
  result: ForecastCalculationResult,
  riskKey: string,
): string | undefined {
  if (riskKey === "whiteout" || riskKey === "low_cloud") {
    const whiteoutDay = [...result.cloudSeaAnalysis.dailyCloudSea]
      .filter((day) => day.whiteoutRiskScore >= 50)
      .sort((left, right) => right.whiteoutRiskScore - left.whiteoutRiskScore)[0];
    if (whiteoutDay?.bestWindow) {
      return formatWindow(
        whiteoutDay.bestWindow.startTime,
        whiteoutDay.bestWindow.endTime,
        result.calendarBasis.timezone,
      );
    }
    return formatDateBlockLabel(result, result.targetDates[0], "清晨窗口前后");
  }

  if (riskKey === "precipitation") {
    const precipitationDay = result.dailySummaries.find((summary) => {
      const level = summary.weather?.precipitationRisk?.rainRiskLevel;
      return level === "medium" || level === "high" || level === "severe";
    });
    if (precipitationDay) {
      return formatDateBlockLabel(
        result,
        precipitationDay.date,
        precipitationDay.weather?.maxRainRiskWindow ??
          precipitationDay.weather?.affectedPrecipitationWindows?.[0] ??
          "当日降水时段",
      );
    }
  }

  if (riskKey === "wind") {
    const windDay = [...result.dailySummaries]
      .filter((summary) => typeof summary.weather?.windGust === "number")
      .sort((left, right) => (right.weather?.windGust ?? 0) - (left.weather?.windGust ?? 0))[0];
    if (windDay) {
      return formatDateBlockLabel(result, windDay.date, "风力较强时段");
    }
  }

  if (riskKey === "visibility") {
    const visibilityDay = [...result.dailySummaries]
      .filter((summary) => typeof summary.weather?.visibility === "number")
      .sort(
        (left, right) => (left.weather?.visibility ?? 99) - (right.weather?.visibility ?? 99),
      )[0];
    if (visibilityDay) {
      return formatDateBlockLabel(result, visibilityDay.date, "低能见度时段");
    }
  }

  return buildNearTermWeatherTimeContext(result).sectionWindowLabel;
}

function formatDateBlockLabel(
  result: ForecastCalculationResult,
  date: string | undefined,
  blockLabel: string,
): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${dateLabelForResultClient(result, date)} ${blockLabel}`;
}

function subjectActionSuggestion(key: SubjectScoreKey, score: number): string {
  if (key === "cloudSea") {
    return score >= 70 ? "提前到达，先守清晨云海窗口。" : "作为备选，现场重点看低云上沿。";
  }
  if (key === "sunriseGlow") {
    return score >= 70 ? "日出前完成构图，等待云缝和色温变化。" : "只作为清晨备选。";
  }
  if (key === "sunsetGlow") {
    return score >= 70 ? "下午提前踩点，保留日落前后机动窗口。" : "晚霞信号一般，转向云层纹理。";
  }
  if (key === "stars") {
    return score >= 70 ? "夜间可安排星空窗口，注意月光和云量复核。" : "夜景作为备选。";
  }
  if (key === "milkyWay") {
    return score >= 70 ? "银河窗口可纳入计划，提前确认前景和安全通行。" : "银河不宜作为唯一目标。";
  }
  return score >= 70 ? "适合远山层次和长焦景别。" : "通透度一般，优先准备中近景构图。";
}

function astroMainBlockers(
  result: ForecastCalculationResult,
  day: DailyAstroLike | undefined,
): readonly string[] {
  const labels = day?.labels ?? result.astroAnalysis.labels;
  const rawBlockers = day?.weatherBlockers ?? result.astroAnalysis.weatherBlockers;
  const text = rawBlockers.join(" ");
  const blockers = [
    /低云/.test(text) || labels.cloudBlocker === "高" ? "低云偏多" : "",
    /总云|云量|云层|厚云/.test(text) ? "云量偏高" : "",
    /降水|雨|雪/.test(text) ? "降水干扰" : "",
    labels.moonlightImpact === "高" || /月光/.test(text) ? "月光影响" : "",
    labels.dewRisk === "高" || /露|结露|湿度/.test(text) ? "露水风险" : "",
    /通透|能见度|霾|雾/.test(text) ? "通透度不足" : "",
  ].filter(Boolean);

  if (blockers.length > 0) {
    return [...new Set(blockers)].slice(0, 4);
  }

  if (rawBlockers.length > 0) {
    return rawBlockers.map((blocker) => blocker.replace(/[。.]$/, "")).slice(0, 3);
  }

  return result.astroAnalysis.astroShootable ? [] : ["云量/低云/降水条件"];
}

function formatAstroWindowForUi(window: AstroWindowLike, timezone = "Asia/Shanghai"): string {
  return formatLocalDateTimeRange(window.start, window.end, timezone);
}

function InvalidQueryCard({ message }: { readonly message?: string }) {
  return (
    <Card className="border-warning p-5 shadow-sm">
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
          <Card className="border-warning p-5 shadow-sm">
            <Badge variant="warning">天气证据不足</Badge>
            <h2 className="mt-3 text-xl font-bold text-card-foreground">
              当前没有足够的新鲜天气数据
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {result.weatherEvidenceReasonZh ??
                "实时天气请求失败，旧缓存不能作为当前出发或拍摄结论。"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              缓存生成时间：{formatDateTime(result.generatedAt)}。请稍后重试，或以权威临近预报和现场观测为准。
            </p>
          </Card>
        </main>
      </DashboardFrame>
    );
  }

  if (viewModel.target === "general") {
    return (
      <ComprehensiveForecastView
        query={query}
        result={result}
        viewModel={viewModel}
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
  const travelDecision = deriveCloudSeaTravelDecision(viewModel);

  return (
    <DecisionResultTemplate
      target="cloud_sea"
      className="CloudSeaResultPage cloud-sea-result-page grid gap-4"
      dataCloudSeaSection="CloudSeaResultPage"
      dataCloudSeaPageMode="result"
    >
      <main
        className="CloudSeaResultStack grid w-full min-w-0 gap-4"
        data-forecast-decision-layout="stacked"
      >
        <section
          className="CloudSeaWindowDecision cloud-sea-window-decision grid gap-4"
          data-cloud-sea-section="CloudSeaWindowDecision"
        >
          <CloudSeaTopResultHeader query={query} displayData={viewModel.displayData} />
          <CloudSeaMetricCards cards={viewModel.displayData.recommendationCards} />
          <CloudSeaNearTermWeatherSection display={viewModel.displayData.currentNearTermWeather} />
          <CloudSeaWindowCardsSection
            windows={viewModel.displayData.cloudSeaWindowCards}
            terrainContext={viewModel.terrainContext}
            travelDecision={travelDecision}
          />
          {returnUrl ? <CloudSeaReturnLink href={returnUrl} /> : null}
        </section>
        <section
          className="CloudSeaDailyCards cloud-sea-daily-cards grid gap-3"
          data-cloud-sea-section="CloudSeaDailyCards"
        >
          <CloudSeaDailyTrend
            result={result}
            items={viewModel.displayData.dailyJudgment}
            terrainContext={viewModel.terrainContext}
          />
        </section>
        <CloudSeaDecisionSupportSection viewModel={viewModel} />
        <CloudSeaProfessionalDataSection viewModel={viewModel} />
      </main>
    </DecisionResultTemplate>
  );
}

function deriveCloudSeaTravelDecision(
  viewModel: CloudSeaForecastViewModel,
): CloudSeaTravelDecision {
  const displayData = viewModel.displayData;
  const decisionCards = displayData.recommendationCards.filter(
    (card) =>
      card.key === "cloud-sea-recommendation" ||
      card.key === "cloud-sea-best-window" ||
      card.key === "cloud-sea-arrival",
  );
  const decisionActions = displayData.actionPlan.filter(
    (item) => item.key === "departure" || item.key === "arrival" || item.key === "main-window",
  );
  const decisionText = [
    displayData.header.recommendationLabel,
    displayData.header.bestWindowLabel,
    displayData.header.arrivalLabel,
    displayData.scoreCard.badgeLabel,
    ...decisionCards.flatMap((card) => [card.label, card.value, card.detail]),
    ...decisionActions.flatMap((item) => [item.label, item.value, item.detail]),
  ].join(" ");

  if (/不建议|暂不安排(?:行程|出发)|不安排(?:专程|出发|行程)/.test(decisionText)) {
    return "no_go";
  }

  if (
    /谨慎参考|仅作备选|仅供备选|备选观察|到达参考|参考窗口|低云\/晨雾参考窗口|已在附近|顺带观察|不把[^。；]*确定行程|需临近预报复核/.test(
      decisionText,
    )
  ) {
    return "cautious";
  }

  return "go";
}

function cloudSeaPanelClassName(className?: string): string {
  return cn("rounded-lg border border-border bg-card shadow-sm", className);
}

function cloudSeaCompactCardClassName(className?: string): string {
  return cloudSeaPanelClassName(cn("p-3", className));
}

function cloudSeaToneClassName(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "text-primary",
    accent: "text-card-foreground",
    danger: "text-danger",
    info: "text-primary",
    muted: "text-card-foreground",
  };

  return toneClasses[tone];
}

function cloudSeaToneBarClassName(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "bg-primary",
    accent: "bg-warning",
    danger: "bg-danger",
    info: "bg-primary",
    muted: "bg-muted-foreground",
  };

  return toneClasses[tone];
}

function cloudSeaToneBorderClassName(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "border-primary/40",
    accent: "border-warning/35",
    danger: "border-danger/35",
    info: "border-info/35",
    muted: "border-border",
  };

  return toneClasses[tone];
}

function CloudSeaDecisionSupportSection({
  viewModel,
}: {
  readonly viewModel: CloudSeaForecastViewModel;
}) {
  return (
    <section
      className="CloudSeaDecisionSupport cloud-sea-decision-support grid gap-3"
      data-cloud-sea-section="CloudSeaDecisionSupport"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-card-foreground">判断依据与行动建议</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            汇总当前判断、出发方案和风险复核；专业小时数据在下方单独查看。
          </p>
        </div>
      </div>
      <CloudSeaReasoningSection items={viewModel.displayData.judgmentBasis} />
      <CloudSeaActionPlanSection items={viewModel.displayData.actionPlan} />
      <CloudSeaRiskSummarySection
        riskSummary={viewModel.displayData.riskReview}
        terrainContext={viewModel.terrainContext}
      />
      {viewModel.dataCaution ? <CloudSeaInlineCaution text={viewModel.dataCaution} /> : null}
    </section>
  );
}

const cloudSeaEmbeddedProfessionalHourlyConfig: ProfessionalHourlySectionConfig = {
  showEmbeddedLeadDescription: false,
};

function CloudSeaProfessionalDataSection({
  viewModel,
}: {
  readonly viewModel: CloudSeaForecastViewModel;
}) {
  return (
    <Card
      className={cloudSeaPanelClassName(
        "CloudSeaProfessionalData cloud-sea-professional-data p-4",
      )}
      data-cloud-sea-section="CloudSeaProfessionalData"
      data-cloud-sea-professional-data-expanded="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-card-foreground">专业数据</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {viewModel.terrainContext?.vocabulary.professionalDescription ??
              "查看逐小时云层、湿度、露点、降水、能见度和风的专业小时表。"}
          </p>
        </div>
      </div>

      {isValidProfessionalHourlyTimeBasis(
        viewModel.displayData.professionalHourlyData.timeBasis,
      ) ? (
        <div
          className="mt-3 grid gap-3"
          data-cloud-sea-professional-data-body="true"
          data-cloud-sea-professional-data-body-expanded="true"
        >
          <CloudSeaProfessionalHourlyDataPanel
            data={viewModel.displayData.professionalHourlyData}
            terrainContext={viewModel.terrainContext}
            variant="embedded"
            config={cloudSeaEmbeddedProfessionalHourlyConfig}
          />
        </div>
      ) : null}
    </Card>
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
    <DecisionResultTemplate target="glow" className="GlowResultPage glow-result-page grid gap-4">
      <main
        className="GlowResultStack glow-result-stack grid w-full min-w-0 gap-4"
        data-glow-section="GlowStackedLayout"
        data-forecast-decision-layout="stacked"
      >
        <section
          className="GlowWindowDecision glow-window-decision grid gap-4"
          data-glow-section="GlowWindowDecision"
        >
          <GlowTopResultHeader query={query} result={result} viewModel={viewModel} />
          <GlowMetricCards cards={viewModel.coreCards} />
          <GlowNearTermWeatherSection viewModel={viewModel} />
        </section>
        <GlowDailyCardsSection opportunities={viewModel.dailyOpportunities} />
        <GlowDecisionSupportSection viewModel={viewModel} />
        <GlowProfessionalDataSection viewModel={viewModel} />
      </main>
    </DecisionResultTemplate>
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
      <AstroTopContext query={query} result={result} viewModel={viewModel} />

      <main
        className="AstroResultLayout astro-result-stack grid gap-5"
        data-astro-section="AstroResultLayout"
      >
        <AstroNightOpportunitySection nights={viewModel.nightlyCards} horizon={result.horizon} />
        <AstroProfessionalDataSection query={query} result={result} viewModel={viewModel} />
      </main>
    </section>
  );
}

function AstroTopContext({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: AstroForecastViewModel;
}) {
  const decision = viewModel.decisionSummary;

  return (
    <section
      className="AstroDecisionFirstDashboard grid gap-4"
      data-astro-section="AstroDecisionFirstDashboard"
      data-astro-decision-first="true"
    >
      <Card
        className="AstroDecisionHero grid w-full min-w-0 gap-4 p-5 shadow-sm min-[900px]:p-6"
        data-astro-decision-hero="true"
        data-astro-decision-layout="single-main"
      >
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">星空银河判断</Badge>
                <Badge variant={dataReadinessBadgeVariant(result)}>
                  {dataReadinessBadgeLabel(result)}
                </Badge>
                <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
              </div>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">{query.name}</p>
              <h1
                className={cn(
                  "mt-2 break-words text-3xl font-bold leading-tight sm:text-4xl",
                  cardToneText(decision.recommendationTone),
                )}
              >
                {decision.recommendationLabel}
              </h1>
            </div>
            <Badge variant={badgeVariantForTone(decision.recommendationTone)}>
              置信度：{decision.confidenceLabel}
            </Badge>
          </div>

          <p className="max-w-5xl text-sm font-semibold leading-6 text-card-foreground">
            {decision.oneSentenceAdvice}
          </p>

          <AstroActionPlanGrid items={viewModel.actionPlan} />

          <dl
            className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))]"
            data-astro-decision-first-metrics="true"
          >
            {viewModel.publicDisplay.decisionFacts.map((item) => (
              <AstroDecisionFact key={item.key} item={item} />
            ))}
          </dl>

          <div className="flex flex-wrap gap-2" data-astro-public-factor-chips="true">
            {viewModel.publicDisplay.factorChips.map((chip) => (
              <AstroDecisionChip key={chip.key} chip={chip} />
            ))}
          </div>
        </div>

        <div className="grid gap-3 border-t border-border pt-4 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-end">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
            <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.assign("/astro");
              }}
            >
              重新选择地点
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.assign(buildForecastUrlFromForecastQuery(query));
              }}
            >
              重新判断
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}

function AstroActionPlanGrid({ items }: { readonly items: AstroForecastViewModel["actionPlan"] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="rounded-lg border border-border bg-secondary/70 p-3"
      data-astro-action-plan="true"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-card-foreground">行动方案</h2>
        <Badge variant="muted">出发前复核</Badge>
      </div>
      <dl className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
        {items.map((item) => (
          <div
            key={item.key}
            className="min-w-0 rounded-md border border-border bg-card px-3 py-2"
            data-astro-action-plan-item={item.key}
          >
            <dt className="text-[11px] font-semibold leading-4 text-muted-foreground">
              {item.label}
            </dt>
            <dd
              className={cn(
                "mt-1 break-words text-sm font-bold leading-5",
                cardToneText(item.tone),
              )}
            >
              {item.value}
            </dd>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {compactAstroText(item.detail, 42)}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AstroDecisionFact({
  item,
}: {
  readonly item: AstroForecastViewModel["publicDisplay"]["decisionFacts"][number];
}) {
  return (
    <div
      className="min-w-0 rounded-lg border border-border bg-muted px-3 py-3"
      data-astro-decision-fact={item.key}
      data-astro-semantic-key={item.semanticKey}
    >
      <dt className="text-[11px] font-semibold leading-4 text-muted-foreground">{item.label}</dt>
      <dd className={cn("mt-1 break-words text-sm font-bold leading-5", cardToneText(item.tone))}>
        {item.value}
      </dd>
      {item.detail ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {compactAstroText(item.detail, 64)}
        </p>
      ) : null}
    </div>
  );
}

function AstroDecisionChip({
  chip,
}: {
  readonly chip: AstroForecastViewModel["publicDisplay"]["factorChips"][number];
}) {
  return (
    <div
      className="min-w-0 rounded-full border border-border bg-card px-3 py-2"
      data-astro-public-factor-chip={chip.key}
      data-astro-semantic-key={chip.semanticKey}
    >
      <p className="text-[11px] font-semibold leading-4 text-muted-foreground">{chip.label}</p>
      <p className={cn("mt-0.5 break-words text-sm font-bold leading-5", cardToneText(chip.tone))}>
        {chip.value}
      </p>
    </div>
  );
}

function AstroNightOpportunitySection({
  nights,
  horizon,
}: {
  readonly nights: AstroForecastViewModel["nightlyCards"];
  readonly horizon: ForecastCalculationResult["horizon"];
}) {
  return (
    <section className="grid gap-3" data-astro-section="AstroNightOpportunitySection">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-card-foreground">逐夜星空银河机会</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            按本地观测夜比较月相、天文黑夜、银河窗口、天气覆盖和是否推荐拍摄。
          </p>
        </div>
        <Badge variant="muted">{forecastHorizonLabels[horizon]}</Badge>
      </div>
      <div
        className="grid gap-3 min-[980px]:grid-cols-2"
        data-astro-night-grid-odd={nights.length % 2 === 1 ? "true" : "false"}
      >
        {nights.map((night, index) => (
          <AstroNightCard
            key={night.nightKey}
            night={night}
            isLastOdd={nights.length % 2 === 1 && index === nights.length - 1}
          />
        ))}
      </div>
    </section>
  );
}

function AstroNightCard({
  night,
  isLastOdd = false,
}: {
  readonly night: AstroForecastViewModel["nightlyCards"][number];
  readonly isLastOdd?: boolean;
}) {
  const compactJudgment = compactAstroNightJudgment(night);
  const windowLabel = night.milkyWay.bestStartAt
    ? night.bestShootingWindowLabel
    : "暂无推荐银河窗口";

  return (
    <article
      className={cn(
        "AstroNightCard grid gap-3 rounded-lg border bg-card p-4 shadow-sm",
        night.recommendationLevel === "recommended" && "border-primary/50 bg-secondary/30",
        night.recommendationLevel === "watch" && "border-info/40",
        night.recommendationLevel === "backup" && "border-accent/40",
        night.recommendationLevel === "not_recommended" && "border-danger/35",
        night.recommendationLevel === "insufficient" && "border-border",
        isLastOdd && "min-[980px]:col-span-2",
      )}
      data-astro-night-card="true"
      data-astro-day-decision-card="true"
      data-astro-night-card-span={isLastOdd ? "full" : "single"}
      data-astro-night-key={night.nightKey}
      data-astro-night-coverage={night.horizonCoverageState}
      data-astro-night-recommendation-level={night.recommendationLevel}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-base font-bold text-card-foreground">
            {night.localEveningDateLabel}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{night.weekdayLabel}夜间</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Badge variant={astroRecommendationBadgeVariant(night.recommendationLevel)}>
            {night.recommendationLabel}
          </Badge>
          {night.isPartiallyCovered ? <Badge variant="warning">部分覆盖</Badge> : null}
        </div>
      </div>

      <div className="grid gap-2 rounded-lg border border-border bg-secondary px-3 py-3 min-[640px]:grid-cols-[minmax(0,1fr)_auto] min-[640px]:items-center">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-4 text-muted-foreground">最佳窗口</p>
          <p className="mt-1 break-words text-sm font-bold leading-5 text-card-foreground">
            {windowLabel}
          </p>
        </div>
        <Badge variant={night.milkyWay.bestStartAt ? "default" : "muted"}>
          {night.horizonCoverageLabel}
        </Badge>
      </div>

      <div
        className="flex flex-wrap gap-2"
        data-astro-night-reason-grid="true"
        data-astro-night-factor-chips="true"
      >
        {night.factorChips.map((chip) => (
          <AstroNightFactorChip key={chip.key} chip={chip} />
        ))}
      </div>

      <p
        className="break-words text-sm font-semibold leading-6 text-card-foreground"
        data-astro-night-judgment={night.judgmentSummary.semanticKey}
      >
        <span className="text-muted-foreground">{night.judgmentSummary.label}：</span>
        <span className={cardToneText(night.judgmentSummary.tone)}>{compactJudgment}</span>
      </p>
      <p
        className="rounded-md border border-border bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground"
        data-testid="astro-night-action-note"
      >
        <span className="font-semibold text-card-foreground">行动：</span>
        {night.actionNote}
      </p>
      {night.unavailableReason ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {night.unavailableReason}
        </p>
      ) : null}
    </article>
  );
}

function AstroNightFactorChip({
  chip,
}: {
  readonly chip: AstroForecastViewModel["nightlyCards"][number]["factorChips"][number];
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-4",
        chip.tone === "primary" && "border-primary/30 bg-primary/10 text-primary",
        chip.tone === "accent" && "border-accent/30 bg-accent/10 text-accent-strong",
        chip.tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        chip.tone === "info" && "border-info/30 bg-info/10 text-info-strong",
        chip.tone === "muted" && "border-border bg-muted text-muted-foreground",
      )}
      data-astro-night-factor-chip={chip.key}
    >
      {chip.label}
    </span>
  );
}

function compactAstroNightJudgment(night: AstroForecastViewModel["nightlyCards"][number]): string {
  return compactAstroText(night.judgmentSummary.value, 58);
}

function compactAstroText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const firstSentence = normalized.split(/[。；;！？]/)[0];
  if (firstSentence && firstSentence.length <= maxLength) {
    return `${firstSentence}。`;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function astroRecommendationBadgeVariant(
  level: AstroForecastViewModel["nightlyCards"][number]["recommendationLevel"],
): BadgeVariant {
  if (level === "recommended") {
    return "default";
  }
  if (level === "watch") {
    return "info";
  }
  if (level === "backup") {
    return "warning";
  }
  if (level === "not_recommended") {
    return "danger";
  }
  return "muted";
}

const astroProfessionalHourlySectionConfig: ProfessionalHourlySectionConfig = {
  sectionTitle: "逐小时天气数据",
  sectionDescription: "按所选预报范围展示云量、能见度、湿度、降水和风等夜拍判断依据。",
  focusFilterLabel: "关键夜拍窗口",
  allFilterLabel: "全部小时",
  riskFilterLabel: "风险小时",
  defaultFilterMode: "cloudSea",
  signalColumnLabel: "参考",
  signalColumnDescription: "用于复核星空银河窗口内的云量、低云、湿度、降水和风。",
  initiallyExpanded: false,
  expandButtonLabel: "展开完整小时表",
  collapseButtonLabel: "收起完整小时表",
  showCoverageNote: false,
  showCollapsedPreview: false,
};

const astroProfessionalDataGroupsGridClassName =
  "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]";

const astroProfessionalFullWidthGroupKeys = new Set(["terrain-horizon-evidence"]);

function astroProfessionalGroupUsesFullWidth(
  group: AstroForecastViewModel["professionalDataGroups"][number],
): boolean {
  return (
    astroProfessionalFullWidthGroupKeys.has(group.key) ||
    (group.key.endsWith("-evidence") && group.items.length <= 5)
  );
}

function AstroProfessionalDataSection({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: AstroForecastViewModel;
}) {
  const [expanded, setExpanded] = useState(false);
  const professionalDataGroups = filterAstroPublicProfessionalDataGroups(
    viewModel.professionalDataGroups,
  );

  return (
    <Card
      className="AstroProfessionalData rounded-lg border border-border bg-card p-4 shadow-sm"
      data-astro-section="AstroProfessionalData"
      data-astro-professional-data-expanded={expanded ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-card-foreground">专业数据</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            查看逐小时云量、月球位置、天文黑夜、银河高度、能见度、湿度、降水和风等判断依据。
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
          }}
          data-astro-professional-data-toggle="true"
        >
          {expanded ? "收起专业数据" : "展开专业数据"}
          <ExpandChevron expanded={expanded} />
        </Button>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-4" data-astro-professional-data-body="true">
          <AstroHourlySummaryGrid items={viewModel.hourlySummary} />

          {professionalDataGroups.length > 0 ? (
            <div
              className={astroProfessionalDataGroupsGridClassName}
              data-astro-professional-data-groups="true"
            >
              {professionalDataGroups.map((group) => (
                <AstroProfessionalGroupSection key={group.key} group={group} />
              ))}
            </div>
          ) : null}

          <CloudSeaProfessionalHourlyDataPanel
            target="astro"
            data={viewModel.professionalHourlyData}
            config={astroProfessionalHourlySectionConfig}
            variant="embedded"
          />

          <details className="group rounded-md border border-border bg-muted p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-card-foreground [&::-webkit-details-marker]:hidden">
              查看整月月相
              <svg
                className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-180"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="mt-3">
              <MoonPhaseCalendar
                embedded
                latitudeWgs84={query.latitudeWgs84}
                longitudeWgs84={query.longitudeWgs84}
                timezone={result.calendarBasis.timezone}
              />
            </div>
          </details>
        </div>
      ) : null}
    </Card>
  );
}

function AstroHourlySummaryGrid({
  items,
}: {
  readonly items: AstroForecastViewModel["hourlySummary"];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-3 grid gap-2" data-astro-hourly-summary="true">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-card-foreground">逐小时摘要</h3>
        <Badge variant="muted">关键小时摘要</Badge>
      </div>
      <dl className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))]">
        {items.map((item) => (
          <div key={item.key} className="rounded-md border border-border bg-card px-3 py-2">
            <dt className="text-[11px] leading-4 text-muted-foreground">{item.label}</dt>
            <dd className={cn("mt-1 break-words text-sm font-semibold", cardToneText(item.tone))}>
              {item.value}
            </dd>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {compactAstroText(item.detail, 44)}
            </p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AstroProfessionalGroupSection({
  group,
}: {
  readonly group: AstroForecastViewModel["professionalDataGroups"][number];
}) {
  const publicGroup = filterAstroPublicProfessionalDataGroups([group])[0];
  if (!publicGroup) {
    return null;
  }
  const usesFullWidth = astroProfessionalGroupUsesFullWidth(publicGroup);

  const body = (
    <>
      {publicGroup.description ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{publicGroup.description}</p>
      ) : null}
      <dl className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr))]">
        {publicGroup.items.map((item) => (
          <AstroProfessionalFact
            key={`${publicGroup.key}-${item.label}`}
            label={item.label}
            value={item.value ?? item.detail}
            detail={item.value ? item.detail : undefined}
          />
        ))}
      </dl>
    </>
  );

  if (publicGroup.collapsedByDefault) {
    return (
      <details
        className={cn(
          "rounded-lg border border-border bg-muted/70 p-3",
          usesFullWidth && "[grid-column:1/-1]",
        )}
        data-astro-professional-data-group={publicGroup.key}
        data-astro-professional-data-group-collapsed="true"
        data-astro-professional-data-group-span={usesFullWidth ? "full" : "auto"}
      >
        <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
          {publicGroup.title}
          {publicGroup.badgeLabel ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {publicGroup.badgeLabel}
            </span>
          ) : null}
        </summary>
        {body}
      </details>
    );
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        usesFullWidth && "[grid-column:1/-1]",
      )}
      data-astro-professional-data-group={publicGroup.key}
      data-astro-professional-data-group-span={usesFullWidth ? "full" : "auto"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">{publicGroup.title}</h3>
        {publicGroup.badgeLabel ? <Badge variant="muted">{publicGroup.badgeLabel}</Badge> : null}
      </div>
      {body}
    </section>
  );
}

function AstroProfessionalFact({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] leading-4 text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-card-foreground">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function GlowTopResultHeader({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: GlowForecastViewModel;
}) {
  return (
    <header
      className="GlowTopResultHeader grid gap-3 min-[880px]:grid-cols-[minmax(0,1.45fr)_minmax(260px,320px)] min-[880px]:items-start min-[1280px]:grid-cols-[minmax(0,1.55fr)_minmax(280px,340px)]"
      data-forecast-result-header="true"
      data-result-header-row="true"
      data-result-target="glow"
      data-glow-section="GlowResultHeader"
    >
      <GlowHeroConclusion query={query} result={result} viewModel={viewModel} />
      <GlowDecisionSnapshotCard recommendation={viewModel.overallRecommendation} />
    </header>
  );
}

function GlowHeroConclusion({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: GlowForecastViewModel;
}) {
  const recommendation = viewModel.overallRecommendation;

  return (
    <Card
      className={glowPanelClassName("GlowHeroConclusion glow-hero-conclusion min-w-0 p-4")}
      data-forecast-result-summary-card="true"
      data-result-header-summary-card="true"
      data-result-target="glow"
    >
      <div className="grid min-w-0 gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">朝霞 / 晚霞</Badge>
            <Badge variant={dataReadinessBadgeVariant(result)}>
              {dataReadinessBadgeLabel(result)}
            </Badge>
            <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
            <Badge variant={glowRecommendationBadgeVariant(recommendation.recommendation)}>
              {recommendation.recommendation}
            </Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground sm:text-[28px]">
            {query.name}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            {result.finalDecisionSummaryZh ? (
              result.finalDecisionSummaryZh
            ) : (
              <>
                {recommendation.headline}，{recommendation.conciseReason}
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
            <span>时间范围：{result.calendarBasis.forecastRangeLabel}</span>
            <span>生成时间：{formatDateTime(result.generatedAt)}</span>
            <span>首选目标：{recommendation.preferredTarget}</span>
            <span>推荐日期：{recommendation.preferredDate}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.assign("/glow");
            }}
          >
            重新选择地点
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.assign(buildForecastUrlFromForecastQuery(query));
            }}
          >
            重新判断
          </Button>
        </div>
      </div>
    </Card>
  );
}

function GlowDecisionSnapshotCard({
  recommendation,
}: {
  readonly recommendation: GlowForecastViewModel["overallRecommendation"];
}) {
  return (
    <Card
      className={glowPanelClassName(
        cn(
          "GlowDecisionSnapshot grid h-full content-start gap-3 p-3",
          glowToneBorderClassName(recommendation.tone),
        ),
      )}
      data-glow-section="GlowDecisionSnapshot"
      data-result-score-card="true"
      data-result-target="glow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">是否值得专程</p>
          <p
            className={cn(
              "mt-2 break-words text-2xl font-bold leading-8 [overflow-wrap:anywhere]",
              glowToneClassName(recommendation.tone),
            )}
          >
            {recommendation.preferredTarget}
          </p>
        </div>
        <Badge variant={glowRecommendationBadgeVariant(recommendation.recommendation)}>
          {recommendation.recommendation}
        </Badge>
      </div>
      <dl className="grid gap-2 text-xs leading-5 text-muted-foreground">
        <GlowDefinitionLine label="拍摄窗口" value={recommendation.preferredWindow} />
        <GlowDefinitionLine label="到达建议" value={recommendation.arrivalAdvice} />
        <GlowDefinitionLine label="主要风险" value={recommendation.mainRisk} />
      </dl>
    </Card>
  );
}

function GlowMetricCards({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <section
      className="GlowMetricCards glow-core-metrics grid gap-3"
      data-glow-section="GlowCoreMetrics"
    >
      <ForecastMetricGrid
        target="glow"
        className="grid items-stretch gap-2 sm:grid-cols-2 min-[1180px]:grid-cols-3"
        dataTestId="glow-core-metric-cards"
      >
        {cards.map((card) => (
          <ForecastMetricCard key={card.key} target="glow">
            <GlowPrimaryMetricCard card={card} />
          </ForecastMetricCard>
        ))}
      </ForecastMetricGrid>
    </section>
  );
}

function GlowPrimaryMetricCard({ card }: { readonly card: ForecastResultCard }) {
  return (
    <div
      className={cn(
        "grid h-full content-start gap-2 rounded-lg border bg-card p-3 shadow-sm",
        glowToneBorderClassName(card.tone),
      )}
      data-glow-metric-card={card.key}
    >
      <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
      <p
        className={cn(
          "break-words text-xl font-bold leading-7 [overflow-wrap:anywhere]",
          glowToneClassName(card.tone),
        )}
      >
        {card.value}
      </p>
      <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {userFacingResultText(card.detail)}
      </p>
      {typeof card.score === "number" ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", glowToneBarClassName(card.tone))}
            style={{ width: `${card.score}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

type GlowNearTermWeatherCard = {
  readonly key: string;
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly badge?: string;
  readonly tone: ForecastResultCardTone;
};

function GlowNearTermWeatherSection({ viewModel }: { readonly viewModel: GlowForecastViewModel }) {
  const cards = buildGlowNearTermWeatherCards(viewModel);

  if (cards.length === 0) {
    return null;
  }

  return (
    <section
      className="GlowNearTermWeather glow-near-term-weather grid gap-3"
      data-glow-section="GlowNearTermWeather"
      data-testid="glow-near-term-weather"
    >
      <GlowSectionHeading
        title="当前 / 近时段霞光天气"
        description="聚焦霞光云层载体、光路遮挡、云层压制、低云/雾墙与通透度，辅助判断晨昏拍摄窗口。"
        badge="天气相关"
      />
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))]">
        {cards.map((card) => (
          <GlowCompactInfoCard key={card.key} card={card} />
        ))}
      </div>
    </section>
  );
}

function buildGlowNearTermWeatherCards(
  viewModel: GlowForecastViewModel,
): readonly GlowNearTermWeatherCard[] {
  const cards: GlowNearTermWeatherCard[] = [];
  const cloudLayer = viewModel.cloudLayerEvidence[0];
  const visibility = viewModel.visibilityEvidence[0];
  const aerosol = viewModel.aerosolCard;
  const terrain = viewModel.terrainObstructionCards[0];

  if (cloudLayer) {
    cards.push({
      key: "glow-cloud-layer",
      title: "中高云条件",
      value: cloudLayer.value,
      detail: firstSentence(cloudLayer.detail),
      badge: cloudLayer.label,
      tone: cloudLayer.tone,
    });
  }

  if (visibility) {
    cards.push({
      key: "glow-visibility",
      title: "通透度",
      value: visibility.value,
      detail: firstSentence(visibility.detail),
      badge: visibility.label,
      tone: visibility.tone,
    });
  }

  cards.push({
    key: aerosol.key,
    title: "气溶胶与通透度",
    value: aerosol.stateLabel,
    detail: `${aerosol.measurementLabel}。${firstSentence(aerosol.detail)}`,
    badge: aerosol.scoreLabel,
    tone: aerosol.tone,
  });

  if (terrain) {
    cards.push({
      key: terrain.key,
      title: "地平线遮挡",
      value: terrain.statusLabel,
      detail: `${terrain.azimuthLabel} / ${terrain.horizonLabel} / ${terrain.clearanceLabel}。${terrain.detail}`,
      badge: terrain.title,
      tone: terrain.tone,
    });
  }

  return cards;
}

function GlowCompactInfoCard({ card }: { readonly card: GlowNearTermWeatherCard }) {
  return (
    <Card
      className={cn(
        "grid h-full content-start gap-2 p-3 shadow-sm",
        glowToneBorderClassName(card.tone),
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-card-foreground">{card.title}</p>
        {card.badge ? (
          <Badge variant={glowRecommendationBadgeVariant(card.badge)}>{card.badge}</Badge>
        ) : null}
      </div>
      <p
        className={cn(
          "break-words text-base font-bold leading-6 [overflow-wrap:anywhere]",
          glowToneClassName(card.tone),
        )}
      >
        {card.value}
      </p>
      <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {card.detail}
      </p>
    </Card>
  );
}

function GlowDailyCardsSection({
  opportunities,
}: {
  readonly opportunities: GlowForecastViewModel["dailyOpportunities"];
}) {
  return (
    <DailyDecisionList target="glow" dataTestId="glow-daily-opportunities">
      <Card
        className="GlowDailyOpportunities p-4 shadow-sm"
        data-glow-section="GlowDailyOpportunities"
      >
        <GlowSectionHeading
          title="逐日朝霞 / 晚霞机会"
          description="每天保留日出窗口、日落窗口、最佳拍摄动作和风险理由，便于横向比较。"
          badge="日卡片"
        />
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2 min-[1180px]:grid-cols-6"
          data-glow-daily-card-grid="balanced-col-span"
          data-glow-daily-card-balance="responsive-col-span"
        >
          {opportunities.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted px-3 py-3 text-sm text-muted-foreground sm:col-span-2 min-[1180px]:col-span-6">
              所选预报范围内暂无后续霞光窗口
            </p>
          ) : null}
          {opportunities.map((item, index) => (
            <GlowDailyCard key={item.key} item={item} index={index} count={opportunities.length} />
          ))}
        </div>
      </Card>
    </DailyDecisionList>
  );
}

function GlowDailyCard({
  item,
  index,
  count,
}: {
  readonly item: GlowForecastViewModel["dailyOpportunities"][number];
  readonly index: number;
  readonly count: number;
}) {
  const preferredSlot = preferredGlowDailySlot(item);

  return (
    <article
      className={cn(
        "grid content-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm sm:col-span-1 min-[1180px]:col-span-2",
        glowDailyCardSpanClassName(index, count),
      )}
      data-glow-daily-opportunity-date={item.date}
      data-glow-sunrise-state={item.sunrise.lifecycle}
      data-glow-sunset-state={item.sunset.lifecycle}
      data-glow-partial-date={item.isPartiallyCovered ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-card-foreground">{item.localDateLabel}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{item.weekdayLabel}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge variant={glowRecommendationBadgeVariant(item.dailyRecommendation)}>
            {item.dailyRecommendation}
          </Badge>
          {item.isPartiallyCovered ? <Badge variant="muted">部分覆盖</Badge> : null}
        </div>
      </div>
      <div className="grid gap-2 min-[520px]:grid-cols-2">
        <GlowDailyPhaseStat slot={item.sunrise} />
        <GlowDailyPhaseStat slot={item.sunset} />
      </div>
      <dl className="grid gap-1.5 rounded-md border border-border bg-muted px-2.5 py-2 text-xs leading-5 text-muted-foreground">
        <GlowDefinitionLine label="最佳窗口" value={glowDailyBestWindowText(item, preferredSlot)} />
        <GlowDefinitionLine label="拍摄行动" value={glowDailyActionText(item, preferredSlot)} />
        <GlowDefinitionLine label="风险/理由" value={firstSentence(item.conciseReason)} />
      </dl>
    </article>
  );
}

function GlowDailyPhaseStat({
  slot,
}: {
  readonly slot: GlowForecastViewModel["dailyOpportunities"][number]["sunrise"];
}) {
  const hasProbability = typeof slot.probabilityPercent === "number";
  return (
    <div
      className="rounded-md border border-border bg-muted px-2.5 py-2"
      data-glow-slot={slot.phase}
      data-glow-slot-lifecycle={slot.lifecycle}
      data-glow-slot-probability={slot.probabilityPercent}
      data-glow-slot-vividness={slot.vividnessIndex}
      data-glow-slot-practical={slot.practicalSuitabilityScore}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-bold text-card-foreground">{slot.label}</p>
        <Badge variant={glowRecommendationBadgeVariant(slot.recommendation)}>
          {slot.recommendation}
        </Badge>
      </div>
      <p
        className={cn(
          "mt-2 max-w-full break-words font-bold leading-none",
          hasProbability ? "text-xl text-primary" : "text-sm text-muted-foreground",
        )}
      >
        {hasProbability ? `预测概率 ${slot.probabilityDisplay}` : slot.probabilityDisplay}
      </p>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
        鲜艳度：{slot.vividnessDisplay}
      </p>
      <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">
        最佳时间：{slot.timeLabel}
      </p>
      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
        适拍度：{slot.practicalDisplay}
      </p>
    </div>
  );
}

function GlowDecisionSupportSection({ viewModel }: { readonly viewModel: GlowForecastViewModel }) {
  const recommendation = viewModel.overallRecommendation;
  const evidenceItems = viewModel.professionalEvidence.slice(0, 4);
  const actionItems = uniqueGlowSupportItems([
    recommendation.arrivalAdvice,
    ...viewModel.travelRecommendations.slice(0, 2),
  ]);
  const riskItems = uniqueGlowSupportItems([
    recommendation.mainRisk,
    ...viewModel.riskReasons.slice(0, 2),
  ]);
  const backupItems = uniqueGlowSupportItems([
    recommendation.backupPlan,
    ...viewModel.backupPlans
      .slice(0, 2)
      .map((plan) => `${plan.condition}：${plan.action}。${plan.detail}`),
  ]);

  return (
    <section
      className="GlowDecisionSupport glow-decision-support grid gap-3"
      data-glow-section="GlowDecisionSupport"
    >
      <GlowSectionHeading
        title="霞光判断依据与拍摄复核"
        description="把判断依据、拍摄行动、风险复核和备选窗口放在同一组，便于出发前快速确认。"
        badge={recommendation.recommendation}
        badgeVariant={glowRecommendationBadgeVariant(recommendation.recommendation)}
      />
      <div
        className="grid gap-3 sm:grid-cols-2 min-[1180px]:grid-cols-4"
        data-glow-evidence-layout="balanced-flex"
        data-result-judgment-basis-grid="true"
        data-result-target="glow"
      >
        <GlowSupportCard
          title="判断依据"
          badge="关键指标"
          items={
            evidenceItems.length > 0
              ? evidenceItems.map(
                  (item) => `${item.label}：${item.value}，${firstSentence(item.detail)}`,
                )
              : [recommendation.conciseReason]
          }
        />
        <GlowSupportCard
          title="拍摄行动"
          badge={recommendation.preferredTarget}
          items={actionItems}
        />
        <GlowSupportCard title="风险复核" badge="出发前确认" items={riskItems} />
        <GlowSupportCard title="备选窗口" badge="备选方案" items={backupItems} />
      </div>
    </section>
  );
}

function GlowProfessionalDataSection({ viewModel }: { readonly viewModel: GlowForecastViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const items = viewModel.professionalEvidence;
  const missingDataNotes = viewModel.missingDataNotes;
  const dataNotice = viewModel.dataNotice;

  return (
    <Card
      className={glowPanelClassName("GlowProfessionalData p-4")}
      data-glow-section="GlowProfessionalData"
      data-glow-professional-data-expanded={expanded ? "true" : "false"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-card-foreground">专业数据</h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            查看逐小时云量、能见度、湿度、降水和风等判断依据。
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((current) => !current);
          }}
          data-glow-professional-data-toggle="true"
        >
          {expanded ? "收起专业数据" : "展开专业数据"}
          <ExpandChevron expanded={expanded} />
        </Button>
      </div>

      {expanded ? (
        <div className="mt-4 grid gap-4" data-glow-professional-data-body="true">
          <div
            className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))]"
            data-glow-professional-evidence-layout="balanced-flex"
          >
            {items.map((item) => (
              <article
                key={item.key}
                className="rounded-lg border border-border bg-muted p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-card-foreground">{item.label}</h3>
                  <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {firstSentence(item.detail)}
                </p>
              </article>
            ))}
          </div>
          {missingDataNotes.length > 0 ? (
            <div className="grid gap-2">
              {missingDataNotes.map((note) => (
                <p
                  key={note}
                  className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning-strong"
                >
                  {note}
                </p>
              ))}
            </div>
          ) : null}
          {dataNotice ? (
            <p className="text-xs leading-5 text-muted-foreground">{dataNotice}</p>
          ) : null}
          <CloudSeaProfessionalHourlyDataPanel
            target="glow"
            data={viewModel.professionalHourlyData}
            config={glowProfessionalHourlySectionConfig}
            variant="embedded"
          />
        </div>
      ) : null}
    </Card>
  );
}

function glowPanelClassName(className?: string): string {
  return cn("rounded-lg border border-border bg-card shadow-sm", className);
}

function glowCompactCardClassName(className?: string): string {
  return glowPanelClassName(cn("p-3", className));
}

function glowToneClassName(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "text-primary",
    accent: "text-primary",
    danger: "text-danger",
    info: "text-primary",
    muted: "text-card-foreground",
  };

  return toneClasses[tone];
}

function glowToneBarClassName(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "bg-primary",
    accent: "bg-primary",
    danger: "bg-danger",
    info: "bg-primary",
    muted: "bg-muted-foreground",
  };

  return toneClasses[tone];
}

function glowToneBorderClassName(tone: ForecastResultCardTone): string {
  const toneClasses: Record<ForecastResultCardTone, string> = {
    primary: "border-primary/40",
    accent: "border-primary/35",
    danger: "border-danger/35",
    info: "border-primary/25",
    muted: "border-border",
  };

  return toneClasses[tone];
}

function glowRecommendationBadgeVariant(label: string | undefined): BadgeVariant {
  if (!label) {
    return "muted";
  }
  if (label.includes("不建议")) {
    return "danger";
  }
  if (label.includes("强推荐") || label.includes("推荐拍摄") || label.includes("窗口进行中")) {
    return "default";
  }
  if (label.includes("谨慎") || label.includes("可观察") || label.includes("仅作")) {
    return "accent";
  }
  if (label.includes("暂无") || label.includes("超出") || label.includes("已结束")) {
    return "muted";
  }
  return "muted";
}

function GlowSectionHeading({
  title,
  description,
  badge,
  badgeVariant = "muted",
}: {
  readonly title: string;
  readonly description?: string;
  readonly badge?: string;
  readonly badgeVariant?: BadgeVariant;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-card-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
    </div>
  );
}

function GlowDefinitionLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="inline font-semibold text-card-foreground">{label}：</dt>
      <dd className="inline break-words [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function glowDailyCardSpanClassName(index: number, count: number): string {
  const isLast = index === count - 1;
  const isLastTwo = index >= count - 2;
  return cn(
    count % 2 === 1 && isLast && "sm:col-span-2",
    count % 3 === 1 && isLast && "min-[1180px]:col-span-6",
    count % 3 === 2 && isLastTwo && "min-[1180px]:col-span-3",
  );
}

function preferredGlowDailySlot(
  item: GlowForecastViewModel["dailyOpportunities"][number],
): GlowForecastViewModel["dailyOpportunities"][number]["sunrise"] {
  if (item.preferredTarget === "朝霞") {
    return item.sunrise;
  }
  if (item.preferredTarget === "晚霞") {
    return item.sunset;
  }
  const slots = [item.sunrise, item.sunset];
  return (
    [...slots].sort((left, right) => glowSlotSortScore(right) - glowSlotSortScore(left))[0] ??
    item.sunrise
  );
}

function glowSlotSortScore(
  slot: GlowForecastViewModel["dailyOpportunities"][number]["sunrise"],
): number {
  return slot.practicalSuitabilityScore ?? slot.probabilityPercent ?? 0;
}

function glowDailyBestWindowText(
  item: GlowForecastViewModel["dailyOpportunities"][number],
  slot: GlowForecastViewModel["dailyOpportunities"][number]["sunrise"],
): string {
  if (item.preferredTarget === "暂不专程") {
    return "暂不专程，等待后续窗口或转拍备选题材。";
  }
  return `${item.preferredTarget} ${slot.timeLabel}`;
}

function glowDailyActionText(
  item: GlowForecastViewModel["dailyOpportunities"][number],
  slot: GlowForecastViewModel["dailyOpportunities"][number]["sunrise"],
): string {
  if (!slot.isRecommendationEligible || item.preferredTarget === "暂不专程") {
    return "不按专程到达安排，出发前复核临近预报。";
  }
  if (slot.lifecycle === "active") {
    return "窗口进行中，优先就近完成构图和曝光调整。";
  }
  return `${slot.label}优先，按${slot.timeLabel}前完成机位到达。`;
}

function uniqueGlowSupportItems(items: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const item of items) {
    const value = item.trim();
    const displayValue = value ? firstSentence(value) : "";
    if (!displayValue || seen.has(displayValue)) {
      continue;
    }
    seen.add(displayValue);
    unique.push(value);
  }
  return unique;
}

function GlowSupportCard({
  title,
  badge,
  items,
}: {
  readonly title: string;
  readonly badge: string;
  readonly items: readonly string[];
}) {
  return (
    <Card className={glowCompactCardClassName("grid h-full content-start gap-2")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-card-foreground">{title}</h3>
        <Badge variant={glowRecommendationBadgeVariant(badge)}>{badge}</Badge>
      </div>
      <ul className="grid gap-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
          >
            {firstSentence(item)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CloudSeaTopResultHeader({
  query,
  displayData,
}: {
  readonly query: ForecastQueryInput;
  readonly displayData: CloudSeaDisplayData;
}) {
  return (
    <header
      className="CloudSeaTopResultHeader grid gap-3 min-[880px]:grid-cols-[minmax(0,1.45fr)_minmax(260px,320px)] min-[880px]:items-start min-[1280px]:grid-cols-[minmax(0,1.55fr)_minmax(280px,340px)]"
      data-forecast-result-header="true"
      data-result-header-row="true"
      data-result-target="cloud_sea"
      data-cloud-sea-section="CloudSeaTopResultHeader"
    >
      <CloudSeaHeroConclusion query={query} header={displayData.header} />
      <CloudSeaScoreCard scoreCard={displayData.scoreCard} />
    </header>
  );
}

function CloudSeaHeroConclusion({
  query,
  header,
}: {
  readonly query: ForecastQueryInput;
  readonly header: CloudSeaDisplayData["header"];
}) {
  return (
    <Card
      className={cloudSeaPanelClassName(
        "CloudSeaHeroConclusion cloud-sea-hero-conclusion min-w-0 p-4",
      )}
      data-forecast-result-summary-card="true"
      data-result-header-summary-card="true"
      data-result-target="cloud_sea"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{header.heroBadgeLabel}</Badge>
            <Badge variant={header.dataBadgeVariant}>{header.dataBadgeLabel}</Badge>
            <Badge variant="muted">{header.horizonLabel}</Badge>
          </div>
          <h1 className="mt-3 break-words text-2xl font-bold leading-tight text-foreground [overflow-wrap:anywhere]">
            {header.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {header.conclusion}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
            <span>时间范围：{header.forecastRangeLabel}</span>
            <span>生成时间：{header.generatedAtLabel}</span>
            <span>当前置信度：{header.confidenceLabel}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
              window.location.assign(buildForecastUrlFromForecastQuery(query));
            }}
          >
            重新判断
          </Button>
        </div>
      </div>
    </Card>
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

function CloudSeaScoreCard({
  scoreCard,
}: {
  readonly scoreCard: CloudSeaDisplayData["scoreCard"];
}) {
  const safeScore = Number.isFinite(scoreCard.score)
    ? Math.min(100, Math.max(0, Math.round(scoreCard.score)))
    : 0;

  return (
    <Card
      className={cloudSeaCompactCardClassName("CloudSeaScoreCard grid content-start gap-3")}
      data-forecast-score-card="true"
      data-result-score-card="true"
      data-result-target="cloud_sea"
      data-cloud-sea-section="CloudSeaScoreCard"
      data-testid="decision-score-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{scoreCard.label}</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-bold leading-none text-primary">{safeScore}</span>
            <span className="pb-1 text-xs font-semibold text-muted-foreground">/ 100</span>
          </div>
        </div>
        <Badge variant={scoreCard.badgeVariant}>{scoreCard.badgeLabel}</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${safeScore}%` }} />
      </div>
      <p className="text-sm font-semibold leading-6 text-card-foreground [overflow-wrap:anywhere]">
        {scoreCard.summary}
      </p>
    </Card>
  );
}

function CloudSeaMetricCards({ cards }: { readonly cards: readonly ForecastResultCard[] }) {
  return (
    <ForecastMetricGrid
      target="cloud_sea"
      className="cloud-sea-core-metrics grid items-stretch gap-2 sm:grid-cols-2 min-[1180px]:grid-cols-3"
      dataCloudSeaSection="CloudSeaCoreMetrics"
    >
      {cards.map((card) => (
        <ForecastMetricCard key={card.key} target="cloud_sea" dataCloudSeaMetricCard>
          <CloudSeaPrimaryResultCard card={card} />
        </ForecastMetricCard>
      ))}
    </ForecastMetricGrid>
  );
}

function CloudSeaPrimaryResultCard({ card }: { readonly card: ForecastResultCard }) {
  return (
    <div
      className={cn(
        "grid h-full content-start gap-2 rounded-lg border bg-card p-3 shadow-sm",
        cloudSeaToneBorderClassName(card.tone),
      )}
    >
      <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
      <p
        className={cn(
          "break-words text-xl font-bold leading-7 [overflow-wrap:anywhere]",
          cloudSeaToneClassName(card.tone),
        )}
      >
        {card.value}
      </p>
      <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {userFacingResultText(card.detail)}
      </p>
      {typeof card.score === "number" ? (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", cloudSeaToneBarClassName(card.tone))}
            style={{ width: `${card.score}%` }}
          />
        </div>
      ) : null}
    </div>
  );
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

function CloudSeaNearTermWeatherSection({
  display,
}: {
  readonly display: CloudSeaCurrentNearTermWeatherDisplay;
}) {
  return (
    <CurrentWeatherCards
      target="cloud_sea"
      className="CloudSeaNearTermWeather grid gap-3"
      dataCloudSeaSection="CloudSeaNearTermWeather"
      dataTestId="cloud-sea-near-term-weather"
    >
      <CloudSeaSectionHeading
        title={display.sectionTitle}
        description={display.sectionDescription}
        badge={display.sectionBadge}
      />
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        {display.cards.map((card) => (
          <CloudSeaCompactInfoCard
            key={card.key}
            title={card.title}
            timeBasis={card.timeBasis}
            badge={card.badge}
            value={card.value}
            detail={card.detail}
            tone={card.tone}
          />
        ))}
      </div>
    </CurrentWeatherCards>
  );
}

function CloudSeaSectionHeading({
  title,
  description,
  badge,
}: {
  readonly title: string;
  readonly description?: string;
  readonly badge?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-card-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {badge ? <Badge variant="muted">{badge}</Badge> : null}
    </div>
  );
}

function CloudSeaCompactInfoCard({
  title,
  value,
  detail,
  badge,
  timeBasis,
  tone = "default",
}: Omit<CloudSeaCurrentNearTermWeatherDisplay["cards"][number], "key">) {
  return (
    <Card
      className={cn(
        "grid h-full content-start gap-2 p-3 shadow-sm",
        tone === "success" && "border-primary/40",
        tone === "warning" && "border-warning/35",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-card-foreground">{title}</p>
        {badge ? (
          <Badge
            variant={tone === "success" ? "success" : tone === "warning" ? "warning" : "muted"}
          >
            {badge}
          </Badge>
        ) : null}
      </div>
      {timeBasis ? (
        <p className="text-xs font-semibold leading-5 text-muted-foreground">{timeBasis}</p>
      ) : null}
      <p className="break-words text-base font-bold leading-6 text-card-foreground [overflow-wrap:anywhere]">
        {value}
      </p>
      <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{detail}</p>
    </Card>
  );
}

type CloudSeaWindowCategoryKey = "sunrise" | "sunset" | "lit" | "lowLight";

type CloudSeaWindowCategoryDefinition = {
  readonly key: CloudSeaWindowCategoryKey;
  readonly title: string;
  readonly noWindowIssue: string;
  readonly noWindowAction: string;
};

type CloudSeaWindowCardData = {
  readonly key: CloudSeaWindowCategoryKey;
  readonly title: string;
  readonly badgeLabel: string;
  readonly badgeVariant: BadgeVariant;
  readonly chanceText: string;
  readonly scoreText: string;
  readonly scoreTone: ForecastResultCardTone;
  readonly primaryWindow: string;
  readonly backupWindow: string;
  readonly labelReason: string;
  readonly mainIssue: string;
  readonly action: string;
  readonly cautionNote?: string;
};

function cloudSeaWindowCategoryDefinitions(
  terrainContext: CloudSeaTerrainContext,
): readonly CloudSeaWindowCategoryDefinition[] {
  const labels = terrainContext.windowCategoryLabels;
  const categories = terrainContext.vocabulary.windowCategories;
  return [
    { key: "sunrise", ...categories.sunrise, title: labels.sunrise },
    { key: "sunset", ...categories.sunset, title: labels.sunset },
    { key: "lit", ...categories.lit, title: labels.daylight },
    { key: "lowLight", ...categories.lowLight, title: labels.noLight },
  ];
}

function CloudSeaWindowCardsSection({
  windows,
  terrainContext,
  travelDecision,
}: {
  readonly windows: readonly CloudSeaWindowItem[];
  readonly terrainContext: CloudSeaTerrainContext;
  readonly travelDecision: CloudSeaTravelDecision;
}) {
  const cards = buildCloudSeaWindowCardData(windows, terrainContext, travelDecision);

  return (
    <section
      className="CloudSeaWindowCards cloud-sea-window-cards grid gap-3"
      data-cloud-sea-section="CloudSeaWindowCards"
      data-testid="cloud-sea-window-cards-section"
    >
      <CloudSeaSectionHeading
        title={terrainContext.vocabulary.windowSectionTitle}
        description={terrainContext.vocabulary.windowSectionDescription}
        badge={terrainContext.vocabulary.windowSectionBadge}
      />
      {terrainContext.windowSectionNoteZh ? (
        <p
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-muted-foreground"
          data-testid="cloud-sea-window-terrain-note"
        >
          {terrainContext.windowSectionNoteZh}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            key={card.key}
            className={cn(
              "grid h-full content-start gap-2 rounded-lg border bg-card p-3 shadow-sm",
              cloudSeaToneBorderClassName(card.scoreTone),
            )}
            data-testid="cloud-sea-window-category-card"
            data-cloud-sea-window-category={card.key}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-bold text-card-foreground">{card.title}</h3>
              <Badge variant={card.badgeVariant}>{card.badgeLabel}</Badge>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">机会指数</p>
              <p
                className={cn(
                  "mt-1 text-xl font-bold leading-7 [overflow-wrap:anywhere]",
                  cloudSeaToneClassName(card.scoreTone),
                )}
              >
                {card.scoreText}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {card.chanceText}
              </p>
              <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {card.labelReason}
              </p>
            </div>

            <dl className="grid gap-1.5 text-xs leading-5 text-muted-foreground">
              <CloudSeaWindowCardLine
                label={cloudSeaWindowCardPrimaryLabel(terrainContext, travelDecision)}
                value={card.primaryWindow}
              />
              <CloudSeaWindowCardLine label="备选窗口" value={card.backupWindow} />
              <CloudSeaWindowCardLine label="主要限制" value={card.mainIssue} />
            </dl>

            <p className="text-xs leading-5 text-card-foreground [overflow-wrap:anywhere]">
              <span className="font-semibold">行动：</span>
              {card.action}
            </p>
            {card.cautionNote ? (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs leading-5 text-muted-foreground">
                {card.cautionNote}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function CloudSeaWindowCardLine({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt className="inline font-semibold text-card-foreground">{label}：</dt>
      <dd className="inline break-words">{value}</dd>
    </div>
  );
}

function cloudSeaWindowCardPrimaryLabel(
  terrainContext: CloudSeaTerrainContext,
  travelDecision: CloudSeaTravelDecision,
): string {
  if (travelDecision === "no_go") {
    return "备选观察窗口";
  }
  if (travelDecision === "cautious") {
    return "参考窗口";
  }
  return terrainContext.shouldDowngradeCloudSeaWording ? "观察窗口" : "主窗口";
}

function buildCloudSeaWindowCardData(
  windows: readonly CloudSeaWindowItem[],
  terrainContext: CloudSeaTerrainContext,
  travelDecision: CloudSeaTravelDecision,
): readonly CloudSeaWindowCardData[] {
  const sortedWindows = [...windows].sort(compareCloudSeaWindowPriority);

  return cloudSeaWindowCategoryDefinitions(terrainContext).map((definition) => {
    const candidates = sortedWindows.filter((item) =>
      cloudSeaWindowMatchesCategory(item, definition.key),
    );
    return cloudSeaWindowCategoryCard(definition, candidates, terrainContext, travelDecision);
  });
}

function cloudSeaWindowCategoryCard(
  definition: CloudSeaWindowCategoryDefinition,
  candidates: readonly CloudSeaWindowItem[],
  terrainContext: CloudSeaTerrainContext,
  travelDecision: CloudSeaTravelDecision,
): CloudSeaWindowCardData {
  const primary = candidates[0];
  const backup = candidates.find((candidate) => candidate.key !== primary?.key);

  if (!primary) {
    return {
      key: definition.key,
      title: definition.title,
      badgeLabel: "暂无明确窗口",
      badgeVariant: "warning",
      chanceText: "暂无明确评分",
      scoreText: "暂无评分",
      scoreTone: "muted",
      primaryWindow: "暂无明确窗口",
      backupWindow: "等待下一次预报更新",
      labelReason: definition.noWindowIssue,
      mainIssue: definition.noWindowIssue,
      action: cloudSeaNoWindowCardAction(definition, terrainContext, travelDecision),
      cautionNote: undefined,
    };
  }

  return {
    key: definition.key,
    title: definition.title,
    badgeLabel: cloudSeaWindowCategoryBadgeLabel(definition.key, primary, terrainContext),
    badgeVariant: cloudSeaWindowCategoryBadgeVariant(definition.key, primary),
    chanceText: primary.cloudSeaChance,
    scoreText: `${primary.score} 分`,
    scoreTone: cloudSeaWindowCardTone(definition.key, primary),
    primaryWindow: primary.displayLabelZh,
    backupWindow: backup?.displayLabelZh ?? "暂无备选窗口",
    labelReason: compactCloudSeaWindowReason(primary.labelReason),
    mainIssue: cloudSeaWindowMainIssue(definition.key, primary, terrainContext),
    action: cloudSeaWindowCardAction(definition.key, primary, terrainContext, travelDecision),
    cautionNote: cloudSeaWindowHasLayerRoleRedirect(primary)
      ? primary.layerCompletenessNote
      : undefined,
  };
}

function compactCloudSeaWindowReason(value: string): string {
  const compact = firstSentence(value)
    .replace("评分看云层机会，推荐还会考虑降水、地形、数据完整性和出行成本。", "")
    .trim();
  return compact || "按当前推荐等级处理。";
}

function compareCloudSeaWindowPriority(
  left: CloudSeaWindowItem,
  right: CloudSeaWindowItem,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return left.startTime.localeCompare(right.startTime);
}

function cloudSeaWindowMatchesCategory(
  item: CloudSeaWindowItem,
  category: CloudSeaWindowCategoryKey,
): boolean {
  if (category === "sunrise") {
    return isSunriseCloudSeaWindow(item);
  }
  if (category === "sunset") {
    return isSunsetCloudSeaWindow(item);
  }
  if (category === "lowLight") {
    return isLowLightCloudSeaWindow(item);
  }
  return isLitCloudSeaWindow(item);
}

function isSunriseCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const text = cloudSeaWindowSearchText(item);
  const startHour = localHourFromIso(item.startTime);
  return (
    item.lightPhase === "dawn" ||
    item.lightPhase === "sunrise" ||
    /清晨|早晨|晨光|日出|朝霞/.test(text) ||
    (startHour !== undefined && startHour >= 4 && startHour < 9)
  );
}

function isSunsetCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const text = cloudSeaWindowSearchText(item);
  const startHour = localHourFromIso(item.startTime);
  return (
    item.lightPhase === "sunset" ||
    item.lightPhase === "blue_hour" ||
    /傍晚|黄昏|日落|晚霞|余晖/.test(text) ||
    (startHour !== undefined && startHour >= 16 && startHour < 20.5)
  );
}

function isLowLightCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const text = cloudSeaWindowSearchText(item);
  const startHour = localHourFromIso(item.startTime);
  return (
    item.lightPhase === "deep_night" ||
    item.lightPhase === "astronomical_night" ||
    /夜间|凌晨|无光|低光|深夜/.test(text) ||
    (startHour !== undefined && (startHour < 4 || startHour >= 20.5))
  );
}

function isLitCloudSeaWindow(item: CloudSeaWindowItem): boolean {
  const startHour = localHourFromIso(item.startTime);
  return (
    !isLowLightCloudSeaWindow(item) &&
    (item.lightPhase === "dawn" ||
      item.lightPhase === "sunrise" ||
      item.lightPhase === "daytime" ||
      item.lightPhase === "sunset" ||
      item.lightPhase === "blue_hour" ||
      isSunriseCloudSeaWindow(item) ||
      isSunsetCloudSeaWindow(item) ||
      (startHour !== undefined && startHour >= 4 && startHour < 20.5))
  );
}

function cloudSeaWindowSearchText(item: CloudSeaWindowItem): string {
  return `${item.label} ${item.displayLabelZh} ${item.note} ${item.riskTag}`;
}

function localHourFromIso(value: string): number | undefined {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  return Number(match[1]) + Number(match[2]) / 60;
}

function cloudSeaWindowCategoryBadgeLabel(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
  terrainContext: CloudSeaTerrainContext,
): string {
  if (cloudSeaWindowHasLayerRoleRedirect(item)) {
    return terrainContext.shouldDowngradeCloudSeaWording ? "霞光/纹理参考" : "云海信号不足";
  }
  if (terrainContext.shouldDowngradeCloudSeaWording) {
    if (category === "lowLight") {
      return "仅作备选";
    }
    if (item.score >= 70) {
      return "已在附近可观察";
    }
    if (item.score >= 50) {
      return "顺带观察";
    }
    return "谨慎参考";
  }
  if (category === "lowLight") {
    return "低光观察";
  }
  if (
    item.recommendationLabel === "不建议专程" ||
    item.recommendationLabel === "仅作备选" ||
    item.recommendationLabel === "谨慎参考" ||
    item.recommendationLabel.includes("观察")
  ) {
    return item.recommendationLabel;
  }
  if (item.score >= 70) {
    return "优先守拍";
  }
  if (item.score >= 50) {
    return "可作备选";
  }
  return "谨慎观察";
}

function cloudSeaWindowCategoryBadgeVariant(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
): BadgeVariant {
  if (cloudSeaWindowHasLayerRoleRedirect(item)) {
    return "warning";
  }
  if (category === "lowLight" || item.score < 55 || item.tone === "danger") {
    return "warning";
  }
  if (item.score >= 70) {
    return "default";
  }
  return "accent";
}

function cloudSeaWindowCardTone(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
): ForecastResultCardTone {
  if (cloudSeaWindowHasLayerRoleRedirect(item)) {
    return "accent";
  }
  if (
    item.recommendationLabel === "不建议专程" ||
    item.recommendationLabel === "仅作备选" ||
    item.recommendationLabel === "谨慎参考" ||
    item.recommendationLabel.includes("观察")
  ) {
    return "accent";
  }
  if (category === "lowLight" || item.score < 55) {
    return "accent";
  }
  return item.score >= 70 ? "primary" : "accent";
}

function cloudSeaWindowMainIssue(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
  terrainContext: CloudSeaTerrainContext,
): string {
  const basis = terrainContext.shouldDowngradeCloudSeaWording
    ? `低云遮挡：${item.whiteoutRisk}；降水：${item.rainInterference}。`
    : `白墙风险：${item.whiteoutRisk}；降水：${item.rainInterference}。`;
  if (cloudSeaWindowHasLayerRoleRedirect(item)) {
    return item.layerCompletenessNote ?? basis;
  }
  if (category === "lowLight") {
    return `${basis}光线不足，不作明亮风光主窗口。`;
  }
  return basis;
}

function cloudSeaWindowCardAction(
  category: CloudSeaWindowCategoryKey,
  item: CloudSeaWindowItem,
  terrainContext: CloudSeaTerrainContext,
  travelDecision: CloudSeaTravelDecision,
): string {
  if (travelDecision === "no_go") {
    return terrainContext.shouldDowngradeCloudSeaWording
      ? "当前整体不建议专程；此窗口只作低云/晨雾备选观察，等待下一次预报并复核降水、能见度和通行。"
      : "当前整体不建议专程；此窗口只作云海备选观察，等待下一次预报并复核降水、能见度和通行。";
  }
  if (travelDecision === "cautious") {
    return "仅供备选参考；如已在附近或仍决定前往，出发前复核低云、能见度、降水和现场通行，不把该窗口当作确定行程。";
  }
  if (cloudSeaWindowHasLayerRoleRedirect(item)) {
    return terrainContext.shouldDowngradeCloudSeaWording
      ? "中高云更适合观察霞光或云层纹理，不按云海判断。"
      : "云海信号不足，中高云可作为霞光参考。";
  }
  if (terrainContext.shouldDowngradeCloudSeaWording) {
    if (category === "sunrise") {
      return "观察近地雾气和低云是否贴地，重点看晨雾边界、远山层次和通透度。";
    }
    if (category === "sunset") {
      return "观察层云变化和云层开口，可转向霞光参考、远山层次或云层纹理。";
    }
    if (category === "lit") {
      return "复核低云是否贴地，观察云层开口和通透度，可转向霞光或云层纹理。";
    }
    return "仅作夜间低云、雾气层次或现场观察，不作为正常明亮风光主窗口。";
  }
  if (category === "lowLight") {
    return "仅作氛围、剪影、层次或现场观察，不作为正常明亮风光主窗口。";
  }
  return item.actionSuggestion;
}

function cloudSeaNoWindowCardAction(
  definition: CloudSeaWindowCategoryDefinition,
  terrainContext: CloudSeaTerrainContext,
  travelDecision: CloudSeaTravelDecision,
): string {
  if (travelDecision === "no_go") {
    return terrainContext.shouldDowngradeCloudSeaWording
      ? "当前整体不建议专程；没有明确低云/晨雾窗口，等待下一次预报或转向霞光、云层纹理和近景。"
      : "当前整体不建议专程；没有明确云海窗口，等待下一次预报或转向霞光、云层纹理和近景。";
  }
  if (travelDecision === "cautious") {
    return `${definition.noWindowAction} 若仍前往，只作备选观察并在出发前复核现场条件。`;
  }
  return definition.noWindowAction;
}

function cloudSeaWindowHasLayerRoleRedirect(item: CloudSeaWindowItem): boolean {
  return /中高云|霞光|云层纹理/.test(item.layerCompletenessNote ?? "");
}

type ProfessionalHourlyFilterMode = "all" | "cloudSea" | "morning" | "rain" | "risk";
type ProfessionalHourlyRow = NonNullable<
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
  readonly showCloudColumns?: boolean;
  readonly showTemperatureColumns?: boolean;
  readonly showDewPointColumns?: boolean;
  readonly showHumidityColumn?: boolean;
  readonly showVisibilityColumn?: boolean;
  readonly showWindColumns?: boolean;
  readonly precipitationColumnLabel?: string;
  readonly compactTable?: boolean;
  readonly cardClassName?: string;
};

type ProfessionalHourlyCloudSectionProps = {
  readonly target: ProfessionalHourlySectionTarget;
  readonly data: ProfessionalHourlyDisplayData;
  readonly terrainContext?: CloudSeaTerrainContext;
  readonly config?: ProfessionalHourlySectionConfig;
  readonly variant?: ProfessionalHourlySectionVariant;
};

const glowProfessionalHourlySectionConfig: ProfessionalHourlySectionConfig = {
  sectionTitle: "逐小时专业数据",
  sectionBadge: "共享小时模型",
  sectionDescription: "逐小时展示云层、湿度、露点、降水、能见度、风与霞光窗口关系。",
  usageText: "普通小时保持背景参考，重点复核带窗口标记的时段。",
  signalColumnLabel: "窗口/信号",
  focusFilterLabel: "只看霞光窗口",
  defaultFilterMode: "all",
  ordinarySignalLabel: "普通时段",
  initiallyExpanded: true,
  previewTitle: "霞光窗口附近关键小时",
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
}: {
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
      />
    </div>
  );
}

function professionalHourlyDateHeaderClassName(): string {
  return cn(
    "w-[4.5rem] min-w-[4.5rem] bg-muted",
    "min-[760px]:sticky min-[760px]:left-0 min-[760px]:z-20",
    "min-[760px]:shadow-[4px_0_0_var(--border)]",
  );
}

function professionalHourlyDateCellClassName(rowBackgroundClassName: string): string {
  return cn(
    "w-[4.5rem] min-w-[4.5rem] font-semibold text-card-foreground",
    rowBackgroundClassName,
    "min-[760px]:sticky min-[760px]:left-0 min-[760px]:z-10",
    "min-[760px]:shadow-[4px_0_0_var(--border)]",
  );
}

function professionalHourlyTimeCellClassName(): string {
  return "w-[5rem] min-w-[5rem] font-semibold text-card-foreground";
}

function professionalHourlyRowBackgroundClassName(
  rowIndex: number,
  tone: ProfessionalHourlyRowAnnotation["tone"] | undefined,
): string {
  if (tone === "success") {
    return "bg-secondary/20";
  }

  if (tone === "warning" || tone === "danger") {
    return "bg-accent/10";
  }

  return rowIndex % 2 === 0 ? "bg-card" : "bg-muted/35";
}

function ProfessionalHourlyCloudSection({
  target,
  data,
  terrainContext,
  config,
  variant = "card",
}: ProfessionalHourlyCloudSectionProps) {
  const rows = data.rows;
  const basis = data.timeBasis;
  const embedded = variant === "embedded";
  const [expanded, setExpanded] = useState(config?.initiallyExpanded ?? true);
  const [filterMode, setFilterMode] = useState<ProfessionalHourlyFilterMode>(() =>
    defaultProfessionalHourlyFilter(data, config),
  );

  useEffect(() => {
    setExpanded(config?.initiallyExpanded ?? true);
  }, [config]);

  useEffect(() => {
    setFilterMode(defaultProfessionalHourlyFilter(data, config));
  }, [config, data]);

  const filteredRows = useMemo(
    () => filterProfessionalHourlyRows(rows, data, filterMode, config?.focusPaddingHours ?? 3),
    [config?.focusPaddingHours, data, filterMode, rows],
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
  const showCollapsedPreview = target !== "astro" && (config?.showCollapsedPreview ?? true);
  const previewRowLimit = Math.max(1, config?.previewRowLimit ?? 4);
  const hourlyTableHeaders = [
    "日期",
    "时间",
    "天气",
    ...(config?.showSignalColumn === false ? [] : [signalColumnLabel]),
    ...(config?.showCloudColumns === false
      ? []
      : ["总云量 %", "高云量 %", "中云量 %", "低云量 %"]),
    ...(config?.showTemperatureColumns === false ? [] : [...temperatureColumnLabels]),
    ...(config?.showDewPointColumns === false ? [] : ["露点 °C", "露点差 °C"]),
    ...(config?.showHumidityColumn === false ? [] : ["湿度 %"]),
    config?.precipitationColumnLabel ?? "降水 mm / 降水概率 %",
    ...(config?.showVisibilityColumn === false ? [] : ["能见度 km"]),
    ...(config?.showWindColumns === false ? [] : ["风速 m/s", "风向"]),
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
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              {sectionDescription}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={expanded}
            data-general-hourly-toggle={target === "general" ? "true" : undefined}
            onClick={() => {
              setExpanded((current) => !current);
            }}
          >
            {expanded
              ? config?.collapseButtonLabel ?? "收起小时表"
              : config?.expandButtonLabel ?? "展开小时表"}
            <ExpandChevron expanded={expanded} />
          </Button>
        </div>
      ) : config?.showEmbeddedLeadDescription === false ? null : (
        <p className="text-xs leading-5 text-muted-foreground">{sectionDescription}</p>
      )}

      {config?.showBasisSummary !== false ? (
        <dl className="mt-4 grid gap-2 rounded-lg border border-border bg-muted p-3 text-xs leading-5 text-muted-foreground min-[760px]:grid-cols-4">
          <CompactDefinition label="目标有效时间" value={targetRangeLabel} />
          <CompactDefinition label="覆盖率" value={`${rows.length} / ${expectedRowCount} 小时`} />
          {!coverageComplete ? <CompactDefinition label="实际显示" value={actualRangeLabel} /> : null}
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
        </dl>
      ) : null}
      {showCoverageNote &&
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

      {expanded || target !== "general" ? (
        <div
          className={cn("mt-4 grid min-w-0 max-w-full gap-3", !expanded && "hidden")}
          data-professional-hourly-expanded={expanded ? "true" : "false"}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="专业小时数据筛选">
              {professionalHourlyFilters.map((filter) => (
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
                    setFilterMode(filter.mode);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            当前筛选：{activeFilterLabel}，筛选 {filteredRows.length} / {rows.length} 小时；覆盖{" "}
            {rows.length} / {expectedRowCount} 小时。{professionalUsageText}
          </p>

          <ResponsiveDataScroller bare data-cloud-sea-professional-table-scroll="true">
            <table
              className={cn(
                "border-separate border-spacing-0 text-left text-[12px] leading-5",
                config?.compactTable
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
                        index === 1 && "w-[5rem] min-w-[5rem]",
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
          </ResponsiveDataScroller>
        </div>
      ) : null}
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
        data-professional-hourly-expanded={
          target === "general" ? (expanded ? "true" : "false") : undefined
        }
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
        "ProfessionalHourlyCloudSection min-w-0 max-w-full p-4 shadow-sm",
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
      data-professional-hourly-expanded={
        target === "general" ? (expanded ? "true" : "false") : undefined
      }
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
    annotation?.tone,
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
        {row.timeLabel || formatProfessionalTime(row.time, timezone)}
      </ProfessionalHourlyCell>
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
          <ProfessionalHourlyCell
            cell="cloud-total"
            className={professionalHourlyToneClass(row.cloudTotalPercent, "cloud-total")}
          >
            <ProfessionalCloudValue
              value={formatProfessionalPercent(row.cloudTotalPercent)}
              note={cloudBasisRowNote}
            />
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="cloud-high">
            {formatProfessionalPercent(row.cloudHighPercent)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell cell="cloud-mid">
            {formatProfessionalPercent(row.cloudMidPercent)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell
            cell="cloud-low"
            className={professionalHourlyToneClass(row.cloudLowPercent, "cloud-low")}
          >
            {formatProfessionalPercent(row.cloudLowPercent)}
          </ProfessionalHourlyCell>
        </>
      )}
      {showRawTemperatureColumn && config?.showTemperatureColumns !== false ? (
        <ProfessionalHourlyCell cell="raw-temperature" dataBasis="raw_grid">
          {formatProfessionalTemperature(row.rawTemperatureC)}
        </ProfessionalHourlyCell>
      ) : null}
      {config?.showTemperatureColumns === false ? null : (
        <ProfessionalHourlyCell cell="temperature" dataBasis={row.temperatureBasis}>
          {formatProfessionalTemperature(row.displayedTemperatureC)}
        </ProfessionalHourlyCell>
      )}
      {config?.showDewPointColumns === false ? null : (
        <>
          <ProfessionalHourlyCell cell="dew-point">
            {formatProfessionalTemperature(row.dewPointC)}
          </ProfessionalHourlyCell>
          <ProfessionalHourlyCell
            cell="dew-point-spread"
            className={professionalHourlyToneClass(row.dewPointSpreadC, "dew-point-spread")}
          >
            {formatProfessionalTemperatureDelta(row.dewPointSpreadC)}
          </ProfessionalHourlyCell>
        </>
      )}
      {config?.showHumidityColumn === false ? null : (
        <ProfessionalHourlyCell
          cell="humidity"
          className={professionalHourlyToneClass(row.relativeHumidityPercent, "humidity")}
        >
          {formatProfessionalPercent(row.relativeHumidityPercent)}
        </ProfessionalHourlyCell>
      )}
      <ProfessionalHourlyCell
        cell="precipitation"
        className={
          professionalHourlyHasPrecipitation(row)
            ? "bg-accent/10 font-semibold text-accent-strong"
            : undefined
        }
      >
        {formatProfessionalPrecipitation(row)}
      </ProfessionalHourlyCell>
      {config?.showVisibilityColumn === false ? null : (
        <ProfessionalHourlyCell
          cell="visibility"
          className={professionalHourlyToneClass(row.visibilityMeters, "visibility")}
        >
          {formatProfessionalVisibility(row.visibilityMeters)}
        </ProfessionalHourlyCell>
      )}
      {config?.showWindColumns === false ? null : (
        <>
          <ProfessionalHourlyCell
            cell="wind-speed"
            className={professionalHourlyToneClass(row.windSpeedMs, "wind-speed")}
          >
            {formatProfessionalWindSpeed(row.windSpeedMs)}
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
      <p className="text-xs font-semibold text-muted-foreground">
        {title ?? "默认聚焦云海窗口附近小时"}
      </p>
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
  className,
  children,
}: {
  readonly cell: string;
  readonly dataBasis?: string;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <td
      className={cn("whitespace-nowrap border-t border-border px-2 py-1.5 align-middle", className)}
      data-professional-hourly-cell={cell}
      data-professional-hourly-basis={dataBasis}
    >
      {children}
    </td>
  );
}

function defaultProfessionalHourlyFilter(
  data: CloudSeaProfessionalHourlyDisplayData,
  config?: ProfessionalHourlySectionConfig,
): ProfessionalHourlyFilterMode {
  if (config?.defaultFilterMode) {
    return config.defaultFilterMode;
  }
  return professionalHourlyFocusWindows(data).length > 0 ? "cloudSea" : "morning";
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
  field:
    | "cloud-total"
    | "cloud-low"
    | "dew-point-spread"
    | "humidity"
    | "visibility"
    | "wind-speed",
): string | undefined {
  if (!isFiniteNumber(value)) {
    return undefined;
  }

  if (field === "cloud-low" && value >= 75) {
    return "bg-primary/10 font-semibold text-primary";
  }
  if (field === "cloud-total" && value >= 90) {
    return "bg-accent/10 font-semibold text-accent-strong";
  }
  if (field === "humidity" && value >= 90) {
    return "bg-primary/10 font-semibold text-primary";
  }
  if (field === "dew-point-spread" && value <= 2) {
    return "bg-accent/10 font-semibold text-accent-strong";
  }
  if (field === "visibility" && value <= 3000) {
    return "bg-danger/10 font-semibold text-danger";
  }
  if (field === "visibility" && value <= 8000) {
    return "bg-accent/10 font-semibold text-accent-strong";
  }
  if (field === "wind-speed" && value >= 9) {
    return "bg-danger/10 font-semibold text-danger";
  }
  if (field === "wind-speed" && value >= 6) {
    return "bg-accent/10 font-semibold text-accent-strong";
  }

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

function formatProfessionalTemperature(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)}°C` : "—";
}

function formatProfessionalTemperatureDelta(value: number | null | undefined): string {
  return isFiniteNumber(value) ? `${roundDisplay(value)}°C` : "—";
}

function formatProfessionalPrecipitation(row: ProfessionalHourlyRow): string {
  const amount = isFiniteNumber(row.precipitationAmountMm)
    ? `${roundDisplay(row.precipitationAmountMm)} mm`
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

function formatProfessionalDayHeading(
  value: string,
  timezone: string,
  fallback: string,
): string {
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

function CloudSeaDailyTrend({
  result,
  items,
  terrainContext,
}: {
  readonly result: ForecastCalculationResult;
  readonly items: readonly CloudSeaDailyTrendItem[];
  readonly terrainContext: CloudSeaTerrainContext;
}) {
  const title =
    result.calendarBasis.horizonHours <= 24
      ? `未来24小时${terrainContext.vocabulary.subjectLabel}判断`
      : `每日${terrainContext.vocabulary.subjectLabel}判断`;

  return (
    <DailyDecisionList
      target="cloud_sea"
      dataCloudSeaSection="CloudSeaDailyTrend"
      dataTestId="cloud-sea-daily-decision"
    >
      <Card className="CloudSeaDailyTrend cloud-sea-daily-trend p-3 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-card-foreground">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {terrainContext.vocabulary.dailyDescription}
            </p>
          </div>
          <Badge variant="muted">{forecastHorizonLabels[result.horizon]}</Badge>
        </div>
        <div
          className="mt-3 grid grid-cols-4 gap-2 min-[720px]:grid-cols-4 min-[1180px]:grid-cols-6"
          data-cloud-sea-daily-card-grid="true"
          data-testid="cloud-sea-daily-card-grid"
        >
          {items.map((item, index) => (
            <article
              key={item.key}
              className={cn(
                "CloudSeaDailyCard cloud-sea-daily-card grid h-full min-w-0 content-start gap-2 rounded-lg border bg-card p-3 shadow-sm",
                cloudSeaDailyCardSpanClassName(index, items.length),
                cloudSeaDailyCardToneClassName(item.recommendedAction),
              )}
              data-cloud-sea-daily-card="true"
              data-testid="cloud-sea-daily-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3
                    className="break-words text-base font-bold leading-6 text-card-foreground [overflow-wrap:anywhere]"
                    data-testid="cloud-sea-daily-date"
                  >
                    {item.dateLabel}
                  </h3>
                </div>
                <span className="shrink-0" data-testid="cloud-sea-daily-recommendation">
                  <Badge variant={recommendationBadgeVariant(item.recommendedAction)}>
                    {item.recommendedAction}
                  </Badge>
                </span>
              </div>
              <dl className="grid gap-1.5 rounded-lg border border-border bg-muted px-3 py-2 text-xs">
                <CloudSeaInlineDefinition
                  label={terrainContext.vocabulary.dailyBestWindowLabel}
                  value={item.bestMorningWindow}
                  dataTestId="cloud-sea-daily-main-window"
                />
                <CloudSeaInlineDefinition
                  label="雨后开口"
                  value={item.rainOpeningLabel}
                  dataTestId="cloud-sea-daily-rain-opening"
                />
              </dl>
              <div className="grid grid-cols-3 gap-1.5" data-testid="cloud-sea-daily-stats">
                <CloudSeaDailyStat
                  label={terrainContext.shouldDowngradeCloudSeaWording ? "信号" : "形成"}
                  value={`${item.formationLevel} ${item.formationScore}分`}
                  dataTestId="cloud-sea-daily-stat"
                />
                <CloudSeaDailyStat
                  label={terrainContext.shouldDowngradeCloudSeaWording ? "可观察" : "可拍"}
                  value={`${item.shootableLevel} ${item.shootableScore}分`}
                  dataTestId="cloud-sea-daily-stat"
                />
                <CloudSeaDailyStat
                  label={terrainContext.vocabulary.dailyObstructionStatLabel}
                  value={`${item.whiteoutRiskLabel} ${item.whiteoutRiskScore}分`}
                  dataTestId="cloud-sea-daily-stat"
                />
              </div>
              <div className="grid gap-1.5 text-sm leading-6">
                {item.decisionReason ? (
                  <p
                    className="break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]"
                    data-testid="cloud-sea-daily-reason"
                  >
                    {firstSentence(item.decisionReason)}
                  </p>
                ) : null}
                <p
                  className="break-words text-xs font-semibold leading-5 text-card-foreground [overflow-wrap:anywhere]"
                  data-testid="cloud-sea-daily-action"
                >
                  {item.actionSuggestion}
                </p>
                {item.layerCompletenessNote ? (
                  <p className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1 text-xs leading-5">
                    {item.layerCompletenessNote}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </Card>
    </DailyDecisionList>
  );
}

function cloudSeaDailyCardSpanClassName(index: number, total: number): string {
  const isLastCard = index === total - 1;
  const isInFinalDesktopPair = index >= total - 2;
  const tabletSpanClassName =
    total % 2 === 1 && isLastCard ? "min-[720px]:col-span-4" : "min-[720px]:col-span-2";

  if (total % 3 === 1 && isLastCard) {
    return cn("col-span-4", tabletSpanClassName, "min-[1180px]:col-span-6");
  }

  if (total % 3 === 2 && isInFinalDesktopPair) {
    return cn("col-span-4", tabletSpanClassName, "min-[1180px]:col-span-3");
  }

  return cn("col-span-4", tabletSpanClassName, "min-[1180px]:col-span-2");
}

function cloudSeaDailyCardToneClassName(label: string): string {
  const variant = recommendationBadgeVariant(label);

  if (variant === "danger") {
    return "border-danger/35";
  }
  if (variant === "accent" || variant === "warning") {
    return "border-warning/35";
  }
  if (variant === "default" || variant === "success") {
    return "border-primary/40";
  }
  return "border-border";
}

function CloudSeaDailyStat({
  label,
  value,
  dataTestId,
}: {
  readonly label: string;
  readonly value: string;
  readonly dataTestId?: string;
}) {
  return (
    <div
      className="min-w-0 rounded-md border border-border bg-card px-2 py-1.5"
      data-testid={dataTestId}
    >
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-xs font-bold text-card-foreground">{value}</p>
    </div>
  );
}

function CloudSeaReasoningSection({
  items,
  variant = "card",
}: {
  readonly items: readonly CloudSeaReasoningItem[];
  readonly variant?: "card" | "embedded";
}) {
  const Container = (variant === "embedded" ? "section" : Card) as React.ElementType;

  return (
    <Container
      className={cn(
        "CloudSeaReasoning cloud-sea-reasoning p-3 sm:p-4",
        variant === "card" ? "shadow-sm" : "rounded-lg border border-border bg-card",
      )}
      data-cloud-sea-section="CloudSeaReasoning"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-card-foreground">判断依据</h2>
        <Badge variant="muted">当前结果</Badge>
      </div>
      <JudgmentBasisGrid
        target="cloud_sea"
        className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
      >
        {items.map((item) => (
          <article
            key={item.key}
            className={cn(
              "grid content-start gap-2 rounded-lg border bg-card p-3",
              cloudSeaToneBorderClassName(item.tone),
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-card-foreground [overflow-wrap:anywhere]">
                {item.label}
              </h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {item.key === "weather-variable-consistency"
                ? item.detail
                : firstSentence(item.detail)}
            </p>
          </article>
        ))}
      </JudgmentBasisGrid>
    </Container>
  );
}

function CloudSeaInlineCaution({ text }: { readonly text: string }) {
  return (
    <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
      {text}
    </p>
  );
}

function CloudSeaActionPlanSection({
  items,
  variant = "card",
}: {
  readonly items: readonly CloudSeaActionPlanItem[];
  readonly variant?: "card" | "embedded";
}) {
  const Container = (variant === "embedded" ? "section" : Card) as React.ElementType;
  const hasMainGuardAction = items.some((item) => item.label === "主守窗口");

  return (
    <Container
      className={cn(
        "CloudSeaActionPlan cloud-sea-action-plan p-3 sm:p-4",
        variant === "card" ? "shadow-sm" : "rounded-lg border border-border bg-card",
      )}
      data-cloud-sea-section="CloudSeaActionPlan"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-card-foreground">行动方案</h2>
        <Badge variant="muted">
          {hasMainGuardAction ? "是否出发 / 到达 / 主守 / 备选" : "是否出发 / 窗口参考 / 备选"}
        </Badge>
      </div>
      <ActionPlanGrid
        target="cloud_sea"
        className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]"
      >
        {items.map((item) => (
          <article
            key={item.key}
            className={cn(
              "grid content-start gap-2 rounded-lg border bg-card p-3",
              cloudSeaToneBorderClassName(item.tone),
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-card-foreground [overflow-wrap:anywhere]">
                {item.label}
              </h3>
              <Badge variant={badgeVariantForTone(item.tone)}>{item.value}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {firstSentence(item.detail)}
            </p>
          </article>
        ))}
      </ActionPlanGrid>
    </Container>
  );
}

function CloudSeaRiskSummarySection({
  riskSummary,
  terrainContext,
  variant = "card",
}: {
  readonly riskSummary: readonly ForecastResultSectionItem[];
  readonly terrainContext: CloudSeaTerrainContext;
  readonly variant?: "card" | "embedded";
}) {
  const Container = (variant === "embedded" ? "section" : Card) as React.ElementType;
  const focusedRiskSummary = riskSummary.filter(
    (item) =>
      !["云海形成机会", "云海可拍机会", "低云/晨雾信号", "云层可观察机会", "雨后开口"].includes(
        item.label,
      ),
  );

  return (
    <Container
      className={cn(
        "CloudSeaRiskSummary cloud-sea-risk-summary p-3 sm:p-4",
        variant === "card" ? "shadow-sm" : "rounded-lg border border-border bg-card",
      )}
      data-cloud-sea-section="CloudSeaRiskSummary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-card-foreground">风险与复核</h2>
        <Badge variant="muted">
          {terrainContext.shouldDowngradeCloudSeaWording ? "低云遮挡" : "白墙"} / 降水 / 通行
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {focusedRiskSummary.slice(0, 8).map((item, index) => (
          <article
            key={`${item.label}-${index}`}
            className="grid content-start gap-2 rounded-lg border border-border bg-card p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-card-foreground [overflow-wrap:anywhere]">
                {item.label}
              </h3>
              {item.value ? <Badge variant="accent">{item.value}</Badge> : null}
            </div>
            <p className="text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
              {firstSentence(item.detail)}
            </p>
          </article>
        ))}
      </div>
    </Container>
  );
}

function CloudSeaReturnLink({ href }: { readonly href: string }) {
  return (
    <a
      href={href}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary sm:w-fit"
    >
      返回综合判断
      <span aria-hidden="true">→</span>
    </a>
  );
}

function CloudSeaInlineDefinition({
  label,
  value,
  dataTestId,
}: {
  readonly label: string;
  readonly value: string;
  readonly dataTestId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2" data-testid={dataTestId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-card-foreground [overflow-wrap:anywhere]">{value}</dd>
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
  readonly priorityScore: number;
  readonly windowLabel: string;
  readonly reason: string;
  readonly actionSuggestion: string;
  readonly detailItems?: readonly {
    readonly label: string;
    readonly value: string;
    readonly detail?: string;
  }[];
};

type DailyAstroLike = ForecastCalculationResult["astroAnalysis"]["dailyAstro"][number];

type AstroWindowLike = Pick<
  AstroWindow,
  "date" | "start" | "end" | "directionZh" | "galacticCenterAltitude" | "noteZh"
>;

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

type GeneralSubjectKey = Exclude<SubjectScoreKey, "transparency">;

type GeneralSubjectSummary = {
  readonly key: GeneralSubjectKey;
  readonly name: string;
  readonly chanceText: string;
  readonly recommendationLabel: GeneralSubjectRecommendationLabel;
  readonly badgeVariant: BadgeVariant;
  readonly riskBadge?: {
    readonly label: string;
    readonly variant: BadgeVariant;
  };
  readonly recommendedWindowText: string;
  readonly backupWindowText?: string;
  readonly blockerText?: string;
  readonly action: string;
  readonly linkLabel: string;
  readonly href: string;
};

type GeneralSubjectRecommendationLabel = "推荐" | "可观察" | "谨慎参考" | "仅作备选" | "不建议";

const generalSubjectOrder: readonly GeneralSubjectKey[] = [
  "cloudSea",
  "sunriseGlow",
  "sunsetGlow",
  "stars",
  "milkyWay",
];

const generalSubjectLinkConfig: Record<
  GeneralSubjectKey,
  {
    readonly target: SubjectDetailTarget;
    readonly subject: SubjectDetailSubject;
    readonly label: string;
  }
> = {
  cloudSea: {
    target: "cloud_sea",
    subject: "cloud_sea",
    label: "查看云海详情",
  },
  sunriseGlow: {
    target: "glow",
    subject: "sunrise_glow",
    label: "查看霞光详情",
  },
  sunsetGlow: {
    target: "glow",
    subject: "sunset_glow",
    label: "查看霞光详情",
  },
  stars: {
    target: "astro",
    subject: "astro",
    label: "查看星空详情",
  },
  milkyWay: {
    target: "astro",
    subject: "milky_way",
    label: "查看星空详情",
  },
};

function buildGeneralSubjectSummaries(
  query: ForecastQueryInput,
  result: ForecastCalculationResult,
): readonly GeneralSubjectSummary[] {
  const cardsByKey = new Map(buildSubjectBreakdownCards(result).map((card) => [card.key, card]));
  const resultId = createForecastResultContextId(query, result);
  const returnUrl = buildGeneralForecastReturnUrl(query);

  return generalSubjectOrder.map((key) => {
    const score = generalSubjectChanceScore(result, key, cardsByKey.get(key));
    const subjectWindows = generalSubjectWindows(result, key);
    const recommendedWindow = subjectWindows.find((window) =>
      isRecommendedGeneralSubjectWindow(result, key, window),
    );
    const backupWindow = subjectWindows.find(
      (window) => window !== recommendedWindow && isBackupGeneralSubjectWindow(result, key, window),
    );
    const linkWindow = recommendedWindow ?? backupWindow ?? subjectWindows[0];
    const blocker = generalSubjectBlocker(result, key, linkWindow, score);
    const recommendationLabel = generalSubjectRecommendationLabel(
      score,
      recommendedWindow,
      backupWindow,
      blocker,
    );
    const linkConfig = generalSubjectLinkConfig[key];

    return {
      key,
      name: subjectDisplayLabel(result, key),
      chanceText: formatGeneralChanceText(score),
      recommendationLabel,
      badgeVariant: generalSubjectBadgeVariant(recommendationLabel),
      riskBadge:
        blocker && recommendationLabel !== "推荐"
          ? {
              label: blocker,
              variant: recommendationLabel === "不建议" ? "danger" : "warning",
            }
          : undefined,
      recommendedWindowText: recommendedWindow
        ? formatWindow(
            recommendedWindow.startTime,
            recommendedWindow.endTime,
            result.calendarBasis.timezone,
          )
        : "暂无高确定性窗口",
      backupWindowText: backupWindow
        ? formatWindow(backupWindow.startTime, backupWindow.endTime, result.calendarBasis.timezone)
        : undefined,
      blockerText: recommendedWindow ? undefined : blocker,
      action: generalSubjectAction(result, key, recommendationLabel, blocker),
      linkLabel: subjectLinkLabel(result, key, linkConfig.label),
      href: buildSubjectDetailDeepLink({
        query,
        result,
        resultId,
        target: linkConfig.target,
        subject: linkConfig.subject,
        date: generalSubjectLinkDate(result, linkWindow),
        window: linkWindow,
        returnUrl,
      }),
    };
  });
}

function subjectDisplayLabel(result: ForecastCalculationResult, key: SubjectScoreKey): string {
  if (key === "cloudSea" && !resultUsesMountainSemantics(result)) {
    return "晨雾 / 低云";
  }
  return subjectLabels[key];
}

function subjectLinkLabel(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  fallback: string,
): string {
  if (key === "cloudSea" && !resultUsesMountainSemantics(result)) {
    return "查看云雾详情";
  }
  return fallback;
}

function generalSubjectChanceScore(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  card: SubjectBreakdownCard | undefined,
): number | undefined {
  if (key === "cloudSea") {
    return result.cloudSeaAnalysis.shootableScore;
  }
  if (key === "sunriseGlow") {
    return result.glowAnalysis.sunriseGlowScore;
  }
  if (key === "sunsetGlow") {
    return result.glowAnalysis.sunsetGlowScore;
  }
  if (key === "stars") {
    return result.astroAnalysis.starsScore;
  }
  if (key === "milkyWay") {
    return result.astroAnalysis.milkyWayScore;
  }

  return card?.score.score;
}

function formatGeneralChanceText(score: number | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "暂无";
  }

  return `${Math.max(0, Math.min(100, Math.round(score)))}%`;
}

function generalSubjectWindows(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
): readonly ForecastCalculationResult["bestWindows"][number][] {
  return [...result.bestWindows]
    .filter((window) => matchesGeneralSubjectWindow(window, key))
    .filter((window) => isActionableGlowClientWindow(result, window))
    .sort(
      (left, right) =>
        windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
        (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
        Date.parse(left.startTime) - Date.parse(right.startTime),
    );
}

function matchesGeneralSubjectWindow(
  window: ForecastCalculationResult["bestWindows"][number],
  key: GeneralSubjectKey,
): boolean {
  const text = generalSubjectWindowSearchText(window);

  if (key === "cloudSea") {
    return window.target === "cloud_sea";
  }
  if (key === "sunriseGlow") {
    return window.target === "glow" && isMorningForecastWindow(window);
  }
  if (key === "sunsetGlow") {
    return window.target === "glow" && isEveningForecastWindow(window);
  }
  if (key === "milkyWay") {
    return window.target === "astro" && (/银河/.test(text) || /milky\s*way/i.test(text));
  }

  return (
    window.target === "astro" &&
    !/银河|milky\s*way/i.test(text) &&
    (/星空|星野|夜景星空|天文黑夜/.test(text) || window.target === "astro")
  );
}

function generalSubjectWindowSearchText(
  window: Pick<ForecastCalculationResult["bestWindows"][number], "label" | "subjectPriorityLabel">,
): string {
  return `${window.subjectPriorityLabel ?? ""} ${window.label}`;
}

function isRecommendedGeneralSubjectWindow(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  if ((key === "stars" || key === "milkyWay") && !result.astroAnalysis.astroShootable) {
    return false;
  }

  return isUsableClientWindow(window);
}

function isBackupGeneralSubjectWindow(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  if ((key === "stars" || key === "milkyWay") && !result.astroAnalysis.astroShootable) {
    return false;
  }
  if (window.windowLevel === "blocked" || window.recommendationLevel === "not_recommended") {
    return false;
  }

  return (window.practicalScore ?? window.score) >= 45;
}

function generalSubjectRecommendationLabel(
  score: number | undefined,
  recommendedWindow: ForecastCalculationResult["bestWindows"][number] | undefined,
  backupWindow: ForecastCalculationResult["bestWindows"][number] | undefined,
  blocker: string | undefined,
): GeneralSubjectRecommendationLabel {
  const value = typeof score === "number" && Number.isFinite(score) ? score : 0;

  if (recommendedWindow) {
    return value >= 72 ? "推荐" : "可观察";
  }
  if (backupWindow) {
    return "仅作备选";
  }
  if (value >= 55 && !blocker) {
    return "可观察";
  }
  if (value >= 40) {
    return "谨慎参考";
  }
  return "不建议";
}

function generalSubjectBadgeVariant(label: GeneralSubjectRecommendationLabel): BadgeVariant {
  if (label === "推荐") {
    return "default";
  }
  if (label === "可观察") {
    return "accent";
  }
  if (label === "不建议") {
    return "danger";
  }
  if (label === "谨慎参考") {
    return "warning";
  }
  return "muted";
}

function generalSubjectBlocker(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  window: ForecastCalculationResult["bestWindows"][number] | undefined,
  score: number | undefined,
): string | undefined {
  if (key === "cloudSea") {
    if (result.cloudSeaAnalysis.whiteoutRiskScore >= 65 || result.scores.whiteoutRisk.score >= 65) {
      return resultUsesMountainSemantics(result) ? "白墙风险" : "低云遮挡";
    }
    if (window?.practicalKind === "formation_signal") {
      return "无光形成信号";
    }
  }

  if (key === "sunriseGlow" || key === "sunsetGlow") {
    if (result.glowAnalysis.lowCloudObstructionRisk >= 65) {
      return "低云遮挡";
    }
    if (
      (key === "sunriseGlow" && result.glowAnalysis.rainOverlapsSunriseWindow) ||
      (key === "sunsetGlow" && result.glowAnalysis.rainOverlapsSunsetWindow)
    ) {
      return "降水干扰";
    }
    if (result.scores.transparency.score < 55) {
      return "通透偏弱";
    }
  }

  if (key === "stars" || key === "milkyWay") {
    const blockers = [
      ...(window?.blockerReasons ?? []),
      ...(window?.weatherBlockers ?? []),
      ...result.astroAnalysis.weatherBlockers,
    ];
    if (blockers.length > 0) {
      return astroWindowBlockerLabels(blockers).join("、");
    }
    if (!result.astroAnalysis.astroShootable) {
      if (result.astroAnalysis.cloudBlockerLevel === "high") {
        return "云量偏高";
      }
      if (result.astroAnalysis.labels.moonlightImpact === "高") {
        return "月光影响";
      }
      return "天气不支持";
    }
  }

  return typeof score === "number" && score < 45 ? "条件不足" : undefined;
}

function generalSubjectAction(
  result: ForecastCalculationResult,
  key: GeneralSubjectKey,
  recommendationLabel: GeneralSubjectRecommendationLabel,
  blocker: string | undefined,
): string {
  if (key === "cloudSea") {
    if (!resultUsesMountainSemantics(result)) {
      return "关注晨雾、云层开口或远景层次，不建议按高山云海逻辑判断。";
    }
    if (recommendationLabel === "推荐" || recommendationLabel === "可观察") {
      return "清晨重点关注，现场复核白墙风险。";
    }
    return blocker === "白墙风险"
      ? "云海信号需降级，先确认云顶高度。"
      : "云海信号不足，不建议只为单一窗口出发。";
  }

  if (key === "sunriseGlow") {
    return recommendationLabel === "推荐" || recommendationLabel === "可观察"
      ? "日出前完成构图，复核东方光路云缝。"
      : "可顺带观察，不建议作为唯一目标。";
  }

  if (key === "sunsetGlow") {
    return recommendationLabel === "推荐" || recommendationLabel === "可观察"
      ? "关注西向云层开口，日落前到位。"
      : "保留日落前后机动，不押单一霞光。";
  }

  if (key === "stars") {
    return recommendationLabel === "推荐" || recommendationLabel === "可观察"
      ? "夜间可纳入计划，复核云量、月光和通行安全。"
      : "云量或月光影响较大，不建议专程夜拍。";
  }

  return recommendationLabel === "推荐" || recommendationLabel === "可观察"
    ? "银心方向可重点跟进，临近复核云量和月光。"
    : "天文窗口存在但天气不支持，仅作参考。";
}

function generalSubjectLinkDate(
  result: ForecastCalculationResult,
  window: ForecastCalculationResult["bestWindows"][number] | undefined,
): string {
  return (
    window?.date ??
    dateFromIsoLike(window?.startTime) ??
    result.calendarBasis.targetDates[0] ??
    result.targetDates[0] ??
    dateFromIsoLike(result.forecastStart) ??
    "1970-01-01"
  );
}

function dateFromIsoLike(value: string | undefined): string | undefined {
  const date = value?.slice(0, 10);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

export function ComprehensiveForecastView({
  query,
  result,
  viewModel,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly viewModel: ForecastResultViewModel;
}) {
  const subjectCards = buildSubjectBreakdownCards(result);
  const bestSubject = pickBestSubject(subjectCards);
  const mainRisk = pickMainRisk(result);
  const primaryBestWindow = viewModel.bestWindows.find(isExecutableDisplayWindow);

  return (
    <DecisionResultTemplate
      target="general"
      className="GeneralResultPage general-result-page grid gap-4"
    >
      <ComprehensiveContextBar query={query} result={result} />
      <ComprehensiveCoreDecisionCards
        result={result}
        bestWindow={primaryBestWindow}
        bestSubject={bestSubject}
        mainRisk={mainRisk}
      />
      <div
        className="grid min-w-0 max-w-full gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_clamp(300px,26vw,380px)] min-[1200px]:items-start"
        data-general-result-dashboard="true"
        data-forecast-decision-layout="dashboard"
      >
        <div
          className="grid min-w-0 max-w-full content-start gap-4"
          data-general-result-main-column="true"
        >
          <WeatherEssentialsPanel result={result} />
          {result.dailySummaries.length > 0 ? (
            <ComprehensiveMultiDaySummary query={query} result={result} />
          ) : null}
          <OpportunityWindowSection query={query} result={result} />
        </div>
        <div
          className="grid min-w-0 max-w-full content-start gap-4 min-[1200px]:sticky min-[1200px]:top-[88px]"
          data-general-result-side-column="true"
        >
          <RiskDecisionSection result={result} mainRisk={mainRisk} />
          <ActionableAdviceSection result={result} bestSubject={bestSubject} mainRisk={mainRisk} />
        </div>
      </div>
      {viewModel.professionalHourlyData ? (
        <GeneralHourlyWeatherSection data={viewModel.professionalHourlyData} />
      ) : null}
    </DecisionResultTemplate>
  );
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
      className="GeneralProfessionalHourlyData w-full min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm"
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
        <div
          className="mt-4 grid w-full min-w-0 gap-3"
          data-general-hourly-body="true"
        >
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
              className="w-full table-fixed border-separate border-spacing-0 text-left text-[12px] leading-5"
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
                  {columnLabels.map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="whitespace-nowrap border-b border-border px-4 py-2 font-semibold"
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
        role="progressbar"
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
    ? `${roundDisplay(row.precipitationAmountMm)} mm`
    : "—";
}

function formatProfessionalRainProbability(row: ProfessionalHourlyRow): string {
  return isFiniteNumber(row.precipitationProbabilityPercent)
    ? `${Math.round(row.precipitationProbabilityPercent)}%`
    : "—";
}

function ComprehensiveContextBar({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <ForecastResultHeader target="general">
      <ForecastResultSummaryCard
        target="general"
        className="min-w-0 rounded-lg border border-border bg-card"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">出行判断</Badge>
          <Badge variant={dataReadinessBadgeVariant(result)}>{weatherReadinessLabel(result)}</Badge>
          <Badge variant="muted">{forecastHorizonLabels[query.horizon]}</Badge>
        </div>
        <h1 className="mt-4 break-words text-2xl font-bold leading-tight text-foreground sm:text-[30px]">
          {query.name}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          {userFacingResultText(result.summary)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs leading-5 text-muted-foreground">
          <span>预报范围：{result.calendarBasis.forecastRangeLabel}</span>
          <span>生成时间：{formatDateTime(result.generatedAt)}</span>
          <span>{judgmentConfidenceText(result)}</span>
        </div>
        <Button
          className="mt-4"
          size="sm"
          variant="secondary"
          onClick={() => {
            window.location.assign("/#analysis");
          }}
        >
          重新选择地点
        </Button>
      </ForecastResultSummaryCard>
      <ForecastScoreCard
        target="general"
        label="综合出片指数"
        score={finalDecisionScore(result)}
        badgeLabel={departureRecommendationLabel(result)}
        badgeVariant={recommendationBadgeVariant(finalRecommendationLabel(result))}
        summary={userFacingResultText(primaryReasonSentence(result))}
      />
    </ForecastResultHeader>
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
    textCard(
      "comprehensive-recommendation",
      "recommendation",
      "推荐等级",
      finalRecommendationLabel(result),
      result.finalDecisionSummaryZh ?? departureRecommendationLabel(result),
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
    textCard(
      "comprehensive-arrival",
      "recommendation",
      "到达建议",
      arrivalAdviceValue(bestWindow, result.calendarBasis.timezone),
      arrivalAdviceDetail(bestWindow, result.calendarBasis.timezone),
      finalDecisionScore(result) >= 65 ? "primary" : "accent",
    ),
    generalCloudMistCard(result),
    textCard(
      "comprehensive-glow-v2",
      "sunsetGlow",
      "朝霞 / 晚霞机会",
      `朝霞${result.glowAnalysis.labels.sunriseGlowOpportunity} · 晚霞${result.glowAnalysis.labels.sunsetGlowOpportunity}`,
      `${glowGeneralFactsText(result)} ${glowGeneralWindowText(result)}`,
      result.glowAnalysis.lowCloudObstructionRisk >= 70 ? "danger" : "accent",
    ),
    scoreCard(
      "comprehensive-subject",
      bestSubject.key === "milkyWay" ? "milkyWay" : bestSubject.key,
      "最佳题材",
      subjectDisplayLabel(result, bestSubject.key),
      userFacingResultText(`${bestSubject.score.score} 分，${bestSubject.reason}`),
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
    <ForecastMetricGrid
      target="general"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7"
      dataTestId="top-decision-cards"
    >
      {cards.map((card) => (
        <ForecastMetricCard key={card.key} target="general">
          <PrimaryResultCard card={card} />
        </ForecastMetricCard>
      ))}
    </ForecastMetricGrid>
  );
}

function generalCloudMistCard(result: ForecastCalculationResult): ForecastResultCard {
  if (!resultUsesMountainSemantics(result)) {
    return textCard(
      "comprehensive-cloud-mist",
      "cloudSea",
      "晨雾 / 低云",
      `云雾信号${result.cloudSeaAnalysis.labels.formationOpportunity} · 通透风险${result.cloudSeaAnalysis.labels.whiteoutRisk}`,
      `低云/雾气 ${result.cloudSeaAnalysis.formationScore} 分，云层开口 ${result.cloudSeaAnalysis.shootableScore} 分，低云遮挡 ${result.cloudSeaAnalysis.whiteoutRiskScore} 分。`,
      result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "info",
    );
  }

  return textCard(
    "comprehensive-cloud-sea",
    "cloudSea",
    "云海 / 白墙",
    `形成${result.cloudSeaAnalysis.labels.formationOpportunity} · 可拍${result.cloudSeaAnalysis.labels.shootableOpportunity} · 白墙${result.cloudSeaAnalysis.labels.whiteoutRisk}`,
    `形成 ${result.cloudSeaAnalysis.formationScore} 分，可拍 ${result.cloudSeaAnalysis.shootableScore} 分，白墙风险 ${result.cloudSeaAnalysis.whiteoutRiskScore} 分。`,
    result.cloudSeaAnalysis.labels.whiteoutRisk === "高" ? "danger" : "info",
  );
}

function OpportunityWindowSection({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  const summaries = buildGeneralSubjectSummaries(query, result);

  return (
    <section className="grid gap-3" data-testid="opportunity-windows">
      <SectionHeading
        title="拍摄窗口与备选"
        description="只汇总五类核心题材，快速判断哪个最值得拍。"
        badge="五类题材"
      />
      <div
        className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]"
        data-testid="general-subject-summary-grid"
      >
        {summaries.map((summary) => (
          <article
            key={summary.key}
            className="grid min-h-[260px] content-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
            data-testid="general-subject-summary-card"
            data-subject={summary.key}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-bold text-card-foreground">{summary.name}</h3>
              <div className="flex flex-wrap justify-end gap-1.5">
                <span data-testid="general-subject-recommendation-badge">
                  <Badge variant={summary.badgeVariant}>{summary.recommendationLabel}</Badge>
                </span>
                {summary.riskBadge ? (
                  <span data-testid="general-subject-risk-badge">
                    <Badge variant={summary.riskBadge.variant}>{summary.riskBadge.label}</Badge>
                  </span>
                ) : null}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground">机会指数</p>
              <p className="mt-1 text-2xl font-bold leading-8 text-primary">{summary.chanceText}</p>
            </div>

            <div className="grid gap-1.5 text-xs leading-5 text-muted-foreground">
              <p data-testid="general-subject-recommended-window">
                <span className="font-semibold text-card-foreground">推荐窗口：</span>
                {summary.recommendedWindowText}
              </p>
              {summary.backupWindowText ? (
                <p data-testid="general-subject-backup-window">
                  <span className="font-semibold text-card-foreground">备选窗口：</span>
                  {summary.backupWindowText}
                </p>
              ) : null}
              {summary.blockerText ? (
                <p>
                  <span className="font-semibold text-card-foreground">主要阻碍：</span>
                  {summary.blockerText}
                </p>
              ) : null}
            </div>

            <p className="text-sm leading-6 text-card-foreground">
              <span className="font-semibold">建议：</span>
              {summary.action}
            </p>

            <a className="mt-auto text-sm font-semibold text-primary" href={summary.href}>
              {summary.linkLabel}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}

function ComprehensiveMultiDaySummary({
  query,
  result,
}: {
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
}) {
  return (
    <DailyDecisionList target="general" dataTestId="daily-forecast-decision">
      <SectionHeading
        title="逐日拍摄判断"
        description="按天保留出发判断、关键天气、优先窗口和下一步动作。"
        badge={forecastHorizonLabels[result.horizon]}
      />
      <div
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]"
        data-testid="daily-cards-adaptive-grid"
      >
        {result.dailySummaries.map((summary) => {
          const dayBreakdown = result.targetDailyBreakdown.find(
            (breakdown) => breakdown.date === summary.date,
          );
          const primaryWindow = dailyPrimaryWindow(result, summary);
          const backupWindow = dailyBackupWindow(result, summary, primaryWindow);
          const backupWindowText = dailyBackupWindowText(
            result,
            summary,
            primaryWindow,
            backupWindow,
          );
          const mainRiskText = dailyMainRiskText(result, summary, dayBreakdown);
          const decisionLabel = dailyOverallDecisionLabel(summary);
          const actionSuggestion = dailyCompactActionSuggestion(
            result,
            summary,
            dayBreakdown,
            primaryWindow,
            backupWindow,
          );
          const subjectLinks = buildGeneralDailySubjectLinks({
            query,
            result,
            date: summary.date,
          });

          return (
            <article key={summary.date} data-testid="daily-card">
              <Card className="grid h-full content-start gap-3 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-card-foreground">
                      {dateLabelForResultClient(result, summary.date)}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summary.lunarDateText ? `农历${summary.lunarDateText}` : "农历暂缺"}
                    </p>
                  </div>
                  <Badge variant={dailyDecisionBadgeVariant(decisionLabel)}>{decisionLabel}</Badge>
                </div>
                <p className="text-sm font-semibold leading-6 text-card-foreground">
                  {dailyMainWeatherSummary(summary, dayBreakdown)}
                </p>
                <div className="grid gap-1.5 text-sm leading-6 text-muted-foreground">
                  <p className="font-semibold text-card-foreground">
                    {dailyCompactTemperatureRangeText(summary.weather, result)}
                  </p>
                  <p data-testid="daily-compact-weather-row">
                    {dailyCompactWeatherRow(summary.weather, dayBreakdown)}
                  </p>
                </div>
                <div
                  className="grid gap-1.5 border-y border-border py-3 text-sm leading-6"
                  data-testid="daily-priority-windows"
                >
                  <p data-testid="daily-primary-window">
                    <span className="font-semibold text-card-foreground">优先关注：</span>
                    {primaryWindow
                      ? `${windowLabelText(primaryWindow)} ${formatWindowTimeRange(
                          primaryWindow.startTime,
                          primaryWindow.endTime,
                          result.calendarBasis.timezone,
                        )}`
                      : "暂无高确定性拍摄窗口"}
                  </p>
                  {backupWindowText ? (
                    <p className="text-muted-foreground" data-testid="daily-backup-window">
                      <span className="font-semibold text-card-foreground">备选观察：</span>
                      {backupWindowText}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 text-sm leading-6">
                  <p data-testid="daily-main-risk">
                    <span className="font-semibold text-card-foreground">主要风险：</span>
                    {mainRiskText}
                  </p>
                  <p className="text-card-foreground" data-testid="daily-action-suggestion">
                    <span className="font-semibold">行动：</span>
                    {actionSuggestion}
                  </p>
                </div>
                {subjectLinks.length > 0 ? (
                  <nav className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs font-semibold text-primary">
                    {subjectLinks.map((link) => (
                      <a key={link.target} href={link.href}>
                        {link.label}
                      </a>
                    ))}
                  </nav>
                ) : null}
              </Card>
            </article>
          );
        })}
      </div>
    </DailyDecisionList>
  );
}

type GeneralDailySummary = ForecastCalculationResult["dailySummaries"][number];
type GeneralDailyBreakdown = ForecastCalculationResult["targetDailyBreakdown"][number];
type GeneralForecastWindow = ForecastCalculationResult["bestWindows"][number];

function dailyOverallDecisionLabel(summary: GeneralDailySummary): string {
  if (
    summary.dedicatedTripRecommendation === "不建议专程前往" &&
    summary.nearbyObservationRecommendation === "已在附近可观察"
  ) {
    return "已在附近可观察";
  }

  if (summary.dedicatedTripRecommendation) {
    return summary.dedicatedTripRecommendation;
  }

  if (summary.nearbyObservationRecommendation && summary.score < 65) {
    return summary.nearbyObservationRecommendation;
  }

  if (summary.recommendationLabel.includes("不建议") || summary.score < 45) {
    return "不建议专程前往";
  }
  if (summary.recommendationLabel.includes("谨慎") || summary.score < 65) {
    return "谨慎参考";
  }
  if (summary.recommendationLabel.includes("强推荐")) {
    return "强推荐专程";
  }
  if (
    summary.recommendationLabel.includes("等待") ||
    summary.recommendationLabel.includes("推荐")
  ) {
    return "推荐安排";
  }

  return normalizeRecommendationLabel(summary.recommendationLabel);
}

function dailyMainWeatherSummary(
  summary: GeneralDailySummary,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  const source =
    simplifyWeatherSummaryZh(summary.weather?.weatherTextZh ?? breakdown?.weatherSummary) ??
    "天气待复核";
  return compactSentence(source, 24);
}

function dailyCompactTemperatureRangeText(
  weather: GeneralDailySummary["weather"] | undefined,
  result: ForecastCalculationResult,
): string {
  const prefix = terrainTemperaturePrefix(result);
  if (!weather) {
    return `${prefix}：暂缺`;
  }

  if (typeof weather.tempMin === "number" && typeof weather.tempMax === "number") {
    return `${prefix}：${Math.round(weather.tempMin)}–${Math.round(weather.tempMax)}°C`;
  }

  return `${prefix}：${formatTemperature(averagePair(weather.tempMin, weather.tempMax))}`;
}

function dailyCompactWeatherRow(
  weather: GeneralDailySummary["weather"] | undefined,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  return [
    compactPrecipitationDisplayText(weather),
    `风：${formatCompactWindSpeed(weather?.windSpeed)}`,
    `通透：${compactTransparencyLabel(weather, breakdown)}`,
  ].join("｜");
}

function formatCompactWindSpeed(windSpeed: number | null | undefined): string {
  return typeof windSpeed === "number" && Number.isFinite(windSpeed)
    ? `${roundDisplay(windSpeed)}m/s`
    : "待复核";
}

function compactTransparencyLabel(
  weather: GeneralDailySummary["weather"] | undefined,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  const score = weather?.photographyTransparencyScore ?? breakdown?.transparency?.score;
  return transparencyGradeLabel(weather?.transparencyGrade, score).replace(/\s*\d+\s*分$/, "");
}

function dailyPrimaryWindow(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
): GeneralForecastWindow | undefined {
  if (
    summary.bestShootableWindow &&
    windowBelongsToDate(summary.bestShootableWindow, summary.date) &&
    isHighConfidenceDailyWindow(result, summary.bestShootableWindow)
  ) {
    return summary.bestShootableWindow;
  }

  return sortedDailyWindows(result, summary.date).find((window) =>
    isHighConfidenceDailyWindow(result, window),
  );
}

function dailyBackupWindow(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  primaryWindow: GeneralForecastWindow | undefined,
): GeneralForecastWindow | undefined {
  return sortedDailyWindows(result, summary.date).find(
    (window) => !sameDailyWindow(window, primaryWindow) && isBackupDailyWindow(window),
  );
}

function sortedDailyWindows(
  result: ForecastCalculationResult,
  date: string,
): readonly GeneralForecastWindow[] {
  return result.bestWindows
    .filter((window) => windowBelongsToDate(window, date))
    .filter((window) => isActionableGlowClientWindow(result, window))
    .sort(
      (left, right) =>
        windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
        (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
        Date.parse(left.startTime) - Date.parse(right.startTime),
    );
}

function isActionableGlowClientWindow(
  result: ForecastCalculationResult,
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  if (window.target !== "glow") {
    return true;
  }

  return classifyGlowWindowLifecycle({
    startAt: window.startTime,
    endAt: window.endTime,
    evaluatedAt: result.generatedAt || result.calendarBasis.forecastStart,
    timezone: result.calendarBasis.timezone,
  }).isRecommendationEligible;
}

function windowBelongsToDate(window: GeneralForecastWindow, date: string): boolean {
  return (
    window.date === date ||
    window.startTime.startsWith(`${date}T`) ||
    window.endTime.startsWith(`${date}T`)
  );
}

function sameDailyWindow(
  left: GeneralForecastWindow,
  right: GeneralForecastWindow | undefined,
): boolean {
  return (
    right !== undefined &&
    left.target === right.target &&
    left.startTime === right.startTime &&
    left.endTime === right.endTime
  );
}

function isHighConfidenceDailyWindow(
  result: ForecastCalculationResult,
  window: GeneralForecastWindow,
): boolean {
  if (isBlockedAstroWindow(window)) {
    return false;
  }
  if (!resultUsesMountainSemantics(result) && window.target === "cloud_sea") {
    return (
      window.windowLevel === "watchable" &&
      window.recommendationLevel !== "not_recommended" &&
      (window.practicalScore ?? window.score) >= 25
    );
  }
  return isUsableClientWindow(window);
}

function isBackupDailyWindow(window: GeneralForecastWindow): boolean {
  if (isBlockedAstroWindow(window)) {
    return false;
  }
  return window.recommendationLevel !== "not_recommended" && window.windowLevel !== "blocked";
}

function isBlockedAstroWindow(window: GeneralForecastWindow): boolean {
  return (
    window.target === "astro" &&
    ((window.weatherBlockers?.length ?? 0) > 0 ||
      (window.blockerReasons?.length ?? 0) > 0 ||
      window.windowLevel === "blocked" ||
      window.recommendationLevel === "not_recommended")
  );
}

function dailyBackupWindowText(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  primaryWindow: GeneralForecastWindow | undefined,
  backupWindow: GeneralForecastWindow | undefined,
): string | undefined {
  if (backupWindow) {
    return `${windowLabelText(backupWindow)} ${formatWindowTimeRange(
      backupWindow.startTime,
      backupWindow.endTime,
      result.calendarBasis.timezone,
    )}`;
  }

  return primaryWindow ? undefined : dailyFallbackBackupObservation(result, summary);
}

function dailyFallbackBackupObservation(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
): string {
  const rain = rainRiskText(summary.weather);
  if (rain.level === "中" || rain.level === "高" || rain.level === "严重") {
    return "雨后短暂开口";
  }

  const glowDay = result.glowAnalysis.dailyGlow.find((day) => day.date === summary.date);
  if (glowDay?.postRainOpeningChance === "medium" || glowDay?.postRainOpeningChance === "high") {
    return "日落后余晖";
  }

  const cloudSeaDay = result.cloudSeaAnalysis.dailyCloudSea.find(
    (day) => day.date === summary.date,
  );
  if ((cloudSeaDay?.formationScore ?? 0) >= 50) {
    return "云雾变化";
  }

  return "云层纹理或近景";
}

function dailyMainRiskText(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  breakdown: GeneralDailyBreakdown | undefined,
): string {
  const weather = summary.weather;
  const rain = rainRiskText(weather);
  if (summary.rainOverlapsPriorityWindow) {
    return "降水干扰";
  }
  if (summary.rainNearPriorityWindow) {
    return "窗口前降水";
  }
  if (rain.level === "中" || rain.level === "高" || rain.level === "严重") {
    return summary.rainOverlapWindowLabelZh === "推荐窗口之后" ? "降水在窗口后" : "降水干扰";
  }

  const cloudSeaDay = result.cloudSeaAnalysis.dailyCloudSea.find(
    (day) => day.date === summary.date,
  );
  if ((cloudSeaDay?.whiteoutRiskScore ?? breakdown?.whiteoutRisk?.score ?? 0) >= 60) {
    return resultUsesMountainSemantics(result) ? "白墙风险" : "低云遮挡";
  }

  if ((weather?.cloudLow ?? 0) >= 70) {
    return "低云遮挡";
  }

  if ((weather?.windGust ?? weather?.windSpeed ?? 0) >= 10) {
    return "阵风偏强";
  }

  const transparencyScore = weather?.photographyTransparencyScore ?? breakdown?.transparency?.score;
  if (typeof transparencyScore === "number" && transparencyScore < 60) {
    return "通透一般";
  }

  return (
    summary.riskFlags[0]?.label ??
    result.riskFlags[0]?.label ??
    "当前天气数据未识别到主要风险，仍需临近复核"
  );
}

function dailyCompactActionSuggestion(
  result: ForecastCalculationResult,
  summary: GeneralDailySummary,
  breakdown: GeneralDailyBreakdown | undefined,
  primaryWindow: GeneralForecastWindow | undefined,
  backupWindow: GeneralForecastWindow | undefined,
): string {
  const rain = rainRiskText(summary.weather);
  const rainAffectsPrimary =
    summary.rainOverlapsPriorityWindow === true || summary.rainNearPriorityWindow === true;
  if (rainAffectsPrimary && summary.rainActionZh) {
    return summary.rainActionZh;
  }
  if (
    summary.rainOverlapWindowLabelZh === "推荐窗口之后" &&
    (rain.level === "中" || rain.level === "高" || rain.level === "严重") &&
    summary.rainActionZh
  ) {
    return summary.rainActionZh;
  }
  if (rain.level === "高" || rain.level === "严重") {
    return "降水干扰明显，优先等待雨后短暂开口。";
  }
  if (rain.level === "中") {
    return "降水时段分散，优先等待雨后短暂开口。";
  }

  const mainRisk = dailyMainRiskText(result, summary, breakdown);
  if ((mainRisk === "白墙风险" || mainRisk === "低云遮挡") && !primaryWindow) {
    return resultUsesMountainSemantics(result)
      ? "白墙风险偏高，到场先看云顶高度，避免只守单一机位。"
      : "低云或雾气影响偏高，优先观察通透度和云层开口。";
  }

  if (!primaryWindow) {
    return backupWindow
      ? "条件一般，建议作为备选观察日。"
      : "暂无明确高确定性窗口，出行前等待下一次预报更新。";
  }

  const subject = windowLabelText(primaryWindow);
  if (primaryWindow.target === "cloud_sea") {
    if (!resultUsesMountainSemantics(result)) {
      return "关注晨雾、云层开口或日落光线，不建议按高山云海逻辑判断。";
    }
    return dailyOverallDecisionLabel(summary).includes("不建议")
      ? `若在附近，可观察${subject}；不建议只为单一窗口专程。`
      : `${subject}可优先安排，到场先复核云顶高度和白墙风险。`;
  }

  if (primaryWindow.target === "glow") {
    return subject.includes("日落") || subject.includes("晚霞") || subject.includes("余晖")
      ? "保留日落前后机动，窗口前复核太阳方向云缝。"
      : "日出前完成构图，等待云缝和色温变化。";
  }

  if (primaryWindow.target === "astro") {
    return (primaryWindow.weatherBlockers?.length ?? 0) > 0
      ? "有天文时间但天气不支持，不建议把星空作为主目标。"
      : "夜间窗口可纳入计划，提前确认前景和安全通行。";
  }

  if (mainRisk === "通透一般") {
    return "通透条件一般，优先准备中近景和云层纹理。";
  }

  return "条件可用，按优先窗口安排到达并保留备选题材。";
}

function compactSentence(value: string, maxLength: number): string {
  const firstClause = value
    .trim()
    .split(/[。；;]/)[0]
    ?.split("，")
    .slice(0, 2)
    .join("，")
    .trim();

  if (!firstClause) {
    return "待复核";
  }

  return firstClause.length > maxLength ? `${firstClause.slice(0, maxLength)}…` : firstClause;
}

function RiskDecisionSection({
  result,
  mainRisk,
}: {
  readonly result: ForecastCalculationResult;
  readonly mainRisk: ForecastResultSectionItem;
}) {
  const riskItems = buildRiskDecisionItems(result, mainRisk);

  return (
    <section className="grid gap-3" data-testid="risk-section">
      <SectionHeading
        title="风险提醒"
        description="只保留会影响出发、机位等待和器材保护的风险。"
        badge={
          riskItems.length > 0
            ? `${riskItems.length} 项需关注`
            : "当前数据未识别到主要风险"
        }
      />
      <JudgmentBasisGrid
        target="general"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]"
      >
        {riskItems.map((item) => (
          <Card key={item.label} className="p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-card-foreground">{item.label}</h3>
              <Badge variant={item.levelLabel.includes("高") ? "danger" : "warning"}>
                {item.levelLabel}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-sm leading-6 text-muted-foreground">
              <p>
                <span className="font-semibold text-card-foreground">影响时段：</span>
                {item.timeWindow}
              </p>
              <p>
                <span className="font-semibold text-card-foreground">建议：</span>
                {item.action}
              </p>
            </div>
          </Card>
        ))}
      </JudgmentBasisGrid>
    </section>
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
  const bestWindow = bestWindowForSubject(result, bestSubject.key);
  const backupSubjects = buildSubjectBreakdownCards(result)
    .filter((subject) => subject.key !== bestSubject.key)
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 2);
  const backupPlan = bestWindow?.backupSubjectLabel
    ? `若主窗口不成立，优先转向${bestWindow.backupSubjectLabel}。`
    : backupSubjects.length > 0
      ? `若${subjectDisplayLabel(result, bestSubject.key)}不成立，优先转向${backupSubjects
          .map(
            (subject) => `${subjectDisplayLabel(result, subject.key)}（${subject.score.score} 分）`,
          )
          .join("或")}。`
      : "如果主目标不成立，保留现场光线、云层纹理和地景构图作为备选。";

  return (
    <section className="grid gap-3" data-testid="action-plan">
      <SectionHeading
        title="出行建议"
        description="只保留到达、题材、备选、风险、装备和是否出发六类动作。"
        badge={departureRecommendationLabel(result)}
      />
      <ActionPlanGrid
        target="general"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]"
      >
        <AdviceBlock title="建议到达时间" items={[compactArrivalAdvice(result, bestWindow)]} />
        <AdviceBlock
          title="优先拍摄题材"
          items={[compactSubjectAdvice(result, bestWindow, bestSubject)]}
        />
        <AdviceBlock title="备选方案" items={[backupPlan]} />
        <AdviceBlock title="风险提醒" items={[compactRiskAdvice(mainRisk)]} />
        <AdviceBlock
          title="穿衣与装备"
          items={[packingDetail(result.clothingGuide), packingMainValue(result.clothingGuide)]}
        />
        <AdviceBlock title="是否建议出发" items={[compactDepartureAdvice(result)]} />
      </ActionPlanGrid>
    </section>
  );
}

function compactArrivalAdvice(
  result: ForecastCalculationResult,
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
): string {
  if (!window) {
    return "暂无明确高分窗口，先等下一次预报更新。";
  }
  if (window.windowLevel === "watchable" || window.windowLevel === "blocked") {
    return "当前仅适合观察或备选，不按专程到达安排。";
  }

  const timezone = "timezone" in window ? window.timezone : result.calendarBasis.timezone;
  const windowText = `拍摄窗口：${formatWindow(window.startTime, window.endTime, timezone)}`;
  const warning = window.arrivalAdvice?.warningZh
    ? ` ${firstSentence(window.arrivalAdvice.warningZh)}`
    : "";
  return `${arrivalAdviceValue(window, timezone)}；${windowText}。${warning}`.trim();
}

function compactSubjectAdvice(
  result: ForecastCalculationResult,
  window: ForecastResultWindow | ForecastCalculationResult["bestWindows"][number] | undefined,
  subject: SubjectBreakdownCard,
): string {
  const label = window ? windowLabelText(window) : subjectDisplayLabel(result, subject.key);
  return `${label}优先；${subject.score.score} 分，${firstSentence(subject.actionSuggestion)}`;
}

function compactRiskAdvice(mainRisk: ForecastResultSectionItem): string {
  return `${mainRisk.label}：${firstSentence(mainRisk.detail)}`;
}

function compactDepartureAdvice(result: ForecastCalculationResult): string {
  return `${departureRecommendationLabel(result)}；${firstSentence(primaryReasonSentence(result))}`;
}

function firstSentence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^[^。！？!?]+[。！？!?]?/);
  return (match?.[0] ?? trimmed).replace(/[。！？!?]?$/, "。");
}

function AdviceBlock({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <Card className="p-4 shadow-sm">
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
    <div className="grid h-full content-start rounded-lg border border-border bg-muted p-4">
      <p className="text-xs font-semibold text-muted-foreground">{card.label}</p>
      <p className={cn("mt-2 break-words text-2xl font-bold leading-8", cardToneText(card.tone))}>
        {card.value}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {userFacingResultText(card.detail)}
      </p>
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
    accent: "text-accent-strong",
    danger: "text-danger",
    info: "text-info-strong",
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
    <Card className={cn("p-4 shadow-sm", nonReal ? "border-warning" : "")}>
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
  const conflictStatus =
    result.weatherFusionSummary?.conflictStatusZh ?? "缺少多源一致性证据";

  return (
    <Card className="p-5 shadow-sm">
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
    <Card className="p-5 shadow-sm">
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
    if (key === "cloudSea") {
      const analysis = result.cloudSeaAnalysis;
      const whiteoutLabel = analysis.labels.whiteoutRisk;
      const usesMountainSemantics = resultUsesMountainSemantics(result);

      return {
        key,
        label: subjectDisplayLabel(result, key),
        score: {
          ...score,
          score: analysis.shootableScore,
          reasons: [
            usesMountainSemantics
              ? `云海形成 ${analysis.formationScore} 分，可拍 ${analysis.shootableScore} 分，白墙风险 ${analysis.whiteoutRiskScore} 分。`
              : `低云/雾气 ${analysis.formationScore} 分，云层开口 ${analysis.shootableScore} 分，遮挡风险 ${analysis.whiteoutRiskScore} 分。`,
          ],
        },
        priorityScore: practicalSubjectScoreFromCloudSea(result),
        windowLabel: analysis.bestCloudSeaWindow
          ? `${usesMountainSemantics ? "最佳云海窗口" : "云雾观察窗口"}：${formatWindow(
              analysis.bestCloudSeaWindow.startTime,
              analysis.bestCloudSeaWindow.endTime,
              result.calendarBasis.timezone,
            )}`
          : analysis.labels.watchableWindowLabel ??
            (usesMountainSemantics ? "暂无明确可拍云海窗口" : "暂无明确云雾观察窗口"),
        reason: !usesMountainSemantics
          ? `低海拔地形不按高山云海判断；当前云雾信号${analysis.labels.formationOpportunity}，低云遮挡${whiteoutLabel}。`
          : whiteoutLabel === "高"
            ? `云海形成条件${analysis.labels.formationOpportunity}，但低云偏厚，白墙风险高；可拍机会${analysis.labels.shootableOpportunity}。`
            : `云海形成条件${analysis.labels.formationOpportunity}，可拍机会${analysis.labels.shootableOpportunity}，白墙风险${whiteoutLabel}。`,
        actionSuggestion: !usesMountainSemantics
          ? "关注晨雾、云层开口和远景通透，不建议按高山云海逻辑判断。"
          : whiteoutLabel === "高"
            ? "若已在山上，可等待短暂开口；不建议为单一窗口专程奔赴。"
            : analysis.shootableScore >= 70
              ? "清晨有云海窗口，建议提前到达并观察云顶开口。"
              : "有云海信号，但需把白墙、降水和能见度作为现场复核点。",
      };
    }

    if (key === "sunriseGlow" || key === "sunsetGlow") {
      return buildGlowSubjectBreakdownCard(result, key, score);
    }

    if (key === "stars" || key === "milkyWay") {
      return buildAstroSubjectBreakdownCard(result, key, score);
    }

    return {
      key,
      label: subjectLabels[key],
      score,
      priorityScore: subjectPriorityScore(result, key, score.score),
      windowLabel: subjectWindowLabel(result, key),
      reason: userFacingResultText(firstText(score.reasons, "当前题材已纳入综合评分。")),
      actionSuggestion: subjectActionSuggestion(key, score.score),
    };
  });
}

function buildGlowSubjectBreakdownCard(
  result: ForecastCalculationResult,
  key: "sunriseGlow" | "sunsetGlow",
  score: ForecastScore,
): SubjectBreakdownCard {
  const analysis = result.glowAnalysis;
  const isSunrise = key === "sunriseGlow";
  const glowScore = isSunrise ? analysis.sunriseGlowScore : analysis.sunsetGlowScore;
  const chanceLabel = isSunrise
    ? analysis.labels.sunriseGlowOpportunity
    : analysis.labels.sunsetGlowOpportunity;
  const window = bestWindowForSubject(result, key);
  const analysisWindow = bestGlowWindowForPhase(analysis, isSunrise ? "sunrise" : "sunset");
  const windowText = window
    ? `${windowLabelText(window)}：${formatWindow(
        window.startTime,
        window.endTime,
        result.calendarBasis.timezone,
      )}`
    : analysisWindow
      ? `${analysisWindow.labelZh}：${formatWindow(
          analysisWindow.start,
          analysisWindow.end,
          result.calendarBasis.timezone,
        )}`
      : isSunrise
        ? "暂无明确日出暖光窗口"
        : "暂无明确日落暖光或日落后余晖窗口";
  const rainText = isSunrise
    ? analysis.rainOverlapsSunriseWindow
      ? "降水主要影响清晨窗口，朝霞不确定性较高。"
      : "降水与清晨窗口重叠较少。"
    : analysis.rainOverlapsSunsetWindow
      ? "降水主要影响日落窗口，晚霞需要现场复核云层开口。"
      : "降水与日落窗口重叠较少。";
  const reason =
    analysisWindow?.noteZh ??
    firstText(
      isSunrise
        ? score.reasons.filter((item) => item.includes("日出") || item.includes("朝霞"))
        : score.reasons.filter((item) => item.includes("日落") || item.includes("晚霞")),
      isSunrise
        ? "朝霞按日出前后中高云、光路遮挡、云层压制、低云/雾墙、降水和通透度综合判断。"
        : "晚霞按日落前后中高云承载、光路遮挡、云层压制、低云/雾墙、降水和通透度综合判断。",
    );
  const lightPathAvailable = analysis.glowLightPathDataAvailability === "available";
  const lightPathDetail = lightPathAvailable
    ? `霞光光路遮挡风险${analysis.labels.glowLightPathObstructionRisk}，${analysis.glowLightPathObstructionRisk} 分。`
    : "太阳方向光路缺少足够的方向性数据，需现场复核地平线云缝。";
  const isCorePathOpen =
    lightPathAvailable &&
    analysis.glowLightPathObstructionRisk < 65 &&
    analysis.cloudSuppressionRisk < 65 &&
    analysis.lowCloudFogWallRisk < 70;

  return {
    key,
    label: subjectLabels[key],
    score: {
      ...score,
      score: glowScore,
      reasons: [reason],
    },
    priorityScore: subjectPriorityScore(result, key, glowScore),
    windowLabel: `${isSunrise ? "日出暖光窗口" : "日落暖光 / 日落后余晖窗口"}：${windowText}`,
    reason: `${reason}${rainText}`,
    actionSuggestion:
      glowScore >= 70 && isCorePathOpen
        ? isSunrise
          ? "朝霞窗口具备等待价值，建议日出前完成构图并复核东方光路云缝。"
          : "晚霞窗口具备等待价值，建议日落前观察西向中高云和光路云缝。"
        : isSunrise
          ? "朝霞仅作谨慎观察，若光路或云层压制不利，可转拍云雾层次和远山。"
          : "日落前后可观察云层开口，但不建议只为晚霞专程前往。",
    detailItems: [
      {
        label: isSunrise ? "朝霞机会" : "晚霞机会",
        value: `${chanceLabel}（${glowScore} 分）`,
      },
      {
        label: isSunrise ? "日出暖光窗口" : "日落暖光 / 日落后余晖窗口",
        value: windowText,
      },
      {
        label: "低云/雾墙",
        value: `${analysis.labels.lowCloudFogWallRisk}（${analysis.lowCloudFogWallRisk} 分）`,
        detail:
          analysis.lowCloudFogWallRisk >= 65
            ? "低云或雾墙风险偏高，说明近地视野需要复核，不等同于太阳方向光路已打开。"
            : "低云/雾墙暂未成为主要阻断项。",
      },
      {
        label: "霞光光路",
        value: lightPathAvailable
          ? `${analysis.labels.glowLightPathObstructionRisk}（${analysis.glowLightPathObstructionRisk} 分）`
          : "需现场复核",
        detail: lightPathDetail,
      },
      {
        label: "云层压制",
        value: `${analysis.labels.cloudSuppressionRisk}（${analysis.cloudSuppressionRisk} 分）`,
        detail:
          analysis.cloudSuppressionRisk >= 65
            ? "云量或云层厚度可能压住色彩，不宜只凭云层载体押强霞。"
            : "云层压制暂未成为主要阻断项。",
      },
      {
        label: "色彩云条件",
        value: `${analysis.labels.colorCarrier}（${analysis.colorCarrierScore} 分）`,
        detail:
          analysis.colorCarrierScore >= 65
            ? "中高云条件较好，有机会承载暖色。"
            : "中高云载体偏弱，可能只有局部暖色或短时色彩。",
      },
      {
        label: "判断依据",
        value: rainText,
      },
    ],
  };
}

function buildAstroSubjectBreakdownCard(
  result: ForecastCalculationResult,
  key: "stars" | "milkyWay",
  score: ForecastScore,
): SubjectBreakdownCard {
  const analysis = result.astroAnalysis;
  const firstDaily = analysis.dailyAstro[0];
  const blockers = astroMainBlockers(result, firstDaily);
  const blockerText = blockers.join("、");
  const recommendedWindow =
    analysis.recommendedMilkyWayWindow ?? analysis.recommendedMilkyWayWindows[0];
  const candidateWindow = analysis.milkyWayCandidateWindows[0];
  const moonlessWindow = analysis.moonlessNightWindows[0];
  const astronomicalWindow = analysis.astronomicalNightWindows[0];
  const isMilkyWay = key === "milkyWay";
  const displayScore = isMilkyWay ? analysis.milkyWayGeometryScore : analysis.practicalAstroScore;
  const shootability = isMilkyWay
    ? analysis.labels.milkyWayShootability
    : analysis.labels.starShootability;
  const windowLabel = isMilkyWay
    ? analysis.astroShootable && recommendedWindow
      ? `推荐银河窗口：${formatAstroWindowForUi(recommendedWindow, result.calendarBasis.timezone)}`
      : candidateWindow
        ? `银河天文窗口：${formatAstroWindowForUi(
            candidateWindow,
            result.calendarBasis.timezone,
          )}；${blockerText}，不建议专程夜拍`
        : "银河窗口：暂无可用"
    : astronomicalWindow
      ? `天文窗口：${analysis.labels.astronomicalWindow}｜${formatAstroWindowForUi(
          astronomicalWindow,
          result.calendarBasis.timezone,
        )}`
      : `天文窗口：${analysis.labels.astronomicalWindow}`;
  const reason = analysis.astroShootable
    ? isMilkyWay
      ? "云量较低、月光影响小，可重点关注银河窗口。"
      : "天文窗口、云量、通透度和月光组合可用，星空可作为夜间主目标。"
    : analysis.astroWindowAvailable
      ? isMilkyWay
        ? `银河方向和时间合适，但${blockerText}，建议放弃专程夜拍。`
        : `有天文窗口，但${blockerText}，实际可见性较差。`
      : "暂无有效天文窗口，夜间拍摄不宜作为主目标。";

  return {
    key,
    label: subjectLabels[key],
    score: {
      ...score,
      score: displayScore,
      reasons: [reason],
    },
    priorityScore: subjectPriorityScore(result, key, displayScore),
    windowLabel,
    reason,
    actionSuggestion: analysis.astroShootable
      ? isMilkyWay
        ? "云量较低、月光影响小，可重点关注银河窗口。"
        : "夜间可纳入计划，仍需临近复核云层开口、路况和安全撤离时间。"
      : analysis.astroWindowAvailable
        ? "天气窗口不足，夜间可作为备选观察，不建议作为主目标。"
        : "不建议专程夜拍，优先转向云海、霞光或通透地景。",
    detailItems: [
      {
        label: "天文窗口",
        value: astronomicalWindow
          ? `${analysis.labels.astronomicalWindow}｜${formatAstroWindowForUi(
              astronomicalWindow,
              result.calendarBasis.timezone,
            )}`
          : analysis.labels.astronomicalWindow,
      },
      {
        label: isMilkyWay ? "银河可拍性" : "星空可拍性",
        value: `${shootability}｜${displayScore} 分`,
        detail: analysis.astroShootable
          ? "天文与天气同时可用。"
          : "天文窗口不等于实际可拍性，需按天气阻断降级。",
      },
      {
        label: "主要阻碍",
        value:
          blockers.length > 0
            ? blockerText
            : "当前天气数据未识别到主要阻碍，仍需临近复核",
      },
      {
        label: "云量阻挡",
        value: analysis.labels.cloudBlocker,
        detail:
          analysis.cloudBlockerLevel === "high"
            ? "低云或总云量已明显压低星空银河实际可见性。"
            : "云量仍需临近复核。高云会影响银河反差，低云会遮挡地景和近地平线。",
      },
      {
        label: "月光影响",
        value: analysis.labels.moonlightImpact,
        detail:
          analysis.labels.moonlightImpact === "高"
            ? "月亮在地平线上且照明较强时，不建议把银河作为最佳目标。"
            : "月光暂未成为主要阻断，可结合无月黑夜窗口安排。",
      },
      {
        label: "露水风险",
        value: analysis.labels.dewRisk,
        detail:
          analysis.dewRiskLevel === "high"
            ? "湿度和露点差组合偏危险，需准备防露带、镜头布和保暖。"
            : "仍建议携带镜头布、备用电池和防潮装备。",
      },
      ...(isMilkyWay
        ? [
            {
              label: "银心窗口",
              value: candidateWindow
                ? formatAstroWindowForUi(candidateWindow, result.calendarBasis.timezone)
                : "暂无明确窗口",
              detail: candidateWindow?.directionZh
                ? `银河方向：${candidateWindow.directionZh}`
                : "银河方向需结合现场前景复核。",
            },
            {
              label: "无月黑夜",
              value: moonlessWindow
                ? formatAstroWindowForUi(moonlessWindow, result.calendarBasis.timezone)
                : "暂无明确窗口",
            },
            {
              label: analysis.astroShootable ? "推荐银河窗口" : "银河窗口判断",
              value:
                analysis.astroShootable && recommendedWindow
                  ? formatAstroWindowForUi(recommendedWindow, result.calendarBasis.timezone)
                  : "天气未通过，不显示为推荐窗口",
            },
          ]
        : []),
    ],
  };
}

function pickBestSubject(cards: readonly SubjectBreakdownCard[]): SubjectBreakdownCard {
  const best = [...cards].sort((left, right) => right.priorityScore - left.priorityScore)[0];
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
    priorityScore: 0,
    windowLabel: "暂无明确高分窗口",
    reason: "当前缺少可用于题材排序的评分。",
    actionSuggestion: "先以现场通透度和安全条件作为判断基准。",
  };
}

function subjectPriorityScore(
  result: ForecastCalculationResult,
  key: SubjectScoreKey,
  fallbackScore: number,
): number {
  if ((key === "stars" || key === "milkyWay") && !result.astroAnalysis.astroShootable) {
    return Math.min(result.astroAnalysis.astroPracticalScore, 34);
  }

  const window = bestWindowForSubject(result, key);
  if (!window) {
    return fallbackScore;
  }

  return (
    Math.round((fallbackScore * 0.42 + (window.practicalScore ?? window.score) * 0.58) * 10) / 10
  );
}

function practicalSubjectScoreFromCloudSea(result: ForecastCalculationResult): number {
  const window = bestWindowForSubject(result, "cloudSea");
  const windowScore = window?.practicalScore ?? window?.score;
  return (
    Math.round(
      ((windowScore ?? result.cloudSeaAnalysis.shootableScore) * 0.58 +
        result.cloudSeaAnalysis.shootableScore * 0.42) *
        10,
    ) / 10
  );
}

function pickMainRisk(result: ForecastCalculationResult): ForecastResultSectionItem {
  const risk = result.riskFlags[0];
  if (risk) {
    return {
      label: risk.label,
      value: `${riskLevelText(risk.level)}风险`,
      detail: riskDetailWithTime(result, risk),
    };
  }

  if (result.scores.whiteoutRisk.score >= 65) {
    const usesMountainSemantics = resultUsesMountainSemantics(result);
    return {
      label: usesMountainSemantics ? "白墙风险" : "低云遮挡",
      value: "中风险",
      detail: appendRiskTimeContext(
        firstText(
          [...result.scores.whiteoutRisk.risks, ...result.scores.whiteoutRisk.reasons],
          usesMountainSemantics
            ? "低云、湿度和能见度组合需要出行前复核。"
            : "低云、雾气和能见度组合需要出行前复核。",
        ),
        fallbackRiskTimeLabel(result, "whiteout"),
      ),
    };
  }

  return {
    label: "暂无高等级风险",
    value: "低风险",
    detail: appendRiskTimeContext(
      "仍需在出行前复核最新天气、道路和景区开放信息。",
      buildNearTermWeatherTimeContext(result).sectionWindowLabel,
    ),
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

  return window.dateTimeRangeLabel;
}

function coreWindowDetail(
  result: ForecastCalculationResult,
  window: ForecastResultWindow | undefined,
): string {
  if (!window) {
    return "优先复核后续天气更新。";
  }

  const scores =
    typeof window.conditionScore === "number" && typeof window.practicalScore === "number"
      ? `实用 ${window.practicalScore} 分，气象 ${window.conditionScore} 分`
      : `${window.score} 分`;
  const note = window.practicalNoteZh ? ` ${window.practicalNoteZh}` : "";

  return `${window.badgeLabel}，${windowActionLabel(window)}，${windowRiskTag(
    result,
    window,
  )}，${scores}。${note}`;
}

function subjectWindowLabel(result: ForecastCalculationResult, key: SubjectScoreKey): string {
  const window = bestWindowForSubject(result, key);
  if (window) {
    const label = windowLabelText(window);
    const blockers = window.blockerReasons ?? window.weatherBlockers ?? [];
    if (
      (key === "milkyWay" || key === "stars") &&
      (blockers.length > 0 || window.windowLevel === "blocked")
    ) {
      return `天文窗口：${formatWindow(
        window.startTime,
        window.endTime,
        result.calendarBasis.timezone,
      )}；${blockers[0] ?? astroBlockedReasonText(window)}，不建议作为唯一目标。`;
    }
    if (key === "milkyWay") {
      return `银河可拍窗口：${formatWindow(
        window.startTime,
        window.endTime,
        result.calendarBasis.timezone,
      )}`;
    }
    if (key === "sunsetGlow") {
      return `${label}：${formatWindow(
        window.startTime,
        window.endTime,
        result.calendarBasis.timezone,
      )}`;
    }
    if (key === "sunriseGlow") {
      return `${label}：${formatWindow(
        window.startTime,
        window.endTime,
        result.calendarBasis.timezone,
      )}`;
    }
    return `${label}：${formatWindow(
      window.startTime,
      window.endTime,
      result.calendarBasis.timezone,
    )}`;
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
      windowUsefulnessRank(right) - windowUsefulnessRank(left) ||
      (right.practicalScore ?? right.score) - (left.practicalScore ?? left.score) ||
      Date.parse(left.startTime) - Date.parse(right.startTime),
  );
  const executableWindows = windows.filter(isExecutableClientWindow);
  const findCandidate = (
    predicate: (window: ForecastCalculationResult["bestWindows"][number]) => boolean,
  ) => executableWindows.find(predicate) ?? windows.find(predicate);

  if (key === "cloudSea") {
    return findCandidate((window) => window.target === "cloud_sea");
  }
  if (key === "sunriseGlow") {
    return findCandidate((window) => window.target === "glow" && isMorningForecastWindow(window));
  }
  if (key === "sunsetGlow") {
    return findCandidate((window) => window.target === "glow" && isEveningForecastWindow(window));
  }
  if (key === "stars") {
    return findCandidate(
      (window) =>
        window.target === "astro" &&
        ((window.subjectPriorityLabel ?? window.label).includes("星空") ||
          window.label.includes("天文黑夜")),
    );
  }
  if (key === "milkyWay") {
    return findCandidate((window) => window.target === "astro" && window.label.includes("银河"));
  }

  return executableWindows[0] ?? windows[0];
}

function isMorningForecastWindow(
  window: Pick<
    ForecastCalculationResult["bestWindows"][number],
    "lightPhase" | "startTime" | "label" | "subjectPriorityLabel"
  >,
): boolean {
  if (window.lightPhase === "dawn" || window.lightPhase === "sunrise") {
    return true;
  }
  if (window.lightPhase === "sunset" || window.lightPhase === "blue_hour") {
    return false;
  }
  const hour = hourFromIsoLike(window.startTime);
  if (typeof hour === "number") {
    return hour < 12;
  }
  const subject = window.subjectPriorityLabel ?? window.label;
  return subject.includes("朝霞") || subject.includes("日出");
}

function isEveningForecastWindow(
  window: Pick<
    ForecastCalculationResult["bestWindows"][number],
    "lightPhase" | "startTime" | "label" | "subjectPriorityLabel"
  >,
): boolean {
  if (window.lightPhase === "sunset" || window.lightPhase === "blue_hour") {
    return true;
  }
  if (window.lightPhase === "dawn" || window.lightPhase === "sunrise") {
    return false;
  }
  const hour = hourFromIsoLike(window.startTime);
  if (typeof hour === "number") {
    return hour >= 12;
  }
  const subject = window.subjectPriorityLabel ?? window.label;
  return subject.includes("晚霞") || subject.includes("日落") || subject.includes("余晖");
}

function isExecutableClientWindow(
  window: ForecastCalculationResult["bestWindows"][number],
): boolean {
  const hasHierarchy =
    window.windowLevel !== undefined || window.executableForDedicatedTrip !== undefined;
  if (window.executableForDedicatedTrip !== undefined) {
    return window.executableForDedicatedTrip;
  }
  if (!hasHierarchy) {
    return (
      window.practicalKind !== "formation_signal" &&
      window.recommendationLevel === "recommended" &&
      (window.practicalScore ?? window.score) >= 72
    );
  }
  return (
    window.practicalKind !== "formation_signal" &&
    (window.windowLevel === "best" || window.windowLevel === "shootable") &&
    window.recommendationLevel === "recommended" &&
    (window.practicalScore ?? window.score) >= 72
  );
}

function isUsableClientWindow(window: ForecastCalculationResult["bestWindows"][number]): boolean {
  if (window.practicalKind === "formation_signal" || window.windowLevel === "blocked") {
    return false;
  }
  if (window.recommendationLevel === "backup" || window.recommendationLevel === "not_recommended") {
    return false;
  }
  if (
    window.windowLevel !== undefined &&
    window.windowLevel !== "shootable" &&
    window.windowLevel !== "best"
  ) {
    return false;
  }
  return (window.practicalScore ?? window.score) >= 54;
}

function isExecutableDisplayWindow(window: ForecastResultWindow): boolean {
  const hasHierarchy =
    window.windowLevel !== undefined || window.executableForDedicatedTrip !== undefined;
  if (window.executableForDedicatedTrip !== undefined) {
    return window.executableForDedicatedTrip;
  }
  if (!hasHierarchy) {
    return (
      window.practicalKind !== "formation_signal" &&
      window.recommendationLevel === "recommended" &&
      (window.practicalScore ?? window.score) >= 72
    );
  }

  return (
    window.practicalKind !== "formation_signal" &&
    (window.windowLevel === "best" || window.windowLevel === "shootable") &&
    window.recommendationLevel === "recommended" &&
    (window.practicalScore ?? window.score) >= 72
  );
}

function windowUsefulnessRank(window: ForecastCalculationResult["bestWindows"][number]): number {
  if (window.windowLevel === "best") {
    return 4;
  }
  if (window.windowLevel === "shootable") {
    return 3;
  }
  if (window.windowLevel === "watchable") {
    return 2;
  }
  if (window.windowLevel === "blocked") {
    return 0;
  }
  return 1;
}

function windowRiskTag(result: ForecastCalculationResult, window: ForecastResultWindow): string {
  if ((window.blockerReasons?.length ?? 0) > 0) {
    return window.blockerReasons![0]!;
  }
  if (window.practicalKind === "formation_signal") {
    return "无光形成信号";
  }
  if (
    window.precipitationRisk?.rainRiskLevel === "high" ||
    window.precipitationRisk?.rainRiskLevel === "severe"
  ) {
    return "降水打断";
  }
  if (window.restWarningZh) {
    return "作息成本高";
  }
  if (window.target === "cloud_sea" && result.scores.whiteoutRisk.score >= 65) {
    return resultUsesMountainSemantics(result) ? "白墙需复核" : "低云遮挡需复核";
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

  return result.riskFlags[0]?.label ?? "当前天气数据未识别到主要风险，仍需临近复核";
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

function astroWindowBlockerLabels(blockers: readonly string[]): readonly string[] {
  const text = blockers.join(" ");
  const labels = [
    /低云/.test(text) ? "低云偏多" : "",
    /总云|云量|云层|厚云/.test(text) ? "云量偏高" : "",
    /降水|雨|雪/.test(text) ? "降水干扰" : "",
    /通透|能见度|霾|雾/.test(text) ? "通透度不足" : "",
    /月光/.test(text) ? "月光影响" : "",
    /露|结露|湿度/.test(text) ? "露水风险" : "",
  ].filter(Boolean);

  return [
    ...new Set(
      labels.length > 0 ? labels : blockers.map((blocker) => blocker.replace(/[。.]$/, "")),
    ),
  ].slice(0, 3);
}

function windowActionLabel(window: ForecastResultWindow): string {
  if (window.windowLevel === "blocked") {
    return "不建议专程";
  }
  if (window.windowLevel === "watchable") {
    return "仅作观察";
  }
  if (window.practicalKind === "formation_signal") {
    return "仅作观察";
  }
  const score = window.practicalScore ?? window.score;
  if (score >= 75) {
    return "优先安排";
  }
  if (score >= 65) {
    return "可等待";
  }
  return "作为备选";
}

function glowGeneralFactsText(result: ForecastCalculationResult): string {
  const analysis = result.glowAnalysis;
  return `朝霞机会 ${analysis.sunriseGlowScore} 分，晚霞机会 ${analysis.sunsetGlowScore} 分；霞光云层载体${analysis.labels.colorCarrier}（${analysis.glowCarrierScore ?? analysis.colorCarrierScore} 分），低云/雾墙风险${analysis.labels.lowCloudFogWallRisk}（${analysis.lowCloudFogWallRisk ?? analysis.lowCloudObstructionRisk} 分），霞光光路遮挡风险${analysis.labels.glowLightPathObstructionRisk}（${analysis.glowLightPathObstructionRisk} 分），云层压制风险${analysis.labels.cloudSuppressionRisk}（${analysis.cloudSuppressionRisk} 分）。${glowLightPathClientText(analysis)}${glowRainImpactText(analysis)}`;
}

function glowLightPathClientText(
  analysis: Pick<
    ForecastCalculationResult["glowAnalysis"],
    "glowLightPathDataAvailability" | "glowLightPathObstructionRisk"
  >,
): string {
  if (analysis.glowLightPathDataAvailability === "insufficient") {
    return "太阳方向光路缺少足够的方向性数据，需现场复核地平线云缝。";
  }
  if (analysis.glowLightPathObstructionRisk >= 70) {
    return "霞光光路遮挡风险偏高，需优先复核太阳方向云缝。";
  }
  if (analysis.glowLightPathObstructionRisk >= 45) {
    return "霞光光路遮挡风险中等，需现场复核地平线光路。";
  }
  return "霞光光路遮挡风险较低。";
}

function glowGeneralWindowText(result: ForecastCalculationResult): string {
  const mainWindow =
    result.glowAnalysis.bestGlowWindow ??
    result.glowAnalysis.bestGlowWindows[0] ??
    result.glowAnalysis.watchableGlowWindows[0];
  const highConfidence = result.glowAnalysis.bestGlowWindows.find(
    (window) => (window.practicalScore ?? window.score) >= 75,
  );
  const mainText = mainWindow
    ? `主要可观察窗口：${glowWindowDisplayName(mainWindow)} ${formatWindow(
        mainWindow.start,
        mainWindow.end,
        result.calendarBasis.timezone,
      )}。`
    : "主要可观察窗口：暂无。";
  const highText = highConfidence
    ? `高确定性拍摄窗口：${glowWindowDisplayName(highConfidence)} ${formatWindow(
        highConfidence.start,
        highConfidence.end,
        result.calendarBasis.timezone,
      )}。`
    : "高确定性拍摄窗口：暂无。";
  return `${mainText}${highText}`;
}

function glowRainImpactText(analysis: ForecastCalculationResult["glowAnalysis"]): string {
  if (analysis.rainOverlapsSunriseWindow && analysis.rainOverlapsSunsetWindow) {
    return "降水影响日出和日落窗口，霞光不确定性较高。";
  }
  if (analysis.rainOverlapsSunriseWindow) {
    return "降水主要影响清晨窗口，朝霞不确定性较高。";
  }
  if (analysis.rainOverlapsSunsetWindow) {
    return "降水主要影响日落窗口，晚霞需要现场复核云层开口。";
  }
  return `降水对日出/日落窗口影响较小，${postRainOpeningText(analysis.postRainOpeningChance)}。`;
}

function bestGlowWindowForPhase(
  analysis: ForecastCalculationResult["glowAnalysis"],
  phase: "sunrise" | "sunset",
): GlowWindow | undefined {
  return [
    ...analysis.bestGlowWindows,
    ...analysis.watchableGlowWindows,
    ...analysis.notRecommendedGlowWindows,
  ].find((window) =>
    phase === "sunrise" ? isMorningGlowWindow(window) : !isMorningGlowWindow(window),
  );
}

function isMorningGlowWindow(
  window: Pick<GlowWindow, "type" | "start" | "labelZh" | "phase">,
): boolean {
  if (window.phase === "sunrise") {
    return true;
  }
  if (window.phase === "sunset") {
    return false;
  }
  if (
    window.type === "sunrise_glow" ||
    window.type === "pre_dawn_glow" ||
    window.type === "sunrise_core" ||
    window.type === "morning_warm_light" ||
    window.type === "sunrise"
  ) {
    return true;
  }
  if (
    window.type === "sunset_glow" ||
    window.type === "sunset_warm_light" ||
    window.type === "sunset_core" ||
    window.type === "afterglow" ||
    window.type === "sunset" ||
    window.type === "blue_hour_transition"
  ) {
    return false;
  }
  const hour = hourFromIsoLike(window.start);
  return typeof hour === "number" ? hour < 12 : window.labelZh.includes("朝霞");
}

function glowWindowDisplayName(window: GlowWindow): string {
  if (isMorningGlowWindow(window)) {
    return window.labelZh.includes("日出") || window.labelZh.includes("朝霞")
      ? window.labelZh
      : "朝霞";
  }
  if (window.type === "afterglow" || window.labelZh.includes("余晖")) {
    return window.labelZh.includes("余晖") ? window.labelZh : "日落后余晖";
  }
  return window.labelZh.includes("日落") || window.labelZh.includes("晚霞")
    ? window.labelZh
    : "晚霞";
}

function postRainOpeningText(
  chance: ForecastCalculationResult["glowAnalysis"]["postRainOpeningChance"] | undefined,
): string {
  if (chance === "high") {
    return "雨后开口机会高";
  }
  if (chance === "medium") {
    return "雨后若短暂开口，可转拍云雾层次和远山";
  }
  if (chance === "low") {
    return "雨后开口机会低";
  }
  return "雨后开口待复核";
}

function hourFromIsoLike(value: string): number | undefined {
  const match = /T(\d{2})/.exec(value);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : undefined;
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

function formatFullDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
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

function dateLabelForResultClient(result: ForecastCalculationResult, date: string): string {
  const index = result.calendarBasis.targetDates.indexOf(date);
  const label = formatLocalDateLabel(date, result.calendarBasis.timezone);
  return label === "时间待确认" ? result.calendarBasis.targetDateLabels[index] ?? date : label;
}

function formatWindow(startTime: string, endTime: string, timezone = "Asia/Shanghai"): string {
  return formatLocalDateTimeRange(startTime, endTime, timezone);
}

function formatWindowTimeRange(
  startTime: string,
  endTime: string,
  timezone = "Asia/Shanghai",
): string {
  return formatLocalTimeRange(startTime, endTime, timezone);
}

function formatTemperature(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}°C` : "暂无";
}

function formatTemperatureRange(range: readonly [number, number] | null | undefined): string {
  if (!range) {
    return "暂无";
  }
  const [low, high] = range;
  return Math.round(low) === Math.round(high)
    ? `${Math.round(low)}°C`
    : `${Math.round(low)}-${Math.round(high)}°C`;
}

function formatKilometers(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${roundDisplay(value)} 公里`
    : "暂无";
}

function formatPercentNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "暂无";
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
      ? windDirectionLabel(windDirection)
      : "";
  return direction ? `${speed} ${direction}` : speed;
}

function formatWindWithGust(
  windSpeed: number | null | undefined,
  windDirection: number | null | undefined,
  windGust: number | null | undefined,
): string {
  const wind = formatWind(windSpeed, windDirection);
  return typeof windGust === "number" && Number.isFinite(windGust)
    ? `${wind}，阵风 ${formatWindSpeed(windGust)}`
    : wind;
}

function formatWindSpeed(windSpeed: number | null | undefined): string {
  return typeof windSpeed === "number" && Number.isFinite(windSpeed)
    ? `${roundDisplay(windSpeed)} m/s`
    : "暂无";
}

function formatTemperatureDelta(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${roundDisplay(value)}°C` : "暂无";
}

function windDirectionLabel(value: number): string {
  const directions = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  const normalized = ((value % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % directions.length;
  return directions[index] ?? `${Math.round(value)}°`;
}

function shiftTime(value: string, minutes: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp + minutes * 60 * 1000).toISOString();
}

function roundDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function transparencyGradeLabel(
  grade: string | null | undefined,
  score: number | null | undefined,
): string {
  const normalizedGrade =
    grade ??
    (typeof score === "number" && Number.isFinite(score)
      ? score >= 82
        ? "excellent"
        : score >= 68
          ? "good"
          : score >= 48
            ? "fair"
            : "poor"
      : undefined);
  const labels: Record<string, string> = {
    excellent: "优秀",
    good: "较好",
    fair: "一般",
    poor: "较差",
  };
  const label = normalizedGrade ? labels[normalizedGrade] ?? "待复核" : "待复核";
  return typeof score === "number" && Number.isFinite(score)
    ? `${label} ${Math.round(score)} 分`
    : label;
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
