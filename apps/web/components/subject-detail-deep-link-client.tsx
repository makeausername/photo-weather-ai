"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ForecastCalculationResult,
  ForecastQueryInput,
  ForecastTarget,
} from "@photo-weather/shared";
import { forecastHorizonLabels } from "@photo-weather/shared";
import {
  AstroResultPage,
  CloudSeaResultPage,
  ForecastDecisionErrorState,
  ForecastDecisionLoadingState,
  GlowResultPage,
  type DecisionProgressContext,
} from "../app/forecast/forecast-result-client";
import { requestForecastCalculation } from "../app/forecast/forecast-request-client";
import {
  buildForecastResultViewModel,
  buildGlowForecastViewModel,
} from "../app/forecast/forecast-result-view-model";
import { focusSubjectDetailResult } from "../app/forecast/subject-detail-focus";
import {
  formatSubjectDetailWindowLabel,
  buildSubjectDetailFallbackRequest,
  incompleteContextMessage,
  readForecastResultContext,
  type SubjectDetailDeepLinkContext,
  type SubjectDetailDeepLinkParseResult,
  type SubjectDetailTarget,
} from "../app/forecast/subject-detail-links";
import { PublicShell } from "./public-shell";
import { Badge, Card } from "./ui";

type SubjectDetailDeepLinkClientProps = {
  readonly target: SubjectDetailTarget;
  readonly parsed: SubjectDetailDeepLinkParseResult;
};

