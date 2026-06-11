# Photo Weather AI

## Documentation

- [Product Scope](docs/product-scope.md)
- [Data Source Blueprint](docs/data-source-blueprint.md)
- [Accuracy Strategy](docs/accuracy-strategy.md)
- [Development Roadmap](docs/development-roadmap.md)
- [Cost Control](docs/provider-cost-control.md)
- [Admin Provider Configuration](docs/admin-providers.md)
- [Real Forecast Data Pipeline V1](docs/real-forecast-data-pipeline-v1.md)
- [Module Map](docs/module-map.md)
- [Production/Staging Deployment](docs/deployment.md)

## Production/Staging Deployment

For an Ubuntu/Debian server with a domain pointed at it, run:

```bash
bash scripts/install.sh
```

Mainland China servers should use the same installer through the China wrapper:

```bash
bash scripts/install-cn.sh
```

The China wrapper defaults to Ubuntu/Debian Docker packages, Docker registry mirrors, an APT mirror, and a pip index mirror, so a fresh server does not need manual Docker installation first.

The installer creates `.env.production`, renders the Caddy config, installs Docker if needed, creates optional local light-pollution raster directories, starts PostgreSQL/Redis/astro-service, downloads and verifies `/app/data/de421.bsp`, runs migrations and seed data, creates the first admin account, starts web/API/worker/Caddy, and enables automatic HTTPS through Caddy. See [docs/deployment.md](docs/deployment.md) for update, backup, status, local light-pollution import, uninstall, and troubleshooting commands.

Optional light-pollution data uses a local VIIRS-compatible nighttime-light GeoTIFF under `deploy/light-pollution/`; real raster files are ignored by Git. Import with:

```bash
bash scripts/import-light-pollution.sh incoming/<file-or-directory> -- --dataset-year 2025 --dataset-version v2.2
```

The result is a satellite-night-light reference for astro suitability only. The public Milky Way page shows light-pollution risk, target-direction risk, and an estimated Bortle range; it is not a measured SQM value, not a national-standard level, and not an official Bortle observation. Raw radiance and sampling diagnostics stay in the collapsed professional data section. Missing data is not treated as low pollution.

Estimated Bortle calibration audits can be run from independent CSV/JSON references with:

```bash
pnpm bortle:calibrate -- --input deploy/calibration/bortle-reference.example.csv --dry-run --strict
```

Generated audit reports belong under `deploy/calibration/runtime/`, which is ignored by Git. The workflow compares supplied independent references with the production estimator and never rewrites production thresholds automatically. Mismatch-investigation runs also write dedicated mismatch CSV/JSON files and audit-only candidate-analysis Markdown/JSON files. See [Bortle Calibration Mismatch Investigation](docs/bortle-calibration-mismatch-investigation.md) for output meanings, candidate simulation rules, evidence sufficiency gates, and how to add future SQM or independently verified Bortle references.

These documents define the strategic product boundary for 逐光天气. Future Codex tasks must not narrow the product into a simple weather query site or an AI text explanation tool. If a task touches weather, astronomy, terrain, scoring, provider normalization, AI explanation, result pages, or data-source display, preserve this boundary: 逐光天气 should eventually cover at least Tianwentong + Lijing Weather style information and provide more detailed photography decision support.

逐光天气是面向中国大陆风光摄影用户的天气与拍摄机会判断系统，公开标语为“风光摄影出行判断工具”。当前仓库处于自托管 SaaS 产品基础与界面打磨阶段，重点是数据库、后台配置、地点/机位资料、亮色默认主题和前端 UI 基线。

当前步骤加入 Astro Calculation Service V1：在既有 Product UI redesign V4、地点选择、预报范围、目标感知结果页、天文/地形基础、天气服务商配置和评分逻辑之上，星空银河计算可通过本地 Python 天文服务使用 Skyfield 和本地 JPL 星历文件完成。必要的数据诚实提示仍保留，公开端不使用“AI”作为品牌表达；内部仓库名、包名和 scope 仍保持 `photo-weather-ai` / `@photo-weather/*`，不做代码仓库或包作用域重命名。

## 当前状态

已实现：

