import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { forecastHorizonLabels, forecastTargetLabels } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import { PublicShell } from "./public-shell";
import { Badge, Card, cn } from "./ui";

type PopularScenarioSpot = {
  readonly name: string;
  readonly province: string;
  readonly reason: string;
  readonly tag: string;
};

export type ScenarioPageConfig = {
  readonly title: string;
  readonly subtitle: string;
  readonly target: ForecastTarget;
  readonly defaultHorizon: ForecastHorizon;
  readonly ctaLabel: string;
  readonly focusTitle: string;
  readonly focusDescription: string;
  readonly focusItems: readonly string[];
  readonly featurePoints: readonly string[];
  readonly infoTitle: string;
  readonly infoItems: readonly string[];
  readonly popularTitle: string;
  readonly popularSpots: readonly PopularScenarioSpot[];
};

export const scenarioDataNotice =
  "当前为体验模式，结果使用演示天气数据生成。";

export function ScenarioModulePage({ config }: { readonly config: ScenarioPageConfig }) {
  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 min-[900px]:flex-row min-[900px]:items-end">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            {config.title}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
            {config.subtitle}
          </p>
        </div>
        <div className="grid gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm min-[900px]:min-w-[300px]">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-card-foreground">页面预设</span>
            <Badge variant="accent">{forecastTargetLabels[config.target]}</Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            默认预报范围：{forecastHorizonLabels[config.defaultHorizon]}
          </p>
        </div>
      </header>

      <section className="grid gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)_clamp(320px,22vw,380px)] min-[1200px]:items-start">
        <ScenarioSearchPanel config={config} />

        <div className="grid gap-5">
          <ScenarioInfoCard
            title={config.focusTitle}
            description={config.focusDescription}
            items={config.focusItems}
            tone="primary"
          />
          <ScenarioFeatureGrid title={`${config.title}核心指标`} items={config.featurePoints} />
          <section className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-primary">机位参考</p>
                <h2 className="mt-1 text-xl font-bold text-foreground">{config.popularTitle}</h2>
              </div>
              <Badge variant="warning">机位参考</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {config.popularSpots.map((spot) => (
                <Card key={spot.name} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-card-foreground">{spot.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{spot.province}</p>
                    </div>
                    <Badge variant="muted">{spot.tag}</Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{spot.reason}</p>
                </Card>
              ))}
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-4 min-[1200px]:sticky min-[1200px]:top-[88px]">
          <ScenarioInfoCard
            title={config.infoTitle}
            description="结果页会把该题材相关窗口和风险前置展示，便于快速判断是否值得等待。"
            items={config.infoItems}
            tone="accent"
          />
          <Card className="border-warning p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">数据提醒</Badge>
              <p className="text-sm font-bold text-card-foreground">当前为体验模式</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{scenarioDataNotice}</p>
          </Card>
        </aside>
      </section>
    </PublicShell>
  );
}

export function ScenarioSearchPanel({ config }: { readonly config: ScenarioPageConfig }) {
  return (
    <aside className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
      <PlaceSearchCard
        title="地点搜索与机位选择"
        description="选择景区、城市或具体机位后进入对应题材判断。"
        badgeLabel="题材预设"
        defaultHorizon={config.defaultHorizon}
        fixedTarget={config.target}
        ctaLabel={config.ctaLabel}
      />
    </aside>
  );
}

export function ScenarioFeatureGrid({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  return (
    <section className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-primary">判断指标</p>
        <h2 className="mt-1 text-xl font-bold text-foreground">{title}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <div key={item} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <span className="text-xs font-bold text-primary">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="mt-2 text-sm font-bold text-card-foreground">{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScenarioInfoCard({
  title,
  description,
  items,
  tone = "primary",
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
  readonly tone?: "primary" | "accent";
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-card-foreground">{title}</h2>
        <Badge variant={tone === "accent" ? "accent" : "muted"}>
          {tone === "accent" ? "窗口说明" : "判断重点"}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
      <ul className="mt-4 grid gap-2">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "rounded-lg border border-border bg-muted px-3 py-2 text-sm leading-6 text-muted-foreground",
              tone === "accent" && "bg-card",
            )}
          >
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}