type LoadState =
  | {
      readonly status: "invalid";
      readonly message: string;
    }
  | {
      readonly status: "loading";
    }
  | {
      readonly status: "ready";
      readonly query: ForecastQueryInput;
      readonly result: ForecastCalculationResult;
      readonly refreshed?: boolean;
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

export function SubjectDetailDeepLinkClient({ target, parsed }: SubjectDetailDeepLinkClientProps) {
  const initialState = useMemo<LoadState>(() => {
    if (parsed.kind === "invalid") {
      return {
        status: "invalid",
        message: parsed.message,
      };
    }
    return {
      status: "loading",
    };
  }, [parsed]);
  const [state, setState] = useState<LoadState>(initialState);
  const context =
    parsed.kind === "ready"
      ? parsed.context
      : parsed.kind === "invalid"
        ? parsed.context
        : undefined;
  const cloudSeaFallbackQuery =
    target === "cloud_sea" && parsed.kind === "ready" ? parsed.fallbackQuery : null;

  useEffect(() => {
    let cancelled = false;

    async function loadSubjectResult() {
      if (parsed.kind !== "ready") {
        return;
      }

      const cached = await readForecastResultContext(
        parsed.context.resultId ?? parsed.context.reportId,
      );
      if (cancelled) return;
      if (cached) {
        setState({
          status: "ready",
          query: {
            ...cached.query,
            target,
          },
          result: cached.result,
        });
        return;
      }

      if (!parsed.fallbackQuery) {
        setState({
          status: "invalid",
          message: incompleteContextMessage,
        });
        return;
      }

      setState({ status: "loading" });
      try {
        const requestBody = buildSubjectDetailFallbackRequest(parsed)!;
        const result = await requestForecastCalculation(requestBody);
        if (!cancelled) {
          setState({
            status: "ready",
            query: parsed.fallbackQuery,
            result,
            refreshed: true,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              (error as Error).message ||
              "专项判断暂时不可用，请返回综合判断或重新选择地点后再试。",
          });
        }
      }
    }

    void loadSubjectResult();

    return () => {
      cancelled = true;
    };
  }, [parsed, target]);

  return (
    <PublicShell contentClassName="grid gap-5 pb-14">
      {context ? (
        <GeneralSourceContextBar
          context={context}
          query={queryForContext(state)}
          refreshed={state.status === "ready" && state.refreshed}
        />
      ) : null}

      {state.status === "loading" ? (
        target === "cloud_sea" ? (
          <ForecastDecisionLoadingState
            target="cloud_sea"
            context={cloudSeaProgressContext(parsed, context)}
          />
        ) : (
          <Card className="p-5 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-semibold text-card-foreground">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              正在读取综合判断上下文...
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              页面会优先复用综合判断结果；如果本地上下文不可用，将按原报告的地点与预报范围刷新数据。
            </p>
          </Card>
        )
      ) : null}

      {state.status === "invalid" || state.status === "error" ? (
        state.status === "error" && cloudSeaFallbackQuery ? (
          <ForecastDecisionErrorState
            target="cloud_sea"
            query={cloudSeaFallbackQuery}
            message={state.message}
          />
        ) : (
          <SubjectContextFallbackCard message={state.message} target={target} />
        )
      ) : null}

      {state.status === "ready" ? (
        <SubjectResultContent
          target={target}
          query={state.query}
          result={state.result}
          context={context}
        />
      ) : null}
    </PublicShell>
  );
}

function cloudSeaProgressContext(
  parsed: SubjectDetailDeepLinkParseResult,
  context: Partial<SubjectDetailDeepLinkContext> | undefined,
): DecisionProgressContext {
  if (parsed.kind === "ready" && parsed.fallbackQuery) {
    return parsed.fallbackQuery;
  }

  return {
    name: context?.location?.locationName ?? "地点待确认",
    horizon: context?.horizon,
  };
}

function SubjectResultContent({
  target,
  query,
  result: suppliedResult,
  context,
}: {
  readonly target: SubjectDetailTarget;
  readonly query: ForecastQueryInput;
  readonly result: ForecastCalculationResult;
  readonly context?: Partial<SubjectDetailDeepLinkContext>;
}) {
  const subjectQuery = useMemo(
    () => ({
      ...query,
      target,
    }),
    [query, target],
  );
  const result = useMemo(
    () => focusSubjectDetailResult(suppliedResult, target, context),
    [suppliedResult, target, context],
  );
  const viewModel = useMemo(
    () => (result ? buildForecastResultViewModel(result, target) : undefined),
    [result, target],
  );

  if (!result || !viewModel) {
    return (
      <SubjectContextFallbackCard
        target={target}
        message={`${context?.date ?? "所选日期"} 的原窗口或逐日数据已不可用，刷新后未找到相同窗口；请返回综合判断重新选择日期和时段。`}
      />
    );
  }

  if (target === "cloud_sea" && viewModel.cloudSea) {
    return (
      <CloudSeaResultPage
        query={subjectQuery}
        result={result}
        viewModel={viewModel.cloudSea}
        returnUrl={context?.source === "general" ? context.returnUrl ?? "/" : undefined}
      />
    );
  }

  if (target === "glow" && viewModel.glow) {
    return (
      <GlowResultPage
        query={subjectQuery}
        result={result}
        viewModel={buildGlowForecastViewModel(result, context)}
      />
    );
  }

  if (target === "astro" && viewModel.astro) {
    if (
      context?.date &&
      !viewModel.astro.nightlyCards.some((night) => night.localEveningDate === context.date)
    ) {
      return (
        <SubjectContextFallbackCard
          target={target}
          message={`${context.date} 的观测夜不在这份报告的预报范围内，请扩大预报范围后重新查询。`}
        />
      );
    }
    return (
      <AstroResultPage
        key={context?.date}
        query={subjectQuery}
        result={result}
        viewModel={viewModel.astro}
        initialNightDate={context?.date}
      />
    );
  }

  return (
    <SubjectContextFallbackCard
      message="当前综合判断结果缺少对应题材的数据，请重新选择地点。"
      target={target}
    />
  );
}

function GeneralSourceContextBar({
  context,
  query,
  refreshed,
}: {
  readonly context: Partial<SubjectDetailDeepLinkContext>;
  readonly query?: ForecastQueryInput;
  readonly refreshed?: boolean;
}) {
  const locationName = context.location?.locationName ?? query?.name ?? "地点待确认";
  const date = context.date ?? "日期待确认";
  const windowLabel =
    context.target && context.date
      ? formatSubjectDetailWindowLabel(context as SubjectDetailDeepLinkContext)
      : "窗口待确认";
  const returnUrl = context.returnUrl ?? "/";

  return (
    <Card className="p-3 shadow-sm">
      <div className="flex flex-col gap-3 min-[860px]:flex-row min-[860px]:items-center min-[860px]:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <Badge variant="default">来自综合判断</Badge>
          <span className="break-words text-card-foreground">地点：{locationName}</span>
          <span className="text-muted-foreground">日期：{date}</span>
          <span className="text-muted-foreground">窗口：{windowLabel}</span>
          {query?.horizon ? (
            <span className="text-muted-foreground">
              范围：{forecastHorizonLabels[query.horizon]}
            </span>
          ) : null}
        </div>
        <a
          href={returnUrl}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
        >
          返回综合判断
        </a>
      </div>
      {refreshed ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {context.forecastStart
            ? "原报告的本地缓存已失效，已按原地点与预报范围刷新；天气数据更新后，结果可能与原报告不同。"
            : "原报告的本地缓存已失效，旧链接未记录预报起点，已按当前时间刷新；请返回综合判断查看最新报告。"}
        </p>
      ) : null}
    </Card>
  );
}

function SubjectContextFallbackCard({
  message,
  target,
}: {
  readonly message: string;
  readonly target: ForecastTarget;
}) {
  return (
    <Card className="border-warning p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">上下文不可用</Badge>
        <Badge variant="muted">{subjectTargetLabel(target)}</Badge>
      </div>
      <h1 className="mt-3 text-xl font-bold text-card-foreground">无法自动打开专项判断</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
      <a
        href={pathForTarget(target)}
        className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
      >
        重新选择地点
      </a>
    </Card>
  );
}

function queryForContext(state: LoadState): ForecastQueryInput | undefined {
  return state.status === "ready" ? state.query : undefined;
}

function pathForTarget(target: ForecastTarget): string {
  if (target === "cloud_sea") {
    return "/cloud-sea";
  }
  if (target === "glow") {
    return "/glow";
  }
  if (target === "astro") {
    return "/astro";
  }
  return "/";
}

function subjectTargetLabel(target: ForecastTarget): string {
  if (target === "cloud_sea") {
    return "云海";
  }
  if (target === "glow") {
    return "朝霞晚霞";
  }
  if (target === "astro") {
    return "星空银河";
  }
  return "综合判断";
}
