import type { Metadata } from "next";
import { PlaceSearchCard } from "../../components/place-search-card";
import { PublicShell } from "../../components/public-shell";
import { SubjectDetailDeepLinkClient } from "../../components/subject-detail-deep-link-client";
import { Badge, Card } from "../../components/ui";
import { parseSubjectDetailSearchParams } from "../forecast/subject-detail-links";

export const metadata: Metadata = {
  title: "朝霞晚霞 - 逐光天气",
};

const glowLearningCards = [
  {
    title: "日出日落时间",
    description: "霞光判断必须先确定太阳升落和晨昏窗口。",
  },
  {
    title: "中高云条件",
    description: "适量中高云更容易出现霞光色彩。",
  },
  {
    title: "低云遮挡风险",
    description: "低云过厚可能遮挡太阳方向，导致无霞或白光。",
  },
  {
    title: "能见度与通透度",
    description: "能见度影响色彩、远山层次和稳定性。",
  },
  {
    title: "地形遮挡",
    description: "山体、峡谷和建筑可能改变实际可见日出日落时间。",
  },
  {
    title: "风与降水",
    description: "风速、降水和云层移动会影响霞光持续时间。",
  },
] as const;

type GlowPageProps = {
  readonly searchParams?: Record<string, string | readonly string[] | undefined>;
};

export default function GlowPage({ searchParams }: GlowPageProps) {
  const parsed = parseSubjectDetailSearchParams("glow", searchParams ?? {});
  if (parsed.kind !== "empty") {
    return <SubjectDetailDeepLinkClient target="glow" parsed={parsed} />;
  }

  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">朝霞晚霞</Badge>
          <Badge variant="muted">风光摄影出行判断</Badge>
        </div>
        <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-normal text-foreground sm:text-[34px]">
          朝霞晚霞判断
        </h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
          面向日出日落前后的霞光窗口，重点判断朝霞是否可能、晚霞是否值得等、低云是否挡住太阳方向，以及通透度和地形是否支持出片。
        </p>
      </header>

      <section className="grid gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,410px)_minmax(0,1fr)] min-[1280px]:grid-cols-[clamp(340px,28vw,430px)_minmax(0,1fr)] min-[900px]:items-start">
        <div className="grid content-start gap-4 min-[900px]:sticky min-[900px]:top-[88px]">
          <PlaceSearchCard
            title="地点搜索与机位选择"
            description="搜索景区、城市或具体机位，选择预报范围后进入朝霞晚霞专项判断。"
            badgeLabel="朝霞晚霞"
            defaultHorizon="72h"
            fixedTarget="glow"
            ctaLabel="查看朝霞晚霞判断"
          />
          <Card className="border-warning p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">数据说明</Badge>
              <p className="text-sm font-bold text-card-foreground">当前为体验模式</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              当前为体验模式，结果会使用演示天气数据生成；正式天气数据源启用后将显示对应来源与更新时间。
            </p>
          </Card>
        </div>

        <main className="grid gap-5">
          <Card className="p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-primary">判断方法</p>
                <h2 className="mt-1 text-xl font-bold text-card-foreground">
                  朝霞晚霞判断需要看什么
                </h2>
              </div>
              <Badge variant="accent">晨昏窗口</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              霞光不是只看云量。日出日落时间决定窗口，中高云决定色彩载体，低云、降水、通透度和地形共同决定是否值得提前出门或继续等待。
            </p>
          </Card>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {glowLearningCards.map((item, index) => (
              <Card key={item.title} className="grid gap-2 p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-base font-bold text-card-foreground">{item.title}</h3>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </section>

          <Card className="p-5 shadow-sm">
            <div className="grid gap-3 text-sm leading-6 text-muted-foreground min-[760px]:grid-cols-3">
              <div>
                <p className="font-bold text-card-foreground">先看窗口</p>
                <p className="mt-1">确认民用晨光、日出、日落和民用昏影，避免错过主色彩阶段。</p>
              </div>
              <div>
                <p className="font-bold text-card-foreground">再看云层</p>
                <p className="mt-1">中高云负责承载颜色，低云负责决定太阳方向是否被挡住。</p>
              </div>
              <div>
                <p className="font-bold text-card-foreground">最后看出行</p>
                <p className="mt-1">结合能见度、降水、风和地形遮挡，决定早到、等待或转拍备选题材。</p>
              </div>
            </div>
          </Card>
        </main>
      </section>
    </PublicShell>
  );
}
