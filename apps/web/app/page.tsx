import { PlaceSearchCard } from "../components/place-search-card";
import { PublicShell } from "../components/public-shell";
import { Badge, Card } from "../components/ui";

const sceneCards = [
  {
    label: "云海与白墙风险",
    description: "结合低云高度、湿度、风速、能见度与山谷地形，快速判断云海机会和大面积遮挡风险。",
    meta: "山地 / 雨后 / 日出前后",
  },
  {
    label: "朝霞晚霞机会",
    description: "关注高云、中云、太阳高度角和通透度，把日出日落窗口拆成可执行的出发参考。",
    meta: "清晨 / 傍晚 / 城市天际线",
  },
  {
    label: "星空银河窗口",
    description: "把月相、天文暮光、云量、透明度与机位朝向放在同一判断里，减少夜景误判。",
    meta: "夜景 / 银河 / 高海拔",
  },
  {
    label: "机位地形辅助",
    description: "沉淀海拔、朝向、通行、安全和风险备注，让天气判断和实际拍摄位置连在一起。",
    meta: "坐标 / 海拔 / 通行",
  },
] as const;

const popularSpots = [
  { name: "黄山光明顶", province: "安徽", focus: "云海、日出、雪后层次" },
  { name: "老君山金顶", province: "河南", focus: "金顶日出、冬季雾凇" },
  { name: "三清山女神峰", province: "江西", focus: "峰林云雾、霞光窗口" },
  { name: "武功山金顶", province: "江西", focus: "高山草甸、星空银河" },
] as const;

const workflow = [
  { step: "01", title: "选择地点", text: "输入景区、城市或机位，优先匹配本地地点与摄影机位资料。" },
  { step: "02", title: "选择时间", text: "按未来24小时、48小时、72小时或7天切换拍摄判断范围。" },
  { step: "03", title: "查看判断", text: "查看综合指数、最佳窗口、关键依据与主要风险。" },
  { step: "04", title: "决定是否出发", text: "把天气、地形、时间窗口和风险放到同一张决策表里。" },
] as const;

const timeline = [
  { time: "04:30", level: "low" },
  { time: "05:10", level: "best" },
  { time: "05:45", level: "best" },
  { time: "06:20", level: "good" },
  { time: "07:00", level: "low" },
] as const;

function DecisionPreviewPanel() {
  return (
    <Card className="overflow-hidden shadow-soft">
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">黄山光明顶</p>
            <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">明日清晨拍摄判断</h2>
          </div>
          <Badge variant="accent">模拟展示</Badge>
        </div>

        <div className="grid gap-3 sm:grid-cols-[0.8fr_1fr]">
          <div className="rounded-lg border border-border bg-muted p-4">
            <p className="text-xs font-semibold text-muted-foreground">综合指数</p>
            <p className="mt-2 text-4xl font-bold leading-none text-primary">78</p>
            <p className="mt-2 text-xs text-muted-foreground">/ 100</p>
          </div>
          <div className="grid gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold text-muted-foreground">推荐</p>
              <p className="mt-1 text-sm font-bold text-card-foreground">可以出发，需关注山顶阵风</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold text-muted-foreground">最佳窗口</p>
              <p className="mt-1 text-sm font-bold text-card-foreground">05:10 - 06:25</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-card-foreground">机会时间线</p>
            <span className="text-xs font-medium text-danger">主要风险：阵风偏大</span>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {timeline.map((item) => (
              <div key={item.time} className="grid gap-2 text-center">
                <div
                  className={
                    item.level === "best"
                      ? "h-12 rounded-lg bg-primary"
                      : item.level === "good"
                        ? "h-12 rounded-lg bg-accent"
                        : "h-12 rounded-lg border border-border bg-card"
                  }
                />
                <span className="text-xs text-muted-foreground">{item.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-card-foreground">天气图层预览</p>
            <Badge variant="muted">GCJ-02 / WGS84</Badge>
          </div>
          <div className="relative h-44 overflow-hidden rounded-lg border border-border bg-[#EAF1ED]">
            <div className="absolute inset-x-6 top-8 h-px bg-border" />
            <div className="absolute inset-x-8 top-20 h-px bg-border" />
            <div className="absolute inset-x-10 top-32 h-px bg-border" />
            <div className="absolute bottom-8 left-8 right-8 h-10 rounded-[50%] border border-primary" />
            <div className="absolute bottom-11 left-16 right-16 h-7 rounded-[50%] border border-info" />
            <div className="absolute left-[48%] top-16 h-4 w-4 rounded-full border-4 border-primary bg-card shadow-soft" />
            <div className="absolute bottom-4 left-4 rounded-md bg-card/90 px-2 py-1 text-xs font-medium text-muted-foreground">
              山脊 / 云层 / 风向
            </div>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">模拟展示，不含真实预报。</p>
        </div>
      </div>
    </Card>
  );
}

export default function HomePage() {
  return (
    <PublicShell contentClassName="pb-14">
      <section className="grid gap-8 lg:grid-cols-12 lg:items-start xl:gap-12">
        <div className="min-w-0 lg:col-span-7">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-5 max-w-[780px] text-[30px] font-bold leading-[1.16] tracking-normal text-foreground sm:text-[36px] lg:text-[42px]">
            输入目的地，判断是否值得出发拍摄
          </h1>
          <p className="mt-4 max-w-[740px] text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            面向风光摄影的出行决策页面，把地点、预报范围、拍摄题材、机会窗口与风险提示放到同一视图里，帮助你更快做出是否出发的判断。
          </p>

          <div id="analysis" className="scroll-mt-24">
            <PlaceSearchCard />
          </div>
        </div>

        <div className="lg:col-span-5">
          <DecisionPreviewPanel />
        </div>
      </section>

      <section className="mt-10 border-t border-border pt-8 lg:mt-12 lg:pt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">场景判断</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-[28px]">
              用摄影题材组织天气信息
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            不只展示天气图标，而是把云层、光线、透明度、地形和拍摄目标整理成可执行的判断。
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {sceneCards.map((feature) => (
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

      <section className="mt-10 grid gap-5 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="text-sm font-semibold text-primary">热门机位</p>
          <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-[28px]">
            从常用地点开始判断
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            当前使用本地示例机位，真实生产前需要在后台人工核验坐标、海拔、通行和安全信息。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:col-span-8">
          {popularSpots.map((spot) => (
            <Card key={spot.name} className="grid gap-3 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-card-foreground">{spot.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{spot.province}</p>
                </div>
                <Badge variant="accent">示例机位</Badge>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{spot.focus}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">工作流</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground sm:text-[28px]">
              四步完成一次出发判断
            </h2>
          </div>
          <Badge variant="muted">本地模拟计算</Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workflow.map((item) => (
            <div key={item.step} className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm font-bold text-primary">{item.step}</p>
              <h3 className="mt-3 text-base font-bold text-card-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
