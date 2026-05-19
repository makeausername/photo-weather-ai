import { PlaceSearchCard } from "../components/place-search-card";
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

const layerChips = ["云层", "风速", "湿度", "能见度", "月相", "地形", "银河"] as const;

const mapTimeline = [
  { time: "04:00", label: "云层偏厚", tone: "muted" },
  { time: "05:10", label: "日出窗口", tone: "best" },
  { time: "06:25", label: "云缝增强", tone: "good" },
  { time: "09:00", label: "风速上升", tone: "risk" },
] as const;

const decisionTimeline = [
  { time: "04:30", height: "h-5", tone: "bg-muted" },
  { time: "05:10", height: "h-10", tone: "bg-primary" },
  { time: "05:45", height: "h-12", tone: "bg-primary" },
  { time: "06:25", height: "h-8", tone: "bg-accent" },
  { time: "07:10", height: "h-5", tone: "bg-muted" },
] as const;

function ForecastMapWorkspace() {
  return (
    <section className="grid min-h-[560px] overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-bold text-primary">中心预报工作区</p>
          <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">
            黄山光明顶周边天气图层
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {layerChips.map((chip) => (
            <Badge key={chip} variant={chip === "云层" ? "default" : "muted"}>
              {chip}
            </Badge>
          ))}
        </div>
      </div>

      <div className="relative min-h-[390px] overflow-hidden bg-[#EFE8D8]">
        <div
          className="absolute inset-0 opacity-75"
          style={{
            backgroundImage:
              "linear-gradient(90deg, rgba(221,212,196,0.55) 1px, transparent 1px), linear-gradient(0deg, rgba(221,212,196,0.55) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="absolute -left-20 top-16 h-20 w-[58%] rotate-[-6deg] rounded-full bg-white/55 blur-sm" />
        <div className="absolute right-[-8%] top-28 h-16 w-[48%] rotate-[5deg] rounded-full bg-white/50 blur-sm" />
        <div className="absolute left-[18%] top-40 h-12 w-[52%] rotate-[-2deg] rounded-full bg-[#DDE5DD]/70 blur-sm" />

        <svg
          className="absolute inset-x-0 bottom-12 h-[280px] w-full"
          viewBox="0 0 900 300"
          role="img"
          aria-label="山地轮廓与等高线占位图"
          preserveAspectRatio="none"
        >
          <path
            d="M0 245L86 198L148 218L226 148L302 188L384 112L458 174L542 95L628 168L706 132L804 205L900 160V300H0V245Z"
            fill="#D7CFBE"
          />
          <path
            d="M0 268L112 222L210 238L315 178L420 218L552 146L670 202L760 178L900 230V300H0V268Z"
            fill="#A9C7B8"
            opacity="0.72"
          />
          <path
            d="M76 244C170 214 250 210 352 234C476 262 596 226 728 206C792 196 844 199 900 214"
            fill="none"
            stroke="#2F6F5E"
            strokeOpacity="0.5"
            strokeWidth="3"
          />
          <path
            d="M46 206C142 176 238 180 324 204C425 232 532 194 628 166C720 139 802 150 884 182"
            fill="none"
            stroke="#5F8D8A"
            strokeOpacity="0.48"
            strokeWidth="2"
          />
          <path
            d="M108 166C196 134 286 142 374 168C466 195 542 154 626 126C718 96 798 104 872 138"
            fill="none"
            stroke="#D88A20"
            strokeOpacity="0.44"
            strokeWidth="2"
          />
        </svg>

        <div className="absolute left-[52%] top-[39%] grid -translate-x-1/2 -translate-y-1/2 place-items-center">
          <span className="absolute h-14 w-14 rounded-full border border-primary/35 bg-primary/10" />
          <span className="relative h-4 w-4 rounded-full border-[5px] border-primary bg-card shadow-soft" />
          <span className="mt-3 rounded-md border border-border bg-card/92 px-2.5 py-1 text-xs font-bold text-card-foreground shadow-sm">
            黄山光明顶
          </span>
        </div>

        <div className="absolute left-4 top-4 grid gap-2 rounded-lg border border-border bg-card/88 p-3 shadow-sm backdrop-blur">
          <p className="text-xs font-bold text-card-foreground">图层状态</p>
          <div className="grid gap-1 text-xs leading-5 text-muted-foreground">
            <span>低云：海拔下方抬升</span>
            <span>风速：山顶阵风偏大</span>
            <span>能见度：清晨较好</span>
            <span>月相：示例月相层待切换</span>
            <span>银河：示例窗口待计算</span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
        <div className="grid gap-2 sm:grid-cols-4">
          {mapTimeline.map((item) => (
            <div key={item.time} className="rounded-lg border border-border bg-muted px-3 py-2">
              <div
                className={
                  item.tone === "best"
                    ? "mb-2 h-1.5 rounded-full bg-primary"
                    : item.tone === "good"
                      ? "mb-2 h-1.5 rounded-full bg-accent"
                      : item.tone === "risk"
                        ? "mb-2 h-1.5 rounded-full bg-danger"
                        : "mb-2 h-1.5 rounded-full bg-border"
                }
              />
              <p className="text-xs font-bold text-card-foreground">{item.time}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          默认演示图层；选择地点后将切换为该地区数据。
        </p>
      </div>
    </section>
  );
}

function DecisionSummaryPanel() {
  return (
    <Card className="grid content-start gap-4 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-primary">决策摘要</p>
          <h2 className="mt-1 text-xl font-bold leading-7 text-card-foreground">清晨出行判断</h2>
        </div>
        <Badge variant="warning">模拟展示</Badge>
      </div>

      <dl className="grid gap-3 text-sm">
        <div className="rounded-lg border border-border bg-muted p-3">
          <dt className="text-xs font-semibold text-muted-foreground">地点</dt>
          <dd className="mt-1 font-bold text-card-foreground">黄山光明顶</dd>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <dt className="text-xs font-semibold text-muted-foreground">综合指数</dt>
          <dd className="mt-1 flex items-end gap-1 text-primary">
            <span className="text-4xl font-bold leading-none">78</span>
            <span className="pb-1 text-sm font-semibold">/ 100</span>
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-muted p-3">
          <dt className="text-xs font-semibold text-muted-foreground">推荐</dt>
          <dd className="mt-1 font-bold text-card-foreground">可出发，关注云层变化</dd>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs font-semibold text-muted-foreground">最佳窗口</dt>
            <dd className="mt-1 font-bold text-card-foreground">05:10 - 06:25</dd>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <dt className="text-xs font-semibold text-muted-foreground">主要风险</dt>
            <dd className="mt-1 font-bold text-danger">山顶阵风偏大</dd>
          </div>
        </div>
      </dl>

      <div className="rounded-lg border border-border bg-muted p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-card-foreground">机会时间线</p>
          <span className="text-xs font-semibold text-muted-foreground">明日清晨</span>
        </div>
        <div className="mt-4 grid grid-cols-5 items-end gap-2">
          {decisionTimeline.map((item) => (
            <div key={item.time} className="grid gap-2 text-center">
              <div className={`${item.height} rounded-md ${item.tone}`} />
              <span className="text-[11px] text-muted-foreground">{item.time}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold leading-5 text-muted-foreground">
        模拟展示，不含真实预报
      </p>
    </Card>
  );
}

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
              <Badge variant="muted">本地模拟</Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              真实地图、天气图层和服务商调用仍是后续工作。
            </p>
          </div>
        </div>

        <div
          id="analysis"
          className="grid scroll-mt-24 gap-5 min-[900px]:grid-cols-[clamp(320px,34vw,390px)_minmax(0,1fr)] min-[1200px]:grid-cols-[clamp(360px,24vw,420px)_minmax(0,1fr)_clamp(360px,24vw,420px)] min-[1200px]:items-start"
        >
          <PlaceSearchCard className="min-[900px]:sticky min-[900px]:top-[88px]" />
          <div className="grid gap-5 min-[1200px]:contents">
            <ForecastMapWorkspace />
            <DecisionSummaryPanel />
          </div>
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-8">
        <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">场景能力</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">按拍摄目标组织天气判断</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            页面先保留产品信息架构和交互骨架，后续接入真实数据后再替换当前图层与示例判断。
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
            这些是本地示例资料，用于演示地点选择、机位资料和结果页面的联动。
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
            本地模拟计算
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
