import Link from "next/link";
import { Card } from "./ui";

const scenarioEntries = [
  {
    href: "/cloud-sea",
    index: "01",
    title: "云海",
    description: "结合水汽、低云高度、风速与光线窗口，判断云海形成机会与白墙风险。",
    tags: ["水汽判断", "低云高度", "光线窗口"],
  },
  {
    href: "/glow",
    index: "02",
    title: "朝霞晚霞",
    description: "围绕日出日落窗口、中高云条件与地形遮挡，辅助判断霞光机会。",
    tags: ["晨昏窗口", "中高云", "地形遮挡"],
  },
  {
    href: "/astro",
    index: "03",
    title: "星空银河",
    description: "结合天文黑夜、月相月照与银河窗口，判断星空拍摄机会。",
    tags: ["天文黑夜", "月光影响", "银河窗口"],
  },
];

const judgmentSteps = [
  {
    index: "01",
    title: "选择拍摄地点",
    description: "搜索景区、城市或具体机位，并选择预报范围。",
  },
  {
    index: "02",
    title: "查看窗口与风险",
    description: "系统结合多源天气数据，给出最佳窗口、优先题材与主要风险。",
  },
  {
    index: "03",
    title: "生成出发判断",
    description: "按光线、天气与风险整理可执行的拍摄建议，出发前快速复核。",
  },
];

const spotEntries = [
  { href: "/cloud-sea", name: "高山云海机位", note: "关注低云高度与山谷高差" },
  { href: "/glow", name: "日出朝霞机位", note: "关注晨昏窗口与东方低角度光线" },
  { href: "/glow", name: "日落晚霞机位", note: "关注西向云缝与地形遮挡" },
  { href: "/astro", name: "星空银河机位", note: "关注天文黑夜与月相影响" },
];

export function HomepageDiscoverySection() {
  return (
    <section className="grid min-w-0 max-w-full gap-6" data-homepage-discovery="true">
      <section className="grid min-w-0 max-w-full gap-3">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold tracking-normal text-foreground">专项拍摄场景</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            针对云海、朝霞晚霞、星空银河三个高频拍摄题材，提供独立的专业判断入口。
          </p>
        </div>
        <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarioEntries.map((entry) => (
            <Link key={entry.href} href={entry.href} className="group min-w-0">
              <Card className="grid h-full min-h-[168px] content-between gap-4 p-4 shadow-sm transition hover:border-primary hover:shadow-md">
                <div>
                  <p className="text-xs font-bold text-primary">{entry.index}</p>
                  <h3 className="mt-2 text-lg font-bold text-card-foreground">{entry.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.description}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-primary group-hover:underline">
                    查看判断
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 max-w-full gap-3" data-homepage-steps="true">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold tracking-normal text-foreground">三步得出判断</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            不需要研究复杂气象数据，按提示完成选择，即可得到可执行的拍摄判断。
          </p>
        </div>
        <ol className="grid min-w-0 max-w-full gap-3 sm:grid-cols-3">
          {judgmentSteps.map((step) => (
            <li key={step.index} className="min-w-0">
              <Card className="h-full p-4 shadow-sm">
                <p className="text-xs font-bold text-primary">{step.index}</p>
                <h3 className="mt-2 font-bold text-card-foreground">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid min-w-0 max-w-full gap-3" data-homepage-spots="true">
        <div className="max-w-3xl">
          <h2 className="text-xl font-bold tracking-normal text-foreground">值得一去的机位</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            根据拍摄题材选择对应的判断方向，出发前先确认窗口与风险。
          </p>
        </div>
        <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {spotEntries.map((spot) => (
            <Link key={spot.name} href={spot.href} className="group min-w-0">
              <Card className="grid h-full gap-2 p-4 shadow-sm transition hover:border-primary hover:shadow-md">
                <h3 className="text-base font-bold text-card-foreground">{spot.name}</h3>
                <p className="text-sm leading-5 text-muted-foreground">{spot.note}</p>
                <p className="mt-1 text-xs font-semibold text-primary group-hover:underline">
                  查看判断
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
