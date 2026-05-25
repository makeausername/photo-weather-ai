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

const workflow = [
  {
    step: "01",
    title: "机位与坐标",
    text: "确认景区、具体机位和海拔，避免用城市天气代替山顶条件。",
  },
  {
    step: "02",
    title: "时间窗口",
    text: "按题材查看未来24小时、48小时、72小时或7天的关键窗口。",
  },
  {
    step: "03",
    title: "题材机会",
    text: "分别评估云海、朝霞晚霞、星空银河和通透度条件。",
  },
  {
    step: "04",
    title: "风险与行动",
    text: "结合风、降水、能见度、温差和交通风险，决定是否出发与备选方案。",
  },
] as const;

export default function HomePage() {
  return (
    <PublicShell contentClassName="pb-10">
      <section className="grid gap-5">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 min-[900px]:flex-row min-[900px]:items-end">
          <div className="max-w-3xl">
            <Badge variant="default">风光摄影出行判断工具</Badge>
            <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px] lg:text-[40px]">
              逐光天气
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
              面向风光摄影的拍摄天气决策工具，整合地点、天气、云层、天文窗口和风险提示，帮助你判断是否值得出发、何时到达、优先拍什么。
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm sm:min-w-[320px]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-card-foreground">实时决策工作台</span>
              <Badge variant="muted">多源数据</Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              选择拍摄地点和预报范围后，系统将结合天气、云层、天文窗口和地形信息生成拍摄判断。
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              数据源未完全配置时，部分结果将以可用数据和明确提示为准。
            </p>
          </div>
        </div>

        <HomepageWorkbench />
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">场景能力</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">按拍摄目标组织天气判断</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            从拍摄目标出发，把天气窗口、地形条件和风险提示组织成可执行的出行判断。
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sceneCapabilities.map((feature) => (
            <Card key={feature.label} className="grid gap-3 p-5">
              <Badge variant="muted" className="w-fit">
                {feature.meta}
              </Badge>
              <h3 className="text-lg font-bold text-card-foreground">{feature.label}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10 border-t border-border pt-8">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">出发前看这几项</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              把复杂的天气和天文信息收敛成可执行判断。
            </p>
          </div>
          <Badge variant="muted" className="w-fit">
            出发前核对
          </Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflow.map((item) => (
            <div key={item.step} className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <p className="text-sm font-bold text-primary">{item.step}</p>
              <h3 className="mt-3 text-lg font-bold text-card-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