- 中文优先的 Next.js 前端 UI 基线。
- Product UI redesign V4：产品 UI 已改为工具式天气/摄影判断工作台，而不是居中 marketing demo。
- `DESIGN.md` 定义项目级设计系统；后续 UI 修改应先阅读并遵循该文件。
- 新自然色调色板：核心 token 包括 `#F7F4EC`、`#FFFDF7`、`#ECE7DC`、`#17231F`、`#2F6F5E`、`#D88A20`、`#DDD4C4`。
- Tailwind CSS 全局样式、CSS 变量设计 token、亮色默认主题、可选深色主题和适合中文界面的字体栈。
- 响应式公开产品 shell：全宽 sticky 导航、`clamp(24px, 4vw, 72px)` 内容 gutter、桌面充分利用视口宽度、移动端折叠菜单和统一导航。
- 公开产品导航 shell：逐光天气品牌、SVG 品牌图标、风光摄影出行判断工具标语、首页 / 云海 / 朝霞晚霞 / 星空银河 / 机位库 / 定价导航、主题切换、统一“账户”入口和开始分析入口；顶层公开导航不再展示“管理后台”按钮。
- 公开页脚：`PublicShell` 服务端渲染项目页脚，ICP 备案号显示为 `沪ICP备2025140939号-3`，并链接到 `https://beian.miit.gov.cn`。
- 公开首页：响应式三栏桌面工作区，左侧地点查询面板、中间大幅 forecast/map 视觉工作区、右侧决策摘要面板；900px 到 1199px 自动变为左查询 + 右侧堆叠，移动端单列无横向溢出。
- 首页下方信息架构：场景能力、热门机位和工作流使用同一页面 gutter 的宽屏响应式网格，不再放进窄居中容器。
- 公开 forecast 结果页：同一产品 shell 下的目标感知 dashboard 布局，左侧地点/查询摘要，中间按 `general` / `cloud_sea` / `glow` / `astro` 展示对应主卡、窗口、分项评分和判断依据，右侧展示对应风险、建议、计算依据和数据状态；结果页已按 24h / 48h / 72h / 7d 选择范围生成窗口和逐日判断，星空银河结果页支持整月月相日历。
- 云海结果页已专项化：`target=cloud_sea` 不再复用通用 forecast 模板，单独展示云海机会、白墙风险、出行推荐、最佳清晨窗口、逐日云海趋势、云海/白墙区别、云海时间窗口、出行建议和备选拍摄方案。
- 云海页将云海机会、白墙风险和出行推荐拆成独立确定性输出，并把地形/海拔证据、天气证据、低云分层缺失提示和数据状态作为独立模块；真实天气和真实 DEM 接入前，天气与地形仍可能显示为演示数据或样例数据。
- Astro Calculation Service V1：新增 `apps/astro-service`，使用 FastAPI、Pydantic、Skyfield、zoneinfo 和本地 `de421.bsp` 计算星空银河所需天文窗口；运行时不调用在线天文 API，不使用 DeepSeek / AI 计算天文结果。
- Product Copy Polish V1：公开首页、专题页、结果页、账户空状态和后台服务商配置已去除开发味提示；公开数据状态使用“天气数据：演示数据”“地形数据：演示数据”“天文数据：本地天文服务计算”或“天文数据：简化本地估算”等产品化表达，并保留产品化的数据诚实说明。
- Scenario Module Pages V1：`/cloud-sea`、`/glow`、`/astro` 已升级为云海、朝霞晚霞、星空银河专项入口页，复用地点搜索、预报范围选择和 forecast 查询跳转流程；`/spots` 已升级为机位库 V1，`/pricing` 仍使用“即将开放”型中文产品页。
- Spot Library V1：`/spots` 提供公开机位库列表，支持关键词、题材、地区、海拔和数据状态筛选；`/spots/[slug]` 提供机位详情页；机位卡片和详情页都可直接生成 `/forecast` 快速分析链接，并携带名称、`source=local_photo_spot`、GCJ-02 坐标、WGS84 坐标、`photoSpotId`、`elevationMeters`、`horizon` 和 `target`。
- Public User Auth V1：`/login` 支持邮箱密码登录，`/register` 支持邮箱密码注册，`/auth/register` 会创建普通 `user` 角色账户并返回安全用户数据；短信登录暂未开放。
- Account Center Foundation V1：`/account` 使用公开产品 shell，未登录时显示登录提示；已登录时展示账户概览、我的查询、收藏机位、报告管理、套餐权益和安全设置。查询历史、收藏机位、报告管理和权益显示中文空状态或“即将开放”，不接入支付、订阅或计费。
- 管理后台入口只在具备 `admin` / `super_admin` 角色或 `admin.manage` 权限的账户菜单、账户中心中显示；公开导航不展示顶层“管理后台”或单独“登录”主入口。
- 公开地点搜索：`GET /search/places?q=` 会先查本地地点和摄影机位，再使用当前 GeoProvider 返回标准化地点结果。
- 公开搜索选择态：选择地点后展示地点名称、地址 / 城市信息、数据来源、GCJ-02 / WGS84 经纬度、验证状态和本地机位匹配状态。
- 公开 forecast 查询基础：首页作为综合判断快速入口，只选择地点和预报范围并固定 `target=general`；云海、朝霞晚霞、星空银河专项分析由顶部导航进入对应专题页。下一步跳转 `/forecast`，URL 中显式携带地点名称、来源、GCJ-02 坐标、WGS84 坐标、可用海拔、预报范围、分析目标以及可用的本地地点 / 机位 ID。
- Forecast 计算核心 V1：已定义标准化小时天气、日天气、地形摘要、天文摘要、计算依据、逐日摘要、目标逐日拆解、计算输入和计算结果契约，`packages/calendar` 统一生成预报时间范围和中国本地日历信息，`packages/scoring` 提供演示天气/地形数据构造器、标准化天气输入 builder、本地天文摘要和可解释 rule-based 评分计算器。
- Weather Intelligence Core V1：`packages/weather` 提供 QWeather、Open-Meteo、meteoblue 接口、标准化天气模型、多源融合、字段级/目标级置信度、冲突标记、缓存 key 与服务商使用日志基础；自动化测试继续只使用 mock / fixture / mocked fetch，不调用真实外部天气接口。
- QWeather / Open-Meteo / meteoblue Provider V1：和风天气作为中国主天气源，Open-Meteo 作为云层、露点、能见度、气压和多模型辅助源，meteoblue 作为专业商业增强源预留接口；Windy 只作为用户手动工作流的准确率 benchmark / reference，不作为自动化核心数据源。
- Terrain Core V1：`packages/terrain` 已提供地形/海拔类型契约、地形 provider 接口、演示地形数据 provider、周边高差计算、云海地形潜力分类和地平线遮挡基础；正式海拔与 DEM 数据接入后将用于提升云海和遮挡判断。
- 公开 forecast 端点：`POST /forecast/validate-query` 只校验查询输入并返回中文标签；`POST /forecast/calculate` 未启用真实天气服务商时使用 MockWeatherProvider / fixture 标准化天气和演示地形，后台启用 QWeather / Open-Meteo 真实调用并保存必要配置后可进入多源天气融合。`target=astro` 可在 `ENABLE_ASTRO_SERVICE=true` 时调用本地 Python 天文服务；未启用时使用明确标注的简化本地估算，不调用在线天文 API 或 AI 服务；`POST /forecast/ai-explain` 默认返回规则解读，只有后台启用 DeepSeek 服务商、启用真实调用且 Key 已保存时才请求真实 DeepSeek。
- 后台登录页：宽屏产品式登录布局、中文表单、样式化错误提示和单一返回前台入口。
- 后台控制台布局：约 252px 亮色侧栏、紧凑顶部标题区、当前管理员信息、主题切换、返回前台、退出登录和更宽的内容区域。
- 后台页面视觉层：系统设置、服务商配置、地点管理、机位管理、审计日志使用统一卡片、表格、表单、按钮、空状态、横向可滚动表格和更克制的自然色 active 状态。
- 受保护的后台 API、JWT 登录、数据库 RBAC、系统设置、服务商基础配置、地点/机位 CRUD、审计日志基础。

尚未实现：

- 完整生产级真实天气回测、真实 DEM、供应商成本仪表盘和长期精度校准；当前已具备 QWeather / Open-Meteo / meteoblue 配置、手动测试连接、多源融合、缓存、使用日志和本地 VIIRS 夜光栅格光污染参考基础。
- 真实 DEM / elevation provider 接入；Open-Meteo Elevation 当前默认禁用，不参与本地自动化测试。
- 生产级 DeepSeek 或其他 AI 自动分析流程；当前只允许后台服务商配置显式启用后的 DeepSeek 解读调用。
- 支付、套餐、额度和商业化流程。
- 生产级 Cookie/Session 加固。
- 短信登录、真实查询历史、收藏机位持久化、额度控制、付费套餐、订阅计费和已保存报告。

当前公开首页的地图、云层、地形和时间线为演示图层，用于展示产品方向；forecast 在未启用后台真实天气服务商时继续诚实显示演示 / 样例数据。当前搜索与 forecast 流程已完成地点识别、坐标归一化、机位匹配、预报范围选择、首页综合判断入口、专题页固定分析目标、天气多源融合入口、本地天文计算、VIIRS 夜光栅格光污染参考、摄影评分和 `/forecast` 目标感知结果展示；真实 DEM、查询历史、收藏机位、支付和生产回测尚未实现。

