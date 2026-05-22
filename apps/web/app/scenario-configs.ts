import type { ScenarioPageConfig } from "../components/scenario-module-page";

export const cloudSeaScenarioConfig = {
  title: "云海判断",
  subtitle: "结合湿度、低云、风速、海拔高差与能见度，辅助判断云海机会和白墙风险。",
  target: "cloud_sea",
  defaultHorizon: "48h",
  ctaLabel: "查看云海拍摄判断",
  focusTitle: "云海判断重点",
  focusDescription:
    "云海判断优先看水汽是否足够、低云是否处在合适高度、山谷高差是否能形成观测优势，以及风速是否会快速打散云雾。",
  focusItems: [
    "湿度与露点差用于判断水汽基础。",
    "低云量和低云位置用于区分云海机会与遮挡风险。",
    "海拔高差和山谷方向帮助判断是否有云雾沉降空间。",
    "清晨窗口通常优先于午后窗口，需要提前到达机位。",
  ],
  featurePoints: ["云海概率", "白墙风险", "最佳观测窗口", "山谷高差参考", "风速与湿度影响"],
  infoTitle: "白墙风险说明",
  infoItems: [
    "低云过厚且湿度过高时，山顶可能直接被云雾包裹。",
    "风速偏大时云雾层容易被打散，窗口可能很短。",
    "当前为体验模式，结果使用演示天气数据生成；正式数据源启用后再用于出行前复核。",
  ],
  popularTitle: "热门云海机位",
  popularSpots: [
    {
      name: "黄山光明顶",
      province: "安徽",
      reason: "高海拔观景平台，适合观察雨后转晴、山谷云雾抬升和日出云海。",
      tag: "高山云海",
    },
    {
      name: "老君山金顶",
      province: "河南",
      reason: "山体高差明显，冬季和雨后常见低云、雾凇与金顶建筑层次。",
      tag: "山巅建筑",
    },
    {
      name: "三清山女神峰",
      province: "江西",
      reason: "峰林地形适合观察云雾穿行，但需要关注低云遮挡和能见度变化。",
      tag: "峰林云雾",
    },
    {
      name: "武功山金顶",
      province: "江西",
      reason: "草甸山脊与山谷高差明显，清晨云雾窗口和风速变化都需要重点观察。",
      tag: "草甸云海",
    },
  ],
} satisfies ScenarioPageConfig;

export const glowScenarioConfig = {
  title: "朝霞晚霞",
  subtitle:
    "围绕日出日落、晨昏时间、云层高度、能见度与地形遮挡，辅助判断朝霞和晚霞机会。",
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
  popularTitle: "热门朝霞晚霞机位",
  popularSpots: [
    {
      name: "黄山光明顶",
      province: "安徽",
      reason: "适合观察东向日出、云海边缘霞光和远山层次。",
      tag: "日出云霞",
    },
    {
      name: "三清山女神峰",
      province: "江西",
      reason: "峰林轮廓适合作为霞光前景，但低云遮挡需要提前判断。",
      tag: "峰林霞光",
    },
    {
      name: "老君山金顶",
      province: "河南",
      reason: "建筑轮廓与高山日出日落结合度高，适合观察云缝光线。",
      tag: "金顶光影",
    },
    {
      name: "武功山金顶",
      province: "江西",
      reason: "草甸山脊视野开阔，日落方向与云层变化适合作为重点判断。",
      tag: "山脊晚霞",
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
  popularTitle: "热门星空银河机位",
  popularSpots: [
    {
      name: "武功山金顶",
      province: "江西",
      reason: "高山草甸视野开阔，适合星空、帐篷前景和银河方向规划。",
      tag: "草甸星空",
    },
    {
      name: "老君山金顶",
      province: "河南",
      reason: "高海拔建筑前景辨识度高，适合判断月光与云量对夜景的影响。",
      tag: "高山夜景",
    },
    {
      name: "黄山光明顶",
      province: "安徽",
      reason: "山顶视野和前景层次丰富，但需要重点关注云量、湿度和景区通行。",
      tag: "山岳星空",
    },
    {
      name: "三清山女神峰",
      province: "江西",
      reason: "峰林前景有辨识度，适合在透明度较好、月光较弱时规划夜景。",
      tag: "峰林夜色",
    },
  ],
} satisfies ScenarioPageConfig;

export const scenarioPageConfigs = [
  cloudSeaScenarioConfig,
  glowScenarioConfig,
  astroScenarioConfig,
] as const;
