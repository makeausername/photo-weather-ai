import type { ForecastHorizon, ForecastTarget } from "@photo-weather/shared";
import { forecastHorizonLabels } from "@photo-weather/shared";
import { PlaceSearchCard } from "./place-search-card";
import { PublicShell } from "./public-shell";
import type { SelectedLocation } from "./selected-location";
import { SubjectControlPanel } from "./subject-control-panel";
import { Badge, Card, cn } from "./ui";

type PopularScenarioSpot = {
  readonly name: string;
  readonly province: string;
  readonly reason: string;
  readonly tag: string;
};

type ScenarioLearningItem = {
  readonly title: string;
  readonly description: string;
  readonly tag?: string;
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
  readonly popularTitle?: string;
  readonly popularSpots?: readonly PopularScenarioSpot[];
  readonly learningTitle?: string;
  readonly learningDescription?: string;
  readonly learningBadgeLabel?: string;
  readonly learningItems?: readonly ScenarioLearningItem[];
};

function isSubjectScenarioEntryTarget(target: ForecastTarget): boolean {
  return target === "cloud_sea" || target === "glow" || target === "astro";
}

function subjectSearchDescription(target: ForecastTarget): string | undefined {
  if (target === "glow") {
    return "搜索景区、城市或具体机位，选择预报范围后进入朝霞晚霞专项判断。";
  }

  if (target === "astro") {
    return "搜索景区、城市或具体机位，选择预报范围后进入星空银河专项判断。";
  }

  return undefined;
}

function subjectCurrentLocationPrivacyHint(target: ForecastTarget): string {
  if (target === "glow") {
    return "浏览器定位仅用于本次朝霞晚霞判断，不会公开显示。";
  }

  if (target === "astro") {
    return "浏览器定位仅用于本次星空银河判断，不会公开显示。";
  }

  return "浏览器定位仅用于本次云海判断，不会公开显示。";
}

export function ScenarioModulePage({ config }: { readonly config: ScenarioPageConfig }) {
  if (isSubjectScenarioEntryTarget(config.target)) {
    return <SubjectScenarioEntryPage config={config} />;
  }

  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            {config.title}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
            {config.subtitle}
          </p>
        </div>
      </header>

      <section className="grid gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)_clamp(320px,22vw,380px)] min-[1200px]:items-start">
        {config.learningItems ? (
          <ScenarioLearningPageContent config={config} />
        ) : (
          <ScenarioStandardPageContent config={config} />
        )}
      </section>
    </PublicShell>
  );
}

function SubjectScenarioEntryPage({ config }: { readonly config: ScenarioPageConfig }) {
  const pageMode = "search";
  const isCloudSea = config.target === "cloud_sea";

  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            {config.title}
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
            {config.subtitle}
          </p>
        </div>
      </header>

      <section
        className="grid gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(340px,24vw,410px)_minmax(0,1fr)] min-[1200px]:items-start"
        data-cloud-sea-page-mode={isCloudSea ? pageMode : undefined}
        data-subject-scenario-page-mode={pageMode}
        data-subject-scenario-target={config.target}
      >
        {pageMode === "search" ? <ScenarioSearchPanel config={config} /> : null}
        <SubjectKnowledgeGuide config={config} />
      </section>
    </PublicShell>
  );
}