## 产品默认

- 默认语言：`zh-CN`。
- 可见产品品牌：`逐光天气`。
- 公开标语：`风光摄影出行判断工具`。
- 品牌图标：`apps/web/public/brand-mark.svg`，站点图标：`apps/web/public/favicon.svg`。
- 内部仓库和 package scope：继续使用 `photo-weather-ai` / `@photo-weather/*`。
- 默认时区：`Asia/Shanghai`。
- 默认币种：`CNY`。
- 默认地图服务商：Amap / 高德地图。
- 面向用户和管理员的界面文案默认使用简体中文。
- 默认主题：亮色主题。深色主题为可选项，当前通过浏览器 `localStorage` 保存用户偏好。
- 技术 key、provider code、JSON 字段和 API 标识可以保留英文。

坐标系约定：

- 地图展示和地图服务商结果使用 GCJ-02。
- 天气、天文、地形和未来评分计算使用 WGS84。
- 地点和机位记录同时保存 GCJ-02 与 WGS84，避免未来计算混用。

## Forecast 计算核心 V1

当前 `/forecast` 是拍摄天气分析结果页，用于展示用户选择的地点、预报范围、分析目标、坐标信息和评分结果。页面会调用 `POST /forecast/calculate`，后端通过天气运行时读取后台服务商配置：未启用真实天气时使用 `MockWeatherProvider` / fixture 数据，启用后可按服务商能力聚合 QWeather 与 Open-Meteo，并通过 `WeatherIntelligenceService` 输出融合后的 `WeatherDataBundle`、来源摘要、冲突标记和置信度。`target=astro` 可通过 `ASTRO_SERVICE_URL` 调用本地 Python 天文服务；未启用时保留明确标注的 JS 简化本地估算。默认不会调用在线天文 API、DeepSeek、存储、支付或短信服务；高德地图、DeepSeek 和真实天气只在后台服务商配置中启用真实调用、服务商已启用且必要凭据已配置时允许真实调用，环境开关只作为旧配置兜底。

当前计算核心覆盖：

- Calendar Core V1：`packages/calendar` 集中处理 `Asia/Shanghai` 时区、24h / 48h / 72h / 7d 预报范围、覆盖日期、中文日期时间格式、农历和节气信息。
- 云海、白墙风险、朝霞、晚霞、星空、银河和通透度评分。
- 评分只消费归一化后的 `NormalizedHourlyWeather` / `NormalizedDailyWeather` 和 `WeatherDataBundle` 状态，不读取 provider 原始 JSON。
- 云海专项逻辑 V1 输出 `cloudSeaOpportunityScore`、`whiteoutRiskScore` 和 `cloudSeaTravelScore`，按湿度/露点差、低云、地形高差、风速、能见度、降水/气压 proxy 加权计算；白墙风险单独按低云、高湿、低能见度、近静风和总云量判断，星空/银河不参与云海出行推荐。
- 综合出片指数、推荐等级、最佳拍摄窗口、逐日判断、风险提示、关键依据和拍摄建议。
- 结果页目标感知展示：`general` 显示完整模块总览和全范围高分窗口；`cloud_sea` 使用专项云海结果页，聚焦每日清晨云海机会、白墙风险、云海/白墙区分、地形海拔条件、天气证据、清晨等待窗口、出行建议和云海失败后的备选策略；`glow` 聚焦每日朝霞/晚霞机会、日出日落、晨昏时间、云层结构和地形遮挡；`astro` 聚焦每晚观星条件、月相/月亮照明、天文黑夜、银河窗口、云量能见度风险和夜间拍摄建议。
- Terrain Core V1：当前地形来自 `MockTerrainProvider`，输出 `terrainProfile`、`horizonProfile` 和 `dataSource=mock_terrain`；公开结果页显示为“地形数据：演示数据”，地形会影响云海潜力、白墙风险辅助判断、日出/日落方向遮挡、银河地平线遮挡和综合拍摄依据。
- Astro Calculation Service V1：`apps/astro-service` 使用本地 `de421.bsp` 星历、Skyfield 和 WGS84 坐标计算日出 / 日落、太阳中天、民用 / 航海 / 天文晨昏光、月相、月亮照明、盈亏方向、月出 / 月落、逐小时月亮高度、天文黑夜、无月黑夜、银心高度方位、银河候选窗口和推荐银河窗口。
- JS 简化本地估算：未启用 `ENABLE_ASTRO_SERVICE` 时仍保留 `packages/astro` 的本地估算作为体验流程兜底；结果必须显示“天文数据：简化本地估算”，不应被描述为精确天文服务结果。
- 银河推荐窗口：推荐银河窗口必须同时位于天文黑夜、低月光影响或无月黑夜窗口、银心有效高度候选窗口内；天气和地形仍按实际启用状态诚实标注，光污染使用本地 VIIRS 夜光栅格作为参考。
- 黄山光明顶、老君山金顶、三清山女神峰、武功山金顶等演示样例。
- 数据提示：星空银河服务启用时显示 `天文数据：本地天文服务计算`；未启用时显示 `天文数据：简化本地估算`。天气、地形和光污染按实际数据状态显示；光污染卡展示风险等级、估算波特尔范围和银河方向光害，专业诊断折叠显示数据年份、版本、辐亮度、样本量和置信度。

地形计算约定：

- 地形计算只使用 WGS84 经纬度，不使用 GCJ-02。
- 当前 `packages/terrain` 的默认实现是本地 deterministic mock，不调用真实外部 DEM / elevation API；公开端显示为演示地形数据。
- 黄山光明顶、老君山金顶、三清山女神峰、武功山金顶有演示山地地形档案，用于验证云海、遮挡和结果页展示流程。
- Open-Meteo Elevation provider 当前默认禁用，不需要 API Key，也不会在自动化测试中发起请求。
- 真实 elevation / DEM provider、真实地形剖面和更高精度山体遮挡模型属于未来 staging / 服务器验证工作。

天文计算约定：

