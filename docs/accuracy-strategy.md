# 准确性策略

逐光天气的准确性来自确定性数据、可解释算法、持续校准和透明展示，不来自 AI 直接“猜测”结果。

## 基本原则

- 不依赖 AI 生成确定性事实。
- 确定性事实来自天气、天文、地形、光污染和机位数据源。
- AI 只解释和组织已经计算出的事实、评分、风险和建议。
- 所有关键结论都应能追溯到字段、provider、计算版本和缺失状态。
- 缺失字段、估算字段和 provider 冲突必须进入置信度计算。

## 准确性能力

- 多源比较：同一地点和窗口可以比较 QWeather、Open-Meteo、本地地形和历史校准结果。
- Provider conflict detection：关键字段差异过大时标记冲突，而不是直接平均。
- Confidence scoring：按数据完整度、字段新鲜度、provider 一致性、地形可信度和历史校准给出置信度。
- Missing field tracking：记录低云/中云/高云、能见度、露点、月亮高度、光污染、地形遮挡等缺失项。
- User feedback loop：允许用户反馈是否出片、云海是否成立、银河是否可见、白墙是否发生。
- Historical backtesting later：用历史天气、天文和用户反馈验证评分阈值。
- Spot-specific calibration：针对黄山、老君山、武功山等热门机位逐步建立局地校准。
- Data source transparency in UI：结果页必须展示天气、天文、地形、光污染和 AI 解释的来源状态。

## Cloud sea accuracy strategy

云海判断不能只看“多云”或“湿度高”。应综合：

- 低云覆盖、低云高度和云底高度。
- 相对湿度、露点差、前夜降水、近地层水汽。
- 风速、阵风和风向。
- 能见度和雾风险。
- 机位海拔、谷地海拔、高差和山谷地形。
- 日出前后时间窗口。

准确性提升路径：

- 初期使用规则评分和 mock terrain。
- 接入真实天气后优先补足低云、能见度、露点和风字段。
- 接入 DEM 后按机位和周边谷地计算云海地形潜力。
- 通过用户反馈区分“云海成立”和“白墙糊住”两类结果。
- 对热门机位建立 spot-specific 阈值。

## Glow accuracy strategy

朝霞晚霞判断不能只看日出日落时间。应综合：

- 日出/日落太阳高度和方位。
- 民用、航海晨昏光窗口。
- 总云量和低/中/高云结构。
- 西侧或东侧云层开口条件。
- 降水概率、湿度、能见度和气溶胶影响。
- 地形对太阳方向的遮挡。

准确性提升路径：

- 用本地天文计算确定窗口。
- 用云层分层和降水/能见度判断霞光机会。
- 用地形遮挡降低被山体挡住的窗口权重。
- 对 provider 冲突较大的云层数据降低置信度。
- 通过历史回测调整霞光阈值。

## Astro/Milky Way accuracy strategy

星空和银河判断必须把天文、天气、月光、光污染和地形一起考虑。

关键输入：

- 天文黑夜窗口。
- 月相、月亮照明、月出月落、月亮高度。
- 无月夜时段。
- 银河窗口。
- 银心高度和方向。
- 总云量、低/中/高云、能见度、湿度。
- 光污染等级和城市方向光害。
- 银河方向地形遮挡。
- seeing/transparency 字段，如果可用。

准确性提升路径：

- 优先使用本地 deterministic astronomy。
- 后续可用 Skyfield/Astropy service 和缓存星历提升天文精度。
- 光污染使用本地缓存数据，不按请求调用昂贵 API。
- 页面只显示卫星夜光参考风险、银河方向光害和公开保守波特尔范围；没有校准测量前不展示 SQM、国标等级、官方等级或单点实测波特尔级。
- 星空/银河评分需要明确区分“天文上可见”和“天气上可拍”。
- 对月光、云量或光污染缺失的结果降低置信度。

Milky Way light-pollution scoring and display:

- 光污染只复用 astro-service/API 已返回的本地 VIIRS 夜光结果，不新增 provider，不发起外部服务请求。
- 星空和银河适宜度会把环境光污染风险、银河方向光害和天气/天文条件一起判断。低光污染可以提高暗空信心；高环境光污染或高银河方向光害会降低银河推荐，并提示避开城市方向构图或更换暗场机位。
- 光污染不能覆盖硬阻断。总云量、低云、降水、强月光或缺少天文黑夜/银河窗口时，最终推荐仍以“不建议专程”或“仅作备选”为准。
- 原始 VIIRS 波特尔估算只作为诊断保留；公开页面使用全局保守展示层。缺少足够校准证据、采样不足、低置信度、低端环境风险饱和或周边光穹与本地辐亮度不一致时，公开范围会放宽，尤其不能把未经校准的 `1-2级` 或低端不确定 `2-3级` 直接展示成极佳暗空。
- 低辐亮度区域可能被公开展示为 `2-4级` 或 `3-4级` 一类保守范围，这是为了避免把卫星低值误读成现场完美暗空。推荐文案只能说“光污染较低、具备银河拍摄基础、仍需结合云量/月光/通透度/现场杂光确认”，不能说顶级暗空或接近完美暗空。
- 估算波特尔只显示范围，是因为当前输入来自卫星夜光和环境风险指数，不是现场校准测量。Bortle 不是 SQM，也不是国标等级；没有独立校准前，不显示 SQM、国标等级、官方等级或单一实测波特尔级。

## National Sky Darkness Model V1

