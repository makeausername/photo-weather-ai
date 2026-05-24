import { HomepageWorkbench } from "../components/homepage-workbench";
import { PublicShell } from "../components/public-shell";
import { Badge, Card } from "../components/ui";

const sceneCapabilities = [
  {
    label: "云海与白墙风险",
    description:
      "把低云高度、湿度、风速、能见度和山谷地形放在同一判断里，区分云海机会与大面积遮挡风险。",
    meta: "低云 / 湿度 / 地形",
  },
  {
    label: "朝霞晚霞机会",
    description: "关注高云、中云、太阳高度角和通透度，拆出日出日落前后的可执行拍摄窗口。",
    meta: "高云 / 光线 / 透明度",
  },
  {
    label: "星空银河窗口",
    description: "结合月相、天文暮光、云量和机位朝向，判断夜景与银河拍摄是否值得等待。",
    meta: "月相 / 暮光 / 云量",
  },
  {
    label: "机位地形辅助",
    description: "沉淀海拔、朝向、通行与安全备注，让天气判断落到具体拍摄位置和到达条件。",
    meta: "坐标 / 海拔 / 通行",
  },
] as const;

const popularSpots = [
  { name: "黄山光明顶", province: "安徽", focus: "云海、日出、雪后层次", tag: "山岳日出" },
  { name: "老君山金顶", province: "河南", focus: "金顶日出、冬季雾凇", tag: "高山建筑" },
  { name: "三清山女神峰", province: "江西", focus: "峰林云雾、霞光窗口", tag: "峰林云雾" },
  { name: "武功山金顶", province: "江西", focus: "高山草甸、星空银河", tag: "草甸星空" },
] as const;

const workflow = [
  { step: "01", title: "选地点", text: "输入景区、城市或机位，先确认坐标、海拔和资料来源。" },
  { step: "02", title: "选时间", text: "按未来24小时、48小时、72小时或7天切换判断范围。" },
  { step: "03", title: "看判断", text: "查看综合指数、最佳窗口、关键依据和主要风险。" },
  { step: "04", title: "决定是否出发", text: "把天气、地形、窗口和风险整理成一次出行决策。" },
] as const;

export default function HomePage() {
  return (
    <PublicShell contentClassName="pb-14">
      <section className="grid gap-5">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 min-[900px]:flex-row min-[900px]:items-end">
          <div className="max-w-3xl">
            <Badge variant="default">风光摄影出行判断工具</Badge>
            <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px] lg:text-[40px]">
              逐光天气
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
              面向风光摄影的地点判断工作台，把搜索、图层预览、时间窗口和风险摘要放在同一屏，帮助出发前更快判断是否值得等待。
            </p>
          </div>
          <div className="grid gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-sm sm:min-w-[320px]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-card-foreground">当前模式</span>
              <Badge variant="muted">体验模式</Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              搜索地点、选择时间并查看判断；正式数据源配置后将显示实时结果。
            </p>
          </div>
        </div>

        <HomepageWorkbench />
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">场景能力</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">按拍摄目标组织天气判断</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            从拍摄目标出发，把天气窗口、地形条件和风险提示组织成可执行的出行判断。
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

      <section className="mt-12 grid gap-5 border-t border-border pt-8 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <p className="text-sm font-semibold text-primary">热门机位</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground">从常用地点开始判断</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            常用机位资料可帮助快速选择地点，并与拍摄天气分析联动。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:col-span-9 xl:grid-cols-4">
          {popularSpots.map((spot) => (
            <Card key={spot.name} className="grid gap-3 p-5">
              <div>
                <Badge variant="accent" className="w-fit">
                  {spot.tag}
                </Badge>
                <h3 className="mt-3 text-lg font-bold text-card-foreground">{spot.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{spot.province}</p>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{spot.focus}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">工作流</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">四步完成一次出发判断</h2>
          </div>
          <Badge variant="muted" className="w-fit">
            拍摄天气分析流程
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