- 天文计算只使用 WGS84 经纬度，不使用 GCJ-02。
- 默认时区为 `Asia/Shanghai`。
- 天文摘要使用 Calendar Core 生成的 `targetDates`，不会在 astro / scoring 内部再生成独立日期。
- `target=astro` 的精确路径由 `apps/astro-service` 提供：FastAPI 接收 WGS84 经纬度、可选海拔、时区、预报范围和起始时间，返回太阳、月亮、夜间和银河窗口结构。
- 天文服务使用本地缓存星历文件，例如 `apps/astro-service/data/de421.bsp`。服务运行时不会下载星历，也不会调用在线天文 API；缺少星历时会返回明确错误。
- 日出 / 日落、暮光、天文月相、月亮照明、盈亏方向、月出 / 月落、逐小时月亮高度、天文黑夜、无月黑夜和银河窗口不使用 DeepSeek / AI 计算。
- 星空银河页面支持整月月相日历，可按上个月、下个月和回到本月浏览；月相日历基于本地天文计算逐日生成月相、月亮照明和主要月相摘要，不调用外部天气或天文服务。
- 农历日期、中文农历文本和二十四节气来自 `packages/calendar` 中的本地 `lunar-typescript`，仅用于历法展示，不作为月亮照明、月亮高度或月光影响的计算来源。
- 月相日历的数据结构已预留农历展示字段，后续可继续扩展更完整的农历信息、节气提醒或观星节奏提示。
- 月相展示会分开呈现天文相位、照明比例、盈亏方向和农历日期；`上弦月` / `下弦月` / `满月` 只在接近对应相位和照明阈值时使用。
- MockWeatherProvider 不再生成固定日出 / 日落字段；需要日出日落时优先使用本地 Python 天文服务，未启用服务时才使用明确标注的简化本地估算。
- 自动化测试会校验天文计算不触发在线外部天文 API；Node 侧只会在 `ENABLE_ASTRO_SERVICE=true` 时调用 `ASTRO_SERVICE_URL` 指向的本地服务。
- 天文结果会随 forecast pipeline 一起进入 `ForecastCalculationResult.astroSummaries`，供结果页展示日出日落、月相月照、农历日期、节气、月出月落、天文黑夜窗口和银河窗口。
- 真实天气准确率仍需要未来接入 QWeather / Open-Meteo 真实预报、云层 / 能见度校准和地形遮挡数据；DeepSeek 当前只解释确定性结果，不计算天气、天文、地形或评分。

日历与预报时间约定：

- 默认时区统一为 `Asia/Shanghai`，运行时使用实际当前时间，测试可显式注入固定 `now`。
- 支持的预报范围由 Calendar Core 统一生成：`24h`、`48h`、`72h` 和 `7d`。
- `forecastStart`、`forecastEnd`、`targetDates`、中文日期时间范围、最佳窗口展示标签和结果页“计算依据”均来自 Calendar Core。
- 24h 只展示未来 24 小时内窗口；48h / 72h 会按覆盖日期分组展示窗口；7d 会展示多日逐日判断和跨范围窗口。天气和地形在真实 provider 接入前仍显示为演示数据。
- 朝霞、晚霞、云海、星空和银河评分窗口都会限制在 Calendar Core 生成的 `forecastStart` / `forecastEnd` 内，不输出预报起点之前的过去窗口，也不使用固定运行日期。
- `lunar-typescript` 用于本地农历、干支生肖和节气信息，不调用在线日历 API；月相照明、月出月落和月亮高度由本地天文服务或明确标注的简化本地估算提供。
- 天文计算使用 Calendar Core 的覆盖日期和用户选择地点的 WGS84 经纬度；天气和地形在当前阶段仍为演示数据，等待未来真实 provider 接入。

`packages/weather` 已提供天气服务商契约、ProviderFactory、WeatherDataService、WeatherIntelligenceService、WeatherDataBundle、QWeather real / fixture adapter、Open-Meteo free/customer real / fixture adapter、meteoblue interface adapter、小时/日天气标准化、缓存 key、服务商使用日志和多源融合逻辑。QWeather 负责中国主天气、实况、小时、日预报、预警和空气质量；Open-Meteo 负责云层分层、露点、能见度、气压、风和后续多模型/历史能力；meteoblue 是专业增强源，当前只做配置和接口占位，待商业合同和 Key 到位后接入真实调用。

天气标准化模型会追踪 `providerCode`、`providerLabelZh`、`dataMode`、`sourceConfidence`、`missingFields` 和 `estimatedFields`。如果服务商缺少低云 / 中云 / 高云分层，不会编造分层；只有从总云量推导的字段会写入 `estimatedFields`。QWeather 缺少云层分层时会标记 `missingFields=["cloudLow","cloudMid","cloudHigh"]`；Open-Meteo 会映射 `temperature_2m`、`relative_humidity_2m`、`dew_point_2m`、`precipitation_probability`、`precipitation`、`cloud_cover`、`cloud_cover_low`、`cloud_cover_mid`、`cloud_cover_high`、`visibility`、`wind_speed_10m`、`wind_gusts_10m`、`wind_direction_10m` 和 `pressure_msl`。

结果页会诚实显示天气数据来源和融合状态：`天气数据：演示数据`、`天气数据：和风天气`、`云层辅助：Open-Meteo`、`专业增强：meteoblue 未启用 / 已启用`、`数据置信度：高 / 中 / 低`、`数据冲突：无明显冲突 / 存在差异，请谨慎参考`。演示或样例数据不会被描述为实时或真实预报，缺失字段和估算字段会进入评分置信度提示。

多源融合不会盲目平均所有字段。字段优先级按摄影决策能力分配：QWeather 优先中国基础天气、预警、空气质量、实况/小时/日预报；Open-Meteo 优先云层分层、露点、能见度、气压和风；meteoblue 后续作为专业增强源覆盖商业精度提升。两个以上来源在阈值内一致时提高字段置信度，强冲突时降低置信度并写入 `ConflictFlag`。云海优先湿度、露点差、低云、能见度、风和地形高差；朝霞晚霞优先云层结构、能见度、降水、风、日出日落/晨昏光和地平线遮挡；星空银河优先云层、能见度、湿度、降水、月光、本地天文服务、light pollution 和地形遮挡。

真实准确率仍需要真实 DEM、light pollution、历史天气 backtesting、云层/能见度校准和长期权重验证。Windy 可以作为用户当前手动工作流的 benchmark / reference，但不作为逐光天气自动化商业数据主源。

支持的预报范围：

- 未来24小时
- 未来48小时
- 未来72小时
- 未来7天

支持的分析目标仍由查询契约维护。首页默认使用“综合判断”，不再展示题材选择器；专项题材从对应导航模块进入：

- 综合判断
- 云海
- 朝霞晚霞
- 星空银河

当前查询契约由 `@photo-weather/shared` 中的 `forecastQueryInputSchema` 维护，前端 URL 会显式携带地点名称、来源、GCJ-02 坐标、WGS84 坐标、预报范围、分析目标、可用的海拔以及可用的本地地点 / 机位 ID。`POST /forecast/calculate` 会先复用该 schema 校验输入，再构造 `ForecastCalculationInput` 并返回 `ForecastCalculationResult`；可选 `useAiExplanation=true` 时会附带规则兜底解读，只有后台 `ai/deepseek` 启用真实调用且 Key 已保存时才尝试 DeepSeek。结果页按钮调用 `POST /forecast/ai-explain`，不会在页面加载时自动调用 DeepSeek。