function SubjectKnowledgeGuide({ config }: { readonly config: ScenarioPageConfig }) {
  const items = config.learningItems ?? [];
  const isCloudSea = config.target === "cloud_sea";

  return (
    <section
      className="grid min-w-0 gap-4"
      data-cloud-sea-pre-result={isCloudSea ? "knowledge-guide" : undefined}
      data-subject-knowledge-guide={config.target}
    >
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{config.learningBadgeLabel ?? "判断参考"}</Badge>
          <Badge variant="muted">{forecastHorizonLabels[config.defaultHorizon]}</Badge>
        </div>
        <h2 className="mt-3 text-xl font-bold leading-tight text-card-foreground">
          {config.learningTitle ?? "云海判断需要关注什么"}
        </h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px] sm:leading-7">
          {config.learningDescription ??
            "选择地点后，系统会结合时间窗口、云层、通透度、降水和地形遮挡，给出是否值得出发的判断。"}
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item, index) => (
          <article
            key={item.title}
            className="grid min-w-0 content-start gap-3 overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm"
            data-cloud-sea-knowledge-card={isCloudSea ? "true" : undefined}
            data-subject-knowledge-card={config.target}
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                  index % 2 === 0
                    ? "border-primary bg-secondary text-primary"
                    : "border-accent bg-card text-accent",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              {item.tag ? (
                <Badge variant={index % 2 === 0 ? "muted" : "accent"}>{item.tag}</Badge>
              ) : null}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold leading-6 text-card-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScenarioStandardPageContent({ config }: { readonly config: ScenarioPageConfig }) {
  return (
    <>
      <ScenarioSearchPanel config={config} />

      <div className="grid gap-5">
        <ScenarioInfoCard
          title={config.focusTitle}
          description={config.focusDescription}
          items={config.focusItems}
          tone="primary"
        />
        <ScenarioFeatureGrid title={`${config.title}核心指标`} items={config.featurePoints} />
        <ScenarioPopularSpotGrid title={config.popularTitle} spots={config.popularSpots} />
      </div>

      <ScenarioSupportRail config={config} />
    </>
  );
}

function ScenarioLearningPageContent({ config }: { readonly config: ScenarioPageConfig }) {
  if (!config.learningItems) {
    return null;
  }

  return (
    <>
      <ScenarioSearchPanel config={config} />

      <div className="grid gap-5 min-[1200px]:col-span-2">
        <div className="grid gap-5 min-[1200px]:grid-cols-[minmax(0,1fr)_clamp(300px,28vw,360px)] min-[1200px]:items-start">
          <div className="grid gap-5">
            <ScenarioInfoCard
              title={config.focusTitle}
              description={config.focusDescription}
              items={config.focusItems}
              tone="primary"
            />
            <ScenarioFeatureGrid title={`${config.title}核心指标`} items={config.featurePoints} />
          </div>

          <ScenarioSupportRail config={config} />
        </div>

        <ScenarioLearningGrid
          title={config.learningTitle ?? "判断需要看什么"}
          badgeLabel={config.learningBadgeLabel ?? "云海要素"}
          items={config.learningItems}
        />
      </div>
    </>
  );
}

function ScenarioSupportRail({ config }: { readonly config: ScenarioPageConfig }) {
  return (
    <aside className="grid content-start gap-4 min-[1200px]:sticky min-[1200px]:top-[88px]">
      <ScenarioInfoCard
        title={config.infoTitle}
        description="结果页会把该题材相关窗口和风险前置展示，便于快速判断是否值得等待。"
        items={config.infoItems}
        tone="accent"
      />
    </aside>
  );
}

function ScenarioPopularSpotGrid({
  title,
  spots,
}: {
  readonly title?: string;
  readonly spots?: readonly PopularScenarioSpot[];
}) {
  if (!title || !spots || spots.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">机位参考</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">{title}</h2>
        </div>
        <Badge variant="warning">机位参考</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {spots.map((spot) => (
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
  );
}

function ScenarioLearningGrid({
  title,
  badgeLabel,
  items,
}: {
  readonly title: string;
  readonly badgeLabel: string;
  readonly items: readonly ScenarioLearningItem[];
}) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary">判断方法</p>
          <h2 className="mt-1 text-xl font-bold text-foreground">{title}</h2>
        </div>
        <Badge variant="muted">{badgeLabel}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item, index) => (
          <Card key={item.title} className="grid gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-base font-bold text-card-foreground">{item.title}</h3>
              {item.tag ? <Badge variant="muted">{item.tag}</Badge> : null}
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function ScenarioSearchPanel({
  config,
  selectedLocation,
  onSelectedLocationChange,
  onForecastOptionsChange,
}: {
  readonly config: ScenarioPageConfig;
  readonly selectedLocation?: SelectedLocation | null;
  readonly onSelectedLocationChange?: (location: SelectedLocation | null) => void;
  readonly onForecastOptionsChange?: (options: {
    readonly horizon: ForecastHorizon;
    readonly target: ForecastTarget;
  }) => void;
}) {
  const isSubjectControlPanel = isSubjectScenarioEntryTarget(config.target);

  if (isSubjectControlPanel) {
    return (
      <SubjectControlPanel
        config={{
          target: config.target,
          defaultHorizon: config.defaultHorizon,
          ctaLabel: config.ctaLabel,
          description: subjectSearchDescription(config.target),
          currentLocationPrivacyHint: subjectCurrentLocationPrivacyHint(config.target),
        }}
        selectedLocation={selectedLocation}
        onSelectedLocationChange={onSelectedLocationChange}
        onForecastOptionsChange={onForecastOptionsChange}
      />
    );
  }

  return (
    <aside className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
      <PlaceSearchCard
        title="地点搜索与机位选择"
        description="选择景区、城市或具体机位后进入对应题材判断。"
        badgeLabel={null}
        defaultHorizon={config.defaultHorizon}
        fixedTarget={config.target}
        ctaLabel={config.ctaLabel}
        selectedLocation={selectedLocation}
        onSelectedLocationChange={onSelectedLocationChange}
        onForecastOptionsChange={onForecastOptionsChange}
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