全国暗空模型 V1 把 VIIRS 兼容夜光栅格作为全国分布信号，而不是把某几个样例点或截图当成生产规则。它分为四层：

- 原始数据层：本地 `deploy/light-pollution/current/light-pollution.cog.tif` 和 `metadata.json`，只表达卫星夜光和采样质量。
- 全国统计层：用固定经纬网格对全国范围生成分位数、local/halo 比值、低辐亮度饱和和城市光穹外溢信号；运行产物放在 `deploy/calibration/runtime/`，默认不进 Git。
- 公开展示层：把原始 VIIRS/Bortle 估算转换为保守的“估算波特尔范围”，不显示 SQM、国标等级、官方等级或单点实测波特尔。
- QA benchmark 层：用独立参考样本检查 exact、overlap、adjacent、过乐观、过保守、均值/中位误差和 mismatch 列表；它只给出审计报告，不生成阈值、地点、坐标或类别生产规则。

30 张天文通截图只能作为 QA 回归参考，不能进入生产映射、阈值、地点名单、坐标规则或类别特判。真实生产路径必须是全国/全局分布模型加保守展示；未来如果接入现场 SQM 或人工观测，也应作为独立校准证据进入统计配置，而不是直接覆盖公开等级。

公开页面必须避免把弱证据的 `1-2级` 展示成“极低”“顶级暗空”“完美暗空”。只有在本地夜光、周边 halo、ambient risk、采样完整度、校准证据和低辐亮度饱和风险都共同支持时，才允许窄范围低等级展示；否则应扩大到 `2-4级（保守参考）` 或类似保守范围。专业诊断可以保留原始 VIIRS 估算、全国模型估算、分位数、local/halo 比值、模型版本和诊断原因。

星空/银河最终决策仍然必须同时结合天气、天文黑夜、月光、银河窗口、地形遮挡和现场可执行性。暗空只提高或降低置信度，不能覆盖云、雨、月光、缺少天文黑夜或地形遮挡等硬阻断。逐光天气相对只给截图等级的工具，优势应体现在“暗空 + 天气 + 天文 + 地形 + 行动建议”的综合判断，而不是宣称更精确的单点波特尔、SQM 或国家标准等级。

## Terrain accuracy strategy

地形是风光摄影判断的核心输入之一，尤其影响云海、日出日落和银河方向。

关键输入：

- 机位坐标和海拔。
- 周边谷地高程采样。
- 地平线剖面。
- 太阳/银心方向遮挡。
- 机位人工核验状态。

准确性提升路径：

- 初期使用本地机位元数据和 mock terrain。
- 后续接入 Open-Meteo Elevation、Copernicus DEM 或 SRTM。
- 规模化后优先使用本地缓存 DEM 和预计算剖面。
- 对热门机位做人工核验和遮挡标注。
- DEM 分辨率不足时显示地形置信度。

## Weather provider conflict strategy

不同 provider 对云量、降水和能见度可能差异较大。冲突处理应遵循：

- 不直接把冲突字段简单平均成单一事实。
- 对云量、能见度、降水、风速等关键字段设置冲突阈值。
- provider 差异超过阈值时标记“数据分歧”，降低对应评分置信度。
- 若某 provider 缺少摄影关键字段，不能把缺失当作 0 或理想条件。
- 结果页展示主要 provider、辅助 provider、更新时间和缺失字段。

## Cost vs accuracy strategy

准确性提升必须和 API 成本一起设计。

- 免费/open/local 数据足够准确时优先使用。
- 付费天气 API 用于提升中国地区覆盖、可靠性、预警和空气质量。
- Open-Meteo 可作为云层、能见度、露点和多模型辅助来源。
- 地形和光污染优先本地缓存，避免逐请求付费。
- AI 解释默认手动触发，不作为每次查询的必需步骤。
- 热门机位可预取和缓存，长尾地点按需查询。
- API 成本、缓存命中率和用户价值必须进入后台运营监控。

## World Atlas / modeled sky brightness V1

- WA/model sky brightness is an optional local raster layer under `deploy/sky-brightness/current/`; runtime requests never download raster data.
- The public dark-sky baseline prefers defensible WA/model estimated Bortle ranges when available. VIIRS remains current night-light evidence and can widen/lift the public range when local radiance, halo, or ambient risk conflicts with the model.
- `sqm`, `artificial_brightness_mcd_m2`, `ratio_to_natural`, and `bortle_class` have explicit conservative conversion rules. `radiance` and `unknown` stay raw-only diagnostics and must not fabricate SQM/Bortle output.
- Public UI must not display measured SQM, official Bortle observations, national-standard levels, official dark-sky certification, or single-point precision claims from modeled raster data.
- Benchmark screenshots and third-party ranges are audit-only references: `competitorBenchmark`, `thirdPartyReference`, `notGroundTruth`. They must not create location, coordinate, scenic-spot, or category-specific production rules.
- The competitive product claim should be the combined decision system: modeled dark-sky baseline + current light-source evidence + weather + Moon + Milky Way geometry + DEM/horizon + action advice.

## Historical Calibration V1

历史校准把预测结果、历史天气和真实观测标签连起来，用同一套 deterministic scoring rules 做历史回放，再统计命中率、误报率和漏报率。普通结果页只在样本量足够时显示保守提示，不展示 provider/debug 细节，也不让 AI 参与天气或评分计算。详细流程见 `docs/historical-calibration-v1.md`。