Scenario Module Pages V1：

- `/cloud-sea` 云海判断：固定 `target=cloud_sea`，默认 `horizon=48h`。
- `/glow` 朝霞晚霞：固定 `target=glow`，默认 `horizon=72h`。
- `/astro` 星空银河：固定 `target=astro`，默认 `horizon=7d`。
- 三个页面都复用公开地点搜索和 `/forecast` 查询 URL 构造，跳转时保留地点名称、来源、GCJ-02 坐标、WGS84 坐标、可用海拔、`locationId`、`photoSpotId`、`horizon` 和 `target`。
- 专项分析由这些导航模块承载，不通过首页题材选择器进入。

Spot Library V1：

- `/spots` 是公开机位库页面，不是占位列表；当前展示黄山光明顶、老君山金顶、三清山女神峰和武功山金顶等本地种子机位。
- `/spots/[slug]` 是机位详情页，展示海拔、WGS84 坐标、GCJ-02 坐标、适合题材、推荐方向、数据完整度、到达与安全提醒和各题材判断价值。
- 机位库快速入口支持综合判断、云海、朝霞晚霞和星空银河，统一跳转 `/forecast`，并保留 WGS84 坐标、GCJ-02 坐标、`photoSpotId` 和可用的 `elevationMeters`。
- 天文计算只使用 WGS84 坐标；GCJ-02 坐标保留给后续地图展示和位置校对。
- 公开数据状态使用“演示数据”“待完善”“已校准”，不在公开机位页面使用开发态标签。
- `/forecast` 会根据 `target` 塑造结果视图：综合判断展示全模块；云海页不把星空/银河作为主模块；霞光页不展示星空/银河评分主网格；星空银河页不把云海或白天霞光作为主推荐。
- `/forecast` 会按所选 horizon 返回 `dailySummaries`、`targetDailyBreakdown` 和跨范围 `bestWindows`；7d 结果展示多日摘要，24h / 48h / 72h / 7d 都使用同一组 `forecastStart` / `forecastEnd` / `targetDates`。
- 星空银河结果页在观测判断内容下方提供“月相日历”，支持查看当前整月月相、月亮照明和主要月相日期，并可在前后月份之间切换。
- 真实天气数据仍未接入；结果页默认继续使用演示天气数据和演示地形数据生成体验结果，除非未来显式启用真实 provider。
- DeepSeek 解读仍是可选后续能力；结果页基础判断、评分、窗口和风险不依赖 DeepSeek，也不会在页面加载时自动调用外部解释服务。

公开用户邮箱密码登录和注册已接入 Public User Auth V1。当前公开导航使用统一“账户”入口；未登录时进入 `/login`，已登录时可进入 `/account`，管理员账号才会在账户菜单或账户中心看到“管理后台”。短信登录、真实查询历史、收藏机位持久化、额度控制和付费套餐计划在后续阶段实现，不属于当前 forecast 查询基础步骤。

## 架构

- `apps/web`：Next.js App Router 前端与后台控制台。
- `apps/api`：Fastify API 服务。
- `apps/astro-service`：Python FastAPI 本地天文计算服务，使用 Skyfield 和本地 JPL 星历文件为 `target=astro` 生成精确天文窗口。
- `apps/worker`：未来任务队列 worker 骨架。
- `packages/shared`：共享类型、Zod schema 和标签。
- `packages/config`：环境配置、运行时配置和密钥遮罩。
- `packages/db`：Prisma schema、迁移、seed、系统设置、服务商配置、地点、机位、审计日志。
- `packages/geo`：地理服务接口、deterministic mock 搜索、高德地图 Web 服务 provider、坐标校验与 GCJ-02 / WGS84 转换。
- `packages/calendar`：Calendar Core V1，集中处理 `Asia/Shanghai` 预报范围、覆盖日期、中文日期时间格式、农历和节气。
- `packages/weather`：天气服务接口、标准化天气模型、WeatherDataBundle、WeatherDataService、WeatherIntelligenceService、ProviderFactory、MockWeatherProvider、QWeather real / fixture adapter、Open-Meteo free/customer real / fixture adapter、meteoblue interface adapter、多源融合、缓存 key 和服务商使用日志基础。
- `packages/terrain`：Terrain Core V1，包含地形/海拔数据契约、mock terrain provider、地形剖面、高差计算、云海地形潜力分类、地平线遮挡辅助判断和禁用的 Open-Meteo Elevation provider。
- `packages/astro`：JS 简化本地估算与整月月相日历基础，作为未启用 Python 天文服务时的明确标注兜底。
- `packages/scoring`：本地 forecast mock 数据构造器、摄影评分 helper、朝霞/晚霞/云海/白墙/星空/银河/通透度计算器、云海专项确定性分析和综合推荐分类。
- `packages/ai`：AI 服务接口、mock provider、规则兜底和 DeepSeek 开发模式 JSON 解读 provider。
- `packages/storage`：存储服务接口与 mock 存储。
- `packages/billing`：计费与额度基础类型。

## 本地开发

使用 Corepack 管理 pnpm：

```bash
corepack pnpm install
```

Windows PowerShell 本地开发流程：

1. 先打开 SSH tunnel，确保远程 PostgreSQL 映射到 `127.0.0.1:15432`。
2. 在 `.env.local` 写入本地配置，不要提交 `.env.local`。
3. 检查端口和数据库隧道：

```bash
corepack pnpm check:local
```

4. 启动 API 和前台：

```bash
corepack pnpm dev:local
```

5. 浏览器访问：

- 公开首页：`http://localhost:3000`
- 云海判断：`http://localhost:3000/cloud-sea`
- 朝霞晚霞：`http://localhost:3000/glow`
- 星空银河：`http://localhost:3000/astro`
- 摄影机位库：`http://localhost:3000/spots`
- 定价方案：`http://localhost:3000/pricing`
- 账户中心：`http://localhost:3000/account`

### 本地天文服务

`target=astro` 的精确天文计算需要单独启动 Python 服务：

```bash
cd apps/astro-service
python -m pip install -r requirements.txt
python scripts/fetch_ephemeris.py
python -m uvicorn app.main:app --host 127.0.0.1 --port 4100
```

也可以在仓库根目录运行：

```bash
corepack pnpm dev:astro
```

本地 API 默认读取：

```bash
ASTRO_SERVICE_URL=http://127.0.0.1:4100
ASTRO_SERVICE_TIMEOUT_MS=45000
ENABLE_ASTRO_SERVICE=false
```

将 `ENABLE_ASTRO_SERVICE=true` 后，`target=astro` 会要求本地天文服务可用；服务不可用时返回：

`天文计算服务暂不可用，无法生成精确的星空银河窗口。请确认本地天文服务已启动。`

