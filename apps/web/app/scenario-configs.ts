import type { ScenarioPageConfig } from "../components/scenario-module-page";

export const cloudSeaScenarioConfig = {
  title: "云海判断",
  subtitle: "结合湿度、低云、风速、海拔高差、能见度和光线窗口，区分云海形成、可拍机会与白墙风险。",
  target: "cloud_sea",
  defaultHorizon: "48h",
  ctaLabel: "查看云海拍摄判断",
  focusTitle: "云海拍摄决策",
  focusDescription:
    "云海判断优先看水汽是否足够、低云是否处在合适高度、山谷高差是否能形成观测优势，以及风速是否会快速打散云雾。",
  focusItems: [
    "湿度与露点差用于判断水汽基础。",
    "低云量、湿度和能见度用于区分云海形成与白墙遮挡风险。",
    "海拔高差和山谷方向帮助判断是否有云雾沉降空间。",
    "清晨窗口通常优先于午后窗口，需要提前到达机位。",
  ],
  featurePoints: [
    "云海形成机会",
    "云海可拍机会",
    "白墙风险",
    "最佳云海窗口",
    "雨后开口信号",
    "山谷高差参考",
  ],
  infoTitle: "现场复核提示",
  infoItems: [
    "低云过厚且湿度过高时，山顶可能直接被云雾包裹。",
    "高云海形成信号不等于高可拍机会，仍需看光线、能见度和降水是否打断窗口。",
    "风速偏大时云雾层容易被打散，窗口可能很短。",
    "部分地形或云层数据仍需结合临近预报复核。",
  ],
  learningTitle: "云海判断需要关注什么",
  learningDescription:
    "选择地点后，系统会结合水汽、低云、地形、风速、光线窗口和降水时段判断云海形成、可拍机会与白墙风险。",
  learningBadgeLabel: "判断参考",
  learningItems: [
    {
      title: "水汽是否足够",
      tag: "核心指标",
      description:
        "湿度、露点差和降水前后决定云雾能不能形成。湿度高、露点差小，更容易出现低云或雾气。",
    },
    {
      title: "低云是否在合适高度",
      tag: "白墙判断",
      description:
        "云在脚下是云海，云在身上是白墙，云在头上多半只是阴天。低云高度与机位海拔的关系很关键。",
    },
    {
      title: "机位是否高于云层",
      tag: "地形优势",
      description:
        "高山、山脊和观景台更容易看到云海；低海拔地点更多表现为晨雾、低云或通透变化。",
    },
    {
      title: "风速是否合适",
      tag: "层次变化",
      description:
        "风太小容易闷成白墙，风太大云雾容易被吹散。适中风速更利于云雾流动和层次变化。",
    },
    {
      title: "是否有光线窗口",
      tag: "出片窗口",
      description:
        "清晨日出前后最值得守。夜间云海形成不等于能出片，是否有光线和开口同样重要。",
    },
    {
      title: "是否存在雨后开口",
      tag: "雨后开口",
      description:
        "降水刚结束后可能出现短暂云雾层次；但拍摄窗口正在下雨时，通透、器材和出片稳定性都会下降。",
    },
  ],
} satisfies ScenarioPageConfig;

