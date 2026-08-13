import * as React from "react";
import type { ReactNode } from "react";
import type { ForecastTarget } from "@photo-weather/shared";
import { Badge, Card, cn } from "../../components/ui";

type BadgeVariant = NonNullable<Parameters<typeof Badge>[0]["variant"]>;

type ResultDashboardDataProps = {
  readonly dataCloudSeaSection?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaLoading?: string;
  readonly dataCloudSeaError?: string;
  readonly dataTestId?: string;
};

function dataProps({
  dataCloudSeaSection,
  dataCloudSeaPageMode,
  dataCloudSeaLoading,
  dataCloudSeaError,
  dataTestId,
}: ResultDashboardDataProps) {
  return {
    "data-cloud-sea-section": dataCloudSeaSection,
    "data-cloud-sea-page-mode": dataCloudSeaPageMode,
    "data-cloud-sea-loading": dataCloudSeaLoading,
    "data-cloud-sea-error": dataCloudSeaError,
    "data-testid": dataTestId,
  };
}

type ResultDashboardShellProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataTestId?: string;
};

export function ResultDashboardShell({
  target,
  children,
  className,
  dataCloudSeaSection,
  dataCloudSeaPageMode,
  dataTestId,
}: ResultDashboardShellProps) {
  return (
    <section
      className={cn(className, "mx-auto grid w-full max-w-[1560px] min-w-0 gap-5")}
      data-forecast-decision-page-shell="true"
      data-result-dashboard-shell="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection, dataCloudSeaPageMode, dataTestId })}
    >
      {children}
    </section>
  );
}

export function DecisionPageShell(props: ResultDashboardShellProps) {
  return <ResultDashboardShell {...props} />;
}

export function ForecastDecisionPageShell(props: ResultDashboardShellProps) {
  return <DecisionPageShell {...props} />;
}

type DecisionDetail = {
  readonly label: string;
  readonly value: string;
};

type DecisionContextCardProps = {
  readonly target: ForecastTarget;
  readonly titleLabel: string;
  readonly title: string;
  readonly details: readonly DecisionDetail[];
  readonly className?: string;
  readonly action?: ReactNode;
  readonly dataTestId?: string;
};

export function DecisionContextCard({
  target,
  titleLabel,
  title,
  details,
  className,
  action,
  dataTestId = "decision-context-card",
}: DecisionContextCardProps) {
  return (
    <Card
      className={cn(className, "grid min-w-0 max-w-full gap-4 p-4 shadow-sm")}
      data-decision-context-card="true"
      data-result-target={target}
      data-testid={dataTestId}
    >
      <div>
        <p className="text-xs font-bold text-primary">{titleLabel}</p>
        <h2 className="mt-2 break-words text-2xl font-bold leading-tight text-card-foreground">
          {title}
        </h2>
      </div>

      {details.length > 0 ? (
        <dl className="grid min-w-0 gap-3 text-sm">
          {details.map((detail) => (
            <DecisionDefinitionItem key={detail.label} label={detail.label} value={detail.value} />
          ))}
        </dl>
      ) : null}
      {action ? <div>{action}</div> : null}
    </Card>
  );
}

type DecisionLoadingCardProps = {
  readonly target: ForecastTarget;
  readonly badges?: readonly { readonly label: string; readonly variant: BadgeVariant }[];
  readonly title?: string;
  readonly message: string;
  readonly description?: string;
  readonly details?: readonly DecisionDetail[];
  readonly action?: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaLoading?: string;
};

export function DecisionLoadingCard({
  target,
  badges = [],
  title,
  message,
  description,
  details,
  action,
  className,
  dataCloudSeaPageMode,
  dataCloudSeaLoading,
}: DecisionLoadingCardProps) {
  return (
    <Card
      className={cn(className, "min-w-0 max-w-full p-5 shadow-sm")}
      data-decision-loading-card="true"
      data-forecast-loading-card="true"
      data-result-page-state-card="loading"
      data-result-target={target}
      {...dataProps({
        dataCloudSeaPageMode,
        dataCloudSeaLoading,
        dataTestId: "decision-loading-card",
      })}
    >
      {badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ) : null}
      {title ? (
        <h1 className="mt-3 text-2xl font-bold leading-tight text-card-foreground sm:text-[28px]">
          {title}
        </h1>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-3 text-sm font-semibold text-card-foreground",
          title || badges.length > 0 ? "mt-4" : "",
        )}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
        {message}
      </div>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {details && details.length > 0 ? (
        <dl className="mt-4 grid min-w-0 gap-2 rounded-lg border border-border bg-muted p-3 text-sm min-[720px]:grid-cols-2">
          {details.map((detail) => (
            <DecisionCompactDefinition
              key={detail.label}
              label={detail.label}
              value={detail.value}
            />
          ))}
        </dl>
      ) : null}
      <div
        className="mt-5 grid min-w-0 max-w-full gap-3"
        data-decision-loading-skeleton="true"
        aria-hidden="true"
      >
        <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-5/6 animate-pulse rounded-full bg-muted" />
        <div className="mt-1 grid min-w-0 gap-2 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      {action ? <div className="mt-4">{action}</div> : null}
    </Card>
  );
}