如果 astro forecast 在本地返回超时：

1. 确认 `http://127.0.0.1:4100/health` 正常，`corepack pnpm debug:astro` 中 `Astro service: OK`、`Astro health via API: true`。
2. 运行 `corepack pnpm test:astro-api`，确认 `24h` 与 `7d` 请求的 HTTP 状态和 `Elapsed ms`。
3. 如本机计算耗时较高，在 `.env.local` 中提高 `ASTRO_SERVICE_TIMEOUT_MS`，例如 `ASTRO_SERVICE_TIMEOUT_MS=60000`。
4. 修改 `.env.local` 后重启主开发栈 `corepack pnpm dev:local`。

星空银河页面显示“天文计算服务暂不可用”时，先运行本地诊断脚本：

```bash
corepack pnpm debug:astro
corepack pnpm test:astro-api
```

运行前保持三个本地进程可用：数据库隧道、Python astro-service、主开发栈 `corepack pnpm dev:local`。

预期结果：

- `debug:astro` 中 `DB tunnel: OK`、`API: OK`、`Web: OK`、`Astro service: OK`。
- `debug:astro` 中 `Astro enabled: true`。
- `debug:astro` 中 `Astro URL: http://127.0.0.1:4100`。
- `debug:astro` 中 `/debug/astro-service` 对应的 `Astro health via API: true`。
- `test:astro-api` 能返回 `target=astro` 的 forecast JSON，并在 API 日志中出现 `/forecast/calculate` 与 astro-service 调用记录。
- astro-service 终端出现 `POST /astro/calculate 200 OK`。

本地排查顺序：

1. 启动数据库隧道并确认 `127.0.0.1:15432` 可用。
2. 启动 Python astro-service，并检查 `http://127.0.0.1:4100/health` 是否返回 `200`。
3. 检查 `.env.local` 是否包含 `ENABLE_ASTRO_SERVICE=true`、`ASTRO_SERVICE_URL=http://127.0.0.1:4100` 和合适的 `ASTRO_SERVICE_TIMEOUT_MS`。
4. 修改 `.env.local` 后重启主开发栈 `corepack pnpm dev:local`。
5. 运行 `corepack pnpm debug:astro` 和 `corepack pnpm test:astro-api`。
6. 查看 `logs/photo-weather-api-latest.txt` 指向的 API 日志，`/forecast/calculate` 会记录目标、范围、坐标是否存在、天文服务 URL、上游状态、错误名称、错误消息和服务端堆栈。
7. 本地开发环境可访问 `http://localhost:4000/debug/astro-service` 查看天文服务开关、URL、`timeoutMs`、健康检查状态、时区数据库、星历文件状态和脱敏错误。

黄山光明顶校验：

```bash
cd apps/astro-service
python -m pytest
```

测试使用 WGS84 近似坐标 `30.1321, 118.1691`、海拔约 `1800` 米、`Asia/Shanghai` 和 `2026-05-22`。断言只检查逻辑关系，不硬编码第三方天文应用的具体分钟值。

- 用户登录：`http://localhost:3000/login`
- 用户注册：`http://localhost:3000/register`
- 后台登录：`http://localhost:3000/admin/login`
- 后台控制台：`http://localhost:3000/admin`

停止本地服务：

```bash
corepack pnpm stop:local
```

`dev:local` 会启动：

- API：`http://localhost:4000`
- 前台：`http://localhost:3000`

前台默认读取：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

高德地图 Web 服务 Key 和“启用真实调用”开关优先在后台服务商配置页填写；环境变量仅作为旧配置或本机开发兜底，后台配置优先级更高：

```bash
ENABLE_REAL_AMAP=false
AMAP_API_KEY=
# 兼容部分部署命名：
AMAP_WEB_SERVICE_KEY=
AMAP_BASE_URL=https://restapi.amap.com
```

DeepSeek API Key、分析模式和真实调用开关优先在后台服务商配置页填写。普通管理员只需要填写 API Key、选择分析模式、启用服务商、启用真实调用、保存并测试连接；`.env.local` 只用于本机开发兜底，不要提交：

```bash
ENABLE_REAL_DEEPSEEK=false
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_DEFAULT_MODEL=deepseek-v4-pro
```

天气服务商也优先在后台服务商配置页填写。和风天气普通管理员只需要填写 API Key、API Host、启用服务商、启用真实调用、保存并测试连接；Open-Meteo 支持免费开发模式和商业客户模式，免费模式不需要 API Key，商业客户模式需要按账号要求填写 API Key 和 Customer Endpoint；meteoblue Free Weather API 可用于后台 Forecast API 测试，默认数据包为 `basic-1h,clouds-1h`。QWeather API Host 在和风天气控制台的开发者信息中查看，形如 `xxxxx.qweatherapi.com`，后台表单和环境变量都填写不带 `https://` 的主机名；请求超时、重试次数、语言、单位和原始配置默认折叠在“高级配置”中：

```bash
WEATHER_PROVIDER=mock
WEATHER_PROVIDER_MODE=mock
QWEATHER_API_KEY=
QWEATHER_API_HOST=xxxxx.qweatherapi.com
QWEATHER_LANGUAGE=zh
QWEATHER_UNIT=metric
QWEATHER_TIMEOUT_MS=10000
QWEATHER_RETRY_COUNT=1
OPEN_METEO_API_KEY=
OPEN_METEO_MODE=free
OPEN_METEO_CUSTOMER_ENDPOINT=
OPEN_METEO_BASE_URL=https://api.open-meteo.com/v1
METEOBLUE_API_KEY=
METEOBLUE_BASE_URL=https://my.meteoblue.com
METEOBLUE_PACKAGES=basic-1h,clouds-1h
```

和风天气部分基础天气接口可能包含每月前 50k 次免费额度，但仍应按真实供应商调用管理：不要把 API Key 写入代码、README、测试 fixture 或提交记录；只在后台配置或本机 `.env.local` 中保存。`corepack pnpm test:qweather` 可用于本地人工检查：有 `PHOTO_WEATHER_ADMIN_ACCESS_TOKEN` 或 `ADMIN_ACCESS_TOKEN` 时调用后台测试连接；没有后台 token 时只读取 `/debug/providers` 的安全状态，真实连接仍以后台 UI 手动测试为主。

天气多源排查脚本：`corepack pnpm debug:weather` 会读取 `.env.local`、检查本地 API、调用 `/debug/providers` 并输出脱敏后的 QWeather / Open-Meteo / meteoblue 状态；生产服务器可用 `bash scripts/test-providers.sh` 在 api 容器内运行 `pnpm test-provider --all`，读取数据库中的服务商配置并输出不含密钥的诊断 JSON；`corepack pnpm test:weather-fusion` 会调用 `/debug/weather-fusion`，使用黄山光明顶 WGS84 坐标打印来源摘要、目标置信度、冲突标记、融合摘要和当前使用的 real / fixture / demo 数据模式。

