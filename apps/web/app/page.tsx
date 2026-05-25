import { HomepageWorkbench } from "../components/homepage-workbench";
import { PublicShell } from "../components/public-shell";
import { Badge, Card } from "../components/ui";

const sceneCapabilities = [
  {
    label: "云海机会",
    description:
      "把低云高度、湿度、风速、能见度和山谷地形放在同一判断里，区分云海机会与大面积遮挡风险。",
    meta: "低云 / 湿度 / 地形",
  },
  {
    label: "朝霞晚霞",
    description: "关注高云、中云、太阳高度角和通透度，拆出日出日落前后的可执行拍摄窗口。",
    meta: "高云 / 光线 / 透明度",
  },
  {
    label: "星空银河窗口",
    description: "结合月相、天文暮光、云量和机位朝向，判断夜景与银河拍摄是否值得等待。",
    meta: "月相 / 暮光 / 云量",
  },
  {
    label: "山地通透度",
    description: "结合能见度、风、湿度和地形遮挡，判断山地层次、远景清晰度与雨后通透机会。",
    meta: "能见度 / 湿度 / 风",
  },
  {
    label: "拍摄窗口",
    description: "按未来24小时、48小时、72小时或7天收敛关键时间段，辅助安排到达、等待和备选题材。",
    meta: "窗口 / 到达 / 备选",
  },
  {
    label: "出行风险",
    description: "把降水、强风、低温、能见度和交通不确定性放在一起，辅助判断是否出发和备选方案。",
    meta: "降水 / 强风 / 交通",
  },
] as const;

const departureFocus = [
  {
    step: "01",
    title: "什么时候到达",
    text: "找出日出、日落、云海、银河等关键窗口。",
  },
  {
    step: "02",
    title: "值不值得出发",
    text: "综合云层、能见度、风、湿度和降水风险。",
  },
  {
    step: "03",
    title: "优先拍什么",
    text: "判断云海、霞光、星空银河和通透度的优先级。",
  },
  {
    step: "04",
    title: "需要注意什么",
    text: "提示温差、风、降水、路况和备选方案。",
  },
] as const;

export default function HomePage() {
  return (
    <PublicShell contentClassName="pb-10">
      <section className="grid gap-5">
        <div className="border-b border-border pb-5">
          <div className="max-w-3xl">
            <Badge variant="default">风光摄影出行判断工具</Badge>
            <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px] lg:text-[40px]">
              逐光天气
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
              输入拍摄地点，快速判断是否值得出发、最佳到达时间、优先题材和主要风险。
            </p>
          </div>
        </div>

        <HomepageWorkbench />
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">常见题材判断</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            围绕常见风光题材，把天气窗口、地形条件和风险提示收敛成可执行判断。
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sceneCapabilities.map((feature) => (
            <Card key={feature.label} className="grid gap-3 p-4">
              <Badge variant="muted" className="w-fit">
                {feature.meta}
              </Badge>
              <h3 className="text-lg font-bold text-card-foreground">{feature.label}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8 border-t border-border pt-6">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">出发前重点</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              把复杂预报收敛成几个关键问题。
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {departureFocus.map((item) => (
            <div key={item.step} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-sm font-bold text-primary">{item.step}</p>
              <h3 className="mt-2 text-base font-bold text-card-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