export const glowScenarioConfig = {
  title: "朝霞晚霞",
  subtitle: "围绕日出日落、晨昏时间、云层高度、能见度与地形遮挡，辅助判断朝霞和晚霞机会。",
  target: "glow",
  defaultHorizon: "72h",
  ctaLabel: "查看朝霞晚霞判断",
  focusTitle: "朝霞晚霞判断重点",
  focusDescription:
    "霞光判断重点在日出日落前后窗口、中高云是否能承载色彩、低云是否遮挡太阳附近光线，以及机位方向是否受地形遮挡。",
  focusItems: [
    "日出前后优先关注东方低角度光线和中高云层。",
    "日落前后优先关注西向云缝、透明度和低云遮挡。",
    "能见度和降水概率会影响霞光颜色、远山层次和拍摄稳定性。",
    "地形遮挡角会改变实际可见日出日落时间。",
  ],
  featurePoints: [
    "朝霞机会",
    "晚霞机会",
    "日出日落时间",
    "中高云条件",
    "低云遮挡风险",
    "地形遮挡参考",
  ],
  infoTitle: "日出日落窗口说明",
  infoItems: [
    "朝霞通常关注日出前约一小时到日出后一段时间。",
    "晚霞通常关注日落前后云层层次和西向通透度。",
    "天文时间基于地点经纬度本地计算，天气条件当前使用演示数据辅助判断。",
  ],
  learningTitle: "朝霞晚霞判断需要看什么",
  learningDescription:
    "霞光不是只看云量。先确认日出日落和晨昏窗口，再看中高云、低云遮挡、通透度、降水和地形是否支持出片。",
  learningBadgeLabel: "晨昏窗口",
  learningItems: [
    {
      title: "日出日落时间",
      tag: "时间窗口",
      description: "先确定太阳升落和晨昏阶段，避免错过主色彩时段。",
    },
    {
      title: "中高云条件",
      tag: "色彩载体",
      description: "适量中高云更容易承载霞光色彩，完全晴空反而可能偏淡。",
    },
    {
      title: "低云遮挡风险",
      tag: "遮挡判断",
      description: "低云过厚会压住太阳方向，可能只剩白光或无明显霞光。",
    },
    {
      title: "能见度与通透度",
      tag: "出片质量",
      description: "通透度影响色彩、远山层次和画面稳定性。",
    },
    {
      title: "地形遮挡",
      tag: "地平线",
      description: "山体、峡谷和建筑会改变实际可见日出日落时间。",
    },
    {
      title: "风与降水",
      tag: "现场风险",
      description: "降水和云层移动会影响窗口可执行性，需要临近复核。",
    },
  ],
} satisfies ScenarioPageConfig;

export const astroScenarioConfig = {
  title: "星空银河",
  subtitle:
    "结合天文黑夜、月相月照、月出月落、银河窗口、云量和能见度，辅助判断星空与银河拍摄机会。",
  target: "astro",
  defaultHorizon: "7d",
  ctaLabel: "查看星空银河判断",
  focusTitle: "星空银河判断重点",
  focusDescription:
    "星空银河判断会把天文黑夜、月光影响、银河窗口、云量和能见度放在一起看，避免只看天气图标或只看月相造成误判。",
  focusItems: [
    "天文黑夜决定暗夜窗口的基础长度。",
    "月相、月亮照明和月出月落决定月光干扰强度。",
    "银河窗口会结合银心高度、方向和月光影响给出初步参考。",
    "云量、湿度和能见度仍会决定最终是否值得等待。",
  ],
  featurePoints: ["星空指数", "银河窗口", "月光影响", "天文黑夜", "月出月落", "能见度与云量风险"],
  infoTitle: "月相与银河窗口说明",
  infoItems: [
    "新月前后通常更适合暗弱星空和银河细节。",
    "月亮在地平线以上且照明较强时，银河对比度会明显下降。",
    "银河窗口为本地算法初步估算，仍需结合云量、光污染和地形遮挡。",
  ],
  learningTitle: "星空银河判断需要看什么",
  learningBadgeLabel: "星空要素",
  learningItems: [
    {
      title: "天文黑夜",
      description: "只有太阳低于地平线足够角度后，天空背景才适合深空和银河拍摄。",
    },
    {
      title: "月相与月光",
      description: "月亮照明和月亮高度会显著影响银河对比度。",
    },
    {
      title: "无月黑夜",
      description: "月落后或月亮低影响时段通常更适合银河和深空。",
    },
    {
      title: "银河窗口",
      description: "需要银河核心位于地平线上方，并结合方向和高度判断。",
    },
    {
      title: "云量与能见度",
      description: "总云量、低云、中高云和能见度会直接影响观星条件。",
    },
    {
      title: "光污染与地形",
      description: "光污染、山体遮挡和地平线方向会影响实际可见度。",
    },
  ],
  dataNotice: "当前为体验模式，天气与地形结果会使用演示数据；天文时间基于本地天文计算。",
} satisfies ScenarioPageConfig;

export const scenarioPageConfigs = [
  cloudSeaScenarioConfig,
  glowScenarioConfig,
  astroScenarioConfig,
] as const;