后台 `geo/amap` 已启用、`configJson.realCallEnabled=true` 且已配置高德 Web 服务 Key 后，公开地点搜索和后台高德测试连接可以请求真实高德 Web Service。若数据库配置中没有 `realCallEnabled` 字段，才会读取 `ENABLE_REAL_AMAP` 作为兜底。高德返回坐标按 GCJ-02 处理，并同步归一化为 WGS84；天气、天文、地形和评分计算仍只使用 WGS84。

后台 `ai/deepseek` 已启用、`configJson.realCallEnabled=true` 且已配置 DeepSeek API Key 后，forecast 结果页可以手动点击“生成智能解读”。当前项目固定使用 `deepseek-v4-pro` 高质量解读模型；旧的 `deepseek-chat`、`deepseek-reasoner` 或其他历史保存模型会在运行时统一覆盖为 `deepseek-v4-pro`。若数据库配置中没有 `realCallEnabled` 字段，才会读取 `ENABLE_REAL_DEEPSEEK` 作为兜底。DeepSeek 只解释确定性输入中的评分、风险、最佳窗口、建议和备用方案，不计算或覆盖天气、天文、地形、坐标和评分；演示数据场景下不得声称真实天气准确率。Base URL、温度、最大输出 Token、推理强度和思考模式属于高级配置，后台默认折叠；JSON 输出模式固定为 `response_format: { type: "json_object" }`。

和风天气真实连接测试已接入 `/v7/weather/now`，仅在后台已启用服务商、启用真实调用、API Key 和 API Host 均已保存后，由管理员点击“测试连接”触发。Open-Meteo 免费模式测试可由管理员手动触发安全公共端点，商业客户模式启用真实调用时必须填写 Key。meteoblue 在未启用真实调用时只返回“当前为模拟测试，未请求 meteoblue 服务。”，启用真实调用但缺少 Key 时返回“请先填写 meteoblue API Key。”，Key 已保存后会请求 Forecast API package URL。自动化测试不会调用真实 QWeather、Open-Meteo 或 meteoblue API。

本地自动化测试默认使用 `MockGeoProvider`、规则兜底和 mocked fetch，不会读取真实高德 / DeepSeek / 天气服务商密钥，也不会调用真实外部网络接口。

如需清理 Next.js 缓存后启动：

```bash
corepack pnpm dev:local -- -Clean
```

常用验证命令：

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## 数据库

PostgreSQL 是生产数据库目标。数据库包维护 Prisma schema、迁移、seed data，以及系统设置、服务商、地点、机位、审计日志等 repository helper。

根目录数据库命令：

```bash
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:push
corepack pnpm db:seed
corepack pnpm db:studio
corepack pnpm bootstrap:admin
corepack pnpm create-admin
```

部署数据库使用 `db:migrate`。一次性本地开发库可以使用 `db:push`。

设置 `DATABASE_URL` 到 `.env.local` 或 `.env`，不要提交本地凭据。例如 Docker Compose 内部连接：

```bash
DATABASE_URL=postgresql://photo_weather:photo_weather@postgres:5432/photo_weather_ai
```

Provider secrets 和永久服务商配置属于数据库后台配置，不应写进业务代码。Seed data 只创建基础服务商和空密钥对象，不包含真实 DeepSeek、QWeather、Open-Meteo、高德地图、存储、短信或支付凭据。

`/admin/providers` 提供分组服务商配置控制台，顶部显示已启用、真实调用、密钥已保存和需要处理数量。高德地图、和风天气、Open-Meteo、meteoblue 和 DeepSeek 使用统一卡片、统一保存状态、统一测试连接状态和紧凑能力标签。高级配置默认折叠，普通管理员不需要编辑原始 JSON。保存配置后后台会显示服务商专属成功提示；密钥保存后 API 只返回 `maskedSecretJson`，不会返回原始 `secretJson`；空密钥输入表示保留现有密钥不变，如需删除已保存字段请使用后台表单中的清除操作。更详细的配置说明见 [docs/admin-providers.md](docs/admin-providers.md)。

Seed data 包含未核验的中国风光摄影示例地点与机位：

- 黄山 / 黄山光明顶
- 老君山 / 老君山金顶
- 三清山 / 三清山女神峰
- 武功山 / 武功山金顶

这些坐标、海拔、交通、安全和风险信息仅为示例，生产使用前必须在后台人工核验。

## 首个管理员

先执行数据库迁移和 seed，再创建首个管理员：

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='change-Me-12345!' ADMIN_DISPLAY_NAME="管理员" corepack pnpm bootstrap:admin
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='change-Me-12345!' corepack pnpm verify-admin
```

管理员密码支持常见强密码符号；交互输入不会回显；请避免在命令行明文传入密码。生产安装器会将初始管理员密码写为 `ADMIN_INITIAL_PASSWORD_B64`，避免强密码符号破坏 dotenv 解析。

脚本读取：

- `ADMIN_EMAIL`
- `SUPER_ADMIN_EMAIL`（旧部署别名）
- `ADMIN_INITIAL_PASSWORD_B64`
- `ADMIN_PASSWORD_B64`
- `INITIAL_ADMIN_PASSWORD_B64`
- `SUPER_ADMIN_PASSWORD_B64`
- `ADMIN_INITIAL_PASSWORD`
- `ADMIN_PASSWORD`
- `INITIAL_ADMIN_PASSWORD`
- `SUPER_ADMIN_PASSWORD`
- `ADMIN_DISPLAY_NAME`
- `ADMIN_NAME` / `SUPER_ADMIN_DISPLAY_NAME`（旧部署别名）

`bootstrap:admin` 是幂等的：账号不存在时创建账号，账号已存在时会在提供初始密码时更新密码、启用账号并确保 `admin` 角色、`user_roles` 绑定和权限绑定存在。权限表存在时会补齐 canonical admin permissions；权限表不存在时不会让 bootstrap 失败，但验证脚本会清楚输出跳过原因。密码会先 bcrypt 哈希再写入数据库，不会明文打印。生产环境可使用 `bash scripts/reset-admin.sh` 重置管理员密码，并用 `bash scripts/verify-admin-bootstrap.sh` 和 `bash scripts/check-login.sh` 验证角色、权限、`/auth/me` 角色序列化和登录。上线前设置至少 32 字符的强 `JWT_SECRET`。

## 后台 API

认证接口：

```bash
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
GET  /auth/me
```

配置与资料接口：

```bash
GET   /search/places?q=
POST  /forecast/validate-query
POST  /forecast/calculate
POST  /forecast/ai-explain

