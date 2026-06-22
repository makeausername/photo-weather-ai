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
import { getStoredAdminTokens } from "../app/admin/admin-api";
import { buildForecastResultViewModel } from "../app/forecast/forecast-result-view-model";
import {
  formatSubjectDetailWindowLabel,
  incompleteContextMessage,
  readForecastResultContext,
  type SubjectDetailDeepLinkContext,
  type SubjectDetailDeepLinkParseResult,
  type SubjectDetailRequestOptions,
  type SubjectDetailTarget,
} from "../app/forecast/subject-detail-links";
import { PublicShell } from "./public-shell";
import { Badge, Card } from "./ui";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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
    }
  | {
      readonly status: "error";
      readonly message: string;
    };

type ForecastCalculateRequest = ForecastQueryInput & SubjectDetailRequestOptions;

export function SubjectDetailDeepLinkClient({
  target,
  parsed,
}: SubjectDetailDeepLinkClientProps) {
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
    parsed.kind === "ready" ? parsed.context : parsed.kind === "invalid" ? parsed.context : undefined;
  const cloudSeaFallbackQuery =
    target === "cloud_sea" && parsed.kind === "ready" ? parsed.fallbackQuery : null;

  useEffect(() => {
    let cancelled = false;

    async function loadSubjectResult() {
      if (parsed.kind !== "ready") {
        return;
      }

      const cached = readForecastResultContext(parsed.context.resultId ?? parsed.context.reportId);
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
        const requestBody: ForecastCalculateRequest = {
          ...parsed.fallbackQuery,
          ...parsed.requestOptions,
        };
        const tokens = getStoredAdminTokens();
        const response = await fetch(`${apiBaseUrl}/forecast/calculate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response));
        }

        const result = (await response.json()) as ForecastCalculationResult;
        if (!cancelled) {
          setState({
            status: "ready",
            query: parsed.fallbackQuery,
            result,
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
      {context ? <GeneralSourceContextBar context={context} query={queryForContext(state)} /> : null}

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
              页面会优先复用综合判断结果；如果本地上下文不可用，将使用链接中的地点和日期重新生成专项判断。
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
  result,
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
  const viewModel = useMemo(
    () => buildForecastResultViewModel(result, target),
    [result, target],
  );

  if (target === "cloud_sea" && viewModel.cloudSea) {
    return (
      <CloudSeaResultPage
        query={subjectQuery}
        result={result}
        viewModel={viewModel.cloudSea}
        returnUrl={context?.source === "general" ? (context.returnUrl ?? "/") : undefined}
      />
    );
  }

  if (target === "glow" && viewModel.glow) {
    return <GlowResultPage query={subjectQuery} result={result} viewModel={viewModel.glow} />;
  }

  if (target === "astro" && viewModel.astro) {
    return <AstroResultPage query={subjectQuery} result={result} viewModel={viewModel.astro} />;
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
}: {
  readonly context: Partial<SubjectDetailDeepLinkContext>;
  readonly query?: ForecastQueryInput;
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
            <span className="text-muted-foreground">范围：{forecastHorizonLabels[query.horizon]}</span>
          ) : null}
        </div>
        <a
          href={returnUrl}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-card-foreground transition hover:border-primary hover:bg-secondary"
        >
          返回综合判断
        </a>
      </div>
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

async function readApiErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "专项判断暂时不可用，请返回综合判断或重新选择地点后再试。";
  }

  try {
    const payload = JSON.parse(text) as {
      readonly messageZh?: string;
      readonly message?: string;
      readonly error?: string;
    };
    return (
      payload.messageZh ||
      payload.message ||
      payload.error ||
      "专项判断暂时不可用，请返回综合判断或重新选择地点后再试。"
    );
  } catch {
    return "专项判断暂时不可用，请返回综合判断或重新选择地点后再试。";
  }
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
