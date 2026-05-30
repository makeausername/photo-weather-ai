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
      className={cn(className, "mx-auto grid w-full max-w-[1560px] gap-5")}
      data-forecast-decision-page-shell="true"
      data-result-dashboard-shell="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection, dataCloudSeaPageMode, dataTestId })}
    >
      {children}
    </section>
  );
}

export function ForecastDecisionPageShell(props: ResultDashboardShellProps) {
  return <ResultDashboardShell {...props} />;
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
        "grid gap-4 min-[880px]:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] min-[880px]:items-stretch",
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
      className={cn(className, "h-full p-5 shadow-sm")}
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
}: ResultScoreCardProps) {
  const safeScore = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 0;

  return (
    <Card
      className={cn(className, "grid h-full content-between gap-4 p-5 shadow-sm")}
      data-forecast-score-card="true"
      data-result-score-card="true"
      data-result-target={target}
      {...dataProps({ dataCloudSeaSection })}
    >
      <div>
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-bold leading-none text-primary">{safeScore}</span>
          <span className="pb-1 text-sm font-semibold text-muted-foreground">/ 100</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${safeScore}%` }} />
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
      className={cn(className, "grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3")}
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
      className={cn(className, "h-full")}
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
      className={cn(className, "grid gap-3")}
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
      className={cn(className, "grid gap-3")}
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
      className={cn(className, "grid gap-3")}
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
      className={cn(className, "grid gap-3")}
      data-result-action-plan-grid="true"
      data-result-target={target}
    >
      {children}
    </div>
  );
}

type ResultPageLoadingStateProps = {
  readonly target: ForecastTarget;
  readonly badges: readonly { readonly label: string; readonly variant: BadgeVariant }[];
  readonly title: string;
  readonly message: string;
  readonly description?: string;
  readonly details?: readonly { readonly label: string; readonly value: string }[];
  readonly action?: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaLoading?: string;
};

export function ResultPageLoadingState({
  target,
  badges,
  title,
  message,
  description,
  details,
  action,
  className,
  dataCloudSeaPageMode,
  dataCloudSeaLoading,
}: ResultPageLoadingStateProps) {
  return (
    <section
      className={cn(className, "grid w-full min-w-0 gap-5")}
      data-forecast-loading-state="true"
      data-result-page-state="loading"
      data-result-target={target}
      {...dataProps({ dataCloudSeaPageMode, dataCloudSeaLoading })}
    >
      <Card
        className="p-5 shadow-sm"
        data-forecast-loading-card="true"
        data-result-page-state-card="loading"
      >
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight text-card-foreground sm:text-[28px]">
          {title}
        </h1>
        <div className="mt-4 flex items-center gap-3 text-sm font-semibold text-card-foreground">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          {message}
        </div>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
        {details && details.length > 0 ? (
          <dl className="mt-4 grid gap-2 rounded-lg border border-border bg-muted p-3 text-sm min-[720px]:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt className="text-xs font-semibold text-muted-foreground">{detail.label}</dt>
                <dd className="mt-1 break-words font-semibold text-card-foreground">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </Card>
    </section>
  );
}

export function ForecastLoadingState(props: ResultPageLoadingStateProps) {
  return <ResultPageLoadingState {...props} />;
}

type ResultPageErrorStateProps = {
  readonly target: ForecastTarget;
  readonly badges: readonly { readonly label: string; readonly variant: BadgeVariant }[];
  readonly title: string;
  readonly message: string;
  readonly description?: string;
  readonly details?: readonly { readonly label: string; readonly value: string }[];
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly dataCloudSeaPageMode?: string;
  readonly dataCloudSeaError?: string;
};

export function ResultPageErrorState({
  target,
  badges,
  title,
  message,
  description,
  details,
  actions,
  className,
  dataCloudSeaPageMode,
  dataCloudSeaError,
}: ResultPageErrorStateProps) {
  return (
    <section
      className={cn(className, "grid w-full min-w-0 gap-5")}
      data-forecast-error-state="true"
      data-result-page-state="error"
      data-result-target={target}
      {...dataProps({ dataCloudSeaPageMode, dataCloudSeaError })}
    >
      <Card
        className="border-danger p-5 shadow-sm"
        data-forecast-error-card="true"
        data-result-page-state-card="error"
      >
        <div className="flex flex-wrap items-center gap-2">
          {badges.map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
        <h1 className="mt-3 text-2xl font-bold leading-tight text-card-foreground sm:text-[28px]">
          {title}
        </h1>
        <h2 className="mt-4 text-lg font-bold text-danger">{message}</h2>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
        {details && details.length > 0 ? (
          <dl className="mt-4 grid gap-2 rounded-lg border border-border bg-muted p-3 text-sm min-[720px]:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label}>
                <dt className="text-xs font-semibold text-muted-foreground">{detail.label}</dt>
                <dd className="mt-1 break-words font-semibold text-card-foreground">
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
      </Card>
    </section>
  );
}

export function ForecastErrorState(props: ResultPageErrorStateProps) {
  return <ResultPageErrorState {...props} />;
}