GET   /admin/settings
GET   /admin/settings/:key
PATCH /admin/settings/:key
GET   /admin/settings/groups

GET   /admin/providers
GET   /admin/providers/:providerType/:providerCode
PATCH /admin/providers/:providerType/:providerCode
POST  /admin/providers/:providerType/:providerCode/test-connection

GET    /admin/locations
GET    /admin/locations/:id
POST   /admin/locations
PATCH  /admin/locations/:id
DELETE /admin/locations/:id

GET    /admin/photo-spots
GET    /admin/photo-spots/:id
POST   /admin/photo-spots
PATCH  /admin/photo-spots/:id
DELETE /admin/photo-spots/:id

GET   /admin/geo/search?q=
GET   /admin/audit-logs
```

后台 API 使用 JWT 和数据库 RBAC：

- 系统设置：`settings.manage`
- 服务商配置：`providers.manage`
- 地点和 mock 地理搜索：`locations.manage`
- 机位：`photo_spots.manage`
- 审计日志：`audit.read`
- `/admin` 状态：`code=admin` 或 `admin.manage`

服务商测试连接默认仍为模拟测试，不调用真实外部服务。高德地图、DeepSeek、和风天气、Open-Meteo 和 meteoblue 都支持管理员手动真实测试：必须同时满足后台服务商已启用、后台“启用真实调用”已打开、必要凭据或模式配置已保存，并由管理员点击“测试连接”。和风天气还必须填写 API Host；Open-Meteo 商业客户模式必须填写 API Key；meteoblue 当前只启用后台 Forecast API 测试，不自动加入 forecast 计算流程。自动化测试强制模拟测试。若旧数据库记录缺少 `realCallEnabled` 字段，才会读取环境变量作为兜底。

后台“测试连接”按钮会向 `/admin/providers/:providerType/:providerCode/test-connection` 发送 `{}`。未启用真实调用时，高德返回“当前为模拟测试，未请求高德地图服务。”，DeepSeek 返回“当前为模拟测试，未请求 DeepSeek 服务。”并带回当前模式和模型；和风天气返回“当前为模拟测试，未请求和风天气服务。”，Open-Meteo 返回“当前为模拟测试，未请求真实天气服务。”，meteoblue 返回“当前为模拟测试，未请求 meteoblue 服务。”。启用真实调用但缺少 Key 时，高德、DeepSeek、和风天气、meteoblue 分别返回“请先填写高德 Web 服务 Key。”“请先填写 DeepSeek API Key。”“请先填写和风天气 API Key。”“请先填写 meteoblue API Key。”；和风天气缺少 API Host 时返回“请先填写和风天气 API Host。”；Open-Meteo 商业客户模式缺少 Key 时返回“商业客户模式请先填写 Open-Meteo API Key。”。接口响应和日志不得暴露原始密钥。

## 后台控制台

当前 Next.js 后台路由：

```bash
/admin/login
/admin
/admin/settings
/admin/providers
/admin/providers/ai
/admin/providers/weather
/admin/providers/geo
/admin/providers/storage
/admin/locations
/admin/photo-spots
/admin/audit
/login
/register
/account
/forecast
```

后台控制台已同步 Product UI redesign V4 的自然色和紧凑布局整理。公开导航不展示顶层“管理后台”按钮；后台入口只在已确认具备 `code=admin` / `super_admin` 角色或 `admin.manage` 权限的账户菜单或账户中心中显示：

- 左侧导航：控制台、系统设置、服务商配置、地点管理、机位管理、审计日志。
- 顶部标题区：当前页面标题、描述、当前管理员名称、主题切换、单一返回前台入口、退出。
- 内容区：使用可用宽度的卡片、表格、表单、空状态、确认弹窗和统一按钮。
- 移动端：侧栏转为顶部横向导航，表格允许横向滚动，避免手机、平板和常见笔记本宽度溢出。

后台路由会将未登录用户重定向到 `/admin/login`。公开用户登录和后台登录当前复用同一套浏览器 `localStorage` token 存储，这是开发阶段实现；正式公开部署前需要改为生产级会话方案。

## 外部服务边界

本阶段不允许自动化测试调用真实外部服务。当前自动化测试只使用 deterministic mock providers、fixture JSON、本地 astronomy-engine 天文计算、mocked fetch 和基础配置：

- 自动化测试不调用真实 QWeather；只允许读取本地 QWeather fixture JSON 或使用 mocked fetch 验证请求构造、header 鉴权和 API Host 归一化。
- 自动化测试不调用真实 Open-Meteo；只允许读取本地 Open-Meteo fixture JSON 或使用 mocked fetch 验证免费 / 商业客户模式 URL 构造。
- 自动化测试不调用真实 meteoblue；只允许使用 mocked fetch 验证 Forecast API 请求构造、配置解析和缺少 Key 错误。
- 不调用真实 Open-Meteo Elevation 或其他 DEM / elevation API；Terrain Core V1 默认只使用 `MockTerrainProvider`。
- 自动化测试不调用高德地图真实接口；真实高德只允许人工本地开发或部署环境中通过后台服务商配置显式启用，`ENABLE_REAL_AMAP` 只作为缺少后台字段时的兜底。
- 自动化测试不调用 DeepSeek；真实 DeepSeek 只允许人工本地开发或部署环境中通过后台服务商配置显式启用，`ENABLE_REAL_DEEPSEEK` 只作为缺少后台字段时的兜底。
- 天文计算只使用本地 `astronomy-engine`，不调用在线天文 API。
- 日历、农历和节气只使用本地 Calendar Core 与 `lunar-typescript`，不调用在线日历 API。
- 不调用真实存储、短信、支付或计费服务。

本地和测试默认天气服务商为 `mock`。如需验证服务商 adapter，可显式设置 `WEATHER_PROVIDER=qweather|open_meteo` 且 `WEATHER_PROVIDER_MODE=fixture`；`WEATHER_PROVIDER_MODE=real` 在 `NODE_ENV=test` 下会 fail closed，不会悄悄发起网络请求。后台 QWeather / Open-Meteo / meteoblue 真实测试连接可用于人工本地开发或 staging 验证，必须由管理员显式启用服务商、启用真实调用并配置必要凭据。自动化测试仍强制模拟测试。

高德地图 provider 当前只负责地点搜索、地理编码、逆地理编码和坐标归一化。地图展示使用 GCJ-02；天气、天文、地形、DEM 和后续评分计算必须使用 WGS84。DeepSeek 只负责解释确定性 forecast 结果，不负责计算真实天气、天文、地形或评分。

## Docker

`docker-compose.yml` 包含未来 `web`、`api`、`worker`、`postgres`、`redis`、`nginx` 服务骨架。`scripts/` 下脚本是后续一键安装、首个管理员创建和备份流程的基础。