type DecisionInfoCardProps = {
  readonly target: ForecastTarget;
  readonly title: string;
  readonly description: string;
  readonly badge?: { readonly label: string; readonly variant: BadgeVariant };
  readonly details?: readonly DecisionDetail[];
  readonly className?: string;
  readonly dataTestId?: string;
};

export function DecisionInfoCard({
  target,
  title,
  description,
  badge,
  details,
  className,
  dataTestId = "decision-info-card",
}: DecisionInfoCardProps) {
  return (
    <Card
      className={cn(className, "min-w-0 max-w-full p-5 shadow-sm")}
      data-decision-info-card="true"
      data-result-target={target}
      data-testid={dataTestId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        {badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {details && details.length > 0 ? (
        <dl className="mt-4 grid min-w-0 gap-2 text-sm">
          {details.map((detail) => (
            <DecisionDefinitionItem key={detail.label} label={detail.label} value={detail.value} />
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

type DecisionErrorCardProps = {
  readonly target: ForecastTarget;
  readonly badges?: readonly { readonly label: string; readonly variant: BadgeVariant }[];
  readonly title?: string;
  readonly message: string;
  readonly description?: string;
  readonly details?: readonly DecisionDetail[];
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaError?: string;
};

export function DecisionErrorCard({
  target,
  badges = [],
  title,
  message,
  description,
  details,
  actions,
  className,
  dataCloudSeaPageMode,
  dataCloudSeaError,
}: DecisionErrorCardProps) {
  return (
    <Card
      className={cn(className, "min-w-0 max-w-full border-danger p-5 shadow-sm")}
      data-decision-error-card="true"
      data-forecast-error-card="true"
      data-result-page-state-card="error"
      data-result-target={target}
      {...dataProps({
        dataCloudSeaPageMode,
        dataCloudSeaError,
        dataTestId: "decision-error-card",
      })}
    >
      {badges.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ) : null}
      {title ? (
        <h1 className="mt-3 text-2xl font-bold leading-tight text-card-foreground sm:text-[28px]">
          {title}
        </h1>
      ) : null}
      <h2 className={cn("text-lg font-bold text-danger", title || badges.length > 0 ? "mt-4" : "")}>
        {message}
      </h2>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
      ) : null}
      {details && details.length > 0 ? (
        <dl className="mt-4 grid min-w-0 gap-2 rounded-lg border border-border bg-muted p-3 text-sm min-[720px]:grid-cols-2">
          {details.map((detail) => (
            <DecisionCompactDefinition
              key={detail.label}
              label={detail.label}
              value={detail.value}
            />
          ))}
        </dl>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </Card>
  );
}

type DecisionContextTemplateProps = Omit<DecisionContextCardProps, "target">;
type DecisionLoadingTemplateCardProps = Omit<DecisionLoadingCardProps, "target">;
type DecisionInfoTemplateCardProps = Omit<DecisionInfoCardProps, "target">;
type DecisionErrorTemplateCardProps = Omit<DecisionErrorCardProps, "target">;

type DecisionLoadingTemplateProps = {
  readonly target: ForecastTarget;
  readonly context: DecisionContextTemplateProps;
  readonly loading: DecisionLoadingTemplateCardProps;
  readonly info: DecisionInfoTemplateCardProps;
  readonly className?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaLoading?: string;
};

export function DecisionLoadingTemplate({
  target,
  context,
  loading,
  info,
  className,
  dataCloudSeaPageMode,
  dataCloudSeaLoading,
}: DecisionLoadingTemplateProps) {
  return (
    <DecisionPageShell
      target={target}
      className={className}
      dataCloudSeaPageMode={dataCloudSeaPageMode}
    >
      <section
        className="grid min-w-0 gap-5 min-[900px]:grid-cols-[clamp(300px,32vw,360px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(320px,23vw,380px)_minmax(0,1fr)_clamp(320px,23vw,380px)] min-[1200px]:items-start"
        data-decision-loading-template="true"
        data-forecast-loading-state="true"
        data-result-page-state="loading"
        data-result-target={target}
        {...dataProps({
          dataCloudSeaPageMode,
          dataCloudSeaLoading,
          dataTestId: "decision-loading-template",
        })}
      >
        <div
          className="grid min-w-0 content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]"
          data-decision-context-region="true"
        >
          <DecisionContextCard {...context} target={target} />
        </div>
        <div className="grid min-w-0 gap-5 min-[1200px]:contents">
          <DecisionLoadingCard
            {...loading}
            target={target}
            dataCloudSeaPageMode={dataCloudSeaPageMode}
            dataCloudSeaLoading={dataCloudSeaLoading}
          />
          <DecisionInfoCard {...info} target={target} />
        </div>
      </section>
    </DecisionPageShell>
  );
}

type DecisionErrorTemplateProps = {
  readonly target: ForecastTarget;
  readonly context: DecisionContextTemplateProps;
  readonly error: DecisionErrorTemplateCardProps;
  readonly info?: DecisionInfoTemplateCardProps;
  readonly className?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaError?: string;
};

export function DecisionErrorTemplate({
  target,
  context,
  error,
  info,
  className,
  dataCloudSeaPageMode,
  dataCloudSeaError,
}: DecisionErrorTemplateProps) {
  return (
    <DecisionPageShell
      target={target}
      className={className}
      dataCloudSeaPageMode={dataCloudSeaPageMode}
    >
      <section
        className="grid min-w-0 gap-5 min-[900px]:grid-cols-[clamp(300px,32vw,360px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(320px,23vw,380px)_minmax(0,1fr)_clamp(320px,23vw,380px)] min-[1200px]:items-start"
        data-decision-error-template="true"
        data-forecast-error-state="true"
        data-result-page-state="error"
        data-result-target={target}
        {...dataProps({
          dataCloudSeaPageMode,
          dataCloudSeaError,
          dataTestId: "decision-error-template",
        })}
      >
        <div
          className="grid min-w-0 content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]"
          data-decision-context-region="true"
        >
          <DecisionContextCard {...context} target={target} />
        </div>
        <div className="grid min-w-0 gap-5 min-[1200px]:contents">
          <DecisionErrorCard
            {...error}
            target={target}
            dataCloudSeaPageMode={dataCloudSeaPageMode}
            dataCloudSeaError={dataCloudSeaError}
          />
          {info ? <DecisionInfoCard {...info} target={target} /> : null}
        </div>
      </section>
    </DecisionPageShell>
  );
}

export function DecisionResultTemplate({
  target,
  children,
  className,
  dataCloudSeaSection,
  dataCloudSeaPageMode,
}: ResultDashboardShellProps) {
  return (
    <DecisionPageShell
      target={target}
      className={className}
      dataCloudSeaSection={dataCloudSeaSection}
      dataCloudSeaPageMode={dataCloudSeaPageMode}
      dataTestId="decision-result-template"
    >
      {children}
    </DecisionPageShell>
  );
}

function DecisionDefinitionItem({ label, value }: DecisionDetail) {
  return (
    <div className="rounded-lg border border-border bg-muted p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-bold text-card-foreground">{value}</dd>
    </div>
  );
}

function DecisionCompactDefinition({ label, value }: DecisionDetail) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-card-foreground">{value}</dd>
    </div>
  );
}

type ResultHeaderRowProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
};

export function ResultHeaderRow({
  target,
  children,
  className,
  dataCloudSeaSection,
}: ResultHeaderRowProps) {
  return (
    <header
      className={cn(
        className,
        "grid min-w-0 max-w-full gap-4 min-[880px]:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] min-[880px]:items-stretch",
      )}
      data-forecast-result-header="true"
      data-result-header-row="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection })}
    >
      {children}
    </header>
  );
}

export function ForecastResultHeader(props: ResultHeaderRowProps) {
  return <ResultHeaderRow {...props} />;
}

type ResultHeaderSummaryCardProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
};

export function ResultHeaderSummaryCard({
  target,
  children,
  className,
  dataCloudSeaSection,
}: ResultHeaderSummaryCardProps) {
  return (
    <Card
      className={cn(className, "h-full min-w-0 max-w-full p-5 shadow-sm")}
      data-forecast-result-summary-card="true"
      data-result-header-summary-card="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection })}
    >
      {children}
    </Card>
  );
}

export function ForecastResultSummaryCard(props: ResultHeaderSummaryCardProps) {
  return <ResultHeaderSummaryCard {...props} />;
}

type ResultScoreCardProps = {
  readonly target: ForecastTarget;
  readonly label: string;
  readonly score: number;
  readonly badgeLabel: string;
  readonly badgeVariant: BadgeVariant;
  readonly summary: string;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
  readonly dataTestId?: string;
};

export function ResultScoreCard({
  target,
  label,
  score,
  badgeLabel,
  badgeVariant,
  summary,
  className,
  dataCloudSeaSection,
  dataTestId = "decision-score-card",
}: ResultScoreCardProps) {
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;

  return (
    <Card
      className={cn(className, "grid h-full min-w-0 max-w-full content-between gap-4 p-5 shadow-sm")}
      data-forecast-score-card="true"
      data-result-score-card="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection, dataTestId })}
    >
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-bold leading-none text-primary">{safeScore}</span>
          <span className="pb-1 text-sm font-semibold text-muted-foreground">/ 100</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              safeScore >= 80
                ? "bg-primary"
                : safeScore >= 60
                  ? "bg-accent-strong"
                  : safeScore >= 40
                    ? "bg-muted-foreground"
                    : "bg-danger",
            )}
            style={{ width: `${safeScore}%` }}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
        <p className="text-sm font-semibold leading-6 text-card-foreground">{summary}</p>
      </div>
    </Card>
  );
}

export function ForecastScoreCard(props: ResultScoreCardProps) {
  return <ResultScoreCard {...props} />;
}

type ResultMetricGridProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
  readonly dataTestId?: string;
};

export function ResultMetricGrid({
  target,
  children,
  className,
  dataCloudSeaSection,
  dataTestId,
}: ResultMetricGridProps) {
  return (
    <section
      className={cn(
        className,
        "grid min-w-0 max-w-full items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3",
      )}
      data-forecast-metric-grid="true"
      data-result-metric-grid="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection, dataTestId })}
    >
      {children}
    </section>
  );
}

export function ForecastMetricGrid(props: ResultMetricGridProps) {
  return <ResultMetricGrid {...props} />;
}

type ResultMetricCardProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaMetricCard?: boolean;
};

