import { PlaceSearchCard } from "../components/place-search-card";
import { PublicHeader } from "../components/public-header";
import { Badge, Card } from "../components/ui";

const features = [
  {
    mark: "云",
    title: "云海与白墙风险",
    description: "关注低云高度、湿度、风速与能见度，提示云海机会与遮挡风险。",
  },
  {
    mark: "霞",
    title: "朝霞晚霞机会",
    description: "结合云量层次、太阳高度角与地形遮挡，判断日出日落窗口。",
  },
  {
    mark: "星",
    title: "星空银河窗口",
    description: "参考月相、天文暮光、透明度与机位朝向，辅助夜景出发决策。",
  },
  {
    mark: "位",
    title: "机位地形辅助",
    description: "围绕海拔、方位、通行和安全备注，沉淀适合摄影师的地点资料。",
  },
] as const;

const previewItems = [
  { label: "综合出片指数", value: "78 / 100", tone: "text-success" },
  { label: "推荐判断", value: "可出发，关注云层变化", tone: "text-primary" },
  { label: "最佳窗口", value: "05:10-06:25 朝霞", tone: "text-warning" },
  { label: "主要风险", value: "山顶阵风偏大", tone: "text-danger" },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicHeader />

      <section className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.04fr)_minmax(400px,0.96fr)] lg:items-start xl:gap-14">
          <section className="min-w-0 lg:pt-3">
            <Badge>风光摄影出行判断工具</Badge>
            <h1 className="mt-5 max-w-[680px] text-[32px] font-bold leading-[1.1] tracking-normal text-foreground sm:text-[38px] lg:text-[43px] xl:text-[46px]">
              输入目的地，判断是否值得出发拍摄
            </h1>
            <p className="mt-4 max-w-[650px] text-base leading-7 text-muted-foreground sm:text-[17px] sm:leading-8">
              综合云层、湿度、风速、海拔、地形、月相与银河窗口，辅助判断朝霞、晚霞、云海、星空和银河拍摄机会。
            </p>

            <div id="analysis" className="scroll-mt-24">
              <PlaceSearchCard />
            </div>
          </section>

          <Card className="relative overflow-hidden p-5 shadow-soft lg:mt-2 lg:max-w-[520px] lg:justify-self-end">
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-sky-100 via-emerald-50 to-amber-50 opacity-90 dark:from-sky-900/30 dark:via-emerald-900/20 dark:to-amber-900/20" />
            <div className="relative grid gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-muted-foreground">静态示例决策卡</p>
                  <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground sm:text-2xl">
                    黄山光明顶 · 明日清晨
                  </h2>
                </div>
                <Badge variant="success">建议关注</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {previewItems.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-card p-3.5">
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <p className={`mt-2 text-lg font-bold leading-7 ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-secondary p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-secondary-foreground">机会窗口</span>
                  <span className="text-xs text-muted-foreground">模拟展示，不含真实预报</span>
                </div>
                <div className="mt-4 grid grid-cols-6 gap-2">
                  {["04:30", "05:00", "05:30", "06:00", "06:30", "07:00"].map((time, index) => (
                    <div key={time} className="grid gap-2 text-center">
                      <div
                        className={`h-12 rounded-lg border ${
                          index >= 1 && index <= 3
                            ? "border-primary bg-primary"
                            : "border-border bg-card"
                        }`}
                      />
                      <span className="text-xs text-muted-foreground">{time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <section className="grid gap-4 py-6 sm:py-8 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="p-4 shadow-sm">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-xs font-bold text-secondary-foreground">
                {feature.mark}
              </span>
              <h2 className="mt-3 text-base font-bold text-card-foreground">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </section>
      </section>
    </main>
  );
}
