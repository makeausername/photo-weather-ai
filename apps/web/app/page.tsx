import { Badge, Button, Card, Input } from "../components/ui";

const quickLocations = ["黄山光明顶", "老君山金顶", "三清山女神峰", "武功山金顶"] as const;

const features = [
  {
    title: "云海与白墙风险",
    description: "关注低云高度、湿度、风速与能见度，提示云海机会与白墙遮挡风险。",
  },
  {
    title: "朝霞晚霞机会",
    description: "结合云量层次、太阳高度角与地形遮挡，判断日出日落窗口。",
  },
  {
    title: "星空银河窗口",
    description: "参考月相、天文暮光、透明度与机位朝向，辅助夜景出发决策。",
  },
  {
    title: "机位地形辅助",
    description: "围绕海拔、方位、通行和安全备注，沉淀适合摄影师的地点资料。",
  },
] as const;

const previewItems = [
  { label: "综合出片指数", value: "78 / 100", tone: "text-emerald-300" },
  { label: "推荐等级", value: "可出发，需关注云层变化", tone: "text-sky-200" },
  { label: "最佳拍摄窗口", value: "05:10-06:25 朝霞；19:00-20:05 晚霞", tone: "text-amber-200" },
  { label: "主要风险", value: "山顶阵风偏大，低云可能抬升形成白墙", tone: "text-rose-200" },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-gradient-to-b from-slate-950 via-[#081827] to-[#101827] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <nav className="flex items-center justify-between border-b border-white/10 pb-5">
          <a href="/" className="text-base font-bold text-white sm:text-lg">
            风光天气 AI
          </a>
          <a
            href="/admin"
            className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
          >
            管理后台
          </a>
        </nav>

        <div className="grid flex-1 content-center gap-10 py-12 sm:py-16 lg:py-20">
          <div className="max-w-4xl">
            <Badge className="border-white/15 bg-white/10 text-sky-100">风光摄影出发判断</Badge>
            <h1 className="mt-6 max-w-5xl text-4xl font-bold leading-tight tracking-normal text-white sm:text-5xl lg:text-6xl">
              输入目的地，判断是否值得出发拍摄
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
              综合云层、湿度、风速、海拔、地形、月相与银河窗口，辅助判断朝霞、晚霞、云海、星空和银河拍摄机会。
            </p>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-2xl backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
            <Input
              aria-label="目的地"
              placeholder="请输入景区、城市或机位，例如：黄山光明顶"
              className="h-12 border-white/10 bg-white text-slate-950 placeholder:text-slate-400"
            />
            <Button size="lg" className="h-12 bg-sky-500 px-8 hover:bg-sky-400">
              开始分析
            </Button>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              {quickLocations.map((location) => (
                <button
                  key={location}
                  type="button"
                  className="rounded-full border border-white/12 bg-white/[0.07] px-3 py-1.5 text-sm text-slate-200 transition hover:bg-white/12"
                >
                  {location}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => (
              <Card
                key={feature.title}
                className="border-white/10 bg-white/[0.06] p-5 text-white shadow-none backdrop-blur"
              >
                <h2 className="text-base font-bold">{feature.title}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">{feature.description}</p>
              </Card>
            ))}
          </div>

          <section className="grid gap-5 rounded-2xl border border-white/10 bg-slate-950/45 p-5 shadow-2xl sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-400">示例决策卡</p>
                <h2 className="mt-1 text-2xl font-bold text-white">黄山光明顶 · 明日清晨</h2>
              </div>
              <Badge className="w-fit border-emerald-300/30 bg-emerald-400/10 text-emerald-200">
                静态预览
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {previewItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-white/[0.05] p-4"
                >
                  <p className="text-sm text-slate-400">{item.label}</p>
                  <p className={`mt-2 text-lg font-bold leading-7 ${item.tone}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