export function ResultMetricCard({
  target,
  children,
  className,
  dataCloudSeaMetricCard,
}: ResultMetricCardProps) {
  return (
    <div
      className={cn(className, "h-full min-w-0 max-w-full")}
      data-forecast-metric-card="true"
      data-result-metric-card="true"
      data-result-target={target}
      data-cloud-sea-metric-card={dataCloudSeaMetricCard ? "true" : undefined}
    >
      {children}
    </div>
  );
}

export function ForecastMetricCard(props: ResultMetricCardProps) {
  return <ResultMetricCard {...props} />;
}

type DailyDecisionSectionProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
  readonly dataTestId?: string;
};

export function DailyDecisionSection({
  target,
  children,
  className,
  dataCloudSeaSection,
  dataTestId,
}: DailyDecisionSectionProps) {
  return (
    <section
      className={cn(className, "grid min-w-0 max-w-full gap-3")}
      data-forecast-daily-decision-list="true"
      data-result-daily-section="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection, dataTestId })}
    >
      {children}
    </section>
  );
}

export function DailyDecisionList(props: DailyDecisionSectionProps) {
  return <DailyDecisionSection {...props} />;
}

type CurrentWeatherSectionProps = {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaSection?: string;
  readonly dataTestId?: string;
};

export function CurrentWeatherSection({
  target,
  children,
  className,
  dataCloudSeaSection,
  dataTestId,
}: CurrentWeatherSectionProps) {
  return (
    <section
      className={cn(className, "grid min-w-0 max-w-full gap-3")}
      data-forecast-current-weather-cards="true"
      data-result-current-weather-section="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection, dataTestId })}
    >
      {children}
    </section>
  );
}

export function CurrentWeatherCards(props: CurrentWeatherSectionProps) {
  return <CurrentWeatherSection {...props} />;
}

export function JudgmentBasisGrid({
  target,
  children,
  className,
}: {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(className, "grid min-w-0 max-w-full gap-3")}
      data-result-judgment-basis-grid="true"
      data-result-target={target}
    >
      {children}
    </div>
  );
}

export function ActionPlanGrid({
  target,
  children,
  className,
}: {
  readonly target: ForecastTarget;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(className, "grid min-w-0 max-w-full gap-3")}
      data-result-action-plan-grid="true"
      data-result-target={target}
    >
      {children}
    </div>
  );
}
